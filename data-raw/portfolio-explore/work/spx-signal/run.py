import argparse
import csv
import datetime as dt
import hashlib
import itertools
import json
import math
import statistics
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / "data-raw/portfolio-explore"
LONG = BASE / "longrun"
WORK = BASE / "work/spx-signal"
COST = 0.001
GAP = 0.05
STEP = 0.25
RECOVERY = 0.05
ENTRIES = (0.10, 0.15, 0.20, 0.25, 0.30)
CAPS = (None, 0.50)


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")


def load_json_history(path):
    return dict(json.loads(path.read_text())["history"])


def prepare_gspc():
    raw_path = LONG / "GSPC-yahoo-chart.json"
    raw = json.loads(raw_path.read_text())
    result = raw["chart"]["result"][0]
    timestamps = result["timestamp"]
    closes = result["indicators"]["quote"][0]["close"]
    history = []
    missing = 0
    for stamp, close in zip(timestamps, closes):
        if close is None:
            missing += 1
            continue
        day = (dt.datetime.fromtimestamp(stamp, dt.timezone.utc) - dt.timedelta(hours=5)).date().isoformat()
        history.append([day, close])
    assert len({d for d, _ in history}) == len(history)
    out = LONG / "GSPC.json"
    write_json(out, {"history": history})
    return {
        "raw_sha256": sha256(raw_path),
        "parsed_sha256": sha256(out),
        "rows": len(history),
        "missing_closes": missing,
        "first": history[0],
        "last": history[-1],
        "historical_checks": {
            d: {"actual": round(dict(history)[d], 2), "expected": expected}
            for d, expected in {"1987-10-19": 224.84, "2009-03-09": 676.53, "2020-03-23": 2237.40}.items()
        },
    }


def fetch_fred():
    url = "https://fred.stlouisfed.org/data/SP500"
    with urllib.request.urlopen(url, timeout=30) as response:
        text = response.read().decode("utf-8")
    history = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        try:
            day = dt.date.fromisoformat(parts[0]).isoformat()
            value = float(parts[1])
        except (ValueError, TypeError):
            continue
        history.append([day, value])
    if not history:
        raise RuntimeError("FRED response contained no observations")
    write_json(LONG / "GSPC-FRED.json", {"history": history})
    return {"url": url, "downloaded": "2026-11-22", "rows": len(history)}


def crosscheck_gspc(fetch=False):
    fred_path = LONG / "GSPC-FRED.json"
    if fetch and not fred_path.exists():
        try:
            source = fetch_fred()
        except Exception as exc:
            return {"status": f"未核对：FRED 下载失败（{type(exc).__name__}: {exc}）"}
    elif fred_path.exists():
        source = {"url": "https://fred.stlouisfed.org/data/SP500", "downloaded": "2026-11-22"}
    else:
        return {"status": "未核对：2026-11-22 的 FRED 请求未返回可解析的日度观测；未重复下载"}
    yahoo = load_json_history(LONG / "GSPC.json")
    fred = load_json_history(fred_path)
    common = sorted(yahoo.keys() & fred.keys())
    differences = []
    mismatches = []
    for d in common:
        relative = abs(yahoo[d] / fred[d] - 1)
        differences.append(relative)
        if round(yahoo[d], 2) != round(fred[d], 2):
            mismatches.append({"date": d, "yahoo": yahoo[d], "fred": fred[d], "relative": relative})
    return {
        "status": "已核对",
        **source,
        "fred_sha256": sha256(fred_path),
        "fred_first": min(fred),
        "fred_last": max(fred),
        "overlap_days": len(common),
        "max_relative_difference": max(differences) if differences else None,
        "mismatch_days_rounded_cents": len(mismatches),
        "mismatches": mismatches,
    }


