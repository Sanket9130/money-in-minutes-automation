const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { runFFmpeg, checkFFmpeg, ffmpegInstallHint } = require('./ffmpeg');
const { Logger } = require('./logger');
const {
  VISUALIZATION_TYPES,
  FALLBACK_REASONS,
  NumberFormatter,
  VisualizationSpec,
  FinancialVisualization,
  VisualizationRenderer
} = require('./financial-visualization-engine');
const {
  AudioMixSpec,
  VoiceProcessor,
  MusicDucker,
  SfxScheduler,
  AudioValidation,
  AudioEnhancementEngine
} = require('./audio-enhancement-engine');

const SCENE_TYPES = Object.freeze({
  HOOK: 'HOOK',
  STATISTIC: 'STATISTIC',
  GROWTH: 'GROWTH',
  COMPARISON: 'COMPARISON',
  BUSINESS_FACT: 'BUSINESS_FACT',
  GENERAL_INFORMATION: 'GENERAL_INFORMATION',
  RANKING: 'RANKING',
  TREND: 'TREND',
  PERCENTAGE: 'PERCENTAGE',
  NUMERICAL_CHANGE: 'NUMERICAL_CHANGE'
});

const TREATMENTS = Object.freeze({
  ANTI_SWIPE_HOOK: 'ANTI_SWIPE_HOOK',
  ANIMATED_NUMBER: 'ANIMATED_NUMBER',
  ANIMATED_PERCENTAGE: 'ANIMATED_PERCENTAGE',
  TWO_SIDED_COMPARISON: 'TWO_SIDED_COMPARISON',
  BUSINESS_FACT_CALLOUT: 'BUSINESS_FACT_CALLOUT',
  SUBTLE_MOTION: 'SUBTLE_MOTION',
  RANKING_LEADERBOARD: 'RANKING_LEADERBOARD',
  TREND_TRAJECTORY: 'TREND_TRAJECTORY',
  PERCENTAGE_GAUGE: 'PERCENTAGE_GAUGE',
  NUMERICAL_DELTA: 'NUMERICAL_DELTA'
});

const MOTIONS = Object.freeze({
  PUNCH_ZOOM: 'PUNCH_ZOOM',
  EMPHASIS_ZOOM: 'EMPHASIS_ZOOM',
  DIRECTIONAL_PAN: 'DIRECTIONAL_PAN',
  CONTROLLED_ENTRANCE: 'CONTROLLED_ENTRANCE',
  KEN_BURNS: 'KEN_BURNS',
  SLOW_PAN: 'SLOW_PAN',
  ZOOM_OUT: 'ZOOM_OUT',
  PARALLAX_FLOAT: 'PARALLAX_FLOAT'
});

const ASPECT_RATIOS = Object.freeze({
  PORTRAIT: '9:16',
  LANDSCAPE: '16:9'
});

const DIMENSIONS = Object.freeze({
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 }
});

const SAFE_ZONES = Object.freeze({
  '9:16': {
    top: 288, // 15%
    bottom: 384, // 20%
    left: 80,
    right: 160, // 15% for right action bar
    subtitleMarginV: 220
  },
  '16:9': {
    top: 108, // 10%
    bottom: 108, // 10%
    left: 192,
    right: 192,
    subtitleMarginV: 80
  }
});

/**
 * Escapes text for XML/SVG inclusion.
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
 * Normalizes text to assist in keyword and numeric matching.
 */
function normalizeText(text = '') {
  return String(text || '').trim().toLowerCase();
}

/**
 * Extracts and verifies numerical and factual data against Truth-Anchor inputs.
 * Never invents numbers: if verification fails, verified is returned as false.
 */
