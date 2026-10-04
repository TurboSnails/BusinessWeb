import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PageHero from './PageHero'

afterEach(cleanup)

describe('PageHero', () => {
  it('渲染 h1 标题、副标题和图标', () => {
    render(<PageHero icon={<svg data-testid="ic" />} title="综合投资策略框架" subtitle="融合巴菲特 · 邓普顿" />)
    expect(screen.getByRole('heading', { level: 1, name: '综合投资策略框架' })).toBeTruthy()
    expect(screen.getByText('融合巴菲特 · 邓普顿')).toBeTruthy()
    expect(screen.getByTestId('ic')).toBeTruthy()
  })

  it('没有副标题时不渲染空段落', () => {
    const { container } = render(<PageHero icon={<svg />} title="只有标题" />)
    expect(container.querySelector('.page-hero__subtitle')).toBeNull()
  })

  it('使用纸书风样式类，不带内联渐变', () => {
    const { container } = render(<PageHero icon={<svg />} title="x" />)
    expect(container.querySelector('.page-hero')).toBeTruthy()
    expect(container.innerHTML).not.toMatch(/gradient/)
  })
})
