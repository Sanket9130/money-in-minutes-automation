'use strict';

/**
 * Character Selector
 *
 * Deterministic decision layer that intelligently selects the most suitable
 * presenter character from the Character Library based on topic, domain category,
 * emotional tone, and recency fatigue, or outputs a structured creation brief.
 */

const { Logger } = require('./logger');
const { CharacterDNAService } = require('./character-dna-service');

const REUSE_THRESHOLD = 0.75;

class CharacterSelector {
  constructor(options = {}) {
    this.logger = new Logger('CharacterSelector');
    this.dnaService = options.dnaService || new CharacterDNAService(options);
    this.reuseThreshold = options.reuseThreshold !== undefined ? Number(options.reuseThreshold) : REUSE_THRESHOLD;
  }

  /**
   * Main entry point to select or request character creation.
   *
   * @param {object} context
   * @param {string} context.topic - Topic title or headline
   * @param {string} [context.category] - High-level category (finance, tech, automotive, brands, documentary, etc.)
   * @param {object|string} [context.script] - Script text or structured script object
   * @param {string} [context.emotionalTone] - Target tone (analytical, visionary, grounded, witty, reflective, etc.)
   * @param {string} [context.targetAudience] - Target audience description
   * @param {Array<string>} [context.recentUsageHistory] - Array of recently used character IDs (most recent first)
   * @returns {object} { decision: 'REUSE'|'CREATE', character: object|null, reason: string, score: number, creationBrief: object|null, scoredCandidates: Array }
   */
  selectPresenter(context = {}) {
    const topic = String(context.topic || '').trim();
    const category = String(context.category || '').toLowerCase().trim();
    const emotionalTone = String(context.emotionalTone || '').toLowerCase().trim();
    const scriptText = this.extractTextFromScript(context.script);
    const recentHistory = Array.isArray(context.recentUsageHistory) ? context.recentUsageHistory : [];

    const characters = this.dnaService.listCharacters();
    if (characters.length === 0) {
      this.logger.warn('Character library is empty. Generating creation brief.');
      const creationBrief = this.buildCreationBrief(context);
      return {
        decision: 'CREATE',
        character: null,
        creationBrief,
        reason: 'Character library is empty; creation brief generated.',
        score: 0.0,
        scoredCandidates: []
      };
    }

    const scoredCandidates = characters.map(char => {
      const scoring = this.computeAffinity(char, {
        topic,
        category,
        scriptText,
        emotionalTone,
        recentHistory
      });

      return {
        characterId: char.character_id,
        name: char.name,
        character: char,
        score: scoring.totalScore,
        tagScore: scoring.tagScore,
        toneScore: scoring.toneScore,
        fatiguePenalty: scoring.fatiguePenalty,
        scoringDetails: scoring
      };
    });

    // Sort descending by total score
    scoredCandidates.sort((a, b) => b.score - a.score);
    const top = scoredCandidates[0];

    if (top && top.score >= this.reuseThreshold) {
      this.logger.info(`Selected existing presenter: "${top.name}" (${top.characterId}) with score ${top.score.toFixed(3)}`);
      return {
        decision: 'REUSE',
        character: top.character,
        creationBrief: null,
        reason: `Matched existing archetype "${top.name}" with affinity score ${top.score.toFixed(2)} (tag: ${top.tagScore.toFixed(2)}, tone: ${top.toneScore.toFixed(2)}, penalty: -${top.fatiguePenalty.toFixed(2)}).`,
        score: top.score,
        scoredCandidates
      };
    }

    this.logger.info(`No character met reuse threshold ${this.reuseThreshold} (Highest: "${top?.name || 'none'}" @ ${top?.score.toFixed(3) || 0}). Requesting CREATE.`);
    const creationBrief = this.buildCreationBrief(context, top);
    return {
      decision: 'CREATE',
      character: null,
      creationBrief,
      reason: `No existing character reached affinity threshold of ${this.reuseThreshold} (Top candidate "${top?.name || 'none'}" scored ${top?.score.toFixed(2) || 0}). Generated creation brief.`,
      score: top?.score || 0.0,
      scoredCandidates
    };
  }

