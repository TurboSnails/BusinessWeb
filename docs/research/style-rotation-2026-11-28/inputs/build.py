"""L-042 输入冻结：从 factorlab 的 Ken French 本地库取 10 条风格腿与无风险利率，截到 us_kf 锁箱起点以前（≤ 2023-10）。

只写文件、不打印任何收益统计。用法（research-py 环境）：
    cd research-py && uv run python ../docs/research/style-rotation-2026-11-28/inputs/build.py
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
SRC = HERE.parents[3] / "research-py" / "factor-data" / "us_kf" / "portfolios.parquet"
CUTOFF = pd.Timestamp("2023-10-31")  # us_kf 锁箱 2023-11-01 起不可读

MARKETS = {
    "dxus": {"prefix": "Developed_ex_US_6_Portfolios_ME_", "files": {"BM": "BE-ME", "OP": "OP", "INV": "INV", "PR": "Prior_12_2"},
             "factors": "Developed_ex_US_3_Factors"},
    "em": {"prefix": "Emerging_Markets_6_Portfolios_ME_", "files": {"BM": "BE-ME", "OP": "OP", "INV": "INV", "PR": "Prior_12_2"},
           "factors": "Emerging_5_Factors"},
    "us": {"prefix": "6_Portfolios_", "files": {"BM": "2x3", "OP": "ME_OP_2x3", "INV": "ME_INV_2x3", "PR": "ME_Prior_12_2"},
           "factors": "F-F_Research_Data_Factors"},
}
# 腿：(编号, 文件, 组合名列表——多个时等权平均)
LEGS = [
    ("V+", "BM", ["BIG HiBM"]), ("V-", "BM", ["BIG LoBM"]),
    ("M+", "PR", ["BIG HiPRIOR"]), ("M-", "PR", ["BIG LoPRIOR"]),
    ("P+", "OP", ["BIG HiOP"]), ("P-", "OP", ["BIG LoOP"]),
    ("I+", "INV", ["BIG LoINV"]), ("I-", "INV", ["BIG HiINV"]),
    ("S+", "BM", ["SMALL LoBM", "ME1 BM2", "SMALL HiBM"]), ("S-", "BM", ["BIG LoBM", "ME2 BM2", "BIG HiBM"]),
]
REGIONAL = ["Europe_5_Factors", "Japan_5_Factors", "Asia_Pacific_ex_Japan_5_Factors", "North_America_5_Factors",
            "Europe_Mom_Factor", "Japan_Mom_Factor", "Asia_Pacific_ex_Japan_MOM_Factor", "North_America_Mom_Factor",
            "Developed_ex_US_5_Factors", "Developed_ex_US_Mom_Factor", "Emerging_MOM_Factor"]


def main() -> None:
    df = pd.read_parquet(SRC)
    df = df[(df.weighting == "vw") & (df.date <= CUTOFF)]
    assert df.date.max() <= CUTOFF
    out = {}
    for mk, spec in MARKETS.items():
        cols = {}
        for leg, f, names in LEGS:
            d = df[df.dataset == spec["prefix"] + spec["files"][f]]
            w = d[d.portfolio.isin(names)].pivot(index="date", columns="portfolio", values="ret")[names]
            cols[leg] = w.mean(axis=1, skipna=False)
        fac = df[df.dataset == spec["factors"]].pivot(index="date", columns="portfolio", values="ret")
        cols["RF"] = fac["RF"]
        cols["MKT"] = fac["Mkt-RF"] + fac["RF"]
        t = pd.DataFrame(cols).dropna(how="all")
        t.index = t.index.strftime("%Y-%m")
        p = HERE / f"legs_{mk}.csv"
        t.to_csv(p, float_format="%.6f", index_label="month")
        out[p.name] = hashlib.sha256(p.read_bytes()).hexdigest()
    reg = df[df.dataset.isin(REGIONAL)].copy()
    reg["month"] = reg.date.dt.strftime("%Y-%m")
    p = HERE / "regional_factors.csv"
    reg[["month", "dataset", "portfolio", "ret"]].sort_values(["dataset", "portfolio", "month"]).to_csv(p, float_format="%.6f", index=False)
    out[p.name] = hashlib.sha256(p.read_bytes()).hexdigest()
    out["source_parquet_sha256"] = hashlib.sha256(SRC.read_bytes()).hexdigest()
    out["cutoff"] = "2023-10"
    (HERE / "MANIFEST.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
