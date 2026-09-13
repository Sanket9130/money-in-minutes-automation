const { Logger } = require('./logger');

class AutonomousChannelOperator {
  constructor(db, options = {}) {
    this.db = db;
    this.researchAndPlan = options.researchAndPlan;
    this.startGenerationJob = options.startGenerationJob;
    this.resumeGenerationJob = options.resumeGenerationJob;
    this.waitForGenerationJob = options.waitForGenerationJob;
    this.notify = options.notify || (async () => null);
    this.selectFallbackCandidate = options.selectFallbackCandidate;
    this.logger = new Logger('AutonomousOperator');
    this.activeRuns = new Map();
    this.isShuttingDown = false;
  }

  async isEligibleForTopicReplacement(completed, record) {
    if (!completed) return { eligible: false, reason: null };

    const reviewStatus = completed?.details?.reviewStatus || completed?.reviewStatus || record?.reviewStatus;
    const error = completed?.error || record?.error || completed?.details?.error;

    // Check 1: Review status is needs_attention
    if (reviewStatus === 'needs_attention') {
      let blockingFailures = Array.isArray(completed?.details?.blockingFailures)
        ? completed.details.blockingFailures
        : [];
      let reviewNotes = completed?.details?.reviewNotes || '';

      // Direct reason check from details (for explicit details or tests)
      const detailReason = String(
        completed?.details?.reason ||
        completed?.details?.failureReason ||
        completed?.details?.blockingFailure ||
        ''
      ).toLowerCase();
      if (detailReason.includes('provenance')) return { eligible: true, reason: 'provenance_failure' };
      if (detailReason.includes('brand_policy')) return { eligible: true, reason: 'brand_policy_failure' };
      if (detailReason.includes('duplicate')) return { eligible: true, reason: 'duplicate_topic_failure' };

      // If details don't carry blockingFailures or reviewNotes, query DB bundle
      const prodId = completed?.production_id || completed?.productionId || record?.productionId;
      if ((!blockingFailures.length && !reviewNotes) && prodId && this.db?.getProductionBundle) {
        try {
          const bundle = await this.db.getProductionBundle(prodId);
          if (bundle) {
            reviewNotes = bundle.review_notes || '';
            if (Array.isArray(bundle.qualityChecks)) {
              blockingFailures = bundle.qualityChecks
                .filter(c => c && c.blocking && !c.passed)
                .map(c => c.id);
            }
            if (bundle.provenance && ['blocked'].includes(bundle.provenance.status)) {
              if (!blockingFailures.includes('provenance')) {
                blockingFailures.push('provenance');
              }
            }
          }
        } catch (_err) {
          // Fallback to error or reviewNotes inspection
        }
      }

      const notesLower = String(reviewNotes || '').toLowerCase();

      // Check A: Provenance / Truth failure
      if (blockingFailures.includes('provenance') || notesLower.includes('provenance')) {
        return { eligible: true, reason: 'provenance_failure' };
      }

      // Check B: Brand / content policy failure
      if (blockingFailures.includes('brand_policy') || notesLower.includes('brand_policy') || notesLower.includes('blocked terms')) {
        return { eligible: true, reason: 'brand_policy_failure' };
      }

      // Check C: Explicit semantic duplicate failure
      if (blockingFailures.includes('duplicate_topic') || notesLower.includes('duplicate_topic') || notesLower.includes('semantic duplicate')) {
        return { eligible: true, reason: 'duplicate_topic_failure' };
      }

      // Ineligible quality failures (narration, scene_integrity, scene_rights, video_file, etc.)
      return { eligible: false, reason: 'ineligible_quality_failure' };
    }

    // Check D: Permanent content-level script refusal
    if (error) {
      const errorStr = String(error).toLowerCase();
      const isTransient = [
        'econnreset', 'econnrefused', 'timeout', 'etimedout', '429', 'rate limit',
        '500', '502', '503', 'network', 'enotfound', 'socket'
      ].some(code => errorStr.includes(code));
      if (!isTransient && (
        errorStr.includes('content safety') ||
        errorStr.includes('safety policy') ||
        errorStr.includes('topic rejected') ||
        errorStr.includes('topic prohibited') ||
        errorStr.includes('content filter')
      )) {
        return { eligible: true, reason: 'permanent_content_rejection' };
      }
    }

    return { eligible: false, reason: null };
  }

