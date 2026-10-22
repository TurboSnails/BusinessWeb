"""Validate portable comprehensive equity valuation records. No third-party dependencies."""
import argparse
import json
import math
from datetime import date
from pathlib import Path


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def is_date(value):
    try:
        return isinstance(value, str) and date.fromisoformat(value).isoformat() == value
    except (ValueError, TypeError):
        return False


def validate(document, expected=None):
    errors = []
    if not isinstance(document, dict) or document.get('schemaVersion') != 1 or not is_date(document.get('asOf')) or not isinstance(document.get('records'), list):
        return ['invalid document: require schemaVersion=1, asOf date and records list']
    keys = []
    for i, r in enumerate(document['records']):
        prefix = f'record[{i}]'
        def fail(message):
            errors.append(f'{prefix}: {message}')
        if not isinstance(r, dict):
            fail('not an object')
            continue
        key = r.get('key')
        if key != f"{r.get('market')}:{r.get('code')}" or r.get('market') not in ['us', 'ndx', 'adr', 'hk', 'cn']:
            fail('invalid market:code key')
        keys.append(key)
        prefix = str(key)
        for field in ['name', 'currency', 'quality', 'pricing', 'expectations', 'risk']:
            if not isinstance(r.get(field), str) or not r[field].strip():
                fail(f'{field} missing')
        if r.get('asOf') != document['asOf']:
            fail('asOf differs from batch date')
        for field in ['assumptions', 'missing']:
            if not isinstance(r.get(field), list) or any(not isinstance(x, str) for x in r[field]):
                fail(f'{field} must be string list')
        sources = r.get('sources', [])
        if not isinstance(sources, list):
            fail('sources must be list')
            sources = []
        ids = set()
        for s in sources:
            if not isinstance(s, dict) or any(not isinstance(s.get(k), str) or not s[k].strip() for k in ['id', 'title', 'url']) or not is_date(s.get('asOf')):
                fail('invalid source (id/title/url/asOf)')
            else:
                if s['id'] in ids:
                    fail('duplicate source id')
                ids.add(s['id'])
        price = r.get('price')
        if not isinstance(price, dict):
            fail('missing price object')
        else:
            if price.get('currency') != r.get('currency'):
                fail('price currency mismatch')
            if price.get('value') is not None:
                if not finite(price['value']) or price['value'] <= 0 or not is_date(price.get('date')) or price.get('source') not in ids:
                    fail('invalid price, date or source')
            elif not r.get('missing'):
                fail('missing price requires missing explanation')
        status = r.get('status')
        if status not in ['conditional', 'reviewed', 'insufficient']:
            fail('invalid status')
        review = r.get('review', {})
        if not isinstance(review, dict) or review.get('mode') not in ['programmatic', 'company', 'independent'] or not review.get('by') or not review.get('note'):
            fail('review provenance missing')
        elif status == 'reviewed' and review['mode'] == 'programmatic':
            fail('programmatic cannot claim reviewed')
        value = r.get('value')
        if status == 'insufficient' and (value is not None or not r.get('missing')):
            fail('insufficient requires null value and concrete missing')
        methods = r.get('methods')
        if not isinstance(methods, list):
            fail('methods must be list')
            methods = []
        names = [m.get('name') for m in methods if isinstance(m, dict)]
        if not all(m in names for m in ['PE', 'PEG', 'PB']):
            fail('must assess PE, PEG and PB')
        if len(names) != len(set(names)):
            fail('duplicate method')
        for m in methods:
            if not isinstance(m, dict) or not isinstance(m.get('applicable'), bool) or not m.get('reason') or not isinstance(m.get('formula'), str) or not isinstance(m.get('inputs'), dict):
                fail('method definition incomplete')
                continue
            refs = m.get('sourceIds')
            if not isinstance(refs, list) or any(x not in ids for x in refs):
                fail('method source reference invalid')
            values = m.get('values')
            if values is not None:
                if not m['applicable'] or not refs or not isinstance(values, list) or len(values) != 3 or not all(finite(v) and v >= 0 for v in values) or values != sorted(values):
                    fail('method values invalid or unsourced')
        if value is not None:
            if not isinstance(value, dict):
                fail('value must be object or null')
                continue
            vals = [value.get(k) for k in ['low', 'base', 'high']]
            if not all(finite(v) and v >= 0 for v in vals) or vals != sorted(vals):
                fail('value range must be finite, nonnegative, ordered')
            kind, when = value.get('kind'), value.get('date')
            if kind == 'present':
                if when != r.get('asOf'):
                    fail('present value date mismatch')
            elif kind == 'future':
                if not is_date(when) or when <= r.get('asOf'):
                    fail('future date must be later than asOf')
            elif kind == 'undated':
                if when is not None:
                    fail('undated value must have null date')
            else:
                fail('invalid value kind')
            primary = next((m for m in methods if isinstance(m, dict) and m.get('name') == value.get('primaryMethod')), None)
            if not primary or primary.get('values') != vals:
                fail('value must equal selected primary method, not average')
            if status == 'insufficient':
                fail('insufficient cannot publish numeric value')
    if len(keys) != len(set(keys)):
        errors.append('duplicate security keys')
    if expected is not None:
        if set(keys) != set(expected):
            errors.append(f'coverage mismatch: missing={sorted(set(expected)-set(keys))[:15]}, extra={sorted(set(keys)-set(expected))[:15]}')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    parser.add_argument('--universe', type=Path, help='JSON list of {market,code}, or list of security keys')
    args = parser.parse_args()
    try:
        doc = json.loads(args.file.read_text())
        universe = json.loads(args.universe.read_text()) if args.universe else None
        expected = [x if isinstance(x, str) else f"{x['market']}:{x['code']}" for x in universe] if universe is not None else None
        errors = validate(doc, expected)
    except (ValueError, OSError, KeyError, TypeError) as exc:
        errors = [str(exc)]
    if errors:
        print('\n'.join(errors[:100]))
        raise SystemExit(1)
    counts = {}
    for r in doc['records']:
        counts[r['status']] = counts.get(r['status'], 0) + 1
    print(json.dumps({'ok': True, 'records': len(doc['records']), 'status': counts}, ensure_ascii=False))


if __name__ == '__main__':
    main()
