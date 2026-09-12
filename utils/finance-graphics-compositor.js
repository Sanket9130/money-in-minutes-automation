'use strict';

/**
 * Finance Graphics Compositor
 *
 * Generates premium, high-retention SVG financial graphics for YouTube Shorts:
 * - Membership / VIP Cards
 * - Money Flow & Revenue Pipelines
 * - Profit Margin Comparison Bar Charts
 * - Truth Anchor Verified Financial Badges & Metric Heroes
 * - Stock / Revenue Growth Trendlines
 * - Shopping Cart vs Cash Register Comparisons
 */

const { Logger } = require('./logger');

class FinanceGraphicsCompositor {
  constructor(options = {}) {
    this.logger = new Logger('FinanceGraphics');
    this.options = options;
  }

  /**
   * Renders a premium Glowing VIP / Warehouse Membership Card.
   */
  renderMembershipCard(options = {}) {
    const title = options.title || 'MEMBER PRIVILEGE';
    const subtitle = options.subtitle || 'GOLD STAR EXECUTIVE';
    const number = options.number || '7482 •••• •••• 9130';
    const memberSince = options.memberSince || '2024';
    const fee = options.fee || '$65 / YEAR';
    const width = options.width || 680;
    const height = options.height || 410;

    return `
      <div class="finance-graphic graphic-membership-card">
        <svg viewBox="0 0 680 410" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0F172A"/>
              <stop offset="45%" stop-color="#1E293B"/>
              <stop offset="100%" stop-color="#334155"/>
            </linearGradient>
            <linearGradient id="goldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#FCD34D"/>
              <stop offset="50%" stop-color="#F59E0B"/>
              <stop offset="100%" stop-color="#B45309"/>
            </linearGradient>
            <linearGradient id="chipGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#FDE68A"/>
              <stop offset="100%" stop-color="#D97706"/>
            </linearGradient>
            <filter id="cardGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#F59E0B" flood-opacity="0.35"/>
            </filter>
          </defs>

          <!-- Card Body with Gold Rim -->
          <g filter="url(#cardGlow)">
            <rect x="20" y="20" width="640" height="370" rx="28" fill="url(#cardBg)" stroke="url(#goldBorder)" stroke-width="4"/>
            
            <!-- Holographic Diagonal Sheen -->
            <path d="M20,180 L320,20 L400,20 L20,380 Z" fill="rgba(255,255,255,0.06)"/>
            <path d="M280,390 L660,20 L580,20 L200,390 Z" fill="rgba(245,158,11,0.08)"/>

            <!-- Top Header & Brand -->
            <text x="60" y="75" font-family="-apple-system, sans-serif" font-size="22" font-weight="900" fill="#F59E0B" letter-spacing="3">${escapeHTML(title)}</text>
            <text x="60" y="105" font-family="-apple-system, sans-serif" font-size="14" font-weight="600" fill="#94A3B8" letter-spacing="2">${escapeHTML(subtitle)}</text>

            <!-- Annual Fee Badge -->
            <rect x="470" y="48" width="150" height="42" rx="21" fill="rgba(245, 158, 11, 0.2)" stroke="#F59E0B" stroke-width="1.5"/>
            <text x="545" y="75" font-family="-apple-system, sans-serif" font-size="16" font-weight="800" fill="#FCD34D" text-anchor="middle">${escapeHTML(fee)}</text>

            <!-- EMV Chip -->
            <rect x="60" y="150" width="70" height="54" rx="10" fill="url(#chipGrad)" stroke="#78350F" stroke-width="1.5"/>
            <path d="M60,177 L130,177 M95,150 L95,204" stroke="#78350F" stroke-width="1.5" opacity="0.6"/>

            <!-- Contactless Wave Icon -->
            <path d="M155,165 A16,16 0 0,1 155,190 M165,158 A26,26 0 0,1 165,197 M175,151 A36,36 0 0,1 175,204" 
                  stroke="#F59E0B" stroke-width="3" stroke-linecap="round" fill="none"/>

            <!-- Card Number -->
            <text x="60" y="275" font-family="Courier, monospace" font-size="26" font-weight="700" fill="#F8FAFC" letter-spacing="4">${escapeHTML(number)}</text>

            <!-- Footer Details -->
            <text x="60" y="325" font-family="-apple-system, sans-serif" font-size="12" font-weight="600" fill="#64748B" letter-spacing="1">MEMBER SINCE</text>
            <text x="60" y="350" font-family="-apple-system, sans-serif" font-size="18" font-weight="800" fill="#E2E8F0">${escapeHTML(memberSince)}</text>

            <text x="440" y="325" font-family="-apple-system, sans-serif" font-size="12" font-weight="600" fill="#64748B" letter-spacing="1">RENEWAL STATUS</text>
            <text x="440" y="350" font-family="-apple-system, sans-serif" font-size="18" font-weight="900" fill="#10B981">93% RENEWAL RATE</text>
          </g>
        </svg>
      </div>
    `;
  }

