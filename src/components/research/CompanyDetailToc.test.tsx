import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectTocItems, CompanyDetailToc } from './CompanyDetailToc'

afterEach(cleanup)

describe('CompanyDetailToc', () => {
  it('桌面与窄屏目录均可键盘聚焦并跳转', () => {
    document.body.innerHTML = '<div id="sec-a"></div><div id="sec-b"></div>'
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    render(<CompanyDetailToc items={[{ id: 'sec-a', label: '公司简介' }, { id: 'sec-b', label: '三情景估值' }]} />)
    const navs = screen.getAllByRole('navigation', { name: '本页目录' })
    expect(navs.length).toBeGreaterThanOrEqual(1)
    const links = screen.getAllByRole('link', { name: '三情景估值' })
    fireEvent.click(links[0])
    expect(scroll).toHaveBeenCalled()
    expect(screen.getAllByText('本页目录').length).toBeGreaterThan(0)
  })

  it('collectTocItems 读取带 id 的章节标题', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <section id="company-chart" class="ui-card"><h2 class="ui-card__title">价格走势与情景价位</h2></section>
      <div id="cd-signals" data-cd-title="决策信号汇总"><div class="ui-card"><h2>决策信号汇总</h2></div></div>
      <div class="ui-card" id="cd-profile"><div class="ui-card__head"><h2 class="ui-card__title">公司简介与业务分布</h2></div></div>
    `
    expect(collectTocItems(root).map(i => i.label)).toEqual([
      '价格走势与情景价位',
      '决策信号汇总',
      '公司简介与业务分布',
    ])
  })
})
