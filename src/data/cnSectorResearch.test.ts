import { describe, expect, it, vi } from 'vitest'

describe('loadApplyCnSectorResearch 按需分册', () => {
  it('无对应分册的代码不拉取任何研究分册模块', async () => {
    const chem = vi.fn()
    const finance = vi.fn()
    const four = vi.fn()
    const sectors = vi.fn()
    vi.resetModules()
    vi.doMock('./details/cnChemGoldmanResearch', () => { chem(); return { cnChemGoldmanResearch: {} } })
    vi.doMock('./details/cnFinancePropertyIndustrialResearch', () => { finance(); return { cnFinancePropertyIndustrialResearch: {} } })
    vi.doMock('./details/cnFourSectorResearch', () => { four(); return { cnFourSectorResearch: {} } })
    vi.doMock('./details/cnSectorResearch', () => { sectors(); return { cnSectorResearch: {} } })
    const { loadApplyCnSectorResearch } = await import('./cnSectorResearch')
    const apply = await loadApplyCnSectorResearch(['600519'])
    const out = apply({
      code: '600519', name: '贵州茅台', market: 'cn', sector: '日常消费', batch: 't', rating: '观察',
      headline: 'h', metrics: [], thesis: [], risk: [], next: [], asOf: '',
    })
    expect(out.rating).toBe('观察')
    expect(chem).not.toHaveBeenCalled()
    expect(finance).not.toHaveBeenCalled()
    expect(four).not.toHaveBeenCalled()
    expect(sectors).not.toHaveBeenCalled()
  })

  it('金融代码只拉金融地产工业分册', async () => {
    vi.resetModules()
    vi.doMock('./details/cnChemGoldmanResearch', () => ({ cnChemGoldmanResearch: {} }))
    vi.doMock('./details/cnFinancePropertyIndustrialResearch', () => ({
      cnFinancePropertyIndustrialResearch: {
        '601318': { rating: '分册覆盖', headline: '来自分册' },
      },
    }))
    vi.doMock('./details/cnFourSectorResearch', () => ({ cnFourSectorResearch: {} }))
    vi.doMock('./details/cnSectorResearch', () => ({ cnSectorResearch: {} }))
    const { loadApplyCnSectorResearch } = await import('./cnSectorResearch')
    const apply = await loadApplyCnSectorResearch(['601318'])
    const out = apply({
      code: '601318', name: '中国平安', market: 'cn', sector: '金融', batch: 't', rating: '观察',
      headline: 'h', metrics: [], thesis: [], risk: [], next: [], asOf: '',
    })
    expect(out.rating).toBe('分册覆盖')
    expect(out.headline).toBe('来自分册')
    expect(out.researchReport).toContain('cn-finance-property-industrial-2026-10-07/601318.md')
  })
})

it('公司索引覆盖每册的全部代码，重叠代码保留原覆盖顺序', async () => {
  vi.resetModules()
  vi.doUnmock('./details/cnChemGoldmanResearch')
  vi.doUnmock('./details/cnFinancePropertyIndustrialResearch')
  vi.doUnmock('./details/cnFourSectorResearch')
  vi.doUnmock('./details/cnSectorResearch')

  const [index, chem, finance, four, sectors] = await Promise.all([
    import('./details/cnSectorBookletIndex'),
    import('./details/cnChemGoldmanResearch'),
    import('./details/cnFinancePropertyIndustrialResearch'),
    import('./details/cnFourSectorResearch'),
    import('./details/cnSectorResearch'),
  ])
  const expected = Object.fromEntries([
    ...Object.keys(sectors.cnSectorResearch).map(code => [code, 'sectors']),
    ...Object.keys(four.cnFourSectorResearch).map(code => [code, 'four']),
    ...Object.keys(finance.cnFinancePropertyIndustrialResearch).map(code => [code, 'finance']),
    ...Object.keys(chem.cnChemGoldmanResearch).map(code => [code, 'chem']),
  ])
  expect(index.CN_SECTOR_BOOKLET_BY_CODE).toEqual(expected)
})
