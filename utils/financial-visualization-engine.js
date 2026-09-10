const { Logger } = require('./logger');

const VISUALIZATION_TYPES = Object.freeze({
  ANIMATED_METRIC: 'ANIMATED_METRIC',
  GROWTH_INDICATOR: 'GROWTH_INDICATOR',
  PERCENTAGE_GAUGE: 'PERCENTAGE_GAUGE',
  COMPARISON_BAR: 'COMPARISON_BAR',
  RANKING_LIST: 'RANKING_LIST',
  STATISTIC_CALLOUT: 'STATISTIC_CALLOUT',
  NUMERICAL_CHANGE: 'NUMERICAL_CHANGE',
  TREND_LINE: 'TREND_LINE'
});

const FALLBACK_REASONS = Object.freeze({
  MISSING_VERIFIED_DATA: 'MISSING_VERIFIED_DATA',
  INVALID_NUMERIC_DATA: 'INVALID_NUMERIC_DATA',
  UNVERIFIED_FINANCIAL_CLAIM: 'UNVERIFIED_FINANCIAL_CLAIM'
});

/**
 * Escapes characters for safe SVG/XML rendering.
 */
function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * NumberFormatter
 * Robust, precision-safe financial and numerical formatting.
 * Preserves the underlying raw verified value while rendering clear display strings.
 */
class NumberFormatter {
  /**
   * Safely parses a raw value (number or string) into a finite numeric value.
   */
  static parseNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const cleaned = String(value).trim().replace(/[$,]/g, '');
    const multiplierMatch = cleaned.match(/([+-]?\d+(?:\.\d+)?)\s*([bmkt]|billion|million|thousand|trillion|%)?/i);
    if (!multiplierMatch) return null;

    const base = parseFloat(multiplierMatch[1]);
    if (!Number.isFinite(base)) return null;

