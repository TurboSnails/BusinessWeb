import { describe, expect, it } from 'vitest'
import { exampleValuation } from './testFixture'
import { getValuationPresentation } from './presentation'

const undated = (low = 90, base = 100, high = 120) => {
  const r = exampleValuation()
  r.value = { ...r.value!, low, base, high, kind: 'undated', date: null }
  return r
}
const quote = (price: number, extra: object = {}) => ({ price, priceDate: '2026-10-22', currency: 'USD', checkedAt: '', source: 'x', originalAsOf: '', ...extra }) as never

describe('getValuationPresentation', () => {
  it('未定期限：方向+百分比（分母为base）+区间位置，区间内弱色', () => {
    const p = getValuationPresentation(undated(), quote(95))
    expect(p.headline).toBe('情景偏低 5.0%')
    expect(p.positionLabel).toBe('区间内')
    expect(p.tone).toBe('under')
    expect(p.emphasis).toBe('muted')
    expect(p.current).toBe(95)
    expect(p.priceDate).toBe('2026-10-22')
    expect(p.timingLabel).toBe('未定期限')
  })
  it('区间外强色，偏高；等于low/high属区间内', () => {
    const below = getValuationPresentation(undated(), quote(80))
    expect([below.headline, below.positionLabel, below.emphasis]).toEqual(['情景偏低 20.0%', '低于区间', 'strong'])
    const above = getValuationPresentation(undated(), quote(150))
    expect([above.headline, above.positionLabel, above.tone, above.emphasis]).toEqual(['情景偏高 50.0%', '高于区间', 'over', 'strong'])
    expect(getValuationPresentation(undated(), quote(90)).positionLabel).toBe('区间内')
    expect(getValuationPresentation(undated(), quote(120)).positionLabel).toBe('区间内')
  })
  it('present可称低估/高估；精度内零值为接近基准', () => {
    expect(getValuationPresentation(exampleValuation(), quote(80)).headline).toBe('低估 20.0%')
    expect(getValuationPresentation(exampleValuation(), quote(130)).headline).toBe('高估 30.0%')
    const fair = getValuationPresentation(exampleValuation(), quote(100.04))
    expect(fair.headline).toBe('接近基准')
    expect(fair.tone).toBe('fair')
  })
  it('异常大的偏高改为现价N×基准，不出现Infinity/NaN', () => {
    const p = getValuationPresentation(undated(1, 1, 2), quote(60))
    expect(p.headline).toBe('情景偏高 现价 60.0×基准')
    for (const r of [undated(0, 0, 0), undated(1e-9, 1e-9, 1e-9)]) {
      const q = getValuationPresentation(r, quote(100))
      expect(q.headline).not.toMatch(/Infinity|NaN/)
    }
  })
  it('零base不作除数且无位置', () => {
    const p = getValuationPresentation(undated(0, 0, 0), quote(100))
    expect(p.headline).toBe('基准不可比')
    expect(p.positionLabel).toBeNull()
    expect(p.tone).toBe('waiting')
  })
  it('future：显示目标日期与相对现价空间(分母现价)，不称今日高低估', () => {
    const r = exampleValuation()
    r.value = { ...r.value!, kind: 'future', date: '2028-10-22' }
    const p = getValuationPresentation(r, quote(80))
    expect(p.headline).toContain('2028-10-22')
    expect(p.headline).toContain('+25.0%')
    expect(p.headline).not.toMatch(/低估|高估/)
    expect(p.positionLabel).toBeNull()
    expect(p.emphasis).toBe('muted')
    expect(p.timingLabel).toBe('2028-10-22目标')
  })
  it('insufficient/无值=等待证据；缺价=缺少现价', () => {
    const r = exampleValuation()
    r.status = 'insufficient'; r.value = null
    const p = getValuationPresentation(r)
    expect([p.headline, p.positionLabel, p.tone, p.emphasis]).toEqual(['等待证据', null, 'waiting', 'muted'])
    const np = undated(); np.price = { ...np.price, value: null, date: null }
    const q = getValuationPresentation(np)
    expect([q.headline, q.current, q.priceDate, q.positionLabel, q.tone]).toEqual(['缺少现价', null, null, null, 'waiting'])
  })
  it('刷新价守卫：不同币种/旧报价/unverified沿用记录价', () => {
    const r = undated()
    expect(getValuationPresentation(r, quote(50, { currency: 'HKD' })).current).toBe(100)
    expect(getValuationPresentation(r, quote(50, { priceDate: '2026-10-01' })).current).toBe(100)
    expect(getValuationPresentation(r, quote(50, { tradability: 'unverified' })).current).toBe(100)
    expect(getValuationPresentation(r, quote(50)).current).toBe(50)
  })
  it('证据提示是具体短标签，按优先级最多一条，不返回长段原文', () => {
    const r = undated()
    r.missing = ['一手财报与公司公告未在本批次逐家重读', '前瞻EPS预测财年未绑定，仅为未定期限敏感性', '报价币种USD/财报币种CNY的独立转换桥接待核', 'PE目标倍数缺同口径依据']
    expect(getValuationPresentation(r).evidenceNote).toBe('币种/股份换算待核')
    r.missing = ['一手财报与公司公告未在本批次逐家重读', 'PE目标倍数缺同口径依据', '前瞻EPS预测财年未绑定']
    expect(getValuationPresentation(r).evidenceNote).toBe('研究倍数待核')
    r.missing = ['一手财报与公司公告未在本批次逐家重读', '前瞻EPS预测财年未绑定']
    expect(getValuationPresentation(r).evidenceNote).toBe('预测年度待绑定')
    r.missing = ['一致预期前瞻EPS与原研究基准EPS相差9倍，口径冲突']
    expect(getValuationPresentation(r).evidenceNote).toBe('前瞻盈利口径待核')
  })
  it('反例：只有DCF通用缺项/普遍未重读不显示币种待核；正常方法reason含倍数不被误判', () => {
    const r = undated()
    r.missing = ['一手财报与公司公告未在本批次逐家重读', 'DCF股权自由现金流完整桥接与资本开支预测未纳入本批次自动计值']
    r.methods[0] = { ...r.methods[0], reason: '研究倍数18/20/24与正常化盈利一致' }
    expect(getValuationPresentation(r).evidenceNote).toBeNull()
  })
  it('缺项为空不代表已认证：无证据提示且不输出已验证字样', () => {
    const r = undated(); r.missing = []
    const p = getValuationPresentation(r, quote(95))
    expect(p.evidenceNote).toBeNull()
    expect(JSON.stringify(p)).not.toMatch(/已认证|已核实|已验证/)
  })
  it('insufficient的证据提示来自其缺项', () => {
    const r = exampleValuation(); r.status = 'insufficient'; r.value = null
    r.missing = ['PE主锚未计值：研究倍数缺失']
    expect(getValuationPresentation(r).evidenceNote).toBe('研究倍数待核')
    r.missing = ['其他原因']
    expect(getValuationPresentation(r).evidenceNote).toBe('关键证据待补')
  })
  it('真实记录回归：cn:000001撤回优先于分部/少数股东', () => {
    const r = exampleValuation(); r.status = 'insufficient'; r.value = null
    r.missing = ['原研究已撤回稳态PB模型（本轮不认证赔率，不恢复原模型）：PB 主锚不得复用撤回数值', '一手财报与公司公告未在本批次逐家重读', 'SOTP/NAV 行业锚未计值：分部价值、少数股东、母公司现金与控股折价桥接未闭合，输入待核']
    expect(getValuationPresentation(r).evidenceNote).toBe('原模型已撤回')
  })
  it('真实记录回归：cn:601360(26.2×)/603000(9.9×)显示倍数并提示盈利与倍数待核，不宣告错误', () => {
    const period = 'PE 为期限未定义敏感性：前瞻 EPS 未绑定财年，不认证今日内在价值'
    for (const [low, base, high, price, text] of [[0.22, 0.32, 0.44, 8.38, '现价 26.2×基准'], [1.3, 1.69, 2.08, 16.77, '现价 9.9×基准']] as const) {
      const r = undated(low, base, high)
      r.methods[0] = { ...r.methods[0], inputs: { epsTrailingTwelveMonths: 0.11, epsForward: 0.01, researchMultiples: { low: 22, base: 32, high: 44 } } }
      r.missing = ['一手财报与公司公告未在本批次逐家重读', period]
      const p = getValuationPresentation(r, quote(price))
      expect(p.headline).toBe(`情景偏高 ${text}`)
      expect(p.evidenceNote).toBe('盈利与倍数待核')
      expect(p.evidenceNote).not.toMatch(/错误|已认证/)
    }
  })
  it('极端偏高且无EPS/倍数输入=基准输入待核；有币种缺项时币种优先；非极端回落预测年度', () => {
    const r = undated(1, 1, 2)
    r.methods[0] = { ...r.methods[0], inputs: { bvps: 1 } }
    r.missing = ['前瞻预测财年未绑定']
    expect(getValuationPresentation(r, quote(5)).evidenceNote).toBe('基准输入待核')
    r.missing = ['报价币种USD/财报币种CNY转换桥接待核', '前瞻预测财年未绑定']
    expect(getValuationPresentation(r, quote(5)).evidenceNote).toBe('币种/股份换算待核')
    r.missing = ['前瞻预测财年未绑定']
    expect(getValuationPresentation(r, quote(1.5)).evidenceNote).toBe('预测年度待绑定')
  })
})
