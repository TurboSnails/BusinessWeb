import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import JixingTabs, { JIXING_TABS } from './JixingTabs'

afterEach(() => cleanup())

describe('JixingTabs', () => {
  it('含 7 个页签且估值表已改名', () => {
    expect(JIXING_TABS.map(t => t.label)).toEqual([
      '今日星级', '估值表', '阀值表', '指数地图', '指数日报', '港股全球', '牛熊信号板',
    ])
    render(<MemoryRouter initialEntries={['/jixing/threshold']}><JixingTabs /></MemoryRouter>)
    expect(screen.getByRole('tab', { name: '阀值表' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('tab', { name: 'A股估值表' })).toBeNull()
  })
})
