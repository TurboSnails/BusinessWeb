// 同花顺 · ETF资金：纯函数（解析、口径、汇总）。网络与落盘在 ths-etf.mjs。
// 口径：申购净流入 ≈ (T 日场内份额 − 上一交易日份额) × T 日收盘价。份额来自交易所每日公布数据（上交所 ETF 规模、深交所基金规模），
// 价格为 T 日场内收盘价（腾讯行情带时间戳 / 东方财富日 K，均带日期）。这是按份额变化推算的资金，不代表一定是某类资金。
import { inflateRawSync } from 'node:zlib'
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'

export const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
export const num = (x) => {
  if (x === null || x === undefined) return null
  const s = String(x).replace(/,/g, '').trim()
  if (s === '' || s === '-' || s === '--') return null
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}

// ---------------------------------------------------------------------------
// 宽基名单（写死，33 只）：沪深300/上证50/中证500/中证1000/创业板/科创50/中证A500 等主流产品。
// 选取：national-team 页里披露有国家队（汇金等）持有的宽基 ETF（2025-12-31 报告期）+ 各指数规模靠前的 A500、科创50、中证2000 产品。
// 按指数汇总即同花顺「国家队 ETF」口径——但这里只是份额变化推算，不代表一定是国家队资金。
// ---------------------------------------------------------------------------
export const BROAD_ETFS = [
  ['510300', '沪深300'], ['510310', '沪深300'], ['510330', '沪深300'], ['159919', '沪深300'],
  ['510050', '上证50'], ['510100', '上证50'],
  ['510500', '中证500'], ['512500', '中证500'], ['159922', '中证500'],
  ['512100', '中证1000'], ['159845', '中证1000'], ['560010', '中证1000'], ['159629', '中证1000'],
  ['159915', '创业板指'], ['159952', '创业板指'], ['159977', '创业板指'], ['159949', '创业板50'],
  ['588000', '科创50'], ['588080', '科创50'], ['588050', '科创50'], ['588060', '科创50'],
  ['563360', '中证A500'], ['159352', '中证A500'], ['159338', '中证A500'], ['159361', '中证A500'], ['512050', '中证A500'], ['563800', '中证A500'],
  ['510180', '上证180'], ['510210', '上证指数'], ['159901', '深证100'], ['515800', '中证800'], ['563300', '中证2000'], ['560050', '中国A50'],
].map(([code, index]) => ({ code, index }))
export const BROAD_INDEX_ORDER = [...new Set(BROAD_ETFS.map(b => b.index))]

// ---------------------------------------------------------------------------
// 分类：东方财富 ETF 分组（MK0022 货币、MK0023 跨境、MK0024 商品）优先，其余按名称规则。
// ---------------------------------------------------------------------------
export const CATEGORIES = ['宽基', '行业主题', '跨境', '商品', '债券']
const RE_MONEY = /货币|保证金|日利|添益|现金|财富宝|快线|理财金/
const RE_BOND = /债|国开|政金|城投|短融|可转|利率|久期|信用/
const RE_CROSS = /港|恒生|恒指|H股|纳指|纳斯达克|纳斯|标普|日经|日本|德国|法国|美国|美股|中概|亚太|东南亚|沙特|海外|全球|道琼斯|韩国|印度|巴西|新兴|欧洲|英国|东证|中韩|QDII/
const RE_COMMODITY = /黄金(?!股|产业|矿)|上海金|白银|豆粕|期货|能源化工|原油|有色金属ETF(?=.*期)|商品/
const RE_BROAD = /^(沪深300|300ETF|中证500|500ETF|中证1000|1000ETF|中证2000|2000ETF|国证2000|中证A500(?!红利)|A500(?!红利)|中证A100|A100|中证A50(?!0)|中国A50|A50(?!0)|上证50|50ETF|上证180|180ETF|上证380|上证指数|上证综指|综指ETF|科创50|科创板50|科创100|科创200|科创综指|科创创业50|双创50|双创|创业板ETF|创业板50|创业板指|创业板综|创业ETF|创50|深证100|深100|深证50|深成|深证成指|中证800|中证100|中证全指|北证50|MSCI中国A50|MSCIA股|MSCI中国A股|A股ETF|500增强|1000增强|300增强|富时A50|深300|创业综指|深证主板50|创业板300)/
export function classify(name, emGroup = null) {
  const n = String(name ?? '').replace(/\s+/g, '')
  if (emGroup === 'MK0022' || RE_MONEY.test(n)) return '货币'
  if (emGroup === 'MK0023') return '跨境'
  if (emGroup === 'MK0024') return '商品'
  if (RE_BOND.test(n)) return '债券'
  if (RE_COMMODITY.test(n)) return '商品'
  if (RE_CROSS.test(n)) return '跨境'
  if (RE_BROAD.test(n)) return '宽基'
  return '行业主题'
}

