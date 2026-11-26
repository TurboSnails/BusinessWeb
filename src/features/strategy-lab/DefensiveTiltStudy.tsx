import React, { useEffect, useState } from 'react'
import { TableWrap } from '../../components/ui'
import { CompareTable, fmtNum, type CompareCol, type CompareRow } from './LabTable'
import { pct } from './LateCycleStudy'
import data from './data/defensive-tilt.json'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
const SHADOW_URL = `${BASE.endsWith('/') ? BASE : `${BASE}/`}data/defensive-tilt-shadow.json`

type Stats = { cagr: number | null; vol: number | null; sharpe: number | null; maxDd: number | null; L: number | null; turnover: number | null }
type PId = 'P1' | 'P2'

const PORTS: { id: PId; name: string; rule: string }[] = [
  { id: 'P1', name: 'P1 防守九行业 30%', rule: '股票部分 70% 大盘 + 30% 食品、饮料、烟草、日用品、医疗、制药、公用事业等九个行业等权' },
  { id: 'P2', name: 'P2 低波十行业 30%', rule: '股票部分 70% 大盘 + 30% 过去 36 个月波动最低的 10 个行业等权，每月重选' },
]

function signed(v: number, digits = 3): string {
  const body = Math.abs(v).toFixed(digits)
  return v < 0 ? `−${body}` : `+${body}`
}

function MainTable(): JSX.Element {
  const rows: CompareRow<Stats>[] = [
    { id: 'M', name: '市场 M', rule: '大盘市值加权', stats: { ...data.market, L: null, turnover: null } },
    ...PORTS.map(p => {
      const d = data[p.id]
      return {
        id: p.id,
        name: p.name,
        rule: p.rule,
        stats: { ...d.main.S, L: d.main.L, turnover: d.turnoverPerYear },
        verdict: `${d.verdict}：夏普差 ${signed(d.boot.point)}，95% 区间 [${signed(d.boot.low)}, ${signed(d.boot.high)}]，Holm p = ${d.boot.holm.toFixed(2)}`,
      }
    }),
  ]
  const cols: CompareCol<Stats>[] = [
    { key: 'sharpe', head: '夏普', sub: '1934–1972', get: s => s.sharpe, fmt: v => fmtNum(v), better: 'higher' },
    { key: 'cagr', head: '年化', get: s => s.cagr, fmt: v => pct(v), better: 'higher', unit: 'pp' },
    { key: 'vol', head: '波动', get: s => s.vol, fmt: v => pct(v), better: 'lower', unit: 'pp' },
    { key: 'dd', head: '最大回撤', sub: '月末', get: s => s.maxDd, fmt: v => pct(v), better: 'higher', unit: 'pp' },
    { key: 'L', head: '合并跌幅比 L', sub: '对同波动大盘，越小越好', get: s => s.L, fmt: v => fmtNum(v) },
    { key: 'turn', head: '年换手', get: s => s.turnover, fmt: v => pct(v, 0) },
  ]
  return <CompareTable label="1934–1972 年防守倾斜与市场" testId="lab-defensive-main" baseId="M" rows={rows} cols={cols} />
}

function CostTable(): JSX.Element {
  return (
    <TableWrap label="防守倾斜必须一起看的代价" className="lab-wrap">
      <table className="cs-table lab-table" data-testid="lab-defensive-cost">
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">写法</th>
            <th scope="col" className="num">2012–2026 夏普<span className="lab-th-sub">倾斜 / 市场</span></th>
            <th scope="col" className="num">1973–2026 夏普<span className="lab-th-sub">倾斜 / 市场</span></th>
            <th scope="col" className="num">最差 3 年相对落后<span className="lab-th-sub">1973–2026</span></th>
            <th scope="col" className="num">最差 3 年相对落后<span className="lab-th-sub">1934–1972</span></th>
          </tr>
        </thead>
        <tbody>
          {PORTS.map(p => {
            const d = data[p.id]
            const recent = d.later['2012-2026']
            const later = d.later['1973-2026']
            return (
              <tr key={p.id}>
                <th scope="row" className="lab-sticky">{p.name}</th>
                <td className="num">{fmtNum(recent.S)} / {fmtNum(recent.M)}</td>
                <td className="num">{fmtNum(later.S)} / {fmtNum(later.M)}</td>
                <td className="num">{pct(later.worstRolling36.rel)}<span className="lab-rule">{later.worstRolling36.from} 至 {later.worstRolling36.to}</span></td>
                <td className="num">{pct(d.main.worstRolling36.rel)}<span className="lab-rule">{d.main.worstRolling36.from} 至 {d.main.worstRolling36.to}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableWrap>
  )
}

type ShadowCurrent = { month: string; period: [string, string]; S1: number | null; S2: number | null; S2b: number | null; etf: { SPY: number | null }; estimate?: boolean }
type Shadow = { since: string; until: string; current: ShadowCurrent | null; rows: unknown[] }
type ShadowLoad = { state: 'loading' } | { state: 'error' } | { state: 'ok'; data: Shadow }

function asShadow(body: unknown): Shadow | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Partial<Shadow>
  return typeof b.since === 'string' && typeof b.until === 'string' && Array.isArray(b.rows) && 'current' in b ? (b as Shadow) : null
}

function ShadowNow(): JSX.Element {
  const [load, setLoad] = useState<ShadowLoad>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch(SHADOW_URL, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: unknown) => {
        const shadow = asShadow(body)
        setLoad(shadow ? { state: 'ok', data: shadow } : { state: 'error' })
      })
      .catch(() => { if (!controller.signal.aborted) setLoad({ state: 'error' }) })
    return () => controller.abort()
  }, [])
  if (load.state !== 'ok') {
    return <p className="lab-shadow" data-testid="lab-defensive-shadow">{load.state === 'loading' ? '影子读数加载中…' : '影子读数暂时加载不了'}</p>
  }
  const { since, until, current: c, rows } = load.data
  return (
    <p className="lab-shadow" data-testid="lab-defensive-shadow">
      <strong>影子读数（只记录、不操作）：</strong>
      {c
        ? `${c.month}（${c.period[0]} 至 ${c.period[1]}${c.estimate ? '，月中估算' : ''}）：S1 防守三 ETF 版 ${pct(c.S1, 1, true)}，S2 USMV 版 ${pct(c.S2, 1, true)}，SPLV 版 ${pct(c.S2b, 1, true)}，SPY ${pct(c.etf.SPY, 1, true)}。`
        : '本月还没有读数。'}
      计划 {since} 至 {until}，已冻结 {rows.length} 个月。
    </p>
  )
}

