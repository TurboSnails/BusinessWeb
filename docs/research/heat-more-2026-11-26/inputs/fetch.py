"""L-035 原始数据下载：罗素 2000、恒生指数、上证综指日收盘（Yahoo），写 raw/MANIFEST.csv。
Ken French 49 行业直接复用 L-032 的 raw/49_Industry_Portfolios_CSV.zip（不重新下载，sha256 记入 MANIFEST）。

用法：cd research-py && uv run python -I ../docs/research/heat-more-2026-11-26/inputs/fetch.py
约定：curl -sL --http1.1 串行；Yahoo 只用通用 UA "Mozilla/5.0"，不含任何个人信息；只下载，不计算任何统计。
"""
from __future__ import annotations

import csv
import hashlib
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
REPO = HERE.parents[3]
PERIOD2 = 1_800_000_000
JOBS = [
    ("RUT_yahoo_chart.json", f"https://query1.finance.yahoo.com/v8/finance/chart/%5ERUT?period1=0&period2={PERIOD2}&interval=1d"),
    ("HSI_yahoo_chart.json", f"https://query1.finance.yahoo.com/v8/finance/chart/%5EHSI?period1=0&period2={PERIOD2}&interval=1d"),
    ("SSEC_yahoo_chart.json", f"https://query1.finance.yahoo.com/v8/finance/chart/000001.SS?period1=0&period2={PERIOD2}&interval=1d"),
]
KF_SRC = REPO / "docs/research/nasdaq-semis-heat-2026-11-26/inputs/raw/49_Industry_Portfolios_CSV.zip"


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    rows = []
    for name, url in JOBS:
        dest = RAW / name
        subprocess.run(["curl", "-sSfL", "--http1.1", "--max-time", "180", "-A", "Mozilla/5.0", "-o", str(dest), url], check=True)
        b = dest.read_bytes()
        rows.append([name, url, datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), hashlib.sha256(b).hexdigest(), len(b)])
    b = KF_SRC.read_bytes()
    rows.append(["49_Industry_Portfolios_CSV.zip（复用 L-032）", str(KF_SRC.relative_to(REPO)), "2026-11-26（L-032 下载）", hashlib.sha256(b).hexdigest(), len(b)])
    with open(RAW / "MANIFEST.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["file", "url", "downloaded_utc", "sha256", "bytes"])
        w.writerows(rows)
    for r in rows:
        print(r[0], r[4], r[3][:12])


if __name__ == "__main__":
    main()
