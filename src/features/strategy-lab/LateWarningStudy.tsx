import React from 'react'
import { TableWrap } from '../../components/ui'
import { CompareTable, fmtNum, type CompareCol, type CompareRow } from './LabTable'
import { pct } from './LateCycleStudy'
import data from './data/late-warning.json'

type StratId = keyof typeof data.strategies
type S = (typeof data.strategies)[StratId]

const VARIANTS: { id: Exclude<StratId, 'base'>; name: string; rule: string; ledger: string }[] = [
  { id: 'W1', name: 'W1 过热 + 裂缝 ≥ 3', rule: '宏观没问题、偏热、五道裂缝亮 3 道以上时降一档', ledger: 'L-023 预注册' },
  { id: 'W2', name: 'W2 只看裂缝 ≥ 3', rule: '去掉「偏热」前提', ledger: 'L-023 预注册' },
  { id: 'VA', name: 'A 去掉 C5', rule: '只用 C1–C4', ledger: 'L-024 事后' },
  { id: 'VB', name: 'B 2 个月没增速', rule: 'C5 改为标普较 2 个月前涨幅 ≤ 0%', ledger: 'L-024 事后' },
  { id: 'VD', name: 'D 去掉 C3', rule: 'C1、C2、C4、C5', ledger: 'L-025 事后' },
  { id: 'VE', name: 'E 三项全亮', rule: 'C1、C2、C4 全部成立', ledger: 'L-025 事后' },
  { id: 'VF', name: 'F B 再去掉 C3', rule: 'C1、C2、C4 与 2 个月没增速', ledger: 'L-025 事后' },
]

const CRACKS: { id: string; name: string; def: string }[] = [
  { id: 'C1', name: '利差开始走阔', def: 'Baa − Aaa 企业债利差半年扩大 ≥ 0.10 个百分点' },
  { id: 'C2', name: 'VIX 逐步放大', def: 'VIX 当月均值比前 6 个月均值高 ≥ 10%' },
  { id: 'C3', name: '新高变少', def: '标普在 12 个月高点 5% 以内，但处于新高的行业占比不到近 12 个月最高值的一半' },
  { id: 'C4', name: '防守轮动', def: '防守九行业近 3 个月跑赢 49 行业等权 ≥ 3 个百分点' },
  { id: 'C5', name: '大盘停滞', def: '标普 6 个月涨幅 ≤ 2%' },
]

const base = data.strategies.base
function verdictOf(id: Exclude<StratId, 'base'>): string {
  const s = data.strategies[id]
  const b = s.bootstrap!
  return `${s.pass ? '通过' : '不通过'}：训练期夏普 ${signed(s.train.sharpe - base.train.sharpe)}，验证期 ${signed(s.valid.sharpe - base.valid.sharpe)}；全样本夏普差 95% 区间 [${signed(b.low)}, ${signed(b.high)}]`
}
function signed(v: number, digits = 3): string {
  const body = Math.abs(v).toFixed(digits)
  return v < 0 ? `−${body}` : `+${body}`
}

function VariantTable(): JSX.Element {
  const rows: CompareRow<S>[] = [
    { id: 'base', name: '基线 v2.2', rule: '不加预警', stats: base },
    ...VARIANTS.map(v => ({ id: v.id, name: v.name, rule: `${v.ledger} · ${v.rule}`, stats: data.strategies[v.id], verdict: verdictOf(v.id) })),
  ]
  const cols: CompareCol<S>[] = [
    { key: 'on', head: '降档月数', sub: '1973–2026', get: s => (s === base ? null : s.onMonths), fmt: v => (v == null ? '—' : String(v)) },
    { key: 'full', head: '全样本夏普', get: s => s.full.sharpe, fmt: v => fmtNum(v), better: 'higher' },
    { key: 'train', head: '训练期夏普', sub: '1973–1999', get: s => s.train.sharpe, fmt: v => fmtNum(v), better: 'higher' },
    { key: 'valid', head: '验证期夏普', sub: '2000–2026', get: s => s.valid.sharpe, fmt: v => fmtNum(v), better: 'higher' },
    { key: 'dd', head: '按日最大回撤', get: s => Math.round(s.full.dailyMaxDd * 1e4) / 1e4, fmt: v => pct(v), better: 'higher', unit: 'pp' },
  ]
  return <CompareTable label="七种预警写法与基线" testId="lab-late-warning-table" baseId="base" rows={rows} cols={cols} />
}

