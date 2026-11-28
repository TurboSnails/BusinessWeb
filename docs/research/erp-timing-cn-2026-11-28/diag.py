"""L-057 冻结前诊断（REVIEW-1 必改 3、5、6、9，建议 8）。只用信号与模拟收益，不读任何沪深 300 价格或收益。

输出：本目录 diag-results.json（只含聚合数，不列降仓起止月份——REVIEW-1 建议 7）。
用法：research-py/.venv/bin/python -I docs/research/erp-timing-cn-2026-11-28/diag.py
"""
import json, pathlib, collections
import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
RAW = ROOT / "data-raw/erp-timing-cn/raw"
MAIN_END_M = pd.Period("2023-10", "M")
out = {"generated": "2026-11-28", "note": "信号诊断 + 模拟收益；不含任何沪深 300 实际收益"}


def load(name):
    d = json.loads((RAW / f"{name}.json").read_text())
    return pd.DataFrame(d["rows"], columns=d["columns"])


# ---------- 输入 ----------
lg = load("lg_pe_csi300"); lg["ym"] = pd.PeriodIndex(lg["日期"].str[:7], freq="M"); lg = lg.set_index("ym")
pe_lg = lg["滚动市盈率"].astype(float)
cs = {}
for code in ("000300", "000985"):
    d = pd.DataFrame(json.loads((RAW / f"csindex_pe_{code}.json").read_text())["rows"])
    d["date"] = pd.to_datetime(d["date"]); d = d.set_index("date")
    p = pd.to_numeric(d["peg"], errors="coerce"); p[p <= 0] = np.nan; p = p.dropna()
    cs[code] = p.groupby(p.index.to_period("M")).last()
tdays = pd.DatetimeIndex(pd.DataFrame(json.loads((RAW / "csindex_pe_000300.json").read_text())["rows"])["date"].pipe(pd.to_datetime))
em = load("em_bond_10y"); em["date"] = pd.to_datetime(em["日期"].str[:10])
y10 = em.set_index("date")["中国国债收益率10年"].astype(float).dropna()
y10_m = y10.groupby(y10.index.to_period("M")).last()

erp_s1 = (100 / pe_lg - y10_m.reindex(pe_lg.index)).dropna()
erp_s2 = (100 / cs["000300"] - y10_m.reindex(cs["000300"].index)).dropna()
ey_e1 = (100 / pe_lg).dropna()


def zser(s, win):
    s = s[s.index <= MAIN_END_M]
    return (s - s.rolling(win).mean()) / s.rolling(win).std()


def tier(z, fill=None):
    t = pd.Series(np.where(z >= 1, 1.0, np.where(z <= -1, .5, .75)), index=z.index)
    t[z.isna()] = np.nan if fill is None else fill
    return t


# ---------- 必改 5：乐咕 ÷ 中证官网 按日历月 ----------
ratio = (pe_lg / cs["000300"]).dropna()
by = ratio.groupby(ratio.index.month)
dr = ratio.diff().dropna(); dby = dr.groupby(dr.index.month)
out["lg_over_csindex_by_calendar_month"] = {
    "months": int(len(ratio)), "from": str(ratio.index[0]), "to": str(ratio.index[-1]),
    "overall_median": round(float(ratio.median()), 4),
    "by_month": {int(m): {"n": int(g.size), "median": round(float(g.median()), 4), "p25": round(float(g.quantile(.25)), 4), "p75": round(float(g.quantile(.75)), 4),
                          "median_change_vs_prev_month": round(float(dby.get_group(m).median()), 4) if m in dby.groups else None}
               for m, g in by},
}
jan_apr = ratio[ratio.index.month.isin([1, 2, 3, 4])].median(); may_dec = ratio[ratio.index.month.isin(range(5, 13))].median()
out["lg_over_csindex_by_calendar_month"]["median_jan_apr"] = round(float(jan_apr), 4)
out["lg_over_csindex_by_calendar_month"]["median_may_dec"] = round(float(may_dec), 4)
# 按年的中位数（看是否有结构变化）
out["lg_over_csindex_by_year"] = {int(y): round(float(g.median()), 4) for y, g in ratio.groupby(ratio.index.year)}

