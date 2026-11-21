import type { ResearchSource } from '../../data/futureTrendsResearch'

const quotePath = /^\/research\/data-refresh-(\d{4}-\d{2}-\d{2})\/(?:tencent-quotes|yahoo-quote-batch)\.json$/

export function researchSources(sources: ResearchSource[], hasQuoteFile: (url: string) => boolean, base: string) {
  const records = sources.map(source => {
    const date = quotePath.exec(source.url)?.[1]
    const retained = !date || hasQuoteFile(source.url)
    const local = source.url.startsWith('/') && !source.url.startsWith('//')
    return {
      ...source,
      date,
      label: date ? date + ' 行情档案' : source.title,
      href: retained && source.url ? (local ? base + source.url.slice(1) : source.url) : null,
    }
  })
  const research = records.filter(r => !r.date)
  const quotes = records.filter(r => r.date).sort((a, b) => b.url.localeCompare(a.url))
  const latest = quotes.find(r => r.href)
  return { research, latest, history: quotes.filter(r => r !== latest) }
}

export type SourceRecord = ReturnType<typeof researchSources>['research'][number]
