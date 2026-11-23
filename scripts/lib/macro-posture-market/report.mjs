const pct = value => (100 * value).toFixed(2) + '%'
const metric = m => [
  m.sharpe.toFixed(4), pct(m.cagr), pct(m.vol), pct(-m.maxDd),
  pct(m.avgEquity), m.switchesPerYear.toFixed(2),
].join(' / ')

const table = rows => [
  '| 方案 | 训练期 | 验证期 | 全样本 |',
  '| --- | --- | --- | --- |',
  ...rows.map(({ label, train, test, full }) =>
    `| ${label} | ${metric(train)} | ${metric(test)} | ${metric(full)} |`),
].join('\n')

const componentNames = { breadth: '宽度', volume: '量价', erp: '股债利差', cape: 'CAPE' }
function configName(c, chosenId) {
  const variants = c.id.split(':')[1].split(',').map(pair => {
    const [id, variant] = pair.split('-')
    return componentNames[id] + (variant === 'a' ? '甲' : '乙')
  }).join('、')
  return `${c.label}（${variants}）${c.id === chosenId ? ' ★' : ''}`
}

export function renderResults({ stage1, stage2, disclosures }, limit = stage1.configs.length) {
  const baseline = { ...stage2.baseline, label: stage2.baselineLabel }
  const weightRows = stage2.weights.map(row => ({
    ...row, label: `市场权重 ${Math.round(row.w * 100)}%${row.w === stage2.chosenW ? ' ★' : ''}`,
  }))
  const rows = stage1.configs.slice(0, limit).map(c => ({ ...c, label: configName(c, stage1.chosenId) }))
  return [
    '## 第一阶段 · 市场综合与基准',
    `训练期 ${stage1.trainRange}，验证期 ${stage1.testRange}。★ 为按训练期夏普选中的组合。`,
    '每格依次为夏普、年化收益、年化波动、最大回撤幅度、平均股票仓位、每年换档次数。',
    table([...rows, ...stage1.benchmarks]),
    '### 当前读数',
    stage1.current.headline,
    stage1.current.components.map(c =>
      `- ${c.label}${c.observedOn ? `（${c.observedOn}）` : ''}。${c.display}${c.score == null ? '' : `计 ${c.score} 分。`}${c.note ? ` ${c.note}。` : ''}`).join('\n'),
    '## 第二阶段 · 加入实时数据口径 v2.2',
    `训练期 ${stage2.trainRange}，验证期 ${stage2.testRange}。★ 为按训练期夏普选中的权重。`,
    table([baseline, ...weightRows]),
    [
      '| 方案 | 全样本提前捕捉衰退次数 | 全样本误报月数 |',
      '| --- | --- | --- |',
      ...[baseline, ...weightRows].map(row => `| ${row.label} | ${row.full.recessionsCaught ?? '暂缺'} | ${row.full.falseAlarmMonths ?? '暂缺'} |`),
    ].join('\n'),
    `### 判定 · ${stage2.verdict === 'adopt' ? '采用' : '独立参考'}`,
    stage2.reason,
    stage2.checks.map(c => `- ${c.pass ? '通过' : '未通过'} · ${c.label}（${c.detail}）`).join('\n'),
    '## 披露',
    disclosures.map(s => '- ' + s).join('\n'),
  ].join('\n\n')
}
