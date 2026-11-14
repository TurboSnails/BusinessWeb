// 数据新鲜度巡检：读关键数据文件里的「真实观测日期」，按市场交易日与各数据组阈值判断是否过期，
// 并汇总各定时工作流的最近结论与排程延迟。规则见 docs/data-maintenance.md「如何判断过期」：
// 文件修改时间、提交时间、generatedAt 都不算观测日期，这里一律不用。
//
// 用法：node scripts/data-freshness-check.mjs [--json out.json] [--md out.md] [--now ISO] [--root DIR] [--no-gh]
// 未给 --json/--md 时把 Markdown 打到 stdout。退出码恒为 0；是否告警看 JSON 的 alarm 字段。
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  daysBetween, latestReadySession, recentTradingDays, tradingDaysBetween, addDays,
} from './lib/trading-calendar.mjs'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * 各数据组阈值（滞后超过 max 即过期）。trading = 该市场交易日数（截至应已落地的最近交易日），days = 自然日。
 * - dailyQuote：公司行情、估值覆盖层、林奇 PE、指数、ETF 技术面、DCF 现价——每个工作日自动刷新，
 *   允许 GitHub 排程迟到 7–9 小时或偶发一次失败，超过 3 个交易日才告警。
 * - dailyAnalysis：每日分析只在当天收盘后落盘，少一个交易日就告警（2026-11-12 漏档即属此类），近 10 个交易日缺档也告警。
 * - cycleDaily：周期页日频事实（融资、成交额、国债、ERP 等），部分官方源 T+1～T+2 才发布，放宽到 5 个交易日。
 * - weekly：周度序列（Forward PE、换手率 52 周比、周期周报、信号台账、评级复盘、趋势规则回测），10 个自然日。
 * - monthly：月末观测（恒生官方 PE 月报，次月初发布），45 个自然日。
 * - fredWeeklyRelease：FRED DEXHKUS（美联储 H.10）是日频观测但每周一才批量发布到上周五，最新观测正常就滞后 3–10 天
 *   （周一假日顺延一天），按 12 个自然日判断，不当作日频 5 个交易日。
 * - breadth：成分 MA200 宽度分批轮询，沿用生产脚本自身的 14 天口径（market-cycle-breadth.mjs）。
 * - fpe：手动/月度录入的指数 Forward PE（日期标在月初），62 天。
 * - macro：逐指标阈值直接调用 src/features/macro/quality.ts。
 * - 季报类（国家队持仓）：按法定披露截止日 + 14 天宽限推算「应已有的最新报告期」。
 * - staleShare：同一文件里单条记录过期/缺日期的占比超过 10% 也算过期（批量采集失败但少数成功的情形）；低于此值只提示。
 */
export const THRESHOLDS = {
  dailyQuote: { unit: 'trading', max: 3 },
  dailyAnalysis: { unit: 'trading', max: 0 },
  dailyAnalysisWindow: 10,
  cycleDaily: { unit: 'trading', max: 5 },
  weekly: { unit: 'days', max: 10 },
  monthly: { unit: 'days', max: 45 },
  fredWeeklyRelease: { unit: 'days', max: 12 },
  breadth: { unit: 'days', max: 14 },
  cycleReport: { unit: 'days', max: 8 },
  fpe: { unit: 'days', max: 62 },
  earningsSource: { unit: 'days', max: 3 },
  disclosureSlackDays: 14,
  staleShare: 0.1,
}

/**
 * 已知「源本身没有新数据」的情形：命中后标为「已知停更」，不触发告警。
 * - id 支持末尾 * 前缀匹配；
 * - observedDate：只在观测日仍等于该日期时生效（序列恢复后又停住会重新告警）；
 * - until：到期后自动失效，逼着人重新核实。
 */
export const ALLOWLIST = [
  { id: 'spread.us.forwardPe', observedDate: '2026-08-05', until: '2027-06-30', reason: 'History of Market 的标普/纳指 Forward PE 周度序列自 2026-08-05 起停更（market-cycle-report 同样记为不计票），等待替代源' },
  { id: 'cycle.fact.spx.fwd_pe*', observedDate: '2026-08-05', until: '2027-06-30', reason: '同上：History of Market Forward PE 停更于 2026-08-05' },
  { id: 'cycle.fact.ndx.fwd_pe*', observedDate: '2026-08-05', until: '2027-06-30', reason: '同上：History of Market Forward PE 停更于 2026-08-05' },
  { id: 'cycle.fact.hsi.pe_history_5y_percentile', observedDate: '2026-10-30', until: '2027-03-31', reason: '亿牛网恒指日频PE序列（eniu.com/chart/peindex/hkhsi）自 2026-10-30 起停更（其个股序列仍日更）；无同口径替代源（蛋卷HKHSI为周频且PE约10.8，与恒生官方口径不符）。该指标仅作参考不计票，估值维度用恒生官方月末PE分位' },
  { id: 'macro.us.equityShare', until: '2026-12-31', reason: '美联储 Z.1 资金流量表季度发布（日期标季初），2026Q3 版预计 12 月中旬发布' },
  { id: 'macro.us.buffett', until: '2026-12-31', reason: '分子取 Z.1 季度数据，随 Z.1 发布节奏更新' },
  { id: 'macro.us.debtService', until: '2026-12-31', reason: '美联储家庭偿债比季度发布，滞后约一个季度' },
  { id: 'macro.us.ccDelinq', until: '2026-12-31', reason: '美联储信用卡拖欠率季度发布，滞后约一个季度' },
  { id: 'macro.us.saving', until: '2026-12-15', reason: 'BEA 个人储蓄率按统计月月初标日期、次月末发布，月中观测龄常落在 60–90 天，略超 70 天阈值；统计月份未变不补造' },
  { id: 'nationalTeam.etfHolders', observedDate: '2025-12-31', until: '2027-04-30', reason: '实名持有人榜单源最新仍为 2025-12-31；2026H1 原件只披露匿名结构（etf.json holderFreshnessNote）' },
]

const ALARM_STATUSES = new Set(['stale', 'error'])
const ISO_DATE = /(\d{4}-\d{2}-\d{2})/
const firstDate = text => (typeof text === 'string' ? text.match(ISO_DATE)?.[1] : undefined) ?? null
const maxDate = dates => dates.filter(Boolean).sort().at(-1) ?? null
const calendarOf = market => (market === 'adr' || market === 'ndx' ? 'us' : market)

