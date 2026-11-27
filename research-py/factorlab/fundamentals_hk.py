"""港股点时基本面面板（R7）：hk_fin 点时财报长表（factor-data/hk/fin_pit.parquet）→ 月末 × 代码 的字段。

口径（R7 计划 docs/research/factorlab/rounds/R7-2026-11-27.md，写代码之前提交）：
- 每个月末交易日 d 只用 avail_date ≤ d 的行（avail_date = 公告日之后第一个交易日，所以公告当天不可用）；同一
  （代码，报告期，期间类型，科目）有多条时取 d 当时已生效的最新一条。
- **只用年报与中报**（港股以半年报为主；季报是自愿披露、覆盖时有时无，不用）。流量科目（利润、毛利）是财年初
  至期末累计：年报 = report_type annual 且 period_months = 12，中报 = interim 且 period_months = 6；其他月数的
  记录（改财年的过渡期等）不用。时点科目（总资产、归母权益）没有期初，按 report_type 取年报 / 中报。报告期按
  期末所在月份编号（月序号），同一月份年报与中报都有时取年报。
- TTM：最新一期（d 时已生效、该科目有值的最晚报告期）是年报 → 年报值；是中报 → 中报 + 上一年报（期末早 6 个月）
  − 上年同期中报（期末早 12 个月），三者币种须相同；拿不到为空（不退回旧年报）。
- 陈旧：所用报告期末（月末）早于 d 超过 STALE_DAYS = 300 天 → 空。每个输入各自查（TTM 的最新期、权益 / 总资产
  的最新期、隐含股本所用的报告期）。
- 隐含股本 = 归母净利润 ÷ 基本每股收益（同一报告期、同一期间类型、同一币种，两者都非零、商为正才算），取 d 时
  满足条件且不陈旧的最晚报告期；股数不涉及币种。
- 拆股 / 合股：复权因子 a = close_adj / close；同一只股票相邻两个有价格的交易日 a 的比值 r 满足 |r − 1| > 20% 视为
  拆合股，股本乘 r（报告期末之后、d 及以前的全部这类跳变连乘）；|r − 1| ≤ 20%（分红）不调。只用 d 及以前的价格。
- 总市值 hkf_mcap = 调整后隐含股本 × d 当日不复权收盘（港元；d 无收盘为空）。
- 货币：hkf_ni_ttm、hkf_be 按所用报告期（TTM 取最新一期）的 fx_hkd 折成港元。比率型字段（ROE、毛利 / 资产、资产
  增长、SUE）分子分母同币种、不折算，所用各期币种不同 → 空。
- ROE = TTM 归母净利润 / （TTM 最新期末与 12 个月前期末归母权益的平均），两端权益 ≤ 0 为空。
- 毛利 / 资产 = 毛利 TTM / 同一期末总资产（总资产 ≤ 0 为空）；该代码 d 时可见的窗口内任一行模板为银行或保险 → 空。
- 资产增长 = 最新期末总资产 / 12 个月前期末总资产 − 1（后者 ≤ 0 为空）。
- 半年 SUE：单半年归母净利润 X（上半年 = 中报；下半年 = 年报 − 同财年中报，两者币种相同）。h = d 时已生效的
  归母净利润最新报告期；SUE = (X_h − X_{h−2}) / σ，σ = 同比差 X_{h−j} − X_{h−j−2}（j = 0…5，月份上每隔 6 个月）
  的样本标准差（ddof = 1），至少 SUE_MIN = 4 个有值，币种与 X_h 不同的同比差不用；σ = 0（相对 1e-9）、X_h 或
  X_{h−2} 缺失、h 陈旧 → 空。原值（报告币种），不除股本。

护栏：panel_fields(fields, panel, end_ex, hidden) 由 data.load_market 调用，先删掉 avail_date 不早于可见上界
end_ex（以及落在被删区间 hidden）的财报行再计算（fundamentals_cn.guard_fin，列名相同）。读的是全部行
（hk_fin.load_fin_pit 默认的锁箱截断在这里由 guard_fin 按调用方给的可见范围代替，与 A 股相同）。结果按
（版本、财报文件 sha256、可见范围、月末日期、代码集合、剔除的公告日质量）缓存在 factor-data/hk/derived/。
exclude_quality（只用于稳健性：剔除 date_quality 为修复值的行）默认为空，data.load_market 不传。
"""

