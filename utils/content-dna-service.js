'use strict';

/**
 * Content DNA & Performance Learning Service
 *
 * Extracts, records, and aggregates structural and creative traits of published Shorts.
 * Connects Content DNA with empirical YouTube Analytics to discover statistically
 * supported patterns while strictly preventing overfitting through sample-size guardrails.
 */

const { Logger } = require('./logger');

const NEUTRAL_DEFAULTS = {
  hookVariant: 'warning-alert',
  hookDuration: 1.8,
  scriptStructure: 'list',
  videoDurationBucket: '30_45s',
  captionStyle: 'karaoke_highlight',
  visualStyle: 'motion_slideshow',
  sceneCount: '4-6',
  narrationProvider: 'gemini',
  ctaStyle: 'subscribe',
  publishingDay: 'Wednesday',
  publishingHour: 14,
  confidence: 'neutral_default',
  sampleSize: 0,
  evidenceNotes: 'Neutral default traits applied; insufficient empirical data points (<3) to establish statistical preference'
};

class ContentDNAService {
  constructor(db, options = {}) {
    this.db = db;
    this.logger = new Logger('ContentDNA');
    this.minSampleSize = options.minSampleSize ?? 3;
  }

  /**
   * Extracts a structured Content DNA profile from a production bundle or draft.
   *
   * @param {object} production - Production data bundle
   * @param {object} options - Extraction context overrides
   * @returns {object} Canonical Content DNA profile
   */
  extractDNA(production = {}, options = {}) {
    const strategy = production.strategy || options.strategy || {};
    const script = production.script || options.script || {};
    const hookConfig = options.hookConfig || production.hookConfig || {};
    const assets = production.assets || {};

    // 1. Topic & Category
    const topic = strategy.topic || script.title || 'Unknown Topic';
    const topicCategory = options.topicCategory || strategy.category || this.inferCategory(topic);

    // 2. Hook Traits
    const hookVariant = hookConfig.variant || this.inferHookVariant(script.hook?.text || script.hook || '');
    const hookDuration = Number(hookConfig.duration || options.hookDuration || 1.8);

    // 3. Script Structure & Length
    const scriptStructure = this.inferStructure(script, strategy);
    const durationSeconds = Number(production.estimatedDuration || script.durationSeconds || options.durationSeconds || 35);
    const videoDurationBucket = durationSeconds < 30 ? 'under_30s' : (durationSeconds <= 45 ? '30_45s' : '45_60s');

    // 4. Visual & Audio Traits
    const captionStyle = options.captionStyle || (production.contentType === 'short' || options.isShort ? 'karaoke_highlight' : 'standard_subtitle');
    const visualStyle = options.visualStyle || 'motion_slideshow';
    const rawSceneCount = Array.isArray(production.scenes) ? production.scenes.length : (Array.isArray(script.mainContent?.sections) ? script.mainContent.sections.length : 4);
    const sceneCount = rawSceneCount <= 3 ? '1-3' : (rawSceneCount <= 6 ? '4-6' : '7+');

    const narrationProvider = assets.audio?.provider || options.narrationProvider || 'gemini';
    const ctaStyle = this.inferCTAStyle(script.callToAction || script.conclusion?.cta || '');

    // 5. Scheduling / Publishing Window
    const publishTimeStr = production.scheduledPublishTime || production.publishTime || options.publishTime || new Date().toISOString();
    const publishDate = new Date(publishTimeStr);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const publishingDay = days[publishDate.getUTCDay()] || 'Wednesday';
    const publishingHour = publishDate.getUTCHours();

    return {
      productionId: production.id || options.productionId || `prod_dna_${Date.now()}`,
      videoId: production.youtubeId || options.videoId || null,
      contentType: 'short',
      traits: {
        topicCategory,
        hookVariant,
        hookDuration,
        scriptStructure,
        videoDurationBucket,
        captionStyle,
        visualStyle,
        sceneCount,
        narrationProvider,
        ctaStyle,
        publishingDay,
        publishingHour
      },
      metadata: {
        topic,
        extractedAt: new Date().toISOString(),
        version: '1.0'
      }
    };
  }