function extractVerifiedData(scene = {}, verifiedContext = {}) {
  // If scene has its own explicitly verified structured verifiedData object, honor it directly
  if (scene.verifiedData && typeof scene.verifiedData === 'object' && (scene.verifiedData.verified === true || scene.verifiedData.status === 'verified')) {
    if (scene.verifiedData.type) {
      return {
        ...scene.verifiedData,
        verified: true,
        source: scene.verifiedData.source || 'Truth-Anchor'
      };
    }
  }

  const text = scene.scriptText || scene.text || scene.content || scene.label || '';
  const candidates = [];

  // Check scene's own verifiedData
  if (scene.verifiedData && typeof scene.verifiedData === 'object') {
    candidates.push(scene.verifiedData);
  }

  // Check verifiedContext objects
  if (verifiedContext.verifiedData) {
    if (Array.isArray(verifiedContext.verifiedData)) candidates.push(...verifiedContext.verifiedData);
    else if (typeof verifiedContext.verifiedData === 'object') candidates.push(verifiedContext.verifiedData);
  }

  if (Array.isArray(verifiedContext.facts)) {
    candidates.push(...verifiedContext.facts);
  }

  if (Array.isArray(verifiedContext.truthAnchor)) {
    candidates.push(...verifiedContext.truthAnchor);
  } else if (verifiedContext.truthAnchor && typeof verifiedContext.truthAnchor === 'object') {
    candidates.push(verifiedContext.truthAnchor);
  }

  if (Array.isArray(verifiedContext.claims)) {
    candidates.push(...verifiedContext.claims);
  }

  // Filter candidates that are explicitly marked verified or have verified sources
  const verifiedPool = candidates.filter(item => {
    if (!item || typeof item !== 'object') return false;
    if (item.verified === true) return true;
    if (item.status === 'verified') return true;
    if (Array.isArray(item.sourceUrls) && item.sourceUrls.length > 0) return true;
    if (item.source && String(item.source).trim().length > 0) return true;
    return false;
  });

  const normalizedScene = normalizeText(text);

  // 1. Check for growth percentage (e.g., 42%, +15%, -8%)
  const percentMatch = text.match(/([+-]?\d+(?:\.\d+)?%)/);
  if (percentMatch) {
    const rawVal = percentMatch[1];
    const match = verifiedPool.find(item => {
      const itemVal = String(item.value || item.growthRate || item.text || '');
      return itemVal.includes(rawVal) || (item.metric && normalizedScene.includes(normalizeText(item.metric)));
    });

    if (match) {
      const numVal = parseFloat(rawVal.replace(/[%+]/g, ''));
      const direction = match.direction || (numVal >= 0 ? 'up' : 'down');
      return {
        verified: true,
        type: 'growth',
        value: rawVal,
        growthRate: numVal,
        direction,
        label: match.label || match.metric || 'Growth Metric',
        source: match.source || match.sourceUrls?.[0] || 'Truth-Anchor'
      };
    }
  }

  // 2. Check for currency or numerical statistics (e.g. $12B, 500M, 1.5 trillion)
  const currencyMatch = text.match(/(\$\s*\d+(?:\.\d+)?\s*(?:[bmkt]|billion|million|thousand|trillion)?|\b\d+(?:\.\d+)?\s*(?:billion|million|thousand|trillion)\b)/i);
  if (currencyMatch) {
    const rawVal = currencyMatch[1].replace(/\s+/g, '').toUpperCase();
    const match = verifiedPool.find(item => {
      const itemVal = String(item.value || item.statistic || item.amount || item.text || '').replace(/\s+/g, '').toUpperCase();
      return itemVal.includes(rawVal) || (item.metric && normalizedScene.includes(normalizeText(item.metric)));
    });

    if (match) {
      return {
        verified: true,
        type: 'statistic',
        value: match.value || currencyMatch[1].trim(),
        label: match.label || match.metric || 'Key Metric',
        source: match.source || match.sourceUrls?.[0] || 'Truth-Anchor'
      };
    }
  }

  // 3. Check for specific business numbers/facts (e.g., "500 stores", "30 countries")
  const countMatch = text.match(/(\b\d+(?:,\d{3})*(?:\.\d+)?\b)\s+([a-zA-Z]{3,20})/i);
  if (countMatch) {
    const rawNum = countMatch[1].replace(/,/g, '');
    const noun = countMatch[2];
    const match = verifiedPool.find(item => {
      const itemVal = String(item.value || item.count || item.text || '');
      return itemVal.includes(rawNum) && (itemVal.toLowerCase().includes(noun.toLowerCase()) || normalizedScene.includes(noun.toLowerCase()));
    });

    if (match) {
      return {
        verified: true,
        type: 'business_fact',
        value: countMatch[1],
        unit: noun,
        label: match.label || `${countMatch[1]} ${noun}`,
        context: match.context || text,
        source: match.source || match.sourceUrls?.[0] || 'Truth-Anchor'
      };
    }
  }

  // 4. Check for comparison data
  const comparisonMatch = text.match(/(?:(.+?)\s+(?:vs\.?|versus|compared to)\s+(.+?))(?=[.,;!?]|$)/i);
  if (comparisonMatch) {
    const leftRaw = comparisonMatch[1].trim();
    const rightRaw = comparisonMatch[2].trim();
    const match = verifiedPool.find(item => {
      if (item.type === 'comparison' || item.left || item.right) return true;
      const itemVal = String(item.text || item.label || '');
      return itemVal.toLowerCase().includes(leftRaw.toLowerCase()) || itemVal.toLowerCase().includes(rightRaw.toLowerCase());
    });

    if (match) {
      return {
        verified: true,
        type: 'comparison',
        left: match.left || { label: leftRaw.split(' ').slice(-2).join(' ') },
        right: match.right || { label: rightRaw.split(' ').slice(0, 2).join(' ') },
        label: match.label || 'Head-to-Head Comparison',
        source: match.source || match.sourceUrls?.[0] || 'Truth-Anchor'
      };
    }
  }

  // 5. Check for ranking / leaderboard data
  const rankingItem = verifiedPool.find(item => item.type === 'ranking' || Array.isArray(item.items));
  if (rankingItem) {
    return {
      verified: true,
      type: 'ranking',
      items: rankingItem.items,
      label: rankingItem.label || 'Market Ranking',
      source: rankingItem.source || rankingItem.sourceUrls?.[0] || 'Truth-Anchor'
    };
  }

  // 6. Check for trend / trajectory data
  const trendItem = verifiedPool.find(item => item.type === 'trend' || (item.startValue !== undefined && item.endValue !== undefined));
  if (trendItem) {
    return {
      verified: true,
      type: 'trend',
      startValue: trendItem.startValue,
      endValue: trendItem.endValue,
      label: trendItem.label || 'Trend Analysis',
      source: trendItem.source || trendItem.sourceUrls?.[0] || 'Truth-Anchor'
    };
  }

  // 7. Check for numerical change / delta
  const changeItem = verifiedPool.find(item => item.type === 'numerical_change' || item.type === 'delta');
  if (changeItem) {
    return {
      verified: true,
      type: 'numerical_change',
      value: changeItem.value,
      unitType: changeItem.unitType || 'currency',
      label: changeItem.label || 'Metric Change',
      source: changeItem.source || changeItem.sourceUrls?.[0] || 'Truth-Anchor'
    };
  }

  // 8. Check for percentage gauge
  const percentageItem = verifiedPool.find(item => item.type === 'percentage');
  if (percentageItem) {
    return {
      verified: true,
      type: 'percentage',
      value: percentageItem.value,
      label: percentageItem.label || 'Percentage Share',
      source: percentageItem.source || percentageItem.sourceUrls?.[0] || 'Truth-Anchor'
    };
  }

  return { verified: false };
}

/**
 * SceneVisualPlan model encapsulates the chosen treatment, motion,
 * verified data, safe zones, and styling for a scene.
 */
