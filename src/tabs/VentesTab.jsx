import { memo, useState, useEffect } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import SwipeRow from '../components/SwipeRow';
import {
  formatCurrency, fmtp, getMargeColor,
  getTypeStyle, typeLabel, marqueLabel, MONTHS_FR, MONTHS_EN,
  getCatTileColor, catClass, detectObjectIcon, buildCardCss,
} from '../utils/shared';

// ── Design 2026 (Lens / navbar) — liste des ventes ──
// Même système de cards que StockTab (buildCardCss) + stats mensuelles / profit.
const VENTES_CSS = buildCardCss('ventes-v2') + `
.ventes-v2 .stats-row{display:flex;gap:8px;}
.ventes-v2 .stat-card{flex:1;background:#fff;border:1px solid var(--border);border-radius:14px;padding:10px 12px;}
.ventes-v2 .stat-lbl{font-size:10px;color:var(--mute);text-transform:uppercase;letter-spacing:.04em;}
.ventes-v2 .stat-val{font-weight:700;font-size:16px;margin-top:2px;color:var(--ink);}
.ventes-v2 .stat-val.pos{color:var(--teal-deep);}
.ventes-v2 .profit{font-weight:700;font-size:15px;color:var(--teal-deep);}
.ventes-v2 .profit.neg{color:#B0645A;}
.ventes-v2 .sold-date{font-size:10px;color:var(--mute);margin-top:3px;}
`;

// Accord du participe "Vendu(e)" : noms féminins courants détectés dans le
// titre (même pattern mots-clés que detectObjectIcon). Masculin par défaut.
const FEM_RE=/\b(robe|jupe|veste|chemise|blouse|doudoune|parka|combinaison|salopette|tunique|écharpe|casquette|ceinture|montre|bague|chaussures?|baskets?|bottes?|bottines?|sandales?|espadrilles?|ballerines?|chaussettes?|pochette|sacoche|valise|poupée|peluche|figurine|guitare|trompette|flûte|batterie|enceinte|tablette|imprimante|souris|console|télé|télévision|lampe|table|chaise|armoire|commode|étagère|bibliothèque|cafetière|bouilloire|machine|friteuse|perceuse|visseuse|scie|ponceuse|meuleuse|tondeuse|trottinette|raquette|tente|planche|palette|crème|poussette|cartes?|pièces?|assiettes?|tasses?|casserole|poêle|couette|parure|lunettes?|paire)\b/i;
const soldWord=(title,lang)=>lang==='en'?'Sold':(FEM_RE.test(title||'')?'Vendue':'Vendu');

// Badge plateforme : mapping libellé libre -> classe couleur (mêmes classes que StockTab)
const PLATFORM_CLASS={vinted:'ic-vinted',leboncoin:'ic-leboncoin','le bon coin':'ic-leboncoin',lbc:'ic-leboncoin',ebay:'ic-ebay',beebs:'ic-beebs'};

const TICKER_SALES = [
  { title:'Veste Zara oversize',  marque:'Zara',    type:'Mode',       sell:42,   margin:27,  marginPct:64 },
  { title:'iPhone 12 Pro 128Go', marque:'Apple',   type:'High-Tech',  sell:380,  margin:100, marginPct:26 },
  { title:'Sac Kelly Hermès',    marque:'Hermès',  type:'Luxe',       sell:1240, margin:420, marginPct:34 },
  { title:'Lot Pokémon x20',     marque:'Pokémon', type:'Collection', sell:95,   margin:90,  marginPct:95 },
  { title:'Guitare Yamaha F310', marque:'Yamaha',  type:'Musique',    sell:120,  margin:55,  marginPct:46 },
];

