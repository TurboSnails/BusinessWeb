"""独立复算（manager 自写，不依赖网站引擎）：抽查 results.json 里的组合，期末倍数应四位小数一致。
用法：python3 -I data-raw/masters-rebalance/verify.py
"""
import json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
DATA = os.path.join(ROOT, 'public', 'data', 'portfolio-prices')
RES = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results.json')))
_cache = {}
def px(sym):
    if sym not in _cache:
        d = json.load(open(os.path.join(DATA, f'{sym}.json')))
        _cache[sym] = dict(zip(d['dates'], d['adjClose']))
    return _cache[sym]

def run(stocks, tw, rule, start, stable=None, cost=0.001):
    syms = stocks + ['QQQ']
    dates = sorted(d for d in set.intersection(*[set(px(s)) for s in syms]) if d >= start)
    P = {s: px(s) for s in syms}
    k = len(stocks); w = list(tw); eq = 1.0; eqs = [1.0]; trades = 0
    band = [(t * 0.6, t * 1.4) for t in tw]
    peak = P['QQQ'][dates[0]]; stress = False; levels = set(); base = 0; sold = 0; pend = None
    for i in range(1, len(dates)):
        d, p = dates[i], dates[i - 1]
        r = [P[s][d] / P[s][p] - 1 for s in stocks]
        eq *= 1 + sum(w[j] * r[j] for j in range(k))
        v = [w[j] * (1 + r[j]) for j in range(k)]; sv = sum(v); w = [x / sv for x in v]
        if pend:
            old = w[:]
            if pend[0] in ('reb', 'rec'):
                w = list(tw)
            else:
                si = stocks.index(stable)
                amt = min(pend[1] / eq, w[si], max(0.0, (0.5 * base - sold) / eq))
                sold += amt * eq
                j = min((j for j in range(k) if j != si), key=lambda j: w[j] / tw[j])
                w[si] -= amt; w[j] += amt
            t = 0.5 * sum(abs(w[j] - old[j]) for j in range(k)); eq *= 1 - t * cost; trades += t > 1e-12
            if pend[0] == 'rec': peak = P['QQQ'][d]
            pend = None
        q = P['QQQ'][d]; peak = max(peak, q); dd = q / peak - 1
        if i + 1 < len(dates):
            if stable and not stress and dd <= -0.2:
                si = stocks.index(stable); stress = True; levels = {0.2}; base = w[si] * eq; sold = 0.0; pend = ('step', 0.25 * base)
            elif stress:
                if dd >= -0.05: stress = False; pend = ('rec',)
                else:
                    lv = 0.2
                    while dd <= -(lv + 0.05) + 1e-12: lv += 0.05
                    lv = round(lv, 10)
                    if lv not in levels: levels.add(lv); pend = ('step', 0.25 * base)
            elif rule == 'rel40' and any(not (band[j][0] < w[j] < band[j][1]) for j in range(k)):
                pend = ('reb',)
            elif rule == 'year' and dates[i + 1][:4] != d[:4]:
                pend = ('reb',)
        eqs.append(eq)
    pk, mdd = 1, 0
    for e in eqs: pk = max(pk, e); mdd = min(mdd, e / pk - 1)
    return round(eqs[-1], 4), trades, round(mdd, 4)

checks = []
def add(label, syms, w, rule, start, ref, stable=None):
    if ref is None: return
    mine = run(syms, w, rule, start, stable)
    checks.append((label, mine[0], ref['final'], mine[1], ref['trades'], abs(mine[0] - ref['final']) < 5e-5 and mine[1] == ref['trades']))
SA, SC = '2021-08-25', '2018-07-26'
A = RES['A']
for row in [A['base']] + A['stableSwap'] + A['growthSwap']:
    st = [s for s in row['symbols'] if s in ('CB', 'BRK-B', 'QSR', 'CVX', 'KO', 'AXP')][0]
    tag = '+'.join(row['symbols'])
    add('A hold ' + tag, row['symbols'], row['weights'], 'hold', SA, row['hold'])
    add('A reb ' + tag, row['symbols'], row['weights'], 'rel40', SA, row['rebalance'])
    add('A sw ' + tag, row['symbols'], row['weights'], 'rel40', SA, row['switch'], st)
for row in RES['B']['sample']:
    w = RES['B']['weights']; tag = '+'.join(row['syms'])
    add('B hold ' + tag, row['syms'], w, 'hold', SA, row['h']); add('B reb ' + tag, row['syms'], w, 'rel40', SA, row['r']); add('B sw ' + tag, row['syms'], w, 'rel40', SA, row['s'], row['syms'][4])
for row in RES['C1']['sample']:
    w = [0.2] * 5; tag = '+'.join(row['syms'])
    add('C1 hold ' + tag, row['syms'], w, 'hold', SC, row['h']); add('C1 reb ' + tag, row['syms'], w, 'rel40', SC, row['r']); add('C1 year ' + tag, row['syms'], w, 'year', SC, row['y'])
C2 = RES['C2']; w6 = C2['weights']
add('C2 hold', C2['symbols'], w6, 'hold', SC, C2['hold']); add('C2 reb', C2['symbols'], w6, 'rel40', SC, C2['rebalance'])
add('C2 sw', C2['symbols'], w6, 'rel40', SC, C2['switch'], 'BRK-B'); add('C2 year', C2['symbols'], w6, 'year', SC, C2['yearly'])
bad = [c for c in checks if not c[5]]
for c in bad: print('MISMATCH', c)
print(f'{len(checks) - len(bad)}/{len(checks)} 一致')
