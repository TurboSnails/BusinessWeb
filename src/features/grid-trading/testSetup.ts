import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// jsdom 未实现滚动，页面挂载时调用 scrollTo 会刷出大量 "Not implemented" 噪音；需要断言的测试仍可自行 stub/spy
window.scrollTo = (() => {}) as typeof window.scrollTo

beforeEach(() => {
  vi.stubGlobal('localStorage', window.localStorage)
  vi.stubGlobal('sessionStorage', window.sessionStorage)
  vi.stubGlobal('Storage', window.Storage)
})

afterEach(() => {
  cleanup()
})
