/**
 * Trending Topic Discovery Service
 * 
 * Modular service responsible for YouTube Data API v3 trend discovery,
 * competitor channel topic analysis, keyword extraction, view velocity
 * calculations, and opportunity scoring.
 * 
 * Designed to feed candidate topic signals into SemanticDedupService
 * and ContentStrategyAgent.
 * 
 * IMPORTANT: Topic signals discovered by this service represent audience
 * search and view trends, NOT verified financial facts. Downstream
 * verification via ProvenanceService is required prior to publication.
 */

const { Logger } = require('./logger');

/**
 * Topic Performance Scorer (Milestone A5.1)
 * 
 * Deterministically scores candidate topics by matching their keywords against
 * own-channel historical keyword performance in SQLite (`keyword_performance` table).
 * 
 * Compares candidate performance against the channel baseline:
 * - High performance (>120% of baseline): applies positive boost (up to 1.25x).
 * - Low performance (<50% of baseline): applies penalty (down to 0.75x).
 * - Neutral / unknown (no history): neutral multiplier (1.0x).
 * 
 * Multiplier is strictly bounded in [0.75, 1.25].
 * 
 * IMPORTANT SAFETY BOUNDARY:
 * Topic performance scores are strategy and ranking signals ONLY.
 * They MUST NOT:
 * - certify factual claims
 * - certify financial numbers
 * - replace Truth Anchor or ProvenanceService
 * - bypass content review or quality gates
 */
class TopicPerformanceScorer {
  constructor(options = {}) {
    this.highThreshold = options.highThreshold ?? 1.20; // >120% baseline
    this.lowThreshold = options.lowThreshold ?? 0.50;   // <50% baseline
    this.minMultiplier = options.minMultiplier ?? 0.75;
    this.maxMultiplier = options.maxMultiplier ?? 1.25;
    this.neutralMultiplier = 1.0;
  }

