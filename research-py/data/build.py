"""由 data/raw/ 的原始文件生成多资产研究用的处理后序列（data/processed/，入库）。只整理单个资产，不计算任何组合。

方法（路线图第 3 阶段，事先写定）：
- 5 年期国债日度总回报（1962 起）：每个交易日买入一只票息等于前一日收益率的 5 年期平价债，次一交易日按当日收益率、
  剩余期限 5 − Δt 重新定价，加上 Δt 的应计利息（半年付息，Δt 按自然日 ÷ 365.25）。常用的「固定期限收益率换算总回报」近似。
- 1953-04 至 1961-12 只有月均收益率 GS5：同一方法按月（Δt = 1/12）换算，单独标注口径，月均值会平滑波动。
- 黄金（美元/盎司，现货口径）：
  1975-01 至 1998-12：德国央行法兰克福黄金定价（马克/公斤）÷ 同日法兰克福美元汇率定价（马克/美元）÷ 32.1507466；
  1999-01 至 2000-08：没有免费日度来源，用世界银行月均价（每月记在 15 日）按对数线性插值，标为 worldbank-interpolated；
  2000-08-30 至 2004-11-17：Yahoo GC=F（COMEX 近月连续合约）收盘；
  2004-11-18 起：GLD 调整收盘乘回年费 0.40%（复利按自然日），按收益率接到前一段的价格水平上。
- CPI：FRED CPIAUCSL 月度。

用法（在 research-py/ 下）：uv run python -m data.build
"""

from __future__ import annotations

import csv
import io
import json
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import openpyxl
import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE / "processed"
OZ_PER_KG = 32.1507466
GLD_FEE = 0.0040
GOLD_START = "1975-01-01"


def fred(name: str) -> pd.Series:
    df = pd.read_csv(RAW / name, na_values=["."])
    s = df.set_index(df.columns[0])[df.columns[1]].dropna()
    s.index = s.index.astype(str)
    return s.astype(float)


def bundesbank(name: str) -> pd.Series:
    rows = {}
    for line in csv.reader(io.StringIO((RAW / name).read_text(encoding="utf-8-sig"))):
        if len(line) >= 2 and len(line[0]) == 10 and line[0][4] == "-" and line[1] not in (".", ""):
            rows[line[0]] = float(line[1])
    return pd.Series(rows).sort_index()


def yahoo(name: str, adjusted: bool = False) -> pd.Series:
    r = json.loads((RAW / name).read_text(encoding="utf-8"))["chart"]["result"][0]
    off = r["meta"].get("gmtoffset", 0)
    vals = r["indicators"]["adjclose"][0]["adjclose"] if adjusted else r["indicators"]["quote"][0]["close"]
    out = {}
    for t, v in zip(r["timestamp"], vals):
        if v is not None and v > 0:
            out[datetime.fromtimestamp(t + off, tz=timezone.utc).strftime("%Y-%m-%d")] = float(v)
    return pd.Series(out).sort_index()


def worldbank_gold() -> pd.Series:
    wb = openpyxl.load_workbook(RAW / "worldbank_cmo_monthly.xlsx", read_only=True)
    ws = wb["Monthly Prices"]
    col = None
    out = {}
    for row in ws.iter_rows(values_only=True):
        if col is None:
            for j, c in enumerate(row):
                if c == "Gold":
                    col = j
            continue
        key = row[0]
        if isinstance(key, str) and len(key) == 7 and key[4] == "M" and isinstance(row[col], (int, float)):
            out[f"{key[:4]}-{key[5:]}"] = float(row[col])
    return pd.Series(out).sort_index()


# ---------- 国债 ----------
def par_bond_price(y: float, coupon: float, maturity: float) -> float:
    """半年付息平价债定价（年化收益率、票息为小数；剩余期限可为小数年）。"""
    if maturity <= 0:
        return 1.0
    v = (1 + y / 2) ** (-2 * maturity)
    return v + (coupon / y) * (1 - v) if y > 0 else 1.0 + coupon * maturity


def bond_returns(yields_pct: pd.Series, dt_years) -> pd.Series:
    y = yields_pct.to_numpy() / 100
    out = [np.nan]
    for i in range(1, len(y)):
        dt = dt_years(yields_pct.index[i - 1], yields_pct.index[i])
        out.append(par_bond_price(y[i], y[i - 1], 5 - dt) - 1 + y[i - 1] * dt)
    return pd.Series(out, index=yields_pct.index)


def days_between(a: str, b: str) -> float:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days / 365.25


