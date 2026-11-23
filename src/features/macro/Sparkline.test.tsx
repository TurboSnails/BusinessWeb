import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Sparkline from './Sparkline'

afterEach(cleanup)

const PTS: [string, number][] = [
  ['2024-11-01', 10],
  ['2025-05-01', 20],
  ['2026-10-01', 15],
]

describe('Sparkline', () => {
  it('SVG 内无 text 节点（读数在 figcaption，不会越界裁切）', () => {
    const { container } = render(<Sparkline points={PTS} label="测试" thresholds={[12]} />)
    expect(container.querySelectorAll('svg text').length).toBe(0)
    expect(screen.getByText('2026-10')).toBeTruthy()
  })

  it('悬停更新 figcaption', () => {
    const { container } = render(<Sparkline points={PTS} label="测试" />)
    const svg = container.querySelector('svg')!
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 240, height: 56, right: 240, bottom: 56, x: 0, y: 0, toJSON() {} })
    fireEvent.pointerMove(svg, { clientX: 4 })
    expect(container.textContent).toMatch(/2024-11/)
  })
})
