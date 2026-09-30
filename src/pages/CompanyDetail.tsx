import React, { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'
import { findCompany, Market } from '../data/companies'
import { toneOf, Tone } from '../data/notionNotes'

const toneColors: Record<Tone, { bg: string; color: string }> = {
  green: { bg: 'rgba(52,199,89,0.12)', color: 'var(--system-green)' },
  blue: { bg: 'rgba(0,122,255,0.10)', color: 'var(--system-blue)' },
  orange: { bg: 'rgba(255,149,0,0.12)', color: 'var(--system-orange)' },
  red: { bg: 'rgba(255,59,48,0.12)', color: 'var(--system-red)' },
  gray: { bg: 'var(--bg-secondary)', color: 'var(--text-secondary)' },
}

export default function CompanyDetail(): JSX.Element {
  const { market, code } = useParams()
  const navigate = useNavigate()
  const company = findCompany((market === 'cn' ? 'cn' : 'us') as Market, decodeURIComponent(code || ''))

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [market, code])

  const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid rgba(255,255,255,0.7)',
    borderRadius: 'var(--radius-lg)',
    padding: '24px 28px',
    marginBottom: '16px',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    boxShadow: 'var(--shadow-md)',
  }
  const sectionTitle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }
  const cardTitle: React.CSSProperties = { fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }

  const row = (text: string, accent: string, key: number, warn = false): JSX.Element => (
    <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
      {warn
        ? <AlertTriangle size={16} color={accent} style={{ flexShrink: 0, marginTop: '3px' }} />
        : <CheckCircle2 size={16} color={accent} style={{ flexShrink: 0, marginTop: '3px' }} />}
      <span>{text}</span>
    </div>
  )

  const back = (
    <Link
      to={`/research-notes?tab=category&m=${market === 'cn' ? 'cn' : 'us'}`}
      onClick={e => {
        // 有站内历史就原路返回（保留页签、市场、板块和滚动位置）
        if (window.history.state && window.history.state.idx > 0) {
          e.preventDefault()
          navigate(-1)
        }
      }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.9)', textDecoration: 'none', fontSize: '13px', marginBottom: '14px' }}
    >
      <ArrowLeft size={14} /> 返回研究笔记
    </Link>
  )

  if (!company) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '40px 20px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <Link to="/research-notes" style={{ color: 'var(--system-blue)', textDecoration: 'none', fontSize: '14px' }}>← 返回研究笔记</Link>
          <div style={{ ...card, marginTop: '16px' }}>
            <h3 style={cardTitle}>未找到该公司</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>该公司还没有整理进研究笔记。</p>
          </div>
        </div>
      </div>
    )
  }

  const tone = toneOf(company.rating)
  const gradient = company.market === 'us'
    ? 'linear-gradient(135deg, #5856D6 0%, #007AFF 100%)'
    : 'linear-gradient(135deg, #FF9500 0%, #FF3B30 100%)'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', paddingBottom: '80px' }}>
      {/* 页面头部 */}
      <div style={{ background: gradient, padding: '32px 24px 28px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          {back}
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>{company.name}</h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', margin: '0 0 14px' }}>
            {company.market === 'us' ? '标普500' : '沪深'} · {company.code} · {company.sector} · {company.batch}
          </p>
          <span style={{ display: 'inline-block', fontSize: '13px', fontWeight: 600, padding: '4px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.9)', color: toneColors[tone].color }}>
            {company.rating}
          </span>
        </div>
      </div>

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '28px 20px' }}>
        <div style={{ ...card, border: '1.5px solid rgba(0,122,255,0.35)', background: 'rgba(0,122,255,0.04)' }}>
          <p style={{ fontSize: '15px', color: 'var(--text-primary)', margin: 0, lineHeight: 1.7, fontWeight: 500 }}>{company.headline}</p>
        </div>

        {company.metrics.length > 0 && (
          <>
            <p style={sectionTitle}>关键指标</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              {company.metrics.map(([label, value]) => (
                <div key={label} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '16px 18px', boxShadow: 'var(--shadow-sm)' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 6px' }}>{label}</p>
                  <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.4, wordBreak: 'break-word' }}>{value}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {company.thesis.length > 0 && (
          <div style={card}>
            <h3 style={cardTitle}>核心逻辑</h3>
            {company.thesis.map((t, i) => row(t, 'var(--system-green)', i))}
          </div>
        )}

        {company.risk.length > 0 && (
          <div style={card}>
            <h3 style={cardTitle}>风险与证伪</h3>
            {company.risk.map((t, i) => row(t, 'var(--system-orange)', i, true))}
          </div>
        )}

        {company.next.length > 0 && (
          <div style={card}>
            <h3 style={cardTitle}>后续验证 / 操作参考</h3>
            {company.next.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <ArrowRight size={16} color="var(--system-blue)" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span>{t}</span>
              </div>
            ))}
          </div>
        )}

        <div style={card}>
          <h3 style={cardTitle}>数据口径</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.7 }}>{company.asOf}</p>
          {company.url && (
            <a
              href={company.url}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--system-blue)', textDecoration: 'none' }}
            >
              <ExternalLink size={14} /> 在 Notion 查看完整研究页
            </a>
          )}
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
          内容整理自 Notion 个人研究笔记，仅为研究记录，不构成投资建议。情景价值与价位为研究假设，非目标价。
        </p>
      </div>
    </div>
  )
}
