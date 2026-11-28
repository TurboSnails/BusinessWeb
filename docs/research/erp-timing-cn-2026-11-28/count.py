"""L-057 调研阶段：数据核对 + 事件计数。不读任何指数价格、不计算任何收益 / 回撤 / 夏普。

输入：data-raw/erp-timing-cn/raw/*.json（见 data-raw/erp-timing-cn/SOURCES.md）、public/data/cn-market-data.json（中债 10 年，只作第二来源核对）。
输出：本目录 count-results.json、count.csv。
用法：research-py/.venv/bin/python -I docs/research/erp-timing-cn-2026-11-28/count.py
"""
import json, pathlib, collections, statistics as st
import pandas as pd
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
RAW = ROOT / "data-raw/erp-timing-cn/raw"
MAIN_END = pd.Timestamp("2023-10-31")  # 主判定窗口截止；之后为留出（锁箱解封后只读一次）
out = {"generated": pd.Timestamp.now().strftime("%Y-%m-%d"), "note": "只含数据核对与信号计数，不含任何收益"}


def load(name):
    d = json.loads((RAW / f"{name}.json").read_text())
    return pd.DataFrame(d["rows"], columns=d["columns"])


# ---------- 1. 沪深 300 PE ----------
lg = load("lg_pe_csi300")
lg["date"] = pd.to_datetime(lg["日期"].str[:10])
lg = lg.set_index("date").sort_index()
lg["ym"] = lg.index.to_period("M")

cs = {}
for code in ("000300", "000985"):
    d = json.loads((RAW / f"csindex_pe_{code}.json").read_text())
    df = pd.DataFrame(d["rows"])
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").sort_index()
    df["peg"] = pd.to_numeric(df["peg"], errors="coerce")
    df.loc[df["peg"] <= 0, "peg"] = np.nan
    first = df["peg"].first_valid_index()
    after = df.loc[first:]
    out[f"csindex_{code}"] = {
        "rows": int(len(df)), "first_pe": str(first.date()), "last": str(df.index[-1].date()),
        "pe_rows": int(after["peg"].notna().sum()), "missing_pe_after_start": int(after["peg"].isna().sum()),
        "missing_dates_sample": [str(x.date()) for x in after.index[after["peg"].isna()][:10]],
    }
    cs[code] = after["peg"].dropna()

# 月末对齐：中证官网 peg 取每月最后一个有值交易日
cs_m = {k: v.groupby(v.index.to_period("M")).last() for k, v in cs.items()}
cmp = pd.DataFrame({"lg_ttm": lg.set_index("ym")["滚动市盈率"], "cs": cs_m["000300"]}).dropna()
ratio = cmp["lg_ttm"] / cmp["cs"]
out["pe_crosscheck_csi300_lg_vs_csindex"] = {
    "months": int(len(cmp)), "from": str(cmp.index[0]), "to": str(cmp.index[-1]),
    "ratio_median": round(float(ratio.median()), 4), "ratio_p05": round(float(ratio.quantile(.05)), 4),
    "ratio_p95": round(float(ratio.quantile(.95)), 4), "abs_pct_diff_mean": round(float((ratio - 1).abs().mean() * 100), 2),
    "corr": round(float(cmp.corr().iloc[0, 1]), 4),
    "months_abs_diff_gt_5pct": int(((ratio - 1).abs() > .05).sum()),
}
# 乐咕静态 vs 滚动
out["lg_static_vs_ttm_ratio_median"] = round(float((lg["静态市盈率"] / lg["滚动市盈率"]).median()), 4)
out["lg_pe_csi300"] = {"rows": int(len(lg)), "from": str(lg.index[0].date()), "to": str(lg.index[-1].date()),
                        "missing_months": [str(p) for p in pd.period_range(lg["ym"].iloc[0], lg["ym"].iloc[-1], freq="M") if p not in set(lg["ym"])]}

