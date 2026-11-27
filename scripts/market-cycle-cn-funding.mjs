import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import path from 'node:path'
// Financing purchases / total mainland A-share and listed-fund turnover, same session, RMB.
// Numerator = SSE official margin buy + SZSE official margin buy (not Eastmoney aggregate; excludes BSE).
// A listed bond ETF is a fund in both exchanges' classification; direct bonds, B-shares,
// preferred shares, repo and options are excluded. Whole-market background for CSI300 —
// not an on-margin-securities-only ratio.
const dateOK = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d
const round = n => Number(n.toFixed(6))
const amount = x => {
  if (typeof x !== 'string' || !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(x)) throw new Error('成交额不是有效数值')
  const n = Number(x.replaceAll(',', ''))
  if (!Number.isFinite(n) || n < 0) throw new Error('成交额非有限非负数')
  return n
}
const normalize = x => String(x ?? '').replaceAll('&nbsp;', '').replace(/<[^>]*>/g, '').replace(/\s/g, '')

export function cnTurnoverUrls(date) {
  if (!dateOK(date)) throw new Error('成交日期无效')
  return {
    sse: `https://query.sse.com.cn/commonQuery.do?sqlId=COMMON_SSE_SJ_SCGM_C&isPagination=false&TRADE_DATE=${date}`,
    szse: `https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1803_sczm&TABKEY=tab1&txtQueryDate=${date}`,
  }
}

/** SSE recent margin-buy rows (JSONP). pageSize covers ~2 weeks of sessions. */
export const CN_SSE_MARGIN_URL = 'https://query.sse.com.cn/marketdata/tradedata/queryMargin.do?jsonCallBack=json&isPagination=true&pageHelp.pageSize=20&pageHelp.pageNo=1'
export function cnSzseMarginUrl(date) {
  if (!dateOK(date)) throw new Error('融资日期无效')
  return `https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1837_xxpl&TABKEY=tab1&txtDate=${date}`
}