# ---------- 必改 6：S1 与 S2 档位一致率（2016-06 至 2023-10） ----------
t1 = tier(zser(erp_s1, 60)); t2 = tier(zser(erp_s2, 60))
j = pd.DataFrame({"s1": t1, "s2": t2}).dropna()
ct = collections.Counter(zip(j.s1, j.s2))
out["tier_agreement_S1_vs_S2"] = {
    "months": int(len(j)), "from": str(j.index[0]), "to": str(j.index[-1]),
    "agree": int((j.s1 == j.s2).sum()),
    "contingency_s1_s2": {f"{a}|{b}": int(v) for (a, b), v in sorted(ct.items())},
    "opposite_extremes": int(((j.s1 == .5) & (j.s2 == 1)).sum() + ((j.s1 == 1) & (j.s2 == .5)).sum()),
    "avg_pos_s1_same_window": round(float(j.s1.mean()), 4), "avg_pos_s2_same_window": round(float(j.s2.mean()), 4),
}

# ---------- 建议 8：E4（站内 750 日 ±2σ 日频写法）与 C1 的月末一致率 ----------
eb = load("lg_ebs_csi300"); eb["date"] = pd.to_datetime(eb["日期"].str[:10])
ebs = eb.set_index("date")["股债利差"].astype(float) * 100
roll = ebs.rolling(750, min_periods=375)
mid, sd = roll.mean(), roll.std(ddof=0)
lower = mid - 2 * sd
state, cur = [], 1.0
for v, lo, m in zip(ebs.values, lower.values, mid.values):
    if np.isnan(lo):
        state.append(np.nan); continue
    if cur == 1.0 and v <= lo:
        cur = .5
    elif cur == .5 and v >= m:
        cur = 1.0
    state.append(cur)
e4 = pd.Series(state, index=ebs.index)
e4m = e4.groupby(e4.index.to_period("M")).last()
jj = pd.DataFrame({"c1": t1, "e4": e4m}).dropna()
out["E4_vs_C1_month_end"] = {
    "months": int(len(jj)), "e4_reduced_months": int((jj.e4 < 1).sum()), "c1_50pct_months": int((jj.c1 == .5).sum()),
    "both_reduced": int(((jj.e4 < 1) & (jj.c1 == .5)).sum()),
    "e4_reduced_while_c1_75": int(((jj.e4 < 1) & (jj.c1 == .75)).sum()),
    "e4_reduced_while_c1_100": int(((jj.e4 < 1) & (jj.c1 == 1)).sum()),
}

# ---------- 必改 4：窗口敏感性（只计数） ----------
win = {}
for w in (36, 48, 60, 72, 84, 120):
    t = tier(zser(erp_s1, w)); tt = t[(t.index >= pd.Period("2010-03", "M"))]
    filled = tt.fillna(.75)
    win[w] = {"months_with_signal": int(tt.notna().sum()), "first_signal": str(tt.first_valid_index()),
              "tier_months": {str(k): int(v) for k, v in filled.value_counts().sort_index().items()},
              "avg_pos": round(float(filled.mean()), 4), "switches": int((filled.diff().fillna(0) != 0).sum()),
              "jensen_ratio": round(float(np.sqrt((filled ** 2).mean()) / filled.mean()), 4)}
out["window_sensitivity_counts"] = win

# ---------- 必改 9：E2′ 的春节问题与 M2 断点 ----------
sina = load("sina_money_supply")
sina["ym"] = pd.PeriodIndex([f"{x.split('.')[0]}-{int(x.split('.')[1]):02d}" for x in sina["统计时间"]], freq="M")
sina = sina.set_index("ym").sort_index()
m1 = sina["货币(狭义货币M1)同比增长"].astype(float).copy(); m2 = sina["货币和准货币（广义货币M2）同比增长"].astype(float)
M1_FIX = {"2018-06": 6.6, "2019-02": 2.0, "2022-12": 3.7}  # 人民银行货币供应量表余额推算，见 DATA.md
for k, v in M1_FIX.items():
    m1[pd.Period(k, "M")] = v
sc = (m1 - m2).dropna()
sc_jf = sc.copy()
for y in sorted(set(sc.index.year)):
    a, b = pd.Period(f"{y}-01", "M"), pd.Period(f"{y}-02", "M")
    if a in sc.index and b in sc.index:
        sc_jf[a] = sc_jf[b] = (sc[a] + sc[b]) / 2


def d12_flips(series):
    s = series.copy(); s.index = s.index + 1  # 决策月 = 统计月 + 1
    d = s.diff(12)
    d = d[(d.index >= pd.Period("2010-03", "M")) & (d.index <= MAIN_END_M)].dropna()
    sg = np.sign(d); fl = sg.diff().fillna(0) != 0
    return {"flips": int(fl.sum()), "flips_in_feb_mar_decisions": int(fl[d.index.month.isin([2, 3])].sum()), "neg_months": int((d < 0).sum()), "months": int(len(d))}


