// @ts-ignore 测试环境在 Node 中运行，项目未安装 @types/node
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'
import React from 'react'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import ResearchNotes from './ResearchNotes'
import CompanyDetail from './CompanyDetail'
import { findCompany, loadCompanies } from '../data/companies'

// 程序化补全公司（public/data/*.json）的烟雾测试：列表加载、分页、搜索、评级筛选、详情页
beforeAll(() => {
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', async (url: string) => {
    const u = String(url)
    const name = u.includes('us.json') ? 'us.json' : u.includes('hk.json') ? 'hk.json' : u.includes('adr.json') ? 'adr.json' : u.includes('lynch.json') ? 'lynch.json' : 'cn.json'
    const text = readFileSync(resolve('public/data', name), 'utf8')
    return { ok: true, json: async () => JSON.parse(text) } as Response
  })
})
afterEach(() => cleanup())

const renderAt = (path: string): void => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/research-notes" element={<ResearchNotes />} />
        <Route path="/research-notes/:market/:code" element={<CompanyDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('补全公司：研究笔记列表与详情', () => {
  it('圆桌复核同时覆盖手工与异步补全，撤回未验证的达标标签', async () => {
    expect(findCompany('us', 'PEP')?.headline).toContain('基准赔率未达标')
    const list = await loadCompanies('us')
    for (const code of ['ZTS', 'SPGI', 'CVS', 'AES', 'CINF', 'OMC', 'UHS']) {
      const company = list.find(c => c.code === code)
      expect(company?.rating).toBe('观察（待重建）')
      expect(company?.scenarios || []).toHaveLength(0)
      expect(company?.metrics.some(([key]) => key === '上轮结论（存档）')).toBe(true)
    }
    expect(list.find(c => c.code === 'PEP')?.ratioNote).toContain('0.73')
    for (const code of ['MSFT', 'NVDA', 'ORCL']) {
      expect(list.find(c => c.code === code)?.metrics.some(([key]) => key === '本轮一手现金流证据')).toBe(true)
    }
    expect(list.find(c => c.code === 'ACN')?.auto).toBe(true)
  })

  it('标普列表展示圆桌汇总入口及研究边界', async () => {
    renderAt('/research-notes?tab=category&m=us')
    expect(screen.getByText('腾讯自选股投研专家团 · 再分析汇总')).toBeTruthy()
    expect(screen.getByRole('link', { name: '完整圆桌报告' }).getAttribute('href')).toContain('sp500-roundtable-2026-09-30.html')
    expect(screen.getByText(/504 条研究记录/)).toBeTruthy()
  })

  it('补全候选详情准确区分公告复核和未认证的程序化模型', async () => {
    renderAt('/research-notes/us/CVS')
    await waitFor(() => expect(screen.getByText(/本轮已补充公司公告/)).toBeTruthy())
    expect(screen.getByRole('link', { name: '查看本轮完整报告与一手来源' })).toBeTruthy()
    expect(screen.getByText(/待补充三情景估值表/)).toBeTruthy()
  })

  it('沪深列表加载补全数据，支持搜索与评级筛选、分页', async () => {
    renderAt('/research-notes?tab=category&m=cn')
    await waitFor(() => expect(screen.getByText(/显示更多/)).toBeTruthy(), { timeout: 8000 })
    const box = screen.getByPlaceholderText('搜索公司名称或代码') as HTMLInputElement
    fireEvent.change(box, { target: { value: '宁德时代' } })
    await waitFor(() => expect(screen.getAllByText(/宁德时代/).length).toBeGreaterThan(0))
    expect(screen.queryByText(/显示更多/)).toBeNull()
    fireEvent.change(box, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^回避 \d+/ }))
    await waitFor(() => expect(screen.queryAllByText(/^回避/).length).toBeGreaterThan(0))
  })

  it('美股列表包含标普500 补全公司，并标注程序化', async () => {
    renderAt('/research-notes?tab=category&m=us')
    await waitFor(() => expect(screen.getByText(/显示更多/)).toBeTruthy(), { timeout: 8000 })
    fireEvent.change(screen.getByPlaceholderText('搜索公司名称或代码'), { target: { value: 'ACN' } })
    await waitFor(() => expect(screen.getAllByText(/埃森哲/).length).toBeGreaterThan(0))
    expect(screen.getAllByText('程序化').length).toBeGreaterThan(0)
  })

  it('补全公司详情页渲染程序化标识、三情景与买入纪律', async () => {
    renderAt('/research-notes/us/ACN')
    await waitFor(() => expect(screen.getByText('程序化研究页')).toBeTruthy(), { timeout: 8000 })
    expect(screen.getAllByText(/Bear/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/合理买入区/).length).toBeGreaterThan(0)
  })

  it('A 股补全公司详情页可渲染', async () => {
    renderAt('/research-notes/cn/002594')
    await waitFor(() => expect(screen.getByText('程序化研究页')).toBeTruthy(), { timeout: 8000 })
    expect(screen.getAllByText(/比亚迪/).length).toBeGreaterThan(0)
  })
})

