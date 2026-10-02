import { describe, expect, it } from 'vitest'
import { layoutBySector, squarify } from './ChinaHeatmap'
import type { HeatmapStock } from './ChinaHeatmap'

// 近似沪深300：大行业 + 若干小行业，市值呈长尾分布（固定种子，结果可复现）
function sample(): HeatmapStock[] {
  const sectors: Array<[string, number, number]> = [['Finance', 40, 3e11], ['Electronic Technology', 30, 1.5e11], ['Producer Manufacturing', 30, 1.2e11], ['Energy Minerals', 10, 2e11],
    ['Consumer Non-Durables', 25, 1.3e11], ['Health Technology', 25, 6e10], ['Utilities', 15, 7e10], ['Retail Trade', 3, 4e10], ['Distribution Services', 2, 3e10], ['Miscellaneous', 1, 2e10], ['Commercial Services', 2, 2e10]]
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  return sectors.flatMap(([sector, n, base]) => Array.from({ length: n }, (_, i) => ({
    ticker: `X:${sector}${i}`, code: String(i), name: `${sector}${i}`, sector, close: 10, change: (rnd() - 0.5) * 6,
    marketCap: base * Math.exp(-i * 0.18) * (0.6 + rnd() * 0.8),
  })))
}
const aspect = (r: { w: number; h: number }) => Math.max(r.w / r.h, r.h / r.w)

describe('沪深300 树图布局', () => {
  it('squarify：面积与权重成比例、铺满画布、不重叠，较大的块不被拉成细条', () => {
    const items = [6, 6, 4, 3, 2, 2, 1]
    for (const [w, h] of [[600, 400], [400, 600], [1400, 560]]) {
      const out = squarify(items, v => v, 0, 0, w, h)
      expect(Math.round(out.reduce((sum, r) => sum + r.rect.w * r.rect.h, 0))).toBe(w * h)
      const total = items.reduce((a, b) => a + b, 0)
      out.forEach(({ item, rect }) => expect((rect.w * rect.h) / (w * h)).toBeCloseTo(item / total, 2))
      out.filter(r => r.item >= 3).forEach(({ rect }) => expect(aspect(rect)).toBeLessThan(4))
      for (const a of out) for (const b of out) {
        if (a === b) continue
        const overlapW = Math.min(a.rect.x + a.rect.w, b.rect.x + b.rect.w) - Math.max(a.rect.x, b.rect.x)
        const overlapH = Math.min(a.rect.y + a.rect.h, b.rect.y + b.rect.h) - Math.max(a.rect.y, b.rect.y)
        expect(overlapW > 0.01 && overlapH > 0.01).toBe(false)
      }
    }
  })

  it('按行业分块：小行业并入「其他」，行业块与大个股方块长宽比合理，不出现整行细条', () => {
    const stocks = sample()
    for (const [w, h] of [[1400, 560], [900, 460], [1900, 1000]]) {
      const blocks = layoutBySector(stocks, w, h)
      expect(blocks.some(b => b.name === '其他')).toBe(true)
      expect(blocks.length).toBeLessThanOrEqual(10)
      expect(Math.round(blocks.reduce((sum, b) => sum + b.rect.w * b.rect.h, 0))).toBe(w * h)
      blocks.forEach(b => expect(Math.min(b.rect.w, b.rect.h)).toBeGreaterThan(35)) // 原先出现过 1–2px 的细条
      blocks.forEach(b => expect(aspect(b.rect)).toBeLessThan(9))
      const cells = blocks.flatMap(b => b.stocks.map(s => s.rect)).filter(r => r.w * r.h > w * h * 0.005)
      expect(cells.length).toBeGreaterThan(15)
      cells.forEach(r => expect(aspect(r)).toBeLessThan(6))
      expect(blocks.reduce((sum, b) => sum + b.stocks.length, 0)).toBe(stocks.length)
    }
  })
})
