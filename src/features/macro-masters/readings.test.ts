import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  READING_LABELS,
  READING_THEMES,
  computeNetLiquidity,
  continuousDailySegment,
  directionOf,
  dotMedianReading,
  loadReadings,
  policyRateMoves,
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
        iorb: series([
          ['2026-09-10', 4.15], ['2026-09-11', 4.15], ['2026-09-12', 4.15],
          ['2026-09-13', 3.65], ['2026-09-14', 3.65], ['2026-09-15', 3.65], ['2026-09-16', 3.65],
          ['2026-09-17', 3.9], ['2026-09-18', 3.9], ['2026-09-19', 3.9],
          ['2026-11-20', 3.9],
        ], { unit: '%', frequency: '日频', name: '准备金余额利率' }),
        mmfTotal: series([['2026-10-21', 78000], ['2026-11-18', 79764]], { unit: '亿美元', frequency: '周频', name: '货币基金总资产' }),
        cftcSpxLev: series([['2016-01-05', -5], ...decadeWeekly('cftc', -20, 10), ['2026-11-17', -10.58]], {
          unit: '%', frequency: '周频', name: '杠杆基金标普净仓',
        }),
        ofrEquityGross: series([['2025-12-31', 98000], ['2026-03-31', 100000], ['2026-06-30', 103150]], {
          unit: '亿美元', frequency: '季频', name: '对冲基金股票总名义敞口',
        }),
        volumeRatio: series([['2026-10-20', 1.1], ['2026-11-20', 1.34]], { unit: '倍', frequency: '日频' }),
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
      slices: [
        { id: 'spx', history: dailySpx() },
        { id: 'rsp', history: dailySpxScaled(1.01) },
        { id: 'small', history: dailySpxScaled(0.98) },
        { id: 'growth', history: dailySpxScaled(1.02) },
        { id: 'value', history: dailySpxScaled(0.99) },
        { id: 'sector-xly', history: dailySpxScaled(1.03) },
        { id: 'sector-xlp', history: dailySpxScaled(0.97) },
      ],
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
        unrate: { unit: '%', latest: { date: '2026-10-01', value: 4.1 }, history: [['2026-09-01', 4.0], ['2026-10-01', 4.1]] },
        sahm: { unit: 'pp', latest: { date: '2026-10-01', value: 0.1 }, history: [['2026-09-01', 0.05], ['2026-10-01', 0.1]] },
        debtService: { unit: '%', latest: { date: '2026-04-01', value: 11.1 }, history: [['2026-01-01', 11.0], ['2026-04-01', 11.1]], note: '家庭债务偿付额占可支配收入比例' },
        buffett: { unit: '%', latest: { date: '2026-04-01', value: 255 }, history: [['2026-01-01', 250], ['2026-04-01', 255]], long: longQuarterly('buffett', 1947, 40), note: '非金融企业股票市值 ÷ 名义 GDP' },
        putCall: { unit: '', latest: { date: '2026-11-20', value: 1.13 }, history: [['2026-10-31', 1.0], ['2026-11-20', 1.13]], long: decadeMonthly('pc', 0.8, 1.2), note: 'Cboe 全产品期权成交量 Put÷Call；最新值为每日读数' },
        corePce: { unit: '%', latest: { date: '2026-09-01', value: 3.12 }, history: [['2026-08-01', 3.2], ['2026-09-01', 3.12]], fred: 'PCEPILFE', note: '由价格指数计算同比' },
        claims: { unit: '万人', latest: { date: '2026-11-14', value: 19.8 }, history: [['2026-10-17', 20.1], ['2026-11-14', 19.8]], fred: 'IC4WSA' },
      },
    },
    'us-equity-bond-spread.json': {
      generatedAt: '2026-11-20',
      latestReal: { date: '2026-11-18', value: 2.88 },
      real: [['2026-08-05', 2.41], ['2026-11-18', 2.88]],
      rows: [],
    },
    'macro-masters-fred.json': {
      generatedAt: '2026-11-20',
      source: 'FRED, Federal Reserve Bank of St. Louis',
      series: {
        fedFunds: { fred: 'FEDFUNDS', name: '联邦基金有效利率', unit: '%', frequency: 'monthly', history: [['2026-09-01', 4.22], ['2026-10-01', 4.09]] },
        nominalGdpYoy: { fred: 'A191RP1Q027SBEA', name: '名义 GDP 同比', unit: '%', frequency: 'quarterly', history: [['2026-01-01', 5.2], ['2026-04-01', 5.6]] },
        dotMedian: {
          fred: 'FEDTARMD', name: 'SEP 联邦基金利率中位数', unit: '%', frequency: 'quarterly',
          updated: '2026-09-17',
          history: [['2026-01-01', 4.1], ['2027-01-01', 3.9], ['2028-01-01', 3.4]],
        },
        privateCreditGdp: { fred: 'QUSPAM770A', name: '私人信贷/GDP', unit: '%', frequency: 'quarterly', history: longQuarterly('pcg', 1980, 140) },
        govDebtGdp: { fred: 'GFDEGDQ188S', name: '联邦债务/GDP', unit: '%', frequency: 'quarterly', history: longQuarterly('gdg', 1970, 60) },
        hyYield: { fred: 'BAMLH0A0HYM2EY', name: '高收益债有效收益率', unit: '%', frequency: 'daily', history: [['2026-10-20', 7.8], ['2026-11-19', 8.35]] },
        cccSpread: { fred: 'BAMLH0A3HYC', name: 'CCC OAS', unit: 'bp', frequency: 'daily', history: [['2026-10-20', 900], ['2026-11-19', 980]] },
        m2Yoy: { fred: 'M2SL', name: 'M2 同比', unit: '%', frequency: 'monthly', history: [['2026-09-01', 4.5], ['2026-10-01', 4.8]] },
        inflationExp: { fred: 'T10YIE', name: '10 年盈亏平衡通胀', unit: '%', frequency: 'daily', history: [['2026-10-20', 2.3], ['2026-11-19', 2.35]] },
        primeRate: { fred: 'DPRIME', name: '优惠利率', unit: '%', frequency: 'monthly', history: [['2026-09-01', 7.25], ['2026-10-01', 7.0]] },
        discountRate: { fred: 'DPCREDIT', name: '一级信贷利率', unit: '%', frequency: 'daily', history: [['2026-10-20', 4.25], ['2026-11-19', 4.0]] },
        consumerCreditYoy: { fred: 'NONREVSL', name: '非循环信贷同比', unit: '%', frequency: 'monthly', history: [['2026-09-01', 3.1], ['2026-10-01', 3.4]] },
        profitGdp: { fred: 'CP/GDP', name: '税后利润/GDP', unit: '%', frequency: 'quarterly', history: longQuarterly('pg', 1950, 8) },
      },
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

function dailySpxScaled(factor: number): [string, number][] {
  return dailySpx().map(([d, v]) => [d, Math.round(v * factor * 100) / 100])
}

/** 季频长历史（约从 startYear 起每年 4 点）。 */
function longQuarterly(seed: string, startYear: number, value: number): [string, number][] {
  const out: [string, number][] = []
  for (let y = startYear; y <= 2025; y += 1) {
    for (const m of [1, 4, 7, 10]) {
      out.push([`${y}-${String(m).padStart(2, '0')}-01`, value + (y - startYear) * 0.1 + (seed.length % 3) * 0.01])
    }
  }
  return out
}

/** 月频长历史（满足 ≥30 年）。 */
function longMonthly(seed: string, startYear: number, start = 1, end = 2): [string, number][] {
  const out: [string, number][] = []
  const months = (2026 - startYear) * 12
  for (let y = startYear; y <= 2025; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      const t = (y - startYear) * 12 + m
      const v = start + ((end - start) * t) / months + (seed.length % 3) * 0.01
      out.push([`${y}-${String(m).padStart(2, '0')}-01`, Math.round(v * 100) / 100])
    }
  }
  return out
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
  it('覆盖全部 ReadingKey，主题分组与定案一致', () => {
    const keys = Object.keys(READING_LABELS) as ReadingKey[]
    expect(keys.length).toBe(57)
    expect(READING_LABELS.realYield10).toBe('10 年期 TIPS 实际收益率')
    expect(READING_LABELS.buffett).toBe('非金融企业股票市值 ÷ GDP')
    expect(READING_LABELS.policyRate).toBe('准备金余额利率')
    expect(READING_LABELS.dotMedian).toBe('点阵图：明年末利率中位数')
    expect(READING_LABELS.tga).toBe('财政部一般账户（TGA）')
    const themed = new Set(READING_THEMES.flatMap(t => t.keys))
    expect(themed.size).toBe(keys.length)
    expect(READING_THEMES.map(t => t.id)).toEqual([
      'policy', 'liquidity', 'credit', 'trend', 'breadth', 'fundamentals', 'macro', 'valuation', 'sentiment', 'commodities',
    ])
    expect(READING_THEMES.find(t => t.id === 'policy')?.keys).toEqual([
      'policyRate', 'realRate', 'realYield10', 'tenYear', 'curve10y2y', 'fedFunds', 'dotMedian', 'primeRate', 'discountRate',
    ])
    expect(READING_THEMES.find(t => t.id === 'liquidity')?.keys).toContain('tga')
    expect(READING_THEMES.find(t => t.id === 'macro')?.keys).toContain('nominalGdpYoy')
    expect(READING_THEMES.find(t => t.id === 'trend')?.keys).toEqual(['spxVs200dma', 'spxDrawdown'])
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
    expect(readings.policyRate).toMatchObject({
      value: 3.9,
      unit: '%',
      frequency: 'daily',
      lastMove: { date: '2026-09-17', from: 3.65, to: 3.9 },
      moveRun: { direction: 'up', count: 1, total: 0.25, startLevel: 3.65, since: '2026-09-17' },
    })
    expect(readings.policyRate?.note).toMatch(/准备金余额利率通常比联邦基金目标区间上限低 0\.1/)
    expect(readings.policyRate?.percentile).toBeUndefined()
    expect(readings.spxDrawdown).toMatchObject({ unit: '%', frequency: 'daily' })
    expect(readings.spxDrawdown!.value).toBeLessThanOrEqual(0)
    expect(readings.spxDrawdown?.note).toMatch(/近 52 周最高收盘/)
    expect(readings.equalWeightRel?.frequency).toBe('daily')
    expect(Number.isFinite(readings.equalWeightRel?.value)).toBe(true)
    expect(readings.unrate).toMatchObject({ value: 4.1, frequency: 'monthly' })
    expect(readings.sahm).toMatchObject({ value: 0.1, frequency: 'monthly' })
    expect(readings.debtService).toMatchObject({ value: 11.1, frequency: 'quarterly' })
    expect(readings.buffett).toMatchObject({ value: 255, frequency: 'quarterly', label: '非金融企业股票市值 ÷ GDP' })
    expect(readings.putCall).toMatchObject({ value: 1.13, frequency: 'monthly' })
    expect(readings.putCall?.note).toMatch(/Put÷Call/)
    expect(readings.vix?.prior).toEqual({ date: '2026-10-20', value: 18 })
    expect(readings.vix?.frequency).toBe('daily')
    expect(readings.baaAaa?.frequency).toBe('weekly')
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
      'macro-masters-fred.json': { generatedAt: '2026-11-20', series: {} },
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

  // 读取仓库实时数据：只断言结构与关系，不写死数量、日期、lastMove、failedSources
  it('仓库 public/data 快照：结构与关系', async () => {
    const root = resolve(process.cwd(), 'public/data')
    const files: Record<string, unknown> = {
      'us-market-data.json': JSON.parse(readFileSync(resolve(root, 'us-market-data.json'), 'utf8')),
      'us-market-breadth.json': JSON.parse(readFileSync(resolve(root, 'us-market-breadth.json'), 'utf8')),
      'us-market-slices.json': JSON.parse(readFileSync(resolve(root, 'us-market-slices.json'), 'utf8')),
      'macro-us.json': JSON.parse(readFileSync(resolve(root, 'macro-us.json'), 'utf8')),
      'us-equity-bond-spread.json': JSON.parse(readFileSync(resolve(root, 'us-equity-bond-spread.json'), 'utf8')),
    }
    const { readings, asOf } = await loadReadings(mockFetch(files))
    expect(countNonNull(readings)).toBeGreaterThan(0)
    expect(asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
    expect(asOf <= today).toBe(true)
    // 政策利率含周末日历日，不得把快照拖到仅它有的日期
    if (readings.policyRate?.date && readings.policyRate.date !== asOf) {
      expect(asOf < readings.policyRate.date || asOf === readings.policyRate.date).toBe(true)
    }
    for (const r of Object.values(readings)) {
      if (!r) continue
      expect(r.frequency, r.key).toBeTruthy()
      if (r.longPercentile !== undefined) {
        expect(r.longPercentile).toBeGreaterThanOrEqual(0)
        expect(r.longPercentile).toBeLessThanOrEqual(100)
      }
    }
  })

  it('第三轮·展示字段损坏：单位为对象时回落为字符串，不让页面渲染失败', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const base = fixtureFiles()
    const pub = structuredClone(base['us-market-data.json']) as { series: { fedAssets: { unit: unknown } } }
    pub.series.fedAssets.unit = { label: '十亿美元' }
    const { readings } = await loadReadings(mockFetch(fixtureFiles({ 'us-market-data.json': pub })))
    expect(readings.fedAssets).toBeTruthy()
    expect(typeof readings.fedAssets!.unit).toBe('string')
    for (const r of Object.values(readings)) {
      if (!r) continue
      expect(typeof r.label).toBe('string')
      expect(typeof r.unit).toBe('string')
      expect(typeof r.source).toBe('string')
    }
  })

  it('第三轮·只剩一个来源且局部损坏：保留其余有效读数，不进入全局错误', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const base = fixtureFiles()
    const pub = structuredClone(base['us-market-data.json']) as { series: Record<string, { history: unknown }> }
    if (pub.series.managerCash) pub.series.managerCash.history = null
    const { readings, failedSources } = await loadReadings(mockFetch({ 'us-market-data.json': pub }))
    expect(countNonNull(readings)).toBeGreaterThan(0)
    expect(readings.fedAssets).toBeTruthy()
    expect(failedSources).toEqual(expect.arrayContaining(['美股宽度', '美股切片']))
  })

  it('第三轮·宽度 spx.advDec 不是数组：只记宽度来源，不误报切片', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const base = fixtureFiles()
    const breadth = structuredClone(base['us-market-breadth.json']) as { breadth: { spx: Record<string, unknown> } }
    breadth.breadth.spx.advDec = { length: 1 }
    const { failedSources } = await loadReadings(mockFetch(fixtureFiles({ 'us-market-breadth.json': breadth })))
    expect(failedSources).toContain('美股宽度')
    expect(failedSources ?? []).not.toContain('美股切片')
  })

  it('第三轮·宽度缺 spx：列出宽度来源失败', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const base = fixtureFiles()
    const breadth = structuredClone(base['us-market-breadth.json']) as { breadth: Record<string, unknown> }
    breadth.breadth.spx = null
    const { readings, failedSources } = await loadReadings(mockFetch(fixtureFiles({ 'us-market-breadth.json': breadth })))
    expect(readings.spxAbove200 ?? null).toBeNull()
    expect(failedSources).toContain('美股宽度')
  })

  it('第三轮·股债息差 rows 损坏：TIPS 读数保留，不判整源失败', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const base = fixtureFiles()
    const rates = structuredClone(base['us-equity-bond-spread.json']) as Record<string, unknown>
    rates.rows = {}
    const { readings, failedSources } = await loadReadings(mockFetch(fixtureFiles({ 'us-equity-bond-spread.json': rates })))
    expect(readings.realYield10?.value).toBe(2.88)
    expect(failedSources ?? []).not.toContain('美股股债息差')
  })
})

