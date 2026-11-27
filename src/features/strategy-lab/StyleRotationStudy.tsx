import React from 'react'
import { TableWrap } from '../../components/ui'
import { StyleTable, pct1, useStyleShadow } from '../market-radar/StylePanel'
import { fmtNum, fmtPct } from './LabTable'
import data from './data/style-rotation.json'

const signed = (v: number, digits = 3): string => (v < 0 ? `−${Math.abs(v).toFixed(digits)}` : `+${v.toFixed(digits)}`)
const WINDOWS = [
  { id: 'dxus', name: '除美国发达市场 1991–2023（主）' },
  { id: 'em', name: '新兴市场 1993–2023' },
  { id: 'us', name: '美国 1964–2023（否决）' },
] as const
const LOCK_NAMES: Record<'dxus' | 'em' | 'us', string> = { dxus: '除美国发达市场', em: '新兴市场', us: '美国' }

function ShadowNow(): JSX.Element {
  const load = useStyleShadow()
  if (load.state !== 'ok') {
    return <p className="lab-shadow" data-testid="lab-style-shadow">{load.state === 'loading' ? '影子读数加载中…' : '影子读数暂时加载不了'}</p>
  }
  const d = load.data
  const s = d.summary
  return (
    <div className="lab-shadow" data-testid="lab-style-shadow">
      <p className="ss-p">
        <strong>影子记录（只记录、不操作，非建议）：</strong>{d.since} 至 {d.until}。
        {s.us.months
          ? `已记 ${s.us.months} 个月，美国累计 R1 ${pct1(s.us.cumulative.R1)}、R2 ${pct1(s.us.cumulative.R2)}、一直持有正向腿 ${pct1(s.us.cumulative.STATIC)}、IVV ${pct1(s.us.cumulative.MKT)}；海外 R1 ${pct1(s.intl.cumulative.R1)}、R2 ${pct1(s.intl.cumulative.R2)}、一直持有 ${pct1(s.intl.cumulative.STATIC)}、EFA ${pct1(s.intl.cumulative.MKT)}。`
          : '还没有完整月份。'}
        {' '}下表是 {d.radar.month} 的读数。
      </p>
      <div className="lab-style-grid">
        <StyleTable data={d} group="us" />
        <StyleTable data={d} group="intl" />
      </div>
    </div>
  )
}

