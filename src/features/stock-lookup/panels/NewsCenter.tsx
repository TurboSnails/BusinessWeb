import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '../../../components/ui'
import { NEWS_TOPICS, type NewsItem, type NewsSentiment, type NewsTopic, type StockLookupApi } from '../types'
import { BlockEmpty, BlockError, BlockLoading } from './BlockState'
import {
  countByPublisher,
  countBySentiment,
  countByTopic,
  DEFAULT_NEWS_FILTER,
  filterNews,
  groupNewsByDay,
  toggleMulti,
  type NewsFilterState,
  type NewsRange,
} from './newsFilter'
import { fmtNewsTime } from './format'

const SENTIMENTS: NewsSentiment[] = ['利好', '中性', '利空', '未评级']
const RANGES: { id: NewsRange; label: string }[] = [
  { id: '7d', label: '近 7 天' },
  { id: '30d', label: '近 30 天' },
  { id: 'all', label: '全部已取到的' },
]

export function NewsCenter({
  symbol,
  api,
  timezone,
  highlightId,
  onItems,
}: {
  symbol: string
  api: StockLookupApi
  timezone: string
  highlightId?: string | null
  onItems?: (items: NewsItem[]) => void
}): JSX.Element {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [filter, setFilter] = useState<NewsFilterState>(DEFAULT_NEWS_FILTER)
  const [retry, setRetry] = useState(0)
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map())
  const onItemsRef = useRef(onItems)
  onItemsRef.current = onItems

  useEffect(() => {
    setFilter(DEFAULT_NEWS_FILTER)
  }, [symbol])

  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    void api.news(symbol, undefined, ac.signal).then(
      page => {
        if (cancelled) return
        setItems(page.items)
        onItemsRef.current?.(page.items)
        setLoading(false)
      },
      err => {
        if (cancelled || ac.signal.aborted) return
        setItems([])
        onItemsRef.current?.([])
        setError(err)
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [symbol, api, retry])

  useEffect(() => {
    if (!highlightId) return
    const el = itemRefs.current.get(highlightId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightId, items, filter])

  const ranged = useMemo(
    () => filterNews(items, { ...DEFAULT_NEWS_FILTER, range: filter.range }),
    [items, filter.range],
  )
  const topicCounts = useMemo(() => countByTopic(ranged), [ranged])
  const sentimentCounts = useMemo(() => countBySentiment(ranged), [ranged])
  const publisherCounts = useMemo(() => countByPublisher(ranged), [ranged])
  const publishers = useMemo(() => Object.keys(publisherCounts).sort((a, b) => (publisherCounts[b] ?? 0) - (publisherCounts[a] ?? 0)), [publisherCounts])

  const filtered = useMemo(() => filterNews(items, filter), [items, filter])
  const groups = useMemo(() => groupNewsByDay(filtered, timezone), [filtered, timezone])

  return (
    <Card as="section" title="新闻中心" className="sl-news" description="主题与情绪按关键词粗判，可能有误；英文新闻未翻译。">
      {loading ? <BlockLoading label="新闻" /> : null}
      {!loading && error ? <BlockError error={error} onRetry={() => setRetry(n => n + 1)} /> : null}
      {!loading && !error ? (
        <>
          <div className="sl-news__toolbar">
            <div className="sl-news__ranges" role="group" aria-label="时间范围">
              {RANGES.map(r => (
                <button
                  key={r.id}
                  type="button"
                  className={`ui-chip${filter.range === r.id ? ' is-active' : ''}`}
                  aria-pressed={filter.range === r.id}
                  onClick={() => setFilter(f => ({ ...f, range: r.id }))}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <label className="sl-news__summary">
              <input
                type="checkbox"
                checked={filter.showSummary}
                onChange={e => setFilter(f => ({ ...f, showSummary: e.target.checked }))}
              />
              显示摘要
            </label>
          </div>

          <FilterRow
            label="主题"
            allLabel="全部"
            selected={filter.topics}
            options={NEWS_TOPICS.filter(t => (topicCounts[t] ?? 0) > 0 || filter.topics.includes(t))}
            counts={topicCounts}
            total={ranged.length}
            onClear={() => setFilter(f => ({ ...f, topics: [] }))}
            onToggle={v => setFilter(f => ({ ...f, topics: toggleMulti(f.topics, v as NewsTopic) }))}
          />
          <FilterRow
            label="情绪"
            allLabel="全部"
            selected={filter.sentiments}
            options={SENTIMENTS.filter(s => (sentimentCounts[s] ?? 0) > 0 || filter.sentiments.includes(s))}
            counts={sentimentCounts}
            total={ranged.length}
            onClear={() => setFilter(f => ({ ...f, sentiments: [] }))}
            onToggle={v => setFilter(f => ({ ...f, sentiments: toggleMulti(f.sentiments, v as NewsSentiment) }))}
          />
          <FilterRow
            label="来源"
            allLabel="全部"
            selected={filter.publishers}
            options={publishers}
            counts={publisherCounts}
            total={ranged.length}
            onClear={() => setFilter(f => ({ ...f, publishers: [] }))}
            onToggle={v => setFilter(f => ({ ...f, publishers: toggleMulti(f.publishers, v) }))}
          />

          {items.length === 0 ? (
            <BlockEmpty title="暂时没有取到这只股票的新闻">
              <p>新闻来源偶尔会限流或返回空结果，稍后可以重试。</p>
              <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setRetry(n => n + 1)}>重试</button>
            </BlockEmpty>
          ) : filtered.length === 0 ? (
            <BlockEmpty title="没有符合筛选的新闻" />
          ) : (
            <div className="sl-news__list">
              {groups.map(g => (
                <section key={g.dayKey} className="sl-news__day">
                  <h3 className="sl-news__day-title">{g.label}</h3>
                  <ul>
                    {g.items.map(n => (
                      <li
                        key={n.id}
                        ref={el => {
                          if (el) itemRefs.current.set(n.id, el)
                          else itemRefs.current.delete(n.id)
                        }}
                        className={`sl-news__item${highlightId === n.id ? ' is-highlight' : ''}`}
                        data-news-id={n.id}
                      >
                        <div className="sl-news__meta">
                          <span className={`sl-news__sent sl-news__sent--${sentClass(n.sentiment)}`}>{n.sentiment}</span>
                          <span className="sl-muted">{fmtNewsTime(n.time, timezone)}</span>
                          <span className="sl-muted">{n.publisher}</span>
                          <span className="sl-muted">{n.topic}</span>
                        </div>
                        <a className="sl-news__title" href={n.url} target="_blank" rel="noopener noreferrer">
                          {n.title}
                        </a>
                        {filter.showSummary && n.summary ? <p className="sl-news__summary-text">{n.summary}</p> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      ) : null}
    </Card>
  )
}

function sentClass(s: NewsSentiment): string {
  if (s === '利好') return 'up'
  if (s === '利空') return 'down'
  if (s === '中性') return 'flat'
  return 'na'
}

function FilterRow({
  label,
  allLabel,
  selected,
  options,
  counts,
  total,
  onClear,
  onToggle,
}: {
  label: string
  allLabel: string
  selected: string[]
  options: readonly string[]
  counts: Record<string, number>
  total: number
  onClear: () => void
  onToggle: (v: string) => void
}): JSX.Element {
  const allActive = selected.length === 0
  return (
    <div className="sl-news__filters" role="group" aria-label={label}>
      <span className="sl-news__filter-label">{label}</span>
      <div className="sl-news__chips">
        <button
          type="button"
          className={`ui-chip${allActive ? ' is-active' : ''}`}
          aria-pressed={allActive}
          onClick={onClear}
        >
          {allLabel}
          <span className="ui-chip__count">（{total}）</span>
        </button>
        {options.map(opt => {
          const active = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              className={`ui-chip${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => onToggle(opt)}
            >
              {opt}
              <span className="ui-chip__count">（{counts[opt] ?? 0}）</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
