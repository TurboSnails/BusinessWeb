import type { DailyReview, ImportantNews } from '../types'
import { getGistToken, getGistId, saveGistConfig } from './storage'

// 同步到 Gist
export const syncToGist = async (
  reviews: DailyReview[], 
  news: ImportantNews[]
): Promise<{ success: boolean; error?: string }> => {
  const token = getGistToken()
  if (!token) {
    return { success: false, error: '未配置 Token' }
  }
  
  try {
    const data = {
      reviews,
      news,
      syncDate: new Date().toISOString(),
      version: '1.0'
    }
    const content = JSON.stringify(data, null, 2)
    
    const gistId = getGistId()
    const url = gistId 
      ? `https://api.github.com/gists/${gistId}`  // 更新现有
      : 'https://api.github.com/gists'            // 创建新
    
    const response = await fetch(url, {
      method: gistId ? 'PATCH' : 'POST',
      headers: {
        'Authorization': token.startsWith('ghp_') ? `token ${token}` : `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: '经济脉搏 - 每日复盘数据',
        public: false,
        files: {
          'pulse-data.json': {
            content
          }
        }
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      const newGistId = result.id
      
      // 保存或更新 gistId
      if (newGistId) {
        if (!gistId) {
          // 首次创建，保存 gistId
          saveGistConfig(token, newGistId)
          console.log('Created new Gist:', newGistId)
        } else if (newGistId !== gistId) {
          // gistId 变化了（不应该发生，但保险起见）
          saveGistConfig(token, newGistId)
          console.log('Gist ID updated:', newGistId)
        }
      }
      
      console.log('Uploaded to Gist:', {
        gistId: newGistId || gistId,
        reviews: reviews.length,
        news: news.length
      })
      
      return { success: true }
    } else {
      const errorData = await response.json().catch(() => ({ message: response.statusText }))
      console.error('Upload failed:', response.status, errorData)
      return { success: false, error: errorData.message || `HTTP ${response.status}` }
    }
  } catch (error: any) {
    console.error('Gist sync failed:', error)
    return { success: false, error: error.message || '网络错误' }
  }
}

// 从 Gist 同步
export const syncFromGist = async (): Promise<{ reviews: DailyReview[], news: ImportantNews[] } | null> => {
  const token = getGistToken()
  const gistId = getGistId()
  
  if (!token) {
    console.warn('No token configured')
    return null
  }
  if (!gistId) {
    console.warn('No gistId found, need to upload first')
    return null
  }
  
  try {
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'Authorization': token.startsWith('ghp_') ? `token ${token}` : `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    })
    
    if (response.ok) {
      const gist = await response.json()
      const file = gist.files['pulse-data.json']
      if (file) {
        const data = JSON.parse(file.content)
        console.log('Downloaded from Gist:', {
          reviews: data.reviews?.length || 0,
          news: data.news?.length || 0
        })
        return {
          reviews: data.reviews || [],
          news: data.news || []
        }
      } else {
        console.warn('Gist file not found')
        return null
      }
    } else {
      const errorData = await response.json().catch(() => ({ message: response.statusText }))
      console.error('Gist fetch failed:', response.status, errorData)
      return null
    }
  } catch (error: any) {
    console.error('Gist fetch error:', error)
    return null
  }
}