// ---------------------------------------------------------------- judging

/** 计算单个观测日期的滞后与状态 */
export function judgeDate({ observed, market = 'cn', unit, max, now, expected }) {
  const today = now.toISOString().slice(0, 10)
  if (!observed || !/^\d{4}-\d{2}-\d{2}$/.test(observed)) return { observed: observed ?? null, status: 'error', detail: '缺少有效观测日期' }
  if (unit === 'trading') {
    const exp = expected ?? latestReadySession(calendarOf(market), now)
    if (observed > addDays(exp, 3)) return { observed, expected: exp, status: 'error', detail: `观测日 ${observed} 晚于应到交易日，日期疑似错误` }
    const lag = tradingDaysBetween(calendarOf(market), observed, exp)
    return { observed, expected: exp, lag, unit, max, status: lag > max ? 'stale' : 'ok' }
  }
  const lag = daysBetween(observed, expected ?? today)
  if (lag < -3) return { observed, expected: expected ?? today, status: 'error', detail: `观测日 ${observed} 在未来，日期疑似错误` }
  return { observed, expected: expected ?? today, lag: Math.max(0, lag), unit, max, status: lag > max ? 'stale' : 'ok' }
}

function item(base, judged, extra = {}) {
  return { ...base, ...judged, ...extra, detail: [judged.detail, extra.detail].filter(Boolean).join('；') || undefined }
}

/** 一组记录：最新日期决定「任务是否还在跑」，单条过期占比决定「是否批量失败」 */
export function judgeCollection({ base, entries, market, threshold, now, countMissing = true, note }) {
  const total = entries.length
  if (!total) return item(base, { status: 'error', detail: '文件里没有记录' })
  const newest = maxDate(entries.map(e => e.date))
  const head = judgeDate({ observed: newest, market, ...threshold, now })
  const staleKeys = []
  let missing = 0
  for (const e of entries) {
    if (!e.date) { if (countMissing) missing++; continue }
    const j = judgeDate({ observed: e.date, market, ...threshold, now, expected: head.expected })
    if (j.status !== 'ok') staleKeys.push(`${e.key}(${e.date})`)
  }
  const bad = staleKeys.length + missing
  const share = bad / total
  const parts = [`${total} 条`]
  if (staleKeys.length) parts.push(`${staleKeys.length} 条过期：${staleKeys.slice(0, 8).join('、')}${staleKeys.length > 8 ? ' 等' : ''}`)
  if (missing) parts.push(`${missing} 条缺日期`)
  if (note) parts.push(note)
  let status = head.status
  if (status === 'ok' && share > THRESHOLDS.staleShare) status = 'stale'
  else if (status === 'ok' && bad) status = 'warn'
  return item(base, { ...head, status }, { detail: parts.join('；'), total, staleCount: staleKeys.length, missing })
}

export function matchAllow(entry, it, today) {
  const idOk = entry.id.endsWith('*') ? it.id.startsWith(entry.id.slice(0, -1)) : it.id === entry.id
  if (!idOk) return false
  if (entry.until && today > entry.until) return false
  if (entry.observedDate && it.observed !== entry.observedDate) return false
  return true
}

export function applyAllowlist(items, allowlist, now) {
  const today = now.toISOString().slice(0, 10)
  return items.map(it => {
    if (it.status !== 'stale') return it
    const hit = allowlist.find(a => matchAllow(a, it, today))
    return hit ? { ...it, status: 'known', ackReason: hit.reason, ackUntil: hit.until } : it
  })
}

// ---------------------------------------------------------------- data checks

