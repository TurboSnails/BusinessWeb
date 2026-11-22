import json, datetime, math, itertools, statistics, time, csv
from pathlib import Path
ROOT=Path('.')
P=json.loads((ROOT/'data-raw/portfolio-explore/prices-adjusted.json').read_text())['series']
OUT=ROOT/'data-raw/portfolio-explore/work/drawdown-switch'
REPORT=ROOT/'.dev-team/runs/portfolio-explore/reports/drawdown-switch.md'
COST_RATE=.001
W1_START='2021-08-25'; W2_START='2016-01-04'; END='2026-11-20'

def metrics(series, dates, trades, cost):
    n=len(series)-1; rs=[series[i]/series[i-1]-1 for i in range(1,len(series))]
    mean=sum(rs)/n if n else 0; var=sum((x-mean)**2 for x in rs)/n if n else 0
    years=(datetime.date.fromisoformat(dates[-1])-datetime.date.fromisoformat(dates[0])).days/365.25
    peak=series[0]; trough=0; peakday=dates[0]; troughday=dates[0]; ddstart=dates[0]
    for d,e in zip(dates,series):
        if e>peak: peak=e; peakday=d
        dd=e/peak-1
        if dd<trough: trough=dd; ddstart=peakday; troughday=d
    byyear={}
    for i in range(1,len(dates)):
        y=dates[i][:4]
        byyear.setdefault(y,[]).append(rs[i-1])
    annual={y:math.prod(1+x for x in v)-1 for y,v in byyear.items()}
    return {'final':series[-1], 'cagr':series[-1]**(1/years)-1, 'vol':math.sqrt(var*252), 'mdd':trough, 'dd_start':ddstart,'dd_end':troughday,'cer':252*(mean-1.5*var),'trades':trades,'cost':cost,'worst_year':min(annual.values())}

