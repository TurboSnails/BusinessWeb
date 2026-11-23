import { CRITERIA, PREREGISTERED, ROUND2_CRITERIA_EXTRA } from './defs.mjs'

const pct = n => `${n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(2)}%`
const num = n => Number(n).toFixed(3)
const verdictLabel = { adopt: '采用', watch: '观察', reject: '不采用' }

function metricsTable(label, m) {
  return `| ${label} | ${pct(m.cagr)} | ${pct(m.vol)} | ${pct(m.maxDd)} | ${num(m.sharpe)} | ${pct(m.avgEquity)} | ${m.recessionsCaught} | ${m.falseAlarmMonths} |`
}

function scoreText(score) {
  if (score == null) return '暂无'
  if (score > 0) return `+${score}`
  if (score < 0) return `−${Math.abs(score)}`
  return '0'
}

function summaryTable(candidates) {
  return [
    '| 候选 | 结论 | 全样本夏普（基→加） | 全样本回撤（基→加） | 衰退捕捉 | 误报月 |',
    '|---|---|---:|---:|---:|---:|',
    ...candidates.map(c =>
      `| ${c.name} | ${verdictLabel[c.verdict]} | ${num(c.baseline.full.sharpe)} → ${num(c.withCandidate.full.sharpe)} | ${pct(c.baseline.full.maxDd)} → ${pct(c.withCandidate.full.maxDd)} | ${c.baseline.full.recessionsCaught} → ${c.withCandidate.full.recessionsCaught} | ${c.baseline.full.falseAlarmMonths} → ${c.withCandidate.full.falseAlarmMonths} |`),
  ]
}

function candidateSection(c) {
  const current = c.current
    ? `- **当前读数**：${c.current.display}；若计入打分 ${scoreText(c.current.score)}${c.current.observedOn ? `（观测 ${c.current.observedOn}）` : ''}`
    : null
  const lines = [
    `## ${c.name}（\`${c.id}\`）`,
    '',
    `- **轮次**：第 ${c.round ?? 1} 轮`,
    `- **支柱**：${c.pillar === 'cap' ? '仓位上限' : c.pillar}`,
    `- **数据**：${c.data}`,
    `- **先验规则**：${c.rule}`,
    `- **历史**：约 ${c.historyYears.toFixed(1)} 年；子样本 ${c.split}`,
    `- **结论**：${verdictLabel[c.verdict]} — ${c.reason}`,
    ...(current ? [current] : []),
    '',
    '| 样本 | 年化 | 波动 | 最大回撤 | 夏普 | 平均仓位 | 衰退捕捉 | 误报月 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    metricsTable('基准·全样本', c.baseline.full),
    metricsTable('加入后·全样本', c.withCandidate.full),
    metricsTable('基准·前段', c.baseline.early),
    metricsTable('加入后·前段', c.withCandidate.early),
    metricsTable('基准·后段', c.baseline.late),
    metricsTable('加入后·后段', c.withCandidate.late),
    '',
    '| 检查项 | 通过 | 细节 |',
    '|---|---|---|',
    ...c.checks.map(ch => `| ${ch.label} | ${ch.pass ? '是' : '否'} | ${ch.detail} |`),
    '',
  ]
  return lines.join('\n')
}

function combinedSection(title, combined, candidates) {
  if (!combined) {
    return [`## ${title}`, '', '没有采用项，省略合测。', '']
  }
  return [
    `## ${title}`,
    '',
    `- **采用项**：${combined.ids.map(id => candidates.find(c => c.id === id)?.name ?? id).join('、') || '无'}`,
    `- **合测**：${combined.pass ? '通过 1–4' : '未通过'} — ${combined.detail}`,
    '',
    '| 样本 | 年化 | 波动 | 最大回撤 | 夏普 | 平均仓位 | 衰退捕捉 | 误报月 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    metricsTable('合测·全样本', combined.withCandidate.full),
    metricsTable('合测·前段', combined.withCandidate.early),
    metricsTable('合测·后段', combined.withCandidate.late),
    '',
  ]
}