from __future__ import annotations

import hashlib
import json

import numpy as np
import pandas as pd

from . import store
from .fundamentals_cn import _sue_stats, guard_fin, month_rows

BUILD_VERSION = "fund-hk-v1"
MARKET = "hk"
STALE_DAYS = 300
WINDOW_M = 60             # 每个快照看最近 60 个月的报告期：SUE 的 σ 要用到 h − 42 个月的单半年（再早 6 个月的中报）
SPLIT_JUMP = 0.2          # 复权因子单日变化超过 20% 视为拆合股
SUE_N = 6                 # σ 用最近 6 个同比差
SUE_MIN = 4               # 至少 4 个有值

ITEMS = ("net_income_parent", "eps_basic", "total_equity_parent", "gross_profit", "total_assets")
STOCK_ITEMS = ("total_equity_parent", "total_assets")
FIN_TEMPLATES = frozenset({"bank", "insurance"})
REPAIRED = ("repaired_hk4008", "repaired_deadline")
FIELDS = ("hkf_ni_ttm", "hkf_be", "hkf_mcap", "hkf_roe", "hkf_gpa", "hkf_asset_growth", "hkf_sue")
PROVIDES = FIELDS
NEEDS = ("close", "close_adj")
READ_COLS = ["code", "report_period", "report_type", "period_months", "item", "value", "avail_date", "currency",
             "fx_hkd", "template", "date_quality"]
_CORE = ("ni_ttm", "be", "roe", "gpa", "asset_growth", "sue", "shares")   # 另有 shares_end（日期）


# ================================================================ 读取
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
    return pd.read_parquet(fin_path(), columns=READ_COLS, filters=filt)


# ================================================================ 核心：月末快照（纯函数）
def _midx(ts) -> np.ndarray:
    ts = pd.DatetimeIndex(ts)
    return (ts.year.to_numpy() * 12 + ts.month.to_numpy() - 1).astype(np.int64)


def _m_end(m: np.ndarray) -> np.ndarray:
    """月序号 → 月末日期（datetime64[D]）。"""
    first_next = (np.asarray(m) - 1970 * 12 + 1).astype("datetime64[M]")
    return first_next.astype("datetime64[D]") - np.timedelta64(1, "D")


def _kind(f: pd.DataFrame) -> np.ndarray:
    """0 = 年报，1 = 中报，-1 = 不用（季报、期间月数不符的流量记录）。"""
    rt = f["report_type"].astype(str).to_numpy()
    pm = pd.to_numeric(f["period_months"], errors="coerce").to_numpy(float, na_value=np.nan)
    stock = f["item"].astype(str).isin(STOCK_ITEMS).to_numpy()
    k = np.full(len(f), -1, dtype=np.int64)
    k[(rt == "annual") & (stock | (pm == 12))] = 0
    k[(rt == "interim") & (stock | (pm == 6))] = 1
    return k


