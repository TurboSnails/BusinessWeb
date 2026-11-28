import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeSymbol,
  marketOf,
  parseYahooSearchQuotes,
  parseYahooChartBars,
  quoteFromYahooMeta,
  aggregateUs4h,
  aggregateCnHk4h,
  computeHasMore,
  classifyNews,
  classifyNewsTopic,
  classifyNewsSentiment,
  parseTencentQuote,
  parseTencentDayRows,
  parseTencentMklineRows,
  parseRegShoText,
  parseFinraAtsRows,
  parseAnalystData,
  lookupError,
  yahooBarsPlan,
  upstreamFail,
  markYahooRateLimit,
  isYahooRateLimited,
  resetYahooRateLimit,
} from './stockLookup.mjs'

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/features/stock-lookup/fixtures')
const load = (name) => JSON.parse(fs.readFileSync(path.join(fixtures, name), 'utf8'))

test('normalizeSymbol：美股 / 沪深 / 港股', () => {
  assert.equal(normalizeSymbol('MRVL'), 'MRVL')
  assert.equal(normalizeSymbol('brk.b'), 'BRK.B')
  assert.equal(normalizeSymbol('600519'), 'sh600519')
  assert.equal(normalizeSymbol('000858'), 'sz000858')
  assert.equal(normalizeSymbol('700'), 'hk00700')
  assert.equal(normalizeSymbol('hk700'), 'hk00700')
  assert.equal(normalizeSymbol('sh600519'), 'sh600519')
  assert.equal(normalizeSymbol(''), null)
  assert.equal(marketOf('MRVL'), 'us')
  assert.equal(marketOf('sh600519'), 'cn')
  assert.equal(marketOf('hk00700'), 'hk')
})

test('LookupError 形状', () => {
  assert.deepEqual(lookupError('upstream'), { error: '上游数据源暂时不可用', reason: 'upstream' })
  assert.equal(lookupError('not-found', '自定义').reason, 'not-found')
})

test('Yahoo 429：upstream + 缓存，并进入冷却', () => {
  resetYahooRateLimit()
  const headers = { get: (k) => (k.toLowerCase() === 'retry-after' ? '45' : null) }
  const fail = upstreamFail({ status: 429, headers })
  assert.equal(fail.status, 502)
  assert.equal(fail.cache, 60)
  assert.equal(fail.body.reason, 'upstream')
  assert.match(fail.body.error, /限流/)
  assert.equal(isYahooRateLimited(), true)
  resetYahooRateLimit()
  assert.equal(isYahooRateLimited(), false)
  markYahooRateLimit('30')
  assert.equal(isYahooRateLimited(), true)
  resetYahooRateLimit()
})

test('Yahoo search 样本 → SymbolHit', () => {
  const hits = parseYahooSearchQuotes(load('yahoo-search-MRVL.json'))
  assert.ok(hits.some(h => h.symbol === 'MRVL' && h.market === 'us'))
  assert.ok(hits.every(h => h.symbol && h.name && h.market))
})

test('Yahoo chart meta → Quote；bars 含 ext 标记能力', () => {
  const raw = load('yahoo-chart-MRVL-1m.json')
  const wrapped = { chart: { result: [raw] } }
  const { meta, bars } = parseYahooChartBars(wrapped, { includeExt: true })
  assert.ok(bars.length > 0)
  assert.ok(bars.every(b => b.t && b.o && b.h && b.l && b.c >= 0))
  // 样本前几根是盘前（09:30 前）
  assert.equal(bars[0].ext, true)
  const quote = quoteFromYahooMeta('MRVL', meta, bars)
  assert.equal(quote.symbol, 'MRVL')
  assert.equal(quote.currency, 'USD')
  assert.ok(Number.isFinite(quote.price))
  assert.ok(quote.timezone)
})

test('4h 聚合：按美东 9:30 起每 4 小时', () => {
  // 构造同一天 ET 的 1h bars：9:30、10:30、11:30、12:30 → 一桶；13:30、14:30 → 下一桶
  // 用固定偏移近似：2024-06-03 是夏令时 EDT=UTC-4
  const t0 = Date.parse('2024-06-03T13:30:00Z') / 1000 // 9:30 EDT
  const bars = [
    { t: t0, o: 10, h: 11, l: 9, c: 10.5, v: 100 },
    { t: t0 + 3600, o: 10.5, h: 12, l: 10, c: 11, v: 110 },
    { t: t0 + 2 * 3600, o: 11, h: 12, l: 10.5, c: 11.5, v: 120 },
    { t: t0 + 3 * 3600, o: 11.5, h: 13, l: 11, c: 12, v: 130 },
    { t: t0 + 4 * 3600, o: 12, h: 14, l: 11.5, c: 13, v: 140 }, // 13:30
    { t: t0 + 5 * 3600, o: 13, h: 14, l: 12, c: 13.5, v: 150 },
  ]
  const out = aggregateUs4h(bars)
  assert.equal(out.length, 2)
  assert.equal(out[0].o, 10)
  assert.equal(out[0].c, 12)
  assert.equal(out[0].h, 13)
  assert.equal(out[0].l, 9)
  assert.equal(out[0].v, 100 + 110 + 120 + 130)
  assert.equal(out[1].o, 12)
  assert.equal(out[1].c, 13.5)
  assert.equal(out[1].v, 140 + 150)
})

