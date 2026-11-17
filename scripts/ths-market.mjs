// 同花顺 · 市场：盘后采集指数估值、资金供需、利率与大小盘风格。
// 只用带日期的公开源（中证指数官网、东方财富数据中心、天天基金）；任一环节失败整批放弃，保留上一份文件。
import fs from 'node:fs'
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import {
  INDICES, STYLE_PAIRS, DANGER, CHANCE, addDays, monthsBack, csiPerfUrl, csiValUrl, emUrl, fundUrl,
  parseCsiPerf, parseCsiValuation, parseBoardPe, valuationRow, liftWeeks, holderMonths, financingMonths,
  parseFundIssue, fundMonths, parseTreasury, parseShibor, stylePair,
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
/** 东财数据中心分页取全；success=false 或数据为空视为异常（count=0 例外）。 */
async function emAll(params, maxPages = 40) {
  const out = []
  for (let page = 1; page <= maxPages; page++) {
    const body = await get(emUrl({ ...params, pageNumber: String(page), pageSize: params.pageSize ?? '500' }))
    if (body?.code === 9201 || (body?.success === false && /数据/.test(body?.message ?? ''))) return out // 无数据
    if (!body?.success || !Array.isArray(body?.result?.data)) throw new Error(`东财 ${params.reportName} 返回异常：${body?.message}`)
    out.push(...body.result.data)
    if (page >= body.result.pages) return out
  }
  throw new Error(`东财 ${params.reportName} 页数超过上限`)
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
  const pbHistory = fs.existsSync(pbFile) ? JSON.parse(fs.readFileSync(pbFile, 'utf8')) : {}
  pbHistory[date] = Object.fromEntries(INDICES.filter(i => i.valName && snap[i.valName]).map(i => [i.code, snap[i.valName].pb]))

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
  const funds = []
  for (let page = 1; page <= 8; page++) {
    const rows = parseFundIssue(await get(fundUrl(page, 500), 'text'))
    funds.push(...rows)
    if (rows.length < 500 || rows.every(r => !r.setup || r.setup < addDays(from, -90))) break
  }
  const supply = { lift: liftWeeks(lift, date), holder: holderMonths(holder, date), financing: financingMonths({ ipo, seo, cb }, date), funds: fundMonths(funds, date) }

  // 利率
  const treasury = parseTreasury(await emAll({ reportName: 'RPTA_WEB_TREASURYYIELD', columns: 'SOLAR_DATE,EMM00166466,EMM00588704', filter: `(SOLAR_DATE>='${addDays(date, -400)}')`, sortColumns: 'SOLAR_DATE', sortTypes: '1' }), date)
  const shibor = parseShibor(await emAll({ reportName: 'RPT_IMP_INTRESTRATEN', columns: 'REPORT_DATE,INDICATOR_ID,IR_RATE', filter: `(MARKET_CODE="001")(CURRENCY_CODE="CNY")(INDICATOR_ID in ("001","101"))(REPORT_DATE>='${addDays(date, -400)}')`, sortColumns: 'REPORT_DATE', sortTypes: '1' }), date)
  if (treasury.length < 100 || shibor.length < 100) throw new Error('利率历史过短')
  if (treasury.at(-1).date < addDays(date, -7) || shibor.at(-1).date < addDays(date, -7)) throw new Error('利率数据超过 7 天未更新')
  const rates = { treasury: treasury.slice(-250).map(r => [r.date, r.y10, r.y2]), shibor: shibor.slice(-250).map(r => [r.date, r.on, r.w1]) }

  const style = STYLE_PAIRS.map(p => stylePair(p, perf[p.num.code], perf[p.den.code])).filter(Boolean)
  if (style.length < 2) throw new Error('风格对比数据不足')

  const data = {
    version: 1, asOf: date, generatedAt: new Date().toISOString(), thresholds: { danger: DANGER, chance: CHANCE },
    valuation, supply, rates, style,
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
    ],
  }
  fs.mkdirSync(`${RAW}/days`, { recursive: true })
  fs.writeFileSync(`${RAW}/days/${date}.json`, JSON.stringify({ capturedAt: data.generatedAt, csiValuation: valBody }, null, 2) + '\n')
  fs.writeFileSync(pbFile, JSON.stringify(pbHistory, null, 2) + '\n')
  fs.writeFileSync(`${OUT}.tmp`, JSON.stringify(data) + '\n')
  fs.renameSync(`${OUT}.tmp`, OUT)
  console.log(`市场页数据已更新：${date}`)
}

main().catch(e => { console.error(`市场页采集失败，未发布数据：${e.message}`); process.exitCode = 1 })
