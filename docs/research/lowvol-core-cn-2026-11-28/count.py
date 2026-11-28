# 立项计数（只读宽基）：沪深 300 / 中证 800 / 中证全指的价格版与全收益版日收盘，数 ≥ 20% 回撤段；
# 另从中证 basic-info 文件读基日、发布日，算回填年数。不读任何候选指数的价格。
# 用法：python3 -I docs/research/lowvol-core-cn-2026-11-28/count.py  → 写出同目录 counts.json
import json, os, glob
from datetime import date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
RAW = os.path.join(ROOT, 'data-raw', 'lowvol-core-cn', 'raw')
OUT = os.path.join(os.path.dirname(__file__), 'counts.json')
BROAD = ['000300', 'H00300', '000906', 'H00906', '000985', 'H00985']
END = date(2026, 11, 27)
WINDOWS = {'全期': ('0000-00-00', '9999-99-99'), '红利低波发布后（2013-12-19 起）': ('2013-12-19', '9999-99-99'),
           'W1 主判定 2014-01-02 至 2023-10-31': ('2014-01-02', '2023-10-31'), 'W2 2023-11-01 起': ('2023-11-01', '9999-99-99')}


def load_csi(code):
    rows = {}
    for p in sorted(glob.glob(os.path.join(RAW, f'perf-{code}-full-*.json'))):
        try:
            data = json.load(open(p))['data']
        except Exception:
            continue
        start = os.path.basename(p).split('-full-')[1][:4] + '0101'
        for r in data:
            # 接口在查询起始日补一行（tradeDate == startDate，收盘价复制首个真实交易日），剔除
            # 000300 价格版在接口里还有基日（2004-12-31）之前的 2004 年数据，统一从基日起算
            if r.get('close') and r['close'] > 0 and r['tradeDate'] != start and r['tradeDate'] >= '20041231':
                rows[r['tradeDate']] = r['close']
    return [(f'{t[:4]}-{t[4:6]}-{t[6:]}', c) for t, c in sorted(rows.items())]


def zigzag(s, th=0.20):
    """20% 交替峰谷：跌离运行高点 ≥ th 进入熊市；自运行低点反弹 ≥ th 才确认谷底、转牛。"""
    eps, state = [], 'bull'
    hi_d, hi = s[0]
    lo_d, lo = s[0]
    peak = None
    for d, c in s:
        if state == 'bull':
            if c > hi:
                hi_d, hi = d, c
            if c <= hi * (1 - th):
                state, peak, lo_d, lo = 'bear', (hi_d, hi), d, c
        else:
            if c < lo:
                lo_d, lo = d, c
            if c >= lo * (1 + th):
                eps.append({'peak': peak[0], 'trough': lo_d, 'depth': round(lo / peak[1] - 1, 3), 'confirmed': True})
                state, hi_d, hi = 'bull', d, c
    if state == 'bear':
        eps.append({'peak': peak[0], 'trough': lo_d, 'depth': round(lo / peak[1] - 1, 3), 'confirmed': False})
    return eps


def underwater(s, th=0.20):
    """回到前高才算一段结束；段内最深 ≥ th 才计。"""
    eps, inside = [], False
    hi_d, hi = s[0]
    lo_d, lo = s[0]
    for d, c in s:
        if c >= hi:
            if inside and lo / hi - 1 <= -th:
                eps.append({'peak': hi_d, 'trough': lo_d, 'depth': round(lo / hi - 1, 3), 'recovered': d})
            hi_d, hi, lo_d, lo, inside = d, c, d, c, False
        else:
            inside = True
            if c < lo:
                lo_d, lo = d, c
    if inside and lo / hi - 1 <= -th:
        eps.append({'peak': hi_d, 'trough': lo_d, 'depth': round(lo / hi - 1, 3), 'recovered': None})
    return eps


def in_window(eps, a, b):
    full = [e for e in eps if e['peak'] >= a and e['trough'] <= b and e['confirmed']]
    straddle = [e for e in eps if (e['peak'] < a <= e['trough']) or (e['peak'] <= b < e['trough'])]
    open_ = [e for e in eps if not e['confirmed'] and a <= e['peak'] <= b]
    return {'完整落在窗口内': len(full), '跨窗口边界': len(straddle), '未确认谷底': len(open_)}


def backfill():
    out = []
    for p in sorted(glob.glob(os.path.join(RAW, 'info-*.json'))):
        try:
            d = json.load(open(p)).get('data') or {}
        except Exception:
            continue
        if not d.get('basicDate') or not d.get('publishDate'):
            continue
        b, pub = date.fromisoformat(d['basicDate']), date.fromisoformat(d['publishDate'])
        tot, bf = (END - b).days / 365.25, (pub - b).days / 365.25
        out.append({'code': d['indexCode'], 'name': d['indexShortNameCn'], 'basicDate': d['basicDate'], 'publishDate': d['publishDate'],
                    'years': round(tot, 1), 'backfillYears': round(bf, 1), 'liveYears': round(tot - bf, 1), 'backfillShare': round(bf / tot, 2)})
    return out


res = {'note': '只数宽基回撤段与回填年数；不含任何候选指数的收益、波动或回撤。', 'series': {}, 'backfill': backfill()}
for code in BROAD:
    s = load_csi(code)
    if len(s) < 1000:
        res['series'][code] = {'error': f'rows={len(s)}'}
        continue
    z20, z30 = zigzag(s), zigzag(s, 0.30)
    res['series'][code] = {'start': s[0][0], 'end': s[-1][0], 'rows': len(s), 'years': round((date.fromisoformat(s[-1][0]) - date.fromisoformat(s[0][0])).days / 365.25, 1),
                           'zigzag20': z20, 'zigzag30': z30, 'underwater20': underwater(s),
                           'windows20': {k: in_window(z20, a, b) for k, (a, b) in WINDOWS.items()}}
json.dump(res, open(OUT, 'w'), ensure_ascii=False, indent=1)
for code, v in res['series'].items():
    if 'error' in v:
        print(code, v['error'])
        continue
    print(f"{code} {v['start']}→{v['end']} {v['years']}年 20%段 {len(v['zigzag20'])}（确认 {sum(e['confirmed'] for e in v['zigzag20'])}） 30%段 {len(v['zigzag30'])} 回到前高口径 {len(v['underwater20'])}")
    for e in v['zigzag20']:
        print('   ', e['peak'], '→', e['trough'], e['depth'], '' if e['confirmed'] else '未确认')
    print('   ', v['windows20'])
