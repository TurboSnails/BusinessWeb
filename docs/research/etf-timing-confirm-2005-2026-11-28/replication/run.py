#!/usr/bin/env python3
"""L-056 独立第二实现（Python）。

按 PREREG.md（v3 冻结版，冻结提交 0a1f2036）文字独立实现：不 import / 不调用 strategies.mjs，
不读主实现 run.mjs 及其产物。运行：

    uv run --python 3.12 --with numpy python -I replication/run.py

（在 docs/research/etf-timing-confirm-2005-2026-11-28/ 下或任意目录均可；路径按本文件位置解析。）
输出 replication/results.json。解释与歧义见 replication/NOTES.md。
"""
import hashlib
import json
import math
import os
import sys
from datetime import date

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
STUDY = os.path.dirname(HERE)
REPO = os.path.abspath(os.path.join(STUDY, '..', '..', '..'))
RAW = os.path.join(REPO, 'data-raw', 'etf-timing-confirm', 'raw')
L018 = os.path.join(REPO, 'docs', 'research', 'etf-volume-2026-11-25', 'inputs.json')
STRATEGIES = os.path.join(REPO, 'scripts', 'research', 'etf-strategy-oos', 'strategies.mjs')

SHA_INPUTS_CLEAN = '353b80a5b6f2b8c0091608b89149b2abfa5a53a70eb94054a8ed06a8fbd34cb0'
SHA_L018 = '3f1836349d6a1566e58c85f9d5c987514db71c9ea2f83d7b909bbbf83294e8e5'
SHA_CASH = '3f012682a9a131d0b702d3c32d80aa8e080f409a2ee7ee059d70d7318dcfb79b'
SHA_STRATEGIES = '9570a34bd55439245012b9b8bfb2a2143b8d92acb346a301704501bb9edbbb82'

TARGETS = ['H00300', 'H00905', 'H00852', 'H00016', 'H00922', 'H00986', 'H00987', 'H00988',
           'H00989', 'H00990', 'H00991', 'H00992', 'H00993', 'H00994', 'H00995']
COST = 0.001
WARMUP = 120
W = ('2005-07-06', '2010-12-31')
C = ('2007-10-16', '2008-11-04')
WP = ('2008-05-26', '2010-12-31')
C_SSE = ('2007-10-16', '2008-10-28')
BULL_SEG = ('2006-01-04', '2007-10-16')
C_SPLIT = [('2007-10-16', '2008-05-23'), ('2008-05-26', '2008-11-04')]
BACKFILL_SEG = ('2005-07-06', '2008-05-23')
OTHER_DD = [('2007-10-16', '2007-11-28'), ('2008-01-14', '2008-04-21'), ('2008-05-05', '2008-11-04'),
            ('2009-08-03', '2009-08-31'), ('2009-12-07', '2010-07-05')]
PUBLISHED = {'H00300': W, 'H00016': W, 'H00905': ('2007-01-15', '2010-12-31'), 'H00922': WP}
SHIFTS = np.arange(63, 1276)  # 1,213 个
assert len(SHIFTS) == 1213
GROUPS = {
    'largeCapDividend': ['H00300', 'H00016', 'H00922', 'H00992'],
    'smallCyclical': ['H00905', 'H00852', 'H00987', 'H00988', 'H00993'],
    'other': ['H00986', 'H00989', 'H00990', 'H00991', 'H00994', 'H00995'],
}
L004_PASS = ['H00905', 'H00852', 'H00986', 'H00987', 'H00988', 'H00989', 'H00990', 'H00993', 'H00995']
L004_FAIL = ['H00300', 'H00016', 'H00922', 'H00991', 'H00992', 'H00994']
GRADES = ['未确认', '回撤门槛通过、择时增量未证实', '部分确认', '确认']  # 低 → 高
# PREREG「功效」节表格（2011–2026，只作量级参考）
POWER_TABLE = {
    '确认': (0.008, 0.014, 0.6),
    '部分确认': (0.059, 0.047, 1.3),
    '回撤门槛通过、择时增量未证实': (0.932, 0.510, 1.8),
    '回撤门槛通过、择时增量未证实|p_C<=0.10': (0.398, 0.060, 6.6),
    '回撤门槛通过、择时增量未证实|p_C>0.10': (0.534, 0.450, 1.2),
    '未确认': (0.000, 0.429, 0.0),
}


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        h.update(f.read())
    return h.hexdigest()


def ms(d):
    """与 JS Date.parse('YYYY-MM-DD')（UTC）相同的毫秒数。"""
    return float((date.fromisoformat(d) - date(1970, 1, 1)).days * 86400000)


def r8(x):
    return None if x is None else float(x)


# ---------------------------------------------------------------- 数据

def clean_from_raw():
    """从 raw 独立清洗；返回 (series, report)。raw 不在时返回 (None, 原因)。"""
    if not os.path.isdir(RAW):
        return None, 'raw 目录不存在'
    manifest = {m['file']: m for m in json.load(open(os.path.join(RAW, 'manifest.json')))}
    codes = ['000015', '000300', '000922'] + sorted(TARGETS)
    out, rep = {}, {'shaMismatch': [], 'fakeRowsDropped': {}, 'overlapDays': {}, 'rowsBeforeBase': {},
                    'rowsAfter2010': {}, 'closeLeq0': {}}
    for code in codes:
        merged = {}
        for start, end in (('20041128', '20101231'), ('20101225', '20110105')):
            fn = f'perf-{code}-{start}-{end}.json'
            p = os.path.join(RAW, fn)
            if sha256_file(p) != manifest[fn]['sha256']:
                rep['shaMismatch'].append(fn)
            rows = json.load(open(p))['data']
            dropped = [r['tradeDate'] for r in rows if r['tradeDate'] == start]
            rep['fakeRowsDropped'].setdefault(code, []).extend(dropped)
            ov = 0
            for r in rows:
                if r['tradeDate'] == start:
                    continue
                if r['close'] is None or r['close'] <= 0:
                    rep['closeLeq0'][code] = rep['closeLeq0'].get(code, 0) + 1
                    continue
                d = f"{r['tradeDate'][:4]}-{r['tradeDate'][4:6]}-{r['tradeDate'][6:]}"
                if d in merged:
                    ov += 1
                    assert merged[d] == r['close'], f'{code} {d} 重叠日收盘不同'
                merged[d] = r['close']
            if start == '20101225':
                rep['overlapDays'][code] = ov
        ds = sorted(merged)
        rep['rowsBeforeBase'][code] = sum(1 for d in ds if d < '2004-12-31')
        rep['rowsAfter2010'][code] = sum(1 for d in ds if d > '2010-12-31')
        out[code] = [[d, merged[d]] for d in ds if '2004-12-31' <= d <= '2010-12-31']
    return out, rep


