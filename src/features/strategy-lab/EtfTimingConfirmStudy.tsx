import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum, fmtPct } from './LabTable'
import data from './data/etf-timing-confirm.json'

function Mark({ ok }: { ok: boolean }): JSX.Element {
  return <span className={`lab-tag ${ok ? 'lab-tag--pass' : 'lab-tag--fail'}`}>{ok ? '过' : '不过'}</span>
}

const fmtP = (p: number): string => (p < 0.001 ? p.toFixed(4) : p < 0.01 ? p.toFixed(3) : p.toFixed(2))
const range = ([lo, hi]: number[]): string => `${fmtPct(lo)}–${fmtPct(hi)}`

export default function EtfTimingConfirmStudy(): JSX.Element {
  const { counts: c, published: pub } = data
  const n = c.n
  const betterCrashes = data.crashes.filter(x => x.better).length
  const gates: { label: string; need: string; actual: string; ok: boolean | null }[] = [
    { label: '大跌段回撤', need: '2008 下跌段回撤 ≤ 一直持有的 70% 的指数 ≥ 12 个', actual: `${c.D} / ${n}`, ok: c.D >= 12 },
    { label: '同仓位比较', need: '与同样平均仓位的静态持有比，年化不低且 2008 下跌段回撤不深的指数 ≥ 8 个', actual: `${c.X} / ${n}（年化不低 ${c.Xann}、回撤不深 ${c.Xdd}）`, ok: c.X >= 8 },
    { label: '时机检验', need: `把买卖时点整体平移 ${data.nShifts.toLocaleString('en-US')} 种，平均 2008 回撤比规则浅的比例 p ≤ 0.10`, actual: `p ${fmtP(data.pC)}（规则 ${fmtPct(data.DbarRule)}，平移中位 ${fmtPct(data.DbarShiftMedian)}）`, ok: data.pC <= 0.1 },
    { label: '收益与回撤都过', need: '「确认」需 ≥ 9 个指数年化 ≥ 一直持有 − 1 个百分点且回撤过', actual: `${c.P} / ${n}`, ok: c.P >= 9 },
    { label: '信号发布后复核', need: '只看择时信号发布后（2008-05-26 起），同仓位比较 < 8 个时等级最高「部分确认」', actual: `${c.Xprime} / ${n}`, ok: !data.downgrade1Triggered },
  ]
  return (
    <article className="ss-section lab-study" id="lab-etf-timing-confirm" aria-labelledby="lab-etf-timing-confirm-title" data-testid="lab-etf-timing-confirm">
      <p className="lab-status">2026-11-28 · 已完成 · L-056 · 「{data.grade}」 · 不改仓位规则</p>
      <h2 id="lab-etf-timing-confirm-title">朋友 ETF「择时 + 只认金叉」：2005–2010 年确认检验</h2>
      <div className="ss-cover lab-answer" data-testid="lab-etf-timing-confirm-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          2005–2010 年（其中 11/15 个指数与 52% 的择时状态是发布前回填数据），15 个指数里 {c.P} 个收益与回撤都通过、{c.D} 个回撤通过。回撤门槛对平均持仓三到四成的规则本来就容易过：与同样平均仓位的静态持有相比，{c.Xdd} 个指数的 2008 年下跌段回撤更浅、{c.X} 个指数收益和回撤都不差（时机检验 p = {fmtP(data.pC)}），年化波动有 {c.volLowerThanM} 个指数比静态持有低。
        </p>
        <p className="ss-p">
          结论：{data.label}。这一等级的证据量有限——按事先的功效分析，「择时有效」与「择时无效」下得到它的可能之比只有约 {fmtNum(data.likelihood.ratio, 1)}（精确值 {fmtNum(data.likelihood.ratio, 4)}）。四次大跌里，规则的时机有 {betterCrashes} 次优于随机。
        </p>
      </div>
      <p className="ss-p">
        检验的规则与 2011 年以后那次长历史检验完全相同、不调参数：沪深 300 价格指数 ÷ 中证红利价格指数高于其 20 日均线为「牛」；牛市里 MACD 金叉次日收盘买入、死叉当日收盘卖出，单边成本 0.1%。用从未算过的 2005-07-06 至 2010-12-31，在 15 个中证全收益指数上检验，2008 下跌段取 2007-10-16 至 2008-11-04。
      </p>
      <h3 className="ss-h3">判定：门槛与实际</h3>
      <TableWrap label="确认检验的判定条件" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-etf-timing-confirm-gates">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">条件<span className="lab-th-sub">门槛</span></th>
              <th scope="col" className="num">实际</th>
            </tr>
          </thead>
          <tbody>
            {gates.map(g => (
              <tr key={g.label}>
                <th scope="row" className="lab-sticky">{g.label}<span className="lab-rule">{g.need}</span></th>
                <td className="num">{g.ok == null ? null : <Mark ok={g.ok} />}<span className="lab-th-sub">{g.actual}</span></td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="lab-sticky">等级<span className="lab-rule">前两条都过为「部分确认」，四条都过为「确认」；按 2011 年以后那次检验的数据布局再算一遍，取较低等级</span></th>
              <td className="num"><strong>{data.grade}</strong><span className="lab-th-sub">另一布局：{data.l004.grade}</span></td>
            </tr>
          </tbody>
        </table>
      </TableWrap>
      <h3 className="ss-h3">四次大跌：时机是否优于随机</h3>
      <TableWrap label="四次大跌的时机检验" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-etf-timing-confirm-crashes">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">大跌</th>
              <th scope="col" className="num">时机检验 p</th>
              <th scope="col" className="num">同仓位比较通过</th>
              <th scope="col" className="num">优于随机</th>
            </tr>
          </thead>
          <tbody>
            {data.crashes.map(x => (
              <tr key={x.name}>
                <th scope="row" className="lab-sticky">{x.name}<span className="lab-rule">{x.source === 'test' ? '本次检验' : '事先功效分析（2011 年以后，已知数据）'}</span></th>
                <td className="num">{fmtP(x.pC)}</td>
                <td className="num">{x.X} / {n}</td>
                <td className="num"><Mark ok={x.better} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <h3 className="ss-h3">逐个指数（2005-07-06 至 2010-12-31）</h3>
      <TableWrap label="逐个指数的年化、波动与 2008 下跌段回撤" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-etf-timing-confirm-table">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">指数<span className="lab-th-sub">平均仓位</span></th>
              <th scope="col" className="num">年化<span className="lab-th-sub">规则 / 持有 / 同仓位</span></th>
              <th scope="col" className="num">年化波动<span className="lab-th-sub">规则 / 同仓位</span></th>
              <th scope="col" className="num">2008 回撤<span className="lab-th-sub">规则 / 持有 / 同仓位</span></th>
              <th scope="col" className="num">同仓位比较</th>
            </tr>
          </thead>
          <tbody>
            {data.perIndex.map(x => (
              <tr key={x.code}>
                <th scope="row" className="lab-sticky">{x.name}<span className="lab-th-sub">{fmtPct(x.k, 0)}</span></th>
                <td className="num">{fmtPct(x.annual.rule)} / {fmtPct(x.annual.hold)} / {fmtPct(x.annual.M)}</td>
                <td className="num">{fmtPct(x.vol.rule)} / {fmtPct(x.vol.M)}</td>
                <td className="num">{fmtPct(x.ddC.rule)} / {fmtPct(x.ddC.hold)} / {fmtPct(x.ddC.M)}</td>
                <td className="num"><Mark ok={x.X} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="ss-p">「同仓位」是按规则在这段时间的平均仓位每天再平衡的静态持有。平均仓位只有三到四成时，它的年化会被波动拖低很多，所以「年化不低」容易满足；真正检验择时的是 2008 下跌段回撤与时机检验。</p>
      <h3 className="ss-h3">必须一起读的限制</h3>
      <ul className="ss-list" data-testid="lab-etf-timing-confirm-limits">
        <li><strong>回填数据：</strong>15 个指数里 11 个在这段时间全是发布前回填，当时不存在、也没有产品可交易；择时用的中证红利 2008-05-26 才发布，一半的择时状态来自回填。只能算「假想指数上的规则表现」。只看信号发布之后（2008-05-26 至 2010-12-31），同仓位比较仍有 {pub.Xprime}/{n} 个不差，回撤中位 规则 {fmtPct(pub.dd.rule)}、同仓位 {fmtPct(pub.dd.M)}、一直持有 {fmtPct(pub.dd.hold)}。</li>
        <li><strong>低仓位：</strong>平均持仓只有 {range(data.kRange)}。「回撤 ≤ 一直持有的 70%」靠仓位低就能过（{c.D}/{n}），不能当作择时有效的证据。</li>
        <li><strong>波动不低于同仓位静态组合：</strong>{n} 个指数的年化波动全都高于同样平均仓位的静态持有（规则 {range(data.volRange.rule)}，静态 {range(data.volRange.M)}）。这是满仓 / 空仓来回切换的结构性结果。「同等暴露下降低波动」这一目标没有达到；达到的只是「同等平均仓位下，2008 年回撤更浅、收益不低」。</li>
        <li><strong>「部分确认」的证据量：</strong>可能之比约 {fmtNum(data.likelihood.ratio, 1)}，几乎不改变判断；带信息的是时机检验 p，但 2008 年只是一次大跌，15 个指数高度相关，相当于一次观测。</li>
        <li><strong>四次大跌只有两次优于随机：</strong>{data.crashes.filter(x => x.better).map(x => x.name).join('、')} 优于随机，{data.crashes.filter(x => !x.better).map(x => x.name).join('、')} 不优于随机，时机优势不稳定。</li>
        <li><strong>收益代价仍在：</strong>只有 {c.A}/{n} 个指数年化不低于一直持有 − 1 个百分点（空仓时按存款计息也只有 {data.cash.A}/{n}），2006–07 大牛市少拿得太多。</li>
        <li>只认金叉死叉、不加择时的写法 2008 下跌段回撤中位已是 {fmtPct(data.macdOnlyDdMedian)}；比值择时在它之上的增量较弱（平移择时滤网的检验 p ≈ {fmtNum(data.filterPlacebo.pDbar, 2)}）。改用上证红利作择时分母的探索版同为「{data.e1.grade}」，不能据此改用。</li>
        <li>成本按单边 0.1% 是理想化假设；当时这些指数大多没有跟踪产品。两套独立实现的结果完全一致，只说明计算没写错，不说明结论可靠。</li>
      </ul>
      <h3 className="ss-h3">处理</h3>
      <ul className="ss-list">
        <li>不改仓位规则，不输出买卖指令。</li>
        <li>ETF 择时影子运行照常（2027-05 中期复核、2027-11 决定）；复核时以同样平均仓位的静态组合为对照，不只和一直持有比。</li>
        <li>90 天内不在 2005–2010 年数据上试这条规则的参数变体。</li>
        <li>历史统计，不构成买卖建议。</li>
      </ul>
    </article>
  )
}
