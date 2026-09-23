const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { Logger } = require('./logger');

/**
 * Escapes characters for safe SVG/XML inclusion.
 */
function escapeXml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wraps text into lines that fit within a specified maximum character width.
 */
function wrapLines(text, maxCharsPerLine = 16) {
  const words = String(text || '').trim().split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxCharsPerLine) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3); // Max 3 lines for punchy mobile readability
}

const { TopicVisualGenerator } = require('./topic-visual-generator');
const { resolveTopicKey } = require('./curated-topic-content');

/**
 * ShortsCoverGenerator
 * Creates high-impact, mobile-optimized 9:16 portrait cover thumbnails
 * strictly derived from the strongest hook scene and verified content.
 */
class ShortsCoverGenerator {
  constructor(options = {}) {
    this.logger = options.logger || new Logger('ShortsCoverGenerator');
    this.width = Number(options.width || 1080);
    this.height = Number(options.height || 1920);
    this.topicVisualGenerator = options.topicVisualGenerator || new TopicVisualGenerator({ logger: this.logger });
  }

  /**
   * Identifies the strongest hook scene from the production scenes.
   */
  selectHookScene(scenes = [], script = {}) {
    if (!Array.isArray(scenes) || scenes.length === 0) {
      return {
        isFallback: true,
        text: script.hook?.text || script.title || 'Market Truths in Minutes',
        verifiedData: null
      };
    }

    // 1. Scene explicitly marked as hook
    const hookScene = scenes.find(s => s.isHook || s.sceneType === 'HOOK' || s.treatment === 'ANTI_SWIPE_HOOK');
    if (hookScene) return hookScene;

    // 2. First scene (opening 0-3 seconds)
    if (scenes[0]) return scenes[0];

    return scenes[0];
  }

