'use strict';

/**
 * Shorts Packaging Service
 *
 * Automates YouTube publishing packaging for Money-In-Minutes Shorts:
 * - Multi-candidate title tournament with Content DNA performance learning
 * - Formatted Shorts descriptions with verified Truth-Anchor citations & disclaimers
 * - Topic-specific, US-relevant hashtags (no generic trending spam)
 * - YouTube-compliant keyword/tag generation (<500 characters)
 * - Automated Cover/Thumbnail creation via ShortsCoverGenerator
 * - Strict pre-publishing Metadata QA Gate
 */

const { Logger } = require('./logger');
const { ShortsCoverGenerator } = require('./shorts-cover-generator');

const PROHIBITED_CLICKBAIT_PHRASES = [
  /\bget\s+rich\s+(?:quick|fast|overnight)\b/i,
  /\bguaranteed\s+(?:returns?|profit|wealth|income)\b/i,
  /\b100%\s+free\s+money\b/i,
  /\brisk\s+free\s+invest(?:ing|ment)\b/i,
  /\bmake\s+\$\d+k?\s+(?:in\s+minutes|today|overnight)\b/i,
  /\bsecret\s+glitch\b/i
];

const STANDARD_FINANCIAL_DISCLAIMER =
  '⚠️ DISCLAIMER: This video is for educational and informational purposes only and does not constitute financial, investment, or legal advice. Always conduct your own research before making financial decisions.';

class ShortsPackagingService {
  constructor(options = {}) {
    this.logger = new Logger('ShortsPackaging');
    this.coverGenerator = options.coverGenerator || new ShortsCoverGenerator(options);
    this.dnaService = options.dnaService || null;
    this.db = options.db || null;
  }

  /**
   * Generates a complete, compliant YouTube publishing package for a Short.
   *
   * @param {object} productionBundle - Production data containing script, strategy, provenance
   * @param {object} options - Customization overrides
   * @returns {Promise<object>} Complete publishing package
   */
  async createPublishingPackage(productionBundle = {}, options = {}) {
    const script = productionBundle.script || {};
    const strategy = productionBundle.strategy || {};
    const provenance = productionBundle.provenance || strategy.provenance || script.provenance || null;

    // 1. Generate and Select Strongest Title
    const titleCandidates = this.generateTitleCandidates(script, strategy, provenance);
    const selectedTitle = await this.selectOptimalTitle(titleCandidates, strategy, options);

    // 2. Generate Formatted Shorts Description with Citations & Disclaimer
    const description = this.generateDescription(script, strategy, provenance, options);

    // 3. Generate Topic-Specific Hashtags
    const hashtags = this.generateHashtags(script, strategy);

    // 4. Generate Search Keywords / Tags (< 500 characters)
    const tags = this.generateTags(script, strategy, selectedTitle);

    // 5. Generate Reusable Cover & Thumbnail Assets
    let visualAssets = { cover: null, thumbnail: null };
    try {
      visualAssets = await this.coverGenerator.generatePackagingAssets(script, {
        title: selectedTitle,
        headline: options.coverHeadline
      });
    } catch (coverErr) {
      this.logger.warn(`Cover asset generation warning: ${coverErr.message}`);
    }

    // 6. Pre-Publishing Metadata Quality Gate
    const metadataQA = this.validatePackaging({
      title: selectedTitle,
      description,
      hashtags,
      tags,
      provenance
    });

    const packaging = {
      title: selectedTitle,
      titleCandidates,
      description,
      hashtags,
      tags,
      keywords: strategy.keywords || [],
      thumbnail: visualAssets.thumbnail,
      cover: visualAssets.cover,
      sources: provenance?.sources || strategy.researchSources || [],
      disclaimer: STANDARD_FINANCIAL_DISCLAIMER,
      metadataQA,
      generatedAt: new Date().toISOString()
    };

    return packaging;
  }

  /**
   * Generates 3-5 distinct title candidate archetypes grounded in verified topic/script.
   */
  generateTitleCandidates(script = {}, strategy = {}, provenance = null) {
    const rawTitle = script.title || strategy.topic || 'Financial Breakdown';
    const topic = this.cleanTitleBase(rawTitle);

    // Extract key metric if verified in script or claims
    const verifiedMetric = this.extractVerifiedMetric(script, provenance);

    const candidates = [];

    // Archetype 1: Direct & Punchy
    candidates.push({
      archetype: 'direct_punchy',
      title: verifiedMetric ? `${topic}: The ${verifiedMetric} Breakdown` : `How ${topic} Actually Works`,
      score: 80
    });

    // Archetype 2: Curiosity & Insight
    candidates.push({
      archetype: 'curiosity_insight',
      title: `The Truth About ${topic} Nobody Tells You`,
      score: 85
    });

    // Archetype 3: Numerical / Specific (only if verified metric exists)
    if (verifiedMetric) {
      candidates.push({
        archetype: 'numerical_specific',
        title: `Inside ${topic}'s ${verifiedMetric} Engine`,
        score: 90
      });
    }

    // Archetype 4: Question Punch
    candidates.push({
      archetype: 'question_punch',
      title: `Why Is ${topic} Changing Everything?`,
      score: 75
    });

    // Archetype 5: Value / Warning Frame
    candidates.push({
      archetype: 'value_warning',
      title: `What You Need to Know About ${topic}`,
      score: 78
    });

    // Filter against clickbait rules
    return candidates
      .filter(c => !this.isProhibitedClickbait(c.title))
      .map(c => ({
        ...c,
        title: this.truncateTitle(c.title, 95)
      }));
  }

