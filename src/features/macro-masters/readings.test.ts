import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  READING_LABELS,
  READING_THEMES,
  computeNetLiquidity,
  continuousDailySegment,
  directionOf,
  loadReadings,
  sanitizePoints,
  weeklyLastObservations,
} from './readings'
import type { ReadingKey } from './types'

const response = (body: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response

function series(history: [string, number][], extra: Record<string, unknown> = {}) {
  return {
    name: 'x',
    unit: '%',
    source: 'test',
    scope: 'test',
    frequency: '日频',
    history,
    ...extra,
  }
}

function fixtureFiles(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    'us-market-data.json': {
      series: {
        fedAssets: series([['2026-11-04', 6700], ['2026-11-11', 6720], ['2026-11-18', 6740]], { unit: '十亿美元', frequency: '周频' }),
        treasuryCash: series([['2026-11-04', 900], ['2026-11-11', 910], ['2026-11-18', 920]], { unit: '十亿美元', frequency: '周频' }),
        overnightRrp: series([
          ['2026-11-04', 10], ['2026-11-05', 9], ['2026-11-11', 8], ['2026-11-12', 7],
          ['2026-11-18', 5], ['2026-11-19', 4], ['2026-11-20', 3],
        ], { unit: '十亿美元', frequency: '日频' }),
        bankReserves: series([['2026-11-11', 2900], ['2026-11-18', 2950]], { unit: '十亿美元', frequency: '周频' }),
        tenYearDaily: series([['2026-10-20', 4.9], ['2026-11-19', 5.0]], { unit: '%', frequency: '日频' }),
        hyDaily: series([['2026-10-20', 340], ['2026-11-19', 352]], { unit: 'bp', frequency: '日频' }),
        baaAaa: series([['2016-01-01', 1.2], ...decadeWeekly('baa'), ['2026-10-01', 0.47]], { unit: '个百分点', frequency: '周频' }),
        fearGreed: series([['2026-10-20', 40], ['2026-11-20', 10]], { unit: '分', frequency: '日频' }),
        vixDaily: series([['2026-10-20', 18], ['2026-11-20', 30]], { unit: '点', frequency: '日频' }),
        retailBull: series([['2026-10-21', 35], ['2026-11-18', 33]], { unit: '%', frequency: '周频' }),
        retailBear: series([['2026-10-21', 30], ['2026-11-18', 42]], { unit: '%', frequency: '周频' }),
        naaim: series([['2026-08-12', 80], ['2026-08-19', 94]], { unit: '%', frequency: '周频' }),
        managerCash: series([['2026-11-12', 3.6]], { unit: '%', frequency: '月频' }),
        finraDebtYoy: series([['2016-01-31', 10], ...decadeMonthly('debt'), ['2026-10-31', 22]], { unit: '%', frequency: '月频' }),
        spxFactSetFpe: series([['2026-09-30', 19], ['2026-11-13', 18.3]], { unit: '倍', frequency: '周频' }),
        spxForwardEpsChange: series([['2026-11-13', 3.3]], {
          unit: '%',
          frequency: '周频',
          name: '标普 500 预期 EPS 较三季度末变化',
          scope: 'FactSet 周报，未来 12 个月 EPS 估计较 2026 年 9 月 30 日变化',
        }),
        shillerCape: series([...decadeMonthly('cape', 20, 36), ['2026-11-01', 36.4], ['2026-11-20', 36.44]], {
          unit: '倍',
          frequency: '月频',
          scope: '最新月为当月估算',
        }),
      },
    },
    'us-market-breadth.json': {
      breadth: {
        spx: {
          date: '2026-11-20',
          above200: 48.6,
          covered: 500,
          total: 503,
          source: 'test',
          scope: 'spx',
          history: [['2026-10-20', 60], ['2026-11-20', 48.6]],
          netHighs: [['2026-10-20', 2], ['2026-11-20', -5.2]],
          highsLows: { date: '2026-11-20', covered: 500, newHighs: 0, newLows: 26, advancers: 122, decliners: 375, netHighsPct: -5.2 },
        },
      },
    },
    'us-market-slices.json': {
      slices: [{ id: 'spx', history: dailySpx() }],
    },
    'macro-us.json': {
      generatedAt: '2026-11-20',
      source: 'test',
      series: {
        realRate: { unit: 'pp', latest: { date: '2026-09-01', value: 0.63 }, history: [['2026-08-01', 0.7], ['2026-09-01', 0.63]], note: '联邦基金利率减核心 PCE 同比', fred: 'FEDFUNDS − PCEPILFE' },
        curve: { unit: 'pp', latest: { date: '2026-11-20', value: 0.29 }, history: [['2026-10-20', 0.2], ['2026-11-20', 0.29]] },
        nfci: { unit: '', latest: { date: '2026-11-13', value: -0.48 }, history: [['2026-10-16', -0.4], ['2026-11-13', -0.48]] },
        hy: { unit: 'bp', latest: { date: '2026-11-19', value: 352 }, history: [['2026-10-20', 340], ['2026-11-19', 352]] },
        tenYear: { unit: '%', latest: { date: '2026-11-19', value: 5.04 }, history: [['2026-10-20', 4.9], ['2026-11-19', 5.04]] },
        vix: { unit: '', latest: { date: '2026-11-19', value: 28 }, history: [['2026-10-20', 18], ['2026-11-19', 28]] },
      },
    },
    'us-equity-bond-spread.json': {
      generatedAt: '2026-11-20',
      latestReal: { date: '2026-11-18', value: 2.88 },
      real: [['2026-08-05', 2.41], ['2026-11-18', 2.88]],
      rows: [],
    },
    ...overrides,
  }
  return base
}

