// 标普500 / 纳指100 / 沪深300 研究池 vs 当期成分：只告警缺漏，不改名单、不让工作流失败。
// 侵入点：market-cycle-update 在港股检查旁调用（此时 market-cycle-universes.json 的 csi300 刚被官方 xls 刷新）。
// 纳指：优先 Nasdaq 公开 list-type；备选 Invesco QQQ 持仓（发行人代理，非 GIW 官方权重）。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const UNIVERSE_FILE = fileURLToPath(new URL('../public/data/market-cycle-universes.json', import.meta.url))
export const COMPANY_INDEX = fileURLToPath(new URL('../public/data/company-index.json', import.meta.url))
export const US_JSON = fileURLToPath(new URL('../public/data/us.json', import.meta.url))
export const CN_JSON = fileURLToPath(new URL('../public/data/cn.json', import.meta.url))
export const ADR_JSON = fileURLToPath(new URL('../public/data/adr.json', import.meta.url))

export const SP500_CSV_URL = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv'
export const SP500_SOURCE_NOTE = 'datasets/s-and-p-500-companies（维基同步公开 CSV，ODC-PDDL-1.0；非标普官方权重导出）'
export const NDX_NASDAQ_URL = 'https://api.nasdaq.com/api/quote/list-type/nasdaq100'
export const NDX_NASDAQ_NOTE = 'Nasdaq 公开 list-type/nasdaq100（api.nasdaq.com）；非 Nasdaq GIW 官方权重导出'
export const NDX_QQQ_URL = 'https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/QQQ/holdings/fund?idType=ticker&interval=monthly&productType=ETF'
export const NDX_QQQ_NOTE = 'Invesco QQQ 持仓公开 JSON（发行人代理；站点 ToU 限个人使用、禁止未授权下载复制——自动抓取有条款风险，作备选）'
export const CSI300_XLS = 'https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/cons/000300cons.xls'
export const CSI300_NOTE = '中证官网 000300cons.xls（与 market-cycle-breadth 同源；优先复用落盘 universes）'

const UA = 'BusinessWeb/research-pool-constituents-check'
const EQ_TYPES = new Set(['COM', 'ADR', 'DRNY'])

const normUs = code => String(code || '').trim().toUpperCase()
const padCn = code => String(code || '').replace(/\D/g, '').padStart(6, '0')

/** 通用 diff：缺漏 = 官方有、研究池无；多出单独列出（研究池可含补充公司）。 */
export function diffResearchVsOfficial({ officialCodes, researchCodes, dates = {} }) {
  const pool = new Set(researchCodes)
  const official = new Set(officialCodes)
  const missing = officialCodes.filter(c => !pool.has(c))
  const extra = researchCodes.filter(c => !official.has(c))
  return {
    ok: missing.length === 0,
    missing,
    extra,
    officialCount: officialCodes.length,
    researchCount: researchCodes.length,
    dates,
  }
}

/** 解析 datasets/s-and-p-500-companies constituents.csv 文本 → 排序后的 Symbol 列表。 */
export function parseSp500Csv(text) {
  const lines = String(text).trim().split(/\r?\n/)
  if (!lines.length) throw new Error('sp500 csv 为空')
  const header = lines.shift().split(',')
  const symIdx = header.findIndex(h => /^symbol$/i.test(h.trim()))
  if (symIdx < 0) throw new Error('constituents.csv 缺少 Symbol 列')
  const codes = new Set()
  for (const line of lines) {
    const cols = []
    let cur = '', q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { q = !q; continue }
      if (ch === ',' && !q) { cols.push(cur); cur = ''; continue }
      cur += ch
    }
    cols.push(cur)
    const symbol = cols[symIdx]?.trim()
    if (symbol && /^[A-Z][A-Z0-9.-]*$/.test(symbol)) codes.add(symbol)
  }
  if (!codes.size) throw new Error('sp500 csv 无有效 Symbol')
  return [...codes].sort()
}

/** 解析 Nasdaq list-type/nasdaq100 JSON → { codes, date }。minCount 供线上守卫；测试样例可降到 1。 */
export function parseNasdaq100ListType(body, { minCount = 90 } = {}) {
  const rows = body?.data?.data?.rows
  if (!Array.isArray(rows) || !rows.length) throw new Error('nasdaq100 list-type 无 rows')
  const codes = [...new Set(rows.map(r => normUs(r.symbol)).filter(Boolean))].sort()
  if (codes.length < minCount) throw new Error(`nasdaq100 条数异常：${codes.length}`)
  const rawDate = body?.data?.date
  let date
  if (typeof rawDate === 'string') {
    const m = rawDate.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/)
    if (m) {
      const t = Date.parse(`${m[1]} ${m[2]}, ${m[3]} UTC`)
      if (Number.isFinite(t)) date = new Date(t).toISOString().slice(0, 10)
    }
  }
  return { codes, date: date ?? null, source: NDX_NASDAQ_URL }
}

