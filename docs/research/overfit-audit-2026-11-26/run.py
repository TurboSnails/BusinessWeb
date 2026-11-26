"""L-028 过拟合审计：按 PREREG.md 计算 T1 DSR / MinTRL、T2 SPA / StepM、T3 MCS、T4 PBO。

用开源统计库 arch（SPA、StepM、MCS、平稳自助法、Politis–White 块长）与 scipy。
收益用 research-py/engines/e1.py 的 E1 口径（同一份输入与成交规则），这里把逐期收益按仓位查表向量化。
用法：cd research-py && uv run python ../docs/research/overfit-audit-2026-11-26/run.py
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from itertools import combinations
from pathlib import Path

import numpy as np
from scipy import stats

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "research-py"))
from engines import e1  # noqa: E402
from arch.bootstrap import MCS, SPA, StepM, optimal_block_length  # noqa: E402

SEED = 20261126
REPS = 10_000
EULER = 0.5772156649015329
N_MAIN = 86
N_SENS = [1, 10, 30, 86, 150]
BLOCK_FLOOR = 12
BLOCK_SENS = 24
BLOCKS = 16


# ---------- E1 收益 ----------
def period_returns(inp, periods, weights: list[float]) -> dict[float, np.ndarray]:
    """每个仓位值在每期的毛收益（期内每日再平衡，与 e1.simulate 相同）。"""
    closes = inp.closes.to_numpy()
    out = {w: np.empty(len(periods)) for w in weights}
    for j, p in enumerate(periods.itertuples(index=False)):
        idx = np.arange(p.i0 + 1, p.i1 + 1)
        stock = closes[idx] / closes[idx - 1] - 1 + p.div / p.n
        for w in weights:
            out[w][j] = float(np.prod(1 + w * stock + (1 - w) * p.cash / p.n)) - 1
    return out


def net_series(weight_path: np.ndarray, gross_of: dict[float, np.ndarray]) -> np.ndarray:
    gross = np.array([gross_of[w][j] for j, w in enumerate(weight_path)])
    trade = np.concatenate([[0.0], np.abs(np.diff(weight_path))])
    return (1 + gross) * (1 - e1.COST * trade) - 1, gross


def sharpe_annual(x: np.ndarray) -> float:
    return float(math.sqrt(12) * x.mean() / x.std(ddof=1))


# ---------- T1 ----------
def expected_max_ir(n: int, t: int) -> float:
    if n <= 1:
        return 0.0
    z = (1 - EULER) * stats.norm.ppf(1 - 1 / n) + EULER * stats.norm.ppf(1 - 1 / (n * math.e))
    return math.sqrt(1 / (t - 1)) * z


def moments(d: np.ndarray) -> tuple[float, float, float]:
    return float(d.mean() / d.std(ddof=1)), float(stats.skew(d, bias=True)), float(stats.kurtosis(d, fisher=False, bias=True))


def min_trl(ir: float, ir_star: float, g3: float, g4: float) -> float | None:
    if ir <= ir_star:
        return None
    return 1 + (1 - g3 * ir + (g4 - 1) / 4 * ir**2) * (1.645 / (ir - ir_star)) ** 2


def dsr(d: np.ndarray, n: int, sd_trials: float | None = None) -> dict:
    t = len(d)
    ir, g3, g4 = moments(d)
    ir_star = expected_max_ir(n, t) if sd_trials is None else (0.0 if n <= 1 else sd_trials * expected_max_ir(n, t) * math.sqrt(t - 1))
    denom = math.sqrt(1 - g3 * ir + (g4 - 1) / 4 * ir**2)
    value = float(stats.norm.cdf((ir - ir_star) * math.sqrt(t - 1) / denom))
    m = min_trl(ir, ir_star, g3, g4)
    return {"N": n, "irStar": ir_star, "dsr": value, "minTRL": m, "minTRLYears": None if m is None else m / 12}


def long_run_sd(x: np.ndarray, b: int) -> np.ndarray:
    """平稳自助核的长期标准差（与 arch SPA nested=False 的方差公式相同）。"""
    t = x.shape[0]
    p = 1.0 / b
    dm = x - x.mean(0)
    var = (dm**2).sum(0) / t
    for i in range(1, t):
        kappa = (1 - i / t) * (1 - p) ** i + (i / t) * (1 - p) ** (t - i)
        var += 2 * kappa * (dm[: t - i] * dm[i:]).sum(0) / t
    return np.sqrt(var)


# ---------- T4 ----------
def block_bounds(t: int, s: int) -> list[tuple[int, int]]:
    base, extra = divmod(t, s)
    bounds, start = [], 0
    for i in range(s):
        size = base + (1 if i < extra else 0)
        bounds.append((start, start + size))
        start += size
    return bounds


def pbo(x: np.ndarray, track: int | None = None) -> dict:
    """CSCV：x 为 T×N 超额收益矩阵；样本内按夏普选最优，看样本外排名。"""
    t, n = x.shape
    bounds = block_bounds(t, BLOCKS)
    s1 = np.array([x[a:b].sum(0) for a, b in bounds])
    s2 = np.array([(x[a:b] ** 2).sum(0) for a, b in bounds])
    cnt = np.array([b - a for a, b in bounds], dtype=float)

    def sr(sel):
        m = cnt[sel].sum()
        mu = s1[sel].sum(0) / m
        var = (s2[sel].sum(0) - m * mu**2) / (m - 1)
        return mu / np.sqrt(var)

    lam, degr, track_w = [], [], []
    all_blocks = set(range(BLOCKS))
    for is_set in combinations(range(BLOCKS), BLOCKS // 2):
        is_idx = list(is_set)
        oos_idx = sorted(all_blocks - set(is_set))
        is_sr, oos_sr = sr(is_idx), sr(oos_idx)
        best = int(np.argmax(is_sr))
        ranks = stats.rankdata(oos_sr, method="average")
        w = ranks[best] / (n + 1)
        lam.append(math.log(w / (1 - w)))
        degr.append(math.sqrt(12) * (oos_sr[best] - np.median(oos_sr)))
        if track is not None:
            track_w.append(ranks[track] / (n + 1))
    lam = np.array(lam)
    return {
        "combinations": len(lam), "columns": n, "pbo": float((lam <= 0).mean()),
        "lambdaMedian": float(np.median(lam)),
        "oosSharpeGapMedian": float(np.median(degr)),
        "trackHalfRankMedian": None if track is None else float(np.median(track_w)),
    }


def main() -> None:
    raw = (HERE / "tiers.json").read_bytes()
    spec = json.loads(raw)
    months = spec["months"]
    equity = [t["equityShare"] for t in spec["tiers"]]
    inp = e1.load_inputs()
    periods = e1.build_periods(inp)
    signals = list(periods["signal"])
    pos = [months.index(s) for s in signals]

    def weights_of(cfg) -> np.ndarray:
        codes = [cfg["tiers"][i] for i in pos]
        if cfg["id"] == "S4":
            return np.array([1.0 if c == "1" else 0.5 for c in codes])
        return np.array([equity[int(c)] for c in codes])

    gross_of = period_returns(inp, periods, sorted(set(equity) | {0.5, 1.0}))
    cash = periods["cash"].to_numpy()

    # 复现门槛：现行档位的 E1 毛夏普
    s0 = next(c for c in spec["configs"] if c["id"] == "S0")
    assert all(e1.EQUITY[t] == equity[int(c)] for t, c in zip(periods["tier"], (s0["tiers"][i] for i in pos)))
    net0, gross0 = net_series(weights_of(s0), gross_of)
    rep = {"gross": sharpe_annual(gross0 - cash), "net": sharpe_annual(net0 - cash)}
    if abs(rep["gross"] - 0.592877) >= 1e-6 or abs(rep["net"] - 0.585767) >= 1e-6:
        raise SystemExit(f"E1 复现失败：{rep}")

    # 去重：按前 644 个月的档位串，保留首个（S 族在前）
    seen, configs = {}, []
    for c in spec["configs"]:
        key = c["tiers"][: len(signals)]
        if key in seen:
            seen[key].append(c["id"])
            continue
        seen[key] = [c["id"]]
        configs.append(c)
    dupes = {v[0]: v[1:] for v in seen.values() if len(v) > 1}
    spec = {**spec, "configs": configs}
    ids = [c["id"] for c in spec["configs"]]
    fam = {c["id"]: c["family"] for c in spec["configs"]}
    X = np.column_stack([net_series(weights_of(c), gross_of)[0] - cash for c in spec["configs"]])
    xb = gross_of[1.0] - cash  # 基准：恒定 100%，无换手
    sd_b = xb.std(ddof=1)
    Xt = X * (sd_b / X.std(axis=0, ddof=1))
    D = Xt - xb[:, None]
    T = len(xb)

    k0 = ids.index("S0")
    block_table = optimal_block_length(np.column_stack([xb, D[:, k0]]))
    block_pw = int(math.ceil(float(block_table["stationary"].max())))
    block = max(block_pw, BLOCK_FLOOR)

    # T1
    p_idx = [i for i, c in enumerate(ids) if fam[c] == "P"]
    ir_p = D[:, p_idx].mean(0) / D[:, p_idx].std(0, ddof=1)
    ir0, g3, g4 = moments(D[:, k0])
    star86 = expected_max_ir(N_MAIN, T)
    ir_fwd = max(ir0 - star86, 0.5 * ir0)
    fwd = min_trl(ir_fwd, 0.0, g3, g4)
    t1 = {
        "ir": float(D[:, k0].mean() / D[:, k0].std(ddof=1)),
        "irAnnual": float(math.sqrt(12) * D[:, k0].mean() / D[:, k0].std(ddof=1)),
        "skew": float(stats.skew(D[:, k0])), "kurtosis": float(stats.kurtosis(D[:, k0], fisher=False)),
        "sharpe": {"S0": sharpe_annual(X[:, k0]), "benchmark": sharpe_annual(xb)},
        "byN": [dsr(D[:, k0], n) for n in N_SENS],
        "crossSectional": {"sdIrP": float(ir_p.std(ddof=1)), **dsr(D[:, k0], N_MAIN, sd_trials=float(ir_p.std(ddof=1)))},
        "forward": {"irUsed": ir_fwd, "months": fwd, "years": None if fwd is None else fwd / 12,
                    "optimisticYears": min_trl(ir0, 0.0, g3, g4) / 12},
    }
    main_dsr = next(r for r in t1["byN"] if r["N"] == N_MAIN)["dsr"]
    t1["verdict"] = "算上挑选次数后仍显著" if main_dsr >= 0.95 else "方向可信，但算上挑选次数后不显著" if main_dsr >= 0.80 else "算上挑选次数后，不能排除优势来自挑选"

    # T2：去掉完全相同的差分列
    _, uniq = np.unique(np.round(D, 14), axis=1, return_index=True)
    uniq = np.sort(uniq)
    if len(uniq) != len(ids):
        raise SystemExit("去重后仍有相同的差分列")

    def spa_stepm(b: int) -> dict:
        losses = -D / long_run_sd(D, b)
        spa = SPA(benchmark=np.zeros(T), models=losses, block_size=b, reps=REPS, bootstrap="stationary", nested=False, seed=SEED)
        spa.compute()
        stepm = StepM(benchmark=np.zeros(T), models=losses, size=0.05, block_size=b, reps=REPS, bootstrap="stationary", nested=False, seed=SEED)
        stepm.compute()
        better = [ids[int(c)] for c in stepm.superior_models]
        pv = spa.pvalues
        return {
            "blockSize": b,
            "spa": {"lower": float(pv["lower"]), "consistent": float(pv["consistent"]), "upper": float(pv["upper"])},
            "stepmBetter": len(better), "s0InStepm": "S0" in better,
            "stepmBetterSFamily": sorted(x for x in better if fam[x] == "S"),
            "stepmBetterP": sum(fam[x] == "P" for x in better),
        }

    t2 = {"members": len(ids), "reps": REPS, **spa_stepm(block), "sensitivity": spa_stepm(BLOCK_SENS)}
    if t2["spa"]["consistent"] < 0.05:
        only_s4 = t2["stepmBetter"] > 0 and t2["stepmBetterSFamily"] == ["S4"] and t2["stepmBetterP"] == 0
        t2["verdict"] = "只有单纯十个月均线显著，不支持宏观打分" if only_s4 else "在整个参数邻域与结构备选里，至少有一种写法在校正挑选后显著优于同波动的恒定仓位"
    else:
        t2["verdict"] = "校正挑选后，没有一种写法显著优于同波动的恒定仓位"

    # T3
    s_ids = ["S0", "S1", "S2", "S3", "S4"]
    mcs_losses = np.column_stack([-Xt[:, ids.index(i)] for i in s_ids] + [-xb])
    names = s_ids + ["B"]
    def run_mcs(b: int) -> tuple[list[str], dict]:
        mcs = MCS(mcs_losses, size=0.10, reps=REPS, block_size=b, method="R", bootstrap="stationary", seed=SEED)
        mcs.compute()
        inc = sorted(names[int(i)] for i in mcs.included)
        pv = {names[int(i)]: float(p) for i, p in zip(mcs.pvalues.index, mcs.pvalues.iloc[:, 0])}
        return inc, pv

    included, pvals = run_mcs(block)
    inc24, pv24 = run_mcs(BLOCK_SENS)
    if "S0" not in included:
        v3 = "现行写法劣于集中成员：" + "、".join(included)
    elif "B" in included or "S4" in included:
        v3 = "与恒定仓位 / 单纯十个月均线同在 90% 最优集，不能排除一样好"
    else:
        v3 = "宏观写法有统计增量"
        if any(x in included for x in ("S1", "S2", "S3")):
            v3 += "；附加层（熔断、均线修正、修复确认）与更简的写法不可区分"
    t3 = {"included": included, "pvalues": pvals, "verdict": v3, "sensitivity": {"blockSize": BLOCK_SENS, "included": inc24, "pvalues": pv24},
          "sharpe": {i: sharpe_annual(X[:, ids.index(i)]) for i in s_ids} | {"B": sharpe_annual(xb)}}

    # T4
    p_cols = [i for i, c in enumerate(ids) if fam[c] == "P"]
    # 现行参数（P0000 与 S0 相同，去重时保留了 S0）在各半样本的名次：把 S0 放进 P 族矩阵的第一列
    t4p = pbo(np.column_stack([X[:, k0], X[:, p_cols]]), track=0)
    s_cols = [ids.index(i) for i in s_ids]
    t4s = pbo(X[:, s_cols], track=0)
    p = t4p["pbo"]
    t4p["verdict"] = "低" if p <= 0.20 else "中等" if p <= 0.50 else "高"

    out = {
        "study": "L-028", "inputSha256": {"tiers.json": hashlib.sha256(raw).hexdigest()},
        "e1Reproduction": rep, "periods": T, "blockTable": block_table.to_dict(), "blockPW": block_pw, "block": block,
        "duplicates": dupes, "members": {"all": len(ids), "P": len(p_cols) + 1},
        "T1": t1, "T2": t2, "T3": t3, "T4": {"P": t4p, "S": t4s},
    }
    (HERE / "results.json").write_text(json.dumps(out, ensure_ascii=False, indent=2, default=float) + "\n", encoding="utf-8")
    print(json.dumps({k: out[k] for k in ("T1", "T2", "T3")}, ensure_ascii=False, indent=1, default=float))
    print(json.dumps(out["T4"], ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
