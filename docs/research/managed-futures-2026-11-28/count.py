"""管理期货立项评估：只数美股回撤段，不算任何候选的收益、夏普或回撤。

口径（运行前写定，见 SCOPE.md 第三节）：
- 回撤段：在美股总回报指数上，从创新高的月份（峰）起，到第一次收复该峰值为止；
  段内最低点为谷，深度 = 谷 / 峰 - 1。深度 <= -15% 记入「>=15%」，<= -20% 记入「>=20%」。
  到样本末尾仍未收复的段照样记入（标 ongoing）。
- 主序列 A：Ken French 市场组合 Mkt-RF + RF（CRSP 市值加权含息，月末），1926-07 至 2026-09。
- 对照序列 B：标普 500 日收盘（只有价格），1950-01-03 至 2026-11-25（检验月末口径会不会漏掉急跌段）。
- 参考序列 C：席勒月均价 + 月股息（P + D/12 近似含息），1871-01 至 1926-06（只作信息，没有公开的趋势数据覆盖这一段）。
- 覆盖：一段回撤「落在」某个数据窗口内 = 峰月与谷月都在窗口内（主口径）；另报「有重叠」。
- 账本使用标签：按峰月所在日历段标注美国股票数据此前被哪些登记检验用过（不看任何收益）。
- 「1973 年前」按谷月 < 1973-01 判定；「无 v2.2 档位」按峰月 < 1959-09 判定。

用法：python3 -I count.py <repo_root>  → 写 counts.json 到本目录
"""
import json
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "counts.json"

# ---------- 序列 ----------

def series_kf():
    d = json.loads((ROOT / "docs/research/trend-1871-2026-11-26/inputs/ff-factors.json").read_text())
    lvl, out = 1.0, []
    for month, mkt_rf, rf in d["rows"]:
        lvl *= 1 + (mkt_rf + rf) / 100
        out.append((month, lvl))
    return out


def series_spx_daily():
    d = json.loads((ROOT / "data-raw/macro-posture-daily/spx-daily.json").read_text())
    return [(day, px) for day, px in d["rows"] if px is not None]


def series_shiller(end="1926-06"):
    rows = (ROOT / "data-raw/sp500-backtest/shiller.csv").read_text().strip().splitlines()[1:]
    out, lvl, prev_p = [], 1.0, None
    for line in rows:
        date, p, dv = line.split(",")[:3]
        if date > end:
            break
        p = float(p)
        dv = float(dv) if dv else 0.0
        if prev_p is not None:
            lvl *= (p + dv / 12) / prev_p
        out.append((date, lvl))
        prev_p = p
    return out


# ---------- 回撤段 ----------

def episodes(series):
    eps, peak_d, peak_v = [], series[0][0], series[0][1]
    trough_d, trough_v, in_dd = None, None, False
    for d, v in series[1:]:
        if v >= peak_v:
            if in_dd:
                eps.append(dict(peak=peak_d, trough=trough_d, recovery=d,
                                depth=round(trough_v / peak_v - 1, 4)))
            peak_d, peak_v, in_dd = d, v, False
            trough_d, trough_v = None, None
        else:
            if not in_dd or v < trough_v:
                trough_d, trough_v = d, v
            in_dd = True
    if in_dd:
        eps.append(dict(peak=peak_d, trough=trough_d, recovery=None,
                        depth=round(trough_v / peak_v - 1, 4)))
    return eps


def deep(eps, thr):
    return [e for e in eps if e["depth"] <= -thr]


# ---------- 数据窗口（趋势 / 管理期货序列的覆盖） ----------
# 月度序列用 YYYY-MM；日度用 YYYY-MM-DD；比较时统一截到月。
WINDOWS = {
    "HOP2017 百年趋势（论文样本，未公开）": ("1880-01", "2016-12"),
    "AQR 百年因子溢价·市场列（只能自建 3 类资产粗代理）": ("1926-07", "2026-02"),
    "AQR TSMOM 因子（更新版）": ("1985-01", "2026-05"),
    "AQR TSMOM 原文数据": ("1985-01", "2009-12"),
    "RYMFX（Guggenheim，2007-02）": ("2007-02", "2026-11"),
    "AQMIX（AQR 共同基金，2010-01）": ("2010-01", "2026-11"),
    "ASFYX（AlphaSimplex，2010-08）": ("2010-08", "2026-11"),
    "WTMF（2011-01）": ("2011-01", "2026-11"),
    "FMF（2013-08）": ("2013-08", "2026-11"),
    "PQTIX（Yahoo 只从 2014-01 起）": ("2014-01", "2026-11"),
    "DBMF（2019-05）": ("2019-05", "2026-11"),
    "KMLM（2020-12）": ("2020-12", "2026-11"),
    "CTA（Simplify，2022-03）": ("2022-03", "2026-11"),
}

