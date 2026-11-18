import test from 'node:test'
import assert from 'node:assert/strict'
import { num, validDate, snapshotAllowed, parseKline, parseKlines, intervalStats, monthlyReturns, cyq, quantile, valuationBand, parseValuation, mergeUniverse, parseTop, parseLhb } from './kpl-stock-lib.mjs'

const bar = (date, close, extra = {}) => ({ date, open: close, close, high: close, low: close, volume: 100, amount: close * 10000, turnover: 50, pct: 0, ...extra })
const stock = (code, lists = ['zt']) => ({ code, name: code, industry: '', pct: 1, lists })

test('数字与日期：空值不当零；拒绝无效日期、盘前快照和跨日', () => {
  for (const v of [null, undefined, '', ' ', '-', 'oops', Infinity, true]) assert.equal(num(v), null)
  assert.equal(num('0'), 0)
  assert.equal(validDate('2026-02-30'), false)
  assert.equal(validDate('2026-11-18'), true)
  assert.equal(snapshotAllowed('2026-11-18', new Date('2026-11-18T07:10:00Z')), true)
  for (const now of ['2026-11-18T07:09:59Z', '2026-11-19T07:10:00Z']) assert.equal(snapshotAllowed('2026-11-18', new Date(now)), false)
  assert.equal(snapshotAllowed('2026-11-21', new Date('2026-11-21T08:00:00Z')), false)
})

test('K 线字段顺序、缺失换手与缺失成交额；拒绝错码、未来日期及重复乱序', () => {
  const row = parseKline('2026-11-18,10,12,13,9,100,110000,40,20,2,5')
  assert.deepEqual(row, { date: '2026-11-18', open: 10, close: 12, high: 13, low: 9, volume: 100, amount: 110000, pct: 20, turnover: 5 })
  assert.equal(parseKline('2026-11-18,10,12,13,9,100,-').turnover, null)
  assert.equal(parseKline('2026-11-18,10,12,13,9,100,-').amount, null)
  assert.throws(() => parseKline('2026-02-30,1,1,1,1'))
  const body = { data: { code: '600000', klines: ['2026-11-18,10,12,13,9,100,110000,40,20,2,5'] } }
  assert.equal(parseKlines(body, '600000', '2026-11-18').length, 1)
  assert.throws(() => parseKlines(body, '000001', '2026-11-18'))
  assert.throws(() => parseKlines(body, '600000', '2026-11-17'))
  assert.throws(() => parseKlines({ data: { ...body.data, klines: [...body.data.klines, ...body.data.klines] } }, '600000', '2026-11-18'))
  assert.throws(() => parseKlines({ data: { code: '600000', klines: [] } }, '600000', '2026-11-18'))
})

test('区间按 N 个交易日与 N 日前收盘比较；回撤含基期，缺数据不缩短窗口', () => {
  const rows = [bar('2026-11-16', 10), bar('2026-11-17', 12, { high: 13, low: 11, amount: 100, turnover: 10 }), bar('2026-11-18', 9, { high: 10, low: 8, amount: 200, turnover: 20 })]
  assert.deepEqual(intervalStats(rows, [2])[0], { days: 2, from: '2026-11-17', to: '2026-11-18', change: -10, drawdown: 25, amplitude: 50, avgTurnover: 15, amount: 300 })
  assert.equal(intervalStats(rows, [5])[0].change, null)
  const missing = intervalStats([rows[0], { ...rows[1], turnover: null, amount: null }, rows[2]], [2])[0]
  assert.equal(missing.avgTurnover, null)
  assert.equal(missing.amount, null)
})

test('月收益用上月末收盘；不足基期为空，当前月标明未完结，最多 24 个月', () => {
  const rows = [bar('2026-09-30', 10), bar('2026-10-30', 12), bar('2026-11-18', 9)]
  assert.deepEqual(monthlyReturns(rows, '2026-11-18'), [
    { date: '2026-09-30', value: null, partial: false }, { date: '2026-10-30', value: 20, partial: false }, { date: '2026-11-18', value: -25, partial: true },
  ])
  assert.equal(monthlyReturns([bar('2023-09-28', 10), bar('2026-11-18', 9)], '2026-11-18').length, 1)
  assert.equal(monthlyReturns([bar('2026-09-30', 10), bar('2026-11-18', 9)], '2026-11-18').at(-1).value, null)
})

