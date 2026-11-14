"""Download raw financial tables for the Lynch input generator (scripts/build-lynch-inputs.mjs).

Read-only. Each company is saved as one JSON file `<out>/<market>-<code>.<source>.json`
holding the provider rows untouched plus the call arguments and retrieval time, so every
generated number can be traced back to a dated provider response.

Sources (the original lynch.json evidence matches the EastMoney/Sina tables, see docs/data-maintenance.md):
  em-us   akshare.stock_financial_us_analysis_indicator_em(indicator='单季报')  US listings and ADRs (quarterly)
  em-us-y akshare.stock_financial_us_analysis_indicator_em(indicator='年报')    annual fallback (20-F filers)
  sina-cn akshare.stock_financial_abstract                                      A shares (cumulative report periods)
  em-hk   akshare.stock_financial_hk_analysis_indicator_em(indicator='报告期' + '年度')  HK (interim + annual)
  sec     SEC EDGAR XBRL companyfacts                                            US/ADR fallback (10-Q/10-K/20-F)
  yf      yfinance Ticker.income_stmt / balance_sheet（年报，第三方）                 last resort (e.g. HK REIT not covered by EastMoney)

Usage (akshare needs network; run under uv):
  uvx --python 3.12 --with akshare --with yfinance python scripts/fetch-lynch-financials.py --out DIR --keys us:AAPL,cn:688256,hk:02269
  ... --keys-file keys.txt --source em-us --sleep 1.5 --force
"""
import argparse, datetime as dt, json, math, sys, time, urllib.request
from pathlib import Path

UA = 'BusinessWeb research bot admin@example.com'  # SEC asks for a contact-style UA; generic, no personal data


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def clean(v):
    if v is None:
        return None
    if hasattr(v, 'isoformat'):
        return v.isoformat()[:10]
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if hasattr(v, 'item'):
        v = v.item()
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
    return v


def frame_rows(df):
    return [{str(k): clean(v) for k, v in row.items()} for row in df.to_dict(orient='records')]


def em_us_symbol(code):
    # EastMoney writes class shares with an underscore (BRK_B); plain tickers unchanged
    return code.replace('.', '_').replace('-', '_')


def fetch_em_us(code, indicator):
    import akshare as ak
    df = ak.stock_financial_us_analysis_indicator_em(symbol=em_us_symbol(code), indicator=indicator)
    return dict(tool='akshare.stock_financial_us_analysis_indicator_em', args={'symbol': em_us_symbol(code), 'indicator': indicator}, rows=frame_rows(df))


def fetch_sina_cn(code):
    import akshare as ak
    df = ak.stock_financial_abstract(symbol=code)
    # wide table: 选项/指标 rows × report-period columns → {period: {indicator: value}} keeping the first occurrence
    periods = {}
    for row in df.to_dict(orient='records'):
        name = row.get('指标')
        for col, val in row.items():
            if col in ('选项', '指标'):
                continue
            p = periods.setdefault(str(col), {})
            if name not in p:
                p[name] = clean(val)
    rows = [{'报告期': k, **v} for k, v in sorted(periods.items(), reverse=True)]
    return dict(tool='akshare.stock_financial_abstract', args={'symbol': code}, rows=rows)


def fetch_em_hk(code):
    # 「报告期」只回最近约 10 期（季报公司不足三个财年），再取「年度」补齐年报，按 报告期+类型 去重
    import akshare as ak
    rows, seen, errors = [], set(), []
    for indicator in ('报告期', '年度'):
        try:
            df = ak.stock_financial_hk_analysis_indicator_em(symbol=code, indicator=indicator)
        except Exception as e:
            errors.append(f'{indicator}: {type(e).__name__}: {e}'[:200])
            continue
        for row in frame_rows(df):
            k = (row.get('REPORT_DATE'), str(row.get('DATE_TYPE_CODE')))
            if k not in seen:
                seen.add(k)
                rows.append(row)
        time.sleep(0.6)
    if not rows and errors:
        raise RuntimeError('; '.join(errors))
    return dict(tool='akshare.stock_financial_hk_analysis_indicator_em', args={'symbol': code, 'indicator': ['报告期', '年度']}, rows=rows, errors=errors)


_SEC_TICKERS = None


def fetch_sec(code):
    global _SEC_TICKERS
    if _SEC_TICKERS is None:
        req = urllib.request.Request('https://www.sec.gov/files/company_tickers.json', headers={'User-Agent': UA})
        _SEC_TICKERS = {v['ticker']: v['cik_str'] for v in json.load(urllib.request.urlopen(req, timeout=60)).values()}
    cik = _SEC_TICKERS.get(code.replace('.', '-'))
    if not cik:
        raise RuntimeError(f'no SEC CIK for {code}')
    url = f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json'
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'identity'})
    data = json.load(urllib.request.urlopen(req, timeout=120))
    keep = {
        'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax',
        'SalesRevenueNet', 'GrossProfit', 'CostOfRevenue', 'CostOfGoodsAndServicesSold', 'NetIncomeLoss', 'ProfitLoss',
        'EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'StockholdersEquity', 'Liabilities', 'Assets',
        'AssetsCurrent', 'LiabilitiesCurrent', 'LiabilitiesAndStockholdersEquity',
        # IFRS (20-F filers)
        'Revenue', 'ProfitLossAttributableToOwnersOfParent', 'DilutedEarningsLossPerShare', 'EquityAttributableToOwnersOfParent',
        'CurrentAssets', 'CurrentLiabilities', 'CostOfSales',
    }
    facts = {}
    for ns, concepts in data.get('facts', {}).items():
        for name, body in concepts.items():
            if name in keep:
                facts[f'{ns}:{name}'] = body.get('units', {})
    return dict(tool='sec.companyfacts', args={'cik': cik, 'url': url}, rows=[], entityName=data.get('entityName'), facts=facts)


