'use strict';

require('dotenv').config();

const { DailyShortsPublisher } = require('../utils/daily-shorts-publisher');
const { Logger } = require('../utils/logger');

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isForce = args.includes('--force');
  const topicArg = args.find(a => a.startsWith('--topic='));
  const customTopic = topicArg ? topicArg.split('=')[1] : null;

  if (isDryRun) {
    process.env.YOUTUBE_PUBLISH_ENABLED = 'false';
  }

  const logger = new Logger('DailyShortsRunner');
  logger.info('=== Starting Money In Minutes Daily Shorts Automation ===');
  logger.info(`Mode: ${isDryRun ? 'DRY-RUN (Local QA only, zero network upload)' : (process.env.YOUTUBE_PUBLISH_ENABLED === 'true' ? 'LIVE PRODUCTION (YouTube upload enabled)' : 'DRY-RUN (YOUTUBE_PUBLISH_ENABLED=false)')}`);
  if (customTopic) logger.info(`Target Topic: "${customTopic}"`);

  const publisher = new DailyShortsPublisher({ logger });
  await publisher.initialize();

  const result = await publisher.runDailyPublishingCycle({
    force: isForce,
    topic: customTopic
  });

  console.log('\n=== Daily Shorts Automation Summary ===');
  console.log(JSON.stringify({
    completed: result.completed,
    quotaMet: result.quotaMet,
    publishingEnabled: result.publishingEnabled,
    productionId: result.record?.production_id || null,
    topic: result.record?.topic || null,
    status: result.record?.status || null,
    youtubeStatus: result.record?.youtube_status || null,
    youtubeVideoId: result.record?.youtube_video_id || null,
    scheduledAt: result.record?.scheduled_at || null,
    publishedAt: result.record?.published_at || null,
    attemptsCount: result.attempts?.length || 0
  }, null, 2));

  if (!result.completed) {
    logger.error('Daily shorts cycle failed to meet daily requirement.');
    process.exit(1);
  }

  logger.success('Daily shorts cycle successfully finished!');
}

if (require.main === module) {
  main().catch(err => {
    console.error('Daily shorts automation crashed:', err);
    process.exit(1);
  });
}

module.exports = { main };
