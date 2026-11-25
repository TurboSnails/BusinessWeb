"""取多资产研究的原始数据到 data/raw/（不入库），并把来源、下载时间与 sha256 写进 data/SOURCES.json（入库）。

只取数据，不计算任何组合。用法（在 research-py/ 下）：uv run python -m data.fetch_raw
"""

from __future__ import annotations

import hashlib
import json
import time
import subprocess
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
SOURCES = HERE / "SOURCES.json"

UA = {"User-Agent": "Mozilla/5.0"}
NOW = int(time.time())
ITEMS = {
    "fred_dgs5.csv": ("FRED DGS5：5 年期美国国债固定期限收益率，日度，%", "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS5"),
    "fred_gs5.csv": ("FRED GS5：5 年期美国国债收益率，月均值，%（1953-04 起，用于 1962 年以前）", "https://fred.stlouisfed.org/graph/fredgraph.csv?id=GS5"),
    "fred_cpiaucsl.csv": ("FRED CPIAUCSL：美国 CPI（季调），月度", "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL"),
    "bbk_gold_dem.csv": (
        "德国央行 BBEX3.D.XAU.DEM.EA.AC.C01：法兰克福交易所黄金定价，1 公斤纯金 = 马克，日度，1968-06-18 至 1998-12",
        "https://api.statistiken.bundesbank.de/rest/download/BBEX3/D.XAU.DEM.EA.AC.C01?format=csv&lang=en",
    ),
    "bbk_usd_dem.csv": (
        "德国央行 BBEX3.D.USD.DEM.AA.AC.000：法兰克福交易所汇率定价，1 美元 = 马克，日度",
        "https://api.statistiken.bundesbank.de/rest/download/BBEX3/D.USD.DEM.AA.AC.000?format=csv&lang=en",
    ),
    "yahoo_gc.json": ("Yahoo GC=F：COMEX 黄金期货近月连续合约，日度，2000-08 起", f"https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?period1=0&period2={NOW}&interval=1d"),
    "yahoo_gld.json": ("Yahoo GLD：SPDR 黄金 ETF，日度（含调整收盘），2004-11 起", f"https://query1.finance.yahoo.com/v8/finance/chart/GLD?period1=0&period2={NOW}&interval=1d"),
    "yahoo_iei.json": ("Yahoo IEI：iShares 3–7 年期美国国债 ETF，日度（核对债券收益用）", f"https://query1.finance.yahoo.com/v8/finance/chart/IEI?period1=0&period2={NOW}&interval=1d"),
    "yahoo_ief.json": ("Yahoo IEF：iShares 7–10 年期美国国债 ETF，日度（核对债券收益用）", f"https://query1.finance.yahoo.com/v8/finance/chart/IEF?period1=0&period2={NOW}&interval=1d"),
    "worldbank_cmo_monthly.xlsx": (
        "世界银行 Pink Sheet 月度商品价格（黄金为伦敦月均价，美元/盎司；第二来源）",
        "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx",
    ),
}


def fetch(url: str) -> bytes:
    """用 curl 取数（本机 Python/Node 内置 HTTP 访问 FRED 常超时，仓库其他脚本同样改用 curl）。"""
    last = None
    for attempt in range(4):
        # 只有 Yahoo 需要浏览器标识；FRED 对这个标识会拦截，其他来源用 curl 默认标识
        ua = ["-A", UA["User-Agent"]] if "yahoo.com" in url else []
        r = subprocess.run(["curl", "-sS", "-L", "--http1.1", "-m", "120", *ua, "-w", "\n%{http_code}", url], capture_output=True)
        if r.returncode == 0:
            body, _, code = r.stdout.rpartition(b"\n")
            if code.strip() == b"200" and body:
                return body
            last = f"HTTP {code.decode().strip()}"
        else:
            last = r.stderr.decode(errors="replace").strip()
        time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"取数失败：{url}：{last}")


def main() -> None:
    RAW.mkdir(exist_ok=True)
    meta = json.loads(SOURCES.read_text(encoding="utf-8")) if SOURCES.exists() else {}
    for name, (desc, url) in ITEMS.items():
        if (RAW / name).exists() and name in meta and hashlib.sha256((RAW / name).read_bytes()).hexdigest() == meta[name]["sha256"]:
            print(f"{name:28s} 已有，跳过")
            continue
        body = fetch(url)
        (RAW / name).write_bytes(body)
        meta[name] = {
            "description": desc,
            "url": url.replace(str(NOW), "<下载时刻>"),
            "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "bytes": len(body),
            "sha256": hashlib.sha256(body).hexdigest(),
        }
        print(f"{name:28s} {len(body):>9,d} 字节")
        SOURCES.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        time.sleep(1.5)
    SOURCES.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
