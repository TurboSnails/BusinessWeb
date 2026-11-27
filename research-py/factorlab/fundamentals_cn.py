"""A 股点时基本面面板：cn_fin 点时财报长表（factor-data/cn/fin_pit.parquet）→ 月末 × 代码 的字段。

口径（R2 计划 docs/research/factorlab/rounds/R2-2026-11-27.md）：
- 每个月末交易日 d 只用 avail_date ≤ d 的行；同一（代码，报告期，科目）有多个版本时取 d 当时已生效的最新版本，
  avail_date 晚于 d 的版本（包括后来的重述）一律看不到。报告期只用季末（3/31、6/30、9/30、12/31）。
- 流量科目（利润、收入、现金流）是年初至今累计：TTM = 最近一期累计 + 上年年报 − 上年同期累计；最近一期是年报时
  直接用年报。拿不到上年年报或上年同期时，退回最近一份年报（期末更旧，陈旧度照查）。
- 时点科目（权益、资产）的平均 = （本期末 + 4 个季度前的期末）/ 2，两者都要在 d 当时已知。
- 陈旧度：所用报告期末早于 d 超过 STALE_DAYS（456 天，约 15 个月）→ 空。
- 单季扣非归母净利润 = 本期累计 − 上一季累计（一季报直接用累计）；同比增速 = (本季 − 上年同季) / |上年同季|。
- 总市值 fin_mcap = prices.mcap_total（巨潮点时总股本 × 不复权收盘）；mcap_total 为空时（巨潮股本接口不覆盖
  退市股，退市股整列为空）改用「财报实收资本（点时，最近一期，陈旧度照查）× 不复权收盘 × 复权因子(d) /
  复权因子(该报告期末)」：用后复权因子把期末之后的送转股折算到 d（现金分红也会让复权因子略增，估计偏大约等于
  股息率，写明）。不用流通市值：2006 年股改前非流通股占比很高，流通市值与总市值相差数倍。
- 金融业（点时申万一级：银行、非银金融、旧版金融服务）的毛利 / 总资产为空；券商、保险在利润表里有「营业成本」
  行，不能只靠「没有营业成本」排除。退市股没有点时行业，只能靠没有营业成本排除银行。

盈余惊喜（R5 计划 docs/research/factorlab/rounds/R5-2026-11-27.md；另算、另缓存，不改上面任何字段的值）：
- fin_ni_sue / fin_rev_sur：单季归母净利润 / 单季营业收入 X（由年初累计还原：一季度 = 累计，其余 = 本期累计 −
  上一季累计，第四季 = 年报 − 三季报累计；两期都须 d 时已生效，各取当时最新版本）。q = d 时已生效（avail_date
  ≤ d，即公告日早于 d）的该科目最新报告期；SUE = (X_q − X_{q−4}) / σ，σ = 「同比差」X_{q−j} − X_{q−4−j}
  （j = 0…7）的样本标准差（ddof = 1），至少 4 个有值；q 的期末早于 d 超过 SUE_STALE_DAYS（200 天）、X_q 或
  X_{q−4} 缺失、σ = 0（相对 1e-9 以内）→ 空。原值（元），不除股本。
- 缓存键另含 SURPRISE_VERSION（与 BUILD_VERSION 无关），只在请求这两个字段时计算；snapshot() 不变。

护栏：panel_fields(fields, panel, end_ex, hidden) 由 data.load_market 调用，先删掉 avail_date 不早于可见上界
end_ex（以及落在被删区间 hidden）的财报行再计算——可见上界由 data.window() / guard.Lockbox 按模式给出，
本模块不写死日期。计算结果按（版本、财报文件 sha256、可见范围、月末日期、代码集合）缓存在
factor-data/cn/derived/（不进 git），缓存键含可见上界，换模式不会串用。
"""

from __future__ import annotations

import hashlib
import json

import numpy as np
import pandas as pd

from . import store

BUILD_VERSION = "fund-cn-v1"
MARKET = "cn"
STALE_DAYS = 456          # 15 个月
WINDOW_Q = 12             # 每个快照只看最近 12 个季度的报告期（足够覆盖 15 个月陈旧度 + 上年同期 + 上一季）

ITEMS = ("net_income_parent", "net_income_parent_deducted", "revenue", "cfo", "gross_profit",
         "total_equity_parent", "total_assets", "share_capital")