const readJson = (root, rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'))

/** 包一层：读文件或解析失败时给出 error 条目，不让一处坏文件拖垮整份报告 */
function guarded(group, file, fn) {
  try { return fn() } catch (error) {
    return [{ id: `${group}.load`, group, label: `${file} 读取`, file, status: 'error', detail: error.message }]
  }
}

function checkCompanyQuotes(root, now) {
  return ['us', 'cn', 'hk', 'adr'].flatMap(m => guarded('quotes', `public/data/${m}.json`, () => {
    const file = `public/data/${m}.json`
    const rows = readJson(root, file)
    const entries = rows.map(r => ({ key: r.code, date: firstDate((r.metrics ?? []).find(x => x[0] === '价格锚点')?.[1]) }))
    return [judgeCollection({ base: { id: `quotes.${m}`, group: '公司行情', label: `${m} 价格锚点`, file, market: m }, entries, market: m, threshold: THRESHOLDS.dailyQuote, now })]
  }))
}

function groupByPrefix(obj, pick) {
  const out = {}
  for (const [key, v] of Object.entries(obj)) (out[key.split(':')[0]] ??= []).push({ key, date: pick(v) })
  return out
}

function checkMarketSnapshot(root, now) {
  const file = 'src/data/companyMarketSnapshot.json'
  return guarded('snapshot', file, () => Object.entries(groupByPrefix(readJson(root, file), v => v?.date ?? null)).map(([m, entries]) =>
    judgeCollection({ base: { id: `snapshot.${m}`, group: '公司行情', label: `行情快照 ${m}`, file, market: m }, entries, market: m, threshold: THRESHOLDS.dailyQuote, now })))
}

function checkLynch(root, now) {
  const file = 'public/data/lynch.json'
  return guarded('lynch', file, () => Object.entries(groupByPrefix(readJson(root, file), v => v?.peAsOf ?? null)).map(([m, entries]) =>
    judgeCollection({ base: { id: `lynch.${m}`, group: '林奇 PE', label: `peAsOf ${m}`, file, market: m }, entries, market: m, threshold: THRESHOLDS.dailyQuote, now })))
}

function checkValuations(root, now) {
  let files = []
  try { files = readdirSync(join(root, 'public/data/company-valuations')).filter(f => f.endsWith('.json')).sort() } catch (error) {
    return [{ id: 'valuations.load', group: '估值覆盖层', label: 'company-valuations 目录', status: 'error', detail: error.message }]
  }
  return files.flatMap(f => guarded('valuations', `public/data/company-valuations/${f}`, () => {
    const file = `public/data/company-valuations/${f}`
    const m = f.replace(/\.json$/, '')
    const body = readJson(root, file)
    const entries = (body.records ?? []).map(r => ({ key: r.key ?? r.code, date: r.price?.date ?? null }))
    // asOf 只是生成标签，判断用记录内 price.date；二者不一致时提示（记录内 comparison 可能未按新价重算）
    const newest = maxDate(entries.map(e => e.date))
    const note = body.asOf && newest && body.asOf !== newest ? `文件 asOf ${body.asOf} ≠ 记录最新价格日 ${newest}` : undefined
    return [judgeCollection({ base: { id: `valuations.${m}`, group: '估值覆盖层', label: `${m} 记录价格日`, file, market: m }, entries, market: m, threshold: THRESHOLDS.dailyQuote, now, countMissing: false, note })]
  }))
}

function checkDailyAnalysis(root, now) {
  const file = 'public/data/daily-analysis.json'
  return guarded('dailyAnalysis', file, () => {
    const snaps = readJson(root, file).snapshots ?? []
    const dates = new Set(snaps.map(s => s.dataDate))
    const latest = maxDate([...dates])
    const base = { id: 'dailyAnalysis.latest', group: '每日分析', label: '最新收盘快照 vs 最近 A 股交易日', file, market: 'cn' }
    const judged = judgeDate({ observed: latest, market: 'cn', ...THRESHOLDS.dailyAnalysis, now })
    const out = [item(base, judged)]
    const latestSnap = snaps.find(s => s.dataDate === latest)
    if (latestSnap && latestSnap.session !== 'closed') out[0] = { ...out[0], status: out[0].status === 'ok' ? 'warn' : out[0].status, detail: `最新快照 session=${latestSnap.session}` }
    if (judged.expected) {
      const window = recentTradingDays('cn', judged.expected, THRESHOLDS.dailyAnalysisWindow)
      const gaps = window.filter(d => !dates.has(d) && d < judged.expected)
      out.push({
        id: 'dailyAnalysis.gaps', group: '每日分析', label: `近 ${THRESHOLDS.dailyAnalysisWindow} 个交易日缺档`, file, market: 'cn',
        observed: latest, expected: judged.expected, status: gaps.length ? 'stale' : 'ok',
        detail: gaps.length ? `缺 ${gaps.join('、')}（回补脚本未补上）` : undefined,
      })
    }
    return out
  })
}

const MACRO_LABEL = { us: '美国', cn: '中国', hk: '香港' }

async function checkMacro(root, now) {
  let quality
  try { quality = await import(new URL('../src/features/macro/quality.ts', import.meta.url).href) } catch (error) {
    return [{ id: 'macro.load', group: '宏观', label: 'quality.ts 导入', status: 'error', detail: error.message }]
  }
  const load = name => { try { return { data: readJson(root, `public/data/macro-${name}.json`) } } catch (error) { return { error } } }
  const us = load('us'); const cn = load('cn'); const hk = load('hk')
  const out = []
  for (const [name, f] of [['us', us], ['cn', cn], ['hk', hk]]) {
    if (f.error) out.push({ id: `macro.${name}.load`, group: '宏观', label: `macro-${name}.json 读取`, file: `public/data/macro-${name}.json`, status: 'error', detail: f.error.message })
  }
  const results = {}
  if (us.data) {
    const report = quality.checkQuality(us.data, cn.data ?? null, now)
    results.us = report.us
    if (cn.data) results.cn = report.cn
  }
  if (hk.data) results.hk = quality.checkHkQuality(hk.data, now)
  const status = { ok: 'ok', stale: 'stale', invalid: 'error', missing: 'error' }
  for (const [name, set] of Object.entries(results)) {
    const series = (name === 'us' ? us : name === 'cn' ? cn : hk).data.series ?? {}
    for (const r of Object.values(set)) {
      out.push({
        id: `macro.${name}.${r.key}`, group: '宏观', label: `${MACRO_LABEL[name]} ${r.key}`, file: `public/data/macro-${name}.json`,
        observed: series[r.key]?.latest?.date ?? null, unit: 'days', status: status[r.quality], detail: r.reason || undefined,
        lag: series[r.key]?.latest?.date ? daysBetween(series[r.key].latest.date, now.toISOString().slice(0, 10)) : undefined,
      })
    }
  }
  return out
}

const CYCLE_MARKET = { csi300: 'cn', hsi: 'hk', hstech: 'hk', spx: 'us', ndx: 'us' }
const cycleMarketOf = (market, metricId) => CYCLE_MARKET[market] ?? (metricId === 'hkd' ? 'hk' : 'cn')

function checkMarketCycle(root, now) {
  const out = []
  out.push(...guarded('cycle', 'public/data/market-cycle.json', () => {
    const file = 'public/data/market-cycle.json'
    return Object.entries(readJson(root, file).markets ?? {}).map(([k, v]) => {
      const m = cycleMarketOf(k)
      return item({ id: `cycle.price.${k}`, group: '市场周期', label: `${k} 周线最新收盘`, file, market: m },
        judgeDate({ observed: v.week?.at(-1)?.date ?? null, market: m, ...THRESHOLDS.dailyQuote, now }))
    })
  }))
  out.push(...guarded('cycle', 'public/data/market-cycle-auto.json', () => {
    const file = 'public/data/market-cycle-auto.json'
    const latest = new Map()
    for (const f of readJson(root, file).facts ?? []) {
      if (f.kind && f.kind !== 'observed') continue
      const key = `${f.market}.${f.metricId}`
      const prev = latest.get(key)
      if (!prev || f.observationDate > prev.observationDate) latest.set(key, f)
    }
    const byFreq = { daily: THRESHOLDS.cycleDaily, weekly: THRESHOLDS.weekly, monthly: THRESHOLDS.monthly }
    return [...latest.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, f]) => {
      const m = cycleMarketOf(f.market, f.metricId)
      return item({ id: `cycle.fact.${key}`, group: '市场周期', label: `${key}（${f.frequency}）`, file, market: m },
        judgeDate({ observed: f.observationDate, market: m, ...(f.metricId === 'hkd' ? THRESHOLDS.fredWeeklyRelease : byFreq[f.frequency] ?? THRESHOLDS.weekly), now }))
    })
  }))
  out.push(...guarded('cycle', 'public/data/market-cycle-breadth.json', () => {
    const file = 'public/data/market-cycle-breadth.json'
    return Object.entries(readJson(root, file).markets ?? {}).map(([k, v]) =>
      item({ id: `cycle.breadth.${k}`, group: '市场周期', label: `${k} MA200 宽度`, file, market: cycleMarketOf(k) },
        judgeDate({ observed: v.observationDate ?? null, ...THRESHOLDS.breadth, now })))
  }))
  out.push(...guarded('cycle', 'public/data/market-cycle-hk-pe-history.json', () => {
    const file = 'public/data/market-cycle-hk-pe-history.json'
    const rows = readJson(root, file).rows ?? []
    return [item({ id: 'cycle.hkPeHistory', group: '市场周期', label: '恒生官方月末 PE', file, market: 'hk' },
      judgeDate({ observed: maxDate(rows.map(r => r.date)), ...THRESHOLDS.monthly, now }))]
  }))
  out.push(...guarded('cycle', 'public/data/market-cycle-report.json', () => {
    const file = 'public/data/market-cycle-report.json'
    const body = readJson(root, file)
    const issues = body.issues ?? []
    return [item({ id: 'cycle.report', group: '市场周期', label: '周期周报 weekEnding', file },
      judgeDate({ observed: maxDate((body.records ?? []).map(r => r.weekEnding)), ...THRESHOLDS.cycleReport, now }),
      { detail: issues.length ? `报告自带 ${issues.length} 条问题，如：${issues.slice(0, 3).join(' / ')}` : undefined })]
  }))
  return out
}

