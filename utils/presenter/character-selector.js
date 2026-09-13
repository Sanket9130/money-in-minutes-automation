'use strict';

const path = require('path');
const fs = require('fs').promises;
const { runFFmpeg } = require('../ffmpeg');
const { Logger } = require('../logger');
const { LivePortraitPresenter } = require('./liveportrait-presenter');

const PRESENTERS = {
  david_chen: {
    id: 'david_chen',
    name: 'David Chen',
    title: 'Consumer Finance Specialist',
    domain: 'consumer_finance',
    keywords: ['subscription', 'bank', 'spend', 'bill', 'consumer', 'save', 'budget', 'drain', 'card', 'debt', 'trap'],
    portraitFile: 'david_chen.jpg',
    recommendedVoice: 'en-US-GuyNeural',
    persona: 'Relatable, sharp, investigative consumer advocate'
  },
  marcus_vance: {
    id: 'marcus_vance',
    name: 'Marcus Vance',
    title: 'Senior Wealth Strategist',
    domain: 'wealth_strategy',
    keywords: ['wealth', 'compound', 'invest', 'stock', 'retirement', 'index fund', 'dividend', 'estate', 'portfolio'],
    portraitFile: 'marcus_vance.jpg',
    recommendedVoice: 'en-US-DavisNeural',
    persona: 'Authoritative, calm, highly trustworthy financial strategist'
  },
  elena_rostova: {
    id: 'elena_rostova',
    name: 'Elena Rostova',
    title: 'Quantitative Tech Analyst',
    domain: 'tech_markets',
    keywords: [
      'tech', 'nvidia', 'ai', 'market cap', 'revenue', 'chips', 'valuation',
      'margin', 'growth', 'data', 'algorithm', 'model', 'corporate',
      'economics', 'business', 'profit', 'costco', 'retail', 'wholesale', 'membership'
    ],
    portraitFile: 'elena_rostova.jpg',
    recommendedVoice: 'en-US-AriaNeural',
    persona: 'Analytical, fast-paced, insightful tech & quantitative analyst'
  }
};

class CharacterSelector {
  constructor(options = {}) {
    this.logger = options.logger || new Logger('CharacterSelector');
    this.assetsDir = options.assetsDir || path.join(process.cwd(), 'assets', 'presenters');
    this.livePortrait = options.livePortrait || new LivePortraitPresenter({ logger: this.logger });
  }

  /**
   * Discovers the best matching presenter persona for a given topic or script.
   * Never hardcodes a single character.
   * Returns 'CREATE' if no character in library matches the domain.
   */
  selectCharacter(topicOrScript = '', options = {}) {
    const text = typeof topicOrScript === 'string'
      ? topicOrScript.toLowerCase()
      : `${topicOrScript.title || ''} ${topicOrScript.topic || ''} ${topicOrScript.category || ''} ${Array.isArray(topicOrScript.tags) ? topicOrScript.tags.join(' ') : ''}`.toLowerCase();

    let bestMatch = null;
    let highestScore = 0;

    for (const [_, presenter] of Object.entries(PRESENTERS)) {
      let score = 0;
      for (const kw of presenter.keywords) {
        if (text.includes(kw)) {
          score += 1;
        }
      }
      if (score > highestScore) {
        highestScore = score;
        bestMatch = presenter;
      }
    }

    if (!bestMatch || highestScore === 0) {
      if (options.fallbackToDefault) {
        bestMatch = PRESENTERS.david_chen;
      } else {
        this.logger.warn(`No suitable character persona found in library for topic: "${topicOrScript}". Returning CREATE.`);
        return 'CREATE';
      }
    }

    const portraitPath = path.join(this.assetsDir, bestMatch.portraitFile);
    return {
      ...bestMatch,
      portraitPath
    };
  }

  /**
   * Retrieves a specific character by ID.
   */
  getCharacter(id) {
    const p = PRESENTERS[id] || PRESENTERS.david_chen;
    return {
      ...p,
      portraitPath: path.join(this.assetsDir, p.portraitFile)
    };
  }

  /**
   * Retrieves all available characters.
   */
  listCharacters() {
    return Object.values(PRESENTERS).map(p => ({
      ...p,
      portraitPath: path.join(this.assetsDir, p.portraitFile)
    }));
  }

