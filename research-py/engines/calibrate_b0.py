"""路线图 4.1：只用对照组 B0（现行 v2.2 × 上限 80% + 现金，E1 口径）估计尾部指标的抽样误差，用来定预注册里的尾部门槛。

只涉及已经看过的 B0，不计算任何候选。输出 docs/research/multi-asset-2026-11-25/calibration.json。
用法（在 research-py/ 下）：uv run python -m engines.calibrate_b0
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from engines import e1

OUT = e1.REPO / "docs/research/multi-asset-2026-11-25/calibration.json"
CAP = 0.8
SEED = 20261125
DRAWS = 10000
BLOCK = 12
SEGMENTS = {"train": ("1976-01", "1999-12"), "valid": ("2000-01", "2026-08")}


def cvar5(returns: np.ndarray) -> float:
    """每期收益最差 5% 的平均值（取正数表示损失大小）。"""
    k = max(1, int(np.ceil(0.05 * len(returns))))
    return float(-np.sort(returns)[:k].mean())


def deepest3(returns: np.ndarray) -> float:
    """按每期净值划分互不重叠的回撤段，取最深 3 段的平均深度（正数）。"""
    nav = np.concatenate([[1.0], np.cumprod(1 + returns)])
    peak = np.maximum.accumulate(nav)
    dd = nav / peak - 1
    depths, cur = [], 0.0
    for i in range(1, len(nav)):
        if dd[i] < 0:
            cur = min(cur, dd[i])
        if dd[i] == 0 and cur < 0:
            depths.append(-cur)
            cur = 0.0
    if cur < 0:
        depths.append(-cur)
    depths = sorted(depths, reverse=True) + [0.0, 0.0, 0.0]
    return float(np.mean(depths[:3]))


def block_bootstrap(x: np.ndarray, stat, rng) -> np.ndarray:
    n = len(x)
    out = np.empty(DRAWS)
    for b in range(DRAWS):
        idx = []
        while len(idx) < n:
            s = rng.integers(0, n)
            idx.extend(((s + np.arange(BLOCK)) % n).tolist())
        out[b] = stat(x[np.array(idx[:n])])
    return out


def main() -> None:
    inp = e1.load_inputs()
    result = {"cap": CAP, "block": BLOCK, "draws": DRAWS, "seed": SEED, "note": "只含 B0；尾部门槛 = max(10%, 1 个相对标准误)", "segments": {}}
    rng = np.random.default_rng(SEED)
    for name, (first, last) in SEGMENTS.items():
        periods = e1.build_periods(inp, first=first, last=last)
        _, per = e1.simulate(inp, periods, weight_of=lambda p: p.weight * CAP)
        r = per["net"].to_numpy()
        seg = {"periods": int(len(r))}
        for label, stat in [("cvar5", cvar5), ("deepest3", deepest3)]:
            point = stat(r)
            boots = block_bootstrap(r, stat, rng)
            rel_se = float(boots.std(ddof=1) / point)
            seg[label] = {"point": point, "se": float(boots.std(ddof=1)), "relSe": rel_se, "threshold": max(0.10, rel_se)}
        result["segments"][name] = seg
    # 预注册用一个统一门槛：两段、两项里最大的那个
    result["tailThreshold"] = max(s[k]["threshold"] for s in result["segments"].values() for k in ("cvar5", "deepest3"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name, seg in result["segments"].items():
        for k in ("cvar5", "deepest3"):
            v = seg[k]
            print(f"{name} {k:9s} 点估计 {v['point'] * 100:.2f}%  标准误 {v['se'] * 100:.2f}%  相对 {v['relSe'] * 100:.1f}%  门槛 {v['threshold'] * 100:.1f}%")
    print(f"统一尾部门槛：{result['tailThreshold'] * 100:.1f}%")


if __name__ == "__main__":
    main()