class SceneVisualPlan {
  constructor(data = {}) {
    const rawKey = String(data.label || '') + '_' + String(data.scriptText || '') + '_' + String(data.position || 0);
    this.id = data.id || (`plan_${Buffer.from(rawKey).toString('hex').slice(0, 12)}`);
    this.sceneType = data.sceneType || SCENE_TYPES.GENERAL_INFORMATION;
    this.treatment = data.treatment || TREATMENTS.SUBTLE_MOTION;
    this.motion = data.motion || MOTIONS.KEN_BURNS;
    this.duration = Math.max(1, Number(data.duration || 5));
    this.aspectRatio = data.aspectRatio || ASPECT_RATIOS.PORTRAIT;
    this.dimensions = DIMENSIONS[this.aspectRatio] || DIMENSIONS['9:16'];
    this.safeZones = SAFE_ZONES[this.aspectRatio] || SAFE_ZONES['9:16'];
    this.verifiedData = data.verifiedData || null;
    this.visualizationSpec = data.visualizationSpec || null;
    this.scriptText = data.scriptText || '';
    this.label = data.label || '';
    this.assetPath = data.assetPath || null;
    this.captions = Array.isArray(data.captions) ? data.captions : [];
    this.fallbackReason = data.fallbackReason || null;
    this.styling = data.styling || {
      theme: 'dark_lux',
      primaryColor: '#38bdf8',
      accentColor: '#f59e0b',
      textColor: '#ffffff',
      fontFamily: 'Arial, sans-serif'
    };
  }

  toJSON() {
    return {
      id: this.id,
      sceneType: this.sceneType,
      treatment: this.treatment,
      motion: this.motion,
      duration: this.duration,
      aspectRatio: this.aspectRatio,
      dimensions: this.dimensions,
      safeZones: this.safeZones,
      verifiedData: this.verifiedData,
      visualizationSpec: this.visualizationSpec && typeof this.visualizationSpec.toJSON === 'function' ? this.visualizationSpec.toJSON() : this.visualizationSpec,
      scriptText: this.scriptText,
      label: this.label,
      assetPath: this.assetPath,
      captionsCount: this.captions.length,
      fallbackReason: this.fallbackReason
    };
  }
}

/**
 * VisualTreatmentSelector
 * Deterministically classifies scene semantic purpose and selects the appropriate visual treatment.
 */
class VisualTreatmentSelector {
  constructor(options = {}) {
    this.logger = options.logger || new Logger('VisualTreatmentSelector');
  }

