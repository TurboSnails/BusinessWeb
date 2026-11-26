"""下载纳斯达克 / 费城半导体 / Ken French 49 行业 / CFTC 纳指 TFF 的原始文件到 raw/，
并写 raw/MANIFEST.csv（文件、URL、下载时间 UTC、sha256、字节数）。

用法（仓库根目录）：
    cd research-py && uv run python ../docs/research/nasdaq-semis-heat-2026-11-26/inputs/fetch.py

约定：
- curl -sL --http1.1，串行下载；FRED / CFTC / Ken French 不带自定义 UA（curl 默认 UA），
  Yahoo 与 Nasdaq 接口拒绝 curl 默认 UA，只用通用的 "Mozilla/5.0"，不含任何个人信息。
- 只做下载与登记，不计算任何收益、回撤或相关类统计。
- 重复运行会覆盖 raw/ 中同名文件；来源每日追加或修订，sha256 会变，以 MANIFEST.csv 为准。
"""

from __future__ import annotations

import csv
import hashlib
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
UA_BROWSER = "Mozilla/5.0"
PERIOD2 = 1_800_000_000  # 2027-01-15，取到最新

# (文件名, URL, 是否需要通用浏览器 UA, 额外请求头)
JOBS: list[tuple[str, str, bool, list[str]]] = [
    # 1. 纳斯达克综合指数
    ("NASDAQCOM_fred.csv", "https://fred.stlouisfed.org/graph/fredgraph.csv?id=NASDAQCOM", False, []),
    ("IXIC_yahoo_chart.json",
     f"https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?period1=0&period2={PERIOD2}&interval=1d", True, []),
    # 第三来源，仅用于裁决 FRED 与 Yahoo 不一致的日子
    ("COMP_nasdaq_historical.json",
     "https://api.nasdaq.com/api/quote/COMP/historical?assetclass=index&fromdate=1971-01-01&todate=2026-12-31&limit=20000",
     True, ["Accept: application/json"]),
    # 2. 费城半导体指数
    ("SOX_yahoo_chart.json",
     f"https://query1.finance.yahoo.com/v8/finance/chart/%5ESOX?period1=0&period2={PERIOD2}&interval=1d", True, []),
    ("SOX_nasdaq_historical.json",
     "https://api.nasdaq.com/api/quote/SOX/historical?assetclass=index&fromdate=1990-01-01&todate=2026-12-31&limit=20000",
     True, ["Accept: application/json"]),
    # 3. Ken French 49 行业（月度表含 VW/EW 收益、公司数、平均规模）及其说明页
    ("49_Industry_Portfolios_CSV.zip",
     "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/49_Industry_Portfolios_CSV.zip", False, []),
    ("det_49_ind_port.html",
     "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/det_49_ind_port.html", False, []),
    ("Siccodes49.zip",
     "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/Siccodes49.zip", False, []),
    # 4. CFTC TFF（仅期货）纳指 100 合并合约 20974+，用于核对仓库 cftcNdxAsset
    ("cftc_tff_20974.json",
     "https://publicreporting.cftc.gov/resource/gpe5-46if.json?"
     "%24where=cftc_contract_market_code%3D%2720974%2B%27"
     "&%24select=report_date_as_yyyy_mm_dd,market_and_exchange_names,cftc_contract_market_code,"
     "open_interest_all,asset_mgr_positions_long,asset_mgr_positions_short"
     "&%24order=report_date_as_yyyy_mm_dd%20ASC&%24limit=5000", False, []),
]


def fetch(url: str, dest: Path, browser_ua: bool, headers: list[str]) -> None:
    cmd = ["curl", "-sSfL", "--http1.1", "--max-time", "180", "-o", str(dest)]
    if browser_ua:
        cmd += ["-A", UA_BROWSER]
    for h in headers:
        cmd += ["-H", h]
    subprocess.run(cmd + [url], check=True)


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    out = []
    for name, url, browser_ua, headers in JOBS:
        dest = RAW / name
        fetch(url, dest, browser_ua, headers)
        data = dest.read_bytes()
        out.append({
            "file": name,
            "url": url,
            "downloaded_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data),
        })
        print(f"{name:32s} {len(data):>10d} bytes")
        time.sleep(1)  # 串行，礼貌间隔
    with (RAW / "MANIFEST.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)


if __name__ == "__main__":
    main()
