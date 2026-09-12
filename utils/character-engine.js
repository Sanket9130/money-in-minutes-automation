'use strict';

/**
 * Money In Minutes Character Engine
 *
 * Provides a reusable, consistent, original fictional finance presenter ("Alex")
 * with a library of dynamic poses, facial expressions, viseme lip-sync, and high-retention visual actions.
 *
 * Renders both embedded responsive vector/SVG assets and consistent AI generation prompts.
 */

const { Logger } = require('./logger');
const { LipSyncEngine, VISEMES } = require('./lip-sync-engine');
const { CharacterDNAService } = require('./character-dna-service');
const { CharacterSelector } = require('./character-selector');

const CHARACTER_PROFILE = {
  id: 'money-in-minutes-presenter',
  name: 'Alex',
  role: 'Lead Finance & Business Explainer',
  appearance: {
    gender: 'Modern Professional',
    ageRange: 'Late 20s to early 30s',
    hair: 'Sleek styled dark chestnut hair',
    eyes: 'Expressive hazel/dark eyes with defined brows',
    outfit: 'Tailored navy blazer, crisp white oxford shirt, minimalist smart watch',
    style: 'Premium 3D / clean modern illustration hybrid with soft studio lighting',
    palette: {
      primary: '#1E293B',    // Navy slate blazer
      secondary: '#0F172A',  // Dark charcoal accents
      shirt: '#F8FAFC',      // Crisp white
      skinLight: '#FBD38D',  // Warm skin highlight
      skinDark: '#ED8936',   // Warm skin shadow
      hair: '#2D3748',       // Dark chestnut
      accentGold: '#F59E0B', // Financial gold
      accentGreen: '#10B981' // Profit emerald
    }
  }
};

const ALLOWED_POSES = [
  'explaining',
  'pointing_side',
  'pointing_up',
  'surprised',
  'shocked',
  'thinking',
  'holding_money',
  'holding_card',
  'walking_tracking',
  'looking_at_chart',
  'looking_at_phone',
  'celebrating',
  'worried',
  'confused',
  'skeptical',
  'shrugging',
  'presenting_numbers',
  'desk_presenter',
  'neutral'
];

class CharacterEngine {
  constructor(options = {}) {
    this.logger = new Logger('CharacterEngine');
    this.profile = CHARACTER_PROFILE;
    this.options = options;
    this.lipSync = new LipSyncEngine();
    this.dnaService = options.dnaService || new CharacterDNAService(options);
    this.selector = options.selector || new CharacterSelector({ dnaService: this.dnaService, ...options });
  }

  static get PROFILE() {
    return CHARACTER_PROFILE;
  }

  static get POSES() {
    return ALLOWED_POSES;
  }

  /**
   * Intelligently selects or creates the optimal presenter for a context.
   */
  selectPresenter(context = {}) {
    return this.selector.selectPresenter(context);
  }

  /**
   * Alias for selectPresenter for consistency.
   */
  selectCharacter(context = {}) {
    return this.selector.selectPresenter(context);
  }

  /**
   * Validates if a pose is supported. Defaults to 'explaining'.
   */
  normalizePose(pose) {
    if (typeof pose === 'string' && ALLOWED_POSES.includes(pose.toLowerCase())) {
      return pose.toLowerCase();
    }
    return 'explaining';
  }

