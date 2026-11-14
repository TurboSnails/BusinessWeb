// @vitest-environment-options {"url": "https://someone.github.io/BusinessWeb/invest/start"}
// #6：日历回链要带部署子路径（GitHub Pages /BusinessWeb/），由真实的生产者 ReviewPanel 生成。
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewPanel } from './components/ReviewPanel'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('ReviewPanel 导出的回链', () => {
  it('子路径部署：<当前部署 origin>/BusinessWeb/invest/start', async () => {
    vi.stubEnv('BASE_URL', '/BusinessWeb/')
    const blobs: Blob[] = []
    const urlApi = URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void }
    urlApi.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:x' })
    urlApi.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(
      <MemoryRouter>
        <ReviewPanel
          review={{ id: 'abc-1', anchor: '2030-01-15', intervalMonths: 6, completedDates: [], calendarSequence: 0 }}
          today="2026-11-14"
          onChange={() => {}}
        />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /下载日历文件/ }))
    const text = (await blobs[0].text()).replace(/\r\n /g, '')
    expect(text).toContain('URL:https://someone.github.io/BusinessWeb/invest/start\r\n')
  })
})
