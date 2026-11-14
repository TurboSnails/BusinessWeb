import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CandidateAlertDialog from './CandidateAlertDialog'
import CandidateAlerts from './CandidateAlerts'
import type { AnchorOption, PriceObservation } from '../features/candidates/priceAlert'
import type { CandidateAlertRule } from '../features/candidates/validation'
import type { CandidateAlert } from '../features/candidates/alerts'

const anchors: AnchorOption[] = [
  { type: 'research-bear', value: 22.5, asOf: '2026-11-13', researchVersion: 'valuation:2026-11-13:PE', currency: 'CNY', label: '研究估值·悲观价' },
  { type: 'research-base', value: 30, asOf: '2026-11-13', researchVersion: 'valuation:2026-11-13:PE', currency: 'CNY', label: '研究估值·基准价' },
  { type: 'dcf-buy-below', value: 16.7, asOf: '2026-11-12', researchVersion: 'dcf-auto:2026-11-12', currency: 'CNY', label: '自动 DCF 买入参考价' },
]
const price: PriceObservation = { price: 25, currency: 'CNY', date: '2026-11-13', source: '公司页价格锚点（snap-cn）' }
const props = { open: true, onClose: vi.fn(), name: '某公司 600000', anchors, price, currency: 'CNY' as const, cloud: true, today: '2026-11-14' }
const threshold = (): HTMLInputElement => screen.getByLabelText(/条件价（CNY）/) as HTMLInputElement