def yf_symbol(key):
    market, code = key.split(':', 1)
    if market == 'cn':
        return code + ('.BJ' if code.startswith(('92', '8', '4')) else '.SS' if code.startswith(('6', '9')) else '.SZ')
    if market == 'hk':
        return code.lstrip('0').zfill(4) + '.HK'
    return code.replace('.', '-')


def fetch_yf(key):
    import yfinance as yf
    sym = yf_symbol(key)
    t = yf.Ticker(sym)
    inc, bal = t.income_stmt, t.balance_sheet
    pick = lambda df, names, col: next((clean(df.at[n, col]) for n in names if n in df.index and clean(df.at[n, col]) is not None), None)
    rows = []
    for col in sorted(set(inc.columns) | set(bal.columns), reverse=True):
        rows.append({
            'end': clean(col),
            'revenue': pick(inc, ['Total Revenue', 'Operating Revenue'], col) if col in inc.columns else None,
            'grossProfit': pick(inc, ['Gross Profit'], col) if col in inc.columns else None,
            'netIncome': pick(inc, ['Net Income Common Stockholders', 'Net Income'], col) if col in inc.columns else None,
            'eps': pick(inc, ['Diluted EPS', 'Basic EPS'], col) if col in inc.columns else None,
            'assets': pick(bal, ['Total Assets'], col) if col in bal.columns else None,
            'liabilities': pick(bal, ['Total Liabilities Net Minority Interest'], col) if col in bal.columns else None,
            'currentAssets': pick(bal, ['Current Assets'], col) if col in bal.columns else None,
            'currentLiabilities': pick(bal, ['Current Liabilities'], col) if col in bal.columns else None,
            'equity': pick(bal, ['Stockholders Equity', 'Common Stock Equity'], col) if col in bal.columns else None,
        })
    info = {}
    try:
        info = {k: t.info.get(k) for k in ('financialCurrency', 'currency')}
    except Exception:
        pass
    return dict(tool='yfinance.Ticker.income_stmt+balance_sheet', args={'symbol': sym, 'frequency': 'annual'}, rows=rows, **info)


def default_source(key):
    market = key.split(':')[0]
    return {'cn': 'sina-cn', 'hk': 'em-hk'}.get(market, 'em-us')


def run_one(key, source):
    market, code = key.split(':', 1)
    if source == 'em-us':
        return fetch_em_us(code, '单季报')
    if source == 'em-us-y':
        return fetch_em_us(code, '年报')
    if source == 'sina-cn':
        return fetch_sina_cn(code)
    if source == 'em-hk':
        return fetch_em_hk(code)
    if source == 'sec':
        return fetch_sec(code)
    if source == 'yf':
        return fetch_yf(key)
    raise ValueError(source)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--out', required=True)
    p.add_argument('--keys', default='')
    p.add_argument('--keys-file')
    p.add_argument('--source', default='auto', choices=['auto', 'em-us', 'em-us-y', 'sina-cn', 'em-hk', 'sec', 'yf'])
    p.add_argument('--sleep', type=float, default=1.2, help='pause between provider calls (throttle)')
    p.add_argument('--force', action='store_true')
    a = p.parse_args()
    keys = [k.strip() for k in a.keys.split(',') if k.strip()]
    if a.keys_file:
        keys += [l.strip() for l in Path(a.keys_file).read_text().splitlines() if l.strip() and not l.startswith('#')]
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    failures = 0
    for key in keys:
        source = default_source(key) if a.source == 'auto' else a.source
        market, code = key.split(':', 1)
        path = out / f'{market}-{code}.{source}.json'
        if path.exists() and not a.force:
            continue
        began = now()
        try:
            body = run_one(key, source)
            ok = bool(body.get('rows') or body.get('facts'))
            payload = dict(key=key, source=source, requestedAt=began, retrievedAt=now(), **body)
            if ok:
                path.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False) + '\n')
            else:
                failures += 1
            print(json.dumps({'key': key, 'source': source, 'ok': ok, 'rows': len(body.get('rows') or []), 'facts': len(body.get('facts') or {})}, ensure_ascii=False), flush=True)
        except Exception as e:  # keep going; the generator reports missing sources explicitly
            failures += 1
            print(json.dumps({'key': key, 'source': source, 'ok': False, 'error': f'{type(e).__name__}: {e}'[:300]}, ensure_ascii=False), flush=True)
        time.sleep(a.sleep)
    sys.exit(0 if failures == 0 else 2)


if __name__ == '__main__':
    main()
