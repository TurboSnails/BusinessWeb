import type { DailyReview } from '../types'
import { getGistToken, getGistId, saveGistConfig } from './storage'

// 默认公共 Gist ID（用于未配置时的默认数据源）
const DEFAULT_PUBLIC_GIST_ID = 'f22173a0e70dd8e8c924335bba14c286'

// 同步到公共 Gist（只有 Gist 所有者可以修改）
async function syncToPublicGist(
  reviews: DailyReview[],
  token: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = {
      reviews,
      syncDate: new Date().toISOString(),
      version: '1.0'
    }
    const content = JSON.stringify(data, null, 2)
    
    const response = await fetch(`https://api.github.com/gists/${DEFAULT_PUBLIC_GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': token.startsWith('ghp_') ? `token ${token}` : `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: '经济脉搏 - 每日复盘数据',
        files: {
          'public-pulse-data.json': {
            content
          }
        }
      })
    })
    
    if (response.ok) {
      console.log('Synced to public Gist:', {
        gistId: DEFAULT_PUBLIC_GIST_ID,
        reviews: reviews.length
      })
      return { success: true }
    } else {
      // 如果没有权限（403），说明不是 Gist 所有者，这是正常的
      if (response.status === 403) {
        console.log('No permission to update public Gist (not the owner), skipping')
        return { success: false, error: '无权限修改公共 Gist（非所有者）' }
      }
      const errorData = await response.json().catch(() => ({ message: response.statusText }))
      console.error('Public Gist sync failed:', response.status, errorData)
      return { success: false, error: errorData.message || `HTTP ${response.status}` }
    }
  } catch (error: any) {
    console.error('Public Gist sync error:', error)
    return { success: false, error: error.message || '网络错误' }
  }
}

// 同步到 Gist
export const syncToGist = async (
  reviews: DailyReview[]
): Promise<{ success: boolean; error?: string; publicSync?: boolean }> => {
  const token = getGistToken()
  if (!token) {
    return { success: false, error: '未配置 Token' }
  }
  
  try {
    const data = {
      reviews,
      syncDate: new Date().toISOString(),
      version: '1.0'
    }
    const content = JSON.stringify(data, null, 2)
    
    const gistId = getGistId()
    const url = gistId 
      ? `https://api.github.com/gists/${gistId}`  // 更新现有
      : 'https://api.github.com/gists'            // 创建新
    
    // 先同步到用户自己的 Gist
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
      
      console.log('Uploaded to user Gist:', {
        gistId: newGistId || gistId,
        reviews: reviews.length
      })
      
      // 同时尝试同步到公共 Gist（只有 Gist 所有者才能成功）
      const publicSyncResult = await syncToPublicGist(reviews, token)
      const publicSyncSuccess = publicSyncResult.success
      
      return { 
        success: true,
        publicSync: publicSyncSuccess
      }
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
export const syncFromGist = async (): Promise<{ reviews: DailyReview[] } | null> => {
  const token = getGistToken()
  const gistId = getGistId()
  
  // 如果用户手动设置了 gistId，使用用户配置的（需要 token）
  if (gistId && token) {
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
          console.log('Downloaded from user Gist:', {
            gistId,
            reviews: data.reviews?.length || 0
          })
          return {
            reviews: data.reviews || []
          }
        } else {
          console.warn('User Gist file not found')
          return null
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: response.statusText }))
        console.error('User Gist fetch failed:', response.status, errorData)
        // 如果用户 Gist 失败，尝试使用默认公共 Gist
        return await fetchDefaultPublicGist()
      }
    } catch (error: any) {
      console.error('User Gist fetch error:', error)
      // 如果用户 Gist 失败，尝试使用默认公共 Gist
      return await fetchDefaultPublicGist()
    }
  }
  
  // 如果没有手动设置，使用默认的公共 Gist（不需要 token）
  if (!gistId) {
    console.log('No user Gist configured, using default public Gist')
    return await fetchDefaultPublicGist()
  }
  
  return null
}

// 从默认公共 Gist 获取数据
async function fetchDefaultPublicGist(): Promise<{ reviews: DailyReview[] } | null> {
  try {
    const response = await fetch(`https://api.github.com/gists/${DEFAULT_PUBLIC_GIST_ID}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    })
    
    if (response.ok) {
      const gist = await response.json()
      // 公共 Gist 的文件名是 public-pulse-data.json
      const file = gist.files['public-pulse-data.json'] || gist.files['pulse-data.json']
      if (file) {
        const data = JSON.parse(file.content)
        console.log('Downloaded from default public Gist:', {
          gistId: DEFAULT_PUBLIC_GIST_ID,
          reviews: data.reviews?.length || 0
        })
        return {
          reviews: data.reviews || []
        }
      } else {
        console.warn('Default public Gist file not found')
        return null
      }
    } else {
      const errorData = await response.json().catch(() => ({ message: response.statusText }))
      console.error('Default public Gist fetch failed:', response.status, errorData)
      return null
    }
  } catch (error: any) {
    console.error('Default public Gist fetch error:', error)
    return null
  }
}

