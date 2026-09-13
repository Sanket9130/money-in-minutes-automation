'use strict';

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const { Logger } = require('./logger');
const { AutonomousContentOrchestrator } = require('./autonomous-content-orchestrator');
const { YouTubeAuthResolver } = require('./youtube-auth-resolver');
const { SemanticDedupService } = require('./semantic-dedup-service');
const { Database } = require('../database/db');

const CURATED_TOPIC_POOL = [
  "Why Costco's Membership Model Is So Powerful",
  "How Visa And Mastercard Make Billions On Hidden Swipe Fees",
  "Why Apple's Profit Margin On iPhones Is Unmatched",
  "The Real Math Behind Disney Theme Park Ticket Pricing",
  "How Nvidia Built A Trillion Dollar AI Compute Moat",
  "The Secret Economics Of Airline Frequent Flyer Miles",
  "Why Fast Food Value Menus Are Disappearing Forever",
  "How Streaming Services Sneakily Price-Hike Subscriptions"
];

class DailyShortsPublisher {
  constructor(options = {}) {
    this.logger = options.logger || new Logger('DailyShortsPublisher');
    this.db = options.db || null;
    this.orchestrator = options.orchestrator || new AutonomousContentOrchestrator({ logger: this.logger });
    this.authResolver = options.authResolver || new YouTubeAuthResolver({ logger: this.logger });
    this.dedupService = options.dedupService || new SemanticDedupService();
    this.youtubeClient = options.youtubeClient || null;

    this.projectRoot = options.projectRoot || path.join(__dirname, '..');
    this.shortsDir = options.shortsDir || path.join(this.projectRoot, 'data', 'shorts');
    this.scratchDir = options.scratchDir || path.join(this.projectRoot, 'scratch', 'daily_shorts');

    this.dailyPublishTime = options.dailyPublishTime || process.env.DAILY_SHORT_PUBLISH_TIME || '17:00';
    this.dailyMinimum = Number(options.dailyMinimum || process.env.DAILY_SHORT_MINIMUM || 1);
    this.maxCandidateAttempts = Number(options.maxCandidateAttempts || 3);
    this.maxUploadAttempts = Number(options.maxUploadAttempts || 3);
  }

  async initialize() {
    if (!this.db) {
      this.db = new Database();
      await this.db.initialize();
    }
    await fsPromises.mkdir(this.shortsDir, { recursive: true });
    await fsPromises.mkdir(this.scratchDir, { recursive: true });
  }

  /**
   * Checks whether the daily minimum has already been fulfilled for the given date.
   * @param {Date|string} [date=new Date()]
   * @returns {Promise<{ hasMetDailyQuota: boolean, publishedCount: number, scheduledCount: number, records: Array }>}
   */
  async checkDailyStatus(date = new Date()) {
    await this.initialize();
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const dateStr = dateObj.toISOString().slice(0, 10);

    const records = await this.db.getDailyShortsByDate(dateStr);
    const completed = records.filter(r => ['SCHEDULED', 'PUBLISHED'].includes(r.status));
    const publishedCount = records.filter(r => r.status === 'PUBLISHED').length;
    const scheduledCount = records.filter(r => r.status === 'SCHEDULED').length;

    return {
      hasMetDailyQuota: completed.length >= this.dailyMinimum,
      publishedCount,
      scheduledCount,
      totalCompleted: completed.length,
      records
    };
  }