// ---------------------------------------------------------------------------
// 上交所：commonQuery ETF 规模（STAT_DATE、TOT_VOL 单位万份）
// ---------------------------------------------------------------------------
export const sseUrl = (date) => 'https://query.sse.com.cn/commonQuery.do?isPagination=true&pageHelp.pageSize=10000&pageHelp.pageNo=1'
  + `&pageHelp.beginPage=1&pageHelp.cacheSize=1&pageHelp.endPage=1&sqlId=COMMON_SSE_ZQPZ_ETFZL_XXPL_ETFGM_SEARCH_L&STAT_DATE=${date}`
/** 返回 { code: { name, shares } }（份）；所有行日期必须是 date，否则抛错；空结果返回 null（当日未公布/非交易日）。 */
export function parseSse(body, date) {
  const rows = body?.result
  if (!Array.isArray(rows)) throw new Error('上交所 ETF 规模返回格式异常')
  if (!rows.length) return null
  const out = {}
  for (const r of rows) {
    if (r?.STAT_DATE !== date) throw new Error(`上交所 ETF 规模日期不符：${r?.STAT_DATE} ≠ ${date}`)
    const code = String(r.SEC_CODE ?? '').trim()
    const vol = num(r.TOT_VOL)
    if (!/^\d{6}$/.test(code) || vol === null || vol < 0) continue
    out[code] = { name: String(r.SEC_NAME ?? '').trim(), shares: Math.round(vol * 1e4) }
  }
  if (Object.keys(out).length < 300) throw new Error(`上交所 ETF 规模条数过少：${Object.keys(out).length}`)
  return out
}

// ---------------------------------------------------------------------------
// 深交所：基金规模 xlsx（CATALOGID=scsj_fund_jjgm，jjlb=ETF，按日期区间；列：日期、基金代码、基金简称、基金规模(份)）
// ---------------------------------------------------------------------------
export const SZSE_REFERER = 'https://www.szse.cn/market/fund/volume/etf/index.html'
export const szseUrl = (start, end) => 'https://www.szse.cn/api/report/ShowReport?' + new URLSearchParams({ SHOWTYPE: 'xlsx', CATALOGID: 'scsj_fund_jjgm', TABKEY: 'tab1', txtStart: start, txtEnd: end, jjlb: 'ETF', random: '0.5' })

