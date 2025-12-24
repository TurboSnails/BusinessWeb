import React, { useEffect, useState } from 'react'
import { fetchMarketDataByType } from '../services/api'
import type { StockQuote } from '../types'

// 复盘数据类型
type DailyReview = {
  date: string           // 日期 YYYY-MM-DD
  weekday: string        // 周几
  ztCount: number        // 涨停板数
  ztSealRate: string     // 涨停封板率
  ztOpen: number         // 涨停打开数
  dtCount: number        // 跌停板数
  dtSealRate: string     // 跌停封板率
  dtOpen: number         // 跌停打开数
  volume: number         // 量能（亿）
  upDown: string         // 涨-跌
  shszcy: string         // 沪深创
  lbRate: string         // 连板晋级率
  lbCount: number        // 连板数量
  maxBoard: number       // 最高板
  top5Amount: number     // 成交金额前五
  top5Turnover: number   // 换手率前五
  inflow: string         // 流入板块
  outflow: string        // 流出板块
}

// 重要消息类型
type ImportantNews = {
  id: string
  date: string           // 日期 YYYY-MM-DD
  title: string          // 消息标题
  impact: 'high' | 'medium' | 'low'  // 影响程度
  category: string       // 分类：美联储/经济数据/地缘政治/财报/其他
  source?: string        // 来源
  link?: string          // 链接
  notes?: string         // 备注
}

type MarketCategory = {
  key: string
  title: string
  icon: string
  color: string
  bgColor: string
  data: StockQuote[]
}

// localStorage 操作
const STORAGE_KEY_REVIEWS = 'pulse_daily_reviews'
const STORAGE_KEY_NEWS = 'pulse_important_news'
const STORAGE_KEY_GIST_TOKEN = 'pulse_gist_token'
const STORAGE_KEY_GIST_ID = 'pulse_gist_id'

const loadReviews = (): DailyReview[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_REVIEWS)
    return data ? JSON.parse(data) : []
  } catch { return [] }
}
const saveReviews = (reviews: DailyReview[]) => {
  localStorage.setItem(STORAGE_KEY_REVIEWS, JSON.stringify(reviews.slice(0, 30)))
}
const loadNews = (): ImportantNews[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_NEWS)
    return data ? JSON.parse(data) : []
  } catch { return [] }
}
const saveNews = (news: ImportantNews[]) => {
  localStorage.setItem(STORAGE_KEY_NEWS, JSON.stringify(news.slice(0, 200)))
}

// GitHub Gist 同步
const getGistToken = (): string | null => {
  return localStorage.getItem(STORAGE_KEY_GIST_TOKEN)
}
const getGistId = (): string | null => {
  return localStorage.getItem(STORAGE_KEY_GIST_ID)
}
const saveGistConfig = (token: string, gistId: string | null) => {
  localStorage.setItem(STORAGE_KEY_GIST_TOKEN, token)
  if (gistId) localStorage.setItem(STORAGE_KEY_GIST_ID, gistId)
}

// 同步到 Gist
const syncToGist = async (reviews: DailyReview[], news: ImportantNews[]): Promise<{ success: boolean; error?: string }> => {
  const token = getGistToken()
  if (!token) return { success: false, error: '未配置 Token' }
  
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
      if (!gistId && result.id) {
        saveGistConfig(token, result.id)
      }
      return { success: true }
    } else {
      const errorData = await response.json().catch(() => ({ message: response.statusText }))
      return { success: false, error: errorData.message || `HTTP ${response.status}` }
    }
  } catch (error: any) {
    console.error('Gist sync failed:', error)
    return { success: false, error: error.message || '网络错误' }
  }
}

// 从 Gist 同步
const syncFromGist = async (): Promise<{ reviews: DailyReview[], news: ImportantNews[] } | null> => {
  const token = getGistToken()
  const gistId = getGistId()
  if (!token || !gistId) return null
  
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
        return {
          reviews: data.reviews || [],
          news: data.news || []
        }
      }
    }
    return null
  } catch (error) {
    console.error('Gist fetch failed:', error)
    return null
  }
}

