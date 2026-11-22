import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bucketBefore, loadMacroPostureData, weeklyBefore } from './data'

type H = [string, number][]
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response
const fail = () => ({ ok: false, status: 500, json: async () => ({}) }) as Response

/** 每隔 step 天一个观测，从 start 起 n 个，值依次 +inc */
function every(start: string, step: number, n: number, v0 = 100, inc = 1): H {
  const out: H = []
  const t0 = Date.parse(`${start}T12:00:00Z`)
  for (let i = 0; i < n; i += 1) out.push([new Date(t0 + i * step * 86_400_000).toISOString().slice(0, 10), v0 + i * inc])
  return out
}
const macro = (history: H, extra: Record<string, unknown> = {}) => ({
  unit: '%', history, latest: { date: history.at(-1)![0], value: history.at(-1)![1] }, ...extra,
})
const pub = (history: H, unit: string, frequency = '日频', extra: Record<string, unknown> = {}) => ({ unit, frequency, history, ...extra })

const ASOF = '2026-11-23'

function files(over: Record<string, unknown> = {}): Record<string, unknown> {
  const weds = every('2026-06-03', 7, 25) // 周三 06-03 … 11-18
  return {
    'macro-us.json': {
      series: {
        gdp: macro([['2026-01-01', 2.0], ['2026-04-01', 2.5], ['2026-07-01', 3.4]]),
        unrate: macro(every('2026-01-01', 31, 10).map(([d, v]) => [`${d.slice(0, 8)}01`, v / 25])),
        sahm: macro([['2026-10-01', 0]], { unit: 'pp' }),
        // 月末抽样 + 最新值：不能冒充周频
        claims: macro([['2026-08-29', 20.8], ['2026-09-26', 20.1], ['2026-10-31', 19.5], ['2026-11-14', 19.8]], { unit: '万人' }),
        corePce: macro([['2026-05-01', 2.8], ['2026-06-01', 2.9], ['2026-07-01', 3.0], ['2026-08-01', 3.0], ['2026-09-01', 3.12]]),
        tenYear: macro([['2026-09-30', 4.8], ['2026-10-30', 4.9], ['2026-11-19', 5.04]]),
        hy: macro([['2026-09-30', 300], ['2026-10-30', 320], ['2026-11-20', 360]], { unit: 'bp' }),
        nfci: macro([['2026-10-30', -0.5], ['2026-11-13', -0.478]], { unit: '' }),
      },
    },
    'us-market-data.json': {
      series: {
        hyDaily: pub(every('2026-08-01', 1, 111, 300), 'bp'), // 到 11-19
        tenYearDaily: pub(every('2026-08-01', 1, 111, 4, 0.01), '%'), // 到 11-19
        baaAaa: pub([['2026-07-01', 0.5], ['2026-08-01', 0.45], ['2026-10-01', 0.47]], '个百分点', '月频'),
        fedAssets: pub(weds.map(([d], i) => [d, 6700 + i]), '十亿美元', '周频'),
        treasuryCash: pub(weds.map(([d]) => [d, 900]), '十亿美元', '周频'),
        overnightRrp: pub(weds.map(([d]) => [d, 1]), '十亿美元'),
        bankReserves: pub(weds.map(([d], i) => [d, 2900 + 2 * i]), '十亿美元', '周频'),
      },
    },
    'macro-masters-fred.json': {
      series: {
        inflationExp: { unit: '%', frequency: 'daily', history: every('2026-08-01', 1, 112, 2, 0.001) },
        cccSpread: { unit: 'bp', frequency: 'daily', history: every('2026-08-01', 1, 111, 1000) },
        fedFunds: { unit: '%', frequency: 'monthly', history: [['2026-07-01', 4.3], ['2026-10-01', 3.88]] },
      },
    },
    'macro-cn.json': {
      series: {
        gdp: macro([['2026-03-01', 5.0], ['2026-09-01', 4.6]]), // 缺 Q2：不能拿 Q1 冒充上一季
        pmi: macro([['2026-07-01', 49.5], ['2026-08-01', 49.4], ['2026-09-01', 49.8], ['2026-10-01', 49.3]], { unit: '' }),
        cpi: macro([['2026-10-01', 0.7]]),
        lpr: macro([['2026-08-20', 3.0], ['2026-11-20', 3.0]]),
      },
    },
    'macro-hk.json': {
      series: {
        hkd: macro([['2026-08-31', 7.8], ['2026-11-13', 7.8459]], { unit: '' }),
        fed: macro([['2026-07-01', 4.3], ['2026-10-01', 3.88]]),
        south: macro([['2026-11-20', 140.9]], { unit: '亿元' }),
      },
    },
    ...over,
  }
}

