#!/usr/bin/env python3
"""Reproducible, explicitly uncertified HK valuation overlay from frozen local inputs."""
import json, math, re
from pathlib import Path
from datetime import date
import os

ROOT = Path(__file__).resolve().parents[1]
VERSION = '2026-10-20'
EARNINGS_FROZEN_AT = '2026-10-20'
FROZEN_VENDOR = f'research/data-refresh-{EARNINGS_FROZEN_AT}/yahoo-quote-batch.json'
SNAPSHOT_PATH = Path(os.environ.get('SNAPSHOT_PATH', ROOT / 'src/data/companyMarketSnapshot.json'))
SRC = ROOT / 'public/research/hk-2026-10-07'
OUT = Path(os.environ.get('OUT_DIR', ROOT / f'public/research/hk-valuation-{VERSION}'))
TS = OUT / 'hkValuation.ts' if os.environ.get('OUT_DIR') else ROOT / 'src/data/details/hkValuation.ts'
OUT.mkdir(parents=True, exist_ok=True)
companies = json.loads((SRC / 'previous.json').read_text())['companies']
data = json.loads((SRC / 'input.json').read_text())
models = json.loads((SRC / 'models.json').read_text())
reviewed = json.loads((SRC / 'audit.json').read_text())
div_quotes = json.loads((ROOT / 'public' / FROZEN_VENDOR).read_text())['quotes']
snap = json.loads(SNAPSHOT_PATH.read_text())

def input_note(price_date, fallback=False):
    days = (date.fromisoformat(price_date[:10]) - date.fromisoformat(EARNINGS_FROZEN_AT)).days
    note = f'盈利输入冻结于 {EARNINGS_FROZEN_AT}'
    if days < 0 or days > 14:
        note += f'；价格日期与盈利输入冻结日相差 {abs(days)} 天（价格日期{ "早于" if days < 0 else "晚于" }冻结日）'
    if fallback:
        note += '；快照缺失，使用冻结供应商/模型旧报价回退'
    return note + '。'


def price_range(records):
    dates = sorted({r['priceDate'][:10] for r in records})
    return dates[0] if dates[0] == dates[-1] else dates[0] + '～' + dates[-1]

details = (ROOT / 'src/data/details/hk.ts').read_text()
old = {}
for block in re.split(r'(?m)^@', details)[1:]:
    lines = block.splitlines(); key = lines[0].strip()
    old[key] = {x.split(':',1)[0]: x.split(':',1)[1].strip() for x in lines[1:] if ':' in x and x.split(':',1)[0] in ('rt','h')}
quote_by_code = {str(q.get('symbol','')).split('.')[0].zfill(5):q for q in data['quotes'].values()}
review_by_code = {r['code']: r for r in reviewed['companies']}
fx = data['fx']['CNYHKD=X']['regularMarketPrice']
CYCLICAL = ('资源','煤炭','石油','油气','航运','钢铁','化工','地产开发','有色','铝业','金属','矿业','造纸','水泥','建材','航空','汽车','周期')
FINANCE = ('银行','保险','券商','证券','金融')
REIT = ('REIT','房托','房地产信托','领展')

# Broad earnings durability/growth assumptions, not measured historical/peer quantiles.
# Every frozen HK sector is deliberately assigned; finance/REIT models still take precedence.
SECTOR_BANDS = {
    '综合企业': (8,10,12),
    '公用事业': (8,10,12),
    '电讯': (8,10,12),
    '专业零售': (10,13,16),
    '消费者主要零售商': (10,13,16),
    '食物饮品': (10,13,16),
    '家庭电器及用品': (10,13,16),
    '旅游及消闲设施': (10,13,16),
    '纺织及服饰': (10,13,16),
    '资讯科技器材': (12,16,20),
    '软件服务': (12,16,20),
    '半导体': (12,16,20),
    '药品及生物科技': (12,16,20),
    '医疗保健': (12,16,20),
    '地产': (8,11,14),
    '银行': (8,11,14),
    '汽车': (8,11,14),
    '保险': (8,11,14),
    '建筑': (8,11,14),
    '其他金融': (8,11,14),
    '媒体及娱乐': (8,11,14),
    '工用运输': (8,11,14),
    '石油及天然气': (8,11,14),
    '煤炭': (8,11,14),
    '一般金属及矿石': (8,11,14),
    '工业工程': (8,11,14),
    '工用支援': (8,11,14),
    '黄金及贵金属': (8,11,14),
    '房地产投资信托': (8,11,14),
}
DIV_MIN, DIV_MAX = 3.0, 8.0
DIV_YIELDS, DIV_FACTORS = (7.0,5.0,4.0), (.8,1.0,1.05)

