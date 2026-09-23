'use strict';

const { Logger } = require('./logger');
const { SemanticDedupService } = require('./semantic-dedup-service');
const { resolveTopicKey } = require('./curated-topic-content');

class ContentNoveltyGate {
  /**
   * @param {Object} [options={}]
   * @param {Logger} [options.logger]
   * @param {SemanticDedupService} [options.dedupService]
   * @param {number} [options.narrationSimilarityThreshold=0.40] Max allowed script/narration similarity (40%)
   * @param {number} [options.topicSimilarityThreshold=0.65] Max allowed topic hybrid similarity
   * @param {number} [options.maxSharedClaims=1] Max allowed identical claim metrics across different topics
   */
  constructor(options = {}) {
    this.logger = options.logger || new Logger('ContentNoveltyGate');
    this.dedupService = options.dedupService || new SemanticDedupService();
    this.narrationSimilarityThreshold = options.narrationSimilarityThreshold ?? 0.40;
    this.topicSimilarityThreshold = options.topicSimilarityThreshold ?? 0.65;
    this.maxSharedClaims = options.maxSharedClaims ?? 1;
  }

  /**
   * Normalizes topic string by stripping timestamps, brackets, and noise.
   * @param {string} topic
   * @returns {string}
   */
  normalizeTopic(topic = '') {
    return this.dedupService.normalizeTopic(topic);
  }

  /**
   * Resolves canonical topic family key for a topic string.
   * @param {string} topic
   * @returns {string|null}
   */
  resolveTopicFamily(topic = '') {
    const key = resolveTopicKey(topic);
    return key && key !== 'fallback' ? key : null;
  }