def load_inputs():
    p = os.path.join(STUDY, 'inputs-clean.json')
    sha = sha256_file(p)
    assert sha == SHA_INPUTS_CLEAN, f'inputs-clean.json SHA-256 不符: {sha}'
    frozen = json.load(open(p))['series']
    raw, rep = clean_from_raw()
    check = {'inputsCleanSha256': sha, 'inputsCleanShaOk': True}
    if raw is None:
        check['rawClean'] = {'available': False, 'note': rep + '；以 inputs-clean.json 为输入'}
    else:
        diffs = {}
        for code in frozen:
            a, b = frozen[code], raw[code]
            nd = 0 if len(a) == len(b) and all(x[0] == y[0] and x[1] == y[1] for x, y in zip(a, b)) else 1
            if nd:
                diffs[code] = {'frozenRows': len(a), 'rawRows': len(b)}
        assert set(raw) == set(frozen)
        check['rawClean'] = {'available': True, 'identicalToInputsClean': not diffs, 'diffs': diffs,
                             'rawShaMismatchVsManifest': rep['shaMismatch'],
                             'fakeRowsDropped': rep['fakeRowsDropped'], 'overlapDaysAsserted': rep['overlapDays'],
                             'rowsBeforeBaseDropped': rep['rowsBeforeBase'], 'rowsAfter2010Dropped': rep['rowsAfter2010'],
                             'closeLeq0Dropped': rep['closeLeq0']}
        assert not diffs and not rep['shaMismatch']
    return frozen, check


def load_l004():
    sha = sha256_file(L018)
    assert sha == SHA_L018, f'L-018 inputs.json SHA-256 不符: {sha}'
    d = json.load(open(L018))
    ser = {}
    for grp in ('timing', 'targets'):
        for code, v in d[grp].items():
            ser[code] = [[r[0], r[1]] for r in v['rows'] if r[0] <= '2010-12-31' and r[1] > 0]
    return ser, sha


def load_cash():
    p = os.path.join(STUDY, 'cash-rates.json')
    sha = sha256_file(p)
    assert sha == SHA_CASH
    return json.load(open(p))['oneYearDeposit'], sha


# ---------------------------------------------------------------- 规则

def macd(closes):
    n = len(closes)
    f = closes[0]
    s = f
    dea = 0.0
    dif_a, dea_a = [0.0] * n, [0.0] * n
    gold, dead = [False] * n, [False] * n
    pd = None  # (dif, dea) 前一日
    for i in range(n):
        if i:
            f += 2 / 13 * (closes[i] - f)
            s += 2 / 27 * (closes[i] - s)
        dif = f - s
        dea += 0.2 * (dif - dea)
        if pd is not None:
            gold[i] = pd[0] <= pd[1] and dif > dea
            dead[i] = pd[0] >= pd[1] and dif < dea
        dif_a[i], dea_a[i] = dif, dea
        pd = (dif, dea)
    return gold, dead, dif_a, dea_a


def ratio_timing(num, den):
    """num/den 为 [[date, close]]。比值按分母日期迭代，只在分子有（非零）收盘的日子计算。
    返回 (dict date→bool, 有定义日期列表, 近似并列列表)。"""
    a = {d: c for d, c in num}
    out, q, ties = {}, [], []
    for d, c in den:
        av = a.get(d)
        if not av:
            continue
        q.append(av / c)
        if len(q) > 20:
            q.pop(0)
        if len(q) == 20:
            s = 0
            for v in q:  # 从旧到新求和
                s = s + v
            ma = s / 20
            out[d] = q[-1] > ma
            if abs(q[-1] - ma) / ma < 1e-12:
                ties.append({'date': d, 'ratio': q[-1], 'ma': ma})
    return out, list(out.keys()), ties


def timing_gold(dates, closes, gold, dead, bull, warmup=WARMUP, sell_next=False, cashf=None):
    n = len(closes)
    eq, pos = [0.0] * n, [0] * n
    cash, units, pend, buy_idx, last_bull = 1.0, 0.0, None, -1, None
    for i in range(n):
        t = bull.get(dates[i])
        if t is not None:
            last_bull = t
        is_bull = last_bull is not False
        px = closes[i]
        if cashf is not None and not units:
            cash *= cashf[i]
        if pend == 'buy':
            units = cash * (1 - COST) / px
            cash = 0.0
            buy_idx = i
        elif pend == 'sell':
            cash = units * px * (1 - COST)
            units = 0.0
        pend = None
        if i >= warmup:
            if not units and gold[i] and is_bull:
                pend = 'buy'
            elif units and dead[i]:
                if buy_idx == i or sell_next:
                    pend = 'sell'
                else:
                    cash = units * px * (1 - COST)
                    units = 0.0
        eq[i] = units * px if units else cash
        pos[i] = 1 if units else 0
    return eq, pos, pend


def macd_only(closes, gold, dead, warmup=60):
    n = len(closes)
    eq = [0.0] * n
    cash, units, pend = 1.0, 0.0, None
    for i in range(n):
        px = closes[i]
        if pend == 'buy':
            units = cash * (1 - COST) / px
            cash = 0.0
        elif pend == 'sell':
            cash = units * px * (1 - COST)
            units = 0.0
        pend = None
        if i >= warmup:
            if not units and gold[i]:
                pend = 'buy'
            elif units and dead[i]:
                pend = 'sell'
        eq[i] = units * px if units else cash
    return eq


def win_idx(dates, frm, to):
    i0 = next(i for i, d in enumerate(dates) if d >= frm)
    k = next((i for i, d in enumerate(dates) if d > to), -1)
    i1 = k - 1 if k > 0 else len(dates) - 1
    return i0, i1


def window_stats(dates, eq, frm, to):
    i0, i1 = win_idx(dates, frm, to)
    if i1 <= i0:
        return None
    years = (ms(dates[i1]) - ms(dates[i0])) / (365.25 * 864e5)
    ret = eq[i1] / eq[i0]
    peak, dd = -math.inf, 0.0
    for i in range(i0, i1 + 1):
        peak = max(peak, eq[i])
        dd = min(dd, eq[i] / peak - 1)
    return {'years': years, 'total': (ret - 1) * 100, 'annual': (ret ** (1 / years) - 1) * 100 if years >= 1 else None,
            'dd': dd * 100}


def ann_vol(dates, eq, frm, to):
    i0, i1 = win_idx(dates, frm, to)
    r = np.array([eq[i] / eq[i - 1] - 1 for i in range(i0 + 1, i1 + 1)])
    return float(np.std(r, ddof=1) * math.sqrt(252) * 100)


