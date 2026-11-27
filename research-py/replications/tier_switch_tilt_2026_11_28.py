"""L-041 独立第二实现：按宏观档位切换行业模块（确认项 G1–G5）。

只依据 docs/research/tier-switch-tilt-2026-11-28/PREREG.md 与
docs/research/defensive-tilt-2026-11-26/PREREG.md（L-026）文字规格实现。

用法：
  cd research-py && uv run python replications/tier_switch_tilt_2026_11_28.py --json out.json
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
INP = ROOT / "docs/research/tier-switch-tilt-2026-11-28/inputs"

P1 = ["Food", "Soda", "Beer", "Smoke", "Hshld", "Hlth", "MedEq", "Drugs", "Util"]
OFF9 = ["Chips", "Hardw", "Autos", "Rtail", "Mach", "ElcEq", "Banks", "Fin", "Steel"]
SIDE = {
    "offense": "off",
    "lean-offense": "off",
    "neutral": "neu",
    "lean-defense": "def",
    "defense": "def",
}
CAP = 0.8
TC = 0.001
FEE = 0.0015 / 12
TILT = 0.3


def next_month(m: str) -> str:
    y, mo = int(m[:4]), int(m[5:7])
    mo += 1
    if mo == 13:
        y, mo = y + 1, 1
    return f"{y:04d}-{mo:02d}"


class Data:
    def __init__(self) -> None:
        ind = json.loads((INP / "industry.json").read_text())
        tiers = json.loads((INP / "tiers.json").read_text())
        self.names = ind["industries"]
        self.months = [m for m, _ in ind["returns"]]
        self.idx = {m: i for i, m in enumerate(self.months)}
        n = len(self.names)
        T = len(self.months)
        self.R = np.full((T, n), np.nan)
        W = np.full((T, n), np.nan)
        for t, (m, v) in enumerate(ind["returns"]):
            self.R[t] = [np.nan if x is None else x / 100.0 for x in v]
        firms = {m: v for m, v in ind["firms"]}
        size = {m: v for m, v in ind["size"]}
        for t, m in enumerate(self.months):
            f = firms[m]
            s = size[m]
            W[t] = [
                (fi * si) if (fi is not None and si is not None and fi > 0) else np.nan
                for fi, si in zip(f, s)
            ]
        # 市场 M：t 月收益按 t-1 月 firms*size 加权；t 月收益或 t-1 月权重缺失剔除
        self.M = np.full(T, np.nan)
        for t in range(1, T):
            w = W[t - 1]
            r = self.R[t]
            ok = ~np.isnan(w) & ~np.isnan(r) & (w > 0)
            if ok.any():
                self.M[t] = np.sum(w[ok] * r[ok]) / np.sum(w[ok])
        self.cash = {m: c for m, c in tiers["cash"]}
        self.tier = {m: x for m, x in tiers["holdout"]}
        for m, x in tiers["realtime"]:
            self.tier.setdefault(m, x)
        self.eqshare = tiers["equityShare"]
        self.ni = {nm: i for i, nm in enumerate(self.names)}

    # ---- 篮子 ----
    def fixed_basket(self, members: list[str], t: int) -> list[int]:
        ids = [self.ni[x] for x in members]
        return [i for i in ids if not np.isnan(self.R[t, i])]

    def beta_baskets(self, t: int) -> tuple[list[int], list[int]]:
        lo_t, hi_t = t - 36, t  # rows t-36 .. t-1
        Rw = self.R[lo_t:hi_t]
        Mw = self.M[lo_t:hi_t]
        assert not np.isnan(Mw).any()
        mc = Mw - Mw.mean()
        varm = np.sum(mc * mc) / 35.0
        cands = []
        for i in range(Rw.shape[1]):
            ri = Rw[:, i]
            if np.isnan(ri).any():
                continue
            cov = np.sum((ri - ri.mean()) * mc) / 35.0
            cands.append((cov / varm, i))
        asc = sorted(cands, key=lambda x: (x[0], x[1]))
        desc = sorted(cands, key=lambda x: (-x[0], x[1]))
        low = [i for _, i in asc[:10]]
        high = [i for _, i in desc[:10]]
        low = [i for i in low if not np.isnan(self.R[t, i])]
        high = [i for i in high if not np.isnan(self.R[t, i])]
        return low, high


def run_portfolio(d: Data, hold_months: list[str], equity: list[float],
                  baskets: list[list[int]]) -> dict:
    """baskets[k]：第 k 个持有月股票部分的篮子行业（空表 = 100% M，否则 70% M + 30% 等权篮子）。

    返回净收益、超额收益序列。资产键：'M'、行业下标 int、'cash'。
    """
    prev_w: dict | None = None
    prev_r: dict | None = None
    prev_gross = 0.0
    net = []
    exc = []
    for k, m in enumerate(hold_months):
        t = d.idx[m]
        e = equity[k]
        b = baskets[k]
        w: dict = {"cash": 1.0 - e}
        if b:
            w["M"] = e * (1 - TILT)
            for i in b:
                w[i] = w.get(i, 0.0) + e * TILT / len(b)
            basket_w = e * TILT
        else:
            w["M"] = e
            basket_w = 0.0
        r: dict = {"cash": d.cash[m], "M": d.M[t]}
        for key in w:
            if isinstance(key, int):
                r[key] = d.R[t, key]
        gross = sum(w[a] * r[a] for a in w)
        if prev_w is None:
            turn = 0.0
        else:
            drift = {a: prev_w[a] * (1 + prev_r[a]) / (1 + prev_gross) for a in prev_w}
            keys = (set(drift) | set(w)) - {"cash"}
            turn = sum(abs(w.get(a, 0.0) - drift.get(a, 0.0)) for a in keys)
        fee = FEE * basket_w
        n = (1 + gross - fee) * (1 - TC * turn) - 1
        net.append(n)
        exc.append(n - d.cash[m])
        prev_w, prev_r, prev_gross = w, r, gross
    return {"net": np.array(net), "exc": np.array(exc)}


def sharpe(exc: np.ndarray) -> float:
    return float(exc.mean() / exc.std(ddof=1) * math.sqrt(12))


def maxdd(net: np.ndarray) -> float:
    nav = np.concatenate([[1.0], np.cumprod(1 + net)])
    peak = np.maximum.accumulate(nav)
    return float(np.max(1 - nav / peak))


def window(d: Data, first_tier: str, last_tier: str):
    tm = []
    m = first_tier
    while True:
        tm.append(m)
        if m == last_tier:
            break
        m = next_month(m)
    hold = [next_month(x) for x in tm]
    tiers = [d.tier[x] for x in tm]
    equity = [d.eqshare[x] * CAP for x in tiers]
    sides = [SIDE[x] for x in tiers]
    return hold, equity, sides


def build_baskets(d: Data, cand: str, hold: list[str], sides: list[str], mode: str):
    """mode: 'switch' | 'static' | 'b0'"""
    out = []
    for m, s in zip(hold, sides):
        t = d.idx[m]
        if mode == "b0":
            out.append([])
            continue
        if cand == "C1":
            dfn, ofn = (lambda: d.fixed_basket(P1, t)), (lambda: d.fixed_basket(OFF9, t))
        else:
            lo, hi = d.beta_baskets(t)
            dfn, ofn = (lambda lo=lo: lo), (lambda hi=hi: hi)
        if mode == "static":
            out.append(dfn())
        elif s == "def":
            out.append(dfn())
        elif s == "off":
            out.append(ofn())
        else:
            out.append([])
    return out


def holm2(p: dict) -> dict:
    ks = sorted(p, key=lambda k: p[k])
    adj = {}
    running = 0.0
    for j, k in enumerate(ks):
        v = min(1.0, (len(ks) - j) * p[k])
        running = max(running, v)
        adj[k] = running
    return adj


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", type=str, default=None)
    args = ap.parse_args()
    d = Data()

    wins = {
        "main": window(d, "1959-09", "1972-12"),
        "secondary": window(d, "1950-01", "1972-12"),
        "veto": window(d, "1973-01", "2026-08"),
    }
    assert len(wins["main"][0]) == 160 and len(wins["secondary"][0]) == 276
    assert wins["veto"][0][-1] == "2026-09"

    res: dict = {}
    praw: dict = {}
    for cand in ["C1", "C2"]:
        r: dict = {}
        for wn, (hold, equity, sides) in wins.items():
            b0 = run_portfolio(d, hold, equity, build_baskets(d, cand, hold, sides, "b0"))
            cd = run_portfolio(d, hold, equity, build_baskets(d, cand, hold, sides, "switch"))
            st = run_portfolio(d, hold, equity, build_baskets(d, cand, hold, sides, "static"))
            s = {"cand": sharpe(cd["exc"]), "B0": sharpe(b0["exc"]), "static": sharpe(st["exc"])}
            r[wn] = {
                "sharpe": s,
                "dS_B0": s["cand"] - s["B0"],
                "dS_static": s["cand"] - s["static"],
                "maxDd": {"cand": maxdd(cd["net"]), "B0": maxdd(b0["net"]), "static": maxdd(st["net"])},
            }
        # G3 时机检验
        hold, equity, sides = wins["main"]
        sB0 = r["main"]["sharpe"]["B0"]
        dS = r["main"]["dS_B0"]
        lab = np.array(sides, dtype=object)
        ks = list(range(12, 149))
        dks = []
        for k in ks:
            sh = list(np.roll(lab, k))
            cd = run_portfolio(d, hold, equity, build_baskets(d, cand, hold, sh, "switch"))
            dks.append(sharpe(cd["exc"]) - sB0)
        dks = np.array(dks)
        p = (int(np.sum(dks >= dS - 1e-12)) + 1) / (len(ks) + 1)
        praw[cand] = p
        r["placebo"] = {"pUpper": p, "n": len(ks)}
        res[cand] = r

    padj = holm2(praw)
    for cand in ["C1", "C2"]:
        r = res[cand]
        r["placebo"]["pHolm"] = padj[cand]
        g = {
            "G1": bool(r["main"]["dS_B0"] >= 0.03),
            "G2": bool(r["main"]["dS_static"] >= 0),
            "G3": bool(padj[cand] <= 0.10),
            "G4": bool(r["secondary"]["dS_B0"] > 0),
            "G5": bool(r["veto"]["dS_B0"] >= -0.02),
        }
        r["gates"] = g
        if all(g.values()):
            v = "通过"
        elif g["G1"] and g["G2"] and g["G4"] and g["G5"] and not g["G3"]:
            v = "方向一致，时机不显著"
        elif g["G1"] and g["G2"] and g["G3"] and g["G4"] and not g["G5"]:
            v = "部分成立（1973 年后变差）"
        elif r["main"]["dS_B0"] > 0:
            v = "不稳定"
        else:
            v = "不通过"
        r["verdict"] = v
        res[cand] = {
            "main": r["main"],
            "secondary": {"dS_B0": r["secondary"]["dS_B0"], "dS_static": r["secondary"]["dS_static"],
                          "sharpe": r["secondary"]["sharpe"]},
            "veto": {"dS_B0": r["veto"]["dS_B0"], "dS_static": r["veto"]["dS_static"],
                     "sharpe": r["veto"]["sharpe"]},
            "placebo": r["placebo"],
            "gates": g,
            "verdict": v,
        }

    txt = json.dumps(res, ensure_ascii=False, indent=2)
    print(txt)
    if args.json:
        Path(args.json).write_text(txt)


if __name__ == "__main__":
    main()
