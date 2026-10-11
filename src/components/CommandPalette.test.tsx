import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { CommandPaletteProvider, useCommandPalette } from './CommandPalette'
import { RECENT_PAGES_KEY } from '../features/recent-pages/store'

afterEach(() => { cleanup(); localStorage.clear(); document.body.style.overflow = '' })

function Where(): JSX.Element { return <p data-testid="where">{useLocation().pathname}</p> }
function Opener(): JSX.Element { const { open } = useCommandPalette(); return <button onClick={open}>打开</button> }
function Elsewhere(): JSX.Element { const nav = useNavigate(); return <button onClick={() => nav('/about')}>去关于</button> }

const setup = (path = '/') => render(
  <MemoryRouter initialEntries={[path]}>
    <CommandPaletteProvider>
      <Opener /><Elsewhere /><input aria-label="别的输入框" />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </CommandPaletteProvider>
  </MemoryRouter>
)
const dialog = () => screen.queryByRole('dialog', { name: '跳转到页面' })

describe('CommandPalette', () => {
  it('⌘K 打开并聚焦输入框，Esc 关闭并把焦点还回去', () => {
    setup()
    const opener = screen.getByRole('button', { name: '打开' })
    opener.focus()
    fireEvent.keyDown(opener, { key: 'k', metaKey: true })
    expect(dialog()).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('combobox'))
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe('')
  })

  it('Ctrl+K 也能打开；在别的输入框里按 / 不打开', () => {
    setup()
    const other = screen.getByLabelText('别的输入框')
    other.focus()
    fireEvent.keyDown(other, { key: '/' })
    expect(dialog()).toBeNull()
    fireEvent.keyDown(other, { key: 'k', ctrlKey: true })
    expect(dialog()).toBeTruthy()
  })

  it('不在输入框时按 / 打开', () => {
    setup()
    fireEvent.keyDown(document.body, { key: '/' })
    expect(dialog()).toBeTruthy()
  })

  it('输入后回车跳到第一项，面板关闭', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dcf' } })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(screen.getByTestId('where').textContent).toBe('/dcf')
    expect(dialog()).toBeNull()
  })

  it('↓ 移动高亮后回车跳到第二项', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    const box = screen.getByRole('combobox')
    fireEvent.change(box, { target: { value: '网格' } })
    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(1)
    expect(options[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true')
    const target = options[1].getAttribute('data-path')
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(screen.getByTestId('where').textContent).toBe(target)
  })

  it('↑ 在第一项时回到最后一项', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    const box = screen.getByRole('combobox')
    fireEvent.change(box, { target: { value: '网格' } })
    fireEvent.keyDown(box, { key: 'ArrowUp' })
    const options = screen.getAllByRole('option')
    expect(options[options.length - 1].getAttribute('aria-selected')).toBe('true')
  })

  it('无匹配时提示，回车不跳转', () => {
    setup('/about')
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzzz不存在' } })
    expect(screen.getByText('没有匹配的页面')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(screen.getByTestId('where').textContent).toBe('/about')
    expect(dialog()).toBeTruthy()
  })

  it('查询为空时先列最近访问', () => {
    localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(['/monitor']))
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    expect(screen.getByText('最近访问')).toBeTruthy()
    expect(screen.getAllByRole('option')[0].getAttribute('data-path')).toBe('/monitor')
    expect(screen.getAllByRole('option').filter(o => o.getAttribute('data-path') === '/monitor')).toHaveLength(1)
  })

  it('路由变化时自动关闭并解除滚动锁', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    act(() => { fireEvent.click(screen.getByRole('button', { name: '去关于' })) })
    expect(dialog()).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('中文输入法选词时的回车和方向键不触发跳转或移动高亮', () => {
    setup('/about')
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    const box = screen.getByRole('combobox')
    fireEvent.change(box, { target: { value: '网格' } })
    fireEvent.keyDown(box, { key: 'ArrowDown', isComposing: true })
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 })
    expect(screen.getByTestId('where').textContent).toBe('/about')
    expect(dialog()).toBeTruthy()
  })

  it('点遮罩关闭', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    fireEvent.mouseDown(document.querySelector('.cmdk-overlay') as Element)
    expect(dialog()).toBeNull()
  })
})