def load_french():
    lines = (LONG / "49_Industry_Portfolios_Daily.csv").read_text(encoding="latin-1").splitlines()
    result = {}
    headings = {"VW": "Average Value Weighted Returns -- Daily", "EW": "Average Equal Weighted Returns -- Daily"}
    for suffix, heading in headings.items():
        start = next(i for i, line in enumerate(lines) if heading in line)
        names = [x.strip() for x in lines[start + 1].split(",")[1:]]
        i = start + 2
        while i < len(lines) and lines[i].strip() and lines[i].strip()[0].isdigit():
            fields = [x.strip() for x in lines[i].split(",")]
            raw_day = fields[0]
            day = f"{raw_day[:4]}-{raw_day[4:6]}-{raw_day[6:8]}"
            for name, field in zip(names, fields[1:]):
                value = float(field)
                result.setdefault(f"{name}_{suffix}", {})[day] = None if value <= -99 else value / 100
            i += 1
    return result


def load_prices():
    raw = json.loads((BASE / "prices-adjusted.json").read_text())["series"]
    return {symbol: dict(zip(values["dates"], values["close"])) for symbol, values in raw.items()}


def french_dates(assets, start, end, signal_maps):
    available = set(signal_maps[0]) & set(signal_maps[1])
    for asset in assets:
        available &= {d for d, value in FRENCH[asset].items() if value is not None}
    return sorted(d for d in available if start <= d <= end)


def stock_dates(assets, start, end, signal_maps):
    available = set(signal_maps[0]) & set(signal_maps[1])
    for asset in assets:
        available &= set(PRICES[asset])
    return sorted(d for d in available if start <= d <= end)


def asset_returns(asset, day, previous_day, kind):
    if kind == "L":
        return FRENCH[asset][day]
    return PRICES[asset][day] / PRICES[asset][previous_day] - 1


def simulate(dates, assets, targets, stable, kind, mode="reb", signal=None, entry=None, cap=None):
    count = len(assets)
    values = list(targets)
    equities = [1.0]
    trades = 0
    pending = None
    in_drawdown = False
    peak = signal[dates[0]] if signal else None
    peak_date = dates[0]
    levels = set()
    base = None
    sold = 0.0
    rounds = []
    active_round = None
    for i in range(1, len(dates)):
        day = dates[i]
        for j, asset in enumerate(assets):
            values[j] *= 1 + asset_returns(asset, day, dates[i - 1], kind)
        equity = sum(values)
        weights = [v / equity for v in values]
        if pending is not None:
            action = pending["action"]
            if action in ("rebalance", "recovery"):
                turnover = 0.5 * sum(abs(weights[j] - targets[j]) for j in range(count))
                equity *= 1 - turnover * COST
                values = [equity * t for t in targets]
                if action == "recovery":
                    peak = signal[day]
                    peak_date = day
                    active_round["recovery_execution"] = day
                    active_round["end_index"] = i
                    rounds.append(active_round)
                    active_round = None
            else:
                requested = pending["amount"]
                amount = min(requested, values[stable])
                candidate = min((j for j in range(count) if j != stable), key=lambda j: weights[j] / targets[j])
                turnover = amount / equity
                values[stable] -= amount
                values[candidate] += amount
                equity *= 1 - turnover * COST
                sold += amount
                values = [v * equity / sum(values) for v in values]
                active_round["steps"] += 1
            trades += 1
            pending = None
            weights = [v / equity for v in values]
        if signal:
            quote = signal[day]
            if quote > peak:
                peak = quote
                peak_date = day
            drawdown = quote / peak - 1
            if active_round is not None:
                active_round["deepest"] = min(active_round["deepest"], drawdown)
            has_next = i + 1 < len(dates)
            if not in_drawdown and drawdown <= -entry:
                in_drawdown = True
                levels = {entry}
                base = values[stable]
                sold = 0.0
                active_round = {
                    "entry_date": day,
                    "entry_index": i,
                    "steps": 0,
                    "deepest": drawdown,
                    "recovery_execution": None,
                    "end_index": len(dates) - 1,
                }
                if has_next:
                    pending = {"action": "step", "amount": STEP * base}
            elif in_drawdown:
                if drawdown >= -RECOVERY:
                    in_drawdown = False
                    if has_next:
                        pending = {"action": "recovery"}
                elif has_next:
                    level = entry
                    while drawdown <= -(level + GAP) + 1e-12:
                        level += GAP
                    cap_remaining = math.inf if cap is None else cap * base - sold
                    if level not in levels and cap_remaining > 1e-10:
                        levels.add(level)
                        pending = {"action": "step", "amount": min(STEP * base, cap_remaining)}
            elif has_next and mode == "reb" and any(weights[j] < targets[j] * 0.6 or weights[j] > targets[j] * 1.4 for j in range(count)):
                pending = {"action": "rebalance"}
        elif mode == "reb" and i + 1 < len(dates):
            if any(weights[j] < targets[j] * 0.6 or weights[j] > targets[j] * 1.4 for j in range(count)):
                pending = {"action": "rebalance"}
        equities.append(equity)
    if active_round is not None:
        rounds.append(active_round)
    years = (dt.date.fromisoformat(dates[-1]) - dt.date.fromisoformat(dates[0])).days / 365.25
    peak_equity = equities[0]
    max_drawdown = 0.0
    for equity in equities:
        peak_equity = max(peak_equity, equity)
        max_drawdown = min(max_drawdown, equity / peak_equity - 1)
    rolling = None
    if len(equities) > 756:
        rolling = min(
            (equities[i] / equities[i - 756]) ** (365.25 / (dt.date.fromisoformat(dates[i]) - dt.date.fromisoformat(dates[i - 756])).days) - 1
            for i in range(756, len(equities))
        )
    return {
        "final": equities[-1],
        "cagr": equities[-1] ** (1 / years) - 1,
        "mdd": max_drawdown,
        "trades": trades,
        "worst3": rolling,
        "equities": equities,
        "rounds": rounds,
        "in_drawdown": in_drawdown,
        "drawdown": signal[dates[-1]] / peak - 1 if signal else None,
        "peak_date": peak_date,
    }


