const { google } = require('googleapis');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { Logger } = require('../utils/logger');
const { assertValidYouTubeMetadata } = require('../utils/youtube-metadata-validator');

const MAX_PUBLISH_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = {
  1: 15 * 60 * 1000, // ~15 minutes after attempt 1 failure
  2: 60 * 60 * 1000  // ~60 minutes after attempt 2 failure
};

class PublishingSchedulingAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('PublishingScheduling');
    this.youtube = null;
    this.publishQueue = [];
  }

  async initialize() {
    this.logger.info('Initializing Publishing & Scheduling Agent...');
    await this.setupYouTubeAPI();
    await this.loadPublishQueue();
    return true;
  }

  async setupYouTubeAPI() {
    try {
      if (typeof this.credentials?.getYouTubeAuth !== 'function') {
        this.logger.warn('YouTube credentials not configured; skipping YouTube API client initialization');
        return;
      }
      const auth = this.credentials.getYouTubeAuth();
      this.youtube = google.youtube({ version: 'v3', auth });
      this.logger.info('YouTube API initialized');
    } catch (error) {
      this.logger.error('Failed to initialize YouTube API:', error);
      throw error;
    }
  }

  async loadPublishQueue() {
    try {
      if (!this.db?.getPublishQueue) return;
      const queue = await this.db.getPublishQueue();
      const validStatuses = new Set(['scheduled', 'paused', 'retry_pending', 'reconciliation_required']);

      const existingMap = new Map();
      for (const entry of this.publishQueue) {
        if (validStatuses.has(entry.status)) {
          existingMap.set(entry.id || entry.productionId, entry);
        }
      }

      for (const entry of (queue || [])) {
        if (validStatuses.has(entry.status)) {
          existingMap.set(entry.id || entry.productionId, entry);
        }
      }

      this.publishQueue = Array.from(existingMap.values())
        .sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));

      this.logger.info(`Loaded ${this.publishQueue.length} items in publish queue`);
    } catch (error) {
      this.logger.warn(`Failed to load publish queue: ${error.message}`);
    }
  }

  async scheduleContent(productionData) {
    try {
      const finalVideo = productionData.assets?.finalVideo;
      if (!finalVideo || finalVideo.simulated || path.extname(finalVideo.path || '').toLowerCase() !== '.mp4') {
        this.logger.warn(`Not scheduling ${productionData.id}: no real video file was produced (placeholder/simulated output). Fix your AI provider keys and FFmpeg, then regenerate.`);
        return null;
      }
      if (!await this.isNarrationReady(productionData.assets?.audio)) {
        this.logger.warn(`Not scheduling ${productionData.id}: narration is missing. Regenerate narration or explicitly confirm an intentional silent video.`);
        return null;
      }

      this.logger.info(`Scheduling content: ${productionData.id}`);
      const existing = await this.db.getLatestScheduleEntry?.(productionData.id);
      if (existing) {
        if (['scheduled', 'paused', 'retry_pending'].includes(existing.status) && !this.publishQueue.some(entry => entry.id === existing.id)) {
          this.publishQueue.push(existing);
          this.publishQueue.sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
        }
        this.logger.info(`Reusing existing ${existing.status} schedule entry for: ${productionData.id}`);
        return existing;
      }

      const scheduleEntry = {
        productionId: productionData.id,
        title: productionData.script.title,
        publishTime: productionData.scheduledPublishTime,
        status: 'scheduled',
        priority: productionData.priority,
        metadata: {
          seo: productionData.seo,
          thumbnail: productionData.assets.thumbnail,
          video: productionData.assets.finalVideo,
          audio: productionData.assets.audio,
          captions: productionData.assets.captions,
          privacyStatus: productionData.privacyStatus || process.env.DEFAULT_PRIVACY_STATUS || 'private',
          containsSyntheticMedia: productionData.containsSyntheticMedia === true,
          contentType: productionData.contentType || 'long_form',
          sourceProductionId: productionData.sourceProductionId || productionData.id,
          shortClipId: productionData.shortClipId || null
        },
        createdAt: new Date().toISOString()
      };
      
      const saved = await this.db.saveScheduleEntry(scheduleEntry) || scheduleEntry;
      this.publishQueue.push(saved);
      this.publishQueue.sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
      
      this.logger.info(`Content scheduled for: ${saved.publishTime}`);
      return saved;
    } catch (error) {
      this.logger.error('Failed to schedule content:', error);
      throw error;
    }
  }

  async publishContent(contentId) {
    let uploadAttemptHandled = false;
    try {
      let productionBundle = null;
      if (this.db.getLatestReadinessRun) {
        const readiness = await this.db.getLatestReadinessRun();
        if (readiness?.status === 'failed') {
          const failures = readiness.checks
            .filter(check => check.blocking && check.status === 'failed')
            .map(check => check.id);
          const error = new Error(`Publishing is blocked by the production readiness gate. Fix ${failures.join(', ')} and run the check again.`);
          error.status = 409;
          error.code = 'READINESS_BLOCKED';
          throw error;
        }
      }
      if (this.db.getProductionBundle) {
        productionBundle = await this.db.getProductionBundle(contentId);
        if (productionBundle && productionBundle.review_status && productionBundle.review_status !== 'approved') {
          const error = new Error('Publishing is blocked: content must pass review and be approved before publishing');
          error.status = 409;
          error.code = 'APPROVAL_REQUIRED';
          throw error;
        }
        if (productionBundle && !['verified', 'not_required'].includes(productionBundle.provenance?.status || 'not_required')) {
          const error = new Error('Publishing is blocked until every factual claim is supported or explicitly waived');
          error.status = 409;
          error.code = 'PROVENANCE_BLOCKED';
          throw error;
        }
      }
      this.logger.info(`Publishing content: ${contentId}`);
      
      let scheduleEntry = this.publishQueue.find(entry =>
        entry.productionId === contentId || entry.id === contentId
      );
      if (!scheduleEntry && this.db.getLatestScheduleEntry) {
        scheduleEntry = await this.db.getLatestScheduleEntry(contentId);
      }
      
      if (!scheduleEntry) {
        throw new Error(`Content not found in queue: ${contentId}`);
      }
      if (scheduleEntry.status === 'published') return scheduleEntry;
      if (scheduleEntry.status === 'dead_letter') {
        const error = new Error('Publishing failed permanently and reached dead-letter status. Manual intervention required.');
        error.status = 409;
        error.code = 'DEAD_LETTER_BLOCKED';
        throw error;
      }
      if (!await this.isNarrationReady(scheduleEntry.metadata?.audio || productionBundle?.assets?.audio)) {
        const error = new Error('Publishing is blocked because narration is missing or the intentional-silence override is incomplete');
        error.status = 409;
        error.code = 'NARRATION_REQUIRED';
        throw error;
      }
      if (scheduleEntry.youtubeId) {
        return this.reconcileUploadedVideo(scheduleEntry);
      }
      if (['uploading', 'reconciliation_required'].includes(scheduleEntry.status)) {
        const error = new Error('A previous upload may have reached YouTube without returning a video ID. Reconcile the channel before attempting another upload.');
        error.status = 409;
        error.code = 'UPLOAD_OUTCOME_UNKNOWN';
        throw error;
      }

      scheduleEntry.status = 'uploading';
      scheduleEntry.error = null;
      await this.db.updateScheduleEntry(scheduleEntry);
      await this.syncShortStatus(scheduleEntry, 'uploading');
      
      let uploadResult;
      try {
        uploadResult = await this.uploadToYouTube(scheduleEntry);
      } catch (error) {
        uploadAttemptHandled = true;
        const classification = this.classifyPublishError(error, scheduleEntry.uploadAttempted);
        const retryState = this.calculateNextRetry(scheduleEntry, error, classification);

        scheduleEntry.status = retryState.status;
        scheduleEntry.error = error.message;
        if (retryState.nextPublishTime) {
          scheduleEntry.publishTime = retryState.nextPublishTime;
        }
        scheduleEntry.metadata = {
          ...scheduleEntry.metadata,
          retry: retryState.metadataRetry
        };

        await this.db.updateScheduleEntry(scheduleEntry);
        await this.syncShortStatus(scheduleEntry, retryState.status, error.message);

        if (retryState.status === 'dead_letter') {
          this.publishQueue = this.publishQueue.filter(entry => entry.productionId !== scheduleEntry.productionId);
        }

        if (classification === 'UNKNOWN_UPLOAD_OUTCOME') {
          error.code = 'UPLOAD_OUTCOME_UNKNOWN';
          error.status = 409;
        }
        throw error;
      }
      
      // Update database on success
      scheduleEntry.status = 'published';
      scheduleEntry.publishedAt = new Date().toISOString();
      scheduleEntry.youtubeId = uploadResult.id;
      scheduleEntry.youtubeUrl = `https://www.youtube.com/watch?v=${uploadResult.id}`;
      scheduleEntry.error = null;
      if (scheduleEntry.metadata?.retry) {
        scheduleEntry.metadata.retry.nextRetryTime = null;
      }
      
      await this.db.updateScheduleEntry(scheduleEntry);
      await this.syncShortStatus(scheduleEntry, 'published');
      
      // Remove from queue
      this.publishQueue = this.publishQueue.filter(entry => entry.productionId !== scheduleEntry.productionId);
      
      this.logger.success(`Content published: ${scheduleEntry.youtubeUrl}`);
      return scheduleEntry;
    } catch (error) {
      this.logger.error('Failed to publish content:', error);
      if (!uploadAttemptHandled) {
        let entry = this.publishQueue.find(e => e.productionId === contentId || e.id === contentId);
        if (!entry && this.db?.getLatestScheduleEntry) {
          entry = await this.db.getLatestScheduleEntry(contentId).catch(() => null);
        }
        if (entry && !['published', 'uploading', 'reconciliation_required', 'dead_letter'].includes(entry.status)) {
          const classification = this.classifyPublishError(error, false);
          if (classification === 'NON_RETRYABLE' && error.code !== 'READINESS_BLOCKED') {
            const retryState = this.calculateNextRetry(entry, error, classification);
            entry.status = retryState.status;
            entry.error = error.message;
            entry.metadata = {
              ...entry.metadata,
              retry: retryState.metadataRetry
            };
            await this.db.updateScheduleEntry?.(entry);
            await this.syncShortStatus?.(entry, retryState.status, error.message);
            this.publishQueue = this.publishQueue.filter(e => e.productionId !== entry.productionId);
          }
        }
      }
      throw error;
    }
  }

  async uploadToYouTube(scheduleEntry) {
    const { metadata } = scheduleEntry;
    const validation = assertValidYouTubeMetadata(metadata.seo);
    if (validation.warnings.length) {
      this.logger.warn(`YouTube metadata warnings: ${validation.warnings.join(' ')}`);
    }
    const safeMetadata = validation.value;
    
    // Prepare video metadata
    const videoMetadata = {
      snippet: {
        title: safeMetadata.title,
        description: safeMetadata.description,
        tags: safeMetadata.tags,
        categoryId: safeMetadata.categoryId,
        defaultLanguage: safeMetadata.defaultLanguage,
        defaultAudioLanguage: safeMetadata.defaultAudioLanguage
      },
      status: {
        privacyStatus: metadata.privacyStatus || process.env.DEFAULT_PRIVACY_STATUS || 'private',
        publishAt: scheduleEntry.publishTime,
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: metadata.containsSyntheticMedia === true
      }
    };
    
    // Resolve the file before marking the network upload as attempted.
    const videoStream = await this.getVideoStream(metadata.video.path);
    scheduleEntry.uploadAttempted = true;
    const videoUpload = await this.youtube.videos.insert({
      part: 'snippet,status',
      requestBody: videoMetadata,
      media: {
        body: videoStream
      }
    });
    
    const videoId = videoUpload.data.id;
    this.logger.info(`Video uploaded with ID: ${videoId}`);
    scheduleEntry.status = 'uploaded';
    scheduleEntry.youtubeId = videoId;
    scheduleEntry.youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    scheduleEntry.error = null;
    await this.db.updateScheduleEntry(scheduleEntry);
    
    // Upload thumbnail
    if (metadata.thumbnail && metadata.thumbnail.path) {
      await this.uploadThumbnail(videoId, metadata.thumbnail.path);
    }
    
    // Upload captions
    if (metadata.captions && metadata.captions.path) {
      await this.uploadCaptions(videoId, metadata.captions.path);
    }
    
    return videoUpload.data;
  }

  async isNarrationReady(audio = {}) {
    if (audio.intentionalSilence === true) {
      return String(audio.silenceReason || '').trim().length >= 10 && Boolean(audio.silenceConfirmedAt);
    }
    if (!audio.path || audio.simulated || String(audio.path).endsWith('.info')) return false;
    try {
      const stats = await fs.stat(audio.path);
      return stats.isFile() && stats.size > 0;
    } catch (_error) {
      return false;
    }
  }

  isUploadOutcomeUnknown(error) {
    const status = Number(error.status || error.response?.status || 0);
    const code = String(error.code || '').toUpperCase();
    if (['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENETRESET', 'ESOCKETTIMEDOUT'].includes(code)) return true;
    return !status || status >= 500;
  }

  classifyPublishError(error, uploadAttempted = false) {
    if (!error) return 'NON_RETRYABLE';

    // Unknown outcome check: if upload was attempted and status >= 500 or connection broke
    if (uploadAttempted && this.isUploadOutcomeUnknown(error)) {
      return 'UNKNOWN_UPLOAD_OUTCOME';
    }

    const code = String(error.code || '').toUpperCase();
    const status = Number(error.status || error.statusCode || error.response?.status || 0);
    const message = String(error.message || '').toLowerCase();

    // Non-retryable safety gates and preconditions
    if (['READINESS_BLOCKED', 'PROVENANCE_BLOCKED', 'NARRATION_REQUIRED', 'APPROVAL_REQUIRED', 'DEAD_LETTER_BLOCKED', 'PACKAGING_INVALID', 'PACKAGING_VIDEO_NOT_FOUND'].includes(code)) {
      return 'NON_RETRYABLE';
    }
    if (message.includes('video file not found') || message.includes('placeholder asset') || message.includes('must pass review') || message.includes('approved before publishing')) {
      return 'NON_RETRYABLE';
    }
    if (status === 400 || status === 404) {
      return 'NON_RETRYABLE';
    }

    // YouTube 403 checks
    if (status === 403) {
      if (message.includes('quotaexceeded') || message.includes('uploadlimitexceeded') || message.includes('dailylimitexceeded')) {
        return 'TRANSIENT';
      }
      return 'NON_RETRYABLE'; // Permissions, account suspension, terms violation
    }

    if (message.includes('invalid_grant') || message.includes('unauthorized_client')) {
      return 'NON_RETRYABLE';
    }

    // Transient rate limit or temporary token issues
    if (status === 429 || status === 401) {
      return 'TRANSIENT';
    }

    // Pre-upload network errors
    if (['ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(code)) {
      return uploadAttempted ? 'UNKNOWN_UPLOAD_OUTCOME' : 'TRANSIENT';
    }

    return 'NON_RETRYABLE';
  }

  calculateNextRetry(entry, error, classification = null) {
    const errorType = classification || this.classifyPublishError(error, entry?.uploadAttempted);
    const previousRetry = entry.metadata?.retry || {};
    const attemptCount = (previousRetry.attemptCount || 0) + 1;
    const now = new Date();

    if (errorType === 'NON_RETRYABLE') {
      return {
        status: 'dead_letter',
        nextPublishTime: null,
        metadataRetry: {
          attemptCount,
          maxAttempts: MAX_PUBLISH_ATTEMPTS,
          lastAttemptAt: now.toISOString(),
          nextRetryTime: null,
          failureCategory: 'non_retryable',
          lastError: error?.message || 'Non-retryable failure',
          reconciliationStatus: previousRetry.reconciliationStatus || 'none'
        }
      };
    }

    if (errorType === 'UNKNOWN_UPLOAD_OUTCOME') {
      return {
        status: 'reconciliation_required',
        nextPublishTime: null,
        metadataRetry: {
          attemptCount,
          maxAttempts: MAX_PUBLISH_ATTEMPTS,
          lastAttemptAt: now.toISOString(),
          nextRetryTime: null,
          failureCategory: 'unknown_outcome',
          lastError: error?.message || 'Unknown upload outcome',
          reconciliationStatus: 'pending'
        }
      };
    }

    // Transient failure: check if attempt count reached or exceeded MAX_PUBLISH_ATTEMPTS
    if (attemptCount >= MAX_PUBLISH_ATTEMPTS) {
      return {
        status: 'dead_letter',
        nextPublishTime: null,
        metadataRetry: {
          attemptCount,
          maxAttempts: MAX_PUBLISH_ATTEMPTS,
          lastAttemptAt: now.toISOString(),
          nextRetryTime: null,
          failureCategory: 'transient',
          lastError: error?.message || 'Max publish attempts reached',
          reconciliationStatus: previousRetry.reconciliationStatus || 'none'
        }
      };
    }

    // Calculate backoff: attempt 1 -> 15m, attempt 2 -> 60m
    const delayMs = RETRY_BACKOFF_MS[attemptCount] || (15 * 60 * 1000);
    const nextRetryDate = new Date(now.getTime() + delayMs);

    return {
      status: 'retry_pending',
      nextPublishTime: nextRetryDate.toISOString(),
      metadataRetry: {
        attemptCount,
        maxAttempts: MAX_PUBLISH_ATTEMPTS,
        lastAttemptAt: now.toISOString(),
        nextRetryTime: nextRetryDate.toISOString(),
        failureCategory: 'transient',
        lastError: error?.message || 'Transient error',
        reconciliationStatus: previousRetry.reconciliationStatus || 'none'
      }
    };
  }

  async reconcileChannelUpload(scheduleEntry) {
    if (!scheduleEntry) return null;

    if (scheduleEntry.youtubeId) {
      return this.reconcileUploadedVideo(scheduleEntry);
    }

    if (!this.youtube) {
      const error = new Error('YouTube API client is not initialized for channel reconciliation');
      error.code = 'YOUTUBE_API_UNAVAILABLE';
      throw error;
    }

    this.logger.info(`Starting channel upload reconciliation for: ${scheduleEntry.title}`);

    try {
      let recentVideos = [];

      let uploadsPlaylistId = null;
      if (this.youtube.channels?.list) {
        const channelRes = await this.youtube.channels.list({
          part: 'contentDetails',
          mine: true
        });
        uploadsPlaylistId = channelRes.data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      }

      if (uploadsPlaylistId && this.youtube.playlistItems?.list) {
        const playlistRes = await this.youtube.playlistItems.list({
          part: 'snippet,contentDetails',
          playlistId: uploadsPlaylistId,
          maxResults: 15
        });
        recentVideos = (playlistRes.data?.items || []).map(item => ({
          videoId: item.contentDetails?.videoId || item.snippet?.resourceId?.videoId,
          title: item.snippet?.title || '',
          publishedAt: item.snippet?.publishedAt || item.contentDetails?.videoPublishedAt
        }));
      } else if (this.youtube.search?.list) {
        const searchRes = await this.youtube.search.list({
          part: 'snippet',
          forMine: true,
          type: 'video',
          maxResults: 15
        });
        recentVideos = (searchRes.data?.items || []).map(item => ({
          videoId: item.id?.videoId || item.id,
          title: item.snippet?.title || '',
          publishedAt: item.snippet?.publishedAt
        }));
      } else {
        throw new Error('YouTube channel uploads playlist and search API are unavailable for reconciliation');
      }

      const targetTitle = String(scheduleEntry.title || scheduleEntry.metadata?.seo?.title || '').trim().toLowerCase();
      const match = recentVideos.find(v => v.videoId && String(v.title || '').trim().toLowerCase() === targetTitle);

      if (match) {
        this.logger.success(`Reconciliation matched video on YouTube: ID ${match.videoId} (${match.title})`);
        scheduleEntry.youtubeId = match.videoId;
        scheduleEntry.youtubeUrl = `https://www.youtube.com/watch?v=${match.videoId}`;
        scheduleEntry.status = 'published';
        scheduleEntry.publishedAt = match.publishedAt || new Date().toISOString();
        scheduleEntry.error = null;
        scheduleEntry.metadata = {
          ...scheduleEntry.metadata,
          retry: {
            ...(scheduleEntry.metadata?.retry || {}),
            reconciliationStatus: 'reconciled_found',
            lastAttemptAt: new Date().toISOString(),
            nextRetryTime: null
          }
        };

        await this.db.updateScheduleEntry?.(scheduleEntry);
        await this.syncShortStatus?.(scheduleEntry, 'published');
        this.publishQueue = this.publishQueue.filter(entry => entry.productionId !== scheduleEntry.productionId);
        return scheduleEntry;
      }

      this.logger.info(`Reconciliation confirmed video "${scheduleEntry.title}" is NOT on channel. Transitioning to retry_pending.`);
      scheduleEntry.uploadAttempted = false;
      const retryState = this.calculateNextRetry(
        scheduleEntry,
        new Error('Previous upload attempt was not found on channel; safe to retry'),
        'TRANSIENT'
      );

      scheduleEntry.status = retryState.status;
      scheduleEntry.publishTime = retryState.nextPublishTime || scheduleEntry.publishTime;
      scheduleEntry.metadata = {
        ...scheduleEntry.metadata,
        retry: {
          ...retryState.metadataRetry,
          reconciliationStatus: 'reconciled_not_found'
        }
      };

      await this.db.updateScheduleEntry?.(scheduleEntry);
      await this.syncShortStatus?.(scheduleEntry, retryState.status);
      return scheduleEntry;

    } catch (error) {
      this.logger.error(`Channel reconciliation API failed for ${scheduleEntry.title}: ${error.message}`);
      scheduleEntry.status = 'reconciliation_required';
      scheduleEntry.metadata = {
        ...scheduleEntry.metadata,
        retry: {
          ...(scheduleEntry.metadata?.retry || {}),
          reconciliationStatus: 'reconciliation_failed',
          lastError: error.message
        }
      };
      await this.db.updateScheduleEntry?.(scheduleEntry);
      throw error;
    }
  }

  async reconcileUploadedVideo(scheduleEntry) {
    const response = await this.youtube.videos.list({ part: 'id,status', id: scheduleEntry.youtubeId });
    if (!response.data.items?.some(video => video.id === scheduleEntry.youtubeId)) {
      scheduleEntry.status = 'reconciliation_required';
      scheduleEntry.error = 'The recorded YouTube video ID could not be verified';
      await this.db.updateScheduleEntry(scheduleEntry);
      await this.syncShortStatus(scheduleEntry, 'reconciliation_required', scheduleEntry.error);
      const error = new Error('The recorded upload could not be verified on YouTube. Resolve it before attempting another upload.');
      error.status = 409;
      error.code = 'UPLOAD_OUTCOME_UNKNOWN';
      throw error;
    }
    scheduleEntry.status = 'published';
    scheduleEntry.publishedAt = scheduleEntry.publishedAt || new Date().toISOString();
    scheduleEntry.youtubeUrl = scheduleEntry.youtubeUrl || `https://www.youtube.com/watch?v=${scheduleEntry.youtubeId}`;
    scheduleEntry.error = null;
    await this.db.updateScheduleEntry(scheduleEntry);
    await this.syncShortStatus(scheduleEntry, 'published');
    this.publishQueue = this.publishQueue.filter(entry => entry.productionId !== scheduleEntry.productionId);
    this.logger.success(`Reconciled existing YouTube upload: ${scheduleEntry.youtubeUrl}`);
    return scheduleEntry;
  }

  async syncShortStatus(scheduleEntry, status, error = null) {
    const clipId = scheduleEntry.metadata?.shortClipId;
    if (!clipId || !this.db.updateShortClip) return null;
    return this.db.updateShortClip(clipId, {
      status,
      scheduleId: scheduleEntry.id,
      youtubeId: scheduleEntry.youtubeId || null,
      youtubeUrl: scheduleEntry.youtubeUrl || null,
      error
    });
  }

  async getVideoStream(videoPath) {
    try {
      const stats = await fs.stat(videoPath);
      if (!stats.isFile() || path.extname(videoPath).toLowerCase() !== '.mp4') {
        throw new Error('placeholder asset');
      }

      return fsSync.createReadStream(videoPath);
    } catch (error) {
      throw new Error('video file not found — refusing to upload placeholder');
    }
  }
  async uploadThumbnail(videoId, thumbnailPath) {
    try {
      const thumbnailBuffer = await fs.readFile(thumbnailPath);
      
      await this.youtube.thumbnails.set({
        videoId: videoId,
        media: {
          body: thumbnailBuffer
        }
      });
      
      this.logger.info(`Thumbnail uploaded for video: ${videoId}`);
    } catch (error) {
      this.logger.error(`Failed to upload thumbnail: ${error.message}`);
    }
  }

  async applyVideoPackaging(videoId, packaging = {}, previousPackaging = null) {
    const title = String(packaging.title || '').trim();
    if (!videoId || !title || title.length > 100 || !packaging.thumbnailPath) {
      const error = new Error('A valid video ID, title, and thumbnail are required for a packaging change');
      error.status = 400;
      error.code = 'PACKAGING_INVALID';
      throw error;
    }
    const thumbnail = await fs.readFile(packaging.thumbnailPath);
    const current = await this.youtube.videos.list({ part: 'snippet', id: videoId });
    const snippet = current.data.items?.[0]?.snippet;
    if (!snippet) {
      const error = new Error(`YouTube video not found: ${videoId}`);
      error.status = 404;
      error.code = 'PACKAGING_VIDEO_NOT_FOUND';
      throw error;
    }

    const updateTitle = async nextTitle => this.youtube.videos.update({
      part: 'snippet',
      requestBody: {
        id: videoId,
        snippet: {
          title: nextTitle,
          description: snippet.description || '',
          tags: snippet.tags || [],
          categoryId: snippet.categoryId || '22',
          defaultLanguage: snippet.defaultLanguage,
          defaultAudioLanguage: snippet.defaultAudioLanguage
        }
      }
    });

    await updateTitle(title);
    try {
      await this.youtube.thumbnails.set({
        videoId,
        media: { body: thumbnail }
      });
    } catch (error) {
      try {
        await updateTitle(String(previousPackaging?.title || snippet.title || '').trim());
      } catch (rollbackError) {
        error.message = `${error.message}; title rollback also failed: ${rollbackError.message}`;
      }
      throw error;
    }
    this.logger.info(`Applied approved growth-experiment packaging to video: ${videoId}`);
    return { videoId, title, thumbnailPath: packaging.thumbnailPath };
  }

  async uploadCaptions(videoId, captionsPath) {
    try {
      const captionsContent = await fs.readFile(captionsPath, 'utf8');
      
      await this.youtube.captions.insert({
        part: 'snippet',
        requestBody: {
          snippet: {
            videoId: videoId,
            language: 'en',
            name: 'English Captions',
            isDraft: false
          }
        },
        media: {
          body: captionsContent
        }
      });
      
      this.logger.info(`Captions uploaded for video: ${videoId}`);
    } catch (error) {
      this.logger.error(`Failed to upload captions: ${error.message}`);
    }
  }

  async processPublishQueue() {
    await this.loadPublishQueue();
    const now = new Date();

    // 1. Process any entries needing reconciliation first
    const reconciliationItems = this.publishQueue.filter(entry => entry.status === 'reconciliation_required');
    for (const entry of reconciliationItems) {
      try {
        await this.reconcileChannelUpload(entry);
      } catch (recError) {
        this.logger.warn(`Skipping immediate retry for ${entry.title}; awaiting channel reconciliation: ${recError.message}`);
      }
    }

    // 2. Filter ready items: scheduled or retry_pending whose publishTime is due
    const activeQueue = this.publishQueue
      .filter(entry => ['scheduled', 'retry_pending'].includes(entry.status))
      .sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));

    const readyToPublish = activeQueue.filter(entry => new Date(entry.publishTime) <= now);

    if (readyToPublish.length === 0) {
      if (activeQueue.length > 0) {
        this.logger.info(`Publish queue: ${activeQueue.length} item(s) waiting, next publish at ${activeQueue[0].publishTime}`);
      } else {
        this.logger.info('Publish queue is empty — nothing scheduled yet.');
      }
      return 0;
    }

    this.logger.info(`Processing publish queue: ${readyToPublish.length} item(s) ready to publish...`);

    for (const entry of readyToPublish) {
      try {
        await this.publishContent(entry.productionId);
        this.logger.info(`Auto-published: ${entry.title}`);
      } catch (error) {
        if (error.code === 'READINESS_BLOCKED') {
          this.logger.warn(error.message);
          continue;
        }
        this.logger.error(`Failed to auto-publish ${entry.title}:`, error);
      }
    }

    return readyToPublish.length;
  }

  async getUpcomingSchedule(days = 7) {
    const now = new Date();
    const endDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
    
    return this.publishQueue
      .filter(entry => {
        const publishTime = new Date(entry.publishTime);
        return publishTime >= now && publishTime <= endDate;
      })
      .sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
  }

  async optimizePublishTimes() {
    // Analyze channel analytics to find optimal publish times
    const analytics = await this.getChannelAnalytics();
    const optimalTimes = this.calculateOptimalTimes(analytics);
    
    // Update scheduled content with better times
    for (const entry of this.publishQueue) {
      if (entry.status === 'scheduled') {
        const currentTime = new Date(entry.publishTime);
        const betterTime = this.findBetterTime(currentTime, optimalTimes);
        
        if (betterTime && betterTime.getTime() !== currentTime.getTime()) {
          entry.publishTime = betterTime.toISOString();
          await this.db.updateScheduleEntry(entry);
          this.logger.info(`Optimized publish time for: ${entry.title}`);
        }
      }
    }
  }

  async getChannelAnalytics() {
    try {
      // Get channel analytics for the last 30 days
      const response = await this.youtube.channels.list({
        part: 'statistics',
        mine: true
      });
      
      // In a full implementation, you'd use YouTube Analytics API
      // For now, we'll return simulated data
      return {
        totalViews: response.data.items[0]?.statistics?.viewCount || 0,
        subscribers: response.data.items[0]?.statistics?.subscriberCount || 0,
        videos: response.data.items[0]?.statistics?.videoCount || 0,
        optimalDays: ['Tuesday', 'Wednesday', 'Thursday'], // Most active days
        optimalHours: [14, 15, 16, 20] // Most active hours
      };
    } catch (error) {
      this.logger.error('Failed to get channel analytics:', error);
      return {
        optimalDays: ['Tuesday', 'Wednesday', 'Thursday'],
        optimalHours: [14, 15, 16]
      };
    }
  }

  calculateOptimalTimes(analytics) {
    const { optimalDays, optimalHours } = analytics;
    
    return {
      bestDays: optimalDays,
      bestHours: optimalHours,
      worstDays: ['Monday', 'Friday'],
      worstHours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 22, 23]
    };
  }

  findBetterTime(currentTime, optimalTimes) {
    const currentDay = currentTime.toLocaleDateString('en-US', { weekday: 'long' });
    const currentHour = currentTime.getHours();
    
    // If current time is already optimal, return null
    if (optimalTimes.bestDays.includes(currentDay) && 
        optimalTimes.bestHours.includes(currentHour)) {
      return null;
    }
    
    // Find the next optimal time
    const nextOptimalTime = new Date(currentTime);
    
    // Try to find an optimal hour on the same day
    for (const hour of optimalTimes.bestHours) {
      if (hour > currentHour) {
        nextOptimalTime.setHours(hour, 0, 0, 0);
        if (optimalTimes.bestDays.includes(currentDay)) {
          return nextOptimalTime;
        }
      }
    }
    
    // Find next optimal day
    for (let i = 1; i <= 7; i++) {
      const testDate = new Date(currentTime.getTime() + (i * 24 * 60 * 60 * 1000));
      const testDay = testDate.toLocaleDateString('en-US', { weekday: 'long' });
      
      if (optimalTimes.bestDays.includes(testDay)) {
        testDate.setHours(optimalTimes.bestHours[0], 0, 0, 0);
        return testDate;
      }
    }
    
    return null; // No better time found
  }

  async createPublishingReport() {
    const report = {
      queueStatus: {
        total: this.publishQueue.length,
        scheduled: this.publishQueue.filter(e => e.status === 'scheduled').length,
        retryPending: this.publishQueue.filter(e => e.status === 'retry_pending').length,
        reconciliationRequired: this.publishQueue.filter(e => e.status === 'reconciliation_required').length,
        deadLetter: this.publishQueue.filter(e => e.status === 'dead_letter').length,
        published: this.publishQueue.filter(e => e.status === 'published').length,
        failed: this.publishQueue.filter(e => e.status === 'failed').length
      },
      upcomingPublications: await this.getUpcomingSchedule(7),
      recentPublications: this.publishQueue
        .filter(e => e.status === 'published' && 
                new Date(e.publishedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)),
      performance: await this.getPublishingPerformance(),
      generatedAt: new Date().toISOString()
    };
    
    return report;
  }

  async getPublishingPerformance() {
    const published = this.publishQueue.filter(e => e.status === 'published');
    
    if (published.length === 0) {
      return {
        totalPublished: 0,
        averageScheduleAccuracy: 0,
        publishingFrequency: 0
      };
    }
    
    // Calculate schedule accuracy
    let totalDelay = 0;
    let accuratePublishes = 0;
    
    published.forEach(entry => {
      const scheduledTime = new Date(entry.publishTime);
      const actualTime = new Date(entry.publishedAt);
      const delay = Math.abs(actualTime - scheduledTime) / (1000 * 60); // minutes
      
      totalDelay += delay;
      if (delay <= 5) accuratePublishes++; // Within 5 minutes is considered accurate
    });
    
    const averageDelay = totalDelay / published.length;
    const accuracyRate = (accuratePublishes / published.length) * 100;
    
    return {
      totalPublished: published.length,
      averageScheduleAccuracy: `${accuracyRate.toFixed(1)}%`,
      averageDelay: `${averageDelay.toFixed(1)} minutes`,
      publishingFrequency: this.calculatePublishingFrequency(published)
    };
  }

  calculatePublishingFrequency(published) {
    if (published.length < 2) return 'Insufficient data';
    
    const dates = published.map(p => new Date(p.publishedAt)).sort((a, b) => a - b);
    const totalDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
    const frequency = published.length / totalDays;
    
    if (frequency >= 1) return `${frequency.toFixed(1)} videos per day`;
    if (frequency >= 0.14) return `${(frequency * 7).toFixed(1)} videos per week`;
    return `${(frequency * 30).toFixed(1)} videos per month`;
  }

  async emergencyPublish(contentId, delayMinutes = 0) {
    // For urgent publishing needs
    this.logger.info(`Emergency publish requested: ${contentId}`);
    
    const entry = this.publishQueue.find(e => 
      e.productionId === contentId || e.id === contentId
    );
    
    if (!entry) {
      throw new Error(`Content not found: ${contentId}`);
    }
    
    if (delayMinutes > 0) {
      const newPublishTime = new Date(Date.now() + (delayMinutes * 60 * 1000));
      entry.publishTime = newPublishTime.toISOString();
      await this.db.updateScheduleEntry(entry);
      this.logger.info(`Emergency scheduled for: ${entry.publishTime}`);
      return entry;
    } else {
      return await this.publishContent(contentId);
    }
  }

  async pauseScheduledContent(contentId) {
    const entry = this.publishQueue.find(e => 
      e.productionId === contentId || e.id === contentId
    );
    
    if (!entry) {
      throw new Error(`Content not found: ${contentId}`);
    }
    
    entry.status = 'paused';
    await this.db.updateScheduleEntry(entry);
    
    this.logger.info(`Content paused: ${entry.title}`);
    return entry;
  }

  async resumeScheduledContent(contentId, newPublishTime = null) {
    const entry = this.publishQueue.find(e => 
      e.productionId === contentId || e.id === contentId
    );
    
    if (!entry) {
      throw new Error(`Content not found: ${contentId}`);
    }
    
    entry.status = 'scheduled';
    if (newPublishTime) {
      entry.publishTime = new Date(newPublishTime).toISOString();
    }
    
    await this.db.updateScheduleEntry(entry);
    
    this.logger.info(`Content resumed: ${entry.title}`);
    return entry;
  }
}

module.exports = { PublishingSchedulingAgent, MAX_PUBLISH_ATTEMPTS, RETRY_BACKOFF_MS };