# ---------- 2. 10 年期国债 ----------
em = load("em_bond_10y")
em["date"] = pd.to_datetime(em["日期"].str[:10])
y10 = em.set_index("date")["中国国债收益率10年"].astype(float)
y10_first = y10.first_valid_index()
y10v = y10.loc[y10_first:]
bd = pd.bdate_range(y10_first, y10.index[-1])
miss = bd.difference(y10v.dropna().index)
cb = json.loads((ROOT / "public/data/cn-market-data.json").read_text())["series"]["cnTenYear"]["history"]
cb = pd.Series({pd.Timestamp(d): v for d, v in cb})
j = pd.DataFrame({"em": y10v, "cb": cb}).dropna()
out["y10_em"] = {"rows_with_value": int(y10v.notna().sum()), "first": str(y10_first.date()), "last": str(y10.index[-1].date()),
                 "business_days_missing": int(len(miss)),
                 "missing_by_year": {str(k): int(v) for k, v in collections.Counter(m.year for m in miss).items()},
                 "longest_gap_days": int(pd.Series(y10v.dropna().index).diff().dt.days.max())}
out["y10_em_vs_chinabond"] = {"common_dates": int(len(j)), "from": str(j.index[0].date()), "to": str(j.index[-1].date()),
                              "mean_abs_diff_bp": round(float((j.em - j.cb).abs().mean() * 100), 2),
                              "max_abs_diff_bp": round(float((j.em - j.cb).abs().max() * 100), 2),
                              "dates_diff_gt_5bp": int(((j.em - j.cb).abs() > .05).sum())}
y10_m = y10v.dropna().groupby(y10v.dropna().index.to_period("M")).last()

# ---------- 3. 货币供应（统计月） ----------
sina = load("sina_money_supply")
sina["ym"] = sina["统计时间"].map(lambda s: pd.Period(f"{s.split('.')[0]}-{int(s.split('.')[1]):02d}", "M"))
sina = sina.set_index("ym").sort_index()
m1y = sina["货币(狭义货币M1)同比增长"].astype(float)
m2y = sina["货币和准货币（广义货币M2）同比增长"].astype(float)
emm = load("em_money_supply")
emm["ym"] = emm["月份"].map(lambda s: pd.Period(f"{s[:4]}-{s[5:7]}", "M"))
emm = emm.set_index("ym").sort_index()
c2 = pd.DataFrame({"sina_m1": m1y, "em_m1": emm["货币(M1)-同比增长"], "sina_m2": m2y, "em_m2": emm["货币和准货币(M2)-同比增长"]}).dropna()
out["money_sina"] = {"m1_yoy_first": str(m1y.first_valid_index()), "m2_yoy_first": str(m2y.first_valid_index()), "last": str(sina.index[-1]),
                     "missing_months_since_2004": [str(p) for p in pd.period_range("2004-01", sina.index[-1], freq="M") if p not in sina.index or pd.isna(m1y.get(p)) or pd.isna(m2y.get(p))]}
out["money_sina_vs_em"] = {"months": int(len(c2)), "m1_max_abs_diff": round(float((c2.sina_m1 - c2.em_m1).abs().max()), 3),
                           "m2_max_abs_diff": round(float((c2.sina_m2 - c2.em_m2).abs().max()), 3)}