  /**
   * Generates a descriptive AI prompt for image generators while enforcing strict character consistency.
   */
  generateAIPrompt(pose = 'explaining', context = {}) {
    if (context.character_id || (context.useMultiCharacter && context.topic)) {
      const selected = context.character_id
        ? { character: this.dnaService.getCharacter(context.character_id) }
        : this.selectPresenter(context);
      
      if (selected?.character) {
        const promptBundle = this.dnaService.buildPresenterPrompt(selected.character.character_id, pose, context.emotion || 'confident', context);
        return promptBundle.prompt;
      }
    }

    const normPose = this.normalizePose(pose);
    const topic = context.topic || 'finance and business';
    const env = context.environment || 'modern finance studio';

    const poseDescriptions = {
      explaining: 'gesturing with both hands professionally, engaged confident smile, explaining complex concepts',
      pointing_side: 'body angled slightly, right arm extended pointing directly to a glowing financial chart on the side',
      pointing_up: 'index finger pointing upwards towards a high-impact headline with an enthusiastic expression',
      surprised: 'eyes wide with realization, raised eyebrows, hands raised in an energetic gesture of discovery',
      shocked: 'dramatic gasp of astonishment, hand near mouth, eyes wide at an incredible financial fact',
      thinking: 'hand on chin, looking thoughtfully upward, contemplating customer behavior and economic principles',
      holding_money: 'holding a crisp fan of dollar bills in hand with a satisfied, knowledgeable smile',
      holding_card: 'holding a glowing gold VIP membership card directly toward the camera with a confident smile',
      walking_tracking: 'walking forward through a modern commercial warehouse space while speaking and gesturing',
      looking_at_chart: 'turned in profile looking attentively at a glowing holographic upward trending revenue chart',
      looking_at_phone: 'holding a sleek modern smartphone displaying live stock/financial data with focused interest',
      celebrating: 'triumphant fist pump, wide victorious smile with golden spark energy',
      worried: 'concerned expression, furrowed brow, looking down at shrinking profit margins',
      confused: 'scratching head, tilted posture, one raised eyebrow looking skeptically at a flawed business model',
      skeptical: 'arms crossed with knowing analytical smirk, evaluating retail pricing claims',
      shrugging: 'open palms shrug gesture explaining the counter-intuitive economics of wholesale clubs',
      presenting_numbers: 'both hands framing a central floating financial metric in mid-air',
      desk_presenter: 'seated behind a sleek minimalist executive desk with high-end microphone and laptop',
      neutral: 'standing comfortably in tailored navy blazer, approachable welcoming posture'
    };

    const actionDesc = poseDescriptions[normPose] || poseDescriptions.explaining;

    return `3D stylized character portrait of "Alex", a charismatic financial explainer, ${actionDesc}. ` +
      `Consistent character identity: late 20s, sleek dark chestnut hair, expressive hazel eyes, wearing a sharp tailored navy blazer with a crisp white collar, gold smart watch. ` +
      `Environment: ${env} contextualized for topic "${topic}". ` +
      `Style: Premium 3D Pixar/DreamWorks stylized render, cinematic rim lighting, 8k resolution, volumetric atmosphere, isolated subject focus, clean composition for mobile 9:16 vertical framing. No text.`;
  }

  /**
   * Alias for renderCharacterSVG for backward compatibility
   */
  generateCharacterSVG(pose = 'explaining', options = {}) {
    return this.renderCharacterSVG(pose, options);
  }

  /**
   * Renders high-quality articulated SVG character with lip-sync visemes, eye blinks, and gesture props.
   */
  renderCharacterSVG(pose = 'explaining', options = {}) {
    const normPose = this.normalizePose(pose);
    const width = options.width || 420;
    const height = options.height || 620;
    const palette = this.profile.appearance.palette;

    const viseme = options.viseme || VISEMES.REST;
    const mouthOpenness = options.mouthOpenness !== undefined ? options.mouthOpenness : 0.5;
    const isBlinking = options.isBlinking || false;
    const headBobY = options.headBobY || 0;
    const headTiltDeg = options.headTiltDeg || 0;
    const eyebrowRaise = options.eyebrowRaise || 0;

    const position = options.position || 'center';
    const poseElements = this.renderPoseAnatomy(normPose, palette, {
      viseme,
      mouthOpenness,
      isBlinking,
      eyebrowRaise
    });

    return `
      <svg class="character-presenter character-pose-${normPose} character-pos-${position}" viewBox="0 0 420 620" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="blazerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#2C3E50"/>
            <stop offset="50%" stop-color="${palette.primary}"/>
            <stop offset="100%" stop-color="${palette.secondary}"/>
          </linearGradient>
          <linearGradient id="skinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${palette.skinLight}"/>
            <stop offset="100%" stop-color="${palette.skinDark}"/>
          </linearGradient>
          <linearGradient id="goldGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FCD34D"/>
            <stop offset="100%" stop-color="${palette.accentGold}"/>
          </linearGradient>
          <filter id="charShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.45"/>
          </filter>
        </defs>

        <g filter="url(#charShadow)" class="character-body-group" transform="translate(0, ${headBobY * 0.5})">
          <!-- Torso & Navy Blazer -->
          <path d="M130,340 C130,270 170,250 210,250 C250,250 290,270 290,340 L310,580 C310,600 290,620 270,620 L150,620 C130,620 110,600 110,580 Z" 
                fill="url(#blazerGrad)"/>
          
          <!-- White Shirt & Collar -->
          <polygon points="185,250 235,250 210,330" fill="${palette.shirt}"/>
          <polygon points="175,250 210,290 195,250" fill="#E2E8F0"/>
          <polygon points="245,250 210,290 225,250" fill="#CBD5E1"/>

          <!-- Lapels & Blazer Cut -->
          <path d="M150,260 L195,350 L210,380 L225,350 L270,260 L245,380 L210,480 L175,380 Z" fill="#1E293B" opacity="0.85"/>
          <circle cx="210" cy="420" r="4" fill="#64748B"/>
          <circle cx="210" cy="460" r="4" fill="#64748B"/>

          <!-- Neck -->
          <rect x="192" y="210" width="36" height="45" rx="8" fill="url(#skinGrad)"/>

          <!-- Arms & Hands for Pose -->
          ${poseElements.arms}

          <!-- Articulated Head with Dynamic Tilt and Bob -->
          <g transform="translate(0, ${headBobY}) rotate(${headTiltDeg}, 210, 150)">
            <!-- Head Base -->
            <ellipse cx="210" cy="150" rx="65" ry="75" fill="url(#skinGrad)"/>
            <!-- Ears -->
            <circle cx="145" cy="155" r="14" fill="${palette.skinDark}"/>
            <circle cx="275" cy="155" r="14" fill="${palette.skinDark}"/>

            <!-- Styled Hair -->
            <path d="M140,140 C135,80 180,50 220,50 C265,50 285,85 280,140 C270,110 250,90 210,90 C170,90 150,115 140,140 Z" 
                  fill="${palette.hair}"/>
            <!-- Hair Front Swoosh -->
            <path d="M155,95 C185,65 240,70 265,95 C240,80 190,80 155,95 Z" fill="#475569"/>

            <!-- Facial Features & Expressions -->
            ${poseElements.face}
          </g>

          <!-- Props & Overlays -->
          ${poseElements.props || ''}
        </g>
      </svg>
    `;
  }

