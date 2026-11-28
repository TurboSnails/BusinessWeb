"""A 股增持 / 回购 / 减持 / 解禁 事件计数（只数次数，不读任何价格或收益）。

口径在运行前写定（见 SCOPE.md 第三节）。只读：
  data-raw/insider-buyback-cn/raw/  （本机下载，不入库；来源与校验值见 data-raw/insider-buyback-cn/SOURCES.md）
  research-py/factor-data/cn/securities.parquet、st_pit.parquet （证券表与点时 ST；不读 prices.parquet）
截止 2023-10-31（factorlab cn 锁箱 2023-11-01 起，不数）。
输出同目录 counts.json。
"""
import json, glob, os, re, collections, datetime as dt, sys
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
RAW = os.path.join(ROOT, "data-raw", "insider-buyback-cn", "raw")
CN = os.path.join(ROOT, "research-py", "factor-data", "cn")
CUT = "2023-10-31"
OPEN_MKT = {"二级市场买卖", "竞价交易", "大宗交易"}       # 公开市场买卖；大宗交易单列
OPEN_MKT_STRICT = {"二级市场买卖", "竞价交易"}             # 主口径：不含大宗交易
STATE = re.compile(r"中央汇金|汇金|证券金融|证金|梧桐树|社会保障基金|社保基金")
ORG = re.compile(r"公司|集团|有限|合伙|基金|投资|资产|银行|证券|保险|信托|计划|中心|管理|委员会|政府|研究院|大学|厂|局")

def d(s):
    return None if not s else str(s)[:10]

# ---------- 证券表、ST ----------
sec = pd.read_parquet(os.path.join(CN, "securities.parquet"))
list_date = dict(zip(sec.code, sec.list_date.dt.strftime("%Y-%m-%d")))
delisted = set(sec.code[sec.status == "delisted"])
st = pd.read_parquet(os.path.join(CN, "st_pit.parquet"))
st = st[st.flag.isin(["ST", "*ST", "delisting"])]
st_iv = collections.defaultdict(list)
for r in st.itertuples():
    st_iv[r.code].append((r.start_date.strftime("%Y-%m-%d"), (r.end_date.strftime("%Y-%m-%d") if pd.notna(r.end_date) else "9999-12-31")))

def tags(code, day):
    """事件日的 ST、新股（上市不满 365 天）、证券表外。"""
    t = []
    if code not in list_date:
        t.append("not_in_securities")
    else:
        ld = list_date[code]
        if ld and (dt.date.fromisoformat(day) - dt.date.fromisoformat(ld)).days < 365:
            t.append("new_listing")
    if any(a <= day <= b for a, b in st_iv.get(code, [])):
        t.append("st")
    if code in delisted:
        t.append("later_delisted")
    return t

def overlap(events):
    """events: list of (code, day)。返回 ST / 新股 / 证券表外 / 后来退市 的计数。"""
    c = collections.Counter()
    for code, day in events:
        for t in tags(code, day):
            c[t] += 1
    return dict(c)

