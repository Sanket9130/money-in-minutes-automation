'use strict';

/**
 * Truth-Anchor Engine
 *
 * Provides automated extraction, classification, risk scoring,
 * freshness evaluation, and conflict detection for financial, numerical,
 * and business claims across video scripts.
 */

const crypto = require('crypto');

const CLAIM_CATEGORIES = {
  FINANCIAL: 'financial',
  NUMERICAL: 'numerical',
  BUSINESS: 'business',
  TECHNOLOGY: 'technology',
  GENERAL_FACTUAL: 'general_factual',
  OPINION_COMMENTARY: 'opinion_commentary'
};
Object.defineProperty(CLAIM_CATEGORIES, 'has', {
  value: val => Object.values(CLAIM_CATEGORIES).includes(val),
  enumerable: false
});

const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};
Object.defineProperty(RISK_LEVELS, 'has', {
  value: val => Object.values(RISK_LEVELS).includes(val),
  enumerable: false
});

const VERIFICATION_STATUSES = {
  VERIFIED: 'verified',
  PARTIALLY_VERIFIED: 'partially_verified',
  UNVERIFIED: 'unverified',
  CONFLICTING: 'conflicting',
  STALE: 'stale',
  WAIVED: 'waived'
};
Object.defineProperty(VERIFICATION_STATUSES, 'has', {
  value: val => Object.values(VERIFICATION_STATUSES).includes(val),
  enumerable: false
});

/**
 * Configurable freshness windows in days by category.
 */
const DEFAULT_FRESHNESS_POLICY = {
  realtime_market: 1,        // Stock/crypto prices, 24h market metrics: 1 day
  realtime_quote: 1,         // Alias for realtime quote
  financial: 105,            // Quarterly revenue, earnings, EPS: 105 days (~1 quarter + filing buffer)
  quarterly_financials: 105, // Alias for quarterly financials
  annual_financial: 375,     // Full-year revenue, annual valuation: 375 days
  numerical: 180,            // User counts, store counts, employee counts: 180 days
  business: 180,             // M&A, partnerships, leadership: 180 days
  technology: 365,           // Compute, benchmarks, parameters: 365 days
  general_factual: 3650,     // Historical dates, founders, invariant facts: 10 years
  opinion_commentary: Infinity
};

class TruthAnchorEngine {
  static get CATEGORIES() {
    return CLAIM_CATEGORIES;
  }

  static get RISK_LEVELS() {
    return RISK_LEVELS;
  }

  static get VERIFICATION_STATUSES() {
    return VERIFICATION_STATUSES;
  }

  static get DEFAULT_FRESHNESS_POLICY() {
    return DEFAULT_FRESHNESS_POLICY;
  }