function SalesTicker({ lang, fmt, setTab }) {
  const [idx, setIdx]           = useState(0);
  const [visible, setVisible]   = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf;
    let timeout = null;
    let startTs = null;
    let cancelled = false;
    const DURATION = 3200;

    function tick(ts) {
      if (cancelled) return;
      if (!startTs) startTs = ts;
      const p = Math.min((ts - startTs) / DURATION, 1);
      setProgress(p);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setVisible(false);
        timeout = setTimeout(() => {
          if (cancelled) return;
          setIdx(i => (i + 1) % TICKER_SALES.length);
          setProgress(0);
          setVisible(true);
        }, 450);
      }
    }

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (timeout) clearTimeout(timeout);
    };
  }, [idx]);

  const s  = TICKER_SALES[idx];
  const ts = getTypeStyle(s.type);
  const mc = getMargeColor(s.marginPct);

  return (
    <div style={{marginBottom:8}}>
      <div style={{fontSize:11,fontWeight:700,color:'#A3A9A6',textTransform:'uppercase',letterSpacing:'0.08em',textAlign:'center',marginBottom:10}}>
        {lang==='fr'?'APERÇU — À QUOI ÇA RESSEMBLE':'PREVIEW — WHAT IT LOOKS LIKE'}
      </div>

      <div style={{background:'#fff',borderRadius:12,border:'1px solid rgba(0,0,0,0.06)',borderLeft:`3px solid ${ts.border}`,boxShadow:'0 1px 3px rgba(0,0,0,0.04)',overflow:'hidden',marginBottom:10}}>
        <div style={{padding:'12px 14px',opacity:visible?1:0,transform:visible?'translateY(0)':'translateY(6px)',transition:'opacity 0.45s ease,transform 0.45s ease'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:14,color:'#10201B',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:4}}>
                {s.title}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                <span style={{background:'#E7F3F0',color:'#1B6E62',borderRadius:99,padding:'2px 8px',fontSize:10,fontWeight:700,border:'1px solid #BFE0D9'}}>
                  {marqueLabel(s.marque,lang)}
                </span>
                <span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:'2px 8px',fontSize:10,fontWeight:700,border:`1px solid ${ts.border}`}}>
                  {ts.emoji} {typeLabel(s.type,lang)}
                </span>
              </div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontWeight:700,fontSize:14,color:'#10201B'}}>{fmt(s.sell)}</div>
              <div style={{fontWeight:700,fontSize:13,color:mc,marginTop:1}}>+{fmt(s.margin)}</div>
            </div>
          </div>
          <div style={{marginTop:10,height:2,background:'#F2F0E9',borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',background:ts.border,width:`${progress*100}%`}}/>
          </div>
        </div>
      </div>

      <div style={{display:'flex',justifyContent:'center',gap:6,marginBottom:18}}>
        {TICKER_SALES.map((sale,i)=>{
          const dts=getTypeStyle(sale.type);
          return <div key={i} style={{width:6,height:6,borderRadius:'50%',background:i===idx?dts.border:'#E5E7EB',transition:'background 0.3s ease'}}/>;
        })}
      </div>

      <div style={{textAlign:'center',marginBottom:16}}>
        <div style={{fontSize:18,fontWeight:700,color:'#10201B',letterSpacing:'-0.02em',marginBottom:6}}>
          {lang==='fr'?"Tes profits t'attendent":"Your profits are waiting"}
        </div>
        <div style={{fontSize:13,color:'#A3A9A6',fontWeight:500,lineHeight:1.5,maxWidth:240,margin:'0 auto'}}>
          {lang==='fr'?'Enregistre tes achats et ventes pour voir tes gains en temps réel.':'Log your buys and sells to track your profits in real time.'}
        </div>
      </div>

      <button
        onClick={()=>{setTab(1);localStorage.setItem('tab',1);}}
        style={{width:'100%',padding:'14px',background:'linear-gradient(120deg,#2F9E90,#1B6E62)',color:'#fff',border:'none',borderRadius:999,fontSize:14,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontFamily:'inherit',boxShadow:'0 10px 24px -8px rgba(47,158,144,0.28)'}}
        onMouseDown={e=>e.currentTarget.style.transform='scale(0.97)'}
        onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}
        onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
      >
        + {lang==='fr'?'Ajouter un article':'Add an item'}
      </button>

      <div style={{marginTop:16}}>
        <div style={{fontSize:11,fontWeight:700,color:'#A3A9A6',textTransform:'uppercase',letterSpacing:'0.08em',textAlign:'center',marginBottom:10}}>
          {lang==='fr'?'AVEC FILL & SELL':'WITH FILL & SELL'}
        </div>
        <div style={{fontSize:13,fontWeight:700,color:'#10201B',textAlign:'center',marginBottom:10}}>
          {lang==='fr'?'Ce que tu vas pouvoir suivre':'What you\'ll be able to track'}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:10}}>
          {[
            {icon:'📈',label:lang==='fr'?'Marge moy.':'Avg margin',value:'~45%'},
            {icon:'⚡',label:lang==='fr'?'Délai vente':'Sale time',value:lang==='fr'?'~4 jours':'~4 days'},
            {icon:'🏆',label:lang==='fr'?'Meilleure vente':'Best sale',value:'ex: +420€'},
          ].map((c,i)=>(
            <div key={i} style={{background:'#F0FDFB',border:'1px solid rgba(13,148,136,0.18)',borderRadius:12,padding:'10px 8px',textAlign:'center'}}>
              <div style={{fontSize:18,marginBottom:4}}>{c.icon}</div>
              <div style={{fontSize:10,fontWeight:700,color:'#6B7A75',marginBottom:4,lineHeight:1.2}}>{c.label}</div>
              <div style={{fontSize:15,fontWeight:700,color:'#1B6E62',letterSpacing:'-0.02em',marginBottom:2}}>{c.value}</div>
              <div style={{fontSize:9,color:'#A3A9A6',fontWeight:500}}>{lang==='fr'?'sur tes ventes':'on your sales'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const VentesTab = memo(function VentesTab({
  lang, currency, isPremium, isNative, user,
  sales, visibleSales, groupedSales,
  searchHistory, setSearchHistory,
  showAllSales, setShowAllSales,
  iapProduct, iapLoading, handleIAPPurchase, handleIAPRestore,
  delSale, setTab, setEditItem,
  PremiumBanner, IAPUpgradeBlock,
  openUpgradeModal,
}) {
  const { t } = useTranslation(lang);
  const fmt = (amount, dec=null) => formatCurrency(amount, currency, dec);
  const [filterType, setFilterType] = useState("Tous");

  // KPI mois courant — même formule que tm (App.jsx)
  const now=new Date();
  const monthSales=sales.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===now.getMonth()&&sd.getFullYear()===now.getFullYear();});
  const monthProfit=monthSales.reduce((a,s)=>a+(s.margin||0),0);
  const monthRevenue=monthSales.reduce((a,s)=>a+(s.sell||0),0);
  const monthMargePct=monthRevenue>0?(monthProfit/monthRevenue)*100:0;

  const filteredSales=filterType==="Tous"?visibleSales:visibleSales.filter(s=>s.type===filterType);

  return (
    <div className="ventes-v2" style={{display:"flex",flexDirection:"column",gap:12}}>
      <style>{VENTES_CSS}</style>

      {/* ── Stats du mois ── */}
      {sales.length>0&&(
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-lbl">{t('ceMois')}</div>
            <div className={`stat-val${monthProfit>=0?" pos":""}`}>{monthProfit>=0?"+":""}{fmt(monthProfit)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-lbl">{t('ventes')}</div>
            <div className="stat-val">{monthSales.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-lbl">{t('margeMoy')}</div>
            <div className="stat-val">{fmtp(monthMargePct)}</div>
          </div>
        </div>
      )}

      {sales.length>0&&(
        <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"10px 16px",marginBottom:4}}>
          <span style={{fontSize:14,flexShrink:0}}>🔍</span>
          <input value={searchHistory} onChange={e=>setSearchHistory(e.target.value)}
            placeholder={lang==='fr'?"Rechercher par nom, marque, description...":"Search by name, brand, description..."}
            style={{flex:1,border:"none",outline:"none",fontSize:14,background:"transparent",fontFamily:"inherit",color:"#10201B"}}/>
          {searchHistory&&<button onClick={()=>setSearchHistory("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#A3A9A6",flexShrink:0,padding:0,lineHeight:1}}>✕</button>}
        </div>
      )}

      {/* ── Filtres catégorie — mêmes pills à pastille que StockTab ── */}
      {sales.length>0&&(()=>{
        const presentTypes=["Tous","Mode","Luxe","High-Tech","Maison","Électroménager","Jouets","Livres","Sport","Auto-Moto","Beauté","Musique","Collection","Multimédia","Jardin","Bricolage","Autre"].filter(tp=>tp==="Tous"||sales.some(s=>s.type===tp));
        return presentTypes.length>1&&(
          <div className="cat-filters">
            {presentTypes.map(tp=>{
              const isActive=filterType===tp;
              return(
                <button key={tp} className={`fpill${isActive?" active":""}`} onClick={()=>setFilterType(tp)}>
                  <span className="fdot" style={{background:tp==="Tous"?"linear-gradient(155deg,#2F9E90,#1B6E62)":getCatTileColor(tp)}}/>
                  {tp==="Tous"?(lang==='en'?'All':'Tous'):typeLabel(tp,lang)}
                </button>
              );
            })}
          </div>
        );
      })()}

      {sales.length===0?(
        <div>
          <SalesTicker lang={lang} fmt={fmt} setTab={setTab}/>
          {!isPremium&&!isNative&&(<PremiumBanner userEmail={user?.email}/>)}
          {isNative&&!isPremium&&(<IAPUpgradeBlock lang={lang} iapProduct={iapProduct} iapLoading={iapLoading} onPurchase={openUpgradeModal} onRestore={handleIAPRestore}/>)}
        </div>
      ):(
        <>
          {filteredSales.map(s=>{
            const d=new Date(s.date);
            const sameYear=d.getFullYear()===now.getFullYear();
            const pKey=(s.plateforme||"").toLowerCase().trim();
            return(
              // Swipe gauche = supprimer (conservé) ; tap sur la carte = éditer la vente.
              <SwipeRow key={s.id} onDelete={()=>delSale(s.id)} style={{borderRadius:16,border:"1px solid #E7E3D8",boxShadow:"none"}}>
                <div className="row in-swipe" onClick={()=>setEditItem({...s,frais:0,sell:s.sell??""})}>
                  <span className="edit-affordance">✎</span>
                  <div className={`cat-tile ${catClass(s.type)}`}>{detectObjectIcon(s.title,s.description,s.type)}</div>
                  <div className="left">
                    <div className="title-line">
                      <span className="title">{s.title}</span>
                      {s.marque&&(<><span className="brand-dot"/><span className="brandname">{marqueLabel(s.marque,lang)}</span></>)}
                      {(s._qty||1)>1&&<span className="qty-badge">×{s._qty}</span>}
                    </div>
                    <div className="meta">
                      {soldWord(s.title,lang)} <span className="hl">{fmt(s.sell)}</span> · {typeLabel(s.type||"Autre",lang)}
                    </div>
                    {s.plateforme&&(
                      <div className="icons">
                        <div className={`micon ${PLATFORM_CLASS[pKey]||'ic-plateforme'}`}>{s.plateforme}</div>
                      </div>
                    )}
                  </div>
                  <div className="right">
                    <div className={`profit${s.margin<0?" neg":""}`}>{s.margin>=0?"+":""}{fmt(s.margin)}</div>
                    <div className="sold-date">{d.getDate()} {(lang==='en'?MONTHS_EN:MONTHS_FR)[d.getMonth()]}{sameYear?"":` ${d.getFullYear()}`}</div>
                  </div>
                </div>
              </SwipeRow>
            );
          })}
          {!showAllSales&&groupedSales.length>10&&(
            <button onClick={()=>setShowAllSales(true)}
              style={{width:"100%",padding:"12px",background:"none",border:"1px solid #2F9E90",borderRadius:999,color:"#2F9E90",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
              {lang==='fr'?`Voir plus (${groupedSales.length-10} autres)`:`Show more (${groupedSales.length-10} more)`}
            </button>
          )}
          {!isPremium&&!isNative&&(<PremiumBanner userEmail={user?.email}/>)}
          {isNative&&!isPremium&&(<IAPUpgradeBlock lang={lang} iapProduct={iapProduct} iapLoading={iapLoading} onPurchase={openUpgradeModal} onRestore={handleIAPRestore}/>)}
        </>
      )}

      {/* ── Bouton stats avancées ── */}
      {isPremium&&(
        <button onClick={()=>{setTab(4);localStorage.setItem('tab',4);}}
          style={{width:"100%",marginTop:4,padding:"14px",background:"linear-gradient(120deg,#2F9E90,#1B6E62)",color:"#fff",border:"none",borderRadius:999,fontSize:14,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit",transition:"all 0.15s",boxShadow:"0 10px 24px -8px rgba(47,158,144,0.28)"}}
          onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
          onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
          onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
        >{t('statsAvancees')}</button>
      )}
    </div>
  );
});

export default VentesTab;
