import React, { useState } from 'react'
import type { NewsSource } from '../../types'
import {
  Radio,
  Newspaper,
  Database,
  MessageSquare,
  Link,
  Zap,
  Flame,
  Pin,
  Plus,
  RadioTower,
  ShieldAlert,
  Edit2,
  Trash2,
  EyeOff,
  Eye
} from 'lucide-react'

interface NewsSourceSectionProps {
  sources: NewsSource[]
  onUpdate: (sources: NewsSource[]) => void
}

export const NewsSourceSection: React.FC<NewsSourceSectionProps> = ({ sources, onUpdate }) => {
  const [showForm, setShowForm] = useState(false)
  const [editingSource, setEditingSource] = useState<NewsSource | null>(null)
  const [formData, setFormData] = useState<Partial<NewsSource>>({
    name: '',
    url: '',
    category: 'news',
    priority: 'medium',
    description: '',
    icon: '🔗',
    enabled: true
  })

  const categoryLabels: Record<NewsSource['category'], string> = {
    official: '官方数据',
    news: '财经新闻',
    data: '数据平台',
    social: '社交媒体',
    other: '其他'
  }

  const priorityLabels: Record<NewsSource['priority'], string> = {
    high: '高',
    medium: '中',
    low: '低'
  }

  const handleSave = () => {
    if (!formData.name || !formData.url) {
      alert('请填写名称和网址')
      return
    }

    const newSource: NewsSource = {
      id: editingSource?.id || Date.now().toString(),
      name: formData.name!,
      url: formData.url!,
      category: formData.category || 'news',
      priority: formData.priority || 'medium',
      description: formData.description,
      icon: formData.icon || '🔗',
      enabled: formData.enabled !== undefined ? formData.enabled : true
    }

    let newSources: NewsSource[]
    if (editingSource) {
      newSources = sources.map(s => s.id === editingSource.id ? newSource : s)
    } else {
      newSources = [...sources, newSource]
    }

    onUpdate(newSources)
    setShowForm(false)
    setEditingSource(null)
    setFormData({ name: '', url: '', category: 'news', priority: 'medium', description: '', icon: '🔗', enabled: true })
  }

  const handleEdit = (source: NewsSource) => {
    setEditingSource(source)
    setFormData(source)
    setShowForm(true)
  }

  const handleDelete = (id: string) => {
    if (confirm('确定删除这个消息源吗？')) {
      onUpdate(sources.filter(s => s.id !== id))
    }
  }

  const handleToggle = (id: string) => {
    onUpdate(sources.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s))
  }

  const enabledSources = sources.filter(s => s.enabled)
  const disabledSources = sources.filter(s => !s.enabled)

  return (
    <div style={{ marginBottom: '24px', padding: '16px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
          📡 重要消息源 <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 'normal' }}>快速访问常用资讯源</span>
        </h3>
        <button onClick={() => { setShowForm(true); setEditingSource(null); setFormData({ name: '', url: '', category: 'news', priority: 'medium', description: '', icon: '🔗', enabled: true }) }}
          style={{
            padding: '6px 12px', background: '#3b82f6', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500'
          }}>+ 添加消息源</button>
      </div>

      {/* 启用的消息源 */}
      {enabledSources.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '10px'
          }}>
            {enabledSources.map(source => (
              <div
                key={source.id}
                style={{
                  border: `2px solid ${source.priority === 'high' ? '#ef4444' : source.priority === 'medium' ? '#f59e0b' : '#6b7280'}`,
                  background: source.priority === 'high' ? '#fef2f2' : source.priority === 'medium' ? '#fffbeb' : '#f9fafb',
                  borderRadius: '6px',
                  padding: '8px',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                      <Link size={14} />
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          color: '#1f2937',
                          textDecoration: 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                      >
                        {source.name}
                      </a>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {source.description || categoryLabels[source.category]}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        fontSize: '0.65rem',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: '#f3f4f6',
                        color: '#6b7280',
                        border: '1px solid #e5e7eb'
                      }}>
                        {source.category === 'official' && <RadioTower size={10} />}
                        {source.category === 'news' && <Newspaper size={10} />}
                        {source.category === 'data' && <Database size={10} />}
                        {source.category === 'social' && <MessageSquare size={10} />}
                        {source.category === 'other' && <Link size={10} />}
                        {categoryLabels[source.category]}
                      </span>
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        fontSize: '0.65rem',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: source.priority === 'high' ? '#fee2e2' : source.priority === 'medium' ? '#fef3c7' : '#f3f4f6',
                        color: source.priority === 'high' ? '#dc2626' : source.priority === 'medium' ? '#d97706' : '#6b7280',
                        border: `1px solid ${source.priority === 'high' ? '#fecaca' : source.priority === 'medium' ? '#fde68a' : '#e5e7eb'}`
                      }}>
                        {source.priority === 'high' && <Flame size={10} />}
                        {source.priority === 'medium' && <Zap size={10} />}
                        {source.priority === 'low' && <Pin size={10} />}
                        {priorityLabels[source.priority]}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #e5e7eb' }}>
                  <button
                    onClick={() => handleEdit(source)}
                    style={{
                      flex: 1,
                      padding: '3px 6px',
                      background: '#eff6ff',
                      color: '#2563eb',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.7rem'
                    }}
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleToggle(source.id)}
                    style={{
                      flex: 1,
                      padding: '3px 6px',
                      background: '#f0fdf4',
                      color: '#16a34a',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.7rem'
                    }}
                  >
                    禁用
                  </button>
                  <button
                    onClick={() => handleDelete(source.id)}
                    style={{
                      padding: '3px 6px',
                      background: '#fee2e2',
                      color: '#dc2626',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.7rem'
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 禁用的消息源 */}
      {disabledSources.length > 0 && (
        <details style={{ marginTop: '16px' }}>
          <summary style={{
            fontSize: '0.85rem',
            color: '#9ca3af',
            cursor: 'pointer',
            padding: '8px',
            background: '#f9fafb',
            borderRadius: '6px'
          }}>
            已禁用的消息源 ({disabledSources.length})
          </summary>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
            marginTop: '12px'
          }}>
            {disabledSources.map(source => (
              <div
                key={source.id}
                style={{
                  border: '1px solid #e5e7eb',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  padding: '12px',
                  opacity: 0.6
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '1rem' }}>{source.icon || '🔗'}</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: '500', color: '#6b7280' }}>
                    {source.name}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <button
                    onClick={() => handleToggle(source.id)}
                    style={{
                      padding: '4px 8px',
                      background: '#f0fdf4',
                      color: '#16a34a',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.75rem'
                    }}
                  >
                    启用
                  </button>
                  <button
                    onClick={() => handleDelete(source.id)}
                    style={{
                      padding: '4px 8px',
                      background: '#fee2e2',
                      color: '#dc2626',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.75rem'
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {sources.length === 0 && (
        <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>
          暂无消息源，点击"添加消息源"开始管理
        </div>
      )}

      {/* 添加/编辑表单 */}
      {showForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            width: '90%',
            maxWidth: '500px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>
              {editingSource ? '编辑消息源' : '添加消息源'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#64748b' }}>名称 *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="如：Bloomberg"
                  style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#64748b' }}>网址 *</label>
                <input
                  type="url"
                  value={formData.url || ''}
                  onChange={e => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://..."
                  style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#64748b' }}>分类</label>
                  <select
                    value={formData.category || 'news'}
                    onChange={e => setFormData({ ...formData, category: e.target.value as NewsSource['category'] })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }}
                  >
                    <option value="official">官方数据</option>
                    <option value="news">财经新闻</option>
                    <option value="data">数据平台</option>
                    <option value="social">社交媒体</option>
                    <option value="other">其他</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#64748b' }}>优先级</label>
                  <select
                    value={formData.priority || 'medium'}
                    onChange={e => setFormData({ ...formData, priority: e.target.value as NewsSource['priority'] })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }}
                  >
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#64748b' }}>图标（可选）</label>
                <input
                  type="text"
                  value={formData.icon || '🔗'}
                  onChange={e => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="🔗"
                  style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#64748b' }}>描述（可选）</label>
                <input
                  type="text"
                  value={formData.description || ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="简要描述这个消息源"
                  style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowForm(false); setEditingSource(null); setFormData({ name: '', url: '', category: 'news', priority: 'medium', description: '', icon: '🔗', enabled: true }) }}
                style={{ padding: '8px 16px', background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

