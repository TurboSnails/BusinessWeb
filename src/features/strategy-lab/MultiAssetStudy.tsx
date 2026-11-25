import React from 'react'
import { TableWrap } from '../../components/ui'
import data from './data/multi-asset.json'
import { pct } from './LateCycleStudy'

type Kind = 'C1' | 'C2' | 'REF'
type Seg = 'train' | 'valid'
const NAMES: Record<Kind, { name: string; rule: string }> = {
  C1: { name: 'C1 宏观攻守 + 债金', rule: '股票比例按宏观档位，剩下的钱按波动大小分给国债和黄金，不留现金' },
  C2: { name: 'C2 股债金风险平衡', rule: '不看宏观，三样按波动大小分配（波动小的多分），黄金最多三分之一' },
  REF: { name: '参考：宏观攻守 + 剩余全放国债', rule: '不参与判定' },
}
const SEG_LABEL: Record<Seg, string> = { train: '1976–1999', valid: '2000–2026' }
const CHECK_LABEL: Record<string, string> = {
  '1_noninferior': '两段都不比对照差',
  '2_tailImproved': '两段大跌损失都明显更浅',
  '3_stress': '四个压力期不明显更差',
  '4_dedrift': '去掉黄金、债券的历史性大涨后仍不差',
  '5_lockbox': '1963–1972 年没用过的数据上不差',
}

function num(v: number, d = 3): string {
  return v < 0 ? `−${Math.abs(v).toFixed(d)}` : v.toFixed(d)
}
function signedPct(v: number): string {
  const s = `${Math.abs(v * 100).toFixed(1)}%`
  return v < 0 ? `浅 ${s}` : v > 0 ? `深 ${s}` : '持平'
}

