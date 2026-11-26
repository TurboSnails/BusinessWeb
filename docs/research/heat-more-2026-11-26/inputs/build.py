"""L-035 数据构造：Yahoo 日收盘 → processed/*_daily.csv；KF 49 行业 → processed/kf49_all.csv。
只做构造与完整性核对，不计算任何指标与未来收益的关系。

用法：cd research-py && uv run python -I ../docs/research/heat-more-2026-11-26/inputs/build.py
"""
from __future__ import annotations

import json
import zipfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
RAW, PROC = HERE / "raw", HERE / "processed"
KF_MISSING = {-99.99, -999.0}
ENERGY = ["Oil", "Coal"]
FIN = ["Banks", "Insur", "RlEst", "Fin"]
LOG: list[str] = []


def log(*a) -> None:
    s = " ".join(str(x) for x in a)
    print(s)
    LOG.append(s)


def read_yahoo(name: str) -> pd.Series:
    r = json.loads((RAW / name).read_text(encoding="utf-8"))["chart"]["result"][0]
    tz = ZoneInfo(r["meta"]["exchangeTimezoneName"])
    q = r["indicators"]["quote"][0]
    dates = [datetime.fromtimestamp(t, tz).strftime("%Y-%m-%d") for t in r["timestamp"]]
    s = pd.Series(q["close"], index=dates, dtype=float)
    nulls = int(s.isna().sum())
    dup = int(s.index.duplicated().sum())
    s = s[~s.index.duplicated(keep="last")].dropna().sort_index()
    flat = {}
    for d, o, h, l, c in zip(dates, q["open"], q["high"], q["low"], q["close"]):
        if None not in (o, h, l, c) and o == h == l == c:
            flat[d[:4]] = flat.get(d[:4], 0) + 1
    idx = pd.to_datetime(s.index)
    gaps = pd.Series(idx[1:] - idx[:-1], index=s.index[1:])
    big = gaps[gaps > pd.Timedelta(days=10)]
    jumps = s.pct_change().abs()
    log(f"[{name}] 时区 {tz.key}；{s.index[0]} → {s.index[-1]}，{len(s)} 天；空收盘 {nulls}，重复日期 {dup}；"
        f"间隔 > 10 天：{[(d, g.days) for d, g in big.items()]}；单日变动 > 15% 的日期：{list(jumps[jumps > 0.15].index)}；"
        f"OHLC 全相等的天数按年：{flat}")
    per_year = pd.Series(1, index=s.index).groupby(s.index.str[:4]).sum()
    log(f"[{name}] 每年交易日数（少于 200 的年份）：{per_year[per_year < 200].to_dict()}")
    return s


def kf_section(lines: list[str], title: str) -> pd.DataFrame:
    i = next(k for k, ln in enumerate(lines) if ln.strip() == title)
    header = [h.strip() for h in lines[i + 1].split(",")[1:]]
    recs = []
    for ln in lines[i + 2:]:
        cells = [c.strip() for c in ln.split(",")]
        if not cells[0].isdigit() or len(cells[0]) != 6:
            break
        recs.append([cells[0][:4] + "-" + cells[0][4:]] + [float(c) for c in cells[1:]])
    df = pd.DataFrame(recs, columns=["month"] + header).set_index("month")
    assert df.shape[1] == 49
    return df


def build_kf() -> pd.DataFrame:
    with zipfile.ZipFile(RAW.parents[2] / "nasdaq-semis-heat-2026-11-26/inputs/raw/49_Industry_Portfolios_CSV.zip") as z:
        lines = z.read("49_Industry_Portfolios.csv").decode("latin-1").splitlines()
    vw = kf_section(lines, "Average Value Weighted Returns -- Monthly")
    nf = kf_section(lines, "Number of Firms in Portfolios")
    sz = kf_section(lines, "Average Firm Size")
    cap = (nf.where(~nf.isin(KF_MISSING), 0) * sz.where(~sz.isin(KF_MISSING), 0)).where(nf > 0, 0.0)
    total = cap.sum(axis=1)
    ret = vw.where(~vw.isin(KF_MISSING))
    out = {}
    for ind in vw.columns:
        out[f"share_{ind}"] = (cap[ind] / total).round(10)
        out[f"ret_{ind}"] = ret[ind].where(cap[ind] > 0)
    for name, grp in (("energy", ENERGY), ("fin", FIN)):
        c = cap[grp]
        w = c.div(c.sum(axis=1), axis=0)
        bad = ((c > 0) & ret[grp].isna()).any(axis=1)
        out[f"share_{name}"] = (c.sum(axis=1) / total).round(10)
        out[f"ret_{name}"] = (w * ret[grp].fillna(0)).sum(axis=1).where(~bad & (c.sum(axis=1) > 0)).round(6)
        log(f"[KF] {name} 组合成分 {grp}；成分收益缺失而留空的月份 {int(bad.sum())}")
    df = pd.DataFrame(out)
    df.index.name = "month"
    first = {ind: nf.index[(nf[ind] > 0).values][0] for ind in vw.columns}
    late = {k: v for k, v in first.items() if v > "1926-07"}
    log(f"[KF] {vw.index[0]} → {vw.index[-1]}；1926-07 之后才有公司的行业及首月：{late}")
    zero_after = {ind: int(((nf[ind] == 0) & (nf.index > first[ind])).sum()) for ind in vw.columns}
    log(f"[KF] 出现后又有公司数为 0 的月数：{ {k: v for k, v in zero_after.items() if v} }")
    log(f"[KF] 份额范围核对：全部 ∈ [0,1] {bool(df.filter(like='share_').stack().between(0, 1).all())}；"
        f"49 行业份额之和与 1 的最大偏差 {float((df[[f'share_{i}' for i in vw.columns]].sum(axis=1) - 1).abs().max()):.2e}")
    return df


def main() -> None:
    PROC.mkdir(exist_ok=True)
    for name, out in (("RUT_yahoo_chart.json", "rut_daily.csv"), ("HSI_yahoo_chart.json", "hsi_daily.csv"), ("SSEC_yahoo_chart.json", "ssec_daily.csv")):
        s = read_yahoo(name)
        s.round(4).rename("close").rename_axis("date").to_csv(PROC / out)
    build_kf().to_csv(PROC / "kf49_all.csv")
    (HERE / "build_log.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