function decadeMonthly(seed: string, start = 1, end = 2): [string, number][] {
  const out: [string, number][] = []
  for (let y = 2016; y <= 2025; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      const t = (y - 2016) * 12 + m
      const v = start + ((end - start) * t) / 120 + (seed.length % 3) * 0.01
      out.push([`${y}-${String(m).padStart(2, '0')}-01`, Math.round(v * 100) / 100])
    }
  }
  return out
}

/** 近十年周采样（满足 ≥52 点且覆盖率 ≥60% 的分位门槛）。 */
function decadeWeekly(seed: string, start = 1, end = 2): [string, number][] {
  const out: [string, number][] = []
  const begin = Date.parse('2016-01-01T12:00:00Z')
  const stop = Date.parse('2026-10-01T12:00:00Z')
  for (let t = begin, i = 0; t <= stop; t += 7 * DAY, i += 1) {
    const iso = new Date(t).toISOString().slice(0, 10)
    const v = start + ((end - start) * i) / 560 + (seed.length % 3) * 0.01
    out.push([iso, Math.round(v * 100) / 100])
  }
  return out
}

function dailySpx(opts?: { mixWeekly?: boolean }): [string, number][] {
  const out: [string, number][] = []
  const start = Date.parse('2016-01-04')
  for (let i = 0; i < 2600; i += 1) {
    const d = new Date(start + i * DAY)
    const wd = d.getUTCDay()
    if (wd === 0 || wd === 6) continue
    const iso = d.toISOString().slice(0, 10)
    out.push([iso, 2000 + out.length * 1.5])
  }
  if (!opts?.mixWeekly) return out.slice(-900)
  // 前段周线 + 后段约 220 个交易日（不足 250 个均线窗口）
  const daily = out.slice(-220)
  const weekly = out.slice(0, -220).filter((_, i) => i % 5 === 0)
  return [...weekly, ...daily]
}

const DAY = 86_400_000

function mockFetch(files: Record<string, unknown>) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const path = String(url).split('/').pop()!
    if (!(path in files)) return response({}, false)
    return response(files[path])
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('READING_LABELS / themes', () => {
  it('覆盖全部 ReadingKey，含 realYield10', () => {
    const keys = Object.keys(READING_LABELS) as ReadingKey[]
    expect(keys.length).toBe(26)
    expect(READING_LABELS.realYield10).toBe('10 年期 TIPS 实际收益率')
    const themed = new Set(READING_THEMES.flatMap(t => t.keys))
    expect(themed.size).toBe(keys.length)
    expect(READING_THEMES.find(t => t.id === 'rates')?.keys).toContain('realYield10')
  })
})