def static_curve(n, i0, i1, k, closes, cash_r=None):
    """同平均仓位静态对照：区间首日 1，每日 Π(1 + k·r_hold (+ (1−k)·r_cash))。区间外为 None。"""
    m = [None] * n
    m[i0] = 1.0
    for t in range(i0 + 1, i1 + 1):
        r = closes[t] / closes[t - 1] - 1
        g = k * r
        if cash_r is not None:
            g = g + (1 - k) * cash_r[t]
        m[t] = m[t - 1] * (1 + g)
    return m


def trades_of(pos, dates, i_from=0, i_to=None):
    i_to = len(pos) - 1 if i_to is None else i_to
    buys, sells = [], []
    for i in range(max(i_from, 1), i_to + 1):
        if pos[i] == 1 and pos[i - 1] == 0:
            buys.append(dates[i])
        elif pos[i] == 0 and pos[i - 1] == 1:
            sells.append(dates[i])
    if i_from == 0 and pos[0] == 1:
        buys.insert(0, dates[0])
    return buys, sells


# ---------------------------------------------------------------- 安慰剂

def shift_placebo(e, r, L, windows, shifts=SHIFTS):
    """e: (15, L) 0/1 暴露；r: (15, L) 持有日收益（r[:,0] 不用）。
    windows: name → (u0, u1)。返回 E(L−1)（以 E(−1) = 1 为基，首日成交成本计入；CLARIFY-1 第 6 条）(S,15)
    与各窗口最大回撤 (S,15)（小数）。"""
    S = len(shifts)
    idx = (np.arange(L)[None, :] + shifts[:, None]) % L  # (S, L)
    Es = e[:, idx].transpose(1, 0, 2).astype(np.float64)  # (S, 15, L)
    E = np.ones((S, e.shape[0]))
    peaks = {k: None for k in windows}
    dds = {k: np.zeros_like(E) for k in windows}
    for u in range(L):
        if u >= 1:
            E = E * (1 + Es[:, :, u] * r[:, u])
        if u < L - 1:
            tr = Es[:, :, u + 1] != Es[:, :, u]
            E = np.where(tr, E * (1 - COST), E)
        for k, (u0, u1) in windows.items():
            if u0 <= u <= u1:
                peaks[k] = E.copy() if u == u0 else np.maximum(peaks[k], E)
                dds[k] = np.minimum(dds[k], E / peaks[k] - 1)
    return E, dds


def dist_main(arr):
    """主实现 schema 的分布口径：排序后第 floor(q·n) 个；mean 为算术平均。"""
    a = np.sort(np.asarray(arr, dtype=float))
    n = len(a)
    return {'p10': float(a[int(math.floor(0.1 * n))]), 'median': float(np.median(a)),
            'p90': float(a[int(math.floor(0.9 * n))]), 'mean': float(np.mean(a))}


def placebo_X_ownk(e, r, L, shifts, ann, ddc, years_w, uc0, uc1):
    """辅助（非判定）：时机安慰剂 #X^s 用各平移自己的 k^s 构造静态对照。"""
    S = len(shifts)
    idx = (np.arange(L)[None, :] + shifts[:, None]) % L
    ks = e[:, idx][:, :, 1:].mean(axis=2).T  # (S, 15)
    M = np.ones_like(ks)
    pk, dd = None, np.zeros_like(ks)
    for u in range(1, L):
        M = M * (1 + ks * r[:, u][None, :])
        if uc0 <= u <= uc1:
            pk = M.copy() if u == uc0 else np.maximum(pk, M)
            dd = np.minimum(dd, M / pk - 1)
    mann = (M ** (1 / years_w) - 1) * 100
    return ((ann >= mann) & (ddc >= dd * 100)).sum(axis=1)


def p_ge(arr, x):
    return (1 + int(np.sum(arr >= x))) / (1 + len(arr))


def quantile_info(arr, x):
    arr = np.asarray(arr, dtype=float)
    return {'p_ge': p_ge(arr, x), 'shareBelow': float(np.mean(arr < x)), 'shareEqual': float(np.mean(arr == x)),
            'p10': float(np.percentile(arr, 10)), 'median': float(np.median(arr)), 'p90': float(np.percentile(arr, 90)),
            'mean': float(np.mean(arr))}


# ---------------------------------------------------------------- 等级

def grade_of(nP, nD, nX, pC):
    if nD < 12:
        g = '未确认'
    elif nX < 8:
        g = '回撤门槛通过、择时增量未证实'
    elif nP >= 9 and pC <= 0.10:
        g = '确认'
    else:
        g = '部分确认'
    return g


def apply_rule1(g, nX, nXp):
    if nX >= 8 and nXp < 8 and GRADES.index(g) > GRADES.index('部分确认'):
        return '部分确认', True
    return g, (nX >= 8 and nXp < 8)


def subtag(g, pC):
    if g == '回撤门槛通过、择时增量未证实':
        return ('大跌段时机优于随机' if pC <= 0.10 else '大跌段时机与随机无异') + f'（p_C = {pC:.4f}）'
    if g == '部分确认' and pC > 0.10:
        return '与同样仓位结构的随机时机相比不显著'
    return None


# ---------------------------------------------------------------- 一个口径的完整评估

