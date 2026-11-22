import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  READING_LABELS,
  READING_THEMES,
  computeNetLiquidity,
  loadReadings,
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

function fixtureFiles(overrides: Record<string, unknown> = {}) {
  const base = {
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
        baaAaa: series([['2016-01-01', 1.2], ...decadeMonthly('baa'), ['2026-10-01', 0.47]], { unit: '个百分点', frequency: '月频' }),
        fearGreed: series([['2026-10-20', 40], ['2026-11-20', 10]], { unit: '分', frequency: '日频' }),
        vixDaily: series([['2026-10-20', 18], ['2026-11-20', 30]], { unit: '点', frequency: '日频' }),
        retailBull: series([['2026-10-21', 35], ['2026-11-18', 33]], { unit: '%', frequency: '周频' }),
        retailBear: series([['2026-10-21', 30], ['2026-11-18', 42]], { unit: '%', frequency: '周频' }),
        naaim: series([['2026-08-12', 80], ['2026-08-19', 94]], { unit: '%', frequency: '周频' }),
        managerCash: series([['2026-11-12', 3.6]], { unit: '%', frequency: '月频' }),
        finraDebtYoy: series([['2016-01-31', 10], ...decadeMonthly('debt'), ['2026-10-31', 22]], { unit: '%', frequency: '月频' }),
        spxFactSetFpe: series([['2026-09-30', 19], ['2026-11-13', 18.3]], { unit: '倍', frequency: '周频' }),
        spxForwardEpsChange: series([['2026-11-13', 3.3]], { unit: '%', frequency: '周频' }),
        shillerCape: series([...decadeMonthly('cape', 20, 36), ['2026-11-01', 36.4]], { unit: '倍', frequency: '月频' }),
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
    'index-history.json': { generatedAt: '2026-11-20', indexes: {} },
    'macro-us.json': {
      generatedAt: '2026-11-20',
      source: 'test',
      series: {
        realRate: { unit: 'pp', latest: { date: '2026-09-01', value: 0.63 }, history: [['2026-08-01', 0.7], ['2026-09-01', 0.63]] },
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

function dailySpx(): [string, number][] {
  const out: [string, number][] = []
  const start = Date.parse('2016-01-04')
  for (let i = 0; i < 2600; i += 1) {
    const d = new Date(start + i * DAY)
    const wd = d.getUTCDay()
    if (wd === 0 || wd === 6) continue
    const iso = d.toISOString().slice(0, 10)
    out.push([iso, 2000 + out.length * 1.5])
  }
  return out.slice(-900)
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
  it('覆盖全部 ReadingKey', () => {
    const keys = Object.keys(READING_LABELS) as ReadingKey[]
    expect(keys.length).toBe(25)
    const themed = new Set(READING_THEMES.flatMap(t => t.keys))
    expect(themed.size).toBe(keys.length)
  })
})

describe('computeNetLiquidity', () => {
  it('按周频观测日对齐，逆回购取同日或之前最近值', () => {
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
  })

  it('三者对不齐时返回 null', () => {
    expect(computeNetLiquidity([['2026-11-18', 1]], [], [['2026-11-18', 1]], '2026-11-20')).toBeNull()
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

    expect(readings.fedAssets).toMatchObject({ value: 6740, unit: '十亿美元', date: '2026-11-18' })
    expect(readings.netLiquidity).toMatchObject({ value: 6740 - 920 - 5, date: '2026-11-18' })
    expect(readings.bankReserves?.value).toBe(2950)
    expect(readings.realRate?.value).toBe(0.63)
    expect(readings.tenYear?.value).toBe(5)
    expect(readings.curve10y2y?.value).toBe(0.29)
    expect(readings.nfci?.value).toBe(-0.48)
    expect(readings.hySpread?.value).toBe(352)
    expect(readings.baaAaa?.value).toBe(0.47)
    expect(readings.baaAaa?.percentile).toBeTypeOf('number')
    expect(readings.spxAbove200?.value).toBe(48.6)
    expect(readings.netNewHighs?.value).toBe(-5.2)
    expect(readings.advDecLine).toBeNull()
    expect(readings.mcclellan).toBeNull()
    expect(readings.spxVs200dma).toMatchObject({ unit: '%', key: 'spxVs200dma' })
    expect(readings.spxVs200dma!.value).toBeTypeOf('number')
    expect(readings.epsRevision?.value).toBe(3.3)
    expect(readings.forwardPe?.value).toBe(18.3)
    expect(readings.cape?.percentile).toBeTypeOf('number')
    expect(readings.vix?.direction).toBe('up')
    expect(readings.fearGreed?.direction).toBe('down')
    expect(readings.retailBullBear).toMatchObject({ value: 33 - 42, date: '2026-11-18' })
    expect(readings.naaim?.stale).toBe(true)
    expect(readings.marginDebtYoy?.value).toBe(22)
    expect(readings.managerCash?.value).toBe(3.6)
    expect(readings.copper).toBeNull()
    expect(readings.copperGold).toBeNull()
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
    })
    const { readings } = await loadReadings(mockFetch(files))
    expect(readings.vix?.stale).toBe(true)
  })

  it('缺文件抛错；缺字段键返回 null', async () => {
    await expect(loadReadings(mockFetch({}))).rejects.toThrow(/加载失败/)
    const empty = fixtureFiles({
      'us-market-data.json': { series: {} },
      'us-market-breadth.json': { breadth: {} },
      'us-market-slices.json': { slices: [] },
      'macro-us.json': { generatedAt: '2026-11-20', source: 't', series: {} },
    })
    const { readings } = await loadReadings(mockFetch(empty))
    for (const key of Object.keys(READING_LABELS) as ReadingKey[]) {
      expect(readings[key] === null || readings[key] === undefined || typeof readings[key] === 'object').toBe(true)
    }
    expect(readings.copper).toBeNull()
    expect(readings.fedAssets).toBeNull()
    expect(readings.spxVs200dma).toBeNull()
  })
})