test('CYQ 手算：10 元全仓后，20 元换手 50%，两处各半，均价 15、获利 50%', () => {
  const result = cyq([bar('2026-11-17', 10), bar('2026-11-18', 20)], 3)
  assert.deepEqual(result.buckets, [{ price: 10, weight: 0.5 }, { price: 15, weight: 0 }, { price: 20, weight: 0.5 }])
  assert.equal(result.average, 15)
  assert.equal(result.profit, 50)
  assert.deepEqual(result.range90, { low: 10, high: 20, concentration: 1 / 3 })
  assert.equal(result.seedWeight, 0.5)
})

test('CYQ 三角分布用桶边界积分；换手封顶 100%，一字日与缺失均有定义', () => {
  const tri = cyq([bar('2026-11-18', 1, { low: 0, high: 2, amount: 10000 })], 3)
  assert.deepEqual(tri.buckets.map(x => x.weight), [0.125, 0.75, 0.125])
  assert.equal(cyq([bar('2026-11-18', 10)]).buckets.length, 50)
  assert.equal(cyq([bar('2026-11-17', 10), bar('2026-11-18', 20, { turnover: 200 })], 3).average, 20)
  assert.equal(cyq([bar('2026-11-18', 10, { turnover: null })]), null)
  assert.equal(cyq([]), null)
})

test('分位与估值带：线性分位、并列中秩；亏损 PE 不适用，PB 独立保留', () => {
  assert.equal(quantile([1, 2, 3, 4], 0.25), 1.75)
  assert.equal(quantile([], 0.5), null)
  const result = valuationBand([{ date: '2026-11-16', pe: 10, pb: 1 }, { date: '2026-11-17', pe: 20, pb: 2 }, { date: '2026-11-18', pe: 20, pb: 3 }], 'pe')
  assert.deepEqual(result.levels, [10, 15, 20, 20, 20])
  assert.ok(Math.abs(result.percentile - 200 / 3) < 1e-8)
  const loss = valuationBand([{ date: '2026-11-17', pe: 10, pb: 1 }, { date: '2026-11-18', pe: -2, pb: 2 }], 'pe')
  assert.equal(loss.status, 'loss')
  assert.equal(loss.percentile, null)
  assert.equal(loss.points.at(-1).value, null)
  assert.equal(valuationBand([{ date: '2026-11-18', pe: null, pb: 2 }], 'pe').status, 'missing')
  assert.equal(valuationBand([{ date: '2026-11-18', pe: 0, pb: 2 }], 'pe').status, 'missing')
})

test('估值按代码、日期验证：允许报告滞后，拒绝未来、重复日期和混码', () => {
  const row = { SECURITY_CODE: '600000', TRADE_DATE: '2026-11-17 00:00:00', PE_TTM: '-', PB_MRQ: 0.5 }
  assert.deepEqual(parseValuation([row], '600000', '2026-11-18'), [{ date: '2026-11-17', pe: null, pb: 0.5 }])
  assert.throws(() => parseValuation([{ ...row, SECURITY_CODE: '000001' }], '600000', '2026-11-18'))
  assert.throws(() => parseValuation([row], '600000', '2026-11-16'))
  assert.throws(() => parseValuation([row, row], '600000', '2026-11-18'))
})

test('股票池：并集去重来源、保留前 10 交易日、优先当日和最近、封顶 600', () => {
  const old = { days: { '2026-11-03': [stock('000001')], '2026-11-04': [stock('000002')], '2026-11-17': [stock('000003')] } }
  const merged = mergeUniverse([stock('600000'), stock('600000', ['lhb']), stock('600001', ['amount'])], old, '2026-11-18', 3)
  assert.deepEqual(merged.stocks.map(x => x.code), ['600000', '600001', '000003'])
  assert.deepEqual(merged.stocks[0].lists, ['zt', 'lhb'])
  assert.equal(merged.stocks[2].lists.length, 0)
  assert.equal(merged.stocks[2].lastSeen, '2026-11-17')
  assert.equal(merged.days['2026-11-03'], undefined)
  assert.ok(mergeUniverse([], old, '2026-11-18').stocks.some(x => x.code === '000002'))
  assert.throws(() => mergeUniverse([stock('600000'), stock('600001')], {}, '2026-11-18', 1))
  assert.throws(() => mergeUniverse([stock('bad')], {}, '2026-11-18'))
})

