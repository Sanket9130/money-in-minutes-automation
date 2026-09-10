'use strict';

/**
 * Semantic Concept Deduplication Service
 *
 * Prevents channel content fatigue by detecting identical and semantically
 * similar topics before video generation begins. Uses multi-tier deterministic
 * normalization (token Jaccard, character n-grams, Levenshtein ratio, and keyword
 * weighting) with zero mandatory external or paid API requirements.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'from',
  'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'to', 'of', 'up', 'down', 'in', 'out', 'on',
  'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'all',
  'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will',
  'just', 'don', 'should', 'now', 'is', 'am', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'i', 'me',
  'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself',
  'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it',
  'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which',
  'who', 'whom', 'this', 'that', 'these', 'those'
]);

const FILLER_PHRASES = [
  /\bhow\s+to\b/gi,
  /\bwhy\s+you\s+(?:should|must|need\s+to)\b/gi,
  /\bwhat\s+nobody\s+is\s+telling\s+you\b/gi,
  /\bthe\s+ultimate\s+guide\s+to\b/gi,
  /\bthe\s+hidden\s+truth\s+about\b/gi,
  /\bsecrets?\s+(?:of|to|revealed)\b/gi,
  /\bexplained\s+in\s+\d+\s+minutes?\b/gi,
  /\bfor\s+beginners\b/gi,
  /\bstep\s+by\s+step\b/gi,
  /\bexpert\s+tips\s+for\b/gi,
  /\bpractical\s+ways\s+to\b/gi,
  /\bsimple\s+habits\s+that\b/gi,
  /\b\d+\s+(?:ways|tips|tricks|secrets|rules|habits|steps|mistakes)\s+to\b/gi,
  /\bin\s+20\d\d\b/gi,
  /\bevery\s+month\b/gi,
  /\bwithout\s+(?:finding\s+)?extra\s+time\b/gi
];

const SUFFIX_STEMS = [
  { match: /ies$/i, replace: 'y' },
  { match: /ing$/i, replace: '' },
  { match: /ed$/i, replace: '' },
  { match: /ly$/i, replace: '' },
  { match: /es$/i, replace: '' },
  { match: /s$/i, replace: '' }
];

class SemanticDedupService {
  constructor(options = {}) {
    this.duplicateThreshold = options.duplicateThreshold ?? 0.72;
    this.similarThreshold = options.similarThreshold ?? 0.45;
    this.embeddingProvider = options.embeddingProvider || null;
  }

  /**
   * Normalizes a topic string into core semantic tokens and clean canonical text.
   *
   * @param {string} text - Raw topic title
   * @returns {{ canonical: string, tokens: Array<string>, tokenSet: Set<string>, ngrams: Set<string> }}
   */
  normalizeConcept(text = '') {
    if (!text || typeof text !== 'string') {
      return { canonical: '', tokens: [], tokenSet: new Set(), ngrams: new Set() };
    }

    let cleaned = text.toLowerCase();

    // Strip common clickbait/template filler phrases
    for (const pattern of FILLER_PHRASES) {
      cleaned = cleaned.replace(pattern, ' ');
    }

    // Strip punctuation and normalize whitespace
    cleaned = cleaned.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Tokenize and filter stop words
    const rawTokens = cleaned.split(' ').filter(w => w.length > 1 && !STOP_WORDS.has(w));

    // Stem tokens to base concepts (investing -> invest, savings -> save)
    const stemmedTokens = rawTokens.map(word => {
      let stemmed = word;
      for (const { match, replace } of SUFFIX_STEMS) {
        if (match.test(stemmed) && stemmed.length > 4) {
          stemmed = stemmed.replace(match, replace);
          break;
        }
      }
      return stemmed;
    });

    const uniqueTokens = Array.from(new Set(stemmedTokens)).sort();
    const canonical = uniqueTokens.join(' ');

    // Generate character 3-grams for fuzzy n-gram comparison
    const ngrams = new Set();
    const compact = cleaned.replace(/\s+/g, '');
    for (let i = 0; i <= compact.length - 3; i++) {
      ngrams.add(compact.slice(i, i + 3));
    }

    return {
      canonical,
      tokens: uniqueTokens,
      tokenSet: new Set(uniqueTokens),
      ngrams
    };
  }

  /**
   * Computes Jaccard similarity between two Sets.
   */
  static jaccard(setA, setB) {
    if (!setA.size && !setB.size) return 1.0;
    if (!setA.size || !setB.size) return 0.0;
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0.0;
  }

  /**
   * Computes Levenshtein distance ratio between two strings (0.0 to 1.0).
   */
  static levenshteinRatio(s1 = '', s2 = '') {
    if (s1 === s2) return 1.0;
    if (!s1.length || !s2.length) return 0.0;

    const len1 = s1.length;
    const len2 = s2.length;
    const dp = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) dp[i][0] = i;
    for (let j = 0; j <= len2; j++) dp[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }

    const distance = dp[len1][len2];
    const maxLen = Math.max(len1, len2);
    return maxLen > 0 ? Math.max(0, 1 - distance / maxLen) : 1.0;
  }

  /**
   * Calculates multi-tier similarity between two topics.
   *
   * @param {string} topicA
   * @param {string} topicB
   * @returns {{ similarity: number, tokenJaccard: number, ngramJaccard: number, editRatio: number }}
   */
  calculateSimilarity(topicA = '', topicB = '') {
    const normA = this.normalizeConcept(topicA);
    const normB = this.normalizeConcept(topicB);

    let similarity = 0;
    let tokenJaccard = 0;
    let ngramJaccard = 0;
    let editRatio = 0;

    if (normA.canonical && normA.canonical === normB.canonical) {
      similarity = 1.0;
      tokenJaccard = 1.0;
      ngramJaccard = 1.0;
      editRatio = 1.0;
    } else {
      tokenJaccard = SemanticDedupService.jaccard(normA.tokenSet, normB.tokenSet);
      ngramJaccard = SemanticDedupService.jaccard(normA.ngrams, normB.ngrams);
      editRatio = SemanticDedupService.levenshteinRatio(normA.canonical, normB.canonical);
      similarity = Number((0.50 * tokenJaccard + 0.25 * ngramJaccard + 0.25 * editRatio).toFixed(4));
    }

    let status = 'new';
    let verdict = 'accepted';
    if (similarity >= this.duplicateThreshold) {
      status = 'duplicate';
      verdict = 'rejected';
    } else if (similarity >= this.similarThreshold) {
      status = 'similar';
      verdict = 'similar';
    }

    return {
      similarity,
      tokenJaccard: Number(tokenJaccard.toFixed(4)),
      ngramJaccard: Number(ngramJaccard.toFixed(4)),
      editRatio: Number(editRatio.toFixed(4)),
      status,
      verdict
    };
  }

  /**
   * Evaluates a candidate topic against historical topics.
   *
   * @param {string} candidateTopic
   * @param {Array<string|object>} history - Historical topic strings or records
   * @param {object} options - Overrides for thresholds
   * @returns {{ status: string, verdict: string, similarity: number, matchedTopic: string|null, reason: string }}
   */
  checkDeduplication(candidateTopic = '', history = [], options = {}) {
    const dupThreshold = options.duplicateThreshold ?? this.duplicateThreshold;
    const simThreshold = options.similarThreshold ?? this.similarThreshold;

    if (!candidateTopic || typeof candidateTopic !== 'string' || !candidateTopic.trim()) {
      return {
        status: 'rejected',
        verdict: 'rejected',
        similarity: 0,
        matchedTopic: null,
        reason: 'Empty or invalid topic string'
      };
    }

    let highestSimilarity = 0;
    let closestMatch = null;
    let matchBreakdown = null;

    for (const item of history) {
      const pastTopic = typeof item === 'string' ? item : (item.topic || item.title || '');
      if (!pastTopic || !pastTopic.trim()) continue;

      const sim = this.calculateSimilarity(candidateTopic, pastTopic);
      if (sim.similarity > highestSimilarity) {
        highestSimilarity = sim.similarity;
        closestMatch = pastTopic;
        matchBreakdown = sim;
      }
    }

    let status = 'new';
    let verdict = 'accepted';
    let reason = 'Unique topic with low concept overlap';

    if (highestSimilarity >= dupThreshold) {
      status = 'duplicate';
      verdict = 'rejected';
      reason = `Rejected as duplicate: ${(highestSimilarity * 100).toFixed(0)}% semantic overlap with "${closestMatch}"`;
    } else if (highestSimilarity >= simThreshold) {
      status = 'similar';
      verdict = options.rejectSimilar ? 'rejected' : 'similar';
      reason = `Topic is similar (${(highestSimilarity * 100).toFixed(0)}% overlap) to "${closestMatch}"`;
    }

    return {
      status,
      verdict,
      similarity: highestSimilarity,
      matchedTopic: closestMatch,
      reason,
      breakdown: matchBreakdown
    };
  }

  /**
   * Filters a list of candidate topics, returning only those that pass deduplication.
   *
   * @param {Array<object|string>} candidates
   * @param {Array<string|object>} history
   * @param {object} options
   * @returns {Array<object>} Filtered candidates with dedup analysis
   */
  filterUniqueCandidates(candidates = [], history = [], options = {}) {
    const accepted = [];
    const runningHistory = [...history];

    for (const candidate of candidates) {
      const topicText = typeof candidate === 'string' ? candidate : (candidate.topic || candidate.title || '');
      const dedupResult = this.checkDeduplication(topicText, runningHistory, options);

      if (dedupResult.verdict === 'accepted' || (dedupResult.verdict === 'similar' && !options.rejectSimilar)) {
        accepted.push({
          ...(typeof candidate === 'object' ? candidate : { topic: candidate }),
          dedup: dedupResult
        });
        runningHistory.push(topicText);
      }
    }

    return accepted;
  }
}

const ConceptNormalizer = {
  normalize(text) {
    return new SemanticDedupService().normalizeConcept(text);
  }
};

module.exports = {
  SemanticDedupService,
  ConceptNormalizer,
  STOP_WORDS,
  FILLER_PHRASES
};
