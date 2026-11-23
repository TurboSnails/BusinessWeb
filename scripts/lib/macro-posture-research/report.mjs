import { CRITERIA, PREREGISTERED } from './defs.mjs'

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

function candidateSection(c) {
  const current = c.current
    ? `- **当前读数**：${c.current.display}；若计入打分 ${scoreText(c.current.score)}${c.current.observedOn ? `（观测 ${c.current.observedOn}）` : ''}`
    : null
  const lines = [
    `## ${c.name}（\`${c.id}\`）`,
    '',
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
  const summary = [
    '| 候选 | 结论 | 全样本夏普（基→加） | 全样本回撤（基→加） | 衰退捕捉 | 误报月 |',
    '|---|---|---:|---:|---:|---:|',
    ...file.candidates.map(c =>
      `| ${c.name} | ${verdictLabel[c.verdict]} | ${num(c.baseline.full.sharpe)} → ${num(c.withCandidate.full.sharpe)} | ${pct(c.baseline.full.maxDd)} → ${pct(c.withCandidate.full.maxDd)} | ${c.baseline.full.recessionsCaught} → ${c.withCandidate.full.recessionsCaught} | ${c.baseline.full.falseAlarmMonths} → ${c.withCandidate.full.falseAlarmMonths} |`),
  ]

  const combined = file.combined ? [
    '## 全部采用项合测',
    '',
    `- **采用项**：${file.combined.ids.join('、') || '无'}`,
    `- **合测**：${file.combined.pass ? '通过 1–4' : '未通过'} — ${file.combined.detail}`,
    '',
    '| 样本 | 年化 | 波动 | 最大回撤 | 夏普 | 平均仓位 | 衰退捕捉 | 误报月 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    metricsTable('合测·全样本', file.combined.withCandidate.full),
    metricsTable('合测·前段', file.combined.withCandidate.early),
    metricsTable('合测·后段', file.combined.withCandidate.late),
    '',
  ] : ['## 全部采用项合测', '', '没有采用项，省略合测。', '']

  const verdictCompare = file.revisedComparison?.candidates?.length ? [
    '## 两种口径 verdict 对照',
    '',
    '| 候选 | 修订值口径 | 实时数据口径 |',
    '|---|---|---|',
    ...file.candidates.map(c => {
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
    '在看到结果之前写定的先验阈值与采用标准上，逐项把候选加入后回测比较。本轮基准与候选检验均用实时数据口径：每个月末面板经当时版本替换，可修订的四条核心序列取当时版本；没有当时版本的月份退回修订值（核心 PCE 2000-08 前、初请 2009-05 前）。',
    '',
    '澄清（2026 年 11 月 23 日）：',
    '1. 住房许可「六月均相对一年前」= 六月均同比。',
    '2. 候选无读数时不进入支柱均值；候选起点晚于 1973 的，子样本按其可用区间对半。依赖两年期美债的候选（加息预期、估值上限）样本起点为 1976-12。',
    '3. 市盈率百分位 = 1900-01 起至信号月、只用当时已可得数据的扩张窗口。',
    '4. 本轮不加下一轮最小改善门槛（两段夏普各提高 ≥ 0.01）；reason 中如实写出夏普变化，改善 < 0.01 时注明低于下一轮门槛。',
    '5. 只在一段夏普改善且未违反回撤与年化条款 → 观察；违反回撤或年化 → 不采用。观察不代表有效，只表示没被否决。',
    '',
    '组件型候选作为对应支柱的新增组件参与支柱均值（支柱权重不变）；估值上限作用于最终档位（最多偏进攻）。发布滞后：两年期美债当日；建筑许可、制造业周工时为观测月 +1 月末；银行贷款标准为季度观测 → 次季首月末；标普盈利为观测月 +3 月末。两年期美债、银行贷款标准、市盈率不修订；建筑许可、制造业周工时、标普盈利为修订值——**候选自身仍为修订值**。',
    '',
    '采用标准：',
    ...CRITERIA.map((c, i) => `${i + 1}. ${c}`),
    '',
    '## 总表',
    '',
    ...summary,
    '',
    ...file.candidates.map(candidateSection),
    ...combined,
    ...verdictCompare,
    ...revisedComparisonSection(file.revisedComparison),
    '## 局限',
    '',
    '- 基准为实时数据口径（当时版本；无档案月份退回修订值）；修订值口径结果见上文对照节。',
    '- 候选自身序列：两年期美债 / 银行贷款标准 / 市盈率不修订；建筑许可、制造业周工时、标普盈利无版本数据，**候选自身仍为修订值**（比较略偏向候选）。',
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
  const counts = Object.fromEntries(['adopt', 'watch', 'reject'].map(v =>
    [v, file.candidates.filter(c => c.verdict === v).length]))
  const watchNames = file.candidates.filter(c => c.verdict === 'watch').map(c => c.name)
  const rejectNames = file.candidates.filter(c => c.verdict === 'reject').map(c => c.name)
  const adoptNames = file.candidates.filter(c => c.verdict === 'adopt').map(c => c.name)
  const adoptDetail = file.candidates
    .filter(c => c.verdict === 'adopt')
    .map(c => `${c.name}（${c.reason}）`)
    .join('；')
  return [
    '说明：首轮实时口径因实现缺陷作废（无档案月份被当缺测，等于 1973–2000 年去掉通胀支柱）；本轮为引擎修复后（无档案月份退回修订值）的重跑结果。',
    `本轮实时口径：${counts.adopt} 采用` +
      `${adoptNames.length ? `（${adoptNames.join('、')}）` : ''}` +
      ` / ${counts.watch} 观察` +
      `${watchNames.length ? `（${watchNames.join('、')}）` : ''}` +
      ` / ${counts.reject} 不采用` +
      `${rejectNames.length ? `（${rejectNames.join('、')}）` : ''}。`,
    adoptDetail
      ? `采用项细节：${adoptDetail}`
      : '本轮无采用项，核心规则保持不变。',
    file.combined
      ? `合测采用项 ${file.combined.ids.map(id => file.candidates.find(c => c.id === id)?.name ?? id).join('、')}：${file.combined.pass ? '通过' : '未通过'} — ${file.combined.detail}`
      : '无合测。',
    '观察项只在页面「候选指标检验」展示当前读数与「若计入」打分，**不计票、不进外圈预警、不影响置信度**。',
  ].join('\n')
}

export function renderWorkerReport({ file, commands, notes, title = 'T5 候选指标检验 — 执行报告' }) {
  const revised = file.revisedComparison
  const compare = revised?.candidates?.length ? [
    '## 两种口径 verdict 对照',
    '',
    '| 候选 | 修订值口径 | 实时数据口径 |',
    '|---|---|---|',
    ...file.candidates.map(c => {
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
    '- 按审查 r2 与裁定修判定读法、起点、文案、缓存与研究记录开关',
    '- 引擎修复后重跑实时口径候选检验',
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
    '## 候选结论（实时口径）',
    '',
    '| 候选 | 结论 |',
    '|---|---|',
    ...file.candidates.map(c => `| ${c.name}（${c.id}） | ${verdictLabel[c.verdict]} |`),
    '',
    file.combined
      ? `合测采用项：${file.combined.ids.join('、') || '无'}；通过=${file.combined.pass}`
      : '无采用项，无合测。',
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
