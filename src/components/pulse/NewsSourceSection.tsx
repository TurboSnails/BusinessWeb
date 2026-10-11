import React, { useState } from 'react'
import type { NewsSource } from '../../types'
import { Newspaper, Database, MessageSquare, Link, Zap, Flame, Pin, RadioTower } from 'lucide-react'
import { Card, Dialog, EmptyState, Field } from '../ui'
import '../../styles/pulse.css'

const EMPTY_FORM: Partial<NewsSource> = { name: '', url: '', category: 'news', priority: 'medium', description: '', icon: '🔗', enabled: true }

const CATEGORY_ICON: Record<NewsSource['category'], JSX.Element> = {
  official: <RadioTower size={10} aria-hidden="true" />,
  news: <Newspaper size={10} aria-hidden="true" />,
  data: <Database size={10} aria-hidden="true" />,
  social: <MessageSquare size={10} aria-hidden="true" />,
  other: <Link size={10} aria-hidden="true" />,
}

const PRIORITY_ICON: Record<NewsSource['priority'], JSX.Element> = {
  high: <Flame size={10} aria-hidden="true" />,
  medium: <Zap size={10} aria-hidden="true" />,
  low: <Pin size={10} aria-hidden="true" />,
}

interface NewsSourceSectionProps {
  sources: NewsSource[]
  onUpdate: (sources: NewsSource[]) => void
}

export const NewsSourceSection: React.FC<NewsSourceSectionProps> = ({ sources, onUpdate }) => {
  const [showForm, setShowForm] = useState(false)
  const [editingSource, setEditingSource] = useState<NewsSource | null>(null)
  const [formData, setFormData] = useState<Partial<NewsSource>>(EMPTY_FORM)

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
    setFormData(EMPTY_FORM)
  }

  const closeForm = () => { setShowForm(false); setEditingSource(null); setFormData(EMPTY_FORM) }

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
    <Card
      className="pulse-sources"
      title={<>📡 重要消息源 <span className="pulse-muted">快速访问常用资讯源</span></>}
      actions={<button type="button" className="tool-btn tool-btn--primary" onClick={() => { setShowForm(true); setEditingSource(null); setFormData(EMPTY_FORM) }}>+ 添加消息源</button>}
    >
      {enabledSources.length > 0 && (
        <div className="news-grid">
          {enabledSources.map(source => (
            <div key={source.id} className={`news-card is-${source.priority}`}>
              <div className="news-card__name">
                <Link size={14} aria-hidden="true" />
                <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a>
              </div>
              <div className="news-card__desc">{source.description || categoryLabels[source.category]}</div>
              <div className="news-card__tags">
                <span className="news-tag">{CATEGORY_ICON[source.category]}{categoryLabels[source.category]}</span>
                <span className={`news-tag is-${source.priority}`}>{PRIORITY_ICON[source.priority]}{priorityLabels[source.priority]}</span>
              </div>
              <div className="news-card__actions">
                <button type="button" className="tool-btn" onClick={() => handleEdit(source)}>编辑</button>
                <button type="button" className="tool-btn" onClick={() => handleToggle(source.id)}>禁用</button>
                <button type="button" className="tool-btn tool-btn--danger" onClick={() => handleDelete(source.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {disabledSources.length > 0 && (
        <details className="news-disabled">
          <summary>已禁用的消息源 ({disabledSources.length})</summary>
          <div className="news-grid">
            {disabledSources.map(source => (
              <div key={source.id} className="news-card is-disabled">
                <div className="news-card__name">
                  <span aria-hidden="true">{source.icon || '🔗'}</span>
                  <span>{source.name}</span>
                </div>
                <div className="news-card__actions">
                  <button type="button" className="tool-btn" onClick={() => handleToggle(source.id)}>启用</button>
                  <button type="button" className="tool-btn tool-btn--danger" onClick={() => handleDelete(source.id)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {sources.length === 0 && <EmptyState title="暂无消息源">点击「添加消息源」开始管理</EmptyState>}

      <Dialog open={showForm} onClose={closeForm} title={editingSource ? '编辑消息源' : '添加消息源'}
        actions={<>
          <button type="button" className="tool-btn" onClick={closeForm}>取消</button>
          <button type="button" className="tool-btn tool-btn--primary" onClick={handleSave}>保存</button>
        </>}>
        <div className="ui-form-grid">
          <Field label="名称 *" wide>
            <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="如：Bloomberg" />
          </Field>
          <Field label="网址 *" wide>
            <input type="url" value={formData.url || ''} onChange={e => setFormData({ ...formData, url: e.target.value })} placeholder="https://..." />
          </Field>
          <Field label="分类">
            <select value={formData.category || 'news'} onChange={e => setFormData({ ...formData, category: e.target.value as NewsSource['category'] })}>
              <option value="official">官方数据</option>
              <option value="news">财经新闻</option>
              <option value="data">数据平台</option>
              <option value="social">社交媒体</option>
              <option value="other">其他</option>
            </select>
          </Field>
          <Field label="优先级">
            <select value={formData.priority || 'medium'} onChange={e => setFormData({ ...formData, priority: e.target.value as NewsSource['priority'] })}>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </Field>
          <Field label="图标（可选）">
            <input type="text" value={formData.icon || '🔗'} onChange={e => setFormData({ ...formData, icon: e.target.value })} placeholder="🔗" />
          </Field>
          <Field label="描述（可选）">
            <input type="text" value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="简要描述这个消息源" />
          </Field>
        </div>
      </Dialog>
    </Card>
  )
}
