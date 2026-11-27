"""Fetch and preserve public L-039 source responses. No trading calculations."""

import argparse
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[3] / "data-raw" / "crypto-trend"
RAW = ROOT / "raw"
DAY = timedelta(days=1)
CUTOFF = date(2026, 11, 26)
CM = "https://community-api.coinmetrics.io/v4"
FUTURES = "https://fapi.binance.com/fapi/v1"
SPOT = "https://data-api.binance.vision/api/v3"
METRICS = "PriceUSD,CapMVRVCur,CapMrktCurUSD,SplyCur,AssetEODCompletionTime"
FILES = []
AUDIT_ONLY = False


def query(base, **params):
    return f"{base}?{urlencode(params)}"


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def unix(day):
    return int(datetime.fromisoformat(str(day)).replace(tzinfo=timezone.utc).timestamp())


def iso(unix_ms):
    return datetime.fromtimestamp(int(unix_ms) / 1000, timezone.utc).isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")


def get(name, url, pause, allowed_status=()):
    path = RAW / name
    sidecar = path.with_name(path.name + ".source")
    if path.exists() and sidecar.exists():
        source = json.loads(sidecar.read_text())
        body = path.read_bytes()
        if source["url"] != url or source["sha256"] != hashlib.sha256(body).hexdigest():
            raise ValueError(f"Source or checksum mismatch for {name}")
    else:
        if AUDIT_ONLY:
            raise RuntimeError(f"Missing local cache for {url}")
        for attempt in range(4):
            time.sleep(pause)
            try:
                with urlopen(url, timeout=30) as response:
                    body, status = response.read(), response.status
                break
            except HTTPError as error:
                if error.code in allowed_status:
                    body, status = error.read(), error.code
                    break
                if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                    raise
                retry_after = error.headers.get("Retry-After", "")
                time.sleep(int(retry_after) if retry_after.isdigit() else 2**attempt)
            except (URLError, TimeoutError):
                if attempt == 3:
                    raise
                time.sleep(2**attempt)
        source = dict(url=url, downloaded=utc_now(), status=status,
                      sha256=hashlib.sha256(body).hexdigest())
        path.write_bytes(body)
        sidecar.write_text(json.dumps(source, ensure_ascii=False) + "\n")
    FILES.append(dict(name=name, **source, rows=0, start="—", end="—"))
    return body


def describe(rows, first=None, last=None):
    FILES[-1].update(rows=len(rows), start=first or "—", end=last or "—")


def cm_pages(name, url, series):
    page = 1
    while url:
        result = json.loads(get(f"{name}-{page:02d}.json", url, 0.7))
        rows = result["data"]
        dates = [row["time"][:10] for row in rows] if series else [
            stamp[:10] for row in rows for metric in row["metrics"]
            for freq in metric["frequencies"] for stamp in (freq["min_time"], freq["max_time"])
        ]
        describe(rows, min(dates, default=None), max(dates, default=None))
        url = result.get("next_page_url")
        page += 1


def binance_pages(name, endpoint, symbol, start, timestamp, **params):
    cursor = unix(start) * 1000
    until = unix(CUTOFF + DAY) * 1000 - 1
    page = 1
    while cursor <= until:
        url = query(endpoint, symbol=symbol, startTime=cursor, endTime=until, limit=1000, **params)
        rows = json.loads(get(f"{name}-{symbol.lower()}-{page:02d}.json", url, 0.35))
        if not isinstance(rows, list):
            raise ValueError(f"Unexpected Binance response from {url}")
        if not rows:
            break
        first, last = timestamp(rows[0]), timestamp(rows[-1])
        if not cursor <= first <= last <= until:
            raise ValueError(f"Invalid Binance page bounds {first}, {last} from {url}")
        describe(rows, iso(first), iso(last))
        cursor = last + 1
        page += 1


def bitstamp(pair, start, end, name):
    url = query(f"https://www.bitstamp.net/api/v2/ohlc/{pair}/", step=86400,
                limit=1000, start=unix(start), end=unix(end), exclude_current_candle="true")
    rows = json.loads(get(name, url, 0.4))["data"]["ohlc"]
    describe(rows, *(iso(int(rows[i]["timestamp"]) * 1000) for i in (0, -1)) if rows else ())
    return rows