# 金十：M2 同比首发值与发布日
jin = json.loads((RAW / "jin10_m2_releases.json").read_text())
rel = pd.DataFrame([v for v in jin["values"] if v[1] is not None], columns=["date", "val", "fc", "prev"])
rel["date"] = pd.to_datetime(rel["date"])
real = rel[rel["date"] >= "2010-11-01"].copy()  # 2010-11 之前金十日期是占位的月初，不是真实发布日
real = real.sort_values("date").drop_duplicates("date")
real["stat_ym"] = (real["date"].dt.to_period("M") - 1)
# 同一统计月若有两条（如 2019-04、2020-02），取第一条
real = real.drop_duplicates("stat_ym", keep="first")
real["day"] = real["date"].dt.day
cmpm2 = real.set_index("stat_ym")["val"].to_frame("first_release").join(m2y.rename("sina_now"), how="inner").dropna()
d2 = (cmpm2.first_release - cmpm2.sina_now).abs()
out["m2_release_dates_jin10"] = {
    "real_dates_from": str(real["date"].iloc[0].date()), "real_dates_to": str(real["date"].iloc[-1].date()), "n": int(len(real)),
    "release_day_max": int(real["day"].max()), "release_day_median": float(real["day"].median()),
    "release_day_p90": float(real["day"].quantile(.9)),
    "latest_release_dates": real.nlargest(5, "day")[["date", "stat_ym"]].astype(str).values.tolist(),
    "first_release_vs_current_m2yoy": {"months": int(len(cmpm2)), "max_abs_diff_pp": round(float(d2.max()), 3),
                                       "months_diff_ge_0_1pp": int((d2 >= .1).sum()),
                                       "months_diff_ge_0_3pp": int((d2 >= .3).sum()),
                                       "largest": [[str(k), float(cmpm2.loc[k, 'first_release']), float(cmpm2.loc[k, 'sina_now'])] for k in d2.nlargest(5).index]},
}

# ---------- 4. 信号序列（月末） ----------
def pct_expanding(s, min_n):
    v = s.values; res = np.full(len(v), np.nan)
    for i in range(len(v)):
        if i + 1 >= min_n:
            w = v[: i + 1]; res[i] = (w <= v[i]).mean()
    return pd.Series(res, index=s.index)


def zone(p, hi, lo):
    return np.where(np.isnan(p), None, np.where(p >= hi, "H", np.where(p <= lo, "L", "M")))


def crossings(z, idx):
    """数区间切换；返回逐年 {进入 L, 进入 H, 切换总数} 与各区间月份数。"""
    by = collections.defaultdict(lambda: collections.Counter())
    prev = None
    for zi, t in zip(z, idx):
        if zi is None:
            continue
        by[t.year][f"months_{zi}"] += 1
        if prev is not None and zi != prev:
            by[t.year]["switch"] += 1
            by[t.year][f"enter_{zi}"] += 1
        prev = zi
    return {str(y): dict(c) for y, c in sorted(by.items())}


def state_rule(p, cut, back):
    """两状态带滞后：p ≤ cut → 降仓；降仓后 p ≥ back 才恢复。返回 1 / 0.5 序列（NaN 期为 NaN）。"""
    pos, cur = [], 1.0
    for x in p:
        if np.isnan(x):
            pos.append(np.nan); continue
        if cur == 1.0 and x <= cut:
            cur = 0.5
        elif cur == 0.5 and x >= back:
            cur = 1.0
        pos.append(cur)
    return pd.Series(pos, index=p.index)


def switches(pos):
    s = pos.dropna(); ch = s.diff().fillna(0) != 0
    by = collections.Counter(t.year for t in s.index[ch])
    low = collections.Counter(t.year for t in s.index[s < 1])
    return {"switches_total": int(ch.sum()), "switches_by_year": {str(k): int(v) for k, v in sorted(by.items())},
            "months_reduced": int((s < 1).sum()), "months_total": int(len(s)),
            "avg_position": round(float(s.mean()), 4), "reduced_months_by_year": {str(k): int(v) for k, v in sorted(low.items())},
            "reduced_spells": spells(s)}


def spells(s):
    out_, start = [], None
    for t, v in s.items():
        if v < 1 and start is None:
            start = t
        if v == 1 and start is not None:
            out_.append([str(start), str(prev_t)]); start = None
        prev_t = t
    if start is not None:
        out_.append([str(start), str(prev_t) + "（未结束）"])
    return out_