  /**
   * Classify visual intent and select treatment deterministically.
   */
  classifySceneIntent(scene = {}, verifiedContext = {}) {
    const label = String(scene.label || '').trim();
    const text = String(scene.scriptText || scene.text || scene.content || '').trim();
    const normalizedText = normalizeText(text);
    const normalizedLabel = normalizeText(label);
    const position = Number.isInteger(scene.position) ? scene.position : 0;

    // 1. HOOK: Preserve and integrate with existing anti-swipe hook system
    const isExplicitHook = scene.isHook === true || /hook/i.test(normalizedLabel);
    const isOpeningHook = position === 0 && (isExplicitHook || /^(?:did you know|what if|here is why|stop scrolling|the secret to|how this)/i.test(normalizedText));
    if (isExplicitHook || isOpeningHook) {
      return {
        sceneType: SCENE_TYPES.HOOK,
        treatment: TREATMENTS.ANTI_SWIPE_HOOK,
        motion: MOTIONS.PUNCH_ZOOM,
        verifiedData: null
      };
    }

    // 2. RANKING: Leaderboard badges and ordering
    const isRankingPattern = /\b(?:ranking|rankings|leaderboard|top\s*\d+)\b/i.test(text) || /ranking|leaderboard/i.test(normalizedLabel);
    if (isRankingPattern || scene.sceneType === SCENE_TYPES.RANKING) {
      const data = extractVerifiedData(scene, verifiedContext);
      if (data.verified && (data.type === 'ranking' || Array.isArray(data.items))) {
        return {
          sceneType: SCENE_TYPES.RANKING,
          treatment: TREATMENTS.RANKING_LEADERBOARD,
          motion: MOTIONS.CONTROLLED_ENTRANCE,
          verifiedData: data
        };
      }
      this.logger.warn('Scene mentions ranking but lacks verified Truth-Anchor data. Safely falling back to GENERAL_INFORMATION.');
      return {
        sceneType: SCENE_TYPES.GENERAL_INFORMATION,
        treatment: TREATMENTS.SUBTLE_MOTION,
        motion: MOTIONS.KEN_BURNS,
        verifiedData: null,
        fallbackReason: FALLBACK_REASONS.MISSING_VERIFIED_DATA
      };
    }

    // 3. TREND: Trajectory and trend line
    const isTrendPattern = /\b(?:trend|trajectory|historic\s*growth)\b/i.test(text) || /trend|trajectory/i.test(normalizedLabel);
    if (isTrendPattern || scene.sceneType === SCENE_TYPES.TREND) {
      const data = extractVerifiedData(scene, verifiedContext);
      if (data.verified && data.type === 'trend') {
        return {
          sceneType: SCENE_TYPES.TREND,
          treatment: TREATMENTS.TREND_TRAJECTORY,
          motion: MOTIONS.DIRECTIONAL_PAN,
          verifiedData: data
        };
      }
      this.logger.warn('Scene mentions trend/trajectory but lacks verified Truth-Anchor data. Safely falling back to GENERAL_INFORMATION.');
      return {
        sceneType: SCENE_TYPES.GENERAL_INFORMATION,
        treatment: TREATMENTS.SUBTLE_MOTION,
        motion: MOTIONS.KEN_BURNS,
        verifiedData: null,
        fallbackReason: FALLBACK_REASONS.MISSING_VERIFIED_DATA
      };
    }

    // 4. COMPARISON: Two-sided comparison layout
    const isComparisonText = /\b(?:vs\.?|versus|compared to|in comparison to|against)\b/i.test(text);
    const isComparisonLabel = /comparison|contrast|vs/i.test(normalizedLabel);
    if (isComparisonText || isComparisonLabel) {
      const data = extractVerifiedData(scene, verifiedContext);
      return {
        sceneType: SCENE_TYPES.COMPARISON,
        treatment: TREATMENTS.TWO_SIDED_COMPARISON,
        motion: MOTIONS.CONTROLLED_ENTRANCE,
        verifiedData: data.verified ? data : null
      };
    }

    // 5. GROWTH: Animated percentage / growth treatment
    const hasGrowthPattern = /\b(?:growth|grew|surged|increased|jumped|decreased|dropped|decline|fell)\b.*?\d+%/i.test(text) ||
      /\d+%.*?\b(?:growth|increase|decrease|gain|drop|margin|rate)\b/i.test(text) ||
      /\b(?:yoy|quarterly|annual)\b.*?\d+%/i.test(text) ||
      /growth|gain/i.test(normalizedLabel) ||
      scene.sceneType === SCENE_TYPES.GROWTH ||
      (scene.verifiedData && scene.verifiedData.type === 'growth');

    if (hasGrowthPattern) {
      const data = extractVerifiedData(scene, verifiedContext);
      if (data.verified && data.type === 'growth') {
        return {
          sceneType: SCENE_TYPES.GROWTH,
          treatment: TREATMENTS.ANIMATED_PERCENTAGE,
          motion: MOTIONS.DIRECTIONAL_PAN,
          verifiedData: data
        };
      }
      // Truth-Anchor safety guard: Do not invent growth figures
      this.logger.warn(`Scene mentions growth percentage but lacks verified Truth-Anchor data. Safely falling back to GENERAL_INFORMATION.`);
      return {
        sceneType: SCENE_TYPES.GENERAL_INFORMATION,
        treatment: TREATMENTS.SUBTLE_MOTION,
        motion: MOTIONS.KEN_BURNS,
        verifiedData: null,
        fallbackReason: 'Unverified growth metric'
      };
    }

    // 6. STATISTIC: Animated number / emphasis treatment
    const hasStatisticPattern = /\$\s*\d+(?:\.\d+)?\s*(?:[bmkt]|billion|million|thousand|trillion)?/i.test(text) ||
      /\b\d+(?:\.\d+)?\s*(?:billion|million|trillion)\b/i.test(text) ||
      /revenue|valuation|market cap|users|downloads/i.test(normalizedLabel);

    if (hasStatisticPattern) {
      const data = extractVerifiedData(scene, verifiedContext);
      if (data.verified && (data.type === 'statistic' || data.type === 'growth')) {
        return {
          sceneType: SCENE_TYPES.STATISTIC,
          treatment: TREATMENTS.ANIMATED_NUMBER,
          motion: MOTIONS.EMPHASIS_ZOOM,
          verifiedData: data
        };
      }
      // Truth-Anchor safety guard: Do not invent statistics
      this.logger.warn(`Scene mentions financial/numerical statistic but lacks verified Truth-Anchor data. Safely falling back to GENERAL_INFORMATION.`);
      return {
        sceneType: SCENE_TYPES.GENERAL_INFORMATION,
        treatment: TREATMENTS.SUBTLE_MOTION,
        motion: MOTIONS.KEN_BURNS,
        verifiedData: null,
        fallbackReason: 'Unverified statistic'
      };
    }

    // 7. BUSINESS_FACT: Strong verified business count or fact
    const hasBusinessFactPattern = /\b\d+(?:,\d{3})*\b\s+(?:stores|employees|locations|customers|clients|partners|countries|patents|products)/i.test(text);
    if (hasBusinessFactPattern) {
      const data = extractVerifiedData(scene, verifiedContext);
      if (data.verified && data.type === 'business_fact') {
        return {
          sceneType: SCENE_TYPES.BUSINESS_FACT,
          treatment: TREATMENTS.BUSINESS_FACT_CALLOUT,
          motion: MOTIONS.EMPHASIS_ZOOM,
          verifiedData: data
        };
      }
      this.logger.warn(`Scene mentions business fact numbers but lacks verified Truth-Anchor data. Safely falling back to GENERAL_INFORMATION.`);
      return {
        sceneType: SCENE_TYPES.GENERAL_INFORMATION,
        treatment: TREATMENTS.SUBTLE_MOTION,
        motion: MOTIONS.SLOW_PAN,
        verifiedData: null,
        fallbackReason: 'Unverified business fact'
      };
    }

    // 8. Explicit PERCENTAGE or NUMERICAL_CHANGE
    if (scene.sceneType === SCENE_TYPES.NUMERICAL_CHANGE || scene.sceneType === SCENE_TYPES.PERCENTAGE) {
      const data = extractVerifiedData(scene, verifiedContext);
      if (data.verified) {
        return {
          sceneType: scene.sceneType,
          treatment: scene.sceneType === SCENE_TYPES.NUMERICAL_CHANGE ? TREATMENTS.NUMERICAL_DELTA : TREATMENTS.PERCENTAGE_GAUGE,
          motion: MOTIONS.EMPHASIS_ZOOM,
          verifiedData: data
        };
      }
      return {
        sceneType: SCENE_TYPES.GENERAL_INFORMATION,
        treatment: TREATMENTS.SUBTLE_MOTION,
        motion: MOTIONS.KEN_BURNS,
        verifiedData: null,
        fallbackReason: FALLBACK_REASONS.MISSING_VERIFIED_DATA
      };
    }

    // 9. GENERAL_INFORMATION: Professional subtle motion fallback
    return {
      sceneType: SCENE_TYPES.GENERAL_INFORMATION,
      treatment: TREATMENTS.SUBTLE_MOTION,
      motion: MOTIONS.KEN_BURNS,
      verifiedData: null
    };
  }