describe('原生频率分位门槛', () => {
  it('日频：周采样后刚好够 / 不够', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const enough = decadeWeekly('vix', 10, 40)
    const sparse: [string, number][] = [
      ['2018-01-03', 12],
      ['2020-01-03', 20],
      ['2022-01-03', 25],
      ['2024-01-03', 18],
      ['2026-11-18', 30],
    ]
    const okFiles = fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          vixDaily: series([...enough, ['2026-11-20', 35]], { unit: '点', frequency: '日频' }),
        },
      },
    })
    const badFiles = fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          vixDaily: series(sparse, { unit: '点', frequency: '日频' }),
        },
      },
      'macro-us.json': {
        generatedAt: '2026-11-20',
        source: 'test',
        series: {
          ...((fixtureFiles()['macro-us.json'] as { series: Record<string, unknown> }).series),
          vix: { unit: '', latest: { date: '2026-11-10', value: 19 }, history: [['2026-11-10', 19]] },
        },
      },
    })
    expect((await loadReadings(mockFetch(okFiles))).readings.vix?.percentile).toBeTypeOf('number')
    expect((await loadReadings(mockFetch(badFiles))).readings.vix?.percentile).toBeUndefined()
  })

  it('周频：原始观测刚好够 / 不够', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const enough = decadeWeekly('baa', 0.5, 1.5)
    const short: [string, number][] = []
    for (let y = 2023; y <= 2026; y += 1) {
      for (let m = 1; m <= 12; m += 1) {
        if (y === 2026 && m > 10) break
        short.push([`${y}-${String(m).padStart(2, '0')}-01`, m / 10])
      }
    }
    const ok = await loadReadings(mockFetch(fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          baaAaa: series([...enough, ['2026-10-01', 0.47]], { unit: '个百分点', frequency: '周频' }),
        },
      },
    })))
    const bad = await loadReadings(mockFetch(fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          baaAaa: series(short, { unit: '个百分点', frequency: '周频' }),
        },
      },
    })))
    expect(ok.readings.baaAaa?.percentile).toBeTypeOf('number')
    expect(ok.readings.baaAaa?.frequency).toBe('weekly')
    expect(bad.readings.baaAaa?.percentile).toBeUndefined()
  })

  it('月频：≥60 点且覆盖 ≥60% 月数才给分位；稀疏不够', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const enough = decadeMonthly('debt', 5, 25)
    const sparse: [string, number][] = []
    for (let y = 2016; y <= 2026; y += 1) {
      sparse.push([`${y}-01-01`, y - 2010])
      if (y === 2026) sparse.push(['2026-10-01', 22])
    }
    const ok = await loadReadings(mockFetch(fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          finraDebtYoy: series([...enough, ['2026-10-31', 22]], { unit: '%', frequency: '月频' }),
        },
      },
    })))
    const bad = await loadReadings(mockFetch(fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          finraDebtYoy: series(sparse, { unit: '%', frequency: '月频' }),
        },
      },
    })))
    expect(ok.readings.marginDebtYoy?.percentile).toBeTypeOf('number')
    expect(ok.readings.marginDebtYoy?.frequency).toBe('monthly')
    expect(bad.readings.marginDebtYoy?.percentile).toBeUndefined()
  })

  it('季频：≥20 点 / 5 年 / 60% 季覆盖；不够则不分位', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const enough: [string, number][] = []
    for (let y = 2016; y <= 2026; y += 1) {
      for (const m of [1, 4, 7, 10]) {
        if (y === 2026 && m > 4) break
        enough.push([`${y}-${String(m).padStart(2, '0')}-01`, 10 + (y - 2016) * 0.1])
      }
    }
    const sparse: [string, number][] = [
      ['2020-01-01', 10], ['2021-01-01', 10.5], ['2022-01-01', 11], ['2023-01-01', 11.2],
      ['2024-01-01', 11.4], ['2025-01-01', 11.5], ['2026-04-01', 11.1],
    ]
    const ok = await loadReadings(mockFetch(fixtureFiles({
      'macro-us.json': {
        generatedAt: '2026-11-20',
        source: 'test',
        series: {
          ...((fixtureFiles()['macro-us.json'] as { series: Record<string, unknown> }).series),
          debtService: {
            unit: '%',
            latest: { date: '2026-04-01', value: 11.1 },
            history: enough,
            note: '家庭债务偿付额占可支配收入比例',
          },
        },
      },
    })))
    const bad = await loadReadings(mockFetch(fixtureFiles({
      'macro-us.json': {
        generatedAt: '2026-11-20',
        source: 'test',
        series: {
          ...((fixtureFiles()['macro-us.json'] as { series: Record<string, unknown> }).series),
          debtService: {
            unit: '%',
            latest: { date: '2026-04-01', value: 11.1 },
            history: sparse,
          },
        },
      },
    })))
    expect(ok.readings.debtService?.percentile).toBeTypeOf('number')
    expect(ok.readings.debtService?.frequency).toBe('quarterly')
    expect(bad.readings.debtService?.percentile).toBeUndefined()
  })
})

