'use strict';

const { ShortsVisualHook } = require('./shorts-visual-hook');

/**
 * Shorts Canvas Compositor
 *
 * Provides native vertical (9:16) 1080x1920 canvas geometry, YouTube Shorts safe zones,
 * and responsive HTML/CSS layouts for rendering high-retention vertical video slides.
 */

const CANVAS_PRESETS = {
  '9:16': {
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    name: 'shorts'
  },
  '16:9': {
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    name: 'horizontal'
  }
};

/**
 * YouTube Shorts Safe Zone specifications (1080x1920 viewport):
 * - Top UI overlay: sound track title, back button, camera icon (~200px)
 * - Bottom UI overlay: channel avatar, handle, subscribe button, title text, sound pill (~480px)
 * - Right UI overlay: Like, Dislike, Comments, Share, Remix icons (~140px)
 * - Left margin: screen edge clearance (~60px)
 */
const SHORTS_SAFE_ZONE = {
  top: 220,
  bottom: 480,
  left: 60,
  right: 140,
  maxWidth: 880,
  maxHeight: 1220
};

class ShortsCanvasCompositor {
  static get CANVAS_PRESETS() {
    return CANVAS_PRESETS;
  }

  static get SHORTS_SAFE_ZONE() {
    return SHORTS_SAFE_ZONE;
  }

  /**
   * Resolve canvas dimensions from options or aspect ratio string.
   * Defaults to 16:9 if unspecified for backward compatibility.
   */
  static resolveCanvas(options = {}) {
    if (typeof options === 'string') {
      return CANVAS_PRESETS[options] || CANVAS_PRESETS['16:9'];
    }

    const ratio = options.aspectRatio || options.ratio;
    if (ratio && CANVAS_PRESETS[ratio]) {
      return CANVAS_PRESETS[ratio];
    }

    if (options.isShort === true || options.format === 'shorts' || options.contentType === 'short' || options.contentType === 'shorts') {
      return CANVAS_PRESETS['9:16'];
    }

    if (Number(options.width) === 1080 && Number(options.height) === 1920) {
      return CANVAS_PRESETS['9:16'];
    }

    return CANVAS_PRESETS['16:9'];
  }

  /**
   * Returns whether the given canvas or options represent a vertical 9:16 canvas.
   */
  static isVertical(options = {}) {
    const canvas = this.resolveCanvas(options);
    return canvas.aspectRatio === '9:16';
  }