const INDEX_MARKET = { '美股': 'us', '港股': 'hk', 'A 股': 'cn', 'A股': 'cn' }

function checkIndexHistory(root, now) {
  const file = 'public/data/index-history.json'
  return guarded('index', file, () => Object.entries(readJson(root, file).indexes ?? {}).flatMap(([k, v]) => {
    const m = INDEX_MARKET[v.group] ?? 'us'
    const out = [item({ id: `index.${k}.price`, group: '指数', label: `${k} 最新价`, file, market: m },
      judgeDate({ observed: v.latest?.date ?? null, market: m, ...THRESHOLDS.dailyQuote, now }))]
    // 空 fpe 序列多为本来没有免费源，不算过期；有序列才检查
    if (Array.isArray(v.fpe) && v.fpe.length) {
      out.push(item({ id: `index.${k}.fpe`, group: '指数', label: `${k} Forward PE（月）`, file, market: m },
        judgeDate({ observed: maxDate(v.fpe.map(r => r[0])), ...THRESHOLDS.fpe, now })))
    }
    return out
  }))
}

function checkSpreads(root, now) {
  return [
    ...guarded('spread', 'public/data/equity-bond-spread.json', () => {
      const file = 'public/data/equity-bond-spread.json'
      const rows = readJson(root, file).rows ?? []
      return [item({ id: 'spread.cn', group: '股债利差', label: 'A 股股债利差最新行', file, market: 'cn' },
        judgeDate({ observed: rows.at(-1)?.[0] ?? null, market: 'cn', ...THRESHOLDS.dailyQuote, now }))]
    }),
    ...guarded('spread', 'public/data/us-equity-bond-spread.json', () => {
      const file = 'public/data/us-equity-bond-spread.json'
      const body = readJson(root, file)
      return [
        item({ id: 'spread.us.forwardPe', group: '股债利差', label: '美股利差 Forward PE 周度行', file, market: 'us' },
          judgeDate({ observed: body.rows?.at(-1)?.[0] ?? null, ...THRESHOLDS.weekly, now })),
        item({ id: 'spread.us.yield', group: '股债利差', label: '美债 10Y（DGS10）', file, market: 'us' },
          judgeDate({ observed: body.latestYield?.date ?? null, market: 'us', ...THRESHOLDS.dailyQuote, now })),
        item({ id: 'spread.us.real', group: '股债利差', label: 'TIPS 10Y（DFII10）', file, market: 'us' },
          judgeDate({ observed: body.latestReal?.date ?? null, market: 'us', ...THRESHOLDS.dailyQuote, now })),
      ]
    }),
  ]
}

function checkEtfTechnical(root, now) {
  const file = 'public/data/etf-technical-latest.json'
  return guarded('etf', file, () => {
    const body = readJson(root, file)
    const entries = (body.records ?? []).map(r => ({ key: r.code, date: r.asOf ?? r.day?.asOf ?? null }))
    const errors = body.errors ?? []
    const res = judgeCollection({
      base: { id: 'etf.technical', group: 'ETF 技术面', label: 'ETF/债基日线 asOf', file, market: 'cn' }, entries, market: 'cn', threshold: THRESHOLDS.dailyQuote, now,
      note: errors.length ? `采集错误 ${errors.length} 条` : undefined,
    })
    return [errors.length && res.status === 'ok' ? { ...res, status: 'warn' } : res]
  })
}

/** 按「报告期 → 法定披露截止日」推算截至 today 应已可得的最新报告期 */
export function expectedReportPeriod(today, schedule, slackDays = THRESHOLDS.disclosureSlackDays) {
  const year = Number(today.slice(0, 4))
  let best = null
  for (let y = year - 2; y <= year; y++) {
    for (const { period, deadline, nextYear } of schedule) {
      const p = `${y}-${period}`
      const due = addDays(`${y + (nextYear ? 1 : 0)}-${deadline}`, slackDays)
      if (due <= today && (!best || p > best)) best = p
    }
  }
  return best
}
// 上市公司：一季报 4/30、半年报 8/31、三季报 10/31、年报次年 4/30
const STOCK_SCHEDULE = [
  { period: '03-31', deadline: '04-30' }, { period: '06-30', deadline: '08-31' },
  { period: '09-30', deadline: '10-31' }, { period: '12-31', deadline: '04-30', nextYear: true },
]
// 基金持有人结构只在半年报（8/31）与年报（次年 3/31）披露
const FUND_SCHEDULE = [{ period: '06-30', deadline: '08-31' }, { period: '12-31', deadline: '03-31', nextYear: true }]

function periodItem(base, observed, schedule, now) {
  const expected = expectedReportPeriod(now.toISOString().slice(0, 10), schedule)
  if (!observed) return { ...base, observed: null, status: 'error', detail: '缺少报告期' }
  const stale = expected && observed < expected
  return { ...base, observed, expected, unit: 'period', status: stale ? 'stale' : 'ok', detail: stale ? `按披露截止日 + ${THRESHOLDS.disclosureSlackDays} 天，应已可得 ${expected}` : undefined }
}

