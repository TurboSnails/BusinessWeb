import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoApi } from './demoApi'
import { SymbolSearch } from './SymbolSearch'

afterEach(() => cleanup())

describe('SymbolSearch 键盘交互', () => {
  it('防抖搜索后方向键 / 回车选中', async () => {
    const onSelect = vi.fn()
    const api = createDemoApi()
    render(<SymbolSearch api={api} onSelect={onSelect} />)
    const input = screen.getByRole('combobox')
    await act(async () => {
      fireEvent.change(input, { target: { value: 'MR' } })
    })
    await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy(), { timeout: 2000 })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(onSelect).toHaveBeenCalled()
    expect(String(onSelect.mock.calls[0][0]).toUpperCase()).toContain('MR')
  })

  it('Esc 关闭下拉；无候选时回车按代码查', async () => {
    const onSelect = vi.fn()
    render(<SymbolSearch api={createDemoApi()} onSelect={onSelect} />)
    const input = screen.getByRole('combobox')
    await act(async () => {
      fireEvent.change(input, { target: { value: 'ZZZZZ' } })
    })
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull(), { timeout: 2000 })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(onSelect).toHaveBeenCalledWith('ZZZZZ', undefined)
    await act(async () => {
      fireEvent.change(input, { target: { value: 'NV' } })
    })
    await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy(), { timeout: 2000 })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape' })
    })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
