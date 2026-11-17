// 同花顺 · 数据中心（/ths-mood/datacenter）：功能对照同花顺 App 宫格「特色数据」里的列表类入口——打新日历与次新股、限售解禁、
// 重要股东增减持、股权质押与商誉、股票回购。数据：public/data/ths-tab-datacenter.json（scripts/ths-datacenter.mjs 盘后生成，
// 来源东方财富数据中心公开报表与日 K）。只列客观数值与阈值说明，不做评级，不是买卖建议。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, Page, PageDataFreshness, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import ThsTabs, { THS_DISCLAIMER } from '../../features/ths-tabs/ThsTabs'
import { asThsDatacenter, fixed, md, METHOD, money, pct, shares, tone, type BuybackRow, type HolderRank, type HolderRow, type IpoCal, type LiftRow, type SubNew, type ThsDatacenter as Data } from '../../features/ths-datacenter/model'
import '../../styles/market-mood.css'
import '../../styles/ths-datacenter.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'

function useData(): { loading: boolean; data: Data | null } {
  const [state, setState] = useState<{ loading: boolean; data: Data | null }>({ loading: true, data: null })
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/ths-tab-datacenter.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((body: unknown) => { if (!controller.signal.aborted) setState({ loading: false, data: asThsDatacenter(body) }) })
      .catch(() => { if (!controller.signal.aborted) setState({ loading: false, data: null }) })
    return () => controller.abort()
  }, [])
  return state
}

