"""Yahoo Finance price collector.

Called as: uv run --python 3.12 --with yfinance==1.8.0 python scripts/portfolio-prices-yf.py
Reads {"symbols":[...],"start":"2010-01-01"} from stdin and writes raw facts as JSON to stdout.
Each ticker is isolated and throttled; this script must not be called from local acceptance runs.
"""
import json
import math
import sys
import time

import yfinance as yf

THROTTLE = 0.35


def number(value):
    try:
        out = float(value)
        return out if math.isfinite(out) else None
    except (TypeError, ValueError):
        return None


def main():
    request = json.load(sys.stdin)
    result = {}
    for i, symbol in enumerate(request.get("symbols", [])):
        if i:
            time.sleep(THROTTLE)
        try:
            frame = yf.Ticker(symbol).history(start=request.get("start", "2010-01-01"), auto_adjust=False, actions=True)
            rows, dividends, splits = [], [], []
            for date, row in frame.iterrows():
                day = date.date().isoformat()
                close, adjusted = number(row.get("Close")), number(row.get("Adj Close"))
                if close is not None and adjusted is not None:
                    rows.append([day, close, adjusted])
                dividend, split = number(row.get("Dividends")), number(row.get("Stock Splits"))
                if dividend:
                    dividends.append([day, dividend])
                if split:
                    splits.append([day, split])
            result[symbol] = {"rows": rows, "dividends": dividends, "splits": splits, "error": None}
        except Exception as exc:  # one failed ticker must not discard others
            result[symbol] = {"rows": [], "dividends": [], "splits": [], "error": f"{type(exc).__name__}: {exc}"[:200]}
    json.dump(result, sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