  /**
   * Computes SHA-256 hash of a file for duplicate protection.
   */
  async computeContentHash(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const buffer = await fsPromises.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Discovers and returns the next eligible topic candidate that is not a duplicate.
   * @param {Array<string>} [excludedTopics=[]]
   * @returns {Promise<string>}
   */
  async discoverNextTopic(excludedTopics = []) {
    await this.initialize();

    const recentRecords = await this.db.listDailyShortPublications({ limit: 100 });
    const historicalTopics = recentRecords
      .filter(r => ['READY_TO_PUBLISH', 'UPLOADING', 'SCHEDULED', 'PUBLISHED'].includes(r.status))
      .map(r => r.topic);

    const allExcluded = [...new Set([...excludedTopics, ...historicalTopics])];

    for (const candidate of CURATED_TOPIC_POOL) {
      if (allExcluded.includes(candidate)) continue;

      const dupCheck = this.dedupService.isDuplicate(candidate, allExcluded);
      if (!dupCheck.isDuplicate) {
        const dbDup = await this.db.isDailyShortTopicDuplicate(candidate, 90);
        if (!dbDup) {
          return candidate;
        }
      }
    }

    // Fallback: append date tag if pool is exhausted
    const fallback = `Market Pulse: Modern Consumer Finance & Business Tactics (${new Date().toISOString().slice(0, 10)})`;
    return fallback;
  }

  /**
   * Calculates the target scheduled publish time (UTC ISO string) for YouTube scheduling.
   * @param {Date} [targetDate=new Date()]
   * @param {string} [timeStr] e.g. "18:00"
   * @returns {string} ISO timestamp
   */
  calculateScheduledPublishTime(targetDate = new Date(), timeStr = this.dailyPublishTime) {
    const [hours, minutes] = timeStr.split(':').map(n => parseInt(n, 10) || 0);
    const scheduled = new Date(targetDate);
    // Explicitly target UTC hours (e.g. 17:00 UTC = 10:30 PM IST)
    scheduled.setUTCHours(hours, minutes, 0, 0);

    // If target UTC time has already passed today, schedule for next calendar day at target UTC time
    const now = new Date();
    if (scheduled.getTime() <= now.getTime() + 15 * 60 * 1000) {
      scheduled.setUTCDate(scheduled.getUTCDate() + 1);
      return scheduled.toISOString();
    }

    return scheduled.toISOString();
  }

  /**
   * Generates a candidate Short and runs full 17-point QA.
   * Updates database state explicitly across IDEA -> RESEARCHING -> SCRIPTED -> PRODUCING -> QA_PENDING -> READY_TO_PUBLISH or QA_FAILED.
   * @param {string} topic
   * @param {Object} [options={}]
   * @returns {Promise<{ productionId: string, success: boolean, record: Object, qa: Object }>}
   */
  async generateCandidate(topic, options = {}) {
    await this.initialize();
    const prodId = options.productionId || `prod-short-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const safeBaseName = topic.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);

    const outputMp4 = options.outputMp4 || path.join(this.shortsDir, `${safeBaseName}_${Date.now()}.mp4`);
    const outputCover = options.outputCover || path.join(this.shortsDir, `${safeBaseName}_${Date.now()}_cover.jpg`);
    const reportPath = options.reportPath || path.join(this.scratchDir, `${safeBaseName}_report_${Date.now()}.json`);

    this.logger.info(`Starting daily candidate production [${prodId}] for topic: "${topic}"`);

    // State 1: IDEA
    let record = await this.db.saveDailyShortPublication({
      production_id: prodId,
      topic,
      title: `${topic} #Shorts`,
      status: 'IDEA',
      qa_status: 'PENDING',
      youtube_status: 'UNPUBLISHED'
    });

