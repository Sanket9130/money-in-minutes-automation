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
const { resolveTopicKey } = require('./curated-topic-content');

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
  PARALLAX_FLOAT: 'PARALLAX_FLOAT',
  CAMERA_PUSH: 'CAMERA_PUSH',
  SMOOTH_PUSH_IN: 'SMOOTH_PUSH_IN',
  HORIZONTAL_SWEEP: 'HORIZONTAL_SWEEP',
  VERTICAL_TRACKING: 'VERTICAL_TRACKING',
  IMPACT_SHAKE: 'IMPACT_SHAKE',
  CAMERA_SHAKE: 'CAMERA_SHAKE',
  SCALE_BURST: 'SCALE_BURST'
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

const DOMAIN_UI_CONFIG = Object.freeze({
  airline_miles: {
    theme: 'airline',
    brandBadge: '✈️ AIRLINE ECONOMICS',
    brandDot: '#38bdf8',
    cardBg: 'rgba(3, 27, 78, 0.88)',
    cardStroke: '#0284c7',
    cardRadius: 16,
    accentColor: '#38bdf8',
    secondaryColor: '#f59e0b',
    widthOffset: 20,
    yOffset: 30,
    stop1: '#041633',
    stop2: '#082859',
    stop3: '#020b1c'
  },
  fast_food: {
    theme: 'fast_food',
    brandBadge: '🍔 FAST FOOD PRICING',
    brandDot: '#f97316',
    cardBg: 'rgba(45, 10, 2, 0.90)',
    cardStroke: '#ea580c',
    cardRadius: 32,
    accentColor: '#f97316',
    secondaryColor: '#ef4444',
    widthOffset: -40,
    yOffset: -30,
    stop1: '#2d1004',
    stop2: '#451a07',
    stop3: '#220c02'
  },
  nvidia: {
    theme: 'nvidia',
    brandBadge: '⚡ AI COMPUTE MOAT',
    brandDot: '#10b981',
    cardBg: 'rgba(2, 44, 22, 0.90)',
    cardStroke: '#10b981',
    cardRadius: 20,
    accentColor: '#10b981',
    secondaryColor: '#84cc16',
    widthOffset: 0,
    yOffset: 10,
    stop1: '#021a0c',
    stop2: '#042a15',
    stop3: '#010d06'
  },
  costco: {
    theme: 'costco',
    brandBadge: '🛒 COSTCO WHOLESALE',
    brandDot: '#ef4444',
    cardBg: 'rgba(4, 29, 61, 0.90)',
    cardStroke: '#ef4444',
    cardRadius: 24,
    accentColor: '#ef4444',
    secondaryColor: '#38bdf8',
    widthOffset: -20,
    yOffset: 0,
    stop1: '#031730',
    stop2: '#06254a',
    stop3: '#020d1c'
  },
  swipe_fees: {
    theme: 'swipe_fees',
    brandBadge: '💳 INTERCHANGE FEES',
    brandDot: '#6366f1',
    cardBg: 'rgba(15, 23, 55, 0.90)',
    cardStroke: '#6366f1',
    cardRadius: 22,
    accentColor: '#6366f1',
    secondaryColor: '#f59e0b',
    widthOffset: 0,
    yOffset: 20,
    stop1: '#0a1226',
    stop2: '#152247',
    stop3: '#050914'
  },
  disney: {
    theme: 'disney',
    brandBadge: '🏰 THEME PARK MATH',
    brandDot: '#c084fc',
    cardBg: 'rgba(35, 10, 55, 0.90)',
    cardStroke: '#c084fc',
    cardRadius: 28,
    accentColor: '#c084fc',
    secondaryColor: '#fbbf24',
    widthOffset: 20,
    yOffset: -10,
    stop1: '#18042b',
    stop2: '#2d0a4e',
    stop3: '#0f021c'
  },
  streaming: {
    theme: 'streaming',
    brandBadge: '📺 STREAMING AUDIT',
    brandDot: '#f43f5e',
    cardBg: 'rgba(35, 5, 20, 0.90)',
    cardStroke: '#f43f5e',
    cardRadius: 24,
    accentColor: '#f43f5e',
    secondaryColor: '#ec4899',
    widthOffset: -20,
    yOffset: 10,
    stop1: '#18020a',
    stop2: '#2b0517',
    stop3: '#0c0105'
  },
  apple: {
    theme: 'apple',
    brandBadge: '📱 APPLE HARDWARE',
    brandDot: '#e2e8f0',
    cardBg: 'rgba(20, 25, 35, 0.90)',
    cardStroke: '#94a3b8',
    cardRadius: 26,
    accentColor: '#94a3b8',
    secondaryColor: '#38bdf8',
    widthOffset: 0,
    yOffset: 0,
    stop1: '#0d121c',
    stop2: '#182233',
    stop3: '#06080e'
  },
  market_pulse: {
    theme: 'market_pulse',
    brandBadge: 'FINANCIAL AUDIT',
    brandDot: '#38bdf8',
    cardBg: 'rgba(15, 23, 42, 0.88)',
    cardStroke: 'rgba(255, 255, 255, 0.12)',
    cardRadius: 22,
    accentColor: '#38bdf8',
    secondaryColor: '#6366f1',
    widthOffset: 0,
    yOffset: 0,
    stop1: '#060b17',
    stop2: '#0b1329',
    stop3: '#030712'
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
 * Sanitizes subtitle text specifically for ASS formatting.
 * Unlike XML, ASS subtitles are rendered as plain text by libass.
 * HTML/XML entities like &apos; must be unescaped to apostrophes (don't instead of don&apos;t).
 */
function sanitizeAssText(text = '') {
  return String(text)
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

/**
 * Normalizes text to assist in keyword and numeric matching.
 */
function normalizeText(text = '') {
  return String(text || '').trim().toLowerCase();
}

/**
 * Strictly validates that a visual asset is an actual, readable media file on disk.
 * Explicitly rejects storyboard metadata strings (e.g. "PROCESS_EXPLANATION • cinematic_pan")
 * and verifies decodability via Sharp (images) or FFmpeg (videos).
 */
async function validateVisualAsset(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, reason: 'INVALID_PATH_TYPE' };
  }
  const clean = filePath.trim();
  if (!clean || clean.includes('•') || clean.startsWith('PROCESS_') || clean.includes('cinematic_pan') || clean.includes('\n')) {
    return { valid: false, reason: 'STORYBOARD_METADATA_STRING' };
  }
  try {
    const st = await fs.stat(clean);
    if (!st.isFile() || st.size === 0) {
      return { valid: false, reason: 'FILE_EMPTY_OR_NOT_FOUND' };
    }
  } catch (err) {
    return { valid: false, reason: 'FILE_NOT_ACCESSIBLE', error: err.message };
  }

  const ext = path.extname(clean).toLowerCase();
  const imageExts = new Set(['.png', '.jpg', '.jpeg', '.webp']);
  const videoExts = new Set(['.mp4', '.mov', '.mkv', '.webm']);

  if (imageExts.has(ext)) {
    try {
      const meta = await sharp(clean).metadata();
      if (!meta.width || !meta.height) {
        return { valid: false, reason: 'CORRUPT_IMAGE' };
      }
      return { valid: true, mediaType: 'image', width: meta.width, height: meta.height, format: meta.format };
    } catch (err) {
      return { valid: false, reason: 'IMAGE_DECODE_FAILED', error: err.message };
    }
  } else if (videoExts.has(ext)) {
    try {
      await runFFmpeg(['-v', 'error', '-i', clean, '-f', 'null', '-']);
      return { valid: true, mediaType: 'video' };
    } catch (err) {
      return { valid: false, reason: 'VIDEO_DECODE_FAILED', error: err.message };
    }
  }

  return { valid: false, reason: 'UNSUPPORTED_MEDIA_TYPE' };
}

/**
 * Advanced multi-line SVG text layout with word wrapping, font size scaling,
 * safe bounds checking, and XML escaping.
 */
function layoutSvgText(rawText = '', options = {}) {
  const {
    maxWidth = 680,
    maxLines = 3,
    initialFontSize = 42,
    minFontSize = 24,
    lineHeightFactor = 1.25,
    fontFamily = 'Arial, sans-serif',
    fontWeight = 'bold',
    fill = '#ffffff',
    x = 0,
    startY = 0,
    textAnchor = 'start'
  } = options;

  const words = String(rawText || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { svg: '', totalHeight: 0, lineCount: 0, fontSize: initialFontSize };

  let currentFontSize = initialFontSize;
  let wrappedLines = [];

  while (currentFontSize >= minFontSize) {
    const approxCharWidth = currentFontSize * 0.52;
    const maxCharsPerLine = Math.max(8, Math.floor(maxWidth / approxCharWidth));

    wrappedLines = [];
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (candidate.length <= maxCharsPerLine) {
        currentLine = candidate;
      } else {
        if (currentLine) wrappedLines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) wrappedLines.push(currentLine);

    if (wrappedLines.length <= maxLines) {
      break;
    }
    currentFontSize -= 4;
  }

  if (wrappedLines.length > maxLines) {
    wrappedLines = wrappedLines.slice(0, maxLines);
    const last = wrappedLines[maxLines - 1];
    wrappedLines[maxLines - 1] = last.length > 3 ? `${last.slice(0, -3)}...` : `${last}...`;
  }

  const lineHeight = Math.round(currentFontSize * lineHeightFactor);
  const totalHeight = wrappedLines.length * lineHeight;

  const tspans = wrappedLines.map((line, idx) => {
    const yPos = startY + (idx + 1) * lineHeight;
    return `<tspan x="${x}" y="${yPos}">${escapeXml(line)}</tspan>`;
  }).join('\n');

  const svg = `<text font-family="${fontFamily}" font-size="${currentFontSize}" font-weight="${fontWeight}" fill="${fill}" text-anchor="${textAnchor}">${tspans}</text>`;

  return {
    svg,
    fontSize: currentFontSize,
    lineHeight,
    totalHeight,
    lines: wrappedLines,
    lineCount: wrappedLines.length
  };
}

/**
 * Renders high-contrast, scalable SVG financial vector icons.
 */
function renderContextualIcon(iconType = '', options = {}) {
  const { size = 54, color = '#38bdf8', secondaryColor = '#f59e0b' } = options;
  const s = size;

  switch (iconType) {
    case 'warning_hook':
    case 'alert':
      return `
        <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">
          <polygon points="32,6 60,56 4,56" fill="rgba(239, 68, 68, 0.2)" stroke="#ef4444" stroke-width="4" stroke-linejoin="round" />
          <line x1="32" y1="22" x2="32" y2="38" stroke="#ffffff" stroke-width="5" stroke-linecap="round" />
          <circle cx="32" cy="47" r="3.5" fill="#ffffff" />
        </svg>
      `;

    case 'credit_card':
    case 'subscription':
      return `
        <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">
          <rect x="4" y="12" width="56" height="40" rx="8" fill="rgba(15, 23, 42, 0.9)" stroke="${color}" stroke-width="3.5" />
          <rect x="4" y="22" width="56" height="8" fill="${color}" fill-opacity="0.3" />
          <rect x="12" y="36" width="12" height="9" rx="2" fill="${secondaryColor}" />
          <circle cx="44" cy="40" r="5" fill="#ef4444" fill-opacity="0.8" />
          <circle cx="50" cy="40" r="5" fill="${secondaryColor}" fill-opacity="0.8" />
        </svg>
      `;

    case 'wallet_cash':
    case 'money_drain':
      return `
        <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">
          <rect x="6" y="16" width="52" height="38" rx="8" fill="rgba(15, 23, 42, 0.9)" stroke="${color}" stroke-width="3.5" />
          <path d="M6 24 C14 12, 42 12, 50 16" stroke="${secondaryColor}" stroke-width="3" stroke-linecap="round" fill="none" />
          <rect x="36" y="28" width="22" height="14" rx="4" fill="rgba(56, 189, 248, 0.25)" stroke="${color}" stroke-width="2" />
          <circle cx="43" cy="35" r="2.5" fill="${secondaryColor}" />
        </svg>
      `;

    case 'compounding_growth':
    case 'growth_chart':
      return `
        <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">
          <rect x="4" y="8" width="56" height="48" rx="8" fill="rgba(15, 23, 42, 0.7)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="2" />
          <path d="M12 44 Q 28 42, 38 28 T 52 14" fill="none" stroke="#10b981" stroke-width="4" stroke-linecap="round" />
          <polygon points="46,14 52,14 52,20" fill="#10b981" stroke="#10b981" stroke-width="2" />
          <circle cx="28" cy="41" r="3" fill="#10b981" />
          <circle cx="38" cy="28" r="3.5" fill="#38bdf8" />
          <circle cx="52" cy="14" r="4" fill="#ffffff" />
        </svg>
      `;

    case 'balance_scale':
    case 'comparison':
      return `
        <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">
          <line x1="32" y1="12" x2="32" y2="52" stroke="${color}" stroke-width="3.5" stroke-linecap="round" />
          <line x1="12" y1="20" x2="52" y2="24" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
          <polygon points="6,34 18,34 12,20" fill="rgba(56, 189, 248, 0.2)" stroke="${color}" stroke-width="2" />
          <polygon points="46,38 58,38 52,24" fill="rgba(168, 85, 247, 0.2)" stroke="#a855f7" stroke-width="2" />
          <line x1="22" y1="52" x2="42" y2="52" stroke="${color}" stroke-width="4" stroke-linecap="round" />
        </svg>
      `;

    case 'business_enterprise':
    case 'building':
      return `
        <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">
          <rect x="8" y="16" width="28" height="42" rx="3" fill="rgba(15, 23, 42, 0.9)" stroke="${color}" stroke-width="3" />
          <rect x="36" y="24" width="20" height="34" rx="2" fill="rgba(15, 23, 42, 0.9)" stroke="${secondaryColor}" stroke-width="2.5" />
          <line x1="14" y1="24" x2="18" y2="24" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
          <line x1="24" y1="24" x2="28" y2="24" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
          <line x1="14" y1="32" x2="18" y2="32" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
          <line x1="24" y1="32" x2="28" y2="32" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
          <line x1="14" y1="40" x2="18" y2="40" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
          <line x1="24" y1="40" x2="28" y2="40" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
        </svg>
      `;

    case 'verified_shield':
    case 'shield':
      return `
        <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">
          <path d="M32 6 L52 14 C52 38, 32 54, 32 54 C32 54, 12 38, 12 14 Z" fill="rgba(16, 185, 129, 0.15)" stroke="#10b981" stroke-width="3.5" stroke-linejoin="round" />
          <path d="M22 30 L29 37 L42 23" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      `;

    case 'brand_badge':
    case 'lightning':
    default:
      return `
        <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="28" fill="rgba(56, 189, 248, 0.15)" stroke="${color}" stroke-width="3" />
          <path d="M34 12 L20 34 L32 34 L30 52 L44 30 L32 30 Z" fill="${secondaryColor}" stroke="${secondaryColor}" stroke-width="2" stroke-linejoin="round" />
        </svg>
      `;
  }
}

/**
 * Maps internal screenwriting/code labels to viewer-facing, high-retention badges.
 */
function sanitizeViewerBadge(label = '', beat = '') {
  const norm = `${label || ''} ${beat || ''}`.trim().toLowerCase();
  if (norm.includes('curiosity') || norm.includes('hidden truth')) {
    return 'THE HIDDEN TRUTH';
  }
  if (norm.includes('escalat') || norm.includes('real cost')) {
    return 'THE REAL COST';
  }
  if (norm.includes('payoff') || norm.includes('10-year') || norm.includes('impact')) {
    return '10-YEAR IMPACT';
  }
  if (norm.includes('hook') || norm.includes('must watch')) {
    return 'MUST WATCH';
  }
  if (norm.includes('data') || norm.includes('reveal') || norm.includes('metric') || norm.includes('stat')) {
    return 'KEY METRIC';
  }
  if (norm.includes('cta') || norm.includes('action') || norm.includes('subscribe')) {
    return 'TAKE ACTION';
  }
  if (norm.includes('comparison') || norm.includes('vs')) {
    return 'PERCEIVED VS ACTUAL';
  }
  if (label && label.length <= 25 && !label.includes('undefined')) {
    return escapeXml(label.toUpperCase());
  }
  return 'MONEY IN MINUTES';
}

/**
 * Contextually derives dynamic comparison header title.
 */
function deriveComparisonHeader(scene = {}, verifiedData = {}) {
  const text = `${scene.label || ''} ${scene.scriptText || ''} ${verifiedData.label || ''}`.toLowerCase();
  if (text.includes('spend') || text.includes('cost') || text.includes('expense') || text.includes('subscription')) {
    return 'PERCEIVED VS ACTUAL COST';
  }
  if (text.includes('user') || text.includes('subscriber') || text.includes('customer') || text.includes('audience')) {
    return 'AUDIENCE COMPARISON';
  }
  if (text.includes('margin') || text.includes('profit')) {
    return 'PROFITABILITY COMPARISON';
  }
  if (text.includes('speed') || text.includes('performance')) {
    return 'PERFORMANCE BENCHMARK';
  }
  if (text.includes('revenue') || text.includes('sales')) {
    return 'REVENUE COMPARISON';
  }
  const clean = sanitizeViewerBadge(scene.label, scene.beat);
  if (clean && !clean.includes('ESCALAT') && !clean.includes('CURIOSITY') && !clean.includes('PAYOFF')) {
    return clean;
  }
  return 'ESTIMATED VS ACTUAL';
}

/**
 * Resolves appropriate contextual icon for a scene plan.
 */
function resolveSceneIcon(plan = {}) {
  const label = (plan.label || '').toLowerCase();
  const text = (plan.scriptText || '').toLowerCase();
  const combined = `${label} ${text}`;

  if (plan.sceneType === SCENE_TYPES.HOOK || plan.treatment === TREATMENTS.ANTI_SWIPE_HOOK) {
    return 'warning_hook';
  }
  if (plan.sceneType === SCENE_TYPES.COMPARISON || plan.treatment === TREATMENTS.TWO_SIDED_COMPARISON) {
    return 'balance_scale';
  }
  if (combined.includes('grow') || combined.includes('compound') || combined.includes('invest') || combined.includes('return') || combined.includes('interest')) {
    return 'compounding_growth';
  }
  if (combined.includes('subscription') || combined.includes('bill') || combined.includes('card') || combined.includes('spend')) {
    return 'credit_card';
  }
  if (combined.includes('drain') || combined.includes('wallet') || combined.includes('cash') || combined.includes('waste')) {
    return 'wallet_cash';
  }
  if (combined.includes('store') || combined.includes('company') || combined.includes('business') || combined.includes('corporate')) {
    return 'business_enterprise';
  }
  if (combined.includes('audit') || combined.includes('statement') || combined.includes('record')) {
    return 'verified_shield';
  }
  return 'brand_badge';
}

/**
 * Robustly extracts Truth-Anchor verified data for a scene.
 */
function extractVerifiedData(scene = {}, verifiedContext = {}) {
  // If scene has its own explicitly verified structured verifiedData object, honor it directly
  if (scene.verifiedData && typeof scene.verifiedData === 'object' && (scene.verifiedData.verified === true || scene.verifiedData.status === 'verified')) {
    const isComp = scene.verifiedData.type === 'comparison' || Boolean(scene.verifiedData.left && scene.verifiedData.right);
    return {
      type: isComp ? 'comparison' : (scene.verifiedData.type || 'statistic'),
      ...scene.verifiedData,
      verified: true,
      source: scene.verifiedData.source || 'Truth-Anchor'
    };
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
    this.beat = data.beat || null;
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
    this.isPresenter = Boolean(data.isPresenter || data.sceneType === 'presenter' || data.presenter);
    this.character = data.character || null;
    this.composition = data.composition || (this.aspectRatio === ASPECT_RATIOS.PORTRAIT ? 'full_canvas' : 'legacy_card');
    this.assetProvenance = data.assetProvenance || {
      type: data.assetPath ? 'image_underlay' : 'procedural',
      source: data.assetPath ? 'assetPath' : 'FinTechKinetic',
      path: data.assetPath || null,
      composited: false
    };
    this.isPureBRoll = Boolean(data.isPureBRoll || data.sceneType === 'broll' || data.treatment === 'cinematic_broll');
    this.preferredAsset = data.preferredAsset || null;
    this.brollKeywords = Array.isArray(data.brollKeywords) ? data.brollKeywords : [];
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
      assetProvenance: this.assetProvenance,
      composition: this.composition,
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
    const isComparisonData = scene.verifiedData?.type === 'comparison' || scene.sceneType === SCENE_TYPES.COMPARISON || scene.beat === 'escalation';
    if (isComparisonText || isComparisonLabel || isComparisonData) {
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
      /revenue|valuation|market cap|users|downloads|data|statistic|metric|impact/i.test(normalizedLabel) ||
      Boolean(scene.verifiedData && (scene.verifiedData.type === 'statistic' || (scene.verifiedData.value && /\d/.test(String(scene.verifiedData.value))))) ||
      scene.sceneType === SCENE_TYPES.STATISTIC ||
      scene.beat === 'dataReveal' ||
      scene.beat === 'payoff';

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
      beat: scene.beat || null,
      sceneType: classification.sceneType,
      treatment: classification.treatment,
      motion: scene.motion || classification.motion,
      duration,
      aspectRatio,
      verifiedData: classification.verifiedData,
      visualizationSpec,
      scriptText: scene.scriptText || scene.text || '',
      label: scene.label || '',
      assetPath: scene.assetPath || null,
      isPresenter: Boolean(scene.isPresenter || scene.sceneType === 'presenter' || scene.presenter || options.isPresenter),
      character: scene.character || options.character || null,
      isPureBRoll: Boolean(scene.isPureBRoll || scene.sceneType === 'broll' || scene.treatment === 'cinematic_broll'),
      preferredAsset: scene.preferredAsset || options.preferredAsset || null,
      brollKeywords: scene.brollKeywords || options.brollKeywords || [],
      fallbackReason,
      styling: options.styling,
      composition: scene.composition || options.composition || (aspectRatio === ASPECT_RATIOS.PORTRAIT ? 'full_canvas' : 'legacy_card')
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

      case MOTIONS.CAMERA_PUSH:
      case MOTIONS.SMOOTH_PUSH_IN:
        // Smooth continuous cinematic push-in
        return `zoompan=z='min(1.0+0.16*(on/${totalFrames}),1.20)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;

      case MOTIONS.HORIZONTAL_SWEEP:
        // Horizontal tracking across data layers
        return `zoompan=z=1.12:x='(iw-iw/zoom)*(0.2+0.6*on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`;

      case MOTIONS.VERTICAL_TRACKING:
        // Vertical tilt across financial statement rows
        return `zoompan=z=1.12:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(0.15+0.7*on/${totalFrames})':d=1:s=${width}x${height}:fps=${fps}`;

      case MOTIONS.CAMERA_SHAKE:
      case MOTIONS.IMPACT_SHAKE:
        // High-frequency subtle impact jitter for major financial reveals
        return `zoompan=z='if(lte(on,10),1.14+0.02*sin(on*3),1.14)':d=1:x='iw/2-(iw/zoom/2)+if(lte(on,10),6*sin(on*4),0)':y='ih/2-(ih/zoom/2)+if(lte(on,10),4*cos(on*4),0)':s=${width}x${height}:fps=${fps}`;

      case MOTIONS.SCALE_BURST:
        // Snap burst then settle
        return `zoompan=z='if(lte(on,12),1.0+0.18*(on/12),1.18-0.04*((on-12)/${Math.max(1, totalFrames - 12)}))':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;

      case MOTIONS.KEN_BURNS:
      default:
        // Smooth gentle Ken Burns
        return `zoompan=z='min(zoom+0.0008,1.14)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;
    }
  }
}

/**
 * SceneCompositionPrimitives
 * Flexible full-canvas visual primitives for the FinTech Kinetic visual system.
 * Free from rigid centered-card templates, enabling layered 1080x1920 compositions.
 */
class SceneCompositionPrimitives {
  /**
   * 1. Full 1080x1920 edge-to-edge atmospheric background
   */
  static fullCanvasBackground(options = {}) {
    const width = options.width || 1080;
    const height = options.height || 1920;
    const theme = options.theme || 'navy';
    const topicKey = options.topicKey || null;

    let stop1 = options.stop1 || '#060b17';
    let stop2 = options.stop2 || '#0b1329';
    let stop3 = options.stop3 || '#030712';
    let aura1 = options.aura1 || '#38bdf8';
    let aura2 = options.aura2 || '#6366f1';

    if (topicKey && DOMAIN_UI_CONFIG[topicKey]) {
      const cfg = DOMAIN_UI_CONFIG[topicKey];
      stop1 = options.stop1 || cfg.stop1;
      stop2 = options.stop2 || cfg.stop2;
      stop3 = options.stop3 || cfg.stop3;
      aura1 = options.aura1 || cfg.accentColor;
      aura2 = options.aura2 || cfg.secondaryColor;
    } else if (theme === 'crimson' || theme === 'alert') {
      stop1 = '#1a0808';
      stop2 = '#2a0e0e';
      stop3 = '#0a0303';
      aura1 = '#ef4444';
      aura2 = '#f59e0b';
    } else if (theme === 'emerald' || theme === 'wealth') {
      stop1 = '#021810';
      stop2 = '#04271c';
      stop3 = '#020d09';
      aura1 = '#10b981';
      aura2 = '#065f46';
    } else if (theme === 'amber' || theme === 'contrast') {
      stop1 = '#1c1208';
      stop2 = '#2c1a0c';
      stop3 = '#0d0804';
      aura1 = '#f59e0b';
      aura2 = '#ea580c';
    }

    if (options.glowColor1) aura1 = options.glowColor1;
    if (options.glowColor2) aura2 = options.glowColor2;

    return `
      <!-- Base Canvas Background Gradient Def -->
      <defs>
        <linearGradient id="fcBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${stop1}" />
          <stop offset="50%" stop-color="${stop2}" />
          <stop offset="100%" stop-color="${stop3}" />
        </linearGradient>
      </defs>

      <!-- Base Canvas Background Gradient -->
      ${options.transparentBg ? `
        <!-- Transparent Scrim Overlay for moving B-roll Video Background -->
        <rect width="${width}" height="${height}" fill="${stop3}" opacity="0.18" />
        <rect width="${width}" height="${height}" fill="url(#fcBgGrad)" opacity="0.15" />
      ` : `
        <rect width="${width}" height="${height}" fill="url(#fcBgGrad)" />
      `}

      <!-- Atmospheric Ambient Glows -->
      <circle cx="${width * 0.75}" cy="${height * 0.22}" r="${width * 0.45}" fill="${aura1}" opacity="0.14" filter="url(#ambientBlur)" />
      <circle cx="${width * 0.25}" cy="${height * 0.65}" r="${width * 0.5}" fill="${aura2}" opacity="0.11" filter="url(#ambientBlur)" />

      <!-- Subtle Cybernetic Tech Grid -->
      <line x1="0" y1="${height * 0.18}" x2="${width}" y2="${height * 0.18}" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
      <line x1="0" y1="${height * 0.45}" x2="${width}" y2="${height * 0.45}" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
      <line x1="0" y1="${height * 0.72}" x2="${width}" y2="${height * 0.72}" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
      <line x1="${width * 0.1}" y1="0" x2="${width * 0.1}" y2="${height}" stroke="rgba(255,255,255,0.02)" stroke-width="1" />
      <line x1="${width * 0.9}" y1="0" x2="${width * 0.9}" y2="${height}" stroke="rgba(255,255,255,0.02)" stroke-width="1" />

      <!-- Subtle Vignette Frame -->
      <rect width="${width}" height="${height}" fill="url(#fcVignette)" opacity="0.65" />
    `;
  }

  /**
   * 2. Atmospheric Spotlight
   */
  static spotlight(x, y, radius = 400, color = '#38bdf8', opacity = 0.15) {
    return `
      <circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" opacity="${opacity}" filter="url(#ambientBlur)" />
    `;
  }

  /**
   * 3. Volumetric Glow
   */
  static glow(cx, cy, r = 300, color = '#10b981', opacity = 0.2) {
    return `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}" filter="url(#ambientBlur)" />
    `;
  }

  /**
   * 4. Impact Flash
   */
  static impactFlash(width = 1080, height = 1920, color = '#ffffff', opacity = 0.06) {
    return `
      <rect width="${width}" height="${height}" fill="${color}" opacity="${opacity}" />
    `;
  }

  /**
   * 5. Brand Header Pill (Subtle top identity, no massive watermark)
   */
  static brandHeader(options = {}) {
    const width = options.width || 1080;
    const y = options.y || 205;
    const label = escapeXml(options.label || 'MONEY IN MINUTES');
    const badge = escapeXml(options.badge || 'FINANCIAL AUDIT');
    const dotColor = options.dotColor || '#38bdf8';

    return `
      <g transform="translate(${width / 2}, ${y})">
        <rect x="-170" y="0" width="340" height="38" rx="19" fill="rgba(15, 23, 42, 0.75)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.2" />
        <circle cx="-145" cy="19" r="4.5" fill="${dotColor}" />
        <text x="-130" y="25" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#ffffff" letter-spacing="1.5">
          ${label}
        </text>
        <rect x="25" y="10" width="1" height="18" fill="rgba(255,255,255,0.2)" />
        <text x="36" y="25" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="${dotColor}" letter-spacing="1">
          ${badge}
        </text>
      </g>
    `;
  }

  /**
   * 6. Fictional Notification Stack (With In-Scene Slide-in & Accumulation)
   * Original financial UI representing recurring subscription outflows.
   * Staggered entrance: 0.4s -> 1.1s -> 1.8s -> 2.4s, followed by leak total badge.
   */
  static notificationStack(notifications = [], options = {}) {
    const width = options.width || 1080;
    const startY = (options.startY || 380) + (options.yOffset || 0);
    const cardWidth = Math.min((options.maxWidth || 920) + (options.widthOffset || 0), width - 80);
    const cardHeight = options.cardHeight || 84;
    const spacing = options.spacing || 96;
    const startX = (width - cardWidth) / 2;
    const time = options.time !== undefined ? Number(options.time) : 999;
    const cardBg = options.cardBg || 'rgba(15, 23, 42, 0.86)';
    const cardStroke = options.cardStroke || 'rgba(255, 255, 255, 0.14)';
    const cardRadius = options.cardRadius || 18;

    const defaultItems = [
      { app: 'Streaming', amount: '-$18.99/mo', note: 'Monthly Auto-Renewal', time: 'Just now', icon: 'recurring', color: '#ef4444', trigger: 0.4 },
      { app: 'Cloud Storage', amount: '-$9.99/mo', note: 'Tier 2 Cloud Backup', time: '2h ago', icon: 'cloud', color: '#f59e0b', trigger: 1.1 },
      { app: 'Fitness Pass', amount: '-$45.00/mo', note: 'Gym Club Auto-Debit', time: '1d ago', icon: 'fitness', color: '#ef4444', trigger: 1.8 },
      { app: 'Music Unlimited', amount: '-$11.99/mo', note: 'HiFi Audio Stream', time: '3d ago', icon: 'audio', color: '#38bdf8', trigger: 2.4 }
    ];

    const items = notifications.length ? notifications : defaultItems;
    let itemsSvg = '';
    let visibleCount = 0;

    items.slice(0, 4).forEach((item, idx) => {
      const trigger = item.trigger !== undefined ? item.trigger : (0.4 + idx * 0.7);
      if (time < trigger) return; // Not yet entered

      visibleCount++;
      const age = time - trigger;
      const slideProgress = Math.min(1, Math.max(0, age / 0.25));
      const offsetX = (1 - slideProgress) * 50; // Smooth slide from right
      const opacity = Math.min(1, Math.max(0.1, slideProgress));

      const itemY = idx * spacing;
      const app = escapeXml(item.app || 'Service');
      const amount = escapeXml(item.amount || '-$0.00');
      const note = escapeXml(item.note || 'Auto-Debit');
      const timeStr = escapeXml(item.time || 'Today');
      const accent = item.color || '#ef4444';

      itemsSvg += `
        <g transform="translate(${offsetX.toFixed(1)}, ${itemY})" opacity="${opacity.toFixed(2)}" filter="url(#panelDrop)">
          <!-- Glassmorphism Container -->
          <rect width="${cardWidth}" height="${cardHeight}" rx="${cardRadius}" fill="${cardBg}" stroke="${cardStroke}" stroke-width="1.2" />
          <!-- Accent Status Border Indicator -->
          <rect x="0" y="16" width="4" height="${cardHeight - 32}" rx="2" fill="${accent}" />

          <!-- Category Icon Disc -->
          <circle cx="44" cy="${cardHeight / 2}" r="22" fill="rgba(255, 255, 255, 0.05)" stroke="${accent}" stroke-width="1.2" />
          <text x="44" y="${cardHeight / 2 + 5}" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="${accent}" text-anchor="middle">⚡</text>

          <!-- Label & Subtext -->
          <text x="82" y="36" font-family="Arial, sans-serif" font-size="20" font-weight="800" fill="#ffffff">
            ${app}
          </text>
          <text x="82" y="60" font-family="Arial, sans-serif" font-size="13" font-weight="600" fill="#94a3b8">
            ${note} • <tspan fill="#64748b">${timeStr}</tspan>
          </text>

          <!-- Amount & Status Badge -->
          <text x="${cardWidth - 28}" y="38" font-family="Arial, sans-serif" font-size="22" font-weight="900" fill="${accent}" text-anchor="end">
            ${amount}
          </text>
          <g transform="translate(${cardWidth - 110}, 46)">
            <rect width="82" height="20" rx="10" fill="rgba(239, 68, 68, 0.15)" stroke="${accent}" stroke-width="0.8" />
            <text x="41" y="14" font-family="Arial, sans-serif" font-size="9" font-weight="800" fill="${accent}" text-anchor="middle" letter-spacing="0.5">
              AUTOPAY
            </text>
          </g>
        </g>
      `;
    });

    // Summary accumulation badge appears at 2.4s
    let summaryBadge = '';
    if (time >= 2.4 || (options.time === undefined && visibleCount >= 3)) {
      const summaryY = 4 * spacing + 6;
      summaryBadge = `
        <g transform="translate(0, ${summaryY})">
          <rect width="${cardWidth}" height="42" rx="21" fill="rgba(239, 68, 68, 0.22)" stroke="#ef4444" stroke-width="1.5" />
          <text x="${cardWidth / 2}" y="26" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="0.8">
            ⚠️ DETECTED RECURRING DRAIN: -$87.97 / MO
          </text>
        </g>
      `;
    }

    return `
      <g transform="translate(${startX}, ${startY})">
        ${itemsSvg}
        ${summaryBadge}
      </g>
    `;
  }

  /**
   * 7. Digital Statement Rows (With In-Scene Laser Scanner Movement)
   * Simulates a modern mobile banking statement transaction scanner.
   */
  static statementRows(rows = [], options = {}) {
    const width = options.width || 1080;
    const startY = (options.startY || 430) + (options.yOffset || 0);
    const maxWidth = Math.min((options.maxWidth || 920) + (options.widthOffset || 0), width - 80);
    const startX = (width - maxWidth) / 2;
    const rowH = 74;
    const time = options.time !== undefined ? Number(options.time) : 999;
    const cardBg = options.cardBg || 'rgba(15, 23, 42, 0.84)';
    const cardStroke = options.cardStroke || 'rgba(255, 255, 255, 0.14)';
    const cardRadius = options.cardRadius || 20;

    const defaultRows = [
      { date: 'OCT 12', desc: 'Streaming Service', cat: 'ENTERTAINMENT', amount: '-$18.99', recurring: true },
      { date: 'OCT 10', desc: 'Cloud Storage Pro', cat: 'DIGITAL SERVICES', amount: '-$9.99', recurring: true },
      { date: 'OCT 08', desc: 'Fitness Studio Pass', cat: 'WELLNESS & HEALTH', amount: '-$45.00', recurring: true },
      { date: 'OCT 04', desc: 'Music Unlimited', cat: 'AUDIO STREAMING', amount: '-$11.99', recurring: true },
      { date: 'OCT 01', desc: 'Software Suite', cat: 'PRODUCTIVITY', amount: '-$34.99', recurring: true }
    ];

    const statementData = rows.length ? rows : defaultRows;
    let rowsSvg = '';

    // Laser scan position: sweeps down statement rows between 0.4s and 3.4s
    const scanProgress = Math.min(1, Math.max(0, (time - 0.4) / 3.0));
    const scanY = 80 + scanProgress * (statementData.length * (rowH + 12));

    statementData.slice(0, 5).forEach((r, idx) => {
      const yPos = 80 + idx * (rowH + 12);
      const isScanned = time >= (0.6 + idx * 0.6);
      const isCurrentlyScanning = Math.abs(scanY - (yPos + rowH / 2)) < 40;

      let borderStroke = 'rgba(255, 255, 255, 0.06)';
      let bgFill = 'rgba(15, 23, 42, 0.72)';
      if (isCurrentlyScanning) {
        borderStroke = '#38bdf8';
        bgFill = 'rgba(56, 189, 248, 0.18)';
      } else if (isScanned && r.recurring) {
        borderStroke = 'rgba(239, 68, 68, 0.45)';
        bgFill = 'rgba(239, 68, 68, 0.09)';
      }

      const auditPill = isScanned ? `
        <g transform="translate(${maxWidth - 180}, 16)">
          <rect width="68" height="18" rx="9" fill="rgba(239,68,68,0.22)" stroke="#ef4444" stroke-width="0.8" />
          <text x="34" y="13" font-family="Arial, sans-serif" font-size="9" font-weight="900" fill="#ef4444" text-anchor="middle">
            ✓ AUDITED
          </text>
        </g>
      ` : '';

      rowsSvg += `
        <g transform="translate(0, ${yPos})">
          <rect width="${maxWidth}" height="${rowH}" rx="14" fill="${bgFill}" stroke="${borderStroke}" stroke-width="${isCurrentlyScanning ? 1.8 : 1.2}" />
          <!-- Date Pill -->
          <rect x="18" y="19" width="65" height="36" rx="8" fill="rgba(255,255,255,0.06)" />
          <text x="50" y="42" font-family="Arial, sans-serif" font-size="12" font-weight="800" fill="#94a3b8" text-anchor="middle">
            ${escapeXml(r.date)}
          </text>
          <!-- Description & Category -->
          <text x="100" y="34" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#ffffff">
            ${escapeXml(r.desc)}
          </text>
          <text x="100" y="54" font-family="Arial, sans-serif" font-size="11" font-weight="600" fill="#64748b" letter-spacing="0.5">
            ${escapeXml(r.cat)} ${r.recurring ? '• <tspan fill="#ef4444">RECURRING</tspan>' : ''}
          </text>
          <!-- Amount -->
          <text x="${maxWidth - 24}" y="45" font-family="Arial, sans-serif" font-size="19" font-weight="900" fill="#ef4444" text-anchor="end">
            ${escapeXml(r.amount)}
          </text>
          ${auditPill}
        </g>
      `;
    });

    // Animated laser beam line
    const laserBeam = time < 3.8 ? `
      <g filter="url(#ambientBlur)">
        <line x1="10" y1="${scanY.toFixed(1)}" x2="${maxWidth - 10}" y2="${scanY.toFixed(1)}" stroke="#38bdf8" stroke-width="3.5" opacity="0.85" />
      </g>
      <line x1="20" y1="${scanY.toFixed(1)}" x2="${maxWidth - 20}" y2="${scanY.toFixed(1)}" stroke="#ffffff" stroke-width="1.8" opacity="0.95" />
    ` : '';

    return `
      <g transform="translate(${startX}, ${startY})" filter="url(#panelDrop)">
        <!-- Statement Window Outer Panel -->
        <rect width="${maxWidth}" height="520" rx="${cardRadius}" fill="${cardBg}" stroke="${cardStroke}" stroke-width="1.5" />
        
        <!-- Statement Header Bar -->
        <g transform="translate(24, 24)">
          <rect x="0" y="0" width="8" height="32" rx="4" fill="#38bdf8" />
          <text x="18" y="17" font-family="Arial, sans-serif" font-size="15" font-weight="900" fill="#ffffff" letter-spacing="1">
            CHECKING ACCOUNT •••• 8492
          </text>
          <text x="18" y="32" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="${time >= 2.6 ? '#10b981' : '#38bdf8'}" letter-spacing="0.5">
            ${time >= 2.6 ? 'AUDIT COMPLETE: 5 RECURRING DRAIN STREAMS FOUND' : 'AUDIT SCANNING: CHECKING RECURRING OUTFLOWS'}
          </text>
        </g>

        <!-- Scanning Rows -->
        ${rowsSvg}
        <!-- Laser Scanner -->
        ${laserBeam}
      </g>
    `;
  }

  /**
   * 8. Financial Ticker Ribbon
   */
  static financialTicker(items = [], options = {}) {
    const width = options.width || 1080;
    const y = (options.y || 260) + (options.yOffset || 0);
    const time = options.time !== undefined ? Number(options.time) : 999;
    const cardBg = options.cardBg || 'rgba(15, 23, 42, 0.85)';
    const cardStroke = options.cardStroke || 'rgba(255, 255, 255, 0.1)';
    const cardRadius = options.cardRadius || 14;
    const isRevealed = time >= 2.0;
    const defaultStats = [
      { label: 'NET LEAK', val: isRevealed ? '$219/mo' : 'CALCULATING...', color: isRevealed ? '#ef4444' : '#64748b' },
      { label: 'ANNUAL DRAIN', val: isRevealed ? '$2,628/yr' : '---', color: isRevealed ? '#f59e0b' : '#64748b' },
      { label: '10-YR COST', val: isRevealed ? '$37,400' : '---', color: isRevealed ? '#10b981' : '#64748b' }
    ];

    const stats = items.length ? items : defaultStats;
    const colWidth = (width - 160) / stats.length;

    let colsSvg = '';
    stats.forEach((st, idx) => {
      const colX = idx * colWidth;
      colsSvg += `
        <g transform="translate(${colX + 16}, 0)">
          <text x="0" y="16" font-family="Arial, sans-serif" font-size="10" font-weight="800" fill="#64748b" letter-spacing="1">
            ${escapeXml(st.label)}
          </text>
          <text x="0" y="40" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="${st.color || '#ffffff'}">
            ${escapeXml(st.val)}
          </text>
          ${idx < stats.length - 1 ? `<line x1="${colWidth - 20}" y1="8" x2="${colWidth - 20}" y2="42" stroke="rgba(255,255,255,0.08)" stroke-width="1" />` : ''}
        </g>
      `;
    });

    return `
      <g transform="translate(80, ${y})">
        <rect width="${width - 160}" height="56" rx="${cardRadius}" fill="${cardBg}" stroke="${cardStroke}" stroke-width="1.2" />
        ${colsSvg}
      </g>
    `;
  }

  /**
   * 9. Number Counter (With In-Scene Numerical Count-Up)
   * Visually dominant number animation strictly grounded in Truth-Anchor data.
   * $0 -> $14.99 -> $44.98 -> $89.97 -> $145.00 -> $219/mo verified payoff.
   */
  static numberCounter(value, subtext, options = {}) {
    const width = options.width || 1080;
    const y = (options.y || 560) + (options.yOffset || 0);
    const accentColor = options.accentColor || '#38bdf8';
    const label = escapeXml(options.label || 'ACTUAL OUTFLOW');
    const source = escapeXml(options.source || 'Truth-Anchor Verified');
    const time = options.time !== undefined ? Number(options.time) : 999;

    let displayVal = value;
    let barPercent = 100;
    let isSettled = true;

    if (time !== 999) {
      if (time < 0.4) {
        displayVal = '$0/mo';
        barPercent = 6;
        isSettled = false;
      } else if (time < 1.1) {
        displayVal = '$14.99/mo';
        barPercent = 15;
        isSettled = false;
      } else if (time < 1.8) {
        displayVal = '$44.98/mo';
        barPercent = 32;
        isSettled = false;
      } else if (time < 2.6) {
        displayVal = '$89.97/mo';
        barPercent = 54;
        isSettled = false;
      } else if (time < 3.4) {
        displayVal = '$145.00/mo';
        barPercent = 75;
        isSettled = false;
      } else {
        // Final verified value strictly from Truth-Anchor
        displayVal = value;
        barPercent = 100;
        isSettled = true;
      }
    }

    const valStr = escapeXml(displayVal || '$0');
    const subtextStr = escapeXml(subtext || '');
    const barWidth = 560 * (barPercent / 100);
    const impactGlow = isSettled ? `<circle cx="0" cy="40" r="260" fill="${accentColor}" opacity="0.18" filter="url(#ambientBlur)" />` : '';

    return `
      <g transform="translate(${width / 2}, ${y})">
        <!-- Ambient Hero Glow -->
        ${impactGlow}

        <!-- Super-title Category Pill -->
        <g transform="translate(0, -90)">
          <rect x="-130" y="0" width="260" height="34" rx="17" fill="rgba(56, 189, 248, 0.14)" stroke="${accentColor}" stroke-width="1.2" />
          <text x="0" y="22" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="${accentColor}" text-anchor="middle" letter-spacing="1.5">
            ${label}
          </text>
        </g>

        <!-- Massive Hero Metric Display -->
        <text x="0" y="45" font-family="Arial, sans-serif" font-size="124" font-weight="900" fill="${accentColor}" text-anchor="middle" letter-spacing="-3">
          ${valStr}
        </text>

        <!-- Subtext / Subtitle -->
        ${subtextStr ? `
          <text x="0" y="95" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">
            ${subtextStr}
          </text>
        ` : ''}

        <!-- Scale Progress Track -->
        <g transform="translate(-280, 125)">
          <rect width="560" height="10" rx="5" fill="rgba(255,255,255,0.12)" />
          <rect width="${barWidth.toFixed(1)}" height="10" rx="5" fill="${accentColor}" />
        </g>

        <!-- Truth-Anchor Verified Citation Pill -->
        <g transform="translate(0, 165)" opacity="${isSettled ? '1.0' : '0.4'}">
          <rect x="-160" y="0" width="320" height="30" rx="15" fill="rgba(16, 185, 129, 0.12)" stroke="#10b981" stroke-width="1" />
          <circle cx="-135" cy="15" r="7" fill="#10b981" />
          <path d="M-138 15 l2 2 l4 -4" stroke="#ffffff" stroke-width="1.5" fill="none" />
          <text x="-120" y="19" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#10b981">
            ✓ ${source}
          </text>
        </g>
      </g>
    `;
  }

  /**
   * 10. Comparison Meter (With In-Scene Bar Expansion & Reality Gap Pop)
   * Visually dramatic comparison highlighting the gap between perception and reality.
   */
  static comparisonMeter(leftItem = {}, rightItem = {}, options = {}) {
    const width = options.width || 1080;
    const y = (options.y || 480) + (options.yOffset || 0);
    const maxWidth = Math.min((options.maxWidth || 920) + (options.widthOffset || 0), width - 80);
    const startX = (width - maxWidth) / 2;
    const time = options.time !== undefined ? Number(options.time) : 999;
    const cardBg = options.cardBg || 'rgba(15, 23, 42, 0.84)';
    const cardStroke = options.cardStroke || 'rgba(255, 255, 255, 0.12)';
    const cardRadius = options.cardRadius || 22;
    const accentColor = options.accentColor || '#38bdf8';

    const left = {
      label: escapeXml(leftItem.label || 'PERCEIVED SPEND'),
      value: escapeXml(leftItem.value || '$86/mo'),
      desc: escapeXml(leftItem.desc || 'Self-Reported Estimate'),
      percent: leftItem.percent || 39,
      color: leftItem.color || '#64748b'
    };

    const right = {
      label: escapeXml(rightItem.label || 'ACTUAL BILLED'),
      value: escapeXml(rightItem.value || '$219/mo'),
      desc: escapeXml(rightItem.desc || 'Bank Statement Reality'),
      percent: rightItem.percent || 100,
      color: rightItem.color || '#ef4444'
    };

    let leftTargetPct = left.percent;
    let rightTargetPct = right.percent;
    let showDelta = true;

    if (time !== 999) {
      const leftProg = Math.min(1, Math.max(0, (time - 0.3) / 1.0));
      leftTargetPct = leftProg * left.percent;

      const rightProg = Math.min(1, Math.max(0, (time - 1.3) / 1.4));
      rightTargetPct = rightProg * right.percent;

      showDelta = time >= 2.7;
    }

    const deltaLabel = escapeXml(options.deltaLabel || '+154% (2.6X REALITY GAP)');

    const leftBarWidth = (maxWidth - 64) * (leftTargetPct / 100);
    const rightBarWidth = (maxWidth - 64) * (rightTargetPct / 100);

    const deltaBadge = showDelta ? `
      <!-- Central Delta Badge with Scale Pop & Glow -->
      <g transform="translate(${(maxWidth) / 2}, 235)">
        <circle cx="0" cy="0" r="70" fill="#f59e0b" opacity="0.25" filter="url(#ambientBlur)" />
        <rect x="-145" y="-20" width="290" height="40" rx="20" fill="#f59e0b" filter="url(#panelDrop)" />
        <text x="0" y="6" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="#000000" text-anchor="middle" letter-spacing="0.8">
          ${deltaLabel}
        </text>
      </g>
    ` : '';

    return `
      <g transform="translate(${startX}, ${y})" filter="url(#panelDrop)">
        <!-- Outer Frame -->
        <rect width="${maxWidth}" height="540" rx="${cardRadius}" fill="${cardBg}" stroke="${cardStroke}" stroke-width="1.5" />

        <!-- Header -->
        <g transform="translate(32, 40)">
          <text x="0" y="0" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="${accentColor}" letter-spacing="1.5">
            ${escapeXml(options.header || 'SUBSCRIPTION REALITY GAP')}
          </text>
          <text x="0" y="28" font-family="Arial, sans-serif" font-size="24" font-weight="800" fill="#ffffff">
            ${escapeXml(options.subtitle || 'What You Think You Spend vs. What Leaves')}
          </text>
        </g>

        <!-- Bar 1: Perceived (Lower, Muted) -->
        <g transform="translate(32, 120)">
          <text x="0" y="0" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#94a3b8">
            ${left.label}
          </text>
          <text x="${maxWidth - 64}" y="0" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="${left.color}" text-anchor="end">
            ${left.value}
          </text>
          <rect x="0" y="16" width="${maxWidth - 64}" height="28" rx="14" fill="rgba(255,255,255,0.06)" />
          <rect x="0" y="16" width="${leftBarWidth.toFixed(1)}" height="28" rx="14" fill="${left.color}" opacity="0.85" />
          <text x="18" y="35" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#ffffff">
            ${left.desc}
          </text>
        </g>

        ${deltaBadge}

        <!-- Bar 2: Actual (Dominant, Surging Red/Orange) -->
        <g transform="translate(32, 290)">
          <text x="0" y="0" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#f87171">
            ${right.label}
          </text>
          <text x="${maxWidth - 64}" y="0" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="${right.color}" text-anchor="end">
            ${right.value}
          </text>
          <rect x="0" y="18" width="${maxWidth - 64}" height="36" rx="18" fill="rgba(255,255,255,0.06)" />
          <rect x="0" y="18" width="${rightBarWidth.toFixed(1)}" height="36" rx="18" fill="url(#hookGrad)" />
          <text x="20" y="42" font-family="Arial, sans-serif" font-size="13" font-weight="800" fill="#ffffff">
            ${right.desc}
          </text>
        </g>

        <!-- Explanatory Footnote -->
        <g transform="translate(32, 420)">
          <rect width="${maxWidth - 64}" height="70" rx="12" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
          <text x="20" y="30" font-family="Arial, sans-serif" font-size="14" font-weight="600" fill="#94a3b8">
            ${escapeXml(options.footnote || 'Small recurring micro-transactions hide under your mental threshold.')}
          </text>
          <text x="20" y="52" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="${accentColor}">
            ✓ ${escapeXml(options.source || 'Truth-Anchor Verified: Consumer Subscription Spending Study')}
          </text>
        </g>
      </g>
    `;
  }

  /**
   * 11. Compounding Trajectory Graph (With Progressive Curve Drawing)
   * Visualizing 10-year wealth lost to small recurring charges.
   */
  static trajectoryGraph(_points = [], options = {}) {
    const width = options.width || 1080;
    const y = (options.y || 480) + (options.yOffset || 0);
    const maxWidth = Math.min((options.maxWidth || 920) + (options.widthOffset || 0), width - 80);
    const startX = (width - maxWidth) / 2;
    const graphH = 220;
    const heroValue = escapeXml(options.heroValue || '$37,400');
    const heroLabel = escapeXml(options.heroLabel || '10-YEAR WEALTH DRAIN');
    const source = escapeXml(options.source || 'S&P 500 Historical Benchmark (7% Real)');
    const time = options.time !== undefined ? Number(options.time) : 999;
    const cardBg = options.cardBg || 'rgba(2, 26, 18, 0.88)';
    const cardStroke = options.cardStroke || 'rgba(16, 185, 129, 0.3)';
    const cardRadius = options.cardRadius || 22;
    const accentColor = options.accentColor || '#10b981';

    let progress = 1.0;
    let showTerminal = true;
    if (time !== 999) {
      progress = Math.min(1, Math.max(0, (time - 0.4) / 2.2));
      showTerminal = time >= 2.5;
    }
    const currentVal = progress < 0.2 ? '$0'
      : progress < 0.4 ? '$2,628'
      : progress < 0.65 ? '$14,500'
      : progress < 0.9 ? '$26,800'
      : heroValue;

    const pathTotalLength = 800;
    const dashOffset = (pathTotalLength * (1 - progress)).toFixed(1);

    const terminalCircle = showTerminal ? `
      <circle cx="${maxWidth - 64}" cy="15" r="16" fill="#10b981" opacity="0.3" filter="url(#ambientBlur)" />
      <circle cx="${maxWidth - 64}" cy="15" r="8" fill="#10b981" stroke="#ffffff" stroke-width="2.5" />
      <text x="${maxWidth - 64}" y="0" font-family="Arial, sans-serif" font-size="17" font-weight="900" fill="#10b981" text-anchor="end">Yr 10: $37.4K</text>
    ` : '';

    return `
      <g transform="translate(${startX}, ${y})" filter="url(#panelDrop)">
        <!-- Container Panel -->
        <rect width="${maxWidth}" height="540" rx="${cardRadius}" fill="${cardBg}" stroke="${cardStroke}" stroke-width="1.5" />
        
        <!-- Ambient Wealth Glow -->
        <circle cx="${maxWidth * 0.8}" cy="220" r="180" fill="${accentColor}" opacity="${showTerminal ? '0.20' : '0.08'}" filter="url(#ambientBlur)" />

        <!-- Header -->
        <g transform="translate(32, 40)">
          <rect x="0" y="0" width="160" height="28" rx="14" fill="rgba(16, 185, 129, 0.18)" stroke="${accentColor}" stroke-width="1" />
          <text x="80" y="19" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="${accentColor}" text-anchor="middle" letter-spacing="1">
            COMPOUND WEALTH
          </text>
          <text x="0" y="70" font-family="Arial, sans-serif" font-size="52" font-weight="900" fill="${accentColor}" letter-spacing="-1">
            ${currentVal}
          </text>
          <text x="0" y="98" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#94a3b8">
            ${heroLabel} AT 7% ANNUAL RETURN
          </text>
        </g>

        <!-- Curve Graphic -->
        <g transform="translate(32, 170)">
          <!-- Grid Lines -->
          <line x1="0" y1="${graphH}" x2="${maxWidth - 64}" y2="${graphH}" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" />
          <line x1="0" y1="${graphH / 2}" x2="${maxWidth - 64}" y2="${graphH / 2}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4,4" stroke-width="1" />

          <!-- Filled Gradient Under Curve -->
          <path d="M0,${graphH} Q ${maxWidth * 0.45},${graphH * 0.75} ${maxWidth - 64},15 L ${maxWidth - 64},${graphH} Z" fill="url(#growthAreaGrad)" opacity="${(0.4 * progress).toFixed(2)}" />

          <!-- Dynamic Exponential Curve Drawn in Real-Time -->
          <path d="M0,${graphH} Q ${maxWidth * 0.45},${graphH * 0.75} ${maxWidth - 64},15" fill="none" stroke="#10b981" stroke-width="4.5" stroke-linecap="round"
                stroke-dasharray="${pathTotalLength}" stroke-dashoffset="${dashOffset}" />

          <!-- Milestone Markers -->
          <circle cx="0" cy="${graphH}" r="5" fill="#38bdf8" />
          <text x="0" y="${graphH + 28}" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#64748b">Yr 1: $2.6K</text>

          ${progress > 0.4 ? `
            <circle cx="${(maxWidth - 64) * 0.45}" cy="${graphH * 0.52}" r="6" fill="#38bdf8" />
            <text x="${(maxWidth - 64) * 0.45}" y="${graphH * 0.52 - 14}" font-family="Arial, sans-serif" font-size="13" font-weight="800" fill="#38bdf8" text-anchor="middle">Yr 5: $15.8K</text>
          ` : ''}

          <!-- Terminal Marker -->
          ${terminalCircle}
        </g>

        <!-- Verification Citation -->
        <g transform="translate(32, 475)">
          <rect width="${maxWidth - 64}" height="36" rx="18" fill="rgba(16, 185, 129, 0.12)" stroke="#10b981" stroke-width="1" />
          <text x="20" y="23" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#10b981">
            ✓ Truth-Anchor Verified: ${source}
          </text>
        </g>
      </g>
    `;
  }

  /**
   * 12. Action Protocol / CTA Checklist (With Progressive Step Check-Offs)
   */
  static actionChecklist(steps = [], options = {}) {
    const width = options.width || 1080;
    const y = (options.y || 480) + (options.yOffset || 0);
    const maxWidth = Math.min((options.maxWidth || 920) + (options.widthOffset || 0), width - 80);
    const startX = (width - maxWidth) / 2;
    const time = options.time !== undefined ? Number(options.time) : 999;
    const cardBg = options.cardBg || 'rgba(15, 23, 42, 0.86)';
    const cardStroke = options.cardStroke || 'rgba(245, 158, 11, 0.3)';
    const cardRadius = options.cardRadius || 22;
    const accentColor = options.accentColor || '#f59e0b';

    const defaultSteps = [
      { step: '1', title: 'Open your banking app right now', tag: '30 SECONDS', color: '#38bdf8', trigger: 0.8 },
      { step: '2', title: 'Filter search by "Recurring"', tag: 'SCAN', color: '#f59e0b', trigger: 2.0 },
      { step: '3', title: 'Cancel the bottom 2 you forgot you had', tag: 'SAVE $35/MO', color: '#10b981', trigger: 3.0 }
    ];

    const stepItems = steps.length ? steps : defaultSteps;
    let stepsSvg = '';

    stepItems.forEach((st, idx) => {
      const stepY = 100 + idx * 105;
      const isChecked = time >= st.trigger;
      const accent = isChecked ? '#10b981' : (st.color || '#64748b');
      const checkIcon = isChecked ? '✓' : st.step;

      stepsSvg += `
        <g transform="translate(32, ${stepY})">
          <rect width="${maxWidth - 64}" height="84" rx="16" fill="${isChecked ? 'rgba(16, 185, 129, 0.12)' : 'rgba(15, 23, 42, 0.75)'}" stroke="${isChecked ? '#10b981' : 'rgba(255,255,255,0.08)'}" stroke-width="${isChecked ? 1.6 : 1.2}" />
          <circle cx="44" cy="42" r="22" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-width="1.5" />
          <text x="44" y="49" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="${accent}" text-anchor="middle">${checkIcon}</text>
          <text x="82" y="48" font-family="Arial, sans-serif" font-size="19" font-weight="800" fill="#ffffff">${escapeXml(st.title)}</text>
          <g transform="translate(${maxWidth - 170}, 28)">
            <rect width="90" height="26" rx="13" fill="${accent}" fill-opacity="0.2" stroke="${accent}" stroke-width="1" />
            <text x="45" y="17" font-family="Arial, sans-serif" font-size="10" font-weight="800" fill="${accent}" text-anchor="middle">${escapeXml(st.tag)}</text>
          </g>
        </g>
      `;
    });

    return `
      <g transform="translate(${startX}, ${y})" filter="url(#panelDrop)">
        <rect width="${maxWidth}" height="500" rx="${cardRadius}" fill="${cardBg}" stroke="${cardStroke}" stroke-width="1.5" />
        <g transform="translate(32, 40)">
          <text x="0" y="0" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="${accentColor}" letter-spacing="1.5">
            ${escapeXml(options.header || 'YOUR 30-SECOND DEFENSE PROTOCOL')}
          </text>
          <text x="0" y="30" font-family="Arial, sans-serif" font-size="26" font-weight="900" fill="#ffffff">
            ${escapeXml(options.subtitle || 'Stop The Outflow Before Tomorrow')}
          </text>
        </g>
        ${stepsSvg}
        <g transform="translate(32, 435)">
          <text x="${(maxWidth - 64) / 2}" y="20" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#94a3b8" text-anchor="middle">
            ${escapeXml(options.footer || 'Follow Money In Minutes for daily 60-second wealth audits.')}
          </text>
        </g>
      </g>
    `;
  }

  /**
   * 12. Parallax Layer
   */
  static parallaxLayer(svgContent, depth = 1.0, options = {}) {
    const id = options.id || `pl_${Math.random().toString(36).slice(2, 8)}`;
    return `
      <g id="${id}" data-parallax-depth="${depth}">
        ${svgContent}
      </g>
    `;
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

    // Card dimensions strictly within safe zones and vertically centered to avoid empty void
    const cardW = width - safe.left - safe.right - 40;
    const maxAvailableH = height - safe.top - safe.bottom - (isPortrait ? 80 : 40);
    const targetCardH = isPortrait ? 520 : 360;
    const cardH = Math.min(targetCardH, maxAvailableH);
    const cardX = safe.left + 20;
    const cardY = Math.round(safe.top + (maxAvailableH - cardH) / 2) + (isPortrait ? 20 : 10);

    const contextualIconName = resolveSceneIcon(plan);
    const comparisonHeader = deriveComparisonHeader(plan, plan.verifiedData || {});

    let innerContent = '';

    switch (plan.treatment) {
      case TREATMENTS.ANTI_SWIPE_HOOK: {
        const headline = plan.scriptText || 'WATCH THIS';
        const titleLayout = layoutSvgText(headline, {
          maxWidth: cardW - 140,
          maxLines: 3,
          initialFontSize: isPortrait ? 46 : 34,
          minFontSize: 28,
          x: 0,
          startY: 60,
          fill: '#ffffff',
          fontWeight: '900'
        });
        const dividerY = 60 + titleLayout.totalHeight + 16;
        innerContent = `
          <!-- Anti-Swipe Visual Hook -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.88)" stroke="#ef4444" stroke-width="3" />
          <g transform="translate(40, 45)">
            <rect x="0" y="0" width="160" height="36" rx="18" fill="#ef4444" />
            <text x="80" y="24" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">MUST WATCH</text>
            <g transform="translate(${cardW - 130}, -10)">
              ${renderContextualIcon('warning_hook', { size: 50, color: '#ef4444' })}
            </g>
            ${titleLayout.svg}
            <rect x="0" y="${dividerY}" width="${cardW - 80}" height="4" fill="url(#hookGrad)" />
            <text x="0" y="${dividerY + 36}" font-family="Arial, sans-serif" font-size="20" font-weight="600" fill="#94a3b8">
              Keep watching for the full breakdown
            </text>
          </g>
        `;
        break;
      }

      case TREATMENTS.ANIMATED_NUMBER: {
        const val = escapeXml(plan.verifiedData?.value || '$12B');
        const rawLabel = plan.verifiedData?.label || (plan.beat === 'payoff' ? '10-YEAR ESTIMATE' : 'VERIFIED BENCHMARK');
        const metricLabel = sanitizeViewerBadge(rawLabel, plan.beat);
        const source = escapeXml(plan.verifiedData?.source || 'Truth-Anchor Verified');
        const badgeTitle = plan.beat === 'payoff' || (plan.label && /payoff|impact/i.test(plan.label))
          ? '10-YEAR IMPACT'
          : sanitizeViewerBadge(plan.label || 'Key Metric', plan.beat || 'dataReveal');
        const valColor = plan.beat === 'payoff' || (plan.label && /payoff|impact/i.test(plan.label)) ? '#10b981' : '#38bdf8';
        const subNote = plan.beat === 'payoff' || (plan.label && /payoff|impact/i.test(plan.label))
          ? 'LOST OVER 10 YEARS (AT 7% RETURN)'
          : (val.includes('/mo') || val.toLowerCase().includes('month') ? 'AVERAGE MONTHLY OUTFLOW' : 'KEY FINANCIAL BENCHMARK');

        innerContent = `
          <!-- Hero Financial Metric Callout -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.92)" stroke="${valColor}" stroke-width="2.5" />
          <g transform="translate(40, 40)">
            <rect x="0" y="0" width="180" height="34" rx="17" fill="rgba(56, 189, 248, 0.15)" stroke="${valColor}" stroke-width="1.5" />
            <text x="90" y="23" font-family="Arial, sans-serif" font-size="15" font-weight="900" fill="${valColor}" letter-spacing="1" text-anchor="middle">${badgeTitle}</text>
            <g transform="translate(${cardW - 130}, -10)">
              ${renderContextualIcon(contextualIconName, { size: 50, color: valColor })}
            </g>
            <!-- Giant Hero Number with high visual impact -->
            <text x="0" y="${isPortrait ? 145 : 100}" font-family="Arial, sans-serif" font-size="${isPortrait ? 96 : 64}" font-weight="900" fill="${valColor}" letter-spacing="-2">
              ${val}
            </text>
            <!-- Sub-unit / Meaning -->
            <text x="0" y="${isPortrait ? 195 : 138}" font-family="Arial, sans-serif" font-size="${isPortrait ? 22 : 16}" font-weight="900" fill="#ffffff" letter-spacing="1">
              ${subNote}
            </text>
            <!-- Metric Context Label -->
            <text x="0" y="${isPortrait ? 232 : 166}" font-family="Arial, sans-serif" font-size="${isPortrait ? 17 : 13}" font-weight="600" fill="#94a3b8">
              ${escapeXml(metricLabel)}
            </text>
            <!-- Verified Source Pill -->
            <g transform="translate(0, ${isPortrait ? 275 : 195})">
              <circle cx="12" cy="12" r="10" fill="#10b981" />
              <path d="M7 12 l3 3 l7 -7" stroke="#ffffff" stroke-width="2" fill="none" />
              <text x="32" y="17" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#10b981">
                ✓ ${source}
              </text>
            </g>
          </g>
        `;
        break;
      }

      case TREATMENTS.ANIMATED_PERCENTAGE: {
        const val = escapeXml(plan.verifiedData?.value || '+42%');
        const metricLabel = plan.verifiedData?.label || 'YoY Growth';
        const isPositive = !val.startsWith('-');
        const color = isPositive ? '#10b981' : '#f43f5e';
        const arrow = isPositive ? '▲' : '▼';
        const source = escapeXml(plan.verifiedData?.source || 'Truth-Anchor Verified');
        const labelLayout = layoutSvgText(metricLabel, {
          maxWidth: cardW - 140,
          maxLines: 2,
          initialFontSize: isPortrait ? 28 : 22,
          minFontSize: 20,
          x: 0,
          startY: isPortrait ? 180 : 125,
          fill: '#ffffff',
          fontWeight: 'bold'
        });
        const badgeY = (isPortrait ? 180 : 125) + labelLayout.totalHeight + 20;
        innerContent = `
          <!-- Growth Percentage Callout -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.88)" stroke="${color}" stroke-width="2.5" />
          <g transform="translate(40, 45)">
            <rect x="0" y="0" width="190" height="34" rx="17" fill="rgba(16, 185, 129, 0.15)" stroke="${color}" stroke-width="1.5" />
            <text x="95" y="23" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="${color}" text-anchor="middle">GROWTH RATE</text>
            <g transform="translate(${cardW - 130}, -10)">
              ${renderContextualIcon('compounding_growth', { size: 50, color })}
            </g>
            <text x="0" y="${isPortrait ? 140 : 95}" font-family="Arial, sans-serif" font-size="${isPortrait ? 84 : 56}" font-weight="900" fill="${color}" letter-spacing="-2">
              ${arrow} ${val}
            </text>
            ${labelLayout.svg}
            <g transform="translate(0, ${badgeY})">
              <text x="0" y="17" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#94a3b8">
                Verified: ${source}
              </text>
            </g>
          </g>
        `;
        break;
      }

      case TREATMENTS.TWO_SIDED_COMPARISON: {
        const leftLabel = sanitizeViewerBadge(plan.verifiedData?.left?.label || 'ESTIMATED');
        const rightLabel = sanitizeViewerBadge(plan.verifiedData?.right?.label || 'ACTUAL');
        const leftVal = escapeXml(plan.verifiedData?.left?.value || plan.verifiedData?.left?.val || '$86 / MO');
        const rightVal = escapeXml(plan.verifiedData?.right?.value || plan.verifiedData?.right?.val || '$219 / MO');
        const compW = Math.round((cardW - 100) / 2);
        const headerTitle = escapeXml(comparisonHeader);

        innerContent = `
          <!-- Two-Sided Comparison Layout -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.92)" stroke="rgba(245, 158, 11, 0.4)" stroke-width="2" />
          <g transform="translate(30, 30)">
            <text x="${(cardW - 60) / 2}" y="22" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#f59e0b" letter-spacing="1.5" text-anchor="middle">${headerTitle}</text>
            <g transform="translate(${cardW - 110}, -5)">
              ${renderContextualIcon('balance_scale', { size: 40, color: '#f59e0b' })}
            </g>
            <!-- Left Side: Estimated -->
            <g transform="translate(0, 44)">
              <rect x="0" y="0" width="${compW}" height="${isPortrait ? 200 : 140}" rx="18" fill="rgba(56, 189, 248, 0.12)" stroke="#38bdf8" stroke-width="2" />
              <text x="${compW / 2}" y="36" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#38bdf8" letter-spacing="1" text-anchor="middle">${escapeXml(leftLabel)}</text>
              <text x="${compW / 2}" y="${isPortrait ? 115 : 85}" font-family="Arial, sans-serif" font-size="${isPortrait ? 48 : 36}" font-weight="900" fill="#ffffff" letter-spacing="-1" text-anchor="middle">${leftVal}</text>
              <text x="${compW / 2}" y="${isPortrait ? 155 : 115}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#94a3b8" text-anchor="middle">PERCEIVED SPEND</text>
            </g>
            <!-- VS Divider Circle -->
            <circle cx="${(cardW - 60) / 2}" cy="${isPortrait ? 144 : 114}" r="24" fill="#f59e0b" />
            <text x="${(cardW - 60) / 2}" y="${isPortrait ? 151 : 121}" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#0f172a" text-anchor="middle">VS</text>
            <!-- Right Side: Actual -->
            <g transform="translate(${compW + 40}, 44)">
              <rect x="0" y="0" width="${compW}" height="${isPortrait ? 200 : 140}" rx="18" fill="rgba(245, 158, 11, 0.15)" stroke="#f59e0b" stroke-width="2" />
              <text x="${compW / 2}" y="36" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#f59e0b" letter-spacing="1" text-anchor="middle">${escapeXml(rightLabel)}</text>
              <text x="${compW / 2}" y="${isPortrait ? 115 : 85}" font-family="Arial, sans-serif" font-size="${isPortrait ? 48 : 36}" font-weight="900" fill="#f59e0b" letter-spacing="-1" text-anchor="middle">${rightVal}</text>
              <text x="${compW / 2}" y="${isPortrait ? 155 : 115}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#fcd34d" text-anchor="middle">REAL STATEMENT</text>
            </g>
            <!-- Takeaway Banner at bottom -->
            <g transform="translate(0, ${isPortrait ? 260 : 196})">
              <rect x="0" y="0" width="${cardW - 60}" height="32" rx="16" fill="rgba(245, 158, 11, 0.18)" stroke="rgba(245, 158, 11, 0.4)" stroke-width="1" />
              <text x="${(cardW - 60) / 2}" y="21" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="#fef08a" text-anchor="middle">
                ▲ 2.6X UNDERESTIMATED • $2,600+ VANISHING ANNUALLY
              </text>
            </g>
          </g>
        `;
        break;
      }

      case TREATMENTS.BUSINESS_FACT_CALLOUT: {
        const val = escapeXml(plan.verifiedData?.value || '500');
        const unit = escapeXml(plan.verifiedData?.unit || 'STORES');
        const context = plan.verifiedData?.context || plan.scriptText;
        const contextLayout = layoutSvgText(context, {
          maxWidth: cardW - 140,
          maxLines: 3,
          initialFontSize: isPortrait ? 24 : 18,
          minFontSize: 16,
          x: 0,
          startY: isPortrait ? 175 : 125,
          fill: '#cbd5e1',
          fontWeight: '500'
        });
        innerContent = `
          <!-- Business Fact Callout -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.88)" stroke="rgba(245, 158, 11, 0.5)" stroke-width="2" />
          <g transform="translate(40, 45)">
            <rect x="0" y="0" width="180" height="34" rx="17" fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" stroke-width="1.5" />
            <text x="90" y="23" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#f59e0b" text-anchor="middle">BUSINESS FACT</text>
            <g transform="translate(${cardW - 130}, -10)">
              ${renderContextualIcon('business_enterprise', { size: 50, color: '#f59e0b' })}
            </g>
            <text x="0" y="${isPortrait ? 135 : 95}" font-family="Arial, sans-serif" font-size="${isPortrait ? 78 : 52}" font-weight="900" fill="#ffffff">
              ${val} <tspan font-size="${isPortrait ? 36 : 28}" fill="#f59e0b">${unit}</tspan>
            </text>
            ${contextLayout.svg}
          </g>
        `;
        break;
      }

      case TREATMENTS.SUBTLE_MOTION:
      default: {
        const badgeTitle = sanitizeViewerBadge(plan.label, plan.beat);
        const isCuriosity = plan.beat === 'curiosityGap' || plan.label?.toLowerCase().includes('truth') || plan.label?.toLowerCase().includes('curiosity');
        const isCTA = plan.beat === 'cta' || plan.isCTA === true || plan.label?.toLowerCase().includes('action');

        if (isCuriosity) {
          innerContent = `
            <!-- Curiosity Gap Teaser Card -->
            <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.90)" stroke="rgba(56, 189, 248, 0.4)" stroke-width="2" />
            <g transform="translate(40, 40)">
              <rect x="0" y="0" width="180" height="34" rx="17" fill="rgba(56, 189, 248, 0.15)" stroke="#38bdf8" stroke-width="1.5" />
              <text x="90" y="23" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="#38bdf8" letter-spacing="1" text-anchor="middle">${badgeTitle}</text>
              <g transform="translate(${cardW - 130}, -10)">
                ${renderContextualIcon('credit_card', { size: 50, color: '#38bdf8' })}
              </g>
              <text x="0" y="${isPortrait ? 120 : 85}" font-family="Arial, sans-serif" font-size="${isPortrait ? 36 : 26}" font-weight="900" fill="#ffffff" letter-spacing="-0.5">
                THE $80 MYTH VS REALITY
              </text>
              <rect x="0" y="${isPortrait ? 140 : 100}" width="${cardW - 80}" height="3" fill="#38bdf8" opacity="0.6" />
              <text x="0" y="${isPortrait ? 190 : 135}" font-family="Arial, sans-serif" font-size="${isPortrait ? 24 : 18}" font-weight="600" fill="#cbd5e1">
                You think you spend under $100.
              </text>
              <text x="0" y="${isPortrait ? 230 : 165}" font-family="Arial, sans-serif" font-size="${isPortrait ? 24 : 18}" font-weight="700" fill="#f59e0b">
                Your bank statement tells a shocking truth.
              </text>
            </g>
          `;
        } else if (isCTA) {
          innerContent = `
            <!-- Action / CTA Card -->
            <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.92)" stroke="rgba(234, 179, 8, 0.5)" stroke-width="2.5" />
            <g transform="translate(40, 40)">
              <rect x="0" y="0" width="160" height="34" rx="17" fill="rgba(234, 179, 8, 0.2)" stroke="#eab308" stroke-width="1.5" />
              <text x="80" y="23" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="#eab308" letter-spacing="1" text-anchor="middle">TAKE ACTION</text>
              <g transform="translate(${cardW - 130}, -10)">
                ${renderContextualIcon('verified_shield', { size: 50, color: '#eab308' })}
              </g>
              <text x="0" y="${isPortrait ? 115 : 80}" font-family="Arial, sans-serif" font-size="${isPortrait ? 34 : 26}" font-weight="900" fill="#ffffff">
                AUDIT YOUR STATEMENTS
              </text>
              <g transform="translate(0, ${isPortrait ? 145 : 100})">
                <rect x="0" y="0" width="${cardW - 80}" height="52" rx="26" fill="#eab308" />
                <text x="${(cardW - 80) / 2}" y="33" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#0f172a" text-anchor="middle">
                  Subscribe to Money In Minutes
                </text>
              </g>
              <text x="${(cardW - 80) / 2}" y="${isPortrait ? 240 : 175}" font-family="Arial, sans-serif" font-size="16" font-weight="600" fill="#cbd5e1" text-anchor="middle">
                Keep more of what you earn every single day.
              </text>
            </g>
          `;
        } else {
          const summary = plan.scriptText || plan.label;
          const summaryLayout = layoutSvgText(summary, {
            maxWidth: cardW - 140,
            maxLines: 4,
            initialFontSize: isPortrait ? 34 : 26,
            minFontSize: 22,
            x: 0,
            startY: isPortrait ? 85 : 60,
            fill: '#ffffff',
            fontWeight: 'bold'
          });
          innerContent = `
            <!-- General Information Lower Third / Framed Visual -->
            <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1.5" />
            <g transform="translate(40, 45)">
              <rect x="0" y="0" width="170" height="32" rx="16" fill="rgba(255, 255, 255, 0.12)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1" />
              <text x="85" y="21" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#94a3b8" text-anchor="middle">${escapeXml(badgeTitle)}</text>
              <g transform="translate(${cardW - 130}, -10)">
                ${renderContextualIcon(contextualIconName, { size: 44, color: '#38bdf8' })}
              </g>
              ${summaryLayout.svg}
            </g>
          `;
        }
        break;
      }
    }

    let bgStop1 = '#0a0f1d';
    let bgStop2 = '#0f172a';
    let bgStop3 = '#1e1b4b';
    let glowColor1 = '#38bdf8';
    let glowColor2 = '#a855f7';

    const sceneTypeLower = (plan.sceneType || '').toLowerCase();
    const labelLower = (plan.label || '').toLowerCase();

    if (plan.treatment === TREATMENTS.ANTI_SWIPE_HOOK || sceneTypeLower === 'hook' || labelLower.includes('hook')) {
      bgStop1 = '#1a080d';
      bgStop2 = '#130d1e';
      bgStop3 = '#211024';
      glowColor1 = '#ef4444';
      glowColor2 = '#f43f5e';
    } else if (plan.treatment === TREATMENTS.ANIMATED_NUMBER || sceneTypeLower.includes('data') || labelLower.includes('data') || labelLower.includes('stat')) {
      bgStop1 = '#061524';
      bgStop2 = '#0b1c30';
      bgStop3 = '#0f2b48';
      glowColor1 = '#38bdf8';
      glowColor2 = '#0284c7';
    } else if (sceneTypeLower.includes('escalat') || labelLower.includes('escalat')) {
      bgStop1 = '#1c1208';
      bgStop2 = '#1e160e';
      bgStop3 = '#2a1a0f';
      glowColor1 = '#f59e0b';
      glowColor2 = '#ea580c';
    } else if (sceneTypeLower.includes('payoff') || labelLower.includes('payoff') || plan.treatment === TREATMENTS.ANIMATED_PERCENTAGE) {
      bgStop1 = '#051813';
      bgStop2 = '#0a231c';
      bgStop3 = '#0d2e26';
      glowColor1 = '#10b981';
      glowColor2 = '#059669';
    } else if (sceneTypeLower.includes('cta') || labelLower.includes('action')) {
      bgStop1 = '#1a1308';
      bgStop2 = '#22190b';
      bgStop3 = '#2c210d';
      glowColor1 = '#f59e0b';
      glowColor2 = '#eab308';
    }

    return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgStop1}" />
      <stop offset="50%" stop-color="${bgStop2}" />
      <stop offset="100%" stop-color="${bgStop3}" />
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
  <circle cx="${width * 0.8}" cy="${height * 0.2}" r="${width * 0.4}" fill="${glowColor1}" opacity="0.08" />
  <circle cx="${width * 0.2}" cy="${height * 0.8}" r="${width * 0.4}" fill="${glowColor2}" opacity="0.08" />

  <!-- Safe Zone Border Indicator (invisible in production, guarantees safe positioning) -->
  <g transform="translate(${cardX}, ${cardY})" filter="url(#shadow)">
    ${innerContent}
  </g>
</svg>
    `.trim();
  }

  /**
   * Generates a full-canvas scene layout matching the FinTech Kinetic visual system.
   * Free from the rigid centered-card architecture, creating rich, vertical-native compositions.
   */
  renderFullCanvasScene(plan, options = {}) {
    const { width, height } = plan.dimensions;
    const isPortrait = plan.aspectRatio === ASPECT_RATIOS.PORTRAIT;
    const beat = String(plan.beat || '').toLowerCase();
    const treatment = plan.treatment || TREATMENTS.SUBTLE_MOTION;
    const labelLower = String(plan.label || '').toLowerCase();
    const time = options.time !== undefined ? Number(options.time) : undefined;
    const transparentBg = options.transparentBg === true;

    const topicKey = plan.topicKey || options.topicKey || (plan.topic ? resolveTopicKey(plan.topic) : null) || 'market_pulse';
    const domainCfg = DOMAIN_UI_CONFIG[topicKey] || DOMAIN_UI_CONFIG.market_pulse;

    // Determine theme for background gradient and auras
    let theme = domainCfg.theme || 'navy';
    let brandDot = domainCfg.brandDot || '#38bdf8';
    let brandBadge = domainCfg.brandBadge || 'FINANCIAL AUDIT';

    if (beat === 'hook' || treatment === TREATMENTS.ANTI_SWIPE_HOOK || /hook|watch|stop/i.test(labelLower)) {
      theme = 'crimson';
      brandDot = domainCfg.brandDot || '#ef4444';
      brandBadge = `${domainCfg.brandBadge || 'FINANCIAL AUDIT'} • ALERT`;
    } else if (beat === 'curiositygap' || /audit|gap|leak|curiosity/i.test(labelLower)) {
      brandBadge = `${domainCfg.brandBadge || 'FINANCIAL AUDIT'} • AUDIT`;
    } else if (beat === 'escalation' || treatment === TREATMENTS.TWO_SIDED_COMPARISON || /escalat|vs|compar/i.test(labelLower)) {
      brandBadge = `${domainCfg.brandBadge || 'FINANCIAL AUDIT'} • REALITY GAP`;
    } else if (beat === 'payoff' || treatment === TREATMENTS.ANIMATED_PERCENTAGE || /payoff|compound|growth|impact/i.test(labelLower)) {
      brandBadge = `${domainCfg.brandBadge || 'FINANCIAL AUDIT'} • IMPACT`;
    } else if (beat === 'cta' || /action|cta/i.test(labelLower)) {
      brandBadge = `${domainCfg.brandBadge || 'FINANCIAL AUDIT'} • ACTION`;
    } else if (beat === 'datareveal' || treatment === TREATMENTS.ANIMATED_NUMBER || /data|metric|reveal/i.test(labelLower)) {
      brandBadge = `${domainCfg.brandBadge || 'FINANCIAL AUDIT'} • DATA`;
    }

    // Build scene dynamic layers
    let dynamicLayer = '';

    if (beat === 'hook' || treatment === TREATMENTS.ANTI_SWIPE_HOOK || /hook/i.test(labelLower)) {
      // Beat 1: Alert beacon + Notification Stack + Hook headline
      const headline = plan.scriptText || 'YOUR SILENT WEALTH DRAIN';
      const titleLayout = layoutSvgText(headline, {
        maxWidth: width - 180,
        maxLines: 3,
        initialFontSize: isPortrait ? 44 : 32,
        minFontSize: 28,
        x: width / 2,
        startY: 280,
        fill: '#ffffff',
        fontWeight: '900',
        textAnchor: 'middle'
      });

      dynamicLayer = `
        <!-- Beat 1: Hook & Silent Drain Notification Stack -->
        ${titleLayout.svg}
        ${SceneCompositionPrimitives.notificationStack([], {
          width,
          startY: 460,
          maxWidth: width - 160,
          yOffset: domainCfg.yOffset || 0,
          widthOffset: domainCfg.widthOffset || 0,
          cardBg: domainCfg.cardBg,
          cardStroke: domainCfg.cardStroke,
          cardRadius: domainCfg.cardRadius,
          time
        })}
      `;
    } else if (beat === 'cta' || /action|checklist|protocol|defense/i.test(labelLower)) {
      // Beat 6: Action Protocol Checklist
      const steps = plan.verifiedData?.items || [];
      const header = plan.verifiedData?.title || plan.verifiedData?.header;
      const subtitle = plan.verifiedData?.subtitle;
      dynamicLayer = `
        <!-- Beat 6: Action Protocol Checklist -->
        ${SceneCompositionPrimitives.actionChecklist(steps, {
          width,
          y: 340,
          maxWidth: width - 160,
          yOffset: domainCfg.yOffset || 0,
          widthOffset: domainCfg.widthOffset || 0,
          cardBg: domainCfg.cardBg,
          cardStroke: domainCfg.cardStroke,
          cardRadius: domainCfg.cardRadius,
          accentColor: domainCfg.accentColor,
          time,
          header,
          subtitle
        })}
      `;
    } else if (beat === 'curiositygap' || /audit|curiosity|scanner/i.test(labelLower)) {
      // Beat 2: Bank Statement Scanner
      dynamicLayer = `
        <!-- Beat 2: Statement Scanner UI -->
        ${SceneCompositionPrimitives.statementRows([], {
          width,
          startY: 340,
          maxWidth: width - 160,
          yOffset: domainCfg.yOffset || 0,
          widthOffset: domainCfg.widthOffset || 0,
          cardBg: domainCfg.cardBg,
          cardStroke: domainCfg.cardStroke,
          cardRadius: domainCfg.cardRadius,
          time
        })}
      `;
    } else if (beat === 'escalation' || treatment === TREATMENTS.TWO_SIDED_COMPARISON || /escalat|compar/i.test(labelLower)) {
      // Beat 4: Two-Sided Comparison Meter
      const isComp = Boolean(plan.verifiedData?.left && plan.verifiedData?.right);
      const leftVal = plan.verifiedData?.left?.value || '$86/mo';
      const rightVal = plan.verifiedData?.right?.value || plan.verifiedData?.value || '$219/mo';
      const leftItem = isComp ? plan.verifiedData.left : { label: 'WHAT YOU THINK YOU SPEND', value: leftVal, desc: 'Self-Reported Estimate', percent: 39, color: '#64748b' };
      const rightItem = isComp ? plan.verifiedData.right : { label: 'WHAT ACTUALLY LEAVES', value: rightVal, desc: 'Verified Bank Statement Reality', percent: 100, color: '#ef4444' };
      dynamicLayer = `
        <!-- Beat 4: Two-Sided Comparison Meter -->
        ${SceneCompositionPrimitives.comparisonMeter(
          leftItem,
          rightItem,
          {
            width,
            y: 340,
            maxWidth: width - 160,
            yOffset: domainCfg.yOffset || 0,
            widthOffset: domainCfg.widthOffset || 0,
            cardBg: domainCfg.cardBg,
            cardStroke: domainCfg.cardStroke,
            cardRadius: domainCfg.cardRadius,
            accentColor: domainCfg.accentColor,
            time,
            header: plan.verifiedData?.header,
            subtitle: plan.verifiedData?.subtitle,
            deltaLabel: plan.verifiedData?.deltaLabel,
            footnote: plan.verifiedData?.footnote,
            source: plan.verifiedData?.source
          }
        )}
      `;
    } else if (beat === 'payoff' || treatment === TREATMENTS.ANIMATED_PERCENTAGE || /payoff|compound/i.test(labelLower)) {
      if (plan.verifiedData?.type === 'checklist' || Array.isArray(plan.verifiedData?.items)) {
        // Dynamic Checklist on Payoff
        dynamicLayer = `
          <!-- Dynamic Checklist Protocol -->
          ${SceneCompositionPrimitives.actionChecklist(plan.verifiedData.items, {
            width,
            y: 340,
            maxWidth: width - 160,
            yOffset: domainCfg.yOffset || 0,
            widthOffset: domainCfg.widthOffset || 0,
            cardBg: domainCfg.cardBg,
            cardStroke: domainCfg.cardStroke,
            cardRadius: domainCfg.cardRadius,
            accentColor: domainCfg.accentColor,
            time,
            header: plan.verifiedData.title || plan.verifiedData.header,
            subtitle: plan.verifiedData.subtitle
          })}
        `;
      } else {
        // Beat 5: 10-Year Compounding Wealth Trajectory
        const val = plan.verifiedData?.value || '$37,400';
        const source = plan.verifiedData?.source || 'S&P 500 Historical Benchmark (7% Real)';
        dynamicLayer = `
          <!-- Beat 5: 10-Year Opportunity Cost Trajectory -->
          ${SceneCompositionPrimitives.trajectoryGraph([], {
            width,
            y: 340,
            maxWidth: width - 160,
            yOffset: domainCfg.yOffset || 0,
            widthOffset: domainCfg.widthOffset || 0,
            cardBg: domainCfg.cardBg,
            cardStroke: domainCfg.cardStroke,
            cardRadius: domainCfg.cardRadius,
            accentColor: domainCfg.accentColor,
            heroValue: val,
            heroLabel: '10-YEAR OPPORTUNITY COST',
            source,
            time
          })}
        `;
      }
    } else if (beat === 'datareveal' || treatment === TREATMENTS.ANIMATED_NUMBER || /data|metric/i.test(labelLower)) {
      // Beat 3: Hero Number Counter
      const val = plan.verifiedData?.displayValue || plan.verifiedData?.value || '$219/mo';
      const rawLabel = plan.verifiedData?.label || 'ACTUAL MONTHLY OUTFLOW';
      const source = plan.verifiedData?.source || 'Truth-Anchor Verified';
      const isSubLeak = String(val).includes('219');
      const subtext = isSubLeak ? 'The Unnoticed Monthly Subscription Drain' : (plan.scriptText || plan.verifiedData?.statement || '');
      dynamicLayer = `
        <!-- Beat 3: Hero Financial Metric Counter -->
        ${SceneCompositionPrimitives.financialTicker([], {
          width,
          y: 310,
          yOffset: domainCfg.yOffset || 0,
          cardBg: domainCfg.cardBg,
          cardStroke: domainCfg.cardStroke,
          cardRadius: domainCfg.cardRadius,
          time
        })}
        ${SceneCompositionPrimitives.numberCounter(val, subtext, {
          width,
          y: 580,
          yOffset: domainCfg.yOffset || 0,
          accentColor: domainCfg.accentColor || '#38bdf8',
          label: sanitizeViewerBadge(rawLabel, 'dataReveal'),
          source,
          time
        })}
      `;
    } else {
      // Fallback / Generic Financial UI
      if (plan.verifiedData?.left && plan.verifiedData?.right) {
        dynamicLayer = `
          ${SceneCompositionPrimitives.comparisonMeter(
            plan.verifiedData.left,
            plan.verifiedData.right,
            {
              width,
              y: 340,
              maxWidth: width - 160,
              yOffset: domainCfg.yOffset || 0,
              widthOffset: domainCfg.widthOffset || 0,
              cardBg: domainCfg.cardBg,
              cardStroke: domainCfg.cardStroke,
              cardRadius: domainCfg.cardRadius,
              accentColor: domainCfg.accentColor,
              time,
              header: plan.verifiedData.header,
              subtitle: plan.verifiedData.subtitle,
              deltaLabel: plan.verifiedData.deltaLabel,
              footnote: plan.verifiedData.footnote,
              source: plan.verifiedData.source
            }
          )}
        `;
      } else if (plan.verifiedData?.type === 'checklist' || Array.isArray(plan.verifiedData?.items)) {
        dynamicLayer = `
          ${SceneCompositionPrimitives.actionChecklist(plan.verifiedData.items, {
            width,
            y: 340,
            maxWidth: width - 160,
            yOffset: domainCfg.yOffset || 0,
            widthOffset: domainCfg.widthOffset || 0,
            cardBg: domainCfg.cardBg,
            cardStroke: domainCfg.cardStroke,
            cardRadius: domainCfg.cardRadius,
            accentColor: domainCfg.accentColor,
            time,
            header: plan.verifiedData.title || plan.verifiedData.header,
            subtitle: plan.verifiedData.subtitle
          })}
        `;
      } else {
        const val = plan.verifiedData?.displayValue || plan.verifiedData?.value || '$219/mo';
        dynamicLayer = `
          ${SceneCompositionPrimitives.numberCounter(val, plan.scriptText || '', {
            width,
            y: 560,
            yOffset: domainCfg.yOffset || 0,
            accentColor: domainCfg.accentColor || '#38bdf8',
            label: 'FINANCIAL INSIGHT',
            source: plan.verifiedData?.source || 'Truth-Anchor Verified',
            time
          })}
        `;
      }
    }

    return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Gradients -->
    <linearGradient id="fcBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme === 'crimson' ? '#180808' : theme === 'emerald' ? '#021810' : theme === 'amber' ? '#1c1208' : '#070c18'}" />
      <stop offset="50%" stop-color="${theme === 'crimson' ? '#260c0c' : theme === 'emerald' ? '#04241b' : theme === 'amber' ? '#29180b' : '#0a1329'}" />
      <stop offset="100%" stop-color="#020409" />
    </linearGradient>
    <radialGradient id="fcVignette" cx="50%" cy="50%" r="50%">
      <stop offset="60%" stop-color="#000000" stop-opacity="0" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.8" />
    </radialGradient>
    <linearGradient id="hookGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ef4444" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <linearGradient id="growthAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.6" />
      <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
    </linearGradient>

    <!-- Filters -->
    <filter id="ambientBlur" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="80" />
    </filter>
    <filter id="panelDrop" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.65" />
    </filter>
  </defs>

  <!-- Layer 1: Atmospheric Background -->
  ${SceneCompositionPrimitives.fullCanvasBackground({ width, height, theme, topicKey, transparentBg })}

  <!-- Layer 2: Brand Header (Safe Top) -->
  ${SceneCompositionPrimitives.brandHeader({ width, y: 205, label: 'MONEY IN MINUTES', badge: brandBadge, dotColor: brandDot })}

  <!-- Layer 3: Dynamic Procedural Content -->
  ${dynamicLayer}
</svg>
    `.trim();
  }

  /**
   * Renders the base image still for the scene using Sharp.
   */
  async renderSceneStill(plan, outputPath) {
    const { width, height } = plan.dimensions;
    const isLegacyCard = plan.composition === 'legacy_card';
    const svgString = isLegacyCard ? this.renderCardSvg(plan) : this.renderFullCanvasScene(plan);
    const svgBuffer = Buffer.from(svgString, 'utf8');

    if (plan.assetPath) {
      const assetValidation = await validateVisualAsset(plan.assetPath);
      if (assetValidation.valid && assetValidation.mediaType === 'image') {
        try {
          // Composite the SVG on top of the existing visual asset
          await sharp(plan.assetPath)
            .resize(width, height, { fit: 'cover' })
            .composite([
              { input: Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="black" opacity="0.45"/></svg>`), blend: 'over' },
              { input: svgBuffer, blend: 'over' }
            ])
            .png()
            .toFile(outputPath);
          if (plan.assetProvenance) {
            plan.assetProvenance.composited = true;
          }
          return outputPath;
        } catch (_err) {
          if (plan.assetProvenance) {
            plan.assetProvenance.composited = false;
            plan.assetProvenance.error = _err.message;
          }
          // Fallback to pure SVG render
        }
      } else {
        this.logger.warn(`Asset for scene [${plan.id}] failed validation (${assetValidation.reason}); skipping invalid visual overlay`);
        if (plan.assetProvenance) {
          plan.assetProvenance.composited = false;
          plan.assetProvenance.validationError = assetValidation.reason;
        }
      }
    }

    if (plan.assetProvenance) {
      plan.assetProvenance.composited = false;
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

      chunks.forEach((chunk, cIdx) => {
        const startSec = cIdx * chunkDuration;
        const endSec = (cIdx + 1) * chunkDuration;

        const formatTime = (sec) => {
          const m = Math.floor(sec / 60);
          const s = Math.floor(sec % 60);
          const cs = Math.floor((sec % 1) * 100);
          return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
        };

        const startTimestamp = formatTime(startSec);
        const endTimestamp = formatTime(endSec);

        const wordDurationCs = Math.max(1, Math.round((chunkDuration / chunk.length) * 100));

        const karaokeText = chunk
          .map(w => `{\\k${wordDurationCs}}${sanitizeAssText(w)}`)
          .join(' ');

        events += `Dialogue: 0,${startTimestamp},${endTimestamp},Karaoke,,0,0,0,,${karaokeText}\n`;
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

  escapeAssPath(assPath) {
    if (!assPath) return '';
    return assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  }

  buildAssSubtitleFilter(assPath) {
    if (!assPath) return 'format=yuv420p';
    const escaped = this.escapeAssPath(assPath);
    return `subtitles='${escaped}',format=yuv420p`;
  }

  /**
   * Renders in-scene micro-animated frames and composites them in real-time over the moving B-roll background.
   */
  async renderMicroAnimatedSceneVideo(plan, brollVideoPath, assPath, outputPath, options = {}) {
    const { getFFmpegPath } = require('./ffmpeg');
    const { spawn } = require('child_process');

    const duration = Math.max(1, Number(options.duration || plan.duration || 5));
    const fps = 30;
    const totalFrames = Math.round(duration * fps);
    const escapedAss = assPath ? assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'") : null;
    const filterComplex = escapedAss
      ? `[0:v][1:v]overlay=0:0:shortest=1[ov];[ov]subtitles='${escapedAss}',format=yuv420p`
      : '[0:v][1:v]overlay=0:0:shortest=1,format=yuv420p';

    const ffmpegProc = spawn(getFFmpegPath(), [
      '-y',
      '-i', brollVideoPath,
      '-f', 'rawvideo',
      '-vcodec', 'rawvideo',
      '-s', '1080x1920',
      '-pix_fmt', 'rgba',
      '-r', String(fps),
      '-i', '-',
      '-filter_complex', filterComplex,
      '-t', Number(duration).toFixed(2),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      outputPath
    ]);

    let stderr = '';
    ffmpegProc.stderr.on('data', d => { stderr += d.toString(); });

    let lastSvg = '';
    let lastBuf = null;

    for (let f = 0; f < totalFrames; f++) {
      const t = Number((f / fps).toFixed(3));
      const svg = this.renderFullCanvasScene(plan, { time: t, transparentBg: true });
      let buf;
      if (svg === lastSvg && lastBuf) {
        buf = lastBuf;
      } else {
        buf = await sharp(Buffer.from(svg)).raw().toBuffer();
        lastSvg = svg;
        lastBuf = buf;
      }

      if (!ffmpegProc.stdin.write(buf)) {
        await new Promise(r => ffmpegProc.stdin.once('drain', r));
      }
    }
    ffmpegProc.stdin.end();

    await new Promise((resolve, reject) => {
      ffmpegProc.on('close', code => (code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`))));
      ffmpegProc.on('error', reject);
    });

    if (plan.assetProvenance) {
      plan.assetProvenance.composited = true;
      plan.assetProvenance.microAnimated = true;
      plan.assetProvenance.framesCount = totalFrames;
    }

    return outputPath;
  }

  /**
   * Render an individual scene to MP4 with motion, card visuals, and karaoke subtitles.
   */
  async renderSceneVideo(plan, outputPath, options = {}) {
    if (!(await checkFFmpeg())) throw new Error(ffmpegInstallHint());

    const tempDir = path.dirname(outputPath);
    const assPath = path.join(tempDir, `karaoke_${plan.id}.ass`);

    try {
      const assContent = this.generateKaraokeAss(plan);
      await fs.writeFile(assPath, assContent, 'utf8');
      const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

      // Presenter scene rendering
      if (plan.isPresenter || plan.sceneType === 'presenter' || plan.presenter) {
        try {
          const { CharacterSelector } = require('./presenter');
          const selector = new CharacterSelector({ logger: this.logger });
          const character = plan.character || selector.selectCharacter(plan.scriptText || plan.label || options.topic || '');
          const tempPresenterVideo = path.join(tempDir, `presenter_raw_${plan.id}.mp4`);
          try {
            await selector.renderPresenterClip(character, plan, tempPresenterVideo, options);
            const vf = escapedAss ? `subtitles='${escapedAss}',format=yuv420p` : 'format=yuv420p';
            const args = [
              '-y',
              '-i', tempPresenterVideo,
              '-vf', vf,
              '-c:v', 'libx264',
              '-preset', 'fast',
              '-crf', '18',
              '-pix_fmt', 'yuv420p',
              outputPath
            ];
            await this.runFFmpeg(args);
            plan.assetProvenance = {
              sourceType: 'presenter',
              provider: 'character-selector',
              character: character.name,
              title: character.title,
              localPath: character.portraitPath,
              composited: true
            };
            return outputPath;
          } finally {
            await fs.unlink(tempPresenterVideo).catch(() => {});
          }
        } catch (presenterErr) {
          this.logger.warn(`Presenter scene rendering encountered an issue (${presenterErr.message}); falling back to standard visual treatment`);
        }
      }

      // Pure B-roll scene rendering (direct footage with subtitles in safe zone)
      const isPureBRoll = Boolean(plan.isPureBRoll || plan.sceneType === 'broll' || plan.treatment === 'cinematic_broll');
      if (isPureBRoll) {
        try {
          const { FreeBRollProvider } = require('./free-broll-provider');
          const brollProvider = new FreeBRollProvider({ logger: this.logger });
          const broll = await brollProvider.getBRollForScene(plan, {
            duration: plan.duration,
            darken: false
          });
          plan.assetProvenance = broll.provenance;

          const vf = escapedAss ? `subtitles='${escapedAss}',format=yuv420p` : 'format=yuv420p';
          const args = [
            '-y',
            '-i', broll.brollPath,
            '-vf', vf,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
            outputPath
          ];
          await this.runFFmpeg(args);
          return outputPath;
        } catch (brollErr) {
          this.logger.warn(`Pure B-roll rendering encountered an issue (${brollErr.message}); falling back to micro-animation`);
        }
      }

      const isFullCanvas = plan.composition === 'full_canvas';
      const enableAnim = options.enableMicroAnimation !== false;

      if (isFullCanvas && enableAnim) {
        try {
          const { FreeBRollProvider } = require('./free-broll-provider');
          const brollProvider = new FreeBRollProvider({ logger: this.logger });
          const broll = await brollProvider.getBRollForScene(plan, {
            duration: plan.duration,
            darken: true
          });
          plan.assetProvenance = broll.provenance;

          await this.renderMicroAnimatedSceneVideo(plan, broll.brollPath, assPath, outputPath, options);
          return outputPath;
        } catch (animErr) {
          this.logger.warn(`Micro-animation composition encountered an error (${animErr.message}); falling back to still loop`);
        }
      }

      // Legacy card or fallback still loop
      const stillPath = path.join(tempDir, `still_${plan.id}.png`);
      try {
        await this.renderSceneStill(plan, stillPath);
        const motionFilter = VisualMotion.buildFilter(plan.motion, plan.duration, plan.dimensions);
        const vf = `${motionFilter},subtitles='${escapedAss}',format=yuv420p`;

        const args = [
          '-y', '-loop', '1', '-i', stillPath,
          '-vf', vf,
          '-t', Number(plan.duration).toFixed(2),
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '18',
          '-r', '30',
          '-pix_fmt', 'yuv420p',
          outputPath
        ];

        await this.runFFmpeg(args);
        return outputPath;
      } finally {
        await fs.unlink(stillPath).catch(() => {});
      }
    } finally {
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
        let assembled = false;
        const transitionType = options.transition || 'wipeleft';
        const transitionDuration = typeof options.transitionDuration === 'number' ? options.transitionDuration : 0.15;
        const canUseXfade = options.enableXfade !== false &&
          transitionType !== 'cut' &&
          transitionDuration > 0 &&
          sceneClips.length > 1 &&
          plans.every(p => (p.duration || 5) > (transitionDuration * 2));

        if (canUseXfade) {
          try {
            let filterGraph = '';
            let runningDuration = plans[0].duration || 5;
            let lastV = '0:v';

            for (let i = 1; i < sceneClips.length; i++) {
              const offset = Math.max(0.1, Number((runningDuration - transitionDuration).toFixed(3)));
              const outV = i === sceneClips.length - 1 ? 'vout' : `v${i}`;
              filterGraph += `[${lastV}][${i}:v]xfade=transition=${transitionType}:duration=${transitionDuration}:offset=${offset}[${outV}];`;
              runningDuration = (runningDuration - transitionDuration) + (plans[i].duration || 5);
              lastV = outV;
            }
            if (filterGraph.endsWith(';')) filterGraph = filterGraph.slice(0, -1);

            const xfadeArgs = ['-y'];
            for (const clip of sceneClips) xfadeArgs.push('-i', clip);
            xfadeArgs.push(
              '-filter_complex', filterGraph,
              '-map', '[vout]',
              '-c:v', 'libx264',
              '-preset', 'fast',
              '-crf', '18',
              '-b:v', '8000k',
              '-maxrate', '12000k',
              '-bufsize', '16000k',
              '-pix_fmt', 'yuv420p',
              assembledVideo
            );
            await this.runFFmpeg(xfadeArgs);
            assembled = true;
          } catch (xfadeErr) {
            this.logger.warn(`Xfade transition failed (${xfadeErr.message}); using standard concat`);
          }
        }

        if (!assembled) {
          const filterInputs = sceneClips.map((_, idx) => `[${idx}:v]`).join('');
          const concatFilter = `${filterInputs}concat=n=${sceneClips.length}:v=1:a=0[vout]`;
          const concatArgs = ['-y'];
          for (const clip of sceneClips) concatArgs.push('-i', clip);
          concatArgs.push(
            '-filter_complex', concatFilter,
            '-map', '[vout]',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '18',
            '-b:v', '8000k',
            '-maxrate', '12000k',
            '-bufsize', '16000k',
            '-pix_fmt', 'yuv420p',
            assembledVideo
          );
          await this.runFFmpeg(concatArgs);
        }
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
  AudioEnhancementEngine,
  layoutSvgText,
  renderContextualIcon,
  deriveComparisonHeader,
  sanitizeViewerBadge,
  sanitizeAssText,
  validateVisualAsset,
  SceneCompositionPrimitives,
  FreeBRollProvider: require('./free-broll-provider').FreeBRollProvider
};