  /**
   * Deterministic affinity scoring:
   * Tag match: 50%
   * Tone match: 30%
   * Recency / fatigue penalty: 20%
   */
  computeAffinity(character, context) {
    const { topic, category, scriptText, emotionalTone, recentHistory } = context;

    // 1. Tag & Topic Match (Weight: 50%)
    const characterTags = (character.consistencyMetadata?.tags || []).map(t => t.toLowerCase());
    const characterTopics = (character.topicsUsed || []).map(t => t.toLowerCase());

    const searchBlob = `${topic} ${category} ${scriptText}`.toLowerCase();
    const searchTokens = searchBlob.split(/[^a-z0-9_-]+/).filter(w => w.length > 2);

    let tagHits = 0;
    for (const tag of characterTags) {
      if (searchBlob.includes(tag)) {
        tagHits += 1.5; // Direct phrase substring match
      } else if (searchTokens.includes(tag)) {
        tagHits += 1.0;
      }
    }

    for (const pastTopic of characterTopics) {
      if (searchBlob.includes(pastTopic)) {
        tagHits += 2.0;
      }
    }

    // Direct category bonus
    if (category && characterTags.includes(category)) {
      tagHits += 2.0;
    }

    // Normalize tag score to [0.0, 1.0]
    const tagScore = Math.min(1.0, Math.max(0.0, tagHits / 3.0));

    // 2. Emotional Tone Match (Weight: 30%)
    const characterTones = (character.consistencyMetadata?.targetTones || []).map(t => t.toLowerCase());
    const characterPersonality = (character.personality || '').toLowerCase();

    let toneScore = 0.35; // baseline moderate affinity
    if (emotionalTone) {
      if (characterTones.includes(emotionalTone)) {
        toneScore = 1.0;
      } else if (characterPersonality.includes(emotionalTone)) {
        toneScore = 0.85;
      } else {
        const toneTokens = emotionalTone.split(/\s+/).filter(Boolean);
        const hasOverlap = toneTokens.some(tok => characterTones.some(ct => ct.includes(tok)));
        toneScore = hasOverlap ? 0.70 : 0.20;
      }
    } else {
      // Default to high neutral affinity when tone is not explicitly constrained
      toneScore = 0.80;
    }

    // 3. Recency / Fatigue Penalty (Weight: up to 20%)
    let fatiguePenalty = 0.0;
    const historyIndex = recentHistory.indexOf(character.character_id);
    if (historyIndex === 0) {
      // Used in the immediately preceding video
      fatiguePenalty = 0.20;
    } else if (historyIndex === 1) {
      // Used 2 videos ago
      fatiguePenalty = 0.10;
    } else if (historyIndex === 2) {
      // Used 3 videos ago
      fatiguePenalty = 0.05;
    }

    const totalScore = Number(Math.max(0.0, Math.min(1.0, (tagScore * 0.50) + (toneScore * 0.30) - fatiguePenalty)).toFixed(4));

    return {
      totalScore,
      tagScore,
      toneScore,
      fatiguePenalty,
      tagHits
    };
  }

  /**
   * Builds a structured Character Creation Brief for novel domains.
   */
  buildCreationBrief(context = {}, topCandidate = null) {
    const topic = context.topic || 'Specialized Topic';
    const category = context.category || 'Specialized Domain';
    const emotionalTone = context.emotionalTone || 'Educational and Engaging';

    return {
      suggestedName: `Presenter for ${category}`,
      domainCategory: category,
      topicTrigger: topic,
      targetTone: emotionalTone,
      recommendedArchetype: {
        role: `${category} Specialist`,
        ageRange: '28-36',
        personality: `Authoritative, approachable expert in ${category}`,
        suggestedWardrobe: `Contemporary professional attire tailored for ${category} context`,
        suggestedEnvironment: `Dedicated modern studio setting reflecting ${category} theme`,
        visualStyle: 'Photorealistic commercial broadcast quality, 8k portrait clarity, natural human skin texture'
      },
      reasonForCreation: topCandidate
        ? `Top existing candidate "${topCandidate.name}" scored ${topCandidate.score.toFixed(2)}, below required ${this.reuseThreshold} threshold.`
        : 'No existing candidates available in character library.'
    };
  }

  /**
   * Helper to normalize text from various script formats.
   */
  extractTextFromScript(script) {
    if (!script) return '';
    if (typeof script === 'string') return script;
    let text = '';
    if (script.title) text += ` ${script.title}`;
    if (script.hook?.text) text += ` ${script.hook.text}`;
    if (Array.isArray(script.mainContent?.sections)) {
      for (const sec of script.mainContent.sections) {
        text += ` ${sec.title || ''} ${sec.content || ''}`;
      }
    }
    return text.trim();
  }
}

module.exports = {
  CharacterSelector,
  REUSE_THRESHOLD
};
