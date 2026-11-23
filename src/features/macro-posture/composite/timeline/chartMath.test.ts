import { describe, expect, it } from 'vitest'
import {
  CHART_LEFT,
  CHART_RIGHT,
  indexFromClientX,
  logTicks,
  normalizeRange,
  panRange,
  placeTooltip,
  recentRange,
  recessionWindows,
  xTicks,
  zoomRange,
} from './chartMath'
import { makeTimeline, mockSvgGeometry } from './testUtils'

function svgWithViewBox(width: number, height: number): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  return svg
}

describe('indexFromClientX', () => {
  const width = 640
  const plotWidth = width - CHART_LEFT - CHART_RIGHT
  const full = { start: 0, end: 645 }

  it('容器比 viewBox 宽（meet 居中留白）时仍按真实绘制位置选中月份', () => {
    const svg = svgWithViewBox(width, 380)
    // 外框 1600×380，内容按 1:1 绘制在中间，左右各留 480px 空白。
    mockSvgGeometry(svg, { left: 100, top: 50, width: 1600, height: 380 }, { width, height: 380 })
    const origin = 100 + 480
    expect(indexFromClientX(svg, origin + CHART_LEFT, full, width)).toBe(0)
    expect(indexFromClientX(svg, origin + CHART_LEFT + plotWidth, full, width)).toBe(645)
    expect(indexFromClientX(svg, origin + CHART_LEFT + plotWidth / 2, full, width)).toBe(323)
    // 旧算法（直接按外框宽度换算）在同一点会偏出一百多个月。
    const naiveSvgX = ((origin + CHART_LEFT - 100) / 1600) * width
    const naiveIndex = Math.round(((naiveSvgX - CHART_LEFT) / plotWidth) * 645)
    expect(naiveIndex).toBeGreaterThan(100)
  })

  it('等比放大 2 倍时按缩放换算，并按当前可见区间取月份', () => {
    const svg = svgWithViewBox(width, 380)
    mockSvgGeometry(svg, { left: 0, top: 0, width: 1280, height: 760 }, { width, height: 380 })
    const range = { start: 400, end: 459 }
    expect(indexFromClientX(svg, (CHART_LEFT + plotWidth / 2) * 2, range, width)).toBe(430)
    expect(indexFromClientX(svg, 0, range, width)).toBe(400)
    expect(indexFromClientX(svg, 5000, range, width)).toBe(459)
  })
})

describe('区间运算', () => {
  it('recentRange 取最后 N 个月，normalizeRange 限制最小跨度', () => {
    expect(recentRange(646, 60)).toEqual({ start: 586, end: 645 })
    expect(recentRange(646, 646)).toEqual({ start: 0, end: 645 })
    expect(normalizeRange({ start: 100, end: 102 }, 646)).toEqual({ start: 100, end: 111 })
  })

  it('zoomRange 以锚点为中心缩放，panRange 不越界', () => {
    const zoomed = zoomRange({ start: 0, end: 645 }, 646, 0.5, 0.5)
    expect(zoomed.end - zoomed.start).toBe(323)
    expect(Math.abs((zoomed.start + zoomed.end) / 2 - 322.5)).toBeLessThanOrEqual(1)
    expect(panRange({ start: 586, end: 645 }, 646, 30)).toEqual({ start: 586, end: 645 })
    expect(panRange({ start: 10, end: 69 }, 646, -30)).toEqual({ start: 0, end: 59 })
  })
})

describe('recessionWindows', () => {
  it('每次衰退取起点前 24 个月到结束后 12 个月，开头不足时截断', () => {
    const pts = makeTimeline(646, [['1974-01', '1975-03'], ['2008-01', '2009-06']])
    const windows = recessionWindows(pts)
    expect(windows.map(window => window.label)).toEqual(['1974-01 — 1975-03', '2008-01 — 2009-06'])
    const gfc = windows[1].range
    expect(pts[gfc.start].d).toBe('2006-01')
    expect(pts[gfc.end].d).toBe('2010-06')
    const first = windows[0].range
    expect(pts[first.start].d).toBe('1973-01')
    expect(pts[first.end].d).toBe('1976-03')
  })
})

describe('坐标刻度', () => {
  it('对数纵轴刻度随可见数据变化', () => {
    expect(logTicks(100, 4500)).toEqual([200, 500, 1000, 2000])
    expect(logTicks(100, 8100, 6)).toEqual([200, 500, 1000, 2000, 5000])
    // 跨度窄（近 5 年）时退回等距整数刻度，不出现 4252、5274 这类零碎数。
    expect(logTicks(3700, 8100, 4)).toEqual([4000, 5000, 6000, 7000])
    expect(logTicks(6800, 8200, 4)).toEqual([7000, 7500, 8000])
  })

  it('横轴按跨度选择年代 / 年 / 季度，且首尾不与中间刻度重叠', () => {
    const pts = makeTimeline()
    expect(xTicks(pts, { start: 0, end: 645 }, 1000)[1].mode).toBe('decade')
    expect(xTicks(pts, { start: 526, end: 645 }, 1000)[1].mode).toBe('year')
    const quarter = xTicks(pts, { start: 622, end: 645 }, 1000)
    expect(quarter[1].mode).toBe('quarter')
    expect(quarter.slice(1, -1).every(tick => ['01', '04', '07', '10'].includes(tick.label.slice(5)))).toBe(true)
    const pxPerMonth = 1000 / 23
    for (let index = 1; index < quarter.length; index += 1) {
      expect((quarter[index].index - quarter[index - 1].index) * pxPerMonth).toBeGreaterThanOrEqual(66)
    }
  })

  it('窄屏全历史仍有年代刻度，且彼此不挤在一起', () => {
    const pts = makeTimeline()
    const ticks = xTicks(pts, { start: 0, end: 645 }, 274)
    const labels = ticks.map(tick => tick.label)
    expect(labels[0]).toBe('1973')
    expect(labels[labels.length - 1]).toBe('2026')
    expect(labels.length).toBeGreaterThanOrEqual(3)
    expect(labels.slice(1, -1).every(label => Number(label) % 10 === 0)).toBe(true)
  })
})

describe('placeTooltip', () => {
  const card = { width: 210, height: 150 }
  it('默认放在指针右下，靠右边时翻到左侧，靠底时翻到上方', () => {
    expect(placeTooltip({ x: 100, y: 50 }, card, { width: 1000, height: 380 })).toEqual({ left: 114, top: 64 })
    expect(placeTooltip({ x: 900, y: 50 }, card, { width: 1000, height: 380 })).toEqual({ left: 676, top: 64 })
    expect(placeTooltip({ x: 900, y: 300 }, card, { width: 1000, height: 380 })).toEqual({ left: 676, top: 136 })
  })

  it('窄屏两侧都放不下时水平居中并放到指针上方或下方，整张卡留在图内且不盖住指针', () => {
    const box = { width: 356, height: 300 }
    const pointer = { x: 178, y: 200 }
    const placed = placeTooltip(pointer, card, box)
    expect(placed.left).toBeGreaterThanOrEqual(4)
    expect(placed.left + card.width).toBeLessThanOrEqual(box.width - 4)
    expect(placed.top + card.height).toBeLessThanOrEqual(pointer.y)
    expect(placed.top).toBeGreaterThanOrEqual(4)
  })
})
