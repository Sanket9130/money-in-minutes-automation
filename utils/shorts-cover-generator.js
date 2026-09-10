'use strict';

/**
 * Shorts Cover & Thumbnail Generator
 *
 * Generates high-contrast, professional 1080x1920 portrait cover assets and
 * 1280x720 YouTube thumbnails using Sharp. Maintains consistent Money In Minutes
 * branding, bold mobile-readable typography, and clean metric callouts without
 * fabricated screenshots or spam graphics.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { Logger } = require('./logger');

class ShortsCoverGenerator {
  constructor(options = {}) {
    this.logger = new Logger('ShortsCover');
    this.outputDir = options.outputDir || path.join(__dirname, '..', 'uploads', 'thumbnails');
    this.brandName = options.brandName || 'MONEY IN MINUTES';
  }

  async ensureOutputDir() {
    await fs.mkdir(this.outputDir, { recursive: true });
  }

  /**
   * Generates both a 1080x1920 portrait cover and a 1280x720 landscape thumbnail.
   *
   * @param {object} script - Video script with title, hook, and metadata
   * @param {object} options - Customization options (colors, badge, metricText)
   * @returns {Promise<{ cover: object, thumbnail: object }>}
   */
  async generatePackagingAssets(script = {}, options = {}) {
    await this.ensureOutputDir();

    const title = script.title || options.title || 'Financial Breakdown';
    const headline = this.extractHeadline(title, options.headline);
    const metricText = options.metricText || this.extractMetricPill(title, script);
    const id = `cover_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // 1. Generate 1080x1920 Portrait Cover
    const coverPath = path.join(this.outputDir, `${id}_portrait_1080x1920.jpg`);
    await this.renderCoverSVG({
      width: 1080,
      height: 1920,
      headline,
      metricText,
      brandName: this.brandName,
      outputPath: coverPath,
      aspectRatio: '9:16'
    });

    // 2. Generate 1280x720 Landscape Thumbnail (for YouTube API & desktop viewers)
    const thumbnailPath = path.join(this.outputDir, `${id}_thumb_1280x720.jpg`);
    await this.renderCoverSVG({
      width: 1280,
      height: 720,
      headline,
      metricText,
      brandName: this.brandName,
      outputPath: thumbnailPath,
      aspectRatio: '16:9'
    });

    const coverStats = await fs.stat(coverPath);
    const thumbStats = await fs.stat(thumbnailPath);

    return {
      cover: {
        path: coverPath,
        dimensions: { width: 1080, height: 1920 },
        aspectRatio: '9:16',
        fileSize: coverStats.size
      },
      thumbnail: {
        path: thumbnailPath,
        dimensions: { width: 1280, height: 720 },
        aspectRatio: '16:9',
        fileSize: thumbStats.size
      }
    };
  }

  /**
   * Generates a single 1080x1920 portrait cover asset.
   */
  async generatePortraitCover(script = {}, options = {}) {
    const assets = await this.generatePackagingAssets(script, options);
    return {
      filePath: assets.cover.path,
      path: assets.cover.path,
      width: assets.cover.dimensions.width,
      height: assets.cover.dimensions.height,
      dimensions: assets.cover.dimensions
    };
  }

  /**
   * Generates a single 1280x720 landscape thumbnail asset.
   */
  async generateLandscapeThumbnail(script = {}, options = {}) {
    const assets = await this.generatePackagingAssets(script, options);
    return {
      filePath: assets.thumbnail.path,
      path: assets.thumbnail.path,
      width: assets.thumbnail.dimensions.width,
      height: assets.thumbnail.dimensions.height,
      dimensions: assets.thumbnail.dimensions
    };
  }

  /**
   * Extracts punchy 3-5 word headline for bold cover presentation.
   */
  extractHeadline(title = '', override = null) {
    if (override) return String(override).trim();
    const clean = title.replace(/\b(how|why|the|a|an|in|to)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    const words = clean.split(' ');
    return words.slice(0, 5).join(' ').toUpperCase();
  }

  /**
   * Extracts or formats a prominent metric pill for financial covers.
   */
  extractMetricPill(title = '', script = {}) {
    const text = `${title} ${script.hook?.text || ''}`;
    const dollarMatch = text.match(/\$[\d,.]+[BMKbmk]?/);
    if (dollarMatch) return dollarMatch[0];

    const percentMatch = text.match(/\d+%/);
    if (percentMatch) return percentMatch[0];

    return '60-SEC BREAKDOWN';
  }

  /**
   * Renders SVG layout and converts to high-quality JPEG using Sharp.
   */
  async renderCoverSVG(params = {}) {
    const { width, height, headline, metricText, brandName, outputPath, aspectRatio } = params;
    const isVertical = aspectRatio === '9:16';

    const brandY = isVertical ? 380 : 120;
    const headlineY = isVertical ? 720 : 320;
    const metricY = isVertical ? 960 : 440;
    const ctaY = isVertical ? 1120 : 540;

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0a0e17" />
            <stop offset="50%" stop-color="#141c2e" />
            <stop offset="100%" stop-color="#0d131f" />
          </linearGradient>
          <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#FFD700" />
            <stop offset="100%" stop-color="#FFA500" />
          </linearGradient>
          <linearGradient id="pillGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#0066CC" />
            <stop offset="100%" stop-color="#00CC66" />
          </linearGradient>
        </defs>

        <!-- Background -->
        <rect width="${width}" height="${height}" fill="url(#bg)" />

        <!-- Subtle Geometric Accents -->
        <circle cx="${width * 0.85}" cy="${height * 0.2}" r="${width * 0.35}" fill="#0066CC" opacity="0.12" filter="blur(40px)" />
        <circle cx="${width * 0.15}" cy="${height * 0.8}" r="${width * 0.4}" fill="#00CC66" opacity="0.10" filter="blur(50px)" />

        <!-- Brand Badge -->
        <g transform="translate(${width / 2}, ${brandY})">
          <rect x="-140" y="-24" width="280" height="48" rx="24" fill="rgba(255,255,255,0.10)" stroke="rgba(255,215,0,0.4)" stroke-width="1.5" />
          <text text-anchor="middle" y="7" fill="#FFD700" font-family="-apple-system, Arial, sans-serif" font-weight="900" font-size="${isVertical ? 20 : 16}" letter-spacing="2">
            ${this.escapeXML(brandName)}
          </text>
        </g>

        <!-- Main Punchy Headline -->
        <text x="${width / 2}" y="${headlineY}" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system, Arial, sans-serif" font-weight="900" font-size="${isVertical ? 72 : 56}" letter-spacing="-1">
          ${this.escapeXML(headline)}
        </text>

        <!-- Metric Pill Callout -->
        <g transform="translate(${width / 2}, ${metricY})">
          <rect x="-160" y="-36" width="320" height="72" rx="36" fill="url(#pillGrad)" />
          <text text-anchor="middle" y="12" fill="#FFFFFF" font-family="-apple-system, Arial, sans-serif" font-weight="900" font-size="${isVertical ? 38 : 32}" letter-spacing="1">
            ${this.escapeXML(metricText)}
          </text>
        </g>

        <!-- Subtext / Safe-Zone Callout -->
        <text x="${width / 2}" y="${ctaY}" text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="-apple-system, Arial, sans-serif" font-weight="700" font-size="${isVertical ? 28 : 22}">
          WATCH NOW • FULL BREAKDOWN
        </text>
      </svg>
    `;

    await sharp(Buffer.from(svg))
      .jpeg({ quality: 92, progressive: true })
      .toFile(outputPath);
  }

  escapeXML(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

module.exports = {
  ShortsCoverGenerator
};
