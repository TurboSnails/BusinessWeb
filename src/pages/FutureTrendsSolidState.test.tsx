import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import FutureTrendsSolidState from './FutureTrendsSolidState'
import { SOLID_REVIEW } from '../data/solidState/review'

afterEach(cleanup)

describe('固态电池专题：10 月 10 日 MCP 复核', () => {
  it('专题页展示候选与核心分层，并在页内目录提供入口', () => {
    render(<MemoryRouter><FutureTrendsSolidState /></MemoryRouter>)
    const section = screen.getByRole('region', { name: new RegExp(`候选与核心分层 · ${SOLID_REVIEW.asOf}`) })
    expect(within(section).getAllByRole('link', { name: '宁德时代' })[0].getAttribute('href')).toBe('/future-trends/solid-state/300750-sz')
    const nav = screen.getByRole('navigation', { name: '固态电池专题索引' })
    expect(within(nav).getByRole('link', { name: '候选与核心分层' }).getAttribute('href')).toBe('#solid-review')
  })
})
