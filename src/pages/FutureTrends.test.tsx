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
})