/** 极简 zip 读取（只认 stored/deflate），用中央目录定位条目。 */
export function unzipEntry(buf, name) {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('xlsx 不是有效 zip')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let k = 0; k < count; k += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 中央目录异常')
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const nlen = buf.readUInt16LE(p + 28)
    const elen = buf.readUInt16LE(p + 30)
    const clen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const entry = buf.subarray(p + 46, p + 46 + nlen).toString('utf8')
    if (entry === name) {
      const lnlen = buf.readUInt16LE(local + 26)
      const lelen = buf.readUInt16LE(local + 28)
      const data = buf.subarray(local + 30 + lnlen + lelen, local + 30 + lnlen + lelen + csize)
      if (method === 0) return data.toString('utf8')
      if (method === 8) return inflateRawSync(data).toString('utf8')
      throw new Error(`不支持的压缩方式 ${method}`)
    }
    p += 46 + nlen + elen + clen
  }
  return null
}
const xmlText = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim()
/** 读取第一张表（inlineStr / sharedStrings 都支持），返回二维字符串数组。 */
export function readXlsxRows(buf) {
  const sheet = unzipEntry(buf, 'xl/worksheets/sheet1.xml')
  if (!sheet) throw new Error('xlsx 缺少 sheet1')
  const sharedXml = unzipEntry(buf, 'xl/sharedStrings.xml')
  const shared = sharedXml ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => xmlText(m[1])) : []
  const rows = []
  for (const m of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = []
    for (const c of m[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]
      const col = /r="([A-Z]+)\d+"/.exec(attrs)?.[1]
      const idx = col ? [...col].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : cells.length
      const body = c[2] ?? ''
      const type = /t="(\w+)"/.exec(attrs)?.[1]
      let v = ''
      if (type === 'inlineStr') v = xmlText(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '')
      else if (type === 's') v = shared[Number(xmlText(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? ''))] ?? ''
      else v = xmlText(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '')
      cells[idx] = v
    }
    rows.push(Array.from(cells, x => x ?? ''))
  }
  return rows
}
/** 深交所基金规模表 → { date: { code: { name, shares } } }。表头必须是「日期/基金代码/基金简称/基金规模(份)」。 */
export function parseSzseRows(rows) {
  const head = (rows[0] ?? []).map(s => s.replace(/\s+/g, ''))
  if (head[0] !== '日期' || head[1] !== '基金代码' || !/^基金规模\(份\)$/.test(head[3] ?? '')) throw new Error(`深交所基金规模表头异常：${head.join('|')}`)
  const out = {}
  for (const r of rows.slice(1)) {
    const date = String(r[0] ?? '').trim()
    const code = String(r[1] ?? '').trim()
    const shares = num(r[3])
    if (!validDate(date) || !/^\d{6}$/.test(code) || shares === null || shares < 0) continue
    ;(out[date] ??= {})[code] = { name: String(r[2] ?? '').trim(), shares: Math.round(shares) }
  }
  return out
}

// ---------------------------------------------------------------------------
// 价格：腾讯 qt 批量（字段 3 现价、字段 30 时间戳 yyyymmddHHMMSS）；东方财富日 K（不复权）
// ---------------------------------------------------------------------------
export const tencentUrl = (codes) => `https://qt.gtimg.cn/q=${codes.map(c => `${marketOf(c)}${c}`).join(',')}`
export const marketOf = (code) => (/^(5|6)/.test(code) ? 'sh' : 'sz')
/** 只接受时间戳日期 = date 且时间 ≥ 15:00 的收盘价。 */
export function parseTencent(text, date) {
  const out = {}
  const ymd = date.replace(/-/g, '')
  for (const part of String(text).split(';')) {
    const m = /v_(sh|sz)(\d{6})="([^"]*)"/.exec(part)
    if (!m) continue
    const f = m[3].split('~')
    const price = num(f[3])
    const ts = String(f[30] ?? '')
    if (price === null || price <= 0 || ts.slice(0, 8) !== ymd || ts.slice(8, 12) < '1500') continue
    out[m[2]] = price
  }
  return out
}
// ---------------------------------------------------------------------------
// 深交所份额备用源：腾讯行情的总份额字段（字段 72/73）。
// GitHub Actions（境外）连不上 *.szse.cn（TLS 握手即被重置），腾讯行情可达。行情里的份额是交易所上一交易日公布值：
// T 日盘中/收盘后的快照（时间戳日期 = T）里是 T−1 的份额，T+1 开盘前才换成 T 的份额（2026-11-17 晚 159915/159919/159338
// 与深交所 xlsx 的 11-16 值逐份一致）。字段本身不带日期，所以：
//   1) 只认「时间戳日期 = 应有的最近交易日」的快照，并避开北京 07:00–09:30（份额字段可能已换、时间戳还没换的窗口）；
//   2) 份额日期 = 时间戳日期的上一交易日；
//   3) 与存档交叉校验：该日已有交易所数据时必须基本一致；前一日存档在时必须有足够多的份额变化（否则是还没换日的旧值）。
// ---------------------------------------------------------------------------
export const TENCENT_SHARES = 'tencent-qt'
/** 腾讯行情 → { code: { name, shares, ts } }；份额取字段 72（与 73 不一致或非正整数时丢弃）。 */
export function parseTencentShares(text) {
  const out = {}
  for (const part of String(text).split(';')) {
    const m = /v_sz(\d{6})="([^"]*)"/.exec(part)
    if (!m) continue
    const f = m[2].split('~')
    const s = num(f[72]); const s2 = num(f[73]); const ts = String(f[30] ?? '')
    if (s === null || !Number.isInteger(s) || s <= 0 || (s2 !== null && s2 !== s) || !/^\d{14}$/.test(ts)) continue
    out[m[1]] = { name: String(f[1] ?? '').trim(), shares: s, ts }
  }
  return out
}
/**
 * 现在抓腾讯快照，份额对应哪一天：{ tsDate: 快照应有的时间戳日期, date: 份额日期 }；北京 07:00–09:30 返回 null（不用）。
 */