function revisedComparisonSection(revised) {
  if (!revised?.candidates?.length) return []
  const lines = [
    '## 对照：修订值口径（T5 首轮）',
    '',
    `比较基准：${revised.baselineLabel}。下表保留修订值口径的完整指标，供与上文实时口径对照；JSON 只存实时口径。`,
    '',
    '| 候选 | 修订值结论 | 全样本夏普（基→加） | 全样本回撤（基→加） |',
    '|---|---|---:|---:|',
    ...revised.candidates.map(c =>
      `| ${c.name} | ${verdictLabel[c.verdict]} | ${num(c.baseline.full.sharpe)} → ${num(c.withCandidate.full.sharpe)} | ${pct(c.baseline.full.maxDd)} → ${pct(c.withCandidate.full.maxDd)} |`),
    '',
  ]
  for (const c of revised.candidates) {
    lines.push(
      `### 修订值 · ${c.name}（\`${c.id}\`）`,
      '',
      `- **结论**：${verdictLabel[c.verdict]} — ${c.reason}`,
      '',
      '| 样本 | 年化 | 波动 | 最大回撤 | 夏普 | 平均仓位 | 衰退捕捉 | 误报月 |',
      '|---|---:|---:|---:|---:|---:|---:|---:|',
      metricsTable('基准·全样本', c.baseline.full),
      metricsTable('加入后·全样本', c.withCandidate.full),
      metricsTable('基准·前段', c.baseline.early),
      metricsTable('加入后·前段', c.withCandidate.early),
      metricsTable('基准·后段', c.baseline.late),
      metricsTable('加入后·后段', c.withCandidate.late),
      '',
    )
  }
  if (revised.combined) {
    lines.push(
      '### 修订值 · 全部采用项合测',
      '',
      `- **采用项**：${revised.combined.ids.join('、') || '无'}`,
      `- **合测**：${revised.combined.pass ? '通过 1–4' : '未通过'} — ${revised.combined.detail}`,
      '',
      '| 样本 | 年化 | 波动 | 最大回撤 | 夏普 | 平均仓位 | 衰退捕捉 | 误报月 |',
      '|---|---:|---:|---:|---:|---:|---:|---:|',
      metricsTable('合测·全样本', revised.combined.withCandidate.full),
      metricsTable('合测·前段', revised.combined.withCandidate.early),
      metricsTable('合测·后段', revised.combined.withCandidate.late),
      '',
    )
  }
  return lines
}