describe('CandidateAlertDialog', () => {
  it('从研究数据预填：每个来源写明价格和日期，默认悲观价；换来源会换条件价', () => {
    render(<CandidateAlertDialog {...props} onSave={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: /价位提醒 · 某公司 600000/ })).toBeTruthy()
    expect(screen.getByRole('group', { name: '条件价来源' })).toBeTruthy()
    expect(screen.getByLabelText(/研究估值·悲观价：CNY 22.5（2026-11-13）/)).toHaveProperty('checked', true)
    expect(screen.getByText(/2026-11-12/)).toBeTruthy()
    expect(screen.getByText(/最新收盘价 CNY 25/).textContent).toContain('2026-11-13')
    expect(threshold().value).toBe('22.5')
    fireEvent.click(screen.getByLabelText(/研究估值·基准价/))
    expect(threshold().value).toBe('30')
    expect(screen.queryByText(/买入信号/)).toBeNull()
  })

  it('保存时带上来源与研究版本；保存中按钮禁用，完成后关闭', async () => {
    let resolve!: () => void
    const onSave = vi.fn(() => new Promise<void>(r => { resolve = r }))
    const onClose = vi.fn()
    render(<CandidateAlertDialog {...props} onClose={onClose} onSave={onSave} />)
    fireEvent.change(threshold(), { target: { value: '21' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    const saving = screen.getByRole('button', { name: '保存中…' }) as HTMLButtonElement
    expect(saving.disabled).toBe(true)
    fireEvent.click(saving)
    expect(onSave).toHaveBeenCalledTimes(1)
    const rule = (onSave.mock.calls[0] as unknown as [CandidateAlertRule])[0]
    expect(rule).toMatchObject({ kind: 'price-below', threshold: 21, currency: 'CNY', enabled: true, anchor: { type: 'research-bear', value: 22.5, asOf: '2026-11-13', researchVersion: 'valuation:2026-11-13:PE' } })
    resolve()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('保存失败：保留输入，用 role=alert 提示，可再试', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('其他设备刚更新了候选池，已刷新为最新，请再保存一次')).mockResolvedValueOnce(undefined)
    const onClose = vi.fn()
    render(<CandidateAlertDialog {...props} onClose={onClose} onSave={onSave} />)
    fireEvent.change(threshold(), { target: { value: '20.5' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((await screen.findByRole('alert')).textContent).toContain('请再保存一次')
    expect(threshold().value).toBe('20.5')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('云端同步失败但本机已保存：提示并保持打开', async () => {
    const onClose = vi.fn()
    render(<CandidateAlertDialog {...props} onClose={onClose} onSave={() => Promise.resolve({ synced: false, message: '已保存在本机，云端同步失败：无法连接云端' })} />)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((await screen.findByRole('alert')).textContent).toContain('已保存在本机')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('条件价离参照价超过 10 倍或为空：不保存，说明原因', () => {
    const onSave = vi.fn()
    render(<CandidateAlertDialog {...props} onSave={onSave} />)
    fireEvent.change(threshold(), { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(screen.getByRole('alert').textContent).toContain('10 倍')
    fireEvent.change(threshold(), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(screen.getByRole('alert').textContent).toContain('大于 0')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('没有研究数据时只能手动填写，以现价为参照；可以关闭提醒和改方向', () => {
    const onSave = vi.fn()
    render(<CandidateAlertDialog {...props} anchors={[]} cloud={false} onSave={onSave} />)
    expect(screen.getByText(/仅保存在本机/)).toBeTruthy()
    expect(screen.getByRole('radio', { name: /手动填写/ })).toHaveProperty('checked', true)
    fireEvent.change(threshold(), { target: { value: '28' } })
    fireEvent.change(screen.getByLabelText('触发条件'), { target: { value: 'price-above' } })
    fireEvent.click(screen.getByLabelText('启用提醒'))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onSave.mock.calls[0][0]).toMatchObject({ kind: 'price-above', threshold: 28, enabled: false, anchor: { type: 'manual', value: 25, asOf: '2026-11-14' } })
  })

  it('已有提醒：按原设置回显，研究更新后保留原来源；可删除', async () => {
    const rule: CandidateAlertRule = { kind: 'price-below', threshold: 19, currency: 'CNY', anchor: { type: 'research-bear', value: 20, asOf: '2026-10-01', researchVersion: 'valuation:2026-10-01:PE' }, enabled: true, createdAt: '2026-10-02T00:00:00.000Z' }
    const onSave = vi.fn()
    render(<CandidateAlertDialog {...props} rule={rule} onSave={onSave} />)
    expect(threshold().value).toBe('19')
    expect(screen.getByLabelText(/研究估值·悲观价（设置时）：CNY 20（2026-10-01）/)).toHaveProperty('checked', true)
    fireEvent.click(screen.getByRole('button', { name: '删除提醒' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(undefined))
  })

  it('键盘：打开时焦点在对话框内，Tab 在对话框内循环，Esc 关闭', () => {
    const onClose = vi.fn()
    render(<><button>外面</button><CandidateAlertDialog {...props} onClose={onClose} onSave={vi.fn()} /></>)
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
    const save = screen.getByRole('button', { name: '保存' })
    save.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(save)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(save)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('CandidateAlerts 今日待处理：触及条件价', () => {
  const hit: CandidateAlert = { kind: 'price-hit', market: 'cn', code: '600000', text: '到了你设的价位，该复核一眼：收盘价 CNY 21（2026-11-13，公司页价格锚点）≤ 条件价 22.5', price: { ...price, price: 21 } }
  it('显示触发价、日期、来源；已看过与暂停 7 天各自回调；暂停判断的条数单独说明', () => {
    const onSeen = vi.fn(); const onSnooze = vi.fn()
    render(<MemoryRouter><CandidateAlerts alerts={[hit]} companies={[]} onSeen={onSeen} onSnooze={onSnooze} paused={2} /></MemoryRouter>)
    expect(screen.getByText('触及条件价')).toBeTruthy()
    expect(screen.getByText(/2026-11-13，公司页价格锚点/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '已看过 600000 的价位提醒' }))
    fireEvent.click(screen.getByRole('button', { name: '暂停 600000 的价位提醒 7 天' }))
    expect(onSeen).toHaveBeenCalledWith(hit); expect(onSnooze).toHaveBeenCalledWith(hit)
    expect(screen.getByText(/另有 2 条价位提醒暂停判断/)).toBeTruthy()
  })
})