out["E2prime_m1m2_d12"] = {"raw": d12_flips(sc), "jan_feb_averaged": d12_flips(sc_jf)}
m2l = sina["货币和准货币（广义货币M2）"].astype(float)
chk = {}
for t in ("2011-10", "2012-03", "2012-09", "2018-01", "2018-06", "2018-12"):
    p = pd.Period(t, "M")
    chk[t] = {"reported_yoy": float(m2[p]), "level_yoy": round(float((m2l[p] / m2l[p - 12] - 1) * 100), 2)}
out["m2_break_check"] = chk
out["m1_fixed_values"] = M1_FIX

# ---------- 必改 3：詹森基线与模拟 ----------
C1m = t1[(t1.index >= pd.Period("2010-03", "M"))].dropna()
out["jensen_C1_monthly"] = {"all": round(float(np.sqrt((C1m ** 2).mean()) / C1m.mean()), 4),
                            "H1": round(float(np.sqrt((C1m[:"2016-11"] ** 2).mean()) / C1m[:"2016-11"].mean()), 4),
                            "H2": round(float(np.sqrt((C1m["2016-12":] ** 2).mean()) / C1m["2016-12":].mean()), 4)}

# 日历：主窗口交易日 2010-04-02 至 2023-10-31（只用日期）
days = tdays[(tdays >= "2010-03-01") & (tdays <= "2023-10-31")]
dec_dates = pd.Series(days).groupby(days.to_period("M")).max()  # 每月最后一个交易日
w_dec = pd.Series(np.nan, index=days)
for per, dd in dec_dates.items():
    if per in C1m.index:
        i = days.get_loc(dd)
        if i + 2 < len(days):
            w_dec.iloc[i + 2:] = C1m[per]  # t+1 收盘成交，t+2 起生效（后写覆盖前写）
w_full = w_dec[days >= "2010-04-02"]
W = w_full.values; N = len(W)
trade = np.r_[0, np.abs(np.diff(W))]  # 仓位变化发生在生效日前一日（成交日）；为简化，成本记在生效首日
dates = w_full.index
h1 = dates <= "2016-12-31"; h2 = ~h1
out["sim_calendar"] = {"days": int(N), "from": str(dates[0].date()), "to": str(dates[-1].date()), "avg_w": round(float(W.mean()), 4),
                       "jensen_daily": round(float(np.sqrt((W ** 2).mean()) / W.mean()), 4)}
RF = .015 / 252; FEE = .002 / 252; COST = .001
MU = .08 / 252; SIG = .25 / np.sqrt(252)
shifts = np.arange(250, N - 250, 21)
Wk = np.stack([np.roll(W, k) for k in shifts])
Tk = np.abs(np.diff(Wk, axis=1, prepend=Wk[:, :1]))


def port(w, r, tr):
    return w * r + (1 - w) * RF - w * FEE - COST * tr


def mdd(x):
    nav = np.cumprod(1 + x, axis=-1); peak = np.maximum.accumulate(nav, axis=-1)
    return (nav / peak - 1).min(axis=-1)


def episodes(r):
    nav = np.cumprod(1 + r); eps = []; peak_i = 0; trough_i = 0; in_bear = False
    for i in range(1, len(nav)):
        if not in_bear:
            if nav[i] > nav[peak_i]:
                peak_i = i
            elif nav[i] / nav[peak_i] - 1 <= -.2:
                in_bear = True; trough_i = i
        else:
            if nav[i] < nav[trough_i]:
                trough_i = i
            elif nav[i] / nav[trough_i] - 1 >= .2:
                eps.append((peak_i, trough_i)); in_bear = False; peak_i = i
    return eps


