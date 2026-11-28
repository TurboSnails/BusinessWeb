"""L-047 A 股流动性踩踏防守，主实现（PREREG.md）。
    cd research-py && uv run python ../docs/research/liquidity-defense-2026-11-28/run.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
SRC = HERE.parents[2] / "research-py/factor-data/cn/prices.parquet"
CUT = pd.Timestamp("2023-10-31")
MAIN = ("2006-01-04", "2023-10-31")
HALVES = (("2006-01-04", "2014-12-31"), ("2015-01-01", "2023-10-31"))
CASH = 0.015 / 252
COST = 0.001
LD_TH, R_TH, HOLD, CUT_TO = 0.05, 2.0, 20, 0.5
AGE_MIN = 60


def load():
    cols = ["date", "code", "close_adj", "amount", "mcap_float", "limit_down", "is_st", "is_suspended"]
    d = pd.read_parquet(SRC, columns=cols, filters=[("date", "<=", CUT)])
    assert d.date.max() <= CUT
    w = {c: d.pivot(index="date", columns="code", values=c) for c in cols[2:]}
    return w


def market_series(w):
    px = w["close_adj"].astype(float)
    amt = w["amount"].astype(float)
    cap = w["mcap_float"].astype(float)
    age = px.notna().cumsum()                                    # 截至当日（含）有价格的交易日数
    elig = (w["is_st"].fillna(False).astype(bool) == False) & (w["is_suspended"].fillna(False).astype(bool) == False) \
        & (amt > 0) & (age > AGE_MIN)
    r = px / px.shift(1) - 1
    wprev = cap.shift(1).where(elig & r.notna() & (cap.shift(1) > 0))
    M = (r * wprev).sum(1) / wprev.sum(1)
    ld = (w["limit_down"].fillna(False).astype(bool) & elig).sum(1) / elig.sum(1)
    illiq_d = (r.abs() / amt).where(elig & r.notna())
    illiq5 = illiq_d.rolling(5, min_periods=3).mean()
    wc = cap.where(elig & illiq5.notna() & (cap > 0))
    ILLIQ = (illiq5 * wc).sum(1) / wc.sum(1)
    med = ILLIQ.shift(1).rolling(250, min_periods=200).median()
    R = ILLIQ / med
    nav = (1 + M.fillna(0)).cumprod()
    below = nav < nav.rolling(20, min_periods=20).mean()
    return pd.DataFrame({"M": M, "LD": ld, "ILLIQ": ILLIQ, "R": R, "below20": below, "nav": nav})


def exposure_from(trig: pd.Series, hold=HOLD, cut=CUT_TO):
    """t 日触发 → s = t+2 … t+hold+1 的仓位为 cut。"""
    t = trig.fillna(False).astype(bool).to_numpy()
    n = len(t)
    e = np.ones(n)
    for i in np.flatnonzero(t):
        e[i + 2:min(n, i + hold + 2)] = cut
    return pd.Series(e, index=trig.index)


def port(M, e, cost=COST):
    chg = e.diff().abs().fillna(0.0)
    return e * M + (1 - e) * CASH - cost * chg


def sharpe(x):
    ex = x - CASH
    return float(ex.mean() / ex.std(ddof=1) * np.sqrt(252))


def maxdd(x):
    nav = (1 + x).cumprod()
    return float((nav / nav.cummax() - 1).min())


def episodes(M):
    nav = (1 + M).cumprod()
    out, peak_i, in_ep, trough_i = [], 0, False, 0
    vals, idx = nav.to_numpy(), nav.index
    for i in range(len(vals)):
        if vals[i] >= vals[peak_i]:
            if in_ep:
                out.append((idx[peak_i], idx[trough_i]))
                in_ep = False
            peak_i = i
            continue
        dd = vals[i] / vals[peak_i] - 1
        if not in_ep and dd <= -0.20:
            in_ep, trough_i = True, i
        if in_ep and vals[i] < vals[trough_i]:
            trough_i = i
    if in_ep:
        out.append((idx[peak_i], idx[trough_i]))
    return out


def ep_loss(x, eps):
    nav = (1 + x).cumprod()
    return [float(nav.loc[b] / nav.loc[a] - 1) for a, b in eps]


def evaluate(name, trig, s, cost=COST, hold=HOLD):
    win = s.loc[MAIN[0]:MAIN[1]]
    e_all = exposure_from(trig, hold)
    e = e_all.loc[win.index]
    M = win["M"].fillna(0.0)
    c = port(M, e, cost)
    b0 = port(M, pd.Series(1.0, index=M.index), cost)
    ebar = float(e.mean())
    bc = port(M, pd.Series(ebar, index=M.index), cost)
    eps = episodes(M)
    lc, lb = ep_loss(c, eps), ep_loss(bc, eps)
    L = sum(lc) / sum(lb)
    halves = [sharpe(c.loc[a:b]) - sharpe(b0.loc[a:b]) for a, b in HALVES]
    out = {"sharpe": sharpe(c), "sharpe_B0": sharpe(b0), "sharpe_Bc": sharpe(bc), "dS": sharpe(c) - sharpe(b0),
           "maxdd": maxdd(c), "maxdd_B0": maxdd(b0), "maxdd_Bc": maxdd(bc), "avg_exposure": ebar,
           "L_vs_Bc": L, "halves_dS": halves, "episodes": [[str(a.date()), str(b.date())] for a, b in eps],
           "ep_loss_cand": lc, "ep_loss_Bc": lb, "trigger_days": int(trig.loc[win.index].fillna(False).sum()),
           "days_reduced": int((e < 1).sum())}
    return out, e, M, b0


def placebo(e, M, b0, obs):
    n = len(e)
    s0 = sharpe(b0)
    vals = []
    for k in range(250, n - 250 + 1, 21):
        es = pd.Series(np.roll(e.to_numpy(), k), index=e.index)
        vals.append(sharpe(port(M, es)) - s0)
    return (sum(v >= obs for v in vals) + 1) / (len(vals) + 1), len(vals)


def main():
    w = load()
    s = market_series(w)
    trig = {"C1": s["LD"] >= LD_TH, "C2": (s["R"] >= R_TH) & s["below20"]}
    res, ps = {}, {}
    for k, t in trig.items():
        r, e, M, b0 = evaluate(k, t, s)
        ps[k], r["placebo_K"] = placebo(e, M, b0, r["dS"])
        r["p"] = ps[k]
        res[k] = r
    order = sorted(ps, key=ps.get)
    run, holm = 0.0, {}
    for i, k in enumerate(order):
        run = max(run, min(1.0, (len(order) - i) * ps[k]))
        holm[k] = run
    for k, r in res.items():
        g = {"G1": r["dS"] >= 0.05, "G2": r["sharpe"] >= r["sharpe_Bc"] and (r["maxdd"] - r["maxdd_Bc"]) >= 0.03,
             "G3": r["L_vs_Bc"] <= 0.90, "G4": all(h > 0 for h in r["halves_dS"]), "G5": holm[k] <= 0.10}
        if all(g.values()):
            v = "通过"
        elif g["G1"] and g["G2"] and g["G4"]:
            v = "部分成立"
        elif r["dS"] > 0:
            v = "不稳定"
        else:
            v = "不通过"
        r.update({"pHolm": holm[k], "gates": g, "verdict": v})
    # 报告项
    rep = {}
    M = s["M"].fillna(0.0)
    for k, t in trig.items():
        tt = t.loc[MAIN[0]:MAIN[1]].fillna(False)
        firsts, last = [], None
        for d in tt.index[tt.to_numpy()]:
            if last is None or (s.index.get_loc(d) - s.index.get_loc(last)) > 60:
                firsts.append(d)
            last = d
        fw = {}
        for h in (5, 20, 60):
            vals = []
            for d in firsts:
                i = s.index.get_loc(d)
                seg = M.iloc[i + 2:i + 2 + h]
                vals.append(float((1 + seg).prod() - 1))
            fw[h] = {"mean": float(np.mean(vals)) if vals else None, "neg_share": float(np.mean([v < 0 for v in vals])) if vals else None}
        rep[k] = {"first_triggers": [str(d.date()) for d in firsts], "forward": fw,
                  "cost0.3_dS": evaluate(k, t, s, cost=0.003)[0]["dS"],
                  "hold10_dS": evaluate(k, t, s, hold=10)[0]["dS"], "hold40_dS": evaluate(k, t, s, hold=40)[0]["dS"]}
    out = {"candidates": res, "report": rep}
    (HERE / "results.json").write_text(json.dumps(out, indent=2, ensure_ascii=False, default=float) + "\n")
    for k, r in res.items():
        print(k, r["verdict"], {g: bool(x) for g, x in r["gates"].items()},
              f"S {r['sharpe']:.3f} B0 {r['sharpe_B0']:.3f} Bc {r['sharpe_Bc']:.3f} dS {r['dS']:+.3f} | DD {r['maxdd']:.3f} B0 {r['maxdd_B0']:.3f} Bc {r['maxdd_Bc']:.3f} | L {r['L_vs_Bc']:.3f} | halves {[round(h,3) for h in r['halves_dS']]} | p {r['p']:.3f} holm {r['pHolm']:.3f} | avgE {r['avg_exposure']:.3f} trig {r['trigger_days']}")
    print(json.dumps(rep, ensure_ascii=False, indent=1, default=float)[:2500])


if __name__ == "__main__":
    main()
