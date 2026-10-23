import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import PersonalLifeAnalysis from './PersonalLifeAnalysis'
import { unlockReport } from '../features/human3/privateReport'
vi.mock('../features/human3/privateReport', () => ({ unlockReport: vi.fn() }))
afterEach(() => { cleanup(); vi.mocked(unlockReport).mockReset() })
function mount() { render(<MemoryRouter><PersonalLifeAnalysis /></MemoryRouter>) }
it('未解锁时无正文；错误密码可重试，正确密码显示报告，重新锁定会清除正文', async () => {
  vi.mocked(unlockReport).mockRejectedValueOnce(new Error('wrong')).mockResolvedValueOnce('## 四象限评估\n\n只在解锁后显示的内容。')
  mount()
  expect(screen.queryByText('只在解锁后显示的内容。')).toBeNull()
  fireEvent.change(screen.getByLabelText('阅读密码'), { target: { value: 'wrong-test' } })
  fireEvent.click(screen.getByRole('button', { name: '解锁阅读' }))
  await screen.findByRole('alert')
  expect(document.activeElement).toBe(screen.getByLabelText('阅读密码'))
  expect(screen.queryByRole('heading', { name: '四象限评估' })).toBeNull()
  fireEvent.change(screen.getByLabelText('阅读密码'), { target: { value: 'correct-test' } })
  fireEvent.click(screen.getByRole('button', { name: '解锁阅读' }))
  await screen.findByRole('heading', { name: '四象限评估' })
  expect(screen.getByText('只在解锁后显示的内容。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '重新锁定' }))
  expect(screen.queryByText('只在解锁后显示的内容。')).toBeNull()
  expect((screen.getByLabelText('阅读密码') as HTMLInputElement).value).toBe('')
})