def core_fields(fin: pd.DataFrame, dates, codes=None) -> dict[str, pd.DataFrame]:
    """点时财报长表（已按可见范围删过）→ {中间量: 月末 × 代码}。每个 d 只用 avail_date ≤ d 的行。

    中间量：ni_ttm / be（港元）、roe、gpa、asset_growth、sue、shares（隐含股本，所用报告期末的股数）、
    shares_end（该报告期末，月末日期）。"""
    dates = pd.DatetimeIndex(dates)
    f = fin[fin["item"].astype(str).isin(ITEMS)]
    f = f.loc[f["value"].notna().to_numpy() & f["avail_date"].notna().to_numpy()]
    kind = _kind(f)
    f, kind = f.loc[kind >= 0], kind[kind >= 0]
    if codes is None:
        codes = pd.Index(sorted(f["code"].astype(str).unique()))
    codes = pd.Index([str(c) for c in codes])
    nC, nD, nI = len(codes), len(dates), len(ITEMS)
    out = {k: np.full((nD, nC), np.nan) for k in _CORE}
    out["shares_end"] = np.full((nD, nC), np.datetime64("NaT", "D"), dtype="datetime64[D]")

    def _frames():
        res = {k: pd.DataFrame(v, index=dates, columns=codes) for k, v in out.items() if k != "shares_end"}
        res["shares_end"] = pd.DataFrame(out["shares_end"].astype("datetime64[ns]"), index=dates, columns=codes)
        return res

    if len(f) == 0 or nC == 0:
        return _frames()
    ci = codes.get_indexer(f["code"].astype(str))
    ok = ci >= 0
    f, ci, kind = f.loc[ok], ci[ok], kind[ok]
    ii = pd.Index(ITEMS).get_indexer(f["item"].astype(str))
    mi = _midx(f["report_period"])
    av = f["avail_date"].to_numpy("datetime64[D]")
    val = f["value"].to_numpy(float)
    cur = pd.factorize(f["currency"].astype(str))[0].astype(np.int64)
    fx = pd.to_numeric(f["fx_hkd"], errors="coerce").to_numpy(float, na_value=np.nan)
    tfin = f["template"].astype(str).isin(FIN_TEMPLATES).to_numpy()
    o = np.argsort(av, kind="stable")
    ci, ii, mi, av, val, cur, fx, tfin, kind = (x[o] for x in (ci, ii, mi, av, val, cur, fx, tfin, kind))
    I = {n: k for k, n in enumerate(ITEMS)}
    dm = _midx(dates)
    dd = dates.to_numpy("datetime64[D]")
    W = WINDOW_M + 1
    rows = np.arange(nC)

    def at(x, q, fill=np.nan):                 # x[c, q]（q 越界 → fill）
        okq = (q >= 0) & (q < W)
        r = np.full(nC, fill, dtype=x.dtype)
        r[okq] = x[rows[okq], q[okq]]
        return r

    def latest(has):                           # 每只最新为 True 的相对月份（无 → -1）
        last = W - 1 - np.argmax(has[:, ::-1], axis=1)
        return np.where(has.any(1), last, -1)

    for t in range(nD):
        base = dm[t] - WINDOW_M
        k = int(np.searchsorted(av, dd[t], side="right"))      # avail_date ≤ d
        sel = (mi[:k] >= base) & (mi[:k] <= dm[t])
        c_, i_, w_, k_ = ci[:k][sel], ii[:k][sel], mi[:k][sel] - base, kind[:k][sel]
        v_, cu_, fx_ = val[:k][sel], cur[:k][sel], fx[:k][sel]
        # 同一（代码，月份，期间类型，科目）只留 avail_date 最晚的一条（已按 avail_date 升序：取最后出现的）
        key = ((c_ * W + w_) * 2 + k_) * nI + i_
        _, first_rev = np.unique(key[::-1], return_index=True)
        last = len(key) - 1 - first_rev
        V = np.full((nC, W, 2, nI), np.nan)
        CU = np.full((nC, W, 2, nI), -1, dtype=np.int64)
        FX = np.full((nC, W, 2, nI), np.nan)
        V[c_[last], w_[last], k_[last], i_[last]] = v_[last]
        CU[c_[last], w_[last], k_[last], i_[last]] = cu_[last]
        FX[c_[last], w_[last], k_[last], i_[last]] = fx_[last]
        isfin = np.zeros(nC, dtype=bool)
        isfin[c_[tfin[:k][sel]]] = True
        age = (dd[t] - _m_end(np.arange(base, base + W))) / np.timedelta64(1, "D")
        fresh_w = age <= STALE_DAYS

        def fresh(P):
            return (P >= 0) & fresh_w[np.clip(P, 0, W - 1)]

        def ttm(item):
            j = I[item]
            A, Ia = V[:, :, 0, j], V[:, :, 1, j]
            CA, CI = CU[:, :, 0, j], CU[:, :, 1, j]
            P = latest(~np.isnan(A) | ~np.isnan(Ia))
            isA = at(~np.isnan(A), P, False)
            a, ca, fa = at(A, P), at(CA, P, -1), at(FX[:, :, 0, j], P)
            i0, c0, f0 = at(Ia, P), at(CI, P, -1), at(FX[:, :, 1, j], P)
            a6, ca6 = at(A, P - 6), at(CA, P - 6, -1)
            i12, ci12 = at(Ia, P - 12), at(CI, P - 12, -1)
            same = (c0 == ca6) & (c0 == ci12)
            v = np.where(isA, a, np.where(same, i0 + a6 - i12, np.nan))
            c = np.where(isA, ca, c0)
            fxv = np.where(isA, fa, f0)
            fr = fresh(P)
            return np.where(fr, v, np.nan), np.where(fr, c, -1), fxv, np.where(fr, P, -1)

        def stock(item):                       # 每个月份：年报优先，否则中报
            j = I[item]
            useA = ~np.isnan(V[:, :, 0, j])
            S = np.where(useA, V[:, :, 0, j], V[:, :, 1, j])
            SC = np.where(useA, CU[:, :, 0, j], CU[:, :, 1, j])
            SF = np.where(useA, FX[:, :, 0, j], FX[:, :, 1, j])
            return S, SC, SF

        with np.errstate(invalid="ignore", divide="ignore"):
            ni, c_ni, fx_ni, p_ni = ttm("net_income_parent")
            out["ni_ttm"][t] = ni * fx_ni

            E, EC, EF = stock("total_equity_parent")
            p_be = latest(~np.isnan(E))
            p_be = np.where(fresh(p_be), p_be, -1)
            be = at(E, p_be)
            out["be"][t] = np.where(be > 0, be * at(EF, p_be), np.nan)

            e0, e1 = at(E, p_ni), at(E, p_ni - 12)
            ce0, ce1 = at(EC, p_ni, -1), at(EC, p_ni - 12, -1)
            ok_roe = (p_ni >= 0) & (e0 > 0) & (e1 > 0) & (ce0 == c_ni) & (ce1 == c_ni)
            out["roe"][t] = np.where(ok_roe, ni / ((e0 + e1) / 2), np.nan)

            TA, TC, _ = stock("total_assets")
            gp, c_gp, _, p_gp = ttm("gross_profit")
            ta_gp, tc_gp = at(TA, p_gp), at(TC, p_gp, -1)
            ok_gpa = (p_gp >= 0) & (ta_gp > 0) & (tc_gp == c_gp) & ~isfin
            out["gpa"][t] = np.where(ok_gpa, gp / ta_gp, np.nan)

            p_ta = latest(~np.isnan(TA))
            p_ta = np.where(fresh(p_ta), p_ta, -1)
            g0, g1 = at(TA, p_ta), at(TA, p_ta - 12)
            ok_ag = (p_ta >= 0) & (g1 > 0) & (at(TC, p_ta, -1) == at(TC, p_ta - 12, -1))
            out["asset_growth"][t] = np.where(ok_ag, g0 / g1 - 1, np.nan)

            # 隐含股本：同一（月份，期间类型）的归母净利润 ÷ 基本每股收益
            N, Ep = V[:, :, :, I["net_income_parent"]], V[:, :, :, I["eps_basic"]]
            okq = (N != 0) & (Ep != 0) & (CU[:, :, :, I["net_income_parent"]] == CU[:, :, :, I["eps_basic"]])
            Q = np.where(okq, N / Ep, np.nan)
            Q = np.where(Q > 0, Q, np.nan)
            Qm = np.where(~np.isnan(Q[:, :, 0]), Q[:, :, 0], Q[:, :, 1])
            p_sh = latest(~np.isnan(Qm) & fresh_w[None, :])
            out["shares"][t] = at(Qm, p_sh)
            e = np.full(nC, np.datetime64("NaT", "D"), dtype="datetime64[D]")
            okp = p_sh >= 0
            e[okp] = _m_end(base + p_sh[okp])
            out["shares_end"][t] = e

            # 半年 SUE
            j = I["net_income_parent"]
            A, Ia = V[:, :, 0, j], V[:, :, 1, j]
            CA, CI = CU[:, :, 0, j], CU[:, :, 1, j]
            H2 = np.full_like(A, np.nan)
            H2[:, 6:] = np.where(CA[:, 6:] == CI[:, :-6], A[:, 6:] - Ia[:, :-6], np.nan)
            hasA = ~np.isnan(A)
            X = np.where(hasA, H2, Ia)
            CX = np.where(hasA, CA, CI)
            CX = np.where(np.isnan(X), -1, CX)
            D = np.full_like(X, np.nan)
            D[:, 12:] = np.where(CX[:, 12:] == CX[:, :-12], X[:, 12:] - X[:, :-12], np.nan)
            h = latest(hasA | ~np.isnan(Ia))
            idx = h[:, None] - 6 * np.arange(SUE_N)[None, :]
            okh = (idx >= 0) & (h >= 0)[:, None]
            ic = np.clip(idx, 0, W - 1)
            G = np.where(okh, D[rows[:, None], ic], np.nan)
            G = np.where(CX[rows[:, None], ic] == at(CX, h, -1)[:, None], G, np.nan)
            num, sd, n = _sue_stats(G)
            good = fresh(h) & (n >= SUE_MIN) & ~np.isnan(num) & (sd > 0)
            out["sue"][t] = np.where(good, num / np.where(sd > 0, sd, 1.0), np.nan)
    return _frames()


