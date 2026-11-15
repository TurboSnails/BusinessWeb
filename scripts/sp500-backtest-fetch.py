#!/usr/bin/env python3
"""Download Shiller / FRED / Ken French sources and write CSV under data-raw/sp500-backtest/.

Run with an external venv that has xlrd, e.g.:
  python3 -m venv "$TMPDIR/sp500-venv" && "$TMPDIR/sp500-venv/bin/pip" install xlrd
  "$TMPDIR/sp500-venv/bin/python" -I scripts/sp500-backtest-fetch.py

Does not write the raw xls into the repo; only converted CSVs + SOURCES.md.
"""
from __future__ import annotations

import csv
import hashlib
import io
import os
import re
import sys
import urllib.error
import urllib.request
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data-raw" / "sp500-backtest"
TMP = Path(os.environ.get("TMPDIR", "/tmp")) / "sp500-backtest-raw"
SHILLER_FALLBACK = (
    "https://img1.wsimg.com/blobby/go/e5e77e0b-59d1-44d9-ab25-4763ac982e53/"
    "downloads/ie_data.xls"
)
FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=TB3MS"
FRED_TABLE_URL = "https://fred.stlouisfed.org/data/TB3MS"
KF_URL = (
    "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/"
    "ftp/F-F_Research_Data_Factors_CSV.zip"
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(url: str, timeout: float = 60) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "BusinessWeb-sp500-backtest/1.0 (research; local)"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def discover_shiller_url() -> tuple[str, str]:
    """Return (url, note). Prefer homepage latest link; else fallback."""
    try:
        html = fetch("https://shillerdata.com/", timeout=30).decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001 — network; fall back
        return SHILLER_FALLBACK, f"homepage unreachable ({exc}); used fallback"
    m = re.search(
        r'//img1\.wsimg\.com/blobby/[^"\']+ie_data\.xls[^"\']*',
        html,
    )
    if not m:
        return SHILLER_FALLBACK, "no ie_data.xls on homepage; used fallback"
    url = "https:" + m.group(0)
    return url, "latest link from shillerdata.com homepage"


def parse_shiller_date(raw) -> str | None:
    """Shiller Date column: 1871.01 = Jan; 1871.1 = Oct (not 1871.10).

    Excel stores October as YYYY.1 (one decimal), so (x-year)*100 rounds to 10.
    """
    if raw is None or raw == "":
        return None
    try:
        x = float(raw)
    except (TypeError, ValueError):
        return None
    year = int(x)
    # 0.01..0.09 → 1..9; 0.1 → 10; 0.11 → 11; 0.12 → 12
    month = int(round((x - year) * 100))
    if not (1 <= month <= 12):
        return None
    if year < 1870 or year > 2100:
        return None
    return f"{year:04d}-{month:02d}"


def _selftest_parse_shiller_date() -> None:
    assert parse_shiller_date(1871.01) == "1871-01"
    assert parse_shiller_date(1871.09) == "1871-09"
    assert parse_shiller_date(1871.1) == "1871-10"
    assert parse_shiller_date(1871.11) == "1871-11"
    assert parse_shiller_date(1871.12) == "1871-12"
    assert parse_shiller_date(1871.13) is None
    assert parse_shiller_date(None) is None


def num(v):
    if v is None or v == "":
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if x != x:  # NaN
        return None
    return x


def convert_shiller(xls_path: Path) -> tuple[list[dict], str]:
    import xlrd  # type: ignore

    book = xlrd.open_workbook(str(xls_path))
    sheet = book.sheet_by_name("Data")
    rows: list[dict] = []
    for r in range(8, sheet.nrows):
        d = parse_shiller_date(sheet.cell_value(r, 0))
        if d is None:
            continue
        p, div, e, cpi = (num(sheet.cell_value(r, c)) for c in (1, 2, 3, 4))
        if p is None or cpi is None:
            continue
        rows.append({"date": d, "P": p, "D": div, "E": e, "CPI": cpi})
    if not rows:
        raise RuntimeError("no Shiller data rows parsed")
    return rows, rows[-1]["date"]


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for row in rows:
            w.writerow({k: "" if row.get(k) is None else row[k] for k in fieldnames})
    tmp.replace(path)


def convert_fred_csv(text: str) -> tuple[list[dict], str]:
    rows: list[dict] = []
    reader = csv.DictReader(io.StringIO(text))
    # Column may be TB3MS or the series id; value column is usually the second field.
    for rec in reader:
        d = (rec.get("observation_date") or rec.get("DATE") or "").strip()
        v = None
        for key, val in rec.items():
            if key and key.upper() in {"DATE", "OBSERVATION_DATE"}:
                continue
            v = num(val)
            if v is not None:
                break
        if not d or v is None:
            continue
        rows.append({"date": d[:7], "TB3MS": v})
    if not rows:
        raise RuntimeError("no FRED TB3MS rows")
    return rows, rows[-1]["date"]


def convert_fred_table_html(html: str) -> tuple[list[dict], str]:
    """Parse FRED /data/TB3MS markdown-ish or HTML table rows."""
    rows: list[dict] = []
    for m in re.finditer(
        r"(?:\| |>)(\d{4}-\d{2}-\d{2})(?: \| |</t[dh]>\s*<t[dh][^>]*>)([0-9.]+)",
        html,
    ):
        rows.append({"date": m.group(1)[:7], "TB3MS": float(m.group(2))})
    if not rows:
        # Plain "DATE VALUE" lines
        for m in re.finditer(r"^(\d{4}-\d{2}-\d{2})\s+([0-9.]+)\s*$", html, re.M):
            rows.append({"date": m.group(1)[:7], "TB3MS": float(m.group(2))})
    if not rows:
        raise RuntimeError("no FRED TB3MS rows from table page")
    # de-dupe keep order
    seen = set()
    uniq = []
    for r in rows:
        if r["date"] in seen:
            continue
        seen.add(r["date"])
        uniq.append(r)
    return uniq, uniq[-1]["date"]


def fetch_fred() -> tuple[list[dict], str, bytes, str]:
    """Return (rows, end_month, raw_bytes_for_hash, source_note)."""
    try:
        raw = fetch(FRED_CSV_URL, timeout=90)
        rows, end = convert_fred_csv(raw.decode("utf-8"))
        return rows, end, raw, f"CSV {FRED_CSV_URL}"
    except Exception as csv_exc:  # noqa: BLE001
        print(f"FRED CSV failed ({csv_exc}); trying table page…", flush=True)
        raw = fetch(FRED_TABLE_URL, timeout=90)
        rows, end = convert_fred_table_html(raw.decode("utf-8", "replace"))
        return rows, end, raw, f"table page {FRED_TABLE_URL} (CSV timed out: {csv_exc})"


def convert_ken_french(zdata: bytes) -> tuple[list[dict], str]:
    with zipfile.ZipFile(io.BytesIO(zdata)) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith(".csv") or "Fact" in n]
        if not names:
            names = zf.namelist()
        raw = zf.read(names[0]).decode("latin-1")
    lines = raw.splitlines()
    # Skip header until line that starts with a year-like token or "Mkt-RF"
    start = 0
    for i, line in enumerate(lines):
        if line.strip().startswith("Mkt-RF") or ",Mkt-RF" in line:
            start = i
            break
        if re.match(r"^\s*\d{6}", line):
            start = i
            break
    rows: list[dict] = []
    # Detect if header row
    header = lines[start]
    has_header = "Mkt" in header
    body = lines[start + 1 :] if has_header else lines[start:]
    for line in body:
        line = line.strip()
        if not line or line.startswith("Annual") or not re.match(r"^\d{6}", line):
            if rows and (not line or line.startswith("Annual")):
                break
            continue
        parts = re.split(r"[\s,]+", line)
        if len(parts) < 2:
            continue
        yyyymm = parts[0]
        if len(yyyymm) != 6:
            continue
        mkt = num(parts[1])
        if mkt is None:
            continue
        # Ken French factors are percent; convert to decimal total-ish market excess…
        # Spec: "市场因子月度总回报" — Mkt-RF is excess; need RF too for total.
        rf = num(parts[4]) if len(parts) > 4 else None
        if rf is None:
            continue
        total = (mkt + rf) / 100.0  # percent → decimal total market return
        rows.append(
            {
                "date": f"{yyyymm[:4]}-{yyyymm[4:6]}",
                "mkt_rf": mkt / 100.0,
                "rf": rf / 100.0,
                "mkt_total": total,
            }
        )
    if not rows:
        raise RuntimeError("no Ken French monthly rows")
    return rows, rows[-1]["date"]


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    downloaded = date.today().isoformat()
    sources: list[str] = [
        "# SP500 allocation backtest data sources",
        "",
        f"- Download date (UTC date local): {downloaded}",
        f"- Generated by: scripts/sp500-backtest-fetch.py",
        "",
    ]

    shiller_url, shiller_note = discover_shiller_url()
    print(f"Shiller URL: {shiller_url} ({shiller_note})", flush=True)
    xls = fetch(shiller_url)
    xls_path = TMP / "ie_data.xls"
    xls_path.write_bytes(xls)
    digest = sha256_bytes(xls)
    rows, end_month = convert_shiller(xls_path)
    write_csv(OUT / "shiller.csv", ["date", "P", "D", "E", "CPI"], rows)
    sources += [
        "## Shiller ie_data.xls",
        f"- URL: {shiller_url}",
        f"- Note: {shiller_note}",
        f"- sha256: {digest}",
        f"- Rows: {len(rows)}; end month: {end_month}",
        f"- Sheet: Data; data starts at row index 8; cols Date,P,D,E,CPI",
        "",
    ]
    print(f"Shiller → {len(rows)} rows through {end_month}", flush=True)

    print("FRED TB3MS…", flush=True)
    fred_rows, fred_end, fred_bytes, fred_note = fetch_fred()
    write_csv(OUT / "fred-tb3ms.csv", ["date", "TB3MS"], fred_rows)
    # Hash the committed CSV (deterministic) plus note the transport used.
    csv_bytes = (OUT / "fred-tb3ms.csv").read_bytes()
    sources += [
        "## FRED TB3MS",
        f"- Preferred URL: {FRED_CSV_URL}",
        f"- Actual source: {fred_note}",
        f"- sha256 (raw response): {sha256_bytes(fred_bytes)}",
        f"- sha256 (committed CSV): {sha256_bytes(csv_bytes)}",
        f"- Rows: {len(fred_rows)}; end month: {fred_end}",
        "",
    ]
    print(f"FRED → {len(fred_rows)} rows through {fred_end} via {fred_note}", flush=True)

    kf_ok = False
    kf_note = "skipped"
    try:
        print("Ken French factors (one attempt)…", flush=True)
        zdata = fetch(KF_URL, timeout=45)
        kf_rows, kf_end = convert_ken_french(zdata)
        write_csv(
            OUT / "ken-french-mkt.csv",
            ["date", "mkt_rf", "rf", "mkt_total"],
            kf_rows,
        )
        sources += [
            "## Ken French F-F Research Data Factors",
            f"- URL: {KF_URL}",
            f"- sha256: {sha256_bytes(zdata)}",
            f"- Rows: {len(kf_rows)}; end month: {kf_end}",
            "",
        ]
        kf_ok = True
        kf_note = f"ok through {kf_end}"
        print(f"Ken French → {len(kf_rows)} rows through {kf_end}", flush=True)
    except (urllib.error.URLError, TimeoutError, OSError, RuntimeError) as exc:
        kf_note = f"unavailable: {exc}"
        sources += [
            "## Ken French F-F Research Data Factors",
            f"- URL: {KF_URL}",
            f"- Status: SKIPPED — {exc}",
            "",
        ]
        print(f"Ken French skipped: {exc}", flush=True)

    sources += [
        "## Notes",
        "- Raw xls kept outside repo (TMPDIR); only CSVs committed.",
        f"- Ken French: {kf_note}",
        f"- Fetch finished at {datetime.now(timezone.utc).isoformat()}",
        "",
    ]
    (OUT / "SOURCES.md").write_text("\n".join(sources), encoding="utf-8")
    print(f"Wrote {OUT / 'SOURCES.md'}; ken_french={kf_ok}", flush=True)
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        _selftest_parse_shiller_date()
        print("parse_shiller_date self-test ok", flush=True)
        sys.exit(0)
    sys.exit(main())