  /**
   * Generates scoped CSS for the slideshow template based on canvas aspect ratio.
   */
  static generateCSS(canvas = CANVAS_PRESETS['16:9'], options = {}) {
    const isShorts = canvas.aspectRatio === '9:16';
    const showSafeZoneDebug = options.debugSafeZone === true;

    if (!isShorts) {
      // Horizontal 1920x1080 (preserves existing styling exactly)
      return `
        body {
            margin: 0;
            padding: 0;
            width: 1920px;
            height: 1080px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: 'Arial', sans-serif;
            overflow: hidden;
        }
        
        .slide {
            position: absolute;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 2s ease-in-out;
        }
        
        .slide.active {
            opacity: 1;
        }
        
        .content {
            text-align: center;
            color: white;
            max-width: 80%;
        }
        
        h1 {
            font-size: 72px;
            margin-bottom: 30px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }
        
        h2 {
            font-size: 48px;
            margin-bottom: 20px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }
        
        p {
            font-size: 36px;
            line-height: 1.4;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        }
        
        .background-image {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0.3;
            z-index: -1;
        }
        
        .particles {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            z-index: -1;
        }
        
        .particle {
            position: absolute;
            background: rgba(255,255,255,0.8);
            border-radius: 50%;
            animation: float 6s ease-in-out infinite;
        }
        
        @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
        }
      `;
    }

    // Native 9:16 Vertical 1080x1920 with safe zones & mobile-optimized typography
    return `
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 0;
            width: 1080px;
            height: 1920px;
            background: linear-gradient(160deg, #0d1117 0%, #161b22 40%, #1f2937 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            overflow: hidden;
            color: #ffffff;
        }

        .slide {
            position: absolute;
            top: 0;
            left: 0;
            width: 1080px;
            height: 1920px;
            opacity: 0;
            transition: opacity 1.5s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
        }

        .slide.active {
            opacity: 1;
        }

        /* YouTube Shorts Safe Zone Container */
        .safe-zone {
            position: absolute;
            top: ${SHORTS_SAFE_ZONE.top}px;
            bottom: ${SHORTS_SAFE_ZONE.bottom}px;
            left: ${SHORTS_SAFE_ZONE.left}px;
            right: ${SHORTS_SAFE_ZONE.right}px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            pointer-events: none;
            ${showSafeZoneDebug ? 'outline: 2px dashed rgba(255, 68, 68, 0.85); background: rgba(255, 0, 0, 0.05);' : ''}
        }

        .content {
            width: 100%;
            max-width: ${SHORTS_SAFE_ZONE.maxWidth}px;
            text-align: center;
            padding: 32px 24px;
            background: rgba(13, 17, 23, 0.55);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-radius: 28px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        .badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 24px;
            border-radius: 9999px;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.85), rgba(168, 85, 247, 0.85));
            color: #ffffff;
            font-size: 22px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 24px;
            box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
        }

        h1 {
            font-size: 58px;
            line-height: 1.22;
            font-weight: 800;
            margin: 0 0 20px 0;
            color: #ffffff;
            text-shadow: 0 4px 16px rgba(0, 0, 0, 0.7);
            letter-spacing: -0.5px;
        }

        h2 {
            font-size: 46px;
            line-height: 1.25;
            font-weight: 700;
            margin: 0 0 20px 0;
            color: #f3f4f6;
            text-shadow: 0 4px 12px rgba(0, 0, 0, 0.7);
        }

        p {
            font-size: 34px;
            line-height: 1.45;
            font-weight: 400;
            margin: 0 0 16px 0;
            color: #e5e7eb;
            text-shadow: 0 2px 8px rgba(0, 0, 0, 0.65);
        }

        .card-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
            width: 100%;
            margin-top: 12px;
        }

        .card-item {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 18px;
            padding: 16px 20px;
            text-align: left;
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .card-number {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 44px;
            height: 44px;
            border-radius: 12px;
            background: #6366f1;
            color: #ffffff;
            font-size: 24px;
            font-weight: 800;
            flex-shrink: 0;
        }

        .card-text {
            font-size: 30px;
            line-height: 1.35;
            font-weight: 500;
            color: #ffffff;
            margin: 0;
        }

        .background-image {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
            opacity: 0.38;
            z-index: -1;
            filter: contrast(105%) brightness(95%);
        }

        .gradient-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at center, transparent 30%, rgba(0, 0, 0, 0.65) 100%);
            z-index: -1;
        }

        .particles {
            position: absolute;
            top: 0;
            left: 0;
            width: 1080px;
            height: 1920px;
            overflow: hidden;
            z-index: -1;
        }

        .particle {
            position: absolute;
            background: rgba(255, 255, 255, 0.7);
            border-radius: 50%;
            animation: float 7s ease-in-out infinite;
        }

        @keyframes float {
            0%, 100% { transform: translateY(0px) scale(1); }
            50% { transform: translateY(-30px) scale(1.15); }
        }
        ${options.visualHook !== false && options.hook !== false ? ShortsVisualHook.generateCSS(options) : ''}
    `;
  }

  /**
   * Builds the complete HTML document for either a vertical 9:16 Shorts or horizontal 16:9 slideshow.
   */
  static createSlideshowHTML(script, visualAssets = [], options = {}) {
    const canvas = this.resolveCanvas(options);
    const isShorts = canvas.aspectRatio === '9:16';
    const css = this.generateCSS(canvas, options);

    const titleSlide = isShorts
      ? ((options.visualHook !== false && options.hook !== false)
          ? ShortsVisualHook.createHookSlideHTML(script, visualAssets, options)
          : `
    <!-- Title Slide (Shorts Safe Zone) -->
    <div class="slide active">
        ${visualAssets[0] ? `<img class="background-image" src="${visualAssets[0]}" alt="" />` : ''}
        <div class="gradient-overlay"></div>
        <div class="safe-zone">
            <div class="content">
                <div class="badge">🔥 Short Takeaway</div>
                <h1>${escapeHTML(script.title || 'Untitled Story')}</h1>
                <p>Watch till the end for the full breakdown</p>
            </div>
        </div>
    </div>`)
      : `
    <!-- Title Slide (Horizontal) -->
    <div class="slide active">
        ${visualAssets[0] ? `<img class="background-image" src="${visualAssets[0]}" />` : ''}
        <div class="content">
            <h1>${escapeHTML(script.title || 'Untitled Video')}</h1>
            <p>Ethereal Dreamscript</p>
        </div>
    </div>`;

    const contentSlides = this.generateContentSlides(script, visualAssets, canvas);

    const outroSlide = isShorts
      ? `
    <!-- Outro Slide (Shorts Safe Zone) -->
    <div class="slide">
        ${visualAssets[visualAssets.length - 1] ? `<img class="background-image" src="${visualAssets[visualAssets.length - 1]}" alt="" />` : ''}
        <div class="gradient-overlay"></div>
        <div class="safe-zone">
            <div class="content">
                <div class="badge">✨ Subscribe ✨</div>
                <h2>Follow for Daily Shorts</h2>
                <p>New insights every day</p>
            </div>
        </div>
    </div>`
      : `
    <!-- Subscribe Slide (Horizontal) -->
    <div class="slide">
        <div class="content">
            <h2>✨ Subscribe for More Stories ✨</h2>
            <p>New content daily at 2:00 PM</p>
        </div>
    </div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>${escapeHTML(script.title || 'Video')}</title>
    <style>
${css}
    </style>
</head>
<body>
    <div class="particles"></div>
    ${titleSlide}
    ${contentSlides.join('\n')}
    ${outroSlide}

    <script>
        function createParticles() {
            const container = document.querySelector('.particles');
            if (!container) return;
            const count = ${isShorts ? 30 : 20};
            for (let i = 0; i < count; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                particle.style.left = Math.random() * 100 + '%';
                particle.style.top = Math.random() * 100 + '%';
                particle.style.width = (Math.random() * 5 + 2) + 'px';
                particle.style.height = particle.style.width;
                particle.style.animationDelay = Math.random() * 6 + 's';
                container.appendChild(particle);
            }
        }

        let currentSlide = 0;
        const slides = document.querySelectorAll('.slide');

        function advanceAnimation() {
            if (!slides.length) return;
            slides[currentSlide].classList.remove('active');
            currentSlide = (currentSlide + 1) % slides.length;
            slides[currentSlide].classList.add('active');
        }

        window.advanceAnimation = advanceAnimation;
        createParticles();
    </script>
</body>
</html>`;
  }

