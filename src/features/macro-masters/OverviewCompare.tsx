import React, { useEffect, useMemo, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, TableWrap } from '../../components/ui'
import { useOverflowFade } from '../../hooks/useOverflowFade'
import { shortName } from './OverviewFormat'
import {
  extraUnitNote,
  formatDirectionArrow,
  formatLastMove,
  formatReadingDate,
  formatReadingParts,
  formatWatchersCount,
  masterUsesReading,
  sourceDisplay,
  watchersFor,
} from './OverviewFormat'
import {
  CollapseAllButton,
  ExpandChevron,
  Panel,
  PanelCol,
  flashElement,
  rowKeyHandlers,
  scrollToId,
  useExpandSet,
} from './OverviewExpand'
import OverviewHistoryBar from './OverviewHistoryBar'
import { useOverviewJump } from './OverviewJump'
import { MASTERS, indicatorCoverage } from './masters'
import { READING_LABELS, READING_THEMES } from './readings'
import type { CycleView, DimensionView, Master, Reading, ReadingKey } from './types'

type Map = Partial<Record<ReadingKey, Reading | null>>

const COLS = 7

function usedInJudgmentKeys(dimensions: DimensionView[] | undefined): Set<ReadingKey> {
  const keys = new Set<ReadingKey>()
  if (!dimensions) return keys
  for (const dim of dimensions) {
    for (const ev of dim.evidence) keys.add(ev.key)
    for (const key of dim.skipped) keys.add(key)
  }
  return keys
}

function dimensionTagsFor(
  key: ReadingKey,
  dimensions: DimensionView[] | undefined,
): string[] {
  if (!dimensions) return []
  return dimensions
    .filter(d => d.evidence.some(ev => ev.key === key) || d.skipped.includes(key))
    .map(d => d.name)
}

function UsedForLabel({ tags }: { tags: string[] }): JSX.Element | null {
  if (!tags.length) return null
  return <span className="mm-overview__used-for">用于：{tags.join('、')}</span>
}

function ValueCell({ reading, loading }: { reading: Reading | null | undefined; loading: boolean }): JSX.Element {
  if (loading) return <span className="mm-overview__muted" role="status">读数加载中</span>
  if (!reading) return <span className="mm-overview__muted">本站暂无</span>
  const { digits, unitSuffix } = formatReadingParts(reading)
  return (
    <span className="mm-overview__compact-value">
      <span className="mm-overview__digits">{digits}</span>
      {unitSuffix ? <span className="mm-overview__compact-unit">{unitSuffix === '%' ? '%' : ` ${unitSuffix}`}</span> : null}
    </span>
  )
}

function DirectionCell({ reading }: { reading: Reading | null | undefined }): JSX.Element {
  if (!reading) return <>—</>
  return <span className="mm-overview__dir">{formatDirectionArrow(reading) ?? '—'}</span>
}

function DateCell({ reading }: { reading: Reading | null | undefined }): JSX.Element {
  if (!reading) return <>—</>
  return (
    <span className="mm-overview__date-cell">
      <time dateTime={reading.date}>{formatReadingDate(reading.date, reading.frequency)}</time>
      {reading.stale && <Badge tone="warm" className="mm-chip mm-chip--stale">已过期</Badge>}
      {reading.refreshFailed && (
        <Badge tone="warm" className="mm-chip mm-chip--refresh">上次更新失败</Badge>
      )}
    </span>
  )
}

