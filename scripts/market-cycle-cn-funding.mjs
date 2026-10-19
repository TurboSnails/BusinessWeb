// Financing purchases / total mainland A-share and listed-fund turnover, same session, RMB.
// A listed bond ETF is a fund in both exchanges' classification; direct bonds, B-shares,
// preferred shares, repo and options are excluded. This is a whole-market background for CSI300.
export const CN_MARGIN_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_RZRQ_LSHJ&columns=DIM_DATE%2CRZMRE&pageSize=5&sortColumns=DIM_DATE&sortTypes=-1'
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
  // Unit comes from the actual official page JS table header 成交额(亿元), not a guessed factor.
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
// Narrow public parsers shared with the 53-week turnover collector.
export function parseSseTurnover(body, date) { const r = parseSseFundingTurnover(body, date); return { date: r.date, amountYi: r.turnoverYi } }
export function parseSzseTurnover(body, date) { const r = parseSzseFundingTurnover(body, date); return { date: r.date, amountYi: r.turnoverYi } }
export function computeCnFinancingRatio(margin, sse, szse) {
  if (!dateOK(margin?.date) || margin.date !== sse?.date || margin.date !== szse?.date) throw new Error('融资与两所成交日期必须一致')
  if ([sse, szse].some(r => r.unit !== '亿元人民币' || r.scope !== 'a_shares_and_all_listed_funds' || typeof r.turnoverYi !== 'number' || !Number.isFinite(r.turnoverYi) || r.turnoverYi <= 0)) throw new Error('成交额单位/覆盖范围/分母无效')
  if (typeof margin.valueYuan !== 'number' || !Number.isFinite(margin.valueYuan) || margin.valueYuan < 0) throw new Error('融资买入额无效')
  const denominatorYi = Number((sse.turnoverYi + szse.turnoverYi).toFixed(2)), numeratorYi = margin.valueYuan / 1e8
  const value = numeratorYi / denominatorYi * 100
  if (value > 100) throw new Error('融资买入额超过市场成交额')
  return { date: margin.date, value, denominatorYi, numeratorYi }
}
export async function collectCnFunding(ctx) {
  try {
    const body = await ctx.get(CN_MARGIN_URL)
    if (!body?.success || !Array.isArray(body.result?.data) || !body.result.data.length) throw new Error('融资买入额响应无效')
    const rows = body.result.data.map(r => ({ date: String(r?.DIM_DATE ?? '').slice(0, 10), valueYuan: r?.RZMRE }))
    if (rows.some(r => !dateOK(r.date) || typeof r.valueYuan !== 'number' || !Number.isFinite(r.valueYuan) || r.valueYuan < 0) || new Set(rows.map(r => r.date)).size !== rows.length) throw new Error('融资日期/金额无效或重复')
    const margin = rows.sort((a, b) => b.date.localeCompare(a.date))[0]
    const age = (Date.parse(ctx.now.slice(0, 10)) - Date.parse(margin.date)) / 864e5
    if (age < 0 || age > 14) throw new Error('融资观测为未来或已超14天')
    const urls = cnTurnoverUrls(margin.date)
    const [shBody, szBody] = await Promise.all([ctx.get(urls.sse, { headers: { Referer: 'https://www.sse.com.cn/' } }), ctx.get(urls.szse, { headers: { Referer: 'https://www.szse.cn/' } })])
    const sh = parseSseFundingTurnover(shBody, margin.date), sz = parseSzseFundingTurnover(szBody, margin.date)
    const ratio = computeCnFinancingRatio(margin, sh, sz)
    const common = { market: 'csi300', observationDate: margin.date, kind: 'observed', frequency: 'daily' }
    const description = `沪深全市场融资买入额${ratio.numeratorYi.toFixed(2)}亿元人民币（股票/基金，含ETF）÷同日沪深A股与全部上市基金成交额${ratio.denominatorYi.toFixed(2)}亿元人民币×100；沪市主板A ${sh.parts['主板A'].toFixed(2)}+科创板${sh.parts['科创板'].toFixed(2)}+基金${sh.parts['基金'].toFixed(2)}，深市主板A ${sz.parts['主板A股'].toFixed(2)}+创业板A ${sz.parts['创业板A股'].toFixed(2)}+基金${sz.parts['基金'].toFixed(2)}；不含B股、直接债券、优先股、回购、期权，债券ETF仍归基金；分母含非融资标的的A股与基金，非融资标的内部杠杆占比，也非沪深300成分股专属。融资来源：${CN_MARGIN_URL}；沪市分类：${urls.sse}；深市分类：${urls.szse}`
    return [
      { ...common, metricId: 'financing_buy_ratio_pct', value: round(ratio.value), unit: '%', source: CN_MARGIN_URL, description },
      { ...common, metricId: 'cn_turnover_yi', value: ratio.denominatorYi, unit: '亿元', source: urls.sse, description },
    ]
  } catch (e) { ctx.issue(`cn-funding: ${e instanceof Error ? e.message : String(e)}`); return [] }
}
