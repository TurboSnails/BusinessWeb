import { describe, expect, it } from 'vitest'
import { breadthGauges, fundingGauges, gauge, technicalGauges, valuationGauges } from './engine'

describe('阈值刻度', () => {
  it('分区边界与判定规则一致，提示给出最近一档的距离', () => {
    const [pe] = valuationGauges(false, 34.2)
    expect(pe.zones.map(z => [z.from, z.to, z.tone])).toEqual([[0, 10, 'bottom'], [10, 90, 'neutral'], [90, 100, 'risk']])
    expect(pe.hint).toBe('当前位于「中间」区，再下降24.2个百分点进入「低估」区。')
    const [erp] = valuationGauges(true, 0.59)
    expect(erp.hint).toContain('再上升0.91进入「低估」区')
  })
  it('超出刻度的值仍落在端点所在区，且不给反向提示', () => {
    expect(gauge({ label: 'x', value: 120, min: 0, zones: [{ to: 50, tone: 'neutral', label: '低' }, { to: 100, tone: 'risk', label: '高' }] }).hint).toBe('当前位于「高」区，再下降70进入「低」区。')
    expect(gauge({ label: 'x', value: -5, min: 0, zones: [{ to: 50, tone: 'bottom', label: '低' }, { to: 100, tone: 'risk', label: '高' }] }).hint).toBe('当前位于「低」区，再上升55进入「高」区。')
  })
  it('宽度带4周前位置，A股资金给出两个条件，技术说明破位进度', () => {
    const [b] = breadthGauges(11.1, 14.8)
    expect(b.prior).toBe(14.8)
    expect(b.hint).toContain('再下降1.1个百分点进入「极度低迷」区')
    expect(fundingGauges(true, 0.74, 5.64)).toHaveLength(2)
    expect(fundingGauges(false, 0.72, 400.08)[0].hint).toContain('南向近20日净买入400.08亿元')
    expect(technicalGauges(-9.5, 42.4, -146.27, true)[0].hint).toContain('已连续两周在线下')
  })
})