export function tencentSharesDate(now = new Date()) {
  const bj = new Date(now.getTime() + 8 * 3600e3)
  const today = bj.toISOString().slice(0, 10)
  const hm = bj.getUTCHours() * 60 + bj.getUTCMinutes()
  if (hm >= 7 * 60 && hm < 9 * 60 + 30) return null
  const tsDate = isTradingDay(today) && hm >= 9 * 60 + 30 ? today : prevTradingDay(today)
  return { tsDate, date: prevTradingDay(tsDate) }
}
/** 只保留时间戳日期 = tsDate 的代码（停牌等时间戳旧的，份额也可能是旧的），返回 { code: { name, shares } }。 */
export function pickTencentShares(parsed, tsDate) {
  const ymd = tsDate.replace(/-/g, '')
  const out = {}
  for (const [code, v] of Object.entries(parsed)) if (v.ts.slice(0, 8) === ymd) out[code] = { name: v.name, shares: v.shares }
  return out
}
/** 存档这一天的深交所份额是否交易所口径（旧存档没有 via，都是交易所数据）；是则不用行情推断值覆盖。 */
export const isExchangeSzse = (day) => !!day?.src?.szse && (day.via?.szse ?? 'szse') === 'szse'
/**
 * 交叉校验腾讯推断日期的份额 got（{ code: { shares } }）：
 * - day（同日存档）有深交所交易所数据：重叠代码里逐份一致的比例须 ≥ 98%；
 * - prev（前一交易日存档）有深交所数据：重叠代码里份额有变化的比例须 ≥ 10%（深市 ETF 每天约一半份额有变化；
 *   变化太少说明快照里还是前一日的值，日期推断错了）。
 */
export function checkLaggedShares(got, day, prev) {
  const cmp = (ref) => {
    const codes = Object.keys(got).filter(c => Number.isFinite(ref?.shares?.[c]))
    return { n: codes.length, same: codes.filter(c => ref.shares[c] === got[c].shares).length }
  }
  if (isExchangeSzse(day)) {
    const { n, same } = cmp(day)
    if (n < 100 || same / n < 0.98) return { ok: false, reason: `与同日深交所存档不一致（${same}/${n} 相同）` }
  }
  if (prev?.src?.szse) {
    const { n, same } = cmp(prev)
    if (n < 100 || (n - same) / n < 0.1) return { ok: false, reason: `与前一交易日存档几乎相同（${n - same}/${n} 有变化），疑似尚未换日` }
  }
  return { ok: true, reason: null }
}
export const klineUrl = (code, lmt) => 'https://push2his.eastmoney.com/api/qt/stock/kline/get?' + new URLSearchParams({ secid: `${marketOf(code) === 'sh' ? 1 : 0}.${code}`, klt: '101', fqt: '0', lmt: String(lmt), end: '20500101', fields1: 'f1,f2,f3', fields2: 'f51,f53' })
/** 返回 { date: close }（不复权收盘价）。 */
export function parseKline(body, code) {
  if (body?.data?.code && body.data.code !== code) throw new Error(`K 线代码不符 ${body.data.code}`)
  const out = {}
  for (const line of body?.data?.klines ?? []) {
    const [d, c] = String(line).split(',')
    const close = num(c)
    if (validDate(d) && close !== null && close > 0) out[d] = close
  }
  return out
}

// ---------------------------------------------------------------------------
// 东方财富 ETF 清单（只取名称与分组，作参考资料；不取行情数值）
// ---------------------------------------------------------------------------
export const EM_GROUPS = ['MK0021', 'MK0022', 'MK0023', 'MK0024']
export const emListUrl = (group, pn) => 'https://push2delay.eastmoney.com/api/qt/clist/get?' + new URLSearchParams({ pn: String(pn), pz: '100', po: '1', fid: 'f12', fs: `b:${group}`, fields: 'f12,f14' })

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
/**
 * days: { date: { shares: {code: 份}, close: {code: 元} } }，日期均为交易日。
 * 返回 flowOf(code, date)：(shares_T − shares_{prevTradingDay(T)}) × close_T；任一缺失 → null。新上市（前一日无份额）→ null。
 */