function ReadingPanel({
  reading,
  keyName,
  whoSlug,
}: {
  reading: Reading
  keyName: ReadingKey
  whoSlug: Master['slug'] | ''
}): JSX.Element {
  const src = sourceDisplay(reading.source)
  const lastMove = formatLastMove(reading)
  const unitNote = extraUnitNote(reading)
  const watchers = watchersFor(keyName)
  const direct = watchers.filter(w => !w.proxy)
  const proxy = watchers.filter(w => w.proxy)
  const relation = whoSlug ? masterUsesReading(whoSlug, keyName) : null

  return (
    <Panel cols={3}>
      <PanelCol title="口径说明">
        {reading.note && <p>{reading.note}</p>}
        {unitNote && <p>{unitNote}</p>}
        {lastMove && <p>{lastMove}</p>}
        {reading.key === 'spxDrawdown' && !reading.note && (
          <p>相对近 52 周最高收盘的回撤。</p>
        )}
        {!reading.note && !unitNote && !lastMove && reading.key !== 'spxDrawdown' && (
          <p className="mm-overview__muted">暂无额外口径说明</p>
        )}
        {relation && (
          <p className="mm-overview__who-flag">{relation === 'exact' ? '同口径' : '近似'}</p>
        )}
      </PanelCol>
      <PanelCol title="来源">
        <p>
          {src.href ? (
            <a href={src.href} target="_blank" rel="noopener noreferrer">{src.label}</a>
          ) : (
            src.label
          )}
        </p>
      </PanelCol>
      <PanelCol title="谁在看">
        {direct.length > 0 && (
          <p>
            <span className="mm-panel__mini">同口径</span>
            {direct.map((w, i) => (
              <React.Fragment key={w.slug}>
                {i > 0 ? '、' : ''}
                <Link to={`/invest/macro-masters/${w.slug}`}>{w.name}</Link>
              </React.Fragment>
            ))}
          </p>
        )}
        {proxy.length > 0 && (
          <p>
            <span className="mm-panel__mini">近似</span>
            {proxy.map((w, i) => (
              <React.Fragment key={w.slug}>
                {i > 0 ? '、' : ''}
                <Link to={`/invest/macro-masters/${w.slug}`}>{w.name}</Link>
              </React.Fragment>
            ))}
          </p>
        )}
        {!direct.length && !proxy.length && <p className="mm-overview__muted">本表未直接映射</p>}
      </PanelCol>
    </Panel>
  )
}

