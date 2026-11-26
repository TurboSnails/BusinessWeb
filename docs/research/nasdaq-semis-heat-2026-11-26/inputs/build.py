"""把 raw/ 中的原始文件整理成 processed/ 下四个 CSV，并把完整性核对写进 checks_output.txt。

用法（仓库根目录）：
    cd research-py && uv run python ../docs/research/nasdaq-semis-heat-2026-11-26/inputs/build.py

输出：
- processed/nasdaq_daily.csv  date, nasdaqcom_fred, ixic_yahoo（两来源外连接；主序列为 FRED，缺失留空，不填充）
- processed/sox_daily.csv     date, sox_yahoo, sox_nasdaq（Nasdaq 接口 1994-05-04 以前的占位行已剔除）
- processed/kf49_tech.csv     month, chips_share, tech_share, chips_ret, tech_ret（口径见 AUDIT.md）
- processed/cftc_ndx.csv      report_date, am_net_pct_oi（仓库 market-radar.json 原值）,
                              open_interest, am_long, am_short, am_net_pct_oi_recalc（CFTC 原始接口重算，供核对）
- checks_output.txt           缺失、重复、两来源差异量级、对齐核对

禁令：只做整理与完整性核对，不计算任何收益水平、回撤、相关或分位类结果统计。
两来源核对只报「同一天两个收盘的相对差」；跳变检查只列日期、不列幅度。
"""

from __future__ import annotations

import io
import json
import math
import zipfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
PROC = HERE / "processed"
REPO = HERE.parents[3]
RADAR = REPO / "public/data/market-radar.json"
NY = ZoneInfo("America/New_York")
KF_MISSING = {-99.99, -999.0}
TECH = ["Hardw", "Softw", "Chips"]

LOG: list[str] = []


def log(*parts) -> None:
    line = " ".join(str(p) for p in parts)
    print(line)
    LOG.append(line)


# ---------------------------------------------------------------- 读取各来源

def read_fred(path: Path) -> tuple[pd.Series, int]:
    df = pd.read_csv(path, dtype=str)
    df.columns = ["date", "v"]
    blank = df["v"].isna() | (df["v"].str.strip().isin(["", "."]))
    s = pd.Series(df.loc[~blank, "v"].astype(float).values, index=df.loc[~blank, "date"].values)
    return s, int(blank.sum())


