import { expect, it } from 'vitest'
import { researchSources } from './researchSources'

it('按实际发布的文件区分行情链接与未留存记录，并保留研究原件', () => {
  const retained = '/research/data-refresh-2026-10-20/tencent-quotes.json'
  const archived = '/research/data-refresh-2026-11-05/yahoo-quote-batch.json'
  const external = 'https://example.org' + archived
  const urls = [archived, retained, external, '/research/report.md', '//cdn.example.org/report.pdf', '']
  const records = urls.map(url => ({ url, title: '报告来源', status: '原始核验记录' }))
  const sources = researchSources(records, url => url === retained, '/BusinessWeb/')
  expect(sources.latest?.href).toBe('/BusinessWeb' + retained)
  expect(sources.history).toMatchObject([{ href: null, url: archived, status: '原始核验记录' }])
  expect(sources.research.map(s => s.href)).toEqual([external, '/BusinessWeb/research/report.md', '//cdn.example.org/report.pdf', null])
})
