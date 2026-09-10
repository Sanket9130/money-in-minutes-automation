const OpenAI = require('openai');
const Replicate = require('replicate');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { Logger } = require('./logger');
const { runFFmpeg, checkFFmpeg, ffmpegInstallHint } = require('./ffmpeg');
const { MediaGenerationService } = require('./media-generation-service');
const { ShortsCanvasCompositor, CANVAS_PRESETS } = require('./shorts-canvas-compositor');
const { ShortsKaraokeCaptions } = require('./shorts-karaoke-captions');
const { ShortsVisualHook } = require('./shorts-visual-hook');

class AIVideoGenerator {
  constructor(credentials, options = {}) {
    this.logger = new Logger('AIVideoGenerator');
    const resolvedCredentials = credentials?.credentials || credentials || {};
    this.db = options.db || null;
    this.lastVideoResult = null;
    this.lastNarrationResult = null;
    this.lastWordTimings = null;
    this.lastCaptionsResult = null;
    this.lastHookResult = null;
    
    // Initialize AI services with graceful fallback
    const openaiKey = resolvedCredentials.openai?.apiKey || process.env.OPENAI_API_KEY;
    const replicateKey = resolvedCredentials.replicate?.apiKey || process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
    
    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
      this.logger.info('OpenAI service initialized');
    } else {
      this.logger.warn('OpenAI API key not found - AI features will be simulated');
    }
    
    if (replicateKey) {
      this.replicate = new Replicate({ auth: replicateKey });
      this.logger.info('Replicate service initialized');
    } else {
      this.logger.warn('Replicate API key not found - advanced video generation unavailable');
    }

