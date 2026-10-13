import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import QuickDcf from './QuickDcf'
import { loadDcfRecords } from '../features/dcf'
import { readToolSources, toolProgress } from '../features/candidates/links'

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); localStorage.clear() })

const fill = (label: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } })

describe('个股页简版 DCF', () => {
  it('填七项得到合理价与安全边际，保存后候选池与筛选能读到', () => {
    render(<MemoryRouter><QuickDcf market="cn" code="600519" name="示例公司" price={5} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: '保存到 DCF 记录' }).hasAttribute('disabled')).toBe(true)
    fill('起始自由现金流（亿）', '10'); fill('未来 5 年成长率（%）', '10'); fill('永续增长率（%）', '2'); fill('折现率（%）', '10')
    fill('现金及投资（亿）', '0'); fill('总负债（亿）', '0'); fill('流通股数（亿股）', '10')
    expect(screen.getByRole('status').textContent).toMatch(/合理价/)
    expect(screen.getByRole('status').textContent).toMatch(/安全边际/)
    fireEvent.click(screen.getByRole('button', { name: '保存到 DCF 记录' }))
    expect(loadDcfRecords()).toHaveLength(1)
    const p = toolProgress('cn', '600519', readToolSources()).dcf
    expect(p?.mos).not.toBeNull()
    expect(screen.getByRole('link', { name: /去完整 DCF/ }).getAttribute('href')).toContain('code=600519')
  })

  it('本机已有这家公司的记录时接着用', () => {
    const { unmount } = render(<MemoryRouter><QuickDcf market="cn" code="600519" name="示例公司" price={5} /></MemoryRouter>)
    fill('起始自由现金流（亿）', '10'); fill('未来 5 年成长率（%）', '10'); fill('永续增长率（%）', '2'); fill('折现率（%）', '10')
    fill('现金及投资（亿）', '0'); fill('总负债（亿）', '0'); fill('流通股数（亿股）', '10')
    fireEvent.click(screen.getByRole('button', { name: '保存到 DCF 记录' }))
    unmount()
    render(<MemoryRouter><QuickDcf market="cn" code="600519" name="示例公司" price={5} /></MemoryRouter>)
    expect((screen.getByRole('textbox', { name: '折现率（%）' }) as HTMLInputElement).value).toBe('10')
  })
})
