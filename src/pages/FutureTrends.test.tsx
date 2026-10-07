import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FutureTrends from './FutureTrends'
import { TRENDS } from '../data/futureTrends'

describe('未来趋势', () => {
  it('每个赛道每个环节都有公司，且无重复赛道', () => {
    expect(new Set(TRENDS.map(t => t.id)).size).toBe(TRENDS.length)
    for (const t of TRENDS) for (const l of t.chain) {
      expect(l.cn.length + l.us.length, `${t.name}/${l.link}`).toBeGreaterThan(0)
    }
  })

  it('页面可切换赛道，并带有非投资建议声明', () => {
    render(<FutureTrends />)
    expect(screen.getByText(/不构成投资建议/)).toBeTruthy()
    expect(screen.getByRole('navigation', { name: '产业链环节索引' })).toBeTruthy()
    expect(screen.getAllByText(/候选待核/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '服务器、PCB、连接器与高速覆铜板' }).getAttribute('href')).toMatch(/^#ai-chain-/)
    expect(screen.getAllByRole('link', { name: 'HBM 官方产品资料' })[0].getAttribute('href')).toBe('https://www.micron.com/products/memory/hbm')
    fireEvent.click(screen.getByRole('tab', { name: '智能驾驶' }))
    expect(screen.getByRole('heading', { name: '智能驾驶' })).toBeTruthy()
  })

  it('七个赛道底部都有中国公司综合排序，含 PE、PEG 与买卖点位', () => {
    render(<FutureTrends />)
    for (const name of ['机器人与具身智能', '创新药', '航空航天', '新能源', '半导体与先进制造', '新材料', '脑机接口、量子计算与合成生物']) {
      fireEvent.click(screen.getByRole('tab', { name }))
      expect(screen.getByRole('heading', { name: new RegExp(`^${name}中国公司综合排序`) })).toBeTruthy()
      expect(screen.getAllByText(/^PEG：/).length).toBeGreaterThan(0)
    }
  })

  it('AI 排序补入中际旭创等 4 家，原有公司补充 PE 与 PEG', () => {
    render(<FutureTrends />)
    expect(screen.getAllByText('中际旭创').length).toBeGreaterThan(0)
    expect(screen.getByText('PE：24.6×')).toBeTruthy()
  })

  it('九个赛道最底部都有海外公司综合排序', () => {
    render(<FutureTrends />)
    for (const [tab, title] of [['人工智能', '人工智能'], ['智能驾驶', '智能驾驶'], ['机器人与具身智能', '机器人与具身智能'], ['创新药', '创新药'], ['航空航天', '航空航天'], ['新能源', '新能源'], ['半导体与先进制造', '半导体与先进制造'], ['新材料', '新材料'], ['脑机接口、量子计算与合成生物', '脑机接口、量子计算与合成生物']]) {
      fireEvent.click(screen.getByRole('tab', { name: tab }))
      const sections = screen.getAllByRole('region')
      expect(sections[sections.length - 1].getAttribute('aria-labelledby'), tab).toMatch(/-us-picks$/)
      expect(screen.getByRole('heading', { name: new RegExp(`^${title}海外公司综合排序`) })).toBeTruthy()
    }
  })

  it('倒数第二个页签是候选池：可按基本面或可投资排序，并标记投资状态', () => {
    render(<FutureTrends />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[tabs.length - 2].textContent).toBe('候选池')
    fireEvent.click(screen.getByRole('tab', { name: '候选池' }))
    expect(screen.getByRole('heading', { name: /^候选池/ })).toBeTruthy()
    expect(screen.getAllByText('可现在投资').length).toBeGreaterThan(1)
    expect(screen.getAllByText('股价偏高').length).toBeGreaterThan(1)
    fireEvent.click(screen.getByRole('button', { name: '按基本面排序' }))
    expect(screen.getByRole('button', { name: '按基本面排序' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '海外' }))
    expect(screen.getByText(/^共 \d+ 家/)).toBeTruthy()
  })

  it('最后一个页签是核心 20，含研究评级、买卖点位与失效条件', () => {
    render(<FutureTrends />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[tabs.length - 1].textContent).toBe('核心')
    fireEvent.click(screen.getByRole('tab', { name: '核心' }))
    expect(screen.getByRole('heading', { name: /^核心 20/ })).toBeTruthy()
    expect(screen.getByRole('region', { name: '核心名单' }).querySelectorAll('tbody tr').length).toBe(20)
    expect(screen.getAllByText(/^买入（条件化/).length).toBeGreaterThan(0)
  })
})