  /**
   * Extracts keywords from text using standard stopword filtering.
   */
  extractKeywords(text) {
    if (!text || typeof text !== 'string') return [];
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'as', 'are', 'was', 'were',
      'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'i', 'you', 'he', 'she', 'it',
      'we', 'they', 'what', 'who', 'when', 'where', 'why', 'how', 'all', 'each',
      'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
      'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'now', 'this', 'that'
    ]);
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
  }

  /**
   * Computes the channel baseline average views per keyword use.
   * @param {Array<Object>} keywordRows
   * @returns {number} Channel baseline average views
   */
  calculateChannelBaseline(keywordRows = []) {
    if (!Array.isArray(keywordRows) || keywordRows.length === 0) return 0;
    const valid = keywordRows.filter(r => r && (Number(r.average_views || r.averageViews) > 0 || Number(r.total_views || r.totalViews) > 0));
    if (valid.length === 0) return 0;

    const totalViews = valid.reduce((sum, r) => sum + (Number(r.total_views || r.totalViews) || Number(r.average_views || r.averageViews) || 0), 0);
    const totalUses = valid.reduce((sum, r) => sum + Math.max(1, Number(r.total_uses || r.totalUses) || 1), 0);
    return totalUses > 0 ? Math.round(totalViews / totalUses) : 0;
  }

  /**
   * Normalizes keyword rows or map into a Map for fast lookup.
   */
  buildKeywordMap(keywordData) {
    if (keywordData instanceof Map) return keywordData;
    const map = new Map();
    if (!Array.isArray(keywordData)) return map;
    for (const row of keywordData) {
      if (!row || !row.keyword) continue;
      const key = String(row.keyword).toLowerCase().trim();
      map.set(key, {
        keyword: key,
        totalUses: Number(row.total_uses || row.totalUses || 1),
        totalViews: Number(row.total_views || row.totalViews || row.average_views || row.averageViews || 0),
        averageViews: Number(row.average_views || row.averageViews || 0),
        performanceScore: Number(row.performance_score || row.performanceScore || 0)
      });
    }
    return map;
  }

  /**
   * Calculates the bounded performance multiplier.
   * @param {number} matchedAverage
   * @param {number} baseline
   * @returns {{ multiplier: number, ratio: number, tier: string }}
   */
  calculateMultiplier(matchedAverage, baseline) {
    if (!baseline || baseline <= 0 || !matchedAverage || matchedAverage <= 0) {
      return { multiplier: this.neutralMultiplier, ratio: 1.0, tier: 'neutral' };
    }
    const ratio = matchedAverage / baseline;
    if (ratio > this.highThreshold) {
      // High performance: > 120% baseline (boost between 1.05 and 1.25)
      const boost = 0.05 + Math.min(0.20, ((ratio - this.highThreshold) / 0.80) * 0.20);
      const multiplier = Number(Math.min(this.maxMultiplier, this.neutralMultiplier + boost).toFixed(3));
      return { multiplier, ratio: Number(ratio.toFixed(3)), tier: 'high_performing' };
    }
    if (ratio < this.lowThreshold) {
      // Low performance: < 50% baseline (penalty between 0.75 and 0.95)
      const penalty = 0.05 + Math.min(0.20, ((this.lowThreshold - ratio) / this.lowThreshold) * 0.20);
      const multiplier = Number(Math.max(this.minMultiplier, this.neutralMultiplier - penalty).toFixed(3));
      return { multiplier, ratio: Number(ratio.toFixed(3)), tier: 'low_performing' };
    }
    return { multiplier: this.neutralMultiplier, ratio: Number(ratio.toFixed(3)), tier: 'neutral' };
  }

  /**
   * Scores a topic against historical keyword performance.
   * @param {string|Object} topic
   * @param {Map|Array} keywordData
   * @param {number} [baseline]
   * @returns {Object} Deterministic scoring result
   */
  scoreTopic(topic, keywordData, baseline = null) {
    const topicText = typeof topic === 'string' ? topic : topic?.topic || '';
    const keywords = this.extractKeywords(topicText);
    const keywordMap = this.buildKeywordMap(keywordData);

    const base = baseline !== null && baseline !== undefined && baseline > 0
      ? baseline
      : this.calculateChannelBaseline(Array.from(keywordMap.values()));

    const matched = [];
    for (const kw of keywords) {
      const match = keywordMap.get(kw);
      if (match && (match.averageViews > 0 || match.totalViews > 0)) {
        matched.push(match);
      }
    }

    if (matched.length === 0) {
      return {
        topic: topicText,
        isNovel: true,
        matchedKeywords: [],
        matchedAverageViews: 0,
        channelBaselineViews: base,
        performanceRatio: 1.0,
        multiplier: this.neutralMultiplier,
        tier: 'novel',
        isTruthAnchorVerified: false,
        isStrategySignalOnly: true
      };
    }

    // Deterministic arithmetic aggregation of matched keyword average views
    const sumViews = matched.reduce((acc, m) => acc + m.averageViews, 0);
    const matchedAverageViews = Math.round(sumViews / matched.length);
    const { multiplier, ratio, tier } = this.calculateMultiplier(matchedAverageViews, base);

    return {
      topic: topicText,
      isNovel: false,
      matchedKeywords: matched.map(m => m.keyword),
      matchedAverageViews,
      channelBaselineViews: base,
      performanceRatio: ratio,
      multiplier,
      tier,
      isTruthAnchorVerified: false,
      isStrategySignalOnly: true
    };
  }

  /**
   * Enriches an array of candidates with own-channel performance signals.
   */
  enrichCandidates(candidates = [], keywordData = [], baseline = null) {
    if (!Array.isArray(candidates)) return [];
    const keywordMap = this.buildKeywordMap(keywordData);
    const base = baseline !== null && baseline !== undefined && baseline > 0
      ? baseline
      : this.calculateChannelBaseline(Array.from(keywordMap.values()));

    return candidates.map(candidate => {
      const perf = this.scoreTopic(candidate.topic, keywordMap, base);
      const rawOppScore = candidate.opportunityScore !== undefined
        ? candidate.opportunityScore
        : 50;
      const rawScore = candidate.score !== undefined
        ? candidate.score
        : 1.0;

      const adjustedOpp = Math.min(100, Math.max(1, Math.round(rawOppScore * perf.multiplier)));
      const adjustedScore = Number((rawScore * perf.multiplier).toFixed(4));

      return {
        ...candidate,
        opportunityScore: adjustedOpp,
        rawOpportunityScore: rawOppScore,
        score: adjustedScore,
        rawScore,
        performanceMultiplier: perf.multiplier,
        performanceSignal: perf,
        isTruthAnchorVerified: false,
        provenanceStatus: 'UNVERIFIED_TREND_SIGNAL'
      };
    }).sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  /**
   * Determines if a topic is genuinely novel to the channel's performance history.
   * A topic is novel if none of its extracted keywords have recorded views in history.
   * @param {string|Object} topic
   * @param {Map|Array} keywordData
   * @returns {boolean}
   */
  isNovelTopic(topic, keywordData) {
    const topicText = typeof topic === 'string' ? topic : topic?.topic || '';
    const keywords = this.extractKeywords(topicText);
    const keywordMap = this.buildKeywordMap(keywordData);
    for (const kw of keywords) {
      const match = keywordMap.get(kw);
      if (match && (match.averageViews > 0 || match.totalViews > 0)) {
        return false;
      }
    }
    return true;
  }
}

