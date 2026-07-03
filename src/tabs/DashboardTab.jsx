import { memo } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { Bar, Line } from 'react-chartjs-2';
import { formatCurrency, fmtp, MONTHS_FR, MONTHS_EN, groupSales } from '../utils/shared';
import { UI, Card, Loader, SegmentedPills, StatTile } from '../components/ui';

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

// Petite sparkline blanche/translucide pour le hero (tendance visuelle sur fond dégradé).
function HeroSparkline({ data, width=120, height=32 }) {
  const vals = data.length ? data : [0,0];
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const range = (max - min) || 1;
  const pts = vals.map((v,i)=>{
    const x = vals.length>1 ? (width*i)/(vals.length-1) : width/2;
    const y = height - ((v-min)/range)*height;
    return [x,y];
  });
  const line = pts.map(p=>p.join(',')).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  const last = pts[pts.length-1];
  return (
    <svg width={width} height={height} style={{ display:'block', overflow:'visible' }}>
      <polygon points={area} fill="rgba(255,255,255,0.16)" />
      <polyline points={line} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="2.5" fill="#fff" />}
    </svg>
  );
}

const DashboardTab = memo(function DashboardTab({
  lang, currency, isPremium, isNative, username, loading,
  items, sales, stock, stockVal, stockQty,
  tm, salesForKpis, totalM,
  selectedRange, setSelectedRange,
  delSale, resetStep, setResetStep, handleReset,
  fabTriggerRef, triggerCheckout, handleIAPPurchase, openUpgradeModal, setTab,
  EmptyStateDashboard,
}) {
  const { t, tpl } = useTranslation(lang);
  const fmt = (amount, dec=null) => formatCurrency(amount, currency, dec);
  const now = new Date();

  const mData = buildChartData(sales, selectedRange, now, lang);
  const totalR = salesForKpis.reduce((a,s)=>a+s.sell,0);
  const avgM = totalR>0?(totalM/totalR)*100:0;
  const hasData = sales.length>0;

  const _f={family:"'Space Grotesk', -apple-system, sans-serif",size:11};
  const _tip={backgroundColor:UI.ink,titleColor:'rgba(255,255,255,0.6)',borderColor:'transparent',borderWidth:0,padding:12,cornerRadius:10,displayColors:false,titleFont:{..._f,size:11,weight:'700'},bodyFont:{..._f,size:14,weight:'700'}};
  const _scales=(unit)=>({
    x:{grid:{display:false},border:{display:false},ticks:{color:UI.mute,font:_f}},
    y:{grid:{color:UI.border,drawTicks:false},border:{display:false},ticks:{color:UI.mute,font:_f,padding:8,callback:unit==='€'?v=>fmt(v,0):v=>v+unit}},
  });
  const barChartData={
    labels:mData.map(d=>d.name),
    datasets:[{
      data:mData.map(d=>d.profit),
      backgroundColor:UI.teal,
      hoverBackgroundColor:UI.tealDeep,
      borderRadius:8,
      borderSkipped:false,
    }],
  };
  const lineChartData={
    labels:mData.map(d=>d.name),
    datasets:[{
      data:mData.map(d=>d['Marge %']),
      borderColor:UI.amber,
      backgroundColor:'rgba(232,149,109,0.12)',
      borderWidth:3,
      tension:0.4,
      pointBackgroundColor:UI.amber,
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
    plugins:{legend:{display:false},tooltip:{..._tip,bodyColor:UI.teal,callbacks:{title:([i])=>i.label,label:ctx=>fmt(ctx.raw||0)}}},
    scales:_scales('€'),
  };
  const lineOpts={
    responsive:true,maintainAspectRatio:false,
    animation:{duration:700,easing:'easeOutQuart'},
    plugins:{legend:{display:false},tooltip:{..._tip,bodyColor:UI.amber,callbacks:{title:([i])=>i.label,label:ctx=>`${(ctx.raw||0).toFixed(1)} %`}}},
    scales:_scales('%'),
  };

  // ── Activité récente : fusion ventes + ajouts stock, déjà chargés côté client ──
  const recentActivity = (()=>{
    if(!hasData && (!stock || stock.length===0)) return [];
    const soldRows = groupSales(sales).slice(0,5).map(s=>({
      kind:'sale', id:`s-${s.id}`, date:s.date, title:s.title, marque:s.marque, type:s.type,
      amount:s.margin, qty:s._qty||1,
    }));
    const addRows = (stock||[])
      .filter(i=>i.date_ajout||i.created_at)
      .slice()
      .sort((a,b)=>new Date(b.date_ajout||b.created_at)-new Date(a.date_ajout||a.created_at))
      .slice(0,5)
      .map(i=>({
        kind:'add', id:`a-${i.id}`, date:i.date_ajout||i.created_at, title:i.title, marque:i.marque, type:i.type,
        amount:i.buy, qty:i.quantite||1,
      }));
    return [...soldRows, ...addRows]
      .sort((a,b)=>new Date(b.date)-new Date(a.date))
      .slice(0,5);
  })();

  return (
    <div style={{display:"flex",flexDirection:"column",gap:24,width:"100%",overflow:"hidden"}}>
      {!isPremium&&!loading&&items.length>0&&items.length<18&&(
        <div style={{background:UI.chip,border:`1px solid ${UI.border}`,borderRadius:14,padding:"12px 18px",textAlign:"center",overflow:"hidden"}}>
          <div style={{fontSize:13,fontWeight:600,color:20-items.length<=2?UI.amber:UI.tealDeep}}>
            {20-items.length<=2
              ? tpl('urgenceArticles',{n:20-items.length})
              : tpl('articlesGratuits',{n:20-items.length})
            }
          </div>
        </div>
      )}
      {!isNative&&!isPremium&&!loading&&items.length>=18&&(
        <div onClick={()=>openUpgradeModal()} style={{background:UI.card,border:`1px solid ${UI.border}`,borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,cursor:"pointer"}}>
          <div style={{fontSize:13,fontWeight:600,color:UI.ink}}>{lang==='en'?`⚠️ Only ${20-items.length} item${20-items.length>1?"s":""} left on your free plan`:`⚠️ Plus que ${20-items.length} article${20-items.length>1?"s":""} disponible${20-items.length>1?"s":""}`}</div>
          <button onClick={e=>{e.stopPropagation();openUpgradeModal();}} style={{background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,color:"#fff",border:"none",borderRadius:99,padding:"7px 14px",fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{t('debloquer')}</button>
        </div>
      )}
      {loading?(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"70px 0"}}>
          <Loader size={38} />
          <div style={{fontSize:13.5,fontWeight:500,color:UI.mute2}}>{lang==='en'?"Loading data...":"Chargement des données..."}</div>
        </div>
      ):items.length===0&&sales.length===0?(
        <div style={{maxWidth:520,margin:"40px auto 0",animation:"fadeIn 0.4s ease",width:"100%"}}>
          <EmptyStateDashboard
            lang={lang}
            onTryVoice={()=>fabTriggerRef.current?.()}
            onAddManual={()=>{setTab(1); localStorage.setItem('tab',1);}}
            onPremium={()=>isNative?handleIAPPurchase():openUpgradeModal()}
          />
        </div>
      ):(
        <>
          {/* Badge mois + greeting */}
          <div>
            <div style={{display:"inline-flex",alignItems:"center",gap:6,background:UI.chip,color:UI.mute2,borderRadius:99,padding:"4px 10px",fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:UI.teal,flexShrink:0}}/>
              {(lang==='en'?MONTHS_EN:MONTHS_FR)[now.getMonth()]} {now.getFullYear()}
            </div>
            <div style={{fontSize:30,fontWeight:600,color:UI.ink,letterSpacing:"-0.03em",lineHeight:1.15}}>
              {username?<>{lang==='en'?'Hello':'Bonjour'} <span style={{color:UI.teal}}>{username}</span> 👋</>:lang==='en'?'Hello 👋':'Bonjour 👋'}
            </div>
          </div>

          {/* Hero card profit net */}
          <div
            onClick={()=>{setTab(4);localStorage.setItem('tab',4);}}
            style={{
              position:"relative", overflow:"hidden", cursor:"pointer",
              background:`linear-gradient(155deg,${UI.teal} 0%,${UI.tealDeep} 100%)`,
              borderRadius:24, padding:"22px 22px 20px",
              boxShadow:`0 16px 36px -12px rgba(27,110,98,0.5)`,
              transition:"filter 0.2s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.filter="brightness(1.05)";}}
            onMouseLeave={e=>{e.currentTarget.style.filter="brightness(1)";}}
          >
            <div style={{position:"absolute",pointerEvents:"none",top:"-30%",right:"-10%",width:220,height:220,borderRadius:"50%",background:"radial-gradient(circle,rgba(255,255,255,0.16),transparent 70%)"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,position:"relative"}}>
              <span style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",color:"rgba(255,255,255,0.75)"}}>{t('profitNet')}</span>
              <span style={{background:"rgba(255,255,255,0.16)",border:"1px solid rgba(255,255,255,0.22)",borderRadius:99,padding:"3px 9px",fontSize:10,fontWeight:600,color:"#fff"}}>{tm.profit>=0?"+":""}{fmt(tm.profit)} {t('ceNoisPill')}</span>
            </div>
            <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:12,position:"relative"}}>
              <div style={{fontSize:40,fontWeight:600,color:"#fff",letterSpacing:"-0.03em",lineHeight:1}}>{fmt(totalM)}</div>
              <HeroSparkline data={mData.map(d=>d.profit)} />
            </div>
            <div style={{fontSize:12.5,color:"rgba(255,255,255,0.8)",fontWeight:500,marginTop:10,position:"relative"}}>
              {tpl('venteLabel',{n:salesForKpis.length})} · {t('margeMoyDash')} {fmt(salesForKpis.length?totalM/salesForKpis.length:0)}
            </div>
            <div style={{fontSize:11.5,color:"rgba(255,255,255,0.65)",fontWeight:500,marginTop:6,position:"relative"}}>{t('analyseComplete')}</div>
          </div>

          {/* KPIs 2x2 — tuile colorée + icône, même vocabulaire que StockTab */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <StatTile icon="📊" tileColor={UI.teal} label={t('ceMois')} value={fmt(tm?.profit||0)} sub={tpl('venteLabel',{n:tm?.count||0})} />
            <StatTile icon="📈" tileColor={UI.tealDeep} label={t('margeMoy')} value={fmtp(avgM)} sub={t('toutesVentes')} />
            <StatTile icon="💎" tileColor={UI.amber} label={t('revenuBrutLabel')} value={fmt(totalR)} sub={t('totalEncaisse')} />
            <StatTile icon="📦" tileColor={UI.mute} label={t('enStock')} value={`${stockQty??stock.length}`} sub={`${fmt(stockVal)} ${t('investi')}`} />
          </div>

          {/* Sélecteur de période */}
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <SegmentedPills
              options={['7j','1M','6M','1A','YTD']}
              value={selectedRange}
              onChange={setSelectedRange}
              labelFn={r=>lang==='en'?({'7j':'7d','1A':'1Y'}[r]||r):r}
            />
          </div>

          <div className="grid2">
            <Card style={{padding:18}}>
              <div style={{fontSize:13,fontWeight:600,color:UI.ink,marginBottom:2}}>{t('benefices')}</div>
              <div style={{fontSize:11,color:UI.mute,marginBottom:14,fontWeight:500}}>
                {selectedRange==='7j'?t('dernierNJours'):selectedRange==='1M'?t('trente'):selectedRange==='1A'?t('douze'):selectedRange==='YTD'?t('depuisJanvier'):t('sixMois')}
              </div>
              <div style={{position:"relative",height:"200px",width:"100%"}}>
                <Bar data={barChartData} options={barOpts}/>
              </div>
            </Card>
            <Card style={{padding:18}}>
              <div style={{fontSize:13,fontWeight:600,color:UI.ink,marginBottom:2}}>{t('evolutionMarge')}</div>
              <div style={{fontSize:11,color:UI.mute,marginBottom:14,fontWeight:500}}>
                {selectedRange==='7j'?t('dernierNJours'):selectedRange==='1M'?t('trente'):selectedRange==='1A'?t('douze'):selectedRange==='YTD'?t('depuisJanvier'):t('sixMois')}
              </div>
              <div style={{position:"relative",height:"200px",width:"100%"}}>
                <Line data={lineChartData} options={lineOpts}/>
              </div>
            </Card>
          </div>

          {/* Activité récente — ventes + ajouts stock fusionnés, triés par date */}
          {recentActivity.length>0&&(
            <Card style={{padding:18}}>
              <div style={{fontSize:13,fontWeight:600,color:UI.ink,marginBottom:14}}>
                {lang==='en'?'Recent activity':'Activité récente'}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                {recentActivity.map((a,i)=>{
                  const d=new Date(a.date);
                  const isSale=a.kind==='sale';
                  return(
                    <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderTop:i>0?`1px solid ${UI.border}`:"none"}}>
                      <div style={{width:32,height:32,borderRadius:10,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,background:isSale?"rgba(47,158,144,0.14)":UI.chip,color:isSale?UI.tealDeep:UI.mute2}}>
                        {isSale?"💰":"➕"}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:13,color:UI.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
                          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</span>
                          {a.qty>1&&<span style={{background:UI.chip,color:UI.mute2,borderRadius:99,padding:"1px 6px",fontSize:10,fontWeight:600,flexShrink:0}}>×{a.qty}</span>}
                        </div>
                        <div style={{fontSize:11,fontWeight:500,color:UI.mute,marginTop:1}}>
                          {d.getDate()} {(lang==='en'?MONTHS_EN:MONTHS_FR)[d.getMonth()]} · {isSale?(lang==='en'?'Sold':'Vendu'):(lang==='en'?'Added':'Ajouté')}
                        </div>
                      </div>
                      <div style={{fontWeight:600,fontSize:14,color:isSale?(a.amount>=0?UI.tealDeep:UI.negative):UI.mute2,flexShrink:0}}>
                        {isSale?`${a.amount>=0?"+":""}${fmt(a.amount)}`:fmt(a.amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
});

export default DashboardTab;