  /**
   * Renders a presenter video clip for a scene beat.
   * If LivePortrait is available and configured, animates the portrait.
   * Otherwise, renders the genuine portrait with subtle camera motion (Ken Burns / push-in)
   * and clean presenter branding in 1080x1920 30fps.
   */
  async renderPresenterClip(character, scene = {}, outputPath, options = {}) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const duration = Math.max(1, Number(scene.duration || options.duration || 4));
    const durStr = duration.toFixed(2);

    // 1. Check if LivePortrait is configured and available
    if (await this.livePortrait.isAvailable()) {
      try {
        const liveResult = await this.livePortrait.render({
          sourceImage: character.portraitPath,
          drivingVideo: options.drivingVideo,
          outputPath
        });
        if (liveResult.used) {
          this.logger.info(`Presenter clip rendered via LivePortrait for [${character.name}] -> ${outputPath}`);
          return { outputPath, provider: 'liveportrait', character };
        }
      } catch (lpErr) {
        this.logger.warn(`LivePortrait attempt failed (${lpErr.message}); falling back to cinematic portrait engine`);
      }
    }

    // 2. High-quality cinematic portrait motion rendering
    await fs.access(character.portraitPath);

    // Create high-fidelity SVG lower third banner for presenter identification
    const tempDir = path.dirname(outputPath);
    const badgePath = path.join(tempDir, `presenter_badge_${Date.now()}.png`);
    const { escapeXml } = require('../visual-treatment-engine');
    const sharp = require('sharp');

    const lowerThirdSvg = `
<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="ltShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>
  <g transform="translate(70, 1420)" filter="url(#ltShadow)">
    <rect width="680" height="84" rx="16" fill="rgba(15, 23, 42, 0.90)" stroke="rgba(56, 189, 248, 0.4)" stroke-width="1.5"/>
    <rect width="6" height="84" rx="3" fill="#38bdf8"/>
    <text x="28" y="36" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#ffffff">${escapeXml(character.name)}</text>
    <text x="28" y="68" font-family="Arial, sans-serif" font-size="18" font-weight="600" fill="#94a3b8">${escapeXml(character.title)}</text>
  </g>
</svg>
    `.trim();

    await sharp(Buffer.from(lowerThirdSvg)).png().toFile(badgePath);

    const isHook = Boolean(scene.isHook || scene.id?.includes('hook'));
    const isPayoff = Boolean(scene.id?.includes('payoff'));
    const isCTA = Boolean(scene.id?.includes('cta'));

    let motionExpr = "z='min(zoom+0.00025,1.03)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+sin(on/22)*2.5'";
    if (isHook) {
      motionExpr = "z='min(zoom+0.00035,1.04)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+sin(on/20)*2'";
    } else if (isPayoff) {
      motionExpr = "z='min(zoom+0.0002,1.03)':x='iw/2-(iw/zoom/2)+sin(on/28)*4':y='ih/2-(ih/zoom/2)'";
    } else if (isCTA) {
      motionExpr = "z='min(zoom+0.0003,1.035)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+cos(on/24)*2'";
    }

    const badgeEnd = Math.min(duration, 2.8);
    const filterComplex = [
      `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,zoompan=${motionExpr}:d=${Math.round(duration * 30)}:s=1080x1920:fps=30,eq=contrast=1.04:brightness=-0.02[base]`,
      `[1:v]format=rgba,fade=t=in:st=0.1:d=0.2:alpha=1,fade=t=out:st=${(badgeEnd - 0.3).toFixed(2)}:d=0.3:alpha=1[badge]`,
      `[base][badge]overlay=0:0:enable='between(t,0,${badgeEnd})'[vout]`
    ].join(';');

    const args = [
      '-y',
      '-loop', '1',
      '-i', character.portraitPath,
      '-loop', '1',
      '-i', badgePath,
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-t', durStr,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '19',
      '-r', '30',
      '-pix_fmt', 'yuv420p',
      outputPath
    ];

    try {
      await runFFmpeg(args);
    } finally {
      await fs.unlink(badgePath).catch(() => {});
    }
    this.logger.info(`Presenter cinematic clip rendered for [${character.name}] -> ${outputPath} (${durStr}s)`);

    return {
      outputPath,
      provider: 'cinematic_portrait',
      character
    };
  }
}

module.exports = {
  CharacterSelector,
  PRESENTERS
};
