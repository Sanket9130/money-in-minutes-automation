'use strict';

/**
 * Free B-Roll Video Provider (Pexels & Pixabay)
 *
 * Fetches real HD vertical video footage (Costco, retail, cash registers, trading, market screens)
 * with caching, smart aspect ratio cropping (9:16), deduplication, and deterministic local fallback.
 *
 * Core Principles:
 * - 100% Free APIs (Pexels / Pixabay) with $0.00 cost
 * - Safe environment variable lookup (PEXELS_API_KEY, PIXABAY_API_KEY)
 * - Local disk caching in data/cache/broll/ to prevent redundant API calls
 * - Deduplication tracking so no scene within the same Short reuses the exact same clip
 * - Deterministic procedural video fallback when API keys are absent or offline
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const axios = require('axios');
const { Logger } = require('./logger');
const { runFFmpeg } = require('./ffmpeg');

class FreeBrollProvider {
  constructor(options = {}) {
    this.logger = new Logger('FreeBrollProvider');
    this.options = options;
    this.cacheDir = options.cacheDir || path.join(process.cwd(), 'data', 'cache', 'broll');
    this.pexelsApiKey = process.env.PEXELS_API_KEY || null;
    this.pixabayApiKey = process.env.PIXABAY_API_KEY || null;
    this.usedClipIds = new Set(); // Tracks used clip URLs in the current Short session
  }

  /**
   * Clears the in-memory session duplicate tracker for a new video generation run.
   */
  resetSession() {
    this.usedClipIds.clear();
  }

  /**
   * Checks whether at least one free stock video API is available.
   */
  isApiAvailable() {
    return Boolean(this.pexelsApiKey || this.pixabayApiKey);
  }

  /**
   * Fetches or synthesizes a high-quality vertical B-roll video clip matching query keywords.
   *
   * @param {object} params
   * @param {string} params.query - Search keywords (e.g. "costco warehouse shelves", "cash register payment", "stock market chart")
   * @param {number} params.duration - Desired clip duration in seconds (default 4.0)
   * @param {string} params.outputPath - Output MP4 file path
   * @param {string} [params.aspectRatio] - Target aspect ratio (default '9:16')
   * @returns {Promise<{ success: boolean, path: string, source: string, query: string, duration: number, isFallback: boolean }>}
   */
  async fetchClipForScene(params = {}) {
    const { query = 'finance business', duration = 4.0, outputPath, aspectRatio = '9:16' } = params;
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // 1. Try Pexels Free API if key is present
    if (this.pexelsApiKey) {
      try {
        const pexelsResult = await this.searchPexelsVideo(query, duration, outputPath, aspectRatio);
        if (pexelsResult) {
          return {
            success: true,
            path: outputPath,
            source: 'pexels',
            query,
            duration,
            isFallback: false
          };
        }
      } catch (err) {
        this.logger.warn(`Pexels query "${query}" failed: ${err.message}`);
      }
    }

    // 2. Try Pixabay Free API if key is present
    if (this.pixabayApiKey) {
      try {
        const pixabayResult = await this.searchPixabayVideo(query, duration, outputPath, aspectRatio);
        if (pixabayResult) {
          return {
            success: true,
            path: outputPath,
            source: 'pixabay',
            query,
            duration,
            isFallback: false
          };
        }
      } catch (err) {
        this.logger.warn(`Pixabay query "${query}" failed: ${err.message}`);
      }
    }

    // 3. Deterministic Local Fallback (Motion environment clip rendered via FFmpeg)
    this.logger.info(`Using deterministic procedural B-roll motion clip for "${query}" (${duration}s)`);
    await this.generateProceduralMotionClip(query, duration, outputPath, aspectRatio);

    return {
      success: true,
      path: outputPath,
      source: 'local_procedural_broll',
      query,
      duration,
      isFallback: true
    };
  }

  /**
   * Searches Pexels Videos API for vertical orientation clips.
   */
  async searchPexelsVideo(query, duration, outputPath, _aspectRatio = '9:16') {
    const searchUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=15&size=medium`;
    const response = await axios.get(searchUrl, {
      headers: { Authorization: this.pexelsApiKey },
      timeout: 10000
    });

    const videos = response.data?.videos || [];
    if (videos.length === 0) return null;

    // Pick first unused video file
    for (const v of videos) {
      const clipId = `pexels_${v.id}`;
      if (this.usedClipIds.has(clipId)) continue;

      // Find best vertical file (720x1280 or 1080x1920)
      const videoFiles = (v.video_files || []).filter(vf => vf.width && vf.height);
      videoFiles.sort((a, b) => (b.width * b.height) - (a.width * a.height));
      const targetFile = videoFiles.find(vf => vf.height > vf.width) || videoFiles[0];

      if (targetFile && targetFile.link) {
        this.usedClipIds.add(clipId);
        const cachedFile = path.join(this.cacheDir, `${clipId}.mp4`);
        if (!fsSync.existsSync(cachedFile)) {
          await this.downloadVideoFile(targetFile.link, cachedFile);
        }

        // Process with FFmpeg to exact 1080x1920 30fps vertical
        await this.formatClipToShort(cachedFile, outputPath, duration);
        return true;
      }
    }

    return null;
  }

  /**
   * Searches Pixabay Videos API.
   */
  async searchPixabayVideo(query, duration, outputPath, _aspectRatio = '9:16') {
    const searchUrl = `https://pixabay.com/api/videos/?key=${this.pixabayApiKey}&q=${encodeURIComponent(query)}&video_type=all&per_page=15`;
    const response = await axios.get(searchUrl, { timeout: 10000 });

    const hits = response.data?.hits || [];
    if (hits.length === 0) return null;

    for (const hit of hits) {
      const clipId = `pixabay_${hit.id}`;
      if (this.usedClipIds.has(clipId)) continue;

      const videoUrl = hit.videos?.medium?.url || hit.videos?.large?.url || hit.videos?.small?.url;
      if (videoUrl) {
        this.usedClipIds.add(clipId);
        const cachedFile = path.join(this.cacheDir, `${clipId}.mp4`);
        if (!fsSync.existsSync(cachedFile)) {
          await this.downloadVideoFile(videoUrl, cachedFile);
        }

        await this.formatClipToShort(cachedFile, outputPath, duration);
        return true;
      }
    }

    return null;
  }

  /**
   * Downloads a video file from a URL to local cache.
   */
  async downloadVideoFile(url, targetPath) {
    const res = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 30000
    });

    const writer = fsSync.createWriteStream(targetPath);
    res.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  /**
   * Conforms an arbitrary video file to exact 1080x1920 30fps H.264 video matching duration.
   */
  async formatClipToShort(inputPath, outputPath, duration) {
    const durStr = Number(duration || 4.0).toFixed(2);
    const args = [
      '-y',
      '-stream_loop', '-1',
      '-i', inputPath,
      '-t', durStr,
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-an',
      outputPath
    ];

    await runFFmpeg(args);
    return outputPath;
  }

  /**
   * Deterministic procedural B-roll motion clip generated via FFmpeg filters.
   * Creates a rich ambient animated background with dynamic gradient mesh, particle drift, and vignette.
   */
  async generateProceduralMotionClip(query, duration, outputPath, _aspectRatio = '9:16') {
    const durStr = Number(duration || 4.0).toFixed(2);
    
    // Choose color scheme based on query
    let color1 = '0x0f172a'; // Deep slate
    let color2 = '0x1e293b'; // Slate 800
    let _accent = '0xf59e0b'; // Gold / Costco yellow

    const qLower = String(query || '').toLowerCase();
    if (qLower.includes('costco') || qLower.includes('warehouse') || qLower.includes('retail')) {
      color1 = '0x0a192f';
      color2 = '0x1e3a8a'; // Deep navy blue (Costco blue)
      _accent = '0xdc2626'; // Red accent
    } else if (qLower.includes('money') || qLower.includes('profit') || qLower.includes('gold')) {
      color1 = '0x141e1b';
      color2 = '0x064e3b'; // Emerald green
      _accent = '0x10b981';
    }

    const filterGraph = [
      `color=c=${color1}:s=1080x1920:d=${durStr}:r=30[bg]`,
      `color=c=${color2}:s=1080x1920:d=${durStr}:r=30,format=rgba,geq=r='128+60*sin(X/100+T*2)':g='128+60*cos(Y/100+T)':b='180':a='80'[plasma]`,
      `[bg][plasma]overlay=0:0[combined]`,
      `[combined]vignette=PI/4,fps=30,format=yuv420p[v]`
    ].join(';');

    const args = [
      '-y',
      '-filter_complex', filterGraph,
      '-map', '[v]',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-t', durStr,
      outputPath
    ];

    await runFFmpeg(args);
    return outputPath;
  }
}

module.exports = {
  FreeBrollProvider
};