  /**
   * Connects a Content DNA record to performance metrics.
   */
  linkDNAToPerformance(dnaRecord = {}, performanceMetrics = {}) {
    const direct = performanceMetrics.direct || performanceMetrics.directMetrics || performanceMetrics;
    const derived = performanceMetrics.derived || performanceMetrics.derivedMetrics || {};

    return {
      productionId: dnaRecord.productionId,
      videoId: dnaRecord.videoId || performanceMetrics.videoId,
      traits: dnaRecord.traits || {},
      performance: {
        views: direct.views || 0,
        retention: direct.averageViewPercentage ?? derived.retentionScore ?? 0,
        likeRate: derived.likeRate ?? (direct.views > 0 ? ((direct.likes || 0) / direct.views) * 100 : 0),
        performanceScore: derived.performanceScore ?? performanceMetrics.performanceScore ?? 50
      },
      measuredAt: performanceMetrics.capturedAt || new Date().toISOString()
    };
  }

  /**
   * Aggregates empirical performance across Content DNA traits.
   * Enforces sample-size guardrails to prevent premature conclusions from tiny sample sizes.
   *
   * @param {Array<object>} linkedRecords - Array of linked DNA+Performance objects
   * @param {number} minSampleSize - Threshold to qualify for statistical recommendation
   * @returns {object} Aggregated trait performance with sample counts and confidence
   */
  aggregatePerformanceByTrait(linkedRecords = [], minSampleSize = this.minSampleSize) {
    if (!Array.isArray(linkedRecords) || linkedRecords.length === 0) {
      return { totalVideos: 0, traits: {}, qualifiedTraits: {} };
    }

    const traitNames = [
      'topicCategory',
      'hookVariant',
      'scriptStructure',
      'videoDurationBucket',
      'captionStyle',
      'visualStyle',
      'sceneCount',
      'ctaStyle',
      'publishingDay'
    ];

    const traitMap = {};
    for (const name of traitNames) traitMap[name] = {};

    for (const record of linkedRecords) {
      const traits = record.traits || {};
      const perf = record.performance || {};
      const score = Number(perf.performanceScore || 50);
      const retention = Number(perf.retention || 0);
      const views = Number(perf.views || 0);

      for (const [key, val] of Object.entries(traits)) {
        if (!traitMap[key] || val === undefined || val === null) continue;
        const valKey = String(val);
        if (!traitMap[key][valKey]) {
          traitMap[key][valKey] = {
            sampleCount: 0,
            totalScore: 0,
            totalRetention: 0,
            totalViews: 0
          };
        }
        const bucket = traitMap[key][valKey];
        bucket.sampleCount++;
        bucket.totalScore += score;
        bucket.totalRetention += retention;
        bucket.totalViews += views;
      }
    }

    // Compute averages, sample adequacy, and statistical confidence
    const traits = {};
    const qualifiedTraits = {};

    for (const [traitKey, valueBuckets] of Object.entries(traitMap)) {
      traits[traitKey] = {};
      for (const [valKey, bucket] of Object.entries(valueBuckets)) {
        const count = bucket.sampleCount;
        const avgScore = Number((bucket.totalScore / count).toFixed(1));
        const avgRetention = Number((bucket.totalRetention / count).toFixed(1));
        const avgViews = Math.round(bucket.totalViews / count);

        // Guardrail: Sample size protection
        let confidence = 'insufficient_sample';
        if (count >= 5) confidence = 'high';
        else if (count >= minSampleSize) confidence = 'medium';

        const traitStats = {
          value: valKey,
          sampleCount: count,
          avgPerformanceScore: avgScore,
          avgRetention,
          avgViews,
          confidence,
          isSupported: count >= minSampleSize
        };

        traits[traitKey][valKey] = traitStats;

        if (traitStats.isSupported) {
          if (!qualifiedTraits[traitKey]) qualifiedTraits[traitKey] = [];
          qualifiedTraits[traitKey].push(traitStats);
        }
      }

      if (qualifiedTraits[traitKey]) {
        // Sort descending by average performance score
        qualifiedTraits[traitKey].sort((a, b) => b.avgPerformanceScore - a.avgPerformanceScore);
      }
    }

    return {
      totalVideos: linkedRecords.length,
      traits,
      qualifiedTraits
    };
  }

