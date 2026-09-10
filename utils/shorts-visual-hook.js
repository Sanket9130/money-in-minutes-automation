'use strict';

/**
 * Shorts Visual Hook
 *
 * Implements the First 2-Second Anti-Swipe Visual Hook for YouTube Shorts.
 * Configures high-contrast, mobile-readable opening typography, safe-zone positioning,
 * and distinct visual styling to immediately communicate topic and viewer value.
 */

const SHORTS_SAFE_ZONE = {
  top: 220,
  bottom: 480,
  left: 60,
  right: 140,
  maxWidth: 880,
  maxHeight: 1220
};

const DEFAULT_HOOK_DURATION = 1.8; // Sensible default between 1.5s and 2.0s
const MIN_HOOK_DURATION = 1.0;
const MAX_HOOK_DURATION = 3.0;

const HOOK_VARIANTS = {
  'bold-statement': {
    id: 'bold-statement',
    name: 'Bold Statement',
    badge: '⚡ MUST KNOW',
    accentColor: '#fbbf24', // Electric Gold
    glowColor: 'rgba(251, 191, 36, 0.28)'
  },
  'question-punch': {
    id: 'question-punch',
    name: 'Question Punch',
    badge: '❓ THINK AGAIN',
    accentColor: '#38bdf8', // Neon Sky Blue
    glowColor: 'rgba(56, 189, 248, 0.28)'
  },
  'stat-callout': {
    id: 'stat-callout',
    name: 'Stat Callout',
    badge: '📊 PROVEN FACT',
    accentColor: '#34d399', // Emerald Mint
    glowColor: 'rgba(52, 211, 153, 0.28)'
  },
  'quick-takeaway': {
    id: 'quick-takeaway',
    name: 'Quick Takeaway',
    badge: '💡 30-SEC LESSON',
    accentColor: '#a78bfa', // Neon Violet
    glowColor: 'rgba(167, 139, 250, 0.28)'
  },
  'warning-alert': {
    id: 'warning-alert',
    name: 'Warning Alert',
    badge: '⚠️ STOP DOING THIS',
    accentColor: '#f87171', // Coral Red
    glowColor: 'rgba(248, 113, 113, 0.28)'
  }
};

class ShortsVisualHook {
  static get DEFAULT_DURATION() {
    return DEFAULT_HOOK_DURATION;
  }

  static get VARIANTS() {
    return HOOK_VARIANTS;
  }

