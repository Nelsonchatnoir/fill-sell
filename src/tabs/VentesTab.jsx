import { memo, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import SwipeRow from '../components/SwipeRow';
import {
  C, formatCurrency, fmtp, getMargeColor, getCatBorder,
  getTypeStyle, typeLabel, marqueLabel, MONTHS_FR, MONTHS_EN, parseLocDesc,
} from '../utils/shared';

const VentesTab = memo(function VentesTab({
  lang, currency, isPremium, isNative, user,
  sales, visibleSales, groupedSales,
  salesForKpis, totalM,
  searchHistory, setSearchHistory,
  showAllSales, setShowAllSales,
  iapProduct, iapLoading, handleIAPPurchase, handleIAPRestore,
  delSale, setTab,
  PremiumBanner, IAPUpgradeBlock,
}) {
  const { t } = useTranslation(lang);
  const fmt = (amount, dec=null) => formatCurrency(amount, currency, dec);
  const [expandedSaleId, setExpandedSaleId] = useState(null);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>

      {/* ── Header stats ── */}
      {sales.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:4}}>
          {[
            {label:t('profitTotal'),value:fmt(totalM),color:totalM>=0?"#1D9E75":C.red},
            {label:t('ventes'),value:salesForKpis.length,color:"#4ECDC4"},
            {label:t('profitMoyen'),value:fmt(salesForKpis.length?totalM/salesForKpis.length:0),color:"#5DCAA5"},
          ].map((s,i)=>(
            <div key={i} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",textAlign:"center"}}>
              <div style={{fontSize:10,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{s.label}</div>
              <div style={{fontSize:18,fontWeight:900,color:s.color,letterSpacing:"-0.03em"}}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {sales.length>0&&(
        <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"10px 16px",marginBottom:4}}>
          <span style={{fontSize:14,flexShrink:0}}>🔍</span>
          <input value={searchHistory} onChange={e=>setSearchHistory(e.target.value)}
            placeholder={lang==='fr'?"Rechercher par nom, marque, description...":"Search by name, brand, description..."}
            style={{flex:1,border:"none",outline:"none",fontSize:14,background:"transparent",fontFamily:"inherit",color:"#0D0D0D"}}/>
          {searchHistory&&<button onClick={()=>setSearchHistory("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#A3A9A6",flexShrink:0,padding:0,lineHeight:1}}>✕</button>}
        </div>
      )}

      {sales.length===0?(
        <div>
          <div className="card" style={{padding:"48px 28px",textAlign:"center",marginBottom:12,display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
            <span style={{fontSize:40}}>💸</span>
            <div style={{fontSize:18,fontWeight:900,color:"#0D0D0D",letterSpacing:"-0.02em"}}>{t('premiereVente')}</div>
            <div style={{fontSize:13,fontWeight:700,color:"#A3A9A6",maxWidth:200,lineHeight:1.5}}>{t('profitsApparaitront')}</div>
          </div>
          {!isPremium&&(
            <div style={{marginBottom:12}}>
              <div style={{textAlign:"center",marginBottom:10}}>
                <span style={{background:"rgba(13,148,136,0.10)",color:"#0F6E56",borderRadius:99,padding:"5px 14px",fontSize:12,fontWeight:800,border:"1px solid rgba(13,148,136,0.20)"}}>
                  👀 {lang==='fr'?"Aperçu · Tes ventes apparaîtront ici":"Preview · Your sales will appear here"}
                </span>
              </div>
              <div style={{opacity:0.4,filter:"blur(1.5px)",pointerEvents:"none",userSelect:"none",display:"flex",flexDirection:"column",gap:8}}>
                {[
                  {title:"Veste Levi's vintage",marque:"Levi's",type:"Mode",buy:15,sell:42,margin:27,daysAgo:2},
                  {title:"iPhone 12 Pro 128Go",marque:"Apple",type:"High-Tech",buy:280,sell:380,margin:100,daysAgo:5},
                  {title:"Sac Hermès Kelly",marque:"Hermès",type:"Luxe",buy:820,sell:1240,margin:420,daysAgo:7},
                ].map((fs,fi)=>{
                  const _fd=new Date(Date.now()-fs.daysAgo*86400000);
                  const _fts=getTypeStyle(fs.type);
                  const _fmc=getMargeColor((fs.margin/fs.sell)*100);
                  const _fmonths=lang==='en'?MONTHS_EN:MONTHS_FR;
                  return(
                    <div key={fi} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.06)",borderLeft:`3px solid ${getCatBorder(fs.type)}`,display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:14,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fs.title}</div>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginTop:2}}>
                          <span style={{fontSize:11,color:"#A3A9A6"}}>{_fd.getDate()} {_fmonths[_fd.getMonth()]} {_fd.getFullYear()}</span>
                          <span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{fs.marque}</span>
                          <span style={{background:_fts.bg,color:_fts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:`1px solid ${_fts.border}`}}>{_fts.emoji} {typeLabel(fs.type,lang)}</span>
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontWeight:700,fontSize:14,color:"#0D0D0D"}}>{fmt(fs.sell)}</div>
                        <div style={{fontWeight:800,fontSize:13,color:_fmc,marginTop:1}}>+{fmt(fs.margin)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!isPremium&&!isNative&&(<PremiumBanner userEmail={user?.email}/>)}
          {isNative&&!isPremium&&(<IAPUpgradeBlock lang={lang} iapProduct={iapProduct} iapLoading={iapLoading} onPurchase={handleIAPPurchase} onRestore={handleIAPRestore}/>)}
        </div>
      ):(
        <>
          {visibleSales.map(s=>{
            const d=new Date(s.date);
            const mc=getMargeColor(s.marginPct);
            const ts=getTypeStyle(s.type);
            const isExpanded=expandedSaleId===s.id;
            const {loc:_loc,rest:_desc}=parseLocDesc(s.description);
            const hasDetail=_desc||_loc||s.emplacement;
            return(
              <div key={s.id}>
                <SwipeRow onDelete={()=>delSale(s.id)} style={{borderLeft:`3px solid ${getCatBorder(s.type)}`,borderBottomLeftRadius:isExpanded?0:12,borderBottomRightRadius:isExpanded?0:12}}>
                  <div style={{flex:1,minWidth:0,cursor:hasDetail?"pointer":undefined}} onClick={hasDetail?()=>setExpandedSaleId(isExpanded?null:s.id):undefined}>
                    <div style={{fontWeight:700,fontSize:14,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
                      <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</span>
                      {(s._qty||1)>1&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 6px",fontSize:10,fontWeight:800,flexShrink:0,border:"1px solid #9FE1CB"}}>×{s._qty}</span>}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginTop:2}}>
                      <span style={{fontSize:11,color:"#A3A9A6"}}>{d.getDate()} {(lang==='en'?MONTHS_EN:MONTHS_FR)[d.getMonth()]} {d.getFullYear()}</span>
                      {s.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{marqueLabel(s.marque,lang)}</span>}
                      {s.type&&s.type!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(s.type,lang)}</span>}
                    </div>
                    {!isExpanded&&(_desc||_loc)&&<div style={{fontSize:11,color:"#A3A9A6",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{_desc}{_desc&&_loc?" · ":""}{_loc&&`📍 ${_loc}`}</div>}
                    {!isExpanded&&s.emplacement&&<span style={{display:"inline-block",marginTop:3,background:"#F3F4F6",color:"#6B7280",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,border:"1px solid #E5E7EB"}}>📦 {s.emplacement}</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                    <div style={{flex:1,textAlign:"center",display:window.innerWidth>=768?"block":"none",padding:"0 8px"}}>
                      <div style={{fontSize:12,color:"#A3A9A6"}}>{fmt(s.buy)} → {fmt(s.sell)}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:700,fontSize:14,color:"#0D0D0D"}}>{fmt(s.sell)}</div>
                      <div style={{fontWeight:800,fontSize:13,color:mc,marginTop:1}}>{s.margin>=0?"+":""}{fmt(s.margin)}</div>
                      <div style={{fontSize:11,color:"#6B7280",marginTop:1}}>{fmtp(s.marginPct)}</div>
                    </div>
                    {hasDetail&&<span onClick={e=>{e.stopPropagation();setExpandedSaleId(isExpanded?null:s.id);}} style={{color:"#D1D5DB",fontSize:16,cursor:"pointer",userSelect:"none",display:"inline-block",transition:"transform 0.2s ease",transform:isExpanded?"rotate(90deg)":"rotate(0deg)",flexShrink:0}}>›</span>}
                  </div>
                </SwipeRow>
                {hasDetail&&(
                  <div style={{maxHeight:isExpanded?"200px":"0",overflow:"hidden",transition:"max-height 0.25s ease"}}>
                    <div style={{padding:"10px 14px 12px",background:"#F9FAFB",borderLeft:`3px solid ${getCatBorder(s.type)}`,borderRight:"1px solid rgba(0,0,0,0.06)",borderBottom:"1px solid rgba(0,0,0,0.06)",borderRadius:"0 0 12px 12px"}}>
                      {_desc&&<div style={{fontSize:12,color:"#4B5563",lineHeight:1.5,marginBottom:(_loc||s.emplacement)?4:0}}>{_desc}</div>}
                      {_loc&&<div style={{fontSize:12,color:"#6B7280",lineHeight:1.4,marginBottom:s.emplacement?4:0}}>📍 {_loc}</div>}
                      {s.emplacement&&<div style={{fontSize:12,color:"#6B7280",lineHeight:1.4}}>📦 {s.emplacement}</div>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!showAllSales&&groupedSales.length>10&&(
            <button onClick={()=>setShowAllSales(true)}
              style={{width:"100%",padding:"12px",background:"transparent",border:"1px solid rgba(0,0,0,0.1)",borderRadius:12,color:"#6B7280",fontSize:13,fontWeight:700,cursor:"pointer"}}>
              {lang==='fr'?`Voir plus (${groupedSales.length-10} autres)`:`Show more (${groupedSales.length-10} more)`}
            </button>
          )}
          {!isPremium&&!isNative&&(<PremiumBanner userEmail={user?.email}/>)}
          {isNative&&!isPremium&&(<IAPUpgradeBlock lang={lang} iapProduct={iapProduct} iapLoading={iapLoading} onPurchase={handleIAPPurchase} onRestore={handleIAPRestore}/>)}
        </>
      )}

      {/* ── Bouton stats avancées ── */}
      {isPremium&&(
        <button onClick={()=>{setTab(4);localStorage.setItem('tab',4);}}
          style={{width:"100%",marginTop:4,padding:"14px",background:"#0F6E56",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit",transition:"all 0.15s",boxShadow:"0 4px 14px rgba(15,110,86,0.3)"}}
          onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
          onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
          onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
        >{t('statsAvancees')}</button>
      )}
    </div>
  );
});

export default VentesTab;
