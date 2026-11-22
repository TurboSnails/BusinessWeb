import argparse
import csv
import datetime as dt
import json
import math
import statistics
import time
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "data-raw/portfolio-explore/prices-adjusted.json"
OUT = ROOT / "data-raw/portfolio-explore/work/rule-variants"
END = "2026-11-20"
COST_RATE = 0.001
TARGETS = [0.25, 0.25, 0.25, 0.125, 0.125]
W1_SYMBOLS = ["AVGO", "META", "CB", "SOFI", "RKLB"]
W2_SYMBOLS = ["AVGO", "META", "CB", "TSLA", "NVDA"]
RULES = [
    ("BH", "买入持有", "bh", None),
    ("R20", "相对偏离20%", "relative", 0.20),
    ("R30", "相对偏离30%", "relative", 0.30),
    ("R40", "相对偏离40%", "relative", 0.40),
    ("R50", "相对偏离50%", "relative", 0.50),
    ("R60", "相对偏离60%", "relative", 0.60),
    ("A05", "绝对偏离5个百分点", "absolute", 0.05),
    ("A10", "绝对偏离10个百分点", "absolute", 0.10),
    ("M", "每月固定", "monthly", None),
    ("Q", "每季固定", "quarterly", None),
    ("Y", "每年固定", "yearly", None),
    ("O40", "相对40%只调越界者", "only40", 0.40),
    ("P40", "相对40%部分调回", "partial40", 0.40),
]
RULE_LABELS = {rule_id: label for rule_id, label, _, _ in RULES}


@dataclass(frozen=True)
class Window:
    name: str
    symbols: tuple
    start: str


@dataclass
class Market:
    dates: list
    prices: list

    @classmethod
    def load(cls, symbols, raw_series):
        common = None
        for symbol in symbols:
            dates = set(raw_series[symbol]["dates"])
            common = dates if common is None else common & dates
        dates = sorted(common)
        lookups = {
            symbol: dict(zip(raw_series[symbol]["dates"], raw_series[symbol]["close"]))
            for symbol in symbols
        }
        prices = [[float(lookups[s][d]) for s in symbols] for d in dates]
        return cls(dates, prices)

    def slice(self, start, end=END):
        indices = [i for i, d in enumerate(self.dates) if start <= d <= end]
        if len(indices) < 2:
            raise ValueError(f"Insufficient observations: {start} to {end}")
        return Market([self.dates[i] for i in indices], [self.prices[i] for i in indices])


def boundary_set(targets, threshold):
    return [(w * (1 - threshold), w * (1 + threshold)) for w in targets]


def breached(weights, targets, kind, threshold):
    if kind in ("relative", "only40", "partial40"):
        bands = boundary_set(targets, threshold)
        return [i for i, w in enumerate(weights) if w <= bands[i][0] or w >= bands[i][1]]
    if kind == "absolute":
        return [i for i, w in enumerate(weights) if abs(w - targets[i]) >= threshold]
    return []