  /**
   * Cleans text to eliminate slow, generic filler intros ("Welcome to...", "In this video...")
   * ensuring immediate topic and value communication.
   */
  static cleanHookText(raw = '') {
    let text = String(raw || '').trim();
    if (!text) return '';

    // Strip leading generic greeting/intros
    const fillerPatterns = [
      /^welcome\s+to\s+(?:this\s+|our\s+|the\s+)?(?:video\s+|channel\s+|tutorial\s+)?(?:on\s+|about\s+)?/i,
      /^in\s+this\s+(?:video|short)\s+(?:we\s+will|we'll|i\s+will|i'll)\s+(?:show\s+you|explain|discuss|talk\s+about)\s+/i,
      /^today\s+(?:we\s+are|we're)\s+(?:going\s+to\s+talk\s+about|looking\s+at|discussing)\s+/i,
      /^(?:hello|hi|hey)\s+(?:everyone|guys|viewers|there)[,!]?\s*/i,
      /^let'?s\s+(?:talk\s+about|dive\s+into)\s+/i
    ];

    for (const pattern of fillerPatterns) {
      text = text.replace(pattern, '');
    }

    text = text.trim();
    if (text.length > 0) {
      // Capitalize first letter
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }

    return text;
  }

  /**
   * Detects the optimal hook variant based on script content when not specified.
   */
  static detectVariant(headline = '', script = {}) {
    const text = `${headline} ${script.hook?.text || ''}`.toLowerCase();

    if (/\b(?:stop|don't|dont|never|avoid|mistake|warning|ruining|losing)\b/i.test(text)) {
      return 'warning-alert';
    }
    if (/\?$/.test(headline.trim()) || /\b(?:why|how come|is it true|have you ever)\b/i.test(text)) {
      return 'question-punch';
    }
    if (/\b(?:\d+%\s*|\$\d+|\d+\s*(?:rules|steps|ways|seconds|minutes|secret))\b/i.test(text)) {
      return 'stat-callout';
    }
    if (/\b(?:in\s+30\s+sec|quick|simple|hack|lesson|tip)\b/i.test(text)) {
      return 'quick-takeaway';
    }

    return 'bold-statement';
  }

  /**
   * Resolves complete hook configuration from options and script.
   */
  static resolveConfig(script = {}, options = {}) {
    const hookOpt = (options && typeof options.hook === 'object') ? options.hook : {};

    // 1. Duration (clamped safely between 1.0s and 3.0s, default 1.8s)
    const rawDuration = options.hookDuration !== undefined
      ? options.hookDuration
      : (hookOpt.duration !== undefined ? hookOpt.duration : DEFAULT_HOOK_DURATION);
    const duration = Math.min(MAX_HOOK_DURATION, Math.max(MIN_HOOK_DURATION, Number(rawDuration) || DEFAULT_HOOK_DURATION));

    // 2. Headline text extraction & sanitization
    let rawHeadline = hookOpt.headline || hookOpt.text;
    if (!rawHeadline) {
      if (typeof script.hook === 'string') {
        rawHeadline = script.hook;
      } else if (script.hook && typeof script.hook.text === 'string') {
        rawHeadline = script.hook.text;
      } else if (typeof script.title === 'string') {
        rawHeadline = script.title;
      } else {
        rawHeadline = 'Essential Insight';
      }
    }

    const cleanedHeadline = this.cleanHookText(rawHeadline);
    const headline = cleanedHeadline.length > 80
      ? `${cleanedHeadline.slice(0, 77)}…`
      : cleanedHeadline;

    // 3. Variant selection
    const variantId = (hookOpt.variant && HOOK_VARIANTS[hookOpt.variant])
      ? hookOpt.variant
      : this.detectVariant(headline, script);
    const variantConfig = HOOK_VARIANTS[variantId] || HOOK_VARIANTS['bold-statement'];

    // 4. Badge text
    const badge = hookOpt.badge || variantConfig.badge;

    // 5. Value Proposition / Subheadline
    let subheadline = hookOpt.subheadline || hookOpt.valueStatement;
    if (!subheadline) {
      if (script.introduction?.topicIntro) {
        subheadline = this.cleanHookText(script.introduction.topicIntro);
      } else if (script.introduction?.valueProposition) {
        subheadline = this.cleanHookText(script.introduction.valueProposition);
      } else if (script.title && script.title !== headline) {
        subheadline = this.cleanHookText(script.title);
      } else {
        subheadline = 'Watch till the end for the full breakdown';
      }
    }
    if (subheadline.length > 100) {
      subheadline = `${subheadline.slice(0, 97)}…`;
    }

    // 6. Accent styling
    const accentColor = hookOpt.accentColor || variantConfig.accentColor;
    const glowColor = hookOpt.glowColor || variantConfig.glowColor;

    return {
      enabled: options.hook !== false && options.visualHook !== false,
      duration: Number(duration.toFixed(2)),
      variant: variantId,
      variantName: variantConfig.name,
      badge,
      headline,
      subheadline,
      accentColor,
      glowColor,
      safeZone: SHORTS_SAFE_ZONE
    };
  }

  /**
   * Generates scoped CSS for the distinct Anti-Swipe Visual Hook slide.
   */
  static generateCSS(_options = {}) {
    return `
        /* Phase 1 Feature 1.3: Anti-Swipe Visual Hook Styles */
        .slide-hook {
            background: radial-gradient(circle at 50% 38%, rgba(30, 41, 59, 0.95) 0%, #080b11 85%);
            z-index: 10;
        }

        .slide-hook .hook-spotlight {
            position: absolute;
            top: 20%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 700px;
            height: 700px;
            border-radius: 50%;
            background: radial-gradient(circle, var(--hook-glow, rgba(251, 191, 36, 0.28)) 0%, transparent 70%);
            pointer-events: none;
            filter: blur(40px);
        }

        .slide-hook .hook-container {
            width: 100%;
            max-width: ${SHORTS_SAFE_ZONE.maxWidth}px;
            text-align: center;
            padding: 44px 28px;
            background: rgba(15, 23, 42, 0.72);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 36px;
            border: 2px solid var(--hook-accent, #fbbf24);
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 40px var(--hook-glow, rgba(251, 191, 36, 0.25));
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
        }

        .slide-hook .hook-badge {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 12px 28px;
            border-radius: 9999px;
            background: var(--hook-accent, #fbbf24);
            color: #0f172a;
            font-size: 24px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 2.5px;
            box-shadow: 0 4px 18px var(--hook-glow, rgba(251, 191, 36, 0.5));
        }

        .slide-hook .hook-headline {
            font-size: 68px;
            line-height: 1.15;
            font-weight: 900;
            color: #ffffff;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: -1px;
            text-shadow: 0 4px 24px rgba(0, 0, 0, 0.95), 0 2px 4px rgba(0, 0, 0, 0.8);
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        .slide-hook .hook-value-pill {
            display: inline-block;
            background: rgba(255, 255, 255, 0.12);
            border: 1px solid rgba(255, 255, 255, 0.22);
            border-radius: 20px;
            padding: 14px 24px;
            margin-top: 4px;
        }

        .slide-hook .hook-value-text {
            font-size: 32px;
            line-height: 1.35;
            font-weight: 600;
            color: #f1f5f9;
            margin: 0;
            text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
        }
    `;
  }

  /**
   * Generates the complete HTML markup for the opening Anti-Swipe Visual Hook slide.
   */
  static createHookSlideHTML(script = {}, visualAssets = [], options = {}) {
    const config = this.resolveConfig(script, options);
    const bgImage = visualAssets && visualAssets.length > 0 ? visualAssets[0] : null;

    const inlineVars = `--hook-accent: ${config.accentColor}; --hook-glow: ${config.glowColor};`;

    return `
    <!-- Opening Anti-Swipe Visual Hook (Phase 1 Feature 1.3 - 0-2s Immediate Value Hook) -->
    <div class="slide slide-hook active" style="${inlineVars}" data-hook-duration="${config.duration}" data-hook-variant="${config.variant}">
        ${bgImage ? `<img class="background-image" src="${bgImage}" alt="" style="opacity: 0.28; filter: brightness(75%) contrast(115%);" />` : ''}
        <div class="hook-spotlight"></div>
        <div class="gradient-overlay"></div>
        <div class="safe-zone">
            <div class="hook-container">
                <div class="hook-badge">${escapeHTML(config.badge)}</div>
                <h1 class="hook-headline">${escapeHTML(config.headline)}</h1>
                <div class="hook-value-pill">
                    <p class="hook-value-text">${escapeHTML(config.subheadline)}</p>
                </div>
            </div>
        </div>
    </div>`;
  }
}

function escapeHTML(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  ShortsVisualHook,
  HOOK_VARIANTS,
  DEFAULT_HOOK_DURATION,
  MIN_HOOK_DURATION,
  MAX_HOOK_DURATION
};