out = {"cutoff": CUT, "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(), "note": "只数次数，没有读取任何价格或收益"}

# ---------- 1. 董监高（巨潮 p_sysapi1030） ----------
rows = []
for f in sorted(glob.glob(os.path.join(RAW, "cninfo_p_sysapi1030", "[BS]_*.json"))):
    j = json.load(open(f, encoding="utf-8"))
    for r in j.get("records") or []:
        rows.append(dict(code=r["SECCODE"], name=r["SECNAME"], declare=d(r["DECLAREDATE"]), end=d(r["ENDDATE"]),
                         person=r.get("HUMANNAME"), dse=r.get("F001V"), position=r.get("F002V"), relation=r.get("F003V"),
                         shares=r.get("F006N"), price=r.get("F008N"), ratio=r.get("F007N"), reason=r.get("F010V"),
                         src=r.get("F011V"), side=os.path.basename(f)[0]))
ex = pd.DataFrame(rows).drop_duplicates()
ex = ex[ex.end <= CUT]
ex["year"] = ex.end.str[:4]
ex["lag"] = (pd.to_datetime(ex.declare) - pd.to_datetime(ex.end)).dt.days
ex["amount"] = ex.shares.abs() * ex.price
info = {"rows": int(len(ex)), "end_range": [ex.end.min(), ex.end.max()],
        "reason_counts": ex.reason.fillna("(空)").value_counts().head(15).to_dict(),
        "src_counts": ex.src.fillna("(空)").value_counts().to_dict(),
        "relation_counts": ex.relation.fillna("(空)").value_counts().head(8).to_dict()}
lag = ex.lag.dropna()
info["declare_minus_end_days"] = {"median": float(lag.median()), "share_le_2": float((lag <= 2).mean()),
                                  "share_le_5": float((lag <= 5).mean()), "share_gt_30": float((lag > 30).mean()),
                                  "share_negative": float((lag < 0).mean())}
lag_y = ex.groupby("year").lag.agg(lambda s: float((s <= 5).mean())).to_dict()
info["share_lag_le_5_by_year"] = lag_y
om = ex[ex.reason.isin(OPEN_MKT_STRICT)]
buy = om[(om.side == "B") & (om.shares > 0)].copy()
sell = om[(om.side == "S") & (om.shares < 0)].copy()
blk = ex[ex.reason == "大宗交易"]
# 申报（filing）= 同一（代码，董监高，公告日）合并
bf = buy.groupby(["code", "dse", "declare"]).agg(end=("end", "max"), amount=("amount", "sum"), n=("end", "size")).reset_index()
bf["year"] = bf.declare.str[:4]
sf = sell.groupby(["code", "dse", "declare"]).agg(end=("end", "max")).reset_index()
sf["year"] = sf.declare.str[:4]

# 聚集买入：同一股票 30 个自然日内（按变动截止日）≥2 名不同董监高公开市场买入；事件日 = 第 2 人的公告日；
# 同一股票 180 天内的后续聚集并入前一个事件（独立事件）。
def clusters(df, k=2, win=30, gap=180):
    ev = []
    for code, g in df.sort_values("end").groupby("code"):
        g = g.sort_values("end")
        last = None
        recs = list(g.itertuples())
        for i, r in enumerate(recs):
            e = dt.date.fromisoformat(r.end)
            names = {x.dse for x in recs[: i + 1] if 0 <= (e - dt.date.fromisoformat(x.end)).days <= win}
            if len(names) >= k:
                day = max(x.declare for x in recs[: i + 1] if 0 <= (e - dt.date.fromisoformat(x.end)).days <= win)
                if last is None or (dt.date.fromisoformat(day) - dt.date.fromisoformat(last)).days > gap:
                    ev.append((code, day, len(names)))
                    last = day
    return ev
cl2 = clusters(bf.assign(end=bf.end), 2)
cl3 = clusters(bf.assign(end=bf.end), 3)

# CMP（Cohen–Malloy–Pomorski 2012）改编：以（代码，董监高）为单位，用公开市场买卖（含卖出）判断。
# 例行 = 前 3 个日历年每年都在同一日历月交易过；机会 = 前 3 年每年都至少交易一次、但不是例行；
# 改编口径「非例行」= 不是例行（含前 3 年没有完整交易记录的人）。
trades = pd.concat([buy, sell])
trades["ym"] = trades.end.str[:7]
hist = collections.defaultdict(set)
for r in trades.itertuples():
    hist[(r.code, r.dse)].add(r.ym)
def cmp_class(code, dse, ym):
    y, m = int(ym[:4]), ym[5:]
    h = hist[(code, dse)]
    years_traded = all(any(x.startswith(f"{y-k}-") for x in h) for k in (1, 2, 3))
    if not years_traded:
        return "no_history"
    if all(f"{y-k}-{m}" in h for k in (1, 2, 3)):
        return "routine"
    return "opportunistic"
bf["cls"] = [cmp_class(c, p, e[:7]) for c, p, e in zip(bf.code, bf.dse, bf.end)]

years = [str(y) for y in range(2005, 2024)]
def by_year(series_years):
    c = collections.Counter(series_years)
    return {y: c.get(y, 0) for y in years}
tab = {
    "buy_rows": by_year(buy.year), "buy_filings": by_year(bf.year), "buy_stocks": {y: int(bf[bf.year == y].code.nunique()) for y in years},
    "buy_filings_amount_ge_1m": by_year(bf[bf.amount >= 1e6].year),
    "buy_opportunistic": by_year(bf[bf.cls == "opportunistic"].year), "buy_routine": by_year(bf[bf.cls == "routine"].year),
    "buy_no_history": by_year(bf[bf.cls == "no_history"].year),
    "cluster2_events": by_year([e[1][:4] for e in cl2]), "cluster3_events": by_year([e[1][:4] for e in cl3]),
    "sell_rows": by_year(sell.year), "sell_filings": by_year(sf.year), "sell_stocks": {y: int(sf[sf.year == y].code.nunique()) for y in years},
    "block_trade_rows": by_year(blk.year),
}
info["by_year"] = tab
info["distinct_stocks"] = {"buy": int(bf.code.nunique()), "sell": int(sf.code.nunique()), "cluster2": len({e[0] for e in cl2})}
info["overlap"] = {"buy_filings": overlap(zip(bf.code, bf.declare)), "cluster2": overlap([(e[0], e[1]) for e in cl2]),
                   "sell_filings": overlap(zip(sf.code, sf.declare))}
info["n"] = {"buy_filings": int(len(bf)), "cluster2": len(cl2), "cluster3": len(cl3), "sell_filings": int(len(sf)),
             "opportunistic": int((bf.cls == "opportunistic").sum()), "routine": int((bf.cls == "routine").sum())}
cl2_ex2015 = [e for e in cl2 if not ("2015-07-01" <= e[1] <= "2015-12-31")]
info["n"]["cluster2_excl_2015H2"] = len(cl2_ex2015)
out["exec_cninfo"] = info

# ---------- 2. 股东增减持（东方财富 RPT_SHARE_HOLDER_INCREASE） ----------
hi = pd.DataFrame(json.load(open(os.path.join(RAW, "em_holder_increase.json"), encoding="utf-8"))["rows"])
hi["notice"] = hi.NOTICE_DATE.str[:10]
hi = hi[hi.notice <= CUT]
hi["year"] = hi.notice.str[:4]
dse_names = set(zip(ex.code, ex.dse)) | set(zip(ex.code, ex.person))
def holder_type(code, name):
    name = name or ""
    if STATE.search(name):
        return "state_rescue"
    if (code, name) in dse_names:
        return "insider_person"
    if ORG.search(name):
        return "corporate"
    return "person_other"
hi["htype"] = [holder_type(c, n) for c, n in zip(hi.SECURITY_CODE, hi.HOLDER_NAME)]
# 字段含义（对照样本核实）：HOLD_RATIO = 变动后持股占总股本 %；AFTER_CHANGE_RATE = 本次变动占总股本 %（字段名有误导）。
hi["after_pct"] = hi.HOLD_RATIO
hi["chg_pct"] = hi.AFTER_CHANGE_RATE
hi["before_pct"] = hi.HOLD_RATIO - hi.chg_pct.where(hi.DIRECTION == "增持", -hi.chg_pct)
hi["big"] = (hi[["after_pct", "before_pct"]].max(axis=1) >= 5)
inc = hi[hi.DIRECTION == "增持"]; dec = hi[hi.DIRECTION == "减持"]
# 同一（代码，股东，公告日）合并为一条公告
incf = inc.drop_duplicates(["SECURITY_CODE", "HOLDER_NAME", "notice"])
decf = dec.drop_duplicates(["SECURITY_CODE", "HOLDER_NAME", "notice"])
# 每只股票每 90 天内的增持公告只算一次（独立事件，按公告日）
def indep(df, gap=90):
    ev = []
    for code, g in df.sort_values("notice").groupby("SECURITY_CODE"):
        last = None
        for day in g.notice:
            if last is None or (dt.date.fromisoformat(day) - dt.date.fromisoformat(last)).days > gap:
                ev.append((code, day)); last = day
    return ev
big_inc_nonstate = incf[incf.big & (incf.htype != "state_rescue")]
ind_big_inc = indep(big_inc_nonstate)
hinfo = {"rows": int(len(hi)), "notice_range": [hi.notice.min(), hi.notice.max()],
         "trade_date_null_share": float(hi.TRADE_DATE.isna().mean()), "start_date_null_share": float(hi.START_DATE.isna().mean()),
         "hold_ratio_null_share": float(hi.after_pct.isna().mean()), "price_null_share": float(hi.TRADE_AVERAGE_PRICE.isna().mean()),
         "htype_counts_inc": incf.htype.value_counts().to_dict(), "htype_counts_dec": decf.htype.value_counts().to_dict(),
         "notice_minus_end_days_median": float((pd.to_datetime(hi.notice) - pd.to_datetime(hi.END_DATE.str[:10])).dt.days.median())}
hinfo["by_year"] = {
    "inc_notices": by_year(incf.year), "inc_big_holder_notices": by_year(incf[incf.big].year),
    "inc_big_nonstate_indep_events": by_year([e[1][:4] for e in ind_big_inc]),
    "inc_big_nonstate_chg_ge_0p5pct": by_year(incf[incf.big & (incf.htype != "state_rescue") & (incf.chg_pct >= 0.5)].year),
    "inc_state_rescue": by_year(incf[incf.htype == "state_rescue"].year),
    "inc_corporate": by_year(incf[incf.htype == "corporate"].year), "inc_insider_person": by_year(incf[incf.htype == "insider_person"].year),
    "inc_stocks": {y: int(incf[incf.year == y].SECURITY_CODE.nunique()) for y in years},
    "dec_notices": by_year(decf.year), "dec_big_holder_notices": by_year(decf[decf.big].year),
    "dec_stocks": {y: int(decf[decf.year == y].SECURITY_CODE.nunique()) for y in years},
}
hinfo["distinct_stocks"] = {"inc": int(incf.SECURITY_CODE.nunique()), "dec": int(decf.SECURITY_CODE.nunique()), "inc_big_nonstate_indep": len({e[0] for e in ind_big_inc})}
hinfo["overlap"] = {"inc_big_nonstate_indep": overlap(ind_big_inc), "dec_notices": overlap(zip(decf.SECURITY_CODE, decf.notice))}
hinfo["n"] = {"inc_notices": int(len(incf)), "inc_big_nonstate_indep": len(ind_big_inc),
              "inc_big_nonstate_indep_excl_2015H2": len([e for e in ind_big_inc if not ("2015-07-01" <= e[1] <= "2015-12-31")]),
              "dec_notices": int(len(decf))}
out["holder_em"] = hinfo

# ---------- 3. 回购（东方财富 RPTA_WEB_GETHGLIST_NEW） ----------
rp = pd.DataFrame(json.load(open(os.path.join(RAW, "em_repurchase.json"), encoding="utf-8"))["rows"])
rp["plan"] = rp.DIM_DATE.str[:10]
rp = rp[rp.plan <= CUT]
rp["year"] = rp.plan.str[:4]
def purpose(t):
    t = t or ""
    inc_ = bool(re.search(r"股权激励|员工持股|激励计划", t))
    val = bool(re.search(r"维护公司价值|股东权益所必需|低估|信心|稳定股价|股价", t))
    can = ("注销" in t) or ("减少注册资本" in t)
    if inc_ and not (val or can): return "incentive"
    if (val or can) and not inc_: return "value_or_cancel"
    if inc_: return "mixed"
    return "unstated"
rp["purpose"] = rp.REPUROBJECTIVE.map(purpose)
rp["shares_total"] = rp.ZSZ / rp.CPRICE
rp["plan_pct_upper"] = rp.ZSZSX.fillna(rp.ZSZXX)
rp["done_pct"] = rp.REPURNUM / rp.shares_total * 100
done = rp[(rp.REPURPROGRESS == "006")]
done_known = done[done.FINISHDATE.str[:10].fillna("9999") <= CUT]
rinfo = {"rows": int(len(rp)), "plan_range": [rp.plan.min(), rp.plan.max()],
         "progress_counts": rp.REPURPROGRESS.value_counts().to_dict(), "purpose_counts": rp.purpose.value_counts().to_dict(),
         "finishdate_null_share_in_done": float(done.FINISHDATE.isna().mean())}
rinfo["by_year"] = {
    "plans": by_year(rp.year), "plan_stocks": {y: int(rp[rp.year == y].DIM_SCODE.nunique()) for y in years},
    "plans_value_or_cancel": by_year(rp[rp.purpose == "value_or_cancel"].year), "plans_incentive": by_year(rp[rp.purpose == "incentive"].year),
    "plans_mixed": by_year(rp[rp.purpose == "mixed"].year),
    "plans_upper_ge_1pct": by_year(rp[rp.plan_pct_upper >= 1].year),
    "completed": by_year(done.year), "completed_known_by_cut": by_year(done_known.year),
    "completed_ge_0p5pct": by_year(done[done.done_pct >= 0.5].year), "completed_ge_1pct": by_year(done[done.done_pct >= 1].year),
    "completed_ge_2pct": by_year(done[done.done_pct >= 2].year),
    "completion_announced_by_year": by_year(done_known.FINISHDATE.str[:4]),
    "completion_announced_ge_1pct_nonincentive": by_year(done_known[(done_known.done_pct >= 1) & (done_known.purpose != "incentive")].FINISHDATE.str[:4]),
}
rinfo["distinct_stocks"] = {"plans": int(rp.DIM_SCODE.nunique()), "completed_ge_1pct": int(done[done.done_pct >= 1].DIM_SCODE.nunique())}
rinfo["overlap"] = {"plans": overlap(zip(rp.DIM_SCODE, rp.plan)),
                    "completed_ge_1pct_nonincentive_at_finish": overlap(zip(done_known[(done_known.done_pct >= 1) & (done_known.purpose != "incentive")].DIM_SCODE,
                                                                           done_known[(done_known.done_pct >= 1) & (done_known.purpose != "incentive")].FINISHDATE.str[:10]))}
out["repurchase_em"] = rinfo

# ---------- 4. 解禁（东方财富 RPT_LIFT_STAGE） ----------
lf = pd.DataFrame(json.load(open(os.path.join(RAW, "em_lift_stage.json"), encoding="utf-8"))["rows"])
lf["day"] = lf.FREE_DATE.str[:10]
lf = lf[lf.day <= CUT]
lf["year"] = lf.day.str[:4]
def ltype(t):
    t = t or ""
    if "股权分置" in t: return "split_share_reform"
    if "股权激励" in t: return "incentive"
    if "定向增发" in t: return "private_placement"
    if "首发原股东" in t or "公开发行原股东" in t: return "ipo_original_holders"
    if "配售" in t: return "ipo_allotment"
    return "other"
lf["ltype"] = lf.FREE_SHARES_TYPE.map(ltype)
linfo = {"rows": int(len(lf)), "range": [lf.day.min(), lf.day.max()], "type_counts": lf.ltype.value_counts().to_dict(),
         "listing_state_counts": lf.LISTING_STATE.value_counts().to_dict()}
linfo["by_year"] = {"lifts": by_year(lf.year), "lift_stocks": {y: int(lf[lf.year == y].SECURITY_CODE.nunique()) for y in years},
                    "lifts_ge_5pct_total": by_year(lf[lf.TOTAL_RATIO >= 0.05].year), "lifts_ge_10pct_total": by_year(lf[lf.TOTAL_RATIO >= 0.10].year)}
for t in ["ipo_original_holders", "private_placement", "incentive", "ipo_allotment", "split_share_reform"]:
    linfo["by_year"][f"lifts_{t}"] = by_year(lf[lf.ltype == t].year)
linfo["overlap"] = {"lifts_ge_5pct_total": overlap(zip(lf[lf.TOTAL_RATIO >= 0.05].SECURITY_CODE, lf[lf.TOTAL_RATIO >= 0.05].day))}
out["lift_em"] = linfo

# ---------- 5. 东方财富董监高表（核对巨潮覆盖；只下了 2019 年一年） ----------
ef = os.path.join(RAW, "em_exec_hold_details.json")
if os.path.exists(ef):
    ee = pd.DataFrame(json.load(open(ef, encoding="utf-8"))["rows"])
    ee["day"] = ee.CHANGE_DATE.str[:10]
    ee = ee[ee.day <= CUT]
    yrs = sorted(ee.day.str[:4].unique())
    eeb = ee[ee.CHANGE_REASON.isin(OPEN_MKT_STRICT) & (ee.CHANGE_SHARES > 0)]
    bb = buy[buy.end.str[:4].isin(yrs)]
    k1 = set(zip(bb.code, bb.person, bb.end, bb.shares.round(0)))
    k2 = set(zip(eeb.SECURITY_CODE, eeb.PERSON_NAME, eeb.day, eeb.CHANGE_SHARES.round(0)))
    out["exec_em_crosscheck"] = {"years": yrs, "rows": int(len(ee)), "reason_counts": ee.CHANGE_REASON.value_counts().head(12).to_dict(),
                                 "match_open_market_buys": {"cninfo": len(k1), "eastmoney": len(k2), "both": len(k1 & k2)}}

# ---------- 6. 巨潮公告标题检索计数 ----------
cj = os.path.join(RAW, "cninfo_announcements", "_counts.json")
if os.path.exists(cj):
    out["cninfo_announcement_search"] = json.load(open(cj, encoding="utf-8"))["counts"]

json.dump(out, open(os.path.join(os.path.dirname(__file__), "counts.json"), "w"), ensure_ascii=False, indent=1, default=str)
print(json.dumps({k: (v.get("n") if isinstance(v, dict) else v) for k, v in out.items()}, ensure_ascii=False, default=str))

# ---------- 7. 候选口径的事件数（检验力用；口径见 SCOPE.md 第六节） ----------
# E1：董监高聚集买入（≥2 人、30 天内、公开市场竞价 / 二级市场买卖），合计金额 ≥ 100 万元，
#     剔除事件日 ST、上市不满 365 天、证券表外；2015-07-01 至 2015-12-31 的救市窗口另计。
amt = {}
for code, g in bf.groupby("code"):
    amt[code] = g
def cluster_amount(code, day, win=30):
    g = amt[code]
    e = dt.date.fromisoformat(day)
    m = [(e - dt.date.fromisoformat(x)).days for x in g.declare]
    sel = g[[0 <= v <= win + 10 for v in m]]
    return float(sel.amount.sum())
e1 = []
for code, day, k in cl2:
    t = tags(code, day)
    if {"st", "new_listing", "not_in_securities"} & set(t):
        continue
    if cluster_amount(code, day) < 1e6:
        continue
    e1.append((code, day))
e1_main = [e for e in e1 if not ("2015-07-01" <= e[1] <= "2015-12-31")]
# E2：回购完成且实际回购 ≥ 总股本 1%、用途不是纯股权激励；事件日 = 完成日（FINISHDATE，公告日待核）；同样剔除 ST / 新股
e2 = []
for r in done_known.itertuples():
    if r.done_pct >= 1 and r.purpose != "incentive":
        day = str(r.FINISHDATE)[:10]
        if {"st", "new_listing", "not_in_securities"} & set(tags(r.DIM_SCODE, day)):
            continue
        e2.append((r.DIM_SCODE, day))
out["candidates"] = {
    "E1_by_year": by_year([e[1][:4] for e in e1]), "E1_n": len(e1), "E1_n_excl_2015H2": len(e1_main), "E1_stocks": len({e[0] for e in e1}),
    "E2_by_year": by_year([e[1][:4] for e in e2]), "E2_n": len(e2), "E2_stocks": len({e[0] for e in e2}),
}
json.dump(out, open(os.path.join(os.path.dirname(__file__), "counts.json"), "w"), ensure_ascii=False, indent=1, default=str)
print(json.dumps(out["candidates"], ensure_ascii=False))
