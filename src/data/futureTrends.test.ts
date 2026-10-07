import { describe, expect, it } from 'vitest'
import { TRENDS, companyIdentity, trendCoverage } from './futureTrends'

const companies = TRENDS.flatMap(t => t.chain.flatMap(l => [...l.cn, ...l.us]))

describe('九赛道研究观察池', () => {
  it('每条业务关联说明敞口与证据边界，来源链接仅使用 HTTPS', () => {
    for (const company of companies) {
      expect(['直接业务', '多元业务', '研发验证', '间接配套']).toContain(company.exposure)
      expect(company.evidence, company.name).toMatch(/候选待核|已查阅/)
      expect(company.sourceTitle, company.name).toBeTruthy()
      if (company.sourceUrl) expect(new URL(company.sourceUrl).protocol).toBe('https:')
    }
    for (const t of TRENDS) {
      expect(new Set(t.chain.map(l => l.link)).size).toBe(t.chain.length)
      for (const link of t.chain) {
        expect(link.verify, `${t.id}/${link.link}`).toBeTruthy()
        const rows = [...link.cn, ...link.us]
        expect(new Set(rows.map(companyIdentity)).size, `${t.id}/${link.link}`).toBe(rows.length)
      }
    }
  })

  it('纠正不同公司代码混淆，保留更名与分拆后的证券主体', () => {
    expect(companies.filter(c => c.name === '凯赛生物').every(c => c.code === '688065')).toBe(true)
    expect(companies.find(c => c.name === '中科飞测')?.code).toBe('688361')
    expect(companies.filter(c => c.name.includes('百济神州')).every(c => c.code.startsWith('ONC'))).toBe(true)
    expect(companies.some(c => c.name === '韦尔股份' || c.code.includes('BGNE'))).toBe(false)
    expect(companies.filter(c => c.name === 'Qnity Electronics').every(c => c.code === 'Q')).toBe(true)
    expect(companies.find(c => c.name === 'Versigent')?.code).toBe('VGNT')
  })

  it('去重公司计数区分发行人和不同业务关联', () => {
    const nvidia = companies.filter(c => c.code === 'NVDA')
    expect(nvidia.length).toBeGreaterThan(1)
    expect(new Set(nvidia.map(companyIdentity)).size).toBe(1)
    const privateCompanies = companies.filter(c => c.code === '上市状态待核')
    expect(new Set(privateCompanies.map(companyIdentity)).size).toBeGreaterThan(1)
    expect(trendCoverage().companies).toBeLessThan(trendCoverage().entries)
  })
})
