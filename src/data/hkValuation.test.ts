import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import previous from '../../public/research/hk-2026-10-07/previous.json'
import { hkValuationDetails } from './details/hkValuation'
import { parseDetails } from './detailParser'

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const valuation = read('public/research/hk-valuation-2026-10-20/audit.json')
const input = read('public/research/hk-2026-10-07/input.json')
const models = read('public/research/hk-2026-10-07/models.json')
const reviewed = read('public/research/hk-2026-10-07/audit.json').companies
const quotes = read('public/research/data-refresh-2026-10-20/yahoo-quote-batch.json').quotes
const snapshot = read('src/data/companyMarketSnapshot.json')

const priceOf = (text?: string) => {
  if (!text || text.includes('[MISSING]')) return null
  const match = text.match(/HK\$([\d,.]+)/)
  return match ? Number(match[1].replace(/,/g, '')) : null
}

describe('HK 2026-10-20 valuation overlay', () => {
  it('covers all 127 prior-review companies and ratings follow the stated rules', () => {
    const actual = parseDetails(hkValuationDetails)
    const expected = (previous as { companies: Array<{ code: string }> }).companies
      .map(({ code }) => `hk:${code}`)
    expect(Object.keys(actual).sort()).toEqual(expected.sort())
    expect(expected).toHaveLength(127)

    for (const key of expected) {
      const item = actual[key]
      expect(item?.rating, key).toBeTruthy()
      expect(item?.scenarios, key).toHaveLength(3)
      expect(item?.headline, key).toContain('估值初稿（未认证）')
      expect(item?.headline, key).toContain('不构成买卖建议') // 覆盖层的结论是用户直接看到的内容，须自带免责声明
      const scenarios = item!.scenarios!
      expect(scenarios.map(({ name }) => name), key).toEqual(['悲观', '基准', '乐观'])
      expect(scenarios.every(({ prob }) => prob?.includes('[MISSING]')), key).toBe(true)
      const cap = item?.discipline?.invalid ?? ''
      const current = priceOf(item?.ratioNote)
      const bear = priceOf(scenarios[0].price)
      const base = priceOf(scenarios[1].price)
      const numeric = current !== null && bear !== null && base !== null && current > bear
      const ratio = numeric ? (base! - current!) / (current! - bear!) : null
      const displayedRatio = item?.ratioNote?.match(/=(-?[\d.]+):1/)
      if (ratio !== null) expect(Number(displayedRatio?.[1]), key).toBe(Number(ratio.toFixed(2)))
      else expect(item?.ratioNote, key).toContain('[MISSING]')

      let expectedRating: string
      if (cap.includes('TTM EPS为负') && !cap.includes('与10-07复核评级冲突')) expectedRating = '回避'
      else if (cap.includes('复核回避')) expectedRating = '回避'
      else if (!numeric || ratio === null || bear! >= current! || ratio > 8
        || cap.includes('经营现金流为负') || cap.includes('周期行业')) expectedRating = '观察'
      else if (ratio >= 2) expectedRating = '条件关注' // one valuation method caps priority
      else if (ratio >= 1) expectedRating = '条件关注'
      else expectedRating = '观察'
      expect(item?.rating, `${key}: ${item?.ratioNote}; ${cap}`).toBe(expectedRating)
    }
  })

  it('explicitly assigns every frozen sector to a PE band without a fallback', () => {
    const script = readFileSync('scripts/review-hk-valuation-2026-10-20.py', 'utf8')
    const mapping = script.split('SECTOR_BANDS = {')[1].split('\n}')[0]
    const entries = [...mapping.matchAll(/'([^']+)': \((\d+),(\d+),(\d+)\)/g)]
    const explicit = Object.fromEntries(entries.map(m => [m[1], m.slice(2).map(Number)]))
    const sectors = [...new Set(previous.companies.map(c => c.sector))].sort()
    expect(Object.keys(explicit).sort()).toEqual(sectors)
    expect(valuation.sectorBands).toEqual(explicit)
    const buckets: Array<[string[], number[]]> = [
      [['综合企业', '公用事业', '电讯'], [8, 10, 12]],
      [['专业零售', '消费者主要零售商', '食物饮品', '家庭电器及用品', '旅游及消闲设施', '纺织及服饰'], [10, 13, 16]],
      [['资讯科技器材', '软件服务', '半导体', '药品及生物科技', '医疗保健'], [12, 16, 20]],
      [['地产', '银行', '汽车', '保险', '建筑', '其他金融', '媒体及娱乐', '工用运输', '石油及天然气', '煤炭', '一般金属及矿石', '工业工程', '工用支援', '黄金及贵金属', '房地产投资信托'], [8, 11, 14]],
    ]
    for (const [names, band] of buckets) for (const sector of names) expect(explicit[sector], sector).toEqual(band)
    expect(script).toContain("assert {c['sector'] for c in companies} <= SECTOR_BANDS.keys()")
    expect(valuation.cyclicalSectors).toEqual(['一般金属及矿石', '汽车', '煤炭', '石油及天然气', '黄金及贵金属'])
    for (const row of valuation.companies) {
      expect(row.sectorBand, row.code).toEqual(explicit[row.sector])
      if (row.calculation.multiples) {
        expect(row.calculation.multiples, row.code).toEqual(explicit[row.sector])
        const eps = row.forwardEps * row.calculation.fx
        const prices = explicit[row.sector].map((pe, i) => Number((eps * [0.8, 1, 1.15][i] * pe + 1e-10).toFixed(2)))
        expect(row.scenarios.map((s: { price: number }) => s.price), row.code).toEqual(prices)
      }
    }
  })

  it('recomputes the 13 financial dividend cases, preserves existing models and derives ratings from inputs', () => {
    const actual = parseDetails(hkValuationDetails)
    const dividendCodes = ['00005', '00388', '01299', '01336', '02318', '02378', '02388', '02601', '02628', '03908', '06030', '06060', '06881']
    expect(valuation.companies.filter((r: { calculation: { method?: string } }) => r.calculation.method === 'div').map((r: { code: string }) => r.code)).toEqual(dividendCodes)
    let dividendPriced = 0
    for (const row of valuation.companies) {
      const code = row.code
      const item = actual[`hk:${code}`]
      const p = snapshot[`hk:${code}`].price
      expect(row.price, code).toBe(p)
      const q = input.quotes[code.slice(1) + '.HK']
        ?? Object.values(input.quotes).find((q: any) => q.symbol === code.slice(1) + '.HK') as any
      expect(q, code).toBeTruthy()
      const review = reviewed.find((r: { code: string }) => r.code === code)
      const finance = ['银行', '保险', '其他金融'].includes(row.sector)
      if (dividendCodes.includes(code)) {
        const dq = quotes[code.slice(1) + '.HK']
        const dps = dq.dividendRate
        const dy = dq.dividendYield
        const missing = !dps || !dy || dq.currency !== 'HKD' || dy < 3 || dy > 8
          || Math.abs(dps / dq.regularMarketPrice * 100 / dy - 1) > 0.05
          || Math.abs(dps / p * 100 / dy - 1) > 0.05
        expect(row.calculation.currency, code).toBe(dq.currency)
        expect(row.calculation.financialCurrency, code).toBe(dq.financialCurrency)
        expect(row.calculation.dividendRate, code).toBe(dps ?? null)
        if (missing) {
          expect(row.scenarios, code).toHaveLength(0)
          expect(row.missing, code).toMatch(/股息率|币种/)
          for (const scenario of item.scenarios!) expect(scenario.price, code).toContain('[MISSING]')
        } else {
          dividendPriced++
          expect(row.calculation.fx, code).toBe(1) // dividendRate is HKD even when financialCurrency is USD/CNY
          const prices = [0.8, 1, 1.05].map((factor, i) => Number((dps * factor / ([7, 5, 4][i] / 100) + 1e-10).toFixed(2)))
          expect(row.scenarios.map((s: { price: number }) => s.price), code).toEqual(prices)
          expect(item.scenarios!.map(s => priceOf(s.price)), code).toEqual(prices)
          for (const scenario of item.scenarios!) expect(scenario.assumption, code).toContain('特别股息未经公司公告核验')
        }
        expect(row.method, code).toContain('单一方法')
      }
      if (models[code]?.numericDraft) {
        expect(row.calculation.model, code).toEqual(models[code])
        expect(row.scenarios.map((s: { price: number }) => s.price), code)
          .toEqual(['bear', 'base', 'bull'].map(k => Number(models[code][k].toFixed(2))))
      }
      const prices = item.scenarios!.map(s => priceOf(s.price))
      const [bear, base] = prices
      const ratio = bear !== null && base !== null && p > bear ? (base - p) / (p - bear) : null
      const loss = q?.trailingEps < 0
      const disputed = loss && review.rating === '观察'
      const cyclical = ['资源','煤炭','石油','油气','航运','钢铁','化工','地产开发','有色','铝业','金属','矿业','造纸','水泥','建材','航空','汽车','周期'].some(k => row.sector.includes(k))
      let rating = '观察'
      if (review.rating === '等待证据' || (loss && !disputed)) rating = '回避'
      else if (ratio !== null && ratio >= 1 && ratio <= 8 && !disputed && !cyclical && (finance || !(q?.operatingCashflow < 0))) rating = '条件关注'
      expect(item.rating, code).toBe(rating)
      expect(row.rating, code).toBe(rating)
      if (finance) expect(row.capReason, code).not.toContain('operatingCashflow为负')
    }
    expect(dividendPriced).toBe(9)
    expect(valuation.companies.filter((r: { rating: string }) => r.rating === '回避').map((r: { code: string }) => r.code))
      .toEqual(['01958', '02015', '02238', '09866', '09868'])
  })

})