    const unit = (multiplierMatch[2] || '').toLowerCase();
    if (unit === 't' || unit === 'trillion') return base * 1e12;
    if (unit === 'b' || unit === 'billion') return base * 1e9;
    if (unit === 'm' || unit === 'million') return base * 1e6;
    if (unit === 'k' || unit === 'thousand') return base * 1e3;
    return base;
  }

  /**
   * Formats currency amounts safely into compact dollar strings ($12B, $500M, etc.)
   * while preserving the exact underlying verified value.
   */
  static formatCurrency(val, options = {}) {
    const rawNum = this.parseNumber(val);
    if (rawNum === null) {
      return { raw: val, display: '$0', unit: '', valid: false, reason: FALLBACK_REASONS.INVALID_NUMERIC_DATA };
    }

    const isNegative = rawNum < 0;
    const abs = Math.abs(rawNum);
    let displayUnit = '';
    let scaled = abs;

    if (abs >= 1e12) {
      scaled = abs / 1e12;
      displayUnit = 'T';
    } else if (abs >= 1e9) {
      scaled = abs / 1e9;
      displayUnit = 'B';
    } else if (abs >= 1e6) {
      scaled = abs / 1e6;
      displayUnit = 'M';
    } else if (abs >= 1e3 && options.compactThousand) {
      scaled = abs / 1e3;
      displayUnit = 'K';
    }

    const precision = Number.isInteger(scaled) ? 0 : Math.min(2, options.decimals !== undefined ? options.decimals : 1);
    const numStr = scaled.toFixed(precision).replace(/\.0+$/, '');
    const prefix = isNegative ? '-$' : '$';
    const display = `${prefix}${numStr}${displayUnit}`;

    return {
      raw: rawNum,
      display,
      scaled,
      unit: displayUnit,
      isNegative,
      valid: true
    };
  }

  /**
   * Formats percentage values safely (+42%, -15.5%, etc.)
   */
  static formatPercentage(val, options = {}) {
    let rawNum = typeof val === 'number' ? val : null;
    if (rawNum === null && typeof val === 'string') {
      const match = String(val).match(/([+-]?\d+(?:\.\d+)?)/);
      if (match) rawNum = parseFloat(match[1]);
    }

    if (rawNum === null || !Number.isFinite(rawNum)) {
      return { raw: val, display: '0%', valid: false, reason: FALLBACK_REASONS.INVALID_NUMERIC_DATA };
    }

    const isNegative = rawNum < 0;
    const direction = isNegative ? 'down' : rawNum > 0 ? 'up' : 'neutral';
    const precision = Number.isInteger(rawNum) ? 0 : Math.min(2, options.decimals !== undefined ? options.decimals : 1);
    const numStr = Math.abs(rawNum).toFixed(precision).replace(/\.0+$/, '');
    const sign = options.explicitSign && rawNum > 0 ? '+' : isNegative ? '-' : '';
    const display = `${sign}${numStr}%`;

    return {
      raw: rawNum,
      display,
      direction,
      isNegative,
      valid: true
    };
  }

  /**
   * Formats compact business counts (500 stores, 10K employees, etc.)
   */
  static formatCompactNumber(val, options = {}) {
    const rawNum = this.parseNumber(val);
    if (rawNum === null) {
      return { raw: val, display: '0', unit: '', valid: false, reason: FALLBACK_REASONS.INVALID_NUMERIC_DATA };
    }

    const abs = Math.abs(rawNum);
    let displayUnit = '';
    let scaled = abs;

    if (abs >= 1e9) {
      scaled = abs / 1e9;
      displayUnit = 'B';
    } else if (abs >= 1e6) {
      scaled = abs / 1e6;
      displayUnit = 'M';
    } else if (abs >= 1e3 && (options.compactThousand || abs >= 1e4)) {
      scaled = abs / 1e3;
      displayUnit = 'K';
    }

    const precision = Number.isInteger(scaled) ? 0 : Math.min(2, options.decimals !== undefined ? options.decimals : 1);
    const numStr = (rawNum < 0 ? '-' : '') + (displayUnit ? scaled.toFixed(precision).replace(/\.0+$/, '') : abs.toLocaleString('en-US'));

    return {
      raw: rawNum,
      display: `${numStr}${displayUnit}`,
      scaled,
      unit: displayUnit,
      valid: true
    };
  }

  /**
   * Formats delta changes (+$2.4B, -15%, +500).
   */
  static formatDeltaChange(val, unitType = 'currency') {
    if (unitType === 'percentage') {
      return this.formatPercentage(val, { explicitSign: true });
    }
    const curr = this.formatCurrency(val);
    if (curr.valid && curr.raw > 0) {
      curr.display = `+${curr.display}`;
    }
    return curr;
  }
}

/**
 * VisualizationSpec
 * Machine-readable specification container for deterministic rendering.
 */
class VisualizationSpec {
  constructor(data = {}) {
    this.type = data.type || VISUALIZATION_TYPES.ANIMATED_METRIC;
    this.label = data.label || '';
    this.unit = data.unit || '';
    this.source = data.source || 'Truth-Anchor Verified';
    this.verifiedData = data.verifiedData || null;
    this.formatted = data.formatted || null;
    this.animation = data.animation || 'CONTROLLED_ENTRANCE';
    this.aspectRatio = data.aspectRatio || '9:16';
    this.dimensions = data.dimensions || (this.aspectRatio === '16:9' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 });
    this.safeZones = data.safeZones || (this.aspectRatio === '16:9'
      ? { top: 108, bottom: 108, left: 192, right: 192 }
      : { top: 288, bottom: 384, left: 80, right: 160 });
    this.meta = data.meta || {};
  }

  toJSON() {
    return {
      type: this.type,
      label: this.label,
      unit: this.unit,
      source: this.source,
      verifiedData: this.verifiedData,
      formatted: this.formatted,
      animation: this.animation,
      aspectRatio: this.aspectRatio,
      dimensions: this.dimensions,
      safeZones: this.safeZones,
      meta: this.meta
    };
  }
}

