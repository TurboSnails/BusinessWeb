"""锁箱确认的功效估计：只用 2023-10 以前的冻结输入（解封前运行）。
在样本内用所有 35 个月滚动窗口（逐月平移）看 ΔS 的分布，估计 35 个月锁箱里 ΔS 的抽样波动；
再假设真实效应 = 样本内全窗口 ΔS 的一半（收缩），算「锁箱 ΔS ≥ 门槛」与「ΔS > 0」的概率（正态近似）。
    cd research-py && uv run python ../docs/research/style-rotation-2026-11-28/confirm/power.py
"""
from __future__ import annotations

import json
import sys
from math import erf, sqrt
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import run as R  # noqa: E402

N = 35
Phi = lambda z: 0.5 * (1 + erf(z / sqrt(2)))


def series(mk: str) -> dict:
    df = R.load(mk)
    ms = R.months_of(df, *R.WIN[mk])
    rf = df.loc[ms, "RF"].to_numpy()
    out = {"rf": rf, "MKT": df.loc[ms, "MKT"].to_numpy()}
    for k in ("B0", "R1", "R2"):
        out[k] = R.simulate(R.weights(df, k, ms), df)[0]
    W = pd.DataFrame(0.0, index=ms, columns=R.LEGS)
    W[["V+", "M+", "P+", "I+", "S+"]] = 0.2
    out["K3"] = R.simulate(W, df)[0]
    return out


def main() -> None:
    res = {}
    for mk in R.WIN:
        s = series(mk)
        rf = s["rf"]
        for cand, base in (("R1", "B0"), ("R2", "B0"), ("K3", "MKT"), ("R1", "K3")):
            full = R.sharpe(s[cand], rf) - R.sharpe(s[base], rf)
            d = np.array([R.sharpe(s[cand][i:i + N], rf[i:i + N]) - R.sharpe(s[base][i:i + N], rf[i:i + N])
                          for i in range(len(rf) - N + 1)])
            sd = float(d.std(ddof=1))
            true = full / 2
            thr = full / 2
            res[f"{mk}:{cand}-{base}"] = {"full": full, "sd35": sd, "P(dS>=half)": 1 - Phi((thr - true) / sd),
                                          "P(dS>0)": 1 - Phi((0 - true) / sd), "share_windows_pos": float((d > 0).mean())}
    (HERE / "power.json").write_text(json.dumps(res, indent=2, ensure_ascii=False) + "\n")
    for k, v in res.items():
        print(f"{k:16s} full {v['full']:+.3f}  sd35 {v['sd35']:.3f}  P(>0|true=half) {v['P(dS>0)']:.2f}  in-sample 35m windows >0 {v['share_windows_pos']:.2f}")


if __name__ == "__main__":
    main()