  /**
   * Renders an animated Money Flow & Business Pipeline Diagram.
   */
  renderMoneyFlowDiagram(options = {}) {
    const width = options.width || 720;
    const height = options.height || 360;
    const step1 = options.step1 || '130M+ Members';
    const step2 = options.step2 || '$65-$130 Annual Fee';
    const step3 = options.step3 || '$4.6B Pure Profit';

    return `
      <div class="finance-graphic graphic-money-flow">
        <svg viewBox="0 0 720 360" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="flowBg" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#3B82F6"/>
              <stop offset="50%" stop-color="#F59E0B"/>
              <stop offset="100%" stop-color="#10B981"/>
            </linearGradient>
            <filter id="nodeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.5"/>
            </filter>
          </defs>

          <!-- Connecting Flow Pipe -->
          <path d="M120,180 L360,180 L600,180" stroke="url(#flowBg)" stroke-width="12" stroke-linecap="round" fill="none"/>
          <path d="M120,180 L360,180 L600,180" stroke="#FFFFFF" stroke-width="4" stroke-dasharray="14 10" stroke-linecap="round" fill="none" opacity="0.75"/>

          <!-- Step 1: Customers Node -->
          <g transform="translate(40, 100)" filter="url(#nodeGlow)">
            <rect x="0" y="0" width="170" height="160" rx="20" fill="#1E293B" stroke="#3B82F6" stroke-width="3"/>
            <circle cx="85" cy="45" r="26" fill="rgba(59, 130, 246, 0.2)"/>
            <text x="85" y="54" font-size="28" text-anchor="middle">👥</text>
            <text x="85" y="105" font-family="-apple-system, sans-serif" font-size="16" font-weight="800" fill="#FFFFFF" text-anchor="middle">${escapeHTML(step1)}</text>
            <text x="85" y="130" font-family="-apple-system, sans-serif" font-size="13" font-weight="600" fill="#94A3B8" text-anchor="middle">Loyal Base</text>
          </g>

          <!-- Step 2: Membership Fees Node -->
          <g transform="translate(275, 90)" filter="url(#nodeGlow)">
            <rect x="0" y="0" width="170" height="180" rx="20" fill="#1E293B" stroke="#F59E0B" stroke-width="3"/>
            <circle cx="85" cy="50" r="28" fill="rgba(245, 158, 11, 0.2)"/>
            <text x="85" y="60" font-size="30" text-anchor="middle">💳</text>
            <text x="85" y="115" font-family="-apple-system, sans-serif" font-size="15" font-weight="800" fill="#FCD34D" text-anchor="middle">${escapeHTML(step2)}</text>
            <text x="85" y="145" font-family="-apple-system, sans-serif" font-size="13" font-weight="600" fill="#CBD5E1" text-anchor="middle">100% Upfront Cash</text>
          </g>

          <!-- Step 3: Pure Profit Node -->
          <g transform="translate(510, 80)" filter="url(#nodeGlow)">
            <rect x="0" y="0" width="170" height="200" rx="20" fill="#064E3B" stroke="#10B981" stroke-width="4"/>
            <circle cx="85" cy="55" r="32" fill="rgba(16, 185, 129, 0.3)"/>
            <text x="85" y="66" font-size="34" text-anchor="middle">💰</text>
            <text x="85" y="125" font-family="-apple-system, sans-serif" font-size="16" font-weight="900" fill="#FFFFFF" text-anchor="middle">${escapeHTML(step3)}</text>
            <text x="85" y="155" font-family="-apple-system, sans-serif" font-size="14" font-weight="700" fill="#A7F3D0" text-anchor="middle">~72% of Total Net</text>
          </g>
        </svg>
      </div>
    `;
  }

