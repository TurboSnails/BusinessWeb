import React from 'react'
import { CORE } from '../data/futureTrendsCore'
import type { CoreItem } from '../data/futureTrendsCore'
import { byInvestability } from '../data/futureTrendsPool'
import { SECTOR_PICKS_ASOF } from '../data/futureTrendsSectorPicks'

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-md)',
  padding: 20,
  marginBottom: 16,
}

const ROLE_COLOR: Record<CoreItem['role'], string> = {
  成长核心: 'var(--system-red)',
  质量复利: 'var(--system-purple)',
  防御稳健: 'var(--system-teal)',
  周期龙头: 'var(--system-orange)',
}

/** 研究评级：价位到 2:1 区且模型给出赔率 → 买入（条件化）；其余 → 观察（等回调或等认证）。 */
function rating(x: CoreItem): string {
  const st = x.item.status
  if (st === '可现在投资') return '买入（条件化，可分批）'
  if (x.item.pick.ratio.includes('未')) return '观察（等待估值认证）'
  return '观察（等回调到买入区）'
}

function Chip({ text, color }: { text: string; color: string }): JSX.Element {
  return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, color: '#fff', background: color, whiteSpace: 'nowrap' }}>{text}</span>
}

export default function FutureTrendsCore(): JSX.Element {
  const rows = [...CORE].sort((a, b) => byInvestability(a.item, b.item))
  const now = rows.filter(x => x.item.status === '可现在投资')
  const wait = rows.filter(x => x.item.status !== '可现在投资')
  const roles = (['成长核心', '质量复利', '防御稳健', '周期龙头'] as const).map(r => [r, rows.filter(x => x.role === r)] as const)
  const chains = Object.entries(rows.reduce<Record<string, string[]>>((m, x) => ({ ...m, [x.chain]: [...(m[x.chain] ?? []), x.item.pick.name] }), {})).filter(([, v]) => v.length > 1)
  const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--system-gray5)' }
  const td: React.CSSProperties = { padding: '8px', verticalAlign: 'top', borderBottom: '1px solid var(--system-gray5)', lineHeight: 1.6 }

  return (
    <>
      <section style={card} aria-labelledby="core-title">
        <h2 id="core-title" style={{ margin: '0 0 6px', fontSize: '1.3rem' }}>核心 20：中长线候选组合</h2>
        <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          整理于 {SECTOR_PICKS_ASOF}，研究期限至 2027-12-31 及以后。从候选池 {''}选出：投资状态为“可现在投资”或“接近买点”，基本面 B 档以上或护城河与现金流明确；
          排除周期高点利润（锂、存储、六氟、小盘稀土）、利润低基数跳升与一次性项目；同一产业链最多 2 家。目标是在合理价格持有盈利向上、确定性较高、增长更持久的公司：先算下行，再谈上行。
          数字随候选池自动更新；价位来自本站程序化倍数模型，未经公司级三情景认证，属于条件化研究假设，不是交易指令。
        </p>
        <ul style={{ margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.8, fontSize: '0.9rem' }}>
          <li><strong>现价已在买入区（{now.length} 家）：</strong>{now.map(x => x.item.pick.name).join('、')}。</li>
          <li><strong>等回调或等估值认证（{wait.length} 家）：</strong>{wait.map(x => `${x.item.pick.name}${x.item.gap !== null && x.item.gap < 0 ? `（还需回落 ${Math.abs(x.item.gap)}%）` : ''}`).join('、')}。</li>
          {roles.map(([r, list]) => <li key={r}><Chip text={r} color={ROLE_COLOR[r]} /> {list.length} 家：{list.map(x => x.item.pick.name).join('、')}</li>)}
          <li><strong>市场：</strong>中国 {rows.filter(x => x.item.market === '中国').length} 家、海外 {rows.filter(x => x.item.market === '海外').length} 家。</li>
        </ul>
        <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem' }}>组合与仓位原则（研究参考）</h3>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, fontSize: '0.85rem' }}>
          <li>同一产业链合并算一份风险：{chains.map(([c, v]) => `${c}（${v.join('、')}）`).join('；')}。</li>
          <li>单只上限见表内“仓位”（按单笔最大亏损约 1% 总资产推算，封顶 5%）；20 家不必同时买满，先买已在买入区的，其余等价格到位。</li>
          <li>分 3 批建仓：左侧（未经财报确认）不超过计划仓位的一半，财报验证“确认加仓”条件后再补足。</li>
          <li>成长核心对应高增长、确定性中等，单只宜小；防御稳健与质量复利可作为组合底仓；周期龙头要准备跨周期持有。</li>
          <li>触发认错线或失效条件，先减仓再复核，不摊低成本；达到基准价先减半，盈利预期不再改善时继续分批止盈。</li>
          <li>若采用项目个人仓位规则：主动层单一标的 4–5%、分散于 4–5 个不相关机会，连续 3 笔触及止损暂停主动交易 3 周。</li>
        </ul>
      </section>

      <section style={card} aria-label="核心名单">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 1500 }}>
            <thead><tr>{['#', '公司 / 角色', '研究评级', '为什么能拿 2–3 年', '估值与增速', '盈亏比', '买卖点位与仓位', '技术壁垒 / 增长点', '风险、加仓与失效'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((x, i) => {
                const p = x.item.pick; const l = x.item.level
                return (
                  <tr key={x.key}>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{i + 1}</td>
                    <td style={{ ...td, minWidth: 130 }}>
                      <strong>{p.name}</strong>
                      <div style={{ color: 'var(--text-secondary)' }}>{p.code} · {x.item.market}</div>
                      <div style={{ margin: '2px 0' }}><Chip text={x.role} color={ROLE_COLOR[x.role]} /></div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{x.chain} · {x.item.trends.join('、')}</div>
                      <div>现价 {p.price}</div>
                    </td>
                    <td style={{ ...td, minWidth: 130 }}>
                      <strong>{rating(x)}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{x.item.statusNote}</div>
                      <div>基本面 {x.item.grade} · {x.item.score} 分</div>
                      <div style={{ fontSize: '0.75rem' }}>增长 {x.item.growthLevel} / 确定性 {x.item.certaintyLevel}</div>
                    </td>
                    <td style={{ ...td, minWidth: 260 }}>
                      <div>{x.why}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>持续期限：{x.duration}</div>
                    </td>
                    <td style={{ ...td, minWidth: 170 }}>
                      <div>{p.growthRate ?? '—'}</div>
                      <div>PE：{p.pe ?? '—'}</div>
                      <div>PEG：{p.peg ?? '—'}</div>
                    </td>
                    <td style={{ ...td, minWidth: 120 }}>
                      <div><strong>{p.ratio}</strong></div>
                      <div style={{ color: 'var(--text-secondary)' }}>{p.upDown}</div>
                      {p.winRate !== '—' && <div>胜率 {p.winRate} · 期望 {p.expected}</div>}
                    </td>
                    <td style={{ ...td, minWidth: 200 }}>
                      {l ? (
                        <>
                          <div>买入区：{l.buy}{l.gap && l.gap !== '—' ? `（${l.gap}）` : ''}</div>
                          {l.stop !== '—' && <div>认错线：{l.stop}</div>}
                          {l.takeProfit !== '—' && <div>止盈：{l.takeProfit}</div>}
                          <div>仓位上限：{l.cap}</div>
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ ...td, minWidth: 180 }}>
                      <div>壁垒 {p.moat}：{p.barrier ?? '—'}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>增长点：{p.space ?? '—'}</div>
                    </td>
                    <td style={{ ...td, minWidth: 240 }}>
                      <div><strong>最大风险：</strong>{x.maxRisk}</div>
                      <div>确认加仓：{x.confirm}</div>
                      {l && <div style={{ color: 'var(--text-secondary)' }}>失效：{l.invalid}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: '0.75rem', color: 'var(--system-gray)', lineHeight: 1.7 }}>
          候补（2026-10-08 复核）：安集科技基本面 A 档，但 PE 51×、基准价低于现价，回落约 20% 到买入区后再考虑放回；华阳集团（智能驾驶补入）现价在 2:1 买点、营收 +30%，但基本面仅 C 档、毛利率 16.8%、客户集中，暂列候补。<br />
          未入选说明：工业富联、浪潮信息的 AI 赛道价位沿用旧模型，本站深度研究的基准价已低于现价；兆易创新、美光、Super Micro、赣锋、天齐、湖南裕能、宁波韵升处于周期或低基数高点；
          英伟达、台积电、博通、长川科技等基本面最好，但股价离 2:1 买点超过 20%，放在候选池“股价偏高”中等待价格。本报告仅供研究参考，不构成个人投资建议。
        </p>
      </section>
    </>
  )
}