lgm = lg.set_index("ym")
series = {
    "S1_lg_csi300_ttm": 100 / lgm["滚动市盈率"] - y10_m.reindex(lgm.index),
    "S2_cs_csi300_peg": 100 / cs_m["000300"] - y10_m.reindex(cs_m["000300"].index),
    "S3_cs_csiall_peg": 100 / cs_m["000985"] - y10_m.reindex(cs_m["000985"].index),
    "E1_lg_csi300_ey_only": 100 / lgm["滚动市盈率"],
}
csv_rows = []
res = {}
for name, s in series.items():
    s = s.dropna()
    s_main = s[s.index <= MAIN_END.to_period("M")]
    r = {"months": int(len(s)), "from": str(s.index[0]), "to": str(s.index[-1]), "months_main": int(len(s_main))}
    for min_n in (36, 60):
        p = pct_expanding(s_main, min_n)
        tag = f"exp{min_n}"
        r[f"{tag}_first_signal"] = str(p.first_valid_index())
        for hi, lo in ((.8, .2), (.7, .3)):
            r[f"{tag}_zones_{int(hi*100)}_{int(lo*100)}"] = crossings(zone(p.values, hi, lo), p.index)
        if name.startswith("S1") or name.startswith("E1"):
            for cut, back in ((.2, .4), (.3, .5), (.2, .2)):
                r[f"{tag}_rule_cut{int(cut*100)}_back{int(back*100)}"] = switches(state_rule(p, cut, back))
            # 分时期的区间占比（检查利率下行导致的漂移）
            pz = pd.Series(zone(p.values, .8, .2), index=p.index)
            occ = {}
            for a, b in (("2008-01", "2015-12"), ("2016-01", "2023-10")):
                seg = pz[(pz.index >= pd.Period(a, "M")) & (pz.index <= pd.Period(b, "M"))].dropna()
                occ[f"{a}~{b}"] = {k: int(v) for k, v in collections.Counter(seg).items()}
            r[f"{tag}_zone_occupancy_80_20"] = occ
        if min_n == 36:
            for t, v in p.items():
                csv_rows.append({"series": name, "month": str(t), "erp": round(float(s_main[t]), 4), "pct_exp36": None if np.isnan(v) else round(float(v), 4)})
    # 滚动 60 个月 z 分数（站内 market-cycle 用 5 年 z）
    z = (s_main - s_main.rolling(60).mean()) / s_main.rolling(60).std()
    zz = np.where(z.isna(), None, np.where(z >= 1, "H", np.where(z <= -1, "L", "M")))
    r["roll60_z_zones_pm1"] = crossings(list(zz), z.index)
    # 简单描述：主窗口内 ERP 的最小、最大、首末（不是收益）
    r["erp_main_min"] = [str(s_main.idxmin()), round(float(s_main.min()), 3)]
    r["erp_main_max"] = [str(s_main.idxmax()), round(float(s_main.max()), 3)]
    res[name] = r
out["signals"] = res

# ---------- 5. M1−M2 剪刀差（按点时可得：统计月 m 在 m+1 月末可用） ----------
sc = (m1y - m2y).dropna()
sc_avail = sc.copy(); sc_avail.index = sc_avail.index + 1  # 决策月 = 统计月 + 1（月末决策）
d3 = sc_avail.diff(3)
win = sc_avail[(sc_avail.index >= pd.Period("2005-04", "M")) & (sc_avail.index <= MAIN_END.to_period("M"))]
d3w = d3.reindex(win.index)
sign_flip = collections.Counter(t.year for t, a, b in zip(win.index[1:], win.values[:-1], win.values[1:]) if np.sign(a) != np.sign(b))
dir_flip = collections.Counter(t.year for t, a, b in zip(d3w.index[1:], d3w.values[:-1], d3w.values[1:]) if not np.isnan(a) and np.sign(a) != np.sign(b))
out["m1m2"] = {"decision_months": int(len(win)), "from": str(win.index[0]), "to": str(win.index[-1]),
               "sign_flips_total": int(sum(sign_flip.values())), "sign_flips_by_year": {str(k): int(v) for k, v in sorted(sign_flip.items())},
               "d3_direction_flips_total": int(sum(dir_flip.values())), "d3_direction_flips_by_year": {str(k): int(v) for k, v in sorted(dir_flip.items())},
               "months_positive": int((win > 0).sum()), "months_d3_negative": int((d3w < 0).sum())}