export default function StyleRotationStudy(): JSX.Element {
  const m = data.markets
  const p = data.posthoc
  return (
    <article className="ss-section lab-study" id="lab-style-rotation" aria-labelledby="lab-style-rotation-title" data-testid="lab-style-rotation">
      <p className="lab-status">2026-11-28 · 已完成 · L-042 · R1「{data.candidates.R1.verdict}」、R2「{data.candidates.R2.verdict}」 · 锁箱确认：R1「{data.confirm.verdicts.R1.verdict}」、R2「{data.confirm.verdicts.R2.verdict}」</p>
      <h2 id="lab-style-rotation-title">风格轮动：按过去 12 个月挑价值、动量、盈利、投资、规模哪一边</h2>
      <div className="ss-cover lab-answer" data-testid="lab-style-rotation-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          按过去 12 个月挑风格，在除美国外的发达市场、新兴市场和美国都比各风格平均持有好，预注册五个条件全过。但一直持有价值、动量、高盈利、保守投资、小盘几乎一样好，换手只有约 1/30。历史上好处主要来自风格溢价本身，不是轮动。打开锁箱看 2023-11 至 2026-09 的新数据：R2 确认、R1 幅度不足；海外两个市场轮动比一直持有更好，美国明显更差。
        </p>
        <p className="ss-p">
          做法：10 条只做多的大盘风格腿（价值 / 成长、动量赢家 / 输家、高 / 低盈利、保守 / 激进投资、小盘 / 大盘），来自 Ken French 风格组合。R1 每月持有过去 12 个月最强的 3 条；R2 每个因子比较两条腿过去 12 个月的差，选强的一边。对照是 10 条等权。主检验用除美国外发达市场，这批数据以前从没用过；2023-11 以后的数据留给因子实验室锁箱，没有读。
        </p>
      </div>

      <TableWrap label="预注册检验结果" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-style-rotation-table">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">窗口</th>
              <th scope="col" className="num">R1 夏普<span className="lab-th-sub">对等权</span></th>
              <th scope="col" className="num">R2 夏普<span className="lab-th-sub">对等权</span></th>
              <th scope="col" className="num">10 条等权</th>
              <th scope="col" className="num">市场</th>
            </tr>
          </thead>
          <tbody>
            {WINDOWS.map(({ id, name }) => (
              <tr key={id}>
                <th scope="row" className="lab-sticky">{name}</th>
                <td className="num">{fmtNum(m[id].R1.sharpe)}（{signed(m[id].R1.dS ?? 0)}）</td>
                <td className="num">{fmtNum(m[id].R2.sharpe)}（{signed(m[id].R2.dS ?? 0)}）</td>
                <td className="num">{fmtNum(m[id].B0.sharpe)}</td>
                <td className="num">{fmtNum(m[id].MKT.sharpe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <ul className="ss-list">
        <li>主窗口前后两半的夏普差：R1 {signed(data.candidates.R1.sub.h1)} / {signed(data.candidates.R1.sub.h2)}，R2 {signed(data.candidates.R2.sub.h1)} / {signed(data.candidates.R2.sub.h2)}。时机检验（把持仓序列整体错开 361 种月数）Holm p 都是 {fmtNum(data.candidates.R1.pHolm, 3)}。</li>
        <li>每年换手 R1 {m.dxus.R1.turnover} 倍、R2 {m.dxus.R2.turnover} 倍；成本提到 0.3% 后三个市场仍为正（R1 主窗口 {signed(data.report['cost0.3'].dxus.R1)}）。</li>
        <li>2009–2019 年基本没有优势：R1 {signed(data.candidates.R1.sub['2009-2019'])}，R2 {signed(data.candidates.R2.sub['2009-2019'])}。</li>
      </ul>

      <h3 className="ss-h3">事后补充：一直持有正向腿</h3>
      <p className="ss-p">
        预注册的对照「10 条等权」里有一半是长期吃亏的那一边（成长、动量输家、低盈利、激进投资、大盘），是个偏弱的对照。看完结果后补算「价值、动量赢家、高盈利、保守投资、小盘各 20%，一直持有」：
      </p>
      <TableWrap label="一直持有正向腿对照" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-style-rotation-static">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">夏普</th>
              <th scope="col" className="num">一直持有正向腿</th>
              <th scope="col" className="num">R1</th>
              <th scope="col" className="num">R2</th>
              <th scope="col" className="num">10 条等权</th>
            </tr>
          </thead>
          <tbody>
            {WINDOWS.map(({ id, name }) => (
              <tr key={id}>
                <th scope="row" className="lab-sticky">{name}</th>
                <td className="num">{fmtNum(p[id].static.sharpe)}</td>
                <td className="num">{fmtNum(p[id].R1.sharpe)}</td>
                <td className="num">{fmtNum(p[id].R2.sharpe)}</td>
                <td className="num">{fmtNum(p[id].B0.sharpe)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="lab-sticky">每年换手（主窗口）</th>
              <td className="num">{p.dxus.static.turnover} 倍</td>
              <td className="num">{p.dxus.R1.turnover} 倍</td>
              <td className="num">{p.dxus.R2.turnover} 倍</td>
              <td className="num">{p.dxus.B0.turnover} 倍</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>
      <ul className="ss-list">
        <li>R1 和一直持有打平：主窗口高 {signed(p.dxus.R1.sharpe - p.dxus.static.sharpe)}，新兴市场 {signed(p.em.R1.sharpe - p.em.static.sharpe)}，美国 {signed(p.us.R1.sharpe - p.us.static.sharpe)}；前半一直持有更好（{fmtNum(data.posthoc.sub.h1.static)} 对 {fmtNum(data.posthoc.sub.h1.R1)}），后半 R1 更好（{fmtNum(data.posthoc.sub.h2.R1)} 对 {fmtNum(data.posthoc.sub.h2.static)}）。R2 三个市场都更低。</li>
        <li>时机检验为什么还显著：R1 平均约三分之一的时间拿着反向腿，把时间打乱后夏普掉到和等权差不多；真实的择时把这部分拖累补了回来，结果和一直持有打平。</li>
        <li>多空版的因子动量也一样：五个地区按 12 个月选多空，都比一直做多五个因子差（欧洲 {signed(data.report.ls.Europe.dS)}，日本 {signed(data.report.ls.Japan.dS)}，亚太除日本 {signed(data.report.ls.APxJ.dS)}，北美 {signed(data.report.ls.NA.dS)}）。</li>
        <li>「一直持有」是看过结果后才算的，不能据此采用；它就是常见的多因子 smart beta，这类产品在文献发表后表现普遍打折。最大回撤：主窗口一直持有 {fmtPct(p.dxus.static.maxDd)}，R1 {fmtPct(p.dxus.R1.maxDd)}，市场 {fmtPct(m.dxus.MKT.maxDd)}。</li>
      </ul>

      <h3 className="ss-h3" id="lab-style-lockbox">锁箱确认：2023-11 至 2026-09 的新数据</h3>
      <p className="ss-p" data-testid="lab-style-lockbox-verdict">
        这 35 个月原来锁在因子实验室的锁箱里，写好确认预注册（门槛：三个市场平均夏普差不低于历史的 1/4，且除美国发达市场为正）之后才打开，只看这一次。结论：R1「{data.confirm.verdicts.R1.verdict}」（平均 {signed(data.confirm.verdicts.R1.avg)}，门槛 {signed(data.confirm.verdicts.R1.threshold)}），R2「{data.confirm.verdicts.R2.verdict}」（平均 {signed(data.confirm.verdicts.R2.avg)}，门槛 {signed(data.confirm.verdicts.R2.threshold)}）。
      </p>
      <TableWrap label="锁箱期夏普" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-style-lockbox">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">2023-11 至 2026-09</th>
              <th scope="col" className="num">R1<span className="lab-th-sub">对等权 / 对一直持有</span></th>
              <th scope="col" className="num">R2<span className="lab-th-sub">对等权 / 对一直持有</span></th>
              <th scope="col" className="num">一直持有正向腿</th>
              <th scope="col" className="num">10 条等权</th>
              <th scope="col" className="num">市场</th>
            </tr>
          </thead>
          <tbody>
            {WINDOWS.map(({ id }) => {
              const c = data.confirm.markets[id]
              return (
                <tr key={id}>
                  <th scope="row" className="lab-sticky">{LOCK_NAMES[id]}</th>
                  <td className="num">{fmtNum(c.R1.sharpe)}（{signed(c.R1.dS ?? 0)} / {signed(c.R1.dS_static ?? 0)}）</td>
                  <td className="num">{fmtNum(c.R2.sharpe)}（{signed(c.R2.dS ?? 0)} / {signed(c.R2.dS_static ?? 0)}）</td>
                  <td className="num">{fmtNum(c.STATIC.sharpe)}</td>
                  <td className="num">{fmtNum(c.B0.sharpe)}</td>
                  <td className="num">{fmtNum(c.MKT.sharpe)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <ul className="ss-list">
        <li>海外两个市场都支持轮动，而且这次第一次在新数据上比过「一直持有」：除美国发达市场 R1 比一直持有高 {signed(data.confirm.markets.dxus.R1.dS_static ?? 0)}，R2 高 {signed(data.confirm.markets.dxus.R2.dS_static ?? 0)}；新兴市场 R2 高 {signed(data.confirm.markets.em.R2.dS_static ?? 0)}，R1 持平。</li>
        <li>美国反过来：R1 比等权低 {signed(data.confirm.markets.us.R1.dS ?? 0)}，R2 低 {signed(data.confirm.markets.us.R2.dS ?? 0)}，都不如一直持有。这三年美国大盘价值腿涨了约 144%，风格领先者换得太快，12 个月回看总是追在后面。</li>
        <li>这段是大牛市，三个市场夏普都在 1 以上，35 个月的差别抽样误差很大：解封前估计，即使规则真有一半的历史效果，判为不确认的可能也有约四成。所以 R2 确认、R1 幅度不足都只是方向上的证据。</li>
        <li>如实说明：写确认预注册时，风格雷达已经显示过 2025-11 至 2026-10 风格 ETF 的 12 个月收益，和锁箱后段相关；规则与门槛沿用 L-042，没有改动。</li>
      </ul>
      <ShadowNow />
    </article>
  )
}
