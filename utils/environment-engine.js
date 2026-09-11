/**
 * EnvironmentEngine for Money In Minutes
 * 
 * Generates rich thematic 3D-styled animated environments (Warehouse, Tech HQ,
 * Trading Floor, Boardroom, Cleanroom) with parallax depth layers, lighting effects,
 * and interactive props.
 */

const ENVIRONMENTS = {
  RETAIL_WAREHOUSE: 'retail_warehouse', // Costco, Walmart, Amazon logistics
  TECH_HQ: 'tech_hq',                   // Apple, Nvidia, Google, AI startups
  TRADING_FLOOR: 'trading_floor',       // Wall St, Banks, Stocks, Crypto
  BOARDROOM_PITCH: 'boardroom_pitch',   // Startups, VCs, Business strategy
  TRUTH_CLEANROOM: 'truth_cleanroom'    // Truth Anchor verified metric room
};

class EnvironmentEngine {
  constructor() {
    this.environments = ENVIRONMENTS;
  }

  /**
   * Detect suitable environment category from topic, niche, and scene context
   */
  classifyEnvironment(topic = '', sceneText = '') {
    const text = `${topic} ${sceneText}`.toLowerCase();

    if (/costco|warehouse|walmart|retail|store|inventory|supermarket|membership|grocer/i.test(text)) {
      return ENVIRONMENTS.RETAIL_WAREHOUSE;
    }
    if (/nvidia|ai|tech|silicon|chip|software|apple|google|microsoft|algorithm|cloud/i.test(text)) {
      return ENVIRONMENTS.TECH_HQ;
    }
    if (/stock|trading|wall st|bank|interest|fed|dividend|crypto|market|revenue|valuation/i.test(text)) {
      return ENVIRONMENTS.TRADING_FLOOR;
    }
    if (/startup|pitch|founder|venture|acquisition|boardroom|ceo|business model/i.test(text)) {
      return ENVIRONMENTS.BOARDROOM_PITCH;
    }

    return ENVIRONMENTS.TRUTH_CLEANROOM;
  }

  /**
   * Render SVG environment background with depth, perspective, and interactive props
   * @param {string} envType
   * @param {Object} options
   */
  renderEnvironmentSVG(envType, options = {}) {
    const width = options.width || 1080;
    const height = options.height || 1920;
    const sceneIndex = options.sceneIndex || 0;

    switch (envType) {
      case ENVIRONMENTS.RETAIL_WAREHOUSE:
        return this.renderWarehouseEnvironment(width, height, sceneIndex, options);

      case ENVIRONMENTS.TECH_HQ:
        return this.renderTechHQEnvironment(width, height, sceneIndex, options);

      case ENVIRONMENTS.TRADING_FLOOR:
        return this.renderTradingFloorEnvironment(width, height, sceneIndex, options);

      case ENVIRONMENTS.BOARDROOM_PITCH:
        return this.renderBoardroomEnvironment(width, height, sceneIndex, options);

      case ENVIRONMENTS.TRUTH_CLEANROOM:
      default:
        return this.renderCleanroomEnvironment(width, height, sceneIndex, options);
    }
  }

