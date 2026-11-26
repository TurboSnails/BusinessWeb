import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum } from './LabTable'
import { pct } from './LateCycleStudy'
import data from './data/radar-vix.json'

type Seg = keyof typeof data.segments
const SEGS: Seg[] = ['train', 'valid', 'full']
type Scheme = (typeof data.schemes)[number]

const ROLE_TAG: Record<string, { text: string; cls: string }> = {
  base: { text: '基线', cls: 'lab-tag--base' },
  confirm: { text: '不采用', cls: 'lab-tag--fail' },
  explore: { text: '探索', cls: 'lab-tag--base' },
}

function SchemeTable(): JSX.Element {
  return (
    <TableWrap label="雷达加企业利差与 VIX 变化趋势的各方案" className="lab-wrap">
      <table className="cs-table lab-table" data-testid="lab-radar-vix-table">
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">方案</th>
            {SEGS.map(k => (
              <th key={k} scope="col" className="num">{k === 'full' ? '全样本' : k === 'train' ? '训练期' : '验证期'}<span className="lab-th-sub">{k === 'full' ? '1973–2026' : data.segments[k]} · 年化 / 最大回撤 / 夏普</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.schemes.map((s: Scheme) => {
            const tag = ROLE_TAG[s.role]
            return (
              <tr key={s.id} className={s.role === 'base' ? 'is-base' : undefined}>
                <th scope="row" className="lab-sticky">
                  <span className="lab-name">
                    {s.name}
                    <span className={`lab-tag ${tag.cls}`} title={'verdict' in s ? s.verdict : undefined}>{tag.text}</span>
                  </span>
                  <span className="lab-rule">{s.rule}</span>
                </th>
                {SEGS.map(k => (
                  <td key={k} className="num lab-nowrap">{pct(s[k].cagr, 2)} / {pct(s[k].maxDd)} / {fmtNum(s[k].sharpe)}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableWrap>
  )
}

export default function RadarVixStudy(): JSX.Element {
  const ep = data.episodes
  const k2 = data.schemes.find(s => s.id === 'K2')!
  const base = data.schemes.find(s => s.id === 'base')!
  return (
    <article className="ss-section lab-study" id="lab-radar-vix" aria-labelledby="lab-radar-vix-title" data-testid="lab-radar-vix">
      <p className="lab-status">2026-11-26 · 已完成 · {data.ledger} · K1、K2 都不采用 · 雷达计分规则不变</p>
      <h2 id="lab-radar-vix-title">雷达加企业利差与 VIX 变化趋势</h2>

      <div className="ss-cover lab-answer" data-testid="lab-radar-vix-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          K1、K2 都不采用，雷达计分规则不变。VIX 变化趋势改为只展示，放在雷达页「趋势与波动」组。
        </p>
        <p className="ss-p">
          K2 在训练期过线，但验证期夏普从 {fmtNum(base.valid.sharpe)} 降到 {fmtNum(k2.valid.sharpe)}，回撤从 {pct(base.valid.maxDd)} 加深到 {pct(k2.valid.maxDd)}。三个探索写法同样是训练期好、验证期差。
        </p>
      </div>

      <h3 className="cs-subhead">一、检验了什么</h3>
      <p className="ss-p">
        VIX 变化趋势 = 当月 VIX 均值 ÷ 前 6 个月均值的平均 − 1，看的是变化，不是高低。1990 年前没有 VIX，用标普已实现波动率按同一公式代用。
        预注册写定：训练期夏普要过线，再看验证期。
      </p>
      <SchemeTable />
      <ul className="ss-list">
        <li>K1 训练期夏普低 0.001，不过线。</li>
        <li>K2 的假设是「利差走阔时，波动回落才是修复」。数据是反的：2000 年以后，利差走阔但 VIX 已经回落的月份，之后 12 个月平均只有 0.7%，四成多为负。</li>
        <li>VIX 趋势单独看没有稳定方向，不同年代结论相反。</li>
      </ul>

      <h3 className="cs-subhead">二、事后观察：利差走阔且 VIX 急升（不能当信号）</h3>
      <p className="ss-p" data-testid="lab-radar-vix-episodes">
        「{ep.condition}」共出现在 {ep.count} 段行情里，{ep.positive} 段之后 12 个月为正，唯一为负的是 {ep.negative.month}（{pct(ep.negative.fwd12, 0)}）；其中 {ep.macroDefensive} 段宏观攻守在偏防守或防守。
        每段之后 12 个月内的最大回撤多数在 −10% 以内，{ep.worstDd.month} 是 {pct(ep.worstDd.dd)}。
      </p>
      <p className="ss-p">
        这是看过结果之后才找到的格子，按规则不能当信号用，也不追加候选。它说明恐慌顶点附近宏观攻守偏保守；留作待验证的假设，前推记录里每出现一次就记一次。
      </p>
      <p className="lab-rule">出现月份：{ep.months.join('、')}</p>

      <p className="ss-note" role="note">
        基线在 2026-11-26 重建的数据快照上重算，和前几轮略有差别，候选都在同一份快照上比较。90 天内（{data.freezeUntil} 前）不在同一数据上试 VIX 趋势的阈值或窗口变体。
        数字出处：{data.source}。历史统计，不构成买卖建议。
      </p>
    </article>
  )
}