export default function DefensiveTiltStudy(): JSX.Element {
  const { P1, P2, market } = data
  return (
    <article className="ss-section lab-study" id="lab-defensive-tilt" aria-labelledby="lab-defensive-tilt-title" data-testid="lab-defensive-tilt">
      <p className="lab-status">2026-11-26 · 已完成 · {data.ledger} · 按预注册通过 · 仓位规则不变，ETF 影子运行 12 个月</p>
      <h2 id="lab-defensive-tilt-title">股票部分长期防守 / 低波倾斜</h2>

      <div className="ss-cover lab-answer" data-testid="lab-defensive-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          按预注册，P1、P2 都通过，按规则取 {data.pick}。但同等波动下，大跌时并没有少跌（合并跌幅比 {fmtNum(P1.main.L)}、{fmtNum(P2.main.L)}）；好处是效率：波动低一点，夏普高约 {(P2.main.S.sharpe - market.sharpe).toFixed(2)}。
          2012 年以后这点优势基本消失。先用 ETF 影子运行 12 个月，期满由你决定是否采用。
        </p>
        <p className="ss-p">它更像「更聪明地把上限调低一点」，不是专门躲后期急跌的工具。</p>
      </div>

      <h3 className="cs-subhead">一、主判定：1934–1972 年（{data.months} 个月）</h3>
      <p className="ss-p">
        股票部分不择时，长期放 30% 在防守或低波行业。合并跌幅比 L 拿来比的是「同波动大盘」：把大盘仓位降到和倾斜组合一样的波动。L 接近 1，说明大跌时的表现和单纯少持一点大盘差不多。
      </p>
      <MainTable />
      <ul className="ss-list">
        <li>两半段夏普都比市场好（P1 {fmtNum(P1.halves[0].S)} / {fmtNum(P1.halves[0].M)}、{fmtNum(P1.halves[1].S)} / {fmtNum(P1.halves[1].M)}；P2 {fmtNum(P2.halves[0].S)}、{fmtNum(P2.halves[1].S)}）。</li>
        <li>通过靠的是夏普高出 0.03 以上这一条，不是靠 L ≤ 0.90。P1 与 P2 的 L 是 {fmtNum(P1.main.L)} 对 {fmtNum(P2.main.L)}，实际上打平。</li>
        <li>防守篮子在 1968–70 年的慢熊里跌得少，在 1946、1962 年的急跌里反而跌得多，合起来和同波动大盘一样。</li>
      </ul>

      <h3 className="cs-subhead">二、必须一起看的代价</h3>
      <CostTable />
      <ul className="ss-list">
        <li>低波异象最早就是在这代美国数据上发现的，这次通过不是学术意义上的样本外。2012 年以后，P2 的优势消失，P1 只剩持平。</li>
        <li>牛市后段跑输是确定会发生的：1997–2000 年 P1 三年落后大盘 {pct(Math.abs(P1.later['1973-2026'].worstRolling36.rel), 0)}，2023–2025 年 P2 落后 {pct(Math.abs(P2.later['1973-2026'].worstRolling36.rel), 0)}。这正是最可能中途放弃的时候。</li>
        <li>P2 年换手 {pct(P2.turnoverPerYear, 0)}；P1 只有 {pct(P1.turnoverPerYear, 0)}，可以用 XLP、XLV、XLU 三只 ETF 简单执行。</li>
      </ul>

      <h3 className="cs-subhead">三、影子运行</h3>
      <p className="ss-p">
        股票部分 70% SPY + 30% 防守腿，每月初再平衡：S1 防守腿用 XLP、XLV、XLU 等权（对应 P1），S2 用 USMV、S2b 用 SPLV（对应 P2）。
        只检验 ETF 和研究口径是否一致（看跟踪差），不对收益做判定；现行仓位仍按宏观攻守执行。
      </p>
      <ShadowNow />

      <p className="ss-note" role="note">
        Ken French 49 行业月度数据，最大回撤为月末口径；1973–2026 年套在宏观攻守 × 80% 上只作否决（没有触发），那段数据此前看过，不作证据。
        1934–1972 年行业数据已用掉。预注册、脚本与结果在 docs/research/defensive-tilt-2026-11-26/。历史统计，不构成买卖建议。
      </p>
    </article>
  )
}
