import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/ui'
import { PageTitle } from '../components/ui/PageTabs'
import CandidateButton from '../components/CandidateButton'
import { buildAutoDcf } from '../features/dcf/autoDcf'
import type { PrefillLibrary } from '../features/dcf/autofill'
import { radarRows, RADAR_RULES, type RadarRow } from '../features/dcf/radar'
import { useCandidates } from '../features/candidates/useCandidates'
import type { CandidateMarket } from '../features/candidates/validation'
import '../styles/radar.css'

type MarketFilter = 'all' | 'cn' | 'hk' | 'us'
const MARKET_NAME: Record<'cn' | 'hk' | 'us', string> = { cn: 'A股', hk: '港股', us: '美股' }
const SYMBOL: Record<string, string> = { CNY: '¥', HKD: 'HK$', USD: '$' }
const money = (v: number, ccy: string) => `${SYMBOL[ccy] ?? ''}${v.toFixed(2)}`
const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`

interface CycleReport { records?: { weekEnding: string; markets: Record<string, { legacyState: string }> }[] }
const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'

function Signals({ r }: { r: RadarRow }): JSX.Element {
  return (
    <span className="radar-signals">
      <span className="radar-signal is-on" title={`现价 ${money(r.dcf.current, r.dcf.currency)} ≤ 买入参考价 ${money(r.dcf.buyBelow!, r.dcf.currency)}`}>低于买入参考价</span>
      <span className={`radar-signal${r.cheapVsHistory ? ' is-on' : ''}`} title={r.history == null ? '历史不足两年' : `自由现金流收益率高于近5年 ${r.history}% 的时间（门槛 ${RADAR_RULES.historyPct}%）`}>
        比自己过去便宜{r.history != null ? `（${r.history}%）` : '（无数据）'}
      </span>
      <span className={`radar-signal${r.cheapVsPeers ? ' is-on' : ''}`} title={r.peers ? `${r.peers.industry} ${r.peers.count} 家中收益率排第 ${r.peers.rank}` : '同行不足4家'}>
        比同行便宜{r.peers ? `（${r.peers.rank}/${r.peers.count}）` : '（无同行）'}
      </span>
    </span>
  )
}

export default function Radar(): JSX.Element {
  const [lib, setLib] = useState<PrefillLibrary | null | 'error'>(null)
  const [cycle, setCycle] = useState<CycleReport | null>(null)
  const [market, setMarket] = useState<MarketFilter>('all')
  const [showAll, setShowAll] = useState(false)
  const cand = useCandidates(true)

  useEffect(() => {
    let active = true
    fetch(`${BASE}data/dcf-prefill.json`, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: PrefillLibrary) => { if (active) setLib(body?.schemaVersion === 1 ? body : 'error') })
      .catch(() => active && setLib('error'))
    fetch(`${BASE}data/market-cycle-report.json`, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(b => active && setCycle(b)).catch(() => undefined)
    return () => { active = false }
  }, [])

  const rows = useMemo(() => (lib && lib !== 'error' ? radarRows(lib.items, buildAutoDcf(lib)) : []), [lib])
  const shown = rows.filter(r => market === 'all' || r.item.m === market)
  const tiers: [string, string, RadarRow[]][] = [
    ['三项共振', '低于买入参考价，且比自己过去、比同行都便宜。优先研究。', shown.filter(r => r.score === 2)],
    ['两项信号', '低于买入参考价，另有一项相对便宜。', shown.filter(r => r.score === 1)],
    ['仅估值信号', '低于买入参考价，但不比自己过去或同行便宜，可能是行业整体低估或模型偏乐观。', shown.filter(r => r.score === 0)],
  ]
  const latest = cycle?.records?.[0]
  const candMarket = (r: RadarRow): CandidateMarket => (r.item.m === 'us' && !r.item.g.includes('研究公司') ? 'ndx' : r.item.m)
  const inPool = (r: RadarRow) => cand.items.some(i => i.market === candMarket(r) && i.code === r.item.c)

  return (
    <Page className="radar-page">
      <PageTitle>机会雷达</PageTitle>
      <section className="radar-intro">
        <h2>估值信号共振的研究短名单</h2>
        <p>
          在沪深300、恒指、恒生科技、纳指100及研究公司里，筛出<strong>现价低于 DCF 买入参考价</strong>的公司（已排除可信度低、金融业与现金流为负的公司），
          再看是否同时<strong>比自己近 5 年大多数时候便宜</strong>、<strong>比同行便宜</strong>。信号越多越值得优先研究。
        </p>
        <p className="radar-muted">
          这是按统一规则得到的研究线索，不是买入建议：自动 DCF 用历史现金流外推，周期股、业务转型期公司容易失真。点公司名进入 DCF 页可查看并调整全部假设。
          {lib && lib !== 'error' && ` 数据更新于 ${lib.generatedAt.slice(0, 10)}。`}
        </p>
        {latest && (
          <p className="radar-cycle">
            市场环境（牛熊周期周报 {latest.weekEnding}）：A股 {latest.markets.csi300?.legacyState ?? '—'} · 恒指 {latest.markets.hsi?.legacyState ?? '—'} · 恒生科技 {latest.markets.hstech?.legacyState ?? '—'}。
            {Object.values(latest.markets).some(m => m.legacyState === '趋势防守') ? '处于趋势防守的市场，即使个股便宜也宜分批、留足现金。' : ''}
          </p>
        )}
      </section>

      <div className="ui-cluster radar-filters" role="group" aria-label="市场">
        {(['all', 'cn', 'hk', 'us'] as MarketFilter[]).map(m => (
          <button key={m} type="button" className={market === m ? 'ui-chip is-active' : 'ui-chip'} aria-pressed={market === m} onClick={() => setMarket(m)}>
            {m === 'all' ? '全部' : MARKET_NAME[m]} <span className="ui-chip__count">{m === 'all' ? rows.length : rows.filter(r => r.item.m === m).length}</span>
          </button>
        ))}
      </div>

      {lib === null && <p role="status">正在加载预填库…</p>}
      {lib === 'error' && <p role="alert">预填库暂时无法加载，请稍后再试。</p>}
      {lib && lib !== 'error' && shown.length === 0 && <p>当前没有符合条件的公司。</p>}

      {tiers.map(([title, hint, list], i) => list.length === 0 || (i === 2 && !showAll) ? (i === 2 && list.length > 0 ? (
        <button key={title} type="button" className="tool-btn radar-more" onClick={() => setShowAll(true)}>显示“仅估值信号”的 {list.length} 家</button>
      ) : null) : (
        <section key={title} className="radar-tier" aria-labelledby={`radar-${i}`}>
          <h3 id={`radar-${i}`}>{title} <span className="radar-count">{list.length} 家</span></h3>
          <p className="radar-muted">{hint}</p>
          <div className="radar-table-wrap">
            <table className="radar-table">
              <thead>
                <tr><th scope="col">公司</th><th scope="col">现价</th><th scope="col">合理价</th><th scope="col">买入参考</th><th scope="col">安全边际</th><th scope="col">可信度</th><th scope="col">信号</th><th scope="col">候选</th></tr>
              </thead>
              <tbody>
                {list.map(r => (
                  <tr key={`${r.item.m}:${r.item.c}`}>
                    <td>
                      <Link to={`/dcf?${new URLSearchParams({ code: r.item.c, market: r.item.m, currency: r.item.ccy })}`}>{r.item.n}</Link>
                      <small>{r.item.c} · {MARKET_NAME[r.item.m]}{r.item.ind ? ` · ${r.item.ind}` : ''}</small>
                    </td>
                    <td>{money(r.dcf.current, r.dcf.currency)}</td>
                    <td>{money(r.dcf.fair!, r.dcf.currency)}</td>
                    <td>{money(r.dcf.buyBelow!, r.dcf.currency)}</td>
                    <td className="radar-mos">{pct(r.mos)}</td>
                    <td><span className={`radar-cred is-${r.dcf.credibility}`}>{r.dcf.credibility === 'high' ? '高' : '中'}</span></td>
                    <td><Signals r={r} /></td>
                    <td><CandidateButton on={inPool(r)} onClick={() => cand.toggle(candMarket(r), r.item.c)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="radar-muted radar-foot">
        规则：自动 DCF 采用近 3 年平均自由现金流、营收增速（上限 15%）、CAPM 折现率与三阶段模型；买入参考价按可信度在合理价上留 20%（高）/ 30%（中）安全边际；
        “比自己过去便宜”指自由现金流收益率高于近 5 年 {RADAR_RULES.historyPct}% 以上的月份；“比同行便宜”指收益率不低于同市场同行业中位数（同行至少 4 家）。
      </p>
    </Page>
  )
}
