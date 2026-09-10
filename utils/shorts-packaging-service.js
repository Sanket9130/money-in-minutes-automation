const { Logger } = require('./logger');
const {
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_TAGS_LENGTH,
  normalizeTags,
  validateYouTubeMetadata
} = require('./youtube-metadata-validator');

/**
 * PublishingPackage
 * Structured, immutable container for verified Shorts publishing metadata.
 */
class PublishingPackage {
  constructor(data = {}) {
    this.id = data.id || `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.productionId = data.productionId || null;
    this.shortClipId = data.shortClipId || null;
    this.contentType = 'short';
    this.title = data.title || '';
    this.description = data.description || '';
    this.hashtags = Array.isArray(data.hashtags) ? data.hashtags : [];
    this.tags = Array.isArray(data.tags) ? data.tags : [];
    this.disclaimer = data.disclaimer || data.financialDisclaimer || null;
    this.financialDisclaimer = this.disclaimer;
    this.hasFinancialDisclaimer = Boolean(data.hasFinancialDisclaimer || this.disclaimer);
    this.verifiedSources = Array.isArray(data.verifiedSources)
      ? data.verifiedSources
      : (Array.isArray(data.sources) ? data.sources : []);
    this.sources = this.verifiedSources;
    this.sourcesVerified = Boolean(data.sourcesVerified);
    this.cover = data.cover || null;
    this.provenance = data.provenance || null;
    this.privacyStatus = data.privacyStatus || 'private';
    this.validation = data.validation || { valid: true, errors: [], warnings: [] };
    this.createdAt = data.createdAt || new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      productionId: this.productionId,
      shortClipId: this.shortClipId,
      contentType: this.contentType,
      title: this.title,
      description: this.description,
      hashtags: this.hashtags,
      tags: this.tags,
      disclaimer: this.disclaimer,
      financialDisclaimer: this.financialDisclaimer,
      hasFinancialDisclaimer: this.hasFinancialDisclaimer,
      sources: this.sources,
      verifiedSources: this.verifiedSources,
      sourcesVerified: this.sourcesVerified,
      cover: this.cover,
      provenance: this.provenance,
      privacyStatus: this.privacyStatus,
      validation: this.validation,
      createdAt: this.createdAt
    };
  }
}

/**
 * Standard disclaimer applied strictly to financial and business content.
 */
const FINANCIAL_DISCLAIMER = 'DISCLAIMER: Not financial advice. For educational and informational purposes only. This content does not constitute financial, investment, or legal advice.';

/**
 * Sensationalized words and patterns rejected in titles to avoid spam/clickbait flags.
 */
const BANNED_TITLE_PATTERNS = [
  /\bguaranteed\s*(?:wealth|profits?|returns?|money)\b/i,
  /\bget\s*rich\s*quick\b/i,
  /\bfree\s*money\b/i,
  /\b100%\s*guarantee\b/i,
  /\bsecret\s*loophole\b/i,
  /\binstant\s*wealth\b/i,
  /\bshocking\b/i,
  /\bblow\s*your\s*mind\b/i,
  /\b\d{3,}%\b/i
];

/**
 * ShortsPackagingService
 * Generates verified, platform-compliant publishing packages for YouTube Shorts.
 */
class ShortsPackagingService {
  constructor(options = {}) {
    this.logger = options.logger || new Logger('ShortsPackagingService');
  }

  /**
   * Generates a structured PublishingPackage from the final verified production output.
   */
  async generatePublishingPackage(production = {}, options = {}) {
    return this.generatePackage(production, options);
  }

  generatePackage(production = {}, options = {}) {
    const script = production.script || {};
    const strategy = production.strategy || {};
    const provenance = production.provenance || {};
    const verifiedData = Array.isArray(production.verifiedData)
      ? production.verifiedData
      : Array.isArray(script.verifiedData)
        ? script.verifiedData
        : Array.isArray(options.verifiedData)
          ? options.verifiedData
          : [];

    // 1. Title generation & cleaning
    const rawTitle = options.title || production.title || script.hook?.text || script.title || strategy.topic || production.topic || 'Business Insight in Minutes';
    const title = this.formatShortsTitle(rawTitle, verifiedData);

    // 2. Financial disclaimer detection
    const isFinancial = this.requiresFinancialDisclaimer(production);

    // 3. Extract verified sources
    const sources = this.extractVerifiedSources(production);

    // 4. Generate search tags & hashtags
    const hashtags = this.generateHashtags(production);
    const tags = this.generateTags(production, hashtags);

    // 5. Build structured description
    const description = this.buildDescription({
      title,
      script,
      strategy,
      sources,
      isFinancial,
      hashtags,
      parentUrl: options.parentUrl || production.parentUrl
    });

    // 6. Cover reference
    const cover = options.cover || production.assets?.cover || production.assets?.thumbnail || production.cover || null;

    // 7. Assemble package
    const pkg = new PublishingPackage({
      productionId: production.id,
      shortClipId: options.shortClipId || null,
      title,
      description,
      hashtags,
      tags,
      disclaimer: isFinancial ? FINANCIAL_DISCLAIMER : null,
      financialDisclaimer: isFinancial ? FINANCIAL_DISCLAIMER : null,
      hasFinancialDisclaimer: isFinancial,
      sources,
      verifiedSources: sources,
      sourcesVerified: sources.length > 0 && sources.every(s => s.status === 'verified'),
      cover: cover ? { path: cover.path, width: cover.width || 1080, height: cover.height || 1920 } : null,
      provenance: provenance.summary ? { ...provenance.summary, status: provenance.status } : null,
      privacyStatus: options.privacyStatus || production.privacyStatus || 'private'
    });

    // 8. Validate
    pkg.validation = this.validatePackage(pkg, { scriptText: script.fullScript || '', verifiedData });

    if (!pkg.validation.valid) {
      this.logger.warn(`Publishing package failed validation: ${pkg.validation.errors.join('; ')}`);
    } else {
      this.logger.info(`Publishing package created successfully for: "${pkg.title}"`);
    }

    return pkg;
  }

  generateTitle(input = {}) {
    const raw = typeof input === 'string'
      ? input
      : (input.title || input.script?.hook?.text || input.script?.title || input.topic || '');
    const verifiedData = Array.isArray(input.verifiedData) ? input.verifiedData : [];
    return this.formatShortsTitle(raw, verifiedData);
  }

  sanitizeTitle(rawText = '') {
    let clean = String(rawText || '')
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    clean = clean
      .replace(/\b(?:shocking|insane|unbelievable|secret\s*loophole|get\s*rich\s*quick|free\s*money|instant\s*wealth)\b/gi, '')
      .replace(/\bblow\s*your\s*mind\b/gi, '')
      .replace(/\bguaranteed\s*(?:wealth|profits?|returns?|money)?\b/gi, '')
      .replace(/\b\d+%/g, '')
      .replace(/[:\-_!]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    for (const pattern of BANNED_TITLE_PATTERNS) {
      clean = clean.replace(pattern, '').replace(/\s+/g, ' ').trim();
    }
    clean = clean.replace(/^[:\-\s]+|[:\-\s]+$/g, '').trim();
    if (!clean) clean = 'The True Cost of Business Strategy';
    return this.formatShortsTitle(clean, []);
  }

  validatePublishingPackage(pkg, context = {}) {
    return this.validatePackage(pkg, context);
  }

  /**
   * Formats and validates a concise Shorts-compatible title.
   * Capped at MAX_TITLE_LENGTH (100 chars), with 45-75 chars optimal for mobile feeds.
   */
  formatShortsTitle(rawText = '', verifiedData = []) {
    let clean = String(rawText || '')
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Remove leading/trailing quotation marks
    clean = clean.replace(/^["']|["']$/g, '');

    // Check for banned spam/scam clickbait patterns
    for (const pattern of BANNED_TITLE_PATTERNS) {
      if (pattern.test(clean)) {
        this.logger.warn(`Banned clickbait pattern detected in title "${clean}"; applying safe fallback`);
        clean = 'The True Cost of Business Strategy';
        break;
      }
    }

    // Verify numerical claim safety: if title contains a dollar/percentage stat, confirm it exists in verified data
    const statMatch = clean.match(/(\$\s*\d+(?:\.\d+)?\s*(?:[bmkt]|billion|million|trillion)?|\d+%\s*(?:growth|surge)?)/i);
    if (statMatch && verifiedData.length > 0) {
      const statClaim = statMatch[1].replace(/\s+/g, '').toUpperCase();
      const matchFound = verifiedData.some(item => {
        const itemVal = String(item.value || item.statistic || item.amount || '').replace(/\s+/g, '').toUpperCase();
        return itemVal.includes(statClaim) || statClaim.includes(itemVal);
      });
      if (!matchFound) {
        this.logger.warn(`Unverified numeric claim "${statMatch[1]}" in title; sanitizing title to safe generic phrasing`);
        clean = clean.replace(statMatch[1], 'Key Metric').trim();
      }
    }

    // Append #Shorts if not already present and length permits
    if (!/#shorts\b/i.test(clean)) {
      if (clean.length + 8 <= MAX_TITLE_LENGTH) {
        clean = `${clean} #Shorts`;
      }
    }

    // Ensure title does not exceed platform limits
    if (clean.length > MAX_TITLE_LENGTH) {
      clean = clean.slice(0, MAX_TITLE_LENGTH - 11).trim() + '... #Shorts';
    }

    return clean;
  }

  /**
   * Generates relevant hashtags from verified content.
   */
  /**
   * Generates relevant hashtags from verified content.
   */
  generateHashtags(production = {}) {
    const topic = String(production.topic || production.strategy?.topic || production.script?.title || '').toLowerCase();
    const tags = ['Shorts', 'MoneyInMinutes'];

    if (/revenue|profit|earning|finance|money|dollar|billion|valuation/i.test(topic)) {
      tags.push('Finance', 'Business');
    }
    if (/growth|scale|startup|founder|tech|compani/i.test(topic)) {
      tags.push('Entrepreneurship', 'Growth');
    }
    if (/invest|stock|market|trade|shares/i.test(topic)) {
      tags.push('Investing', 'StockMarket');
    }
    if (/ai|automation|software/i.test(topic)) {
      tags.push('Automation', 'Tech');
    }

    // Add 1-2 words from topic
    const words = topic.replace(/[^a-z0-9\s]/gi, '').split(/\s+/).filter(w => w.length >= 4 && !['about', 'video', 'minute', 'short'].includes(w));
    words.slice(0, 2).forEach(w => {
      const tag = w.charAt(0).toUpperCase() + w.slice(1);
      if (!tags.includes(tag)) tags.push(tag);
    });

    return tags.slice(0, 5).map(t => (t.startsWith('#') ? t : `#${t}`));
  }

  /**
   * Generates search keywords/tags normalized for YouTube snippet.
   */
  generateTags(production = {}, hashtags = []) {
    const topic = String(production.topic || production.strategy?.topic || production.script?.title || '');
    const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const rawTags = [
      'Shorts',
      'YouTube Shorts',
      'Money in Minutes',
      ...(production.strategy?.keywords || []),
      ...(production.seo?.tags || []),
      ...topicWords,
      ...hashtags.map(h => h.replace(/^#+/, ''))
    ];

    return normalizeTags(rawTags);
  }

  /**
   * Checks whether the production content requires a financial/investment disclaimer.
   */
  requiresFinancialDisclaimer(production = {}) {
    const combined = [
      production.topic,
      production.strategy?.topic,
      production.strategy?.contentType,
      production.script?.title,
      production.script?.fullScript,
      production.script?.hook?.text,
      production.seo?.title,
      production.title
    ].filter(Boolean).join(' ').toLowerCase();

    return /\b(?:invest|investing|investment|stock|stocks|crypto|trading|portfolio|roi|wealth|dividend|equity|financial\s*advice|revenue|profit|dollars?|valuation|quarterly\s*revenue)\b/i.test(combined);
  }

  /**
   * Extracts verified source references strictly from Truth-Anchor and Provenance data.
   */
  extractVerifiedSources(production = {}) {
    const sources = [];
    const seen = new Set();

    // Check provenance sources
    if (production.provenance?.sources && Array.isArray(production.provenance.sources)) {
      production.provenance.sources.forEach(src => {
        const key = src.url || src.title || src.citation;
        if (key && !seen.has(key)) {
          seen.add(key);
          sources.push({
            id: src.id || `src_${seen.size}`,
            title: src.title || src.publisher || src.citation || 'Verified Source',
            publisher: src.publisher || 'Official Data',
            url: src.url || null,
            status: src.status || (src.verified ? 'verified' : 'unverified')
          });
        }
      });
    }

    // Check truthAnchor items
    const truthAnchorPool = production.truthAnchor || production.script?.truthAnchor || [];
    if (Array.isArray(truthAnchorPool)) {
      truthAnchorPool.forEach(item => {
        const srcName = item.source || item.citation || item.sourceUrl;
        if (srcName && !seen.has(srcName)) {
          seen.add(srcName);
          sources.push({
            id: `src_truth_${seen.size}`,
            title: item.source || item.claim || 'Truth Anchor Reference',
            publisher: item.source || 'Verified Source',
            url: item.sourceUrl || null,
            status: item.verified !== false ? 'verified' : 'unverified'
          });
        }
      });
    }

    // Check researchSources in strategy
    if (production.strategy?.researchSources && Array.isArray(production.strategy.researchSources)) {
      production.strategy.researchSources.forEach(src => {
        if (src.url && !seen.has(src.url)) {
          seen.add(src.url);
          sources.push({
            id: src.id || `src_${seen.size}`,
            title: src.title || 'Official Source',
            publisher: src.publisher || 'Official Data',
            url: src.url,
            status: src.status || 'verified'
          });
        }
      });
    }

    // Check verifiedData items
    const verifiedPool = production.verifiedData || production.script?.verifiedData || [];
    if (Array.isArray(verifiedPool)) {
      verifiedPool.forEach(item => {
        if (item.source && typeof item.source === 'string' && !seen.has(item.source)) {
          seen.add(item.source);
          sources.push({
            id: `src_fact_${seen.size}`,
            title: item.source || item.label || 'Verified Data',
            publisher: item.source,
            url: item.sourceUrl || null,
            status: 'verified'
          });
        }
      });
    }

    return sources.slice(0, 5);
  }

  /**
   * Builds the structured video description.
   */
  buildDescription(data = {}) {
    const { title, script, strategy, sources, isFinancial, hashtags, parentUrl } = data;
    const parts = [];

    // 1. Punchy hook summary
    const summary = script.hook?.text || script.title || strategy.topic || title;
    parts.push(`${summary.replace(/\s*#shorts/i, '')}\n`);

    // 2. Call to Action
    parts.push('⚡ Subscribe to Money in Minutes for clear, verified business and finance breakdowns.\n');

    // 3. Parent video link (if repurposing from long-form)
    if (parentUrl) {
      parts.push(`📺 Watch the full in-depth video: ${parentUrl}\n`);
    }

    // 4. Verified sources attribution
    if (sources && sources.length > 0) {
      parts.push('📊 VERIFIED DATA SOURCES:');
      sources.forEach(src => {
        const pub = src.publisher && src.publisher !== src.title ? ` (${src.publisher})` : '';
        const link = src.url ? `: ${src.url}` : '';
        parts.push(`• ${src.title || src.publisher}${pub}${link}`);
      });
      parts.push('');
    }

    // 5. Financial disclaimer
    if (isFinancial) {
      parts.push(`⚠️ ${FINANCIAL_DISCLAIMER}\n`);
    }

    // 6. Hashtags
    if (hashtags && hashtags.length > 0) {
      const tagString = hashtags.map(t => `#${t.replace(/^#+/, '')}`).join(' ');
      parts.push(tagString);
    }

    const fullDescription = parts.join('\n').trim();
    return fullDescription.slice(0, MAX_DESCRIPTION_LENGTH);
  }

  /**
   * Validates the publishing package. Fails closed if critical rules are violated.
   */
  validatePackage(pkg, _context = {}) {
    const errors = [];
    const warnings = [];

    // Title validation
    if (!pkg.title || typeof pkg.title !== 'string') {
      errors.push('A valid title is required.');
    } else {
      if (pkg.title.length > MAX_TITLE_LENGTH) {
        errors.push(`Title length (${pkg.title.length}) exceeds maximum limit (${MAX_TITLE_LENGTH}).`);
      }
      for (const pattern of BANNED_TITLE_PATTERNS) {
        if (pattern.test(pkg.title)) {
          errors.push(`Title violates compliance policies with banned clickbait phrasing: "${pattern}".`);
        }
      }
    }

    // Description validation
    if (!pkg.description || pkg.description.length < 20) {
      errors.push('Description is missing or unreasonably short (minimum 20 characters).');
    } else if (pkg.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`Description length exceeds ${MAX_DESCRIPTION_LENGTH} characters.`);
    }

    // Hashtags validation
    if (!Array.isArray(pkg.hashtags) || pkg.hashtags.length === 0) {
      warnings.push('No hashtags defined for Short.');
    }

    // Tags validation
    if (!Array.isArray(pkg.tags) || pkg.tags.length < 3) {
      warnings.push('Fewer than three search tags configured.');
    } else {
      const totalLen = pkg.tags.join(',').length;
      if (totalLen > MAX_TAGS_LENGTH) {
        errors.push(`Tags character count (${totalLen}) exceeds limit (${MAX_TAGS_LENGTH}).`);
      }
      if (pkg.tags.length > 50) {
        errors.push(`Tag count (${pkg.tags.length}) exceeds limit.`);
      }
    }

    // Financial compliance check: if financial claims exist, disclaimer must be present
    if (pkg.hasFinancialDisclaimer && (!pkg.disclaimer || !pkg.description.toLowerCase().includes('disclaimer:'))) {
      errors.push('Financial content requires the mandatory disclaimer in the description.');
    }

    // YouTube metadata standard validation
    const ytResult = validateYouTubeMetadata({
      title: pkg.title,
      description: pkg.description,
      tags: pkg.tags
    });
    if (!ytResult.valid) {
      errors.push(...ytResult.errors);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Formats the publishing package for direct use by PublishingSchedulingAgent.
   */
  buildPublishingMetadata(pkg, options = {}) {
    return {
      seo: {
        title: pkg.title,
        description: pkg.description,
        tags: pkg.tags,
        categoryId: '27', // Education
        defaultLanguage: 'en',
        defaultAudioLanguage: 'en'
      },
      thumbnail: pkg.cover ? { path: pkg.cover.path } : null,
      privacyStatus: options.privacyStatus || pkg.privacyStatus || 'private',
      contentType: 'short',
      packagingPackage: pkg.toJSON(),
      containsSyntheticMedia: options.containsSyntheticMedia === true
    };
  }
}

module.exports = {
  PublishingPackage,
  ShortsPackagingService,
  FINANCIAL_DISCLAIMER,
  BANNED_TITLE_PATTERNS
};