def evaluate(r):
    c = port(W, r, trade); wb = W.mean(); b = port(wb, r, 0)
    sr = c.std() / b.std()
    res = {"G1": sr <= .95}
    res["G2"] = mdd(c) - mdd(b) >= .03
    sh = lambda x: (x - RF).mean() / x.std()
    res["G3"] = sh(c) >= sh(b)
    ok4 = True
    for m in (h1, h2):
        wbh = W[m].mean(); ch = port(W[m], r[m], trade[m]); bh = port(wbh, r[m], 0)
        ok4 &= (ch.std() / bh.std() < 1) and (mdd(ch) >= mdd(bh))
    res["G4"] = ok4
    ck = Wk * r + (1 - Wk) * RF - Wk * FEE - COST * Tk
    p = ((ck.std(axis=1) / b.std() <= sr).sum() + 1) / (len(shifts) + 1)
    res["G5"] = p <= .10
    eps = episodes(r)
    if eps:
        lc = sum(np.prod(1 + c[a + 1:z + 1]) - 1 for a, z in eps); lb = sum(np.prod(1 + b[a + 1:z + 1]) - 1 for a, z in eps)
        res["G6"] = (lc / lb) <= .90 if lb < 0 else False
    else:
        res["G6"] = False
    res["n_eps"] = len(eps)
    return res, sr


def sim_returns(kind, rng):
    if kind == "iid":
        return MU + SIG * rng.standard_normal(N)
    a, bb = .08, .90; om = SIG ** 2 * (1 - a - bb); h = SIG ** 2; e_prev = 0.0
    out_ = np.empty(N + 500)
    z = rng.standard_normal(N + 500)
    for i in range(N + 500):
        h = om + a * e_prev ** 2 + bb * h
        e_prev = np.sqrt(h) * z[i]; out_[i] = e_prev
    return MU + out_[500:]


expensive = W == .5
sim = {}
for kind in ("iid", "garch"):
    for mult in (1.0, 1.3, 1.5):
        rng = np.random.default_rng(20261128)
        cnt = collections.Counter(); srs = []; neps = []
        for _ in range(2000):
            r = sim_returns(kind, rng)
            if mult != 1.0:
                r = np.where(expensive, MU + (r - MU) * mult, r)
            res, sr = evaluate(r); srs.append(sr); neps.append(res.pop("n_eps"))
            for k, v in res.items():
                cnt[k] += bool(v)
            cnt["joint_G1_G6"] += all(res.values())
            cnt["G1_G2_G4"] += res["G1"] and res["G2"] and res["G4"]
            cnt["ratio_lt_1_not_fail"] += sr < 1.0
        sim[f"{kind}_x{mult}"] = {k: round(v / 2000, 4) for k, v in sorted(cnt.items())} | {
            "sigma_ratio_median": round(float(np.median(srs)), 4), "sigma_ratio_p05": round(float(np.quantile(srs, .05)), 4),
            "sigma_ratio_p95": round(float(np.quantile(srs, .95)), 4), "episodes_median": float(np.median(neps))}
        print(kind, mult, sim[f"{kind}_x{mult}"], flush=True)
out["simulation_C1"] = {"n": 2000, "seed": 20261128, "mu_annual": .08, "vol_annual": .25, "rf": .015, "fee": .002, "cost_per_unit": .001,
                        "garch": {"alpha": .08, "beta": .90}, "H1": "贵档（仓位 50%）日子的收益偏离均值部分乘以倍数",
                        "G6_episodes": "模拟路径上按 20% 交替峰谷自行分段（实测时用 counts.json 的固定分段）", "results": sim}


# ---------- REVIEW-2 必改 1：前推门槛 c 的模拟校准 ----------
# 代理档位序列：历史 C1 中恰好包含 3 次贵档新进入、且不短于 60 个月的最短连续区段（多段取最早；不足 60 个月向后延长）。
# 「新进入」= 某月档位 50% 且上一月不是 50%（第一个信号月没有上一月，不计）。
cm = C1m.copy()
entries = [cm.index[i] for i in range(1, len(cm)) if cm.iloc[i] == .5 and cm.iloc[i - 1] != .5]
cands = []
for i in range(len(entries) - 2):
    a, b = entries[i], entries[i + 2]
    cands.append((b.ordinal - a.ordinal + 1, a, b))
cands.sort(key=lambda x: (x[0], x[1].ordinal))
seg_len, seg_a, seg_b = cands[0]
seg_months = list(pd.period_range(seg_a, seg_b, freq="M"))
if len(seg_months) < 60:
    seg_months = list(pd.period_range(seg_a, periods=60, freq="M"))
extended_past_main = seg_months[-1] > cm.index[-1]
seg_months = [m for m in seg_months if m in cm.index]
n_entries_in_seg = sum(1 for e in entries if seg_months[0] <= e <= seg_months[-1])
# 日序列：区段第一个决策日的 D+2 起，到区段后一个决策日的 D+1 止（成本记在成交日 D+1）
dpos = {per: days.get_loc(dd) for per, dd in dec_dates.items()}
i0 = dpos[seg_months[0]] + 2
nxt = seg_months[-1] + 1
i1 = dpos[nxt] + 1 if nxt in dpos else len(days) - 1
Wf = np.empty(i1 - i0 + 1); Tf = np.zeros_like(Wf)
for per in seg_months:
    a_ = dpos[per] + 2 - i0
    b_ = (dpos[per + 1] + 1 - i0) if (per + 1) in dpos else len(Wf) - 1
    Wf[a_:b_ + 1] = cm[per]
