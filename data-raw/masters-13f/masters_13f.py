"""从 SEC EDGAR 13F-HR 原始信息表筛选"长期持有"的股票。

口径：最新一期 13F 中占申报市值 >= 5%（期权行不计），且五年前同季度 13F 已持有
（按 CUSIP 前 6 位即发行人代码比对，同一公司不同类别股票合并）。

用法：python3 -I data-raw/masters-13f/masters_13f.py [--min 0.05]
SEC 要求 User-Agent 写明用途；这里用通用标识，不带个人信息。
"""
import json, sys, time, urllib.request, xml.etree.ElementTree as ET

UA = {'User-Agent': 'BusinessWeb-research admin@example.org'}
INVESTORS = [  # (显示名, CIK, 最新期末, 对照期末)
    ('巴菲特（伯克希尔）', '0001067983', '2026-09-30', '2021-09-30'),
    ('段永平（H&H）', '0001759760', '2026-09-30', '2021-09-30'),
    ('李录（喜马拉雅资本）', '0001709323', '2026-09-30', '2021-09-30'),
    ('阿克曼（潘兴广场）', '0001336528', '2026-03-31', '2021-03-31'),
    ('阿克雷（Akre Capital）', '0001112520', '2026-09-30', '2021-09-30'),
    ('特里·史密斯（Fundsmith）', '0001569205', '2026-09-30', '2021-09-30'),
]


def get(url):
    time.sleep(0.25)
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()


def filing(cik, period):
    sub = json.loads(get(f'https://data.sec.gov/submissions/CIK{cik}.json'))
    pages = [sub['filings']['recent']] + [json.loads(get('https://data.sec.gov/submissions/' + f['name'])) for f in sub['filings'].get('files', [])]
    for page in pages:
        for form, acc, rep in zip(page['form'], page['accessionNumber'], page['reportDate']):
            if form == '13F-HR' and rep == period:
                return acc
    return None


def holdings(cik, acc):
    """返回 {发行人 CUSIP 前 6 位: (名称, 占比)}，期权行不计。"""
    base = f'https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc.replace("-", "")}/'
    items = json.loads(get(base + 'index.json'))['directory']['item']
    xml = next(i['name'] for i in items if i['name'].endswith('.xml') and 'primary' not in i['name'].lower())
    rows = {}
    for it in ET.fromstring(get(base + xml)).iter():
        if not it.tag.endswith('infoTable'):
            continue
        field = lambda tag: [c for c in it.iter() if c.tag.endswith(tag)]
        if field('putCall'):
            continue
        key = field('cusip')[0].text[:6]
        name, value = field('nameOfIssuer')[0].text, float(field('value')[0].text)
        rows[key] = (name, rows.get(key, (name, 0))[1] + value)
    total = sum(v for _, v in rows.values())
    return {k: (n, v / total) for k, (n, v) in rows.items()}


def main():
    threshold = float(sys.argv[sys.argv.index('--min') + 1]) if '--min' in sys.argv else 0.05
    for who, cik, now, then in INVESTORS:
        latest, earlier = holdings(cik, filing(cik, now)), holdings(cik, filing(cik, then))
        print(f'== {who} {now}（对照 {then}）')
        for key, (name, weight) in sorted(latest.items(), key=lambda kv: -kv[1][1]):
            if weight >= threshold:
                print(f'  {weight * 100:5.1f}%  {name:34s} {"长期持有" if key in earlier else "五年前未持有"}')


if __name__ == '__main__':
    main()
