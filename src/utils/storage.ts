import type { DailyReview, ImportantNews, NewsSource } from '../types'

// Storage Keys
const STORAGE_KEY_REVIEWS = 'pulse_daily_reviews'
const STORAGE_KEY_NEWS = 'pulse_important_news'
const STORAGE_KEY_NEWS_SOURCES = 'pulse_news_sources'
export const PULSE_SYNC_CONFIG_KEY = 'pulse_sync_config'
const STORAGE_KEY_TOMBSTONES = 'pulse_review_tombstones'
const STORAGE_KEY_REVIEWS_BACKUP = 'pulse_reviews_backup'

// 复盘数据存储
export const loadReviews = (): DailyReview[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_REVIEWS)
    return data ? JSON.parse(data) : []
  } catch { 
    return [] 
  }
}

export const saveReviews = (reviews: DailyReview[]) => {
  localStorage.setItem(STORAGE_KEY_REVIEWS, JSON.stringify(reviews.slice(0, 365)))
}

// 复盘删除墓碑：记录已删除的日期，云同步时用来传播删除、避免被云端旧数据“复活”
export type ReviewTombstone = { date: string; deleted: true; updatedAt: string }
export const loadTombstones = (): ReviewTombstone[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY_TOMBSTONES) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(t => t && t.deleted === true && typeof t.date === 'string' && typeof t.updatedAt === 'string') : []
  } catch {
    return []
  }
}
export const saveTombstones = (items: ReviewTombstone[]) => {
  localStorage.setItem(STORAGE_KEY_TOMBSTONES, JSON.stringify(items))
}
// 同步覆盖本地前保留一份上一版本（只保留最近一份）
export const backupReviews = (reviews: DailyReview[]) => {
  localStorage.setItem(STORAGE_KEY_REVIEWS_BACKUP, JSON.stringify({ savedAt: new Date().toISOString(), reviews }))
}

// 重要消息存储
export const loadNews = (): ImportantNews[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_NEWS)
    return data ? JSON.parse(data) : []
  } catch { 
    return [] 
  }
}

export const saveNews = (news: ImportantNews[]) => {
  localStorage.setItem(STORAGE_KEY_NEWS, JSON.stringify(news.slice(0, 200)))
}

// 消息源存储
export const loadNewsSources = (): NewsSource[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_NEWS_SOURCES)
    if (data) {
      return JSON.parse(data)
    }
    // 默认消息源列表
    return getDefaultNewsSources()
  } catch { 
    return getDefaultNewsSources()
  }
}

export const saveNewsSources = (sources: NewsSource[]) => {
  localStorage.setItem(STORAGE_KEY_NEWS_SOURCES, JSON.stringify(sources))
}

const getDefaultNewsSources = (): NewsSource[] => {
  return [
    { id: '1', name: '美联储官网', url: 'https://www.federalreserve.gov/', category: 'official', priority: 'high', description: 'FOMC 利率决议、货币政策', icon: '🏦', enabled: true },
    { id: '2', name: '劳工统计局', url: 'https://www.bls.gov/', category: 'official', priority: 'high', description: '非农就业、失业率数据', icon: '📊', enabled: true },
    { id: '3', name: 'Bloomberg', url: 'https://www.bloomberg.com/', category: 'news', priority: 'high', description: '全球财经新闻', icon: '📰', enabled: true },
    { id: '4', name: 'Reuters', url: 'https://www.reuters.com/', category: 'news', priority: 'high', description: '路透社财经新闻', icon: '📰', enabled: true },
    { id: '5', name: 'WSJ', url: 'https://www.wsj.com/', category: 'news', priority: 'high', description: '华尔街日报', icon: '📰', enabled: true },
    { id: '6', name: 'CNBC', url: 'https://www.cnbc.com/', category: 'news', priority: 'medium', description: 'CNBC 财经新闻', icon: '📺', enabled: true },
    { id: '7', name: 'Investing.com', url: 'https://www.investing.com/economic-calendar/', category: 'data', priority: 'high', description: '经济数据日历', icon: '📅', enabled: true },
    { id: '8', name: 'CBOE 市场统计', url: 'https://www.cboe.com/us/options/market_statistics/daily/', category: 'data', priority: 'medium', description: '期权市场统计数据', icon: '📈', enabled: true },
    { id: '9', name: 'CNN 恐慌贪婪指数', url: 'https://www.cnn.com/markets/fear-and-greed', category: 'data', priority: 'medium', description: '市场情绪指标', icon: '😱', enabled: true },
    { id: '10', name: '财联社', url: 'https://www.cls.cn/', category: 'news', priority: 'medium', description: '中国财经新闻', icon: '📰', enabled: true },
    { id: '11', name: '东方财富', url: 'https://www.eastmoney.com/', category: 'news', priority: 'low', description: '中国股市资讯', icon: '📊', enabled: true },
    { id: '12', name: '涨停揭秘', url: 'https://www.eastmoney.com/', category: 'data', priority: 'medium', description: '涨停板分析工具', icon: '📈', enabled: true },
    { id: '13', name: '选股通', url: 'https://www.eastmoney.com/', category: 'data', priority: 'medium', description: '股票筛选工具', icon: '🔍', enabled: true },
    { id: '14', name: '每日板块涨停', url: 'https://api3.cls.cn/share/quote/analysis?os=ios&sv=8.6.9', category: 'data', priority: 'medium', description: '每日板块涨停分析', icon: '📈', enabled: true },
  ]
}
