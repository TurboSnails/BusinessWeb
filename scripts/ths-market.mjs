// 同花顺 · 市场：盘后采集指数估值、资金供需、利率与大小盘风格。
// 只用带日期的公开源（中证指数官网、东方财富数据中心、天天基金）；任一环节失败整批放弃，保留上一份文件。
import fs from 'node:fs'
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import {
  INDICES, STYLE_PAIRS, DANGER, CHANCE, addDays, monthsBack, csiPerfUrl, csiValUrl, emUrl, fundUrl,
  parseCsiPerf, parseCsiValuation, parseBoardPe, valuationRow, liftWeeks, holderMonths, financingMonths,
  parseFundIssue, fundMonths, fundCoverage, parseTreasury, parseShibor, stylePair, emPaginate, mergePbDay,
  OVERSEAS_TH, usSessionBefore, overseasKlineUrl, parseOverseasKline, boardSnapshotAllowed, hkCloseAllowed, parseBoardQuotes,
  buildOverseas, mergeOverseasHistory, overseasHistoryStats,
} from './ths-market-lib.mjs'

const OUT = 'public/data/ths-tab-market.json'
const RAW = 'data-raw/ths-tab-market'
const UA = { 'user-agent': 'Mozilla/5.0', referer: 'https://data.eastmoney.com/' }

