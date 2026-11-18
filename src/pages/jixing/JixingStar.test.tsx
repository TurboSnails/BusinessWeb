import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JixingStar from './JixingStar'
import { starFixture } from '../../features/jixing-star/fixtures'
import { asJixingStar } from '../../features/jixing-star/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/jixing']}><JixingStar /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('今天几星 · 今日星级', () => {
  it('星级、区间、较前一日变化、三项输入、历史与对照', async () => {
    stub(starFixture()); renderPage()
    expect(await screen.findByText('4.2')).toBeTruthy()
    expect(screen.getAllByText('部分低估')[0].className).toContain('ui-badge--down')
    expect(screen.getByText('+0.1 星').className).toContain('mm-down')
    expect(screen.getByText(/2026-11-16，4.1 星/)).toBeTruthy()
    expect(screen.getByRole('img', { name: /星级尺：当前 4.2 星/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '今日星级' }).getAttribute('aria-selected')).toBe('true')
    const [inputs] = screen.getAllByRole('table')
    expect(within(inputs).getByText('91.6%')).toBeTruthy()
    expect(within(inputs).getAllByText('2016-11-18 起 2427 个交易日')).toHaveLength(3)
    expect(screen.getAllByText(/不做盘中更新/).length).toBeGreaterThan(1)
    expect(screen.getByRole('img', { name: '历史星级（近 3 年）' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '历史星级区间' })).getByText('全部'))
    expect(screen.getByRole('img', { name: '历史星级（全部）' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '输入历史曲线' })).getByText('股债性价比'))
    expect(screen.getByRole('img', { name: '股债性价比 周线' })).toBeTruthy()
    expect(screen.getByText('≈5.9（极低）')).toBeTruthy()
    expect(screen.getAllByText(/数值不会相同/).length).toBeGreaterThan(0)
    expect(screen.getByText(/ln\(1.25\)/)).toBeTruthy()
    expect(screen.getByText(/与银行螺丝钉官方无关/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|定投建议/)
  })

  it('数据缺失或格式异常时显示空状态', async () => {
    stub(null, false); renderPage()
    expect(await screen.findByText('暂无星级数据')).toBeTruthy()
  })

  it('校验器拒绝越界星级、字符串数字与历史末日不等于数据日', () => {
    expect(asJixingStar(starFixture())).not.toBeNull()
    expect(asJixingStar({ ...starFixture(), star: 6.5 })).toBeNull()
    expect(asJixingStar({ ...starFixture(), star: '4.2' })).toBeNull()
    expect(asJixingStar({ ...starFixture(), history: [['2026-11-16', 4.1]] })).toBeNull()
    expect(asJixingStar({ ...starFixture(), sources: [{ label: 'x', url: 'https://example.com/' }] })).toBeNull()
    expect(asJixingStar('<html>')).toBeNull()
  })
  it('站内数据文件通过校验（不钉死日期）', () => {
    const body: unknown = JSON.parse(readFileSync(resolve(__dirname, '../../../public/data/jixing-star.json'), 'utf8'))
    expect(asJixingStar(body)).not.toBeNull()
  })
})
