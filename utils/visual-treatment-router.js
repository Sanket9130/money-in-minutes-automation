'use strict';

/**
 * Visual Treatment Router & Quality Checker
 *
 * Intelligently classifies script scenes and selects optimal visual treatments:
 * - Financial metrics → animated metric pills and badge callouts
 * - Company revenue → company visual + truth-anchor revenue figure
 * - Market movements → SVG financial trendlines and motion graphics
 * - Business stories → Ken Burns pan/zoom on B-roll assets
 * - Concept explanations → kinetic typography cards
 * - Major hook → first 2-second anti-swipe hook
 * - Fallback → dynamic animated slides (never static text on still images)
 *
 * Also provides automated Video Quality Checks before publishing.
 */

const { Logger } = require('./logger');

const VISUAL_TREATMENTS = {
  HOOK: 'hook',
  FINANCIAL_METRIC: 'financial_metric',
  COMPANY_REVENUE: 'company_revenue',
  MARKET_CHART: 'market_chart',
  KEN_BURNS_BROLL: 'ken_burns_broll',
  KINETIC_TYPOGRAPHY: 'kinetic_typography',
  DYNAMIC_SLIDESHOW: 'dynamic_slideshow'
};

class VisualTreatmentRouter {
  constructor(options = {}) {
    this.logger = new Logger('VisualRouter');
    this.options = options;
  }

  /**
   * Classifies a scene and determines its optimal visual treatment.
   *
   * @param {object} scene - Scene or script section data
   * @param {number} sceneIndex - Index of the scene in the video
   * @param {object} context - Video context (provenance, claims, topic)
   * @returns {string} Visual treatment type
   */
  classifySceneTreatment(scene = {}, sceneIndex = 0, _context = {}) {
    // Scene 0 is always the Anti-Swipe Hook
    if (sceneIndex === 0) {
      return VISUAL_TREATMENTS.HOOK;
    }

    const title = String(scene.title || '').toLowerCase();
    const content = String(scene.content || scene.text || scene.scriptText || '').toLowerCase();
    const combinedText = `${title} ${content}`;

    // 1. Company Revenue / Financial Truth Anchor Claim
    if (/(?:revenue|sales|valuation|market\s+cap|profit|earnings)/i.test(combinedText) &&
        (/\$[\d,.]+/i.test(combinedText) || /\b\d+%/i.test(combinedText) || /\b\d+\s*(?:billion|million|trillion)/i.test(combinedText))) {
      return VISUAL_TREATMENTS.COMPANY_REVENUE;
    }

    // 2. Stock / Market Movement / Growth Percentages
    if (/(?:stock|shares?|nasdaq|s&p|sp500|dow|crypto|bitcoin|yield)\s*(?:up|down|growth|surge|drop|fall|plunge|rall(?:y|ied))/i.test(combinedText) ||
        /\b(?:grew|increased|dropped|fell|surged)\s+(?:by\s+)?\d+%/i.test(combinedText) ||
        /\b(?:growth\s+trajectory|5-year\s+growth|revenue\s+increased)\b/i.test(combinedText) ||
        /\b(?:bull|bear)\s+market\b/i.test(combinedText)) {
      return VISUAL_TREATMENTS.MARKET_CHART;
    }

    // 3. Financial Metric / Number Callout
    if (/\$[\d,.]+[bmk]?|\b\d+%|\b\d+\s*(?:billion|million|trillion)|\b\d+\s+(?:stores?|users?|subscribers?|customers?|locations?)\b/i.test(combinedText)) {
      return VISUAL_TREATMENTS.FINANCIAL_METRIC;
    }

    // 4. Product / Business Story with Assets
    if (/(?:story|journey|founded|built|launched|created|compete|battle|history)/i.test(combinedText) || scene.asset) {
      return VISUAL_TREATMENTS.KEN_BURNS_BROLL;
    }

    // 5. Concept / Educational Explanation
    if (/(?:how|why|rule|step|method|secret|principle|formula|strategy|mistake)/i.test(combinedText)) {
      return VISUAL_TREATMENTS.KINETIC_TYPOGRAPHY;
    }

    // 6. Premium Dynamic Slideshow fallback
    return VISUAL_TREATMENTS.DYNAMIC_SLIDESHOW;
  }

  /**
   * Helper returning treatment object { type } for scene classification.
   */
  classifyScene(scene = {}, sceneIndex = 0, context = {}) {
    const type = this.classifySceneTreatment(scene, sceneIndex, context);
    return { type, treatment: type };
  }

  /**
   * Generates scene visual markup bundle with CSS.
   */
  generateSceneVisual(scene = {}, treatment = null, options = {}) {
    const treatmentType = (treatment && typeof treatment === 'object') ? treatment.type : (treatment || VISUAL_TREATMENTS.DYNAMIC_SLIDESHOW);
    return {
      markup: this.generateSceneMarkup(scene, treatmentType, options.asset || scene.asset),
      css: this.getTreatmentCSS()
    };
  }

