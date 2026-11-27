import React, { useState } from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ScrollToHash from './ScrollToHash'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function LateAnchor(): JSX.Element {
  const [ready, setReady] = useState(false)
  // 模拟异步正文：首屏没有目标，稍后才挂上
  React.useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 30)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <div>
      <p>top</p>
      {ready && <section id="cs-matrix">九种状态</section>}
    </div>
  )
}

function HashClicker(): JSX.Element {
  const nav = useNavigate()
  return (
    <div>
      <button type="button" onClick={() => nav('#cs-matrix')}>去矩阵</button>
      <section id="cs-matrix" style={{ marginTop: 2000 }}>九种状态</section>
    </div>
  )
}

describe('ScrollToHash', () => {
  it('异步挂载后滚到 hash 目标', async () => {
    const scrollIntoView = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView

    render(
      <MemoryRouter initialEntries={['/invest/strategy#cs-matrix']}>
        <ScrollToHash />
        <Routes>
          <Route path="/invest/strategy" element={<LateAnchor />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(document.getElementById('cs-matrix')).toBeNull()
    await waitFor(() => expect(document.getElementById('cs-matrix')).toBeTruthy())
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    Element.prototype.scrollIntoView = original
  })

  it('同页点锚点时也会滚到目标（不挡返回键改 hash）', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    render(
      <MemoryRouter initialEntries={['/invest/strategy']}>
        <ScrollToHash />
        <Routes>
          <Route path="/invest/strategy" element={<HashClicker />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(scrollIntoView).not.toHaveBeenCalled()
    await act(async () => {
      document.querySelector('button')?.click()
    })
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
  })
})
