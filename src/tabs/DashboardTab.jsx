import { memo } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { Bar, Line } from 'react-chartjs-2';
import SwipeRow from '../components/SwipeRow';
import {
  C, formatCurrency, fmtp, MONTHS_FR, MONTHS_EN,
  getCatBorder, getTypeStyle, marqueLabel, getMargeColor, groupSales,
} from '../utils/shared';

const Kpi=({label,value,sub,color,icon})=>(
  <div className="kpi" style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
    {icon&&<div style={{fontSize:18,marginBottom:4}}>{icon}</div>}
    <div style={{fontSize:10,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{label}</div>
    <div style={{fontSize:22,fontWeight:900,color:"#0D0D0D",letterSpacing:"-0.03em",lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:10,fontWeight:700,color:color||"#6B7280",marginTop:4}}>{sub}</div>}
  </div>
);

function filterSalesByRange(salesArr, range, now){
  const cutoffs={'7j':7,'1M':30,'6M':180,'1A':365};
  if(range==='YTD') return salesArr.filter(s=>new Date(s.date)>=new Date(now.getFullYear(),0,1));
  const ms=cutoffs[range]||180;
  const cutoff=new Date(now.getTime()-ms*86400000);
  return salesArr.filter(s=>new Date(s.date)>=cutoff);
}

function buildChartData(salesArr, range, now, lang){
  const MONTHS=lang==='en'?MONTHS_EN:MONTHS_FR;
  const byMonth=(n)=>Array.from({length:n},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()-(n-1)+i,1);
    const m=d.getMonth();const y=d.getFullYear();
    const ms=salesArr.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===m&&sd.getFullYear()===y;});
    return{name:MONTHS[m],profit:ms.reduce((a,s)=>a+s.margin,0),"Marge %":ms.length?ms.reduce((a,s)=>a+s.marginPct,0)/ms.length:0};
  });
  if(range==='7j'){
    return Array.from({length:7},(_,i)=>{
      const d=new Date(now);d.setDate(d.getDate()-6+i);
      const ds=salesArr.filter(s=>{const sd=new Date(s.date);return sd.toDateString()===d.toDateString();});
      return{name:`${d.getDate()}/${d.getMonth()+1}`,profit:ds.reduce((a,s)=>a+s.margin,0),"Marge %":ds.length?ds.reduce((a,s)=>a+s.marginPct,0)/ds.length:0};
    });
  }
  if(range==='1M'){
    return Array.from({length:4},(_,i)=>{
      const end=new Date(now);end.setDate(end.getDate()-i*7);
      const start=new Date(end);start.setDate(start.getDate()-6);
      const ds=salesArr.filter(s=>{const sd=new Date(s.date);return sd>=start&&sd<=end;});
      return{name:`S${4-i}`,profit:ds.reduce((a,s)=>a+s.margin,0),"Marge %":ds.length?ds.reduce((a,s)=>a+s.marginPct,0)/ds.length:0};
    }).reverse();
  }
  if(range==='1A') return byMonth(12);
  if(range==='YTD') return byMonth(now.getMonth()+1);
  return byMonth(6);
}