  renderWarehouseEnvironment(width, height, sceneIndex, options = {}) {
    const showCart = options.hasCart || sceneIndex % 2 === 1;
    return `
      <svg class="environment-layer env-warehouse" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="wh-sky" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#090E17"/>
            <stop offset="60%" stop-color="#0F172A"/>
            <stop offset="100%" stop-color="#1E293B"/>
          </linearGradient>
          <linearGradient id="wh-floor" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#1E293B"/>
            <stop offset="50%" stop-color="#334155"/>
            <stop offset="100%" stop-color="#0F172A"/>
          </linearGradient>
          <linearGradient id="shelf-beam" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#E11D48"/>
            <stop offset="50%" stop-color="#F43F5E"/>
            <stop offset="100%" stop-color="#9F1239"/>
          </linearGradient>
          <linearGradient id="box-pallet" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#D97706"/>
            <stop offset="100%" stop-color="#92400E"/>
          </linearGradient>
          <filter id="light-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="15" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>

        <!-- Ceiling & Industrial Rafters -->
        <rect x="0" y="0" width="${width}" height="1000" fill="url(#wh-sky)"/>
        <line x1="0" y1="120" x2="${width}" y2="120" stroke="#334155" stroke-width="6"/>
        <line x1="0" y1="240" x2="${width}" y2="240" stroke="#334155" stroke-width="4"/>
        <line x1="200" y1="0" x2="200" y2="240" stroke="#1E293B" stroke-width="6"/>
        <line x1="540" y1="0" x2="540" y2="240" stroke="#1E293B" stroke-width="6"/>
        <line x1="880" y1="0" x2="880" y2="240" stroke="#1E293B" stroke-width="6"/>

        <!-- Fluorescent Strip Lights -->
        <g filter="url(#light-glow)">
          <rect x="120" y="110" width="160" height="12" rx="6" fill="#F8FAFC" opacity="0.9"/>
          <rect x="460" y="110" width="160" height="12" rx="6" fill="#F8FAFC" opacity="0.9"/>
          <rect x="800" y="110" width="160" height="12" rx="6" fill="#F8FAFC" opacity="0.9"/>
        </g>

        <!-- Perspective High-Rack Shelves Left & Right -->
        <!-- Left Shelves -->
        <polygon points="0,200 240,480 240,1400 0,1600" fill="#0B1329" opacity="0.95"/>
        <line x1="0" y1="450" x2="240" y2="600" stroke="url(#shelf-beam)" stroke-width="14"/>
        <line x1="0" y1="750" x2="240" y2="860" stroke="url(#shelf-beam)" stroke-width="14"/>
        <line x1="0" y1="1050" x2="240" y2="1120" stroke="url(#shelf-beam)" stroke-width="14"/>
        <!-- Pallet Boxes on Left -->
        <rect x="30" y="470" width="160" height="90" rx="6" fill="url(#box-pallet)"/>
        <rect x="50" y="580" width="140" height="140" rx="8" fill="#0284C7"/>
        <rect x="30" y="880" width="180" height="140" rx="8" fill="url(#box-pallet)"/>

        <!-- Right Shelves -->
        <polygon points="${width},200 ${width - 240},480 ${width - 240},1400 ${width},1600" fill="#0B1329" opacity="0.95"/>
        <line x1="${width}" y1="450" x2="${width - 240}" y2="600" stroke="url(#shelf-beam)" stroke-width="14"/>
        <line x1="${width}" y1="750" x2="${width - 240}" y2="860" stroke="url(#shelf-beam)" stroke-width="14"/>
        <line x1="${width}" y1="1050" x2="${width - 240}" y2="1120" stroke="url(#shelf-beam)" stroke-width="14"/>
        <!-- Pallet Boxes on Right -->
        <rect x="${width - 200}" y="470" width="160" height="90" rx="6" fill="#10B981"/>
        <rect x="${width - 210}" y="740" width="170" height="100" rx="8" fill="url(#box-pallet)"/>
        <rect x="${width - 200}" y="880" width="160" height="140" rx="8" fill="#6366F1"/>

        <!-- Warehouse Concrete Floor with Perspective Grid -->
        <polygon points="0,1200 ${width},1200 ${width},${height} 0,${height}" fill="url(#wh-floor)"/>
        <line x1="540" y1="1200" x2="100" y2="${height}" stroke="#475569" stroke-width="3" opacity="0.6"/>
        <line x1="540" y1="1200" x2="350" y2="${height}" stroke="#475569" stroke-width="2" opacity="0.6"/>
        <line x1="540" y1="1200" x2="730" y2="${height}" stroke="#475569" stroke-width="2" opacity="0.6"/>
        <line x1="540" y1="1200" x2="980" y2="${height}" stroke="#475569" stroke-width="3" opacity="0.6"/>

        ${showCart ? `
          <!-- Moving Interactive Shopping Cart in Midground -->
          <g class="interactive-prop shopping-cart" transform="translate(180, 1380) scale(0.95)">
            <ellipse cx="140" cy="180" rx="120" ry="25" fill="#000000" opacity="0.35"/>
            <!-- Metal Basket Mesh -->
            <polygon points="30,40 260,30 230,130 50,130" fill="none" stroke="#94A3B8" stroke-width="6"/>
            <line x1="70" y1="40" x2="80" y2="130" stroke="#94A3B8" stroke-width="3"/>
            <line x1="120" y1="40" x2="130" y2="130" stroke="#94A3B8" stroke-width="3"/>
            <line x1="170" y1="35" x2="175" y2="130" stroke="#94A3B8" stroke-width="3"/>
            <line x1="220" y1="32" x2="215" y2="130" stroke="#94A3B8" stroke-width="3"/>
            <!-- Bulk Items in Cart -->
            <rect x="60" y="10" width="80" height="60" rx="8" fill="#F59E0B"/>
            <rect x="130" y="-10" width="90" height="75" rx="10" fill="#3B82F6"/>
            <circle cx="210" cy="30" r="22" fill="#EF4444"/>
            <!-- Wheels & Frame -->
            <line x1="50" y1="130" x2="70" y2="165" stroke="#64748B" stroke-width="6"/>
            <line x1="230" y1="130" x2="210" y2="165" stroke="#64748B" stroke-width="6"/>
            <line x1="70" y1="165" x2="210" y2="165" stroke="#64748B" stroke-width="6"/>
            <circle cx="70" cy="165" r="14" fill="#334155" stroke="#F1F5F9" stroke-width="4"/>
            <circle cx="210" cy="165" r="14" fill="#334155" stroke="#F1F5F9" stroke-width="4"/>
            <!-- Red Handlebar -->
            <rect x="15" y="25" width="25" height="12" rx="6" fill="#DC2626"/>
          </g>
        ` : ''}

        <!-- Ambient Depth Vignette -->
        <radialGradient id="wh-vignette" cx="50%" cy="50%" r="70%">
          <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.6"/>
        </radialGradient>
        <rect x="0" y="0" width="${width}" height="${height}" fill="url(#wh-vignette)" pointer-events="none"/>
      </svg>
    `;
  }