def evaluate(series, bull, label, sell_next=False, cashf=None, cash_r=None, c_win=C, do_placebo=True,
             m_cash=False, keep_curves=False, shifts=SHIFTS):
    """series: code → [[date, close]]（被交易指数）；bull: date→bool。"""
    per, curves = {}, {}
    e_rows, r_rows, Ls = [], [], set()
    for code in TARGETS:
        dates = [x[0] for x in series[code]]
        closes = [x[1] for x in series[code]]
        n = len(closes)
        gold, dead, dif, dea = macd(closes)
        eq, pos, pend = timing_gold(dates, closes, gold, dead, bull, sell_next=sell_next, cashf=cashf)
        i0, i1 = win_idx(dates, *W)
        L = i1 - i0 + 1
        Ls.add(L)
        e = np.array([pos[i0 + u - 1] for u in range(L)], dtype=np.int8)
        k = float(np.mean(e[1:]))
        m = static_curve(n, i0, i1, k, closes, cash_r if m_cash else None)
        hold = closes
        res = {'k': k, 'L': L, 'posAtWStartMinus1': int(pos[i0 - 1]), 'posAtWStart': int(pos[i0]),
               'pendingAtEnd': pend}
        for wname, (frm, to) in (('W', W), ('C', c_win)):
            res[wname] = {nm: window_stats(dates, cv, frm, to) for nm, cv in (('rule', eq), ('hold', hold), ('M', m))}
        for nm, cv in (('rule', eq), ('hold', hold), ('M', m)):
            res['W'][nm]['vol'] = ann_vol(dates, cv, *W)
        R, H, M = res['W']['rule'], res['W']['hold'], res['W']['M']
        Rc, Hc, Mc = res['C']['rule'], res['C']['hold'], res['C']['M']
        res['D'] = Rc['dd'] >= 0.7 * Hc['dd']
        res['A'] = R['annual'] >= H['annual'] - 1
        res['P'] = res['D'] and res['A']
        res['X_ann'] = R['annual'] >= M['annual']
        res['X_dd'] = Rc['dd'] >= Mc['dd']
        res['X'] = res['X_ann'] and res['X_dd']
        res['volLowerThanM'] = R['vol'] < M['vol']
        res['volLowerThanHold'] = R['vol'] < H['vol']
        # 降级规则 1：W′
        j0, j1 = win_idx(dates, *WP)
        kp = float(np.mean([pos[t - 1] for t in range(j0 + 1, j1 + 1)]))
        mp = static_curve(n, j0, j1, kp, closes, cash_r if m_cash else None)
        sr, sm, sh = window_stats(dates, eq, *WP), window_stats(dates, mp, *WP), window_stats(dates, hold, *WP)
        res['Wp'] = {'k': kp, 'L': j1 - j0 + 1, 'rule': sr, 'hold': sh, 'M': sm,
                     'X_ann': sr['annual'] >= sm['annual'], 'X_dd': sr['dd'] >= sm['dd']}
        res['Wp']['X'] = res['Wp']['X_ann'] and res['Wp']['X_dd']
        b, s = trades_of(pos, dates, i0, i1)
        res['tradesW'] = {'buys': len(b), 'sells': len(s), 'buyDates': b, 'sellDates': s}
        fb, fs = trades_of(pos, dates)
        res['tradesAll'] = {'buyDates': fb, 'sellDates': fs}
        per[code] = res
        curves[code] = {'dates': dates, 'closes': closes, 'eq': eq, 'pos': pos, 'm': m, 'i0': i0, 'i1': i1,
                        'gold': gold, 'dead': dead, 'dif': dif, 'dea': dea}
        e_rows.append(e)
        r_rows.append(np.array([0.0] + [closes[i0 + u] / closes[i0 + u - 1] - 1 for u in range(1, L)]))
    assert len(Ls) == 1, f'{label}: 各指数 W 长度不同 {Ls}'
    L = Ls.pop()
    cnt = lambda key: sum(1 for c in TARGETS if per[c][key])
    agg = {k: cnt(k) for k in ('D', 'A', 'P', 'X', 'X_ann', 'X_dd', 'volLowerThanM', 'volLowerThanHold')}
    agg['Xp'] = sum(1 for c in TARGETS if per[c]['Wp']['X'])
    agg['Xp_ann'] = sum(1 for c in TARGETS if per[c]['Wp']['X_ann'])
    agg['Xp_dd'] = sum(1 for c in TARGETS if per[c]['Wp']['X_dd'])
    out = {'label': label, 'L': L, 'perIndex': per, 'counts': agg}
    if do_placebo:
        out['placebo'] = run_placebo(per, curves, np.array(e_rows), np.array(r_rows), L, c_win, shifts)
        pC = out['placebo']['p_C']
        g0 = grade_of(agg['P'], agg['D'], agg['X'], pC)
        g1, triggered = apply_rule1(g0, agg['X'], agg['Xp'])
        out['grade'] = {'beforeRule1': g0, 'afterRule1': g1, 'rule1Triggered': triggered,
                        'rule1Note': '择时增量只出现在择时信号回填段' if triggered else None,
                        'subtag': subtag(g1, pC)}
    if keep_curves:
        out['_curves'] = curves
    return out


def run_placebo(per, curves, e, r, L, c_win, shifts=SHIFTS):
    code0 = TARGETS[0]
    cv = curves[code0]
    i0 = cv['i0']
    dates_w = cv['dates'][i0:i0 + L]
    years_w = (ms(dates_w[-1]) - ms(dates_w[0])) / (365.25 * 864e5)
    uc0, uc1 = win_idx(dates_w, *c_win)
    ratio, dds = shift_placebo(e, r, L, {'C': (uc0, uc1)}, shifts=shifts)
    ann = (ratio ** (1 / years_w) - 1) * 100
    ddc = dds['C'] * 100
    Dbar_s, Abar_s = ddc.mean(axis=1), ann.mean(axis=1)
    m_ann = np.array([per[c]['W']['M']['annual'] for c in TARGETS])
    m_ddc = np.array([per[c]['C']['M']['dd'] for c in TARGETS])
    Xs = ((ann >= m_ann[None, :]) & (ddc >= m_ddc[None, :])).sum(axis=1)
    Xs_own = placebo_X_ownk(e, r, L, shifts, ann, ddc, years_w, uc0, uc1)
    Dbar_rule = float(np.mean([per[c]['C']['rule']['dd'] for c in TARGETS]))
    Abar_rule = float(np.mean([per[c]['W']['rule']['annual'] for c in TARGETS]))
    X_rule = sum(1 for c in TARGETS if per[c]['X'])
    idxp = {}
    for j, c in enumerate(TARGETS):
        idxp[c] = quantile_info(ddc[:, j], per[c]['C']['rule']['dd'])
    # s = 0 自检：占位净值 vs 规则净值
    ratio0, dds0 = shift_placebo(e, r, L, {'C': (uc0, uc1)}, shifts=np.array([0]))
    selfcheck = {}
    for j, c in enumerate(TARGETS):
        R = per[c]['W']['rule']
        a0 = (ratio0[0, j] ** (1 / years_w) - 1) * 100
        lastTrade = bool(e[j, L - 1] != (curves[c]['pos'][curves[c]['i0'] + L - 1]))
        selfcheck[c] = {'annualDiffPct': float(a0 - R['annual']), 'ddCDiffPct': float(dds0['C'][0, j] * 100 - per[c]['C']['rule']['dd']),
                        'tradeOnLastDay': lastTrade}
    return {'nShifts': int(len(shifts)), 'shiftRange': [int(shifts[0]), int(shifts[-1])],
            'p_X_ownK_aux': p_ge(Xs_own, X_rule), 'X_ownK_aux_dist': dist_main(Xs_own),
            'dist_mainConvention': {'Dbar': dist_main(Dbar_s), 'Abar': dist_main(Abar_s), 'X': dist_main(Xs)}, 'Dbar_rule': Dbar_rule, 'Abar_rule': Abar_rule, 'X_rule': X_rule,
            'p_C': p_ge(Dbar_s, Dbar_rule), 'p_A': p_ge(Abar_s, Abar_rule), 'p_X': p_ge(Xs, X_rule),
            'Dbar_dist': quantile_info(Dbar_s, Dbar_rule), 'Abar_dist': quantile_info(Abar_s, Abar_rule),
            'X_dist': quantile_info(Xs, X_rule), 'indexLevel_C_dd': idxp, 's0SelfCheck': selfcheck}


