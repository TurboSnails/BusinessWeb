import type { DailyReview, ImportantNews } from '../types'

// Storage Keys
const STORAGE_KEY_REVIEWS = 'pulse_daily_reviews'
const STORAGE_KEY_NEWS = 'pulse_important_news'
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