export function makeFlow(days) {
  return (code, date) => {
    const d = days[date]
    const p = days[prevTradingDay(date)]
    const s1 = d?.shares?.[code]
    const s0 = p?.shares?.[code]
    const c = d?.close?.[code]
    if (!Number.isFinite(s1) || !Number.isFinite(s0)) return null
    if (s1 === s0) return 0 // 份额不变：申购净流入为 0（真实的 0，不需要价格）
    if (!Number.isFinite(c)) return null
    return (s1 - s0) * c
  }
}
/** 最近 n 个交易日（含 asOf）。 */
export function tradingDaysBack(asOf, n) {
  const out = [asOf]
  while (out.length < n) out.push(prevTradingDay(out.at(-1)))
  return out.reverse()
}
const sumStrict = (xs) => (xs.some(x => x === null) ? null : xs.reduce((a, b) => a + b, 0))
const r2 = (x) => (x === null ? null : Math.round(x))

export function etfStats(code, asOf, days, flow) {
  const d1 = tradingDaysBack(asOf, 1)
  const d5 = tradingDaysBack(asOf, 5)
  const d20 = tradingDaysBack(asOf, 20)
  const shares = days[asOf]?.shares?.[code] ?? null
  const prev = days[prevTradingDay(asOf)]?.shares?.[code] ?? null
  const close = days[asOf]?.close?.[code] ?? null
  let streak = 0
  for (const d of [...tradingDaysBack(asOf, 60)].reverse()) {
    const f = flow(code, d)
    if (f === null || f <= 0) break
    streak += 1
  }
  const f1 = flow(code, asOf)
  return {
    code, shares, sharesChg: shares !== null && prev !== null ? shares - prev : null, close,
    scale: shares !== null && close !== null ? Math.round(shares * close) : null,
    flow1: r2(sumStrict(d1.map(d => flow(code, d)))), flow5: r2(sumStrict(d5.map(d => flow(code, d)))), flow20: r2(sumStrict(d20.map(d => flow(code, d)))),
    streak: f1 === null ? null : streak,
  }
}

const exchangeOf = (code) => (marketOf(code) === 'sh' ? 'sse' : 'szse')
/** date 时这只 ETF 是否还没上市（流入 null 属正常）：两天都没份额且两天该交易所数据都在；或前一日该交易所数据在却没有这只（当日新上市）。 */
export function notListed(days, code, date) {
  const d = days[date], p = days[prevTradingDay(date)], ex = exchangeOf(code)
  const s1 = Number.isFinite(d?.shares?.[code]), s0 = Number.isFinite(p?.shares?.[code])
  if (s0) return false
  return !!p?.src?.[ex] && (s1 || !!d?.src?.[ex])
}

/** 宽基：逐只、按指数汇总、每日合计历史。 */
export function buildBroad(asOf, days, names, flow) {
  const list = BROAD_ETFS.map(b => ({ ...etfStats(b.code, asOf, days, flow), name: names[b.code] ?? b.code, index: b.index }))
  const agg = (rows, key) => sumStrict(rows.map(r => r[key]))
  const byIndex = BROAD_INDEX_ORDER.map(index => {
    const rows = list.filter(r => r.index === index)
    return { index, n: rows.length, scale: agg(rows, 'scale'), flow1: agg(rows, 'flow1'), flow5: agg(rows, 'flow5'), flow20: agg(rows, 'flow20') }
  })
  const dates = Object.keys(days).filter(d => d <= asOf).sort()
  const history = dates.slice(1).map(date => {
    const hasPrev = !!days[prevTradingDay(date)]
    if (!hasPrev) return { date, flow: null, missing: null }
    const vals = BROAD_ETFS.map(b => flow(b.code, date))
    // 名单内某只流入为 null 时，只有「确实尚未上市」才不计入：两天都没份额，或当天有份额、前一日该交易所数据在但没有这只（新上市）。
    // 其余情况（缺份额记录、缺价格）都算缺失：当天合计记 null，并给出缺失只数，不把缺失当 0。
    const missing = BROAD_ETFS.filter((b, i) => vals[i] === null && !notListed(days, b.code, date)).length
    return { date, flow: missing ? null : Math.round(vals.reduce((a, v) => a + (v ?? 0), 0)), missing }
  })
  return { list, byIndex, total: { flow1: agg(byIndex, 'flow1'), flow5: agg(byIndex, 'flow5'), flow20: agg(byIndex, 'flow20'), scale: agg(byIndex, 'scale') }, history }
}

