import React, { useMemo, useState } from 'react'
import { byFundamentals, byInvestability, downloadJson, POOL, POOL_STATUS_ORDER, poolItemJson } from '../data/futureTrendsPool'
import type { PoolItem, PoolStatus } from '../data/futureTrendsPool'
import { SECTOR_PICKS_ASOF } from '../data/futureTrendsSectorPicks'

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-md)',
  padding: 20,
  marginBottom: 16,
}

const STATUS_COLOR: Record<PoolStatus, string> = {
  可现在投资: 'var(--system-green)',
  接近买点: 'var(--system-purple)',
  股价偏高: 'var(--system-orange)',
  基本面待验证: 'var(--system-gray)',
}

const STATUS_DESC: Record<PoolStatus, string> = {
  可现在投资: '现价在 2:1 买点 5% 以内，可按买入区分 3 批',
  接近买点: '还需回落 5–20%，或原赛道看好但赔率未认证',
  股价偏高: '离 2:1 买点超过 20%，或估值高到倍数模型不给买点：好公司，等价格',
  基本面待验证: '亏损、利润含一次性项或数据不足：先等盈利兑现',
}

function Badge({ status }: { status: PoolStatus }): JSX.Element {
  return (
    <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, color: '#fff', background: STATUS_COLOR[status], whiteSpace: 'nowrap' }}>
      {status}
    </span>
  )
}

function Toggle<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: T[]; onChange: (v: T) => void }): JSX.Element {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}：</span>
      {options.map(o => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}
          style={{ padding: '3px 10px', borderRadius: 999, border: '1px solid var(--system-gray4)', fontSize: '0.8rem', cursor: 'pointer',
            background: value === o ? 'var(--system-blue)' : 'transparent', color: value === o ? '#fff' : 'inherit' }}>
          {o}
        </button>
      ))}
    </div>
  )
}

const dl: React.CSSProperties = { fontFamily: 'inherit', fontSize: '0.8rem', padding: '6px 12px', border: '1px solid var(--border-primary)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer' }

type SortKey = '按可投资排序' | '按基本面排序'
type MarketKey = '全部' | '中国' | '海外'
type StatusKey = '全部状态' | PoolStatus

