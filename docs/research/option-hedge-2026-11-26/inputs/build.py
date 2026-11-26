"""把 raw/ 中的 CBOE 原始 CSV 整理成 processed/cboe_daily.csv。

用法（仓库根目录）：
    cd research-py && uv run python ../docs/research/option-hedge-2026-11-26/inputs/build.py

口径：
- 行 = 仓库标普日线 data-raw/macro-posture-daily/spx-daily.json 的交易日，从 1986-06-20（最早的 CBOE 指数起点）到该文件最后一天；
- 列 = spx_repo（仓库标普收盘）+ 各 CBOE 指数收盘（SPRO 取 CLOSE 列；SPX 列改名 spx_cboe；旧站 CLL 快照列名 CLL_legacy）
  + sp500tr_yahoo（标普含息总收益指数，仅供股息口径核对）；
- 缺失留空，不前向填充、不拼接；CBOE 有而标普日历没有的日期被丢弃（数量与样例见 AUDIT.md）。
只做整理，不计算任何收益类统计。
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE / "processed" / "cboe_daily.csv"
REPO = HERE.parents[3]
SPX_JSON = REPO / "data-raw/macro-posture-daily/spx-daily.json"
START = "1986-06-20"

# 列名 -> 原始文件
FILES = {
    "PPUT": "PPUT_History.csv",
    "PPUT3M": "PPUT3M_History.csv",
    "CLLZ": "CLLZ_History.csv",
    "CLL": "CLL_History.csv",
    "CLL_legacy": "CLL_legacy_wayback20200711.csv",
    "CLL3M": "CLL3M_History.csv",
    "CLL1M": "CLL1M_History.csv",
    "VXTH": "VXTH_History.csv",
    "PUT": "PUT_History.csv",
    "BXM": "BXM_History.csv",
    "SPRO": "SPRO_History.csv",
    "SPROME": "SPROME_History.csv",
    "SPRF": "SPRF_History.csv",
    "BFLY": "BFLY_History.csv",
    "spx_cboe": "SPX_History.csv",
}


def load_cboe(path: Path) -> pd.Series:
    """读取一个 CBOE CSV，返回 日期(YYYY-MM-DD) -> 收盘 的 Series（保留重复日，供核对使用）。

    兼容三种格式：DATE,TICKER；DATE,OPEN,HIGH,LOW,CLOSE；旧站文件（前置免责声明行、值前有空格）。
    """
    dates, vals = [], []
    header: list[str] | None = None
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        cells = [c.strip() for c in line.split(",")]
        first = cells[0].split("/")
        if len(first) == 3 and all(p.isdigit() for p in first):
            m, d, y = (int(p) for p in first)
            idx = header.index("CLOSE") if header and "CLOSE" in header else 1
            dates.append(f"{y:04d}-{m:02d}-{d:02d}")
            vals.append(float(cells[idx]) if cells[idx] else float("nan"))
        elif cells[0].upper() == "DATE":
            header = [c.upper() for c in cells]
    return pd.Series(vals, index=pd.Index(dates, name="date"), dtype=float)


def load_yahoo_chart(path: Path) -> pd.Series:
    """Yahoo v8 chart JSON -> 日期(纽约时区) -> 收盘。"""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    r = json.loads(path.read_text(encoding="utf-8"))["chart"]["result"][0]
    ny = ZoneInfo("America/New_York")
    ds = [datetime.fromtimestamp(t, ny).strftime("%Y-%m-%d") for t in r["timestamp"]]
    return pd.Series(r["indicators"]["quote"][0]["close"], index=pd.Index(ds, name="date"), dtype=float)


def load_spx_repo() -> pd.Series:
    rows = json.loads(SPX_JSON.read_text(encoding="utf-8"))["rows"]
    return pd.Series({d: c for d, c in rows}, dtype=float).sort_index()


def load_all() -> dict[str, pd.Series]:
    out = {col: load_cboe(RAW / f) for col, f in FILES.items()}
    out["sp500tr_yahoo"] = load_yahoo_chart(RAW / "SP500TR_yahoo_chart.json")
    return out


def build() -> pd.DataFrame:
    spx = load_spx_repo()
    cal = spx.index[spx.index >= START]
    df = pd.DataFrame(index=pd.Index(cal, name="date"))
    df["spx_repo"] = spx.loc[cal]
    for col, s in load_all().items():
        s = s[~s.index.duplicated(keep="last")]  # 重复日保留最后一条（核对见 AUDIT.md：实际无重复）
        df[col] = s.reindex(cal)
    return df


def main() -> None:
    df = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT, float_format="%.6f")
    print(f"wrote {OUT.relative_to(REPO)}  rows={len(df)}  {df.index[0]} → {df.index[-1]}")
    for c in df.columns:
        s = df[c].dropna()
        print(f"  {c:11s} non-null={len(s):6d}  {s.index.min()} → {s.index.max()}")


if __name__ == "__main__":
    main()