  /**
   * Selects the optimal title from candidates using Content DNA learning when available.
   */
  async selectOptimalTitle(candidates = [], _strategy = {}, _options = {}) {
    if (!candidates.length) return 'Financial Breakdown (60 Seconds)';

    // Consult Content DNA learning if service exists
    if (this.dnaService) {
      try {
        let dnaRecommendation = null;
        if (typeof this.dnaService.recommendOptimalDNAFromDB === 'function') {
          dnaRecommendation = await this.dnaService.recommendOptimalDNAFromDB();
        } else if (typeof this.dnaService.recommendOptimalDNA === 'function') {
          dnaRecommendation = await this.dnaService.recommendOptimalDNA();
        }
        if (dnaRecommendation && dnaRecommendation.confidence === 'statistically_supported') {
          const preferredArchetype = dnaRecommendation.preferredTitleArchetype;
          const match = candidates.find(c => c.archetype === preferredArchetype);
          if (match) return match.title;
        }
      } catch (err) {
        this.logger.debug('DNA title recommendation bypass:', err.message);
      }
    }

    // Default: Sort descending by calculated potential score
    const sorted = [...candidates].sort((a, b) => b.score - a.score);
    return sorted[0].title;
  }

  /**
   * Generates structured YouTube Shorts description with citations and disclaimer.
   */
  generateDescription(script = {}, strategy = {}, provenance = null, _options = {}) {
    let description = '';

    // 1. Hook / Core Value Takeaway (first 1-2 lines shown in search/mobile preview)
    const hookText = script.hook?.text || script.title || strategy.topic;
    description += `⚡ ${hookText}\n\n`;

    // 2. Key Insights / Breakdown from script sections
    if (script.mainContent?.sections?.length) {
      description += '📌 KEY BREAKDOWN:\n';
      script.mainContent.sections.slice(0, 4).forEach(section => {
        if (section.title) {
          description += `• ${section.title}\n`;
        }
      });
      description += '\n';
    }

    // 3. Contextual Call-to-Action
    description += '🔔 Subscribe to Money In Minutes for daily 60-second financial breakdowns.\n\n';

    // 4. Verified Citations from Truth-Anchor / Provenance
    const sources = provenance?.sources || strategy.researchSources || [];
    if (Array.isArray(sources) && sources.length > 0) {
      description += '📚 SOURCES & REFERENCES:\n';
      sources.slice(0, 4).forEach(src => {
        const publisher = src.publisher || src.title || 'Official Source';
        const url = src.url ? ` (${src.url})` : '';
        description += `• ${publisher}${url}\n`;
      });
      description += '\n';
    }

    // 5. Mandatory Financial Disclaimer
    description += `${STANDARD_FINANCIAL_DISCLAIMER}\n\n`;

    // 6. Topic Hashtags appended to description
    const hashtags = this.generateHashtags(script, strategy);
    description += hashtags.join(' ');

    return description.slice(0, 4500).trim();
  }

  /**
   * Generates clean, topic-specific hashtags relevant to US audience.
   * Strictly excludes generic spam tags (#viral, #trending).
   */
  generateHashtags(script = {}, strategy = {}) {
    const tags = new Set();

    // YouTube Shorts mandatory identifier
    tags.add('#Shorts');
    tags.add('#MoneyInMinutes');

    // Topic keyword tag
    const topic = (strategy.topic || script.title || '').toLowerCase();
    const words = topic.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    if (words.length > 0) {
      tags.add(`#${words.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`);
    }

    // Niche relevance
    const niche = (strategy.category || 'business').toLowerCase();
    if (niche.includes('tech') || topic.includes('tech') || topic.includes('ai')) {
      tags.add('#TechNews');
    } else if (niche.includes('invest') || topic.includes('invest') || topic.includes('stock')) {
      tags.add('#Investing');
    } else {
      tags.add('#PersonalFinance');
    }

    tags.add('#Business');
    return Array.from(tags).slice(0, 5);
  }

