'use strict';

/**
 * VideoProviderRegistry for Money In Minutes
 *
 * OpenMontage-inspired provider architecture:
 * - Scored provider selector with automatic tiered fallback
 * - Free-First Cost Governance ($0.00 default production path)
 * - Itemized per-scene and total video cost ledger (FREE, FREE-TIER, PAID)
 * - Pluggable cloud providers (Replicate / Kling / Runway / Veo) disabled by default
 */

const { Logger } = require('./logger');

const PROVIDER_TIERS = {
  FREE: 'FREE',             // 100% Local / Programmatic ($0.00)
  FREE_TIER: 'FREE-TIER',   // Free-tier cloud API with quota limits ($0.00)
  PAID: 'PAID'              // Paid API requiring explicit budget approval
};

class VideoProviderRegistry {
  constructor(options = {}) {
    this.logger = new Logger('VideoProviderRegistry');
    this.options = options;
    this.budgetCap = options.budgetCap !== undefined ? Number(options.budgetCap) : 0.00; // $0 default
    this.allowPaidProviders = Boolean(options.allowPaidProviders || false);
    this.providers = new Map();
    this.registerDefaultProviders();
  }

  registerDefaultProviders() {
    // 1. Primary: Local Programmatic Canvas & WebGL Engine (Free, Offline, 0 latency)
    this.register('local_canvas', {
      name: 'Local HD Canvas & Motion Engine',
      tier: PROVIDER_TIERS.FREE,
      costPerSec: 0.00,
      priority: 100,
      isAvailable: () => true,
      features: ['character_animation', 'environments', 'finance_graphics', 'captions', 'safe_zones']
    });

    // 2. Offline Speech Synthesizer (Windows SAPI / FFmpeg tone stream)
    this.register('offline_speech', {
      name: 'Offline Speech Synthesizer',
      tier: PROVIDER_TIERS.FREE,
      costPerSec: 0.00,
      priority: 95,
      isAvailable: () => true,
      features: ['voice_narration', 'viseme_timing']
    });

    // 3. Free-Tier Cloud (Gemini Media & TTS)
    this.register('gemini_media', {
      name: 'Gemini Media Service',
      tier: PROVIDER_TIERS.FREE_TIER,
      costPerSec: 0.00,
      priority: 80,
      isAvailable: () => Boolean(process.env.GEMINI_API_KEY),
      features: ['script_generation', 'tts_audio', 'image_assets']
    });

    // 4. Pluggable Cloud AI Providers (Disabled unless explicitly configured and budgeted)
    this.register('replicate_video', {
      name: 'Replicate Video Engine (Wan / Kling / LivePortrait)',
      tier: PROVIDER_TIERS.PAID,
      costPerSec: 0.04, // ~$0.20 per 5s clip
      priority: 50,
      isAvailable: () => this.allowPaidProviders && Boolean(process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY),
      features: ['ai_video_diffusion', 'talking_head']
    });

    this.register('kling_video', {
      name: 'Kling Video Provider',
      tier: PROVIDER_TIERS.PAID,
      costPerSec: 0.05,
      priority: 45,
      isAvailable: () => this.allowPaidProviders && Boolean(process.env.KLING_API_KEY),
      features: ['ai_video_diffusion', 'cinematic_motion']
    });

    this.register('runway_video', {
      name: 'Runway Gen-3 Provider',
      tier: PROVIDER_TIERS.PAID,
      costPerSec: 0.08,
      priority: 40,
      isAvailable: () => this.allowPaidProviders && Boolean(process.env.RUNWAY_API_KEY),
      features: ['ai_video_diffusion', 'camera_director']
    });
  }

  register(id, providerDef) {
    this.providers.set(id, { id, ...providerDef });
  }

  getProvider(id) {
    return this.providers.get(id) || null;
  }

  /**
   * Selects the best provider for a given scene requirement using Free-First policy.
   *
   * @param {object} requirement - { requiredFeatures: [], allowPaid: false }
   * @returns {object} Selected provider definition
   */
  selectProvider(requirement = {}) {
    const available = Array.from(this.providers.values())
      .filter(p => p.isAvailable())
      .filter(p => {
        if (p.tier === PROVIDER_TIERS.PAID && (!this.allowPaidProviders && !requirement.allowPaid)) {
          return false;
        }
        return true;
      });

    // Sort by priority descending (Local free providers have highest priority 100)
    available.sort((a, b) => b.priority - a.priority);

    if (available.length === 0) {
      return this.getProvider('local_canvas');
    }

    return available[0];
  }

  /**
   * Builds an itemized cost ledger for a completed video production.
   *
   * @param {Array<object>} scenes - Storyboard scenes
   * @param {object} options - Video generation context
   * @returns {object} Itemized cost receipt
   */
  generateCostReceipt(scenes = [], options = {}) {
    let totalCost = 0.00;
    const sceneBreakdown = [];
    let dominantTier = PROVIDER_TIERS.FREE;

    scenes.forEach((scene, index) => {
      const providerId = scene.provider || (options.provider || 'local_canvas');
      const provider = this.getProvider(providerId) || this.getProvider('local_canvas');
      const duration = Number(scene.duration || 4.5);
      const sceneCost = Number((provider.costPerSec * duration).toFixed(4));

      totalCost += sceneCost;
      if (provider.tier === PROVIDER_TIERS.PAID) dominantTier = PROVIDER_TIERS.PAID;
      else if (provider.tier === PROVIDER_TIERS.FREE_TIER && dominantTier !== PROVIDER_TIERS.PAID) {
        dominantTier = PROVIDER_TIERS.FREE_TIER;
      }

      sceneBreakdown.push({
        sceneIndex: index + 1,
        sceneId: scene.sceneId || `scene_${index + 1}`,
        headline: scene.headline || scene.sectionTitle || 'Beat',
        provider: provider.name,
        tier: provider.tier,
        durationSeconds: duration,
        costUSD: sceneCost
      });
    });

    return {
      productionId: options.productionId || `prod_${Date.now()}`,
      tier: dominantTier,
      totalEstimatedCostUSD: Number(totalCost.toFixed(4)),
      currency: 'USD',
      budgetCapUSD: this.budgetCap,
      withinBudget: totalCost <= this.budgetCap || this.budgetCap === 0,
      generatedAt: new Date().toISOString(),
      sceneCount: scenes.length,
      sceneBreakdown
    };
  }
}

module.exports = {
  VideoProviderRegistry,
  PROVIDER_TIERS
};