# 美国股票数据被登记簿用于择时 / 组合检验的日历段（只看日历，不看收益）
LEDGER_USE = [
    ("1871-01", "1934-12", "L-027（B-5 已用）"),
    ("1935-01", "1949-12", "L-001（1935–2026 月度）"),
    ("1950-01", "1972-12", "L-015 留出 / L-020 / L-021（B-1）/ L-041"),
    ("1973-01", "2026-12", "美国 1973–2026 全部已用（约 86 个改动）"),
]


def m(d):
    return d[:7]


def ledger_tag(peak):
    for a, b, tag in LEDGER_USE:
        if a <= m(peak) <= b:
            return tag
    return "—"


def within(e, w):
    a, b = w
    end = m(e["trough"])
    return a <= m(e["peak"]) and end <= b


def overlaps(e, w):
    a, b = w
    end = m(e["recovery"]) if e["recovery"] else "9999-12"
    return m(e["peak"]) <= b and end >= a


def main():
    kf = episodes(series_kf())
    spx = episodes(series_spx_daily())
    shl = episodes(series_shiller())
    out = {"note": "只数美股回撤段与数据覆盖，没有计算任何候选或管理期货序列的表现。", "series": {}}
    for name, eps in [("A_kf_monthly_1926_2026", kf), ("B_spx_daily_price_1950_2026", spx),
                      ("C_shiller_monthly_1871_1926", shl)]:
        out["series"][name] = {
            "ge15": [dict(e, ledger=ledger_tag(e["peak"])) for e in deep(eps, 0.15)],
            "ge20_count": len(deep(eps, 0.20)),
            "ge15_count": len(deep(eps, 0.15)),
        }
    win = {}
    for wname, w in WINDOWS.items():
        row = {}
        for sname, eps in [("A", kf), ("B", spx)]:
            for thr in (0.15, 0.20):
                inside = [e for e in deep(eps, thr) if within(e, w)]
                ov = [e for e in deep(eps, thr) if overlaps(e, w)]
                row[f"{sname}_ge{int(thr*100)}_within"] = len(inside)
                row[f"{sname}_ge{int(thr*100)}_overlap"] = len(ov)
                row[f"{sname}_ge{int(thr*100)}_peaks"] = [e["peak"] for e in inside]
        # 1973 年前（美国 1973–2026 已全部用过）与 1959 年前（没有 v2.2 档位）
        for thr in (0.15, 0.20):
            inside = [e for e in deep(kf, thr) if within(e, w)]
            # 1973 年前：谷月早于 1973-01（1972-12 见顶的 1973–74 熊市不算）
            row[f"A_ge{int(thr*100)}_pre1973"] = len([e for e in inside if m(e["trough"]) < "1973-01"])
            # 没有 v2.2 档位：峰月早于 1959-09
            row[f"A_ge{int(thr*100)}_pre1959"] = len([e for e in inside if m(e["peak"]) < "1959-09"])
            # 有 v2.2 留出档位且在 1973 年前：峰月 >= 1959-09 且谷月 < 1973-01
            row[f"A_ge{int(thr*100)}_tier_holdout"] = len([e for e in inside if m(e["peak"]) >= "1959-09" and m(e["trough"]) < "1973-01"])
            row[f"A_ge{int(thr*100)}_post2009"] = len([e for e in inside if m(e["peak"]) >= "2010-01"])
        win[wname] = row
    out["windows"] = win
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    # 打印摘要
    for name, s in out["series"].items():
        print(name, "ge15", s["ge15_count"], "ge20", s["ge20_count"])
        for e in s["ge15"]:
            print("   ", e["peak"], "->", e["trough"], "rec", e["recovery"], e["depth"], e["ledger"])
    for wname, row in win.items():
        print(wname, {k: v for k, v in row.items() if not k.endswith("peaks")})


if __name__ == "__main__":
    main()
