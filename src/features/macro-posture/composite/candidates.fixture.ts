import type { CandidateMetrics, CandidateResult, CandidatesFile } from './types'

function metrics(overrides: Partial<CandidateMetrics> = {}): CandidateMetrics {
  return {
    cagr: 0.1,
    vol: 0.09,
    maxDd: -0.25,
    sharpe: 0.6,
    avgEquity: 0.7,
    recessionsCaught: 5,
    falseAlarmMonths: 40,
    ...overrides,
  }
}

function baseline(): CandidateResult['baseline'] {
  return {
    full: metrics(),
    early: metrics({ cagr: 0.11, maxDd: -0.25, sharpe: 0.55, recessionsCaught: 4, falseAlarmMonths: 24 }),
    late: metrics({ cagr: 0.09, maxDd: -0.2, sharpe: 0.65, recessionsCaught: 1, falseAlarmMonths: 16 }),
  }
}

function candidate(partial: Pick<CandidateResult, 'id' | 'name' | 'verdict' | 'reason'> & Partial<CandidateResult>): CandidateResult {
  return {
    pillar: 'growth',
    masters: ['德鲁肯米勒', '达利欧'],
    data: '公开宏观序列，1973 年起；按实际发布日期可得',
    rule: '半年变化 ≤ −10% → −1；≥ +5% → +1',
    historyYears: 53.8,
    split: '1973-01–1999-12 / 2000-01–2026-10',
    baseline: baseline(),
    withCandidate: baseline(),
    checks: [
      { id: 'sharpeBoth', label: '两段子样本夏普都提高', pass: true, detail: '前段 0.55 → 0.58；后段 0.65 → 0.68' },
      { id: 'drawdown', label: '两段最大回撤都不恶化超过 1 个百分点', pass: true, detail: '两段回撤均未恶化' },
      { id: 'cagr', label: '全样本年化收益下降不超过 0.3 个百分点', pass: true, detail: '全样本年化 10.0% → 10.1%' },
      { id: 'recessions', label: '衰退捕捉不减少且误报月数增加不超过 20%', pass: true, detail: '捕捉 5 → 5；误报月 40 → 40' },
      { id: 'history', label: '同口径历史至少 25 年', pass: true, detail: '约 53.8 年' },
    ],
    ...partial,
  }
}

export function candidatesFixture(): CandidatesFile {
  const adopted = candidate({
    id: 'adopted',
    name: '制造业周工时',
    verdict: 'adopt',
    reason: '两段夏普都改善，其余预注册标准也通过，可以采用。',
    withCandidate: {
      full: metrics({ cagr: 0.101, maxDd: -0.24, sharpe: 0.63 }),
      early: metrics({ cagr: 0.111, maxDd: -0.24, sharpe: 0.58, recessionsCaught: 4, falseAlarmMonths: 24 }),
      late: metrics({ cagr: 0.091, maxDd: -0.19, sharpe: 0.68, recessionsCaught: 1, falseAlarmMonths: 16 }),
    },
  })
  const watched = candidate({
    id: 'watched',
    name: '加息预期',
    pillar: 'liquidity',
    verdict: 'watch',
    reason: '前段夏普变化 -0.024、后段夏普变化 +0.022。只有后段改善，先留作观察。',
    current: { display: '2 年期美债高于联邦基金利率 0.88 个百分点（11 月 19 日）', score: -1, observedOn: '2026-11-19' },
    withCandidate: {
      full: metrics({ sharpe: 0.61 }),
      early: metrics({ cagr: 0.11, maxDd: -0.25, sharpe: 0.54, recessionsCaught: 4, falseAlarmMonths: 26 }),
      late: metrics({ cagr: 0.09, maxDd: -0.2, sharpe: 0.67, recessionsCaught: 1, falseAlarmMonths: 14 }),
    },
    checks: candidate({ id: 'x', name: 'x', verdict: 'watch', reason: '' }).checks.map((check, index) => (
      index === 0 ? { ...check, pass: false, detail: '前段 0.55 → 0.54；后段 0.65 → 0.67' } : check
    )),
  })
  const rejected = candidate({
    id: 'rejected',
    name: '标普盈利同比',
    verdict: 'reject',
    reason: '两段夏普都下降且误报增加，不采用。',
    withCandidate: {
      full: metrics({ cagr: 0.095, sharpe: 0.56, falseAlarmMonths: 50 }),
      early: metrics({ cagr: 0.105, maxDd: -0.27, sharpe: 0.5, recessionsCaught: 4, falseAlarmMonths: 30 }),
      late: metrics({ cagr: 0.085, maxDd: -0.22, sharpe: 0.6, recessionsCaught: 1, falseAlarmMonths: 20 }),
    },
    checks: candidate({ id: 'x', name: 'x', verdict: 'reject', reason: '' }).checks.map((check, index) => (
      index === 0 || index === 3 ? { ...check, pass: false, detail: '未满足预注册标准' } : check
    )),
  })
  return {
    generatedAt: '2026-11-23T10:00:00.000Z',
    baselineLabel: 'v2.1（实时数据口径）',
    preregistered: '2026-11-23 预注册：阈值与采用标准在看到结果前写定。',
    criteria: ['两段子样本夏普都提高', '两段最大回撤都不恶化超过 1 个百分点', '同口径历史至少 25 年'],
    candidates: [adopted, watched, rejected],
    combined: {
      ids: ['adopted'],
      withCandidate: adopted.withCandidate,
      pass: true,
      detail: '全部采用项合测满足前四项标准。',
    },
  }
}
