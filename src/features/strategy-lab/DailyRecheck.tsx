import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum, fmtPct } from './LabTable'
import data from './data/daily-recheck.json'

/** 「通过检验」页：L-040 按日复核与按周调仓（报告项） */

const signed = (v: number, digits = 3): string => (v < 0 ? `−${Math.abs(v).toFixed(digits)}` : `+${v.toFixed(digits)}`)
const CRASH_ORDER = ['1929–32', '1937–38', '1987', '2008–09', '2020'] as const
const crashes = data.crashes as Record<string, { daily: Record<string, number>; monthEnd: Record<string, number> }>

function Verdict({ text }: { text: string }): JSX.Element {
  return <span className="lab-pill" data-status={text.includes('维持') ? 'pass' : 'fail'}>{text}</span>
}

function SectorRecheck(): JSX.Element {
  const { S1, S2, EW, MKT } = data.sector
  const rows: Array<{ key: keyof typeof S1.daily; label: string }> = [
    { key: 'full', label: '全样本对等权（G1）' },
    { key: 'half1', label: '前半 1927–1976（G2）' },
    { key: 'half2', label: '后半 1977–2026（G2）' },
    { key: 'post2000', label: '2000 年后（G3）' },
    { key: 'mktFull', label: '全样本对大盘（G4）' },
    { key: 'mktPost2000', label: '2000 年后对大盘（G4）' },
    { key: 'delay', label: '晚一个月执行（G5）' },
  ]
  return (
    <>
      <p className="ss-p">
        S1 <Verdict text={S1.verdict} />　S2 <Verdict text={S2.verdict} />
        {' '}规则不变、仍按月调仓，月内改用日线逐日跟踪。G1–G5 用日夏普重算后全部仍然成立。G1 的平移检验 p 值和 G6（ETF 确认）不重算，沿用原结果。
      </p>
      <TableWrap label="板块轮动：夏普差按月末口径与日线口径对比">
        <table className="cs-table lab-table" data-testid="verified-recheck-sector">
          <thead>
            <tr>
              <th scope="col">夏普差（须 &gt; 0）</th>
              <th scope="col" className="num">S1 月末</th>
              <th scope="col" className="num">S1 日线</th>
              <th scope="col" className="num">S2 月末</th>
              <th scope="col" className="num">S2 日线</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td className="num">{signed(S1.monthly[r.key])}</td>
                <td className="num">{signed(S1.daily[r.key])}</td>
                <td className="num">{signed(S2.monthly[r.key])}</td>
                <td className="num">{signed(S2.daily[r.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="ss-p">
        <strong>月末净值会漏掉月中的低点。</strong>
        1929–32 年的最大回撤两种口径几乎一样（S1 {fmtPct(S1.maxDd.monthEnd)} 对 {fmtPct(S1.maxDd.daily)}，等权 {fmtPct(EW.maxDd.monthEnd)} 对 {fmtPct(EW.maxDd.daily)}，大盘 {fmtPct(MKT.maxDd.monthEnd)} 对 {fmtPct(MKT.maxDd.daily)}），因为那次低点恰好落在月末附近。急跌就不一样了：
      </p>
      <TableWrap label="大跌期间最深跌幅：月末口径与日线口径">
        <table className="cs-table lab-table" data-testid="verified-recheck-crashes">
          <thead>
            <tr>
              <th scope="col">最深跌幅（月末 / 日线）</th>
              <th scope="col" className="num">S1</th>
              <th scope="col" className="num">S2</th>
              <th scope="col" className="num">等权</th>
              <th scope="col" className="num">大盘</th>
            </tr>
          </thead>
          <tbody>
            {CRASH_ORDER.map(label => {
              const c = crashes[label]
              return (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {(['S1', 'S2', 'EW', 'MKT'] as const).map(n => (
                    <td key={n} className="num">{fmtPct(c.monthEnd[n], 0)} / {fmtPct(c.daily[n], 0)}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <p className="ss-p">
        <strong>按周调仓（只报告，不能据此采用）：</strong>
        每周末重新选板块，换手从每年约 {fmtNum(S1.weekly.turnoverMonthly, 1)}–{fmtNum(S2.weekly.turnoverMonthly, 1)} 倍升到 {fmtNum(S1.weekly.turnover, 1)}–{fmtNum(S2.weekly.turnover, 1)} 倍。
        对按月版的夏普差：S1 全样本 {signed(S1.weekly.full)}、2000 年后 {signed(S1.weekly.post2000)}；S2 全样本 {signed(S2.weekly.full)}、2000 年后 {signed(S2.weekly.post2000)}。
        S2 在 0.1% 成本下全样本略好，但 2000 年后反而更差；成本提到 0.3% 时两个都更差（全样本 S1 {signed(S1.weekly.fullCost03)}、S2 {signed(S2.weekly.fullCost03)}）。按周没有稳定更好，维持按月。
      </p>
    </>
  )
}

function TiltRecheck(): JSX.Element {
  const { P1, P2 } = data.tilt
  const rows: Array<{ label: string; get: (x: typeof P2.daily) => string }> = [
    { label: '夏普：倾斜 S', get: x => fmtNum(x.sharpeS) },
    { label: '夏普：市场 M', get: x => fmtNum(x.sharpeM) },
    { label: '最大回撤：倾斜 S', get: x => fmtPct(x.maxDdS) },
    { label: '最大回撤：同波动 M*（G2：S 不能深 1 个百分点以上）', get: x => fmtPct(x.maxDdMstar) },
    { label: '合并跌幅比 L', get: x => fmtNum(x.L) },
  ]
  return (
    <>
      <p className="ss-p">
        P2 <Verdict text={P2.verdict} />　P1 <Verdict text={P1.verdict} />
        {' '}规则不变、仍按月再平衡，月内改用日线逐日跟踪（1934–1972 年）。G1–G3 用日线重算后全部仍然成立。最吃紧的是 G2：P2 的日线最大回撤比同波动对照只深 {fmtNum((P2.daily.maxDdMstar - P2.daily.maxDdS) * 100, 2)} 个百分点，门槛是 1 个。否决项（1973 年后叠加档位）是月度信号，不重算。
      </p>
      <TableWrap label="防守倾斜：月末口径与日线口径对比">
        <table className="cs-table lab-table" data-testid="verified-recheck-tilt">
          <thead>
            <tr>
              <th scope="col">1934–1972</th>
              <th scope="col" className="num">P2 月末</th>
              <th scope="col" className="num">P2 日线</th>
              <th scope="col" className="num">P1 月末</th>
              <th scope="col" className="num">P1 日线</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td className="num">{r.get(P2.monthly)}</td>
                <td className="num">{r.get(P2.daily)}</td>
                <td className="num">{r.get(P1.monthly)}</td>
                <td className="num">{r.get(P1.daily)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="ss-p">
        日线夏普整体比月末口径高约 0.1，S 和 M 同时抬高：早年日线有不同步成交带来的正自相关，按 √252 年化会低估波动。所以只看两者的差，不看绝对值。
        同波动下合并跌幅比 L 仍约 1.0，结论不变：好处是效率，不是少跌。
      </p>
      <p className="ss-p">
        <strong>按周再平衡（只报告）：</strong>
        夏普差 P2 {signed(P2.weekly.dS, 4)}、P1 {signed(P1.weekly.dS, 4)}，换手每年多约 {fmtNum((P2.weekly.turnover - P2.weekly.turnoverMonthly) * 100, 0)} 个百分点（P2）。几乎没有差别，维持按月。
      </p>
    </>
  )
}

export default function DailyRecheck({ tab }: { tab: 'sector' | 'tilt' }): JSX.Element {
  return (
    <section className="ss-section lab-study" aria-labelledby="verified-recheck-title" data-testid="verified-recheck">
      <p className="lab-status">2026-11-28 · L-040 · 两套实现核对</p>
      <h2 id="verified-recheck-title">按日复核：换成日线度量，结论还在吗</h2>
      {tab === 'sector' ? <SectorRecheck /> : <TiltRecheck />}
    </section>
  )
}