/**
 * FinancialVisualization
 * Validates verified financial data, guarantees Truth-Anchor safety,
 * and builds visualization specs without hallucinating numbers.
 */
class FinancialVisualization {
  constructor(options = {}) {
    this.logger = options.logger || new Logger('FinancialVisualization');
  }

  /**
   * Validates that structured verified data exists and has verified evidence.
   */
  validate(verifiedInput) {
    if (!verifiedInput) {
      return { valid: false, reason: FALLBACK_REASONS.MISSING_VERIFIED_DATA };
    }

    if (typeof verifiedInput !== 'object') {
      return { valid: false, reason: FALLBACK_REASONS.INVALID_NUMERIC_DATA };
    }

    if (verifiedInput.verified !== true && verifiedInput.status !== 'verified') {
      return { valid: false, reason: FALLBACK_REASONS.UNVERIFIED_FINANCIAL_CLAIM };
    }

    return { valid: true };
  }

  /**
   * Creates a deterministic VisualizationSpec for verified financial data.
   */
  createSpec(type, verifiedInput = {}, options = {}) {
    const validation = this.validate(verifiedInput);
    if (!validation.valid) {
      this.logger.warn(`Truth-Anchor check rejected visualization [${type}]: ${validation.reason}`);
      return {
        rejected: true,
        reason: validation.reason,
        spec: null
      };
    }

    const aspectRatio = options.aspectRatio || '9:16';
    const dimensions = aspectRatio === '16:9' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
    const safeZones = aspectRatio === '16:9'
      ? { top: 108, bottom: 108, left: 192, right: 192 }
      : { top: 288, bottom: 384, left: 80, right: 160 };

    let formatted = null;
    let animation = 'CONTROLLED_ENTRANCE';

    switch (type) {
      case VISUALIZATION_TYPES.ANIMATED_METRIC: {
        formatted = NumberFormatter.formatCurrency(verifiedInput.value || verifiedInput.amount || 0);
        animation = 'NUMBER_REVEAL';
        break;
      }

      case VISUALIZATION_TYPES.GROWTH_INDICATOR: {
        formatted = NumberFormatter.formatPercentage(verifiedInput.value || verifiedInput.growthRate || 0, { explicitSign: true });
        animation = 'PERCENTAGE_REVEAL';
        break;
      }

      case VISUALIZATION_TYPES.PERCENTAGE_GAUGE: {
        formatted = NumberFormatter.formatPercentage(verifiedInput.value || verifiedInput.percentage || 0);
        animation = 'GAUGE_FILL';
        break;
      }

      case VISUALIZATION_TYPES.COMPARISON_BAR: {
        const leftVal = NumberFormatter.parseNumber(verifiedInput.left?.value || 0) || 0;
        const rightVal = NumberFormatter.parseNumber(verifiedInput.right?.value || 0) || 0;
        const total = Math.max(1, leftVal + rightVal);
        formatted = {
          left: {
            ...verifiedInput.left,
            formatted: NumberFormatter.formatCurrency(leftVal),
            ratio: Number((leftVal / total).toFixed(3))
          },
          right: {
            ...verifiedInput.right,
            formatted: NumberFormatter.formatCurrency(rightVal),
            ratio: Number((rightVal / total).toFixed(3))
          }
        };
        animation = 'BAR_GROWTH';
        break;
      }

      case VISUALIZATION_TYPES.RANKING_LIST: {
        const items = Array.isArray(verifiedInput.items) ? verifiedInput.items : [];
        formatted = items.map((item, idx) => ({
          rank: idx + 1,
          label: item.label || item.name || `Entity ${idx + 1}`,
          formatted: NumberFormatter.formatCurrency(item.value || 0)
        }));
        animation = 'RANKING_ENTRANCE';
        break;
      }

      case VISUALIZATION_TYPES.TREND_LINE: {
        const startVal = NumberFormatter.parseNumber(verifiedInput.startValue || verifiedInput.from || 0) || 0;
        const endVal = NumberFormatter.parseNumber(verifiedInput.endValue || verifiedInput.to || 0) || 0;
        const delta = endVal - startVal;
        const percentChange = startVal !== 0 ? Number(((delta / startVal) * 100).toFixed(1)) : 0;
        formatted = {
          start: NumberFormatter.formatCurrency(startVal),
          end: NumberFormatter.formatCurrency(endVal),
          delta: NumberFormatter.formatDeltaChange(delta),
          percentChange: NumberFormatter.formatPercentage(percentChange, { explicitSign: true }),
          isUpward: delta >= 0
        };
        animation = 'TREND_LINE_DRAW';
        break;
      }

      case VISUALIZATION_TYPES.NUMERICAL_CHANGE: {
        formatted = NumberFormatter.formatDeltaChange(verifiedInput.value || verifiedInput.change || 0, verifiedInput.unitType);
        animation = 'NUMBER_REVEAL';
        break;
      }

      case VISUALIZATION_TYPES.STATISTIC_CALLOUT:
      default: {
        formatted = NumberFormatter.formatCompactNumber(verifiedInput.value || verifiedInput.count || 0);
        animation = 'NUMBER_REVEAL';
        break;
      }
    }

    return {
      rejected: false,
      reason: null,
      spec: new VisualizationSpec({
        type,
        label: verifiedInput.label || verifiedInput.metric || '',
        unit: verifiedInput.unit || '',
        source: verifiedInput.source || 'Truth-Anchor Verified',
        verifiedData: verifiedInput,
        formatted,
        animation,
        aspectRatio,
        dimensions,
        safeZones,
        meta: options.meta || {}
      })
    };
  }
}

