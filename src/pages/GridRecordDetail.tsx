import FeeNote from '../features/grid-trading/FeeNote'
import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { readRecords, saveRecordIfUnchanged } from '../features/grid-trading/repository'
import { adjustmentsOf, calculateGrid } from '../features/grid-trading/simulation'
import { fetchQuotes, getCandles, mergeQuote } from '../features/grid-trading/marketData'
import { addManualTrade, assertPosition, positionOf, appendBackup, appendParamStage, createBackup, refreshBackupSnapshot, removeManualTrade, replayBackup, setGridTradeDeleted, updateBackupOverride, updateTradeOverride } from '../features/grid-trading/recordMutations'
import { comparisonRows } from '../features/grid-trading/comparison'
import GridChart from '../features/grid-trading/GridChart'
import type { Candle, SavedRecord, Trade } from '../features/grid-trading/types'
import '../features/grid-trading/gridTrading.css'

const amount = (v: number) => v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
export default function GridRecordDetail(): JSX.Element {
  const { recordId } = useParams()
  const [record, setRecord] = useState(() => readRecords().find(r => r.id === recordId))
  const [candles, setCandles] = useState<Candle[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [backupId, setBackupId] = useState('')
  const [editing, setEditing] = useState<Trade | null>(null)
  const [override, setOverride] = useState({ price: '', size: '', mode: 'amount' })
  const [params, setParams] = useState({ step: String(record?.row.step ?? ''), rebound: String(record?.row.rebound ?? ''), pullback: String(record?.row.pullback ?? '') })
  const [manual, setManual] = useState({ date: '', side: '买入', price: '', shares: '' })

  const load = async (force = false) => {
    if (!record) return
    setBusy(true)
    try {
      const data = await getCandles(record.row.code, record.row.date, { force })
      let quotes = new Map()
      let quoteWarning = ''
      try { quotes = await fetchQuotes([record.row.code]) } catch (e) { quoteWarning = e instanceof Error ? e.message : '报价暂不可用' }
      let history = mergeQuote(data.candles, quotes.get(record.row.code))
      if (record.endDate) history = history.filter(c => c.date <= record.endDate!)
      if (!history.length) throw new Error('没有可用行情，已保留原记录')
      setCandles(history)
      if (force) {
        const updated = { ...record, result: calculateGrid(record.row, history, adjustmentsOf(record)), dataSource: data.source, dataFetchedAt: data.fetchedOn, updatedAt: new Date().toISOString() }
        if (!saveRecordIfUnchanged(updated, record)) throw new Error('记录已在其他操作中修改或删除；刷新结果未覆盖，请重新打开详情')
        setRecord(updated)
      }
      setNotice(`行情已加载，可以调整成交。${quoteWarning ? ` 实时报价暂不可用：${quoteWarning}；使用日线数据。` : ''}`)
    } catch (e) { setNotice(e instanceof Error ? e.message : '行情加载失败；原记录仍可查看') }
    finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [recordId])
  const backup = record?.backups?.find(b => b.id === backupId)
  const result = backup && candles.length ? replayBackup(backup, candles) : record?.result
  const commit = (next: SavedRecord, recompute = true) => {
    try {
      if (busy) throw new Error('行情正在加载，请稍后操作')
      if (recompute && !candles.length) throw new Error('请先加载行情，再修改计算输入')
      const updated = { ...next, updatedAt: new Date().toISOString(), result: recompute ? calculateGrid(next.row, candles, adjustmentsOf(next)) : next.result }
      assertPosition(updated.result)
      if (!saveRecordIfUnchanged(updated, record!)) throw new Error('记录已在其他操作中修改或删除；未覆盖，请重新打开详情')
      setRecord(updated); setNotice('已保存到本地。')
    } catch (e) { setNotice(e instanceof Error ? e.message : '保存失败') }
  }
  const run = (operation: () => void) => { try { operation() } catch (e) { setNotice(e instanceof Error ? e.message : '操作失败') } }
  if (!record || !result) return <main className="grid-page"><section className="grid-card"><h1>找不到这条网格记录</h1><Link to="/grid-trading/records">返回记录列表</Link></section></main>
  const viewRow = backup?.row ?? record.row
  const rawResult = candles.length ? calculateGrid(backup?.row ?? record.row, candles, { ...adjustmentsOf(backup ?? record), manual: [], removed: [] }) : result
  const deletedDates = (backup ?? record).removedTrades ?? []
  const rows = [...result.trades, ...rawResult.trades.filter(t => deletedDates.includes(t.date) && t.side !== '建仓')].sort((a, b) => b.date.localeCompare(a.date))
  const edit = (trade: Trade) => {
    setEditing(trade)
    const source = backup ?? record
    setOverride({ price: String(source.priceOverrides?.[trade.date] ?? ''), size: String(source.sharesOverrides?.[trade.date] ?? source.amountOverrides?.[trade.date] ?? ''), mode: source.sharesOverrides?.[trade.date] ? 'shares' : 'amount' })
  }
  const saveOverride = (reset = false) => run(() => {
    if (!editing) return
    const patch = reset ? { price: null, amount: null, shares: null } : { price: override.price ? Number(override.price) : null, amount: override.mode === 'amount' && override.size ? Number(override.size) : null, shares: override.mode === 'shares' && override.size ? Number(override.size) : null }
    if (backup) {
      let updated = updateBackupOverride(backup, editing.date, patch)
      if (editing.date <= backup.date) updated = refreshBackupSnapshot(updated, candles)
      assertPosition(replayBackup(updated, candles))
      commit({ ...record, backups: record.backups?.map(b => b.id === backup.id ? updated : b) }, false)
    } else commit(updateTradeOverride(record, editing.date, patch))
    setEditing(null)
  })
  return <main className="grid-page">
    <section className="grid-hero grid-hero-compact"><div className="grid-eyebrow">网格记录详情</div><h1>{record.row.name} · {record.row.code}</h1><p>{result.range} · {backup ? '快照续跑视图' : '当前实际记录'}</p><div className="grid-hero-links"><Link to="/grid-trading/records">返回记录列表</Link><button className="grid-button grid-button-secondary" disabled={busy} onClick={() => void load(true)}>{busy ? '加载中…' : '刷新行情'}</button></div></section>
    <p role="status" className="grid-inline-message">{notice}</p>
    <section className="grid-card"><div className="grid-metrics">{[
      ['最新价', result.current.toFixed(3)], ['总盈亏', `¥${amount(result.pnl)}`], ['持仓市值', `¥${amount(positionOf(result) * result.current)}`], ['持仓份额', amount(positionOf(result))],
      ['最大占用资金', `¥${amount(result.maxCapital)}`], ['买入 / 卖出', `${result.buys} / ${result.sells}`], ['下一买价', result.nextBuy.toFixed(3)], ['下一卖价', result.nextSell.toFixed(3)],
    ].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div><p>上次成交：{result.lastTradeDate} · {result.lastTrade.toFixed(3)}；已实现盈亏：¥{amount(result.realized)}；收益率：{(result.pnl / result.maxCapital * 100).toFixed(2)}%</p></section>
    <FeeNote code={viewRow.code} />
    <GridChart record={record} result={result} />
    <section className="grid-card"><h2>参数设置</h2><p>建仓价 {viewRow.initialPrice} · 建仓金额 ¥{amount(viewRow.initialAmount)} · 每格金额 ¥{amount(viewRow.gridAmount)}</p>
      <form className="grid-form" onSubmit={e => { e.preventDefault(); run(() => commit(appendParamStage(record, { step: Number(params.step), rebound: Number(params.rebound), pullback: Number(params.pullback) }))) }}>
        {(['step', 'rebound', 'pullback'] as const).map((key, i) => <label key={key}>{['网格步长', '买入反弹', '卖出回落'][i]}<input type="number" step="0.001" min={key === 'step' ? '0.001' : '0'} required value={backup ? String(backup.row[key]) : params[key]} disabled={!!backup} onChange={e => setParams({ ...params, [key]: e.target.value })} /></label>)}
        <button className="grid-button" disabled={!!backup || busy || !candles.length}>保存参数</button>
      </form><p>已有网格成交时，新参数仅用于历史参数截止日之后；同一天修改保留最初的旧参数。</p>
      {(backup ?? record).paramHistory?.map(stage => <p key={stage.until}>截至 {stage.until}：步长 {stage.step} / 反弹 {stage.rebound} / 回落 {stage.pullback}</p>)}
    </section>
    <section className="grid-card"><h2>成交记录</h2><p>修正网格成交价会影响后续网格基准。手动成交与撤销成交按独立账本叠加。</p>
      <div className="grid-table-scroll"><table className="grid-record-table"><thead><tr><th>日期</th><th>类型</th><th>价格</th><th>金额</th><th>成交份额</th><th>成交后持仓</th><th>盈亏</th><th>操作</th></tr></thead><tbody>{rows.map((t, i) => {
        const removed = !t.manual && deletedDates.includes(t.date) && t.side !== '建仓'
        return <tr key={t.id ?? `${t.date}-${i}`} style={{ opacity: removed ? 0.5 : 1 }}><td>{t.date}</td><td>{t.manual ? '手动' : ''}{t.side}{removed ? '（已撤销）' : ''}</td><td>{t.price.toFixed(3)}{t.modelPrice !== undefined && <small>模型 {t.modelPrice.toFixed(3)}</small>}</td><td>{amount(t.amount)}</td><td>{amount(t.quantity ?? t.amount / t.price)}</td><td>{amount(t.shares)}</td><td>{amount(t.pnl)}</td><td>
          {!t.manual && <button className="grid-text-button" disabled={!candles.length || busy} onClick={() => edit(t)}>修正</button>}
          {!backup && t.side !== '建仓' && <button className="grid-text-button" disabled={!candles.length || busy} onClick={() => run(() => commit(t.manual ? removeManualTrade(record, t.id!) : setGridTradeDeleted(record, t.date, !removed)))}>{removed ? '恢复' : '撤销'}</button>}
        </td></tr>
      })}</tbody></table></div>
      {editing && <form className="grid-form grid-edit-form" onSubmit={e => { e.preventDefault(); saveOverride() }}><h3>修正 {editing.date} {editing.side}</h3><label>实际价格<input type="number" min="0.001" step="0.001" placeholder="留空使用模型" value={override.price} onChange={e => setOverride({ ...override, price: e.target.value })} /></label><label>数量方式<select value={override.mode} onChange={e => setOverride({ ...override, mode: e.target.value })}><option value="amount">金额</option><option value="shares">份额</option></select></label><label>实际{override.mode === 'amount' ? '金额' : '份额'}<input type="number" min="0.001" step="any" placeholder="留空使用模型" value={override.size} onChange={e => setOverride({ ...override, size: e.target.value })} /></label><button className="grid-button">保存修正</button><button type="button" className="grid-button grid-button-secondary" onClick={() => saveOverride(true)}>还原模型</button><button type="button" className="grid-text-button" onClick={() => setEditing(null)}>取消</button></form>}
      {!backup && <form className="grid-form" onSubmit={e => { e.preventDefault(); run(() => commit(addManualTrade(record, { id: crypto.randomUUID(), date: manual.date, side: manual.side as '买入' | '卖出', price: Number(manual.price), shares: Number(manual.shares) }))) }}><label>成交日期<input type="date" required min={record.row.date} max={record.result.series[record.result.series.length - 1]?.date} value={manual.date} onChange={e => setManual({ ...manual, date: e.target.value })} /></label><label>方向<select value={manual.side} onChange={e => setManual({ ...manual, side: e.target.value })}><option>买入</option><option>卖出</option></select></label><label>价格<input required type="number" min="0.001" step="0.001" value={manual.price} onChange={e => setManual({ ...manual, price: e.target.value })} /></label><label>份额<input required type="number" min="0.001" step="any" value={manual.shares} onChange={e => setManual({ ...manual, shares: e.target.value })} /></label><button className="grid-button" disabled={busy || !candles.length}>添加手动成交</button></form>}
    </section>
    <section className="grid-card"><h2>快照与对比</h2><p>保存冻结参数、成交调整和关键结果，最多保留 20 份。快照及续跑的成交可独立修正，不会修改当前记录；达到上限后请先删除旧快照。</p><div className="grid-list-actions"><select aria-label="选择快照" disabled={!candles.length || busy} value={backupId} onChange={e => { setBackupId(e.target.value); setEditing(null) }}><option value="">当前记录</option>{record.backups?.map(b => <option key={b.id} value={b.id}>{b.date} · {new Date(b.at).toLocaleString()}</option>)}</select><button className="grid-button" disabled={busy} onClick={() => run(() => commit(appendBackup(record, createBackup(record)), false))}>创建快照</button>{backup && <button className="grid-text-button" disabled={busy} onClick={() => { if (window.confirm('删除这份本地快照？')) { commit({ ...record, backups: record.backups?.filter(b => b.id !== backup.id) }, false); setBackupId('') } }}>删除快照</button>}</div>
      {backup && <><p>总收益率 = 总盈亏 ÷ 最大占用本金；快照后收益率 = 新增盈亏 ÷ 快照时占用本金。差额 = 当前实际 − 纯网格。</p><div className="grid-table-scroll"><table className="grid-record-table"><thead><tr><th>指标</th><th>快照时</th><th>纯网格续跑</th><th>当前实际</th><th>差额</th></tr></thead><tbody>{comparisonRows(backup, result, record.result).map(item => <tr key={item.label}><th>{item.label}</th>{item.values.map((value, i) => <td key={i}>{value === null ? '—' : amount(value)}</td>)}</tr>)}</tbody></table></div></>}

    </section>
  </main>
}
