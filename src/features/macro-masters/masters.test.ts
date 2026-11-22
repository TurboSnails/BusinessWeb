import { describe, expect, it } from 'vitest'
import { MASTER_ARTICLES, renderMasterArticleMarkdown } from './articles'
import { MASTERS, masterBySlug } from './masters'
import type { ReadingKey } from './types'

const ORDER = ['druckenmiller', 'dalio', 'marks', 'tudor-jones', 'zweig', 'grantham', 'soros', 'templeton', 'kostolany'] as const
const READING_KEYS: readonly ReadingKey[] = [
  'fedAssets', 'netLiquidity', 'bankReserves', 'realRate', 'realYield10', 'tenYear', 'curve10y2y', 'nfci',
  'hySpread', 'baaAaa', 'spxAbove200', 'netNewHighs', 'advDecLine', 'mcclellan', 'spxVs200dma',
  'epsRevision', 'forwardPe', 'cape', 'vix', 'fearGreed', 'retailBullBear', 'naaim', 'marginDebtYoy',
  'managerCash', 'copperGold', 'copper',
]

function indicator(slug: string, name: string) {
  const value = masterBySlug(slug)?.indicators.find(item => item.name === name)
  expect(value).toBeDefined()
  return value!
}

describe('MASTERS', () => {
  it('按约定顺序收录九位大师且 slug 唯一', () => {
    expect(MASTERS.map(master => master.slug)).toEqual(ORDER)
    expect(new Set(MASTERS.map(master => master.slug)).size).toBe(9)
    expect(MASTERS.map(master => masterBySlug(master.slug)?.slug)).toEqual(ORDER)
    expect(masterBySlug('missing')).toBeUndefined()
    expect(masterBySlug(undefined)).toBeUndefined()
  })

  it('每位大师都有完整摘要、3–5 条核心思路和至少一项指标', () => {
    for (const master of MASTERS) {
      expect(master.name.trim()).not.toBe('')
      expect(master.nameEn.trim()).not.toBe('')
      expect(master.oneLiner.trim()).not.toBe('')
      expect(master.tags.length).toBeGreaterThan(0)
      expect(master.ideas.length).toBeGreaterThanOrEqual(3)
      expect(master.ideas.length).toBeLessThanOrEqual(5)
      expect(master.limits.trim()).not.toBe('')
      expect(['quant', 'qualitative']).toContain(master.kind)
      expect(master.indicators.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('读数键全部合法，近似读数说明口径差别且不与同口径读数重叠', () => {
    for (const master of MASTERS) {
      const indicatorNames = new Set<string>()
      for (const item of master.indicators) {
        expect(item.name.trim()).not.toBe('')
        expect(item.howToRead.trim()).not.toBe('')
        expect(indicatorNames.has(item.name)).toBe(false)
        indicatorNames.add(item.name)
        expect(['quote', 'paraphrase', 'unverified']).toContain(item.evidence)
        for (const key of [...(item.readings ?? []), ...(item.proxyReadings ?? [])]) expect(READING_KEYS).toContain(key)
        if (item.proxyReadings?.length) expect(item.proxyNote?.trim()).not.toBe('')
        for (const key of item.readings ?? []) expect(item.proxyReadings ?? []).not.toContain(key)
        if (!item.readings?.length && !item.proxyReadings?.length) expect(item.external?.trim()).not.toBe('')
      }
    }
  })

  it('保留审查要求的口径、证据等级和历史规则', () => {
    expect(indicator('druckenmiller', '美联储资产负债表（2021 年买债回顾）').readings).toEqual(['fedAssets'])
    expect(indicator('druckenmiller', '财政部现金账户（TGA）对冲缩表').proxyReadings).toEqual(['netLiquidity'])
    expect(indicator('tudor-jones', '10 年期实际收益率与历史均值').readings).toEqual(['realYield10'])
    expect(indicator('tudor-jones', '金融条件指数').proxyReadings).toEqual(['nfci'])
    expect(indicator('zweig', '优惠利率指标').howToRead).toContain('前一轮高点低于 8% 时，首次降息即买入')
    expect(indicator('zweig', '兹威格宽度推力').evidence).toBe('unverified')
    expect(indicator('zweig', '兹威格宽度推力').proxyReadings).toEqual(['advDecLine'])
    expect(indicator('grantham', 'Fortune 转述：CAPE 等历史估值极值').evidence).toBe('paraphrase')
    expect(indicator('grantham', 'GMO 7 年预测：二手方法说明').evidence).toBe('paraphrase')
    expect(indicator('soros', '仓位拥挤').readings).toBeUndefined()
    expect(indicator('soros', '仓位拥挤').proxyReadings).toBeUndefined()
    expect(masterBySlug('grantham')?.ideas[0]).toContain('在他统计的发达国家股市样本内')
    expect(indicator('kostolany', '本人比喻：主人是经济').howToRead).toContain('主人是经济发展')
    expect(indicator('kostolany', '本站配套：企业盈利预期').evidence).toBe('unverified')
  })

  it('九位大师都有对应的研究正文', () => {
    expect(Object.keys(MASTER_ARTICLES).sort()).toEqual([...ORDER].sort())
    for (const slug of ORDER) {
      expect(MASTER_ARTICLES[slug].length).toBeGreaterThan(1000)
      expect(MASTER_ARTICLES[slug]).toContain('可映射到本站数据的指标清单')
    }
  })
})

describe('研究文档链接', () => {
  it('相对链接按文章目录解析为 GitHub 绝对地址，不影响外部链接与锚点', () => {
    const { html } = renderMasterArticleMarkdown('zweig', [
      '[邻近文件](./notes.md)',
      '[上级目录](../shared/notes.md)',
      '[文章根路径](/appendix.md)',
      '[外部来源](https://example.com/research)',
      '[本节](#section)',
      '[不安全协议](javascript:alert(1))',
    ].join('\n\n'))

    expect(html).toContain('href="https://github.com/TurboSnails/BusinessWeb/blob/main/docs/research/macro-masters/zweig/notes.md"')
    expect(html).toContain('href="https://github.com/TurboSnails/BusinessWeb/blob/main/docs/research/macro-masters/shared/notes.md"')
    expect(html).toContain('href="https://github.com/TurboSnails/BusinessWeb/blob/main/docs/research/macro-masters/zweig/appendix.md"')
    expect(html).toContain('href="https://example.com/research" target="_blank" rel="noopener noreferrer"')
    expect(html).toContain('href="#section"')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('href="/BusinessWeb/')
  })
})