  async getFallbackCandidate(strategy, research, excludedTopics) {
    if (typeof this.selectFallbackCandidate === 'function') {
      return this.selectFallbackCandidate(strategy, research, excludedTopics);
    }
    const { ContentStrategyAgent } = require('../agents/content-strategy-agent');
    const agent = new ContentStrategyAgent(this.db, {});
    return agent.selectFallbackCandidate(strategy, research, excludedTopics);
  }

  async start(strategy) {
    if (this.isShuttingDown) {
      const error = new Error('Cannot start autonomous operator: application is shutting down');
      error.status = 503;
      throw error;
    }
    if (!strategy || strategy.status !== 'active') {
      const error = new Error('Save and activate a channel strategy before starting the autonomous operator');
      error.status = 409;
      throw error;
    }
    const active = await this.db.getActiveOperatorRun();
    if (active || this.activeRuns.size) {
      const error = new Error('An autonomous operator run is already active');
      error.status = 409;
      throw error;
    }

    const run = await this.db.createOperatorRun(strategy.id);
    const work = this.execute(run.id, strategy)
      .catch(error => this.logger.error(`Operator run ${run.id} failed:`, error))
      .finally(() => this.activeRuns.delete(run.id));
    this.activeRuns.set(run.id, work);
    return run;
  }

  async resume(runId, strategy) {
    if (this.isShuttingDown) {
      const error = new Error('Cannot resume autonomous operator: application is shutting down');
      error.status = 503;
      throw error;
    }
    const run = await this.db.getOperatorRun(runId);
    if (!run) {
      const error = new Error('Operator run not found');
      error.status = 404;
      throw error;
    }
    if (!['failed', 'interrupted', 'completed_with_issues'].includes(run.status)) {
      const error = new Error('Only failed or interrupted operator runs can be resumed');
      error.status = 409;
      throw error;
    }
    if (!strategy || strategy.status !== 'active') {
      const error = new Error('Activate the saved channel strategy before resuming this run');
      error.status = 409;
      throw error;
    }
    const active = await this.db.getActiveOperatorRun();
    if (active || this.activeRuns.size) {
      const error = new Error('An autonomous operator run is already active');
      error.status = 409;
      throw error;
    }
    await this.update(runId, {
      status: 'queued',
      stage: 'resuming',
      error: null,
      cancelRequested: false,
      completedAt: null
    });
    const work = this.execute(runId, strategy, { resume: true })
      .catch(error => this.logger.error(`Resumed operator run ${runId} failed:`, error))
      .finally(() => this.activeRuns.delete(runId));
    this.activeRuns.set(runId, work);
    return this.db.getOperatorRun(runId);
  }

