import { memo, useState, useEffect, useMemo } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { Line } from 'react-chartjs-2';
import { formatCurrency, typeLabel, marqueLabel, getTypeStyle } from '../utils/shared';

function renderMd(text){
  const html=text
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/\n/g,'<br/>');
  return{__html:html};
}

function normalizeCat(raw){
  if(!raw) return 'Autre';
  const v=raw.toLowerCase()
    .replace(/[éèêë]/g,'e').replace(/[àâ]/g,'a').replace(/[ùû]/g,'u').replace(/[îï]/g,'i').replace(/[ôö]/g,'o')
    .replace(/[^a-z]/g,'');
  if(v==='mode'||v==='fashion') return 'Mode';
  if(v==='hightech'||v==='tech'||v==='hitech') return 'High-Tech';
  if(v==='luxe'||v==='luxury') return 'Luxe';
  if(v==='maison'||v==='home') return 'Maison';
  if(v==='sport') return 'Sport';
  if(v==='musique'||v==='music') return 'Musique';
  if(v==='beaute'||v==='beauty') return 'Beauté';
  if(v==='collection') return 'Collection';
  if(v==='livres'||v==='books') return 'Livres';
  if(v==='automoto'||v==='auto') return 'Auto-Moto';
  if(v==='electromenager'||v==='electro') return 'Électroménager';
  if(v==='jouets'||v==='toys') return 'Jouets';
  return 'Autre';
}

const CAT_COLORS_MAP={
  'Mode':'#DB2777','High-Tech':'#2563EB','Luxe':'#D97706','Maison':'#16A34A',
  'Sport':'#7C3AED','Musique':'#9333EA','Beauté':'#EC4899','Collection':'#F59E0B',
  'Livres':'#84CC16','Auto-Moto':'#EF4444','Électroménager':'#06B6D4','Jouets':'#F97316',
  'Autre':'#6B7280',
};