export default function FutureTrendsPool(): JSX.Element {
  const [sort, setSort] = useState<SortKey>('按可投资排序')
  const [market, setMarket] = useState<MarketKey>('全部')
  const [status, setStatus] = useState<StatusKey>('全部状态')

  const rows = useMemo(() => POOL
    .filter(x => market === '全部' || x.market === market)
    .filter(x => status === '全部状态' || x.status === status)
    .sort(sort === '按可投资排序' ? byInvestability : byFundamentals), [sort, market, status])

  const count = (s: PoolStatus, list: PoolItem[] = POOL): number => list.filter(x => x.status === s).length
  const topNames = (f: (x: PoolItem) => boolean, n = 10): string => [...POOL].filter(f).sort(byFundamentals).slice(0, n).map(x => x.pick.name).join('、')

  const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--system-gray5)'}
  const td: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top', borderBottom: '1px solid var(--system-gray5)', lineHeight: 1.6 }

  return (
    <>
      <section style={card} aria-labelledby="pool-title">
        <h2 id="pool-title" style={{ margin: '0 0 6px', fontSize: '1.3rem' }}>候选池：先看增长与确定性，再看能不能现在买</h2>
        <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          整理于 {SECTOR_PICKS_ASOF}。汇总九个赛道的全部上市公司（中国 {POOL.filter(x => x.market === '中国').length} 家、海外 {POOL.filter(x => x.market === '海外').length} 家，跨赛道按发行人去重）。
          第一步不看股价，只按基本面打分（满分 100）：增长 50 分 = 增长判断（高 25 / 中 15 / 低 5）+ 营收增速（0–60% 对应 0–15 分）+ 利润增速（−20%~50% 对应 −4~10 分）；
          确定性 50 分 = 技术壁垒（高 20 / 中 12 / 低 4）+ 已盈利 10 + 风险等级（低 15 / 中 8 / 高 0）− 利润含一次性项或处于周期高点 8 − 证据不足 10。
          A ≥ 75、B ≥ 60、C ≥ 45、其余为 D。第二步按各赛道的 2:1 买点标记投资状态。
          中国公司增速为 2026H1 累计同比，海外为最近一季同比，口径不同。打分是研究规则，不是预测；价位来自本站程序化倍数模型，未经公司级三情景认证，不构成个人投资建议。
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 10, margin: '0 0 12px' }}>
          {POOL_STATUS_ORDER.map(s => (
            <div key={s} style={{ border: '1px solid var(--system-gray5)', borderLeft: `4px solid ${STATUS_COLOR[s]}`, borderRadius: 8, padding: '8px 10px' }}>
              <div><Badge status={s} /> <strong style={{ marginLeft: 4 }}>{count(s)} 家</strong></div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>{STATUS_DESC[s]}</div>
            </div>
          ))}
        </div>
        <ul style={{ margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.8, fontSize: '0.9rem' }}>
          <li><strong>基本面 A 档且现在可投：</strong>{topNames(x => x.grade === 'A' && x.status === '可现在投资') || '无'}。</li>
          <li><strong>基本面 A 档、接近买点：</strong>{topNames(x => x.grade === 'A' && x.status === '接近买点') || '无'}。</li>
          <li><strong>基本面最好但股价偏高（等价格）：</strong>{topNames(x => x.grade === 'A' && x.status === '股价偏高', 15)}。</li>
          <li><strong>增长高但确定性低（先等验证）：</strong>{topNames(x => x.growthLevel === '高' && x.certaintyLevel === '低')}。</li>
        </ul>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Toggle label="排序" value={sort} options={['按可投资排序', '按基本面排序']} onChange={setSort} />
          <Toggle label="市场" value={market} options={['全部', '中国', '海外']} onChange={setMarket} />
          <Toggle label="状态" value={status} options={['全部状态', ...POOL_STATUS_ORDER]} onChange={setStatus} />
        </div>
      </section>

      <section style={card} aria-label="候选池列表">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', margin: '0 0 8px' }}>
          <span aria-live="polite" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            共 {rows.length} 家。{sort === '按可投资排序' ? '先按投资状态，再按基本面分排序。' : '只按基本面分（增长 + 确定性）排序，不看股价。'}
          </span>
          <button type="button" style={dl} disabled={!rows.length}
            onClick={() => downloadJson(`未来趋势候选池-${market}-${status}-${sort}-${SECTOR_PICKS_ASOF}.json`, rows.map(poolItemJson))}>
            下载当前筛选 JSON（{rows.length} 家）
          </button>
          <button type="button" style={dl}
            onClick={() => downloadJson(`未来趋势候选池-全部-${SECTOR_PICKS_ASOF}.json`, [...POOL].sort(byInvestability).map(poolItemJson))}>
            下载全部 JSON（{POOL.length} 家）
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 1400 }}>
            <thead><tr>{['#', '公司', '投资状态', '基本面', '增速 / 估值', '盈亏比', '买卖点位', '增长点', '技术壁垒', '风险'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((x, i) => {
                const p = x.pick; const l = x.level
                return (
                  <tr key={x.key}>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{i + 1}</td>
                    <td style={{ ...td, minWidth: 120 }}>
                      <strong>{p.name}</strong>
                      <div style={{ color: 'var(--text-secondary)' }}>{p.code} · {x.market}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{x.trends.join('、')}</div>
                      <div>现价 {p.price}</div>
                    </td>
                    <td style={{ ...td, minWidth: 140 }}>
                      <Badge status={x.status} />
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>{x.statusNote}</div>
                      <div style={{ fontSize: '0.75rem' }}>赛道评级：{p.tier}</div>
                    </td>
                    <td style={{ ...td, minWidth: 110 }}>
                      <div><strong style={{ fontSize: '1rem' }}>{x.grade}</strong> · {x.score} 分</div>
                      <div>增长：{x.growthLevel}（{x.growthScore}）</div>
                      <div>确定性：{x.certaintyLevel}（{x.certaintyScore}）</div>
                    </td>
                    <td style={{ ...td, minWidth: 170 }}>
                      <div>{p.growthRate ?? '—'}</div>
                      <div>PE：{p.pe ?? '—'}</div>
                      <div>PEG：{p.peg ?? '—'}</div>
                    </td>
                    <td style={{ ...td, minWidth: 120 }}>
                      <div>{p.ratio}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>{p.upDown}</div>
                      {p.winRate !== '—' && <div>胜率 {p.winRate} · 期望 {p.expected}</div>}
                    </td>
                    <td style={{ ...td, minWidth: 190 }}>
                      {l ? (
                        <>
                          <div>买入：{l.buy}{l.gap && l.gap !== '—' ? `（${l.gap}）` : ''}</div>
                          {l.stop !== '—' && <div>认错：{l.stop}</div>}
                          {l.takeProfit !== '—' && <div>止盈：{l.takeProfit}</div>}
                          <div>仓位：{l.cap}</div>
                          {l.trigger !== '—' && <div style={{ color: 'var(--text-secondary)' }}>重估触发：{l.trigger}</div>}
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ ...td, minWidth: 160 }}>{p.space ?? '—'}</td>
                    <td style={{ ...td, minWidth: 150 }}><div>壁垒：{p.moat}</div><div style={{ color: 'var(--text-secondary)' }}>{p.barrier ?? '—'}</div></td>
                    <td style={{ ...td, minWidth: 220 }}>
                      <div><strong>风险等级：{l?.risk ?? '—'}</strong></div>
                      <div>{p.risk}</div>
                      {l && <div style={{ color: 'var(--text-secondary)' }}>失效：{l.invalid}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