class TrendingTopicDiscovery {
  /**
   * @param {Object} [credentials] - Credential manager or provider with getYouTubeClient()
   * @param {Object} [options]
   * @param {string} [options.regionCode='US'] - Default YouTube region
   * @param {number} [options.maxTrendingResults=50] - Number of trending videos to query
   * @param {number} [options.competitorMaxResults=20] - Number of competitor videos to query
   * @param {string[]} [options.competitorChannels] - Optional override for competitor channel IDs
   */
  constructor(credentials = {}, options = {}) {
    this.credentials = credentials;
    this.logger = new Logger('TrendingTopicDiscovery');
    this.regionCode = options.regionCode || process.env.YOUTUBE_REGION || 'US';
    this.maxTrendingResults = options.maxTrendingResults || 50;
    this.competitorMaxResults = options.competitorMaxResults || 20;
    this.competitorChannels = options.competitorChannels || null;
    this.topicPerformanceScorer = options.topicPerformanceScorer || new TopicPerformanceScorer(options.topicScorerOptions || {});
  }

  /**
   * Discovers trending topics by fetching YouTube trends, analyzing competitors,
   * and merging them into ranked, scored candidate topic signals.
   * 
   * @param {Object} [options={}]
   * @returns {Promise<{ trendingTopics: Array, competitorData: Array, rawTrends: Array, discoveredAt: string }>}
   */
  async discoverTrendingTopics(options = {}) {
    try {
      this.logger.info('Starting trending topic discovery cycle...');
      
      const rawTrends = await this.fetchYouTubeTrends(options);
      const competitorData = await this.fetchCompetitorTopics(options);
      const trendingTopics = this.mergeTrendData(rawTrends, competitorData, options);

      this.logger.info(`Discovered ${trendingTopics.length} trending topic candidates`);

      return {
        trendingTopics,
        competitorData,
        rawTrends,
        discoveredAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to complete trending topic discovery:', error);
      return {
        trendingTopics: [],
        competitorData: [],
        rawTrends: [],
        discoveredAt: new Date().toISOString()
      };
    }
  }

  /**
   * Queries YouTube Data API v3 for most popular/trending videos.
   * 
   * @param {Object} [options={}]
   * @returns {Promise<Array>} Normalized video objects
   */
  async fetchYouTubeTrends(options = {}) {
    const youtube = this._getYouTubeClient();
    if (!youtube || !youtube.videos || typeof youtube.videos.list !== 'function') {
      this.logger.warn('YouTube client unavailable or unconfigured; returning empty trends');
      return [];
    }

    try {
      const response = await youtube.videos.list({
        part: 'snippet,statistics',
        chart: 'mostPopular',
        maxResults: options.maxResults || this.maxTrendingResults,
        regionCode: options.regionCode || this.regionCode,
        ...(options.videoCategoryId ? { videoCategoryId: options.videoCategoryId } : {})
      });

      const items = response?.data?.items || [];
      return items.map(video => {
        const viewCount = parseInt(video.statistics?.viewCount, 10) || 0;
        const publishedAt = video.snippet?.publishedAt || new Date().toISOString();
        const velocity = this.calculateVelocity({ viewCount, publishedAt });

        return {
          videoId: video.id,
          title: video.snippet?.title || '',
          tags: video.snippet?.tags || [],
          viewCount,
          category: video.snippet?.categoryId || '',
          publishedAt,
          publisher: video.snippet?.channelTitle || 'YouTube',
          url: `https://www.youtube.com/watch?v=${video.id}`,
          velocity
        };
      });
    } catch (error) {
      this.logger.error('Failed to fetch YouTube trends:', error);
      return [];
    }
  }

  /**
   * Queries competitor channels and aggregates their top performing topics.
   * 
   * @param {Object} [options={}]
   * @returns {Promise<Array>} Competitor analysis records
   */
  async fetchCompetitorTopics(options = {}) {
    const channelList = options.competitorChannels || 
      this.competitorChannels || 
      (process.env.COMPETITOR_CHANNELS || '').split(',').map(c => c.trim()).filter(Boolean);

    if (channelList.length === 0) {
      return [];
    }

    const competitorData = [];

    for (const channelId of channelList) {
      if (!channelId) continue;

      try {
        const videos = await this.getChannelVideos(channelId, options);
        const analysis = this.analyzeVideoPerformance(videos);
        competitorData.push({
          channelId,
          topPerformingTopics: analysis.topTopics,
          averageViews: analysis.avgViews,
          uploadFrequency: analysis.frequency
        });
      } catch (error) {
        this.logger.error(`Failed to analyze competitor channel ${channelId}:`, error);
      }
    }

    return competitorData;
  }

  /**
   * Fetches recent videos for a specific YouTube channel.
   * 
   * @param {string} channelId
   * @param {Object} [options={}]
   * @returns {Promise<Array>}
   */
  async getChannelVideos(channelId, options = {}) {
    const youtube = this._getYouTubeClient();
    if (!youtube || !youtube.search || !youtube.videos) {
      return [];
    }

    try {
      const response = await youtube.search.list({
        part: 'snippet',
        channelId,
        maxResults: options.maxResults || this.competitorMaxResults,
        order: 'date',
        type: 'video'
      });

      const items = response?.data?.items || [];
      const videoIds = items.map(item => item.id?.videoId).filter(Boolean).join(',');

      if (!videoIds) return [];

      const videoDetails = await youtube.videos.list({
        part: 'statistics,snippet',
        id: videoIds
      });

      return videoDetails?.data?.items || [];
    } catch (error) {
      this.logger.error(`Failed to fetch videos for channel ${channelId}:`, error);
      return [];
    }
  }

  /**
   * Analyzes competitor videos to identify recurring high-view keyword topics.
   * 
   * @param {Array} videos
   * @returns {{ topTopics: Array, avgViews: number, frequency: number }}
   */
  analyzeVideoPerformance(videos) {
    if (!Array.isArray(videos) || videos.length === 0) {
      return { topTopics: [], avgViews: 0, frequency: 0 };
    }

    const topics = {};
    let totalViews = 0;

    videos.forEach(video => {
      const title = String(video.snippet?.title || '').toLowerCase();
      const views = parseInt(video.statistics?.viewCount, 10) || 0;
      totalViews += views;

      const keywords = this.extractKeywords(title);
      keywords.forEach(keyword => {
        if (!topics[keyword]) {
          topics[keyword] = { count: 0, views: 0, evidence: [] };
        }
        topics[keyword].count++;
        topics[keyword].views += views;
        topics[keyword].evidence.push({
          url: `https://www.youtube.com/watch?v=${video.id}`,
          title: video.snippet?.title || '',
          publisher: video.snippet?.channelTitle || 'Configured competitor channel',
          publishedAt: video.snippet?.publishedAt || '',
          sourceType: 'video'
        });
      });
    });

    const topTopics = Object.entries(topics)
      .sort((a, b) => b[1].views - a[1].views)
      .slice(0, 10)
      .map(([topic, data]) => ({
        topic,
        avgViews: data.count > 0 ? Math.round(data.views / data.count) : 0,
        evidence: data.evidence.slice(0, 5)
      }));

    return {
      topTopics,
      avgViews: Math.round(totalViews / videos.length),
      frequency: videos.length
    };
  }

  /**
   * Extracts high-signal keywords from a title string, filtering punctuation and stop words.
   * 
   * @param {string} text
   * @returns {string[]}
   */
  extractKeywords(text) {
    if (!text || typeof text !== 'string') return [];

    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'as', 'are', 'was', 'were',
      'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'could', 'i', 'you', 'he', 'she', 'it',
      'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each',
      'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
      'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'now', 'this', 'that'
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
  }

  /**
   * Calculates views per hour since publication.
   * 
   * @param {Object} video
   * @param {number} video.viewCount
   * @param {string|Date} video.publishedAt
   * @param {Date} [now]
   * @returns {number} Views per hour (rounded to 1 decimal place)
   */
  calculateVelocity(video, now = new Date()) {
    const views = Number(video?.viewCount) || 0;
    if (views <= 0) return 0;

    const publishedDate = video?.publishedAt ? new Date(video.publishedAt) : now;
    const diffMs = Math.max(60000, now.getTime() - publishedDate.getTime());
    const diffHours = diffMs / (1000 * 60 * 60);

    return Number((views / Math.max(0.1, diffHours)).toFixed(1));
  }

  /**
   * Computes a deterministic 0-100 opportunity score for a topic candidate.
   * 
   * @param {number} rawScore - Normalized score from mergeTrendData
   * @param {number} [velocity=0] - Aggregated views/hour
   * @returns {number} 0-100 integer score
   */
  scoreOpportunity(rawScore, velocity = 0) {
    const baseScore = (rawScore || 0) * 10;
    const velocityBonus = Math.min(20, (velocity || 0) / 100);
    const total = baseScore + velocityBonus;
    return Math.min(100, Math.max(1, Math.round(total)));
  }

  /**
   * Categorizes a topic string into core channel genres.
   * 
   * @param {string} topic
   * @returns {'tech' | 'business' | 'education' | 'lifestyle' | 'entertainment'}
   */
  categorize(topic) {
    const categories = {
      tech: ['technology', 'software', 'app', 'ai', 'code', 'programming', 'crypto', 'blockchain', 'chip', 'semiconductor', 'datacenter', 'nvidia', 'intel', 'apple', 'mac', 'google', 'microsoft'],
      business: ['business', 'money', 'finance', 'startup', 'entrepreneur', 'marketing', 'revenue', 'profit', 'stock', 'investing', 'billion', 'sales', 'market', 'nvidia'],
      education: ['learn', 'tutorial', 'how to', 'guide', 'course', 'study', 'explained', 'science', 'facts'],
      lifestyle: ['life', 'health', 'fitness', 'food', 'travel', 'fashion', 'habit', 'productivity']
    };

    const topicLower = String(topic || '').toLowerCase();

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => topicLower.includes(keyword))) {
        return category;
      }
    }

    return 'entertainment';
  }

  /**
   * Merges trending videos and competitor top topics into consolidated, ranked topic candidates.
   * 
   * Preserves exact historical scoring normalization while adding velocity and Truth Anchor safety flags.
   * 
   * @param {Array} trends - Raw trending video objects
   * @param {Array} competitors - Competitor analysis items
   * @returns {Array} Top 50 ranked topic candidate objects
   */
  mergeTrendData(trends = [], competitors = [], options = {}) {
    const mergedTopics = new Map();

    // 1. Process YouTube Trending items
    (trends || []).forEach(trend => {
      const keywords = this.extractKeywords(trend.title);
      keywords.forEach(keyword => {
        if (!mergedTopics.has(keyword)) {
          mergedTopics.set(keyword, {
            score: 0,
            sources: [],
            evidence: [],
            totalViews: 0,
            videoCount: 0,
            velocities: []
          });
        }
        const topic = mergedTopics.get(keyword);
        topic.score += (trend.viewCount || 0) / 1000000; // Normalize by millions
        topic.totalViews += (trend.viewCount || 0);
        topic.videoCount++;
        if (trend.velocity) topic.velocities.push(trend.velocity);
        topic.sources.push('trending');
        topic.evidence.push({
          url: trend.url,
          title: trend.title,
          publisher: trend.publisher,
          publishedAt: trend.publishedAt,
          sourceType: 'video'
        });
      });
    });

    // 2. Process Competitor Channel items
    (competitors || []).forEach(competitor => {
      if (competitor.topPerformingTopics) {
        competitor.topPerformingTopics.forEach(({ topic, avgViews, evidence = [] }) => {
          if (!mergedTopics.has(topic)) {
            mergedTopics.set(topic, {
              score: 0,
              sources: [],
              evidence: [],
              totalViews: 0,
              videoCount: 0,
              velocities: []
            });
          }
          const topicData = mergedTopics.get(topic);
          topicData.score += (avgViews || 0) / 100000; // Normalize by 100k
          topicData.totalViews += (avgViews || 0);
          topicData.videoCount++;
          topicData.sources.push('competitor');
          topicData.evidence.push(...evidence);
        });
      }
    });

    // 3. Transform map into structured candidate topic signals
    const candidates = Array.from(mergedTopics.entries())
      .map(([topic, data]) => {
        const avgVelocity = data.velocities.length > 0
          ? Number((data.velocities.reduce((a, b) => a + b, 0) / data.velocities.length).toFixed(1))
          : 0;

        const deduplicatedEvidence = [...new Map(
          data.evidence.filter(s => s && s.url).map(s => [s.url, s])
        ).values()].slice(0, 5);

        return {
          topic,
          score: Number(data.score.toFixed(4)),
          opportunityScore: this.scoreOpportunity(data.score, avgVelocity),
          sources: [...new Set(data.sources)],
          evidence: deduplicatedEvidence,
          keywords: this.extractKeywords(topic),
          category: this.categorize(topic),
          velocity: avgVelocity,
          discoveredAt: new Date().toISOString(),
          // TRUTH ANCHOR BOUNDARY: Explicitly declare trend signals as unverified factual claims
          isTruthAnchorVerified: false,
          provenanceStatus: 'UNVERIFIED_TREND_SIGNAL'
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    const keywordData = options.keywordHistory || options.historicalKeywords || options.keywordData;
    if (keywordData && (Array.isArray(keywordData) || keywordData instanceof Map)) {
      return this.topicPerformanceScorer.enrichCandidates(candidates, keywordData, options.baseline);
    }

    return candidates;
  }

  /**
   * Scores a topic against historical keyword performance.
   * @param {string|Object} topic
   * @param {Map|Array} keywordData
   * @param {number} [baseline]
   * @returns {Object} Deterministic scoring result
   */
  scoreTopicPerformance(topic, keywordData, baseline = null) {
    return this.topicPerformanceScorer.scoreTopic(topic, keywordData, baseline);
  }

  /**
   * Enriches an array of topic candidates with own-channel performance signals.
   * @param {Array<Object>} candidates
   * @param {Map|Array} keywordData
   * @param {number} [baseline]
   * @returns {Array<Object>}
   */
  enrichWithOwnPerformance(candidates, keywordData, baseline = null) {
    return this.topicPerformanceScorer.enrichCandidates(candidates, keywordData, baseline);
  }

  /**
   * Calculates the bounded performance multiplier for a matched average and baseline.
   * @param {number} matchedAverage
   * @param {number} baseline
   * @returns {Object} Multiplier result { multiplier, ratio, tier }
   */
  calculateTopicPerformanceMultiplier(matchedAverage, baseline) {
    return this.topicPerformanceScorer.calculateMultiplier(matchedAverage, baseline);
  }

  /**
   * Safely retrieves the authenticated or mock YouTube API client.
   * @private
   */
  _getYouTubeClient() {
    if (this.credentials?.getYouTubeClient && typeof this.credentials.getYouTubeClient === 'function') {
      try {
        return this.credentials.getYouTubeClient();
      } catch (err) {
        this.logger.warn(`Error resolving YouTube client from credentials: ${err.message}`);
        return null;
      }
    }
    return this.credentials?.youtube || null;
  }
}

module.exports = {
  TrendingTopicDiscovery,
  TopicPerformanceScorer
};