describe('长历史分位 / prior / 过期边界', () => {
  it('全样本跨度 ≥30 年才给 longPercentile，并写起始年', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const longCape: [string, number][] = [...longMonthly('cape', 1900, 10, 40), ['2026-11-01', 36.4]]
    const shortCape = decadeMonthly('cape', 20, 36)
    const ok = await loadReadings(mockFetch(fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          shillerCape: series(longCape, { unit: '倍', frequency: '月频', scope: '最新月为当月估算' }),
        },
      },
    })))
    const bad = await loadReadings(mockFetch(fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          shillerCape: series([...shortCape, ['2026-11-01', 36.4]], { unit: '倍', frequency: '月频' }),
        },
      },
    })))
    expect(ok.readings.cape?.longPercentile).toBeTypeOf('number')
    expect(ok.readings.cape?.longPercentileSince).toBe(1900)
    expect(bad.readings.cape?.longPercentile).toBeUndefined()
  })

  it('prior 写入方向比较点；季频用上一观测（≤130 天）', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const { readings } = await loadReadings(mockFetch(fixtureFiles()))
    expect(readings.fearGreed?.prior).toEqual({ date: '2026-10-20', value: 40 })
    expect(readings.fearGreed?.direction).toBe('down')
    expect(readings.debtService?.prior).toEqual({ date: '2026-01-01', value: 11.0 })
    expect(readings.debtService?.direction).toBe('up')
  })

  it('月频超过 95 天、季频超过 270 天才标过期', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const monthlyOk = await loadReadings(mockFetch(fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          managerCash: series([['2026-08-18', 3.6]], { unit: '%', frequency: '月频' }),
        },
      },
    })))
    const monthlyStale = await loadReadings(mockFetch(fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          managerCash: series([['2026-08-17', 3.6]], { unit: '%', frequency: '月频' }),
        },
      },
    })))
    // 2026-08-18 → 11-21 = 95 天，边界不标过期；08-17 = 96 天过期
    expect(monthlyOk.readings.managerCash?.stale).toBeUndefined()
    expect(monthlyStale.readings.managerCash?.stale).toBe(true)

    const qOk = await loadReadings(mockFetch(fixtureFiles({
      'macro-us.json': {
        generatedAt: '2026-11-20',
        source: 'test',
        series: {
          ...((fixtureFiles()['macro-us.json'] as { series: Record<string, unknown> }).series),
          debtService: {
            unit: '%',
            latest: { date: '2026-02-24', value: 11.1 },
            history: [['2025-11-01', 11.0], ['2026-02-24', 11.1]],
          },
        },
      },
    })))
    const qStale = await loadReadings(mockFetch(fixtureFiles({
      'macro-us.json': {
        generatedAt: '2026-11-20',
        source: 'test',
        series: {
          ...((fixtureFiles()['macro-us.json'] as { series: Record<string, unknown> }).series),
          debtService: {
            unit: '%',
            latest: { date: '2026-02-23', value: 11.1 },
            history: [['2025-11-01', 11.0], ['2026-02-23', 11.1]],
          },
        },
      },
    })))
    // 02-24 → 11-21 = 270 天；02-23 = 271 天
    expect(qOk.readings.debtService?.stale).toBeUndefined()
    expect(qStale.readings.debtService?.stale).toBe(true)
  })
})

