import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FutureTrends from './FutureTrends'
import { MemoryRouter } from 'react-router-dom'
import { TRENDS } from '../data/futureTrends'

describe('未来趋势', () => {
  it('每个赛道每个环节都有公司，且无重复赛道', () => {
    expect(new Set(TRENDS.map(t => t.id)).size).toBe(TRENDS.length)
    for (const t of TRENDS) for (const l of t.chain) {
      expect(l.cn.length + l.us.length, `${t.name}/${l.link}`).toBeGreaterThan(0)
    }
  })

  it('页面可切换赛道，并带有非投资建议声明', () => {
    render(<MemoryRouter><FutureTrends /></MemoryRouter>)
    expect(screen.getByText(/不构成投资建议/)).toBeTruthy()
    expect(screen.getByRole('navigation', { name: '产业链环节索引' })).toBeTruthy()
    expect(screen.getAllByText(/候选待核/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '服务器、PCB、连接器与高速覆铜板' }).getAttribute('href')).toMatch(/^#ai-chain-/)
    expect(screen.getAllByRole('link', { name: 'HBM 官方产品资料' })[0].getAttribute('href')).toBe('https://www.micron.com/products/memory/hbm')
    fireEvent.click(screen.getByRole('tab', { name: '智能驾驶' }))
    expect(screen.getByRole('heading', { name: '智能驾驶' })).toBeTruthy()
  })

  it('七个赛道都有中国公司研究，展示护城河和情景证据', () => {
    render(<MemoryRouter><FutureTrends /></MemoryRouter>)
    for (const name of ['机器人与具身智能', '创新药', '航空航天', '新能源', '半导体与先进制造', '新材料', '脑机接口、量子计算与合成生物']) {
      fireEvent.click(screen.getByRole('tab', { name }))
      expect(screen.getByRole('heading', { name: new RegExp(`^${name}中国公司研究`) })).toBeTruthy()
      expect(screen.getAllByRole('columnheader', { name: '护城河' }).length).toBeGreaterThan(0)
    }
  })

  it('AI 公司可进入二级研究页，并明确实际胜率未校准', () => {
    render(<MemoryRouter><FutureTrends /></MemoryRouter>)
    expect(screen.getAllByText('中际旭创').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: '中际旭创' }).every(a => a.getAttribute('href') === '/future-trends/company/listed-300308')).toBe(true)
    expect(screen.getAllByText('实际胜率：未校准').length).toBeGreaterThan(0)
  })

  it('九个赛道最底部都有海外公司研究', () => {
    render(<MemoryRouter><FutureTrends /></MemoryRouter>)
    for (const [tab, title] of [['人工智能', '人工智能'], ['智能驾驶', '智能驾驶'], ['机器人与具身智能', '机器人与具身智能'], ['创新药', '创新药'], ['航空航天', '航空航天'], ['新能源', '新能源'], ['半导体与先进制造', '半导体与先进制造'], ['新材料', '新材料'], ['脑机接口、量子计算与合成生物', '脑机接口、量子计算与合成生物']]) {
      fireEvent.click(screen.getByRole('tab', { name: tab }))
      const sections = screen.getAllByRole('region')
      expect(sections[sections.length - 1].getAttribute('aria-labelledby'), tab).toMatch(/-us-picks$/)
      expect(screen.getByRole('heading', { name: new RegExp(`^${title}海外公司研究`) })).toBeTruthy()
    }
  })

  it('倒数第二个页签是候选池：可筛选市场与证据深度，不把未认证模型当作买入资格', () => {
    render(<MemoryRouter><FutureTrends /></MemoryRouter>)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[tabs.length - 2].textContent).toBe('候选池')
    fireEvent.click(screen.getByRole('tab', { name: '候选池' }))
    expect(screen.getByRole('heading', { name: /^候选池/ })).toBeTruthy()
    expect(screen.getByText(/491 个页面不等于 491 份已认证深度报告/)).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: '市场' }), { target: { value: '海外' } })
    expect(screen.getByRole('combobox', { name: '市场' })).toHaveProperty('value', '海外')
    fireEvent.change(screen.getByRole('combobox', { name: '研究深度' }), { target: { value: '公司证据摘录' } })
    expect(screen.getByRole('table').querySelectorAll('tbody tr').length).toBeGreaterThan(0)
    expect(screen.getByRole('table').querySelectorAll('tbody tr').length).toBeLessThan(20)
  })

  it('最后一个页签是核心 20，展示分散方向及未认证买入状态', () => {
    render(<MemoryRouter><FutureTrends /></MemoryRouter>)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[tabs.length - 1].textContent).toBe('核心')
    fireEvent.click(screen.getByRole('tab', { name: '核心' }))
    expect(screen.getByRole('heading', { name: /^核心 20/ })).toBeTruthy()
    expect(screen.getByRole('table').querySelectorAll('tbody tr').length).toBe(20)
    expect(screen.getByText('已认证现价买入 0 家')).toBeTruthy()
  })

  it('候选池与核心都能下载当前选择的公司 JSON', async () => {
    vi.useFakeTimers()
    const blobs: Blob[] = []
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    URL.createObjectURL = ((b: Blob) => { blobs.push(b); return 'blob:x' }) as typeof URL.createObjectURL
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL
    try {
      render(<MemoryRouter><FutureTrends /></MemoryRouter>)
      fireEvent.click(screen.getByRole('tab', { name: '候选池' }))
      fireEvent.change(screen.getByRole('combobox', { name: '市场' }), { target: { value: '海外' } })
      fireEvent.click(screen.getByRole('button', { name: /^下载当前结果/ }))
      const pool = JSON.parse(await blobs[0].text())
      expect(pool.length).toBeGreaterThan(100)
      expect(pool.every((x: { key: string }) => x.key.startsWith('海外:'))).toBe(true)
      expect(pool[0]).toHaveProperty('valuationStatus')
      fireEvent.click(screen.getByRole('tab', { name: '核心' }))
      fireEvent.click(screen.getByRole('button', { name: /^下载核心研究摘要/ }))
      const core = JSON.parse(await blobs[1].text())
      expect(core).toHaveLength(20)
      expect(core.every((x: { core: boolean }) => x.core)).toBe(true)
      expect(core[0]).toHaveProperty('moat')
    } finally {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
    }
  })
})
