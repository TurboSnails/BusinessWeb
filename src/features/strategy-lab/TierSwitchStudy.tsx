import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum, fmtPct } from './LabTable'
import data from './data/tier-switch.json'

const signed = (v: number, digits = 3): string => (v < 0 ? `−${Math.abs(v).toFixed(digits)}` : `+${v.toFixed(digits)}`)
const monthly = (v: number | null): string => (v == null ? '—' : `${v < 0 ? '−' : '+'}${Math.abs(v * 100).toFixed(2)}%`)

const ROWS = [
  { id: 'C1', name: 'C1 固定篮子', rule: '防守：食品饮料、烟草、日用品、医药医疗、公用事业 9 行业；进攻：半导体、计算机、汽车、零售、机械、电气、银行、金融服务、钢铁 9 行业' },
  { id: 'C2', name: 'C2 按 β', rule: '防守：过去 36 个月 β 最低的 10 个行业；进攻：β 最高的 10 个行业' },
] as const
const SIDES = [
  { id: 'off', name: '进攻侧（进攻、偏进攻）' },
  { id: 'neu', name: '中性' },
  { id: 'def', name: '防守侧（偏防守、防守）' },
] as const

export default function TierSwitchStudy(): JSX.Element {
  const c1 = data.C1
  return (
    <article className="ss-section lab-study" id="lab-tier-switch" aria-labelledby="lab-tier-switch-title" data-testid="lab-tier-switch">
      <p className="lab-status">2026-11-28 · 已完成 · L-041 · C1「{c1.verdict}」、C2「{data.C2.verdict}」 · 股票部分维持全买宽基</p>
      <h2 id="lab-tier-switch-title">按宏观档位切换行业：偏防守买防守行业，偏进攻买进攻行业</h2>
      <div className="ss-cover lab-answer" data-testid="lab-tier-switch-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          防守侧换成防守行业，方向是对的；进攻侧换成进攻行业，在每段历史里都拖后腿。合起来几乎没有好处，还不如一直放防守行业，所以不采用。
        </p>
        <p className="ss-p">
          做法：仓位照旧按档位 × 80% 上限。只改股票部分：进攻侧 30% 换成进攻行业，防守侧 30% 换成防守行业，中性全买宽基。主检验用 1959–1972 年的档位，这段历史宏观规则从没调过参。
        </p>
      </div>
      <TableWrap label="两种切换写法的检验结果" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-tier-switch-table">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">写法</th>
              <th scope="col" className="num">夏普 1959–1972<span className="lab-th-sub">切换 / 全买宽基 / 一直防守</span></th>
              <th scope="col" className="num">对全买宽基<span className="lab-th-sub">须 ≥ +0.03</span></th>
              <th scope="col" className="num">对一直防守<span className="lab-th-sub">须 ≥ 0</span></th>
              <th scope="col" className="num">时机检验 p<span className="lab-th-sub">Holm，须 ≤ 0.10</span></th>
              <th scope="col" className="num">1950–1972<span className="lab-th-sub">夏普差</span></th>
              <th scope="col" className="num">1973–2026<span className="lab-th-sub">夏普差</span></th>
              <th scope="col">结论</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ id, name, rule }) => {
              const r = data[id]
              return (
                <tr key={id}>
                  <th scope="row" className="lab-sticky">{name}<span className="lab-rule">{rule}</span></th>
                  <td className="num">{fmtNum(r.main.sharpe.cand)} / {fmtNum(r.main.sharpe.B0)} / {fmtNum(r.main.sharpe.static)}</td>
                  <td className="num">{signed(r.main.dS_B0)}</td>
                  <td className="num">{signed(r.main.dS_static)}</td>
                  <td className="num">{fmtNum(r.pHolm, 2)}</td>
                  <td className="num">{signed(r.secondary)}</td>
                  <td className="num">{signed(r.veto)}</td>
                  <td><strong>{r.verdict}</strong></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>

      <h3 className="ss-h3">拆开看：好处和坏处各来自哪一侧</h3>
      <p className="ss-p">只在防守侧切换（进攻侧照旧买宽基）、只在进攻侧切换，各自对全买宽基的夏普差：</p>
      <TableWrap label="只切防守与只切进攻" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-tier-switch-split">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">写法</th>
              <th scope="col" className="num">1959–1972</th>
              <th scope="col" className="num">1950–1972</th>
              <th scope="col" className="num">1973–2026</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.flatMap(({ id, name }) => (['defOnly', 'offOnly'] as const).map(k => (
              <tr key={`${id}-${k}`}>
                <th scope="row" className="lab-sticky">{name} · {k === 'defOnly' ? '只切防守' : '只切进攻'}</th>
                <td className="num">{signed(data[id].split.main[k])}</td>
                <td className="num">{signed(data[id].split.secondary[k])}</td>
                <td className="num">{signed(data[id].split.veto[k])}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </TableWrap>
      <p className="ss-p">
        原因在下表：C1 篮子在各档位下相对宽基的月均超额收益。防守行业在防守侧确实跑赢，在中性也跑赢，所以「一直放防守」反而比「只在防守侧放」更好。进攻行业在进攻侧并没有跑赢宽基，反而是在宏观转差、市场见底前后更强：等档位转回进攻，这段超额已经过去了。
      </p>
      <TableWrap label="C1 篮子在各档位下的月均超额" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-tier-switch-excess">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">档位</th>
              <th scope="col" className="num">防守行业<span className="lab-th-sub">1959–1972</span></th>
              <th scope="col" className="num">进攻行业<span className="lab-th-sub">1959–1972</span></th>
              <th scope="col" className="num">防守行业<span className="lab-th-sub">1973–2026</span></th>
              <th scope="col" className="num">进攻行业<span className="lab-th-sub">1973–2026</span></th>
            </tr>
          </thead>
          <tbody>
            {SIDES.map(({ id, name }) => {
              const m = c1.sideExcess.main[id]; const v = c1.sideExcess.veto[id]
              return (
                <tr key={id}>
                  <th scope="row" className="lab-sticky">{name}<span className="lab-rule">{m.months} 个月 / {v.months} 个月</span></th>
                  <td className="num">{monthly(m.defExcess)}</td>
                  <td className="num">{monthly(m.offExcess)}</td>
                  <td className="num">{monthly(v.defExcess)}</td>
                  <td className="num">{monthly(v.offExcess)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <ul className="ss-list">
        <li>回撤更深：1959–1972 年 C1 最大回撤 {fmtPct(c1.main.maxDd.cand)}，全买宽基 {fmtPct(c1.main.maxDd.B0)}。进攻侧本来仓位就高，再加周期行业，等于再加风险。</li>
        <li>C1 在 1973 年后越来越差：1973–1999 年夏普差 {signed(c1.vetoSub['1973-1999'])}，2000–2026 年 {signed(c1.vetoSub['2000-2026'])}，2012–2026 年 {signed(c1.vetoSub['2012-2026'])}。成本提到 0.3% 时，三段都转负。</li>
        <li>「只切防守」的小幅正值（1959–1972 年 {signed(c1.split.main.defOnly)}）是看过结果后的拆分，不能据此采用；它也不如一直放防守行业（L-026 已在「通过检验」页做影子记录）。按规则，90 天内（2027-02-26 前）不在同一数据上试切换比例、名单、档位分组的变体。</li>
      </ul>
    </article>
  )
}
