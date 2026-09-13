const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { runFFmpeg } = require('./ffmpeg');
const { Logger } = require('./logger');

/**
 * Supported B-Roll Source Types and Providers
 */
const SOURCE_TYPES = {
  STOCK: 'stock',
  LOCAL: 'local',
  PROCEDURAL: 'procedural'
};

const PROVIDERS = {
  PEXELS: 'pexels',
  PIXABAY: 'pixabay',
  LOCAL_LIBRARY: 'local-library',
  PROCEDURAL_FFMPEG: 'procedural-ffmpeg'
};

/**
 * Contextual search keywords tailored to financial storytelling beats
 */
const BEAT_KEYWORDS = {
  hook: ['smartphone alert notifications', 'person checking phone screen', 'digital notifications mobile'],
  curiositygap: ['bank statement finance audit', 'person reviewing bills calculator', 'banking app financial audit'],
  context: ['person reviewing bank statement', 'digital wallet bills', 'financial records audit'],
  mechanism: ['digital server transactions', 'banking network data flow', 'automated money transfer'],
  datareveal: ['money payment cash flow', 'digital transaction payment card', 'credit card payment register'],
  visual_example: ['coffee shop subscription receipt', 'streaming media app screen', 'mobile monthly subscriptions'],
  financial_insight: ['financial growth curve', 'investment analytics display', 'compound growth chart'],
  escalation: ['credit card swipe payment', 'money budget spending stress', 'financial calculation debt'],
  comparison: ['financial calculation balance', 'budget comparison analysis', 'money balance scale'],
  payoff: ['stock market chart investment', 'wealth growth financial planning', 'compound interest investment market'],
  resolution: ['person reviewing clean financial budget', 'closing bank tab smartphone', 'financial freedom savings'],
  cta: ['person confident financial planning', 'lifestyle financial freedom', 'business planning workspace']
};

class FreeBRollProvider {
  constructor(options = {}) {
    this.logger = options.logger || new Logger('FreeBRollProvider');
    this.cacheDir = options.cacheDir || path.join(process.cwd(), 'data', 'broll');
    this.localAssetsDir = options.localAssetsDir || path.join(process.cwd(), 'assets', 'broll');
    this.pexelsApiKey = process.env.PEXELS_API_KEY || options.pexelsApiKey || null;
    this.pixabayApiKey = process.env.PIXABAY_API_KEY || options.pixabayApiKey || null;
  }

  /**
   * Helper to select B-roll directly by beat and parameters.
   */
  async selectBRollForBeat(beat, options = {}) {
    return this.getBRollForScene({ beat, ...options }, options);
  }

  /**
   * Discovers and retrieves an optimal, conformed 1080x1920 30fps B-roll video clip for a given scene.
   * Order of priority:
   * 1. Free Stock API (Pexels / Pixabay) if credentials exist in environment
   * 2. Local curated CC0 video footage in assets/broll or data/broll
   * 3. Procedural cinematic moving video synthesized via FFmpeg (guaranteed zero-cost, deterministic fallback)
   */
  async getBRollForScene(scene = {}, options = {}) {
    await fs.mkdir(this.cacheDir, { recursive: true });

    const beat = String(scene.beat || 'hook').toLowerCase();
    const duration = Math.max(1, Number(scene.duration || 5));
    const sceneId = scene.id || scene.sceneId || `scene_${Date.now()}`;
    const targetPath = path.join(this.cacheDir, `broll_${sceneId}_${beat}.mp4`);

    let rawSource = null;

    // 1. Try Free Stock API if credentials available
    if (this.pexelsApiKey) {
      rawSource = await this.fetchPexelsVideo(beat, options);
    } else if (this.pixabayApiKey) {
      rawSource = await this.fetchPixabayVideo(beat, options);
    }

    // 2. Try Local Library if stock API not configured or failed
    if (!rawSource) {
      rawSource = await this.findLocalFootage(beat, {
        ...options,
        keywords: scene.brollKeywords || options.keywords,
        label: scene.label,
        id: scene.id,
        preferredAsset: scene.preferredAsset || options.preferredAsset
      });
    }

    // 3. Fallback to Procedural Video Generation via FFmpeg
    if (!rawSource) {
      rawSource = await this.generateProceduralVideo(beat, duration, sceneId);
    }

    // 4. Conform footage to 1080x1920, 30fps, target duration, and cinematic dark color grade
    await this.conformBRollClip(rawSource.localPath, targetPath, duration, {
      darken: options.darken !== false,
      theme: rawSource.theme || beat
    });

    const provenance = {
      sourceType: rawSource.sourceType,
      provider: rawSource.provider,
      assetId: rawSource.assetId,
      sourceUrl: rawSource.sourceUrl || null,
      localPath: targetPath,
      downloadedAt: rawSource.downloadedAt || new Date().toISOString(),
      licenseInfo: rawSource.licenseInfo,
      sceneId,
      beat,
      duration
    };

    this.logger.info(`B-roll secured for [${beat}] beat via ${provenance.provider} (${provenance.sourceType}) -> ${targetPath}`);

    return {
      brollPath: targetPath,
      provenance,
      ...provenance
    };
  }