/* ---------- 通用表格：首列名称代码吸附，超过 limit 行时可展开 ---------- */
type Col<T> = { key: string; label: string; num?: boolean; render: (r: T) => React.ReactNode; cls?: (r: T) => string }
function DcTable<T extends { code: string; name: string }>({ label, rows, cols, rowKey, limit = 30, empty = '暂无数据' }: {
  label: string
  rows: T[]
  cols: Array<Col<T>>
  rowKey: (r: T, i: number) => string
  limit?: number
  empty?: string
}): JSX.Element {
  const [all, setAll] = useState(false)
  if (!rows.length) return <p className="mm-empty">{empty}</p>
  const shown = all ? rows : rows.slice(0, limit)
  return (
    <>
      <TableWrap label={label} stickyFirst>
        <table className="mm-table dc-table">
          <thead>
            <tr>
              <th scope="col">名称</th>
              {cols.map(c => <th key={c.key} scope="col" className={c.num ? 'num' : undefined}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={rowKey(r, i)}>
                <th scope="row" className="dc-name">{r.name}<small>{r.code}</small></th>
                {cols.map(c => <td key={c.key} className={[c.num ? 'num' : '', c.cls?.(r) ?? ''].join(' ').trim() || undefined}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {rows.length > limit && (
        <button type="button" className="dc-more" onClick={() => setAll(v => !v)}>{all ? '收起' : `显示全部 ${rows.length} 条`}</button>
      )}
    </>
  )
}

/* ---------- 顶部总览 ---------- */
function TopPanel({ d }: { d: Data }): JSX.Element {
  const waiting = d.ipo.calendar.filter(r => r.status === '待申购').length
  const s = d.ipo.subNew
  const up = d.lift.upcoming
  const h = d.holders
  // 净额：任一方向金额缺失（有记录但都没均价）时整体为缺失，不把缺失当 0
  const net = h.incAmount === null || h.decAmount === null ? null : h.incAmount + h.decAmount
  const bb = d.buyback
  const planMissing = Math.max(bb.newPlanLowMissing ?? 0, bb.newPlanHighMissing ?? 0)
  return (
    <section className="dc-top" aria-label="数据中心总览">
      <div className="dc-top__cell">
        <span className="dc-top__label">待申购新股</span>
        <strong className="dc-top__value">{waiting}</strong>
        <span className="dc-top__sub">近 30 日以来申购 {d.ipo.calendar.length} 只</span>
      </div>
      <div className="dc-top__cell">
        <span className="dc-top__label">次新股破发率</span>
        <strong className="dc-top__value">{pct(s.brokeRate, false, 1)}</strong>
        <span className="dc-top__sub">{s.brokeCount} / {s.valid} 只 · 累计涨幅中位数 <b className={tone(s.medianCum)}>{pct(s.medianCum)}</b></span>
      </div>
      <div className="dc-top__cell">
        <span className="dc-top__label">未来 30 日解禁市值</span>
        <strong className="dc-top__value">{money(up.cap)}</strong>
        <span className="dc-top__sub">{up.count} 批次{up.capMissing ? ` · ${up.capMissing} 批停牌未计` : ''}</span>
      </div>
      <div className="dc-top__cell">
        <span className="dc-top__label">近 30 日股东增减持（有均价）</span>
        <strong className={`dc-top__value ${tone(net)}`}>{money(net, true)}</strong>
        <span className="dc-top__sub"><b className="mm-up">增 {money(h.incAmount)}</b> / <b className="mm-down">减 {money(h.decAmount === null ? null : Math.abs(h.decAmount))}</b></span>
      </div>
      <div className="dc-top__cell">
        <span className="dc-top__label">近 30 日回购公告</span>
        <strong className="dc-top__value">{d.buyback.count}</strong>
        <span className="dc-top__sub">新预案 {bb.newPlans} 份 · 计划 {money(bb.newPlanLow)}–{money(bb.newPlanHigh)}{planMissing ? `（${planMissing} 份未披露金额未计）` : ''}</span>
      </div>
    </section>
  )
}

/* ---------- 新股与次新 ---------- */
const STATUS_CLS: Record<IpoCal['status'], string> = { 待申购: 'is-wait', 待上市: 'is-pending', 已上市: 'is-listed' }
function IpoCard({ d }: { d: Data }): JSX.Element {
  const [view, setView] = useState<'cal' | 'recent' | 'sub'>('cal')
  const [subSort, setSubSort] = useState<'date' | 'cum' | 'broke'>('date')
  const s = d.ipo.subNew
  const subRows = useMemo(() => {
    const rows = [...s.rows]
    if (subSort === 'cum') rows.sort((a, b) => (b.cumPct ?? -Infinity) - (a.cumPct ?? -Infinity))
    if (subSort === 'broke') return rows.filter(r => r.broke).sort((a, b) => (a.cumPct ?? 0) - (b.cumPct ?? 0))
    return rows
  }, [s.rows, subSort])
  const subCols: Array<Col<SubNew>> = [
    { key: 'board', label: '板块', render: r => r.board },
    { key: 'list', label: '上市日', render: r => r.listDate },
    { key: 'price', label: '发行价', num: true, render: r => fixed(r.issuePrice) },
    { key: 'pe', label: '发行市盈率', num: true, render: r => fixed(r.issuePe) },
    { key: 'first', label: '首日涨幅', num: true, render: r => pct(r.firstPct), cls: r => tone(r.firstPct) },
    { key: 'cum', label: '累计涨幅', num: true, render: r => (r.cumPct === null ? '停牌' : pct(r.cumPct)), cls: r => tone(r.cumPct) },
    { key: 'since', label: '首日以来', num: true, render: r => pct(r.sinceFirstPct), cls: r => tone(r.sinceFirstPct) },
    { key: 'days', label: '上市交易日', num: true, render: r => (r.days === null ? '—' : r.days) },
    { key: 'broke', label: '破发', render: r => (r.broke ? <span className="dc-tag is-down">破发</span> : r.broke === false ? '否' : '—') },
  ]
  return (
    <Card title="新股与次新" as="section" className="mm-card"
      description={view === 'cal' ? '申购日历：申购日、发行价、发行市盈率与行业市盈率、中签率、上市日' : view === 'recent' ? `近 30 日上市的新股（${d.ipo.recent.length} 只）` : `${s.from} 以来上市的次新股 ${s.count} 只`}
      actions={<Segmented items={[{ id: 'cal', label: '申购日历' }, { id: 'recent', label: '近期上市' }, { id: 'sub', label: '次新股' }]} value={view} onChange={setView} label="新股视图" />}>
      {view === 'cal' && (
        <>
          <DcTable label="新股申购日历" rows={d.ipo.calendar} rowKey={r => r.code} empty="近 30 日没有新股申购"
            cols={[
              { key: 'status', label: '状态', render: r => <span className={`dc-tag ${STATUS_CLS[r.status]}`}>{r.status}</span> },
              { key: 'board', label: '板块', render: r => r.board },
              { key: 'apply', label: '申购日', render: r => r.applyDate },
              { key: 'acode', label: '申购代码', render: r => r.applyCode ?? '—' },
              { key: 'price', label: '发行价', num: true, render: r => fixed(r.issuePrice) },
              { key: 'pe', label: '发行市盈率', num: true, render: r => fixed(r.issuePe) },
              { key: 'ipe', label: '行业市盈率', num: true, render: r => fixed(r.industryPe) },
              { key: 'diff', label: '相对行业', num: true, render: r => pct(r.peDiff, true, 1) },
              { key: 'lot', label: '中签率', num: true, render: r => (r.lotRate === null ? '—' : `${r.lotRate.toFixed(4)}%`) },
              { key: 'ballot', label: '中签公布', render: r => md(r.ballotDate) },
              { key: 'list', label: '上市日', render: r => r.listDate ?? '未定' },
            ]} />
          <p className="mm-method">{METHOD.calendar}</p>
        </>
      )}
      {view === 'recent' && (
        <>
          <DcTable label="近期上市新股表现" rows={d.ipo.recent} rowKey={r => r.code} cols={subCols} empty="近 30 日没有新股上市" />
          <p className="mm-method">{METHOD.subNew}</p>
        </>
      )}
      {view === 'sub' && (
        <>
          <dl className="dc-stats">
            <div><dt>次新股</dt><dd>{s.count} 只</dd></div>
            <div><dt>破发</dt><dd>{s.brokeCount} 只（{pct(s.brokeRate, false, 1)}）</dd></div>
            <div><dt>累计涨幅中位数</dt><dd className={tone(s.medianCum)}>{pct(s.medianCum)}</dd></div>
            <div><dt>首日涨幅中位数</dt><dd className={tone(s.medianFirst)}>{pct(s.medianFirst)}</dd></div>
          </dl>
          <Segmented items={[{ id: 'date', label: '按上市日' }, { id: 'cum', label: '累计涨幅排行' }, { id: 'broke', label: '只看破发' }]} value={subSort} onChange={setSubSort} label="次新股排序" />
          <DcTable label="次新股表现" rows={subRows} rowKey={r => r.code} cols={subCols} empty="没有破发的次新股" />
          <p className="mm-method">{METHOD.subNew}</p>
        </>
      )}
    </Card>
  )
}

/* ---------- 限售解禁 ---------- */
function LiftCard({ d }: { d: Data }): JSX.Element {
  const [view, setView] = useState<'up' | 'past'>('up')
  const [order, setOrder] = useState<'date' | 'cap'>('date')
  const up = d.lift.upcoming, past = d.lift.past
  const base = view === 'up' ? up.rows : past.rows
  const rows = useMemo(() => (order === 'cap' ? [...base].sort((a, b) => (b.cap ?? -1) - (a.cap ?? -1)) : base), [base, order])
  const cols: Array<Col<LiftRow>> = [
    { key: 'date', label: '解禁日', render: r => r.date },
    { key: 'shares', label: '解禁股数', num: true, render: r => shares(r.shares) },
    { key: 'ratio', label: '占流通股', num: true, render: r => pct(r.ratio, false) },
    { key: 'tr', label: '占总股本', num: true, render: r => pct(r.totalRatio, false) },
    { key: 'cap', label: '解禁市值', num: true, render: r => (r.cap === null ? '停牌' : money(r.cap)) },
    ...(view === 'past' ? [
      { key: 'd1', label: 'T 日', num: true, render: (r: LiftRow) => pct(r.d1), cls: (r: LiftRow) => tone(r.d1) },
      { key: 'd5', label: '5 日', num: true, render: (r: LiftRow) => pct(r.d5), cls: (r: LiftRow) => tone(r.d5) },
    ] : []),
    { key: 'type', label: '限售类型', render: r => <span className="dc-type">{r.type}</span> },
  ]
  return (
    <Card title="限售解禁" as="section" className="mm-card"
      description={view === 'up' ? `${up.from} 至 ${up.to}：${up.count} 批次，合计 ${money(up.cap)}` : `${past.from} 至 ${past.to}：${past.count} 批次已解禁`}
      actions={<Segmented items={[{ id: 'up', label: '未来 30 日' }, { id: 'past', label: '近 30 日已解禁' }]} value={view} onChange={setView} label="解禁区间" />}>
      {view === 'up' && up.byDate.length > 0 && (
        <ul className="dc-days" aria-label="按解禁日汇总">
          {up.byDate.map(x => <li key={x.date}><span>{md(x.date)}</span><b>{money(x.cap)}</b><small>{x.count} 批{x.capMissing ? `（${x.capMissing} 批停牌）` : ''}</small></li>)}
        </ul>
      )}
      {view === 'past' && (
        <dl className="dc-stats">
          <div><dt>T 日涨跌（均值 / 中位数）</dt><dd><span className={tone(past.d1.mean)}>{pct(past.d1.mean)}</span> / <span className={tone(past.d1.median)}>{pct(past.d1.median)}</span></dd><dd className="dc-stats__sub">{past.d1.up} / {past.d1.n} 批上涨</dd></div>
          <div><dt>5 日涨跌（均值 / 中位数）</dt><dd><span className={tone(past.d5.mean)}>{pct(past.d5.mean)}</span> / <span className={tone(past.d5.median)}>{pct(past.d5.median)}</span></dd><dd className="dc-stats__sub">{past.d5.up} / {past.d5.n} 批上涨</dd></div>
        </dl>
      )}
      <Segmented items={[{ id: 'date', label: '按日期' }, { id: 'cap', label: '按解禁市值' }]} value={order} onChange={setOrder} label="解禁排序" />
      <DcTable label={view === 'up' ? '未来 30 日解禁明细' : '近 30 日已解禁明细'} rows={rows} rowKey={(r, i) => `${r.code}-${r.date}-${i}`} cols={cols} empty="区间内没有解禁" />
      <p className="mm-method">{view === 'up' ? METHOD.liftUp : METHOD.liftPast}</p>
    </Card>
  )
}

/* ---------- 股东增减持 ---------- */
function HoldersCard({ d }: { d: Data }): JSX.Element {
  const [view, setView] = useState<'list' | 'inc' | 'dec'>('list')
  const [dir, setDir] = useState<'all' | '增持' | '减持'>('all')
  const h = d.holders
  const list = useMemo(() => (dir === 'all' ? h.rows : h.rows.filter(r => r.dir === dir)), [h.rows, dir])
  const rankCols: Array<Col<HolderRank>> = [
    { key: 'net', label: '净额', num: true, render: r => money(r.net, true), cls: r => tone(r.net) },
    { key: 'inc', label: '增持', num: true, render: r => money(r.inc) },
    { key: 'dec', label: '减持', num: true, render: r => money(Math.abs(r.dec)) },
    { key: 'ratio', label: '股本占比合计', num: true, render: r => pct(r.netRatio, true, 4), cls: r => tone(r.netRatio) },
    { key: 'count', label: '记录', num: true, render: r => `${r.count} 条${r.missing ? `（${r.missing} 条无均价）` : ''}` },
    { key: 'holders', label: '股东数', num: true, render: r => r.holders },
  ]
  return (
    <Card title="重要股东增减持" as="section" className="mm-card"
      description={`${h.from} 至 ${h.to} 公告：增持 ${h.incCount} 条、减持 ${h.decCount} 条；${h.missing} 条未披露均价`}
      actions={<Segmented items={[{ id: 'list', label: '最新公告' }, { id: 'inc', label: '净增持排行' }, { id: 'dec', label: '净减持排行' }]} value={view} onChange={setView} label="增减持视图" />}>
      {view === 'list' && (
        <>
          <Segmented items={[{ id: 'all', label: '全部' }, { id: '增持', label: '增持' }, { id: '减持', label: '减持' }]} value={dir} onChange={setDir} label="增减持方向" />
          <DcTable label="增减持明细" rows={list} rowKey={(r, i) => `${r.code}-${r.holder}-${r.start}-${r.end}-${i}`}
            cols={[
              { key: 'dir', label: '方向', render: (r: HolderRow) => <span className={`dc-tag ${r.dir === '增持' ? 'is-up' : 'is-down'}`}>{r.dir}</span> },
              { key: 'holder', label: '变动方', render: r => <span className="dc-holder">{r.holder}</span> },
              { key: 'shares', label: '变动股数', num: true, render: r => shares(r.shares) },
              { key: 'ratio', label: '占总股本', num: true, render: r => pct(r.ratio, false, 4) },
              { key: 'avg', label: '均价', num: true, render: r => fixed(r.avgPrice) },
              { key: 'amount', label: '金额', num: true, render: r => money(r.amount, true), cls: r => tone(r.amount) },
              { key: 'period', label: '变动期间', render: r => `${md(r.start)}–${md(r.end)}` },
              { key: 'notice', label: '公告日', render: r => md(r.notice) },
              { key: 'way', label: '方式', render: r => r.way ?? '—' },
            ]} />
          <p className="mm-method">{METHOD.holders}</p>
        </>
      )}
      {view !== 'list' && (
        <>
          <DcTable label={view === 'inc' ? '近 30 日净增持排行' : '近 30 日净减持排行'} rows={view === 'inc' ? h.rank.inc : h.rank.dec} rowKey={r => r.code} cols={rankCols} limit={20} />
          <p className="mm-method">{METHOD.holderRank}</p>
        </>
      )}
    </Card>
  )
}

/* ---------- 质押与商誉 ---------- */
function RiskCard({ d }: { d: Data }): JSX.Element {
  const [view, setView] = useState<'pledge' | 'goodwill'>('pledge')
  const p = d.pledge, g = d.goodwill
  return (
    <Card title="股权质押与商誉" as="section" className="mm-card"
      description={view === 'pledge' ? `中国结算统计日 ${p.date}，共 ${p.total} 只 A 股有质押` : `报告期 ${g.period}，${g.total} 家披露商誉`}
      actions={<Segmented items={[{ id: 'pledge', label: '质押比例' }, { id: 'goodwill', label: '商誉占净资产' }]} value={view} onChange={setView} label="风险数据" />}>
      {view === 'pledge' ? (
        <>
          <dl className="dc-stats">
            <div><dt>质押比例 ≥ 50%</dt><dd>{p.counts['50'] ?? '—'} 只</dd></div>
            <div><dt>质押比例 ≥ 30%</dt><dd>{p.counts['30'] ?? '—'} 只</dd></div>
          </dl>
          <DcTable label="质押比例最高的个股" rows={p.rows} rowKey={r => r.code} limit={20}
            cols={[
              { key: 'ratio', label: '质押比例', num: true, render: r => pct(r.ratio, false) },
              { key: 'deals', label: '质押笔数', num: true, render: r => (r.deals === null ? '—' : r.deals) },
              { key: 'shares', label: '质押股数', num: true, render: r => shares(r.shares) },
              { key: 'cap', label: '质押市值', num: true, render: r => money(r.cap) },
              { key: 'y1', label: '近一年涨跌', num: true, render: r => pct(r.y1), cls: r => tone(r.y1) },
              { key: 'ind', label: '行业', render: r => r.industry ?? '—' },
            ]} />
          <p className="mm-method">{METHOD.pledge}</p>
        </>
      ) : (
        <>
          <dl className="dc-stats">
            <div><dt>商誉 ≥ 净资产</dt><dd>{g.counts['100'] ?? '—'} 家</dd></div>
            <div><dt>≥ 50%</dt><dd>{g.counts['50'] ?? '—'} 家</dd></div>
            <div><dt>≥ 30%</dt><dd>{g.counts['30'] ?? '—'} 家</dd></div>
            <div><dt>净资产为负（不排行）</dt><dd>{g.negative} 家</dd></div>
          </dl>
          <DcTable label="商誉占净资产比例最高的公司" rows={g.rows} rowKey={r => r.code} limit={20}
            cols={[
              { key: 'ratio', label: '商誉/净资产', num: true, render: r => pct(r.ratio, false) },
              { key: 'gw', label: '商誉', num: true, render: r => money(r.goodwill) },
              { key: 'eq', label: '净资产', num: true, render: r => money(r.equity) },
              { key: 'ind', label: '行业', render: r => r.industry ?? '—' },
              { key: 'notice', label: '披露日', render: r => r.notice ?? '—' },
            ]} />
          <p className="mm-method">{METHOD.goodwill}</p>
        </>
      )}
    </Card>
  )
}

/* ---------- 回购 ---------- */
const BB_TABS = ['全部', '董事会预案', '股东大会通过', '实施中', '完成实施', '其他'] as const
type BbTab = (typeof BB_TABS)[number]
const BB_MAIN: readonly string[] = ['董事会预案', '股东大会通过', '实施中', '完成实施']
function BuybackCard({ d }: { d: Data }): JSX.Element {
  const [tab, setTab] = useState<BbTab>('全部')
  const b = d.buyback
  const rows = useMemo(() => b.rows.filter(r => tab === '全部' || (tab === '其他' ? !BB_MAIN.includes(r.statusLabel) : r.statusLabel === tab)), [b.rows, tab])
  const countOf = (t: BbTab): number => (t === '全部' ? b.count : t === '其他' ? Object.entries(b.counts).filter(([k]) => !BB_MAIN.includes(k)).reduce((s, [, v]) => s + v, 0) : b.counts[t] ?? 0)
  return (
    <Card title="股票回购" as="section" className="mm-card" description={`${b.from} 至 ${b.to} 有新公告的回购方案 ${b.count} 份`}>
      <Segmented items={BB_TABS.map(t => ({ id: t, label: `${t} ${countOf(t)}` }))} value={tab} onChange={setTab} label="回购进度" />
      <DcTable label="回购方案与进展" rows={rows} rowKey={(r, i) => `${r.code}-${r.planDate}-${i}`} empty="该状态下暂无"
        cols={[
          { key: 'status', label: '进度', render: (r: BuybackRow) => r.statusLabel },
          { key: 'notice', label: '最新公告', render: r => md(r.notice) },
          { key: 'plan', label: '计划金额', num: true, render: r => (r.low === null && r.high === null ? '—' : `${money(r.low)}–${money(r.high)}`) },
          { key: 'cap', label: '价格上限', num: true, render: r => fixed(r.priceCap) },
          { key: 'amount', label: '已回购', num: true, render: r => money(r.amount) },
          { key: 'progress', label: '进度', num: true, render: r => (r.progressLow === null ? '—' : `${fixed(r.progressLow, 1)}%（${fixed(r.progressHigh, 1)}%）`) },
          { key: 'avg', label: '回购均价', num: true, render: r => fixed(r.avgPrice) },
          { key: 'pd', label: '预案公告', render: r => r.planDate ?? '—' },
        ]} />
      <p className="mm-method">{METHOD.buyback}</p>
    </Card>
  )
}

export default function ThsDatacenter(): JSX.Element {
  const { loading, data } = useData()
  return (
    <Page className="mm-page">
      <PageTitle>同花顺 · 数据中心</PageTitle>
      <ThsTabs />
      <p className="mm-disclaimer">{THS_DISCLAIMER}</p>
      {loading ? <p className="mm-empty" role="status">加载中…</p> : !data ? (
        <EmptyState title="暂无数据中心数据">收盘后完整采集成功再更新；数据文件缺失、不可用或格式异常时不展示。</EmptyState>
      ) : <Body d={data} />}
    </Page>
  )
}

function Body({ d }: { d: Data }): JSX.Element {
  return (
    <>
      <PageDataFreshness checkedAt={d.generatedAt} dataDates={[d.asOf]} note={`质押统计日 ${d.pledge.date}；商誉报告期 ${d.goodwill.period}；公告类数据截至数据日期`} />
      <TopPanel d={d} />
      <IpoCard d={d} />
      <LiftCard d={d} />
      <HoldersCard d={d} />
      <RiskCard d={d} />
      <BuybackCard d={d} />
      <Callout title="口径与来源">
        <p>{d.note} {METHOD.skip}</p>
        <p>相关页面：<Link to="/market-mood/disclosure">开盘啦 · 财报避雷</Link>（业绩披露、ST 与退市风险、股东人数、大宗交易、机构调研）、<Link to="/market-mood/abnormal">开盘啦 · 异动监管</Link>（停复牌）。</p>
        <p>来源：{d.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。</p>
      </Callout>
    </>
  )
}