describe('sanitize / weekly / direction helpers', () => {
  it('过滤未来日、无效日期、去重并排序', () => {
    expect(sanitizePoints([
      ['2026-11-20', 1],
      ['2026-12-01', 9],
      ['2026-11-20', 2],
      ['2026-11-18', Number.NaN],
      ['2026-11-19', 3],
      ['2026-10-xx', 3.5],
      ['2026-02-30', 1],
    ], '2026-11-22')).toEqual([
      ['2026-11-19', 3],
      ['2026-11-20', 2],
    ])
  })

  it('每周取最后一个观测', () => {
    const weekly = weeklyLastObservations([
      ['2026-11-16', 1],
      ['2026-11-17', 2],
      ['2026-11-18', 3],
      ['2026-11-23', 4],
    ])
    expect(weekly).toEqual([
      ['2026-11-18', 3],
      ['2026-11-23', 4],
    ])
  })

  it('方向按相对变化 0.5%，一月前为 0 时用绝对差', () => {
    expect(directionOf(0.002, 0.0018)).toBe('up')
    expect(directionOf(1.002, 1)).toBe('flat')
    expect(directionOf(0.004, 0)).toBe('flat')
    expect(directionOf(0.01, 0)).toBe('up')
  })
})

describe('computeNetLiquidity', () => {
  it('按周三对齐，逆回购取同日或之前最近值，并写明实际逆回购日', () => {
    const fed = [['2026-11-11', 1000], ['2026-11-18', 1100]] as [string, number][]
    const tga = [['2026-11-11', 200], ['2026-11-18', 250]] as [string, number][]
    const rrp = [['2026-11-10', 50], ['2026-11-18', 40]] as [string, number][]
    const reading = computeNetLiquidity(fed, tga, rrp, '2026-11-20')
    expect(reading).toMatchObject({
      key: 'netLiquidity',
      value: 1100 - 250 - 40,
      date: '2026-11-18',
      unit: '十亿美元',
    })
    expect(reading?.source).toContain('市场常用近似')
    expect(reading?.note).toMatch(/周三对齐/)
    expect(reading?.note).toMatch(/逆回购取 11-18/)
  })

  it('非周三资产日跳过；三者对不齐时返回 null', () => {
    const fed = [['2026-11-17', 1000], ['2026-11-18', 1100]] as [string, number][]
    const tga = [['2026-11-18', 250]] as [string, number][]
    const rrp = [['2026-11-18', 40]] as [string, number][]
    expect(computeNetLiquidity(fed, tga, rrp, '2026-11-20')?.date).toBe('2026-11-18')
    expect(computeNetLiquidity([['2026-11-18', 1]], [], [['2026-11-18', 1]], '2026-11-20')).toBeNull()
  })

  it('逆回购超过 7 天不回填：WALCL/TGA 到 11-18、RRP 停在 10-21 时最新周不能标 11-18', () => {
    const fed = [
      ['2026-10-14', 6700], ['2026-10-21', 6710], ['2026-10-28', 6720],
      ['2026-11-04', 6730], ['2026-11-11', 6735], ['2026-11-18', 6741.452],
    ] as [string, number][]
    const tga = [
      ['2026-10-14', 900], ['2026-10-21', 910], ['2026-10-28', 920],
      ['2026-11-04', 930], ['2026-11-11', 940], ['2026-11-18', 916.613],
    ] as [string, number][]
    const rrp = [['2026-10-21', 70]] as [string, number][]
    const reading = computeNetLiquidity(fed, tga, rrp, '2026-11-22', new Date('2026-11-22T20:00:00Z'))
    expect(reading).not.toBeNull()
    expect(reading!.date).not.toBe('2026-11-18')
    // 10-28 相对 RRP 10-21 刚好 7 天，仍可算；11-04 起超限
    expect(reading!.date).toBe('2026-10-28')
    expect(reading!.value).toBe(6720 - 920 - 70)
    expect(reading!.note).toMatch(/逆回购取 10-21/)
    expect(reading!.stale).toBe(true)
  })

  it('输入带 refreshError 时净流动性标 refreshFailed', () => {
    const fed = [['2026-11-18', 1100]] as [string, number][]
    const tga = [['2026-11-18', 250]] as [string, number][]
    const rrp = [['2026-11-18', 40]] as [string, number][]
    const reading = computeNetLiquidity(fed, tga, rrp, '2026-11-20', undefined, { refreshFailed: true })
    expect(reading?.refreshFailed).toBe(true)
  })
})