  /**
   * Conforms any raw video clip to 1080x1920 9:16 vertical crop, 30 fps, exact duration, and cinematic dark grade.
   */
  async conformBRollClip(inputPath, outputPath, targetDuration, options = {}) {
    const durStr = Number(targetDuration).toFixed(2);
    const isSameFile = path.resolve(inputPath) === path.resolve(outputPath);
    const actualOutput = isSameFile
      ? path.join(path.dirname(outputPath), `temp_${Date.now()}_${path.basename(outputPath)}`)
      : outputPath;

    // Dark grading filter: dims footage slightly and boosts contrast so foreground financial UI pops
    const gradeFilter = options.darken
      ? 'colorchannelmixer=.42:0:0:0:0:.42:0:0:0:0:.48:0,eq=contrast=1.18:brightness=-0.14:saturation=0.80'
      : 'eq=contrast=1.05:brightness=-0.05';

    const vf = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,${gradeFilter},format=yuv420p`;

    const args = [
      '-y',
      '-stream_loop', '-1',
      '-i', inputPath,
      '-vf', vf,
      '-t', durStr,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      actualOutput
    ];

    await runFFmpeg(args);

    if (isSameFile) {
      await fs.rename(actualOutput, outputPath);
    }

    return outputPath;
  }

  /**
   * Generates a deterministic, cinematic moving video background tailored to each beat using FFmpeg.
   * High performance, guaranteed zero-cost, and visually engaging.
   */
  async generateProceduralVideo(beat, duration, sceneId) {
    const assetId = `proc_${beat}_${crypto.createHash('md5').update(`${beat}_${duration}_${sceneId}`).digest('hex').slice(0, 8)}`;
    const rawPath = path.join(this.cacheDir, `${assetId}_raw.mp4`);

    let bgColor = '#080d1a';
    let orbColor = '#38bdf8@0.24';
    let secondOrb = '#1e3a8a@0.18';

    if (beat === 'hook') {
      bgColor = '#14060a';
      orbColor = '#ef4444@0.22';
      secondOrb = '#f43f5e@0.15';
    } else if (beat === 'curiositygap' || beat === 'context') {
      bgColor = '#061224';
      orbColor = '#38bdf8@0.22';
      secondOrb = '#0284c7@0.16';
    } else if (beat === 'datareveal' || beat === 'financial_insight') {
      bgColor = '#061527';
      orbColor = '#0ea5e9@0.26';
      secondOrb = '#38bdf8@0.20';
    } else if (beat === 'mechanism' || beat === 'visual_example') {
      bgColor = '#081426';
      orbColor = '#38bdf8@0.22';
      secondOrb = '#6366f1@0.16';
    } else if (beat === 'escalation' || beat === 'comparison') {
      bgColor = '#160d05';
      orbColor = '#f59e0b@0.24';
      secondOrb = '#d97706@0.16';
    } else if (beat === 'payoff' || beat === 'resolution') {
      bgColor = '#051812';
      orbColor = '#10b981@0.26';
      secondOrb = '#059669@0.18';
    } else if (beat === 'cta') {
      bgColor = '#140e05';
      orbColor = '#f59e0b@0.24';
      secondOrb = '#eab308@0.16';
    }

    // FFmpeg procedural moving volumetric light waves + dark atmospheric space
    const filter = `color=c=${bgColor}:s=1080x1920:r=30:d=${Math.ceil(duration + 1)},` +
      `drawbox=x='340+180*sin(t*1.4)':y='650+120*cos(t*1.1)':w=440:h=440:color=${orbColor}:t=fill,` +
      `drawbox=x='420-160*cos(t*1.6)':y='950-140*sin(t*0.9)':w=380:h=380:color=${secondOrb}:t=fill,` +
      `boxblur=lr=75:lp=2,` +
      `format=yuv420p`;

    const args = [
      '-y',
      '-f', 'lavfi',
      '-i', filter,
      '-t', Number(duration).toFixed(2),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      rawPath
    ];

    await runFFmpeg(args);

    return {
      sourceType: SOURCE_TYPES.PROCEDURAL,
      provider: PROVIDERS.PROCEDURAL_FFMPEG,
      assetId,
      sourceUrl: 'procedural://ffmpeg-volumetric-synthesis',
      localPath: rawPath,
      downloadedAt: new Date().toISOString(),
      licenseInfo: 'Procedural Synthesized (CC0 equivalent)',
      theme: beat
    };
  }

  /**
   * Looks for local pre-downloaded or curated video footage in assets/broll or data/broll.
   */
  async findLocalFootage(beat, options = {}) {
    const searchDirs = [this.localAssetsDir];
    const genericWords = new Set(['broll', 'scene', 'video', 'clip', 'beat']);
    const rawKeywords = (options.keywords || []).map(k => String(k).toLowerCase());
    if (options.label) rawKeywords.push(String(options.label).toLowerCase());
    if (options.id) rawKeywords.push(String(options.id).toLowerCase());
    if (!genericWords.has(String(beat).toLowerCase())) {
      rawKeywords.push(String(beat).toLowerCase());
    }

    const keywords = rawKeywords
      .flatMap(kw => kw.split(/[^a-z0-9]+/))
      .filter(kw => kw.length > 2 && !genericWords.has(kw));

    for (const dir of searchDirs) {
      try {
        const files = await fs.readdir(dir);

        // 1. First priority: exact preferredAsset match
        if (options.preferredAsset) {
          const pref = String(options.preferredAsset).toLowerCase();
          const cleanPref = pref.replace(/^broll_/, '');
          const prefMatch = files.find(f => {
            const lower = f.toLowerCase();
            return (lower.endsWith('.mp4') || lower.endsWith('.mov')) &&
              (lower.includes(pref) || lower.includes(cleanPref));
          });
          if (prefMatch) {
            const localPath = path.join(dir, prefMatch);
            return {
              sourceType: SOURCE_TYPES.LOCAL,
              provider: PROVIDERS.LOCAL_LIBRARY,
              assetId: `local_${path.basename(prefMatch, path.extname(prefMatch))}`,
              sourceUrl: `local://library/${prefMatch}`,
              localPath,
              downloadedAt: new Date().toISOString(),
              licenseInfo: 'Local Curated CC0 Asset',
              theme: beat
            };
          }
        }

        // 2. Second priority: semantic keyword matching
        const match = files.find(f => {
          const lower = f.toLowerCase();
          if (!lower.endsWith('.mp4') && !lower.endsWith('.mov')) return false;
          return keywords.some(kw => lower.includes(kw));
        });
        if (match) {
          const localPath = path.join(dir, match);
          return {
            sourceType: SOURCE_TYPES.LOCAL,
            provider: PROVIDERS.LOCAL_LIBRARY,
            assetId: `local_${path.basename(match, path.extname(match))}`,
            sourceUrl: `local://library/${match}`,
            localPath,
            downloadedAt: new Date().toISOString(),
            licenseInfo: 'Local Curated CC0 Asset',
            theme: beat
          };
        }
      } catch (_err) {
        // Directory may not exist yet; continue
      }
    }
    return null;
  }

  /**
   * Queries Pexels Video Search API (if PEXELS_API_KEY is configured).
   */
  async fetchPexelsVideo(beat, _options = {}) {
    if (!this.pexelsApiKey) return null;
    const queries = BEAT_KEYWORDS[beat] || ['finance money business'];
    const query = queries[0];

    try {
      const response = await axios.get('https://api.pexels.com/videos/search', {
        headers: { Authorization: this.pexelsApiKey },
        params: { query, orientation: 'portrait', per_page: 5 },
        timeout: 10000
      });

      const video = response.data?.videos?.[0];
      if (!video) return null;

      const fileObj = (video.video_files || []).find(f => f.width === 1080 && f.height === 1920) ||
        (video.video_files || []).find(f => f.quality === 'hd') ||
        video.video_files?.[0];

      if (!fileObj?.link) return null;

      const assetId = `pexels_${video.id}`;
      const downloadPath = path.join(this.cacheDir, `${assetId}_raw.mp4`);

      const dlRes = await axios.get(fileObj.link, { responseType: 'arraybuffer', timeout: 30000 });
      await fs.writeFile(downloadPath, Buffer.from(dlRes.data));

      return {
        sourceType: SOURCE_TYPES.STOCK,
        provider: PROVIDERS.PEXELS,
        assetId,
        sourceUrl: video.url,
        localPath: downloadPath,
        downloadedAt: new Date().toISOString(),
        licenseInfo: 'Pexels Free License',
        theme: beat
      };
    } catch (err) {
      this.logger.warn(`Pexels API video fetch failed (${err.message}); falling back to local/procedural`);
      return null;
    }
  }

  /**
   * Queries Pixabay Video Search API (if PIXABAY_API_KEY is configured).
   */
  async fetchPixabayVideo(beat, _options = {}) {
    if (!this.pixabayApiKey) return null;
    const queries = BEAT_KEYWORDS[beat] || ['finance money'];
    const query = queries[0];

    try {
      const response = await axios.get('https://pixabay.com/api/videos/', {
        params: {
          key: this.pixabayApiKey,
          q: encodeURIComponent(query),
          video_type: 'film',
          per_page: 5
        },
        timeout: 10000
      });

      const hit = response.data?.hits?.[0];
      if (!hit) return null;

      const stream = hit.videos?.medium || hit.videos?.large || hit.videos?.small;
      if (!stream?.url) return null;

      const assetId = `pixabay_${hit.id}`;
      const downloadPath = path.join(this.cacheDir, `${assetId}_raw.mp4`);

      const dlRes = await axios.get(stream.url, { responseType: 'arraybuffer', timeout: 30000 });
      await fs.writeFile(downloadPath, Buffer.from(dlRes.data));

      return {
        sourceType: SOURCE_TYPES.STOCK,
        provider: PROVIDERS.PIXABAY,
        assetId,
        sourceUrl: hit.pageURL,
        localPath: downloadPath,
        downloadedAt: new Date().toISOString(),
        licenseInfo: 'Pixabay Free Content License',
        theme: beat
      };
    } catch (err) {
      this.logger.warn(`Pixabay API video fetch failed (${err.message}); falling back to local/procedural`);
      return null;
    }
  }

  /**
   * Verifies that provenance metadata conforms to schema.
   */
  static verifyProvenance(provenance) {
    if (!provenance) return false;
    const required = ['sourceType', 'provider', 'assetId', 'localPath', 'downloadedAt', 'licenseInfo'];
    return required.every(field => Boolean(provenance[field]));
  }
}

module.exports = {
  FreeBRollProvider,
  SOURCE_TYPES,
  PROVIDERS,
  BEAT_KEYWORDS
};