function fetcherFor(map: Record<string, unknown>, failing: string[] = []) {
  const calls: string[] = []
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    const name = url.split('/').at(-1)!
    if (failing.includes(name) || !(name in map)) return fail()
    return ok(map[name])
  }) as typeof fetch
  return { fetcher, calls }
}

describe('窗口工具', () => {
  it('周窗口拒绝月度抽样，接受漏一周的合理缺口', () => {
    expect(weeklyBefore([['2026-09-26', 1], ['2026-10-31', 2], ['2026-11-14', 3]], 28)).toBeUndefined()
    const weekly = every('2026-08-01', 7, 16).filter((_, i) => i !== 13)
    const b = weeklyBefore(weekly, 28)
    expect(b?.[0]).toBe('2026-10-17')
  })

  it('目标日附近没有观测时不退到更早的点', () => {
    expect(weeklyBefore([['2026-10-01', 1], ['2026-10-08', 1], ['2026-11-12', 2]], 28)).toBeUndefined()
  })

  it('上一季按日历季度取，缺季不顶替', () => {
    expect(bucketBefore([['2026-01-01', 1], ['2026-07-01', 2]], 'quarter', 1)).toBeUndefined()
    expect(bucketBefore([['2026-04-01', 1], ['2026-07-01', 2]], 'quarter', 1)).toEqual(['2026-04-01', 1])
    expect(bucketBefore([['2026-06-01', 1], ['2026-09-01', 2]], 'quarter', 1)).toEqual(['2026-06-01', 1])
  })
})

