"""用 AKShare（东方财富公开接口 fund_etf_hist_em，前复权）补齐 ETF 日线，写成与 fetch.mjs 相同的格式。

用法：~/.businessweb-etf-oos/venv/bin/python fetch_akshare.py <code...>
      不给代码时，补齐 $FRIEND_REPO 数据文件里出现、但缓存中缺少的代码。
缓存目录：$BARS_DIR（默认 ~/.businessweb-etf-oos/bars）。失败的代码打印出来，不重试绕过。
"""
import json
import os
import re
import sys
import time

import akshare as ak

BARS = os.environ.get("BARS_DIR", os.path.expanduser("~/.businessweb-etf-oos/bars"))
os.makedirs(BARS, exist_ok=True)


def wanted():
    codes = set(sys.argv[1:])
    if codes:
        return codes
    root = os.environ.get("FRIEND_REPO", "")
    for f in ["industryEtf.json", "strategyAssetEtf.json", "etfMacdGood.json", "etfHs300Timing.json", "etfReviewResearch.json"]:
        p = os.path.join(root, "src/data", f)
        if os.path.exists(p):
            codes |= set(re.findall(r'"code"\s*:\s*"(\d{6})"', open(p, encoding="utf8").read()))
    codes |= {"510300", "510880", "159915"}
    return {c for c in codes if c[:2] in ("15", "16", "51", "52", "56", "58")}  # 只要场内 ETF


ok, fail = 0, []
for code in sorted(wanted()):
    out = os.path.join(BARS, code + ".json")
    if os.path.exists(out):
        continue
    try:
        df = ak.fund_etf_hist_em(symbol=code, period="daily", start_date="20050101", end_date="20261231", adjust="qfq")
        rows = [
            {"date": str(r["日期"])[:10], "open": float(r["开盘"]), "close": float(r["收盘"]), "high": float(r["最高"]), "low": float(r["最低"])}
            for _, r in df.iterrows()
            if float(r["开盘"]) > 0 and float(r["收盘"]) > 0
        ]
        if len(rows) < 300:
            raise ValueError(f"too few {len(rows)}")
        json.dump(rows, open(out, "w"))
        ok += 1
    except Exception as e:  # noqa: BLE001
        fail.append(f"{code}:{str(e)[:60]}")
    time.sleep(3.0)
print("新增", ok, "失败", len(fail), fail[:15])