  /**
   * Renders a high-impact Profit Margin Breakdown Bar Chart.
   */
  renderProfitMarginComparison(options = {}) {
    const width = options.width || 720;
    const height = options.height || 420;
    const retailLabel = options.retailLabel || 'Grocery / Retail Sales';
    const retailMargin = options.retailMargin || '1.5% Margin';
    const retailPercent = options.retailPercent || 15; // Width percentage on bar
    const memberLabel = options.memberLabel || 'Membership Fee Revenue';
    const memberMargin = options.memberMargin || '90%+ Profit Margin';
    const memberPercent = options.memberPercent || 90;

    return `
      <div class="finance-graphic graphic-profit-margins">
        <svg viewBox="0 0 720 420" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="retailBar" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#64748B"/>
              <stop offset="100%" stop-color="#94A3B8"/>
            </linearGradient>
            <linearGradient id="memberBar" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#059669"/>
              <stop offset="50%" stop-color="#10B981"/>
              <stop offset="100%" stop-color="#34D399"/>
            </linearGradient>
            <filter id="barShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000000" flood-opacity="0.4"/>
            </filter>
          </defs>

          <!-- Card Frame -->
          <rect x="10" y="10" width="700" height="400" rx="24" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="2"/>

          <text x="40" y="55" font-family="-apple-system, sans-serif" font-size="22" font-weight="900" fill="#F8FAFC" letter-spacing="1">📊 PROFIT MARGIN COMPARISON</text>

          <!-- Retail Bar Group -->
          <g transform="translate(40, 95)">
            <text x="0" y="0" font-family="-apple-system, sans-serif" font-size="17" font-weight="700" fill="#CBD5E1">${escapeHTML(retailLabel)}</text>
            <rect x="0" y="15" width="620" height="44" rx="12" fill="#1E293B"/>
            <rect x="0" y="15" width="${(620 * retailPercent) / 100}" height="44" rx="12" fill="url(#retailBar)" filter="url(#barShadow)"/>
            <text x="20" y="44" font-family="-apple-system, sans-serif" font-size="18" font-weight="800" fill="#FFFFFF">${escapeHTML(retailMargin)}</text>
            <text x="600" y="44" font-family="-apple-system, sans-serif" font-size="15" font-weight="600" fill="#94A3B8" text-anchor="end">Breakeven</text>
          </g>

          <!-- Membership Bar Group -->
          <g transform="translate(40, 220)">
            <text x="0" y="0" font-family="-apple-system, sans-serif" font-size="17" font-weight="700" fill="#FCD34D">${escapeHTML(memberLabel)}</text>
            <rect x="0" y="15" width="620" height="52" rx="14" fill="#1E293B"/>
            <rect x="0" y="15" width="${(620 * memberPercent) / 100}" height="52" rx="14" fill="url(#memberBar)" filter="url(#barShadow)"/>
            <text x="25" y="49" font-family="-apple-system, sans-serif" font-size="22" font-weight="900" fill="#064E3B">${escapeHTML(memberMargin)}</text>
            <text x="600" y="48" font-family="-apple-system, sans-serif" font-size="18" font-weight="900" fill="#10B981" text-anchor="end">60x Higher</text>
          </g>

          <!-- Bottom Insight Tag -->
          <rect x="40" y="340" width="640" height="46" rx="12" fill="rgba(16, 185, 129, 0.15)" stroke="#10B981" stroke-width="1.5"/>
          <text x="360" y="370" font-family="-apple-system, sans-serif" font-size="16" font-weight="800" fill="#A7F3D0" text-anchor="middle">💡 The secret: Groceries drive foot traffic; Memberships generate the profits.</text>
        </svg>
      </div>
    `;
  }

