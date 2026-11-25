import React from 'react'
import { TableWrap } from '../../components/ui'
import { BarLegend, CompareTable, FilterChips, LossBars, RatioBar, type BarSeries, type CompareCol, type CompareRow } from './LabTable'
import { HEAT_LABEL, TIER_LABEL } from '../combined-strategy/labels'
import data from './data/late-cycle.json'

type StratId = 'base' | 'static70' | 'buyhold' | 'K1' | 'K2' | 'K3' | 'K4'
type CandidateId = 'K1' | 'K2' | 'K3' | 'K4'

const CANDIDATES: { id: CandidateId; name: string; rule: string }[] = [
  { id: 'K1', name: '回撤熔断', rule: '标普收盘比过去一年最高收盘低 10% 以上时，下调一档' },
  { id: 'K2', name: '日线破位', rule: '标普收盘低于 200 日均线时，下调一档' },
  { id: 'K3', name: '偏热且日线破位', rule: '偏热、宏观在进攻侧、收盘低于 200 日均线时，降到中性（70%）' },
  { id: 'K4', name: '偏热且回撤熔断', rule: '偏热、收盘比过去一年最高低 10% 以上时，下调一档' },
]

/** 小数 → 百分比文本，负号用「−」 */
export function pct(value: number | null | undefined, digits = 1, signed = false): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const body = `${Math.abs(value * 100).toFixed(digits)}%`
  if (value < 0) return `−${body}`
  return signed && value > 0 ? `+${body}` : body
}

function num(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value < 0 ? `−${Math.abs(value).toFixed(digits)}` : value.toFixed(digits)
}

const tierLabel = (id: string | null): string => (id ? TIER_LABEL[id as keyof typeof TIER_LABEL] ?? id : '—')
const heatLabel = (id: string | null): string => (id ? HEAT_LABEL[id as keyof typeof HEAT_LABEL] ?? id : '—')
const stats = (id: StratId) => data.strategies[id]

type EventFilter = 'all' | 'rec' | 'non' | 'late'
type LcEvent = (typeof data.events)[number]

const isLate = (e: LcEvent): boolean => e.heatAtPeak === 'hot' && (e.tierAtPeak === 'offense' || e.tierAtPeak === 'lean-offense')
const FILTERS: { key: EventFilter; label: string; test: (e: LcEvent) => boolean }[] = [
  { key: 'all', label: '全部', test: () => true },
  { key: 'rec', label: '伴随衰退', test: e => e.recession },
  { key: 'non', label: '不伴随衰退', test: e => !e.recession },
  { key: 'late', label: '扩张后段（偏热且进攻侧）', test: isLate },
]
const LOSS_SERIES: BarSeries[] = [
  { key: 'spx', label: '标普', tone: 'ref' },
  { key: 'base', label: '本策略', tone: 'main' },
  { key: 'static70', label: '恒定七成', tone: 'alt' },
]