# ---------- 6. C2 草案：ERP 分位 ≤ 0.30 且 M1−M2 较 3 个月前下降 → 50% ----------
p36 = pct_expanding(series["S1_lg_csi300_ttm"].dropna().pipe(lambda s: s[s.index <= MAIN_END.to_period("M")]), 36)
c2 = pd.Series(np.where(p36.isna(), np.nan, np.where((p36 <= .3) & (d3.reindex(p36.index) < 0), .5, 1.0)), index=p36.index)
out["rule_C2_erp30_and_m1m2_falling"] = switches(c2)
# 只有 M1−M2（探索）：剪刀差较 3 个月前下降且为负 → 50%
e2 = pd.Series(np.where(d3.reindex(p36.index).isna(), np.nan, np.where((d3.reindex(p36.index) < 0) & (sc_avail.reindex(p36.index) < 0), .5, 1.0)), index=p36.index)
out["rule_E2_m1m2_only"] = switches(e2)


# ---------- 7. 预注册草案的候选：滚动 60 个月 z 分数三档 ----------
def z60(s):
    s = s.dropna(); s = s[s.index <= MAIN_END.to_period("M")]
    return (s - s.rolling(60).mean()) / s.rolling(60).std()


def tier(z):
    return pd.Series(np.where(z.isna(), np.nan, np.where(z >= 1, 1.0, np.where(z <= -1, .5, .75))), index=z.index)


zS1 = z60(series["S1_lg_csi300_ttm"])
C1 = tier(zS1)
sc_neg = (sc_avail.reindex(C1.index) < 0)
C2x = pd.Series(np.where(C1.isna(), np.nan, np.where(sc_neg, np.maximum(C1 - .25, .5), C1)), index=C1.index)
out["rule_X_z60_3tier_m1m2neg_down1"] = switches(C2x)  # 被淘汰的写法：剪刀差多数月份为负，平均仓位被压到 0.62
d12 = sc_avail.diff(12).reindex(C1.index)
C2 = pd.Series(np.where(C1.isna() | d12.isna(), np.nan, np.clip(C1 + .25 * np.sign(d12), .5, 1.0)), index=C1.index)
out["m1m2_d12_in_C_window"] = {"flips": int((np.sign(d12.dropna()).diff().fillna(0) != 0).sum()), "neg_months": int((d12 < 0).sum()), "zero_months": int((d12 == 0).sum()), "months": int(d12.notna().sum())}
out["rule_C1_z60_3tier"] = switches(C1)
out["rule_C2_z60_3tier_m1m2_d12_pm1"] = switches(C2)
out["rule_E1_ey_only_z60_3tier"] = switches(tier(z60(series["E1_lg_csi300_ey_only"])))
out["rule_E3_C1_lag1m"] = switches(tier(zS1.shift(1)))
out["rule_S2_cs_csi300_z60_3tier"] = switches(tier(z60(series["S2_cs_csi300_peg"])))
out["rule_S3_cs_csiall_z60_3tier"] = switches(tier(z60(series["S3_cs_csiall_peg"])))
for nm, ps in (("C1", C1), ("C2", C2)):
    q = ps.dropna()
    out[f"rule_{nm}_tier_months"] = {str(k): int(v) for k, v in q.value_counts().sort_index().items()}
    out[f"rule_{nm}_tier_months_by_half"] = {h: {str(k): int(v) for k, v in q[(q.index >= pd.Period(a, "M")) & (q.index <= pd.Period(b, "M"))].value_counts().sort_index().items()}
                                           for h, a, b in (("H1", "2010-03", "2016-11"), ("H2", "2016-12", "2023-10"))}

(HERE / "count-results.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
pd.DataFrame(csv_rows).to_csv(HERE / "count.csv", index=False)
print(json.dumps({k: out[k] for k in out if k not in ("signals",)}, ensure_ascii=False, indent=1)[:6000])
