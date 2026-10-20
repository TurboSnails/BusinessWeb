import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CompanyCombined from './CompanyCombined'
import type { Company, LynchInfo } from '../data/companies'
import { calculateMultiples, calculateSheetDcf, calculateWacc, makeDcfRecord, type DcfSheetInput } from '../features/dcf'

const company = (code: string, name: string, sector: string, rating: string): Company => ({
  code, name, sector, rating, market: 'cn', batch: '测试', headline: `${name}研究结论`,
  metrics: [], thesis: [], risk: [], next: [], asOf: '2026-09-30',
})
const a = company('001', '甲公司', '制造', '观察')
const b = company('002', '乙公司', '制造', '条件关注')
const c = company('003', '丙公司', '银行', '观察')
const lynch: Record<string, LynchInfo> = {
  'cn:001': { t: '快速增长型', r: '高', m: { l: '宽护城河迹象', s: 5, n: 6, i: [] }, v: '甲林奇结论', w: [], f: [] },
  'cn:002': { t: '快速增长型', r: '低', m: null, w: ['乙林奇结论'], f: [] },
}
const show = (companies: Company[] = [a, b, c, a]) => render(<MemoryRouter><CompanyCombined companies={companies} lynch={lynch} ratingOf={x => x.rating} loading={false} /></MemoryRouter>)
const companyLinks = () => screen.getAllByRole('link').filter(l => !/DCF/.test(l.getAttribute('aria-label') ?? ''))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('综合分类公司并集', () => {
  it('按市场和代码去重，保留缺少林奇标签的公司', () => {
    show([a, b, c, a, { ...a, market: 'us', name: '美股甲' }])
    expect(companyLinks()).toHaveLength(4)
    expect(screen.getByRole('link', { name: '甲公司 001' }).getAttribute('href')).toBe('/research-notes/cn/001')
    fireEvent.change(screen.getByRole('combobox', { name: '林奇类型' }), { target: { value: '未分类' } })
    expect(screen.getByRole('link', { name: '丙公司 003' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '美股甲 001' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: '甲公司 001' })).toBeNull()
  })

  it('研究评级下拉按固定顺序：优先关注排在最前', () => {
    const d = company('004', '丁公司', '制造', '回避'); const e = company('005', '戊公司', '制造', '优先关注')
    show([a, b, c, d, e])
    const options = within(screen.getByRole('combobox', { name: '研究评级' })).getAllByRole('option').map(o => o.textContent)
    expect(options).toEqual(['全部', '优先关注', '条件关注', '观察', '回避'])
  })

  it('行业、评级与林奇条件组合筛选，并可重置', () => {
    show()
    fireEvent.change(screen.getByRole('combobox', { name: '行业' }), { target: { value: '制造' } })
    fireEvent.change(screen.getByRole('combobox', { name: '研究评级' }), { target: { value: '观察' } })
    fireEvent.change(screen.getByRole('combobox', { name: '林奇类型' }), { target: { value: '快速增长型' } })
    fireEvent.change(screen.getByRole('combobox', { name: '同类关注度' }), { target: { value: '高' } })
    fireEvent.change(screen.getByRole('combobox', { name: '护城河' }), { target: { value: '宽' } })
    expect(companyLinks()).toHaveLength(1)
    const row = screen.getByRole('link', { name: '甲公司 001' }).closest('tr')!
    expect(within(row).getByText('甲公司研究结论')).toBeTruthy()
    expect(within(row).getByText('甲林奇结论')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: '搜索综合分类' }), { target: { value: '不存在' } })
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: '重置筛选' }))
    expect(companyLinks()).toHaveLength(3)
  })

  it('导出当前筛选包含两套信息和缺失标签', async () => {
    let exported: Blob | undefined
    vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { exported = blob; return 'blob:test' }, revokeObjectURL: () => {} })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    show()
    fireEvent.change(screen.getByRole('combobox', { name: '林奇类型' }), { target: { value: '未分类' } })
    fireEvent.click(screen.getByRole('button', { name: /下载当前筛选 JSON/ }))
    const text = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(exported!) })
    const rows = JSON.parse(text)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ 代码: '003', 林奇类型: '未分类', 评级: '观察', 研究结论: '丙公司研究结论' })
  })
})

it('下载全部JSON不受当前搜索限制，并设置下载文件名', async () => {
  let exported: Blob | undefined
  let filename = ''
  vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { exported = blob; return 'blob:test' }, revokeObjectURL: () => {} })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { filename = this.download })
  show()
  fireEvent.change(screen.getByRole('textbox', { name: '搜索综合分类' }), { target: { value: '甲公司' } })
  fireEvent.click(screen.getByRole('button', { name: /下载市场全部 JSON/ }))
  const text = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(exported!) })
  expect(JSON.parse(text).map((r: { 代码: string }) => r.代码)).toEqual(['001', '002', '003'])
  expect(filename).toMatch(/^cn-综合分类-全部-.*\.json$/)
})

describe('综合分类：DCF 列与筛选', () => {
  it('每行有 DCF 入口；按本机 DCF 记录筛出已算且安全边际达标的公司', () => {
    const input = { company: '甲公司', code: '001', market: 'cn', currency: 'CNY', moneyUnit: 'yi', shareUnit: 'yi', baseYear: 2025, baseFcf: 10, growth: 10, perpetualGrowth: 2, discountRate: 10, cash: 0, debt: 0, shares: 10, currentPrice: 5, marketCap: null, beta: null, interestExpense: null, pretaxIncome: null, taxPaid: null, riskFreeRate: null, marketReturn: null, ebitda: null } as DcfSheetInput
    const result = calculateSheetDcf(input)
    const rec = makeDcfRecord(input, { result: { ...result, mos: 0.3 }, wacc: calculateWacc(input), multiples: calculateMultiples(input) })
    localStorage.setItem('businessweb.dcf.v1', JSON.stringify([rec]))
    show([a, b, c])
    expect(screen.getByRole('link', { name: '算 DCF 002' }).getAttribute('href')).toContain('/dcf?')
    expect(screen.getByRole('link', { name: /DCF 001 我的 安全边际 \+30%/ })).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'DCF' }), { target: { value: 'mos20' } })
    expect(screen.getByRole('link', { name: '甲公司 001' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: '乙公司 002' })).toBeNull()
    fireEvent.change(screen.getByRole('combobox', { name: 'DCF' }), { target: { value: 'none' } })
    expect(screen.queryByRole('link', { name: '甲公司 001' })).toBeNull()
    expect(screen.getByRole('link', { name: '乙公司 002' })).toBeTruthy()
    localStorage.clear()
  })
})