describe('loadMacroPostureData', () => {
  it('并行读取五个文件，键齐全', async () => {
    const { fetcher, calls } = fetcherFor(files())
    const data = await loadMacroPostureData(fetcher, ASOF)
    expect(calls).toHaveLength(5)
    expect(Object.keys(data.us.metrics).sort()).toEqual([
      'baaAaa', 'bankReserves', 'cccSpread', 'claims', 'corePce', 'fedAssets', 'fedFunds', 'gdp', 'hy',
      'inflationExp', 'netLiquidity', 'nfci', 'rrp', 'sahm', 'tenYear', 'tga', 'unrate',
    ])
    expect(Object.keys(data.cn.metrics).sort()).toEqual(['cpi', 'gdp', 'ip', 'lpr', 'm1m2', 'nmpmi', 'pmi', 'ppi'])
    expect(Object.keys(data.hk.metrics).sort()).toEqual(['cnNmpmi', 'cnPmi', 'fed', 'hkd', 'south'])
    expect(data.hk.metrics.cnPmi).toMatchObject({ value: 49.3, unit: '' })
    expect(data.us.metrics.tga).toMatchObject({ date: '2026-11-18', value: 900 })
    expect(data.us.failedSources).toEqual([])
    expect(data.us.asOf).toBe('2026-11-20')
  })

  it('HY 择新鲜来源：macro-us 更新时用它；单位保持 bp', async () => {
    const data = await loadMacroPostureData(fetcherFor(files()).fetcher, ASOF)
    expect(data.us.metrics.hy).toMatchObject({ date: '2026-11-20', value: 360, unit: 'bp' })
    // macro-us 是月末抽样，周窗口不可得
    expect(data.us.metrics.hy?.changes.fourWeeks).toBeUndefined()
  })

  it('HY/十年期 同日优先日频源，周窗口来自日频', async () => {
    const f = files()
    const us = f['macro-us.json'] as { series: Record<string, unknown> }
    us.series.hy = macro([['2026-10-30', 320], ['2026-11-19', 999]], { unit: 'bp' })
    const data = await loadMacroPostureData(fetcherFor(f).fetcher, ASOF)
    const hy = data.us.metrics.hy!
    expect(hy).toMatchObject({ date: '2026-11-19', value: 410, unit: 'bp' })
    expect(hy.changes.fourWeeks).toEqual({ before: { date: '2026-10-22', value: 382 }, difference: 28 })
    expect(hy.changes.twelveWeeks?.before.date).toBe('2026-08-27')
    const ten = data.us.metrics.tenYear!
    expect(ten.unit).toBe('%')
    expect(ten.changes.fourWeeks?.difference).toBeCloseTo(0.28, 6)
  })

  it('初请月末抽样不冒充周频；threeMonths 用真实三个月前；GDP 用真实前季度', async () => {
    const data = await loadMacroPostureData(fetcherFor(files()).fetcher, ASOF)
    expect(data.us.metrics.claims?.changes).toEqual({})
    expect(data.us.metrics.unrate?.changes.threeMonths?.before.date).toBe('2026-07-01')
    expect(data.us.metrics.corePce?.changes.threeMonths).toEqual({ before: { date: '2026-06-01', value: 2.9 }, difference: 0.22 })
    expect(data.us.metrics.baaAaa?.changes.threeMonths?.before.date).toBe('2026-07-01')
    expect(data.us.metrics.gdp?.changes.lastQuarter).toEqual({ before: { date: '2026-04-01', value: 2.5 }, difference: 0.9 })
    expect(data.cn.metrics.gdp?.changes.lastQuarter).toBeUndefined()
    expect(data.cn.metrics.pmi?.changes.threeMonths).toEqual({ before: { date: '2026-07-01', value: 49.5 }, difference: -0.2 })
    expect(data.cn.metrics.lpr?.changes.threeMonths?.difference).toBe(0)
  })

  it('净流动性复用周三对齐口径并给出 4/12 周变化；准备金同样', async () => {
    const data = await loadMacroPostureData(fetcherFor(files()).fetcher, ASOF)
    const nl = data.us.metrics.netLiquidity!
    expect(nl).toMatchObject({ date: '2026-11-18', value: 6724 - 900 - 1, unit: '十亿美元', stale: false })
    expect(nl.changes.fourWeeks).toEqual({ before: { date: '2026-10-21', value: 6720 - 901 }, difference: 4 })
    expect(nl.changes.twelveWeeks?.difference).toBe(12)
    expect(data.us.metrics.bankReserves?.changes.fourWeeks?.difference).toBe(8)
  })

  it('过滤未来、无效与重复观测', async () => {
    const f = files()
    const fred = f['macro-masters-fred.json'] as { series: Record<string, { history: unknown[] }> }
    fred.series.cccSpread.history.push(['2026-11-30', 9999], ['2026-02-30', 1], ['2026-11-19', null], ['bad'], ['2026-11-19', 1500])
    const data = await loadMacroPostureData(fetcherFor(f).fetcher, ASOF)
    expect(data.us.metrics.cccSpread).toMatchObject({ date: '2026-11-19', value: 1500 })
  })

  it('单源失败好数据仍出，并区分 refresh failed 与 stale', async () => {
    const f = files()
    const hk = f['macro-hk.json'] as { series: Record<string, Record<string, unknown>> }
    hk.series.fed.refreshError = 'timeout'
    const { fetcher } = fetcherFor(f, ['us-market-data.json'])
    const data = await loadMacroPostureData(fetcher, ASOF)
    expect(data.us.failedSources).toEqual(['us-market-data.json'])
    expect(data.us.metrics.hy?.value).toBe(360)
    expect(data.us.metrics.tenYear).toMatchObject({ date: '2026-11-19', value: 5.04, stale: false })
    expect(data.us.metrics.netLiquidity).toBeUndefined()
    expect(data.cn.failedSources).toEqual([])
    // 采集失败但读数仍在：记入 failedSources，不等于过期
    expect(data.hk.failedSources).toEqual(['macro-hk.json:fed'])
    expect(data.hk.metrics.fed?.stale).toBe(false)
    expect(data.hk.metrics.hkd?.stale).toBe(false)
  })

  it('过期按频率判断', async () => {
    const data = await loadMacroPostureData(fetcherFor(files()).fetcher, '2026-12-05')
    expect(data.us.metrics.hy?.stale).toBe(true)
    expect(data.us.metrics.corePce?.stale).toBe(false)
    expect(data.us.metrics.gdp?.stale).toBe(false)
    expect(data.us.metrics.bankReserves?.stale).toBe(true)
  })

  it('只计入页面选用序列的 refreshError，落选候选与无关序列不污染', async () => {
    const f = files()
    const market = f['us-market-data.json'] as { series: Record<string, Record<string, unknown>> }
    const us = f['macro-us.json'] as { series: Record<string, Record<string, unknown>> }
    market.series.hyDaily.refreshError = 'x' // 落选（macro-us 更新）
    market.series.vixDaily = { unit: '点', history: [['2026-11-20', 30]], refreshError: 'x' } // 页面不用
    us.series.tenYear.refreshError = 'x' // 落选（同日优先日频）
    market.series.treasuryCash.refreshError = 'x' // 净流动性与 tga 的输入
    const data = await loadMacroPostureData(fetcherFor(f).fetcher, ASOF)
    expect(data.us.failedSources).toEqual(['us-market-data.json:treasuryCash'])
  })

  it('CN 快照失败时港股的内地景气输入缺失并记入港股 failedSources', async () => {
    const data = await loadMacroPostureData(fetcherFor(files(), ['macro-cn.json']).fetcher, ASOF)
    expect(data.hk.failedSources).toEqual(['macro-cn.json'])
    expect(data.hk.metrics.cnPmi).toBeUndefined()
    expect(data.hk.metrics.hkd).toBeDefined()
  })

  it('整个市场文件失败时该市场为空且 asOf 为 null', async () => {
    const data = await loadMacroPostureData(fetcherFor(files(), ['macro-cn.json']).fetcher, ASOF)
    expect(data.cn).toEqual({
      metrics: Object.fromEntries(['gdp', 'pmi', 'nmpmi', 'ip', 'cpi', 'ppi', 'm1m2', 'lpr'].map(k => [k, undefined])),
      asOf: null,
      failedSources: ['macro-cn.json'],
    })
    expect(data.us.metrics.gdp).toBeDefined()
  })

  it('全部失败报错；结构损坏视为失败', async () => {
    await expect(loadMacroPostureData(fetcherFor({}).fetcher, ASOF)).rejects.toThrow()
    const broken = Object.fromEntries(Object.keys(files()).map(k => [k, { series: null }]))
    await expect(loadMacroPostureData(fetcherFor(broken).fetcher, ASOF)).rejects.toThrow()
  })

  it('真实站内数据可解析，主要读数都在', async () => {
    const names = ['macro-us.json', 'macro-cn.json', 'macro-hk.json', 'us-market-data.json', 'macro-masters-fred.json']
    const real = Object.fromEntries(names.map(n => [n, JSON.parse(readFileSync(resolve(process.cwd(), 'public/data', n), 'utf8'))]))
    const data = await loadMacroPostureData(fetcherFor(real).fetcher, ASOF)
    for (const market of ['us', 'cn', 'hk'] as const) {
      expect(data[market].failedSources).toEqual([])
      for (const [key, m] of Object.entries(data[market].metrics)) expect(m, `${market}.${key}`).toBeDefined()
    }
    expect(data.us.metrics.hy?.changes.fourWeeks).toBeDefined()
    expect(data.us.metrics.netLiquidity?.changes.twelveWeeks).toBeDefined()
    expect(data.us.metrics.claims?.changes.fourWeeks).toBeUndefined()
    expect(data.us.metrics.claims?.changes.twelveWeeks).toBeUndefined()
  })
})