def dividend_inputs(code, price):
    symbol=code[1:]+'.HK'
    dq=div_quotes.get(symbol,{})
    dps, dy=dq.get('dividendRate'), dq.get('dividendYield')
    # Yahoo forward dividendRate is in quote currency, unlike trailingAnnualDividendRate
    # which can remain in reporting currency (e.g. HSBC USD). Do not convert twice.
    dc=dq.get('currency')
    calc={'method':'div','source':'public/'+FROZEN_VENDOR,
          'symbol':symbol,'dividendRate':dps,'dividendYield':dy,'currency':dc,
          'financialCurrency':dq.get('financialCurrency'),'dividendCurrency':dc,
          'fx':1 if dc=='HKD' else None,'yields':DIV_YIELDS,'dpsFactors':DIV_FACTORS,
          'latestPrice':price,'vendorPrice':dq.get('regularMarketPrice'),
          'specialDividendCheck':'仅排查供应商股息率>8%异常；特别股息未经公司公告核验'}
    valid=lambda x: isinstance(x,(float,int)) and math.isfinite(x) and x>0
    if not valid(dps) or not valid(dy):
        return calc,'股息率法输入缺失：dividendRate/dividendYield 缺失、为零或无效，不硬算'
    if dc!='HKD':
        return calc,f'股息率法币种不可核验：currency={dc}，无法确认每股股息的港元换算，不硬算'
    if dy<DIV_MIN:
        return calc,f'股息率法不适用：供应商股息率 {dy:.2f}% < {DIV_MIN:.0f}%，股息不是主要价值来源'
    if dy>DIV_MAX:
        return calc,f'供应商股息率 {dy:.2f}% > {DIV_MAX:.0f}%，可能含特别股息，未经公司公告核验，不硬算'
    vp=dq.get('regularMarketPrice')
    if not valid(vp) or abs(dps/vp*100/dy-1)>.05:
        return calc,'供应商 dividendRate 与 dividendYield/最新价不自洽（偏差>5%），股息币种或口径待核'
    calc['dpsHKD']=dps
    return calc,None

def money(v): return f'{v:.2f}'
def fmt_pct(v): return f'{v:+.0f}%'
def parse_price(v):
    m = re.search(r'[-+]?\d+(?:\.\d+)?', v or '')
    return float(m.group()) if m else None