  /**
   * Internal anatomy builder for each distinct pose and expression.
   */
  renderPoseAnatomy(pose, palette, anim = {}) {
    const isBlink = anim.isBlinking;
    const eyebrowRaise = anim.eyebrowRaise || 0;
    const viseme = anim.viseme || VISEMES.REST;
    const mouthOpen = anim.mouthOpenness || 0.5;

    // Dynamic eyes
    const renderEyes = (emotion = 'neutral') => {
      if (isBlink) {
        return `
          <!-- Blinking Closed Eyes -->
          <path d="M175,140 Q185,146 195,140" stroke="#2D3748" stroke-width="4" stroke-linecap="round" fill="none"/>
          <path d="M225,140 Q235,146 245,140" stroke="#2D3748" stroke-width="4" stroke-linecap="round" fill="none"/>
        `;
      }
      if (emotion === 'shocked' || emotion === 'surprised') {
        return `
          <!-- Wide Shocked Eyes -->
          <ellipse cx="185" cy="138" rx="12" ry="13" fill="#FFFFFF" stroke="#2D3748" stroke-width="2"/>
          <ellipse cx="235" cy="138" rx="12" ry="13" fill="#FFFFFF" stroke="#2D3748" stroke-width="2"/>
          <circle cx="185" cy="138" r="6" fill="#0F172A"/>
          <circle cx="235" cy="138" r="6" fill="#0F172A"/>
          <circle cx="188" cy="135" r="3" fill="#FFFFFF"/>
          <circle cx="238" cy="135" r="3" fill="#FFFFFF"/>
        `;
      }
      return `
        <!-- Confident Friendly Eyes -->
        <ellipse cx="185" cy="140" rx="9" ry="10" fill="#FFFFFF"/>
        <ellipse cx="235" cy="140" rx="9" ry="10" fill="#FFFFFF"/>
        <circle cx="187" cy="140" r="5.5" fill="#0F172A"/>
        <circle cx="237" cy="140" r="5.5" fill="#0F172A"/>
        <circle cx="189" cy="138" r="2.5" fill="#FFFFFF"/>
        <circle cx="239" cy="138" r="2.5" fill="#FFFFFF"/>
      `;
    };

    // Eyebrows
    const renderBrows = (emotion = 'neutral') => {
      const yOffset = -eyebrowRaise;
      if (emotion === 'shocked' || emotion === 'surprised') {
        return `
          <path d="M170,${116 + yOffset} Q185,${106 + yOffset} 200,${114 + yOffset}" stroke="#2D3748" stroke-width="5" stroke-linecap="round" fill="none"/>
          <path d="M220,${114 + yOffset} Q235,${106 + yOffset} 250,${116 + yOffset}" stroke="#2D3748" stroke-width="5" stroke-linecap="round" fill="none"/>
        `;
      }
      if (emotion === 'thinking' || emotion === 'skeptical') {
        return `
          <path d="M172,${126 + yOffset} Q185,${124 + yOffset} 198,${120 + yOffset}" stroke="#2D3748" stroke-width="4.5" stroke-linecap="round" fill="none"/>
          <path d="M222,${114 + yOffset} Q235,${106 + yOffset} 248,${114 + yOffset}" stroke="#2D3748" stroke-width="4.5" stroke-linecap="round" fill="none"/>
        `;
      }
      return `
        <path d="M172,${124 + yOffset} Q185,${118 + yOffset} 198,${124 + yOffset}" stroke="#2D3748" stroke-width="4" stroke-linecap="round" fill="none"/>
        <path d="M222,${124 + yOffset} Q235,${118 + yOffset} 248,${124 + yOffset}" stroke="#2D3748" stroke-width="4" stroke-linecap="round" fill="none"/>
      `;
    };

    const nose = `<path d="M210,142 L206,160 L214,160" stroke="${palette.skinDark}" stroke-width="2.5" stroke-linecap="round" fill="none"/>`;
    const mouth = `<g transform="translate(210, 175)">${this.lipSync.renderVisemeMouthSVG(viseme, mouthOpen, pose)}</g>`;

    switch (pose) {
      case 'holding_card':
        return {
          arms: `
            <path d="M130,270 Q100,350 110,430" stroke="url(#blazerGrad)" stroke-width="40" stroke-linecap="round" fill="none"/>
            <circle cx="110" cy="435" r="18" fill="url(#skinGrad)"/>
            <path d="M280,270 Q320,320 290,380" stroke="url(#blazerGrad)" stroke-width="40" stroke-linecap="round" fill="none"/>
            <circle cx="290" cy="380" r="18" fill="url(#skinGrad)"/>
          `,
          face: `${renderEyes('neutral')} ${renderBrows('neutral')} ${nose} ${mouth}`,
          props: `
            <!-- Glowing Gold VIP Membership Card Held Forward -->
            <g transform="translate(250, 320) rotate(-10)">
              <rect x="0" y="0" width="130" height="80" rx="8" fill="url(#goldGlow)" stroke="#FFF" stroke-width="2"/>
              <rect x="15" y="20" width="25" height="20" rx="3" fill="#D97706"/>
              <text x="15" y="65" fill="#1E293B" font-size="11" font-weight="900" font-family="sans-serif">MEMBER #1006</text>
            </g>
          `
        };

      case 'walking_tracking':
        return {
          arms: `
            <path d="M130,270 Q90,340 120,410" stroke="url(#blazerGrad)" stroke-width="38" stroke-linecap="round" fill="none"/>
            <circle cx="120" cy="410" r="18" fill="url(#skinGrad)"/>
            <path d="M280,270 Q320,330 290,410" stroke="url(#blazerGrad)" stroke-width="38" stroke-linecap="round" fill="none"/>
            <circle cx="290" cy="410" r="18" fill="url(#skinGrad)"/>
          `,
          face: `${renderEyes('neutral')} ${renderBrows('neutral')} ${nose} ${mouth}`
        };

      case 'pointing_side':
        return {
          arms: `
            <path d="M130,270 Q100,350 110,430" stroke="url(#blazerGrad)" stroke-width="40" stroke-linecap="round" fill="none"/>
            <circle cx="110" cy="435" r="18" fill="url(#skinGrad)"/>
            <path d="M280,270 Q340,290 380,300" stroke="url(#blazerGrad)" stroke-width="40" stroke-linecap="round" fill="none"/>
            <g transform="translate(380, 290)">
              <ellipse cx="12" cy="10" rx="14" ry="12" fill="url(#skinGrad)"/>
              <path d="M16,8 L40,8 Q44,8 44,12 Q44,16 40,16 L16,16" fill="url(#skinGrad)"/>
            </g>
          `,
          face: `${renderEyes('neutral')} ${renderBrows('neutral')} ${nose} ${mouth}`
        };

      case 'pointing_up':
        return {
          arms: `
            <path d="M130,270 Q100,350 110,430" stroke="url(#blazerGrad)" stroke-width="40" stroke-linecap="round" fill="none"/>
            <circle cx="110" cy="435" r="18" fill="url(#skinGrad)"/>
            <path d="M280,270 Q320,240 310,180" stroke="url(#blazerGrad)" stroke-width="40" stroke-linecap="round" fill="none"/>
            <g transform="translate(300, 140)">
              <ellipse cx="10" cy="30" rx="14" ry="12" fill="url(#skinGrad)"/>
              <path d="M8,26 L8,6 Q8,2 12,2 Q16,2 16,6 L16,26" fill="url(#skinGrad)"/>
            </g>
          `,
          face: `${renderEyes('neutral')} ${renderBrows('neutral')} ${nose} ${mouth}`
        };

      case 'shocked':
      case 'surprised':
        return {
          arms: `
            <path d="M130,270 Q110,220 155,185" stroke="url(#blazerGrad)" stroke-width="36" stroke-linecap="round" fill="none"/>
            <circle cx="155" cy="185" r="16" fill="url(#skinGrad)"/>
            <path d="M280,270 Q300,220 265,185" stroke="url(#blazerGrad)" stroke-width="36" stroke-linecap="round" fill="none"/>
            <circle cx="265" cy="185" r="16" fill="url(#skinGrad)"/>
          `,
          face: `${renderEyes('shocked')} ${renderBrows('shocked')} ${nose} ${mouth}`
        };

      case 'thinking':
      case 'skeptical':
        return {
          arms: `
            <path d="M130,270 Q100,340 160,360" stroke="url(#blazerGrad)" stroke-width="36" stroke-linecap="round" fill="none"/>
            <path d="M280,270 Q310,250 255,200" stroke="url(#blazerGrad)" stroke-width="36" stroke-linecap="round" fill="none"/>
            <circle cx="250" cy="195" r="16" fill="url(#skinGrad)"/>
          `,
          face: `${renderEyes('neutral')} ${renderBrows('thinking')} ${nose} ${mouth}`
        };

      case 'holding_money':
        return {
          arms: `
            <path d="M130,270 Q100,350 110,430" stroke="url(#blazerGrad)" stroke-width="40" stroke-linecap="round" fill="none"/>
            <circle cx="110" cy="435" r="18" fill="url(#skinGrad)"/>
            <path d="M280,270 Q320,330 295,370" stroke="url(#blazerGrad)" stroke-width="40" stroke-linecap="round" fill="none"/>
            <circle cx="295" cy="370" r="18" fill="url(#skinGrad)"/>
          `,
          face: `${renderEyes('neutral')} ${renderBrows('neutral')} ${nose} ${mouth}`,
          props: `
            <g transform="translate(270, 310) rotate(15)">
              <rect x="0" y="0" width="70" height="40" rx="4" fill="#10B981" stroke="#34D399" stroke-width="2"/>
              <text x="35" y="26" fill="#FFFFFF" font-size="20" font-weight="900" text-anchor="middle">$</text>
            </g>
          `
        };

      case 'celebrating':
        return {
          arms: `
            <path d="M130,270 Q90,210 100,160" stroke="url(#blazerGrad)" stroke-width="38" stroke-linecap="round" fill="none"/>
            <circle cx="100" cy="155" r="18" fill="url(#skinGrad)"/>
            <path d="M280,270 Q320,210 310,160" stroke="url(#blazerGrad)" stroke-width="38" stroke-linecap="round" fill="none"/>
            <circle cx="310" cy="155" r="18" fill="url(#skinGrad)"/>
          `,
          face: `${renderEyes('neutral')} ${renderBrows('neutral')} ${nose} ${mouth}`
        };

      case 'explaining':
      default:
        return {
          arms: `
            <path d="M130,270 Q90,320 120,380" stroke="url(#blazerGrad)" stroke-width="38" stroke-linecap="round" fill="none"/>
            <circle cx="120" cy="380" r="18" fill="url(#skinGrad)"/>
            <path d="M280,270 Q320,320 290,380" stroke="url(#blazerGrad)" stroke-width="38" stroke-linecap="round" fill="none"/>
            <circle cx="290" cy="380" r="18" fill="url(#skinGrad)"/>
          `,
          face: `${renderEyes('neutral')} ${renderBrows('neutral')} ${nose} ${mouth}`
        };
    }
  }
}

module.exports = {
  CharacterEngine,
  CHARACTER_PROFILE,
  ALLOWED_POSES
};