  /**
   * Extracts clean, presenter-independent narration text from beats array or string.
   * Strips presenter introductions, CTAs, and standard sign-offs so the core
   * argument is evaluated independently of presenter identity.
   * @param {Array<Object>|string} content
   * @returns {string}
   */
  extractCleanNarration(content) {
    let fullText = '';
    if (Array.isArray(content)) {
      fullText = content.map(b => b.text || '').join(' ');
    } else if (typeof content === 'string') {
      fullText = content;
    } else if (content && typeof content === 'object') {
      fullText = content.fullText || content.scriptText || content.narration || '';
    }

    return fullText
      .toLowerCase()
      // Strip presenter self-identification (e.g. "I'm David Chen", "I'm Elena Rostova")
      .replace(/\bi['’]m\s+[a-z\s]+(?:\.|,|from)/gi, '')
      .replace(/\bmy name is\s+[a-z\s]+/gi, '')
      // Strip standard channel CTAs
      .replace(/\b(?:follow|subscribe\s+to|check\s+out)\s+money\s+in\s+minutes\b/gi, '')
      .replace(/\bhit\s+(?:the\s+)?follow\b/gi, '')
      .replace(/\bdrop\s+a\s+comment\b/gi, '')
      // Normalize punctuation and whitespace
      .replace(/[^a-z0-9\s$%-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Computes presenter-independent similarity between two script narrations.
   * Uses a combination of token Jaccard, 3-gram overlap, and cosine frequency similarity.
   * @param {string} textA
   * @param {string} textB
   * @returns {{ similarity: number, jaccard: number, trigramOverlap: number, cosine: number }}
   */
  calculateNarrationSimilarity(textA, textB) {
    const cleanA = this.extractCleanNarration(textA);
    const cleanB = this.extractCleanNarration(textB);

    if (!cleanA || !cleanB) {
      return { similarity: 0, jaccard: 0, trigramOverlap: 0, cosine: 0 };
    }

    if (cleanA === cleanB) {
      return { similarity: 1.0, jaccard: 1.0, trigramOverlap: 1.0, cosine: 1.0 };
    }

    const tokensA = cleanA.split(/\s+/).filter(t => t.length > 2);
    const tokensB = cleanB.split(/\s+/).filter(t => t.length > 2);

    if (tokensA.length === 0 || tokensB.length === 0) {
      return { similarity: 0, jaccard: 0, trigramOverlap: 0, cosine: 0 };
    }

    // 1. Jaccard token similarity
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    let intersection = 0;
    for (const t of setA) {
      if (setB.has(t)) intersection++;
    }
    const union = new Set([...setA, ...setB]).size;
    const jaccard = union > 0 ? intersection / union : 0;

    // 2. 3-gram sequential phrase overlap
    const trigramsA = new Set();
    for (let i = 0; i <= tokensA.length - 3; i++) {
      trigramsA.add(`${tokensA[i]}_${tokensA[i + 1]}_${tokensA[i + 2]}`);
    }
    const trigramsB = new Set();
    for (let i = 0; i <= tokensB.length - 3; i++) {
      trigramsB.add(`${tokensB[i]}_${tokensB[i + 1]}_${tokensB[i + 2]}`);
    }

    let sharedTrigrams = 0;
    for (const tri of trigramsA) {
      if (trigramsB.has(tri)) sharedTrigrams++;
    }
    const trigramUnion = new Set([...trigramsA, ...trigramsB]).size;
    const trigramOverlap = trigramUnion > 0 ? sharedTrigrams / trigramUnion : 0;

    // 3. Frequency Cosine Similarity
    const freqA = new Map();
    for (const t of tokensA) freqA.set(t, (freqA.get(t) || 0) + 1);
    const freqB = new Map();
    for (const t of tokensB) freqB.set(t, (freqB.get(t) || 0) + 1);

    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const [t, c] of freqA.entries()) {
      normA += c * c;
      if (freqB.has(t)) dot += c * freqB.get(t);
    }
    for (const c of freqB.values()) normB += c * c;
    const cosine = (normA > 0 && normB > 0) ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;

    // Blended similarity: sensitive to both phrase ordering and lexical overlap
    const similarity = Number(
      Math.max(jaccard, trigramOverlap * 1.2, 0.5 * cosine + 0.5 * jaccard).toFixed(4)
    );

    return {
      similarity: Math.min(1.0, similarity),
      jaccard: Number(jaccard.toFixed(4)),
      trigramOverlap: Number(trigramOverlap.toFixed(4)),
      cosine: Number(cosine.toFixed(4))
    };
  }

  /**
   * Extracts normalized claim metric keys from claims array or report.
   * @param {Array<Object>|Object} claimsInput
   * @returns {Set<string>}
   */
  extractClaimsMetrics(claimsInput) {
    const metrics = new Set();
    let claims = [];

    if (Array.isArray(claimsInput)) {
      claims = claimsInput;
    } else if (claimsInput?.truthAnchorAudit?.claims) {
      claims = claimsInput.truthAnchorAudit.claims;
    } else if (claimsInput?.claims) {
      claims = claimsInput.claims;
    }

    for (const c of claims) {
      if (!c) continue;
      const raw = String(c.metric || c.displayValue || c.value || '').trim().toLowerCase();
      if (raw && raw !== 'null' && raw !== 'undefined') {
        // Normalize whitespace and common separators
        const norm = raw.replace(/\s+/g, '').replace(/\/year/g, '/yr').replace(/\/month/g, '/mo');
        metrics.add(norm);
      }
      if (c.verifiedData) {
        if (c.verifiedData.left?.value) {
          metrics.add(String(c.verifiedData.left.value).trim().toLowerCase().replace(/\s+/g, ''));
        }
        if (c.verifiedData.right?.value) {
          metrics.add(String(c.verifiedData.right.value).trim().toLowerCase().replace(/\s+/g, ''));
        }
      }
    }

    return metrics;
  }

  /**
   * Compares claim metric sets between candidate and historical item.
   * @param {Set<string>|Array<Object>} claimsA
   * @param {Set<string>|Array<Object>} claimsB
   * @returns {{ sharedCount: number, sharedMetrics: string[] }}
   */
  compareClaims(claimsA, claimsB) {
    const setA = claimsA instanceof Set ? claimsA : this.extractClaimsMetrics(claimsA);
    const setB = claimsB instanceof Set ? claimsB : this.extractClaimsMetrics(claimsB);

    const shared = [];
    for (const m of setA) {
      if (setB.has(m)) shared.push(m);
    }

    return {
      sharedCount: shared.length,
      sharedMetrics: shared
    };
  }

  /**
   * HARD CONTENT NOVELTY GATE
   * Evaluates candidate content against historical and same-cycle items across:
   * 1. Normalized topic string
   * 2. Topic family collision
   * 3. Presenter-independent script/narration similarity
   * 4. Claims & entities overlap
   * 5. Concept vector containment
   *
   * @param {Object} candidate
   * @param {string} candidate.topic
   * @param {string} [candidate.topicFamily]
   * @param {Array<Object>|string} [candidate.scriptText]
   * @param {Array<Object>} [candidate.claims]
   * @param {Array<Object>} [historicalItems=[]]
   * @param {Object} [options={}]
   * @returns {{ passed: boolean, reason?: string, details?: Object }}
   */
  verifyCandidateNovelty(candidate = {}, historicalItems = [], _options = {}) {
    if (!candidate.topic) {
      return { passed: false, reason: 'CANDIDATE_MISSING_TOPIC', details: {} };
    }

    const candidateTopic = candidate.topic;
    const candidateNorm = this.normalizeTopic(candidateTopic);
    const candidateFamily = candidate.topicFamily || this.resolveTopicFamily(candidateTopic);

    // If topic family cannot be resolved to a known verified family, reject immediately
    if (!candidateFamily) {
      return {
        passed: false,
        reason: 'UNVERIFIED_TOPIC_FAMILY',
        details: { topic: candidateTopic, error: 'Topic cannot be mapped to any verified topic family' }
      };
    }

    const candidateNarration = this.extractCleanNarration(candidate.scriptText || candidate.beats || '');
    const candidateClaims = this.extractClaimsMetrics(candidate.claims || candidate.verifiedData || []);

    for (const hist of historicalItems) {
      if (!hist) continue;
      const histTopic = hist.topic || hist.title || '';
      if (!histTopic) continue;

      const histNorm = this.normalizeTopic(histTopic);
      const histFamily = hist.topicFamily || this.resolveTopicFamily(histTopic);

      // Check 1: Normalized Topic Exact Match
      if (candidateNorm && histNorm && candidateNorm === histNorm) {
        return {
          passed: false,
          reason: 'NORMALIZED_TOPIC_EXACT_DUPLICATE',
          details: {
            candidateTopic,
            matchedTopic: histTopic,
            normalized: candidateNorm,
            productionId: hist.production_id || hist.productionId
          }
        };
      }

      // Check 2: Topic Hybrid Semantic Similarity
      const hybridSim = this.dedupService.calculateHybridSimilarity(candidateTopic, histTopic);
      if (hybridSim.score >= this.topicSimilarityThreshold) {
        return {
          passed: false,
          reason: 'TOPIC_SEMANTIC_DUPLICATE',
          details: {
            candidateTopic,
            matchedTopic: histTopic,
            score: hybridSim.score,
            threshold: this.topicSimilarityThreshold,
            productionId: hist.production_id || hist.productionId
          }
        };
      }

      // Check 3: Topic Family Collision (if historical item is active/scheduled/published)
      const isActiveStatus = ['READY_TO_PUBLISH', 'UPLOADING', 'SCHEDULED', 'PUBLISHED'].includes(hist.status);
      if (candidateFamily && histFamily && candidateFamily === histFamily && isActiveStatus) {
        return {
          passed: false,
          reason: 'TOPIC_FAMILY_COLLISION',
          details: {
            candidateFamily,
            matchedFamily: histFamily,
            status: hist.status,
            matchedTopic: histTopic,
            productionId: hist.production_id || hist.productionId
          }
        };
      }

      // Check 4: Presenter-Independent Script / Narration Similarity
      const histNarration = this.extractCleanNarration(
        hist.scriptSummary?.fullText || hist.scriptText || hist.narration || hist.script_text || ''
      );
      if (candidateNarration && histNarration) {
        const narrSim = this.calculateNarrationSimilarity(candidateNarration, histNarration);
        if (narrSim.similarity >= this.narrationSimilarityThreshold) {
          return {
            passed: false,
            reason: 'SCRIPT_NARRATION_DUPLICATE',
            details: {
              similarity: narrSim.similarity,
              threshold: this.narrationSimilarityThreshold,
              jaccard: narrSim.jaccard,
              trigramOverlap: narrSim.trigramOverlap,
              matchedTopic: histTopic,
              productionId: hist.production_id || hist.productionId
            }
          };
        }
      }

      // Check 5: Claims & Data Metrics Overlap
      const histClaims = this.extractClaimsMetrics(hist.claims || hist.truthAnchorAudit?.claims || []);
      if (candidateClaims.size > 0 && histClaims.size > 0) {
        const claimsOverlap = this.compareClaims(candidateClaims, histClaims);
        // If different topic families share 2 or more identical claims, reject
        if (candidateFamily !== histFamily && claimsOverlap.sharedCount >= this.maxSharedClaims) {
          return {
            passed: false,
            reason: 'CLAIMS_DATA_DUPLICATE',
            details: {
              sharedCount: claimsOverlap.sharedCount,
              sharedMetrics: claimsOverlap.sharedMetrics,
              candidateFamily,
              matchedFamily: histFamily,
              matchedTopic: histTopic,
              productionId: hist.production_id || hist.productionId
            }
          };
        }
      }

      // Check 6: Concept Vector Containment
      const profileCand = this.dedupService.extractSemanticProfile(candidateTopic);
      const profileHist = this.dedupService.extractSemanticProfile(histTopic);
      if (profileCand.concepts.size > 1 && profileHist.concepts.size > 1) {
        let sharedConcepts = 0;
        for (const c of profileCand.concepts) {
          if (profileHist.concepts.has(c)) sharedConcepts++;
        }
        if (sharedConcepts >= 2) {
          const containment = sharedConcepts / Math.min(profileCand.concepts.size, profileHist.concepts.size);
          if (containment >= 0.85 && profileCand.entities.size === 0) {
            return {
              passed: false,
              reason: 'CONCEPT_CONTAINMENT_EXCEEDED',
              details: {
                containment: Number(containment.toFixed(4)),
                matchedTopic: histTopic,
                productionId: hist.production_id || hist.productionId
              }
            };
          }
        }
      }
    }

    return { passed: true };
  }
}

module.exports = {
  ContentNoveltyGate
};
