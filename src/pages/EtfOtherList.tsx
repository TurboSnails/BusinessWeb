import React from 'react'
import { Link } from 'react-router-dom'
import EtfDocumentRemark from './EtfDocumentRemark'
import EtfTechCell from '../components/EtfTechCell'
import { fmt, type EtfTechRecord } from '../data/etfTechnical'
import { latestEtfNote } from '../utils/etfJudgment'

/** 策略 / 商品 / 货币 ETF 与场外债基的代码清单；名称与行情指标来自 etf-technical 数据 */
export const OTHER_ETFS: Array<{ code: string; kind: '策略' | '商品' | '货币'; role: string }> = [
  { code: '512890', kind: '策略', role: '红利低波因子' },
  { code: '518880', kind: '商品', role: '黄金现货' },
  { code: '511880', kind: '货币', role: '场内现金管理' },
]
export const BOND_FUNDS = ['000015', '006337', '161716', '110017', '019372', '010011', '000143']

const pct = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`)

export function OtherEtfList({ tech }: { tech: Map<string, EtfTechRecord> }): JSX.Element {
  return (
    <section id="other-etf" className="industry-group-section" aria-labelledby="other-etf-title">
      <div className="industry-group-card">
        <div className="industry-group-header">
          <h2 id="other-etf-title" className="industry-group-title">策略、商品与货币 ETF</h2>
          <span className="industry-group-count">{OTHER_ETFS.length} 只</span>
        </div>
        <div className="industry-table-wrapper">
          <table className="report-table industry-etf-table other-etf-table">
            <colgroup><col /><col /><col /><col /><col /><col /><col /></colgroup>
            <thead><tr><th>代码</th><th>名称</th><th>类别</th><th>收盘 / 日涨跌</th><th>技术面</th><th>备注</th><th>网格</th></tr></thead>
            <tbody>{OTHER_ETFS.map(item => {
              const rec = tech.get(item.code)
              const slug = latestEtfNote(item.code)?.slug
              const name = rec?.name ?? item.code
              return (
                <tr key={item.code}>
                  <td className="etf-code-cell">{slug ? <Link className="etf-code-link" to={`/notes/${slug}`}>{item.code}</Link> : item.code}</td>
                  <td className="etf-name-cell">{slug ? <Link className="etf-name-link" to={`/notes/${slug}`}>{name}</Link> : name}</td>
                  <td className="etf-subtheme-cell"><strong>{item.kind}</strong><div>{item.role}</div></td>
                  <td className="etf-num-cell">{rec ? <>{fmt(rec.close, 3)}<small>{pct(rec.changePct)}</small></> : '—'}</td>
                  <td className="etf-tech-cell"><EtfTechCell rec={rec} /></td>
                  <td className="etf-remark-cell"><EtfDocumentRemark code={item.code} /></td>
                  <td className="etf-grid-cell"><Link className="etf-ref-link" to={`/grid-trading?code=${item.code}&name=${encodeURIComponent(name)}`}>行情·网格</Link></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export function BondFundList({ tech }: { tech: Map<string, EtfTechRecord> }): JSX.Element {
  return (
    <section id="bond-fund" className="industry-group-section" aria-labelledby="bond-fund-title">
      <div className="industry-group-card">
        <div className="industry-group-header">
          <h2 id="bond-fund-title" className="industry-group-title">债券基金（场外）</h2>
          <span className="industry-group-count">{BOND_FUNDS.length} 只</span>
        </div>
        <div className="industry-table-wrapper">
          <table className="report-table industry-etf-table bond-fund-table">
            <colgroup><col /><col /><col /><col /><col /><col /></colgroup>
            <thead><tr><th>代码</th><th>名称</th><th>净值 / 披露日</th><th>近 20 日</th><th>技术面</th><th>参考</th></tr></thead>
            <tbody>{BOND_FUNDS.map(code => {
              const rec = tech.get(code)
              return (
                <tr key={code}>
                  <td className="etf-code-cell">{code}</td>
                  <td className="etf-name-cell">{rec?.name ?? '—'}</td>
                  <td className="etf-num-cell">{rec ? <>{fmt(rec.close, 4)}<small>{rec.navDate ?? rec.asOf}</small></> : '—'}</td>
                  <td className="etf-num-cell">{pct(rec?.return20SessionsPct)}</td>
                  <td className="etf-tech-cell"><EtfTechCell rec={rec} /></td>
                  <td className="etf-ref-cell"><Link className="etf-ref-link" to="/invest/bond-fund-report">债基研究报告</Link></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
        <p className="etf-other-note">净值为实际披露净值（分红再投资口径），按披露日计算，不用估算净值。债基净值走势平滑，RSI 常年偏高，「超买」不等于该卖出，技术指标对债基参考价值有限。</p>
      </div>
    </section>
  )
}
