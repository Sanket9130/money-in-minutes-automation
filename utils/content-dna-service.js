const { Logger } = require('./logger');

/**
 * Content DNA Service
 * 
 * Formalizes and modularizes Content DNA pattern-extraction and aggregation
 * across successful Shorts and long-form video content.
 * 
 * Content DNA models observable structural, creative, and engagement characteristics:
 * - Hook patterns (hook type, length, duration, strength)
 * - Pacing patterns (scene count, scene durations, transition frequency)
 * - Visual density (treatments, chart usage, composition)
 * - Caption behavior (presence, density, style)
 * - Topic and category patterns (pillar, format, angle)
 * - Performance and retention signals
 * 
 * IMPORTANT ARCHITECTURAL BOUNDARY:
 * Content DNA represents learned audience resonance and structural patterns.
 * It is NOT factual verification.
 * Content DNA MUST NEVER bypass:
 * - Truth Anchor
 * - Provenance
 * - Financial verification
 * - Publishing Quality Gate
 */

const TRUTH_ANCHOR_BOUNDARY = Object.freeze({
  isFactualVerification: false,
  purpose: 'creative_and_structural_pattern_learning',
  boundaryRule: 'Content DNA patterns reflect structural and audience resonance preferences, NOT factual verification. Learned patterns MUST NEVER bypass Truth Anchor, financial provenance, or publishing quality gates.'
});

const CONTENT_DNA_SCHEMA = Object.freeze({
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ContentDNA',
  version: '1.0.0',
  type: 'object',
  required: [
    'version',
    'surface',
    'topicPattern',
    'hookPattern',
    'pacingPattern',
    'visualDensityPattern',
    'captionPattern',
    'performanceSignals',
    'winningSignals',
    'confidence',
    'sampleCount',
    'extractedAt'
  ],
  properties: {
    version: { type: 'string', default: '1.0.0' },
    surface: { type: 'string', enum: ['shorts', 'long_form'] },
    topicPattern: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        category: { type: 'string' },
        format: { type: 'string' },
        angle: { type: 'string' }
      }
    },
    hookPattern: {
      type: 'object',
      properties: {
        hookType: {
          type: 'string',
          enum: ['question', 'statistic', 'statement', 'challenge', 'promise', 'unknown']
        },
        hookLength: { type: 'string', enum: ['concise', 'extended', 'unknown'] },
        hookWordCount: { type: 'integer' },
        hookDurationSeconds: { type: 'number' },
        hookStrength: { type: 'string', enum: ['high', 'medium', 'low', 'unrated'] },
        firstSceneLabel: { type: 'string' }
      }
    },
    pacingPattern: {
      type: 'object',
      properties: {
        pacing: { type: 'string', enum: ['fast', 'moderate', 'extended'] },
        sceneCount: { type: 'integer' },
        totalDurationSeconds: { type: 'number' },
        averageSceneDuration: { type: 'number' },
        transitionFrequency: { type: 'number' }
      }
    },
    visualDensityPattern: {
      type: 'object',
      properties: {
        densityLevel: { type: 'string', enum: ['high', 'medium', 'low', 'minimal'] },
        visualTreatmentCount: { type: 'integer' },
        treatmentTypes: { type: 'array', items: { type: 'string' } },
        hasChartsOrVisualizations: { type: 'boolean' },
        thumbnailStyle: { type: 'string' }
      }
    },
    captionPattern: {
      type: 'object',
      properties: {
        hasCaptions: { type: 'boolean' },
        captionStyle: { type: 'string' },
        captionDensity: { type: 'string', enum: ['dense', 'balanced', 'sparse', 'none'] },
        estimatedWordsPerSecond: { type: 'number' }
      }
    },
    performanceSignals: {
      type: 'object',
      properties: {
        retention: { type: ['number', 'null'] },
        ctr: { type: ['number', 'null'] },
        engagementRate: { type: ['number', 'null'] },
        performanceScore: { type: ['number', 'null'] },
        retentionSignal: { type: ['string', 'null'] },
        isWinning: { type: 'boolean' }
      }
    },
    winningSignals: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low', 'unverified'] },
    sampleCount: { type: 'integer', default: 1 },
    extractedAt: { type: 'string' }
  }
});

class ContentDNAService {
  constructor(options = {}) {
    this.logger = options.logger || new Logger('ContentDNAService');
    this.truthAnchorBoundary = TRUTH_ANCHOR_BOUNDARY;
  }

