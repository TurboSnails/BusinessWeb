"""L-037 数据构造：KF 12 行业市值加权月收益 → processed/kf12_vw.csv；9 只板块 SPDR 与 SPY 的月末复权价 → processed/etf_monthly.csv。
只做构造与完整性核对，不计算任何表现统计。
用法：cd research-py && uv run python -I ../docs/research/sector-rotation-2026-11-26/inputs/build.py
"""
from __future__ import annotations

import hashlib
import json
import zipfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

HERE = Path(__file__).resolve().parent
RAW, PROC = HERE / "raw", HERE / "processed"
ETFS = ["XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY", "SPY"]
LOG = []


def log(*a):
    s = " ".join(map(str, a)); print(s); LOG.append(s)


def kf12() -> pd.DataFrame:
    with zipfile.ZipFile(RAW / "12_Industry_Portfolios_CSV.zip") as z:
        lines = z.read("12_Industry_Portfolios.csv").decode("latin-1").splitlines()
    log("[KF12] 首行：", lines[0].strip(), "|", lines[1].strip())
    i = next(k for k, ln in enumerate(lines) if ln.strip() == "Average Value Weighted Returns -- Monthly")
    header = [h.strip() for h in lines[i + 1].split(",")[1:]]
    recs = []
    for ln in lines[i + 2:]:
        c = [x.strip() for x in ln.split(",")]
        if not (c[0].isdigit() and len(c[0]) == 6):
            break
        recs.append([c[0][:4] + "-" + c[0][4:]] + [float(x) for x in c[1:]])
    df = pd.DataFrame(recs, columns=["month"] + header).set_index("month")
    miss = df.isin([-99.99, -999.0])
    m = pd.PeriodIndex(df.index, freq="M")
    gaps = [(str(a), str(b)) for a, b in zip(m[:-1], m[1:]) if (b - a).n != 1]
    log(f"[KF12] 行业 {header}；{df.index[0]} → {df.index[-1]}，{len(df)} 个月；缺失码 {int(miss.values.sum())}；月份缺口 {gaps}")
    return df


def etf_monthly() -> pd.DataFrame:
    cols, meta = {}, {}
    for s in ETFS:
        r = json.loads((RAW / f"{s}_yahoo_chart.json").read_text())["chart"]["result"][0]
        tz = ZoneInfo(r["meta"]["exchangeTimezoneName"])
        d = [datetime.fromtimestamp(t, tz).strftime("%Y-%m-%d") for t in r["timestamp"]]
        adj = pd.Series(r["indicators"]["adjclose"][0]["adjclose"], index=d, dtype=float)
        nulls = int(adj.isna().sum())
        adj = adj[~adj.index.duplicated(keep="last")].dropna().sort_index()
        adj = adj[adj.index < "2026-11-01"]  # 只用完整月份（到 2026-10）
        me = adj.groupby(adj.index.str[:7]).last()
        jumps = adj.pct_change().abs()
        log(f"[{s}] {adj.index[0]} → {adj.index[-1]}，{len(adj)} 天，空值 {nulls}；单日变动 > 15% 的日期 {list(jumps[jumps > 0.15].index)}")
        cols[s] = me
    return pd.DataFrame(cols)


def main():
    PROC.mkdir(exist_ok=True)
    kf12().to_csv(PROC / "kf12_vw.csv")
    etf_monthly().round(6).to_csv(PROC / "etf_month_end_adjclose.csv", index_label="month")
    man = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(RAW.glob("*")) if p.is_file()}
    (RAW / "MANIFEST.json").write_text(json.dumps({"downloaded": "2026-11-26", "sha256": man,
        "sources": {"12_Industry_Portfolios_CSV.zip": "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/12_Industry_Portfolios_CSV.zip",
                    "*_yahoo_chart.json": "https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?period1=0&period2=1800000000&interval=1d&events=div（通用 UA）"}},
        ensure_ascii=False, indent=2) + "\n")
    (HERE / "build_log.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
