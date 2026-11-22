# manager 独立实现：长期熊市压力测试的数据加载与复现锚点（只读）
import json,csv,datetime
D='data-raw/portfolio-explore/longrun'
def load_french():
    lines=open(f'{D}/49_Industry_Portfolios_Daily.csv',encoding='latin-1').read().splitlines()
    out={}
    for section,start_kw in [('VW','Average Value Weighted Returns -- Daily'),('EW','Average Equal Weighted Returns -- Daily')]:
        i=next(k for k,l in enumerate(lines) if start_kw in l); hdr=[h.strip() for h in lines[i+1].split(',')]
        j=i+2
        while j<len(lines) and lines[j].strip() and lines[j].strip()[0].isdigit():
            parts=[p.strip() for p in lines[j].split(',')]; d=parts[0]; ds=f'{d[:4]}-{d[4:6]}-{d[6:]}'
            for h,v in zip(hdr[1:],parts[1:]):
                x=float(v); out.setdefault(f'{h}_{section}',{})[ds]=None if x<=-99 else x/100
            j+=1
    return out
R=load_french()
NDX=dict(json.load(open(f'{D}/NASDAQ100.json'))['history'])
def run(assets,tw,mode,start='1986-01-02',end='2026-09-30',cost=0.001,switch=None):
    """mode: bh / band(rel 40%) ; switch: dict(entry,gap,step,rec,cap) applied on top of band, stable index = switch['stable']"""
    dates=sorted(d for d in set.intersection(*[set(k for k,v in R[a].items() if v is not None) for a in assets]) if start<=d<=end and d in NDX)
    k=len(assets); w=list(tw); eq=1.0; eqs=[1.0]; trig=0; band=[(t*0.6,t*1.4) for t in tw]
    peak=NDX[dates[0]]; stress=False; levels=set(); base=None; sold=0.0; pend=None; log=[]
    for i in range(1,len(dates)):
        d=dates[i]; r=[R[a][d] for a in assets]
        eq*=1+sum(w[j]*r[j] for j in range(k)); v=[w[j]*(1+r[j]) for j in range(k)]; sv=sum(v); w=[x/sv for x in v]
        if pend:
            old=w[:]
            if pend[0] in ('reb','rec'): w=list(tw)
            else:
                s=switch['stable']; amt=min(pend[1]/eq,w[s])
                cand=[j for j in range(k) if j!=s]; j=min(cand,key=lambda j:w[j]/tw[j]); w[s]-=amt; w[j]+=amt
            t=0.5*sum(abs(w[j]-old[j]) for j in range(k)); eq*=1-t*cost; trig+=1; log.append((d,pend[0])); 
            if pend[0]=='rec': peak=NDX[d]
            pend=None
        q=NDX[d]; peak=max(peak,q); dd=q/peak-1
        if i+1<len(dates):
            if switch and not stress and dd<=-switch['entry']:
                stress=True; levels={switch['entry']}; base=w[switch['stable']]*eq; pend=('step',switch['step']*base)
            elif switch and stress:
                if dd>=-switch['rec']: stress=False; pend=('rec',)
                else:
                    lv=switch['entry']
                    while dd<=-(lv+switch['gap'])+1e-12: lv+=switch['gap']
                    if lv not in levels: levels.add(lv); pend=('step',switch['step']*base)
            elif not stress and mode=='band' and any(not(band[j][0]<w[j]<band[j][1]) for j in range(k)): pend=('reb',)
        eqs.append(eq)
    pk=1; mdd=0
    for e in eqs: pk=max(pk,e); mdd=min(mdd,e/pk-1)
    yrs=(datetime.date.fromisoformat(dates[-1])-datetime.date.fromisoformat(dates[0])).days/365.25
    return dict(start=dates[0],end=dates[-1],final=round(eqs[-1],4),cagr=round(eqs[-1]**(1/yrs)-1,4),mdd=round(mdd,4),trades=trig,events=[x for x in log if x[1]!='reb'])
if __name__=='__main__':
    A=['Softw_VW','Chips_VW','Insur_VW','Softw_EW','Chips_EW']; TW=[.25,.25,.25,.125,.125]
    print('L1 买入持有', {k:v for k,v in run(A,TW,'bh').items() if k!='events'})
    print('L2 相对偏离40%', {k:v for k,v in run(A,TW,'band').items() if k!='events'})
    sw=dict(entry=.20,gap=.05,step=.25,rec=.05,stable=2)
    r=run(A,TW,'band',switch=sw); print('L3 大跌切换主设定', {k:v for k,v in r.items() if k!='events'}); print('   事件', r['events'][:12], '...共', len(r['events']))
