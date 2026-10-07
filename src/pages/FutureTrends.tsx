import React, { useState } from 'react'
import { PageTabs, PageTitle } from '../components/ui/PageTabs'
import { FUTURE_TRENDS_ASOF, TRENDS, trendCoverage, TrendCompany } from '../data/futureTrends'

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-md)',
  padding: 20,
  marginBottom: 16,
}

function Companies({ title, list }: { title: string; list: TrendCompany[] }): JSX.Element {
  return (
    <div>
      <h4 style={{ margin: '0 0 6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{title}</h4>
      {list.length === 0 ? <p style={{ margin: 0, color: 'var(--system-gray)', fontSize: '0.85rem' }}>暂无</p> : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {list.map(c => (
            <li key={c.name + c.code} style={{ padding: '6px 0', borderTop: '1px solid var(--system-gray5)', lineHeight: 1.6, fontSize: '0.9rem' }}>
              <strong>{c.name}</strong>
              <span style={{ color: 'var(--text-secondary)', marginLeft: 6, fontSize: '0.8rem' }}>{c.code}</span>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{c.role}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}><strong>{c.exposure}</strong> · {c.evidence}</div>
              <div style={{ fontSize: '0.75rem' }}>{c.sourceUrl
                ? <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">{c.sourceTitle}</a>
                : <span style={{ color: 'var(--text-secondary)' }}>{c.sourceTitle}</span>}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Bullets({ title, items }: { title: string; items: string[] }): JSX.Element {
  return (
    <div style={{ flex: '1 1 280px' }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>{title}</h3>
      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, fontSize: '0.9rem' }}>
        {items.map(i => <li key={i}>{i}</li>)}
      </ul>
    </div>
  )
}

export default function FutureTrends(): JSX.Element {
  const [id, setId] = useState(TRENDS[0].id)
  const trend = TRENDS.find(t => t.id === id) ?? TRENDS[0]
  const coverage = trendCoverage()
  const selectedCoverage = trendCoverage([trend])
  return (
    <main>
      <PageTitle>未来趋势</PageTitle>
      <PageTabs label="未来趋势赛道" value={id} onChange={setId}
        items={TRENDS.map(t => ({ id: t.id, label: t.name.replace(/（.*?）/, '').replace(/，.*/, '') }))} />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px 32px' }}>
        <p role="note" style={{ margin: '0 0 12px', padding: '10px 14px', borderRadius: 10, background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.7 }}>
          整理于 {FUTURE_TRENDS_ASOF}。这里列的是产业链上的参与公司和它们做什么，不是买入清单，也没有目标价和收益预测。产业增长不等于公司盈利，更不等于股价回报（书第31章）；公司代码、上市状态和业务以交易所公告与定期报告为准，用前请自行核对。“已查阅”仅支持来源明确披露的事项，其他条目标为候选待核。代码不代表上市状态全部复核；同一公司会在不同环节出现。主题只放主动额度（第9章）。不构成投资建议。
        </p>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>九个赛道 · {coverage.segments} 个细分环节 · {coverage.companies} 个公司或主体 · {coverage.entries} 条业务关联（跨环节可重复）</p>
        <section style={card} aria-labelledby="trend-name">
          <h2 id="trend-name" style={{ margin: '0 0 6px', fontSize: '1.3rem' }}>{trend.name}</h2>
          <p style={{ margin: '0 0 10px', color: 'var(--text-secondary)' }}>{trend.oneLine}</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selectedCoverage.segments} 个环节 · {selectedCoverage.companies} 个公司或主体。直接业务、多元业务、研发验证、间接配套说明业务关联程度，不代表已核实收入占比或收益排名。</p>
          <p style={{ margin: '0 0 8px', lineHeight: 1.8 }}><strong>阶段：</strong>{trend.stage}</p>
          <p style={{ margin: 0, lineHeight: 1.8 }}><strong>谁受益：</strong>{trend.why}</p>
          <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--system-gray)' }}>对应书中：{trend.book}</p>
        </section>

        <nav aria-label="产业链环节索引" style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {trend.chain.map((l, index) => <a key={l.link} href={`#${trend.id}-chain-${index}`} style={{ fontSize: '0.85rem' }}>{l.link}</a>)}
        </nav>
        {trend.chain.map((l, index) => (
          <section key={l.link} id={`${trend.id}-chain-${index}`} style={card} aria-label={l.link}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem' }}>{l.link}</h3>
            <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7 }}>{l.desc}</p>
            <p style={{ fontSize: '0.85rem', lineHeight: 1.7 }}><strong>本环节验证：</strong>{l.verify}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 20 }}>
              <Companies title="中国（含港股、中概）" list={l.cn} />
              <Companies title="海外（美股、ADR 及其他市场）" list={l.us} />
            </div>
          </section>
        ))}

        <section style={{ ...card, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Bullets title="该查什么（验证指标）" items={trend.verify} />
          <Bullets title="主要风险" items={trend.risks} />
        </section>
      </div>
    </main>
  )
}
