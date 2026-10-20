import { describe, expect, it } from 'vitest'
import { fallbackPlates, findPlate, matchesPlateType, parseSectorPayload, plateChangePercent, toHotStocks, toSectors } from './classify'

describe('matchesPlateType', () => {
  it('接口带类型字段时以接口为准', () => {
    expect(matchesPlateType({ secu_name: '银行', plate_type: 'concept' }, 'concept')).toBe(true)
    expect(matchesPlateType({ secu_name: '人工智能', type: '2' }, 'industry')).toBe(true)
    expect(matchesPlateType({ secu_name: '人工智能', type: '2' }, 'concept')).toBe(false)
    expect(matchesPlateType({ secu_name: '机器人', category: '概念板块' }, 'concept')).toBe(true)
  })

  it('无类型字段时概念按关键词判断，名称恰为行业名的排除', () => {
    expect(matchesPlateType({ secu_name: '人形机器人' }, 'concept')).toBe(true)
    expect(matchesPlateType({ secu_name: '银行' }, 'concept')).toBe(false)
    expect(matchesPlateType({ name: '白酒' }, 'concept')).toBe(true) // 不在行业名单 → 视为概念
  })

  it('行业排除带概念/题材/主题字样和明确概念词的板块', () => {
    expect(matchesPlateType({ secu_name: '银行' }, 'industry')).toBe(true)
    expect(matchesPlateType({ secu_name: '光伏主题' }, 'industry')).toBe(false)
    expect(matchesPlateType({ secu_name: '商业航天' }, 'industry')).toBe(false)
  })
})

describe('fallbackPlates', () => {
  it('概念降级只排除完全等于行业名的板块；行业降级只排除完全等于概念名的板块', () => {
    const plates = [{ secu_name: '银行' }, { secu_name: '银行指数' }, { secu_name: 'AI应用' }, { secu_name: '军工题材' }]
    expect(fallbackPlates(plates, 'concept').map(p => p.secu_name)).toEqual(['银行指数', 'AI应用', '军工题材'])
    expect(fallbackPlates(plates, 'industry').map(p => p.secu_name)).toEqual(['银行', '银行指数'])
  })
})

describe('toSectors', () => {
  it('统一涨跌幅单位、去掉空名称、按涨幅排序并截取前 N', () => {
    const rows = toSectors([
      { secu_name: '甲', secu_code: 'cls1', change: 0.052 },
      { secu_name: '乙', secu_code: 'cls2', change: 3.1 },
      { secu_name: ' ', secu_code: 'cls3', change: 9 },
      { secu_name: '丙', secu_code: 'cls4', change: -0.01 },
    ], '2026-10-20', 2)
    expect(rows).toEqual([
      { name: '甲', code: 'cls1', changePercent: 5.2, rank: 1, date: '2026-10-20' },
      { name: '乙', code: 'cls2', changePercent: 3.1, rank: 2, date: '2026-10-20' },
    ])
  })
})

describe('parseSectorPayload', () => {
  it('格式不符返回 null', () => {
    expect(parseSectorPayload({ code: 500 }, '2026-10-20', 'concept', 10)).toBeNull()
    expect(parseSectorPayload(undefined, '2026-10-20', 'concept', 10)).toBeNull()
  })

  it('返回前 N 名与过滤后的原始数据，并标明分类来源', () => {
    const payload = { code: 200, data: { plate_stock: [{ secu_name: '机器人', change: 0.02, stock_list: [] }, { secu_name: '银行', change: 0.03 }] } }
    const parsed = parseSectorPayload(payload, '2026-10-20', 'concept', 10)!
    expect(parsed.sectors.map(s => s.name)).toEqual(['机器人'])
    expect(parsed.rawData).toEqual([payload.data.plate_stock[0]])
    expect(parsed.classifiedBy).toBe('keyword')
  })

  it('正常过滤为空时使用降级结果', () => {
    const payload = { code: 200, data: { plate_stock: [{ secu_name: '银行', plate_type: 'industry', change: 1 }] } }
    const parsed = parseSectorPayload(payload, '2026-10-20', 'concept', 10)!
    expect(parsed.classifiedBy).toBe('api')
    expect(parsed.sectors).toEqual([])
    expect(parsed.rawData).toEqual([])
  })
})

describe('findPlate / plateChangePercent / toHotStocks', () => {
  const plates = [{ secu_code: 'cls1', secu_name: '机器人', change: 0.031 }, { code: 'cls2', name: '光伏', change_percent: '2.5' }]

  it('按代码或名称查找，空参数不参与匹配', () => {
    expect(findPlate(plates, 'cls2', '')).toBe(plates[1])
    expect(findPlate(plates, '', '机器人')).toBe(plates[0])
    expect(findPlate(plates, '', '')).toBeUndefined()
  })

  it('涨跌幅兼容小数、百分数与数字字符串', () => {
    expect(plateChangePercent(plates[0])).toBeCloseTo(3.1)
    expect(plateChangePercent(plates[1])).toBe(2.5)
    expect(plateChangePercent({})).toBe(0)
  })

  it('热门股票：代码取 6 位数字、按涨幅排序、去掉缺名称或代码的', () => {
    const stocks = toHotStocks({ stock_list: [
      { secu_code: 'sz002050', secu_name: '三花智控', last_px: '30.5', change: 0.0997, amount: 50000 },
      { secu_code: 'sh600000', secu_name: '浦发银行', last_px: 10, change: 0.01 },
      { secu_code: '', secu_name: '无代码' },
    ] })
    expect(stocks?.map(s => s.code)).toEqual(['002050', '600000'])
    expect(stocks?.[0]).toMatchObject({ price: 30.5, amount: 5 })
    expect(stocks?.[0].changePercent).toBeCloseTo(9.97)
    expect(toHotStocks({ secu_name: '无成分股' })).toBeNull()
  })
})
