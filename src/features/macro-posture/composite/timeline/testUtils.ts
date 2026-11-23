import type { TierId } from '../types'
import type { TimelinePoint } from './chartMath'

const TIERS: TierId[] = ['offense', 'lean-offense', 'neutral', 'lean-defense', 'defense']

/** 生成从 1973-01 起的月度时间线；spx 指数增长，便于检验对数刻度。 */
export function makeTimeline(months = 646, recessions: [string, string][] = [['2008-01', '2009-06']]): TimelinePoint[] {
  return Array.from({ length: months }, (_, index) => {
    const year = 1973 + Math.floor(index / 12)
    const month = (index % 12) + 1
    const d = `${year}-${String(month).padStart(2, '0')}`
    const rec = recessions.some(([from, to]) => d >= from && d <= to) ? 1 : 0
    return {
      d,
      spx: Math.round(100 * Math.pow(1.006, index) * 100) / 100,
      final: TIERS[Math.floor(index / 7) % TIERS.length],
      regime: TIERS[Math.floor(index / 11) % TIERS.length],
      rec: rec as 0 | 1,
    }
  })
}

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number }

function invert(m: Matrix): Matrix {
  const det = m.a * m.d - m.b * m.c
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  }
}

/**
 * 模拟浏览器把 SVG 画在一个与 viewBox 宽高比不同的盒子里（preserveAspectRatio=meet，
 * 内容缩放后水平居中留白）。getBoundingClientRect 返回整个外框，getScreenCTM 返回真实映射。
 */
export function mockSvgGeometry(
  svg: SVGSVGElement,
  box: { left: number; top: number; width: number; height: number },
  viewBox: { width: number; height: number },
): Matrix {
  const scale = Math.min(box.width / viewBox.width, box.height / viewBox.height)
  const ctm: Matrix = {
    a: scale,
    b: 0,
    c: 0,
    d: scale,
    e: box.left + (box.width - viewBox.width * scale) / 2,
    f: box.top + (box.height - viewBox.height * scale) / 2,
  }
  const withInverse = (m: Matrix) => ({ ...m, inverse: () => withInverse(invert(m)) })
  Object.defineProperty(svg, 'getScreenCTM', { configurable: true, value: () => withInverse(ctm) })
  Object.defineProperty(svg, 'createSVGPoint', {
    configurable: true,
    value: () => {
      const point = {
        x: 0,
        y: 0,
        matrixTransform(m: Matrix) {
          return { x: m.a * point.x + m.c * point.y + m.e, y: m.b * point.x + m.d * point.y + m.f }
        },
      }
      return point
    },
  })
  Object.defineProperty(svg, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      ...box,
      x: box.left,
      y: box.top,
      right: box.left + box.width,
      bottom: box.top + box.height,
      toJSON: () => box,
    }),
  })
  return ctm
}
