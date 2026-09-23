'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { runFFmpeg } = require('./ffmpeg');
const { Logger } = require('./logger');

/**
 * Escapes characters for safe SVG/XML inclusion.
 */
function escapeXml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Permitted visual concept mappings per topic domain.
 * Enforces strict content-to-visual semantic isolation.
 */
const TOPIC_PERMITTED_ASSETS = {
  airline_miles: [
    'broll_airplane_cabin',
    'broll_boarding_pass',
    'broll_loyalty_dashboard',
    'broll_miles_redemption',
    'broll_flight_economics',
    'broll_flight_display',
    'broll_frequent_flyer_traveler',
    'presenter'
  ],
  fast_food: [
    'broll_menu_board',
    'broll_drive_thru',
    'broll_burger_pricing',
    'broll_food_cost_breakdown',
    'broll_app_loyalty_deal',
    'broll_fast_food_counter',
    'broll_combo_meal',
    'presenter'
  ],
  nvidia: [
    'broll_ai_datacenter',
    'broll_gpu_die_architecture',
    'broll_compute_moat_topology',
    'broll_hardware_economics',
    'broll_gpu_cluster',
    'broll_cuda_architecture',
    'broll_server_racks',
    'presenter'
  ],
  costco: [
    'broll_costco_warehouse_aisle',
    'broll_costco_bulk_pricing',
    'broll_membership_card',
    'broll_bulk_margin_meter',
    'broll_renewal_dial',
    'broll_warehouse_pallet',
    'presenter'
  ],
  swipe_fees: [
    'broll_payment_network_flow',
    'broll_interchange_breakdown',
    'broll_merchant_terminal_audit',
    'broll_card_transaction_routing',
    'broll_duopoly_volume',
    'presenter'
  ],
  disney: [
    'broll_disney_turnstile',
    'broll_dynamic_pricing_calendar',
    'broll_park_guest_economics',
    'broll_theme_park_entrance',
    'broll_attractions_crowd',
    'presenter'
  ],
  streaming: [
    'broll_subscription_ladder',
    'broll_arpu_split_screen',
    'broll_ghost_subscription_audit',
    'broll_streaming_devices',
    'broll_ad_tier_screen',
    'presenter'
  ],
  apple: [
    'broll_premium_smartphone',
    'broll_app_store_ecosystem',
    'broll_services_margin_chart',
    'broll_hardware_breakdown',
    'broll_consumer_laptop',
    'presenter'
  ],
  college_textbooks: [
    'broll_campus_bookstore',
    'broll_statement_audit',
    'broll_consumer_laptop',
    'broll_online_checkout',
    'presenter'
  ],
  gym_memberships: [
    'broll_consumer_sentiment',
    'broll_banking_app',
    'broll_statement_audit',
    'broll_consumer_laptop',
    'presenter'
  ],
  printer_ink: [
    'broll_consumer_laptop',
    'broll_online_checkout',
    'broll_statement_audit',
    'broll_market_terminal',
    'presenter'
  ],
  resort_fees: [
    'broll_statement_audit',
    'broll_consumer_sentiment',
    'broll_online_checkout',
    'broll_consumer_laptop',
    'presenter'
  ],
  luxury_watches: [
    'broll_consumer_sentiment',
    'broll_market_terminal',
    'broll_statement_audit',
    'broll_economic_chart',
    'presenter'
  ],
  auto_loans: [
    'broll_consumer_sentiment',
    'broll_statement_audit',
    'broll_economic_chart',
    'broll_market_terminal',
    'presenter'
  ],
  overdraft_fees: [
    'broll_banking_app',
    'broll_statement_audit',
    'broll_market_terminal',
    'presenter'
  ],
  gift_card_breakage: [
    'broll_statement_audit',
    'broll_market_terminal',
    'broll_banking_app',
    'broll_online_checkout',
    'presenter'
  ],
  market_pulse: [
    'broll_market_terminal',
    'broll_macro_liquidity',
    'broll_consumer_sentiment',
    'broll_economic_chart',
    'presenter'
  ]
};

/**
 * TopicVisualGenerator
 * Deterministically synthesizes rich, topic-specific 1080x1920 9:16 portrait
 * visual graphics, illustrations, and moving B-roll loops.
 */
class TopicVisualGenerator {
  constructor(options = {}) {
    this.logger = options.logger || new Logger('TopicVisualGenerator');
    this.width = Number(options.width || 1080);
    this.height = Number(options.height || 1920);
  }

  /**
   * Checks if an asset identifier is semantically permitted for a given topic key.
   */
  isAssetPermittedForTopic(topicKey, assetName) {
    if (!assetName || typeof assetName !== 'string') return true;
    const cleanAsset = assetName.toLowerCase().replace(/\.(mp4|jpg|png)$/, '');
    if (cleanAsset.includes('presenter') || cleanAsset === 'procedural' || cleanAsset === 'none') {
      return true;
    }

    const permitted = TOPIC_PERMITTED_ASSETS[topicKey];
    if (!permitted) return true; // generic/fallback topic

    // Toxic cross-topic contamination checks
    if (topicKey === 'airline_miles') {
      if (cleanAsset.includes('contactless') || cleanAsset.includes('burger') || cleanAsset.includes('menu_board') || cleanAsset.includes('gpu') || cleanAsset.includes('disney')) {
        return false;
      }
    } else if (topicKey === 'fast_food') {
      if (cleanAsset.includes('airline') || cleanAsset.includes('flight') || cleanAsset.includes('gpu') || cleanAsset.includes('datacenter') || cleanAsset.includes('disney') || cleanAsset.includes('bank_vault')) {
        return false;
      }
    } else if (topicKey === 'nvidia') {
      if (cleanAsset.includes('airline') || cleanAsset.includes('burger') || cleanAsset.includes('menu_board') || cleanAsset.includes('turnstile') || cleanAsset.includes('bank_vault') || cleanAsset.includes('contactless')) {
        return false;
      }
    } else if (topicKey === 'disney') {
      if (cleanAsset.includes('airline') || cleanAsset.includes('gpu') || cleanAsset.includes('burger') || cleanAsset.includes('costco')) {
        return false;
      }
    } else if (topicKey === 'costco') {
      if (cleanAsset.includes('airline') || cleanAsset.includes('gpu') || cleanAsset.includes('disney')) {
        return false;
      }
    } else if (topicKey === 'apple') {
      if (cleanAsset.includes('airline') || cleanAsset.includes('burger') || cleanAsset.includes('menu_board') || cleanAsset.includes('turnstile') || cleanAsset.includes('bank_vault') || cleanAsset.includes('costco')) {
        return false;
      }
    }

    return permitted.some(p => cleanAsset.includes(p.replace(/^broll_/, '')) || p.includes(cleanAsset.replace(/^broll_/, '')));
  }

