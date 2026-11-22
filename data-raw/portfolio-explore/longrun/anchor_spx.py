# manager 独立实现：标普 500 信号的大跌切换复现锚点（只读）
# 在仓库根目录运行：python3 data-raw/portfolio-explore/longrun/anchor_spx.py
# 依赖本机数据：longrun/49_Industry_Portfolios_Daily.csv、longrun/NASDAQ100.json、longrun/GSPC.json（来源见 ../SOURCES.md）
import json, datetime

D = 'data-raw/portfolio-explore'
COST = 0.001


def load_french():
    lines = open(f'{D}/longrun/49_Industry_Portfolios_Daily.csv', encoding='latin-1').read().splitlines()
    out = {}
    for sec, kw in [('VW', 'Average Value Weighted Returns -- Daily'), ('EW', 'Average Equal Weighted Returns -- Daily')]:
        i = next(k for k, l in enumerate(lines) if kw in l)
        hdr = [h.strip() for h in lines[i + 1].split(',')]
        j = i + 2
        while j < len(lines) and lines[j].strip() and lines[j].strip()[0].isdigit():
            p = [x.strip() for x in lines[j].split(',')]
            ds = f'{p[0][:4]}-{p[0][4:6]}-{p[0][6:]}'
            for h, v in zip(hdr[1:], p[1:]):
                x = float(v)
                out.setdefault(f'{h}_{sec}', {})[ds] = None if x <= -99 else x / 100
            j += 1
    return out


def sim(dates, rets, sig, tw, stable, mode, cfg=None):
    """rets[i] 为各资产在 dates[i] 的日收益，sig[i] 为信号指数收盘。
    mode：bh / reb（相对偏离 40%）/ sw（reb 加大跌切换）。
    cfg：entry、gap、step、rec 为正小数；cap 为进入日稳定仓市值的倍数上限，None 表示不限。"""
    k = len(tw)
    w = list(tw)
    eq = 1.0
    eqs = [1.0]
    trades = 0
    pend = None
    stress = False
    peak = sig[0]
    levels = set()
    base = 0.0
    sold = 0.0
    entries = []
    lo = [t * 0.6 for t in tw]
    hi = [t * 1.4 for t in tw]
    n = len(dates)
    for i in range(1, n):
        r = rets[i]
        g = sum(w[j] * r[j] for j in range(k))
        eq *= 1 + g
        w = [w[j] * (1 + r[j]) / (1 + g) for j in range(k)]
        if pend:
            old = w[:]
            if pend[0] in ('reb', 'rec'):
                w = list(tw)
            else:
                amt = min(pend[1] / eq, w[stable])
                j = min((q for q in range(k) if q != stable), key=lambda q: w[q] / tw[q])
                w[stable] -= amt
                w[j] += amt
                sold += amt * eq
            eq *= 1 - 0.5 * sum(abs(w[j] - old[j]) for j in range(k)) * COST
            trades += 1
            if pend[0] == 'rec':
                peak = sig[i]
            pend = None
        eqs.append(eq)
        q = sig[i]
        peak = max(peak, q)
        dd = q / peak - 1
        if i + 1 < n:
            if mode == 'sw' and not stress and dd <= -cfg['entry'] + 1e-12:
                stress = True
                levels = {round(cfg['entry'], 4)}
                base = w[stable] * eq
                sold = 0.0
                entries.append(dates[i])
                allowed = base * (cfg['cap'] if cfg.get('cap') else 99)
                pend = ('step', min(cfg['step'] * base, allowed))
            elif mode == 'sw' and stress:
                if dd >= -cfg['rec']:
                    stress = False
                    pend = ('rec',)
                else:
                    lv = cfg['entry']
                    while dd <= -(lv + cfg['gap']) + 1e-12:
                        lv += cfg['gap']
                    lv = round(lv, 4)
                    allowed = base * (cfg['cap'] if cfg.get('cap') else 99)
                    if lv not in levels and sold < allowed - 1e-12:
                        levels.add(lv)
                        pend = ('step', min(cfg['step'] * base, allowed - sold))
            elif mode in ('reb', 'sw') and not stress and any(not (lo[j] < w[j] < hi[j]) for j in range(k)):
                pend = ('reb',)
    pk = 1.0
    mdd = 0.0
    for e in eqs:
        pk = max(pk, e)
        mdd = min(mdd, e / pk - 1)
    yrs = (datetime.date.fromisoformat(dates[-1]) - datetime.date.fromisoformat(dates[0])).days / 365.25
    return dict(final=round(eqs[-1], 4), trades=trades, cagr=round(eqs[-1] ** (1 / yrs) - 1, 4), mdd=round(mdd, 4), entries=entries)


if __name__ == '__main__':
    R = load_french()
    NDX = dict(json.load(open(f'{D}/longrun/NASDAQ100.json'))['history'])
    SPX = dict(json.load(open(f'{D}/longrun/GSPC.json'))['history'])
    A = ['Softw_VW', 'Chips_VW', 'Softw_EW', 'Chips_EW', 'Insur_VW']
    TW = [.25, .25, .125, .125, .25]
    dates = sorted(d for d in NDX if '1986-01-02' <= d <= '2026-09-30' and d in SPX and all(R[a].get(d) is not None for a in A))
    rets = [[R[a][d] for a in A] for d in dates]
    spx = [SPX[d] for d in dates]
    ndx = [NDX[d] for d in dates]

    def cfg(entry, cap=None):
        return dict(entry=entry, gap=.05, step=.25, rec=.05, cap=cap)

    print('长期交易日', len(dates), dates[0], dates[-1])
    print('L1 买入持有', sim(dates, rets, ndx, TW, 4, 'bh'))
    print('L2 相对偏离 40%', sim(dates, rets, ndx, TW, 4, 'reb'))
    print('L3 纳指 -20% 无上限', sim(dates, rets, ndx, TW, 4, 'sw', cfg(.20)))
    print('S1 标普 -20% 无上限', sim(dates, rets, spx, TW, 4, 'sw', cfg(.20)))
    print('S2 标普 -20% 上限 50%', sim(dates, rets, spx, TW, 4, 'sw', cfg(.20, .5)))
    print('S3 标普 -10% 无上限', sim(dates, rets, spx, TW, 4, 'sw', cfg(.10)))
    print('S4 标普 -15% 上限 50%', sim(dates, rets, spx, TW, 4, 'sw', cfg(.15, .5)))

    P = json.load(open(f'{D}/prices-adjusted.json'))['series']

    def short(stocks, start, end='2026-11-20'):
        ds = sorted(set.intersection(*[set(P[s]['dates']) for s in stocks + ['QQQ']]))
        ds = [d for d in ds if start <= d <= end and d in SPX]
        px = {s: dict(zip(P[s]['dates'], P[s]['close'])) for s in stocks}
        rr = [[0.0] * len(stocks)] + [[px[s][ds[i]] / px[s][ds[i - 1]] - 1 for s in stocks] for i in range(1, len(ds))]
        return ds, rr, [SPX[d] for d in ds]

    ds, rr, sg = short(['AVGO', 'META', 'SOFI', 'RKLB', 'CB'], '2021-08-25')
    print('S5 用户组合 2021-08-25 起 标普 -15% 无上限', sim(ds, rr, sg, TW, 4, 'sw', cfg(.15)))
    ds, rr, sg = short(['AVGO', 'META', 'TSLA', 'NVDA', 'CB'], '2016-01-04')
    print('S6 AVGO/META/TSLA/NVDA/CB 2016-01-04 起 标普 -20% 无上限', sim(ds, rr, sg, TW, 4, 'sw', cfg(.20)))