function checkNationalTeam(root, now) {
  return [
    ...guarded('nationalTeam', 'public/data/national-team/meta.json', () => {
      const file = 'public/data/national-team/meta.json'
      return [periodItem({ id: 'nationalTeam.stocks', group: '国家队', label: '个股持仓报告期', file, market: 'cn' }, readJson(root, file).reportDate, STOCK_SCHEDULE, now)]
    }),
    ...guarded('nationalTeam', 'public/data/national-team/etf.json', () => {
      const file = 'public/data/national-team/etf.json'
      const meta = readJson(root, file).meta ?? {}
      return [
        periodItem({ id: 'nationalTeam.etfHolders', group: '国家队', label: 'ETF 实名持有人报告期', file, market: 'cn' }, meta.latestDate, FUND_SCHEDULE, now),
        item({ id: 'nationalTeam.etfPrice', group: '国家队', label: 'ETF 现价日', file, market: 'cn' },
          judgeDate({ observed: meta.priceAsOf ?? null, market: 'cn', ...THRESHOLDS.dailyQuote, now })),
      ]
    }),
  ]
}

function checkDcfPrefill(root, now) {
  const file = 'public/data/dcf-prefill.json'
  return guarded('dcf', file, () => {
    const body = readJson(root, file)
    const byMarket = {}
    for (const it of body.items ?? []) (byMarket[it.m] ??= []).push({ key: it.c, date: it.pxDate ?? null })
    const issues = body.issues ?? []
    const out = Object.entries(byMarket).map(([m, entries]) =>
      judgeCollection({ base: { id: `dcf.price.${m}`, group: 'DCF 预填', label: `${m} 现价日 pxDate`, file, market: m }, entries, market: m, threshold: THRESHOLDS.dailyQuote, now }))
    for (const [m, rf] of Object.entries(body.riskFree ?? {})) {
      out.push(item({ id: `dcf.riskFree.${m}`, group: 'DCF 预填', label: `${rf.label ?? m} 无风险利率`, file, market: m },
        judgeDate({ observed: rf.date ?? null, market: m, ...THRESHOLDS.dailyQuote, now }),
        { detail: issues.length ? `预填自带问题：${issues.slice(0, 2).join(' / ')}` : undefined }))
    }
    return out
  })
}

/**
 * 研究方法复盘（weekly）：信号台账最新一期、评级复盘 asOf（应等于台账最新一期）、趋势规则回测的最后完整周。
 * 三者都按周度 10 个自然日判断；复盘落后于台账时提示（每周工作流没跑或失败）。
 */
function checkMethodReviews(root, now) {
  let ledgerLatest = null
  const out = guarded('review', 'public/data/signal-ledger-*.json', () => {
    const files = readdirSync(join(root, 'public/data')).filter(f => /^signal-ledger-\d{4}\.json$/.test(f)).sort()
    if (!files.length) throw new Error('没有 signal-ledger-YYYY.json')
    ledgerLatest = maxDate(files.flatMap(f => Object.keys(readJson(root, `public/data/${f}`).snapshots ?? {})))
    return [item({ id: 'review.signalLedger', group: '方法复盘', label: '信号台账最新一期', file: `public/data/${files.at(-1)}` },
      judgeDate({ observed: ledgerLatest, ...THRESHOLDS.weekly, now }))]
  })
  out.push(...guarded('review', 'public/data/rating-review.json', () => {
    const file = 'public/data/rating-review.json'
    const body = readJson(root, file)
    const judged = judgeDate({ observed: body.asOf ?? null, ...THRESHOLDS.weekly, now })
    const behind = judged.status === 'ok' && ledgerLatest && body.asOf < ledgerLatest
    return [item({ id: 'review.rating', group: '方法复盘', label: '评级复盘 asOf', file }, behind ? { ...judged, status: 'warn' } : judged,
      { detail: behind ? `复盘 ${body.asOf} 落后于台账最新一期 ${ledgerLatest}（每周复盘工作流未跑？）` : undefined })]
  }))
  out.push(...guarded('review', 'public/data/market-cycle-backtest.json', () => {
    const file = 'public/data/market-cycle-backtest.json'
    return [item({ id: 'review.cycleBacktest', group: '方法复盘', label: '趋势规则回测最后完整周', file },
      judgeDate({ observed: readJson(root, file).asOf ?? null, ...THRESHOLDS.weekly, now }))]
  }))
  return out
}

/**
 * 财报前瞻（daily）：earnings-calendar.json 各源 sources[id].fetchedAt 的日期，3 个自然日内算新鲜。
 * 某源失败时生成器沿用上次的 fetchedAt，所以连续失败会在这里变成过期；A 股淡季预约表为空不影响 fetchedAt。
 */
export const EARNINGS_SOURCES = [['yahoo', 'Yahoo Finance'], ['hkex', '港交所董事会会议通告'], ['cnAppoint', '东方财富预约披露']]
function checkEarningsCalendar(root, now) {
  const file = 'public/data/earnings-calendar.json'
  return guarded('earnings', file, () => {
    const body = readJson(root, file)
    return EARNINGS_SOURCES.map(([id, label]) => {
      const src = body.sources?.[id]
      const judged = judgeDate({ observed: typeof src?.fetchedAt === 'string' ? src.fetchedAt.slice(0, 10) : null, ...THRESHOLDS.earningsSource, now })
      return item({ id: `earnings.${id}`, group: '财报前瞻', label: `${label} fetchedAt`, file }, judged,
        { detail: src?.ok === false && src.error ? `最近一次抓取失败：${String(src.error).slice(0, 120)}` : undefined })
    })
  })
}

export async function runDataChecks(root, now) {
  return [
    ...checkCompanyQuotes(root, now),
    ...checkMarketSnapshot(root, now),
    ...checkLynch(root, now),
    ...checkValuations(root, now),
    ...checkDailyAnalysis(root, now),
    ...await checkMacro(root, now),
    ...checkMarketCycle(root, now),
    ...checkIndexHistory(root, now),
    ...checkSpreads(root, now),
    ...checkEtfTechnical(root, now),
    ...checkNationalTeam(root, now),
    ...checkDcfPrefill(root, now),
    ...checkMethodReviews(root, now),
    ...checkEarningsCalendar(root, now),
  ]
}

// ---------------------------------------------------------------- workflows & cron

function parseField(field, lo, hi) {
  const out = new Set()
  for (const part of field.split(',')) {
    const [range, stepText] = part.split('/')
    const step = stepText ? Number(stepText) : 1
    const [a, end] = range === '*' ? [lo, hi] : range.split('-').map(Number)
    const b = end ?? (stepText ? hi : a)
    for (let v = a; v <= b; v += step) out.add(v)
  }
  return out
}