# ================================================================ 与日度面板合成
def split_ratios(close: pd.DataFrame, close_adj: pd.DataFrame) -> pd.DataFrame:
    """每个交易日的拆合股比例：复权因子相对上一个有价格交易日的比值 r，|r − 1| > SPLIT_JUMP 时为 r，否则为 1。"""
    adj = (close_adj.reindex_like(close) / close.where(close > 0)).replace([np.inf, -np.inf], np.nan)
    prev = adj.ffill().shift(1)
    r = adj / prev
    jump = (r - 1).abs() > SPLIT_JUMP
    return r.where(jump & r.notna() & (r > 0), 1.0)


def implied_mcap(shares: pd.DataFrame, shares_end: pd.DataFrame, close: pd.DataFrame,
                 close_adj: pd.DataFrame | None) -> pd.DataFrame:
    """月末总市值 = 隐含股本 × 报告期末之后至 d 的拆合股比例连乘 × d 当日不复权收盘。只用 d 及以前的价格。"""
    dates = shares.index
    codes = close.columns
    px = close.reindex(index=dates, columns=codes)
    px = px.where(px > 0)
    base = shares.reindex(columns=codes) * px
    if close_adj is None:
        return base
    L = np.log(split_ratios(close, close_adj)).cumsum()       # 交易日 × 代码，累计对数拆合股比例
    days = L.index.to_numpy("datetime64[ns]")
    Lv = L.to_numpy(float)
    pos_d = np.searchsorted(days, dates.to_numpy("datetime64[ns]"), side="right") - 1
    Ld = np.where((pos_d >= 0)[:, None], Lv[np.clip(pos_d, 0, None)], 0.0)
    end = shares_end.reindex(columns=codes).to_numpy("datetime64[ns]")
    pos_e = np.searchsorted(days, np.where(np.isnat(end), days[0], end), side="right") - 1
    cols = np.broadcast_to(np.arange(len(codes)), end.shape)
    Le = np.where(pos_e >= 0, Lv[np.clip(pos_e, 0, None), cols], 0.0)   # 期末早于第一笔价格：之前没有跳变
    ratio = np.exp(Ld - Le)
    ratio[np.isnat(end)] = np.nan
    return base * ratio


