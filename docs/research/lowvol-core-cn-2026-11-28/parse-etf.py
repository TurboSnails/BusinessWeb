import json, sys, re, hashlib, os, datetime
tmp, out, codes = sys.argv[1], sys.argv[2], sys.argv[3:]
keep = ['FCODE', 'SHORTNAME', 'FTYPE', 'ESTABDATE', 'INDEXCODE', 'INDEXNAME', 'ENDNAV', 'FEGMRQ', 'JJGS']
res = []
for c in codes:
    b1 = open(f'{tmp}/{c}.info.json', 'rb').read(); b2 = open(f'{tmp}/{c}.fee.html', 'rb').read()
    d = (json.loads(b1) or {}).get('Datas') or {}
    t = re.sub(r'\|+', '|', re.sub(r'<[^>]+>', '|', b2.decode('utf-8', 'ignore')))
    fee = lambda k: (re.search(k + r'\|([^|]+)\|', t) or [None, None])[1]
    res.append({**{k: d.get(k) for k in keep}, 'mgmtFee': fee('管理费率'), 'custodyFee': fee('托管费率'), 'serviceFee': fee('销售服务费率'),
                'src': [{'url': f'https://fundmobapi.eastmoney.com/FundMNewApi/FundMNNBasicInformation?FCODE={c}&deviceid=Wap&plat=Wap&product=EFund&version=6.5.5', 'sha256': hashlib.sha256(b1).hexdigest()},
                        {'url': f'https://fundf10.eastmoney.com/jjfl_{c}.html', 'sha256': hashlib.sha256(b2).hexdigest()}],
                'fetchedAt': datetime.datetime.fromtimestamp(os.path.getmtime(f'{tmp}/{c}.info.json')).astimezone().isoformat()})
json.dump(res, open(out, 'w'), ensure_ascii=False, indent=1)
for r in res:
    nav = r['ENDNAV']; nav = f"{float(nav)/1e8:.1f}亿" if nav not in (None, '--', '') else '--'
    print(r['FCODE'], r['SHORTNAME'], r['ESTABDATE'], r['INDEXCODE'], r['INDEXNAME'], nav, r['FEGMRQ'], r['mgmtFee'], r['custodyFee'], r['serviceFee'])