  /**
   * Computes a 64-bit difference hash (dHash) from an image file.
   */
  async computeDHash(imagePath) {
    const { data } = await sharp(imagePath)
      .grayscale()
      .resize(9, 8, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hash = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const left = data[row * 9 + col];
        const right = data[row * 9 + col + 1];
        hash += left < right ? '1' : '0';
      }
    }
    let hexHash = '';
    for (let i = 0; i < hash.length; i += 4) {
      hexHash += parseInt(hash.substr(i, 4), 2).toString(16);
    }
    return { binary: hash, hex: hexHash };
  }

  /**
   * Computes cryptographic SHA-256 hash of a file.
   */
  async computeSha256(filePath) {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Generates a 1080x1920 SVG graphic for a given topic and concept.
   */
  renderTopicVisualSvg(topicKey, concept, options = {}) {
    const width = this.width;
    const height = this.height;
    const cleanConcept = String(concept || '').toLowerCase().replace(/^broll_/, '');
    const title = options.title || topicKey.toUpperCase();
    const metric = options.metric || null;

    switch (topicKey) {
      case 'airline_miles':
        return this._renderAirlineSvg(width, height, cleanConcept, title, metric);
      case 'fast_food':
        return this._renderFastFoodSvg(width, height, cleanConcept, title, metric);
      case 'nvidia':
        return this._renderNvidiaSvg(width, height, cleanConcept, title, metric);
      case 'costco':
        return this._renderCostcoSvg(width, height, cleanConcept, title, metric);
      case 'swipe_fees':
        return this._renderSwipeFeesSvg(width, height, cleanConcept, title, metric);
      case 'disney':
        return this._renderDisneySvg(width, height, cleanConcept, title, metric);
      case 'streaming':
        return this._renderStreamingSvg(width, height, cleanConcept, title, metric);
      case 'apple':
        return this._renderAppleSvg(width, height, cleanConcept, title, metric);
      case 'college_textbooks':
      case 'gym_memberships':
      case 'printer_ink':
      case 'resort_fees':
      case 'luxury_watches':
      case 'auto_loans':
      case 'overdraft_fees':
      case 'gift_card_breakage':
        return this._renderCanonicalDomainSvg(width, height, topicKey, cleanConcept, title, metric);
      default:
        return this._renderMarketPulseSvg(width, height, cleanConcept, title, metric);
    }
  }

  _renderCanonicalDomainSvg(width, height, topicKey, _concept, title, metric) {
    const DOMAIN_THEMES = {
      college_textbooks: {
        badge: '📚 HIGHER ED TEXTBOOK MONOPOLY',
        header: 'TEXTBOOK PRICE INFLATION',
        accent: '#818cf8',
        bg1: '#0b0f19',
        bg2: '#1e1b4b',
        defaultMetric: '1041% SURGE',
        subtitle: 'College Textbooks vs Consumer Price Index'
      },
      gym_memberships: {
        badge: '🏋️ FITNESS MEMBERSHIP AUDIT',
        header: 'GYM RECURRING REVENUE MODEL',
        accent: '#c084fc',
        bg1: '#0f0728',
        bg2: '#2e1065',
        defaultMetric: '6,500 MEMBERS',
        subtitle: 'Average Enrolled Members per 300-Person Club'
      },
      printer_ink: {
        badge: '🖨️ PRINTER HARDWARE & INK AUDIT',
        header: 'LIQUID GOLD PRICING AUDIT',
        accent: '#38bdf8',
        bg1: '#04101e',
        bg2: '#0c2340',
        defaultMetric: '$9,600 / GAL',
        subtitle: 'OEM Ink vs Vintage Champagne'
      },
      resort_fees: {
        badge: '🏨 HOSPITALITY DRIP PRICING AUDIT',
        header: 'MANDATORY RESORT FEE TOLL',
        accent: '#fbbf24',
        bg1: '#180f02',
        bg2: '#451a03',
        defaultMetric: '$3.0B / YR',
        subtitle: 'Annual Hidden Destination Fees Extracted'
      },
      luxury_watches: {
        badge: '⌚ LUXURY WATCH SCARCITY AUDIT',
        header: 'MANUFACTURED SCARCITY MACHINE',
        accent: '#34d399',
        bg1: '#021810',
        bg2: '#064e3b',
        defaultMetric: '1.24M / YR',
        subtitle: 'Annual Rolex Timepiece Production Output'
      },
      auto_loans: {
        badge: '🚗 AUTO FINANCING DEBT SPIRAL',
        header: 'THE 84-MONTH AUTO LOAN TRAP',
        accent: '#f87171',
        bg1: '#1a0505',
        bg2: '#450a0a',
        defaultMetric: '$738 / MO',
        subtitle: 'Average Monthly Payment for New Car Loans'
      },
      overdraft_fees: {
        badge: '🏦 COMMERCIAL BANKING FEE AUDIT',
        header: 'OVERDRAFT FEE HARVEST',
        accent: '#fb7185',
        bg1: '#1c050a',
        bg2: '#4c0519',
        defaultMetric: '$12.6B / YR',
        subtitle: 'Annual Overdraft Penalties Extracted by Banks'
      },
      gift_card_breakage: {
        badge: '☕ STORED VALUE CAPITAL FLOAT',
        header: 'UNREDEEMED CARD BREAKAGE',
        accent: '#2dd4bf',
        bg1: '#021a17',
        bg2: '#134e4a',
        defaultMetric: '$1.64B FLOAT',
        subtitle: 'Starbucks Customer Stored Value Balance'
      }
    };

    const theme = DOMAIN_THEMES[topicKey] || {
      badge: '📊 FINANCIAL MARKET AUDIT',
      header: 'MONEY IN MINUTES AUDIT',
      accent: '#38bdf8',
      bg1: '#020d1c',
      bg2: '#061c3b',
      defaultMetric: metric || '100%',
      subtitle: title
    };

    const displayMetric = metric || theme.defaultMetric;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="domainGrad_${topicKey}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${theme.bg1}" />
            <stop offset="50%" stop-color="${theme.bg2}" />
            <stop offset="100%" stop-color="#020408" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#domainGrad_${topicKey})" />

        <!-- Domain Badge -->
        <g transform="translate(100, 240)">
          <rect width="460" height="48" rx="24" fill="${theme.accent}" fill-opacity="0.25" stroke="${theme.accent}" stroke-width="2" />
          <text x="230" y="32" fill="${theme.accent}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" text-anchor="middle">${escapeXml(theme.badge)}</text>
        </g>

        <!-- Topic Card -->
        <g transform="translate(100, 360)">
          <rect width="880" height="1100" rx="36" fill="#0f172a" fill-opacity="0.96" stroke="${theme.accent}" stroke-width="3" />
          
          <rect width="880" height="150" rx="36" fill="${theme.accent}" fill-opacity="0.2" />
          <text x="50" y="60" fill="${theme.accent}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold">${escapeXml(theme.header)}</text>
          <text x="50" y="115" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="900">${escapeXml(title)}</text>

          <!-- Core Metric Box -->
          <g transform="translate(50, 220)">
            <rect width="780" height="240" rx="24" fill="#020817" stroke="${theme.accent}" stroke-width="2" />
            <text x="40" y="60" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold">${escapeXml(theme.subtitle)}</text>
            <text x="40" y="160" fill="${theme.accent}" font-family="Arial, Helvetica, sans-serif" font-size="80" font-weight="900">${escapeXml(displayMetric)}</text>
          </g>

          <!-- Narrative Breakdown -->
          <g transform="translate(50, 520)">
            <rect width="780" height="480" rx="24" fill="#1e293b" stroke="#334155" stroke-width="2" />
            <text x="40" y="70" fill="#f8fafc" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="bold">TRUTH ANCHOR AUDIT</text>
            <text x="40" y="140" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="26">Verified regulatory disclosures and empirical benchmarks</text>
            <text x="40" y="190" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="26">revealing the hidden mathematics of consumer finance.</text>
            <text x="40" y="270" fill="${theme.accent}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold">MONEY IN MINUTES AUDIT</text>
          </g>
        </g>
      </svg>
    `.trim();
  }

  /**
   * Generates a static PNG image for a given topic and concept.
   */
  async generateTopicVisualStill(topicKey, concept, outputPath, options = {}) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const svg = this.renderTopicVisualSvg(topicKey, concept, options);
    await sharp(Buffer.from(svg))
      .resize(this.width, this.height)
      .png({ quality: 95 })
      .toFile(outputPath);
    return outputPath;
  }

  /**
   * Generates a conformed 1080x1920 30fps MP4 video loop with gentle cinematic motion.
   */
  async generateTopicBRollVideo(topicKey, concept, duration, outputPath, options = {}) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const stillPath = outputPath.replace(/\.mp4$/, '_still.png');
    await this.generateTopicVisualStill(topicKey, concept, stillPath, options);

    const dur = Math.max(1, Number(duration || 4));
    // Gentle cinematic subtle slow push-in / drift to give lively motion
    const vf = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0006,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.ceil(dur * 30)}:s=1080x1920:fps=30,format=yuv420p`;

    const args = [
      '-y',
      '-loop', '1',
      '-i', stillPath,
      '-vf', vf,
      '-t', dur.toFixed(2),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      outputPath
    ];

    await runFFmpeg(args);
    await fs.unlink(stillPath).catch(() => {});
    return outputPath;
  }

  // =========================================================================
  // DOMAIN SVG RENDERERS
  // =========================================================================

  _renderAirlineSvg(width, height, concept, _title, metric) {
    const isBoardingPass = concept.includes('boarding') || concept.includes('loyalty') || concept.includes('miles');
    const isMargin = concept.includes('margin') || concept.includes('economics') || concept.includes('redemption');
    const isCover = concept.includes('cover');

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#021024" />
            <stop offset="40%" stop-color="#052659" />
            <stop offset="100%" stop-color="#021024" />
          </linearGradient>
          <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f59e0b" />
            <stop offset="100%" stop-color="#fbbf24" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#skyGrad)" />
        
        <!-- Airplane Wings & Horizon Motif -->
        <path d="M-100,500 L540,650 L1180,500" stroke="#0ea5e9" stroke-opacity="0.3" stroke-width="6" fill="none" />
        <path d="M540,300 L540,750" stroke="#38bdf8" stroke-opacity="0.25" stroke-width="2" stroke-dasharray="8,8" />
        <circle cx="540" cy="650" r="140" stroke="#38bdf8" stroke-opacity="0.2" stroke-width="3" fill="none" />

        <!-- Domain Badge -->
        <g transform="translate(100, 240)">
          <rect width="280" height="48" rx="24" fill="#0284c7" fill-opacity="0.25" stroke="#38bdf8" stroke-width="2" />
          <text x="140" y="32" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">✈️ GLOBAL AVIATION</text>
        </g>

        ${isCover ? `
          <!-- Dramatic Aviation Hero Motif -->
          <polygon points="0,200 1080,700 1080,950 0,450" fill="#0284c7" fill-opacity="0.35" />
          <circle cx="350" cy="450" r="220" stroke="#38bdf8" stroke-width="4" stroke-opacity="0.4" fill="none" />
          <path d="M100,500 L980,500" stroke="#38bdf8" stroke-width="2" stroke-dasharray="12,12" stroke-opacity="0.4" />
          <g transform="translate(100, 1100)">
            <rect width="880" height="300" rx="24" fill="#061f42" fill-opacity="0.9" stroke="#38bdf8" stroke-width="2" />
            <text x="50" y="80" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="bold">GLOBAL LOYALTY VALUATION</text>
            <text x="50" y="160" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="900">${metric ? escapeXml(metric) : '$30B ASSET'}</text>
            <text x="50" y="230" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="22">Airlines are credit card companies with wings</text>
          </g>
        ` : isBoardingPass ? `
          <!-- Digital Boarding Pass UI Card -->
          <g transform="translate(100, 360)">
            <rect width="880" height="1100" rx="36" fill="#0b1e3b" fill-opacity="0.94" stroke="#0284c7" stroke-width="3" />
            
            <!-- Header -->
            <rect width="880" height="180" rx="36" fill="#0284c7" fill-opacity="0.2" />
            <text x="50" y="70" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold">FREQUENT FLYER PROGRAM</text>
            <text x="50" y="130" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="900">SKYMILES DIAMOND</text>
            <g transform="translate(680, 50)">
              <rect width="150" height="40" rx="20" fill="url(#goldGrad)" />
              <text x="75" y="26" fill="#000000" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="900" text-anchor="middle">TIER MEDALLION</text>
            </g>

            <!-- Flight Segment -->
            <text x="50" y="260" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="900">JFK</text>
            <text x="50" y="300" fill="#64748b" font-family="Arial, Helvetica, sans-serif" font-size="20">NEW YORK</text>
            <text x="440" y="260" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="36" text-anchor="middle">✈ 6h 15m</text>
            <text x="830" y="260" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="900" text-anchor="end">LHR</text>
            <text x="830" y="300" fill="#64748b" font-family="Arial, Helvetica, sans-serif" font-size="20" text-anchor="end">LONDON HEATHROW</text>

            <line x1="50" y1="360" x2="830" y2="360" stroke="#1e293b" stroke-width="3" stroke-dasharray="12,12" />

            <!-- Loyalty Economics Meter -->
            <text x="50" y="440" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold">BANK LICENSING VALUATION</text>
            <text x="50" y="530" fill="#10b981" font-family="Arial, Helvetica, sans-serif" font-size="78" font-weight="900">${metric ? escapeXml(metric) : '$7.4B / YR'}</text>
            
            <g transform="translate(50, 580)">
              <rect width="780" height="24" rx="12" fill="#1e293b" />
              <rect width="620" height="24" rx="12" fill="#10b981" />
            </g>
            <text x="50" y="650" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="22">82% of Airline Market Cap Derived From Loyalty Portfolio</text>

            <!-- Barcode Graphic -->
            <g transform="translate(100, 800)">
              ${Array.from({ length: 42 }).map((_, i) => `
                <rect x="${i * 16}" y="0" width="${(i % 3 === 0 ? 8 : (i % 2 === 0 ? 4 : 2))}" height="140" fill="#38bdf8" fill-opacity="0.8" />
              `).join('')}
              <text x="340" y="180" fill="#64748b" font-family="monospace" font-size="22" text-anchor="middle">PASSENGER SEAT LIABILITY: DEVALUED</text>
            </g>
          </g>
        ` : isMargin ? `
          <!-- Loyalty vs Flight Margin Economics -->
          <g transform="translate(100, 420)">
            <rect width="880" height="980" rx="36" fill="#0b1e3b" fill-opacity="0.94" stroke="#0284c7" stroke-width="3" />
            <text x="50" y="90" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="bold">PROFIT MARGIN DIVERGENCE</text>
            
            <text x="50" y="200" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="bold">SELLING MILES TO BANKS</text>
            <text x="830" y="200" fill="#10b981" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="900" text-anchor="end">52%</text>
            <rect x="50" y="230" width="780" height="36" rx="18" fill="#1e293b" />
            <rect x="50" y="230" width="560" height="36" rx="18" fill="#10b981" />

            <text x="50" y="380" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="bold">FLYING ACTUAL PLANES</text>
            <text x="830" y="380" fill="#ef4444" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="900" text-anchor="end">8%</text>
            <rect x="50" y="410" width="780" height="36" rx="18" fill="#1e293b" />
            <rect x="50" y="410" width="120" height="36" rx="18" fill="#ef4444" />

            <rect x="50" y="550" width="780" height="260" rx="24" fill="#021024" stroke="#1e293b" stroke-width="2" />
            <text x="80" y="620" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="bold">THE FINANCIAL TRUTH:</text>
            <text x="80" y="680" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="26">Major carriers are credit-card loyalty firms</text>
            <text x="80" y="730" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="26">that operate passenger planes at cost.</text>
          </g>
        ` : `
          <!-- Airplane Cabin & Flight Deck View -->
          <g transform="translate(100, 420)">
            <rect width="880" height="980" rx="36" fill="#0b1e3b" fill-opacity="0.94" stroke="#0284c7" stroke-width="3" />
            <circle cx="440" cy="380" r="220" stroke="#0284c7" stroke-width="4" fill="#021024" />
            <path d="M340,380 L540,380 M440,280 L440,480" stroke="#38bdf8" stroke-width="4" />
            <text x="440" y="680" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="900" text-anchor="middle">AIRLINE FREQUENT FLYER ASSETS</text>
            <text x="440" y="740" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="26" text-anchor="middle">Pre-funded Bank Liquidity Engine</text>
          </g>
        `}
      </svg>
    `.trim();
  }

  _renderFastFoodSvg(width, height, concept, _title, metric) {
    const isMenu = concept.includes('menu') || concept.includes('drive_thru') || concept.includes('counter');
    const isCover = concept.includes('cover');
    const isApp = concept.includes('app') || concept.includes('deal') || concept.includes('phone') || concept.includes('mobile');

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="foodGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#2d1004" />
            <stop offset="50%" stop-color="#451a07" />
            <stop offset="100%" stop-color="#220c02" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#foodGrad)" />

        <!-- Drive Thru Neon Accents -->
        <circle cx="540" cy="500" r="320" stroke="#f59e0b" stroke-opacity="0.25" stroke-width="3" fill="none" />
        <line x1="100" y1="300" x2="980" y2="300" stroke="#ea580c" stroke-opacity="0.35" stroke-width="3" />

        <!-- Domain Badge -->
        <g transform="translate(100, 240)">
          <rect width="280" height="48" rx="24" fill="#ea580c" fill-opacity="0.3" stroke="#f97316" stroke-width="2" />
          <text x="140" y="32" fill="#f97316" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">🍔 FAST FOOD PRICING</text>
        </g>

        ${isCover ? `
          <!-- Giant Warm Neon Burger Arches & Price Ticker -->
          <circle cx="750" cy="450" r="280" fill="#ea580c" fill-opacity="0.35" stroke="#f59e0b" stroke-width="6" />
          <rect x="0" y="220" width="1080" height="160" fill="#b45309" fill-opacity="0.3" />
          <circle cx="300" cy="1400" r="180" stroke="#ef4444" stroke-width="4" fill="none" stroke-opacity="0.3" />
          <g transform="translate(100, 1100)">
            <rect width="880" height="300" rx="24" fill="#360f04" fill-opacity="0.9" stroke="#f59e0b" stroke-width="2" />
            <text x="50" y="80" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="bold">THE VALUE MENU ERA: ENDED</text>
            <text x="50" y="160" fill="#ef4444" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="900">${metric ? escapeXml(metric) : '$3.89 AVG'}</text>
            <text x="50" y="230" fill="#fdba74" font-family="Arial, Helvetica, sans-serif" font-size="22">Labor &amp; beef inflation killed the $1 loss leader</text>
          </g>
        ` : isApp ? `
          <!-- Mobile App Screen Silhouette UI -->
          <g transform="translate(140, 320)">
            <rect width="800" height="1180" rx="44" fill="#221006" stroke="#ea580c" stroke-width="4" />
            <rect x="250" y="24" width="300" height="28" rx="14" fill="#3b1506" />
            <text x="50" y="110" fill="#f97316" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold">MOBILE APP EXCLUSIVE PRICING</text>
            <text x="50" y="180" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="900">SURGE PRICING PROTOCOL</text>
            
            <g transform="translate(40, 230)">
              <rect width="720" height="190" rx="20" fill="#2d1408" stroke="#f59e0b" stroke-width="2" />
              <text x="40" y="60" fill="#fdba74" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold">DATA HARVESTING CONVERSION</text>
              <text x="40" y="135" fill="#ef4444" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="900">${metric ? escapeXml(metric) : '90% APPS'}</text>
            </g>

            <g transform="translate(40, 460)">
              <rect width="720" height="130" rx="18" fill="#2d1408" stroke="#431407" stroke-width="2" />
              <text x="30" y="55" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="bold">Digital In-App Coupon</text>
              <text x="30" y="95" fill="#fdba74" font-family="Arial, Helvetica, sans-serif" font-size="20">Requires Geolocation &amp; Payment Storage</text>
              <text x="690" y="75" fill="#10b981" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="900" text-anchor="end">SAVE 20%</text>
            </g>

            <g transform="translate(40, 630)">
              <rect width="720" height="260" rx="24" fill="#291206" stroke="#ea580c" stroke-width="2" />
              <text x="40" y="60" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold">IN-PERSON PRICE PENALTY</text>
              <text x="40" y="120" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="24">Drive-thru diners without mobile accounts</text>
              <text x="40" y="165" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="24">subsidize app discounts at highest margin.</text>
            </g>
          </g>
        ` : isMenu ? `
          <!-- Drive Thru Menu Board UI -->
          <g transform="translate(100, 360)">
            <rect width="880" height="1100" rx="36" fill="#221006" fill-opacity="0.96" stroke="#f97316" stroke-width="3" />
            
            <rect width="880" height="140" rx="36" fill="#ea580c" fill-opacity="0.25" />
            <text x="50" y="60" fill="#fdba74" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold">DRIVE-THRU DIGITAL BOARD</text>
            <text x="50" y="110" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="900">VALUE MENU AUDIT</text>

            <!-- Menu Row 1 -->
            <g transform="translate(50, 190)">
              <rect width="780" height="130" rx="20" fill="#2d1408" stroke="#431407" stroke-width="2" />
              <text x="30" y="55" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="bold">Double Cheeseburger</text>
              <text x="30" y="95" fill="#fdba74" font-family="Arial, Helvetica, sans-serif" font-size="22">2019: $1.00 Value Menu</text>
              <text x="740" y="75" fill="#ef4444" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="900" text-anchor="end">$3.89</text>
            </g>

            <!-- Menu Row 2 -->
            <g transform="translate(50, 340)">
              <rect width="780" height="130" rx="20" fill="#2d1408" stroke="#431407" stroke-width="2" />
              <text x="30" y="55" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="bold">Large French Fries</text>
              <text x="30" y="95" fill="#fdba74" font-family="Arial, Helvetica, sans-serif" font-size="22">2019: $1.79</text>
              <text x="740" y="75" fill="#ef4444" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="900" text-anchor="end">$4.49</text>
            </g>

            <!-- Combo Total Stat Callout -->
            <g transform="translate(50, 510)">
              <rect width="780" height="220" rx="24" fill="#3b1708" stroke="#ea580c" stroke-width="2" />
              <text x="40" y="60" fill="#fdba74" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold">AVERAGE COMBO MEAL SURGE</text>
              <text x="40" y="150" fill="#ef4444" font-family="Arial, Helvetica, sans-serif" font-size="82" font-weight="900">${metric ? escapeXml(metric) : '+38%'}</text>
              <text x="740" y="140" fill="#fdba74" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="bold" text-anchor="end">OUTPACING CPI</text>
            </g>

            <!-- App Data Capture Notice -->
            <g transform="translate(50, 770)">
              <rect width="780" height="180" rx="24" fill="#1c0d04" stroke="#ea580c" stroke-width="2" />
              <text x="40" y="60" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold">📱 THE APP CONVERSION TRAP</text>
              <text x="40" y="110" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="24">Discounts relocated exclusively to mobile apps.</text>
              <text x="40" y="150" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="22">Capturing customer data &amp; charging non-app diners full price.</text>
            </g>
          </g>
        ` : `
          <!-- Restaurant Cost Explosion Card -->
          <g transform="translate(100, 420)">
            <rect width="880" height="980" rx="36" fill="#221006" fill-opacity="0.96" stroke="#f97316" stroke-width="3" />
            <text x="50" y="80" fill="#fdba74" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="bold">WHOLESALE INPUT COST SURGE</text>
            
            <g transform="translate(50, 140)">
              <text x="0" y="50" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="bold">Ground Beef Inflation</text>
              <text x="780" y="50" fill="#ef4444" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="900" text-anchor="end">+40%</text>
              <rect x="0" y="70" width="780" height="28" rx="14" fill="#3b1708" />
              <rect x="0" y="70" width="560" height="28" rx="14" fill="#ef4444" />
            </g>

            <g transform="translate(50, 300)">
              <text x="0" y="50" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="bold">Store Hourly Wages</text>
              <text x="780" y="50" fill="#ef4444" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="900" text-anchor="end">+42%</text>
              <rect x="0" y="70" width="780" height="28" rx="14" fill="#3b1708" />
              <rect x="0" y="70" width="580" height="28" rx="14" fill="#ef4444" />
            </g>

            <rect x="50" y="520" width="780" height="320" rx="24" fill="#2d1408" stroke="#ea580c" stroke-width="2" />
            <text x="80" y="590" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="bold">WHY VALUE MENUS ARE EXTINCT</text>
            <text x="80" y="660" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="26">Franchisees can no longer sell loss leaders</text>
            <text x="80" y="710" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="26">at ninety-nine cents without guaranteed losses.</text>
            <text x="80" y="770" fill="#fdba74" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold">Source: USDA Economic Research Service</text>
          </g>
        `}
      </svg>
    `.trim();
  }

  _renderNvidiaSvg(width, height, concept, _title, metric) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="nvGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#021408" />
            <stop offset="50%" stop-color="#052811" />
            <stop offset="100%" stop-color="#010e05" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#nvGrad)" />

        <!-- Silicon Circuit Grid lines -->
        ${Array.from({ length: 9 }).map((_, i) => `
          <line x1="${i * 120 + 60}" y1="0" x2="${i * 120 + 60}" y2="${height}" stroke="#10b981" stroke-opacity="0.12" stroke-width="2" />
          <line x1="0" y1="${i * 200 + 100}" x2="${width}" y2="${i * 200 + 100}" stroke="#10b981" stroke-opacity="0.12" stroke-width="2" />
        `).join('')}

        <!-- Domain Badge -->
        <g transform="translate(100, 240)">
          <rect width="320" height="48" rx="24" fill="#10b981" fill-opacity="0.25" stroke="#34d399" stroke-width="2" />
          <text x="160" y="32" fill="#34d399" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">⚡ AI COMPUTE MOAT</text>
        </g>

        <!-- GPU Die & Server Rack Graphic -->
        <g transform="translate(100, 360)">
          <rect width="880" height="1100" rx="36" fill="#031f0f" fill-opacity="0.96" stroke="#10b981" stroke-width="3" />
          
          <rect width="880" height="160" rx="36" fill="#10b981" fill-opacity="0.18" />
          <text x="50" y="65" fill="#6ee7b7" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold">AI ACCELERATOR HARDWARE</text>
          <text x="50" y="120" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="900">NVIDIA H100 / B200</text>

          <!-- Silicon Die Schematic -->
          <g transform="translate(260, 220)">
            <rect width="360" height="360" rx="28" fill="#064e3b" stroke="#34d399" stroke-width="4" />
            <rect x="30" y="30" width="140" height="140" rx="12" fill="#047857" stroke="#10b981" stroke-width="2" />
            <rect x="190" y="30" width="140" height="140" rx="12" fill="#047857" stroke="#10b981" stroke-width="2" />
            <rect x="30" y="190" width="140" height="140" rx="12" fill="#047857" stroke="#10b981" stroke-width="2" />
            <rect x="190" y="190" width="140" height="140" rx="12" fill="#047857" stroke="#10b981" stroke-width="2" />
            <text x="180" y="190" fill="#ffffff" font-family="monospace" font-size="24" font-weight="900" text-anchor="middle">CUDA CORES</text>
          </g>

          <!-- Metric Stat Pill -->
          <g transform="translate(50, 640)">
            <rect width="780" height="190" rx="24" fill="#022c15" stroke="#10b981" stroke-width="2" />
            <text x="40" y="55" fill="#6ee7b7" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold">AI ACCELERATOR MARKET SHARE</text>
            <text x="40" y="145" fill="#34d399" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="900">${metric ? escapeXml(metric) : '85%+'}</text>
            <text x="740" y="130" fill="#a7f3d0" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold" text-anchor="end">MONOPOLY LOCK-IN</text>
          </g>

          <!-- Software Moat callout -->
          <g transform="translate(50, 870)">
            <rect width="780" height="170" rx="24" fill="#064e3b" fill-opacity="0.6" stroke="#059669" stroke-width="2" />
            <text x="40" y="55" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="bold">THE CUDA ECOSYSTEM TRAP</text>
            <text x="40" y="105" fill="#e2e8f0" font-family="Arial, Helvetica, sans-serif" font-size="24">Developers write CUDA; switching costs to rivals</text>
            <text x="40" y="145" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="22">require rebuilding millions of lines of AI kernel code.</text>
          </g>
        </g>
      </svg>
    `.trim();
  }

  _renderCostcoSvg(width, height, concept, _title, metric) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="costcoGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#021424" />
            <stop offset="50%" stop-color="#052848" />
            <stop offset="100%" stop-color="#021020" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#costcoGrad)" />

        <!-- Domain Badge -->
        <g transform="translate(100, 240)">
          <rect width="320" height="48" rx="24" fill="#0284c7" fill-opacity="0.25" stroke="#38bdf8" stroke-width="2" />
          <text x="160" y="32" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">📦 WHOLESALE ECONOMICS</text>
        </g>

        <!-- Costco Warehouse Card -->
        <g transform="translate(100, 360)">
          <rect width="880" height="1100" rx="36" fill="#07203d" fill-opacity="0.96" stroke="#0284c7" stroke-width="3" />
          
          <rect width="880" height="160" rx="36" fill="#0284c7" fill-opacity="0.2" />
          <text x="50" y="65" fill="#7dd3fc" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold">MEMBERSHIP MODEL DISCLOSURE</text>
          <text x="50" y="120" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="900">COSTCO WHOLESALE</text>

          <!-- Gold Star Membership Card Illustration -->
          <g transform="translate(120, 220)">
            <rect width="640" height="380" rx="24" fill="#0f172a" stroke="#f59e0b" stroke-width="3" />
            <rect x="40" y="40" width="120" height="40" rx="8" fill="#f59e0b" />
            <text x="100" y="66" fill="#000000" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="900" text-anchor="middle">EXECUTIVE</text>
            <circle cx="560" cy="80" r="36" fill="#f59e0b" fill-opacity="0.2" stroke="#f59e0b" stroke-width="2" />
            <text x="560" y="88" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold" text-anchor="middle">2%</text>
            <text x="40" y="240" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="900">MEMBERSHIP PASS</text>
            <text x="40" y="290" fill="#94a3b8" font-family="monospace" font-size="24">RENEWAL RATE: 90.5%</text>
          </g>

          <!-- 14% Markup Cap Meter -->
          <g transform="translate(50, 660)">
            <rect width="780" height="200" rx="24" fill="#041830" stroke="#0284c7" stroke-width="2" />
            <text x="40" y="55" fill="#7dd3fc" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold">RETAIL MARKUP CEILING</text>
            <text x="40" y="150" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="900">${metric ? escapeXml(metric) : '14% MAX'}</text>
            <text x="740" y="130" fill="#ef4444" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold" text-anchor="end">SUPERMARKETS: 30%</text>
          </g>

          <!-- Operating Income breakdown -->
          <g transform="translate(50, 890)">
            <rect width="780" height="150" rx="24" fill="#0f172a" stroke="#1e293b" stroke-width="2" />
            <text x="40" y="55" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="bold">THE PROFIT TRUTH:</text>
            <text x="40" y="105" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="24">72% of Costco operating profit is membership fees,</text>
            <text x="40" y="135" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="24">not merchandise markups.</text>
          </g>
        </g>
      </svg>
    `.trim();
  }

  _renderSwipeFeesSvg(width, height, concept, _title, metric) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#080e24" />
            <stop offset="50%" stop-color="#121e48" />
            <stop offset="100%" stop-color="#060917" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#cardGrad)" />

        <!-- Domain Badge -->
        <g transform="translate(100, 240)">
          <rect width="360" height="48" rx="24" fill="#6366f1" fill-opacity="0.25" stroke="#818cf8" stroke-width="2" />
          <text x="180" y="32" fill="#818cf8" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">💳 PAYMENT NETWORK RAILS</text>
        </g>

        <!-- 4-Party Network Schematic Card -->
        <g transform="translate(100, 360)">
          <rect width="880" height="1100" rx="36" fill="#0c1433" fill-opacity="0.96" stroke="#6366f1" stroke-width="3" />
          
          <rect width="880" height="150" rx="36" fill="#6366f1" fill-opacity="0.2" />
          <text x="50" y="60" fill="#a5b4fc" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold">INTERCHANGE SWIPE TOLL</text>
          <text x="50" y="115" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900">THE 4-PARTY PAYMENT FLOW</text>

          <!-- 4 Party Flow Nodes -->
          <g transform="translate(60, 220)">
            <rect x="0" y="0" width="220" height="120" rx="16" fill="#1e1b4b" stroke="#818cf8" stroke-width="2" />
            <text x="110" y="55" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" text-anchor="middle">CONSUMER</text>
            <text x="110" y="90" fill="#818cf8" font-family="Arial, Helvetica, sans-serif" font-size="18" text-anchor="middle">Taps Card</text>

            <path d="M220,60 L280,60" stroke="#818cf8" stroke-width="3" marker-end="url(#arrow)" />

            <rect x="270" y="0" width="220" height="120" rx="16" fill="#1e1b4b" stroke="#818cf8" stroke-width="2" />
            <text x="380" y="55" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" text-anchor="middle">MERCHANT</text>
            <text x="380" y="90" fill="#ef4444" font-family="Arial, Helvetica, sans-serif" font-size="18" text-anchor="middle">Pays -2.5%</text>

            <rect x="540" y="0" width="220" height="120" rx="16" fill="#312e81" stroke="#a5b4fc" stroke-width="2" />
            <text x="650" y="55" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" text-anchor="middle">NETWORK</text>
            <text x="650" y="90" fill="#10b981" font-family="Arial, Helvetica, sans-serif" font-size="18" text-anchor="middle">Takes Toll</text>
          </g>

          <!-- Swipe Fee Metric Callout -->
          <g transform="translate(50, 420)">
            <rect width="780" height="220" rx="24" fill="#1e1b4b" stroke="#6366f1" stroke-width="2" />
            <text x="40" y="60" fill="#a5b4fc" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold">ANNUAL US SWIPE FEE TOLL</text>
            <text x="40" y="150" fill="#818cf8" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="900">${metric ? escapeXml(metric) : '$170B / YR'}</text>
            <text x="740" y="140" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="24" text-anchor="end">Paid By Store Owners</text>
          </g>

          <!-- Duopoly Net Margin -->
          <g transform="translate(50, 690)">
            <rect width="780" height="280" rx="24" fill="#0f172a" stroke="#334155" stroke-width="2" />
            <text x="40" y="60" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold">NETWORK TOLLBOOTH MARGINS</text>
            <text x="40" y="120" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="900">55% Net Profit Margin</text>
            <text x="40" y="175" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="24">Visa &amp; Mastercard take no credit risk.</text>
            <text x="40" y="215" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="24">They simply operate the tollway for digital dollars.</text>
          </g>
        </g>
      </svg>
    `.trim();
  }

  _renderDisneySvg(width, height, concept, _title, metric) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="disneyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#18042b" />
            <stop offset="50%" stop-color="#2d0a4e" />
            <stop offset="100%" stop-color="#120224" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#disneyGrad)" />

        <!-- Domain Badge -->
        <g transform="translate(100, 240)">
          <rect width="360" height="48" rx="24" fill="#c084fc" fill-opacity="0.25" stroke="#e9d5ff" stroke-width="2" />
          <text x="180" y="32" fill="#e9d5ff" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">🏰 THEME PARK ECONOMICS</text>
        </g>

        <!-- Dynamic Pricing Calendar Card -->
        <g transform="translate(100, 360)">
          <rect width="880" height="1100" rx="36" fill="#200738" fill-opacity="0.96" stroke="#c084fc" stroke-width="3" />
          
          <rect width="880" height="150" rx="36" fill="#c084fc" fill-opacity="0.2" />
          <text x="50" y="60" fill="#e9d5ff" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold">DYNAMIC TICKET TIERS</text>
          <text x="50" y="115" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900">THE REVENUE PER GUEST FORMULA</text>

          <!-- Ticket Price Tiers -->
          <g transform="translate(50, 200)">
            <rect width="780" height="120" rx="20" fill="#3b0764" stroke="#a855f7" stroke-width="2" />
            <text x="40" y="55" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="bold">Tier 1 (Off-Peak)</text>
            <text x="740" y="70" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="900" text-anchor="end">$109</text>
          </g>

          <g transform="translate(50, 350)">
            <rect width="780" height="120" rx="20" fill="#3b0764" stroke="#a855f7" stroke-width="2" />
            <text x="40" y="55" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="bold">Tier 6 (Holiday Peak)</text>
            <text x="740" y="70" fill="#ef4444" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="900" text-anchor="end">$189</text>
          </g>

          <!-- Metric Stat Pill -->
          <g transform="translate(50, 520)">
            <rect width="780" height="220" rx="24" fill="#3b0764" stroke="#c084fc" stroke-width="2" />
            <text x="40" y="60" fill="#e9d5ff" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold">PER GUEST IN-PARK SPEND</text>
            <text x="40" y="150" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="84" font-weight="900">${metric ? escapeXml(metric) : '+40%'}</text>
            <text x="740" y="140" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="26" text-anchor="end">Lightning Lane Surge</text>
          </g>

          <!-- Crowd Monetization Callout -->
          <g transform="translate(50, 780)">
            <rect width="780" height="220" rx="24" fill="#0f021c" stroke="#581c87" stroke-width="2" />
            <text x="40" y="60" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="bold">YIELD MANAGEMENT AUDIT</text>
            <text x="40" y="115" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="24">Disney caps physical capacity while monetizing</text>
            <text x="40" y="160" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="24">time skips and priority queues.</text>
          </g>
        </g>
      </svg>
    `.trim();
  }

  _renderStreamingSvg(width, height, concept, _title, metric) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="streamGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#14020a" />
            <stop offset="50%" stop-color="#2b0517" />
            <stop offset="100%" stop-color="#0d0106" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#streamGrad)" />

        <!-- Domain Badge -->
        <g transform="translate(100, 240)">
          <rect width="360" height="48" rx="24" fill="#f43f5e" fill-opacity="0.25" stroke="#fb7185" stroke-width="2" />
          <text x="180" y="32" fill="#fb7185" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">📺 STREAMING DRAIN AUDIT</text>
        </g>

        <!-- Subscription Stack Card -->
        <g transform="translate(100, 360)">
          <rect width="880" height="1100" rx="36" fill="#1f0412" fill-opacity="0.96" stroke="#f43f5e" stroke-width="3" />
          
          <rect width="880" height="150" rx="36" fill="#f43f5e" fill-opacity="0.2" />
          <text x="50" y="60" fill="#fda4af" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold">THE AUTO-RENEW TRAP</text>
          <text x="50" y="115" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900">SUBSCRIPTION STACKING</text>

          <!-- Stack of Subs -->
          <g transform="translate(50, 200)">
            <rect width="780" height="100" rx="16" fill="#38071f" stroke="#e11d48" stroke-width="2" />
            <text x="40" y="60" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold">Ad-Free Video Plans</text>
            <text x="740" y="65" fill="#ef4444" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="900" text-anchor="end">+45% Since 2022</text>
          </g>

          <g transform="translate(50, 330)">
            <rect width="780" height="100" rx="16" fill="#38071f" stroke="#e11d48" stroke-width="2" />
            <text x="40" y="60" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold">Ad-Supported Tier Push</text>
            <text x="740" y="65" fill="#10b981" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="900" text-anchor="end">Higher ARPU</text>
          </g>

          <!-- Average American Spend -->
          <g transform="translate(50, 480)">
            <rect width="780" height="220" rx="24" fill="#38071f" stroke="#f43f5e" stroke-width="2" />
            <text x="40" y="60" fill="#fda4af" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold">ACTUAL MONTHLY DRAIN</text>
            <text x="40" y="150" fill="#fb7185" font-family="Arial, Helvetica, sans-serif" font-size="84" font-weight="900">${metric ? escapeXml(metric) : '$200 / MO'}</text>
            <text x="740" y="140" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="26" text-anchor="end">Perceived: Only $86</text>
          </g>

          <!-- Unused platform callout -->
          <g transform="translate(50, 740)">
            <rect width="780" height="260" rx="24" fill="#0f0107" stroke="#4c0519" stroke-width="2" />
            <text x="40" y="60" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold">GHOST SUBSCRIPTIONS</text>
            <text x="40" y="120" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="900">42% Pay For Unused Apps</text>
            <text x="40" y="180" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="24">Quiet recurring fees generate billions</text>
            <text x="40" y="220" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="24">for media conglomerates.</text>
          </g>
        </g>
      </svg>
    `.trim();
  }

  _renderAppleSvg(width, height, concept, _title, metric) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="appleGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#090d16" />
            <stop offset="50%" stop-color="#141c2e" />
            <stop offset="100%" stop-color="#060911" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#appleGrad)" />

        <!-- Domain Badge -->
        <g transform="translate(100, 240)">
          <rect width="360" height="48" rx="24" fill="#38bdf8" fill-opacity="0.25" stroke="#38bdf8" stroke-width="2" />
          <text x="180" y="32" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">📱 SMARTPHONE PROFIT AUDIT</text>
        </g>

        <!-- Premium Hardware Card -->
        <g transform="translate(100, 360)">
          <rect width="880" height="1100" rx="36" fill="#0f172a" fill-opacity="0.96" stroke="#38bdf8" stroke-width="3" />
          
          <rect width="880" height="150" rx="36" fill="#38bdf8" fill-opacity="0.2" />
          <text x="50" y="60" fill="#7dd3fc" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold">GLOBAL PROFIT CONCENTRATION</text>
          <text x="50" y="115" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900">HARDWARE &amp; SERVICES MOAT</text>

          <!-- Profit Concentration Metric -->
          <g transform="translate(50, 220)">
            <rect width="780" height="240" rx="24" fill="#021024" stroke="#0284c7" stroke-width="2" />
            <text x="40" y="60" fill="#7dd3fc" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold">GLOBAL SMARTPHONE PROFIT SHARE</text>
            <text x="40" y="160" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="900">${metric ? escapeXml(metric) : '85% SHARE'}</text>
          </g>

          <!-- Ecosystem Lock-in -->
          <g transform="translate(50, 520)">
            <rect width="780" height="480" rx="24" fill="#1e293b" stroke="#334155" stroke-width="2" />
            <text x="40" y="70" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="bold">THE SERVICES TOLLBOOTH</text>
            <text x="40" y="140" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="26">Apple commands 71% gross margins on services,</text>
            <text x="40" y="190" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="26">locking 2 billion active devices into subscriptions.</text>
            <text x="40" y="270" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold">MONEY IN MINUTES AUDIT</text>
          </g>
        </g>
      </svg>
    `.trim();
  }

  _renderMarketPulseSvg(width, height, concept, _title, metric) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="marketGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#020d1c" />
            <stop offset="50%" stop-color="#061c3b" />
            <stop offset="100%" stop-color="#010712" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#marketGrad)" />

        <!-- Domain Badge -->
        <g transform="translate(100, 240)">
          <rect width="320" height="48" rx="24" fill="#0284c7" fill-opacity="0.25" stroke="#38bdf8" stroke-width="2" />
          <text x="160" y="32" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">📊 MARKET INTELLIGENCE</text>
        </g>

        <!-- Market Terminal Card -->
        <g transform="translate(100, 360)">
          <rect width="880" height="1100" rx="36" fill="#05152c" fill-opacity="0.96" stroke="#0284c7" stroke-width="3" />
          
          <rect width="880" height="150" rx="36" fill="#0284c7" fill-opacity="0.2" />
          <text x="50" y="60" fill="#7dd3fc" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold">FINANCIAL MECHANICS AUDIT</text>
          <text x="50" y="115" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900">CONSUMER TACTICS &amp; DATA</text>

          <!-- Metric Display -->
          <g transform="translate(50, 220)">
            <rect width="780" height="240" rx="24" fill="#021024" stroke="#0284c7" stroke-width="2" />
            <text x="40" y="60" fill="#7dd3fc" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold">VERIFIED FINANCIAL METRIC</text>
            <text x="40" y="160" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="900">${metric ? escapeXml(metric) : 'TRUTH ANCHOR'}</text>
          </g>

          <g transform="translate(50, 520)">
            <rect width="780" height="480" rx="24" fill="#0b2447" stroke="#1e293b" stroke-width="2" />
            <text x="40" y="70" fill="#f59e0b" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="bold">INSTITUTIONAL PLAYBOOK</text>
            <text x="40" y="140" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="26">Corporate pricing algorithms maximize revenue</text>
            <text x="40" y="190" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="26">at the exact margin of consumer tolerance.</text>
            <text x="40" y="270" fill="#38bdf8" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold">MONEY IN MINUTES AUDIT</text>
          </g>
        </g>
      </svg>
    `.trim();
  }
}

function isAssetPermittedForTopic(topicKey, assetName) {
  const gen = new TopicVisualGenerator();
  return gen.isAssetPermittedForTopic(topicKey, assetName);
}

function computeDHash(imagePath) {
  const gen = new TopicVisualGenerator();
  return gen.computeDHash(imagePath);
}

function computeSha256(filePath) {
  const gen = new TopicVisualGenerator();
  return gen.computeSha256(filePath);
}

TopicVisualGenerator.isAssetPermittedForTopic = isAssetPermittedForTopic;
TopicVisualGenerator.computeDHash = computeDHash;
TopicVisualGenerator.computeSha256 = computeSha256;

module.exports = {
  TopicVisualGenerator,
  TOPIC_PERMITTED_ASSETS,
  isAssetPermittedForTopic,
  computeDHash,
  computeSha256
};
