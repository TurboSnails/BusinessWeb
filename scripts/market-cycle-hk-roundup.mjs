// Hang Seng TECH Index official month-end PE from the Hang Seng Indexes "Monthly Roundup" PDF.
// The per-index historical_pe XLSX for HSTECH (…/historical_pe/en_hk/hstech/hstech.xlsx) has been withdrawn:
// since 2026-10 it answers 302 → /errors/404/ in every language folder, while hsi/hscei still exist.
// The Monthly Roundup is the same publisher's month-end "PE Ratio (Times)" column and is exactly the source of
// the audited 60-month archive (public/data/market-cycle-hk-pe-history.json); the archived 2026-09 value 28.23
// equals both the roundup and the former XLSX, so the definition is unchanged (latest annual results, not TTM).
export const ROUNDUP_BASE = 'https://www.hsi.com.hk/content/dam/wpb/hsil/en_hk/monthly_roundup/content/'
export const ROUNDUP_URL = /^https:\/\/www\.hsi\.com\.hk\/content\/dam\/wpb\/hsil\/en_hk\/monthly_roundup\/content\/(\d{4})(\d{2})(\d{2})T(\d{6})\.pdf$/
// Publication timestamps seen in the archive: mostly T000000, occasionally intraday.
const TIMES = ['000000', '160000', '170000', '150000', '113000', '163000']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
const pad = n => String(n).padStart(2, '0')
const monthEnd = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

/** Candidate PDF URLs for the roundup published in calendar month `pubMonth` (YYYY-MM): first 7 days, never after today. */
export function roundupCandidates(pubMonth, today) {
  if (!/^\d{4}-\d{2}$/.test(pubMonth) || !isDate(today)) throw new Error('月报候选月份/日期无效')
  const days = []
  for (let d = 1; d <= 7; d++) { const date = `${pubMonth}-${pad(d)}`; if (date <= today) days.push(date.replaceAll('-', '')) }
  // All days at T000000 first (the common case), then the rarer intraday stamps.
  return TIMES.flatMap(t => days.map(d => `${ROUNDUP_BASE}${d}T${t}.pdf`))
}

const ROW = name => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(-?[\\d.,]+%)\\s+(-?[\\d.,]+%)\\s+(-?[\\d.,]+%)\\s+(-?[\\d.,]+%)\\s+(-?\\d[\\d,]*\\.\\d+|-)\\s+(-?[\\d.]+%|-)\\s*$`)

/**
 * pages: per-page text of one Monthly Roundup. Returns the report's "As at" date and HSI/HSTECH PE.
 * Rejects anything that is not the main roundup layout (e.g. the Biotech Monthly in the same folder).
 */
export function parseRoundup(pages, url) {
  const m = ROUNDUP_URL.exec(String(url))
  if (!m) throw new Error('月报URL不在恒生官网白名单')
  if (!Array.isArray(pages) || !pages.length || pages.some(p => typeof p !== 'string')) throw new Error('月报文本无效')
  const pubYear = Number(m[1]), pubMonth = Number(m[2])
  const asAt = [...pages.join('\n').matchAll(/\bAs at (\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December)\b/g)]
  if (!asAt.length) throw new Error('月报缺少As at日期')
  const day = Number(asAt[0][1]), month = MONTHS.indexOf(asAt[0][2]) + 1
  if (asAt.some(a => Number(a[1]) !== day || a[2] !== asAt[0][2])) throw new Error('月报As at日期不一致')
  // Report for month M is published early in M+1; a December report is published in January of the next year.
  const year = month < pubMonth ? pubYear : month === 12 && pubMonth === 1 ? pubYear - 1 : NaN
  const date = `${year}-${pad(month)}-${pad(day)}`
  if (!isDate(date)) throw new Error(`月报日期无效或与发布时间不符：${date}`)
  if ((Date.parse(monthEnd(year, month)) - Date.parse(date)) / 864e5 > 6) throw new Error(`月报日期不在月末最后7天：${date}`)
  const read = name => {
    const lines = pages.flatMap(p => p.split(/\r?\n/)).map(l => l.trim()).filter(l => ROW(name).test(l))
    if (lines.length !== 1) throw new Error(`月报"${name}"行缺失或重复(${lines.length})`)
    const raw = ROW(name).exec(lines[0])[5]
    if (raw === '-') throw new Error(`月报"${name}"PE为空`)
    const pe = Number(raw.replaceAll(',', ''))
    if (!Number.isFinite(pe) || pe === 0 || Math.abs(pe) > 10000) throw new Error(`月报"${name}"PE无效`)
    return pe
  }
  const text = pages.join('\n')
  if (!/PE Ratio\s*\(Times\)/.test(text) || !text.includes('Hang Seng TECH Index and its related indexes')) throw new Error('月报不是含PE Ratio (Times)列的主报告')
  return { date, hsi: read('Hang Seng Index'), hstech: read('Hang Seng TECH Index'), url }
}

async function tryRoundup(ctx, url) {
  let buffer
  try { buffer = await ctx.get(url, { as: 'buffer', timeoutMs: 30000, redirect: 'manual' }) } catch { return null } // 302 → /errors/404/ means absent
  if (!Buffer.isBuffer(buffer) || buffer.length < 1000 || buffer.length > 10e6 || buffer.subarray(0, 4).toString() !== '%PDF') return null
  try { return parseRoundup(await ctx.parsePdf(buffer), url) } catch (e) { return { error: `${url.split('/').pop()}: ${e instanceof Error ? e.message : String(e)}` } }
}

/**
 * Finds the newest Monthly Roundup after `latestDate` (YYYY-MM-DD of the newest month already held).
 * Falls back to re-reading `knownUrl` (the latest roundup already cited) so a not-yet-published month is not a failure.
 * Returns { rows: [{date, hsi, hstech, url}], errors }.
 */
export async function collectLatestRoundup(ctx, { latestDate, knownUrl } = {}) {
  const today = ctx.now.slice(0, 10), errors = [], rows = []
  const current = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1
  // Next publication month = month after the newest held month + 1; without history, look at this and last month.
  const held = isDate(latestDate) ? Number(latestDate.slice(0, 4)) * 12 + Number(latestDate.slice(5, 7)) - 1 : current - 2
  for (let pub = Math.max(held + 2, current - 1); pub <= current; pub++) {
    const pubMonth = `${Math.floor(pub / 12)}-${pad(pub % 12 + 1)}`
    let found = null
    for (const url of roundupCandidates(pubMonth, today)) {
      if (ctx.signal?.aborted) break
      const r = await tryRoundup(ctx, url)
      if (r?.error) errors.push(r.error)
      else if (r && r.date.slice(0, 7) === `${Math.floor((pub - 1) / 12)}-${pad((pub - 1) % 12 + 1)}`) { found = r; break }
    }
    if (found) rows.push(found)
  }
  if (!rows.length && knownUrl && ROUNDUP_URL.test(knownUrl)) {
    const r = await tryRoundup(ctx, knownUrl)
    if (r && !r.error) rows.push(r)
    else if (r?.error) errors.push(r.error)
  }
  return { rows, errors }
}
