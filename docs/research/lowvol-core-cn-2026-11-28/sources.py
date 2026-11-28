import json, os, hashlib, sys, glob, datetime
RAW = sys.argv[1]
L = []
man = json.load(open(f'{RAW}/manifest.json'))
em = json.load(open(f'{RAW}/manifest-em.json'))
etf = json.load(open(f'{RAW}/etf-meta.json'))
def fmt(t):
    return t if not t or len(t) != 8 else f'{t[:4]}-{t[4:6]}-{t[6:]}'
L.append('| 文件 | URL | 取数时间（UTC） | HTTP | 行数 | 起 | 止 | SHA-256 |')
L.append('|---|---|---|---|---:|---|---|---|')
for m in man:
    if 'error' in m: L.append(f"| `{m['file']}` | {m['url']} | — | 失败：{m['error']} | | | | |"); continue
    L.append(f"| `{m['file']}` | {m['url']} | {m.get('fetchedAt','')[:19]} | {m.get('http')} | {m.get('rows') if m.get('rows') is not None else '—'} | {fmt(m.get('start')) or '—'} | {fmt(m.get('end')) or '—'} | `{m.get('sha256')}` |")
csi = '\n'.join(L)
L = ['| 文件 | URL | 取数时间（UTC） | HTTP | 名称 | 行数 | 起 | 止 | SHA-256 |', '|---|---|---|---|---|---:|---|---|---|']
for m in em:
    L.append(f"| `{m['file']}` | {m['url']} | {m['fetchedAt'][:19]} | {m['http']} | {m['name'] or '（无数据）'} | {m['rows']} | {m['start'] or '—'} | {m['end'] or '—'} | `{m['sha256']}` |")
emt = '\n'.join(L)
L = ['| 代码 | 名称 | 跟踪指数 | 成立日 | 管理费 | 托管费 | 规模日期 | 资料接口 SHA-256 | 费率页 SHA-256 | 取数时间（本机 UTC+4） |', '|---|---|---|---|---|---|---|---|---|---|']
for r in etf:
    L.append(f"| {r['FCODE']} | {r['SHORTNAME']} | {r['INDEXCODE']} | {r['ESTABDATE']} | {r['mgmtFee']} | {r['custodyFee']} | {r['FEGMRQ']} | `{r['src'][0]['sha256'][:16]}…` | `{r['src'][1]['sha256'][:16]}…` | {r['fetchedAt'][:19]} |")
etft = '\n'.join(L)
L = ['| 文件 | URL | 取数时间（无 Z 的为本机时间 UTC+4） | 字节 | SHA-256 |', '|---|---|---|---:|---|']
for p in sorted(glob.glob(f'{RAW}/closeweight-*.xls') + glob.glob(f'{RAW}/cons-*.xls')):
    b = open(p, 'rb').read(); f = os.path.basename(p); code = f.split('-')[1][:-4]
    url = f"https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/{'closeweight' if f.startswith('closeweight') else 'cons'}/{code}{'closeweight' if f.startswith('closeweight') else 'cons'}.xls"
    L.append(f"| `{f}` | {url} | {datetime.datetime.fromtimestamp(os.path.getmtime(p)).astimezone().isoformat()[:19]} | {len(b)} | `{hashlib.sha256(b).hexdigest()}` |")
for f, url, t in [('info-N00300.json', 'https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/N00300', '2026-11-28T08:56:55Z'),
                  ('csi-stock-industry-20261030.json', 'https://www.csindex.com.cn/csindex-home/dataServer/queryCsiPeSecurity?tradeDate=20261030&classType=2', '2026-11-28T08:57:48Z')]:
    b = open(f'{RAW}/{f}', 'rb').read()
    L.append(f"| `{f}` | {url} | {t} | {len(b)} | `{hashlib.sha256(b).hexdigest()}` |")