export function renderResearchMarkdown(file) {
  const round1 = file.candidates.filter(c => (c.round ?? 1) === 1)
  const round2 = file.candidates.filter(c => c.round === 2)

  const verdictCompare = file.revisedComparison?.candidates?.length ? [
    '## 两种口径 verdict 对照（第一轮）',
    '',
    '| 候选 | 修订值口径 | 实时数据口径 |',
    '|---|---|---|',
    ...round1.map(c => {
      const rev = file.revisedComparison.candidates.find(r => r.id === c.id)
      return `| ${c.name} | ${rev ? verdictLabel[rev.verdict] : '—'} | ${verdictLabel[c.verdict]} |`
    }),
    '',
  ] : []

  return [
    '# 宏观攻守综合指标：候选检验（预注册）',
    '',
    `- **生成时间**：${file.generatedAt}`,
    `- **比较基准**：${file.baselineLabel}`,
    `- **预注册**：${file.preregistered}`,
    '',
    '## 方法',
    '',
    '在看到结果之前写定的先验阈值与采用标准上，逐项把候选加入后回测比较。第一轮基准为 v2.1 实时数据口径；第二轮基准为 v2.2（含制造业周工时）实时数据口径。每个月末面板经当时版本替换；没有当时版本的月份退回修订值。',
    '',
    '澄清（2026 年 11 月 23 日）：',
    '1. 住房许可「六月均相对一年前」= 六月均同比。',
    '2. 候选无读数时不进入支柱均值；候选起点晚于 1973 的，子样本按其可用区间对半。依赖两年期美债的候选（加息预期、估值上限）样本起点为 1976-12。',
    '3. 市盈率百分位 = 1900-01 起至信号月、只用当时已可得数据的扩张窗口。',
    '4. 第一轮不加最小改善门槛；第二轮启用：两段夏普各提高 ≥ 0.01，或任一段最大回撤改善 ≥ 2 个百分点且另一段不恶化。',
    '5. 只在一段夏普改善且未违反回撤与年化条款 → 观察；违反回撤或年化 → 不采用。观察不代表有效，只表示没被否决。',
    '6. 当前读数用已发布的最新观测，不套回测发布滞后；回测仍按原滞后。',
    '',
    '组件型候选作为对应支柱的新增组件参与支柱均值（支柱权重不变）；估值上限作用于最终档位（最多偏进攻）。发布滞后：两年期美债 / 盈亏平衡通胀当日；联邦基金与 10 年期美债当月末；建筑许可、制造业周工时为观测月 +1 月末；核心 PCE 为观测月 +2 月末；银行贷款标准为季度观测 → 次季首月末；标普盈利为观测月 +3 月末。',
    '',
    '采用标准：',
    ...CRITERIA.map((c, i) => `${i + 1}. ${c}`),
    ...ROUND2_CRITERIA_EXTRA.map((c, i) => `${CRITERIA.length + i + 1}. ${c}`),
    '',
    '## 第一轮总表（基准 v2.1）',
    '',
    ...summaryTable(round1),
    '',
    ...round1.map(candidateSection),
    ...combinedSection('第一轮全部采用项合测', file.combined, round1),
    '',
    '## 第二轮（基准 v2.2，含最小改善门槛）',
    '',
    '预注册日期与第一轮相同（2026-11-23）；四条候选在看结果前写下。基准为已并入制造业周工时的 v2.2 实时口径。',
    '',
    ...summaryTable(round2),
    '',
    ...round2.map(candidateSection),
    ...combinedSection('第二轮全部采用项合测', file.combinedRound2, round2),
    ...verdictCompare,
    ...revisedComparisonSection(file.revisedComparison),
    '## 局限',
    '',
    '- 第一轮基准 v2.1、第二轮基准 v2.2，均为实时数据口径；修订值口径结果见上文对照节（仅第一轮）。',
    '- 候选自身序列：两年期美债 / 银行贷款标准 / 市盈率 / 联邦基金 / 10 年期美债 / 盈亏平衡通胀不修订；建筑许可、制造业周工时、标普盈利无版本数据，**候选自身仍为修订值**（比较略偏向候选）。核心 PCE 候选与引擎一致，实时口径用当时版本。',
    '- 芝加哥联储金融条件指数 2011 年前为事后回推值，与引擎实时披露一致。',
    '- 股票月回报用月均价涨跌加股息率近似，未计税费与交易成本。',
    '- 阈值先验冻结，本检验不做参数搜索；「采用」仍属样本内结论。',
    '',
    '## 最终裁定',
    '',
    finalRulingSection(file),
    '',
  ].join('\n')
}