  /**
   * Build a complete SceneVisualPlan.
   */
  buildPlan(scene = {}, verifiedContext = {}, options = {}) {
    const classification = this.classifySceneIntent(scene, verifiedContext);
    const duration = Number(scene.duration || options.duration || 5);
    const aspectRatio = options.aspectRatio || (options.width === 1920 && options.height === 1080 ? ASPECT_RATIOS.LANDSCAPE : ASPECT_RATIOS.PORTRAIT);

    let visualizationSpec = scene.visualizationSpec || null;
    let fallbackReason = classification.fallbackReason || null;

    if (!visualizationSpec && classification.verifiedData) {
      const financialVis = new FinancialVisualization({ logger: this.logger });
      let visType = null;
      switch (classification.verifiedData.type) {
        case 'growth':
          visType = VISUALIZATION_TYPES.GROWTH_INDICATOR;
          break;
        case 'percentage':
          visType = VISUALIZATION_TYPES.PERCENTAGE_GAUGE;
          break;
        case 'comparison':
          visType = VISUALIZATION_TYPES.COMPARISON_BAR;
          break;
        case 'ranking':
          visType = VISUALIZATION_TYPES.RANKING_LIST;
          break;
        case 'trend':
          visType = VISUALIZATION_TYPES.TREND_LINE;
          break;
        case 'numerical_change':
          visType = VISUALIZATION_TYPES.NUMERICAL_CHANGE;
          break;
        case 'business_fact':
          visType = VISUALIZATION_TYPES.STATISTIC_CALLOUT;
          break;
        case 'statistic':
        default:
          visType = VISUALIZATION_TYPES.ANIMATED_METRIC;
          break;
      }

      if (visType) {
        const specResult = financialVis.createSpec(visType, classification.verifiedData, {
          aspectRatio,
          meta: options.meta
        });
        if (specResult.rejected) {
          fallbackReason = specResult.reason;
          visualizationSpec = null;
        } else {
          visualizationSpec = specResult.spec;
        }
      }
    }

    return new SceneVisualPlan({
      id: scene.id,
      sceneType: classification.sceneType,
      treatment: classification.treatment,
      motion: classification.motion,
      duration,
      aspectRatio,
      verifiedData: classification.verifiedData,
      visualizationSpec,
      scriptText: scene.scriptText || scene.text || '',
      label: scene.label || '',
      assetPath: scene.assetPath || null,
      fallbackReason,
      styling: options.styling
    });
  }
}

/**
 * VisualMotion
 * Formulates FFmpeg filter expressions for smooth, intentional motion.
 */
class VisualMotion {
  /**
   * Generates FFmpeg video filter for specified motion.
   */
  static buildFilter(motion, durationSeconds, dimensions) {
    const duration = Math.max(1, Number(durationSeconds || 5));
    const fps = 30;
    const totalFrames = Math.round(duration * fps);
    const { width, height } = dimensions;

    switch (motion) {
      case MOTIONS.PUNCH_ZOOM:
        // High impact zoom-in for anti-swipe hooks (quick punch from 1.0 to 1.15 in first 0.5s then slow drift)
        return `zoompan=z='if(lte(on,15),1.0+0.12*(on/15),1.12+0.03*((on-15)/${Math.max(1, totalFrames - 15)}))':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;

      case MOTIONS.EMPHASIS_ZOOM:
        // Smooth scale in toward center focus
        return `zoompan=z='min(1.0+0.12*(on/${totalFrames}),1.15)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;

      case MOTIONS.ZOOM_OUT:
        // Controlled zoom out
        return `zoompan=z='max(1.15-0.12*(on/${totalFrames}),1.0)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;

      case MOTIONS.DIRECTIONAL_PAN:
        // Directional subtle vertical pan
        return `zoompan=z=1.12:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on/${totalFrames})':d=1:s=${width}x${height}:fps=${fps}`;

      case MOTIONS.SLOW_PAN:
        // Slow horizontal pan
        return `zoompan=z=1.12:x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`;

      case MOTIONS.CONTROLLED_ENTRANCE:
        // Subtle center float with stable frame
        return `zoompan=z='1.05+0.04*sin(2*PI*on/${totalFrames})':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;

      case MOTIONS.KEN_BURNS:
      default:
        // Smooth gentle Ken Burns
        return `zoompan=z='min(zoom+0.0008,1.14)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;
    }
  }
}

/**
 * VisualTreatmentRenderer
 * Renders high-fidelity scenes with Sharp & FFmpeg, complete with safe zones,
 * dynamic karaoke captions, and transitions.
 */
class VisualTreatmentRenderer {
  constructor(options = {}) {
    this.logger = options.logger || new Logger('VisualTreatmentRenderer');
    this.runFFmpeg = options.runFFmpeg || runFFmpeg;
  }

