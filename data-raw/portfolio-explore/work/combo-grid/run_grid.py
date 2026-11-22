#!/usr/bin/env python3
"""跑完整组合网格 + 滚动起点 + 相关，写出中间结果与摘要。"""
from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

from engine import (
    GROWTH,
    HIGHVOL,
    STABLE,
    W2_GROWTH,
    W2_HIGHVOL,
    W1_START,
    W1_END,
    W2_START,
    W2_END,
    P,
    pairs,
    combo_stocks,
    template_weights,
    equal_weights,
    run_backtest,
    verify_anchors,
    dist_stats,
    common_dates,
    quarterly_starts,
    daily_returns,
    corr,
)

OUT = Path(__file__).resolve().parent


def row_id(g, hv, st):
    return f"{g[0]}+{g[1]}|{hv[0]}+{hv[1]}|{st}"


def run_one(stocks, tw, modes, start, end):
    out = {}
    for m in modes:
        out[m] = run_backtest(stocks, tw, m, start, end)
    return out


def deltas(a, b, keys=("cagr", "mdd", "cer")):
    # a - b (e.g. REB - BH). For mdd (more negative = worse), positive delta = less drawdown if a.mdd > b.mdd
    return {k: a[k] - b[k] for k in keys}


def collect_deltas(rows, mode_a, mode_b="bh"):
    dc = [r["delta"][mode_a]["cagr"] for r in rows]
    dm = [r["delta"][mode_a]["mdd"] for r in rows]
    de = [r["delta"][mode_a]["cer"] for r in rows]
    return {
        "cagr": dist_stats(dc),
        "mdd": dist_stats(dm),
        "cer": dist_stats(de),
    }


def group_median(rows, key_fn, mode="band"):
    buckets = defaultdict(list)
    for r in rows:
        buckets[key_fn(r)].append(r["delta"][mode]["cagr"])
    out = {}
    for k, xs in sorted(buckets.items(), key=lambda kv: -dist_stats(kv[1])["median"]):
        out[k] = {
            "n": len(xs),
            "cagr_med": dist_stats(xs)["median"],
            "cagr_pct_pos": dist_stats(xs)["pct_positive"],
            "mdd_med": dist_stats([r["delta"][mode]["mdd"] for r in rows if key_fn(r) == k])["median"],
            "cer_med": dist_stats([r["delta"][mode]["cer"] for r in rows if key_fn(r) == k])["median"],
        }
    return out


def build_rows(combos, start, end, weight_name, tw):
    modes = ("bh", "band", "monthly")
    rows = []
    for g, hv, st in combos:
        stocks = combo_stocks(g, hv, st)
        res = run_one(stocks, tw, modes, start, end)
        d = {
            "band": deltas(res["band"], res["bh"]),
            "monthly": deltas(res["monthly"], res["bh"]),
        }
        rows.append(
            {
                "id": row_id(g, hv, st),
                "growth": list(g),
                "highvol": list(hv),
                "stable": st,
                "has_rklb": "RKLB" in hv,
                "weight": weight_name,
                "bh": res["bh"],
                "band": res["band"],
                "monthly": res["monthly"],
                "delta": d,
            }
        )
    return rows


def summary_block(rows, label):
    return {
        "label": label,
        "n": len(rows),
        "reb_minus_bh": collect_deltas(rows, "band"),
        "mon_minus_bh": collect_deltas(rows, "monthly"),
        "by_stable": group_median(rows, lambda r: r["stable"]),
        "by_highvol": group_median(rows, lambda r: "+".join(r["highvol"])),
        "by_growth": group_median(rows, lambda r: "+".join(r["growth"])),
        "rklb_yes": collect_deltas([r for r in rows if r["has_rklb"]], "band")
        if any(r["has_rklb"] for r in rows)
        else None,
        "rklb_no": collect_deltas([r for r in rows if not r["has_rklb"]], "band")
        if any(not r["has_rklb"] for r in rows)
        else None,
        "rklb_yes_mon": collect_deltas([r for r in rows if r["has_rklb"]], "monthly")
        if any(r["has_rklb"] for r in rows)
        else None,
        "rklb_no_mon": collect_deltas([r for r in rows if not r["has_rklb"]], "monthly")
        if any(not r["has_rklb"] for r in rows)
        else None,
    }