  renderTechHQEnvironment(width, height, sceneIndex, _options = {}) {
    return `
      <svg class="environment-layer env-tech" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="tech-bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#030712"/>
            <stop offset="50%" stop-color="#0B1120"/>
            <stop offset="100%" stop-color="#020617"/>
          </linearGradient>
          <linearGradient id="glass-wall" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1E293B" stop-opacity="0.8"/>
            <stop offset="100%" stop-color="#0EA5E9" stop-opacity="0.15"/>
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#tech-bg)"/>
        <!-- Tech Server Grid & Neon Data Lines -->
        <line x1="0" y1="400" x2="${width}" y2="400" stroke="#0284C7" stroke-width="2" opacity="0.4"/>
        <line x1="0" y1="900" x2="${width}" y2="900" stroke="#0284C7" stroke-width="2" opacity="0.4"/>
        <rect x="80" y="300" width="380" height="700" rx="16" fill="url(#glass-wall)" stroke="#38BDF8" stroke-width="2"/>
        <rect x="620" y="300" width="380" height="700" rx="16" fill="url(#glass-wall)" stroke="#38BDF8" stroke-width="2"/>
        <!-- Floating Circuit Nodes -->
        <circle cx="270" cy="550" r="8" fill="#38BDF8"/>
        <circle cx="810" cy="650" r="8" fill="#818CF8"/>
      </svg>
    `;
  }

  renderTradingFloorEnvironment(width, height, sceneIndex, _options = {}) {
    return `
      <svg class="environment-layer env-trading" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="trade-bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#05130E"/>
            <stop offset="60%" stop-color="#09261C"/>
            <stop offset="100%" stop-color="#020A07"/>
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#trade-bg)"/>
        <!-- Dynamic Ticker Screens Backdrop -->
        <rect x="60" y="240" width="${width - 120}" height="140" rx="12" fill="#064E3B" stroke="#10B981" stroke-width="2" opacity="0.7"/>
        <text x="100" y="325" fill="#34D399" font-size="34" font-family="monospace" font-weight="bold">COST +4.2% ▲ AAPL +1.8% ▲ NVDA +6.4% ▲ SPY +0.9%</text>
      </svg>
    `;
  }

  renderBoardroomEnvironment(width, height, sceneIndex, _options = {}) {
    return `
      <svg class="environment-layer env-boardroom" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="board-bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0F172A"/>
            <stop offset="100%" stop-color="#1E293B"/>
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#board-bg)"/>
        <!-- Modern Frosted Glass Whiteboard with Business Diagram -->
        <rect x="80" y="280" width="${width - 160}" height="550" rx="20" fill="#334155" opacity="0.6" stroke="#64748B" stroke-width="3"/>
      </svg>
    `;
  }

  renderCleanroomEnvironment(width, height, sceneIndex, _options = {}) {
    return `
      <svg class="environment-layer env-cleanroom" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="clean-radial" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stop-color="#1E1B4B"/>
            <stop offset="60%" stop-color="#0F0C20"/>
            <stop offset="100%" stop-color="#05030A"/>
          </radialGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#clean-radial)"/>
      </svg>
    `;
  }
}

module.exports = { EnvironmentEngine, ENVIRONMENTS };
