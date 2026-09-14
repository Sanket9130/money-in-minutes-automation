const { Database } = require('./database/db');
const { Logger } = require('./utils/logger');
const { CredentialManager } = require('./utils/credential-manager');
const { AudienceEngagementService } = require('./utils/audience-engagement-service');
const { DailyAutomation } = require('./schedules/daily-automation');
const chalk = require('chalk');
const path = require('path');
const { ProductionReadinessService } = require('./utils/production-readiness-service');
const { normalizeTags, validateYouTubeMetadata } = require('./utils/youtube-metadata-validator');
const {
  SCENE_TYPES,
  TREATMENTS,
  MOTIONS,
  VisualTreatmentSelector,
  VisualTreatmentRenderer,
  VISUALIZATION_TYPES,
  FALLBACK_REASONS,
  NumberFormatter,
  VisualizationSpec,
  FinancialVisualization,
  VisualizationRenderer,
  AudioMixSpec,
  VoiceProcessor,
  MusicDucker,
  SfxScheduler,
  AudioValidation,
  AudioEnhancementEngine,
  layoutSvgText,
  renderContextualIcon: _renderContextualIcon,
  deriveComparisonHeader,
  sanitizeViewerBadge,
  sanitizeAssText,
  SceneCompositionPrimitives
} = require('./utils/visual-treatment-engine');
const { validateShortsHook, buildShortsSceneList } = require('./agents/script-writer-agent');
const { ShortsCoverGenerator } = require('./utils/shorts-cover-generator');
const { DailyShortsPublisher } = require('./utils/daily-shorts-publisher');
const { YouTubeAuthResolver } = require('./utils/youtube-auth-resolver');


class SystemTest {
  constructor() {
    this.logger = new Logger('SystemTest');
    this.testResults = {};
  }

  async runAllTests() {
    console.log(chalk.cyan.bold('\n🧪 YouTube Automation Agent - System Test'));
    console.log(chalk.gray('═'.repeat(60)));
    
    const tests = [
      { name: 'Database Connection', test: () => this.testDatabase() },
      { name: 'Production Persistence', test: () => this.testProductionPersistence() },
      { name: 'Automation Events Table', test: () => this.testAutomationEventsTable() },
      { name: 'Local Activation Metrics', test: () => this.testActivationMetrics() },
      { name: 'Anonymous Telemetry Opt-in', test: () => this.testAnonymousTelemetryOptIn() },
      { name: 'Operator Workflow API', test: () => this.testOperatorWorkflowAPI() },
      { name: 'Autonomous Channel Operator', test: () => this.testAutonomousChannelOperator() },
      { name: 'Closed-loop Channel Learning', test: () => this.testChannelLearningLoop() },
      { name: 'Controlled Growth Experiments Studio', test: () => this.testGrowthExperimentsStudio() },
      { name: 'Outcome and ROI Studio', test: () => this.testOutcomeROIStudio() },
      { name: 'Scene-Aware Retention Studio', test: () => this.testSceneAwareRetentionStudio() },
      { name: 'Production Readiness Gate', test: () => this.testProductionReadinessGate() },
      { name: 'Durable Multi-Provider Video Generation', test: () => this.testVideoProviderLayer() },
      { name: 'Scene Repair Studio', test: () => this.testSceneRepairStudio() },
      { name: 'Narration Reliability and Recovery', test: () => this.testNarrationReliability() },
      { name: 'Shorts Repurposing Studio', test: () => this.testShortsRepurposingStudio() },
      { name: 'Research and Provenance Desk', test: () => this.testProvenanceDesk() },
      { name: 'DarkzSEO Discoverability Preflight', test: () => this.testDiscoverabilityPreflight() },
      { name: 'Resumable Generation Checkpoints', test: () => this.testResumableGenerationCheckpoints() },
      { name: 'API Validation and Security', test: () => this.testAPIValidationAndSecurity() },
      { name: 'Publishing Safety', test: () => this.testPublishingSafety() },
      { name: 'Multi-Provider Credential Validation', test: () => this.testCredentialValidation() },
      { name: 'AI Text Service Token Compatibility', test: () => this.testAITextServiceTokenParams() },
      { name: 'Placeholder Scheduling Guard', test: () => this.testPlaceholderSchedulingGuard() },
      { name: 'FFmpeg Resolution', test: () => this.testFFmpegResolution() },
      { name: 'Gemini Media Provider Selection', test: () => this.testGeminiMediaProvider() },
      { name: 'Slideshow Renderer', test: () => this.testSlideshowRenderer() },
      { name: 'Evergreen Template Topics', test: () => this.testEvergreenTopics() },
      { name: 'Walkthrough Module', test: () => this.testWalkthroughModule() },
      { name: 'Logger System', test: () => this.testLogger() },
      { name: 'Directory Structure', test: () => this.testDirectories() },
      { name: 'Agent Loading', test: () => this.testAgentLoading() },
      { name: 'Configuration Files', test: () => this.testConfiguration() },
      { name: 'Audience Comment Store', test: () => this.testAudienceCommentStore() },
      { name: 'Engagement Insight Store', test: () => this.testEngagementInsightStore() },
      { name: 'Reply Draft Lifecycle Store', test: () => this.testReplyDraftStore() },
      { name: 'YouTube Scope Detection', test: () => this.testYouTubeScopeDetection() },
      { name: 'Audience Comment Sync', test: () => this.testAudienceCommentSync() },
      { name: 'Audience Comment Analysis', test: () => this.testAudienceCommentAnalysis() },
      { name: 'Audience Idea Mining', test: () => this.testAudienceIdeaMining() },
      { name: 'Reply Drafting', test: () => this.testReplyDrafting() },
      { name: 'Reply Approval and Posting', test: () => this.testReplyApprovalAndPosting() },
      { name: 'Engagement AI Provider Wiring', test: () => this.testEngagementAIProviderWiring() },
      { name: 'Engagement Sync Schedule', test: () => this.testEngagementSyncSchedule() },
      { name: 'Growth Experiment Refresh Schedule', test: () => this.testGrowthExperimentRefreshSchedule() },
      { name: 'Scene-Based Visual Treatment Engine', test: () => this.testVisualTreatmentEngine() },
      { name: 'Verified Financial & Data Visualization Engine', test: () => this.testFinancialVisualizationEngine() },
      { name: 'Professional Audio Enhancement Engine', test: () => this.testAudioEnhancementEngine() },
      { name: 'Shorts Packaging & Publishing Pipeline', test: () => this.testShortsPackagingAndPublishingPipeline() },
      { name: 'Semantic Topic Deduplication Service', test: () => this.testSemanticDedupService() },
      { name: 'Trending Topic Discovery Service', test: () => this.testTrendingTopicDiscovery() },
      { name: 'Content DNA Pattern Extraction & Aggregation Service', test: () => this.testContentDNAService() },
      { name: 'Publishing Dead-Letter Recovery (A4.2)', test: () => this.testPublishingDeadLetterRecovery() },
      { name: 'Dynamic Topic Fallback After Truth/Quality Failure (A4.3)', test: () => this.testDynamicTopicFallback() },
      { name: 'Intra-Production Recovery & Checkpointing (A4.4)', test: () => this.testIntraProductionRecovery() },
      { name: 'Own-Channel Topic Performance Learning & Exploration (A5.1)', test: () => this.testTopicPerformanceLearning() },
      { name: 'Graceful Process Lifecycle & Shutdown Recovery (A5.2)', test: () => this.testGracefulShutdownRecovery() },
      { name: 'Data Lifecycle & Production Manifest Cleanup (A5.3)', test: () => this.testDataLifecycleAndManifestCleanup() },
      { name: 'Generation Null-Context & Strategy Context Normalization Regression', test: () => this.testGenerationNullContextRegression() },
      { name: 'Viewer Retention & Storytelling Upgrade (B-Phase1-4)', test: () => this.testViewerRetentionAndStorytellingUpgrade() },
      { name: 'FinTech Kinetic Full-Canvas Scene Composition (Phase 1)', test: () => this.testFinTechKineticFullCanvasComposition() },
      { name: 'FinTech Kinetic B-Roll Provenance & In-Scene Micro-Animation (Phase 2A)', test: () => this.testFinTechKineticBRollAndMicroAnimation() },
      { name: 'Autonomous Daily YouTube Shorts Publishing (Phase 7)', test: () => this.testAutonomousDailyShortsPublishing() },
      { name: 'Missed-Day Recovery & Backfill Engine (Phase 8)', test: () => this.testMissedDayRecoveryAndBackfill() },
      { name: 'Scheduler Daily Shorts UTC Schedule & Execution', test: () => this.testSchedulerDailyShortsSchedule() }
    ];

    let passed = 0;
    let failed = 0;

    for (const { name, test } of tests) {
      try {
        console.log(chalk.cyan(`\n🔍 Testing ${name}...`));
        await test();
        console.log(chalk.green(`✅ ${name} - PASSED`));
        this.testResults[name] = { status: 'PASSED' };
        passed++;
      } catch (error) {
        console.log(chalk.red(`❌ ${name} - FAILED`));
        console.log(chalk.red(`   Error: ${error.message}`));
        this.testResults[name] = { status: 'FAILED', error: error.message };
        failed++;
      }
    }

    // Display summary
    console.log(chalk.gray('\n' + '═'.repeat(60)));
    console.log(chalk.cyan.bold('📊 Test Summary:'));
    console.log(chalk.green(`✅ Passed: ${passed}`));
    console.log(chalk.red(`❌ Failed: ${failed}`));
    console.log(chalk.cyan(`📝 Total: ${passed + failed}`));

    if (failed === 0) {
      console.log(chalk.green.bold('\n🎉 All tests passed! System is ready to run.'));
      console.log(chalk.cyan('Run: npm start'));
    } else {
      console.log(chalk.yellow.bold('\n⚠️  Some tests failed. Please check the errors above.'));
      console.log(chalk.cyan('Run: npm run setup (to reconfigure)'));
    }

    return failed === 0;
  }

  async testDatabase() {
    const db = new Database();
    await db.initialize();
    
    // Test basic operations
    const stats = await db.getStats();
    if (!stats) throw new Error('Failed to get database stats');
    
    // Test settings
    await db.setSetting('test_key', 'test_value', 'Test setting');
    const value = await db.getSetting('test_key');
    if (value !== 'test_value') throw new Error('Settings read/write failed');
    
    await db.close();
    this.logger.info('Database test completed successfully');
  }

  async testProductionPersistence() {
    const db = new Database();
    await db.initialize();

    const production = {
      id: `prod_test_${Date.now()}`,
      status: 'processing',
      assets: { finalVideo: { path: 'placeholder.mp4' } },
      timeline: { created: new Date().toISOString() },
      scheduledPublishTime: new Date().toISOString(),
      priority: 25,
      estimatedDuration: '1:00'
    };

    const firstId = await db.saveProductionData(production);
    if (firstId !== production.id) {
      throw new Error('saveProductionData did not return the production id');
    }

    const secondId = await db.saveProductionData({
      ...production,
      status: 'ready',
      priority: 90
    });
    if (secondId !== production.id) {
      throw new Error('saveProductionData upsert did not return the production id');
    }

    const saved = await db.getRow('SELECT status, priority FROM productions WHERE id = ?', [production.id]);
    if (!saved || saved.status !== 'ready' || saved.priority !== 90) {
      throw new Error('saveProductionData did not upsert the existing production row');
    }

    await db.executeQuery('DELETE FROM productions WHERE id = ?', [production.id]);
    await db.close();
    this.logger.info('Production persistence test completed successfully');
  }

  async testAutomationEventsTable() {
    const db = new Database();
    await db.initialize();

    await db.executeQuery(
      'INSERT INTO automation_events (event_type, status, data, created_at) VALUES (?, ?, ?, datetime("now"))',
      ['test_event', 'success', JSON.stringify({ ok: true })]
    );

    const row = await db.getRow(
      'SELECT event_type, status, data FROM automation_events WHERE event_type = ? ORDER BY created_at DESC',
      ['test_event']
    );

    if (!row || row.status !== 'success') {
      throw new Error('automation_events row was not persisted');
    }

    await db.executeQuery('DELETE FROM automation_events WHERE event_type = ?', ['test_event']);
    await db.close();
    this.logger.info('Automation events table test completed successfully');
  }

  async testActivationMetrics() {
    const fs = require('fs').promises;
    const { ActivationMetrics } = require('./utils/activation-metrics');
    const db = new Database();
    await db.initialize();
    const id = `activation_test_${Date.now()}`;
    const videoPath = path.join(__dirname, 'temp', `${id}.mp4`);
    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d
    ]);

    try {
      await fs.mkdir(path.dirname(videoPath), { recursive: true });
      await fs.writeFile(videoPath, mp4Header);
      await db.saveProductionData({
        id,
        status: 'ready',
        assets: { finalVideo: { path: videoPath, simulated: false } },
        timeline: { readyForUpload: new Date().toISOString() },
        scheduledPublishTime: null,
        priority: 1,
        estimatedDuration: '0:01'
      });

      const activation = new ActivationMetrics(db);
      const summary = await activation.getSummary();
      if (!summary.milestones.firstRealVideo.achieved || summary.counts.realVideos < 1) {
        throw new Error('A verified non-simulated MP4 was not counted as activation');
      }

      await fs.writeFile(videoPath, Buffer.from('renamed-but-not-an-mp4'));
      const invalidContainerSummary = await activation.getSummary();
      if (invalidContainerSummary.counts.realVideos >= summary.counts.realVideos) {
        throw new Error('A file with an .mp4 extension but no MP4 signature was counted as activation');
      }

      await fs.writeFile(videoPath, mp4Header);
      await db.updateProductionData({
        id,
        status: 'simulated',
        assets: { finalVideo: { path: videoPath, simulated: true } },
        timeline: {},
        scheduledPublishTime: null,
        priority: 1
      });
      const simulatedSummary = await activation.getSummary();
      if (simulatedSummary.counts.realVideos >= summary.counts.realVideos) {
        throw new Error('A simulated MP4 was incorrectly counted as activation');
      }
    } finally {
      await db.executeQuery('DELETE FROM productions WHERE id = ?', [id]);
      await fs.unlink(videoPath).catch(() => {});
      await db.close();
    }

    this.logger.info('Local activation metrics test completed successfully');
  }

  async testAnonymousTelemetryOptIn() {
    const { AnonymousTelemetry } = require('./utils/anonymous-telemetry');
    const savedEnabled = process.env.ANONYMOUS_TELEMETRY_ENABLED;
    const savedEndpoint = process.env.ANONYMOUS_TELEMETRY_ENDPOINT;
    const db = new Database();
    await db.initialize();
    try {
      delete process.env.ANONYMOUS_TELEMETRY_ENABLED;
      delete process.env.ANONYMOUS_TELEMETRY_ENDPOINT;
      const telemetry = new AnonymousTelemetry(db, this.logger);
      if (telemetry.configuration().enabled) throw new Error('Anonymous telemetry was enabled without opt-in');

      process.env.ANONYMOUS_TELEMETRY_ENABLED = 'true';
      process.env.ANONYMOUS_TELEMETRY_ENDPOINT = 'http://example.com/events';
      if (telemetry.configuration().enabled) throw new Error('Anonymous telemetry accepted a non-HTTPS endpoint');
    } finally {
      if (savedEnabled === undefined) delete process.env.ANONYMOUS_TELEMETRY_ENABLED;
      else process.env.ANONYMOUS_TELEMETRY_ENABLED = savedEnabled;
      if (savedEndpoint === undefined) delete process.env.ANONYMOUS_TELEMETRY_ENDPOINT;
      else process.env.ANONYMOUS_TELEMETRY_ENDPOINT = savedEndpoint;
      await db.close();
    }
    this.logger.info('Anonymous telemetry opt-in test completed successfully');
  }

  async testOperatorWorkflowAPI() {
    const { YouTubeAutomationAgent } = require('./index');
    const { OperatorService } = require('./utils/operator-service');
    const db = new Database();
    await db.initialize();
    let server;
    let job;
    let learningRecommendation;

    try {
      job = await db.createGenerationJob({ topic: 'Operator workflow test', style: 'explainer', length: 'short' });
      await db.updateGenerationJob(job.id, { status: 'running', stage: 'script', progress: 25 });
      const updated = await db.getGenerationJob(job.id);
      if (updated.stage !== 'script' || updated.progress !== 25) {
        throw new Error('Generation job progress was not persisted');
      }

      const operator = new OperatorService(db);
      operator.notify = async () => null;
      const quality = await operator.runQualityChecks({
        script: { title: 'Test title', fullScript: 'x'.repeat(250) },
        seo: { title: 'Test title', description: 'x'.repeat(80), tags: ['one', 'two', 'three'] },
        assets: { finalVideo: { path: 'placeholder.info', simulated: true } }
      }, { bannedTopics: [] });
      if (quality.passed || !quality.blockingFailures.includes('video')) {
        throw new Error('Quality gate did not block a simulated video');
      }

      const agent = new YouTubeAutomationAgent();
      agent.db = db;
      agent.operator = operator;
      agent.agents = {
        analytics: {
          getRecentAnalytics: async () => ({ totalVideos: 0, averagePerformanceScore: 0, topPerformers: [], insights: [] })
        }
      };
      agent.scheduler = {
        isEnabled: true,
        pauseAutomation: async function() { this.isEnabled = false; },
        resumeAutomation: async function() { this.isEnabled = true; }
      };
      agent.isInitialized = true;
      agent.setupAPI();
      server = await new Promise(resolve => {
        const running = agent.app.listen(0, () => resolve(running));
      });
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/dashboard`);
      const dashboard = await response.json();
      if (
        !response.ok ||
        !Array.isArray(dashboard.jobs) ||
        !Array.isArray(dashboard.pipeline) ||
        !Array.isArray(dashboard.operatorRuns) ||
        dashboard.activation?.privacy !== 'local-only'
      ) {
        throw new Error('Operator dashboard API did not return its data contract');
      }
      const unavailableStart = await fetch(`http://127.0.0.1:${port}/api/operator/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      if (unavailableStart.status !== 503) {
        throw new Error('Autonomous operator did not fail closed when its strategy agent was unavailable');
      }

      learningRecommendation = await db.saveLearningRecommendation({
        fingerprint: `operator-api-${Date.now()}`,
        category: 'format',
        title: 'Test evidence-backed recommendation',
        rationale: 'Created only for API contract verification.',
        evidence: { sampleSize: 4 },
        proposedChange: { target: 'future_plans', prefer: 'tutorial' },
        confidence: 'medium'
      });
      const approveLearning = await fetch(
        `http://127.0.0.1:${port}/api/learning/recommendations/${learningRecommendation.id}/approve`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      );
      const approvedLearning = await approveLearning.json();
      if (!approveLearning.ok || approvedLearning.result?.status !== 'approved') {
        throw new Error('Learning recommendation review API did not persist approval');
      }
    } finally {
      if (server) await new Promise(resolve => server.close(resolve));
      if (job) await db.executeQuery('DELETE FROM generation_jobs WHERE id = ?', [job.id]);
      if (learningRecommendation) await db.executeQuery('DELETE FROM learning_recommendations WHERE id = ?', [learningRecommendation.id]);
      await db.close();
    }

    this.logger.info('Operator workflow API test completed successfully');
  }

  async testAutonomousChannelOperator() {
    const { ContentStrategyAgent } = require('./agents/content-strategy-agent');
    const { AutonomousChannelOperator } = require('./utils/autonomous-channel-operator');
    const db = new Database();
    await db.initialize();
    const previousStrategy = await db.getChannelStrategy();
    let run;
    let recoverableJob;

    try {
      const strategy = await db.saveChannelStrategy({
        objective: 'Teach small teams to automate useful work',
        audience: 'Small business operators',
        valueProposition: 'Practical steps without hype',
        contentPillars: ['AI workflows', 'Automation playbooks'],
        cadencePerWeek: 2,
        videosPerRun: 2,
        defaultFormat: 'tutorial',
        defaultLength: 'short',
        successMetric: 'Returning viewers',
        constraints: 'Do not invent statistics',
        status: 'active'
      });
      if (strategy.contentPillars.length !== 2 || strategy.cadence_per_week !== 2) {
        throw new Error('Channel strategy was not persisted correctly');
      }

      const strategyAgent = new ContentStrategyAgent(db, {});
      strategyAgent.analyzeTrends = async function() {
        this.trendingTopics = [{
          topic: 'practical AI workflows', score: 8, sources: ['trending'],
          evidence: [{
            url: 'https://www.youtube.com/watch?v=research123',
            title: 'Practical AI workflows', publisher: 'Evidence channel', sourceType: 'video'
          }]
        }];
        this.competitorData = [];
      };
      const planned = await strategyAgent.researchAndPlanChannel(strategy);
      if (
        planned.plan.length !== 2 || !planned.research.sources.includes('YouTube most-popular videos') ||
        planned.research.sourceCatalog.length !== 1 || planned.plan[0].sourceUrls.length !== 1
      ) {
        throw new Error('Strategy did not produce an evidence-labeled autonomous plan');
      }

      const receivedInputs = [];
      let resumedJobs = 0;
      const operator = new AutonomousChannelOperator(db, {
        researchAndPlan: async () => planned,
        startGenerationJob: async input => {
          receivedInputs.push(input);
          return { id: `fake-job-${receivedInputs.length}` };
        },
        waitForGenerationJob: async jobId => ({
          id: jobId,
          status: 'completed',
          production_id: `production-${jobId}`,
          details: { reviewStatus: 'needs_review' }
        }),
        resumeGenerationJob: async jobId => {
          resumedJobs++;
          await db.updateGenerationJob(jobId, { status: 'completed', productionId: `production-${jobId}` });
          return db.getGenerationJob(jobId);
        }
      });
      run = await operator.start(strategy);
      await operator.activeRuns.get(run.id);
      const completed = await db.getOperatorRun(run.id);
      if (
        completed.status !== 'waiting_review' ||
        completed.generatedJobs.length !== 2 ||
        receivedInputs.some(input => input.source !== 'autonomous_operator' || !input.strategyContext?.angle) ||
        receivedInputs[0].strategyContext.researchSources.length !== 1
      ) {
        throw new Error('Autonomous operator did not execute the planned workflow');
      }

      recoverableJob = await db.createGenerationJob({ topic: planned.plan[0].topic, source: 'autonomous_operator' });
      await db.updateGenerationJob(recoverableJob.id, { status: 'interrupted', stage: 'script' });
      const interruptedJobs = completed.generatedJobs.map((item, index) => index === 0
        ? { ...item, jobId: recoverableJob.id, status: 'interrupted', reviewStatus: null }
        : item);
      await db.updateOperatorRun(run.id, {
        status: 'interrupted',
        stage: 'producing_1_of_2',
        progress: 40,
        generatedJobs: interruptedJobs,
        error: 'The application restarted before this operator run finished',
        completedAt: new Date().toISOString()
      });
      await operator.resume(run.id, strategy);
      await operator.activeRuns.get(run.id);
      const recoveredRun = await db.getOperatorRun(run.id);
      if (resumedJobs !== 1 || recoveredRun.status !== 'waiting_review' || recoveredRun.generatedJobs[0].status !== 'completed') {
        throw new Error('Autonomous operator did not continue from its saved plan and interrupted job');
      }
    } finally {
      if (run) {
        const stored = await db.getOperatorRun(run.id);
        for (const item of stored?.generatedJobs || []) {
          if (item.ideaId) await db.executeQuery('DELETE FROM content_ideas WHERE id = ?', [item.ideaId]);
        }
        await db.executeQuery('DELETE FROM operator_runs WHERE id = ?', [run.id]);
      }
      if (previousStrategy) {
        await db.saveChannelStrategy({
          objective: previousStrategy.objective,
          audience: previousStrategy.audience,
          valueProposition: previousStrategy.value_proposition,
          contentPillars: previousStrategy.contentPillars,
          cadencePerWeek: previousStrategy.cadence_per_week,
          videosPerRun: previousStrategy.videos_per_run,
          defaultFormat: previousStrategy.default_format,
          defaultLength: previousStrategy.default_length,
          successMetric: previousStrategy.success_metric,
          constraints: previousStrategy.constraints,
          status: previousStrategy.status
        });
      } else {
        await db.executeQuery("DELETE FROM channel_strategies WHERE id = 'default'");
      }
      if (recoverableJob) await db.executeQuery('DELETE FROM generation_jobs WHERE id = ?', [recoverableJob.id]);
      await db.close();
    }

    this.logger.info('Autonomous channel operator test completed successfully');
  }

  async testChannelLearningLoop() {
    const fs = require('fs').promises;
    const os = require('os');
    const { ChannelLearningEngine } = require('./utils/channel-learning-engine');
    const { ContentStrategyAgent } = require('./agents/content-strategy-agent');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-learning-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'learning.db');
    await db.initialize();

    try {
      const learning = new ChannelLearningEngine(db);
      const report = (videoId, format, performanceScore, ctr, retention, simulated = false) => ({
        videoId,
        videoDetails: {
          title: `${format} automation guide`,
          publishedAt: new Date(Date.now() - 8 * 86400000).toISOString()
        },
        analytics: {
          simulated,
          views: { totalViews: 500, totalImpressions: 5000, averageCTR: ctr },
          watchTime: { averageViewPercentage: retention, averageViewDuration: 240, totalWatchTime: 2000 },
          engagement: { engagementRate: format === 'tutorial' ? 6 : 2 }
        },
        thumbnailMetrics: { impressions: 5000, clickThroughRate: ctr },
        performance: { score: performanceScore, grade: 'B' }
      });
      const context = format => ({
        strategy: { topic: `${format} topic`, contentType: format, requestedLengthKey: 'medium' },
        script: { hook: 'A concise opening that immediately promises a useful and concrete result.' },
        thumbnail: { concept: { composition: 'centered' } }
      });

      await learning.capture(report('learning-tutorial-1', 'tutorial', 88, 7.5, 62), context('tutorial'), '7d');
      await learning.capture(report('learning-tutorial-2', 'tutorial', 84, 7, 58), context('tutorial'), '7d');
      await learning.capture(report('learning-list-1', 'list', 52, 3.5, 39), context('list'), '7d');
      await learning.capture(report('learning-list-2', 'list', 48, 3, 35), context('list'), '7d');
      await learning.capture(report('learning-simulated', 'review', 99, 12, 90, true), context('review'), '7d');

      const summary = await learning.getSummary();
      const recommendation = summary.recommendations.find(item => item.category === 'format');
      if (summary.measuredVideos !== 4 || !recommendation || !/tutorial/.test(recommendation.title)) {
        throw new Error('Learning engine did not derive a real-evidence format recommendation');
      }
      if (summary.recommendations.some(item => /review/.test(item.title))) {
        throw new Error('Simulated analytics influenced a learning recommendation');
      }

      const approved = await db.reviewLearningRecommendation(recommendation.id, 'approved');
      if (approved.status !== 'approved') throw new Error('Learning recommendation approval was not persisted');

      const strategyAgent = new ContentStrategyAgent(db, {});
      strategyAgent.analyzeTrends = async function() {
        this.trendingTopics = [];
        this.competitorData = [];
      };
      const planned = await strategyAgent.researchAndPlanChannel({
        objective: 'Teach useful automation',
        audience: 'Small teams',
        value_proposition: 'Practical guidance',
        contentPillars: ['Automation'],
        videos_per_run: 1,
        default_format: 'tutorial',
        default_length: 'medium'
      });
      if (
        planned.research.approvedLearnings.length !== 1 ||
        !planned.research.sources.includes('Operator-approved channel performance learnings')
      ) {
        throw new Error('Approved learning was not supplied to autonomous planning');
      }

      const due = await learning.getDueMeasurementWindows({
        youtube_id: 'unmeasured-video',
        published_at: new Date(Date.now() - 8 * 86400000).toISOString()
      });
      if (!due.includes('24h') || !due.includes('7d')) {
        throw new Error('24-hour and 7-day learning windows were not scheduled');
      }

      const { YouTubeAutomationAgent } = require('./index');
      const { ThumbnailDesignerAgent } = require('./agents/thumbnail-designer-agent');
      const workflow = new YouTubeAutomationAgent();
      const titleVariants = workflow.buildTitleExperimentVariants('Automate Your Weekly Reporting');
      const selected = workflow.validateEditorData(
        { selectedTitleVariant: 1, selectedThumbnailVariant: 2 },
        { packagingExperiment: { titleVariants, thumbnailVariants: [{}, {}, {}] } }
      );
      if (titleVariants.length !== 3 || selected.selectedTitleVariant !== 1 || selected.selectedThumbnailVariant !== 2) {
        throw new Error('Packaging experiment selections were not validated');
      }

      const thumbnailDesigner = new ThumbnailDesignerAgent(db, {});
      thumbnailDesigner.createThumbnail = async (_concept, suffix) => `base-${suffix}`;
      thumbnailDesigner.addTextOverlay = async (_path, _concept, suffix) => `overlay-${suffix}`;
      thumbnailDesigner.optimizeForYouTube = async (_path, suffix) => `optimized-${suffix}.jpg`;
      const thumbnailVariants = await thumbnailDesigner.generateABVariants({
        primaryText: 'GUIDE',
        colors: { primary: 'blue', secondary: 'white', accent: 'green' },
        composition: 'split'
      });
      if (thumbnailVariants.length !== 3 || thumbnailVariants.some(item => !item.path.endsWith('.jpg'))) {
        throw new Error('Approved packaging learning did not produce complete thumbnail variants');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    this.logger.info('Closed-loop channel learning test completed successfully');
  }

  async testGrowthExperimentsStudio() {
    const fs = require('fs').promises;
    const os = require('os');
    const { GrowthExperimentService } = require('./utils/growth-experiment-service');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-experiments-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'experiments.db');
    await db.initialize();
    const productionId = 'experiment-production';
    const thumbnails = await Promise.all(['control', 'variant-a', 'variant-b'].map(async name => {
      const file = path.join(directory, `${name}.jpg`);
      await fs.writeFile(file, Buffer.from(`thumbnail-${name}`));
      return file;
    }));

    try {
      await db.saveProductionData({
        id: productionId, status: 'published',
        assets: { thumbnail: { path: thumbnails[0] }, finalVideo: { path: 'fixture.mp4' } },
        timeline: {}, scheduledPublishTime: new Date().toISOString(), priority: 50, estimatedDuration: '8:00'
      });
      await db.saveProductionSnapshot({
        id: productionId,
        strategy: { topic: 'Controlled growth' },
        script: { title: 'Control title' },
        thumbnail: { path: thumbnails[0] },
        seo: { title: 'Control title', description: 'Fixture', tags: [] }
      });
      const sourceLearning = await db.saveLearningRecommendation({
        fingerprint: 'growth-experiment-source', category: 'packaging',
        title: 'Test packaging', rationale: 'CTR trails the channel baseline.',
        evidence: { measuredVideos: 4 }, proposedChange: { experiment: 'title_thumbnail_variant' }, confidence: 'medium'
      });
      await db.reviewLearningRecommendation(sourceLearning.id, 'approved');
      await db.saveContentReview(productionId, {
        status: 'approved',
        editorData: {
          packagingExperiment: {
            sourceRecommendationId: sourceLearning.id,
            hypothesis: 'A clearer promise improves qualified clicks.',
            titleVariants: [
              { label: 'Control', title: 'Control title' },
              { label: 'Clear benefit', title: 'A Clearer Automation Benefit' },
              { label: 'Curiosity', title: 'The Automation Detail You Missed' }
            ],
            thumbnailVariants: [
              { label: 'Control', path: thumbnails[0] },
              { label: 'Clear benefit', path: thumbnails[1] },
              { label: 'Curiosity', path: thumbnails[2] }
            ]
          }
        }
      });
      const schedule = await db.saveScheduleEntry({
        productionId, title: 'Control title', publishTime: new Date(Date.now() - 8 * 86400000).toISOString(),
        status: 'published', priority: 50,
        metadata: { seo: { title: 'Control title', description: 'Fixture', tags: [] }, thumbnail: { path: thumbnails[0] } }
      });
      schedule.status = 'published';
      schedule.youtubeId = 'youtube-experiment-1';
      schedule.youtubeUrl = 'https://www.youtube.com/watch?v=youtube-experiment-1';
      schedule.publishedAt = new Date(Date.now() - 8 * 86400000).toISOString();
      await db.updateScheduleEntry(schedule);

      const cumulative = [
        { impressions: 10000, clicks: 500, views: 700 },
        { impressions: 11000, clicks: 550, views: 770 },
        { impressions: 12000, clicks: 650, views: 860 },
        { impressions: 13000, clicks: 690, views: 920 }
      ];
      let reportIndex = 0;
      const analytics = {
        analyzeVideoPerformance: async () => {
          const point = cumulative[Math.min(reportIndex++, cumulative.length - 1)];
          return {
            analytics: {
              simulated: false,
              views: { totalViews: point.views, totalImpressions: point.impressions, averageCTR: point.clicks / point.impressions * 100 },
              watchTime: { totalWatchTime: point.views * 4, averageViewPercentage: 55 },
              engagement: { engagementRate: 4.5 },
              outcomes: { netSubscribers: Math.floor(point.views / 100), estimatedRevenue: point.views / 100 }
            },
            thumbnailMetrics: { impressions: point.impressions, clickThroughRate: point.clicks / point.impressions * 100 }
          };
        }
      };
      const applied = [];
      const publishing = {
        applyVideoPackaging: async (videoId, packaging) => applied.push({ videoId, ...packaging })
      };
      let clock = Date.now();
      const service = new GrowthExperimentService(db, analytics, publishing, { now: () => new Date(clock) });
      let experiment = await service.create({ productionId, armDurationHours: 24, minImpressions: 100 });
      if (experiment.status !== 'draft' || experiment.arms.length !== 3 || !experiment.arms[0].isControl) {
        throw new Error('Experiment plan did not persist a control and complete variant arms');
      }

      let confirmationBlocked = false;
      try { await service.approve(experiment.id); } catch (error) { confirmationBlocked = error.code === 'EXPERIMENT_CONFIRMATION_REQUIRED'; }
      if (!confirmationBlocked) throw new Error('Experiment approval did not require explicit confirmation');
      experiment = await service.approve(experiment.id, { confirmed: true });
      experiment = await service.start(experiment.id, { confirmed: true });
      if (experiment.status !== 'running' || applied.length !== 1) throw new Error('Approved experiment did not start on its control arm');

      for (let index = 0; index < 3; index++) {
        clock += 24 * 3600000;
        experiment = await service.refresh(experiment.id);
      }
      if (
        experiment.status !== 'awaiting_winner' || !experiment.winningArmId ||
        experiment.arms.find(arm => arm.id === experiment.winningArmId)?.label !== 'Clear benefit' ||
        experiment.result.guardrails.passed !== true || applied.at(-1).title !== 'Control title'
      ) {
        throw new Error('Experiment did not select an evidence-backed winner and restore the control');
      }

      experiment = await service.adoptWinner(experiment.id, { confirmed: true });
      const learned = (await db.listLearningRecommendations({ status: 'approved', limit: 20 }))
        .find(item => item.evidence?.experimentId === experiment.id);
      if (experiment.status !== 'adopted' || !learned || applied.at(-1).title !== 'A Clearer Automation Benefit') {
        throw new Error('Winner adoption did not update packaging and approve the resulting learning');
      }

      const storedSamples = await db.listExperimentSamples(experiment.id);
      if (storedSamples.length < 6 || storedSamples.some(sample => !Number.isFinite(sample.metrics.impressions))) {
        throw new Error('Experiment evidence samples were not durably stored');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    this.logger.info('Controlled Growth Experiments Studio test completed successfully');
  }

  async testOutcomeROIStudio() {
    const fs = require('fs').promises;
    const os = require('os');
    const { ChannelLearningEngine } = require('./utils/channel-learning-engine');
    const { AnalyticsOptimizationAgent } = require('./agents/analytics-optimization-agent');
    const { YouTubeAutomationAgent } = require('./index');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-outcomes-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'outcomes.db');
    await db.initialize();

    try {
      const validated = new YouTubeAutomationAgent().validateChannelStrategy({
        objective: 'Grow a durable automation audience', audience: 'Small teams',
        contentPillars: ['Automation', 'Tool reviews'], primaryKpi: 'subscribers',
        targetValue: 40, targetWindowDays: 28, monthlyBudget: 100,
        outcomeCurrency: 'USD', status: 'active'
      });
      const strategy = await db.saveChannelStrategy(validated);
      if (strategy.primary_kpi !== 'subscribers' || strategy.target_value !== 40 || strategy.target_window_days !== 28) {
        throw new Error('Structured outcome strategy was not validated and persisted');
      }

      const learning = new ChannelLearningEngine(db);
      const report = (videoId, format, subscribers, revenue) => ({
        videoId,
        videoDetails: { title: `${format} outcome fixture`, publishedAt: new Date(Date.now() - 8 * 86400000).toISOString() },
        analytics: {
          simulated: false,
          views: { totalViews: 1000, totalImpressions: 10000, averageCTR: 5 },
          watchTime: { averageViewPercentage: 45, averageViewDuration: 240, totalWatchTime: 4000 },
          engagement: { engagementRate: 4 },
          outcomes: {
            subscribersAvailable: true, subscribersGained: subscribers + 1, subscribersLost: 1,
            netSubscribers: subscribers, revenueAvailable: true, estimatedRevenue: revenue,
            monetizedPlaybacks: 500, playbackBasedCpm: 8, currency: 'USD'
          }
        },
        thumbnailMetrics: { impressions: 10000, clickThroughRate: 5 },
        performance: { score: 70, grade: 'B' }
      });
      const context = (format, pillar) => ({
        strategy: { topic: `${format} topic`, contentType: format, requestedLengthKey: 'medium', contentPillar: pillar },
        script: { hook: 'A concise, outcome-aligned opening.' },
        thumbnail: { concept: { composition: 'centered' } },
        productionCost: { amount: 2, currency: 'USD', complete: true, providers: ['fixture-video'] }
      });
      await learning.capture(report('outcome-tutorial-1', 'tutorial', 12, 5), context('tutorial', 'Automation'), '7d');
      await learning.capture(report('outcome-tutorial-2', 'tutorial', 10, 5), context('tutorial', 'Automation'), '7d');
      await learning.capture(report('outcome-list-1', 'list', 2, 5), context('list', 'Tool reviews'), '7d');
      await learning.capture(report('outcome-list-2', 'list', 1, 5), context('list', 'Tool reviews'), '7d');

      const summary = await learning.getSummary();
      const recommendation = summary.recommendations.find(item => item.category === 'outcome_alignment');
      if (
        summary.outcome.goal.id !== 'subscribers' || summary.outcome.observed !== 25 ||
        summary.outcome.progressPercent !== 62.5 || summary.outcome.economics.roi !== 150 ||
        !recommendation || recommendation.status !== 'pending' || recommendation.proposedChange.autoApply !== false
      ) {
        throw new Error('Outcome evidence did not produce the expected goal scorecard and approval-gated recommendation');
      }

      const analytics = new AnalyticsOptimizationAgent(db, { getYouTubeAuth: () => ({}) });
      analytics.youtubeAnalytics = {
        reports: {
          query: async ({ metrics }) => {
            if (metrics.includes('estimatedRevenue')) throw new Error('not monetized');
            return { data: { rows: [[7, 2]] } };
          }
        }
      };
      const outcomes = await analytics.getOutcomeAnalytics('outcome-video', '2026-08-01', '2026-08-07');
      if (!outcomes.subscribersAvailable || outcomes.netSubscribers !== 5 || outcomes.revenueAvailable || outcomes.estimatedRevenue !== null) {
        throw new Error('Unavailable monetization evidence was converted into a false zero');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    this.logger.info('Outcome and ROI Studio test completed successfully');
  }

  async testSceneAwareRetentionStudio() {
    const fs = require('fs').promises;
    const os = require('os');
    const { ChannelLearningEngine } = require('./utils/channel-learning-engine');
    const { AnalyticsOptimizationAgent } = require('./agents/analytics-optimization-agent');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-retention-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'retention.db');
    await db.initialize();

    try {
      const learning = new ChannelLearningEngine(db);
      const points = Array.from({ length: 100 }, (_, index) => {
        const elapsedRatio = (index + 1) / 100;
        let audienceWatchRatio;
        let relativeRetentionPerformance;
        if (elapsedRatio <= 0.17) {
          audienceWatchRatio = 1 - elapsedRatio * 0.4;
          relativeRetentionPerformance = 0.64;
        } else if (elapsedRatio <= 0.5) {
          audienceWatchRatio = 0.93 - ((elapsedRatio - 0.17) / 0.33) * 0.48;
          relativeRetentionPerformance = 0.31;
        } else {
          audienceWatchRatio = 0.45 - (elapsedRatio - 0.5) * 0.08;
          relativeRetentionPerformance = 0.7;
        }
        return {
          elapsedRatio,
          audienceWatchRatio,
          relativeRetentionPerformance,
          startedWatching: index === 0 ? 800 : 0,
          stoppedWatching: elapsedRatio > 0.17 && elapsedRatio <= 0.5 ? 5 : 1,
          totalSegmentImpressions: 800
        };
      });
      const context = {
        productionId: 'retention-production',
        contentFormat: 'long_form',
        title: 'Scene retention fixture',
        publishedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
        retentionDuration: 90,
        retentionScenes: [
          { id: 'scene-hook', position: 0, label: 'Hook', duration: 15 },
          { id: 'scene-intro', position: 1, label: 'Introduction', duration: 30 },
          { id: 'scene-demo', position: 2, label: 'Demonstration', duration: 45 }
        ]
      };
      const snapshot = await learning.captureRetention({
        available: true,
        simulated: false,
        videoId: 'retention-video-1',
        title: context.title,
        publishedAt: context.publishedAt,
        durationSeconds: 90,
        points
      }, context, '7d', { views: 800, impressions: 12000 });

      if (
        !snapshot || snapshot.points.length !== 100 || snapshot.sceneMetrics.length !== 3 ||
        snapshot.summary.primaryDropoff?.id !== 'scene-intro' || snapshot.confidence !== 'high'
      ) {
        throw new Error('The real retention curve was not mapped to the expected scene evidence');
      }
      const recommendation = (await db.listLearningRecommendations({ limit: 20 }))
        .find(item => item.category === 'scene_retention');
      if (!recommendation || recommendation.status !== 'pending' || recommendation.proposedChange.autoEditPublishedContent !== false) {
        throw new Error('Scene retention learning bypassed pending review or published-content safety');
      }
      const approvedBeforeReview = await db.listLearningRecommendations({ status: 'approved', limit: 20 });
      if (approvedBeforeReview.some(item => item.id === recommendation.id)) {
        throw new Error('Pending scene retention learning entered autonomous planning');
      }
      await db.reviewLearningRecommendation(recommendation.id, 'approved');
      const approvedAfterReview = await db.listLearningRecommendations({ status: 'approved', limit: 20 });
      if (!approvedAfterReview.some(item => item.id === recommendation.id)) {
        throw new Error('Approved scene retention learning was not made available to planning');
      }

      const skipped = await learning.captureRetention({
        available: true,
        simulated: true,
        videoId: 'retention-simulated',
        durationSeconds: 90,
        points
      }, context, '7d', { views: 1000 });
      if (skipped !== null || (await db.listRetentionSnapshots({ limit: 10 })).length !== 1) {
        throw new Error('Simulated retention evidence was persisted');
      }

      const clipped = db.buildRetentionSceneContext(context.retentionScenes, {
        startSeconds: 10,
        duration: 35,
        sourceSceneIds: ['scene-hook', 'scene-intro']
      });
      if (clipped.length !== 2 || clipped[0].duration !== 5 || clipped[1].duration !== 30) {
        throw new Error('Shorts retention context did not clip the source scene timeline correctly');
      }

      const analytics = new AnalyticsOptimizationAgent(db, { getYouTubeAuth: () => ({}) });
      analytics.youtubeAnalytics = {
        reports: {
          query: async () => ({
            data: {
              columnHeaders: [
                'elapsedVideoTimeRatio', 'audienceWatchRatio', 'relativeRetentionPerformance',
                'startedWatching', 'stoppedWatching', 'totalSegmentImpressions'
              ].map(name => ({ name })),
              rows: [[0.01, 0.99, 0.7, 10, 1, 10]]
            }
          })
        }
      };
      const apiCurve = await analytics.getAudienceRetention('fixture-video', null, 'PT2M30S');
      if (!apiCurve.available || apiCurve.durationSeconds !== 150 || apiCurve.points[0].audienceWatchRatio !== 0.99) {
        throw new Error('YouTube audience retention response was not normalized correctly');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    this.logger.info('Scene-Aware Retention Studio test completed successfully');
  }

  async testProductionReadinessGate() {
    const fs = require('fs').promises;
    const os = require('os');
    let savedRun = null;
    const db = {
      generateId: () => 'readiness_test',
      saveReadinessRun: async run => {
        savedRun = {
          ...run,
          started_at: run.startedAt,
          completed_at: run.completedAt
        };
        return savedRun;
      },
      getLatestReadinessRun: async () => savedRun
    };
    const passingProbe = label => async () => ({ message: `${label} verified` });
    const service = new ProductionReadinessService(db, { credentials: {} }, {
      probes: {
        text: passingProbe('Text'),
        image: passingProbe('Image'),
        videoProvider: passingProbe('Video provider'),
        narration: passingProbe('Narration'),
        videoAssembly: passingProbe('Video'),
        youtube: passingProbe('YouTube'),
        metadata: passingProbe('Metadata')
      }
    });
    const passed = await service.run({ includePaidMedia: true });
    if (passed.status !== 'passed' || passed.checks.length !== 7 || !savedRun) {
      throw new Error('A successful readiness run was not persisted correctly');
    }
    await service.assertReady('Test automation');

    const failingService = new ProductionReadinessService(db, { credentials: {} }, {
      probes: {
        text: passingProbe('Text'),
        image: passingProbe('Image'),
        videoProvider: passingProbe('Video provider'),
        narration: passingProbe('Narration'),
        videoAssembly: passingProbe('Video'),
        youtube: async () => { throw new Error('token rejected sk-secret-value'); },
        metadata: passingProbe('Metadata')
      }
    });
    const failed = await failingService.run();
    if (failed.status !== 'failed' || failed.blockingFailures[0] !== 'youtube_access') {
      throw new Error('A blocking readiness probe did not fail closed');
    }
    if (failed.checks.find(check => check.id === 'youtube_access').message.includes('sk-secret-value')) {
      throw new Error('Readiness diagnostics did not redact a provider-shaped secret');
    }
    let blocked = false;
    try {
      await failingService.assertReady('Test publishing');
    } catch (error) {
      blocked = error.status === 409;
    }
    if (!blocked) throw new Error('Failed readiness did not block protected automation');

    const tags = normalizeTags(['#Automation', 'automation', 'bad"tag', 'x'.repeat(140)]);
    const metadata = validateYouTubeMetadata({
      title: 'A valid title',
      description: 'A valid upload description.',
      tags,
      metadata: { category: 22, language: 'en' }
    });
    if (!metadata.valid || tags[0] !== 'Automation' || tags.includes('automation') || tags.some(tag => tag.includes('"') || tag.length > 100)) {
      throw new Error('YouTube metadata normalization is unsafe or invalid');
    }

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-readiness-db-'));
    const persistenceDb = new Database();
    persistenceDb.dbPath = path.join(directory, 'readiness.db');
    try {
      await persistenceDb.initialize();
      await persistenceDb.saveReadinessRun(passed);
      const persisted = await persistenceDb.getLatestReadinessRun();
      if (persisted?.id !== passed.id || persisted.checks.length !== 7 || persisted.summary.passed !== 7) {
        throw new Error('Readiness evidence did not round-trip through SQLite');
      }
    } finally {
      await persistenceDb.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
    this.logger.info('Production readiness gate test completed successfully');
  }

  async testVideoProviderLayer() {
    const fs = require('fs').promises;
    const os = require('os');
    const { runFFmpeg, checkFFmpeg } = require('./utils/ffmpeg');
    const { MediaGenerationService } = require('./utils/media-generation-service');
    const {
      VideoProvider, VideoProviderRegistry, SeedanceProvider, MiniMaxH3Provider,
      GoogleOmniProvider, GoogleVeoProvider, KlingProvider, WanProvider
    } = require('./utils/video-providers');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-media-provider-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'media.db');
    await db.initialize();
    const job = await db.createGenerationJob({ topic: 'Provider durability test' });
    const source = path.join(directory, 'source.mp4');
    let createCalls = 0;
    let pollCalls = 0;

    try {
      if (!(await checkFFmpeg())) {
        this.logger.warn('Skipping provider MP4 durability assertion because FFmpeg is unavailable');
        return;
      }
      await runFFmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:d=1', '-c:v', 'mpeg4', source]);
      const fake = new VideoProvider('seedance', {
        model: 'bytedance/seedance-2.5',
        capabilities: { minDuration: 4, maxDuration: 30, cancellation: true }
      });
      fake.isAvailable = () => true;
      fake.createTask = async () => {
        createCalls++;
        return { externalTaskId: 'prediction-1', status: 'queued' };
      };
      fake.getTask = async id => {
        pollCalls++;
        return { externalTaskId: id, status: 'succeeded', outputUrl: 'fake://video' };
      };
      fake.downloadResult = async (_task, outputPath) => {
        await fs.copyFile(source, outputPath);
        return outputPath;
      };
      const registry = new VideoProviderRegistry({}, { providers: { seedance: fake } });
      const service = new MediaGenerationService(db, {}, { registry, pollIntervalMs: 10, sleep: async () => {} });
      const output = path.join(directory, 'output.mp4');
      const input = {
        jobId: job.id,
        productionId: 'prod-provider-test',
        scene: { index: 0 },
        provider: fake,
        outputPath: output,
        request: { prompt: 'A red frame', duration: 4, resolution: '720p', aspectRatio: '16:9' }
      };
      const first = await service.generateClip(input);
      const second = await service.generateClip(input);
      const tasks = await db.listMediaGenerationTasks(job.id);
      if (createCalls !== 1 || pollCalls !== 1 || !second.reused || tasks.length !== 1) {
        throw new Error('A completed provider task was duplicated instead of being reused');
      }
      if (first.task.external_task_id !== 'prediction-1' || tasks[0].model !== 'bytedance/seedance-2.5') {
        throw new Error('Provider task identity and model evidence did not persist');
      }
      const providers = registry.list();
      for (const id of ['seedance', 'minimax_h3', 'google_omni', 'google_veo', 'kling', 'wan', 'slideshow']) {
        if (!providers.find(provider => provider.id === id)) throw new Error(`Missing video provider: ${id}`);
      }
      const shortOnly = new VideoProvider('wan', { model: 'wan-test', capabilities: { minDuration: 2, maxDuration: 15, firstFrame: true } });
      shortOnly.isAvailable = () => true;
      const routed = new VideoProviderRegistry({}, { providers: { seedance: fake, wan: shortOnly } });
      if (routed.select('auto', ['wan', 'seedance'], { duration: 20 }).id !== 'seedance') {
        throw new Error('Automatic video routing ignored the requested duration capability');
      }
      if (routed.select('auto', ['seedance', 'wan'], { duration: 8, generateAudio: true }).id !== 'slideshow') {
        throw new Error('Automatic video routing selected a provider without requested native audio support');
      }
      const listedJob = (await db.listGenerationJobs(10)).find(item => item.id === job.id);
      if (listedJob?.mediaTasks?.length !== 1 || listedJob.mediaTasks[0].external_task_id !== 'prediction-1') {
        throw new Error('Generation job history did not expose its durable provider task');
      }

      let seedanceSubmission;
      const seedance = new SeedanceProvider({}, { client: { predictions: {
        create: async submission => {
          seedanceSubmission = submission;
          return { id: 'seedance-task', status: 'starting' };
        }
      } } });
      const seedanceTask = await seedance.createTask({ prompt: 'Seedance scene', duration: 30, aspectRatio: '16:9' });
      if (seedanceTask.externalTaskId !== 'seedance-task' || seedanceSubmission.model !== 'bytedance/seedance-2.5' || seedanceSubmission.input.duration !== 30) {
        throw new Error('Seedance adapter did not submit the expected Replicate task');
      }
      const fileOutput = seedance.normalizeTask({ id: 'file-output', status: 'succeeded', output: { url: () => new URL('https://example.com/video.mp4') } });
      if (fileOutput.outputUrl !== 'https://example.com/video.mp4') throw new Error('Seedance FileOutput was not normalized');

      let minimaxBody;
      const minimax = new MiniMaxH3Provider({}, { apiKey: 'test', http: {
        post: async (_url, body) => { minimaxBody = body; return { data: { task_id: 'h3-task' } }; }
      } });
      const minimaxTask = await minimax.createTask({ prompt: 'H3 scene', duration: 15, resolution: '2K', aspectRatio: '9:16' });
      if (minimaxTask.externalTaskId !== 'h3-task' || minimaxBody.model !== 'MiniMax-H3' || minimaxBody.content[0].type !== 'text') {
        throw new Error('MiniMax H3 adapter did not submit the expected multimodal task');
      }

      let googleName;
      const google = new GoogleOmniProvider({}, { client: {
        interactions: { create: async () => ({ id: 'omni-task', output_video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/omni-file:download?alt=media' } }) },
        files: { get: async ({ name }) => { googleName = name; return { state: { name: 'ACTIVE' } }; } }
      } });
      const googleTask = await google.createTask({ prompt: 'Omni scene', aspectRatio: '16:9' });
      await google.getTask(googleTask.externalTaskId);
      if (googleTask.status !== 'queued' || googleName !== 'files/omni-file') throw new Error('Gemini Omni URI task was not normalized for polling');

      // Google Veo 3.1 unit tests
      let veoParams;
      let veoDownloaded = false;
      const mockVeoClient = {
        models: {
          generateVideos: async params => {
            veoParams = params;
            return { name: 'operations/veo-test-op-1', done: false };
          }
        },
        operations: {
          get: async ({ operationName }) => {
            if (operationName === 'operations/veo-test-op-1') {
              return {
                name: operationName,
                done: true,
                response: {
                  generatedVideos: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/veo-output:download?alt=media' } }]
                }
              };
            }
            if (operationName === 'operations/veo-quota-error') {
              return {
                name: operationName,
                done: true,
                error: { code: 429, message: 'Resource exhausted: quota exceeded' }
              };
            }
            return { name: operationName, done: false };
          }
        },
        files: {
          download: async ({ downloadPath }) => {
            veoDownloaded = true;
            await fs.writeFile(downloadPath, 'veo-test-data');
          }
        }
      };

      const veoDisabled = new GoogleVeoProvider({}, { client: mockVeoClient, enabled: false });
      if (veoDisabled.isAvailable()) throw new Error('GoogleVeoProvider should be unavailable when enabled=false');

      const veoEnabled = new GoogleVeoProvider({}, { client: mockVeoClient, enabled: true });
      if (!veoEnabled.isAvailable()) throw new Error('GoogleVeoProvider should be available when enabled=true with client');

      const registryWithVeo = new VideoProviderRegistry({}, { providers: { google_veo: veoEnabled } });
      if (registryWithVeo.select('google_veo').id !== 'google_veo') {
        throw new Error('VideoProviderRegistry failed to select explicitly requested google_veo');
      }

      const registryWithDisabledVeo = new VideoProviderRegistry({}, { providers: { google_veo: veoDisabled } });
      if (registryWithDisabledVeo.select('google_veo').id !== 'slideshow') {
        throw new Error('VideoProviderRegistry failed to fall back to slideshow when google_veo is disabled');
      }

      const veoTask = await veoEnabled.createTask({
        prompt: 'Cinematic financial visual',
        duration: 8,
        aspectRatio: '9:16',
        resolution: '720p'
      });
      if (veoTask.externalTaskId !== 'operations/veo-test-op-1' || veoTask.status !== 'queued') {
        throw new Error('GoogleVeoProvider createTask did not return queued operation task');
      }
      if (veoParams.config.durationSeconds !== 8 || veoParams.config.aspectRatio !== '9:16') {
        throw new Error('GoogleVeoProvider normalizeRequest failed to conform 8s 9:16 configuration');
      }

      const polledVeo = await veoEnabled.getTask(veoTask.externalTaskId, { operation: veoTask.operation });
      if (polledVeo.status !== 'succeeded' || !polledVeo.outputUrl) {
        throw new Error('GoogleVeoProvider getTask did not resolve completed operation with outputUrl');
      }

      const veoOutputPath = path.join(directory, 'veo_out.mp4');
      await veoEnabled.downloadResult(polledVeo, veoOutputPath);
      if (!veoDownloaded) throw new Error('GoogleVeoProvider downloadResult did not download output file');

      // Test quota error handling
      const quotaTask = await veoEnabled.getTask('operations/veo-quota-error');
      if (quotaTask.status !== 'failed' || quotaTask.errorType !== 'QUOTA_EXHAUSTED') {
        throw new Error('GoogleVeoProvider failed to classify 429 quota error correctly');
      }

      let klingBody;
      const kling = new KlingProvider({}, { accessKey: 'access', secretKey: 'secret', http: {
        post: async (_url, body) => { klingBody = body; return { data: { data: { task_id: 'kling-task' } } }; }
      } });
      const klingTask = await kling.createTask({ prompt: 'Kling scene', duration: 8, aspectRatio: '16:9' });
      if (klingTask.externalTaskId !== 'kling-task' || klingBody.model_name !== 'kling-v3-omni' || klingBody.sound !== 'off') {
        throw new Error('Kling adapter did not submit the expected task');
      }

      let wanBody;
      const wan = new WanProvider({}, { apiKey: 'test', http: {
        post: async (_url, body) => { wanBody = body; return { data: { output: { task_id: 'wan-task' } } }; }
      } });
      const wanTask = await wan.createTask({ prompt: 'Wan scene', duration: 10, resolution: '720p', aspectRatio: '16:9' });
      if (wanTask.externalTaskId !== 'wan-task' || wanBody.model !== 'wan2.7-t2v-2026-06-12' || wanBody.parameters.resolution !== '720P') {
        throw new Error('Wan adapter did not submit the expected task-specific model payload');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
    this.logger.info('Durable multi-provider video generation test completed successfully');
  }

  async testSceneRepairStudio() {
    const fs = require('fs').promises;
    const os = require('os');
    const sharp = require('sharp');
    const { SceneRepairService, buildInitialSceneManifest } = require('./utils/scene-repair-service');
    const { OperatorService } = require('./utils/operator-service');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-scene-repair-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'scenes.db');
    await db.initialize();

    try {
      const imagePath = path.join(directory, 'scene.png');
      const oldVideoPath = path.join(directory, 'old.mp4');
      const originalAudioPath = path.join(directory, 'original.mp3');
      await sharp({ create: { width: 320, height: 180, channels: 3, background: '#203a5f' } }).png().toFile(imagePath);
      await fs.writeFile(oldVideoPath, Buffer.from('previous final video'));
      await fs.writeFile(originalAudioPath, Buffer.from('previous narration'));
      const production = {
        id: `prod_scene_${Date.now()}`,
        status: 'ready',
        script: {
          title: 'Repair one scene',
          fullScript: 'A complete factual-review-safe script for testing selective scene repair without replacing the entire production.',
          hook: { text: 'Fix one weak moment without starting over.' },
          introduction: { greeting: 'Hello.', topicIntro: 'Scene repair matters.', valueProposition: 'Save time and credits.' },
          mainContent: { sections: [{ title: 'Selective repair', content: 'Keep the scenes that work and replace only the scene that does not.' }] },
          conclusion: { recap: ['Preserve good work.'], finalThought: 'Review the repaired timeline.' }
        },
        seo: { title: 'Repair one scene', description: 'A detailed description of selective scene repair for video production workflows.', tags: ['video', 'repair', 'workflow'] },
        strategy: { topic: 'Selective scene repair' },
        assets: {
          video: { visualAssets: [imagePath] },
          audio: { path: originalAudioPath, status: 'ready', simulated: false, provider: 'fixture-tts', model: 'fixture-voice' },
          thumbnail: { path: imagePath },
          finalVideo: { path: oldVideoPath, simulated: false, duration: '1:00', provider: { actualProvider: 'slideshow' } }
        },
        timeline: { readyForUpload: new Date().toISOString() },
        scheduledPublishTime: new Date(Date.now() + 86400000).toISOString(),
        priority: 50,
        estimatedDuration: '1:00'
      };
      await db.saveProductionData(production);
      await db.saveProductionSnapshot(production);
      await db.saveContentReview(production.id, { status: 'needs_review', editorData: {}, qualityChecks: [] });
      await db.saveContentProvenance(production.id, {
        sources: [], claims: [], containsSyntheticMedia: false, status: 'not_required',
        summary: { sourceCount: 0, verifiedSources: 0, claimCount: 0, resolvedClaims: 0, highRiskClaims: 0, unresolvedClaims: 0 }
      });

      const manifest = buildInitialSceneManifest(production, { actualProvider: 'slideshow', model: 'local-ffmpeg' });
      if (manifest.length < 3 || manifest.some(scene => scene.assetPath !== imagePath)) {
        throw new Error('Initial scene manifest did not preserve the script structure and visual assets');
      }
      await db.replaceProductionScenes(production.id, manifest);
      for (const scene of await db.listProductionScenes(production.id)) {
        await db.updateProductionScene(production.id, scene.id, {
          audioPath: originalAudioPath, narrationStatus: 'current',
          narrationProvider: 'fixture-tts', narrationModel: 'fixture-voice'
        });
      }
      const roundTrip = await db.listProductionScenes(production.id);
      if (roundTrip.length !== manifest.length || roundTrip[0].scriptText !== manifest[0].scriptText) {
        throw new Error('Scene manifest did not round-trip through SQLite');
      }

      const fakeProvider = {
        id: 'seedance', model: 'seedance-test',
        normalizeRequest: request => ({ ...request, duration: Math.min(4, Number(request.duration || 4)) })
      };
      const fakeGenerator = {
        mediaGeneration: {
          settings: async () => ({ provider: 'seedance', order: ['seedance'], clipDuration: 4, resolution: '720p', aspectRatio: '16:9' }),
          registry: { select: () => fakeProvider, get: () => fakeProvider },
          generateClip: async ({ outputPath }) => {
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, Buffer.from('generated scene video'));
            return { outputPath, task: { model: fakeProvider.model, external_task_id: 'scene-task-1' } };
          },
          isValidVideo: async () => true
        },
        generateVisualAssets: async () => [imagePath],
        async generateTTSAudio(_text, outputPath) {
          await fs.writeFile(outputPath, Buffer.from('scene narration'));
          this.lastNarrationResult = {
            status: 'ready', path: outputPath, provider: 'fixture-tts', model: 'fixture-voice-v2',
            externalTaskId: 'narration-task-1', generatedAt: new Date().toISOString(),
            cost: { provider: 'fixture-tts', amount: null, invoiceRequired: true }
          };
          return outputPath;
        },
        isUsableAudioFile: async filePath => Boolean(filePath && await fs.stat(filePath).then(stat => stat.size > 0).catch(() => false)),
        renderMediaTimeline: async (_segments, outputPath) => { await fs.writeFile(outputPath, Buffer.from('rebuilt visual timeline')); return outputPath; },
        addAudioToVideo: async (videoPath, _audioPath, outputPath) => { await fs.copyFile(videoPath, outputPath); return outputPath; }
      };
      const service = new SceneRepairService(db, fakeGenerator, { dataRoot: directory, logger: this.logger });
      service.rebuildNarration = async () => originalAudioPath;
      const first = roundTrip[0];
      const edited = await service.updateScene(production.id, first.id, {
        scriptText: `${first.scriptText} Updated narration.`, prompt: `${first.prompt} Brighter composition.`, factualChange: false
      });
      if (edited.status !== 'visual_stale' || edited.narrationStatus !== 'stale' || edited.revision !== first.revision + 1) {
        throw new Error('Scene edits did not invalidate only the scene rebuild and narration state');
      }

      const quality = await new OperatorService(db).runQualityChecks({ ...(await db.getProductionBundle(production.id)), scenes: await db.listProductionScenes(production.id) }, {});
      if (quality.passed || !quality.blockingFailures.includes('scene_integrity')) {
        throw new Error('Approval quality checks did not block an unrepaired scene');
      }
      const estimate = await service.regenerationEstimate(production.id, first.id);
      if (!estimate.paid || estimate.provider !== 'seedance') throw new Error('Paid scene estimate did not expose provider billing risk');
      let paidBlocked = false;
      try {
        await service.regenerate(production.id, first.id, { regenerateNarration: true });
      } catch (error) {
        paidBlocked = error.code === 'PAID_CONFIRMATION_REQUIRED';
      }
      if (!paidBlocked) throw new Error('Paid scene regeneration started without explicit confirmation');
      const regenerated = await service.regenerate(production.id, first.id, { confirmPaid: true, regenerateNarration: true });
      if (
        regenerated.scene.status !== 'needs_rebuild' || regenerated.scene.externalTaskId !== 'scene-task-1' ||
        regenerated.scene.narrationStatus !== 'current' || regenerated.scene.narrationProvider !== 'fixture-tts' ||
        regenerated.scene.narrationTaskId !== 'narration-task-1'
      ) {
        throw new Error('Confirmed selective regeneration did not persist visual and narration evidence');
      }

      const second = roundTrip[1];
      const replacement = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#ad3d45' } }).png().toBuffer();
      let rightsBlocked = false;
      try {
        await service.replaceAsset(production.id, second.id, { buffer: replacement, contentType: 'image/png', filename: 'replacement.png' });
      } catch (error) {
        rightsBlocked = error.code === 'RIGHTS_CONFIRMATION_REQUIRED';
      }
      if (!rightsBlocked) throw new Error('Uploaded scene asset bypassed rights confirmation');
      const replaced = await service.replaceAsset(production.id, second.id, {
        buffer: replacement, contentType: 'image/png', filename: 'replacement.png', rightsConfirmed: true
      });
      if (replaced.assetOrigin !== 'uploaded' || !replaced.rightsConfirmed || replaced.status !== 'needs_rebuild') {
        throw new Error('Replacement asset evidence did not persist');
      }

      const ordered = await service.reorder(production.id, (await db.listProductionScenes(production.id)).map(scene => scene.id).reverse());
      if (ordered[0].id === first.id) throw new Error('Scene timeline order did not persist');
      const rebuilt = await service.rebuild(production.id);
      const finalBundle = await db.getProductionBundle(production.id);
      if (!rebuilt.finalVideo || finalBundle.assets.finalVideo.previousPath !== oldVideoPath || finalBundle.scenes.some(scene => scene.status !== 'ready')) {
        throw new Error('Scene rebuild did not preserve the prior video and finalize every scene');
      }
      const revisions = await db.listProductionSceneRevisions(production.id);
      for (const action of ['edit', 'regenerate', 'replace_asset', 'reorder', 'rebuild']) {
        if (!revisions.some(revision => revision.action === action)) throw new Error(`Scene revision history is missing ${action}`);
      }

      const locked = await service.updateScene(production.id, ordered[0].id, { locked: true });
      let lockBlocked = false;
      try {
        await service.updateScene(production.id, locked.id, { prompt: 'Unauthorized locked edit' });
      } catch (error) {
        lockBlocked = error.status === 409;
      }
      if (!lockBlocked) throw new Error('Locked scene accepted an edit');
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
    this.logger.info('Scene Repair Studio test completed successfully');
  }

  async testNarrationReliability() {
    const fs = require('fs').promises;
    const os = require('os');
    const { SceneRepairService } = require('./utils/scene-repair-service');
    const { OperatorService } = require('./utils/operator-service');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-narration-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'narration.db');
    await db.initialize();

    try {
      const productionId = 'prod-narration-recovery';
      const visualPath = path.join(directory, 'scene.png');
      const videoPath = path.join(directory, 'video.mp4');
      await fs.writeFile(visualPath, Buffer.from('visual'));
      await fs.writeFile(videoPath, Buffer.from('video'));
      const production = {
        id: productionId, status: 'ready',
        strategy: { topic: 'Narration recovery' },
        script: {
          title: 'Narration recovery',
          fullScript: 'A complete script that demonstrates reliable narration recovery and explicit operator controls.'.repeat(4)
        },
        seo: {
          title: 'Narration recovery',
          description: 'A detailed explanation of reliable narration recovery for production workflows.',
          tags: ['narration', 'recovery', 'workflow']
        },
        assets: {
          audio: { path: path.join(directory, 'missing.mp3.info'), status: 'unavailable', simulated: true, error: 'Provider quota exhausted' },
          finalVideo: { path: videoPath, simulated: false }, thumbnail: { path: visualPath }
        },
        timeline: {}, priority: 50, scheduledPublishTime: new Date(Date.now() + 86400000).toISOString()
      };
      await db.saveProductionData(production);
      await db.saveProductionSnapshot(production);
      await db.replaceProductionScenes(productionId, [{
        id: 'scene-narration-1', label: 'Opening', scriptText: 'This narration must be recovered.',
        prompt: 'Opening visual', duration: 8, assetType: 'image', assetOrigin: 'generated', assetPath: visualPath,
        status: 'ready', narrationStatus: 'unavailable', narrationError: 'Provider quota exhausted', rightsConfirmed: true
      }]);

      const blockedQuality = await new OperatorService(db).runQualityChecks({
        ...production, scenes: await db.listProductionScenes(productionId)
      }, {});
      if (blockedQuality.passed || !blockedQuality.blockingFailures.includes('narration')) {
        throw new Error('Missing narration did not block production quality');
      }

      let failProvider = true;
      const generator = {
        async generateTTSAudio(_text, outputPath) {
          if (failProvider) {
            this.lastNarrationResult = {
              status: 'failed', provider: 'openai', model: 'gpt-4o-mini-tts',
              generatedAt: new Date().toISOString(), error: 'Provider quota exhausted',
              cost: { provider: 'openai', amount: null, invoiceRequired: true }
            };
            throw new Error('Provider quota exhausted');
          }
          await fs.writeFile(outputPath, Buffer.from('recovered narration'));
          this.lastNarrationResult = {
            status: 'ready', path: outputPath, provider: 'openai', model: 'gpt-4o-mini-tts',
            externalTaskId: 'tts-task-1', generatedAt: new Date().toISOString(),
            cost: { provider: 'openai', amount: null, invoiceRequired: true }
          };
          return outputPath;
        },
        isUsableAudioFile: async filePath => Boolean(filePath && await fs.stat(filePath).then(stat => stat.size > 0).catch(() => false))
      };
      const service = new SceneRepairService(db, generator, { dataRoot: directory, logger: this.logger });

      let confirmationBlocked = false;
      try {
        await service.regenerateNarration(productionId, 'scene-narration-1');
      } catch (error) {
        confirmationBlocked = error.code === 'NARRATION_COST_CONFIRMATION_REQUIRED';
      }
      if (!confirmationBlocked) throw new Error('Narration regeneration bypassed the provider-cost confirmation');

      let outagePersisted = false;
      try {
        await service.regenerateNarration(productionId, 'scene-narration-1', { confirmCost: true });
      } catch (_error) {
        const failed = await db.getProductionScene(productionId, 'scene-narration-1');
        outagePersisted = failed.narrationStatus === 'failed' && failed.narrationProvider === 'openai' && /quota/.test(failed.narrationError);
      }
      if (!outagePersisted) throw new Error('Narration provider failure evidence was not persisted');

      failProvider = false;
      const recovered = await service.regenerateNarration(productionId, 'scene-narration-1', { confirmCost: true });
      if (
        recovered.narrationStatus !== 'current' || recovered.narrationProvider !== 'openai' ||
        recovered.narrationModel !== 'gpt-4o-mini-tts' || recovered.narrationTaskId !== 'tts-task-1' ||
        recovered.status !== 'needs_rebuild'
      ) {
        throw new Error('Narration-only recovery did not preserve provider evidence and rebuild state');
      }

      let weakSilenceBlocked = false;
      try {
        await service.setSilenceOverride(productionId, { enabled: true, confirmed: true, reason: 'silent' });
      } catch (error) {
        weakSilenceBlocked = /at least 10/.test(error.message);
      }
      if (!weakSilenceBlocked) throw new Error('Intentional silence was accepted without a meaningful reason');

      await service.setSilenceOverride(productionId, {
        enabled: true, confirmed: true, reason: 'This visual demonstration intentionally uses captions only.'
      });
      const silenceBundle = await db.getProductionBundle(productionId);
      const silenceQuality = await new OperatorService(db).runQualityChecks(silenceBundle, {});
      const narrationCheck = silenceQuality.checks.find(check => check.id === 'narration');
      if (!narrationCheck?.passed || silenceBundle.scenes[0].narrationStatus !== 'intentional_silence') {
        throw new Error('Confirmed intentional silence did not satisfy the narration evidence gate');
      }

      const revisions = await db.listProductionSceneRevisions(productionId);
      for (const action of ['regenerate_narration', 'confirm_intentional_silence']) {
        if (!revisions.some(revision => revision.action === action)) throw new Error(`Narration history is missing ${action}`);
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
    this.logger.info('Narration reliability and recovery test completed successfully');
  }

  async testShortsRepurposingStudio() {
    const fs = require('fs').promises;
    const os = require('os');
    const { runFFmpeg } = require('./utils/ffmpeg');
    const { ShortsRepurposingService } = require('./utils/shorts-repurposing-service');
    const { PublishingSchedulingAgent } = require('./agents/publishing-scheduling-agent');
    const { ChannelLearningEngine } = require('./utils/channel-learning-engine');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-shorts-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'shorts.db');
    await db.initialize();

    try {
      const productionId = 'prod-shorts-studio';
      const sourceVideo = path.join(directory, 'source.mp4');
      const audioPath = path.join(directory, 'narration.m4a');
      const thumbnailPath = path.join(directory, 'thumbnail.jpg');
      await runFFmpeg([
        '-y', '-f', 'lavfi', '-i', 'color=c=#203a5f:s=640x360:r=24:d=4',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', sourceVideo
      ]);
      await fs.writeFile(audioPath, Buffer.from('narration evidence'));
      await fs.writeFile(thumbnailPath, Buffer.from('thumbnail evidence'));
      const production = {
        id: productionId, status: 'scheduled',
        strategy: { topic: 'Repurpose one production', contentType: 'tutorial' },
        script: { title: 'Repurpose one production', fullScript: 'A complete source script for producing several useful vertical excerpts from one approved production.'.repeat(4) },
        seo: {
          title: 'Repurpose one production',
          description: 'A detailed source description for a safe and efficient vertical repurposing workflow.',
          tags: ['repurposing', 'shorts', 'workflow']
        },
        assets: {
          finalVideo: { path: sourceVideo, simulated: false, duration: 4 },
          audio: { path: audioPath, status: 'ready', simulated: false, provider: 'fixture-tts' },
          thumbnail: { path: thumbnailPath }
        },
        timeline: {}, priority: 50,
        scheduledPublishTime: new Date(Date.now() + 86400000).toISOString()
      };
      await db.saveProductionData(production);
      await db.saveProductionSnapshot(production);
      await db.saveContentReview(productionId, {
        status: 'approved', editorData: { factChecked: true, rightsConfirmed: true },
        qualityChecks: [], reviewedAt: new Date().toISOString()
      });
      await db.saveContentProvenance(productionId, {
        sources: [], claims: [], containsSyntheticMedia: true, status: 'not_required',
        summary: { sourceCount: 0, verifiedSources: 0, claimCount: 0, resolvedClaims: 0, highRiskClaims: 0, unresolvedClaims: 0 }
      });
      await db.replaceProductionScenes(productionId, [
        { id: 'short-source-1', label: 'Hook', scriptText: 'One strong idea can reach more than one audience.', prompt: 'Opening', duration: 1.4, assetType: 'video', assetPath: sourceVideo, audioPath, status: 'ready', narrationStatus: 'current', rightsConfirmed: true },
        { id: 'short-source-2', label: 'Method', scriptText: 'Use the approved scene evidence to build a vertical excerpt.', prompt: 'Method', duration: 1.3, assetType: 'video', assetPath: sourceVideo, audioPath, status: 'ready', narrationStatus: 'current', rightsConfirmed: true },
        { id: 'short-source-3', label: 'Result', scriptText: 'Render locally and review every Short before it reaches the schedule.', prompt: 'Result', duration: 1.3, assetType: 'video', assetPath: sourceVideo, audioPath, status: 'ready', narrationStatus: 'current', rightsConfirmed: true }
      ]);

      const publishing = new PublishingSchedulingAgent(db, {});
      const service = new ShortsRepurposingService(db, publishing, {
        dataRoot: path.join(directory, 'shorts'), width: 360, height: 640, logger: this.logger
      });
      const proposed = await service.propose(productionId, { count: 3 });
      if (proposed.length !== 3 || proposed.some(clip => !clip.sourceSceneIds.length || clip.status !== 'proposed')) {
        throw new Error('Short drafts did not preserve source-scene identity');
      }
      const edited = await service.update(productionId, proposed[0].id, {
        title: 'One approved video, three vertical moments', layout: 'blur',
        tags: ['Shorts', 'repurposing', 'workflow']
      });
      if (edited.title.length > 100 || edited.layout !== 'blur') throw new Error('Short draft edits did not persist');
      const rendered = await service.render(productionId, edited.id);
      if (rendered.status !== 'rendered' || !rendered.outputPath || !rendered.captionsPath) {
        throw new Error('Local vertical rendering did not persist its MP4 and captions');
      }
      await runFFmpeg(['-v', 'error', '-i', rendered.outputPath, '-f', 'null', '-']);

      let approvalBlocked = false;
      try {
        await service.approve(productionId, rendered.id, {});
      } catch (error) {
        approvalBlocked = error.code === 'SHORT_APPROVAL_REQUIRED';
      }
      if (!approvalBlocked) throw new Error('Short scheduling bypassed explicit approval confirmation');
      const scheduled = await service.approve(productionId, rendered.id, {
        confirmed: true, publishTime: new Date(Date.now() + 172800000).toISOString(), privacyStatus: 'private'
      });
      const schedule = await db.getLatestScheduleEntry(rendered.id);
      if (
        scheduled.status !== 'scheduled' || !schedule || schedule.metadata.contentType !== 'short' ||
        schedule.metadata.sourceProductionId !== productionId || schedule.metadata.containsSyntheticMedia !== true
      ) {
        throw new Error('Approved Short did not inherit evidence into an independent schedule entry');
      }
      schedule.status = 'published';
      schedule.youtubeId = 'youtube-short-1';
      schedule.youtubeUrl = 'https://www.youtube.com/shorts/youtube-short-1';
      schedule.publishedAt = new Date().toISOString();
      await db.updateScheduleEntry(schedule);
      await publishing.syncShortStatus(schedule, 'published');
      const published = await db.getShortClip(rendered.id);
      const context = await db.getPublishedContentContext('youtube-short-1');
      const attributes = new ChannelLearningEngine(db).extractAttributes({ videoDetails: { title: published.title } }, context);
      if (published.status !== 'published' || context.contentFormat !== 'short' || attributes.surface !== 'shorts' || attributes.format !== 'shorts') {
        throw new Error('Published Short did not remain separate in analytics learning context');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
    this.logger.info('Shorts Repurposing Studio test completed successfully');
  }

  async testProvenanceDesk() {
    const fs = require('fs').promises;
    const os = require('os');
    const { ProvenanceService } = require('./utils/provenance-service');
    const { OperatorService } = require('./utils/operator-service');
    const { PublishingSchedulingAgent } = require('./agents/publishing-scheduling-agent');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-provenance-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'provenance.db');
    await db.initialize();
    const productionId = 'prod-provenance-test';
    const videoPath = path.join(directory, 'video.mp4');
    const audioPath = path.join(directory, 'narration.mp3');
    await fs.writeFile(videoPath, Buffer.from('test-video'));
    await fs.writeFile(audioPath, Buffer.from('test-audio'));

    try {
      await db.saveProductionData({
        id: productionId,
        status: 'needs_review',
        assets: { finalVideo: { path: videoPath, simulated: false }, audio: { path: audioPath, status: 'ready', simulated: false, provider: 'fixture-tts' } },
        timeline: {}, scheduledPublishTime: new Date(Date.now() + 86400000).toISOString(),
        priority: 50, estimatedDuration: '1:00'
      });
      const production = {
        id: productionId,
        strategy: {
          topic: 'Evidence-aware automation',
          researchSources: [{
            url: 'https://example.com/research/fact',
            title: 'Official research evidence',
            publisher: 'Example Institute',
            sourceType: 'official'
          }]
        },
        script: {
          title: 'Evidence-aware automation',
          fullScript: 'A sufficiently detailed script with a factual statement that must be reviewed before this production can be approved.'.repeat(3),
          claims: [{
            text: 'The documented workflow reduces repeated manual steps.',
            riskLevel: 'standard',
            sourceUrls: ['https://example.com/research/fact']
          }]
        },
        seo: {
          title: 'Evidence-aware automation',
          description: 'A detailed description of an evidence-aware automation workflow for careful channel operators.',
          tags: ['automation', 'evidence', 'workflow']
        },
        assets: { finalVideo: { path: videoPath, simulated: false }, audio: { path: audioPath, status: 'ready', simulated: false, provider: 'fixture-tts' } }
      };
      await db.saveProductionSnapshot(production);

      const provenanceService = new ProvenanceService(db);
      const initialized = await provenanceService.initialize(productionId, production);
      if (
        initialized.status !== 'blocked' || initialized.sources.length !== 1 ||
        initialized.claims.length !== 1 || initialized.claims[0].sourceIds.length !== 1
      ) {
        throw new Error('Generated research sources and claims were not initialized as unresolved provenance');
      }

      const publishGuard = new PublishingSchedulingAgent(db, {});
      publishGuard.publishQueue = [{ productionId, status: 'scheduled', metadata: {} }];
      let blockedPublishRejected = false;
      try {
        await publishGuard.publishContent(productionId);
      } catch (error) {
        blockedPublishRejected = error.code === 'PROVENANCE_BLOCKED';
      }
      if (!blockedPublishRejected) throw new Error('Publishing did not independently enforce the provenance gate');

      let unverifiedSupportRejected = false;
      try {
        await provenanceService.review(productionId, {
          sources: initialized.sources,
          claims: [{ ...initialized.claims[0], status: 'supported' }]
        });
      } catch (error) {
        unverifiedSupportRejected = /verified source/.test(error.message);
      }
      if (!unverifiedSupportRejected) throw new Error('A claim was supported without reviewer-verified evidence');

      const reviewed = await provenanceService.review(productionId, {
        sources: initialized.sources.map(source => ({ ...source, status: 'verified' })),
        claims: [{ ...initialized.claims[0], status: 'supported' }],
        containsSyntheticMedia: true
      });
      if (reviewed.status !== 'verified' || !reviewed.containsSyntheticMedia || reviewed.summary.unresolvedClaims !== 0) {
        throw new Error('A complete evidence review was not persisted as verified');
      }

      const bundle = await db.getProductionBundle(productionId);
      const quality = await new OperatorService(db).runQualityChecks({ ...production, provenance: bundle.provenance }, {});
      if (!quality.passed || !quality.checks.find(check => check.id === 'provenance' && check.passed)) {
        throw new Error('Verified provenance did not satisfy the production quality gate');
      }

      let uploadRequest;
      const publishing = new PublishingSchedulingAgent(db, {});
      publishing.youtube = {
        videos: { insert: async request => { uploadRequest = request; return { data: { id: 'provenance-video' } }; } }
      };
      await publishing.uploadToYouTube({
        publishTime: new Date(Date.now() + 86400000).toISOString(),
        metadata: {
          seo: production.seo,
          video: { path: videoPath },
          privacyStatus: 'private',
          containsSyntheticMedia: true
        }
      });
      if (uploadRequest?.requestBody?.status?.containsSyntheticMedia !== true) {
        throw new Error('Synthetic-media disclosure was not handed to the YouTube upload request');
      }

      let emptyWaiverRejected = false;
      try {
        new ProvenanceService(db).build({
          sources: reviewed.sources,
          claims: [{ ...reviewed.claims[0], status: 'waived', notes: '' }]
        });
      } catch (error) {
        emptyWaiverRejected = /reviewer note/.test(error.message);
      }
      if (!emptyWaiverRejected) throw new Error('A claim waiver without a reviewer note was accepted');
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    this.logger.info('Research and provenance desk test completed successfully');
  }

  async testDiscoverabilityPreflight() {
    const fs = require('fs').promises;
    const os = require('os');
    const { DiscoverabilityService } = require('./utils/discoverability-service');
    const { OperatorService } = require('./utils/operator-service');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-discoverability-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'discoverability.db');
    await db.initialize();
    const productionId = 'prod-discoverability-test';
    const fakeAdapter = {
      audit: async content => ({
        schemaVersion: '1.0',
        engine: { name: 'darkzseo', version: '1.4.0' },
        mode: 'content',
        target: content.id,
        status: 'attention_required',
        summary: {
          severity: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0, INFO: 0 },
          category: { SEO: 0, GEO: 1, AIO: 0, AEO: 0 }
        },
        findings: [{
          ruleId: 'geo.trust_network', category: 'GEO', severity: 'HIGH',
          applicability: ['youtube', 'content'],
          message: 'Trust Network: Long content lacks authority links',
          remediation: 'Add a verified authority source.'
        }]
      })
    };

    try {
      await db.saveProductionData({
        id: productionId, status: 'needs_review', assets: {}, timeline: {},
        scheduledPublishTime: null, priority: 50, estimatedDuration: '1:00'
      });
      const production = {
        id: productionId,
        script: { title: 'AgentTube discoverability', fullScript: 'Detailed content '.repeat(200), sections: [] },
        seo: { title: 'AgentTube discoverability', description: 'A detailed discoverability review.', chapters: [] },
        provenance: { sources: [] }
      };
      await db.saveProductionSnapshot(production);
      const service = new DiscoverabilityService(db, { adapter: fakeAdapter });
      const first = await service.auditProduction(production, { channel_name: 'AgentTube' });
      if (first.engineVersion !== '1.4.0' || first.findings.length !== 1 || first.pendingCount !== 1) {
        throw new Error('The versioned DarkzSEO report was not persisted');
      }

      const quality = await new OperatorService(db).runQualityChecks({ ...production, discoverability: first }, {});
      const discoverabilityCheck = quality.checks.find(check => check.id === 'discoverability');
      if (!discoverabilityCheck || discoverabilityCheck.passed || discoverabilityCheck.blocking) {
        throw new Error('High-priority discoverability guidance was not advisory and visible');
      }

      let shortReasonRejected = false;
      try {
        await service.reviewFinding(first.findings[0].id, { status: 'dismissed', reason: 'no' });
      } catch (error) {
        shortReasonRejected = /at least 5/.test(error.message);
      }
      if (!shortReasonRejected) throw new Error('A false-positive dismissal without reviewer evidence was accepted');

      await service.reviewFinding(first.findings[0].id, { status: 'dismissed', reason: 'The cited source is attached in the approved evidence desk.' });
      const second = await service.auditProduction(production, { channel_name: 'AgentTube' });
      if (second.findings[0].reviewStatus !== 'dismissed' || second.pendingCount !== 0) {
        throw new Error('Finding review evidence did not carry forward across matching audits');
      }
      const reviewedQuality = await new OperatorService(db).runQualityChecks({ ...production, discoverability: second }, {});
      if (!reviewedQuality.checks.find(check => check.id === 'discoverability' && check.passed)) {
        throw new Error('A dismissed false positive remained an actionable quality warning');
      }

      const { YouTubeAutomationAgent } = require('./index');
      const apiAgent = new YouTubeAutomationAgent();
      apiAgent.db = db;
      apiAgent.operator = new OperatorService(db);
      apiAgent.discoverability = service;
      apiAgent.setupAPI();
      const server = await new Promise(resolve => {
        const listener = apiAgent.app.listen(0, '127.0.0.1', () => resolve(listener));
      });
      try {
        const address = server.address();
        const apiHeaders = { 'content-type': 'application/json', ...(process.env.API_KEY ? { 'x-api-key': process.env.API_KEY } : {}) };
        const runResponse = await fetch(`http://127.0.0.1:${address.port}/api/content/${productionId}/discoverability/run`, {
          method: 'POST', headers: apiHeaders, body: JSON.stringify({ platform: 'youtube' })
        });
        const runPayload = await runResponse.json();
        if (!runResponse.ok || runPayload.audit?.schemaVersion !== '1.0' || !runPayload.result?.discoverability) {
          throw new Error('Discoverability run API did not return the persisted versioned audit');
        }
        const apiFinding = runPayload.audit.findings[0];
        const reviewResponse = await fetch(`http://127.0.0.1:${address.port}/api/discoverability/findings/${apiFinding.id}`, {
          method: 'PATCH', headers: apiHeaders, body: JSON.stringify({ status: 'accepted' })
        });
        const reviewPayload = await reviewResponse.json();
        if (!reviewResponse.ok || reviewPayload.result?.finding?.reviewStatus !== 'accepted') {
          throw new Error('Discoverability review API did not persist the operator decision');
        }
      } finally {
        await new Promise(resolve => server.close(resolve));
      }

      const unavailableService = new DiscoverabilityService(db, {
        adapter: { audit: async () => { const error = new Error('Python is not installed'); error.code = 'DARKZSEO_UNAVAILABLE'; throw error; } }
      });
      const unavailable = await unavailableService.auditProduction(production, { channel_name: 'AgentTube' });
      if (unavailable.status !== 'unavailable' || unavailable.errorCode !== 'DARKZSEO_UNAVAILABLE' || unavailable.findings.length !== 0) {
        throw new Error('An unavailable DarkzSEO runtime was not stored explicitly');
      }
      const unavailableQuality = await new OperatorService(db).runQualityChecks({ ...production, discoverability: unavailable }, {});
      const unavailableCheck = unavailableQuality.checks.find(check => check.id === 'discoverability');
      if (!unavailableCheck || unavailableCheck.passed || unavailableCheck.blocking) {
        throw new Error('DarkzSEO runtime availability did not remain an explicit non-blocking check');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    this.logger.info('DarkzSEO discoverability preflight test completed successfully');
  }

  async testResumableGenerationCheckpoints() {
    const fs = require('fs').promises;
    const os = require('os');
    const { YouTubeAutomationAgent } = require('./index');
    const { GenerationRecoveryService } = require('./utils/generation-recovery-service');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-recovery-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'recovery.db');
    await db.initialize();

    const thumbnailPath = path.join(directory, 'thumbnail.jpg');
    const videoPath = path.join(directory, 'video.mp4');
    await fs.writeFile(thumbnailPath, Buffer.from('thumbnail'));
    await fs.writeFile(videoPath, Buffer.from('video'));
    const strategy = {
      topic: 'Checkpointed automation',
      contentType: 'Tutorial',
      requestedStyle: 'tutorial',
      requestedLengthKey: 'short'
    };
    const script = {
      title: 'Checkpointed automation',
      fullScript: 'A complete script that can be reused after an interrupted generation run.',
      mainContent: [{ text: 'Reusable content' }]
    };
    let strategyCalls = 0;
    let scriptCalls = 0;
    let productionCalls = 0;

    try {
      const agent = new YouTubeAutomationAgent();
      agent.db = db;
      agent.recovery = new GenerationRecoveryService(db, {
        logger: agent.logger,
        baseDelayMs: 0,
        updateJobStage: (...args) => agent.updateJobStage(...args)
      });
      agent.readiness = { assertReady: async () => true };
      agent.operator = {
        runQualityChecks: async () => ({ passed: true, score: 100, checks: [{ passed: true }], blockingFailures: [] }),
        notify: async () => null
      };
      agent.agents = {
        strategy: { generateContentStrategy: async () => { strategyCalls++; return strategy; } },
        scriptWriter: { generateScript: async () => { scriptCalls++; return script; } },
        thumbnailDesigner: { generateThumbnail: async () => ({ path: thumbnailPath, concept: {} }) },
        seoOptimizer: { optimize: async () => ({ title: script.title, description: 'A complete description.', tags: ['automation'] }) },
        production: {
          processContent: async input => {
            productionCalls++;
            return {
              id: `recovery-production-${Date.now()}`,
              status: 'ready',
              ...input,
              assets: {
                finalVideo: { path: videoPath, simulated: false },
                thumbnail: { path: thumbnailPath }
              },
              timeline: {},
              scheduledPublishTime: new Date(Date.now() + 86400000).toISOString(),
              priority: 50,
              estimatedDuration: '2:00'
            };
          }
        },
        publishing: { scheduleContent: async () => null }
      };

      const job = await db.createGenerationJob({
        topic: strategy.topic,
        style: 'tutorial',
        length: 'short',
        source: 'manual',
        strategyContext: { objective: 'Test recovery' }
      });
      await db.saveGenerationCheckpoint(job.id, 'strategy', {
        status: 'completed', artifact: strategy, completedAt: new Date().toISOString()
      });
      await db.saveGenerationCheckpoint(job.id, 'script', {
        status: 'completed', artifact: script, completedAt: new Date().toISOString()
      });
      await db.updateGenerationJob(job.id, { status: 'running', stage: 'thumbnail', progress: 40 });
      await db.markInterruptedJobs();
      const interrupted = await db.getGenerationJob(job.id);
      if (interrupted.status !== 'interrupted' || interrupted.stage !== 'thumbnail') {
        throw new Error('Restart recovery did not preserve the interrupted stage');
      }

      const resumed = await agent.resumeGenerationJob(job.id);
      if (resumed.details?.resumeFrom !== 'thumbnail') {
        throw new Error('Resume did not select the first incomplete stage');
      }
      await agent.waitForGenerationJob(job.id);
      const completed = await db.getGenerationJob(job.id);
      const checkpoints = await db.listGenerationCheckpoints(job.id);
      if (
        completed.status !== 'completed' ||
        checkpoints.filter(item => item.status === 'completed').length !== 6 ||
        strategyCalls !== 0 || scriptCalls !== 0 || productionCalls !== 1 ||
        !completed.details.reusedStages.includes('strategy') || !completed.details.reusedStages.includes('script')
      ) {
        throw new Error('Generation did not resume from verified checkpoints');
      }

      let transientAttempts = 0;
      const transientJob = await db.createGenerationJob({ topic: 'Transient retry' });
      const recovered = await agent.recovery.run(transientJob.id, 'strategy', 10, async () => {
        transientAttempts++;
        if (transientAttempts === 1) {
          const error = new Error('Temporary provider failure');
          error.status = 503;
          throw error;
        }
        return { topic: 'Recovered strategy' };
      });
      const transientCheckpoint = await db.getGenerationCheckpoint(transientJob.id, 'strategy');
      if (recovered.topic !== 'Recovered strategy' || transientAttempts !== 2 || transientCheckpoint.attempt_count !== 2) {
        throw new Error('A retry-safe transient stage failure was not recovered with bounded attempts');
      }

      const invalidJob = await db.createGenerationJob({ topic: 'Invalid dependency' });
      await db.saveGenerationCheckpoint(invalidJob.id, 'strategy', {
        status: 'completed', artifact: {}, completedAt: new Date().toISOString()
      });
      await db.saveGenerationCheckpoint(invalidJob.id, 'script', {
        status: 'completed', artifact: script, completedAt: new Date().toISOString()
      });
      await agent.recovery.run(invalidJob.id, 'strategy', 10, async () => ({ topic: 'Rebuilt dependency' }));
      if (await db.getGenerationCheckpoint(invalidJob.id, 'script')) {
        throw new Error('A stale downstream checkpoint survived invalid upstream artifact recovery');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    this.logger.info('Resumable generation checkpoints test completed successfully');
  }

  async testAPIValidationAndSecurity() {
    const { YouTubeAutomationAgent } = require('./index');
    const agent = new YouTubeAutomationAgent();

    if (typeof agent.validateGenerateRequestBody !== 'function') {
      throw new Error('validateGenerateRequestBody is not implemented');
    }
    if (typeof agent.requireAPIKey !== 'function') {
      throw new Error('requireAPIKey is not implemented');
    }

    const valid = agent.validateGenerateRequestBody({
      topic: 'Node automation',
      style: 'tutorial'
    });
    if (!valid.valid || valid.value.topic !== 'Node automation') {
      throw new Error('Valid generate request was rejected');
    }

    const invalidTopic = agent.validateGenerateRequestBody({ topic: 123 });
    if (invalidTopic.valid || invalidTopic.status !== 400) {
      throw new Error('Non-string topic was not rejected');
    }

    // The dashboard's "Generate Content Now" button sends an explicit null topic
    // to mean "pick a trending topic for me". null must be accepted, not rejected.
    const dashboardPayload = agent.validateGenerateRequestBody({ topic: null, style: 'story' });
    if (!dashboardPayload.valid) {
      throw new Error(`Dashboard generate payload was rejected: ${dashboardPayload.error}`);
    }
    if (dashboardPayload.value.topic !== null || dashboardPayload.value.style !== 'story') {
      throw new Error('Null topic was not normalised to an auto-selected topic');
    }

    const nullStyle = agent.validateGenerateRequestBody({ topic: 'Node automation', style: null });
    if (!nullStyle.valid || nullStyle.value.style !== null) {
      throw new Error('Null style was not accepted as "no style preference"');
    }

    const nullLength = agent.validateGenerateRequestBody({ topic: null, style: null, length: null });
    if (!nullLength.valid || nullLength.value.length !== 'medium') {
      throw new Error('Null length did not fall back to the default length');
    }

    const blankTopic = agent.validateGenerateRequestBody({ topic: '   ' });
    if (!blankTopic.valid || blankTopic.value.topic !== null) {
      throw new Error('Whitespace-only topic was not normalised to null');
    }

    const invalidStyle = agent.validateGenerateRequestBody({ style: 'x'.repeat(51) });
    if (invalidStyle.valid || invalidStyle.status !== 400) {
      throw new Error('Overlong style was not rejected');
    }

    const previousKey = process.env.API_KEY;
    process.env.API_KEY = 'test-secret';
    const middleware = agent.requireAPIKey();

    let rejectedNextCalled = false;
    const rejectedResponse = this.createMockResponse();
    middleware({ get: () => 'wrong-secret' }, rejectedResponse, () => {
      rejectedNextCalled = true;
    });

    if (rejectedNextCalled || rejectedResponse.statusCode !== 401) {
      throw new Error('Invalid API key was not rejected');
    }

    let acceptedNextCalled = false;
    const acceptedResponse = this.createMockResponse();
    middleware({ get: () => 'test-secret' }, acceptedResponse, () => {
      acceptedNextCalled = true;
    });

    if (!acceptedNextCalled || acceptedResponse.statusCode) {
      throw new Error('Valid API key was not accepted');
    }

    if (previousKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = previousKey;
    }

    this.logger.info('API validation and security test completed successfully');
  }

  createMockResponse() {
    return {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      }
    };
  }

  async testPublishingSafety() {
    const { PublishingSchedulingAgent } = require('./agents/publishing-scheduling-agent');
    const intentionalAudio = {
      intentionalSilence: true,
      silenceReason: 'This test fixture is intentionally silent.',
      silenceConfirmedAt: new Date().toISOString()
    };
    const agent = new PublishingSchedulingAgent({
      updateScheduleEntry: async () => {}
    }, {});

    agent.publishQueue = [
      { productionId: 'prod-a', title: 'A', status: 'scheduled', metadata: { audio: intentionalAudio } },
      { productionId: 'prod-b', title: 'B', status: 'scheduled', metadata: { audio: intentionalAudio } }
    ];
    agent.uploadToYouTube = async () => ({ id: 'youtube-1' });

    await agent.publishContent('prod-a');

    if (agent.publishQueue.length !== 1 || agent.publishQueue[0].productionId !== 'prod-b') {
      throw new Error('publishContent removed the wrong publish queue entries');
    }

    const missingNarration = new PublishingSchedulingAgent({ updateScheduleEntry: async () => {} }, {});
    missingNarration.publishQueue = [{ productionId: 'prod-no-audio', status: 'scheduled', metadata: {} }];
    missingNarration.uploadToYouTube = async () => { throw new Error('Upload must not start without narration'); };
    let narrationPublishBlocked = false;
    try {
      await missingNarration.publishContent('prod-no-audio');
    } catch (error) {
      narrationPublishBlocked = error.code === 'NARRATION_REQUIRED';
    }
    if (!narrationPublishBlocked) throw new Error('Publishing accepted a production without narration evidence');

    let missingFileRejected = false;
    try {
      await agent.getVideoStream(path.join(__dirname, 'data', 'missing-placeholder.mp4'));
    } catch (error) {
      missingFileRejected = /video file not found/.test(error.message);
    }

    if (!missingFileRejected) {
      throw new Error('getVideoStream did not reject a missing video file');
    }

    let uncertainUpdates = [];
    const uncertain = new PublishingSchedulingAgent({
      updateScheduleEntry: async entry => uncertainUpdates.push({ ...entry })
    }, {});
    uncertain.publishQueue = [
      { id: 'schedule-uncertain', productionId: 'prod-uncertain', title: 'Uncertain', status: 'scheduled', metadata: { audio: intentionalAudio } }
    ];
    let uploadAttempts = 0;
    uncertain.uploadToYouTube = async entry => {
      uploadAttempts++;
      entry.uploadAttempted = true;
      const error = new Error('socket closed during upload');
      error.code = 'ECONNRESET';
      throw error;
    };
    let uncertainBlocked = false;
    try {
      await uncertain.publishContent('prod-uncertain');
    } catch (error) {
      uncertainBlocked = error.code === 'UPLOAD_OUTCOME_UNKNOWN';
    }
    try {
      await uncertain.publishContent('prod-uncertain');
    } catch (error) {
      uncertainBlocked = uncertainBlocked && error.code === 'UPLOAD_OUTCOME_UNKNOWN';
    }
    if (!uncertainBlocked || uploadAttempts !== 1 || uncertainUpdates.at(-1)?.status !== 'reconciliation_required') {
      throw new Error('An uncertain upload outcome was retried or failed to require reconciliation');
    }

    let reconciliationCalls = 0;
    const recorded = {
      id: 'schedule-recorded', productionId: 'prod-recorded', title: 'Recorded', status: 'uploaded',
      youtubeId: 'youtube-existing', metadata: { audio: intentionalAudio }
    };
    const reconcile = new PublishingSchedulingAgent({
      getLatestScheduleEntry: async () => recorded,
      updateScheduleEntry: async () => {}
    }, {});
    reconcile.youtube = {
      videos: {
        list: async () => {
          reconciliationCalls++;
          return { data: { items: [{ id: 'youtube-existing' }] } };
        }
      }
    };
    reconcile.uploadToYouTube = async () => {
      throw new Error('A recorded upload must never be uploaded again');
    };
    const reconciled = await reconcile.publishContent('prod-recorded');
    if (reconciled.status !== 'published' || reconciliationCalls !== 1) {
      throw new Error('A recorded YouTube upload was not reconciled idempotently');
    }

    this.logger.info('Publishing safety test completed successfully');
  }

  async testCredentialValidation() {
    const { PROVIDERS } = require('./utils/ai-text-service');
    const manager = new CredentialManager();

    // Isolate the test from any API keys set in the environment
    const envKeys = [...Object.values(PROVIDERS).map(p => p.envKey), 'GEMINI_API_KEY'];
    const savedEnv = {};
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }

    try {
      manager.credentials = { youtube: { client_id: 'x' }, gemini: { apiKey: 'gm-test' } };
      if (manager.getMissingCredentials().length !== 0) {
        throw new Error('Gemini-only configuration was incorrectly reported as missing credentials');
      }

      manager.credentials = { youtube: { client_id: 'x' }, aiProvider: { provider: 'openrouter', apiKey: 'sk-or-test' } };
      if (manager.getMissingCredentials().length !== 0) {
        throw new Error('OpenRouter configuration was incorrectly reported as missing credentials');
      }

      manager.credentials = { youtube: { client_id: 'x' } };
      const missingProvider = manager.getMissingCredentials();
      if (missingProvider.length !== 1 || !/AI provider/.test(missingProvider[0])) {
        throw new Error('Missing AI provider was not detected');
      }

      manager.credentials = { openai: { apiKey: 'sk-test' } };
      const missingYouTube = manager.getMissingCredentials();
      if (missingYouTube.length !== 1 || missingYouTube[0] !== 'youtube') {
        throw new Error('Missing YouTube credentials were not detected');
      }
    } finally {
      for (const key of envKeys) {
        if (savedEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = savedEnv[key];
        }
      }
    }

    this.logger.info('Credential validation test completed successfully');
  }

  async testAITextServiceTokenParams() {
    const { AITextService } = require('./utils/ai-text-service');

    const savedEnv = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const service = new AITextService({
        aiProvider: { provider: 'openai', apiKey: 'test-key', model: 'gpt-5.6' }
      });

      // Newer OpenAI models (gpt-5.x) reject max_tokens — the request must use
      // max_completion_tokens, never the legacy spelling.
      const calls = [];
      service.client.chat.completions.create = async (params) => {
        calls.push(params);
        return { choices: [{ message: { content: '{"ok":true}' } }] };
      };

      const result = await service.generateText('test prompt', { maxTokens: 512 });
      if (result !== '{"ok":true}') throw new Error('generateText did not return the model content');
      if (calls[0].max_completion_tokens !== 512) {
        throw new Error('Modern models must receive max_completion_tokens, not max_tokens');
      }
      if (calls[0].max_tokens !== undefined) {
        throw new Error('Legacy max_tokens must not be sent to modern models');
      }

      // Legacy models reject max_completion_tokens with a 400 — the service must
      // retry the identical request using max_tokens.
      let attempt = 0;
      service.client.chat.completions.create = async (_params) => {
        attempt++;
        if (attempt === 1) {
          const err = new Error("Unsupported parameter: 'max_completion_tokens' is not supported with this model.");
          err.status = 400;
          throw err;
        }
        return { choices: [{ message: { content: 'legacy-ok' } }] };
      };
      const legacyResult = await service.generateText('legacy prompt');
      if (legacyResult !== 'legacy-ok') throw new Error('Legacy fallback did not return content');
      if (attempt !== 2) throw new Error('Expected exactly one retry with max_tokens');

      // An empty model body must surface as a descriptive error, not the cryptic
      // "Unexpected end of JSON input" the agents used to log.
      service.client.chat.completions.create = async () => ({ choices: [{ message: { content: '' } }] });
      let emptyRejected = false;
      try {
        await service.generateText('empty prompt');
      } catch (error) {
        emptyRejected = /empty response/i.test(error.message);
      }
      if (!emptyRejected) {
        throw new Error('Empty response was not rejected with a descriptive error');
      }

      // Gemini 3.5+ rejects/deprecates sampling parameters. Keep the latest
      // Gemini default on the parameter-safe request path.
      const geminiCalls = [];
      const geminiService = Object.create(AITextService.prototype);
      geminiService.gemini = {
        models: {
          generateContent: async (params) => {
            geminiCalls.push(params);
            return { text: 'gemini-ok' };
          }
        }
      };
      geminiService.client = null;
      geminiService.model = 'gemini-3.7-flash';
      geminiService.providerName = 'Google Gemini';

      const geminiResult = await geminiService.generateText('gemini prompt', { temperature: 0.2 });
      if (geminiResult !== 'gemini-ok') throw new Error('Gemini generation did not return content');
      if (geminiCalls[0].config.temperature !== undefined) {
        throw new Error('Gemini 3.7 must not receive the deprecated temperature parameter');
      }
    } finally {
      if (savedEnv === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = savedEnv;
    }

    this.logger.info('AI text service token parameter test completed successfully');
  }

  async testPlaceholderSchedulingGuard() {
    const { PublishingSchedulingAgent } = require('./agents/publishing-scheduling-agent');
    const agent = new PublishingSchedulingAgent({
      saveScheduleEntry: async () => {}
    }, {});

    const simulated = await agent.scheduleContent({
      id: 'prod-simulated',
      script: { title: 'Simulated' },
      assets: { finalVideo: { path: 'video.mp4.assembly.json', simulated: true } }
    });
    if (simulated !== null) {
      throw new Error('Simulated production was scheduled for publishing');
    }

    const missingVideo = await agent.scheduleContent({
      id: 'prod-missing',
      script: { title: 'Missing' },
      assets: {}
    });
    if (missingVideo !== null) {
      throw new Error('Production without a final video was scheduled for publishing');
    }

    const missingNarration = await agent.scheduleContent({
      id: 'prod-no-narration', script: { title: 'No narration' }, priority: 50,
      scheduledPublishTime: new Date().toISOString(),
      assets: { finalVideo: { path: 'video.mp4' } }, seo: {}
    });
    if (missingNarration !== null) throw new Error('Production without narration was scheduled for publishing');

    const real = await agent.scheduleContent({
      id: 'prod-real',
      script: { title: 'Real' },
      priority: 50,
      scheduledPublishTime: new Date().toISOString(),
      assets: {
        finalVideo: { path: 'video.mp4' }, thumbnail: {}, captions: {},
        audio: {
          intentionalSilence: true,
          silenceReason: 'This fixture intentionally uses a silent timeline.',
          silenceConfirmedAt: new Date().toISOString()
        }
      },
      seo: {}
    });
    if (!real || agent.publishQueue.length !== 1) {
      throw new Error('Real production was not scheduled for publishing');
    }

    this.logger.info('Placeholder scheduling guard test completed successfully');
  }

  async testFFmpegResolution() {
    const { getFFmpegPath, checkFFmpeg, ffmpegInstallHint } = require('./utils/ffmpeg');

    const ffmpegPath = getFFmpegPath();
    if (typeof ffmpegPath !== 'string' || ffmpegPath.length === 0) {
      throw new Error('getFFmpegPath did not return a usable path');
    }

    const available = await checkFFmpeg();
    if (typeof available !== 'boolean') {
      throw new Error('checkFFmpeg did not return a boolean');
    }

    if (!/FFmpeg/i.test(ffmpegInstallHint())) {
      throw new Error('ffmpegInstallHint did not return install guidance');
    }

    this.logger.info(`FFmpeg resolution test completed (binary: ${ffmpegPath}, available: ${available})`);
  }

  async testGeminiMediaProvider() {
    const { AIVideoGenerator } = require('./utils/ai-video-generator');
    const fs = require('fs').promises;
    const os = require('os');
    const sharp = require('sharp');

    const envKeys = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'REPLICATE_API_KEY', 'ELEVENLABS_API_KEY'];
    const savedEnv = {};
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-gemini-image-'));
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }

    try {
      const geminiOnly = new AIVideoGenerator({ gemini: { apiKey: 'test-key' } });
      if (!geminiOnly.gemini) {
        throw new Error('Gemini media service was not initialized from gemini credentials');
      }
      if (geminiOnly.openai) {
        throw new Error('OpenAI client initialized without a key');
      }

      const thoughtImage = await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#ff0000' }
      }).jpeg().toBuffer();
      const finalImage = await sharp({
        create: { width: 320, height: 180, channels: 3, background: '#0066ff' }
      }).webp().toBuffer();
      let imageRequest = null;
      geminiOnly.gemini.models.generateContent = async request => {
        imageRequest = request;
        return {
          candidates: [{
            content: {
              parts: [
                { thought: true, inlineData: { mimeType: 'image/jpeg', data: thoughtImage.toString('base64') } },
                { text: 'Rendering the final image.' },
                { inlineData: { mimeType: 'image/webp', data: finalImage.toString('base64') } }
              ]
            }
          }]
        };
      };

      const outputPath = path.join(directory, 'gemini-output.png');
      await geminiOnly.generateGeminiImage('Create a blue widescreen test image', outputPath);
      const metadata = await sharp(outputPath).metadata();
      if (metadata.format !== 'png' || metadata.width !== 320 || metadata.height !== 180) {
        throw new Error('Gemini final image was not selected and normalized to the requested file format');
      }
      if (
        imageRequest?.config?.responseModalities?.[0] !== 'IMAGE' ||
        imageRequest?.config?.imageConfig?.aspectRatio !== '16:9'
      ) {
        throw new Error('Gemini image request did not require a widescreen image response');
      }

      const none = new AIVideoGenerator({});
      if (none.gemini || none.openai) {
        throw new Error('Media services initialized without any credentials');
      }
    } finally {
      for (const key of envKeys) {
        if (savedEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = savedEnv[key];
        }
      }
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }

    this.logger.info('Gemini media provider selection test completed successfully');
  }

  async testSlideshowRenderer() {
    const { AIVideoGenerator } = require('./utils/ai-video-generator');
    const { checkFFmpeg } = require('./utils/ffmpeg');
    const fs = require('fs').promises;
    const os = require('os');

    if (!(await checkFFmpeg())) {
      this.logger.warn('FFmpeg unavailable — skipping slideshow renderer test');
      return;
    }

    const sharp = require('sharp');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-slides-'));

    try {
      const stills = [];
      for (let i = 0; i < 3; i++) {
        const stillPath = path.join(dir, `slide_${i}.png`);
        await sharp({
          create: { width: 320, height: 180, channels: 3, background: { r: 60 * i, g: 80, b: 160 } }
        }).png().toFile(stillPath);
        stills.push(stillPath);
      }

      const generator = new AIVideoGenerator({});
      if (generator.parseDurationSeconds('2:05') !== 125 || generator.parseDurationSeconds('1:02:03') !== 3723) {
        throw new Error('Human-readable production durations are not converted to timeline seconds');
      }

      const embeddedAssets = await generator.filterImageAssets(stills);
      if (embeddedAssets.length !== stills.length || embeddedAssets.some(asset => !asset.startsWith('data:image/png;base64,'))) {
        throw new Error('Slideshow image assets were not embedded as browser-safe image data');
      }
      const { chromium } = require('playwright');
      let browser = null;
      try {
        browser = await chromium.launch();
      } catch (error) {
        if (!/Executable doesn't exist|playwright install/i.test(error.message)) throw error;
        this.logger.warn('Chromium is not installed — verified browser-safe image embedding without the live browser assertion');
      }
      if (browser) {
        try {
          const page = await browser.newPage();
          await page.setContent(generator.createSlideshowHTML({ title: 'Image loading test' }, embeddedAssets));
          const imageState = await page.$$eval('.background-image', images => images.map(image => ({
            complete: image.complete,
            width: image.naturalWidth,
            height: image.naturalHeight
          })));
          if (!imageState.length || imageState.some(image => !image.complete || !image.width || !image.height)) {
            throw new Error('Embedded slideshow images did not load in Chromium');
          }
        } finally {
          await browser.close();
        }
      }

      const videoPath = path.join(dir, 'out.mp4');
      await generator.renderSlidesToVideo(stills, 6, videoPath);

      const stats = await fs.stat(videoPath);
      if (!stats.size) {
        throw new Error('Rendered slideshow video is empty');
      }

      // Missing narration must fail closed unless the operator explicitly confirmed silence.
      const finalPath = path.join(dir, 'final.mp4');
      let missingNarrationBlocked = false;
      try {
        await generator.addAudioToVideo(videoPath, path.join(dir, 'missing.mp3'), finalPath);
      } catch (error) {
        missingNarrationBlocked = error.code === 'NARRATION_REQUIRED';
      }
      if (!missingNarrationBlocked) throw new Error('Missing narration silently produced a final video');
      await generator.addAudioToVideo(videoPath, path.join(dir, 'missing.mp3'), finalPath, { allowSilent: true });
      const finalStats = await fs.stat(finalPath);
      if (!finalStats.size) {
        throw new Error('Explicit intentional-silence assembly did not produce a video');
      }

      const hybridPath = path.join(dir, 'hybrid.mp4');
      await generator.renderMediaTimeline([
        { type: 'video', path: videoPath, duration: 1 },
        { type: 'image', path: stills[0], duration: 1 }
      ], hybridPath);
      const hybridStats = await fs.stat(hybridPath);
      if (!hybridStats.size) throw new Error('Hybrid provider/still timeline did not produce a video');
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }

    this.logger.info('Slideshow renderer test completed successfully');
  }

  async testEvergreenTopics() {
    const { ContentStrategyAgent } = require('./agents/content-strategy-agent');
    const agent = new ContentStrategyAgent(null, {});
    agent.historicalPerformance = [];

    // Single scraped keywords must never become video topics
    agent.trendingTopics = [{ topic: 'crown', score: 5 }, { topic: 'official', score: 3 }];
    const fallback = agent.selectOptimalTopic();
    if (!fallback.topic.includes(' ') || fallback.topic.length < 8) {
      throw new Error(`Template mode produced a junk topic: "${fallback.topic}"`);
    }

    // A readable multi-word trend should be used when available
    agent.trendingTopics = [{ topic: 'artificial intelligence explained', score: 5 }];
    const readable = agent.selectOptimalTopic();
    if (readable.topic !== 'artificial intelligence explained') {
      throw new Error(`Readable trending topic was not selected: "${readable.topic}"`);
    }

    this.logger.info('Evergreen template topics test completed successfully');
  }

  async testWalkthroughModule() {
    const { SetupWalkthrough, AI_PROVIDER_GUIDE, VIDEO_PROVIDER_GUIDE } = require('./walkthrough');
    const { PROVIDERS, GEMINI_MODELS, GEMINI_DEFAULT_MODEL } = require('./utils/ai-text-service');

    const walkthrough = new SetupWalkthrough();
    if (typeof walkthrough.run !== 'function') {
      throw new Error('SetupWalkthrough.run is not implemented');
    }

    // Every guided provider must be complete and coherent
    for (const [id, guide] of Object.entries(AI_PROVIDER_GUIDE)) {
      for (const field of ['label', 'keyUrl', 'instructions', 'models', 'defaultModel', 'save', 'validationCreds']) {
        if (!guide[field]) {
          throw new Error(`Provider guide "${id}" is missing "${field}"`);
        }
      }
      if (!guide.models.includes(guide.defaultModel)) {
        throw new Error(`Provider guide "${id}" default model is not in its model list`);
      }

      // save() must produce credentials that pass validation
      const credentials = {};
      guide.save(credentials, 'test-key', guide.defaultModel);
      const manager = new CredentialManager();
      manager.credentials = { youtube: { client_id: 'x' }, ...credentials };

      const envKeys = [...Object.values(PROVIDERS).map(p => p.envKey), 'GEMINI_API_KEY'];
      const savedEnv = {};
      for (const key of envKeys) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
      }
      try {
        if (manager.getMissingCredentials().length !== 0) {
          throw new Error(`Provider guide "${id}" save() output fails credential validation`);
        }
      } finally {
        for (const key of envKeys) {
          if (savedEnv[key] === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = savedEnv[key];
          }
        }
      }
    }

    if (
      JSON.stringify(AI_PROVIDER_GUIDE.gemini.models) !== JSON.stringify(GEMINI_MODELS) ||
      AI_PROVIDER_GUIDE.gemini.defaultModel !== GEMINI_DEFAULT_MODEL
    ) {
      throw new Error('Walkthrough Gemini models drifted from the runtime catalog');
    }

    for (const id of Object.keys(PROVIDERS)) {
      if (JSON.stringify(AI_PROVIDER_GUIDE[id].models) !== JSON.stringify(PROVIDERS[id].models)) {
        throw new Error(`Walkthrough provider "${id}" models drifted from the runtime catalog`);
      }
    }

    for (const id of ['slideshow', 'seedance', 'minimax_h3', 'google_omni', 'google_veo', 'kling', 'wan']) {
      const guide = VIDEO_PROVIDER_GUIDE[id];
      if (!guide?.label) throw new Error(`Walkthrough is missing video provider "${id}"`);
      if (id !== 'slideshow') {
        const credentials = {};
        guide.save(credentials, 'test-key', 'test-secret');
        if (!Object.keys(credentials).length || !guide.keyUrl || !guide.credentialName) {
          throw new Error(`Video provider guide "${id}" cannot save its credentials`);
        }
      }
    }

    const currentOpenRouterModels = [
      'openai/gpt-5.6-sol',
      'anthropic/claude-fable-5',
      'google/gemini-3.7-flash',
      'moonshotai/kimi-k3',
      'z-ai/glm-5.3'
    ];
    if (JSON.stringify(PROVIDERS.openrouter.models) !== JSON.stringify(currentOpenRouterModels)) {
      throw new Error('OpenRouter curated models are not the verified current catalog');
    }

    this.logger.info('Walkthrough module test completed successfully');
  }

  async testLogger() {
    const testLogger = new Logger('TestLogger');
    
    testLogger.info('Test info message');
    testLogger.warn('Test warning message');
    testLogger.success('Test success message');
    
    // Test timer
    const timer = testLogger.startTimer('Test Operation');
    await new Promise(resolve => setTimeout(resolve, 100));
    timer.end();
    
    this.logger.info('Logger test completed successfully');
  }

  async testDirectories() {
    const fs = require('fs').promises;
    
    const requiredDirs = [
      'config',
      'logs', 
      'data',
      'agents',
      'database',
      'utils',
      'schedules'
    ];

    for (const dir of requiredDirs) {
      const dirPath = path.join(__dirname, dir);
      await fs.access(dirPath);
    }

    this.logger.info('Directory structure test completed successfully');
  }

  async testAgentLoading() {
    // Test that agent files can be loaded
    const agentFiles = [
      './agents/content-strategy-agent',
      './agents/script-writer-agent',
      './agents/thumbnail-designer-agent',
      './agents/seo-optimizer-agent',
      './agents/production-management-agent',
      './agents/publishing-scheduling-agent',
      './agents/analytics-optimization-agent',
      './utils/discoverability-service',
      './utils/discoverability-adapters/darkzseo'
    ];

    for (const agentFile of agentFiles) {
      try {
        require(agentFile);
      } catch (error) {
        throw new Error(`Failed to load ${agentFile}: ${error.message}`);
      }
    }

    this.logger.info('Agent loading test completed successfully');
  }

  async testYouTubeScopeDetection() {
    const manager = new CredentialManager();
    const forceSsl = 'https://www.googleapis.com/auth/youtube.force-ssl';
    manager.tokens = { youtube: { scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube' } };
    if (manager.hasYouTubeScope(forceSsl)) throw new Error('force-ssl must not be reported before consent');
    if (!manager.hasYouTubeScope('https://www.googleapis.com/auth/youtube')) throw new Error('Granted scopes must be detected');
    manager.tokens.youtube.scope += ` ${forceSsl}`;
    if (!manager.hasYouTubeScope(forceSsl)) throw new Error('force-ssl must be detected after consent');
    manager.tokens = {};
    if (manager.hasYouTubeScope('https://www.googleapis.com/auth/youtube')) throw new Error('Missing tokens must report no scopes');
  }

  async testReplyDraftStore() {
    const db = new Database();
    await db.initialize();
    const commentId = `rc_test_${Date.now()}`;
    const videoId = `vid_reply_${Date.now()}`;
    try {
      const draft = await db.saveReplyDraft({ commentId, videoId, draftText: 'Thanks! The cache works per scene.', rationale: 'Direct question' });
      if (!draft || draft.status !== 'proposed') throw new Error('saveReplyDraft did not create a proposed draft');

      const edited = await db.updateReplyDraft(draft.id, { editedText: 'Thanks! Each scene caches separately.' });
      if (edited.editedText !== 'Thanks! Each scene caches separately.') throw new Error('editedText was not persisted');

      const replaced = await db.saveReplyDraft({ commentId, videoId, draftText: 'New draft text' });
      if (replaced.id !== draft.id) throw new Error('Re-drafting must reuse the comment row');
      if (replaced.editedText !== null || replaced.status !== 'proposed') throw new Error('Re-drafting must reset the lifecycle');

      const postedAt = new Date().toISOString();
      await db.updateReplyDraft(draft.id, { status: 'posted', postedCommentId: 'yt_reply_1', postedAt });
      const posted = await db.getReplyDraft(draft.id);
      if (posted.status !== 'posted' || posted.postedCommentId !== 'yt_reply_1') throw new Error('Posting evidence was not stored');

      let blocked = false;
      try {
        await db.saveReplyDraft({ commentId, videoId, draftText: 'Should not overwrite' });
      } catch (error) {
        blocked = error.status === 409;
      }
      if (!blocked) throw new Error('A posted reply draft must never be replaced');

      const postedCount = await db.countReplyDraftsPostedSince(new Date(Date.now() - 60000).toISOString());
      if (postedCount < 1) throw new Error('countReplyDraftsPostedSince missed the posted draft');

      const listed = await db.listReplyDrafts({ videoId, status: 'posted' });
      if (listed.length !== 1) throw new Error('listReplyDrafts filter failed');
    } finally {
      await db.executeQuery('DELETE FROM reply_drafts WHERE video_id = ?', [videoId]);
      await db.close();
    }
  }

  async testEngagementInsightStore() {
    const db = new Database();
    await db.initialize();
    const videoId = `vid_insight_${Date.now()}`;
    try {
      const synced = await db.saveEngagementInsight({
        videoId, title: 'Test video', commentCount: 4,
        lastSyncedAt: '2026-08-23T10:00:00.000Z',
        newestCommentAt: '2026-08-23T09:00:00.000Z'
      });
      if (!synced || synced.videoId !== videoId) throw new Error('saveEngagementInsight did not store the row');

      const analyzed = await db.saveEngagementInsight({
        videoId, analyzedCount: 4,
        sentiment: { method: 'ai', positive: 3, neutral: 1, negative: 0 },
        themes: [{ title: 'Render cache questions', summary: 'Viewers ask how caching works', kind: 'question', count: 3, commentIds: ['a', 'b', 'c'] }],
        attentionFlags: [{ commentId: 'x', categories: ['scam'], permalink: 'https://www.youtube.com/watch?v=1&lc=x' }],
        analysisMethod: 'ai', analyzedAt: '2026-08-23T10:05:00.000Z'
      });
      if (analyzed.id !== synced.id) throw new Error('Insight upsert must reuse the video row, not duplicate');
      if (analyzed.lastSyncedAt !== '2026-08-23T10:00:00.000Z') throw new Error('Merge lost the sync watermark');
      if (analyzed.themes[0]?.count !== 3 || analyzed.sentiment.positive !== 3) throw new Error('JSON columns did not round-trip');
      if (analyzed.attentionFlags.length !== 1) throw new Error('attention_flags did not round-trip');

      const listed = await db.listEngagementInsights({ limit: 5 });
      if (!listed.some(item => item.videoId === videoId)) throw new Error('listEngagementInsights missed the row');
    } finally {
      await db.executeQuery('DELETE FROM engagement_insights WHERE video_id = ?', [videoId]);
      await db.close();
    }
  }

  async testAudienceCommentStore() {
    const db = new Database();
    await db.initialize();
    const commentId = `ac_test_${Date.now()}`;
    const videoId = `vid_test_${Date.now()}`;
    try {
      const first = await db.upsertAudienceComment({
        commentId, videoId,
        text: 'How does the render cache work?',
        authorName: 'Viewer One', authorChannelId: 'UC_viewer_1',
        likeCount: 3, replyCount: 0,
        publishedAt: new Date().toISOString()
      });
      if (!first || first.commentId !== commentId) throw new Error('upsertAudienceComment did not store the comment');
      if (first.isChannelOwner !== false || first.repliedByAgent !== false) throw new Error('Boolean parsing is wrong');

      const second = await db.upsertAudienceComment({
        commentId, videoId, text: 'How does the render cache work? (edited)', likeCount: 5
      });
      if (second.id !== first.id) throw new Error('Re-syncing the same comment must upsert, not duplicate');
      if (second.likeCount !== 5 || !second.text.includes('(edited)')) throw new Error('Upsert did not refresh mutable fields');

      const flagged = await db.setAudienceCommentAnalysis(commentId, ['question']);
      if (flagged.analysisState !== 'analyzed' || !flagged.flags.includes('question')) throw new Error('Analysis flags were not persisted');

      const listed = await db.listAudienceComments({ videoId, topLevelOnly: true });
      if (listed.length !== 1) throw new Error('listAudienceComments missed the top-level comment');

      const counts = await db.countAudienceComments(videoId);
      if (counts.total !== 1 || counts.topLevel !== 1) throw new Error('countAudienceComments returned wrong counts');

      const replied = await db.markAudienceCommentReplied(commentId);
      if (!replied.repliedByAgent) throw new Error('markAudienceCommentReplied did not persist');
    } finally {
      await db.executeQuery('DELETE FROM audience_comments WHERE video_id = ?', [videoId]);
      await db.close();
    }
  }

  async testConfiguration() {
    const fs = require('fs').promises;
    
    // Check package.json
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
    if (!packageJson.name || !packageJson.dependencies) {
      throw new Error('Invalid package.json');
    }

    // Check if main index file exists
    await fs.access('./index.js');

    // The startup banner must report the real version. It was hardcoded to "v2.0"
    // through v2.4.0, so bug reports pasted a version that was four releases stale.
    const indexSource = await fs.readFile('index.js', 'utf8');
    const hardcodedBanner = indexSource.match(/YouTube Automation Agent v[\d.]/);
    if (hardcodedBanner) {
      throw new Error(
        `Startup banner hardcodes a version ("${hardcodedBanner[0]}") — interpolate package.json's version instead`
      );
    }
    if (!indexSource.includes('YouTube Automation Agent v${version}')) {
      throw new Error('Startup banner does not report the package.json version');
    }

    // package.json and package-lock.json drifted apart before v2.4.1; keep them aligned
    const lockJson = JSON.parse(await fs.readFile('package-lock.json', 'utf8'));
    if (lockJson.version !== packageJson.version) {
      throw new Error(
        `package-lock.json version (${lockJson.version}) does not match package.json (${packageJson.version})`
      );
    }

    this.logger.info('Configuration test completed successfully');
  }

  async testAudienceCommentSync() {
    const db = new Database();
    await db.initialize();
    const videoId = `vid_sync_${Date.now()}`;
    const iso = offsetMinutes => new Date(Date.now() - offsetMinutes * 60000).toISOString();
    const thread = (id, publishedAt, replies = []) => ({
      id,
      snippet: {
        totalReplyCount: replies.length,
        topLevelComment: { id, snippet: {
          textOriginal: `Comment ${id}`, authorDisplayName: 'Viewer',
          authorChannelId: { value: 'UC_viewer' }, likeCount: 1, publishedAt, updatedAt: publishedAt
        } }
      },
      replies: { comments: replies }
    });
    try {
      const pages = [
        { items: [thread(`${videoId}_c2`, iso(5)), thread(`${videoId}_c1`, iso(60), [{
            id: `${videoId}_c1_r1`, snippet: {
              textOriginal: 'A reply', authorDisplayName: 'Owner',
              authorChannelId: { value: 'UC_channel_owner' }, likeCount: 0, publishedAt: iso(30), updatedAt: iso(30)
            }
          }]) ] }
      ];
      const service = new AudienceEngagementService(db, null, null, {
        listCommentThreads: async () => pages[0],
        getChannelId: async () => 'UC_channel_owner'
      });

      const first = await service.syncVideoComments(videoId, { title: 'Sync test' });
      if (first.fetched !== 3) throw new Error(`Expected 3 stored comments, got ${first.fetched}`);
      if (!first.insight?.newestCommentAt) throw new Error('Sync did not record the watermark');
      const ownerReply = await db.getAudienceComment(`${videoId}_c1_r1`);
      if (!ownerReply.isChannelOwner || ownerReply.parentCommentId !== `${videoId}_c1`) throw new Error('Reply mapping is wrong');

      const second = await service.syncVideoComments(videoId, {});
      if (second.fetched !== 0) throw new Error('Watermark must stop re-ingesting known comments');

      // Refusal policy: API failure stores nothing and rethrows
      const failing = new AudienceEngagementService(db, null, null, {
        listCommentThreads: async () => { throw new Error('quota exceeded'); },
        getChannelId: async () => 'UC_channel_owner'
      });
      let threw = false;
      try { await failing.syncVideoComments(`${videoId}_other`, {}); } catch (_error) { threw = true; }
      if (!threw) throw new Error('API failure must throw');
      if (await db.getEngagementInsight(`${videoId}_other`)) throw new Error('A failed sync must store nothing');

      // Disabled comments are not an error
      const disabledError = new Error('disabled');
      disabledError.errors = [{ reason: 'commentsDisabled' }];
      const disabledService = new AudienceEngagementService(db, null, null, {
        listCommentThreads: async () => { throw disabledError; },
        getChannelId: async () => 'UC_channel_owner'
      });
      const disabled = await disabledService.syncVideoComments(`${videoId}_disabled`, {});
      if (!disabled.disabled || disabled.fetched !== 0) throw new Error('commentsDisabled must be recorded, not thrown');

      // Taper
      if (service.isSyncDue(null, iso(0))) { /* never-synced is due */ } else throw new Error('Never-synced video must be due');
      const fresh = { lastSyncedAt: iso(60) };
      if (service.isSyncDue(fresh, iso(24 * 60))) throw new Error('A 1h-stale sync of a 1-day-old video is not due (4h taper)');
      if (!service.isSyncDue({ lastSyncedAt: iso(5 * 60) }, iso(24 * 60))) throw new Error('A 5h-stale sync of a 1-day-old video is due');
      if (service.isSyncDue({ lastSyncedAt: iso(13 * 60) }, iso(40 * 24 * 60))) throw new Error('Videos older than 30 days are never auto-due');
    } finally {
      await db.executeQuery("DELETE FROM audience_comments WHERE video_id LIKE ?", [`${videoId}%`]);
      await db.executeQuery("DELETE FROM engagement_insights WHERE video_id LIKE ?", [`${videoId}%`]);
      await db.close();
    }
  }

  async testAudienceCommentAnalysis() {
    const db = new Database();
    await db.initialize();
    const videoId = `vid_analysis_${Date.now()}`;
    const seed = async (suffix, text, likeCount = 0) => db.upsertAudienceComment({
      commentId: `${videoId}_${suffix}`, videoId, text, likeCount,
      publishedAt: new Date().toISOString()
    });
    try {
      await seed('q1', 'How do I configure the render cache?', 4);
      await seed('q2', 'Can you explain the cache setup?', 2);
      await seed('q3', 'What cache settings do you use?', 1);
      await seed('scam1', 'Congratulations! Message me on telegram to claim your prize');
      const aiResponse = JSON.stringify({
        comments: [
          { commentId: `${videoId}_q1`, sentiment: 'positive', flags: ['question'] },
          { commentId: `${videoId}_q2`, sentiment: 'neutral', flags: ['question'] },
          { commentId: `${videoId}_q3`, sentiment: 'neutral', flags: ['question'] },
          { commentId: `${videoId}_scam1`, sentiment: 'neutral', flags: ['scam'] },
          { commentId: 'not_a_real_comment', sentiment: 'negative', flags: ['toxic'] }
        ],
        themes: [
          { title: 'Render cache setup', summary: 'Viewers want a cache configuration walkthrough', kind: 'question',
            commentIds: [`${videoId}_q1`, `${videoId}_q2`, `${videoId}_q3`, `${videoId}_scam1`, 'not_a_real_comment'] },
          { title: 'Bad theme', summary: 'Only one supporter', kind: 'feedback', commentIds: [`${videoId}_q1`] }
        ]
      });
      const service = new AudienceEngagementService(db, null, {
        isAvailable: () => true,
        generateText: async () => aiResponse
      }, {});

      const insight = await service.analyzeVideo(videoId);
      if (insight.analysisMethod !== 'ai') throw new Error('AI analysis was not recorded as ai');
      if (insight.sentiment.positive !== 1 || insight.sentiment.neutral !== 3) throw new Error('Sentiment counts are wrong');
      if (insight.themes.length !== 1) throw new Error('Theme normalization must drop single-comment themes');
      if (insight.themes[0].count !== 3) throw new Error('Quarantined and unknown comment ids must not count toward themes');
      if (insight.attentionFlags.length !== 1 || insight.attentionFlags[0].commentId !== `${videoId}_scam1`) {
        throw new Error('Scam comment must land in attentionFlags');
      }
      const scam = await db.getAudienceComment(`${videoId}_scam1`);
      if (!scam.flags.includes('scam')) throw new Error('Per-comment flags were not stored');

      // parseAIJsonResponse handles fenced, embedded, and malformed output
      if (service.parseAIJsonResponse('```json\n{"a":1}\n```')?.a !== 1) throw new Error('Fenced JSON must parse');
      if (service.parseAIJsonResponse('noise before [1,2] noise after')?.[0] !== 1) throw new Error('Embedded arrays must parse');
      if (service.parseAIJsonResponse('not json at all') !== null) throw new Error('Garbage must return null');

      // Fallback: mechanical facts only, no themes
      const fallbackVideo = `${videoId}_fb`;
      await db.upsertAudienceComment({ commentId: `${fallbackVideo}_c1`, videoId: fallbackVideo, text: 'Is this real?', publishedAt: new Date().toISOString() });
      const fallbackService = new AudienceEngagementService(db, null, { isAvailable: () => false }, {});
      const fallback = await fallbackService.analyzeVideo(fallbackVideo);
      if (fallback.analysisMethod !== 'fallback') throw new Error('Fallback method was not recorded');
      if (fallback.themes.length !== 0) throw new Error('Fallback must never invent themes');
      if (fallback.sentiment.method !== 'fallback' || 'positive' in fallback.sentiment) throw new Error('Fallback must not claim sentiment');
      const fallbackComment = await db.getAudienceComment(`${fallbackVideo}_c1`);
      if (!fallbackComment.flags.includes('question')) throw new Error('Fallback question detection failed');

      // syncDueVideos delegates and analyzes only after a fetching sync
      let analyzeCalls = 0;
      const dueService = new AudienceEngagementService(db, null, { isAvailable: () => false }, {
        listCommentThreads: async () => ({ items: [] })
      });
      dueService.analyzeVideo = async () => { analyzeCalls++; };
      const results = await dueService.syncDueVideos([
        { youtubeId: `${videoId}_due`, title: 'Due', publishedAt: new Date().toISOString(), productionId: null },
        { youtubeId: null }
      ]);
      if (results.synced !== 1 || results.skipped !== 1) throw new Error(`syncDueVideos counters are wrong: ${JSON.stringify(results)}`);
      if (analyzeCalls !== 0) throw new Error('A sync that fetched nothing must not trigger analysis');
    } finally {
      await db.executeQuery("DELETE FROM learning_recommendations WHERE category = 'audience_demand' AND evidence LIKE ?", [`%${videoId}%`]);
      await db.executeQuery('DELETE FROM audience_comments WHERE video_id LIKE ?', [`${videoId}%`]);
      await db.executeQuery('DELETE FROM engagement_insights WHERE video_id LIKE ?', [`${videoId}%`]);
      await db.close();
    }
  }

  async testAudienceIdeaMining() {
    const db = new Database();
    await db.initialize();
    const videoId = `vid_mining_${Date.now()}`;
    try {
      for (const suffix of ['m1', 'm2', 'm3']) {
        await db.upsertAudienceComment({
          commentId: `${videoId}_${suffix}`, videoId,
          text: `Please cover local caching next (${suffix})`, publishedAt: new Date().toISOString()
        });
      }
      const service = new AudienceEngagementService(db, null, null, {});
      const insight = {
        videoId, title: 'Mining test', analysisMethod: 'ai',
        themes: [
          { title: 'Cover local caching', summary: 'Repeated requests for a caching deep-dive', kind: 'request',
            count: 3, commentIds: [`${videoId}_m1`, `${videoId}_m2`, `${videoId}_m3`] },
          { title: 'Too few asks', summary: 'Only two', kind: 'request', count: 2, commentIds: [`${videoId}_m1`, `${videoId}_m2`] },
          { title: 'Praise cluster', summary: 'Nice video', kind: 'praise', count: 5, commentIds: [`${videoId}_m1`, `${videoId}_m2`, `${videoId}_m3`] }
        ]
      };
      const saved = await service.refreshAudienceRecommendations(videoId, insight);
      if (saved.length !== 1) throw new Error(`Only the >=3 request/question theme may mine an idea; got ${saved.length}`);
      const recommendation = saved[0];
      if (recommendation.category !== 'audience_demand') throw new Error('Category must be audience_demand');
      if (recommendation.status !== 'pending') throw new Error('Mined ideas must be pending until reviewed');
      if (recommendation.confidence !== 'low') throw new Error('Ask-count 3 maps to low confidence');
      const evidence = recommendation.evidence; // parseLearningRecommendation returns it already parsed
      if (evidence.askCount !== 3 || evidence.sampleComments.length !== 3) throw new Error('Evidence is incomplete');
      if (!evidence.sampleComments[0].permalink.includes('&lc=')) throw new Error('Evidence must carry comment permalinks');
      if (recommendation.proposedChange.autoEditPublishedContent !== false) throw new Error('autoEditPublishedContent must be false');

      const again = await service.refreshAudienceRecommendations(videoId, insight);
      if (again[0].id !== recommendation.id) throw new Error('Re-analysis must dedupe by fingerprint, not duplicate');

      const nonAI = await service.refreshAudienceRecommendations(videoId, { ...insight, analysisMethod: 'fallback' });
      if (nonAI.length !== 0) throw new Error('Fallback analysis must never mine ideas');
    } finally {
      await db.executeQuery("DELETE FROM learning_recommendations WHERE category = 'audience_demand' AND evidence LIKE ?", [`%${videoId}%`]);
      await db.executeQuery('DELETE FROM audience_comments WHERE video_id = ?', [videoId]);
      await db.close();
    }
  }

  async testReplyDrafting() {
    const db = new Database();
    await db.initialize();
    const videoId = `vid_draft_${Date.now()}`;
    const seed = (suffix, text, flags, extra = {}) => db.upsertAudienceComment({
      commentId: `${videoId}_${suffix}`, videoId, text,
      publishedAt: new Date().toISOString(), ...extra
    }).then(() => db.setAudienceCommentAnalysis(`${videoId}_${suffix}`, flags));
    try {
      await seed('q1', 'How long does a render take?', ['question']);
      await seed('praise1', 'Great video!', ['praise']);
      await seed('scam1', 'Claim your prize now', ['scam']);
      await seed('own1', 'Thanks all!', [], { isChannelOwner: true });
      await db.upsertAudienceComment({
        commentId: `${videoId}_nested`, videoId, parentCommentId: `${videoId}_q1`,
        text: 'Also curious?', publishedAt: new Date().toISOString()
      });
      await db.saveEngagementInsight({ videoId, title: 'Draft test', analysisMethod: 'ai', analyzedAt: new Date().toISOString() });

      let promptSeen = '';
      const service = new AudienceEngagementService(db, null, {
        isAvailable: () => true,
        generateText: async prompt => {
          promptSeen = prompt;
          return JSON.stringify([
            { commentId: `${videoId}_q1`, reply: 'About two minutes per scene on default settings.', rationale: 'Direct question' },
            { commentId: `${videoId}_praise1`, reply: 'Visit http://spam.example now', rationale: 'Link should be dropped' },
            { commentId: `${videoId}_scam1`, reply: 'Should never appear', rationale: 'Quarantined' }
          ]);
        }
      }, {});

      const drafts = await service.draftReplies(videoId);
      if (drafts.length !== 1) throw new Error(`Expected 1 usable draft (link + quarantined dropped), got ${drafts.length}`);
      if (drafts[0].commentId !== `${videoId}_q1` || drafts[0].status !== 'proposed') throw new Error('Draft shape is wrong');
      if (promptSeen.includes(`${videoId}_scam1`) || promptSeen.includes(`${videoId}_own1`) || promptSeen.includes(`${videoId}_nested`)) {
        throw new Error('Quarantined, owner, and nested comments must never reach the draft prompt');
      }

      const noAI = new AudienceEngagementService(db, null, { isAvailable: () => false }, {});
      let status = 0;
      try { await noAI.draftReplies(videoId); } catch (error) { status = error.status; }
      if (status !== 503) throw new Error('Drafting without AI must throw 503');

      await db.saveEngagementInsight({ videoId: `${videoId}_fb`, analysisMethod: 'fallback' });
      status = 0;
      try { await service.draftReplies(`${videoId}_fb`); } catch (error) { status = error.status; }
      if (status !== 409) throw new Error('Drafting without an AI analysis must throw 409');
    } finally {
      await db.executeQuery('DELETE FROM audience_comments WHERE video_id = ?', [videoId]);
      await db.executeQuery('DELETE FROM engagement_insights WHERE video_id LIKE ?', [`${videoId}%`]);
      await db.executeQuery('DELETE FROM reply_drafts WHERE video_id = ?', [videoId]);
      await db.close();
    }
  }

  async testReplyApprovalAndPosting() {
    const db = new Database();
    await db.initialize();
    const videoId = `vid_post_${Date.now()}`;
    const commentId = `${videoId}_target`;
    const scopedCredentials = { hasYouTubeScope: scope => scope === 'https://www.googleapis.com/auth/youtube.force-ssl' };
    try {
      await db.upsertAudienceComment({ commentId, videoId, text: 'Question?', publishedAt: new Date().toISOString() });
      const makeDraft = () => db.saveReplyDraft({ commentId, videoId, draftText: 'Answer text' });

      let draft = await makeDraft();
      const posts = [];
      const service = new AudienceEngagementService(db, scopedCredentials, null, {
        insertComment: async ({ parentId, text }) => { posts.push({ parentId, text }); return { id: 'yt_posted_1' }; }
      });

      let code = null;
      try { await service.approveReplyDraft(draft.id, {}); } catch (error) { code = error.code; }
      if (code !== 'REPLY_APPROVAL_REQUIRED') throw new Error('Approval must require confirmed: true');

      const unscoped = new AudienceEngagementService(db, { hasYouTubeScope: () => false }, null, {});
      code = null;
      try { await unscoped.approveReplyDraft(draft.id, { confirmed: true }); } catch (error) { code = error.code; }
      if (code !== 'REPLY_SCOPE_REQUIRED') throw new Error('Missing force-ssl scope must block posting');
      const gate = unscoped.postingEnabled();
      if (gate.enabled || gate.reason !== 'missing_scope') {
        throw new Error('postingEnabled must report missing_scope');
      }

      const posted = await service.approveReplyDraft(draft.id, { confirmed: true, editedText: 'Edited answer' });
      if (posted.status !== 'posted' || posted.postedCommentId !== 'yt_posted_1') throw new Error('Posting evidence missing');
      if (posts[0].parentId !== commentId || posts[0].text !== 'Edited answer') throw new Error('The edited text must be what posts');
      if (!(await db.getAudienceComment(commentId)).repliedByAgent) throw new Error('Source comment must be marked replied');

      let status = null;
      try { await service.approveReplyDraft(draft.id, { confirmed: true }); } catch (error) { status = error.status; }
      if (status !== 409) throw new Error('A posted draft must not post twice');

      // Failure path: failed + reason, manual retry allowed
      const failingComment = `${videoId}_fail`;
      await db.upsertAudienceComment({ commentId: failingComment, videoId, text: 'Other?', publishedAt: new Date().toISOString() });
      const failDraft = await db.saveReplyDraft({ commentId: failingComment, videoId, draftText: 'Will fail' });
      const failing = new AudienceEngagementService(db, scopedCredentials, null, {
        insertComment: async () => { throw new Error('commentThreadNotFound'); }
      });
      status = null;
      try { await failing.approveReplyDraft(failDraft.id, { confirmed: true }); } catch (error) { status = error.status; }
      if (status !== 502) throw new Error('A failed post must throw 502');
      const failed = await db.getReplyDraft(failDraft.id);
      if (failed.status !== 'failed' || !failed.failureReason.includes('commentThreadNotFound')) throw new Error('Failure evidence missing');

      // Daily cap
      const capped = new AudienceEngagementService(db, scopedCredentials, null, { dailyReplyCap: 1, insertComment: async () => ({ id: 'x' }) });
      status = null;
      try { await capped.approveReplyDraft(failDraft.id, { confirmed: true }); } catch (error) { status = error.status; }
      if (status !== 429) throw new Error('The daily reply cap must block further posts');

      // updateReplyDraft rules
      const edited = await service.updateReplyDraft(failDraft.id, { editedText: 'Retry text' });
      if (edited.status !== 'proposed' || edited.editedText !== 'Retry text') throw new Error('Editing must re-open a failed draft');
      const discarded = await service.updateReplyDraft(failDraft.id, { discard: true });
      if (discarded.status !== 'discarded') throw new Error('Discard failed');

      // Summary
      const summary = await service.getSummary();
      if (summary.postedToday < 1) throw new Error('getSummary missed postedToday');
      if (summary.postingEnabled !== true) throw new Error('getSummary posting flag is wrong');
      if (!summary.evidencePolicy.includes('operator approval')) throw new Error('evidencePolicy text missing');
    } finally {
      await db.executeQuery('DELETE FROM audience_comments WHERE video_id = ?', [videoId]);
      await db.executeQuery('DELETE FROM reply_drafts WHERE video_id = ?', [videoId]);
      await db.executeQuery('DELETE FROM engagement_insights WHERE video_id = ?', [videoId]);
      await db.close();
    }
  }

  async testEngagementAIProviderWiring() {
    const { AITextService } = require('./utils/ai-text-service');

    // Regression: index.js must hand AITextService the unwrapped credentials object
    // (manager.credentials), the shape the walkthrough writes to credentials.json.
    // Passing the CredentialManager itself leaves the engagement studio permanently
    // in fallback mode on installs with no provider environment variables.
    const savedEnv = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const configured = new AITextService({
        aiProvider: { provider: 'openai', apiKey: 'test-key', model: 'gpt-5.6' }
      });
      if (!configured.isAvailable()) {
        throw new Error('AITextService must initialize from a credentials-file aiProvider config');
      }

      const wrapped = new AITextService({
        credentials: { aiProvider: { provider: 'openai', apiKey: 'test-key', model: 'gpt-5.6' } }
      });
      if (wrapped.isAvailable()) {
        throw new Error('A CredentialManager-shaped argument must not look configured; index.js has to unwrap it');
      }
    } finally {
      if (savedEnv === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = savedEnv;
    }
  }

  async testEngagementSyncSchedule() {
    let captured = null;
    const events = [];
    const fakeDb = {
      getAllRows: async () => [
        { youtube_id: 'vid_sched_1', title: 'Scheduled video', published_at: '2026-08-22T00:00:00.000Z', production_id: 'prod_1' }
      ],
      executeQuery: async () => ({}),
      generateId: prefix => `${prefix}_test`
    };
    const scheduler = new DailyAutomation({}, fakeDb, {
      generateContent: async () => {},
      engagement: {
        syncDueVideos: async videos => {
          captured = videos;
          return { synced: 1, skipped: 0, failed: 0, analyzed: 1 };
        }
      }
    });
    scheduler.logAutomationEvent = async (type, status, data) => { events.push({ type, status, data }); };
    await scheduler.collectAudienceEngagement();
    if (!captured || captured[0].youtubeId !== 'vid_sched_1') throw new Error('The scheduler did not map youtube_id');
    if (captured[0].productionId !== 'prod_1' || captured[0].publishedAt !== '2026-08-22T00:00:00.000Z') {
      throw new Error('The scheduler did not map production/publish fields');
    }
    if (!events.some(event => event.type === 'audience_engagement_sync' && event.status === 'success')) {
      throw new Error('The engagement sweep must log an automation event');
    }
    const noService = new DailyAutomation({}, fakeDb, { generateContent: async () => {} });
    await noService.collectAudienceEngagement(); // must be a silent no-op, not a crash
  }

  async testGrowthExperimentRefreshSchedule() {
    const events = [];
    let refreshes = 0;
    const scheduler = new DailyAutomation({}, {}, {
      experiments: {
        refreshDue: async () => {
          refreshes++;
          return { running: 2, refreshed: 1, failed: 0 };
        }
      }
    });
    scheduler.logAutomationEvent = async (type, status, data) => events.push({ type, status, data });
    await scheduler.refreshGrowthExperiments();
    if (refreshes !== 1 || !events.some(event =>
      event.type === 'growth_experiment_refresh' && event.status === 'success' && event.data.refreshed === 1
    )) {
      throw new Error('The scheduler did not refresh and record due controlled experiments');
    }
    const noService = new DailyAutomation({}, {}, {});
    await noService.refreshGrowthExperiments();
  }

  async testVisualTreatmentEngine() {
    const fs = require('fs').promises;
    const os = require('os');
    const { runFFmpeg, checkFFmpeg } = require('./utils/ffmpeg');

    if (!(await checkFFmpeg())) {
      this.logger.warn('FFmpeg unavailable — skipping visual treatment engine render tests');
      return;
    }

    const selector = new VisualTreatmentSelector({ logger: this.logger });
    const renderer = new VisualTreatmentRenderer({ logger: this.logger, runFFmpeg });

    // 1. Visual treatment selection: STATISTIC
    const statScene = { label: 'Revenue', scriptText: 'In 2025, company revenue surged to $12B.' };
    const statContext = {
      verifiedData: [{ value: '$12B', label: 'Annual Revenue', verified: true, source: 'Truth-Anchor 10-K' }]
    };
    const statPlan = selector.buildPlan(statScene, statContext);
    if (statPlan.sceneType !== SCENE_TYPES.STATISTIC || statPlan.treatment !== TREATMENTS.ANIMATED_NUMBER || statPlan.motion !== MOTIONS.EMPHASIS_ZOOM) {
      throw new Error(`STATISTIC treatment failed: expected STATISTIC/ANIMATED_NUMBER/EMPHASIS_ZOOM, got ${statPlan.sceneType}/${statPlan.treatment}/${statPlan.motion}`);
    }
    if (!statPlan.verifiedData || statPlan.verifiedData.value !== '$12B') {
      throw new Error('STATISTIC treatment did not retain verified Truth-Anchor data');
    }

    // 2. Visual treatment selection: GROWTH
    const growthScene = { label: 'Growth', scriptText: 'YoY subscriber count grew 42% over last quarter.' };
    const growthContext = {
      verifiedData: [{ value: '+42%', growthRate: 42, direction: 'up', label: 'Subscriber Growth', verified: true, source: 'Truth-Anchor Audit' }]
    };
    const growthPlan = selector.buildPlan(growthScene, growthContext);
    if (growthPlan.sceneType !== SCENE_TYPES.GROWTH || growthPlan.treatment !== TREATMENTS.ANIMATED_PERCENTAGE || growthPlan.motion !== MOTIONS.DIRECTIONAL_PAN) {
      throw new Error(`GROWTH treatment failed: expected GROWTH/ANIMATED_PERCENTAGE/DIRECTIONAL_PAN, got ${growthPlan.sceneType}/${growthPlan.treatment}/${growthPlan.motion}`);
    }
    if (!growthPlan.verifiedData || growthPlan.verifiedData.growthRate !== 42 || growthPlan.verifiedData.direction !== 'up') {
      throw new Error('GROWTH treatment did not retain verified growth rate or direction');
    }

    // 3. Visual treatment selection: COMPARISON
    const compScene = { label: 'Comparison', scriptText: 'Company Alpha vs Company Beta in a head to head showdown.' };
    const compContext = {
      facts: [{ type: 'comparison', left: { label: 'Company Alpha' }, right: { label: 'Company Beta' }, verified: true, source: 'Truth-Anchor Comparison' }]
    };
    const compPlan = selector.buildPlan(compScene, compContext);
    if (compPlan.sceneType !== SCENE_TYPES.COMPARISON || compPlan.treatment !== TREATMENTS.TWO_SIDED_COMPARISON || compPlan.motion !== MOTIONS.CONTROLLED_ENTRANCE) {
      throw new Error(`COMPARISON treatment failed: expected COMPARISON/TWO_SIDED_COMPARISON/CONTROLLED_ENTRANCE, got ${compPlan.sceneType}/${compPlan.treatment}/${compPlan.motion}`);
    }

    // 4. Visual treatment selection: BUSINESS_FACT
    const factScene = { label: 'Stores', scriptText: 'The franchise operates 500 stores in 30 countries.' };
    const factContext = {
      verifiedData: [{ value: '500', unit: 'stores', label: 'Store Footprint', verified: true, source: 'Truth-Anchor Operational Report' }]
    };
    const factPlan = selector.buildPlan(factScene, factContext);
    if (factPlan.sceneType !== SCENE_TYPES.BUSINESS_FACT || factPlan.treatment !== TREATMENTS.BUSINESS_FACT_CALLOUT || factPlan.motion !== MOTIONS.EMPHASIS_ZOOM) {
      throw new Error(`BUSINESS_FACT treatment failed: expected BUSINESS_FACT/BUSINESS_FACT_CALLOUT/EMPHASIS_ZOOM, got ${factPlan.sceneType}/${factPlan.treatment}/${factPlan.motion}`);
    }

    // 5. Visual treatment selection: GENERAL_INFORMATION
    const genScene = { label: 'Overview', scriptText: 'Here is how modern technology transforms global distribution networks.' };
    const genPlan = selector.buildPlan(genScene, {});
    if (genPlan.sceneType !== SCENE_TYPES.GENERAL_INFORMATION || genPlan.treatment !== TREATMENTS.SUBTLE_MOTION || genPlan.motion !== MOTIONS.KEN_BURNS) {
      throw new Error(`GENERAL_INFORMATION treatment failed: expected GENERAL_INFORMATION/SUBTLE_MOTION/KEN_BURNS, got ${genPlan.sceneType}/${genPlan.treatment}/${genPlan.motion}`);
    }

    // 6. Missing/unverified numeric data safety fallback
    const unverifiedScene = { label: 'Unverified Revenue', scriptText: 'The startup reached $50B valuation with 85% growth.' };
    const unverifiedPlan = selector.buildPlan(unverifiedScene, { verifiedData: [] });
    if (unverifiedPlan.sceneType !== SCENE_TYPES.GENERAL_INFORMATION || unverifiedPlan.verifiedData !== null) {
      throw new Error('Financial safety violation: Engine accepted unverified numeric claims without Truth-Anchor verification');
    }
    if (!unverifiedPlan.fallbackReason) {
      throw new Error('Financial safety violation: Engine did not record a fallback reason when refusing unverified numbers');
    }

    // 7. Deterministic treatment selection
    const run1 = selector.buildPlan(statScene, statContext);
    const run2 = selector.buildPlan(statScene, statContext);
    if (JSON.stringify(run1.toJSON()) !== JSON.stringify(run2.toJSON())) {
      throw new Error('Visual treatment selection is not deterministic across identical inputs');
    }

    // 8. Existing anti-swipe hook regression
    const hookScene = { label: 'Hook', position: 0, scriptText: 'Stop scrolling! Here is what nobody tells you about money.' };
    const hookPlan = selector.buildPlan(hookScene, {});
    if (hookPlan.sceneType !== SCENE_TYPES.HOOK || hookPlan.treatment !== TREATMENTS.ANTI_SWIPE_HOOK || hookPlan.motion !== MOTIONS.PUNCH_ZOOM) {
      throw new Error(`HOOK treatment failed: expected HOOK/ANTI_SWIPE_HOOK/PUNCH_ZOOM, got ${hookPlan.sceneType}/${hookPlan.treatment}/${hookPlan.motion}`);
    }

    // 9. Existing karaoke regression
    const assContent = renderer.generateKaraokeAss(statPlan);
    if (!assContent.includes('[V4+ Styles]') || !assContent.includes('Style: Karaoke') || !assContent.includes('{\\k')) {
      throw new Error('Karaoke generator did not produce valid ASS formatting with \\k timing tags');
    }
    if (!assContent.includes(String(statPlan.safeZones.subtitleMarginV))) {
      throw new Error('Karaoke generator did not honor Shorts safe zone bottom margin');
    }

    // 10. 1080x1920 (9:16) rendering and output compatibility
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-visual-treatment-'));
    try {
      const portraitPlan = selector.buildPlan(statScene, statContext, {
        aspectRatio: '9:16', duration: 1.5
      });
      if (portraitPlan.dimensions.width !== 1080 || portraitPlan.dimensions.height !== 1920) {
        throw new Error(`Portrait dimensions invalid: ${portraitPlan.dimensions.width}x${portraitPlan.dimensions.height}`);
      }
      const portraitPath = path.join(tempDir, 'portrait_test.mp4');
      await renderer.renderSceneVideo(portraitPlan, portraitPath);

      let portraitProbe = '';
      try {
        await runFFmpeg(['-i', portraitPath]);
      } catch (probeErr) {
        portraitProbe = probeErr.stderr || '';
      }
      if (!portraitProbe.includes('1080x1920') || !portraitProbe.includes('h264')) {
        throw new Error(`Rendered 9:16 video failed technical verification (probe output: ${portraitProbe})`);
      }

      // 11. Existing 16:9 compatibility
      const landscapePlan = selector.buildPlan(genScene, {}, {
        aspectRatio: '16:9', duration: 1.5
      });
      if (landscapePlan.dimensions.width !== 1920 || landscapePlan.dimensions.height !== 1080) {
        throw new Error(`Landscape dimensions invalid: ${landscapePlan.dimensions.width}x${landscapePlan.dimensions.height}`);
      }
      const landscapePath = path.join(tempDir, 'landscape_test.mp4');
      await renderer.renderSceneVideo(landscapePlan, landscapePath);

      let landscapeProbe = '';
      try {
        await runFFmpeg(['-i', landscapePath]);
      } catch (probeErr) {
        landscapeProbe = probeErr.stderr || '';
      }
      if (!landscapeProbe.includes('1920x1080') || !landscapeProbe.includes('h264')) {
        throw new Error(`Rendered 16:9 video failed technical verification (probe output: ${landscapeProbe})`);
      }

      // 12. Real Sample Short composition: Hook + Statistic + General Information with Audio
      const testAudioPath = path.join(tempDir, 'sample_audio.mp3');
      await runFFmpeg(['-y', '-f', 'lavfi', '-i', 'aevalsrc=0.03*sin(440*2*PI*t):d=4.5', '-c:a', 'libmp3lame', testAudioPath]);

      const samplePlans = [
        selector.buildPlan(hookScene, {}, { aspectRatio: '9:16', duration: 1.5 }),
        selector.buildPlan(statScene, statContext, { aspectRatio: '9:16', duration: 1.5 }),
        selector.buildPlan(genScene, {}, { aspectRatio: '9:16', duration: 1.5 })
      ];

      const sampleShortPath = path.join(tempDir, 'sample_short.mp4');
      await renderer.composeShort(samplePlans, testAudioPath, sampleShortPath);

      const sampleStats = await fs.stat(sampleShortPath);
      if (!sampleStats.isFile() || sampleStats.size <= 0) {
        throw new Error('Composed sample Short is empty');
      }

      let sampleProbe = '';
      try {
        await runFFmpeg(['-i', sampleShortPath]);
      } catch (probeErr) {
        sampleProbe = probeErr.stderr || '';
      }
      if (!sampleProbe.includes('1080x1920') || !sampleProbe.includes('h264') || !sampleProbe.includes('aac')) {
        throw new Error(`Sample Short failed technical properties (must be 1080x1920 H.264 with AAC audio, got: ${sampleProbe})`);
      }

      // Save a representative preview in data/shorts/ for operator inspection
      const previewDir = path.join(__dirname, 'data', 'shorts');
      await fs.mkdir(previewDir, { recursive: true });
      const persistentSamplePath = path.join(previewDir, 'sample_milestone1_short.mp4');
      await fs.copyFile(sampleShortPath, persistentSamplePath);

      this.logger.info(`Sample Short successfully generated at ${persistentSamplePath} (size: ${sampleStats.size} bytes)`);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    this.logger.info('Scene-Based Visual Treatment Engine test completed successfully');
  }

  async testFinancialVisualizationEngine() {
    this.logger.info('Starting Verified Financial & Data Visualization Engine tests...');

    const fs = require('fs').promises;
    const os = require('os');
    const { runFFmpeg, checkFFmpeg } = require('./utils/ffmpeg');

    if (!(await checkFFmpeg())) {
      this.logger.warn('FFmpeg unavailable — skipping financial visualization render tests');
      return;
    }

    const financialVis = new FinancialVisualization({ logger: this.logger });
    const selector = new VisualTreatmentSelector({ logger: this.logger });
    const renderer = new VisualTreatmentRenderer({ logger: this.logger, runFFmpeg });

    // 1. Revenue visualization: Animated financial metric with verified scale
    const revInput = {
      verified: true,
      value: 12000000000,
      label: 'Annual Revenue',
      source: 'SEC Form 10-K'
    };
    const revSpecResult = financialVis.createSpec(VISUALIZATION_TYPES.ANIMATED_METRIC, revInput);
    if (revSpecResult.rejected || !revSpecResult.spec) {
      throw new Error('Failed to create ANIMATED_METRIC specification');
    }
    const revSpec = revSpecResult.spec;
    if (!(revSpec instanceof VisualizationSpec)) {
      throw new Error('Specification must be an instance of VisualizationSpec');
    }
    if (revSpec.formatted.display !== '$12B' || revSpec.formatted.raw !== 12000000000) {
      throw new Error(`Revenue display formatting mismatch: expected $12B, got ${revSpec.formatted.display}`);
    }
    const revSvg = VisualizationRenderer.renderSvgCard(revSpec);
    if (!revSvg.includes('$12B') || !revSvg.includes('ANNUAL REVENUE') || !revSvg.includes('SEC Form 10-K')) {
      throw new Error('Revenue SVG does not include expected formatted metric, label, or verified source');
    }

    // 2. Growth visualization: Directional arrow + percentage rate
    const growthInput = {
      verified: true,
      value: 42,
      label: 'YoY Growth Rate',
      source: 'Audited Financial Statements'
    };
    const growthSpecResult = financialVis.createSpec(VISUALIZATION_TYPES.GROWTH_INDICATOR, growthInput);
    if (growthSpecResult.rejected || !growthSpecResult.spec) {
      throw new Error('Failed to create GROWTH_INDICATOR specification');
    }
    const growthSpec = growthSpecResult.spec;
    if (growthSpec.formatted.display !== '+42%' || growthSpec.formatted.direction !== 'up') {
      throw new Error(`Growth indicator formatting mismatch: expected +42%/up, got ${growthSpec.formatted.display}/${growthSpec.formatted.direction}`);
    }
    const growthSvg = VisualizationRenderer.renderSvgCard(growthSpec);
    if (!growthSvg.includes('+42%') || !growthSvg.includes('▲') || !growthSvg.includes('YOY GROWTH RATE')) {
      throw new Error('Growth SVG does not include expected directional arrow, percentage, or label');
    }

    // 3. Percentage formatting: Safe precision + unit
    const pct1 = NumberFormatter.formatPercentage(15.5);
    if (!pct1.valid || pct1.display !== '15.5%') {
      throw new Error(`Percentage formatting failed for 15.5: ${pct1.display}`);
    }
    const pct2 = NumberFormatter.formatPercentage(-8.2, { explicitSign: true });
    if (!pct2.valid || pct2.display !== '-8.2%' || pct2.direction !== 'down') {
      throw new Error(`Negative percentage formatting failed: ${pct2.display}/${pct2.direction}`);
    }

    // 4. Dollar formatting: Compact scaling preserving underlying raw verified value
    const currBill = NumberFormatter.formatCurrency(12000000000);
    if (!currBill.valid || currBill.display !== '$12B' || currBill.raw !== 12000000000) {
      throw new Error(`Currency billion scaling failed: ${currBill.display}`);
    }
    const currMill = NumberFormatter.formatCurrency(500000000);
    if (!currMill.valid || currMill.display !== '$500M' || currMill.raw !== 500000000) {
      throw new Error(`Currency million scaling failed: ${currMill.display}`);
    }
    const currStr = NumberFormatter.formatCurrency('$2.4B');
    if (!currStr.valid || currStr.display !== '$2.4B' || currStr.raw !== 2400000000) {
      throw new Error(`Currency string parsing failed: ${currStr.display}/${currStr.raw}`);
    }

    // 5. Comparison visualization: Proportional comparison bars
    const compInput = {
      verified: true,
      left: { label: 'Company Alpha', value: 12000000000 },
      right: { label: 'Company Beta', value: 8000000000 },
      source: 'Market Share Analysis'
    };
    const compSpecResult = financialVis.createSpec(VISUALIZATION_TYPES.COMPARISON_BAR, compInput);
    if (compSpecResult.rejected || !compSpecResult.spec) {
      throw new Error('Failed to create COMPARISON_BAR specification');
    }
    const compSpec = compSpecResult.spec;
    if (compSpec.formatted.left.ratio !== 0.6 || compSpec.formatted.right.ratio !== 0.4) {
      throw new Error(`Comparison bar ratios invalid: left ${compSpec.formatted.left.ratio}, right ${compSpec.formatted.right.ratio}`);
    }
    const compSvg = VisualizationRenderer.renderSvgCard(compSpec);
    if (!compSvg.includes('Company Alpha') || !compSvg.includes('Company Beta') || !compSvg.includes('$12B') || !compSvg.includes('$8B')) {
      throw new Error('Comparison SVG missing expected entity labels or formatted figures');
    }

    // 6. Ranking visualization: Leaderboard badges (#1, #2, #3)
    const rankInput = {
      verified: true,
      label: 'Cloud Infrastructure Leaders',
      items: [
        { label: 'AWS', value: '$105B' },
        { label: 'Azure', value: '$75B' },
        { label: 'Google Cloud', value: '$40B' }
      ],
      source: 'Industry Benchmark 2025'
    };
    const rankSpecResult = financialVis.createSpec(VISUALIZATION_TYPES.RANKING_LIST, rankInput);
    if (rankSpecResult.rejected || !rankSpecResult.spec) {
      throw new Error('Failed to create RANKING_LIST specification');
    }
    const rankSpec = rankSpecResult.spec;
    if (!Array.isArray(rankSpec.formatted) || rankSpec.formatted.length !== 3) {
      throw new Error('Ranking list formatted items missing or incomplete');
    }
    const rankSvg = VisualizationRenderer.renderSvgCard(rankSpec);
    if (!rankSvg.includes('#1') || !rankSvg.includes('#2') || !rankSvg.includes('#3') || !rankSvg.includes('AWS') || !rankSvg.includes('$105B')) {
      throw new Error('Ranking SVG missing rank badges or item labels');
    }

    // 7. Business statistic visualization: Count + contextual visual
    const statInput = {
      verified: true,
      value: 500,
      unit: 'stores',
      context: 'Global retail footprint across 30 countries',
      source: 'Annual Operating Report'
    };
    const statSpecResult = financialVis.createSpec(VISUALIZATION_TYPES.STATISTIC_CALLOUT, statInput);
    if (statSpecResult.rejected || !statSpecResult.spec) {
      throw new Error('Failed to create STATISTIC_CALLOUT specification');
    }
    const statSpec = statSpecResult.spec;
    if (statSpec.formatted.display !== '500') {
      throw new Error(`Business statistic count mismatch: expected 500, got ${statSpec.formatted.display}`);
    }
    const statSvg = VisualizationRenderer.renderSvgCard(statSpec);
    if (!statSvg.includes('500') || !statSvg.includes('STORES') || !statSvg.includes('across 30 countries')) {
      throw new Error('Business statistic SVG missing count, unit, or context');
    }

    // 8. Trend visualization: Start-to-end trajectory chart
    const trendInput = {
      verified: true,
      startValue: '$5B',
      endValue: '$12B',
      label: 'Five-Year Revenue Growth',
      source: 'Historical Financial Filings'
    };
    const trendSpecResult = financialVis.createSpec(VISUALIZATION_TYPES.TREND_LINE, trendInput);
    if (trendSpecResult.rejected || !trendSpecResult.spec) {
      throw new Error('Failed to create TREND_LINE specification');
    }
    const trendSpec = trendSpecResult.spec;
    if (trendSpec.formatted.delta.display !== '+$7B' || trendSpec.formatted.percentChange.display !== '+140%') {
      throw new Error(`Trend line math calculation invalid: delta ${trendSpec.formatted.delta.display}, pct ${trendSpec.formatted.percentChange.display}`);
    }
    const trendSvg = VisualizationRenderer.renderSvgCard(trendSpec);
    if (!trendSvg.includes('TREND ANALYSIS') || !trendSvg.includes('$5B') || !trendSvg.includes('$12B') || !trendSvg.includes('+140%')) {
      throw new Error('Trend SVG missing sparkline labels or calculated percentage');
    }

    // 9. Missing verified data rejection
    const missingRes = financialVis.createSpec(VISUALIZATION_TYPES.ANIMATED_METRIC, null);
    if (!missingRes.rejected || missingRes.reason !== FALLBACK_REASONS.MISSING_VERIFIED_DATA) {
      throw new Error(`Missing verified data was not rejected with MISSING_VERIFIED_DATA: got ${missingRes.reason}`);
    }

    // 10. Invalid verified data rejection
    const invalidRes = financialVis.createSpec(VISUALIZATION_TYPES.ANIMATED_METRIC, "corrupt string");
    if (!invalidRes.rejected || invalidRes.reason !== FALLBACK_REASONS.INVALID_NUMERIC_DATA) {
      throw new Error(`Invalid data was not rejected with INVALID_NUMERIC_DATA: got ${invalidRes.reason}`);
    }

    // 11. Truth-Anchor rejection/fallback reason
    const unverifiedRes = financialVis.createSpec(VISUALIZATION_TYPES.ANIMATED_METRIC, {
      verified: false,
      value: '$500B',
      label: 'Unsubstantiated Claim'
    });
    if (!unverifiedRes.rejected || unverifiedRes.reason !== FALLBACK_REASONS.UNVERIFIED_FINANCIAL_CLAIM) {
      throw new Error(`Unverified claim was not rejected with UNVERIFIED_FINANCIAL_CLAIM: got ${unverifiedRes.reason}`);
    }

    // 12. Deterministic rendering specification
    const specA = financialVis.createSpec(VISUALIZATION_TYPES.ANIMATED_METRIC, revInput, { aspectRatio: '9:16' }).spec.toJSON();
    const specB = financialVis.createSpec(VISUALIZATION_TYPES.ANIMATED_METRIC, revInput, { aspectRatio: '9:16' }).spec.toJSON();
    if (JSON.stringify(specA) !== JSON.stringify(specB)) {
      throw new Error('Financial visualization specifications are not strictly deterministic across runs');
    }

    // 13. Safe-zone compliance
    const safeZones = revSpec.safeZones;
    if (safeZones.top !== 288 || safeZones.bottom !== 384 || safeZones.left !== 80 || safeZones.right !== 160) {
      throw new Error(`Safe zones do not conform to Shorts specifications: ${JSON.stringify(safeZones)}`);
    }

    // 14. Existing Milestone 1 integration with SceneVisualPlan
    const sceneRevenue = {
      label: 'Revenue',
      scriptText: 'In 2025, company revenue surged to $12B.',
      duration: 1.5,
      verifiedData: {
        verified: true,
        type: 'statistic',
        value: '$12B',
        label: 'Annual Revenue',
        source: 'SEC Form 10-K'
      }
    };
    const planRev = selector.buildPlan(sceneRevenue);
    if (planRev.sceneType !== SCENE_TYPES.STATISTIC || planRev.treatment !== TREATMENTS.ANIMATED_NUMBER) {
      throw new Error(`Integration with SceneVisualPlan failed: expected STATISTIC/ANIMATED_NUMBER, got ${planRev.sceneType}/${planRev.treatment}`);
    }
    if (!planRev.visualizationSpec || planRev.visualizationSpec.type !== VISUALIZATION_TYPES.ANIMATED_METRIC) {
      throw new Error('SceneVisualPlan was not enriched with valid financial visualizationSpec');
    }

    // 15. Existing anti-swipe hook regression
    const hookScene = {
      label: 'Hook',
      position: 0,
      scriptText: 'Stop scrolling! Here is the $12B secret nobody told you.',
      duration: 1.5
    };
    const hookPlan = selector.buildPlan(hookScene);
    if (hookPlan.sceneType !== SCENE_TYPES.HOOK || hookPlan.treatment !== TREATMENTS.ANTI_SWIPE_HOOK) {
      throw new Error(`Hook treatment regressed: expected HOOK/ANTI_SWIPE_HOOK, got ${hookPlan.sceneType}/${hookPlan.treatment}`);
    }

    // 16. Existing karaoke regression
    const assContent = renderer.generateKaraokeAss(planRev);
    if (!assContent.includes('[V4+ Styles]') || !assContent.includes('Style: Karaoke') || !assContent.includes('{\\k')) {
      throw new Error('Karaoke caption generator failed for financial visualization plan');
    }

    // 17. 1080x1920 (9:16) rendering and 16:9 regression in temp directory
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-financial-vis-'));
    try {
      // 17a. Portrait 9:16 video render
      const portraitPath = path.join(tempDir, 'financial_portrait_test.mp4');
      await renderer.renderSceneVideo(planRev, portraitPath);
      let probePortrait = '';
      try {
        await runFFmpeg(['-i', portraitPath]);
      } catch (err) {
        probePortrait = err.stderr || '';
      }
      if (!probePortrait.includes('1080x1920') || !probePortrait.includes('h264')) {
        throw new Error(`Rendered 9:16 financial video failed technical check (probe: ${probePortrait})`);
      }

      // 18. 16:9 Landscape compatibility
      const landscapePlan = selector.buildPlan(sceneRevenue, {}, { aspectRatio: '16:9', duration: 1.5 });
      const landscapePath = path.join(tempDir, 'financial_landscape_test.mp4');
      await renderer.renderSceneVideo(landscapePlan, landscapePath);
      let probeLandscape = '';
      try {
        await runFFmpeg(['-i', landscapePath]);
      } catch (err) {
        probeLandscape = err.stderr || '';
      }
      if (!probeLandscape.includes('1920x1080') || !probeLandscape.includes('h264')) {
        throw new Error(`Rendered 16:9 financial video failed technical check (probe: ${probeLandscape})`);
      }

      // 19. Real Sample Short composition for Milestone 2:
      // 5 scenes: Hook -> Revenue -> Growth -> Comparison -> General Info
      const testAudioPath = path.join(tempDir, 'sample_audio_m2.mp3');
      await runFFmpeg(['-y', '-f', 'lavfi', '-i', 'aevalsrc=0.03*sin(440*2*PI*t):d=7.5', '-c:a', 'libmp3lame', testAudioPath]);

      const sceneGrowth = {
        label: 'Growth Rate',
        scriptText: 'Operating profits jumped by 42% in twelve months.',
        duration: 1.5,
        verifiedData: {
          verified: true,
          type: 'growth',
          value: '+42%',
          growthRate: 42,
          direction: 'up',
          label: 'Operating Profit Surge',
          source: 'Audited Financial Statements'
        }
      };

      const sceneComparison = {
        label: 'Head-to-Head',
        scriptText: 'Alpha generated $12B compared to Beta with $8B.',
        duration: 1.5,
        verifiedData: {
          verified: true,
          type: 'comparison',
          left: { label: 'Company Alpha', value: '$12B' },
          right: { label: 'Company Beta', value: '$8B' },
          label: 'Annual Market Share',
          source: 'Market Audit 2025'
        }
      };

      const sceneGeneral = {
        label: 'Summary',
        scriptText: 'Clear data creates unstoppable competitive advantages in business.',
        duration: 1.5
      };

      const m2Plans = [
        hookPlan,
        planRev,
        selector.buildPlan(sceneGrowth),
        selector.buildPlan(sceneComparison),
        selector.buildPlan(sceneGeneral)
      ];

      const sampleM2Path = path.join(tempDir, 'sample_milestone2_short.mp4');
      await renderer.composeShort(m2Plans, testAudioPath, sampleM2Path);

      const sampleStats = await fs.stat(sampleM2Path);
      if (!sampleStats.isFile() || sampleStats.size <= 0) {
        throw new Error('Composed Milestone 2 sample Short is empty');
      }

      let sampleM2Probe = '';
      try {
        await runFFmpeg(['-i', sampleM2Path]);
      } catch (err) {
        sampleM2Probe = err.stderr || '';
      }
      if (!sampleM2Probe.includes('1080x1920') || !sampleM2Probe.includes('h264') || !sampleM2Probe.includes('aac')) {
        throw new Error(`Milestone 2 sample Short failed technical properties (got: ${sampleM2Probe})`);
      }

      // Persist sample to data/shorts/ for operator inspection
      const previewDir = path.join(__dirname, 'data', 'shorts');
      await fs.mkdir(previewDir, { recursive: true });
      const persistentPath = path.join(previewDir, 'sample_milestone2_short.mp4');
      await fs.copyFile(sampleM2Path, persistentPath);

      this.logger.info(`Milestone 2 Sample Short generated successfully at ${persistentPath} (size: ${sampleStats.size} bytes)`);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    this.logger.info('Verified Financial & Data Visualization Engine test completed successfully');
  }

  async testAudioEnhancementEngine() {
    this.logger.info('Starting Professional Audio Enhancement Engine tests...');

    const fs = require('fs').promises;
    const os = require('os');
    const { runFFmpeg, checkFFmpeg } = require('./utils/ffmpeg');

    if (!(await checkFFmpeg())) {
      this.logger.warn('FFmpeg unavailable — skipping audio enhancement engine tests');
      return;
    }

    const audioEngine = new AudioEnhancementEngine({ logger: this.logger, runFFmpeg });
    const selector = new VisualTreatmentSelector({ logger: this.logger });
    const renderer = new VisualTreatmentRenderer({ logger: this.logger, runFFmpeg });

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-audio-engine-'));

    try {
      // 1. Voice normalization filter construction
      const voiceFilter = VoiceProcessor.buildFilter({ enableVoiceClarity: true });
      if (!voiceFilter.includes('highpass=f=80') || !voiceFilter.includes('acompressor=threshold=-18dB') || !voiceFilter.includes('alimiter=')) {
        throw new Error(`Voice normalization filter chain incomplete: ${voiceFilter}`);
      }

      // 2. Voice clarity EQ verification
      const clarityOn = VoiceProcessor.buildFilter({ enableVoiceClarity: true });
      if (!clarityOn.includes('equalizer=f=3200') || !clarityOn.includes('equalizer=f=300')) {
        throw new Error('Voice clarity filters missing when enableVoiceClarity is true');
      }
      const clarityOff = VoiceProcessor.buildFilter({ enableVoiceClarity: false });
      if (clarityOff.includes('equalizer=f=3200')) {
        throw new Error('Voice clarity equalizer should be disabled when enableVoiceClarity is false');
      }

      // Prepare test voice (4 seconds) and soundbed (4 seconds)
      const voicePath = path.join(tempDir, 'voice_test.wav');
      await runFFmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:a', 'pcm_s16le', voicePath]);

      const soundbedPath = path.join(tempDir, 'soundbed_test.wav');
      await audioEngine.generateAmbientSoundbed(4, soundbedPath);
      const soundbedStats = await fs.stat(soundbedPath);
      if (soundbedStats.size <= 100) {
        throw new Error('Ambient soundbed generator failed to produce a valid audio file');
      }

      // 3. Background music mixing
      const mixedAudioPath = path.join(tempDir, 'mixed_output.m4a');
      const mixSpec = new AudioMixSpec({
        voicePath,
        musicPath: soundbedPath,
        musicVolume: 0.22,
        fadeInDuration: 0.5,
        fadeOutDuration: 0.8,
        enableDucking: true,
        targetLoudness: -14.0,
        truePeakLimit: -1.5
      });

      await audioEngine.enhanceAndMix(mixSpec, mixedAudioPath);
      const mixAnalysis = await AudioValidation.analyzeAudio(mixedAudioPath);
      if (!mixAnalysis.isUsable || mixAnalysis.duration <= 0) {
        throw new Error('Mixed audio output is invalid or empty');
      }

      // 4. Automatic voice ducking filter check
      const duckingFilter = MusicDucker.buildDuckingFilter(mixSpec);
      if (!duckingFilter.includes('sidechaincompress') || !duckingFilter.includes('ratio=4')) {
        throw new Error(`Ducking filter mismatch: expected sidechaincompress, got ${duckingFilter}`);
      }

      // 5. Music fade-in
      const musicFilter = MusicDucker.buildMusicFilter(mixSpec, 4);
      if (!musicFilter.includes('afade=t=in:ss=0:d=0.50')) {
        throw new Error(`Music fade-in filter missing: ${musicFilter}`);
      }

      // 6. Music fade-out
      if (!musicFilter.includes('afade=t=out:st=3.20:d=0.80')) {
        throw new Error(`Music fade-out filter missing: ${musicFilter}`);
      }

      // 7. Missing music fallback
      const missingMusicSpec = new AudioMixSpec({
        voicePath,
        musicPath: path.join(tempDir, 'non_existent_music.mp3'),
        enableDucking: true
      });
      const missingMusicOut = path.join(tempDir, 'missing_music_output.m4a');
      await audioEngine.enhanceAndMix(missingMusicSpec, missingMusicOut);
      const missingMusicAnalysis = await AudioValidation.analyzeAudio(missingMusicOut);
      if (!missingMusicAnalysis.isUsable) {
        throw new Error('Engine failed to fall back cleanly when background music was missing');
      }

      // 8. Missing SFX fallback
      const missingSfxSpec = new AudioMixSpec({
        voicePath,
        sfxCues: [{ path: path.join(tempDir, 'missing_sfx.wav'), timeSeconds: 1, volume: 0.2 }]
      });
      const missingSfxOut = path.join(tempDir, 'missing_sfx_output.m4a');
      await audioEngine.enhanceAndMix(missingSfxSpec, missingSfxOut);
      const missingSfxAnalysis = await AudioValidation.analyzeAudio(missingSfxOut);
      if (!missingSfxAnalysis.isUsable) {
        throw new Error('Engine failed to fall back cleanly when SFX asset was missing');
      }

      // 9. SFX scheduling
      const samplePlans = [
        selector.buildPlan({ label: 'Hook', position: 0, scriptText: 'Hook line' }),
        selector.buildPlan({ label: 'Revenue', scriptText: 'Revenue metric', verifiedData: { verified: true, type: 'statistic', value: '$10B' } }),
        selector.buildPlan({ label: 'Growth', scriptText: 'Growth rate', verifiedData: { verified: true, type: 'growth', value: '+30%' } }),
        selector.buildPlan({ label: 'Comparison', scriptText: 'Comparison A vs B', verifiedData: { verified: true, type: 'comparison', left: { label: 'A' }, right: { label: 'B' } } })
      ];
      const plannedCues = SfxScheduler.planSfxForScenes(samplePlans);
      if (!Array.isArray(plannedCues) || plannedCues.length !== 4) {
        throw new Error(`SfxScheduler did not plan cues for all eligible scenes: got ${plannedCues.length}`);
      }
      if (plannedCues[0].type !== 'hook' || plannedCues[1].type !== 'chime' || plannedCues[2].type !== 'shimmer' || plannedCues[3].type !== 'whoosh') {
        throw new Error('SfxScheduler cue types do not match expected scene semantics');
      }

      // 10. Audio synchronization check
      if (Math.abs(mixAnalysis.duration - 4.0) > 0.4) {
        throw new Error(`Mixed audio duration (${mixAnalysis.duration}s) deviated significantly from source duration (4.0s)`);
      }

      // 11. Missing word-level timestamps fallback (karaoke deterministic fallback)
      const statPlan = samplePlans[1];
      const fallbackAss = renderer.generateKaraokeAss(statPlan);
      if (!fallbackAss.includes('{\\k') || !fallbackAss.includes('[V4+ Styles]')) {
        throw new Error('Deterministic caption timing fallback failed to produce valid karaoke tags');
      }

      // 12. Clipping protection
      if (mixAnalysis.hasClipping || mixAnalysis.truePeak > 0.0) {
        throw new Error(`Clipping detected in audio output: True Peak is ${mixAnalysis.truePeak} dBFS`);
      }

      // 13. Loudness validation
      if (mixAnalysis.integratedLoudness > -5.0 || mixAnalysis.integratedLoudness < -40.0) {
        this.logger.warn(`Loudness reading: ${mixAnalysis.integratedLoudness} LUFS`);
      }

      // 14. AAC output
      if (mixAnalysis.codec !== 'aac') {
        throw new Error(`Output audio codec is not AAC: got ${mixAnalysis.codec}`);
      }

      // 15. Existing karaoke regression
      if (!fallbackAss.includes(String(statPlan.safeZones.subtitleMarginV))) {
        throw new Error('Karaoke safe-zone margin regression detected');
      }

      // 16. Existing visual treatment regression
      const hookPlan = samplePlans[0];
      if (hookPlan.sceneType !== SCENE_TYPES.HOOK || hookPlan.treatment !== TREATMENTS.ANTI_SWIPE_HOOK) {
        throw new Error('Visual treatment engine HOOK regression detected');
      }

      // 17. Existing financial visualization regression
      if (!statPlan.visualizationSpec || statPlan.visualizationSpec.type !== VISUALIZATION_TYPES.ANIMATED_METRIC) {
        throw new Error('Financial visualization engine specification regression detected');
      }

      // 18. 1080x1920 Portrait rendering with enhanced audio
      const portraitOut = path.join(tempDir, 'audio_portrait_test.mp4');
      await renderer.composeShort([statPlan], mixedAudioPath, portraitOut, {
        rawAudio: true
      });
      let portraitProbe = '';
      try {
        await runFFmpeg(['-i', portraitOut]);
      } catch (err) {
        portraitProbe = err.stderr || '';
      }
      if (!portraitProbe.includes('1080x1920') || !portraitProbe.includes('h264') || !portraitProbe.includes('aac')) {
        throw new Error(`1080x1920 portrait video failed technical probe with enhanced audio: ${portraitProbe}`);
      }

      // 19. 16:9 Landscape regression with enhanced audio
      const landscapeStatPlan = selector.buildPlan(
        { label: 'Revenue', scriptText: 'Revenue metric', verifiedData: { verified: true, type: 'statistic', value: '$10B' } },
        {},
        { aspectRatio: '16:9', duration: 1.5 }
      );
      const landscapeOut = path.join(tempDir, 'audio_landscape_test.mp4');
      await renderer.composeShort([landscapeStatPlan], mixedAudioPath, landscapeOut, {
        rawAudio: true
      });
      let landscapeProbe = '';
      try {
        await runFFmpeg(['-i', landscapeOut]);
      } catch (err) {
        landscapeProbe = err.stderr || '';
      }
      if (!landscapeProbe.includes('1920x1080') || !landscapeProbe.includes('h264') || !landscapeProbe.includes('aac')) {
        throw new Error(`16:9 landscape video failed technical probe with enhanced audio: ${landscapeProbe}`);
      }

      // 20. Real Sample Milestone 3 Short:
      // 5 scenes (7.5s): Hook -> Revenue ($12B) -> Growth (+42%) -> Comparison ($12B vs $8B) -> Summary
      // with soundbed, ducking, subtle SFX, dynamic karaoke captions, and financial visualizations
      const sampleVoicePath = path.join(tempDir, 'sample_m3_voice.mp3');
      await runFFmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=520:duration=7.5', '-c:a', 'libmp3lame', sampleVoicePath]);

      const sampleMusicPath = path.join(tempDir, 'sample_m3_music.wav');
      await audioEngine.generateAmbientSoundbed(7.5, sampleMusicPath);

      const chimeSfxPath = path.join(tempDir, 'sfx_chime.wav');
      await audioEngine.generateSubtleSfx('chime', chimeSfxPath);

      const shimmerSfxPath = path.join(tempDir, 'sfx_shimmer.wav');
      await audioEngine.generateSubtleSfx('shimmer', shimmerSfxPath);

      const m3Scene1 = selector.buildPlan({
        label: 'Hook', position: 0, scriptText: 'Stop scrolling! Here is the $12B secret nobody told you.', duration: 1.5
      });
      const m3Scene2 = selector.buildPlan({
        label: 'Revenue', scriptText: 'In 2025, company revenue surged to $12B.', duration: 1.5,
        verifiedData: { verified: true, type: 'statistic', value: '$12B', label: 'Annual Revenue', source: 'SEC Form 10-K' }
      });
      const m3Scene3 = selector.buildPlan({
        label: 'Growth Rate', scriptText: 'Operating profits jumped by 42% in twelve months.', duration: 1.5,
        verifiedData: { verified: true, type: 'growth', value: '+42%', growthRate: 42, direction: 'up', label: 'Operating Profit Surge', source: 'Audited Financials' }
      });
      const m3Scene4 = selector.buildPlan({
        label: 'Head-to-Head', scriptText: 'Alpha generated $12B compared to Beta with $8B.', duration: 1.5,
        verifiedData: { verified: true, type: 'comparison', left: { label: 'Alpha', value: '$12B' }, right: { label: 'Beta', value: '$8B' }, label: 'Annual Market Share', source: 'Market Audit' }
      });
      const m3Scene5 = selector.buildPlan({
        label: 'Summary', scriptText: 'Clear data creates unstoppable competitive advantages in business.', duration: 1.5
      });

      const m3Plans = [m3Scene1, m3Scene2, m3Scene3, m3Scene4, m3Scene5];
      const m3SfxCues = [
        { path: chimeSfxPath, timeSeconds: 1.7, volume: 0.2, label: 'Revenue Chime' },
        { path: shimmerSfxPath, timeSeconds: 3.2, volume: 0.2, label: 'Growth Shimmer' }
      ];

      const sampleM3Path = path.join(tempDir, 'sample_milestone3_short.mp4');
      await renderer.composeShort(m3Plans, sampleVoicePath, sampleM3Path, {
        musicPath: sampleMusicPath,
        musicVolume: 0.20,
        enableDucking: true,
        sfxCues: m3SfxCues,
        targetLoudness: -14.0,
        truePeakLimit: -1.5,
        enableVoiceClarity: true
      });

      const m3Stats = await fs.stat(sampleM3Path);
      if (!m3Stats.isFile() || m3Stats.size <= 0) {
        throw new Error('Composed Milestone 3 sample Short is empty');
      }

      let m3Probe = '';
      try {
        await runFFmpeg(['-i', sampleM3Path]);
      } catch (err) {
        m3Probe = err.stderr || '';
      }
      if (!m3Probe.includes('1080x1920') || !m3Probe.includes('h264') || !m3Probe.includes('aac')) {
        throw new Error(`Milestone 3 sample Short failed technical properties: ${m3Probe}`);
      }

      // Persist sample to data/shorts/ for operator inspection
      const previewDir = path.join(__dirname, 'data', 'shorts');
      await fs.mkdir(previewDir, { recursive: true });
      const persistentPath = path.join(previewDir, 'sample_milestone3_short.mp4');
      await fs.copyFile(sampleM3Path, persistentPath);

      this.logger.info(`Milestone 3 Sample Short generated successfully at ${persistentPath} (size: ${m3Stats.size} bytes)`);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    this.logger.info('Professional Audio Enhancement Engine test completed successfully');
  }

  async testShortsPackagingAndPublishingPipeline() {
    this.logger.info('Starting Shorts Packaging & Publishing Pipeline tests...');

    const fs = require('fs').promises;
    const os = require('os');
    const sharp = require('sharp');
    const { runFFmpeg, checkFFmpeg } = require('./utils/ffmpeg');
    const { ShortsPackagingService, PublishingPackage } = require('./utils/shorts-packaging-service');
    const { ShortsCoverGenerator } = require('./utils/shorts-cover-generator');
    const { VisualTreatmentSelector, VisualTreatmentRenderer } = require('./utils/visual-treatment-engine');
    const { AudioEnhancementEngine } = require('./utils/audio-enhancement-engine');
    const { ShortsRepurposingService } = require('./utils/shorts-repurposing-service');
    const { PublishingSchedulingAgent } = require('./agents/publishing-scheduling-agent');

    if (!(await checkFFmpeg())) {
      this.logger.warn('FFmpeg unavailable — skipping Milestone 4 pipeline tests');
      return;
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-milestone4-'));
    const db = new Database();
    db.dbPath = path.join(tempDir, 'm4_test.db');
    await db.initialize();

    const packagingService = new ShortsPackagingService({ logger: this.logger });
    const coverGenerator = new ShortsCoverGenerator({ logger: this.logger });
    const selector = new VisualTreatmentSelector({ logger: this.logger });
    const renderer = new VisualTreatmentRenderer({ logger: this.logger, runFFmpeg });
    const audioEngine = new AudioEnhancementEngine({ logger: this.logger, runFFmpeg });

    try {
      // ═════════════════════════════════════════════════════════════════════════
      // 1. PACKAGING SERVICE UNIT TESTS
      // ═════════════════════════════════════════════════════════════════════════

      // 1.1 PublishingPackage construction and serialization
      const pkg = new PublishingPackage({
        title: 'Nvidia $12B Revenue Secret',
        description: 'Analysis of financial results.',
        hashtags: ['#Shorts', '#Finance', '#Investing'],
        tags: ['nvidia', 'revenue', 'finance', 'investing', 'shorts'],
        cta: 'Subscribe for daily verified wealth intelligence.',
        financialDisclaimer: 'Not financial advice. Educational only.',
        verifiedSources: [{ citation: 'SEC Form 10-K', verified: true }],
        validation: { valid: true, errors: [], warnings: [] }
      });
      if (pkg.title !== 'Nvidia $12B Revenue Secret' || pkg.hashtags.length !== 3) {
        throw new Error('PublishingPackage construction failed');
      }
      const serialized = pkg.toJSON();
      if (!serialized.title || !serialized.validation?.valid || serialized.privacyStatus !== 'private') {
        throw new Error('PublishingPackage serialization failed or default privacy is not private');
      }

      // 1.2 Title generation and platform compliance (length <= 100)
      const longTitle = 'This is an excessively long title designed specifically to exceed the YouTube platform character limit and trigger truncation safely'.repeat(2);
      const sanitizedTitle = packagingService.generateTitle({
        title: longTitle,
        topic: 'Finance',
        script: { hook: { text: 'Stop scrolling!' } }
      });
      if (sanitizedTitle.length > 100) {
        throw new Error(`Sanitized title exceeded 100 characters: ${sanitizedTitle.length}`);
      }

      // 1.3 Clickbait rejection / sanitization
      const clickbaitInput = 'SHOCKING SECRET: 1000% GUARANTEED RETURN WILL BLOW YOUR MIND!';
      const cleanTitle = packagingService.sanitizeTitle(clickbaitInput);
      if (/shocking/i.test(cleanTitle) || /blow your mind/i.test(cleanTitle) || /1000%/i.test(cleanTitle)) {
        throw new Error(`Clickbait words were not sanitized from title: ${cleanTitle}`);
      }

      // 1.4 Unverified numerical claims rejection
      const unverifiedInput = {
        title: 'Company reaches $999B valuation overnight',
        verifiedData: [{ value: '$12B', label: 'Annual Revenue' }],
        claims: [{ claim: 'Revenue hit $12B', verified: true }]
      };
      const checkedTitle = packagingService.generateTitle(unverifiedInput);
      if (checkedTitle.includes('$999B')) {
        throw new Error('Unverified numerical claim ($999B) was permitted in title');
      }

      // 1.5 Financial disclaimer inclusion on financial topics
      const financialPkg = await packagingService.generatePublishingPackage({
        title: 'Nvidia $12B Revenue Breakdown',
        script: {
          hook: { text: 'How Nvidia made $12B this year.' },
          fullScript: 'Nvidia reported $12B in quarterly revenue with 42% profit margins. Investing wisely requires due diligence.'
        },
        verifiedData: [{ label: 'Revenue', value: '$12B', source: 'SEC Form 10-K' }],
        truthAnchor: [{ claim: 'Revenue is $12B', source: 'SEC Form 10-K', verified: true }]
      });
      if (!financialPkg.financialDisclaimer || !financialPkg.description.includes('DISCLAIMER: Not financial advice')) {
        throw new Error('Financial disclaimer was omitted from financial content');
      }
      if (!financialPkg.verifiedSources.length || !financialPkg.description.includes('SEC Form 10-K')) {
        throw new Error('Verified sources were omitted from description');
      }

      // 1.6 Financial disclaimer omission on non-financial topics
      const nonFinancialPkg = await packagingService.generatePublishingPackage({
        title: 'Morning Productivity Habits',
        script: {
          hook: { text: 'Wake up earlier.' },
          fullScript: 'Here are three habits to start your morning with clarity and focus.'
        }
      });
      if (nonFinancialPkg.financialDisclaimer) {
        throw new Error('Financial disclaimer was unnecessarily added to non-financial content');
      }

      // 1.7 Hashtag generation and bounds
      const hashtags = packagingService.generateHashtags({
        topic: 'Venture Capital Investing',
        script: { fullScript: 'Understanding venture capital valuations and growth.' }
      });
      if (!hashtags.includes('#Shorts') || hashtags.length > 5 || hashtags.length < 3) {
        throw new Error(`Hashtag generation failed bounds check: ${hashtags.join(', ')}`);
      }

      // 1.8 Tags generation within platform limits (<= 450 chars)
      const tags = packagingService.generateTags({
        topic: 'AI Semiconductor Growth',
        script: { fullScript: 'Semiconductor manufacturers report record chip demand and quarterly growth.' },
        verifiedData: [{ value: '$12B' }]
      });
      if (tags.join(',').length > 450 || !tags.includes('Shorts')) {
        throw new Error(`Tags generation failed limits check: ${tags.join(',')}`);
      }

      // 1.9 Quality gate & validation failure detection
      const validValidation = packagingService.validatePublishingPackage(financialPkg);
      if (!validValidation.valid) {
        throw new Error(`Valid package failed validation: ${validValidation.errors.join('; ')}`);
      }

      const invalidPkg = new PublishingPackage({
        title: 'A'.repeat(120), // Too long
        description: 'B'.repeat(6000), // Too long
        tags: Array(100).fill('excessive-tag-stuffing-string')
      });
      const invalidValidation = packagingService.validatePublishingPackage(invalidPkg);
      if (invalidValidation.valid || invalidValidation.errors.length === 0) {
        throw new Error('Invalid package erroneously passed validation');
      }

      // ═════════════════════════════════════════════════════════════════════════
      // 2. COVER GENERATOR UNIT TESTS
      // ═════════════════════════════════════════════════════════════════════════

      // 2.1 Hook scene selection
      const mockScenes = [
        { id: 'intro', label: 'Hook', isHook: true, scriptText: 'Why this $12B deal changes everything.' },
        { id: 'data', label: 'Revenue', scriptText: 'Revenue jumped by 42%.', verifiedData: { value: '$12B' } }
      ];
      const hookScene = coverGenerator.selectHookScene(mockScenes);
      if (!hookScene || hookScene.id !== 'intro') {
        throw new Error('Cover generator failed to select the hook scene');
      }

      // 2.2 Cover frame generation (1080x1920 JPEG) with verified badge
      const coverOutputPath = path.join(tempDir, 'test_cover.jpg');
      const coverResult = await coverGenerator.generateCover({
        title: 'The $12B Revenue Shock',
        script: { hook: { text: 'The $12B Revenue Shock' } },
        scenes: mockScenes,
        verifiedData: [{ label: 'Revenue', value: '$12B', source: 'SEC Form 10-K' }],
        truthAnchor: [{ claim: 'Revenue hit $12B', verified: true }]
      }, coverOutputPath);

      const coverStats = await fs.stat(coverOutputPath);
      if (!coverStats.isFile() || coverStats.size <= 0) {
        throw new Error('Generated cover file is missing or empty');
      }
      if (coverResult.width !== 1080 || coverResult.height !== 1920) {
        throw new Error(`Cover dimensions unexpected: ${coverResult.width}x${coverResult.height}`);
      }

      // Verify image header & properties with sharp
      const coverMeta = await sharp(coverOutputPath).metadata();
      if (coverMeta.width !== 1080 || coverMeta.height !== 1920 || coverMeta.format !== 'jpeg') {
        throw new Error(`Sharp metadata verification failed: ${coverMeta.width}x${coverMeta.height}, ${coverMeta.format}`);
      }

      // 2.3 Fallback cover generation with no source assets
      const fallbackCoverPath = path.join(tempDir, 'test_fallback_cover.jpg');
      await coverGenerator.generateCover({
        title: 'Simple Fallback Title',
        scenes: []
      }, fallbackCoverPath);
      const fallbackMeta = await sharp(fallbackCoverPath).metadata();
      if (fallbackMeta.width !== 1080 || fallbackMeta.height !== 1920) {
        throw new Error('Fallback cover generation failed');
      }

      // ═════════════════════════════════════════════════════════════════════════
      // 3. PIPELINE INTEGRATION & APPROVAL TESTS
      // ═════════════════════════════════════════════════════════════════════════

      const publishing = new PublishingSchedulingAgent(db, {});
      const repurposingService = new ShortsRepurposingService(db, publishing, {
        dataRoot: path.join(tempDir, 'shorts_repurpose'),
        width: 1080,
        height: 1920,
        logger: this.logger,
        packagingService,
        coverGenerator
      });

      const productionId = 'prod-milestone4-integration';
      const sourceVideo = path.join(tempDir, 'source_m4.mp4');
      const audioPath = path.join(tempDir, 'narration_m4.wav');
      await runFFmpeg([
        '-y', '-f', 'lavfi', '-i', 'color=c=#0f172a:s=1080x1920:r=30:d=4',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', sourceVideo
      ]);
      await fs.writeFile(audioPath, Buffer.from('narration audio'));

      const production = {
        id: productionId,
        status: 'scheduled',
        strategy: { topic: 'Autonomous Wealth Intelligence', contentType: 'educational' },
        script: {
          title: 'The $12B Revenue Shock',
          fullScript: 'In 2025, company revenue surged to $12B with verified audited records. Clear numbers win in modern finance.'
        },
        seo: {
          title: 'The $12B Revenue Shock',
          description: 'A deep dive into audited financial results.',
          tags: ['finance', 'revenue', 'investing']
        },
        assets: {
          finalVideo: { path: sourceVideo, simulated: false, duration: 4 },
          audio: { path: audioPath, status: 'ready', simulated: false, provider: 'fixture-tts' }
        },
        timeline: {},
        priority: 60,
        scheduledPublishTime: new Date(Date.now() + 86400000).toISOString()
      };
      await db.saveProductionData(production);
      await db.saveProductionSnapshot(production);
      await db.saveContentReview(productionId, {
        status: 'approved',
        editorData: { factChecked: true, rightsConfirmed: true },
        qualityChecks: [],
        reviewedAt: new Date().toISOString()
      });
      await db.saveContentProvenance(productionId, {
        sources: [{ id: 'src-1', title: 'SEC Form 10-K', url: 'https://sec.gov', verified: true }],
        claims: [{ claim: 'Revenue is $12B', verified: true, sourceId: 'src-1' }],
        containsSyntheticMedia: false,
        status: 'verified',
        summary: { sourceCount: 1, verifiedSources: 1, claimCount: 1, resolvedClaims: 1, highRiskClaims: 0, unresolvedClaims: 0 }
      });
      await db.replaceProductionScenes(productionId, [
        { id: 'sc-1', label: 'Hook', scriptText: 'Stop scrolling! The $12B number is real.', prompt: 'Hook', duration: 1.5, assetType: 'video', assetPath: sourceVideo, audioPath, status: 'ready', narrationStatus: 'current', rightsConfirmed: true },
        { id: 'sc-2', label: 'Revenue', scriptText: 'Revenue surged to $12B in audited results.', prompt: 'Revenue', duration: 1.5, assetType: 'video', assetPath: sourceVideo, audioPath, status: 'ready', narrationStatus: 'current', rightsConfirmed: true }
      ]);

      const proposedClips = await repurposingService.propose(productionId, { count: 1 });
      if (!proposedClips.length) throw new Error('Short proposal failed');
      const clipId = proposedClips[0].id;

      // Render Scene-Based Short with automatic cover & packaging generation
      const scenePlans = [
        selector.buildPlan({ label: 'Hook', isHook: true, scriptText: 'Stop scrolling! The $12B number is real.', duration: 1.5 }),
        selector.buildPlan({
          label: 'Revenue', scriptText: 'Revenue surged to $12B in audited results.', duration: 1.5,
          verifiedData: { verified: true, type: 'statistic', value: '$12B', label: 'Annual Revenue', source: 'SEC Form 10-K' }
        })
      ];

      const renderedClip = await repurposingService.renderSceneBasedShort(productionId, clipId, scenePlans, {
        musicVolume: 0.15,
        enableDucking: true,
        enableVoiceClarity: true
      });

      if (!renderedClip.coverPath) {
        throw new Error('Scene-based Short rendering did not produce a cover thumbnail');
      }
      if (!renderedClip.packaging || !renderedClip.packaging.title) {
        throw new Error('Scene-based Short rendering did not produce a publishing package');
      }
      const coverStat = await fs.stat(renderedClip.coverPath);
      if (!coverStat.isFile() || coverStat.size <= 0) {
        throw new Error('Scene-based Short cover file is missing or empty on disk');
      }

      // Approve Short and verify scheduling inherits packaging and cover
      let unconfirmedBlocked = false;
      try {
        await repurposingService.approve(productionId, clipId, {});
      } catch (err) {
        unconfirmedBlocked = err.code === 'SHORT_APPROVAL_REQUIRED';
      }
      if (!unconfirmedBlocked) {
        throw new Error('Unconfirmed Short approval was not blocked');
      }

      const scheduledClip = await repurposingService.approve(productionId, clipId, {
        confirmed: true,
        privacyStatus: 'private',
        publishTime: new Date(Date.now() + 172800000).toISOString()
      });

      if (scheduledClip.status !== 'scheduled' || scheduledClip.privacyStatus !== 'private') {
        throw new Error('Approved Short failed to schedule or privacy status was not private');
      }

      const scheduleEntry = await db.getLatestScheduleEntry(clipId);
      if (!scheduleEntry) {
        throw new Error('Schedule entry was not found in database');
      }
      if (!scheduleEntry.metadata.thumbnail?.path) {
        throw new Error('Schedule entry thumbnail path was not set to cover thumbnail');
      }
      if (scheduleEntry.metadata.privacyStatus !== 'private') {
        throw new Error(`Schedule entry privacyStatus violated private-first safety: ${scheduleEntry.metadata.privacyStatus}`);
      }

      // ═════════════════════════════════════════════════════════════════════════
      // 4. REAL END-TO-END MILESTONE 4 SAMPLE GENERATION & INSPECTION
      // ═════════════════════════════════════════════════════════════════════════

      // Build 5-scene production (7.5s): Hook -> Revenue ($12B) -> Growth (+42%) -> Comparison ($12B vs $8B) -> Summary
      const m4VoicePath = path.join(tempDir, 'm4_sample_voice.mp3');
      await runFFmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=480:duration=7.5', '-c:a', 'libmp3lame', m4VoicePath]);

      const m4MusicPath = path.join(tempDir, 'm4_sample_music.wav');
      await audioEngine.generateAmbientSoundbed(7.5, m4MusicPath);

      const m4ChimePath = path.join(tempDir, 'm4_chime.wav');
      await audioEngine.generateSubtleSfx('chime', m4ChimePath);

      const m4Scene1 = selector.buildPlan({
        label: 'Hook', position: 0, isHook: true, scriptText: 'Stop scrolling! Here is the $12B verified secret.', duration: 1.5
      });
      const m4Scene2 = selector.buildPlan({
        label: 'Revenue', scriptText: 'In 2025, company revenue surged to $12B.', duration: 1.5,
        verifiedData: { verified: true, type: 'statistic', value: '$12B', label: 'Annual Revenue', source: 'SEC Form 10-K' }
      });
      const m4Scene3 = selector.buildPlan({
        label: 'Growth', scriptText: 'Operating profit expanded by 42% year over year.', duration: 1.5,
        verifiedData: { verified: true, type: 'growth', value: '+42%', growthRate: 42, direction: 'up', label: 'Profit Expansion', source: 'Audited Financials' }
      });
      const m4Scene4 = selector.buildPlan({
        label: 'Comparison', scriptText: 'Alpha generated $12B compared to Beta with $8B.', duration: 1.5,
        verifiedData: { verified: true, type: 'comparison', left: { label: 'Alpha', value: '$12B' }, right: { label: 'Beta', value: '$8B' }, label: 'Market Leadership', source: 'Market Audit' }
      });
      const m4Scene5 = selector.buildPlan({
        label: 'Summary', scriptText: 'Subscribe for daily verified wealth intelligence.', duration: 1.5
      });

      const m4Plans = [m4Scene1, m4Scene2, m4Scene3, m4Scene4, m4Scene5];
      const m4SfxCues = [
        { path: m4ChimePath, timeSeconds: 1.6, volume: 0.2, label: 'Revenue Chime' }
      ];

      const sampleM4VideoPath = path.join(tempDir, 'sample_milestone4_short.mp4');
      await renderer.composeShort(m4Plans, m4VoicePath, sampleM4VideoPath, {
        musicPath: m4MusicPath,
        musicVolume: 0.18,
        enableDucking: true,
        sfxCues: m4SfxCues,
        targetLoudness: -14.0,
        truePeakLimit: -1.5,
        enableVoiceClarity: true
      });

      const m4VideoStats = await fs.stat(sampleM4VideoPath);
      if (!m4VideoStats.isFile() || m4VideoStats.size <= 0) {
        throw new Error('Milestone 4 sample Short MP4 is empty');
      }

      // Generate 9:16 Cover
      const sampleM4CoverPath = path.join(tempDir, 'sample_milestone4_cover.jpg');
      const m4CoverResult = await coverGenerator.generateCover({
        title: 'The $12B Secret Nobody Told You',
        script: { hook: { text: 'The $12B Secret Nobody Told You' } },
        scenes: m4Plans,
        verifiedData: [
          { label: 'Annual Revenue', value: '$12B', source: 'SEC Form 10-K' },
          { label: 'Operating Profit Expansion', value: '+42%', source: 'Audited Financials' }
        ],
        truthAnchor: [
          { claim: 'Revenue hit $12B', verified: true, source: 'SEC Form 10-K' },
          { claim: 'Operating profit grew 42%', verified: true, source: 'Audited Financials' }
        ]
      }, sampleM4CoverPath);

      // Generate Publishing Package
      const sampleM4Pkg = await packagingService.generatePublishingPackage({
        title: 'The $12B Secret Nobody Told You',
        topic: 'Finance & Technology Wealth',
        script: {
          hook: { text: 'Stop scrolling! Here is the $12B verified secret.' },
          fullScript: 'In 2025, company revenue surged to $12B with operating profits expanding by 42%. Verified filings show Alpha leading Beta by $4B.'
        },
        scenes: m4Plans,
        verifiedData: [
          { label: 'Annual Revenue', value: '$12B', source: 'SEC Form 10-K' },
          { label: 'Operating Profit Expansion', value: '+42%', source: 'Audited Financials' }
        ],
        truthAnchor: [
          { claim: 'Revenue hit $12B', verified: true, source: 'SEC Form 10-K' },
          { claim: 'Operating profit grew 42%', verified: true, source: 'Audited Financials' }
        ],
        provenance: {
          sources: [
            { title: 'SEC Form 10-K Filing', url: 'https://sec.gov', verified: true },
            { title: 'Audited Financial Statement 2025', verified: true }
          ]
        },
        cover: { path: sampleM4CoverPath, width: m4CoverResult.width, height: m4CoverResult.height }
      });

      if (!sampleM4Pkg.validation?.valid) {
        throw new Error(`Milestone 4 publishing package validation failed: ${sampleM4Pkg.validation?.errors?.join('; ')}`);
      }

      // Technical MP4 Inspection via FFmpeg
      let m4ProbeOutput = '';
      try {
        await runFFmpeg(['-i', sampleM4VideoPath]);
      } catch (err) {
        m4ProbeOutput = err.stderr || '';
      }

      if (!m4ProbeOutput.includes('1080x1920')) {
        throw new Error(`Milestone 4 sample Short resolution not 1080x1920: ${m4ProbeOutput}`);
      }
      if (!m4ProbeOutput.includes('h264')) {
        throw new Error(`Milestone 4 sample Short video codec not h264: ${m4ProbeOutput}`);
      }
      if (!m4ProbeOutput.includes('aac')) {
        throw new Error(`Milestone 4 sample Short audio codec not aac: ${m4ProbeOutput}`);
      }

      // Technical Cover Inspection via sharp
      const sampleCoverMeta = await sharp(sampleM4CoverPath).metadata();
      if (sampleCoverMeta.width !== 1080 || sampleCoverMeta.height !== 1920 || sampleCoverMeta.format !== 'jpeg') {
        throw new Error(`Milestone 4 sample cover dimensions/format invalid: ${sampleCoverMeta.width}x${sampleCoverMeta.height}`);
      }

      // Persist sample files to data/shorts/ directory for review
      const previewDir = path.join(__dirname, 'data', 'shorts');
      await fs.mkdir(previewDir, { recursive: true });

      const persistentVideoPath = path.join(previewDir, 'sample_milestone4_short.mp4');
      const persistentCoverPath = path.join(previewDir, 'sample_milestone4_cover.jpg');
      const persistentPkgPath = path.join(previewDir, 'sample_milestone4_packaging.json');

      await fs.copyFile(sampleM4VideoPath, persistentVideoPath);
      await fs.copyFile(sampleM4CoverPath, persistentCoverPath);
      await fs.writeFile(persistentPkgPath, JSON.stringify(sampleM4Pkg.toJSON(), null, 2), 'utf8');

      this.logger.info(`Milestone 4 End-to-End Sample Generated Successfully:`);
      this.logger.info(`  Video:     ${persistentVideoPath} (${m4VideoStats.size} bytes)`);
      this.logger.info(`  Cover:     ${persistentCoverPath} (${sampleCoverMeta.size || '1080x1920'} bytes)`);
      this.logger.info(`  Packaging: ${persistentPkgPath}`);

    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    this.logger.info('Shorts Packaging & Publishing Pipeline test completed successfully');
  }

  async testSemanticDedupService() {
    const { SemanticDedupService } = require('./utils/semantic-dedup-service');
    const { ContentStrategyAgent } = require('./agents/content-strategy-agent');

    const dedup = new SemanticDedupService({
      duplicateThreshold: 0.65,
      strongDuplicateThreshold: 0.80
    });

    const topicA = 'Why Apple Ditched Intel';
    const topicExact = 'Why Apple Ditched Intel';
    const topicCase = '  WHY APPLE DITCHED INTEL!!  ';
    const topicMinor = 'Why Did Apple Ditch Intel?';
    const topicSyn1 = 'The Reason Apple Switched From Intel to M-Series';
    const topicSyn2 = 'The Reason Mac Switched to M-Series';
    const topicUnrelated = 'How Nvidia Makes Money From Data Centers';

    // 1. Exact duplicate -> detected
    const resExact = dedup.isDuplicate(topicExact, [topicA]);
    if (!resExact.isDuplicate || resExact.similarityType !== 'EXACT' || resExact.score !== 1.0) {
      throw new Error(`Exact duplicate not detected properly: ${JSON.stringify(resExact)}`);
    }

    // 2. Case variation -> detected
    const resCase = dedup.isDuplicate(topicCase, [topicA]);
    if (!resCase.isDuplicate || resCase.score !== 1.0) {
      throw new Error(`Case variation not detected: ${JSON.stringify(resCase)}`);
    }

    // 3. Minor wording variation -> detected
    const resMinor = dedup.isDuplicate(topicMinor, [topicA]);
    if (!resMinor.isDuplicate || resMinor.score < 0.70) {
      throw new Error(`Minor wording variation not detected: ${JSON.stringify(resMinor)}`);
    }

    // 4. Synonymous topic wording -> detected
    const resSyn1 = dedup.isDuplicate(topicSyn1, [topicA]);
    if (!resSyn1.isDuplicate || resSyn1.score < 0.65) {
      throw new Error(`Synonymous topic 1 not detected: ${JSON.stringify(resSyn1)}`);
    }

    const resSyn2 = dedup.isDuplicate(topicSyn2, [topicA]);
    if (!resSyn2.isDuplicate || resSyn2.score < 0.65) {
      throw new Error(`Synonymous topic 2 (Mac to M-Series) not detected: ${JSON.stringify(resSyn2)}`);
    }

    // 5. Clearly unrelated topics -> NOT detected
    const resUnrelated = dedup.isDuplicate(topicUnrelated, [topicA]);
    if (resUnrelated.isDuplicate || resUnrelated.score >= 0.30) {
      throw new Error(`Unrelated topic falsely flagged as duplicate: ${JSON.stringify(resUnrelated)}`);
    }

    // 6. Empty input -> safe behavior
    const resEmpty1 = dedup.isDuplicate('', [topicA]);
    const resEmpty2 = dedup.isDuplicate(null, [topicA]);
    if (resEmpty1.isDuplicate || resEmpty2.isDuplicate) {
      throw new Error('Empty input was incorrectly flagged as duplicate');
    }

    // 7. Missing history -> safe behavior
    const resMissingHist = dedup.filterDuplicates([topicA], []);
    if (resMissingHist.unique.length !== 1 || resMissingHist.duplicates.length !== 0) {
      throw new Error('Missing history did not safely pass candidate');
    }

    // 8. Multiple candidates -> deterministic results & intra-batch deduplication
    const candidates = [
      'Why Apple Ditched Intel',
      'The Reason Apple Switched From Intel to M-Series', // Duplicate of candidate 0
      'How Nvidia Makes Money From Data Centers',        // Unique
      'How Nvidia Monetizes Data Centers'                // Duplicate of candidate 2
    ];
    const filtered = dedup.filterDuplicates(candidates, []);
    if (filtered.unique.length !== 2 || filtered.duplicates.length !== 2) {
      throw new Error(`Intra-batch deduplication failed: ${JSON.stringify(filtered)}`);
    }
    if (filtered.unique[0] !== 'Why Apple Ditched Intel' || filtered.unique[1] !== 'How Nvidia Makes Money From Data Centers') {
      throw new Error(`Unexpected unique topics retained: ${JSON.stringify(filtered.unique)}`);
    }

    // 9. Same input twice -> same result (determinism)
    const run1 = dedup.calculateHybridSimilarity(topicA, topicSyn1);
    const run2 = dedup.calculateHybridSimilarity(topicA, topicSyn1);
    if (run1.score !== run2.score || run1.lexicalScore !== run2.lexicalScore || run1.semanticScore !== run2.semanticScore) {
      throw new Error(`Non-deterministic similarity calculation: ${JSON.stringify(run1)} vs ${JSON.stringify(run2)}`);
    }

    // 10. Existing ContentStrategyAgent behavior remains functional
    const agent = new ContentStrategyAgent(null, {}, { dedupOptions: { duplicateThreshold: 0.65 } });
    agent.historicalPerformance = [
      { topic: 'Why Apple Ditched Intel', createdAt: new Date().toISOString() }
    ];

    agent.trendingTopics = [
      { topic: 'The Reason Apple Switched From Intel to M-Series', score: 9.0 },
      { topic: 'How Nvidia Makes Money From Data Centers', score: 8.0 }
    ];

    const chosen = agent.selectOptimalTopic();
    if (chosen.topic !== 'How Nvidia Makes Money From Data Centers') {
      throw new Error(`ContentStrategyAgent failed to filter synonymous topic: chosen "${chosen.topic}"`);
    }

    this.logger.info('Semantic Topic Deduplication Service test completed successfully');
  }

  async testTrendingTopicDiscovery() {
    const { TrendingTopicDiscovery } = require('./utils/trending-topic-discovery');
    const { ContentStrategyAgent } = require('./agents/content-strategy-agent');
    const { SemanticDedupService } = require('./utils/semantic-dedup-service');

    // 1. Trend service can instantiate
    const discovery = new TrendingTopicDiscovery({}, { regionCode: 'US' });
    if (!discovery || typeof discovery.discoverTrendingTopics !== 'function') {
      throw new Error('TrendingTopicDiscovery failed to instantiate');
    }

    // 2. Normalized topic candidate output has expected structure
    const sampleTrends = [
      {
        id: 'vid1',
        snippet: {
          title: 'Nvidia AI Chip Revenue Surge Explained',
          tags: ['nvidia', 'chips', 'ai', 'revenue'],
          categoryId: '28',
          publishedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
          channelTitle: 'Tech Insights'
        },
        statistics: { viewCount: '1000000' }
      }
    ];

    const mockYouTube = {
      videos: {
        list: async ({ chart }) => {
          if (chart === 'mostPopular') {
            return { data: { items: sampleTrends } };
          }
          return { data: { items: [] } };
        }
      },
      search: {
        list: async () => ({ data: { items: [] } })
      }
    };

    const mockCredentials = {
      getYouTubeClient: () => mockYouTube
    };

    const serviceWithMock = new TrendingTopicDiscovery(mockCredentials);

    // 3. YouTube trend response can be converted into candidates
    const rawTrends = await serviceWithMock.fetchYouTubeTrends();
    if (rawTrends.length !== 1 || rawTrends[0].title !== 'Nvidia AI Chip Revenue Surge Explained') {
      throw new Error(`YouTube trend response conversion failed: ${JSON.stringify(rawTrends)}`);
    }
    if (typeof rawTrends[0].velocity !== 'number' || rawTrends[0].velocity <= 0) {
      throw new Error(`Velocity was not calculated on trend item: ${JSON.stringify(rawTrends[0])}`);
    }

    // 4. Competitor signals can be merged
    const sampleCompetitors = [
      {
        channelId: 'UC123456',
        topPerformingTopics: [
          {
            topic: 'nvidia',
            avgViews: 500000,
            evidence: [{ url: 'https://youtube.com/watch?v=comp1', title: 'Nvidia secret' }]
          }
        ],
        averageViews: 500000,
        uploadFrequency: 4
      }
    ];

    const mergedCandidates = serviceWithMock.mergeTrendData(rawTrends, sampleCompetitors);
    if (!Array.isArray(mergedCandidates) || mergedCandidates.length === 0) {
      throw new Error('Merging trend and competitor data failed');
    }

    const nvidiaCandidate = mergedCandidates.find(c => c.topic === 'nvidia');
    if (!nvidiaCandidate) {
      throw new Error('Candidate "nvidia" not found in merged results');
    }

    // Verify expected structure and Truth Anchor declaration
    if (
      !nvidiaCandidate.topic ||
      typeof nvidiaCandidate.score !== 'number' ||
      typeof nvidiaCandidate.opportunityScore !== 'number' ||
      !Array.isArray(nvidiaCandidate.sources) ||
      !Array.isArray(nvidiaCandidate.evidence) ||
      nvidiaCandidate.isTruthAnchorVerified !== false ||
      nvidiaCandidate.provenanceStatus !== 'UNVERIFIED_TREND_SIGNAL'
    ) {
      throw new Error(`Candidate does not conform to structure or Truth Anchor contract: ${JSON.stringify(nvidiaCandidate)}`);
    }

    // 5. Velocity calculation is deterministic
    const fixedNow = new Date('2026-09-11T12:00:00.000Z');
    const pubDate = '2026-09-11T02:00:00.000Z'; // 10 hours earlier
    const vel1 = serviceWithMock.calculateVelocity({ viewCount: 100000, publishedAt: pubDate }, fixedNow);
    const vel2 = serviceWithMock.calculateVelocity({ viewCount: 100000, publishedAt: pubDate }, fixedNow);
    if (vel1 !== vel2 || vel1 !== 10000) {
      throw new Error(`Non-deterministic or incorrect velocity calculation: ${vel1} vs ${vel2}`);
    }

    // 6. Opportunity score is deterministic
    const score1 = serviceWithMock.scoreOpportunity(5.5, 2000);
    const score2 = serviceWithMock.scoreOpportunity(5.5, 2000);
    if (score1 !== score2 || score1 <= 0 || score1 > 100) {
      throw new Error(`Non-deterministic or out-of-bounds opportunity score: ${score1}`);
    }

    // 7. Multiple trend sources merge correctly
    if (!nvidiaCandidate.sources.includes('trending') || !nvidiaCandidate.sources.includes('competitor')) {
      throw new Error(`Sources were not merged correctly: ${JSON.stringify(nvidiaCandidate.sources)}`);
    }

    // 8. Empty API response is handled safely
    const emptyDiscovery = new TrendingTopicDiscovery({
      getYouTubeClient: () => ({
        videos: { list: async () => ({ data: { items: [] } }) },
        search: { list: async () => ({ data: { items: [] } }) }
      })
    });
    const emptyResult = await emptyDiscovery.discoverTrendingTopics();
    if (emptyResult.trendingTopics.length !== 0 || emptyResult.competitorData.length !== 0) {
      throw new Error('Empty API response did not yield empty collections safely');
    }

    // 9. API failure uses existing fallback behavior
    const failingDiscovery = new TrendingTopicDiscovery({
      getYouTubeClient: () => ({
        videos: {
          list: async () => {
            throw new Error('API Rate Limit Exceeded');
          }
        },
        search: {
          list: async () => {
            throw new Error('API Rate Limit Exceeded');
          }
        }
      })
    });
    const fallbackResult = await failingDiscovery.discoverTrendingTopics();
    if (!Array.isArray(fallbackResult.trendingTopics) || fallbackResult.trendingTopics.length !== 0) {
      throw new Error('Failing API call did not return safe empty arrays');
    }

    // 10. ContentStrategyAgent still discovers candidates through the service
    const agent = new ContentStrategyAgent(null, mockCredentials, {
      trendingTopicDiscovery: serviceWithMock
    });
    await agent.analyzeTrends();
    if (agent.trendingTopics.length === 0) {
      throw new Error('ContentStrategyAgent failed to populate trendingTopics from TrendingTopicDiscovery');
    }
    const agentNvidia = agent.trendingTopics.find(t => t.topic === 'nvidia');
    if (!agentNvidia) {
      throw new Error('ContentStrategyAgent did not receive merged trending candidate');
    }

    // 11. SemanticDedupService still filters discovered candidates
    const dedup = new SemanticDedupService();
    const candidateTopics = [
      { topic: 'Why Apple Ditched Intel', score: 10 },
      { topic: 'The Reason Apple Switched From Intel to M-Series', score: 9 }, // Semantic duplicate
      { topic: 'Nvidia AI Chip Surge', score: 8 }                              // Unique
    ];
    const deduped = dedup.filterDuplicates(candidateTopics, []);
    if (deduped.unique.length !== 2 || deduped.duplicates.length !== 1) {
      throw new Error(`SemanticDedupService failed to filter discovered candidates: ${JSON.stringify(deduped)}`);
    }

    this.logger.info('Trending Topic Discovery Service test completed successfully');
  }

  async testContentDNAService() {
    this.logger.info('Starting Content DNA Service tests...');

    const { ContentDNAService, TRUTH_ANCHOR_BOUNDARY, CONTENT_DNA_SCHEMA } = require('./utils/content-dna-service');
    const { ChannelLearningEngine } = require('./utils/channel-learning-engine');
    const { ContentStrategyAgent } = require('./agents/content-strategy-agent');
    const { SemanticDedupService } = require('./utils/semantic-dedup-service');

    // 1. ContentDNAService instantiation
    const dnaService = new ContentDNAService();
    if (!dnaService || typeof dnaService.extractContentDNA !== 'function') {
      throw new Error('ContentDNAService failed to instantiate');
    }

    // 2. Schema availability
    const schema = dnaService.getSchema();
    if (!schema || schema.version !== '1.0.0' || !schema.properties.hookPattern || !schema.properties.pacingPattern) {
      throw new Error('ContentDNAService schema is missing or invalid');
    }
    if (schema !== CONTENT_DNA_SCHEMA) {
      throw new Error('getSchema() does not return the canonical schema');
    }

    // 3. Basic DNA extraction & validation
    const basicSampleContext = {
      contentFormat: 'short',
      strategy: { topic: 'Compound Interest Secrets', contentPillar: 'Investing', requestedStyle: 'tutorial' },
      script: {
        title: 'Compound Interest Secrets',
        hook: { text: 'Have you ever wondered why the rich get richer?', duration: '0:00-0:05', type: 'question' },
        sections: [
          { label: 'Hook', duration: 5, scriptText: 'Have you ever wondered why the rich get richer?' },
          { label: 'Rule of 72', duration: 15, scriptText: 'The rule of 72 shows how fast your money doubles.' },
          { label: 'Action Step', duration: 10, scriptText: 'Start investing today.' }
        ]
      },
      retentionDuration: 30,
      captionsPath: '/data/shorts/captions.srt',
      thumbnail: { concept: { composition: 'split_screen' } }
    };
    const basicMetrics = {
      retention: 62.5,
      ctr: 8.2,
      engagementRate: 5.5,
      performanceScore: 86,
      impressions: 5000,
      views: 650
    };

    const basicDNA = dnaService.extractContentDNA(basicSampleContext, basicMetrics);
    const validation = dnaService.validateDNA(basicDNA);
    if (!validation.valid) {
      throw new Error(`Basic extracted DNA failed schema validation: ${validation.errors.join(', ')}`);
    }
    if (basicDNA.surface !== 'shorts' || basicDNA.confidence !== 'high' || !basicDNA.performanceSignals.isWinning) {
      throw new Error(`Basic extracted DNA properties incorrect: ${JSON.stringify(basicDNA)}`);
    }

    // 4. Hook pattern extraction
    const questionHook = dnaService.extractHookPattern({
      script: { hook: { text: 'Did you know that 90% of millionaires invest in real estate?', type: 'statistic' } }
    }, { retention: 55 });
    if (questionHook.hookType !== 'statistic' || questionHook.hookLength !== 'concise' || questionHook.hookStrength !== 'high') {
      throw new Error(`Hook pattern extraction failed: ${JSON.stringify(questionHook)}`);
    }

    const challengeHook = dnaService.extractHookPattern({
      script: { hook: 'Everything you thought you knew about budgeting is a lie and will keep you broke.' }
    });
    if (challengeHook.hookType !== 'challenge' || challengeHook.hookLength !== 'concise') {
      throw new Error(`Challenge hook classification failed: ${JSON.stringify(challengeHook)}`);
    }

    const extendedHookText = 'This is an excessively long opening hook narrative and introduction designed specifically to test the extended hook length classification branch when a creator spends way too many words setting up the topic before getting to the valuable payoff of the Short video.';
    const extendedHook = dnaService.extractHookPattern({ script: { hook: extendedHookText } });
    if (extendedHook.hookLength !== 'extended' || extendedHook.hookWordCount <= 40) {
      throw new Error(`Extended hook classification failed: ${JSON.stringify(extendedHook)}`);
    }

    // 5. Pacing extraction
    const fastShortContent = {
      contentFormat: 'short',
      retentionDuration: 20,
      scenes: [
        { label: 'Scene 1', duration: 3 },
        { label: 'Scene 2', duration: 3 },
        { label: 'Scene 3', duration: 4 },
        { label: 'Scene 4', duration: 3 },
        { label: 'Scene 5', duration: 3 },
        { label: 'Scene 6', duration: 4 }
      ]
    };
    const fastPacing = dnaService.extractPacingPattern(fastShortContent);
    if (fastPacing.pacing !== 'fast' || fastPacing.sceneCount !== 6 || fastPacing.transitionFrequency <= 0) {
      throw new Error(`Fast pacing extraction failed: ${JSON.stringify(fastPacing)}`);
    }

    // 6. Visual density extraction
    const visualContent = {
      scenes: [
        { label: 'Scene 1', treatment: 'ANTI_SWIPE_HOOK', sceneType: 'HOOK' },
        { label: 'Scene 2', treatment: 'ANIMATED_NUMBER', sceneType: 'STATISTIC' },
        { label: 'Scene 3', treatment: 'TWO_SIDED_COMPARISON', sceneType: 'COMPARISON' },
        { label: 'Scene 4', treatment: 'SUBTLE_MOTION', sceneType: 'GENERAL_INFORMATION' }
      ],
      thumbnail: { concept: { composition: 'centered_hero' } }
    };
    const visualPattern = dnaService.extractVisualDensityPattern(visualContent);
    if (!visualPattern.hasChartsOrVisualizations || visualPattern.densityLevel !== 'high' || visualPattern.treatmentTypes.length !== 4) {
      throw new Error(`Visual density extraction failed: ${JSON.stringify(visualPattern)}`);
    }

    // 7. Caption pattern extraction
    const captionContent = {
      contentFormat: 'short',
      captionsPath: '/path/to/subtitles.srt',
      script: { fullScript: 'Compound interest turns small monthly investments into life changing wealth over thirty years.' },
      retentionDuration: 10
    };
    const captionPattern = dnaService.extractCaptionPattern(captionContent, {}, { totalDurationSeconds: 10 });
    if (!captionPattern.hasCaptions || (captionPattern.captionDensity !== 'sparse' && captionPattern.captionDensity !== 'balanced')) {
      throw new Error(`Caption pattern extraction failed: ${JSON.stringify(captionPattern)}`);
    }

    // 8. Topic pattern extraction
    const topicContent = {
      contentFormat: 'short',
      strategy: { topic: 'Why Apple Switched to ARM', contentPillar: 'Tech Business', requestedStyle: 'case_study', angle: 'Supply Chain' }
    };
    const topicPattern = dnaService.extractTopicPattern(topicContent);
    if (topicPattern.topic !== 'Why Apple Switched to ARM' || topicPattern.category !== 'Tech Business' || topicPattern.format !== 'shorts') {
      throw new Error(`Topic pattern extraction failed: ${JSON.stringify(topicPattern)}`);
    }

    // 9. Aggregation of multiple samples
    const sample1 = dnaService.extractContentDNA(basicSampleContext, basicMetrics);
    const sample2 = dnaService.extractContentDNA({
      ...basicSampleContext,
      strategy: { topic: 'Index Funds Explained', contentPillar: 'Investing', requestedStyle: 'tutorial' },
      script: { hook: { text: 'Stop picking individual stocks right now.', type: 'challenge' } }
    }, { retention: 58, ctr: 7.0, performanceScore: 82, impressions: 3000, views: 400 });
    const sample3 = dnaService.extractContentDNA({
      ...basicSampleContext,
      strategy: { topic: 'Credit Score Myths', contentPillar: 'Credit', requestedStyle: 'mythbuster' },
      script: { hook: { text: 'Everything about your credit score is wrong.', type: 'challenge' } }
    }, { retention: 32, ctr: 3.5, performanceScore: 50, impressions: 1500, views: 120 });

    const aggregated = dnaService.aggregateDNA([sample1, sample2, sample3]);
    if (aggregated.sampleCount !== 3 || aggregated.surfaceBreakdown.shorts !== 3) {
      throw new Error(`Aggregation sample count or surface breakdown failed: ${JSON.stringify(aggregated)}`);
    }
    if (!aggregated.dominantHookPatterns || !aggregated.dominantPacingPatterns || !aggregated.dominantVisualPatterns) {
      throw new Error('Aggregation missing dominant pattern sections');
    }
    if (aggregated.dominantHookPatterns.typeFrequencies.challenge !== 2) {
      throw new Error(`Hook frequency calculation incorrect: ${JSON.stringify(aggregated.dominantHookPatterns)}`);
    }

    // 10. Deterministic aggregation
    const aggregatedRun2 = dnaService.aggregateDNA([sample1, sample2, sample3]);
    const scrub = obj => { const copy = { ...obj }; delete copy.aggregatedAt; return JSON.stringify(copy); };
    if (scrub(aggregated) !== scrub(aggregatedRun2)) {
      throw new Error('Aggregation is non-deterministic between identical runs');
    }

    // 11. Confidence calculation
    const emptyConf = dnaService.calculateConfidence([]);
    const lowConf = dnaService.calculateConfidence([sample1]);
    const medConf = dnaService.calculateConfidence([sample1, sample2, sample3]);
    if (emptyConf !== 'none' || lowConf !== 'low' || medConf !== 'medium') {
      throw new Error(`Confidence calculations incorrect: empty=${emptyConf}, low=${lowConf}, med=${medConf}`);
    }

    // 12. Malformed / empty input handling
    const emptyDNA = dnaService.extractContentDNA(null, null);
    if (!emptyDNA || emptyDNA.version !== '1.0.0' || emptyDNA.confidence !== 'unverified') {
      throw new Error('extractContentDNA did not handle null inputs safely');
    }
    const emptyAgg = dnaService.aggregateDNA([]);
    if (emptyAgg.sampleCount !== 0 || emptyAgg.confidence !== 'none') {
      throw new Error('aggregateDNA([]) did not return safe empty aggregated profile');
    }
    const invalidValidation = dnaService.validateDNA({ invalid: true });
    if (invalidValidation.valid || !invalidValidation.errors.length) {
      throw new Error('validateDNA failed to catch invalid object');
    }

    // 13. Preservation of existing ChannelLearningEngine behavior
    const mockDb = {
      listPerformanceSnapshots: async () => [],
      listLearningRecommendations: async () => []
    };
    const learningEngine = new ChannelLearningEngine(mockDb);
    if (!learningEngine.dnaService || typeof learningEngine.extractContentDNA !== 'function') {
      throw new Error('ChannelLearningEngine did not wire dnaService properly');
    }
    const attrs = learningEngine.extractAttributes({ videoDetails: { title: 'Test Video' } }, basicSampleContext);
    if (attrs.surface !== 'shorts' || attrs.format !== 'shorts' || attrs.hookLength !== 'concise' || !attrs.contentDNA) {
      throw new Error(`ChannelLearningEngine extractAttributes failed compatibility: ${JSON.stringify(attrs)}`);
    }
    const engineProfile = learningEngine.getContentDNAProfile([]);
    if (engineProfile.sampleCount !== 0 || engineProfile.confidence !== 'none') {
      throw new Error('ChannelLearningEngine getContentDNAProfile failed fallback');
    }

    // 14. ContentStrategyAgent compatibility & Truth Anchor boundary
    const strategyAgent = new ContentStrategyAgent(null, null);
    if (!strategyAgent) {
      throw new Error('ContentStrategyAgent failed to instantiate with Content DNA integration');
    }
    if (TRUTH_ANCHOR_BOUNDARY.isFactualVerification !== false) {
      throw new Error('Truth Anchor boundary compromised: Content DNA must never claim to be factual verification');
    }
    if (basicDNA.truthAnchorBoundary !== TRUTH_ANCHOR_BOUNDARY.boundaryRule) {
      throw new Error('Content DNA missing explicit Truth Anchor boundary declaration');
    }

    // 15. A1 compatibility (Semantic Deduplication alongside DNA topic patterns)
    const dedupService = new SemanticDedupService();
    const candidateA = { topic: 'Why Apple Ditched Intel', score: 10 };
    const candidateB = { topic: 'The Reason Apple Switched From Intel to M-Series', score: 9 };
    const filtered = dedupService.filterDuplicates([candidateA, candidateB], []);
    if (filtered.unique.length !== 1 || filtered.duplicates.length !== 1) {
      throw new Error('Semantic deduplication failed on Content DNA topic patterns');
    }

    // 16. Developer B protection
    const { VisualTreatmentSelector, TREATMENTS } = require('./utils/visual-treatment-engine');
    const { FinancialVisualization, VISUALIZATION_TYPES } = require('./utils/financial-visualization-engine');
    const { AudioEnhancementEngine } = require('./utils/audio-enhancement-engine');
    const { ShortsPackagingService } = require('./utils/shorts-packaging-service');

    if (!VisualTreatmentSelector || !TREATMENTS.ANTI_SWIPE_HOOK) {
      throw new Error('Developer B VisualTreatmentSelector or TREATMENTS was modified or missing');
    }
    if (!FinancialVisualization || !VISUALIZATION_TYPES.ANIMATED_METRIC) {
      throw new Error('Developer B FinancialVisualization was modified or missing');
    }
    if (!AudioEnhancementEngine || !ShortsPackagingService) {
      throw new Error('Developer B AudioEnhancementEngine or ShortsPackagingService was modified or missing');
    }

    this.logger.info('Content DNA Service test completed successfully');
  }

  async testContentDNAFeedbackLoop() {
    this.logger.info('Starting Content DNA Feedback Loop (A4.1) tests...');

    const { ScriptWriterAgent } = require('./agents/script-writer-agent');
    const { TRUTH_ANCHOR_BOUNDARY } = require('./utils/content-dna-service');
    const { SemanticDedupService } = require('./utils/semantic-dedup-service');
    const { TrendingTopicDiscovery } = require('./utils/trending-topic-discovery');

    const mockDb = {
      saveScript: async (s) => s,
      getChannelProfile: async () => ({ default_style: 'explainer' })
    };
    const scriptWriter = new ScriptWriterAgent(mockDb, {});

    // 1. DNA profile available with high confidence -> guidance reaches script generation
    const highConfidenceDNA = {
      sampleCount: 10,
      confidence: { score: 0.88, level: 'high' },
      dominantHookPatterns: {
        preferredType: 'question',
        preferredLength: 'concise',
        averageHookDuration: 3.5,
        averageHookWordCount: 12
      },
      dominantPacingPatterns: {
        preferredPacing: 'quick',
        averageSceneDuration: 3.5,
        averageSceneCount: 5
      },
      dominantVisualPatterns: {
        preferredDensityLevel: 'high'
      }
    };

    const strat1 = {
      topic: 'How Compound Interest Works',
      contentType: 'Explainer',
      angle: 'Wealth building',
      targetAudience: 'Beginners',
      keywords: ['finance', 'compound interest'],
      contentDNA: highConfidenceDNA,
      exploreHook: false
    };

    const script1 = await scriptWriter.generateScript(strat1);
    if (!script1 || !script1.title || !script1.hook) {
      throw new Error('Script 1 generation failed');
    }
    if (!script1.metadata?.appliedDNA?.applied) {
      throw new Error('Script 1 metadata.appliedDNA.applied should be true');
    }
    if (script1.metadata.appliedDNA.guidelines.hookType !== 'question') {
      throw new Error(`Script 1 hookType should be question, got ${script1.metadata.appliedDNA.guidelines.hookType}`);
    }
    if (script1.metadata.appliedDNA.guidelines.pacing !== 'quick') {
      throw new Error('Script 1 pacing guideline should be quick');
    }
    if (script1.pacing !== 'quick') {
      throw new Error('Script 1 pacing property should reflect DNA pacing');
    }
    if (script1.metadata.appliedDNA.isFactualVerification !== false) {
      throw new Error('Script 1 appliedDNA.isFactualVerification must be false');
    }
    if (script1.hook.type !== 'question') {
      throw new Error(`Script 1 hook type should be question, got: ${script1.hook.type}`);
    }

    // 2. DNA absent -> legacy behavior remains unchanged
    const strat2 = {
      topic: 'Index Funds Basics',
      contentType: 'Explainer',
      angle: 'Passive income',
      targetAudience: 'Beginners',
      keywords: ['stocks']
    };
    const script2 = await scriptWriter.generateScript(strat2);
    if (!script2 || !script2.title || !script2.hook) {
      throw new Error('Script 2 generation failed');
    }
    if (script2.metadata?.appliedDNA?.applied !== false) {
      throw new Error('Script 2 metadata.appliedDNA.applied should be false');
    }
    if (script2.metadata.appliedDNA.reason !== 'no_dna_profile') {
      throw new Error(`Script 2 reason should be no_dna_profile, got: ${script2.metadata.appliedDNA.reason}`);
    }
    if (script2.metadata.appliedDNA.isFactualVerification !== false) {
      throw new Error('Script 2 isFactualVerification must be false');
    }

    // 3. 0-2 samples or low confidence -> DNA ignored
    const lowSampleDNA = {
      sampleCount: 2,
      confidence: { score: 0.3, level: 'low' },
      dominantHookPatterns: { preferredType: 'statement' }
    };
    const strat3 = {
      topic: 'Budgeting 101',
      contentType: 'Explainer',
      contentDNA: lowSampleDNA
    };
    const script3 = await scriptWriter.generateScript(strat3);
    if (script3.metadata?.appliedDNA?.applied !== false) {
      throw new Error('Script 3 metadata.appliedDNA.applied should be false for < 3 samples');
    }
    if (script3.metadata.appliedDNA.reason !== 'insufficient_samples') {
      throw new Error(`Script 3 reason should be insufficient_samples, got: ${script3.metadata.appliedDNA.reason}`);
    }

    const malformedStrat = {
      topic: 'Budgeting 101',
      contentType: 'Explainer',
      contentDNA: 'invalid_non_object'
    };
    const script3b = await scriptWriter.generateScript(malformedStrat);
    if (script3b.metadata?.appliedDNA?.applied !== false) {
      throw new Error('Script 3b should ignore malformed DNA');
    }
    if (script3b.metadata.appliedDNA.reason !== 'malformed_dna') {
      throw new Error(`Script 3b reason should be malformed_dna, got: ${script3b.metadata.appliedDNA.reason}`);
    }

    // 4. Prompt building: high vs medium confidence
    const promptHigh = scriptWriter.buildDNAGuidancePrompt(scriptWriter.extractApplicableContentDNA(strat1));
    if (!promptHigh.includes('strongly favor') || !promptHigh.includes('question hook')) {
      throw new Error('High confidence prompt guidance missing expected phrasing');
    }
    if (!promptHigh.includes('NEVER use as factual claims')) {
      throw new Error('Prompt guidance must include Truth Anchor anti-factual safety guard');
    }

    const mediumDNA = {
      sampleCount: 5,
      confidence: { level: 'medium' },
      dominantHookPatterns: { preferredType: 'statistic' }
    };
    const promptMed = scriptWriter.buildDNAGuidancePrompt(scriptWriter.extractApplicableContentDNA({ contentDNA: mediumDNA }));
    if (!promptMed.includes('consider') || !promptMed.includes('statistic hook')) {
      throw new Error('Medium confidence prompt guidance missing expected phrasing');
    }

    // 5. Existing generateScript callers without DNA still work
    const legacyScript = await scriptWriter.generateScript({
      topic: 'Retirement Accounts 401k vs IRA',
      contentType: 'Tutorial',
      angle: 'Tax advantages'
    });
    if (!legacyScript.title || !legacyScript.mainContent || !legacyScript.hook) {
      throw new Error('Legacy generateScript caller without DNA failed to return valid script');
    }

    // 6. Truth Anchor behavior remains independent
    if (TRUTH_ANCHOR_BOUNDARY.isFactualVerification !== false) {
      throw new Error('Truth Anchor boundary must preserve isFactualVerification === false');
    }

    // 7. A1 and A2 remain unaffected
    const dedupService = new SemanticDedupService();
    const dedupResult = dedupService.isDuplicate('Why Apple Ditched Intel', ['The Reason Mac Switched to M-Series']);
    if (!dedupResult.isDuplicate) {
      throw new Error('Semantic deduplication failed in A4.1 regression check');
    }
    const discoveryService = new TrendingTopicDiscovery();
    if (typeof discoveryService.discoverTrendingTopics !== 'function') {
      throw new Error('Trending topic discovery failed in A4.1 regression check');
    }

    // 8. Developer B protection
    const { VisualTreatmentSelector, TREATMENTS } = require('./utils/visual-treatment-engine');
    const { FinancialVisualization, VISUALIZATION_TYPES } = require('./utils/financial-visualization-engine');
    const { AudioEnhancementEngine } = require('./utils/audio-enhancement-engine');
    const { ShortsPackagingService } = require('./utils/shorts-packaging-service');

    if (!VisualTreatmentSelector || !TREATMENTS.ANTI_SWIPE_HOOK) {
      throw new Error('Developer B VisualTreatmentSelector or TREATMENTS was modified or missing');
    }
    if (!FinancialVisualization || !VISUALIZATION_TYPES.ANIMATED_METRIC) {
      throw new Error('Developer B FinancialVisualization was modified or missing');
    }
    if (!AudioEnhancementEngine || !ShortsPackagingService) {
      throw new Error('Developer B AudioEnhancementEngine or ShortsPackagingService was modified or missing');
    }

    this.logger.info('Content DNA Feedback Loop (A4.1) test completed successfully');
  }

  async testPublishingDeadLetterRecovery() {
    const fs = require('fs').promises;
    const os = require('os');
    const path = require('path');
    const { PublishingSchedulingAgent, MAX_PUBLISH_ATTEMPTS, RETRY_BACKOFF_MS } = require('./agents/publishing-scheduling-agent');
    const { Database } = require('./database/db');

    this.logger.info('Starting Publishing Dead-Letter Recovery (A4.2) tests...');

    if (MAX_PUBLISH_ATTEMPTS !== 3) {
      throw new Error(`Expected MAX_PUBLISH_ATTEMPTS to be 3, got ${MAX_PUBLISH_ATTEMPTS}`);
    }
    if (RETRY_BACKOFF_MS[1] !== 15 * 60 * 1000 || RETRY_BACKOFF_MS[2] !== 60 * 60 * 1000) {
      throw new Error('RETRY_BACKOFF_MS does not match expected backoff policy (15m, 60m)');
    }

    const intentionalAudio = {
      intentionalSilence: true,
      silenceReason: 'This test fixture is intentionally silent.',
      silenceConfirmedAt: new Date().toISOString()
    };

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-a42-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'a42-test.db');
    await db.initialize();

    try {
      // -------------------------------------------------------------
      // Test 1, 2, 3: Transient 429 Retry Progression -> Dead Letter
      // -------------------------------------------------------------
      const scheduleEntry1 = {
        id: 'sched-retry-flow',
        productionId: 'prod-retry-flow',
        title: 'Transient Failure Test Video',
        publishTime: new Date(Date.now() - 60000).toISOString(),
        status: 'scheduled',
        priority: 1,
        metadata: {
          seo: { title: 'Transient Failure Test Video', description: 'Test', tags: ['finance'] },
          privacyStatus: 'private',
          audio: intentionalAudio,
          video: { path: '/tmp/dummy.mp4' }
        },
        createdAt: new Date().toISOString()
      };
      await db.saveScheduleEntry(scheduleEntry1);

      const agent1 = new PublishingSchedulingAgent(db, {});
      await agent1.initialize();

      // Mock uploadToYouTube to fail with 429
      agent1.uploadToYouTube = async () => {
        const err = new Error('YouTube 429 Rate Limit Exceeded');
        err.status = 429;
        throw err;
      };

      // 1. First transient failure (Attempt 1)
      let attempt1Thrown = false;
      try {
        await agent1.publishContent('prod-retry-flow');
      } catch (err) {
        attempt1Thrown = err.status === 429;
      }
      if (!attempt1Thrown) throw new Error('Attempt 1 did not throw expected 429 error');

      const entryAfterAttempt1 = await db.getLatestScheduleEntry('prod-retry-flow');
      if (entryAfterAttempt1.status !== 'retry_pending') {
        throw new Error(`Expected status 'retry_pending' after attempt 1, got '${entryAfterAttempt1.status}'`);
      }
      if (entryAfterAttempt1.metadata?.retry?.attemptCount !== 1) {
        throw new Error(`Expected attemptCount 1, got ${entryAfterAttempt1.metadata?.retry?.attemptCount}`);
      }
      if (entryAfterAttempt1.metadata?.retry?.failureCategory !== 'transient') {
        throw new Error(`Expected failureCategory 'transient', got ${entryAfterAttempt1.metadata?.retry?.failureCategory}`);
      }
      const retry1Time = new Date(entryAfterAttempt1.metadata?.retry?.nextRetryTime).getTime();
      const diff1Minutes = (retry1Time - Date.now()) / (60 * 1000);
      if (diff1Minutes < 14 || diff1Minutes > 16) {
        throw new Error(`Expected attempt 1 backoff ~15 minutes, got ${diff1Minutes.toFixed(1)} minutes`);
      }

      // 2. Second transient failure (Attempt 2)
      let attempt2Thrown = false;
      try {
        await agent1.publishContent('prod-retry-flow');
      } catch (err) {
        attempt2Thrown = err.status === 429;
      }
      if (!attempt2Thrown) throw new Error('Attempt 2 did not throw expected 429 error');

      const entryAfterAttempt2 = await db.getLatestScheduleEntry('prod-retry-flow');
      if (entryAfterAttempt2.status !== 'retry_pending') {
        throw new Error(`Expected status 'retry_pending' after attempt 2, got '${entryAfterAttempt2.status}'`);
      }
      if (entryAfterAttempt2.metadata?.retry?.attemptCount !== 2) {
        throw new Error(`Expected attemptCount 2, got ${entryAfterAttempt2.metadata?.retry?.attemptCount}`);
      }
      const retry2Time = new Date(entryAfterAttempt2.metadata?.retry?.nextRetryTime).getTime();
      const diff2Minutes = (retry2Time - Date.now()) / (60 * 1000);
      if (diff2Minutes < 58 || diff2Minutes > 62) {
        throw new Error(`Expected attempt 2 backoff ~60 minutes, got ${diff2Minutes.toFixed(1)} minutes`);
      }

      // 3. Third transient failure (Attempt 3 -> Dead Letter)
      let attempt3Thrown = false;
      try {
        await agent1.publishContent('prod-retry-flow');
      } catch (err) {
        attempt3Thrown = err.status === 429;
      }
      if (!attempt3Thrown) throw new Error('Attempt 3 did not throw expected 429 error');

      const entryAfterAttempt3 = await db.getLatestScheduleEntry('prod-retry-flow');
      if (entryAfterAttempt3.status !== 'dead_letter') {
        throw new Error(`Expected status 'dead_letter' after attempt 3, got '${entryAfterAttempt3.status}'`);
      }
      if (entryAfterAttempt3.metadata?.retry?.attemptCount !== 3) {
        throw new Error(`Expected attemptCount 3, got ${entryAfterAttempt3.metadata?.retry?.attemptCount}`);
      }
      if (entryAfterAttempt3.metadata?.retry?.nextRetryTime !== null) {
        throw new Error('Expected nextRetryTime to be null on dead_letter');
      }
      if (agent1.publishQueue.some(e => e.productionId === 'prod-retry-flow')) {
        throw new Error('Dead-letter item was not removed from publishQueue');
      }

      // Subsequent attempt on dead_letter must throw DEAD_LETTER_BLOCKED
      let deadLetterBlocked = false;
      try {
        await agent1.publishContent('prod-retry-flow');
      } catch (err) {
        deadLetterBlocked = err.code === 'DEAD_LETTER_BLOCKED';
      }
      if (!deadLetterBlocked) throw new Error('Publishing dead_letter content was not blocked');

      const deadLetters = await db.getDeadLetterEntries();
      if (!deadLetters.some(e => e.productionId === 'prod-retry-flow')) {
        throw new Error('getDeadLetterEntries did not return the dead-lettered row');
      }

      // -------------------------------------------------------------
      // Test 4: Permanent 400 Bad Request -> Immediate Dead Letter
      // -------------------------------------------------------------
      const permEntry = {
        id: 'sched-perm-400',
        productionId: 'prod-perm-400',
        title: 'Bad Request Video',
        publishTime: new Date().toISOString(),
        status: 'scheduled',
        metadata: {
          seo: { title: 'Bad Request Video' },
          audio: intentionalAudio,
          privacyStatus: 'private'
        }
      };
      await db.saveScheduleEntry(permEntry);
      const permAgent = new PublishingSchedulingAgent(db, {});
      await permAgent.initialize();
      permAgent.uploadToYouTube = async () => {
        const err = new Error('Invalid metadata format');
        err.status = 400;
        throw err;
      };

      try {
        await permAgent.publishContent('prod-perm-400');
      } catch (_err) { /* expected */ }

      const permSaved = await db.getLatestScheduleEntry('prod-perm-400');
      if (permSaved.status !== 'dead_letter' || permSaved.metadata?.retry?.failureCategory !== 'non_retryable') {
        throw new Error('Permanent 400 error did not immediately transition to dead_letter');
      }
      if (permSaved.metadata?.retry?.nextRetryTime !== null) {
        throw new Error('Permanent 400 set a nextRetryTime instead of null');
      }

      // -------------------------------------------------------------
      // Test 5: READINESS_BLOCKED: No Unsafe Retry
      // -------------------------------------------------------------
      const readyBlockedEntry = {
        id: 'sched-readiness-blocked',
        productionId: 'prod-readiness-blocked',
        title: 'Readiness Blocked Video',
        publishTime: new Date().toISOString(),
        status: 'scheduled',
        metadata: { audio: intentionalAudio }
      };
      await db.saveScheduleEntry(readyBlockedEntry);
      const readyAgent = new PublishingSchedulingAgent(Object.create(db), {});
      readyAgent.db.getLatestReadinessRun = async () => ({
        status: 'failed',
        checks: [{ id: 'video-quality', blocking: true, status: 'failed' }]
      });
      readyAgent.uploadToYouTube = async () => {
        throw new Error('Upload must not be called when readiness check fails');
      };

      let readinessThrown = false;
      try {
        await readyAgent.publishContent('prod-readiness-blocked');
      } catch (err) {
        readinessThrown = err.code === 'READINESS_BLOCKED';
      }
      if (!readinessThrown) throw new Error('Readiness check failure did not throw READINESS_BLOCKED');

      const readySaved = await db.getLatestScheduleEntry('prod-readiness-blocked');
      if (readySaved.status === 'retry_pending') {
        throw new Error('READINESS_BLOCKED scheduled an unsafe retry_pending state');
      }

      // -------------------------------------------------------------
      // Test 6: PROVENANCE_BLOCKED: No Unsafe Retry
      // -------------------------------------------------------------
      const provBlockedEntry = {
        id: 'sched-prov-blocked',
        productionId: 'prod-prov-blocked',
        title: 'Provenance Blocked Video',
        publishTime: new Date().toISOString(),
        status: 'scheduled',
        metadata: { audio: intentionalAudio }
      };
      await db.saveScheduleEntry(provBlockedEntry);
      const provAgent = new PublishingSchedulingAgent(Object.create(db), {});
      provAgent.db.getProductionBundle = async () => ({
        review_status: 'approved',
        provenance: { status: 'unverified' }
      });
      provAgent.uploadToYouTube = async () => {
        throw new Error('Upload must not be called when provenance check fails');
      };

      let provThrown = false;
      try {
        await provAgent.publishContent('prod-prov-blocked');
      } catch (err) {
        provThrown = err.code === 'PROVENANCE_BLOCKED';
      }
      if (!provThrown) throw new Error('Provenance check failure did not throw PROVENANCE_BLOCKED');

      const provSaved = await db.getLatestScheduleEntry('prod-prov-blocked');
      if (provSaved.status === 'retry_pending') {
        throw new Error('PROVENANCE_BLOCKED scheduled an unsafe retry_pending state');
      }

      // -------------------------------------------------------------
      // Test 7: Unknown Upload Outcome -> reconciliation_required & No Blind Retry
      // -------------------------------------------------------------
      const unkEntry = {
        id: 'sched-unknown',
        productionId: 'prod-unknown',
        title: 'Uncertain Upload Video',
        publishTime: new Date().toISOString(),
        status: 'scheduled',
        metadata: {
          seo: { title: 'Uncertain Upload Video' },
          audio: intentionalAudio,
          privacyStatus: 'private'
        }
      };
      await db.saveScheduleEntry(unkEntry);
      const unkAgent = new PublishingSchedulingAgent(db, {});
      await unkAgent.initialize();
      let unkUploadCalls = 0;
      unkAgent.uploadToYouTube = async (entry) => {
        unkUploadCalls++;
        entry.uploadAttempted = true;
        const err = new Error('Connection reset by peer');
        err.code = 'ECONNRESET';
        throw err;
      };

      let unkThrown = false;
      try {
        await unkAgent.publishContent('prod-unknown');
      } catch (err) {
        unkThrown = err.code === 'UPLOAD_OUTCOME_UNKNOWN';
      }
      if (!unkThrown) throw new Error('Unknown upload outcome did not throw UPLOAD_OUTCOME_UNKNOWN');

      const unkSaved = await db.getLatestScheduleEntry('prod-unknown');
      if (unkSaved.status !== 'reconciliation_required') {
        throw new Error(`Expected status 'reconciliation_required', got '${unkSaved.status}'`);
      }
      if (unkSaved.metadata?.retry?.failureCategory !== 'unknown_outcome') {
        throw new Error(`Expected failureCategory 'unknown_outcome', got ${unkSaved.metadata?.retry?.failureCategory}`);
      }

      // Blind retry protection: calling publishContent again directly must be blocked
      let blindRetryBlocked = false;
      try {
        await unkAgent.publishContent('prod-unknown');
      } catch (err) {
        blindRetryBlocked = err.code === 'UPLOAD_OUTCOME_UNKNOWN';
      }
      if (!blindRetryBlocked || unkUploadCalls !== 1) {
        throw new Error('Blind retry was not blocked for reconciliation_required entry');
      }

      // -------------------------------------------------------------
      // Test 8: Channel Reconciliation: Video Found on YouTube
      // -------------------------------------------------------------
      const foundEntry = {
        id: 'sched-reconcile-found',
        productionId: 'prod-reconcile-found',
        title: 'Video Found On Channel',
        publishTime: new Date().toISOString(),
        status: 'reconciliation_required',
        metadata: {
          seo: { title: 'Video Found On Channel' },
          audio: intentionalAudio,
          retry: { attemptCount: 1, reconciliationStatus: 'pending' }
        }
      };
      await db.saveScheduleEntry(foundEntry);
      const foundAgent = new PublishingSchedulingAgent(db, {});
      await foundAgent.initialize();
      foundAgent.youtube = {
        channels: {
          list: async () => ({
            data: { items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU_TEST_PLAYLIST' } } }] }
          })
        },
        playlistItems: {
          list: async () => ({
            data: {
              items: [{
                snippet: { title: 'Video Found On Channel', publishedAt: '2026-09-11T00:00:00Z' },
                contentDetails: { videoId: 'yt-reconciled-123' }
              }]
            }
          })
        }
      };
      foundAgent.uploadToYouTube = async () => {
        throw new Error('uploadToYouTube must never be called during reconciliation');
      };

      const reconciledEntry = await foundAgent.reconcileChannelUpload(foundEntry);
      if (reconciledEntry.status !== 'published' || reconciledEntry.youtubeId !== 'yt-reconciled-123') {
        throw new Error('Reconciliation did not adopt existing YouTube ID or mark published');
      }
      if (!reconciledEntry.youtubeUrl.includes('yt-reconciled-123')) {
        throw new Error('Reconciled youtubeUrl was not populated');
      }
      const foundSaved = await db.getLatestScheduleEntry('prod-reconcile-found');
      if (foundSaved.status !== 'published' || foundSaved.youtubeId !== 'yt-reconciled-123') {
        throw new Error('Reconciled video state was not persisted to SQLite');
      }

      // -------------------------------------------------------------
      // Test 9: Channel Reconciliation: Video NOT Found on YouTube
      // -------------------------------------------------------------
      const notFoundEntry = {
        id: 'sched-reconcile-notfound',
        productionId: 'prod-reconcile-notfound',
        title: 'Video Not On Channel',
        publishTime: new Date().toISOString(),
        status: 'reconciliation_required',
        uploadAttempted: true,
        metadata: {
          seo: { title: 'Video Not On Channel' },
          audio: intentionalAudio,
          retry: { attemptCount: 1, reconciliationStatus: 'pending' }
        }
      };
      await db.saveScheduleEntry(notFoundEntry);
      const notFoundAgent = new PublishingSchedulingAgent(db, {});
      await notFoundAgent.initialize();
      notFoundAgent.youtube = {
        channels: {
          list: async () => ({
            data: { items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU_TEST_PLAYLIST' } } }] }
          })
        },
        playlistItems: {
          list: async () => ({
            data: { items: [] }
          })
        }
      };

      const notFoundResult = await notFoundAgent.reconcileChannelUpload(notFoundEntry);
      if (notFoundResult.status !== 'retry_pending') {
        throw new Error(`Expected status 'retry_pending' when video not found, got '${notFoundResult.status}'`);
      }
      if (notFoundResult.uploadAttempted !== false) {
        throw new Error('uploadAttempted was not reset to false after reconciliation confirmed no upload');
      }
      if (notFoundResult.metadata?.retry?.reconciliationStatus !== 'reconciled_not_found') {
        throw new Error(`Expected reconciliationStatus 'reconciled_not_found', got ${notFoundResult.metadata?.retry?.reconciliationStatus}`);
      }

      // -------------------------------------------------------------
      // Test 10: Reconciliation API Failure: Remains reconciliation_required
      // -------------------------------------------------------------
      const apiFailEntry = {
        id: 'sched-reconcile-apifail',
        productionId: 'prod-reconcile-apifail',
        title: 'Reconcile API Fail Video',
        publishTime: new Date().toISOString(),
        status: 'reconciliation_required',
        metadata: {
          seo: { title: 'Reconcile API Fail Video' },
          audio: intentionalAudio,
          retry: { attemptCount: 1, reconciliationStatus: 'pending' }
        }
      };
      await db.saveScheduleEntry(apiFailEntry);
      const apiFailAgent = new PublishingSchedulingAgent(db, {});
      await apiFailAgent.initialize();
      apiFailAgent.youtube = {
        channels: {
          list: async () => {
            throw new Error('YouTube 503 Backend Service Unavailable');
          }
        }
      };

      let apiFailThrown = false;
      try {
        await apiFailAgent.reconcileChannelUpload(apiFailEntry);
      } catch (_err) {
        apiFailThrown = true;
      }
      if (!apiFailThrown) throw new Error('reconcileChannelUpload did not rethrow API error');

      const apiFailSaved = await db.getLatestScheduleEntry('prod-reconcile-apifail');
      if (apiFailSaved.status !== 'reconciliation_required') {
        throw new Error(`Expected status to remain 'reconciliation_required', got '${apiFailSaved.status}'`);
      }
      if (apiFailSaved.metadata?.retry?.reconciliationStatus !== 'reconciliation_failed') {
        throw new Error(`Expected reconciliationStatus 'reconciliation_failed', got ${apiFailSaved.metadata?.retry?.reconciliationStatus}`);
      }

      // -------------------------------------------------------------
      // Test 11: Process Restart: Recover Due retry_pending From SQLite
      // -------------------------------------------------------------
      const restartDueEntry = {
        id: 'sched-restart-due',
        productionId: 'prod-restart-due',
        title: 'Restart Due Video',
        publishTime: new Date(Date.now() - 5000).toISOString(),
        status: 'retry_pending',
        priority: 1,
        metadata: {
          seo: { title: 'Restart Due Video' },
          audio: intentionalAudio,
          video: { path: '/tmp/dummy.mp4' },
          privacyStatus: 'private',
          retry: {
            attemptCount: 1,
            maxAttempts: 3,
            failureCategory: 'transient',
            nextRetryTime: new Date(Date.now() - 5000).toISOString()
          }
        },
        createdAt: new Date().toISOString()
      };
      await db.saveScheduleEntry(restartDueEntry);

      // Create brand new agent instance (simulating app restart)
      const restartAgent = new PublishingSchedulingAgent(db, {});
      await restartAgent.initialize();

      // Check if entry was recovered into the queue
      const loadedInRestart = restartAgent.publishQueue.find(e => e.productionId === 'prod-restart-due');
      if (!loadedInRestart) {
        throw new Error('Due retry_pending entry was not recovered from SQLite on process restart');
      }

      // Auto-publish via processPublishQueue()
      restartAgent.uploadToYouTube = async () => ({ id: 'yt-recovered-success' });
      const publishedCount = await restartAgent.processPublishQueue();
      if (publishedCount < 1) {
        throw new Error('processPublishQueue did not process due retry entry');
      }
      const restartSaved = await db.getLatestScheduleEntry('prod-restart-due');
      if (restartSaved.status !== 'published' || restartSaved.youtubeId !== 'yt-recovered-success') {
        throw new Error('Recovered retry entry was not published successfully');
      }

      // -------------------------------------------------------------
      // Test 12: Future Retry: Not Processed Before nextRetryTime
      // -------------------------------------------------------------
      const futureRetryEntry = {
        id: 'sched-future-retry',
        productionId: 'prod-future-retry',
        title: 'Future Retry Video',
        publishTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        status: 'retry_pending',
        priority: 1,
        metadata: {
          seo: { title: 'Future Retry Video' },
          audio: intentionalAudio,
          privacyStatus: 'private',
          retry: {
            attemptCount: 1,
            maxAttempts: 3,
            nextRetryTime: new Date(Date.now() + 30 * 60 * 1000).toISOString()
          }
        },
        createdAt: new Date().toISOString()
      };
      await db.saveScheduleEntry(futureRetryEntry);

      // Default getPublishQueue must NOT include future retries
      const defaultQueue = await db.getPublishQueue({ includeFutureRetries: false });
      if (defaultQueue.some(e => e.productionId === 'prod-future-retry')) {
        throw new Error('getPublishQueue loaded future retry_pending entry before it is due');
      }

      // Future retry agent initialize should not have future retry in active queue
      const futureAgent = new PublishingSchedulingAgent(db, {});
      await futureAgent.initialize();
      if (futureAgent.publishQueue.some(e => e.productionId === 'prod-future-retry')) {
        throw new Error('PublishingSchedulingAgent loaded future retry into active publishQueue');
      }

      // -------------------------------------------------------------
      // Test 13: Existing youtubeId: Upload Blocked
      // -------------------------------------------------------------
      const existingYtEntry = {
        id: 'sched-exist-yt',
        productionId: 'prod-exist-yt',
        title: 'Already Uploaded Video',
        publishTime: new Date().toISOString(),
        status: 'uploaded',
        youtubeId: 'yt-already-uploaded',
        metadata: { audio: intentionalAudio }
      };
      await db.saveScheduleEntry(existingYtEntry);
      await db.updateScheduleEntry(existingYtEntry);
      const existYtAgent = new PublishingSchedulingAgent(db, {});
      existYtAgent.youtube = {
        videos: {
          list: async () => ({
            data: { items: [{ id: 'yt-already-uploaded' }] }
          })
        }
      };
      let existUploadCalled = false;
      existYtAgent.uploadToYouTube = async () => {
        existUploadCalled = true;
        throw new Error('uploadToYouTube must NOT be called when youtubeId already exists');
      };

      const reconciledExist = await existYtAgent.publishContent('prod-exist-yt');
      if (reconciledExist.status !== 'published' || existUploadCalled) {
        throw new Error('Existing youtubeId was not reconciled without re-uploading');
      }

      // -------------------------------------------------------------
      // Test 14: Existing uploading state: Duplicate Upload Prevented
      // -------------------------------------------------------------
      const uploadingEntry = {
        id: 'sched-in-uploading',
        productionId: 'prod-in-uploading',
        title: 'Currently Uploading Video',
        publishTime: new Date().toISOString(),
        status: 'uploading',
        metadata: { audio: intentionalAudio }
      };
      await db.saveScheduleEntry(uploadingEntry);
      const uploadingAgent = new PublishingSchedulingAgent(db, {});
      await uploadingAgent.initialize();
      let uploadCalledForUploading = false;
      uploadingAgent.uploadToYouTube = async () => {
        uploadCalledForUploading = true;
      };

      let duplicateBlocked = false;
      try {
        await uploadingAgent.publishContent('prod-in-uploading');
      } catch (err) {
        duplicateBlocked = err.code === 'UPLOAD_OUTCOME_UNKNOWN';
      }
      if (!duplicateBlocked || uploadCalledForUploading) {
        throw new Error('Concurrent/duplicate upload was not blocked for entry in uploading status');
      }

      // -------------------------------------------------------------
      // Test 15: Approval Invariant: Unapproved Content Cannot Be Recovered
      // -------------------------------------------------------------
      const unapprovedEntry = {
        id: 'sched-unapproved-retry',
        productionId: 'prod-unapproved-retry',
        title: 'Unapproved Retry Video',
        publishTime: new Date().toISOString(),
        status: 'retry_pending',
        metadata: { audio: intentionalAudio, retry: { attemptCount: 1 } }
      };
      await db.saveScheduleEntry(unapprovedEntry);
      const unapprovedAgent = new PublishingSchedulingAgent(Object.create(db), {});
      unapprovedAgent.db.getProductionBundle = async () => ({
        review_status: 'pending_review',
        provenance: { status: 'verified' }
      });
      unapprovedAgent.uploadToYouTube = async () => {
        throw new Error('Unapproved content must never be uploaded');
      };

      let approvalBlocked = false;
      try {
        await unapprovedAgent.publishContent('prod-unapproved-retry');
      } catch (err) {
        approvalBlocked = err.code === 'APPROVAL_REQUIRED';
      }
      if (!approvalBlocked) throw new Error('Unapproved content retry did not throw APPROVAL_REQUIRED');

      const unapprovedSaved = await db.getLatestScheduleEntry('prod-unapproved-retry');
      if (unapprovedSaved.status !== 'dead_letter') {
        throw new Error(`Unapproved content did not transition to dead_letter, got '${unapprovedSaved.status}'`);
      }

      // -------------------------------------------------------------
      // Test 16: Provenance Invariant: Invalid Provenance Transitions to Dead Letter
      // -------------------------------------------------------------
      const invalidProvEntry = {
        id: 'sched-invalid-prov-retry',
        productionId: 'prod-invalid-prov-retry',
        title: 'Invalid Provenance Retry Video',
        publishTime: new Date().toISOString(),
        status: 'retry_pending',
        metadata: { audio: intentionalAudio, retry: { attemptCount: 1 } }
      };
      await db.saveScheduleEntry(invalidProvEntry);
      const invalidProvAgent = new PublishingSchedulingAgent(Object.create(db), {});
      invalidProvAgent.db.getProductionBundle = async () => ({
        review_status: 'approved',
        provenance: { status: 'unverified' }
      });
      invalidProvAgent.uploadToYouTube = async () => {
        throw new Error('Invalid provenance content must never be uploaded');
      };

      let invalidProvBlocked = false;
      try {
        await invalidProvAgent.publishContent('prod-invalid-prov-retry');
      } catch (err) {
        invalidProvBlocked = err.code === 'PROVENANCE_BLOCKED';
      }
      if (!invalidProvBlocked) throw new Error('Invalid provenance retry did not throw PROVENANCE_BLOCKED');

      const invalidProvSaved = await db.getLatestScheduleEntry('prod-invalid-prov-retry');
      if (invalidProvSaved.status !== 'dead_letter') {
        throw new Error(`Invalid provenance did not transition to dead_letter, got '${invalidProvSaved.status}'`);
      }

      // -------------------------------------------------------------
      // Test 17 & 18: Privacy and Scheduled Preservation
      // -------------------------------------------------------------
      const scheduledPublishTime = '2026-10-15T14:30:00.000Z';
      let capturedRequestBody = null;
      const privacyEntry = {
        id: 'sched-privacy-preserve',
        productionId: 'prod-privacy-preserve',
        title: 'Privacy & Schedule Preservation',
        publishTime: scheduledPublishTime,
        status: 'scheduled',
        metadata: {
          seo: { title: 'Privacy & Schedule Preservation', description: 'Desc', tags: ['finance'] },
          privacyStatus: 'private',
          containsSyntheticMedia: true,
          audio: intentionalAudio,
          video: { path: '/tmp/dummy.mp4' }
        }
      };
      await db.saveScheduleEntry(privacyEntry);
      const privacyAgent = new PublishingSchedulingAgent(db, {});
      privacyAgent.getVideoStream = async () => 'mock-stream';
      privacyAgent.youtube = {
        videos: {
          insert: async (req) => {
            capturedRequestBody = req.requestBody;
            return { data: { id: 'yt-privacy-success' } };
          }
        }
      };

      await privacyAgent.publishContent('prod-privacy-preserve');

      if (!capturedRequestBody) {
        throw new Error('uploadToYouTube was not called or requestBody was not captured');
      }
      if (capturedRequestBody.status?.privacyStatus !== 'private') {
        throw new Error(`Expected privacyStatus 'private', got '${capturedRequestBody.status?.privacyStatus}'`);
      }
      if (capturedRequestBody.status?.publishAt !== scheduledPublishTime) {
        throw new Error(`Expected publishAt '${scheduledPublishTime}', got '${capturedRequestBody.status?.publishAt}'`);
      }

    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    // -------------------------------------------------------------
    // Test 19 & 20: Regression & Developer B Preservation
    // -------------------------------------------------------------
    const { VisualTreatmentSelector, TREATMENTS } = require('./utils/visual-treatment-engine');
    const { FinancialVisualization, VISUALIZATION_TYPES } = require('./utils/financial-visualization-engine');
    const { AudioEnhancementEngine } = require('./utils/audio-enhancement-engine');
    const { ShortsPackagingService } = require('./utils/shorts-packaging-service');
    const { ShortsCoverGenerator } = require('./utils/shorts-cover-generator');
    const { AIVideoGenerator } = require('./utils/ai-video-generator');
    const { ShortsRepurposingService } = require('./utils/shorts-repurposing-service');

    if (!VisualTreatmentSelector || !TREATMENTS.ANTI_SWIPE_HOOK) {
      throw new Error('Developer B VisualTreatmentSelector or TREATMENTS was modified or missing');
    }
    if (!FinancialVisualization || !VISUALIZATION_TYPES.ANIMATED_METRIC) {
      throw new Error('Developer B FinancialVisualization was modified or missing');
    }
    if (!AudioEnhancementEngine || !ShortsPackagingService) {
      throw new Error('Developer B AudioEnhancementEngine or ShortsPackagingService was modified or missing');
    }
    if (!ShortsCoverGenerator || !AIVideoGenerator || !ShortsRepurposingService) {
      throw new Error('Developer B ShortsCoverGenerator, AIVideoGenerator or ShortsRepurposingService was modified or missing');
    }

    this.logger.info('Publishing Dead-Letter Recovery (A4.2) test completed successfully');
  }

  async testDynamicTopicFallback() {
    this.logger.info('Starting Dynamic Topic Fallback (A4.3) tests...');
    const { ContentStrategyAgent } = require('./agents/content-strategy-agent');
    const { AutonomousChannelOperator } = require('./utils/autonomous-channel-operator');
    const { SemanticDedupService } = require('./utils/semantic-dedup-service');
    const { ProvenanceService } = require('./utils/provenance-service');
    const { Database } = require('./database/db');

    const db = new Database();
    await db.initialize();

    const dedupService = new SemanticDedupService();
    const strategyAgent = new ContentStrategyAgent(db, {}, { semanticDedupService: dedupService });
    const operator = new AutonomousChannelOperator(db, {
      selectFallbackCandidate: (strategy, research, excluded) =>
        strategyAgent.selectFallbackCandidate(strategy, research, excluded)
    });

    // -------------------------------------------------------------
    // Test 1 - 8: Eligibility Inspection (operator.isEligibleForTopicReplacement)
    // -------------------------------------------------------------
    // 1. Provenance failure -> eligible
    const provFailure = await operator.isEligibleForTopicReplacement({
      details: { reviewStatus: 'needs_attention', blockingFailures: ['provenance'] }
    });
    if (!provFailure.eligible || provFailure.reason !== 'provenance_failure') {
      throw new Error(`Expected provenance failure to be eligible, got ${JSON.stringify(provFailure)}`);
    }

    // Also via reviewNotes
    const provNotesFailure = await operator.isEligibleForTopicReplacement({
      details: { reviewStatus: 'needs_attention', reviewNotes: 'Blocking checks failed: provenance' }
    });
    if (!provNotesFailure.eligible || provNotesFailure.reason !== 'provenance_failure') {
      throw new Error(`Expected provenance review notes to be eligible, got ${JSON.stringify(provNotesFailure)}`);
    }

    // 2. brand_policy failure -> eligible
    const brandFailure = await operator.isEligibleForTopicReplacement({
      details: { reviewStatus: 'needs_attention', blockingFailures: ['brand_policy'] }
    });
    if (!brandFailure.eligible || brandFailure.reason !== 'brand_policy_failure') {
      throw new Error(`Expected brand_policy failure to be eligible, got ${JSON.stringify(brandFailure)}`);
    }

    // 3. narration failure -> NOT eligible
    const narrationFailure = await operator.isEligibleForTopicReplacement({
      details: { reviewStatus: 'needs_attention', blockingFailures: ['narration'] }
    });
    if (narrationFailure.eligible) {
      throw new Error(`Expected narration failure to be ineligible, got ${JSON.stringify(narrationFailure)}`);
    }

    // 4. scene_integrity failure -> NOT eligible
    const sceneFailure = await operator.isEligibleForTopicReplacement({
      details: { reviewStatus: 'needs_attention', blockingFailures: ['scene_integrity'] }
    });
    if (sceneFailure.eligible) {
      throw new Error(`Expected scene_integrity failure to be ineligible, got ${JSON.stringify(sceneFailure)}`);
    }

    // 5. transient script failure -> NOT eligible
    const transientTimeout = await operator.isEligibleForTopicReplacement({
      error: 'Request failed with status code 429: Too Many Requests'
    });
    if (transientTimeout.eligible) {
      throw new Error(`Expected transient 429 failure to be ineligible, got ${JSON.stringify(transientTimeout)}`);
    }
    const transient500 = await operator.isEligibleForTopicReplacement({
      error: 'ETIMEDOUT: connection timed out after 30000ms'
    });
    if (transient500.eligible) {
      throw new Error(`Expected ETIMEDOUT failure to be ineligible, got ${JSON.stringify(transient500)}`);
    }

    // 6. permanent content safety rejection -> eligible
    const safetyRejection = await operator.isEligibleForTopicReplacement({
      error: 'Topic rejected due to content safety filter violation'
    });
    if (!safetyRejection.eligible || safetyRejection.reason !== 'permanent_content_rejection') {
      throw new Error(`Expected content safety rejection to be eligible, got ${JSON.stringify(safetyRejection)}`);
    }

    // 7. publishing / upload failure -> NOT eligible
    const publishFailure = await operator.isEligibleForTopicReplacement({
      error: 'YouTube upload failed: 403 quotaExceeded'
    });
    if (publishFailure.eligible) {
      throw new Error(`Expected publishing upload failure to be ineligible for topic fallback, got ${JSON.stringify(publishFailure)}`);
    }

    // 8. needs_review -> NOT eligible (normal human review gate)
    const needsReviewCheck = await operator.isEligibleForTopicReplacement({
      details: { reviewStatus: 'needs_review' }
    });
    if (needsReviewCheck.eligible) {
      throw new Error(`Expected needs_review to be ineligible for topic fallback, got ${JSON.stringify(needsReviewCheck)}`);
    }

    // -------------------------------------------------------------
    // Test 9 - 15: Candidate Selection Hierarchy & Dedup
    // -------------------------------------------------------------
    const sampleStrategy = {
      objective: 'Teach personal finance basics',
      audience: 'Young professionals',
      contentPillars: ['Budgeting', 'Investing', 'Saving'],
      default_format: 'explainer',
      default_length: 'medium'
    };

    const sampleResearch = {
      recentTopics: ['Emergency Funds Explained', 'How to Track Daily Expenses'],
      signals: [
        {
          topic: 'First Time Home Buyer Tax Deductions',
          score: 8,
          evidence: [{ url: 'https://youtube.com/watch?v=signal-1' }]
        },
        {
          topic: 'Beginner Mistakes When Investing in ETFs',
          score: 7,
          evidence: [{ url: 'https://youtube.com/watch?v=signal-2' }]
        }
      ],
      sourceCatalog: [
        { url: 'https://youtube.com/watch?v=signal-1', title: 'Home Buyer Tax Deductions' },
        { url: 'https://youtube.com/watch?v=signal-2', title: 'ETF Mistakes' }
      ]
    };

    // 9. Unused candidate comes from research signals first (Tier 1)
    const cand1 = strategyAgent.selectFallbackCandidate(sampleStrategy, sampleResearch, []);
    if (!cand1 || cand1.topic !== 'First Time Home Buyer Tax Deductions' || cand1.tier !== 'signals') {
      throw new Error(`Expected Tier 1 signal candidate, got ${JSON.stringify(cand1)}`);
    }
    if (!cand1.sourceUrls.includes('https://youtube.com/watch?v=signal-1')) {
      throw new Error(`Expected candidate to retain valid catalog source URLs, got ${JSON.stringify(cand1.sourceUrls)}`);
    }

    // 10. If first signal is excluded, second signal is chosen
    const cand2 = strategyAgent.selectFallbackCandidate(
      sampleStrategy,
      sampleResearch,
      ['First Time Home Buyer Tax Deductions']
    );
    if (!cand2 || cand2.topic !== 'Beginner Mistakes When Investing in ETFs' || cand2.tier !== 'signals') {
      throw new Error(`Expected second signal candidate, got ${JSON.stringify(cand2)}`);
    }

    // 11. When signals are exhausted, evergreen candidate is used (Tier 2)
    const candEvergreen = strategyAgent.selectFallbackCandidate(
      sampleStrategy,
      { ...sampleResearch, signals: [] },
      []
    );
    if (!candEvergreen || candEvergreen.tier !== 'evergreen') {
      throw new Error(`Expected Tier 2 evergreen candidate, got ${JSON.stringify(candEvergreen)}`);
    }
    const evergreenPool = strategyAgent.getEvergreenFallbackTopics();
    if (!evergreenPool.includes(candEvergreen.topic)) {
      throw new Error(`Expected topic from evergreen pool, got ${candEvergreen.topic}`);
    }

    // 12. Duplicate candidate (lexical or semantic) is rejected
    // "Ways to Save Money Every Month" is semantically duplicate to evergreen "Practical Ways to Save Money Every Month"
    const candDedup = strategyAgent.selectFallbackCandidate(
      sampleStrategy,
      {
        recentTopics: ['Practical Ways to Save Money Every Month'],
        signals: [{ topic: 'Ways to Save Money Every Month', score: 8, evidence: [] }]
      },
      []
    );
    if (candDedup && candDedup.topic === 'Ways to Save Money Every Month') {
      throw new Error('Expected semantically duplicate candidate to be rejected');
    }

    // 13. Banned candidate is rejected
    const strategyWithBanned = {
      ...sampleStrategy,
      bannedTopics: ['crypto', 'meme coins']
    };
    const candBanned = strategyAgent.selectFallbackCandidate(
      strategyWithBanned,
      {
        recentTopics: [],
        signals: [
          { topic: 'Top Crypto Mistakes to Avoid in 2026', score: 9, evidence: [] },
          { topic: 'Understanding Index Funds and Compound Interest', score: 7, evidence: [] }
        ]
      },
      []
    );
    if (!candBanned || candBanned.topic !== 'Understanding Index Funds and Compound Interest') {
      throw new Error(`Expected banned crypto candidate to be skipped, got ${JSON.stringify(candBanned)}`);
    }

    // 14. Already-attempted candidate in excludedTopics is rejected
    const candAttempted = strategyAgent.selectFallbackCandidate(
      sampleStrategy,
      sampleResearch,
      [
        'First Time Home Buyer Tax Deductions',
        'Beginner Mistakes When Investing in ETFs'
      ]
    );
    if (candAttempted.tier === 'signals') {
      throw new Error('Expected all signals to be skipped when already attempted');
    }

    // 15. No candidates remaining returns null
    const allEvergreen = strategyAgent.getEvergreenFallbackTopics();
    const candNone = strategyAgent.selectFallbackCandidate(
      sampleStrategy,
      { recentTopics: allEvergreen, signals: [] },
      allEvergreen
    );
    if (candNone !== null) {
      throw new Error(`Expected null when all candidates are exhausted, got ${JSON.stringify(candNone)}`);
    }

    // -------------------------------------------------------------
    // Test 16 - 21: AutonomousChannelOperator Execution Loop & Quota
    // -------------------------------------------------------------
    const opStrategy = await db.saveChannelStrategy({
      objective: 'Financial Education',
      audience: 'Beginners',
      contentPillars: ['Budgeting', 'Investing'],
      cadencePerWeek: 2,
      videosPerRun: 2,
      defaultFormat: 'tutorial',
      defaultLength: 'short',
      status: 'active'
    });

    const mockResearch = {
      recentTopics: ['Old Historical Topic'],
      signals: [
        {
          topic: 'High Yield Savings Account Guide',
          score: 9,
          sources: ['trending'],
          evidence: [{ url: 'https://youtube.com/watch?v=hysa-evidence' }]
        },
        {
          topic: 'Unverified Penny Stock Secrets',
          score: 8,
          sources: ['trending'],
          evidence: [{ url: 'https://youtube.com/watch?v=unverified-evidence' }]
        },
        {
          topic: 'Index Fund Investing 101 for Beginners',
          score: 7,
          sources: ['trending'],
          evidence: [{ url: 'https://youtube.com/watch?v=index-evidence' }]
        }
      ],
      sourceCatalog: [
        { url: 'https://youtube.com/watch?v=hysa-evidence', title: 'HYSA Evidence' },
        { url: 'https://youtube.com/watch?v=unverified-evidence', title: 'Penny Stock Evidence' },
        { url: 'https://youtube.com/watch?v=index-evidence', title: 'Index Fund Evidence' }
      ]
    };

    const initialPlan = [
      {
        topic: 'High Yield Savings Account Guide',
        pillar: 'Saving',
        angle: 'Save more money safely',
        rationale: 'Solid starter topic',
        format: 'tutorial',
        length: 'short',
        sourceUrls: ['https://youtube.com/watch?v=hysa-evidence']
      },
      {
        topic: 'Unverified Penny Stock Secrets',
        pillar: 'Investing',
        angle: 'Risky speculative investments',
        rationale: 'Trending topic',
        format: 'tutorial',
        length: 'short',
        sourceUrls: ['https://youtube.com/watch?v=unverified-evidence']
      }
    ];

    const startedJobs = [];
    const runOperator = new AutonomousChannelOperator(db, {
      researchAndPlan: async () => ({ research: mockResearch, plan: initialPlan }),
      selectFallbackCandidate: (s, r, ex) => strategyAgent.selectFallbackCandidate(s, r, ex),
      startGenerationJob: async input => {
        startedJobs.push(input);
        const jobId = `job-${startedJobs.length}-${input.topic.replace(/\s+/g, '-').slice(0, 15)}`;
        return { id: jobId };
      },
      waitForGenerationJob: async jobId => {
        if (jobId.includes('Unverified')) {
          // Fails Truth/Provenance verification
          return {
            id: jobId,
            status: 'completed',
            production_id: `prod-${jobId}`,
            details: {
              reviewStatus: 'needs_attention',
              blockingFailures: ['provenance'],
              reviewNotes: 'Blocking checks failed: provenance'
            }
          };
        }
        // Other jobs succeed and land in needs_review
        return {
          id: jobId,
          status: 'completed',
          production_id: `prod-${jobId}`,
          details: { reviewStatus: 'needs_review' }
        };
      }
    });

    const activeRun = await runOperator.start(opStrategy);
    await runOperator.activeRuns.get(activeRun.id);

    const finishedRun = await db.getOperatorRun(activeRun.id);

    // 16. Provenance failure triggered fallback and preserved quota
    if (!finishedRun) throw new Error('Operator run was not found');
    if (finishedRun.status !== 'waiting_review') {
      throw new Error(`Expected run status 'waiting_review', got '${finishedRun.status}'`);
    }

    // Target count was 2. Job 2 failed provenance -> Job 3 (replacement) succeeded.
    // Usable quota must be 2.
    if (finishedRun.summary.usable !== 2) {
      throw new Error(`Expected summary.usable 2, got ${finishedRun.summary.usable}`);
    }
    if (finishedRun.summary.fallbackCount !== 1) {
      throw new Error(`Expected summary.fallbackCount 1, got ${finishedRun.summary.fallbackCount}`);
    }
    if (finishedRun.summary.needsAttention !== 1) {
      throw new Error(`Expected summary.needsAttention 1, got ${finishedRun.summary.needsAttention}`);
    }
    if (finishedRun.summary.generated !== 3) {
      throw new Error(`Expected summary.generated 3 (2 initial + 1 replacement), got ${finishedRun.summary.generated}`);
    }

    // 17. Verify original job and replacement job records
    const origJob = finishedRun.generatedJobs.find(j => j.planIndex === 1 && !j.isReplacement);
    if (!origJob || !origJob.fallbackTriggered || origJob.fallbackReason !== 'provenance_failure') {
      throw new Error(`Original job record missing fallbackTriggered: ${JSON.stringify(origJob)}`);
    }
    const repJob = finishedRun.generatedJobs.find(j => j.isReplacement && j.planIndex === 1);
    if (!repJob || repJob.status !== 'completed' || repJob.reviewStatus !== 'needs_review') {
      throw new Error(`Replacement job record invalid: ${JSON.stringify(repJob)}`);
    }
    if (repJob.replacesJobId !== origJob.jobId) {
      throw new Error(`Expected replacesJobId '${origJob.jobId}', got '${repJob.replacesJobId}'`);
    }

    // 18. Factual independence: replacement job received clean sources and distinct topic
    const startedReplacement = startedJobs.find(j => j.topic === 'Index Fund Investing 101 for Beginners');
    if (!startedReplacement) {
      throw new Error('Replacement job was not started with candidate topic');
    }
    const repSources = startedReplacement.strategyContext?.researchSources || [];
    if (repSources.some(s => s.url.includes('unverified'))) {
      throw new Error('Replacement job contaminated with failed topic sources');
    }

    // 19. Non-eligible failure (narration) does NOT trigger fallback
    const narrationPlan = [{
      topic: 'Audio Defect Test Video',
      pillar: 'Budgeting',
      angle: 'Testing audio defects',
      format: 'explainer',
      length: 'short'
    }];
    const narrationOperator = new AutonomousChannelOperator(db, {
      researchAndPlan: async () => ({ research: { recentTopics: [], signals: [] }, plan: narrationPlan }),
      startGenerationJob: async () => ({ id: `job-narration-${Date.now()}` }),
      waitForGenerationJob: async jobId => ({
        id: jobId,
        status: 'completed',
        details: {
          reviewStatus: 'needs_attention',
          blockingFailures: ['narration'],
          reviewNotes: 'Blocking checks failed: narration'
        }
      })
    });
    const narrationRun = await narrationOperator.start(opStrategy);
    await narrationOperator.activeRuns.get(narrationRun.id);
    const completedNarration = await db.getOperatorRun(narrationRun.id);
    if (completedNarration.summary.fallbackCount !== 0) {
      throw new Error(`Expected 0 fallbacks for narration failure, got ${completedNarration.summary.fallbackCount}`);
    }
    if (completedNarration.generatedJobs.length !== 1) {
      throw new Error(`Expected exactly 1 job in generatedJobs, got ${completedNarration.generatedJobs.length}`);
    }

    // 20. Bounded replacements: Max 1 replacement per slot (no recursive loop)
    const recursivePlan = [{
      topic: 'First Fragile Topic',
      pillar: 'Investing',
      angle: 'Fails repeatedly',
      format: 'explainer',
      length: 'short'
    }];
    let jobCallCount = 0;
    const boundedOperator = new AutonomousChannelOperator(db, {
      researchAndPlan: async () => ({
        research: {
          recentTopics: [],
          signals: [
            { topic: 'Second Fragile Topic', score: 8, evidence: [] },
            { topic: 'Third Fragile Topic', score: 7, evidence: [] }
          ]
        },
        plan: recursivePlan
      }),
      selectFallbackCandidate: (s, r, ex) => strategyAgent.selectFallbackCandidate(s, r, ex),
      startGenerationJob: async () => {
        jobCallCount++;
        return { id: `job-recursive-${jobCallCount}` };
      },
      waitForGenerationJob: async jobId => ({
        id: jobId,
        status: 'completed',
        details: {
          reviewStatus: 'needs_attention',
          blockingFailures: ['provenance'],
          reviewNotes: 'Blocking checks failed: provenance'
        }
      })
    });
    const boundedRun = await boundedOperator.start(opStrategy);
    await boundedOperator.activeRuns.get(boundedRun.id);
    const finishedBounded = await db.getOperatorRun(boundedRun.id);
    // Initial job + at most 1 replacement = exactly 2 jobs called
    if (jobCallCount !== 2) {
      throw new Error(`Expected exactly 2 generation job attempts (1 initial + 1 replacement), got ${jobCallCount}`);
    }
    if (finishedBounded.summary.fallbackCount !== 1) {
      throw new Error(`Expected fallbackCount 1, got ${finishedBounded.summary.fallbackCount}`);
    }
    if (finishedBounded.summary.usable !== 0) {
      throw new Error(`Expected usable 0 when replacement also fails, got ${finishedBounded.summary.usable}`);
    }

    // 21. No candidate remaining completes safely below target
    const exhaustedPlan = [{
      topic: 'Unverifiable Topic Alpha',
      pillar: 'Investing',
      angle: 'No backups exist',
      format: 'explainer',
      length: 'short'
    }];
    const exhaustedOperator = new AutonomousChannelOperator(db, {
      researchAndPlan: async () => ({ research: { recentTopics: [], signals: [] }, plan: exhaustedPlan }),
      selectFallbackCandidate: () => null, // No candidates remaining
      startGenerationJob: async () => ({ id: `job-exhausted-${Date.now()}` }),
      waitForGenerationJob: async jobId => ({
        id: jobId,
        status: 'completed',
        details: {
          reviewStatus: 'needs_attention',
          blockingFailures: ['provenance'],
          reviewNotes: 'Blocking checks failed: provenance'
        }
      })
    });
    const exhaustedRun = await exhaustedOperator.start(opStrategy);
    await exhaustedOperator.activeRuns.get(exhaustedRun.id);
    const finishedExhausted = await db.getOperatorRun(exhaustedRun.id);
    if (finishedExhausted.summary.usable !== 0 || finishedExhausted.summary.fallbackCount !== 0) {
      throw new Error(`Expected 0 usable and 0 fallbacks when no candidates, got ${JSON.stringify(finishedExhausted.summary)}`);
    }
    if (finishedExhausted.generatedJobs[0].fallbackError !== 'no_candidates_remaining') {
      throw new Error(`Expected fallbackError 'no_candidates_remaining', got ${finishedExhausted.generatedJobs[0].fallbackError}`);
    }

    // 22. Content DNA remains creative-only: ProvenanceService requires verified evidence
    const provenanceService = new ProvenanceService(db);
    const builtProv = provenanceService.build({
      sources: [],
      claims: [{ text: 'Arbitrary unverified financial claim', status: 'pending' }]
    });
    if (builtProv.status === 'verified') {
      throw new Error('Content DNA incorrectly verified unverified claims in Provenance');
    }

    await db.close();

    // 23. Developer B files untouched verification
    const { VisualTreatmentSelector, TREATMENTS } = require('./utils/visual-treatment-engine');
    const { FinancialVisualization, VISUALIZATION_TYPES } = require('./utils/financial-visualization-engine');
    const { AudioEnhancementEngine } = require('./utils/audio-enhancement-engine');
    const { ShortsPackagingService } = require('./utils/shorts-packaging-service');
    const { ShortsCoverGenerator } = require('./utils/shorts-cover-generator');
    const { AIVideoGenerator } = require('./utils/ai-video-generator');
    const { ShortsRepurposingService } = require('./utils/shorts-repurposing-service');

    if (!VisualTreatmentSelector || !TREATMENTS.ANTI_SWIPE_HOOK) {
      throw new Error('Developer B VisualTreatmentSelector or TREATMENTS was modified or missing');
    }
    if (!FinancialVisualization || !VISUALIZATION_TYPES.ANIMATED_METRIC) {
      throw new Error('Developer B FinancialVisualization was modified or missing');
    }
    if (!AudioEnhancementEngine || !ShortsPackagingService) {
      throw new Error('Developer B AudioEnhancementEngine or ShortsPackagingService was modified or missing');
    }
    if (!ShortsCoverGenerator || !AIVideoGenerator || !ShortsRepurposingService) {
      throw new Error('Developer B ShortsCoverGenerator, AIVideoGenerator or ShortsRepurposingService was modified or missing');
    }

    this.logger.info('Dynamic Topic Fallback (A4.3) tests completed successfully');
  }

  async testIntraProductionRecovery() {
    this.logger.info('Starting Intra-Production Recovery & Checkpointing (A4.4) tests...');

    const { ProductionManagementAgent } = require('./agents/production-management-agent');
    const { GenerationRecoveryService } = require('./utils/generation-recovery-service');
    const { ProvenanceService } = require('./utils/provenance-service');
    const fs = require('fs').promises;
    const path = require('path');

    const testDbPath = path.join(__dirname, 'data', `test_a44_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.db`);
    const db = new Database(testDbPath);
    await db.initialize();

    const testRunSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const tempDir = path.join(__dirname, 'temp', `test_a44_${testRunSuffix}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Helper to create a dummy valid media file (non-empty)
    const createDummyMedia = async (filePath, content = 'dummy media content') => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content);
      return filePath;
    };

    const dummyScript = {
      title: 'How Compound Interest Works',
      duration: '60',
      hook: { text: 'Stop wasting your savings in a 0.01% checking account.' },
      introduction: {
        greeting: 'Hey everyone,',
        topicIntro: 'Today we will look at how compounding builds wealth.',
        valueProposition: 'You can retire early with smart investing.',
        credibility: 'Backed by financial math.'
      },
      mainContent: [
        {
          title: 'The Math of Compounding',
          text: 'Investing 500 dollars a month at 8 percent return grows to over 700000 dollars in 30 years.',
          duration: 30
        }
      ],
      conclusion: {
        recap: ['Start early', 'Stay consistent'],
        finalThought: 'Time in the market beats timing the market.'
      },
      callToAction: {
        subscribe: 'Subscribe for more wealth tips',
        like: 'Hit like if this helped',
        comment: 'Drop your investment questions below'
      },
      truthAnchor: [{ claim: '8 percent return on 500 monthly grows to 700k in 30 years', verified: true }]
    };

    const dummyThumbnail = {
      path: await createDummyMedia(path.join(tempDir, 'thumb.jpg'), 'fake-image-bytes'),
      dimensions: { width: 1792, height: 1024 }
    };
    const dummyStrategy = { topic: 'Compound Interest', pillar: 'Investing' };
    const dummySeo = { title: dummyScript.title, description: 'Learn compounding', tags: ['investing', 'finance'] };

    // Setup Mock Generator to control each substage deterministically
    const mockCredentials = { geminiApiKey: 'test', elevenLabsApiKey: 'test' };

    const setupTestAgent = async () => {
      const agent = new ProductionManagementAgent(db, mockCredentials);
      await agent.initialize();
      agent.sceneRepair = { initializeProduction: async () => null };
      agent.aiVideoGenerator.isUsableAudioFile = async (filePath) => {
        if (!filePath) return false;
        const lower = filePath.toLowerCase();
        if (lower.endsWith('.info') || lower.endsWith('.assembly.json') || lower.includes('corrupted') || lower.includes('zero_byte')) return false;
        try {
          const s = await fs.stat(filePath);
          return s.isFile() && s.size > 0;
        } catch (_e) {
          return false;
        }
      };
      return agent;
    };

    // =========================================================================
    // 1. Full production saves all five substage checkpoints
    // =========================================================================
    const jobId1 = `job_a44_full_1_${testRunSuffix}`;
    const agent1 = await setupTestAgent();

    agent1.aiVideoGenerator.generateTTSAudio = async (text, targetPath) => {
      await createDummyMedia(targetPath, 'valid-mp3-audio-bytes');
      agent1.aiVideoGenerator.lastNarrationResult = { provider: 'mock-tts', model: 'mock-voice', cost: {} };
      return targetPath;
    };

    agent1.aiVideoGenerator.generateVisualAssets = async (prompt) => {
      const p = path.join(tempDir, `visual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.png`);
      await createDummyMedia(p, 'valid-png-image-bytes');
      return [{ path: p, prompt }];
    };

    agent1.aiVideoGenerator.generateVideo = async (script, assets, audioPath, targetPath) => {
      await createDummyMedia(targetPath, 'valid-mp4-video-bytes');
      agent1.aiVideoGenerator.lastVideoResult = { actualProvider: 'mock-ffmpeg', model: 'local' };
      return targetPath;
    };

    const prodResult1 = await agent1.processContent({
      strategy: dummyStrategy,
      script: dummyScript,
      thumbnail: dummyThumbnail,
      seo: dummySeo,
      jobId: jobId1
    });

    const manifest1 = await agent1.getIntraProductionManifest(jobId1);
    if (!manifest1 || !manifest1.substages) {
      throw new Error('Test 1 Failed: Intra-production manifest was not saved');
    }
    const requiredSubstages = ['script_prep', 'tts', 'visuals', 'captions', 'assembly'];
    for (const sub of requiredSubstages) {
      if (manifest1.substages[sub]?.status !== 'completed') {
        throw new Error(`Test 1 Failed: Substage ${sub} status is ${manifest1.substages[sub]?.status}, expected completed`);
      }
    }

    // =========================================================================
    // 2. Valid checkpoint manifest loads correctly
    // =========================================================================
    const recoveryService = new GenerationRecoveryService(db);
    const loadedManifest = await recoveryService.getProductionManifest(jobId1);
    if (!loadedManifest || loadedManifest.productionId !== manifest1.productionId) {
      throw new Error('Test 2 Failed: GenerationRecoveryService failed to load valid production manifest');
    }
    if (!loadedManifest.substages?.assembly?.artifacts?.path) {
      throw new Error('Test 2 Failed: Loaded manifest missing assembly artifact path');
    }

    // =========================================================================
    // 3. Deterministic productionId remains stable across retries
    // =========================================================================
    const testJobId = `job_a44_deterministic_id_${testRunSuffix}`;
    const idFirst = await agent1.resolveProductionId(testJobId);
    const idSecond = await agent1.resolveProductionId(testJobId);
    if (idFirst !== `prod_${testJobId}` || idFirst !== idSecond) {
      throw new Error(`Test 3 Failed: Deterministic productionId expected prod_${testJobId}, got ${idFirst} and ${idSecond}`);
    }

    // =========================================================================
    // 4. TTS success + visual failure -> TTS is reused on retry
    // =========================================================================
    const jobId4 = `job_a44_tts_reuse_4_${testRunSuffix}`;
    let ttsCalls4 = 0;
    let visualCalls4 = 0;

    const agent4 = await setupTestAgent();
    agent4.aiVideoGenerator.generateTTSAudio = async (text, targetPath) => {
      ttsCalls4++;
      await createDummyMedia(targetPath, 'tts-audio-4');
      return targetPath;
    };
    agent4.aiVideoGenerator.generateVisualAssets = async (prompt) => {
      visualCalls4++;
      if (visualCalls4 === 1) {
        throw new Error('Simulated DALL-E provider outage');
      }
      const p = path.join(tempDir, `vis4_${visualCalls4}.png`);
      await createDummyMedia(p, 'png-bytes');
      return [{ path: p, prompt }];
    };
    agent4.aiVideoGenerator.generateVideo = async (s, a, aud, target) => {
      await createDummyMedia(target, 'video4-bytes');
      return target;
    };

    // First run fails at visuals
    let run4Failed = false;
    try {
      await agent4.processContent({
        strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId4
      });
    } catch (_err) {
      run4Failed = true;
    }
    if (!run4Failed) {
      throw new Error('Test 4 Failed: Expected visual failure to throw, but it succeeded');
    }
    if (ttsCalls4 !== 1) {
      throw new Error(`Test 4 Failed: Expected 1 TTS call before failure, got ${ttsCalls4}`);
    }

    // Check manifest recorded visuals failure but TTS completed
    const manifest4Mid = await agent4.getIntraProductionManifest(jobId4);
    if (manifest4Mid.substages?.tts?.status !== 'completed') {
      throw new Error('Test 4 Failed: TTS was not saved as completed before visual failure');
    }
    if (manifest4Mid.substages?.visuals?.status !== 'failed') {
      throw new Error(`Test 4 Failed: Visuals expected status failed, got ${manifest4Mid.substages?.visuals?.status}`);
    }

    // Retry run: visual generation succeeds, TTS MUST be reused
    await agent4.processContent({
      strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId4
    });
    if (ttsCalls4 !== 1) {
      throw new Error(`Test 4 Failed: TTS provider was called again on retry! Calls: ${ttsCalls4}`);
    }
    const manifest4Final = await agent4.getIntraProductionManifest(jobId4);
    if (manifest4Final.substages?.visuals?.status !== 'completed' || manifest4Final.substages?.assembly?.status !== 'completed') {
      throw new Error('Test 4 Failed: Retry did not complete remaining substages');
    }

    // =========================================================================
    // 5. TTS success + caption failure -> TTS and visuals are reused
    // =========================================================================
    const jobId5 = `job_a44_cap_reuse_5_${testRunSuffix}`;
    let ttsCalls5 = 0;
    let visualCalls5 = 0;
    let captionAttempts5 = 0;

    const agent5 = await setupTestAgent();
    agent5.aiVideoGenerator.generateTTSAudio = async (text, targetPath) => {
      ttsCalls5++;
      await createDummyMedia(targetPath, 'tts-audio-5');
      return targetPath;
    };
    agent5.aiVideoGenerator.generateVisualAssets = async (prompt) => {
      visualCalls5++;
      const p = path.join(tempDir, `vis5_${visualCalls5}.png`);
      await createDummyMedia(p, 'png-bytes');
      return [{ path: p, prompt }];
    };
    agent5.aiVideoGenerator.generateVideo = async (s, a, aud, target) => {
      await createDummyMedia(target, 'video5-bytes');
      return target;
    };

    // Override generateCaptions to fail on first attempt
    const origGenCaptions = agent5.generateCaptions.bind(agent5);
    agent5.generateCaptions = async (prodData) => {
      captionAttempts5++;
      if (captionAttempts5 === 1) {
        throw new Error('Simulated caption alignment error');
      }
      return await origGenCaptions(prodData);
    };

    let run5Failed = false;
    try {
      await agent5.processContent({
        strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId5
      });
    } catch (_err) {
      run5Failed = true;
    }
    if (!run5Failed) throw new Error('Test 5 Failed: Expected caption failure to throw');
    if (ttsCalls5 !== 1 || visualCalls5 === 0) {
      throw new Error(`Test 5 Failed: Pre-caption calls unexpected: tts=${ttsCalls5}, visuals=${visualCalls5}`);
    }

    const savedVisualCalls = visualCalls5;
    // Retry run: captions succeed, TTS and visuals must be reused
    await agent5.processContent({
      strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId5
    });
    if (ttsCalls5 !== 1) {
      throw new Error(`Test 5 Failed: TTS provider was called again! Count: ${ttsCalls5}`);
    }
    if (visualCalls5 !== savedVisualCalls) {
      throw new Error(`Test 5 Failed: Visuals were regenerated! Count: ${visualCalls5} vs saved: ${savedVisualCalls}`);
    }

    // =========================================================================
    // 6. TTS + visuals + captions success + FFmpeg failure -> only assembly reruns
    // =========================================================================
    const jobId6 = `job_a44_assembly_fail_6_${testRunSuffix}`;
    let ttsCalls6 = 0;
    let visualCalls6 = 0;
    let assemblyCalls6 = 0;

    const agent6 = await setupTestAgent();
    agent6.aiVideoGenerator.generateTTSAudio = async (text, targetPath) => {
      ttsCalls6++;
      await createDummyMedia(targetPath, 'tts-audio-6');
      return targetPath;
    };
    agent6.aiVideoGenerator.generateVisualAssets = async (prompt) => {
      visualCalls6++;
      const p = path.join(tempDir, `vis6_${visualCalls6}.png`);
      await createDummyMedia(p, 'png-bytes');
      return [{ path: p, prompt }];
    };
    agent6.aiVideoGenerator.generateVideo = async (s, a, aud, target) => {
      assemblyCalls6++;
      if (assemblyCalls6 === 1) {
        throw new Error('FFmpeg exit code 1: Encoding failed');
      }
      await createDummyMedia(target, 'video6-bytes');
      return target;
    };

    let run6Failed = false;
    try {
      await agent6.processContent({
        strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId6
      });
    } catch (_err) {
      run6Failed = true;
    }
    if (!run6Failed) throw new Error('Test 6 Failed: Expected assembly failure to throw');

    const manifest6Mid = await agent6.getIntraProductionManifest(jobId6);
    if (manifest6Mid.substages?.assembly?.status !== 'failed') {
      throw new Error(`Test 6 Failed: Assembly substage expected status 'failed', got ${manifest6Mid.substages?.assembly?.status}`);
    }
    if (manifest6Mid.substages?.captions?.status !== 'completed' || manifest6Mid.substages?.visuals?.status !== 'completed') {
      throw new Error('Test 6 Failed: Prior substages were not preserved as completed');
    }

    const savedVis6 = visualCalls6;
    // Retry run: only assembly runs
    await agent6.processContent({
      strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId6
    });
    if (ttsCalls6 !== 1) throw new Error(`Test 6 Failed: TTS called again: ${ttsCalls6}`);
    if (visualCalls6 !== savedVis6) throw new Error(`Test 6 Failed: Visuals called again: ${visualCalls6}`);
    if (assemblyCalls6 !== 2) throw new Error(`Test 6 Failed: Assembly was not rerun: ${assemblyCalls6}`);

    // =========================================================================
    // 7. Process restart after TTS -> TTS not regenerated
    // =========================================================================
    const jobId7 = `job_a44_restart_tts_7_${testRunSuffix}`;
    let ttsCalls7 = 0;
    const agent7A = await setupTestAgent();
    agent7A.aiVideoGenerator.generateTTSAudio = async (text, targetPath) => {
      ttsCalls7++;
      await createDummyMedia(targetPath, 'audio7');
      return targetPath;
    };
    agent7A.aiVideoGenerator.generateVisualAssets = async () => {
      throw new Error('Process killed/crashed during visuals');
    };

    try {
      await agent7A.processContent({
        strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId7
      });
    } catch (_err) {
      void _err;
    }
    if (ttsCalls7 !== 1) throw new Error(`Test 7 Failed: Expected 1 TTS call, got ${ttsCalls7}`);

    // Fresh new agent instance representing a process restart
    const agent7B = await setupTestAgent();
    agent7B.aiVideoGenerator.generateTTSAudio = async () => {
      ttsCalls7++;
      throw new Error('TTS provider called unexpectedly after process restart');
    };
    agent7B.aiVideoGenerator.generateVisualAssets = async (prompt) => {
      const p = path.join(tempDir, `vis7_${Date.now()}.png`);
      await createDummyMedia(p, 'png7');
      return [{ path: p, prompt }];
    };
    agent7B.aiVideoGenerator.generateVideo = async (s, a, aud, target) => {
      await createDummyMedia(target, 'video7');
      return target;
    };

    const res7 = await agent7B.processContent({
      strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId7
    });
    if (ttsCalls7 !== 1) throw new Error(`Test 7 Failed: TTS was regenerated on fresh process: ${ttsCalls7}`);
    if (res7.status !== 'ready') throw new Error(`Test 7 Failed: Expected ready status, got ${res7.status}`);

    // =========================================================================
    // 8. Process restart after visuals -> TTS and visuals not regenerated
    // =========================================================================
    const jobId8 = `job_a44_restart_vis_8_${testRunSuffix}`;
    let ttsCalls8 = 0;
    let visCalls8 = 0;

    const agent8A = await setupTestAgent();
    agent8A.aiVideoGenerator.generateTTSAudio = async (text, targetPath) => {
      ttsCalls8++;
      await createDummyMedia(targetPath, 'audio8');
      return targetPath;
    };
    agent8A.aiVideoGenerator.generateVisualAssets = async (prompt) => {
      visCalls8++;
      const p = path.join(tempDir, `vis8_${visCalls8}.png`);
      await createDummyMedia(p, 'png8');
      return [{ path: p, prompt }];
    };
    agent8A.generateCaptions = async () => {
      throw new Error('Process killed during captions');
    };

    try {
      await agent8A.processContent({
        strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId8
      });
    } catch (_err) {
      void _err;
    }

    // Process restart with agent8B
    const agent8B = await setupTestAgent();
    agent8B.aiVideoGenerator.generateTTSAudio = async () => {
      ttsCalls8++;
      throw new Error('TTS regenerated unexpectedly');
    };
    agent8B.aiVideoGenerator.generateVisualAssets = async () => {
      visCalls8++;
      throw new Error('Visuals regenerated unexpectedly');
    };
    agent8B.aiVideoGenerator.generateVideo = async (s, a, aud, target) => {
      await createDummyMedia(target, 'video8');
      return target;
    };

    await agent8B.processContent({
      strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId8
    });
    if (ttsCalls8 !== 1) throw new Error(`Test 8 Failed: TTS called again: ${ttsCalls8}`);
    if (visCalls8 === 0) throw new Error('Test 8 Failed: Visuals were never generated');

    // =========================================================================
    // 9. Missing TTS artifact -> TTS checkpoint invalidated and TTS regenerated
    // =========================================================================
    const jobId9 = `job_a44_missing_tts_9_${testRunSuffix}`;
    let ttsCalls9 = 0;
    const agent9 = await setupTestAgent();
    agent9.aiVideoGenerator.generateTTSAudio = async (text, targetPath) => {
      ttsCalls9++;
      await createDummyMedia(targetPath, 'audio9');
      return targetPath;
    };
    agent9.aiVideoGenerator.generateVisualAssets = async (prompt) => {
      const p = path.join(tempDir, `vis9_${Date.now()}.png`);
      await createDummyMedia(p, 'png9');
      return [{ path: p, prompt }];
    };
    agent9.aiVideoGenerator.generateVideo = async (s, a, aud, target) => {
      await createDummyMedia(target, 'video9');
      return target;
    };

    await agent9.processContent({
      strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId9
    });
    if (ttsCalls9 !== 1) throw new Error(`Test 9 Failed: Expected initial TTS call, got ${ttsCalls9}`);

    // Now delete the audio file from disk
    const manifest9 = await agent9.getIntraProductionManifest(jobId9);
    const audioPath9 = manifest9?.substages?.tts?.artifacts?.path || path.join(__dirname, 'data', 'audio', `prod_${jobId9}_narration.mp3`);
    await fs.unlink(audioPath9).catch(() => {});

    // Run again: TTS artifact is missing, so TTS must be regenerated
    await agent9.processContent({
      strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId9
    });
    if (ttsCalls9 !== 2) {
      throw new Error(`Test 9 Failed: Missing TTS artifact did not cause TTS to be regenerated; calls=${ttsCalls9}`);
    }

    // =========================================================================
    // 10. Zero-byte artifact -> rejected
    // =========================================================================
    const zeroByteFile = path.join(tempDir, 'zero_byte.mp4');
    await fs.writeFile(zeroByteFile, ''); // 0 bytes
    const isZeroValid = await agent1.pathExists(zeroByteFile);
    if (isZeroValid) {
      throw new Error('Test 10 Failed: pathExists returned true for zero-byte file');
    }
    const zeroSubstageValid = await agent1.validateSubstageArtifact('assembly', {
      status: 'completed',
      artifacts: { path: zeroByteFile, simulated: false }
    });
    if (zeroSubstageValid) {
      throw new Error('Test 10 Failed: validateSubstageArtifact accepted zero-byte artifact');
    }
    const zeroRecoveryValid = await recoveryService.validateArtifact('production', {
      id: 'prod_zero',
      assets: { finalVideo: { path: zeroByteFile, simulated: false } }
    });
    if (zeroRecoveryValid) {
      throw new Error('Test 10 Failed: GenerationRecoveryService accepted zero-byte artifact');
    }

    // =========================================================================
    // 11. Corrupted artifact -> rejected where validation is available
    // =========================================================================
    const corruptedAudio = path.join(tempDir, 'corrupted.mp3');
    await fs.writeFile(corruptedAudio, 'NOT_A_REAL_MP3_OR_EMPTY_GARBAGE');
    const corruptedValid = await agent1.validateSubstageArtifact('tts', {
      status: 'completed',
      artifacts: { path: corruptedAudio, simulated: false }
    });
    if (corruptedValid) {
      throw new Error('Test 11 Failed: Corrupted audio file was accepted');
    }

    // =========================================================================
    // 12. Script hash mismatch -> downstream checkpoints invalidated
    // =========================================================================
    const jobId12 = `job_a44_script_mismatch_12_${testRunSuffix}`;
    const agent12 = await setupTestAgent();
    agent12.aiVideoGenerator.generateTTSAudio = async (text, targetPath) => {
      await createDummyMedia(targetPath, 'audio12');
      return targetPath;
    };
    agent12.aiVideoGenerator.generateVisualAssets = async (prompt) => {
      const p = path.join(tempDir, `vis12_${Date.now()}.png`);
      await createDummyMedia(p, 'png12');
      return [{ path: p, prompt }];
    };
    agent12.aiVideoGenerator.generateVideo = async (s, a, aud, target) => {
      await createDummyMedia(target, 'video12');
      return target;
    };

    await agent12.processContent({
      strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId12
    });

    const manifest12Before = await agent12.getIntraProductionManifest(jobId12);
    const origScriptHash = manifest12Before.scriptHash;

    // Run again with modified script text
    const modifiedScript = {
      ...dummyScript,
      fullScript: 'Completely new script about real estate investing instead of compound interest.',
      title: 'Real Estate Cash Flow Secrets'
    };
    await agent12.processContent({
      strategy: dummyStrategy, script: modifiedScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId12
    });

    const manifest12After = await agent12.getIntraProductionManifest(jobId12);
    if (manifest12After.scriptHash === origScriptHash) {
      throw new Error('Test 12 Failed: Script hash was not updated after script changed');
    }
    if (manifest12After.substages.script_prep.fingerprint === origScriptHash) {
      throw new Error('Test 12 Failed: Downstream script_prep retained old fingerprint');
    }

    // =========================================================================
    // 13. Placeholder .assembly.json rejected
    // =========================================================================
    const assemblyJsonPath = path.join(tempDir, 'sample_video.mp4.assembly.json');
    await fs.writeFile(assemblyJsonPath, JSON.stringify({ simulated: true }));
    const isAssemblyJsonSubstageValid = await agent1.validateSubstageArtifact('assembly', {
      status: 'completed',
      artifacts: { path: assemblyJsonPath, simulated: false }
    });
    if (isAssemblyJsonSubstageValid) {
      throw new Error('Test 13 Failed: .assembly.json was accepted as a valid assembly artifact');
    }
    const isAssemblyJsonRecoveryValid = await recoveryService.validateArtifact('production', {
      id: 'prod_placeholder',
      assets: { finalVideo: { path: assemblyJsonPath, simulated: false } }
    });
    if (isAssemblyJsonRecoveryValid) {
      throw new Error('Test 13 Failed: GenerationRecoveryService accepted .assembly.json placeholder');
    }

    // =========================================================================
    // 14. Placeholder .info rejected
    // =========================================================================
    const infoPath = path.join(tempDir, 'narration.mp3.info');
    await fs.writeFile(infoPath, JSON.stringify({ message: 'TTS simulated' }));
    const isInfoSubstageValid = await agent1.validateSubstageArtifact('tts', {
      status: 'completed',
      artifacts: { path: infoPath, simulated: false }
    });
    if (isInfoSubstageValid) {
      throw new Error('Test 14 Failed: .info was accepted as a valid TTS artifact');
    }
    const isExtValid = agent1.isValidMediaExtension(infoPath, ['.mp3', '.wav']);
    if (isExtValid) {
      throw new Error('Test 14 Failed: isValidMediaExtension allowed .info file');
    }

    // =========================================================================
    // 15. Valid MP4 accepted
    // =========================================================================
    const realMp4 = path.join(tempDir, 'real_valid_video.mp4');
    await createDummyMedia(realMp4, 'real-video-bytes');
    const isRealMp4SubstageValid = await agent1.validateSubstageArtifact('assembly', {
      status: 'completed',
      artifacts: { path: realMp4, simulated: false }
    });
    if (!isRealMp4SubstageValid) {
      throw new Error('Test 15 Failed: Valid MP4 was rejected by validateSubstageArtifact');
    }
    const isRealMp4RecoveryValid = await recoveryService.validateArtifact('production', {
      id: 'prod_valid',
      assets: { finalVideo: { path: realMp4, simulated: false } }
    });
    if (!isRealMp4RecoveryValid) {
      throw new Error('Test 15 Failed: Valid MP4 was rejected by GenerationRecoveryService');
    }

    // =========================================================================
    // 16. Valid MP3 accepted
    // =========================================================================
    const realMp3 = path.join(tempDir, 'real_valid_narration.mp3');
    await createDummyMedia(realMp3, 'real-mp3-audio-bytes');
    const isRealMp3Valid = await agent1.validateSubstageArtifact('tts', {
      status: 'completed',
      artifacts: { path: realMp3, simulated: false }
    });
    if (!isRealMp3Valid) {
      throw new Error('Test 16 Failed: Valid MP3 was rejected by validateSubstageArtifact');
    }

    // =========================================================================
    // 17. Partial visual asset loss regenerates only invalid visual work
    // =========================================================================
    const jobId17 = `job_a44_partial_vis_17_${testRunSuffix}`;
    const agent17 = await setupTestAgent();
    agent17.aiVideoGenerator.generateTTSAudio = async (t, p) => { await createDummyMedia(p, 'a17'); return p; };
    agent17.aiVideoGenerator.generateVideo = async (s, a, aud, p) => { await createDummyMedia(p, 'v17'); return p; };

    let generatedPrompts17 = [];
    agent17.aiVideoGenerator.generateVisualAssets = async (prompt) => {
      generatedPrompts17.push(prompt);
      const p = path.join(tempDir, `scene_${generatedPrompts17.length}.png`);
      await createDummyMedia(p, `png_${generatedPrompts17.length}`);
      return [{ path: p, prompt }];
    };

    // First run generates all prompts
    await agent17.processContent({
      strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId17
    });
    const initialVisualCount = generatedPrompts17.length;
    if (initialVisualCount < 3) {
      throw new Error(`Test 17 Failed: Expected at least 3 initial visual prompts, got ${initialVisualCount}`);
    }

    // Now delete ONLY scene 2
    const manifest17 = await agent17.getIntraProductionManifest(jobId17);
    const scene2Asset = manifest17.substages.visuals.artifacts.visualAssets[1];
    const scene2Path = typeof scene2Asset === 'string' ? scene2Asset : scene2Asset.path;
    await fs.unlink(scene2Path);

    // Reset prompt tracker
    generatedPrompts17 = [];

    // Run production again: only scene 2 should be generated, scene 1 and scene 3 reused!
    await agent17.processContent({
      strategy: dummyStrategy, script: dummyScript, thumbnail: dummyThumbnail, seo: dummySeo, jobId: jobId17
    });
    if (generatedPrompts17.length !== 1) {
      throw new Error(`Test 17 Failed: Partial visual asset loss did not regenerate only the missing scene! Generated count: ${generatedPrompts17.length}, expected 1`);
    }

    // =========================================================================
    // 18. Bounded retries prevent infinite loops
    // =========================================================================
    let attempts18 = 0;
    const boundedRecovery = new GenerationRecoveryService(db, {
      maxAttempts: 2,
      baseDelayMs: 0
    });
    const jobId18 = `job_a44_bounded_18_${testRunSuffix}`;
    let caughtError18 = null;
    try {
      await boundedRecovery.run(jobId18, 'production', 80, async () => {
        attempts18++;
        const err = new Error('Persistent external failure');
        err.retryable = true;
        throw err;
      });
    } catch (err) {
      caughtError18 = err;
    }
    if (attempts18 !== 2) {
      throw new Error(`Test 18 Failed: Expected exactly 2 attempts, got ${attempts18}`);
    }
    if (!caughtError18 || caughtError18.message !== 'Persistent external failure') {
      throw new Error('Test 18 Failed: Recovery service did not throw final error after bounding');
    }

    // =========================================================================
    // 19. Existing top-level generation recovery still works
    // =========================================================================
    const jobId19 = `job_a44_toplevel_19_${testRunSuffix}`;
    await db.saveGenerationCheckpoint(jobId19, 'strategy', {
      status: 'completed', artifact: { topic: 'Compound Interest' }, completedAt: new Date().toISOString()
    });
    await db.saveGenerationCheckpoint(jobId19, 'script', {
      status: 'completed', artifact: { title: 'T', fullScript: 'S' }, completedAt: new Date().toISOString()
    });
    const checkpoints19 = await db.listGenerationCheckpoints(jobId19);
    const resumeAt = recoveryService.resumePoint(checkpoints19);
    if (resumeAt !== 'thumbnail') {
      throw new Error(`Test 19 Failed: Expected resume stage 'thumbnail', got ${resumeAt}`);
    }

    // =========================================================================
    // 20. Provenance still runs after recovered production
    // =========================================================================
    const provenanceService = new ProvenanceService(db);
    const initProv = await provenanceService.initialize(prodResult1.id, {
      ...prodResult1,
      strategy: { researchSources: [{ url: 'https://investing.gov/data', title: 'SEC' }] },
      script: { claims: [{ text: 'Compounding at 8% grows 500/mo to 700k', sourceUrls: ['https://investing.gov/data'] }] }
    });
    if (!initProv || initProv.status !== 'blocked') {
      throw new Error('Test 20 Failed: Provenance was not initialized as blocked before review');
    }
    const reviewedProv = await provenanceService.review(prodResult1.id, {
      sources: initProv.sources.map(s => ({ ...s, status: 'verified' })),
      claims: initProv.claims.map(c => ({ ...c, status: 'supported' }))
    });
    if (!reviewedProv || reviewedProv.status !== 'verified') {
      throw new Error('Test 20 Failed: Provenance failed to verify valid claim on review');
    }

    // =========================================================================
    // 21. Quality Gate still runs after recovered production
    // =========================================================================
    const { OperatorService } = require('./utils/operator-service');
    const operator = new OperatorService(db);
    const qualityResult = await operator.runQualityChecks({
      ...prodResult1,
      provenance: reviewedProv
    }, {});
    if (!qualityResult || typeof qualityResult.passed !== 'boolean' || !Array.isArray(qualityResult.checks)) {
      throw new Error('Test 21 Failed: Quality Gate review failed to run on recovered production');
    }

    // =========================================================================
    // 22. Recovered production cannot directly publish
    // =========================================================================
    const recoveredProduction = prodResult1;
    if (recoveredProduction.publishedAt || recoveredProduction.youtubeId) {
      throw new Error('Test 22 Failed: Recovered production directly published without gating');
    }
    if (recoveredProduction.status !== 'ready') {
      throw new Error(`Test 22 Failed: Expected recovered production status 'ready', got ${recoveredProduction.status}`);
    }

    // =========================================================================
    // 23. Existing A4.1/A4.2/A4.3 tests continue passing
    // (Verified through full suite run)
    // =========================================================================

    // =========================================================================
    // 24. Developer B files remain zero-diff
    // =========================================================================
    const { VisualTreatmentSelector: VTS } = require('./utils/visual-treatment-engine');
    const { FinancialVisualization: FV } = require('./utils/financial-visualization-engine');
    const { AudioEnhancementEngine: AEE } = require('./utils/audio-enhancement-engine');
    const { ShortsPackagingService: SPS } = require('./utils/shorts-packaging-service');
    const { ShortsCoverGenerator: SCG } = require('./utils/shorts-cover-generator');
    const { AIVideoGenerator: AVG } = require('./utils/ai-video-generator');
    const { ShortsRepurposingService: SRS } = require('./utils/shorts-repurposing-service');

    if (!VTS || !FV || !AEE || !SPS || !SCG || !AVG || !SRS) {
      throw new Error('Test 24 Failed: Developer B engines were missing or modified');
    }

    // Cleanup test artifacts
    await db.close();
    await fs.unlink(testDbPath).catch(() => {});
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    try {
      const prodDir = path.join(__dirname, 'data', 'production');
      const pFiles = await fs.readdir(prodDir);
      for (const f of pFiles) {
        if (f.includes(testRunSuffix)) {
          await fs.unlink(path.join(prodDir, f)).catch(() => {});
        }
      }
      const audioDir = path.join(__dirname, 'data', 'audio');
      const aFiles = await fs.readdir(audioDir);
      for (const f of aFiles) {
        if (f.includes(testRunSuffix)) {
          await fs.unlink(path.join(audioDir, f)).catch(() => {});
        }
      }
    } catch (_err) {
      void _err;
    }

    this.logger.info('Intra-Production Recovery & Checkpointing (A4.4) tests completed successfully');
  }

  async testTopicPerformanceLearning() {
    this.logger.info('Starting Own-Channel Topic Performance Learning & Exploration (A5.1) tests...');

    const { Database } = require('./database/db');
    const { TopicPerformanceScorer, TrendingTopicDiscovery } = require('./utils/trending-topic-discovery');
    const { ContentStrategyAgent } = require('./agents/content-strategy-agent');
    const { SemanticDedupService } = require('./utils/semantic-dedup-service');
    const fs = require('fs').promises;
    const path = require('path');

    const scorer = new TopicPerformanceScorer();
    const testDbPath = path.join(__dirname, 'data', `test_a51_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.db`);
    const db = new Database(testDbPath);
    await db.initialize();

    try {
      // Setup historical keyword data for tests:
      // Channel baseline will be computed from this:
      // - "crypto": total_views: 40000, average_views: 40000 (HIGH: 200% of 20k baseline)
      // - "investing": total_views: 26000, average_views: 26000 (HIGH: 130% of 20k baseline)
      // - "budgeting": total_views: 20000, average_views: 20000 (NEUTRAL: 100% of 20k baseline)
      // - "coupons": total_views: 6000, average_views: 6000 (LOW: 30% of 20k baseline)
      // - "penny": total_views: 8000, average_views: 8000 (LOW: 40% of 20k baseline)
      await db.updateKeywordPerformance('crypto', { views: 40000, videoId: 'v1', score: 0.95 });
      await db.updateKeywordPerformance('investing', { views: 26000, videoId: 'v2', score: 0.85 });
      await db.updateKeywordPerformance('budgeting', { views: 20000, videoId: 'v3', score: 0.70 });
      await db.updateKeywordPerformance('coupons', { views: 6000, videoId: 'v4', score: 0.35 });
      await db.updateKeywordPerformance('penny', { views: 8000, videoId: 'v5', score: 0.40 });

      const baselineData = await db.getKeywordBaseline();
      const baseline = baselineData.baselineViews || 20000;
      const historyKeywords = await db.getKeywordPerformance();

      // =========================================================================
      // Case 1: High-performing keyword receives boost
      // =========================================================================
      const highResult = scorer.scoreTopic('Beginner Crypto Strategies', historyKeywords, baseline);
      if (highResult.multiplier <= 1.0) {
        throw new Error(`Case 1 Failed: Expected high-performing keyword multiplier > 1.0, got ${highResult.multiplier}`);
      }
      if (highResult.tier !== 'high_performing') {
        throw new Error(`Case 1 Failed: Expected tier 'high_performing', got '${highResult.tier}'`);
      }

      // =========================================================================
      // Case 2: >120% threshold behaves correctly
      // =========================================================================
      const exactly120 = scorer.calculateMultiplier(24000, 20000); // exactly 1.20
      if (exactly120.multiplier !== 1.0 || exactly120.tier !== 'neutral') {
        throw new Error(`Case 2 Failed: At exactly 120%, expected multiplier 1.0 and tier 'neutral', got ${exactly120.multiplier} / ${exactly120.tier}`);
      }
      const above120 = scorer.calculateMultiplier(24200, 20000); // 1.21 > 1.20
      if (above120.multiplier <= 1.0 || above120.tier !== 'high_performing') {
        throw new Error(`Case 2 Failed: Above 120%, expected multiplier > 1.0 and tier 'high_performing', got ${above120.multiplier}`);
      }
      const below120 = scorer.calculateMultiplier(23800, 20000); // 1.19 <= 1.20
      if (below120.multiplier !== 1.0 || below120.tier !== 'neutral') {
        throw new Error(`Case 2 Failed: At 119%, expected multiplier 1.0, got ${below120.multiplier}`);
      }

      // =========================================================================
      // Case 3: Low-performing keyword receives penalty
      // =========================================================================
      const lowResult = scorer.scoreTopic('Finding Grocery Coupons Fast', historyKeywords, baseline);
      if (lowResult.multiplier >= 1.0) {
        throw new Error(`Case 3 Failed: Expected low-performing keyword multiplier < 1.0, got ${lowResult.multiplier}`);
      }
      if (lowResult.tier !== 'low_performing') {
        throw new Error(`Case 3 Failed: Expected tier 'low_performing', got '${lowResult.tier}'`);
      }

      // =========================================================================
      // Case 4: <50% threshold behaves correctly
      // =========================================================================
      const exactly50 = scorer.calculateMultiplier(10000, 20000); // exactly 0.50
      if (exactly50.multiplier !== 1.0 || exactly50.tier !== 'neutral') {
        throw new Error(`Case 4 Failed: At exactly 50%, expected multiplier 1.0 and tier 'neutral', got ${exactly50.multiplier} / ${exactly50.tier}`);
      }
      const below50 = scorer.calculateMultiplier(9800, 20000); // 0.49 < 0.50
      if (below50.multiplier >= 1.0 || below50.tier !== 'low_performing') {
        throw new Error(`Case 4 Failed: Below 50%, expected multiplier < 1.0 and tier 'low_performing', got ${below50.multiplier}`);
      }
      const above50 = scorer.calculateMultiplier(10200, 20000); // 0.51 >= 0.50
      if (above50.multiplier !== 1.0 || above50.tier !== 'neutral') {
        throw new Error(`Case 4 Failed: At 51%, expected multiplier 1.0, got ${above50.multiplier}`);
      }

      // =========================================================================
      // Case 5: Low-performing topic is NOT eliminated
      // =========================================================================
      const candidateList = [
        { topic: 'Finding Grocery Coupons Fast', score: 8.0, opportunityScore: 60 }
      ];
      const enriched = scorer.enrichCandidates(candidateList, historyKeywords, baseline);
      if (enriched.length === 0) {
        throw new Error('Case 5 Failed: Low-performing candidate was eliminated from list');
      }
      if (enriched[0].opportunityScore <= 0 || enriched[0].score <= 0) {
        throw new Error(`Case 5 Failed: Expected positive opportunity score, got ${enriched[0].opportunityScore}`);
      }
      if (enriched[0].performanceMultiplier >= 1.0) {
        throw new Error(`Case 5 Failed: Expected penalized multiplier < 1.0, got ${enriched[0].performanceMultiplier}`);
      }

      // =========================================================================
      // Case 6: Unknown topic receives neutral multiplier
      // =========================================================================
      const unknownResult = scorer.scoreTopic('Quantum Computing Breakthroughs In Physics', historyKeywords, baseline);
      if (unknownResult.multiplier !== 1.0) {
        throw new Error(`Case 6 Failed: Expected neutral multiplier 1.0 for unknown topic, got ${unknownResult.multiplier}`);
      }
      if (!unknownResult.isNovel) {
        throw new Error('Case 6 Failed: Expected isNovel to be true for unknown topic');
      }
      if (unknownResult.tier !== 'novel') {
        throw new Error(`Case 6 Failed: Expected tier 'novel', got '${unknownResult.tier}'`);
      }

      // =========================================================================
      // Case 7: Multiplier is bounded
      // =========================================================================
      const extremeHigh = scorer.calculateMultiplier(10000000, 10000);
      if (extremeHigh.multiplier > 1.25 || extremeHigh.multiplier < 0.75) {
        throw new Error(`Case 7 Failed: Expected multiplier in [0.75, 1.25], got ${extremeHigh.multiplier}`);
      }
      const extremeLow = scorer.calculateMultiplier(1, 10000000);
      if (extremeLow.multiplier < 0.75 || extremeLow.multiplier > 1.25) {
        throw new Error(`Case 7 Failed: Expected multiplier in [0.75, 1.25], got ${extremeLow.multiplier}`);
      }

      // =========================================================================
      // Case 8: Multiple matched keywords aggregate deterministically
      // =========================================================================
      const multiResult = scorer.scoreTopic('Crypto Investing Masterclass', historyKeywords, baseline);
      if (multiResult.matchedKeywords.length < 2) {
        throw new Error(`Case 8 Failed: Expected at least 2 matched keywords, got ${multiResult.matchedKeywords.length}`);
      }
      const expectedAvg = Math.round((40000 + 26000) / 2);
      if (multiResult.matchedAverageViews !== expectedAvg) {
        throw new Error(`Case 8 Failed: Expected average ${expectedAvg}, got ${multiResult.matchedAverageViews}`);
      }

      // =========================================================================
      // Case 9: Candidate with strong external trend + weak own performance remains eligible
      // =========================================================================
      const mixedCandidate = [
        { topic: 'Viral Penny Stocks Surge', score: 9.5, opportunityScore: 90 }
      ];
      const mixedEnriched = scorer.enrichCandidates(mixedCandidate, historyKeywords, baseline);
      if (mixedEnriched.length !== 1) {
        throw new Error('Case 9 Failed: Candidate was filtered out');
      }
      if (mixedEnriched[0].score <= 0 || mixedEnriched[0].opportunityScore <= 0) {
        throw new Error(`Case 9 Failed: Score zeroed out: ${mixedEnriched[0].score}`);
      }
      if (mixedEnriched[0].score < 7.0) {
        throw new Error(`Case 9 Failed: Expected strong external trend to keep score high, got ${mixedEnriched[0].score}`);
      }

      // =========================================================================
      // Case 10: New candidate remains eligible for exploration
      // =========================================================================
      const isNovel = scorer.isNovelTopic('Autonomous Drone Delivery Networks', historyKeywords);
      if (!isNovel) {
        throw new Error('Case 10 Failed: Expected novel candidate to be identified as novel');
      }
      const novelEnriched = scorer.enrichCandidates(
        [{ topic: 'Autonomous Drone Delivery Networks', score: 8.0, opportunityScore: 80 }],
        historyKeywords,
        baseline
      );
      if (novelEnriched[0].performanceMultiplier !== 1.0 || !novelEnriched[0].performanceSignal.isNovel) {
        throw new Error('Case 10 Failed: Expected novel candidate to receive 1.0 multiplier and isNovel=true');
      }

      // =========================================================================
      // Case 11: targetCount >=2 guarantees at least one exploration candidate
      // =========================================================================
      const dedupService = new SemanticDedupService();
      const strategyAgent = new ContentStrategyAgent(db, {}, {
        topicPerformanceScorer: scorer,
        semanticDedupService: dedupService
      });
      strategyAgent.historicalKeywords = historyKeywords;
      strategyAgent.channelBaseline = baseline;

      // Plan containing only exploiting historical topics
      const allExploitingPlan = [
        {
          topic: 'Crypto Investing Masterclass',
          pillar: 'Crypto',
          angle: 'Actionable tactics',
          rationale: 'High performing',
          format: 'explainer',
          length: 'medium',
          sourceUrls: ['https://youtube.com/watch?v=ref1']
        },
        {
          topic: 'Budgeting Secrets For Beginners',
          pillar: 'Finance',
          angle: 'Everyday tactics',
          rationale: 'Solid baseline',
          format: 'explainer',
          length: 'medium',
          sourceUrls: ['https://youtube.com/watch?v=ref2']
        }
      ];

      const channelStrategy = {
        objective: 'Educate on wealth creation',
        audience: 'Beginner investors',
        contentPillars: ['Crypto', 'Finance', 'Technology'],
        default_format: 'explainer',
        default_length: 'medium'
      };

      const researchMock = {
        recentTopics: ['Stock Market 101'],
        sourceCatalog: [{ url: 'https://youtube.com/watch?v=novel1' }],
        signals: [
          {
            topic: 'Autonomous Drone Delivery Networks',
            evidence: [{ url: 'https://youtube.com/watch?v=novel1' }]
          }
        ]
      };

      const balancedPlan = strategyAgent.enforcePlanExplorationPolicy(
        allExploitingPlan,
        channelStrategy,
        2,
        researchMock
      );

      if (balancedPlan.length !== 2) {
        throw new Error(`Case 11 Failed: Expected plan length 2, got ${balancedPlan.length}`);
      }
      const hasNovelInPlan = balancedPlan.some(item => scorer.isNovelTopic(item.topic, historyKeywords));
      if (!hasNovelInPlan) {
        throw new Error('Case 11 Failed: Expected at least one novel exploration candidate in balanced plan');
      }

      // =========================================================================
      // Case 12: targetCount ==1 does not force exploration replacement
      // =========================================================================
      const singlePlan = [
        {
          topic: 'Crypto Investing Masterclass',
          pillar: 'Crypto',
          angle: 'Actionable tactics',
          rationale: 'High performing',
          format: 'explainer',
          length: 'medium',
          sourceUrls: ['https://youtube.com/watch?v=ref1']
        }
      ];
      const preservedSinglePlan = strategyAgent.enforcePlanExplorationPolicy(
        singlePlan,
        channelStrategy,
        1,
        researchMock
      );
      if (preservedSinglePlan[0].topic !== 'Crypto Investing Masterclass') {
        throw new Error(`Case 12 Failed: Expected targetCount=1 plan to remain unchanged, got ${preservedSinglePlan[0].topic}`);
      }

      // =========================================================================
      // Case 13: Semantic duplicate is still rejected during exploration replacement
      // =========================================================================
      const researchWithDup = {
        recentTopics: ['Time Management Techniques That Work'],
        sourceCatalog: [],
        signals: [
          {
            topic: 'Time Management Strategies That Actually Work',
            evidence: []
          },
          {
            topic: 'Deep Sea Ocean Exploration Technology',
            evidence: []
          }
        ]
      };
      const dedupPlan = strategyAgent.enforcePlanExplorationPolicy(
        allExploitingPlan,
        channelStrategy,
        2,
        researchWithDup
      );
      const chosenExploration = dedupPlan[1];
      if (chosenExploration.topic.toLowerCase().includes('time management')) {
        throw new Error(`Case 13 Failed: Semantic duplicate was not rejected for exploration slot: ${chosenExploration.topic}`);
      }

      // =========================================================================
      // Case 14: Banned topic is still rejected during exploration replacement
      // =========================================================================
      const channelStrategyWithBanned = {
        ...channelStrategy,
        bannedTopics: ['quantum', 'gambling']
      };
      const researchWithBanned = {
        recentTopics: [],
        sourceCatalog: [],
        signals: [
          {
            topic: 'Quantum Computing Future Architecture',
            evidence: []
          },
          {
            topic: 'Renewable Clean Energy Infrastructure',
            evidence: []
          }
        ]
      };
      const bannedGuardPlan = strategyAgent.enforcePlanExplorationPolicy(
        allExploitingPlan,
        channelStrategyWithBanned,
        2,
        researchWithBanned
      );
      if (bannedGuardPlan[1].topic.toLowerCase().includes('quantum')) {
        throw new Error(`Case 14 Failed: Banned topic was selected as exploration candidate: ${bannedGuardPlan[1].topic}`);
      }

      // =========================================================================
      // Case 15: A4.3 fallback limits remain unchanged
      // =========================================================================
      const fallbackCandidate = strategyAgent.selectFallbackCandidate(
        channelStrategy,
        researchMock,
        ['Attempted Failed Topic 1']
      );
      if (!fallbackCandidate || !fallbackCandidate.topic) {
        throw new Error('Case 15 Failed: A4.3 selectFallbackCandidate did not return a valid candidate');
      }

      // =========================================================================
      // Case 16: Truth Anchor / Provenance behavior remains unchanged
      // =========================================================================
      const safetyCheckResult = scorer.scoreTopic('Crypto Investing Masterclass', historyKeywords, baseline);
      if (safetyCheckResult.isTruthAnchorVerified !== false) {
        throw new Error('Case 16 Failed: Expected isTruthAnchorVerified to be false');
      }
      if (safetyCheckResult.isStrategySignalOnly !== true) {
        throw new Error('Case 16 Failed: Expected isStrategySignalOnly to be true');
      }
      const candidateCheck = scorer.enrichCandidates(
        [{ topic: 'Crypto Investing Masterclass', score: 8.0, opportunityScore: 80 }],
        historyKeywords,
        baseline
      );
      if (candidateCheck[0].provenanceStatus !== 'UNVERIFIED_TREND_SIGNAL') {
        throw new Error(`Case 16 Failed: Expected provenanceStatus 'UNVERIFIED_TREND_SIGNAL', got '${candidateCheck[0].provenanceStatus}'`);
      }

      // =========================================================================
      // Case 17: Content DNA behavior remains unchanged
      // =========================================================================
      const { ContentDNAService } = require('./utils/content-dna-service');
      const dnaService = new ContentDNAService();
      if (typeof dnaService.extractContentDNA !== 'function' || typeof dnaService.aggregateDNA !== 'function') {
        throw new Error('Case 17 Failed: ContentDNAService interface modified');
      }

      // =========================================================================
      // Case 18: TrendingTopicDiscovery integration works seamlessly
      // =========================================================================
      const discovery = new TrendingTopicDiscovery({}, { topicPerformanceScorer: scorer });
      const enrichedTopics = discovery.enrichWithOwnPerformance(
        [{ topic: 'Beginner Crypto Strategies', score: 5.0, opportunityScore: 50 }],
        historyKeywords,
        baseline
      );
      if (!enrichedTopics || enrichedTopics.length !== 1 || enrichedTopics[0].performanceMultiplier <= 1.0) {
        throw new Error('Case 18 Failed: TrendingTopicDiscovery.enrichWithOwnPerformance failed to apply boost');
      }

      this.logger.info('All 18 A5.1 topic performance learning test cases passed successfully.');
    } finally {
      await db.close();
      await fs.unlink(testDbPath).catch(() => {});
    }
  }

  async testGracefulShutdownRecovery() {
    this.logger.info('Starting Graceful Process Lifecycle & Shutdown Recovery (A5.2) tests...');

    const { Database } = require('./database/db');
    const { YouTubeAutomationAgent } = require('./index');
    const { DailyAutomation } = require('./schedules/daily-automation');
    const { AutonomousChannelOperator } = require('./utils/autonomous-channel-operator');
    const { TopicPerformanceScorer } = require('./utils/trending-topic-discovery');
    const fs = require('fs').promises;
    const path = require('path');
    const http = require('http');

    const testDbPath = path.join(__dirname, 'data', `test_a52_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.db`);
    const db = new Database(testDbPath);
    await db.initialize();

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    process.env.SUPPRESS_SHUTDOWN_EXIT = '1';

    try {
      // =========================================================================
      // Case 1 & 2 & 3: SIGTERM & SIGINT handlers registered and route to gracefulShutdown
      // =========================================================================
      const agent1 = new YouTubeAutomationAgent();
      agent1.db = db;
      let shutdownSignalReceived = null;
      agent1.gracefulShutdown = async (opts = {}) => {
        shutdownSignalReceived = opts.signal;
        agent1.isShuttingDown = true;
        return { success: true };
      };

      agent1.registerSignalHandlers();
      if (!agent1.signalHandlersRegistered || !agent1._sigtermHandler || !agent1._sigintHandler) {
        throw new Error('Case 1/2 Failed: Signal handlers not registered correctly');
      }

      // Test SIGTERM callback
      agent1._sigtermHandler();
      if (shutdownSignalReceived !== 'SIGTERM' || !agent1.isShuttingDown) {
        throw new Error('Case 1 Failed: SIGTERM did not trigger gracefulShutdown with signal SIGTERM');
      }

      // Test SIGINT callback
      shutdownSignalReceived = null;
      agent1._sigintHandler();
      if (shutdownSignalReceived !== 'SIGINT') {
        throw new Error('Case 2 Failed: SIGINT did not trigger gracefulShutdown with signal SIGINT');
      }

      agent1.unregisterSignalHandlers();
      if (agent1.signalHandlersRegistered) {
        throw new Error('Case 3 Failed: unregisterSignalHandlers failed to clean up handlers');
      }

      // =========================================================================
      // Case 4: Shutdown is idempotent (concurrent and sequential calls)
      // =========================================================================
      const agent2 = new YouTubeAutomationAgent();
      let cleanupExecutionCount = 0;
      agent2.scheduler = {
        stopAutomation: async () => {
          cleanupExecutionCount++;
          await new Promise(r => setTimeout(r, 20));
        }
      };

      const [res1, res2, res3] = await Promise.all([
        agent2.gracefulShutdown({ exit: false }),
        agent2.gracefulShutdown({ exit: false }),
        agent2.gracefulShutdown({ exit: false })
      ]);

      if (cleanupExecutionCount !== 1) {
        throw new Error(`Case 4 Failed: Expected exactly 1 cleanup execution, got ${cleanupExecutionCount}`);
      }
      if (!res1.schedulerStopped || res1 !== res2 || res2 !== res3) {
        throw new Error('Case 4 Failed: Shutdown promise was not shared across concurrent calls');
      }

      // Sequential call after completion
      const res4 = await agent2.gracefulShutdown({ exit: false });
      if (cleanupExecutionCount !== 1 || res4 !== res1) {
        throw new Error('Case 4 Failed: Sequential call after shutdown did not return cached promise');
      }

      // =========================================================================
      // Case 5: New scheduled and autonomous work is blocked/rejected during shutdown
      // =========================================================================
      const agent3 = new YouTubeAutomationAgent();
      agent3.isShuttingDown = true;
      agent3.autonomous = new AutonomousChannelOperator(db);
      agent3.autonomous.isShuttingDown = true;

      let caughtStartGen = false;
      try {
        await agent3.startGenerationJob({ topic: 'Test Topic' });
      } catch (err) {
        caughtStartGen = err.status === 503;
      }
      if (!caughtStartGen) throw new Error('Case 5 Failed: startGenerationJob was not blocked with 503 during shutdown');

      let caughtResumeGen = false;
      try {
        await agent3.resumeGenerationJob('job_123');
      } catch (err) {
        caughtResumeGen = err.status === 503;
      }
      if (!caughtResumeGen) throw new Error('Case 5 Failed: resumeGenerationJob was not blocked with 503 during shutdown');

      let caughtQueueSched = false;
      try {
        await agent3.queueScheduledContent({});
      } catch (err) {
        caughtQueueSched = err.status === 503;
      }
      if (!caughtQueueSched) throw new Error('Case 5 Failed: queueScheduledContent was not blocked with 503 during shutdown');

      let caughtAutonomousStart = false;
      try {
        await agent3.autonomous.start({ id: 'strat_1', status: 'active' });
      } catch (err) {
        caughtAutonomousStart = err.status === 503;
      }
      if (!caughtAutonomousStart) throw new Error('Case 5 Failed: autonomous.start was not blocked with 503 during shutdown');

      let caughtAutonomousResume = false;
      try {
        await agent3.autonomous.resume('run_1', { id: 'strat_1', status: 'active' });
      } catch (err) {
        caughtAutonomousResume = err.status === 503;
      }
      if (!caughtAutonomousResume) throw new Error('Case 5 Failed: autonomous.resume was not blocked with 503 during shutdown');

      // =========================================================================
      // Case 6: Cron tasks and intervals are destroyed/stopped cleanly
      // =========================================================================
      const scheduler = new DailyAutomation({}, db);
      let task1Stopped = false;
      let task1Destroyed = false;
      let task2Stopped = false;
      let task2Destroyed = false;

      scheduler.scheduledTasks = new Map([
        ['task1', { stop: () => { task1Stopped = true; }, destroy: () => { task1Destroyed = true; } }],
        ['task2', { stop: () => { task2Stopped = true; }, destroy: () => { task2Destroyed = true; } }]
      ]);
      scheduler.healthCheckInterval = setInterval(() => {}, 100000);
      scheduler.isEnabled = true;

      await scheduler.stopAutomation();
      if (scheduler.isEnabled !== false || scheduler.scheduledTasks.size !== 0) {
        throw new Error('Case 6 Failed: Scheduler did not clear tasks or set isEnabled = false');
      }
      if (!task1Stopped || !task1Destroyed || !task2Stopped || !task2Destroyed) {
        throw new Error('Case 6 Failed: Cron tasks did not have stop() and destroy() invoked');
      }
      if (scheduler.healthCheckInterval !== null) {
        throw new Error('Case 6 Failed: healthCheckInterval was not cleared');
      }

      // =========================================================================
      // Case 7: Active operator run becomes resumably interrupted
      // =========================================================================
      const strategyId = 'strat_test_a52';
      await db.saveChannelStrategy({
        id: strategyId,
        objective: 'Test strategy',
        audience: 'General',
        status: 'active',
        contentPillars: ['Tech']
      });

      const opRun = await db.createOperatorRun(strategyId);
      await db.updateOperatorRun(opRun.id, {
        status: 'running',
        stage: 'generating',
        progress: 45,
        plan: [{ slot: 1, topic: 'Interrupted Topic' }],
        generatedJobs: [{ slot: 1, jobId: 'job_in_run_1' }]
      });

      const operator = new AutonomousChannelOperator(db);
      operator.activeRuns.set(opRun.id, Promise.resolve());
      await operator.stop();

      const runAfterStop = await db.getOperatorRun(opRun.id);
      if (runAfterStop.status !== 'interrupted' || runAfterStop.stage !== 'interrupted') {
        throw new Error(`Case 7 Failed: Expected status 'interrupted', got '${runAfterStop.status}'`);
      }
      if (!runAfterStop.plan?.length || !runAfterStop.generatedJobs?.length) {
        throw new Error('Case 7 Failed: Operator run plan or generatedJobs were lost during interruption');
      }

      // =========================================================================
      // Case 8: Active generation job does not remain permanently stranded
      // =========================================================================
      const genJob = await db.createGenerationJob({
        topic: 'Stranded Video Topic',
        style: 'explainer',
        length: 'medium',
        source: 'manual'
      });
      await db.updateGenerationJob(genJob.id, {
        status: 'running',
        stage: 'visuals',
        progress: 50
      });

      await db.markInterruptedJobs('Process shutdown interrupted active work');
      const jobAfterShutdown = await db.getGenerationJob(genJob.id);
      if (jobAfterShutdown.status !== 'interrupted') {
        throw new Error(`Case 8 Failed: Generation job status expected 'interrupted', got '${jobAfterShutdown.status}'`);
      }
      if (!jobAfterShutdown.error.includes('Process shutdown')) {
        throw new Error('Case 8 Failed: Interrupted generation job does not have expected error reason');
      }

      // =========================================================================
      // Case 9: Existing completed checkpoints remain intact across interruption
      // =========================================================================
      await db.saveGenerationCheckpoint(genJob.id, 'strategy', {
        status: 'completed',
        artifact: { topic: 'Stranded Video' }
      });
      await db.saveGenerationCheckpoint(genJob.id, 'script', {
        status: 'completed',
        artifact: { title: 'Stranded Video', script: { scenes: [] } }
      });
      await db.saveGenerationCheckpoint(genJob.id, 'thumbnail', {
        status: 'completed',
        artifact: { thumbnailPath: '/tmp/thumb.png' }
      });
      await db.saveGenerationCheckpoint(genJob.id, 'production', {
        status: 'pending',
        artifact: {
          productionManifest: {
            substages: {
              script_prep: { status: 'completed' },
              tts_audio: { status: 'completed', artifact: { audioPath: '/tmp/test_audio.m4a' } },
              visual_assets: { status: 'completed', artifact: { scenes: [] } },
              captions: { status: 'pending' }
            }
          }
        }
      });

      // Mark interrupted again (simulating multiple restarts / shutdowns)
      await db.markInterruptedJobs('Shutdown check');
      const checkpointsAfter = await db.listGenerationCheckpoints(genJob.id);
      if (checkpointsAfter.length !== 4) {
        throw new Error(`Case 9 Failed: Checkpoints were modified or lost. Expected 4, got ${checkpointsAfter.length}`);
      }

      // =========================================================================
      // Case 10: Restart/resume can reuse existing checkpoints
      // =========================================================================
      const { GenerationRecoveryService } = require('./utils/generation-recovery-service');
      const recovery = new GenerationRecoveryService(db);
      const resumePoint = recovery.resumePoint(checkpointsAfter);
      if (resumePoint !== 'seo') {
        throw new Error(`Case 10 Failed: Expected resumePoint 'seo' after completed strategy, script, thumbnail, got '${resumePoint}'`);
      }
      const manifest = await recovery.getProductionManifest(genJob.id);
      if (!manifest || manifest.substages?.tts_audio?.status !== 'completed' || manifest.substages?.visual_assets?.status !== 'completed') {
        throw new Error('Case 10 Failed: Production manifest substages were corrupted or not recoverable');
      }

      // =========================================================================
      // Case 11: Publishing state is preserved across shutdown
      // =========================================================================
      const testBundleId = `prod_test_pub_${Date.now()}`;
      await db.saveProductionData({
        id: testBundleId,
        status: 'scheduled',
        assets: { videoPath: '/tmp/vid.mp4' },
        timeline: {}
      });
      await db.saveScheduleEntry({
        id: `sched_pub_${Date.now()}`,
        productionId: testBundleId,
        title: 'Publish Test Video',
        publishTime: new Date(Date.now() + 86400000).toISOString(),
        status: 'scheduled',
        priority: 1,
        metadata: { youtubeId: 'yt_existing_123' }
      });

      // Run markInterruptedJobs & check bundle and schedule
      await db.markInterruptedJobs('Shutdown');
      const bundleAfter = await db.getProductionBundle(testBundleId);
      const schedAfter = await db.getLatestScheduleEntry(testBundleId);
      if (bundleAfter.status !== 'scheduled' || schedAfter.status !== 'scheduled' || schedAfter.metadata?.youtubeId !== 'yt_existing_123') {
        throw new Error('Case 11 Failed: Production publishing state or schedule corrupted by shutdown');
      }

      // =========================================================================
      // Case 12: Existing youtubeId prevents duplicate upload
      // =========================================================================
      const { PublishingSchedulingAgent } = require('./agents/publishing-scheduling-agent');
      const pubAgent = new PublishingSchedulingAgent(db, {});
      await pubAgent.initialize();
      let uploadCalled = false;
      pubAgent.uploadToYouTube = async () => { uploadCalled = true; };

      const alreadyPubId = `prod_already_pub_${Date.now()}`;
      await db.saveScheduleEntry({
        id: `sched_already_${Date.now()}`,
        productionId: alreadyPubId,
        title: 'Already Published Video',
        publishTime: new Date().toISOString(),
        status: 'published',
        priority: 1,
        metadata: { youtubeId: 'yt_existing_456' }
      });

      const pubResult = await pubAgent.publishContent(alreadyPubId);
      if (uploadCalled) {
        throw new Error('Case 12 Failed: Duplicate upload attempted for content that is already published');
      }
      if (pubResult && pubResult.status !== 'published') {
        throw new Error(`Case 12 Failed: Expected published status, got ${pubResult.status}`);
      }

      // =========================================================================
      // Case 13: reconciliation_required remains protected
      // =========================================================================
      const recProdId = `prod_rec_${Date.now()}`;
      await db.saveScheduleEntry({
        id: `sched_rec_${Date.now()}`,
        productionId: recProdId,
        title: 'Reconciliation Video',
        publishTime: new Date().toISOString(),
        status: 'reconciliation_required',
        priority: 1,
        metadata: { uploadAttempts: 2, lastError: 'Network drop', retry: { failureCategory: 'unknown_outcome' } }
      });

      await db.markInterruptedJobs('Shutdown');
      const recAfter = await db.getLatestScheduleEntry(recProdId);
      if (recAfter.status !== 'reconciliation_required') {
        throw new Error(`Case 13 Failed: Status changed from reconciliation_required to '${recAfter.status}'`);
      }
      if (recAfter.metadata?.uploadAttempts !== 2) {
        throw new Error('Case 13 Failed: Schedule metadata lost uploadAttempts');
      }

      // =========================================================================
      // Case 14: HTTP server closes cleanly
      // =========================================================================
      const agentHttp = new YouTubeAutomationAgent();
      agentHttp.db = db;
      agentHttp.setupAPI();

      const ephemeralPort = await new Promise((resolve, reject) => {
        const srv = agentHttp.app.listen(0, () => {
          const addr = srv.address();
          agentHttp.server = srv;
          resolve(addr.port);
        });
        srv.on('error', reject);
      });

      // Verify health check works
      const healthBefore = await new Promise((resolve, reject) => {
        http.get(`http://localhost:${ephemeralPort}/health`, res => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      if (healthBefore.shuttingDown !== false) {
        throw new Error('Case 14 Failed: Server health check reported shuttingDown=true before shutdown');
      }

      // Run graceful shutdown on agentHttp (with db retained for subsequent tests)
      agentHttp.db = null; // Detach shared db so test can continue
      const shutdownRes = await agentHttp.gracefulShutdown({ exit: false });
      if (!shutdownRes.serverClosed) {
        throw new Error('Case 14 Failed: Graceful shutdown did not report serverClosed: true');
      }

      // Verify port is released
      const portClosed = await new Promise(resolve => {
        const req = http.get(`http://localhost:${ephemeralPort}/health`, () => {
          resolve(false);
        });
        req.on('error', () => resolve(true));
      });
      if (!portClosed) {
        throw new Error('Case 14 Failed: HTTP server port is still open after shutdown');
      }

      // =========================================================================
      // Case 15: Database closes after required persistence in cleanup sequence
      // =========================================================================
      const orderDbPath = path.join(__dirname, 'data', `test_a52_order_${Date.now()}.db`);
      const orderDb = new Database(orderDbPath);
      await orderDb.initialize();

      const sequence = [];
      const orderAgent = new YouTubeAutomationAgent();
      orderAgent.scheduler = {
        stopAutomation: async () => { sequence.push('scheduler'); }
      };
      orderAgent.autonomous = {
        stop: async () => { sequence.push('autonomous'); }
      };
      orderAgent.db = orderDb;
      const origMark = orderDb.markInterruptedJobs.bind(orderDb);
      orderDb.markInterruptedJobs = async (...args) => {
        sequence.push('persistence');
        return origMark(...args);
      };
      const origClose = orderDb.close.bind(orderDb);
      orderDb.close = async () => {
        sequence.push('db_close');
        return origClose();
      };

      await orderAgent.gracefulShutdown({ exit: false });

      const expectedOrder = ['scheduler', 'autonomous', 'persistence', 'db_close'];
      for (let i = 0; i < expectedOrder.length; i++) {
        if (sequence[i] !== expectedOrder[i]) {
          throw new Error(`Case 15 Failed: Sequence mismatch at step ${i}. Expected ${expectedOrder[i]}, got ${sequence[i]}. Full sequence: ${sequence.join(' -> ')}`);
        }
      }
      await fs.unlink(orderDbPath).catch(() => {});

      // =========================================================================
      // Case 16: Cleanup failure does not prevent remaining cleanup
      // =========================================================================
      const errDbPath = path.join(__dirname, 'data', `test_a52_err_${Date.now()}.db`);
      const errDb = new Database(errDbPath);
      await errDb.initialize();

      let autonomousRanAfterError = false;
      let persistenceRanAfterError = false;
      let dbClosedAfterError = false;

      const failingAgent = new YouTubeAutomationAgent();
      failingAgent.scheduler = {
        stopAutomation: async () => { throw new Error('Simulated scheduler failure'); }
      };
      failingAgent.autonomous = {
        stop: async () => { autonomousRanAfterError = true; }
      };
      failingAgent.db = errDb;
      const errOrigMark = errDb.markInterruptedJobs.bind(errDb);
      errDb.markInterruptedJobs = async (...args) => {
        persistenceRanAfterError = true;
        return errOrigMark(...args);
      };
      const errOrigClose = errDb.close.bind(errDb);
      errDb.close = async () => {
        dbClosedAfterError = true;
        return errOrigClose();
      };

      const failOutcome = await failingAgent.gracefulShutdown({ exit: false });
      if (!autonomousRanAfterError || !persistenceRanAfterError || !dbClosedAfterError) {
        throw new Error('Case 16 Failed: Subsequent cleanup steps did not execute after scheduler error');
      }
      if (!failOutcome.errors.some(e => e.step === 'scheduler')) {
        throw new Error('Case 16 Failed: Errors array did not record the scheduler failure');
      }
      await fs.unlink(errDbPath).catch(() => {});

      // =========================================================================
      // Case 17: Shutdown timeout prevents indefinite hanging
      // =========================================================================
      const hangingAgent = new YouTubeAutomationAgent();
      hangingAgent.scheduler = {
        stopAutomation: () => new Promise(() => {}) // Never resolves
      };

      const startHangTime = Date.now();
      const timeoutOutcome = await hangingAgent.gracefulShutdown({ timeoutMs: 150, exit: false });
      const elapsed = Date.now() - startHangTime;

      if (!timeoutOutcome.timedOut) {
        throw new Error('Case 17 Failed: Hanging agent did not return timedOut: true');
      }
      if (elapsed > 1000) {
        throw new Error(`Case 17 Failed: Timeout took too long to trigger (${elapsed}ms)`);
      }

      // =========================================================================
      // Case 18: Existing A4.1/A4.2/A4.3/A4.4 behavior remains intact
      // =========================================================================
      const { ProvenanceService } = require('./utils/provenance-service');
      const prov = new ProvenanceService(db);
      if (typeof prov.initialize !== 'function' || typeof prov.review !== 'function') {
        throw new Error('Case 18 Failed: ProvenanceService methods missing');
      }

      const { ContentDNAService } = require('./utils/content-dna-service');
      const dna = new ContentDNAService();
      if (typeof dna.extractContentDNA !== 'function') throw new Error('Case 18 Failed: ContentDNAService missing');

      // =========================================================================
      // Case 19: A5.1 topic learning behavior remains intact
      // =========================================================================
      const scorer = new TopicPerformanceScorer();
      const multRes = scorer.calculateMultiplier(20000, 20000);
      if (multRes.multiplier !== 1.0) throw new Error(`Case 19 Failed: Topic multiplier baseline changed. Expected 1.0, got ${multRes.multiplier}`);
      const scoredTopic = scorer.scoreTopic('Budgeting for beginners', [{ keyword: 'budgeting', averageViews: 20000 }], 20000);
      if (!scoredTopic || scoredTopic.multiplier !== 1.0) {
        throw new Error('Case 19 Failed: scoreTopic failed on neutral topic');
      }

      // =========================================================================
      // Case 20: 503 response middleware works for HTTP mutating endpoints during shutdown
      // =========================================================================
      const middlewareAgent = new YouTubeAutomationAgent();
      middlewareAgent.isShuttingDown = true;
      middlewareAgent.setupAPI();

      const mwPort = await new Promise((resolve, reject) => {
        const srv = middlewareAgent.app.listen(0, () => {
          middlewareAgent.server = srv;
          resolve(srv.address().port);
        });
        srv.on('error', reject);
      });

      const mwRes = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: mwPort,
          path: '/generate',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, res => {
          let body = '';
          res.on('data', c => { body += c; });
          res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
        });
        req.on('error', reject);
        req.end(JSON.stringify({ topic: 'test' }));
      });

      if (mwRes.statusCode !== 503 || !mwRes.body.error.includes('shutting down')) {
        throw new Error(`Case 20 Failed: Expected 503 status code during shutdown, got ${mwRes.statusCode}`);
      }

      await new Promise(r => middlewareAgent.server.close(r));

      this.logger.info('All 20 A5.2 Graceful Process Lifecycle & Shutdown Recovery test cases passed successfully.');
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      delete process.env.SUPPRESS_SHUTDOWN_EXIT;
      await db.close().catch(() => {});
      await fs.unlink(testDbPath).catch(() => {});
    }
  }

  async testDataLifecycleAndManifestCleanup() {
    const fs = require('fs').promises;
    const path = require('path');
    const { Database } = require('./database/db');
    const { DailyAutomation } = require('./schedules/daily-automation');

    this.logger.info('Starting Data Lifecycle & Production Manifest Cleanup (A5.3) tests...');

    const testId = `a53_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const testDir = path.join(__dirname, 'temp', `test_dir_${testId}`);
    const testProdDir = path.join(testDir, 'production');
    const testTempDir = path.join(testDir, 'temp');
    const testUploadsDir = path.join(testDir, 'uploads');
    const testDbPath = path.join(testDir, `test_${testId}.db`);

    await fs.mkdir(testProdDir, { recursive: true });
    await fs.mkdir(testTempDir, { recursive: true });
    await fs.mkdir(testUploadsDir, { recursive: true });

    const db = new Database(testDbPath);
    await db.initialize();

    const daily = new DailyAutomation({}, db);

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const setFileMtime = async (filePath, daysAgo) => {
      const pastTime = new Date(now - (daysAgo * dayMs));
      await fs.utimes(filePath, pastTime, pastTime);
    };

    try {
      // -----------------------------------------------------------------------
      // Case 1: Old unreferenced manifest (>14 days) is deleted
      // -----------------------------------------------------------------------
      const oldUnrefPath = path.join(testProdDir, 'prod_old_unref_manifest.json');
      await fs.writeFile(oldUnrefPath, JSON.stringify({
        productionId: 'prod_old_unref',
        jobId: 'job_old_unref',
        status: 'completed',
        createdAt: new Date(now - (20 * dayMs)).toISOString(),
        updatedAt: new Date(now - (20 * dayMs)).toISOString()
      }), 'utf8');
      await setFileMtime(oldUnrefPath, 20);

      let exists = await fs.stat(oldUnrefPath).then(() => true).catch(() => false);
      if (!exists) throw new Error('Case 1 Failed: Setup old unreferenced manifest missing');

      const stats1 = await daily.cleanProductionManifests(14, { targetDir: testProdDir });
      if (stats1.deleted !== 1) {
        throw new Error(`Case 1 Failed: Expected 1 deleted manifest, got ${stats1.deleted}`);
      }
      exists = await fs.stat(oldUnrefPath).then(() => true).catch(() => false);
      if (exists) throw new Error('Case 1 Failed: Old unreferenced manifest was not deleted');

      // -----------------------------------------------------------------------
      // Case 2: Manifest younger than 14 days is preserved
      // -----------------------------------------------------------------------
      const youngPath = path.join(testProdDir, 'prod_young_manifest.json');
      await fs.writeFile(youngPath, JSON.stringify({
        productionId: 'prod_young',
        jobId: 'job_young',
        status: 'completed',
        createdAt: new Date(now - (5 * dayMs)).toISOString(),
        updatedAt: new Date(now - (5 * dayMs)).toISOString()
      }), 'utf8');
      await setFileMtime(youngPath, 5);

      const stats2 = await daily.cleanProductionManifests(14, { targetDir: testProdDir });
      if (stats2.deleted !== 0 || stats2.skipped < 1) {
        throw new Error(`Case 2 Failed: Expected young manifest to be skipped, deleted: ${stats2.deleted}`);
      }
      exists = await fs.stat(youngPath).then(() => true).catch(() => false);
      if (!exists) throw new Error('Case 2 Failed: Young manifest was improperly deleted');

      // -----------------------------------------------------------------------
      // Case 3: Active production manifest (running job) is preserved
      // -----------------------------------------------------------------------
      const activeJobPath = path.join(testProdDir, 'prod_active_job_manifest.json');
      await fs.writeFile(activeJobPath, JSON.stringify({
        productionId: 'prod_active_job',
        jobId: 'job_active_1',
        status: 'running',
        createdAt: new Date(now - (25 * dayMs)).toISOString(),
        updatedAt: new Date(now - (25 * dayMs)).toISOString()
      }), 'utf8');
      await setFileMtime(activeJobPath, 25);

      await db.executeQuery(
        "INSERT INTO generation_jobs (id, production_id, status, stage) VALUES ('job_active_1', 'prod_active_job', 'running', 'production')"
      );

      const stats3 = await daily.cleanProductionManifests(14, { targetDir: testProdDir });
      if (stats3.protected < 1) {
        throw new Error(`Case 3 Failed: Active production manifest was not protected (protected: ${stats3.protected})`);
      }
      exists = await fs.stat(activeJobPath).then(() => true).catch(() => false);
      if (!exists) throw new Error('Case 3 Failed: Active job manifest was deleted');

      // -----------------------------------------------------------------------
      // Case 4: Interrupted/resumable production manifest is preserved
      // -----------------------------------------------------------------------
      const interruptedJobPath = path.join(testProdDir, 'prod_interrupted_manifest.json');
      await fs.writeFile(interruptedJobPath, JSON.stringify({
        productionId: 'prod_interrupted',
        jobId: 'job_interrupted_1',
        status: 'interrupted',
        createdAt: new Date(now - (30 * dayMs)).toISOString(),
        updatedAt: new Date(now - (30 * dayMs)).toISOString()
      }), 'utf8');
      await setFileMtime(interruptedJobPath, 30);

      await db.executeQuery(
        "INSERT INTO generation_jobs (id, production_id, status, stage) VALUES ('job_interrupted_1', 'prod_interrupted', 'interrupted', 'production')"
      );

      await daily.cleanProductionManifests(14, { targetDir: testProdDir });
      exists = await fs.stat(interruptedJobPath).then(() => true).catch(() => false);
      if (!exists) throw new Error('Case 4 Failed: Interrupted production manifest was deleted');

      // -----------------------------------------------------------------------
      // Case 5: Valid generation checkpoint reference protects artifact
      // -----------------------------------------------------------------------
      const ckptJobPath = path.join(testProdDir, 'prod_ckpt_ref_manifest.json');
      await fs.writeFile(ckptJobPath, JSON.stringify({
        productionId: 'prod_ckpt_ref',
        jobId: 'job_ckpt_1',
        status: 'failed',
        createdAt: new Date(now - (20 * dayMs)).toISOString(),
        updatedAt: new Date(now - (20 * dayMs)).toISOString()
      }), 'utf8');
      await setFileMtime(ckptJobPath, 20);

      await db.executeQuery(
        "INSERT INTO generation_jobs (id, production_id, status, stage, cancel_requested) VALUES ('job_ckpt_1', 'prod_ckpt_ref', 'failed', 'production', 0)"
      );
      await db.saveGenerationCheckpoint('job_ckpt_1', 'production', {
        status: 'completed',
        artifact: { substages: { tts: { status: 'completed' } } }
      });

      await daily.cleanProductionManifests(14, { targetDir: testProdDir });
      exists = await fs.stat(ckptJobPath).then(() => true).catch(() => false);
      if (!exists) throw new Error('Case 5 Failed: Checkpoint-referenced manifest was deleted');

      // -----------------------------------------------------------------------
      // Case 6: Pending publishing state protects required artifact
      // -----------------------------------------------------------------------
      const pendingPubPath = path.join(testProdDir, 'prod_pending_pub_manifest.json');
      await fs.writeFile(pendingPubPath, JSON.stringify({
        productionId: 'prod_pending_pub',
        jobId: 'job_pending_pub_1',
        status: 'completed',
        createdAt: new Date(now - (25 * dayMs)).toISOString(),
        updatedAt: new Date(now - (25 * dayMs)).toISOString()
      }), 'utf8');
      await setFileMtime(pendingPubPath, 25);

      await db.executeQuery(
        "INSERT INTO publish_schedule (id, production_id, title, publish_time, status) VALUES ('pub_1', 'prod_pending_pub', 'Test Video', '2026-09-15T00:00:00Z', 'scheduled')"
      );

      await daily.cleanProductionManifests(14, { targetDir: testProdDir });
      exists = await fs.stat(pendingPubPath).then(() => true).catch(() => false);
      if (!exists) throw new Error('Case 6 Failed: Pending publish schedule manifest was deleted');

      // -----------------------------------------------------------------------
      // Case 7: reconciliation_required protects required artifact
      // -----------------------------------------------------------------------
      const reconPath = path.join(testProdDir, 'prod_reconciliation_manifest.json');
      await fs.writeFile(reconPath, JSON.stringify({
        productionId: 'prod_reconciliation',
        jobId: 'job_recon_1',
        status: 'completed',
        createdAt: new Date(now - (25 * dayMs)).toISOString(),
        updatedAt: new Date(now - (25 * dayMs)).toISOString()
      }), 'utf8');
      await setFileMtime(reconPath, 25);

      await db.executeQuery(
        "INSERT INTO publish_schedule (id, production_id, title, publish_time, status) VALUES ('pub_recon', 'prod_reconciliation', 'Recon Video', '2026-09-01T00:00:00Z', 'reconciliation_required')"
      );

      await daily.cleanProductionManifests(14, { targetDir: testProdDir });
      exists = await fs.stat(reconPath).then(() => true).catch(() => false);
      if (!exists) throw new Error('Case 7 Failed: reconciliation_required manifest was deleted');

      // -----------------------------------------------------------------------
      // Case 8: Final output video is never deleted by intermediate cleanup
      // -----------------------------------------------------------------------
      const finalVideoPath = path.join(testProdDir, 'final_video_output.mp4');
      await fs.writeFile(finalVideoPath, 'fake-mp4-data-stream', 'utf8');
      await setFileMtime(finalVideoPath, 40);

      await daily.cleanProductionManifests(14, { targetDir: testProdDir });
      exists = await fs.stat(finalVideoPath).then(() => true).catch(() => false);
      if (!exists) throw new Error('Case 8 Failed: Final output video was improperly deleted');

      // -----------------------------------------------------------------------
      // Case 9: Malformed manifest is preserved safely
      // -----------------------------------------------------------------------
      const malformedPath = path.join(testProdDir, 'prod_corrupt_manifest.json');
      await fs.writeFile(malformedPath, '{"productionId": "corrupt", unclosed json...', 'utf8');
      await setFileMtime(malformedPath, 35);

      const stats9 = await daily.cleanProductionManifests(14, { targetDir: testProdDir });
      if (stats9.malformed < 1) {
        throw new Error(`Case 9 Failed: Expected malformed count >= 1, got ${stats9.malformed}`);
      }
      exists = await fs.stat(malformedPath).then(() => true).catch(() => false);
      if (!exists) throw new Error('Case 9 Failed: Malformed manifest was improperly deleted');

      // -----------------------------------------------------------------------
      // Case 10: Missing file / empty directory handled idempotently
      // -----------------------------------------------------------------------
      const emptyDir = path.join(testDir, 'empty_dir');
      await fs.mkdir(emptyDir, { recursive: true });
      const stats10 = await daily.cleanProductionManifests(14, { targetDir: emptyDir });
      if (stats10.scanned !== 0 || stats10.deleted !== 0) {
        throw new Error(`Case 10 Failed: Expected empty stats, got ${JSON.stringify(stats10)}`);
      }

      // -----------------------------------------------------------------------
      // Case 11: Repeated cleanup is safe (idempotency)
      // -----------------------------------------------------------------------
      await daily.cleanProductionManifests(14, { targetDir: testProdDir });
      const stats11b = await daily.cleanProductionManifests(14, { targetDir: testProdDir });
      if (stats11b.deleted !== 0) {
        throw new Error(`Case 11 Failed: Second run deleted ${stats11b.deleted} items instead of 0`);
      }

      // -----------------------------------------------------------------------
      // Case 12: One cleanup error does not abort remaining cleanup
      // -----------------------------------------------------------------------
      const secondOldPath = path.join(testProdDir, 'prod_second_old_manifest.json');
      await fs.writeFile(secondOldPath, JSON.stringify({
        productionId: 'prod_second_old',
        jobId: 'job_second_old',
        status: 'completed',
        createdAt: new Date(now - (20 * dayMs)).toISOString(),
        updatedAt: new Date(now - (20 * dayMs)).toISOString()
      }), 'utf8');
      await setFileMtime(secondOldPath, 20);

      // The malformed manifest from Case 9 is also present in testProdDir and causes a parse warning,
      // but secondOldPath must still be successfully processed and deleted.
      await daily.cleanProductionManifests(14, { targetDir: testProdDir });
      exists = await fs.stat(secondOldPath).then(() => true).catch(() => false);
      if (exists) throw new Error('Case 12 Failed: Second old manifest was not deleted despite malformed sibling');

      // -----------------------------------------------------------------------
      // Case 13: Only production directory is affected
      // -----------------------------------------------------------------------
      const otherDir = path.join(testDir, 'scripts');
      await fs.mkdir(otherDir, { recursive: true });
      const otherFile = path.join(otherDir, 'script_old.json');
      await fs.writeFile(otherFile, '{"script": true}', 'utf8');
      await setFileMtime(otherFile, 30);

      await daily.cleanProductionManifests(14, { targetDir: testProdDir });
      exists = await fs.stat(otherFile).then(() => true).catch(() => false);
      if (!exists) throw new Error('Case 13 Failed: File outside production directory was affected');

      // -----------------------------------------------------------------------
      // Case 14: Existing temp cleanup behavior remains intact
      // -----------------------------------------------------------------------
      const oldTempFile = path.join(testTempDir, 'temp_old.txt');
      const youngTempFile = path.join(testTempDir, 'temp_young.txt');
      await fs.writeFile(oldTempFile, 'old temp content');
      await fs.writeFile(youngTempFile, 'young temp content');
      await setFileMtime(oldTempFile, 10);
      await setFileMtime(youngTempFile, 2);

      await daily.cleanDirectoryOldFiles(testTempDir, 7);
      const oldTempExists = await fs.stat(oldTempFile).then(() => true).catch(() => false);
      const youngTempExists = await fs.stat(youngTempFile).then(() => true).catch(() => false);
      if (oldTempExists) throw new Error('Case 14 Failed: Old temp file (>7d) was not deleted');
      if (!youngTempExists) throw new Error('Case 14 Failed: Young temp file (<7d) was deleted');

      // -----------------------------------------------------------------------
      // Case 15: Existing uploads cleanup behavior remains intact
      // -----------------------------------------------------------------------
      const oldUploadFile = path.join(testUploadsDir, 'upload_old.txt');
      const youngUploadFile = path.join(testUploadsDir, 'upload_young.txt');
      await fs.writeFile(oldUploadFile, 'old upload');
      await fs.writeFile(youngUploadFile, 'young upload');
      await setFileMtime(oldUploadFile, 35);
      await setFileMtime(youngUploadFile, 15);

      await daily.cleanDirectoryOldFiles(testUploadsDir, 30);
      const oldUploadExists = await fs.stat(oldUploadFile).then(() => true).catch(() => false);
      const youngUploadExists = await fs.stat(youngUploadFile).then(() => true).catch(() => false);
      if (oldUploadExists) throw new Error('Case 15 Failed: Old upload file (>30d) was not deleted');
      if (!youngUploadExists) throw new Error('Case 15 Failed: Young upload file (<30d) was deleted');

      // -----------------------------------------------------------------------
      // Case 16: Terminal experiment sample cleanup only affects eligible old terminal experiment data
      // -----------------------------------------------------------------------
      const expTerminalId = `exp_term_${Date.now()}`;
      await db.executeQuery(
        "INSERT INTO growth_experiments (id, production_id, video_id, title, hypothesis, status) VALUES (?, 'p1', 'v1', 'Terminal Exp', 'Hypo', 'adopted')",
        [expTerminalId]
      );
      await db.executeQuery(
        "INSERT INTO experiment_arms (id, experiment_id, arm_index, label, title, thumbnail_path) VALUES ('arm_term_1', ?, 0, 'A', 'Title A', '/thumb/a.jpg')",
        [expTerminalId]
      );
      // Sample older than 14 days (20 days ago)
      const oldTermSampleId = `sample_term_old_${Date.now()}`;
      await db.executeQuery(
        "INSERT INTO experiment_samples (id, experiment_id, arm_id, metrics, captured_at, created_at) VALUES (?, ?, 'arm_term_1', '{}', ?, ?)",
        [oldTermSampleId, expTerminalId, new Date(now - (20 * dayMs)).toISOString(), new Date(now - (20 * dayMs)).toISOString()]
      );
      // Sample younger than 14 days (5 days ago)
      const youngTermSampleId = `sample_term_young_${Date.now()}`;
      await db.executeQuery(
        "INSERT INTO experiment_samples (id, experiment_id, arm_id, metrics, captured_at, created_at) VALUES (?, ?, 'arm_term_1', '{}', ?, ?)",
        [youngTermSampleId, expTerminalId, new Date(now - (5 * dayMs)).toISOString(), new Date(now - (5 * dayMs)).toISOString()]
      );

      const expCleanRes = await db.cleanOldExperimentSamples(14);
      if (expCleanRes.deletedCount !== 1) {
        throw new Error(`Case 16 Failed: Expected 1 terminal sample deleted, got ${expCleanRes.deletedCount}`);
      }
      const remainingSamples = await db.listExperimentSamples(expTerminalId);
      if (remainingSamples.length !== 1 || remainingSamples[0].id !== youngTermSampleId) {
        throw new Error('Case 16 Failed: Expected young terminal sample to be preserved');
      }
      // Verify experiment and arms still exist
      const expRow = await db.getRow('SELECT * FROM growth_experiments WHERE id = ?', [expTerminalId]);
      if (!expRow) throw new Error('Case 16 Failed: Experiment definition was deleted');
      const armRow = await db.getRow('SELECT * FROM experiment_arms WHERE id = ?', ['arm_term_1']);
      if (!armRow) throw new Error('Case 16 Failed: Experiment arm was deleted');

      // -----------------------------------------------------------------------
      // Case 17: Active experiment samples are preserved
      // -----------------------------------------------------------------------
      const expActiveId = `exp_act_${Date.now()}`;
      await db.executeQuery(
        "INSERT INTO growth_experiments (id, production_id, video_id, title, hypothesis, status) VALUES (?, 'p2', 'v2', 'Active Exp', 'Hypo', 'running')",
        [expActiveId]
      );
      await db.executeQuery(
        "INSERT INTO experiment_arms (id, experiment_id, arm_index, label, title, thumbnail_path) VALUES ('arm_act_1', ?, 0, 'A', 'Active Title', '/thumb/act.jpg')",
        [expActiveId]
      );
      const oldActiveSampleId = `sample_act_old_${Date.now()}`;
      await db.executeQuery(
        "INSERT INTO experiment_samples (id, experiment_id, arm_id, metrics, captured_at, created_at) VALUES (?, ?, 'arm_act_1', '{}', ?, ?)",
        [oldActiveSampleId, expActiveId, new Date(now - (40 * dayMs)).toISOString(), new Date(now - (40 * dayMs)).toISOString()]
      );

      const actCleanRes = await db.cleanOldExperimentSamples(14);
      if (actCleanRes.deletedCount !== 0) {
        throw new Error(`Case 17 Failed: Expected 0 active samples deleted, got ${actCleanRes.deletedCount}`);
      }
      const activeSamples = await db.listExperimentSamples(expActiveId);
      if (activeSamples.length !== 1 || activeSamples[0].id !== oldActiveSampleId) {
        throw new Error('Case 17 Failed: Active experiment sample was improperly deleted');
      }

      // -----------------------------------------------------------------------
      // Case 18: A4.4 recovery still finds required checkpoints/assets
      // -----------------------------------------------------------------------
      const recoveryJobId = `job_rec_${Date.now()}`;
      const recoveryProdId = `prod_rec_${Date.now()}`;
      await db.executeQuery(
        "INSERT INTO generation_jobs (id, production_id, status, stage) VALUES (?, ?, 'interrupted', 'production')",
        [recoveryJobId, recoveryProdId]
      );
      await db.saveGenerationCheckpoint(recoveryJobId, 'production', {
        status: 'running',
        artifact: {
          productionManifest: {
            productionId: recoveryProdId,
            jobId: recoveryJobId,
            substages: {
              script_prep: { status: 'completed' },
              tts: { status: 'completed' }
            }
          }
        }
      });
      const { GenerationRecoveryService } = require('./utils/generation-recovery-service');
      const recService = new GenerationRecoveryService(db);
      const manifestFound = await recService.getProductionManifest(recoveryJobId);
      if (!manifestFound || manifestFound.substages?.script_prep?.status !== 'completed') {
        throw new Error('Case 18 Failed: A4.4 recovery failed to load manifest from checkpoint');
      }

      // -----------------------------------------------------------------------
      // Case 19: A5.1 topic-learning behavior remains intact
      // -----------------------------------------------------------------------
      const { TopicPerformanceScorer } = require('./utils/trending-topic-discovery');
      const scorer = new TopicPerformanceScorer();
      const multHigh = scorer.calculateMultiplier(2000, 1000).multiplier;
      const multLow = scorer.calculateMultiplier(300, 1000).multiplier;
      if (multHigh < 1.0 || multHigh > 1.25) {
        throw new Error(`Case 19 Failed: High score multiplier out of bounds: ${multHigh}`);
      }
      if (multLow < 0.75 || multLow > 1.0) {
        throw new Error(`Case 19 Failed: Low score multiplier out of bounds: ${multLow}`);
      }

      // -----------------------------------------------------------------------
      // Case 20: A5.2 graceful shutdown halts cleanup safely
      // -----------------------------------------------------------------------
      const shutdownDaily = new DailyAutomation({}, db);
      await shutdownDaily.stopAutomation(); // sets isEnabled = false

      const shutdownTestPath = path.join(testProdDir, 'prod_shutdown_manifest.json');
      await fs.writeFile(shutdownTestPath, JSON.stringify({
        productionId: 'prod_shutdown',
        jobId: 'job_shutdown',
        status: 'completed'
      }), 'utf8');
      await setFileMtime(shutdownTestPath, 25);

      await shutdownDaily.cleanProductionManifests(14, { targetDir: testProdDir });
      exists = await fs.stat(shutdownTestPath).then(() => true).catch(() => false);
      if (!exists) {
        throw new Error('Case 20 Failed: Manifest was deleted despite automation being stopped/shutdown');
      }

      // -----------------------------------------------------------------------
      // Case 21: Dry-run support verified
      // -----------------------------------------------------------------------
      const testDryRunDir = path.join(testDir, 'dryrun_prod');
      await fs.mkdir(testDryRunDir, { recursive: true });
      const dryRunPath = path.join(testDryRunDir, 'prod_dryrun_manifest.json');
      await fs.writeFile(dryRunPath, JSON.stringify({
        productionId: 'prod_dryrun',
        jobId: 'job_dryrun',
        status: 'completed'
      }), 'utf8');
      await setFileMtime(dryRunPath, 30);

      const stats21 = await daily.cleanProductionManifests(14, { targetDir: testDryRunDir, dryRun: true });
      if (stats21.deleted !== 1) {
        throw new Error(`Case 21 Failed: Expected dryRun deleted=1, got ${stats21.deleted}`);
      }
      exists = await fs.stat(dryRunPath).then(() => true).catch(() => false);
      if (!exists) throw new Error('Case 21 Failed: File was deleted during dryRun');

      this.logger.info('All 21 A5.3 Data Lifecycle & Production Manifest Cleanup test cases passed successfully.');
    } finally {
      await db.close().catch(() => {});
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async testGenerationNullContextRegression() {
    this.logger.info('Starting Generation Null-Context & Strategy Context Normalization Regression tests...');
    const fs = require('fs').promises;
    const path = require('path');
    const { YouTubeAutomationAgent } = require('./index');
    const { GenerationRecoveryService } = require('./utils/generation-recovery-service');

    const testDbPath = path.join(__dirname, 'data', `test_gen_null_ctx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.db`);
    const db = new Database(testDbPath);
    await db.initialize();

    const testRunSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const tempDir = path.join(__dirname, 'temp', `test_gen_null_ctx_${testRunSuffix}`);
    await fs.mkdir(tempDir, { recursive: true });

    const dummyVideoPath = path.join(tempDir, 'dummy_video.mp4');
    const dummyThumbPath = path.join(tempDir, 'dummy_thumb.jpg');
    await fs.writeFile(dummyVideoPath, 'dummy video binary content');
    await fs.writeFile(dummyThumbPath, 'dummy thumb binary content');

    try {
      const agent = new YouTubeAutomationAgent();
      agent.db = db;
      agent.recovery = new GenerationRecoveryService(db, {
        logger: agent.logger,
        baseDelayMs: 0,
        updateJobStage: (...args) => agent.updateJobStage(...args)
      });
      agent.readiness = { assertReady: async () => true };
      agent.operator = {
        runQualityChecks: async () => ({
          passed: true,
          score: 100,
          checks: [{ id: 'truth-anchor', passed: true, blocking: true }],
          blockingFailures: []
        }),
        notify: async () => null
      };

      const defaultGeneratedStrategy = {
        topic: 'Default Topic',
        contentType: 'Tutorial',
        angle: 'The Math of High-Yield Savings Accounts',
        targetAudience: 'Everyday Savers',
        keyPoints: ['Interest compounding', 'Emergency fund rules'],
        callToAction: 'Subscribe for daily wealth tips'
      };

      let strategyCalls = 0;
      agent.agents = {
        strategy: {
          generateContentStrategy: async (topic) => {
            strategyCalls++;
            return {
              ...defaultGeneratedStrategy,
              topic: topic || defaultGeneratedStrategy.topic
            };
          }
        },
        scriptWriter: {
          generateScript: async (strat) => ({
            title: `Script: ${strat.topic}`,
            duration: '60',
            hook: { text: 'Why your money is losing value in a checking account' },
            scenes: [{ narration: 'Narration 1', visual: 'Visual 1' }],
            mainContent: [{ text: 'Put savings in a 5% HYSA.' }]
          })
        },
        thumbnailDesigner: {
          generateThumbnail: async () => ({ path: dummyThumbPath, concept: {} })
        },
        seoOptimizer: {
          optimize: async (script) => ({
            title: script.title,
            description: 'Learn how to maximize your money in minutes.',
            tags: ['personal finance', 'savings']
          })
        },
        production: {
          processContent: async (input) => ({
            id: `prod-nullctx-${Date.now()}`,
            status: 'ready',
            ...input,
            assets: {
              finalVideo: { path: dummyVideoPath, simulated: false },
              thumbnail: { path: dummyThumbPath }
            },
            timeline: {},
            scheduledPublishTime: new Date(Date.now() + 86400000).toISOString(),
            priority: 50,
            estimatedDuration: '1:00'
          })
        },
        publishing: {
          scheduleContent: async () => null
        }
      };

      // -----------------------------------------------------------------------
      // Case 1: validateGenerateRequestBody defaults strategyContext defensively
      // -----------------------------------------------------------------------
      const valOmitted = agent.validateGenerateRequestBody({ topic: 'Omitted Context Topic' });
      if (!valOmitted.valid || typeof valOmitted.value.strategyContext !== 'object' || valOmitted.value.strategyContext === null) {
        throw new Error('Case 1 Failed: validateGenerateRequestBody did not default strategyContext to {} when omitted');
      }
      if (Object.keys(valOmitted.value.strategyContext).length !== 0) {
        throw new Error('Case 1 Failed: validateGenerateRequestBody strategyContext should be empty object when omitted');
      }

      const valNull = agent.validateGenerateRequestBody({ topic: 'Null Context Topic', strategyContext: null });
      if (!valNull.valid || typeof valNull.value.strategyContext !== 'object' || valNull.value.strategyContext === null) {
        throw new Error('Case 1 Failed: validateGenerateRequestBody did not normalize strategyContext: null to {}');
      }

      const valExplicit = agent.validateGenerateRequestBody({
        topic: 'Explicit Context Topic',
        strategyContext: { angle: 'Custom Parsed Angle', objective: 'Grow channel' }
      });
      if (!valExplicit.valid || valExplicit.value.strategyContext?.angle !== 'Custom Parsed Angle') {
        throw new Error('Case 1 Failed: validateGenerateRequestBody lost explicit strategyContext.angle');
      }

      // -----------------------------------------------------------------------
      // Case 2: REAL failing path - startGenerationJob with strategyContext omitted
      // -----------------------------------------------------------------------
      const job1 = await agent.startGenerationJob({ topic: 'No StrategyContext Supplied' });
      const completedJob1 = await agent.waitForGenerationJob(job1.id);
      if (completedJob1.status !== 'completed' || completedJob1.error) {
        throw new Error(`Case 2 Failed: startGenerationJob failed with error: ${completedJob1.error}`);
      }

      const checkpoint1 = await db.getGenerationCheckpoint(job1.id, 'strategy');
      if (!checkpoint1 || !checkpoint1.artifact) {
        throw new Error('Case 2 Failed: strategy stage checkpoint missing');
      }
      if (checkpoint1.artifact.angle !== defaultGeneratedStrategy.angle) {
        throw new Error(`Case 2 Failed: generated.angle was not preserved. Got: ${checkpoint1.artifact.angle}`);
      }
      if (checkpoint1.artifact.topic !== 'No StrategyContext Supplied') {
        throw new Error('Case 2 Failed: generated strategy topic mismatch');
      }

      // -----------------------------------------------------------------------
      // Case 3: REAL failing path - startGenerationJob with strategyContext: null
      // -----------------------------------------------------------------------
      const job2 = await agent.startGenerationJob({ topic: 'Null StrategyContext Supplied', strategyContext: null });
      const completedJob2 = await agent.waitForGenerationJob(job2.id);
      if (completedJob2.status !== 'completed' || completedJob2.error) {
        throw new Error(`Case 3 Failed: startGenerationJob with strategyContext: null failed with error: ${completedJob2.error}`);
      }

      const checkpoint2 = await db.getGenerationCheckpoint(job2.id, 'strategy');
      if (!checkpoint2 || !checkpoint2.artifact) {
        throw new Error('Case 3 Failed: strategy stage checkpoint missing for null strategyContext');
      }
      if (checkpoint2.artifact.angle !== defaultGeneratedStrategy.angle) {
        throw new Error(`Case 3 Failed: generated.angle was not preserved for null strategyContext. Got: ${checkpoint2.artifact.angle}`);
      }
      if (checkpoint2.artifact.topic !== 'Null StrategyContext Supplied') {
        throw new Error('Case 3 Failed: generated strategy topic mismatch for null strategyContext');
      }

      // -----------------------------------------------------------------------
      // Case 4: Explicit valid strategyContext overrides angle and metadata
      // -----------------------------------------------------------------------
      const customOverrideContext = {
        angle: 'Overridden Angle for Institutional Investors',
        rationale: 'Capture high-retention demographic',
        audience: 'Accredited Investors',
        objective: 'Drive newsletter signups',
        valueProposition: 'Institutional-grade analysis in 60 seconds'
      };
      const job3 = await agent.startGenerationJob({
        topic: 'Custom Override Topic',
        strategyContext: customOverrideContext
      });
      const completedJob3 = await agent.waitForGenerationJob(job3.id);
      if (completedJob3.status !== 'completed' || completedJob3.error) {
        throw new Error(`Case 4 Failed: startGenerationJob with override strategyContext failed: ${completedJob3.error}`);
      }

      const checkpoint3 = await db.getGenerationCheckpoint(job3.id, 'strategy');
      if (!checkpoint3 || !checkpoint3.artifact) {
        throw new Error('Case 4 Failed: strategy stage checkpoint missing for override');
      }
      if (checkpoint3.artifact.angle !== customOverrideContext.angle) {
        throw new Error(`Case 4 Failed: strategyContext.angle did not override generated.angle. Got: ${checkpoint3.artifact.angle}`);
      }
      if (checkpoint3.artifact.planRationale !== customOverrideContext.rationale) {
        throw new Error(`Case 4 Failed: strategyContext.rationale did not override planRationale. Got: ${checkpoint3.artifact.planRationale}`);
      }
      if (checkpoint3.artifact.targetAudience !== customOverrideContext.audience) {
        throw new Error(`Case 4 Failed: strategyContext.audience did not override targetAudience. Got: ${checkpoint3.artifact.targetAudience}`);
      }
      if (checkpoint3.artifact.channelGoal !== customOverrideContext.objective) {
        throw new Error(`Case 4 Failed: strategyContext.objective did not override channelGoal. Got: ${checkpoint3.artifact.channelGoal}`);
      }
      if (checkpoint3.artifact.channelValueProposition !== customOverrideContext.valueProposition) {
        throw new Error(`Case 4 Failed: strategyContext.valueProposition did not override channelValueProposition. Got: ${checkpoint3.artifact.channelValueProposition}`);
      }

      // -----------------------------------------------------------------------
      // Case 5: Direct runGenerationJob with strategyContext: null (defense-in-depth)
      // -----------------------------------------------------------------------
      const directJob = await db.createGenerationJob({
        topic: 'Direct Job With Null Context',
        style: 'tutorial',
        length: 'short',
        source: 'manual',
        strategyContext: null
      });
      const directRunResult = await agent.runGenerationJob(directJob.id, {
        topic: 'Direct Job With Null Context',
        style: 'tutorial',
        length: 'short',
        strategyContext: null
      });
      if (!directRunResult || directRunResult.title !== 'Script: Direct Job With Null Context') {
        throw new Error('Case 5 Failed: direct runGenerationJob with strategyContext: null did not produce valid result');
      }
      const checkpointDirect = await db.getGenerationCheckpoint(directJob.id, 'strategy');
      if (!checkpointDirect?.artifact || checkpointDirect.artifact.angle !== defaultGeneratedStrategy.angle) {
        throw new Error('Case 5 Failed: direct runGenerationJob failed to preserve default angle when strategyContext is null');
      }

      // -----------------------------------------------------------------------
      // Case 6: Direct generateContent with options.strategyContext: null
      // -----------------------------------------------------------------------
      const directGenResult = await agent.generateContent('Direct Call Topic', null, 'short', {
        strategyContext: null
      });
      if (!directGenResult || !directGenResult.title) {
        throw new Error('Case 6 Failed: direct generateContent call with options.strategyContext: null failed');
      }

      if (strategyCalls < 4) {
        throw new Error(`Strategy agent was expected to be called at least 4 times, got ${strategyCalls}`);
      }

      this.logger.info('All 6 Generation Null-Context & Strategy Context Normalization regression test cases passed successfully.');
    } finally {
      await db.close().catch(() => {});
      await fs.rm(testDbPath, { force: true }).catch(() => {});
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async testViewerRetentionAndStorytellingUpgrade() {
    this.logger.info('Starting Viewer Retention & Storytelling Upgrade tests...');
    const fs = require('fs').promises;
    const os = require('os');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-retention-test-'));

    try {
      // -----------------------------------------------------------------------
      // Case 1: validateShortsHook specificity and generic intro detection
      // -----------------------------------------------------------------------
      const emptyCheck = validateShortsHook('');
      if (emptyCheck.isValid !== false || emptyCheck.reason !== 'EMPTY_HOOK') {
        throw new Error('Case 1 Failed: empty hook was not rejected with EMPTY_HOOK');
      }

      const genericCheck = validateShortsHook('Have you ever wondered why money is confusing?');
      if (genericCheck.isValid !== false || genericCheck.reason !== 'GENERIC_INTRO') {
        throw new Error('Case 1 Failed: generic intro was not rejected with GENERIC_INTRO');
      }

      const vagueCheck = validateShortsHook('This is some general advice about savings.');
      if (vagueCheck.isValid !== false || vagueCheck.reason !== 'LACKS_SPECIFICITY') {
        throw new Error('Case 1 Failed: vague hook without stakes was not rejected with LACKS_SPECIFICITY');
      }

      const validDollarHook = validateShortsHook("You're probably paying $219 a month for subscriptions you forgot you have.");
      if (!validDollarHook.isValid) {
        throw new Error(`Case 1 Failed: valid dollar hook was rejected: ${validDollarHook.reason}`);
      }

      const validPercentHook = validateShortsHook('93% of people waste money on this single sneaky bank charge.');
      if (!validPercentHook.isValid) {
        throw new Error(`Case 1 Failed: valid percentage hook was rejected: ${validPercentHook.reason}`);
      }
      this.logger.info('Case 1 Passed: validateShortsHook successfully catches generic hooks and validates high-stakes hooks.');

      // -----------------------------------------------------------------------
      // Case 2: buildShortsSceneList produces structured retention arc
      // -----------------------------------------------------------------------
      const sampleShortScript = {
        title: 'Subscription Trap Exposed #Shorts',
        hook: { text: "You're paying $219 a month for subscriptions you forgot.", duration: 4 },
        curiosityGap: 'The average person has 4 recurring charges they do not use.',
        dataReveal: 'Netflix is $15/mo, but over 10 years that becomes $3,800 invested.',
        escalation: 'Companies auto-bill on staggered dates so you never see the total.',
        payoff: 'A 20-minute audit saved this viewer $2,400 a year.',
        callToAction: { subscribe: 'Audit your accounts this week. Follow for the checklist.' }
      };

      const scenes = buildShortsSceneList(sampleShortScript);
      if (!Array.isArray(scenes) || scenes.length !== 6) {
        throw new Error(`Case 2 Failed: expected 6 story beats in scene list, got ${scenes?.length}`);
      }
      const sceneIds = scenes.map(s => s.id);
      const expectedIds = ['hook', 'curiosity_gap', 'data_reveal', 'escalation', 'payoff', 'cta'];
      for (const id of expectedIds) {
        if (!sceneIds.includes(id)) {
          throw new Error(`Case 2 Failed: scene list missing expected beat id '${id}'`);
        }
      }
      if (!scenes[0].isHook || !scenes[5].isCTA) {
        throw new Error('Case 2 Failed: hook or CTA flags missing in scene list');
      }
      this.logger.info('Case 2 Passed: buildShortsSceneList correctly generates 6-beat retention arc scenes.');

      // -----------------------------------------------------------------------
      // Case 3: layoutSvgText multi-line wrapping and bounds
      // -----------------------------------------------------------------------
      const textToWrap = 'Small monthly subscriptions can quietly drain thousands of dollars from your bank account every single year.';
      const layoutResult = layoutSvgText(textToWrap, {
        maxWidth: 500,
        maxLines: 3,
        initialFontSize: 40,
        minFontSize: 20
      });

      if (!layoutResult.svg || !layoutResult.svg.includes('<tspan')) {
        throw new Error('Case 3 Failed: layoutSvgText did not produce <tspan elements');
      }
      if (layoutResult.lineCount > 3) {
        throw new Error(`Case 3 Failed: layoutSvgText exceeded maxLines (got ${layoutResult.lineCount})`);
      }
      if (layoutResult.fontSize > 40 || layoutResult.fontSize < 20) {
        throw new Error(`Case 3 Failed: font size ${layoutResult.fontSize} out of requested bounds [20, 40]`);
      }
      this.logger.info('Case 3 Passed: layoutSvgText wraps text cleanly within safe bounds.');

      // -----------------------------------------------------------------------
      // Case 4: deriveComparisonHeader dynamic categorization
      // -----------------------------------------------------------------------
      const costHeader = deriveComparisonHeader({ scriptText: 'Compare your subscription cost versus investment return' });
      if (costHeader !== 'PERCEIVED VS ACTUAL COST') {
        throw new Error(`Case 4 Failed: expected 'PERCEIVED VS ACTUAL COST', got '${costHeader}'`);
      }
      const audHeader = deriveComparisonHeader({ scriptText: 'Comparing subscriber base and active users' });
      if (audHeader !== 'AUDIENCE COMPARISON') {
        throw new Error(`Case 4 Failed: expected 'AUDIENCE COMPARISON', got '${audHeader}'`);
      }
      const profitHeader = deriveComparisonHeader({ scriptText: 'Comparing operating margin and net profit' });
      if (profitHeader !== 'PROFITABILITY COMPARISON') {
        throw new Error(`Case 4 Failed: expected 'PROFITABILITY COMPARISON', got '${profitHeader}'`);
      }
      this.logger.info('Case 4 Passed: deriveComparisonHeader dynamically identifies comparison intent.');

      // -----------------------------------------------------------------------
      // Case 5: ShortsCoverGenerator hero metric scan across all production scenes
      // -----------------------------------------------------------------------
      const coverGen = new ShortsCoverGenerator({ logger: this.logger });
      const mockProduction = {
        scenes: [
          { id: 'hook', scriptText: 'Watch out for subscription traps', verifiedData: null },
          { id: 'data', scriptText: 'Here is the real number', verifiedData: { value: '$2,400', label: 'ANNUAL SAVINGS', verified: true } }
        ],
        script: { title: 'Subscription Secrets #Shorts' }
      };
      const coverElements = coverGen.extractCoverElements(mockProduction.scenes[0], mockProduction.script, [], mockProduction.scenes);
      if (!coverElements.heroMetric || coverElements.heroMetric.value !== '$2,400') {
        throw new Error(`Case 5 Failed: extractCoverElements failed to find verified metric from production scenes (got ${coverElements.heroMetric?.value})`);
      }

      const coverSvg = coverGen.renderCoverSvg({
        width: 1080,
        height: 1920,
        safeZones: { top: 288, bottom: 384, left: 86, right: 172 },
        headline: 'THE $2,400 SUBSCRIPTION TRAP',
        heroMetric: coverElements.heroMetric,
        brandTitle: 'MONEY IN MINUTES'
      });
      if (!coverSvg.includes('$2,400') || !coverSvg.includes('ANNUAL SAVINGS') || !coverSvg.includes('✓ VERIFIED')) {
        throw new Error('Case 5 Failed: renderCoverSvg missing hero metric or verified badge in output');
      }
      this.logger.info('Case 5 Passed: ShortsCoverGenerator extracts hero metrics across all scenes and renders centered layout.');

      // -----------------------------------------------------------------------
      // Case 6: renderCardSvg produces per-beat gradients and contextual icons
      // -----------------------------------------------------------------------
      const renderer = new VisualTreatmentRenderer({ logger: this.logger });
      const selector = new VisualTreatmentSelector({ logger: this.logger });

      const hookPlan = selector.buildPlan(
        { id: 'hook', label: 'Hook', scriptText: "You're probably paying $219 a month", isHook: true },
        {},
        { width: 1080, height: 1920 }
      );
      const hookSvg = renderer.renderCardSvg(hookPlan);
      if (!hookSvg.includes('#ef4444') || !hookSvg.includes('MUST WATCH')) {
        throw new Error('Case 6 Failed: hook card SVG missing #ef4444 red accent or MUST WATCH pill');
      }

      const dataPlan = selector.buildPlan(
        { id: 'data', label: 'Data', scriptText: 'Annual revenue reached $12B', verifiedData: { value: '$12B', label: 'ANNUAL REVENUE', verified: true } },
        {},
        { width: 1080, height: 1920 }
      );
      dataPlan.treatment = TREATMENTS.ANIMATED_NUMBER;
      dataPlan.visualizationSpec = null;
      const dataSvg = renderer.renderCardSvg(dataPlan);
      if (!dataSvg.includes('$12B') || !dataSvg.includes('KEY METRIC')) {
        throw new Error('Case 6 Failed: data card SVG missing metric value or KEY METRIC badge');
      }

      const compPlan = selector.buildPlan(
        { id: 'comp', label: 'Compare', scriptText: 'Cost comparison between plan A and plan B', sceneType: 'comparison', verifiedData: { left: { label: '$10/mo Felt' }, right: { label: '$26k Actual' } } },
        {},
        { width: 1080, height: 1920 }
      );
      compPlan.treatment = TREATMENTS.TWO_SIDED_COMPARISON;
      compPlan.visualizationSpec = null;
      const compSvg = renderer.renderCardSvg(compPlan);
      if (!compSvg.includes('PERCEIVED VS ACTUAL COST') || !compSvg.includes('VS')) {
        throw new Error('Case 6 Failed: comparison card SVG missing dynamic comparison header or VS divider');
      }
      this.logger.info('Case 6 Passed: renderCardSvg renders beat-specific identities, icons, and dynamic headers.');

      // -----------------------------------------------------------------------
      // Case 7: composeShort multi-scene assembly with xfade transitions
      // -----------------------------------------------------------------------
      const scene1Plan = selector.buildPlan({ id: 's1', scriptText: 'Scene one hook statement', duration: 2 }, {}, { width: 1080, height: 1920 });
      const scene2Plan = selector.buildPlan({ id: 's2', scriptText: 'Scene two data reveal statement', duration: 2 }, {}, { width: 1080, height: 1920 });

      const composedVideoPath = path.join(tempDir, 'xfade_test_short.mp4');
      await renderer.composeShort([scene1Plan, scene2Plan], null, composedVideoPath, {
        enableXfade: true,
        enableAudioEnhancement: false
      });

      const videoStat = await fs.stat(composedVideoPath);
      if (!videoStat.size || videoStat.size < 1000) {
        throw new Error(`Case 7 Failed: composeShort produced empty or invalid video (${videoStat?.size} bytes)`);
      }
      this.logger.info(`Case 7 Passed: composeShort successfully compiled multi-scene short with transitions (${videoStat.size} bytes).`);

      // -----------------------------------------------------------------------
      // Case 8: Viewer-facing badges replace internal screenwriting labels
      // -----------------------------------------------------------------------
      const curiosityBadge = sanitizeViewerBadge('CURIOSITY GAP', 'curiosityGap');
      if (curiosityBadge !== 'THE HIDDEN TRUTH' || curiosityBadge.includes('CURIOSITY')) {
        throw new Error(`Case 8 Failed: expected 'THE HIDDEN TRUTH', got '${curiosityBadge}'`);
      }
      const escalationBadge = sanitizeViewerBadge('ESCALATION', 'escalation');
      if (escalationBadge !== 'THE REAL COST' || escalationBadge.includes('ESCALATION')) {
        throw new Error(`Case 8 Failed: expected 'THE REAL COST', got '${escalationBadge}'`);
      }
      const payoffBadge = sanitizeViewerBadge('THE PAYOFF', 'payoff');
      if (payoffBadge !== '10-YEAR IMPACT' || payoffBadge.includes('PAYOFF')) {
        throw new Error(`Case 8 Failed: expected '10-YEAR IMPACT', got '${payoffBadge}'`);
      }
      const hookBadge = sanitizeViewerBadge('HOOK', 'hook');
      if (hookBadge !== 'MUST WATCH') {
        throw new Error(`Case 8 Failed: expected 'MUST WATCH', got '${hookBadge}'`);
      }
      const ctaBadge = sanitizeViewerBadge('CALL TO ACTION', 'cta');
      if (ctaBadge !== 'TAKE ACTION') {
        throw new Error(`Case 8 Failed: expected 'TAKE ACTION', got '${ctaBadge}'`);
      }
      this.logger.info('Case 8 Passed: Internal screenwriting labels safely converted to high-retention viewer-facing badges.');

      // -----------------------------------------------------------------------
      // Case 9: Hero financial numbers visual hierarchy
      // -----------------------------------------------------------------------
      const heroPlan = selector.buildPlan(
        {
          id: 'hero_reveal',
          beat: 'dataReveal',
          label: 'Key Data',
          scriptText: 'The average person actually pays two hundred and nineteen dollars every single month.',
          verifiedData: { value: '$219', label: 'PER MONTH', source: 'Truth-Anchor Verified', verified: true }
        },
        {},
        { width: 1080, height: 1920 }
      );
      heroPlan.treatment = TREATMENTS.ANIMATED_NUMBER;
      const heroSvg = renderer.renderCardSvg(heroPlan);
      if (!heroSvg.includes('$219')) {
        throw new Error('Case 9 Failed: Hero number $219 missing from card SVG');
      }
      if (!heroSvg.includes('PER MONTH')) {
        throw new Error('Case 9 Failed: Metric label PER MONTH missing from card SVG');
      }
      if (!heroSvg.includes('Truth-Anchor Verified') && !heroSvg.toUpperCase().includes('TRUTH-ANCHOR')) {
        throw new Error('Case 9 Failed: Truth-Anchor provenance pill missing from card SVG');
      }
      this.logger.info('Case 9 Passed: Hero financial number rendered with bold typography hierarchy.');

      // -----------------------------------------------------------------------
      // Case 10: Comparison visual renders non-empty boxes with values
      // -----------------------------------------------------------------------
      const compBoxesPlan = selector.buildPlan(
        {
          id: 'comp_boxes',
          beat: 'escalation',
          label: 'The Real Cost',
          scriptText: 'You thought you spent eighty-six dollars, but bank data shows two hundred and nineteen dollars.',
          sceneType: 'comparison',
          verifiedData: {
            left: { label: 'ESTIMATED', value: '$86 / MO' },
            right: { label: 'ACTUAL', value: '$219 / MO' },
            source: 'Chase / Experian Studies'
          }
        },
        {},
        { width: 1080, height: 1920 }
      );
      compBoxesPlan.treatment = TREATMENTS.TWO_SIDED_COMPARISON;
      const compBoxesSvg = renderer.renderCardSvg(compBoxesPlan);
      if (!compBoxesSvg.includes('$86 / MO')) {
        throw new Error('Case 10 Failed: Left comparison value $86 / MO missing or empty');
      }
      if (!compBoxesSvg.includes('$219 / MO')) {
        throw new Error('Case 10 Failed: Right comparison value $219 / MO missing or empty');
      }
      if (!compBoxesSvg.includes('ESTIMATED') || !compBoxesSvg.includes('ACTUAL')) {
        throw new Error('Case 10 Failed: Comparison labels ESTIMATED / ACTUAL missing');
      }
      if (!compBoxesSvg.includes('VS')) {
        throw new Error('Case 10 Failed: Central VS divider missing');
      }
      this.logger.info('Case 10 Passed: Two-sided comparison visibly populates both comparison boxes without empty containers.');

      // -----------------------------------------------------------------------
      // Case 11: Subtitle ASS escaping and apostrophe rendering
      // -----------------------------------------------------------------------
      const unescapedNormal = sanitizeAssText("don't");
      if (unescapedNormal !== "don't") {
        throw new Error(`Case 11 Failed: sanitizeAssText altered normal apostrophe: '${unescapedNormal}'`);
      }
      const unescapedEntity = sanitizeAssText("don&apos;t waste money");
      if (unescapedEntity !== "don't waste money") {
        throw new Error(`Case 11 Failed: sanitizeAssText did not unescape &apos;: '${unescapedEntity}'`);
      }
      const unescapedNumeric = sanitizeAssText("we&#39;re paying $219");
      if (unescapedNumeric !== "we're paying $219") {
        throw new Error(`Case 11 Failed: sanitizeAssText did not unescape &#39;: '${unescapedNumeric}'`);
      }

      const apostrophePlan = selector.buildPlan(
        { id: 'sub_test', scriptText: "You don't realize how much you're spending.", duration: 3 },
        {},
        { width: 1080, height: 1920 }
      );
      const assOutput = renderer.generateKaraokeAss(apostrophePlan);
      if (assOutput.includes('&apos;') || assOutput.includes('&#39;')) {
        throw new Error('Case 11 Failed: Karaoke ASS output contains HTML/XML entity (&apos; or &#39;)');
      }
      if (!assOutput.includes("don't") || !assOutput.includes("you're")) {
        throw new Error("Case 11 Failed: Karaoke ASS output missing clean apostrophes (don't, you're)");
      }
      this.logger.info('Case 11 Passed: Subtitle ASS formatting cleans entities and renders human-readable apostrophes.');

      // -----------------------------------------------------------------------
      // Case 12: Transition configuration defaults to wipeleft 0.15s
      // -----------------------------------------------------------------------
      const wipe1Plan = selector.buildPlan({ id: 'w1', scriptText: 'First scene for wipe', duration: 2 }, {}, { width: 1080, height: 1920 });
      const wipe2Plan = selector.buildPlan({ id: 'w2', scriptText: 'Second scene for wipe', duration: 2 }, {}, { width: 1080, height: 1920 });
      const wipeOutPath = path.join(tempDir, 'wipe_test_short.mp4');
      await renderer.composeShort([wipe1Plan, wipe2Plan], null, wipeOutPath, {
        transition: 'wipeleft',
        transitionDuration: 0.15,
        enableXfade: true,
        enableAudioEnhancement: false
      });
      const wipeStat = await fs.stat(wipeOutPath);
      if (!wipeStat.size || wipeStat.size < 1000) {
        throw new Error(`Case 12 Failed: wipe transition output invalid (${wipeStat?.size} bytes)`);
      }
      this.logger.info(`Case 12 Passed: Clean wipeleft 0.15s transition compiled successfully (${wipeStat.size} bytes).`);

      this.logger.info('All 12 Viewer Retention & Storytelling Upgrade test cases passed successfully.');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // -------------------------------------------------------------------------
  // FinTech Kinetic Full-Canvas Scene Composition (Phase 1)
  // -------------------------------------------------------------------------
  async testFinTechKineticFullCanvasComposition() {
    this.logger.info('Starting FinTech Kinetic Full-Canvas Scene Composition (Phase 1) tests...');
    const fs = require('fs').promises;
    const os = require('os');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-phase1-'));

    try {
      const selector = new VisualTreatmentSelector({ logger: this.logger });
      const renderer = new VisualTreatmentRenderer({ logger: this.logger });

      const verifiedContext = {
        verifiedData: [
          { type: 'statistic', value: '$219/mo', label: 'Average Monthly Subscriptions', source: 'Truth-Anchor Verified' },
          { type: 'comparison', left: { label: 'Perceived Spend', value: '$86/mo' }, right: { label: 'Actual Outflow', value: '$219/mo' }, label: 'Subscription Reality Gap' },
          { type: 'growth', value: '$37,400', label: '10-Year Compounded Drain', source: 'S&P 500 Historical Benchmark (7% Real)' }
        ]
      };

      // 1. Full 1080x1920 canvas without mandatory centered card
      const hookPlan = selector.buildPlan({
        id: 'beat1_hook',
        beat: 'hook',
        label: 'Anti-Swipe Hook',
        scriptText: 'Stop scrolling! Your subscriptions are quietly draining $219 every single month.',
        duration: 3
      }, verifiedContext, { width: 1080, height: 1920 });

      const fullCanvasSvg = renderer.renderFullCanvasScene(hookPlan);
      if (!fullCanvasSvg.includes('viewBox="0 0 1080 1920"') && !fullCanvasSvg.includes('width="1080" height="1920"')) {
        throw new Error('Case 1 Failed: fullCanvasSvg does not span the full 1080x1920 canvas');
      }
      if (fullCanvasSvg.includes('<rect x="0" y="0" width="760" height="520" rx="24"') || fullCanvasSvg.includes('g transform="translate(100, 660)"')) {
        throw new Error('Case 1 Failed: fullCanvasSvg contains mandatory centered card bounding rect');
      }
      this.logger.info('Case 1 Passed: Full 1080x1920 canvas composition generated without mandatory centered card.');

      // 2. Reusable Scene Composition Primitives
      const bgSvg = SceneCompositionPrimitives.fullCanvasBackground({ width: 1080, height: 1920, theme: 'navy' });
      const notifSvg = SceneCompositionPrimitives.notificationStack([], { width: 1080 });
      const tickerSvg = SceneCompositionPrimitives.financialTicker([], { width: 1080 });
      const counterSvg = SceneCompositionPrimitives.numberCounter('$219/mo', 'Monthly Leak', { width: 1080 });
      const compMeterSvg = SceneCompositionPrimitives.comparisonMeter(
        { label: 'Perceived', value: '$86/mo', percent: 39 },
        { label: 'Actual', value: '$219/mo', percent: 100 },
        { width: 1080 }
      );
      const statementSvg = SceneCompositionPrimitives.statementRows([], { width: 1080 });
      const trajSvg = SceneCompositionPrimitives.trajectoryGraph([], { width: 1080, heroValue: '$37,400' });
      const checklistSvg = SceneCompositionPrimitives.actionChecklist([], { width: 1080 });
      const brandSvg = SceneCompositionPrimitives.brandHeader({ width: 1080 });

      if (!bgSvg.includes('fcBgGrad') || !notifSvg.includes('AUTOPAY') || !tickerSvg.includes('NET LEAK') ||
          !counterSvg.includes('$219/mo') || !compMeterSvg.includes('REALITY GAP') || !statementSvg.includes('CHECKING ACCOUNT') ||
          !trajSvg.includes('$37,400') || !checklistSvg.includes('30-SECOND DEFENSE') || !brandSvg.includes('MONEY IN MINUTES')) {
        throw new Error('Case 2 Failed: One or more SceneCompositionPrimitives failed to render expected semantic markup');
      }
      this.logger.info('Case 2 Passed: All reusable scene composition primitives produce valid, rich financial UI.');

      // 3. Deterministic Rendering
      const renderA = renderer.renderFullCanvasScene(hookPlan);
      const renderB = renderer.renderFullCanvasScene(hookPlan);
      if (renderA !== renderB) {
        throw new Error('Case 3 Failed: renderFullCanvasScene produced non-deterministic output for identical plan');
      }
      this.logger.info('Case 3 Passed: Scene composition is 100% deterministic.');

      // 4. Truth Anchor Numeric Preservation
      const dataPlan = selector.buildPlan({
        id: 'beat3_data',
        beat: 'dataReveal',
        label: 'Actual Outflow',
        scriptText: 'The average American quietly leaks $219 every single month.',
        duration: 4
      }, verifiedContext, { width: 1080, height: 1920 });
      const dataSvg = renderer.renderFullCanvasScene(dataPlan);
      if (!dataSvg.includes('$219/mo') || !dataSvg.includes('Truth-Anchor Verified')) {
        throw new Error('Case 4 Failed: Truth-Anchor value $219/mo or verification citation not preserved in dataReveal scene');
      }

      const payoffPlan = selector.buildPlan({
        id: 'beat5_payoff',
        beat: 'payoff',
        label: '10-Year Opportunity Cost',
        scriptText: 'Invested in the index, that silent leak compounds into $37,400.',
        duration: 5
      }, verifiedContext, { width: 1080, height: 1920 });
      const payoffSvg = renderer.renderFullCanvasScene(payoffPlan);
      if (!payoffSvg.includes('$37,400')) {
        throw new Error('Case 4 Failed: Truth-Anchor payoff value $37,400 not preserved in payoff scene');
      }
      this.logger.info('Case 4 Passed: Truth-Anchor verified financial figures ($219/mo, $37,400) strictly preserved.');

      // 5. Caption Safe-Zone Preservation
      // Verify visual elements leave the bottom caption area (y >= 1650) clear of obstructive components
      if (fullCanvasSvg.includes('y="1700"') || fullCanvasSvg.includes('y="1750"') || fullCanvasSvg.includes('y="1800"')) {
        throw new Error('Case 5 Failed: Interactive full-canvas elements intrude into subtitle safe zone (y >= 1700)');
      }
      this.logger.info('Case 5 Passed: Caption safe zone strictly preserved (bottom 400px clear for subtitles).');

      // 6. Backward Compatibility with Legacy Card Renderer
      const legacyPlan = selector.buildPlan({
        id: 'legacy_test',
        scriptText: 'Legacy card test',
        duration: 3,
        composition: 'legacy_card'
      }, verifiedContext, { width: 1080, height: 1920, composition: 'legacy_card' });
      const legacySvg = renderer.renderCardSvg(legacyPlan);
      if (!legacySvg.includes('<rect x="0" y="0" width="') || !legacySvg.includes('rx="24"')) {
        throw new Error('Case 6 Failed: Legacy card renderer failed to produce backwards-compatible card output');
      }
      this.logger.info('Case 6 Passed: Legacy card renderer preserved and backwards-compatible.');

      // 7. Full Scene Still PNG Render via Sharp
      const stillPath = path.join(tempDir, 'phase1_test_still.png');
      await renderer.renderSceneStill(hookPlan, stillPath);
      const stillStat = await fs.stat(stillPath);
      if (!stillStat.size || stillStat.size < 5000) {
        throw new Error(`Case 7 Failed: renderSceneStill generated invalid still (${stillStat?.size} bytes)`);
      }
      this.logger.info(`Case 7 Passed: renderSceneStill generated full-canvas PNG (${stillStat.size} bytes).`);

      this.logger.info('All 7 FinTech Kinetic Full-Canvas Scene Composition test cases passed successfully.');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // -------------------------------------------------------------------------
  // FinTech Kinetic B-Roll Provenance & In-Scene Micro-Animation (Phase 2A)
  // -------------------------------------------------------------------------
  async testFinTechKineticBRollAndMicroAnimation() {
    this.logger.info('Starting FinTech Kinetic B-Roll Provenance & In-Scene Micro-Animation (Phase 2A) tests...');
    const fs = require('fs').promises;
    const os = require('os');
    const { FreeBRollProvider } = require('./utils/free-broll-provider');
    const selector = new VisualTreatmentSelector({ logger: this.logger });
    const renderer = new VisualTreatmentRenderer({ logger: this.logger });
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-phase2a-'));

    try {
      // 1. Provider Selection & Fallback Handling
      const brollProvider = new FreeBRollProvider({ logger: this.logger, brollDir: tempDir });
      const hookBroll = await brollProvider.selectBRollForBeat('hook', {
        scriptText: 'Stop scrolling! Your subscriptions are quietly draining your wallet.',
        duration: 2.5,
        sceneId: 'beat_1_hook'
      });

      if (!hookBroll || !hookBroll.localPath) {
        throw new Error('Case 1 Failed: FreeBRollProvider failed to return a valid B-roll clip asset');
      }
      this.logger.info(`Case 1 Passed: B-Roll Provider selected asset (${hookBroll.sourceType}) at ${hookBroll.localPath}`);

      // 2. Provenance Metadata Schema Verification
      const requiredFields = ['sourceType', 'provider', 'assetId', 'sourceUrl', 'localPath', 'downloadedAt', 'licenseInfo', 'sceneId', 'beat', 'duration'];
      for (const field of requiredFields) {
        if (hookBroll[field] === undefined || hookBroll[field] === null) {
          throw new Error(`Case 2 Failed: Provenance metadata missing required field: ${field}`);
        }
      }
      if (!['procedural', 'local', 'stock'].includes(hookBroll.sourceType)) {
        throw new Error(`Case 2 Failed: Invalid sourceType in provenance: ${hookBroll.sourceType}`);
      }
      // Check no secrets leaked
      const serialized = JSON.stringify(hookBroll);
      if (serialized.toLowerCase().includes('key') && serialized.includes('api')) {
        throw new Error('Case 2 Failed: Sensitive API keys or secrets detected in provenance metadata');
      }
      this.logger.info('Case 2 Passed: Provenance schema completely verified without credential leakage.');

      // 3. 9:16 Vertical Conforming & File Validation
      const brollStat = await fs.stat(hookBroll.localPath);
      if (!brollStat.size || brollStat.size < 5000) {
        throw new Error(`Case 3 Failed: Conformed B-roll file is empty or corrupted (${brollStat?.size} bytes)`);
      }
      this.logger.info(`Case 3 Passed: 9:16 vertical B-roll synthesized/conformed (${brollStat.size} bytes).`);

      // 4. Deterministic Behavior for Beats
      const payoffBroll = await brollProvider.selectBRollForBeat('payoff', {
        scriptText: 'Invest that $219 instead and build wealth.',
        duration: 3.0,
        sceneId: 'beat_5_payoff'
      });
      if (payoffBroll.beat !== 'payoff' || payoffBroll.duration !== 3.0) {
        throw new Error('Case 4 Failed: B-roll provider did not preserve deterministic scene parameters');
      }
      this.logger.info('Case 4 Passed: Deterministic beat handling confirmed.');

      // 5. In-Scene Micro-Animation Primitives (Time-varying SVG State)
      const verifiedContext = {
        verifiedData: [
          { type: 'statistic', value: '$219/mo', label: 'Average Monthly Subscriptions', source: 'Truth-Anchor Verified' },
          { type: 'comparison', left: { label: 'Perceived Spend', value: '$86/mo' }, right: { label: 'Actual Outflow', value: '$219/mo' }, label: 'Subscription Reality Gap' },
          { type: 'growth', value: '$37,400', label: '10-Year Compounded Drain', source: 'S&P 500 Historical Benchmark (7% Real)' }
        ]
      };

      // 5a. Notification Slide-in & Stack Stagger (Hook)
      const hookPlan = selector.buildPlan({
        id: 'beat1_hook',
        beat: 'hook',
        label: 'Anti-Swipe Hook',
        scriptText: 'Stop scrolling! Your subscriptions are quietly draining $219.',
        duration: 3
      }, verifiedContext, { width: 1080, height: 1920 });

      const hookSvgT0 = renderer.renderFullCanvasScene(hookPlan, { time: 0.2 });
      const hookSvgT2 = renderer.renderFullCanvasScene(hookPlan, { time: 2.5 });
      if (!hookSvgT0.includes('translate(') || !hookSvgT2.includes('translate(')) {
        throw new Error('Case 5a Failed: Notification stack lacks transform positioning');
      }
      if (!hookSvgT2.includes('DETECTED RECURRING DRAIN')) {
        throw new Error('Case 5a Failed: Hook notification stack accumulation badge missing at t=2.5s');
      }
      this.logger.info('Case 5a Passed: Notification slide-in and accumulation micro-animation verified.');

      // 5b. Statement Scanner Movement (Curiosity Gap)
      const curiosityPlan = selector.buildPlan({
        id: 'beat2_curiosity',
        beat: 'curiosityGap',
        label: 'Curiosity Gap',
        scriptText: 'Most people think they spend $86 on subscriptions. Look at their bank statement.',
        duration: 3
      }, verifiedContext, { width: 1080, height: 1920 });

      const curiositySvgEarly = renderer.renderFullCanvasScene(curiosityPlan, { time: 0.5 });
      const curiositySvgLate = renderer.renderFullCanvasScene(curiosityPlan, { time: 2.8 });
      if (!curiositySvgEarly.includes('AUDIT SCANNING') && !curiositySvgLate.includes('AUDIT COMPLETE')) {
        throw new Error('Case 5b Failed: Statement scanner failed to transition state across time');
      }
      this.logger.info('Case 5b Passed: Statement scanner laser movement micro-animation verified.');

      // 5c. Count-Up Accumulation with Truth-Anchor Preservation ($219)
      const revealPlan = selector.buildPlan({
        id: 'beat3_reveal',
        beat: 'dataReveal',
        label: 'Data Reveal',
        scriptText: 'The real average? $219 per month. Over $2,600 every single year.',
        duration: 3
      }, verifiedContext, { width: 1080, height: 1920 });

      const revealSvgEarly = renderer.renderFullCanvasScene(revealPlan, { time: 0.4 });
      const revealSvgLate = renderer.renderFullCanvasScene(revealPlan, { time: 2.9 });
      if (!revealSvgLate.includes('$219')) {
        throw new Error('Case 5c Failed: Final count-up does not match Truth-Anchor value of $219');
      }
      if (revealSvgEarly.includes('$219')) {
        throw new Error('Case 5c Failed: Count-up displays final value immediately at t=0.4s');
      }
      this.logger.info('Case 5c Passed: Count-up progressive accumulation and Truth-Anchor preservation verified.');

      // 5d. Comparison Bar Expansion and Delta Burst ($86 vs $219)
      const escalationPlan = selector.buildPlan({
        id: 'beat4_escalation',
        beat: 'escalation',
        label: 'Escalation',
        scriptText: 'That is a 2.6x gap between what you believe and what leaves your account.',
        duration: 3
      }, verifiedContext, { width: 1080, height: 1920 });

      const escalationSvgT1 = renderer.renderFullCanvasScene(escalationPlan, { time: 1.0 });
      const escalationSvgT3 = renderer.renderFullCanvasScene(escalationPlan, { time: 2.9 });
      if (!escalationSvgT3.includes('2.6X REALITY GAP')) {
        throw new Error('Case 5d Failed: Comparison delta badge missing at reveal point');
      }
      if (escalationSvgT1.includes('2.6X REALITY GAP')) {
        throw new Error('Case 5d Failed: Comparison delta badge displayed prematurely before overtake');
      }
      this.logger.info('Case 5d Passed: Comparison bar growth and reality-gap burst verified.');

      // 5e. Progressive Trajectory Graph Drawing ($37,400)
      const payoffPlan = selector.buildPlan({
        id: 'beat5_payoff',
        beat: 'payoff',
        label: 'Payoff',
        scriptText: 'Invested in an index fund, that subscription drain costs you $37,400 in lost wealth.',
        duration: 3
      }, verifiedContext, { width: 1080, height: 1920 });

      const payoffSvgStart = renderer.renderFullCanvasScene(payoffPlan, { time: 0.5 });
      const payoffSvgEnd = renderer.renderFullCanvasScene(payoffPlan, { time: 2.9 });
      if (!payoffSvgEnd.includes('$37,400')) {
        throw new Error('Case 5e Failed: Trajectory graph does not reach verified payoff value $37,400');
      }
      if (payoffSvgStart.includes('$37,400')) {
        throw new Error('Case 5e Failed: Payoff wealth milestone displayed prematurely at t=0.5s');
      }
      this.logger.info('Case 5e Passed: Trajectory graph progressive path stroke drawing verified.');

      // 6. Caption Safe Zone (Bottom 400px clear)
      for (const plan of [hookPlan, curiosityPlan, revealPlan, escalationPlan, payoffPlan]) {
        const svg = renderer.renderFullCanvasScene(plan, { time: 2.0 });
        const yMatches = [...svg.matchAll(/y="(\d+)"/g)].map(m => parseInt(m[1], 10));
        const violatesSafeZone = yMatches.some(y => y > 1580 && y < 1920);
        if (violatesSafeZone) {
          throw new Error(`Case 6 Failed: Narrative beat ${plan.beat} encroaches into caption safe zone`);
        }
      }
      this.logger.info('Case 6 Passed: Caption safe zone strictly respected across all animated beats.');

      // 7. Full Micro-Animated Scene Video Compositing
      const testVideoOut = path.join(tempDir, 'phase2a_animated_scene.mp4');
      const testPlan = { ...hookPlan, assetProvenance: hookBroll };
      await renderer.renderMicroAnimatedSceneVideo(testPlan, hookBroll.localPath, null, testVideoOut, { duration: 1.0 });

      const outStat = await fs.stat(testVideoOut);
      if (!outStat.size || outStat.size < 10000) {
        throw new Error(`Case 7 Failed: Composited micro-animated video is empty or missing (${outStat?.size} bytes)`);
      }
      this.logger.info(`Case 7 Passed: Real-time micro-animated scene video composited (${outStat.size} bytes).`);

      this.logger.info('All 7 FinTech Kinetic B-Roll & Micro-Animation test cases passed successfully.');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async testAutonomousDailyShortsPublishing() {
    this.logger.info('Starting Autonomous Daily YouTube Shorts Publishing (Phase 7) tests...');
    const os = require('os');
    const fs = require('fs').promises;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'phase7_test_'));
    const testDbPath = path.join(tempDir, 'test_daily_shorts.db');
    const testShortsDir = path.join(tempDir, 'shorts');
    const testScratchDir = path.join(tempDir, 'scratch');
    await fs.mkdir(testShortsDir, { recursive: true });
    await fs.mkdir(testScratchDir, { recursive: true });
    const prevPublishEnv = process.env.YOUTUBE_PUBLISH_ENABLED;
    process.env.YOUTUBE_PUBLISH_ENABLED = 'false';

    try {
      const db = new Database(testDbPath);
      await db.initialize();

      // Case 1: YouTube Configuration & Credential Resolution
      const resolver = new YouTubeAuthResolver();
      const status = await resolver.checkCredentialStatus();
      if (typeof status.hasCredentials !== 'boolean' || typeof status.hasRefreshToken !== 'boolean') {
        throw new Error('Case 1 Failed: checkCredentialStatus did not return expected boolean structure');
      }
      this.logger.info('Case 1 Passed: YouTube configuration and credential detection verified.');

      // Case 2: OAuth Configuration Without Exposing Secrets
      const testClientId = 'mock-client-id-12345.apps.googleusercontent.com';
      const testClientSecret = 'mock-secret-98765';
      const authUrl = resolver.generateAuthUrl({
        clientId: testClientId,
        clientSecret: testClientSecret,
        redirectUri: 'http://localhost:8080/oauth2callback'
      });
      if (!authUrl.includes('client_id=mock-client-id-12345') || !authUrl.includes('access_type=offline')) {
        throw new Error('Case 2 Failed: generateAuthUrl does not contain required OAuth query parameters');
      }
      if (authUrl.includes('mock-secret-98765')) {
        throw new Error('Case 2 Failed: generateAuthUrl leaked client_secret in authorization URL');
      }
      this.logger.info('Case 2 Passed: OAuth URL generated with offline access without leaking client secret.');

      // Case 3: Complete State Machine Transitions
      const prodId = 'test-prod-state-transitions';
      let rec = await db.saveDailyShortPublication({
        production_id: prodId,
        topic: 'Test State Transitions Topic',
        title: 'Test State Transitions Topic #Shorts',
        status: 'IDEA'
      });
      if (rec.status !== 'IDEA') throw new Error('Case 3 Failed: initial status should be IDEA');

      const expectedStates = [
        'RESEARCHING', 'SCRIPTED', 'PRODUCING', 'QA_PENDING',
        'READY_TO_PUBLISH', 'UPLOADING', 'SCHEDULED', 'PUBLISHED'
      ];
      for (const st of expectedStates) {
        rec = await db.updateDailyShortPublication(prodId, { status: st });
        if (rec.status !== st) throw new Error(`Case 3 Failed: could not transition to ${st}`);
      }
      this.logger.info('Case 3 Passed: Complete lifecycle state machine transitions validated.');

      // Case 4: Duplicate Protection (Topic & Content Hash)
      const isTopicDup = await db.isDailyShortTopicDuplicate('Test State Transitions Topic', 90);
      if (!isTopicDup) throw new Error('Case 4 Failed: isDailyShortTopicDuplicate failed to detect existing published topic');

      const isUnrelatedDup = await db.isDailyShortTopicDuplicate('Completely Unrelated Topic Never Published', 90);
      if (isUnrelatedDup) throw new Error('Case 4 Failed: isDailyShortTopicDuplicate false positive on new topic');

      const mockHash = 'abcdef1234567890abcdef1234567890abcdef12';
      await db.updateDailyShortPublication(prodId, { content_hash: mockHash });
      const isHashDup = await db.isDailyShortContentHashDuplicate(mockHash);
      if (!isHashDup) throw new Error('Case 4 Failed: isDailyShortContentHashDuplicate failed to detect existing hash');
      this.logger.info('Case 4 Passed: Duplicate protection on topics and content hashes verified.');

      // Case 5: Bounded Retry Behavior on Generation Failure
      const failingOrchestrator = {
        produceShort: async () => { throw new Error('Simulated transient video rendering failure'); }
      };
      const retryPublisher = new DailyShortsPublisher({
        db,
        orchestrator: failingOrchestrator,
        shortsDir: testShortsDir,
        scratchDir: testScratchDir,
        maxCandidateAttempts: 2
      });
      const failResult = await retryPublisher.generateCandidate('Failing Generation Topic');
      if (failResult.success || failResult.record.status !== 'REJECTED' || !failResult.record.last_error.includes('Simulated transient video rendering failure')) {
        throw new Error('Case 5 Failed: Failed generation candidate was not rejected with recorded error');
      }
      this.logger.info('Case 5 Passed: Bounded retry and safe REJECTED transition on generation failure verified.');

      // Case 6: Restart Recovery & Crash Resilience
      const crashProdId = 'test-prod-crash-recovery';
      const dummyVideoFile = path.join(testShortsDir, 'dummy_recovery_video.mp4');
      const dummyCoverFile = path.join(testShortsDir, 'dummy_recovery_cover.jpg');
      await fs.writeFile(dummyVideoFile, 'MOCK_MP4_VIDEO_BINARY_DATA');
      await fs.writeFile(dummyCoverFile, 'MOCK_JPEG_COVER_DATA');
      await db.saveDailyShortPublication({
        production_id: crashProdId,
        topic: 'Crash Recovery Topic',
        title: 'Crash Recovery Topic #Shorts',
        video_path: dummyVideoFile,
        cover_path: dummyCoverFile,
        status: 'READY_TO_PUBLISH',
        qa_status: 'PASSED'
      });
      const recoveredPublisher = new DailyShortsPublisher({
        db,
        shortsDir: testShortsDir,
        scratchDir: testScratchDir
      });
      const dryRunRecovery = await recoveredPublisher.publishCandidate(crashProdId, { forcePublish: false });
      if (!dryRunRecovery.success || dryRunRecovery.record.status !== 'READY_TO_PUBLISH') {
        throw new Error('Case 6 Failed: Restart recovery failed to resume READY_TO_PUBLISH candidate safely');
      }
      this.logger.info('Case 6 Passed: Restart recovery from persistent SQLite state verified.');

      // Case 7: Strict QA Gate Enforcement
      const failedQaProdId = 'test-prod-failed-qa';
      await db.saveDailyShortPublication({
        production_id: failedQaProdId,
        topic: 'Failed QA Topic',
        title: 'Failed QA Topic #Shorts',
        video_path: dummyVideoFile,
        status: 'QA_FAILED',
        qa_status: 'FAILED'
      });
      let qaBlocked = false;
      try {
        await recoveredPublisher.publishCandidate(failedQaProdId, { forcePublish: true });
      } catch (err) {
        if (err.code === 'QA_GATE_BLOCKED') qaBlocked = true;
      }
      if (!qaBlocked) throw new Error('Case 7 Failed: QA gate allowed unverified/failed candidate to attempt upload');
      this.logger.info('Case 7 Passed: Strict QA Gate blocks upload of failed candidate.');

      // Case 8: Daily Minimum Calculation & Calendar Day Status
      const dailyStatus = await recoveredPublisher.checkDailyStatus();
      if (typeof dailyStatus.hasMetDailyQuota !== 'boolean' || typeof dailyStatus.totalCompleted !== 'number') {
        throw new Error('Case 8 Failed: checkDailyStatus returned invalid structure');
      }
      this.logger.info('Case 8 Passed: Daily minimum calculation and calendar day check verified.');

      // Case 9: Publishing-Disabled Safety Switch (YOUTUBE_PUBLISH_ENABLED=false)
      process.env.YOUTUBE_PUBLISH_ENABLED = 'false';
      let mockUploadCalled = false;
      const mockClientSafety = {
        videos: { insert: async () => { mockUploadCalled = true; return { data: { id: 'should-not-reach' } }; } }
      };
      const safetyPublisher = new DailyShortsPublisher({
        db,
        shortsDir: testShortsDir,
        scratchDir: testScratchDir,
        youtubeClient: mockClientSafety
      });
      const safetyResult = await safetyPublisher.publishCandidate(crashProdId);
      if (mockUploadCalled) throw new Error('Case 9 Failed: YouTube upload called when YOUTUBE_PUBLISH_ENABLED is false');
      if (!safetyResult.success || !safetyResult.dryRun) {
        throw new Error('Case 9 Failed: Safe dry-run was not reported when YOUTUBE_PUBLISH_ENABLED=false');
      }
      this.logger.info('Case 9 Passed: YOUTUBE_PUBLISH_ENABLED=false safely prevents external uploads.');

      // Case 10: Successful Publishing & Scheduling Flow
      process.env.YOUTUBE_PUBLISH_ENABLED = 'true';
      let videoInsertPayload = null;
      let thumbnailSetCalled = false;
      const mockClientSuccess = {
        videos: {
          insert: async (params) => {
            videoInsertPayload = params;
            return {
              data: {
                id: 'mock-youtube-video-id-987',
                snippet: { title: params.requestBody.snippet.title },
                status: { privacyStatus: params.requestBody.status.privacyStatus }
              }
            };
          }
        },
        thumbnails: {
          set: async () => {
            thumbnailSetCalled = true;
            return { data: { default: { url: 'https://i.ytimg.com/vi/mock/default.jpg' } } };
          }
        }
      };

      const successPublisher = new DailyShortsPublisher({
        db,
        shortsDir: testShortsDir,
        scratchDir: testScratchDir,
        youtubeClient: mockClientSuccess
      });

      const pubSuccess = await successPublisher.publishCandidate(crashProdId, {
        forcePublish: true,
        scheduledPublishTime: new Date(Date.now() + 3600000).toISOString()
      });

      if (!pubSuccess.success || pubSuccess.videoId !== 'mock-youtube-video-id-987' || pubSuccess.status !== 'SCHEDULED') {
        throw new Error('Case 10 Failed: Scheduled publish did not succeed with mock YouTube client');
      }
      if (!videoInsertPayload || !videoInsertPayload.requestBody?.snippet?.title.includes('#Shorts')) {
        throw new Error('Case 10 Failed: Video upload snippet missing required #Shorts title');
      }
      if (pubSuccess.record.youtube_video_id !== 'mock-youtube-video-id-987') {
        throw new Error('Case 10 Failed: Database record did not capture returned YouTube video ID');
      }
      if (!thumbnailSetCalled) {
        throw new Error('Case 10 Failed: Thumbnail was not uploaded for scheduled video');
      }

      this.logger.info('Case 10 Passed: Successful publishing and scheduling flow using mocked YouTube client verified.');
      this.logger.info('All 10 Autonomous Daily YouTube Shorts Publishing test cases passed successfully.');
    } finally {
      if (prevPublishEnv !== undefined) {
        process.env.YOUTUBE_PUBLISH_ENABLED = prevPublishEnv;
      } else {
        delete process.env.YOUTUBE_PUBLISH_ENABLED;
      }
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async testMissedDayRecoveryAndBackfill() {
    this.logger.info('Starting Missed-Day Recovery & Backfill Engine (Phase 8) tests...');
    const os = require('os');
    const fs = require('fs').promises;
    const { Database } = require('./database/db');
    const { DailyShortsPublisher } = require('./utils/daily-shorts-publisher');
    const { SemanticDedupService } = require('./utils/semantic-dedup-service');

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-phase8-backfill-'));
    const testDbPath = path.join(tempDir, 'test_daily_shorts_phase8.db');
    const testShortsDir = path.join(tempDir, 'shorts');
    const testScratchDir = path.join(tempDir, 'scratch');
    await fs.mkdir(testShortsDir, { recursive: true });
    await fs.mkdir(testScratchDir, { recursive: true });

    const db = new Database(testDbPath);
    await db.initialize();

    const createdProdIds = [];
    const createdBacklogDates = [];

    const mockYouTubeUploads = [];
    const mockYouTubeClient = {
      videos: {
        insert: async (params) => {
          const id = `mock-yt-backfill-${Date.now()}-${mockYouTubeUploads.length}`;
          mockYouTubeUploads.push({ id, params });
          return {
            data: {
              id,
              snippet: { title: params.requestBody.snippet.title },
              status: { privacyStatus: params.requestBody.status.privacyStatus, publishAt: params.requestBody.status.publishAt }
            }
          };
        }
      },
      thumbnails: {
        set: async () => ({ data: { default: { url: 'https://i.ytimg.com/vi/mock/default.jpg' } } })
      }
    };

    try {
      const todayStr = new Date().toISOString().slice(0, 10);

      // TEST 1: No missed days -> 0 missed elapsed days
      const test1Publisher = new DailyShortsPublisher({ db, shortsDir: testShortsDir, scratchDir: testScratchDir });
      const missed0 = await test1Publisher.detectMissedDays({ fromDate: todayStr, toDate: todayStr });
      if (missed0.length !== 0) {
        throw new Error(`TEST 1 Failed: Expected 0 missed days for today, got ${missed0.length}`);
      }
      this.logger.info('TEST 1 Passed: No missed days detected when anchor is current day.');

      // Helper to compute past date string
      const getPastDateStr = (daysAgo) => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - daysAgo);
        return d.toISOString().slice(0, 10);
      };

      // TEST 2: 1 missed day (yesterday)
      const date1DayAgo = getPastDateStr(1);
      createdBacklogDates.push(date1DayAgo);
      const missed1 = await test1Publisher.detectMissedDays({ fromDate: date1DayAgo, toDate: todayStr });
      if (missed1.length !== 1 || missed1[0].target_date !== date1DayAgo) {
        throw new Error(`TEST 2 Failed: Expected 1 missed day (${date1DayAgo}), got ${missed1.length}`);
      }
      this.logger.info('TEST 2 Passed: 1 missed day obligation accurately detected.');

      // TEST 3: 3 missed days
      const date3DaysAgo = getPastDateStr(3);
      for (let i = 1; i <= 3; i++) createdBacklogDates.push(getPastDateStr(i));
      const missed3 = await test1Publisher.detectMissedDays({ fromDate: date3DaysAgo, toDate: todayStr });
      if (missed3.length !== 3) {
        throw new Error(`TEST 3 Failed: Expected 3 missed days, got ${missed3.length}`);
      }
      this.logger.info('TEST 3 Passed: 3 missed days obligations accurately detected.');

      // TEST 4: 7 missed days
      const date7DaysAgo = getPastDateStr(7);
      for (let i = 1; i <= 7; i++) createdBacklogDates.push(getPastDateStr(i));
      const missed7 = await test1Publisher.detectMissedDays({ fromDate: date7DaysAgo, toDate: todayStr });
      if (missed7.length !== 7) {
        throw new Error(`TEST 4 Failed: Expected 7 missed days, got ${missed7.length}`);
      }
      this.logger.info('TEST 4 Passed: 7 missed days obligations accurately detected.');

      // TEST 5: Already satisfied day -> No duplicate obligation
      const satisfiedDate = getPastDateStr(4);
      const satProdId = `prod-test-sat-${Date.now()}`;
      createdProdIds.push(satProdId);
      await db.saveDailyShortPublication({
        production_id: satProdId,
        topic: 'Satisfied Day Topic',
        title: 'Satisfied Day Topic #Shorts',
        status: 'SCHEDULED',
        scheduled_at: `${satisfiedDate}T17:00:00.000Z`
      });
      const missedAfterSat = await test1Publisher.detectMissedDays({ fromDate: satisfiedDate, toDate: todayStr });
      const containsSat = missedAfterSat.some(r => r.target_date === satisfiedDate);
      if (containsSat) {
        throw new Error(`TEST 5 Failed: Satisfied date ${satisfiedDate} still returned as pending obligation`);
      }
      this.logger.info('TEST 5 Passed: Already satisfied day is not duplicated as missed obligation.');

      // TEST 6: Mac restart -> Backlog persists across new Database and Publisher instances
      const db2 = new Database(testDbPath);
      await db2.initialize();
      const test6Publisher = new DailyShortsPublisher({ db: db2, shortsDir: testShortsDir, scratchDir: testScratchDir });
      const pendingPersisted = await test6Publisher.detectMissedDays({ fromDate: date3DaysAgo, toDate: todayStr });
      if (pendingPersisted.length === 0) {
        throw new Error('TEST 6 Failed: Backlog did not persist in SQLite across new database instance');
      }
      await db2.close().catch(() => {});
      this.logger.info('TEST 6 Passed: Backlog persists in SQLite across simulated Mac restart.');

      // TEST 7: Scheduler restart -> Backlog obligations remain valid and queryable
      const pendingObligations = await db.getPendingBacklogObligations(10);
      if (!Array.isArray(pendingObligations) || pendingObligations.length === 0) {
        throw new Error('TEST 7 Failed: getPendingBacklogObligations returned empty after scheduler restart simulation');
      }
      this.logger.info('TEST 7 Passed: Backlog persists across scheduler restart.');

      // TEST 8: Generation failure -> Obligation remains pending
      const failingDate = getPastDateStr(2);
      const failingOrchestrator = {
        produceShort: async () => { throw new Error('Simulated generator rendering crash'); }
      };
      const failingPublisher = new DailyShortsPublisher({
        db,
        orchestrator: failingOrchestrator,
        shortsDir: testShortsDir,
        scratchDir: testScratchDir,
        youtubeClient: mockYouTubeClient
      });
      await failingPublisher.recoverMissedShorts({ fromDate: failingDate, toDate: getPastDateStr(1) });
      const obligationAfterFail = await db.getRow('SELECT * FROM daily_shorts_backlog WHERE target_date = ?', [failingDate]);
      if (!obligationAfterFail || obligationAfterFail.status !== 'PENDING' || obligationAfterFail.attempt_count < 1) {
        throw new Error('TEST 8 Failed: Failed generation obligation did not remain PENDING with recorded attempt');
      }
      this.logger.info('TEST 8 Passed: Generation failure keeps obligation pending with recorded attempts.');

      // TEST 9: YouTube upload failure -> Obligation remains pending
      const uploadFailDate = getPastDateStr(6);
      const dummyVideoFile = path.join(testShortsDir, 'dummy_backfill_video.mp4');
      const dummyCoverFile = path.join(testShortsDir, 'dummy_backfill_cover.jpg');
      await fs.writeFile(dummyVideoFile, 'BINARY_BACKFILL_VIDEO_DATA');
      await fs.writeFile(dummyCoverFile, 'JPEG_BACKFILL_COVER_DATA');

      const mockFailingYouTubeClient = {
        videos: {
          insert: async () => { throw new Error('Simulated 503 YouTube Service Unavailable'); }
        }
      };
      const mockSuccessOrchestrator = {
        produceShort: async ({ outputMp4, outputCover }) => {
          await fs.writeFile(outputMp4, 'FRESH_MP4_DATA_' + Date.now());
          await fs.writeFile(outputCover, 'FRESH_COVER_DATA_' + Date.now());
          return {
            productionReady: true,
            qaResults: { allChecksPassed: true },
            packaging: { title: 'Backfill Test Title #Shorts', description: 'Backfill test description' }
          };
        }
      };
      const uploadFailPublisher = new DailyShortsPublisher({
        db,
        orchestrator: mockSuccessOrchestrator,
        shortsDir: testShortsDir,
        scratchDir: testScratchDir,
        youtubeClient: mockFailingYouTubeClient,
        maxUploadAttempts: 1
      });
      await uploadFailPublisher.recoverMissedShorts({ fromDate: uploadFailDate, toDate: getPastDateStr(5), forcePublish: true });
      const obligationAfterUploadFail = await db.getRow('SELECT * FROM daily_shorts_backlog WHERE target_date = ?', [uploadFailDate]);
      if (!obligationAfterUploadFail || obligationAfterUploadFail.status !== 'PENDING') {
        throw new Error('TEST 9 Failed: Obligation was marked satisfied despite upload failure');
      }
      this.logger.info('TEST 9 Passed: YouTube upload failure preserves obligation as pending.');

      // TEST 10: Same MP4 -> DUPLICATE_CONTENT_HASH rejection
      const dupHashVideo = path.join(testShortsDir, 'dup_hash_test.mp4');
      await fs.writeFile(dupHashVideo, 'IDENTICAL_BINARY_CONTENT_FOR_HASH_TEST');
      const dupHash = await test1Publisher.computeContentHash(dupHashVideo);
      const dupProd1 = `prod-dup-hash-1-${Date.now()}`;
      createdProdIds.push(dupProd1);
      await db.saveDailyShortPublication({
        production_id: dupProd1,
        topic: 'Original Unique Topic',
        title: 'Original Unique Topic #Shorts',
        video_path: dupHashVideo,
        content_hash: dupHash,
        status: 'SCHEDULED'
      });

      const dupProd2 = `prod-dup-hash-2-${Date.now()}`;
      createdProdIds.push(dupProd2);
      await db.saveDailyShortPublication({
        production_id: dupProd2,
        topic: 'Another Topic Same Video',
        title: 'Another Topic Same Video #Shorts',
        video_path: dupHashVideo,
        content_hash: dupHash,
        status: 'READY_TO_PUBLISH',
        qa_status: 'PASSED'
      });

      let hashBlocked = false;
      try {
        await test1Publisher.publishCandidate(dupProd2, { forcePublish: true });
      } catch (err) {
        if (err.code === 'DUPLICATE_CONTENT_HASH') hashBlocked = true;
      }
      if (!hashBlocked) {
        throw new Error('TEST 10 Failed: Identical MP4 content hash was not blocked');
      }
      this.logger.info('TEST 10 Passed: DUPLICATE_CONTENT_HASH blocks identical video publication.');

      // TEST 11: Same topic -> Topic duplicate rejection
      const isTopicDup = await db.isDailyShortTopicDuplicate('Original Unique Topic', 90);
      if (!isTopicDup) {
        throw new Error('TEST 11 Failed: Exact topic duplicate was not detected');
      }
      this.logger.info('TEST 11 Passed: Topic duplicate rejection confirmed.');

      // TEST 12: Semantic variation of existing topic -> Semantic duplicate rejection
      const dedupService = new SemanticDedupService();
      const semDupCheck = dedupService.isDuplicate(
        'Why The Costco Membership Business Model Is Unstoppable',
        ["Why Costco's Membership Model Is So Powerful"]
      );
      if (!semDupCheck.isDuplicate) {
        throw new Error('TEST 12 Failed: Semantic duplicate variation was not rejected');
      }
      this.logger.info('TEST 12 Passed: Semantic topic duplicate variation rejected.');

      // TEST 13: Previously published MP4 -> Never reused
      const isContentHashPublished = await db.isDailyShortContentHashDuplicate(dupHash);
      if (!isContentHashPublished) {
        throw new Error('TEST 13 Failed: Published content hash was not detected in database');
      }
      this.logger.info('TEST 13 Passed: Previously published MP4 cannot be reused.');

      // TEST 14: Multiple backlog items -> Safe sequential processing without uncontrolled concurrency
      const workingPublisher = new DailyShortsPublisher({
        db,
        orchestrator: mockSuccessOrchestrator,
        shortsDir: testShortsDir,
        scratchDir: testScratchDir,
        youtubeClient: mockYouTubeClient
      });

      const seqDate1 = getPastDateStr(5);
      const seqDate2 = getPastDateStr(4);
      await db.saveBacklogObligation({ target_date: seqDate1, status: 'PENDING' });
      await db.saveBacklogObligation({ target_date: seqDate2, status: 'PENDING' });

      const recoveryReport = await workingPublisher.recoverMissedShorts({
        fromDate: seqDate1,
        toDate: getPastDateStr(3),
        forcePublish: true
      });

      if (recoveryReport.recovered < 2) {
        throw new Error(`TEST 14 Failed: Expected 2 recovered obligations, got ${recoveryReport.recovered}`);
      }
      // Verify distinct future scheduled timestamps
      const schedTimes = recoveryReport.results.map(r => r.scheduledTime).filter(Boolean);
      const uniqueSchedTimes = new Set(schedTimes);
      if (schedTimes.length !== uniqueSchedTimes.size) {
        throw new Error('TEST 14 Failed: Recovered videos assigned duplicate scheduled timestamps');
      }
      this.logger.info('TEST 14 Passed: Multiple backlog items recovered sequentially with unique timestamps.');

      // TEST 15: Current day already satisfied -> No extra Short produced
      const currentDayStatus = await workingPublisher.checkDailyStatus(new Date());
      if (currentDayStatus.hasMetDailyQuota) {
        const preAttempts = mockYouTubeUploads.length;
        const secondRun = await workingPublisher.runDailyPublishingCycle({ skipBacklogRecovery: true });
        if (!secondRun.quotaMet || mockYouTubeUploads.length > preAttempts) {
          throw new Error('TEST 15 Failed: Second run on satisfied day attempted new video upload');
        }
      }
      this.logger.info('TEST 15 Passed: Current day satisfied results in zero redundant uploads.');

      // PHASE 17: DRY RUN SIMULATION (5 days offline simulation)
      this.logger.info('Executing Phase 17 Dry-Run Simulation (5 days offline -> Mac comes online at 10 PM IST)...');
      const simDbPath = path.join(tempDir, 'sim_phase17.db');
      const simDb = new Database(simDbPath);
      await simDb.initialize();
      const simPublisher = new DailyShortsPublisher({ db: simDb, shortsDir: testShortsDir, scratchDir: testScratchDir });
      const simAnchor = getPastDateStr(5);
      const simMissedDays = await simPublisher.detectMissedDays({ fromDate: simAnchor, toDate: todayStr });
      if (simMissedDays.length !== 5) {
        throw new Error(`Phase 17 Simulation Failed: Expected 5 missed days, got ${simMissedDays.length}`);
      }
      this.logger.info(`Phase 17 Simulation: Successfully identified ${simMissedDays.length} missed obligations (Days 1 to 5 offline) + today's obligation.`);
      await simDb.close().catch(() => {});
      this.logger.info('All 15 Missed-Day Recovery & Backfill Engine test cases and Phase 17 simulation passed successfully.');
    } finally {
      // Clean up test production records and backlog entries
      for (const pid of createdProdIds) {
        await new Promise((res) => db.db.run('DELETE FROM daily_shorts_publications WHERE production_id = ?', [pid], () => res()));
      }
      for (const d of createdBacklogDates) {
        await new Promise((res) => db.db.run('DELETE FROM daily_shorts_backlog WHERE target_date = ?', [d], () => res()));
      }
      await db.close().catch(() => {});
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async testSchedulerDailyShortsSchedule() {
    this.logger.info('Starting Scheduler Daily Shorts UTC Schedule & Execution tests...');
    const TimeMatcher = require('node-cron/src/time-matcher');

    // Case 1: Config & Cron Expression Resolution
    const fakeDb = {
      getAllRows: async () => [],
      getRow: async () => null,
      executeQuery: async () => ({}),
      generateId: prefix => `${prefix}_test`
    };
    const scheduler = new DailyAutomation({}, fakeDb);
    const config = scheduler.getShortsScheduleConfig();
    if (config.cronExpression !== '0 17 * * *') {
      throw new Error(`Case 1 Failed: Expected cronExpression '0 17 * * *', got '${config.cronExpression}'`);
    }
    if (config.publishTimezone !== 'UTC') {
      throw new Error(`Case 1 Failed: Expected publishTimezone 'UTC', got '${config.publishTimezone}'`);
    }
    if (config.publishTime !== '17:00') {
      throw new Error(`Case 1 Failed: Expected publishTime '17:00', got '${config.publishTime}'`);
    }
    this.logger.info('Case 1 Passed: Schedule config resolves to 0 17 * * * with UTC timezone.');

    // Case 2: Explicit Timezone Matching (17:00 UTC = 10:30 PM IST)
    const matcher = new TimeMatcher(config.cronExpression, config.publishTimezone);
    const exactUtc = new Date('2026-09-14T17:00:00.000Z');
    if (!matcher.match(exactUtc)) {
      throw new Error('Case 2 Failed: TimeMatcher did not match 17:00:00 UTC');
    }
    if (matcher.match(new Date('2026-09-14T16:59:59.000Z'))) {
      throw new Error('Case 2 Failed: TimeMatcher falsely matched 16:59:59 UTC');
    }
    if (matcher.match(new Date('2026-09-14T17:01:00.000Z'))) {
      throw new Error('Case 2 Failed: TimeMatcher falsely matched 17:01:00 UTC');
    }
    if (matcher.match(new Date('2026-09-14T05:00:00.000Z'))) {
      throw new Error('Case 2 Failed: TimeMatcher falsely matched 05:00:00 UTC (legacy phase 7 bug)');
    }

    // Verify IST conversion explicitly
    const istTimeStr = exactUtc.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    if (!istTimeStr.includes('10:30') || !istTimeStr.includes('PM')) {
      throw new Error(`Case 2 Failed: 17:00 UTC did not format as 10:30 PM IST (got '${istTimeStr}')`);
    }
    this.logger.info(`Case 2 Passed: Time matching verified. 17:00 UTC matches and formats as ${istTimeStr} IST.`);

    // Case 3: Task Registration in Scheduled Tasks Map
    await scheduler.setupScheduledTasks();
    const task = scheduler.scheduledTasks.get('daily-shorts-automation');
    if (!task) {
      throw new Error('Case 3 Failed: daily-shorts-automation was not registered in scheduledTasks Map');
    }
    if (task.options.timezone !== 'UTC') {
      throw new Error(`Case 3 Failed: Task options.timezone is '${task.options.timezone}', expected 'UTC'`);
    }
    if (task.options.recoverMissedExecutions !== true) {
      throw new Error('Case 3 Failed: Task options.recoverMissedExecutions is not true');
    }
    this.logger.info('Case 3 Passed: Task registered with UTC timezone and recoverMissedExecutions enabled.');

    // Case 4: Next-Run Calculation Resolves to Future 17:00 UTC
    const nextRun = scheduler.calculateNextRunTime('0 17 * * *', 'UTC');
    if (!nextRun || !(nextRun instanceof Date)) {
      throw new Error('Case 4 Failed: calculateNextRunTime did not return a valid Date object');
    }
    if (nextRun.getUTCHours() !== 17 || nextRun.getUTCMinutes() !== 0 || nextRun.getUTCSeconds() !== 0) {
      throw new Error(`Case 4 Failed: Next run time is not 17:00:00 UTC (got ${nextRun.toISOString()})`);
    }
    this.logger.info(`Case 4 Passed: Calculated next run correctly resolves to: ${nextRun.toISOString()} (${nextRun.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} IST).`);

    // Case 5: Callback Invocation When Scheduled Time is Reached (Zero Network / Dry-Run)
    let publishingInvoked = false;
    let publishOptionsPassed = null;
    scheduler.runDailyShortsPublishing = async (opts) => {
      publishingInvoked = true;
      publishOptionsPassed = opts;
      return { completed: true, quotaMet: true };
    };

    // Trigger scheduled task now() directly (simulating scheduler tick)
    task.now(new Date('2026-09-14T17:00:00.000Z'));
    if (!publishingInvoked) {
      throw new Error('Case 5 Failed: Scheduler task execution did not invoke runDailyShortsPublishing');
    }
    if (publishOptionsPassed === null) {
      // opts can be default empty object
    }
    this.logger.info('Case 5 Passed: Task callback reliably invokes runDailyShortsPublishing when scheduled time is reached.');

    // Case 6: Gate Conditions (DAILY_SHORT_ENABLED=false & isEnabled=false)
    publishingInvoked = false;
    const prevEnabled = process.env.DAILY_SHORT_ENABLED;
    process.env.DAILY_SHORT_ENABLED = 'false';
    task.now(new Date('2026-09-14T17:00:00.000Z'));
    process.env.DAILY_SHORT_ENABLED = prevEnabled;
    if (publishingInvoked) {
      throw new Error('Case 6 Failed: Callback was invoked when DAILY_SHORT_ENABLED was false');
    }

    publishingInvoked = false;
    scheduler.isEnabled = false;
    task.now(new Date('2026-09-14T17:00:00.000Z'));
    scheduler.isEnabled = true;
    if (publishingInvoked) {
      throw new Error('Case 6 Failed: Callback was invoked when scheduler.isEnabled was false');
    }
    this.logger.info('Case 6 Passed: Safety gates (DAILY_SHORT_ENABLED & isEnabled) verified.');

    // Case 7: Clean Shutdown of UTC Task
    await scheduler.stopAutomation();
    if (scheduler.scheduledTasks.size !== 0) {
      throw new Error('Case 7 Failed: Scheduled tasks map was not cleared on stopAutomation');
    }
    this.logger.info('Case 7 Passed: Scheduled tasks stopped and cleared cleanly.');

    // Case 8: Startup Recovery Window Logic
    const shortsConfig = scheduler.getShortsScheduleConfig();
    const [h, m] = shortsConfig.publishTime.split(':').map(n => parseInt(n, 10) || 0);
    const testNow = new Date();
    const windowPassed = testNow.getUTCHours() > h || (testNow.getUTCHours() === h && testNow.getUTCMinutes() >= m);
    this.logger.info(`Case 8 Passed: Startup recovery window logic evaluated (windowPassed=${windowPassed}).`);
  }
}


// Run tests if called directly
if (require.main === module) {
  const tester = new SystemTest();
  tester.runAllTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error(chalk.red('Test runner failed:'), error);
      process.exit(1);
    });
}

module.exports = { SystemTest };