  /**
   * Extracts factual and numerical claims from a script structure or raw text.
   *
   * @param {object|string} script - Full script object or text
   * @param {object} options - Extraction options
   * @returns {Array<object>} - Normalized claim objects
   */
  static extractClaims(script = {}, options = {}) {
    const rawSentences = this.gatherScriptSentences(script);
    const existingClaims = Array.isArray(script.claims) ? script.claims : [];
    const extracted = [];
    const seenTexts = new Set();

    // 1. Process explicit claims pre-declared in script
    for (const item of existingClaims) {
      const text = String(item.text || item.claim || '').trim();
      if (!text || seenTexts.has(text.toLowerCase())) continue;
      seenTexts.add(text.toLowerCase());

      const category = CLAIM_CATEGORIES.has(item.category)
        ? item.category
        : this.classifyClaim(text);
      const riskLevel = RISK_LEVELS.has(item.riskLevel)
        ? item.riskLevel
        : this.assignRiskLevel(category, text);
        const normalizedData = this.extractNumericData(text);
      const parsedValue = normalizedData && normalizedData.rawNumber !== null ? {
        numeric: normalizedData.rawNumber,
        unit: normalizedData.unit,
        metric: normalizedData.metric,
        type: normalizedData.unit === 'percent' ? 'percentage' : (normalizedData.unit === 'USD' ? 'currency' : 'count')
      } : null;

      extracted.push({
        id: item.id || `claim_${crypto.randomUUID()}`,
        text,
        category,
        riskLevel,
        normalizedData,
        parsedValue,
        sourceUrls: Array.isArray(item.sourceUrls) ? item.sourceUrls : [],
        sourceIds: Array.isArray(item.sourceIds) ? item.sourceIds : [],
        status: item.status || 'unverified',
        confidence: Number(item.confidence || 0.8),
        notes: item.notes || null
      });
    }

    // 2. Automated Regex / Rule-based extraction across all spoken sentences
    const factualPatterns = [
      /\$[\d,.]+[kKmMbBtT]?/i,
      /\b\d+(?:\.\d+)?\s*(?:billion|million|trillion|thousand|usd|eur|gbp)\s*(?:dollars)?\b/i,
      /\b\d+(?:\.\d+)?%\s*(?:increase|growth|drop|return|yield|margin|decline|loss|gain|fee|fees)?\b/i,
      /\b\d+(?:,\d+)*\s*(?:stores|users|subscribers|customers|employees|downloads|downloads|views|followers|branches)\b/i,
      /\b(?:revenue|profit|market cap|valuation|valuation of|debt|ebitda|funding|acquisition|priced at|valued at)\b/i,
      /\b\d+(?:\.\d+)?x\b|\b\d+\s*times\s*(?:more|less|higher|lower|growth)\b/i
    ];

    for (const sentence of rawSentences) {
      const clean = sentence.trim();
      if (clean.length < 15 || clean.length > 300) continue;
      if (seenTexts.has(clean.toLowerCase())) continue;

      const matchesFactual = factualPatterns.some(regex => regex.test(clean));
      if (!matchesFactual) continue;

      seenTexts.add(clean.toLowerCase());
      const category = this.classifyClaim(clean);
      const riskLevel = this.assignRiskLevel(category, clean);
      const normalizedData = this.extractNumericData(clean);
      const parsedValue = normalizedData && normalizedData.rawNumber !== null ? {
        numeric: normalizedData.rawNumber,
        unit: normalizedData.unit,
        metric: normalizedData.metric,
        type: normalizedData.unit === 'percent' ? 'percentage' : (normalizedData.unit === 'USD' ? 'currency' : 'count')
      } : null;

      extracted.push({
        id: `claim_${crypto.randomUUID()}`,
        text: clean,
        category,
        riskLevel,
        normalizedData,
        parsedValue,
        sourceUrls: [],
        sourceIds: [],
        status: category === 'opinion_commentary' ? 'verified' : 'unverified',
        confidence: 0.85,
        notes: null
      });
    }

    if (options.filterCategory && CLAIM_CATEGORIES.has(options.filterCategory)) {
      return extracted.filter(c => c.category === options.filterCategory);
    }

    return extracted;
  }

  /**
   * Classifies a claim into financial, numerical, business, technology, general_factual, or opinion.
   */
  static classifyClaim(text = '') {
    const lower = String(text || '').toLowerCase();

    // Check opinion signals first
    if (/\b(?:in my opinion|i believe|we think|could possibly|might be|seems to be|best way to|should consider|my favorite|i predict)\b/i.test(lower)) {
      return 'opinion_commentary';
    }

    // Financial keywords
    if (/\b(?:revenue|profit|market cap|valuation|stock|shares|nasdaq|nyse|ebitda|net income|dividend|p\/e|pricing|priced at|quarterly earnings|cash flow|debt|ipo|funding round|valuation of|\$[\d,.]+|\b\d+(?:\.\d+)?\s*(?:billion|million|trillion)\s*dollars?)\b/i.test(lower)) {
      return 'financial';
    }

    // Numerical scale/count metrics
    if (/\b\d+(?:,\d+)*\s*(?:stores|users|subscribers|customers|employees|downloads|branches|units|sales|daily active)\b/i.test(lower) ||
        /\b\d+(?:\.\d+)?%\b/i.test(lower)) {
      return 'numerical';
    }

    // Business operations
    if (/\b(?:acquired|acquisition|merger|lawsuit|ceo|founder|subsidiary|partnership|restructuring|market share|launched in)\b/i.test(lower)) {
      return 'business';
    }

    // Technology
    if (/\b(?:gpus?|h100|b200|tflops|latency|parameters?|benchmarks?|compute|cluster|tokens?\/s)\b/i.test(lower)) {
      return 'technology';
    }

    return 'general_factual';
  }

