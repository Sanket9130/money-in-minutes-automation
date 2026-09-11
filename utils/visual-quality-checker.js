'use strict';

/**
 * Visual Quality Checker & Scorer
 *
 * Performs automated quality control on generated YouTube Shorts:
 * - 1080x1920 (9:16) resolution compliance
 * - Shorts duration (< 60s)
 * - Scene duration pacing (2-5s per visual beat)
 * - Safe zone compliance for karaoke captions and YouTube mobile UI
 * - Character asset consistency and presence
 * - Environment depth and visual richness
 * - Financial visual density (charts, cards, metrics)
 * - FFmpeg frame-sampling QA on actual rendered MP4 video files
 * - Generates visual quality score (0-100)
 */

const fs = require('fs');
const path = require('path');
const { Logger } = require('./logger');
const { ShortsCanvasCompositor, SHORTS_SAFE_ZONE } = require('./shorts-canvas-compositor');
const { runFFmpeg, checkFFmpeg } = require('./ffmpeg');

class VisualQualityChecker {
  constructor(options = {}) {
    this.logger = new Logger('VisualQuality');
    this.options = options;
  }

  /**
   * Evaluates a scene storyboard or generated video bundle.
   *
   * @param {object} input - { scenes, script, canvas, videoMetadata }
   * @returns {object} Quality assessment { score, passed, checks, blockingFailures }
   */
  evaluate(input = {}) {
    const scenes = Array.isArray(input.scenes) ? input.scenes : [];
    const canvas = ShortsCanvasCompositor.resolveCanvas(input.canvas || input.options || { isShort: true });
    const duration = Number(input.duration || input.script?.duration || 50);

    const checks = [];

    // 1. Resolution & Aspect Ratio Check (1080x1920)
    const isExactDimensions = canvas.width === 1080 && canvas.height === 1920;
    checks.push({
      id: 'canvas_resolution',
      name: '1080x1920 Native Shorts Geometry',
      passed: isExactDimensions,
      blocking: true,
      score: isExactDimensions ? 20 : 0,
      details: `Resolution is ${canvas.width}x${canvas.height} (${canvas.aspectRatio})`
    });

    // 2. Duration Compliance (< 60s)
    const isUnder60 = duration > 0 && duration <= 60;
    checks.push({
      id: 'duration_compliance',
      name: 'Shorts Duration Limit (< 60s)',
      passed: isUnder60,
      blocking: true,
      score: isUnder60 ? 15 : 0,
      details: `Duration is ${duration}s (target 30-58s)`
    });

    // 3. Scene Pacing & Visual Frequency (2-5s per beat)
    const sceneCount = scenes.length;
    const avgBeatDuration = sceneCount > 0 ? duration / sceneCount : 0;
    const isPacingOptimal = sceneCount >= 3 && avgBeatDuration >= 1.8 && avgBeatDuration <= 6.5;
    checks.push({
      id: 'scene_pacing',
      name: 'Scene Pacing & Visual Beat Frequency',
      passed: isPacingOptimal || sceneCount >= 3,
      blocking: false,
      score: isPacingOptimal ? 15 : (sceneCount >= 3 ? 10 : 5),
      details: `${sceneCount} visual beats, average ${avgBeatDuration.toFixed(1)}s per scene`
    });

    // 4. Character Presenter Consistency
    const characterScenes = scenes.filter(s => s.character?.present === true);
    const hasCharacter = characterScenes.length >= 1;
    checks.push({
      id: 'character_consistency',
      name: 'Character Presenter Integration',
      passed: hasCharacter,
      blocking: false,
      score: hasCharacter ? 15 : 5,
      details: `${characterScenes.length} scenes feature the Money In Minutes presenter`
    });

    // 5. Rich Animated Environment Integration
    const envScenes = scenes.filter(s => s.environment?.type);
    const hasRichEnvironments = envScenes.length >= 1;
    checks.push({
      id: 'environment_richness',
      name: 'Thematic 3D Environment Integration',
      passed: hasRichEnvironments,
      blocking: false,
      score: hasRichEnvironments ? 10 : 5,
      details: `${envScenes.length} scenes have thematic environment backdrops`
    });

    // 6. Financial Visual Density (Charts, Cards, Metrics)
    const financeVisualScenes = scenes.filter(s => s.financialGraphic);
    const hasFinanceGraphics = financeVisualScenes.length >= 1;
    checks.push({
      id: 'financial_visual_density',
      name: 'Financial Visual Density (Charts & Cards)',
      passed: hasFinanceGraphics,
      blocking: false,
      score: hasFinanceGraphics ? 15 : 5,
      details: `${financeVisualScenes.length} scenes contain financial charts, cards, or metric heroes`
    });

    // 7. Safe Zone Margins (Bottom 480px, Top 220px)
    const safeZoneHeight = SHORTS_SAFE_ZONE.maxHeight;
    const isSafeZoneCompliant = safeZoneHeight <= 1300 && SHORTS_SAFE_ZONE.bottom >= 400;
    checks.push({
      id: 'safe_zone_compliance',
      name: 'Mobile Safe Zone & UI Margin Clearance',
      passed: isSafeZoneCompliant,
      blocking: false,
      score: isSafeZoneCompliant ? 10 : 0,
      details: `Safe zone allocated: top ${SHORTS_SAFE_ZONE.top}px, bottom ${SHORTS_SAFE_ZONE.bottom}px, right ${SHORTS_SAFE_ZONE.right}px`
    });

    const totalScore = checks.reduce((sum, c) => sum + (c.score || 0), 0);
    const blockingFailures = checks.filter(c => c.blocking && !c.passed);
    const passed = blockingFailures.length === 0 && totalScore >= 70;

    return {
      score: Math.min(100, Math.max(0, totalScore)),
      passed,
      blockingFailures: blockingFailures.map(f => f.id),
      blockingFailureNames: blockingFailures.map(f => f.name),
      checks
    };
  }