/** 深交所当日不可用时的宽基「仅沪市」合计（只加沪市名单；与 total 不同口径，页面须标明）。 */
export function sseOnlyTotal(list) {
  const rows = list.filter(r => marketOf(r.code) === 'sh')
  const agg = (key) => sumStrict(rows.map(r => r[key]))
  return { n: rows.length, flow1: agg('flow1'), flow5: agg('flow5'), flow20: agg('flow20'), scale: agg('scale') }
}

/** 全市场：按类别汇总 + 各类别 当日/5日/20日 前后各 20 只。 */
export function buildMarket(asOf, days, meta, flow, top = 20) {
  const codes = Object.keys(days[asOf]?.shares ?? {})
  const rows = []
  for (const code of codes) {
    const m = meta[code] ?? {}
    const cat = m.cat ?? classify(m.name)
    if (!CATEGORIES.includes(cat)) continue
    rows.push({ ...etfStats(code, asOf, days, flow), name: m.name ?? code, cat })
  }
  const windows = { d1: 'flow1', d5: 'flow5', d20: 'flow20' }
  const slim = (r) => ({ code: r.code, name: r.name, flow1: r.flow1, flow5: r.flow5, flow20: r.flow20, scale: r.scale, streak: r.streak })
  const categories = CATEGORIES.map(cat => {
    const xs = rows.filter(r => r.cat === cat)
    const total = (k) => { const v = xs.map(r => r[k]).filter(x => x !== null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0)) : null }
    const covered = (k) => xs.filter(r => r[k] !== null).length
    const rank = {}
    for (const [w, k] of Object.entries(windows)) {
      const valid = xs.filter(r => r[k] !== null)
      rank[w] = {
        inflow: valid.filter(r => r[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, top).map(slim),
        outflow: valid.filter(r => r[k] < 0).sort((a, b) => a[k] - b[k]).slice(0, top).map(slim),
      }
    }
    return { cat, n: xs.length, flow1: total('flow1'), flow5: total('flow5'), flow20: total('flow20'), covered: { d1: covered('flow1'), d5: covered('flow5'), d20: covered('flow20') }, rank }
  })
  return { n: rows.length, categories }
}

