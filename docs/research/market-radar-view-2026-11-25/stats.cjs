const path=process.argv[2];const f=require(path);const t=f.backtest.timeline;const L=2;
const fwd=(i,h)=>{const a=t[i+L-1],b=t[i+L-1+h];return a&&b?b.spx/a.spx-1:null};
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const tierOf=s=>s>=0.5?'进攻':s>=0.15?'偏进攻':s<=-0.75?'防守':s<=-0.25?'偏防守':'中性';
const tri=(s,lo,hi)=>s<=-0.5?lo:s>=0.5?hi:'中';
const readings={
 '综合分五档(X/Y)':{fn:r=>r.score,bucket:tierOf,order:['防守','偏防守','中性','偏进攻','进攻']},
 '长期温度(Z)':{fn:r=>(r.dims[1]+r.dims[2])/2,bucket:s=>tri(s,'偏热','偏冷'),order:['偏热','中','偏冷']},
 '当下压力(Z)':{fn:r=>(r.dims[0]+r.dims[3]+r.dims[4])/3,bucket:s=>tri(s,'压力高','压力低'),order:['压力高','中','压力低']},
};
function nwT(x,y,lag){const n=x.length,mx=avg(x),my=avg(y);const xc=x.map(v=>v-mx),yc=y.map(v=>v-my);const sxx=xc.reduce((s,v)=>s+v*v,0);const b=xc.reduce((s,v,i)=>s+v*yc[i],0)/sxx;const e=yc.map((v,i)=>v-b*xc[i]);const u=xc.map((v,i)=>v*e[i]);let S=u.reduce((s,v)=>s+v*v,0);for(let l=1;l<=lag;l++){let c=0;for(let i=l;i<n;i++)c+=u[i]*u[i-l];S+=2*(1-l/(lag+1))*c}const se=Math.sqrt(S)/sxx;const r=xc.reduce((s,v,i)=>s+v*yc[i],0)/Math.sqrt(sxx*yc.reduce((s,v)=>s+v*v,0));return {r:+r.toFixed(2),t:+(b/se).toFixed(2),n}}
const eras=[['全样本','0000','9999'],['1973–1999','0000','2000'],['2000 起','2000','9999']];
const out=[];
for(const [name,R] of Object.entries(readings)){
 out.push(`\n## ${name}`);
 const cur=R.fn(t.at(-1));out.push(`最新月 ${t.at(-1).d} 读数 ${cur.toFixed(2)} → ${R.bucket(cur)}`);
 for(const h of [12,36]){
  for(const [en,a,b] of eras){
   const rows=t.map((r,i)=>({d:r.d,s:R.fn(r),y:fwd(i,h),k:R.bucket(R.fn(r)),i})).filter(r=>r.y!=null&&r.d>=a&&r.d<b);
   const c=nwT(rows.map(r=>r.s),rows.map(r=>r.y),h);
   const cells=R.order.map(k=>{const g=rows.filter(r=>r.k===k);if(!g.length)return `${k}: 无`;let ep=0;g.forEach((r,j)=>{if(j===0||r.i!==g[j-1].i+1)ep++});const m=avg(g.map(r=>r.y));return `${k}: ${g.length}月/${ep}段/独立≈${Math.max(1,Math.min(ep,Math.round(g.length/h)))} 均${(m*100).toFixed(1)}%`});
   out.push(`h${h} ${en} | r=${c.r} NW-t=${c.t} | `+cells.join(' ; '));
  }
 }
}
console.log(out.join('\n'));