# ---------------------------------------------------------------- 主流程

def main():
    res = {'implementation': 'replication/run.py（Python 3.12 + numpy，独立实现，未调用 strategies.mjs）',
           'prereg': 'PREREG.md v3（冻结提交 0a1f2036）'}
    data, chk = load_inputs()
    l004, sha_l018 = load_l004()
    rates, sha_cash = load_cash()
    chk['l018InputsSha256'] = sha_l018
    chk['cashRatesSha256'] = sha_cash
    chk['strategiesMjsSha256'] = sha256_file(STRATEGIES)
    chk['strategiesMjsShaOk'] = chk['strategiesMjsSha256'] == SHA_STRATEGIES
    dates = [x[0] for x in data['H00300']]
    for code, s in data.items():
        assert [x[0] for x in s] == dates, f'{code} 交易日历不同'
    i0, i1 = win_idx(dates, *W)
    c0, c1 = win_idx(dates, *C)
    p0, p1 = win_idx(dates, *WP)
    chk['barCounts'] = {'calendar': len(dates), 'W': i1 - i0 + 1, 'C': c1 - c0 + 1, 'Wp': p1 - p0 + 1,
                        'WStartIndex': i0, 'WStartDate': dates[i0]}
    assert (len(dates), i1 - i0 + 1, c1 - c0 + 1, p1 - p0 + 1) == (1458, 1338, 259, 637)
    assert i0 == WARMUP
    res['checks'] = chk

    bull, bull_dates, ratio_ties = ratio_timing(data['000300'], data['000922'])
    chk['timingFirstDefined'] = bull_dates[0]
    chk['timingDefinedDays'] = len(bull_dates)

    # ---- 主口径
    main_ = evaluate(data, bull, 'main', keep_curves=True)
    curves = main_.pop('_curves')
    attach_csse(main_, data, bull)
    res['main'] = main_

    # ---- L-004 布局
    l004_bull, l004_bdates, _ = ratio_timing(l004['000300'], l004['000922'])
    l004_ = evaluate(l004, l004_bull, 'l004Layout', keep_curves=True)
    lc = l004_.pop('_curves')
    attach_csse(l004_, l004, l004_bull)
    diff_states = [d for d in dates[i0:i1 + 1] if bull.get(d) != l004_bull.get(d)]
    l004_['timingStateDiffDaysInW'] = len(diff_states)
    l004_['timingStateDiffDates'] = diff_states
    l004_['tradeDateDiffsVsMain'] = {}
    for c in TARGETS:
        bm = set('B' + x for x in main_['perIndex'][c]['tradesW']['buyDates']) | set('S' + x for x in main_['perIndex'][c]['tradesW']['sellDates'])
        bl = set('B' + x for x in l004_['perIndex'][c]['tradesW']['buyDates']) | set('S' + x for x in l004_['perIndex'][c]['tradesW']['sellDates'])
        if bm != bl:
            l004_['tradeDateDiffsVsMain'][c] = {'onlyMain': sorted(bm - bl), 'onlyL004': sorted(bl - bm)}
    l004_['preWTrades'] = {c: dict(zip(('buys', 'sells'), map(len, trades_of(lc[c]['pos'], lc[c]['dates'], 0, lc[c]['i0'] - 1)))) for c in TARGETS}
    l004_['note'] = 'L-004 布局的 W 含 2008-01-01 假行，W 长 1,339 根；平移量仍取 PREREG 的 63..1275（1,213 个）'
    res['l004Layout'] = l004_
    alt = evaluate(l004, l004_bull, 'l004AltShifts', shifts=np.arange(63, 1277))
    res['l004LayoutAltShifts'] = {'shiftRange': [63, 1276], 'p_C': alt['placebo']['p_C'], 'p_A': alt['placebo']['p_A'],
                                  'p_X': alt['placebo']['p_X'], 'grade': alt['grade']['afterRule1'], 'counts': alt['counts']}

    gm, gl = main_['grade']['afterRule1'], l004_['grade']['afterRule1']
    final = gm if GRADES.index(gm) <= GRADES.index(gl) else gl
    pC_main = main_['placebo']['p_C']
    pc_final = pC_main if final == gm else l004_['placebo']['p_C']
    sub = subtag(final, pc_final)
    lr_key = final
    if final == '回撤门槛通过、择时增量未证实':
        lr_key = final + ('|p_C<=0.10' if pc_final <= 0.10 else '|p_C>0.10')
    res['final'] = {'grade': final, 'mainGrade': gm, 'l004Grade': gl,
                    'sensitiveToSingleDataDay': gm != gl, 'subtag': sub,
                    'likelihoodRatio': {'grade': POWER_TABLE[final], 'gradeWithSubtag': POWER_TABLE[lr_key],
                                        'columns': ['P(等级|H1)', 'P(等级|H0)', '似然比']}}

    # ---- E1（÷000015）
    e1_bull, e1_dates, _ = ratio_timing(data['000300'], data['000015'])
    e1 = evaluate(data, e1_bull, 'E1')
    attach_csse(e1, data, e1_bull)
    both = [d for d in dates if d in e1_bull and d in bull]
    e1['sameStateShare_bothDefined'] = float(np.mean([e1_bull[d] == bull[d] for d in both]))
    e1['bothDefinedDays'] = len(both)
    e1['grade']['differsFromMain'] = e1['grade']['afterRule1'] != gm
    e1['grade']['differsFromFinal'] = e1['grade']['afterRule1'] != final
    e1['note'] = 'E1 只有主口径数据（L-018 inputs 无 000015），降级规则 2 不适用；只报告'
    res['E1'] = slim(e1)

    # ---- C′ 上证综指日期
    csse = evaluate(data, bull, 'C_SSE', c_win=C_SSE)
    res['C_SSE'] = {'window': C_SSE, 'counts': csse['counts'], 'p_C': csse['placebo']['p_C'],
                    'changed': {'D': csse['counts']['D'] != main_['counts']['D'],
                                'X': csse['counts']['X'] != main_['counts']['X'],
                                'pC_side_of_0.10': (csse['placebo']['p_C'] <= 0.10) != (pC_main <= 0.10)},
                    'perIndex': {c: {'D': csse['perIndex'][c]['D'], 'X': csse['perIndex'][c]['X'],
                                     'C': csse['perIndex'][c]['C']} for c in TARGETS},
                    'placebo': {k: v for k, v in csse['placebo'].items() if k not in ('indexLevel_C_dd', 's0SelfCheck')}}

    # ---- 现金计息
    res['cashInterest'] = cash_interest(data, bull, rates, dates, main_)

    # ---- 死叉次日收盘卖
    sn = evaluate(data, bull, 'sellNextDay', sell_next=True, do_placebo=False)
    res['sellNextDay'] = {'counts': sn['counts'], 'mainCounts': main_['counts'],
                          'perIndex': {c: {k: sn['perIndex'][c][k] for k in ('k', 'D', 'A', 'P', 'X', 'X_ann', 'X_dd')} |
                                       {'W_rule': sn['perIndex'][c]['W']['rule'], 'C_rule': sn['perIndex'][c]['C']['rule'],
                                        'tradesAll': sn['perIndex'][c]['tradesAll']} for c in TARGETS}}

    # ---- macdOnly
    mo = {}
    for c in TARGETS:
        cv = curves[c]
        eqm = macd_only(cv['closes'], cv['gold'], cv['dead'])
        w = window_stats(cv['dates'], eqm, *W)
        w['vol'] = ann_vol(cv['dates'], eqm, *W)
        cc = window_stats(cv['dates'], eqm, *C)
        hw, hc = main_['perIndex'][c]['W']['hold'], main_['perIndex'][c]['C']['hold']
        mo[c] = {'W': w, 'C': cc, 'D': cc['dd'] >= 0.7 * hc['dd'], 'A': w['annual'] >= hw['annual'] - 1}
    res['macdOnly'] = {'warmup': 60, 'perIndex': mo, 'counts': {k: sum(1 for c in TARGETS if mo[c][k]) for k in ('D', 'A')}}

    # ---- 择时滤网安慰剂
    res['timingFilterPlacebo'] = timing_filter_placebo(data, bull, bull_dates, curves, main_)

    # ---- 发布后 / 回填 分开
    res['publishedVsBackfill'] = published_backfill(curves, main_)

    # ---- 按自然年与分段贡献
    res['byYear'] = by_year(curves)
    res['segmentContribution'] = segment_contrib(curves)
    res['otherDrawdowns'] = {f'{a}..{b}': {c: interval(curves[c], a, b) for c in TARGETS} for a, b in OTHER_DD}

    # ---- 分组
    res['groups'] = groups(main_)

    # ---- 四次大跌 p_C 并列
    res['fourCrashes'] = four_crashes(main_)

    # ---- 近似并列
    res['nearTies'] = near_ties(ratio_ties, bull, curves)

    # ---- 与 count-results.json 核对
    res['countResultsCheck'] = count_check(curves, main_)

    res['headline'] = headline(res)
    with open(os.path.join(HERE, 'results.json'), 'w') as f:
        json.dump(res, f, ensure_ascii=False, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))
    print(json.dumps(res['headline'], ensure_ascii=False, indent=1))


