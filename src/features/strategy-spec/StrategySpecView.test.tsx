import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { compareSpecs, parseCompare } from './compare'
import StrategySpecView from './StrategySpecView'
import { STRATEGY_SPECS } from './index'
import type { StrategySpec } from './types'

afterEach(cleanup)

const base = STRATEGY_SPECS[0]
/** 测试用的假想新版本：改一章、加一章、删一章 */
const next: StrategySpec = {
  ...base,
  version: '9.9.0',
  date: '2027-01-01',
  changes: ['测试：改执行节奏'],
  sections: [
    ...base.sections.filter(s => s.id !== 'limits').map(s => s.id === 'execution'
      ? { ...s, blocks: [{ type: 'p' as const, text: '分两笔调仓。' }] }
      : s),
    { id: 'new-one', title: '新增一章', blocks: [{ type: 'p', text: '新内容' }] },
  ],
}
const specs: StrategySpec[] = [next, { ...base, status: 'archived' }]

function renderAt(url: string, list: StrategySpec[] = STRATEGY_SPECS) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <StrategySpecView specs={list} />
    </MemoryRouter>,
  )
}

describe('compareSpecs / parseCompare', () => {
  it('按章节 id 对齐，标出相同、有变化、新增、删除', () => {
    const diffs = compareSpecs(base, next)
    const status = Object.fromEntries(diffs.map(d => [d.id, d.status]))
    expect(status.execution).toBe('changed')
    expect(status.overview).toBe('same')
    expect(status['new-one']).toBe('added')
    expect(status.limits).toBe('removed')
    expect(diffs.at(-1)?.id).toBe('limits')
  })

  it('解析 a..b，容忍 v 前缀，格式不对返回 null', () => {
    expect(parseCompare('v1.0.0..1.1.0')).toEqual(['1.0.0', '1.1.0'])
    expect(parseCompare('1.0.0')).toBeNull()
    expect(parseCompare(null)).toBeNull()
  })
})