    // Gemini media generation (images + native TTS) — free-tier alternative to OpenAI
    const geminiKey = resolvedCredentials.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const { GoogleGenAI } = require('@google/genai');
        this.gemini = new GoogleGenAI({ apiKey: geminiKey });
        this.logger.info('Gemini media service initialized (images + TTS)');
      } catch (error) {
        this.logger.warn('Failed to initialize Gemini media service:', error.message);
      }
    }
    
    // ElevenLabs configuration
    this.elevenLabsApiKey = resolvedCredentials.elevenLabs?.apiKey || process.env.ELEVENLABS_API_KEY;
    this.elevenLabsVoiceId = resolvedCredentials.elevenLabs?.voiceId || process.env.ELEVENLABS_VOICE_ID;
    this.elevenLabsModel = process.env.ELEVENLABS_TTS_MODEL || 'eleven_v3';
    
    // Azure Speech configuration
    this.azureSpeechKey = resolvedCredentials.azure?.speechKey || process.env.AZURE_SPEECH_KEY;
    this.azureSpeechRegion = resolvedCredentials.azure?.speechRegion || process.env.AZURE_SPEECH_REGION;
    this.mediaGeneration = options.mediaGeneration || (this.db
      ? new MediaGenerationService(this.db, resolvedCredentials, { logger: this.logger })
      : null);
  }

  async generateTTSAudio(text, outputPath) {
    this.logger.info('Generating TTS audio...');
    this.lastNarrationResult = null;
    let provider = 'simulation';
    let model = null;

    try {
      let generatedPath;
      if (this.elevenLabsApiKey && this.elevenLabsVoiceId) {
        provider = 'elevenlabs';
        model = this.elevenLabsModel;
        generatedPath = await this.generateElevenLabsTTS(text, outputPath);
      } else if (this.openai) {
        provider = 'openai';
        model = 'gpt-4o-mini-tts';
        generatedPath = await this.generateOpenAITTS(text, outputPath);
      } else if (this.gemini) {
        provider = 'gemini';
        model = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
        generatedPath = await this.generateGeminiTTS(text, outputPath);
      } else {
        generatedPath = await this.simulateTTSGeneration(text, outputPath);
      }

      const usable = await this.isUsableAudioFile(generatedPath);
      this.lastNarrationResult = {
        status: usable ? 'ready' : 'unavailable',
        path: generatedPath,
        provider,
        model,
        externalTaskId: null,
        generatedAt: new Date().toISOString(),
        simulated: !usable,
        wordTimings: this.lastWordTimings || null,
        cost: { provider, amount: null, currency: null, invoiceRequired: provider !== 'simulation' }
      };
      return generatedPath;
    } catch (error) {
      this.lastNarrationResult = {
        status: 'failed', path: null, provider, model, externalTaskId: null,
        generatedAt: new Date().toISOString(), simulated: false, error: error.message,
        cost: { provider, amount: null, currency: null, invoiceRequired: provider !== 'simulation' }
      };
      this.logger.error('TTS generation failed:', error);
      throw error;
    }
  }

  async generateElevenLabsTTS(text, outputPath) {
    const timestampUrl = `https://api.elevenlabs.io/v1/text-to-speech/${this.elevenLabsVoiceId}/with-timestamps`;
    const fallbackUrl = `https://api.elevenlabs.io/v1/text-to-speech/${this.elevenLabsVoiceId}`;

    const data = {
      text: text,
      model_id: this.elevenLabsModel,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.0,
        use_speaker_boost: true
      }
    };

    try {
      const response = await axios({
        method: 'POST',
        url: timestampUrl,
        data: data,
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.elevenLabsApiKey
        }
      });

      if (response.data && response.data.audio_base64) {
        const audioBuffer = Buffer.from(response.data.audio_base64, 'base64');
        await fs.writeFile(outputPath, audioBuffer);
        if (response.data.alignment) {
          this.lastWordTimings = ShortsKaraokeCaptions.convertElevenLabsAlignment(response.data.alignment);
        }
        this.logger.info('ElevenLabs TTS with word timestamps complete');
        return outputPath;
      }
    } catch (_err) {
      // Fallback to standard endpoint
    }

    const response = await axios({
      method: 'POST',
      url: fallbackUrl,
      data: data,
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': this.elevenLabsApiKey
      },
      responseType: 'stream'
    });

    const writer = require('fs').createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        this.logger.info('ElevenLabs TTS generation complete');
        resolve(outputPath);
      });
      writer.on('error', reject);
    });
  }

  async generateOpenAITTS(text, outputPath) {
    const response = await this.openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: text,
      speed: 1.0
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, buffer);

    this.logger.info('OpenAI TTS generation complete');
    return outputPath;
  }

  async generateGeminiTTS(text, outputPath) {
    const model = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
    const voiceName = process.env.GEMINI_TTS_VOICE || 'Kore';

    const response = await this.gemini.models.generateContent({
      model,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        }
      }
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      throw new Error('Gemini TTS returned no audio data');
    }

    // Gemini returns raw PCM (24kHz, mono, 16-bit); encode to the requested container via FFmpeg
    const pcmPath = outputPath + '.pcm';
    await fs.writeFile(pcmPath, Buffer.from(audioData, 'base64'));
    await runFFmpeg(['-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcmPath, outputPath]);
    await fs.unlink(pcmPath).catch(() => {});

    this.logger.info('Gemini TTS generation complete');
    return outputPath;
  }

  async generateVisualAssets(prompt, style = "ethereal", count = 1) {
    this.logger.info(`Generating ${count} visual assets with style: ${style}`);

    try {
      if (!this.openai && !this.gemini) {
        return await this.simulateVisualAssets(prompt, style, count);
      }

      const enhancedPrompt = this.enhanceVisualPrompt(prompt, style);
      const localPaths = [];

      for (let i = 0; i < count; i++) {
        const imagePath = path.join(__dirname, '..', 'data', 'assets', `visual_${Date.now()}_${i}.png`);
        await this.generateImage(enhancedPrompt, imagePath);
        localPaths.push(imagePath);
      }

      this.logger.info(`Generated ${localPaths.length} visual assets`);
      return localPaths;
    } catch (error) {
      this.logger.error('Visual asset generation failed:', error);
      return await this.simulateVisualAssets(prompt, style, count);
    }
  }

  async generateImage(prompt, imagePath) {
    await fs.mkdir(path.dirname(imagePath), { recursive: true });

    if (this.openai) {
      return await this.generateOpenAIImage(prompt, imagePath);
    }

    if (this.gemini) {
      return await this.generateGeminiImage(prompt, imagePath);
    }

    throw new Error('No image generation provider configured');
  }

  async generateOpenAIImage(prompt, imagePath) {
    const response = await this.openai.images.generate({
      model: "gpt-image-2",
      prompt: prompt,
      n: 1,
      size: "1536x1024",
      quality: "high",
    });

    if (response.data[0].b64_json) {
      const buffer = Buffer.from(response.data[0].b64_json, 'base64');
      await fs.writeFile(imagePath, buffer);
    } else {
      await this.downloadImage(response.data[0].url, imagePath);
    }

    return imagePath;
  }

  async generateGeminiImage(prompt, imagePath) {
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';

    const response = await this.gemini.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: '16:9',
          imageSize: '1K'
        }
      }
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const imageParts = parts.filter(part =>
      part.inlineData?.data && (!part.inlineData.mimeType || part.inlineData.mimeType.startsWith('image/'))
    );
    const renderedImages = imageParts.filter(part => part.thought !== true);
    const imagePart = (renderedImages.length ? renderedImages : imageParts).at(-1);
    if (!imagePart) {
      throw new Error('Gemini image generation returned no image data');
    }

    const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
    const metadata = await sharp(imageBuffer, { failOn: 'error' }).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Gemini image generation returned an invalid image asset');
    }

    const extension = path.extname(imagePath).toLowerCase();
    const output = sharp(imageBuffer, { failOn: 'error' });
    if (extension === '.jpg' || extension === '.jpeg') {
      await output.jpeg({ quality: 92 }).toFile(imagePath);
    } else if (extension === '.webp') {
      await output.webp({ quality: 92 }).toFile(imagePath);
    } else {
      await output.png().toFile(imagePath);
    }
    return imagePath;
  }

  enhanceVisualPrompt(prompt, style) {
    const styleEnhancements = {
      ethereal: "ethereal, dreamy, mystical, soft lighting, floating particles, cosmic background",
      modern: "modern, clean, minimalist, professional, sleek design, contemporary",
      animated: "animated style, cartoon, vibrant colors, expressive, dynamic",
      cinematic: "cinematic lighting, dramatic, movie poster style, high contrast",
      abstract: "abstract art, geometric shapes, gradient colors, artistic composition"
    };

    const enhancement = styleEnhancements[style] || styleEnhancements.ethereal;
    return `${prompt}, ${enhancement}, high quality, 16:9 aspect ratio, digital art`;
  }

  async downloadImage(url, outputPath) {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const writer = require('fs').createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  async generateVideo(script, visualAssets, audioPath, outputPath, options = {}) {
    this.logger.info('Generating video from assets...');
    this.lastVideoResult = null;
    try {
      if (this.mediaGeneration && options.productionId) {
        const generated = await this.mediaGeneration.generateClips({
          jobId: options.jobId || null,
          productionId: options.productionId,
          script,
          visualAssets,
          outputDir: path.dirname(outputPath)
        });
        if (generated.clips.length) {
          const produced = await this.generateHybridVideo(
            generated.clips,
            visualAssets,
            audioPath,
            outputPath,
            options.estimatedDuration || this.calculateScriptDuration(script),
            options
          );
          this.lastVideoResult = {
            requestedProvider: generated.requestedProvider,
            actualProvider: generated.actualProvider,
            model: generated.model,
            mode: generated.settings.mode,
            generatedSeconds: generated.clips.reduce((total, clip) => total + clip.duration, 0),
            tasks: generated.clips.map(clip => ({ scene: clip.index, taskId: clip.taskId, provider: clip.provider, model: clip.model })),
            scenes: generated.clips.map(clip => ({
              index: clip.index, label: clip.label, prompt: clip.prompt, duration: clip.duration,
              path: clip.path, taskId: clip.taskId, provider: clip.provider, model: clip.model
            }))
          };
          return produced;
        }
      }

      const produced = await this.generateSlideshowVideo(script, visualAssets, audioPath, outputPath, options);
      this.lastVideoResult = { requestedProvider: 'slideshow', actualProvider: 'slideshow', model: 'local-ffmpeg', mode: 'slideshow', generatedSeconds: 0, tasks: [], scenes: [] };
      return produced;
    } catch (error) {
      // The Logger's console line only shows the message string, so put the real
      // reason inline. Previously the stack alone went to the file transport and
      // the console printed "Video generation failed:" with no detail.
      const reason = error && error.message ? error.message : String(error);
      this.logger.error(`Video provider generation failed; using the local slideshow: ${reason}`, error);
      try {
        const produced = await this.generateSlideshowVideo(script, visualAssets, audioPath, outputPath, options);
        this.lastVideoResult = {
          requestedProvider: this.lastVideoResult?.requestedProvider || 'configured-provider',
          actualProvider: 'slideshow', model: 'local-ffmpeg', mode: 'fallback', generatedSeconds: 0,
          fallbackReason: reason, tasks: [], scenes: []
        };
        return produced;
      } catch (fallbackError) {
        this.logger.error(`Local slideshow fallback failed: ${fallbackError.message}`, fallbackError);
        const produced = await this.simulateVideoGeneration(script, visualAssets, audioPath, outputPath);
        this.lastVideoResult = {
          requestedProvider: 'configured-provider', actualProvider: 'simulation', model: null,
          mode: 'simulation', generatedSeconds: 0, fallbackReason: `${reason}; ${fallbackError.message}`, tasks: [], scenes: []
        };
        return produced;
      }
    }
  }

  async generateShortSlideshowVideo(script, visualAssets, audioPath, outputPath, options = {}) {
    return this.generateSlideshowVideo(script, visualAssets, audioPath, outputPath, {
      ...options,
      aspectRatio: '9:16',
      isShort: true
    });
  }

  async generateHybridVideo(clips, visualAssets, audioPath, outputPath, totalDuration, options = {}) {
    if (!(await checkFFmpeg())) throw new Error(ffmpegInstallHint());
    const validImages = await this.filterLocalImageAssets(visualAssets);
    const segments = clips.map(clip => ({ type: 'video', path: clip.path, duration: clip.duration }));
    const generatedDuration = segments.reduce((sum, item) => sum + item.duration, 0);
    const remaining = Math.max(0, this.parseDurationSeconds(totalDuration) - generatedDuration);
    if (remaining && validImages.length) {
      const perImage = Math.max(2, remaining / validImages.length);
      for (const imagePath of validImages) segments.push({ type: 'image', path: imagePath, duration: perImage });
    }
    if (!segments.length) throw new Error('No usable provider clips or still images were generated');

    const visualPath = outputPath.replace(/\.mp4$/i, '_hybrid_visual.mp4');
    await this.renderMediaTimeline(segments, visualPath, options);
    await this.addAudioToVideo(visualPath, audioPath, outputPath, { loopVideo: true });
    await fs.unlink(visualPath).catch(() => {});
    return outputPath;
  }

  async renderMediaTimeline(segments, outputPath, options = {}) {
    const canvas = ShortsCanvasCompositor.resolveCanvas(options);
    const { width, height } = canvas;
    const args = ['-y'];
    for (const segment of segments) {
      if (segment.type === 'image') args.push('-loop', '1', '-t', Number(segment.duration).toFixed(2), '-framerate', '30', '-i', segment.path);
      else args.push('-stream_loop', '-1', '-i', segment.path);
    }
    const filters = segments.map((segment, index) =>
      `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p,trim=duration=${Number(segment.duration).toFixed(2)},setpts=PTS-STARTPTS[v${index}]`
    );
    filters.push(`${segments.map((_, index) => `[v${index}]`).join('')}concat=n=${segments.length}:v=1:a=0[vout]`);
    args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outputPath);
    await runFFmpeg(args);
    return outputPath;
  }

  async filterLocalImageAssets(visualAssets = []) {
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
    const images = [];
    for (const asset of visualAssets) {
      if (typeof asset !== 'string' || !imageExtensions.has(path.extname(asset).toLowerCase())) continue;
      try {
        await fs.access(asset);
        images.push(asset);
      } catch (_error) { /* ignore missing assets */ }
    }
    return images;
  }

  parseDurationSeconds(value) {
    if (Number.isFinite(Number(value))) return Math.max(0, Number(value));
    const parts = String(value || '').split(':').map(Number);
    if (parts.length === 2 && parts.every(Number.isFinite)) return Math.max(0, parts[0] * 60 + parts[1]);
    if (parts.length === 3 && parts.every(Number.isFinite)) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
    return 0;
  }

  async generateReplicateVideo(script, visualAssets, audioPath, outputPath) {
    const output = await this.replicate.run(
      "wan-video/wan-2.7-i2v",
      {
        input: {
          image: visualAssets[0],
          prompt: script.title || "smooth cinematic motion",
          duration: 5,
          resolution: "720p"
        }
      }
    );

    // Download the generated video
    if (output && output.length > 0) {
      await this.downloadVideo(output[0], outputPath);
      
      // Add audio track
      await this.addAudioToVideo(outputPath, audioPath, outputPath);
    }

    return outputPath;
  }

  async generateSlideshowVideo(script, visualAssets, audioPath, outputPath, options = {}) {
    this.logger.info('Creating slideshow video...');

    if (!(await checkFFmpeg())) {
      throw new Error(ffmpegInstallHint());
    }

    const canvas = ShortsCanvasCompositor.resolveCanvas(options);
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const slidesDir = path.join(path.dirname(outputPath), 'slides');

    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: canvas.width, height: canvas.height });

      // Create HTML for slideshow (only real image files can be embedded)
      const imageAssets = await this.filterImageAssets(visualAssets);
      await page.setContent(this.createSlideshowHTML(script, imageAssets, options));

      // Freeze CSS transitions/animations so each still is captured fully rendered
      await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
      await page.waitForTimeout(1000); // Wait for assets to load

      // Capture ONE still per slide instead of screenshotting at 30fps —
      // FFmpeg turns the stills into a crossfaded video in seconds.
      const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
      await fs.mkdir(slidesDir, { recursive: true });

      const stills = [];
      for (let i = 0; i < slideCount; i++) {
        await page.evaluate((index) => {
          document.querySelectorAll('.slide').forEach((slide, s) => {
            slide.classList.toggle('active', s === index);
          });
        }, i);

        const stillPath = path.join(slidesDir, `slide_${String(i).padStart(3, '0')}.png`);
        await page.screenshot({ path: stillPath });
        stills.push(stillPath);
      }

      const videoPath = outputPath.replace('.mp4', '_visual.mp4');
      const duration = this.calculateScriptDuration(script);

      const isShorts = canvas.aspectRatio === '9:16';
      if (isShorts && options.visualHook !== false && options.hook !== false) {
        this.lastHookResult = ShortsVisualHook.resolveConfig(script, options);
      } else {
        this.lastHookResult = null;
      }

      await this.renderSlidesToVideo(stills, duration, videoPath, {
        ...options,
        canvas,
        hookConfig: this.lastHookResult
      });

      // Add audio and optional dynamic karaoke captions for Shorts
      if (isShorts && options.karaoke !== false) {
        const audioMuxedPath = outputPath.replace('.mp4', '_audiomux.mp4');
        await this.addAudioToVideo(videoPath, audioPath, audioMuxedPath, options);

        const captionsDir = path.join(path.dirname(outputPath), 'captions');
        const baseName = path.basename(outputPath, '.mp4');
        const measuredDuration = await this.getAudioDuration(audioPath);
        const effectiveDuration = measuredDuration > 0 ? measuredDuration : duration;

        const captionResult = await ShortsKaraokeCaptions.processCaptions({
          script,
          audioDuration: effectiveDuration,
          outputDir: captionsDir,
          baseName,
          options: {
            ...options,
            canvas,
            providerTimings: options.providerTimings || this.lastNarrationResult?.wordTimings || this.lastWordTimings
          }
        });

        await ShortsKaraokeCaptions.burnKaraokeCaptions(audioMuxedPath, captionResult.assPath, outputPath);
        await fs.unlink(audioMuxedPath).catch(() => {});
        this.lastCaptionsResult = captionResult;
      } else {
        await this.addAudioToVideo(videoPath, audioPath, outputPath, options);
      }

      return outputPath;
    } finally {
      await browser.close().catch(() => {});
      await this.cleanupDirectory(slidesDir);
    }
  }

  async renderSlidesToVideo(stills, totalDuration, videoPath, options = {}) {
    if (stills.length === 0) {
      throw new Error('No slides to render');
    }

    const canvas = ShortsCanvasCompositor.resolveCanvas(options);
    const isShorts = canvas.aspectRatio === '9:16';
    const isHookEnabled = isShorts && options.hook !== false && options.visualHook !== false;

    if (stills.length === 1) {
      const args = ['-y', '-loop', '1', '-t', Math.max(2, totalDuration).toFixed(2), '-framerate', '30', '-i', stills[0]];
      args.push('-vf', `scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=decrease,pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p`, '-c:v', 'libx264', videoPath);
      await runFFmpeg(args);
      return videoPath;
    }

    const args = ['-y'];
    const filters = [];

    if (isHookEnabled) {
      // Phase 1 Feature 1.3: Anti-Swipe Visual Hook Timing
      const hookCfg = options.hookConfig || ShortsVisualHook.resolveConfig({}, options);
      const hookDuration = hookCfg.duration; // Configurable, default 1.8s (clamped 1.0-3.0s)
      const hookFade = 0.35; // Snappy 350ms transition
      const standardFade = 0.4;

      const numRemaining = stills.length - 1;
      const remainingDuration = Math.max(numRemaining * 1.5, totalDuration - hookDuration);
      const perOtherSlide = remainingDuration / numRemaining;

      // Input 0 (Hook slide)
      args.push('-loop', '1', '-t', (hookDuration + hookFade).toFixed(2), '-framerate', '30', '-i', stills[0]);

      // Inputs 1..N-1
      for (let i = 1; i < stills.length; i++) {
        const isLast = i === stills.length - 1;
        const inputDuration = isLast ? perOtherSlide : perOtherSlide + standardFade;
        args.push('-loop', '1', '-t', inputDuration.toFixed(2), '-framerate', '30', '-i', stills[i]);
      }

      let prev = '[0:v]';
      let currentPlayback = hookDuration;

      for (let i = 1; i < stills.length; i++) {
        const out = `[v${i}]`;
        const fade = i === 1 ? hookFade : standardFade;
        const offset = (i === 1 ? hookDuration : currentPlayback).toFixed(2);
        filters.push(`${prev}[${i}:v]xfade=transition=fade:duration=${fade.toFixed(2)}:offset=${offset}${out}`);
        prev = out;
        if (i === 1) {
          currentPlayback = hookDuration + perOtherSlide;
        } else {
          currentPlayback += perOtherSlide;
        }
      }

      filters.push(`${prev}scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=decrease,pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p[vfinal]`);
    } else {
      // 16:9 Long-Form / Standard Crossfade (Preserves existing behavior exactly)
      const fade = 0.5;
      const perSlide = Math.max(2, totalDuration / stills.length);

      for (const still of stills) {
        args.push('-loop', '1', '-t', perSlide.toFixed(2), '-framerate', '30', '-i', still);
      }

      let prev = '[0:v]';
      for (let i = 1; i < stills.length; i++) {
        const out = `[v${i}]`;
        const offset = (i * (perSlide - fade)).toFixed(2);
        filters.push(`${prev}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset}${out}`);
        prev = out;
      }
      filters.push(`${prev}scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=decrease,pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p[vfinal]`);
    }

    args.push(
      '-filter_complex', filters.join(';'),
      '-map', '[vfinal]',
      '-c:v', 'libx264',
      '-r', '30',
      videoPath
    );

    await runFFmpeg(args);
    return videoPath;
  }

  async filterImageAssets(visualAssets = []) {
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
    const mimeTypes = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp'
    };
    const images = [];

    for (const asset of visualAssets) {
      if (typeof asset !== 'string' || !imageExtensions.has(path.extname(asset).toLowerCase())) {
        continue;
      }

      try {
        const imageBuffer = await fs.readFile(asset);
        const metadata = await sharp(imageBuffer, { failOn: 'error' }).metadata();
        const mimeType = mimeTypes[metadata.format];
        if (mimeType && metadata.width && metadata.height) {
          images.push(`data:${mimeType};base64,${imageBuffer.toString('base64')}`);
        }
      } catch (_error) {
        // Skip missing or invalid image files
      }
    }

    return images;
  }

  createSlideshowHTML(script, visualAssets = [], options = {}) {
    return ShortsCanvasCompositor.createSlideshowHTML(script, visualAssets, options);
  }

  generateContentSlides(script, visualAssets) {
    const slides = [];
    
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach((section, index) => {
        const assetIndex = Math.min(index + 1, visualAssets.length - 1);
        
        slides.push(`
        <div class="slide">
            ${visualAssets[assetIndex] ? `<img class="background-image" src="${visualAssets[assetIndex]}" />` : ''}
            <div class="content">
                <h2>${section.title}</h2>
                ${this.formatSectionContent(section)}
            </div>
        </div>`);
      });
    }
    
    return slides;
  }

  formatSectionContent(section) {
    if (section.items && Array.isArray(section.items)) {
      return section.items.slice(0, 3).map(item => 
        `<p>${item.number}. ${item.title}</p>`
      ).join('');
    }
    
    if (section.steps && Array.isArray(section.steps)) {
      return section.steps.slice(0, 3).map(step => 
        `<p>${step.title}</p>`
      ).join('');
    }
    
    if (typeof section.content === 'string') {
      return `<p>${section.content.slice(0, 200)}${section.content.length > 200 ? '...' : ''}</p>`;
    }
    
    return '<p>Content coming soon...</p>';
  }

  calculateScriptDuration(script) {
    // Estimate duration based on word count (average 150 words per minute)
    let totalWords = 0;
    
    if (script.hook) totalWords += script.hook.text.split(' ').length;
    if (script.introduction) {
      totalWords += (script.introduction.greeting || '').split(' ').length;
      totalWords += (script.introduction.topicIntro || '').split(' ').length;
    }
    
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach(section => {
        if (typeof section.content === 'string') {
          totalWords += section.content.split(' ').length;
        }
        if (section.items) {
          section.items.forEach(item => {
            totalWords += (item.title + ' ' + item.description).split(' ').length;
          });
        }
        if (section.steps) {
          section.steps.forEach(step => {
            totalWords += (step.title + ' ' + step.description).split(' ').length;
          });
        }
      });
    }
    
    if (script.conclusion) {
      totalWords += script.conclusion.finalThought.split(' ').length;
    }
    
    // Convert to duration (150 words per minute)
    return Math.max(30, Math.ceil((totalWords / 150) * 60));
  }

  async addAudioToVideo(videoPath, audioPath, outputPath, options = {}) {
    const hasRealAudio = await this.isUsableAudioFile(audioPath);

    if (!hasRealAudio) {
      if (options.allowSilent === true) {
        this.logger.warn('Creating an intentionally silent video from an operator-confirmed override.');
        if (videoPath !== outputPath) await fs.copyFile(videoPath, outputPath);
        return outputPath;
      }
      const error = new Error('Narration audio is required. Regenerate narration or explicitly confirm an intentional silent video.');
      error.code = 'NARRATION_REQUIRED';
      throw error;
    }

    // FFmpeg cannot write to its own input, so mux to a temp file when paths collide
    const muxPath = outputPath === videoPath
      ? outputPath.replace(/\.mp4$/i, '_muxed.mp4')
      : outputPath;

    const videoInput = options.loopVideo ? ['-stream_loop', '-1', '-i', videoPath] : ['-i', videoPath];
    await runFFmpeg(['-y', ...videoInput, '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', muxPath]);

    if (muxPath !== outputPath) {
      await fs.rename(muxPath, outputPath);
    }

    this.logger.info('Audio added to video successfully');
    return outputPath;
  }

  async isUsableAudioFile(audioPath) {
    if (typeof audioPath !== 'string' || audioPath.endsWith('.info')) {
      return false;
    }

    try {
      const stats = await fs.stat(audioPath);
      return stats.isFile() && stats.size > 0;
    } catch (error) {
      return false;
    }
  }

  async downloadVideo(url, outputPath) {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const writer = require('fs').createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  async cleanupDirectory(dirPath) {
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        await fs.unlink(path.join(dirPath, file));
      }
      await fs.rmdir(dirPath);
    } catch (error) {
      this.logger.warn('Cleanup failed:', error.message);
    }
  }

  async generateThumbnail(script, style = "ethereal") {
    this.logger.info('Generating custom thumbnail...');

    try {
      if (!this.openai && !this.gemini) {
        return await this.simulateThumbnailGeneration(script, style);
      }

      const prompt = `YouTube thumbnail for "${script.title}", ${style} style, eye-catching, high contrast text, professional design, clickable, engaging`;
      const thumbnailPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_${Date.now()}.png`);

      await this.generateImage(prompt, thumbnailPath);
      const metadata = await sharp(thumbnailPath).metadata();

      return {
        path: thumbnailPath,
        dimensions: { width: metadata.width, height: metadata.height },
        fileSize: await this.getFileSize(thumbnailPath)
      };
    } catch (error) {
      this.logger.error('Thumbnail generation failed:', error);
      return await this.simulateThumbnailGeneration(script, style);
    }
  }

  async getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  // Simulation methods for when APIs are not available
  async simulateTTSGeneration(text, outputPath) {
    this.logger.info('Simulating TTS generation...');
    
    const infoPath = outputPath + '.info';
    await fs.writeFile(infoPath, JSON.stringify({
      message: 'AI TTS audio would be generated here',
      text: text.substring(0, 100) + '...',
      timestamp: new Date().toISOString()
    }, null, 2));
    
    return infoPath;
  }

  async simulateVisualAssets(prompt, style, count) {
    this.logger.info(`Simulating ${count} visual assets...`);
    
    const paths = [];
    for (let i = 0; i < count; i++) {
      const assetPath = path.join(__dirname, '..', 'data', 'assets', `visual_sim_${Date.now()}_${i}.info`);
      
      await fs.writeFile(assetPath, JSON.stringify({
        message: 'AI visual asset would be generated here',
        prompt: prompt,
        style: style,
        timestamp: new Date().toISOString()
      }, null, 2));
      
      paths.push(assetPath);
    }
    
    return paths;
  }

  async simulateVideoGeneration(script, visualAssets, audioPath, outputPath) {
    this.logger.info('Simulating video generation...');
    
    const infoPath = outputPath + '.info';
    await fs.writeFile(infoPath, JSON.stringify({
      message: 'AI video would be generated here',
      script: script.title,
      visualAssets: visualAssets.length,
      audioPath: audioPath,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    return infoPath;
  }

  async simulateThumbnailGeneration(script, style) {
    this.logger.info('Simulating thumbnail generation...');
    
    const thumbnailPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_sim_${Date.now()}.info`);
    await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });
    
    await fs.writeFile(thumbnailPath, JSON.stringify({
      message: 'AI thumbnail would be generated here',
      title: script.title,
      style: style,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    return {
      path: thumbnailPath,
      dimensions: { width: 1792, height: 1024 },
      fileSize: 1024,
      simulated: true
    };
  }

  async getAudioDuration(audioPath) {
    if (!audioPath) return 0;
    try {
      const { execFile } = require('child_process');
      const { promisify } = require('util');
      const execFileAsync = promisify(execFile);
      const { getFFmpegPath } = require('./ffmpeg');
      let probe = '';
      try {
        await execFileAsync(getFFmpegPath(), ['-i', audioPath]);
      } catch (err) {
        probe = (err.stderr || '') + (err.stdout || '');
      }
      const match = probe.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d+)/);
      if (match) {
        return Number(match[1]) * 3600 + Number(match[2]) * 60 + parseFloat(match[3]);
      }
    } catch (_e) {
      // fallback
    }
    return 0;
  }
}

module.exports = { AIVideoGenerator, ShortsCanvasCompositor, CANVAS_PRESETS, ShortsKaraokeCaptions, ShortsVisualHook };