def read_yahoo(path: Path) -> tuple[pd.Series, dict]:
    r = json.loads(path.read_text(encoding="utf-8"))["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    dates = [datetime.fromtimestamp(t, NY).strftime("%Y-%m-%d") for t in r["timestamp"]]
    closes = q["close"]
    keep = [(d, c) for d, c in zip(dates, closes) if c is not None]
    s = pd.Series([round(c, 4) for _, c in keep], index=[d for d, _ in keep])
    meta = r["meta"]
    info = {
        "null_close": sum(c is None for c in closes),
        "ohlc_flat": sum(
            1 for o, h, l, c in zip(q["open"], q["high"], q["low"], closes)
            if None not in (o, h, l, c) and o == h == l == c
        ),
        "firstTradeDate": datetime.fromtimestamp(meta["firstTradeDate"], NY).strftime("%Y-%m-%d"),
        "regularMarketTime": datetime.fromtimestamp(meta["regularMarketTime"], NY).strftime("%Y-%m-%d %H:%M"),
    }
    # 平盘计数按年份分布，供判断早期是否只有收盘
    flat_years: dict[str, int] = {}
    for d, o, h, l, c in zip(dates, q["open"], q["high"], q["low"], closes):
        if None not in (o, h, l, c) and o == h == l == c:
            flat_years[d[:4]] = flat_years.get(d[:4], 0) + 1
    info["ohlc_flat_years"] = flat_years
    return s, info


def read_nasdaq(path: Path) -> tuple[pd.Series, dict]:
    """Nasdaq 官网接口。开头一段 open/high/low 全为 0.00 的常数占位行（真实数据开始前）剔除；
    之后 open/high/low 为 0.00 的行保留在原始序列里（多为节假日沿用前值，或早年只有收盘），由核对环节按主来源日历判别。"""
    rows = json.loads(path.read_text(encoding="utf-8"))["data"]["tradesTable"]["rows"]
    recs = []
    for x in rows:
        m, d, y = x["date"].split("/")
        zero = x["open"] == x["high"] == x["low"] == "0.00"
        recs.append((f"{y}-{m}-{d}", float(x["close"].replace(",", "")), zero))
    recs.sort()
    first_real = next(i for i, r in enumerate(recs) if not r[2])
    lead = recs[:first_real]
    body = recs[first_real:]
    info = {
        "rows_total": len(recs),
        "leading_filler_rows": len(lead),
        "leading_filler_span": (lead[0][0], lead[-1][0]) if lead else None,
        "leading_filler_values": sorted({r[1] for r in lead}),
        "zero_ohlc_rows_after_start": sum(1 for r in body if r[2]),
    }
    s = pd.Series([r[1] for r in body], index=[r[0] for r in body])
    s.attrs["zero_ohlc"] = {r[0] for r in body if r[2]}
    return s, info


# ---------------------------------------------------------------- 日线核对

def basic_checks(name: str, s: pd.Series) -> None:
    idx = pd.to_datetime(pd.Index(s.index))
    log(f"[{name}] {s.index.min()} → {s.index.max()}，{len(s)} 行")
    log(f"  重复日期 {int(pd.Index(s.index).duplicated().sum())}；周末日期 {int((idx.dayofweek >= 5).sum())}；"
        f"非正值 {int((s <= 0).sum())}；非有限值 {int((~np.isfinite(s.values)).sum())}")
    gaps = pd.Series(idx[1:] - idx[:-1], index=s.index[1:]).dt.days
    big = gaps[gaps > 5]
    log(f"  相邻交易日间隔 >5 个日历日：{len(big)} 处" + (f"，例如 {', '.join(f'{d}({g}天)' for d, g in big.head(8).items())}" if len(big) else ""))
    # 连续相同收盘（≥3 天）：可能是停滞或回填
    runs, start, cnt = [], None, 1
    vals, dates = s.values, list(s.index)
    for i in range(1, len(vals)):
        if vals[i] == vals[i - 1]:
            cnt += 1
            start = start or dates[i - 1]
        else:
            if cnt >= 3:
                runs.append((start, dates[i - 1], cnt))
            start, cnt = None, 1
    if cnt >= 3:
        runs.append((start, dates[-1], cnt))
    log(f"  连续 ≥3 天收盘完全相同：{len(runs)} 段" + (f"，{runs[:8]}" if runs else ""))
    # 跳变：只列日期，不报幅度（|对数变化| > 12%）
    lr = np.log(s.values[1:] / s.values[:-1])
    jump_dates = [dates[i + 1] for i in np.where(np.abs(lr) > math.log(1.12))[0]]
    log(f"  单日对数变化绝对值 >ln(1.12) 的日期（只列日期，供与另一来源对照）：{jump_dates}")


def compare(name: str, a: pd.Series, b: pd.Series, an: str, bn: str) -> None:
    common = a.index.intersection(b.index)
    only_a = a.index.difference(b.index)
    only_b = b.index.difference(a.index)
    log(f"[核对 {name}] 共同日期 {len(common)}；仅 {an} {len(only_a)}；仅 {bn} {len(only_b)}")
    if len(only_a):
        log(f"  仅 {an} 的日期范围 {only_a.min()} → {only_a.max()}，样例 {list(only_a[:10])}")
    if len(only_b):
        log(f"  仅 {bn} 的日期范围 {only_b.min()} → {only_b.max()}，样例 {list(only_b[:10])}")
        zo = b.attrs.get("zero_ohlc", set())
        wk = pd.to_datetime(only_b).dayofweek >= 5
        log(f"  仅 {bn} 的日期中：周末 {int(wk.sum())}；开高低为 0（节假日占位）{sum(d in zo for d in only_b)}")
    rel = (b.loc[common] / a.loc[common] - 1).abs()
    for th in (1e-6, 1e-4, 1e-3, 1e-2):
        log(f"  |{bn}/{an}-1| > {th:g}：{int((rel > th).sum())} 天")
    log(f"  相对差中位数 {rel.median():.2e}；99 分位 {rel.quantile(0.99):.2e}；最大 {rel.max():.2e}（{rel.idxmax()}）")
    top = rel.sort_values(ascending=False).head(10)
    log("  相对差最大的 10 天：" + "; ".join(f"{d} {a[d]}/{b[d]} ({v:.2e})" for d, v in top.items()))
    # 按年代分组的差异量级
    dec = pd.Series(rel.values, index=[d[:3] + "0s" for d in common])
    g = dec.groupby(level=0).agg(["count", "median", "max", lambda x: int((x > 1e-3).sum())])
    g.columns = ["n", "median", "max", "n_gt_1e-3"]
    log("  分年代：\n" + g.to_string(float_format=lambda v: f"{v:.2e}"))
    yr = pd.Series(rel.values > 1e-2, index=[d[:4] for d in common]).groupby(level=0).sum()
    log(f"  相对差 >1e-2 的天数按年（只列非零年）：{ {k: int(v) for k, v in yr.items() if v} }")
    big = rel[rel > 1e-2].index
    if len(big):
        log(f"  相对差 >1e-2 的首日 {big.min()}、末日 {big.max()}")


def arbitrate(a: pd.Series, b: pd.Series, c: pd.Series) -> None:
    """FRED(a) 与 Yahoo(b) 相对差 >1e-3 的日子，看第三来源 Nasdaq(c) 与谁一致（相对差 <1e-4）。"""
    common = a.index.intersection(b.index)
    rel = (b.loc[common] / a.loc[common] - 1).abs()
    bad = rel[rel > 1e-3].index
    withc = [d for d in bad if d in c.index]
    near_a = sum(abs(c[d] / a[d] - 1) < 1e-4 for d in withc)
    near_b = sum(abs(c[d] / b[d] - 1) < 1e-4 for d in withc)
    log(f"[裁决] FRED 与 Yahoo 相对差 >1e-3 的 {len(bad)} 天中，第三来源有值 {len(withc)} 天："
        f"Nasdaq 与 FRED 一致 {near_a} 天，与 Yahoo 一致 {near_b} 天，都不一致 {len(withc) - near_a - near_b} 天")
    yrs = pd.Series([d[:4] for d in bad]).value_counts().sort_index().to_dict()
    log(f"  这些天按年分布：{yrs}")
    neither = [d for d in withc if abs(c[d] / a[d] - 1) >= 1e-4 and abs(c[d] / b[d] - 1) >= 1e-4]
    log(f"  三者都不一致的样例：{[(d, a[d], b[d], c[d]) for d in neither[:10]]}")
    yonly = [d for d in withc if abs(c[d] / b[d] - 1) < 1e-4]
    log(f"  Nasdaq 与 Yahoo 一致（FRED 偏离）的样例：{[(d, a[d], b[d], c[d]) for d in yonly[:10]]}")
    fonly = [d for d in withc if abs(c[d] / a[d] - 1) < 1e-4]
    log(f"  Nasdaq 与 FRED 一致（Yahoo 偏离）的样例：{[(d, a[d], b[d], c[d]) for d in fonly[:10]]}")


def stale_check(y: pd.Series, n: pd.Series) -> None:
    """SOX：Yahoo 与 Nasdaq 相对差 >1e-3 的日子（1996 年除外），Nasdaq 当天值是否等于前一交易日值（陈旧沿用）。
    只比较价位是否相同，不计算变化幅度。"""
    common = y.index.intersection(n.index)
    yy, nn = y.loc[common], n.loc[common]
    rel = (nn / yy - 1).abs()
    bad = [d for d in rel[rel > 1e-3].index if not d.startswith("1996")]
    pos = {d: i for i, d in enumerate(common)}
    stale_n = [d for d in bad if pos[d] > 0 and nn.iloc[pos[d]] == nn.iloc[pos[d] - 1]]
    stale_y = [d for d in bad if pos[d] > 0 and yy.iloc[pos[d]] == yy.iloc[pos[d] - 1]]
    big = [d for d in bad if rel[d] > 1e-2]
    log(f"[SOX 陈旧值] 1996 年以外相对差 >1e-3 的 {len(bad)} 天中：Nasdaq 当天值 = 前一交易日 {len(stale_n)} 天，"
        f"Yahoo 当天值 = 前一交易日 {len(stale_y)} 天；其中相对差 >1e-2 的 {len(big)} 天里 Nasdaq 陈旧 {sum(d in stale_n for d in big)} 天")
    log(f"  Nasdaq 陈旧日期：{stale_n}")
    blk = [d for d in bad if "2007-02-07" <= d <= "2007-02-22"]
    log(f"  2007-02-07 至 2007-02-22 连续 {len(blk)} 天两来源相对差稳定在 {rel[blk].min():.2e}–{rel[blk].max():.2e}（成块偏移）")


# ---------------------------------------------------------------- Ken French

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
    assert df.shape[1] == 49, (title, df.shape)
    return df


def build_kf() -> pd.DataFrame:
    with zipfile.ZipFile(RAW / "49_Industry_Portfolios_CSV.zip") as z:
        text = z.read("49_Industry_Portfolios.csv").decode("latin-1")
    lines = text.splitlines()
    log(f"[KF] 文件首行：{lines[0].strip()}")
    vw = kf_section(lines, "Average Value Weighted Returns -- Monthly")
    nf = kf_section(lines, "Number of Firms in Portfolios")
    sz = kf_section(lines, "Average Firm Size")
    assert list(vw.index) == list(nf.index) == list(sz.index)
    assert list(vw.columns) == list(nf.columns) == list(sz.columns)
    months = pd.PeriodIndex(vw.index, freq="M")
    assert (months[1:] - months[:-1] == months.freq * 1).all() if hasattr(months.freq, "n") else True
    log(f"[KF] 月度表 {vw.index[0]} → {vw.index[-1]}，{len(vw)} 个月；行业 {', '.join(vw.columns)}")
    gaps = [(str(a), str(b)) for a, b in zip(months[:-1], months[1:]) if (b - a).n != 1]
    log(f"[KF] 月份缺口：{gaps}")

    vw_m = vw.isin(KF_MISSING)
    sz_m = sz.isin(KF_MISSING)
    nf_m = nf.isin(KF_MISSING)
    log(f"[KF] 缺失码计数：VW {int(vw_m.values.sum())}，公司数 {int(nf_m.values.sum())}，平均规模 {int(sz_m.values.sum())}")
    zero = nf == 0
    log(f"[KF] 公司数为 0 的格子 {int(zero.values.sum())}；其中平均规模为缺失码 {int((zero & sz_m).values.sum())}，"
        f"VW 为缺失码 {int((zero & vw_m).values.sum())}")
    log(f"[KF] 公司数 >0 但 VW 缺失 {int((~zero & vw_m).values.sum())}；公司数 >0 但规模缺失 {int((~zero & sz_m).values.sum())}；"
        f"公司数 0 但 VW 有值 {int((zero & ~vw_m).values.sum())}")
    for ind in TECH:
        first = nf.index[(nf[ind] > 0).values][0]
        log(f"[KF] {ind} 首个公司数>0 的月份 {first}；该月公司数 {int(nf.loc[first, ind])}；"
            f"首个 VW 非缺失月份 {vw.index[(~vw_m[ind]).values][0]}")
    first_all = nf.index[(nf > 0).all(axis=1).values][0]
    log(f"[KF] 49 个行业全部有公司的首月 {first_all}")

    # 行业市值（百万美元）= 公司数 × 平均规模；公司数为 0 或规模缺失时记 0（行业当月不存在）
    cap = (nf.where(~nf_m, 0) * sz.where(~sz_m, 0)).where(nf > 0, 0.0)
    total = cap.sum(axis=1)
    ret = vw.where(~vw_m)  # 缺失码 → NaN，单位 %

    # 对齐核对：平均规模是月初值（= 上月末市值）还是月末值？
    # 只在公司数不变的格子里比较 log(市值变化) 与 log(1+收益) 的偏离量级，不报收益本身。
    same_n_next = (nf.shift(-1) == nf) & (nf > 0)
    same_n_prev = (nf.shift(1) == nf) & (nf > 0)
    lr = np.log1p(ret / 100)
    dev_begin = (np.log(cap.shift(-1) / cap) - lr).where(same_n_next)  # 行 t 规模 = t 月初
    dev_end = (np.log(cap / cap.shift(1)) - lr).where(same_n_prev)     # 行 t 规模 = t 月末
    db = dev_begin.stack().abs()
    de = dev_end.stack().abs()
    log(f"[KF 对齐] 假设『行 t 平均规模 = t 月初（t-1 月末）』：|log 市值变化 − log(1+r_t)| 中位数 {db.median():.4f}，"
        f"<0.01 占 {(db < 0.01).mean():.1%}（n={len(db)}）")
    log(f"[KF 对齐] 假设『行 t 平均规模 = t 月末』：同一偏离中位数 {de.median():.4f}，<0.01 占 {(de < 0.01).mean():.1%}（n={len(de)}）")

    w = cap[TECH].div(cap[TECH].sum(axis=1), axis=0)
    r3 = ret[TECH]
    # 三行业中有公司但收益缺失的月份 → tech_ret 记缺失（不重新归一化）
    bad = ((cap[TECH] > 0) & r3.isna()).any(axis=1)
    tech_ret = (w * r3.fillna(0)).sum(axis=1).where(~bad & (cap[TECH].sum(axis=1) > 0))
    out = pd.DataFrame({
        "chips_share": (cap["Chips"] / total).round(8),
        "tech_share": (cap[TECH].sum(axis=1) / total).round(8),
        "chips_ret": ret["Chips"].round(4),
        "tech_ret": tech_ret.round(6),
    })
    out.index.name = "month"
    log(f"[KF] tech_ret 因成分收益缺失而留空的月份 {int(bad.sum())}；chips_ret 空 {int(out['chips_ret'].isna().sum())}")
    # 份额只做取值范围核对（不报水平）
    log(f"[KF] 份额取值范围核对：chips_share ∈ [0,1] {bool(out['chips_share'].between(0, 1).all())}；"
        f"tech_share ≥ chips_share {bool((out['tech_share'] >= out['chips_share'] - 1e-12).all())}；"
        f"total 市值 >0 全部月份 {bool((total > 0).all())}")
    # 6 月→7 月是年度重新归类的时点，公司数跳变集中在 7 月
    jul = nf[TECH].diff().abs()
    jul_share = (jul[[m.endswith("-07") for m in nf.index]].sum() / jul.sum())
    log(f"[KF] 三行业公司数逐月变动中发生在 7 月（年度重新归类）的比例：{jul_share.round(3).to_dict()}")
    return out


# ---------------------------------------------------------------- CFTC

def build_cftc() -> pd.DataFrame:
    radar = json.loads(RADAR.read_text(encoding="utf-8"))
    ind = next(x for x in radar["indicators"] if x["id"] == "cftcNdxAsset")
    log(f"[CFTC] market-radar.json generatedAt={radar.get('generatedAt') or radar.get('updatedAt')}；"
        f"cftcNdxAsset 观测 {len(ind['history'])}，{ind['history'][0][0]} → {ind['history'][-1][0]}；"
        f"最新 observedOn={ind['observedOn']} value={ind['value']}")
    rep = pd.Series({d: v for d, v in ind["history"]}, name="am_net_pct_oi")
    log(f"[CFTC] 仓库 history 重复日期 {int(pd.Index([d for d, _ in ind['history']]).duplicated().sum())}；"
        f"星期分布 {pd.to_datetime(rep.index).day_name().value_counts().to_dict()}")
    raw = json.loads((RAW / "cftc_tff_20974.json").read_text(encoding="utf-8"))
    recs = {}
    for x in raw:
        d = x["report_date_as_yyyy_mm_dd"][:10]
        oi = float(x["open_interest_all"]); lo = float(x["asset_mgr_positions_long"]); sh = float(x["asset_mgr_positions_short"])
        recs[d] = (oi, lo, sh, round((lo - sh) / oi * 100, 2))
    api = pd.DataFrame.from_dict(recs, orient="index", columns=["open_interest", "am_long", "am_short", "am_net_pct_oi_recalc"])
    df = pd.concat([rep, api], axis=1).sort_index()
    df.index.name = "report_date"
    both = df.dropna(subset=["am_net_pct_oi", "am_net_pct_oi_recalc"])
    diff = (both["am_net_pct_oi"] - both["am_net_pct_oi_recalc"]).abs()
    log(f"[CFTC] 原始接口 {len(api)} 期，{api.index.min()} → {api.index.max()}；仅仓库 {int(df['am_net_pct_oi_recalc'].isna().sum())} 期；"
        f"仅接口 {int(df['am_net_pct_oi'].isna().sum())} 期")
    log(f"[CFTC] 共同 {len(both)} 期，仓库值与重算值差（百分点）>0.005 的 {int((diff > 0.005).sum())} 期，最大 {diff.max():.4f}")
    idx = pd.to_datetime(df.index)
    gaps = pd.Series(idx[1:] - idx[:-1], index=df.index[1:]).dt.days
    log(f"[CFTC] 相邻报告间隔 ≠7 天：{gaps[gaps != 7].to_dict()}")
    df[["open_interest", "am_long", "am_short"]] = df[["open_interest", "am_long", "am_short"]].astype("Int64")
    return df


# ---------------------------------------------------------------- 主流程

def main() -> None:
    PROC.mkdir(parents=True, exist_ok=True)

    fred, fred_blank = read_fred(RAW / "NASDAQCOM_fred.csv")
    log(f"[FRED NASDAQCOM] 空值行（休市日占位）{fred_blank}")
    ixic, ixic_info = read_yahoo(RAW / "IXIC_yahoo_chart.json")
    log(f"[Yahoo ^IXIC] {ixic_info}")
    basic_checks("FRED NASDAQCOM", fred)
    basic_checks("Yahoo ^IXIC", ixic)
    compare("纳斯达克综合", fred, ixic, "FRED", "Yahoo")
    log(f"  FRED 独有日期的值与前一交易日：2019-04-18={fred.get('2019-04-18')}，2019-04-19={fred.get('2019-04-19')}")
    comp, comp_info = read_nasdaq(RAW / "COMP_nasdaq_historical.json")
    log(f"[Nasdaq COMP] {comp_info}")
    basic_checks("Nasdaq COMP", comp)
    compare("纳斯达克综合（第三来源）", fred, comp, "FRED", "NasdaqCOMP")
    arbitrate(fred, ixic, comp)
    # 行 = FRED ∪ Yahoo 的日期；Nasdaq 官网列只在这些日期上并入（其节假日占位行不进入）
    nas = pd.concat([fred.rename("nasdaqcom_fred"), ixic.rename("ixic_yahoo")], axis=1).sort_index()
    nas["comp_nasdaq"] = comp.reindex(nas.index)
    nas.index.name = "date"
    nas.to_csv(PROC / "nasdaq_daily.csv")

    soxy, soxy_info = read_yahoo(RAW / "SOX_yahoo_chart.json")
    log(f"[Yahoo ^SOX] {soxy_info}")
    soxn, soxn_info = read_nasdaq(RAW / "SOX_nasdaq_historical.json")
    log(f"[Nasdaq SOX] {soxn_info}")
    basic_checks("Yahoo ^SOX", soxy)
    basic_checks("Nasdaq SOX", soxn)
    compare("费城半导体", soxy, soxn, "Yahoo", "Nasdaq")
    stale_check(soxy, soxn)
    for d in ("1995-07-21", "1995-07-24", "1995-07-25"):
        log(f"  1995-07-24 两拆一前后：{d} Yahoo={soxy.get(d)} Nasdaq={soxn.get(d)}")
    # 行 = Yahoo 交易日（主来源）；Nasdaq 独有日期（节假日占位、1996 年周末日期）不进入
    sox = pd.DataFrame({"sox_yahoo": soxy, "sox_nasdaq": soxn.reindex(soxy.index)}).sort_index()
    sox.index.name = "date"
    sox.to_csv(PROC / "sox_daily.csv")

    kf = build_kf()
    kf.to_csv(PROC / "kf49_tech.csv")

    cftc = build_cftc()
    cftc.to_csv(PROC / "cftc_ndx.csv")

    (HERE / "checks_output.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