def attach_csse(ev, series, bull):
    """报告项 6：C′（上证综指高低点）替换 C 后的 D、X_dd、X、p_C 与等级（只报告），挂到 ev['Csse']。"""
    cs = evaluate(series, bull, ev['label'] + '-Csse', c_win=C_SSE)
    ev['Csse'] = {'window': list(C_SSE),
                  'perIndex': {c: {'C': cs['perIndex'][c]['C'], 'D': cs['perIndex'][c]['D'], 'X_dd': cs['perIndex'][c]['X_dd'],
                                   'X': cs['perIndex'][c]['X']} for c in TARGETS},
                  'counts': {k: cs['counts'][k] for k in ('D', 'X', 'X_dd')},
                  'Dbar_rule': cs['placebo']['Dbar_rule'], 'p_C': cs['placebo']['p_C'],
                  'gradeBeforeRule1': cs['grade']['beforeRule1'], 'gradeAfterRule1': cs['grade']['afterRule1']}


def slim(ev):
    return {'counts': ev['counts'], 'grade': ev['grade'], 'placebo': {k: v for k, v in ev['placebo'].items() if k not in ('s0SelfCheck',)},
            'perIndex': {c: {k: ev['perIndex'][c][k] for k in ('k', 'D', 'A', 'P', 'X', 'X_ann', 'X_dd', 'W', 'C', 'Wp', 'tradesW', 'tradesAll')} for c in TARGETS},
            **{k: v for k, v in ev.items() if k not in ('counts', 'grade', 'placebo', 'perIndex', 'label')}}


def interval(cv, a, b):
    out = {}
    for nm, arr in (('rule', cv['eq']), ('hold', cv['closes']), ('M', cv['m'])):
        s = window_stats(cv['dates'], arr, a, b)
        out[nm] = s
    return out


def windowed_metrics(cv, frm, to):
    dates, closes, pos, eq = cv['dates'], cv['closes'], cv['pos'], cv['eq']
    j0, j1 = win_idx(dates, frm, to)
    k = float(np.mean([pos[t - 1] for t in range(j0 + 1, j1 + 1)]))
    m = static_curve(len(closes), j0, j1, k, closes)
    sr, sh, sm = window_stats(dates, eq, frm, to), window_stats(dates, closes, frm, to), window_stats(dates, m, frm, to)
    out = {'window': [frm, to], 'k': k, 'rule': sr, 'hold': sh, 'M': sm,
           'X_ann': sr['annual'] >= sm['annual'], 'X_dd_window': sr['dd'] >= sm['dd']}
    out['X'] = out['X_ann'] and out['X_dd_window']
    if frm <= C[0] and to >= C[1]:  # C 段完整在窗口内时，另给主口径定义的 X（C 段回撤）
        rc, mc = window_stats(dates, eq, *C), window_stats(dates, m, *C)
        out['C_rule_dd'], out['C_M_dd'] = rc['dd'], mc['dd']
        out['X_dd_C'] = rc['dd'] >= mc['dd']
        out['X_mainDef'] = out['X_ann'] and out['X_dd_C']
    return out


def published_backfill(curves, main_):
    out = {'Wp': {c: {'k': main_['perIndex'][c]['Wp']['k'], 'X': main_['perIndex'][c]['Wp']['X'],
                      'X_ann': main_['perIndex'][c]['Wp']['X_ann'], 'X_dd': main_['perIndex'][c]['Wp']['X_dd']} for c in TARGETS}}
    out['publishedSubset_n4'] = {c: windowed_metrics(curves[c], *w) for c, w in PUBLISHED.items()}
    bf = {c: windowed_metrics(curves[c], *BACKFILL_SEG) for c in TARGETS}
    out['backfillSegment'] = {'window': BACKFILL_SEG, 'perIndex': bf,
                              'counts': {k: sum(1 for c in TARGETS if bf[c][k]) for k in ('X', 'X_ann', 'X_dd_window')}}
    out['C_split'] = {f'{a}..{b}': {c: interval(curves[c], a, b) for c in TARGETS} for a, b in C_SPLIT}
    return out


