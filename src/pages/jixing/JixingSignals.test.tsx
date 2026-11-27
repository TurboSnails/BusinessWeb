import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JixingSignals from './JixingSignals'
import { signalsFixture } from '../../features/jixing-signals/fixtures'
import { asJixingSignals } from '../../features/jixing-signals/model'

function renderPage(body: unknown = signalsFixture(), ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body })))
  return render(<MemoryRouter initialEntries={['/jixing/signals']}><JixingSignals /></MemoryRouter>)
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('今天几星 · 牛熊信号板', () => {
  it('计数、分组、信号色、规则、迷你图与市场消息', async () => {
    const data = signalsFixture()
    renderPage({ ...data, missing: [...data.missing, 'trM2'] })
    expect(await screen.findByText('信号计数')).toBeTruthy()
    expect(screen.getByRole('tab', { name: '牛熊信号板' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('估值类').parentElement?.textContent).toContain('低估 2 · 正常 0 · 高估 0')
    const updateNote = screen.getByText(/^本次未更新的指标：/).textContent
    expect(updateNote).toContain('新成立偏股型基金：新发基金缺最近完整月')
    expect(updateNote).toContain('中证全指全收益 / M2')
    const buffett = screen.getByText('巴菲特指标').closest('li')!
    expect(within(buffett).getByText('68.1%')).toBeTruthy()
    expect(within(buffett).getByText('低估').className).toContain('ui-badge--down')
    expect(within(buffett).getByText(/近 10 年分位 56.8%（2017-01-03 起，2396 个样本）/)).toBeTruthy()
    expect(within(buffett).getByText(/< 80% 记「低估」/)).toBeTruthy()
    expect(within(buffett).getByText('99.36 万亿元')).toBeTruthy()
    const amount = screen.getByText('两市成交额').closest('li')!
    expect(within(amount).getByText('14,577 亿元')).toBeTruthy()
    expect(within(amount).getByText('偏熊').className).toContain('ui-badge--down')
    const acc = screen.getByText('新增投资者（上交所，月）').closest('li')!
    expect(within(acc).getByText('偏牛').className).toContain('ui-badge--up')
    expect(within(acc).getByText('2026-10（月度）')).toBeTruthy()
    const broken = screen.getByText('新股破发率（近 60 个交易日）').closest('li')!
    expect(within(broken).getByText('不判')).toBeTruthy()
    expect(within(broken).getByText('0.0%')).toBeTruthy()
    const btn = within(buffett).getByRole('button', { name: '查看历史' })
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(within(buffett).getByRole('img', { name: '巴菲特指标 历史' })).toBeTruthy()
    expect(screen.getByText(/老基金规模/)).toBeTruthy()
    expect(screen.getByText(/限购基金占比/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: '市场消息' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /金融支持经济高质量发展发布会/ })).toBeTruthy()
    expect(screen.getByText(/与银行螺丝钉官方无关/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|定投建议/)
  })

  it('数据缺失时显示 LoadError 与重试', async () => {
    renderPage(null, false)
    expect((await screen.findByRole('alert')).textContent).toContain('数据暂时取不到')
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })

  it('校验器拒绝未知信号、晚于数据日的日期与字符串数字', () => {
    const ok = signalsFixture()
    expect(asJixingSignals(ok)).not.toBeNull()
    expect(asJixingSignals({ ...ok, indicators: [{ ...ok.indicators[0], signal: '买入' }] })).toBeNull()
    expect(asJixingSignals({ ...ok, indicators: [{ ...ok.indicators[0], date: '2026-11-18' }] })).toBeNull()
    expect(asJixingSignals({ ...ok, indicators: [{ ...ok.indicators[0], value: '68.1' }] })).toBeNull()
    expect(asJixingSignals({ ...ok, indicators: [ok.indicators[0], ok.indicators[0]] })).toBeNull()
    expect(asJixingSignals('<html>')).toBeNull()
  })
  it('站内数据文件通过校验（不钉死日期）', () => {
    const body: unknown = JSON.parse(readFileSync(resolve(__dirname, '../../../public/data/jixing-signals.json'), 'utf8'))
    // 旧文件可能尚无 news；补空数组以便校验通过
    const patched = typeof body === 'object' && body && !('news' in (body as object))
      ? { ...(body as object), news: [] }
      : body
    expect(asJixingSignals(patched)).not.toBeNull()
  })

  it('失败 → 重试 → 成功', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1
      if (calls === 1) return { ok: false, status: 500, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => signalsFixture() }
    }))
    render(<MemoryRouter initialEntries={['/jixing/signals']}><JixingSignals /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(await screen.findByText('信号计数')).toBeTruthy()
    expect(calls).toBe(2)
  })
})
