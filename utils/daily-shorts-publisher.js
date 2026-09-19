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

const TOPIC_CONTENT_CONCEPTS = {
  airline_miles: {
    requiredConcepts: [/\b(airlines?|frequent\s+flyer|miles?|loyalty|skymiles|flight|flights)\b/i],
    alienChecks: [
      { label: 'NVIDIA/AI compute', regex: /\b(nvidia|cuda|gpus?|h100|b200|hopper|blackwell)\b/i },
      { label: 'Costco', regex: /\b(costco|kirkland|warehouse\s+club)\b/i },
      { label: 'Disney', regex: /\b(disney|theme\s+parks?|disneyland|genie\+)\b/i },
      { label: 'Fast Food', regex: /\b(fast\s*[-_]?\s*food|dollar\s+menu|value\s+menu)\b/i }
    ]
  },
  nvidia: {
    requiredConcepts: [/\b(nvidia|cuda|gpus?|ai\s+compute|compute\s+moat|chips?|hopper)\b/i],
    alienChecks: [
      { label: 'Airline', regex: /\b(airlines?|frequent\s+flyer|skymiles)\b/i },
      { label: 'Costco', regex: /\b(costco|kirkland|warehouse\s+club)\b/i },
      { label: 'Disney', regex: /\b(disney|theme\s+parks?|disneyland|genie\+)\b/i },
      { label: 'Fast Food', regex: /\b(fast\s*[-_]?\s*food|dollar\s+menu|value\s+menu)\b/i }
    ]
  },
  fast_food: {
    requiredConcepts: [/\b(fast\s*[-_]?\s*food|value\s+menu|dollar\s+menu|burger|fries|mcdonald)\b/i],
    alienChecks: [
      { label: 'NVIDIA/AI compute', regex: /\b(nvidia|cuda|gpus?)\b/i },
      { label: 'Airline', regex: /\b(airlines?|frequent\s+flyer|skymiles)\b/i },
      { label: 'Costco', regex: /\b(costco|kirkland)\b/i },
      { label: 'Disney', regex: /\b(disney|theme\s+parks?|disneyland)\b/i }
    ]
  },
  costco: {
    requiredConcepts: [/\b(costco|kirkland|wholesale|warehouse\s+club|membership\s+fees?)\b/i],
    alienChecks: [
      { label: 'NVIDIA/AI compute', regex: /\b(nvidia|cuda|gpus?|h100|b200)\b/i },
      { label: 'Airline', regex: /\b(airlines?|frequent\s+flyer|skymiles)\b/i },
      { label: 'Disney', regex: /\b(disney|theme\s+parks?|disneyland|genie\+)\b/i },
      { label: 'Fast Food', regex: /\b(fast\s*[-_]?\s*food|dollar\s+menu)\b/i }
    ]
  },
  swipe_fees: {
    requiredConcepts: [/\b(visa|mastercard|swipe\s+fees?|interchange|card\s+processing)\b/i],
    alienChecks: [
      { label: 'NVIDIA/AI compute', regex: /\b(nvidia|cuda|gpus?)\b/i },
      { label: 'Costco', regex: /\b(costco|kirkland)\b/i },
      { label: 'Airline', regex: /\b(airlines?|frequent\s+flyer|skymiles)\b/i }
    ]
  },
  apple: {
    requiredConcepts: [/\b(apple|iphone|app\s+store|macbook|ios)\b/i],
    alienChecks: [
      { label: 'NVIDIA/AI compute', regex: /\b(nvidia|cuda|h100|b200)\b/i },
      { label: 'Costco', regex: /\b(costco|kirkland)\b/i },
      { label: 'Airline', regex: /\b(airlines?|frequent\s+flyer)\b/i }
    ]
  },
  disney: {
    requiredConcepts: [/\b(disney|theme\s+parks?|tickets?|disneyland|disney\s+world)\b/i],
    alienChecks: [
      { label: 'NVIDIA/AI compute', regex: /\b(nvidia|cuda|gpus?)\b/i },
      { label: 'Costco', regex: /\b(costco|kirkland)\b/i },
      { label: 'Airline', regex: /\b(airlines?|frequent\s+flyer)\b/i }
    ]
  },
  streaming: {
    requiredConcepts: [/\b(streaming|subscription|subscriptions|netflix|price\s*hikes?|hulu)\b/i],
    alienChecks: [
      { label: 'NVIDIA/AI compute', regex: /\b(nvidia|cuda|gpus?)\b/i },
      { label: 'Costco', regex: /\b(costco|kirkland)\b/i },
      { label: 'Airline', regex: /\b(airlines?|frequent\s+flyer)\b/i }
    ]
  }
};

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
    this.dailyMinimum = Number(options.dailyMinimum || process.env.DAILY_SHORTS_TARGET_COUNT || process.env.DAILY_SHORT_MINIMUM || 2);
    this.targetCount = Number(options.targetCount || process.env.DAILY_SHORTS_TARGET_COUNT || this.dailyMinimum || 2);
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

    // FIX 6: Recover zombie PRODUCING records on startup
    await this.recoverStaleProducingRecords();
  }

  /**
   * FIX 6: Safe recovery handling for zombie PRODUCING records.
   * Any record left in PRODUCING, RESEARCHING, QA_PENDING or UPLOADING for > 15 minutes is transitioned to FAILED.
   */
  async recoverStaleProducingRecords() {
    try {
      const staleRows = await this.db.getAllRows(
        `SELECT production_id, topic, status, created_at FROM daily_shorts_publications
         WHERE status IN ('PRODUCING', 'RESEARCHING', 'QA_PENDING', 'UPLOADING')
           AND datetime(created_at) <= datetime('now', '-15 minutes')`
      );
      for (const stale of staleRows) {
        this.logger.warn(`Recovering zombie publication [${stale.production_id}] stuck in ${stale.status}. Transitioning to FAILED.`);
        await this.db.updateDailyShortPublication(stale.production_id, {
          status: 'FAILED',
          qa_status: 'FAILED',
          last_error: `Auto-recovered from stale ${stale.status} state after timeout`
        });
      }
    } catch (err) {
      this.logger.warn(`Stale producing recovery check advisory error: ${err.message}`);
    }
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
   * Enforces multi-dimensional semantic deduplication and cross-slot category diversity.
   * @param {Array<string>} [excludedTopics=[]]
   * @param {string|null} [priorTopicInBatch=null]
   * @returns {Promise<string>}
   */
  async discoverNextTopic(excludedTopics = [], priorTopicInBatch = null) {
    await this.initialize();

    const recentRecords = await this.db.listDailyShortPublications({ limit: 100 });
    const historicalTopics = recentRecords
      .filter(r => ['READY_TO_PUBLISH', 'UPLOADING', 'SCHEDULED', 'PUBLISHED', 'QA_FAILED', 'REJECTED', 'FAILED'].includes(r.status))
      .map(r => r.topic);

    const allExcluded = [...new Set([...excludedTopics, ...historicalTopics])];

    for (const candidate of CURATED_TOPIC_POOL) {
      if (allExcluded.includes(candidate)) continue;

      // Enforce category diversity if another topic is produced in the same batch
      if (priorTopicInBatch) {
        const diversityCheck = this.dedupService.enforceTopicDiversity(priorTopicInBatch, candidate);
        if (!diversityCheck.allowed) {
          continue;
        }
      }

      const dupCheck = this.dedupService.isDuplicate(candidate, allExcluded);
      if (!dupCheck.isDuplicate) {
        const dbDup = await this.db.isDailyShortTopicDuplicate(candidate, 90);
        if (!dbDup) {
          return candidate;
        }
      }
    }

    // Fallback if pool is exhausted: generate unique topic with timestamp
    const fallback = `Market Pulse: Consumer Finance & Business Tactics (${new Date().toISOString().slice(0, 10)} - ${Date.now()})`;
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
   * Calculates distinct, sequential future publishing timestamps for daily or backlog items.
   * Ensures no duplicate scheduled publish timestamps on YouTube.
   * @param {Date} [targetDate=new Date()]
   * @param {number} [offsetIndex=0] Sequential offset index for multiple backlog obligations
   * @param {string} [timeStr] e.g. "17:00"
   * @returns {string} ISO timestamp
   */
  calculateNextAvailablePublishTime(targetDate = new Date(), offsetIndex = 0, timeStr = this.dailyPublishTime) {
    const [hours, minutes] = timeStr.split(':').map(n => parseInt(n, 10) || 0);
    const scheduled = new Date(targetDate);
    scheduled.setUTCHours(hours, minutes, 0, 0);

    const now = new Date();
    // If target UTC time has already passed today (or is within 15 minutes), advance by at least 1 day
    if (scheduled.getTime() <= now.getTime() + 15 * 60 * 1000) {
      scheduled.setUTCDate(scheduled.getUTCDate() + 1);
    }

    // Advance by offsetIndex days for sequential future scheduling
    if (offsetIndex > 0) {
      scheduled.setUTCDate(scheduled.getUTCDate() + offsetIndex);
    }

    return scheduled.toISOString();
  }

  /**
   * Identifies all elapsed publishing days that lack a completed Short.
   * Persists them in SQLite backlog as PENDING.
   * @param {Object} [options={}]
   * @returns {Promise<Array<Object>>} List of pending backlog obligations
   */
  async detectMissedDays(options = {}) {
    await this.initialize();
    return this.db.getMissedPublishingDays(options);
  }

  /**
   * Recovers missed publishing obligations sequentially with genuine new content.
   * Never reuses old videos. Strictly enforces QA, deduplication, and distinct future scheduling.
   * @param {Object} [options={}]
   * @returns {Promise<{ recovered: number, totalMissed: number, results: Array }>}
   */
  async recoverMissedShorts(options = {}) {
    await this.initialize();
    const pending = await this.detectMissedDays(options);

    if (!pending || pending.length === 0) {
      this.logger.info('No missed publishing obligations found.');
      return { recovered: 0, totalMissed: 0, results: [] };
    }

    this.logger.info(`Detected ${pending.length} missed publishing obligations. Starting sequential recovery...`);

    const results = [];
    const excludedTopics = [];
    let priorTopic = null;
    let recoveredCount = 0;

    // Sequential processing: 1 video at a time
    for (let i = 0; i < pending.length; i++) {
      const obligation = pending[i];
      const targetDate = obligation.target_date;
      const slotIndex = obligation.slot_index || 1;
      this.logger.info(`\n[Backlog Recovery] Processing missed obligation ${i + 1}/${pending.length} for date: ${targetDate} (Slot ${slotIndex})`);

      try {
        // 1. Discover genuinely fresh topic respecting diversity
        const topic = await this.discoverNextTopic(excludedTopics, priorTopic);
        excludedTopics.push(topic);
        priorTopic = topic;

        // 2. Generate candidate and run 17-point QA
        const prodResult = await this.generateCandidate(topic, options);
        if (!prodResult.success) {
          const errMessage = prodResult.error || 'Candidate failed 17-point QA verification';
          await this.db.updateBacklogObligation(targetDate, {
            attempt_count: (obligation.attempt_count || 0) + 1,
            last_error: errMessage
          }, slotIndex);
          results.push({ targetDate, slotIndex, success: false, error: errMessage });
          this.logger.warn(`[Backlog Recovery] Generation failed for date ${targetDate} (Slot ${slotIndex}). Obligation remains PENDING.`);
          continue;
        }

        // 3. Allocate unique future publish timestamp (sequential days into future)
        const scheduledTime = this.calculateNextAvailablePublishTime(new Date(), i + 1);

        // 4. Publish / schedule candidate
        const pubResult = await this.publishCandidate(prodResult.productionId, {
          ...options,
          scheduledPublishTime: scheduledTime
        });

        // 5. Mark obligation as RECOVERED
        await this.db.updateBacklogObligation(targetDate, {
          status: 'RECOVERED',
          production_id: prodResult.productionId,
          scheduled_for: scheduledTime,
          last_error: null
        }, slotIndex);

        recoveredCount++;
        results.push({
          targetDate,
          slotIndex,
          success: true,
          productionId: prodResult.productionId,
          topic,
          scheduledTime,
          status: pubResult.status
        });

        this.logger.success(`[Backlog Recovery] Successfully recovered missed obligation for ${targetDate} (Slot ${slotIndex}) (Scheduled for: ${scheduledTime})`);
      } catch (recoveryErr) {
        this.logger.error(`[Backlog Recovery] Failed to recover missed obligation for ${targetDate} (Slot ${slotIndex}):`, recoveryErr);
        await this.db.updateBacklogObligation(targetDate, {
          attempt_count: (obligation.attempt_count || 0) + 1,
          last_error: recoveryErr.message
        }, slotIndex);
        results.push({ targetDate, slotIndex, success: false, error: recoveryErr.message });
        // Obligation remains PENDING in database
      }
    }

    return {
      recovered: recoveredCount,
      totalMissed: pending.length,
      results
    };
  }

  /**
   * FIX 4: Production Integrity Gate
   * Verifies candidate integrity across 12 strict criteria before candidate is marked READY_TO_PUBLISH or published.
   * Rejects the candidate if any check fails.
   */
  async validateContentIntegrity(candidateData = {}) {
    const {
      topic,
      productionId,
      videoPath,
      report,
      qaResults = {}
    } = candidateData;

    const failures = [];
    const { resolveTopicKey } = require('./curated-topic-content');
    const topicKey = candidateData.resolvedTopicKey || resolveTopicKey(topic);
    if (candidateData.resolvedTopicKey && candidateData.resolvedTopicKey !== resolveTopicKey(topic)) {
      failures.push(`Topic resolution mismatch: provided key [${candidateData.resolvedTopicKey}] does not match resolved key [${resolveTopicKey(topic)}] for "${topic}"`);
    }
    const topicRule = TOPIC_CONTENT_CONCEPTS[topicKey];

    // 1. Research claims verification: must contain required concepts and NO alien claims
    const claims = report?.truthAnchorAudit?.claims || [];
    if (claims.length > 0 && topicKey !== 'fallback' && topicRule) {
      const claimsText = claims.map(c => `${c.statement || ''} ${c.label || ''} ${c.source || ''} ${c.id || ''}`).join(' ').toLowerCase();
      const hasRequiredClaim = topicRule.requiredConcepts.some(rx => rx.test(claimsText));
      if (!hasRequiredClaim) {
        failures.push(`Topic identity mismatch: ${topicKey} candidate lacks ${topicKey} research claims`);
      }
      for (const alien of topicRule.alienChecks) {
        if (alien.regex.test(claimsText)) {
          failures.push(`Alien Truth Anchor research detected: non-${alien.label} candidate contains ${alien.label} research claims`);
        }
      }
    }

    // 2. Script content verification: must contain required concepts and NO alien content
    const scriptText = (report?.scriptSummary?.fullText || '').toLowerCase();
    if (scriptText) {
      if (topicKey !== 'fallback' && topicRule) {
        const hasRequiredScript = topicRule.requiredConcepts.some(rx => rx.test(scriptText));
        if (!hasRequiredScript) {
          failures.push(`Script topic mismatch: "${topic}" resolved to [${topicKey}] but script lacks required domain concepts`);
        }
        for (const alien of topicRule.alienChecks) {
          if (alien.regex.test(scriptText)) {
            failures.push(`Script topic mismatch: [${topicKey}] candidate script contains alien ${alien.label} content`);
          }
        }
      }
      if (report?.totalBeats && scriptText.length < 50) {
        failures.push('Script missing or insufficiently detailed');
      }
    }

    // 3. Beat descriptions / visual plan verification
    const provenanceSummary = report?.provenanceSummary;
    if (provenanceSummary && (provenanceSummary.categoryD_ProceduralGraphics || 0) + (provenanceSummary.categoryB_AIGeneratedImageBRoll || 0) === 0) {
      failures.push('Visual plan lacks verified procedural graphics or B-roll for topic');
    }

    // 4. Visual assets & build directory verification
    if (report?.buildTemp) {
      const bt = report.buildTemp.toLowerCase();
      if (topicKey !== 'costco' && bt.includes('costco')) {
        failures.push('Visual assets mismatch: non-Costco candidate shares Costco build directory');
      }
      if (topicKey !== 'nvidia' && bt.includes('nvidia')) {
        failures.push('Visual assets mismatch: non-NVIDIA candidate shares NVIDIA build directory');
      }
      if (topicKey !== 'airline_miles' && bt.includes('airline')) {
        failures.push('Visual assets mismatch: non-Airline candidate shares Airline build directory');
      }
    }

    // 5. Packaging title & tags verification
    const packagingTitle = (report?.packaging?.title || '').toLowerCase();
    const packagingTags = (Array.isArray(report?.packaging?.tags) ? report.packaging.tags.join(' ') : '').toLowerCase();
    if (topicKey !== 'fallback' && topicRule) {
      for (const alien of topicRule.alienChecks) {
        if (alien.regex.test(packagingTitle)) {
          failures.push(`Packaging title mismatch: [${topicKey}] candidate title contains alien ${alien.label} terminology`);
        }
        if (alien.regex.test(packagingTags)) {
          failures.push(`Packaging tags mismatch: [${topicKey}] candidate tags contain alien ${alien.label} tags`);
        }
      }
    }

    // 6. Presenter context is appropriate
    const characterId = report?.character?.id;
    if (characterId && !['david_chen', 'elena_rostova', 'marcus_vance'].includes(characterId)) {
      failures.push(`Invalid or unapproved presenter character context: "${characterId || 'none'}"`);
    }

    // 7. Manifest references current topic
    if (report?.topic && report.topic !== topic) {
      failures.push(`Manifest topic mismatch: expected "${topic}" but manifest reports "${report?.topic}"`);
    }

    // 8. Manifest references current production ID
    if (report?.productionId && report.productionId !== productionId) {
      failures.push(`Manifest productionId mismatch: expected "${productionId}" but manifest reports "${report?.productionId}"`);
    }

    // 9. Final output path belongs to current production
    if (!videoPath || !fs.existsSync(videoPath)) {
      failures.push(`Output MP4 missing at expected path: ${videoPath}`);
    } else {
      const st = await fsPromises.stat(videoPath);
      if (st.size === 0) {
        failures.push('Output MP4 is empty');
      }
    }

    // 10. Final MP4 SHA-256 is not equal to any previously published MP4
    const contentHash = await this.computeContentHash(videoPath);
    if (!contentHash) {
      failures.push('Unable to compute SHA-256 content hash for final MP4');
    } else {
      const duplicateRow = await this.db.getRow(
        `SELECT production_id, topic, status FROM daily_shorts_publications
         WHERE content_hash = ? AND production_id != ? AND status IN ('READY_TO_PUBLISH', 'UPLOADING', 'SCHEDULED', 'PUBLISHED')
         LIMIT 1`,
        [contentHash, productionId]
      );
      if (duplicateRow) {
        failures.push(`Byte-for-byte duplicate blocked: SHA-256 matches production [${duplicateRow.production_id}] ("${duplicateRow.topic}")`);
      }
    }

    // 11. Final MP4 representative frame verification (non-empty, non-black frames)
    if (qaResults && qaResults.checks) {
      if (qaResults.checks.noBlackFrames === false) {
        failures.push('Visual frame verification failed: black or invalid frames detected');
      }
      if (qaResults.checks.representativeFramesExtracted === false) {
        failures.push('Representative milestone frames failed to extract');
      }
    }

    // 12. No stale output from another production is being reused
    if (videoPath) {
      const baseLower = path.basename(videoPath).toLowerCase();
      if (topicKey !== 'costco' && baseLower.includes('costco')) {
        failures.push(`Stale file reuse detected: output file name ${path.basename(videoPath)} does not match topic`);
      }
      if (topicKey !== 'nvidia' && baseLower.includes('nvidia')) {
        failures.push(`Stale file reuse detected: output file name ${path.basename(videoPath)} does not match topic`);
      }
      if (topicKey !== 'airline_miles' && (baseLower.includes('airline') || baseLower.includes('miles'))) {
        failures.push(`Stale file reuse detected: output file name ${path.basename(videoPath)} does not match topic`);
      }
    }

    return {
      valid: failures.length === 0,
      failures,
      contentHash
    };
  }

  /**
   * Generates a candidate Short and runs full 17-point QA.
   * Updates database state explicitly across IDEA -> RESEARCHING -> SCRIPTED -> PRODUCING -> QA_PENDING -> READY_TO_PUBLISH or FAILED.
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

      // FIX 4: Production Content Integrity Gate
      const integrity = await this.validateContentIntegrity({
        topic,
        productionId: prodId,
        videoPath: outputMp4,
        report: orchestratorResult,
        qaResults
      });

      if (!integrity.valid) {
        const errorMsg = `Integrity gate rejected candidate: ${integrity.failures.join('; ')}`;
        this.logger.error(`Candidate [${prodId}] failed content integrity: ${errorMsg}`);
        record = await this.db.updateDailyShortPublication(prodId, {
          status: 'REJECTED',
          qa_status: 'FAILED',
          video_path: outputMp4,
          cover_path: outputCover,
          content_hash: integrity.contentHash || contentHash,
          last_error: errorMsg
        });

        return {
          productionId: prodId,
          success: false,
          error: errorMsg,
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
        content_hash: integrity.contentHash || contentHash
      });

      this.logger.success(`Candidate [${prodId}] successfully produced and passed QA & Integrity gates. Ready to publish.`);

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

    // 5. Final Upload Safety Gate: Topic Integrity, Semantic Content Match & Asset Integrity (Fix 4)
    const integrityReport = options.report || {
      topic: record.topic,
      productionId,
      scriptSummary: { fullText: record.description || record.title || '' },
      character: { id: record.character_id || 'david_chen' },
      truthAnchorAudit: { claims: [] }
    };
    const preflightIntegrity = await this.validateContentIntegrity({
      topic: record.topic,
      productionId,
      videoPath: record.video_path,
      report: integrityReport
    });
    if (!preflightIntegrity.valid) {
      const error = new Error(`Publishing blocked by Content Integrity Gate: ${preflightIntegrity.failures.join('; ')}`);
      error.code = 'CONTENT_INTEGRITY_BLOCKED';
      await this.db.updateDailyShortPublication(productionId, { status: 'REJECTED', last_error: error.message });
      throw error;
    }

    // 6. Safety Switch Check
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
      const topicWords = (record.topic || '')
        .split(/\s+/)
        .map(w => w.replace(/[^a-zA-Z0-9]/g, ''))
        .filter(w => w.length > 3 && !['with', 'from', 'this', 'that', 'what', 'when', 'where', 'which', 'about'].includes(w.toLowerCase()));
      const dynamicTags = Array.from(new Set(['Shorts', 'YouTubeShorts', 'MoneyInMinutes', 'Finance', 'Business', ...topicWords])).slice(0, 15);

      const videoUpload = await youtube.videos.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: cleanTitle.slice(0, 100),
            description: (record.description || record.title).slice(0, 5000),
            tags: dynamicTags,
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
   * Executes the full daily publishing cycle with retry guarantees and missed-day recovery.
   * Guarantees all missed backlog obligations are recovered AND exactly targetCount (default 2)
   * independent Shorts are scheduled/published for today at the daily publishing time (10:30 PM IST / 17:00 UTC).
   * @param {Object} [options={}]
   * @returns {Promise<Object>} Execution report
   */
  async runDailyPublishingCycle(options = {}) {
    if (DailyShortsPublisher.isPublishingActive) {
      this.logger.warn('DailyShortsPublisher cycle is already running; skipping overlapping execution.');
      return {
        completed: false,
        skipped: true,
        reason: 'Publishing cycle already active'
      };
    }

    DailyShortsPublisher.isPublishingActive = true;
    try {
      await this.initialize();
      this.logger.info('=== Starting Daily Shorts Autonomous Publishing Cycle ===');

    // 1. Recover any missed publishing obligations from previous days
    let backlogReport = { recovered: 0, totalMissed: 0, results: [] };
    if (options.skipBacklogRecovery !== true) {
      try {
        backlogReport = await this.recoverMissedShorts(options);
      } catch (backlogErr) {
        this.logger.error('Error during backlog recovery:', backlogErr);
      }
    }

    // 2. Check today's quota
    const status = await this.checkDailyStatus();
    if (status.hasMetDailyQuota && !options.force) {
      this.logger.info(`Daily publishing quota already met for today (${status.totalCompleted}/${this.dailyMinimum} completed).`);
      return {
        completed: true,
        quotaMet: true,
        targetCount: this.dailyMinimum,
        backlogRecovery: backlogReport,
        publishedCount: status.publishedCount,
        scheduledCount: status.scheduledCount,
        records: status.records
      };
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const slotsCompleted = status.records.filter(r => ['SCHEDULED', 'PUBLISHED', 'READY_TO_PUBLISH'].includes(r.status)).length;
    const startSlot = options.force ? 1 : slotsCompleted + 1;
    const totalSlots = this.dailyMinimum;

    const cycleResults = [];
    const excludedTopics = status.records.map(r => r.topic).filter(Boolean);
    let priorTopicInBatch = status.records.length > 0 ? status.records[status.records.length - 1].topic : null;

    // Both Shorts are scheduled for the exact same daily publishing time: 10:30 PM IST (17:00 UTC)
    const todayPublishTime = options.scheduledPublishTime || this.calculateScheduledPublishTime(new Date());

    for (let slotIndex = startSlot; slotIndex <= totalSlots; slotIndex++) {
      this.logger.info(`\n=== Processing Daily Short Slot ${slotIndex}/${totalSlots} ===`);
      let slotSuccess = false;
      let slotRecord = null;
      const slotAttempts = [];

      for (let candidateIdx = 1; candidateIdx <= this.maxCandidateAttempts; candidateIdx++) {
        this.logger.info(`--- Slot ${slotIndex} Candidate Attempt ${candidateIdx}/${this.maxCandidateAttempts} ---`);

        // 1. Discover fresh topic enforcing cross-slot category diversity
        const topic = (slotIndex === 1 && options.topic)
          ? options.topic
          : await this.discoverNextTopic(excludedTopics, priorTopicInBatch);
        excludedTopics.push(topic);

        // 2. Produce candidate & verify QA
        const prodResult = await this.generateCandidate(topic, options);
        slotAttempts.push({
          slotIndex,
          attempt: candidateIdx,
          topic,
          productionId: prodResult.productionId,
          qaPassed: prodResult.success,
          error: prodResult.error || null
        });

        if (!prodResult.success) {
          this.logger.warn(`Slot ${slotIndex} candidate ${candidateIdx} rejected by QA gate. Generating replacement topic...`);
          continue;
        }

        // 3. Publish candidate with retry loop on transient upload errors
        let uploadSuccess = false;
        for (let uploadIdx = 1; uploadIdx <= this.maxUploadAttempts; uploadIdx++) {
          try {
            const pubResult = await this.publishCandidate(prodResult.productionId, {
              ...options,
              scheduledPublishTime: todayPublishTime
            });
            uploadSuccess = true;
            slotRecord = pubResult.record;
            break;
          } catch (uploadErr) {
            this.logger.warn(`Slot ${slotIndex} upload attempt ${uploadIdx}/${this.maxUploadAttempts} failed: ${uploadErr.message}`);
            if (uploadIdx < this.maxUploadAttempts) {
              await new Promise(r => setTimeout(r, 1000 * uploadIdx));
            }
          }
        }

        if (uploadSuccess) {
          slotSuccess = true;
          priorTopicInBatch = topic;
          // Record slot obligation as satisfied in backlog
          await this.db.saveBacklogObligation({
            target_date: todayStr,
            slot_index: slotIndex,
            status: 'SATISFIED',
            production_id: slotRecord?.production_id,
            scheduled_for: slotRecord?.scheduled_at || todayPublishTime
          });
          break;
        } else {
          this.logger.error(`All upload attempts failed for candidate ${prodResult.productionId}. Trying replacement candidate...`);
        }
      }

      cycleResults.push({
        slotIndex,
        success: slotSuccess,
        record: slotRecord,
        attempts: slotAttempts
      });

      if (!slotSuccess) {
        this.logger.error(`Failed to complete Short for Slot ${slotIndex} after ${this.maxCandidateAttempts} candidate attempts.`);
      }
    }

    const updatedStatus = await this.checkDailyStatus();
    const allSlotsCompleted = updatedStatus.totalCompleted >= this.dailyMinimum;

    const finalReport = {
      timestamp: new Date().toISOString(),
      targetCount: this.dailyMinimum,
      completedCount: updatedStatus.totalCompleted,
      quotaMet: allSlotsCompleted,
      completed: allSlotsCompleted,
      backlogRecovery: backlogReport,
      slots: cycleResults,
      publishedCount: updatedStatus.publishedCount,
      scheduledCount: updatedStatus.scheduledCount,
      records: updatedStatus.records,
      publishingEnabled: process.env.YOUTUBE_PUBLISH_ENABLED === 'true' || options.forcePublish === true
    };

    if (finalReport.completed) {
      this.logger.success(`=== Daily Shorts Publishing Cycle Finished Successfully (${updatedStatus.totalCompleted}/${this.dailyMinimum} completed) ===`);
    } else {
      this.logger.error(`=== Daily Shorts Publishing Cycle Incomplete (${updatedStatus.totalCompleted}/${this.dailyMinimum} completed) ===`);
    }

    return finalReport;
    } finally {
      DailyShortsPublisher.isPublishingActive = false;
    }
  }
}

module.exports = {
  DailyShortsPublisher,
  CURATED_TOPIC_POOL
};
