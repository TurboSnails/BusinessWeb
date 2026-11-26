"""L-031 十个月均线在 14 国的确认检验：按 PREREG.md 计算 C1（破位 70%）、C2（破位 50%）。

数据：docs/research/defensive-trend-2026-11-26/inputs/processed/{国家}.csv 的 equity_local、cash_ret。
用法：cd research-py && uv run python ../docs/research/trend-14-2026-11-26/run.py
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import brentq

HERE = Path(__file__).resolve().parent
PROC = HERE.parent / "defensive-trend-2026-11-26/inputs/processed"
SEED = 20261126
DRAWS = 2000
W0 = 0.85
DROP = {"C1": 0.15, "C2": 0.35}
SPLIT = "2001-01"
EURO = ["Belgium", "France", "Germany", "Italy", "Netherlands", "Spain"]


def countries() -> dict[str, str]:
    text = (HERE / "PREREG.md").read_text(encoding="utf-8")
    sect = text.split("## 数据", 1)[1].split("## 规则", 1)[0]
    return dict(re.findall(r"([A-Z][a-z]+|UK) \| (\d{4}-\d{2})", sect))


def load(name: str) -> pd.DataFrame:
    d = pd.read_csv(PROC / f"{name}.csv", dtype={"month": str}).set_index("month").sort_index()
    d = d[["equity_local", "cash_ret"]].dropna()
    if not (np.diff(pd.PeriodIndex(d.index, freq="M").asi8) == 1).all():
        raise SystemExit(f"{name} 月份不连续")
    return d


def below_signal(r: np.ndarray, lag: int = 1) -> np.ndarray:
    """收益月的破位状态：信号月 t（I_t < MA10_t）作用于收益月 t+lag；无信号的月份为 NaN。"""
    idx = np.cumprod(1 + r)
    s = pd.Series(idx)
    ma = s.rolling(10, min_periods=10).mean()
    sig = (s < ma).astype(float).where(ma.notna())
    return sig.shift(lag).to_numpy()


def weights(below: np.ndarray, drop: float) -> np.ndarray:
    return np.where(below > 0, W0 - drop, W0)


def portfolio(r, c, w, cost):
    gross = w * r + (1 - w) * c
    trade = np.concatenate([[0.0], np.abs(np.diff(w))])
    return gross, gross - cost * trade


def same_vol_w(target, r, c):
    return float(brentq(lambda x: np.std(x * r + (1 - x) * c, ddof=1) - target, 0.0, 1.5))


def events(r: np.ndarray) -> list[tuple[int, int]]:
    """熊市段（Lunde–Timmermann 20/20）：从高点跌 ≥ 20% 进入熊市，从谷底反弹 ≥ 20% 熊市结束。
    返回 (p, q)：p 为高点行（−1 表示样本起点之前的净值 1），q 为谷底行；收益月 p+1…q 为下跌段。
    样本末仍在熊市的段以当前最低点为谷底（截断）。"""
    v = np.concatenate([[1.0], np.cumprod(1 + r)])
    out, bull, peak, trough = [], True, 0, 0
    for k in range(1, len(v)):
        if bull:
            if v[k] >= v[peak]:
                peak = k
            elif v[k] <= 0.8 * v[peak]:
                bull, trough = False, k
        else:
            if v[k] < v[trough]:
                trough = k
            elif v[k] >= 1.2 * v[trough]:
                out.append((peak - 1, trough - 1))
                bull, peak = True, k
    if not bull:
        out.append((peak - 1, trough - 1))
    return out


def events_old(r: np.ndarray) -> list[tuple[int, int]]:
    """原算法（报告项）：回撤到创新高之前的最低点，回撤 ≥ 20%。"""
    v = np.concatenate([[1.0], np.cumprod(1 + r)])
    out, peak, trough, in_dd = [], 0, 0, False
    for k in range(1, len(v)):
        if v[k] >= v[peak]:
            if in_dd and v[trough] / v[peak] - 1 <= -0.20:
                out.append((peak - 1, trough - 1))
            peak, trough, in_dd = k, k, False
        else:
            in_dd = True
            if v[k] < v[trough] or trough == peak:
                trough = k
    if in_dd and v[trough] / v[peak] - 1 <= -0.20:
        out.append((peak - 1, trough - 1))
    return out


def seg(x: np.ndarray, a: int, b: int) -> float:
    """收益月 a…b（含）的累计简单收益。"""
    return float(np.prod(1 + x[a : b + 1]) - 1)


def evaluate(name: str, d: pd.DataFrame, cand: str, cost: float = 0.001, lag: int = 1, below: np.ndarray | None = None, event_fn=None) -> dict:
    r_all, c_all = d["equity_local"].to_numpy(), d["cash_ret"].to_numpy()
    b_all = below_signal(r_all, lag) if below is None else below
    ok = ~np.isnan(b_all)
    r, c, b = r_all[ok], c_all[ok], b_all[ok]
    months = d.index[ok]
    w = weights(b, DROP[cand])
    gross, net = portfolio(r, c, w, cost)
    wm = same_vol_w(np.std(gross, ddof=1), r, c)
    m = wm * r + (1 - wm) * c
    evs = (event_fn or events)(r)
    n = len(r)
    rows, in_cycle = [], np.zeros(n, bool)
    for p, q in evs:
        e = min(q + 12, n - 1)
        in_cycle[p + 1 : e + 1] = True
        rows.append({"peak": months[max(p, 0)], "trough": months[q], "unit": "Euro" if name in EURO else name, "lstar": (W0 - 0.65 * DROP[cand]) / wm,
                     "downC": seg(net, p + 1, q), "downM": seg(m, p + 1, q),
                     "fullC": seg(net, p + 1, e), "fullM": seg(m, p + 1, e)})
    calm = ~in_cycle
    x_c, x_m = net - c, m - c
    cer = lambda x: 12 * (x.mean() - 1.5 * x.var(ddof=1))  # noqa: E731
    return {
        "from": months[0], "to": months[-1], "months": n, "wM": wm, "events": rows,
        "calm": float(12 * (net[calm].mean() - m[calm].mean())) if calm.any() else None,
        "dCER": float(cer(x_c) - cer(x_m)),
        "switchesPerYear": float((np.abs(np.diff(w)) > 0).sum() / (n / 12)),
        "avgW": float(w.mean()), "below": b,
        "calmB0": float(12 * (net[calm].mean() - (W0 * r + (1 - W0) * c)[calm].mean())) if calm.any() else None,
        "turnoverPerYear": float(np.abs(np.diff(w)).sum() / (n / 12)),
    }


def pool(per: dict, cand: str, names: list[str]) -> dict:
    ev = [e for c in names for e in per[c][cand]["events"]]
    dc, dm = sum(e["downC"] for e in ev), sum(e["downM"] for e in ev)
    dE = sum(e["fullC"] - e["fullM"] for e in ev)
    return {
        "n": len(ev), "L": dc / dm if dm else None,
        "wins": float(np.mean([e["downC"] > e["downM"] for e in ev])) if ev else None,
        "dE": dE, "posE": float(np.mean([e["fullC"] > e["fullM"] for e in ev])) if ev else None,
    }


def gates(per: dict, costly: dict, lag2: dict, names: list[str], cand: str, p_holm: float) -> dict:
    P = pool(per, cand, names)
    wbar = float(np.mean([per[c][cand]["wM"] for c in names]))
    ev = [e for c in names for e in per[c][cand]["events"]]
    Lstar = sum(e["lstar"] * e["downM"] for e in ev) / sum(e["downM"] for e in ev)  # 按 M 跌幅加权
    halves = {}
    for key, f in (("first", lambda e: e["peak"] < SPLIT), ("second", lambda e: e["peak"] >= SPLIT)):
        sub = [e for e in ev if f(e)]
        dm = sum(e["downM"] for e in sub)
        halves[key] = {"n": len(sub), "L": sum(e["downC"] for e in sub) / dm if dm else None, "dE": sum(e["fullC"] - e["fullM"] for e in sub)}
    unitsL = {}
    for e in ev:
        u = unitsL.setdefault(e["unit"], [0.0, 0.0])
        u[0] += e["downC"]
        u[1] += e["downM"]
    unitsL = {k: (a / b if b else None) for k, (a, b) in unitsL.items()}
    calm = float(np.mean([per[c][cand]["calm"] for c in names]))
    dcer = float(np.mean([per[c][cand]["dCER"] for c in names]))
    sw = float(np.mean([per[c][cand]["switchesPerYear"] for c in names]))
    Pc = pool(costly, cand, names)
    calm_c = float(np.mean([costly[c][cand]["calm"] for c in names]))
    evc = [e for c in names for e in costly[c][cand]["events"]]
    Lstar_c = sum(e["lstar"] * e["downM"] for e in evc) / sum(e["downM"] for e in evc)
    loo = {}
    for u in unitsL:
        sub = [e for e in ev if e["unit"] != u]
        loo[u] = sum(e["downC"] for e in sub) / sum(e["downM"] for e in sub)
    P2 = pool(lag2, cand, names)
    g = {
        "G1": P["L"] <= Lstar and P["wins"] >= 0.625 and all(v < 1 for v in loo.values()),
        "G2": P["dE"] >= 0 and P["posE"] >= 0.625,
        "G3": calm >= 0,
        "G4": all(h["L"] is not None and h["L"] < 1 and h["dE"] >= 0 for h in halves.values()),
        "G5": p_holm <= 0.05,
        "G6": dcer >= -0.0025,
        "G7": sw <= 1.5 and Pc["L"] <= Lstar_c and Pc["wins"] >= 0.625 and Pc["dE"] >= 0 and Pc["posE"] >= 0.625 and calm_c >= 0,
        "G8": sum(v is not None and v < 1 for v in unitsL.values()) >= 7,
        "G9": P2["L"] is not None and P2["L"] < 1 and P2["dE"] >= 0,
    }
    return {**P, "Lstar": Lstar, "wbarM": wbar, "halves": halves, "unitsL": unitsL, "leaveOneUnitOut": loo, "calm": calm, "dCER": dcer,
            "calmB0": float(np.mean([per[c][cand]["calmB0"] for c in names])),
            "turnoverPerYear": float(np.mean([per[c][cand]["turnoverPerYear"] for c in names])),
            "switchesPerYear": sw, "costly": {**Pc, "calm": calm_c, "Lstar": Lstar_c}, "lag2": P2, "pHolm": p_holm, "gates": g}


def main() -> None:
    starts = countries()
    names = list(starts)
    if len(names) != 14:
        raise SystemExit(f"国家表解析异常：{names}")
    data = {c: load(c) for c in names}
    for c in names:
        if data[c].index[0] != starts[c]:
            raise SystemExit(f"{c} 起点 {data[c].index[0]} 与预注册 {starts[c]} 不符")
    sha = {f"{c}.csv": hashlib.sha256((PROC / f"{c}.csv").read_bytes()).hexdigest() for c in names}
    per = {c: {k: evaluate(c, data[c], k) for k in ("C1", "C2")} for c in names}
    costly = {c: {k: evaluate(c, data[c], k, cost=0.003) for k in ("C1", "C2")} for c in names}

    # 安慰剂：共同循环平移破位序列
    lens = {c: int((~np.isnan(per[c]["C1"]["below"])).sum()) for c in names}
    ks = list(range(12, min(lens.values()) - 12 + 1))  # 全部枚举（最短国家收益月数 − 12）
    actual = {k: pool(per, k, names)["L"] for k in ("C1", "C2")}
    hits = {"C1": 0, "C2": 0}
    for k in ks:
        for cand in ("C1", "C2"):
            sh = {}
            for c in names:
                d = data[c]
                b = below_signal(d["equity_local"].to_numpy())
                ok = ~np.isnan(b)
                b2 = b.copy()
                b2[ok] = np.roll(b[ok], k)
                sh[c] = {cand: evaluate(c, d, cand, below=b2)}
            hits[cand] += pool(sh, cand, names)["L"] <= actual[cand]
    p_raw = {k: (hits[k] + 1) / (len(ks) + 1) for k in hits}
    order = sorted(p_raw, key=p_raw.get)
    p_holm, running = {}, 0.0
    for i, k in enumerate(order):
        running = max(running, min(1.0, p_raw[k] * (len(order) - i)))
        p_holm[k] = running

    out = {"study": "L-031", "countries": names, "inputSha256": sha, "placebo": {"raw": p_raw, "holm": p_holm, "shifts": len(ks)}}
    lag2 = {c: {k: evaluate(c, data[c], k, lag=2) for k in ("C1", "C2")} for c in names}
    for cand in ("C1", "C2"):
        out[cand] = gates(per, costly, lag2, names, cand, p_holm[cand])
    for cand in ("C1", "C2"):
        g = out[cand]["gates"]
        core = all(g[k] for k in ("G1", "G2", "G3", "G4", "G6", "G7", "G8", "G9"))
        extra = cand == "C1" or (out["C2"]["L"] <= out["C1"]["L"] and out["C2"]["dE"] >= out["C1"]["dE"])
        out[cand]["extraOk"] = extra
        out[cand]["verdict"] = "通过" if core and g["G5"] and extra else "部分成立" if core and extra else "不通过"

    # 只报告
    rep = {}
    rep["perCountry"] = {c: {k: {**{x: per[c][k][x] for x in ("from", "to", "wM", "calm", "dCER", "avgW")}, **pool({c: per[c]}, k, [c])} for k in ("C1", "C2")} for c in names}
    old = {c: {k: evaluate(c, data[c], k, event_fn=events_old) for k in ("C1", "C2")} for c in names}
    rep["oldEvents"] = {k: pool(old, k, names) for k in ("C1", "C2")}
    rep["equalWeightCountries"] = {k: float(np.mean([pool({c: per[c]}, k, [c])["L"] for c in names if per[c][k]["events"]])) for k in ("C1", "C2")}
    # 新增样本：L-030 的 main_ok 区间之前、从未进过任何计算的股票月份
    fresh = {}
    for c in names:
        raw = pd.read_csv(PROC / f"{c}.csv", dtype={"month": str}).set_index("month")
        first_main = raw.index[raw["main_ok"] == True][0]  # noqa: E712
        if first_main > data[c].index[0]:
            sub = data[c].loc[data[c].index < first_main]
            if len(sub) >= 36:
                fresh[c] = {k: evaluate(c, sub, k) for k in ("C1", "C2")}
    rep["freshSample"] = {"countries": {c: [data[c].index[0], v["C1"]["to"]] for c, v in fresh.items()}, **({k: pool(fresh, k, list(fresh)) for k in ("C1", "C2")} if fresh else {})}
    kf = {}
    for c in names:
        dk = pd.read_csv(PROC / f"{c}.csv", dtype={"month": str}).set_index("month")[["equity_local_kf", "cash_ret"]].dropna().rename(columns={"equity_local_kf": "equity_local"})
        if (np.diff(pd.PeriodIndex(dk.index, freq="M").asi8) == 1).all():
            kf[c] = {k: evaluate(c, dk, k) for k in ("C1", "C2")}
    rep["equityKF"] = {k: pool(kf, k, list(kf)) for k in ("C1", "C2")}
    no_jp = [c for c in names if c != "Japan"]
    rep["noJapan"] = {k: pool(per, k, no_jp) for k in ("C1", "C2")}
    early = [c for c in names if starts[c] == "1975-01"]
    rep["from1975"] = {"countries": early, **{k: pool(per, k, early) for k in ("C1", "C2")}}
    rep["avgW"] = {k: float(np.mean([per[c][k]["avgW"] for c in names])) for k in ("C1", "C2")}
    out["report"] = rep
    for c in names:
        for k in ("C1", "C2"):
            per[c][k].pop("below")
    out["events"] = {c: per[c]["C1"]["events"] for c in names}
    out["eventsC2"] = {c: per[c]["C2"]["events"] for c in names}
    (HERE / "results.json").write_text(json.dumps(out, ensure_ascii=False, indent=2, default=float) + "\n", encoding="utf-8")
    for cand in ("C1", "C2"):
        o = out[cand]
        print(cand, o["verdict"], o["gates"])
        print("   ", {k: (round(v, 4) if isinstance(v, float) else v) for k, v in o.items() if k in ("n", "L", "Lstar", "wins", "dE", "posE", "calm", "dCER", "switchesPerYear", "pHolm")})
        print("    两段", o["halves"], "\n    单元", {k: round(v, 3) for k, v in o["unitsL"].items()}, "\n    0.30%", o["costly"])
    print("安慰剂", out["placebo"])
    print("报告", json.dumps({k: v for k, v in rep.items() if k != "perCountry"}, ensure_ascii=False, default=float))
    for c in names:
        a, b = rep["perCountry"][c]["C1"], rep["perCountry"][c]["C2"]
        print(f"  {c:12s} 事件 {a['n']} C1 L {a['L']} 胜 {a['wins']} ΔE {a['dE']:+.3f} | C2 L {b['L']} ΔE {b['dE']:+.3f}")


if __name__ == "__main__":
    main()