def weight_compare(rows_tpl, rows_eq):
    """模板 vs 等权：各规则下年化与 MDD 的分布。"""
    out = {}
    for mode in ("bh", "band", "monthly"):
        out[mode] = {
            "template_cagr": dist_stats([r[mode]["cagr"] for r in rows_tpl]),
            "equal_cagr": dist_stats([r[mode]["cagr"] for r in rows_eq]),
            "template_mdd": dist_stats([r[mode]["mdd"] for r in rows_tpl]),
            "equal_mdd": dist_stats([r[mode]["mdd"] for r in rows_eq]),
            "template_reb_bh_cagr": dist_stats([r["delta"]["band"]["cagr"] for r in rows_tpl])
            if mode == "band"
            else None,
        }
    # also compare delta distributions
    out["delta_reb_bh"] = {
        "template": collect_deltas(rows_tpl, "band"),
        "equal": collect_deltas(rows_eq, "band"),
    }
    out["delta_mon_bh"] = {
        "template": collect_deltas(rows_tpl, "monthly"),
        "equal": collect_deltas(rows_eq, "monthly"),
    }
    return out


def corr_tables(start, end, growth_list, stable_list):
    # average corr of each stable vs each growth; also mean vs all growth
    # use intersection of all symbols involved
    syms = growth_list + stable_list
    dates = common_dates(syms, start, end)
    rets = {s: daily_returns(s, dates) for s in syms}
    table = {}
    for st in stable_list:
        row = {}
        for g in growth_list:
            row[g] = round(corr(rets[st], rets[g]), 4)
        row["mean_vs_growth"] = round(sum(row[g] for g in growth_list) / len(growth_list), 4)
        table[st] = row
    return {"start": dates[0], "end": dates[-1], "n_days": len(dates) - 1, "corr": table}


def run_rolling(combos, tw):
    # universe dates from a full W1 set that includes late IPOs — use RKLB+SOFI+AVGO+META+CB
    uni = common_dates(["AVGO", "META", "RKLB", "SOFI", "CB"], "2021-09-01", W1_END)
    starts = quarterly_starts(uni, "2021-09", "2024-12")
    # Also need dates available for all combos — for each combo dates may differ slightly
    # but W1 pool all have data from 2021-08-25, so quarterly starts after that are fine.
    results = []
    for start in starts:
        pos = 0
        n = 0
        cagr_diffs = []
        for g, hv, st in combos:
            stocks = combo_stocks(g, hv, st)
            try:
                bh = run_backtest(stocks, tw, "bh", start, W1_END)
                reb = run_backtest(stocks, tw, "band", start, W1_END)
            except ValueError:
                continue
            d = reb["cagr"] - bh["cagr"]
            cagr_diffs.append(d)
            n += 1
            if d > 0:
                pos += 1
        results.append(
            {
                "start": start,
                "n": n,
                "pct_reb_bh_cagr_pos": pos / n if n else None,
                "median_cagr_diff": dist_stats(cagr_diffs)["median"] if cagr_diffs else None,
                "q25": dist_stats(cagr_diffs)["q25"] if cagr_diffs else None,
                "q75": dist_stats(cagr_diffs)["q75"] if cagr_diffs else None,
            }
        )
    return results