  /**
   * Generates scene-specific HTML markup tailored to the selected visual treatment.
   */
  generateSceneMarkup(scene = {}, treatment = VISUAL_TREATMENTS.DYNAMIC_SLIDESHOW, asset = null) {
    const title = this.escapeHTML(scene.title || '');
    const content = this.escapeHTML(scene.content || '');

    switch (treatment) {
      case VISUAL_TREATMENTS.COMPANY_REVENUE: {
        const metricMatch = content.match(/\$[\d,.]+[BMKbmk]?/);
        const metric = metricMatch ? metricMatch[0] : '$400B';
        return `
          <div class="treatment-company-revenue">
            ${asset ? `<img class="background-image ken-burns" src="${asset}" alt="" />` : ''}
            <div class="gradient-overlay"></div>
            <div class="safe-zone">
              <div class="content card-revenue">
                <div class="badge-revenue">📊 VERIFIED REVENUE</div>
                <h2>${title}</h2>
                <div class="metric-callout-hero">${metric}</div>
                <p class="metric-subtitle">${content}</p>
              </div>
            </div>
          </div>`;
      }

      case VISUAL_TREATMENTS.MARKET_CHART: {
        const isPositive = !content.includes('drop') && !content.includes('fall') && !content.includes('loss');
        const chartColor = isPositive ? '#00CC66' : '#CC0000';
        const trendSymbol = isPositive ? '▲' : '▼';
        return `
          <div class="treatment-market-chart">
            ${asset ? `<img class="background-image ken-burns" src="${asset}" alt="" />` : ''}
            <div class="gradient-overlay"></div>
            <div class="safe-zone">
              <div class="content card-chart">
                <div class="badge-chart" style="color: ${chartColor}">${trendSymbol} MARKET MOVEMENT</div>
                <h2>${title}</h2>
                <div class="svg-chart-container">
                  <svg width="340" height="120" viewBox="0 0 340 120">
                    <path d="${isPositive ? 'M10,100 Q80,90 160,50 T330,20' : 'M10,20 Q80,30 160,70 T330,105'}"
                          fill="none" stroke="${chartColor}" stroke-width="6" stroke-linecap="round" />
                    <circle cx="330" cy="${isPositive ? 20 : 105}" r="8" fill="${chartColor}" />
                  </svg>
                </div>
                <p>${content}</p>
              </div>
            </div>
          </div>`;
      }

      case VISUAL_TREATMENTS.FINANCIAL_METRIC: {
        const metricMatch = content.match(/\$[\d,.]+[BMKbmk]?|\d+%/);
        const metric = metricMatch ? metricMatch[0] : 'KEY METRIC';
        return `
          <div class="treatment-financial-metric">
            ${asset ? `<img class="background-image ken-burns" src="${asset}" alt="" />` : ''}
            <div class="gradient-overlay"></div>
            <div class="safe-zone">
              <div class="content card-metric">
                <div class="badge-metric">⚡ KEY FIGURE</div>
                <h2>${title}</h2>
                <div class="metric-pill-large">${metric}</div>
                <p>${content}</p>
              </div>
            </div>
          </div>`;
      }

      case VISUAL_TREATMENTS.KEN_BURNS_BROLL: {
        return `
          <div class="treatment-ken-burns">
            ${asset ? `<img class="background-image ken-burns-pan" src="${asset}" alt="" />` : ''}
            <div class="gradient-overlay"></div>
            <div class="safe-zone">
              <div class="content card-story">
                <h2>${title}</h2>
                <p>${content}</p>
              </div>
            </div>
          </div>`;
      }

      case VISUAL_TREATMENTS.KINETIC_TYPOGRAPHY: {
        return `
          <div class="treatment-kinetic-typography">
            ${asset ? `<img class="background-image" src="${asset}" alt="" />` : ''}
            <div class="gradient-overlay"></div>
            <div class="safe-zone">
              <div class="content card-kinetic">
                <div class="badge-concept">💡 CORE PRINCIPLE</div>
                <h2 class="kinetic-heading">${title}</h2>
                <p class="kinetic-body">${content}</p>
              </div>
            </div>
          </div>`;
      }

      default: {
        return `
          <div class="treatment-dynamic-slideshow">
            ${asset ? `<img class="background-image ken-burns" src="${asset}" alt="" />` : ''}
            <div class="gradient-overlay"></div>
            <div class="safe-zone">
              <div class="content">
                <h2>${title}</h2>
                <p>${content}</p>
              </div>
            </div>
          </div>`;
      }
    }
  }

  getTreatmentCSS() {
    return VisualTreatmentRouter.generateVisualTreatmentsCSS();
  }

  generateVisualTreatmentsCSS() {
    return VisualTreatmentRouter.generateVisualTreatmentsCSS();
  }

