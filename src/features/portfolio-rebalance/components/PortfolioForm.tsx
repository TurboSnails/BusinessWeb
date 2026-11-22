import React from 'react'
import type { Holder, PriceIndex, Rule, RunInput, SwitchRule } from '../types'
import { number, percent } from './format'

const GROUPS = [
  { id: 'growth', label: '成长' },
  { id: 'highVol', label: '高波动' },
  { id: 'stable', label: '稳定' },
  { id: 'benchmark', label: '基准' },
] as const

/** 大师长期持仓分组展示顺序 */
const MASTER_ORDER = [
  '巴菲特（伯克希尔）',
  '段永平（H&H）',
  '李录（喜马拉雅资本）',
  '阿克曼（潘兴广场）',
  '阿克雷（Akre Capital）',
  '特里·史密斯（Fundsmith）',
] as const

type MasterHolding = { symbol: string; name: string; weight: number; asOf: string }

function holdersAria(holders: Holder[]): string {
  return `大师长期持仓：${holders.map(holder => `${holder.who} ${percent(holder.weight, 1)}，截至 ${holder.asOf}`).join('；')}`
}

function groupMasterHoldings(index: PriceIndex): { who: string; holdings: MasterHolding[] }[] {
  const byWho = new Map<string, MasterHolding[]>()
  for (const item of index.items) {
    for (const holder of item.holders ?? []) {
      const list = byWho.get(holder.who) ?? []
      list.push({ symbol: item.symbol, name: item.name, weight: holder.weight, asOf: holder.asOf })
      byWho.set(holder.who, list)
    }
  }
  const known = new Set<string>(MASTER_ORDER)
  const ordered: { who: string; holdings: MasterHolding[] }[] = MASTER_ORDER
    .filter(who => byWho.has(who))
    .map(who => ({ who, holdings: byWho.get(who)!.sort((x, y) => y.weight - x.weight) }))
  for (const [who, holdings] of byWho) {
    if (!known.has(who)) ordered.push({ who, holdings })
  }
  return ordered
}

export function validatePortfolioInput(input: RunInput): string[] {
  const errors: string[] = []
  const total = input.weights.reduce((sum, weight) => sum + weight, 0)
  if (input.symbols.length < 2 || input.symbols.length > 10) errors.push('请选择 2 到 10 只代码')
  if (new Set(input.symbols).size !== input.symbols.length) errors.push('同一代码不能重复选择')
  if (input.weights.some(weight => !Number.isFinite(weight) || weight <= 0)) errors.push('每只权重须大于 0')
  if (!Number.isFinite(total) || Math.abs(total - 1) > 1e-8) errors.push('合计须为 100%')
  if (input.rule.kind === 'relative' && (!Number.isFinite(input.rule.pct) || input.rule.pct <= 0)) errors.push('相对偏离须大于 0')
  if (input.rule.kind === 'absolute' && (!Number.isFinite(input.rule.points) || input.rule.points <= 0)) errors.push('绝对偏离须大于 0')
  if (!Number.isFinite(input.cost) || input.cost < 0) errors.push('成本不能为负数')
  if (!Number.isFinite(input.initial) || input.initial <= 0) errors.push('初始金额须大于 0')
  if (input.switch) {
    const rule = input.switch
    if (!input.symbols.includes(rule.stable)) errors.push('稳定资产必须在组合里')
    if ([rule.entry, rule.gap, rule.step].some(value => !Number.isFinite(value) || value <= 0)) errors.push('大跌切换参数须大于 0')
    if (rule.recover !== 'newHigh' && (!Number.isFinite(rule.recover) || rule.recover <= 0)) errors.push('恢复阈值须大于 0')
    if (rule.cap !== undefined && (!Number.isFinite(rule.cap) || rule.cap <= 0)) errors.push('累计卖出上限须大于 0')
  }
  return errors
}

function defaultSwitch(symbols: string[], index: PriceIndex): SwitchRule {
  const stable = index.items.find(item => item.group === 'stable' && symbols.includes(item.symbol))?.symbol ?? ''
  return { stable, entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05, cap: 0.5 }
}

