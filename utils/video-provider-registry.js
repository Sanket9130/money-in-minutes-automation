'use strict';

/**
 * VideoProviderRegistry for Money In Minutes
 *
 * OpenMontage-inspired provider architecture:
 * - Scored provider selector with automatic tiered fallback
 * - Free-First Cost Governance ($0.00 default production path)
 * - Itemized per-scene and total video cost ledger (FREE, FREE-TIER, PAID)
 * - Pluggable cloud adapters (Pexels/Pixabay, Kling, Runway, Veo, MiniMax, WAN/CogVideo)
 * - Strict disabled-by-default paid policy with budget enforcement
 */

const { Logger } = require('./logger');

const PROVIDER_TIERS = {
  FREE: 'FREE',             // 100% Local / Programmatic / Open Stock ($0.00)
  FREE_TIER: 'FREE-TIER',   // Free-tier cloud API with quota limits ($0.00)
  PAID: 'PAID'              // Paid API requiring explicit budget approval
};

/**
 * Base Provider Adapter Contract
 */
class BaseVideoProviderAdapter {
  constructor(id, name, tier, options = {}) {
    this.id = id;
    this.name = name;
    this.tier = tier;
    this.costPerSec = Number(options.costPerSec || 0.0);
    this.priority = Number(options.priority || 50);
    this.features = options.features || [];
    this.options = options;
  }

  isAvailable() {
    return true;
  }

  async generateClip(_scenePlan, _options = {}) {
    throw new Error(`generateClip not implemented on ${this.name}`);
  }
}

class LocalCanvasProviderAdapter extends BaseVideoProviderAdapter {
  constructor(options = {}) {
    super('local_canvas', 'Local HD Canvas & Motion Engine', PROVIDER_TIERS.FREE, {
      costPerSec: 0.0,
      priority: 100,
      features: ['character_animation', 'environments', 'finance_graphics', 'captions', 'safe_zones'],
      ...options
    });
  }

  isAvailable() {
    return true;
  }
}

class FreeStockVideoProviderAdapter extends BaseVideoProviderAdapter {
  constructor(options = {}) {
    super('free_stock_video', 'Pexels & Pixabay Stock Footage Engine', PROVIDER_TIERS.FREE, {
      costPerSec: 0.0,
      priority: 90,
      features: ['real_motion_footage', 'b_roll', 'environment_video'],
      ...options
    });
  }

  isAvailable() {
    return Boolean(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY);
  }
}

class LivePortraitProviderAdapter extends BaseVideoProviderAdapter {
  constructor(options = {}) {
    super('liveportrait_local', 'Local LivePortrait Presenter Engine', PROVIDER_TIERS.FREE, {
      costPerSec: 0.0,
      priority: 95,
      features: ['character_animation', 'lip_sync', 'facial_expressions', 'talking_head', 'offline'],
      ...options
    });
    const { LivePortraitProvider } = require('./liveportrait-provider');
    this.engine = new LivePortraitProvider(options);
  }

  isAvailable() {
    return true; // Exposes graceful fallback to SVG/Canvas presenter if dependencies are not loaded
  }

  async checkLivePortraitCapability() {
    return this.engine.checkAvailability();
  }
}

class LocalGPUVideoProviderAdapter extends BaseVideoProviderAdapter {
  constructor(options = {}) {
    super('local_gpu_video', 'Local Diffusion Engine (WAN 2.1 / CogVideo / LTX)', PROVIDER_TIERS.FREE, {
      costPerSec: 0.0,
      priority: 85,
      features: ['ai_video_diffusion', 'image_to_video', 'offline'],
      ...options
    });
  }

  isAvailable() {
    return process.env.VIDEO_GEN_LOCAL_ENABLED === 'true' || process.env.LOCAL_GPU_ENABLED === 'true';
  }
}

class GeminiMediaProviderAdapter extends BaseVideoProviderAdapter {
  constructor(options = {}) {
    super('gemini_media', 'Gemini Media Service', PROVIDER_TIERS.FREE_TIER, {
      costPerSec: 0.0,
      priority: 80,
      features: ['script_generation', 'tts_audio', 'image_assets'],
      ...options
    });
  }

  isAvailable() {
    return Boolean(process.env.GEMINI_API_KEY);
  }
}

class KlingProviderAdapter extends BaseVideoProviderAdapter {
  constructor(options = {}) {
    super('kling_video', 'Kling AI Official Video Engine', PROVIDER_TIERS.PAID, {
      costPerSec: 0.05,
      priority: 45,
      features: ['ai_video_diffusion', 'cinematic_motion', 'character_consistency', 'lip_sync'],
      ...options
    });
  }