    try {
      // State 2: RESEARCHING
      await this.db.updateDailyShortPublication(prodId, { status: 'RESEARCHING' });

      // State 3: SCRIPTED & PRODUCING
      await this.db.updateDailyShortPublication(prodId, { status: 'PRODUCING' });

      // Execute Autonomous Content Orchestrator (Phase 6 17-beat engine)
      const orchestratorResult = await this.orchestrator.produceShort({
        topic,
        outputMp4,
        outputCover,
        reportPath,
        productionId: prodId
      });

      // State 4: QA_PENDING
      await this.db.updateDailyShortPublication(prodId, { status: 'QA_PENDING' });

      const contentHash = await this.computeContentHash(outputMp4);
      const qaResults = orchestratorResult.qaResults || {};
      const qaPassed = Boolean(orchestratorResult.productionReady && qaResults.allChecksPassed);

      if (!qaPassed) {
        this.logger.warn(`Candidate [${prodId}] failed QA verification`);
        record = await this.db.updateDailyShortPublication(prodId, {
          status: 'QA_FAILED',
          qa_status: 'FAILED',
          video_path: outputMp4,
          cover_path: outputCover,
          content_hash: contentHash,
          last_error: 'Failed one or more 17-point automated QA checks'
        });

        // Reject failed candidate so it cannot be published
        await this.db.updateDailyShortPublication(prodId, { status: 'REJECTED' });

        return {
          productionId: prodId,
          success: false,
          record,
          qa: qaResults
        };
      }

      // State 5: READY_TO_PUBLISH
      record = await this.db.updateDailyShortPublication(prodId, {
        status: 'READY_TO_PUBLISH',
        qa_status: 'PASSED',
        video_path: outputMp4,
        cover_path: outputCover,
        title: orchestratorResult.packaging?.title || `${topic} #Shorts`,
        description: orchestratorResult.packaging?.description || topic,
        content_hash: contentHash
      });

      this.logger.success(`Candidate [${prodId}] successfully produced and passed QA. Ready to publish.`);

      return {
        productionId: prodId,
        success: true,
        record,
        qa: qaResults,
        packaging: orchestratorResult.packaging
      };
    } catch (error) {
      this.logger.error(`Candidate production error for [${prodId}]:`, error);
      record = await this.db.updateDailyShortPublication(prodId, {
        status: 'REJECTED',
        qa_status: 'FAILED',
        last_error: error.message
      });

      return {
        productionId: prodId,
        success: false,
        record,
        error: error.message
      };
    }
  }

  /**
   * Publishes or schedules a verified candidate Short to YouTube.
   * Strictly enforces safety checks, idempotency, duplicate prevention, and the YOUTUBE_PUBLISH_ENABLED switch.
   * @param {string} productionId
   * @param {Object} [options={}]
   * @returns {Promise<Object>} Publish result
   */
  async publishCandidate(productionId, options = {}) {
    await this.initialize();
    let record = await this.db.getDailyShortPublication(productionId);
    if (!record) {
      throw new Error(`Production record not found: ${productionId}`);
    }

    // 1. Idempotency check: Already published or scheduled?
    if (['PUBLISHED', 'SCHEDULED'].includes(record.status) && record.youtube_video_id) {
      this.logger.info(`Candidate [${productionId}] already completed upload: ${record.youtube_video_id} (${record.status})`);
      return {
        success: true,
        alreadyPublished: true,
        record
      };
    }

    // 2. Strict QA Gate
    if (record.qa_status !== 'PASSED' || record.status === 'REJECTED') {
      const error = new Error(`Publishing blocked: candidate [${productionId}] has not passed QA verification (status: ${record.status})`);
      error.code = 'QA_GATE_BLOCKED';
      throw error;
    }

    // 3. Asset Existence Checks
    if (!record.video_path || !fs.existsSync(record.video_path)) {
      const error = new Error(`Publishing blocked: video file missing at ${record.video_path}`);
      error.code = 'VIDEO_FILE_MISSING';
      throw error;
    }

    // 4. Duplicate Content Hash Check
    if (record.content_hash) {
      const existingHash = await this.db.getRow(
        `SELECT production_id, youtube_video_id FROM daily_shorts_publications
         WHERE content_hash = ? AND status IN ('READY_TO_PUBLISH', 'UPLOADING', 'SCHEDULED', 'PUBLISHED') AND production_id != ? LIMIT 1`,
        [record.content_hash, productionId]
      );
      if (existingHash) {
        const error = new Error(`Publishing blocked: duplicate video content hash already published in [${existingHash.production_id}]`);
        error.code = 'DUPLICATE_CONTENT_HASH';
        await this.db.updateDailyShortPublication(productionId, { status: 'REJECTED', last_error: error.message });
        throw error;
      }
    }

    // 5. Safety Switch Check
    const publishEnabled = typeof options.forcePublish === 'boolean'
      ? options.forcePublish
      : (process.env.YOUTUBE_PUBLISH_ENABLED === 'true');
    if (!publishEnabled) {
      this.logger.info(`YOUTUBE_PUBLISH_ENABLED is false. Preserving [${productionId}] in READY_TO_PUBLISH state (Safe Dry-Run).`);
      record = await this.db.updateDailyShortPublication(productionId, {
        youtube_status: 'DRY_RUN_READY'
      });

      return {
        success: true,
        published: false,
        dryRun: true,
        message: 'Safe dry-run completed. Upload skipped because YOUTUBE_PUBLISH_ENABLED=false',
        record
      };
    }

    // 6. YouTube Upload Execution
    const scheduledTime = options.scheduledPublishTime || this.calculateScheduledPublishTime();
    const attempts = (record.upload_attempts || 0) + 1;

    await this.db.updateDailyShortPublication(productionId, {
      status: 'UPLOADING',
      youtube_status: 'UPLOADING',
      upload_attempts: attempts,
      scheduled_at: scheduledTime
    });

    try {
      const youtube = options.youtubeClient || this.youtubeClient || await this.authResolver.getYouTubeClient();

      const videoStream = fs.createReadStream(record.video_path);
      const cleanTitle = record.title.includes('#Shorts') ? record.title : `${record.title} #Shorts`;

      const videoUpload = await youtube.videos.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: cleanTitle.slice(0, 100),
            description: (record.description || record.title).slice(0, 5000),
            tags: ['Shorts', 'YouTubeShorts', 'MoneyInMinutes', 'Finance', 'Business'],
            categoryId: '27', // Education
            defaultLanguage: 'en',
            defaultAudioLanguage: 'en'
          },
          status: {
            privacyStatus: options.privacyStatus || 'private',
            publishAt: scheduledTime,
            selfDeclaredMadeForKids: false,
            containsSyntheticMedia: false
          }
        },
        media: {
          body: videoStream
        }
      });

      const videoId = videoUpload.data?.id;
      if (!videoId) {
        throw new Error('YouTube API responded without a valid video ID');
      }

      this.logger.info(`YouTube video uploaded successfully: ID ${videoId}`);

      // Optional thumbnail upload if cover image exists
      if (record.cover_path && fs.existsSync(record.cover_path) && youtube.thumbnails && typeof youtube.thumbnails.set === 'function') {
        try {
          await youtube.thumbnails.set({
            videoId,
            media: {
              body: fs.createReadStream(record.cover_path)
            }
          });
          this.logger.info(`Thumbnail uploaded for video: ${videoId}`);
        } catch (thumbErr) {
          this.logger.warn(`Thumbnail upload failed for ${videoId} (advisory): ${thumbErr.message}`);
        }
      }

      // Transition to SCHEDULED / PUBLISHED
      const finalStatus = scheduledTime ? 'SCHEDULED' : 'PUBLISHED';
      const now = new Date().toISOString();

      record = await this.db.updateDailyShortPublication(productionId, {
        status: finalStatus,
        youtube_status: finalStatus,
        youtube_video_id: videoId,
        scheduled_at: scheduledTime,
        published_at: finalStatus === 'PUBLISHED' ? now : null,
        last_error: null
      });

      this.logger.success(`Candidate [${productionId}] successfully ${finalStatus} on YouTube (ID: ${videoId})`);

      return {
        success: true,
        published: true,
        videoId,
        scheduledTime,
        status: finalStatus,
        record
      };
    } catch (uploadError) {
      this.logger.error(`YouTube upload failed for [${productionId}] (attempt ${attempts}):`, uploadError);

      record = await this.db.updateDailyShortPublication(productionId, {
        status: 'UPLOAD_FAILED',
        youtube_status: 'FAILED',
        last_error: uploadError.message
      });

      throw uploadError;
    }
  }

  /**
   * Executes the full daily publishing cycle with retry guarantees.
   * Guarantees at least 1 candidate is generated, verified through QA, and scheduled/published.
   * @param {Object} [options={}]
   * @returns {Promise<Object>} Execution report
   */
  async runDailyPublishingCycle(options = {}) {
    await this.initialize();
    this.logger.info('=== Starting Daily Shorts Autonomous Publishing Cycle ===');

    const status = await this.checkDailyStatus();
    if (status.hasMetDailyQuota && !options.force) {
      this.logger.info(`Daily publishing quota already met for today (${status.totalCompleted}/${this.dailyMinimum} completed).`);
      return {
        completed: true,
        quotaMet: true,
        publishedCount: status.publishedCount,
        scheduledCount: status.scheduledCount,
        records: status.records
      };
    }

    const cycleAttempts = [];
    const excludedTopics = [];
    let cycleSuccess = false;
    let successfulRecord = null;

    for (let candidateIdx = 1; candidateIdx <= this.maxCandidateAttempts; candidateIdx++) {
      this.logger.info(`\n--- Daily Cycle Attempt ${candidateIdx}/${this.maxCandidateAttempts} ---`);

      // 1. Discover fresh topic
      const topic = options.topic || await this.discoverNextTopic(excludedTopics);
      excludedTopics.push(topic);

      // 2. Produce candidate & verify QA
      const prodResult = await this.generateCandidate(topic, options);
      cycleAttempts.push({
        attempt: candidateIdx,
        topic,
        productionId: prodResult.productionId,
        qaPassed: prodResult.success,
        error: prodResult.error || null
      });

      if (!prodResult.success) {
        this.logger.warn(`Candidate ${candidateIdx} rejected by QA gate. Generating replacement topic...`);
        continue;
      }

      // 3. Publish candidate with retry loop on transient upload errors
      let uploadSuccess = false;
      for (let uploadIdx = 1; uploadIdx <= this.maxUploadAttempts; uploadIdx++) {
        try {
          const pubResult = await this.publishCandidate(prodResult.productionId, options);
          uploadSuccess = true;
          successfulRecord = pubResult.record;
          break;
        } catch (uploadErr) {
          this.logger.warn(`Upload attempt ${uploadIdx}/${this.maxUploadAttempts} failed: ${uploadErr.message}`);
          if (uploadIdx < this.maxUploadAttempts) {
            // Wait 2000ms * uploadIdx before retrying upload
            await new Promise(r => setTimeout(r, 1000 * uploadIdx));
          }
        }
      }

      if (uploadSuccess) {
        cycleSuccess = true;
        break;
      } else {
        this.logger.error(`All upload attempts failed for candidate ${prodResult.productionId}. Trying replacement candidate...`);
      }
    }

    const finalReport = {
      timestamp: new Date().toISOString(),
      completed: cycleSuccess,
      quotaMet: cycleSuccess,
      attempts: cycleAttempts,
      record: successfulRecord,
      publishingEnabled: process.env.YOUTUBE_PUBLISH_ENABLED === 'true' || options.forcePublish === true
    };

    if (cycleSuccess) {
      this.logger.success('=== Daily Shorts Publishing Cycle Finished Successfully ===');
    } else {
      this.logger.error('=== Daily Shorts Publishing Cycle Failed to meet daily quota ===');
    }

    return finalReport;
  }
}

module.exports = {
  DailyShortsPublisher,
  CURATED_TOPIC_POOL
};