for per in seg_months[1:]:
    k = dpos[per] + 1 - i0  # 成交日
    Tf[k] = abs(cm[per] - cm[per - 1])
Nf = len(Wf)


def sim_n(kind, rng, n):
    if kind == "iid":
        return MU + SIG * rng.standard_normal(n)
    a, bb = .08, .90; om = SIG ** 2 * (1 - a - bb); h = SIG ** 2; e_prev = 0.0
    z = rng.standard_normal(n + 500); o = np.empty(n + 500)
    for i in range(n + 500):
        h = om + a * e_prev ** 2 + bb * h
        e_prev = np.sqrt(h) * z[i]; o[i] = e_prev
    return MU + o[500:]


fwd = {}
exp_f = Wf == .5
for kind in ("iid", "garch"):
    for mult in (1.0, 1.3, 1.5):
        rng = np.random.default_rng(20261128)
        rs, ok = [], []
        for _ in range(2000):
            r = sim_n(kind, rng, Nf)
            if mult != 1.0:
                r = np.where(exp_f, MU + (r - MU) * mult, r)
            c_ = Wf * r + (1 - Wf) * RF - Wf * FEE - COST * Tf
            wb = Wf.mean(); b_ = wb * r + (1 - wb) * RF - wb * FEE
            rs.append(c_.std() / b_.std()); ok.append(mdd(c_) >= mdd(b_))
        fwd[(kind, mult)] = (np.array(rs), np.array(ok))
rs0, ok0 = fwd[("garch", 1.0)]
c_thr = None
for c in np.round(np.arange(1.00, 0.70, -0.005), 3):
    if ((rs0 <= c) & ok0).mean() <= .10:
        c_thr = float(c); break
rate = lambda kind, mult, c: round(float(((fwd[(kind, mult)][0] <= c) & fwd[(kind, mult)][1]).mean()), 4)
out["forward_threshold"] = {
    "proxy_entries_all": len(entries),
    "proxy_segment": {"first_month": str(seg_months[0]), "last_month": str(seg_months[-1]), "decision_months": len(seg_months),
                      "minimal_span_months": int(seg_len), "entries_in_segment": int(n_entries_in_seg), "extended_past_main_window": bool(extended_past_main),
                      "days": int(Nf), "avg_w": round(float(Wf.mean()), 4), "jensen": round(float(np.sqrt((Wf ** 2).mean()) / Wf.mean()), 4)},
    "rule": "c = 使 P(σ比 ≤ c 且 MDD(C1) 不深于 MDD(Bc) | GARCH H0) ≤ 0.10 的最大值，按 0.005 向下取，c ≤ 1.00",
    "c": c_thr,
    "pass_rates_at_c": {f"{k}_x{m}": rate(k, m, c_thr) for k in ("iid", "garch") for m in (1.0, 1.3, 1.5)},
    "pass_rates_at_0.95": {f"{k}_x{m}": rate(k, m, .95) for k in ("iid", "garch") for m in (1.0, 1.3, 1.5)},
    "pass_rates_at_1.00": {f"{k}_x{m}": rate(k, m, 1.0) for k in ("iid", "garch") for m in (1.0, 1.3, 1.5)},
    "sigma_ratio_median": {f"{k}_x{m}": round(float(np.median(fwd[(k, m)][0])), 4) for k in ("iid", "garch") for m in (1.0, 1.3, 1.5)},
    "mdd_not_deeper_rate": {f"{k}_x{m}": round(float(fwd[(k, m)][1].mean()), 4) for k in ("iid", "garch") for m in (1.0, 1.3, 1.5)},
    "settings": "同 simulation_C1（漂移 8%、波动 25%、现金 1.5%、费率 0.20%、成本 0.1% 记在成交日），各 2,000 次，种子 20261128",
}
print("forward_threshold", json.dumps(out["forward_threshold"], ensure_ascii=False), flush=True)

(HERE / "diag-results.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(json.dumps({k: v for k, v in out.items() if k != "simulation_C1"}, ensure_ascii=False, indent=1))