FIN_INDUSTRIES = frozenset({"银行", "非银金融", "金融服务"})

FIELDS = ("fin_ni_ttm", "fin_nided_ttm", "fin_rev_ttm", "fin_cfo_ttm", "fin_gp_ttm", "fin_be", "fin_roe",
          "fin_gpa", "fin_accruals", "fin_asset_growth", "fin_nided_yoy", "fin_mcap")
SURPRISE_FIELDS = ("fin_ni_sue", "fin_rev_sur")
SURPRISE_ITEMS = {"fin_ni_sue": "net_income_parent", "fin_rev_sur": "revenue"}
SURPRISE_VERSION = "sue-cn-v1"
SUE_STALE_DAYS = 200      # 最新季度期末距 d 超过 200 天（没有按时出新财报）→ 空
SUE_N = 8                 # σ 用最近 8 个同比差
SUE_MIN = 4               # 至少 4 个有值
SUE_WINDOW_Q = 16         # 不陈旧的 q ≥ d 所在季度 − 3；σ 要用到 q − 11 的单季，即 q − 12 的累计值
PROVIDES = FIELDS + SURPRISE_FIELDS
NEEDS = ("close", "close_adj", "mcap_total", "industry")
# 只由财报决定（可缓存）的中间量
_CORE = ("ni_ttm", "nided_ttm", "rev_ttm", "cfo_ttm", "gp_ttm", "be", "roe", "gpa", "accruals", "asset_growth",
         "nided_yoy", "sc", "sc_end")


# ================================================================ 读取与护栏
def fin_path():
    return store.market_dir(MARKET) / "fin_pit.parquet"


def available() -> bool:
    return (store.root() / MARKET / "fin_pit.parquet").exists()


def _fin_sha() -> str | None:
    try:
        m = json.loads((store.root() / MARKET / "fin_pit.meta.json").read_text(encoding="utf-8"))
        return m.get("sha256")
    except FileNotFoundError:
        return None


def snapshot() -> str | None:
    return hashlib.sha256(json.dumps([BUILD_VERSION, _fin_sha()]).encode()).hexdigest()[:16]


def read_fin(codes=None) -> pd.DataFrame:
    """读点时财报（全部 avail_date，不截断——截断由 guard_fin 按调用方给的可见范围做）。"""
    filt = [("item", "in", list(ITEMS))]
    if codes is not None:
        filt.append(("code", "in", [str(c) for c in codes]))
    return pd.read_parquet(fin_path(), columns=["code", "report_period", "item", "value", "avail_date"],
                           filters=filt)


def guard_fin(fin: pd.DataFrame, end_ex: pd.Timestamp | None, hidden: tuple | None) -> pd.DataFrame:
    """删掉 avail_date 不早于 end_ex、或落在 hidden=[lo, hi) 里的行。"""
    keep = fin["avail_date"].notna().to_numpy()
    if end_ex is not None:
        keep &= (fin["avail_date"] < end_ex).to_numpy()
    if hidden is not None:
        keep &= ~((fin["avail_date"] >= hidden[0]) & (fin["avail_date"] < hidden[1])).to_numpy()
    return fin.loc[keep]


def month_rows(days: pd.DatetimeIndex) -> pd.DatetimeIndex:
    """面板交易日里每个自然月的最后一个交易日。"""
    days = pd.DatetimeIndex(days).sort_values()
    return pd.DatetimeIndex(pd.Series(days, index=days).groupby(days.to_period("M")).max().values)