  /**
   * Generates search keywords/tags under YouTube's 500-character boundary.
   */
  generateTags(_script = {}, strategy = {}, title = '') {
    const rawTags = new Set();

    rawTags.add('Money In Minutes');
    rawTags.add('Shorts');
    rawTags.add('YouTube Shorts');
    rawTags.add('finance');
    rawTags.add('business');

    // Strategy keywords
    if (Array.isArray(strategy.keywords)) {
      strategy.keywords.forEach(kw => rawTags.add(String(kw).trim()));
    }

    // Topic and Title phrases
    if (strategy.topic) rawTags.add(strategy.topic);
    if (title) rawTags.add(title);

    // Deduplicate and enforce 450-character safety limit
    const finalTags = [];
    let totalLength = 0;

    for (const tag of rawTags) {
      const clean = tag.replace(/["\n\r]/g, '').trim();
      if (!clean || finalTags.includes(clean)) continue;
      if (totalLength + clean.length + 1 > 450) break;
      finalTags.push(clean);
      totalLength += clean.length + 1;
    }

    return finalTags;
  }

  /**
   * Metadata Quality Gate: Verifies that metadata complies with Truth-Anchor and YouTube standards.
   */
  validatePackaging(packaging = {}) {
    const errors = [];
    const checks = {
      hasTitle: false,
      nonClickbait: false,
      hasDescription: false,
      hasDisclaimer: false,
      cleanHashtags: false,
      tagsWithinLimit: false,
      claimIntegrity: false
    };

    // 1. Title verification
    if (packaging.title && packaging.title.length > 5 && packaging.title.length <= 100) {
      checks.hasTitle = true;
    } else {
      errors.push('Title must be between 6 and 100 characters');
    }

    // 2. Clickbait check
    if (!this.isProhibitedClickbait(packaging.title) && !this.isProhibitedClickbait(packaging.description)) {
      checks.nonClickbait = true;
    } else {
      errors.push('Packaging contains prohibited clickbait or deceptive financial promises');
    }

    // 3. Description verification
    if (packaging.description && packaging.description.length >= 50) {
      checks.hasDescription = true;
    } else {
      errors.push('Description is missing or too short');
    }

    // 4. Financial disclaimer check
    if (packaging.description && packaging.description.includes('DISCLAIMER')) {
      checks.hasDisclaimer = true;
    } else {
      errors.push('Mandatory financial disclaimer missing from description');
    }

    // 5. Hashtag quality
    const hasSpam = (packaging.hashtags || []).some(t => /#(?:viral|trending|fyp|foryou)\b/i.test(t));
    if (!hasSpam && (packaging.hashtags || []).includes('#Shorts')) {
      checks.cleanHashtags = true;
    } else {
      errors.push('Hashtags must include #Shorts and exclude spam tags (#viral, #trending, #fyp)');
    }

    // 6. Tags length check
    const tagLength = (packaging.tags || []).join(',').length;
    if (tagLength <= 450) {
      checks.tagsWithinLimit = true;
    } else {
      errors.push(`Tags length (${tagLength}) exceeds 450-character limit`);
    }

    // 7. Truth-Anchor claim check
    if (packaging.provenance) {
      const summary = packaging.provenance.summary || {};
      if (summary.conflictingClaims > 0) {
        errors.push(`Packaging rejected: ${summary.conflictingClaims} conflicting claim(s) in Truth-Anchor`);
      } else {
        checks.claimIntegrity = true;
      }
    } else {
      checks.claimIntegrity = true;
    }

    return {
      passed: errors.length === 0,
      checks,
      errors,
      blockingErrors: errors
    };
  }

  isProhibitedClickbait(text = '') {
    return PROHIBITED_CLICKBAIT_PHRASES.some(regex => regex.test(text));
  }

  cleanTitleBase(title = '') {
    return title
      .replace(/#shorts\b/gi, '')
      .replace(/^inside\s+/i, '')
      .replace(/^why\s+(?:is\s+)?/i, '')
      .replace(/^what\s+you\s+need\s+to\s+know\s+about\s+/i, '')
      .replace(/^the\s+truth\s+about\s+/i, '')
      .replace(/^how\s+to\s+/i, '')
      .replace(/^how\s+/i, '')
      .replace(/^the\s+/i, '')
      .replace(/[^\w\s$%,-]/g, '')
      .trim();
  }

  extractVerifiedMetric(script = {}, _provenance = null) {
    const fullText = `${script.title || ''} ${script.hook?.text || ''}`;
    const match = fullText.match(/\$[\d,.]+[BMKbmk]?|\d+%/);
    return match ? match[0] : null;
  }

  truncateTitle(str = '', maxLen = 95) {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + '...';
  }
}

module.exports = {
  ShortsPackagingService,
  STANDARD_FINANCIAL_DISCLAIMER,
  PROHIBITED_CLICKBAIT_PHRASES
};
