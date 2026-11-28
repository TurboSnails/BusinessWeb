import { describe, expect, it } from 'vitest'
import type { NewsItem } from '../types'
import {
  countByPublisher,
  countBySentiment,
  countByTopic,
  filterNews,
  newsInRange,
  toggleMulti,
} from './newsFilter'

const now = Date.parse('2026-11-28T12:00:00Z')

const items: NewsItem[] = [
  {
    id: '1', time: '2026-11-27T10:00:00Z', title: 'a', url: '#', publisher: 'Reuters',
    topic: '业绩财报', sentiment: '利好', lang: 'en',
  },
  {
    id: '2', time: '2026-11-20T10:00:00Z', title: 'b', url: '#', publisher: 'Bloomberg',
    topic: '机构评级', sentiment: '利好', lang: 'en',
  },
  {
    id: '3', time: '2026-10-01T10:00:00Z', title: 'c', url: '#', publisher: 'Reuters',
    topic: '监管法律', sentiment: '利空', lang: 'en',
  },
  {
    id: '4', time: '2026-11-25T10:00:00Z', title: 'd', url: '#', publisher: 'CNBC',
    topic: '市场情绪', sentiment: '中性', lang: 'en',
  },
]

describe('newsFilter', () => {
  it('时间范围裁剪', () => {
    expect(newsInRange(items, '7d', now).map(n => n.id)).toEqual(['1', '4'])
    expect(newsInRange(items, '30d', now).map(n => n.id)).toEqual(['1', '2', '4'])
    expect(newsInRange(items, 'all', now)).toHaveLength(4)
  })

  it('计数基于时间范围内全集', () => {
    const ranged = newsInRange(items, '30d', now)
    expect(countByTopic(ranged)['业绩财报']).toBe(1)
    expect(countBySentiment(ranged)['利好']).toBe(2)
    expect(countByPublisher(ranged).Reuters).toBe(1)
  })

  it('组合筛选：主题+情绪', () => {
    const out = filterNews(items, {
      range: 'all',
      topics: ['业绩财报', '机构评级'],
      sentiments: ['利好'],
      publishers: [],
      showSummary: false,
    }, now)
    expect(out.map(n => n.id)).toEqual(['1', '2'])
  })

  it('toggleMulti 多选', () => {
    expect(toggleMulti(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleMulti(['a', 'b'], 'a')).toEqual(['b'])
  })
})