/** Parse SSE JSONP body → ascending {date, valueYuan} rows (rzmre is yuan). */
export function parseSseMarginBuys(text) {
  const raw = String(text ?? '').trim()
  const m = /^json\(([\s\S]*)\)$/.exec(raw)
  if (!m) throw new Error('上交所融资响应不是jsonp')
  let body
  try { body = JSON.parse(m[1]) } catch { throw new Error('上交所融资jsonp无法解析') }
  const rows = body?.pageHelp?.data
  if (!Array.isArray(rows) || !rows.length) throw new Error('上交所融资买入额无数据')
  const out = []
  for (const r of rows) {
    const compact = String(r?.opDate ?? '')
    if (!/^\d{8}$/.test(compact)) throw new Error('上交所融资日期无效')
    const date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
    if (!dateOK(date)) throw new Error('上交所融资日期非法')
    const valueYuan = Number(r?.rzmre)
    if (!Number.isFinite(valueYuan) || valueYuan < 0) throw new Error('上交所融资买入额无效')
    out.push({ date, valueYuan })
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  if (new Set(out.map(r => r.date)).size !== out.length) throw new Error('上交所融资日期重复')
  return out
}

/** SZSE 1837_xxpl body → {date, valueYuan} with jrrzmr in 亿元. */
export function parseSzseMarginBuy(body, date) {
  if (!dateOK(date) || !Array.isArray(body)) throw new Error('深交所融资响应无效')
  const matches = body.filter(t => t?.metadata?.catalogid === '1837_xxpl' && t.metadata.tabkey === 'tab1')
  if (matches.length !== 1) throw new Error('深交所融资融券交易总量缺失或重复')
  const table = matches[0]
  if (table.error || table.metadata.subname !== date || !Array.isArray(table.data) || table.data.length !== 1) throw new Error('深交所融资日期或行数无效')
  if (normalize(table.metadata.cols?.jrrzmr) !== '融资买入额(亿元)' && normalize(table.metadata.cols?.jrrzmr) !== '融资买入额（亿元）') {
    throw new Error('深交所融资买入额单位不是亿元')
  }
  const yi = amount(table.data[0].jrrzmr)
  return { date, valueYuan: Number((yi * 1e8).toFixed(0)), valueYi: yi }
}

function classified(rows, names, nameKey, amountKey, date, dateKey) {
  const parts = {}
  for (const name of names) {
    const matches = rows.filter(row => normalize(row?.[nameKey]) === name)
    if (matches.length !== 1) throw new Error(`${name}分类缺失或重复`)
    const row = matches[0]
    if (dateKey && row[dateKey] !== date.replaceAll('-', '')) throw new Error(`${name}成交日期不一致`)
    parts[name] = amount(row[amountKey])
  }
  const turnoverYi = Number(Object.values(parts).reduce((sum, n) => sum + n, 0).toFixed(2))
  if (!(turnoverYi > 0)) throw new Error('成交额分母不为正')
  return { date, turnoverYi, parts, unit: '亿元人民币', scope: 'a_shares_and_all_listed_funds' }
}
export function parseSseFundingTurnover(body, date) {
  if (!dateOK(date) || body?.sqlId !== 'COMMON_SSE_SJ_SCGM_C' || !Array.isArray(body.result) || body.actionErrors?.length || Object.keys(body.fieldErrors ?? {}).length) throw new Error('上交所市场分类响应无效')
  return classified(body.result, ['主板A', '科创板', '基金'], 'PRODUCT_NAME', 'TOTAL_TRADE_AMT', date, 'TRADE_DATE')
}
export function parseSzseFundingTurnover(body, date) {
  if (!dateOK(date) || !Array.isArray(body)) throw new Error('深交所分类响应无效')
  const matches = body.filter(t => t?.metadata?.catalogid === '1803_sczm' && t.metadata.tabkey === 'tab1')
  if (matches.length !== 1) throw new Error('深交所证券类别统计缺失或重复')
  const table = matches[0]
  if (table.error || table.metadata.subname !== date || !Array.isArray(table.data)) throw new Error('深交所成交日期或分类响应无效')
  if (normalize(table.metadata.cols?.cjje) !== '成交金额(亿元)' && normalize(table.metadata.cols?.cjje) !== '成交金额（亿元）') throw new Error('深交所成交金额单位不是亿元')
  return classified(table.data, ['主板A股', '创业板A股', '基金'], 'lbmc', 'cjje', date)
}
export function parseSseTurnover(body, date) { const r = parseSseFundingTurnover(body, date); return { date: r.date, amountYi: r.turnoverYi } }
export function parseSzseTurnover(body, date) { const r = parseSzseFundingTurnover(body, date); return { date: r.date, amountYi: r.turnoverYi } }

/**
 * margin: {date, sseYuan, szseYuan} — both exchange official buys for the same session.
 * Denominator stays SSE+SZSE A-share boards + all listed funds.
 */
export function computeCnFinancingRatio(margin, sse, szse) {
  if (!dateOK(margin?.date) || margin.date !== sse?.date || margin.date !== szse?.date) throw new Error('融资与两所成交日期必须一致')
  if ([sse, szse].some(r => r.unit !== '亿元人民币' || r.scope !== 'a_shares_and_all_listed_funds' || typeof r.turnoverYi !== 'number' || !Number.isFinite(r.turnoverYi) || r.turnoverYi <= 0)) throw new Error('成交额单位/覆盖范围/分母无效')
  if (typeof margin.sseYuan !== 'number' || !Number.isFinite(margin.sseYuan) || margin.sseYuan < 0) throw new Error('上交所融资买入额无效')
  if (typeof margin.szseYuan !== 'number' || !Number.isFinite(margin.szseYuan) || margin.szseYuan < 0) throw new Error('深交所融资买入额无效')
  const denominatorYi = Number((sse.turnoverYi + szse.turnoverYi).toFixed(2))
  const numeratorYi = (margin.sseYuan + margin.szseYuan) / 1e8
  const value = numeratorYi / denominatorYi * 100
  if (value > 100) throw new Error('融资买入额超过市场成交额')
  return { date: margin.date, value, denominatorYi, numeratorYi, sseYi: margin.sseYuan / 1e8, szseYi: margin.szseYuan / 1e8 }
}

async function readCached(file) { try { return JSON.parse(await readFile(file, 'utf8')) } catch { return null } }
async function writeCached(file, value) { await mkdir(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.funding-${Math.random().toString(36).slice(2)}.tmp`; await writeFile(tmp, JSON.stringify(value)); await rename(tmp, file) }

async function exchangeTurnover(ctx, exchange, date, cacheDir) {
  const url = cnTurnoverUrls(date)[exchange], parse = exchange === 'sse' ? parseSseFundingTurnover : parseSzseFundingTurnover
  const file = cacheDir ? path.join(cacheDir, exchange, `${date}.json`) : null
  if (file) {
    const cached = await readCached(file)
    if (cached && cached.url === url && typeof cached.fetchedAt === 'string' && Number.isFinite(Date.parse(cached.fetchedAt)) && cached.fetchedAt.slice(0, 10) <= ctx.now.slice(0, 10)) {
      try { return parse(cached.body, date) } catch { /* refetch */ }
    }
  }
  const body = await ctx.get(url, { headers: { Referer: exchange === 'sse' ? 'https://www.sse.com.cn/' : 'https://www.szse.cn/' } })
  const parsed = parse(body, date)
  if (file) await writeCached(file, { url, fetchedAt: ctx.now, body }).catch(() => {})
  return parsed
}

async function szseMarginBuy(ctx, date, cacheDir) {
  const url = cnSzseMarginUrl(date)
  const file = cacheDir ? path.join(cacheDir, 'szse-margin', `${date}.json`) : null
  if (file) {
    const cached = await readCached(file)
    if (cached && cached.url === url && typeof cached.fetchedAt === 'string' && Number.isFinite(Date.parse(cached.fetchedAt)) && cached.fetchedAt.slice(0, 10) <= ctx.now.slice(0, 10)) {
      try { return parseSzseMarginBuy(cached.body, date) } catch { /* refetch */ }
    }
  }
  const body = await ctx.get(url, { headers: { Referer: 'https://www.szse.cn/' } })
  const parsed = parseSzseMarginBuy(body, date)
  if (file) await writeCached(file, { url, fetchedAt: ctx.now, body }).catch(() => {})
  return parsed
}

const SCOPE_NOTE = '不含北交所；非融资标的内部口径，分母含非融资标的的A股与全部上市基金，也非沪深300成分股专属'

/**
 * Latest same-day SSE+SZSE official financing buy (亿元). Used by financing_buy fact.
 * Marks a gap (throws / empty via caller) when either exchange is unreachable — never falls back to Eastmoney.
 */
export async function collectExchangeMarginBuy(ctx, { cacheDir } = {}) {
  const text = await ctx.get(CN_SSE_MARGIN_URL, { as: 'text', headers: { Referer: 'https://www.sse.com.cn/' } })
  const sseRows = parseSseMarginBuys(text)
  const ageOf = d => (Date.parse(ctx.now.slice(0, 10)) - Date.parse(d)) / 864e5
  const fresh = sseRows.filter(r => ageOf(r.date) >= 0 && ageOf(r.date) <= 14)
  if (!fresh.length) throw new Error('上交所融资观测为未来或已超14天')
  const newest = fresh.at(-1)
  const sz = await szseMarginBuy(ctx, newest.date, cacheDir)
  const yi = (newest.valueYuan + sz.valueYuan) / 1e8
  return {
    date: newest.date,
    yi,
    sseYi: newest.valueYuan / 1e8,
    szseYi: sz.valueYi,
    source: CN_SSE_MARGIN_URL,
    description: `沪深交易所官方融资买入额合计${yi.toFixed(2)}亿元人民币（上交所${(newest.valueYuan / 1e8).toFixed(2)}+深交所${sz.valueYi.toFixed(2)}）；${SCOPE_NOTE}。上交所：${CN_SSE_MARGIN_URL}；深交所：${cnSzseMarginUrl(newest.date)}`,
  }
}

/**
 * Emits the ratio for every SSE margin date of the last 14 days whose same-date SZSE margin buy and
 * official turnover from both exchanges are available. A date whose SZSE side cannot be fetched is
 * skipped — never filled from Eastmoney or another date.
 */
export async function collectCnFunding(ctx, { cacheDir } = {}) {
  try {
    const text = await ctx.get(CN_SSE_MARGIN_URL, { as: 'text', headers: { Referer: 'https://www.sse.com.cn/' } })
    const sseRows = parseSseMarginBuys(text)
    const ageOf = d => (Date.parse(ctx.now.slice(0, 10)) - Date.parse(d)) / 864e5
    const margins = [...sseRows].sort((a, b) => b.date.localeCompare(a.date)).filter(r => ageOf(r.date) >= 0 && ageOf(r.date) <= 14)
    if (!margins.length || ageOf(sseRows.at(-1).date) < 0) throw new Error('融资观测为未来或已超14天')
    const facts = [], failures = []
    for (const sse of margins) {
      try {
        const urls = cnTurnoverUrls(sse.date)
        const szMargin = await szseMarginBuy(ctx, sse.date, cacheDir)
        const sh = await exchangeTurnover(ctx, 'sse', sse.date, cacheDir), sz = await exchangeTurnover(ctx, 'szse', sse.date, cacheDir)
        const ratio = computeCnFinancingRatio({ date: sse.date, sseYuan: sse.valueYuan, szseYuan: szMargin.valueYuan }, sh, sz)
        const common = { market: 'csi300', observationDate: sse.date, kind: 'observed', frequency: 'daily' }
        const description = `沪深交易所官方融资买入额合计${ratio.numeratorYi.toFixed(2)}亿元人民币（上交所${ratio.sseYi.toFixed(2)}+深交所${ratio.szseYi.toFixed(2)}）÷同日沪深A股与全部上市基金成交额${ratio.denominatorYi.toFixed(2)}亿元人民币×100；沪市主板A ${sh.parts['主板A'].toFixed(2)}+科创板${sh.parts['科创板'].toFixed(2)}+基金${sh.parts['基金'].toFixed(2)}，深市主板A ${sz.parts['主板A股'].toFixed(2)}+创业板A ${sz.parts['创业板A股'].toFixed(2)}+基金${sz.parts['基金'].toFixed(2)}；不含B股、直接债券、优先股、回购、期权，债券ETF仍归基金；${SCOPE_NOTE}。上交所融资：${CN_SSE_MARGIN_URL}；深交所融资：${cnSzseMarginUrl(sse.date)}；沪市分类：${urls.sse}；深市分类：${urls.szse}`
        facts.push(
          { ...common, metricId: 'financing_buy_ratio_pct', value: round(ratio.value), unit: '%', source: CN_SSE_MARGIN_URL, description },
          { ...common, metricId: 'cn_turnover_yi', value: ratio.denominatorYi, unit: '亿元', source: urls.sse, description },
        )
      } catch (e) {
        failures.push(`${sse.date}: ${e instanceof Error ? e.message : String(e)}`)
        if (/fetch failed|超时|abort/i.test(failures.at(-1)) && !facts.length && failures.length >= 2) break
      }
    }
    if (failures.length && (!facts.length || failures.some(f => f.startsWith(margins[0].date)))) ctx.issue(`cn-funding: ${failures.slice(0, 2).join('；')}`)
    return facts
  } catch (e) { ctx.issue(`cn-funding: ${e instanceof Error ? e.message : String(e)}`); return [] }
}