def by_year(curves):
    out = {}
    for c in TARGETS:
        cv = curves[c]
        dates, eq, cl, m, pos = cv['dates'], cv['eq'], cv['closes'], cv['m'], cv['pos']
        i0, i1 = cv['i0'], cv['i1']
        yrs = {}
        for y in range(2005, 2011):
            idx = [i for i in range(i0, i1 + 1) if dates[i][:4] == str(y)]
            last = idx[-1]
            base = i0 if y == 2005 else max(i for i in range(i0, i1 + 1) if dates[i][:4] == str(y - 1))
            b, s = trades_of(pos, dates, idx[0], last)
            yrs[str(y)] = {'base': dates[base], 'end': dates[last],
                           'rule': (eq[last] / eq[base] - 1) * 100, 'hold': (cl[last] / cl[base] - 1) * 100,
                           'M': (m[last] / m[base] - 1) * 100, 'buys': len(b), 'sells': len(s),
                           'heldShareClose': float(np.mean([pos[i] for i in idx])), 'days': len(idx)}
        out[c] = yrs
    return out


def segment_contrib(curves):
    out = {}
    for c in TARGETS:
        cv = curves[c]
        dates = cv['dates']
        seg = {}
        for name, (a, b) in (('bull_2006-01-04..2007-10-16', BULL_SEG), ('C', C)):
            j0, j1 = win_idx(dates, a, b)
            lr = lambda arr: math.log(arr[j1] / arr[j0])
            seg[name] = {'ruleMinusHoldLog': lr(cv['eq']) - lr(cv['closes']), 'ruleMinusMLog': lr(cv['eq']) - lr(cv['m'])}
        j0, j1 = cv['i0'], cv['i1']
        lr = lambda arr: math.log(arr[j1] / arr[j0])
        seg['W'] = {'ruleMinusHoldLog': lr(cv['eq']) - lr(cv['closes']), 'ruleMinusMLog': lr(cv['eq']) - lr(cv['m'])}
        out[c] = seg
    return out


def groups(main_):
    per = main_['perIndex']
    g = {}
    for name, codes in GROUPS.items():
        g[name] = {'codes': codes, 'n': len(codes), **{k: sum(1 for c in codes if per[c][k]) for k in ('P', 'D', 'A', 'X')}}
    a = g['largeCapDividend']['P'] / 4
    b = g['smallCyclical']['P'] / 5
    tab = {'L004pass_P': sum(per[c]['P'] for c in L004_PASS), 'L004pass_notP': sum(not per[c]['P'] for c in L004_PASS),
           'L004fail_P': sum(per[c]['P'] for c in L004_FAIL), 'L004fail_notP': sum(not per[c]['P'] for c in L004_FAIL)}
    diff = lambda codes: [per[c]['W']['rule']['annual'] - per[c]['W']['M']['annual'] for c in codes]
    mp, mf = float(np.median(diff(L004_PASS))), float(np.median(diff(L004_FAIL)))
    return {'groups': g, 'largeCapP_share': a, 'smallCyclicalP_share': b,
            'L004PatternReproduced': a < b, 'twoByTwo_P': tab,
            'medianRuleMinusM_annual': {'L004pass': mp, 'L004fail': mf, 'passMinusFail': mp - mf}}


def four_crashes(main_):
    p = json.load(open(os.path.join(STUDY, 'power-results.json')))['H1']['byEpisode']
    rows = {'2008（C 段）': {'p_C': main_['placebo']['p_C'], 'X': main_['counts']['X'], 'X_dd': main_['counts']['X_dd'],
                            'X_ann': main_['counts']['X_ann'],
                            'pCle010': main_['placebo']['p_C'] <= 0.10}}
    for k, v in p.items():
        rows[k] = {'windows': v['windows'], 'p_C_median': v['pC']['median'], 'X_median': v['nX']['median'],
                   'X_dd_median': v['nXdd']['median'], 'X_ann_median': v['nXann']['median'],
                   'pCle010_windows': v['pCle010'], 'betterThanRandom': v['pC']['median'] <= 0.10}
    better = int(main_['placebo']['p_C'] <= 0.10) + sum(1 for v in p.values() if v['pC']['median'] <= 0.10)
    return {'rows': rows, 'crashesBetterThanRandom_of4': better,
            'note': '2015/2018/2021–24 取 power-results.json H1.byEpisode 的中位数；「优于随机」= p_C(中位) ≤ 0.10'}


def cash_interest(data, bull, rates, dates, main_):
    def rate_on(d):
        r = None
        for eff, v in rates:
            if eff <= d:
                r = v
        return r

    def factors(variant):
        f = [1.0] * len(dates)
        cr = [0.0] * len(dates)
        for i in range(1, len(dates)):
            a, b = date.fromisoformat(dates[i - 1]), date.fromisoformat(dates[i])
            days = (b - a).days
            if variant == 'rateOnDay_t':
                acc = days * rate_on(dates[i]) / 100 / 365
            elif variant == 'rateOnDay_t-1':
                acc = days * rate_on(dates[i - 1]) / 100 / 365
            else:  # perCalendarDay
                acc = 0.0
                for k in range(1, days + 1):
                    dd = date.fromordinal(a.toordinal() + k).isoformat()
                    acc += rate_on(dd) / 100 / 365
            f[i] = 1 + acc
            cr[i] = acc
        return f, cr

    out = {}
    for variant in ('rateOnDay_t', 'perCalendarDay', 'rateOnDay_t-1'):
        f, cr = factors(variant)
        ev = evaluate(data, bull, 'cash-' + variant, cashf=f, do_placebo=False)
        evm = evaluate(data, bull, 'cash-M-' + variant, cashf=f, cash_r=cr, m_cash=True, do_placebo=False)
        per = {}
        nA = nP = 0
        for c in TARGETS:
            A = ev['perIndex'][c]['W']['rule']['annual'] >= main_['perIndex'][c]['W']['hold']['annual'] - 1
            P = A and main_['perIndex'][c]['D']
            nA += A
            nP += P
            per[c] = {'W_rule_annual_cash': ev['perIndex'][c]['W']['rule']['annual'], 'A_cash': A, 'P_cash': P,
                      'D_cashRule': ev['perIndex'][c]['D'],
                      'X_cashRule_vs_M0': ev['perIndex'][c]['X'], 'X_cashRule_vs_Mcash': evm['perIndex'][c]['X'],
                      'M_cash_annual': evm['perIndex'][c]['W']['M']['annual'],
                      'W_rule': ev['perIndex'][c]['W']['rule'], 'C_rule': ev['perIndex'][c]['C']['rule'],
                      'W_Mcash': evm['perIndex'][c]['W']['M'], 'C_Mcash': evm['perIndex'][c]['C']['M']}
        out[variant] = {'A': nA, 'P': nP, 'D_cashRule': ev['counts']['D'], 'mainA': main_['counts']['A'], 'mainP': main_['counts']['P'],
                        'crossesPge9Boundary': (nP >= 9) != (main_['counts']['P'] >= 9),
                        'X_cashRule_vs_M0': ev['counts']['X'], 'X_cashRule_vs_Mcash': evm['counts']['X'],
                        'perIndex': per}
    out['primaryVariant'] = 'perCalendarDay'  # CLARIFY-1 第 2 条
    return out