test('成交额与龙虎榜字段：全量校验和日期校验，空榜视为未发布', () => {
  const rows = [{ symbol: 'sh600000', name: '浦发银行', amount: '100', changepercent: '-', trade: '10' }]
  assert.equal(parseTop(rows, 1)[0].pct, null)
  assert.throws(() => parseTop(rows, 100))
  assert.throws(() => parseTop([...rows, ...rows], 2))
  assert.throws(() => parseLhb([], '2026-11-18'))
  assert.throws(() => parseLhb([{ SECURITY_CODE: '600000', SECURITY_NAME_ABBR: '浦发银行', TRADE_DATE: '2026-11-17' }], '2026-11-18'))
  assert.equal(parseLhb([{ SECURITY_CODE: '600000', SECURITY_NAME_ABBR: '浦发银行', TRADE_DATE: '2026-11-18 00:00:00', CHANGE_RATE: '-' }], '2026-11-18')[0].pct, null)
})

// 发布链路使用临时目录与公开来源形状的假响应，不能写入 public 的生产数据。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { run } from './kpl-stock.mjs'
const now = new Date('2026-11-18T10:30:00Z')
function sourceFixture({ failKline = false, loss = false, absentLhb = false } = {}) {
  let active = 0, max = 0, fullKlines = 0
  const rows = Array.from({ length: 160 }, (_, i) => ({ symbol: `sz${String(i + 1).padStart(6, '0')}`, name: `样本${i}`, amount: 1e10 - i, trade: 10, changepercent: 0 }))
  const get = async raw => {
    const url = new URL(raw)
    active++; max = Math.max(max, active)
    await new Promise(resolve => setTimeout(resolve, 1))
    try {
      if (url.hostname === 'push2ex.eastmoney.com') return { rc: 0, data: { qdate: 20261118, tc: 1, pool: [{ c: '000001', n: '样本0', zdp: 0, hybk: '银行' }] } }
      if (url.hostname.includes('sina')) return rows.slice((Number(url.searchParams.get('page')) - 1) * 80, Number(url.searchParams.get('page')) * 80)
      if (url.hostname.includes('push2his')) {
        if (url.searchParams.has('lmt') && url.searchParams.get('beg') !== '20261118') throw new Error('增量检查必须同时约束 beg；真实接口会忽略 lmt')
        if (failKline) throw new Error('模拟日 K 中断')
        if (!url.searchParams.has('lmt')) fullKlines++
        const code = url.searchParams.get('secid').slice(2)
        return { data: { code, klines: ['2026-11-17,10,10,10,10,100,100000,0,0,0,50', '2026-11-18,10,10,10,10,100,100000,0,0,0,50'].slice(url.searchParams.has('lmt') ? -1 : 0) } }
      }
      const isLhb = url.searchParams.get('reportName') === 'RPT_DAILYBILLBOARD_DETAILSNEW'
      const code = url.searchParams.get('filter').match(/SECURITY_CODE="(\d+)"/)?.[1]
      const data = isLhb ? absentLhb ? [] : [{ SECURITY_CODE: '000001', SECURITY_NAME_ABBR: '样本0', TRADE_DATE: '2026-11-18 00:00:00', CHANGE_RATE: 0 }] : [{ SECURITY_CODE: code, TRADE_DATE: '2026-11-18 00:00:00', PE_TTM: loss ? -1 : 10, PB_MRQ: 1, BOARD_NAME: '行业样本' }]
      return { success: true, result: { data, count: data.length, pages: 1 } }
    } finally { active-- }
  }
  return { get, stats: () => ({ max, fullKlines }) }
}

