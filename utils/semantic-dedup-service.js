/**
 * Semantic Deduplication Service
 * 
 * Provides deterministic, zero-cost semantic and lexical topic deduplication
 * for YouTube content strategy and autonomous channel planning.
 * 
 * Detects semantically equivalent topics with varied phrasing (e.g.,
 * "Why Apple Ditched Intel" vs "The Reason Mac Switched to M-Series")
 * while reliably distinguishing genuinely distinct topics.
 */

const { Logger } = require('./logger');

// Domain-specific synonym and concept mappings for Finance, Tech, Business & YouTube Hooks
const CONCEPT_SYNONYM_MAP = {
  // Intent & Angle Concepts
  intent_reason: ['why', 'reason', 'reasons', 'cause', 'causes', 'behind', 'explanation', 'explained', 'truth', 'secret', 'secrets', 'story'],
  intent_how: ['how', 'guide', 'tutorial', 'steps', 'tactics', 'strategy', 'strategies', 'ways', 'method', 'methods', 'blueprint', 'roadmap'],
  intent_comparison: ['vs', 'versus', 'compare', 'comparison', 'against', 'difference', 'differences', 'better'],
  
  // Transition & Action Verbs
  action_switch: ['ditch', 'ditched', 'ditching', 'switch', 'switched', 'switching', 'abandon', 'abandoned', 'abandoning', 'drop', 'dropped', 'dropping', 'replace', 'replaced', 'replacing', 'migrate', 'migrated', 'leave', 'left', 'dump', 'dumped'],
  action_grow: ['explode', 'exploded', 'exploding', 'surge', 'surged', 'surging', 'skyrocket', 'boom', 'booming', 'grow', 'growth', 'scale', 'scaling'],
  action_fail: ['fail', 'failed', 'failing', 'failure', 'collapse', 'collapsed', 'crash', 'crashed', 'crashing', 'bankrupt', 'bankruptcy', 'die', 'died', 'dying'],
  action_create: ['build', 'built', 'building', 'create', 'created', 'creating', 'launch', 'launched', 'launching', 'start', 'started', 'starting'],
  
  // Financial Concepts
  finance_revenue: ['revenue', 'earnings', 'profit', 'profits', 'sales', 'monetize', 'monetization', 'income', 'cashflow', 'cash'],
  finance_investing: ['invest', 'invested', 'investing', 'investment', 'investor', 'investors', 'stock', 'stocks', 'shares', 'equity'],
  finance_saving: ['save', 'saved', 'saving', 'savings', 'frugal', 'budget', 'budgeting', 'economize', 'cut costs', 'cheap'],
  finance_wealth: ['billion', 'billions', 'million', 'millions', 'rich', 'wealth', 'wealthy', 'net worth', 'billionaire', 'millionaire'],
  
  // Tech & Industry Entities / Sub-domains
  tech_chips: ['chip', 'chips', 'silicon', 'semiconductor', 'semiconductors', 'processor', 'processors', 'cpu', 'gpu', 'intel', 'x86', 'm-series', 'apple silicon', 'm1', 'm2', 'm3', 'm4'],
  tech_ai: ['ai', 'artificial intelligence', 'machine learning', 'llm', 'deep learning', 'neural'],
  tech_datacenter: ['datacenter', 'datacenters', 'data center', 'data centers', 'cloud', 'server', 'servers'],
  
  // Key Brand & Platform Aliases
  entity_apple: ['apple', 'mac', 'macbook', 'imac', 'iphone', 'ipad', 'macos', 'ios'],
  entity_intel: ['intel', 'x86'],
  entity_apple_silicon: ['m-series', 'apple silicon', 'm1', 'm2', 'm3', 'm4'],
  entity_nvidia: ['nvidia', 'geforce', 'cuda', 'jensen'],
  entity_microsoft: ['microsoft', 'windows', 'azure'],
  entity_google: ['google', 'alphabet', 'youtube'],
  entity_tesla: ['tesla', 'musk', 'elon'],
  entity_amazon: ['amazon', 'aws', 'bezos'],
  entity_crypto: ['crypto', 'cryptocurrency', 'bitcoin', 'btc', 'ethereum', 'eth', 'blockchain'],
  
  // Workflow & Habits
  concept_habit: ['habit', 'habits', 'routine', 'routines', 'ritual', 'rituals', 'practice', 'practices', 'discipline'],
  concept_productivity: ['productivity', 'productive', 'focus', 'time management', 'efficiency', 'work faster'],
  concept_mistake: ['mistake', 'mistakes', 'error', 'errors', 'trap', 'traps', 'pitfall', 'pitfalls', 'blunder', 'avoid']
};