  /**
   * Return the frozen JSON schema definition for Content DNA.
   */
  getSchema() {
    return CONTENT_DNA_SCHEMA;
  }

  /**
   * Validate a Content DNA object against required structure.
   */
  validateDNA(dna) {
    const errors = [];
    if (!dna || typeof dna !== 'object') {
      return { valid: false, errors: ['Content DNA must be a non-null object'] };
    }

    const requiredKeys = [
      'version',
      'surface',
      'topicPattern',
      'hookPattern',
      'pacingPattern',
      'visualDensityPattern',
      'captionPattern',
      'performanceSignals',
      'winningSignals',
      'confidence',
      'sampleCount'
    ];

    for (const key of requiredKeys) {
      if (dna[key] === undefined) {
        errors.push(`Missing required field: ${key}`);
      }
    }

    if (dna.surface && !['shorts', 'long_form'].includes(dna.surface)) {
      errors.push(`Invalid surface: ${dna.surface}`);
    }

    if (dna.hookPattern && typeof dna.hookPattern !== 'object') {
      errors.push('hookPattern must be an object');
    }

    if (dna.pacingPattern && typeof dna.pacingPattern !== 'object') {
      errors.push('pacingPattern must be an object');
    }

    if (dna.visualDensityPattern && typeof dna.visualDensityPattern !== 'object') {
      errors.push('visualDensityPattern must be an object');
    }

    if (dna.captionPattern && typeof dna.captionPattern !== 'object') {
      errors.push('captionPattern must be an object');
    }

    if (dna.performanceSignals && typeof dna.performanceSignals !== 'object') {
      errors.push('performanceSignals must be an object');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Extract comprehensive Content DNA from content context and performance metrics.
   *
   * @param {Object} content - Content context (strategy, script, scenes, thumbnail, format)
   * @param {Object} metrics - Performance report or normalized metrics
   * @returns {Object} Structured Content DNA
   */
  extractContentDNA(content = {}, metrics = {}) {
    const safeContent = content && typeof content === 'object' ? content : {};
    const safeMetrics = metrics && typeof metrics === 'object' ? metrics : {};

    const surface = safeContent.contentFormat === 'short' || safeContent.surface === 'shorts'
      ? 'shorts'
      : 'long_form';

    const topicPattern = this.extractTopicPattern(safeContent, safeMetrics);
    const hookPattern = this.extractHookPattern(safeContent, safeMetrics);
    const pacingPattern = this.extractPacingPattern(safeContent, safeMetrics);
    const visualDensityPattern = this.extractVisualDensityPattern(safeContent, safeMetrics);
    const captionPattern = this.extractCaptionPattern(safeContent, safeMetrics, pacingPattern);

    // Normalize observable metrics
    const retention = this.optionalNumber(
      safeMetrics.retention ?? safeMetrics.averageViewPercentage ?? safeMetrics.watchTime?.averageViewPercentage
    );
    const ctr = this.optionalNumber(
      safeMetrics.ctr ?? safeMetrics.clickThroughRate ?? safeMetrics.views?.averageCTR
    );
    const engagementRate = this.optionalNumber(
      safeMetrics.engagementRate ?? safeMetrics.engagement?.engagementRate
    );
    const performanceScore = this.optionalNumber(
      safeMetrics.performanceScore ?? safeMetrics.performance?.score
    );

    // Retention curve signal if available from SceneRetentionEngine
    const retentionSignal = safeMetrics.signal ||
      (safeMetrics.summary?.primaryDropoff ? 'drop_off' : safeMetrics.summary?.strongestScene ? 'strong_hold' : null);

    // Objective winning criteria: high performance score, high retention, or strong CTR
    const isWinning = Boolean(
      (performanceScore !== null && performanceScore >= 75) ||
      (retention !== null && retention >= 50) ||
      (ctr !== null && ctr >= 6.0)
    );

    // Observable winning signals
    const winningSignals = [];
    if (hookPattern.hookLength === 'concise' && (retention === null || retention >= 40)) {
      winningSignals.push('concise_hook');
    }
    if (pacingPattern.pacing === 'fast' && (retention === null || retention >= 40)) {
      winningSignals.push('fast_pacing');
    }
    if (visualDensityPattern.hasChartsOrVisualizations || visualDensityPattern.densityLevel === 'high') {
      winningSignals.push('visual_richness');
    }
    if (captionPattern.hasCaptions) {
      winningSignals.push('caption_optimized');
    }
    if (retention !== null && retention >= 50) {
      winningSignals.push('high_retention');
    }
    if (ctr !== null && ctr >= 5.0) {
      winningSignals.push('strong_ctr');
    }
    if (engagementRate !== null && engagementRate >= 4.0) {
      winningSignals.push('high_engagement');
    }

    const confidence = this.calculateConfidenceForSingle(safeMetrics);

    const dna = {
      version: '1.0.0',
      surface,
      topicPattern,
      hookPattern,
      pacingPattern,
      visualDensityPattern,
      captionPattern,
      performanceSignals: {
        retention,
        ctr,
        engagementRate,
        performanceScore,
        retentionSignal,
        isWinning
      },
      winningSignals,
      confidence,
      sampleCount: 1,
      extractedAt: new Date().toISOString(),
      truthAnchorBoundary: this.truthAnchorBoundary.boundaryRule
    };

    return dna;
  }

  /**
   * Extract hook patterns from content and optional retention data.
   */
  extractHookPattern(content = {}, metrics = {}) {
    const script = content.script || {};
    const firstScene = (content.retentionScenes || content.scenes || [])[0] || {};

    const rawHook = script.hook || script.introduction || firstScene.scriptText || firstScene.label || '';
    const hookText = this.text(typeof rawHook === 'object' && rawHook !== null ? (rawHook.text || '') : rawHook);
    const hookWordCount = this.wordCount(hookText);

    // Hook length classification (consistent with ChannelLearningEngine baseline)
    let hookLength = 'unknown';
    if (hookWordCount > 0) {
      hookLength = hookWordCount <= 40 ? 'concise' : 'extended';
    }

    // Hook type classification (question, statistic, statement, challenge, promise, unknown)
    let hookType = 'unknown';
    if (typeof script.hook === 'object' && script.hook !== null && script.hook.type) {
      hookType = String(script.hook.type).trim().toLowerCase();
    } else if (hookText) {
      if (/\?$/.test(hookText.trim()) || /^(have you|did you|why|how|what|is it|can you|are you)\b/i.test(hookText.trim())) {
        hookType = 'question';
      } else if (/\b(\d+%\b|\d+\s*percent|\$\d+|\d+x\b)/i.test(hookText) || /\b(stat|number|data)\b/i.test(hookText)) {
        hookType = 'statistic';
      } else if (/\b(wrong|mistake|lie|myth|truth|stop|never|nobody|secret|hidden)\b/i.test(hookText)) {
        hookType = 'challenge';
      } else if (/\b(will show|you will learn|how to master|in this video|step[- ]by[- ]step|guarantee)\b/i.test(hookText)) {
        hookType = 'promise';
      } else {
        hookType = 'statement';
      }
    }

    // Hook duration calculation
    let hookDurationSeconds = 0;
    if (typeof script.hook === 'object' && script.hook !== null && script.hook.duration) {
      hookDurationSeconds = this.parseDurationSpan(script.hook.duration);
    } else if (firstScene.duration) {
      hookDurationSeconds = this.number(firstScene.duration);
    } else if (hookText) {
      hookDurationSeconds = content.contentFormat === 'short' ? 3 : 5;
    }

    // Hook strength from retention evidence
    const retention = this.optionalNumber(metrics.retention ?? metrics.averageViewPercentage);
    const performanceScore = this.optionalNumber(metrics.performanceScore ?? metrics.score);
    let hookStrength = 'unrated';
    if (firstScene.signal === 'strong_hold' || (retention !== null && retention >= 50) || (performanceScore !== null && performanceScore >= 75)) {
      hookStrength = 'high';
    } else if (firstScene.signal === 'drop_off' || (retention !== null && retention < 35)) {
      hookStrength = 'low';
    } else if (retention !== null || performanceScore !== null || firstScene.signal) {
      hookStrength = 'medium';
    }

    const firstSceneLabel = firstScene.label || (hookText ? 'Hook' : 'unknown');

    return {
      hookType,
      hookLength,
      hookWordCount,
      hookDurationSeconds: Number(hookDurationSeconds.toFixed(2)),
      hookStrength,
      firstSceneLabel
    };
  }

  /**
   * Extract pacing patterns (scene count, durations, transition frequencies).
   */
  extractPacingPattern(content = {}, metrics = {}) {
    const scenes = Array.isArray(content.retentionScenes) && content.retentionScenes.length
      ? content.retentionScenes
      : Array.isArray(content.scenes) && content.scenes.length
        ? content.scenes
        : Array.isArray(content.script?.sections) && content.script.sections.length
          ? content.script.sections
          : [];

    const isShort = content.contentFormat === 'short' || content.surface === 'shorts';
    const sceneCount = scenes.length ? scenes.length : (isShort ? 3 : 1);

    const sumDuration = scenes.reduce((sum, s) => sum + Math.max(0, this.number(s.duration)), 0);
    const totalDurationSeconds = Math.max(
      1,
      this.number(content.retentionDuration) ||
      this.number(metrics.durationSeconds) ||
      this.number(metrics.averageViewDuration) ||
      sumDuration ||
      (isShort ? 30 : 180)
    );

    const averageSceneDuration = Number((totalDurationSeconds / Math.max(1, sceneCount)).toFixed(2));

    // Pacing classification based on average scene duration
    let pacing = 'moderate';
    if (averageSceneDuration <= 4) {
      pacing = 'fast';
    } else if (averageSceneDuration > 8) {
      pacing = 'extended';
    }

    // Transition frequency: number of scene cuts per minute
    const transitions = Math.max(0, sceneCount - 1);
    const transitionFrequency = Number(((transitions / totalDurationSeconds) * 60).toFixed(2));

    return {
      pacing,
      sceneCount,
      totalDurationSeconds: Number(totalDurationSeconds.toFixed(2)),
      averageSceneDuration,
      transitionFrequency
    };
  }

  /**
   * Extract visual density and treatment characteristics.
   */
  extractVisualDensityPattern(content = {}) {
    const scenes = Array.isArray(content.scenes) && content.scenes.length
      ? content.scenes
      : Array.isArray(content.retentionScenes)
        ? content.retentionScenes
        : [];

    const treatmentSet = new Set();
    let visualTreatmentCount = 0;
    let hasChartsOrVisualizations = false;

    for (const scene of scenes) {
      const treatment = scene.treatment || scene.treatmentType || scene.visualTreatment;
      const type = scene.sceneType || scene.asset_type;
      if (treatment && treatment !== 'NONE' && treatment !== 'standard') {
        treatmentSet.add(treatment);
        visualTreatmentCount++;
      }
      if (/chart|comparison|growth|percentage|number|statistic|ranking|trend/i.test(String(treatment || '')) ||
          /chart|comparison|growth|percentage|number|statistic|ranking|trend/i.test(String(type || ''))) {
        hasChartsOrVisualizations = true;
      }
    }

    const sceneCount = Math.max(1, scenes.length);
    const treatmentRatio = visualTreatmentCount / sceneCount;

    let densityLevel = 'minimal';
    if (treatmentRatio >= 0.75) {
      densityLevel = 'high';
    } else if (treatmentRatio >= 0.4) {
      densityLevel = 'medium';
    } else if (visualTreatmentCount > 0) {
      densityLevel = 'low';
    }

    const thumbnail = content.thumbnail || {};
    const thumbnailStyle = this.slug(
      thumbnail.concept?.composition || thumbnail.concept?.style || thumbnail.style || 'unknown'
    );

    return {
      densityLevel,
      visualTreatmentCount,
      treatmentTypes: [...treatmentSet],
      hasChartsOrVisualizations,
      thumbnailStyle
    };
  }

  /**
   * Extract caption density, presence, and speaking rate.
   */
  extractCaptionPattern(content = {}, _metrics = {}, pacingPattern = null) {
    const hasCaptions = Boolean(
      content.captionsPath ||
      content.captions ||
      content.shortClip?.captions_path ||
      content.contentFormat === 'short' ||
      content.surface === 'shorts'
    );

    const script = content.script || {};
    const allText = this.text(
      script.fullScript ||
      script.text ||
      (content.scenes || []).map(s => s.scriptText).filter(Boolean).join(' ') ||
      script.title ||
      ''
    );

    const totalWords = this.wordCount(allText);
    const duration = pacingPattern?.totalDurationSeconds || (content.contentFormat === 'short' ? 30 : 180);
    const estimatedWordsPerSecond = duration > 0 ? Number((totalWords / duration).toFixed(2)) : 0;

    let captionDensity = 'none';
    if (hasCaptions || totalWords > 0) {
      if (estimatedWordsPerSecond >= 2.5) {
        captionDensity = 'dense';
      } else if (estimatedWordsPerSecond >= 1.5) {
        captionDensity = 'balanced';
      } else if (estimatedWordsPerSecond > 0) {
        captionDensity = 'sparse';
      }
    }

    const captionStyle = content.shortClip?.layout || (hasCaptions ? 'standard' : 'none');

    return {
      hasCaptions,
      captionStyle,
      captionDensity,
      estimatedWordsPerSecond
    };
  }

  /**
   * Extract topic, pillar category, format, and angle.
   */
  extractTopicPattern(content = {}) {
    const strategy = content.strategy || {};
    const script = content.script || {};

    const topic = strategy.topic || content.topic || script.title || '';
    const category = strategy.contentPillar || strategy.pillar || 'unknown';
    const format = content.contentFormat === 'short' || content.surface === 'shorts'
      ? 'shorts'
      : this.slug(strategy.requestedStyle || strategy.contentType || 'unknown');
    const angle = strategy.angle || '';

    return {
      topic,
      category,
      format,
      angle
    };
  }

  /**
   * Aggregate multiple historical Content DNA samples into a unified, deterministic profile.
   *
   * @param {Array<Object>} samples - Array of Content DNA objects
   * @returns {Object} Deterministic aggregated Content DNA profile
   */
  aggregateDNA(samples = []) {
    if (!Array.isArray(samples) || samples.length === 0) {
      return this.emptyAggregatedProfile();
    }

    const validSamples = samples.filter(item => item && typeof item === 'object');
    if (!validSamples.length) {
      return this.emptyAggregatedProfile();
    }

    const sampleCount = validSamples.length;
    const confidence = this.calculateConfidence(validSamples);

    // Surface breakdown
    const surfaceBreakdown = { shorts: 0, long_form: 0 };
    for (const s of validSamples) {
      if (s.surface === 'shorts') surfaceBreakdown.shorts++;
      else surfaceBreakdown.long_form++;
    }

    // Hook aggregation
    const hookTypes = [];
    const hookLengths = [];
    const hookDurations = [];
    const hookWordCounts = [];

    for (const s of validSamples) {
      const hook = s.hookPattern || {};
      if (hook.hookType && hook.hookType !== 'unknown') hookTypes.push(hook.hookType);
      if (hook.hookLength && hook.hookLength !== 'unknown') hookLengths.push(hook.hookLength);
      if (Number.isFinite(hook.hookDurationSeconds) && hook.hookDurationSeconds > 0) {
        hookDurations.push(hook.hookDurationSeconds);
      }
      if (Number.isFinite(hook.hookWordCount) && hook.hookWordCount > 0) {
        hookWordCounts.push(hook.hookWordCount);
      }
    }

    const typeFrequencies = this.countFrequencies(hookTypes);
    const preferredType = this.mostFrequent(typeFrequencies, 'statement');
    const preferredLength = this.mostFrequent(this.countFrequencies(hookLengths), 'concise');

    // Pacing aggregation
    const pacingTypes = [];
    const sceneCounts = [];
    const sceneDurations = [];
    const transitionFrequencies = [];

    for (const s of validSamples) {
      const pacing = s.pacingPattern || {};
      if (pacing.pacing) pacingTypes.push(pacing.pacing);
      if (Number.isFinite(pacing.sceneCount)) sceneCounts.push(pacing.sceneCount);
      if (Number.isFinite(pacing.averageSceneDuration)) sceneDurations.push(pacing.averageSceneDuration);
      if (Number.isFinite(pacing.transitionFrequency)) transitionFrequencies.push(pacing.transitionFrequency);
    }

    const pacingFrequencies = this.countFrequencies(pacingTypes);
    const preferredPacing = this.mostFrequent(pacingFrequencies, 'moderate');

    // Visual density aggregation
    const densityLevels = [];
    const allTreatments = [];
    let chartCount = 0;
    const thumbnailStyles = [];

    for (const s of validSamples) {
      const visual = s.visualDensityPattern || {};
      if (visual.densityLevel) densityLevels.push(visual.densityLevel);
      if (Array.isArray(visual.treatmentTypes)) allTreatments.push(...visual.treatmentTypes);
      if (visual.hasChartsOrVisualizations) chartCount++;
      if (visual.thumbnailStyle && visual.thumbnailStyle !== 'unknown') {
        thumbnailStyles.push(visual.thumbnailStyle);
      }
    }

    const treatmentFrequencies = this.countFrequencies(allTreatments);
    const topTreatments = Object.entries(treatmentFrequencies)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 5);

    // Caption aggregation
    let captionCount = 0;
    const captionDensities = [];
    const wpsValues = [];

    for (const s of validSamples) {
      const caption = s.captionPattern || {};
      if (caption.hasCaptions) captionCount++;
      if (caption.captionDensity && caption.captionDensity !== 'none') {
        captionDensities.push(caption.captionDensity);
      }
      if (Number.isFinite(caption.estimatedWordsPerSecond) && caption.estimatedWordsPerSecond > 0) {
        wpsValues.push(caption.estimatedWordsPerSecond);
      }
    }

    // Topic aggregation
    const categories = [];
    const formats = [];

    for (const s of validSamples) {
      const topic = s.topicPattern || {};
      if (topic.category && topic.category !== 'unknown') categories.push(topic.category);
      if (topic.format && topic.format !== 'unknown') formats.push(topic.format);
    }

    const topCategories = Object.entries(this.countFrequencies(categories))
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count }));

    const topFormats = Object.entries(this.countFrequencies(formats))
      .sort((a, b) => b[1] - a[1])
      .map(([format, count]) => ({ format, count }));

    // Performance benchmarks
    const retentions = [];
    const ctrs = [];
    const engagements = [];
    const scores = [];
    let winningCount = 0;
    const winningSignalsCollected = [];

    for (const s of validSamples) {
      const perf = s.performanceSignals || {};
      if (perf.retention !== null && Number.isFinite(perf.retention)) retentions.push(perf.retention);
      if (perf.ctr !== null && Number.isFinite(perf.ctr)) ctrs.push(perf.ctr);
      if (perf.engagementRate !== null && Number.isFinite(perf.engagementRate)) engagements.push(perf.engagementRate);
      if (perf.performanceScore !== null && Number.isFinite(perf.performanceScore)) scores.push(perf.performanceScore);
      if (perf.isWinning) {
        winningCount++;
        if (Array.isArray(s.winningSignals)) {
          winningSignalsCollected.push(...s.winningSignals);
        }
      }
    }

    const winningSignalFrequencies = this.countFrequencies(winningSignalsCollected);
    const winningCharacteristics = Object.entries(winningSignalFrequencies)
      .sort((a, b) => b[1] - a[1])
      .map(([signal]) => signal);

    return {
      version: '1.0.0',
      sampleCount,
      confidence,
      surfaceBreakdown,
      dominantHookPatterns: {
        preferredType,
        preferredLength,
        typeFrequencies,
        averageHookDuration: hookDurations.length ? Number(this.average(hookDurations).toFixed(2)) : 0,
        averageHookWordCount: hookWordCounts.length ? Math.round(this.average(hookWordCounts)) : 0
      },
      dominantPacingPatterns: {
        preferredPacing,
        pacingFrequencies,
        averageSceneCount: sceneCounts.length ? Math.round(this.average(sceneCounts)) : 1,
        averageSceneDuration: sceneDurations.length ? Number(this.average(sceneDurations).toFixed(2)) : 0,
        averageTransitionFrequency: transitionFrequencies.length ? Number(this.average(transitionFrequencies).toFixed(2)) : 0
      },
      dominantVisualPatterns: {
        preferredDensityLevel: this.mostFrequent(this.countFrequencies(densityLevels), 'minimal'),
        topTreatments,
        chartUsageRate: Number((chartCount / sampleCount).toFixed(2)),
        commonThumbnailStyles: this.countFrequencies(thumbnailStyles)
      },
      dominantCaptionPatterns: {
        captionUsageRate: Number((captionCount / sampleCount).toFixed(2)),
        preferredDensity: this.mostFrequent(this.countFrequencies(captionDensities), 'balanced'),
        averageWordsPerSecond: wpsValues.length ? Number(this.average(wpsValues).toFixed(2)) : 0
      },
      dominantTopicPatterns: {
        topCategories,
        topFormats
      },
      performanceBenchmarks: {
        averageRetention: retentions.length ? Number(this.average(retentions).toFixed(1)) : null,
        averageCTR: ctrs.length ? Number(this.average(ctrs).toFixed(2)) : null,
        averageEngagementRate: engagements.length ? Number(this.average(engagements).toFixed(2)) : null,
        averagePerformanceScore: scores.length ? Number(this.average(scores).toFixed(1)) : null,
        winningRate: Number((winningCount / sampleCount).toFixed(2))
      },
      winningCharacteristics,
      truthAnchorBoundary: this.truthAnchorBoundary.boundaryRule,
      aggregatedAt: new Date().toISOString()
    };
  }

  /**
   * Calculate confidence across multiple aggregated samples.
   */
  calculateConfidence(samples = []) {
    if (!Array.isArray(samples) || samples.length === 0) return 'none';
    const highConfidenceCount = samples.filter(s => s.confidence === 'high').length;
    if (samples.length >= 6 && highConfidenceCount >= 3) return 'high';
    if (samples.length >= 3) return 'medium';
    return 'low';
  }

  /**
   * Calculate confidence for a single sample from metrics exposure.
   */
  calculateConfidenceForSingle(metrics = {}) {
    const impressions = this.number(metrics.impressions ?? metrics.views?.totalImpressions);
    const views = this.number(metrics.views ?? metrics.views?.totalViews);
    if (impressions >= 1000 && views >= 100) return 'high';
    if (impressions >= 100 && views >= 20) return 'medium';
    if (views > 0 || impressions > 0) return 'low';
    return 'unverified';
  }

  /**
   * Empty profile fallback when no samples exist.
   */
  emptyAggregatedProfile() {
    return {
      version: '1.0.0',
      sampleCount: 0,
      confidence: 'none',
      surfaceBreakdown: { shorts: 0, long_form: 0 },
      dominantHookPatterns: {
        preferredType: 'unknown',
        preferredLength: 'unknown',
        typeFrequencies: {},
        averageHookDuration: 0,
        averageHookWordCount: 0
      },
      dominantPacingPatterns: {
        preferredPacing: 'moderate',
        pacingFrequencies: {},
        averageSceneCount: 0,
        averageSceneDuration: 0,
        averageTransitionFrequency: 0
      },
      dominantVisualPatterns: {
        preferredDensityLevel: 'minimal',
        topTreatments: [],
        chartUsageRate: 0,
        commonThumbnailStyles: {}
      },
      dominantCaptionPatterns: {
        captionUsageRate: 0,
        preferredDensity: 'none',
        averageWordsPerSecond: 0
      },
      dominantTopicPatterns: {
        topCategories: [],
        topFormats: []
      },
      performanceBenchmarks: {
        averageRetention: null,
        averageCTR: null,
        averageEngagementRate: null,
        averagePerformanceScore: null,
        winningRate: 0
      },
      winningCharacteristics: [],
      truthAnchorBoundary: this.truthAnchorBoundary.boundaryRule,
      aggregatedAt: new Date().toISOString()
    };
  }

  // --- Helper Methods ---

  parseDurationSpan(span) {
    if (typeof span !== 'string') return this.number(span);
    const match = span.match(/(\d+):(\d+)\s*-\s*(\d+):(\d+)/);
    if (match) {
      const start = Number(match[1]) * 60 + Number(match[2]);
      const end = Number(match[3]) * 60 + Number(match[4]);
      return Math.max(1, end - start);
    }
    const single = span.match(/(\d+):(\d+)/);
    if (single) {
      return Number(single[1]) * 60 + Number(single[2]);
    }
    const num = Number(span);
    return Number.isFinite(num) ? num : 5;
  }

  countFrequencies(items = []) {
    const counts = {};
    for (const item of items) {
      const key = String(item).trim();
      if (!key) continue;
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }

  mostFrequent(freqMap, fallback = 'unknown') {
    const entries = Object.entries(freqMap);
    if (!entries.length) return fallback;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }

  average(values = []) {
    if (!values.length) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  text(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(item => this.text(item)).join(' ');
    if (value && typeof value === 'object') return Object.values(value).map(item => this.text(item)).join(' ');
    return '';
  }

  wordCount(value) {
    return String(value || '').trim().split(/\s+/).filter(Boolean).length;
  }

  number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  optionalNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  slug(value) {
    return String(value || 'unknown')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'unknown';
  }
}

module.exports = {
  ContentDNAService,
  TRUTH_ANCHOR_BOUNDARY,
  CONTENT_DNA_SCHEMA
};