  async execute(runId, strategy, options = {}) {
    try {
      const stored = options.resume ? await this.db.getOperatorRun(runId) : null;
      let research = stored?.research || {};
      let plan = stored?.plan || [];
      const generatedJobs = stored?.generatedJobs || [];
      await this.update(runId, {
        status: 'running',
        stage: plan.length ? 'resuming_plan' : 'researching',
        progress: plan.length ? Math.max(20, stored?.progress || 20) : 5,
        error: null,
        cancelRequested: false,
        completedAt: null
      });
      if (!plan.length) {
        ({ research, plan } = await this.researchAndPlan(strategy));
      }
      if (!plan.length) throw new Error('Research did not produce any usable content ideas');
      await this.assertNotCancelled(runId);

      const targetCount = stored?.summary?.targetCount || plan.filter(p => !p.isReplacement).length;
      const MAX_REPLACEMENTS_PER_SLOT = 1;
      const MAX_RUN_REPLACEMENTS = Math.min(2, targetCount);

      const attemptedTopics = new Set(
        (stored?.summary?.attemptedTopics || stored?.research?.attemptedTopics || [])
          .map(t => String(t).trim().toLowerCase())
      );
      plan.forEach(p => p.topic && attemptedTopics.add(String(p.topic).trim().toLowerCase()));
      generatedJobs.forEach(j => j.topic && attemptedTopics.add(String(j.topic).trim().toLowerCase()));

      let runReplacementsCount = generatedJobs.filter(j => j.isReplacement).length;

      research.attemptedTopics = Array.from(attemptedTopics);
      await this.update(runId, { stage: 'planning', progress: 20, research, plan });

      for (let index = 0; index < targetCount; index++) {
        await this.assertNotCancelled(runId);
        const item = plan[index];
        let record = generatedJobs[index];

        const existingReplacement = generatedJobs.find(j => j.isReplacement && j.planIndex === index);
        if (record?.status === 'completed') {
          if (!record.fallbackTriggered) {
            continue;
          }
          if (existingReplacement && ['completed', 'cancelled'].includes(existingReplacement.status)) {
            continue;
          }
        }

        let ideaId = record?.ideaId;
        if (!record) {
          const idea = await this.db.createContentIdea({
            topic: item.topic,
            angle: item.angle,
            style: item.format,
            status: 'generating',
            rationale: item.rationale
          });
          ideaId = idea.id;
          record = { jobId: null, ideaId, topic: item.topic, status: 'queued', planIndex: index };
          generatedJobs[index] = record;
        } else if (ideaId) {
          await this.db.updateContentIdea(ideaId, { status: 'generating' });
        }
        const progress = 20 + Math.round((index / targetCount) * 70);
        await this.update(runId, {
          stage: `producing_${index + 1}_of_${targetCount}`,
          progress,
          generatedJobs
        });

        let completed = null;
        if (record.status !== 'completed') {
          try {
            await this.update(runId, { generatedJobs });
            await this.assertNotCancelled(runId);
            let job = record.jobId ? await this.db.getGenerationJob(record.jobId) : null;
            if (job && ['failed', 'interrupted'].includes(job.status)) {
              job = await this.resumeGenerationJob(job.id);
            } else if (!job || !['queued', 'running', 'completed'].includes(job.status)) {
              const selectedSourceUrls = new Set(item.sourceUrls || []);
              job = await this.startGenerationJob({
                topic: item.topic,
                style: item.format,
                length: item.length,
                source: 'autonomous_operator',
                strategyContext: {
                  angle: item.angle,
                  rationale: item.rationale,
                  pillar: item.pillar,
                  audience: strategy.audience,
                  objective: strategy.objective,
                  valueProposition: strategy.value_proposition,
                  constraints: strategy.constraints,
                  researchSources: (research.sourceCatalog || []).filter(source => selectedSourceUrls.has(source.url))
                }
              });
            }
            record.jobId = job.id;
            record.status = 'running';
            await this.update(runId, { generatedJobs });
            completed = job.status === 'completed' ? job : await this.waitForGenerationJob(job.id);
            record.status = completed.status;
            record.productionId = completed.production_id || null;
            record.reviewStatus = completed.details?.reviewStatus || null;
            record.details = completed.details || null;
            record.error = completed.error || null;
            if (ideaId) await this.db.updateContentIdea(ideaId, {
              status: completed.status === 'completed' ? 'generated' : 'failed'
            });
          } catch (error) {
            record.status = error.code === 'OPERATOR_CANCELLED' ? 'cancelled' : 'failed';
            record.error = error.message;
            if (ideaId) await this.db.updateContentIdea(ideaId, { status: 'failed' });
            if (error.code === 'OPERATOR_CANCELLED') throw error;
          }
        }

        // A4.3 Dynamic Topic Fallback:
        // Inspect if slot failed with eligible content-level failure
        const slotReplacements = generatedJobs.filter(j => j.isReplacement && j.planIndex === index);
        const eligibility = await this.isEligibleForTopicReplacement(completed || record, record);

        if (
          eligibility.eligible &&
          !record.fallbackTriggered &&
          slotReplacements.length < MAX_REPLACEMENTS_PER_SLOT &&
          runReplacementsCount < MAX_RUN_REPLACEMENTS
        ) {
          this.logger.warn(`Slot ${index + 1} (${record.topic}) failed with eligible content failure "${eligibility.reason}". Triggering dynamic topic fallback.`);
          record.fallbackTriggered = true;
          record.fallbackReason = eligibility.reason;
          await this.update(runId, { generatedJobs });

          const profile = await this.db.getChannelProfile().catch(() => null);
          const enrichedStrategy = {
            ...strategy,
            bannedTopics: profile?.bannedTopics || strategy.bannedTopics || []
          };

          const fallbackCandidate = await this.getFallbackCandidate(
            enrichedStrategy,
            research,
            Array.from(attemptedTopics)
          );

          if (fallbackCandidate && fallbackCandidate.topic) {
            attemptedTopics.add(fallbackCandidate.topic.trim().toLowerCase());
            research.attemptedTopics = Array.from(attemptedTopics);

            const replacementPlanItem = {
              ...fallbackCandidate,
              isReplacement: true,
              replacesSlotIndex: index,
              replacesJobId: record.jobId,
              replacesTopic: record.topic
            };
            plan.push(replacementPlanItem);

            let replacementIdeaId = null;
            try {
              const repIdea = await this.db.createContentIdea({
                topic: fallbackCandidate.topic,
                angle: fallbackCandidate.angle,
                style: fallbackCandidate.format,
                status: 'generating',
                rationale: fallbackCandidate.rationale
              });
              replacementIdeaId = repIdea?.id || null;
            } catch (_err) {
              // Non-critical
            }

            const replacementRecord = {
              jobId: null,
              ideaId: replacementIdeaId,
              topic: fallbackCandidate.topic,
              status: 'queued',
              planIndex: index,
              isReplacement: true,
              replacesJobId: record.jobId,
              attempt: 1
            };
            generatedJobs.push(replacementRecord);
            runReplacementsCount++;

            await this.update(runId, {
              stage: `producing_replacement_for_slot_${index + 1}`,
              generatedJobs,
              plan,
              research
            });

            try {
              await this.assertNotCancelled(runId);
              const selectedSourceUrls = new Set(fallbackCandidate.sourceUrls || []);
              const repJob = await this.startGenerationJob({
                topic: fallbackCandidate.topic,
                style: fallbackCandidate.format,
                length: fallbackCandidate.length,
                source: 'autonomous_operator',
                strategyContext: {
                  angle: fallbackCandidate.angle,
                  rationale: fallbackCandidate.rationale,
                  pillar: fallbackCandidate.pillar,
                  audience: strategy.audience,
                  objective: strategy.objective,
                  valueProposition: strategy.value_proposition,
                  constraints: strategy.constraints,
                  researchSources: (research.sourceCatalog || []).filter(source => selectedSourceUrls.has(source.url))
                }
              });
              replacementRecord.jobId = repJob.id;
              replacementRecord.status = 'running';
              await this.update(runId, { generatedJobs });

              const repCompleted = repJob.status === 'completed' ? repJob : await this.waitForGenerationJob(repJob.id);
              replacementRecord.status = repCompleted.status;
              replacementRecord.productionId = repCompleted.production_id || null;
              replacementRecord.reviewStatus = repCompleted.details?.reviewStatus || null;
              replacementRecord.details = repCompleted.details || null;
              replacementRecord.error = repCompleted.error || null;

              if (replacementIdeaId) {
                await this.db.updateContentIdea(replacementIdeaId, {
                  status: repCompleted.status === 'completed' ? 'generated' : 'failed'
                }).catch(() => null);
              }
            } catch (repError) {
              replacementRecord.status = repError.code === 'OPERATOR_CANCELLED' ? 'cancelled' : 'failed';
              replacementRecord.error = repError.message;
              if (replacementIdeaId) {
                await this.db.updateContentIdea(replacementIdeaId, { status: 'failed' }).catch(() => null);
              }
              if (repError.code === 'OPERATOR_CANCELLED') throw repError;
            }
          } else {
            this.logger.warn(`No eligible fallback candidates remaining for slot ${index + 1}; proceeding without replacement.`);
            record.fallbackAttempted = true;
            record.fallbackError = 'no_candidates_remaining';
          }
        }

        await this.update(runId, {
          progress: 20 + Math.round(((index + 1) / targetCount) * 70),
          generatedJobs
        });
      }

      const completed = generatedJobs.filter(job => job.status === 'completed');
      const usableJobs = generatedJobs.filter(job =>
        job.status === 'completed' &&
        ['needs_review', 'approved'].includes(job.reviewStatus) &&
        !job.fallbackTriggered
      );
      const reviewJobs = generatedJobs.filter(job =>
        job.status === 'completed' &&
        job.reviewStatus === 'needs_review' &&
        !job.fallbackTriggered
      );
      const attentionJobs = generatedJobs.filter(job =>
        job.status === 'completed' &&
        job.reviewStatus === 'needs_attention'
      );
      const failedJobs = generatedJobs.filter(job => job.status !== 'completed');
      const fallbackJobs = generatedJobs.filter(job => job.isReplacement);

      const usable = usableJobs.length;
      const needsReview = reviewJobs.length;
      const needsAttention = attentionJobs.length;
      const fallbackCount = fallbackJobs.length;

      const allFailed = completed.length === 0 && failedJobs.length > 0;
      let status;
      if (allFailed) {
        status = 'failed';
      } else if (usable < targetCount && needsAttention > 0 && needsReview === 0) {
        status = 'completed_with_issues';
      } else if (usable < targetCount && (needsAttention > 0 || failedJobs.length > 0)) {
        status = needsReview > 0 ? 'waiting_review' : 'completed_with_issues';
      } else if (needsReview > 0) {
        status = 'waiting_review';
      } else if (failedJobs.length > 0 || needsAttention > 0) {
        status = 'completed_with_issues';
      } else {
        status = 'completed';
      }

      const summary = {
        planned: targetCount,
        targetCount,
        generated: completed.length,
        usable,
        needsReview,
        needsAttention,
        fallbackCount,
        failed: failedJobs.length,
        attemptedTopics: Array.from(attemptedTopics)
      };

      await this.update(runId, {
        status,
        stage: allFailed ? 'failed' : needsReview > 0 ? 'waiting_for_review' : (status === 'completed_with_issues' ? 'completed_with_issues' : 'complete'),
        progress: 100,
        generatedJobs,
        plan,
        research,
        summary,
        error: allFailed ? 'Every planned video failed during generation' : null,
        completedAt: new Date().toISOString()
      });
      await this.notify({
        type: 'autonomous_run_complete',
        level: failedJobs.length ? 'warning' : 'success',
        title: needsReview > 0 ? 'Autonomous plan is ready for review' : 'Autonomous plan completed',
        message: `${usable} of ${targetCount} planned videos finished production.`,
        data: { runId, ...summary }
      });
    } catch (error) {
      const cancelled = error.code === 'OPERATOR_CANCELLED';
      const interrupted = error.code === 'OPERATOR_INTERRUPTED' || this.isShuttingDown;
      await this.update(runId, {
        status: interrupted ? 'interrupted' : (cancelled ? 'cancelled' : 'failed'),
        stage: interrupted ? 'interrupted' : (cancelled ? 'cancelled' : 'failed'),
        error: error.message,
        completedAt: new Date().toISOString()
      });
      if (!cancelled && !interrupted) {
        await this.notify({
          type: 'autonomous_run_failure',
          level: 'error',
          title: 'Autonomous channel run failed',
          message: error.message,
          data: { runId }
        });
      }
      throw error;
    }
  }