def write_manifest():
    header = """# L-039 原始数据来源

文件在本机 `raw/`，JSON 和 HTML 保留服务端响应字节，未补值、去重或重排。每个文件的 `.source` 是本机复跑缓存元数据。SHA-256 针对响应原始字节。覆盖截止 2026-11-26 UTC。行数为响应中数据记录数，catalog 按资产计，HTML 按原始响应中已渲染的排名行计，失败响应行数为 0；HTML 日期为所请求的历史截面。空页用于记录分页结束。

| 本机文件 | 公开 URL 与参数 | 下载时间 UTC | HTTP | 行数 | 最早 → 最晚 | SHA-256 |
|---|---|---|---:|---:|---|---|
"""
    lines = [
        f'| `{row["name"]}` | <{row["url"]}> | {row["downloaded"]} | {row["status"]} | '
        f'{row["rows"]} | {row["start"]} → {row["end"]} | `{row["sha256"]}` |'
        for row in FILES
    ]
    (ROOT / "SOURCES.md").write_text(header + "\n".join(lines) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit-only", action="store_true",
                        help="Regenerate the manifest from existing cache and verify every hash")
    global AUDIT_ONLY
    AUDIT_ONLY = parser.parse_args().audit_only

    RAW.mkdir(parents=True, exist_ok=True)
    cm_pages("cm-metrics", query(f"{CM}/timeseries/asset-metrics", assets="btc,eth",
                                metrics=METRICS, frequency="1d", start_time="2009-01-03",
                                end_time=CUTOFF, page_size=10000, paging_from="start"), True)
    cm_pages("cm-catalog", query(f"{CM}/catalog-v2/asset-metrics",
                                metrics=f"{METRICS},CapRealUSD", page_size=1000), False)
    for asset in ("btc", "eth"):
        get(f"cm-capreal-{asset}.json", query(f"{CM}/timeseries/asset-metrics",
            assets=asset, metrics="CapRealUSD", frequency="1d", start_time="2018-01-01",
            end_time="2018-01-03", page_size=3, paging_from="start"), 0.7, (403,))
    for symbol in ("BTCUSDT", "ETHUSDT"):
        binance_pages("spot", f"{SPOT}/klines", symbol, date(2017, 8, 1),
                      lambda row: row[0], interval="1d")
    for symbol in ("BTCUSDT", "ETHUSDT", "ZECUSDT"):
        binance_pages("funding", f"{FUTURES}/fundingRate", symbol, date(2019, 9, 1),
                      lambda row: row["fundingTime"])
        binance_pages("mark", f"{FUTURES}/markPriceKlines", symbol, date(2019, 9, 1),
                      lambda row: row[0], interval="1d")
        binance_pages("mark8h", f"{FUTURES}/markPriceKlines", symbol, date(2019, 9, 1),
                      lambda row: row[0], interval="8h")
        binance_pages("perp", f"{FUTURES}/klines", symbol, date(2019, 9, 1),
                      lambda row: row[0], interval="1d")
    get("bitmex-funding-xbtusd-probe.txt", query("https://www.bitmex.com/api/v1/funding",
        symbol="XBTUSD", count=2, reverse="false", startTime="2016-05-13T00:00:00Z",
        endTime="2019-09-10T00:00:00Z"), 0.4, (403, 404, 410))
    start = date(2011, 1, 1)
    while start <= CUTOFF:
        end = min(start + 999 * DAY, CUTOFF)
        bitstamp("btcusd", start, end, f"bitstamp-btcusd-{start}.json")
        start = end + DAY
    bitstamp("ethusd", date(2017, 8, 1), date(2017, 8, 31), "bitstamp-ethusd-listing.json")
    for year in range(2018, 2027):
        day = date(year, 8, 17)
        bitstamp("ethusd", day, day + DAY, f"bitstamp-ethusd-{day}.json")
    for stamp in ("20130428", "20170618", "20180107", "20220410", "20220612", "20221106"):
        body = get(f"cmc-{stamp}.html", f"https://coinmarketcap.com/historical/{stamp}/", 1.0)
        if b"Historical Snapshot" not in body:
            raise ValueError(f"Unexpected CoinMarketCap page for {stamp}")
        snapshot = datetime.strptime(stamp, "%Y%m%d").date().isoformat()
        first_cells = re.findall(rb"<tr[^>]*>\s*<td[^>]*>(.*?)</td>", body, re.S)
        ranks = [cell for cell in first_cells if re.sub(rb"<[^>]+>", b"", cell).strip().isdigit()]
        if not ranks:
            raise ValueError(f"No rendered ranking rows for {stamp}")
        describe(ranks, snapshot, snapshot)
    write_manifest()


if __name__ == "__main__":
    main()