  /**
   * Recommends optimal Content DNA traits for upcoming Shorts production.
   * If empirical data does not meet sample size thresholds, safely returns neutral defaults.
   *
   * @param {object} aggregatedInsights - Result from aggregatePerformanceByTrait
   * @param {object} options - Channel preferences or fixed options
   * @returns {object} Recommended traits with clear confidence provenance
   */
  recommendOptimalDNA(aggregatedInsights = {}, options = {}) {
    const qualified = aggregatedInsights.qualifiedTraits || {};
    const totalVideos = aggregatedInsights.totalVideos || 0;

    if (totalVideos < this.minSampleSize || Object.keys(qualified).length === 0) {
      return {
        ...NEUTRAL_DEFAULTS,
        ...options,
        evidenceNotes: `Insufficient empirical Shorts data (${totalVideos}/${this.minSampleSize} required). Neutral baseline defaults applied.`
      };
    }

    const pickBest = (traitKey, fallback) => {
      const candidates = qualified[traitKey];
      if (candidates && candidates.length > 0 && candidates[0].isSupported) {
        return {
          value: candidates[0].value,
          confidence: candidates[0].confidence,
          sampleCount: candidates[0].sampleCount,
          avgScore: candidates[0].avgPerformanceScore
        };
      }
      return {
        value: fallback,
        confidence: 'neutral_default',
        sampleCount: 0,
        avgScore: null
      };
    };

    const hookVariantPick = pickBest('hookVariant', NEUTRAL_DEFAULTS.hookVariant);
    const structurePick = pickBest('scriptStructure', NEUTRAL_DEFAULTS.scriptStructure);
    const durationPick = pickBest('videoDurationBucket', NEUTRAL_DEFAULTS.videoDurationBucket);
    const categoryPick = pickBest('topicCategory', options.category || 'financial');
    const dayPick = pickBest('publishingDay', NEUTRAL_DEFAULTS.publishingDay);

    const hasAnyEmpiricalSupport = [hookVariantPick, structurePick, durationPick, categoryPick, dayPick]
      .some(p => p.confidence !== 'neutral_default');

    return {
      topicCategory: categoryPick.value,
      hookVariant: hookVariantPick.value,
      hookDuration: hookVariantPick.value === 'speed-fact' ? 1.5 : (hookVariantPick.value === 'question-punch' ? 2.0 : 1.8),
      scriptStructure: structurePick.value,
      videoDurationBucket: durationPick.value,
      captionStyle: 'karaoke_highlight',
      visualStyle: 'motion_slideshow',
      sceneCount: '4-6',
      narrationProvider: 'gemini',
      ctaStyle: 'subscribe',
      publishingDay: dayPick.value,
      publishingHour: NEUTRAL_DEFAULTS.publishingHour,
      confidence: hasAnyEmpiricalSupport ? 'statistically_supported' : 'neutral_default',
      sampleSize: totalVideos,
      evidenceNotes: hasAnyEmpiricalSupport
        ? `Derived from ${totalVideos} published Shorts. Top hook: ${hookVariantPick.value} (${hookVariantPick.sampleCount} samples, score ${hookVariantPick.avgScore || 'N/A'}).`
        : 'Neutral baseline defaults applied; empirical traits lack statistical variance separation.'
    };
  }

  // --- Helper Inference Methods ---

  inferCategory(topic = '') {
    const t = topic.toLowerCase();
    if (t.includes('revenue') || t.includes('money') || t.includes('invest') || t.includes('stock') || t.includes('crypto')) return 'financial';
    if (t.includes('business') || t.includes('startup') || t.includes('store') || t.includes('market')) return 'business';
    if (t.includes('tech') || t.includes('ai') || t.includes('algorithm') || t.includes('software')) return 'technology';
    return 'general';
  }

  inferHookVariant(hookText = '') {
    const t = hookText.toLowerCase();
    if (t.includes('stop') || t.includes('waste') || t.includes('warning') || t.includes('danger') || t.includes('mistake')) return 'warning-alert';
    if (t.includes('?') || t.includes('why') || t.includes('what if') || t.includes('how did')) return 'question-punch';
    if (t.includes('nobody') || t.includes('actually') || t.includes('myth') || t.includes('wrong')) return 'counter-intuitive';
    return 'standard';
  }

  inferStructure(script = {}, strategy = {}) {
    const style = String(strategy.contentType || script.structure || '').toLowerCase();
    if (style.includes('list')) return 'numbered-list';
    if (style.includes('tutorial')) return 'problem-solution';
    if (style.includes('story')) return 'case-study';
    return 'single-breakdown';
  }

  inferCTAStyle(ctaText = '') {
    const t = ctaText.toLowerCase();
    if (t.includes('comment') || t.includes('share your')) return 'comment_question';
    if (t.includes('link') || t.includes('bio')) return 'link_bio';
    if (t.includes('subscribe') || t.includes('follow')) return 'subscribe';
    return 'none';
  }
}

module.exports = {
  ContentDNAService,
  NEUTRAL_DEFAULTS
};
