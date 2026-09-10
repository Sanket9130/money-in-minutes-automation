'use strict';

/**
 * Shorts Analytics Service
 *
 * Ingests, normalizes, and analyzes YouTube Shorts performance metrics.
 * Strictly distinguishes directly available API metrics, mathematically valid
 * derived metrics, and unavailable metrics (such as viewed-vs-swiped without
 * partner API access) to avoid data fabrication.
 */

const { Logger } = require('./logger');

class ShortsAnalyticsService {
  constructor(db, options = {}) {
    this.db = db;
    this.logger = new Logger('ShortsAnalytics');
    this.options = options;
  }

  /**
   * Normalizes raw API response data into direct, derived, and unavailable categories.
   *
   * @param {object} raw - Raw API response from YouTube Data API v3 and YouTube Analytics API v2
   * @param {object} context - Video metadata context (videoDetails, duration, publishDate)
   * @returns {object} Normalized metrics structure with clear availability taxonomy
   */
  normalizeShortsMetrics(raw = {}, context = {}) {
    const stats = raw.statistics || raw.metrics || raw;
    const details = context.videoDetails || context || {};

    const views = this.parseNumber(stats.views ?? stats.viewCount ?? stats.totalViews, 0);
    const likes = this.parseNumber(stats.likes ?? stats.likeCount, 0);
    const comments = this.parseNumber(stats.comments ?? stats.commentCount, 0);

    // Duration in seconds
    const durationSeconds = this.parseDurationSeconds(details.duration ?? context.durationSeconds ?? stats.videoDuration);

    // Watch time & retention
    const avgViewDuration = this.parseNumber(stats.averageViewDuration, null);
    let avgViewPercentage = this.parseNumber(stats.averageViewPercentage ?? stats.averagePercentageViewed, null);
    if (avgViewPercentage === null && avgViewDuration !== null && durationSeconds > 0) {
      avgViewPercentage = Math.min(100, Number(((avgViewDuration / durationSeconds) * 100).toFixed(1)));
    }

    const totalWatchMinutes = this.parseNumber(stats.totalWatchMinutes ?? stats.totalWatchTime, null);

    // Subscriber metrics
    const subscribersGained = stats.subscribersGained !== undefined ? this.parseNumber(stats.subscribersGained, 0) : null;
    const subscribersLost = stats.subscribersLost !== undefined ? this.parseNumber(stats.subscribersLost, 0) : null;
    const netSubscribers = (subscribersGained !== null && subscribersLost !== null)
      ? (subscribersGained - subscribersLost)
      : (stats.netSubscribers !== undefined ? this.parseNumber(stats.netSubscribers, null) : null);

    const publishedAt = details.publishedAt || context.publishedAt || stats.publishedAt || new Date().toISOString();
    const publishedDate = new Date(publishedAt);
    const hoursSincePublished = Math.max(1, (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
    const daysSincePublished = Math.max(0.1, hoursSincePublished / 24);

    // 1. DIRECT API METRICS
    const direct = {
      views,
      likes,
      comments,
      subscribersGained,
      subscribersLost,
      netSubscribers,
      averageViewDuration: avgViewDuration !== null ? Number(avgViewDuration.toFixed(2)) : null,
      averageViewPercentage: avgViewPercentage !== null ? Number(avgViewPercentage.toFixed(1)) : null,
      totalWatchMinutes: totalWatchMinutes !== null ? Number(totalWatchMinutes.toFixed(2)) : null,
      durationSeconds,
      publishedAt
    };

    // 2. MATHEMATICALLY VALID DERIVED METRICS
    const derived = {
      likeRate: views > 0 ? Number(((likes / views) * 100).toFixed(2)) : 0,
      commentRate: views > 0 ? Number(((comments / views) * 100).toFixed(2)) : 0,
      subscriberConversionRate: (views > 0 && netSubscribers !== null)
        ? Number(((netSubscribers / views) * 100).toFixed(3))
        : null,
      viewsPerHour: Number((views / hoursSincePublished).toFixed(2)),
      viewsPerDay: Number((views / daysSincePublished).toFixed(1)),
      retentionScore: avgViewPercentage !== null ? Math.min(100, Math.max(0, avgViewPercentage)) : null,
      performanceScore: this.calculatePerformanceScore({ views, likes, comments, avgViewPercentage, viewsPerDay: views / daysSincePublished })
    };

    // 3. UNAVAILABLE / RESTRICTED API METRICS
    // Standard YouTube Analytics API does not expose viewed-vs-swiped-away to non-partner public endpoints
    const unavailable = {
      viewedVsSwipedAway: {
        available: false,
        value: null,
        reason: 'Restricted metric: only available in select partner reporting beta'
      },
      shortsFeedCTR: {
        available: false,
        value: null,
        reason: 'Shorts feed impressions and CTR are aggregated at channel level, not per short'
      },
      trafficSourcesBreakdown: {
        available: Boolean(stats.trafficSources && Object.keys(stats.trafficSources).length > 0),
        value: stats.trafficSources || null,
        reason: stats.trafficSources ? null : 'Traffic sources unavailable for this reporting interval'
      }
    };

    return {
      direct,
      derived,
      unavailable,
      capturedAt: new Date().toISOString()
    };
  }

  /**
   * Calculates a balanced performance score for Shorts (0 to 100).
   */
  calculatePerformanceScore(metrics = {}) {
    let score = 0;

    // Retention weight: 50% (most critical metric for Shorts distribution)
    const retention = metrics.avgViewPercentage ?? metrics.retentionScore ?? 0;
    if (retention >= 85) score += 50;
    else if (retention >= 70) score += 40;
    else if (retention >= 50) score += 30;
    else if (retention >= 30) score += 15;

    // Engagement weight (like + comment rate): 25%
    const likeRate = metrics.likeRate ?? (metrics.views > 0 ? ((metrics.likes || 0) / metrics.views) * 100 : 0);
    const commentRate = metrics.commentRate ?? (metrics.views > 0 ? ((metrics.comments || 0) / metrics.views) * 100 : 0);
    const engagementRate = likeRate + commentRate * 2; // comments weighted higher than passive likes

    if (engagementRate >= 6.0) score += 25;
    else if (engagementRate >= 4.0) score += 20;
    else if (engagementRate >= 2.0) score += 12;
    else if (engagementRate > 0) score += 5;

    // Velocity weight (views per day): 25%
    const vpd = metrics.viewsPerDay ?? 0;
    if (vpd >= 500) score += 25;
    else if (vpd >= 200) score += 20;
    else if (vpd >= 50) score += 15;
    else if (vpd >= 10) score += 8;
    else if (vpd > 0) score += 3;

    return Math.min(100, Math.round(score));
  }

  /**
   * Creates a structured performance snapshot for database storage.
   */
  createSnapshot(videoId, normalizedData, measurementWindow = '24h') {
    return {
      id: `short_snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      videoId,
      measurementWindow,
      directMetrics: normalizedData.direct,
      derivedMetrics: normalizedData.derived,
      unavailableMetrics: normalizedData.unavailable,
      performanceScore: normalizedData.derived.performanceScore,
      capturedAt: normalizedData.capturedAt || new Date().toISOString()
    };
  }

  /**
   * Compares two historical snapshots of a Short to evaluate growth and retention changes.
   */
  compareSnapshots(priorSnapshot = {}, currentSnapshot = {}) {
    const priorDirect = priorSnapshot.directMetrics || priorSnapshot.metrics || {};
    const currDirect = currentSnapshot.directMetrics || currentSnapshot.metrics || {};
    const priorDerived = priorSnapshot.derivedMetrics || {};
    const currDerived = currentSnapshot.derivedMetrics || {};

    const viewGrowth = (currDirect.views || 0) - (priorDirect.views || 0);
    const viewGrowthPercent = (priorDirect.views || 0) > 0
      ? Number(((viewGrowth / priorDirect.views) * 100).toFixed(1))
      : null;

    const retentionDelta = (currDirect.averageViewPercentage !== null && priorDirect.averageViewPercentage !== null)
      ? Number((currDirect.averageViewPercentage - priorDirect.averageViewPercentage).toFixed(1))
      : null;

    const scoreDelta = (currentSnapshot.performanceScore || currDerived.performanceScore || 0) -
                       (priorSnapshot.performanceScore || priorDerived.performanceScore || 0);

    return {
      videoId: currentSnapshot.videoId,
      priorWindow: priorSnapshot.measurementWindow,
      currentWindow: currentSnapshot.measurementWindow,
      viewGrowth,
      viewGrowthPercent,
      retentionDelta,
      scoreDelta,
      growthTrajectory: viewGrowth > 0 ? (viewGrowthPercent >= 20 ? 'accelerating' : 'steady') : 'flat_or_declining'
    };
  }

  /**
   * Helper to parse numbers safely.
   */
  parseNumber(val, fallback = null) {
    if (val === null || val === undefined || val === '') return fallback;
    const num = Number(val);
    return Number.isFinite(num) ? num : fallback;
  }

  /**
   * Helper to parse ISO 8601 duration (PT45S, PT1M15S) or numeric seconds into integer seconds.
   */
  parseDurationSeconds(duration) {
    if (!duration) return 30; // sensible Shorts default
    if (typeof duration === 'number') return Math.round(duration);

    const str = String(duration);
    if (!Number.isNaN(Number(str))) return Math.round(Number(str));

    // ISO 8601 (PT1M30S, PT45S)
    const match = str.match(/PT(?:(\d+)M)?(?:(\d+)S)?/i);
    if (match) {
      const minutes = parseInt(match[1] || '0', 10);
      const seconds = parseInt(match[2] || '0', 10);
      return minutes * 60 + seconds;
    }

    // MM:SS format
    const colonMatch = str.match(/(\d+):(\d+)/);
    if (colonMatch) {
      return parseInt(colonMatch[1], 10) * 60 + parseInt(colonMatch[2], 10);
    }

    return 30;
  }

  /**
   * Records a complete normalized snapshot into the database.
   */
  async recordSnapshot(videoId, raw = {}, context = {}, measurementWindow = '24h') {
    const normalized = this.normalizeShortsMetrics(raw, context);
    const snapshot = this.createSnapshot(videoId, normalized, measurementWindow);
    snapshot.productionId = context.productionId || null;
    if (this.db && this.db.saveShortsAnalyticsSnapshot) {
      await this.db.saveShortsAnalyticsSnapshot(snapshot);
    }
    return snapshot;
  }

  /**
   * Retrieves snapshots for a video from the database.
   */
  async getSnapshotsForVideo(videoId) {
    if (!this.db || !this.db.listShortsAnalyticsSnapshots) return [];
    return this.db.listShortsAnalyticsSnapshots({ videoId });
  }
}

module.exports = {
  ShortsAnalyticsService
};