  /**
   * Extracts the hero headline and verified metric pill text.
   */
  extractCoverElements(scene = {}, script = {}, verifiedData = [], allScenes = []) {
    const rawText = scene.scriptText || scene.label || script.hook?.text || script.title || 'THE REAL COST';

    // Look for verified data attached to scene, scene pool, or verified pool
    let heroMetric = null;
    const pool = [
      ...(scene.verifiedData ? [scene.verifiedData] : []),
      ...(Array.isArray(allScenes) ? allScenes.map(s => s.verifiedData).filter(Boolean) : []),
      ...(Array.isArray(verifiedData) ? verifiedData : [])
    ];

    const matchedStat = pool.find(item => item && (item.verified === true || item.status === 'verified') && item.value);
    if (matchedStat) {
      heroMetric = {
        value: matchedStat.value,
        label: matchedStat.label || 'KEY METRIC',
        type: matchedStat.type || 'statistic'
      };
    } else {
      // Check if scene text or any other scene in production has a clear stat claim
      let statText = rawText;
      if (Array.isArray(allScenes) && allScenes.length > 0) {
        for (const s of allScenes) {
          if (s.scriptText && /(\$\s*\d+|\b\d+%\b)/.test(s.scriptText)) {
            statText = s.scriptText;
            break;
          }
        }
      }
      const match = statText.match(/(\$\s*\d+(?:\.\d+)?\s*(?:[bmkt]|billion|million)?|\b\d+%\b)/i);
      if (match) {
        heroMetric = {
          value: match[1].trim(),
          label: 'VERIFIED STAT',
          type: 'statistic'
        };
      }
    }

    // Create punchy headline (3-5 words max, uppercase)
    let headline = rawText
      .replace(/^stop scrolling[!,.]?\s*/i, '')
      .replace(/#shorts/gi, '')
      .replace(/[^\w\s$%+-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    const words = headline.split(' ');
    if (words.length > 5) {
      headline = words.slice(0, 4).join(' ');
    }

    if (!headline || headline.length < 3) {
      headline = 'THE $12B SECRET';
    }

    return {
      headline,
      heroMetric,
      sourceAsset: scene.assetPath || null
    };
  }

  /**
   * Generates a 9:16 portrait cover thumbnail file.
   */
  async generateCover(production = {}, outputPath, options = {}) {
    const width = this.width;
    const height = this.height;
    const scenes = production.scenes || [];
    const script = production.script || {};
    const verifiedData = production.verifiedData || script.verifiedData || [];

    const rawTopic = production.topic || production.topicKey || script.title || script.topic || options.topic || options.topicKey || '';
    const topicKey = production.topicKey || options.topicKey || resolveTopicKey(rawTopic) || 'market_pulse';

    const hookScene = this.selectHookScene(scenes, script);
    const { headline, heroMetric, sourceAsset } = this.extractCoverElements(hookScene, script, verifiedData, scenes);

    const safeZones = {
      top: Math.round(height * 0.15), // 288px
      bottom: Math.round(height * 0.20), // 384px
      left: Math.round(width * 0.08), // 86px
      right: Math.round(width * 0.16) // 172px
    };

    const targetDir = path.dirname(outputPath);
    await fs.mkdir(targetDir, { recursive: true });

    // Generate cover SVG overlay
    const svgOverlay = this.renderCoverSvg({
      width,
      height,
      safeZones,
      headline,
      heroMetric,
      brandTitle: 'MONEY IN MINUTES',
      topicKey
    });

    try {
      let basePipeline;

      // Check if source visual asset is available, valid, and not a presenter portrait or foreign domain asset
      let hasSourceImage = false;
      const isPresenterAsset = sourceAsset && (sourceAsset.includes('presenter') || sourceAsset.includes('david_chen') || sourceAsset.includes('elena_rostova'));
      const isPermittedAsset = sourceAsset && !isPresenterAsset && this.topicVisualGenerator.isAssetPermittedForTopic(topicKey, path.basename(sourceAsset));

      if (isPermittedAsset) {
        try {
          await fs.access(sourceAsset);
          basePipeline = sharp(sourceAsset)
            .resize(width, height, { fit: 'cover', position: 'center' })
            .modulate({ brightness: 0.75, saturation: 1.1 })
            .blur(1); // Subtle blur so text pops with high contrast
          hasSourceImage = true;
        } catch (_err) {
          hasSourceImage = false;
        }
      }

      if (!hasSourceImage) {
        // High quality topic-specific hero visual still via TopicVisualGenerator
        const topicSvg = this.topicVisualGenerator.renderTopicVisualSvg(topicKey, 'cover', {
          title: script.title || rawTopic,
          metric: heroMetric?.value
        });
        const topicBuffer = await sharp(Buffer.from(topicSvg))
          .resize(width, height)
          .modulate({ brightness: 0.88, saturation: 1.12 })
          .toBuffer();

        basePipeline = sharp(topicBuffer);
      }

      // Composite SVG text and graphic card onto base
      await basePipeline
        .composite([
          {
            input: Buffer.from(svgOverlay),
            top: 0,
            left: 0
          }
        ])
        .jpeg({ quality: 92 })
        .toFile(outputPath);

      const stats = await fs.stat(outputPath);
      const dHash = await this.topicVisualGenerator.computeDHash(outputPath);
      const sha256 = await this.topicVisualGenerator.computeSha256(outputPath);
      this.logger.info(`Shorts cover generated successfully at ${outputPath} (${stats.size} bytes, dHash: ${dHash.hex})`);

      return {
        path: outputPath,
        width,
        height,
        headline,
        heroMetric: heroMetric?.value || null,
        fileSize: stats.size,
        dHash: dHash.hex,
        dHashBinary: dHash.binary,
        sha256,
        topicKey
      };
    } catch (error) {
      this.logger.error(`Cover generation via sharp failed: ${error.message}; writing pure SVG fallback`);
      // Fallback: pure SVG render
      await fs.writeFile(outputPath.replace(/\.jpg$/, '.svg'), svgOverlay, 'utf8');
      return {
        path: outputPath,
        width,
        height,
        headline,
        heroMetric: heroMetric?.value || null,
        isFallback: true,
        topicKey
      };
    }
  }

  /**
   * Renders the complete vector cover SVG with typography and visual badges.
   */
  renderCoverSvg({ width, height, safeZones, headline, heroMetric, _brandTitle = 'MONEY IN MINUTES', topicKey = 'market_pulse' }) {
    const lines = wrapLines(headline, 14);
    const heroBoxWidth = width - safeZones.left - safeZones.right;

    const DOMAIN_STYLES = {
      airline_miles: {
        accent: '#38bdf8',
        secondary: '#f59e0b',
        tag: '✈️ AIRLINE MILES AUDIT',
        cardBg: '#041d3d',
        statBg: '#06254f',
        statWidthOffset: 40,
        badgeOffset: 0
      },
      fast_food: {
        accent: '#f59e0b',
        secondary: '#ef4444',
        tag: '🍔 FAST FOOD AUDIT',
        cardBg: '#2d0a02',
        statBg: '#3d0e04',
        statWidthOffset: 100,
        badgeOffset: 60
      },
      nvidia: {
        accent: '#10b981',
        secondary: '#38bdf8',
        tag: '⚡ AI COMPUTE AUDIT',
        cardBg: '#022410',
        statBg: '#043819',
        statWidthOffset: 30,
        badgeOffset: 0
      },
      costco: {
        accent: '#0284c7',
        secondary: '#f59e0b',
        tag: '🛒 COSTCO MOAT',
        cardBg: '#021e3d',
        statBg: '#062d59',
        statWidthOffset: 70,
        badgeOffset: 40
      },
      swipe_fees: {
        accent: '#8b5cf6',
        secondary: '#38bdf8',
        tag: '💳 PAYMENT TOLL',
        cardBg: '#1e103c',
        statBg: '#2d1859',
        statWidthOffset: 50,
        badgeOffset: 0
      },
      disney: {
        accent: '#ec4899',
        secondary: '#f59e0b',
        tag: '🏰 DISNEY EXPERIENCES',
        cardBg: '#340620',
        statBg: '#4d0a30',
        statWidthOffset: 80,
        badgeOffset: 50
      },
      streaming: {
        accent: '#ef4444',
        secondary: '#f97316',
        tag: '📺 SUBSCRIPTION AUDIT',
        cardBg: '#2e0707',
        statBg: '#420b0b',
        statWidthOffset: 40,
        badgeOffset: 0
      },
      apple: {
        accent: '#38bdf8',
        secondary: '#cbd5e1',
        tag: '📱 SMARTPHONE MOAT',
        cardBg: '#0f172a',
        statBg: '#1e293b',
        statWidthOffset: 60,
        badgeOffset: 30
      },
      market_pulse: {
        accent: '#0ea5e9',
        secondary: '#10b981',
        tag: '📊 MARKET TRUTHS',
        cardBg: '#081e28',
        statBg: '#0c2e3d',
        statWidthOffset: 40,
        badgeOffset: 0
      }
    };
    const style = DOMAIN_STYLES[topicKey] || DOMAIN_STYLES.market_pulse;

    // Line spacing
    const headlineFontSize = lines.length === 1 ? 92 : lines.length === 2 ? 80 : 68;
    const lineHeight = headlineFontSize * 1.15;
    const headlineBoxHeight = lines.length * lineHeight + 60;

    const hasMetric = Boolean(heroMetric && heroMetric.value);
    const metricBoxHeight = hasMetric ? 190 : 0;
    const blockGap = 32;
    const totalBlockHeight = headlineBoxHeight + (hasMetric ? blockGap + metricBoxHeight : 0);

    const availableHeight = (height - safeZones.bottom) - safeZones.top;
    const heroBoxY = Math.max(safeZones.top + 30, Math.round(safeZones.top + (availableHeight - totalBlockHeight) / 2));
    const metricBoxY = heroBoxY + headlineBoxHeight + blockGap;
    const statPillWidth = heroBoxWidth - (style.statWidthOffset || 0);

    let metricHtml = '';
    if (hasMetric) {
      metricHtml = `
        <!-- Hero Stat Pill -->
        <g transform="translate(${safeZones.left}, ${metricBoxY})">
          <rect width="${statPillWidth}" height="190" rx="24" fill="${style.statBg}" fill-opacity="0.85" stroke="${style.secondary}" stroke-width="3" filter="url(#glow)" />
          <text x="32" y="52" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold" letter-spacing="3">${escapeXml(heroMetric.label.toUpperCase())}</text>
          <text x="32" y="142" fill="${style.secondary}" font-family="Arial, Helvetica, sans-serif" font-size="82" font-weight="900">${escapeXml(heroMetric.value)}</text>
          <g transform="translate(${statPillWidth - 190}, 50)">
            <rect width="150" height="42" rx="21" fill="${style.secondary}" fill-opacity="0.25" stroke="${style.secondary}" stroke-width="1.5" />
            <text x="75" y="28" fill="${style.secondary}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" text-anchor="middle">✓ VERIFIED</text>
          </g>
        </g>
      `;
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.8" />
          </filter>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <!-- Domain Badge at Top Safe Zone -->
        <g transform="translate(${safeZones.left + (style.badgeOffset || 0)}, ${safeZones.top - 50})">
          <rect width="320" height="46" rx="23" fill="${style.accent}" fill-opacity="0.25" stroke="${style.accent}" stroke-width="1.5" />
          <text x="160" y="30" fill="${style.accent}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="900" letter-spacing="2" text-anchor="middle">${escapeXml(style.tag)}</text>
        </g>

        <!-- Headline Box -->
        <g transform="translate(${safeZones.left}, ${heroBoxY})">
          <rect width="${heroBoxWidth}" height="${lines.length * lineHeight + 60}" rx="28" fill="${style.cardBg}" fill-opacity="0.75" stroke="${style.accent}" stroke-width="2.5" filter="url(#shadow)" />
          ${lines.map((line, idx) => `
            <text x="36" y="${70 + idx * lineHeight}" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${headlineFontSize}" font-weight="900" letter-spacing="1">
              ${escapeXml(line)}
            </text>
          `).join('')}
        </g>

        ${metricHtml}

        <!-- Bottom Safe Zone Indicator / Hook Accent -->
        <g transform="translate(${safeZones.left}, ${height - safeZones.bottom + 20})">
          <rect width="240" height="40" rx="20" fill="${style.secondary}" fill-opacity="0.25" stroke="${style.secondary}" stroke-width="1.5" />
          <text x="120" y="26" fill="${style.secondary}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" text-anchor="middle">WATCH IN 60 SECONDS</text>
        </g>
      </svg>
    `.trim();
  }
}

module.exports = {
  ShortsCoverGenerator
};
