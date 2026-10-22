import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ComprehensiveValuation from './ComprehensiveValuation'
import fixture from '../features/valuation/report.fixture.json'
import { saveLast } from '../features/valuation/session'
import { importReport } from '../features/valuation/storage'

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
const open = () => render(<MemoryRouter><ComprehensiveValuation /></MemoryRouter>)

it('可手填乘数假设、选择主锚，离开回来仍保留证据和研究草稿', () => {
  const view = open()
  for (const [i, name] of ['悲观', '基准', '乐观'].entries()) {
    fireEvent.change(screen.getByLabelText(`${name}预测 EPS`), { target: { value: String(i + 1) } })
    fireEvent.change(screen.getByLabelText(`${name}目标 PE`), { target: { value: '20' } })
  }
  fireEvent.change(screen.getByLabelText('PE 倍数依据'), { target: { value: '同行15–25倍，正常化盈利取20倍。' } })
  fireEvent.change(screen.getByLabelText('公司名称 / 代码'), { target: { value: '研究公司' } })
  fireEvent.click(screen.getByRole('button', { name: '采用 PE 情景价' }))
  expect((screen.getByLabelText('基准未来每股价格') as HTMLInputElement).value).toBe('40')
  view.unmount()
  open()
  expect((screen.getByLabelText('公司名称 / 代码') as HTMLInputElement).value).toBe('研究公司')
  expect((screen.getByLabelText('PE 倍数依据') as HTMLTextAreaElement).value).toBe('同行15–25倍，正常化盈利取20倍。')
  expect((screen.getByLabelText('基准未来每股价格') as HTMLInputElement).value).toBe('40')
})

it('显式导入最近工作台报告，展示来源、假设及三种方法，导出保留依据', () => {
  saveLast(importReport(JSON.stringify(fixture)))
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const createUrl = vi.fn((_blob: Blob) => 'blob:research')
  vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: vi.fn() })
  open()
  fireEvent.click(screen.getByRole('button', { name: '导入所选工作台报告' }))
  expect((screen.getByLabelText('公司名称 / 代码') as HTMLInputElement).value).toBe('AAPL · AAPL')
  expect((screen.getByLabelText('基准预测 EPS') as HTMLInputElement).value).toBe(String(fixture.assumptions.scenarios.base.eps))
  expect((screen.getByLabelText('基准EPS 增长率 %') as HTMLInputElement).value).toBe('8')
  const panel = screen.getByRole('region', { name: 'PE、PEG、PB 估值分析' })
  expect(within(panel).getByText(/已导入：AAPL/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '下载研究卡' }))
  expect(createUrl).toHaveBeenCalledOnce()
  expect(createUrl.mock.calls[0][0]).toBeInstanceOf(Blob)
  click.mockRestore()
  vi.unstubAllGlobals()
})