def run(stocks, targets, start, mode='bh', cfg=None):
    dates=sorted(set.intersection(*[set(P[s]['dates']) for s in stocks+['QQQ']]))
    dates=[d for d in dates if start<=d<=END]
    px={s:dict(zip(P[s]['dates'],P[s]['close'])) for s in stocks+['QQQ']}
    target=list(targets); w=list(target); eq=1.; eqs=[eq]; trades=0; cumcost=0.
    pending=None; state=False; peak=px['QQQ'][dates[0]]; next_level=None; stablebase=0.; steps=0; episodes=[]; ep=None
    for i in range(1,len(dates)):
        d0,d=dates[i-1],dates[i]
        rr=[px[s][d]/px[s][d0]-1 for s in stocks]
        eq*=1+sum(w[j]*rr[j] for j in range(len(stocks)))
        v=[w[j]*(1+rr[j]) for j in range(len(stocks))]; sv=sum(v); w=[x/sv for x in v]
        if mode=='switch' and pending and pending[0]==i:
            typ=pending[1]
            if typ=='step':
                si=pending[2]; amt=min(w[si],stablebase*cfg['step']/eq)
                alloc=[0.]*len(w)
                if cfg['buy']=='all':
                    non=[j for j in range(len(w)) if j!=si]
                    for j in non: alloc[j]=amt*target[j]/sum(target[k] for k in non)
                elif cfg['buy']=='volatile':
                    cand=[j for j,s in enumerate(stocks) if j!=si and s in ('TSLA','NVDA','SOFI','RKLB')]
                    j=min(cand,key=lambda k:w[k]/target[k]); alloc[j]=amt
                else:
                    cand=[j for j in range(len(w)) if j!=si]
                    j=min(cand,key=lambda k:w[k]/target[k]); alloc[j]=amt
                w[si]-=amt
                for j in range(len(w)): w[j]+=alloc[j]
                t=amt # one-way turnover ratio
                eq*=1-t*COST_RATE; cumcost+=t*COST_RATE; trades+=1; steps+=1
            elif typ=='restore':
                t=.5*sum(abs(w[j]-target[j]) for j in range(len(w)))
                eq*=1-t*COST_RATE; cumcost+=t*COST_RATE; trades+=1; w=list(target)
                if ep:
                    ep['restore_exec']=d; ep['switch_end_eq']=eq; ep['steps']=steps; episodes.append(ep); ep=None
                state=False; peak=pending[2]; next_level=None; steps=0
            elif typ=='band':
                t=.5*sum(abs(w[j]-target[j]) for j in range(len(w)))
                eq*=1-t*COST_RATE; cumcost+=t*COST_RATE; trades+=1; w=list(target)
            pending=None
        elif mode=='band' and pending==i:
            t=.5*sum(abs(w[j]-target[j]) for j in range(len(w))); eq*=1-t*COST_RATE; cumcost+=t*COST_RATE; trades+=1; w=list(target); pending=None
        if mode=='switch':
            q=px['QQQ'][d]
            if not state:
                peak=max(peak,q); dd=q/peak-1
                if dd<=cfg['entry']:
                    state=True; stablebase=w[stocks.index(cfg['stable'])] if cfg.get('stable') in stocks else next(w[j] for j,s in enumerate(stocks) if s in ('CB','KO','PG','JNJ','WMT','COST','GLD'))
                    # Anchor initial step to stable market value on the entry signal close.
                    stablebase*=eq
                    next_level=cfg['entry']; ep={'entry':d,'entry_eq':eq,'steps':0,'switch_start_eq':eq}
                    pending=(i+1,'step',stocks.index(cfg['stable']) if cfg.get('stable') in stocks else next(j for j,s in enumerate(stocks) if s in ('CB','KO','PG','JNJ','WMT','COST','GLD')))
                elif any(not (target[j]*.6<w[j]<target[j]*1.4) for j in range(len(w))) and i+1<len(dates):
                    pending=(i+1,'band',None)
            else:
                dd=q/peak-1
                recover={'-10':-.10,'-5':-.05,'high':0}[cfg['recovery']]
                if dd>=recover:
                    pending=(i+1,'restore',q)
                elif dd<=next_level-cfg['gap']:
                    next_level-=cfg['gap']
                    if i+1<len(dates): pending=(i+1,'step',stocks.index(cfg['stable']) if cfg.get('stable') in stocks else next(j for j,s in enumerate(stocks) if s in ('CB','KO','PG','JNJ','WMT','COST','GLD')))
            # hold peak fixed for whole observation period; only update at recovery execution
        elif mode=='band':
            if any(not (target[j]*.6<w[j]<target[j]*1.4) for j in range(len(w))) and i+1<len(dates): pending=i+1
        eqs.append(eq)
    if ep:
        ep.update({'restore_exec':'未恢复（区间末）','switch_end_eq':eq,'steps':steps}); episodes.append(ep)
    # reconcile W2 drawdown episode contribution by episode normalized switch vs matching REB at same dates, attached by caller
    return dates,eqs,metrics(eqs,dates,trades,cumcost),episodes

def portfolio(growth, stable, volatile=('TSLA','NVDA')):
    stocks=list(growth)+list(volatile)+[stable]; return stocks,[.25,.25,.125,.125,.25]
def fmt(x,p=3): return f'{100*x:+.{p}f}%'
def qtile(xs,p):
    a=sorted(xs); k=(len(a)-1)*p; lo=int(k); hi=min(lo+1,len(a)-1); return a[lo]+(a[hi]-a[lo])*(k-lo)
def dist(xs): return (statistics.median(xs),qtile(xs,.25),qtile(xs,.75),sum(x>0 for x in xs)/len(xs))

def anchor():
    tw=[.25,.25,.25,.125,.125]
    for label, stocks,start,mode in [('A1',['AVGO','META','CB','SOFI','RKLB'],W1_START,'bh'),('A2',['AVGO','META','CB','SOFI','RKLB'],W1_START,'band'),('A3',['AVGO','META','CB','TSLA','NVDA'],W2_START,'bh'),('A4',['AVGO','META','CB','TSLA','NVDA'],W2_START,'band'),('A5',['QQQ'],W1_START,'bh')]:
        t=[1.] if label=='A5' else tw
        _,_,m,_=run(stocks,t,start,mode)
        print(label, m)