/** 解析 Invesco QQQ holdings JSON → 权益证券 ticker（COM/ADR/DRNY）。 */
export function parseQqqEquityHoldings(body, { minCount = 90 } = {}) {
  const holdings = body?.holdings
  if (!Array.isArray(holdings) || !holdings.length) throw new Error('QQQ holdings 为空')
  const codes = [...new Set(
    holdings
      .filter(h => EQ_TYPES.has(h?.securityTypeCode) && h?.ticker)
      .map(h => normUs(h.ticker)),
  )].sort()
  if (codes.length < minCount) throw new Error(`QQQ 权益条数异常：${codes.length}`)
  return {
    codes,
    date: body.effectiveBusinessDate || body.effectiveDate || null,
    source: NDX_QQQ_URL,
    totalNumberOfHoldings: body.totalNumberOfHoldings,
  }
}

/** 从落盘 universes.csi300 取代码。 */
export function officialCsi300FromUniverses(universes) {
  const u = universes?.csi300
  if (!u || u.status !== 'ok' || !Array.isArray(u.codes) || !u.codes.length) return null
  return {
    codes: [...new Set(u.codes.map(padCn).filter(c => c !== '000000'))].sort(),
    date: u.date ?? null,
    source: u.source ?? CSI300_XLS,
  }
}

/** company-index.json → 指定市场代码；与 UI resolveMarket 合并口径一致。 */
export function researchCodesFromCompanyIndex(indexDoc, markets) {
  const items = indexDoc?.items
  if (!Array.isArray(items)) throw new Error('company-index 缺少 items')
  const want = new Set(markets)
  // cn 单市场用 6 位；含美股/纳指时用大写 ticker
  const onlyCn = markets.length === 1 && markets[0] === 'cn'
  const codes = new Set()
  for (const it of items) {
    if (!want.has(it.m)) continue
    const c = onlyCn ? padCn(it.c) : normUs(it.c)
    if (c && c !== '000000') codes.add(c)
  }
  return [...codes].sort()
}