describe('continuousDailySegment / spxVs200dma', () => {
  it('只保留末段连续日线；漏一个交易日即断开', () => {
    const mixed = dailySpx({ mixWeekly: true })
    const segment = continuousDailySegment(mixed)
    expect(segment.length).toBeGreaterThanOrEqual(200)
    expect(segment.length).toBeLessThan(mixed.length)

    // 2026-11-16(一)…11-18(三) 连续，抽掉 11-17 后末段从 11-18 起
    const withGap: [string, number][] = [
      ['2026-11-12', 1], ['2026-11-13', 2], ['2026-11-16', 3], ['2026-11-18', 4],
    ]
    expect(continuousDailySegment(withGap)).toEqual([['2026-11-18', 4]])
  })
})

describe('loadReadings', () => {
  it('为每个键产出 Reading 或 null，并计算分位/方向/过期', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const fetcher = mockFetch(fixtureFiles())
    const { readings, asOf } = await loadReadings(fetcher)
    expect(asOf).toBeTruthy()
    expect(fetcher).toHaveBeenCalled()
    expect(fetcher.mock.calls.some((call: unknown[]) => String(call[0]).includes('index-history'))).toBe(false)

    expect(readings.fedAssets).toMatchObject({ value: 6740, unit: '十亿美元', date: '2026-11-18' })
    expect(readings.netLiquidity).toMatchObject({ value: 6740 - 920 - 5, date: '2026-11-18' })
    expect(readings.bankReserves?.value).toBe(2950)
    expect(readings.realRate?.value).toBe(0.63)
    expect(readings.realRate?.source).toMatch(/FEDFUNDS/)
    expect(readings.realRate?.source).toMatch(/PCEPILFE/)
    expect(readings.realRate?.label).toBe('实际政策利率')
    expect(readings.realYield10).toMatchObject({ value: 2.88, date: '2026-11-18', unit: '%' })
    expect(readings.tenYear?.value).toBe(5)
    expect(readings.curve10y2y?.value).toBe(0.29)
    expect(readings.nfci?.value).toBe(-0.48)
    expect(readings.hySpread?.value).toBe(352)
    expect(readings.baaAaa?.value).toBe(0.47)
    expect(readings.baaAaa?.percentile).toBeTypeOf('number')
    expect(readings.baaAaa?.percentileYears).toBeTypeOf('number')
    expect(readings.spxAbove200?.value).toBe(48.6)
    expect(readings.netNewHighs?.value).toBe(-5.2)
    expect(readings.advDecLine).toBeNull()
    expect(readings.mcclellan).toBeNull()
    expect(readings.spxVs200dma).toMatchObject({ unit: '%', key: 'spxVs200dma', source: expect.stringContaining('日收盘') })
    expect(readings.spxVs200dma!.value).toBeTypeOf('number')
    expect(readings.spxVs200dma!.percentile).toBeUndefined()
    expect(readings.epsRevision?.value).toBe(3.3)
    expect(readings.epsRevision?.note).toMatch(/未来 12 个月 EPS 预期相对/)
    expect(readings.epsRevision?.note).toMatch(/2026年9月30日|2026 年 9 月 30 日/)
    expect(readings.forwardPe?.value).toBe(18.3)
    expect(readings.cape?.note).toMatch(/估算/)
    expect(readings.vix?.direction).toBe('up')
    expect(readings.fearGreed?.direction).toBe('down')
    expect(readings.vix?.note).toMatch(/近一月方向相对/)
    expect(readings.retailBullBear).toMatchObject({ value: 33 - 42, date: '2026-11-18' })
    expect(readings.naaim?.stale).toBe(true)
    expect(readings.naaim?.note).toContain('公开数据约滞后三个月')
    expect(readings.marginDebtYoy?.value).toBe(22)
    expect(readings.managerCash?.value).toBe(3.6)
    expect(readings.copper).toBeNull()
    expect(readings.copperGold).toBeNull()
  })

  it('混频切片下 200 日线窗口不足 250 时不分位', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const files = fixtureFiles({
      'us-market-slices.json': { slices: [{ id: 'spx', history: dailySpx({ mixWeekly: true }) }] },
    })
    const { readings } = await loadReadings(mockFetch(files))
    expect(readings.spxVs200dma).not.toBeNull()
    expect(readings.spxVs200dma?.percentile).toBeUndefined()
  })

  it('同口径多来源取日期更新者；净新高亦然；VIX 备用来源单位为点', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const files = fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          tenYearDaily: series([['2026-11-10', 4.8]], { unit: '%', frequency: '日频' }),
          vixDaily: series([['2026-11-10', 22]], { unit: '点', frequency: '日频' }),
        },
      },
      'us-market-breadth.json': {
        breadth: {
          spx: {
            date: '2026-11-20',
            above200: 48.6,
            covered: 500,
            total: 503,
            source: 'test',
            scope: 'spx',
            history: [['2026-11-20', 48.6]],
            netHighs: [['2026-11-18', -1]],
            highsLows: { date: '2026-11-20', covered: 500, newHighs: 0, newLows: 26, advancers: 1, decliners: 1, netHighsPct: -5.2 },
          },
        },
      },
    })
    const { readings } = await loadReadings(mockFetch(files))
    expect(readings.tenYear?.value).toBe(5.04)
    expect(readings.tenYear?.date).toBe('2026-11-19')
    expect(readings.vix?.value).toBe(28)
    expect(readings.vix?.unit).toBe('点')
    expect(readings.netNewHighs?.value).toBe(-5.2)
    expect(readings.netNewHighs?.date).toBe('2026-11-20')
  })

  it('过滤未来观测；refreshError 标记 refreshFailed；铜金比单位/双来源与铜时效', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const files = fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          copperDaily: series([
            ['2026-11-19', 4.1],
            ['2026-12-01', 9.9],
          ], { unit: '美元/磅', frequency: '日频' }),
          copperGold: series([
            ['2026-10-23', 0.0018],
            ['2026-11-19', 0.002],
          ], { unit: '倍', frequency: '日频', refreshError: 'HTTP 429', source: 'https://finance.yahoo.com/quote/HG=F/' }),
        },
      },
    })
    const { readings, asOf } = await loadReadings(mockFetch(files))
    expect(asOf <= '2026-11-22').toBe(true)
    expect(readings.copper?.date).toBe('2026-11-19')
    expect(readings.copper?.value).toBe(4.1)
    expect(readings.copperGold?.refreshFailed).toBe(true)
    expect(readings.copperGold?.unit).toContain('铜（美元/磅）')
    expect(readings.copperGold?.source).toMatch(/HG=F/)
    expect(readings.copperGold?.source).toMatch(/GC=F/)
    expect(readings.copperGold?.direction).toBe('up')
  })

  it('无 advDec 时 advDecLine / mcclellan 为 null；有 advDec 时复用计算', async () => {
    const rows: Array<[string, number, number, number, number]> = []
    let cursor = Date.parse('2026-05-01')
    while (rows.length < 80) {
      const iso = new Date(cursor).toISOString().slice(0, 10)
      const wd = new Date(cursor).getUTCDay()
      cursor += DAY
      if (wd === 0 || wd === 6) continue
      rows.push([iso, 300, 200, 0, 500])
    }
    const files = fixtureFiles({
      'us-market-breadth.json': {
        breadth: {
          spx: {
            date: rows.at(-1)![0],
            above200: 55,
            covered: 500,
            total: 500,
            source: 'test',
            scope: 'spx',
            history: [[rows.at(-1)![0], 55]],
            advDec: rows,
            netHighs: [[rows.at(-1)![0], 1]],
          },
        },
      },
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${rows.at(-1)![0]}T20:00:00Z`))
    const { readings } = await loadReadings(mockFetch(files))
    expect(readings.advDecLine).not.toBeNull()
    expect(readings.advDecLine?.value).toBe(rows.length * 100)
    expect(readings.mcclellan).not.toBeNull()
  })

  it('日频过期：落后超过 3 个交易日标 stale', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const files = fixtureFiles({
      'us-market-data.json': {
        series: {
          vixDaily: series([['2026-11-10', 20]], { unit: '点', frequency: '日频' }),
          fedAssets: series([['2026-11-18', 1]], { unit: '十亿美元', frequency: '周频' }),
          treasuryCash: series([['2026-11-18', 0]], { unit: '十亿美元', frequency: '周频' }),
          overnightRrp: series([['2026-11-18', 0]], { unit: '十亿美元', frequency: '日频' }),
        },
      },
      'macro-us.json': {
        generatedAt: '2026-11-20',
        source: 'test',
        series: {
          vix: { unit: '', latest: { date: '2026-11-10', value: 19 }, history: [['2026-11-10', 19]] },
        },
      },
    })
    const { readings } = await loadReadings(mockFetch(files))
    expect(readings.vix?.stale).toBe(true)
  })

  it('单文件失败只置空依赖读数并列出 failedSources；全失败或无读数才抛错', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    await expect(loadReadings(mockFetch({}))).rejects.toThrow(/加载失败/)

    const files = fixtureFiles()
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url).split('/').pop()!
      if (path === 'us-market-slices.json') return response({}, false)
      if (!(path in files)) return response({}, false)
      return response(files[path])
    })
    const { readings, failedSources } = await loadReadings(fetcher)
    expect(failedSources).toEqual(['美股切片'])
    expect(readings.spxVs200dma).toBeNull()
    expect(readings.fedAssets?.value).toBe(6740)
    expect(readings.realYield10?.value).toBe(2.88)

    const empty = fixtureFiles({
      'us-market-data.json': { series: {} },
      'us-market-breadth.json': { breadth: {} },
      'us-market-slices.json': { slices: [] },
      'macro-us.json': { generatedAt: '2026-11-20', source: 't', series: {} },
      'us-equity-bond-spread.json': { real: [] },
    })
    await expect(loadReadings(mockFetch(empty))).rejects.toThrow(/加载失败|读数计算失败/)
  })

  it('覆盖不足 5 年不分位；5–10 年周密采样给分位并写 percentileYears', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const shortHist: [string, number][] = []
    for (let y = 2023; y <= 2026; y += 1) {
      for (let m = 1; m <= 12; m += 1) {
        if (y === 2026 && m > 10) break
        shortHist.push([`${y}-${String(m).padStart(2, '0')}-01`, m])
      }
    }
    const midHist: [string, number][] = []
    const midBegin = Date.parse('2019-01-04T12:00:00Z')
    const midEnd = Date.parse('2026-10-01T12:00:00Z')
    for (let t = midBegin, i = 0; t <= midEnd; t += 7 * DAY, i += 1) {
      midHist.push([new Date(t).toISOString().slice(0, 10), 2019 + i / 100])
    }
    const shortFiles = fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          baaAaa: series(shortHist, { unit: '个百分点', frequency: '月频' }),
        },
      },
    })
    const midFiles = fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          baaAaa: series(midHist, { unit: '个百分点', frequency: '周频' }),
        },
      },
    })
    const short = await loadReadings(mockFetch(shortFiles))
    expect(short.readings.baaAaa?.percentile).toBeUndefined()
    const mid = await loadReadings(mockFetch(midFiles))
    expect(mid.readings.baaAaa?.percentile).toBeTypeOf('number')
    expect(mid.readings.baaAaa?.percentileYears).toBeGreaterThanOrEqual(5)
    expect(mid.readings.baaAaa?.percentileYears).toBeLessThan(10)
  })

  it('两点跨 6.9 年不给分位（样本与覆盖率不足）', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const files = fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          baaAaa: series([
            ['2020-01-03', 2],
            ['2026-11-18', 8],
          ], { unit: '个百分点', frequency: '周频' }),
        },
      },
    })
    const { readings } = await loadReadings(mockFetch(files))
    expect(readings.baaAaa?.value).toBe(8)
    expect(readings.baaAaa?.percentile).toBeUndefined()
  })

  it('无效日期与 history:null 只隔离相关读数，不拖垮整页', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const base = fixtureFiles()
    const pub = base['us-market-data.json'] as { series: Record<string, unknown> }
    const files = fixtureFiles({
      'us-market-data.json': {
        series: {
          ...pub.series,
          managerCash: series([
            ['2026-10-xx', 3.5],
            ['2026-11-12', 3.6],
          ], { unit: '%', frequency: '月频' }),
        },
      },
      'macro-us.json': {
        generatedAt: '2026-11-20',
        source: 'test',
        series: {
          realRate: {
            unit: 'pp',
            latest: { date: '2026-09-01', value: 0.63 },
            history: null,
            note: '联邦基金利率减核心 PCE 同比',
            fred: 'FEDFUNDS − PCEPILFE',
          },
          curve: { unit: 'pp', latest: { date: '2026-11-20', value: 0.29 }, history: [['2026-10-20', 0.2], ['2026-11-20', 0.29]] },
          nfci: { unit: '', latest: { date: '2026-11-13', value: -0.48 }, history: [['2026-10-16', -0.4], ['2026-11-13', -0.48]] },
          hy: { unit: 'bp', latest: { date: '2026-11-19', value: 352 }, history: [['2026-10-20', 340], ['2026-11-19', 352]] },
          tenYear: { unit: '%', latest: { date: '2026-11-19', value: 5.04 }, history: [['2026-10-20', 4.9], ['2026-11-19', 5.04]] },
          vix: { unit: '', latest: { date: '2026-11-19', value: 28 }, history: [['2026-10-20', 18], ['2026-11-19', 28]] },
        },
      },
    })
    const { readings, failedSources } = await loadReadings(mockFetch(files))
    expect(readings.managerCash?.value).toBe(3.6)
    expect(readings.fedAssets?.value).toBe(6740)
    expect(readings.realRate).toBeNull()
    expect(readings.curve10y2y?.value).toBe(0.29)
    expect(failedSources).toContain('美国宏观')
  })

  function countNonNull(readings: Awaited<ReturnType<typeof loadReadings>>['readings']): number {
    return Object.values(readings).filter(r => r != null).length
  }

  it('隔离·宽度文件非 spx 条目为 null：健康读数保留，不拖垮整页', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const base = fixtureFiles()
    const breadth = structuredClone(base['us-market-breadth.json']) as {
      breadth: Record<string, unknown>
    }
    breadth.breadth.ndx = null
    const healthy = await loadReadings(mockFetch(fixtureFiles()))
    const { readings, asOf, failedSources } = await loadReadings(mockFetch(fixtureFiles({
      'us-market-breadth.json': breadth,
    })))
    expect(countNonNull(readings)).toBe(countNonNull(healthy.readings))
    expect(readings.spxAbove200?.value).toBe(48.6)
    expect(readings.fedAssets?.value).toBe(6740)
    expect(asOf).toBe(healthy.asOf)
    expect(failedSources ?? []).not.toContain('美股宽度')
  })

  it('隔离·切片数组末尾追加 null：健康读数保留，失败来源准确', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const base = fixtureFiles()
    const slices = structuredClone(base['us-market-slices.json']) as { slices: unknown[] }
    slices.slices.push(null)
    const healthy = await loadReadings(mockFetch(fixtureFiles()))
    const { readings, asOf, failedSources } = await loadReadings(mockFetch(fixtureFiles({
      'us-market-slices.json': slices,
    })))
    expect(countNonNull(readings)).toBe(countNonNull(healthy.readings))
    expect(readings.spxVs200dma).not.toBeNull()
    expect(readings.fedAssets?.value).toBe(6740)
    expect(asOf).toBe(healthy.asOf)
    expect(failedSources ?? []).not.toContain('美股切片')
  })

  it('隔离·股债息差 real 为对象：整源失败，其余读数与 asOf 保留', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const healthy = await loadReadings(mockFetch(fixtureFiles()))
    const { readings, asOf, failedSources } = await loadReadings(mockFetch(fixtureFiles({
      'us-equity-bond-spread.json': {
        generatedAt: '2026-11-20',
        latestReal: { date: '2026-11-18', value: 2.88 },
        real: { not: 'an-array' },
        rows: [],
      },
    })))
    expect(readings.realYield10).toBeNull()
    expect(failedSources).toEqual(['美股股债息差'])
    expect(readings.fedAssets?.value).toBe(6740)
    expect(readings.spxAbove200?.value).toBe(48.6)
    expect(countNonNull(readings)).toBe(countNonNull(healthy.readings) - 1)
    expect(asOf).toBe(healthy.asOf)
  })

  it('隔离·股债息差 real 追加 null：丢弃脏条目，读数与 asOf 不变', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const base = fixtureFiles()
    const rates = structuredClone(base['us-equity-bond-spread.json']) as { real: unknown[] }
    rates.real.push(null)
    const healthy = await loadReadings(mockFetch(fixtureFiles()))
    const { readings, asOf, failedSources } = await loadReadings(mockFetch(fixtureFiles({
      'us-equity-bond-spread.json': rates,
    })))
    expect(readings.realYield10?.value).toBe(2.88)
    expect(countNonNull(readings)).toBe(countNonNull(healthy.readings))
    expect(asOf).toBe(healthy.asOf)
    expect(failedSources ?? []).not.toContain('美股股债息差')
  })

  it('隔离·spx.history 追加 null：丢弃脏条目，宽度读数保留', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const base = fixtureFiles()
    const breadth = structuredClone(base['us-market-breadth.json']) as {
      breadth: { spx: { history: unknown[] } }
    }
    breadth.breadth.spx.history.push(null)
    const healthy = await loadReadings(mockFetch(fixtureFiles()))
    const { readings, asOf, failedSources } = await loadReadings(mockFetch(fixtureFiles({
      'us-market-breadth.json': breadth,
    })))
    expect(readings.spxAbove200?.value).toBe(48.6)
    expect(countNonNull(readings)).toBe(countNonNull(healthy.readings))
    expect(asOf).toBe(healthy.asOf)
    expect(failedSources ?? []).not.toContain('美股宽度')
  })

  it('仓库 public/data 快照：22 项非空、asOf 2026-11-20', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-22T17:00:00Z'))
    const root = resolve(process.cwd(), 'public/data')
    const files: Record<string, unknown> = {
      'us-market-data.json': JSON.parse(readFileSync(resolve(root, 'us-market-data.json'), 'utf8')),
      'us-market-breadth.json': JSON.parse(readFileSync(resolve(root, 'us-market-breadth.json'), 'utf8')),
      'us-market-slices.json': JSON.parse(readFileSync(resolve(root, 'us-market-slices.json'), 'utf8')),
      'macro-us.json': JSON.parse(readFileSync(resolve(root, 'macro-us.json'), 'utf8')),
      'us-equity-bond-spread.json': JSON.parse(readFileSync(resolve(root, 'us-equity-bond-spread.json'), 'utf8')),
    }
    const { readings, asOf, failedSources } = await loadReadings(mockFetch(files))
    expect(countNonNull(readings)).toBe(22)
    expect(asOf).toBe('2026-11-20')
    expect(failedSources).toBeUndefined()
  })
})
