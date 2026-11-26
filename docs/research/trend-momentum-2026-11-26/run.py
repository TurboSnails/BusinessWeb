"""L-036 多资产「趋势 + 动量」轮动：按 PREREG.md 计算 T1（趋势 + 动量）、T2（只看趋势）。

用法：cd research-py && uv run python ../docs/research/trend-momentum-2026-11-26/run.py
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
B2 = REPO / "docs/research/defensive-trend-2026-11-26/inputs/processed"
FF = REPO / "docs/research/trend-1871-2026-11-26/inputs/ff-factors.json"
BOND = REPO / "research-py/data/processed/bond5_daily.csv"
GOLD = REPO / "research-py/data/processed/gold_daily.csv"
COUNTRIES = ["Australia", "Belgium", "Canada", "France", "Germany", "Italy", "Japan",
             "Netherlands", "Norway", "Spain", "Sweden", "Switzerland", "UK"]
RISKY = ["BOND", "EXUS", "GOLD", "US"]  # 字母序，用于并列
COLS = RISKY + ["CASH"]
COST = {"US": 0.0010, "EXUS": 0.0010, "BOND": 0.0005, "GOLD": 0.0015, "CASH": 0.0}
FEE = {"US": 0.0003, "EXUS": 0.0007, "BOND": 0.0015, "GOLD": 0.0040, "CASH": 0.0}
START, END = "1978-01", "2025-12"
HALF2 = "2002-01"
POST = "2010-01"
POST08 = "2008-01"
DEVX = REPO / "docs/research/country-momentum-2026-11-26/inputs/Developed_ex_US_3_Factors.csv"
MIN_SHIFT = 24


def load() -> tuple[pd.DataFrame, dict]:
    sha = {}
    for p in [FF, BOND, GOLD] + [B2 / f"{c}.csv" for c in COUNTRIES]:
        sha[str(p.relative_to(REPO))] = hashlib.sha256(p.read_bytes()).hexdigest()
    ff = json.loads(FF.read_text())
    us = pd.Series({m: (a + b) / 100 for m, a, b in ff["rows"]})
    rf = pd.Series({m: b / 100 for m, a, b in ff["rows"]})
    ex = pd.DataFrame({c: pd.read_csv(B2 / f"{c}.csv", dtype={"month": str}).set_index("month")["equity_usd"] for c in COUNTRIES})
    exus = ex.mean(axis=1, skipna=False)
    b = pd.read_csv(BOND, dtype={"date": str})
    b = b[b["ret"].notna()]
    bond = (1 + b["ret"]).groupby(b["date"].str[:7]).prod() - 1
    g = pd.read_csv(GOLD, dtype={"date": str})
    gm = g.groupby(g["date"].str[:7])["price"].last()
    gold = gm / gm.shift(1) - 1
    r = pd.DataFrame({"US": us, "EXUS": exus, "BOND": bond, "GOLD": gold, "CASH": rf}).sort_index()
    return r.loc["1975-01":END], sha


def signals(r: pd.DataFrame, lookbacks=(3, 6, 12), ma: int = 10) -> tuple[pd.DataFrame, pd.DataFrame]:
    idx = (1 + r[RISKY]).cumprod()  # 总收益指数；起点前缺值的月份为 NaN
    for a in RISKY:  # 第一个有收益的月份之前一个月记为基点 1（例如海外等权 1976-12 = 1）
        first = r[a].first_valid_index()
        pos = r.index.get_loc(first)
        if pos > 0:
            idx.iloc[pos - 1, idx.columns.get_loc(a)] = 1.0
    mom = sum(idx / idx.shift(L) - 1 for L in lookbacks) / len(lookbacks)
    above = idx >= idx.rolling(ma, min_periods=ma).mean()
    above = above.where(idx.rolling(ma, min_periods=ma).mean().notna())
    return mom, above


def weights_t1(mom: pd.DataFrame, above: pd.DataFrame, top: int = 2, trend: bool = True) -> pd.DataFrame:
    w = pd.DataFrame(np.nan, index=mom.index, columns=COLS)
    for m in mom.index:
        row = mom.loc[m]
        if row.isna().any() or (trend and above.loc[m].isna().any()):
            continue
        order = sorted(RISKY, key=lambda a: (-row[a], a))[:top]
        w.loc[m] = 0.0
        for a in order:
            if trend and not bool(above.loc[m, a]):
                w.loc[m, "CASH"] += 1 / top
            else:
                w.loc[m, a] += 1 / top
    return w


def weights_t2(above: pd.DataFrame) -> pd.DataFrame:
    w = pd.DataFrame(np.nan, index=above.index, columns=COLS)
    ok = above.notna().all(axis=1)
    for m in above.index[ok]:
        w.loc[m] = 0.0
        for a in RISKY:
            w.loc[m, a if bool(above.loc[m, a]) else "CASH"] += 0.25
    return w


def evaluate(w: pd.DataFrame, r: pd.DataFrame, cost_mult: float = 1.0) -> dict:
    idx = w.index
    R = r.loc[idx, COLS].to_numpy()
    W = w[COLS].to_numpy()
    c = np.array([COST[k] for k in COLS]) * cost_mult
    f = np.array([FEE[k] for k in COLS])
    gross = (W * R).sum(axis=1)
    tc = np.zeros(len(idx))
    turn = np.zeros(len(idx))
    for t in range(1, len(idx)):
        drift = W[t - 1] * (1 + R[t - 1])
        drift = drift / drift.sum()
        d = np.abs(W[t] - drift)
        tc[t] = (c * d).sum()
        turn[t] = d.sum() / 2
    net = gross - tc - (W * f).sum(axis=1) / 12
    return {"net": pd.Series(net, index=idx), "turn": pd.Series(turn, index=idx), "rf": r.loc[idx, "CASH"], "w": w}


def stats(res: dict, lo=None, hi=None) -> dict:
    net = res["net"].loc[lo:hi]
    ex = net - res["rf"].loc[lo:hi]
    nav = (1 + net).cumprod()
    n = len(net)
    return {"n": n, "sharpe": float(ex.mean() / ex.std(ddof=1) * np.sqrt(12)), "cagr": float(nav.iloc[-1] ** (12 / n) - 1),
            "vol": float(net.std(ddof=1) * np.sqrt(12)),
            "maxDd": float((nav / np.maximum.accumulate(np.maximum(nav, 1.0)) - 1).min()),
            "turnoverPerYear": float(res["turn"].loc[lo:hi].mean() * 12)}


def sharpe(res: dict) -> float:
    ex = res["net"] - res["rf"]
    return float(ex.mean() / ex.std(ddof=1) * np.sqrt(12))


def compare(c: dict, b: dict) -> dict:
    s0 = c["net"].index[0]
    periods = [("full", s0, END), ("post2010", POST, END), ("post2008", POST08, END)]
    if s0 == START:
        periods[1:1] = [("half1", START, "2001-12"), ("half2", HALF2, END)]
    out = {}
    for name, lo, hi in periods:
        x, y = stats(c, lo, hi), stats(b, lo, hi)
        out[name] = {"cand": x, "bench": y, "dS": x["sharpe"] - y["sharpe"], "dCagr": x["cagr"] - y["cagr"], "dDd": x["maxDd"] - y["maxDd"]}
    return out


def placebo(w: pd.DataFrame, r: pd.DataFrame, bench_s: float, dS: float) -> dict:
    n = len(w)
    vals = np.array([sharpe(evaluate(pd.DataFrame(np.roll(w.to_numpy(), k, axis=0), index=w.index, columns=w.columns), r)) - bench_s
                     for k in range(MIN_SHIFT, n - MIN_SHIFT + 1)])
    return {"pUpper": float(((vals >= dS).sum() + 1) / (len(vals) + 1)), "shifts": len(vals),
            "median": float(np.median(vals)), "p95": float(np.quantile(vals, 0.95))}


def holm(ps: dict) -> dict:
    order = sorted(ps, key=ps.get)
    out, run = {}, 0.0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i)))
        out[k] = run
    return out


def static(idx: pd.Index, mix: dict) -> pd.DataFrame:
    return pd.DataFrame({k: float(mix.get(k, 0.0)) for k in COLS}, index=idx)


def bear_segments(nav: pd.Series, depth: float = -0.20) -> list[tuple[str, str]]:
    """月末净值回撤 ≥ 20% 的段：从前高到段内最低点。"""
    peak_val, peak_m = 1.0, None
    segs, in_dd, trough_m, trough_v = [], False, None, None
    prev = None
    for m, v in nav.items():
        if v >= peak_val:
            if in_dd and trough_v / peak_val - 1 <= depth:
                segs.append((peak_m, trough_m))
            peak_val, peak_m, in_dd, trough_v = v, m, False, None
        else:
            in_dd = True
            if trough_v is None or v < trough_v:
                trough_v, trough_m = v, m
        prev = m
    if in_dd and trough_v is not None and trough_v / peak_val - 1 <= depth:
        segs.append((peak_m, trough_m))
    return segs


def main() -> None:
    r, sha = load()
    hold = r.loc[START:END].index
    assert len(hold) == 576
    mom, above = signals(r)
    w1 = weights_t1(mom, above).shift(1).loc[hold]
    w2 = weights_t2(above).shift(1).loc[hold]
    assert not w1.isna().any().any() and not w2.isna().any().any() and not r.loc[hold].isna().any().any()
    bench = static(hold, {a: 0.25 for a in RISKY})
    res = {"T1": evaluate(w1, r), "T2": evaluate(w2, r), "B": evaluate(bench, r)}
    main_res = {k: compare(res[k], res["B"]) for k in ("T1", "T2")}
    bs = sharpe(res["B"])
    pl = {k: placebo(res[k]["w"], r, bs, main_res[k]["full"]["dS"]) for k in ("T1", "T2")}
    adj = holm({k: pl[k]["pUpper"] for k in pl})
    hd = hold[1:]
    delay = {"T1": weights_t1(mom, above).shift(2).loc[hd], "T2": weights_t2(above).shift(2).loc[hd]}
    for k in ("T1", "T2"):
        m = main_res[k]
        m["placebo"] = pl[k] | {"pHolm": adj[k]}
        m["delay"] = compare(evaluate(delay[k], r), res["B"])["full"]  # 基准从主运行截取
        g = {"G1": m["full"]["dS"] > 0 and adj[k] <= 0.05,
             "G2": m["half1"]["dS"] > 0 and m["half2"]["dS"] > 0,
             "G3": m["post2010"]["dS"] > 0,
             "G4": m["full"]["dDd"] >= 0.05 and m["full"]["dCagr"] >= -0.01,
             "G5": m["delay"]["dS"] > 0}
        m["gates"] = g
        if all(g.values()):
            v = "通过"
        elif all(g[x] for x in ("G1", "G2", "G3", "G5")):
            v = "风险调整更好，但收益或回撤不达标"
        elif all(g[x] for x in ("G2", "G3", "G4", "G5")):
            v = "方向一致，统计上不显著"
        elif m["full"]["dS"] > 0:
            v = "不稳定"
        else:
            v = "不通过"
        m["verdict"] = v

    rep: dict = {}
    for top in (1, 3):
        rep[f"T1top{top}"] = compare(evaluate(weights_t1(mom, above, top=top).shift(1).loc[hold], r), res["B"])
    mom12, _ = signals(r, lookbacks=(12,))
    rep["T1mom12"] = compare(evaluate(weights_t1(mom12, above).shift(1).loc[hold], r), res["B"])
    rep["T1noTrend"] = compare(evaluate(weights_t1(mom, above, trend=False).shift(1).loc[hold], r), res["B"])
    # T2′：股票两条腿固定 25%，只对国债、黄金做均线过滤
    w2p = weights_t2(above).shift(1).loc[hold].copy()
    for a in ("US", "EXUS"):
        w2p["CASH"] -= 0.25 - w2p[a]
        w2p[a] = 0.25
    rep["T2prime"] = compare(evaluate(w2p, r), res["B"])
    # 按平均权重固定持有（分开长期偏重与择时）
    rep["fixedAvg"] = {k: compare(evaluate(static(hold, res[k]["w"].mean().to_dict()), r), res["B"])["full"] for k in ("T1", "T2")}
    # B 加现金调到与候选同波动后的最大回撤
    rep["benchVolMatched"] = {}
    for k in ("T1", "T2"):
        sc = stats(res[k])["vol"] / stats(res["B"])["vol"]
        if sc <= 1:
            bm = {a: 0.25 * sc for a in RISKY} | {"CASH": 1 - sc}
            rep["benchVolMatched"][k] = {"scale": sc, **stats(evaluate(static(hold, bm), r))}
        else:
            rep["benchVolMatched"][k] = {"scale": sc, "note": "候选波动高于基准"}
    # EXUS 换成 KF Developed ex US 市值加权（持有月 1991-07 起）
    lines = DEVX.read_text().splitlines()
    i0 = next(k for k, ln in enumerate(lines) if ln.replace(" ", "").startswith(",Mkt-RF"))
    devx = {}
    for ln in lines[i0 + 1:]:
        c = [x.strip() for x in ln.split(",")]
        if not (c[0].isdigit() and len(c[0]) == 6):
            break
        devx[c[0][:4] + "-" + c[0][4:]] = (float(c[1]) + float(c[4])) / 100
    rd = r.copy()
    rd["EXUS"] = pd.Series(devx).reindex(rd.index)
    md, ad = signals(rd)
    hdx = rd.loc["1991-07":END].index
    bdx = evaluate(static(hdx, {a: 0.25 for a in RISKY}), rd)
    rep["devx"] = {"T1": compare(evaluate(weights_t1(md, ad).shift(1).loc[hdx], rd), bdx)["full"],
                   "T2": compare(evaluate(weights_t2(ad).shift(1).loc[hdx], rd), bdx)["full"]}
    for cm in (0.0, 2.0):
        rep[f"cost{cm}"] = {k: compare(evaluate(res[k]["w"], r, cm), evaluate(bench, r, cm))["full"] for k in ("T1", "T2")}
    refs = {"US": {"US": 1.0}, "6040": {"US": 0.6, "BOND": 0.4}, "7030": {"US": 0.7, "CASH": 0.3}, "8020": {"US": 0.8, "CASH": 0.2}}
    ref_res = {k: evaluate(static(hold, v), r) for k, v in refs.items()}
    rep["refs"] = {k: {p: stats(v, lo, hi) for p, lo, hi in (("full", START, END), ("half1", START, "2001-12"), ("half2", HALF2, END), ("post2010", POST, END))}
                   for k, v in {**ref_res, "T1": res["T1"], "T2": res["T2"], "B": res["B"]}.items()}
    us_nav = (1 + ref_res["US"]["net"]).cumprod()
    rep["usBears"] = []
    for a, b in bear_segments(us_nav):
        row = {"from": a, "to": b}
        start = hold[hold.get_loc(a) + 1] if a in hold else hold[0]
        for k, v in {"US": ref_res["US"], "B": res["B"], "T1": res["T1"], "T2": res["T2"], "6040": ref_res["6040"]}.items():
            row[k] = float((1 + v["net"].loc[start:b]).prod() - 1)
        rep["usBears"].append(row)
    rep["avgWeights"] = {k: {c: float(res[k]["w"][c].mean()) for c in COLS} for k in ("T1", "T2")}
    sig_end = {"T1": weights_t1(mom, above).loc[END].to_dict(), "T2": weights_t2(above).loc[END].to_dict(),
               "mom": mom.loc[END].to_dict(), "above": {k: bool(v) for k, v in above.loc[END].items()}}
    rep["current"] = sig_end

    out = {"study": "L-036", "inputSha256": sha, "holdRange": [START, END], "main": main_res, "report": rep,
           "series": {k: [round(x, 10) for x in v["net"].tolist()] for k, v in res.items()}, "months": list(hold)}
    (HERE / "results.json").write_text(json.dumps(out, ensure_ascii=False, indent=2, default=float) + "\n", encoding="utf-8")
    for k in ("T1", "T2"):
        m = main_res[k]
        print(k, m["verdict"], m["gates"], {p: {x: round(m[p][x], 4) for x in ("dS", "dCagr", "dDd")} for p in ("full", "half1", "half2", "post2010", "post2008")})
        print("   ", {x: round(y, 4) for x, y in m["full"]["cand"].items()}, "vs", {x: round(y, 4) for x, y in m["full"]["bench"].items()})
        print("    placebo", m["placebo"], "delay dS", round(m["delay"]["dS"], 4))
    print("T2prime", {p: round(v["dS"], 3) for p, v in rep["T2prime"].items()}, "fixedAvg", {k: round(v["dS"], 3) for k, v in rep["fixedAvg"].items()}, "devx", {k: round(v["dS"], 3) for k, v in rep["devx"].items()})
    print("volMatched", rep["benchVolMatched"])
    print("explore", {k: round(rep[k]["full"]["dS"], 3) for k in ("T1top1", "T1top3", "T1mom12", "T1noTrend")},
          {k: {c: round(v[c]["dS"], 3) for c in v} for k, v in rep.items() if k.startswith("cost")})
    for k, v in rep["refs"].items():
        print("ref", k, {p: (round(s["sharpe"], 3), round(s["cagr"], 4), round(s["maxDd"], 3)) for p, s in v.items()})
    for b in rep["usBears"]:
        print("bear", {k: (round(x, 3) if isinstance(x, float) else x) for k, x in b.items()})
    print("avgW", {k: {c: round(x, 2) for c, x in v.items()} for k, v in rep["avgWeights"].items()})
    print("current", rep["current"])


if __name__ == "__main__":
    main()