// 获取周几
const getWeekday = (dateStr: string) => {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return days[new Date(dateStr).getDay()]
}

export default function Pulse(): JSX.Element {
  const [categories, setCategories] = useState<MarketCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [timestamp, setTimestamp] = useState<string>('')
  
  // 复盘表格状态
  const [reviews, setReviews] = useState<DailyReview[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editDate, setEditDate] = useState<string>('')
  const [formData, setFormData] = useState<Partial<DailyReview>>({})
  
  // 重要消息状态
  const [newsList, setNewsList] = useState<ImportantNews[]>([])
  const [showNewsForm, setShowNewsForm] = useState(false)
  const [newsFormData, setNewsFormData] = useState<Partial<ImportantNews>>({})
  
  // 云端同步状态
  const [showSettings, setShowSettings] = useState(false)
  const [gistTokenInput, setGistTokenInput] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    // 加载本地数据
    setReviews(loadReviews())
    setNewsList(loadNews())
    setGistTokenInput(getGistToken() || '')
    
    // 尝试从云端同步
    const loadFromCloud = async () => {
      const cloudData = await syncFromGist()
      if (cloudData) {
        // 合并数据：云端优先
        if (cloudData.reviews.length > 0) {
          setReviews(cloudData.reviews)
          saveReviews(cloudData.reviews)
        }
        if (cloudData.news.length > 0) {
          setNewsList(cloudData.news)
          saveNews(cloudData.news)
        }
      }
    }
    loadFromCloud()
    
    let mounted = true
    const fetchAllData = async () => {
      setLoading(true)
      const categoryConfig = [
        { key: 'us', title: '美股指数', icon: '🇺🇸', color: '#3b82f6', bgColor: '#eff6ff' },
        { key: 'cn', title: '中国A股', icon: '🇨🇳', color: '#ef4444', bgColor: '#fef2f2' },
        { key: 'hk', title: '港股指数', icon: '🇭🇰', color: '#22c55e', bgColor: '#f0fdf4' },
        { key: 'global', title: 'G20全球股市', icon: '🌍', color: '#0ea5e9', bgColor: '#f0f9ff' },
        { key: 'commodity', title: '大宗商品', icon: '📦', color: '#f59e0b', bgColor: '#fffbeb' },
        { key: 'forex', title: '外汇债券', icon: '💱', color: '#8b5cf6', bgColor: '#faf5ff' },
      ]
      
      const results = await Promise.all(
        categoryConfig.map(async (cat) => {
          const data = await fetchMarketDataByType(cat.key as any)
          return { ...cat, data }
        })
      )
      
      if (mounted) {
        setCategories(results)
        setTimestamp(new Date().toLocaleString('zh-CN'))
        setLoading(false)
      }
    }
    fetchAllData()
    return () => { mounted = false }
  }, [])

  // 保存复盘数据
  const handleSaveReview = () => {
    if (!formData.date) return
    
    const newReview: DailyReview = {
      date: formData.date,
      weekday: getWeekday(formData.date),
      ztCount: formData.ztCount || 0,
      ztSealRate: formData.ztSealRate || '',
      ztOpen: formData.ztOpen || 0,
      dtCount: formData.dtCount || 0,
      dtSealRate: formData.dtSealRate || '',
      dtOpen: formData.dtOpen || 0,
      volume: formData.volume || 0,
      upDown: formData.upDown || '',
      shszcy: formData.shszcy || '',
      lbRate: formData.lbRate || '',
      lbCount: formData.lbCount || 0,
      maxBoard: formData.maxBoard || 0,
      top5Amount: formData.top5Amount || 0,
      top5Turnover: formData.top5Turnover || 0,
      inflow: formData.inflow || '',
      outflow: formData.outflow || '',
    }
    
    // 更新或新增
    const existingIndex = reviews.findIndex(r => r.date === newReview.date)
    let newReviews: DailyReview[]
    if (existingIndex >= 0) {
      newReviews = [...reviews]
      newReviews[existingIndex] = newReview
    } else {
      newReviews = [newReview, ...reviews]
    }
    
    // 按日期排序
    newReviews.sort((a, b) => b.date.localeCompare(a.date))
    
    setReviews(newReviews)
    saveReviews(newReviews)
    // 自动同步到云端
    syncToGist(newReviews, newsList).then(result => {
      if (!result.success) console.warn('自动同步失败:', result.error)
    }).catch(() => {})
    setShowForm(false)
    setFormData({})
    setEditDate('')
  }

  // 编辑某天数据
  const handleEdit = (review: DailyReview) => {
    setFormData(review)
    setEditDate(review.date)
    setShowForm(true)
  }

  // 删除某天数据
  const handleDelete = (date: string) => {
    if (confirm('确定删除这天的数据吗？')) {
      const newReviews = reviews.filter(r => r.date !== date)
      setReviews(newReviews)
      saveReviews(newReviews)
    }
  }

  // 新增今日数据
  const handleAddToday = () => {
    const today = new Date().toISOString().split('T')[0]
    setFormData({ date: today })
    setEditDate('')
    setShowForm(true)
  }

  // 导出数据
  const handleExport = () => {
    const data = {
      reviews,
      news: newsList,
      exportDate: new Date().toISOString(),
      version: '1.0'
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pulse-backup-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    alert('数据已导出！')
  }

  // 导入数据
  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string)
          
          if (data.reviews && Array.isArray(data.reviews)) {
            setReviews(data.reviews)
            saveReviews(data.reviews)
          }
          
          if (data.news && Array.isArray(data.news)) {
            setNewsList(data.news)
            saveNews(data.news)
          }
          
          alert('数据导入成功！')
          window.location.reload()
        } catch (error) {
          alert('导入失败：文件格式错误')
          console.error(error)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  // 保存重要消息
  const handleSaveNews = () => {
    if (!newsFormData.title || !newsFormData.date) return
    
    const newNews: ImportantNews = {
      id: newsFormData.id || Date.now().toString(),
      date: newsFormData.date,
      title: newsFormData.title,
      impact: newsFormData.impact || 'medium',
      category: newsFormData.category || '其他',
      source: newsFormData.source,
      link: newsFormData.link,
      notes: newsFormData.notes,
    }
    
    const existingIndex = newsList.findIndex(n => n.id === newNews.id)
    let newNewsList: ImportantNews[]
    if (existingIndex >= 0) {
      newNewsList = [...newsList]
      newNewsList[existingIndex] = newNews
    } else {
      newNewsList = [newNews, ...newsList]
    }
    
    // 按日期排序
    newNewsList.sort((a, b) => b.date.localeCompare(a.date))
    
    setNewsList(newNewsList)
    saveNews(newNewsList)
    // 自动同步到云端
    syncToGist(reviews, newNewsList).then(result => {
      if (!result.success) console.warn('自动同步失败:', result.error)
    }).catch(() => {})
    setShowNewsForm(false)
    setNewsFormData({})
  }

  // 删除消息
  const handleDeleteNews = (id: string) => {
    if (confirm('确定删除这条消息吗？')) {
      const newNewsList = newsList.filter(n => n.id !== id)
      setNewsList(newNewsList)
      saveNews(newNewsList)
      // 自动同步到云端
      syncToGist(reviews, newNewsList).then(result => {
        if (!result.success) console.warn('自动同步失败:', result.error)
      }).catch(() => {})
    }
  }

  // 新增今日消息
  const handleAddTodayNews = () => {
    const today = new Date().toISOString().split('T')[0]
    setNewsFormData({ date: today, impact: 'medium', category: '其他' })
    setShowNewsForm(true)
  }

  const handleRefresh = () => window.location.reload()

  // 保存 GitHub Token
  const handleSaveGistToken = () => {
    if (gistTokenInput.trim()) {
      saveGistConfig(gistTokenInput.trim(), null)
      alert('Token 已保存！')
      setShowSettings(false)
      // 立即同步
      handleSyncToCloud()
    } else {
      alert('请输入 Token')
    }
  }

  // 手动同步到云端
  const handleSyncToCloud = async () => {
    setSyncing(true)
    const result = await syncToGist(reviews, newsList)
    setSyncing(false)
    if (result.success) {
      alert('✅ 同步成功！')
    } else {
      const errorMsg = result.error || '未知错误'
      alert(`❌ 同步失败\n\n错误：${errorMsg}\n\n请检查：\n1. Token 是否正确\n2. Token 是否有 gist 权限\n3. 网络连接是否正常`)
    }
  }

  // 手动从云端同步
  const handleSyncFromCloud = async () => {
    setSyncing(true)
    const cloudData = await syncFromGist()
    setSyncing(false)
    if (cloudData) {
      if (cloudData.reviews.length > 0) {
        setReviews(cloudData.reviews)
        saveReviews(cloudData.reviews)
      }
      if (cloudData.news.length > 0) {
        setNewsList(cloudData.news)
        saveNews(cloudData.news)
      }
      alert('✅ 从云端同步成功！')
      window.location.reload()
    } else {
      alert('❌ 同步失败，请检查 Token 和网络')
    }
  }

  const formatPrice = (price: number, symbol?: string) => {
    if (symbol === 'BTC-USD') return price.toLocaleString('en-US', { maximumFractionDigits: 0 })
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const formatPercent = (percent: number) => {
    const sign = percent >= 0 ? '+' : ''
    return `${sign}${percent.toFixed(2)}%`
  }

  // 渲染数据卡片
  const renderCard = (stock: StockQuote, color: string) => {
    const isPositive = stock.change >= 0
    const changeColor = isPositive ? '#16a34a' : '#dc2626'

  return (
      <div key={stock.symbol} style={{
        background: 'white', borderRadius: '12px', padding: '14px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column',
        gap: '6px', borderLeft: `4px solid ${color}`, transition: 'transform 0.2s, box-shadow 0.2s'
      }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)' }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ fontWeight: '600', fontSize: '0.9rem', color: '#1f2937' }}>{stock.name}</span>
          {stock.rsi !== undefined && (
            <span style={{ fontSize: '0.7rem', padding: '2px 5px', borderRadius: '4px',
              background: stock.rsi >= 70 ? '#fef2f2' : stock.rsi <= 30 ? '#f0fdf4' : '#f3f4f6',
              color: stock.rsi >= 70 ? '#dc2626' : stock.rsi <= 30 ? '#16a34a' : '#6b7280', fontWeight: '500'
            }}>RSI {stock.rsi.toFixed(0)}</span>
          )}
          </div>
        <div style={{ fontSize: '1.3rem', fontWeight: '700', color: changeColor }}>{formatPrice(stock.price, stock.symbol)}</div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem' }}>
          <span style={{ color: changeColor, fontWeight: '500' }}>{isPositive ? '↑' : '↓'} {formatPrice(Math.abs(stock.change))}</span>
          <span style={{ color: changeColor, fontWeight: '600', padding: '1px 5px', borderRadius: '4px', background: isPositive ? '#f0fdf4' : '#fef2f2' }}>{formatPercent(stock.changePercent)}</span>
        </div>
      </div>
    )
  }

  // 渲染分类
  const renderCategory = (category: MarketCategory) => (
    <div key={category.key} style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', padding: '6px 10px',
        background: category.bgColor, borderRadius: '6px', borderLeft: `3px solid ${category.color}` }}>
        <span style={{ fontSize: '1rem' }}>{category.icon}</span>
        <span style={{ fontWeight: '600', color: category.color, fontSize: '0.9rem' }}>{category.title}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
        {category.data.map(stock => renderCard(stock, category.color))}
        {category.data.length === 0 && <div style={{ padding: '16px', color: '#9ca3af', fontSize: '0.85rem', gridColumn: '1 / -1', textAlign: 'center' }}>加载中...</div>}
      </div>
          </div>
  )

  // 渲染复盘表格
  const renderReviewTable = () => (
    <div style={{ marginBottom: '24px', padding: '16px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
          📝 每日复盘 <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 'normal' }}>最近{reviews.length}天</span>
        </h3>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={handleExport} style={{
            padding: '6px 12px', background: '#10b981', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500'
          }}>📥 导出</button>
          <button onClick={handleImport} style={{
            padding: '6px 12px', background: '#8b5cf6', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500'
          }}>📤 导入</button>
          <button onClick={handleAddToday} style={{
            padding: '6px 12px', background: '#3b82f6', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500'
          }}>+ 录入今日</button>
        </div>
          </div>
      
      {reviews.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', minWidth: '1200px' }}>
              <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['日期', '周', '涨停', '封板率', '打开', '跌停', '封板率', '打开', '量能', '涨-跌', '沪深创', '连板晋级', '连板数', '最高板', '成交前五', '换手前五', '流入', '流出', '操作'].map(h => (
                  <th key={h} style={{ padding: '8px 6px', textAlign: 'center', fontWeight: '600', color: '#64748b', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
                </tr>
              </thead>
              <tbody>
              {reviews.slice(0, 10).map((r, i) => (
                <tr key={r.date} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: '500' }}>{r.date.slice(5)}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.weekday}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#dc2626', fontWeight: '600' }}>{r.ztCount}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.ztSealRate}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.ztOpen}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#16a34a', fontWeight: '600' }}>{r.dtCount}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.dtSealRate}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.dtOpen}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#f59e0b', fontWeight: '600' }}>{r.volume}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.upDown}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.shszcy}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.lbRate}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#8b5cf6', fontWeight: '600' }}>{r.lbCount}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#dc2626', fontWeight: '700' }}>{r.maxBoard}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#0ea5e9', fontWeight: '600' }}>{r.top5Amount || '--'}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#0ea5e9', fontWeight: '600' }}>{r.top5Turnover || '--'}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'left', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#dc2626' }} title={r.inflow}>{r.inflow}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'left', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#16a34a' }} title={r.outflow}>{r.outflow}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                    <button onClick={() => handleEdit(r)} style={{ padding: '2px 6px', marginRight: '4px', background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.7rem' }}>编辑</button>
                    <button onClick={() => handleDelete(r.date)} style={{ padding: '2px 6px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.7rem' }}>删除</button>
                      </td>
                    </tr>
              ))}
              </tbody>
            </table>
          </div>
        ) : (
        <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>暂无数据，点击"录入今日"开始记录</div>
      )}
    </div>
  )

  // 渲染重要消息区块
  const renderNewsSection = () => {
    const today = new Date().toISOString().split('T')[0]
    const todayNews = newsList.filter(n => n.date === today)
    const recentNews = newsList.slice(0, 10)
    
    return (
      <div style={{ marginBottom: '24px', padding: '16px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📰 每日重要消息 <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 'normal' }}>影响美股的关键事件</span>
          </h3>
          <button onClick={handleAddTodayNews} style={{
            padding: '6px 12px', background: '#3b82f6', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500'
          }}>+ 添加消息</button>
        </div>
        
        {todayNews.length > 0 && (
          <div style={{ marginBottom: '16px', padding: '12px', background: 'white', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>今日消息 ({todayNews.length}条)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {todayNews.map(news => (
                <div key={news.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px', background: 'white', borderRadius: '6px' }}>
                  <span style={{ 
                    fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: '500',
                    background: news.impact === 'high' ? '#fee2e2' : news.impact === 'medium' ? '#f3f4f6' : '#e0f2fe',
                    color: news.impact === 'high' ? '#dc2626' : news.impact === 'medium' ? '#6b7280' : '#0369a1',
                    whiteSpace: 'nowrap'
                  }}>
                    {news.impact === 'high' ? '🔥高' : news.impact === 'medium' ? '⚡中' : '📌低'}
                  </span>
                  <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: '#f3f4f6', color: '#6b7280' }}>
                    {news.category}
                  </span>
                  <span style={{ flex: 1, fontSize: '0.85rem', color: '#1f2937' }}>{news.title}</span>
                  {news.link && (
                    <a href={news.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: '#3b82f6' }}>🔗</a>
                  )}
                  <button onClick={() => handleDeleteNews(news.id)} style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>删除</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {recentNews.length > 0 && (
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>最近消息</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {recentNews.map(news => (
                <div key={news.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: news.date === today ? '#f0f9ff' : '#f9fafb', borderRadius: '6px', fontSize: '0.8rem' }}>
                  <span style={{ color: '#9ca3af', minWidth: '70px' }}>{news.date.slice(5)}</span>
                  <span style={{ 
                    fontSize: '0.7rem', padding: '2px 5px', borderRadius: '3px',
                    background: news.impact === 'high' ? '#fee2e2' : news.impact === 'medium' ? '#f3f4f6' : '#e0f2fe',
                    color: news.impact === 'high' ? '#dc2626' : news.impact === 'medium' ? '#6b7280' : '#0369a1'
                  }}>
                    {news.impact === 'high' ? '高' : news.impact === 'medium' ? '中' : '低'}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#9ca3af', minWidth: '60px' }}>{news.category}</span>
                  <span style={{ flex: 1, color: '#374151' }}>{news.title}</span>
                  {news.link && (
                    <a href={news.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: '#3b82f6' }}>🔗</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {newsList.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>暂无消息，点击"添加消息"开始记录</div>
        )}
      </div>
    )
  }

  // 渲染消息录入表单
  const renderNewsForm = () => showNewsForm && (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', width: '90%', maxWidth: '500px', maxHeight: '80vh', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>添加重要消息</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>日期</label>
            <input type="date" value={newsFormData.date || ''} onChange={e => setNewsFormData({ ...newsFormData, date: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>消息标题 *</label>
            <input type="text" placeholder="如：美联储宣布加息25个基点" value={newsFormData.title || ''} onChange={e => setNewsFormData({ ...newsFormData, title: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#64748b' }}>影响程度</label>
              <select value={newsFormData.impact || 'medium'} onChange={e => setNewsFormData({ ...newsFormData, impact: e.target.value as any })}
                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }}>
                <option value="high">🔥 高影响</option>
                <option value="medium">⚡ 中影响</option>
                <option value="low">📌 低影响</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#64748b' }}>分类</label>
              <select value={newsFormData.category || '其他'} onChange={e => setNewsFormData({ ...newsFormData, category: e.target.value })}
                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }}>
                <option value="美联储">美联储</option>
                <option value="经济数据">经济数据</option>
                <option value="地缘政治">地缘政治</option>
                <option value="财报">财报</option>
                <option value="其他">其他</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>来源（可选）</label>
            <input type="text" placeholder="如：华尔街日报" value={newsFormData.source || ''} onChange={e => setNewsFormData({ ...newsFormData, source: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>链接（可选）</label>
            <input type="url" placeholder="https://..." value={newsFormData.link || ''} onChange={e => setNewsFormData({ ...newsFormData, link: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>备注（可选）</label>
            <textarea placeholder="补充说明..." value={newsFormData.notes || ''} onChange={e => setNewsFormData({ ...newsFormData, notes: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', minHeight: '60px' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
          <button onClick={() => { setShowNewsForm(false); setNewsFormData({}) }}
            style={{ padding: '8px 16px', background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>取消</button>
          <button onClick={handleSaveNews}
            style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>保存</button>
        </div>
      </div>
    </div>
  )

  // 渲染录入表单
  const renderForm = () => showForm && (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', width: '90%', maxWidth: '500px', maxHeight: '80vh', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>{editDate ? '编辑' : '录入'}复盘数据</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>日期</label>
            <input type="date" value={formData.date || ''} onChange={e => setFormData({ ...formData, date: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>涨停板数</label>
            <input type="number" value={formData.ztCount || ''} onChange={e => setFormData({ ...formData, ztCount: +e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>涨停封板率</label>
            <input type="text" placeholder="如 75%" value={formData.ztSealRate || ''} onChange={e => setFormData({ ...formData, ztSealRate: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>涨停打开数</label>
            <input type="number" value={formData.ztOpen || ''} onChange={e => setFormData({ ...formData, ztOpen: +e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>跌停板数</label>
            <input type="number" value={formData.dtCount || ''} onChange={e => setFormData({ ...formData, dtCount: +e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>跌停封板率</label>
            <input type="text" placeholder="如 50%" value={formData.dtSealRate || ''} onChange={e => setFormData({ ...formData, dtSealRate: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>跌停打开数</label>
            <input type="number" value={formData.dtOpen || ''} onChange={e => setFormData({ ...formData, dtOpen: +e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>量能（亿）</label>
            <input type="number" value={formData.volume || ''} onChange={e => setFormData({ ...formData, volume: +e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>涨-跌</label>
            <input type="text" placeholder="如 3982-1060" value={formData.upDown || ''} onChange={e => setFormData({ ...formData, upDown: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>沪深创</label>
            <input type="text" placeholder="如 +++" value={formData.shszcy || ''} onChange={e => setFormData({ ...formData, shszcy: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>连板晋级率</label>
            <input type="text" placeholder="如 58%" value={formData.lbRate || ''} onChange={e => setFormData({ ...formData, lbRate: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>连板数量</label>
            <input type="number" value={formData.lbCount || ''} onChange={e => setFormData({ ...formData, lbCount: +e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>最高板</label>
            <input type="number" value={formData.maxBoard || ''} onChange={e => setFormData({ ...formData, maxBoard: +e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>成交金额前五</label>
            <input type="number" value={formData.top5Amount || ''} onChange={e => setFormData({ ...formData, top5Amount: +e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>换手率前五</label>
            <input type="number" value={formData.top5Turnover || ''} onChange={e => setFormData({ ...formData, top5Turnover: +e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>流入板块</label>
            <input type="text" placeholder="如 航天、消费电子" value={formData.inflow || ''} onChange={e => setFormData({ ...formData, inflow: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>流出板块</label>
            <input type="text" placeholder="如 医疗、光模块" value={formData.outflow || ''} onChange={e => setFormData({ ...formData, outflow: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
          <button onClick={() => { setShowForm(false); setFormData({}); setEditDate('') }}
            style={{ padding: '8px 16px', background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>取消</button>
          <button onClick={handleSaveReview}
            style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>保存</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '14px 18px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>📊 经济脉搏</h1>
          <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#6b7280' }}>每日市场数据 & 复盘记录</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{timestamp || '--'}</span>
          {getGistToken() && (
            <>
              <button onClick={handleSyncToCloud} disabled={syncing} style={{
                padding: '6px 12px', background: syncing ? '#e5e7eb' : '#0ea5e9', color: syncing ? '#9ca3af' : 'white', border: 'none',
                borderRadius: '6px', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: '500'
              }}>{syncing ? '⏳' : '☁️'} {syncing ? '同步中' : '上传'}</button>
              <button onClick={handleSyncFromCloud} disabled={syncing} style={{
                padding: '6px 12px', background: syncing ? '#e5e7eb' : '#06b6d4', color: syncing ? '#9ca3af' : 'white', border: 'none',
                borderRadius: '6px', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: '500'
              }}>{syncing ? '⏳' : '⬇️'} {syncing ? '同步中' : '下载'}</button>
            </>
          )}
          <button onClick={() => setShowSettings(true)} style={{
            padding: '6px 12px', background: getGistToken() ? '#10b981' : '#f59e0b', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500'
          }}>⚙️ {getGistToken() ? '已配置' : '云端设置'}</button>
          <button onClick={handleExport} style={{
            padding: '6px 12px', background: '#10b981', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500'
          }}>📥 导出</button>
          <button onClick={handleImport} style={{
            padding: '6px 12px', background: '#8b5cf6', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500'
          }}>📤 导入</button>
          <button onClick={handleRefresh} disabled={loading}
            style={{ padding: '6px 14px', background: loading ? '#e5e7eb' : 'linear-gradient(135deg, #3b82f6, #2563eb)', color: loading ? '#9ca3af' : 'white', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: '500' }}>
            {loading ? '⏳' : '🔄'} {loading ? '加载' : '刷新'}
          </button>
        </div>
      </div>

      {/* 复盘表格 */}
      {renderReviewTable()}

      {/* 重要消息 */}
      {renderNewsSection()}

      {/* 数据分类 */}
      {categories.map(renderCategory)}

      {/* 资源链接 */}
      <div style={{ marginTop: '20px', padding: '16px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <h3 style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#374151' }}>🔗 常用资源</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {[
            { name: '涨停揭秘', url: 'https://stcn.com/article/search.html?keyword=%E6%8F%AD%E7%A7%98%E6%B6%A8%E5%81%9C' },
            { name: '选股通', url: 'https://xuangutong.com.cn/jingxuan' },
            { name: '东方财富', url: 'https://www.eastmoney.com/' },
            { name: '同花顺', url: 'https://www.10jqka.com.cn/' },
            { name: '财联社', url: 'https://www.cls.cn/' },
          ].map(link => (
            <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer"
              style={{ padding: '5px 10px', background: '#f3f4f6', color: '#4b5563', textDecoration: 'none', borderRadius: '5px', fontSize: '0.8rem', transition: 'all 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#3b82f6'; e.currentTarget.style.color = 'white' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#4b5563' }}>{link.name}</a>
          ))}
        </div>
      </div>

      {/* 录入表单弹窗 */}
      {renderForm()}
      {renderNewsForm()}
      
      {/* 云端设置弹窗 */}
      {showSettings && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', width: '90%', maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>☁️ 云端同步设置</h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '16px' }}>
              使用 GitHub Gist 免费存储数据，实现跨设备同步
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '6px' }}>
                GitHub Personal Access Token
              </label>
              <input 
                type="password"
                value={gistTokenInput}
                onChange={e => setGistTokenInput(e.target.value)}
                placeholder="ghp_xxx 或 github_pat_xxx"
                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }}
              />
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '6px', lineHeight: '1.6' }}>
                <strong>Classic Token:</strong> GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic)
                <br />
                权限：勾选 <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: '3px' }}>gist</code>
                <br /><br />
                <strong>Fine-grained Token:</strong> 支持，但需要确保有 <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: '3px' }}>Gists</code> 权限
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowSettings(false); setGistTokenInput(getGistToken() || '') }}
                style={{ padding: '8px 16px', background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                取消
              </button>
              <button onClick={handleSaveGistToken}
                style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
                保存
              </button>
            </div>
            {getGistToken() && (
              <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', borderRadius: '6px', fontSize: '0.85rem', color: '#166534' }}>
                ✅ 已配置云端同步，数据会自动保存到你的 GitHub Gist
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
