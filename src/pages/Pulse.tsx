import React, { useEffect, useState } from 'react'
import { fetchMarketDataByType, fetchSectorCategories, fetchUSSectorCategories } from '../services/api'
import type { DailyReview, MarketCategory, SectorCategory, NewsSource, StockQuote } from '../types'
import { loadReviews, saveReviews, loadNewsSources, saveNewsSources, getGistToken, getGistId, saveGistConfig } from '../utils/storage'
import { syncToGist, syncFromGist } from '../utils/gist'
import { getWeekday, getToday } from '../utils/date'
import { ReviewTable } from '../components/pulse/ReviewTable'
import { NewsSourceSection } from '../components/pulse/NewsSourceSection'
import { MarketCategory as MarketCategoryComponent } from '../components/pulse/MarketCategory'
import { SectorSection } from '../components/pulse/SectorSection'
import HeatmapSection from '../components/pulse/HeatmapSection'
import {
  TrendingUp,
  Globe,
  Globe2,
  Box,
  Repeat,
  ArrowUp,
  ArrowDown,
  Cloud,
  Download,
  Search,
  Settings,
  Upload,
  ArrowRight,
  RefreshCw,
  Link as LinkIcon,
  ShieldCheck,
  Target,
  BarChart2,
  AlertTriangle,
  History
} from 'lucide-react'