export default function OverviewCompare({
  map,
  loading,
  failedSources,
  dimensions,
}: {
  map: Map
  loading: boolean
  failedSources: string[]
  dimensions?: CycleView['dimensions']
}): JSX.Element {
  const [params, setParams] = useSearchParams()
  // 网址参数可能是手改的或来自旧链接：认不出的主题、大师一律按「全部」处理
  const rawTheme = params.get('theme') || 'all'
  const themeParam = rawTheme === 'judgment' || READING_THEMES.some(t => t.id === rawTheme) ? rawTheme : 'all'
  const rawWho = params.get('who') || 'all'
  const whoParam = MASTERS.some(m => m.slug === rawWho) ? rawWho : 'all'
  const expand = useExpandSet()
  const jump = useOverviewJump()
  const { ref: filterRef, sync: syncFilter } = useOverflowFade<HTMLDivElement>()

  const judgmentKeys = useMemo(() => usedInJudgmentKeys(dimensions), [dimensions])

  const setFilter = useCallback((theme: string, who: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      if (theme === 'all') next.delete('theme')
      else next.set('theme', theme)
      if (who === 'all') next.delete('who')
      else next.set('who', who)
      return next
    }, { replace: true })
  }, [setParams])

  const clearFilters = useCallback(() => setFilter('all', 'all'), [setFilter])

  const whoSlug = (MASTERS.find(m => m.slug === whoParam)?.slug
    ?? MASTERS.find(m => shortName(m.name) === whoParam)?.slug
    ?? '') as Master['slug'] | ''
  const selectedMaster = whoSlug ? MASTERS.find(master => master.slug === whoSlug) : undefined
  const selectedCoverage = selectedMaster ? indicatorCoverage(selectedMaster) : null
  const missingIndicators = selectedMaster?.indicators.filter(indicator => (
    indicator.kind !== 'method' && !indicator.readings?.length && !indicator.proxyReadings?.length
  )) ?? []

  const themeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, judgment: 0 }
    for (const theme of READING_THEMES) {
      for (const key of theme.keys) {
        counts.all += 1
        if (judgmentKeys.has(key)) counts.judgment += 1
      }
      counts[theme.id] = whoSlug
        ? theme.keys.filter(k => masterUsesReading(whoSlug, k)).length
        : theme.keys.length
    }
    if (whoSlug) {
      counts.all = READING_THEMES.flatMap(t => t.keys).filter(k => masterUsesReading(whoSlug, k)).length
      counts.judgment = [...judgmentKeys].filter(k => masterUsesReading(whoSlug, k)).length
    }
    return counts
  }, [judgmentKeys, whoSlug])

  const visibleThemes = useMemo(() => {
    const filterKey = (key: ReadingKey) => {
      if (themeParam === 'judgment' && !judgmentKeys.has(key)) return false
      if (themeParam !== 'all' && themeParam !== 'judgment') {
        const theme = READING_THEMES.find(t => t.id === themeParam)
        if (!theme?.keys.includes(key)) return false
      }
      if (whoSlug && !masterUsesReading(whoSlug, key)) return false
      return true
    }
    if (themeParam !== 'all' && themeParam !== 'judgment') {
      const theme = READING_THEMES.find(t => t.id === themeParam)
      if (!theme) return []
      const keys = theme.keys.filter(filterKey)
      return keys.length ? [{ ...theme, keys, showHead: false }] : []
    }
    return READING_THEMES
      .map(theme => ({
        ...theme,
        keys: theme.keys.filter(filterKey),
        showHead: true,
      }))
      .filter(t => t.keys.length > 0)
  }, [themeParam, whoSlug, judgmentKeys])

  const flatKeys = visibleThemes.flatMap(t => t.keys)
  const empty = !loading && flatKeys.length === 0

  const { openOne } = expand
  const { registerCompare } = jump

  useEffect(() => {
    registerCompare({
      openKey: (key: ReadingKey) => {
        openOne(key)
        scrollToId('mm-compare')
        window.requestAnimationFrame(() => {
          flashElement(document.getElementById(`mm-compare-row-${key}`))
        })
      },
      clearFilters,
    })
    return () => registerCompare(null)
  }, [registerCompare, openOne, clearFilters])

  useEffect(() => { syncFilter() }, [syncFilter, themeParam, whoParam])

  const themeChips = [
    { id: 'all', label: '全部' },
    { id: 'judgment', label: '用于判定' },
    ...READING_THEMES.map(t => ({ id: t.id, label: t.name })),
  ]

  return (
    <section id="mm-compare" className="mm-overview__compare" aria-labelledby="mm-compare-title">
      <div className="mm-section__head">
        <h2 id="mm-compare-title">指标对照</h2>
        <CollapseAllButton visible={expand.anyOpen} onClick={expand.collapseAll} />
      </div>
      <p className="mm-overview__section-lead">
        扫一眼看历史位置与近一月方向；点开一行看口径、来源与谁在看。
      </p>
      {failedSources.length > 0 && (
        <p className="mm-overview__error" role="alert">
          部分数据来源暂时不可用（{failedSources.join('、')}），相关维度按缺数据处理。
        </p>
      )}

      <div className="mm-compare__filters">
        <div
          className="mm-compare__themes"
          ref={filterRef}
          onScroll={syncFilter}
          role="group"
          aria-label="按主题筛选"
        >
          {themeChips.map(chip => (
            <button
              key={chip.id}
              type="button"
              className={`mm-compare__chip${themeParam === chip.id ? ' is-active' : ''}`}
              aria-pressed={themeParam === chip.id}
              onClick={() => setFilter(chip.id, whoParam)}
            >
              {chip.label}
              <span className="mm-compare__chip-count">{themeCounts[chip.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <label className="mm-compare__who" htmlFor="mm-compare-who">
          <span className="mm-compare__who-label">谁在看</span>
          <select
            id="mm-compare-who"
            value={whoSlug || 'all'}
            onChange={e => setFilter(themeParam, e.target.value)}
          >
            <option value="all">全部</option>
            {MASTERS.map(m => (
              <option key={m.slug} value={m.slug}>{m.name}</option>
            ))}
          </select>
        </label>
      </div>

      {selectedMaster && selectedCoverage && (
        <div className="mm-compare__coverage">
          <p>{`${shortName(selectedMaster.name)}关注 ${selectedCoverage.measurable} 项可量化指标：同口径 ${selectedCoverage.exact} · 本站近似 ${selectedCoverage.proxy} · 本站暂无 ${selectedCoverage.empty}`}</p>
          <Link to={`/invest/macro-masters/${selectedMaster.slug}#mm-master-readings`}>
            查看他的全部指标 →
          </Link>
        </div>
      )}

      {empty && (
        <div className="mm-compare__empty" role="status">
          <p>没有符合当前筛选的读数。</p>
          <button type="button" className="mm-expand__collapse-all" onClick={clearFilters}>
            清除筛选
          </button>
        </div>
      )}

      {!empty && (
        <>
          <TableWrap label="指标对照表" stickyFirst className="mm-overview__table-wrap">
            <table className="ui-table mm-overview__table">
              <thead>
                <tr>
                  <th scope="col">指标</th>
                  <th scope="col" className="mm-overview__value-cell">读数</th>
                  <th scope="col">历史位置</th>
                  <th scope="col">近一月</th>
                  <th scope="col">日期</th>
                  <th scope="col">谁在看</th>
                  <th scope="col" className="mm-expand__col"><span className="visually-hidden">展开</span></th>
                </tr>
              </thead>
              {visibleThemes.map(theme => (
                <tbody key={theme.id}>
                  {theme.showHead && (
                    <tr className="mm-overview__theme">
                      <th scope="rowgroup" colSpan={COLS}>{theme.name}</th>
                    </tr>
                  )}
                  {theme.keys.map(key => {
                    const reading = map[key]
                    const open = expand.isOpen(key)
                    const panelId = `mm-compare-panel-${key}`
                    const tags = dimensionTagsFor(key, dimensions)
                    const relation = whoSlug ? masterUsesReading(whoSlug, key) : null
                    const stale = Boolean(reading?.stale)
                    return (
                      <React.Fragment key={key}>
                        <tr
                          id={`mm-compare-row-${key}`}
                          className={`mm-expand-row mm-overview__data-row${open ? ' is-open' : ''}${stale ? ' is-stale' : ''}`}
                          tabIndex={0}
                          aria-expanded={open}
                          aria-controls={panelId}
                          {...rowKeyHandlers(() => expand.toggle(key))}
                        >
                          <th scope="row">
                            <span className="mm-overview__key-block">
                              <span className="mm-overview__key-name">{READING_LABELS[key]}</span>
                              <UsedForLabel tags={tags} />
                              {relation && (
                                <Badge tone="neutral" className="mm-chip">
                                  {relation === 'exact' ? '同口径' : '近似'}
                                </Badge>
                              )}
                            </span>
                          </th>
                          <td className="mm-overview__value-cell">
                            <ValueCell reading={reading} loading={loading} />
                          </td>
                          <td><OverviewHistoryBar reading={loading ? undefined : reading ?? undefined} /></td>
                          <td><DirectionCell reading={loading ? undefined : reading} /></td>
                          <td><DateCell reading={loading ? undefined : reading} /></td>
                          <td className="mm-overview__watchers">
                            {loading ? '—' : formatWatchersCount(key)}
                          </td>
                          <td className="mm-expand__col"><ExpandChevron open={open} /></td>
                        </tr>
                        {open && (
                          <tr className="mm-expand-panel-row" id={panelId}>
                            <td colSpan={COLS}>
                              {reading ? (
                                <ReadingPanel reading={reading} keyName={key} whoSlug={whoSlug} />
                              ) : (
                                <div className="mm-panel"><p className="mm-overview__muted">暂无口径与来源</p></div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              ))}
            </table>
          </TableWrap>

          <ul className="mm-overview__compare-cards" aria-label="指标对照（窄屏）">
            {visibleThemes.map(theme => (
              <li key={theme.id} className="mm-overview__compare-theme">
                {theme.showHead && <h3>{theme.name}</h3>}
                <ul>
                  {theme.keys.map(key => {
                    const reading = map[key]
                    const open = expand.isOpen(key)
                    const panelId = `mm-compare-card-panel-${key}`
                    const tags = dimensionTagsFor(key, dimensions)
                    return (
                      <li key={key} className={`mm-overview__compare-card${open ? ' is-open' : ''}${reading?.stale ? ' is-stale' : ''}`}>
                        <button
                          type="button"
                          className="mm-overview__compare-card-toggle"
                          aria-expanded={open}
                          aria-controls={panelId}
                          onClick={() => expand.toggle(key)}
                        >
                          <div className="mm-overview__compare-card-line1">
                            <span className="mm-overview__compare-card-name">
                              {READING_LABELS[key]}
                              <UsedForLabel tags={tags} />
                            </span>
                            <span className="mm-overview__compare-card-value">
                              <ValueCell reading={reading} loading={loading} />
                              <ExpandChevron open={open} />
                            </span>
                          </div>
                          <div className="mm-overview__compare-card-line2">
                            <OverviewHistoryBar reading={loading ? undefined : reading ?? undefined} />
                          </div>
                          <p className="mm-overview__compare-card-line3">
                            <DirectionCell reading={loading ? undefined : reading} />
                            {' · '}
                            <DateCell reading={loading ? undefined : reading} />
                          </p>
                        </button>
                        {open && (
                          <div id={panelId} className="mm-overview__compare-card-panel">
                            {reading ? (
                              <ReadingPanel reading={reading} keyName={key} whoSlug={whoSlug} />
                            ) : (
                              <p className="mm-overview__muted">暂无口径与来源</p>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}

      {selectedMaster && selectedCoverage && selectedCoverage.empty > 0 && (
        <section className="mm-compare__gaps" aria-labelledby="mm-compare-gaps-title">
          <h3 id="mm-compare-gaps-title">本站暂无的指标</h3>
          <ul className="mm-compare__gap-list">
            {missingIndicators.map(indicator => (
              <li key={indicator.name}>
                <span className="mm-compare__gap-name">{indicator.name}</span>
                <p>{indicator.external || '研究未找到可靠的免费数据'}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
