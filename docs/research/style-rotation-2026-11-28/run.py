"""L-042 风格轮动（因子动量，只做多）主实现。按 PREREG.md 执行。

    cd research-py && uv run python ../docs/research/style-rotation-2026-11-28/run.py
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
INP = HERE / "inputs"
LEGS = ["V+", "V-", "M+", "M-", "P+", "P-", "I+", "I-", "S+", "S-"]
PAIRS = [("V+", "V-"), ("M+", "M-"), ("P+", "P-"), ("I+", "I-"), ("S+", "S-")]
SHA = {
    "legs_dxus.csv": "3129c7e02fcb9acae26f3826beae616c13cfedbc9a02107ffd5210e360b6665a",
    "legs_em.csv": "c7c1e789aec086c2de9b79e40f08df100e0856269cf8310e4716f719a4015e7d",
    "legs_us.csv": "b22f82514b32f1038bfe9bf559b4f1f0210327e45669a4c16be5160409f159a3",
    "regional_factors.csv": "93dbb88f0befbc4fa1cd90237bce971848d3b150abc40bdcb014daff282f73f0",
}
WIN = {"dxus": ("1991-11", "2023-10"), "em": ("1993-07", "2023-10"), "us": ("1964-07", "2023-10")}
HALVES = {"h1": ("1991-11", "2007-10"), "h2": ("2007-11", "2023-10")}
SEGS = {"1991-1999": ("1991-11", "1999-12"), "2000-2008": ("2000-01", "2008-12"),
        "2009-2019": ("2009-01", "2019-12"), "2020-2023": ("2020-01", "2023-10")}


def load(mk: str) -> pd.DataFrame:
    p = INP / f"legs_{mk}.csv"
    assert hashlib.sha256(p.read_bytes()).hexdigest() == SHA[p.name], p
    return pd.read_csv(p, index_col="month")


def weights(df: pd.DataFrame, kind: str, months: list[str], L: int = 12, top: int = 3) -> pd.DataFrame:
    """持有月 h 的目标权重，用到 h 前一个月为止的 L 个月收益。"""
    idx = list(df.index)
    R = df[LEGS]
    rows = []
    for h in months:
        j = idx.index(h)
        win = R.iloc[j - L:j]
        assert len(win) == L and not win.isna().any().any(), (h, kind)
        w = pd.Series(0.0, index=LEGS)
        if kind == "B0":
            w[:] = 0.1
        elif kind == "R1":
            score = (1 + win).prod() - 1
            order = sorted(LEGS, key=lambda c: (-score[c], LEGS.index(c)))
            w[order[:top]] = 1.0 / top
        elif kind == "R2":
            for a, b in PAIRS:
                # 输入为 6 位小数，12 个月之和在十进制下可精确为 0；四舍五入到 1e-10 避免浮点加法顺序决定选边（PREREG「= 0 两条腿各一半」）
                d = round(float((win[a] - win[b]).sum()), 10)
                if d > 0:
                    w[a] += 0.2
                elif d < 0:
                    w[b] += 0.2
                else:
                    w[a] += 0.1
                    w[b] += 0.1
        rows.append(w)
    return pd.DataFrame(rows, index=months)


def simulate(W: pd.DataFrame, R: pd.DataFrame, cost: float = 0.001) -> tuple[np.ndarray, np.ndarray]:
    Wv, Rv = W.to_numpy(), R.loc[W.index, LEGS].to_numpy()
    n = len(Wv)
    net, to = np.empty(n), np.empty(n)
    prev = None
    for i in range(n):
        if prev is None:
            t = 1.0
        else:
            t = np.abs(Wv[i] - prev).sum()
        g = float(Wv[i] @ Rv[i])
        to[i] = t
        net[i] = (1 + g) * (1 - cost * t) - 1
        grown = Wv[i] * (1 + Rv[i])
        prev = grown / grown.sum()
    return net, to


def sharpe(x: np.ndarray, rf: np.ndarray) -> float:
    e = x - rf
    return float(e.mean() / e.std(ddof=1) * np.sqrt(12))


def maxdd(x: np.ndarray) -> float:
    nav = np.concatenate([[1.0], np.cumprod(1 + x)])
    return float((nav / np.maximum.accumulate(nav) - 1).min())


def cagr(x: np.ndarray) -> float:
    return float(np.prod(1 + x) ** (12 / len(x)) - 1)


def months_of(df: pd.DataFrame, a: str, b: str) -> list[str]:
    return [m for m in df.index if a <= m <= b]


def run_market(mk: str, cost: float = 0.001, L: int = 12, top: int = 3) -> dict:
    df = load(mk)
    ms = months_of(df, *WIN[mk])
    rf = df.loc[ms, "RF"].to_numpy()
    mkt = df.loc[ms, "MKT"].to_numpy()
    out = {"months": len(ms)}
    base_net, base_to = simulate(weights(df, "B0", ms, L), df, cost)
    out["B0"] = {"sharpe": sharpe(base_net, rf), "maxDd": maxdd(base_net), "cagr": cagr(base_net),
                 "vol": float(base_net.std(ddof=1) * np.sqrt(12)), "turnover": float(base_to[1:].mean() * 12)}
    out["MKT"] = {"sharpe": sharpe(mkt, rf), "maxDd": maxdd(mkt), "cagr": cagr(mkt)}
    for k in ("R1", "R2"):
        W = weights(df, k, ms, L, top)
        net, to = simulate(W, df, cost)
        r = {"sharpe": sharpe(net, rf), "maxDd": maxdd(net), "cagr": cagr(net),
             "vol": float(net.std(ddof=1) * np.sqrt(12)), "turnover": float(to[1:].mean() * 12)}
        r["dS"] = r["sharpe"] - out["B0"]["sharpe"]
        r["dS_mkt"] = r["sharpe"] - out["MKT"]["sharpe"]
        r["share"] = {c: float((W[c] > 0).mean()) for c in LEGS}
        sel = pd.Series(net, index=ms)
        bs = pd.Series(base_net, index=ms)
        rfs = pd.Series(rf, index=ms)
        if mk == "dxus":
            for name, (a, b) in {**HALVES, **SEGS}.items():
                m = (sel.index >= a) & (sel.index <= b)
                r.setdefault("sub", {})[name] = sharpe(sel[m].to_numpy(), rfs[m].to_numpy()) - sharpe(bs[m].to_numpy(), rfs[m].to_numpy())
            r["W"] = W
            r["net"] = net
        out[k] = r
    out["_base_net"] = base_net
    out["_rf"] = rf
    out["_df"] = df
    out["_ms"] = ms
    return out


def placebo(res: dict, k: str, cost: float = 0.001) -> tuple[float, list[float]]:
    W = res[k]["W"]
    df, ms, rf = res["_df"], res["_ms"], res["_rf"]
    s0 = sharpe(res["_base_net"], rf)
    n = len(ms)
    obs = res[k]["dS"]
    vals = []
    for s in range(12, n - 12 + 1):
        Ws = pd.DataFrame(np.roll(W.to_numpy(), s, axis=0), index=ms, columns=LEGS)
        net, _ = simulate(Ws, df, cost)
        vals.append(sharpe(net, rf) - s0)
    p = (sum(v >= obs for v in vals) + 1) / (len(vals) + 1)
    return p, vals


def holm(ps: dict[str, float]) -> dict[str, float]:
    keys = sorted(ps, key=ps.get)
    m = len(keys)
    adj, run = {}, 0.0
    for i, key in enumerate(keys):
        run = max(run, min(1.0, (m - i) * ps[key]))
        adj[key] = run
    return adj


def ls_momentum() -> dict:
    """探索 4：多空版时序因子动量（不扣成本）。"""
    p = INP / "regional_factors.csv"
    assert hashlib.sha256(p.read_bytes()).hexdigest() == SHA[p.name]
    d = pd.read_csv(p)
    out = {}
    for reg, f5, fm in [("Europe", "Europe_5_Factors", "Europe_Mom_Factor"), ("Japan", "Japan_5_Factors", "Japan_Mom_Factor"),
                        ("APxJ", "Asia_Pacific_ex_Japan_5_Factors", "Asia_Pacific_ex_Japan_MOM_Factor"),
                        ("NA", "North_America_5_Factors", "North_America_Mom_Factor"),
                        ("DxUS", "Developed_ex_US_5_Factors", "Developed_ex_US_Mom_Factor")]:
        a = d[d.dataset == f5].pivot(index="month", columns="portfolio", values="ret")
        b = d[d.dataset == fm].pivot(index="month", columns="portfolio", values="ret")
        F = pd.concat([a[["SMB", "HML", "RMW", "CMA"]], b.iloc[:, [0]].rename(columns={b.columns[0]: "MOM"})], axis=1).dropna()
        sig = np.sign(F.rolling(12).sum().shift(1))
        tsm = (sig * F).mean(axis=1).dropna()
        tsm = tsm[sig.notna().all(axis=1)]
        ew = F.loc[tsm.index].mean(axis=1)
        sr = lambda x: float(x.mean() / x.std(ddof=1) * np.sqrt(12))
        out[reg] = {"start": tsm.index[0], "months": len(tsm), "sharpe_tsm": sr(tsm), "sharpe_ew": sr(ew), "dS": sr(tsm) - sr(ew)}
    return out


def strip(r: dict) -> dict:
    return {k: v for k, v in r.items() if not k.startswith("_") and k not in ("W", "net")}


def main() -> None:
    res = {mk: run_market(mk) for mk in WIN}
    ps = {}
    for k in ("R1", "R2"):
        ps[k], vals = placebo(res["dxus"], k)
        res["dxus"][k]["placebo_q"] = {q: float(np.quantile(vals, q)) for q in (0.5, 0.9, 0.95)}
    ph = holm(ps)
    cand = {}
    for k in ("R1", "R2"):
        d = res["dxus"][k]
        g = {
            "G1": d["dS"] >= 0.05,
            "G2": ph[k] <= 0.10,
            "G3": d["sub"]["h1"] > 0 and d["sub"]["h2"] > 0,
            "G4": res["em"][k]["dS"] > 0,
            "G5": res["us"][k]["dS"] >= -0.02,
        }
        if all(g.values()):
            v = "通过"
        elif g["G1"] and g["G3"] and g["G4"] and g["G5"]:
            v = "方向一致，时机不显著"
        elif g["G1"] and g["G2"] and g["G3"] and g["G4"]:
            v = "部分成立（美国不成立）"
        elif d["dS"] > 0:
            v = "不稳定"
        else:
            v = "不通过"
        cand[k] = {"gates": g, "p": ps[k], "pHolm": ph[k], "verdict": v}
    # 报告项
    rep = {"cost0.3": {}, "L1": {}, "L6": {}, "top2": {}, "top4": {}}
    for mk in WIN:
        r3 = run_market(mk, cost=0.003)
        rep["cost0.3"][mk] = {k: r3[k]["dS"] for k in ("R1", "R2")}
        for L in (1, 6):
            rl = run_market(mk, L=L)
            rep[f"L{L}"][mk] = {k: rl[k]["dS"] for k in ("R1", "R2")}
        for t in (2, 4):
            rt = run_market(mk, top=t)
            rep[f"top{t}"][mk] = rt["R1"]["dS"]
    rep["ls_tsmom"] = ls_momentum()
    out = {"windows": WIN, "candidates": cand,
           "markets": {mk: {k: strip(v) if isinstance(v, dict) else v for k, v in res[mk].items() if not k.startswith("_")} for mk in WIN},
           "report": rep}
    (HERE / "results.json").write_text(json.dumps(out, indent=2, ensure_ascii=False, default=float) + "\n")
    for k in ("R1", "R2"):
        print(k, cand[k]["verdict"], {g: bool(x) for g, x in cand[k]["gates"].items()}, "p", round(ps[k], 4), "holm", round(ph[k], 4))
        for mk in WIN:
            m = res[mk]
            print(f"  {mk}: S {m[k]['sharpe']:.3f} vs B0 {m['B0']['sharpe']:.3f} dS {m[k]['dS']:+.3f} | mkt {m['MKT']['sharpe']:.3f} | DD {m[k]['maxDd']:.3f}/{m['B0']['maxDd']:.3f} | TO {m[k]['turnover']:.2f}")
        print("  sub", {a: round(b, 3) for a, b in res["dxus"][k]["sub"].items()})
        print("  share", {a: round(b, 2) for a, b in res["dxus"][k]["share"].items()})
    print(json.dumps(rep, ensure_ascii=False, default=float, indent=1))


if __name__ == "__main__":
    main()