  /**
   * Renders a massive Truth Anchor Verified Metric Hero.
   */
  renderTruthAnchorMetricHero(options = {}) {
    const metric = options.metric || '$4.6 BILLION';
    const label = options.label || 'ANNUAL MEMBERSHIP FEE PROFIT';
    const source = options.source || 'SEC 10-K Filing Audit';
    const width = options.width || 720;
    const height = options.height || 360;

    return `
      <div class="finance-graphic graphic-truth-metric">
        <svg viewBox="0 0 720 360" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="metricTextGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#34D399"/>
              <stop offset="50%" stop-color="#10B981"/>
              <stop offset="100%" stop-color="#059669"/>
            </linearGradient>
            <filter id="metricGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#10B981" flood-opacity="0.45"/>
            </filter>
          </defs>

          <!-- Backplate Container -->
          <rect x="15" y="15" width="690" height="330" rx="28" fill="rgba(15, 23, 42, 0.9)" stroke="#10B981" stroke-width="3"/>

          <!-- Verified Truth Anchor Pill -->
          <g transform="translate(235, 45)">
            <rect x="0" y="0" width="250" height="38" rx="19" fill="#064E3B" stroke="#34D399" stroke-width="2"/>
            <circle cx="24" cy="19" r="9" fill="#10B981"/>
            <path d="M19,19 L22,22 L29,15" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <text x="135" y="25" font-family="-apple-system, sans-serif" font-size="14" font-weight="900" fill="#A7F3D0" text-anchor="middle" letter-spacing="1.5">VERIFIED DATA</text>
          </g>

          <!-- Hero Number -->
          <text x="360" y="195" font-family="-apple-system, sans-serif" font-size="76" font-weight="950" fill="url(#metricTextGrad)" text-anchor="middle" filter="url(#metricGlow)" letter-spacing="-1px">${escapeHTML(metric)}</text>

          <!-- Label -->
          <text x="360" y="255" font-family="-apple-system, sans-serif" font-size="20" font-weight="800" fill="#F8FAFC" text-anchor="middle" letter-spacing="2">${escapeHTML(label)}</text>

          <!-- Source Provenance -->
          <text x="360" y="300" font-family="-apple-system, sans-serif" font-size="14" font-weight="600" fill="#64748B" text-anchor="middle">SOURCE: ${escapeHTML(source)}</text>
        </svg>
      </div>
    `;
  }

  /**
   * Renders a Stock/Revenue Growth Trendline Chart.
   */
  renderMarketGrowthTrendline(options = {}) {
    const title = options.title || 'RECURRING MEMBERSHIP GROWTH';
    const value = options.value || '+93% Retention';
    const width = options.width || 700;
    const height = options.height || 360;

    return `
      <div class="finance-graphic graphic-trendline">
        <svg viewBox="0 0 700 360" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="trendArea" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#10B981" stop-opacity="0.45"/>
              <stop offset="100%" stop-color="#10B981" stop-opacity="0.0"/>
            </linearGradient>
            <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#10B981" flood-opacity="0.6"/>
            </filter>
          </defs>

          <!-- Frame -->
          <rect x="10" y="10" width="680" height="340" rx="24" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="2"/>

          <!-- Header -->
          <text x="40" y="55" font-family="-apple-system, sans-serif" font-size="20" font-weight="800" fill="#F8FAFC">${escapeHTML(title)}</text>
          <text x="640" y="55" font-family="-apple-system, sans-serif" font-size="24" font-weight="900" fill="#10B981" text-anchor="end">${escapeHTML(value)}</text>

          <!-- Grid Lines -->
          <line x1="40" y1="120" x2="640" y2="120" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" stroke-dasharray="6 6"/>
          <line x1="40" y1="180" x2="640" y2="180" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" stroke-dasharray="6 6"/>
          <line x1="40" y1="240" x2="640" y2="240" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" stroke-dasharray="6 6"/>
          <line x1="40" y1="300" x2="640" y2="300" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>

          <!-- Gradient Area Fill -->
          <path d="M40,280 C160,270 240,240 340,190 C440,140 520,110 640,80 L640,300 L40,300 Z" fill="url(#trendArea)"/>

          <!-- Glowing Green Upward Line -->
          <path d="M40,280 C160,270 240,240 340,190 C440,140 520,110 640,80" 
                stroke="#10B981" stroke-width="6" stroke-linecap="round" fill="none" filter="url(#lineGlow)"/>

          <!-- Peak Node Circle -->
          <circle cx="640" cy="80" r="10" fill="#34D399" filter="url(#lineGlow)"/>
          <circle cx="640" cy="80" r="4" fill="#FFFFFF"/>
        </svg>
      </div>
    `;
  }

