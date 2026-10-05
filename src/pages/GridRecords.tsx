import React, { useState } from 'react'
import { PageTitle } from '../components/ui/PageTabs'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import CloudSyncPanel from '../features/grid-trading/CloudSyncPanel'
import ImportExportPanel from '../features/grid-trading/ImportExportPanel'
import RecordList from '../features/grid-trading/RecordList'
import { adjustmentsOf, calculateGrid } from '../features/grid-trading/simulation'
import { fetchQuotes, getCandles, mergeQuote } from '../features/grid-trading/marketData'
import { readRecords, removeRecords, saveRecordIfUnchanged } from '../features/grid-trading/repository'
import { loadSyncConfig } from '../features/grid-trading/cloudSync'
import type { SavedRecord } from '../features/grid-trading/types'
import '../features/grid-trading/gridTrading.css'

export default function GridRecords(): JSX.Element {
  const [records, setRecords] = useState<SavedRecord[]>(() => readRecords())
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState('')

  const deleteRecords = (ids: string[]) => {
    const message = ids.length === 1 ? '确定删除这条本地网格记录吗？' : `确定删除选中的 ${ids.length} 条本地记录吗？`
    if (!window.confirm(message)) return
    try { removeRecords(ids, !!loadSyncConfig()) } catch (e) { setNotice(e instanceof Error ? e.message : "删除失败"); return }
    setRecords(readRecords())
    setNotice(`已删除 ${ids.length} 条记录。`)
  }

  const refresh = async () => {
    if (!records.length) return
    setRefreshing(true)
    setNotice('')
    let quotes = new Map()
    let quoteWarning = ''
    try { quotes = await fetchQuotes(records.map(record => record.row.code)) } catch (e) { quoteWarning = e instanceof Error ? e.message : '报价暂不可用' }
    const refreshRecord = async (record: SavedRecord) => {
      const data = await getCandles(record.row.code, record.row.date, { force: true })
      let candles = mergeQuote(data.candles, quotes.get(record.row.code))
      if (record.endDate) candles = candles.filter(candle => candle.date <= record.endDate!)
      if (!candles.length) throw new Error(`${record.row.code} 没有可用行情`)
      const next: SavedRecord = {
        ...record,
        updatedAt: new Date().toISOString(),
        dataSource: data.source,
        dataFetchedAt: data.fetchedOn,
        result: calculateGrid(record.row, candles, adjustmentsOf(record)),
      }
      if (!saveRecordIfUnchanged(next, record)) throw new Error('记录已修改或删除，跳过旧刷新结果')
      return next
    }
    const outcomes: PromiseSettledResult<SavedRecord>[] = []
    for (let index = 0; index < records.length; index += 3) {
      outcomes.push(...await Promise.allSettled(records.slice(index, index + 3).map(refreshRecord)))
    }
    const failures = outcomes.filter(outcome => outcome.status === 'rejected').length
    setRecords(readRecords())
    setRefreshing(false)
    setNotice(failures ? `行情刷新完成，${failures} 条记录未能更新；已保留其原结果。` : quoteWarning ? `日线已刷新；实时报价不可用：${quoteWarning}` : '全部记录已按最新公开行情刷新。')
  }

  return <main className="grid-page">
    <PageTitle>网格记录</PageTitle>
    <div className="page-toolbar">
      <span className="page-toolbar__note">回测、参数和成交记录保存在本机浏览器。换浏览器或站点前，请先导出 JSON 备份。</span>
      <Link className="tool-btn" to="/grid-trading">新建网格回测 <span aria-hidden="true">→</span></Link>
    </div>
    <RecordList records={records} onDelete={deleteRecords} />
    <section className="grid-card grid-refresh-card">
      <div><h2>行情刷新</h2><p>手动刷新会请求公开腾讯行情，并保留刷新失败记录的原结果。</p></div>
      <button type="button" className="grid-button grid-button-secondary" disabled={refreshing || !records.length} onClick={() => void refresh()}>
        <RefreshCw size={16} className={refreshing ? 'grid-spin' : ''} /> {refreshing ? '刷新中…' : '刷新全部记录行情'}
      </button>
    </section>
    {notice && <p className="grid-inline-message" role="status">{notice}</p>}
    <ImportExportPanel records={records} onImported={setRecords} />
    <CloudSyncPanel records={records} onSynced={setRecords} />
  </main>
}