describe('policyRate / 回撤 / 相对表现', () => {
  const hold = (date: string, value: number, n = 3): [string, number][] => {
    const out: [string, number][] = []
    const start = Date.parse(`${date}T12:00:00Z`)
    for (let i = 0; i < n; i += 1) {
      out.push([new Date(start + i * DAY).toISOString().slice(0, 10), value])
    }
    return out
  }

  it('policyRateMoves：连续加息、先降后升、从未变化、单日抖动、末尾未确认', () => {
    const hike = policyRateMoves([
      ...hold('2024-01-01', 5.15, 5),
      ...hold('2024-09-18', 5.4, 3),
      ...hold('2024-11-07', 5.65, 3),
    ])
    expect(hike.lastMove).toEqual({ date: '2024-11-07', from: 5.4, to: 5.65 })
    expect(hike.moveRun).toEqual({
      direction: 'up', count: 2, total: 0.5, startLevel: 5.15, since: '2024-09-18',
    })
    expect(hike.pendingUnconfirmed).toBeUndefined()

    const cutThenUp = policyRateMoves([
      ...hold('2025-01-01', 4.4, 3),
      ...hold('2025-09-17', 4.15, 3),
      ...hold('2026-09-17', 4.4, 3),
    ])
    expect(cutThenUp.lastMove).toEqual({ date: '2026-09-17', from: 4.15, to: 4.4 })
    expect(cutThenUp.moveRun).toEqual({
      direction: 'up', count: 1, total: 0.25, startLevel: 4.15, since: '2026-09-17',
    })

    expect(policyRateMoves([
      ...hold('2026-01-01', 3.9, 5),
    ])).toEqual({})

    // 一天向上抖动后回到原值 → 不算调息
    const spikeUp = policyRateMoves([
      ...hold('2026-11-01', 3.9, 5),
      ['2026-11-06', 4.9],
      ...hold('2026-11-07', 3.9, 5),
    ])
    expect(spikeUp.lastMove).toBeUndefined()
    expect(spikeUp.pendingUnconfirmed).toBeUndefined()

    // 一天向下抖动后回到原值 → 不算调息
    const spikeDown = policyRateMoves([
      ...hold('2026-11-01', 3.9, 5),
      ['2026-11-06', 2.9],
      ...hold('2026-11-07', 3.9, 5),
    ])
    expect(spikeDown.lastMove).toBeUndefined()

    // 末尾单点错值：已有确认调息保留，末尾不计入并标 pending
    const trailing = policyRateMoves([
      ...hold('2026-09-10', 3.65, 3),
      ...hold('2026-09-17', 3.9, 10),
      ['2026-11-21', 4.9],
    ])
    expect(trailing.lastMove).toEqual({ date: '2026-09-17', from: 3.65, to: 3.9 })
    expect(trailing.moveRun).toMatchObject({ direction: 'up', count: 1, total: 0.25, startLevel: 3.65 })
    expect(trailing.pendingUnconfirmed).toBe(true)
  })

  it('末尾未确认调息：value 仍为最新，note 提示连续三天', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const files = fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          iorb: series([
            ...hold('2026-09-10', 3.65, 3),
            ...hold('2026-09-17', 3.9, 5),
            ['2026-11-20', 4.9],
          ], { unit: '%', frequency: '日频' }),
        },
      },
    })
    const { readings } = await loadReadings(mockFetch(files))
    expect(readings.policyRate?.value).toBe(4.9)
    expect(readings.policyRate?.lastMove).toEqual({ date: '2026-09-17', from: 3.65, to: 3.9 })
    expect(readings.policyRate?.note).toMatch(/连续三天保持才计入/)
  })

  it('asOf 排除 policyRate：周末政策利率不拖快照日期', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-22T20:00:00Z'))
    const files = fixtureFiles({
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          iorb: series([
            ...hold('2026-09-17', 3.9, 3),
            ['2026-11-20', 3.9],
            ['2026-11-21', 3.9],
            ['2026-11-22', 3.9],
          ], { unit: '%', frequency: '日频' }),
          vixDaily: series([['2026-11-20', 30]], { unit: '点', frequency: '日频' }),
        },
      },
    })
    const { readings, asOf } = await loadReadings(mockFetch(files))
    expect(readings.policyRate?.date).toBe('2026-11-22')
    expect(asOf).not.toBe('2026-11-22')
    expect(asOf <= '2026-11-20').toBe(true)
  })

  it('周频过期门槛 14 天：第 14 天不过期，第 15 天过期', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const ok = await loadReadings(mockFetch(fixtureFiles({
      'macro-us.json': {
        generatedAt: '2026-11-20',
        source: 'test',
        series: {
          ...((fixtureFiles()['macro-us.json'] as { series: Record<string, unknown> }).series),
          nfci: { unit: '', latest: { date: '2026-11-07', value: -0.4 }, history: [['2026-11-07', -0.4]] },
        },
      },
    })))
    const stale = await loadReadings(mockFetch(fixtureFiles({
      'macro-us.json': {
        generatedAt: '2026-11-20',
        source: 'test',
        series: {
          ...((fixtureFiles()['macro-us.json'] as { series: Record<string, unknown> }).series),
          nfci: { unit: '', latest: { date: '2026-11-06', value: -0.4 }, history: [['2026-11-06', -0.4]] },
        },
      },
    })))
    // 11-07 → 11-21 = 14 天；11-06 = 15 天
    expect(ok.readings.nfci?.stale).toBeUndefined()
    expect(stale.readings.nfci?.stale).toBe(true)
  })

  it('回撤：不足 252 交易日 null；够则 ≤0 且 note 含高点', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const short = dailySpx().slice(-100)
    const bad = await loadReadings(mockFetch(fixtureFiles({
      'us-market-slices.json': { slices: [{ id: 'spx', history: short }] },
    })))
    expect(bad.readings.spxDrawdown).toBeNull()

    const ok = await loadReadings(mockFetch(fixtureFiles()))
    expect(ok.readings.spxDrawdown).not.toBeNull()
    expect(ok.readings.spxDrawdown!.value).toBeLessThanOrEqual(0)
    expect(ok.readings.spxDrawdown?.percentile).toBeUndefined()
    expect(ok.readings.spxDrawdown?.note).toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(ok.readings.spxDrawdown?.prior).toBeTruthy()
  })

  it('四个相对表现：共同交易日不足 64 返回 null', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const shortA = dailySpx().slice(-40)
    const shortB = dailySpxScaled(1.01).slice(-40)
    const { readings } = await loadReadings(mockFetch(fixtureFiles({
      'us-market-slices.json': {
        slices: [
          { id: 'spx', history: shortB },
          { id: 'rsp', history: shortA },
          { id: 'small', history: shortA },
          { id: 'growth', history: shortA },
          { id: 'value', history: shortB },
          { id: 'sector-xly', history: shortA },
          { id: 'sector-xlp', history: shortB },
        ],
      },
    })))
    expect(readings.equalWeightRel).toBeNull()
    expect(readings.cyclicalDefensive).toBeNull()
    expect(readings.smallCapRel).toBeNull()
    expect(readings.growthValueRel).toBeNull()
    // spx 也短，200dma / drawdown 同样 null
    expect(readings.spxVs200dma).toBeNull()
  })

  it('五个宏观新键按频率产出', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const { readings } = await loadReadings(mockFetch(fixtureFiles()))
    expect(readings.unrate).toMatchObject({ key: 'unrate', value: 4.1, frequency: 'monthly' })
    expect(readings.sahm).toMatchObject({ key: 'sahm', value: 0.1, frequency: 'monthly' })
    expect(readings.debtService).toMatchObject({ key: 'debtService', frequency: 'quarterly' })
    expect(readings.buffett?.label).toBe('非金融企业股票市值 ÷ GDP')
    expect(readings.buffett?.longPercentile).toBeTypeOf('number')
    expect(readings.buffett?.longPercentileSince).toBe(1947)
    expect(readings.putCall?.frequency).toBe('monthly')
    expect(readings.putCall?.note).toMatch(/最新值为每日读数/)
  })
})

