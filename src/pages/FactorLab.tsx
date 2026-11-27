import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Page, TableWrap } from '../components/ui'
import '../styles/combined-strategy.css'
import '../styles/strategy-spec.css'
import '../styles/strategy-lab.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
const DATA_URL = `${BASE.endsWith('/') ? BASE : `${BASE}/`}data/factorlab.json`

export const FACTOR_LAB_LEAD =
  '长期因子挖掘与回测的研究基建，覆盖 A 股、港股、美股：先在留出数据之外自由探索，再用没看过的股票和锁起来的近三年数据确认。这里只显示进度和结论，不是买卖建议；通过检验的策略也不会自动加入综合策略。'

interface DataRow { market: string; label: string; desc: string; rows: number | null; securities: number | null; coverage: [string, string] | null; grade: string; gradeText: string; downloadedAt: string }
interface Validation { market: string; check: string; value: number | null; unit: string; note: string }
interface LedgerRow { records: number; trials: number; distinct: number; byMode: Record<string, number>; factors: string[]; last: string | null }
interface GuardMarket { start: string; end: string; used: number; batches: number }
interface Round { id: string; file: string; status: string; summary?: string; candidates?: Record<string, string[]> }
interface MultipleMarket {
  market: string
  label: string
  trials: number
  effectiveTrials: number
  pbo: number | null
  tGe2Actual: number
  tGe2Expected: number | null
  tGe2Ci90: [number, number] | null
}
interface MultipleCandidate { id: string; label: string; factor: string; dsr: number | null; nwT: number | null; srPeriod: number | null }
export interface MultipleTesting {
  generatedAt?: string
  totalTrials?: number
  totalExploreDistinct?: number
  markets?: MultipleMarket[]
  candidates?: MultipleCandidate[]
  headline?: string
  caveat?: string
  unavailable?: boolean
}
export interface FactorLabData {
  generatedAt: string
  data: DataRow[]
  validation: Validation[]
  ledger: Record<string, LedgerRow>
  guard: { budget: number; exploreFrac: number; embargoMonths: number; markets: Record<string, GuardMarket> }
  rounds: Round[]
  multipleTesting?: MultipleTesting
}

const MARKET_LABEL: Record<string, string> = { cn: 'A 股', hk: '港股', us: '美股', us_kf: '美国因子组合' }
const FACTOR_LABEL: Record<string, string> = { cn_sue: '盈余惊喜', cn_sur: '营收惊喜', turnover_vol_20d: '换手波动', cn_multi4: '四合一组合（惊喜 + 换手稳定 + 价值）' }
const MODE_LABEL: Record<string, string> = { explore: '探索', validate: '截面验证', confirm: '锁箱确认', forward: '前推' }
/** R3 → 第 3 轮（R3）：轮次编号保留在括号里，摘要里会用它互相引用 */
const roundLabel = (id: string): string => { const m = /^R(\d+)$/.exec(id); return m ? `第 ${m[1]} 轮（${id}）` : id }
const fmtInt = (v: number | null | undefined): string => (v == null ? '—' : v.toLocaleString('zh-CN'))
const fmtNum = (v: number | null | undefined, d = 2): string => (v == null || Number.isNaN(v) ? '—' : v.toFixed(d))

function hasMultipleTesting(mt: MultipleTesting | undefined): mt is MultipleTesting {
  return !!mt && !mt.unavailable && Array.isArray(mt.markets) && mt.markets.length > 0
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; data: FactorLabData }

function useFactorLab(): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch(DATA_URL, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: FactorLabData) => setLoad(Array.isArray(body?.data) ? { state: 'ok', data: body } : { state: 'error' }))
      .catch(() => { if (!controller.signal.aborted) setLoad({ state: 'error' }) })
    return () => controller.abort()
  }, [])
  return load
}

function Steps(): JSX.Element {
  const steps = [
    ['探索', '70% 的股票、2023-10 以前的数据，随便试；每次评估自动记账。'],
    ['截面验证', '另外 30% 的股票、同一时期，每个因子版本只跑一次。'],
    ['预注册', '写下候选和门槛并提交，之后不能改。'],
    ['锁箱确认', '2023-11 至 2026-11 的数据平时谁都看不到；按季度批量解封，每个市场一辈子最多确认 24 个候选。'],
    ['前推记录', '2026-12 起的新数据，所有预注册过的候选都按月记账，表现差就撤下。'],
  ]
  return (
    <ol className="ss-list" data-testid="fl-steps">
      {steps.map(([t, d]) => <li key={t}><strong>{t}</strong>：{d}</li>)}
    </ol>
  )
}