function finalRulingSection(file) {
  const round1 = file.candidates.filter(c => (c.round ?? 1) === 1)
  const round2 = file.candidates.filter(c => c.round === 2)
  const counts = list => Object.fromEntries(['adopt', 'watch', 'reject'].map(v =>
    [v, list.filter(c => c.verdict === v).length]))
  const names = (list, v) => list.filter(c => c.verdict === v).map(c => c.name)
  const c1 = counts(round1)
  const c2 = counts(round2)
  return [
    '说明：首轮实时口径因实现缺陷作废（无档案月份被当缺测）；其后以引擎修复结果为准。',
    `第一轮（基准 v2.1）：${c1.adopt} 采用` +
      `${names(round1, 'adopt').length ? `（${names(round1, 'adopt').join('、')}）` : ''}` +
      ` / ${c1.watch} 观察` +
      `${names(round1, 'watch').length ? `（${names(round1, 'watch').join('、')}）` : ''}` +
      ` / ${c1.reject} 不采用` +
      `${names(round1, 'reject').length ? `（${names(round1, 'reject').join('、')}）` : ''}。`,
    `第二轮（基准 v2.2）：${c2.adopt} 采用` +
      `${names(round2, 'adopt').length ? `（${names(round2, 'adopt').join('、')}）` : ''}` +
      ` / ${c2.watch} 观察` +
      `${names(round2, 'watch').length ? `（${names(round2, 'watch').join('、')}）` : ''}` +
      ` / ${c2.reject} 不采用` +
      `${names(round2, 'reject').length ? `（${names(round2, 'reject').join('、')}）` : ''}。`,
    file.combined
      ? `第一轮合测采用项 ${file.combined.ids.map(id => round1.find(c => c.id === id)?.name ?? id).join('、')}：${file.combined.pass ? '通过' : '未通过'} — ${file.combined.detail}`
      : '第一轮无合测。',
    file.combinedRound2
      ? `第二轮合测采用项 ${file.combinedRound2.ids.map(id => round2.find(c => c.id === id)?.name ?? id).join('、')}：${file.combinedRound2.pass ? '通过' : '未通过'} — ${file.combinedRound2.detail}`
      : '第二轮无合测。',
    '观察项只在页面「候选指标检验」展示当前读数与「若计入」打分，**不计票、不进外圈预警、不影响置信度**。',
  ].join('\n')
}

export function renderWorkerReport({ file, commands, notes, title = 'T5 候选指标检验 — 执行报告' }) {
  const round1 = file.candidates.filter(c => (c.round ?? 1) === 1)
  const round2 = file.candidates.filter(c => c.round === 2)
  const revised = file.revisedComparison
  const compare = revised?.candidates?.length ? [
    '## 两种口径 verdict 对照（第一轮）',
    '',
    '| 候选 | 修订值口径 | 实时数据口径 |',
    '|---|---|---|',
    ...round1.map(c => {
      const rev = revised.candidates.find(r => r.id === c.id)
      return `| ${c.name}（${c.id}） | ${rev ? verdictLabel[rev.verdict] : '—'} | ${verdictLabel[c.verdict]} |`
    }),
    '',
  ] : []

  const lines = [
    `# ${title}`,
    '',
    '## 做了什么',
    '',
    '- 按审查与裁定修判定读法、起点、文案、缓存与研究记录开关',
    '- 第二轮四条候选预注册检验（基准 v2.2 + 最小改善门槛）',
    '',
    '## 改动文件',
    '',
    '- `scripts/macro-posture-research.mjs`',
    '- `scripts/macro-posture-research.test.mjs`',
    '- `scripts/lib/macro-posture-research/*`',
    '- `public/data/macro-posture-candidates.json`',
    '- `docs/research/macro-posture-candidates-2026-11-23.md`',
    '',
    '## 基准',
    '',
    file.baselineLabel,
    '',
    '## 第一轮候选结论（实时口径）',
    '',
    '| 候选 | 结论 |',
    '|---|---|',
    ...round1.map(c => `| ${c.name}（${c.id}） | ${verdictLabel[c.verdict]} |`),
    '',
    file.combined
      ? `合测采用项：${file.combined.ids.join('、') || '无'}；通过=${file.combined.pass}`
      : '无采用项，无合测。',
    '',
    '## 第二轮候选结论（实时口径）',
    '',
    '| 候选 | 结论 |',
    '|---|---|',
    ...round2.map(c => `| ${c.name}（${c.id}） | ${verdictLabel[c.verdict]} |`),
    '',
    file.combinedRound2
      ? `合测采用项：${file.combinedRound2.ids.join('、') || '无'}；通过=${file.combinedRound2.pass}`
      : '第二轮无采用项，无合测。',
    '',
    ...compare,
    '## 命令与退出码',
    '',
    ...commands.map(c => `- \`${c.cmd}\` → ${c.code}`),
    '',
    '## 未验证 / 风险',
    '',
    ...notes.map(n => `- ${n}`),
    '',
    `预注册摘要：${PREREGISTERED}`,
    '',
  ]
  return lines.join('\n')
}
