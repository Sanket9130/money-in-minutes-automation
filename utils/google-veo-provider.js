'use strict';

/**
 * Google Veo 3.1 Programmatic Video Provider
 *
 * Official programmatic video generation provider using @google/genai SDK
 * with support for 9:16 vertical aspect ratio, character reference image conditioning,
 * asynchronous operation polling, automated download, retry/timeout governance, and itemized cost tracking.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const axios = require('axios');
const { Logger } = require('./logger');

const PROVIDER_TIERS = {
  FREE: 'FREE',
  FREE_TIER: 'FREE-TIER',
  PAID: 'PAID'
};

class BaseVideoProviderAdapter {
  constructor(id, name, tier, options = {}) {
    this.id = id;
    this.name = name;
    this.tier = tier;
    this.costPerSec = Number(options.costPerSec || 0.0);
    this.priority = Number(options.priority || 50);
    this.features = options.features || [];
    this.options = options;
  }

  isAvailable() {
    return true;
  }

  async generateClip(_scenePlan, _options = {}) {
    throw new Error(`generateClip not implemented on ${this.name}`);
  }
}

const DEFAULT_VEO_MODEL = 'veo-3.1-generate-preview';
const DEFAULT_POLL_INTERVAL_MS = 4000;
const DEFAULT_TIMEOUT_MS = 180000; // 3 minutes
const DEFAULT_COST_PER_SEC = 0.10; // $0.10 per second
const MIN_CLIP_DURATION = 4;
const MAX_CLIP_DURATION = 8;
const ALLOWED_ASPECT_RATIOS = ['9:16', '16:9', '1:1'];

function redactSensitiveData(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key|token|secret|password)=([^\s&]+)/gi, '$1=[redacted]')
    .slice(0, 1000);
}

class GoogleVeoProvider extends BaseVideoProviderAdapter {
  constructor(options = {}) {
    super('google_veo_3', 'Google DeepMind Veo 3.1 Video Engine', PROVIDER_TIERS.PAID, {
      costPerSec: options.costPerSec !== undefined ? Number(options.costPerSec) : DEFAULT_COST_PER_SEC,
      priority: options.priority !== undefined ? Number(options.priority) : 85,
      features: [
        'ai_video_diffusion',
        'image_to_video',
        '9:16_native',
        'character_conditioning',
        '1080p',
        'async_polling'
      ],
      ...options
    });

    this.logger = new Logger('GoogleVeoProvider');
    this.modelName = options.model || process.env.GOOGLE_VEO_MODEL || DEFAULT_VEO_MODEL;
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
    this.enabled = options.enabled !== undefined
      ? Boolean(options.enabled)
      : (process.env.GOOGLE_VEO_ENABLED === 'true' || process.env.GOOGLE_VEO_ENABLED === '1');

    this.pollIntervalMs = Math.max(100, Number(options.pollIntervalMs || process.env.VIDEO_PROVIDER_POLL_MS || DEFAULT_POLL_INTERVAL_MS));
    this.timeoutMs = Math.max(1000, Number(options.timeoutMs || process.env.VIDEO_PROVIDER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
    this.sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.usageLog = [];

    // Client initialization
    if (options.client) {
      this.client = options.client;
    } else if (this.apiKey) {
      try {
        const { GoogleGenAI } = require('@google/genai');
        this.client = new GoogleGenAI({ apiKey: this.apiKey });
      } catch (err) {
        this.logger.warn(`Failed to initialize @google/genai client: ${err.message}`);
        this.client = null;
      }
    } else {
      this.client = null;
    }
  }

  /**
   * Checks if Veo 3.1 is enabled and ready to accept requests.
   */
  isAvailable() {
    return Boolean(this.enabled && this.client && this.apiKey);
  }

  /**
   * Normalizes and validates a video generation request.
   */
  normalizeRequest(request = {}) {
    if (!request || typeof request !== 'object') {
      throw new Error('Veo request must be a valid object');
    }

    const prompt = String(request.prompt || '').trim();
    if (!prompt) {
      throw new Error('Veo generation request requires a non-empty prompt');
    }

    // Duration clamping to official Veo supported bounds [4, 8] seconds
    const rawDuration = Number(request.duration || 5);
    if (isNaN(rawDuration)) {
      throw new Error(`Invalid duration value: ${request.duration}`);
    }
    const duration = Math.max(MIN_CLIP_DURATION, Math.min(MAX_CLIP_DURATION, Math.round(rawDuration)));

    // Aspect ratio validation
    let aspectRatio = String(request.aspectRatio || '9:16').trim();
    if (!ALLOWED_ASPECT_RATIOS.includes(aspectRatio)) {
      this.logger.warn(`Unsupported aspect ratio "${aspectRatio}". Defaulting to "9:16".`);
      aspectRatio = '9:16';
    }

    // Resolution
    const resolution = String(request.resolution || '720p').toLowerCase();

    // Scene and directory naming
    const sceneId = String(request.sceneId || `veo_scene_${Date.now()}`);
    const outputDir = request.outputDir || path.join(__dirname, '..', 'temp', 'videos');

    // Reference image extraction
    const characterReferenceImage = request.characterReferenceImage || request.firstFrame || null;

    return {
      sceneId,
      prompt,
      duration,
      aspectRatio,
      resolution,
      characterReferenceImage,
      outputDir,
      personGeneration: request.personGeneration || 'ALLOW_ADULT'
    };
  }

  /**
   * Builds an enriched prompt incorporating visual quality tokens and character styling.
   */
  buildPrompt(request = {}, context = {}) {
    const rawPrompt = request.prompt || '';
    const styleModifiers = 'Cinematic commercial lighting, photorealistic 8k video quality, natural motion, crisp focus, no text overlays, no subtitles, no watermarks, vertical 9:16 composition.';

    if (context.characterName) {
      return `${rawPrompt}. Featuring ${context.characterName}. ${styleModifiers}`.trim();
    }

    return `${rawPrompt}. ${styleModifiers}`.trim();
  }

  /**
   * Encodes a local image file into @google/genai image payload format.
   */
  async encodeReferenceImage(imagePath) {
    if (!imagePath) return null;

    // Direct object with base64 already provided (e.g. from in-memory test)
    if (typeof imagePath === 'object' && imagePath.imageBytes) {
      return imagePath;
    }

    if (typeof imagePath !== 'string') return null;

    // Check file existence
    if (!fs.existsSync(imagePath)) {
      this.logger.warn(`Reference image not found at ${imagePath}. Proceeding text-only.`);
      return null;
    }

    try {
      const buffer = await fsp.readFile(imagePath);
      const ext = path.extname(imagePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');

      return {
        imageBytes: buffer.toString('base64'),
        mimeType
      };
    } catch (err) {
      this.logger.warn(`Failed to read reference image at ${imagePath}: ${err.message}`);
      return null;
    }
  }

  /**
   * Submits generation job, polls for completion, downloads output, and logs usage.
   */
  async generateClip(request = {}, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('GoogleVeoProvider is not available (Missing API key or GOOGLE_VEO_ENABLED is false)');
    }

    const normalized = this.normalizeRequest(request);
    const enrichedPrompt = this.buildPrompt(normalized, options);
    const referencePayload = await this.encodeReferenceImage(normalized.characterReferenceImage);

    this.logger.info(`Submitting Veo 3.1 video generation for "${normalized.sceneId}" (${normalized.duration}s, ${normalized.aspectRatio})`);

    const generateParams = {
      model: this.modelName,
      prompt: enrichedPrompt,
      config: {
        aspectRatio: normalized.aspectRatio,
        durationSeconds: normalized.duration,
        resolution: normalized.resolution
      }
    };

    if (normalized.personGeneration && !['allow_adult', 'ALLOW_ADULT'].includes(normalized.personGeneration)) {
      generateParams.config.personGeneration = normalized.personGeneration;
    }

    if (referencePayload) {
      generateParams.image = referencePayload;
    }

    let initialOperation;
    try {
      initialOperation = await this.client.models.generateVideos(generateParams);
    } catch (err) {
      const safeErr = redactSensitiveData(err.message || err);
      this.logger.error(`Veo generation submission failed: ${safeErr}`);
      throw new Error(`Veo 3.1 API Error: ${safeErr}`);
    }

    if (!initialOperation) {
      throw new Error('Veo 3.1 returned empty response operation');
    }

    // Poll long-running operation
    const completedOperation = await this.pollOperation(initialOperation, options);

    // Extract video data
    const generatedVideos = completedOperation.response?.generatedVideos || [];
    if (generatedVideos.length === 0) {
      throw new Error('Veo 3.1 operation completed without any generated video output');
    }

    const videoObj = generatedVideos[0].video;
    const outputPath = path.join(normalized.outputDir, `${normalized.sceneId}_veo.mp4`);

    await this.downloadClip(videoObj, outputPath);

    const costUSD = Number((normalized.duration * this.costPerSec).toFixed(4));
    const result = {
      outputPath,
      duration: normalized.duration,
      aspectRatio: normalized.aspectRatio,
      resolution: normalized.resolution,
      provider: this.id,
      model: this.modelName,
      costUSD,
      operationId: completedOperation.name || initialOperation.name || 'unknown_op',
      generatedAt: new Date().toISOString()
    };

    this.trackUsage(result);
    return result;
  }

  /**
   * Polls long-running operation until done or timeout.
   */
  async pollOperation(operation, options = {}) {
    const startTime = Date.now();
    let currentOp = operation;
    const pollInterval = options.pollIntervalMs || this.pollIntervalMs;
    const timeout = options.timeoutMs || this.timeoutMs;

    this.logger.info(`Polling Veo operation ${currentOp.name || 'pending'} (Interval: ${pollInterval}ms, Timeout: ${timeout}ms)`);

    while (!currentOp.done) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Veo 3.1 video generation timed out after ${Math.round(timeout / 1000)}s for operation ${currentOp.name}`);
      }

      await this.sleep(pollInterval);

      try {
        if (typeof this.client.operations?.getVideosOperation === 'function') {
          currentOp = await this.client.operations.getVideosOperation({ operation: currentOp });
        } else if (typeof currentOp.poll === 'function') {
          currentOp = await currentOp.poll();
        } else {
          // If no operation polling interface exists on mock, check done property
          break;
        }
      } catch (err) {
        const safeErr = redactSensitiveData(err.message || err);
        this.logger.warn(`Temporary polling error on ${currentOp.name}: ${safeErr}. Retrying...`);
      }

      if (currentOp.error) {
        const safeErr = redactSensitiveData(currentOp.error.message || JSON.stringify(currentOp.error));
        throw new Error(`Veo operation failed with error: ${safeErr}`);
      }
    }

    return currentOp;
  }

  /**
   * Downloads video from URI or writes binary bytes to destination.
   */
  async downloadClip(videoData, outputPath) {
    if (!videoData) {
      throw new Error('Cannot download video: videoData is null or undefined');
    }

    const destDir = path.dirname(outputPath);
    if (!fs.existsSync(destDir)) {
      await fsp.mkdir(destDir, { recursive: true });
    }

    // Case 1: Video provided as raw videoBytes (base64 string or Buffer)
    if (videoData.videoBytes) {
      const buffer = Buffer.isBuffer(videoData.videoBytes)
        ? videoData.videoBytes
        : Buffer.from(videoData.videoBytes, 'base64');
      await fsp.writeFile(outputPath, buffer);
      this.logger.info(`Saved Veo video (${buffer.length} bytes) to ${outputPath}`);
      return outputPath;
    }

    // Case 2: Try SDK client.files.download if available
    if (this.client?.files?.download) {
      try {
        await this.client.files.download({
          file: videoData,
          downloadPath: outputPath
        });
        const stat = await fsp.stat(outputPath).catch(() => null);
        if (stat && stat.size > 0) {
          this.logger.info(`Successfully downloaded Veo clip via client.files.download (${stat.size} bytes) to ${outputPath}`);
          return outputPath;
        }
      } catch (err) {
        this.logger.warn(`client.files.download fallback: ${err.message}`);
      }
    }

    // Case 3: Video provided as URI
    let uri = videoData.uri || videoData.url || (typeof videoData === 'string' ? videoData : null);
    if (!uri) {
      throw new Error('Veo video output contains neither videoBytes nor valid downloadable URI');
    }

    if (this.apiKey && uri.includes('googleapis.com') && !uri.includes('key=')) {
      uri += (uri.includes('?') ? '&' : '?') + `key=${this.apiKey}`;
    }

    this.logger.info(`Downloading Veo video stream from ${redactSensitiveData(uri)}...`);
    const headers = {};
    if (this.apiKey) {
      headers['x-goog-api-key'] = this.apiKey;
    }
    const response = await axios.get(uri, {
      responseType: 'arraybuffer',
      timeout: 120000,
      headers
    });

    await fsp.writeFile(outputPath, Buffer.from(response.data));
    const stat = await fsp.stat(outputPath);
    if (stat.size === 0) {
      throw new Error(`Downloaded video file is empty at ${outputPath}`);
    }

    this.logger.info(`Successfully downloaded Veo clip (${stat.size} bytes) to ${outputPath}`);
    return outputPath;
  }

  /**
   * Tracks and records video generation usage.
   */
  trackUsage(metadata = {}) {
    const record = {
      timestamp: new Date().toISOString(),
      provider: this.id,
      model: this.modelName,
      durationSeconds: metadata.duration || 0,
      costUSD: metadata.costUSD || 0.0,
      operationId: metadata.operationId || 'op_na',
      outputPath: metadata.outputPath || ''
    };
    this.usageLog.push(record);
    return record;
  }

  /**
   * Returns copy of usage history.
   */
  getUsageHistory() {
    return [...this.usageLog];
  }
}

module.exports = {
  GoogleVeoProvider,
  DEFAULT_VEO_MODEL,
  MIN_CLIP_DURATION,
  MAX_CLIP_DURATION,
  ALLOWED_ASPECT_RATIOS
};
