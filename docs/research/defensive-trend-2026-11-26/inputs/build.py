"""锁箱 B-2：由 inputs/raw/ 构造各国月度面板，并做完整性与口径核对。不计算任何表现统计（年化、夏普、波动、回撤、
相关、超额、区间涨跌）；核对只输出「差异量级」和日期清单。

用法（在 research-py/ 下）：uv run python -I ../docs/research/defensive-trend-2026-11-26/inputs/build.py

构造（事先写定）：
- 股票本币月收益：equity_local_t = (1 + equity_usd_t) × fx_t / fx_{t−1} − 1，fx = 月末每美元兑本币（旧货币单位）。
  equity_usd 为 KF「Value-Weight Dollar Returns, All 4 Data Items Not Reqd」的 Mkt 列（含息）。
  KF 自带的本币收益（同文件 Local Returns 段 Mkt 列）另存为 equity_local_kf，仅作核对。
- 汇率 fx：非欧元国家 = H.10 日度当月最后一个有值日；欧元区国家 1998-12 及以前 = 欧元固定兑换率 ÷ OECD CCUSSP01
  （OECD 序列为每单位「欧元折算本币」兑美元、期末值），1999-01 起 = 欧元固定兑换率 ÷ DEXUSEU 当月最后一个有值日。
- 10 年期国债月收益（仿 research-py/data/build.py 的 GS5 月度换算，期限改为 10 年）：
  上月末买入票息 c = y_{t−1} 的 10 年期平价债（半年付息），本月按 y_t、剩余期限 T = 10 − 1/12 年重新定价：
  P = v + (c / y_t)(1 − v)，v = (1 + y_t/2)^(−2T)；bond_ret_t = P − 1 + y_{t−1}/12。
  与 build.py 的唯一差别：build.py 在 y ≤ 0 时退化为 1 + cT（美国没有负利率），这里 y < 0 照用同一公式（1 + y/2 > 0 时
  公式有效），只有 y = 0 时用极限 1 + cT。
  收益率 y 为 OECD IRLTLT01（多为月均值，见 AUDIT.md）；意大利、西班牙在 OECD 起点之前用 IMF INTGSB 向前延伸，
  bond_src 标记。
- 短期利率 short_rate：逐月取 IR3TIB01 → IR3TBB01 → IR3TCD01 → IRSTCI01 第一个有值者，不做水平调整，short_src 标记。
- 现金月收益：cash_ret_t = short_rate_{t−1} / 100 / 12（用上月值，月初即可知，避免前视；OECD 短端多为月均值，
  上月均值在本月初已公布）。
- bond_yield_me / bond_ret_me：同一公式，但用月末收益率（德国 = 德国央行 Svensson 10 年期月末值，1972-09 起；
  日本 = 财务省 JGB 10 年期当月最后一个交易日，1986-07 起；其他国家为空），只作月均平滑的敏感性。
- in_common：equity_local、bond_ret、cash_ret 三者都有值；main_ok 另要求 bond_src 为 OECD（不含 IMF 延伸）。
美国 1871–1952：equity_ret_t = (P_t + D_t/12) / P_{t−1} − 1（L-027 口径），GS10 同法换算 10 年债，现金 = 上月 CP / 1200。
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE / "processed"
REPO = HERE.parents[3]
SHILLER = REPO / "data-raw" / "sp500-backtest" / "shiller.csv"
CP_JSON = REPO / "docs" / "research" / "trend-1871-2026-11-26" / "inputs" / "cp.json"
MATURITY = 10.0
DT = 1 / 12
EQ_END = "2025-12"
EQ_START = "1975-01"

COUNTRIES = {  # 代码: (英文名, KF 文件, H.10 序列, H.10 方向, 欧元固定兑换率)
    "JP": ("Japan", "Japan.Dat", "DEXJPUS", "lcu_per_usd", None),
    "DE": ("Germany", "Germany.Dat", None, None, 1.95583),
    "GB": ("UK", "UK.Dat", "DEXUSUK", "usd_per_lcu", None),
    "FR": ("France", "France.Dat", None, None, 6.55957),
    "CA": ("Canada", "Canada.Dat", "DEXCAUS", "lcu_per_usd", None),
    "AU": ("Australia", "Austrlia.Dat", "DEXUSAL", "usd_per_lcu", None),
    "CH": ("Switzerland", "Swtzrlnd.Dat", "DEXSZUS", "lcu_per_usd", None),
    "NL": ("Netherlands", "Nethrlnd.Dat", None, None, 2.20371),
    "SE": ("Sweden", "Sweden.Dat", "DEXSDUS", "lcu_per_usd", None),
    "IT": ("Italy", "Italy.Dat", None, None, 1936.27),
    "ES": ("Spain", "Spain.Dat", None, None, 166.386),
    "BE": ("Belgium", "Belgium.Dat", None, None, 40.3399),
    "DK": ("Denmark", "Denmark.Dat", "DEXDNUS", "lcu_per_usd", None),
    "NO": ("Norway", "Norway.Dat", "DEXNOUS", "lcu_per_usd", None),
}
SHORT_ORDER = ["IR3TIB01", "IR3TBB01", "IR3TCD01", "IRSTCI01"]
BOND_EXT = {"IT": "INTGSBITM193N", "ES": "INTGSBESM193N"}


# ---------- 读取 ----------
def fred_raw(sid: str) -> pd.Series | None:
    p = RAW / f"fred_{sid}.csv"
    if not p.exists():
        return None
    df = pd.read_csv(p, na_values=["."])
    s = df.set_index(df.columns[0])[df.columns[1]].dropna().astype(float)
    s.index = s.index.astype(str)
    return s


def fred_monthly(sid: str) -> pd.Series | None:
    s = fred_raw(sid)
    if s is None:
        return None
    s.index = [d[:7] for d in s.index]
    return s


def month_end(daily: pd.Series) -> pd.Series:
    """日度序列取每月最后一个有值的观测。"""
    d = daily.dropna()
    return d.groupby([i[:7] for i in d.index]).last()


def month_mean(daily: pd.Series) -> pd.Series:
    d = daily.dropna()
    return d.groupby([i[:7] for i in d.index]).mean()


def kf_mkt(fn: str) -> tuple[pd.Series, pd.Series]:
    """KF 国家文件前两段（月度、Not Reqd）：美元、本币的 Mkt 列，% → 小数；−99.99 视为缺失。"""
    sections: list[dict[str, float]] = []
    cur: dict[str, float] | None = None
    for line in (RAW / f"kf_{fn}").read_text(encoding="latin-1").splitlines():
        if "Returns" in line:
            cur = {}
            sections.append(cur)
            continue
        parts = line.split()
        if cur is not None and parts and len(parts[0]) == 6 and parts[0].isdigit():
            v = float(parts[1])
            cur[f"{parts[0][:4]}-{parts[0][4:]}"] = np.nan if v <= -99.99 else v / 100
        elif cur is not None and parts and len(parts[0]) == 4 and parts[0].isdigit():
            cur = None  # 年度段，跳过
    heads = [l for l in (RAW / f"kf_{fn}").read_text(encoding="latin-1").splitlines() if "Returns" in l]
    assert "Dollar" in heads[0] and "Not Reqd" in heads[0], heads[0]
    assert "Local" in heads[1] and "Not Reqd" in heads[1], heads[1]
    return pd.Series(sections[0]).sort_index(), pd.Series(sections[1]).sort_index()


def bbk(name: str) -> pd.Series:
    rows = {}
    for line in csv.reader(io.StringIO((RAW / name).read_text(encoding="utf-8-sig"))):
        if len(line) >= 2 and line[0][:2] in ("19", "20") and line[1] not in (".", ""):
            rows[line[0]] = float(line[1])
    return pd.Series(rows).sort_index()


def mof_10y() -> pd.Series:
    rows = {}
    for line in csv.reader(io.StringIO((RAW / "mof_jgbcme_all.csv").read_text(encoding="utf-8", errors="replace"))):
        if len(line) > 10 and line[0][:2] in ("19", "20") and line[10] not in ("-", ""):
            y, m, d = line[0].split("/")
            rows[f"{y}-{int(m):02d}-{int(d):02d}"] = float(line[10])
    return pd.Series(rows).sort_index()


# ---------- 构造 ----------
def par_bond_price(y: float, coupon: float, maturity: float) -> float:
    """半年付息平价债定价；y、coupon 为年化小数。y < 0 也用同一公式；y = 0 用极限 1 + coupon × maturity。"""
    if maturity <= 0:
        return 1.0
    if y == 0:
        return 1.0 + coupon * maturity
    v = (1 + y / 2) ** (-2 * maturity)
    return v + (coupon / y) * (1 - v)


def bond_returns(yields_pct: pd.Series) -> pd.Series:
    """输入按月连续（不得有缺口）的年化收益率 %；返回同索引月收益，首月 NaN。"""
    idx = list(yields_pct.index)
    y = yields_pct.to_numpy() / 100
    out = [np.nan]
    for i in range(1, len(y)):
        assert months_apart(idx[i - 1], idx[i]) == 1, (idx[i - 1], idx[i])
        out.append(par_bond_price(y[i], y[i - 1], MATURITY - DT) - 1 + y[i - 1] * DT)
    return pd.Series(out, index=yields_pct.index)


def months_apart(a: str, b: str) -> int:
    return (int(b[:4]) - int(a[:4])) * 12 + int(b[5:7]) - int(a[5:7])


def month_range(a: str, b: str) -> list[str]:
    return [p.strftime("%Y-%m") for p in pd.period_range(a, b, freq="M")]


def priority(series: list[tuple[str, pd.Series | None]]) -> tuple[pd.Series, pd.Series]:
    """逐月取第一个有值的序列。返回 (值, 来源)。"""
    idx = sorted(set().union(*[set(s.index) for _n, s in series if s is not None]))
    val, src = pd.Series(np.nan, index=idx), pd.Series("", index=idx, dtype=object)
    for name, s in series:
        if s is None:
            continue
        fill = val.isna() & val.index.isin(s.index)
        val[fill] = s.reindex(val.index)[fill]
        src[fill] = name
    return val, src


def fx_series(cc: str) -> tuple[pd.Series, pd.Series]:
    _n, _fn, h10, quote, eur = COUNTRIES[cc]
    if h10:
        me = month_end(fred_raw(h10))
        fx = 1 / me if quote == "usd_per_lcu" else me
        return fx, pd.Series(f"H10:{h10}", index=fx.index)
    oecd = fred_monthly(f"CCUSSP01{cc}M650N")
    pre = eur / oecd[oecd.index <= "1998-12"]
    eu = month_end(fred_raw("DEXUSEU"))
    post = eur / eu[eu.index >= "1999-01"]
    fx = pd.concat([pre, post])
    src = pd.Series([f"OECD:CCUSSP01{cc}M650N"] * len(pre) + ["H10:DEXUSEU"] * len(post), index=fx.index)
    return fx, src


def month_end_yield(cc: str) -> tuple[pd.Series | None, str]:
    if cc == "DE":
        return bbk("bbk_zst10_monthly.csv"), "BBK_ZST10_EOM"
    if cc == "JP":
        return month_end(mof_10y()), "MOF_JGB10Y_EOM"
    return None, ""


def build_country(cc: str) -> tuple[pd.DataFrame, dict]:
    name, fn, *_ = COUNTRIES[cc]
    usd, loc_kf = kf_mkt(fn)
    fx, fx_src = fx_series(cc)

    oecd_y = fred_monthly(f"IRLTLT01{cc}M156N")
    by, by_src = oecd_y.copy(), pd.Series(f"IRLTLT01{cc}M156N", index=oecd_y.index, dtype=object)
    if cc in BOND_EXT:  # 只在 OECD 起点之前向前延伸
        ext = fred_monthly(BOND_EXT[cc])
        ext = ext[ext.index < oecd_y.index[0]]
        by = pd.concat([ext, by])
        by_src = pd.concat([pd.Series(BOND_EXT[cc], index=ext.index, dtype=object), by_src])
    by = by.dropna()
    full = month_range(by.index[0], by.index[-1])
    assert list(by.index) == full, f"{cc} 收益率有缺口"
    bret = bond_returns(by)

    sr, sr_src = priority([(f"{p}{cc}M156N", fred_monthly(f"{p}{cc}M156N")) for p in SHORT_ORDER])
    sr = sr.dropna()
    sr_src = sr_src[sr.index]
    assert list(sr.index) == month_range(sr.index[0], sr.index[-1]), f"{cc} 短端有缺口"
    cash = (sr / 100 / 12).shift(1)
    cash.index = sr.index

    months = month_range(EQ_START, EQ_END)
    df = pd.DataFrame(index=pd.Index(months, name="month"))
    df["equity_usd"] = usd.reindex(months)
    df["fx"] = fx.reindex(months)
    fx_prev = pd.Series(fx.reindex(month_range("1974-12", EQ_END)).shift(1).to_numpy()[1:], index=months)
    # 汇率在 1974-12 至样本末必须逐月连续（法国 OECD 1968-05 缺一个月，在样本外）
    fxw = fx[fx.index >= "1974-12"]
    assert list(fxw.index) == month_range("1974-12", fxw.index[-1]), f"{cc} 汇率有缺口"
    df["equity_local"] = (1 + df["equity_usd"]) * df["fx"] / fx_prev - 1
    df["equity_local_kf"] = loc_kf.reindex(months)
    df["bond_yield"] = by.reindex(months)
    df["bond_ret"] = bret.reindex(months)
    # 月末收益率版本（只有德国、日本有免费月末来源），作平滑敏感性用
    me_y, me_src = month_end_yield(cc)
    if me_y is not None:
        assert list(me_y.index) == month_range(me_y.index[0], me_y.index[-1]), f"{cc} 月末收益率有缺口"
        df["bond_yield_me"] = me_y.reindex(months)
        df["bond_ret_me"] = bond_returns(me_y).reindex(months)
    else:
        df["bond_yield_me"] = np.nan
        df["bond_ret_me"] = np.nan
    df["short_rate"] = sr.reindex(months)
    df["cash_ret"] = cash.reindex(months)
    df["fx_src"] = fx_src.reindex(months).fillna("")
    df["bond_src"] = by_src.reindex(months).fillna("")
    df["bond_me_src"] = me_src if me_y is not None else ""
    df.loc[df["bond_yield_me"].isna(), "bond_me_src"] = ""
    # 现金收益的来源 = 上月短端的来源
    df["cash_src"] = sr_src.shift(1).reindex(months).fillna("")
    df["short_src"] = sr_src.reindex(months).fillna("")
    df["in_common"] = df[["equity_local", "bond_ret", "cash_ret"]].notna().all(axis=1)
    # bond_ret_t 用到 y_{t−1}、y_t：两个都来自 OECD 才算 main
    oecd_both = (df["bond_src"] == f"IRLTLT01{cc}M156N") & (by_src.shift(1).reindex(months) == f"IRLTLT01{cc}M156N")
    df["main_ok"] = df["in_common"] & oecd_both

    meta = {"name": name, "kf_file": fn}
    for col in ("in_common", "main_ok"):
        ok = df.index[df[col]]
        if len(ok):
            a, b = ok[0], ok[-1]
            inner = df.loc[a:b, col]
            meta[col] = {"start": a, "end": b, "months": int(inner.sum()), "internal_gaps": int((~inner).sum())}
        else:
            meta[col] = None
    meta["equity"] = {"source": f"KF F-F_International_Countries.zip/{fn} Dollar Mkt (Not Reqd)",
                      "first": usd.dropna().index[0], "last": usd.dropna().index[-1]}
    meta["fx"] = {k: {"first": g.index[0], "last": g.index[-1]} for k, g in fx_src.groupby(fx_src)}
    meta["bond_yield"] = {k: {"first": g.index[0], "last": g.index[-1]} for k, g in by_src.groupby(by_src)}
    meta["short_rate"] = {k: {"first": g.index[0], "last": g.index[-1]} for k, g in sr_src.groupby(sr_src)}
    # 拼接点：来源切换的月份
    meta["splices"] = []
    for col in ("fx_src", "bond_src", "short_src"):
        s = df[col]
        for i in range(1, len(s)):
            if s.iloc[i] and s.iloc[i - 1] and s.iloc[i] != s.iloc[i - 1]:
                meta["splices"].append({"column": col, "month": s.index[i], "from": s.iloc[i - 1], "to": s.iloc[i]})
    return df, meta


def build_us() -> pd.DataFrame:
    sh = pd.read_csv(SHILLER, dtype={"date": str}).set_index("date")
    sh = sh[(sh.index >= "1871-01") & (sh.index <= "1952-12")]
    cp = pd.Series({r[0]: float(r[1]) for r in json.loads(CP_JSON.read_text(encoding="utf-8"))["rows"]})
    df = pd.DataFrame(index=pd.Index(sh.index, name="month"))
    df["equity_ret"] = (sh["P"] + sh["D"] / 12) / sh["P"].shift(1) - 1
    df["bond_yield"] = sh["GS10"]
    df["bond_ret"] = bond_returns(sh["GS10"])
    df["short_rate"] = cp.reindex(df.index)
    df["cash_ret"] = (df["short_rate"] / 100 / 12).shift(1)
    df["equity_src"] = "shiller P(monthly avg),D (D annual-interpolated 1871-1934)"
    df["bond_src"] = "shiller GS10 (annual, linearly interpolated within year pre-1953)"
    df["cash_src"] = "NBER m13002 commercial paper (prev month)"
    return df


# ---------- 核对（只输出差异量级与日期） ----------
def q(x: pd.Series) -> dict:
    a = x.dropna().abs()
    return {"n": int(len(a)), "median": float(a.median()), "p95": float(a.quantile(0.95)), "max": float(a.max())}


def checks(panels: dict[str, pd.DataFrame]) -> dict:
    out: dict = {"jumps": {}, "fx_vs_kf_local_pp": {}, "oecd_fx_vs_h10_rel": {}, "missing_in_common": {}}
    for cc, df in panels.items():
        c = df[df["in_common"]]
        a, b = (c.index[0], c.index[-1]) if len(c) else (None, None)
        w = df.loc[a:b] if a else df.iloc[0:0]
        out["missing_in_common"][cc] = {col: [m for m in w.index[w[col].isna()]]
                                        for col in ("equity_usd", "fx", "bond_yield", "short_rate")}
        dy = df["bond_yield"].diff()
        ds = df["short_rate"].diff()
        out["jumps"][cc] = {
            "bond_yield_abs_change_gt_2pp": list(w.index[dy.reindex(w.index).abs() > 2]),
            "short_rate_abs_change_gt_2pp": list(w.index[ds.reindex(w.index).abs() > 2]),
            "equity_local_abs_gt_30pct": list(w.index[w["equity_local"].abs() > 0.30]),
            "equity_local_kf_abs_gt_30pct": list(w.index[w["equity_local_kf"].abs() > 0.30]),
        }
        d = (df["equity_local"] - df["equity_local_kf"]) * 100
        sign_dis = ((np.sign(df["equity_local"]) != np.sign(df["equity_local_kf"])) & d.notna()
                    & (df["equity_local"].abs() > 1e-12))
        big = d.abs() > 1.0
        out["fx_vs_kf_local_pp"][cc] = {
            "all": q(d), "pre1999": q(d[d.index < "1999-01"]), "from1999": q(d[d.index >= "1999-01"]),
            "sign_disagree_months": list(df.index[sign_dis]), "months_absdiff_gt_1pp": list(df.index[big]),
        }
        _n, _fn, h10, quote, eur = COUNTRIES[cc]
        oecd = fred_monthly(f"CCUSSP01{cc}M650N")
        if h10:
            me = month_end(fred_raw(h10))
            usd_per = me if quote == "usd_per_lcu" else 1 / me
            mm = month_mean(fred_raw(h10))
            usd_mm = mm if quote == "usd_per_lcu" else 1 / mm
        else:
            me = month_end(fred_raw("DEXUSEU"))
            usd_per, usd_mm = me[me.index >= "1999-01"], None
        common = oecd.index.intersection(usd_per.index)
        rel = (oecd[common] / usd_per[common] - 1) * 100
        entry = {"vs_month_end_pct": q(rel)}
        if usd_mm is not None:
            cm = oecd.index.intersection(usd_mm.index)
            entry["vs_month_mean_pct"] = q((oecd[cm] / usd_mm[cm] - 1) * 100)
        out["oecd_fx_vs_h10_rel"][cc] = entry
    # 德国：OECD 旧马克期末汇率 vs 德国央行法兰克福定价月末
    dem = month_end(bbk("bbk_usd_dem_daily.csv"))
    oecd_de = 1.95583 / fred_monthly("CCUSSP01DEM650N")
    cm = [m for m in oecd_de.index if "1971-01" <= m <= "1998-12" and m in dem.index]
    out["oecd_de_vs_bbk_frankfurt_month_end_pct"] = q((oecd_de[cm] / dem[cm] - 1) * 100)
    dem_mm = month_mean(bbk("bbk_usd_dem_daily.csv"))
    out["oecd_de_vs_bbk_frankfurt_month_mean_pct"] = q((oecd_de[cm] / dem_mm[cm] - 1) * 100)

    # 债券：德国、日本用月末收益率构造的 10 年债收益 vs 用 OECD（月均）构造的，月度差异量级
    bond: dict = {}
    zst_m = bbk("bbk_zst10_monthly.csv")
    zst_d = bbk("bbk_zst10_daily.csv")
    zme, zmm = month_end(zst_d), month_mean(zst_d)
    cm = zst_m.index.intersection(zme.index)
    bond["DE_bbk_monthly_equals_daily_month_end_bp"] = q((zst_m[cm] - zme[cm]) * 100)
    bond["DE_bbk_monthly_vs_daily_month_mean_bp"] = q((zst_m[cm] - zmm.reindex(cm)) * 100)
    oecd_de_y = fred_monthly("IRLTLT01DEM156N")
    umr = bbk("bbk_umr_s13_r0910_monthly_avg.csv")
    for lab, ref in (("bbk_zst10_month_end", zst_m), ("bbk_zst10_daily_month_mean", zmm),
                     ("bbk_umr_9_10y_month_avg", umr)):
        c2 = oecd_de_y.index.intersection(ref.index)
        bond[f"DE_oecd_yield_minus_{lab}_bp"] = q((oecd_de_y[c2] - ref[c2]) * 100)
    de = panels["DE"]
    zr = bond_returns(zst_m[zst_m.index >= "1972-09"])
    c2 = de.index[de["bond_ret"].notna()].intersection(zr.dropna().index)
    bond["DE_bond_ret_oecd_minus_bbk_month_end_pp"] = q((de.loc[c2, "bond_ret"] - zr[c2]) * 100)

    mof = mof_10y()
    mme, mmm = month_end(mof), month_mean(mof)
    oecd_jp_y = fred_monthly("IRLTLT01JPM156N")
    for lab, ref in (("mof_month_end", mme), ("mof_month_mean", mmm)):
        c2 = oecd_jp_y.index.intersection(ref.index)
        bond[f"JP_oecd_yield_minus_{lab}_bp"] = q((oecd_jp_y[c2] - ref[c2]) * 100)
    jp = panels["JP"]
    mr = bond_returns(mme[mme.index >= "1986-08"])
    c2 = jp.index[jp["bond_ret"].notna()].intersection(mr.dropna().index)
    bond["JP_bond_ret_oecd_minus_mof_month_end_pp"] = q((jp.loc[c2, "bond_ret"] - mr[c2]) * 100)
    # 同一月末收益率、月均收益率分别换算，看平滑造成的差异量级（德国央行日度 1997-08 起）
    zr_me = bond_returns(zme[zme.index >= "1997-09"])
    zr_mm = bond_returns(zmm[zmm.index >= "1997-09"])
    c2 = zr_me.dropna().index.intersection(zr_mm.dropna().index)
    bond["DE_bond_ret_month_mean_minus_month_end_same_source_pp"] = q((zr_mm[c2] - zr_me[c2]) * 100)
    out["bond"] = bond

    # 短端拼接：拼接月前后 12 个月里两序列同时有值时的水平差（百分点）
    spl: dict = {}
    for cc in panels:
        sers = {p: fred_monthly(f"{p}{cc}M156N") for p in SHORT_ORDER}
        sers = {k: v for k, v in sers.items() if v is not None}
        if len(sers) < 2:
            continue
        keys = list(sers)
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                c2 = sers[keys[i]].index.intersection(sers[keys[j]].index)
                if len(c2):
                    first = c2[:24]
                    spl[f"{cc}:{keys[i]}-{keys[j]}"] = {"overlap_first": c2[0], "overlap_last": c2[-1],
                                                       "first24_abs_diff_pp": q(sers[keys[i]][first] - sers[keys[j]][first])}
    for cc, sid in BOND_EXT.items():
        a, b = fred_monthly(f"IRLTLT01{cc}M156N"), fred_monthly(sid)
        c2 = a.index.intersection(b.index)
        spl[f"{cc}:IRLTLT01-{sid}"] = {"overlap_first": c2[0], "overlap_last": c2[-1],
                                       "first24_abs_diff_pp": q(a[c2[:24]] - b[c2[:24]])}
    out["splice_overlap"] = spl
    return out


def us_checks(us: pd.DataFrame) -> dict:
    """GS10 1871–1952 年内是否等增量（年度插值）；缺失。"""
    g = us["bond_yield"]
    eq_years, years = 0, 0
    for y in range(1871, 1953):
        s = g[[f"{y}-{m:02d}" for m in range(1, 13)]]
        inc = s.diff().dropna()
        years += 1
        eq_years += int(inc.max() - inc.min() < 1e-6)
    return {"rows": int(len(us)), "missing": {c: int(us[c].isna().sum()) for c in ("equity_ret", "bond_yield", "short_rate")},
            "gs10_equal_increment_years": eq_years, "years": years,
            "bond_yield_abs_change_gt_2pp": list(us.index[g.diff().abs() > 2]),
            "short_rate_abs_change_gt_2pp": list(us.index[us["short_rate"].diff().abs() > 2]),
            "equity_abs_gt_30pct": list(us.index[us["equity_ret"].abs() > 0.30])}


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    panels, meta = {}, {}
    for cc in COUNTRIES:
        df, m = build_country(cc)
        panels[cc] = df
        meta[cc] = m
        df.to_csv(OUT / f"{m['name']}.csv", float_format="%.10g")
    us = build_us()
    us.to_csv(OUT / "US_1871_1952.csv", float_format="%.10g")
    chk = checks(panels)
    uchk = us_checks(us)
    meta_out = {
        "built_from": "inputs/raw/（见 raw/manifest.json）",
        "local_inputs_sha256": {"data-raw/sp500-backtest/shiller.csv": sha(SHILLER),
                                "docs/research/trend-1871-2026-11-26/inputs/cp.json": sha(CP_JSON)},
        "formulas": {
            "equity_local": "(1+equity_usd_t)*fx_t/fx_{t-1}-1; fx = 月末每美元兑本币（欧元区为旧货币单位）",
            "bond_ret": "P(y_t; c=y_{t-1}, T=10-1/12, 半年付息) - 1 + y_{t-1}/12",
            "cash_ret": "short_rate_{t-1}/100/12",
        },
        "short_rate_priority": SHORT_ORDER,
        "countries": meta,
    }
    (OUT / "panel_meta.json").write_text(json.dumps(meta_out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (OUT / "checks.json").write_text(json.dumps({"countries": chk, "US_1871_1952": uchk}, ensure_ascii=False, indent=1)
                                     + "\n", encoding="utf-8")
    for cc, m in meta.items():
        print(cc, m["name"], "common", m["in_common"], "main", m["main_ok"])
    print("US", uchk["rows"], uchk["missing"], "GS10 等增量年", uchk["gs10_equal_increment_years"], "/", uchk["years"])


if __name__ == "__main__":
    main()