def compact(result):
    return {k: result[k] for k in ("final", "cagr", "mdd", "trades", "worst3")}


def run_anchor(sample, assets, targets, stable, start, end, mode="reb", signal_name=None, entry=None, cap=None):
    if sample == "L":
        dates = L_DATES
        kind = "L"
    else:
        dates = stock_dates(assets, start, end, [QQQ, GSPC])
        kind = sample
    signal = None if signal_name is None else (GSPC if signal_name == "SPX" else (NDX if sample == "L" else QQQ))
    result = simulate(dates, assets, targets, stable, kind, mode, signal, entry, cap)
    return result


def anchor_value(result):
    return {"final": round(result["final"], 4), "trades": result["trades"]}


def anchors():
    assets = ["Softw_VW", "Chips_VW", "Insur_VW", "Softw_EW", "Chips_EW"]
    targets = [0.25, 0.25, 0.25, 0.125, 0.125]
    w1_assets = ["AVGO", "META", "CB", "SOFI", "RKLB"]
    w2_assets = ["AVGO", "META", "CB", "TSLA", "NVDA"]
    definitions = [
        ("L1", "L", assets, targets, 2, "1986-01-02", "2026-09-30", "bh", None, None, None, 2688.1925, 0),
        ("L2", "L", assets, targets, 2, "1986-01-02", "2026-09-30", "reb", None, None, None, 888.4062, 19),
        ("L3", "L", assets, targets, 2, "1986-01-02", "2026-09-30", "reb", "NDX", 0.20, None, 1346.1374, 46),
        ("A2", "W1", w1_assets, targets, 2, "2021-08-25", "2026-11-20", "reb", None, None, None, 3.6138, 17),
        ("A4", "W2", w2_assets, targets, 2, "2016-01-04", "2026-11-20", "reb", None, None, None, 18.1600, 16),
        ("S1", "L", assets, targets, 2, "1986-01-02", "2026-09-30", "reb", "SPX", 0.20, None, 1158.0724, 39),
        ("S2", "L", assets, targets, 2, "1986-01-02", "2026-09-30", "reb", "SPX", 0.20, 0.50, 1123.4897, 27),
        ("S3", "L", assets, targets, 2, "1986-01-02", "2026-09-30", "reb", "SPX", 0.10, None, 1227.6892, 78),
        ("S4", "L", assets, targets, 2, "1986-01-02", "2026-09-30", "reb", "SPX", 0.15, 0.50, 1380.8421, 34),
        ("S5", "W1", w1_assets, targets, 2, "2021-08-25", "2026-11-20", "reb", "SPX", 0.15, None, 3.9412, 22),
        ("S6", "W2", w2_assets, targets, 2, "2016-01-04", "2026-11-20", "reb", "SPX", 0.20, None, 20.9115, 21),
    ]
    output = []
    for name, sample, aa, tt, stable, start, end, mode, sig, entry, cap, expected_final, expected_trades in definitions:
        result = run_anchor(sample, aa, tt, stable, start, end, mode, sig, entry, cap)
        actual = anchor_value(result)
        passed = actual == {"final": expected_final, "trades": expected_trades}
        row = {"anchor": name, **actual, "expected_final": expected_final, "expected_trades": expected_trades, "passed": passed}
        if name == "S1":
            row["entry_dates"] = [r["entry_date"] for r in result["rounds"]]
            row["entry_dates_passed"] = row["entry_dates"] == ["1987-10-19", "2001-03-12", "2008-07-09", "2020-03-12", "2022-06-13"]
            passed = passed and row["entry_dates_passed"]
            row["passed"] = passed
        output.append(row)
        print(name, actual, "PASS" if passed else "FAIL", row.get("entry_dates", ""))
    write_json(WORK / "anchors.json", output)
    return output


