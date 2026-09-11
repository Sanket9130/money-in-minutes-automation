'use strict';

const { ShortsVisualHook } = require('./shorts-visual-hook');
const { CharacterEngine } = require('./character-engine');
const { ShortsSceneDirector } = require('./shorts-scene-director');
const { EnvironmentEngine } = require('./environment-engine');

/**
 * Shorts Canvas Compositor
 *
 * Provides native vertical (9:16) 1080x1920 canvas geometry, YouTube Shorts safe zones,
 * animated 3D environments, character presenter with visemes, and responsive HTML/CSS layouts.
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

    if (
      options.isShort === true ||
      options.isShorts === true ||
      options.format === 'short' ||
      options.format === 'shorts' ||
      options.contentType === 'short' ||
      options.contentType === 'shorts' ||
      options.requestedLengthKey === 'short' ||
      options.requestedLength === 'short'
    ) {
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
            transition: opacity 1.5s ease-in-out;
        }
        
        .slide.active {
            opacity: 1;
        }
        
        .content {
            text-align: center;
            color: white;
            z-index: 2;
            max-width: 1200px;
            padding: 40px;
            background: rgba(0, 0, 0, 0.6);
            border-radius: 20px;
            backdrop-filter: blur(10px);
        }
        
        h1 {
            font-size: 64px;
            margin-bottom: 20px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }
        
        h2 {
            font-size: 48px;
            margin-bottom: 20px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }
        
        p {
            font-size: 32px;
            line-height: 1.6;
            margin-bottom: 15px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        }
        
        .background-image {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            z-index: 1;
            opacity: 0.3;
        }
        
        .particles {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            z-index: 1;
        }
        
        .particle {
            position: absolute;
            background: rgba(255, 255, 255, 0.5);
            border-radius: 50%;
            animation: float 6s infinite linear;
        }
        
        @keyframes float {
            0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
            50% { opacity: 1; }
            100% { transform: translateY(-100px) rotate(360deg); opacity: 0; }
        }
      `;
    }

    // Vertical 1080x1920 (Native YouTube Shorts Layout)
    return `
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            margin: 0;
            padding: 0;
            width: 1080px;
            height: 1920px;
            background: radial-gradient(circle at 50% 30%, #1e293b 0%, #0f172a 65%, #020617 100%);
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
            transition: opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
        }

        .slide.active {
            opacity: 1;
        }

        /* Animated Environment Background Layer */
        .environment-container {
            position: absolute;
            top: 0;
            left: 0;
            width: 1080px;
            height: 1920px;
            z-index: 1;
        }

        .environment-layer {
            width: 1080px;
            height: 1920px;
            display: block;
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
            justify-content: flex-start;
            align-items: center;
            pointer-events: none;
            gap: 20px;
            z-index: 5;
            ${showSafeZoneDebug ? 'outline: 2px dashed rgba(255, 68, 68, 0.85); background: rgba(255, 0, 0, 0.05);' : ''}
        }

        .content {
            width: 100%;
            max-width: ${SHORTS_SAFE_ZONE.maxWidth}px;
            text-align: center;
            padding: 24px 20px;
            background: rgba(15, 23, 42, 0.72);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 28px;
            border: 1px solid rgba(255, 255, 255, 0.16);
            box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6);
            word-wrap: break-word;
            overflow-wrap: break-word;
            z-index: 6;
        }

        /* Header Badges */
        .badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 22px;
            border-radius: 9999px;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(168, 85, 247, 0.9));
            color: #ffffff;
            font-size: 20px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 16px;
            box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
        }

        .badge-gold {
            background: linear-gradient(135deg, #F59E0B, #D97706);
            color: #FFFFFF;
            box-shadow: 0 4px 16px rgba(245, 158, 11, 0.45);
        }

        h1 {
            font-size: 54px;
            line-height: 1.2;
            font-weight: 900;
            margin: 0 0 16px 0;
            color: #ffffff;
            text-shadow: 0 4px 16px rgba(0, 0, 0, 0.8);
            letter-spacing: -0.5px;
        }

        h2 {
            font-size: 42px;
            line-height: 1.25;
            font-weight: 800;
            margin: 0 0 16px 0;
            color: #f3f4f6;
            text-shadow: 0 4px 12px rgba(0, 0, 0, 0.8);
        }

        p {
            font-size: 30px;
            line-height: 1.4;
            font-weight: 500;
            margin: 0 0 14px 0;
            color: #e2e8f0;
            text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
        }

        /* Character Presenter Layer */
        .character-layer {
            position: absolute;
            bottom: 0px;
            z-index: 10;
            pointer-events: none;
            filter: drop-shadow(0 16px 32px rgba(0,0,0,0.6));
        }

        .character-pos-right {
            right: -20px;
        }

        .character-pos-left {
            left: -20px;
        }

        .character-pos-center {
            left: 50%;
            transform: translateX(-50%);
        }

        /* Hero Callout Cards */
        .hook-hero-card, .outro-hero-card {
            background: rgba(15, 23, 42, 0.8);
            border: 2px solid rgba(245, 158, 11, 0.5);
            border-radius: 32px;
            padding: 36px 28px;
            text-align: center;
            box-shadow: 0 24px 60px rgba(0,0,0,0.7), 0 0 40px rgba(245, 158, 11, 0.2);
            backdrop-filter: blur(24px);
        }

        .hook-badge, .outro-brand-pill {
            display: inline-block;
            padding: 8px 24px;
            background: linear-gradient(135deg, #EF4444, #F59E0B);
            color: #FFFFFF;
            font-size: 22px;
            font-weight: 900;
            border-radius: 9999px;
            letter-spacing: 2px;
            margin-bottom: 20px;
        }

        .outro-brand-pill {
            background: linear-gradient(135deg, #F59E0B, #10B981);
        }

        .background-image {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
            opacity: 0.32;
            z-index: 2;
            filter: contrast(110%) brightness(85%);
        }

        .gradient-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at center, transparent 20%, rgba(2, 6, 23, 0.75) 100%);
            z-index: 3;
        }

        .particles {
            position: absolute;
            top: 0;
            left: 0;
            width: 1080px;
            height: 1920px;
            overflow: hidden;
            z-index: 4;
        }

        .particle {
            position: absolute;
            background: rgba(245, 158, 11, 0.5);
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

    if (!isShorts) {
      // 16:9 Horizontal Slideshow
      const titleSlide = `
    <!-- Title Slide (Horizontal) -->
    <div class="slide active">
        ${visualAssets[0] ? `<img class="background-image" src="${visualAssets[0]}" />` : ''}
        <div class="content">
            <h1>${escapeHTML(script.title || 'Untitled Video')}</h1>
            <p>Ethereal Dreamscript</p>
        </div>
    </div>`;

      const contentSlides = this.generateContentSlides(script, visualAssets, canvas);

      const outroSlide = `
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
    <style>${css}</style>
</head>
<body>
    <div class="particles"></div>
    ${titleSlide}
    ${contentSlides.join('\n')}
    ${outroSlide}
    <script>
        let currentSlide = 0;
        const slides = document.querySelectorAll('.slide');
        function advanceAnimation() {
            if (!slides.length) return;
            slides[currentSlide].classList.remove('active');
            currentSlide = (currentSlide + 1) % slides.length;
            slides[currentSlide].classList.add('active');
        }
        window.advanceAnimation = advanceAnimation;
    </script>
</body>
</html>`;
    }

    // 9:16 Vertical Shorts: Directed High-Retention Character Experience
    const director = new ShortsSceneDirector(options);
    const charEngine = new CharacterEngine(options);
    const envEngine = new EnvironmentEngine();
    const scenes = director.directScript(script, options);

    const slideMarkups = scenes.map((scene, index) => {
      const isFirst = index === 0;
      if (isFirst && options.visualHook !== false && options.hook !== false) {
        return ShortsVisualHook.createHookSlideHTML(script, visualAssets, options);
      }

      const assetIndex = visualAssets.length > 0 ? index % visualAssets.length : -1;
      const asset = assetIndex >= 0 ? visualAssets[assetIndex] : null;

      // Render thematic 3D animated environment background
      const envSVG = envEngine.renderEnvironmentSVG(scene.environment?.type, {
        sceneIndex: index,
        width: 1080,
        height: 1920
      });

      // Render articulated character presenter with speech visemes
      const charSVG = scene.character?.present
        ? charEngine.renderCharacterSVG(scene.character.pose, {
            position: scene.character.position,
            scale: scene.character.scale || 1.0,
            width: 420,
            height: 600,
            viseme: 'open_wide',
            mouthOpenness: 0.75,
            isBlinking: false,
            headBobY: index % 2 === 0 ? 2 : -2
          })
        : '';

      const charClass = scene.character?.position === 'left'
        ? 'character-pos-left'
        : (scene.character?.position === 'center' ? 'character-pos-center' : 'character-pos-right');

      return `
    <!-- Scene Slide ${index + 1}: ${scene.type} (Shorts Safe Zone) -->
    <div class="slide ${isFirst ? 'active' : ''}" data-scene-id="${scene.sceneId}">
        <div class="environment-container">${envSVG}</div>
        ${asset ? `<img class="background-image" src="${asset}" alt="" />` : ''}
        <div class="gradient-overlay"></div>
        <div class="safe-zone">
            <div class="content">
                <div class="badge badge-gold">${escapeHTML(scene.headline || 'MONEY IN MINUTES')}</div>
                <h2>${escapeHTML(scene.headline || '')}</h2>
                ${scene.financialGraphic?.markup || `<p>${escapeHTML(scene.narration || '')}</p>`}
            </div>
            ${charSVG ? `<div class="character-layer ${charClass}">${charSVG}</div>` : ''}
        </div>
    </div>`;
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>${escapeHTML(script.title || 'Short')}</title>
    <style>
${css}
    </style>
</head>
<body>
    <div class="particles"></div>
    ${slideMarkups.join('\n')}

    <script>
        function createParticles() {
            const container = document.querySelector('.particles');
            if (!container) return;
            const count = 35;
            for (let i = 0; i < count; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                particle.style.left = Math.random() * 100 + '%';
                particle.style.top = Math.random() * 100 + '%';
                particle.style.width = (Math.random() * 6 + 3) + 'px';
                particle.style.height = particle.style.width;
                particle.style.animationDelay = Math.random() * 5 + 's';
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
   * Generates slide markup for each section of the script (horizontal mode compatibility).
   */
  static generateContentSlides(script, visualAssets = [], _canvas = CANVAS_PRESETS['16:9']) {
    const slides = [];
    const sections = script.mainContent?.sections || [];

    sections.forEach((section, index) => {
      const assetIndex = visualAssets.length > 0
        ? Math.min(index + 1, visualAssets.length - 1)
        : -1;
      const asset = assetIndex >= 0 ? visualAssets[assetIndex] : null;

      slides.push(`
    <div class="slide">
        ${asset ? `<img class="background-image" src="${asset}" />` : ''}
        <div class="content">
            <h2>${escapeHTML(section.title || `Section ${index + 1}`)}</h2>
            ${this.formatHorizontalSectionContent(section)}
        </div>
    </div>`);
    });

    return slides;
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