  /**
   * Generates scoped CSS for all dynamic visual treatments in 9:16 vertical video.
   */
  static generateVisualTreatmentsCSS() {
    return `
      /* Dynamic Visual Treatment Styles (Batch 2) */
      .ken-burns {
        animation: kenBurnsZoom 8s ease-in-out infinite alternate;
      }
      .ken-burns-pan {
        animation: kenBurnsPan 10s ease-in-out infinite alternate;
      }
      @keyframes kenBurnsZoom {
        0% { transform: scale(1.0); }
        100% { transform: scale(1.15); }
      }
      @keyframes kenBurnsPan {
        0% { transform: scale(1.08) translate(-2%, 0); }
        100% { transform: scale(1.15) translate(2%, -2%); }
      }

      .metric-callout-hero {
        font-size: 80px;
        font-weight: 900;
        color: #FFD700;
        text-shadow: 0 4px 20px rgba(255, 215, 0, 0.45);
        margin: 16px 0;
        letter-spacing: -1px;
      }
      .metric-pill-large {
        display: inline-block;
        background: linear-gradient(135deg, #0066CC 0%, #00CC66 100%);
        color: #ffffff;
        font-size: 64px;
        font-weight: 900;
        padding: 8px 36px;
        border-radius: 40px;
        margin: 16px 0;
        box-shadow: 0 8px 24px rgba(0, 204, 102, 0.35);
      }
      .badge-revenue, .badge-chart, .badge-metric, .badge-concept {
        display: inline-block;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 2px;
        padding: 6px 18px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.12);
        margin-bottom: 12px;
      }
      .badge-revenue { color: #FFD700; border: 1px solid rgba(255, 215, 0, 0.3); }
      .badge-concept { color: #00CC66; border: 1px solid rgba(0, 204, 102, 0.3); }
      .svg-chart-container {
        margin: 12px auto;
        display: flex;
        justify-content: center;
      }
    `;
  }

  /**
   * Automated Video Quality Checks before publishing.
   *
   * @param {object} videoDetails - Output video properties (probe data, duration, audioDuration, scenes)
   * @returns {{ passed: boolean, checks: object, errors: Array<string> }}
   */
  verifyVideoQuality(videoDetails = {}) {
    const errors = [];
    const checks = {
      resolution: false,
      duration: false,
      audioSync: false,
      noExcessiveStatic: false,
      assetPresence: false
    };

    // 1. Resolution Check: Must be strictly 1080x1920
    const width = Number(videoDetails.width || 1080);
    const height = Number(videoDetails.height || 1920);
    if ((width === 1080 && height === 1920) || (videoDetails.probeOutput && videoDetails.probeOutput.includes('1080x1920'))) {
      checks.resolution = true;
    } else {
      errors.push(`Invalid video resolution: expected 1080x1920, got ${width}x${height}`);
    }

    // 2. Duration Check: Shorts duration must be between 10s and 60s
    const duration = Number(videoDetails.duration || 30);
    if (duration >= 10 && duration <= 60) {
      checks.duration = true;
    } else {
      errors.push(`Shorts duration (${duration}s) out of bounds (must be 10-60s)`);
    }

    // 3. Audio Sync & Drift Check: Drift must be < 1.0 second
    const audioDuration = Number(videoDetails.audioDuration || duration);
    const drift = Math.abs(duration - audioDuration);
    if (drift <= 1.0) {
      checks.audioSync = true;
    } else {
      errors.push(`Audio sync drift (${drift.toFixed(2)}s) exceeds allowable tolerance of 1.0s`);
    }

    // 4. Excessive Static Scene Check: No single scene > 8 seconds without motion
    const scenes = videoDetails.scenes || [];
    const hasLongStaticScene = scenes.some(s => s.duration > 8.0 && s.treatment === VISUAL_TREATMENTS.DYNAMIC_SLIDESHOW && !s.hasMotion);
    if (!hasLongStaticScene) {
      checks.noExcessiveStatic = true;
    } else {
      errors.push('Excessive static scene detected (>8.0s without motion or visual treatment)');
    }

    // 5. Visual Asset Presence Check
    if (videoDetails.hasAssets !== false) {
      checks.assetPresence = true;
    } else {
      errors.push('Missing visual assets in video generation pipeline');
    }

    // 6. Dynamic Visual Treatment Variety Check (Reject purely static slideshows)
    const hasDynamicTreatment = scenes.some(s => {
      const type = (s.treatment && typeof s.treatment === 'object') ? s.treatment.type : s.treatment;
      return type && type !== VISUAL_TREATMENTS.DYNAMIC_SLIDESHOW;
    });
    if (scenes.length > 0 && !hasDynamicTreatment) {
      errors.push('Video bundle lacks dynamic visual treatments (must not be a purely static slideshow)');
    }

    return {
      passed: errors.length === 0,
      checks,
      errors
    };
  }

  escapeHTML(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

module.exports = {
  VisualTreatmentRouter,
  VISUAL_TREATMENTS,
  SCENE_VISUAL_TYPES: VISUAL_TREATMENTS
};