function SegmentTable(): JSX.Element {
  const rows: { kind: Kind; seg: Seg }[] = []
  for (const kind of ['C1', 'C2', 'REF'] as const) for (const seg of ['train', 'valid'] as const) rows.push({ kind, seg })
  return (
    <TableWrap label="两个候选与同等波动对照组的比较">
      <table className="cs-table" data-testid="lab-multi-table">
        <thead>
          <tr>
            <th scope="col">方案 · 区间</th>
            <th scope="col" className="num">年化波动</th>
            <th scope="col" className="num">夏普：候选 / 对照</th>
            <th scope="col" className="num">最差 5% 月份</th>
            <th scope="col" className="num">最深 3 次回撤</th>
            <th scope="col" className="num">年化：候选 / 对照</th>
            <th scope="col" className="num">平均权重 股 / 债 / 金</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ kind, seg }) => {
            const g = data.candidates[kind].segments[seg]
            const w = g.candidate.avgWeights
            return (
              <tr key={`${kind}-${seg}`}>
                <th scope="row">{NAMES[kind].name}<span className="lab-rule">{SEG_LABEL[seg]}{g.needsLeverage ? '（对照组满仓也比候选波动低）' : ''}</span></th>
                <td className="num">{pct(g.candidate.vol)}</td>
                <td className="num">{num(g.candidate.sharpe)} / {num(g.b0.sharpe)}</td>
                <td className="num">{signedPct(g.cmp.cvar5Rel)}</td>
                <td className="num">{signedPct(g.cmp.deepest3Rel)}</td>
                <td className="num">{pct(g.candidate.cagr)} / {pct(g.b0.cagr)}</td>
                <td className="num">{Math.round(w.stock * 100)} / {Math.round(w.bond * 100)} / {Math.round(w.gold * 100)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableWrap>
  )
}

function ChecksTable(): JSX.Element {
  return (
    <TableWrap label="五个通过条件">
      <table className="cs-table" data-testid="lab-multi-checks">
        <thead>
          <tr><th scope="col">条件</th><th scope="col">C1</th><th scope="col">C2</th></tr>
        </thead>
        <tbody>
          {Object.keys(CHECK_LABEL).map(k => (
            <tr key={k}>
              <th scope="row">{CHECK_LABEL[k]}</th>
              <td>{data.candidates.C1.checks[k as keyof typeof data.candidates.C1.checks] ? '满足' : '不满足'}</td>
              <td>{data.candidates.C2.checks[k as keyof typeof data.candidates.C2.checks] ? '满足' : '不满足'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

export default function MultiAssetStudy(): JSX.Element {
  const c1 = data.candidates.C1; const c2 = data.candidates.C2
  const s = (k: Kind, w: string) => data.candidates[k].stress.find(x => x.window.startsWith(w))
  const c1_2022 = s('C1', '2022'); const c1_2008 = s('C1', '2007'); const c2_2008 = s('C2', '2007')
  return (
    <article className="ss-section lab-study" id="lab-multi-asset" aria-labelledby="lab-multi-title" data-testid="lab-multi-asset">
      <p className="lab-status">2026-11-25 · 已完成 · 预注册 L-021 · 两个候选都不通过 · 不改规则</p>
      <h2 id="lab-multi-title">多资产降波动：加国债和黄金，没有比「少放股票、多放现金」更好</h2>

      <div className="ss-cover lab-answer" data-testid="lab-multi-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          两个候选五个条件一个都没满足。在同样的波动下，把钱放进国债和黄金，大跌时并没有明显比「少放股票、多放现金」亏得更少（最好的一处只浅约 9%，远不到门槛）；1976–1981 年通胀期和 2022 年股债一起跌时还更差。降低波动继续用「美股上限 80%、其余放现金或短期国债」。
        </p>
      </div>

      <h3 className="cs-subhead">怎么比的</h3>
      <ul className="ss-list">
        <li>对照组：现行宏观攻守的档位仓位乘一个系数、其余放现金，调到和候选一样的波动（不加杠杆），再比大跌时的损失和收益效率。</li>
        <li>主要标准是大跌损失：最差 5% 月份的平均损失、最深 3 次回撤的平均深度，两段都要浅到门槛以上（门槛按对照组自身的抽样误差定，19%–30%）。</li>
        <li>数据：美股、5 年期国债（按日）、黄金（1975 年起）、现金；买卖与持有费用所有方案一样扣。方法在计算前写好提交，并由独立审稿人另写一套程序核对。</li>
      </ul>
      <SegmentTable />
      <ChecksTable />

      <h3 className="cs-subhead">为什么没过</h3>
      <ul className="ss-list">
        <li>
          C1 用国债和黄金代替现金，整体反而更冒险（年化波动 {pct(c1.segments.train.candidate.vol)}–{pct(c1.segments.valid.candidate.vol)}），对照组满仓也比它波动低。2000 年后它确实更好（夏普 {num(c1.segments.valid.candidate.sharpe)} 对 {num(c1.segments.valid.b0.sharpe)}，2008 年累计 {pct(c1_2008?.candidate.cum ?? 0)} 对 {pct(c1_2008?.b0.cum ?? 0)}），但这是股债负相关、债券大牛市的特殊年代；2022 年股债一起跌时它亏 {pct(c1_2022?.candidate.cum ?? 0)}，对照组 {pct(c1_2022?.b0.cum ?? 0)}。
        </li>
        <li>
          C2 风险平衡很平稳（年化波动约 5%–6%），但同样波动下，「少放股票、多放现金」在 1976–1999 年夏普高得多（{num(c2.segments.train.b0.sharpe)} 对 {num(c2.segments.train.candidate.sharpe)}），大跌损失也不更浅；2008 年它最大回撤 {pct(c2_2008?.candidate.maxDd ?? 0)}，对照组 {pct(c2_2008?.b0.maxDd ?? 0)}。
        </li>
        <li>去掉黄金在 1970 年代的暴涨和 1981 年以后利率长期下行给债券的涨幅后，C1 在 1976–1999 年变差，C2 两段都明显变差；在 1963–1972 年没用过的数据上，两个候选的大跌损失都比对照组深。</li>
      </ul>

      <h3 className="cs-subhead">对你意味着什么</h3>
      <ol className="ss-list">
        <li>降低波动、尤其是减少大跌损失，最可靠的仍是调低股票上限：美股上限取投入资金的 80%，其余放现金或短期国债。</li>
        <li>国债和黄金在某些年代（2000–2020 年）确实帮了忙，但在通胀、加息的年代（1970 年代、2022 年）会一起跌。如果你本来就想持有一些，可以作为个人配置，但它不是比现金更可靠的「降波动工具」。</li>
        <li>按登记簿规则，90 天内不在同一份数据上换参数重试；海外数据的锁箱也不再启用（只在美国通过时才用）。</li>
      </ol>

      <p className="ss-note" role="note">
        局限：黄金 1999-01 至 2000-08 是月均价插值；国债是固定期限收益率换算，不是可交易指数；期内每日再平衡是简化；C1 的波动高于对照组满仓，两者是在不同波动下比较（不允许对照组加杠杆）。
        预注册、主程序、独立复算与结果在 docs/research/multi-asset-2026-11-25/ 与 research-py/engines/multi_asset.py。
      </p>
    </article>
  )
}