def timing_filter_placebo(data, bull, bull_dates, curves, main_):
    Nd = len(bull_dates)
    vals = [bull[d] for d in bull_dates]
    hold_c = {c: main_['perIndex'][c]['C']['hold']['dd'] for c in TARGETS}
    m_ann = {c: main_['perIndex'][c]['W']['M']['annual'] for c in TARGETS}
    m_ddc = {c: main_['perIndex'][c]['C']['M']['dd'] for c in TARGETS}
    nD, nX, nXr, Db, Ab = [], [], [], [], []
    for s in SHIFTS:
        bs = {bull_dates[k]: vals[(k + s) % Nd] for k in range(Nd)}
        d_cnt = x_cnt = xr_cnt = 0
        dd_l, an_l = [], []
        for c in TARGETS:
            cv = curves[c]
            eq, pos, _ = timing_gold(cv['dates'], cv['closes'], cv['gold'], cv['dead'], bs)
            i0, i1 = cv['i0'], cv['i1']
            w = window_stats(cv['dates'], eq, *W)
            cc = window_stats(cv['dates'], eq, *C)
            k = float(np.mean(pos[i0:i1]))
            m = static_curve(len(eq), i0, i1, k, cv['closes'])
            mw, mc = window_stats(cv['dates'], m, *W), window_stats(cv['dates'], m, *C)
            d_cnt += cc['dd'] >= 0.7 * hold_c[c]
            x_cnt += (w['annual'] >= mw['annual']) and (cc['dd'] >= mc['dd'])
            xr_cnt += (w['annual'] >= m_ann[c]) and (cc['dd'] >= m_ddc[c])
            dd_l.append(cc['dd'])
            an_l.append(w['annual'])
        nD.append(d_cnt)
        nX.append(x_cnt)
        nXr.append(xr_cnt)
        Db.append(float(np.mean(dd_l)))
        Ab.append(float(np.mean(an_l)))
    pl = main_['placebo']
    return {'definedDays': Nd, 'firstDefined': bull_dates[0], 'nShifts': int(len(SHIFTS)),
            'D': quantile_info(nD, main_['counts']['D']), 'X_ownK': quantile_info(nX, main_['counts']['X']),
            'X_ruleM': quantile_info(nXr, main_['counts']['X']),
            'Dbar': quantile_info(Db, pl['Dbar_rule']), 'Abar': quantile_info(Ab, pl['Abar_rule']),
            'primaryX': 'X_ownK（CLARIFY-1 第 3 条）',
            'dist_mainConvention': {'Dbar': dist_main(Db), 'Abar': dist_main(Ab), 'D': dist_main(nD), 'X': dist_main(nX)}}


def near_ties(ratio_ties, bull, curves):
    out = {'ratio': [], 'macd': {}}
    for t in ratio_ties:
        flip = dict(bull)
        flip[t['date']] = not flip[t['date']]
        changed = [c for c in TARGETS if timing_gold(curves[c]['dates'], curves[c]['closes'], curves[c]['gold'], curves[c]['dead'], flip)[1] != curves[c]['pos']]
        out['ratio'].append({**t, 'decisiveFor': changed})
    for c in TARGETS:
        cv = curves[c]
        lst = []
        for i, (a, b) in enumerate(zip(cv['dif'], cv['dea'])):
            if abs(a - b) < 1e-12:
                # 第 i 根的并列只影响第 i 根与第 i+1 根的金叉 / 死叉；两根都在预热期（< 120）内则不可能决定成交
                lst.append({'date': cv['dates'][i], 'index': i, 'dif': a, 'dea': b,
                            'canDecideTrade': i + 1 >= WARMUP})
        if lst:
            out['macd'][c] = lst
    out['summary'] = {'ratioTies': len(out['ratio']), 'macdTies': sum(len(v) for v in out['macd'].values()),
                      'decisiveRatioTies': sum(1 for t in out['ratio'] if t['decisiveFor']),
                      'macdTiesThatCanDecideTrade': sum(1 for v in out['macd'].values() for t in v if t['canDecideTrade'])}
    return out


def count_check(curves, main_):
    p = os.path.join(STUDY, 'count-results.json')
    cr = json.load(open(p))['events']
    out = {}
    for c in TARGETS:
        cv = curves[c]
        mism = {}
        for y in range(2005, 2011):
            idx = [i for i, d in enumerate(cv['dates']) if d[:4] == str(y)]
            b, s = trades_of(cv['pos'], cv['dates'], idx[0], idx[-1])
            ref = cr[c]['perYear'][str(y)]
            if (len(b), len(s)) != (ref['buys'], ref['sells']):
                mism[str(y)] = {'mine': [len(b), len(s)], 'countResults': [ref['buys'], ref['sells']]}
        out[c] = {'yearMismatches': mism, 'k_mine': main_['perIndex'][c]['k'], 'k_countResults': cr[c]['k'],
                  'kDiff': main_['perIndex'][c]['k'] - cr[c]['k']}
    return {'perIndex': out, 'allBuySellMatch': all(not v['yearMismatches'] for v in out.values()),
            'maxAbsKDiff': max(abs(v['kDiff']) for v in out.values())}


def headline(res):
    m = res['main']
    return {'final_grade': res['final']['grade'], 'main_grade': res['final']['mainGrade'], 'l004_grade': res['final']['l004Grade'],
            'subtag': res['final']['subtag'],
            'main': {**m['counts'], 'p_C': m['placebo']['p_C'], 'p_A': m['placebo']['p_A'], 'p_X': m['placebo']['p_X'],
                     'Dbar_rule': m['placebo']['Dbar_rule'], 'Abar_rule': m['placebo']['Abar_rule']},
            'l004': {**res['l004Layout']['counts'], 'p_C': res['l004Layout']['placebo']['p_C']},
            'E1': {**res['E1']['counts'], 'p_C': res['E1']['placebo']['p_C'], 'grade': res['E1']['grade']['afterRule1']},
            'C_SSE': {**res['C_SSE']['counts'], 'p_C': res['C_SSE']['p_C']},
            'cash_perCalendarDay': {k: res['cashInterest']['perCalendarDay'][k] for k in ('A', 'P', 'crossesPge9Boundary', 'X_cashRule_vs_Mcash')},
            'sellNextDay': res['sellNextDay']['counts'],
            'fourCrashesBetterThanRandom': res['fourCrashes']['crashesBetterThanRandom_of4'],
            'likelihoodRatio': res['final']['likelihoodRatio']}


if __name__ == '__main__':
    main()
