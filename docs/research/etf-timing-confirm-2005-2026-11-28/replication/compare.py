#!/usr/bin/env python3
"""L-056 两实现逐字段比对：主实现 results.json（run.mjs）vs 第二实现 replication/results.json（run.py）。

映射依据 results.schema.json。容差（PREREG「实现与复核」+ CLARIFY-1）：
- 百分数（windowStats 的 years/total/annual/dd、vol、分布值、对数收益差）绝对差 ≤ 1e-8；
- k ≤ 1e-10；
- 布尔、个数、等级、p 值、成交日、日期：完全相同（本研究安慰剂是确定性枚举，p 值须逐位一致）。
运行：python3 -I replication/compare.py  → 打印摘要，写 replication/compare-diffs.json。
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STUDY = os.path.dirname(HERE)
A = json.load(open(os.path.join(STUDY, 'results.json')))          # 主实现
B = json.load(open(os.path.join(HERE, 'results.json')))           # 第二实现
TARGETS = A['targets']
PCT, KT = 1e-8, 1e-10
rows = []  # (field, main, repl, tol, ok, note)


def cmp(field, a, b, tol=None, note=''):
    if tol is None:
        ok = a == b
    elif a is None or b is None:
        ok = a is None and b is None
    else:
        ok = math.isfinite(a) and math.isfinite(b) and abs(a - b) <= tol
    rows.append({'field': field, 'main': a, 'repl': b, 'tol': tol, 'ok': bool(ok), 'note': note})


def ws(field, a, b):
    """windowStats 四个字段。"""
    for k in ('years', 'total', 'annual', 'dd'):
        cmp(f'{field}.{k}', a.get(k), b.get(k), PCT)


def triple(field, a, b):
    for nm in ('rule', 'hold', 'M'):
        ws(f'{field}.{nm}', a[nm], b[nm])


def dist(field, a, b, tol=PCT):
    for k in ('p10', 'median', 'p90', 'mean'):
        cmp(f'{field}.{k}', a[k], b[k], tol)


GRADE_KEYS = ('P', 'D', 'A', 'X', 'Xann', 'Xdd', 'Xprime', 'XprimeAnn', 'XprimeDd', 'volLowerThanM')
CNT_MAP = {'P': 'P', 'D': 'D', 'A': 'A', 'X': 'X', 'Xann': 'X_ann', 'Xdd': 'X_dd', 'Xprime': 'Xp',
           'XprimeAnn': 'Xp_ann', 'XprimeDd': 'Xp_dd', 'volLowerThanM': 'volLowerThanM'}


def evaluation(name_a, ea, eb, with_placebo_detail=True):
    for c in TARGETS:
        pa, pb = ea['perIndex'][c], eb['perIndex'][c]
        f = f'{name_a}.perIndex.{c}'
        cmp(f + '.k', pa['k'], pb['k'], KT)
        cmp(f + '.kPrime', pa['kPrime'], pb['Wp']['k'], KT)
        if 'eW0' in pa and 'posAtWStartMinus1' in pb:
            cmp(f + '.eW0', pa['eW0'], pb['posAtWStartMinus1'])
        triple(f + '.W', pa['W'], pb['W'])
        if 'vol' in pa['W'] and 'vol' in pb['W']['rule']:
            for nm in ('rule', 'hold', 'M'):
                cmp(f'{f}.W.vol.{nm}', pa['W']['vol'][nm], pb['W'][nm]['vol'], PCT)
        triple(f + '.C', pa['C'], pb['C'])
        triple(f + '.Wprime', pa['Wprime'], pb['Wp'])
        cmp(f + '.Wprime.Xann', pa['Wprime']['Xann'], pb['Wp']['X_ann'])
        cmp(f + '.Wprime.Xdd', pa['Wprime']['Xdd'], pb['Wp']['X_dd'])
        cmp(f + '.Wprime.X', pa['Wprime']['X'], pb['Wp']['X'])
        for ka, kb in (('D', 'D'), ('A', 'A'), ('P', 'P'), ('Xann', 'X_ann'), ('Xdd', 'X_dd'), ('X', 'X')):
            cmp(f'{f}.{ka}', pa[ka], pb[kb])
        if 'volLowerThanM' in pb:
            cmp(f + '.volLowerThanM', pa['volLowerThanM'], pb['volLowerThanM'])
        cmp(f + '.trades.buys', pa['trades']['buys'], pb['tradesAll']['buyDates'])
        cmp(f + '.trades.sells', pa['trades']['sells'], pb['tradesAll']['sellDates'])
        cs_a, cs_b = pa['Csse'], eb['Csse']['perIndex'][c]
        triple(f + '.Csse', cs_a, cs_b['C'])
        cmp(f + '.Csse.D', cs_a['D'], cs_b['D'])
        cmp(f + '.Csse.Xdd', cs_a['Xdd'], cs_b['X_dd'])
        cmp(f + '.Csse.X', cs_a['X'], cs_b['X'])
    for k in GRADE_KEYS:
        cmp(f'{name_a}.counts.{k}', ea['counts'][k], eb['counts'][CNT_MAP[k]])
    for ka, kb in (('Csse_D', 'D'), ('Csse_X', 'X'), ('Csse_Xdd', 'X_dd')):
        if ka in ea['counts']:
            cmp(f'{name_a}.counts.{ka}', ea['counts'][ka], eb['Csse']['counts'][kb])
    pa, pb = ea['placebo'], eb['placebo']
    cmp(f'{name_a}.placebo.pC', pa['pC'], pb['p_C'])
    cmp(f'{name_a}.placebo.pA', pa['pA'], pb['p_A'])
    cmp(f'{name_a}.placebo.pX', pa['pX'], pb['p_X'])
    if with_placebo_detail:
        cmp(f'{name_a}.placebo.nShifts', pa['nShifts'], pb['nShifts'])
        cmp(f'{name_a}.placebo.shiftRange', pa['shiftRange'], pb['shiftRange'])
        cmp(f'{name_a}.placebo.DbarRule', pa['DbarRule'], pb['Dbar_rule'], PCT)
        cmp(f'{name_a}.placebo.AbarRule', pa['AbarRule'], pb['Abar_rule'], PCT)
        for c in TARGETS:
            cmp(f'{name_a}.placebo.perIndexP.{c}', pa['perIndexP'][c], pb['indexLevel_C_dd'][c]['p_ge'])
        for k in ('Dbar', 'Abar', 'X'):
            dist(f'{name_a}.placebo.dist.{k}', pa['dist'][k], pb['dist_mainConvention'][k])
        cmp(f'{name_a}.placebo.DbarRuleCsse', pa['DbarRuleCsse'], eb['Csse']['Dbar_rule'], PCT)
        cmp(f'{name_a}.placebo.pCsse', pa['pCsse'], eb['Csse']['p_C'])
        cmp(f'{name_a}.gradeBeforeDowngrade', ea['gradeBeforeDowngrade'], eb['grade']['beforeRule1'])
        cmp(f'{name_a}.gradeCsseReportOnly', ea['gradeCsseReportOnly'], eb['Csse']['gradeBeforeRule1'],
            note='第二实现 Csse 等级取降级规则 1 之前的值（主实现 schema 未说明；本次两者相同）')
        cmp(f'{name_a}.note', ea['note'], eb['grade']['subtag'] if eb['grade']['afterRule1'] == '部分确认' else None)
    cmp(f'{name_a}.downgrade1Triggered', ea['downgrade1Triggered'], eb['grade']['rule1Triggered'])
    cmp(f'{name_a}.grade', ea['grade'], eb['grade']['afterRule1'])
    sub_b = eb['grade']['subtag']
    if eb['grade']['afterRule1'] == '回撤门槛通过、择时增量未证实' and sub_b:
        sub_b = sub_b.split('（')[0]
    else:
        sub_b = None
    cmp(f'{name_a}.subLabel', ea['subLabel'], sub_b)


def main():
    # ---- checks
    ca, cb = A['checks'], B['checks']
    cmp('checks.strategiesSha256', ca['strategiesSha256'], cb['strategiesMjsSha256'])
    cmp('checks.inputsCleanSha256', ca['inputsCleanSha256'], cb['inputsCleanSha256'])
    cmp('checks.l018InputsSha256', ca['l018InputsSha256'], cb['l018InputsSha256'])
    cmp('checks.cashRatesSha256', ca['cashRatesSha256'], cb['cashRatesSha256'])
    cmp('checks.rawCleanEqualsInputsClean', ca['rawCleanEqualsInputsClean'], cb['rawClean']['identicalToInputsClean'])
    for ka, kb in (('bars', 'calendar'), ('W', 'W'), ('C', 'C'), ('Wprime', 'Wp')):
        cmp(f'checks.calendar.{ka}', ca['calendar'][ka], cb['barCounts'][kb])
    cmp('checks.countResultsAgree', ca['countResultsAgree'], B['countResultsCheck']['allBuySellMatch'])

    # ---- 三个口径
    evaluation('main', A['main'], B['main'])
    evaluation('l004Layout', A['l004Layout'], B['l004Layout'])
    la, lb = A['l004LayoutAltShifts'], B['l004LayoutAltShifts']
    cmp('l004LayoutAltShifts.shiftRange', la['shiftRange'], lb['shiftRange'])
    cmp('l004LayoutAltShifts.pC', la['pC'], lb['p_C'])
    cmp('l004LayoutAltShifts.grade', la['grade'], lb['grade'])
    for k in GRADE_KEYS:
        cmp(f'l004LayoutAltShifts.counts.{k}', la['counts'][k], lb['counts'][CNT_MAP[k]])
    evaluation('e1', A['e1'], B['E1'], with_placebo_detail=False)
    cmp('e1.differsFromMain', A['e1']['differsFromMain'], B['E1']['grade']['differsFromMain'])

    # ---- final
    fa, fb = A['final'], B['final']
    for k in ('mainGrade', 'l004Grade', 'grade', 'sensitiveToSingleDataDay'):
        cmp(f'final.{k}', fa[k], fb[k])
    cmp('final.subLabel', fa['subLabel'], fb['subtag'] if fb['grade'] == '回撤门槛通过、择时增量未证实' else None)
    cmp('final.pC', fa['pC'], B['main']['placebo']['p_C'])
    lr = fb['likelihoodRatio']['gradeWithSubtag']
    cmp('final.likelihood.pH1', fa['likelihood']['pH1'], lr[0])
    cmp('final.likelihood.pH0', fa['likelihood']['pH0'], lr[1])
    cmp('final.likelihood.ratio', fa['likelihood']['ratio'], lr[2], 0.05,
        note='表示口径不同：主实现 = pH1/pH0 未取整（1.2553），第二实现取 PREREG 功效表的一位小数（1.3）；容差 0.05 只核对量级')
    cmp('final.e1DependencyStatement', fa['e1DependencyStatement'], B['E1']['grade']['differsFromMain'])

    # ---- variants：现金计息（CLARIFY-1 第 2 条 → 第二实现 perCalendarDay）
    cash_b = B['cashInterest']['perCalendarDay']
    for c in TARGETS:
        va, vb = A['variants']['cash'][c], cash_b['perIndex'][c]
        ws(f'variants.cash.{c}.W', va['W'], vb['W_rule'])
        ws(f'variants.cash.{c}.C', va['C'], vb['C_rule'])
        cmp(f'variants.cash.{c}.D', va['D'], vb['D_cashRule'])
        cmp(f'variants.cash.{c}.A', va['A'], vb['A_cash'])
        cmp(f'variants.cash.{c}.P', va['P'], vb['P_cash'],
            note='第二实现 P_cash = A_cash 且主口径 D；主实现可能用计息版 D；本次两种 D 全部为真')
        ws(f'variants.cash.{c}.MCash.W', va['MCash']['W'], vb['W_Mcash'])
        ws(f'variants.cash.{c}.MCash.C', va['MCash']['C'], vb['C_Mcash'])
        cmp(f'variants.cash.{c}.XvsMCash', va['XvsMCash'], vb['X_cashRule_vs_Mcash'])
    cc = A['variants']['cashCounts']
    cmp('variants.cashCounts.A', cc['A'], cash_b['A'])
    cmp('variants.cashCounts.D', cc['D'], cash_b['D_cashRule'])
    cmp('variants.cashCounts.P', cc['P'], cash_b['P'])
    cmp('variants.cashCounts.XvsMCash', cc['XvsMCash'], cash_b['X_cashRule_vs_Mcash'])
    cmp('variants.cashCounts.crossesP9Boundary', cc['crossesP9Boundary'], cash_b['crossesPge9Boundary'])
    # 死叉次日卖
    for c in TARGETS:
        va, vb = A['variants']['nextDaySell'][c], B['sellNextDay']['perIndex'][c]
        cmp(f'variants.nextDaySell.{c}.k', va['k'], vb['k'], KT)
        ws(f'variants.nextDaySell.{c}.W', va['W'], vb['W_rule'])
        ws(f'variants.nextDaySell.{c}.C', va['C'], vb['C_rule'])
        for k in ('D', 'A', 'P', 'X'):
            cmp(f'variants.nextDaySell.{c}.{k}', va[k], vb[k])
        cmp(f'variants.nextDaySell.{c}.trades.buys', va['trades']['buys'], vb['tradesAll']['buyDates'])
        cmp(f'variants.nextDaySell.{c}.trades.sells', va['trades']['sells'], vb['tradesAll']['sellDates'])
    for k in ('D', 'A', 'P', 'X'):
        cmp(f'variants.nextDaySellCounts.{k}', A['variants']['nextDaySellCounts'][k], B['sellNextDay']['counts'][k])

    # ---- macdOnly
    for c in TARGETS:
        va, vb = A['macdOnly'][c], B['macdOnly']['perIndex'][c]
        ws(f'macdOnly.{c}.W', va['W'], vb['W'])
        ws(f'macdOnly.{c}.C', va['C'], vb['C'])
        cmp(f'macdOnly.{c}.D', va['D'], vb['D'])
        cmp(f'macdOnly.{c}.A', va['A'], vb['A'])

    # ---- 择时滤网安慰剂（CLARIFY-1 第 3 条：#X 对各自 k）
    fa, fb = A['filterPlacebo'], B['timingFilterPlacebo']
    cmp('filterPlacebo.nShifts', fa['nShifts'], fb['nShifts'])
    for k in ('Dbar', 'Abar'):
        dist(f'filterPlacebo.dist.{k}', fa['dist'][k], fb['dist_mainConvention'][k])
    for k in ('D', 'X'):
        dist(f'filterPlacebo.dist.{k}', fa['dist'][k], fb['dist_mainConvention'][k], PCT)
    cmp('filterPlacebo.pDbar', fa['pDbar'], fb['Dbar']['p_ge'])
    cmp('filterPlacebo.pAbar', fa['pAbar'], fb['Abar']['p_ge'])
    cmp('filterPlacebo.pD', fa['pD'], fb['D']['p_ge'])
    cmp('filterPlacebo.pX', fa['pX'], fb['X_ownK']['p_ge'])

    # ---- reports
    pv = B['publishedVsBackfill']
    other_b = B['otherDrawdowns']
    for c in TARGETS:
        ra = A['reports'][c]
        for y, va in ra['years'].items():
            vb = B['byYear'][c][y]
            f = f'reports.{c}.years.{y}'
            cmp(f + '.from', va['from'], vb['base'])
            cmp(f + '.to', va['to'], vb['end'])
            for k in ('rule', 'hold', 'M'):
                cmp(f'{f}.{k}', va[k], vb[k], PCT)
            cmp(f + '.buys', va['buys'], vb['buys'])
            cmp(f + '.sells', va['sells'], vb['sells'])
            cmp(f + '.heldShare', va['heldShare'], vb['heldShareClose'], KT)
        sb = B['segmentContribution'][c]
        for ka, kb in (('bull', 'bull_2006-01-04..2007-10-16'), ('C', 'C'), ('W', 'W')):
            cmp(f'reports.{c}.contributions.{ka}.ruleMinusHold', ra['contributions'][ka]['ruleMinusHold'], sb[kb]['ruleMinusHoldLog'], PCT)
            cmp(f'reports.{c}.contributions.{ka}.ruleMinusM', ra['contributions'][ka]['ruleMinusM'], sb[kb]['ruleMinusMLog'], PCT)
        for seg in ra['otherSegments']:
            triple(f"reports.{c}.otherSegments.{seg['from']}..{seg['to']}", seg, other_b[f"{seg['from']}..{seg['to']}"][c])
        for seg in ra['cSplit']:
            triple(f"reports.{c}.cSplit.{seg['from']}..{seg['to']}", seg, pv['C_split'][f"{seg['from']}..{seg['to']}"][c])
        ba, bb = ra['backfillSegment'], pv['backfillSegment']['perIndex'][c]
        cmp(f'reports.{c}.backfillSegment.k', ba['k'], bb['k'], KT)
        triple(f'reports.{c}.backfillSegment', ba, bb)
        pa = ra['published']
        pb = pv['publishedSubset_n4'].get(c)
        if pa is None or pb is None:
            cmp(f'reports.{c}.published.isNull', pa is None, pb is None)
        else:
            cmp(f'reports.{c}.published.from', pa['from'], pb['window'][0])
            cmp(f'reports.{c}.published.to', pa['to'], pb['window'][1])
            cmp(f'reports.{c}.published.k', pa['k'], pb['k'], KT)
            triple(f'reports.{c}.published', pa, pb)

    # ---- groups / l004Sets
    ga, gb = A['groups'], B['groups']
    for ka, kb in (('bluechipDividend', 'largeCapDividend'), ('smallCyclical', 'smallCyclical'), ('other', 'other')):
        for k in ('n', 'P', 'D', 'A', 'X'):
            cmp(f'groups.{ka}.{k}', ga[ka][k], gb['groups'][kb][k])
    cmp('groups.patternReproduced', ga['patternReproduced'], gb['L004PatternReproduced'])
    t = gb['twoByTwo_P']
    cmp('l004Sets.passSet.P', A['l004Sets']['passSet']['P'], t['L004pass_P'])
    cmp('l004Sets.passSet.notP', A['l004Sets']['passSet']['notP'], t['L004pass_notP'])
    cmp('l004Sets.failSet.P', A['l004Sets']['failSet']['P'], t['L004fail_P'])
    cmp('l004Sets.failSet.notP', A['l004Sets']['failSet']['notP'], t['L004fail_notP'])
    cmp('l004Sets.passSet.medianRuleMinusMAnnual', A['l004Sets']['passSet']['medianRuleMinusMAnnual'], gb['medianRuleMinusM_annual']['L004pass'], PCT)
    cmp('l004Sets.failSet.medianRuleMinusMAnnual', A['l004Sets']['failSet']['medianRuleMinusMAnnual'], gb['medianRuleMinusM_annual']['L004fail'], PCT)

    # ---- nearTies
    nb = B['nearTies']
    cmp('nearTies.ratio.dates', [x['date'] if isinstance(x, dict) else x for x in A['nearTies']['ratio']], [x['date'] for x in nb['ratio']])
    ma = sorted((x['code'], x['date']) for x in A['nearTies']['macd'])
    mb = sorted((c, t['date']) for c, lst in nb['macd'].items() for t in lst)
    cmp('nearTies.macd.codeDate', ma, mb)
    cmp('nearTies.macd.anyTradeDayOrNext', any(x['tradeDayOrNext'] for x in A['nearTies']['macd']),
        nb['summary']['macdTiesThatCanDecideTrade'] > 0, note='两边口径不同：主实现看是否成交日或其次日；第二实现看是否可能决定成交（不在预热期）；都为否')

    # ---- fourCrashes
    fa, fb = A['fourCrashes'], B['fourCrashes']['rows']
    r08a = next(v for k, v in fa.items() if k.startswith('2008'))
    r08b = fb['2008（C 段）']
    cmp('fourCrashes.2008.pC', r08a['pC'], r08b['p_C'])
    for ka, kb in (('X', 'X'), ('Xdd', 'X_dd'), ('Xann', 'X_ann')):
        cmp(f'fourCrashes.2008.{ka}', r08a[ka], r08b[kb])
    cmp('fourCrashes.2008.betterThanRandom', r08a['betterThanRandom'], r08b['pCle010'])
    for ep in ('2015 股灾', '2018 熊市', '2021–24 慢熊'):
        va = next(v for k, v in fa.items() if k.startswith(ep))
        vb = fb[ep]
        cmp(f'fourCrashes.{ep}.pC', va['pC'], vb['p_C_median'])
        for ka, kb in (('X', 'X_median'), ('Xdd', 'X_dd_median'), ('Xann', 'X_ann_median')):
            cmp(f'fourCrashes.{ep}.{ka}', va[ka], vb[kb])
        cmp(f'fourCrashes.{ep}.betterThanRandom', va['betterThanRandom'], vb['betterThanRandom'])

    # ---- countCheck
    for c in TARGETS:
        va = A['countCheck'][c]
        cmp(f'countCheck.{c}.buys', va['buys'], len(B['main']['perIndex'][c]['tradesAll']['buyDates']))
        cmp(f'countCheck.{c}.sells', va['sells'], len(B['main']['perIndex'][c]['tradesAll']['sellDates']))
        cmp(f'countCheck.{c}.ok', va['ok'], not B['countResultsCheck']['perIndex'][c]['yearMismatches'])

    diffs = [r for r in rows if not r['ok']]
    num = [r for r in rows if r['tol'] is not None and r['ok'] and r['main'] is not None]
    maxdiff = {}
    for r in num:
        if r['tol'] not in (PCT, KT):
            continue
        key = 'k' if r['tol'] == KT else 'pct'
        maxdiff[key] = max(maxdiff.get(key, 0.0), abs(r['main'] - r['repl']))
    both_none = sum(1 for r in rows if r['main'] is None and r['repl'] is None)
    summary = {'fieldsCompared': len(rows), 'diffs': len(diffs), 'maxAbsDiffWithinTolerance': maxdiff,
               'exactFields': sum(1 for r in rows if r['tol'] is None), 'toleranceFields': sum(1 for r in rows if r['tol'] is not None),
               'bothNull': both_none}
    json.dump({'summary': summary, 'diffs': diffs}, open(os.path.join(HERE, 'compare-diffs.json'), 'w'),
              ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    for r in diffs:
        print(f"DIFF {r['field']}: main={r['main']!r} repl={r['repl']!r} tol={r['tol']} {r['note']}")
    return 0 if not diffs else 1


if __name__ == '__main__':
    sys.exit(main())
