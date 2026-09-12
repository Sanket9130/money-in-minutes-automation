'use strict';

/**
 * Character DNA Service
 *
 * Manages the multi-character library, Character DNA validation,
 * persistence, and photorealistic generation prompt synthesis.
 */

const fs = require('fs');
const path = require('path');
const { Logger } = require('./logger');

const DEFAULT_LIBRARY_PATH = path.join(__dirname, '..', 'data', 'characters', 'library.json');

const REQUIRED_FIELDS = [
  'character_id',
  'name',
  'ageRange',
  'genderPresentation',
  'physicalAppearance',
  'hairstyle',
  'clothing',
  'personality',
  'speakingStyle',
  'voiceProfile',
  'accent',
  'typicalExpressions',
  'typicalBodyLanguage',
  'preferredEnvironments',
  'visualStyle',
  'referenceImages',
  'topicsUsed',
  'consistencyMetadata'
];

class CharacterDNAService {
  constructor(options = {}) {
    this.logger = new Logger('CharacterDNAService');
    this.libraryPath = options.libraryPath || process.env.CHARACTER_LIBRARY_PATH || DEFAULT_LIBRARY_PATH;
    this.characters = new Map();
    this.loadLibrary();
  }

  /**
   * Loads characters from JSON disk storage, initializing with seeded archetypes if empty.
   */
  loadLibrary() {
    try {
      if (fs.existsSync(this.libraryPath)) {
        const raw = fs.readFileSync(this.libraryPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.characters)) {
          this.characters.clear();
          for (const char of parsed.characters) {
            if (this.validateCharacterDNA(char).isValid) {
              this.characters.set(char.character_id, char);
            }
          }
          this.logger.info(`Loaded ${this.characters.size} characters from library.`);
          return;
        }
      }
    } catch (err) {
      this.logger.warn(`Could not read character library from ${this.libraryPath}: ${err.message}. Initializing defaults.`);
    }

