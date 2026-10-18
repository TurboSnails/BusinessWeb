// Node 24 strips types. Share the deterministic implementation with the browser.
import { evaluate, safeUrl, validDate } from '../src/features/market-cycle/engine.ts'
import { automaticRows, factUsable, parseAutomaticSnapshot, parseBreadthSnapshot, shadowState } from '../src/features/market-cycle/automation.ts'
import { createHash } from 'node:crypto'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export function parseMacroInput(body) {
  if (!body || typeof body.series !== 'object' || !body.series || Array.isArray(body.series)) throw new Error('Missing macro series')
  for (const s of Object.values(body.series)) {
    if (!s || typeof s.latest?.date !== 'string' || !validDate(s.latest.date) || !Number.isFinite(s.latest?.value) || !Array.isArray(s.history)
      || s.history.some(p => !Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'string' || !validDate(p[0]) || !Number.isFinite(p[1]))) throw new Error('Invalid macro series')
  }
  return body
}
export function parsePriceInput(body) {
  if (body?.schemaVersion !== 1 || !body.markets || typeof body.markets !== 'object' || !Array.isArray(body.warnings)) throw new Error('Invalid price snapshot')
  for (const market of ['csi300', 'hsi', 'hstech']) {
    const price = body.markets[market]
    if (price && (!Array.isArray(price.week) || !Array.isArray(price.month) || !safeUrl(price.source) || !Number.isFinite(Date.parse(price.fetchedAt))
      || [...price.week, ...price.month].some(b => !b || typeof b.date !== 'string' || !validDate(b.date) || !Number.isFinite(b.close) || b.close <= 0 || !Number.isFinite(b.volume) || b.volume < 0))) throw new Error('Invalid market price')
  }
  return body
}

export function weekEnding(asOf) {
  const day = new Date(`${asOf}T00:00:00Z`)
  if (!Number.isFinite(day.getTime())) throw new Error('Invalid decision date')
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 1) % 7)
  return day.toISOString().slice(0, 10)
}
export function archivedShadow(rows, previousMarket) {
  const technicalDate = list => list?.find(r => r.id === 'technical' && r.available)?.date?.split(' / ')[0]
  const date = technicalDate(rows), previousDate = technicalDate(previousMarket?.rows)
  const previous = previousMarket?.shadow
  const barWeek = d => {
    const day = new Date(`${d}T00:00:00Z`)
    return day.getTime() + (6 - day.getUTCDay() + 7) % 7 * 86400000
  }
  // Compare calendar weeks, not raw closing dates: a holiday can end one week on Thursday.
  const gap = date && previousDate ? (barWeek(date) - barWeek(previousDate)) / 86400000 : NaN
  const state = shadowState(rows, gap === 7 ? previous : undefined)
  // A new job/week is not a new market observation. Failed price refreshes cannot confirm a trend twice.
  if (gap === 0 && previous && rows.find(r => r.id === 'technical')?.signal !== 'risk') {
    state.confirmations = previous.confirmations
    state.weakWeeks = previous.weakWeeks
    state.trendState = previous.trendState
  }
  return state
}
export function buildReport(inputs, previous = null, now = new Date().toISOString(), issues = []) {
  const asOf = now.slice(0, 10), week = weekEnding(asOf)
  const history = (previous?.schemaVersion === 1 && Array.isArray(previous.records) ? previous.records : [])
    .filter(r => r && typeof r.weekEnding === 'string' && r.weekEnding < week && validDate(r.weekEnding) && r.ruleVersion === 'cycle-shadow-v2' && r.markets)
    .sort((a, b) => b.weekEnding.localeCompare(a.weekEnding)).slice(0, 51)
  // Re-running within the same week replaces that week's snapshot; confirmations only advance across weeks.
  const last = history.find(r => (Date.parse(week) - Date.parse(r.weekEnding)) / 86400000 === 7)
  const record = { weekEnding: week, decisionAt: now, ruleVersion: 'cycle-shadow-v2',
    inputHash: createHash('sha256').update(JSON.stringify(inputs)).digest('hex'), markets: {} }
  for (const market of ['csi300', 'hsi', 'hstech']) {
    const price = inputs.price?.markets?.[market]
    const base = evaluate(market, price, {}, inputs.cn, inputs.us, asOf)
    const automatic = automaticRows(market, inputs.automatic, inputs.breadth, asOf, base.newHigh)
    const result = evaluate(market, price, {}, inputs.cn, inputs.us, asOf, automatic)
    record.markets[market] = { legacyState: result.summary.state, shadow: archivedShadow(result.rows, last?.markets?.[market]), rows: result.rows }
  }
  const qualityIssues = [...issues, ...(inputs.price?.warnings ?? []), ...(inputs.automatic?.issues ?? []), ...(inputs.breadth?.issues ?? [])]
  const latestFacts = new Map()
  for (const fact of inputs.automatic?.facts ?? []) {
    const key = `${fact.market}/${fact.metricId}`, old = latestFacts.get(key)
    if (!old || old.observationDate < fact.observationDate) latestFacts.set(key, fact)
  }
  for (const [key, fact] of latestFacts) if (!factUsable(fact, asOf)) qualityIssues.push(`${key}: 最新观测过期或尚不可得（${fact.observationDate}），不计票`)
  return { schemaVersion: 1, generatedAt: now, issues: [...new Set(qualityIssues)], records: [record, ...history] }
}
export async function writeReport(extraIssues = []) {
  const root = new URL('../public/data/', import.meta.url), issues = [...extraIssues]
  async function load(file, parse = x => x) {
    try { return parse(JSON.parse(await readFile(new URL(file, root), 'utf8'))) }
    catch { issues.push(`${file}: 未能读取合格输入，保留缺失`); return null }
  }
  const inputs = { price: await load('market-cycle.json', parsePriceInput), automatic: await load('market-cycle-auto.json', parseAutomaticSnapshot),
    breadth: await load('market-cycle-breadth.json', parseBreadthSnapshot), cn: await load('macro-cn.json', parseMacroInput), us: await load('macro-us.json', parseMacroInput) }
  let previous = null
  try { previous = JSON.parse(await readFile(new URL('market-cycle-report.json', root), 'utf8')) } catch { /* first archive */ }
  const report = buildReport(inputs, previous, new Date().toISOString(), issues)
  const target = fileURLToPath(new URL('market-cycle-report.json', root))
  await writeFile(`${target}.tmp`, `${JSON.stringify(report)}\n`)
  await rename(`${target}.tmp`, target)
  console.log(`周期周报：${report.records[0].weekEnding}，${report.records.length}周记录，${report.issues.length}项质量问题`)
  return report
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await writeReport()
