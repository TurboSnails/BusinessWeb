# 重取 manifest.json 里 HTTP 非 200、或响应不是完整 JSON（下载被截断）的中证请求（curl，间隔 4 秒；遇 403 停 180 秒再试一次，仍失败则停止整个批次）。
import json, subprocess, hashlib, time, datetime, sys
OUT = sys.argv[1]
man = json.load(open(f'{OUT}/manifest.json'))
def ok(m):
    if m.get('http') != 200: return False
    try: json.load(open(f"{OUT}/{m['file']}")); return True
    except Exception: return False
for m in man:
    if ok(m): continue
    for attempt in range(2):
        p = f"{OUT}/{m['file']}"
        code = subprocess.run(['curl', '-s', '-m', '120', '-A', 'Mozilla/5.0', '-o', p, '-w', '%{http_code}', m['url']], capture_output=True, text=True).stdout
        try: json.load(open(p)); valid = True
        except Exception: valid = False
        if code == '200' and valid:
            buf = open(p, 'rb').read(); rows = start = end = None
            try:
                d = json.loads(buf).get('data')
                if isinstance(d, list):
                    ds = sorted(r['tradeDate'] for r in d if r.get('close') and r['close'] > 0); rows = len(ds); start = ds[0] if ds else None; end = ds[-1] if ds else None
            except Exception: pass
            m.update(http=200, fetchedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), bytes=len(buf), rows=rows, start=start, end=end, sha256=hashlib.sha256(buf).hexdigest())
            print(m['file'], 200, rows, start, end, flush=True); time.sleep(4); break
        print(m['file'], code, 'wait', flush=True)
        if attempt == 0: time.sleep(180)
        else:
            json.dump(man, open(f'{OUT}/manifest.json', 'w'), indent=1); sys.exit('blocked')
    json.dump(man, open(f'{OUT}/manifest.json', 'w'), indent=1)