  isAvailable() {
    return Boolean(process.env.KLING_API_KEY);
  }
}

class RunwayProviderAdapter extends BaseVideoProviderAdapter {
  constructor(options = {}) {
    super('runway_video', 'Runway Gen-3 / Gen-4 Alpha Engine', PROVIDER_TIERS.PAID, {
      costPerSec: 0.08,
      priority: 40,
      features: ['ai_video_diffusion', 'camera_director', 'cinematic_motion'],
      ...options
    });
  }

  isAvailable() {
    return Boolean(process.env.RUNWAY_API_KEY);
  }
}

class VeoProviderAdapter extends BaseVideoProviderAdapter {
  constructor(options = {}) {
    super('veo_video', 'Google DeepMind Veo Video Engine', PROVIDER_TIERS.PAID, {
      costPerSec: 0.10,
      priority: 85,
      features: ['ai_video_diffusion', 'image_to_video', '9:16_native', 'character_conditioning', '1080p'],
      ...options
    });
    const { GoogleVeoProvider } = require('./google-veo-provider');
    this.provider = new GoogleVeoProvider(options);
  }

  isAvailable() {
    return this.provider ? this.provider.isAvailable() : false;
  }

  async generateClip(scenePlan, options = {}) {
    return this.provider.generateClip(scenePlan, options);
  }
}

class MinimaxProviderAdapter extends BaseVideoProviderAdapter {
  constructor(options = {}) {
    super('minimax_video', 'MiniMax Hailuo H3 Video Engine', PROVIDER_TIERS.PAID, {
      costPerSec: 0.05,
      priority: 30,
      features: ['ai_video_diffusion', 'cinematic_motion'],
      ...options
    });
  }

  isAvailable() {
    return Boolean(process.env.MINIMAX_API_KEY);
  }
}

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
    const { GoogleVeoProvider } = require('./google-veo-provider');
    const veoInstance = new GoogleVeoProvider(this.options);

    this.register('local_canvas', new LocalCanvasProviderAdapter());
    this.register('liveportrait_local', new LivePortraitProviderAdapter());
    this.register('free_stock_video', new FreeStockVideoProviderAdapter());
    this.register('local_gpu_video', new LocalGPUVideoProviderAdapter());
    this.register('gemini_media', new GeminiMediaProviderAdapter());
    this.register('google_veo_3', veoInstance);
    this.register('veo_video', new VeoProviderAdapter(this.options));
    this.register('kling_video', new KlingProviderAdapter());
    this.register('runway_video', new RunwayProviderAdapter());
    this.register('minimax_video', new MinimaxProviderAdapter());

    // Legacy / simulation aliases
    this.register('replicate_video', {
      id: 'replicate_video',
      name: 'Replicate Video Engine (Wan / Kling / LivePortrait)',
      tier: PROVIDER_TIERS.PAID,
      costPerSec: 0.04,
      priority: 50,
      isAvailable: () => this.allowPaidProviders && Boolean(process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY),
      features: ['ai_video_diffusion', 'talking_head']
    });

    this.register('offline_speech', {
      id: 'offline_speech',
      name: 'Offline Speech Synthesizer',
      tier: PROVIDER_TIERS.FREE,
      costPerSec: 0.00,
      priority: 95,
      isAvailable: () => true,
      features: ['voice_narration', 'viseme_timing']
    });
  }

  register(id, providerDef) {
    this.providers.set(id, providerDef);
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
      .filter(p => (typeof p.isAvailable === 'function' ? p.isAvailable() : true))
      .filter(p => {
        if (p.tier === PROVIDER_TIERS.PAID && (!this.allowPaidProviders && !requirement.allowPaid)) {
          return false;
        }
        return true;
      });

    // Sort by priority descending (Local free providers have highest priority 100)
    available.sort((a, b) => (b.priority || 0) - (a.priority || 0));

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
      const costPerSec = Number(provider.costPerSec || 0.0);
      const sceneCost = Number((costPerSec * duration).toFixed(4));

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
  PROVIDER_TIERS,
  BaseVideoProviderAdapter,
  LocalCanvasProviderAdapter,
  LivePortraitProviderAdapter,
  FreeStockVideoProviderAdapter,
  LocalGPUVideoProviderAdapter,
  GeminiMediaProviderAdapter,
  KlingProviderAdapter,
  RunwayProviderAdapter,
  VeoProviderAdapter,
  MinimaxProviderAdapter,
  GoogleVeoProvider: require('./google-veo-provider').GoogleVeoProvider
};