/** 仅读 public/data/*.json 的后备（不含 companyCore 手工页；仅在 index 不可用时用）。 */
export function researchCodesFromJsonFiles(companies, { pad = normUs } = {}) {
  if (!Array.isArray(companies)) throw new Error('研究池须为数组')
  return [...new Set(companies.map(c => pad(c.code)).filter(c => c && c !== '000000'))].sort()
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function researchUsCodes({ companyIndex = COMPANY_INDEX, usJson = US_JSON } = {}) {
  try {
    return researchCodesFromCompanyIndex(readJson(companyIndex), ['us'])
  } catch {
    return researchCodesFromJsonFiles(readJson(usJson), { pad: normUs })
  }
}

function researchCnCodes({ companyIndex = COMPANY_INDEX, cnJson = CN_JSON } = {}) {
  try {
    return researchCodesFromCompanyIndex(readJson(companyIndex), ['cn'])
  } catch {
    return researchCodesFromJsonFiles(readJson(cnJson), { pad: padCn })
  }
}

/** 纳指页签 = us∪adr∪ndx 研究页拼成（见 ResearchNotes）。 */
function researchNdxPoolCodes({ companyIndex = COMPANY_INDEX, usJson = US_JSON, adrJson = ADR_JSON } = {}) {
  try {
    return researchCodesFromCompanyIndex(readJson(companyIndex), ['us', 'adr', 'ndx'])
  } catch {
    const us = researchCodesFromJsonFiles(readJson(usJson), { pad: normUs })
    const adr = researchCodesFromJsonFiles(readJson(adrJson), { pad: normUs })
    return [...new Set([...us, ...adr])].sort()
  }
}

async function fetchText(url, { fetchImpl = fetch, headers = {} } = {}) {
  const res = await fetchImpl(url, {
    headers: { 'user-agent': UA, accept: '*/*', ...headers },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.text()
}

async function fetchJson(url, { fetchImpl = fetch, headers = {} } = {}) {
  const text = await fetchText(url, { fetchImpl, headers })
  return JSON.parse(text)
}

/**
 * 用固定样例（不联网）算出三池 diff。
 * @returns {{ sp500, ndx, csi300 }}
 */
export function diffFromSampleBodies({
  sp500Csv,
  nasdaqBody,
  qqqBody,
  csiUniverse,
  researchUs,
  researchNdxPool,
  researchCn,
}) {
  const spOfficial = parseSp500Csv(sp500Csv)
  const ndxOfficial = nasdaqBody
    ? parseNasdaq100ListType(nasdaqBody, { minCount: 1 })
    : parseQqqEquityHoldings(qqqBody, { minCount: 1 })
  const csi = officialCsi300FromUniverses({ csi300: csiUniverse })
  if (!csi) throw new Error('csi300 universe 样例无效')
  return {
    sp500: diffResearchVsOfficial({
      officialCodes: spOfficial,
      researchCodes: researchUs,
      dates: { asOf: null },
    }),
    ndx: diffResearchVsOfficial({
      officialCodes: ndxOfficial.codes,
      researchCodes: researchNdxPool,
      dates: { asOf: ndxOfficial.date },
    }),
    csi300: diffResearchVsOfficial({
      officialCodes: csi.codes,
      researchCodes: researchCn,
      dates: { asOf: csi.date },
    }),
  }
}

function logDiff(log, tag, label, result, sourceNote) {
  // 一律走 warn/log 的 stderr 友好路径：CLI 主输出 stdout 留给 JSON
  const emit = (msg, level = 'log') => {
    if (level === 'warn') log.warn?.(msg) ?? log.log(msg)
    else log.log(msg)
  }
  const date = result.dates?.asOf ?? result.dates?.hsi ?? '?'
  if (result.missing.length) {
    emit(`[${tag}] ${label}研究池缺少 ${result.missing.length} 只当期成分（asOf ${date}，官方 ${result.officialCount}，池内 ${result.researchCount}；${sourceNote}）：${result.missing.join(', ')}`, 'warn')
    if (result.extra?.length) {
      const head = result.extra.slice(0, 20).join(', ')
      const more = result.extra.length > 20 ? ` …(+${result.extra.length - 20})` : ''
      emit(`[${tag}] ${label}研究池相对官方多出 ${result.extra.length} 只（补充公司，不一定是问题）：${head}${more}`, 'warn')
    }
  } else {
    emit(`[${tag}] ${label}研究池已覆盖官方 ${result.officialCount} 只（池内 ${result.researchCount}；asOf ${date}；${sourceNote}）`)
    if (result.extra?.length) {
      const head = result.extra.slice(0, 20).join(', ')
      const more = result.extra.length > 20 ? ` …(+${result.extra.length - 20})` : ''
      emit(`[${tag}] ${label}研究池相对官方多出 ${result.extra.length} 只（补充公司，不一定是问题）：${head}${more}`, 'warn')
    }
  }
}

/**
 * 跑三池检查。opts.fetchImpl 可注入；opts.skipFetch 则 SP/NDX 跳过联网（仅 CSI 用落盘）。
 * 永不抛出让工作流失败。
 */
export async function checkResearchPoolConstituents({
  universeFile = UNIVERSE_FILE,
  companyIndex = COMPANY_INDEX,
  usJson = US_JSON,
  cnJson = CN_JSON,
  adrJson = ADR_JSON,
  fetchImpl = fetch,
  skipFetch = false,
  log = console,
} = {}) {
  const out = { sp500: null, ndx: null, csi300: null, errors: [] }

  // ── 沪深300：优先落盘 universes（market-cycle 刚刷新）──
  try {
    const universes = readJson(universeFile).universes ?? {}
    const csi = officialCsi300FromUniverses(universes)
    if (!csi) {
      const msg = '[research-pool-constituents] 沪深300 跳过：universes.csi300 未落盘或状态非 ok'
      log.warn?.(msg) ?? log.log(msg)
      out.csi300 = { ok: true, skipped: true, missing: [], extra: [], officialCount: 0, researchCount: researchCnCodes({ companyIndex, cnJson }).length, dates: {} }
    } else {
      const result = {
        ...diffResearchVsOfficial({
          officialCodes: csi.codes,
          researchCodes: researchCnCodes({ companyIndex, cnJson }),
          dates: { asOf: csi.date },
        }),
        skipped: false,
        source: csi.source,
      }
      // cn 研究池 = 沪深300∪中证500∪补充，相对 300 的「多出」属预期：日志只报数量
      const csiLog = {
        ...result,
        extra: result.extra.length
          ? [`（共 ${result.extra.length} 只，含中证500/产业链补充，详见 JSON；不全列出）`]
          : [],
      }
      logDiff(log, 'research-pool-constituents', '沪深300', csiLog, CSI300_NOTE)
      out.csi300 = result
    }
  } catch (error) {
    const msg = `[research-pool-constituents] 沪深300 检查失败（仅告警）：${error instanceof Error ? error.message : String(error)}`
    log.warn?.(msg) ?? log.log(msg)
    out.errors.push(msg)
    out.csi300 = { ok: false, skipped: true, missing: [], extra: [], officialCount: 0, researchCount: 0, dates: {}, error: String(error) }
  }

  // ── 标普500 ──
  try {
    if (skipFetch) {
      out.sp500 = { ok: true, skipped: true, missing: [], extra: [], officialCount: 0, researchCount: researchUsCodes({ companyIndex, usJson }).length, dates: {} }
      log.warn?.('[research-pool-constituents] 标普500 跳过：skipFetch') ?? log.log('[research-pool-constituents] 标普500 跳过：skipFetch')
    } else {
      const csv = await fetchText(SP500_CSV_URL, { fetchImpl })
      const official = parseSp500Csv(csv)
      const result = {
        ...diffResearchVsOfficial({
          officialCodes: official,
          researchCodes: researchUsCodes({ companyIndex, usJson }),
          dates: { asOf: new Date().toISOString().slice(0, 10) },
        }),
        skipped: false,
        source: SP500_CSV_URL,
      }
      logDiff(log, 'research-pool-constituents', '标普500', result, SP500_SOURCE_NOTE)
      out.sp500 = result
    }
  } catch (error) {
    const msg = `[research-pool-constituents] 标普500 检查失败（仅告警）：${error instanceof Error ? error.message : String(error)}`
    log.warn?.(msg) ?? log.log(msg)
    out.errors.push(msg)
    out.sp500 = { ok: false, skipped: true, missing: [], extra: [], officialCount: 0, researchCount: 0, dates: {}, error: String(error) }
  }

  // ── 纳指100：Nasdaq 优先，失败再试 QQQ ──
  try {
    if (skipFetch) {
      out.ndx = { ok: true, skipped: true, missing: [], extra: [], officialCount: 0, researchCount: researchNdxPoolCodes({ companyIndex, usJson, adrJson }).length, dates: {} }
      log.warn?.('[research-pool-constituents] 纳指100 跳过：skipFetch') ?? log.log('[research-pool-constituents] 纳指100 跳过：skipFetch')
    } else {
      let official
      let note = NDX_NASDAQ_NOTE
      try {
        const body = await fetchJson(NDX_NASDAQ_URL, {
          fetchImpl,
          headers: { accept: 'application/json', origin: 'https://www.nasdaq.com', referer: 'https://www.nasdaq.com/' },
        })
        official = parseNasdaq100ListType(body)
      } catch (nasdaqErr) {
        const body = await fetchJson(NDX_QQQ_URL, { fetchImpl })
        official = parseQqqEquityHoldings(body)
        note = `${NDX_QQQ_NOTE}（Nasdaq 失败：${nasdaqErr instanceof Error ? nasdaqErr.message : String(nasdaqErr)}）`
      }
      // 缺漏：官方成分是否被 us∪adr∪ndx 任一研究页覆盖（与 ResearchNotes 纳指页签同口径）
      // 多出：仅看 market=ndx 的「纳指新增」是否已不在官方名单（us/adr 重合股不算多出）
      const pool = researchNdxPoolCodes({ companyIndex, usJson, adrJson })
      let ndxLabeled = []
      try { ndxLabeled = researchCodesFromCompanyIndex(readJson(companyIndex), ['ndx']) } catch { /* optional */ }
      const base = diffResearchVsOfficial({
        officialCodes: official.codes,
        researchCodes: pool,
        dates: { asOf: official.date },
      })
      const officialSet = new Set(official.codes)
      const result = {
        ...base,
        extra: ndxLabeled.filter(c => !officialSet.has(c)),
        skipped: false,
        source: official.source,
      }
      logDiff(log, 'research-pool-constituents', '纳指100', result, note)
      out.ndx = result
    }
  } catch (error) {
    const msg = `[research-pool-constituents] 纳指100 检查失败（仅告警）：${error instanceof Error ? error.message : String(error)}`
    log.warn?.(msg) ?? log.log(msg)
    out.errors.push(msg)
    out.ndx = { ok: false, skipped: true, missing: [], extra: [], officialCount: 0, researchCount: 0, dates: {}, error: String(error) }
  }

  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const log = {
    log: m => process.stderr.write(String(m) + '\n'),
    warn: m => process.stderr.write(String(m) + '\n'),
  }
  const r = await checkResearchPoolConstituents({ log })
  process.exitCode = 0
  const payload = {
    sp500: r.sp500 && { missing: r.sp500.missing, extra: r.sp500.extra, officialCount: r.sp500.officialCount, researchCount: r.sp500.researchCount, dates: r.sp500.dates, skipped: r.sp500.skipped },
    ndx: r.ndx && { missing: r.ndx.missing, extra: r.ndx.extra, officialCount: r.ndx.officialCount, researchCount: r.ndx.researchCount, dates: r.ndx.dates, skipped: r.ndx.skipped },
    csi300: r.csi300 && { missing: r.csi300.missing, extra: r.csi300.extra, officialCount: r.csi300.officialCount, researchCount: r.csi300.researchCount, dates: r.csi300.dates, skipped: r.csi300.skipped },
  }
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
}
