import React from 'react'
import type { ImportantNews } from '../../types'
import { getToday } from '../../utils/date'

interface NewsSectionProps {
  newsList: ImportantNews[]
  onAdd: () => void
  onDelete: (id: string) => void
}

export const NewsSection: React.FC<NewsSectionProps> = ({ newsList, onAdd, onDelete }) => {
  const today = getToday()
  const todayNews = newsList.filter(n => n.date === today)
  const recentNews = newsList.slice(0, 10)

  return (
    <div style={{ marginBottom: '24px', padding: '16px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
          📰 每日重要消息 <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 'normal' }}>影响美股的关键事件</span>
        </h3>
        <button onClick={onAdd} style={{
          padding: '6px 12px', background: '#3b82f6', color: 'white', border: 'none',
          borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500'
        }}>+ 添加消息</button>
      </div>
      
      {todayNews.length > 0 && (
        <div style={{ marginBottom: '16px', padding: '12px', background: 'white', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
            今日消息 ({todayNews.length}条)
          </div>
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
                <button onClick={() => onDelete(news.id)} style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                  删除
                </button>
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
        <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>
          暂无消息，点击"添加消息"开始记录
        </div>
      )}
    </div>
  )
}

