#!/usr/bin/env python3
"""L-052 v3 数事件（聚合输出，无逐月清单、无收益）。

- TTM：fundamentals_cn.panel_fields → fin_ni_ttm
- 行业收益权重：t−1 mcap_float；个股收益用前一有效收盘（复牌日计入停牌涨跌）
- 覆盖池：有点时行业归属的股票；成交额分母=覆盖池
- PE：分子仅 mcap_total（不同时有 TTM 则剔除）；历史用 t 时成分回溯；2000-01 预热
- 跳过三类计数；C1b 顺延上限 2K；C2 作用在 B2 持仓
用法：cd research-py && uv run python ../docs/research/theme-pe-cn-2026-11-28/count_theme_pe.py
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from sw_canon import SW2014_LAUNCH, SW_CANON, UNMAPPED_SPLITS, canon  # noqa: E402

OUT = HERE / "counts_theme_pe.json"
WARM_START, COUNT_START, END = "2000-01-01", "2005-01-01", "2023-10-31"
K, EXIT_RANK = 2, 4
LOOK_6, LOOK_3 = 126, 63
AMT_A, AMT_B, AMT_BASE = 60, 20, 250
PE_HIST, PE_MIN = 60, 36
IND_MIN = 5


def month_ends(dates: pd.DatetimeIndex) -> pd.DatetimeIndex:
    s = pd.Series(dates, index=dates)
    return pd.DatetimeIndex(pd.to_datetime(s.groupby(dates.to_period("M")).max().values))


def cum_ret(series: np.ndarray, L: int) -> np.ndarray:
    out = np.full(len(series), np.nan)
    log1 = np.where(np.isfinite(series), np.log1p(np.clip(series, -0.95, 10)), np.nan)
    need = int(L * 0.8)
    for i in range(L - 1, len(series)):
        w = log1[i - L + 1 : i + 1]
        if np.isfinite(w).sum() >= need:
            out[i] = float(np.expm1(np.nansum(w)))
    return out


def resume_returns(close: pd.DataFrame) -> np.ndarray:
    """以前一有效收盘为基准；停牌缺行时复牌日计入期间涨跌。"""
    n_d, n_c = close.shape
    px = close.to_numpy(float)
    out = np.full((n_d, n_c), np.nan)
    last = np.full(n_c, np.nan)
    for t in range(n_d):
        cur = px[t]
        ok = np.isfinite(cur) & (cur > 0)
        prev_ok = np.isfinite(last) & (last > 0)
        both = ok & prev_ok
        out[t, both] = cur[both] / last[both] - 1.0
        last[ok] = cur[ok]
    return out


def main() -> None:
    sys.path.insert(0, str(HERE.parents[2] / "research-py"))
    from factorlab import fundamentals_cn as fc
    from factorlab import store
    from factorlab.guard import Lockbox

    lb = Lockbox()
    end_ex = store.lockbox_start("cn")
    print("load prices…", WARM_START, "→", end_ex)
    panel = store.load_panel(
        "cn",
        ["close", "close_adj", "amount", "industry", "mcap_float", "mcap_total"],
        start=WARM_START,
        end=None if end_ex is None else (pd.Timestamp(end_ex) - pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
        raw=True,
    )
    # 截到 END
    for k in list(panel):
        panel[k] = panel[k].loc[:END]

    print("fin_ni_ttm via fundamentals_cn…")
    fin_panel = fc.panel_fields(["fin_ni_ttm"], panel, end_ex, None)
    fin_ni = fin_panel["fin_ni_ttm"]  # 月末 × 代码

    close = panel["close_adj"]
    amount = panel["amount"]
    industry = panel["industry"].map(lambda x: canon(x) if isinstance(x, str) else x)
    mcap_f = panel["mcap_float"].where(panel["mcap_float"] > 0)
    mcap_t = panel["mcap_total"].where(panel["mcap_total"] > 0)
    dates = close.index
    # 覆盖池掩码：当日有价且有行业
    has_px = close.notna() & (close > 0)
    covered = industry.notna() & has_px
    cov_rate = covered.sum(axis=1) / has_px.sum(axis=1).replace(0, np.nan)

    ret_v = resume_returns(close)
    amt_v = amount.to_numpy(float)
    mf_v = mcap_f.to_numpy(float)
    mt_v = mcap_t.to_numpy(float)
    ind_v = industry.to_numpy(object)
    cov_v = covered.to_numpy(bool)
    n_d, n_c = close.shape
    codes = list(close.columns)

    all_inds = sorted({x for x in industry.to_numpy().ravel() if isinstance(x, str)})
    print(f"days={n_d} codes={n_c} inds={len(all_inds)}")

    # 行业日序列：收益用 t−1 市值加权；成交额仅覆盖池
    ind_ret = {i: np.full(n_d, np.nan) for i in all_inds}
    ind_amt = {i: np.full(n_d, np.nan) for i in all_inds}
    ind_n = {i: np.full(n_d, np.nan) for i in all_inds}
    mkt_amt = np.zeros(n_d)
    print("aggregate industries…")
    for t in range(n_d):
        w_prev = mf_v[t - 1] if t > 0 else np.full(n_c, np.nan)
        g, r, a = ind_v[t], ret_v[t], amt_v[t]
        cov = cov_v[t]
        mkt_amt[t] = float(np.nansum(a[cov & np.isfinite(a) & (a > 0)]))
        for name in {x for x in g if isinstance(x, str)}:
            mask = (g == name) & cov
            if not np.any(mask):
                continue
            ww, rr, aa = w_prev[mask], r[mask], a[mask]
            ok = np.isfinite(ww) & (ww > 0) & np.isfinite(rr)
            n_ok = int(ok.sum())
            ind_n[name][t] = n_ok
            if n_ok >= IND_MIN:
                ind_ret[name][t] = float(np.dot(ww[ok], rr[ok]) / ww[ok].sum())
            aok = np.isfinite(aa) & (aa > 0)
            if aok.any():
                ind_amt[name][t] = float(aa[aok].sum())
        if (t + 1) % 1000 == 0:
            print(f"  day {t+1}/{n_d}")

    # 市场等权（覆盖池）
    mkt_ret = np.array([
        np.nanmean(ret_v[t, cov_v[t]]) if cov_v[t].any() else np.nan for t in range(n_d)
    ])
    mkt_c3, mkt_c6 = cum_ret(mkt_ret, LOOK_3), cum_ret(mkt_ret, LOOK_6)
    ind_c3 = {i: cum_ret(ind_ret[i], LOOK_3) for i in all_inds}
    ind_c6 = {i: cum_ret(ind_ret[i], LOOK_6) for i in all_inds}

    def shares(win: int):
        sh, elev = {}, {}
        for name in all_inds:
            a = pd.Series(ind_amt[name]).rolling(win, min_periods=win).sum().to_numpy()
            m = pd.Series(mkt_amt).rolling(win, min_periods=win).sum().to_numpy()
            s = np.where((m > 0) & np.isfinite(a), a / m, np.nan)
            sh[name] = s
            base = pd.Series(s).rolling(AMT_BASE, min_periods=120).mean().to_numpy()
            elev[name] = (s > base) & np.isfinite(s) & np.isfinite(base)
        return sh, elev

    share_a, elev_a = shares(AMT_A)
    share_b, elev_b = shares(AMT_B)

    mes_all = month_ends(dates)
    t0, t1 = pd.Timestamp(COUNT_START), pd.Timestamp(END)
    mes = pd.DatetimeIndex([d for d in mes_all if t0 <= d <= t1])
    date_pos = {d: i for i, d in enumerate(dates)}
    # fin_ni 对齐月末
    ni_m = fin_ni.reindex(index=mes_all, columns=codes)

    # 每月：点时行业 PE（当月成分）— 用于报告剔除占比；分位用 t 时成分回溯
    print("month PE (t-constituent history)…")
    # 预计算每个月末每个股票的 pe_stock = mcap_total / ni_ttm（两者皆有）
    pe_stock = {}  # me -> array n_c
    drop_frac = []  # yearly exclusion for PE
    for me in mes_all:
        if me not in date_pos:
            continue
        t = date_pos[me]
        mt = mt_v[t]
        ni = ni_m.loc[me].to_numpy(float) if me in ni_m.index else np.full(n_c, np.nan)
        ok = np.isfinite(mt) & (mt > 0) & np.isfinite(ni)
        pe_stock[me] = (mt, ni, ok)

    def industry_pe_at(me: pd.Timestamp, members_mask: np.ndarray) -> tuple[float | None, str | None]:
        """members_mask: 成分（t 时）。返回 (PE, fail_reason) fail in {None,'no_pe_ni','neg_ni'}."""
        if me not in pe_stock:
            return None, "no_pe_ni"
        mt, ni, ok = pe_stock[me]
        m = members_mask & ok & cov_v[date_pos[me]]
        if int(m.sum()) < IND_MIN:
            return None, "no_pe_ni"
        mc_sum = float(mt[m].sum())
        ni_sum = float(ni[m].sum())
        if mc_sum <= 0:
            return None, "no_pe_ni"
        if ni_sum <= 0:
            return None, "neg_ni"
        return mc_sum / ni_sum, None

    def members_mask(t: int, name: str) -> np.ndarray:
        return (ind_v[t] == name) & cov_v[t]

    def pe_pct_t_const(me: pd.Timestamp, name: str) -> tuple[float | None, float | None, str | None]:
        """返回 (pct, pe_now, skip_class) skip_class: pe90|hist|neg_ni|None."""
        t = date_pos[me]
        mem = members_mask(t, name)
        pe_now, fail = industry_pe_at(me, mem)
        if fail == "neg_ni":
            return None, None, "neg_ni"
        if pe_now is None:
            return None, None, "hist"  # 无有效 PE
        # 回溯：用 t 时成分在过去月末的合计 PE
        hist = []
        # 取 me 之前（含）的月末
        idx = list(mes_all).index(me) if me in mes_all else -1
        if idx < 0:
            return None, pe_now, "hist"
        for me2 in mes_all[max(0, idx - PE_HIST + 1) : idx + 1]:
            if me2 not in date_pos:
                continue
            # 成分仍用 t（当前）的 mem
            p, f = industry_pe_at(me2, mem)
            if p is not None:
                hist.append(p)
        if len(hist) < PE_MIN:
            return None, pe_now, "hist"
        pct = float(np.mean(np.asarray(hist) <= pe_now))
        if pct > 0.90:
            return pct, pe_now, "pe90"
        return pct, pe_now, None

    def rank_df(t: int, elev: dict, use_3: bool) -> pd.DataFrame:
        rows = []
        for name in all_inds:
            if not (np.isfinite(ind_n[name][t]) and ind_n[name][t] >= IND_MIN):
                continue
            if not bool(elev[name][t]):
                continue
            r6 = ind_c6[name][t]
            if not (np.isfinite(r6) and np.isfinite(mkt_c6[t])):
                continue
            rel3 = None
            if use_3:
                r3 = ind_c3[name][t]
                if not (np.isfinite(r3) and np.isfinite(mkt_c3[t])):
                    continue
                rel3 = float(r3 - mkt_c3[t])
            rows.append({"ind": name, "rel6": float(r6 - mkt_c6[t]), "rel3": rel3})
        if not rows:
            return pd.DataFrame(columns=["ind", "rel6", "rel3", "score", "rank"])
        df = pd.DataFrame(rows)
        if use_3:
            # average 秩
            df["score"] = df["rel3"].rank(ascending=False, method="average") + df["rel6"].rank(
                ascending=False, method="average"
            )
        else:
            df["score"] = df["rel6"].rank(ascending=False, method="average")
        # 并列打破：sha256
        def tie_key(n: str) -> str:
            return hashlib.sha256(f"tie:{n}".encode()).hexdigest()

        df = df.sort_values(["score", "rel6"]).copy()
        df["_tie"] = df["ind"].map(tie_key)
        df = df.sort_values(["score", "rel6", "_tie"]).reset_index(drop=True)
        df["rank"] = np.arange(1, len(df) + 1)
        return df.drop(columns=["_tie"])

    # 预计算每月排名与 PE 信息（仅 COUNT_START 起计入摘要，但状态机从有数据起转）
    print("monthly state…")
    rows_a, rows_b = [], []
    for me in mes_all:
        if me not in date_pos or me < pd.Timestamp("2004-01-01"):
            continue  # 状态机预热略早于 COUNT_START
        t = date_pos[me]
        ra, rb = rank_df(t, elev_a, False), rank_df(t, elev_b, True)
        # PE skip class per industry at me（仅对可能用到的算，全算也可）
        pe_info = {}  # 懒计算（pe_of）
        rows_a.append({"me": me, "t": t, "df": ra, "pe": pe_info})
        rows_b.append({"me": me, "t": t, "df": rb, "pe": pe_info})

    # 补全 pe_info：状态机里可能持有不在当月 top 的行业（缓冲）— 懒计算
    def pe_of(row, name):
        if name in row["pe"]:
            return row["pe"][name]
        info = pe_pct_t_const(row["me"], name)
        row["pe"][name] = info
        return info

    def apply_pe(pool: list[str], row, k: int, use_pe90: bool) -> tuple[list[str], dict]:
        """use_pe90=False → B2′：只跳过 hist/neg_ni。"""
        held, stats = [], {"pe90": 0, "hist": 0, "neg_ni": 0}
        for name in pool:
            if len(held) >= k:
                break
            pct, pe, klass = pe_of(row, name)
            if klass == "neg_ni":
                stats["neg_ni"] += 1
                continue
            if klass == "hist":
                stats["hist"] += 1
                continue
            if use_pe90 and (klass == "pe90" or (pct is not None and pct > 0.90)):
                stats["pe90"] += 1
                continue
            held.append(name)
        return held, stats

    # ——— C1a 状态机 ———
    def run_c1a(k: int, exit_rank: int, use_pe90: bool):
        active: set[str] = set()
        prev_topk: set[str] = set()
        held_lists, skip_tot = [], {"pe90": 0, "hist": 0, "neg_ni": 0}
        n_empty = n_held_months = 0
        runs_lens = []
        # track runs
        run_len = {}
        for row in rows_a:
            df = row["df"]
            rank_map = dict(zip(df["ind"], df["rank"])) if len(df) else {}
            # 资金集中不成立即不在 rank_map → 退出
            topk = {n for n, r in rank_map.items() if r <= k}
            top_exit = {n for n, r in rank_map.items() if r <= exit_rank}
            enter = {n for n in topk if n in prev_topk}
            # (b) 不在排名表（含资金集中失败）即退出；缓冲只对仍在 top_exit 的
            still = {n for n in active if n in top_exit}
            active = still | enter
            # (e) 主线集合按名次取前 k 作为「候选槽」排序池；缓冲不保护超过 k 的名次优先
            pool = sorted(active, key=lambda n: (rank_map.get(n, 999), hashlib.sha256(f"tie:{n}".encode()).hexdigest()))
            # 持仓：PE 过滤后最多 k；不足则部分 B0（空槽）
            held, st = apply_pe(pool, row, k, use_pe90)
            for kk in skip_tot:
                skip_tot[kk] += st[kk]
            # (d) 持有中分位>0.90：已在 apply_pe 中因 pe90 跳过而不进入 held
            # (c) 槽位：记录 n_held；收益阶段 1/k，此处只计数
            in_count = row["me"] >= pd.Timestamp(COUNT_START)
            if in_count:
                held_lists.append(held)
                if not held:
                    n_empty += 1
                else:
                    n_held_months += 1
                # runs
                for n in list(run_len.keys()):
                    if n not in held:
                        runs_lens.append(run_len.pop(n))
                for n in held:
                    run_len[n] = run_len.get(n, 0) + 1
            prev_topk = topk
        for v in run_len.values():
            runs_lens.append(v)
        switches = sum(1 for i in range(1, len(held_lists)) if set(held_lists[i]) != set(held_lists[i - 1]))
        turns = []
        for i in range(1, len(held_lists)):
            a, b = set(held_lists[i - 1]), set(held_lists[i])
            turns.append(0.0 if not a and not b else 1.0 - len(a & b) / max(1, len(a | b)))
        return {
            "months": n_held_months + n_empty,
            "months_with_held": n_held_months,
            "months_empty": n_empty,
            "switches": switches,
            "mean_held": float(np.mean([len(h) for h in held_lists])) if held_lists else 0.0,
            "median_run": float(np.median(runs_lens)) if runs_lens else None,
            "mean_run": float(np.mean(runs_lens)) if runs_lens else None,
            "max_run": int(np.max(runs_lens)) if runs_lens else None,
            "mean_turnover_jaccard": float(np.mean(turns)) if turns else None,
            "skips": skip_tot,
            "held_lists": held_lists,  # 内部用，写出前删
            "mes_count": [r["me"] for r in rows_a if r["me"] >= pd.Timestamp(COUNT_START)],
        }

    def run_c1b(k: int, use_pe90: bool):
        held_lists, skip_tot = [], {"pe90": 0, "hist": 0, "neg_ni": 0}
        n_empty = n_held_months = 0
        runs_lens, run_len = [], {}
        for row in rows_b:
            if row["me"] < pd.Timestamp(COUNT_START):
                continue
            df = row["df"]
            ordered = df["ind"].tolist() if len(df) else []
            # 顺延上限 2K
            pool = ordered[: 2 * k]
            held, st = apply_pe(pool, row, k, use_pe90)
            for kk in skip_tot:
                skip_tot[kk] += st[kk]
            held_lists.append(held)
            if not held:
                n_empty += 1
            else:
                n_held_months += 1
            for n in list(run_len.keys()):
                if n not in held:
                    runs_lens.append(run_len.pop(n))
            for n in held:
                run_len[n] = run_len.get(n, 0) + 1
        for v in run_len.values():
            runs_lens.append(v)
        switches = sum(1 for i in range(1, len(held_lists)) if set(held_lists[i]) != set(held_lists[i - 1]))
        return {
            "months": n_held_months + n_empty,
            "months_with_held": n_held_months,
            "months_empty": n_empty,
            "switches": switches,
            "mean_held": float(np.mean([len(h) for h in held_lists])) if held_lists else 0.0,
            "median_run": float(np.median(runs_lens)) if runs_lens else None,
            "mean_run": float(np.mean(runs_lens)) if runs_lens else None,
            "max_run": int(np.max(runs_lens)) if runs_lens else None,
            "skips": skip_tot,
            "held_lists": held_lists,
        }

    c1a = run_c1a(K, EXIT_RANK, True)
    c1a_b2 = run_c1a(K, EXIT_RANK, False)  # B2：持续主线无 PE90 过滤（仍跳过 hist/neg）
    c1b = run_c1b(K, True)
    c1b_b2b = run_c1b(K, False)  # B2b

    # B4：C1a 信号每月前 K + PE，无持续
    def run_b4():
        held_lists, skip_tot = [], {"pe90": 0, "hist": 0, "neg_ni": 0}
        n_empty = n_held = 0
        for row in rows_a:
            if row["me"] < pd.Timestamp(COUNT_START):
                continue
            ordered = row["df"]["ind"].tolist() if len(row["df"]) else []
            held, st = apply_pe(ordered[: 2 * K], row, K, True)
            for kk in skip_tot:
                skip_tot[kk] += st[kk]
            held_lists.append(held)
            n_empty += int(not held)
            n_held += int(bool(held))
        return {
            "months_with_held": n_held, "months_empty": n_empty, "skips": skip_tot,
            "mean_held": float(np.mean([len(h) for h in held_lists])) if held_lists else 0.0,
            "switches": sum(1 for i in range(1, len(held_lists)) if set(held_lists[i]) != set(held_lists[i - 1])),
        }

    b4 = run_b4()

    # C2 on B2 holdings
    c2 = []
    b2_held = c1a_b2["held_lists"]
    mes_c = [r["me"] for r in rows_a if r["me"] >= pd.Timestamp(COUNT_START)]
    for i, me in enumerate(mes_c):
        row = next(r for r in rows_a if r["me"] == me)
        t = row["t"]
        for name in b2_held[i]:
            pct, pe, klass = pe_of(row, name)
            if pct is None or not np.isfinite(pct) or pct <= 0.95:
                continue
            sh = share_a[name]
            if t < 60 or not np.isfinite(sh[t]) or not np.isfinite(sh[t - 60]):
                continue
            if sh[t] < sh[t - 60]:
                c2.append({"date": str(me.date()), "ind": name, "pe_pct": float(pct)})

    # 覆盖率
    cov_by_year = {}
    for y, g in pd.Series(cov_rate.values, index=dates).groupby(dates.year):
        if COUNT_START[:4] <= str(y) <= END[:4]:
            cov_by_year[str(y)] = float(g.mean())

    # PE 剔除占比：覆盖池中无 mcap_total+ni 的比例（验证段）
    pe_excl = []
    for me in mes:
        t = date_pos[me]
        mt, ni, ok = pe_stock[me]
        cov = cov_v[t]
        if cov.sum() == 0:
            continue
        pe_excl.append(1.0 - float(ok[cov].mean()))

    def strip(d):
        d = dict(d)
        d.pop("held_lists", None)
        d.pop("mes_count", None)
        return d

    def window_stats(held_lists, mes_list, start, end):
        idx = [i for i, m in enumerate(mes_list) if start <= str(m.date()) <= end]
        hs = [held_lists[i] for i in idx]
        return {
            "months": len(hs),
            "months_with_held": sum(1 for h in hs if h),
            "months_empty": sum(1 for h in hs if not h),
            "switches": sum(1 for i in range(1, len(hs)) if set(hs[i]) != set(hs[i - 1])),
            "mean_held": float(np.mean([len(h) for h in hs])) if hs else 0.0,
        }

    mes_list = mes_c
    out = {
        "id": "L-052",
        "version": "v3",
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "params": {
            "K": K, "EXIT_RANK": EXIT_RANK, "LOOK_6": LOOK_6, "LOOK_3": LOOK_3,
            "AMT_A": AMT_A, "AMT_B": AMT_B, "AMT_BASE": AMT_BASE,
            "PE_HIST": PE_HIST, "PE_MIN": PE_MIN, "WARM_START": WARM_START,
            "COUNT_START": COUNT_START, "END": END,
            "sw_canon": SW_CANON, "unmapped": list(UNMAPPED_SPLITS),
            "SW2014_LAUNCH": SW2014_LAUNCH,
            "ttm": "fundamentals_cn.fin_ni_ttm",
            "mcap_ret": "t-1 mcap_float",
            "mcap_pe": "mcap_total only (no float fallback)",
            "coverage": "industry notna",
            "note": "聚合计数；无逐月持仓清单；无收益",
        },
        "coverage_by_year": cov_by_year,
        "pe_exclude_share_median": float(np.median(pe_excl)) if pe_excl else None,
        "C1a": strip(c1a),
        "C1b": strip(c1b),
        "B2_persistent_no_pe90": strip(c1a_b2),
        "B2b_monthly_no_pe90": strip(c1b_b2b),
        "B4_monthly_c1a_signal": b4,
        "c2_on_B2": {"n": len(c2), "note": "定义上对 C1a 持仓不可能；改作用 B2"},
        "windows": {
            "explore_C1a": window_stats(c1a["held_lists"], mes_list, "2005-01-01", "2014-12-31"),
            "validate_C1a": window_stats(c1a["held_lists"], mes_list, "2015-01-01", "2023-10-31"),
            "explore_C1b": window_stats(c1b["held_lists"], mes_list, "2005-01-01", "2014-12-31"),
            "validate_C1b": window_stats(c1b["held_lists"], mes_list, "2015-01-01", "2023-10-31"),
        },
        "sensitivity_C1a_K": {
            f"K={k}": strip(run_c1a(k, max(EXIT_RANK, k + 2), True)) for k in (1, 2, 3)
        },
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    brief = {k: out[k] for k in ("C1a", "C1b", "B2_persistent_no_pe90", "B4_monthly_c1a_signal", "c2_on_B2", "windows")}
    print(json.dumps(brief, ensure_ascii=False, indent=2))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