async function get(url, type = 'json') {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 80)}`)
      return type === 'json' ? await res.json() : await res.text()
    } catch (e) { if (i >= 2) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))) }
  }
}
/** 东财数据中心分页取全；只有第 1 页无数据才算空表，后续页无数据或行数与 count 不符都抛错（见 emPaginate）。 */
const emAll = (params, maxPages = 40) => emPaginate(page => get(emUrl({ ...params, pageNumber: String(page), pageSize: params.pageSize ?? '500' })), params.reportName, maxPages)

// ---------- 外盘联动（独立小节：失败只把本节置空，不影响其余模块） ----------
const OVERSEAS_MAP = JSON.parse(fs.readFileSync(new URL('./ths-market-overseas-map.json', import.meta.url), 'utf8'))
const QUOTE_HOSTS = ['https://push2.eastmoney.com', 'https://push2delay.eastmoney.com'] // push2 在部分网络返回空，收盘后两者数据相同
async function quick(url) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://quote.eastmoney.com/' }, signal: AbortSignal.timeout(10000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (!text.trim()) throw new Error('空响应')
      return JSON.parse(text)
    } catch (e) { if (i >= 1) throw e; await new Promise(r => setTimeout(r, 800)) }
  }
}
async function pool(list, n, fn) {
  const out = new Array(list.length)
  let next = 0
  await Promise.all(Array.from({ length: n }, async () => { while (next < list.length) { const i = next++; out[i] = await fn(list[i]) } }))
  return out
}
async function overseasSection(asOf, prev, now = new Date()) {
  const usSession = usSessionBefore(asOf)
  const secids = [...OVERSEAS_MAP.indices, ...OVERSEAS_MAP.stocks].map(x => x.secid)
  const klines = {}
  await pool(secids, 8, async (secid) => {
    try { klines[secid] = parseOverseasKline(await quick(overseasKlineUrl(secid))) } catch (e) { console.log(`外盘 ${secid} 日 K 失败：${e.message}`) }
  })
  const idxOk = OVERSEAS_MAP.indices.filter(i => klines[i.secid]?.rows.some(r => r.date === usSession)).length
  if (idxOk < 3) throw new Error(`美股指数未更新到 ${usSession}（${idxOk}/${OVERSEAS_MAP.indices.length}）`)
  const hkOk = hkCloseAllowed(now, asOf)
  let boards = null, boardsTime = null, boardsNote = null, boardIssues = []
  if (!boardSnapshotAllowed(now, asOf)) boardsNote = `A 股板块快照只在交易日北京 15:10 后采集当天数据，本次数据日 ${asOf} 不满足`
  else {
    const qs = new URLSearchParams({ fltt: '2', invt: '2', fields: 'f3,f12,f14,f62,f124', secids: Object.keys(OVERSEAS_MAP.boards).map(c => `90.${c}`).join(',') })
    for (const host of QUOTE_HOSTS) {
      try {
        const r = parseBoardQuotes(await quick(`${host}/api/qt/ulist.np/get?${qs}`), asOf, OVERSEAS_MAP.boards)
        if (!Object.keys(r.map).length) throw new Error('没有当天的板块行情')
        boards = r.map; boardsTime = r.time; boardIssues = r.mismatched
        break
      } catch (e) { boardsNote = `A 股板块行情获取失败：${e.message}`; console.log(`板块行情 ${host} 失败：${e.message}`) }
    }
    if (boards) boardsNote = null
  }
  // 本次没取到板块快照、但同日早些时候的文件里有：沿用那次的板块数值（仍是当天 15:10 后的快照）
  if (!boards && prev?.asOf === asOf && prev.boardsTime) {
    boards = Object.fromEntries(prev.items.flatMap(it => it.boards.map(b => [b.code, { pct: b.pct, flow: b.flow }])))
    boardsTime = prev.boardsTime; boardsNote = null; boardIssues = prev.boardIssues ?? []
  }
  const built = buildOverseas({ map: OVERSEAS_MAP, klines, boards, asOf, usSession, hkOk })
  const histFile = `${RAW}/overseas-history.json`
  let history = fs.existsSync(histFile) ? JSON.parse(fs.readFileSync(histFile, 'utf8')) : {}
  if (boards) history = mergeOverseasHistory(history, asOf, built.items)
  return {
    history, histFile: boards ? histFile : null,
    section: {
      asOf, usSession, hkDate: hkOk ? asOf : null, hkNote: hkOk ? null : '港股 16:10 收市，北京 16:15 前不取当天港股收盘',
      boardsTime, boardsNote, boardIssues, mapReviewed: OVERSEAS_MAP.reviewed, thresholds: OVERSEAS_TH,
      ...built, history: overseasHistoryStats(history, OVERSEAS_MAP),
    },
  }
}

function targetDate(now = new Date()) {
  const bj = new Date(now.getTime() + 8 * 3600e3)
  const today = bj.toISOString().slice(0, 10)
  const afterClose = bj.getUTCHours() * 60 + bj.getUTCMinutes() >= 15 * 60 + 30
  return { today, date: isTradingDay(today) && afterClose ? today : prevTradingDay(today) }
}

async function main() {
  const { today, date } = targetDate()
  const valBody = await get(csiValUrl)
  let snap
  try { snap = parseCsiValuation(valBody, date) } catch (e) { console.log(`${today}：${e.message}，数据未就绪，跳过`); return }

  const start10 = `${Number(date.slice(0, 4)) - 11}${date.slice(4)}`
  const csiCodes = [...new Set([...INDICES.filter(i => i.source === 'csi').map(i => i.code), ...STYLE_PAIRS.flatMap(p => [p.num.code, p.den.code])])]
  const perf = {}
  for (const code of csiCodes) perf[code] = parseCsiPerf(await get(csiPerfUrl(code, start10, date)), date)
  const board = {}
  for (const i of INDICES.filter(x => x.source === 'board')) {
    const rows = await emAll({ reportName: 'RPT_VALUEMARKET', columns: 'TRADE_MARKET_CODE,TRADE_DATE,PE_TTM_AVG', filter: `(TRADE_MARKET_CODE="${i.code}")`, sortColumns: 'TRADE_DATE', sortTypes: '1' })
    board[i.code] = parseBoardPe(rows, date)
  }

  // PB 只有中证官网当日快照，历史在本仓库逐日累积（尚不计算分位）。
  const pbFile = `${RAW}/pb-history.json`
  // 只记有限的 PB，同日已有值不被缺失值覆盖
  const pbHistory = mergePbDay(fs.existsSync(pbFile) ? JSON.parse(fs.readFileSync(pbFile, 'utf8')) : {}, date, snap)

  const valuation = INDICES.map(i => {
    const series = i.source === 'csi' ? perf[i.code].map(r => ({ date: r.date, pe: r.pe })) : board[i.code]
    const row = valuationRow(i, series, i.valName ? snap[i.valName] : null)
    if (i.valName && snap[i.valName]?.peTtm != null && row.pe != null && Math.abs(snap[i.valName].peTtm - row.pe) > 0.05) throw new Error(`${i.name} 滚动 PE 两接口不一致`)
    return { ...row, pbDays: Object.values(pbHistory).filter(d => d[i.code] != null).length }
  })

  // 资金供需
  const from = `${monthsBack(date, 11)}-01`
  const lift = await emAll({ reportName: 'RPT_LIFT_STAGE', columns: 'SECURITY_CODE,FREE_DATE,LIFT_MARKET_CAP', filter: `(FREE_DATE>'${date}')(FREE_DATE<='${addDays(date, 30)}')`, sortColumns: 'FREE_DATE', sortTypes: '1' })
  const holder = await emAll({ reportName: 'RPT_SHARE_HOLDER_INCREASE', columns: 'SECURITY_CODE,NOTICE_DATE,DIRECTION,CHANGE_NUM,TRADE_AVERAGE_PRICE,CLOSE_PRICE', filter: `(NOTICE_DATE>='${from}')(NOTICE_DATE<='${date}')`, sortColumns: 'NOTICE_DATE', sortTypes: '-1' }, 80)
  const ipo = await emAll({ reportName: 'RPTA_APP_IPOAPPLY', columns: 'SECURITY_CODE,LISTING_DATE,TOTAL_RAISE_FUNDS,ISSUE_PRICE,ISSUE_NUM', filter: `(LISTING_DATE>='${from}')`, sortColumns: 'LISTING_DATE', sortTypes: '-1' })
  const seo = await emAll({ reportName: 'RPT_SEO_DETAIL', columns: 'SECURITY_CODE,ISSUE_LISTING_DATE,TOTAL_RAISE_FUNDS', filter: `(ISSUE_LISTING_DATE>='${from}')`, sortColumns: 'ISSUE_LISTING_DATE', sortTypes: '-1' })
  const cb = await emAll({ reportName: 'RPT_BOND_CB_LIST', columns: 'SECURITY_CODE,VALUE_DATE,ACTUAL_ISSUE_SCALE', filter: `(VALUE_DATE>='${from}')`, sortColumns: 'VALUE_DATE', sortTypes: '-1' })
  // 新发基金：翻到覆盖 12 个月为止（最多 20 页）；没能证明覆盖的月份标为不完整（份额 null）
  const fundPages = []
  for (let page = 1; page <= 20; page++) {
    const rows = parseFundIssue(await get(fundUrl(page, 500), 'text'))
    fundPages.push(rows)
    if (fundCoverage(fundPages, from, 500) === null) break
  }
  const coveredFrom = fundCoverage(fundPages, from, 500)
  if (coveredFrom) console.log(`新发基金翻页未覆盖 12 个月，${coveredFrom.slice(0, 7)} 及以前标为不完整`)
  const supply = { lift: liftWeeks(lift, date), holder: holderMonths(holder, date), financing: financingMonths({ ipo, seo, cb }, date), funds: fundMonths(fundPages.flat(), date, 12, coveredFrom) }

  // 利率
  const treasury = parseTreasury(await emAll({ reportName: 'RPTA_WEB_TREASURYYIELD', columns: 'SOLAR_DATE,EMM00166466,EMM00588704', filter: `(SOLAR_DATE>='${addDays(date, -400)}')`, sortColumns: 'SOLAR_DATE', sortTypes: '1' }), date)
  const shibor = parseShibor(await emAll({ reportName: 'RPT_IMP_INTRESTRATEN', columns: 'REPORT_DATE,INDICATOR_ID,IR_RATE', filter: `(MARKET_CODE="001")(CURRENCY_CODE="CNY")(INDICATOR_ID in ("001","101"))(REPORT_DATE>='${addDays(date, -400)}')`, sortColumns: 'REPORT_DATE', sortTypes: '1' }), date)
  if (treasury.length < 100 || shibor.length < 100) throw new Error('利率历史过短')
  if (treasury.at(-1).date < addDays(date, -7) || shibor.at(-1).date < addDays(date, -7)) throw new Error('利率数据超过 7 天未更新')
  const rates = { treasury: treasury.slice(-250).map(r => [r.date, r.y10, r.y2]), shibor: shibor.slice(-250).map(r => [r.date, r.on, r.w1]) }

  const style = STYLE_PAIRS.map(p => stylePair(p, perf[p.num.code], perf[p.den.code])).filter(Boolean)
  if (style.length < 2) throw new Error('风格对比数据不足')

  // 外盘联动：失败时同日旧值保留，否则置空并写原因
  let prevOverseas = null
  try { prevOverseas = JSON.parse(fs.readFileSync(OUT, 'utf8'))?.overseas ?? null } catch { /* 无旧文件 */ }
  let overseas = null, overseasError = null, overseasHist = null
  try { overseasHist = await overseasSection(date, prevOverseas); overseas = overseasHist.section } catch (e) {
    console.log(`外盘联动未更新：${e.message}`)
    if (prevOverseas?.asOf === date) overseas = prevOverseas
    else overseasError = e.message
  }

  const data = {
    version: 1, asOf: date, generatedAt: new Date().toISOString(), thresholds: { danger: DANGER, chance: CHANCE },
    valuation, supply, rates, style, overseas, overseasError,
    sources: [
      { label: '中证指数官网 · 指数估值', url: csiValUrl },
      { label: '中证指数官网 · 指数行情（含滚动市盈率）', url: csiPerfUrl('000300', addDays(date, -30), date) },
      { label: '东方财富 · 市场估值（板块整体 PE）', url: emUrl({ reportName: 'RPT_VALUEMARKET' }) },
      { label: '东方财富 · 限售解禁', url: emUrl({ reportName: 'RPT_LIFT_STAGE' }) },
      { label: '东方财富 · 股东增减持', url: emUrl({ reportName: 'RPT_SHARE_HOLDER_INCREASE' }) },
      { label: '东方财富 · 新股发行', url: emUrl({ reportName: 'RPTA_APP_IPOAPPLY' }) },
      { label: '东方财富 · 增发', url: emUrl({ reportName: 'RPT_SEO_DETAIL' }) },
      { label: '东方财富 · 可转债发行', url: emUrl({ reportName: 'RPT_BOND_CB_LIST' }) },
      { label: '天天基金 · 新成立基金', url: fundUrl(1, 50) },
      { label: '东方财富 · 中美国债收益率', url: emUrl({ reportName: 'RPTA_WEB_TREASURYYIELD' }) },
      { label: '东方财富 · Shibor', url: emUrl({ reportName: 'RPT_IMP_INTRESTRATEN' }) },
      { label: '东方财富 · 美股 / 港股日 K（外盘联动）', url: overseasKlineUrl('105.NVDA', 5) },
      { label: '东方财富 · 板块行情（外盘联动）', url: 'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f3,f12,f14,f62,f124&secids=90.BK1161' },
    ],
  }
  fs.mkdirSync(`${RAW}/days`, { recursive: true })
  fs.writeFileSync(`${RAW}/days/${date}.json`, JSON.stringify({ capturedAt: data.generatedAt, csiValuation: valBody }, null, 2) + '\n')
  fs.writeFileSync(pbFile, JSON.stringify(pbHistory, null, 2) + '\n')
  if (overseasHist?.histFile) fs.writeFileSync(overseasHist.histFile, JSON.stringify(overseasHist.history, null, 2) + '\n')
  fs.writeFileSync(`${OUT}.tmp`, JSON.stringify(data) + '\n')
  fs.renameSync(`${OUT}.tmp`, OUT)
  console.log(`市场页数据已更新：${date}`)
}

main().catch(e => { console.error(`市场页采集失败，未发布数据：${e.message}`); process.exitCode = 1 })
