import React from 'react'
import data from './data/daily-execution.json'
import { pct } from './LateCycleStudy'
import { CompareTable, type CompareCol, type CompareRow } from './LabTable'

type Id = 'M' | 'D1' | 'D2' | 'D3'
const ROWS: { id: Id; name: string; rule: string }[] = [
  { id: 'M', name: '按月（现行）', rule: '月末定档，次月第 3 个交易日成交' },
  { id: 'D1', name: 'D1 按日执行', rule: '每天收盘看当天档位，次日收盘调到位' },
  { id: 'D2', name: 'D2 按日、连续 5 天确认', rule: '新档位连续 5 个交易日不变才调' },
  { id: 'D3', name: 'D3 降档按日、升档按月', rule: '变防守当天就减，变进攻等月末再加' },
]

function num(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value < 0 ? `−${Math.abs(value).toFixed(digits)}` : value.toFixed(digits)
}

function ResultTable(): JSX.Element {
  type S = (typeof data.strategies)['M']
  const rows: CompareRow<S>[] = ROWS.map(r => ({ id: r.id, name: r.name, rule: r.rule, stats: data.strategies[r.id], verdict: r.id === 'M' ? undefined : data.verdict[r.id] }))
  const cols: CompareCol<S>[] = [
    { key: 'train', head: '训练期夏普', sub: '1973–1999 · 扣成本', get: s => s.train.sharpeNet, fmt: v => num(v), threshold: 0.02 },
    { key: 'valid', head: '验证期夏普', sub: '2000–2026 · 扣成本', get: s => s.valid.sharpeNet, fmt: v => num(v), better: 'higher' },
    { key: 'full', head: '全样本夏普', sub: '扣成本', get: s => s.full.sharpeNet, fmt: v => num(v), better: 'higher' },
    { key: 'cagr', head: '年化', get: s => s.full.cagr, fmt: v => pct(v), better: 'higher', unit: 'pp' },
    { key: 'dd', head: '按日最大回撤', get: s => s.full.dailyMaxDd, fmt: v => pct(v), better: 'higher', unit: 'pp' },
    { key: 'trades', head: '每年调仓', get: s => s.full.tradesPerYear, fmt: v => (v == null ? '—' : `${v.toFixed(1)} 次`) },
  ]
  return <CompareTable label="按日执行三个写法与按月对比" testId="lab-daily-table" baseId="M" rows={rows} cols={cols} />
}

export default function DailyExecutionStudy(): JSX.Element {
  const m = data.strategies.M; const d1 = data.strategies.D1; const d2 = data.strategies.D2
  const e2020 = data.events.find(e => e.peak === '2020-02-19')
  const e2022 = data.events.find(e => e.peak === '2022-01-03')
  const e2015 = data.events.find(e => e.peak === '2015-05-21')

  return (
    <article className="ss-section lab-study" id="lab-daily-execution" aria-labelledby="lab-daily-title" data-testid="lab-daily-execution">
      <p className="lab-status">2026-11-25 · 已完成 · 不改仓位规则</p>
      <h2 id="lab-daily-title">宏观攻守能不能按日执行</h2>

      <div className="ss-cover lab-answer" data-testid="lab-daily-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          {data.answer}。按日执行能把最深的按日回撤从 {pct(m.full.dailyMaxDd, 0)} 降到 {pct(d1.full.dailyMaxDd, 0)}，但主要靠 2020 年一次；代价是每年调仓从 {m.full.tradesPerYear.toFixed(1)} 次增加到 {d1.full.tradesPerYear.toFixed(1)} 次，扣成本后夏普略低，训练期三种写法都更差。
        </p>
      </div>

      <h3 className="cs-subhead">什么能按日、什么不能</h3>
      <ul className="ss-list">
        <li>生产代码已经每天算一次档位（1973 年起，每天只用当天已能看到的数据）。按日变化的是：标普日收盘对十个月均线的月内位置、每周发布的初请失业金和金融条件指数。</li>
        <li>非农、工业生产、核心 PCE、制造业周工时都是月度数据，一个月只更新一次。所以「按日执行」只是反应更快，信息并没有更多。日度档位在月末那天与月度档位 646 个月完全一致。</li>
      </ul>

      <h3 className="cs-subhead">三种按日执行的写法（预注册，门槛用扣 0.1% 成本后的夏普）</h3>
      <ResultTable />
      <ul className="ss-list">
        <li>
          2020 年：按月执行 3 月仍是 100% 仓位，跌 {pct(e2020?.loss.M)}；按日执行 3 月 5 日起降到 85%、9 日起降到 70%，跌 {pct(e2020?.loss.D1)}。但反弹也少赚（{pct(e2020?.gain.D1)} 对 {pct(e2020?.gain.M)}）。
        </li>
        <li>
          其他回调里互有输赢，多数相差 1 个百分点左右：2022 年按日跌 {pct(e2022?.loss.D1)}（按月 {pct(e2022?.loss.M)}），2015 年 {pct(e2015?.loss.D1)}（按月 {pct(e2015?.loss.M)}）。月内均价在十个月均线附近来回穿越时，按日执行会反复调仓。
        </li>
        <li>
          D2（5 天确认）调仓最少、验证期最好（{num(d2.valid.sharpeNet)} 对 {num(m.valid.sharpeNet)}），但训练期也低于按月（{num(d2.train.sharpeNet)} 对 {num(m.train.sharpeNet)}），同样主要是 2020 年的作用。
        </li>
        <li>
          回撤的改善只来自 2020 年：去掉 2020 年再算，按日最大回撤按月 −24.0%，D1、D3 −24.3%，D2 −24.4%，按日执行反而略深（包括 2008 年）；扣成本夏普按月 0.628，按日 0.589–0.611。
        </li>
        <li>3 个写法全样本扣成本夏普差的 95% 区间都跨过 0，Holm 校正后 p 均为 1.00。</li>
      </ul>

      <h3 className="cs-subhead">怎么理解</h3>
      <ol className="ss-list">
        <li>宏观仓位这一层，按日执行在历史上没有更好，维持按月。月中继续每天看日度档位，作为「下个月可能怎么变」的预告。</li>
        <li>按日执行买到的是更浅的最坏回撤（{pct(m.full.dailyMaxDd, 0)} → {pct(d1.full.dailyMaxDd, 0)}），代价是每年少约 {((m.full.cagr - d1.full.cagr) * 100).toFixed(1)} 个百分点收益和更多交易。但这只来自 2020 年一次，2020 年以外回撤反而略深，所以不能当作「更抗跌」的证据。</li>
        <li>真正每天都在变的信息只有价格。今天另外两项研究（月中刹车、按日执行）都说明：只靠价格加快反应，在急跌里少亏的，多半会在反弹里还回去。</li>
      </ol>

      <h3 className="cs-subhead">局限与复现</h3>
      <ul className="ss-list">
        <li>日度档位里月度数据按自然月末可得处理，比真实发布日保守；周度数据按观测日后 5 天可得。</li>
        <li>今天已检验 14 个仓位改动，这 3 个应合在一起看多重比较风险；只有美国数据；未计税费。</li>
        <li>预注册、脚本、档位快照和结果在 docs/research/daily-execution-2026-11-25/，可用 node docs/research/daily-execution-2026-11-25/run.mjs 复现。</li>
      </ul>
    </article>
  )
}
