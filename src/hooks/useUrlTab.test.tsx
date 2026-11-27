import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useSearchParams } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { useUrlTab } from './useUrlTab'

afterEach(cleanup)

function Probe(): JSX.Element {
  const [tab, setTab] = useUrlTab('tab', ['a', 'b', 'c'] as const, 'a')
  const [params] = useSearchParams()
  return (
    <div>
      <p data-testid="value">{tab}</p>
      <p data-testid="search">{params.toString()}</p>
      <button type="button" onClick={() => setTab('b')}>to-b</button>
      <button type="button" onClick={() => setTab('a')}>to-a</button>
    </div>
  )
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
    </MemoryRouter>,
  )

describe('useUrlTab', () => {
  it('从 URL 读取合法页签，非法值回落到默认', () => {
    renderAt('/p?tab=b')
    expect(screen.getByTestId('value').textContent).toBe('b')
    cleanup()
    renderAt('/p?tab=nope')
    expect(screen.getByTestId('value').textContent).toBe('a')
  })

  it('切换页签写入 URL；回到默认值时删掉参数', () => {
    renderAt('/p')
    fireEvent.click(screen.getByRole('button', { name: 'to-b' }))
    expect(screen.getByTestId('search').textContent).toBe('tab=b')
    fireEvent.click(screen.getByRole('button', { name: 'to-a' }))
    expect(screen.getByTestId('search').textContent).toBe('')
  })
})