// ---------------------------------------------------------------------------
// 指数调仓：中证指数官网公告（定期调整结果）+ 附件 PDF 文本解析
// ---------------------------------------------------------------------------
export const CSI_LIST_URL = 'https://www.csindex.com.cn/csindex-home/announcement/queryAnnouncementByVo'
export const csiDetailUrl = (id) => `https://www.csindex.com.cn/csindex-home/announcement/queryAnnouncementById?id=${id}&lang=cn`
export const csiPageUrl = (id) => `https://www.csindex.com.cn/#/about/newsDetail?id=${id}`
export const REBALANCE_TITLE = /(沪深300|上证50|科创50).*定期调整结果的公告/
const zh2date = (s) => { const m = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(s); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null }
/** 公告正文 → 生效日、各指数更换数量。 */
export function parseAnnouncementContent(html) {
  const text = String(html ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, '')
  const eff = /于(\d{4}年\d{1,2}月\d{1,2}日)收市后生效/.exec(text)
  const expected = {}
  for (const m of text.matchAll(/([一-龥A-Za-z0-9]+?)指数更换(\d+)只样本/g)) {
    const name = m[1].replace(/^(其中|，|、)+/, '')
    expected[name] = Number(m[2])
  }
  return { effectiveDate: eff ? zh2date(eff[1]) : null, expected }
}
/** 附件 PDF 文本 → [{ index, out:[{code,name}], in:[{code,name}] }]。 */
export function parseAdjustText(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const out = []
  let cur = null
  for (const line of lines) {
    if (/^附件/.test(line)) { cur = null; continue }
    const head = /^(.+?)指数样本调整名单[：:]?$/.exec(line)
    if (head) { cur = { index: head[1].replace(/\s+/g, ''), out: [], in: [] }; out.push(cur); continue }
    if (/名单/.test(line) && !/^调出名单/.test(line)) { cur = null; continue }
    if (!cur) continue
    const m = /^(\d{6})\s+(.+?)\s+(\d{6})\s+(.+)$/.exec(line)
    if (m) { cur.out.push({ code: m[1], name: m[2].replace(/\s+/g, '') }); cur.in.push({ code: m[3], name: m[4].replace(/\s+/g, '') }); continue }
    const one = /^(\d{6})\s+(.+)$/.exec(line)
    if (one) cur.out.push({ code: one[1], name: one[2].replace(/\s+/g, '') }) // 单列行（调出多于调入时）
  }
  return out
}
/** 校验：公告写明的更换数量必须与名单一致，否则整份公告标记为 pending。 */
export function buildRebalance(ann, content, text) {
  const { effectiveDate, expected } = parseAnnouncementContent(content)
  const base = { id: String(ann.id), title: ann.title, publishDate: ann.publishDate, effectiveDate, url: csiPageUrl(ann.id), attachmentUrl: ann.attachmentUrl ?? null }
  if (!text) return { ...base, status: 'pending', indexes: [] }
  const indexes = parseAdjustText(text)
  // 公告正文列出的每个指数都必须在附件名单里且数量一致；附件里只解析出一部分时整份标 pending，不当作已解析
  const ok = indexes.length > 0 && Object.keys(expected).length > 0 && indexes.every(x => x.out.length === x.in.length && (expected[x.index] === undefined || expected[x.index] === x.in.length))
    && Object.entries(expected).every(([k, n]) => { const x = indexes.find(i => i.index === k); return !!x && x.in.length === n })
  return ok ? { ...base, status: 'parsed', indexes } : { ...base, status: 'pending', indexes: [] }
}

/**
 * 交易所当日 ETF 份额是否完整：与参照日（同日已存档或前一交易日）的条数比，最多允许少 tolerance（默认 3%）。
 * ETF 每天新增 / 退市只有几只，条数明显变少说明数据被截断。没有参照时只用 300 条下限兜底。
 */
export function universeOk(count, refCount, tolerance = 0.03) {
  if (!(count >= 300)) return false
  return !(refCount > 0) || count >= Math.floor(refCount * (1 - tolerance))
}
/** 某交易所在某日存档里的条数（按代码前缀区分沪深） */
export const exchangeCount = (day, ex) => (day?.src?.[ex] ? Object.keys(day.shares ?? {}).filter(c => exchangeOf(c) === ex).length : null)

/**
 * 是否用本次结果替换已发布的文件：已发布的 asOf 更晚（DATE 历史重跑）不替换；
 * 同一天时本次缺价格的只数更多、或份额条数更少就不替换。旧文件没有 quality 时允许替换。
 */
export function shouldReplace(prev, next) {
  if (!prev?.asOf) return true
  if (prev.asOf !== next.asOf) return prev.asOf < next.asOf
  const a = prev.quality, b = next.quality
  if (!a || !b) return true
  // 已发布的是深交所缺席的降级版（szse=0），本次补齐了深交所：只要沪市条数不变少就替换（降级版的宽基缺失只数只算了沪市，不可比）
  if (!(a.szse > 0) && b.szse > 0) return !(b.sse < a.sse)
  return !(b.priceMissing > a.priceMissing || b.sse < a.sse || b.szse < a.szse || b.broadMissing > a.broadMissing)
}
/** 归档清理：保留 asOf 往前 keep 个交易日，以及所有晚于 asOf 的文件（历史重跑不能删掉更新的存档） */
export const keepArchive = (d, asOf, keepSet) => keepSet.has(d) || (validDate(d) && d > asOf)

/** 目标交易日：交易日北京 15:30 后取当天，否则取上一交易日。 */
export function targetDate(now = new Date()) {
  const bj = new Date(now.getTime() + 8 * 3600e3)
  const today = bj.toISOString().slice(0, 10)
  const after = bj.getUTCHours() * 60 + bj.getUTCMinutes() >= 930
  return isTradingDay(today) && after ? today : prevTradingDay(today)
}
export { isTradingDay, prevTradingDay }