// Structural stop words to remove (keeps high-signal intent words)
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'as', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'that', 'this', 'these', 'those', 'it', 'its', 'you', 'your', 'my',
  'i', 'we', 'our', 'they', 'their', 'them', 'he', 'his', 'she', 'her', 'just', 'more',
  'than', 'so', 'can', 'will', 'would', 'should', 'could', 'about', 'into', 'over', 'after'
]);

// Build inverted concept lookup table for O(1) term -> concept mapping
const WORD_TO_CONCEPT_MAP = new Map();
for (const [conceptId, synonyms] of Object.entries(CONCEPT_SYNONYM_MAP)) {
  for (const syn of synonyms) {
    const key = syn.toLowerCase();
    if (!WORD_TO_CONCEPT_MAP.has(key)) {
      WORD_TO_CONCEPT_MAP.set(key, []);
    }
    WORD_TO_CONCEPT_MAP.get(key).push(conceptId);
  }
}

// Known entity concept groups for conflict detection
const ENTITY_GROUPS = [
  new Set(['entity_apple', 'entity_intel', 'entity_apple_silicon', 'entity_nvidia', 'entity_microsoft', 'entity_google', 'entity_tesla', 'entity_amazon', 'entity_crypto'])
];

class SemanticDedupService {
  /**
   * @param {Object} options
   * @param {number} [options.duplicateThreshold=0.65] - Hybrid similarity threshold to declare duplicate
   * @param {number} [options.strongDuplicateThreshold=0.80] - Threshold for near-identical topics
   * @param {number} [options.recentHistoryWindowDays=90] - Default lookback window in days
   * @param {number} [options.semanticWeight=0.70] - Weight given to semantic concept vector similarity
   * @param {number} [options.lexicalWeight=0.30] - Weight given to lexical token/character similarity
   */
  constructor(options = {}) {
    this.logger = new Logger('SemanticDedupService');
    this.duplicateThreshold = options.duplicateThreshold ?? 0.65;
    this.strongDuplicateThreshold = options.strongDuplicateThreshold ?? 0.80;
    this.recentHistoryWindowDays = options.recentHistoryWindowDays ?? 90;
    this.semanticWeight = options.semanticWeight ?? 0.70;
    this.lexicalWeight = options.lexicalWeight ?? 0.30;
  }

  /**
   * Normalizes a topic string by lowercasing, removing noise, hashtags, and punctuation.
   * 
   * @param {string} topic
   * @returns {string}
   */
  normalizeTopic(topic) {
    if (!topic || typeof topic !== 'string') return '';

    return topic
      .normalize('NFKC')
      .toLowerCase()
      // Remove hashtags (#Shorts, #finance, etc.)
      .replace(/#\w+/g, '')
      // Remove bracketed noise like [2024], (MUST WATCH), {Full Breakdown}
      .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, '')
      // Replace punctuation and symbols with space, preserving alphanumeric and hyphens in compound words
      .replace(/[^a-z0-9\s-]/g, ' ')
      // Normalize hyphens that aren't parts of words
      .replace(/\s+-\s+/g, ' ')
      // Collapse multiple whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Tokenizes text into meaningful content words, removing basic stop words.
   * 
   * @param {string} text
   * @returns {string[]}
   */
  tokenize(text) {
    const normalized = this.normalizeTopic(text);
    if (!normalized) return [];

    return normalized
      .split(/\s+/)
      .map(t => this._stemWord(t.trim()))
      .filter(t => t.length > 1 && !STOP_WORDS.has(t));
  }

  /**
   * Extremely lightweight deterministic English stemmer for common suffixes.
   * Handles plurals, past tense (-ed), gerunds (-ing), and adverbial (-ly).
   * 
   * @param {string} word
   * @returns {string}
   * @private
   */
  _stemWord(word) {
    if (word.length <= 3) return word;

    if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
    if (word.endsWith('es') && word.length > 3) return word.slice(0, -2);
    if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
    if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
    if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2);

    return word;
  }