function GroupTable(): JSX.Element {
  return (
    <TableWrap label="按类型汇总的下跌与反弹参与度" className="lab-wrap">
      <table className="cs-table lab-table" data-testid="lab-groups">
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">回调类型</th>
            <th scope="col" className="num">次数</th>
            <th scope="col">下跌参与度<span className="lab-th-sub">越短越抗跌 · 虚线为恒定七成 0.7</span></th>
            <th scope="col">反弹参与度<span className="lab-th-sub">越长反弹拿得越多</span></th>
            <th scope="col" className="num">低点前降过仓</th>
          </tr>
        </thead>
        <tbody>
          {data.groups.map(g => (
            <tr key={g.label} className={g.label.includes('扩张后段') ? 'is-base' : undefined}>
              <th scope="row" className="lab-sticky">{g.label}</th>
              <td className="num">{g.n}</td>
              <td><RatioBar value={g.downMedian} /></td>
              <td><RatioBar value={g.upMedian} /></td>
              <td className="num">{g.cutBeforeTrough} / {g.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

function EventTable(): JSX.Element {
  const [filter, setFilter] = React.useState<EventFilter>('all')
  const test = FILTERS.find(f => f.key === filter)!.test
  const rows = data.events.filter(test)
  const scale = Math.max(...data.events.flatMap(e => [Math.abs(e.spxLoss), Math.abs(e.loss.base), Math.abs(e.loss.static70)]))
  return (
    <>
      <div className="lab-toolbar">
        <FilterChips
          label="按回调类型筛选"
          options={FILTERS.map(f => ({ key: f.key, label: f.label, count: data.events.filter(f.test).length }))}
          value={filter}
          onChange={setFilter}
        />
        <BarLegend series={LOSS_SERIES} note="条越长跌得越多" />
      </div>
      <TableWrap label="1973 年以来每次 10% 以上的回调" className="lab-wrap">
        <table className="cs-table lab-table lab-events" data-testid="lab-events">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">回调</th>
              <th scope="col">下跌（高点 → 低点）</th>
              <th scope="col" className="num">下跌参与度<span className="lab-th-sub">本策略 ÷ 标普</span></th>
              <th scope="col" className="num">反弹（低点 → 收复）</th>
              <th scope="col">高点前月末</th>
              <th scope="col">仓位</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(e => {
              const ratio = e.spxLoss ? e.loss.base / e.spxLoss : null
              return (
                <tr key={e.peak}>
                  <th scope="row" className="lab-sticky">
                    <span className="lab-name lab-dates" title={`${e.peak} → ${e.trough}`}><span>{e.peak} →</span><span>{e.trough}</span></span>
                    <span className="lab-rule">从前高跌 {pct(e.depth)} · {e.peakToTroughDays} 个交易日</span>
                  </th>
                  <td>
                    <LossBars
                      series={LOSS_SERIES}
                      values={{ spx: e.spxLoss, base: e.loss.base, static70: e.loss.static70 }}
                      scale={scale}
                      caption={`${e.peak} 下跌对比`}
                    />
                  </td>
                  <td className="num"><span className="lab-val">{num(ratio)}</span></td>
                  <td className="num">
                    <span className="lab-pair"><span>标普</span>{pct(e.spxGain, 1, true)}</span>
                    <span className="lab-pair"><span>本策略</span>{pct(e.gain.base, 1, true)}</span>
                    {e.recoveredInWindow ? null : <span className="lab-rule">（未收复）</span>}
                  </td>
                  <td>
                    <span className="lab-nowrap">{tierLabel(e.tierAtPeak)} · {heatLabel(e.heatAtPeak)}</span>
                    <span className="lab-tags">
                      {e.recession ? <span className="lab-tag lab-tag--rec">衰退</span> : null}
                      {isLate(e) ? <span className="lab-tag lab-tag--late">扩张后段</span> : null}
                    </span>
                  </td>
                  <td>
                    <span className="lab-nowrap lab-val">{pct(e.weightAtPeak, 0)} → {pct(e.weightAtTrough, 0)}</span>
                    <span className="lab-rule">{e.firstCutDays == null ? '低点前未降仓' : `第 ${e.firstCutDays} 个交易日首次降仓`}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
    </>
  )
}

function CandidateTable(): JSX.Element {
  type S = (typeof data.strategies)['base']
  const rows: CompareRow<S>[] = [
    { id: 'base', name: 'v2.2 基线', rule: '不加刹车', stats: stats('base') },
    ...CANDIDATES.map(c => ({ id: c.id, name: `${c.id} ${c.name}`, rule: c.rule, stats: stats(c.id), verdict: data.verdictB[c.id] })),
  ]
  const cols: CompareCol<S>[] = [
    { key: 'train', head: '训练期夏普', sub: '1973–1999', get: s => s.train.sharpe, fmt: v => num(v, 3), threshold: 0.02 },
    { key: 'valid', head: '验证期夏普', sub: '2000–2026', get: s => s.valid.sharpe, fmt: v => num(v, 3), better: 'higher' },
    { key: 'full', head: '全样本夏普', get: s => s.full.sharpe, fmt: v => num(v, 3), better: 'higher' },
    { key: 'net', head: '扣 0.1% 成本', sub: '全样本夏普', get: s => s.full.sharpeNet, fmt: v => num(v, 3), better: 'higher' },
    { key: 'dd', head: '按日最大回撤', get: s => s.full.dailyMaxDd, fmt: v => pct(v), better: 'higher', unit: 'pp' },
    { key: 'turn', head: '年换手', get: s => s.full.turnoverPerYear, fmt: v => pct(v, 0), better: 'lower', unit: 'pp' },
  ]
  return <CompareTable label="四个月中刹车候选与基线" testId="lab-candidates" baseId="base" rows={rows} cols={cols} />
}

export default function LateCycleStudy(): JSX.Element {
  const groups = Object.fromEntries(data.groups.map(g => [g.label, g]))
  const rec = groups['伴随衰退']; const non = groups['不伴随衰退']; const late = groups['偏热且进攻侧（扩张后段）']
  const e2020 = data.events.find(e => e.peak === '2020-02-19')
  const e1987 = data.events.find(e => e.peak === '1987-08-25')
  const k3 = stats('K3'); const base = stats('base')

  return (
    <article className="ss-section lab-study" id="lab-late-cycle" aria-labelledby="lab-late-cycle-title" data-testid="lab-late-cycle">
      <p className="lab-status">2026-11-25 · 已完成 · 不改仓位规则</p>
      <h2 id="lab-late-cycle-title">牛市后段到回调：策略做了什么，月中加刹车有没有用</h2>

      <div className="ss-cover lab-answer" data-testid="lab-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          有作用，但只对一类回调：宏观先转差的慢跌，本策略只承受标普约四成的跌幅；从「扩张后段、偏热」开始的急跌，本策略大约承受 {pct(late.downMedian, 0)}，几乎只靠仓位本身。按日加的四种「月中刹车」都没有通过检验。
        </p>
        <p className="ss-p">
          没有一套规则能同时躲开回调、又不错过反弹。这套策略能做到的，是在衰退型的大熊市里少亏一半以上；对牛市里的普通回调，它基本只靠仓位本身（85%）少亏一点。
        </p>
      </div>

      <h3 className="cs-subhead">一、1973 年以来 {data.events.length} 次 10% 以上的回调</h3>
      <p className="ss-p">
        下跌参与度 = 本策略跌幅 ÷ 标普跌幅（0.38 表示标普跌 10%，本策略跌 3.8%）；反弹参与度同理。恒定七成两项都约为 0.7。取各组中位数。
      </p>
      <GroupTable />
      <p className="ss-p" data-testid="lab-verdict-a">
        按预注册的措辞：{data.verdictA}（衰退型中位数 {num(rec.downMedian)}，非衰退型 {num(non.downMedian)}）。
        但更准确的分界是高点时是否偏热：非衰退的 {non.n} 次里有 5 次参与度不超过 0.67（1983、2022、1989、2015、1987 年），参与度高于 0.8 的回调高点时全部偏热。
        衰退组里的 2020 年也是 0.98。NBER 衰退是事后才标出的，当时并不知道。
      </p>
      <ul className="ss-list">
        <li>伴随衰退的 {rec.n} 次：下跌参与度 {num(rec.downMedian)}，{rec.cutBeforeTrough} 次在低点前已经降仓。宏观数据先变差，策略来得及减。</li>
        <li>不伴随衰退的 {non.n} 次：下跌参与度 {num(non.downMedian)}，比恒定七成还高。这些回调多半来得快、去得也快，月度宏观数据还没变差就结束了。</li>
        <li>
          高点时在「扩张后段」（偏热、进攻侧）的 {late.n} 次：只有 {late.cutBeforeTrough} 次在低点前降过仓。
          {e2020 ? ` 2020 年 23 个交易日跌 ${pct(e2020.spxLoss, 0)}，本策略跌 ${pct(e2020.loss.base, 0)}，仓位反而从 85% 升到 100%（3 月初按 2 月底的读数定档，那时宏观数据还没反映疫情）。` : ''}
          唯一的例外是 2000 年，宏观转弱后逐步降到 30%，整轮只跌了 {pct(data.events.find(e => e.peak === '2000-03-24')?.loss.base, 0)}。
        </li>
        <li>反弹参与度也低：防守之后要等宏观好转才加回来，衰退型下跌后的反弹只拿到约 {pct(rec.upMedian, 0)}。少亏和少赚是同一件事的两面。</li>
      </ul>
      <EventTable />
      <p className="ss-note" role="note">
        按次月第 3 个交易日收盘成交、按日净值计（含股息，现金按 3 个月国库券）。回调从历史最高收盘起算，所以 2011 年（−19%）和 1976–78 年那几次下跌不在表里：它们发生在还没回到前高的时候。1973 年那次的高点在回测起点之前，从 {data.window.navStart} 起算，档位和冷热取 1973-01。高点前月末的冷热是用全样本数据构造的雷达读数。
      </p>

      <h3 className="cs-subhead">二、月中加一道刹车（预注册，4 个写法）</h3>
      <p className="ss-p">
        现行规则只在月末定档，一个月内的暴跌没有保护。这里检验 4 个按日触发、只在当月剩余时间内生效的降仓规则：收盘后判断，次一交易日收盘调整，条件消失就恢复。
        采用门槛事先写定：训练期夏普至少高 0.02、按日回撤不恶化超过 1 个百分点；再看验证期；最后做 Holm 校正的显著性检验。
      </p>
      <CandidateTable />
      <ul className="ss-list">
        <li>
          刹车在急跌里确实少亏几个点
          {e1987 ? `（1987 年 K1 跌 ${pct(e1987.loss.K1)}，基线 ${pct(e1987.loss.base)}；2020 年 K3 跌 ${pct(e2020?.loss.K3)}，基线 ${pct(e2020?.loss.base)}）` : ''}，
          但卖在低处之后，反弹里又少赚回去，多数回调里两头相抵。
        </li>
        <li>
          K3 的验证期夏普 {num(k3.valid.sharpe, 3)}、按日最大回撤 {pct(k3.full.dailyMaxDd)}，看起来比基线（{num(base.valid.sharpe, 3)}、{pct(base.full.dailyMaxDd)}）好，
          但改善几乎全部来自 2020 年一次：去掉 2020 年 1–3 月这三个信号月，验证期是 0.797 对 0.811，反而落后；训练期也更差（{num(k3.train.sharpe, 3)} 对 {num(base.train.sharpe, 3)}）。按门槛不通过。
        </li>
        <li>K1 离训练期门槛最近（只差 0.003），K1、K2 训练期按日回撤都浅了约 3.6 个百分点；但验证期夏普下降，年换手升到 134%–200%，扣成本后更差。</li>
        <li>4 个候选全样本夏普差的 95% 区间都跨过 0，Holm 校正后 p 均为 1.00。</li>
      </ul>

      <h3 className="cs-subhead">三、对使用者意味着什么</h3>
      <ol className="ss-list">
        <li>策略不是没用，而是主要对一类下跌有用：宏观先转差、跌得慢的下跌，典型是伴随衰退的大熊市（1973–74、1990、2000–02、2008 年）；2022 年没有衰退，但通胀和加息让档位提前降到防守，同样只跌了一半。</li>
        <li>牛市里来得快的回调（1987、1998、2018、2020、2025 年）基本躲不开，只靠仓位本身少亏一点，月度规则也不该假装能躲开。这次为躲它们加的 4 种刹车，长期都没有带来更好的结果。</li>
        <li>如果在「扩张后段、偏热」时就想少承受回调，可行的做法是事先把自己的股票上限定低一些，这是风险预算的选择，不是择时信号；规则本身仍按档位执行。</li>
        <li>按日计，本策略经历过约 {pct(base.full.dailyMaxDd, 0)} 的账面回撤（2020 年）。要按这个数字做心理准备，而不是页面上月均价口径的 −20%。</li>
      </ol>

      <h3 className="cs-subhead">局限与复现</h3>
      <ul className="ss-list">
        <li>回调只有 {data.events.length} 次，其中 20% 以上的熊市 7 次；每组的中位数受单次事件影响大。</li>
        <li>冷热读数不是当时实时可得的版本；只有美国数据；未计税费。今天已检验过 10 个仓位改动，这 4 个应合在一起看多重比较风险。</li>
        <li>与预注册的口径差异：净值从 {data.window.navStart} 开始（预注册误写为 1973-03）；复现门槛用期内买入持有（夏普 0.588，与月末收盘研究一致），候选比较时基线和候选都用按日再平衡的净值（基线夏普 {num(base.full.sharpe, 3)}）。</li>
        <li>预注册、脚本和结果在仓库 docs/research/late-cycle-2026-11-25/，可用 node docs/research/late-cycle-2026-11-25/run.mjs 复现。</li>
      </ul>
    </article>
  )
}