def main():
    t0=time.time(); anchor()
    # W2 combo sweep: all 70 portfolios, strategy and controls.
    grows=['AVGO','META','MSFT','AMZN','GOOGL']; stables=['CB','KO','PG','JNJ','WMT','COST','GLD']
    cfg={'entry':-.20,'gap':.05,'step':.25,'recovery':'-5','buy':'lowest'}
    rows=[]; episode_data={}
    for g in itertools.combinations(grows,2):
      for stable in stables:
        stocks,tw=portfolio(g,stable)
        _,bh,bhm,_=run(stocks,tw,W2_START,'bh'); dates,reb,rebm,_=run(stocks,tw,W2_START,'band')
        _,sw,swm,eps=run(stocks,tw,W2_START,'switch',{**cfg,'stable':stable})
        rows.append({'growth':'+'.join(g),'stable':stable,'bh':bhm,'reb':rebm,'switch':swm,'d_cagr':swm['cagr']-rebm['cagr'],'d_mdd':swm['mdd']-rebm['mdd'],'d_cer':swm['cer']-rebm['cer']})
        episode_data[(g,stable)]=eps
    with (OUT/'w2-main.csv').open('w') as f:
        wri=csv.DictWriter(f,fieldnames=['growth','stable','bh_final','reb_final','switch_final','d_cagr','d_mdd','d_cer']); wri.writeheader()
        for r in rows: wri.writerow({'growth':r['growth'],'stable':r['stable'],'bh_final':r['bh']['final'],'reb_final':r['reb']['final'],'switch_final':r['switch']['final'],'d_cagr':r['d_cagr'],'d_mdd':r['d_mdd'],'d_cer':r['d_cer']})
    # parameter grid as fixed above; 17 non-main configs x 70
    grid=[]
    dimensions=[('entry',[-.15,-.20,-.25]),('gap',[.05,.10]),('step',[.25,.50,1.]),('recovery',['-10','-5','high']),('buy',['lowest','all','volatile'])]
    configs=[]
    for key,vals in dimensions:
        for value in vals:
            for e in [-.15,-.20,-.25]:
             for gap in [.05,.10]:
              for step in [.25,.5,1.]:
               for rec in ['-10','-5','high']:
                for buy in ['lowest','all','volatile']:
                 c={'entry':e,'gap':gap,'step':step,'recovery':rec,'buy':buy}
                 if c[key]==value: configs.append((key,value,c))
    # Run all specified grid cells; no omitted combinations.
    seen=set()
    for dim,val,c in configs:
        key=tuple(c.items())
        if key in seen: continue
        seen.add(key); vals=[]
        for g in itertools.combinations(grows,2):
         for stable in stables:
          stocks,tw=portfolio(g,stable); _,_,rebm,_=run(stocks,tw,W2_START,'band'); _,_,swm,_=run(stocks,tw,W2_START,'switch',{**c,'stable':stable}); vals.append(swm['cagr']-rebm['cagr'])
        grid.append((dim,val,*dist(vals)))
    (OUT/'results.json').write_text(json.dumps({'rows':rows,'episodes':{str(k):v for k,v in episode_data.items()},'grid':grid},default=str,indent=2))
    # W1: user portfolio and each stable-stock substitution, with BH/REB/switch complete metrics.
    w1=[]
    for stable in ['CB','KO','PG','JNJ','WMT','COST','GLD']:
        stocks=['AVGO','META','SOFI','RKLB',stable]; tw=[.25,.25,.125,.125,.25]
        _,_,bhm,_=run(stocks,tw,W1_START,'bh'); _,_,rebm,_=run(stocks,tw,W1_START,'band'); _,_,swm,eps=run(stocks,tw,W1_START,'switch',{**cfg,'stable':stable})
        w1.append({'stable':stable,'bh':bhm,'reb':rebm,'switch':swm,'episodes':eps})
    (OUT/'w1.json').write_text(json.dumps(w1,indent=2))
    print('RESULTS',len(rows),'GRIDCONFIGS',len(seen),'W1',len(w1),'secs',time.time()-t0)
if __name__=='__main__': main()