describe('第二批 20 个新读数', () => {
  it('us-market / macro 接入：TGA、货币基金、CFTC、OFR、量比、核心 PCE、初请', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const { readings } = await loadReadings(mockFetch(fixtureFiles()))
    expect(readings.tga).toMatchObject({ value: 920, unit: '十亿美元', frequency: 'weekly', date: '2026-11-18' })
    expect(readings.mmfAssets).toMatchObject({ value: 79764, unit: '亿美元', frequency: 'weekly' })
    expect(readings.mmfAssets?.note).toMatch(/ICI 美国货币基金总资产/)
    expect(readings.cftcLevSpx).toMatchObject({ value: -10.58, unit: '%', frequency: 'weekly' })
    expect(readings.cftcLevSpx?.percentile).toBeTypeOf('number')
    expect(readings.hfGrossExposure).toMatchObject({ value: 103150, unit: '亿美元', frequency: 'quarterly' })
    expect(readings.hfGrossExposure?.note).toMatch(/OFR Form PF/)
    expect(readings.volumeRatio).toMatchObject({ value: 1.34, unit: '倍', frequency: 'daily' })
    expect(readings.volumeRatio?.percentile).toBeUndefined()
    expect(readings.corePce).toMatchObject({ value: 3.12, frequency: 'monthly' })
    expect(readings.corePce?.source).toMatch(/PCEPILFE/)
    expect(readings.claims).toMatchObject({ value: 19.8, unit: '万人', frequency: 'weekly' })
  })

  it('FRED 补充序列正常产出；阶梯利率有方向；长历史给 longPercentile', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const { readings } = await loadReadings(mockFetch(fixtureFiles()))
    expect(readings.fedFunds).toMatchObject({ value: 4.09, frequency: 'monthly', unit: '%' })
    expect(readings.fedFunds?.source).toMatch(/FEDFUNDS/)
    expect(readings.fedFunds?.direction).toBeTruthy()
    expect(readings.nominalGdpYoy).toMatchObject({ value: 5.6, frequency: 'quarterly' })
    expect(readings.hyYield).toMatchObject({ value: 8.35, frequency: 'daily' })
    expect(readings.cccSpread).toMatchObject({ value: 980, unit: 'bp', frequency: 'daily' })
    expect(readings.m2Yoy).toMatchObject({ value: 4.8, frequency: 'monthly' })
    expect(readings.inflationExp).toMatchObject({ value: 2.35, frequency: 'daily' })
    expect(readings.primeRate).toMatchObject({ value: 7.0, frequency: 'monthly' })
    expect(readings.discountRate).toMatchObject({ value: 4.0, frequency: 'daily' })
    expect(readings.consumerCreditYoy).toMatchObject({ value: 3.4, frequency: 'monthly' })
    expect(readings.privateCreditGdp?.longPercentile).toBeTypeOf('number')
    expect(readings.govDebtGdp?.longPercentile).toBeTypeOf('number')
    expect(readings.profitGdp?.longPercentile).toBeTypeOf('number')
    expect(readings.profitGdp?.source).not.toMatch(/fred\.stlouisfed\.org\/series\/CP\/GDP/)
  })

  it('dotMedian：取 updated 年份+1 的中位数；无方向/分位；无 updated 为 null', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))
    const { readings } = await loadReadings(mockFetch(fixtureFiles()))
    expect(readings.dotMedian).toMatchObject({
      value: 3.9,
      date: '2026-09-17',
      frequency: 'quarterly',
    })
    expect(readings.dotMedian?.percentile).toBeUndefined()
    expect(readings.dotMedian?.direction).toBeUndefined()
    expect(readings.dotMedian?.note).toMatch(/SEP 中位数/)
    expect(readings.dotMedian?.note).toMatch(/2027 年末 3\.9%/)
    expect(readings.dotMedian?.note).toMatch(/9 月 17 日发布/)

    expect(dotMedianReading({
      history: [['2027-01-01', 3.9]],
      unit: '%',
    }, '2026-11-20')).toBeNull()

    const skip = await loadReadings(mockFetch(fixtureFiles({
      'macro-masters-fred.json': {
        generatedAt: '2026-11-20',
        series: {
          dotMedian: {
            fred: 'FEDTARMD',
            unit: '%',
            frequency: 'quarterly',
            history: [['2027-01-01', 3.9]],
          },
        },
      },
    })))
    expect(skip.readings.dotMedian).toBeNull()
    expect(skip.readings.fedFunds).toBeNull()
  })

  it('缺源为 null；FRED 文件失败不影响其他读数并进入 failedSources；过期标 stale', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T20:00:00Z'))

    const files = fixtureFiles()
    delete (files as Record<string, unknown>)['macro-masters-fred.json']
    const { readings, failedSources } = await loadReadings(mockFetch(files))
    expect(failedSources).toContain('FRED 补充序列')
    expect(readings.fedFunds).toBeNull()
    expect(readings.dotMedian).toBeNull()
    expect(readings.tga?.value).toBe(920)
    expect(readings.fedAssets?.value).toBe(6740)
    expect(readings.corePce?.value).toBe(3.12)

    const staleFiles = fixtureFiles({
      'macro-masters-fred.json': {
        generatedAt: '2026-11-20',
        series: {
          fedFunds: {
            fred: 'FEDFUNDS', unit: '%', frequency: 'monthly',
            history: [['2026-05-01', 4.33]],
          },
        },
      },
      'us-market-data.json': {
        series: {
          ...((fixtureFiles()['us-market-data.json'] as { series: Record<string, unknown> }).series),
          treasuryCash: series([['2026-09-01', 800]], { unit: '十亿美元', frequency: '周频' }),
          volumeRatio: series([['2026-10-01', 1.2]], { unit: '倍', frequency: '日频' }),
        },
      },
    })
    const stale = await loadReadings(mockFetch(staleFiles))
    expect(stale.readings.fedFunds?.stale).toBe(true)
    expect(stale.readings.tga?.stale).toBe(true)
    expect(stale.readings.volumeRatio?.stale).toBe(true)
  })
})


describe('manager 复核修补', () => {
  it('点阵图 note 只给读者看路径与发布日，不带数据文件的开发说明', () => {
    const r = dotMedianReading({
      fred: 'FEDTARMD', name: 'SEP', unit: '%', frequency: 'quarterly', updated: '2026-09-16',
      note: 'SEP 联邦基金利率中位数；history 的日期是预测目标年份',
      history: [['2026-01-01', 4.1], ['2027-01-01', 3.9]],
    }, '2026-11-20')
    expect(r?.value).toBe(3.9)
    expect(r?.note).toBe('SEP 中位数：2026 年末 4.1%、2027 年末 3.9%（9 月 16 日发布）')
  })
})