def scheduled(dates, i, kind):
    if i + 1 >= len(dates):
        return False
    current = dt.date.fromisoformat(dates[i])
    following = dt.date.fromisoformat(dates[i + 1])
    if kind == "monthly":
        return (current.year, current.month) != (following.year, following.month)
    if kind == "quarterly":
        return (current.year, (current.month - 1) // 3) != (following.year, (following.month - 1) // 3)
    if kind == "yearly":
        return current.year != following.year
    return False


def destination(weights, targets, mode, threshold, flagged):
    if mode in ("relative", "absolute", "monthly", "quarterly", "yearly"):
        return list(targets)
    if mode == "only40":
        desired = list(weights)
        for i in flagged:
            desired[i] = targets[i]
    elif mode == "partial40":
        desired = list(weights)
        for i in flagged:
            boundary = targets[i] * (1 + threshold if weights[i] > targets[i] else 1 - threshold)
            desired[i] = (targets[i] + boundary) / 2
    else:
        raise ValueError(mode)
    untouched = [i for i in range(len(weights)) if i not in flagged]
    if not untouched:
        raise ValueError("All holdings breached; residual allocation is undefined")
    residual = 1 - sum(desired[i] for i in flagged)
    target_sum = sum(targets[i] for i in untouched)
    for i in untouched:
        desired[i] = residual * targets[i] / target_sum
    if any(w < -1e-12 for w in desired):
        raise ValueError(f"Negative destination weight: {desired}")
    return desired


def simulate(market, targets, mode, threshold):
    dates = market.dates
    prices = market.prices
    weights = list(targets)
    nav = 1.0
    navs = [nav]
    daily_returns = []
    pending = None
    trades = []
    for i in range(1, len(dates)):
        previous_nav = nav
        asset_returns = [prices[i][j] / prices[i - 1][j] - 1 for j in range(len(targets))]
        nav *= 1 + sum(weights[j] * asset_returns[j] for j in range(len(targets)))
        values = [weights[j] * (1 + asset_returns[j]) for j in range(len(targets))]
        total = sum(values)
        weights = [value / total for value in values]
        if pending is not None and pending["execution_index"] == i:
            after = destination(weights, targets, pending["mode"], threshold, pending["flagged"])
            turnover = sum(abs(after[j] - weights[j]) for j in range(len(weights))) / 2
            charge = turnover * COST_RATE
            nav *= 1 - charge
            trades.append({
                "signal_date": dates[pending["signal_index"]],
                "execution_date": dates[i],
                "turnover": turnover,
                "cost": charge,
                "weights_before": weights,
                "weights_after": after,
            })
            weights = after
            pending = None
        if pending is None and i + 1 < len(dates) and mode != "bh":
            if mode in ("monthly", "quarterly", "yearly"):
                should_trade = scheduled(dates, i, mode)
                flagged = list(range(len(targets))) if should_trade else []
            else:
                flagged = breached(weights, targets, mode, threshold)
                should_trade = bool(flagged)
            if should_trade:
                pending = {
                    "signal_index": i,
                    "execution_index": i + 1,
                    "flagged": flagged,
                    "mode": mode,
                }
        daily_returns.append(nav / previous_nav - 1)
        navs.append(nav)
    return finish_metrics(dates, navs, daily_returns, trades)


def finish_metrics(dates, navs, daily_returns, trades):
    elapsed_years = (dt.date.fromisoformat(dates[-1]) - dt.date.fromisoformat(dates[0])).days / 365.25
    mean_return = statistics.fmean(daily_returns)
    variance = statistics.fmean([(r - mean_return) ** 2 for r in daily_returns])
    peak_nav = navs[0]
    peak_date = dates[0]
    max_drawdown = 0.0
    drawdown_peak = dates[0]
    drawdown_trough = dates[0]
    for date, nav in zip(dates, navs):
        if nav > peak_nav:
            peak_nav = nav
            peak_date = date
        drawdown = nav / peak_nav - 1
        if drawdown < max_drawdown:
            max_drawdown = drawdown
            drawdown_peak = peak_date
            drawdown_trough = date
    yearly = {}
    previous = navs[0]
    current_year = dates[0][:4]
    for i, date in enumerate(dates[1:], start=1):
        year = date[:4]
        if year != current_year:
            yearly[current_year] = navs[i - 1] / previous - 1
            previous = navs[i - 1]
            current_year = year
    yearly[current_year] = navs[-1] / previous - 1
    worst_year = min(yearly, key=yearly.get)
    return {
        "start": dates[0],
        "end": dates[-1],
        "observations": len(dates),
        "final": navs[-1],
        "cagr": navs[-1] ** (1 / elapsed_years) - 1,
        "annual_volatility": math.sqrt(variance) * math.sqrt(252),
        "max_drawdown": max_drawdown,
        "drawdown_peak": drawdown_peak,
        "drawdown_trough": drawdown_trough,
        "cer": 252 * (mean_return - 1.5 * variance),
        "trades": len(trades),
        "cost": sum(t["cost"] for t in trades),
        "worst_year": worst_year,
        "worst_year_return": yearly[worst_year],
        "yearly_returns": yearly,
        "year_end_nav": year_end_navs(dates, navs),
        "navs": navs,
        "dates": dates,
        "trade_log": trades,
    }


def year_end_navs(dates, navs):
    result = {}
    for date, nav in zip(dates, navs):
        result[date[:4]] = nav
    return result


def public_metrics(result):
    keys = [
        "start", "end", "observations", "final", "cagr", "annual_volatility",
        "max_drawdown", "drawdown_peak", "drawdown_trough", "cer", "trades",
        "cost", "worst_year", "worst_year_return", "yearly_returns", "year_end_nav",
    ]
    return {key: result[key] for key in keys}


def make_markets():
    with DATA.open() as handle:
        series = json.load(handle)["series"]
    return {
        "W1": Market.load(W1_SYMBOLS, series),
        "W2": Market.load(W2_SYMBOLS, series),
        "QQQ": Market.load(["QQQ"], series),
    }


def run_rule(markets, window, rule_id):
    _, _, mode, threshold = next(rule for rule in RULES if rule[0] == rule_id)
    return simulate(market=markets[window.name].slice(window.start), targets=TARGETS, mode=mode, threshold=threshold)


def anchor_checks(markets):
    specifications = [
        ("A1", "W1", "BH", "2021-08-25", 3.1020, 0),
        ("A2", "W1", "R40", "2021-08-25", 3.6138, 17),
        ("A3", "W2", "BH", "2016-01-04", 29.7227, 0),
        ("A4", "W2", "R40", "2016-01-04", 18.1600, 16),
    ]
    output = []
    for name, market_name, rule_id, start, expected_final, expected_trades in specifications:
        window = Window(market_name, tuple(W1_SYMBOLS if market_name == "W1" else W2_SYMBOLS), start)
        result = run_rule(markets, window, rule_id)
        passed = round(result["final"], 4) == expected_final and result["trades"] == expected_trades
        output.append({
            "anchor": name,
            "rule": rule_id,
            "actual_final": result["final"],
            "rounded_final": round(result["final"], 4),
            "expected_final": expected_final,
            "actual_trades": result["trades"],
            "expected_trades": expected_trades,
            "passed": passed,
        })
    qqq = simulate(markets["QQQ"].slice("2021-08-25"), [1.0], "bh", None)
    passed = round(qqq["final"], 4) == 1.6234 and qqq["trades"] == 0
    output.append({
        "anchor": "A5", "rule": "QQQ BH", "actual_final": qqq["final"],
        "rounded_final": round(qqq["final"], 4), "expected_final": 1.6234,
        "actual_trades": qqq["trades"], "expected_trades": 0, "passed": passed,
    })
    return output


def month_starts(dates, first_year, first_month, last_year, last_month):
    starts = []
    for year in range(first_year, last_year + 1):
        for month in range(1, 13):
            if (year, month) < (first_year, first_month) or (year, month) > (last_year, last_month):
                continue
            match = next((d for d in dates if d[:7] == f"{year}-{month:02d}"), None)
            if match is None:
                raise ValueError(f"Missing month {year}-{month}")
            starts.append(match)
    return starts


def quarter_starts(dates, first_year, last_year):
    starts = []
    for year in range(first_year, last_year + 1):
        for month in (1, 4, 7, 10):
            match = next((d for d in dates if d[:7] == f"{year}-{month:02d}"), None)
            if match is None:
                raise ValueError(f"Missing quarter {year}-{month}")
            starts.append(match)
    return starts


def summarize_differences(rules, bh_results):
    rows = []
    for rule_id, results in rules.items():
        cagr_differences = []
        drawdown_differences = []
        for start, result in results.items():
            bh = bh_results[start]
            cagr_differences.append(result["cagr"] - bh["cagr"])
            drawdown_differences.append(result["max_drawdown"] - bh["max_drawdown"])
        rows.append({
            "rule": rule_id,
            "label": RULE_LABELS[rule_id],
            "starts": len(results),
            "cagr_median": statistics.median(cagr_differences),
            "cagr_worst": min(cagr_differences),
            "cagr_positive_share": sum(x > 0 for x in cagr_differences) / len(cagr_differences),
            "drawdown_median": statistics.median(drawdown_differences),
            "drawdown_worst": min(drawdown_differences),
            "drawdown_positive_share": sum(x > 0 for x in drawdown_differences) / len(drawdown_differences),
            "median_trades": statistics.median(result["trades"] for result in results.values()),
            "min_trades": min(result["trades"] for result in results.values()),
            "max_trades": max(result["trades"] for result in results.values()),
        })
    return rows


def run_all(markets):
    windows = {
        "W1": Window("W1", tuple(W1_SYMBOLS), "2021-08-25"),
        "W2": Window("W2", tuple(W2_SYMBOLS), "2016-01-04"),
    }
    full = {}
    raw_full = {}
    for window_name, window in windows.items():
        raw_full[window_name] = {}
        full[window_name] = {}
        for rule_id, _, _, _ in RULES:
            result = run_rule(markets, window, rule_id)
            raw_full[window_name][rule_id] = result
            full[window_name][rule_id] = public_metrics(result)
        qqq = simulate(markets["QQQ"].slice(window.start), [1.0], "bh", None)
        full[window_name]["QQQ_BH"] = public_metrics(qqq)
    starts = {
        "W1": month_starts(markets["W1"].dates, 2021, 9, 2024, 12),
        "W2": quarter_starts(markets["W2"].dates, 2016, 2023),
    }
    if len(starts["W1"]) != 40 or len(starts["W2"]) != 32:
        raise AssertionError(f"Unexpected start counts: {[len(v) for v in starts.values()]}")
    rolling = {}
    raw_rolling = {}
    for window_name in ("W1", "W2"):
        raw_rolling[window_name] = {}
        for rule_id, _, mode, threshold in RULES:
            raw_rolling[window_name][rule_id] = {}
            for start in starts[window_name]:
                market = markets[window_name].slice(start)
                raw_rolling[window_name][rule_id][start] = simulate(market, TARGETS, mode, threshold)
        rolling[window_name] = summarize_differences(raw_rolling[window_name], raw_rolling[window_name]["BH"])
    annual_w2 = annual_comparison(raw_full["W2"]["BH"], raw_full["W2"]["R40"])
    return {
        "full": full,
        "rolling": rolling,
        "rolling_starts": starts,
        "annual_w2": annual_w2,
    }, raw_full, raw_rolling


def annual_comparison(bh, reb):
    rows = []
    trades_by_year = {year: [] for year in bh["yearly_returns"]}
    for trade in reb["trade_log"]:
        trades_by_year[trade["execution_date"][:4]].append(trade)
    for year in bh["yearly_returns"]:
        rows.append({
            "year": year,
            "bh_return": bh["yearly_returns"][year],
            "r40_return": reb["yearly_returns"][year],
            "return_difference": reb["yearly_returns"][year] - bh["yearly_returns"][year],
            "bh_year_end_nav": bh["year_end_nav"][year],
            "r40_year_end_nav": reb["year_end_nav"][year],
            "r40_trades": len(trades_by_year[year]),
            "r40_cost": sum(t["cost"] for t in trades_by_year[year]),
        })
    return rows


def pct(value, digits=2):
    return f"{100 * value:.{digits}f}%"


def pp(value, digits=2):
    return f"{100 * value:+.{digits}f}"


def full_table(results):
    lines = [
        "| 规则 | 期末倍数 | 年化收益 | 年化波动 | 最大回撤 | 回撤峰值日→谷值日 | CER | 交易次数 | 累计成本 | 最差自然年 |",
        "|---|---:|---:|---:|---:|---|---:|---:|---:|---:|",
    ]
    for rule_id, result in results.items():
        label = "QQQ 买入持有" if rule_id == "QQQ_BH" else RULE_LABELS[rule_id]
        lines.append(
            f"| {rule_id} {label} | {result['final']:.4f} | {pct(result['cagr'])} | "
            f"{pct(result['annual_volatility'])} | {pct(result['max_drawdown'])} | "
            f"{result['drawdown_peak']}→{result['drawdown_trough']} | {result['cer']:.4f} | "
            f"{result['trades']} | {pct(result['cost'], 4)} | {result['worst_year']}：{pct(result['worst_year_return'])} |"
        )
    return "\n".join(lines)


def rolling_table(rows):
    lines = [
        "| 规则 | 起点数 | 年化差中位数(pp) | 年化差最差(pp) | 年化为正比例 | 回撤差中位数(pp) | 回撤差最差(pp) | 回撤为正比例 | 交易次数中位数[最小,最大] |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in rows:
        lines.append(
            f"| {row['rule']} {row['label']} | {row['starts']} | {pp(row['cagr_median'])} | "
            f"{pp(row['cagr_worst'])} | {pct(row['cagr_positive_share'], 1)} | "
            f"{pp(row['drawdown_median'])} | {pp(row['drawdown_worst'])} | "
            f"{pct(row['drawdown_positive_share'], 1)} | {row['median_trades']:g} "
            f"[{row['min_trades']},{row['max_trades']}] |"
        )
    return "\n".join(lines)


def annual_table(rows):
    lines = [
        "| 年份 | BH年收益 | R40年收益 | R40−BH(pp) | BH年末净值 | R40年末净值 | R40交易次数 | R40累计成本 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in rows:
        lines.append(
            f"| {row['year']} | {pct(row['bh_return'])} | {pct(row['r40_return'])} | "
            f"{pp(row['return_difference'])} | {row['bh_year_end_nav']:.4f} | "
            f"{row['r40_year_end_nav']:.4f} | {row['r40_trades']} | {pct(row['r40_cost'], 4)} |"
        )
    return "\n".join(lines)


def save_outputs(results, raw_full, raw_rolling, anchors, elapsed):
    with (OUT / "results.json").open("w") as handle:
        json.dump({"anchors": anchors, **results}, handle, ensure_ascii=False, indent=2)
    with (OUT / "trade-log.csv").open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["window", "rule", "start", "signal_date", "execution_date", "turnover", "cost"])
        for window_name, rules in raw_full.items():
            for rule_id, result in rules.items():
                for trade in result["trade_log"]:
                    writer.writerow([window_name, rule_id, result["start"], trade["signal_date"], trade["execution_date"], trade["turnover"], trade["cost"]])
        for window_name, rules in raw_rolling.items():
            for rule_id, by_start in rules.items():
                for start, result in by_start.items():
                    for trade in result["trade_log"]:
                        writer.writerow([f"{window_name}_rolling", rule_id, start, trade["signal_date"], trade["execution_date"], trade["turnover"], trade["cost"]])
    sections = [
        "# 生成表格", "## W1 全区间", full_table(results["full"]["W1"]),
        "## W2 全区间", full_table(results["full"]["W2"]),
        "## W1 滚动起点", rolling_table(results["rolling"]["W1"]),
        "## W2 滚动起点", rolling_table(results["rolling"]["W2"]),
        "## W2 A3/A4 年度拆解", annual_table(results["annual_w2"]),
    ]
    (OUT / "tables.md").write_text("\n\n".join(sections) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--anchors-only", action="store_true")
    args = parser.parse_args()
    started = time.perf_counter()
    markets = make_markets()
    anchors = anchor_checks(markets)
    for row in anchors:
        print(json.dumps(row, ensure_ascii=False))
    if not all(row["passed"] for row in anchors):
        raise SystemExit("Anchor reproduction failed")
    if args.anchors_only:
        (OUT / "anchors.json").write_text(json.dumps(anchors, ensure_ascii=False, indent=2) + "\n")
    else:
        results, raw_full, raw_rolling = run_all(markets)
        save_outputs(results, raw_full, raw_rolling, anchors, time.perf_counter() - started)
    elapsed = time.perf_counter() - started
    print(f"elapsed_seconds={elapsed:.3f}")


if __name__ == "__main__":
    main()