# ================================================================ 核心：月末快照（纯函数）
def _qidx(ts: pd.Series | pd.DatetimeIndex) -> np.ndarray:
    ts = pd.DatetimeIndex(ts)
    return (ts.year.to_numpy() * 4 + (ts.month.to_numpy() - 1) // 3).astype(np.int64)


def _q_end(q: np.ndarray) -> np.ndarray:
    """季度序号 → 季末日期（datetime64[D]）。"""
    y, k = q // 4, q % 4
    m = (k + 1) * 3
    first_next = ((y - 1970) * 12 + m).astype("datetime64[M]")     # 下一月 1 日
    return first_next.astype("datetime64[D]") - np.timedelta64(1, "D")


def core_fields(fin: pd.DataFrame, dates, codes=None) -> dict[str, pd.DataFrame]:
    """点时财报长表（已按可见范围删过）→ {中间量: 月末 × 代码}。每个 d 只用 avail_date ≤ d 的行。"""
    dates = pd.DatetimeIndex(dates)
    f = fin[fin["item"].isin(ITEMS)]
    rp = pd.DatetimeIndex(f["report_period"])
    qe = (rp.month.isin([3, 6, 9, 12])) & (((rp.month.isin([3, 12])) & (rp.day == 31))
                                           | ((rp.month.isin([6, 9])) & (rp.day == 30)))
    f = f.loc[np.asarray(qe) & f["value"].notna().to_numpy()]
    if codes is None:
        codes = pd.Index(sorted(f["code"].astype(str).unique()))
    codes = pd.Index([str(c) for c in codes])
    nC, nD, nI = len(codes), len(dates), len(ITEMS)
    out = {k: np.full((nD, nC), np.nan) for k in _CORE}
    out["sc_end"] = np.full((nD, nC), np.datetime64("NaT", "D"), dtype="datetime64[D]")
    if len(f) == 0 or nC == 0:
        return {k: pd.DataFrame(v, index=dates, columns=codes) for k, v in out.items()}
    ci = codes.get_indexer(f["code"].astype(str))
    ok = ci >= 0
    f = f.loc[ok]
    ci = ci[ok]
    ii = pd.Index(ITEMS).get_indexer(f["item"].astype(str))
    qi = _qidx(f["report_period"])
    av = f["avail_date"].to_numpy("datetime64[D]")
    val = f["value"].to_numpy(float)
    o = np.argsort(av, kind="stable")
    ci, ii, qi, av, val = ci[o], ii[o], qi[o], av[o], val[o]
    I = {n: k for k, n in enumerate(ITEMS)}
    dq = _qidx(dates)
    dd = dates.to_numpy("datetime64[D]")
    W = WINDOW_Q + 1
    rows = np.arange(nC)
    for t in range(nD):
        base = dq[t] - WINDOW_Q
        k = int(np.searchsorted(av, dd[t], side="right"))      # avail_date ≤ d
        sel = (qi[:k] >= base) & (qi[:k] <= dq[t])
        c_, i_, q_, v_ = ci[:k][sel], ii[:k][sel], qi[:k][sel] - base, val[:k][sel]
        # 同一（代码，报告期，科目）只留 avail_date 最晚的一条（已按 avail_date 升序排好：取最后出现的）
        key = (c_ * W + q_) * nI + i_
        _, first_rev = np.unique(key[::-1], return_index=True)
        last = len(key) - 1 - first_rev
        V = np.full((nC, W, nI), np.nan)
        V[c_[last], q_[last], i_[last]] = v_[last]
        qend = _q_end(np.arange(base, base + W))                # 每个相对季度的期末
        fresh_q = (dd[t] - qend) / np.timedelta64(1, "D") <= STALE_DAYS
        qoy = (np.arange(base, base + W)) % 4                   # 0 = 一季度 … 3 = 年报

        def latest(x):                                          # 每只最新有值的相对季度（无 → -1）
            has = ~np.isnan(x)
            last = W - 1 - np.argmax(has[:, ::-1], axis=1)
            return np.where(has.any(1), last, -1)

        def at(x, q):                                           # x[c, q]，q 越界 → NaN
            okq = (q >= 0) & (q < W)
            r = np.full(nC, np.nan)
            r[okq] = x[rows[okq], q[okq]]
            return r

        def ttm(item):
            x = V[:, :, I[item]]
            P = latest(x)
            ytd = at(x, P)
            qo = np.where(P >= 0, qoy[np.clip(P, 0, W - 1)], -1)
            fy_prev = at(x, P - qo - 1)
            same_prev = at(x, P - 4)
            v = np.where(qo == 3, ytd, ytd + fy_prev - same_prev)
            per = P.copy()
            # 退回：最近一份年报
            miss = np.isnan(v) & (P >= 0)
            if miss.any():
                hasdec = ~np.isnan(x) & (qoy == 3)[None, :]
                lastdec = np.where(hasdec.any(1), W - 1 - np.argmax(hasdec[:, ::-1], axis=1), -1)
                fb = miss & (lastdec >= 0)
                v = np.where(fb, at(x, lastdec), v)
                per = np.where(fb, lastdec, per)
            fr = (per >= 0) & fresh_q[np.clip(per, 0, W - 1)]
            return np.where(fr, v, np.nan), np.where(fr, per, -1)

        def stock_latest(item):
            x = V[:, :, I[item]]
            P = latest(x)
            fr = (P >= 0) & fresh_q[np.clip(P, 0, W - 1)]
            P = np.where(fr, P, -1)
            return x, P

        ni, p_ni = ttm("net_income_parent")
        nided, _ = ttm("net_income_parent_deducted")
        rev, _ = ttm("revenue")
        cfo, p_cfo = ttm("cfo")
        gp, p_gp = ttm("gross_profit")
        out["ni_ttm"][t], out["nided_ttm"][t], out["rev_ttm"][t] = ni, nided, rev
        out["cfo_ttm"][t], out["gp_ttm"][t] = cfo, gp

        be_x, p_be = stock_latest("total_equity_parent")
        be = at(be_x, p_be)
        out["be"][t] = be
        # ROE：TTM 归母净利润 / 同一期末与 4 个季度前期末归母权益的平均；两端权益都须 > 0
        e0, e1 = at(be_x, p_ni), at(be_x, p_ni - 4)
        with np.errstate(invalid="ignore", divide="ignore"):
            avg_e = (e0 + e1) / 2
            out["roe"][t] = np.where((p_ni >= 0) & (e0 > 0) & (e1 > 0), ni / avg_e, np.nan)
            ta_x = V[:, :, I["total_assets"]]
            # 毛利 / 总资产（同一期末的总资产）
            ta_gp = at(ta_x, p_gp)
            out["gpa"][t] = np.where((p_gp >= 0) & (ta_gp > 0), gp / ta_gp, np.nan)
            # 应计：NI_TTM 与 CFO_TTM 须是同一期末；分母为同一期末与 4 个季度前总资产的平均
            a0, a1 = at(ta_x, p_ni), at(ta_x, p_ni - 4)
            avg_a = (a0 + a1) / 2
            out["accruals"][t] = np.where((p_ni >= 0) & (p_ni == p_cfo) & (avg_a > 0), (ni - cfo) / avg_a, np.nan)
            # 资产增长：最新期末总资产 / 4 个季度前 − 1
            _, p_ta = stock_latest("total_assets")
            g0, g1 = at(ta_x, p_ta), at(ta_x, p_ta - 4)
            out["asset_growth"][t] = np.where((p_ta >= 0) & (g1 > 0), g0 / g1 - 1, np.nan)
            # 单季扣非归母净利润同比
            x = V[:, :, I["net_income_parent_deducted"]]
            P = latest(x)
            fr = (P >= 0) & fresh_q[np.clip(P, 0, W - 1)]
            qo = np.where(P >= 0, qoy[np.clip(P, 0, W - 1)], -1)

            def single(Pq, qoq):
                cur = at(x, Pq)
                prv = at(x, Pq - 1)
                return np.where(qoq == 0, cur, cur - prv)

            q_now = single(P, qo)
            q_ago = single(P - 4, qo)
            den = np.abs(q_ago)
            out["nided_yoy"][t] = np.where(fr & (den > 0), (q_now - q_ago) / den, np.nan)
        # 实收资本（市值缺失时的后备）
        sc_x, p_sc = stock_latest("share_capital")
        out["sc"][t] = at(sc_x, p_sc)
        okp = p_sc >= 0
        e = np.full(nC, np.datetime64("NaT", "D"), dtype="datetime64[D]")
        e[okp] = qend[p_sc[okp]]
        out["sc_end"][t] = e
    res = {k: pd.DataFrame(v, index=dates, columns=codes) for k, v in out.items() if k != "sc_end"}
    res["sc_end"] = pd.DataFrame(out["sc_end"].astype("datetime64[ns]"), index=dates, columns=codes)
    return res


def compute_fields(core: dict[str, pd.DataFrame], fields, close: pd.DataFrame, close_adj: pd.DataFrame | None,
                   mcap_total: pd.DataFrame | None, industry: pd.DataFrame | None) -> dict[str, pd.DataFrame]:
    """中间量 + 日度面板（不复权收盘、后复权收盘、点时总市值、点时行业）→ 面板字段（月末行）。"""
    codes = close.columns
    dates = core["ni_ttm"].index
    C = {k: v.reindex(columns=codes) for k, v in core.items()}
    out = {"fin_ni_ttm": C["ni_ttm"], "fin_nided_ttm": C["nided_ttm"], "fin_rev_ttm": C["rev_ttm"],
           "fin_cfo_ttm": C["cfo_ttm"], "fin_gp_ttm": C["gp_ttm"], "fin_be": C["be"], "fin_roe": C["roe"],
           "fin_accruals": C["accruals"], "fin_asset_growth": C["asset_growth"], "fin_nided_yoy": C["nided_yoy"]}
    gpa = C["gpa"]
    if industry is not None:
        ind = industry.reindex(index=dates, columns=codes)
        isfin = ind.isin(FIN_INDUSTRIES).to_numpy()
        gpa = gpa.where(~isfin)
    out["fin_gpa"] = gpa
    if "fin_mcap" in fields:
        out["fin_mcap"] = mcap_with_fallback(C["sc"], C["sc_end"], close, close_adj, mcap_total)
    return {k: v for k, v in out.items() if k in set(fields)}


def mcap_with_fallback(sc: pd.DataFrame, sc_end: pd.DataFrame, close: pd.DataFrame, close_adj: pd.DataFrame | None,
                       mcap_total: pd.DataFrame | None) -> pd.DataFrame:
    """月末总市值：mcap_total（> 0）优先；否则 实收资本 × 不复权收盘 × 复权因子(d) / 复权因子(实收资本的期末)。
    复权因子只用 d 及以前的数据：期末对应「期末当日或之前最后一个交易日」的因子，股票在期末时尚未有价格（上市前
    的报告期）则用上市后第一个因子（仍不晚于 d：只有 d 已有价格时才会用到）。"""
    dates = sc.index
    codes = close.columns
    px = close.reindex(index=dates, columns=codes)
    px = px.where(px > 0)
    base = sc.reindex(columns=codes) * px
    if close_adj is not None:
        adj = (close_adj.reindex(columns=codes) / close.where(close > 0)).replace([np.inf, -np.inf], np.nan)
        adj_f = adj.ffill()
        adj_d = adj_f.reindex(dates)
        days = adj.index.to_numpy("datetime64[ns]")
        end = sc_end.reindex(columns=codes).to_numpy("datetime64[ns]")
        pos = np.searchsorted(days, np.where(np.isnat(end), days[0], end), side="right") - 1
        A = adj_f.to_numpy(float)
        first = adj.bfill().to_numpy(float)[0] if len(adj) else np.full(len(codes), np.nan)
        cols = np.broadcast_to(np.arange(len(codes)), end.shape)
        at_end = np.where(pos >= 0, A[np.clip(pos, 0, None), cols], np.nan)
        at_end = np.where(np.isnan(at_end), first[None, :], at_end)
        at_end[np.isnat(end)] = np.nan
        ratio = adj_d.to_numpy(float) / at_end
        base = base * ratio
    if mcap_total is None:
        return base
    m = mcap_total.reindex(index=dates, columns=codes)
    return m.where(m > 0, base)


# ================================================================ 盈余惊喜（R5）：纯函数
def _sue_stats(G: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """G：每行 = [D_q, D_{q−1}, …, D_{q−7}]（缺失为 NaN）→（分子 D_q，样本标准差 ddof=1，有值个数）。美股共用。"""
    valid = ~np.isnan(G)
    n = valid.sum(1)
    Gz = np.where(valid, G, 0.0)
    mean = Gz.sum(1) / np.where(n > 0, n, 1)
    var = np.where(valid, (Gz - mean[:, None]) ** 2, 0.0).sum(1) / np.where(n > 1, n - 1, 1)
    sd = np.where(n > 1, np.sqrt(var), np.nan)
    # σ = 0：同比差全相同（浮点求均值的舍入会留下约 1e-17 倍的残差，按相对 1e-9 以内视为 0）
    scale = np.where(valid, np.abs(Gz), 0.0).max(1) if G.shape[1] else np.zeros(len(G))
    sd = np.where(sd <= 1e-9 * scale, 0.0, sd)
    return G[:, 0], sd, n


def surprise_fields(fin: pd.DataFrame, dates, codes=None) -> dict[str, pd.DataFrame]:
    """点时财报长表（已按可见范围删过）→ {fin_ni_sue, fin_rev_sur: 日期 × 代码}。每个 d 只用 avail_date ≤ d 的行。"""
    dates = pd.DatetimeIndex(dates)
    items = tuple(SURPRISE_ITEMS[k] for k in SURPRISE_FIELDS)
    f = fin[fin["item"].isin(items)]
    rp = pd.DatetimeIndex(f["report_period"])
    qe = (rp.month.isin([3, 6, 9, 12])) & (((rp.month.isin([3, 12])) & (rp.day == 31))
                                           | ((rp.month.isin([6, 9])) & (rp.day == 30)))
    f = f.loc[np.asarray(qe) & f["value"].notna().to_numpy() & f["avail_date"].notna().to_numpy()]
    if codes is None:
        codes = pd.Index(sorted(f["code"].astype(str).unique()))
    codes = pd.Index([str(c) for c in codes])
    nC, nD, nI = len(codes), len(dates), len(items)
    out = {k: np.full((nD, nC), np.nan) for k in SURPRISE_FIELDS}
    if len(f) == 0 or nC == 0:
        return {k: pd.DataFrame(v, index=dates, columns=codes) for k, v in out.items()}
    ci = codes.get_indexer(f["code"].astype(str))
    ok = ci >= 0
    f, ci = f.loc[ok], ci[ok]
    ii = pd.Index(items).get_indexer(f["item"].astype(str))
    qi = _qidx(f["report_period"])
    av = f["avail_date"].to_numpy("datetime64[D]")
    val = f["value"].to_numpy(float)
    o = np.argsort(av, kind="stable")
    ci, ii, qi, av, val = ci[o], ii[o], qi[o], av[o], val[o]
    dq = _qidx(dates)
    dd = dates.to_numpy("datetime64[D]")
    W = SUE_WINDOW_Q + 1
    rows = np.arange(nC)
    lags = np.arange(SUE_N)
    for t in range(nD):
        base = dq[t] - SUE_WINDOW_Q
        k = int(np.searchsorted(av, dd[t], side="right"))      # avail_date ≤ d
        sel = (qi[:k] >= base) & (qi[:k] <= dq[t])
        c_, i_, q_, v_ = ci[:k][sel], ii[:k][sel], qi[:k][sel] - base, val[:k][sel]
        key = (c_ * W + q_) * nI + i_
        _, first_rev = np.unique(key[::-1], return_index=True)  # 同一（代码，期，科目）取 avail_date 最晚的版本
        last = len(key) - 1 - first_rev
        V = np.full((nC, W, nI), np.nan)
        V[c_[last], q_[last], i_[last]] = v_[last]
        qabs = np.arange(base, base + W)
        qend = _q_end(qabs)
        age = (dd[t] - qend) / np.timedelta64(1, "D")
        q1 = (qabs % 4) == 0
        for m, name in enumerate(SURPRISE_FIELDS):
            x = V[:, :, m]
            S = np.full_like(x, np.nan)                         # 单季值
            S[:, q1] = x[:, q1]
            nq = np.flatnonzero(~q1 & (np.arange(W) >= 1))
            S[:, nq] = x[:, nq] - x[:, nq - 1]
            D = np.full_like(x, np.nan)                         # 同比差 X_k − X_{k−4}
            D[:, 4:] = S[:, 4:] - S[:, :-4]
            has = ~np.isnan(x)
            P = np.where(has.any(1), W - 1 - np.argmax(has[:, ::-1], axis=1), -1)   # 最新报告期
            idx = P[:, None] - lags[None, :]
            okq = (idx >= 0) & (P >= 0)[:, None]
            G = np.where(okq, D[rows[:, None], np.clip(idx, 0, W - 1)], np.nan)
            n = (~np.isnan(G)).sum(1)
            num, sd, n = _sue_stats(G)
            fresh = (P >= 0) & (age[np.clip(P, 0, W - 1)] <= SUE_STALE_DAYS)
            good = fresh & (n >= SUE_MIN) & ~np.isnan(num) & (sd > 0)
            out[name][t] = np.where(good, num / np.where(sd > 0, sd, 1.0), np.nan)
    return {k: pd.DataFrame(v, index=dates, columns=codes) for k, v in out.items()}


def _surprise_key(end_ex, hidden, dates, codes) -> str:
    h = hashlib.sha256()
    h.update(json.dumps([SURPRISE_VERSION, _fin_sha(), None if end_ex is None else str(end_ex),
                         None if hidden is None else [str(x) for x in hidden],
                         [str(d.date()) for d in dates], sorted(map(str, codes))]).encode())
    return h.hexdigest()[:20]


def surprise_cached(end_ex, hidden, dates, codes) -> dict[str, pd.DataFrame]:
    key = _surprise_key(end_ex, hidden, dates, codes)
    p = _cache_dir() / f"sue_cn_{key}.npz"
    if p.exists():
        z = np.load(p, allow_pickle=False)
        idx = pd.DatetimeIndex(z["dates"])
        cols = pd.Index(z["codes"].astype(str))
        return {k: pd.DataFrame(z[k], index=idx, columns=cols) for k in SURPRISE_FIELDS}
    fin = pd.read_parquet(fin_path(), columns=["code", "report_period", "item", "value", "avail_date"],
                          filters=[("item", "in", list(SURPRISE_ITEMS.values())),
                                   ("code", "in", [str(c) for c in codes])])
    res = surprise_fields(guard_fin(fin, end_ex, hidden), dates, codes)
    tmp = p.with_suffix(".tmp.npz")
    np.savez_compressed(tmp, dates=np.asarray(pd.DatetimeIndex(dates).to_numpy("datetime64[ns]")),
                        codes=np.asarray([str(c) for c in codes]),
                        **{k: v.to_numpy(float) for k, v in res.items()})
    tmp.replace(p)
    return res


# ================================================================ 评估时：data.load_market 的钩子
def _cache_key(end_ex, hidden, dates, codes) -> str:
    h = hashlib.sha256()
    h.update(json.dumps([BUILD_VERSION, _fin_sha(), None if end_ex is None else str(end_ex),
                         None if hidden is None else [str(x) for x in hidden],
                         [str(d.date()) for d in dates], sorted(map(str, codes))]).encode())
    return h.hexdigest()[:20]


def _cache_dir():
    d = store.market_dir(MARKET) / "derived"
    d.mkdir(parents=True, exist_ok=True)
    return d


def core_cached(end_ex, hidden, dates, codes) -> dict[str, pd.DataFrame]:
    key = _cache_key(end_ex, hidden, dates, codes)
    p = _cache_dir() / f"fund_cn_{key}.npz"
    if p.exists():
        z = np.load(p, allow_pickle=False)
        idx = pd.DatetimeIndex(z["dates"])
        cols = pd.Index(z["codes"].astype(str))
        res = {k: pd.DataFrame(z[k], index=idx, columns=cols) for k in _CORE if k != "sc_end"}
        res["sc_end"] = pd.DataFrame(z["sc_end"].astype("datetime64[ns]"), index=idx, columns=cols)
        return res
    fin = guard_fin(read_fin(codes), end_ex, hidden)
    core = core_fields(fin, dates, codes)
    arrs = {k: v.to_numpy(float) for k, v in core.items() if k != "sc_end"}
    arrs["sc_end"] = core["sc_end"].to_numpy("datetime64[ns]")
    tmp = p.with_suffix(".tmp.npz")
    np.savez_compressed(tmp, dates=np.asarray(pd.DatetimeIndex(dates).to_numpy("datetime64[ns]")),
                        codes=np.asarray([str(c) for c in codes]), **arrs)
    tmp.replace(p)
    return core


def panel_fields(fields, panel: dict, end_ex: pd.Timestamp | None, hidden: tuple | None) -> dict[str, pd.DataFrame]:
    """data.load_market 的钩子：panel 含不复权 close（及 close_adj、mcap_total、industry），已按可见范围截断。"""
    close = panel["close"]
    dates = month_rows(close.index)
    codes = close.columns
    out: dict[str, pd.DataFrame] = {}
    base = [f for f in fields if f in FIELDS]
    if base:
        core = core_cached(end_ex, hidden, dates, codes)
        out.update(compute_fields(core, base, close, panel.get("close_adj"), panel.get("mcap_total"),
                                  panel.get("industry")))
    sue = [f for f in fields if f in SURPRISE_FIELDS]
    if sue:
        res = surprise_cached(end_ex, hidden, dates, codes)
        out.update({k: res[k].reindex(columns=codes) for k in sue})
    return out
