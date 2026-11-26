"""下载 CBOE 指数日线原始 CSV 到 raw/，并写 raw/MANIFEST.csv（URL、下载时间、sha256、起止日期、行数）。

用法（仓库根目录）：
    cd research-py && uv run python ../docs/research/option-hedge-2026-11-26/inputs/fetch.py

只做下载与登记，不计算任何收益类统计。重复运行会覆盖 raw/ 中同名文件（CBOE 文件每日追加新行，sha256 会变）。
"""

from __future__ import annotations

import csv
import hashlib
import subprocess
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"

CDN = "https://cdn.cboe.com/api/global/us_indices/daily_prices/{t}_History.csv"
TICKERS = ["PPUT", "PPUT3M", "CLLZ", "CLL", "CLL3M", "CLL1M", "VXTH", "PUT", "BXM", "SPRO", "SPROME", "SPRF", "BFLY", "SPX"]

# CBOE 旧站点的 CLL 全历史文件（1986-06-30 起）已下线，只能取 Wayback Machine 的原样快照（id_ 前缀 = 不改写内容）。
LEGACY = {
    "CLL_legacy_wayback20200711.csv": "http://web.archive.org/web/20200711183111id_/http://www.cboe.com:80/publish/scheduledtask/mktdata/datahouse/clldailyhistory.csv",
}

# 标普 500 含息总收益日线（S&P DJI 的 SPXTR，经 Yahoo ^SP500TR，1988-01-04 起），仅用于股息口径核对。CBOE 没有公开的 SPX 总收益文件。
YAHOO = {
    "SP500TR_yahoo_chart.json": "https://query1.finance.yahoo.com/v8/finance/chart/%5ESP500TR?period1=500000000&period2=1800000000&interval=1d",
}


def fetch(url: str, dest: Path) -> None:
    cmd = ["curl", "-sSfL", "--http1.1", "-A", "Mozilla/5.0", "-o", str(dest), url]
    subprocess.run(cmd, check=True)


def date_span(path: Path) -> tuple[str, str, int]:
    """返回 (首个日期, 末个日期, 数据行数)。CSV 只识别以 m/d/yyyy 开头的行；Yahoo JSON 用时间戳（纽约时区）。"""
    if path.suffix == ".json":
        import json
        from zoneinfo import ZoneInfo

        r = json.loads(path.read_text(encoding="utf-8"))["chart"]["result"][0]
        ny = ZoneInfo("America/New_York")
        ds = [datetime.fromtimestamp(t, ny).strftime("%Y-%m-%d") for t in r["timestamp"]]
        return min(ds), max(ds), len(ds)
    rows = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        head = line.split(",", 1)[0].strip()
        parts = head.split("/")
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            m, d, y = (int(p) for p in parts)
            rows.append(f"{y:04d}-{m:02d}-{d:02d}")
    return (min(rows), max(rows), len(rows)) if rows else ("", "", 0)


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    jobs = [(f"{t}_History.csv", CDN.format(t=t)) for t in TICKERS] + list(LEGACY.items()) + list(YAHOO.items())
    out = []
    for name, url in jobs:
        dest = RAW / name
        fetch(url, dest)
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        sha = hashlib.sha256(dest.read_bytes()).hexdigest()
        first, last, n = date_span(dest)
        out.append({"file": name, "url": url, "downloaded_utc": ts, "sha256": sha, "first_date": first, "last_date": last, "rows": n})
        print(f"{name:34s} {first} → {last} rows={n}")
    with (RAW / "MANIFEST.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)


if __name__ == "__main__":
    main()