def percentile(values, probability):
    ordered = sorted(values)
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def distribution(values):
    return {
        "median": statistics.median(values),
        "q1": percentile(values, 0.25),
        "q3": percentile(values, 0.75),
        "positive_share": sum(x > 1e-12 for x in values) / len(values),
    }


def combinations_for(sample):
    targets = [0.25, 0.25, 0.25, 0.125, 0.125]
    combinations = []
    if sample == "L":
        growth = list(itertools.combinations(["Softw_VW", "Hardw_VW", "Chips_VW"], 2))
        volatile = list(itertools.combinations(["Softw_EW", "Chips_EW", "Hardw_EW"], 2))
        stables = ["Insur_VW", "Food_VW", "Hshld_VW", "Soda_VW", "Util_VW", "Drugs_VW"]
        start, end = "1986-01-02", "2026-09-30"
    else:
        growth = list(itertools.combinations(["AVGO", "META", "MSFT", "AMZN", "GOOGL"], 2))
        volatile = [("TSLA", "NVDA")]
        stables = ["CB", "KO", "PG", "JNJ", "WMT", "COST", "GLD"]
        start, end = "2016-01-04", "2026-11-20"
    for gg, vv, stable_asset in itertools.product(growth, volatile, stables):
        assets = [*gg, stable_asset, *vv]
        dates = L_DATES if sample == "L" else stock_dates(assets, start, end, [QQQ, GSPC])
        combinations.append({
            "name": "+".join(assets),
            "assets": assets,
            "targets": targets,
            "stable": 2,
            "dates": dates,
        })
    return combinations