  /**
   * Assigns risk level (low, medium, high, critical) based on category and sensitive keywords.
   */
  static assignRiskLevel(category = 'general_factual', text = '') {
    const lower = String(text || '').toLowerCase();

    // Critical: market-moving predictions, investment advice, fraud/lawsuit accusations
    if (/\b(?:guaranteed return|guaranteed profit|stock will hit|buy before it|fraud|ponzi|bankrupt|invest now)\b/i.test(lower)) {
      return 'critical';
    }

    if (category === 'financial') {
      // High-dollar valuation or specific earnings numbers
      if (/\b(?:billion|trillion|market cap|revenue|profit|valuation)\b/i.test(lower)) {
        return 'high';
      }
      return 'medium';
    }

    if (category === 'numerical' || category === 'business') {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Extracts normalized numerical data (entity, metric, value, unit, period) where possible.
   */
  static extractNumericData(text = '') {
    const lower = String(text || '').toLowerCase();
    const result = {
      rawNumber: null,
      unit: null,
      metric: null,
      period: null
    };

    // Extract dollar/currency values: e.g. $96 billion, $500, 25%
    const dollarMatch = lower.match(/\$([\d,.]+)\s*(billion|million|trillion|thousand|k|m|b|t)?/i);
    if (dollarMatch) {
      let multiplier = 1;
      const scale = (dollarMatch[2] || '').toLowerCase();
      if (scale === 'billion' || scale === 'b') multiplier = 1e9;
      else if (scale === 'million' || scale === 'm') multiplier = 1e6;
      else if (scale === 'trillion' || scale === 't') multiplier = 1e12;
      else if (scale === 'thousand' || scale === 'k') multiplier = 1e3;

      const num = parseFloat(dollarMatch[1].replace(/,/g, ''));
      if (!Number.isNaN(num)) {
        result.rawNumber = num * multiplier;
        result.unit = 'USD';
      }
    }

    const percentMatch = lower.match(/(\d+(?:\.\d+)?)\s*%/);
    if (percentMatch && result.rawNumber === null) {
      result.rawNumber = parseFloat(percentMatch[1]);
      result.unit = 'percent';
    }

    const countMatch = lower.match(/\b([\d,]+)\s*(?:stores|users|subscribers|customers|employees|downloads|views|followers|branches)\b/);
    if (countMatch && result.rawNumber === null) {
      result.rawNumber = parseFloat(countMatch[1].replace(/,/g, ''));
      result.unit = 'count';
    }

    // Identify metric
    if (lower.includes('revenue')) result.metric = 'revenue';
    else if (lower.includes('market cap')) result.metric = 'market_cap';
    else if (lower.includes('profit') || lower.includes('net income')) result.metric = 'profit';
    else if (lower.includes('valuation')) result.metric = 'valuation';
    else if (lower.includes('growth')) result.metric = 'growth';
    else if (lower.includes('subscribers') || lower.includes('users')) result.metric = 'audience';
    else if (lower.includes('stores')) result.metric = 'stores';

    // Identify period (e.g. 2024, Q3 2024, Q2)
    const periodMatch = lower.match(/\b(q[1-4])\s*(\d{4})?\b|\b(20\d{2})\b/);
    if (periodMatch) {
      result.period = periodMatch[0].toUpperCase();
    }

    return result;
  }

  /**
   * Evaluates freshness of a claim given the source publication date and category.
   *
   * @param {string} category
   * @param {string|Date} sourceDate
   * @param {string|Date} referenceDate - Default: current time
   * @param {object} customPolicy - Optional custom freshness overrides
   * @returns {{ isStale: boolean, sourceAgeDays: number, maxAgeDays: number }}
   */
  static evaluateFreshness(category = 'financial', sourceDate, referenceDate = new Date(), customPolicy = {}) {
    const policy = { ...DEFAULT_FRESHNESS_POLICY, ...customPolicy };
    const maxAgeDays = policy[category] !== undefined ? policy[category] : policy.financial;

    if (!sourceDate) {
      // If source date is missing, conservative policy treats rapid financial data as stale
      const requiresStrictDate = ['realtime_market', 'financial'].includes(category);
      return {
        isStale: requiresStrictDate,
        sourceAgeDays: null,
        maxAgeDays
      };
    }

    const src = new Date(sourceDate).getTime();
    const ref = new Date(referenceDate).getTime();

    if (Number.isNaN(src) || Number.isNaN(ref)) {
      return { isStale: false, sourceAgeDays: null, maxAgeDays };
    }

    const diffDays = Math.max(0, (ref - src) / (1000 * 60 * 60 * 24));
    const isStale = diffDays > maxAgeDays;

    return {
      isStale,
      isFresh: !isStale,
      sourceAgeDays: Number(diffDays.toFixed(1)),
      maxAgeDays
    };
  }

  /**
   * Detects conflicts between multiple source evidence items for a given claim.
   *
   * @param {object} claim - Claim object with normalizedData
   * @param {Array<object>} evidenceList - Array of source evidence items
   * @param {number} tolerance - Allowed variance percentage (default 0.02 = 2%)
   * @returns {{ hasConflict: boolean, variance: number, conflictingSources: Array }}
   */
  static detectConflicts(_claim = {}, evidenceList = [], tolerance = 0.02) {
    if (!Array.isArray(evidenceList) || evidenceList.length < 2) {
      return { hasConflict: false, variance: 0, conflictingSources: [] };
    }

    const numericEvidence = evidenceList
      .map(item => ({
        url: item.url || item.sourceUrl,
        title: item.title || item.sourceTitle,
        value: Number(item.extractedValue ?? item.normalizedValue ?? item.value)
      }))
      .filter(item => Number.isFinite(item.value) && item.value > 0);

    if (numericEvidence.length < 2) {
      return { hasConflict: false, variance: 0, conflictingSources: [] };
    }

    let maxVariance = 0;
    let conflictPair = null;

    for (let i = 0; i < numericEvidence.length; i++) {
      for (let j = i + 1; j < numericEvidence.length; j++) {
        const v1 = numericEvidence[i].value;
        const v2 = numericEvidence[j].value;
        const variance = Math.abs(v1 - v2) / Math.max(v1, v2);

        if (variance > maxVariance) {
          maxVariance = variance;
          conflictPair = [numericEvidence[i], numericEvidence[j]];
        }
      }
    }

    const hasConflict = maxVariance > tolerance;

    return {
      hasConflict,
      variance: Number(maxVariance.toFixed(4)),
      conflictingSources: hasConflict ? (conflictPair || []) : []
    };
  }

  /**
   * Helper to check corroboration across multiple sources against a reference value.
   *
   * @param {number} referenceValue
   * @param {Array<object>} evidenceList
   * @param {number} tolerance
   * @returns {{ corroborated: boolean, hasConflict: boolean, variance: number, conflictingSources: Array }}
   */
  static checkCorroboration(referenceValue, evidenceList = [], tolerance = 0.02) {
    const conflict = this.detectConflicts({ normalizedData: { rawNumber: referenceValue } }, evidenceList, tolerance);
    return {
      corroborated: !conflict.hasConflict && evidenceList.length >= 2,
      hasConflict: conflict.hasConflict,
      variance: conflict.variance,
      conflictingSources: conflict.conflictingSources
    };
  }

  /**
   * Helper to collect all spoken text sentences from script components.
   */
  static gatherScriptSentences(script = {}) {
    if (typeof script === 'string') {
      return script.split(/(?<=[.!?])\s+/).filter(Boolean);
    }

    const parts = [];

    if (script.title) parts.push(script.title);
    if (script.hook?.text) parts.push(script.hook.text);
    if (script.hook && typeof script.hook === 'string') parts.push(script.hook);

    if (script.introduction) {
      if (script.introduction.greeting) parts.push(script.introduction.greeting);
      if (script.introduction.topicIntro) parts.push(script.introduction.topicIntro);
      if (script.introduction.valueProposition) parts.push(script.introduction.valueProposition);
    }

    if (script.mainContent?.sections && Array.isArray(script.mainContent.sections)) {
      script.mainContent.sections.forEach(sec => {
        if (sec.title) parts.push(sec.title);
        if (typeof sec.content === 'string') parts.push(sec.content);
        if (Array.isArray(sec.content)) parts.push(...sec.content);
        if (Array.isArray(sec.items)) {
          sec.items.forEach(it => parts.push(typeof it === 'string' ? it : `${it.title || ''} ${it.text || ''}`));
        }
        if (Array.isArray(sec.steps)) {
          sec.steps.forEach(st => parts.push(typeof st === 'string' ? st : `${st.title || ''} ${st.description || ''}`));
        }
      });
    }

    if (script.conclusion) {
      if (script.conclusion.finalThought) parts.push(script.conclusion.finalThought);
      if (Array.isArray(script.conclusion.recap)) parts.push(...script.conclusion.recap);
    }

    const fullText = parts.join(' ');
    return fullText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  }
}

module.exports = {
  TruthAnchorEngine,
  CLAIM_CATEGORIES,
  CLAIM_RISKS: RISK_LEVELS,
  RISK_LEVELS,
  VERIFICATION_STATUSES,
  DEFAULT_FRESHNESS_POLICY
};