describe('StrategySpecView', () => {
  it('默认显示现行版本：版本号、组成部件、目录与全部章节；只有一个版本时提示以后可对比', () => {
    renderAt('/invest/strategy/spec', [base])
    expect(screen.getByTestId('ss-cover').textContent).toContain(`v${base.version}`)
    expect(screen.getByTestId('ss-meta').textContent).toContain('宏观攻守 v2.2')
    expect(screen.getByTestId('ss-toc').querySelectorAll('li')).toHaveLength(base.sections.length)
    for (const section of base.sections) {
      expect(screen.getByRole('heading', { level: 2, name: section.title })).toBeTruthy()
    }
    expect(screen.getByTestId('ss-compare-hint').textContent).toContain('只有一个版本')
  })

  it('有两个版本时可以对比：显示差异章节与改动说明，相同章节默认收起', () => {
    renderAt('/invest/strategy/spec', specs)
    fireEvent.click(screen.getByTestId('ss-compare-start'))
    expect(screen.getByTestId('ss-compare-summary').textContent).toBe(`v${base.version} → v9.9.0：${base.sections.length + 1} 章里有 3 章不同。`)
    const changed = document.querySelector('.ss-diff[data-status="changed"]') as HTMLDetailsElement
    expect(changed.open).toBe(true)
    expect(changed.textContent).toContain('分两笔调仓。')
    const same = document.querySelector('.ss-diff[data-status="same"]') as HTMLDetailsElement
    expect(same.open).toBe(false)
    expect(screen.getByText('测试：改执行节奏')).toBeTruthy()
  })

  it('网址指定已归档版本时显示归档提示；指定不存在的版本时退回现行版本并提示', () => {
    renderAt(`/invest/strategy/spec?v=${base.version}`, specs)
    expect(screen.getByTestId('ss-archived').textContent).toContain('现行版本是')
    cleanup()
    renderAt('/invest/strategy/spec?v=3.0.0', specs)
    expect(screen.getByTestId('ss-missing').textContent).toContain('v9.9.0')
    expect(screen.getByTestId('ss-cover').textContent).toContain('v9.9.0')
  })

  it('真实版本：v1.0.1 可与已归档的 v1.0.0 逐章对比', () => {
    renderAt('/invest/strategy/spec?compare=1.0.0..1.0.1')
    expect(screen.getByTestId('ss-compare-summary').textContent).toMatch(/^v1\.0\.0 → v1\.0\.1：\d+ 章里有 \d+ 章不同。$/)
    const changed = [...document.querySelectorAll('.ss-diff[data-status="changed"]')].map(node => node.querySelector('.ss-diff__title')?.textContent)
    expect(changed).toEqual(expect.arrayContaining(['五、熔断：极端情况下封顶', '十一、执行', '十二、短线预警与置信度（不改变仓位）']))
    expect(document.querySelectorAll('.ss-diff[data-status="added"], .ss-diff[data-status="removed"]')).toHaveLength(0)
  })

  it('真实版本：v1.0.2 相对 v1.0.1 只有加了检验的章节有变化', () => {
    renderAt('/invest/strategy/spec?compare=1.0.1..1.0.2')
    expect(screen.getByTestId('ss-compare-summary').textContent).toMatch(/^v1\.0\.1 → v1\.0\.2：/)
    const changed = [...document.querySelectorAll('.ss-diff[data-status="changed"]')].map(node => node.querySelector('.ss-diff__title')?.textContent)
    expect(changed).toEqual(['一、概要', '十三、回测证据', '十五、已知局限'])
  })

  it('真实版本：v1.0.4 相对 v1.0.3 只有第十四章有变化', () => {
    renderAt('/invest/strategy/spec?compare=1.0.3..1.0.4')
    expect(screen.getByTestId('ss-compare-summary').textContent).toMatch(/^v1\.0\.3 → v1\.0\.4：16 章里有 1 章不同。$/)
    const changed = [...document.querySelectorAll('.ss-diff[data-status="changed"]')].map(node => node.querySelector('.ss-diff__title')?.textContent)
    expect(changed).toEqual(['十四、对照方案与已检验但未采用的改动'])
  })

  it('真实版本：v1.0.5 相对 v1.0.4 是概要、执行、回测证据和已知局限四章', () => {
    renderAt('/invest/strategy/spec?compare=1.0.4..1.0.5')
    expect(screen.getByTestId('ss-compare-summary').textContent).toMatch(/^v1\.0\.4 → v1\.0\.5：16 章里有 4 章不同。$/)
    const changed = [...document.querySelectorAll('.ss-diff[data-status="changed"]')].map(node => node.querySelector('.ss-diff__title')?.textContent)
    expect(changed).toEqual(['一、概要', '十一、执行', '十三、回测证据', '十五、已知局限'])
  })

  it('真实版本：v1.0.6 相对 v1.0.5 是数据口径、执行和回测证据三章', () => {
    renderAt('/invest/strategy/spec?compare=1.0.5..1.0.6')
    expect(screen.getByTestId('ss-compare-summary').textContent).toMatch(/^v1\.0\.5 → v1\.0\.6：16 章里有 3 章不同。$/)
    const changed = [...document.querySelectorAll('.ss-diff[data-status="changed"]')].map(node => node.querySelector('.ss-diff__title')?.textContent)
    expect(changed).toEqual(['八、数据口径与可得时点', '十一、执行', '十三、回测证据'])
  })

  it('真实版本：v1.0.7 相对 v1.0.6 是概要、回测证据、对照方案和已知局限四章', () => {
    renderAt('/invest/strategy/spec?compare=1.0.6..1.0.7')
    expect(screen.getByTestId('ss-compare-summary').textContent).toMatch(/^v1\.0\.6 → v1\.0\.7：16 章里有 4 章不同。$/)
    const changed = [...document.querySelectorAll('.ss-diff[data-status="changed"]')].map(node => node.querySelector('.ss-diff__title')?.textContent)
    expect(changed).toEqual(['一、概要', '十三、回测证据', '十四、对照方案与已检验但未采用的改动', '十五、已知局限'])
  })

  it('真实版本：现行 v1.2.8，「对比最近两个版本」是执行、对照方案和已知局限三章', () => {
    renderAt('/invest/strategy/spec')
    expect(screen.getByTestId('ss-cover').textContent).toContain('v1.2.8')
    fireEvent.click(screen.getByTestId('ss-compare-start'))
    expect(screen.getByTestId('ss-compare-summary').textContent).toMatch(/^v1\.2\.7 → v1\.2\.8：16 章里有 3 章不同。$/)
    const changed = [...document.querySelectorAll('.ss-diff[data-status="changed"]')].map(node => node.querySelector('.ss-diff__title')?.textContent)
    expect(changed).toEqual(['十一、执行', '十四、对照方案与已检验但未采用的改动', '十五、已知局限'])
  })
})
