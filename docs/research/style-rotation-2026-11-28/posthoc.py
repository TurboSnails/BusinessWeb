"""L-042 事后补充（看过主结果之后才加，不属于预注册，不能据此改结论）：
「一直持有 5 条正向腿」（V+、M+、P+、I+、S+ 各 20%）这一静态对照，预注册漏掉了。

    cd research-py && uv run python ../docs/research/style-rotation-2026-11-28/posthoc.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run as R  # noqa: E402

SUBS = {**R.HALVES, **R.SEGS}


def main() -> None:
    out = {}
    for mk in R.WIN:
        df = R.load(mk)
        ms = R.months_of(df, *R.WIN[mk])
        rf = df.loc[ms, "RF"].to_numpy()
        series = {}
        W = pd.DataFrame(0.0, index=ms, columns=R.LEGS)
        W[["V+", "M+", "P+", "I+", "S+"]] = 0.2
        series["static"] = R.simulate(W, df)
        for k in ("B0", "R1", "R2"):
            series[k] = R.simulate(R.weights(df, k, ms), df)
        o = {}
        for k, (net, to) in series.items():
            o[k] = {"sharpe": R.sharpe(net, rf), "maxDd": R.maxdd(net), "cagr": R.cagr(net), "turnover": float(to[1:].mean() * 12)}
        if mk == "dxus":
            idx = pd.Index(ms)
            for name, (a, b) in SUBS.items():
                m = np.asarray((idx >= a) & (idx <= b))
                o.setdefault("sub", {})[name] = {k: R.sharpe(series[k][0][m], rf[m]) for k in series}
        out[mk] = o
    (HERE / "posthoc.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    for mk, o in out.items():
        print(mk, {k: (round(v["sharpe"], 3), round(v["turnover"], 2), round(v["maxDd"], 3), round(v["cagr"], 4)) for k, v in o.items() if k != "sub"})
        if "sub" in o:
            for s, v in o["sub"].items():
                print("  ", s, {k: round(x, 3) for k, x in v.items()})


if __name__ == "__main__":
    main()