describe('林奇分组、港股、导出', () => {
  it('林奇分组视图：类型筛选与护城河证据', async () => {
    renderAt('/research-notes?tab=category&m=cn&v=lynch')
    await waitFor(() => expect(screen.getAllByText('快速增长型').length).toBeGreaterThan(1), { timeout: 8000 })
    fireEvent.click(screen.getByRole('button', { name: /^周期型 \d+/ }))
    await waitFor(() => expect(screen.queryAllByText('周期型').length).toBeGreaterThan(1))
    expect(screen.getByText(/导出当前/)).toBeTruthy()
  })

  it('港股标签页列表可加载并搜索腾讯', async () => {
    renderAt('/research-notes?tab=category&m=hk')
    await waitFor(() => expect(screen.getByPlaceholderText('搜索公司名称或代码')).toBeTruthy(), { timeout: 8000 })
    fireEvent.change(screen.getByPlaceholderText('搜索公司名称或代码'), { target: { value: '腾讯' } })
    await waitFor(() => expect(screen.getAllByText(/腾讯控股/).length).toBeGreaterThan(0), { timeout: 8000 })
  })

  it('详情页渲染林奇分类卡与护城河证据', async () => {
    renderAt('/research-notes/us/ACN')
    await waitFor(() => expect(screen.getByText(/林奇分类：/)).toBeTruthy(), { timeout: 8000 })
    expect(screen.getAllByText('定价权').length).toBeGreaterThan(0)
  })

  it('全部公司列表有导出按钮', async () => {
    renderAt('/research-notes?tab=category&m=us')
    await waitFor(() => expect(screen.getByText(/导出当前筛选/)).toBeTruthy(), { timeout: 8000 })
    expect(screen.getByText(/导出该市场全部/)).toBeTruthy()
  })

  it('美股非标普标签：三组分类', async () => {
    renderAt('/research-notes?tab=category&m=adr')
    await waitFor(() => expect(screen.getAllByText(/台积电/).length).toBeGreaterThan(0), { timeout: 8000 })
    expect(screen.getAllByText(/^中概 \d+/).length).toBeGreaterThan(0)
  })

  it('切换市场后筛选被重置：沪深选「优先关注」再切到美股非标普仍有公司', async () => {
    renderAt('/research-notes?tab=category&m=cn')
    await waitFor(() => expect(screen.getByText(/显示更多/)).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(screen.getByRole('button', { name: /^优先关注 \d+/ }))
    fireEvent.click(screen.getByRole('button', { name: '美股非标普' }))
    await waitFor(() => expect(screen.getAllByText(/台积电/).length).toBeGreaterThan(0), { timeout: 8000 })
  })

  it('美股非标普手工研究页：台积电详情页有三情景与买入区，且不再标程序化', async () => {
    renderAt('/research-notes/adr/TSM')
    await waitFor(() => expect(screen.getAllByText(/合理买入区/).length).toBeGreaterThan(0), { timeout: 8000 })
    expect(screen.queryByText('程序化研究页')).toBeNull()
    expect(screen.getAllByText(/Bear/).length).toBeGreaterThan(0)
  })

  it('港股手工研究页：建设银行详情页有三情景与买入区，且不再标程序化', async () => {
    renderAt('/research-notes/hk/00939')
    await waitFor(() => expect(screen.getAllByText(/合理买入区/).length).toBeGreaterThan(0), { timeout: 8000 })
    expect(screen.queryByText('程序化研究页')).toBeNull()
    expect(screen.getAllByText(/Bear/).length).toBeGreaterThan(0)
  })
})

it('沪深复核撤回旧模型，初始手工和异步公司均保留存档', async () => {
  const manual = findCompany('cn', '603596')!
  expect(manual.scenarios).toBeUndefined()
  expect(manual.metrics.some(([k]) => k === '上轮结论（存档）')).toBe(true)
  const rows = await loadCompanies('cn')
  const dp = rows.find(c => c.code === '605499')!
  expect(dp.scenarios).toBeUndefined()
  expect(dp.headline).toContain('股本')
  expect(rows.find(c => c.code === '601138')!.ratioNote).toContain('1.993')
})

it('沪深研究池提供汇总报告入口', async () => {
  renderAt('/research-notes?tab=category&m=cn')
  await waitFor(() => expect(screen.getByText('沪深研究池 · 2026-09-30 圆桌复核')).toBeTruthy())
  expect(screen.getByRole('link', { name: '沪深完整圆桌报告' }).getAttribute('href')).toContain('cn-roundtable')
})

it('沪深复核详情不会从历史指标重建被撤回的三情景', async () => {
  renderAt('/research-notes/cn/605499')
  await waitFor(() => expect(screen.getByText(/待补充三情景估值表/)).toBeTruthy())
  expect(screen.getByRole('link', { name: '查看本轮完整报告与一手来源' }).getAttribute('href')).toContain('cn-roundtable')
})

describe('额外综合分类视图', () => {
  it.each(['us', 'cn', 'hk', 'adr'])('%s保留原入口并新增综合分类', async market => {
    renderAt(`/research-notes?tab=category&m=${market}`)
    fireEvent.click(screen.getByRole('button', { name: '综合分类' }))
    expect(screen.getByRole('button', { name: '全部公司分类' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '林奇分组' })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('columnheader', { name: '林奇类型' })).toBeTruthy())
    expect(screen.getByRole('columnheader', { name: '研究评级' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '行业' })).toBeTruthy()
  })

  it('综合分类允许公司搜索并显示两套结论，原分类视图不增加列', async () => {
    renderAt('/research-notes?tab=category&m=us&v=combined')
    await waitFor(() => expect(screen.getByRole('textbox', { name: '搜索综合分类' })).toBeTruthy())
    fireEvent.change(screen.getByRole('textbox', { name: '搜索综合分类' }), { target: { value: 'CVS' } })
    await waitFor(() => expect(screen.getByRole('link', { name: '西维斯健康 CVS' })).toBeTruthy())
    expect(screen.getByRole('columnheader', { name: '林奇判断' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '全部公司分类' }))
    expect(screen.queryByRole('columnheader', { name: '林奇类型' })).toBeNull()
    expect(screen.getByRole('columnheader', { name: '一句话结论' })).toBeTruthy()
  })
})