/** 解析 5 段 cron（GitHub 用 UTC）；日与周同时受限时按 POSIX 取「或」 */
export function parseCron(expr) {
  const f = expr.trim().split(/\s+/)
  if (f.length !== 5) throw new Error(`cron 段数不对：${expr}`)
  const dow = f[4] === '*' ? null : new Set([...parseField(f[4], 0, 7)].map(d => d % 7))
  return {
    minute: parseField(f[0], 0, 59), hour: parseField(f[1], 0, 23),
    dom: f[2] === '*' ? null : parseField(f[2], 1, 31), month: parseField(f[3], 1, 12), dow,
  }
}

function dayMatches(c, d) {
  if (!c.month.has(d.getUTCMonth() + 1)) return false
  const domOk = c.dom ? c.dom.has(d.getUTCDate()) : true
  const dowOk = c.dow ? c.dow.has(d.getUTCDay()) : true
  return c.dom && c.dow ? domOk || dowOk : domOk && dowOk
}

/** [from, to] 区间内所有排程触发时刻（升序，Date） */
export function firesBetween(crons, from, to) {
  const out = []
  const parsed = crons.map(parseCron)
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  for (let d = start; d <= to; d = new Date(d.getTime() + 86_400_000)) {
    for (const c of parsed) {
      if (!dayMatches(c, d)) continue
      for (const h of c.hour) for (const m of c.minute) {
        const t = new Date(d.getTime() + (h * 60 + m) * 60_000)
        if (t >= from && t <= to) out.push(t)
      }
    }
  }
  return out.sort((a, b) => a - b).filter((t, i, arr) => i === 0 || t.getTime() !== arr[i - 1].getTime())
}

/**
 * 给每次定时运行配对触发时刻，算排程延迟（分钟）。GitHub 不返回是哪条 cron 触发的，
 * 这里按先进先出配对：早于运行 MAX_PAIR_HOURS 小时仍没对应运行的触发视为被 GitHub 丢弃，
 * 否则一次丢弃会让后面所有运行都错配到更早的触发。实测延迟 4–11 小时，超过 12 小时的延迟会被低估。
 */
const MAX_PAIR_HOURS = 12
export function scheduleDelays(crons, runs) {
  const scheduled = runs.filter(r => r.event === 'schedule').map(r => ({ ...r, at: new Date(r.createdAt) })).sort((a, b) => a.at - b.at)
  if (!scheduled.length || !crons.length) return []
  const fires = firesBetween(crons, new Date(scheduled[0].at.getTime() - (MAX_PAIR_HOURS + 2) * 3_600_000), scheduled.at(-1).at)
  let i = 0
  return scheduled.map(r => {
    while (i < fires.length && fires[i] < r.at.getTime() - MAX_PAIR_HOURS * 3_600_000) i++
    let fire
    if (i < fires.length && fires[i] <= r.at) fire = fires[i++]
    else fire = fires.filter(t => t <= r.at).at(-1)
    return { createdAt: r.createdAt, fire: fire?.toISOString() ?? null, delayMinutes: fire ? Math.round((r.at - fire) / 60_000) : null }
  })
}

/**
 * vercel.json 里经 /api/market-data/cron-dispatch?workflow=<file> 准点派发的 Vercel Cron：Map(file → [schedule])。
 * 这些运行在 GitHub 上的 event 是 workflow_dispatch（GitHub 自带 schedule 常迟到 6–10 小时，只作兜底）。
 */
export function listVercelDispatchCrons(root) {
  let config
  try { config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) } catch { return new Map() }
  const out = new Map()
  for (const c of config?.crons ?? []) {
    const m = /\/cron-dispatch\?(?:[^#]*&)?workflow=([^&#]+)/.exec(c?.path ?? '')
    if (!m || typeof c.schedule !== 'string') continue
    const file = decodeURIComponent(m[1])
    out.set(file, [...(out.get(file) ?? []), c.schedule])
  }
  return out
}

export function listScheduledWorkflows(root) {
  const dir = join(root, '.github/workflows')
  let files = []
  try { files = readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).sort() } catch { return [] }
  const vercel = listVercelDispatchCrons(root)
  return files.filter(f => f !== 'data-freshness.yml').map(file => {
    const text = readFileSync(join(dir, file), 'utf8')
    const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? file
    const crons = [...text.matchAll(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/gm)].map(m => m[1])
    return { file, name, crons, dispatchCrons: vercel.get(file) ?? [] }
  }).filter(w => w.crons.length || w.dispatchCrons.length)
}

/**
 * Vercel Cron 派发的延迟：workflow_dispatch 运行配对到它之前 DISPATCH_PAIR_MINUTES 内最近的 Vercel 触发时刻。
 * 配不上的视为手动触发，不计入。Hobby 计划 Vercel 只保证在该小时内触发（±59 分钟），所以延迟含这段抖动。
 */
const DISPATCH_PAIR_MINUTES = 120
export function dispatchDelays(dispatchCrons, runs) {
  if (!dispatchCrons?.length) return []
  const dispatched = runs.filter(r => r.event === 'workflow_dispatch').map(r => ({ ...r, at: new Date(r.createdAt) })).sort((a, b) => a.at - b.at)
  if (!dispatched.length) return []
  const fires = firesBetween(dispatchCrons, new Date(dispatched[0].at.getTime() - DISPATCH_PAIR_MINUTES * 60_000), dispatched.at(-1).at)
  return dispatched.flatMap(r => {
    const fire = fires.filter(t => t <= r.at && r.at - t <= DISPATCH_PAIR_MINUTES * 60_000).at(-1)
    return fire ? [{ createdAt: r.createdAt, fire: fire.toISOString(), delayMinutes: Math.round((r.at - fire) / 60_000) }] : []
  })
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }
const FAILED = new Set(['failure', 'timed_out', 'startup_failure'])

/**
 * 工作流状态：已停用或最近一次已完成运行失败即告警；
 * 最近一个「已过 24 小时」且晚于工作流创建时间的触发没有对应定时运行则提示。
 */