def compute_fields(core: dict[str, pd.DataFrame], fields, close: pd.DataFrame,
                   close_adj: pd.DataFrame | None) -> dict[str, pd.DataFrame]:
    codes = close.columns
    C = {k: v.reindex(columns=codes) for k, v in core.items()}
    out = {"hkf_ni_ttm": C["ni_ttm"], "hkf_be": C["be"], "hkf_roe": C["roe"], "hkf_gpa": C["gpa"],
           "hkf_asset_growth": C["asset_growth"], "hkf_sue": C["sue"]}
    if "hkf_mcap" in fields:
        out["hkf_mcap"] = implied_mcap(C["shares"], C["shares_end"], close, close_adj)
    return {k: v for k, v in out.items() if k in set(fields)}


# ================================================================ 评估时：data.load_market 的钩子
def _cache_key(end_ex, hidden, dates, codes, exclude_quality) -> str:
    h = hashlib.sha256()
    h.update(json.dumps([BUILD_VERSION, _fin_sha(), None if end_ex is None else str(end_ex),
                         None if hidden is None else [str(x) for x in hidden],
                         [str(d.date()) for d in dates], sorted(map(str, codes)),
                         None if not exclude_quality else sorted(exclude_quality)]).encode())
    return h.hexdigest()[:20]