  /**
   * Extracts canonical concept tokens and raw stemmed tokens for semantic modeling.
   * 
   * @param {string} topic
   * @returns {{ concepts: Set<string>, entities: Set<string>, vector: Map<string, number> }}
   */
  extractSemanticProfile(topic) {
    const tokens = this.tokenize(topic);
    const normalized = this.normalizeTopic(topic);
    const concepts = new Set();
    const entities = new Set();
    const vector = new Map();

    const addFeature = (feature, weight = 1.0) => {
      vector.set(feature, (vector.get(feature) || 0) + weight);
    };

    // 1. Check for multi-word concept phrases (e.g., 'm-series', 'apple silicon', 'data centers')
    for (const [conceptId, synonyms] of Object.entries(CONCEPT_SYNONYM_MAP)) {
      for (const syn of synonyms) {
        if (syn.includes(' ') || syn.includes('-')) {
          if (normalized.includes(syn)) {
            concepts.add(conceptId);
            addFeature(`concept:${conceptId}`, 2.5); // Multi-word concepts carry strong semantic weight
            if (this._isEntityConcept(conceptId)) entities.add(conceptId);
          }
        }
      }
    }

    // 2. Map individual tokens to concepts or add as raw lemma features
    for (const token of tokens) {
      const mappedConcepts = WORD_TO_CONCEPT_MAP.get(token);
      if (mappedConcepts && mappedConcepts.length > 0) {
        for (const conceptId of mappedConcepts) {
          concepts.add(conceptId);
          addFeature(`concept:${conceptId}`, 2.0);
          if (this._isEntityConcept(conceptId)) entities.add(conceptId);
        }
      } else {
        addFeature(`token:${token}`, 1.0);
      }
    }

    // 3. Add token bigrams for local word-order affinity
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]}_${tokens[i + 1]}`;
      addFeature(`bigram:${bigram}`, 0.5);
    }

    return { concepts, entities, vector };
  }

  /**
   * Checks if a concept ID represents a distinct named entity (e.g. brand/platform).
   * @private
   */
  _isEntityConcept(conceptId) {
    return ENTITY_GROUPS.some(group => group.has(conceptId));
  }

  /**
   * Calculates lexical similarity using a combination of Token Jaccard overlap
   * and character-level Sorensen-Dice coefficient.
   * 
   * @param {string} topicA
   * @param {string} topicB
   * @returns {number} Float between 0.0 and 1.0
   */
  calculateLexicalSimilarity(topicA, topicB) {
    const normA = this.normalizeTopic(topicA);
    const normB = this.normalizeTopic(topicB);

    if (!normA || !normB) return 0.0;
    if (normA === normB) return 1.0;

    // Token Jaccard similarity
    const tokensA = new Set(this.tokenize(topicA));
    const tokensB = new Set(this.tokenize(topicB));

    if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

    let intersectionCount = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) intersectionCount++;
    }

    const unionCount = new Set([...tokensA, ...tokensB]).size;
    const tokenJaccard = unionCount > 0 ? intersectionCount / unionCount : 0.0;

    // Sorensen-Dice character bigram similarity for typos & spelling variants
    const diceSim = this._sorensenDiceSimilarity(normA, normB);

    // Balanced lexical score: 60% Token Jaccard, 40% Character Dice
    return Number((0.6 * tokenJaccard + 0.4 * diceSim).toFixed(4));
  }

  /**
   * Calculates Sorensen-Dice coefficient over character bigrams.
   * @private
   */
  _sorensenDiceSimilarity(strA, strB) {
    if (strA.length < 2 || strB.length < 2) return strA === strB ? 1.0 : 0.0;

    const getBigrams = str => {
      const bigrams = new Map();
      for (let i = 0; i < str.length - 1; i++) {
        const bg = str.slice(i, i + 2);
        bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
      }
      return bigrams;
    };

    const bigramsA = getBigrams(strA);
    const bigramsB = getBigrams(strB);

    let intersection = 0;
    for (const [bg, countA] of bigramsA.entries()) {
      if (bigramsB.has(bg)) {
        intersection += Math.min(countA, bigramsB.get(bg));
      }
    }

    const totalBigrams = (strA.length - 1) + (strB.length - 1);
    return (2 * intersection) / totalBigrams;
  }

  /**
   * Calculates semantic similarity by evaluating concept-expanded TF-IDF vectors
   * with cosine distance, concept set containment, and entity invariance gating.
   * 
   * @param {string} topicA
   * @param {string} topicB
   * @returns {number} Float between 0.0 and 1.0
   */
  calculateSemanticSimilarity(topicA, topicB) {
    const normA = this.normalizeTopic(topicA);
    const normB = this.normalizeTopic(topicB);

    if (!normA || !normB) return 0.0;
    if (normA === normB) return 1.0;

    const profileA = this.extractSemanticProfile(topicA);
    const profileB = this.extractSemanticProfile(topicB);

    // Vector Cosine Similarity
    const vectorA = profileA.vector;
    const vectorB = profileB.vector;

    let dotProduct = 0.0;
    let normSqA = 0.0;
    let normSqB = 0.0;

    for (const val of vectorA.values()) normSqA += val * val;
    for (const val of vectorB.values()) normSqB += val * val;

    let cosine = 0.0;
    if (normSqA > 0 && normSqB > 0) {
      for (const [feature, valA] of vectorA.entries()) {
        if (vectorB.has(feature)) {
          dotProduct += valA * vectorB.get(feature);
        }
      }
      cosine = dotProduct / (Math.sqrt(normSqA) * Math.sqrt(normSqB));
    }

    // Concept set overlap & containment
    let conceptScore = 0.0;
    if (profileA.concepts.size > 0 && profileB.concepts.size > 0) {
      let sharedConcepts = 0;
      for (const c of profileA.concepts) {
        if (profileB.concepts.has(c)) sharedConcepts++;
      }
      const minConcepts = Math.min(profileA.concepts.size, profileB.concepts.size);
      const unionConcepts = new Set([...profileA.concepts, ...profileB.concepts]).size;
      const containment = minConcepts > 0 ? sharedConcepts / minConcepts : 0.0;
      const jaccard = unionConcepts > 0 ? sharedConcepts / unionConcepts : 0.0;
      conceptScore = 0.6 * containment + 0.4 * jaccard;
    }

    // Blend vector cosine and concept containment
    let semanticScore = 0.5 * cosine + 0.5 * conceptScore;

    // Entity Conflict Gating:
    // If both topics contain distinct named entities but share zero entities,
    // they are about fundamentally different subjects (e.g. Apple vs Nvidia).
    if (profileA.entities.size > 0 && profileB.entities.size > 0) {
      let sharedEntities = 0;
      for (const ent of profileA.entities) {
        if (profileB.entities.has(ent)) sharedEntities++;
      }

      if (sharedEntities === 0) {
        // Severe penalty for entity conflict
        semanticScore *= 0.10;
      }
    }

    return Number(Math.min(1.0, Math.max(0.0, semanticScore)).toFixed(4));
  }

  /**
   * Computes the final hybrid similarity score combining exact match,
   * semantic concept vector similarity, and lexical similarity.
   * 
   * @param {string} topicA
   * @param {string} topicB
   * @returns {{ score: number, lexicalScore: number, semanticScore: number, isExact: boolean }}
   */
  calculateHybridSimilarity(topicA, topicB) {
    const normA = this.normalizeTopic(topicA);
    const normB = this.normalizeTopic(topicB);

    if (!normA || !normB) {
      return { score: 0.0, lexicalScore: 0.0, semanticScore: 0.0, isExact: false };
    }

    if (normA === normB) {
      return { score: 1.0, lexicalScore: 1.0, semanticScore: 1.0, isExact: true };
    }

    const lexicalScore = this.calculateLexicalSimilarity(topicA, topicB);
    const semanticScore = this.calculateSemanticSimilarity(topicA, topicB);

    const hybridScore = Number(
      (this.semanticWeight * semanticScore + this.lexicalWeight * lexicalScore).toFixed(4)
    );

    // If semantic similarity is very strong (>= 0.70), elevate the final score
    // so differing lexical phrasing does not artificially mask semantic duplicates
    const finalScore = semanticScore >= 0.70
      ? Math.max(hybridScore, semanticScore)
      : hybridScore;

    return {
      score: Number(Math.min(1.0, finalScore).toFixed(4)),
      lexicalScore,
      semanticScore,
      isExact: false
    };
  }

  /**
   * Evaluates whether a candidate topic is a duplicate of any topic in existingTopics.
   * 
   * @param {string|Object} candidate - Topic string or object with topic/title property
   * @param {Array<string|Object>} existingTopics - List of historical or candidate topics
   * @param {Object} [options={}]
   * @param {number} [options.threshold] - Override default duplicateThreshold
   * @returns {{ isDuplicate: boolean, matchedTopic: string|null, score: number, similarityType: string, details: Object|null }}
   */
  isDuplicate(candidate, existingTopics = [], options = {}) {
    const candidateText = this._extractTopicText(candidate);
    if (!candidateText) {
      return { isDuplicate: false, matchedTopic: null, score: 0.0, similarityType: 'NONE', details: null };
    }

    const threshold = options.threshold ?? this.duplicateThreshold;
    let highestScore = 0.0;
    let bestMatch = null;
    let matchDetails = null;

    for (const existing of existingTopics) {
      const existingText = this._extractTopicText(existing);
      if (!existingText) continue;

      const sim = this.calculateHybridSimilarity(candidateText, existingText);
      if (sim.score > highestScore) {
        highestScore = sim.score;
        bestMatch = existingText;
        matchDetails = sim;
      }

      // Early exit on strong exact match
      if (sim.isExact || sim.score >= 0.98) {
        break;
      }
    }

    const isDup = highestScore >= threshold;
    let similarityType = 'NONE';
    if (isDup) {
      if (matchDetails?.isExact) similarityType = 'EXACT';
      else if (matchDetails?.semanticScore >= this.strongDuplicateThreshold) similarityType = 'SEMANTIC';
      else if (matchDetails?.lexicalScore >= this.strongDuplicateThreshold) similarityType = 'LEXICAL';
      else similarityType = 'HYBRID';
    }

    return {
      isDuplicate: isDup,
      matchedTopic: isDup ? bestMatch : null,
      score: highestScore,
      similarityType,
      details: matchDetails
    };
  }

  /**
   * Filters candidate topics against a history list and performs intra-batch deduplication.
   * 
   * Expected Complexity: O(C * H + C^2) where C is candidate count (~10-50) and H is history count (~50-100).
   * For YouTube automation workloads, this completes deterministically in < 15ms.
   * 
   * @param {Array<string|Object>} candidates - Candidate topics to filter
   * @param {Array<string|Object>} [history=[]] - Historical topics already published
   * @param {Object} [options={}]
   * @param {number} [options.threshold]
   * @param {number} [options.windowDays]
   * @returns {{ unique: Array, duplicates: Array, stats: { total: number, passed: number, rejected: number } }}
   */
  filterDuplicates(candidates = [], history = [], options = {}) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { unique: [], duplicates: [], stats: { total: 0, passed: 0, rejected: 0 } };
    }

    const threshold = options.threshold ?? this.duplicateThreshold;
    const windowDays = options.windowDays ?? this.recentHistoryWindowDays;

    // Filter historical topics by time window if date is present
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - windowDays);

    const relevantHistory = (Array.isArray(history) ? history : [])
      .filter(item => {
        if (!item) return false;
        const dateStr = item.publish_date || item.createdAt || item.created_at;
        if (!dateStr) return true; // If no date, include safely in history
        const d = new Date(dateStr);
        return isNaN(d.getTime()) || d >= cutoffDate;
      });

    const unique = [];
    const duplicates = [];
    const activeHistoryPool = [...relevantHistory];

    for (const candidate of candidates) {
      const candidateText = this._extractTopicText(candidate);
      if (!candidateText || candidateText.trim().length === 0) {
        duplicates.push({
          candidate,
          matchedAgainst: null,
          score: 0.0,
          reason: 'EMPTY_TOPIC'
        });
        continue;
      }

      const dupCheck = this.isDuplicate(candidateText, activeHistoryPool, { threshold });

      if (dupCheck.isDuplicate) {
        duplicates.push({
          candidate,
          matchedAgainst: dupCheck.matchedTopic,
          score: dupCheck.score,
          similarityType: dupCheck.similarityType,
          reason: `DUPLICATE_${dupCheck.similarityType}`
        });
      } else {
        unique.push(candidate);
        // Intra-batch deduplication: add accepted unique candidate to comparison pool
        activeHistoryPool.push(candidateText);
      }
    }

    return {
      unique,
      duplicates,
      stats: {
        total: candidates.length,
        passed: unique.length,
        rejected: duplicates.length
      }
    };
  }

  /**
   * Extracts clean topic string from string or object shape.
   * @private
   */
  _extractTopicText(item) {
    if (!item) return '';
    if (typeof item === 'string') return item.trim();
    if (typeof item === 'object') {
      return String(item.topic || item.title || '').trim();
    }
    return '';
  }
}

module.exports = {
  SemanticDedupService,
  CONCEPT_SYNONYM_MAP
};
