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
    render(<MemoryRouter initialEntries={['/future-trends?tab=ai']}><FutureTrends /></MemoryRouter>)
    expect(screen.getByText(/查看推荐顺序请进入核心或候选池/)).toBeTruthy()
    expect(screen.getByRole('navigation', { name: '产业链环节索引' })).toBeTruthy()
    expect(screen.getAllByText(/候选待核/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '服务器、PCB、连接器与高速覆铜板' }).getAttribute('href')).toMatch(/^#ai-chain-/)
    expect(screen.getAllByRole('link', { name: 'HBM 官方产品资料' })[0].getAttribute('href')).toBe('https://www.micron.com/products/memory/hbm')
    fireEvent.click(screen.getByRole('tab', { name: '智能驾驶' }))
    expect(screen.getByRole('heading', { name: '智能驾驶' })).toBeTruthy()
  })

  it('七个赛道都有中国公司研究，展示护城河和情景证据', () => {
    render(<MemoryRouter initialEntries={['/future-trends?tab=ai']}><FutureTrends /></MemoryRouter>)
    for (const name of ['机器人与具身智能', '创新药', '航空航天', '新能源', '半导体与先进制造', '新材料', '脑机接口、量子计算与合成生物']) {
      fireEvent.click(screen.getByRole('tab', { name }))
      expect(screen.getByRole('heading', { name: new RegExp(`^${name}中国公司研究`) })).toBeTruthy()
      expect(screen.getAllByRole('columnheader', { name: '护城河' }).length).toBeGreaterThan(0)
    }
  })

  it('AI 公司可进入二级研究页，并明确实际胜率未校准', () => {
    render(<MemoryRouter initialEntries={['/future-trends?tab=ai']}><FutureTrends /></MemoryRouter>)
    expect(screen.getAllByText('中际旭创').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: '中际旭创' }).every(a => a.getAttribute('href') === '/future-trends/company/listed-300308')).toBe(true)
    expect(screen.getAllByText('实际胜率：未校准').length).toBeGreaterThan(0)
  })

  it('九个赛道最底部都有海外公司研究', () => {
    render(<MemoryRouter initialEntries={['/future-trends?tab=ai']}><FutureTrends /></MemoryRouter>)
    for (const [tab, title] of [['人工智能', '人工智能'], ['智能驾驶', '智能驾驶'], ['机器人与具身智能', '机器人与具身智能'], ['创新药', '创新药'], ['航空航天', '航空航天'], ['新能源', '新能源'], ['半导体与先进制造', '半导体与先进制造'], ['新材料', '新材料'], ['脑机接口、量子计算与合成生物', '脑机接口、量子计算与合成生物']]) {
      fireEvent.click(screen.getByRole('tab', { name: tab }))
      const sections = screen.getAllByRole('region')
      expect(sections[sections.length - 1].getAttribute('aria-labelledby'), tab).toMatch(/-us-picks$/)
      expect(screen.getByRole('heading', { name: new RegExp(`^${title}海外公司研究`) })).toBeTruthy()
    }
  })

  it('候选池可筛选市场与推荐优先级，默认展示优先候选', () => {
    render(<MemoryRouter initialEntries={['/future-trends?tab=ai']}><FutureTrends /></MemoryRouter>)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[1].textContent).toBe('候选池')
    fireEvent.click(screen.getByRole('tab', { name: '候选池' }))
    expect(screen.getByRole('heading', { name: /^候选池/ })).toBeTruthy()
    expect(screen.getByText(/实际胜率未经校准/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '海外' }))
    expect(screen.getByRole('button', { name: '海外' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /^优先候选/ }))
    expect(screen.getByRole('table').querySelectorAll('tbody tr').length).toBeGreaterThan(0)
    expect(screen.getByRole('table').querySelectorAll('tbody tr').length).toBeLessThan(20)
  })

  it('第一个页签是核心 15，展示优先与备选及价格条件', () => {
    render(<MemoryRouter initialEntries={['/future-trends?tab=ai']}><FutureTrends /></MemoryRouter>)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0].textContent).toBe('核心')
    fireEvent.click(screen.getByRole('tab', { name: '核心' }))
    expect(screen.getByRole('heading', { name: /^核心：先看这 6 家/ })).toBeTruthy()
    expect(screen.getAllByRole('table').reduce((n,t) => n+t.querySelectorAll('tbody tr').length,0)).toBe(15)
    expect(screen.getByText(/当前情景估值均为待复核草稿/)).toBeTruthy()
  })

  it('候选池与核心都能下载当前选择的公司 JSON', async () => {
    vi.useFakeTimers()
    const blobs: Blob[] = []
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    URL.createObjectURL = ((b: Blob) => { blobs.push(b); return 'blob:x' }) as typeof URL.createObjectURL
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL
    try {
      render(<MemoryRouter initialEntries={['/future-trends?tab=ai']}><FutureTrends /></MemoryRouter>)
      fireEvent.click(screen.getByRole('tab', { name: '候选池' }))
      fireEvent.click(screen.getByRole('button', { name: '海外' }))
      fireEvent.click(screen.getByRole('button', { name: '导出筛选结果 JSON' }))
      const pool = JSON.parse(await blobs[0].text())
      expect(pool).toHaveLength(3)
      expect(pool.every((x: { key: string }) => x.key.startsWith('海外:'))).toBe(true)
      expect(pool[0]).toHaveProperty('valuationStatus')
      fireEvent.click(screen.getByRole('tab', { name: '核心' }))
      fireEvent.click(screen.getByRole('button', { name: '导出核心 JSON' }))
      const core = JSON.parse(await blobs[1].text())
      expect(core).toHaveLength(15)
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
