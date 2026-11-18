import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JixingGlobal from './JixingGlobal'
import { globalFixture } from '../../features/jixing-global/fixtures'
import { asJixingGlobal, chartValue } from '../../features/jixing-global/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/jixing/global']}><JixingGlobal /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('今天几星 · 港股全球', () => {
  it('港股估值表：逐行日期、依据、状态配色与文字、点行切换走势图', async () => {
    stub(globalFixture()); renderPage()
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(5) // 表头 + 4 行
    expect(within(rows[1]).getByText('2026-11-18')).toBeTruthy()
    expect(within(rows[2]).getByText('2026-10-30')).toBeTruthy() // 月度行用自己的日期
    expect(within(rows[1]).getByText('正常').className).toContain('is-mid')
    expect(within(rows[2]).getByText('不判定')).toBeTruthy() // 亏损占比过高
    expect(within(rows[3]).getByText('高估').className).toContain('is-high')
    expect(within(rows[3]).getByText('股息率（反向）')).toBeTruthy()
    expect(within(rows[4]).getByText('低估').className).toContain('is-low')
    expect(within(rows[4]).getByText(/沿用/)).toBeTruthy()
    expect(screen.getByRole('img', { name: /恒生指数 PE（恒生公布） 近 5 年月度/ })).toBeTruthy()
    expect(screen.getByText(/估值分位 < 30% 记「低估」/)).toBeTruthy()
    expect(screen.getByText(/缺失月份 2025-01、2026-02/)).toBeTruthy()
    fireEvent.click(within(rows[3]).getByRole('button', { name: '恒生高股息率指数' }))
    expect(screen.getByRole('img', { name: /恒生高股息率指数 股息率 近 5 年月度/ })).toBeTruthy()
    fireEvent.click(within(rows[2]).getByRole('button', { name: '恒生科技指数' }))
    expect(screen.getByText(/窗口内有 8 个亏损样本/)).toBeTruthy()
    expect(screen.getByText(/超过 200 倍的月份留空/)).toBeTruthy()
    expect(screen.getByText(/与银行螺丝钉官方无关/)).toBeTruthy()
    expect(screen.getByRole('tab', { name: '港股全球' }).getAttribute('aria-selected')).toBe('true')
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|定投建议/)
  })

  it('全球表：拼接说明、估算标记、无数据行与暂未纳入', async () => {
    stub(globalFixture()); renderPage()
    await screen.findByRole('table')
    fireEvent.click(within(screen.getByRole('group', { name: '港股全球分区' })).getByText('全球'))
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(screen.getByText(/2026-08-05 之后为 History of Market 自算/)).toBeTruthy()
    expect(within(rows[3]).getAllByText('—').length).toBeGreaterThan(3) // 缺值不写 0
    expect(screen.getByText(/日经 225/)).toBeTruthy()
    fireEvent.click(within(rows[2]).getByRole('button', { name: '标普500' }))
    expect(screen.getByText(/multpl 标注的估算值/)).toBeTruthy()
  })

  it('黄金：价格、实际利率、本站自定估值分位与公式', async () => {
    stub(globalFixture()); renderPage()
    await screen.findByRole('table')
    fireEvent.click(within(screen.getByRole('group', { name: '港股全球分区' })).getByText('黄金'))
    expect(screen.getAllByText('3851.3')).toHaveLength(2) // 名义价与以最新 CPI 计的实际价相同
    expect(screen.getByText('88.0%')).toBeTruthy()
    expect(screen.getByText('2.89%')).toBeTruthy()
    expect(screen.getByText(/沿用此前最近一个月：2025-10、2026-11/)).toBeTruthy()
    expect(screen.getByText(/黄金估值为本站自定/)).toBeTruthy()
    expect(screen.getByRole('img', { name: /实际金价/ })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '黄金走势' })).getByText('10 年实际利率'))
    expect(screen.getByRole('img', { name: /10 年期美债实际收益率/ })).toBeTruthy()
  })

  it('文件缺失或结构异常时显示空状态；黄金缺失只空黄金分区', async () => {
    stub(null, false); renderPage()
    expect(await screen.findByText('暂无港股全球数据')).toBeTruthy()
    cleanup()
    stub({ ...globalFixture(), gold: null, goldError: '新浪超时' }); renderPage()
    await screen.findByRole('table')
    fireEvent.click(within(screen.getByRole('group', { name: '港股全球分区' })).getByText('黄金'))
    expect(screen.getByText(/本次未取到：新浪超时/)).toBeTruthy()
  })

  it('校验器拒绝坏结构；作图时去掉亏损与极端 PE', () => {
    expect(asJixingGlobal(globalFixture())).not.toBeNull()
    expect(asJixingGlobal({ ...globalFixture(), version: 2 })).toBeNull()
    const bad = globalFixture(); bad.hk.rows[0].pePct = 120
    expect(asJixingGlobal(bad)).toBeNull()
    const bad2 = globalFixture(); bad2.hk.rows[0].history = [['2026-11-18', 1], ['2026-11-17', 2]]
    expect(asJixingGlobal(bad2)).toBeNull()
    const row = globalFixture().hk.rows[0]
    expect(chartValue(row, -5)).toBeNull()
    expect(chartValue(row, 250)).toBeNull()
    expect(chartValue(row, 12)).toBe(12)
  })

  it('真实数据文件（如有）通过校验', () => {
    let body: unknown = null
    try { body = JSON.parse(readFileSync(resolve(__dirname, '../../../public/data/jixing-global.json'), 'utf8')) } catch { return }
    expect(asJixingGlobal(body)).not.toBeNull()
  })
})