    // Initialize with seeded archetypes if file not found or corrupted
    const seeded = this.getSeededArchetypes();
    this.characters.clear();
    for (const char of seeded) {
      this.characters.set(char.character_id, char);
    }
    this.persistLibrary();
  }

  /**
   * Persists the current in-memory characters map to disk.
   */
  persistLibrary() {
    try {
      const dir = path.dirname(this.libraryPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        version: '1.0.0',
        updatedAt: new Date().toISOString(),
        characters: Array.from(this.characters.values())
      };
      fs.writeFileSync(this.libraryPath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (err) {
      this.logger.error(`Failed to persist character library: ${err.message}`);
      return false;
    }
  }

  /**
   * Validates a Character DNA object against required specifications.
   */
  validateCharacterDNA(profile) {
    if (!profile || typeof profile !== 'object') {
      return { isValid: false, errors: ['Character profile must be a non-null object'] };
    }

    const errors = [];
    for (const field of REQUIRED_FIELDS) {
      if (profile[field] === undefined || profile[field] === null || profile[field] === '') {
        errors.push(`Missing required field: '${field}'`);
      }
    }

    if (profile.voiceProfile && typeof profile.voiceProfile !== 'object') {
      errors.push("'voiceProfile' must be an object containing provider and voiceId");
    }

    if (profile.consistencyMetadata && typeof profile.consistencyMetadata !== 'object') {
      errors.push("'consistencyMetadata' must be an object containing seed tags and prompts");
    }

    if (!Array.isArray(profile.referenceImages) || profile.referenceImages.length === 0) {
      errors.push("'referenceImages' must be a non-empty array of file paths");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Retrieves a character profile by character_id.
   */
  getCharacter(characterId) {
    if (!characterId) return null;
    return this.characters.get(characterId) || null;
  }

  /**
   * Lists all available characters with optional filtering.
   */
  listCharacters(filter = {}) {
    let list = Array.from(this.characters.values());

    if (filter.gender) {
      list = list.filter(c => c.genderPresentation?.toLowerCase() === filter.gender.toLowerCase());
    }

    if (filter.tag) {
      const tagLower = filter.tag.toLowerCase();
      list = list.filter(c => {
        const tags = c.consistencyMetadata?.tags || [];
        return tags.some(t => t.toLowerCase() === tagLower);
      });
    }

    if (filter.topic) {
      const topicLower = filter.topic.toLowerCase();
      list = list.filter(c => {
        const topics = c.topicsUsed || [];
        return topics.some(t => t.toLowerCase().includes(topicLower));
      });
    }

    return list;
  }

  /**
   * Saves or updates a character profile.
   */
  saveCharacter(characterProfile) {
    const validation = this.validateCharacterDNA(characterProfile);
    if (!validation.isValid) {
      throw new Error(`Invalid Character DNA: ${validation.errors.join('; ')}`);
    }

    this.characters.set(characterProfile.character_id, characterProfile);
    this.persistLibrary();
    return characterProfile;
  }

  /**
   * Constructs an ultra-rich, consistent 9:16 vertical AI generation prompt.
   */
  buildPresenterPrompt(characterId, pose = 'explaining', emotion = 'confident', context = {}) {
    const character = this.getCharacter(characterId) || this.getCharacter('char_finance_alex') || this.getSeededArchetypes()[0];
    const topic = context.topic || 'business and financial insights';
    const env = context.environment || character.preferredEnvironments?.[0] || 'modern professional studio';

    const poseDescriptions = {
      explaining: 'gesturing naturally with both hands at chest level, relaxed confident posture, engaged in professional explanation',
      pointing_side: 'upper body angled slightly, gesturing with open hand toward a clear side space for graphic overlay',
      pointing_up: 'deliberate subtle gesture pointing upward with confident direct eye contact',
      surprised: 'eyes wide in genuine realization, slight head tilt back, expressive reaction to an unexpected fact',
      thoughtful: 'hand resting thoughtfully near chin, analytical reflective gaze contemplating data',
      direct_address: 'looking directly into camera lens with compelling authority and calm natural presence',
      neutral: 'composed welcoming stance, shoulders relaxed, attentive engaging expression'
    };

    const action = poseDescriptions[pose] || poseDescriptions.explaining;
    const seedTokens = character.consistencyMetadata?.seedPromptTokens || `${character.name}, ${character.physicalAppearance}, ${character.clothing}`;
    const negativeTokens = character.consistencyMetadata?.negativePrompt || 'cartoon, 3d render, illustration, anime, CGI, plastic skin, oversaturated';

    return {
      prompt: `Cinematic commercial medium close-up of ${character.name}, ${character.ageRange} presenter. ` +
        `Physical: ${character.physicalAppearance}. Hairstyle: ${character.hairstyle}. Wardrobe: ${character.clothing}. ` +
        `Action: ${action}, displaying a ${emotion} expression. ` +
        `Environment: ${env}, contextualized for "${topic}". ` +
        `Composition & Lighting: Vertical 9:16 aspect ratio, 50mm portrait lens, f/2.8 shallow depth of field, soft cinematic rim lighting, crisp studio key light. ` +
        `Style: Photorealistic 8k video frame, natural human skin texture with subtle pores, natural eye highlights, commercial broadcast quality.`,
      negativePrompt: negativeTokens,
      seedTokens,
      referenceImages: character.referenceImages || [],
      aspectRatio: '9:16',
      characterId: character.character_id,
      characterName: character.name
    };
  }

  /**
   * Returns the canonical 5 seeded character archetypes.
   */
  getSeededArchetypes() {
    return [
      {
        character_id: 'char_finance_alex',
        name: 'Alex',
        ageRange: '30-34',
        genderPresentation: 'Male',
        physicalAppearance: 'Clean-shaven American man with warm olive skin undertones, natural facial texture, subtle smile lines around the eyes, confident and approachable expression.',
        hairstyle: 'Short textured modern fade, dark chestnut brown hair neatly styled.',
        clothing: 'Tailored dark navy blazer over a fitted black crewneck shirt.',
        personality: 'Sharp, analytical, trustworthy, charismatic wealth and business educator who explains complex financial dynamics clearly.',
        speakingStyle: 'Measured and clear, articulate, dynamic emphasis on critical numbers, authoritative yet conversational.',
        voiceProfile: {
          provider: 'edge-tts',
          voiceId: 'en-US-GuyNeural',
          rate: '-1%',
          pitch: '-1Hz'
        },
        accent: 'General American',
        typicalExpressions: [
          'confident explanatory smile',
          'analytical brow raise',
          'direct engaging eye contact',
          'thoughtful focus'
        ],
        typicalBodyLanguage: [
          'controlled two-hand framing gestures',
          'relaxed shoulders',
          'subtle communicative head nods',
          'composed posture'
        ],
        preferredEnvironments: [
          'modern dark slate finance studio with subtle gold rim lighting',
          'clean financial boardroom with market data walls'
        ],
        visualStyle: 'Commercial 8k studio realism, 50mm portrait lens, f/2.8 shallow depth of field, high-end production lighting.',
        referenceImages: [
          'data/characters/avatars/char_finance_alex_master.png'
        ],
        topicsUsed: [
          'Costco Wholesale',
          'S&P 500 Index Funds',
          'Subscription Business Models',
          'Working Capital Management'
        ],
        consistencyMetadata: {
          tags: [
            'finance',
            'money',
            'wealth',
            'business',
            'investing',
            'banking',
            'revenue',
            'stocks',
            'economy',
            'capital',
            'profit',
            'costco',
            'wall_street'
          ],
          targetTones: [
            'analytical',
            'confident',
            'authoritative',
            'educational',
            'engaging'
          ],
          seedPromptTokens: 'photorealistic portrait of Alex, early 30s American man, clean modern haircut, natural skin texture, dark navy blazer over black shirt, studio lighting',
          negativePrompt: 'cartoon, 3d render, illustration, anime, CGI, airbrushed skin, oversaturated, deformed eyes, extra fingers'
        }
      },
      {
        character_id: 'char_tech_maya',
        name: 'Maya',
        ageRange: '28-32',
        genderPresentation: 'Female',
        physicalAppearance: 'Sharp modern tech educator, natural warm skin, subtle freckles across cheekbones, intelligent and enthusiastic gaze.',
        hairstyle: 'Sleek shoulder-length dark espresso bob with subtle curtain bangs.',
        clothing: 'Charcoal tailored tech overshirt over a minimalist slate grey top.',
        personality: 'Visionary, intellectually curious, precise, engaging technological innovator.',
        speakingStyle: 'Energetic, fast-paced yet crystal clear, making complex technical concepts intuitively graspable.',
        voiceProfile: {
          provider: 'edge-tts',
          voiceId: 'en-US-JennyNeural',
          rate: '+1%',
          pitch: '+0Hz'
        },
        accent: 'General American',
        typicalExpressions: [
          'enthusiastic discovery smile',
          'curious head tilt',
          'intense insightful focus',
          'knowing nod'
        ],
        typicalBodyLanguage: [
          'expressive hand gestures describing architectures',
          'poised posture',
          'forward lean for high-impact revelations'
        ],
        preferredEnvironments: [
          'sleek minimalist tech lab with soft neon accents',
          'clean glass modern server room',
          'contemporary innovation studio'
        ],
        visualStyle: 'Cinematic tech realism, cool tone palette with crisp edge lighting, 8k portrait clarity.',
        referenceImages: [
          'data/characters/avatars/char_tech_maya_master.png'
        ],
        topicsUsed: [
          'AI Chip Architectures',
          'Semiconductor Scaling',
          'Neural Networks',
          'Cloud Infrastructure'
        ],
        consistencyMetadata: {
          tags: [
            'ai',
            'tech',
            'technology',
            'chips',
            'semiconductors',
            'computing',
            'software',
            'robotics',
            'quantum',
            'data',
            'hardware',
            'nvidia',
            'microchips'
          ],
          targetTones: [
            'visionary',
            'energetic',
            'curious',
            'intellectual',
            'modern'
          ],
          seedPromptTokens: 'photorealistic portrait of Maya, early 30s tech presenter, sleek dark bob, charcoal overshirt, clean modern tech studio',
          negativePrompt: 'cartoon, 3d render, anime, cgi, doll face, exaggerated makeup, plastic skin'
        }
      },
      {
        character_id: 'char_auto_marcus',
        name: 'Marcus',
        ageRange: '33-37',
        genderPresentation: 'Male',
        physicalAppearance: 'Sturdy athletic build, warm brown skin, neatly groomed short beard, rugged yet polished commercial look.',
        hairstyle: 'Clean buzz fade, deep black hair.',
        clothing: 'Matte dark graphite bomber jacket over a dark heather grey t-shirt.',
        personality: 'Grounded, hands-on, direct, authoritative mechanical and manufacturing veteran.',
        speakingStyle: 'Deep, resonant, matter-of-fact, passionate about engineering feats and industrial mechanics.',
        voiceProfile: {
          provider: 'edge-tts',
          voiceId: 'en-US-ChristopherNeural',
          rate: '0%',
          pitch: '-2Hz'
        },
        accent: 'General American (Midwestern resonance)',
        typicalExpressions: [
          'confident knowing grin',
          'focused analytical appraisal',
          'skeptical brow furrow',
          'appreciative nod'
        ],
        typicalBodyLanguage: [
          'firm grounded posture',
          'direct single-point gestures',
          'broad shoulder alignment',
          'open chest stance'
        ],
        preferredEnvironments: [
          'modern architectural industrial loft',
          'clean high-tech automotive engineering bay',
          'sleek garage studio'
        ],
        visualStyle: 'High-contrast commercial realism, warm tungsten and slate lighting, detailed mechanical background bokeh.',
        referenceImages: [
          'data/characters/avatars/char_auto_marcus_master.png'
        ],
        topicsUsed: [
          'Vehicle Depreciation Curves',
          'Electric Vehicle Battery Supply Chains',
          'Supercar Engineering',
          'Assembly Line Economics'
        ],
        consistencyMetadata: {
          tags: [
            'automotive',
            'cars',
            'manufacturing',
            'engineering',
            'vehicles',
            'machinery',
            'aerospace',
            'industrial',
            'engines',
            'hardware',
            'depreciation',
            'electric_vehicles'
          ],
          targetTones: [
            'grounded',
            'direct',
            'authoritative',
            'passionate',
            'rugged'
          ],
          seedPromptTokens: 'photorealistic portrait of Marcus, mid 30s automotive presenter, clean buzz fade and neat beard, graphite bomber jacket, modern industrial studio',
          negativePrompt: 'cartoon, 3d render, cgi, plastic skin, oversaturated, deformed proportions'
        }
      },
      {
        character_id: 'char_brand_elena',
        name: 'Elena',
        ageRange: '29-33',
        genderPresentation: 'Female',
        physicalAppearance: 'Polished commercial storyteller, luminous olive skin, expressive warm hazel-brown eyes, genuine charisma.',
        hairstyle: 'Voluminous soft wavy brunette hair falling gently over shoulders.',
        clothing: 'Structured tailored camel blazer over a warm cream silk blouse.',
        personality: 'Perceptive, sophisticated, witty, consumer psychology and marketing insider.',
        speakingStyle: 'Compelling conversational cadence, intimate storytelling, dramatic pauses for retail psychological reveals.',
        voiceProfile: {
          provider: 'edge-tts',
          voiceId: 'en-US-AriaNeural',
          rate: '0%',
          pitch: '0Hz'
        },
        accent: 'General American',
        typicalExpressions: [
          'intrigued storytelling smile',
          'subtle conspiratorial eyebrow raise',
          'fascinated gaze',
          'warm authentic reaction'
        ],
        typicalBodyLanguage: [
          'expressive storytelling hands',
          'dynamic head turns',
          'graceful shoulder movement',
          'inviting stance'
        ],
        preferredEnvironments: [
          'warm boutique retail showroom studio',
          'elegant lifestyle design gallery',
          'luxury flagship store atmosphere'
        ],
        visualStyle: 'Warm golden hour commercial lighting, soft creamy bokeh, ultra-clean commercial fashion-grade clarity.',
        referenceImages: [
          'data/characters/avatars/char_brand_elena_master.png'
        ],
        topicsUsed: [
          'Luxury Brand Pricing Secrets',
          'Fast Fashion Supply Chains',
          'Packaging Psychology',
          'Supermarket Floor Layouts'
        ],
        consistencyMetadata: {
          tags: [
            'brands',
            'retail',
            'consumer',
            'marketing',
            'psychology',
            'fashion',
            'luxury',
            'advertising',
            'packaging',
            'stores',
            'shopping',
            'e-commerce'
          ],
          targetTones: [
            'perceptive',
            'witty',
            'intriguing',
            'storytelling',
            'sophisticated'
          ],
          seedPromptTokens: 'photorealistic portrait of Elena, early 30s brand strategy presenter, soft wavy brunette hair, tailored camel blazer, warm boutique studio',
          negativePrompt: 'cartoon, 3d render, anime, cgi, flat lighting, distorted facial features'
        }
      },
      {
        character_id: 'char_doc_david',
        name: 'David',
        ageRange: '36-40',
        genderPresentation: 'Male',
        physicalAppearance: 'Thoughtful seasoned investigator, light weathered skin with natural mature character lines, observant deep-set blue-grey eyes.',
        hairstyle: 'Short dark ash brown hair with subtle silver temples, classic natural side part.',
        clothing: 'Muted dark olive field overshirt over a charcoal crewneck sweater.',
        personality: 'Deeply empathetic, investigative, grounded, thoughtful macroeconomic and human story narrator.',
        speakingStyle: 'Rich, calm, intimate documentary tone, reflective pacing that builds suspense and emotional resonance.',
        voiceProfile: {
          provider: 'edge-tts',
          voiceId: 'en-US-BrianNeural',
          rate: '-2%',
          pitch: '-1Hz'
        },
        accent: 'General American (Standard Documentary)',
        typicalExpressions: [
          'reflective thoughtful gaze',
          'sympathetic warm smile',
          'intense investigative inquiry',
          'serious contemplation'
        ],
        typicalBodyLanguage: [
          'calm composed posture',
          'slow deliberate hand movements',
          'introspective pauses',
          'attentive eye contact'
        ],
        preferredEnvironments: [
          'cinematic documentary library with moody bookshelves',
          'slate-toned archival studio',
          'ambient architectural space with natural window light'
        ],
        visualStyle: 'Moody cinematic documentary style, anamorphic subtle lens flare, natural soft key lighting, 35mm grain texture.',
        referenceImages: [
          'data/characters/avatars/char_doc_david_master.png'
        ],
        topicsUsed: [
          'The Rise and Fall of Iconic Cities',
          'Unintended Economic Consequences',
          'Human Stories Behind Global Supply Chains',
          'The History of Modern Currency'
        ],
        consistencyMetadata: {
          tags: [
            'documentary',
            'history',
            'economics',
            'human_interest',
            'society',
            'global',
            'macroeconomics',
            'culture',
            'investigation',
            'biography',
            'story'
          ],
          targetTones: [
            'reflective',
            'empathetic',
            'investigative',
            'compelling',
            'thoughtful'
          ],
          seedPromptTokens: 'photorealistic portrait of David, late 30s documentary presenter, salt and pepper temples, dark olive overshirt, moody cinematic library studio',
          negativePrompt: 'cartoon, 3d render, illustration, anime, cgi, artificial skin, exaggerated features'
        }
      }
    ];
  }
}

module.exports = {
  CharacterDNAService,
  REQUIRED_FIELDS
};