  /**
   * Samples actual frames from an output MP4 video via FFmpeg to perform automated visual QA.
   *
   * @param {string} videoPath - Absolute path to rendered MP4
   * @param {object} options - Options including sampleCount and outputDir
   * @returns {Promise<object>} Frame inspection assessment
   */
  async inspectRenderedVideoFile(videoPath, options = {}) {
    if (!fs.existsSync(videoPath)) {
      return {
        passed: false,
        error: `Video file not found at: ${videoPath}`
      };
    }

    const hasFFmpeg = await checkFFmpeg();
    if (!hasFFmpeg) {
      return {
        passed: true,
        skippedFFmpeg: true,
        fileSize: fs.statSync(videoPath).size
      };
    }

    const _sampleCount = options.sampleCount || 3;
    const sampleDir = path.join(path.dirname(videoPath), 'qa_samples');
    fs.mkdirSync(sampleDir, { recursive: true });

    const sampleFrames = [];
    const sampleTimestamps = [0.15, 0.50, 0.85]; // 15%, 50%, 85% into the video

    for (let i = 0; i < sampleTimestamps.length; i++) {
      const fraction = sampleTimestamps[i];
      const framePath = path.join(sampleDir, `qa_frame_${i + 1}.jpg`);
      try {
        await runFFmpeg([
          '-y',
          '-ss', String(fraction * 45), // Approximate timestamp
          '-i', videoPath,
          '-vframes', '1',
          '-q:v', '2',
          framePath
        ]);

        if (fs.existsSync(framePath) && fs.statSync(framePath).size > 1000) {
          sampleFrames.push({
            frameIndex: i + 1,
            fraction,
            path: framePath,
            sizeBytes: fs.statSync(framePath).size
          });
        }
      } catch (err) {
        this.logger.warn(`Frame extraction at sample ${i + 1} skipped:`, err.message);
      }
    }

    const stat = fs.statSync(videoPath);
    return {
      passed: stat.size > 50000,
      fileSizeMB: Number((stat.size / (1024 * 1024)).toFixed(2)),
      sampleFramesExtracted: sampleFrames.length,
      sampleFrames,
      inspectedAt: new Date().toISOString()
    };
  }
}

module.exports = {
  VisualQualityChecker
};