def _cache_dir():
    d = store.market_dir(MARKET) / "derived"
    d.mkdir(parents=True, exist_ok=True)
    return d


def core_cached(end_ex, hidden, dates, codes, exclude_quality=None) -> dict[str, pd.DataFrame]:
    key = _cache_key(end_ex, hidden, dates, codes, exclude_quality)
    p = _cache_dir() / f"fund_hk_{key}.npz"
    if p.exists():
        z = np.load(p, allow_pickle=False)
        idx = pd.DatetimeIndex(z["dates"])
        cols = pd.Index(z["codes"].astype(str))
        res = {k: pd.DataFrame(z[k], index=idx, columns=cols) for k in _CORE}
        res["shares_end"] = pd.DataFrame(z["shares_end"].astype("datetime64[ns]"), index=idx, columns=cols)
        return res
    fin = guard_fin(read_fin(codes), end_ex, hidden)
    if exclude_quality:
        fin = fin[~fin["date_quality"].astype(str).isin(list(exclude_quality))]
    core = core_fields(fin, dates, codes)
    arrs = {k: core[k].to_numpy(float) for k in _CORE}
    arrs["shares_end"] = core["shares_end"].to_numpy("datetime64[ns]")
    tmp = p.with_suffix(".tmp.npz")
    np.savez_compressed(tmp, dates=np.asarray(pd.DatetimeIndex(dates).to_numpy("datetime64[ns]")),
                        codes=np.asarray([str(c) for c in codes]), **arrs)
    tmp.replace(p)
    return core


def panel_fields(fields, panel: dict, end_ex: pd.Timestamp | None, hidden: tuple | None,
                 exclude_quality=None) -> dict[str, pd.DataFrame]:
    """data.load_market 的钩子：panel 含不复权 close（及 close_adj），已按可见范围截断。
    exclude_quality：只给稳健性检查用（剔除这些 date_quality 的财报行），数据层不传。"""
    close = panel["close"]
    dates = month_rows(close.index)
    codes = close.columns
    want = [f for f in fields if f in FIELDS]
    if not want:
        return {}
    core = core_cached(end_ex, hidden, dates, codes, exclude_quality)
    return compute_fields(core, want, close, panel.get("close_adj"))