const DashboardTab = memo(function DashboardTab({
  lang, currency, isPremium, isNative, loading,
  items, sales, stock, stockVal,
  tm, salesForKpis, totalM,
  selectedRange, setSelectedRange,
  delSale, resetStep, setResetStep, handleReset,
  fabTriggerRef, triggerCheckout, handleIAPPurchase, setTab,
  EmptyStateDashboard,
}) {
  const { t, tpl } = useTranslation(lang);
  const fmt = (amount, dec=null) => formatCurrency(amount, currency, dec);
  const now = new Date();

  const mData = buildChartData(sales, selectedRange, now, lang);
  const totalR = salesForKpis.reduce((a,s)=>a+s.sell,0);
  const avgM = totalR>0?(totalM/totalR)*100:0;
  const hasData = sales.length>0;

  const _f={family:"'Nunito', -apple-system, sans-serif",size:11};
  const _tip={backgroundColor:'#ffffff',titleColor:'#A3A9A6',borderColor:'rgba(0,0,0,0.08)',borderWidth:1,padding:12,cornerRadius:10,displayColors:false,titleFont:{..._f,size:11,weight:'700'},bodyFont:{..._f,size:14,weight:'800'}};
  const _scales=(unit)=>({
    x:{grid:{display:false},border:{display:false},ticks:{color:'#A3A9A6',font:_f}},
    y:{grid:{color:'#E5E7EB',drawTicks:false},border:{display:false},ticks:{color:'#A3A9A6',font:_f,padding:8,callback:unit==='€'?v=>fmt(v,0):v=>v+unit}},
  });
  const barChartData={
    labels:mData.map(d=>d.name),
    datasets:[{
      data:mData.map(d=>d.profit),
      backgroundColor:'#1D9E75',
      hoverBackgroundColor:'#0F6E56',
      borderRadius:8,
      borderSkipped:false,
    }],
  };
  const lineChartData={
    labels:mData.map(d=>d.name),
    datasets:[{
      data:mData.map(d=>d['Marge %']),
      borderColor:'#F9A26C',
      backgroundColor:'rgba(249,162,108,0.10)',
      borderWidth:3,
      tension:0.4,
      pointBackgroundColor:'#F9A26C',
      pointBorderColor:'#ffffff',
      pointBorderWidth:2,
      pointRadius:4,
      pointHoverRadius:6,
      fill:true,
    }],
  };
  const barOpts={
    responsive:true,maintainAspectRatio:false,
    animation:{duration:700,easing:'easeOutQuart'},
    plugins:{legend:{display:false},tooltip:{..._tip,bodyColor:'#1D9E75',callbacks:{title:([i])=>i.label,label:ctx=>fmt(ctx.raw||0)}}},
    scales:_scales('€'),
  };
  const lineOpts={
    responsive:true,maintainAspectRatio:false,
    animation:{duration:700,easing:'easeOutQuart'},
    plugins:{legend:{display:false},tooltip:{..._tip,bodyColor:'#F9A26C',callbacks:{title:([i])=>i.label,label:ctx=>`${(ctx.raw||0).toFixed(1)} %`}}},
    scales:_scales('%'),
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:28,width:"100%",overflow:"hidden"}}>
      {!isPremium&&!loading&&items.length>0&&items.length<18&&(
        <div style={{background:C.tealLight,border:`1px solid ${C.teal}33`,borderRadius:12,padding:"12px 18px",textAlign:"center",overflow:"hidden"}}>
          <div style={{fontSize:13,fontWeight:600,color:20-items.length<=2?"#C05621":C.teal}}>
            {20-items.length<=2
              ? tpl('urgenceArticles',{n:20-items.length})
              : tpl('articlesGratuits',{n:20-items.length})
            }
          </div>
        </div>
      )}
      {!isNative&&!isPremium&&!loading&&items.length>=18&&(
        <div onClick={()=>{triggerCheckout();}} style={{background:"#FEF9E7",border:"1px solid rgba(249,162,108,0.4)",borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,cursor:"pointer"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D"}}>{lang==='en'?`⚠️ Only ${20-items.length} item${20-items.length>1?"s":""} left on your free plan`:`⚠️ Plus que ${20-items.length} article${20-items.length>1?"s":""} disponible${20-items.length>1?"s":""}`}</div>
          <button onClick={e=>{e.stopPropagation();triggerCheckout();}} style={{background:"#1D9E75",color:"#fff",border:"none",borderRadius:99,padding:"6px 12px",fontSize:11,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{t('debloquer')}</button>
        </div>
      )}
      {loading?(
        <div style={{textAlign:"center",padding:"60px 0",color:C.sub,fontSize:14,fontWeight:600}}>{lang==='en'?"Loading data...":"Chargement des données..."}</div>
      ):items.length===0&&sales.length===0?(
        <div style={{maxWidth:520,margin:"40px auto 0",animation:"fadeIn 0.4s ease",width:"100%"}}>
          <EmptyStateDashboard
            lang={lang}
            onTryVoice={()=>fabTriggerRef.current?.()}
            onAddManual={()=>{setTab(1); localStorage.setItem('tab',1);}}
          />
        </div>
      ):(
        <>
          {/* Badge mois */}
          <div>
            <div style={{display:"inline-flex",alignItems:"center",gap:4,background:"#E8F5F0",color:"#0F6E56",border:"1px solid #9FE1CB",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:10}}>
              <div style={{width:4,height:4,borderRadius:"50%",background:"#1D9E75",flexShrink:0}}/>
              {(lang==='en'?MONTHS_EN:MONTHS_FR)[now.getMonth()]} {now.getFullYear()}
            </div>
            <div style={{fontSize:32,fontWeight:900,color:"#0D0D0D",letterSpacing:"-0.04em",lineHeight:1,marginBottom:18}}>
              {(()=>{const title=t('dashTitle');const hi=t('dashTitleHighlight');const idx=title.lastIndexOf(hi);return idx<0?<span style={{color:"#1D9E75"}}>{title}</span>:<>{title.slice(0,idx)}<span style={{color:"#1D9E75"}}>{hi}</span></>;})()}
            </div>
          </div>

          {/* Hero card profit net */}
          <div onClick={()=>{if(!isPremium&&isNative){handleIAPPurchase();}else if(!isPremium&&!isNative){triggerCheckout();}else if(isPremium){setTab(4);localStorage.setItem('tab',4);}}}
            className="profit-hero card-enter"
            onMouseEnter={e=>{e.currentTarget.style.filter="brightness(1.08)";}}
            onMouseLeave={e=>{e.currentTarget.style.filter="brightness(1)";}}
          >
            <div className="lbl" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span>{t('profitNet')}</span>
              <span style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:99,padding:"3px 8px",fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.85)"}}>{tm.profit>=0?"+":""}{fmt(tm.profit)} {t('ceNoisPill')}</span>
            </div>
            <div className="amt">{fmt(totalM)}</div>
            <div className="meta">
              <span>{tpl('venteLabel',{n:salesForKpis.length})} · {t('margeMoyDash')} {fmt(salesForKpis.length?totalM/salesForKpis.length:0)}</span>
            </div>
            {!isPremium&&<div className="sub-text">{t('unlocAnalyse')}</div>}
            {isPremium&&<div className="sub-text">{t('analyseComplete')}</div>}
          </div>

          {/* KPIs 2 colonnes */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Kpi label={t('ceMois')} value={fmt(tm?.profit||0)} sub={tpl('venteLabel',{n:tm?.count||0})} color="#1D9E75" icon="📊"/>
            <Kpi label={t('margeMoy')} value={fmtp(avgM)} sub={t('toutesVentes')} color="#5DCAA5" icon="📈"/>
            <Kpi label={t('revenuBrutLabel')} value={fmt(totalR)} sub={t('totalEncaisse')} color="#1D9E75" icon="💎"/>
            <Kpi label={t('enStock')} value={`${stock.length}`} sub={`${fmt(stockVal)} ${t('investi')}`} color="#A3A9A6" icon="📦"/>
          </div>

          {/* Sélecteur de période */}
          <div style={{display:"flex",justifyContent:"flex-end",gap:6,flexWrap:"wrap"}}>
            {['7j','1M','6M','1A','YTD'].map(r=>(
              <button key={r} onClick={()=>setSelectedRange(r)} style={{padding:"5px 12px",borderRadius:8,border:"none",fontSize:12,fontWeight:700,cursor:"pointer",transition:"all 0.15s",background:selectedRange===r?"#1D9E75":"#fff",color:selectedRange===r?"#fff":"#A3A9A6",boxShadow:selectedRange===r?"none":"0 1px 3px rgba(0,0,0,0.06)"}}>
                {lang==='en'?({'7j':'7d','1A':'1Y'}[r]||r):r}
              </button>
            ))}
          </div>

          <div className="grid2">
            <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D",marginBottom:2}}>{t('benefices')}</div>
              <div style={{fontSize:11,color:"#A3A9A6",marginBottom:14,fontWeight:600}}>
                {selectedRange==='7j'?t('dernierNJours'):selectedRange==='1M'?t('trente'):selectedRange==='1A'?t('douze'):selectedRange==='YTD'?t('depuisJanvier'):t('sixMois')}
              </div>
              <div style={{position:"relative",height:"200px",width:"100%"}}>
                <Bar data={barChartData} options={barOpts}/>
              </div>
            </div>
            <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D",marginBottom:2}}>{t('evolutionMarge')}</div>
              <div style={{fontSize:11,color:"#A3A9A6",marginBottom:14,fontWeight:600}}>
                {selectedRange==='7j'?t('dernierNJours'):selectedRange==='1M'?t('trente'):selectedRange==='1A'?t('douze'):selectedRange==='YTD'?t('depuisJanvier'):t('sixMois')}
              </div>
              <div style={{position:"relative",height:"200px",width:"100%"}}>
                <Line data={lineChartData} options={lineOpts}/>
              </div>
            </div>
          </div>

          {hasData&&(
            <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D",marginBottom:14}}>{t('dernieresventes')}</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {groupSales(sales).slice(0,5).map(s=>{
                  const d=new Date(s.date);const mc=!s.marginPct||s.marginPct<5?"#E53E3E":s.marginPct<20?"#F9A26C":s.marginPct<40?"#5DCAA5":"#1D9E75";
                  return(
                    <SwipeRow key={s.id} onDelete={()=>delSale(s.id)} style={{borderLeft:`3px solid ${getCatBorder(s.type)}`}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:800,fontSize:13,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
                          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</span>
                          {(s._qty||1)>1&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 6px",fontSize:10,fontWeight:800,flexShrink:0,border:"1px solid #9FE1CB"}}>×{s._qty}</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",marginTop:2}}>
                          <span style={{fontSize:11,fontWeight:700,color:"#A3A9A6"}}>{d.getDate()} {(lang==='en'?MONTHS_EN:MONTHS_FR)[d.getMonth()]}</span>
                          {s.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 6px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{marqueLabel(s.marque,lang)}</span>}
                          {s.type&&s.type!=="Autre"&&(()=>{const ts2=getTypeStyle(s.type);return<span style={{background:ts2.bg,color:ts2.color,borderRadius:99,padding:"1px 6px",fontSize:10,fontWeight:700,border:`1px solid ${ts2.border}`}}>{ts2.emoji}</span>;})()}
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontWeight:900,fontSize:16,color:mc}}>{s.margin>=0?"+":""}{fmt(s.margin)}</div>
                        <div style={{fontSize:11,color:"#6B7280",marginTop:1}}>{fmtp(s.marginPct)}</div>
                      </div>
                    </SwipeRow>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{display:"flex",justifyContent:"center"}}>
            <div className="card" style={{padding:"28px 32px",border:`1px solid ${C.red}30`,background:"rgba(254,242,242,0.6)",borderRadius:20,maxWidth:480,width:"100%",textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#C53030",marginBottom:6}}>⚠️ {t('zoneDangereuse')}</div>
              <div style={{fontSize:13,color:C.sub,marginBottom:20,lineHeight:1.6}}>{t('zoneDesc')}</div>
              {resetStep===0&&(
                <button onClick={handleReset} style={{padding:"10px 22px",background:"transparent",border:`1.5px solid ${C.red}99`,borderRadius:12,color:C.red,fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.2s",display:"block",margin:"0 auto"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(229,62,62,0.08)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}
                >🗑️ {t('toutRemettre')}</button>
              )}
              {resetStep===1&&(
                <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"center"}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.red}}>{t('confirmeAction')}</div>
                  <button onClick={handleReset} style={{padding:"10px 20px",background:C.red,border:"none",borderRadius:12,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.2s"}}>{t('ouiToutSupprimer')}</button>
                  <button onClick={()=>setResetStep(0)} style={{padding:"10px 20px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:12,color:C.sub,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.2s"}}>{t('annuler')}</button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export default DashboardTab;