def build_bonds() -> tuple[pd.DataFrame, pd.DataFrame]:
    dgs5 = fred("fred_dgs5.csv")
    daily = pd.DataFrame({"yield": dgs5, "ret": bond_returns(dgs5, days_between)})
    gs5 = fred("fred_gs5.csv")
    gs5.index = [d[:7] for d in gs5.index]
    early = gs5[gs5.index <= "1962-01"]
    monthly = pd.DataFrame({"yield": early, "ret": bond_returns(early, lambda a, b: 1 / 12)})
    return daily, monthly


# ---------- 黄金 ----------
def build_gold() -> pd.DataFrame:
    gold_dem = bundesbank("bbk_gold_dem.csv")
    usd_dem = bundesbank("bbk_usd_dem.csv")
    common = gold_dem.index.intersection(usd_dem.index)
    fra = (gold_dem[common] / usd_dem[common] / OZ_PER_KG)
    fra = fra[(fra.index >= GOLD_START) & (fra.index <= "1998-12-31")]
    parts = [pd.DataFrame({"price": fra, "source": "bundesbank-frankfurt"})]

    gc = yahoo("yahoo_gc.json")
    gld = yahoo("yahoo_gld.json", adjusted=True)
    gld_start = gld.index[0]
    wb = worldbank_gold()
    # 缺口：1999-01 至 GC=F 第一天之前，世界银行月均价记在每月 15 日，按对数线性插值到工作日
    gap_end = gc.index[0]
    anchors = pd.Series({f"{m}-15": v for m, v in wb.items() if "1998-12" <= m <= gap_end[:7]})
    anchors = pd.concat([pd.Series({fra.index[-1]: fra.iloc[-1]}), anchors, pd.Series({gap_end: gc.iloc[0]})]).sort_index()
    anchors = anchors[~anchors.index.duplicated(keep="first")]
    bdays = pd.bdate_range("1999-01-04", (date.fromisoformat(gap_end) - timedelta(days=1)).isoformat()).strftime("%Y-%m-%d")
    t_anchor = np.array([date.fromisoformat(d).toordinal() for d in anchors.index])
    t_days = np.array([date.fromisoformat(d).toordinal() for d in bdays])
    interp = np.exp(np.interp(t_days, t_anchor, np.log(anchors.to_numpy())))
    parts.append(pd.DataFrame({"price": interp, "source": "worldbank-interpolated"}, index=bdays))

    gc_part = gc[(gc.index >= gap_end) & (gc.index < gld_start)]
    parts.append(pd.DataFrame({"price": gc_part, "source": "comex-gc-front"}))

    # GLD：调整收盘乘回年费，再按收益率接到 GC=F 最后一天的价格水平
    t0 = date.fromisoformat(gld_start).toordinal()
    fee_back = np.array([math.exp(GLD_FEE * (date.fromisoformat(d).toordinal() - t0) / 365.25) for d in gld.index])
    gld_spot = gld.to_numpy() * fee_back
    level = gc_part.iloc[-1] * (gc[gld_start] / gc_part.iloc[-1]) if gld_start in gc.index else gc_part.iloc[-1]
    gld_level = level * gld_spot / gld_spot[0]
    parts.append(pd.DataFrame({"price": gld_level, "source": "gld-fee-added-back"}, index=gld.index))
    out = pd.concat(parts)
    out = out[~out.index.duplicated(keep="first")].sort_index()
    return out


def build_cpi() -> pd.DataFrame:
    cpi = fred("fred_cpiaucsl.csv")
    cpi.index = [d[:7] for d in cpi.index]
    return pd.DataFrame({"cpi": cpi})


def main() -> None:
    OUT.mkdir(exist_ok=True)
    daily, monthly = build_bonds()
    daily.to_csv(OUT / "bond5_daily.csv", index_label="date", float_format="%.10g")
    monthly.to_csv(OUT / "bond5_monthly_gs5_pre1962.csv", index_label="month", float_format="%.10g")
    gold = build_gold()
    gold.to_csv(OUT / "gold_daily.csv", index_label="date", float_format="%.6f")
    worldbank_gold().rename("price").to_csv(OUT / "gold_worldbank_monthly.csv", index_label="month", float_format="%.4f")
    build_cpi().to_csv(OUT / "cpi_monthly.csv", index_label="month", float_format="%.3f")
    print(f"国债日度 {daily.index[0]}–{daily.index[-1]}（{len(daily)} 天）；1962 年以前月度 {monthly.index[0]}–{monthly.index[-1]}")
    print(f"黄金日度 {gold.index[0]}–{gold.index[-1]}（{len(gold)} 天）；来源分段：", gold.groupby("source").size().to_dict())


if __name__ == "__main__":
    main()