  /**
   * Generates a modern SVG card layout matching the scene visual plan.
   */
  renderCardSvg(plan) {
    if (plan.visualizationSpec) {
      return VisualizationRenderer.renderSvgCard(plan.visualizationSpec);
    }

    const { width, height } = plan.dimensions;
    const safe = plan.safeZones;
    const isPortrait = plan.aspectRatio === ASPECT_RATIOS.PORTRAIT;

    // Card dimensions strictly within safe zones
    const cardX = safe.left + 20;
    const cardY = safe.top + (isPortrait ? 80 : 30);
    const cardW = width - safe.left - safe.right - 40;
    const cardH = height - cardY - safe.bottom - (isPortrait ? 80 : 40);

    let innerContent = '';
    const labelText = escapeXml(plan.label.toUpperCase() || plan.sceneType);

    switch (plan.treatment) {
      case TREATMENTS.ANTI_SWIPE_HOOK: {
        const headline = escapeXml(plan.scriptText || 'WATCH THIS');
        innerContent = `
          <!-- Anti-Swipe Visual Hook -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.78)" stroke="#38bdf8" stroke-width="3" />
          <g transform="translate(40, 50)">
            <rect x="0" y="0" width="160" height="36" rx="18" fill="#ef4444" />
            <text x="80" y="24" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">MUST WATCH</text>
            <text x="0" y="90" font-family="Arial, sans-serif" font-size="${isPortrait ? 52 : 36}" font-weight="900" fill="#ffffff" letter-spacing="-1">
              ${headline.length > 50 ? `${headline.slice(0, 48)}...` : headline}
            </text>
            <rect x="0" y="${isPortrait ? 220 : 140}" width="${cardW - 80}" height="4" fill="url(#hookGrad)" />
            <text x="0" y="${isPortrait ? 270 : 180}" font-family="Arial, sans-serif" font-size="22" font-weight="600" fill="#94a3b8">
              Keep watching for the full breakdown
            </text>
          </g>
        `;
        break;
      }

      case TREATMENTS.ANIMATED_NUMBER: {
        const val = escapeXml(plan.verifiedData?.value || '$12B');
        const metricLabel = escapeXml(plan.verifiedData?.label || 'ANNUAL REVENUE');
        const source = escapeXml(plan.verifiedData?.source || 'Truth-Anchor Verified');
        innerContent = `
          <!-- Statistic / Number Callout -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.82)" stroke="rgba(56, 189, 248, 0.4)" stroke-width="2" />
          <g transform="translate(40, 50)">
            <rect x="0" y="0" width="200" height="34" rx="17" fill="rgba(56, 189, 248, 0.2)" stroke="#38bdf8" stroke-width="1" />
            <text x="100" y="23" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#38bdf8" text-anchor="middle">KEY METRIC</text>
            <text x="0" y="${isPortrait ? 150 : 100}" font-family="Arial, sans-serif" font-size="${isPortrait ? 84 : 56}" font-weight="900" fill="#38bdf8" letter-spacing="-2">
              ${val}
            </text>
            <text x="0" y="${isPortrait ? 210 : 140}" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#ffffff">
              ${metricLabel}
            </text>
            <g transform="translate(0, ${isPortrait ? 270 : 180})">
              <circle cx="12" cy="12" r="10" fill="#10b981" />
              <path d="M7 12 l3 3 l7 -7" stroke="#ffffff" stroke-width="2" fill="none" />
              <text x="32" y="17" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#10b981">
                ✓ ${source}
              </text>
            </g>
          </g>
        `;
        break;
      }

      case TREATMENTS.ANIMATED_PERCENTAGE: {
        const val = escapeXml(plan.verifiedData?.value || '+42%');
        const metricLabel = escapeXml(plan.verifiedData?.label || 'YoY Growth');
        const isPositive = !val.startsWith('-');
        const color = isPositive ? '#10b981' : '#f43f5e';
        const arrow = isPositive ? '▲' : '▼';
        const source = escapeXml(plan.verifiedData?.source || 'Truth-Anchor Verified');
        innerContent = `
          <!-- Growth Percentage Callout -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.82)" stroke="${color}" stroke-width="2" />
          <g transform="translate(40, 50)">
            <rect x="0" y="0" width="190" height="34" rx="17" fill="rgba(16, 185, 129, 0.15)" stroke="${color}" stroke-width="1" />
            <text x="95" y="23" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="${color}" text-anchor="middle">GROWTH RATE</text>
            <text x="0" y="${isPortrait ? 150 : 100}" font-family="Arial, sans-serif" font-size="${isPortrait ? 88 : 58}" font-weight="900" fill="${color}" letter-spacing="-2">
              ${arrow} ${val}
            </text>
            <text x="0" y="${isPortrait ? 210 : 140}" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#ffffff">
              ${metricLabel}
            </text>
            <g transform="translate(0, ${isPortrait ? 270 : 180})">
              <text x="0" y="17" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#94a3b8">
                Verified: ${source}
              </text>
            </g>
          </g>
        `;
        break;
      }

      case TREATMENTS.TWO_SIDED_COMPARISON: {
        const leftLabel = escapeXml(plan.verifiedData?.left?.label || 'Company A');
        const rightLabel = escapeXml(plan.verifiedData?.right?.label || 'Company B');
        const compW = (cardW - 100) / 2;
        innerContent = `
          <!-- Two-Sided Comparison Layout -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1.5" />
          <g transform="translate(30, 40)">
            <text x="${cardW / 2 - 30}" y="20" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#f59e0b" text-anchor="middle">HEAD-TO-HEAD</text>
            <!-- Left Side -->
            <g transform="translate(0, 50)">
              <rect x="0" y="0" width="${compW}" height="${isPortrait ? 220 : 140}" rx="16" fill="rgba(56, 189, 248, 0.12)" stroke="#38bdf8" stroke-width="2" />
              <text x="${compW / 2}" y="${isPortrait ? 100 : 70}" font-family="Arial, sans-serif" font-size="${isPortrait ? 32 : 24}" font-weight="bold" fill="#ffffff" text-anchor="middle">${leftLabel}</text>
            </g>
            <!-- VS Divider -->
            <circle cx="${cardW / 2 - 30}" cy="${isPortrait ? 160 : 120}" r="26" fill="#f59e0b" />
            <text x="${cardW / 2 - 30}" y="${isPortrait ? 167 : 127}" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#0f172a" text-anchor="middle">VS</text>
            <!-- Right Side -->
            <g transform="translate(${compW + 40}, 50)">
              <rect x="0" y="0" width="${compW}" height="${isPortrait ? 220 : 140}" rx="16" fill="rgba(168, 85, 247, 0.12)" stroke="#a855f7" stroke-width="2" />
              <text x="${compW / 2}" y="${isPortrait ? 100 : 70}" font-family="Arial, sans-serif" font-size="${isPortrait ? 32 : 24}" font-weight="bold" fill="#ffffff" text-anchor="middle">${rightLabel}</text>
            </g>
          </g>
        `;
        break;
      }

      case TREATMENTS.BUSINESS_FACT_CALLOUT: {
        const val = escapeXml(plan.verifiedData?.value || '500');
        const unit = escapeXml(plan.verifiedData?.unit || 'STORES');
        const context = escapeXml(plan.verifiedData?.context || plan.scriptText);
        innerContent = `
          <!-- Business Fact Callout -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.82)" stroke="rgba(245, 158, 11, 0.5)" stroke-width="2" />
          <g transform="translate(40, 50)">
            <rect x="0" y="0" width="180" height="34" rx="17" fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" stroke-width="1" />
            <text x="90" y="23" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#f59e0b" text-anchor="middle">BUSINESS FACT</text>
            <text x="0" y="${isPortrait ? 140 : 95}" font-family="Arial, sans-serif" font-size="${isPortrait ? 78 : 52}" font-weight="900" fill="#ffffff">
              ${val} <tspan font-size="${isPortrait ? 36 : 28}" fill="#f59e0b">${unit}</tspan>
            </text>
            <text x="0" y="${isPortrait ? 210 : 145}" font-family="Arial, sans-serif" font-size="22" font-weight="500" fill="#cbd5e1">
              ${context.length > 70 ? `${context.slice(0, 68)}...` : context}
            </text>
          </g>
        `;
        break;
      }

      case TREATMENTS.SUBTLE_MOTION:
      default: {
        const summary = escapeXml(plan.scriptText || plan.label);
        innerContent = `
          <!-- General Information Lower Third / Framed Visual -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.75)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1" />
          <g transform="translate(40, 45)">
            <rect x="0" y="0" width="170" height="30" rx="15" fill="rgba(255, 255, 255, 0.1)" />
            <text x="85" y="20" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#94a3b8" text-anchor="middle">${labelText}</text>
            <text x="0" y="${isPortrait ? 90 : 65}" font-family="Arial, sans-serif" font-size="${isPortrait ? 36 : 26}" font-weight="bold" fill="#ffffff">
              ${summary.length > 90 ? `${summary.slice(0, 87)}...` : summary}
            </text>
          </g>
        `;
        break;
      }
    }

    return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0f1d" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e1b4b" />
    </linearGradient>
    <linearGradient id="hookGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ef4444" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.6" />
    </filter>
  </defs>

  <!-- Base Gradient Canvas -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" />

  <!-- Accent Glow Circles -->
  <circle cx="${width * 0.8}" cy="${height * 0.2}" r="${width * 0.4}" fill="#38bdf8" opacity="0.08" />
  <circle cx="${width * 0.2}" cy="${height * 0.8}" r="${width * 0.4}" fill="#a855f7" opacity="0.08" />

  <!-- Safe Zone Border Indicator (invisible in production, guarantees safe positioning) -->
  <g transform="translate(${cardX}, ${cardY})" filter="url(#shadow)">
    ${innerContent}
  </g>
</svg>
    `.trim();
  }

  /**
   * Renders the base image still for the scene using Sharp.
   */
  async renderSceneStill(plan, outputPath) {
    const { width, height } = plan.dimensions;
    const svgBuffer = Buffer.from(this.renderCardSvg(plan), 'utf8');

    if (plan.assetPath) {
      try {
        await fs.access(plan.assetPath);
        // Composite the SVG card on top of the existing visual asset
        await sharp(plan.assetPath)
          .resize(width, height, { fit: 'cover' })
          .composite([
            { input: Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="black" opacity="0.45"/></svg>`), blend: 'over' },
            { input: svgBuffer, blend: 'over' }
          ])
          .png()
          .toFile(outputPath);
        return outputPath;
      } catch (_err) {
        // Fallback to pure SVG render
      }
    }

    await sharp(svgBuffer).png().toFile(outputPath);
    return outputPath;
  }

  /**
   * Generates dynamic karaoke captions in ASS format, honoring Shorts safe zone margins.
   */
  generateKaraokeAss(plan) {
    const { width, height } = plan.dimensions;
    const safe = plan.safeZones;
    const isPortrait = plan.aspectRatio === ASPECT_RATIOS.PORTRAIT;
    const fontSize = isPortrait ? 44 : 32;

    const words = String(plan.scriptText || '').trim().split(/\s+/).filter(Boolean);
    const duration = plan.duration;

    let events = '';
    if (words.length > 0) {
      const wordsPerChunk = isPortrait ? 5 : 7;
      const chunks = [];
      for (let i = 0; i < words.length; i += wordsPerChunk) {
        chunks.push(words.slice(i, i + wordsPerChunk));
      }

      const chunkDuration = duration / chunks.length;
      chunks.forEach((chunk, chunkIdx) => {
        const startSec = chunkIdx * chunkDuration;
        const endSec = Math.min(duration, (chunkIdx + 1) * chunkDuration);
        const perWordCentisec = Math.max(10, Math.round((chunkDuration / chunk.length) * 100));

        // Format ASS timestamps: h:mm:ss.cc
        const formatTime = (sec) => {
          const m = Math.floor(sec / 60);
          const s = Math.floor(sec % 60);
          const cs = Math.floor((sec % 1) * 100);
          return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
        };

        const karaokeText = chunk.map(word => `{\\k${perWordCentisec}}${escapeXml(word)}`).join(' ');
        events += `Dialogue: 0,${formatTime(startSec)},${formatTime(endSec)},Karaoke,,0,0,0,,${karaokeText}\n`;
      });
    }

    return `[Script Info]
Title: Dynamic Shorts Karaoke
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,Arial,${fontSize},&H00FFFFFF,&H0038BDF8,&H00000000,&H80000000,-1,0,0,0,100,100,1,0,1,4,2,2,${safe.left},${safe.right},${safe.subtitleMarginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
    `.trim();
  }

  /**
   * Render an individual scene to MP4 with motion, card visuals, and karaoke subtitles.
   */
  async renderSceneVideo(plan, outputPath, _options = {}) {
    if (!(await checkFFmpeg())) throw new Error(ffmpegInstallHint());

    const tempDir = path.dirname(outputPath);
    const stillPath = path.join(tempDir, `still_${plan.id}.png`);
    const assPath = path.join(tempDir, `karaoke_${plan.id}.ass`);

    try {
      await this.renderSceneStill(plan, stillPath);
      const assContent = this.generateKaraokeAss(plan);
      await fs.writeFile(assPath, assContent, 'utf8');

      const motionFilter = VisualMotion.buildFilter(plan.motion, plan.duration, plan.dimensions);
      const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

      // Chain motion + karaoke subtitles + color format
      const vf = `${motionFilter},subtitles='${escapedAss}',format=yuv420p`;

      const args = [
        '-y', '-loop', '1', '-i', stillPath,
        '-vf', vf,
        '-t', Number(plan.duration).toFixed(2),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-r', '30',
        '-pix_fmt', 'yuv420p',
        outputPath
      ];

      await this.runFFmpeg(args);
      return outputPath;
    } finally {
      await fs.unlink(stillPath).catch(() => {});
      await fs.unlink(assPath).catch(() => {});
    }
  }

  /**
   * Composes a complete video/Short from multiple scene visual plans and an audio track.
   */
  async composeShort(plans = [], audioPath = null, outputPath, options = {}) {
    if (!(await checkFFmpeg())) throw new Error(ffmpegInstallHint());
    if (!plans.length) throw new Error('Cannot compose Short: no scene visual plans provided');

    const tempDir = path.dirname(outputPath);
    const sceneClips = [];

    try {
      // 1. Render individual scene clips
      for (let i = 0; i < plans.length; i++) {
        const plan = plans[i];
        const clipPath = path.join(tempDir, `clip_${i}_${plan.id}.mp4`);
        await this.renderSceneVideo(plan, clipPath, options);
        sceneClips.push(clipPath);
      }

      // 2. Concatenate or crossfade scene clips
      const assembledVideo = path.join(tempDir, `assembled_${Date.now()}.mp4`);
      if (sceneClips.length === 1) {
        await fs.copyFile(sceneClips[0], assembledVideo);
      } else {
        // Concat or xfade
        const filterInputs = sceneClips.map((_, idx) => `[${idx}:v]`).join('');
        const concatFilter = `${filterInputs}concat=n=${sceneClips.length}:v=1:a=0[vout]`;
        const concatArgs = ['-y'];
        for (const clip of sceneClips) concatArgs.push('-i', clip);
        concatArgs.push('-filter_complex', concatFilter, '-map', '[vout]', '-c:v', 'libx264', '-preset', 'veryfast', assembledVideo);
        await this.runFFmpeg(concatArgs);
      }

      // 3. Attach audio track if present (or produce clean silent output if none)
      let finalAudioPath = audioPath;
      if (audioPath && (options.audioMixSpec || options.musicPath || options.sfxCues || options.enableAudioEnhancement)) {
        try {
          await fs.access(audioPath);
          const audioEngine = new AudioEnhancementEngine({ logger: this.logger, runFFmpeg: this.runFFmpeg });
          const totalDuration = plans.reduce((acc, p) => acc + (p.duration || 5), 0);
          const mixSpec = options.audioMixSpec || new AudioMixSpec({
            voicePath: audioPath,
            musicPath: options.musicPath || null,
            musicVolume: options.musicVolume,
            enableDucking: options.enableDucking !== false,
            sfxCues: options.sfxCues || (options.enableSfx ? SfxScheduler.planSfxForScenes(plans) : []),
            targetLoudness: options.targetLoudness || -14.0,
            truePeakLimit: options.truePeakLimit || -1.5,
            enableVoiceClarity: options.enableVoiceClarity !== false
          });

          const enhancedAudioPath = path.join(tempDir, `enhanced_master_${Date.now()}.m4a`);
          await audioEngine.enhanceAndMix(mixSpec, enhancedAudioPath, { duration: totalDuration });
          finalAudioPath = enhancedAudioPath;
        } catch (enhanceErr) {
          this.logger.warn(`Audio enhancement encountered an issue; using input audio: ${enhanceErr.message}`);
          finalAudioPath = audioPath;
        }
      }

      const finalArgs = ['-y', '-i', assembledVideo];
      if (finalAudioPath) {
        try {
          await fs.access(finalAudioPath);
          finalArgs.push('-i', finalAudioPath, '-map', '0:v:0', '-map', '1:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest');
        } catch (_err) {
          // Audio missing or inaccessible; use clean silent audio
          finalArgs.push('-c:v', 'copy');
        }
      } else {
        finalArgs.push('-c:v', 'copy');
      }
      finalArgs.push(outputPath);

      await this.runFFmpeg(finalArgs);
      await fs.unlink(assembledVideo).catch(() => {});
      return outputPath;
    } finally {
      for (const clip of sceneClips) {
        await fs.unlink(clip).catch(() => {});
      }
    }
  }
}

module.exports = {
  SCENE_TYPES,
  TREATMENTS,
  MOTIONS,
  ASPECT_RATIOS,
  DIMENSIONS,
  SAFE_ZONES,
  SceneVisualPlan,
  VisualTreatmentSelector,
  VisualMotion,
  VisualTreatmentRenderer,
  extractVerifiedData,
  escapeXml,
  VISUALIZATION_TYPES,
  FALLBACK_REASONS,
  NumberFormatter,
  VisualizationSpec,
  FinancialVisualization,
  VisualizationRenderer,
  AudioMixSpec,
  VoiceProcessor,
  MusicDucker,
  SfxScheduler,
  AudioValidation,
  AudioEnhancementEngine
};
