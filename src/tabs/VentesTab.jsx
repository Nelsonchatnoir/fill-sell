import { memo } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import SwipeRow from '../components/SwipeRow';
import {
  C, formatCurrency, fmtp, getMargeColor, getCatBorder,
  getTypeStyle, typeLabel, marqueLabel, MONTHS_FR, MONTHS_EN,
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
          {!isPremium&&!isNative&&(<PremiumBanner userEmail={user?.email}/>)}
          {isNative&&!isPremium&&(<IAPUpgradeBlock lang={lang} iapProduct={iapProduct} iapLoading={iapLoading} onPurchase={handleIAPPurchase} onRestore={handleIAPRestore}/>)}
        </div>
      ):(
        <>
          {visibleSales.map(s=>{
            const d=new Date(s.date);const mc=getMargeColor(s.marginPct);const ts=getTypeStyle(s.type);
            return(
              <SwipeRow key={s.id} onDelete={()=>delSale(s.id)} style={{borderLeft:`3px solid ${getCatBorder(s.type)}`}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</span>
                    {(s._qty||1)>1&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 6px",fontSize:10,fontWeight:800,flexShrink:0,border:"1px solid #9FE1CB"}}>×{s._qty}</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginTop:2}}>
                    <span style={{fontSize:11,color:"#A3A9A6"}}>{d.getDate()} {(lang==='en'?MONTHS_EN:MONTHS_FR)[d.getMonth()]} {d.getFullYear()}</span>
                    {s.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{marqueLabel(s.marque,lang)}</span>}
                    {s.type&&s.type!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(s.type,lang)}</span>}
                  </div>
                </div>
                <div style={{flex:1,textAlign:"center",display:window.innerWidth>=768?"block":"none",padding:"0 8px"}}>
                  <div style={{fontSize:12,color:"#A3A9A6"}}>{fmt(s.buy)} → {fmt(s.sell)}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontWeight:700,fontSize:14,color:"#0D0D0D"}}>{fmt(s.sell)}</div>
                  <div style={{fontWeight:800,fontSize:13,color:mc,marginTop:1}}>{s.margin>=0?"+":""}{fmt(s.margin)}</div>
                  <div style={{fontSize:11,color:"#6B7280",marginTop:1}}>{fmtp(s.marginPct)}</div>
                </div>
              </SwipeRow>
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