function Sparkline({ data, color = '#2DB89A', width = 80, height = 28 }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  if (data.length === 1) {
    const y = height - ((data[0] - min) / range) * height;
    return (
      <svg width={width} height={height} style={{display:'block'}}>
        <circle cx={width / 2} cy={y} r="2.5" fill={color} />
      </svg>
    );
  }
  const points = data.map((v, i) => {
    const x = (width * i) / (data.length - 1);
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  const last = data.map((v, i) => [(width * i) / (data.length - 1), height - ((v - min) / range) * height]).pop();
  return (
    <svg width={width} height={height} style={{display:'block'}}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}

function DonutChart({segments, totalLabel, totalValue}){
  const r = 56, cx = 70, cy = 70, circ = 2 * Math.PI * r;
  const GAP = 2;
  let offset = 0;
  return (
    <div className="donut-svg">
      <svg width={140} height={140} viewBox="0 0 140 140">
        <g transform="rotate(-90 70 70)">
          <circle className="track" cx={cx} cy={cy} r={r} />
          {segments.map((s, i) => {
            const dash = Math.max(0, (s.pct / 100) * circ - GAP);
            const gap = circ - dash;
            const el = (
              <circle
                key={i}
                className="seg"
                cx={cx}
                cy={cy}
                r={r}
                stroke={s.color}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={-offset}
                style={{ animation: `legendGrow 0.9s cubic-bezier(0.65,0,0.35,1) ${0.1 + i * 0.08}s both` }}
              />
            );
            offset += dash + GAP;
            return el;
          })}
        </g>
      </svg>
      {totalValue !== undefined && (
        <div className="center-stack" style={{overflow:'hidden'}}>
          <div className="lbl">{totalLabel || 'Total'}</div>
          <div className="v" style={{
            fontSize:String(totalValue).length<=8?'1.1rem':String(totalValue).length<=11?'0.85rem':String(totalValue).length<=14?'0.7rem':'0.58rem',
            wordBreak:'break-all',overflow:'hidden',lineHeight:1.1,textAlign:'center',maxWidth:'90%'
          }}>{totalValue}</div>
        </div>
      )}
    </div>
  );
}

function AvgDaysChart({filtered, items, lang}) {
  const itemDateMap = useMemo(() => {
    const m = {};
    items.forEach(i => { if (i.title && (i.date_ajout || i.created_at)) m[i.title.toLowerCase().trim()] = i.date_ajout || i.created_at; });
    return m;
  }, [items]);

  const catDays = useMemo(() => {
    const acc = {};
    filtered.forEach(s => {
      const key = s.title?.toLowerCase().trim();
      const purchaseDate = key && itemDateMap[key];
      if (!purchaseDate || !s.date) return;
      const diff = Math.max(0, Math.round((new Date(s.date) - new Date(purchaseDate)) / 86400000));
      const cat = normalizeCat(s.type || s.categorie || '');
      if (!acc[cat]) acc[cat] = {total:0, count:0};
      acc[cat].total += diff;
      acc[cat].count++;
    });
    return Object.entries(acc)
      .map(([cat, {total, count}]) => ({cat, avg: Math.round(total / count)}))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 7);
  }, [filtered, itemDateMap]);

  const maxAvg = Math.max(...catDays.map(d => d.avg), 1);
  const card = {background:'#fff',borderRadius:14,padding:'16px',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'};

  return (
    <div style={card}>
      <div style={{fontSize:12,fontWeight:800,color:'#0D0D0D',marginBottom:14}}>
        {lang==='en'?'⏱ Avg. days to sell by category':'⏱ Délai moy. vente par catégorie'}
      </div>
      {catDays.length===0?(
        <div style={{fontSize:12,color:'#A3A9A6',fontWeight:600,fontStyle:'italic',textAlign:'center',padding:'12px 0'}}>
          {lang==='en'?'⏱️ Will appear after your first sales':'⏱️ Apparaîtra après tes premières ventes'}
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {catDays.map(({cat, avg}) => {
            const ts = getTypeStyle(cat);
            const pct = (avg / maxAvg) * 100;
            return (
              <div key={cat} style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:82,flexShrink:0,fontSize:11,fontWeight:700,color:ts.color,textAlign:'right',whiteSpace:'nowrap'}}>
                  {ts.emoji} {cat}
                </div>
                <div style={{flex:1,height:8,background:'#F3F4F6',borderRadius:99,overflow:'hidden'}}>
                  <div style={{width:`${pct}%`,height:'100%',background:ts.color,borderRadius:99,transition:'width 0.6s cubic-bezier(0.4,0,0.2,1)'}}/>
                </div>
                <div style={{width:32,flexShrink:0,fontSize:11,fontWeight:800,color:'#0D0D0D',textAlign:'right'}}>
                  {avg}{lang==='en'?'d':'j'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const StatsTab = memo(function StatsTab({sales,items,lang,currency='EUR',user,aiCache={},setAiCache=()=>{},setTab=()=>{}}){
  const RANGES=lang==='en'?['1M','3M','6M','1Y','All']:['1M','3M','6M','1A','Tout'];
  const [range,setRange]=useState('6M');
  const [aiText,setAiText]=useState('');
  const [aiLoading,setAiLoading]=useState(false);

  const now=new Date();
  const cutoff=useMemo(()=>{
    const d=new Date();
    if(range==='1M'){d.setMonth(d.getMonth()-1);}
    else if(range==='3M'){d.setMonth(d.getMonth()-3);}
    else if(range==='6M'){d.setMonth(d.getMonth()-6);}
    else if(range==='1A'||range==='1Y'){d.setFullYear(d.getFullYear()-1);}
    else d.setFullYear(2000);
    return d;
  },[range]);

  const filtered=useMemo(()=>sales.filter(s=>{
    const d=new Date(s.created_at||s.date||0);
    return d>=cutoff;
  }),[sales,cutoff]);

  const totalProfit=filtered.reduce((a,s)=>a+(s.margin||0),0);
  const totalRev=filtered.reduce((a,s)=>a+(s.sell||0),0);
  const avgMargin=filtered.length?Math.round(filtered.reduce((a,s)=>a+(s.marginPct||0),0)/filtered.length*10)/10:0;

  const titleToType=useMemo(()=>{
    const m={};
    items.forEach(i=>{if(i.title)m[i.title.toLowerCase().trim()]=i.type;});
    return m;
  },[items]);

  const catMap={};
  filtered.forEach(s=>{
    const raw=s.type||s.categorie||titleToType[s.title?.toLowerCase()?.trim()]||'';
    const c=normalizeCat(raw);
    catMap[c]=(catMap[c]||0)+(s.margin||0);
  });
  const catEntries=Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  const bestCategory=catEntries[0]?.[0]||null;
  const bestCatProfit=catEntries[0]?.[1]||0;
  const bestCategoryPct=totalProfit>0?Math.round((bestCatProfit/totalProfit)*100):0;
  const bestItem=[...filtered].sort((a,b)=>(b.margin||0)-(a.margin||0))[0];
  const bestItemName=bestItem?.title||null;
  const bestItemProfit=bestItem?.margin||0;

  const totalCatProfit=catEntries.reduce((a,[,v])=>a+(v>0?v:0),0)||1;
  const donutSegs=catEntries.filter(([,v])=>v>0).map(([c,v])=>({color:CAT_COLORS_MAP[c]||'#6B7280',pct:(v/totalCatProfit)*100,label:c}));

  const monthlyMap={};
  filtered.forEach(s=>{
    const d=new Date(s.created_at||s.date||0);
    const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthlyMap[k]=(monthlyMap[k]||0)+(s.margin||0);
  });
  const monthKeys=Object.keys(monthlyMap).sort();
  const chartData=monthKeys.map(k=>({name:k.slice(5),profit:Math.round(monthlyMap[k]*100)/100}));

  const dailyData=useMemo(()=>{
    const map={};
    filtered.forEach(s=>{
      const key=(s.created_at||s.date||'').slice(0,10);
      if(key) map[key]=(map[key]||0)+(s.margin||0);
    });
    const totalDays=Math.max(1,Math.ceil((new Date()-cutoff)/86400000));
    const step=totalDays>180?7:totalDays>60?3:1;
    const result=[];
    for(let d=new Date(cutoff);d<=new Date();d.setDate(d.getDate()+step)){
      const keys=Array.from({length:step},(_,i)=>{const dd=new Date(d);dd.setDate(dd.getDate()+i);return dd.toISOString().slice(0,10);});
      const profit=keys.reduce((a,k)=>a+(map[k]||0),0);
      const ld=new Date(d);
      result.push({label:`${ld.getDate()}/${ld.getMonth()+1}`,profit});
    }
    return result;
  },[filtered,cutoff]);

  const avgBasket=filtered.length?totalRev/filtered.length:0;
  const avgDays=useMemo(()=>{
    const itemDateMap={};
    items.forEach(i=>{if(i.title&&i.date_ajout)itemDateMap[i.title.toLowerCase().trim()]=i.date_ajout;});
    const pairs=filtered.filter(s=>s.date&&itemDateMap[s.title?.toLowerCase().trim()]);
    if(!pairs.length) return null;
    const total=pairs.reduce((acc,s)=>{
      const diff=(new Date(s.date)-new Date(itemDateMap[s.title.toLowerCase().trim()]))/86400000;
      return acc+Math.max(0,diff);
    },0);
    return Math.round(total/pairs.length);
  },[filtered,items]);

  const topSellers=[...filtered].sort((a,b)=>(b.margin||0)-(a.margin||0)).slice(0,3);
  const topSellerDaysMap=useMemo(()=>{
    const m={};
    items.forEach(i=>{if(i.title&&(i.date_ajout||i.created_at))m[i.title.toLowerCase().trim()]=i.date_ajout||i.created_at;});
    return m;
  },[items]);

  const slowStock=[...items].filter(i=>i.statut!=='vendu').sort((a,b)=>new Date(a.date_ajout||a.date||0)-new Date(b.date_ajout||b.date||0)).slice(0,3);
  const slowCount=[...items].filter(i=>{
    if(i.statut==='vendu') return false;
    return (now-new Date(i.date_ajout||i.date||0))>30*24*3600*1000;
  }).length;

  const PERIOD_CACHE_KEY={'1M':'1m','3M':'3m','6M':'6m','1A':'1y','1Y':'1y','Tout':'all','All':'all'};

  const activeItemCount=useMemo(()=>items.filter(i=>i.statut!=='vendu').length,[items]);
  const dataHash=useMemo(()=>`${filtered.length}_${activeItemCount}_${Math.round(totalProfit)}`,[filtered.length,activeItemCount,totalProfit]);

  useEffect(()=>{
    if(filtered.length===0){setAiText('');return;}
    const SURL=supabaseUrl;
    if(!user?.id){setAiText('');return;}
    const cacheKey=PERIOD_CACHE_KEY[range]??range;

    // Tier 1 : cache mémoire — instantané, zéro réseau
    const memEntry=aiCache[cacheKey];
    if(memEntry&&memEntry.hash===dataHash&&memEntry.result){
      setAiText(memEntry.result);
      return;
    }

    setAiLoading(true);
    setAiText('');
    supabase.from('profiles').select('stats_analysis_cache').eq('id',user.id).single()
      .then(async ({data:profile})=>{
        const cache=profile?.stats_analysis_cache??{};
        const periodCache=cache[cacheKey];
        // Tier 2 : cache Supabase
        if(periodCache&&periodCache.hash===dataHash&&periodCache.result){
          setAiText(periodCache.result);setAiLoading(false);
          setAiCache(prev=>({...prev,[cacheKey]:{hash:dataHash,result:periodCache.result}}));
          return;
        }
        const{data:{session:stSess}}=await supabase.auth.getSession();
        const stToken=stSess?.access_token;
        if(!stToken){setAiText(lang==='en'?'Session expired, please reconnect.':'Session expirée, reconnectez-vous.');setAiLoading(false);return;}
        fetch(`${SURL}/functions/v1/stats-analysis`,{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${stToken}`,'apikey':supabaseAnonKey},
          body:JSON.stringify({periode:range,profit:Math.round(totalProfit),ventes:filtered.length,marge:avgMargin,meilleure_cat:bestCategory||'',meilleure_cat_pct:bestCategoryPct,meilleur_article:bestItemName||'',meilleur_article_profit:Math.round(bestItemProfit),articles_lents:slowCount,lang}),
        })
          .then(async r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();})
          .then(d=>{
            const result=d?.analysis||'';
            setAiText(result);setAiLoading(false);
            setAiCache(prev=>({...prev,[cacheKey]:{hash:dataHash,result}}));
            const updatedCache={...cache,[cacheKey]:{hash:dataHash,result}};
            supabase.from('profiles').update({stats_analysis_cache:updatedCache}).eq('id',user.id);
          })
          .catch(()=>{setAiLoading(false);});
      });
  },[range,dataHash]);

  const fmt2=n=>formatCurrency(n,currency);
  const fmtp2=n=>(Math.round(n*10)/10).toFixed(1)+'%';

  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      {/* Range pills */}
      <div className="range-row">
        {RANGES.map(r=>(
          <button key={r} className={`range-pill${range===r?' on':''}`} onClick={()=>setRange(r)}>{r}</button>
        ))}
      </div>

      {/* Hero KPIs */}
      <div className="kpi-hero-row">
        <div className="kpi-hero" style={{background:'linear-gradient(135deg,#0F6E56,#1D9E75)',color:'#fff'}}>
          <div style={{fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.07em',opacity:0.7,marginBottom:4}}>{lang==='en'?'Total profit':'Profit total'}</div>
          <div style={{fontSize:28,fontWeight:900,letterSpacing:'-0.03em',lineHeight:1}}>{filtered.length===0?'--':fmt2(totalProfit)}</div>
        </div>
        <div className="kpi-hero" style={{background:'#fff',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
          <div style={{fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.07em',color:'#6B7280',marginBottom:4}}>{lang==='en'?'Revenue':'Revenu'}</div>
          <div style={{fontSize:28,fontWeight:900,letterSpacing:'-0.03em',color:'#0D0D0D',lineHeight:1}}>{filtered.length===0?'--':fmt2(totalRev)}</div>
        </div>
      </div>

      {/* Spark cards */}
      <div className="spark-row">
        <div className="spark-card">
          <div style={{fontSize:10,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:4}}>{lang==='en'?'Sales':'Ventes'}</div>
          <div style={{fontSize:22,fontWeight:900,color:'#0D0D0D',letterSpacing:'-0.03em'}}>{filtered.length===0?'--':filtered.length}</div>
          {filtered.length>0&&<Sparkline data={chartData.map(d=>d.profit)} color="#1D9E75"/>}
        </div>
        <div className="spark-card">
          <div style={{fontSize:10,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:4}}>{lang==='en'?'Avg margin':'Marge moy.'}</div>
          <div style={{fontSize:22,fontWeight:900,color:'#0D0D0D',letterSpacing:'-0.03em'}}>{filtered.length===0?'--':fmtp2(avgMargin)}</div>
          {filtered.length>0&&<Sparkline data={chartData.map(d=>d.profit)} color="#4ECDC4"/>}
        </div>
      </div>

      {/* Extra metrics row */}
      <div className="spark-row">
        <div className="spark-card">
          <div style={{fontSize:10,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:4}}>{lang==='en'?'Avg. days to sell':'Délai moy. vente'}</div>
          <div style={{fontSize:22,fontWeight:900,color:'#0D0D0D',letterSpacing:'-0.03em'}}>
            {avgDays!==null?`${avgDays} ${lang==='en'?'d':'j'}`:'—'}
          </div>
        </div>
        <div className="spark-card">
          <div style={{fontSize:10,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:4}}>{lang==='en'?'Avg. basket':'Panier moyen'}</div>
          <div style={{fontSize:22,fontWeight:900,color:'#0D0D0D',letterSpacing:'-0.03em'}}>{filtered.length?fmt2(avgBasket):'—'}</div>
        </div>
      </div>

      {/* AI Analysis card */}
      <div style={{background:'#F0FAF7',borderRadius:14,padding:'16px',borderLeft:'3px solid #1D9E75',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <span style={{fontSize:16}}>🤖</span>
          <span style={{fontSize:12,fontWeight:800,color:'#0D0D0D'}}>{lang==='en'?'AI Analysis':'Analyse IA'}</span>
          <span style={{marginLeft:'auto',background:'#1D9E75',color:'#fff',borderRadius:99,padding:'2px 9px',fontSize:10,fontWeight:800,letterSpacing:'0.04em'}}>{lang==='en'?'Predictive':'Prédictif'}</span>
        </div>
        {aiLoading?(
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {[100,80,60].map((w,i)=><div key={i} style={{height:10,background:'#C6E8DF',borderRadius:4,width:`${w}%`}}/>)}
          </div>
        ):aiText?(
          <div style={{fontSize:13,color:'#1A4A3A',lineHeight:1.65,fontWeight:500}} dangerouslySetInnerHTML={renderMd(aiText.replace(/#{1,6}\s*/g,'').replace(/\*\*(.*?)\*\*/g,'$1'))}/>
        ):(
          filtered.length===0?(
            <div style={{textAlign:'center',padding:'8px 0'}}>
              <div style={{fontSize:13,fontWeight:800,color:'#0D0D0D',marginBottom:6}}>{lang==='en'?'Unlock your AI analysis 🤖':'Débloque ton analyse IA 🤖'}</div>
              <div style={{fontSize:12,color:'#6B7280',fontWeight:500,lineHeight:1.5,marginBottom:12}}>
                {lang==='en'?'Add your first sale to see trends, predictions and personalised advice':'Ajoute ta première vente pour voir tendances, prédictions et conseils personnalisés'}
              </div>
              <button onClick={()=>{setTab(1);localStorage.setItem('tab',1);}}
                style={{background:'transparent',border:'1px solid #1D9E75',color:'#1D9E75',borderRadius:99,padding:'7px 18px',fontSize:12,fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>
                + {lang==='en'?'Add an item':'Ajouter un article'}
              </button>
            </div>
          ):(
            <div style={{fontSize:12,color:'#5DCAA5',fontStyle:'italic'}}>{lang==='en'?'Analysis unavailable':'Analyse non disponible'}</div>
          )
        )}
      </div>

      {/* Donut by category */}
      {donutSegs.length > 0 && (
        <div className="donut-card">
          <div className="head">{lang==='en'?'Profit by category':'Profit par catégorie'}</div>
          <div className="donut-row">
            <DonutChart
              segments={donutSegs}
              totalLabel={lang==='en'?'Total':'Total'}
              totalValue={fmt2(totalProfit)}
            />
            <div className="donut-legend">
              {donutSegs.map((s, i) => {
                const emoji = {
                  'Mode':'👗','Luxe':'💎','High-Tech':'📱','Maison':'🏠',
                  'Sport':'⚽','Musique':'🎵','Beauté':'💄','Collection':'🏆',
                  'Livres':'📚','Auto-Moto':'🚗','Électroménager':'⚡','Jouets':'🧸',
                  'Autre':'📦'
                }[s.label] || '📦';
                return (
                  <div key={i} className="donut-legend-row">
                    <div className="top">
                      <span className="name"><span className="emo">{emoji}</span>{typeLabel(s.label,lang)}</span>
                      <span className="pct">{Math.round(s.pct)}%</span>
                    </div>
                    <div className="donut-legend-bar">
                      <span style={{ width: `${s.pct}%`, background: s.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Evolution du profit — Chart.js line */}
      <div style={{background:'#fff',borderRadius:14,padding:'16px',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
        <div style={{fontSize:12,fontWeight:800,color:'#0D0D0D',marginBottom:12}}>{lang==='en'?'📈 Profit evolution':'📈 Évolution du profit'}</div>
        <div style={{position:'relative',height:130}}>
          {filtered.length===0&&(
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',zIndex:1,pointerEvents:'none'}}>
              <span style={{fontSize:12,fontWeight:600,color:'#A3A9A6'}}>{lang==='en'?'Your profits will appear here':'Tes profits apparaîtront ici'}</span>
            </div>
          )}
          <Line
            data={{
              labels:dailyData.map(d=>d.label),
              datasets:[{
                data:dailyData.map(d=>d.profit),
                fill:true,
                borderColor:'#1D9E75',
                backgroundColor:'rgba(29,158,117,0.12)',
                tension:0.4,
                pointRadius:0,
                pointHoverRadius:5,
                pointHoverBackgroundColor:'#1D9E75',
                borderWidth:2,
              }],
            }}
            options={{
              responsive:true,
              maintainAspectRatio:false,
              animation:{duration:600,easing:'easeOutQuart'},
              plugins:{
                legend:{display:false},
                tooltip:{
                  backgroundColor:'#fff',
                  titleColor:'#A3A9A6',
                  bodyColor:'#1D9E75',
                  borderColor:'rgba(0,0,0,0.08)',
                  borderWidth:1,
                  padding:10,
                  cornerRadius:10,
                  displayColors:false,
                  titleFont:{family:"'Nunito', sans-serif",size:11,weight:'700'},
                  bodyFont:{family:"'Nunito', sans-serif",size:14,weight:'800'},
                  callbacks:{
                    title:([i])=>i.label,
                    label:ctx=>`${(ctx.raw||0)>0?'+':''}${formatCurrency(ctx.raw||0,currency)}`,
                  },
                },
              },
              scales:{
                x:{
                  display:true,
                  grid:{display:false},
                  border:{display:false},
                  ticks:{color:'#A3A9A6',font:{family:"'Nunito', sans-serif",size:10},maxTicksLimit:6,maxRotation:0},
                },
                y:{
                  display:true,
                  grid:{color:'rgba(0,0,0,0.04)',drawTicks:false},
                  border:{display:false},
                  ticks:{color:'#A3A9A6',font:{family:"'Nunito', sans-serif",size:10},padding:6,callback:v=>formatCurrency(v,currency,0)},
                },
              },
            }}
          />
        </div>
      </div>

      {/* Avg days to sell by category */}
      <AvgDaysChart filtered={filtered} items={items} lang={lang} />

      {/* Top sellers */}
      {topSellers.length>0&&(
        <div style={{background:'#fff',borderRadius:14,padding:'16px',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
          <div style={{fontSize:12,fontWeight:800,color:'#0D0D0D',marginBottom:12}}>{lang==='en'?'🏆 Top sellers':'🏆 Meilleurs vendeurs'}</div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {topSellers.map((s,i)=>{
              const ts=getTypeStyle(s.type||'Autre');
              const medal=['🥇','🥈','🥉'][i]||`#${i+1}`;
              const purchDate=topSellerDaysMap[s.title?.toLowerCase().trim()];
              const daysHeld=purchDate&&s.date?Math.max(0,Math.round((new Date(s.date)-new Date(purchDate))/86400000)):null;
              return(
                <div key={i} style={{display:'flex',flexDirection:'column',gap:4,padding:'10px 12px',background:'#F9FAFB',borderRadius:12,border:'1px solid rgba(0,0,0,0.05)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                    <span style={{fontSize:16,flexShrink:0}}>{medal}</span>
                    <span style={{flex:1,fontSize:13,fontWeight:800,color:'#0D0D0D',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.title}</span>
                    <span style={{fontSize:14,fontWeight:900,color:'#1D9E75',flexShrink:0}}>{fmt2(s.margin||0)}</span>
                  </div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                    {s.marque&&<span style={{background:'#E8F5F0',color:'#1D9E75',borderRadius:99,padding:'1px 8px',fontSize:10,fontWeight:700,border:'1px solid #9FE1CB'}}>{marqueLabel(s.marque,lang)}</span>}
                    {s.type&&s.type!=='Autre'&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:'1px 8px',fontSize:10,fontWeight:700,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(s.type,lang)}</span>}
                    {daysHeld!==null&&<span style={{fontSize:10,fontWeight:700,color:'#A3A9A6'}}>{daysHeld}{lang==='en'?'d in stock':'j en stock'}</span>}
                    {s.buy>0&&s.sell>0&&<span style={{fontSize:10,fontWeight:700,color:'#6B7280',marginLeft:'auto'}}>{fmt2(s.buy)} → {fmt2(s.sell)} · <span style={{color:'#1D9E75'}}>{fmtp2(s.marginPct||0)}</span></span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Slow movers */}
      {slowStock.length>0&&(
        <div style={{background:'#fff',borderRadius:14,padding:'16px',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
          <div style={{fontSize:12,fontWeight:800,color:'#0D0D0D',marginBottom:12}}>{lang==='en'?'🐌 Slow movers':'🐌 Articles lents'}</div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {slowStock.map((s,i)=>{
              const ts=getTypeStyle(s.type||'Autre');
              const days=s.date_ajout||s.created_at?Math.floor((Date.now()-new Date(s.date_ajout||s.created_at))/86400000):null;
              return(
                <div key={i} style={{display:'flex',flexDirection:'column',gap:4,padding:'10px 12px',background:'#FFFBEB',borderRadius:12,border:'1px solid rgba(249,162,108,0.2)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{flex:1,fontSize:13,fontWeight:800,color:'#0D0D0D',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.title}</span>
                    {days!==null&&<span style={{fontSize:11,fontWeight:800,color:'#F9A26C',flexShrink:0}}>{days}{lang==='en'?'d':'j'} {lang==='en'?'in stock':'en stock'}</span>}
                  </div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                    {s.marque&&<span style={{background:'#E8F5F0',color:'#1D9E75',borderRadius:99,padding:'1px 8px',fontSize:10,fontWeight:700,border:'1px solid #9FE1CB'}}>{marqueLabel(s.marque,lang)}</span>}
                    {s.type&&s.type!=='Autre'&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:'1px 8px',fontSize:10,fontWeight:700,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(s.type,lang)}</span>}
                    {s.buy>0&&<span style={{fontSize:10,fontWeight:700,color:'#6B7280',marginLeft:'auto'}}>{lang==='en'?'Invested':'Investi'} <span style={{color:'#F9A26C'}}>{fmt2(s.buy*(s.quantite||1))}</span></span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{height:16}}/>
    </div>
  );
});

export default StatsTab;
