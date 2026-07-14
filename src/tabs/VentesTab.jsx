import { memo, useState, useEffect } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import SwipeRow from '../components/SwipeRow';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { UI } from '../components/ui';
import {
  formatCurrency, fmtp,
  typeLabel, marqueLabel, MONTHS_FR, MONTHS_EN,
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

// Plateforme : mapping libellé libre -> clé canonique de PlatformLogo (2026-07-13).
// LOGOS, pas les noms écrits — même décision que StockTab (21fa63c) : le badge
// texte « vinted » en toutes lettres était le seul restant de l'app. Le libellé
// s.plateforme est du texte libre (saisie manuelle possible) : une valeur sans
// clé canonique (ex. Vestiaire, sans logo) garde le badge texte d'origine.
const PLATFORM_KEY={vinted:'vinted',leboncoin:'leboncoin','le bon coin':'leboncoin',lbc:'leboncoin',ebay:'ebay',beebs:'beebs'};

// ── État vide — design « Ventes Empty State » (Claude Design, projet e47b36df,
// intégré le 2026-07-14). ⚠️ TOUTES les valeurs de cet écran sont des EXEMPLES
// EN DUR : l'utilisateur n'a rien vendu, aucun de ces chiffres ne doit jamais
// être branché sur ses vraies données. Les libellés « Aperçu » et « Avec
// Fill & Sell » sont là pour lever toute ambiguïté — ne pas les retirer.
const TICKER_SALES = [
  { title:'Veste Zara oversize',  marque:'Zara',    type:'Mode',       icon:'🧥', sell:42,   margin:27,  date:'14 juil', dateEn:'Jul 14' },
  { title:'iPhone 12 Pro 128Go',  marque:'Apple',   type:'High-Tech',  icon:'📱', sell:380,  margin:100, date:'12 juil', dateEn:'Jul 12' },
  { title:'Sac Kelly Hermès',     marque:'Hermès',  type:'Luxe',       icon:'👜', sell:1240, margin:420, date:'9 juil',  dateEn:'Jul 9' },
  { title:'Lot Pokémon x20',      marque:'Pokémon', type:'Collection', icon:'🎴', sell:95,   margin:90,  date:'6 juil',  dateEn:'Jul 6' },
  { title:'Guitare Yamaha F310',  marque:'Yamaha',  type:'Musique',    icon:'🎸', sell:120,  margin:55,  date:'2 juil',  dateEn:'Jul 2' },
];

// Les 3 mini-stats de l'aperçu : ordres de grandeur TYPES, jamais les siens.
const PREVIEW_STATS = [
  {
    tile: UI.teal,
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/></svg>,
    labelFr:'Marge moy.', labelEn:'Avg margin', valueFr:'~45 %', valueEn:'~45%',
  },
  {
    tile: UI.amber,
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>,
    labelFr:'Délai vente', labelEn:'Sale time', valueFr:'~4 jours', valueEn:'~4 days',
  },
  {
    tile: UI.tealDeep,
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,
    labelFr:'Meilleure vente', labelEn:'Best sale', valueFr:'+420 €', valueEn:'+€420',
  },
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
  const fr = lang !== 'en';

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <style>{`@keyframes vt-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @media (prefers-reduced-motion:reduce){.vt-anim{animation:none !important}}`}</style>

      {/* Aperçu — carrousel d'une vente d'exemple */}
      <div className="vt-anim" style={{display:'flex',flexDirection:'column',gap:12,animation:'vt-rise 0.5s ease both'}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.12em',color:'#A39D8E',textAlign:'center'}}>
          {fr?'Aperçu — à quoi ça ressemble':'Preview — what it looks like'}
        </div>

        <div style={{position:'relative',background:UI.paper,border:`1px solid ${UI.border}`,borderRadius:16,boxShadow:'0 6px 18px -12px rgba(16,32,27,0.16)',overflow:'hidden'}}>
          <div style={{padding:'14px 15px',opacity:visible?1:0,transform:visible?'translateY(0)':'translateY(6px)',transition:'opacity 0.45s ease, transform 0.45s ease'}}>
            <span style={{position:'absolute',top:11,right:13,fontSize:12,color:'#C7C2B4'}}>✎</span>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:44,height:44,borderRadius:13,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:21,background:UI.canvas,border:'1px solid #E3DFD3'}}>
                {s.icon}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:3}}>
                  <span style={{fontSize:14.5,fontWeight:700,color:UI.ink}}>{s.title}</span>
                  <span style={{fontSize:13,fontWeight:500,color:'#B7B2A4'}}> · </span>
                  <span style={{fontSize:13,fontWeight:500,color:UI.mute}}>{marqueLabel(s.marque,lang)}</span>
                </div>
                <div style={{fontSize:12,fontWeight:500,color:UI.mute,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {soldWord(s.title,lang)} <span style={{fontWeight:600,color:'#5C6560'}}>{fmt(s.sell)}</span> · {typeLabel(s.type,lang)}
                </div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <div style={{fontSize:15,fontWeight:700,color:UI.tealDeep}}>+{fmt(s.margin)}</div>
                <div style={{fontSize:10,fontWeight:500,color:'#A6A192',marginTop:3}}>{fr?s.date:s.dateEn}</div>
              </div>
            </div>
          </div>
          <div style={{height:2,background:UI.canvas,overflow:'hidden'}}>
            <div style={{height:'100%',background:UI.teal,width:`${(progress*100).toFixed(1)}%`}}/>
          </div>
        </div>

        <div style={{display:'flex',justifyContent:'center',gap:6}}>
          {TICKER_SALES.map((_,i)=>(
            <div key={i} style={{width:6,height:6,borderRadius:'50%',background:i===idx?UI.teal:'#D8D2C4',transition:'background 0.3s ease'}}/>
          ))}
        </div>
      </div>

      {/* Accroche */}
      <div className="vt-anim" style={{textAlign:'center',animation:'vt-rise 0.5s ease 0.05s both'}}>
        <div style={{fontSize:21,fontWeight:700,letterSpacing:'-0.02em',color:UI.ink}}>
          {fr?"Tes profits t'attendent":'Your profits are waiting'}
        </div>
        <div style={{fontSize:13.5,fontWeight:500,lineHeight:1.5,color:UI.mute,maxWidth:250,margin:'8px auto 0'}}>
          {fr?'Enregistre tes achats et ventes pour voir tes gains en temps réel.':'Log your buys and sells to track your profits in real time.'}
        </div>
      </div>

      {/* CTA principal — ouvre le Stock (ajout d'article) */}
      <button
        className="vt-anim"
        onClick={()=>{setTab(1);localStorage.setItem('tab',1);}}
        style={{width:'100%',padding:16,border:'none',borderRadius:999,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,
          fontFamily:'inherit',fontSize:14.5,fontWeight:700,color:'#fff',
          background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,boxShadow:'0 12px 26px -10px rgba(47,158,144,0.5)',
          animation:'vt-rise 0.5s ease 0.1s both'}}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        {fr?'Ajouter un article':'Add an item'}
      </button>

      {/* Mini-stats d'EXEMPLE — jamais les données de l'utilisateur */}
      <div className="vt-anim" style={{animation:'vt-rise 0.5s ease 0.15s both'}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.12em',color:'#A39D8E',textAlign:'center',marginBottom:8}}>
          {fr?'Avec Fill & Sell':'With Fill & Sell'}
        </div>
        <div style={{fontSize:13.5,fontWeight:700,color:UI.ink,textAlign:'center',marginBottom:12}}>
          {fr?'Ce que tu vas pouvoir suivre':"What you'll be able to track"}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          {PREVIEW_STATS.map((c,i)=>(
            <div key={i} style={{background:'rgba(47,158,144,0.07)',border:'1px solid rgba(47,158,144,0.18)',borderRadius:16,padding:'14px 8px',textAlign:'center'}}>
              <div style={{width:34,height:34,borderRadius:11,background:c.tile,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 9px'}}>
                {c.icon}
              </div>
              <div style={{fontSize:9.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em',color:UI.mute2,lineHeight:1.2,marginBottom:6}}>
                {fr?c.labelFr:c.labelEn}
              </div>
              <div style={{fontSize:17,fontWeight:700,letterSpacing:'-0.02em',color:UI.tealDeep,marginBottom:3}}>
                {fr?c.valueFr:c.valueEn}
              </div>
              <div style={{fontSize:9,fontWeight:500,color:'#A6A192'}}>{fr?'sur tes ventes':'on your sales'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA secondaire — Stats avancées, accessible même sans aucune vente */}
      <button
        onClick={()=>{setTab(4);localStorage.setItem('tab',4);}}
        style={{width:'100%',padding:15,border:'none',borderRadius:999,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:9,
          fontFamily:'inherit',fontSize:14,fontWeight:700,color:'#fff',
          background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,boxShadow:'0 10px 24px -10px rgba(47,158,144,0.45)',marginTop:2}}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
        {fr?'Voir mes stats avancées':'See my advanced stats'}
      </button>
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
        // Condition d'affichage inchangée : cet écran ne sort QUE si l'utilisateur
        // n'a réellement aucune vente. Le padding bas laisse passer le FAB micro
        // flottant (56 px + marge) : sans lui, le CTA « stats avancées » et la
        // grille de mini-stats finissaient sous le bouton en fin de scroll.
        <div style={{display:'flex',flexDirection:'column',gap:16,paddingBottom:'calc(env(safe-area-inset-bottom,0px) + 96px)'}}>
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
                        {PLATFORM_KEY[pKey]
                          ?<span className="plogo" title={s.plateforme}><PlatformLogo platform={PLATFORM_KEY[pKey]} size={18}/></span>
                          :<div className="micon ic-plateforme">{s.plateforme}</div>}
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