  async stop() {
    this.isShuttingDown = true;
    for (const runId of Array.from(this.activeRuns.keys())) {
      try {
        const run = await this.db.getOperatorRun(runId);
        if (run && ['queued', 'running', 'cancelling'].includes(run.status)) {
          await this.update(runId, {
            status: 'interrupted',
            stage: 'interrupted',
            error: 'Autonomous operator interrupted by application shutdown',
            completedAt: new Date().toISOString()
          });
        }
      } catch (err) {
        this.logger.warn(`Failed to mark operator run ${runId} as interrupted during shutdown: ${err.message}`);
      }
    }
    this.activeRuns.clear();
  }

  async cancel(runId) {
    const run = await this.db.getOperatorRun(runId);
    if (!run) return null;
    if (!['queued', 'running', 'cancelling'].includes(run.status)) return run;
    for (const item of run.generatedJobs) {
      const job = await this.db.getGenerationJob(item.jobId);
      if (job && ['queued', 'running'].includes(job.status)) {
        await this.db.updateGenerationJob(job.id, {
          cancelRequested: true,
          details: { cancelReason: 'Autonomous operator stopped by the channel owner' }
        });
      }
    }
    return this.update(runId, { status: 'cancelling', cancelRequested: true });
  }

  async assertNotCancelled(runId) {
    if (this.isShuttingDown) {
      const error = new Error('Autonomous operator interrupted by application shutdown');
      error.code = 'OPERATOR_INTERRUPTED';
      throw error;
    }
    const run = await this.db.getOperatorRun(runId);
    if (run?.cancelRequested) {
      const error = new Error('Autonomous operator stopped by the channel owner');
      error.code = 'OPERATOR_CANCELLED';
      throw error;
    }
  }

  update(runId, changes) {
    return this.db.updateOperatorRun(runId, changes);
  }
}

module.exports = { AutonomousChannelOperator };
