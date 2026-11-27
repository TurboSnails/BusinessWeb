import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { loadCompanies, type Company } from './companies'

const directory = 'public/research/hk-2026-10-07'
const read = (name: string) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'))
let companies: Company[]
beforeAll(async () => {
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => JSON.parse(readFileSync(resolve('public/data/hk.json'), 'utf8')) }))
  companies = await loadCompanies('hk')
})

describe('港股本轮研究不会被历史手工页和筛选数据覆盖', () => {
  it('2026-10-07 的 127 家手工研究页仍完整；程序化初筛可并存于研究池', () => {
    const audit = read('audit.json')
    const screened = companies.filter(c => c.auto && !c.reviewed && !c.researchReport)
    expect(companies.length).toBeGreaterThanOrEqual(127)
    expect(new Set(companies.map(c => c.code)).size).toBe(companies.length)
    expect(audit.companies).toHaveLength(127)
    for (const row of audit.companies) {
      const company = companies.find(c => c.code === row.code)!
      expect(company.headline).toContain(row.judgment)
      expect(company.metrics.find(([key]) => key === '价格锚点')?.[1]).toMatch(/\d{4}-\d{2}-\d{2}T/)
      expect(company.metrics.find(([key]) => key === '价格锚点')?.[1]).toContain('非交易所认证收盘')
      expect(company.researchReport).toBe(`research/hk-2026-10-07/${row.code}.html`)
      expect(existsSync(resolve('public', company.researchReport!))).toBe(true)
      expect(company.discipline?.zone).toContain('[MISSING]')
      expect(company.scenarios).toHaveLength(3)
      expect(company.ratioNote).toMatch(/不认证|未认证/)
      const report = readFileSync(resolve(directory, `${row.code}.md`), 'utf8')
      expect([...report.matchAll(/^## \d+ ·/gm)]).toHaveLength(15)
      expect(report).toContain(row.filing)
      expect(report.trim()).toMatch(/本报告仅供研究参考，不构成个人投资建议。$/)
      expect(row.certified).toBe(false)
    }
    expect(read('batches.json').every((b: { codes: string[] }) => b.codes.length >= 3 && b.codes.length <= 5)).toBe(true)
    expect(read('batches.json').flatMap((b: { codes: string[] }) => b.codes).sort()).toEqual(audit.companies.map((c: { code: string }) => c.code).sort())
    // 恒指/恒科新增成分以程序化初筛占位，不编造情景价（2026-11-27：13 家新增中 5 家已有手工研究页，其余 8 家仍为初筛）
    expect(screened.length).toBeGreaterThanOrEqual(8)
    for (const code of ['03750', '02513', '00100', '00020', '09660']) {
      const c = companies.find(x => x.code === code)!
      expect(c.auto, code).toBeFalsy()
      expect(c.scenarios, code).toHaveLength(3)
      expect(c.scenarios!.every(s => s.price.includes('[MISSING]')), code).toBe(true)
      expect(c.rating, code).not.toMatch(/^未估值/)
    }
    for (const c of screened) {
      expect(c.scenarios?.some(s => /\d/.test(s.price) && !/MISSING/.test(s.price)) ?? false).toBe(false)
      expect(c.rating).toMatch(/^未估值/)
    }
  })

  it('extra.ts中的REIT/药明历史结论不会复活；财年、列序与处罚修正保留', () => {
    const find = (code: string) => companies.find(c => c.code === code)!
    expect(find('00823').rating).toBe('观察')
    expect(find('00823').metrics.find(([k]) => k === '原件财务核读')?.[1]).toContain('DPU2.5361')
    for (const code of ['02269', '02359']) expect(find(code).headline).toContain('事实已复核')
    expect(find('00823').headline).toContain('观察')
    expect(find('00241').metrics.find(([k]) => k === '财报期')?.[1]).toContain('2026-03-31的全年')
    expect(find('02015').metrics.find(([k]) => k === '原件财务核读')?.[1]).toContain('2026放右')
    expect(find('09961').pitfalls?.join(' ')).toContain('罚款35.21亿')
    expect(find('09866').pitfalls?.join(' ')).toContain('交割后预期持股30%')
    expect(find('00939').metrics.find(([k]) => k === '研究复核')?.[1]).toContain('实际4.62%')
  })

  it('数值草案不能冒充完整两方法估值，缺少价格者保持缺失', () => {
    const models = read('models.json')
    expect(Object.values(models).filter((m: any) => m.numericDraft)).toHaveLength(8)
    expect(models['00939'].bvpsCny).toBe(13.69)
    expect(models['01288'].bvpsCny).toBe(8.17)
    expect(models['00823'].nav).toBe(57.75)
    const auditRows = read('audit.json').companies as Array<{ code: string; judgment: string }>
    for (const row of auditRows) {
      const company = companies.find(c => c.code === row.code)!
      expect(company.headline).toContain(row.judgment)
      const model = models[company.code]
      expect(model.certified).toBe(false)
      expect(model.independentMethodsClosed).toBe(false)
      const prices = company.scenarios?.map(s => Number((s.price.match(/[0-9][0-9,]*(?:\.[0-9]+)?/) || [''])[0].replace(/,/g, '')))
      const allMissing = company.scenarios?.every(s => s.price.includes('[MISSING]'))
      const allDraftIncreasing = company.scenarios?.every(s => s.price.includes('估值初稿')) && prices![0] < prices![1] && prices![1] < prices![2]
      const unresolvedLoss = ['00881', '00960', '01997', '03323', '03690', '09888'].includes(company.code)
      expect(allMissing || allDraftIncreasing || unresolvedLoss).toBe(true)
      if (model.numericDraft) {
        expect(model.bear).toBeLessThan(model.base)
        expect(model.base).toBeLessThan(model.bull)
      }
    }
    for (const code of ['01958', '02015', '02238', '09866', '09868']) {
      expect(companies.find(c => c.code === code)?.rating).toBe('回避')
    }
    for (const code of ['00881', '00960', '01997', '03323', '03690', '09888', '00823']) {
      expect(companies.find(c => c.code === code)?.rating).toBe('观察')
    }
  })
})
