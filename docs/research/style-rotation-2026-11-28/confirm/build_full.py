"""锁箱解封后（批次 L042-2026Q4）取数：与 inputs/build.py 相同的 10 条腿，截止月改为 2026-09。
    cd research-py && uv run python ../docs/research/style-rotation-2026-11-28/confirm/build_full.py
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "inputs"))
import build as B  # noqa: E402

CUTOFF = pd.Timestamp("2026-09-30")


def main() -> None:
    assert hashlib.sha256(B.SRC.read_bytes()).hexdigest() == "767b1b9666a307e42edc02f4f16ebf470c9ee6382075b20d4ee80f1cd8839c10"
    df = pd.read_parquet(B.SRC)
    df = df[(df.weighting == "vw") & (df.date <= CUTOFF)]
    out = {}
    for mk, spec in B.MARKETS.items():
        cols = {}
        for leg, f, names in B.LEGS:
            d = df[df.dataset == spec["prefix"] + spec["files"][f]]
            w = d[d.portfolio.isin(names)].pivot(index="date", columns="portfolio", values="ret")[names]
            cols[leg] = w.mean(axis=1, skipna=False)
        fac = df[df.dataset == spec["factors"]].pivot(index="date", columns="portfolio", values="ret")
        cols["RF"] = fac["RF"]
        cols["MKT"] = fac["Mkt-RF"] + fac["RF"]
        t = pd.DataFrame(cols).dropna(how="all")
        t.index = t.index.strftime("%Y-%m")
        p = HERE / f"legs_{mk}_full.csv"
        t.to_csv(p, float_format="%.6f", index_label="month")
        out[p.name] = hashlib.sha256(p.read_bytes()).hexdigest()
        # 与冻结输入在 2023-10 以前逐字一致
        old = (HERE.parent / "inputs" / f"legs_{mk}.csv").read_text().splitlines()
        new = p.read_text().splitlines()
        assert new[:len(old)] == old, mk
    (HERE / "MANIFEST.json").write_text(json.dumps(out, indent=2) + "\n")
    print(out)


if __name__ == "__main__":
    main()
