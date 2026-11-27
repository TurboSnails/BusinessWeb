"""L-042 锁箱确认计算（PREREG-confirm.md，提交 5f960728）。规则复用 run.py，不改参数。
    cd research-py && uv run python ../docs/research/style-rotation-2026-11-28/confirm/run_confirm.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import run as R  # noqa: E402

HOLD = ("2023-11", "2026-09")
INSAMPLE = {"R1": {"dxus": 0.0950688, "em": 0.0881890, "us": 0.0854170}, "R2": {"dxus": 0.0580540, "em": 0.0684730, "us": 0.0629520}}


def load(mk: str) -> pd.DataFrame:
    return pd.read_csv(HERE / f"legs_{mk}_full.csv", index_col="month")


def block_p(diff_fn, n: int, B: int = 5000, block: int = 6, seed: int = 42) -> float:
    """平稳块自助（报告项）：对月份下标重抽样，p = P(ΔS* ≤ 0)。"""
    rng = np.random.default_rng(seed)
    cnt = 0
    for _ in range(B):
        idx = []
        while len(idx) < n:
            s = rng.integers(0, n)
            idx.extend(((s + np.arange(block)) % n).tolist())
        cnt += diff_fn(np.array(idx[:n])) <= 0
    return (cnt + 1) / (B + 1)


def main() -> None:
    res = {"hold": HOLD, "markets": {}}
    for mk in ("dxus", "em", "us"):
        df = load(mk)
        ms = R.months_of(df, *HOLD)
        assert len(ms) == 35
        rf = df.loc[ms, "RF"].to_numpy()
        nets = {"MKT": df.loc[ms, "MKT"].to_numpy()}
        nets3 = {}
        for k in ("B0", "R1", "R2"):
            W = R.weights(df, k, ms)
            nets[k], _ = R.simulate(W, df)
            nets3[k], _ = R.simulate(W, df, cost=0.003)
            if k != "B0":
                res.setdefault("share", {}).setdefault(mk, {})[k] = {c: float((W[c] > 0).mean()) for c in R.LEGS}
        Ws = pd.DataFrame(0.0, index=ms, columns=R.LEGS)
        Ws[["V+", "M+", "P+", "I+", "S+"]] = 0.2
        nets["STATIC"], _ = R.simulate(Ws, df)
        o = {k: {"sharpe": R.sharpe(v, rf), "cum": float(np.prod(1 + v) - 1), "maxDd": R.maxdd(v)} for k, v in nets.items()}
        for k in ("R1", "R2"):
            o[k]["dS"] = o[k]["sharpe"] - o["B0"]["sharpe"]
            o[k]["dS_static"] = o[k]["sharpe"] - o["STATIC"]["sharpe"]
            o[k]["dS_cost03"] = R.sharpe(nets3[k], rf) - R.sharpe(nets3["B0"], rf)
            o[k]["p_boot"] = block_p(lambda i, k=k: R.sharpe(nets[k][i], rf[i]) - R.sharpe(nets["B0"][i], rf[i]), 35)
        o["STATIC"]["dS_mkt"] = o["STATIC"]["sharpe"] - o["MKT"]["sharpe"]
        res["markets"][mk] = o
    verdicts = {}
    ps = {k: res["markets"]["dxus"][k]["p_boot"] for k in ("R1", "R2")}
    order = sorted(ps, key=ps.get)
    holm, run_ = {}, 0.0
    for i, k in enumerate(order):
        run_ = max(run_, min(1.0, (2 - i) * ps[k]))
        holm[k] = run_
    for k in ("R1", "R2"):
        avg = float(np.mean([res["markets"][m][k]["dS"] for m in ("dxus", "em", "us")]))
        thr = float(np.mean(list(INSAMPLE[k].values()))) / 4
        c1 = avg >= thr
        c2 = res["markets"]["dxus"][k]["dS"] > 0
        v = "锁箱确认" if c1 and c2 else ("方向一致，幅度不足" if avg > 0 else "锁箱未确认")
        verdicts[k] = {"avg_dS": avg, "threshold": thr, "C1": c1, "C2": c2, "verdict": v, "p_boot_dxus": ps[k], "p_holm": holm[k]}
    res["verdicts"] = verdicts
    (HERE / "results.json").write_text(json.dumps(res, indent=2, ensure_ascii=False, default=float) + "\n")
    for mk, o in res["markets"].items():
        print(mk, {k: (round(v["sharpe"], 3), f"{v['cum']:+.1%}") for k, v in o.items()},
              "dS", {k: round(o[k]["dS"], 3) for k in ("R1", "R2")}, "vs static", {k: round(o[k]["dS_static"], 3) for k in ("R1", "R2")},
              "static-mkt", round(o["STATIC"]["dS_mkt"], 3))
    for k, v in verdicts.items():
        print(k, v)


if __name__ == "__main__":
    main()
