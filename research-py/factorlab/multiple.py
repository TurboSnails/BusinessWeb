"""因子挖掘多重检验：有效试验数、紧缩夏普（DSR）、过拟合概率（PBO）、运气过 t≥2。

只读登记簿与月度收益序列，不碰行情。用法：

    cd research-py && uv run python -m factorlab.multiple [--market cn|hk|us|all]
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

from .evaluate import nw_tstat
from .guard import TrialLedger, deflated_sharpe, effective_trials, pbo_cscv

ROOT = Path(__file__).resolve().parents[2]
REPORT_MD = ROOT / "docs/research/factorlab/MULTIPLE-TESTING.md"
REPORT_JSON = ROOT / "docs/research/factorlab/multiple-testing.json"

MARKETS = ("cn", "hk", "us")
MARKET_LABEL = {"cn": "A 股", "hk": "港股", "us": "美股"}

# 预注册三候选（docs/research/factorlab-confirm-2026Q4/PREREG.md）
CANDIDATES = [
    {
        "id": "K1",
        "label": "盈余惊喜",
        "factor": "cn_sue",
        "market": "cn",
        "column": "tmu_cap",
        "source_hash": "5e60044b630a",
        "params_hash": "2f0d6888b739",
        "config_hash": "efc06e526d76",
    },
    {
        "id": "K2",
        "label": "营收惊喜",
        "factor": "cn_sur",
        "market": "cn",
        "column": "tmu_cap",
        "source_hash": "e4013d23f458",
        "params_hash": "8f32cce74a31",
        "config_hash": "efc06e526d76",
    },
    {
        "id": "K3",
        "label": "换手波动",
        "factor": "turnover_vol_20d",
        "market": "cn",
        "column": "tmu_ew",
        "source_hash": "864ea3375908",
        "params_hash": "ba71e90221ca",
        "config_hash": "97643c4fdcb6",
    },
]

# 块自助：月度相关结构下的原假设（均值 = 0）
NULL_BLOCK = 6
NULL_SIMS = 2000
NULL_SEED = 20261127
T_THRESHOLD = 2.0
CORR_THRESHOLD = 0.7
PBO_BLOCKS = 16
DSR_THRESHOLD = 0.95  # 紧缩夏普常用门槛


def cluster_effective_trials(matrix: pd.DataFrame, threshold: float = CORR_THRESHOLD,
                             min_overlap: int = 24) -> dict:
    """按 |相关| 平均连接聚类的有效试验数（与 guard.effective_trials 同一算法，便于单测注入矩阵）。"""
    return effective_trials(matrix=matrix, threshold=threshold, min_overlap=min_overlap)


def explore_matrix(market: str, ledger: TrialLedger | None = None,
                   column: str = "tmu_cap") -> pd.DataFrame:
    """探索区、按写法去重后的月度收益矩阵（挑选发生在探索区）。"""
    return (ledger or TrialLedger()).series_matrix(market, column=column, mode="explore")


def period_sharpe(x: pd.Series | np.ndarray) -> float:
    r = pd.Series(x).dropna()
    if len(r) < 3 or r.std(ddof=1) <= 0:
        return float("nan")
    return float(r.mean() / r.std(ddof=1))


def moments(x: pd.Series | np.ndarray) -> tuple[float, float, float, int]:
    r = pd.Series(x).dropna().to_numpy(float)
    T = len(r)
    if T < 3 or np.std(r, ddof=1) <= 0:
        return float("nan"), float("nan"), float("nan"), T
    return float(r.mean() / np.std(r, ddof=1)), float(stats.skew(r)), float(stats.kurtosis(r, fisher=False)), T


def count_t_ge2(matrix: pd.DataFrame, threshold: float = T_THRESHOLD) -> dict:
    """对每列算 Newey–West t，统计 t ≥ threshold 的个数。"""
    ts = {}
    for c in matrix.columns:
        t = nw_tstat(matrix[c])
        if np.isfinite(t):
            ts[str(c)] = float(t)
    n_pass = int(sum(1 for t in ts.values() if t >= threshold))
    return {"n_pass": n_pass, "n_tested": len(ts), "t_stats": ts}


def null_pass_distribution(matrix: pd.DataFrame, n_sims: int = NULL_SIMS, block: int = NULL_BLOCK,
                           threshold: float = T_THRESHOLD, seed: int = NULL_SEED) -> dict:
    """原假设：真实月均收益 = 0，保留截面相关与大致自相关。

    做法：先对完整重叠子样本去均值，再按块做循环块自助（同一时间索引作用于所有列），
    每次重算 NW t ≥ threshold 的个数。返回均值、分位数与 90% 区间。
    """
    m = matrix.dropna()
    x = m.to_numpy(float)
    T, N = x.shape
    if T < block * 2 or N < 1:
        return {"n_sims": 0, "expected": float("nan"), "p05": float("nan"), "p50": float("nan"),
                "p95": float("nan"), "ci90": [float("nan"), float("nan")], "method": "block_bootstrap"}
    demeaned = x - x.mean(0)
    rng = np.random.default_rng(seed)
    counts = np.empty(n_sims, dtype=float)
    n_blocks = int(math.ceil(T / block))
    for i in range(n_sims):
        starts = rng.integers(0, T, size=n_blocks)
        idx = np.concatenate([np.arange(s, s + block) % T for s in starts])[:T]
        xb = demeaned[idx]
        n_pass = 0
        for j in range(N):
            if nw_tstat(xb[:, j]) >= threshold:
                n_pass += 1
        counts[i] = n_pass
    return {
        "n_sims": n_sims,
        "block": block,
        "seed": seed,
        "expected": float(counts.mean()),
        "p05": float(np.quantile(counts, 0.05)),
        "p50": float(np.quantile(counts, 0.50)),
        "p95": float(np.quantile(counts, 0.95)),
        "ci90": [float(np.quantile(counts, 0.05)), float(np.quantile(counts, 0.95))],
        "method": "block_bootstrap_demeaned",
    }


def _find_candidate_record(ledger: TrialLedger, cand: dict) -> dict | None:
    for r in ledger.trials(cand["market"], mode="explore"):
        if (r.get("factor") == cand["factor"]
                and r.get("params_hash") == cand["params_hash"]
                and r.get("config_hash") == cand["config_hash"]):
            return r
    return None


def candidate_dsr(cand: dict, n_effective: float, sr_var: float,
                  ledger: TrialLedger | None = None) -> dict:
    """按有效试验数校正的紧缩夏普（Deflated Sharpe / DSR）。"""
    ledger = ledger or TrialLedger()
    rec = _find_candidate_record(ledger, cand)
    out = {
        "id": cand["id"],
        "label": cand["label"],
        "factor": cand["factor"],
        "market": cand["market"],
        "column": cand["column"],
        "found": rec is not None,
    }
    if rec is None or not rec.get("series_path"):
        out.update({"dsr": float("nan"), "sr_period": float("nan"), "T": 0, "nw_t": float("nan")})
        return out
    ser = ledger.load_series(rec["series_path"])
    col = cand["column"]
    if col not in ser:
        out.update({"dsr": float("nan"), "sr_period": float("nan"), "T": 0, "nw_t": float("nan")})
        return out
    x = ser[col].dropna()
    sr, skew, kurt, T = moments(x)
    nw = nw_tstat(x)
    dsr = deflated_sharpe(sr, max(n_effective, 1), sr_var, T, skew, kurt) if np.isfinite(sr) else float("nan")
    out.update({
        "series_path": rec["series_path"],
        "source_hash": rec.get("source_hash"),
        "T": T,
        "mean": float(x.mean()),
        "sr_period": sr,
        "skew": skew,
        "kurtosis": kurt,
        "nw_t": nw,
        "n_effective_used": float(n_effective),
        "sr_var": float(sr_var),
        "dsr": float(dsr),
        "stats_tmu_cap_t_nw": (rec.get("stats") or {}).get("tmu_cap_t_nw"),
        "stats_tmu_ew_t_nw": (rec.get("stats") or {}).get("tmu_ew_t_nw"),
    })
    return out


def analyze_market(market: str, ledger: TrialLedger | None = None,
                   n_sims: int = NULL_SIMS) -> dict:
    ledger = ledger or TrialLedger()
    trials_all = ledger.trials(market)
    trials_explore = ledger.latest_by_trial(market, mode="explore")
    n_records = len(trials_all)
    n_explore_raw = len(ledger.trials(market, mode="explore"))
    n_explore_distinct = len(trials_explore)

    mat = explore_matrix(market, ledger, column="tmu_cap")
    eff = cluster_effective_trials(mat)
    # guard 默认：不限 mode，latest_by_trial 可能被验证区同名写法覆盖
    guard_eff = effective_trials(market, ledger)
    guard_note = (
        "本报告只用探索区、按写法去重后的收益序列聚类；"
        "引擎内置口径取各写法「最近一次」的序列"
        "（验证区跑过的会覆盖探索区序列），因此两者的有效试验数可能略有不同。"
    )

    srs = []
    for c in mat.columns:
        s = period_sharpe(mat[c])
        if np.isfinite(s):
            srs.append(s)
    sr_var = float(np.var(srs, ddof=1)) if len(srs) > 2 else float("nan")

    pbo = pbo_cscv(mat, n_blocks=PBO_BLOCKS) if mat.shape[1] >= 2 else {
        "pbo": float("nan"), "n_splits": 0, "T": int(mat.shape[0]), "N": int(mat.shape[1]),
    }
    actual = count_t_ge2(mat)
    null = null_pass_distribution(mat, n_sims=n_sims) if mat.shape[1] >= 1 else {
        "n_sims": 0, "expected": float("nan"), "ci90": [float("nan"), float("nan")],
    }

    return {
        "market": market,
        "label": MARKET_LABEL.get(market, market),
        "n_records": n_records,
        "n_explore": n_explore_raw,
        "n_explore_distinct": n_explore_distinct,
        "n_raw_series": int(eff["n_raw"]),
        "n_effective": int(eff["n_effective"]),
        "guard_n_raw": int(guard_eff["n_raw"]),
        "guard_n_effective": int(guard_eff["n_effective"]),
        "effective_note": guard_note,
        "corr_threshold": CORR_THRESHOLD,
        "sr_var": sr_var,
        "pbo": pbo.get("pbo"),
        "pbo_n_splits": pbo.get("n_splits"),
        "pbo_T": pbo.get("T"),
        "pbo_N": pbo.get("N"),
        "pbo_lambda_median": pbo.get("lambda_median"),
        "t_ge2_actual": actual["n_pass"],
        "t_ge2_tested": actual["n_tested"],
        "t_ge2_expected": null.get("expected"),
        "t_ge2_ci90": null.get("ci90"),
        "t_ge2_null": null,
    }


def analyze_candidates(cn_summary: dict, ledger: TrialLedger | None = None) -> list[dict]:
    ledger = ledger or TrialLedger()
    n_eff = float(cn_summary["n_effective"])
    sr_var = float(cn_summary["sr_var"]) if np.isfinite(cn_summary.get("sr_var", float("nan"))) else None
    # sr_var 缺失时 deflated_sharpe 用 1/(T-1)
    return [candidate_dsr(c, n_eff, sr_var if sr_var and sr_var > 0 else None, ledger) for c in CANDIDATES]


def site_summary(report: dict) -> dict:
    """给网站用的精简摘要（白话字段，避免内部文件名）。"""
    markets = []
    for m in report["markets"]:
        markets.append({
            "market": m["market"],
            "label": m["label"],
            "trials": m["n_explore_distinct"],
            "effectiveTrials": m["n_effective"],
            "pbo": m["pbo"],
            "tGe2Actual": m["t_ge2_actual"],
            "tGe2Expected": m["t_ge2_expected"],
            "tGe2Ci90": m["t_ge2_ci90"],
        })
    cands = []
    for c in report["candidates"]:
        cands.append({
            "id": c["id"],
            "label": c["label"],
            "factor": c["factor"],
            "dsr": c.get("dsr"),
            "nwT": c.get("nw_t"),
            "srPeriod": c.get("sr_period"),
        })
    return {
        "generatedAt": report["generatedAt"],
        "totalTrials": report["total_records"],
        "totalExploreDistinct": report["total_explore_distinct"],
        "markets": markets,
        "candidates": cands,
        "headline": report["headline"],
        "caveat": report["caveat"],
    }


def compose_headline(cn: dict | None, cands: list[dict]) -> tuple[str, str]:
    """结论第一段：「个数是否高于运气」与「挑选本身是否可靠」并列，好坏消息都写。

    返回 (headline, luck_line)。数字全部取自本次计算。
    """
    if not cn or cn.get("t_ge2_actual") is None or not np.isfinite(cn.get("pbo", float("nan"))):
        msg = "数据不足，未能完成 A 股运气对照。"
        return msg, msg
    act, exp, pbo = cn["t_ge2_actual"], cn["t_ge2_expected"], float(cn["pbo"])
    ci = cn.get("t_ge2_ci90") or [float("nan"), float("nan")]
    ci_txt = f"{ci[0]:.0f}–{ci[1]:.0f}"
    luck_line = (
        f"A 股探索区 {act} 个写法的主口径 t 值 ≥ 2；"
        f"若真实收益全为 0、只保留相关结构，预期约 {exp:.1f} 个（90% 区间 {ci_txt}）。"
    )

    if np.isfinite(ci[1]) and act > ci[1]:
        luck = f"A 股过 t 值 ≥ 2 的写法比纯运气多（{act} 个对 {ci_txt}），说明样本里确有规律"
    else:
        luck = f"A 股过 t 值 ≥ 2 的写法（{act} 个）仍落在纯运气区间（{ci_txt}）里，说不上有规律"

    if pbo > 0.5:
        pick = (f"但挑选本身不可靠（A 股过拟合概率 {pbo:.2f}，高于 0.5：样本内最好的写法，"
                "换一段样本后反而常常不如中位数）")
    elif pbo >= 0.4:
        pick = f"但挑选的信息量有限（A 股过拟合概率 {pbo:.2f}，接近 0.5）"
    else:
        pick = f"挑选尚有一定预测力（A 股过拟合概率 {pbo:.2f}，低于 0.5）"

    dsr_vals = [float(c["dsr"]) for c in cands if np.isfinite(c.get("dsr", float("nan")))]
    if dsr_vals:
        lo, hi = min(dsr_vals), max(dsr_vals)
        rng_txt = f"{lo:.2f}" if abs(hi - lo) < 0.005 else f"{lo:.2f}–{hi:.2f}"
        n = len(dsr_vals)
        who = "三个候选" if n == 3 else f"{n} 个候选"
        if hi < DSR_THRESHOLD:
            dsr = (f"{who}的紧缩夏普 {rng_txt} 都低于常用门槛 {DSR_THRESHOLD:.2f}，"
                   "不能排除是挑出来的好看")
        elif lo >= DSR_THRESHOLD:
            dsr = f"{who}的紧缩夏普 {rng_txt} 都达到常用门槛 {DSR_THRESHOLD:.2f}"
        else:
            n_ok = sum(1 for v in dsr_vals if v >= DSR_THRESHOLD)
            dsr = (f"{who}的紧缩夏普 {rng_txt}，只有 {n_ok} 个达到常用门槛 {DSR_THRESHOLD:.2f}，"
                   "其余不能排除是挑出来的好看")
    else:
        dsr = "候选的紧缩夏普未能算出"

    headline = f"{luck}；{pick}，{dsr}；能不能用，只看 12 月锁箱确认和前推。"
    return headline, luck_line


def build(markets: tuple[str, ...] = MARKETS, n_sims: int = NULL_SIMS,
          ledger: TrialLedger | None = None) -> dict:
    ledger = ledger or TrialLedger()
    per = [analyze_market(m, ledger, n_sims=n_sims) for m in markets]
    cn = next((m for m in per if m["market"] == "cn"), None)
    cands = analyze_candidates(cn, ledger) if cn else []
    total_records = sum(m["n_records"] for m in per)
    total_explore = sum(m["n_explore_distinct"] for m in per)

    headline, luck_line = compose_headline(cn, cands)

    return {
        "generatedAt": pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds"),
        "total_records": total_records,
        "total_explore_distinct": total_explore,
        "markets": per,
        "candidates": cands,
        "headline": headline,
        "luck_line": luck_line,
        "caveat": (
            "有效试验数按月度收益 |相关|>0.7 聚类，不是独立试验的精确等价；"
            "过拟合概率用组合对称交叉验证，列数少或重叠期短时不稳定；"
            "运气模拟保留了截面相关与块自相关，但把真实效应一律当成 0，且未模拟选股规则本身。"
        ),
        "method": {
            "effective_trials": "average-linkage |corr| clustering, cut at 0.7",
            "dsr": "Bailey–López de Prado Deflated Sharpe, N = explore effective trials",
            "pbo": "CSCV Bailey et al. 2017, n_blocks=16",
            "null_t_ge2": "demeaned circular block bootstrap, block=6, NW t≥2",
        },
    }


def _fmt(x, nd=2):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return "—"
    return f"{x:.{nd}f}"


def _dsr_gate_note(cands: list[dict]) -> str:
    vals = [float(c["dsr"]) for c in cands if np.isfinite(c.get("dsr", float("nan")))]
    if not vals:
        return "候选紧缩夏普未能算出。"
    n_ok = sum(1 for v in vals if v >= DSR_THRESHOLD)
    if n_ok == 0:
        return f"{len(vals)} 个候选都没到。"
    if n_ok == len(vals):
        return f"{len(vals)} 个候选都达到。"
    return f"{len(vals)} 个候选中 {n_ok} 个达到。"


def render_markdown(report: dict) -> str:
    lines = [
        "# 因子挖掘多重检验总报告",
        "",
        f"生成于 {report['generatedAt']}。只读登记簿，可复现：",
        "`cd research-py && uv run python -m factorlab.multiple`。",
        "",
        "## 先说结论",
        "",
        report["headline"],
        "",
        report["luck_line"],
        "",
        f"三市场登记记录合计 **{report['total_records']}** 次，"
        f"探索区去重后 **{report['total_explore_distinct']}** 种写法。",
        "",
        "## 各市场：试了多少次、有多少「独立」",
        "",
        "| 市场 | 登记次数 | 探索区去重 | 有效试验数（本报告） | 有效试验数（引擎内置口径） | 过拟合概率 PBO | t 值 ≥ 2 的写法 | 运气预期（90% 区间） |",
        "|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    for m in report["markets"]:
        ci = m.get("t_ge2_ci90") or [None, None]
        lines.append(
            f"| {m['label']} | {m['n_records']} | {m['n_explore_distinct']} | {m['n_effective']} | "
            f"{m['guard_n_effective']} | {_fmt(m['pbo'], 3)} | {m['t_ge2_actual']} | "
            f"{_fmt(m['t_ge2_expected'], 1)}（{_fmt(ci[0], 0)}–{_fmt(ci[1], 0)}） |"
        )
    lines += [
        "",
        "### 有效试验数口径说明",
        "",
        report["markets"][0]["effective_note"] if report["markets"] else "",
        "",
        "「有效试验数」：把各写法的月度超额收益序列两两算相关系数，"
        f"|相关| > {CORR_THRESHOLD} 的并成一簇，簇数即有效试验数"
        "（方向相反但同步的信号算同一簇）。它小于「登记次数」，因为很多写法其实在测同一件事。",
        "",
        "「过拟合概率」（PBO）：把样本拆成许多半半组合，"
        "看「样本内夏普最好的写法」在样本外是否常常差于中位数；接近 0.5 表示挑选几乎无预测力，"
        "明显低于 0.5 才说明样本内冠军样本外仍倾向更好。",
        "",
        "## 三个锁箱候选的紧缩夏普（DSR）",
        "",
        "紧缩夏普：先算这个写法本身的夏普有多「像样」，再扣掉「试了这么多次以后、纯运气也能摸到的最好水平」。"
        f"越接近 1 越像真有货；常用门槛 {DSR_THRESHOLD:.2f}，{_dsr_gate_note(report['candidates'])}"
        "校正用的试验次数 = A 股探索区有效试验数。",
        "",
        "| 候选 | 判定序列 | 期数 | 每期夏普 | t 值（Newey–West） | 有效 N | DSR |",
        "|---|---|---:|---:|---:|---:|---:|",
    ]
    for c in report["candidates"]:
        col = "市值加权超额" if c["column"] == "tmu_cap" else "等权超额"
        lines.append(
            f"| {c['id']} {c['label']}（{c['factor']}） | {col} | {c.get('T', 0)} | "
            f"{_fmt(c.get('sr_period'), 4)} | {_fmt(c.get('nw_t'), 2)} | "
            f"{_fmt(c.get('n_effective_used'), 0)} | {_fmt(c.get('dsr'), 3)} |"
        )

    # 手工核对：抽 K1
    hand = next((c for c in report["candidates"] if c["id"] == "K1"), None)
    if hand and hand.get("found"):
        lines += [
            "",
            "### 手工核对（K1 盈余惊喜）",
            "",
            f"- 序列列 `tmu_cap`，T = {hand['T']}，"
            f"mean = {hand['mean']:.6f}，每期夏普 sr = mean/std = {hand['sr_period']:.6f}。",
            f"- NW t（与登记簿 `tmu_cap_t_nw`）= {hand['nw_t']:.6f}"
            f"（登记 {hand.get('stats_tmu_cap_t_nw')}）。",
            f"- 有效试验数 N_eff = {hand['n_effective_used']:.0f}，"
            f"各写法夏普样本方差 sr_var = {hand['sr_var']:.6f}。",
            f"- DSR = Φ( (sr − E[max SR | N_eff, sr_var]) · √(T−1) / √(1 − skew·sr + (kurt−1)/4 · sr²) )"
            f" = **{hand['dsr']:.6f}**。",
            "",
            "复现：`uv run python -c \"from factorlab.multiple import build; "
            "print(build()['candidates'][0]['dsr'])\"`。",
        ]

    lines += [
        "",
        "## 「靠运气能过 t 值 ≥ 2」的预期",
        "",
        "原假设：所有写法的真实月均超额 = 0，但截面相关、块内自相关与各写法波动率与数据里看到的一样。"
        f"对去均值后的收益矩阵做循环块自助（块长 {NULL_BLOCK} 个月，{NULL_SIMS} 次），"
        "每次数有多少列的 Newey–West t ≥ 2，得到预期个数与 90% 区间；再与探索区实际个数对比。",
        "",
    ]
    for m in report["markets"]:
        lines.append(
            f"- **{m['label']}**：实际 {m['t_ge2_actual']} / {m['t_ge2_tested']}；"
            f"运气预期 {_fmt(m['t_ge2_expected'], 2)}，"
            f"90% 区间 {_fmt((m.get('t_ge2_ci90') or [None, None])[0], 0)}"
            f"–{_fmt((m.get('t_ge2_ci90') or [None, None])[1], 0)}。"
        )

    lines += [
        "",
        "## 局限",
        "",
        report["caveat"],
        "",
        "- 港股、美股个股数据有幸存者偏差，PBO / t 计数不能单独当采用依据。",
        "- 锁箱确认尚未解封；本报告只回答「样本内挖出来的东西有多像运气」，不替代预注册门槛。",
        "- K3 换手波动的判定口径是等权超额（事后想到的口径），DSR 用该序列；有效 N 仍按主口径矩阵聚类。",
        "",
        "## 参考",
        "",
        "- Bailey & López de Prado, *The Deflated Sharpe Ratio*",
        "- Bailey et al., *The Probability of Backtest Overfitting*（CSCV）",
        "- 本仓库宏观攻守过拟合审计：`docs/research/overfit-audit-2026-11-26/`",
        "",
    ]
    return "\n".join(lines)


def write_outputs(report: dict, md_path: Path = REPORT_MD, json_path: Path = REPORT_JSON) -> None:
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(render_markdown(report), encoding="utf-8")
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="因子挖掘多重检验总报告")
    p.add_argument("--market", choices=[*MARKETS, "all"], default="all")
    p.add_argument("--sims", type=int, default=NULL_SIMS, help="原假设块自助次数")
    p.add_argument("--json-only", action="store_true", help="只打印 JSON，不写 Markdown")
    args = p.parse_args(argv)
    markets = MARKETS if args.market == "all" else (args.market,)
    report = build(markets=markets, n_sims=args.sims)
    if not args.json_only:
        write_outputs(report)
        print(f"已写 {REPORT_MD.relative_to(ROOT)} 与 {REPORT_JSON.relative_to(ROOT)}")
    print(json.dumps(site_summary(report), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
