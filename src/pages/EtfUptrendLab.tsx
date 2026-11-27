import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, LoadError, Page, PageToolbar } from '../components/ui'
import {
  asDay, asDetailMap, asIndex, asReconstructed, bit, filterRows, latestPeriod, loadFilters, loadSort, loadWatch,
  missingCats, nextSort, reconDays, reconMembers, saveFilters, saveSort, saveWatch, securityCode, sortRows, tabCount, TABS,
  type Day, type Detail, type Filters, type Reconstructed, type SortKey, type SortState, type UptrendIndex,
} from '../features/etf-uptrend/model'
import '../features/etf-uptrend/etf-uptrend.css'

const BASE = `${import.meta.env.BASE_URL}data/etf-uptrend/`
const fmtT = (s?: string) => (s ? s.replace('T', ' ').slice(0, 16) : '—')

export default function EtfUptrendLab(): JSX.Element {
  const [index, setIndex] = useState<UptrendIndex | null>(null)
  const [detail, setDetail] = useState<Record<string, Detail>>({})
  const [dayCache, setDayCache] = useState<Record<string, Day>>({})
  const [dayKey, setDayKey] = useState('')
  const [filters, setFilters] = useState<Filters>(() => loadFilters())
  const [sort, setSort] = useState<SortState | null>(() => loadSort())
  const [watch, setWatch] = useState<Set<string>>(() => loadWatch())
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retryKey, setRetryKey] = useState(0)
  const [recon, setRecon] = useState<Reconstructed | null>(null)
  const [reconOpen, setReconOpen] = useState(false)
  const [reconDay, setReconDay] = useState('')
  const [reconRetr, setReconRetr] = useState(false)
  const [reconQ, setReconQ] = useState('')

  const retry = () => {
    setIndex(null)
    setDetail({})
    setDayCache({})
    setDayKey('')
    setError('')
    setLoading(true)
    setRetryKey(n => n + 1)
  }

  useEffect(() => {
    let live = true
    setLoading(true)
    Promise.all([
      fetch(`${BASE}index.json`, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),
      fetch(`${BASE}detail.json`, { cache: 'no-store' }).then(r => r.ok ? r.json() : {}),
    ]).then(([idxBody, detailBody]) => {
      if (!live) return
      const idx = asIndex(idxBody)
      if (!idx?.days.length) { setError('暂无主升浪存档'); setLoading(false); return }
      setIndex(idx)
      setDetail(asDetailMap(detailBody))
      setDayKey(idx.days.at(-1)!.d)
      setLoading(false)
    }).catch(e => { if (live) { setError(e instanceof Error ? e.message : '加载失败'); setLoading(false) } })
    return () => { live = false }
  }, [retryKey])

  useEffect(() => {
    if (!dayKey || dayCache[dayKey]) return
    let live = true
    fetch(`${BASE}days/${dayKey}.json`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(body => {
        if (!live) return
        const d = asDay(body)
        if (d) setDayCache(c => ({ ...c, [dayKey]: d }))
      })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : '日快照失败') })
    return () => { live = false }
  }, [dayKey, dayCache])

  // 上一行情日也预载，用于「较上次新进」
  const prevKey = useMemo(() => {
    if (!index) return null
    const i = index.days.findIndex(d => d.d === dayKey)
    return i > 0 ? index.days[i - 1].d : null
  }, [index, dayKey])

  useEffect(() => {
    if (!prevKey || dayCache[prevKey]) return
    let live = true
    fetch(`${BASE}days/${prevKey}.json`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(body => {
        if (!live || !body) return
        const d = asDay(body)
        if (d) setDayCache(c => ({ ...c, [prevKey]: d }))
      })
      .catch(() => {})
    return () => { live = false }
  }, [prevKey, dayCache])

  useEffect(() => {
    if (!reconOpen || recon) return
    let live = true
    fetch(`${BASE}reconstructed.json`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(body => {
        if (!live) return
        const r = asReconstructed(body)
        if (!r) return
        setRecon(r)
        const ds = reconDays(r)
        setReconDay(ds[0] ?? '')
      })
      .catch(() => { if (live) setRecon(null) })
    return () => { live = false }
  }, [reconOpen, recon])

  const day = dayKey ? dayCache[dayKey] : null
  const prev = prevKey ? dayCache[prevKey] : null
  const prevSet = prev ? new Set(prev.rows.map(r => r[0])) : null
  const meta = index?.days.find(d => d.d === dayKey)

  const rows = useMemo(() => {
    if (!day) return []
    return sortRows(filterRows(day, filters, watch, prevSet), sort, detail)
  }, [day, filters, watch, prevSet, sort, detail])

  const updateFilters = (patch: Partial<Filters>) => {
    setFilters(f => {
      const next = { ...f, ...patch }
      saveFilters(next)
      return next
    })
  }

  const toggleWatch = (code: string) => {
    setWatch(w => {
      const next = new Set(w)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      saveWatch(next)
      return next
    })
  }

  const toggleSort = (key: SortKey) => {
    setSort(cur => {
      const next = nextSort(cur, key)
      saveSort(next)
      return next
    })
  }

  const sortAria = (key: SortKey) => (sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none')

  const gone = prev ? prev.rows.filter(r => !day?.rows.some(x => x[0] === r[0])) : []
  const lr = index?.status.last_run
  const ls = index?.status.last_success
  const reconDayList = recon ? reconDays(recon) : []
  const reconRows = recon && reconDay
    ? reconMembers(recon, reconDay).filter(x => (!reconRetr || x.retr) && (!reconQ.trim() || x.code.includes(reconQ.trim()) || x.name.toLowerCase().includes(reconQ.trim().toLowerCase())))
    : []
  const realDays = new Set(index?.days.map(d => d.d) ?? [])

  return (
    <Page title="ETF 主升浪（实验）" className="uptrend">
      <PageToolbar note="同花顺「主升浪」完整存档：名单、历史上涨区间、AI 上涨原因、倒推历史。来源非自有模型；名单会事后改写。" />
      <Callout tone="warn" title="外部名单 · 观察中">不是自有信号、不是买卖指令。本站未接实时补拉接口，以定时采集存档为准。</Callout>
      {loading && !error && !index && <p role="status" className="up-loading">正在读取名单…</p>}
      {error && (
        <LoadError
          reason="ETF 主升浪名单这份读数现在拿不到。"
          detail={error}
          onRetry={retry}
        />
      )}

      {index && meta && (
        <dl className="up-stats" aria-live="polite">
          <div><dt>主升浪 ETF</dt><dd><span className="num">{meta.n.all ?? '—'}</span><small>只</small></dd></div>
          <div><dt>趋势回踩</dt><dd><span className="num">{meta.n.trend_retracement ?? '—'}</span><small>只</small></dd></div>
          <div><dt>新入池</dt><dd><span className="num">{meta.n.new_pool ?? '—'}</span><small>只</small></dd></div>
          <div><dt>来源截止日</dt><dd><span className="num">{meta.asof ?? '未知'}</span></dd></div>
          <div><dt>采集时间</dt><dd><span className="num small">{fmtT(meta.at)}</span></dd></div>
        </dl>
      )}

      <div className="up-banners">
        {lr?.status === 'failed' && (
          <div className="up-banner warn">
            <b>最近一次采集失败</b>（{fmtT(lr.started_at)}）：{lr.message}。下面是此前最近一次成功的数据
            {ls ? `（${fmtT(ls.finished_at)}）` : ''}，未被覆盖。
          </div>
        )}
        {meta?.st === 'partial' && (
          <div className="up-banner">这份快照名单完整，但部分分类、历史区间或 AI 原因没取到，下次采集会补。</div>
        )}
        {(meta?.notes ?? []).map(n => <div key={n} className="up-banner">{n}</div>)}
      </div>

      {day && (
        <section className="up-card" aria-label="名单">
          <div
            className="up-tabs"
            role="tablist"
            aria-label="分类"
            onKeyDown={e => {
              const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
              if (!keys.includes(e.key) || TABS.length === 0) return
              e.preventDefault()
              const ids = TABS.map(([id]) => id)
              const cur = Math.max(0, ids.indexOf(filters.tab))
              const next = e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1
                : (cur + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length
              updateFilters({ tab: ids[next] })
              const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
              buttons[next]?.focus({ preventScroll: true })
            }}
          >
            {TABS.map(([id, label]) => {
              const c = tabCount(day, id, watch)
              const active = filters.tab === id
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => updateFilters({ tab: id })}
                >
                  {label}{c === null ? null : <span>{c}</span>}
                </button>
              )
            })}
          </div>
          <div className="up-checks">
            <label><input type="checkbox" checked={filters.retr} onChange={e => updateFilters({ retr: e.target.checked })} /> 趋势回踩</label>
            <label><input type="checkbox" checked={filters.newPool} onChange={e => updateFilters({ newPool: e.target.checked })} /> 新入池</label>
            <label><input type="checkbox" checked={filters.unique} onChange={e => updateFilters({ unique: e.target.checked })} /> 同类ETF仅展示一只</label>
            <label><input type="checkbox" checked={filters.entered} onChange={e => updateFilters({ entered: e.target.checked })} /> 较上次新进</label>
          </div>
          <div className="up-toolbar">
            <label className="up-field">
              行情日{' '}
              <select value={dayKey} aria-label="行情日" onChange={e => { setDayKey(e.target.value); setOpen(null) }}>
                {[...(index?.days ?? [])].reverse().map(d => (
                  <option key={d.d} value={d.d}>{d.asof ?? d.d}（{d.n.all ?? '—'} 只）</option>
                ))}
              </select>
            </label>
            <input type="search" placeholder="搜索代码或名称" aria-label="搜索代码或名称" value={filters.q} onChange={e => updateFilters({ q: e.target.value })} />
            <span className="up-count">{rows.length} / {day.rows.length} 只</span>
          </div>

          <div className="up-table">
            <table>
              <thead>
                <tr>
                  <th className="l" scope="col">ETF</th>
                  <th className="l" scope="col">标签</th>
                  <th aria-sort={sortAria('start')}><button type="button" onClick={() => toggleSort('start')}>当前区间起</button></th>
                  <th scope="col">区间止</th>
                  <th aria-sort={sortAria('dur')}><button type="button" onClick={() => toggleSort('dur')}>天数</button></th>
                  <th aria-sort={sortAria('rise')}><button type="button" onClick={() => toggleSort('rise')}>区间涨幅（%）</button></th>
                  <th aria-sort={sortAria('steps')}><button type="button" onClick={() => toggleSort('steps')}>回踩次数</button></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="up-empty">
                      {missingCats(day, filters).length
                        ? '这份快照没有分类或去重数据，请换较新的快照或取消相应筛选。'
                        : filters.tab === 'watch' && !watch.size
                          ? '还没有自选。点 ☆ 加入；自选只存在本机浏览器。'
                          : filters.entered && !prevSet
                            ? '这是第一份快照，没有可比较的上一份。'
                            : '没有符合条件的 ETF。'}
                    </td>
                  </tr>
                ) : rows.map(([code, name, flags]) => {
                  const sec = securityCode(code)
                  const lp = latestPeriod(detail[code])
                  const isOpen = open === code
                  return (
                    <React.Fragment key={code}>
                      <tr
                        className="up-row"
                        tabIndex={0}
                        aria-expanded={isOpen}
                        onClick={e => {
                          if ((e.target as HTMLElement).closest('a,button')) return
                          setOpen(isOpen ? null : code)
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : code) }
                        }}
                      >
                        <td className="l up-name">
                          <div className="up-name-in">
                            <button
                              type="button"
                              className="up-star"
                              aria-pressed={watch.has(code)}
                              aria-label={watch.has(code) ? '移出自选' : '加入自选'}
                              onClick={() => toggleWatch(code)}
                            >{watch.has(code) ? '★' : '☆'}</button>
                            <div>
                              <b>{name}</b>
                              <span className="num">{sec}</span>
                              <Link className="up-grid" to={`/grid-trading?code=${encodeURIComponent(sec)}&name=${encodeURIComponent(name)}`} onClick={e => e.stopPropagation()}>网格</Link>
                              <Link className="up-review" to={`/etf-review?code=${encodeURIComponent(sec)}&name=${encodeURIComponent(name)}`} onClick={e => e.stopPropagation()}>预填复盘</Link>
                            </div>
                          </div>
                        </td>
                        <td className="l">
                          {!!(flags & bit('trend_retracement')) && <span className="up-tag retr">回踩</span>}
                          {!!(flags & bit('new_pool')) && <span className="up-tag new">新入池</span>}
                          {!!(flags & bit('t0')) && <span className="up-tag">T+0</span>}
                          {prevSet && !prevSet.has(code) && <span className="up-tag entered">较上次新进</span>}
                        </td>
                        {lp ? (
                          <>
                            <td>{lp.start_day}</td>
                            <td>{lp.end_day}</td>
                            <td>{lp.duration ?? '—'}</td>
                            <td>{lp.period_rise ?? '—'}</td>
                            <td>{lp.step_signal_count ?? 0}</td>
                          </>
                        ) : (
                          <td className="up-muted pending" colSpan={5}>区间待取</td>
                        )}
                      </tr>
                      {isOpen && (
                        <tr className="up-detail">
                          <td colSpan={7}>
                            <DetailPanel code={code} name={name} detail={detail[code]} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="up-gone">
            {prev
              ? (gone.length
                ? `较上一份快照（${prev.d}）移出 ${gone.length} 只：${gone.map(r => r[1] || r[0]).join('、')}`
                : `较上一份快照（${prev.d}）没有移出。`)
              : ''}
          </p>
        </section>
      )}

      <section className="up-card up-recon up-recon--spaced" aria-labelledby="recon-title">
        <details open={reconOpen} onToggle={e => setReconOpen((e.target as HTMLDetailsElement).open)}>
          <summary>
            <h2 id="recon-title">倒推历史</h2>
            <span>开始采集之前的日子：用同花顺现在的区间数据倒推，不是当天的真实名单</span>
          </summary>
          <div id="recon-body">
            {!recon && reconOpen && <p className="up-muted">加载中…</p>}
            {recon && (
              <>
                <div className="up-banner live">
                  <b>倒推数据，不是当天真实快照</b>：用同花顺 {fmtT(recon.built_at)} 时的全部 ETF 历史上涨区间
                  （{Object.keys(recon.periods).length} 只有区间，范围 {recon.earliest ?? '—'} 至 {recon.source_as_of ?? '—'}）推算。
                  同花顺会事后改写区间，日子越早越不准；新入池、分类、同类去重推不出来。
                  {recon.missing.length ? `有 ${recon.missing.length} 只 ETF 的区间没取到。` : ''}
                </div>
                <div className="up-toolbar">
                  <label className="up-field">
                    行情日{' '}
                    <select value={reconDay} aria-label="倒推行情日" onChange={e => setReconDay(e.target.value)}>
                      {reconDayList.map(d => (
                        <option key={d} value={d}>{d}{realDays.has(d) ? '（有真实快照）' : ''}</option>
                      ))}
                    </select>
                  </label>
                  <label><input type="checkbox" checked={reconRetr} onChange={e => setReconRetr(e.target.checked)} /> 只看趋势回踩</label>
                  <input type="search" placeholder="搜索" value={reconQ} onChange={e => setReconQ(e.target.value)} />
                  <span className="up-count">{reconRows.length} 只</span>
                </div>
                {!!recon.checks?.length && (
                  <div className="up-subtable">
                    <table>
                      <thead>
                        <tr>
                          <th className="l">对照日</th><th>真实</th><th>倒推</th><th>交集</th><th>回踩 真/推/交</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recon.checks.map(c => (
                          <tr key={c.d}>
                            <td className="l">{c.d}</td>
                            <td>{c.real}</td>
                            <td>{c.recon}</td>
                            <td>{c.both}（{c.real ? Math.round(c.both / c.real * 100) : 0}%）</td>
                            <td>{c.retr_real} / {c.retr_recon} / {c.retr_both}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="up-table">
                  <table>
                    <thead>
                      <tr>
                        <th className="l">ETF</th><th>代码</th><th>区间起</th><th>区间止</th><th>回踩</th><th className="l">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconRows.slice(0, 500).map(r => {
                        const sec = securityCode(r.code)
                        return (
                          <tr key={r.code}>
                            <td className="l">{r.name || r.code}</td>
                            <td>{sec}</td>
                            <td>{r.start}</td>
                            <td>{r.end}</td>
                            <td>{r.retr ? '是' : '—'}</td>
                            <td className="l">
                              <Link className="up-grid" to={`/grid-trading?code=${encodeURIComponent(sec)}&name=${encodeURIComponent(r.name || sec)}`}>网格</Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {reconRows.length > 500 && <p className="up-muted">仅显示前 500 只，请加筛选。</p>}
                </div>
              </>
            )}
          </div>
        </details>
      </section>

      <section className="up-notes">
        <h2>口径与限制</h2>
        <ul>
          <li>「来源截止日」取在池 ETF 当前上涨区间截止日的最大值；快照按它命名（行情日）。周末再采只覆盖同一行情日。</li>
          <li>今日涨幅、盘中累计涨幅等需登录指标，这里不采集也不冒充。</li>
          <li>区间与 AI 上涨原因来自同花顺公开接口，数值为来源原值，未独立核实；「区间涨幅」是从区间起始日前一交易日收盘到区间止日收盘的涨幅，不等于 App 里的盘中累计涨幅。</li>
          <li>倒推历史与真实快照分开存放，不会混进行情日列表。</li>
          <li>自选只存本机。名单与倒推历史由站点定期更新，刷新页面即可看到最新快照。</li>
          <li>来源：{index?.source_page ? <a href={index.source_page} target="_blank" rel="noopener noreferrer">同花顺 ETF 主升浪</a> : '同花顺 ETF 主升浪'}；定时约北京时间 {(index?.schedule.times ?? ['23:30', '07:00']).join('、')}。</li>
        </ul>
      </section>
    </Page>
  )
}

function DetailPanel({ code, name, detail }: { code: string; name: string; detail?: Detail }): JSX.Element {
  const sec = securityCode(code)
  const grid = `/grid-trading?code=${encodeURIComponent(sec)}&name=${encodeURIComponent(name)}`
  if (!detail) {
    return (
      <>
        <Link className="up-grid-btn" to={grid}>打开网格 →</Link>
        <p className="up-muted">这只 ETF 的历史上涨区间还没取到，后续采集会按顺序补上。</p>
      </>
    )
  }
  const ps = [...detail.periods].sort((a, b) => (a.start_day < b.start_day ? 1 : -1))
  const rs = Object.entries(detail.reasons ?? {}).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  return (
    <>
      <div className="up-detail-head">
        <h4>{name} · 历史上涨区间</h4>
        <Link className="up-grid-btn" to={grid}>打开网格 →</Link>
      </div>
      <p className="up-src">同花顺历史区间接口，取数于 {fmtT(detail.at)}；数值为来源原值。</p>
      <div className="up-subtable">
        <table>
          <thead>
            <tr>
              <th>起</th><th>止</th><th>天数</th><th>区间涨幅（%）</th><th title="同花顺接口给出的原值（小数），口径未公开，仅供对照">来源变动值</th><th>主力净流入（元）</th><th className="l">回踩日期</th>
            </tr>
          </thead>
          <tbody>
            {ps.map(p => (
              <tr key={`${p.start_day}-${p.end_day}`}>
                <td>{p.start_day}</td>
                <td>{p.end_day}</td>
                <td>{p.duration ?? '—'}</td>
                <td>{p.period_rise ?? '—'}</td>
                <td>{p.period_change ?? '—'}</td>
                <td>{p.main_amount_in ?? '—'}</td>
                <td className="l">{(p.step_signal_dates ?? []).join('、') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rs.length && <p className="up-muted">上涨原因尚未取到。</p>}
      {rs.map(([start, items]) => (
        <React.Fragment key={start}>
          <h4>上涨原因 <small>{start} 起的区间 · 同花顺 AI 生成，未独立核实</small></h4>
          <div className="up-reasons">
            {(items ?? []).length
              ? items.map((it, i) => <div key={i}><b>{it.title}</b>{it.content}</div>)
              : <div className="up-muted">来源返回为空。</div>}
          </div>
        </React.Fragment>
      ))}
    </>
  )
}