/**
 * VisualizationRenderer
 * Generates modern, high-contrast SVG graphics for YouTube Shorts safe zones.
 */
class VisualizationRenderer {
  /**
   * Generates complete SVG card layout for the given VisualizationSpec.
   */
  static renderSvgCard(spec) {
    const { width, height } = spec.dimensions;
    const safe = spec.safeZones;
    const isPortrait = spec.aspectRatio === '9:16';

    const cardX = safe.left + 20;
    const cardY = safe.top + (isPortrait ? 80 : 30);
    const cardW = width - safe.left - safe.right - 40;
    const cardH = height - cardY - safe.bottom - (isPortrait ? 80 : 40);

    const sourceTag = escapeXml(spec.source || 'Truth-Anchor Verified');
    const labelTag = escapeXml((spec.label || spec.type).toUpperCase());

    let graphicSvg = '';

    switch (spec.type) {
      case VISUALIZATION_TYPES.ANIMATED_METRIC:
      case VISUALIZATION_TYPES.NUMERICAL_CHANGE: {
        const val = escapeXml(spec.formatted?.display || '$0');
        graphicSvg = `
          <!-- Hero Financial Metric Card -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(56, 189, 248, 0.45)" stroke-width="2" />
          <g transform="translate(40, 50)">
            <rect x="0" y="0" width="180" height="34" rx="17" fill="rgba(56, 189, 248, 0.18)" stroke="#38bdf8" stroke-width="1" />
            <text x="90" y="23" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#38bdf8" text-anchor="middle">FINANCIAL METRIC</text>
            <text x="0" y="${isPortrait ? 150 : 105}" font-family="Arial, sans-serif" font-size="${isPortrait ? 88 : 60}" font-weight="900" fill="#38bdf8" letter-spacing="-2">
              ${val}
            </text>
            <text x="0" y="${isPortrait ? 215 : 145}" font-family="Arial, sans-serif" font-size="${isPortrait ? 30 : 22}" font-weight="bold" fill="#ffffff">
              ${labelTag}
            </text>
            <!-- Visual Scale Bar -->
            <rect x="0" y="${isPortrait ? 255 : 175}" width="${cardW - 80}" height="8" rx="4" fill="rgba(255, 255, 255, 0.12)" />
            <rect x="0" y="${isPortrait ? 255 : 175}" width="${(cardW - 80) * 0.78}" height="8" rx="4" fill="url(#blueGrad)" />
            <g transform="translate(0, ${isPortrait ? 295 : 205})">
              <circle cx="10" cy="10" r="9" fill="#10b981" />
              <path d="M6 10 l3 3 l6 -6" stroke="#ffffff" stroke-width="2" fill="none" />
              <text x="28" y="15" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#10b981">
                ✓ ${sourceTag}
              </text>
            </g>
          </g>
        `;
        break;
      }

      case VISUALIZATION_TYPES.GROWTH_INDICATOR:
      case VISUALIZATION_TYPES.PERCENTAGE_GAUGE: {
        const val = escapeXml(spec.formatted?.display || '+0%');
        const isPositive = spec.formatted?.direction !== 'down';
        const color = isPositive ? '#10b981' : '#f43f5e';
        const arrow = isPositive ? '▲' : '▼';
        graphicSvg = `
          <!-- Growth / Percentage Indicator Card -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.85)" stroke="${color}" stroke-width="2" />
          <g transform="translate(40, 50)">
            <rect x="0" y="0" width="190" height="34" rx="17" fill="rgba(16, 185, 129, 0.15)" stroke="${color}" stroke-width="1" />
            <text x="95" y="23" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="${color}" text-anchor="middle">GROWTH RATE</text>
            <text x="0" y="${isPortrait ? 150 : 105}" font-family="Arial, sans-serif" font-size="${isPortrait ? 88 : 60}" font-weight="900" fill="${color}" letter-spacing="-2">
              ${arrow} ${val}
            </text>
            <text x="0" y="${isPortrait ? 215 : 145}" font-family="Arial, sans-serif" font-size="${isPortrait ? 30 : 22}" font-weight="bold" fill="#ffffff">
              ${labelTag}
            </text>
            <rect x="0" y="${isPortrait ? 255 : 175}" width="${cardW - 80}" height="8" rx="4" fill="rgba(255, 255, 255, 0.12)" />
            <rect x="0" y="${isPortrait ? 255 : 175}" width="${(cardW - 80) * 0.85}" height="8" rx="4" fill="${color}" />
            <g transform="translate(0, ${isPortrait ? 295 : 205})">
              <text x="0" y="15" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#94a3b8">
                Verified: ${sourceTag}
              </text>
            </g>
          </g>
        `;
        break;
      }

      case VISUALIZATION_TYPES.COMPARISON_BAR: {
        const left = spec.formatted?.left || { label: 'Entity A', formatted: { display: '$0' }, ratio: 0.5 };
        const right = spec.formatted?.right || { label: 'Entity B', formatted: { display: '$0' }, ratio: 0.5 };
        const maxBarW = cardW - 80;

        graphicSvg = `
          <!-- Comparison Bars Card -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.88)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1.5" />
          <g transform="translate(40, 45)">
            <text x="${(cardW - 80) / 2}" y="20" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#f59e0b" text-anchor="middle">HEAD-TO-HEAD REVENUE</text>
            <!-- Left Entity Bar -->
            <g transform="translate(0, 50)">
              <text x="0" y="20" font-family="Arial, sans-serif" font-size="${isPortrait ? 24 : 18}" font-weight="bold" fill="#ffffff">${escapeXml(left.label)}</text>
              <text x="${maxBarW}" y="20" font-family="Arial, sans-serif" font-size="${isPortrait ? 24 : 18}" font-weight="bold" fill="#38bdf8" text-anchor="end">${escapeXml(left.formatted.display)}</text>
              <rect x="0" y="32" width="${maxBarW}" height="24" rx="12" fill="rgba(255, 255, 255, 0.08)" />
              <rect x="0" y="32" width="${Math.max(24, maxBarW * left.ratio)}" height="24" rx="12" fill="url(#blueGrad)" />
            </g>
            <!-- Right Entity Bar -->
            <g transform="translate(0, ${isPortrait ? 150 : 115})">
              <text x="0" y="20" font-family="Arial, sans-serif" font-size="${isPortrait ? 24 : 18}" font-weight="bold" fill="#ffffff">${escapeXml(right.label)}</text>
              <text x="${maxBarW}" y="20" font-family="Arial, sans-serif" font-size="${isPortrait ? 24 : 18}" font-weight="bold" fill="#a855f7" text-anchor="end">${escapeXml(right.formatted.display)}</text>
              <rect x="0" y="32" width="${maxBarW}" height="24" rx="12" fill="rgba(255, 255, 255, 0.08)" />
              <rect x="0" y="32" width="${Math.max(24, maxBarW * right.ratio)}" height="24" rx="12" fill="url(#purpleGrad)" />
            </g>
            <!-- Verified Source Badge -->
            <g transform="translate(0, ${isPortrait ? 250 : 190})">
              <text x="0" y="15" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#94a3b8">
                Source: ${sourceTag}
              </text>
            </g>
          </g>
        `;
        break;
      }

      case VISUALIZATION_TYPES.RANKING_LIST: {
        const items = Array.isArray(spec.formatted) ? spec.formatted : [];
        const maxListW = cardW - 80;
        const rowH = isPortrait ? 60 : 45;
        const rowsSvg = items.slice(0, 3).map((item, idx) => {
          const medalColor = idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : '#b45309';
          return `
            <g transform="translate(0, ${idx * (rowH + 12)})">
              <rect x="0" y="0" width="${maxListW}" height="${rowH}" rx="12" fill="rgba(255, 255, 255, 0.06)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1" />
              <circle cx="28" cy="${rowH / 2}" r="16" fill="${medalColor}" />
              <text x="28" y="${rowH / 2 + 5}" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="#0f172a" text-anchor="middle">#${item.rank}</text>
              <text x="56" y="${rowH / 2 + 6}" font-family="Arial, sans-serif" font-size="${isPortrait ? 20 : 16}" font-weight="bold" fill="#ffffff">${escapeXml(item.label)}</text>
              <text x="${maxListW - 20}" y="${rowH / 2 + 6}" font-family="Arial, sans-serif" font-size="${isPortrait ? 20 : 16}" font-weight="bold" fill="#38bdf8" text-anchor="end">${escapeXml(item.formatted?.display || '')}</text>
            </g>
          `;
        }).join('');

        graphicSvg = `
          <!-- Ranking Leaderboard Card -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.88)" stroke="rgba(245, 158, 11, 0.4)" stroke-width="2" />
          <g transform="translate(40, 45)">
            <rect x="0" y="0" width="170" height="30" rx="15" fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" stroke-width="1" />
            <text x="85" y="20" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#f59e0b" text-anchor="middle">LEADERBOARD</text>
            <text x="0" y="${isPortrait ? 70 : 50}" font-family="Arial, sans-serif" font-size="${isPortrait ? 28 : 20}" font-weight="bold" fill="#ffffff">${labelTag}</text>
            <g transform="translate(0, ${isPortrait ? 90 : 65})">
              ${rowsSvg}
            </g>
          </g>
        `;
        break;
      }

      case VISUALIZATION_TYPES.TREND_LINE: {
        const trend = spec.formatted || {};
        const isUpward = trend.isUpward !== false;
        const trendColor = isUpward ? '#10b981' : '#f43f5e';
        const chartW = cardW - 80;
        const chartH = isPortrait ? 130 : 80;
        const startY = isUpward ? chartH - 10 : 10;
        const endY = isUpward ? 10 : chartH - 10;

        graphicSvg = `
          <!-- Trend Trajectory Chart Card -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.88)" stroke="${trendColor}" stroke-width="2" />
          <g transform="translate(40, 45)">
            <rect x="0" y="0" width="160" height="30" rx="15" fill="rgba(255, 255, 255, 0.1)" />
            <text x="80" y="20" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#ffffff" text-anchor="middle">TREND ANALYSIS</text>
            <text x="0" y="${isPortrait ? 75 : 55}" font-family="Arial, sans-serif" font-size="${isPortrait ? 30 : 22}" font-weight="bold" fill="#ffffff">${labelTag}</text>
            <!-- SVG Trend Sparkline -->
            <g transform="translate(0, ${isPortrait ? 100 : 70})">
              <!-- Grid Backdrop -->
              <rect x="0" y="0" width="${chartW}" height="${chartH}" rx="8" fill="rgba(255, 255, 255, 0.04)" />
              <!-- Trajectory Line -->
              <path d="M 20 ${startY} C ${chartW * 0.4} ${startY}, ${chartW * 0.6} ${endY}, ${chartW - 20} ${endY}" fill="none" stroke="${trendColor}" stroke-width="4" stroke-linecap="round" />
              <!-- Points -->
              <circle cx="20" cy="${startY}" r="6" fill="${trendColor}" />
              <circle cx="${chartW - 20}" cy="${endY}" r="7" fill="#ffffff" stroke="${trendColor}" stroke-width="3" />
            </g>
            <!-- Values Display -->
            <g transform="translate(0, ${isPortrait ? 260 : 175})">
              <text x="0" y="0" font-family="Arial, sans-serif" font-size="16" fill="#94a3b8">From: <tspan font-weight="bold" fill="#ffffff">${escapeXml(trend.start?.display || '$0')}</tspan></text>
              <text x="0" y="30" font-family="Arial, sans-serif" font-size="18" fill="#94a3b8">To: <tspan font-weight="bold" fill="${trendColor}">${escapeXml(trend.end?.display || '$0')}</tspan> (${escapeXml(trend.percentChange?.display || '')})</text>
            </g>
          </g>
        `;
        break;
      }

      case VISUALIZATION_TYPES.STATISTIC_CALLOUT:
      default: {
        const val = escapeXml(spec.formatted?.display || '0');
        const unit = escapeXml(spec.unit || 'UNITS');
        graphicSvg = `
          <!-- Business Statistic Callout Card -->
          <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="24" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(245, 158, 11, 0.5)" stroke-width="2" />
          <g transform="translate(40, 50)">
            <rect x="0" y="0" width="180" height="34" rx="17" fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" stroke-width="1" />
            <text x="90" y="23" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#f59e0b" text-anchor="middle">BUSINESS STAT</text>
            <text x="0" y="${isPortrait ? 150 : 100}" font-family="Arial, sans-serif" font-size="${isPortrait ? 84 : 56}" font-weight="900" fill="#ffffff">
              ${val} <tspan font-size="${isPortrait ? 36 : 28}" fill="#f59e0b">${unit.toUpperCase()}</tspan>
            </text>
            <text x="0" y="${isPortrait ? 215 : 145}" font-family="Arial, sans-serif" font-size="${isPortrait ? 26 : 20}" font-weight="500" fill="#cbd5e1">
              ${escapeXml(spec.verifiedData?.context || spec.label)}
            </text>
            <g transform="translate(0, ${isPortrait ? 275 : 185})">
              <text x="0" y="15" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#94a3b8">
                Verified: ${sourceTag}
              </text>
            </g>
          </g>
        `;
        break;
      }
    }

    return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0f1d" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e1b4b" />
    </linearGradient>
    <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <linearGradient id="purpleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7e22ce" />
      <stop offset="100%" stop-color="#c084fc" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.65" />
    </filter>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
  <circle cx="${width * 0.85}" cy="${height * 0.15}" r="${width * 0.35}" fill="#38bdf8" opacity="0.08" />
  <circle cx="${width * 0.15}" cy="${height * 0.85}" r="${width * 0.35}" fill="#a855f7" opacity="0.08" />

  <g transform="translate(${cardX}, ${cardY})" filter="url(#shadow)">
    ${graphicSvg}
  </g>
</svg>
    `.trim();
  }
}

module.exports = {
  VISUALIZATION_TYPES,
  FALLBACK_REASONS,
  NumberFormatter,
  VisualizationSpec,
  FinancialVisualization,
  VisualizationRenderer
};