def aggregate_rounds(results, baselines):
    if not results[0]["rounds"]:
        return []
    aggregated = []
    for round_index, canonical in enumerate(results[0]["rounds"]):
        steps = []
        differences = []
        worst_lags = []
        for result, baseline in zip(results, baselines):
            current = result["rounds"][round_index]
            assert current["entry_date"] == canonical["entry_date"]
            start = current["entry_index"]
            end = current["end_index"]
            steps.append(current["steps"])
            strategy_base = result["equities"][start]
            reb_base = baseline["equities"][start]
            differences.append(result["equities"][end] / strategy_base - baseline["equities"][end] / reb_base)
            worst_lags.append(min(
                result["equities"][i] / strategy_base - baseline["equities"][i] / reb_base
                for i in range(start, end + 1)
            ))
        aggregated.append({
            "entry_date": canonical["entry_date"],
            "recovery_execution": canonical["recovery_execution"],
            "deepest": canonical["deepest"],
            "steps_median": statistics.median(steps),
            "return_difference_median": statistics.median(differences),
            "worst_lag_median": statistics.median(worst_lags),
            "return_difference_min": min(differences),
            "return_difference_max": max(differences),
        })
    return aggregated


def config_signal(sample, signal_name):
    if signal_name == "SPX":
        return GSPC
    return NDX if sample == "L" else QQQ


def run_sample(sample):
    started = time.perf_counter()
    combinations = combinations_for(sample)
    baselines = []
    bh_metrics = []
    reb_metrics = []
    for combo in combinations:
        arguments = (combo["dates"], combo["assets"], combo["targets"], combo["stable"], sample)
        bh = simulate(*arguments, mode="bh")
        reb = simulate(*arguments, mode="reb")
        baselines.append(reb)
        bh_metrics.append(compact(bh))
        reb_metrics.append(compact(reb))
    output = {
        "sample": sample,
        "combination_count": len(combinations),
        "start": combinations[0]["dates"][0],
        "end": combinations[0]["dates"][-1],
        "days": len(combinations[0]["dates"]),
        "reference": {
            "BH": {key: distribution([row[key] for row in bh_metrics]) for key in ("cagr", "mdd", "worst3") if bh_metrics[0][key] is not None},
            "REB": {key: distribution([row[key] for row in reb_metrics]) for key in ("cagr", "mdd", "worst3") if reb_metrics[0][key] is not None},
        },
        "configurations": [],
    }
    for signal_name, entry, cap in itertools.product(("SPX", "NDX"), ENTRIES, CAPS):
        results = []
        for combo in combinations:
            results.append(simulate(
                combo["dates"], combo["assets"], combo["targets"], combo["stable"], sample,
                mode="reb", signal=config_signal(sample, signal_name), entry=entry, cap=cap,
            ))
        cagr_differences = [r["cagr"] - b["cagr"] for r, b in zip(results, baselines)]
        mdd_differences = [r["mdd"] - b["mdd"] for r, b in zip(results, baselines)]
        row = {
            "signal": signal_name,
            "entry": entry,
            "cap": cap,
            "cagr_difference": distribution(cagr_differences),
            "mdd_difference": distribution(mdd_differences),
            "rounds": aggregate_rounds(results, baselines),
            "status": {key: results[0][key] for key in ("in_drawdown", "drawdown", "peak_date")},
        }
        if sample == "L":
            row["worst3_difference"] = distribution([r["worst3"] - b["worst3"] for r, b in zip(results, baselines)])
        output["configurations"].append(row)
        print(sample, signal_name, entry, cap, "cagr_diff", round(row["cagr_difference"]["median"], 6), "mdd_diff", round(row["mdd_difference"]["median"], 6))
    output["elapsed_seconds"] = time.perf_counter() - started
    return output


