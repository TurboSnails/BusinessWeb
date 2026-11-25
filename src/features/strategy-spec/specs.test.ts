import { describe, expect, it } from 'vitest'
// 规则代码：说明书里的数字必须和它一致
import { BREAKERS, COMPONENTS, PILLARS, RULE_VERSION, TIERS } from '../../../scripts/lib/macro-posture/model.mjs'
// 九格名称与做法：数据文件里的 matrix 由 scripts/lib/combined-strategy/matrix.mjs 的 CELL_NAMES / CELL_ACTIONS 生成
import combined from '../../../public/data/combined-strategy.json'
// 回测数字：主表与成本来自每月更新的数据文件；统计检验与月末收盘口径来自固定的研究结果
import macro from '../../../public/data/macro-posture.json'
import significance from '../../../docs/research/macro-significance-2026-11-25/results.json'
import monthEnd from '../../../docs/research/month-end-close-2026-11-25/results.json'
import { STRATEGY_SPECS, currentSpec, findSpec } from './index'
import type { SpecSection } from './types'

const tableRows = (section: SpecSection | undefined, caption?: string) =>
  section?.blocks.flatMap(block => block.type === 'table' && (caption == null || block.caption === caption) ? block.rows : []) ?? []

describe('版本登记', () => {
  it('版本号是语义化版本、互不重复，且恰好一个现行版本，排在最前', () => {
    const versions = STRATEGY_SPECS.map(spec => spec.version)
    expect(versions.every(v => /^\d+\.\d+\.\d+$/.test(v))).toBe(true)
    expect(new Set(versions).size).toBe(versions.length)
    expect(STRATEGY_SPECS.filter(spec => spec.status === 'current')).toHaveLength(1)
    expect(STRATEGY_SPECS[0].status).toBe('current')
    expect(currentSpec().version).toBe(STRATEGY_SPECS[0].version)
  })

  it('findSpec 接受带 v 前缀的版本号，找不到返回 null', () => {
    const v = STRATEGY_SPECS[0].version
    expect(findSpec(`v${v}`)?.version).toBe(v)
    expect(findSpec('9.9.9')).toBeNull()
    expect(findSpec(null)).toBeNull()
  })

  it('每个版本的章节 id 不重复，每章都有内容', () => {
    for (const spec of STRATEGY_SPECS) {
      const ids = spec.sections.map(section => section.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(spec.sections.every(section => section.blocks.length > 0)).toBe(true)
      expect(spec.changes.length).toBeGreaterThan(0)
    }
  })
})

describe('现行说明书与规则代码一致', () => {
  const spec = currentSpec()
  const section = (id: string) => spec.sections.find(s => s.id === id)

  it('宏观攻守的规则版本与代码相同', () => {
    expect(spec.components.find(c => c.label === '宏观攻守')?.version).toBe(RULE_VERSION)
  })

  it('五档的名称、分数线与仓位比例与代码相同', () => {
    const rows = tableRows(section('tiers'))
    expect(rows.map(row => row[0])).toEqual(TIERS.map(tier => tier.label))
    expect(rows.map(row => row[2])).toEqual(TIERS.map(tier => `${Math.round(tier.equityShare * 100)}%`))
    const bounds = rows.map(row => row[1]).join(' ')
    for (const n of [TIERS[0].min, TIERS[1].min, TIERS[3].max, TIERS[4].max]) {
      expect(bounds).toContain(Math.abs(n ?? NaN).toFixed(2))
    }
  })

  it('四根支柱的权重与指标数量与代码相同', () => {
    const tables = section('macro-score')?.blocks.filter(block => block.type === 'table') ?? []
    expect(tables).toHaveLength(PILLARS.length)
    PILLARS.forEach((pillar, i) => {
      const table = tables[i]
      if (table.type !== 'table') throw new Error('not table')
      expect(table.caption).toBe(`${pillar.title}（权重 ${Math.round(pillar.weight * 100)}%）`)
      expect(table.rows).toHaveLength(COMPONENTS.filter(c => c.pillar === pillar.id).length)
    })
    expect(section('macro-score')?.title).toContain(`${COMPONENTS.length} 项指标`)
  })

  it('熔断条数、名称与封顶档位与代码相同', () => {
    const rows = tableRows(section('breakers'))
    expect(rows.map(row => row[0])).toEqual(BREAKERS.map(b => b.label))
    expect(rows.map(row => row[2])).toEqual(
      BREAKERS.map(b => TIERS.find(t => t.id === b.cap)?.label),
    )
  })

  it('九格的名称与做法文字和数据文件逐字相同', () => {
    const side: Record<string, string> = { 进攻侧: 'offense', 中性: 'neutral', 防守侧: 'defense' }
    const heat: Record<string, string> = { 偏冷: 'cold', 居中: 'mid', 偏热: 'hot' }
    const cells = combined.matrix as { macroSide: string; heat: string; name: string; action: string }[]
    const rows = tableRows(section('matrix'))
    expect(rows).toHaveLength(cells.length)
    for (const row of rows) {
      const cell = cells.find(c => c.macroSide === side[row[0]] && c.heat === heat[row[1]])
      expect(cell?.name).toBe(row[2])
      expect(cell?.action).toBe(row[3])
    }
  })
})

/** 说明书里的数字：「−19.96%」「+0.16」「0.17（Holm）」「−33.0%（2020-02 至 03）」→ 数值（百分号不换算） */
const num = (text: string) => {
  const match = text.replace(/−/g, '-').match(/[-+]?\d+(\.\d+)?/)
  if (!match) throw new Error(`没有数字：${text}`)
  return Number(match[0])
}
const range = (text: string) => text.replace(/−/g, '-').split('至').map(part => num(part))
const expectNear = (label: string, actual: number, expected: number, tolerance: number) => {
  expect(Math.abs(actual - expected), `${label}：说明书 ${actual}，数据 ${expected}`).toBeLessThanOrEqual(tolerance + 1e-9)
}

describe('现行版本的回测数字与数据一致', () => {
  const spec = currentSpec()
  const section = (id: string) => spec.sections.find(s => s.id === id)
  // 数据截止月与说明书相同（成文时）按显示精度的一个单位核对（容许数据小幅修订造成的进位）；
  // 之后数据逐月延长，只防止抄错行、写错数量级
  const strict = macro.backtest.end === spec.dataThrough
  const tol = (rounding: number, drift: number) => (strict ? rounding : drift)
  const variant = (id: string) => {
    const row = macro.backtest.variants.find(v => v.id === id)
    if (!row) throw new Error(`缺少回测方案 ${id}`)
    return row
  }

  it('全样本主表与 macro-posture.json 的回测方案一致', () => {
    const ids: Record<string, string> = {
      '本策略（宏观攻守 v2.2）': 'full', 仅十个月均线: 'trend', 恒定七成股票: 'static70', 全程持有标普: 'buyhold',
    }
    const rows = tableRows(section('evidence'), '全样本（实时数据口径）')
    expect(rows.map(row => row[0])).toEqual(Object.keys(ids))
    for (const row of rows) {
      const v = variant(ids[row[0]])
      expectNear(`${row[0]} 年化`, num(row[1]), v.cagr * 100, tol(0.01, 0.5))
      expectNear(`${row[0]} 波动`, num(row[2]), v.vol * 100, tol(0.01, 0.5))
      expectNear(`${row[0]} 最大回撤`, num(row[3]), v.maxDd * 100, tol(0.01, 8))
      expectNear(`${row[0]} 夏普`, num(row[4]), v.sharpe, tol(0.01, 0.1))
      expectNear(`${row[0]} 平均仓位`, num(row[5]), v.avgEquity * 100, tol(0.1, 3))
      expectNear(`${row[0]} 年均换档`, num(row[6]), v.switchesPerYear, tol(0.1, 0.5))
    }
  })

  it('成本敏感度与 macro-posture.json 一致', () => {
    const text = section('execution')?.blocks.find(block => block.type === 'p' && block.text.startsWith('成本：'))
    if (!text || text.type !== 'p') throw new Error('缺少成本段落')
    const [switches, turnover, , drag1, , drag3] = (text.text.replace(/−/g, '-').match(/\d+(\.\d+)?/g) ?? []).map(Number)
    const { costs } = macro.backtest
    expectNear('年均换档', switches, variant('full').switchesPerYear, tol(0.1, 0.5))
    expectNear('年换手', turnover, costs.turnoverPerYear * 100, tol(1, 10))
    expectNear('单边 0.10% 的拖累', drag1, costs.rows.find(r => r.cost === 0.001)!.drag * 100, tol(0.01, 0.05))
    expectNear('单边 0.30% 的拖累', drag3, costs.rows.find(r => r.cost === 0.003)!.drag * 100, tol(0.01, 0.1))
  })

  it('统计检验表与 macro-significance 研究结果一致', () => {
    const ids: Record<string, keyof typeof significance.comparisons> = {
      '本策略 vs 恒定七成': 'static70', '本策略 vs 全程持有': 'buyhold', '本策略 vs 十个月均线': 'trend',
    }
    const rows = tableRows(section('evidence'), '统计检验：夏普差是否超出运气范围（2026-11-25 预注册，全样本 644 个月）')
    expect(rows.map(row => row[0])).toEqual(Object.keys(ids))
    for (const row of rows) {
      const c = significance.comparisons[ids[row[0]]]
      expectNear(`${row[0]} 夏普差`, num(row[1]), c.point, 0.005)
      expectNear(`${row[0]} HAC p`, num(row[2]), c.hac.p, 0.0005)
      const [low, high] = range(row[3])
      expectNear(`${row[0]} 区间下限`, low, c.boot['12'].low, 0.0005)
      expectNear(`${row[0]} 区间上限`, high, c.boot['12'].high, 0.0005)
      expectNear(`${row[0]} 校正后 p`, num(row[4]), c.holm.hac, 0.005)
    }
  })

  it('月末收盘价口径表与 month-end-close 研究结果一致', () => {
    const ids: Record<string, keyof typeof monthEnd.table.E1> = {
      '本策略（宏观攻守 v2.2）': 'strategy', 仅十个月均线: 'trend', 恒定七成股票: 'static70', 全程持有标普: 'buyhold',
    }
    const block = section('evidence')?.blocks.find(b => b.type === 'table' && b.caption?.startsWith('月末收盘价口径'))
    if (!block || block.type !== 'table') throw new Error('缺少月末收盘价口径表')
    expect(block.rows.map(row => row[0])).toEqual(Object.keys(ids))
    for (const row of block.rows) {
      const r = monthEnd.table.E1[ids[row[0]]]
      const daily = monthEnd.e1DailyDrawdown[ids[row[0]]]
      expectNear(`${row[0]} 年化`, num(row[1]), r.cagr * 100, 0.005)
      expectNear(`${row[0]} 波动`, num(row[2]), r.vol * 100, 0.005)
      expectNear(`${row[0]} 按月回撤`, num(row[3]), r.maxDd * 100, 0.005)
      expectNear(`${row[0]} 按日回撤`, num(row[4]), daily.maxDd * 100, 0.05)
      expect(row[4]).toContain(daily.trough.slice(0, 4))
      expectNear(`${row[0]} 夏普`, num(row[5]), r.sharpe, 0.005)
    }
    expect(monthEnd.verdict.text).toBe('月末收盘口径下结论不变')
    expect(JSON.stringify(section('evidence'))).toContain(monthEnd.verdict.text)
  })
})
