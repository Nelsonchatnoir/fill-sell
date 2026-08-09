import { memo, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import SwipeRow from '../components/SwipeRow';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { UI } from '../components/ui';
import { supabase } from '../lib/supabase';
import {
  formatCurrency, fmtp,
  typeLabel, marqueLabel, MONTHS_FR, MONTHS_EN,
  getCatTileColor, catClass, detectObjectIcon, buildCardCss,
} from '../utils/shared';
import { comptabilisable, comptabilisables, totalMarge, totalCA, margeUnitaire } from '../utils/comptabilite';

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

/* ── Prix d'achat manquant (03/08) ──
   Ton INVITATION, jamais alerte : ces ventes ne sont pas des erreurs, il manque
   juste une info. D'où le teal du design system et pas de rouge — le rouge
   ferait lire « tu as fait une bêtise » là où il n'y a rien à réparer. */
.ventes-v2 .pa-call{width:100%;display:flex;align-items:center;gap:11px;text-align:left;padding:11px 14px;border-radius:14px;cursor:pointer;font-family:inherit;background:rgba(47,158,144,.08);border:1px solid rgba(47,158,144,.28);color:var(--ink);}
.ventes-v2 .pa-call.on{background:linear-gradient(120deg,var(--teal),var(--teal-deep));border-color:transparent;color:#fff;box-shadow:0 10px 22px -12px rgba(47,158,144,.55);}
.ventes-v2 .pa-call .n{display:block;font-size:13.5px;font-weight:700;line-height:1.25;}
.ventes-v2 .pa-call .sub{display:block;font-size:11px;font-weight:500;color:var(--mute);margin-top:2px;line-height:1.3;}
.ventes-v2 .pa-call.on .sub{color:rgba(255,255,255,.88);}
.ventes-v2 .pa-line{display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap;}
.ventes-v2 .pa-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;border:1px dashed rgba(47,158,144,.55);background:rgba(47,158,144,.07);color:var(--teal-deep);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;}
.ventes-v2 .pa-input{width:82px;padding:5px 8px;border-radius:9px;border:1px solid var(--teal);background:#fff;font-family:inherit;font-size:12.5px;font-weight:700;color:var(--ink);outline:none;}
.ventes-v2 .pa-ok{border:none;background:var(--teal);color:#fff;border-radius:9px;padding:5px 9px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;line-height:1.2;}
.ventes-v2 .pa-hint{font-size:9.5px;color:var(--mute);}
.ventes-v2 .pa-err{font-size:10.5px;color:#B0645A;font-weight:600;}
.ventes-v2 .pa-note{font-size:10px;color:var(--mute);margin-top:5px;font-style:italic;}
.ventes-v2 .pa-check{width:17px;height:17px;accent-color:#2F9E90;flex-shrink:0;cursor:pointer;margin:0;}
.ventes-v2 .pa-bar{position:sticky;top:0;z-index:6;background:#fff;border:1px solid var(--teal);border-radius:14px;padding:10px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;box-shadow:0 10px 24px -14px rgba(16,32,27,.45);}
.ventes-v2 .pa-bar .lbl{font-size:12px;font-weight:700;color:var(--ink);}
.ventes-v2 .pa-bar .apply{border:none;background:linear-gradient(120deg,var(--teal),var(--teal-deep));color:#fff;border-radius:999px;padding:7px 13px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;}
.ventes-v2 .pa-bar .ghost{border:1px solid var(--border);background:#fff;color:var(--mute);border-radius:999px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;}
.ventes-v2 .pa-bar button:disabled{opacity:.45;cursor:default;}
/* ── Ventes importées du dressing à enregistrer (03/08 soir) ── */
.ventes-v2 .pa-date{width:132px;}
.ventes-v2 .imp-info{background:rgba(47,158,144,.06);border:1px solid rgba(47,158,144,.2);border-radius:14px;padding:11px 14px;font-size:12px;line-height:1.55;color:var(--ink);}
.ventes-v2 .imp-champ{display:flex;flex-direction:column;gap:3px;}
.ventes-v2 .imp-lbl{font-size:9.5px;font-weight:700;color:var(--mute);text-transform:uppercase;letter-spacing:.04em;}
.ventes-v2 .imp-ghost{border:1px solid var(--border);background:#fff;color:var(--mute);border-radius:999px;padding:4px 9px;font-size:10.5px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;}
.ventes-v2 .imp-ghost.on{border-color:var(--teal);color:var(--teal-deep);background:rgba(47,158,144,.08);}
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
// FillSell » sont là pour lever toute ambiguïté — ne pas les retirer.
// (« Fill & Sell », orthographe fantôme : dernier endroit de l'app qui
// écrivait la marque en trois mots — corrigé le 2026-08-09.)
const TICKER_SALES = [
  { title:'Veste Zara oversize',  marque:'Zara',    type:'Mode',       icon:'🧥', sell:42,   margin:27,  date:'14 juil', dateEn:'Jul 14' },
  { title:'iPhone 12 Pro 128Go',  marque:'Apple',   type:'High-Tech',  icon:'📱', sell:380,  margin:100, date:'12 juil', dateEn:'Jul 12' },
  { title:'Sac Kelly Hermès',     marque:'Hermès',  type:'Mode',       icon:'👜', sell:1240, margin:420, date:'9 juil',  dateEn:'Jul 9' },
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

function SalesTicker({ lang, fmt, setTab, extensionAbsente = false, onExtensionInfo = null }) {
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
          {/* Pas de crayon ici non plus : l'aperçu doit ressembler aux vraies
              cartes, qui n'en ont plus depuis le 2026-07-14. */}
          <div style={{padding:'14px 15px',opacity:visible?1:0,transform:visible?'translateY(0)':'translateY(6px)',transition:'opacity 0.45s ease, transform 0.45s ease'}}>
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

      {/* Accroche — remise à jour le 2026-08-09. Elle ne parlait que de la
          détection de vente, comme si les articles arrivaient là par magie :
          rien sur les quatre plateformes surveillées, rien sur la synchro du
          dressing Vinted qui remonte AUSSI les ventes récentes. Les deux sont
          désormais nommées.
          ⚠️ Le retrait reste « te proposera » : il se fait sur confirmation,
          jamais tout seul — ne pas en faire une promesse d'automatisme. */}
      <div className="vt-anim" style={{textAlign:'center',animation:'vt-rise 0.5s ease 0.05s both'}}>
        <div style={{fontSize:21,fontWeight:700,letterSpacing:'-0.02em',color:UI.ink}}>
          {fr?'Aucune vente pour l\'instant':'No sales yet'}
        </div>
        <div style={{fontSize:13.5,fontWeight:500,lineHeight:1.5,color:UI.mute,maxWidth:290,margin:'8px auto 0'}}>
          {fr
            ?"Dès qu'un article part sur Vinted, Leboncoin, eBay ou Beebs, il apparaît ici avec ta marge — et FillSell te proposera de retirer les autres annonces. Tes ventes Vinted récentes remontent aussi quand tu synchronises ton dressing."
            :'As soon as an item sells on Vinted, Leboncoin, eBay or Beebs, it shows up here with your margin — and FillSell will offer to remove the other listings. Your recent Vinted sales also come across when you sync your closet.'}
        </div>
      </div>

      {/* CTA principal — voir le Stock */}
      <button
        className="vt-anim"
        onClick={()=>{setTab(1);localStorage.setItem('tab',1);}}
        style={{width:'100%',padding:16,border:'none',borderRadius:999,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,
          fontFamily:'inherit',fontSize:14.5,fontWeight:700,color:'#fff',
          background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,boxShadow:'0 12px 26px -10px rgba(47,158,144,0.5)',
          animation:'vt-rise 0.5s ease 0.1s both'}}
      >
        {fr?'Voir mon stock':'See my stock'}
      </button>

      {/* Ligne discrète, non bloquante (lot 2) : extension jamais vue sur ce
          compte — même phrase que l'accueil vide, même accroche au clic. */}
      {extensionAbsente&&(
        <p className="vt-anim" style={{margin:'0 4px',fontSize:12,lineHeight:1.5,color:UI.mute,fontWeight:500,textAlign:'center',animation:'vt-rise 0.5s ease 0.12s both'}}>
          {fr
            ?"L'extension n'est pas encore installée sur ton ordinateur — c'est elle qui publie pour toi. "
            :"The extension isn't installed on your computer yet — it's what publishes for you. "}
          <button onClick={()=>onExtensionInfo?.()} style={{background:'none',border:'none',padding:0,fontSize:12,fontWeight:700,color:UI.tealDeep,textDecoration:'underline',cursor:'pointer',fontFamily:'inherit'}}>
            {fr?'Installer':'Install'}
          </button>
        </p>
      )}

      {/* Mini-stats d'EXEMPLE — jamais les données de l'utilisateur */}
      <div className="vt-anim" style={{animation:'vt-rise 0.5s ease 0.15s both'}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.12em',color:'#A39D8E',textAlign:'center',marginBottom:8}}>
          {fr?'Avec FillSell':'With FillSell'}
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

// Saisie d'un prix -> nombre.
//  · ""      -> null  : VIDE ≠ ZÉRO. On n'écrit RIEN (0 = « gratuit assumé »,
//                       une affirmation que l'utilisateur n'a pas faite).
//  · illisible -> NaN : on le dit, on ne le range pas en douce à 0.
// ⚠️ La virgule décimale est la saisie NORMALE en français : parseFloat("12,50")
// rend 12 sans broncher — 50 centimes évaporés en silence à chaque saisie.
function parsePrix(v){
  const t=String(v??"").trim().replace(/[\s€]/g,"").replace(",",".");
  if(!t) return null;
  const n=parseFloat(t);
  return Number.isFinite(n)&&n>=0?n:NaN;
}

// Même recherche que searchMatch (App.jsx) — cette fonction n'est pas exportée,
// et le mode « à compléter » reconstruit sa liste depuis groupedSales (non
// filtré par la recherche) : sans ce filtre, taper un nom puis cliquer le
// compteur ferait réapparaître des ventes que la recherche venait d'écarter.
function matchRecherche(s,q){
  const t=String(q||"").toLowerCase().trim();
  if(!t) return true;
  return !!(s.title?.toLowerCase().includes(t)||s.marque?.toLowerCase().includes(t)||s.description?.toLowerCase().includes(t)||s.type?.toLowerCase().includes(t));
}

const VentesTab = memo(function VentesTab({
  lang, currency, isPremium, isNative, user,
  sales, visibleSales, groupedSales,
  searchHistory, setSearchHistory,
  showAllSales, setShowAllSales,
  // (iapProduct retiré le 2026-08-09, cf. IAPUpgradeBlock.)
  iapLoading, handleIAPPurchase, handleIAPRestore,
  // Lot 2 : ligne discrète « extension pas encore installée » de l'état vide.
  extensionAbsente = false, onExtensionInfo = null,
  delSale, setTab, setEditItem,
  PremiumBanner, IAPUpgradeBlock,
  openUpgradeModal,
  // Vendus importés du dressing Vinted SANS ligne `ventes` (calculé par
  // App.jsx sur ventes.inventaire_id) : chacun attend prix de vente réel,
  // prix d'achat et date — Vinted ne communique aucun des trois.
  vendusAEnregistrer=[],
  // Rafraîchissement du parent APRÈS écriture. App.jsx ne la passe pas
  // aujourd'hui (d'où la valeur par défaut : aucun appelant à casser) — c'est
  // la couche optimiste `patchs` ci-dessous qui tient l'affichage en attendant
  // le prochain fetchAll.
  onSaleUpdated=()=>{},
}) {
  const { t } = useTranslation(lang);
  const fmt = (amount, dec=null) => formatCurrency(amount, currency, dec);
  const [filterType, setFilterType] = useState("Tous");
  const fr=lang!=='en';

  // ── Complétion des prix d'achat manquants (03/08) ──────────────────────────
  // `patchs` : couche OPTIMISTE locale, indexée par id de ligne `ventes`.
  //   {buy,margin} = prix saisi ; {inconnu:true} = « je ne sais plus ».
  // Elle existe parce que ce composant ne POSSÈDE pas `sales` : la liste vient
  // d'App.jsx et ne bouge qu'au prochain fetchAll. Sans patch, une vente qu'on
  // vient de compléter resterait à « — » et hors des totaux jusqu'au rechargement
  // de l'écran — exactement l'inverse de ce qu'on promet à l'utilisateur.
  const [patchs,setPatchs]=useState({});
  const [modeACompleter,setModeACompleter]=useState(false);
  const [openId,setOpenId]=useState(null);      // ligne dont le champ est ouvert
  const [draft,setDraft]=useState("");
  const [erreur,setErreur]=useState(null);      // {id,message} — id null = barre de lot
  const [selection,setSelection]=useState(()=>new Set());
  const [prixLot,setPrixLot]=useState("");
  const [busy,setBusy]=useState(false);
  const [liensInv,setLiensInv]=useState({});    // id de vente -> inventaire_id (ou null)
  // Entrée/Échap changent openId : le champ est démonté, et le blur qui suit
  // re-sauverait (ou sauverait une valeur annulée). Ce drapeau neutralise ce
  // blur-là, et lui seul.
  const sauteBlur=useRef(false);

  const patchLigne=useCallback((s,facteur=1)=>{
    const p=patchs[s?.id];
    if(!p) return s;
    if(p.inconnu) return {...s,prix_achat_inconnu:true};
    // facteur : une ligne groupée « ×3 » affiche la SOMME des marges (cf.
    // groupSales, App.jsx) alors qu'on écrit une marge UNITAIRE en base.
    return {...s,buy:p.buy,prix_achat:p.buy,margin:p.margin==null?null:p.margin*facteur};
  },[patchs]);

  const aDesPatchs=Object.keys(patchs).length>0;
  const salesPatchees=useMemo(()=>aDesPatchs?sales.map(s=>patchLigne(s)):sales,[sales,aDesPatchs,patchLigne]);

  // Le compteur se lit sur les LIGNES AFFICHÉES (groupes) : une vente ×3 est UNE
  // saisie à faire, pas trois. Une ligne déjà traitée (prix saisi OU « je ne sais
  // plus ») sort du compte ; un échec Supabase remet son patch à zéro, donc elle
  // y revient d'elle-même.
  const lignesSansPrix=useMemo(()=>groupedSales.filter(s=>!comptabilisable(s)),[groupedSales]);
  const nbACompleter=useMemo(()=>lignesSansPrix.filter(s=>!patchs[s.id]).length,[lignesSansPrix,patchs]);

  // ⚠️ PIÈGE DU GROUPEMENT (groupSales, App.jsx) : une ligne affichée peut
  // recouvrir PLUSIEURS lignes de la table `ventes` (ventes identiques
  // consécutives fusionnées en « ×3 ») et ne porte que l'id de la PREMIÈRE.
  // N'écrire que sur cet id laisserait les autres sans prix : le compteur
  // remonterait au rechargement et les totaux resteraient partiels. Une ligne à
  // `quantite` non nulle, elle, EST une seule ligne en base.
  const idsCibles=useCallback((ligne)=>{
    if(!ligne) return [];
    if(ligne.quantite!=null||(ligne._qty||1)<=1) return [ligne.id];
    const ids=sales.filter(s=>s.quantite==null&&!comptabilisable(s)
      &&s.title===ligne.title&&s.marque===ligne.marque&&s.date===ligne.date
      &&Math.abs((s.sell||0)-(ligne.sell||0))<0.01).map(s=>s.id);
    return ids.length?ids:[ligne.id];
  },[sales]);

  // Une ligne cochée puis complétée à la main sort d'elle-même de la sélection :
  // sa case n'est plus rendue, elle ne pourrait donc plus être décochée, et la
  // barre compterait des ventes qu'elle ne peut plus toucher.
  const lignesSelectionnees=useMemo(()=>groupedSales.filter(s=>selection.has(s.id)&&!patchs[s.id]),[groupedSales,selection,patchs]);
  const nbSel=lignesSelectionnees.length;
  const idsSelection=useMemo(()=>lignesSelectionnees.flatMap(idsCibles),[lignesSelectionnees,idsCibles]);

  // `inventaire_id` n'est pas exposé par mapSale (App.jsx) : on va le chercher
  // pour les seules ventes sélectionnées, et seulement une fois par id — c'est ce
  // qui décide si « Je ne sais plus » a une cible à marquer.
  useEffect(()=>{
    const manquants=idsSelection.filter(id=>!(id in liensInv));
    if(!manquants.length) return;
    let annule=false;
    supabase.from('ventes').select('id,inventaire_id').in('id',manquants).then(({data,error})=>{
      if(annule||error) return;
      // Les ids que la requête ne rend PAS (RLS, ligne disparue) sont notés
      // « sans article lié » : sinon liensCharges reste faux pour toujours et le
      // bouton « Je ne sais plus » ne sortirait jamais de son état grisé.
      setLiensInv(prev=>{const n={...prev};for(const id of manquants)n[id]=null;for(const r of(data||[]))n[r.id]=r.inventaire_id??null;return n;});
    });
    return()=>{annule=true;};
  },[idsSelection,liensInv]);

  const liensCharges=idsSelection.every(id=>id in liensInv);
  const invIdsSelection=useMemo(()=>[...new Set(idsSelection.map(id=>liensInv[id]).filter(v=>v!=null))],[idsSelection,liensInv]);

  // Écriture d'un prix d'achat sur UNE ligne affichée (1..n lignes en base).
  // Rend true/false — la barre de lot s'en sert pour savoir quoi vider.
  async function enregistrerPrix(ligne,pa){
    const ids=idsCibles(ligne);
    if(!ids.length) return false;
    const {margin}=margeUnitaire({prixVente:ligne.sell,prixAchat:pa});
    const avant={};ids.forEach(id=>{avant[id]=patchs[id];});
    setPatchs(p=>{const n={...p};ids.forEach(id=>{n[id]={buy:pa,margin};});return n;});
    setErreur(null);
    let req=supabase.from('ventes').update({prix_achat:pa,benefice:margin}).in('id',ids);
    if(user?.id) req=req.eq('user_id',user.id);
    const {error}=await req;
    if(error){
      // Rollback à l'état EXACT d'avant (undefined = aucun patch) : laisser le
      // patch en place afficherait un bénéfice que la base n'a pas.
      setPatchs(p=>{const n={...p};ids.forEach(id=>{if(avant[id]===undefined)delete n[id];else n[id]=avant[id];});return n;});
      setErreur({id:ligne.id,message:error.message});
      return false;
    }
    onSaleUpdated();
    return true;
  }

  function ouvrirSaisie(id){setOpenId(id);setDraft("");setErreur(null);}
  function fermerSaisie(){sauteBlur.current=true;setOpenId(null);setDraft("");setTimeout(()=>{sauteBlur.current=false;},0);}

  // Chaînage clavier : la vente suivante de la liste AFFICHÉE qui n'a toujours
  // ni prix ni décision. `filteredSales` est déjà patché, donc une ligne validée
  // à l'instant n'est jamais reproposée.
  function ligneSuivante(apres){
    const i=filteredSales.findIndex(s=>s.id===apres);
    for(let k=i+1;k<filteredSales.length;k++){
      const s=filteredSales[k];
      if(!patchs[s.id]&&!comptabilisable(s)) return s.id;
    }
    return null;
  }

  async function validerSaisie(ligne,{enchainer}={}){
    const pa=parsePrix(draft);
    if(Number.isNaN(pa)){setErreur({id:ligne.id,message:fr?'Prix illisible':'Invalid price'});return;}
    const suivant=enchainer?ligneSuivante(ligne.id):null;
    sauteBlur.current=true;
    setOpenId(suivant);setDraft("");
    setTimeout(()=>{sauteBlur.current=false;},0);
    // Champ vide : Entrée sert à PASSER la vente, pas à la déclarer gratuite.
    if(pa!==null) await enregistrerPrix(ligne,pa);
  }

  function onKeyPrix(e,ligne){
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();fermerSaisie();setErreur(null);return;}
    if(e.key!=='Enter') return;
    e.preventDefault();e.stopPropagation();
    validerSaisie(ligne,{enchainer:true});
  }

  // Filet du clic à côté : ce qui est tapé est sauvé, pas perdu. Ne se déclenche
  // jamais après Entrée/Échap (cf. sauteBlur).
  function onBlurPrix(ligne){
    if(sauteBlur.current) return;
    const pa=parsePrix(draft);
    setOpenId(null);setDraft("");
    if(pa!==null&&!Number.isNaN(pa)) enregistrerPrix(ligne,pa);
  }

  function toggleSelection(id){
    setSelection(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  }

  async function appliquerLot(){
    const pa=parsePrix(prixLot);
    if(pa===null||Number.isNaN(pa)){setErreur({id:null,message:fr?'Entre un prix unitaire':'Enter a unit price'});return;}
    setBusy(true);
    let ko=0;
    // Séquentiel : chaque vente a son prix de vente, donc son bénéfice — il n'y a
    // pas d'update unique possible.
    for(const l of lignesSelectionnees){ const ok=await enregistrerPrix(l,pa); if(!ok) ko++; }
    setBusy(false);
    if(!ko){setSelection(new Set());setPrixLot("");}
  }

  async function marquerInconnu(){
    if(!invIdsSelection.length) return;
    setBusy(true);setErreur(null);
    let req=supabase.from('inventaire').update({prix_achat_inconnu:true}).in('id',invIdsSelection);
    if(user?.id) req=req.eq('user_id',user.id);
    const {error}=await req;
    setBusy(false);
    if(error){setErreur({id:null,message:error.message});return;}
    // ⚠️ SCHÉMA VÉRIFIÉ LE 03/08 : `ventes` n'a PAS de colonne
    // prix_achat_inconnu — le drapeau ne vit que sur l'ARTICLE d'inventaire lié
    // (colonne ventes.inventaire_id). Conséquence assumée : côté ventes, la
    // marque « je ne sais plus » ne tient que le temps de l'écran ; au prochain
    // fetchAll ces ventes reviennent dans le compteur. `prix_achat` reste NULL
    // dans tous les cas — jamais 0.
    // On ne marque QUE les ventes dont l'article lié a réellement été drapeauté.
    // Griser aussi les autres reviendrait à afficher une décision que rien, nulle
    // part, n'a enregistrée.
    const idsMarques=idsSelection.filter(id=>liensInv[id]!=null);
    setPatchs(p=>{const n={...p};idsMarques.forEach(id=>{n[id]={inconnu:true};});return n;});
    setSelection(new Set());
    onSaleUpdated();
  }

  // ── Ventes importées du dressing : enregistrement (03/08 soir) ─────────────
  // Une vente ne s'écrit que par un geste humain : ces lignes d'inventaire
  // (statut='vendu', origine='vinted_sync') n'ont PAS de ligne `ventes` tant
  // que l'utilisateur n'a pas donné le prix réellement reçu — l'API Vinted
  // n'expose ni la date de vente ni le prix payé après négociation (prouvé le
  // 03/08 : aucun sold_at, price.amount = prix DEMANDÉ).
  const [modeImportes,setModeImportes]=useState(false);
  const [impSel,setImpSel]=useState(()=>new Set());
  const [impDrafts,setImpDrafts]=useState({});   // item.id -> {pv,pa,paInconnu,date,dateInconnue}
  const [impDone,setImpDone]=useState({});       // item.id -> true (optimiste : la ligne ventes existe)
  const [impErr,setImpErr]=useState(null);       // {id,message} — id null = barre de lot
  const [impBusy,setImpBusy]=useState(false);
  const [paLotImp,setPaLotImp]=useState("");
  const [dateLotImp,setDateLotImp]=useState("");
  // (dateLotInconnue retiré le 2026-08-09 : c'était un repli DIFFÉRÉ, appliqué
  // seulement à l'enregistrement et invisible d'ici là. Remplacé par l'action
  // de lot marquerLotInconnu, qui marque les lignes tout de suite et se défait
  // ligne par ligne — même comportement que son homologue « achat ».)
  // Proposition de prix de vente = dernier prix AFFICHÉ sur Vinted (relevés
  // vinted_listing_snapshots). PROPOSÉ, jamais imposé : pré-rempli dans un
  // champ éditable, à corriger si la vente a été négociée.
  const [propositions,setPropositions]=useState({}); // vinted_item_id -> price | null

  const vendusRestants=useMemo(()=>vendusAEnregistrer.filter(i=>!impDone[i.id]),[vendusAEnregistrer,impDone]);
  const nbImportes=vendusRestants.length;
  const lignesImpSel=useMemo(()=>vendusRestants.filter(i=>impSel.has(i.id)),[vendusRestants,impSel]);

  useEffect(()=>{
    if(!modeImportes) return;
    const ids=vendusAEnregistrer.map(i=>i.vinted_item_id).filter(Boolean).filter(id=>!(id in propositions));
    if(!ids.length) return;
    let annule=false;
    supabase.from('vinted_listing_snapshots')
      .select('vinted_item_id,price')
      .eq('user_id',user?.id).in('vinted_item_id',ids)
      .order('captured_at',{ascending:false}).limit(1000)
      .then(({data,error})=>{
        if(annule) return;
        // Ids sans relevé notés null : sans ça l'effet re-requêterait à chaque
        // rendu. error → tous null, le champ reste simplement vide.
        setPropositions(prev=>{
          const n={...prev};
          for(const id of ids) if(!(id in n)) n[id]=null;
          if(!error) for(const r of (data||[])) if(n[r.vinted_item_id]==null) n[r.vinted_item_id]=r.price;
          return n;
        });
      });
    return ()=>{annule=true;};
  },[modeImportes,vendusAEnregistrer,propositions,user?.id]);

  const majDraft=(id,champ,val)=>setImpDrafts(p=>({...p,[id]:{...(p[id]??{}),[champ]:val}}));

  // Écrit LA ligne ventes (le geste humain) + reporte le prix d'achat (ou la
  // décision « je ne sais plus ») sur l'article d'inventaire, comme partout.
  async function enregistrerVenteImportee(item,{pvBrut,paBrut,paInconnu,dateStr,dateInconnue}){
    const pv=parsePrix(pvBrut);
    if(pv===null||Number.isNaN(pv)){
      setImpErr({id:item.id,message:fr?'Le prix réellement reçu est requis':'The amount you actually received is required'});
      return false;
    }
    const pa=paInconnu?null:parsePrix(paBrut);
    if(Number.isNaN(pa)){setImpErr({id:item.id,message:fr?"Prix d'achat illisible":'Invalid purchase price'});return false;}
    const dateVente=dateInconnue?null:(dateStr||null);
    // Sans prix d'achat (vide ou « je ne sais plus ») : benefice NULL — la
    // vente compte au CA, jamais une marge inventée (règle VIDE ≠ ZÉRO).
    const {margin}=margeUnitaire({prixVente:pv,prixAchat:pa});
    const ligne={user_id:user?.id,titre:item.title,prix_achat:pa,prix_vente:pv,benefice:margin,
      date:dateVente,plateforme:'vinted',marque:item.marque||null,type:item.type||null,
      description:item.description||null,quantite:item.quantite||1,inventaire_id:item.id,statut:'vendu'};
    const {error}=await supabase.from('ventes').insert([ligne]);
    if(error){setImpErr({id:item.id,message:error.message});return false;}
    if(pa!=null){
      await supabase.from('inventaire').update({prix_achat:pa,prix_achat_inconnu:false}).eq('id',item.id).eq('user_id',user?.id);
    }else if(paInconnu){
      await supabase.from('inventaire').update({prix_achat_inconnu:true}).eq('id',item.id).eq('user_id',user?.id);
    }
    setImpDone(p=>({...p,[item.id]:true}));
    setImpErr(null);
    onSaleUpdated();
    return true;
  }

  function enregistrerLigneImportee(item){
    const d=impDrafts[item.id]??{};
    return enregistrerVenteImportee(item,{
      pvBrut:d.pv??propositions[item.vinted_item_id]??'',
      paBrut:d.pa??'',paInconnu:d.paInconnu===true,
      dateStr:d.date??'',dateInconnue:d.dateInconnue===true,
    });
  }

  // Lot : les valeurs de la barre servent de REPLI aux lignes sélectionnées qui
  // n'ont pas leur propre saisie. Le prix de vente reste par ligne (pré-rempli
  // au prix affiché, VISIBLE dans chaque champ avant le clic).
  // ── « Je ne sais plus » en lot (2026-08-09) ────────────────────────────────
  // 50 articles à confirmer, c'était 100 taps : un « je ne sais plus » achat +
  // un date, ligne par ligne. Ces deux actions écrivent dans les BROUILLONS des
  // lignes sélectionnées, pas au moment de l'enregistrement — l'utilisateur
  // voit « inconnu ✓ » apparaître sur chaque ligne, peut en défaire UNE sans
  // défaire les autres, et rien n'est écrit en base tant qu'il n'a pas cliqué
  // « Enregistrer les N ».
  // Elles ne remplissent QUE le vide : une ligne où un prix (ou une date) a
  // déjà été saisi est laissée intacte. Idempotentes.
  const marquerLotInconnu=(champSaisi,champInconnu)=>{
    setImpDrafts(prev=>{
      const n={...prev};
      for(const item of lignesImpSel){
        const d=n[item.id]??{};
        if(String(d[champSaisi]??'').trim()!=='') continue; // valeur saisie : intouchée
        n[item.id]={...d,[champInconnu]:true};
      }
      return n;
    });
  };
  // Nombre de lignes que l'action toucherait — sert à griser le bouton quand
  // il n'aurait plus rien à faire (tout est déjà rempli ou déjà marqué).
  const nbSansAchat=lignesImpSel.filter(i=>{const d=impDrafts[i.id]??{};return String(d.pa??'').trim()===''&&d.paInconnu!==true;}).length;
  const nbSansDate=lignesImpSel.filter(i=>{const d=impDrafts[i.id]??{};return String(d.date??'').trim()===''&&d.dateInconnue!==true;}).length;

  async function enregistrerLotImportes(){
    if(!lignesImpSel.length) return;
    setImpBusy(true);
    let ko=0;
    for(const item of lignesImpSel){
      const d=impDrafts[item.id]??{};
      const ok=await enregistrerVenteImportee(item,{
        pvBrut:d.pv??propositions[item.vinted_item_id]??'',
        paBrut:d.pa??paLotImp,paInconnu:d.paInconnu===true,
        dateStr:d.date??dateLotImp,dateInconnue:d.dateInconnue===true,
      });
      if(!ok) ko++;
    }
    setImpBusy(false);
    if(!ko){setImpSel(new Set());setPaLotImp("");setDateLotImp("");}
  }

  // KPI mois courant — même formule que tm (App.jsx)
  const now=new Date();
  const monthSales=salesPatchees.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===now.getMonth()&&sd.getFullYear()===now.getFullYear();});
  // `(s.margin||0)` transformait une vente sans prix d'achat en vente à marge
  // nulle : elle ne rapportait rien au bénéfice mais pesait au dénominateur du
  // pourcentage, qui tombait sans qu'aucune vente ait été mauvaise. Le CA sert
  // ici de dénominateur uniquement — d'où le CA des seules ventes retenues (cet
  // écran n'affiche aucun chiffre d'affaires, qui lui ne se filtre jamais).
  const {total:monthProfit,exclus:monthSansAchat}=totalMarge(monthSales);
  const monthCaComptabilise=totalCA(comptabilisables(monthSales));
  const monthMargePct=monthCaComptabilise>0?(monthProfit/monthCaComptabilise)*100:0;

  // Mode « à compléter » : on repart de groupedSales (TOUTES les ventes) et non
  // de visibleSales, plafonné à 10 lignes — sinon on inviterait à compléter 24
  // ventes en n'en montrant que 10.
  // ⚠️ L'appartenance à cette liste se juge sur la ligne BRUTE, pas patchée : une
  // vente qu'on vient de compléter DOIT rester à sa place. Si elle disparaissait
  // sous le curseur, la ligne suivante remonterait d'un cran à chaque Entrée et
  // le chaînage clavier sauterait une vente sur deux.
  const baseListe=modeACompleter
    ?groupedSales.filter(s=>!comptabilisable(s)&&matchRecherche(s,searchHistory))
    :visibleSales;
  const filteredSales=(filterType==="Tous"?baseListe:baseListe.filter(s=>s.type===filterType))
    .map(s=>patchLigne(s,s.quantite!=null?1:(s._qty||1)));

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
            {/* Un total partiel doit le dire, sinon ce % passe pour une moyenne
                sur toutes les ventes du mois. Affiché seulement s'il y a des exclus. */}
            {monthSansAchat>0&&(
              <div style={{fontSize:9,color:"var(--mute)",marginTop:2,lineHeight:1.25}}>
                {lang==='en'?`excl. ${monthSansAchat} without buy price`:`hors ${monthSansAchat} sans prix d'achat`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Prix d'achat manquants : compteur-invitation, cliquable ──
          ON N'OBLIGE JAMAIS : pas de modale, pas de blocage, pas de rouge. Un
          filtre qu'on ouvre et qu'on referme, rien de plus. Reste affiché à 0
          quand le mode est ouvert, sinon on ne pourrait plus en sortir. */}
      {(nbACompleter>0||modeACompleter)&&(
        <button className={`pa-call${modeACompleter?" on":""}`}
          onClick={()=>{setModeACompleter(v=>!v);setModeImportes(false);setSelection(new Set());setOpenId(null);setErreur(null);}}>
          <span style={{fontSize:17,flexShrink:0}}>{modeACompleter?"↩":"💡"}</span>
          <span style={{flex:1,minWidth:0}}>
            <span className="n">
              {modeACompleter
                ?(fr?"Revenir à toutes les ventes":"Back to all sales")
                :(fr?`${nbACompleter} vente${nbACompleter>1?"s":""} sans prix d'achat`
                    :`${nbACompleter} sale${nbACompleter>1?"s":""} without purchase price`)}
            </span>
            <span className="sub">
              {modeACompleter
                ?(nbACompleter===0
                    ?(fr?"Tout est complété 🎉":"All done 🎉")
                    :(fr?`Encore ${nbACompleter} à compléter · Entrée enchaîne la suivante`:`${nbACompleter} left · Enter jumps to the next one`))
                :(fr?"Complète-les pour voir tes bénéfices":"Add them to see your profit")}
            </span>
          </span>
        </button>
      )}

      {/* ── Ventes Vinted importées à enregistrer — compteur-invitation ──
          Même contrat que le compteur au-dessus : ON N'OBLIGE JAMAIS. Ces
          lignes ne sont pas des erreurs — Vinted ne communique simplement ni
          la date ni le prix payé, seul l'utilisateur les connaît. */}
      {(nbImportes>0||modeImportes)&&(
        <button className={`pa-call${modeImportes?" on":""}`}
          onClick={()=>{setModeImportes(v=>!v);setModeACompleter(false);setImpSel(new Set());setImpErr(null);}}>
          <span style={{fontSize:17,flexShrink:0}}>{modeImportes?"↩":"🧾"}</span>
          <span style={{flex:1,minWidth:0}}>
            <span className="n">
              {modeImportes
                ?(fr?"Revenir à toutes les ventes":"Back to all sales")
                :(fr?`${nbImportes} vente${nbImportes>1?"s":""} Vinted à enregistrer`
                    :`${nbImportes} Vinted sale${nbImportes>1?"s":""} to record`)}
            </span>
            <span className="sub">
              {modeImportes
                ?(nbImportes===0
                    ?(fr?"Tout est enregistré 🎉":"All recorded 🎉")
                    :(fr?`Encore ${nbImportes} à enregistrer`:`${nbImportes} left to record`))
                :(fr?"Prix et date réels connus de toi seul — enregistre-les pour qu'elles comptent"
                    :"Only you know the real price and date — record them so they count")}
            </span>
          </span>
        </button>
      )}

      {/* Barre de lot — le vide-grenier : « ces 20 t-shirts, 2 € pièce ». */}
      {nbSel>0&&(
        <div className="pa-bar">
          <span className="lbl">{fr?`${nbSel} sélectionnée${nbSel>1?"s":""}`:`${nbSel} selected`}</span>
          <input className="pa-input" inputMode="decimal" value={prixLot}
            onChange={e=>setPrixLot(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();appliquerLot();}if(e.key==='Escape'){e.preventDefault();setSelection(new Set());setPrixLot("");}}}
            placeholder={fr?"2,50":"2.50"} aria-label={fr?"Prix d'achat unitaire":"Unit purchase price"}/>
          <button className="apply" disabled={busy} onClick={appliquerLot}>
            {busy?"…":(fr?`Appliquer aux ${nbSel} vente${nbSel>1?"s":""}`:`Apply to ${nbSel} sale${nbSel>1?"s":""}`)}
          </button>
          {/* « Je ne sais plus » n'a de cible que si la vente vient d'un article
              du stock : le drapeau prix_achat_inconnu vit sur `inventaire`, pas
              sur `ventes`. Sans article lié, le bouton est inerte et le dit. */}
          <button className="ghost" disabled={busy||!liensCharges||invIdsSelection.length===0} onClick={marquerInconnu}>
            {fr?"Je ne sais plus":"I don't remember"}
          </button>
          <button className="ghost" onClick={()=>{setSelection(new Set());setPrixLot("");}}>✕</button>
          <div style={{flexBasis:"100%",display:"flex",flexDirection:"column",gap:2}}>
            <span className="pa-hint">{fr?"Prix d'achat UNITAIRE — le bénéfice se recalcule vente par vente.":"UNIT purchase price — profit is recomputed sale by sale."}</span>
            {liensCharges&&invIdsSelection.length===0&&(
              <span className="pa-hint">
                {fr?"« Je ne sais plus » indisponible : aucune de ces ventes n'est liée à un article du stock, il n'y a rien à marquer."
                   :"“I don't remember” unavailable: none of these sales is linked to a stock item, nothing to flag."}
              </span>
            )}
            {erreur?.id===null&&<span className="pa-err">{erreur.message}</span>}
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
        const presentTypes=["Tous","Mode","High-Tech","Maison","Électroménager","Jouets","Livres","Sport","Auto-Moto","Beauté","Musique","Collection","Multimédia","Jardin","Bricolage","Autre"].filter(tp=>tp==="Tous"||sales.some(s=>s.type===tp));
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

      {modeImportes?(
        <>
          {/* Explication UNE fois, en tête de mode — jamais répétée par ligne. */}
          <div className="imp-info">
            {fr
              ?<>Ces articles sont <b>vendus sur Vinted</b>, mais Vinted ne communique ni la date de vente ni le prix réellement payé après une négociation — ces infos n'existent que chez toi. Le prix est <b>pré-rempli avec le prix affiché</b> de l'annonce : corrige-le si la vente a été négociée. Une fois enregistrée, la vente compte dans tes chiffres comme toutes les autres.<br/>Tes annonces encore en ligne, elles, sont suivies automatiquement : à leur vente, FillSell te proposera d'enregistrer le prix et la date réels.</>
              :<>These items are <b>sold on Vinted</b>, but Vinted shares neither the sale date nor the price actually paid after an offer — only you know them. The price is <b>prefilled with the listing price</b>: adjust it if the sale was negotiated. Once recorded, the sale counts in your numbers like any other.<br/>Your listings still online are tracked automatically: when they sell, FillSell will offer to record the real price and date.</>}
          </div>

          {/* Barre de lot : repli commun pour prix d'achat et date. Le prix de
              vente reste PAR LIGNE, visible dans chaque champ avant le clic. */}
          {lignesImpSel.length>0&&(
            <div className="pa-bar">
              <span className="lbl">{fr?`${lignesImpSel.length} sélectionnée${lignesImpSel.length>1?"s":""}`:`${lignesImpSel.length} selected`}</span>
              <input className="pa-input" inputMode="decimal" value={paLotImp} onChange={e=>setPaLotImp(e.target.value)}
                placeholder={fr?"achat 2,50":"buy 2.50"} aria-label={fr?"Prix d'achat commun":"Common purchase price"}/>
              <input type="date" className="pa-input pa-date" value={dateLotImp}
                max={new Date().toISOString().slice(0,10)}
                onChange={e=>setDateLotImp(e.target.value)} aria-label={fr?"Date commune":"Common date"}/>
              {/* Les deux « je ne sais plus » de lot. Ils marquent les lignes
                  TOUT DE SUITE (visible ligne par ligne), et ne touchent que
                  celles restées vides — d'où le compteur dans le libellé et le
                  grisage quand il n'y a plus rien à marquer. */}
              <button className="imp-ghost" disabled={nbSansAchat===0}
                style={nbSansAchat===0?{opacity:0.45}:undefined}
                onClick={()=>marquerLotInconnu('pa','paInconnu')}>
                {fr?`achat : je ne sais plus${nbSansAchat?` (${nbSansAchat})`:""}`:`buy: I don't remember${nbSansAchat?` (${nbSansAchat})`:""}`}
              </button>
              <button className="imp-ghost" disabled={nbSansDate===0}
                style={nbSansDate===0?{opacity:0.45}:undefined}
                onClick={()=>marquerLotInconnu('date','dateInconnue')}>
                {fr?`date : je ne sais plus${nbSansDate?` (${nbSansDate})`:""}`:`date: I don't remember${nbSansDate?` (${nbSansDate})`:""}`}
              </button>
              <button className="apply" disabled={impBusy} onClick={enregistrerLotImportes}>
                {impBusy?"…":(fr?`Enregistrer les ${lignesImpSel.length}`:`Record ${lignesImpSel.length}`)}
              </button>
              <button className="ghost" onClick={()=>{setImpSel(new Set());setPaLotImp("");setDateLotImp("");}}>✕</button>
              <div style={{flexBasis:"100%",display:"flex",flexDirection:"column",gap:2}}>
                <span className="pa-hint">
                  {fr?"Chaque ligne part avec SON prix de vente affiché dans son champ — la barre ne fournit que l'achat et la date manquants, sans jamais écraser ce que tu as déjà saisi."
                     :"Each line is recorded with ITS sale price shown in its field — the bar only fills missing buy price and date, never overwriting what you already typed."}
                </span>
                {impErr?.id===null&&<span className="pa-err">{impErr.message}</span>}
              </div>
            </div>
          )}

          {vendusRestants.length===0&&(
            <div className="imp-info" style={{textAlign:'center'}}>{fr?"Tout est enregistré 🎉":"All recorded 🎉"}</div>
          )}

          {vendusRestants.map(item=>{
            const d=impDrafts[item.id]??{};
            const pvAffiche=d.pv??(propositions[item.vinted_item_id]??"");
            return(
              <div key={item.id} className="row" style={{cursor:"default"}}>
                <div className={`cat-tile ${catClass(item.type)}`}>{detectObjectIcon(item.title,item.description,item.type)}</div>
                <div className="left">
                  <div className="title-line">
                    <span className="title">{item.title}</span>
                    {item.marque&&(<><span className="brand-dot"/><span className="brandname">{marqueLabel(item.marque,lang)}</span></>)}
                  </div>
                  <div className="meta">
                    {fr?"Vendu sur Vinted — montants à confirmer":"Sold on Vinted — amounts to confirm"}
                    {/* Prix DEMANDÉ sur l'annonce (dernier relevé) : dit d'où
                        vient le pré-remplissage du champ « Vendu (€) », sans
                        jamais se faire passer pour le prix réellement reçu. */}
                    {propositions[item.vinted_item_id]!=null&&(
                      <> · {fr?`annonce à ${fmt(propositions[item.vinted_item_id])}`:`listed at ${fmt(propositions[item.vinted_item_id])}`}</>
                    )}
                  </div>
                  <div className="pa-line" style={{alignItems:"flex-end"}}>
                    <input type="checkbox" className="pa-check" style={{marginBottom:7}} checked={impSel.has(item.id)}
                      onChange={()=>setImpSel(prev=>{const n=new Set(prev);if(n.has(item.id))n.delete(item.id);else n.add(item.id);return n;})}
                      aria-label={fr?"Sélectionner cette vente":"Select this sale"}/>
                    <div className="imp-champ">
                      <span className="imp-lbl">{fr?"Vendu (€)":"Sold (€)"}</span>
                      <input className="pa-input" inputMode="decimal" value={pvAffiche}
                        onChange={e=>majDraft(item.id,'pv',e.target.value)}
                        placeholder={fr?"prix reçu":"received"}
                        aria-label={fr?"Prix de vente réellement reçu":"Actual sale price"}/>
                    </div>
                    <div className="imp-champ">
                      <span className="imp-lbl">{fr?"Acheté (€)":"Bought (€)"}</span>
                      {d.paInconnu
                        ?<button className="imp-ghost on" style={{padding:"6px 9px"}} onClick={()=>majDraft(item.id,'paInconnu',false)}>{fr?"inconnu ✓":"unknown ✓"}</button>
                        :<input className="pa-input" inputMode="decimal" value={d.pa??""}
                            onChange={e=>majDraft(item.id,'pa',e.target.value)}
                            placeholder="—" aria-label={fr?"Prix d'achat":"Purchase price"}/>}
                    </div>
                    <div className="imp-champ">
                      <span className="imp-lbl">{fr?"Vendu le":"Sold on"}</span>
                      {d.dateInconnue
                        ?<button className="imp-ghost on" style={{padding:"6px 9px"}} onClick={()=>majDraft(item.id,'dateInconnue',false)}>{fr?"inconnue ✓":"unknown ✓"}</button>
                        :<input type="date" className="pa-input pa-date" value={d.date??""}
                            max={new Date().toISOString().slice(0,10)}
                            onChange={e=>majDraft(item.id,'date',e.target.value)}
                            aria-label={fr?"Date de vente":"Sale date"}/>}
                    </div>
                    <button className="pa-ok" style={{padding:"6px 11px"}} onClick={()=>enregistrerLigneImportee(item)}>
                      {fr?"Enregistrer":"Record"}
                    </button>
                  </div>
                  <div className="pa-line" style={{marginTop:2}}>
                    {!d.paInconnu&&(
                      <button className="imp-ghost" onClick={()=>majDraft(item.id,'paInconnu',true)}>
                        {fr?"achat : je ne sais plus":"buy: I don't remember"}
                      </button>
                    )}
                    {!d.dateInconnue&&(
                      <button className="imp-ghost" onClick={()=>majDraft(item.id,'dateInconnue',true)}>
                        {fr?"date : je ne sais plus":"date: I don't remember"}
                      </button>
                    )}
                    {impErr?.id===item.id&&<span className="pa-err">{impErr.message}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      ):sales.length===0?(
        // Condition d'affichage inchangée : cet écran ne sort QUE si l'utilisateur
        // n'a réellement aucune vente. Le padding bas laisse passer le FAB micro
        // flottant (56 px + marge) : sans lui, le CTA « stats avancées » et la
        // grille de mini-stats finissaient sous le bouton en fin de scroll.
        <div style={{display:'flex',flexDirection:'column',gap:16,paddingBottom:'var(--nav-content-clearance)'}}>
          <SalesTicker lang={lang} fmt={fmt} setTab={setTab} extensionAbsente={extensionAbsente} onExtensionInfo={onExtensionInfo}/>
          {!isPremium&&!isNative&&(<PremiumBanner userEmail={user?.email} origine="banniere_ventes"/>)}
          {isNative&&!isPremium&&(<IAPUpgradeBlock lang={lang} iapLoading={iapLoading} onPurchase={()=>openUpgradeModal(null,'banniere_ventes')} onRestore={handleIAPRestore}/>)}
        </div>
      ):(
        <>
          {filteredSales.map(s=>{
            // date NULL = vente enregistrée « je ne sais plus » (import
            // dressing) : elle vit dans la liste et les totaux, hors des
            // périodes — et surtout pas un « NaN undefined » à l'écran.
            const d=s.date?new Date(s.date):null;
            const sameYear=!d||d.getFullYear()===now.getFullYear();
            const pKey=(s.plateforme||"").toLowerCase().trim();
            // Sans prix d'achat il n'y a pas de marge à montrer : `s.margin>=0`
            // était vrai pour null et la ligne affichait un « +0 € » vert, lu
            // comme « vendu à prix coûtant » au lieu de « on ne sait pas ».
            const margeConnue=comptabilisable(s)&&s.margin!=null&&Number.isFinite(Number(s.margin));
            return(
              // Swipe gauche = supprimer (conservé) ; tap sur la carte = éditer la vente.
              <SwipeRow key={s.id} onDelete={()=>delSale(s.id)} style={{borderRadius:16,border:"1px solid #E7E3D8",boxShadow:"none"}}>
                {/* _table:'ventes' — cette carte est une ligne de la table `ventes`,
                    PAS un article d'inventaire : leurs ids se chevauchent, et la
                    modale d'édition refuse d'écrire sans cible explicite. */}
                <div className="row in-swipe" onClick={()=>setEditItem({...s,_table:'ventes',frais:0,sell:s.sell??""})}>
                  {/* Icône crayon retirée le 2026-07-14 (comme sur le Stock) :
                      la carte entière est déjà cliquable pour éditer. */}
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
                    {/* Saisie du prix d'achat manquant, DANS la ligne.
                        ⚠️ stopPropagation obligatoire : la carte entière porte un
                        onClick qui ouvre la modale d'édition — sans lui, le
                        moindre clic dans le champ ferme l'écran et perd la
                        frappe en cours. */}
                    {!comptabilisable(s)&&!patchs[s.id]&&(
                      <div className="pa-line" onClick={e=>e.stopPropagation()}>
                        <input type="checkbox" className="pa-check" checked={selection.has(s.id)} onChange={()=>toggleSelection(s.id)}
                          aria-label={fr?"Sélectionner cette vente":"Select this sale"}/>
                        {openId===s.id?(
                          <>
                            {/* autoFocus : le champ est démonté puis remonté sur
                                la vente suivante à chaque Entrée — c'est ce
                                remontage qui donne le focus, sans ref ni effet. */}
                            <input className="pa-input" autoFocus inputMode="decimal" value={draft}
                              placeholder={fr?"12,50":"12.50"}
                              onChange={e=>setDraft(e.target.value)}
                              onKeyDown={e=>onKeyPrix(e,s)}
                              onBlur={()=>onBlurPrix(s)}
                              aria-label={fr?"Prix d'achat":"Purchase price"}/>
                            <button className="pa-ok" onMouseDown={e=>e.preventDefault()} onClick={()=>validerSaisie(s)}>✓</button>
                            <span className="pa-hint">{fr?"Entrée = suivante · Échap = annuler":"Enter = next · Esc = cancel"}</span>
                          </>
                        ):(
                          <button className="pa-chip" onClick={()=>ouvrirSaisie(s.id)}>+ {fr?"prix d'achat":"purchase price"}</button>
                        )}
                        {erreur?.id===s.id&&<span className="pa-err">{erreur.message}</span>}
                      </div>
                    )}
                    {patchs[s.id]?.inconnu&&(
                      <div className="pa-note">{fr?"Prix d'achat inconnu — hors calcul de marge":"Purchase price unknown — excluded from margins"}</div>
                    )}
                  </div>
                  <div className="right">
                    <div className={`profit${margeConnue&&s.margin<0?" neg":""}`} style={margeConnue?undefined:{color:"var(--mute)"}}>{margeConnue?`${s.margin>=0?"+":""}${fmt(s.margin)}`:"—"}</div>
                    <div className="sold-date">{d?<>{d.getDate()} {(lang==='en'?MONTHS_EN:MONTHS_FR)[d.getMonth()]}{sameYear?"":` ${d.getFullYear()}`}</>:(fr?"date inconnue":"unknown date")}</div>
                  </div>
                </div>
              </SwipeRow>
            );
          })}
          {/* En mode « à compléter », la liste est déjà complète (elle ne passe
              pas par le plafond de 10 de visibleSales) : le bouton mentirait. */}
          {!modeACompleter&&!showAllSales&&groupedSales.length>10&&(
            <button onClick={()=>setShowAllSales(true)}
              style={{width:"100%",padding:"12px",background:"none",border:"1px solid #2F9E90",borderRadius:999,color:"#2F9E90",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
              {lang==='fr'?`Voir plus (${groupedSales.length-10} autres)`:`Show more (${groupedSales.length-10} more)`}
            </button>
          )}
          {!isPremium&&!isNative&&(<PremiumBanner userEmail={user?.email} origine="banniere_ventes"/>)}
          {isNative&&!isPremium&&(<IAPUpgradeBlock lang={lang} iapLoading={iapLoading} onPurchase={()=>openUpgradeModal(null,'banniere_ventes')} onRestore={handleIAPRestore}/>)}
        </>
      )}

      {/* ── Bouton stats avancées (liste des ventes uniquement) ──
          ⚠️ Ne PAS le rendre sur l'état vide : celui-ci a désormais son propre
          CTA « Voir mes stats avancées » (cf. SalesTicker). Sans cette garde,
          le bouton s'affichait une 2e fois tout en bas, sous le FAB micro. */}
      {sales.length>0&&isPremium&&(
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