export function judgeWorkflow(wf, runs, now, meta = null) {
  const sorted = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const last = sorted[0] ?? null
  const lastCompleted = sorted.find(r => r.status === 'completed') ?? null
  const delays = scheduleDelays(wf.crons, runs).filter(d => d.delayMinutes !== null)
  const recent = delays.slice(-10).map(d => d.delayMinutes)
  const dispatchCrons = wf.dispatchCrons ?? []
  const dDelays = dispatchDelays(dispatchCrons, runs)
  const dRecent = dDelays.slice(-10).map(d => d.delayMinutes)
  const notes = []
  let status = 'ok'
  const bump = s => { if (status === 'ok' || (s === 'stale' && status === 'warn')) status = s }
  if (meta?.state && meta.state !== 'active') { bump('stale'); notes.push(`工作流状态 ${meta.state}（定时任务已停用）`) }
  if (lastCompleted && FAILED.has(lastCompleted.conclusion)) { bump('stale'); notes.push(`最近完成的运行 ${lastCompleted.createdAt} 结论 ${lastCompleted.conclusion}`) }
  else if (lastCompleted?.conclusion === 'cancelled') { bump('warn'); notes.push('最近完成的运行被取消') }
  const since = Math.max(now.getTime() - 40 * 86_400_000, meta?.createdAt ? Date.parse(meta.createdAt) : 0)
  const dueFire = firesBetween(wf.crons, new Date(since), new Date(now.getTime() - 24 * 3_600_000)).at(-1)
  // 配了 Vercel Cron 的工作流，准点的 workflow_dispatch 运行同样算「排程已执行」（GitHub 兜底排程被跳过或丢弃都无妨）
  const lastScheduled = sorted.find(r => r.event === 'schedule' || (dispatchCrons.length && r.event === 'workflow_dispatch'))
  if (dueFire && (!lastScheduled || new Date(lastScheduled.createdAt) < dueFire)) {
    bump('warn')
    notes.push(`排程 ${dueFire.toISOString().slice(0, 16)}Z 之后 24 小时内没有定时运行（被 GitHub 丢弃或工作流被停用？）`)
  }
  // Vercel 派发：最近一个已过 DISPATCH_PAIR_MINUTES 的触发前 6 小时到后 2 小时内应有运行（6 小时内已成功时派发端会跳过）
  const dueDispatch = firesBetween(dispatchCrons, new Date(since), new Date(now.getTime() - DISPATCH_PAIR_MINUTES * 60_000)).at(-1)
  if (dueDispatch && !sorted.some(r => {
    const t = Date.parse(r.createdAt)
    return t >= dueDispatch.getTime() - 6 * 3_600_000 && t <= dueDispatch.getTime() + DISPATCH_PAIR_MINUTES * 60_000
  })) {
    bump('warn')
    notes.push(`Vercel Cron ${dueDispatch.toISOString().slice(0, 16)}Z 前后没有运行（CRON_SECRET／GITHUB_DISPATCH_TOKEN 未配置或派发失败？查 Vercel → Cron Jobs → View Logs）`)
  }
  if (!last && !dueFire) notes.push('创建后尚未到首次排程')
  const failures = sorted.filter(r => FAILED.has(r.conclusion))
  if (failures.length && !(lastCompleted && FAILED.has(lastCompleted.conclusion))) notes.push(`近 ${sorted.length} 次运行中失败 ${failures.length} 次（最近 ${failures[0].createdAt.slice(0, 10)}），已恢复`)
  return {
    file: wf.file, name: wf.name, crons: wf.crons, dispatchCrons, status,
    lastRun: last && { createdAt: last.createdAt, event: last.event, status: last.status, conclusion: last.conclusion, url: last.url },
    lastCompleted: lastCompleted && { createdAt: lastCompleted.createdAt, conclusion: lastCompleted.conclusion, url: lastCompleted.url },
    delay: { last: delays.at(-1)?.delayMinutes ?? null, median: median(recent), max: recent.length ? Math.max(...recent) : null, samples: recent.length },
    dispatchDelay: { last: dDelays.at(-1)?.delayMinutes ?? null, median: median(dRecent), max: dRecent.length ? Math.max(...dRecent) : null, samples: dRecent.length },
    detail: notes.join('；') || undefined,
  }
}

export function defaultGh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })
}

const ghMessage = error => String(error.stderr || error.message || error).trim().split('\n')[0]

