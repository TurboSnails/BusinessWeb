// 开盘啦 · 打板页「涨停历史检索」：对 public/data/kpl-daban-history.json（scripts/kpl-daban.mjs 导出）做前端搜索，
// 按名称 / 代码 / 行业 / 日期查找，列出该股历次涨停日期与连板数。功能对照开盘啦 App「涨停复盘搜索」。
import React, { useEffect, useMemo, useState } from 'react'
import { Card } from '../../components/ui'
import { asHistoryExport, METHOD, searchHistory, type HistoryExport } from './model'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
const SHOWN = 50
type Load = { state: 'loading' } | { state: 'missing' } | { state: 'ok'; data: HistoryExport }

const boardsLabel = (b: number | null): string => (b == null ? '涨停' : b === 1 ? '首板' : `${b}连板`)

export default function HistorySearch({ asOf }: { asOf: string }): JSX.Element {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [q, setQ] = useState('')
  const [date, setDate] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/kpl-daban-history.json`, { cache: 'no-cache', signal: controller.signal })
      .then(async r => {
        if (!r.ok) { setLoad({ state: 'missing' }); return }
        const body: unknown = await r.json().catch(() => undefined) // 单页应用回退的 index.html 不是 JSON，按缺失处理
        const data = asHistoryExport(body)
        setLoad(data ? { state: 'ok', data } : { state: 'missing' })
      })
      .catch(() => { if (!controller.signal.aborted) setLoad({ state: 'missing' }) })
    return () => controller.abort()
  }, [asOf])
  const hits = useMemo(() => (load.state === 'ok' ? searchHistory(load.data, q, date) : []), [load, q, date])
  const h = load.state === 'ok' ? load.data : null
  return (
    <Card title="涨停历史检索" as="section" className="mm-card" description={h?.from && h.to ? `收录 ${h.from} 至 ${h.to} 共 ${h.days.length} 个交易日的涨停名单。` : undefined}>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'missing' && <p className="mm-empty">涨停历史尚未生成。</p>}
      {h && (
        <>
          <div className="kd-search">
            <input className="ui-input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="名称 / 代码 / 行业" aria-label="按名称、代码或行业搜索涨停历史" />
            <input className="ui-input" type="date" value={date} min={h.from ?? undefined} max={h.to ?? undefined} onChange={e => setDate(e.target.value)} aria-label="按涨停日期筛选" />
            {(q || date) && <button type="button" className="kp-more" onClick={() => { setQ(''); setDate('') }}>清空</button>}
          </div>
          {!q.trim() && !date ? <p className="mm-empty">输入名称、代码或行业，或选择一个日期。</p>
            : hits.length ? (
              <>
                <p className="mm-method" aria-live="polite">找到 {hits.length} 只股票{hits.length > SHOWN ? `，显示涨停次数最多的 ${SHOWN} 只` : ''}。</p>
                <ul className="kd-hits">
                  {hits.slice(0, SHOWN).map(s => (
                    <li key={s.code} className="kd-hit" aria-label={`${s.name} 涨停 ${s.hits.length} 次`}>
                      <p className="kd-hit__head"><b>{s.name}</b><small>{s.code}</small><small>{s.industry ?? '行业未知'}</small><span>涨停 <b className="mm-up">{s.hits.length}</b> 次</span></p>
                      <p className="kd-hit__dates">
                        {s.hits.map(x => <span key={x.date} className={x.seeded ? 'is-seeded' : undefined}>{x.date.slice(5)} <b>{boardsLabel(x.boards)}</b></span>)}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="mm-empty" aria-live="polite">{date && !h.days.some(d => d[0] === date) ? `${date} 没有记录（非交易日或未采集）。` : '没有符合条件的涨停记录。'}</p>}
          <p className="mm-method">{METHOD.search}{h.fullFrom ? ` 浅色日期为补算日（${h.fullFrom} 之前）。` : ''}</p>
        </>
      )}
    </Card>
  )
}
