import React, { useEffect, useState } from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum } from './LabTable'
import { pct } from './LateCycleStudy'
import data from './data/sector-rotation.json'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
const SHADOW_URL = `${BASE.endsWith('/') ? BASE : `${BASE}/`}data/sector-rotation-shadow.json`

const KF_NAMES: Record<string, string> = {
  BusEq: '科技设备与软件', Chems: '化工', Durbl: '耐用品', Enrgy: '能源', Hlth: '医疗', Manuf: '制造',
  Money: '金融', NoDur: '日常消费', Shops: '零售与服务', Telcm: '通信', Utils: '公用事业',
}
const ETF_NAMES: Record<string, string> = {
  XLB: '原材料', XLE: '能源', XLF: '金融', XLI: '工业', XLK: '科技', XLP: '日常消费', XLU: '公用事业', XLV: '医疗', XLY: '可选消费',
}
const etfLabel = (s: string): string => `${ETF_NAMES[s] ?? s}（${s}）`

function signed(value: number, digits = 3): string {
  const body = Math.abs(value).toFixed(digits)
  return value < 0 ? `−${body}` : `+${body}`
}

type Picks = { S1: string[] | null; S2: string[] | null }
type ShadowRow = { month: string; picks: Picks; ret: { S1: number | null; S2: number | null; EW9: number | null; SPY: number | null }; estimate?: boolean }
type Shadow = { since: string; until: string; rows: ShadowRow[]; current: ShadowRow | null; upcoming: { month: string; picks: Picks } | null }
type ShadowLoad = { state: 'loading' } | { state: 'error' } | { state: 'ok'; data: Shadow }

function asShadow(body: unknown): Shadow | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Partial<Shadow>
  return typeof b.since === 'string' && typeof b.until === 'string' && Array.isArray(b.rows) && 'current' in b ? (b as Shadow) : null
}

const list = (xs: string[] | null): string => (xs ? xs.map(etfLabel).join('、') : '待上月底数据')

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
    return <p className="lab-shadow" data-testid="lab-sector-shadow">{load.state === 'loading' ? '影子读数加载中…' : '影子读数暂时加载不了'}</p>
  }
  const { since, until, rows, current, upcoming } = load.data
  const now = current ?? upcoming
  return (
    <div className="lab-shadow" data-testid="lab-sector-shadow">
      <p className="ss-p">
        <strong>影子记录（只记录、不操作，非建议）：</strong>
        {now ? `${now.month} 入选——S1：${list(now.picks.S1)}；S2：${list(now.picks.S2)}。` : '影子期已结束。'}
        {current && current.ret.S1 != null && current.ret.SPY != null
          ? ` 本月至今估算：S1 ${pct(current.ret.S1, 1, true)}，SPY ${pct(current.ret.SPY, 1, true)}。`
          : ''}
        计划 {since} 至 {until}，已冻结 {rows.length} 个月。
      </p>
    </div>
  )
}

const ROWS: { id: keyof typeof data.main; name: string; rule: string }[] = [
  { id: 'S1', name: 'S1 学术动量', rule: '按过去 12 个月（跳过最近 1 个月）的涨幅，持有最强 3 个板块' },
  { id: 'S2', name: 'S2 实务动量', rule: '按过去 3、6、12 个月涨幅的平均，持有最强 3 个板块' },
]

export default function SectorRotationStudy(): JSX.Element {
  const s1 = data.main.S1
  const s2 = data.main.S2
  return (
    <article className="ss-section lab-study" id="lab-sector-rotation" aria-labelledby="lab-sector-rotation-title" data-testid="lab-sector-rotation">
      <p className="lab-status">2026-11-26 · 已完成 · L-037 · 两个写法都「通过」 · 影子记录 2026-12 至 2027-11 · 仓位不变</p>
      <h2 id="lab-sector-rotation-title">美股板块轮动：每月持有最强的 3 个板块</h2>
      <div className="ss-cover lab-answer" data-testid="lab-sector-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          1927–2026 年，每月持有过去一年涨得最好的 3 个板块，比平均持有所有板块、比直接买大盘都好，随机时机检验显著，晚一个月执行也成立，用真实板块 ETF（2000–2026）也确认了。按事先的规则判「通过」，所以单独开了这个页签。
        </p>
        <p className="ss-p">
          但要一起看：<strong>2011 年以后它已经跑不赢大盘</strong>（夏普差 {signed(s1.dS.mktPost2011)}，年化 {pct(s1.post2011.cagr)} 对 {pct(s1.post2011.mktCagr)}，波动更大）；证据和以前的行业动量研究是同一批股票；国内很难照做。所以仓位不变、股票部分仍买宽基，先做 12 个月影子记录，期满由你决定。
        </p>
      </div>
      <ShadowNow />
      <TableWrap label="两个写法的检验结果" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-sector-table">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">写法<span className="lab-th-sub">1927–2026，扣成本</span></th>
              <th scope="col" className="num">夏普<span className="lab-th-sub">候选 / 等权 / 大盘</span></th>
              <th scope="col" className="num">年化<span className="lab-th-sub">候选 / 大盘</span></th>
              <th scope="col" className="num">2000 年后<span className="lab-th-sub">对大盘夏普差</span></th>
              <th scope="col" className="num">2011 年后<span className="lab-th-sub">对大盘夏普差</span></th>
              <th scope="col" className="num">板块 ETF<span className="lab-th-sub">对 SPY，2000–2026</span></th>
              <th scope="col">结论</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ id, name, rule }) => {
              const r = data.main[id]
              return (
                <tr key={id}>
                  <th scope="row" className="lab-sticky">{name}<span className="lab-rule">{rule}</span></th>
                  <td className="num">{fmtNum(r.cand.sharpe)} / {fmtNum(r.ew.sharpe)} / {fmtNum(r.mkt.sharpe)}</td>
                  <td className="num">{pct(r.cand.cagr)} / {pct(r.mkt.cagr)}</td>
                  <td className="num">{signed(r.dS.mktPost2000)}</td>
                  <td className="num">{signed(r.dS.mktPost2011)}</td>
                  <td className="num">{signed(r.dS.etfSpy)}</td>
                  <td><strong>{r.verdict}</strong></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <ul className="ss-list">
        <li>六道门槛：对等权全样本显著（Holm p {fmtNum(s1.pHolm, 4)}）；两半都更好（S1 {signed(s1.dS.half1)} / {signed(s1.dS.half2)}，S2 {signed(s2.dS.half1)} / {signed(s2.dS.half2)}）；2000 年以后更好；对大盘更好；晚一个月执行仍更好（S1 {signed(s1.dS.delay)}）；板块 ETF 对等权、对 SPY 都更好。</li>
        <li>最新入选（只是读数）：板块数据 2026-09 月末 S1 {s1.current.map(c => KF_NAMES[c] ?? c).join('、')}；板块 ETF 2026-10 月末 {s1.currentEtf.map(etfLabel).join('、')}。</li>
        <li>弱点：2011 年以后连平均持有所有板块都跑输大盘（夏普差 {signed(data.ewVsMktPost2011)}），少数大公司带动大盘时，任何分散到板块的做法都吃亏；交易成本提到 0.3%，2000 年以后的超额基本归零。</li>
        <li>换手每年约 {s1.turnover.toFixed(1)}–{s2.turnover.toFixed(1)} 倍。国内 QDII 能买到的美股板块产品不全，申赎费、溢价和额度会吃掉大部分超额；直接持有 SPDR，非美国人分红预扣 30%。结论不外推到 A 股或港股的行业。</li>
      </ul>
    </article>
  )
}
