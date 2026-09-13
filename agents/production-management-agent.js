const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const { Logger } = require('../utils/logger');
const { AIVideoGenerator } = require('../utils/ai-video-generator');
const { SceneRepairService } = require('../utils/scene-repair-service');

class ProductionManagementAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('ProductionManagement');
    this.pipeline = [];
    this.assets = new Map();
    this.aiVideoGenerator = new AIVideoGenerator(credentials, { db });
    this.sceneRepair = new SceneRepairService(db, this.aiVideoGenerator, { logger: this.logger });
  }

  async initialize() {
    this.logger.info('Initializing Production Management Agent...');
    await this.setupDirectories();
    await this.loadPipeline();
    return true;
  }

  async setupDirectories() {
    const dirs = [
      'data/production',
      'data/assets',
      'data/videos',
      'data/audio',
      'data/scripts',
      'temp/processing'
    ];

    for (const dir of dirs) {
      await fs.mkdir(path.join(__dirname, '..', dir), { recursive: true });
    }
  }

  async loadPipeline() {
    try {
      const pipeline = await this.db.getProductionPipeline();
      this.pipeline = pipeline || [];
    } catch (error) {
      this.logger.warn('No existing pipeline found, starting fresh');
    }
  }

  async resolveProductionId(jobId, explicitId = null) {
    if (explicitId) return explicitId;
    if (jobId && this.db?.getGenerationCheckpoint) {
      try {
        const cp = await this.db.getGenerationCheckpoint(jobId, 'production');
        if (cp?.artifact?.productionId || cp?.artifact?.id) {
          return cp.artifact.productionId || cp.artifact.id;
        }
      } catch (_err) {
        void _err;
      }
    }
    if (jobId && this.db?.getGenerationJob) {
      try {
        const job = await this.db.getGenerationJob(jobId);
        if (job?.production_id) {
          return job.production_id;
        }
      } catch (_err) {
        void _err;
      }
    }
    return jobId ? `prod_${jobId}` : this.generateProductionId();
  }

  async getIntraProductionManifest(jobId, productionId = null) {
    return await this.loadIntraProductionManifest(jobId, productionId);
  }

  computeScriptHash(script = {}) {
    const components = [
      script.title || '',
      script.fullScript || '',
      JSON.stringify(script.mainContent || []),
      script.hook?.text || (typeof script.hook === 'string' ? script.hook : ''),
      script.introduction?.topicIntro || (typeof script.introduction === 'string' ? script.introduction : ''),
      JSON.stringify(script.conclusion || {}),
      JSON.stringify(script.callToAction || {}),
      JSON.stringify(script.truthAnchor || []),
      JSON.stringify(script.claims || [])
    ];
    return crypto.createHash('sha256').update(components.join(':::')).digest('hex');
  }

  computeFingerprint(data) {
    return crypto.createHash('sha256').update(String(data || '')).digest('hex');
  }

  invalidateDownstream(manifest, fromSubstage) {
    if (!manifest || !manifest.substages) return;
    const substageOrder = ['script_prep', 'tts', 'visuals', 'captions', 'assembly'];
    const index = substageOrder.indexOf(fromSubstage);
    if (index === -1) return;
    for (let i = index; i < substageOrder.length; i++) {
      const stage = substageOrder[i];
      if (manifest.substages[stage]) {
        manifest.substages[stage].status = 'invalid';
        manifest.substages[stage].invalidatedAt = new Date().toISOString();
      }
    }
  }

  async validateSubstageArtifact(substage, manifestItem, currentFingerprint) {
    if (!manifestItem || manifestItem.status !== 'completed') return false;
    if (currentFingerprint && manifestItem.fingerprint !== currentFingerprint) return false;
    const artifacts = manifestItem.artifacts;
    if (!artifacts || typeof artifacts !== 'object') return false;

    if (substage === 'script_prep') {
      if (!artifacts.originalPath || !artifacts.ttsPath) return false;
      return (await this.pathExists(artifacts.originalPath)) && (await this.pathExists(artifacts.ttsPath));
    }

    if (substage === 'tts') {
      const filePath = artifacts.path;
      if (!filePath || artifacts.simulated === true) return false;
      if (!this.isValidMediaExtension(filePath, ['.mp3', '.wav', '.m4a', '.ogg'])) return false;
      if (!await this.pathExists(filePath)) return false;
      if (this.aiVideoGenerator?.isUsableAudioFile) {
        return await this.aiVideoGenerator.isUsableAudioFile(filePath);
      }
      return true;
    }

    if (substage === 'visuals') {
      const visualAssets = artifacts.visualAssets;
      if (!Array.isArray(visualAssets) || visualAssets.length === 0) return false;
      for (const asset of visualAssets) {
        const p = typeof asset === 'string' ? asset : asset?.path;
        if (!p || !await this.pathExists(p)) return false;
        if (!this.isValidMediaExtension(p, ['.png', '.jpg', '.jpeg', '.webp', '.mp4'])) return false;
      }
      return true;
    }

    if (substage === 'captions') {
      const filePath = artifacts.path;
      if (!filePath || !await this.pathExists(filePath)) return false;
      if (!this.isValidMediaExtension(filePath, ['.srt', '.vtt', '.ass'])) return false;
      return true;
    }

    if (substage === 'assembly') {
      const filePath = artifacts.path;
      if (!filePath || artifacts.simulated === true) return false;
      if (!this.isValidMediaExtension(filePath, ['.mp4', '.mov', '.mkv', '.webm'])) return false;
      return await this.pathExists(filePath);
    }

    return false;
  }

  isValidMediaExtension(filePath, allowedExtensions) {
    const invalidExts = ['.assembly.json', '.info', '.placeholder'];
    const lower = String(filePath || '').toLowerCase();
    if (invalidExts.some(ext => lower.endsWith(ext))) return false;
    const ext = path.extname(lower);
    return allowedExtensions.includes(ext);
  }

  async pathExists(filePath) {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile() && stat.size > 0;
    } catch (_err) {
      return false;
    }
  }

  async saveIntraProductionManifest(jobId, productionId, manifest) {
    manifest.updatedAt = new Date().toISOString();
    try {
      const manifestDir = path.join(__dirname, '..', 'data', 'production');
      await fs.mkdir(manifestDir, { recursive: true });
      const manifestPath = path.join(manifestDir, `${productionId}_manifest.json`);
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    } catch (err) {
      this.logger.warn(`Failed to save manifest file to disk: ${err.message}`);
    }

    if (jobId && this.db?.saveGenerationCheckpoint) {
      try {
        await this.db.saveGenerationCheckpoint(jobId, 'production', {
          status: manifest.status || 'running',
          artifact: manifest
        });
      } catch (err) {
        this.logger.warn(`Failed to save intra-production checkpoint to DB: ${err.message}`);
      }
    }
  }

  async loadIntraProductionManifest(jobId, productionId) {
    if (jobId && this.db?.getGenerationCheckpoint) {
      try {
        const checkpoint = await this.db.getGenerationCheckpoint(jobId, 'production');
        if (checkpoint?.artifact?.productionManifest?.substages) {
          return checkpoint.artifact.productionManifest;
        }
        if (checkpoint?.artifact?.substages) {
          return checkpoint.artifact;
        }
      } catch (_err) {
        void _err;
      }
    }

    if (productionId) {
      try {
        const manifestPath = path.join(__dirname, '..', 'data', 'production', `${productionId}_manifest.json`);
        const data = await fs.readFile(manifestPath, 'utf8');
        return JSON.parse(data);
      } catch (_err) {
        void _err;
      }
    }

    return null;
  }

  async processContent(contentData) {
    try {
      this.logger.info('Processing content for production...');
      
      const { strategy, script, thumbnail, seo, jobId = null, id: existingId = null, productionId: explicitProductionId = null } = contentData;
      
      // 1. Resolve deterministic production ID
      const productionId = await this.resolveProductionId(jobId, explicitProductionId || existingId);
      const scriptHash = this.computeScriptHash(script);
      
      // 2. Load or initialize intra-production manifest
      let manifest = await this.loadIntraProductionManifest(jobId, productionId);
      if (!manifest || typeof manifest !== 'object') {
        manifest = {
          productionId,
          jobId,
          scriptHash,
          status: 'processing',
          substages: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      } else {
        if (manifest.scriptHash && manifest.scriptHash !== scriptHash) {
          this.logger.warn(`Script hash mismatch for ${productionId}. Invalidating downstream production checkpoints.`);
          manifest.substages = {};
          manifest.scriptHash = scriptHash;
        }
        manifest.status = 'processing';
        manifest.updatedAt = new Date().toISOString();
      }

      const productionData = {
        id: productionId,
        productionId,
        strategy,
        script,
        thumbnail,
        seo,
        status: 'processing',
        assets: {
          script: null,
          thumbnail: null,
          audio: null,
          video: null,
          captions: null
        },
        timeline: {
          created: manifest.createdAt || new Date().toISOString(),
          scriptReady: null,
          thumbnailReady: null,
          audioGenerated: null,
          videoGenerated: null,
          captionsGenerated: null,
          readyForUpload: null
        },
        scheduledPublishTime: this.calculatePublishTime(strategy),
        priority: this.calculatePriority(strategy),
        estimatedDuration: script.duration,
        createdAt: manifest.createdAt || new Date().toISOString(),
        jobId,
        scriptHash,
        substages: manifest.substages
      };

      // Substage 1: script_prep
      let scriptArtifact = null;
      if (await this.validateSubstageArtifact('script_prep', manifest.substages?.script_prep, scriptHash)) {
        this.logger.info(`[Recovery] Reusing verified script_prep checkpoint for ${productionId}`);
        scriptArtifact = manifest.substages.script_prep.artifacts;
      } else {
        this.invalidateDownstream(manifest, 'script_prep');
        try {
          scriptArtifact = await this.processScript(script, productionId);
          manifest.substages.script_prep = {
            status: 'completed',
            fingerprint: scriptHash,
            artifacts: scriptArtifact,
            completedAt: new Date().toISOString()
          };
          await this.saveIntraProductionManifest(jobId, productionId, manifest);
        } catch (scriptErr) {
          manifest.substages.script_prep = {
            status: 'failed',
            fingerprint: scriptHash,
            error: scriptErr.message,
            completedAt: new Date().toISOString()
          };
          await this.saveIntraProductionManifest(jobId, productionId, manifest);
          throw scriptErr;
        }
      }
      productionData.assets.script = scriptArtifact;
      productionData.timeline.scriptReady = manifest.substages.script_prep.completedAt || new Date().toISOString();

      // Thumbnail pass-through
      productionData.assets.thumbnail = await this.processThumbnail(thumbnail, script, productionId);
      productionData.timeline.thumbnailReady = new Date().toISOString();

      // Substage 2: tts
      const ttsText = await fs.readFile(productionData.assets.script.ttsPath, 'utf8');
      const ttsHash = this.computeFingerprint(ttsText);
      let audioArtifact = null;

      if (await this.validateSubstageArtifact('tts', manifest.substages?.tts, ttsHash)) {
        this.logger.info(`[Recovery] Reusing verified TTS audio checkpoint for ${productionId}`);
        audioArtifact = manifest.substages.tts.artifacts;
      } else {
        this.invalidateDownstream(manifest, 'tts');
        try {
          await this.generateAudioNarration(productionData, ttsText);
          audioArtifact = productionData.assets.audio;
          if (audioArtifact && audioArtifact.status === 'ready' && !audioArtifact.simulated) {
            manifest.substages.tts = {
              status: 'completed',
              fingerprint: ttsHash,
              artifacts: audioArtifact,
              completedAt: new Date().toISOString()
            };
            await this.saveIntraProductionManifest(jobId, productionId, manifest);
          } else {
            manifest.substages.tts = {
              status: 'failed',
              fingerprint: ttsHash,
              error: audioArtifact?.error || 'TTS audio generation failed or produced placeholder',
              artifacts: audioArtifact,
              completedAt: new Date().toISOString()
            };
            await this.saveIntraProductionManifest(jobId, productionId, manifest);
          }
        } catch (ttsErr) {
          manifest.substages.tts = {
            status: 'failed',
            fingerprint: ttsHash,
            error: ttsErr.message,
            completedAt: new Date().toISOString()
          };
          await this.saveIntraProductionManifest(jobId, productionId, manifest);
          throw ttsErr;
        }
      }
      productionData.assets.audio = audioArtifact;
      productionData.timeline.audioGenerated = manifest.substages.tts?.completedAt || new Date().toISOString();

      // Substage 3: visuals
      const visualPrompts = this.createVisualPromptsFromScript(script);
      const visualsHash = this.computeFingerprint(visualPrompts.join('|||') + ':::' + scriptHash);
      let videoArtifact = null;

      if (await this.validateSubstageArtifact('visuals', manifest.substages?.visuals, visualsHash)) {
        this.logger.info(`[Recovery] Reusing verified visual assets checkpoint for ${productionId}`);
        videoArtifact = manifest.substages.visuals.artifacts;
      } else {
        const existingVisualAssets = manifest.substages?.visuals?.artifacts?.visualAssets || [];
        this.invalidateDownstream(manifest, 'visuals');
        try {
          await this.generateVideoContent(productionData, visualPrompts, existingVisualAssets);
          videoArtifact = productionData.assets.video;
          if (videoArtifact && Array.isArray(videoArtifact.visualAssets) && videoArtifact.visualAssets.length > 0) {
            manifest.substages.visuals = {
              status: 'completed',
              fingerprint: visualsHash,
              artifacts: videoArtifact,
              completedAt: new Date().toISOString()
            };
            await this.saveIntraProductionManifest(jobId, productionId, manifest);
          } else {
            manifest.substages.visuals = {
              status: 'failed',
              fingerprint: visualsHash,
              error: 'Visual content generation produced no assets',
              completedAt: new Date().toISOString()
            };
            await this.saveIntraProductionManifest(jobId, productionId, manifest);
            if (jobId) {
              throw new Error('Visual content generation produced no assets');
            }
          }
        } catch (visErr) {
          manifest.substages.visuals = {
            status: 'failed',
            fingerprint: visualsHash,
            error: visErr.message,
            completedAt: new Date().toISOString()
          };
          await this.saveIntraProductionManifest(jobId, productionId, manifest);
          throw visErr;
        }
      }
      productionData.assets.video = videoArtifact || productionData.assets.video;
      productionData.timeline.videoGenerated = manifest.substages.visuals?.completedAt || new Date().toISOString();

      // Substage 4: captions
      const captionsHash = this.computeFingerprint(`${scriptHash}:::${productionData.assets.audio?.duration || script.duration}`);
      let captionsArtifact = null;

      if (await this.validateSubstageArtifact('captions', manifest.substages?.captions, captionsHash)) {
        this.logger.info(`[Recovery] Reusing verified captions checkpoint for ${productionId}`);
        captionsArtifact = manifest.substages.captions.artifacts;
      } else {
        this.invalidateDownstream(manifest, 'captions');
        try {
          await this.generateCaptions(productionData);
          captionsArtifact = productionData.assets.captions;
          if (captionsArtifact && await this.pathExists(captionsArtifact.path)) {
            manifest.substages.captions = {
              status: 'completed',
              fingerprint: captionsHash,
              artifacts: captionsArtifact,
              completedAt: new Date().toISOString()
            };
            await this.saveIntraProductionManifest(jobId, productionId, manifest);
          } else {
            manifest.substages.captions = {
              status: 'failed',
              fingerprint: captionsHash,
              error: 'Caption generation failed or produced missing file',
              artifacts: captionsArtifact,
              completedAt: new Date().toISOString()
            };
            await this.saveIntraProductionManifest(jobId, productionId, manifest);
            if (jobId) {
              throw new Error('Caption generation failed or produced missing file');
            }
          }
        } catch (capErr) {
          manifest.substages.captions = {
            status: 'failed',
            fingerprint: captionsHash,
            error: capErr.message,
            completedAt: new Date().toISOString()
          };
          await this.saveIntraProductionManifest(jobId, productionId, manifest);
          throw capErr;
        }
      }
      productionData.assets.captions = captionsArtifact;
      productionData.timeline.captionsGenerated = manifest.substages.captions?.completedAt || new Date().toISOString();

      // Substage 5: assembly
      const assemblyHash = this.computeFingerprint(
        `${scriptHash}:::${productionData.assets.audio?.path}:::${(productionData.assets.video?.visualAssets || []).map(a => (typeof a === 'string' ? a : a.path)).join(',')}`
      );
      let finalVideoArtifact = null;

      if (await this.validateSubstageArtifact('assembly', manifest.substages?.assembly, assemblyHash)) {
        this.logger.info(`[Recovery] Reusing verified final video assembly checkpoint for ${productionId}`);
        finalVideoArtifact = manifest.substages.assembly.artifacts;
        productionData.assets.finalVideo = finalVideoArtifact;
        productionData.status = 'ready';
        productionData.timeline.readyForUpload = manifest.substages.assembly.completedAt || new Date().toISOString();
      } else {
        this.invalidateDownstream(manifest, 'assembly');
        try {
          await this.assembleVideo(productionData);
          finalVideoArtifact = productionData.assets.finalVideo;

          const isRealVideo = finalVideoArtifact?.path &&
            !finalVideoArtifact.simulated &&
            path.extname(finalVideoArtifact.path).toLowerCase() === '.mp4' &&
            !finalVideoArtifact.path.endsWith('.assembly.json') &&
            await this.pathExists(finalVideoArtifact.path);

          if (isRealVideo) {
            manifest.substages.assembly = {
              status: 'completed',
              fingerprint: assemblyHash,
              artifacts: finalVideoArtifact,
              completedAt: new Date().toISOString()
            };
            productionData.status = 'ready';
            productionData.timeline.readyForUpload = new Date().toISOString();
            await this.saveIntraProductionManifest(jobId, productionId, manifest);
          } else {
            const errorMsg = finalVideoArtifact?.blockedReason || 'Final video assembly failed or produced simulation placeholder';
            manifest.substages.assembly = {
              status: 'failed',
              fingerprint: assemblyHash,
              error: errorMsg,
              artifacts: finalVideoArtifact,
              completedAt: new Date().toISOString()
            };
            productionData.status = 'simulated';
            await this.saveIntraProductionManifest(jobId, productionId, manifest);
            if (jobId) {
              throw new Error(errorMsg);
            }
          }
        } catch (asmErr) {
          manifest.substages.assembly = {
            status: 'failed',
            fingerprint: assemblyHash,
            error: asmErr.message,
            completedAt: new Date().toISOString()
          };
          productionData.status = 'failed';
          await this.saveIntraProductionManifest(jobId, productionId, manifest);
          throw asmErr;
        }
      }

      // Persist a scene-addressable production manifest for selective review and repair.
      await this.sceneRepair.initializeProduction(productionData, this.aiVideoGenerator.lastVideoResult || {});

      // Attach manifest metadata
      productionData.substages = manifest.substages;
      productionData.scriptHash = manifest.scriptHash;
      productionData.productionManifest = manifest;

      // Add to pipeline or update existing entry
      const existingIdx = this.pipeline.findIndex(p => p.id === productionId);
      if (existingIdx >= 0) {
        this.pipeline[existingIdx] = productionData;
      } else {
        this.pipeline.push(productionData);
      }

      // Save to database
      await this.db.saveProductionData(productionData);
      await this.db.updateProductionData(productionData);

      this.logger.info(`Content processing complete: ${productionId} (status: ${productionData.status})`);
      return productionData;
    } catch (error) {
      this.logger.error('Failed to process content:', error);
      throw error;
    }
  }

  generateProductionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const extra = Math.random().toString(36).substring(2, 15);
    return `prod_${timestamp}_${random}_${extra}`;
  }

  async processScript(script, productionId = null) {
    const filename = productionId ? `${productionId}_script.json` : `${Date.now()}_script.json`;
    const scriptPath = path.join(__dirname, '..', 'data', 'scripts', filename);
    
    // Create formatted script for TTS
    const ttsScript = this.formatScriptForTTS(script);
    
    // Save script files
    await fs.writeFile(scriptPath, JSON.stringify(script, null, 2));
    const ttsPath = scriptPath.replace('.json', '_tts.txt');
    await fs.writeFile(ttsPath, ttsScript);
    
    return {
      originalPath: scriptPath,
      ttsPath: ttsPath,
      duration: script.duration,
      sections: script.mainContent?.sections?.length || (Array.isArray(script.mainContent) ? script.mainContent.length : 0)
    };
  }

  formatScriptForTTS(script) {
    let ttsText = '';
    
    // Add hook
    if (script.hook) {
      ttsText += `${script.hook.text || (typeof script.hook === 'string' ? script.hook : '')}\n\n`;
    }
    
    // Add introduction
    if (script.introduction) {
      if (typeof script.introduction === 'string') {
        ttsText += `${script.introduction}\n\n`;
      } else {
        if (script.introduction.greeting) ttsText += `${script.introduction.greeting}\n`;
        if (script.introduction.topicIntro) ttsText += `${script.introduction.topicIntro}\n`;
        if (script.introduction.valueProposition) ttsText += `${script.introduction.valueProposition}\n`;
        if (script.introduction.credibility) ttsText += `${script.introduction.credibility}\n\n`;
      }
    }
    
    // Add main content
    if (script.fullScript && (!script.mainContent || (Array.isArray(script.mainContent) && script.mainContent.length === 0))) {
      ttsText += `${script.fullScript}\n\n`;
    } else if (script.mainContent) {
      const sections = script.mainContent.sections || (Array.isArray(script.mainContent) ? script.mainContent : []);
      sections.forEach((section, index) => {
        if (section.title) ttsText += `Section ${index + 1}: ${section.title}\n`;
        if (typeof section.text === 'string') ttsText += `${section.text}\n`;
        
        if (Array.isArray(section.content)) {
          section.content.forEach(line => {
            if (typeof line === 'string' && !line.startsWith('[')) {
              ttsText += `${line}\n`;
            }
          });
        } else if (section.steps) {
          section.steps.forEach(step => {
            ttsText += `${step.title}. ${step.description}\n`;
            ttsText += `${step.tip}\n`;
          });
        } else if (section.items) {
          section.items.forEach(item => {
            ttsText += `Number ${item.number}: ${item.title}. ${item.description}\n`;
          });
        } else if (typeof section.content === 'string') {
          ttsText += `${section.content}\n`;
        }
        
        ttsText += '\n';
      });
    }
    
    // Add conclusion
    if (script.conclusion) {
      if (Array.isArray(script.conclusion.recap)) {
        script.conclusion.recap.forEach(line => {
          if (typeof line === 'string') {
            ttsText += `${line}\n`;
          }
        });
      }
      if (script.conclusion.finalThought) {
        ttsText += `\n${script.conclusion.finalThought}\n\n`;
      }
    }
    
    // Add CTA
    if (script.callToAction) {
      if (typeof script.callToAction === 'string') {
        ttsText += `${script.callToAction}\n`;
      } else {
        if (script.callToAction.subscribe) ttsText += `${script.callToAction.subscribe}\n`;
        if (script.callToAction.like) ttsText += `${script.callToAction.like}\n`;
        if (script.callToAction.comment) ttsText += `${script.callToAction.comment}\n`;
      }
    }
    
    return ttsText.trim() ? ttsText : (script.title || 'Untitled script');
  }

  async processThumbnail(thumbnail, script, productionId = null) {
    try {
      if (thumbnail?.path && await this.pathExists(thumbnail.path) && this.isValidMediaExtension(thumbnail.path, ['.jpg', '.jpeg', '.png', '.webp'])) {
        return {
          path: thumbnail.path,
          originalPath: thumbnail.path,
          dimensions: thumbnail.dimensions || { width: 1792, height: 1024 },
          fileSize: thumbnail.fileSize || 0,
          generatedWith: thumbnail.generatedWith || 'designer'
        };
      }
      // Try to generate AI thumbnail first
      const thumbnailScript = thumbnail?.script || script || { title: thumbnail?.title || 'Untitled Video' };
      const aiThumbnail = await this.aiVideoGenerator.generateThumbnail(thumbnailScript, 'ethereal');
      
      return {
        path: aiThumbnail.path,
        originalPath: thumbnail?.path || aiThumbnail.path,
        dimensions: aiThumbnail.dimensions,
        fileSize: aiThumbnail.fileSize,
        generatedWith: 'AI'
      };
    } catch (error) {
      this.logger.error('AI thumbnail generation failed:', error);
      
      // Fallback to original processing
      const filename = productionId ? `thumbnail_${productionId}.jpg` : `thumbnail_${Date.now()}.jpg`;
      const productionThumbnailPath = path.join(
        __dirname, '..', 'data', 'assets', 
        filename
      );
      
      if (thumbnail?.path && await fs.access(thumbnail.path).then(() => true).catch(() => false)) {
        const originalBuffer = await fs.readFile(thumbnail.path);
        await fs.writeFile(productionThumbnailPath, originalBuffer);
      } else {
        // Create placeholder
        await fs.writeFile(productionThumbnailPath + '.placeholder', 'Thumbnail placeholder');
      }
      
      return {
        path: productionThumbnailPath,
        originalPath: thumbnail?.path || null,
        dimensions: thumbnail?.dimensions || { width: 1792, height: 1024 },
        fileSize: thumbnail?.fileSize || 0
      };
    }
  }

  calculatePublishTime(strategy) {
    // Use strategy's recommended time or calculate optimal time
    if (strategy.bestPublishTime) {
      return strategy.bestPublishTime;
    }
    
    // Default: next optimal publishing window
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0); // 2 PM default
    
    return tomorrow.toISOString();
  }

  calculatePriority(strategy) {
    let priority = 50; // Base priority
    
    // Adjust based on estimated views
    if (strategy.estimatedViews > 100000) priority += 30;
    else if (strategy.estimatedViews > 50000) priority += 20;
    else if (strategy.estimatedViews > 10000) priority += 10;
    
    // Adjust based on trend score
    if (strategy.competitorAnalysis && strategy.competitorAnalysis.length > 0) {
      priority += 10;
    }
    
    // Time sensitivity
    const hoursUntilPublish = (new Date(strategy.bestPublishTime) - new Date()) / (1000 * 60 * 60);
    if (hoursUntilPublish < 24) priority += 20;
    else if (hoursUntilPublish < 48) priority += 10;
    
    return Math.min(100, priority);
  }

  async generateVideoContent(productionData, visualPromptsOverride = null, existingAssets = []) {
    this.logger.info('Generating AI video content...');
    
    try {
      const { script } = productionData;
      
      // Generate visual assets using DALL-E
      const visualPrompts = visualPromptsOverride || this.createVisualPromptsFromScript(script);
      const visualAssets = [];
      
      for (let i = 0; i < visualPrompts.length; i++) {
        const prompt = visualPrompts[i];
        const existing = existingAssets[i];
        const existingPath = typeof existing === 'string' ? existing : existing?.path;
        if (existingPath && await this.pathExists(existingPath) && this.isValidMediaExtension(existingPath, ['.png', '.jpg', '.jpeg', '.webp', '.mp4'])) {
          this.logger.info(`[Recovery] Reusing verified visual scene ${i + 1}/${visualPrompts.length}: ${existingPath}`);
          visualAssets.push(existing);
        } else {
          const assets = await this.aiVideoGenerator.generateVisualAssets(prompt, 'ethereal', 1);
          visualAssets.push(...assets);
        }
      }
      
      productionData.assets.video = {
        visualAssets: visualAssets,
        duration: productionData.estimatedDuration,
        format: 'mp4',
        resolution: '1920x1080',
        fps: 30,
        generatedWith: 'AI'
      };
      
      productionData.timeline.videoGenerated = new Date().toISOString();
      
      return visualAssets;
    } catch (error) {
      this.logger.error('AI video content generation failed:', error);
      if (productionData.jobId) {
        throw error;
      }
      // Fallback to placeholder
      return await this.createVideoElements(productionData);
    }
  }

  async createVideoElements(productionData) {
    const { script } = productionData;
    const elements = [];
    
    // Title slide
    elements.push({
      type: 'title_slide',
      content: script.title,
      duration: 3,
      style: 'modern',
      animation: 'fade_in'
    });
    
    // Content sections
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach((section) => {
        // Section title
        elements.push({
          type: 'section_title',
          content: section.title,
          duration: 2,
          style: 'minimal',
          animation: 'slide_in'
        });
        
        // Content visuals
        if (section.type === 'list_items' && section.items) {
          section.items.forEach(item => {
            elements.push({
              type: 'list_item',
              content: {
                number: item.number,
                title: item.title,
                description: item.description
              },
              duration: 15,
              style: 'countdown',
              animation: 'zoom_in'
            });
          });
        } else if (section.type === 'solution_steps' && section.steps) {
          section.steps.forEach(step => {
            elements.push({
              type: 'step',
              content: {
                number: step.number,
                title: step.title,
                description: step.description
              },
              duration: 20,
              style: 'tutorial',
              animation: 'step_by_step'
            });
          });
        } else {
          // Generic content slide
          elements.push({
            type: 'content_slide',
            content: section.title,
            duration: section.duration || 30,
            style: 'informative',
            animation: 'fade_transition'
          });
        }
      });
    }
    
    // Conclusion slide
    elements.push({
      type: 'conclusion',
      content: 'Key Takeaways',
      duration: 5,
      style: 'summary',
      animation: 'reveal'
    });
    
    // Subscribe reminder
    elements.push({
      type: 'subscribe_reminder',
      content: 'Subscribe for More!',
      duration: 3,
      style: 'call_to_action',
      animation: 'bounce'
    });
    
    return elements;
  }

  async generateAudioNarration(productionData, ttsTextOverride = null) {
    this.logger.info('Generating AI audio narration...');
    
    try {
      const audioPath = path.join(__dirname, '..', 'data', 'audio', `${productionData.id}_narration.mp3`);
      
      // Read the TTS script
      const ttsText = ttsTextOverride || (productionData.assets?.script?.ttsPath
        ? await fs.readFile(productionData.assets.script.ttsPath, 'utf8')
        : this.formatScriptForTTS(productionData.script));
      
      // Generate audio using AI TTS and retain the provider evidence returned by the generator.
      const generatedPath = await this.aiVideoGenerator.generateTTSAudio(ttsText, audioPath);
      const evidence = this.aiVideoGenerator.lastNarrationResult || {};
      const usable = await this.aiVideoGenerator.isUsableAudioFile(generatedPath);

      productionData.assets.audio = {
        path: generatedPath,
        duration: productionData.estimatedDuration,
        format: 'mp3',
        generatedWith: 'AI',
        quality: usable ? 'high' : null,
        status: usable ? 'ready' : 'unavailable',
        simulated: !usable,
        provider: evidence.provider || null,
        model: evidence.model || null,
        externalTaskId: evidence.externalTaskId || null,
        generatedAt: evidence.generatedAt || new Date().toISOString(),
        cost: evidence.cost || {},
        error: usable ? null : 'No live narration provider returned usable audio',
        intentionalSilence: false
      };

      if (usable) productionData.timeline.audioGenerated = new Date().toISOString();
      return generatedPath;
    } catch (error) {
      this.logger.error('AI audio generation failed:', error);
      if (productionData.jobId) {
        throw error;
      }
      return await this.simulateAudioGeneration(productionData, error);
    }
  }

  async generateCaptions(productionData) {
    this.logger.info('Generating captions...');
    
    const captionsPath = path.join(__dirname, '..', 'data', 'captions', `${productionData.id}_captions.srt`);
    
    // Generate SRT captions based on script timing
    const captions = await this.createSRTCaptions(productionData);
    
    await fs.mkdir(path.dirname(captionsPath), { recursive: true });
    await fs.writeFile(captionsPath, captions);
    
    productionData.assets.captions = {
      path: captionsPath,
      format: 'srt',
      language: 'en',
      autoGenerated: true
    };
    
    productionData.timeline.captionsGenerated = new Date().toISOString();
    
    return captionsPath;
  }

  async createSRTCaptions(productionData) {
    const { script } = productionData;
    let srt = '';
    let captionIndex = 1;
    let currentTime = 0;
    
    // Helper function to format time for SRT
    const formatSRTTime = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    };
    
    // Process script sections for captions
    const processText = (text, startTime, duration) => {
      const words = text.split(' ');
      const wordsPerCaption = 8; // Optimal words per caption
      
      for (let i = 0; i < words.length; i += wordsPerCaption) {
        const captionWords = words.slice(i, i + wordsPerCaption);
        const captionDuration = (duration / Math.ceil(words.length / wordsPerCaption));
        const captionStartTime = startTime + (i / words.length) * duration;
        const captionEndTime = captionStartTime + captionDuration;
        
        srt += `${captionIndex}\n`;
        srt += `${formatSRTTime(captionStartTime)} --> ${formatSRTTime(captionEndTime)}\n`;
        srt += `${captionWords.join(' ')}\n\n`;
        
        captionIndex++;
      }
    };
    
    // Hook
    if (script.hook && script.hook.text) {
      processText(script.hook.text, currentTime, 5);
      currentTime += 5;
    }
    
    // Introduction
    if (script.introduction) {
      const introText = `${script.introduction.greeting} ${script.introduction.topicIntro} ${script.introduction.valueProposition}`;
      processText(introText, currentTime, 15);
      currentTime += 15;
    }
    
    // Main content
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach(section => {
        let sectionText = '';
        
        if (Array.isArray(section.content)) {
          sectionText = section.content.filter(line => 
            typeof line === 'string' && !line.startsWith('[')
          ).join(' ');
        } else if (section.steps) {
          sectionText = section.steps.map(step => 
            `${step.title}. ${step.description}`
          ).join(' ');
        } else if (section.items) {
          sectionText = section.items.map(item => 
            `Number ${item.number}: ${item.title}. ${item.description}`
          ).join(' ');
        } else if (typeof section.content === 'string') {
          sectionText = section.content;
        }
        
        if (sectionText) {
          processText(sectionText, currentTime, section.duration || 60);
          currentTime += section.duration || 60;
        }
      });
    }
    
    // Conclusion
    if (script.conclusion) {
      const conclusionText = script.conclusion.recap.join(' ') + ' ' + script.conclusion.finalThought;
      processText(conclusionText, currentTime, 30);
      currentTime += 30;
    }
    
    return srt;
  }

  async assembleVideo(productionData) {
    this.logger.info('Assembling final AI-generated video...');
    
    try {
      const finalVideoPath = path.join(__dirname, '..', 'data', 'videos', `${productionData.id}_final.mp4`);
      const narrationReady = await this.aiVideoGenerator.isUsableAudioFile(productionData.assets.audio?.path);
      if (!narrationReady && productionData.assets.audio?.intentionalSilence !== true) {
        this.logger.warn('Final assembly is blocked until narration succeeds or the operator explicitly confirms an intentional silent video.');
        return await this.simulateVideoAssembly(productionData, 'Narration is missing');
      }

      // Use AI Video Generator to create the final video
      const producedPath = await this.aiVideoGenerator.generateVideo(
        productionData.script,
        productionData.assets.video.visualAssets || [],
        productionData.assets.audio.path,
        finalVideoPath,
        {
          jobId: productionData.jobId,
          productionId: productionData.id,
          estimatedDuration: productionData.estimatedDuration
        }
      );

      // The generator falls back to a placeholder .info file when it cannot render
      if (!producedPath || path.extname(producedPath).toLowerCase() !== '.mp4') {
        return await this.simulateVideoAssembly(productionData);
      }

      // Get file stats
      const stats = await fs.stat(finalVideoPath);
      
      productionData.assets.finalVideo = {
        path: finalVideoPath,
        fileSize: stats.size,
        duration: productionData.estimatedDuration,
        generatedWith: 'AI',
        resolution: '1920x1080',
        format: 'mp4',
        provider: this.aiVideoGenerator.lastVideoResult || { actualProvider: 'slideshow', model: 'local-ffmpeg' }
      };
      productionData.containsSyntheticMedia = Boolean(
        this.aiVideoGenerator.lastVideoResult?.actualProvider &&
        !['slideshow', 'simulation'].includes(this.aiVideoGenerator.lastVideoResult.actualProvider)
      );
      
      this.logger.info('AI video assembly complete');
      return finalVideoPath;
    } catch (error) {
      this.logger.error('AI video assembly failed:', error);
      if (productionData.jobId) {
        throw error;
      }
      // Fallback to simulation
      return await this.simulateVideoAssembly(productionData);
    }
  }

  async getPipelineStatus() {
    return this.pipeline.map(item => ({
      id: item.id,
      title: item.script?.title || 'Untitled',
      status: item.status,
      priority: item.priority,
      scheduledPublishTime: item.scheduledPublishTime,
      progress: this.calculateProgress(item)
    }));
  }

  calculateProgress(productionData) {
    const milestones = [
      'scriptReady',
      'thumbnailReady',
      'audioGenerated',
      'videoGenerated',
      'captionsGenerated',
      'readyForUpload'
    ];
    
    const completed = milestones.filter(milestone => 
      productionData.timeline[milestone] !== null
    ).length;
    
    return Math.round((completed / milestones.length) * 100);
  }

  async getNextReadyContent() {
    const ready = this.pipeline
      .filter(item => item.status === 'ready')
      .sort((a, b) => b.priority - a.priority);
    
    return ready[0] || null;
  }

  // Helper method to create visual prompts from script content
  createVisualPromptsFromScript(script) {
    const prompts = [];
    
    // Title prompt
    prompts.push(`${script.title}, ethereal storytelling, mystical background`);
    
    // Content-based prompts
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach(section => {
        if (section.title) {
          prompts.push(`${section.title}, ethereal dreamscape, creative visualization`);
        }
      });
    }
    
    // Ensure we have at least 3 prompts
    while (prompts.length < 3) {
      prompts.push('ethereal dreamscape, mystical storytelling, creative visualization');
    }
    
    return prompts.slice(0, 5); // Limit to 5 for cost control
  }

  // Fallback simulation methods
  async simulateAudioGeneration(productionData, failure = null) {
    const audioPath = path.join(__dirname, '..', 'data', 'audio', `${productionData.id}_narration.mp3`);
    
    await fs.writeFile(audioPath + '.info', JSON.stringify({
      message: 'AI TTS audio would be generated here',
      timestamp: new Date().toISOString()
    }, null, 2));
    
    productionData.assets.audio = {
      path: audioPath + '.info',
      duration: productionData.estimatedDuration,
      format: 'mp3',
      status: 'unavailable',
      simulated: true,
      provider: this.aiVideoGenerator.lastNarrationResult?.provider || 'simulation',
      model: this.aiVideoGenerator.lastNarrationResult?.model || null,
      externalTaskId: this.aiVideoGenerator.lastNarrationResult?.externalTaskId || null,
      generatedAt: this.aiVideoGenerator.lastNarrationResult?.generatedAt || new Date().toISOString(),
      cost: this.aiVideoGenerator.lastNarrationResult?.cost || { billed: false },
      error: failure?.message || this.aiVideoGenerator.lastNarrationResult?.error || 'No live narration provider is configured',
      intentionalSilence: false
    };
    
    return audioPath + '.info';
  }

  async simulateVideoAssembly(productionData, reason = null) {
    const finalVideoPath = path.join(__dirname, '..', 'data', 'videos', `${productionData.id}_final.mp4`);
    
    const assemblyInstructions = {
      message: 'AI video would be assembled here',
      blockedReason: reason,
      assets: productionData.assets,
      timestamp: new Date().toISOString()
    };
    
    await fs.writeFile(
      finalVideoPath + '.assembly.json',
      JSON.stringify(assemblyInstructions, null, 2)
    );
    
    productionData.assets.finalVideo = {
      path: finalVideoPath + '.assembly.json',
      fileSize: 0,
      duration: productionData.estimatedDuration,
      simulated: true,
      blockedReason: reason
    };
    
    return finalVideoPath + '.assembly.json';
  }
}

module.exports = { ProductionManagementAgent };
