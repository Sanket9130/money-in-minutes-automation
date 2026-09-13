const { Logger } = require('../utils/logger');
const { AITextService } = require('../utils/ai-text-service');
const { SemanticDedupService } = require('../utils/semantic-dedup-service');
const { TrendingTopicDiscovery, TopicPerformanceScorer } = require('../utils/trending-topic-discovery');

class ContentStrategyAgent {
  constructor(db, credentials, options = {}) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('ContentStrategy');
    this.trendingTopics = [];
    this.competitorData = [];
    this.contentCalendar = [];
    this.aiTextService = new AITextService(credentials?.credentials || credentials || {});
    this.trendingTopicDiscovery = options.trendingTopicDiscovery || new TrendingTopicDiscovery(credentials, options.discoveryOptions || {});
    this.semanticDedupService = options.semanticDedupService || new SemanticDedupService(options.dedupOptions || {});
    this.topicPerformanceScorer = options.topicPerformanceScorer || new TopicPerformanceScorer(options.topicScorerOptions || {});
    this.historicalKeywords = [];
    this.channelBaseline = 0;
  }

  async initialize() {
    this.logger.info('Initializing Content Strategy Agent...');
    await this.loadHistoricalData();
    await this.analyzeTrends();
    return true;
  }

  async loadHistoricalData() {
    try {
      const history = await this.db.getContentHistory();
      this.historicalPerformance = history;
    } catch (error) {
      this.logger.warn('No historical data found, starting fresh');
      this.historicalPerformance = [];
    }

    try {
      if (this.db && typeof this.db.getKeywordPerformance === 'function') {
        this.historicalKeywords = await this.db.getKeywordPerformance({ limit: 100 });
        if (typeof this.db.getKeywordBaseline === 'function') {
          const baselineData = await this.db.getKeywordBaseline();
          this.channelBaseline = baselineData?.baselineViews || 0;
        } else {
          this.channelBaseline = this.topicPerformanceScorer.calculateChannelBaseline(this.historicalKeywords);
        }
      }
    } catch (err) {
      this.logger.warn(`Could not load historical keyword performance: ${err.message}`);
      this.historicalKeywords = [];
      this.channelBaseline = 0;
    }
  }

  async analyzeTrends(options = {}) {
    try {
      const discoveryOptions = {
        ...options,
        keywordData: options.keywordData || this.historicalKeywords,
        baseline: options.baseline !== undefined ? options.baseline : this.channelBaseline
      };
      const result = await this.trendingTopicDiscovery.discoverTrendingTopics(discoveryOptions);
      this.competitorData = result.competitorData;
      this.trendingTopics = result.trendingTopics;
      this.logger.info(`Identified ${this.trendingTopics.length} trending topics`);
      return this.trendingTopics;
    } catch (error) {
      this.logger.error('Error analyzing trends:', error);
      this.trendingTopics = [];
      this.competitorData = [];
      return [];
    }
  }

  async fetchYouTubeTrends(options = {}) {
    return this.trendingTopicDiscovery.fetchYouTubeTrends(options);
  }

  async analyzeCompetitors(options = {}) {
    return this.trendingTopicDiscovery.fetchCompetitorTopics(options);
  }

  async getChannelVideos(channelId, options = {}) {
    return this.trendingTopicDiscovery.getChannelVideos(channelId, options);
  }

  analyzeVideoPerformance(videos) {
    return this.trendingTopicDiscovery.analyzeVideoPerformance(videos);
  }

  extractKeywords(text) {
    return this.trendingTopicDiscovery.extractKeywords(text);
  }

  mergeTrendData(trends, competitors) {
    return this.trendingTopicDiscovery.mergeTrendData(trends, competitors);
  }

  async generateContentStrategy(requestedTopic = null) {
    try {
      let topic, angle, targetAudience, contentType;

      const aiStrategy = await this.generateContentStrategyWithAI(requestedTopic);
      if (aiStrategy) {
        await this.db.saveContentStrategy(aiStrategy);
        this.logger.info(`Generated AI strategy for: ${aiStrategy.topic}`);
        return aiStrategy;
      }

      this.logger.info('Using template content strategy generation');
      if (requestedTopic) {
        topic = requestedTopic;
        angle = await this.generateAngle(topic);
      } else {
        // Select from trending topics
        const selectedTopic = this.selectOptimalTopic();
        topic = selectedTopic.topic;
        angle = await this.generateAngle(topic);
      }

      // Determine target audience
      targetAudience = await this.identifyTargetAudience(topic);

      // Select content type
      contentType = this.selectContentType(topic);

      // Generate content calendar entry
      const strategy = {
        topic,
        angle,
        targetAudience,
        contentType,
        keywords: this.extractKeywords(topic),
        estimatedViews: this.predictViews(topic),
        bestPublishTime: this.calculateBestPublishTime(),
        competitorAnalysis: this.getCompetitorInsights(topic),
        createdAt: new Date().toISOString()
      };

      // Save to database
      await this.db.saveContentStrategy(strategy);

      this.logger.info(`Generated strategy for: ${topic}`);
      return strategy;
    } catch (error) {
      this.logger.error('Failed to generate content strategy:', error);
      throw error;
    }
  }

  async researchAndPlanChannel(channelStrategy) {
    const targetCount = Math.max(1, Math.min(5, Number(channelStrategy.videos_per_run || 1)));
    await this.analyzeTrends();

    const recentRows = await this.db.getAllRows(
      "SELECT topic, created_at FROM content_strategies WHERE created_at >= datetime('now', '-90 days') ORDER BY created_at DESC LIMIT 50"
    );
    const approvedLearnings = this.db.listLearningRecommendations
      ? await this.db.listLearningRecommendations({ status: 'approved', limit: 10 })
      : [];
    const signals = this.trendingTopics.slice(0, 15).map(item => ({
      topic: item.topic,
      score: Number(item.score || 0),
      sources: [...new Set(item.sources || [])],
      evidence: item.evidence || [],
      performanceMultiplier: item.performanceMultiplier ?? 1.0,
      performanceSignal: item.performanceSignal || null
    }));
    const sourceCatalog = [...new Map(
      signals.flatMap(signal => signal.evidence || []).map(source => [source.url, source])
    ).values()].slice(0, 30);
    const signalSources = new Set(signals.flatMap(signal => signal.sources));
    const researchSources = [
      ...(signalSources.has('trending') ? ['YouTube most-popular videos'] : []),
      ...(signalSources.has('competitor') ? ['Configured competitor channels'] : []),
      ...(recentRows.length ? ['Channel content history'] : []),
      ...(approvedLearnings.length ? ['Operator-approved channel performance learnings'] : [])
    ];
    const research = {
      generatedAt: new Date().toISOString(),
      sources: researchSources.length ? researchSources : ['No usable live signals returned; evergreen strategy fallback'],
      signals,
      sourceCatalog,
      recentTopics: recentRows.map(row => row.topic),
      competitorChannelsAnalyzed: this.competitorData.length,
      approvedLearnings: approvedLearnings.map(item => ({
        category: item.category,
        title: item.title,
        rationale: item.rationale,
        confidence: item.confidence,
        proposedChange: item.proposedChange
      }))
    };

    let plan = await this.generateAutonomousPlanWithAI(channelStrategy, research, targetCount);
    plan = this.normalizeAutonomousPlan(plan, channelStrategy, targetCount, research);
    if (plan.length < targetCount) {
      const fallback = this.buildFallbackAutonomousPlan(channelStrategy, research, targetCount);
      plan = this.normalizeAutonomousPlan([...plan, ...fallback], channelStrategy, targetCount, research);
    }

    // A5.1: Enforce autonomous plan exploration vs exploitation policy
    plan = this.enforcePlanExplorationPolicy(plan, channelStrategy, targetCount, research);

    return { research, plan };
  }

  async generateAutonomousPlanWithAI(channelStrategy, research, targetCount) {
    if (!this.aiTextService.isAvailable()) return [];
    const prompt = `You are the strategy lead for an autonomous YouTube channel.
Turn the channel strategy and the supplied research signals into a focused content plan.
Return only a valid JSON array with exactly ${targetCount} items using this shape:
[{"topic":"specific video topic","pillar":"one exact content pillar from the supplied strategy","angle":"distinct audience-relevant angle","rationale":"why this advances the channel objective using the supplied evidence","format":"explainer|tutorial|list|review|story","length":"short|medium|long","sourceUrls":["exact URL from the supplied source catalog"]}]

Channel objective: ${channelStrategy.objective}
Audience: ${channelStrategy.audience}
Value proposition: ${channelStrategy.value_proposition || 'not specified'}
Content pillars: ${(channelStrategy.contentPillars || []).join(', ')}
Preferred format: ${channelStrategy.default_format}
Preferred length: ${channelStrategy.default_length}
Success metric: ${channelStrategy.success_metric || 'not specified'}
Primary KPI: ${channelStrategy.primary_kpi || 'views'}
Target: ${channelStrategy.target_value || 'not set'} per ${channelStrategy.target_window_days || 28} days
Monthly production budget: ${channelStrategy.monthly_budget ?? 'not set'} ${channelStrategy.outcome_currency || 'USD'}
Constraints: ${channelStrategy.constraints || 'none'}
Research signals: ${JSON.stringify(research.signals)}
Allowed source catalog: ${JSON.stringify(research.sourceCatalog)}
Recent topics to avoid repeating: ${JSON.stringify(research.recentTopics)}
Operator-approved performance learnings to apply: ${JSON.stringify(research.approvedLearnings)}

Do not invent trend data, statistics, sources, URLs, or factual claims. Use only exact URLs from the supplied source catalog. Apply only the supplied approved learnings; pending or rejected recommendations are not authorized. Prefer evergreen topics when the supplied signals are weak. Learnings with category "audience_demand" are audience-requested topics mined from real comments on published videos; prefer planning a video that directly answers one when it fits the channel objective, and cite it in the rationale.`;

    try {
      const response = await this.aiTextService.generateText(prompt, { maxTokens: 1800, temperature: 0.65 });
      const parsed = this.parseAIJsonResponse(response);
      return Array.isArray(parsed) ? parsed : Array.isArray(parsed.plan) ? parsed.plan : [];
    } catch (error) {
      this.logger.warn(`AI channel plan failed; using evidence-aware fallback: ${error.message}`);
      return [];
    }
  }

  buildFallbackAutonomousPlan(channelStrategy, research, targetCount) {
    const recent = new Set(research.recentTopics.map(topic => String(topic).toLowerCase()));
    const rawSignals = research.signals
      .map(signal => signal.topic)
      .filter(topic => topic.includes(' ') && topic.length >= 8 && !recent.has(topic.toLowerCase()));
    const { unique: readableSignals } = this.semanticDedupService.filterDuplicates(
      rawSignals,
      research.recentTopics || []
    );
    const pillars = channelStrategy.contentPillars || [];
    const pillarTopics = pillars.map(pillar => `${pillar}: a practical guide for ${channelStrategy.audience}`);
    const candidates = [...readableSignals, ...pillarTopics, ...this.getEvergreenFallbackTopics()];

    return candidates.slice(0, targetCount).map((topic, index) => ({
      topic,
      pillar: pillars.find(pillar => topic.toLowerCase().includes(String(pillar).toLowerCase())) || pillars[index % Math.max(1, pillars.length)] || '',
      angle: `${topic} through the lens of ${channelStrategy.value_proposition || channelStrategy.objective}`,
      rationale: readableSignals.includes(topic)
        ? 'Matches a current YouTube or configured competitor signal and fits the channel strategy.'
        : research.approvedLearnings.length
          ? `Builds an evergreen topic from the channel strategy while applying approved learning: ${research.approvedLearnings[0].title}.`
          : 'Builds an evergreen topic from the channel strategy when live research signals are limited.',
      format: index === 0 ? channelStrategy.default_format : ['explainer', 'tutorial', 'list'][index % 3],
      length: channelStrategy.default_length,
      sourceUrls: research.signals.find(signal => signal.topic === topic)?.evidence?.map(source => source.url) || []
    }));
  }

  /**
   * Enforces autonomous plan exploration policy (Milestone A5.1).
   * 
   * Policy:
   * - If targetCount >= 2: at least 1 selected candidate MUST be genuinely novel
   *   to the channel's historical topic/keyword performance.
   * - If targetCount == 1: no forced exploration replacement is required.
   * - Never bypass semantic deduplication or select banned topics.
   * - If no valid novel candidate exists, fails safely by keeping the best valid candidate.
   * 
   * @param {Array<Object>} plan
   * @param {Object} channelStrategy
   * @param {number} targetCount
   * @param {Object} research
   * @returns {Array<Object>} Plan preserving exploration requirement
   */
  enforcePlanExplorationPolicy(plan, channelStrategy = {}, targetCount = 1, research = {}) {
    if (!Array.isArray(plan) || plan.length === 0) return plan;
    if (targetCount < 2) return plan;

    // 1. Check if at least one candidate in plan is already novel to the channel
    const hasNovelTopic = plan.some(item =>
      this.topicPerformanceScorer.isNovelTopic(item.topic, this.historicalKeywords)
    );

    if (hasNovelTopic) {
      this.logger.info('Exploration requirement satisfied: plan contains at least one novel topic');
      return plan;
    }

    this.logger.info('No novel topics in current autonomous plan; seeking valid exploration candidate...');

    // 2. Prepare exclusion list and validation checks
    const recentTopics = Array.isArray(research?.recentTopics) ? research.recentTopics : [];
    const banned = [
      ...(Array.isArray(channelStrategy?.bannedTopics) ? channelStrategy.bannedTopics : []),
      ...(typeof channelStrategy?.banned_topics === 'string'
        ? JSON.parse(channelStrategy.banned_topics || '[]')
        : Array.isArray(channelStrategy?.banned_topics) ? channelStrategy.banned_topics : [])
    ].map(t => String(t).trim().toLowerCase()).filter(Boolean);

    const isBanned = (topicText) => {
      const lower = topicText.toLowerCase();
      return banned.some(b => b && lower.includes(b));
    };

    const isValidFormat = (topicText) => {
      if (!topicText || typeof topicText !== 'string') return false;
      const trimmed = topicText.trim();
      return trimmed.length >= 8 && trimmed.includes(' ');
    };

    const pillars = Array.isArray(channelStrategy?.contentPillars) ? channelStrategy.contentPillars : [];
    const allowedSourceUrls = new Set((research?.sourceCatalog || []).map(s => s.url));

    // Candidates to keep: all except the last item (lowest priority slot)
    const keptTopics = plan.slice(0, plan.length - 1).map(p => p.topic);
    const exclusionList = [...recentTopics, ...keptTopics];

    // Build candidate pool for exploration:
    // Pool 1: Unused research signals
    const planTopicSet = new Set(plan.map(p => String(p.topic).trim().toLowerCase()));
    const signals = Array.isArray(research?.signals) ? research.signals : [];
    const novelSignals = signals.filter(sig => {
      const topicText = typeof sig === 'string' ? sig : sig?.topic;
      return topicText && !planTopicSet.has(topicText.trim().toLowerCase());
    });

    // Pool 2: Evergreen fallback topics
    const evergreen = this.getEvergreenFallbackTopics();

    const candidatePool = [
      ...novelSignals.map(sig => ({
        topic: typeof sig === 'string' ? sig : sig.topic,
        sourceUrls: (sig.evidence || []).map(e => e?.url).filter(url => allowedSourceUrls.has(url)),
        tier: 'signals'
      })),
      ...evergreen.map(topic => ({
        topic,
        sourceUrls: [],
        tier: 'evergreen'
      }))
    ];

    let chosenNovelCandidate = null;
    for (const cand of candidatePool) {
      if (!cand.topic || !isValidFormat(cand.topic)) continue;
      const trimmedTopic = cand.topic.trim();

      // Must be genuinely novel to own-channel keyword performance history
      if (!this.topicPerformanceScorer.isNovelTopic(trimmedTopic, this.historicalKeywords)) {
        continue;
      }

      // Must not be banned
      if (isBanned(trimmedTopic)) continue;

      // Must not be in exclusion list (exact match)
      if (exclusionList.some(ex => ex.toLowerCase() === trimmedTopic.toLowerCase())) continue;

      // Must pass semantic deduplication
      if (this.semanticDedupService) {
        const dedupResult = this.semanticDedupService.isDuplicate(trimmedTopic, exclusionList);
        if (dedupResult?.isDuplicate) continue;
      }

      // Valid novel candidate found!
      const lowerTopic = trimmedTopic.toLowerCase();
      const matchedPillar = pillars.find(p => lowerTopic.includes(String(p).toLowerCase())) || pillars[0] || '';
      chosenNovelCandidate = {
        topic: trimmedTopic,
        pillar: matchedPillar,
        angle: `${trimmedTopic} through the lens of ${channelStrategy?.value_proposition || channelStrategy?.objective || 'practical guidance'}`,
        rationale: `Selected as autonomous exploration candidate to evaluate novel topic space without historical performance bias (${cand.tier}).`,
        format: channelStrategy?.default_format || 'explainer',
        length: channelStrategy?.default_length || 'medium',
        sourceUrls: cand.sourceUrls,
        isExploration: true,
        performanceMultiplier: 1.0
      };
      break;
    }

    if (chosenNovelCandidate) {
      this.logger.info(`Exploration policy replaced slot ${plan.length} with novel topic "${chosenNovelCandidate.topic}"`);
      const updatedPlan = [...plan];
      updatedPlan[updatedPlan.length - 1] = chosenNovelCandidate;
      return updatedPlan;
    }

    this.logger.warn('No valid novel candidate found for exploration requirement; continuing with best valid candidates');
    return plan;
  }

  selectFallbackCandidate(channelStrategy = {}, research = {}, excludedTopics = []) {
    const excludedList = [];
    const addExcluded = (item) => {
      if (!item) return;
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) excludedList.push(trimmed);
      } else if (typeof item === 'object') {
        const t = item.topic || item.title;
        if (t && typeof t === 'string' && t.trim()) excludedList.push(t.trim());
      }
    };

    // 1. 90-day historical content
    if (Array.isArray(research?.recentTopics)) {
      research.recentTopics.forEach(addExcluded);
    }

    // 2. Current plan topics
    if (Array.isArray(research?.plan)) {
      research.plan.forEach(addExcluded);
    }

    // 3. Topics already attempted in this run
    if (Array.isArray(excludedTopics)) {
      excludedTopics.forEach(addExcluded);
    } else if (excludedTopics) {
      addExcluded(excludedTopics);
    }

    // 4. Channel banned topics and constraints
    const banned = [
      ...(Array.isArray(channelStrategy?.bannedTopics) ? channelStrategy.bannedTopics : []),
      ...(typeof channelStrategy?.banned_topics === 'string'
        ? JSON.parse(channelStrategy.banned_topics || '[]')
        : Array.isArray(channelStrategy?.banned_topics) ? channelStrategy.banned_topics : [])
    ].map(t => String(t).trim().toLowerCase()).filter(Boolean);

    const isBanned = (topicText) => {
      const lower = topicText.toLowerCase();
      for (const b of banned) {
        if (b && lower.includes(b)) return true;
      }
      return false;
    };

    const isValidFormat = (topicText) => {
      if (!topicText || typeof topicText !== 'string') return false;
      const trimmed = topicText.trim();
      return trimmed.length >= 8 && trimmed.includes(' ');
    };

    const pillars = Array.isArray(channelStrategy?.contentPillars) ? channelStrategy.contentPillars : [];
    const allowedSourceUrls = new Set((research?.sourceCatalog || []).map(s => s.url));

    const checkCandidate = (candTopic, sourceUrls = [], rationale = '', tier = 'signals') => {
      if (!isValidFormat(candTopic)) return null;

      const trimmedCand = candTopic.trim();
      const lowerCand = trimmedCand.toLowerCase();

      // Check exact duplicate against excluded list
      if (excludedList.some(ex => ex.toLowerCase() === lowerCand)) return null;

      // Check banned topics
      if (isBanned(trimmedCand)) return null;

      // Check Semantic Deduplication
      if (this.semanticDedupService) {
        const dedupResult = this.semanticDedupService.isDuplicate(trimmedCand, excludedList);
        if (dedupResult?.isDuplicate) return null;
      }

      const matchedPillar = pillars.find(p => lowerCand.includes(String(p).toLowerCase())) || pillars[0] || '';
      const validSourceUrls = sourceUrls.filter(url => allowedSourceUrls.has(url));

      return {
        topic: trimmedCand,
        pillar: matchedPillar,
        angle: `${trimmedCand} through the lens of ${channelStrategy?.value_proposition || channelStrategy?.objective || 'practical guidance'}`,
        rationale: rationale || (tier === 'signals'
          ? 'Matches an unused research signal and selected as dynamic fallback topic.'
          : 'Selected from vetted evergreen topics as dynamic fallback when research signals were exhausted.'),
        format: channelStrategy?.default_format || 'explainer',
        length: channelStrategy?.default_length || 'medium',
        sourceUrls: validSourceUrls,
        tier
      };
    };

    // TIER 1: Unused candidates from current run's research.signals
    const signals = Array.isArray(research?.signals) ? research.signals : [];
    for (const signal of signals) {
      const sigTopic = typeof signal === 'string' ? signal : signal?.topic;
      if (!sigTopic) continue;
      const evidenceUrls = (signal.evidence || []).map(e => e?.url).filter(Boolean);
      const result = checkCandidate(
        sigTopic,
        evidenceUrls,
        `Matches research signal "${sigTopic}" with verified evidence.`,
        'signals'
      );
      if (result) return result;
    }

    // TIER 2: Deterministic evergreen fallback topics
    const evergreen = this.getEvergreenFallbackTopics();
    for (const egTopic of evergreen) {
      const result = checkCandidate(
        egTopic,
        [],
        'Selected from vetted evergreen topics as dynamic fallback when research signals were exhausted.',
        'evergreen'
      );
      if (result) return result;
    }

    return null;
  }

  normalizeAutonomousPlan(plan, channelStrategy, targetCount, research = {}) {
    const formats = new Set(['explainer', 'tutorial', 'list', 'review', 'story']);
    const lengths = new Set(['short', 'medium', 'long']);
    const allowedSourceUrls = new Set((research.sourceCatalog || []).map(source => source.url));
    const pillars = channelStrategy.contentPillars || [];
    const seen = new Set();
    return plan
      .map(item => ({
        topic: String(item.topic || '').trim().slice(0, 200),
        pillar: pillars.find(pillar => String(pillar).toLowerCase() === String(item.pillar || '').trim().toLowerCase()) || '',
        angle: String(item.angle || '').trim().slice(0, 500),
        rationale: String(item.rationale || '').trim().slice(0, 1000),
        format: formats.has(String(item.format || '').toLowerCase())
          ? String(item.format).toLowerCase()
          : channelStrategy.default_format,
        length: lengths.has(String(item.length || '').toLowerCase())
          ? String(item.length).toLowerCase()
          : channelStrategy.default_length,
        sourceUrls: [...new Set((Array.isArray(item.sourceUrls) ? item.sourceUrls : [])
          .map(url => String(url))
          .filter(url => allowedSourceUrls.has(url)))]
      }))
      .filter(item => {
        const key = item.topic.toLowerCase();
        if (!item.topic || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, targetCount);
  }

  async generateContentStrategyWithAI(requestedTopic = null) {
    if (!this.aiTextService.isAvailable()) {
      this.logger.info('Using template content strategy generation because no AI text provider is configured');
      return null;
    }

    const trendingTopics = this.trendingTopics
      .slice(0, 10)
      .map(topic => topic.topic)
      .join(', ');
    const prompt = `You are selecting a YouTube content strategy.
Return only valid JSON with this exact shape:
{
  "topic": "specific video topic",
  "angle": "distinct content angle",
  "targetAudience": "specific audience",
  "contentType": "Tutorial|Explainer|List|Review|Story|News",
  "keywords": ["keyword"]
}

Requested topic: ${requestedTopic || 'none'}
Trending topics available: ${trendingTopics || 'Technology Trends'}
Channel target audience: ${process.env.TARGET_AUDIENCE || 'General audience interested in educational content'}
Avoid fabricated claims and unsupported numbers.`;

    try {
      const response = await this.aiTextService.generateText(prompt, {
        maxTokens: 1000,
        temperature: 0.7
      });
      const parsed = this.parseAIJsonResponse(response);
      const topic = String(parsed.topic || requestedTopic || '').trim();

      if (!topic) {
        throw new Error('AI strategy response missing topic');
      }

      const contentType = this.normalizeContentType(parsed.contentType, topic);
      const keywords = Array.isArray(parsed.keywords) && parsed.keywords.length > 0
        ? parsed.keywords.map(keyword => String(keyword).trim()).filter(Boolean)
        : this.extractKeywords(topic);

      this.logger.info(`Using AI content strategy via ${this.aiTextService.providerName}`);
      return {
        topic,
        angle: String(parsed.angle || await this.generateAngle(topic)).trim(),
        targetAudience: String(parsed.targetAudience || await this.identifyTargetAudience(topic)).trim(),
        contentType,
        keywords,
        estimatedViews: this.predictViews(topic),
        bestPublishTime: this.calculateBestPublishTime(),
        competitorAnalysis: this.getCompetitorInsights(topic),
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.warn(`AI content strategy failed; using template fallback: ${error.message}`);
      return null;
    }
  }

  parseAIJsonResponse(response) {
    const text = String(response || '').trim();
    const withoutFences = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      return JSON.parse(withoutFences);
    } catch (error) {
      const match = withoutFences.match(/\{[\s\S]*\}/);
      if (!match) {
        throw error;
      }
      return JSON.parse(match[0]);
    }
  }

  normalizeContentType(contentType, topic) {
    const allowed = new Set(['Tutorial', 'Explainer', 'List', 'Review', 'Story', 'News']);
    const normalized = String(contentType || '').trim();
    const titleCased = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();

    return allowed.has(titleCased) ? titleCased : this.selectContentType(topic);
  }
  selectOptimalTopic() {
    // Use scoring algorithm to select best topic
    const recentTopics = this.getRecentTopics();

    // Semantic deduplication against recent topic history
    const { unique: dedupedTopics } = this.semanticDedupService.filterDuplicates(
      this.trendingTopics,
      recentTopics
    );

    // Fallback safety: ensure exact lexical matches are also excluded
    const scoredTopics = dedupedTopics
      .filter(topic => !recentTopics.includes(topic.topic))
      .map(topic => {
        const perfMultiplier = topic.performanceMultiplier !== undefined
          ? topic.performanceMultiplier
          : (this.topicPerformanceScorer
              ? this.topicPerformanceScorer.scoreTopic(topic.topic, this.historicalKeywords, this.channelBaseline).multiplier
              : 1.0);
        return {
          ...topic,
          performanceMultiplier: perfMultiplier,
          finalScore: topic.score * this.getSeasonalMultiplier(topic.topic) * this.getAudienceMultiplier(topic.topic) * perfMultiplier
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore);

    // Single keywords scraped from trending titles ("crown", "official") make
    // meaningless video topics — only use a trend that reads like a real subject.
    const readable = scoredTopics.find(t => t.topic.trim().includes(' ') && t.topic.trim().length >= 8);
    if (readable) {
      return readable;
    }

    const fallbackTopics = this.getEvergreenFallbackTopics();
    const { unique: dedupedFallbacks } = this.semanticDedupService.filterDuplicates(
      fallbackTopics,
      recentTopics
    );
    const pool = dedupedFallbacks.length > 0 ? dedupedFallbacks : fallbackTopics;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.logger.info(`Template mode: no readable trending topic available — using evergreen topic "${pick}"`);
    return { topic: pick, score: 1 };
  }

  getEvergreenFallbackTopics() {
    return [
      'Time Management Strategies That Actually Work',
      'Beginner Mistakes to Avoid When Learning a New Skill',
      'How to Start a Side Project With Zero Budget',
      'Simple Habits That Improve Focus and Productivity',
      'How to Learn Anything Faster Using Proven Study Techniques',
      'Practical Ways to Save Money Every Month',
      'How Artificial Intelligence Is Changing Everyday Life',
      'The Science of Building Habits That Stick',
      'How to Give a Presentation People Actually Remember',
      'Getting Started With Investing: A Beginner Roadmap',
      'Digital Minimalism: Reclaiming Your Attention',
      'How to Negotiate Anything: Tactics That Work',
      'The Psychology of Procrastination and How to Beat It',
      'Remote Work Productivity: Setting Up for Success',
      'How to Read More Books Without Finding Extra Time'
    ];
  }

  async generateAngle(topic) {
    // Generate unique angle for the topic
    const angles = [
      `The Ultimate Guide to ${topic}`,
      `${topic}: What Nobody Is Telling You`,
      `How ${topic} Will Change Everything in ${new Date().getFullYear()}`,
      `The Hidden Truth About ${topic}`,
      `${topic} Explained in 5 Minutes`,
      `Why ${topic} Is More Important Than You Think`,
      `${topic}: Expert Secrets Revealed`,
      `The Complete ${topic} Tutorial for Beginners`
    ];

    return angles[Math.floor(Math.random() * angles.length)];
  }

  async identifyTargetAudience(topic) {
    // Simplified audience identification
    const audiences = {
      tech: 'Tech enthusiasts, developers, early adopters',
      business: 'Entrepreneurs, business owners, professionals',
      education: 'Students, educators, lifelong learners',
      entertainment: 'General audience, entertainment seekers',
      lifestyle: 'Lifestyle enthusiasts, self-improvement seekers'
    };

    const category = this.categorize(topic);
    return audiences[category] || audiences.entertainment;
  }

  categorize(topic) {
    const categories = {
      tech: ['technology', 'software', 'app', 'ai', 'code', 'programming', 'crypto', 'blockchain'],
      business: ['business', 'money', 'finance', 'startup', 'entrepreneur', 'marketing'],
      education: ['learn', 'tutorial', 'how to', 'guide', 'course', 'study'],
      lifestyle: ['life', 'health', 'fitness', 'food', 'travel', 'fashion']
    };

    const topicLower = topic.toLowerCase();
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => topicLower.includes(keyword))) {
        return category;
      }
    }

    return 'entertainment';
  }

  selectContentType(topic) {
    const types = [
      { type: 'Tutorial', suitableFor: ['how to', 'guide', 'learn'] },
      { type: 'List', suitableFor: ['best', 'top', 'worst'] },
      { type: 'Review', suitableFor: ['review', 'vs', 'comparison'] },
      { type: 'Explainer', suitableFor: ['what is', 'why', 'explained'] },
      { type: 'News', suitableFor: ['breaking', 'latest', 'new'] },
      { type: 'Story', suitableFor: ['story', 'journey', 'experience'] }
    ];

    const topicLower = topic.toLowerCase();
    
    for (const contentType of types) {
      if (contentType.suitableFor.some(keyword => topicLower.includes(keyword))) {
        return contentType.type;
      }
    }

    return 'Explainer';
  }

  predictViews(topic) {
    // Simplified view prediction based on topic score
    const topicData = this.trendingTopics.find(t => t.topic === topic);
    const baseViews = topicData ? topicData.score * 10000 : 5000;
    const variance = baseViews * 0.3;
    return Math.floor(baseViews + (Math.random() * variance * 2) - variance);
  }

  calculateBestPublishTime() {
    // Analyze best publishing times
    const bestTimes = [
      { day: 'Tuesday', hour: 14 },
      { day: 'Wednesday', hour: 14 },
      { day: 'Thursday', hour: 14 },
      { day: 'Friday', hour: 15 },
      { day: 'Saturday', hour: 10 },
      { day: 'Sunday', hour: 10 }
    ];

    const selected = bestTimes[Math.floor(Math.random() * bestTimes.length)];
    const nextDate = this.getNextWeekday(selected.day);
    nextDate.setHours(selected.hour, 0, 0, 0);
    
    return nextDate.toISOString();
  }

  getNextWeekday(dayName) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDay = days.indexOf(dayName);
    const today = new Date();
    const currentDay = today.getDay();
    const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntilTarget);
    return nextDate;
  }

  getCompetitorInsights(topic) {
    // Get insights from competitor analysis
    return this.competitorData
      .filter(competitor => 
        competitor.topPerformingTopics.some(t => 
          t.topic.toLowerCase().includes(topic.toLowerCase())
        )
      )
      .map(competitor => ({
        channelId: competitor.channelId,
        averageViews: competitor.averageViews,
        relevantVideos: competitor.topPerformingTopics.filter(t => 
          t.topic.toLowerCase().includes(topic.toLowerCase())
        )
      }));
  }

  getRecentTopics() {
    // Get topics used in last 7 days to avoid repetition
    return this.historicalPerformance
      .filter(content => {
        const contentDate = new Date(content.createdAt);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return contentDate > weekAgo;
      })
      .map(content => content.topic);
  }

  getSeasonalMultiplier(topic) {
    // Adjust score based on seasonal relevance
    const month = new Date().getMonth();
    const seasonalTopics = {
      winter: ['christmas', 'holiday', 'new year', 'winter'],
      spring: ['spring', 'easter', 'garden'],
      summer: ['summer', 'vacation', 'beach', 'travel'],
      fall: ['halloween', 'thanksgiving', 'autumn', 'back to school']
    };

    const season = month < 3 ? 'winter' : month < 6 ? 'spring' : month < 9 ? 'summer' : 'fall';
    const topicLower = topic.toLowerCase();
    
    if (seasonalTopics[season].some(keyword => topicLower.includes(keyword))) {
      return 1.5;
    }
    
    return 1.0;
  }

  getAudienceMultiplier(topic) {
    // Adjust score based on target audience size
    const category = this.categorize(topic);
    const multipliers = {
      tech: 1.2,
      business: 1.1,
      education: 1.0,
      entertainment: 1.3,
      lifestyle: 1.15
    };
    
    return multipliers[category] || 1.0;
  }
}

module.exports = { ContentStrategyAgent };