test('完整发布：≤6 并发、索引大小、行业/概念来源、分片可复用、清理退出股票', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kpl-stock-'))
  try {
    fs.mkdirSync(path.join(root, 'public/data'), { recursive: true })
    fs.writeFileSync(path.join(root, 'public/data/kpl-plates.json'), JSON.stringify({ groups: { concept: [{ name: '公开概念', stocks: [{ code: '000001' }] }] } }))
    const fixture = sourceFixture()
    const result = await run({ now, root, get: fixture.get })
    assert.equal(result.written, true, result.reason)
    assert.equal(result.stocks, 100)
    assert.ok(result.indexBytes < 150 * 1024)
    assert.ok(fixture.stats().max <= 6)
    const file = path.join(root, 'public/data/kpl-stock-000.json')
    let detail = JSON.parse(fs.readFileSync(file))
    assert.equal(detail['000001'].industry, '银行')
    assert.equal(detail['000002'].industry, '行业样本')
    assert.deepEqual(detail['000001'].concepts, ['公开概念'])
    fs.writeFileSync(path.join(root, 'public/data/kpl-stock-999.json'), '{}')
    detail['999999'] = detail['000001']
    fs.writeFileSync(file, JSON.stringify(detail))
    const second = await run({ now, root, get: fixture.get })
    assert.equal(second.reused, 100)
    assert.equal(fixture.stats().fullKlines, 100)
    assert.equal(fs.existsSync(path.join(root, 'public/data/kpl-stock-999.json')), false)
    detail = JSON.parse(fs.readFileSync(file))
    assert.equal(detail['999999'], undefined)
    assert.equal(second.valuationMissing, 0)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('必需源未齐与日 K 失败不写任何生产文件，已发布文件逐字保留', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kpl-stock-'))
  try {
    fs.mkdirSync(path.join(root, 'public/data'), { recursive: true })
    const out = path.join(root, 'public/data/kpl-stock.json')
    fs.writeFileSync(out, '{"old":true}')
    for (const fixture of [sourceFixture({ failKline: true })]) {
      const result = await run({ now, root, get: fixture.get })
      assert.equal(result.written, false)
      assert.equal(fs.readFileSync(out, 'utf8'), '{"old":true}')
      assert.equal(fs.existsSync(path.join(root, 'data-raw/kpl-stock/universe.json')), false)
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('估值缺失可发布，负 PE 保留亏损状态，运行预算不足拒绝发布', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kpl-stock-'))
  try {
    const fixture = sourceFixture({ loss: true })
    const result = await run({ now, root, get: fixture.get })
    assert.equal(result.written, true, result.reason)
    const detail = JSON.parse(fs.readFileSync(path.join(root, 'public/data/kpl-stock-000.json')))
    assert.equal(detail['000001'].valuation.pe.status, 'loss')
    assert.equal(detail['000001'].valuation.pb.status, 'ok')
    const out = fs.readFileSync(path.join(root, 'public/data/kpl-stock.json'), 'utf8')
    const timed = await run({ now, root, get: fixture.get, budgetMs: 1 })
    assert.equal(timed.written, false)
    assert.equal(fs.readFileSync(path.join(root, 'public/data/kpl-stock.json'), 'utf8'), out)
    fs.rmSync(path.join(root, 'public/data/kpl-stock-000.json'))
    const missing = await run({ now, root, get: async url => url.includes('RPT_VALUEANALYSIS_DET') ? { code: 9201 } : fixture.get(url) })
    assert.equal(missing.written, true)
    assert.equal(missing.valuationMissing, 100)
    const missingDetail = JSON.parse(fs.readFileSync(path.join(root, 'public/data/kpl-stock-000.json')))
    assert.equal(missingDetail['000001'].valuation, null)
    assert.match(missingDetail['000001'].valuationReason, /报告为空/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('真实上限 600 保留当日 200 只和最近历史股票；24 月窗口不带入更早月份', () => {
  const current = Array.from({ length: 200 }, (_, i) => stock(String(i + 1).padStart(6, '0')))
  const historical = Array.from({ length: 500 }, (_, i) => stock(String(i + 1001).padStart(6, '0')))
  const merged = mergeUniverse(current, { days: { '2026-11-17': historical } }, '2026-11-18')
  assert.equal(merged.stocks.length, 600)
  assert.equal(merged.stocks.filter(s => s.lists.length).length, 200)
  const rows = Array.from({ length: 36 }, (_, i) => {
    const d = new Date(Date.UTC(2023, i + 12, 0))
    return bar(d.toISOString().slice(0, 10), 10 + i)
  })
  const months = monthlyReturns(rows, '2026-10-30')
  assert.ok(months.length <= 24)
  assert.ok(months.every(m => m.date >= '2024-11-01'))
})

test('龙虎榜未发布时照常发布并标记 lhbPending，之后的运行补入龙虎榜', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kpl-stock-'))
  try {
    const result = await run({ now, root, get: sourceFixture({ absentLhb: true }).get })
    assert.equal(result.written, true, result.reason)
    const index = JSON.parse(fs.readFileSync(path.join(root, 'public/data/kpl-stock.json'), 'utf8'))
    assert.equal(index.lhbPending, true)
    assert.ok(index.stocks.every(r => !r.lists.includes('lhb')))
    const later = await run({ now, root, get: sourceFixture().get })
    assert.equal(later.written, true, later.reason)
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'public/data/kpl-stock.json'), 'utf8')).lhbPending, false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