def main():
    t0 = time.time()
    anchors = verify_anchors()
    assert anchors["pass"], anchors

    g_pairs = pairs(GROWTH)
    hv_pairs = pairs(HIGHVOL)
    w1_combos = [(g, hv, st) for g in g_pairs for hv in hv_pairs for st in STABLE]
    assert len(w1_combos) == 1575, len(w1_combos)

    w2_g = pairs(W2_GROWTH)
    w2_combos = [(g, tuple(W2_HIGHVOL), st) for g in w2_g for st in STABLE]
    assert len(w2_combos) == 70, len(w2_combos)

    print(f"W1 combos={len(w1_combos)} W2={len(w2_combos)}", flush=True)

    tw = template_weights()
    ew = equal_weights()

    print("W1 template...", flush=True)
    w1_tpl = build_rows(w1_combos, W1_START, W1_END, "template", tw)
    print(f"  done {len(w1_tpl)}  elapsed={time.time()-t0:.1f}s", flush=True)

    print("W1 equal...", flush=True)
    w1_eq = build_rows(w1_combos, W1_START, W1_END, "equal", ew)
    print(f"  done {len(w1_eq)}  elapsed={time.time()-t0:.1f}s", flush=True)

    print("W2 template...", flush=True)
    w2_tpl = build_rows(w2_combos, W2_START, W2_END, "template", tw)
    print(f"  done {len(w2_tpl)}  elapsed={time.time()-t0:.1f}s", flush=True)

    print("W2 equal...", flush=True)
    w2_eq = build_rows(w2_combos, W2_START, W2_END, "equal", ew)
    print(f"  done {len(w2_eq)}  elapsed={time.time()-t0:.1f}s", flush=True)

    print("rolling starts...", flush=True)
    rolling = run_rolling(w1_combos, tw)
    print(f"  starts={len(rolling)}  elapsed={time.time()-t0:.1f}s", flush=True)

    print("corr tables...", flush=True)
    corr_w1 = corr_tables(W1_START, W1_END, GROWTH, STABLE)
    corr_w2 = corr_tables(W2_START, W2_END, W2_GROWTH + ["NVDA"], STABLE)

    # link corr mean_vs_growth with median REB-BH cagr by stable
    by_st = summary_block(w1_tpl, "W1 template")["by_stable"]
    corr_link_w1 = []
    for st in STABLE:
        corr_link_w1.append(
            {
                "stable": st,
                "mean_corr_vs_growth": corr_w1["corr"][st]["mean_vs_growth"],
                "reb_bh_cagr_med": by_st[st]["cagr_med"],
                "reb_bh_pct_pos": by_st[st]["cagr_pct_pos"],
            }
        )
    by_st2 = summary_block(w2_tpl, "W2 template")["by_stable"]
    corr_link_w2 = []
    for st in STABLE:
        corr_link_w2.append(
            {
                "stable": st,
                "mean_corr_vs_growth": corr_w2["corr"][st]["mean_vs_growth"],
                "reb_bh_cagr_med": by_st2[st]["cagr_med"],
                "reb_bh_pct_pos": by_st2[st]["cagr_pct_pos"],
            }
        )

    summary = {
        "anchors": {k: anchors[k] for k in ("pass", "A1", "A2", "A3", "A4", "A5")},
        "anchor_detail": anchors["detail"],
        "w1_template": summary_block(w1_tpl, "W1 template"),
        "w1_equal": summary_block(w1_eq, "W1 equal"),
        "w2_template": summary_block(w2_tpl, "W2 template"),
        "w2_equal": summary_block(w2_eq, "W2 equal"),
        "w1_weight_compare": weight_compare(w1_tpl, w1_eq),
        "w2_weight_compare": weight_compare(w2_tpl, w2_eq),
        "corr_w1": corr_w1,
        "corr_w2": corr_w2,
        "corr_link_w1": corr_link_w1,
        "corr_link_w2": corr_link_w2,
        "rolling": rolling,
        "elapsed_sec": round(time.time() - t0, 2),
        "counts": {"w1": len(w1_combos), "w2": len(w2_combos), "rolling_starts": len(rolling)},
    }

    # persist compact summaries + full row dumps (deltas only to keep size sane)
    def slim(rows):
        return [
            {
                "id": r["id"],
                "growth": r["growth"],
                "highvol": r["highvol"],
                "stable": r["stable"],
                "has_rklb": r["has_rklb"],
                "bh_cagr": r["bh"]["cagr"],
                "bh_mdd": r["bh"]["mdd"],
                "bh_cer": r["bh"]["cer"],
                "band_cagr": r["band"]["cagr"],
                "band_mdd": r["band"]["mdd"],
                "band_cer": r["band"]["cer"],
                "band_trades": r["band"]["trades"],
                "mon_cagr": r["monthly"]["cagr"],
                "mon_mdd": r["monthly"]["mdd"],
                "mon_cer": r["monthly"]["cer"],
                "mon_trades": r["monthly"]["trades"],
                "d_band_cagr": r["delta"]["band"]["cagr"],
                "d_band_mdd": r["delta"]["band"]["mdd"],
                "d_band_cer": r["delta"]["band"]["cer"],
                "d_mon_cagr": r["delta"]["monthly"]["cagr"],
                "d_mon_mdd": r["delta"]["monthly"]["mdd"],
                "d_mon_cer": r["delta"]["monthly"]["cer"],
            }
            for r in rows
        ]

    (OUT / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    (OUT / "w1_template_rows.json").write_text(json.dumps(slim(w1_tpl)))
    (OUT / "w1_equal_rows.json").write_text(json.dumps(slim(w1_eq)))
    (OUT / "w2_template_rows.json").write_text(json.dumps(slim(w2_tpl)))
    (OUT / "w2_equal_rows.json").write_text(json.dumps(slim(w2_eq)))

    print(json.dumps({"elapsed": summary["elapsed_sec"], "pass": True, "rolling_n": len(rolling)}, indent=2))
    # quick peek
    s = summary["w1_template"]["reb_minus_bh"]
    print("W1 tpl REB-BH cagr pct_pos", s["cagr"]["pct_positive"], "med", s["cagr"]["median"])
    print("W1 tpl REB-BH mdd pct_pos", s["mdd"]["pct_positive"], "med", s["mdd"]["median"])


if __name__ == "__main__":
    main()