export function PortfolioForm({ index, value, onChange, onSubmit, defaultStart }: {
  index: PriceIndex
  value: RunInput
  onChange: (input: RunInput) => void
  onSubmit: () => void
  defaultStart: string
}): JSX.Element {
  const errors = validatePortfolioInput(value)
  const total = value.weights.reduce((sum, weight) => sum + weight, 0)
  const itemBySymbol = new Map(index.items.map(item => [item.symbol, item]))
  const selectedStable = index.items.filter(item => item.group === 'stable' && value.symbols.includes(item.symbol))
  const masterGroups = groupMasterHoldings(index)
  const setRuleKind = (kind: string): void => {
    const rule: Rule = kind === 'absolute' ? { kind, points: 0.1 }
      : kind === 'calendar' ? { kind, every: 'month' }
        : kind === 'buyHold' ? { kind } : { kind: 'relative', pct: 0.4 }
    onChange({ ...value, rule })
  }
  const setSwitch = (patch: Partial<SwitchRule>): void => {
    if (value.switch) onChange({ ...value, switch: { ...value.switch, ...patch } })
  }
  return (
    <form className="pr-form" onSubmit={event => { event.preventDefault(); if (errors.length === 0) onSubmit() }} noValidate>
      <div className="pr-form__heading"><div><h2>设置组合与规则</h2><p>选择 2 到 10 只已存数据的代码；修改后点击计算，结果才会更新。</p></div><button type="button" className="btn-ghost" onClick={() => onChange({ ...value, weights: value.symbols.map(() => 1 / value.symbols.length) })}>等权填充</button></div>

      <fieldset className="pr-fieldset"><legend>选择代码 <span>已选 {value.symbols.length} / 10</span></legend>
        <div className="pr-universe">{GROUPS.map(group => <div className="pr-universe__group" key={group.id}><h3>{group.label}</h3><div>{index.items.filter(item => item.group === group.id).map(item => {
          const checked = value.symbols.includes(item.symbol)
          const holders = item.holders
          return <label className={`pr-check ${checked ? 'is-checked' : ''}`} key={item.symbol}><input type="checkbox" checked={checked} disabled={!checked && value.symbols.length >= 10} onChange={() => {
            if (checked) {
              const indexToRemove = value.symbols.indexOf(item.symbol)
              onChange({ ...value, symbols: value.symbols.filter(symbol => symbol !== item.symbol), weights: value.weights.filter((_, index) => index !== indexToRemove) })
            } else onChange({ ...value, symbols: [...value.symbols, item.symbol], weights: [...value.weights, 0] })
          }} /><span>{item.name}<code>{item.symbol}</code>{holders && holders.length > 0 && <span className="pr-master-badge" role="img" aria-label={holdersAria(holders)} title={holdersAria(holders)}>大师</span>}</span></label>
        })}</div></div>)}</div>
        {masterGroups.length > 0 && <details className="pr-masters">
          <summary>大师长期持仓（13F）</summary>
          <div className="pr-masters__body">
            {masterGroups.map(group => <section className="pr-masters__group" key={group.who}>
              <h4>{group.who}</h4>
              <ul>{group.holdings.map(holding => <li key={`${group.who}-${holding.symbol}`}>{holding.name}<code>{holding.symbol}</code> · {percent(holding.weight, 1)} · {holding.asOf}</li>)}</ul>
            </section>)}
            <p className="pr-masters__note">长期持有：最新一期 13F 中占组合 5% 以上，且五年前同季度的 13F 已持有。13F 只披露美国上市股票多头，存在约 45 天延迟，不代表投资人当前仍持有或推荐。</p>
          </div>
        </details>}
      </fieldset>

      <fieldset className="pr-fieldset"><legend>目标权重 <span className={Math.abs(total - 1) > 1e-8 ? 'pr-form__error' : ''}>合计 {percent(total, 2)}{Math.abs(total - 1) > 1e-8 && ' · 合计须为 100%'}</span></legend>
        <div className="pr-weights">{value.symbols.map((symbol, index) => <label key={symbol}><span>{itemBySymbol.get(symbol)?.name ?? symbol}<code>{symbol}</code></span><div className="pr-number"><input type="number" min="0" max="100" step="0.1" aria-label={`${itemBySymbol.get(symbol)?.name ?? symbol}目标权重百分比`} value={number(value.weights[index] * 100, 4).replace('−', '-')} onChange={event => {
          const weights = [...value.weights]
          weights[index] = event.target.value === '' ? 0 : Number(event.target.value) / 100
          onChange({ ...value, weights })
        }} /><span>%</span></div></label>)}</div>
      </fieldset>

      <div className="pr-form__columns">
        <fieldset className="pr-fieldset"><legend>再平衡规则</legend>
          <div className="pr-radio-list">{[
            ['relative', '相对偏离'], ['absolute', '绝对偏离'], ['calendar', '定期调仓'],
          ].map(([kind, label]) => <label className="pr-radio" key={kind}><input type="radio" name="pr-rule" checked={value.rule.kind === kind || (kind === 'calendar' && value.rule.kind === 'calendar')} onChange={() => setRuleKind(kind)} /><span>{label}</span></label>)}</div>
          {value.rule.kind === 'relative' && <label className="pr-field"><span>目标上下浮动比例</span><div className="pr-number"><input type="number" min="0.1" step="1" value={number(value.rule.pct * 100, 4)} onChange={event => onChange({ ...value, rule: { kind: 'relative', pct: Number(event.target.value) / 100 } })} /><span>%</span></div><small>目标 25%、偏离 40%，允许区间为 15%—35%。</small></label>}
          {value.rule.kind === 'absolute' && <label className="pr-field"><span>目标上下偏离点数</span><div className="pr-number"><input type="number" min="0.1" step="1" value={number(value.rule.points * 100, 4)} onChange={event => onChange({ ...value, rule: { kind: 'absolute', points: Number(event.target.value) / 100 } })} /><span>个百分点</span></div><small>等权与剔除版本沿用相同偏离点数。</small></label>}
          {value.rule.kind === 'calendar' && <label className="pr-field"><span>调仓频率</span><select value={value.rule.every} onChange={event => onChange({ ...value, rule: { kind: 'calendar', every: event.target.value as 'month' | 'quarter' | 'year' } })}><option value="month">每月</option><option value="quarter">每季</option><option value="year">每年</option></select><small>期末最后一个交易日判断，下一交易日成交。</small></label>}
        </fieldset>

        <fieldset className="pr-fieldset"><legend>执行与区间</legend>
          <div className="pr-fields-grid">
            <label className="pr-field"><span>起点</span><input type="date" value={value.start ?? defaultStart} onChange={event => onChange({ ...value, start: event.target.value })} /><small>早于共同上市日时自动顺延。</small></label>
            <label className="pr-field"><span>终点</span><input type="date" value={value.end ?? ''} onChange={event => onChange({ ...value, end: event.target.value || undefined })} /><small>留空则使用最新共同交易日。</small></label>
            <label className="pr-field"><span>单边成本</span><div className="pr-number"><input type="number" min="0" step="0.01" value={number(value.cost * 100, 4)} onChange={event => onChange({ ...value, cost: Number(event.target.value) / 100 })} /><span>%</span></div></label>
            <label className="pr-field"><span>初始金额（美元）</span><input type="number" min="1" step="10000" value={value.initial} onChange={event => onChange({ ...value, initial: Number(event.target.value) })} /></label>
          </div>
        </fieldset>
      </div>

      <fieldset className="pr-fieldset pr-switch"><legend>大跌切换 <span>可叠加在上述规则上</span></legend>
        <label className="pr-switch__master"><input type="checkbox" checked={!!value.switch} onChange={event => onChange({ ...value, switch: event.target.checked ? defaultSwitch(value.symbols, index) : undefined })} /><span><strong>QQQ 大跌时，分步卖出稳定资产并买入低配资产</strong><small>大跌状态暂停普通再平衡；恢复后调回目标权重。</small></span></label>
        {value.switch && <div className="pr-switch__settings">
          <label className="pr-field"><span>稳定资产</span><select value={value.switch.stable} onChange={event => setSwitch({ stable: event.target.value })}>{selectedStable.length === 0 && <option value="">组合里没有稳定分组资产</option>}{selectedStable.map(item => <option value={item.symbol} key={item.symbol}>{item.name}（{item.symbol}）</option>)}</select></label>
          <label className="pr-field"><span>进入回撤</span><div className="pr-number"><input type="number" min="1" step="1" value={number(value.switch.entry * 100, 2)} onChange={event => setSwitch({ entry: Number(event.target.value) / 100 })} /><span>%</span></div></label>
          <label className="pr-field"><span>每档间距</span><div className="pr-number"><input type="number" min="0.1" step="1" value={number(value.switch.gap * 100, 2)} onChange={event => setSwitch({ gap: Number(event.target.value) / 100 })} /><span>个百分点</span></div></label>
          <label className="pr-field"><span>每步卖出</span><div className="pr-number"><input type="number" min="1" step="1" value={number(value.switch.step * 100, 2)} onChange={event => setSwitch({ step: Number(event.target.value) / 100 })} /><span>%</span></div></label>
          <label className="pr-field"><span>恢复方式</span><select value={value.switch.recover === 'newHigh' ? 'newHigh' : 'threshold'} onChange={event => setSwitch({ recover: event.target.value === 'newHigh' ? 'newHigh' : 0.05 })}><option value="threshold">回撤收窄到阈值</option><option value="newHigh">回到新高</option></select></label>
          {value.switch.recover !== 'newHigh' && <label className="pr-field"><span>恢复阈值</span><div className="pr-number"><input type="number" min="0.1" step="1" value={number(value.switch.recover * 100, 2)} onChange={event => setSwitch({ recover: Number(event.target.value) / 100 })} /><span>%</span></div></label>}
          <label className="pr-switch__option"><input type="checkbox" checked={value.switch.cap !== undefined} onChange={event => setSwitch({ cap: event.target.checked ? 0.5 : undefined })} /><span>设置累计卖出上限</span></label>
          {value.switch.cap !== undefined && <label className="pr-field"><span>累计卖出上限</span><div className="pr-number"><input type="number" min="1" step="5" value={number(value.switch.cap * 100, 2)} onChange={event => setSwitch({ cap: Number(event.target.value) / 100 })} /><span>%</span></div></label>}
          <label className="pr-switch__option pr-switch__option--wide"><input type="checkbox" checked={value.switch.timeoutMonths !== undefined} onChange={event => setSwitch({ timeoutMonths: event.target.checked ? 18 : undefined })} /><span><strong>超时恢复</strong><small>长期测试中 18 个月超时的结果最差，默认关闭</small></span></label>
        </div>}
      </fieldset>

      {errors.length > 0 && <div className="pr-form__errors" role="alert"><strong>请先修正输入</strong><ul>{[...new Set(errors)].map(error => <li key={error}>{error}</li>)}</ul></div>}
      <div className="pr-form__submit"><button className="btn-primary" type="submit" disabled={errors.length > 0}>计算回测</button><p>计算仅使用已保存的历史数据，不会在线抓取行情。</p></div>
    </form>
  )
}
