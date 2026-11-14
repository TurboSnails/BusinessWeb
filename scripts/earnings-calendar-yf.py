"""Yahoo Finance (yfinance) collector for the earnings preview page (public/data/earnings-calendar.json).

Called by scripts/earnings-calendar.mjs; not meant to be run on its own except for debugging:
  uv run --python 3.12 --with yfinance==1.8.0 python scripts/earnings-calendar-yf.py request.json > out.json

Input (request.json): {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "us": ["NVDA", ...], "hk": ["0700.HK", ...], "deep": ["AAPL", ...]}
  us   : Yahoo symbols of US-listed library companies (S&P 500 / NDX / ADR). Only those that appear in Yahoo's
         earnings calendar inside [start, end] (plus `deep`) get the per-ticker pass.
  hk   : Yahoo symbols of HK library companies. Each gets a light calendar check; those inside the window get the per-ticker pass.
  deep : extra symbols that always get the per-ticker pass (e.g. last run's entries still inside the window).
Output (stdout, JSON): raw facts only -- no ranking, no judgement. Normalisation happens in the Node script.
Every request is isolated: one failing ticker/module records an error and the run continues.
Throttled (sequential, >= THROTTLE seconds between tickers) to stay polite to Yahoo.
"""
import datetime as dt
import json
import math
import sys
import time

import yfinance as yf

THROTTLE = 0.35
CAL_PAGE = 100
CAL_MAX_PAGES = 40
CAL_MIN_MCAP = 1e9  # Yahoo earnings calendar filter: market cap >= $1bn (library companies are all larger)


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else f


def iso(ts):
    if ts is None:
        return None
    try:
        if hasattr(ts, 'to_pydatetime'):
            ts = ts.to_pydatetime()
        if isinstance(ts, dt.datetime):
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=dt.timezone.utc)
            return ts.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        if isinstance(ts, dt.date):
            return ts.isoformat()
    except Exception:
        return None
    return None


def err(e):
    return (type(e).__name__ + ': ' + str(e))[:200]


def calendar_rows(start, end):
    """Yahoo earnings calendar (US listings) for [start, end], paginated."""
    cal = yf.Calendars(start=start, end=end)
    rows, seen = [], set()
    for page in range(CAL_MAX_PAGES):
        df = cal.get_earnings_calendar(market_cap=CAL_MIN_MCAP, filter_most_active=False, limit=CAL_PAGE, offset=page * CAL_PAGE, force=True)
        if df is None or len(df) == 0:
            break
        for sym, r in df.iterrows():
            key = (str(sym), iso(r.get('Event Start Date')))
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                'symbol': str(sym),
                'event': r.get('Event Name') if isinstance(r.get('Event Name'), str) and r.get('Event Name') != 'nan' else None,
                'start': iso(r.get('Event Start Date')),
                'timing': r.get('Timing') if isinstance(r.get('Timing'), str) and r.get('Timing') != 'nan' else None,
                'epsEstimate': num(r.get('EPS Estimate')),
                'epsActual': num(r.get('Reported EPS')),
                'surprisePct': num(r.get('Surprise(%)')),
                'marketCap': num(r.get('Marketcap')),
            })
        if len(df) < CAL_PAGE:
            break
        time.sleep(THROTTLE)
    return rows


def estimate_row(df, period='0q'):
    if df is None or len(df) == 0 or period not in df.index:
        return None
    r = df.loc[period]
    return {k: num(r.get(src)) for k, src in [('avg', 'avg'), ('low', 'low'), ('high', 'high'), ('analysts', 'numberOfAnalysts'), ('yearAgo', 'yearAgoEps' if 'yearAgoEps' in r else 'yearAgoRevenue')]} | {
        'currency': str(r.get('currency')) if r.get('currency') is not None else None}


def light(t):
    """Next earnings date(s) from Yahoo's calendarEvents module."""
    cal = t.calendar or {}
    dates = [iso(d) for d in (cal.get('Earnings Date') or []) if d is not None]
    return {'earningsDates': [d for d in dates if d], 'epsAvg': num(cal.get('Earnings Average')), 'revenueAvg': num(cal.get('Revenue Average'))}


def deep(t):
    out, errors = {}, []

    def grab(name, fn):
        try:
            out[name] = fn()
        except Exception as e:  # one module failing must not drop the rest
            errors.append(name + ': ' + err(e))

    def info():
        i = t.info or {}
        return {k: (i.get(k) if k in ('isEarningsDateEstimate', 'currency', 'financialCurrency') else num(i.get(k))) for k in
                ('earningsTimestamp', 'earningsTimestampStart', 'earningsTimestampEnd', 'earningsCallTimestampStart', 'isEarningsDateEstimate', 'marketCap', 'currency', 'financialCurrency')}

    def history():
        df = t.get_earnings_dates(limit=12)
        rows = []
        if df is None:
            return rows
        for ts, r in df.iterrows():
            rows.append({'date': iso(ts), 'epsEstimate': num(r.get('EPS Estimate')), 'epsActual': num(r.get('Reported EPS')), 'surprisePct': num(r.get('Surprise(%)'))})
        return rows

    def quarterly_revenue():
        df = t.quarterly_income_stmt
        if df is None or len(df) == 0 or 'Total Revenue' not in df.index:
            return []
        s = df.loc['Total Revenue']
        return [{'periodEnd': iso(c)[:10], 'value': num(v)} for c, v in s.items() if iso(c) and num(v) is not None]

    grab('info', info)
    grab('calendar', lambda: light(t))
    grab('eps0q', lambda: estimate_row(t.earnings_estimate))
    grab('rev0q', lambda: estimate_row(t.revenue_estimate))
    grab('history', history)
    grab('quarterlyRevenue', quarterly_revenue)
    out['errors'] = errors
    return out


def in_window(dates, start, end):
    return any(start <= (d or '')[:10] <= end for d in dates)


def main():
    req = json.load(open(sys.argv[1], encoding='utf-8'))
    start, end = req['start'], req['end']
    us, hk, extra = set(req.get('us') or []), list(req.get('hk') or []), list(req.get('deep') or [])
    result = {'fetchedAt': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'yfinance': yf.__version__,
              'calendar': {'ok': False, 'error': None, 'rows': []}, 'hkLight': {}, 'tickers': {}}
    try:
        rows = calendar_rows(start, end)
        result['calendar'] = {'ok': True, 'error': None, 'rows': [r for r in rows if r['symbol'] in us], 'scanned': len(rows)}
    except Exception as e:
        result['calendar']['error'] = err(e)

    deep_set = []
    for s in [r['symbol'] for r in result['calendar']['rows']] + extra:
        if s not in deep_set:
            deep_set.append(s)

    for sym in hk:
        try:
            info = light(yf.Ticker(sym))
            result['hkLight'][sym] = info
            if in_window(info['earningsDates'], start, end) and sym not in deep_set:
                deep_set.append(sym)
        except Exception as e:
            result['hkLight'][sym] = {'error': err(e)}
        time.sleep(THROTTLE)

    for sym in deep_set:
        try:
            result['tickers'][sym] = deep(yf.Ticker(sym))
        except Exception as e:
            result['tickers'][sym] = {'errors': [err(e)]}
        time.sleep(THROTTLE)
        print(f'[yf] {sym}', file=sys.stderr, flush=True)

    json.dump(result, sys.stdout, ensure_ascii=False, allow_nan=False, default=str)


if __name__ == '__main__':
    main()
