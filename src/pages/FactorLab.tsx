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
export interface FactorLabData {
  generatedAt: string
  data: DataRow[]
  validation: Validation[]
  ledger: Record<string, LedgerRow>
  guard: { budget: number; exploreFrac: number; embargoMonths: number; markets: Record<string, GuardMarket> }
  rounds: Round[]
}

const MARKET_LABEL: Record<string, string> = { cn: 'A 股', hk: '港股', us: '美股', us_kf: '美国因子组合' }
const FACTOR_LABEL: Record<string, string> = { cn_sue: '盈余惊喜', cn_sur: '营收惊喜', turnover_vol_20d: '换手波动' }
const MODE_LABEL: Record<string, string> = { explore: '探索', validate: '截面验证', confirm: '锁箱确认', forward: '前推' }
const fmtInt = (v: number | null | undefined): string => (v == null ? '—' : v.toLocaleString('zh-CN'))

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
                    <strong>{r.id}</strong>（{r.status}）{r.summary ? `：${r.summary}` : ''}
                    {r.candidates && Object.entries(r.candidates).map(([m, list]) => (
                      <span key={m}> · {MARKET_LABEL[m] ?? m}候选：{list.length ? list.map(f => (FACTOR_LABEL[f] ? `${FACTOR_LABEL[f]}（${f}）` : f)).join('、') : '无'}</span>
                    ))}
                  </li>
                ))}
              </ul>
              <p className="ss-p" data-testid="fl-pending">
                A 股第一批锁箱确认已预注册（盈余惊喜、营收惊喜、换手波动 3 个候选，门槛写定后不改）：锁箱到 2026-11-30，
                12 月补齐行情后一次性解封确认。三年锁箱功效低，即使因子真实有效，「通过」的概率也只有一到两成。
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