function DescribeTable(): JSX.Element {
  const row = (label: string) => data.describe.find(d => d.label === label)!
  return (
    <TableWrap label="宏观没问题且偏热时，各道裂缝成立与否的之后表现" className="lab-wrap">
      <table className="cs-table lab-table" data-testid="lab-late-warning-describe">
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">裂缝</th>
            <th scope="col" className="num">成立<span className="lab-th-sub">月数 · 之后一年 10% 下跌比例 · 12 个月均值</span></th>
            <th scope="col" className="num">不成立<span className="lab-th-sub">月数 · 之后一年 10% 下跌比例 · 12 个月均值</span></th>
          </tr>
        </thead>
        <tbody>
          {CRACKS.map(c => {
            const on = row(`G 且 H 且 ${c.id} 成立`)
            const off = row(`G 且 H 且 ${c.id} 不成立`)
            return (
              <tr key={c.id} className={c.id === 'C1' ? 'is-base' : undefined}>
                <th scope="row" className="lab-sticky">{c.id} {c.name}</th>
                <td className="num">{on.months} 个月 · {pct(on.fall10Share)} · {pct(on.fwd12Mean)}</td>
                <td className="num">{off.months} 个月 · {pct(off.fall10Share)} · {pct(off.fwd12Mean)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableWrap>
  )
}

export default function LateWarningStudy(): JSX.Element {
  const { explore } = data
  const fair = explore.fairReference
  const gh = data.describe.find(d => d.label === 'G 且 H')!
  const c1on = data.describe.find(d => d.label === 'G 且 H 且 C1 成立')!
  const c1off = data.describe.find(d => d.label === 'G 且 H 且 C1 不成立')!
  return (
    <article className="ss-section lab-study" id="lab-late-warning" aria-labelledby="lab-late-warning-title" data-testid="lab-late-warning">
      <p className="lab-status">2026-11-26 · 已完成 · L-023 至 L-025 · {VARIANTS.length} 种写法都不通过 · 仓位规则不变</p>
      <h2 id="lab-late-warning-title">牛市后期多维预警：利差、波动、新高、轮动、停滞</h2>

      <div className="ss-cover lab-answer" data-testid="lab-late-warning-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          {VARIANTS.length} 种写法都不通过。这些裂缝多在回调开始以后才凑齐，高点之前并不比平时多，做不成提前预警；拿来降仓，只会在下跌途中或反弹前减仓。
        </p>
        <p className="ss-p">
          能留下的只有描述性信息：偏热时如果企业债利差开始走阔，之后一年遇到 10% 回调的概率明显更高。可以当作提醒（别加仓、按计划再平衡），不作为降仓信号。
        </p>
      </div>

      <h3 className="cs-subhead">一、五道裂缝</h3>
      <p className="ss-p">预警 = 宏观攻守在中性或以上、雷达偏热、裂缝亮 3 道以上时，下一期降一档。</p>
      <dl className="lab-defs" data-testid="lab-late-warning-cracks">
        {CRACKS.map(c => (
          <div key={c.id} className="lab-defs__item">
            <dt>{c.id} {c.name}</dt>
            <dd>{c.def}</dd>
          </div>
        ))}
      </dl>

      <h3 className="cs-subhead">二、7 种写法的结果</h3>
      <p className="ss-p">
        W1、W2 是预注册写法；A、B、D、E、F 是看过结果后按用户要求改的，只算探索，即使过线也不能采用。判定要同时满足训练期、验证期、成本和事件四条。
      </p>
      <VariantTable />
      <ul className="ss-list">
        <li>没有一种写法让回撤变浅，「宏观没问题且偏热」开始的回调，下跌参与度中位数都还是 {fmtNum(base.ghDownMedian, 2)}。</li>
        <li>E 要三项全亮，53 年里只出现 {data.strategies.VE.onMonths} 个月，全在下跌途中或低点附近。</li>
        <li>继续删减或改阈值，只是在同一份数据上找偶然。这组裂缝到 2027-02-24 前不再调整。</li>
      </ul>

      <h3 className="cs-subhead">三、为什么不行：裂缝出现在高点之后</h3>
      <p className="ss-p" data-testid="lab-late-warning-prepost">
        1973 年以来 {explore.events} 次 10% 以上回调，按每次的平均裂缝数取中位数：高点前 6 个月 {explore.preMedian.toFixed(2)} 道，高点后 6 个月 {explore.postMedian.toFixed(2)} 道。
        公平的参照是同样「宏观没问题且偏热」、但不在任何高点前 6 个月内的月份：平均 {fair.ghOtherMean.toFixed(2)} 道；高点前 6 个月内的 {fair.ghPreMonths} 个月平均 {fair.ghPreMean.toFixed(2)} 道。
      </p>
      <p className="ss-p">
        准确的说法是：高点前的裂缝不比同状态的其他月份多。牛市最后一段往往是低波动、利差收窄、大盘新高；等裂缝凑到 3 道，下跌通常已经开始。
      </p>

      <h3 className="cs-subhead">四、单项读数：偏热且利差开始走阔</h3>
      <p className="ss-p">
        「宏观没问题且偏热」的 {gh.months} 个月里，C1 利差开始走阔的 {c1on.months} 个月，之后一年出现 10% 下跌的比例 {pct(c1on.fall10Share)}、之后 12 个月标普平均 {pct(c1on.fwd12Mean)}；
        不成立的 {c1off.months} 个月是 {pct(c1off.fall10Share)}、{pct(c1off.fwd12Mean)}。回调概率翻倍、平均回报减半。
      </p>
      <DescribeTable />
      <ul className="ss-list">
        <li>但 C1 单独做成降档规则，夏普仍略降：回调之后一年内大多又涨回来，省下的和少赚的差不多抵消。</li>
        <li>C2 VIX 放大让回调概率变高，之后回报也更高：波动两头都大，不是方向信号。C4、C5 几乎没有区分度。</li>
        <li>只是描述统计，价格口径；月份之间重叠，不是独立样本。</li>
      </ul>

      <p className="ss-note" role="note">
        回调 {explore.events} 次，「宏观没问题且偏热」开始的只有 9 次；冷热读数不是当时的实时版本，1991 年 3 月以前没有一个偏热月；1990 年以前 VIX 用已实现波动率代替。
        美国 1973–2026 年数据已被比较过多次，没有干净的样本外。预注册、脚本与结果在 docs/research/late-cycle-warning-2026-11-26/。历史统计，不构成买卖建议。
      </p>
    </article>
  )
}