export default function FactorLab(): JSX.Element {
  const load = useFactorLab()
  return (
    <Page className="cs-page ss-page lab-page">
      <header className="page-head cs-head">
        <h1>因子实验室</h1>
        <p className="cs-head__lead" data-testid="fl-lead">{FACTOR_LAB_LEAD}</p>
      </header>

      <div className="ss-body">
        <section className="ss-section" aria-labelledby="fl-steps-title">
          <h2 id="fl-steps-title">一个因子要过哪几关</h2>
          <Steps />
        </section>

        {load.state !== 'ok' ? (
          <p className="ss-p" data-testid="fl-status">{load.state === 'loading' ? '读数加载中…' : '读数暂时加载不了'}</p>
        ) : (
          <>
            <section className="ss-section" aria-labelledby="fl-rounds-title">
              <h2 id="fl-rounds-title">挖掘进度</h2>
              <ul className="ss-list" data-testid="fl-rounds">
                {load.data.rounds.map(r => (
                  <li key={r.id}>
                    <strong>{roundLabel(r.id)}</strong>（{r.status}）{r.summary ? `：${r.summary}` : ''}
                    {r.candidates && Object.entries(r.candidates).map(([m, list]) => (
                      <span key={m}> · {MARKET_LABEL[m] ?? m}候选：{list.length ? list.map(f => FACTOR_LABEL[f] ?? f).join('、') : '无'}</span>
                    ))}
                  </li>
                ))}
              </ul>
              <p className="ss-p" data-testid="fl-pending">
                A 股第一批锁箱确认已预注册 4 个候选：盈余惊喜、营收惊喜、换手波动，以及第 8 轮新增的四合一组合（门槛写定后不改）。锁箱到 2026-11-30，
                12 月补齐行情后一次性解封确认。三年锁箱功效低，即使因子真实有效，「通过」的概率也只有一到三成。美国因子组合的锁箱已在 2026-11-28 为风格轮动（L-042）解封一批。
              </p>
            </section>

            <section className="ss-section" aria-labelledby="fl-guard-title">
              <h2 id="fl-guard-title">试验次数与锁箱</h2>
              <p className="ss-p">试验做得越多，碰巧好看的就越多，所以每次评估都记账；确认时按试验次数打折。</p>
              <TableWrap label="各市场的试验次数与锁箱预算" className="lab-wrap">
                <table className="cs-table lab-table" data-testid="fl-guard">
                  <thead>
                    <tr>
                      <th scope="col" className="lab-sticky">市场</th>
                      <th scope="col" className="num">已做试验</th>
                      <th scope="col">按阶段</th>
                      <th scope="col">锁箱区间</th>
                      <th scope="col" className="num">已用确认名额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(load.data.guard.markets).map(([m, g]) => {
                      const l = load.data.ledger[m]
                      return (
                        <tr key={m}>
                          <th scope="row" className="lab-sticky">{MARKET_LABEL[m] ?? m}</th>
                          <td className="num">{fmtInt(l?.trials ?? 0)}</td>
                          <td>{l ? Object.entries(l.byMode).map(([k, v]) => `${MODE_LABEL[k] ?? k} ${v}`).join('，') : '—'}</td>
                          <td>{g.start} 至 {g.end}</td>
                          <td className="num">{g.used} / {load.data.guard.budget}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableWrap>
            </section>

            {hasMultipleTesting(load.data.multipleTesting) ? (
              <section className="ss-section" aria-labelledby="fl-luck-title" data-testid="fl-luck">
                <h2 id="fl-luck-title">试了这么多次，会不会是运气</h2>
                <p className="ss-p">{load.data.multipleTesting.headline}</p>
                <p className="ss-p">
                  探索区一共试过 {fmtInt(load.data.multipleTesting.totalExploreDistinct)} 种写法
                  （登记 {fmtInt(load.data.multipleTesting.totalTrials)} 次）。
                  写法彼此相关，按月度收益抱团后「有效试验数」更少；过拟合概率衡量「样本里看起来最好的，换一段样本是否还好」——接近 0.5 表示挑选几乎没信息，明显低于 0.5 才像有货。
                  t 值衡量收益离 0 有多远：t 值 ≥ 2 大约相当于纯属偶然的概率不到 2.5%。
                  紧缩夏普则是：单个写法的夏普，扣掉「试这么多次后纯运气也能摸到的最好水平」，常用门槛 0.95。
                </p>
                <TableWrap label="各市场多重检验摘要" className="lab-wrap">
                  <table className="cs-table lab-table" data-testid="fl-luck-markets">
                    <thead>
                      <tr>
                        <th scope="col" className="lab-sticky">市场</th>
                        <th scope="col" className="num">探索写法</th>
                        <th scope="col" className="num">有效试验数</th>
                        <th scope="col" className="num">过拟合概率</th>
                        <th scope="col" className="num">t 值 ≥ 2 的写法</th>
                        <th scope="col" className="num">运气预期</th>
                      </tr>
                    </thead>
                    <tbody>
                      {load.data.multipleTesting.markets!.map(m => (
                        <tr key={m.market}>
                          <th scope="row" className="lab-sticky">{m.label}</th>
                          <td className="num">{fmtInt(m.trials)}</td>
                          <td className="num">{fmtInt(m.effectiveTrials)}</td>
                          <td className="num">{fmtNum(m.pbo, 2)}</td>
                          <td className="num">{fmtInt(m.tGe2Actual)}</td>
                          <td className="num">
                            {fmtNum(m.tGe2Expected, 1)}
                            {m.tGe2Ci90 ? `（${fmtNum(m.tGe2Ci90[0], 0)}–${fmtNum(m.tGe2Ci90[1], 0)}）` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
                {load.data.multipleTesting.candidates && load.data.multipleTesting.candidates.length > 0 ? (
                  <>
                    <p className="ss-p">三个已进锁箱确认的 A 股候选，按有效试验数校正后的紧缩夏普：</p>
                    <TableWrap label="锁箱候选紧缩夏普" className="lab-wrap">
                      <table className="cs-table lab-table" data-testid="fl-luck-candidates">
                        <thead>
                          <tr>
                            <th scope="col" className="lab-sticky">候选</th>
                            <th scope="col" className="num">t 值</th>
                            <th scope="col" className="num">紧缩夏普</th>
                          </tr>
                        </thead>
                        <tbody>
                          {load.data.multipleTesting.candidates.map(c => (
                            <tr key={c.id}>
                              <th scope="row" className="lab-sticky">{c.label}</th>
                              <td className="num">{fmtNum(c.nwT, 2)}</td>
                              <td className="num">{fmtNum(c.dsr, 2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableWrap>
                  </>
                ) : null}
                {load.data.multipleTesting.caveat ? <p className="ss-p lab-rule">{load.data.multipleTesting.caveat}</p> : null}
              </section>
            ) : null}

            <section className="ss-section" aria-labelledby="fl-data-title">
              <h2 id="fl-data-title">数据</h2>
              <TableWrap label="各市场数据概况" className="lab-wrap">
                <table className="cs-table lab-table" data-testid="fl-data">
                  <thead>
                    <tr>
                      <th scope="col" className="lab-sticky">数据集</th>
                      <th scope="col" className="num">证券 / 公司</th>
                      <th scope="col" className="num">行数</th>
                      <th scope="col">区间</th>
                      <th scope="col">幸存者偏差</th>
                    </tr>
                  </thead>
                  <tbody>
                    {load.data.data.map(d => (
                      <tr key={d.market}>
                        <th scope="row" className="lab-sticky">{d.label}<span className="lab-rule">{d.desc}</span></th>
                        <td className="num">{fmtInt(d.securities)}</td>
                        <td className="num">{fmtInt(d.rows)}</td>
                        <td>{d.coverage ? `${d.coverage[0].slice(0, 7)} 至 ${d.coverage[1].slice(0, 7)}` : '—'}</td>
                        <td>{d.gradeText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <p className="ss-p">有幸存者偏差的数据（港股、美股个股）上得到的结论，不能单独据此采用。</p>
            </section>

            <section className="ss-section" aria-labelledby="fl-val-title">
              <h2 id="fl-val-title">引擎校验</h2>
              <ul className="ss-list" data-testid="fl-validation">
                {load.data.validation.map(v => (
                  <li key={v.check}><strong>{v.check}</strong>{v.value != null ? `：${v.unit} ${v.value.toFixed(2)}` : ''}。{v.note}。</li>
                ))}
              </ul>
            </section>

            <p className="ss-p" data-testid="fl-generated">数据更新于 {load.data.generatedAt.slice(0, 10)}。</p>
          </>
        )}

        <section className="ss-section" aria-labelledby="fl-run-title">
          <h2 id="fl-run-title">在本机运行</h2>
          <p className="ss-p">代码在仓库 <code>research-py/factorlab/</code>，数据只存本机（不进 git）。常用命令：</p>
          <pre className="ss-p"><code>{`cd research-py
uv run python -m factorlab.cli list-factors
uv run python -m factorlab.cli eval --market cn --factor rev_1m
uv run python -m factorlab.cli ledger --market cn
uv run python -m factorlab.export_site   # 更新本页数据`}</code></pre>
          <p className="ss-p">设计、数据说明和校验记录见仓库 <code>docs/research/factorlab/</code>。</p>
        </section>
      </div>

      <footer className="cs-footer" role="note">
        <p>
          美股仓位规则见 <Link to="/invest/strategy">综合策略</Link>；没通过的低频研究见 <Link to="/invest/strategy-lab">研究中</Link>，
          通过检验的见 <Link to="/invest/verified">通过检验</Link>；因子方法与口径见 <Link to="/invest/fundamental-quant">基本面量化</Link>。
        </p>
        <p>历史统计，不构成买卖建议。</p>
      </footer>
    </Page>
  )
}