def run_w1():
    started = time.perf_counter()
    assets = ["AVGO", "META", "CB", "SOFI", "RKLB"]
    targets = [0.25, 0.25, 0.25, 0.125, 0.125]
    dates = stock_dates(assets, "2021-08-25", "2026-11-20", [QQQ, GSPC])
    arguments = (dates, assets, targets, 2, "W1")
    bh = simulate(*arguments, mode="bh")
    reb = simulate(*arguments, mode="reb")
    output = {
        "sample": "W1",
        "combination_count": 1,
        "start": dates[0],
        "end": dates[-1],
        "days": len(dates),
        "reference": {"BH": compact(bh), "REB": compact(reb)},
        "configurations": [],
        "elapsed_seconds": None,
    }
    for signal_name, entry, cap in itertools.product(("SPX", "NDX"), ENTRIES, CAPS):
        result = simulate(*arguments, mode="reb", signal=config_signal("W1", signal_name), entry=entry, cap=cap)
        rounds = aggregate_rounds([result], [reb])
        output["configurations"].append({
            "signal": signal_name,
            "entry": entry,
            "cap": cap,
            **compact(result),
            "rounds": rounds,
            "status": {key: result[key] for key in ("in_drawdown", "drawdown", "peak_date")},
        })
    output["elapsed_seconds"] = time.perf_counter() - started
    return output


def full_grid(anchor_rows):
    started = time.perf_counter()
    samples = {sample: run_sample(sample) for sample in ("L", "W2")}
    samples["W1"] = run_w1()
    shallow = []
    for sample, data in samples.items():
        for cap in CAPS:
            row = next(c for c in data["configurations"] if c["signal"] == "SPX" and c["entry"] == 0.10 and c["cap"] == cap)
            for group, predicate in (("未达−15%", lambda r: r["deepest"] > -0.15), ("达到−15%", lambda r: r["deepest"] <= -0.15)):
                selected = [r for r in row["rounds"] if predicate(r)]
                shallow.append({
                    "sample": sample,
                    "cap": cap,
                    "group": group,
                    "round_count": len(selected),
                    "return_difference_median_range": None if not selected else [min(r["return_difference_median"] for r in selected), max(r["return_difference_median"] for r in selected)],
                    "all_combination_round_difference_range": None if not selected else [min(r["return_difference_min"] for r in selected), max(r["return_difference_max"] for r in selected)],
                })
    summary = {
        "generated_by": "data-raw/portfolio-explore/work/spx-signal/run.py",
        "anchors": anchor_rows,
        "data_checks": json.loads((WORK / "data-checks.json").read_text()),
        "samples": samples,
        "spx_entry_10_shallow_deep": shallow,
        "elapsed_seconds": time.perf_counter() - started,
    }
    write_json(WORK / "summary.json", summary)
    render_tables(summary)
    render_report()
    return summary


def percent(value, digits=2, signed=False):
    if value is None:
        return "—"
    return f"{value * 100:+.{digits}f}%" if signed else f"{value * 100:.{digits}f}%"


def points(value, digits=2):
    if value is None:
        return "—"
    return f"{value * 100:+.{digits}f} pp"


def dist_text(row):
    return f"{points(row['median'])} [{points(row['q1'])}, {points(row['q3'])}]"


def cap_text(cap):
    return "无" if cap is None else "50%"


def signal_text(sample, signal):
    if signal == "SPX":
        return "标普500"
    return "纳指100" if sample == "L" else "QQQ"


def recovery_text(value):
    return value if value else "未恢复"


def range_text(values):
    return "—" if values is None else f"{points(values[0])} 至 {points(values[1])}"


