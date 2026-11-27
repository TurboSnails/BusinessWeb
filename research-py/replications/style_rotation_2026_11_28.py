"""L-042 风格轮动（因子动量，只做多）独立第二实现。

只依据 docs/research/style-rotation-2026-11-28/PREREG.md 与 inputs/ 写成，出数前未读 run.py。
运行：cd research-py && uv run python replications/style_rotation_2026_11_28.py --json <out>

约定：
- t 月末信号用 t-11..t 共 12 个月收益，决定 t+1 月权重。
- 漂移权重 = 上月目标权重 × (1+各腿当月收益) / (1+组合毛收益)。
- 首个持有月换手 = 1（从现金建仓）。
- 净收益 = (1+毛收益)×(1−c×换手)−1。
- 夏普 = mean(净−RF)/std(ddof=1)×√12；回撤按月末净值，含起点净值 1。
- 半段夏普 = 全窗口净收益序列截取该半段（不重新建仓）。
- R2「= 0」按十进制精确判断（和四舍五入到 1e-10），浮点两种处理另报敏感性。
- 安慰剂：平移后权重第 i 行 = 原第 (i−k) mod n 行（np.roll(W, k, axis=0)），k=12..372。
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
STUDY = ROOT / "docs/research/style-rotation-2026-11-28"
INPUTS = STUDY / "inputs"

SHA = {
    "legs_dxus.csv": "3129c7e02fcb9acae26f3826beae616c13cfedbc9a02107ffd5210e360b6665a",
    "legs_em.csv": "c7c1e789aec086c2de9b79e40f08df100e0856269cf8310e4716f719a4015e7d",
    "legs_us.csv": "b22f82514b32f1038bfe9bf559b4f1f0210327e45669a4c16be5160409f159a3",
    "regional_factors.csv": "93dbb88f0befbc4fa1cd90237bce971848d3b150abc40bdcb014daff282f73f0",
}

LEGS = ["V+", "V-", "M+", "M-", "P+", "P-", "I+", "I-", "S+", "S-"]
PAIRS = [(0, 1), (2, 3), (4, 5), (6, 7), (8, 9)]
LOOKBACK = 12
COST = 0.001
COST_HI = 0.003

WINDOWS = {
    "dxus": ("legs_dxus.csv", "1991-11", "2023-10", 384),
    "em": ("legs_em.csv", "1993-07", "2023-10", 364),
    "us": ("legs_us.csv", "1964-07", "2023-10", 712),
}
HALVES = {"h1": ("1991-11", "2007-10", 192), "h2": ("2007-11", "2023-10", 192)}
K_RANGE = range(12, 373)


def verify_inputs() -> dict:
    out = {}
    for name, want in SHA.items():
        got = hashlib.sha256((INPUTS / name).read_bytes()).hexdigest()
        if got != want:
            raise SystemExit(f"sha256 mismatch for {name}: {got} != {want}")
        out[name] = got
    return out


def load(name: str) -> pd.DataFrame:
    df = pd.read_csv(INPUTS / name, dtype={"month": str})
    df = df.set_index("month")
    assert list(df.columns) == LEGS + ["RF", "MKT"], df.columns
    return df.astype(float)


def weights_r1(lb: np.ndarray) -> np.ndarray:
    """lb: (12, 10) returns. Top 3 by compounded return, ties -> earlier leg."""
    comp = np.prod(1.0 + lb, axis=0) - 1.0
    order = np.argsort(-comp, kind="stable")
    w = np.zeros(10)
    w[order[:3]] = 1.0 / 3.0
    return w


R2_MODE = "exact"  # exact | float_sum_diff | float_diff_sums


def pair_sum(lb: np.ndarray, p: int, m: int) -> float:
    """12 个月「正向 − 反向」月收益差之和。

    输入精确到 1e-6，12 项之和在十进制下是 1e-6 的整数倍；浮点累加会把精确为 0 的和
    变成 ±1e-17 并随机决定方向。默认 exact：四舍五入到 1e-10 后再比较，按 PREREG
    的「= 0 两腿各一半」处理。其余两种模式只用于敏感性报告。
    """
    if R2_MODE == "float_sum_diff":
        return float(np.sum(lb[:, p] - lb[:, m]))
    if R2_MODE == "float_diff_sums":
        return float(lb[:, p].sum() - lb[:, m].sum())
    return round(float(np.sum(lb[:, p] - lb[:, m])), 10)


def weights_r2(lb: np.ndarray) -> tuple[np.ndarray, int]:
    w = np.zeros(10)
    zeros = 0
    for p, m in PAIRS:
        s = pair_sum(lb, p, m)
        if s > 0:
            w[p] = 0.2
        elif s < 0:
            w[m] = 0.2
        else:
            w[p] = w[m] = 0.1
            zeros += 1
    return w, zeros


def weights_b0(lb: np.ndarray) -> np.ndarray:
    return np.full(10, 0.1)


def build_weights(df: pd.DataFrame, start: str, end: str, n: int):
    months = list(df.index)
    i0, i1 = months.index(start), months.index(end)
    assert i1 - i0 + 1 == n, (start, end, i1 - i0 + 1, n)
    R = df[LEGS].to_numpy()
    W = {"R1": np.zeros((n, 10)), "R2": np.zeros((n, 10)), "B0": np.zeros((n, 10))}
    r2_zero = 0
    for j, i in enumerate(range(i0, i1 + 1)):
        lb = R[i - LOOKBACK : i]  # months i-12..i-1 (signal month t = i-1)
        if np.isnan(lb).any():
            raise SystemExit(f"missing lookback data before {months[i]}")
        W["R1"][j] = weights_r1(lb)
        W["R2"][j], z = weights_r2(lb)
        r2_zero += z
        W["B0"][j] = weights_b0(lb)
    hold = R[i0 : i1 + 1]
    assert not np.isnan(hold).any()
    rf = df["RF"].to_numpy()[i0 : i1 + 1]
    mkt = df["MKT"].to_numpy()[i0 : i1 + 1]
    return months[i0 : i1 + 1], W, hold, rf, mkt, r2_zero


def simulate(W: np.ndarray, R: np.ndarray, cost: float):
    n = W.shape[0]
    gross = np.einsum("ij,ij->i", W, R)
    turn = np.empty(n)
    turn[0] = 1.0
    for i in range(1, n):
        drift = W[i - 1] * (1.0 + R[i - 1]) / (1.0 + gross[i - 1])
        turn[i] = np.abs(W[i] - drift).sum()
    net = (1.0 + gross) * (1.0 - cost * turn) - 1.0
    return net, turn, gross


def sharpe(net: np.ndarray, rf: np.ndarray) -> float:
    ex = net - rf
    return float(ex.mean() / ex.std(ddof=1) * np.sqrt(12.0))


def maxdd(net: np.ndarray) -> float:
    nav = np.concatenate([[1.0], np.cumprod(1.0 + net)])
    peak = np.maximum.accumulate(nav)
    return float((nav / peak - 1.0).min())


def holm(p: dict) -> dict:
    keys = sorted(p, key=lambda k: p[k])
    m = len(keys)
    adj, prev = {}, 0.0
    for r, k in enumerate(keys):
        a = min(1.0, max(prev, (m - r) * p[k]))
        adj[k] = a
        prev = a
    return adj


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", type=Path, default=None)
    args = ap.parse_args()
    sha = verify_inputs()
    global R2_MODE
    sens = {}
    for mode in ("float_sum_diff", "float_diff_sums"):
        R2_MODE = mode
        r = compute(sha, quiet=True)
        c = r["candidates"]["R2"]
        sens[mode] = {"r2_zero_pair_months": {w: r["windows"][w]["r2_exact_zero_pair_months"] for w in r["windows"]},
                      "dS": {w: x["dS"] for w, x in c["sharpe"].items()},
                      "p_raw": c["placebo"]["p_raw"], "p_holm": c["placebo"]["p_holm"],
                      "gates": c["gates"], "verdict": c["verdict"],
                      "R1_p_holm": r["candidates"]["R1"]["placebo"]["p_holm"]}
    R2_MODE = "exact"
    res = compute(sha, quiet=False)
    res["r2_zero_mode"] = "exact (pair sum rounded to 1e-10; inputs have 6 decimals)"
    res["report_r2_float_zero_handling_sensitivity"] = sens
    print("R2 sensitivity (float zero handling):")
    for k, v in sens.items():
        print(f"  {k}: zeros={v['r2_zero_pair_months']} dS_dxus={v['dS']['dxus']:+.6f} "
              f"dS_em={v['dS']['em']:+.6f} dS_h1={v['dS']['dxus_h1']:+.6f} dS_h2={v['dS']['dxus_h2']:+.6f} "
              f"p_raw={v['p_raw']:.6f} p_holm={v['p_holm']:.6f} verdict={v['verdict']}")
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(res, ensure_ascii=False, indent=2, default=float))


def compute(sha: dict, quiet: bool) -> dict:
    res: dict = {"inputs_sha256": sha, "windows": {}, "candidates": {}}
    sims = {}
    for wname, (fname, s, e, n) in WINDOWS.items():
        df = load(fname)
        months, W, R, rf, mkt, r2z = build_weights(df, s, e, n)
        sims[wname] = dict(months=months, W=W, R=R, rf=rf, mkt=mkt)
        res["windows"][wname] = {
            "start": months[0], "end": months[-1], "n": len(months),
            "r2_exact_zero_pair_months": r2z,
            "sharpe_mkt": sharpe(mkt, rf),
        }
        for strat in ("R1", "R2", "B0"):
            for c, tag in ((COST, ""), (COST_HI, "_c03")):
                net, turn, gross = simulate(W[strat], R, c)
                sims[wname][strat + tag] = dict(net=net, turn=turn, gross=gross)

    def half_mask(months, a, b):
        return np.array([a <= m <= b for m in months])

    out_c = {}
    for cand in ("R1", "R2"):
        d: dict = {"sharpe": {}, "maxdd": {}, "annual_turnover": {}, "annual_turnover_ex_first": {},
                   "report_cost_0.3pct_dS": {}, "share_months_selected": {}}
        for wname in WINDOWS:
            S = sims[wname]
            rf = S["rf"]
            sc, sb = sharpe(S[cand]["net"], rf), sharpe(S["B0"]["net"], rf)
            d["sharpe"][wname] = {"cand": sc, "B0": sb, "dS": sc - sb}
            d["maxdd"][wname] = {"cand": maxdd(S[cand]["net"]), "B0": maxdd(S["B0"]["net"])}
            d["annual_turnover"][wname] = {
                "cand": float(S[cand]["turn"].mean() * 12), "B0": float(S["B0"]["turn"].mean() * 12)}
            d["annual_turnover_ex_first"][wname] = {
                "cand": float(S[cand]["turn"][1:].mean() * 12), "B0": float(S["B0"]["turn"][1:].mean() * 12)}
            d["report_cost_0.3pct_dS"][wname] = sharpe(S[cand + "_c03"]["net"], rf) - sharpe(S["B0_c03"]["net"], rf)
            d["share_months_selected"][wname] = dict(zip(LEGS, (S["W"][cand] > 0).mean(axis=0).round(4).tolist()))
        S = sims["dxus"]
        for h, (a, b, n) in HALVES.items():
            mk = half_mask(S["months"], a, b)
            assert mk.sum() == n
            sc = sharpe(S[cand]["net"][mk], S["rf"][mk])
            sb = sharpe(S["B0"]["net"][mk], S["rf"][mk])
            d["sharpe"]["dxus_" + h] = {"cand": sc, "B0": sb, "dS": sc - sb}
            sc3 = sharpe(S[cand + "_c03"]["net"][mk], S["rf"][mk])
            sb3 = sharpe(S["B0_c03"]["net"][mk], S["rf"][mk])
            d["report_cost_0.3pct_dS"]["dxus_" + h] = sc3 - sb3
            d["maxdd"]["dxus_" + h] = {"cand": maxdd(S[cand]["net"][mk]), "B0": maxdd(S["B0"]["net"][mk])}
        # placebo
        dS = d["sharpe"]["dxus"]["dS"]
        sb = d["sharpe"]["dxus"]["B0"]
        Wc = S["W"][cand]
        dk = []
        for k in K_RANGE:
            Wk = np.roll(Wc, k, axis=0)  # row i = original row (i-k) mod n
            net_k, _, _ = simulate(Wk, S["R"], COST)
            dk.append(sharpe(net_k, S["rf"]) - sb)
        dk = np.array(dk)
        cnt = int((dk >= dS).sum())
        d["placebo"] = {"n_shifts": len(dk), "count_ge": cnt, "p_raw": (cnt + 1) / (len(dk) + 1),
                        "dS_k_mean": float(dk.mean()), "dS_k_max": float(dk.max()),
                        "dS_k_min": float(dk.min())}
        out_c[cand] = d

    adj = holm({c: out_c[c]["placebo"]["p_raw"] for c in out_c})
    for cand, d in out_c.items():
        d["placebo"]["p_holm"] = adj[cand]
        sh = d["sharpe"]
        g = {
            "G1": sh["dxus"]["dS"] >= 0.05,
            "G2": adj[cand] <= 0.10,
            "G3": sh["dxus_h1"]["dS"] > 0 and sh["dxus_h2"]["dS"] > 0,
            "G4": sh["em"]["dS"] > 0,
            "G5": sh["us"]["dS"] >= -0.02,
        }
        if all(g.values()):
            v = "通过"
        elif g["G1"] and g["G3"] and g["G4"] and g["G5"] and not g["G2"]:
            v = "方向一致，时机不显著"
        elif g["G1"] and g["G2"] and g["G3"] and g["G4"] and not g["G5"]:
            v = "部分成立（美国不成立）"
        elif sh["dxus"]["dS"] > 0:
            v = "不稳定"
        else:
            v = "不通过"
        d["gates"] = g
        d["verdict"] = v
    res["candidates"] = out_c
    if quiet:
        return res

    for cand, d in out_c.items():
        print(f"== {cand}: {d['verdict']}  gates={d['gates']}")
        for w, x in d["sharpe"].items():
            print(f"  {w:8s} S_c={x['cand']:.6f} S_B0={x['B0']:.6f} dS={x['dS']:+.6f}"
                  f"  dS@0.3%={d['report_cost_0.3pct_dS'][w]:+.6f}")
        for w, x in d["maxdd"].items():
            print(f"  maxDD {w:8s} c={x['cand']:.4f} B0={x['B0']:.4f}")
        for w, x in d["annual_turnover"].items():
            print(f"  turnover/yr {w:5s} c={x['cand']:.4f} B0={x['B0']:.4f}")
        p = d["placebo"]
        print(f"  placebo count_ge={p['count_ge']} p_raw={p['p_raw']:.6f} p_holm={p['p_holm']:.6f}")
    return res


if __name__ == "__main__":
    main()
