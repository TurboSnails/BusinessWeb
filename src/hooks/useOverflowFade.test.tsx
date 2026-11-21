import React from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scrollChildIntoViewX, useOverflowFade } from './useOverflowFade'

afterEach(cleanup)

function Scroller({
  wide,
  view,
  scroll,
}: {
  wide: number
  view: number
  scroll: number
}): JSX.Element {
  const { ref } = useOverflowFade<HTMLDivElement>()
  return (
    <div
      key={`${wide}-${view}-${scroll}`}
      ref={(node) => {
        if (node) {
          Object.defineProperty(node, 'scrollWidth', { configurable: true, get: () => wide })
          Object.defineProperty(node, 'clientWidth', { configurable: true, get: () => view })
          Object.defineProperty(node, 'scrollLeft', { configurable: true, get: () => scroll })
        }
        ref(node)
      }}
      data-testid="scroller"
    />
  )
}

describe('useOverflowFade', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
      unobserve() {}
    })
    vi.stubGlobal('MutationObserver', class {
      observe() {}
      disconnect() {}
      takeRecords() { return [] }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('溢出且在起点：只有 data-overflow-end', () => {
    const { getByTestId } = render(<Scroller wide={400} view={100} scroll={0} />)
    const el = getByTestId('scroller')
    expect(el.hasAttribute('data-overflow-start')).toBe(false)
    expect(el.hasAttribute('data-overflow-end')).toBe(true)
  })

  it('滚到中间：两端都有；滚到最右只剩 start', () => {
    const { getByTestId, rerender } = render(<Scroller wide={400} view={100} scroll={150} />)
    expect(getByTestId('scroller').hasAttribute('data-overflow-start')).toBe(true)
    expect(getByTestId('scroller').hasAttribute('data-overflow-end')).toBe(true)

    rerender(<Scroller wide={400} view={100} scroll={300} />)
    expect(getByTestId('scroller').hasAttribute('data-overflow-start')).toBe(true)
    expect(getByTestId('scroller').hasAttribute('data-overflow-end')).toBe(false)
  })

  it('内容不溢出时不打属性', () => {
    const { getByTestId } = render(<Scroller wide={100} view={100} scroll={0} />)
    expect(getByTestId('scroller').hasAttribute('data-overflow-start')).toBe(false)
    expect(getByTestId('scroller').hasAttribute('data-overflow-end')).toBe(false)
  })

  it('scrollChildIntoViewX 只改 scrollLeft，按居中算目标', () => {
    const container = document.createElement('div')
    const child = document.createElement('button')
    container.appendChild(child)
    let left = 0
    Object.defineProperty(container, 'clientWidth', { value: 100 })
    Object.defineProperty(container, 'scrollWidth', { value: 400 })
    Object.defineProperty(container, 'scrollLeft', {
      get: () => left,
      set: (v: number) => { left = v },
    })
    Object.defineProperty(child, 'offsetLeft', { value: 280 })
    Object.defineProperty(child, 'offsetWidth', { value: 80 })
    Object.defineProperty(child, 'offsetParent', { value: container })
    const intoView = vi.fn()
    child.scrollIntoView = intoView
    scrollChildIntoViewX(container, child)
    expect(left).toBe(270)
    expect(intoView).not.toHaveBeenCalled()
  })

  it('scrollChildIntoViewX 无溢出时不改 scrollLeft', () => {
    const container = document.createElement('div')
    const child = document.createElement('button')
    let left = 12
    Object.defineProperty(container, 'clientWidth', { value: 200 })
    Object.defineProperty(container, 'scrollWidth', { value: 200 })
    Object.defineProperty(container, 'scrollLeft', {
      get: () => left,
      set: (v: number) => { left = v },
    })
    scrollChildIntoViewX(container, child)
    expect(left).toBe(12)
  })

  it('scroll 事件会刷新属性；sync 可手动重算', () => {
    let left = 0
    function Live(): JSX.Element {
      const { ref, sync } = useOverflowFade<HTMLDivElement>()
      return (
        <>
          <div
            ref={(node) => {
              if (node) {
                Object.defineProperty(node, 'scrollWidth', { configurable: true, get: () => 400 })
                Object.defineProperty(node, 'clientWidth', { configurable: true, get: () => 100 })
                Object.defineProperty(node, 'scrollLeft', {
                  configurable: true,
                  get: () => left,
                  set: (v: number) => { left = v },
                })
              }
              ref(node)
            }}
            data-testid="live"
          />
          <button type="button" onClick={() => { left = 300; sync() }}>sync</button>
        </>
      )
    }
    const { getByTestId, getByRole } = render(<Live />)
    const el = getByTestId('live')
    expect(el.hasAttribute('data-overflow-end')).toBe(true)
    left = 150
    fireEvent.scroll(el)
    expect(el.hasAttribute('data-overflow-start')).toBe(true)
    expect(el.hasAttribute('data-overflow-end')).toBe(true)
    fireEvent.click(getByRole('button', { name: 'sync' }))
    expect(el.hasAttribute('data-overflow-start')).toBe(true)
    expect(el.hasAttribute('data-overflow-end')).toBe(false)
  })
})