test('沪深 4h 按交易时段切上午/下午', () => {
  const am = Date.parse('2024-06-03T02:30:00Z') / 1000 // 10:30 CST
  const pm = Date.parse('2024-06-03T06:00:00Z') / 1000 // 14:00 CST
  const bars = [
    { t: am, o: 1, h: 2, l: 1, c: 1.5, v: 10 },
    { t: am + 3600, o: 1.5, h: 2.5, l: 1.2, c: 2, v: 20 },
    { t: pm, o: 2, h: 3, l: 1.8, c: 2.5, v: 30 },
  ]
  const out = aggregateCnHk4h(bars, 'cn')
  assert.equal(out.length, 2)
  assert.equal(out[0].v, 30)
  assert.equal(out[1].v, 30)
})

test('翻页 hasMore：1m 约 30 天边界', () => {
  const now = Math.floor(Date.now() / 1000)
  assert.equal(computeHasMore('1m', now - 5 * 86_400, now - 3650 * 86_400), true)
  assert.equal(computeHasMore('1m', now - 29 * 86_400, now - 3650 * 86_400), false)
  assert.equal(yahooBarsPlan('1m').interval, '1m')
  assert.equal(yahooBarsPlan('4h').interval, '1h')
})

test('新闻关键词：中英文每主题至少 2 例', () => {
  const en = {
    业绩财报: ['Company beats earnings estimates', 'Quarterly results show revenue growth'],
    机构评级: ['Analyst upgrade to overweight', 'Bank initiates coverage with buy'],
    内部交易: ['CEO sold shares in Form 4 filing', 'Insider bought shares under 10b5-1'],
    并购重组: ['Firm announces acquisition of rival', 'Merger deal to buy startup'],
    资本回报: ['Board approves share repurchase', 'Company raises dividend'],
    管理变动: ['CFO resigns effective immediately', 'Board appoints new CEO'],
    产品进展: ['Chipmaker to launch new product', 'FDA approval for device'],
    监管法律: ['SEC launches probe into trading', 'Antitrust lawsuit filed'],
    市场情绪: ['Stock rally on bullish sentiment', 'Shares plunge in selloff'],
    宏观动态: ['Fed signals rate hike path', 'Inflation CPI data surprises'],
  }
  const zh = {
    业绩财报: ['公司发布三季报营收超预期', '年报净利润指引上调'],
    机构评级: ['券商上调目标价至买入', '机构评级下调至卖出'],
    内部交易: ['董监高减持公告披露', '高管增减持计划出炉'],
    并购重组: ['公布重大资产重组预案', '拟并购同业公司'],
    资本回报: ['董事会通过分红派息方案', '宣布股份回购计划'],
    管理变动: ['总经理辞职并任命继任', '董事长卸任公告'],
    产品进展: ['新品发布会亮相芯片', '创新药获批临床'],
    监管法律: ['证监会立案调查通知', '因信息披露遭监管处罚'],
    市场情绪: ['股价大涨资金涌入', '市场情绪转冷暴跌'],
    宏观动态: ['央行宣布降准降息', '美联储加息预期升温'],
  }
  for (const [topic, titles] of Object.entries(en)) {
    assert.ok(titles.length >= 2, topic)
    for (const t of titles) assert.equal(classifyNewsTopic(t, 'en'), topic, t)
  }
  for (const [topic, titles] of Object.entries(zh)) {
    assert.ok(titles.length >= 2, topic)
    for (const t of titles) assert.equal(classifyNewsTopic(t, 'zh'), topic, t)
  }
  assert.equal(classifyNewsSentiment('Stock surges after beat', 'en'), '利好')
  assert.equal(classifyNewsSentiment('Shares plunge on lawsuit', 'en'), '利空')
  assert.equal(classifyNewsSentiment('营收超预期大涨', 'zh'), '利好')
  assert.equal(classifyNewsSentiment('业绩不及预期大跌', 'zh'), '利空')
  assert.equal(classifyNews('random blah', 'en').topic, '未分类')
})

test('腾讯 quote / day / mkline 样本解析', () => {
  const raw = load('tencent-quote-sh600519-hk00700.txt.json').raw
  const sh = parseTencentQuote(raw, 'sh600519')
  const hk = parseTencentQuote(raw, 'hk00700')
  assert.equal(sh?.name, '贵州茅台')
  assert.ok(sh.price > 0)
  assert.equal(hk?.market, 'hk')
  assert.ok(hk.price > 0)

  const day = load('tencent-bars-sh600519-1d.json')
  const bars = parseTencentDayRows(day.rows)
  assert.ok(bars.length >= 5)
  assert.ok(bars[0].t < bars[bars.length - 1].t)

  const m5 = parseTencentMklineRows(load('tencent-bars-sh600519-m5.json').m5)
  assert.ok(m5.length > 0)
  assert.ok(m5.every(b => b.c > 0))
})

test('Yahoo quoteSummary → AnalystData', () => {
  const data = parseAnalystData('MRVL', load('yahoo-quoteSummary-MRVL.json'))
  assert.equal(data.symbol, 'MRVL')
  assert.ok(data.actions.length > 0)
  assert.ok(data.trend.length > 0)
  assert.ok(data.target?.mean)
})

test('FINRA synthetic 解析', () => {
  const sho = load('finra-regsho-MRVL-synthetic.txt.json')
  const daily = parseRegShoText(sho.lines.join('\n'), 'MRVL')
  assert.ok(daily.length >= 3)
  assert.ok(daily[0].shortVolume > 0)
  const ats = parseFinraAtsRows(load('finra-ats-MRVL-synthetic.json').rows, 'MRVL')
  assert.ok(ats.length >= 2)
  assert.ok(ats[0].shares > 0)
})