rows=[]; rendered=[]
for c in companies:
    code=c['code']; key=f'hk:{code}'; q=quote_by_code.get(code,{})
    model=models.get(code,{})
    price_obj=snap.get(key)
    if price_obj and price_obj.get('price') and price_obj.get('date'):
        price=float(price_obj['price']); pdate=price_obj['date']; psource=price_obj.get('provider','行情快照')
    else:
        price=float(model.get('price') or q.get('regularMarketPrice') or 0); pdate=str(model.get('quoteTime') or '2026-10-07')[:10]; psource='input.json/models.json 旧报价'
    note=input_note(pdate, not price_obj)
    cur=q.get('currency','HKD'); fcur=q.get('financialCurrency',cur)
    fx_mult=fx if cur=='HKD' and fcur=='CNY' else (data['fx']['USDHKD=X']['regularMarketPrice'] if cur=='HKD' and fcur=='USD' else 1.0)
    ttm=q.get('trailingEps'); forward=q.get('forwardEps')
    sector=c.get('sector',''); is_fin=any(x in sector for x in FINANCE); is_reit=any(x.lower() in sector.lower() for x in REIT) or code=='00823'
    cyc=any(x in sector for x in CYCLICAL)
    ocf=q.get('operatingCashflow')
    scenarios=[]; ratio=None; missing=None; method=''; calc={}
    # Models with explicit, source-traceable PB/DPU definitions take precedence.
    if model.get('numericDraft') and model.get('bear') is not None and model.get('base') is not None and model.get('bull') is not None:
        values=[float(model[x]) for x in ('bear','base','bull')]
        defs=model.get('definitions',[]); method=model.get('valuationType',model.get('method','模型数值草案'))
        calc={'modelFields':['bear','base','bull'],'model':model}
        for i,(name,val) in enumerate(zip(('悲观','基准','乐观'),values)):
            d=defs[i] if i<len(defs) else {}
            asum=(f"模型字段 {['bear','base','bull'][i]}；情景参数 {json.dumps(d,ensure_ascii=False,sort_keys=True)}" if d else f"采用 models.json {['bear','base','bull'][i]} 字段")
            scenarios.append((name,asum,method,val))
    elif not is_fin and not is_reit and forward is not None and float(forward)>0 and ttm is not None and float(ttm)>0:
        # Analyst-set broad sector PE bands; always a single-multiple method, so priority ratings cap at conditional.
        band=SECTOR_BANDS[sector]
        eps=float(forward)*fx_mult
        method=f'前瞻 EPS × 行业 PE（单一倍数法；倍数为研究假设 {band[0]}/{band[1]}/{band[2]}×）'
        for name,growth,mult in zip(('悲观','基准','乐观'),(.8,1.0,1.15),band):
            e=eps*growth; val=e*mult
            scenarios.append((name,f'input.json quotes.forwardEps={forward:g} {fcur}（2026-10-07 Yahoo 供应商共识，非公司指引）×情景系数 {growth:g}；换算至 HKD 汇率 {fx:g}（CNYHKD=X，快照2026-10-07）' if fx_mult!=1 else f'input.json quotes.forwardEps={forward:g} HKD（2026-10-07 Yahoo 供应商共识，非公司指引）×情景系数 {growth:g}',f'{mult}× PE；{sector}行业假设，单一倍数方法',val))
        calc={'forwardEps':forward,'financialCurrency':fcur,'currency':cur,'fx':fx_mult,'multiples':band,'scenarioFactors':[.8,1.0,1.15]}
    elif is_fin:
        calc,missing=dividend_inputs(code,price)
        method='股息率法（单一方法；目标股息率7/5/4%，未校准历史分位）'
        if not missing:
            dps=calc['dpsHKD']
            for name,factor,dy in zip(('悲观','基准','乐观'),DIV_FACTORS,DIV_YIELDS):
                scenarios.append((name,
                    f"yahoo-quote-batch.json {calc['symbol']} dividendRate={dps:g} HKD/股 × {factor:g}（供应商前瞻年化股息，非公司指引）；currency=HKD，financialCurrency={calc['financialCurrency']}，股息已为报价币种、汇率1，不再按财报币种折算；最新价股息率 {dps/price*100:.2f}%；是否含特别股息未经公司公告核验",
                    f'目标股息率 {dy:g}%（单一股息率方法，研究假设）',dps*factor/(dy/100)))
    elif is_reit:
        missing='REIT缺少可核验AFFO/DPU情景模型数值'
    else:
        missing='缺少正TTM盈利与正向前瞻EPS，无法建立可核验PE估值'
    if scenarios:
        scenarios=[(n,a,m,round(v+1e-10,2)) for n,a,m,v in scenarios]
        bear,base,bull=[s[3] for s in scenarios]
        if price>bear: ratio=(base-price)/(price-bear)
        else: missing='悲观价不低于现价，盈亏比异常；保留情景但评级观察'
    review=review_by_code[code]
    confirmed_wait=review.get('rating')=='等待证据'
    disputed_loss=ttm is not None and float(ttm)<0 and review.get('rating')=='观察'
    if disputed_loss and not model.get('numericDraft'):
        scenarios=[]; ratio=None
        missing='供应商 TTM EPS 为负，与 10-07 原件复核口径冲突，可能含公允价值/减值等非现金项目，待核读'
    loss=ttm is not None and float(ttm)<0
    if confirmed_wait: rating='回避'; cap='10-07 原件复核评级为等待证据（复核回避）'
    elif loss and not disputed_loss: rating='回避'; cap='TTM EPS为负（供应商字段）'
    elif missing or ratio is None: rating='观察'; cap=missing or 'ratio缺失'
    elif ratio>8: rating='观察'; cap='ratio>8，压力情景不足'
    elif disputed_loss: rating='观察'; cap='供应商TTM EPS负值与10-07复核评级冲突，待核读'
    elif not is_fin and ocf is not None and float(ocf)<0: rating='观察'; cap='input.json operatingCashflow为负'
    elif cyc: rating='观察'; cap='周期行业封顶'
    elif ratio>=2: rating='条件关注'; cap='单一方法，优先关注封顶条件关注'
    elif ratio>=1: rating='条件关注'; cap='ratio在1至2'
    else: rating='观察'; cap='ratio<1'
    row={'code':code,'name':c['name'],'sector':sector,'sectorBand':SECTOR_BANDS[sector],'cyclical':cyc,'financial':is_fin,'price':price,'priceDate':pdate,'priceSource':psource,'currency':cur,'financialCurrency':fcur,'ttmEps':ttm,'forwardEps':forward,'operatingCashflow':ocf,'method':method or None,'calculation':calc,'scenarios':[{'name':n,'assumption':a,'multiple':m,'price':v} for n,a,m,v in scenarios], 'ratio':ratio,'rating':rating,'capReason':cap,'missing':missing,'oldRating':old.get('@hk:'+code,{}).get('rt',c.get('rating','[MISSING]'))}
    rows.append(row)
    # Human-readable audit per company.
    lines=[f"# {code} {c['name']}：估值初稿（未认证）",'', '研究假设，仅供研究，不构成买卖建议。',f"- 现价：HK${money(price)}（{pdate}，{psource}；{price_obj.get('session','') if price_obj else '旧供应商报价'}）",f"- 输入追溯：public/research/hk-2026-10-07/input.json quotes[{q.get('symbol','')}], models.json[{code}]；公司事实复核截至2026-10-07。",f"- 盈利字段：trailingEps={ttm if ttm is not None else '[MISSING]'}；forwardEps={forward if forward is not None else '[MISSING]'}（2026-10-07 Yahoo供应商共识，非公司指引）；交易/财报币种={cur}/{fcur}" ]
    lines.append('- '+note)
    if fx_mult!=1: lines.append(f'- 币种折算：1 {fcur} = {fx_mult:g} HKD，input.json fx 快照（2026-10-07）。')
    if is_fin:
        lines.append('- 金融股经营现金流口径不具可比性，不以供应商 operatingCashflow 为负封顶；仍受单一方法、ratio及复核规则约束。')
    if calc.get('method')=='div':
        lines.append('- 股息输入核对：'+json.dumps(calc,ensure_ascii=False,sort_keys=True))
    lines += [f'- 方法：{method or "[MISSING]（未建立可核验价值）"}', '','| 情景 | 假设 | 倍数 | 隐含价 | 相对现价 |','|---|---|---|---:|---:|']
    if scenarios:
        for n,a,m,v in scenarios: lines.append(f'| {n} | {a} | {m} | HK${money(v)}（估值初稿） | {fmt_pct((v/price-1)*100)} |')
    else:
        why='供应商 TTM EPS 为负，与 10-07 原件复核口径冲突，可能含公允价值/减值等非现金项目，待核读' if disputed_loss else missing
        for n in ('悲观','基准','乐观'): lines.append(f'| {n} | [MISSING]（{why}） | [MISSING] | [MISSING]（{why}） | [MISSING] |')
    lines += ['',f'- 盈亏比：{f"({money(scenarios[1][3])}−{money(price)})÷({money(price)}−{money(scenarios[0][3])})={ratio:.2f}:1" if ratio is not None else "[MISSING]（未建立有效盈亏比）"}',f'- 评级：{rating}；规则/封顶：{cap}。概率：[MISSING]（未赋概率）']
    (OUT/f'{code}.md').write_text('\n'.join(lines)+'\n')
    def sanitize(s): return str(s).replace('|','／').replace('\n',' ')
    scenario_text=''.join(f"s: {n}|[MISSING]（未赋概率）|{sanitize(a)}|{sanitize(m)}|HK${money(v)}（估值初稿）|{fmt_pct((v/price-1)*100)}|待下一份财报及价格验证\n" for n,a,m,v in scenarios)
    if not scenarios:
        scenario_text=''.join(f"s: {n}|[MISSING]（未赋概率）|[MISSING]（{missing}）|[MISSING]|[MISSING]（未建立可核验价值）|[MISSING]|待取得可核验输入\n" for n in ('悲观','基准','乐观'))
    price_ref=f'{price:.6f}'.rstrip('0').rstrip('.')
    ratio_line=f'估值初稿（未认证）；现价 HK${price_ref}；'+(f'({money(scenarios[1][3])}−{price_ref})÷({price_ref}−{money(scenarios[0][3])})={ratio:.2f}:1' if ratio is not None else '[MISSING]（未建立有效盈亏比；悲观价不低于现价或价值缺失）')
    valuation_summary=(f"基准 {fmt_pct((scenarios[1][3]/price-1)*100)}，ratio {ratio:.2f}" if scenarios and ratio is not None else f"[MISSING]（{missing or '未建立有效盈亏比'}）")
    fact_mark='事实已复核；' if code in ('02269','02359') else ''
    retained={'09961':'历史核读：罚款35.21亿','09866':'历史核读：交割后预期持股30%'}.get(code)
    rendered.append(f"@hk:{code}\nrt: {rating}\nh: {rating}（{fact_mark}估值初稿（未认证））：{review['judgment']}；估值：{valuation_summary}。仅为研究假设，不构成买卖建议。\n"+scenario_text+f"ratio: {ratio_line}；{cap}\nx: {note}估值初稿（未认证）；旧事实复核源 public/research/hk-2026-10-07；价格 {pdate}；估值方法 {method or '[MISSING]'}。\nz: [MISSING]（条件研究门槛未建立；估值不认证）\ni: {cap}；{retained+'；' if retained else ''}概率未赋值。\n")
    if retained:
        rendered[-1]=rendered[-1].replace('x: ',f'x: {retained}；',1)

# Fail closed: new sectors require an explicit assumption instead of a default PE band.
assert {c['sector'] for c in companies} <= SECTOR_BANDS.keys(), '新增 sector 必须显式归类'
counts={}
for r in rows: counts[r['rating']]=counts.get(r['rating'],0)+1
audit={'version':VERSION,'priceDate':price_range(rows),'status':'估值初稿（未认证）','sources':['public/research/hk-2026-10-07/previous.json','input.json','models.json','src/data/companyMarketSnapshot.json','src/data/details/hk.ts','public/'+FROZEN_VENDOR],'sectorBands':SECTOR_BANDS,'cyclicalSectors':sorted({r['sector'] for r in rows if r['cyclical']}),'cyclicalKeywords':CYCLICAL,'dividendAssumptions':{'minYield':DIV_MIN,'maxYield':DIV_MAX,'yields':DIV_YIELDS,'dpsFactors':DIV_FACTORS},'companies':rows,'ratingDistribution':counts}
(OUT/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
ts='export const hkValuationDetails = `\n'+''.join(rendered)+'`\n'
TS.write_text(ts)
print(f"Rendered {len(rows)} HK companies; ratings={json.dumps(counts,ensure_ascii=False,sort_keys=True)}")
