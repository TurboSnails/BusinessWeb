import React, { useEffect, useState } from 'react'
import { PageTabs, PageTitle } from '../components/ui/PageTabs'
import { fetchMarketDataByType, fetchSectorCategories, fetchUSSectorCategories } from '../services/api'
import type { DailyReview, MarketCategory, SectorCategory, NewsSource } from '../types'
import { loadReviews, saveReviews, loadNewsSources, saveNewsSources, loadTombstones, saveTombstones } from '../utils/storage'
import { loadSyncConfig, saveSyncConfig, clearSyncConfig, syncReviews, normalizeReview } from '../features/pulse/cloudSync'
import { validReviewItem } from '../features/pulse/validation'
import { getWeekday, getToday } from '../utils/date'
import { ReviewTable } from '../components/pulse/ReviewTable'
import { NewsSourceSection } from '../components/pulse/NewsSourceSection'
import { MarketCategory as MarketCategoryComponent } from '../components/pulse/MarketCategory'
import { SectorSection } from '../components/pulse/SectorSection'
import HeatmapSection from '../components/pulse/HeatmapSection'
import { Card, Dialog, EmptyState, Field, Page } from '../components/ui'
import {
  TrendingUp,
  Globe,
  Globe2,
  Box,
  Repeat,
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

// 复盘录入表单的字段（顺序即表单顺序）
const REVIEW_FIELDS: { key: keyof DailyReview; label: string; type: 'date' | 'number' | 'text'; placeholder?: string; wide?: boolean }[] = [
  { key: 'date', label: '日期', type: 'date' },
  { key: 'ztCount', label: '涨停板数', type: 'number' },
  { key: 'ztSealRate', label: '涨停封板率', type: 'text', placeholder: '如 75%' },
  { key: 'ztOpen', label: '涨停打开数', type: 'number' },
  { key: 'dtCount', label: '跌停板数', type: 'number' },
  { key: 'dtSealRate', label: '跌停封板率', type: 'text', placeholder: '如 50%' },
  { key: 'dtOpen', label: '跌停打开数', type: 'number' },
  { key: 'volume', label: '量能（亿）', type: 'number' },
  { key: 'upDown', label: '涨-跌', type: 'text', placeholder: '如 3982-1060' },
  { key: 'shszcy', label: '沪深创', type: 'text', placeholder: '如 +++' },
  { key: 'lbRate', label: '连板晋级率', type: 'text', placeholder: '如 58%' },
  { key: 'lbCount', label: '连板数量', type: 'number' },
  { key: 'maxBoard', label: '最高板', type: 'number' },
  { key: 'top5Amount', label: '成交金额前五', type: 'number' },
  { key: 'top5Turnover', label: '换手率前五', type: 'number' },
  { key: 'inflow', label: '流入板块', type: 'text', placeholder: '如 航天、消费电子', wide: true },
  { key: 'outflow', label: '流出板块', type: 'text', placeholder: '如 医疗、光模块', wide: true },
]

export default function Pulse(): JSX.Element {
  const [activeTab, setActiveTab] = useState<'market' | 'analysis'>('market')
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
  const [syncConfig, setSyncConfig] = useState(() => loadSyncConfig())
  const [endpointInput, setEndpointInput] = useState(() => loadSyncConfig()?.endpoint ?? (window.location.protocol === 'https:' && !window.location.hostname.endsWith('github.io') ? `${window.location.origin}/api/pulse-sync` : ''))
  const [tokenInput, setTokenInput] = useState('')
  const [syncing, setSyncing] = useState(false)

  // 筛选状态
  const [showFilter, setShowFilter] = useState(false)
  const [filterCategories, setFilterCategories] = useState<Set<string>>(new Set(['us', 'cn', 'hk', 'global', 'commodity', 'forex']))

  useEffect(() => {
    // 加载本地数据
    setReviews(loadReviews())
    setNewsSources(loadNewsSources())
    // 复盘不再使用 GitHub Gist：清理旧版遗留的 token，避免长期留在浏览器里
    try { localStorage.removeItem('pulse_gist_token'); localStorage.removeItem('pulse_gist_id') } catch { /* 忽略 */ }
    let mounted = true
    const fetchAllData = async () => {
      setLoading(true)
      const categoryConfig = [
        { key: 'us', title: '美股指数', icon: <TrendingUp size={18} />, color: 'var(--accent)', bgColor: 'var(--accent-soft)' },
        { key: 'cn', title: '中国A股', icon: <Globe size={18} />, color: 'var(--system-red)', bgColor: 'var(--system-red-light)' },
        { key: 'hk', title: '港股指数', icon: <Globe2 size={18} />, color: 'var(--system-green)', bgColor: 'var(--system-green-light)' },
        { key: 'global', title: 'G20全球股市', icon: <Globe size={18} />, color: 'var(--accent)', bgColor: 'var(--accent-soft)' },
        { key: 'commodity', title: '大宗商品', icon: <Box size={18} />, color: 'var(--accent-warm)', bgColor: 'var(--accent-warm-soft)' },
        { key: 'forex', title: '外汇债券', icon: <Repeat size={18} />, color: 'var(--system-purple)', bgColor: 'var(--bg-secondary)' },
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
      updatedAt: new Date().toISOString(),
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
    saveTombstones(loadTombstones().filter(t => t.date !== newReview.date)) // 重新录入同一天：撤销该日墓碑
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
    if (confirm(`确定删除 ${date} 的复盘数据吗？\n\n如已开启云同步，下次同步时会从云端一并删除（云端保留最近 30 个历史版本可找回）。`)) {
      const newReviews = reviews.filter(r => r.date !== date)
      setReviews(newReviews)
      saveReviews(newReviews)
      saveTombstones([...loadTombstones().filter(t => t.date !== date), { date, deleted: true, updatedAt: new Date().toISOString() }])
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

          if (!data || !Array.isArray(data.reviews)) throw new Error('缺少 reviews 数组')
          const now = new Date().toISOString()
          const incoming = (data.reviews as DailyReview[]).map(r => normalizeReview({ ...r, updatedAt: now }))
          const bad = incoming.find(r => !validReviewItem(r))
          if (bad) {
            alert(`导入失败：${String((bad as { date?: unknown }).date)} 的数据不合规（日期/数值/长度），未做任何修改`)
            return
          }
          if (!confirm(`将导入 ${incoming.length} 条复盘，按日期合并（同日期以导入为准，其余本地数据保留）。继续吗？`)) return
          const byDate = new Map(reviews.map(r => [r.date, r]))
          incoming.forEach(r => byDate.set(r.date, r))
          const next = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
          setReviews(next)
          saveReviews(next)
          saveTombstones(loadTombstones().filter(t => !incoming.some(r => r.date === t.date)))

          alert('数据导入成功！已按日期合并')
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

  // 保存同步配置（token 仅存本机；保存前确认目标域名）
  const handleSaveSyncConfig = async () => {
    try {
      const saved = await saveSyncConfig({ endpoint: endpointInput.trim(), token: tokenInput.trim() || syncConfig?.token || '' }, domain => window.confirm(
        `即将保存复盘同步目标：${domain}\n只填写你自己部署的服务；确认前不会发出网络请求。继续吗？`))
      if (!saved) { alert('配置未保存：地址必须是 HTTPS，token 至少 32 个字符'); return }
      setSyncConfig(loadSyncConfig()); setTokenInput(''); setShowSettings(false)
      alert('已保存到本机。点击「同步」才会连接云端。')
    } catch { alert('配置保存失败') }
  }

  const handleClearSyncConfig = () => {
    if (!confirm('清除本机保存的同步地址和 token？（不会删除任何复盘数据）')) return
    clearSyncConfig(); setSyncConfig(null); setTokenInput(''); setShowSettings(false)
  }

  // 同步：先读云端 → 合并 → 删除/覆盖需确认 → 带版本号写回
  const handleSync = async () => {
    setSyncing(true)
    const result = await syncReviews(syncConfig, {
      target: (domain, count) => confirm(`即将连接 ${domain} 同步 ${count} 条本地复盘。确认这是你自己部署的服务后继续。`),
      changes: summary => confirm(`本次同步会修改云端：\n新增 ${summary.added.length} 条，覆盖更新 ${summary.updated.length} 条，删除 ${summary.deleted.length} 条${summary.deleted.length ? `\n将删除：${summary.deleted.slice(0, 10).join('、')}${summary.deleted.length > 10 ? '…' : ''}` : ''}\n\n云端会保留最近 30 个历史版本。确认继续？`),
      shrink: () => confirm('云端有效记录将减少超过一半，服务端已拦截。确认这是你想要的删除吗？'),
    })
    setSyncing(false)
    if (result.status === 'synced' && result.reviews) {
      setReviews(result.reviews)
      const sm = result.summary
      alert(`✅ 同步完成：共 ${result.reviews.length} 条${sm ? `\n云端新增 ${sm.added.length}、更新 ${sm.updated.length}、删除 ${sm.deleted.length}；本地更新 ${sm.pulled}` : ''}\n\n同步前的本地数据已留一份备份。`)
    } else if (result.status === 'cancelled') {
      alert('已取消，没有修改云端。')
    } else {
      alert(`❌ 同步未完成：${result.error ?? (result.status === 'not-configured' ? '请先在「云端设置」填写同步地址和 token' : '未知错误')}\n\n本地数据未被改动。`)
    }
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
  const closeForm = () => { setShowForm(false); setFormData({}); setEditDate('') }
  const renderForm = () => (
    <Dialog open={showForm} onClose={closeForm} title={`${editDate ? '编辑' : '录入'}复盘数据`}
      actions={<>
        <button type="button" className="tool-btn" onClick={closeForm}>取消</button>
        <button type="button" className="tool-btn tool-btn--primary" onClick={handleSaveReview}>保存</button>
      </>}>
      <div className="ui-form-grid">
        {REVIEW_FIELDS.map(f => (
          <Field key={f.key} label={f.label} wide={f.wide}>
            <input type={f.type} placeholder={f.placeholder} value={(formData[f.key] as string | number | undefined) || ''}
              onChange={e => setFormData({ ...formData, [f.key]: f.type === 'number' ? +e.target.value : e.target.value })} />
          </Field>
        ))}
      </div>
    </Dialog>
  )

  return (
    <Page>
      <PageTitle>全球行情</PageTitle>
      <PageTabs label="全球行情视图" value={activeTab} onChange={setActiveTab} items={[
        { id: 'market', label: '市场热力图' },
        { id: 'analysis', label: '每日分析' },
      ]} />
      <div role="tabpanel" aria-label="市场热力图" hidden={activeTab !== 'market'}>
        <HeatmapSection />
      </div>

      <div role="tabpanel" aria-label="每日分析" hidden={activeTab !== 'analysis'}>
        <div className="page-toolbar">
          <span className="page-toolbar__note">{timestamp ? `更新于 ${timestamp}` : '--'}</span>
          {syncConfig && <button className="tool-btn" onClick={handleSync} disabled={syncing}>{syncing ? '⏳ 同步中' : '☁️ 同步'}</button>}
          <button className="tool-btn" onClick={() => setShowSettings(true)}>⚙️ {syncConfig ? '已配置' : '云端设置'}</button>
          <button className="tool-btn" onClick={() => setShowFilter(true)}>🔍 筛选</button>
          <button className="tool-btn tool-btn--primary" onClick={handleRefresh} disabled={loading}>{loading ? '⏳ 加载' : '🔄 刷新'}</button>
        </div>
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
        <EmptyState title="数据加载中…" />
      ) : categories.length === 0 ? (
        <EmptyState title="暂无数据">请检查网络连接或刷新页面</EmptyState>
      ) : (
        categories
          .filter(category => filterCategories.has(category.key))
          .map(category => {
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
      <Card title="常用资源" icon={<LinkIcon size={16} />} className="pulse-resources">
        <div className="ui-link-chips">
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
            <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer">{link.name}</a>
          ))}
        </div>
      </Card>
      </div>

      {/* 录入表单弹窗 */}
      {renderForm()}

      {/* 筛选弹窗 */}
      <Dialog open={showFilter} onClose={() => setShowFilter(false)} title="筛选数据分类" icon={<Search size={20} />} size="sm"
        actions={<>
          <button type="button" className="tool-btn" onClick={resetFilter}>重置</button>
          <button type="button" className="tool-btn tool-btn--primary" onClick={() => setShowFilter(false)}>确定</button>
        </>}>
        <div className="ui-check-list">
          {[
            { key: 'us', title: '美股指数', icon: <TrendingUp size={16} /> },
            { key: 'cn', title: '中国A股', icon: <Globe size={16} /> },
            { key: 'hk', title: '港股指数', icon: <Globe2 size={16} /> },
            { key: 'global', title: 'G20全球股市', icon: <Globe size={16} /> },
            { key: 'commodity', title: '大宗商品', icon: <Box size={16} /> },
            { key: 'forex', title: '外汇债券', icon: <Repeat size={16} /> },
          ].map(cat => (
            <label key={cat.key} className={filterCategories.has(cat.key) ? 'ui-check is-on' : 'ui-check'}>
              <input type="checkbox" checked={filterCategories.has(cat.key)} onChange={() => toggleFilterCategory(cat.key)} />
              {cat.icon}
              <span>{cat.title}</span>
            </label>
          ))}
        </div>
      </Dialog>

      {/* 云端设置弹窗 */}
      <Dialog open={showSettings} onClose={() => { setShowSettings(false); setTokenInput('') }} title="复盘云同步（Supabase）" icon={<Cloud size={20} />}
        actions={<>
          {syncConfig && <button type="button" className="tool-btn tool-btn--danger" onClick={handleClearSyncConfig}>清除配置</button>}
          <button type="button" className="tool-btn" onClick={() => { setShowSettings(false); setTokenInput('') }}>取消</button>
          <button type="button" className="tool-btn tool-btn--primary" onClick={() => void handleSaveSyncConfig()} disabled={!tokenInput.trim() && !syncConfig}>保存</button>
        </>}>
        <div className="ui-stack">
          <p className="pulse-dialog-text">
            复盘默认只存在本机。开启后通过你自己部署的接口同步到你自己的 Supabase 数据库：同步前先读取云端并合并，
            删除/覆盖需确认，云端保留最近 30 个历史版本。token 仅保存在本机浏览器，请勿在公共电脑使用。
          </p>
          <Field label="同步接口地址（HTTPS）">
            <input type="url" value={endpointInput} onChange={e => setEndpointInput(e.target.value)} placeholder="https://你的站点/api/pulse-sync" autoComplete="url" />
          </Field>
          <Field label={`专用 Token（至少 32 位，对应 Vercel 变量 PULSE_SYNC_TOKEN）${syncConfig ? '——已保存，留空表示不修改' : ''}`}
            hint="接口只允许同源调用：请在部署了该接口的站点（如 Vercel 站点）上同步；GitHub Pages 版本没有后端，不能同步。">
            <input type="password" value={tokenInput} onChange={e => setTokenInput(e.target.value)} placeholder={syncConfig ? '••••••••（已保存）' : '粘贴 token'} autoComplete="new-password" />
          </Field>
        </div>
      </Dialog>
    </Page>
  )
}
