// Daily five-year HSI PE history from Enniu. Its values match Hang Seng's monthly PE
// observations over several dates; the vendor's exact weighting/earnings formula is not documented.
// The index series stopped updating on 2026-10-30; keep emitting the last window as a frozen
// reference (official monthly PE percentile is the voting source). Do not delete historical facts.
export const HSI_PE_HISTORY_URL = 'https://eniu.com/chart/peindex/hkhsi/t/60'
export const ENIU_HSI_PE_STOPPED_ON = '2026-10-30'

const dateOK = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s

export function parseHsiPeHistory(body, today) {
  if (!body || !Array.isArray(body.date) || !Array.isArray(body.pe) || body.date.length !== body.pe.length) throw new Error('恒指历史PE日期/value数组无效')
  const rows = []
  let previous = ''
  for (let i = 0; i < body.date.length; i++) {
    const date = body.date[i], pe = Number(body.pe[i])
    if (!dateOK(date) || date <= previous || date > today || !Number.isFinite(pe) || pe <= 0 || pe > 200) throw new Error('恒指历史PE行无效、乱序、重复或未来')
    previous = date
    rows.push({ date, pe })
  }
  if (!rows.length) throw new Error('恒指历史PE无有效行')
  return rows
}

function fiveYearStart(date) {
  const year = Number(date.slice(0, 4)) - 5, month = Number(date.slice(5, 7)), day = Number(date.slice(8, 10))
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay))).toISOString().slice(0, 10)
}

export function hsiPe5yPercentile(rows) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error('恒指PE历史点数不足')
  const current = rows.at(-1), start = fiveYearStart(current.date)
  const window = rows.filter(r => r.date >= start && r.date <= current.date)
  if (window.length < 1000 || Date.parse(window[0]?.date ?? '') - Date.parse(start) > 21 * 864e5) throw new Error(`恒指PE历史不足5年：${window[0]?.date ?? '无'}起共${window.length}点`)
  // Mid-rank percentile matches the source page's published 5y value, including tied observations.
  const below = window.filter(r => r.pe < current.pe).length
  const equal = window.filter(r => r.pe === current.pe).length
  const percentile = (below + equal / 2) / window.length * 100
  return { value: percentile, observationDate: current.date, windowStart: window[0].date, samples: window.length, currentPe: current.pe }
}

/** True when the Enniu index series is the frozen post-stop snapshot (not a live daily feed). */
export function isEniuHsiPeStopped(observationDate, today) {
  return dateOK(observationDate) && dateOK(today) && today > ENIU_HSI_PE_STOPPED_ON && observationDate <= ENIU_HSI_PE_STOPPED_ON
}

export async function collectHsiPeHistory(ctx) {
  try {
    const today = ctx.now.slice(0, 10)
    const rows = parseHsiPeHistory(await ctx.get(HSI_PE_HISTORY_URL), today)
    const result = hsiPe5yPercentile(rows)
    const age = (Date.parse(today) - Date.parse(result.observationDate)) / 864e5
    const stopped = isEniuHsiPeStopped(result.observationDate, today)
    if (!stopped && age > 14) throw new Error(`恒指历史PE最新观测${result.observationDate}超过14天`)
    const stopNote = stopped
      ? `来源已停更（截至 ${ENIU_HSI_PE_STOPPED_ON}）；本序列仅作第三方日频参考，估值计票使用恒生官方月末PE分位。`
      : ''
    return [{ metricId: 'pe_history_5y_percentile', market: 'hsi', value: Number(result.value.toFixed(1)), observationDate: result.observationDate,
      source: HSI_PE_HISTORY_URL, unit: '%', kind: 'observed', frequency: 'daily',
      description: `${stopNote}第三方恒指历史PE序列近5年中位秩分位；${result.windowStart}~${result.observationDate}共${result.samples}个日点，当前同源PE ${result.currentPe.toFixed(2)}倍，分位${result.value.toFixed(1)}%。与恒生官方月末PE多期吻合（2025-10-31 13.17、2026-09-30 13.79），2026-10-16与官方日值13.53接近；网站未公开PE加权与盈利口径，不与官方PE/TTM拼接，不单独计估值票。`.trim() }]
  } catch (e) {
    ctx.issue(`hsi-pe-history: ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}
