import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { track } from '../analytics/analytics';
const EUR_TO_USD = 1.08;
const fmtp = n => (Math.round(n*10)/10).toFixed(1)+"%";

const C = {
  primary:"#1D9E75", dark:"#0F6E56", sub:"#6B7280", label:"#A3A9A6",
  text:"#0D0D0D", border:"rgba(0,0,0,0.06)", bg:"#F5F6F5",
};

function SectionTitle({ children }) {
  return (
    <div style={{marginTop:20,marginBottom:8}}>
      <span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"3px 12px",display:"inline-block",fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.07em"}}>
        {children}
      </span>
    </div>
  );
}

function KpiCard({ label, value, sub, color, progress }) {
  const accent = color || C.text;
  return (
    <div style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:`3px solid ${accent}`}}>
      <div style={{fontSize:11,fontWeight:800,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{label}</div>
      <div style={{fontSize:26,fontWeight:900,color:accent,letterSpacing:"-0.03em",lineHeight:1.1}}>{value}</div>
      {sub&&<div style={{fontSize:10,fontWeight:700,color:C.label,marginTop:4}}>{sub}</div>}
      {progress!=null&&(
        <div style={{marginTop:8,height:4,background:"#E5E7EB",borderRadius:99,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${Math.min(progress,100)}%`,background:"#1D9E75",borderRadius:99}}/>
        </div>
      )}
    </div>
  );
}

const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

const PERIODS = [
  { val:'7d',  fr:'7 jours',   en:'7 days' },
  { val:'1M',  fr:'1 mois',    en:'1 month' },
  { val:'3M',  fr:'3 mois',    en:'3 months' },
  { val:'6M',  fr:'6 mois',    en:'6 months' },
  { val:'1Y',  fr:'1 an',      en:'1 year' },
  { val:'all', fr:'Tout',      en:'All' },
];

const PERIOD_DAYS = { '7d':7, '1M':30, '3M':90, '6M':180, '1Y':365 };

function filterByPeriod(arr, period) {
  if (period === 'all') return arr;
  const cutoff = new Date(Date.now() - PERIOD_DAYS[period]*86400000);
  return arr.filter(s => new Date(s.date) >= cutoff);
}

export default function StatsPage({ sales, items, isPremium, triggerCheckout, onBack, t, tpl, lang='fr' }) {
  const tr = t || (k=>k);
  const fmt = lang==='en'
    ? n => '$' + (n * EUR_TO_USD).toFixed(2)
    : n => (Math.round(n*100)/100).toFixed(2).replace(".",",") + ' €';
  const [period, setPeriod] = useState('all');

  useEffect(() => { if (isPremium) track('view_advanced_stats'); }, [isPremium]);

  if (!isPremium) {
    onBack();
    return null;
  }

  const now = new Date();
  const cutoff = period !== 'all' ? new Date(now.getTime() - PERIOD_DAYS[period]*86400000) : null;

  const filteredSales = filterByPeriod(sales, period);
  const filteredItems = period === 'all' ? items : items.filter(i => new Date(i.date) >= cutoff);

  const n = filteredSales.length;
  const totalProfit = filteredSales.reduce((a,s)=>a+s.margin, 0);
  const totalRevenue = filteredSales.reduce((a,s)=>a+s.sell, 0);
  const totalInvested = filteredItems.reduce((a,i)=>a+(i.buy||0), 0);
  const avgMargin = totalRevenue>0 ? (totalProfit/totalRevenue)*100 : 0;
  const avgBasket = n>0 ? totalRevenue/n : 0;
  const avgProfit = n>0 ? totalProfit/n : 0;

  const bestSale = n>0 ? [...filteredSales].sort((a,b)=>b.margin-a.margin)[0] : null;
  const bestPct  = n>0 ? [...filteredSales].sort((a,b)=>b.marginPct-a.marginPct)[0] : null;

  // Best month
  const monthMap = {};
  filteredSales.forEach(s=>{
    const d=new Date(s.date);
    const key=`${d.getFullYear()}-${d.getMonth()}`;
    if(!monthMap[key]) monthMap[key]={profit:0,month:d.getMonth(),year:d.getFullYear()};
    monthMap[key].profit+=s.margin;
  });
  const bestMonthEntry = Object.values(monthMap).sort((a,b)=>b.profit-a.profit)[0]||null;

  // Avg sell delay
  const delays = filteredSales.map(s=>{
    const match = filteredItems.find(it=>it.title===s.title);
    if(!match) return null;
    const days = Math.round((new Date(s.date)-new Date(match.date))/(1000*60*60*24));
    return days>=0?days:null;
  }).filter(d=>d!==null);
  const avgDelay = delays.length>0 ? Math.round(delays.reduce((a,b)=>a+b,0)/delays.length) : null;

  // Sell rate
  const soldItems = filteredItems.filter(i=>i.statut==='vendu');
  const sellRate = filteredItems.length>0 ? Math.round((soldItems.length/filteredItems.length)*100) : 0;

  // Top 3
  const top3 = [...filteredSales].sort((a,b)=>b.margin-a.margin).slice(0,3);

  // Chart (last 6 months within filtered sales)
  const chartData = Array.from({length:6},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);
    const m=d.getMonth();const y=d.getFullYear();
    const ms=filteredSales.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===m&&sd.getFullYear()===y;});
    return{name:MONTHS[m],profit:ms.reduce((a,s)=>a+s.margin,0)};
  });

  const lineData = {
    labels: chartData.map(d=>d.name),
    datasets:[{
      label:'Profit',
      data: chartData.map(d=>d.profit),
      borderColor:'#1D9E75',
      backgroundColor:'rgba(29,158,117,0.08)',
      borderWidth:2,
      pointRadius:4,
      pointBackgroundColor:'#1D9E75',
      tension:0.4,
      fill:true,
    }],
  };
  const lineOpts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>' '+fmt(ctx.raw)}}},
    scales:{
      x:{grid:{display:false},ticks:{font:{size:11,weight:'700'},color:'#A3A9A6'}},
      y:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{font:{size:11},color:'#A3A9A6',callback:v=>fmt(v)}},
    },
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:0}}>

      {/* Bouton retour */}
      <button onClick={onBack}
        style={{display:"flex",alignItems:"center",gap:4,background:"transparent",border:"none",padding:"0 0 16px",cursor:"pointer",fontSize:13,fontWeight:700,color:"#1D9E75",fontFamily:"inherit"}}>
        {tr('retour')}
      </button>

      {/* Header */}
      <div style={{display:"inline-flex",alignItems:"center",gap:4,background:"#E8F5F0",color:"#0F6E56",border:"1px solid #9FE1CB",borderRadius:99,padding:"3px 12px",fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10,alignSelf:"flex-start"}}>
        {tr('statsLabel')}
      </div>
      <div style={{fontSize:32,fontWeight:900,color:"#0D0D0D",letterSpacing:"-0.04em",lineHeight:1,marginBottom:16}}>
        {tr('tesPerformances')}
      </div>

      {/* Sélecteur de période */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {PERIODS.map(p=>(
          <button key={p.val} onClick={()=>setPeriod(p.val)}
            style={{padding:"5px 12px",borderRadius:8,border:"1px solid rgba(0,0,0,0.08)",fontSize:12,fontWeight:700,cursor:"pointer",transition:"all 0.15s",fontFamily:"inherit",
              background:period===p.val?"#1D9E75":"#fff",
              color:period===p.val?"#fff":"#A3A9A6"}}>
            {lang==='fr'?p.fr:p.en}
          </button>
        ))}
      </div>

      {n===0?(
        <div style={{background:"#fff",borderRadius:12,padding:"40px 20px",textAlign:"center",border:"1px solid rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:36,marginBottom:12}}>💸</div>
          <div style={{fontSize:16,fontWeight:800,color:C.text}}>{tr('aucuneVenteStat')}</div>
          <div style={{fontSize:13,color:C.sub,marginTop:6}}>{tr('statsApparaitront')}</div>
        </div>
      ):(
        <>
          <SectionTitle>{tr('vueGlobale')}</SectionTitle>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <KpiCard label={tr('profitTotal')} value={fmt(totalProfit)} color={totalProfit>=0?"#1D9E75":"#E53E3E"}/>
            <KpiCard label={tr('revenuTotal')} value={fmt(totalRevenue)} color="#4ECDC4"/>
            <KpiCard label={tr('totalInvesti')} value={fmt(totalInvested)} color="#F9A26C" sub={lang==='fr'?"stock + articles vendus":"stock + sold items"}/>
            <KpiCard label={tr('ventesTotales')} value={n} color="#0D0D0D"/>
          </div>

          <SectionTitle>{tr('performance')}</SectionTitle>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <KpiCard label={tr('margeMoyenne')} value={fmtp(avgMargin)} color="#1D9E75"/>
            <KpiCard label={tr('panierMoyen')} value={fmt(avgBasket)} color="#F9A26C"/>
            <KpiCard label={tr('profitParVente')} value={fmt(avgProfit)} color="#1D9E75"/>
            <KpiCard label={tr('tauxVente')} value={`${sellRate}%`} color="#0D0D0D" sub={`${soldItems.length}/${filteredItems.length} ${tr('articles')}`} progress={sellRate}/>
          </div>

          {bestSale&&(
            <div style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:"3px solid #1D9E75",marginTop:8}}>
              <div style={{fontSize:10,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>{tr('meilleurVente')}</div>
              <div style={{fontWeight:800,fontSize:14,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🏆 {bestSale.title}</div>
              <div style={{fontSize:16,fontWeight:800,color:"#1D9E75",marginTop:4}}>+{fmt(bestSale.margin)} · {fmtp(bestSale.marginPct)}</div>
            </div>
          )}

          {bestPct&&bestPct.id!==bestSale?.id&&(
            <div style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",marginTop:8}}>
              <div style={{fontSize:10,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>{tr('plusRentable')}</div>
              <div style={{fontWeight:800,fontSize:14,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{bestPct.title}</div>
              <div style={{fontSize:13,fontWeight:700,color:"#5DCAA5",marginTop:2}}>{fmtp(bestPct.marginPct)}</div>
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
            <KpiCard label={tr('meilleurMois')} value={bestMonthEntry?`${MONTHS[bestMonthEntry.month]} ${bestMonthEntry.year}`:"-"} sub={bestMonthEntry?`+${fmt(bestMonthEntry.profit)}`:undefined} color="#1D9E75"/>
            {avgDelay!==null
              ? <KpiCard label={tr('delaiMoyen')} value={`${avgDelay} ${tr('jours')}`} color="#6B7280" sub={tr('entreAchatVente')} progress={sellRate}/>
              : <KpiCard label={tr('delaiMoyen')} value="—" color="#6B7280" sub={tr('donneesInsuffisantes')} progress={sellRate}/>
            }
          </div>

          <SectionTitle>{tr('tendances')}</SectionTitle>
          <div style={{background:"#fff",borderRadius:12,padding:"16px 18px",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <div style={{fontSize:13,fontWeight:800,color:C.text,marginBottom:4}}>{tr('evolutionProfit')}</div>
            <div style={{fontSize:11,color:"#A3A9A6",marginBottom:14,fontWeight:600}}>{tr('sixDerniersMois')}</div>
            <div style={{position:"relative",height:"180px",width:"100%"}}>
              <Line data={lineData} options={lineOpts}/>
            </div>
          </div>

          {top3.length>0&&(
            <>
              <SectionTitle>{tr('top3')}</SectionTitle>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {top3.map((s,i)=>{
                  const d=new Date(s.date);
                  return(
                    <div key={s.id} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:28,height:28,borderRadius:8,background:["#E8F5F0","#F0FFF4","#F7FEF9"][i],display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900,color:"#1D9E75",flexShrink:0}}>
                        {i+1}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:800,fontSize:13,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                        <div style={{fontSize:11,fontWeight:600,color:"#A3A9A6",marginTop:1}}>{d.getDate()} {MONTHS[d.getMonth()]} {d.getFullYear()}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontWeight:900,fontSize:14,color:"#1D9E75"}}>+{fmt(s.margin)}</div>
                        <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6"}}>{fmtp(s.marginPct)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