xls = '\n'.join(L)
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
out = f"""# 数据来源：lowvol-core-cn（A 股防守核心立项调研）

2026-11-28 取数，供 `docs/research/lowvol-core-cn-2026-11-28/SCOPE.md` 使用。原始响应放在 `raw/`，**只留本机**（`raw/` 尚未写进 .gitignore，需要 manager 补一行 `data-raw/lowvol-core-cn/raw/`）。全部是公开、无需密钥的接口，没有发送任何个人信息；请求间隔：中证 1.5 秒（被 WAF 拦截后改为 4 秒并在 403 时暂停 3 分钟），东财 2–2.5 秒。

**范围说明（纪律）**：候选指数只取了基日起约一年的「首段」和 2026-11 的「末段」，用来核对覆盖起止；宽基（000300、000906、000985 及全收益版）取了全史，用于数回撤段。没有计算任何候选的收益、波动或回撤。

## 1. 中证指数官网（主来源）

- 基础资料：`GET https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/{{code}}`（基日、发布日、调样频率、编制说明）。
- 日线：`GET https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode={{code}}&startDate=YYYYMMDD&endDate=YYYYMMDD`，返回 `data[]`：tradeDate、open、high、low、close、成交量、成交额、样本数等。
- 接口特性：① 会在查询起始日补一行（tradeDate = startDate，收盘价复制第一个真实交易日），拼接时要剔除；下表「起」列包含这一行，所以显示的是查询起始日。② 000300 价格版还给出基日（2004-12-31）之前的 2004 年数据，计数时从基日起算。③ WAF：连续约 50 个请求后返回 403（HTML 页面，标题 405）。首轮失败的请求已由 `retry-csi.py` 补取，manifest 中的时间是成功那次的时间。
- 行数为 `close > 0` 的行数（含补的那一行）。info 文件不是日线，行数记为「—」。

{csi}

## 2. 中证成分与权重文件（oss-ch.csindex.com.cn）

{xls}

权重文件日期 2026-10-30（月末），成分文件日期 2026-11-27；均无行业字段。行业用 `csi-stock-industry-20261030.json`（中证行业分类 CICS，2026-10-30，5,577 只）匹配。`info-N00300.json` 是沪深 300 净收益指数的基础资料（基日 2004-12-31，发布 2013-02-08）；红利低波净收益版按 N30269、N20269 查询返回空。

## 3. 东方财富指数 K 线（价格版，只用于核对发布后覆盖）

参数：`klt=101`（日线）、`fqt=0`、`fields2=f51,f53`（日期、收盘）、`beg=19900101`、`end=20500101`。secid 前缀：1 = 上交所代码，2 = 中证专属代码。

{emt}

## 4. ETF 基本资料与费率（东财）

- 资料：`GET https://fundmobapi.eastmoney.com/FundMNewApi/FundMNNBasicInformation?FCODE={{code}}&deviceid=Wap&plat=Wap&product=EFund&version=6.5.5`，只保留成立日、跟踪指数、规模、基金公司；**接口返回的夏普、波动、最大回撤字段已丢弃，不存**（`raw/etf-meta.json`）。
- 费率：`GET https://fundf10.eastmoney.com/jjfl_{{code}}.html`，解析「管理费率」「托管费率」。
- 这两个请求用 curl 发出（node fetch 连不上 fundmobapi 主机）。

{etft}

`raw/etf-meta.json` SHA-256：`{sha(f'{RAW}/etf-meta.json')}`；`raw/manifest.json` SHA-256：`{sha(f'{RAW}/manifest.json')}`；`raw/manifest-em.json` SHA-256：`{sha(f'{RAW}/manifest-em.json')}`。

## 5. 仓库内已有、本研究会引用的数据（未重新下载）

| 数据 | 文件 | 说明 |
|---|---|---|
| 中国 10 年期国债收益率 | `public/data/cn-market-data.json` → `series.cnTenYear` | 中债 historyQuery，2002 年起；由 `scripts/cn-market-data.mjs` 维护 |
| ETF 跟踪指数缓存 | `data-raw/kpl-plates/etf-index.json` | 东财基金资料，用于列出跟踪 H30269 / 930955 / 000922 的全部 ETF |

## 6. 复现

脚本在 `docs/research/lowvol-core-cn-2026-11-28/`：`fetch-csi.mjs`、`retry-csi.py`、`fetch-em.mjs`、`fetch-etf.sh`（调用 `parse-etf.py`），计数用 `count.py`。
"""
open(sys.argv[2], 'w').write(out)
print('ok', len(out))
