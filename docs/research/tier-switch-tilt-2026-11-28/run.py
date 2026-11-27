"""L-041：按宏观档位切换行业模块（进攻侧放进攻模块、防守侧放防守模块、中性不倾斜）。

按 PREREG.md 执行；只读 inputs/ 下冻结文件，结果写到 results.json。
    cd research-py && uv run python ../docs/research/tier-switch-tilt-2026-11-28/run.py
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
INP = HERE / "inputs"

TILT, CAP, COST, FEE = 0.3, 0.8, 0.001, 0.0015 / 12
DEF_P1 = ["Food", "Soda", "Beer", "Smoke", "Hshld", "Hlth", "MedEq", "Drugs", "Util"]
CYC9 = ["Chips", "Hardw", "Autos", "Rtail", "Mach", "ElcEq", "Banks", "Fin", "Steel"]
SIDE = {"offense": "off", "lean-offense": "off", "neutral": "neu", "lean-defense": "def", "defense": "def"}
WIN = {"main": ("1959-10", "1973-01"), "secondary": ("1950-02", "1973-01"), "veto": ("1973-02", "2026-09")}
SUB = {"1973-1999": ("1973-02", "1999-12"), "2000-2026": ("2000-01", "2026-09"), "2012-2026": ("2012-01", "2026-09")}


def month_after(m: str, k: int) -> str:
    y, mm = map(int, m.split("-"))
    t = y * 12 + mm - 1 + k
    return f"{t // 12}-{t % 12 + 1:02d}"


def months_between(lo: str, hi: str) -> list[str]:
    out, m = [], lo
    while m <= hi:
        out.append(m)
        m = month_after(m, 1)
    return out


# ---------------- 输入 ----------------
ind = json.loads((INP / "industry.json").read_text())
tiers_in = json.loads((INP / "tiers.json").read_text())
NAMES = ind["industries"]
NI = len(NAMES)
R = {d: np.array([np.nan if v is None else v / 100 for v in r]) for d, r in ind["returns"]}
F = {d: v for d, v in ind["firms"]}
Z = {d: v for d, v in ind["size"]}
CASH = {d: c for d, c in tiers_in["cash"]}
EQ = tiers_in["equityShare"]
TIER = {**{d: t for d, t in tiers_in["holdout"]}, **{d: t for d, t in tiers_in["realtime"]}}


def market(t: str) -> float:
    p = month_after(t, -1)
    r, f, z = R[t], F[p], Z[p]
    w = np.array([(f[i] or 0) * (z[i] or 0) if (f[i] or 0) > 0 and (z[i] or 0) > 0 and not np.isnan(r[i]) else 0.0 for i in range(NI)])
    return float((w * np.nan_to_num(r)).sum() / w.sum())


M = {t: market(t) for t in R if month_after(t, -1) in F}


def avail(t: str, idx: list[int]) -> list[int]:
    return [i for i in idx if not np.isnan(R[t][i])]


def beta_rank(t: str) -> list[int]:
    hist = [month_after(t, -1 - k) for k in range(36)]
    X = np.array([R[h] for h in hist])
    m = np.array([M[h] for h in hist])
    cand = [i for i in range(NI) if not np.isnan(X[:, i]).any()]
    vm = m.var(ddof=1)
    beta = {i: float(np.cov(X[:, i], m, ddof=1)[0, 1] / vm) for i in cand}
    return sorted(cand, key=lambda i: (beta[i], i))


def modules(kind: str, t: str) -> dict:
    if kind == "C1":
        return {"def": avail(t, [NAMES.index(n) for n in DEF_P1]), "off": avail(t, [NAMES.index(n) for n in CYC9])}
    order = beta_rank(t)
    return {"def": avail(t, order[:10]), "off": avail(t, order[-10:])}


# ---------------- 组合 ----------------
def targets(t: str, sig: str, kind: str, mode: str, side_override: str | None = None) -> dict:
    """返回 {'cash': w, 'M': w, i: w}。mode：B0 / static / switch / defOnly / offOnly。"""
    e = EQ[TIER[sig]] * CAP
    side = side_override if side_override is not None else SIDE[TIER[sig]]
    tw = {"cash": 1 - e}
    if mode == "B0":
        basket = None
    elif mode == "static":
        basket = "def"
    elif mode == "switch":
        basket = None if side == "neu" else side
    elif mode == "defOnly":
        basket = "def" if side == "def" else None
    elif mode == "offOnly":
        basket = "off" if side == "off" else None
    else:
        raise ValueError(mode)
    if basket is None:
        tw["M"] = e
    else:
        mem = modules(kind, t)[basket]
        tw["M"] = e * (1 - TILT)
        for i in mem:
            tw[i] = tw.get(i, 0.0) + e * TILT / len(mem)
    return tw


def asset_ret(t: str, a) -> float:
    if a == "cash":
        return CASH[t]
    if a == "M":
        return M[t]
    return float(R[t][a])


def simulate(hold: list[str], kind: str, mode: str, lag: int = 1, sides: list[str] | None = None, cost: float = COST) -> dict:
    out, drift, tos, eq_only = [], None, [], []
    for j, t in enumerate(hold):
        sig = month_after(t, -lag)
        tw = targets(t, sig, kind, mode, None if sides is None else sides[j])
        to = 0.0
        if drift is not None:
            keys = (set(tw) | set(drift)) - {"cash"}
            to = sum(abs(tw.get(k, 0.0) - drift.get(k, 0.0)) for k in keys)
        rets = {a: asset_ret(t, a) for a in tw}
        gross = sum(w * rets[a] for a, w in tw.items())
        fee = FEE * sum(w for a, w in tw.items() if a not in ("cash", "M"))
        net = (1 + gross - fee) * (1 - cost * to) - 1
        out.append(net)
        e = 1 - tw["cash"]
        eq_only.append(sum(w * rets[a] for a, w in tw.items() if a != "cash") / e)
        V = 1 + gross
        drift = {a: w * (1 + rets[a]) / V for a, w in tw.items()}
        tos.append(to)
    return {"net": np.array(out), "equity": np.array(eq_only), "turnoverPerYear": float(np.mean(tos) * 12)}


def stats(x: np.ndarray, cash: np.ndarray) -> dict:
    ex = x - cash
    nav = np.cumprod(1 + x)
    return {"sharpe": float(ex.mean() / ex.std(ddof=1) * np.sqrt(12)), "cagr": float(nav[-1] ** (12 / len(x)) - 1),
            "vol": float(x.std(ddof=1) * np.sqrt(12)), "maxDd": float((nav / np.maximum.accumulate(np.maximum(nav, 1.0)) - 1).min())}


def holm(ps: dict) -> dict:
    order = sorted(ps, key=ps.get)
    out, run = {}, 0.0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i)))
        out[k] = run
    return out


def window_eval(kind: str, win: str, lag: int = 1, cost: float = COST) -> dict:
    hold = [t for t in months_between(*WIN[win]) if month_after(t, -lag) in TIER]  # 晚一个月版本在次窗口少首月
    cash = np.array([CASH[t] for t in hold])
    res = {}
    sims = {mode: simulate(hold, kind, mode, lag, cost=cost) for mode in ("switch", "B0", "static", "defOnly", "offOnly")}
    st = {mode: stats(s["net"], cash) for mode, s in sims.items()}
    res["stats"] = st
    res["dS_B0"] = st["switch"]["sharpe"] - st["B0"]["sharpe"]
    res["dS_static"] = st["switch"]["sharpe"] - st["static"]["sharpe"]
    res["dS_defOnly"] = st["defOnly"]["sharpe"] - st["B0"]["sharpe"]
    res["dS_offOnly"] = st["offOnly"]["sharpe"] - st["B0"]["sharpe"]
    res["turnover"] = {mode: s["turnoverPerYear"] for mode, s in sims.items()}
    eqst = {mode: stats(sims[mode]["equity"], cash) for mode in ("switch", "B0", "static")}
    res["equityOnly"] = {"dS_B0": eqst["switch"]["sharpe"] - eqst["B0"]["sharpe"], "dS_static": eqst["switch"]["sharpe"] - eqst["static"]["sharpe"], "stats": eqst}
    res["months"] = len(hold)
    return res, sims, hold, cash


def side_excess(kind: str, win: str) -> dict:
    """各档位侧里，防守 / 进攻模块（等权）相对 M 的月均超额与月数。"""
    hold = months_between(*WIN[win])
    acc = {s: {"def": [], "off": []} for s in ("off", "neu", "def")}
    for t in hold:
        s = SIDE[TIER[month_after(t, -1)]]
        mods = modules(kind, t)
        for b in ("def", "off"):
            acc[s][b].append(float(np.mean([R[t][i] for i in mods[b]])) - M[t])
    return {s: {"months": len(v["def"]), "defExcess": float(np.mean(v["def"])) if v["def"] else None, "offExcess": float(np.mean(v["off"])) if v["off"] else None} for s, v in acc.items()}


def main() -> None:
    out = {"study": "L-041", "inputSha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(INP.glob("*.json"))}}
    pu = {}
    for kind in ("C1", "C2"):
        main_r, sims, hold, cash = window_eval(kind, "main")
        sec, *_ = window_eval(kind, "secondary")
        veto, vsims, vhold, vcash = window_eval(kind, "veto")
        # 时机检验：平移三侧标签，股票占比不变
        labels = [SIDE[TIER[month_after(t, -1)]] for t in hold]
        base_s = main_r["stats"]["B0"]["sharpe"]
        vals = []
        for k in range(12, 149):
            sh = list(np.roll(np.array(labels, dtype=object), k))
            s = simulate(hold, kind, "switch", sides=sh)
            vals.append(stats(s["net"], cash)["sharpe"] - base_s)
        vals = np.array(vals)
        pu[kind] = float(((vals >= main_r["dS_B0"] - 1e-12).sum() + 1) / (len(vals) + 1))
        sub = {}
        for name, (lo, hi) in SUB.items():
            m = np.array([lo <= t <= hi for t in vhold])
            a, b = stats(vsims["switch"]["net"][m], vcash[m]), stats(vsims["B0"]["net"][m], vcash[m])
            sub[name] = a["sharpe"] - b["sharpe"]
        lag2 = {w: window_eval(kind, w, lag=2)[0]["dS_B0"] for w in ("main", "secondary", "veto")}
        cost3 = {w: window_eval(kind, w, cost=0.003)[0]["dS_B0"] for w in ("main", "secondary", "veto")}
        out[kind] = {"main": main_r, "secondary": sec, "veto": veto, "placebo": {"pUpper": pu[kind], "n": len(vals), "median": float(np.median(vals)), "p90": float(np.quantile(vals, 0.9))},
                     "vetoSub": sub, "lag2": lag2, "cost0.003": cost3,
                     "sideExcess": {w: side_excess(kind, w) for w in ("main", "secondary", "veto")}}
    adj = holm(pu)
    for kind in ("C1", "C2"):
        o = out[kind]
        o["placebo"]["pHolm"] = adj[kind]
        g = {"G1": o["main"]["dS_B0"] >= 0.03, "G2": o["main"]["dS_static"] >= 0, "G3": adj[kind] <= 0.10,
             "G4": o["secondary"]["dS_B0"] > 0, "G5": o["veto"]["dS_B0"] >= -0.02}
        o["gates"] = g
        if all(g.values()):
            v = "通过"
        elif g["G1"] and g["G2"] and g["G4"] and g["G5"]:
            v = "方向一致，时机不显著"
        elif g["G1"] and g["G2"] and g["G3"] and g["G4"]:
            v = "部分成立（1973 年后变差）"
        elif o["main"]["dS_B0"] > 0:
            v = "不稳定"
        else:
            v = "不通过"
        o["verdict"] = v
    (HERE / "results.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    for kind in ("C1", "C2"):
        o = out[kind]
        s = o["main"]["stats"]
        print(kind, o["verdict"], o["gates"])
        print("  main sharpe switch/B0/static", round(s["switch"]["sharpe"], 4), round(s["B0"]["sharpe"], 4), round(s["static"]["sharpe"], 4),
              "dS_B0", round(o["main"]["dS_B0"], 4), "dS_static", round(o["main"]["dS_static"], 4), "p", round(o["placebo"]["pUpper"], 4), "holm", round(o["placebo"]["pHolm"], 4))
        print("  sec dS", round(o["secondary"]["dS_B0"], 4), "veto dS", round(o["veto"]["dS_B0"], 4), "sub", {k: round(v, 4) for k, v in o["vetoSub"].items()})
        print("  defOnly/offOnly main", round(o["main"]["dS_defOnly"], 4), round(o["main"]["dS_offOnly"], 4), "sec", round(o["secondary"]["dS_defOnly"], 4), round(o["secondary"]["dS_offOnly"], 4), "veto", round(o["veto"]["dS_defOnly"], 4), round(o["veto"]["dS_offOnly"], 4))
        print("  maxDd main switch/B0", round(s["switch"]["maxDd"], 4), round(s["B0"]["maxDd"], 4), "veto", round(o["veto"]["stats"]["switch"]["maxDd"], 4), round(o["veto"]["stats"]["B0"]["maxDd"], 4))
        print("  lag2", {k: round(v, 4) for k, v in o["lag2"].items()}, "cost0.3%", {k: round(v, 4) for k, v in o["cost0.003"].items()})
        print("  sideExcess main", json.dumps({k: {a: (round(b, 4) if isinstance(b, float) else b) for a, b in v.items()} for k, v in o["sideExcess"]["main"].items()}))
        print("  sideExcess veto", json.dumps({k: {a: (round(b, 4) if isinstance(b, float) else b) for a, b in v.items()} for k, v in o["sideExcess"]["veto"].items()}))


if __name__ == "__main__":
    main()
