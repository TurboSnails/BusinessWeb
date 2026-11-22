// 美股估值热力图（站内版，对应 Finviz 的 4 张 PE 地图）：不用跳出站外。
// 标普 500 / 纳指 100：估值快照里的成分股（市值、Forward PE、GICS 行业）；全球：在美上市的大型外国公司精选，按国家分组；
// ETF：常见 ETF 精选，按资产类别分组，面积为基金规模、颜色为持仓滚动 PE（Yahoo 不给 ETF 的 Forward PE）。
// 先按分组切块，组内按市值切；点分组标题或上方按钮放大，悬停 / 点按方块在图下显示明细。刷新按钮拉到的实时数据也会同步过来。
import React, { useEffect, useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { PE_STEPS, groupBySector, layoutHeat, medianPe, peStep, weightedFwd, type PeField, type Tile } from './usValuationHeat'
import type { IndexSnapshot, Member } from './valuation'

const MAPS = [
  { key: 'spx', label: '标普 500', finviz: 'https://finviz.com/map?st=fpe' },
  { key: 'ndx', label: '纳指 100', finviz: 'https://finviz.com/map?t=sec_ndx&st=fpe' },
  { key: 'adr', label: '全球（在美上市）', finviz: 'https://finviz.com/map?t=geo&st=fpe' },
  { key: 'etf', label: 'ETF', finviz: 'https://finviz.com/map?t=etf&st=fpe' },
  { key: 'csi300', label: '沪深 300', finviz: '' },
  { key: 'hsi', label: '恒生指数', finviz: '' },
] as const

type Currency = 'USD' | 'CNY' | 'HKD'

/** 一张图要用到的全部信息，四张图统一成这个形状 */
interface MapView {
  key: string
  label: string
  finviz: string
  members: Member[]
  field: PeField
  /** Forward PE / 滚动 PE */
  peName: string
  /** 分组叫什么：行业 / 国家/地区 / 类别 */
  groupWord: string
  /** 面积叫什么：市值 / 规模 */
  sizeWord: string
  /** 汇总读数前缀：指数 / 整体 */
  scopeWord: string
  pe: number | null
  median: number | null
  date: string
  note: string
  currency: Currency
  /** 方块上写代码还是中文名（A 股、港股代码不直观，写名字） */
  byName: boolean
}

export function mapViews(data: Pick<IndexSnapshot, 'indexes' | 'maps'>): MapView[] {
  const views: MapView[] = []
  for (const m of MAPS) {
    if (m.key === 'spx' || m.key === 'ndx') {
      const ix = data.indexes[m.key]
      if (!ix?.members?.length) continue
      views.push({ ...m, members: ix.members, field: 'fwd', peName: 'Forward PE', groupWord: '行业', sizeWord: '市值', scopeWord: '指数', currency: 'USD', byName: false,
        pe: ix.agg?.fwd ?? weightedFwd(ix.members), median: ix.agg?.medianFwd ?? medianPe(ix.members), date: ix.agg?.date ?? '',
        note: `每个方块是一只成分股，按 GICS 一级行业分块。${m.key === 'spx' ? '标普 500 名单取自公开维护的成分表，不是标普官方权重。' : '纳指 100 名单取自 QQQ 持仓。'}` })
    } else if (m.key === 'csi300') {
      const ix = data.indexes.csi300
      if (!ix?.members?.some(x => x.sector)) continue
      views.push({ ...m, members: ix.members, field: 'fwd', peName: 'Forward PE', groupWord: '行业', sizeWord: '市值', scopeWord: '指数', currency: 'CNY', byName: true,
        pe: ix.agg?.fwd ?? weightedFwd(ix.members), median: ix.agg?.medianFwd ?? medianPe(ix.members), date: ix.agg?.date ?? '',
        note: '每个方块是一只沪深 300 成分股，按东方财富 F10 行业分块（与申万行业接近，不是中证官方行业）。A 股 Forward PE 来自雅虎财经的分析师一致预期，覆盖比美股薄，小市值公司可能偏差较大。' })
    } else if (m.key === 'hsi') {
      const mp = data.maps?.hsi
      if (!mp?.members?.length) continue
      views.push({ ...m, members: mp.members, field: 'fwd', peName: 'Forward PE', groupWord: '行业', sizeWord: '市值', scopeWord: '整体', currency: 'HKD', byName: true,
        pe: weightedFwd(mp.members), median: medianPe(mp.members), date: mp.date,
        note: `每个方块是一只恒生指数成分股（本站名单 ${mp.total} 只），按行业组归并成的大类分块；市值为雅虎财经口径，A+H 两地上市的公司按全公司市值计。` })
    } else {
      const mp = data.maps?.[m.key]
      if (!mp?.members?.length) continue
      const etf = m.key === 'etf'
      const field: PeField = etf ? 'ttm' : 'fwd'
      views.push({ ...m, members: mp.members, field, peName: etf ? '滚动 PE' : 'Forward PE', groupWord: etf ? '类别' : '国家/地区', sizeWord: etf ? '规模' : '市值', scopeWord: '整体', currency: 'USD', byName: false,
        pe: weightedFwd(mp.members, field), median: medianPe(mp.members, field), date: mp.date,
        note: etf
          ? `每个方块是一只 ETF，面积为基金规模，颜色为持仓的滚动 PE（Yahoo 不提供 ETF 的 Forward PE，所以与其他三张图口径不同）；债券、商品、加密 ETF 没有盈利，显示为灰色。名单是本站整理的 ${mp.total} 只常见 ETF，不是全部。`
          : `每个方块是一家在美国上市（含 ADR）的外国公司，按公司所在国家 / 地区分块。名单是本站整理的 ${mp.total} 家大型公司，不是全部在美上市外国公司；中概股的估值另受监管与退市风险折价影响。` })
    }
  }
  return views
}

const WIDE = { w: 1000, h: 600 }
const NARROW = { w: 400, h: 760 }
const pe = (v: number | null | undefined, none = '亏损/无预期'): string => (v == null || !(v > 0) ? none : `${v.toFixed(1)}x`)
const UNIT: Record<Currency, string> = { USD: '美元', CNY: '元', HKD: '港元' }
/** v 为十亿（对应币种）；人民币、港币按中文习惯写成亿 / 万亿 */
const cap = (v: number, ccy: Currency = 'USD'): string => {
  if (ccy === 'USD') return v >= 1000 ? `${(v / 1000).toFixed(2)} 万亿美元` : `${v.toFixed(0)} 十亿美元`
  return v >= 1000 ? `${(v / 1000).toFixed(2)} 万亿${UNIT[ccy]}` : `${(v * 10).toFixed(0)} 亿${UNIT[ccy]}`
}

/** 「（行业 18.2x，指数 15.9x）」，缺哪项省哪项 */
const compare = (v: MapView, group?: number | null): string => {
  const parts = [group ? `${v.groupWord.split('/')[0]} ${group.toFixed(1)}x` : '', v.pe ? `${v.scopeWord} ${v.pe.toFixed(1)}x` : ''].filter(Boolean)
  return parts.length ? `（${parts.join('，')}）` : ''
}

/** 窄屏用竖长画布，方块不至于被压扁；jsdom / 老浏览器没有 matchMedia 时按宽屏 */
function useNarrow(): boolean {
  const query = '(max-width: 640px)'
  const get = (): boolean => { try { return window.matchMedia(query).matches } catch { return false } }
  const [narrow, setNarrow] = useState(get)
  useEffect(() => {
    let mq: MediaQueryList
    try { mq = window.matchMedia(query) } catch { return }
    const on = (): void => setNarrow(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return narrow
}

function TileLabel({ t, field, byName }: { t: Tile; field: PeField; byName: boolean }): JSX.Element | null {
  const { r, m } = t
  if (r.w < 26 || r.h < 14) return null
  // 中文名去掉 -W / -SW 等后缀，太长截到 6 个字
  const text = byName ? m.name.replace(/-S?W$/, '').slice(0, 6) : m.code
  const fs = Math.max(8, Math.min(24, r.w / (text.length * (byName ? 1.05 : 0.72) + 0.6), r.h / 2.6))
  if (byName && fs * text.length > r.w + 2) return null
  const two = r.h > fs * 2.6 && r.w > 34
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  return (
    <text className="uvh__label" x={cx} y={two ? cy - fs * 0.15 : cy + fs * 0.35} fontSize={fs} textAnchor="middle">
      <tspan className="uvh__code">{text}</tspan>
      {two && <tspan x={cx} dy={fs * 1.05} fontSize={fs * 0.72}>{m[field] && m[field]! > 0 ? `${m[field]!.toFixed(1)}x` : field === 'ttm' ? '—' : '亏损'}</tspan>}
    </text>
  )
}

export default function UsValuationHeatmap({ data }: { data: Pick<IndexSnapshot, 'indexes' | 'maps'> }): JSX.Element | null {
  const views = useMemo(() => mapViews(data), [data])
  const [key, setKey] = useState<string>('spx')
  const [zoom, setZoom] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const narrow = useNarrow()
  const v = views.find(x => x.key === key) ?? views[0]
  const groups = useMemo(() => (v ? groupBySector(v.members, v.field) : []), [v])
  const shown = useMemo(() => (zoom ? groups.filter(g => g.sector === zoom) : groups), [groups, zoom])
  const { w, h } = narrow ? NARROW : WIDE
  const { sectors, tiles } = useMemo(() => layoutHeat(shown, w, h), [shown, w, h])
  if (!v) return null
  const none = v.field === 'ttm' ? '无 PE' : '亏损/无预期'
  const picked = tiles.find(t => t.m.code === sel) ?? null
  const pickedGroup = picked ? groups.find(g => g.sector === picked.sector) : null
  const focusable = tiles.length <= 120
  const switchMap = (k: string): void => { setKey(k); setZoom(null); setSel(null) }
  const tileText = (t: Tile): string => `${v.byName ? `${t.m.name} ${t.m.code.split('.')[0]}` : `${t.m.code} ${t.m.name}`}：${v.peName} ${pe(t.m[v.field], none)}，${v.sizeWord} ${cap(t.m.mcap, v.currency)}`
  const zoomTo = (sector: string | null): void => { setZoom(sector); setSel(null) }
  return (
    <section className="macro-card uvh" aria-labelledby="uvh-title">
      <h3 id="uvh-title">估值热力图</h3>
      <p>每个方块的<b>面积代表市值</b>（ETF 为基金规模），<b>颜色代表市盈率</b>：绿色便宜、红色贵、灰色亏损或没有盈利。个股看 Forward PE（股价 ÷ 未来 12 个月预期每股收益），ETF 看持仓的滚动 PE。点分组名放大看。</p>
      <div className="uvh__bar">
        <div className="uvh__tabs" role="tablist" aria-label="选择热力图">
          {views.map(m => (
            <button key={m.key} type="button" role="tab" aria-selected={v.key === m.key} className={`uvh__tab${v.key === m.key ? ' is-on' : ''}`} onClick={() => switchMap(m.key)}>{m.label}</button>
          ))}
        </div>
        <span className="macro-muted">
          {v.pe ? <>{v.scopeWord} {v.peName} <b>{v.pe.toFixed(1)}x</b>{v.median ? ` · 中位数 ${v.median.toFixed(1)}x` : ''}{v.date ? ` · ${v.date}` : ''}</> : null}
        </span>
      </div>
      <div className="uvh__chips" role="group" aria-label={`按${v.groupWord}放大`}>
        <button type="button" className={`uvh__chip${zoom === null ? ' is-on' : ''}`} aria-pressed={zoom === null} onClick={() => zoomTo(null)}>全部</button>
        {groups.map(g => (
          <button key={g.sector} type="button" className={`uvh__chip${zoom === g.sector ? ' is-on' : ''}`} aria-pressed={zoom === g.sector} onClick={() => zoomTo(zoom === g.sector ? null : g.sector)}>
            {g.zh} <span className="uvh__chip-pe">{g.fwd ? `${g.fwd.toFixed(1)}x` : '—'}</span>
          </button>
        ))}
      </div>
      <svg className="uvh__svg" viewBox={`0 0 ${w} ${h}`} role="group" aria-label={`${v.label} ${v.peName} 热力图${zoom ? `（${groups.find(g => g.sector === zoom)?.zh}）` : ''}`}>
        {tiles.map(t => (
          <g key={t.m.code} className={`uvh__cell${sel === t.m.code ? ' is-on' : ''}`} tabIndex={focusable ? 0 : undefined} role="button" aria-label={tileText(t)}
            onMouseEnter={() => setSel(t.m.code)} onFocus={() => setSel(t.m.code)} onClick={() => setSel(t.m.code)}>
            <title>{tileText(t)}</title>
            <rect className={`uvh__rect uvh--${peStep(t.m[v.field])}`} x={t.r.x} y={t.r.y} width={t.r.w} height={t.r.h} />
            <TileLabel t={t} field={v.field} byName={v.byName} />
          </g>
        ))}
        {sectors.map(s => (
          <g key={s.g.sector}>
            <rect className="uvh__sector" x={s.r.x} y={s.r.y} width={s.r.w} height={s.r.h} />
            {s.head && (
              <g className="uvh__head" role="button" tabIndex={0} aria-label={`${zoom ? '返回全部' : `放大 ${s.g.zh}`}（${v.peName} ${pe(s.g.fwd, none)}）`}
                onClick={() => zoomTo(zoom ? null : s.g.sector)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zoomTo(zoom ? null : s.g.sector) } }}>
                <rect className="uvh__head-bg" x={s.r.x} y={s.r.y} width={s.r.w} height={18} />
                <text className="uvh__head-text" x={s.r.x + 5} y={s.r.y + 13}>
                  {s.r.w > 150 ? `${s.g.zh} · ${pe(s.g.fwd, none)}` : s.g.zh.slice(0, Math.max(2, Math.floor((s.r.w - 8) / 12)))}
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
      <p className="uvh__tip" aria-live="polite">
        {picked
          ? <><b>{v.byName ? picked.m.name : picked.m.code}</b> {v.byName ? picked.m.code.split('.')[0] : picked.m.name} · {pickedGroup?.zh} · {v.sizeWord} {cap(picked.m.mcap, v.currency)} · {v.peName} <b>{pe(picked.m[v.field], none)}</b>{compare(v, pickedGroup?.fwd)}{v.field === 'fwd' ? ` · 滚动 PE ${pe(picked.m.ttm, '亏损')}` : ''}</>
          : '悬停或点按方块查看明细'}
      </p>
      <ul className="uvh__legend" aria-label={`颜色图例：${v.peName}`}>
        {PE_STEPS.map(s => <li key={s.id}><i className={`uvh__sw uvh--${s.id}`} aria-hidden="true" />{s.id === 'na' ? none : s.label}</li>)}
      </ul>
      <p className="macro-muted">
        {v.note}数据为本页估值快照（雅虎财经，{v.date || '—'}），点上方「刷新最新数据」会一起更新。
        颜色按固定档位、全部图通用（这里绿 = 便宜、红 = 贵，与 A 股行情的红涨绿跌无关），不随分组调整——银行、能源天然 PE 低，软件、半导体天然 PE 高，跨组比较请看按钮上的分组 PE（市值加权调和平均）。
        {v.finviz && <>想看更细的层级，可去 <a href={v.finviz} target="_blank" rel="noopener noreferrer">Finviz 原图<ExternalLink size={12} aria-hidden="true" /></a>。</>}
      </p>
    </section>
  )
}
