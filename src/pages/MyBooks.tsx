import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen } from 'lucide-react'

const BOOKS = [
  {
    id: 'slow-is-fast',
    title: '正念投资：普通人用规则代替盯盘的投资方法',
    description: '不盯盘、不预测：从资产配置到公司研究，找到适合自己的投资方法，让投资服务生活。',
    path: '/first-book/slow-is-fast',
  },
]

export default function MyBooks(): JSX.Element {
  return (
    <main className="container" style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px 16px' }}>
      <h1 style={{ margin: '0 0 24px', fontSize: '1.7rem' }}>我的书</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '24px' }}>
        {BOOKS.map(book => (
          <Link
            key={book.id}
            to={book.path}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '32px', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', border: '1px solid rgba(255,255,255,0.7)', textDecoration: 'none', color: 'inherit' }}
          >
            <BookOpen size={32} color="var(--system-blue, #007aff)" />
            <h2 style={{ margin: 0, fontSize: '1.3rem', lineHeight: 1.5 }}>{book.title}</h2>
            <p style={{ margin: 0, color: '#6e6e73', lineHeight: 1.8 }}>{book.description}</p>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--system-blue, #007aff)', marginTop: 'auto' }}>
              查看本书 <ArrowRight size={16} />
            </span>
          </Link>
        ))}
      </div>
    </main>
  )
}
