import { MA_OPTIONS, type MaPeriod } from './indicators'

export const CHART_SETTINGS_KEY = 'stock-lookup.chart.settings'

export interface ChartSettings {
  /** 启用的均线周期 */
  ma: MaPeriod[]
  /** 价位成交量 */
  volumeProfile: boolean
  /** MACD 副图 */
  macd: boolean
  /** 成交量副图 */
  volume: boolean
  /** 常见指标（金叉死叉 + 成交量突增），默认关 */
  commonSignals: boolean
  /** 新闻打点（工具栏另有即时开关；此字段作为默认） */
  newsMarkers: boolean
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  ma: [5, 10, 20, 60],
  volumeProfile: false,
  macd: true,
  volume: true,
  commonSignals: false,
  newsMarkers: true,
}

function isMaPeriod(n: unknown): n is MaPeriod {
  return typeof n === 'number' && (MA_OPTIONS as readonly number[]).includes(n)
}

export function normalizeSettings(raw: unknown): ChartSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CHART_SETTINGS, ma: [...DEFAULT_CHART_SETTINGS.ma] }
  const o = raw as Record<string, unknown>
  const ma = Array.isArray(o.ma) ? o.ma.filter(isMaPeriod) : [...DEFAULT_CHART_SETTINGS.ma]
  return {
    ma: ma.length ? [...new Set(ma)].sort((a, b) => a - b) as MaPeriod[] : [...DEFAULT_CHART_SETTINGS.ma],
    volumeProfile: typeof o.volumeProfile === 'boolean' ? o.volumeProfile : DEFAULT_CHART_SETTINGS.volumeProfile,
    macd: typeof o.macd === 'boolean' ? o.macd : DEFAULT_CHART_SETTINGS.macd,
    volume: typeof o.volume === 'boolean' ? o.volume : DEFAULT_CHART_SETTINGS.volume,
    commonSignals: typeof o.commonSignals === 'boolean' ? o.commonSignals : DEFAULT_CHART_SETTINGS.commonSignals,
    newsMarkers: typeof o.newsMarkers === 'boolean' ? o.newsMarkers : DEFAULT_CHART_SETTINGS.newsMarkers,
  }
}

export function loadChartSettings(): ChartSettings {
  try {
    const raw = localStorage.getItem(CHART_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_CHART_SETTINGS, ma: [...DEFAULT_CHART_SETTINGS.ma] }
    return normalizeSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_CHART_SETTINGS, ma: [...DEFAULT_CHART_SETTINGS.ma] }
  }
}

export function saveChartSettings(settings: ChartSettings): void {
  try {
    localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* quota / private mode */
  }
}
