import sys,itertools,json,time,statistics
from pathlib import Path
sys.path.insert(0,str(Path('data-raw/portfolio-explore/work/drawdown-switch').resolve()))
import run as sim
root=Path('data-raw/portfolio-explore/work/drawdown-switch'); rows=json.loads((root/'results.json').read_text())['rows']
growths=['AVGO','META','MSFT','AMZN','GOOGL']; stables=['CB','KO','PG','JNJ','WMT','COST','GLD']
reb={(tuple(r['growth'].split('+')),r['stable']):r['reb']['cagr'] for r in rows}
collect={}
t0=time.time()
for e in [-.15,-.20,-.25]:
 for gap in [.05,.10]:
  for step in [.25,.5,1.]:
   for rec in ['-10','-5','high']:
    for buy in ['lowest','all','volatile']:
     c={'entry':e,'gap':gap,'step':step,'recovery':rec,'buy':buy}; cfgid=f'{e}|{gap}|{step}|{rec}|{buy}'
     out=[]
     for g in itertools.combinations(growths,2):
      for stable in stables:
       stocks,tw=sim.portfolio(g,stable)
       _,_,swm,_=sim.run(stocks,tw,sim.W2_START,'switch',{**c,'stable':stable})
       out.append(swm['cagr']-reb[(g,stable)])
     for dim,val in [('entry',e),('gap',gap),('step',step),('recovery',rec),('buy',buy)]:
      collect.setdefault((dim,val),[]).extend(out)
     print('done',cfgid)
results=[]
for (dim,val),xs in collect.items(): results.append({'dimension':dim,'value':val,'n':len(xs),'median':statistics.median(xs),'q1':sim.qtile(xs,.25),'q3':sim.qtile(xs,.75),'positive':sum(x>0 for x in xs)/len(xs)})
(root/'grid-marginal.json').write_text(json.dumps(results,indent=2))
print('DONE configs=162 cell_comparisons=11340 seconds=',time.time()-t0)
