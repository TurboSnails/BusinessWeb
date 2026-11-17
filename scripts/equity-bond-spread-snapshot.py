#!/usr/bin/env python3
"""生成股债息差快照；主序列为沪深300，另补中位数口径与上证50对照。"""
import json
import os
from datetime import date
from pathlib import Path

import akshare as ak
import pandas as pd

OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "equity-bond-spread.json"
APPROX = "只有月度市盈率，每日息差由最近月末盈利水平配合当日收盘价推算，并非真实每日 PE；触轨日期可能有偏差。"
EXTRA = [
    ("csi300-median", "沪深300", "沪深300（中位数）", "sh000300", "滚动市盈率中位数",
     "中位数取成分股 PE 排序后的中间值，降低少数大权重股的影响；只作另一口径对照，不代表预测更准。" + APPROX),
    ("sse50", "上证50", "上证50", "sh000016", "滚动市盈率", "上证50。" + APPROX),
]


def extra_series(key: str, name: str, label: str, code: str, column: str, note: str) -> dict:
    pe = ak.stock_index_pe_lg(symbol=name)
    pe["日期"] = pd.to_datetime(pe["日期"])
    earnings = (pe["指数"] / pe[column]).set_axis(pe["日期"])
    prices = ak.index_zh_daily_sina(symbol=code)
    prices["date"] = pd.to_datetime(prices["date"])
    close = prices.set_index("date")["close"]
    bond = ak.bond_zh_us_yield_em(start_date="20050101")[["日期", "中国国债收益率10年"]].dropna()
    bond = bond.set_axis(pd.to_datetime(bond["日期"]))["中国国债收益率10年"]
    earnings = earnings.reindex(close.index.union(earnings.index)).ffill().reindex(close.index)
    spread = (earnings / close * 100 - bond.reindex(close.index).ffill()).dropna()
    rows = [[d.strftime("%Y-%m-%d"), round(float(value), 3), round(float(close[d]), 2)] for d, value in spread.items()]
    if len(rows) < 500:
        raise SystemExit(f"{label} 只取到 {len(rows)} 行，疑似上游异常，未写入")
    print(f"{label}：{len(rows)} 行，{rows[0][0]} 至 {rows[-1][0]}，最新息差 {rows[-1][1]}")
    return {"id": key, "name": name, "label": label, "note": note, "rows": rows}


def main() -> None:
    df = ak.stock_ebs_lg()
    df = df.rename(columns={"日期": "date", "沪深300指数": "index", "股债利差": "spread"})
    df = df.dropna(subset=["spread", "index"]).sort_values("date")
    scale = 100 if df["spread"].abs().max() < 1 else 1
    rows = [[str(d)[:10], round(float(s) * scale, 3), round(float(i), 2)] for d, s, i in zip(df["date"], df["spread"], df["index"])]
    if len(rows) < 1000:
        raise SystemExit(f"只取到 {len(rows)} 行，疑似上游异常，未写入")
    extra = [extra_series(*item) for item in EXTRA]
    snapshot = {
        "generatedAt": date.today().isoformat(),
        "source": "乐咕乐股（经 AkShare：股债利差、指数行情、指数 PE 与国债收益率）",
        "window": 750,
        "k": 2,
        "rows": rows,
        "extra": extra,
    }
    temp = OUT.with_suffix(f".{os.getpid()}.tmp")
    temp.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temp.replace(OUT)
    print(f"已写入 {OUT}：主序列 {len(rows)} 行，另含 {len(extra)} 条对照序列")


if __name__ == "__main__":
    main()
