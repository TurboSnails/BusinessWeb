#!/usr/bin/env python3
"""Download Shiller / FRED / Ken French sources and write CSV under data-raw/sp500-backtest/.

Run with an external venv that has xlrd, e.g.:
  python3 -m venv "$TMPDIR/sp500-venv" && "$TMPDIR/sp500-venv/bin/pip" install xlrd
  "$TMPDIR/sp500-venv/bin/python" -I scripts/sp500-backtest-fetch.py

Does not write the raw xls into the repo; only converted CSVs + SOURCES.md.

v2 additions: Shiller GS10 column; Z.1 / GDP / Tobin / GVA FRED series with units
multipliers (to millions of USD) recorded in SOURCES.md.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
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
# Frozen URL recorded in SOURCES.md (sha256 98a549…). Prefer this when still available.
SHILLER_PINNED = (
    "https://img1.wsimg.com/blobby/go/e5e77e0b-59d1-44d9-ab25-4763ac982e53/"
    "downloads/1449043e-a1ed-4e2e-8e9c-7b9a2a064493/ie_data.xls?ver=1791297298731"
)
SHILLER_PINNED_SHA = "98a54927942e842ec07ffe73000998e793953708c345b6b27bb363e9ada8366a"
FRED_CSV_TMPL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={id}"
FRED_SERIES_TMPL = "https://fred.stlouisfed.org/series/{id}"
FRED_TB3MS_CSV = FRED_CSV_TMPL.format(id="TB3MS")
FRED_TABLE_URL = "https://fred.stlouisfed.org/data/TB3MS"
KF_URL = (
    "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/"
    "ftp/F-F_Research_Data_Factors_CSV.zip"
)

# FRED series for v2 (levels → convert to millions of USD when applicable).
# TB3MS stays percent (no millions conversion).
FRED_LEVEL_SERIES = [
    "NCBEILQ027S",
    "FBCELLQ027S",
    "FGSDODNS",
    "CMDEBT",
    "BCNSDODNS",
    "DODFFSWCMI",
    "SLGSDODNS",
    "NCBCEL",
    "GDP",
    "BOGZ1FL105015005Q",
    "A455RC1Q027SBEA",
]

# Hard-coded fallback if series page scrape fails (verified 2026-11-15 from FRED pages).
# Source: https://fred.stlouisfed.org/series/<ID> Units: meta.
FRED_UNITS_FALLBACK: dict[str, str] = {
    "NCBEILQ027S": "Millions of U.S. Dollars",
    "FBCELLQ027S": "Millions of U.S. Dollars",
    "FGSDODNS": "Millions of U.S. Dollars",
    "CMDEBT": "Millions of U.S. Dollars",
    "BCNSDODNS": "Millions of U.S. Dollars",
    "DODFFSWCMI": "Millions of U.S. Dollars",
    "SLGSDODNS": "Millions of U.S. Dollars",
    "NCBCEL": "Millions of U.S. Dollars",
    "GDP": "Billions of Dollars",
    "BOGZ1FL105015005Q": "Millions of U.S. Dollars",
    "A455RC1Q027SBEA": "Billions of Dollars",
    "TB3MS": "Percent",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(url: str, timeout: float = 60, http11: bool = False) -> bytes:
    """Fetch URL. For FRED, prefer curl --http1.1 via subprocess when http11=True."""
    if http11:
        import subprocess

        r = subprocess.run(
            [
                "curl",
                "-sS",
                "--http1.1",
                "-L",
                "--max-time",
                str(int(timeout)),
                "-A",
                "BusinessWeb-sp500-backtest/2.0 (research; local)",
                url,
            ],
            check=False,
            capture_output=True,
        )
        if r.returncode != 0:
            raise urllib.error.URLError(
                f"curl failed rc={r.returncode}: {r.stderr.decode('utf-8', 'replace')[:200]}"
            )
        return r.stdout
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "BusinessWeb-sp500-backtest/2.0 (research; local)"},
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
        gs10 = num(sheet.cell_value(r, 6))  # Rate GS10
        if p is None or cpi is None:
            continue
        rows.append({"date": d, "P": p, "D": div, "E": e, "CPI": cpi, "GS10": gs10})
    if not rows:
        raise RuntimeError("no Shiller data rows parsed")
    return rows, rows[-1]["date"]


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    # Always LF so committed sha256 matches SOURCES (core.autocrlf=input).
    with tmp.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        for row in rows:
            w.writerow({k: "" if row.get(k) is None else row[k] for k in fieldnames})
    tmp.replace(path)


def convert_fred_csv(text: str, value_key: str) -> tuple[list[dict], str]:
    rows: list[dict] = []
    reader = csv.DictReader(io.StringIO(text))
    for rec in reader:
        d = (rec.get("observation_date") or rec.get("DATE") or "").strip()
        v = None
        for key, val in rec.items():
            if key and key.upper() in {"DATE", "OBSERVATION_DATE"}:
                continue
            v = num(val)
            if v is not None:
                break
        if not d:
            continue
        # Keep empty observations as missing (None) so quarterly gaps stay explicit.
        rows.append({"date": d[:7], value_key: v})
    if not rows:
        raise RuntimeError(f"no FRED rows for {value_key}")
    # de-dupe keep last
    by: dict[str, dict] = {}
    for r in rows:
        by[r["date"]] = r
    ordered = [by[k] for k in sorted(by)]
    return ordered, ordered[-1]["date"]


def convert_fred_table_html(html: str) -> tuple[list[dict], str]:
    """Parse FRED /data/TB3MS markdown-ish or HTML table rows."""
    rows: list[dict] = []
    for m in re.finditer(
        r"(?:\| |>)(\d{4}-\d{2}-\d{2})(?: \| |</t[dh]>\s*<t[dh][^>]*>)([0-9.]+)",
        html,
    ):
        rows.append({"date": m.group(1)[:7], "TB3MS": float(m.group(2))})
    if not rows:
        for m in re.finditer(r"^(\d{4}-\d{2}-\d{2})\s+([0-9.]+)\s*$", html, re.M):
            rows.append({"date": m.group(1)[:7], "TB3MS": float(m.group(2))})
    if not rows:
        raise RuntimeError("no FRED TB3MS rows from table page")
    seen = set()
    uniq = []
    for r in rows:
        if r["date"] in seen:
            continue
        seen.add(r["date"])
        uniq.append(r)
    return uniq, uniq[-1]["date"]


def fetch_fred_tb3ms() -> tuple[list[dict], str, bytes, str]:
    """Return (rows, end_month, raw_bytes_for_hash, source_note)."""
    try:
        raw = fetch(FRED_TB3MS_CSV, timeout=90, http11=True)
        rows, end = convert_fred_csv(raw.decode("utf-8"), "TB3MS")
        # Drop null-valued months for TB3MS (monthly rate series).
        rows = [r for r in rows if r.get("TB3MS") is not None]
        return rows, end, raw, f"CSV {FRED_TB3MS_CSV}"
    except Exception as csv_exc:  # noqa: BLE001
        print(f"FRED CSV failed ({csv_exc}); trying table page…", flush=True)
        raw = fetch(FRED_TABLE_URL, timeout=90)
        rows, end = convert_fred_table_html(raw.decode("utf-8", "replace"))
        return rows, end, raw, f"table page {FRED_TABLE_URL} (CSV timed out: {csv_exc})"


def parse_fred_units(html: str) -> str | None:
    m = re.search(
        r'series-meta-label[^>]*>\s*Units:\s*</p>\s*<div[^>]*>\s*'
        r'<span class="series-meta-value"[^>]*>\s*'
        r'<span class="series-meta-value"[^>]*>([^<]+)',
        html,
    )
    if m:
        return m.group(1).strip()
    m = re.search(r"Units:</p>\s*<div[^>]*>.*?series-meta-value[^>]*>([^<]+)", html, re.S)
    if m:
        return m.group(1).strip()
    return None


def units_to_millions_multiplier(units: str) -> int:
    """Map FRED units string → multiply raw value to get millions of USD.

    Non Millions/Billions level units raise (Percent etc. must not use this).
    """
    u = units.strip().lower()
    if u.startswith("millions"):
        return 1
    if u.startswith("billions"):
        return 1000
    raise RuntimeError(f"unsupported FRED units for millions conversion: {units!r}")


def fetch_fred_series(series_id: str) -> dict:
    """Download one FRED series CSV + units metadata."""
    page_url = FRED_SERIES_TMPL.format(id=series_id)
    csv_url = FRED_CSV_TMPL.format(id=series_id)
    units = None
    units_src = "fallback table in fetch script (verified 2026-11-15)"
    try:
        page = fetch(page_url, timeout=45, http11=True).decode("utf-8", "replace")
        units = parse_fred_units(page)
        if units:
            units_src = f"FRED series page {page_url}"
    except Exception as exc:  # noqa: BLE001
        print(f"  units page failed for {series_id}: {exc}", flush=True)
    if not units:
        units = FRED_UNITS_FALLBACK.get(series_id)
        if not units:
            raise RuntimeError(f"no units for {series_id}")
    if series_id == "TB3MS":
        mult = None
    else:
        mult = units_to_millions_multiplier(units)
    raw = fetch(csv_url, timeout=90, http11=True)
    rows, end = convert_fred_csv(raw.decode("utf-8"), series_id)
    return {
        "id": series_id,
        "units": units,
        "units_source": units_src,
        "multiplier_to_millions": mult,
        "rows": rows,
        "end": end,
        "raw": raw,
        "csv_url": csv_url,
    }


def convert_ken_french(zdata: bytes) -> tuple[list[dict], str]:
    with zipfile.ZipFile(io.BytesIO(zdata)) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith(".csv") or "Fact" in n]
        if not names:
            names = zf.namelist()
        raw = zf.read(names[0]).decode("latin-1")
    lines = raw.splitlines()
    start = 0
    for i, line in enumerate(lines):
        if line.strip().startswith("Mkt-RF") or ",Mkt-RF" in line:
            start = i
            break
        if re.match(r"^\s*\d{6}", line):
            start = i
            break
    rows: list[dict] = []
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
        rf = num(parts[4]) if len(parts) > 4 else None
        if rf is None:
            continue
        total = (mkt + rf) / 100.0
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


def _load_existing_pdecpi(path: Path) -> dict[str, tuple]:
    if not path.exists():
        return {}
    out = {}
    with path.open(newline="", encoding="utf-8") as f:
        for rec in csv.DictReader(f):
            out[rec["date"]] = (
                rec.get("P") or "",
                rec.get("D") or "",
                rec.get("E") or "",
                rec.get("CPI") or "",
            )
    return out


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    downloaded = date.today().isoformat()
    sources: list[str] = [
        "# SP500 allocation backtest data sources",
        "",
        f"- Download date (UTC date local): {downloaded}",
        f"- Generated by: scripts/sp500-backtest-fetch.py for Shiller + FRED levels; TB3MS may use CSV or table fallback",
        "",
    ]

    # --- Shiller (prefer pinned sha) ---
    xls = None
    shiller_url = SHILLER_PINNED
    shiller_note = "pinned URL matching SOURCES sha256 98a549…"
    try:
        print(f"Trying pinned Shiller URL…", flush=True)
        xls = fetch(shiller_url, timeout=120)
        if sha256_bytes(xls) != SHILLER_PINNED_SHA:
            print("Pinned URL hash mismatch; trying homepage latest…", flush=True)
            xls = None
    except Exception as exc:  # noqa: BLE001
        print(f"Pinned Shiller failed ({exc}); trying homepage…", flush=True)
        xls = None

    if xls is None:
        shiller_url, shiller_note = discover_shiller_url()
        print(f"Shiller URL: {shiller_url} ({shiller_note})", flush=True)
        xls = fetch(shiller_url, timeout=120)

    digest = sha256_bytes(xls)
    xls_path = TMP / "ie_data.xls"
    xls_path.write_bytes(xls)

    prev = _load_existing_pdecpi(OUT / "shiller.csv")
    rows, end_month = convert_shiller(xls_path)

    if digest != SHILLER_PINNED_SHA and prev:
        # New xls: must prove P/D/E/CPI unchanged vs committed CSV.
        mismatches = []
        for r in rows:
            old = prev.get(r["date"])
            if old is None:
                continue
            new = (
                "" if r["P"] is None else str(r["P"]),
                "" if r["D"] is None else str(r["D"]),
                "" if r["E"] is None else str(r["E"]),
                "" if r["CPI"] is None else str(r["CPI"]),
            )
            # Compare numerically when both parseable.
            for i, key in enumerate(("P", "D", "E", "CPI")):
                a, b = old[i], new[i]
                if a == b:
                    continue
                try:
                    if abs(float(a) - float(b)) < 1e-12:
                        continue
                except ValueError:
                    pass
                mismatches.append((r["date"], key, a, b))
                if len(mismatches) >= 5:
                    break
            if len(mismatches) >= 5:
                break
        if mismatches:
            raise SystemExit(
                "Shiller xls hash differs from pinned and P/D/E/CPI changed vs "
                f"existing shiller.csv; first mismatches: {mismatches}. Ask manager."
            )

    write_csv(OUT / "shiller.csv", ["date", "P", "D", "E", "CPI", "GS10"], rows)
    csv_sha = sha256_bytes((OUT / "shiller.csv").read_bytes())
    sources += [
        "## Shiller ie_data.xls",
        f"- URL: {shiller_url}",
        f"- Note: {shiller_note}",
        f"- sha256 (raw xls, not in repo): {digest}",
        f"- sha256 (committed shiller.csv): {csv_sha}",
        f"- Rows: {len(rows)}; end month: {end_month}",
        f"- Sheet: Data; data starts at row index 8; cols Date,P,D,E,CPI + col6 Rate GS10",
        "- Committed file: shiller.csv (columns date,P,D,E,CPI,GS10)",
        "",
    ]
    print(f"Shiller → {len(rows)} rows through {end_month} (GS10 included)", flush=True)

    # --- FRED TB3MS ---
    print("FRED TB3MS…", flush=True)
    # Preserve existing TB3MS if fetch fails (v1 hand-written fallback).
    try:
        fred_rows, fred_end, fred_bytes, fred_note = fetch_fred_tb3ms()
        write_csv(OUT / "fred-tb3ms.csv", ["date", "TB3MS"], fred_rows)
        csv_bytes = (OUT / "fred-tb3ms.csv").read_bytes()
        sources += [
            "## FRED TB3MS",
            f"- Preferred URL: {FRED_TB3MS_CSV}",
            f"- Actual source: {fred_note}",
            f"- Units: Percent (no millions conversion)",
            f"- Units source: {FRED_UNITS_FALLBACK['TB3MS']} / series page",
            f"- sha256 (raw response): {sha256_bytes(fred_bytes)}",
            f"- sha256 (committed CSV): {sha256_bytes(csv_bytes)}",
            f"- Rows: {len(fred_rows)}; end month: {fred_end}",
            "",
        ]
        print(f"FRED TB3MS → {len(fred_rows)} rows through {fred_end}", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"FRED TB3MS fetch failed ({exc}); keeping existing CSV if present", flush=True)
        if not (OUT / "fred-tb3ms.csv").exists():
            raise
        sources += [
            "## FRED TB3MS",
            f"- Status: kept existing CSV (fetch failed: {exc})",
            f"- sha256 (committed CSV): {sha256_bytes((OUT / 'fred-tb3ms.csv').read_bytes())}",
            "",
        ]

    # --- FRED level series (Z.1 / GDP / Tobin / GVA) ---
    units_table: list[dict] = []
    print("FRED level series…", flush=True)
    for sid in FRED_LEVEL_SERIES:
        print(f"  {sid}…", flush=True)
        meta = fetch_fred_series(sid)
        out_name = f"fred-{sid.lower()}.csv"
        write_csv(OUT / out_name, ["date", sid], meta["rows"])
        csv_b = (OUT / out_name).read_bytes()
        non_null = sum(1 for r in meta["rows"] if r.get(sid) is not None)
        sources += [
            f"## FRED {sid}",
            f"- Preferred URL: {meta['csv_url']}",
            f"- Series page: {FRED_SERIES_TMPL.format(id=sid)}",
            f"- Units (raw): {meta['units']}",
            f"- Units source: {meta['units_source']}",
            f"- Multiplier to millions of USD: {meta['multiplier_to_millions']}",
            f"- sha256 (raw CSV response): {sha256_bytes(meta['raw'])}",
            f"- sha256 (committed CSV): {sha256_bytes(csv_b)}",
            f"- Rows: {len(meta['rows'])} (non-null={non_null}); end month: {meta['end']}",
            f"- Committed file: {out_name}",
            "",
        ]
        units_table.append(
            {
                "id": sid,
                "units": meta["units"],
                "multiplier_to_millions": meta["multiplier_to_millions"],
                "units_source": meta["units_source"],
                "download_source": meta["csv_url"] + " via curl --http1.1",
                "sha256": sha256_bytes(csv_b),
                "rows": len(meta["rows"]),
                "non_null": non_null,
                "file": out_name,
            }
        )
        print(
            f"  {sid} → {len(meta['rows'])} rows, units={meta['units']}, "
            f"×{meta['multiplier_to_millions']}",
            flush=True,
        )

    sources += [
        "## FRED units → millions (summary)",
        "",
        "| ID | Units | × to millions | Units source |",
        "|---|---|---:|---|",
    ]
    for u in units_table:
        sources.append(
            f"| {u['id']} | {u['units']} | {u['multiplier_to_millions']} | {u['units_source']} |"
        )
    sources.append("")
    (OUT / "fred-units.json").write_text(
        json.dumps(units_table, indent=2) + "\n", encoding="utf-8"
    )
    sources += [
        "- Machine-readable copy: fred-units.json (generated by this script)",
        "",
    ]

    # --- Ken French (optional) ---
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
        "- Raw xls kept outside repo ($TMPDIR); only CSVs committed.",
        "- Re-run with xlrd venv: `$TMPDIR/sp500-venv/bin/python -I scripts/sp500-backtest-fetch.py`",
        "- FRED downloads use `curl --http1.1` (HTTP/2 often stalls on this host).",
        "- Z.1 / GDP level series: script converts via units multiplier; non Millions/Billions → hard fail.",
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
        assert units_to_millions_multiplier("Millions of U.S. Dollars") == 1
        assert units_to_millions_multiplier("Billions of Dollars") == 1000
        try:
            units_to_millions_multiplier("Percent")
            raise AssertionError("Percent should fail")
        except RuntimeError:
            pass
        print("self-test ok", flush=True)
        sys.exit(0)
    sys.exit(main())
