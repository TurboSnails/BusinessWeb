import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { loadCompanies, type Company } from './companies'

const directory = 'public/research/adr-2026-10-07'
const read = (name: string) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'))
let companies: Company[]
beforeAll(async () => {
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => JSON.parse(readFileSync(resolve('public/data/adr.json'), 'utf8')) }))
  companies = await loadCompanies('adr')
})
const find = (code: string) => companies.find(c => c.code === code)!
const generated = () => companies.filter(c => c.code !== 'SOFI') // SOFI 为 2026-10-07 补录的完整版，不在批量复核（66家）内
const metric = (code: string, key: string) => find(code).metrics.find(([k]) => k === key)?.[1] ?? ''

describe('非标普全部分类的原件复核与运行时覆盖', () => {
  it('66家/4分类全部可打开本轮报告，旧detail层不覆盖', () => {
    const audit = read('audit.json')
    expect(companies).toHaveLength(67)
    expect(new Set(companies.map(c => c.code)).size).toBe(67)
    expect(audit.categories).toEqual({ 海外龙头: 30, 中概: 21, 新兴市场平台: 13, '新上市/热门': 2 })
    for (const row of audit.companies) {
      const company = find(row.code)
      expect(company.headline).toContain(row.judgment)
      expect(company.scenarios).toHaveLength(3)
      // 估值初稿覆盖层给出数字情景价的公司有条件研究门槛（带「不是已认证买入区」声明）；其余仍为 [MISSING]
      const hasDraftPrice = company.scenarios?.every(sc => sc.price.includes('估值初稿'))
      expect(company.discipline?.zone).toContain(hasDraftPrice ? '不是已认证买入区' : '[MISSING]')
      // 盈亏比文字必须写明未认证：估值初稿为「估值初稿（未认证）…」，无情景价的初稿为「…不认证可交易赔率」，旧页为「…未完成认证」
      expect(company.ratioNote).toMatch(/未完成认证|估值初稿（未认证）|不认证/)
      expect(metric(row.code, '价格锚点')).toMatch(/\d{4}-\d{2}-\d{2}T/)
      expect(metric(row.code, '价格锚点')).toContain('非交易所认证收盘')
      expect(company.researchReport).toBe(`research/adr-2026-10-07/${row.code}.html`)
      expect(existsSync(resolve('public', company.researchReport!))).toBe(true)
      const report = readFileSync(resolve(directory, `${row.code}.md`), 'utf8')
      expect([...report.matchAll(/^## \d+ ·/gm)]).toHaveLength(15)
      expect(report).toContain(row.filing)
      expect(report).toContain('单模型多视角复核')
      expect(report.trim()).toMatch(/本报告仅供研究参考，不构成个人投资建议。$/)
    }
    const batches = read('batches.json')
    expect(batches).toHaveLength(15)
    expect(batches.every((b: { codes: string[] }) => b.codes.length >= 3 && b.codes.length <= 5)).toBe(true)
    expect(batches.flatMap((b: { codes: string[] }) => b.codes).sort()).toEqual(generated().map(c => c.code).sort())
  })

  it('关键证券单位、财年与一次性损益不会恢复旧错误', () => {
    expect(metric('SKHY', '证券单位')).toContain('1 ADS = 0.1 股普通股')
    expect(metric('TAL', '证券单位')).toContain('3 ADS = 1 股普通股')
    expect(metric('HTHT', '证券单位')).toContain('1 ADS = 10 股普通股')
    expect(metric('SMFG', '证券单位')).toContain('1 ADS = 0.6 股普通股')
    expect(metric('ONC', '证券单位')).toContain('1 ADS = 13 股普通股')
    expect(metric('ITUB', '证券单位')).toContain('优先股')
    expect(metric('TD', '证券单位')).toContain('普通股')
    expect(metric('ASML', '财报期')).toContain('2026-06-28')
    expect(metric('TD', '财报期')).toContain('2026-07-31')
    expect(metric('TAL', '财报期')).toContain('2026-05-31')
    expect(metric('DEO', '财报期')).toContain('全年')
    expect(metric('SHOP', '原件财务核读')).toContain('1,063m')
    expect(metric('VIPS', '原件财务核读')).toContain('5.79bn')
    // 10-07 复核的「等待证据」在 2026-10-20 估值初稿中统一记为回避；其余公司不因供应商 EPS 为负而机械回避
    for (const code of ['CPNG', 'NIO', 'XPEV', 'LI', 'SPCX']) expect(find(code).rating).toBe('回避')
    for (const code of ['BIDU', 'HMC']) expect(find(code).rating).toBe('观察')
    expect(find('SPCX').segments?.map(s => s.name)).toEqual(['Space', 'Connectivity', 'AI'])
    // 估值初稿覆盖层的结论格式为「评级（估值初稿，未认证）：{10-07 公司专属判断}；估值：…」，事实复核结论仍随 judgment 保留
    const audit = read('audit.json')
    for (const code of ['BHP', 'RIO', 'UL', 'DEO', 'BTI', 'ONC']) expect(find(code).headline).toContain(audit.companies.find((r: { code: string }) => r.code === code).judgment)
  })

  it('只发布两家银行的静态敏感性，不认证价格/赔率；每股单位不混用', () => {
    const models = read('models.json')
    expect(Object.values(models).filter((m: any) => m.numericDraft)).toHaveLength(2)
    const fx = read('input.json').fx['CADUSD=X'].regularMarketPrice
    expect(models.HSBC.bvps).toBe(10.08)
    expect(models.HSBC.ordinaryPerUsInstrument).toBe(5)
    expect(models.HSBC.base).toBeCloseTo(10.08 * 5 * (12 - 2) / (11 - 2), 8)
    expect(models.TD.base).toBeCloseTo(69.69 * fx * (12 - 2) / (11 - 2), 8)
    for (const company of generated()) {
      const model = models[company.code]
      expect(model.certified).toBe(false)
      expect(model.independentMethodsClosed).toBe(false)
      // 情景价要么全为 [MISSING]，要么全部标注（估值初稿）且三档递增（2026-10-20 覆盖层）
      const prices = company.scenarios?.map(sc => Number((sc.price.match(/[0-9][0-9,]*(?:\.[0-9]+)?/) || [''])[0].replace(/,/g, '')))
      const allMissing = company.scenarios?.every(sc => sc.price.includes('[MISSING]'))
      const allDraftIncreasing = company.scenarios?.every(sc => sc.price.includes('估值初稿')) && prices![0] < prices![1] && prices![1] < prices![2]
      expect(allMissing || allDraftIncreasing).toBe(true)
      if (model.numericDraft) {
        expect(model.bear).toBeLessThan(model.base)
        expect(model.base).toBeLessThan(model.bull)
        expect(company.scenarios?.every(s => s.assumption.includes('未预测2027BV'))).toBe(true)
      }
    }
  })

  it('SOFI 补录为完整版：一手来源、三情景与赔率可复算，页面与报告齐全', () => {
    const sofi = find('SOFI')
    const evidence = read('../sofi-2026-10-07/evidence.json')
    expect(sofi.market).toBe('adr')
    expect(sofi.auto).toBe(false)
    expect(sofi.rating).toBe('观察')
    expect(sofi.scenarios?.map(s => s.name)).toEqual(['悲观', '基准', '乐观'])
    expect(sofi.scenarios?.map(s => s.price)).toEqual(['$8', '$19', '$28'])
    expect(sofi.discipline?.zone).toContain('$11.7')
    // 行情每日刷新：按当前价格锚点复算赔率，而不是锁定某一天的价格
    const sofiPrice = Number(metric('SOFI', '价格锚点').match(/US\$([\d.]+)/)?.[1])
    expect(sofiPrice).toBeGreaterThan(0)
    if (sofiPrice > 8 && sofiPrice < 19) expect(sofi.ratioNote).toContain(((19 - sofiPrice) / (sofiPrice - 8)).toFixed(2) + ':1')
    else expect(sofi.ratioNote).toContain('赔率不适用')
    expect(sofi.metrics.some(([k, v]) => k.startsWith('上轮') && v.includes('0.42:1'))).toBe(true)
    const { bear, base, bull } = evidence.scenarios
    expect(bear.price).toBeLessThan(evidence.priceAnchor.price)
    expect(evidence.priceAnchor.price).toBeLessThan(base.price)
    expect(base.price).toBeLessThan(bull.price)
    expect(evidence.derived.R).toBeCloseTo((base.price - 15.76) / (15.76 - bear.price), 10)
    expect(evidence.derived.Pstar).toBeCloseTo((base.price + 2 * bear.price) / 3, 10)
    expect(bear.p + base.p + bull.p).toBeCloseTo(1, 10)
    expect(evidence.inputs.ttmEps.value).toBeCloseTo(0.39 - 0.14 + 0.24, 10)
    for (const f of evidence.filings.slice(0, 2)) expect(f.url).toContain('www.sec.gov/Archives/edgar/data/1818874/')
    expect(sofi.researchReport).toBe('research/sofi-2026-10-07/SOFI.html')
    expect(existsSync(resolve('public', sofi.researchReport!))).toBe(true)
    const report = readFileSync(resolve('public/research/sofi-2026-10-07/SOFI.md'), 'utf8')
    expect([...report.matchAll(/^## \d+ ·/gm)]).toHaveLength(15)
    expect(report).toContain('单模型多视角复核')
    expect(report.trim()).toMatch(/本报告仅供研究参考，不构成个人投资建议。$/)
  })
})