def render_tables(summary):
    lines = []
    lines += ["# 程序生成的结果表", "", "## 锚点", "", "| 锚点 | 实际期末倍数 | 实际交易次数 | 指定期末倍数 | 指定交易次数 | 结果 |", "|---|---:|---:|---:|---:|---|"]
    for row in summary["anchors"]:
        lines.append(f"| {row['anchor']} | {row['final']:.4f} | {row['trades']} | {row['expected_final']:.4f} | {row['expected_trades']} | {'通过' if row['passed'] else '未通过'} |")
    for sample in ("L", "W2"):
        data = summary["samples"][sample]
        lines += ["", f"## {sample} 参照与完整网格", "", f"样本 {data['start']} 至 {data['end']}，{data['days']} 个交易日，{data['combination_count']} 个组合。", "", "| 方案 | 年化中位数 | 最大回撤中位数 | 最差三年年化中位数 |", "|---|---:|---:|---:|"]
        for method in ("BH", "REB"):
            ref = data["reference"][method]
            worst = percent(ref["worst3"]["median"]) if "worst3" in ref else "—"
            lines.append(f"| {method} | {percent(ref['cagr']['median'])} | {percent(ref['mdd']['median'])} | {worst} |")
        lines += ["", "| 信号 | E | 上限 | 年化差中位数 [Q1,Q3] | 年化为正占比 | 回撤差中位数 [Q1,Q3] | 回撤更浅占比 | 最差三年差中位数 [Q1,Q3] |", "|---|---:|---:|---:|---:|---:|---:|---:|"]
        for row in data["configurations"]:
            worst = dist_text(row["worst3_difference"]) if "worst3_difference" in row else "—"
            lines.append(f"| {signal_text(sample, row['signal'])} | {percent(row['entry'], 0)} | {cap_text(row['cap'])} | {dist_text(row['cagr_difference'])} | {percent(row['cagr_difference']['positive_share'], 1)} | {dist_text(row['mdd_difference'])} | {percent(row['mdd_difference']['positive_share'], 1)} | {worst} |")
    for sample in ("L", "W2", "W1"):
        data = summary["samples"][sample]
        for entry in ENTRIES:
            uncapped = next(c for c in data["configurations"] if c["signal"] == "SPX" and c["entry"] == entry and c["cap"] is None)
            capped = next(c for c in data["configurations"] if c["signal"] == "SPX" and c["entry"] == entry and c["cap"] == 0.50)
            lines += ["", f"## {sample} 标普 E={percent(entry, 0)} 逐轮", "", "| 进入信号日 | 无上限步数 | 最深回撤 | 恢复成交日 | 无上限收益差 | 无上限最不利落后 | 上限50%步数 | 上限50%收益差 | 上限50%最不利落后 |", "|---|---:|---:|---|---:|---:|---:|---:|---:|"]
            for left, right in zip(uncapped["rounds"], capped["rounds"]):
                assert left["entry_date"] == right["entry_date"]
                lines.append(f"| {left['entry_date']} | {left['steps_median']:g} | {percent(left['deepest'])} | {recovery_text(left['recovery_execution'])} | {points(left['return_difference_median'])} | {points(left['worst_lag_median'])} | {right['steps_median']:g} | {points(right['return_difference_median'])} | {points(right['worst_lag_median'])} |")
    lines += ["", "## 标普 E=10% 浅回调与深跌", "", "收益差范围为各轮组合中位数的范围；括号内为全部组合与轮次原始差值的范围。", "", "| 样本 | 上限 | 分组 | 轮数 | 轮内收益差范围 |", "|---|---:|---|---:|---:|"]
    for row in summary["spx_entry_10_shallow_deep"]:
        extra = range_text(row["all_combination_round_difference_range"])
        lines.append(f"| {row['sample']} | {cap_text(row['cap'])} | {row['group']} | {row['round_count']} | {range_text(row['return_difference_median_range'])}（{extra}） |")
    w1 = summary["samples"]["W1"]
    lines += ["", "## W1 用户组合完整指标", "", "单组合的年化差和回撤差就是中位数及两个四分位；差值为正时“为正/更浅占比”为100%，否则为0%。", "", "| 信号/方案 | E | 上限 | 期末倍数 | 年化 | 年化差 | 最大回撤 | 回撤差 | 交易次数 |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for method in ("BH", "REB"):
        row = w1["reference"][method]
        lines.append(f"| {method} | — | — | {row['final']:.4f} | {percent(row['cagr'])} | — | {percent(row['mdd'])} | — | {row['trades']} |")
    for row in w1["configurations"]:
        cagr_difference = row["cagr"] - w1["reference"]["REB"]["cagr"]
        mdd_difference = row["mdd"] - w1["reference"]["REB"]["mdd"]
        lines.append(f"| {signal_text('W1', row['signal'])} | {percent(row['entry'], 0)} | {cap_text(row['cap'])} | {row['final']:.4f} | {percent(row['cagr'])} | {points(cagr_difference)} | {percent(row['mdd'])} | {points(mdd_difference)} | {row['trades']} |")
    lines += ["", "## W1 各配置轮次日期", "", "| 信号 | E | 上限 | 进入信号日 → 恢复成交日 |", "|---|---:|---:|---|"]
    for row in w1["configurations"]:
        dates = "；".join(f"{r['entry_date']} → {recovery_text(r['recovery_execution'])}" for r in row["rounds"]) or "无进入"
        lines.append(f"| {signal_text('W1', row['signal'])} | {percent(row['entry'], 0)} | {cap_text(row['cap'])} | {dates} |")
    for sample in ("L", "W2", "W1"):
        data = summary["samples"][sample]
        lines += ["", f"## {sample} 截至 {data['end']} 状态", "", "| 信号 | E | 上限 | 本轮高点日期 | 当前回撤 | 大跌状态 |", "|---|---:|---:|---|---:|---|"]
        for row in data["configurations"]:
            status = row["status"]
            lines.append(f"| {signal_text(sample, row['signal'])} | {percent(row['entry'], 0)} | {cap_text(row['cap'])} | {status['peak_date']} | {percent(status['drawdown'])} | {'是' if status['in_drawdown'] else '否'} |")
    (WORK / "tables.md").write_text("\n".join(lines) + "\n")


def render_report():
    sections = {}
    current = None
    for line in (WORK / "tables.md").read_text().splitlines():
        if line.startswith("## "):
            current = line[3:]
            sections[current] = [line]
        elif current is not None:
            sections[current].append(line)
    report = (WORK / "report-template.md").read_text()
    for name, section_lines in sections.items():
        body = "\n".join(section_lines[1:]).strip()
        report = report.replace("{{TABLE:" + name + "}}", body)
    if "{{TABLE:" in report:
        raise RuntimeError("Unresolved report table placeholder")
    output = ROOT / "docs/research/portfolio-rebalance-explore-2026-11-21/spx-signal.md"
    output.write_text(report)


PRICES = {}
FRENCH = {}
NDX = {}
GSPC = {}
QQQ = {}
L_DATES = []


def initialize(fetch=False):
    global PRICES, FRENCH, NDX, GSPC, QQQ, L_DATES
    WORK.mkdir(parents=True, exist_ok=True)
    PRICES = load_prices()
    FRENCH = load_french()
    NDX = load_json_history(LONG / "NASDAQ100.json")
    metadata = prepare_gspc()
    GSPC = load_json_history(LONG / "GSPC.json")
    QQQ = PRICES["QQQ"]
    anchor_assets = ["Softw_VW", "Chips_VW", "Insur_VW", "Softw_EW", "Chips_EW"]
    L_DATES = french_dates(anchor_assets, "1986-01-02", "2026-09-30", [NDX, GSPC])
    metadata["crosscheck"] = crosscheck_gspc(fetch)
    metadata["common_days_L"] = len(L_DATES)
    write_json(WORK / "data-checks.json", metadata)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch-fred", action="store_true")
    parser.add_argument("--anchors-only", action="store_true")
    args = parser.parse_args()
    started = time.perf_counter()
    initialize(args.fetch_fred)
    results = anchors()
    if not all(row["passed"] for row in results):
        raise SystemExit("Anchor mismatch; full grid not run")
    if not args.anchors_only:
        summary = full_grid(results)
        print(f"grid_elapsed_seconds={summary['elapsed_seconds']:.3f}")
    print(f"elapsed_seconds={time.perf_counter() - started:.3f}")


if __name__ == "__main__":
    main()
