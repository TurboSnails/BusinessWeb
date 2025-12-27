import type { DailyReview, ImportantNews, NewsSource } from '../types'

// Storage Keys
const STORAGE_KEY_REVIEWS = 'pulse_daily_reviews'
const STORAGE_KEY_NEWS = 'pulse_important_news'
const STORAGE_KEY_NEWS_SOURCES = 'pulse_news_sources'
const STORAGE_KEY_GIST_TOKEN = 'pulse_gist_token'
const STORAGE_KEY_GIST_ID = 'pulse_gist_id'

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
  localStorage.setItem(STORAGE_KEY_REVIEWS, JSON.stringify(reviews.slice(0, 30)))
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
  ]
}

// Gist 配置存储
export const getGistToken = (): string | null => {
  return localStorage.getItem(STORAGE_KEY_GIST_TOKEN)
}

export const getGistId = (): string | null => {
  return localStorage.getItem(STORAGE_KEY_GIST_ID)
}

export const saveGistConfig = (token: string, gistId: string | null) => {
  localStorage.setItem(STORAGE_KEY_GIST_TOKEN, token)
  if (gistId) {
    localStorage.setItem(STORAGE_KEY_GIST_ID, gistId)
  }
}