  /**
   * Renders a vertical 4-step compounding process flywheel diagram.
   */
  renderProcessFlywheel(options = {}) {
    const width = options.width || 720;
    const height = options.height || 620;
    const steps = options.steps || [
      { text: 'Membership Fees', icon: '💳', subtext: '100% Upfront Cash' },
      { text: 'Lower Bulk Prices', icon: '🏷️', subtext: 'Strict 14% Markup Cap' },
      { text: 'More Loyal Customers', icon: '🛒', subtext: '130M+ Cardholders' },
      { text: 'Compounding Profits', icon: '🚀', subtext: '$4.6B Operating Income' }
    ];

    return `
      <div class="finance-graphic graphic-process-flywheel">
        <svg viewBox="0 0 720 620" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="flywheelFrame" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0F172A"/>
              <stop offset="100%" stop-color="#1E293B"/>
            </linearGradient>
            <filter id="boxGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.5"/>
            </filter>
          </defs>

          <!-- Backplate -->
          <rect x="10" y="10" width="700" height="600" rx="28" fill="url(#flywheelFrame)" stroke="#38BDF8" stroke-width="2.5"/>

          <text x="360" y="55" font-family="-apple-system, sans-serif" font-size="22" font-weight="900" fill="#38BDF8" text-anchor="middle" letter-spacing="2">🔄 THE COMPOUNDING SUBSCRIPTION FLYWHEEL</text>

          <!-- Step 1 -->
          <g transform="translate(110, 80)" filter="url(#boxGlow)">
            <rect x="0" y="0" width="500" height="90" rx="20" fill="#1E293B" stroke="#F59E0B" stroke-width="3"/>
            <text x="35" y="55" font-size="34">💳</text>
            <text x="90" y="45" font-family="-apple-system, sans-serif" font-size="22" font-weight="900" fill="#FCD34D">${escapeHTML(steps[0].text)}</text>
            <text x="90" y="70" font-family="-apple-system, sans-serif" font-size="14" font-weight="600" fill="#94A3B8">${escapeHTML(steps[0].subtext)}</text>
          </g>

          <!-- Down Arrow 1 -->
          <path d="M360,175 L360,205 M350,195 L360,205 L370,195" stroke="#F59E0B" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>

          <!-- Step 2 -->
          <g transform="translate(110, 215)" filter="url(#boxGlow)">
            <rect x="0" y="0" width="500" height="90" rx="20" fill="#1E293B" stroke="#3B82F6" stroke-width="3"/>
            <text x="35" y="55" font-size="34">🏷️</text>
            <text x="90" y="45" font-family="-apple-system, sans-serif" font-size="22" font-weight="900" fill="#60A5FA">${escapeHTML(steps[1].text)}</text>
            <text x="90" y="70" font-family="-apple-system, sans-serif" font-size="14" font-weight="600" fill="#94A3B8">${escapeHTML(steps[1].subtext)}</text>
          </g>

          <!-- Down Arrow 2 -->
          <path d="M360,310 L360,340 M350,330 L360,340 L370,330" stroke="#3B82F6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>

          <!-- Step 3 -->
          <g transform="translate(110, 350)" filter="url(#boxGlow)">
            <rect x="0" y="0" width="500" height="90" rx="20" fill="#1E293B" stroke="#A855F7" stroke-width="3"/>
            <text x="35" y="55" font-size="34">🛒</text>
            <text x="90" y="45" font-family="-apple-system, sans-serif" font-size="22" font-weight="900" fill="#C084FC">${escapeHTML(steps[2].text)}</text>
            <text x="90" y="70" font-family="-apple-system, sans-serif" font-size="14" font-weight="600" fill="#94A3B8">${escapeHTML(steps[2].subtext)}</text>
          </g>

          <!-- Down Arrow 3 -->
          <path d="M360,445 L360,475 M350,465 L360,475 L370,465" stroke="#10B981" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>

          <!-- Step 4 -->
          <g transform="translate(110, 485)" filter="url(#boxGlow)">
            <rect x="0" y="0" width="500" height="95" rx="20" fill="#064E3B" stroke="#10B981" stroke-width="3.5"/>
            <text x="35" y="58" font-size="36">🚀</text>
            <text x="90" y="48" font-family="-apple-system, sans-serif" font-size="24" font-weight="900" fill="#34D399">${escapeHTML(steps[3].text)}</text>
            <text x="90" y="74" font-family="-apple-system, sans-serif" font-size="14" font-weight="700" fill="#A7F3D0">${escapeHTML(steps[3].subtext)}</text>
          </g>
        </svg>
      </div>
    `;
  }
}

function escapeHTML(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  FinanceGraphicsCompositor
};