  /**
   * Generates slide markup for each section of the script.
   */
  static generateContentSlides(script, visualAssets = [], canvas = CANVAS_PRESETS['16:9']) {
    const slides = [];
    const isShorts = canvas.aspectRatio === '9:16';
    const sections = script.mainContent?.sections || [];

    sections.forEach((section, index) => {
      const assetIndex = visualAssets.length > 0
        ? Math.min(index + 1, visualAssets.length - 1)
        : -1;
      const asset = assetIndex >= 0 ? visualAssets[assetIndex] : null;

      if (isShorts) {
        slides.push(`
    <div class="slide">
        ${asset ? `<img class="background-image" src="${asset}" alt="" />` : ''}
        <div class="gradient-overlay"></div>
        <div class="safe-zone">
            <div class="content">
                <h2>${escapeHTML(section.title || `Point ${index + 1}`)}</h2>
                ${this.formatShortsSectionContent(section)}
            </div>
        </div>
    </div>`);
      } else {
        slides.push(`
    <div class="slide">
        ${asset ? `<img class="background-image" src="${asset}" />` : ''}
        <div class="content">
            <h2>${escapeHTML(section.title || `Section ${index + 1}`)}</h2>
            ${this.formatHorizontalSectionContent(section)}
        </div>
    </div>`);
      }
    });

    return slides;
  }

  static formatShortsSectionContent(section) {
    if (section.items && Array.isArray(section.items) && section.items.length > 0) {
      return `<div class="card-list">` +
        section.items.slice(0, 3).map((item, idx) => `
            <div class="card-item">
                <div class="card-number">${item.number || idx + 1}</div>
                <div class="card-text">${escapeHTML(item.title || item.text || String(item))}</div>
            </div>`).join('') +
        `</div>`;
    }

    if (section.steps && Array.isArray(section.steps) && section.steps.length > 0) {
      return `<div class="card-list">` +
        section.steps.slice(0, 3).map((step, idx) => `
            <div class="card-item">
                <div class="card-number">${idx + 1}</div>
                <div class="card-text">${escapeHTML(step.title || step.description || String(step))}</div>
            </div>`).join('') +
        `</div>`;
    }

    if (typeof section.content === 'string' && section.content.trim()) {
      const text = section.content.trim();
      const truncated = text.length > 180 ? `${text.slice(0, 180)}…` : text;
      return `<p>${escapeHTML(truncated)}</p>`;
    }

    return '<p>Essential key takeaway</p>';
  }

  static formatHorizontalSectionContent(section) {
    if (section.items && Array.isArray(section.items)) {
      return section.items.slice(0, 3).map(item =>
        `<p>${escapeHTML(String(item.number || ''))}. ${escapeHTML(item.title || '')}</p>`
      ).join('');
    }

    if (section.steps && Array.isArray(section.steps)) {
      return section.steps.slice(0, 3).map(step =>
        `<p>${escapeHTML(step.title || '')}</p>`
      ).join('');
    }

    if (typeof section.content === 'string') {
      const text = section.content;
      return `<p>${escapeHTML(text.slice(0, 200))}${text.length > 200 ? '...' : ''}</p>`;
    }

    return '<p>Content coming soon...</p>';
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
  ShortsCanvasCompositor,
  CANVAS_PRESETS,
  SHORTS_SAFE_ZONE,
  ShortsVisualHook
};