/** 远端工作流元数据（状态、创建时间）；取不到时返回 null，不影响后续逐个查询 */
function workflowMeta(gh) {
  const text = gh(['api', 'repos/{owner}/{repo}/actions/workflows?per_page=100', '--jq', '[.workflows[] | {path, state, createdAt: .created_at}]'])
  return new Map(JSON.parse(text).map(w => [w.path.replace(/^\.github\/workflows\//, ''), w]))
}

export function checkWorkflows(root, now, { gh = defaultGh, skip = false } = {}) {
  const workflows = listScheduledWorkflows(root)
  if (skip) return { skipped: '已按 --no-gh 跳过', workflows: [] }
  let meta = null
  try { meta = workflowMeta(gh) } catch (error) {
    const message = ghMessage(error)
    if (error.code === 'ENOENT' || /auth|login|token|GH_TOKEN/i.test(message)) return { skipped: `gh 不可用：${message}`, workflows: [] }
  }
  const out = []
  for (const wf of workflows) {
    if (meta && !meta.has(wf.file)) {
      out.push({ file: wf.file, name: wf.name, crons: wf.crons, status: 'warn', detail: '远端默认分支尚无此工作流（本地新增未推送？）' })
      continue
    }
    let runs
    try {
      runs = JSON.parse(gh(['run', 'list', '--workflow', wf.file, '--limit', '20', '--json', 'conclusion,createdAt,event,status,url']))
    } catch (error) {
      out.push({ file: wf.file, name: wf.name, crons: wf.crons, status: 'warn', detail: `gh 查询失败：${ghMessage(error)}` })
      continue
    }
    out.push(judgeWorkflow(wf, runs, now, meta?.get(wf.file) ?? null))
  }
  return { skipped: null, workflows: out }
}

// ---------------------------------------------------------------- report

export function buildResult({ items, workflowResult, now }) {
  const all = [...items, ...workflowResult.workflows.map(w => ({ id: `workflow.${w.file}`, status: w.status }))]
  const alarmIds = all.filter(i => ALARM_STATUSES.has(i.status)).map(i => i.id).sort()
  const counts = {}
  for (const i of all) counts[i.status] = (counts[i.status] ?? 0) + 1
  return {
    schemaVersion: 1,
    checkedAt: now.toISOString(),
    alarm: alarmIds.length > 0,
    alarmIds,
    fingerprint: createHash('sha1').update(alarmIds.join('\n')).digest('hex').slice(0, 12),
    counts,
    thresholds: THRESHOLDS,
    items,
    workflows: workflowResult.workflows,
    workflowsSkipped: workflowResult.skipped,
  }
}

const STATUS_LABEL = { stale: '过期', error: '错误', warn: '提示', known: '已知停更', ok: '正常' }
const cell = v => (v === undefined || v === null || v === '' ? '—' : String(v).replace(/\|/g, '\\|').replace(/\n/g, ' '))
const lagText = i => (i.lag === undefined ? '—' : `${i.lag}${i.unit === 'trading' ? ' 交易日' : ' 天'}`)
const maxText = i => (i.max === undefined ? '—' : `>${i.max}${i.unit === 'trading' ? ' 交易日' : ' 天'}`)
const fmtMin = m => (m === null || m === undefined ? '—' : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`)

function itemTable(rows) {
  return ['| 状态 | 项目 | 观测日 | 应到 | 滞后 | 阈值 | 说明 |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(i => `| ${STATUS_LABEL[i.status] ?? i.status} | ${cell(`${i.group} · ${i.label}`)} \`${i.id}\` | ${cell(i.observed)} | ${cell(i.expected)} | ${lagText(i)} | ${maxText(i)} | ${cell(i.detail)} |`)]
}

export function renderMarkdown(result) {
  const { items, workflows } = result
  const problems = items.filter(i => ALARM_STATUSES.has(i.status))
  const failedWf = workflows.filter(w => w.status === 'stale')
  const known = items.filter(i => i.status === 'known')
  const warns = items.filter(i => i.status === 'warn')
  const c = result.counts
  const lines = [
    `# 数据新鲜度巡检 ${result.checkedAt.slice(0, 16).replace('T', ' ')} UTC`, '',
    `**结论：${result.alarm ? '告警' : '正常'}** — 过期/错误 ${(c.stale ?? 0) + (c.error ?? 0)} 项（含工作流失败 ${failedWf.length}），已知停更 ${c.known ?? 0}，提示 ${c.warn ?? 0}，正常 ${c.ok ?? 0}。`,
    '', '判断依据是文件里的真实观测日期（不看文件时间、提交时间或 generatedAt）；规则见 `scripts/data-freshness-check.mjs` 顶部 THRESHOLDS 与 docs/data-maintenance.md。', '',
  ]
  if (problems.length) lines.push('## 需要处理', '', ...itemTable(problems), '')
  if (failedWf.length) lines.push('## 失败的定时任务', '', ...failedWf.map(w => `- **${w.name}**（\`${w.file}\`）：${cell(w.detail)} ${w.lastCompleted?.url ?? ''}`), '')
  if (known.length) {
    lines.push('## 已知停更（白名单，不告警）', '', '| 项目 | 观测日 | 原因 | 白名单到期 |', '| --- | --- | --- | --- |',
      ...known.map(i => `| ${cell(`${i.group} · ${i.label}`)} \`${i.id}\` | ${cell(i.observed)} | ${cell(i.ackReason)} | ${cell(i.ackUntil)} |`), '')
  }
  if (warns.length) lines.push('## 提示', '', ...itemTable(warns), '')
  lines.push('## 定时任务（最近结论与排程延迟）', '')
  if (result.workflowsSkipped) lines.push(`未查询：${result.workflowsSkipped}`, '')
  else {
    lines.push('| 状态 | 工作流 | cron (UTC) | 最近运行 | 最近完成结论 | 最近定时延迟 | 近 10 次延迟 中位/最大 | Vercel Cron 派发 · 近 10 次延迟 中位/最大 | 说明 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...workflows.map(w => `| ${STATUS_LABEL[w.status] ?? w.status} | ${cell(w.name)} \`${w.file}\` | ${cell(w.crons.join(' ; '))} | ${cell(w.lastRun ? `${w.lastRun.createdAt} ${w.lastRun.event}` : null)} | ${cell(w.lastCompleted?.conclusion)} | ${fmtMin(w.delay?.last)} | ${fmtMin(w.delay?.median)} / ${fmtMin(w.delay?.max)} | ${w.dispatchCrons?.length ? `${cell(w.dispatchCrons.join(' ; '))} · ${fmtMin(w.dispatchDelay?.median)} / ${fmtMin(w.dispatchDelay?.max)}` : '—'} | ${cell(w.detail)} |`), '')
  }
  lines.push('<details><summary>全部检查项</summary>', '', ...itemTable(items), '', '</details>', '', `<!-- freshness-fingerprint: ${result.fingerprint} -->`, '')
  let md = lines.join('\n')
  // GitHub issue 正文上限 65,536 字符
  if (md.length > 60_000) md = md.slice(0, 59_000) + `\n\n…（报告过长已截断，完整内容见工作流日志）\n\n<!-- freshness-fingerprint: ${result.fingerprint} -->\n`
  return md
}

// ---------------------------------------------------------------- CLI

export async function runFreshnessCheck({ root = REPO_ROOT, now = new Date(), gh, skipGh = false, allowlist = ALLOWLIST } = {}) {
  const raw = await runDataChecks(root, now)
  const items = applyAllowlist(raw, allowlist, now)
  const workflowResult = checkWorkflows(root, now, { gh, skip: skipGh })
  return buildResult({ items, workflowResult, now })
}

function parseArgs(argv) {
  const args = { json: null, md: null, now: null, root: REPO_ROOT, noGh: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') args.json = argv[++i]
    else if (a === '--md') args.md = argv[++i]
    else if (a === '--now') args.now = argv[++i]
    else if (a === '--root') args.root = resolve(argv[++i])
    else if (a === '--no-gh') args.noGh = true
  }
  return args
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  const now = args.now ? new Date(args.now) : new Date()
  let result
  try {
    result = await runFreshnessCheck({ root: args.root, now, skipGh: args.noGh })
  } catch (error) {
    // 巡检脚本自身出错也要变成告警，而不是静默退出
    const items = [{ id: 'monitor.crash', group: '巡检', label: '巡检脚本异常', status: 'error', detail: error.stack ?? error.message }]
    result = buildResult({ items, workflowResult: { skipped: '巡检异常', workflows: [] }, now })
  }
  const md = renderMarkdown(result)
  if (args.json) writeFileSync(args.json, JSON.stringify(result, null, 2) + '\n')
  if (args.md) writeFileSync(args.md, md)
  if (!args.json && !args.md) process.stdout.write(md)
  console.error(`数据新鲜度：${result.alarm ? '告警' : '正常'}（${JSON.stringify(result.counts)}）`)
}