export default function Pulse(): JSX.Element {
  const [categories, setCategories] = useState<MarketCategory[]>([])
  const [sectorCategories, setSectorCategories] = useState<SectorCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [timestamp, setTimestamp] = useState<string>('')

  // 复盘表格状态
  const [reviews, setReviews] = useState<DailyReview[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editDate, setEditDate] = useState<string>('')
  const [formData, setFormData] = useState<Partial<DailyReview>>({})

  // 消息源状态
  const [newsSources, setNewsSources] = useState<NewsSource[]>([])

  // 云端同步状态
  const [showSettings, setShowSettings] = useState(false)
  const [gistTokenInput, setGistTokenInput] = useState('')
  const [gistIdInput, setGistIdInput] = useState('')
  const [syncing, setSyncing] = useState(false)

  // 筛选状态
  const [showFilter, setShowFilter] = useState(false)
  const [filterCategories, setFilterCategories] = useState<Set<string>>(new Set(['us', 'cn', 'hk', 'global', 'commodity', 'forex']))

  useEffect(() => {
    // 加载本地数据
    setReviews(loadReviews())
    setNewsSources(loadNewsSources())
    setGistTokenInput(getGistToken() || '')
    setGistIdInput(getGistId() || '')

    // 尝试从云端同步
    const loadFromCloud = async () => {
      const cloudData = await syncFromGist()
      if (cloudData) {
        // 合并数据：云端优先
        if (cloudData.reviews.length > 0) {
          setReviews(cloudData.reviews)
          saveReviews(cloudData.reviews)
        }
      }
    }
    loadFromCloud()

    let mounted = true
    const fetchAllData = async () => {
      setLoading(true)
      const categoryConfig = [
        { key: 'us', title: '美股指数', icon: <TrendingUp size={18} />, color: '#3b82f6', bgColor: '#eff6ff' },
        { key: 'cn', title: '中国A股', icon: <Globe size={18} />, color: '#ef4444', bgColor: '#fef2f2' },
        { key: 'hk', title: '港股指数', icon: <Globe2 size={18} />, color: '#22c55e', bgColor: '#f0fdf4' },
        { key: 'global', title: 'G20全球股市', icon: <Globe size={18} />, color: '#0ea5e9', bgColor: '#f0f9ff' },
        { key: 'commodity', title: '大宗商品', icon: <Box size={18} />, color: '#f59e0b', bgColor: '#fffbeb' },
        { key: 'forex', title: '外汇债券', icon: <Repeat size={18} />, color: '#8b5cf6', bgColor: '#faf5ff' },
      ]

      try {
        const [results, cnSectors, usSectors] = await Promise.all([
          Promise.all(
            categoryConfig.map(async (cat) => {
              const data = await fetchMarketDataByType(cat.key as any)
              console.log(`获取 ${cat.title} 数据:`, data.length, '条')
              return { ...cat, data }
            })
          ),
          fetchSectorCategories(),  // 获取中国板块数据
          fetchUSSectorCategories()  // 获取美股板块数据
        ])

        if (mounted) {
          console.log('所有分类数据:', results)
          console.log('筛选条件:', Array.from(filterCategories))
          setCategories(results)
          setSectorCategories([...cnSectors, ...usSectors])  // 合并中国和美股板块
          setTimestamp(new Date().toLocaleString('zh-CN'))
          setLoading(false)
        }
      } catch (error) {
        console.error('获取数据失败:', error)
        if (mounted) {
          setLoading(false)
        }
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
    syncToGist(newReviews).then(result => {
      if (!result.success) console.warn('自动同步失败:', result.error)
    }).catch(() => { })
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
    setFormData({ date: getToday() })
    setEditDate('')
    setShowForm(true)
  }

  // 导出数据
  const handleExport = () => {
    const data = {
      reviews,
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


          alert('数据导入成功！数据已更新')
          // 不刷新页面，数据已通过 state 更新
        } catch (error) {
          alert('导入失败：文件格式错误')
          console.error(error)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }


  const handleRefresh = () => window.location.reload()

  // 保存 GitHub Token
  const handleSaveGistToken = () => {
    if (gistTokenInput.trim()) {
      // 如果输入了 gistId，使用输入的；否则保留现有的
      const gistId = gistIdInput.trim() || getGistId()
      saveGistConfig(gistTokenInput.trim(), gistId)
      alert('Token 已保存！' + (gistId ? `\n\nGist ID: ${gistId}\n\n提示：配置完成后，请手动点击"上传"按钮同步数据` : '\n\n提示：上传一次数据后会自动保存 Gist ID'))
      setShowSettings(false)
      // 不再自动上传，避免上传空数据
    } else {
      alert('请输入 Token')
    }
  }

  // 合并数据：智能合并本地和云端数据（类似 Git merge）
  const mergeData = <T extends { id?: string; date?: string }>(local: T[], cloud: T[], keyField: string = 'id'): T[] => {
    const merged = new Map<string, T>()

    // 先添加云端数据（云端优先）
    cloud.forEach(item => {
      const key = item[keyField as keyof T] as string || `${item.date || ''}_${JSON.stringify(item).slice(0, 50)}`
      merged.set(key, item)
    })

    // 再添加本地数据（如果本地有新的或更新的）
    local.forEach(item => {
      const key = item[keyField as keyof T] as string || `${item.date || ''}_${JSON.stringify(item).slice(0, 50)}`
      const existing = merged.get(key)
      if (!existing) {
        // 本地有新的数据，添加
        merged.set(key, item)
      } else {
        // 如果本地数据更新（通过时间戳判断），使用本地数据
        const localDate = item.date || ''
        const cloudDate = existing.date || ''
        if (localDate > cloudDate) {
          merged.set(key, item)
        }
      }
    })

    return Array.from(merged.values())
  }

  // 手动同步到云端（先下载再上传，类似 Git pull before push）
  const handleSyncToCloud = async () => {
    if (!getGistToken()) {
      alert('❌ 请先配置 Token（点击"云端设置"）')
      return
    }

    setSyncing(true)

    try {
      // 如果有 Gist ID，先下载云端数据（类似 Git pull）
      const gistId = getGistId()
      let cloudReviews: DailyReview[] = []

      if (gistId) {
        try {
          const cloudData = await syncFromGist()
          if (cloudData) {
            cloudReviews = cloudData.reviews
            console.log('📥 已下载云端数据:', { reviews: cloudReviews.length })
          }
        } catch (error) {
          console.warn('下载云端数据失败，继续使用本地数据上传:', error)
          // 如果下载失败，继续使用本地数据上传（可能是首次上传或网络问题）
        }
      }

      // 合并数据：本地 + 云端（避免覆盖）
      const mergedReviews = mergeData(reviews, cloudReviews, 'date')

      // 如果有新数据合并进来，更新本地状态
      if (mergedReviews.length > reviews.length) {
        setReviews(mergedReviews)
        saveReviews(mergedReviews)
      }

      // 上传合并后的数据（类似 Git push）
      const result = await syncToGist(mergedReviews)

      if (result.success) {
        const reviewCount = mergedReviews.length
        const currentGistId = getGistId()
        const mergeInfo = cloudReviews.length > 0
          ? `\n\n✅ 已合并云端数据（避免覆盖）`
          : ''
        const publicSyncInfo = result.publicSync
          ? `\n\n🌐 已同步到公共 Gist（其他人可读取）`
          : `\n\nℹ️ 未同步到公共 Gist（无权限或非所有者）`
        const message = currentGistId
          ? `✅ 上传成功！\n\n复盘数据：${reviewCount} 条${mergeInfo}${publicSyncInfo}\n\nGist ID: ${currentGistId}\n\n（可在其他设备输入此 ID 同步）`
          : `✅ 上传成功！\n\n复盘数据：${reviewCount} 条${mergeInfo}${publicSyncInfo}`
        alert(message)
      } else {
        const errorMsg = result.error || '未知错误'
        alert(`❌ 上传失败\n\n错误：${errorMsg}\n\n请检查：\n1. Token 是否正确\n2. Token 是否有 gist 权限\n3. 网络连接是否正常`)
      }
    } catch (error) {
      console.error('上传过程出错:', error)
      alert(`❌ 上传失败\n\n错误：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSyncing(false)
    }
  }

  // 手动从云端同步
  const handleSyncFromCloud = async () => {
    const hasToken = getGistToken()
    const hasGistId = getGistId()

    // 如果用户配置了 token 但没有 gistId，提示需要先上传
    if (hasToken && !hasGistId) {
      alert('❌ 云端还没有数据\n\n请先上传一次数据，然后再下载\n\n（如果没有配置，将使用默认公共数据）')
      return
    }

    setSyncing(true)
    const cloudData = await syncFromGist()
    setSyncing(false)

    if (cloudData) {
      const reviewCount = cloudData.reviews.length

      if (reviewCount === 0) {
        alert('⚠️ 云端数据为空')
        return
      }

      // 合并数据：云端优先
      if (reviewCount > 0) {
        setReviews(cloudData.reviews)
        saveReviews(cloudData.reviews)
      }

      const source = hasGistId ? '你的云端数据' : '默认公共数据'
      alert(`✅ 下载成功！\n\n数据来源：${source}\n复盘数据：${reviewCount} 条\n\n数据已更新到本地`)
    } else {
      alert('❌ 下载失败\n\n可能原因：\n1. 网络连接问题\n2. Gist 不存在或已删除\n3. Token 权限不足（如果已配置）\n\n提示：未配置时会自动使用默认公共数据')
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
            <span style={{
              fontSize: '0.7rem', padding: '2px 5px', borderRadius: '4px',
              background: stock.rsi >= 70 ? '#fef2f2' : stock.rsi <= 30 ? '#f0fdf4' : '#f3f4f6',
              color: stock.rsi >= 70 ? '#dc2626' : stock.rsi <= 30 ? '#16a34a' : '#6b7280', fontWeight: '500'
            }}>RSI {stock.rsi.toFixed(0)}</span>
          )}
        </div>
        <div style={{ fontSize: '1.3rem', fontWeight: '700', color: changeColor }}>{formatPrice(stock.price, stock.symbol)}</div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', alignItems: 'center' }}>
          <span style={{ color: changeColor, fontWeight: '500', display: 'flex', alignItems: 'center', gap: '2px' }}>
            {isPositive ? <ArrowUp size={12} /> : <ArrowDown size={12} />} {formatPrice(Math.abs(stock.change))}
          </span>
          <span style={{ color: changeColor, fontWeight: '600', padding: '1px 5px', borderRadius: '4px', background: isPositive ? '#f0fdf4' : '#fef2f2' }}>{formatPercent(stock.changePercent)}</span>
        </div>
      </div>
    )
  }

  // 切换筛选分类
  const toggleFilterCategory = (key: string) => {
    const newFilter = new Set(filterCategories)
    if (newFilter.has(key)) {
      newFilter.delete(key)
    } else {
      newFilter.add(key)
    }
    setFilterCategories(newFilter)
  }

  // 重置筛选
  const resetFilter = () => {
    setFilterCategories(new Set(['us', 'cn', 'hk', 'global', 'commodity', 'forex']))
  }

  // 渲染分类
  const renderCategory = (category: MarketCategory) => {
    if (!filterCategories.has(category.key)) {
      return null
    }
    return (
      <div key={category.key} style={{ marginBottom: '20px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', padding: '6px 10px',
          background: category.bgColor, borderRadius: '6px', borderLeft: `3px solid ${category.color}`
        }}>
          <span style={{ fontSize: '1rem' }}>{category.icon}</span>
          <span style={{ fontWeight: '600', color: category.color, fontSize: '0.9rem' }}>{category.title}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
          {category.data.map(stock => renderCard(stock, category.color))}
          {category.data.length === 0 && <div style={{ padding: '16px', color: '#9ca3af', fontSize: '0.85rem', gridColumn: '1 / -1', textAlign: 'center' }}>加载中...</div>}
        </div>
      </div>
    )
  }

  // 渲染复盘表格
  const renderReviewTable = () => (
    <ReviewTable
      reviews={reviews}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onExport={handleExport}
      onImport={handleImport}
      onAddToday={handleAddToday}
    />
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '20px', padding: '14px 18px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{timestamp || '--'}</span>
          {getGistToken() && (
            <button onClick={handleSyncToCloud} disabled={syncing} style={{
              padding: '6px 12px', background: syncing ? '#e5e7eb' : '#0ea5e9', color: syncing ? '#9ca3af' : 'white', border: 'none',
              borderRadius: '6px', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: '500'
            }}>{syncing ? '⏳' : '☁️'} {syncing ? '同步中' : '上传'}</button>
          )}
          <button onClick={handleSyncFromCloud} disabled={syncing} style={{
            padding: '6px 12px', background: syncing ? '#e5e7eb' : '#06b6d4', color: syncing ? '#9ca3af' : 'white', border: 'none',
            borderRadius: '6px', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: '500'
          }}>{syncing ? '⏳' : '⬇️'} {syncing ? '同步中' : '下载'}</button>
          <button onClick={() => setShowFilter(true)} style={{
            padding: '6px 12px', background: '#6366f1', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500'
          }}>🔍 筛选</button>
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

      {/* 市场热力图 */}
      <HeatmapSection />

      {/* 复盘表格 */}
      {renderReviewTable()}

      {/* 消息源管理 */}
      <NewsSourceSection
        sources={newsSources}
        onUpdate={(sources) => {
          setNewsSources(sources)
          saveNewsSources(sources)
        }}
      />

      {/* 数据分类 */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
          ⏳ 数据加载中...
        </div>
      ) : categories.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
          ⚠️ 暂无数据，请检查网络连接或刷新页面
        </div>
      ) : (
        categories
          .filter(category => filterCategories.has(category.key))
          .map(category => {
            console.log('渲染分类:', category.key, category.title, '数据条数:', category.data.length)
            return (
              <MarketCategoryComponent key={category.key} category={category} />
            )
          })
      )}

      {/* 板块数据 */}
      {sectorCategories.length > 0 && (
        <>
          {sectorCategories.map(category => (
            <SectorSection key={category.type} category={category} />
          ))}
        </>
      )}

      {/* 资源链接 */}
      <div style={{ marginTop: '20px', padding: '16px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <h3 style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LinkIcon size={16} /> 常用资源
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {[
            { name: '涨停揭秘', url: 'https://stcn.com/article/search.html?keyword=%E6%8F%AD%E7%A7%98%E6%B6%A8%E5%81%9C' },
            { name: '选股通', url: 'https://xuangutong.com.cn/jingxuan' },
            { name: '东方财富', url: 'https://www.eastmoney.com/' },
            { name: '同花顺', url: 'https://www.10jqka.com.cn/' },
            { name: '财联社', url: 'https://www.cls.cn/' },
            { name: 'Yahoo Finance - NAVI', url: 'https://finance.yahoo.com/quote/NAVI/' },
            { name: '美联储官网', url: 'https://www.federalreserve.gov/' },
            { name: '劳工统计局', url: 'https://www.bls.gov/' },
            { name: 'Bloomberg', url: 'https://www.bloomberg.com/' },
            { name: 'Reuters', url: 'https://www.reuters.com/' },
            { name: '经济日历', url: 'https://www.investing.com/economic-calendar/' },
            { name: '恐慌贪婪指数', url: 'https://www.cnn.com/markets/fear-and-greed' },
            { name: 'CBOE 每日市场统计', url: 'https://www.cboe.com/us/options/market_statistics/daily/' },
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

      {/* 筛选弹窗 */}
      {showFilter && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', width: '90%', maxWidth: '400px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={20} /> 筛选数据分类
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              {[
                { key: 'us', title: '美股指数', icon: <TrendingUp size={16} /> },
                { key: 'cn', title: '中国A股', icon: <Globe size={16} /> },
                { key: 'hk', title: '港股指数', icon: <Globe2 size={16} /> },
                { key: 'global', title: 'G20全球股市', icon: <Globe size={16} /> },
                { key: 'commodity', title: '大宗商品', icon: <Box size={16} /> },
                { key: 'forex', title: '外汇债券', icon: <Repeat size={16} /> },
              ].map(cat => (
                <label key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '8px', borderRadius: '6px', background: filterCategories.has(cat.key) ? '#f0f9ff' : '#f9fafb' }}>
                  <input
                    type="checkbox"
                    checked={filterCategories.has(cat.key)}
                    onChange={() => toggleFilterCategory(cat.key)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '1rem', display: 'flex' }}>{cat.icon}</span>
                  <span style={{ fontSize: '0.9rem', color: '#374151' }}>{cat.title}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={resetFilter}
                style={{ padding: '8px 16px', background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                重置
              </button>
              <button onClick={() => setShowFilter(false)}
                style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 云端设置弹窗 */}
      {showSettings && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', width: '90%', maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cloud size={20} /> 云端同步设置
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '16px' }}>
              使用 GitHub Gist 免费存储数据，实现跨设备同步
              <br />
              <span style={{ color: '#3b82f6', fontWeight: '500' }}>💡 提示：未配置时会自动使用默认公共数据源</span>
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
                <strong>推荐：Classic Token</strong>
                <br />
                GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic)
                <br />
                权限：勾选 <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: '3px' }}>gist</code>
                <br /><br />
                <strong>Fine-grained Token（如遇到权限错误）：</strong>
                <br />
                1. 资源范围：选择 <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: '3px' }}>All repositories</code> 或 <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: '3px' }}>Only select repositories</code>
                <br />
                2. 权限：在 Repository permissions 下找到 <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: '3px' }}>Gists</code>，设置为 <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: '3px' }}>Read and write</code>
              </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '6px' }}>
                Gist ID（可选，跨设备同步时需要）
              </label>
              <input
                type="text"
                value={gistIdInput}
                onChange={e => setGistIdInput(e.target.value)}
                placeholder="如果已在电脑上上传过，请输入 Gist ID"
                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }}
              />
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '6px' }}>
                提示：在电脑上上传一次数据后，Gist ID 会自动保存。如果要在手机上同步，可以：
                <br />
                1. 在电脑上查看 Gist ID（上传成功后会显示）
                <br />
                2. 或者先上传一次，系统会自动创建并保存
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowSettings(false); setGistTokenInput(getGistToken() || ''); setGistIdInput(getGistId() || '') }}
                style={{ padding: '8px 16px', background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                取消
              </button>
              <button onClick={handleSaveGistToken}
                style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
                保存
              </button>
            </div>
            {getGistToken() ? (
              <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', borderRadius: '6px', fontSize: '0.85rem', color: '#166534' }}>
                ✅ 已配置云端同步，数据会自动保存到你的 GitHub Gist
              </div>
            ) : (
              <div style={{ marginTop: '16px', padding: '12px', background: '#eff6ff', borderRadius: '6px', fontSize: '0.85rem', color: '#1e40af' }}>
                ℹ️ 未配置时，下载功能会使用默认公共数据源（无需 Token）
                <br />
                配置 Token 后，可以上传和同步你自己的数据
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
