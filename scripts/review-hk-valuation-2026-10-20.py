#!/usr/bin/env python3
"""Reproducible, explicitly uncertified HK valuation overlay from frozen local inputs."""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'public/research/hk-2026-10-07'
OUT = ROOT / 'public/research/hk-valuation-2026-10-20'
OUT.mkdir(parents=True, exist_ok=True)
companies = json.loads((SRC / 'previous.json').read_text())['companies']
data = json.loads((SRC / 'input.json').read_text())
models = json.loads((SRC / 'models.json').read_text())
reviewed = json.loads((SRC / 'audit.json').read_text())
snap = json.loads((ROOT / 'src/data/companyMarketSnapshot.json').read_text())
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
    if price_obj and price_obj.get('price') and str(price_obj.get('date','')).startswith('2026-10-'):
        price=float(price_obj['price']); pdate=price_obj['date']; psource=price_obj.get('provider','行情快照')
    else:
        price=float(model.get('price') or q.get('regularMarketPrice') or 0); pdate=model.get('quoteTime','2026-10-07 Yahoo Finance 快照'); psource='input.json/models.json 旧报价'
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
        band=(8,10,12) if any(x in sector for x in ('公用','电讯','综合')) else (10,13,16) if any(x in sector for x in ('消费','零售','食品','饮料','家电','酒店')) else (12,16,20) if any(x in sector for x in ('科技','互联网','软件','半导体','医药','生物','医疗')) else (8,11,14)
        eps=float(forward)*fx_mult
        method=f'前瞻 EPS × 行业 PE（单一倍数法；倍数为研究假设 {band[0]}/{band[1]}/{band[2]}×）'
        for name,growth,mult in zip(('悲观','基准','乐观'),(.8,1.0,1.15),band):
            e=eps*growth; val=e*mult
            scenarios.append((name,f'input.json quotes.forwardEps={forward:g} {fcur}（2026-10-07 Yahoo 供应商共识，非公司指引）×情景系数 {growth:g}；换算至 HKD 汇率 {fx:g}（CNYHKD=X，快照2026-10-07）' if fx_mult!=1 else f'input.json quotes.forwardEps={forward:g} HKD（2026-10-07 Yahoo 供应商共识，非公司指引）×情景系数 {growth:g}',f'{mult}× PE；{sector}行业假设，单一倍数方法',val))
        calc={'forwardEps':forward,'financialCurrency':fcur,'currency':cur,'fx':fx_mult,'multiples':band,'scenarioFactors':[.8,1.0,1.15]}
    elif is_fin:
        missing='金融股无可用、已定义的普通股PB–ROE/股息率数值模型'
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
    elif ocf is not None and float(ocf)<0: rating='观察'; cap='input.json operatingCashflow为负'
    elif cyc: rating='观察'; cap='周期行业封顶'
    elif ratio>=2: rating='条件关注'; cap='单一倍数方法，优先关注封顶条件关注'
    elif ratio>=1: rating='条件关注'; cap='ratio在1至2'
    else: rating='观察'; cap='ratio<1'
    row={'code':code,'name':c['name'],'sector':sector,'price':price,'priceDate':pdate,'priceSource':psource,'currency':cur,'financialCurrency':fcur,'ttmEps':ttm,'forwardEps':forward,'operatingCashflow':ocf,'method':method or None,'calculation':calc,'scenarios':[{'name':n,'assumption':a,'multiple':m,'price':v} for n,a,m,v in scenarios], 'ratio':ratio,'rating':rating,'capReason':cap,'missing':missing,'oldRating':old.get('@hk:'+code,{}).get('rt',c.get('rating','[MISSING]'))}
    rows.append(row)
    # Human-readable audit per company.
    lines=[f"# {code} {c['name']}：估值初稿（未认证）",'', '研究假设，仅供研究，不构成买卖建议。',f"- 现价：HK${money(price)}（{pdate}，{psource}；{price_obj.get('session','') if price_obj else '旧供应商报价'}）",f"- 输入追溯：public/research/hk-2026-10-07/input.json quotes[{q.get('symbol','')}], models.json[{code}]；公司事实复核截至2026-10-07。",f"- 盈利字段：trailingEps={ttm if ttm is not None else '[MISSING]'}；forwardEps={forward if forward is not None else '[MISSING]'}（2026-10-07 Yahoo供应商共识，非公司指引）；交易/财报币种={cur}/{fcur}" ]
    if fx_mult!=1: lines.append(f'- 币种折算：1 {fcur} = {fx_mult:g} HKD，input.json fx 快照（2026-10-07）。')
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
    ratio_line=f'现价 HK${price_ref}；'+(f'({money(scenarios[1][3])}−{price_ref})÷({price_ref}−{money(scenarios[0][3])})={ratio:.2f}:1' if ratio is not None else '[MISSING]（未建立有效盈亏比；悲观价不低于现价或价值缺失）')
    valuation_summary=(f"基准 {fmt_pct((scenarios[1][3]/price-1)*100)}，ratio {ratio:.2f}" if scenarios and ratio is not None else f"[MISSING]（{missing or '未建立有效盈亏比'}）")
    fact_mark='事实已复核；' if code in ('02269','02359') else ''
    retained={'09961':'历史核读：罚款35.21亿','09866':'历史核读：交割后预期持股30%'}.get(code)
    rendered.append(f"@hk:{code}\nrt: {rating}\nh: {rating}（{fact_mark}估值初稿（未认证））：{review['judgment']}；估值：{valuation_summary}\n"+scenario_text+f"ratio: {ratio_line}；{cap}\nx: 估值初稿（未认证）；旧事实复核源 public/research/hk-2026-10-07；价格 {pdate}；估值方法 {method or '[MISSING]'}。\nz: [MISSING]（条件研究门槛未建立；估值不认证）\ni: {cap}；{retained+'；' if retained else ''}概率未赋值。\n")
    if retained:
        rendered[-1]=rendered[-1].replace('x: ',f'x: {retained}；',1)

counts={}
for r in rows: counts[r['rating']]=counts.get(r['rating'],0)+1
audit={'date':'2026-10-20','status':'估值初稿（未认证）','sources':['public/research/hk-2026-10-07/previous.json','input.json','models.json','src/data/companyMarketSnapshot.json','src/data/details/hk.ts'],'companies':rows,'ratingDistribution':counts}
(OUT/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
ts='export const hkValuationDetails = `\n'+''.join(rendered)+'`\n'
(ROOT/'src/data/details/hkValuation.ts').write_text(ts)
print(f"Rendered {len(rows)} HK companies; ratings={json.dumps(counts,ensure_ascii=False,sort_keys=True)}")
