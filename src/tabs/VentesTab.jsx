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
/* ── Sélection globale + fenêtre de rendu (2026-08-11) ── */
.ventes-v2 .imp-all{display:flex;align-items:center;gap:9px;background:#fff;border:1px solid var(--border);border-radius:12px;padding:9px 13px;}
.ventes-v2 .imp-all .txt{font-size:12.5px;font-weight:700;color:var(--ink);flex:1;min-width:0;}
.ventes-v2 .imp-all .sub{display:block;font-size:10.5px;font-weight:600;color:var(--mute);margin-top:1px;}
.ventes-v2 .imp-all button{border:1px solid var(--teal);background:rgba(47,158,144,.08);color:var(--teal-deep);border-radius:999px;padding:6px 12px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;}
.ventes-v2 .imp-more{width:100%;border:1px dashed var(--border);background:#fff;color:var(--mute);border-radius:12px;padding:11px 0;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;}
.ventes-v2 .imp-prog{flex-basis:100%;height:5px;border-radius:99px;background:rgba(47,158,144,.15);overflow:hidden;}
.ventes-v2 .imp-prog i{display:block;height:100%;background:linear-gradient(120deg,var(--teal),var(--teal-deep));transition:width .18s linear;}
.ventes-v2 .imp-modal{position:fixed;inset:0;z-index:10001;background:rgba(16,32,27,.55);display:flex;align-items:center;justify-content:center;padding:20px;}
.ventes-v2 .imp-modal .box{background:#fff;border-radius:18px;padding:20px;max-width:340px;width:100%;box-shadow:0 24px 60px -20px rgba(16,32,27,.6);}
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

// ── Constantes de volume (2026-08-11) ───────────────────────────────────────
// Fenêtre de RENDU des ventes importées. N'a aucun effet sur la sélection ni sur
// l'enregistrement, qui portent tous deux sur la liste filtrée complète.
const RENDU_PAS=50;
// Taille des paquets d'insertion. 500 lignes par requête : au-delà, le corps de
// la requête PostgREST devient assez gros pour que l'échec d'un paquet coûte
// cher à rejouer, et l'avancement affiché devient trop grossier pour rassurer.
const LOT_INSERT=500;
// Au-delà de ce nombre, on annonce le chiffre exact avant d'écrire. Écrire
// 1 982 ventes est difficile à défaire : ça se confirme.
const SEUIL_CONFIRMATION=100;

// ── État vide des Ventes ────────────────────────────────────────────────────
// PLUS AUCUNE DONNÉE INVENTÉE ICI depuis le 2026-08-09. L'écran ouvrait sur un
// carrousel « Aperçu — à quoi ça ressemble » qui faisait défiler cinq ventes
// fictives (Sac Kelly Hermès +420 €, iPhone 12 Pro +100 €…) en boucle, barre de
// progression comprise, au-dessus d'un « Aucune vente pour l'instant ». Le
// libellé « Aperçu » levait l'ambiguïté sur le papier ; à l'écran, un compte
// neuf voyait d'abord des montants qui n'étaient pas les siens.
// Ce qui reste se vérifie : le titre, ce que FillSell fait à chaque vente, et
// les deux boutons. Ne pas réintroduire de chiffre d'exemple, même étiqueté.

// ── Le parcours RÉEL d'une vente (2026-08-09) ────────────────────────────────
// Remplace les trois mini-stats inventées (« Marge moy. ~45 % », « Délai vente
// ~4 jours », « Meilleure vente +420 € ») qui occupaient ce bloc. Elles étaient
// des ordres de grandeur sortis de nulle part, affichés en gros et en vert
// juste sous « Ce que tu vas pouvoir suivre » : impossible pour un nouveau de
// les lire autrement que comme une promesse de résultat. On montre désormais ce
// que FillSell FAIT — vérifiable, et vrai pour tout le monde.
// ⚠️ Étape 2 : le retrait se fait TOUJOURS sur confirmation. Ne jamais
// reformuler en « retire automatiquement ».
const PARCOURS_VENTE = [
  {
    tile: UI.teal,
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
    labelFr:'On repère la vente', labelEn:'We spot the sale',
    textFr:'Vinted, Leboncoin, eBay et Beebs sont surveillés.',
    textEn:'Vinted, Leboncoin, eBay and Beebs are watched.',
  },
  {
    tile: UI.amber,
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/></svg>,
    labelFr:'Tu retires les autres', labelEn:'You remove the rest',
    textFr:'En un tap, et seulement si tu confirmes.',
    textEn:'One tap, and only if you confirm.',
  },
  {
    tile: UI.tealDeep,
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/></svg>,
    labelFr:'Ta marge se calcule', labelEn:'Your margin computes',
    textFr:"Prix de vente moins prix d'achat et frais.",
    textEn:'Sale price minus purchase price and fees.',
  },
];

// fmt retiré de la signature le 2026-08-09 : son seul lecteur était le
// carrousel de ventes fictives, qui formatait des montants inventés.
function SalesTicker({ lang, setTab, extensionAbsente = false, onExtensionInfo = null }) {
  // (État et boucle d'animation du carrousel retirés le 2026-08-09 avec lui :
  //  idx / visible / progress + une requestAnimationFrame qui tournait en
  //  permanence sur un écran vide, pour faire défiler cinq ventes inventées.)
  const fr = lang !== 'en';

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <style>{`@keyframes vt-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @media (prefers-reduced-motion:reduce){.vt-anim{animation:none !important}}`}</style>


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

      {/* Le parcours d'une vente — vrai pour tout le monde, aucun chiffre
          inventé (2026-08-09). Même parti pris que l'état vide du Stock : on
          montre ce que FillSell FAIT, pas des ordres de grandeur qui se lisent
          comme une promesse de résultat. */}
      <div className="vt-anim" style={{animation:'vt-rise 0.5s ease 0.15s both'}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.12em',color:'#A39D8E',textAlign:'center',marginBottom:8}}>
          {fr?'Avec FillSell':'With FillSell'}
        </div>
        <div style={{fontSize:13.5,fontWeight:700,color:UI.ink,textAlign:'center',marginBottom:12}}>
          {fr?'Ce qui se passe à chaque vente':'What happens on every sale'}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          {PARCOURS_VENTE.map((c,i)=>(
            <div key={i} style={{background:'rgba(47,158,144,0.07)',border:'1px solid rgba(47,158,144,0.18)',borderRadius:16,padding:'14px 8px',textAlign:'center'}}>
              <div style={{width:34,height:34,borderRadius:11,background:c.tile,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 9px'}}>
                {c.icon}
              </div>
              <div style={{fontSize:11,fontWeight:700,color:UI.tealDeep,lineHeight:1.3,marginBottom:5}}>
                {fr?c.labelFr:c.labelEn}
              </div>
              <div style={{fontSize:9.5,fontWeight:500,lineHeight:1.4,color:'#8A8578'}}>
                {fr?c.textFr:c.textEn}
              </div>
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
  // ── Volume (2026-08-11) ───────────────────────────────────────────────────
  // Un compte réel est arrivé avec 3 434 articles dont 1 982 vendus sur Vinted,
  // donc 1 982 lignes à confirmer. Trois choses cassaient à cette échelle :
  //   · aucun moyen de tout sélectionner — 1 982 taps ;
  //   · la liste rendait TOUTES les lignes d'un coup, chacune avec 3 champs
  //     contrôlés et 3 boutons : ~14 000 nœuds DOM, l'écran se fige ;
  //   · l'enregistrement groupé bouclait vente par vente, 1 insert + 1 update
  //     chacune, soit ~4 000 allers-retours réseau.
  // `impRenduMax` ne borne QUE le rendu. Toute la sélection et tout
  // l'enregistrement travaillent sur les identifiants filtrés, jamais sur ce qui
  // est monté à l'écran — c'est la distinction qui fait que « Tout sélectionner »
  // veut dire quelque chose.
  const [impRenduMax,setImpRenduMax]=useState(RENDU_PAS);
  // {fait,total,ko} pendant l'écriture par paquets — l'avancement RÉEL, mesuré
  // sur les paquets confirmés par la base, jamais une estimation.
  const [impProgress,setImpProgress]=useState(null);
  // Nombre de lignes en attente de confirmation au-dessus du seuil, ou null.
  const [impConfirm,setImpConfirm]=useState(null);
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

  // ── PORTÉE DE LA SÉLECTION (2026-08-11) ───────────────────────────────────
  // `vendusFiltres` est la liste filtrée COMPLÈTE — pas la fenêtre rendue.
  // C'est elle, et elle seule, que « Tout sélectionner » parcourt et que
  // l'enregistrement groupé traite.
  //
  // Le filtre catégorie ne s'appliquait PAS à cette liste jusqu'ici : les
  // pastilles étaient construites sur `sales` (les ventes déjà enregistrées) et
  // n'étaient même pas rendues quand `sales` était vide — le cas exact d'un
  // compte qui vient d'importer son dressing. Sans ce filtre, « Tout
  // sélectionner par catégorie » n'aurait rien voulu dire.
  const vendusFiltres=useMemo(
    ()=>filterType==="Tous"?vendusRestants:vendusRestants.filter(i=>i.type===filterType),
    [vendusRestants,filterType]);
  const nbFiltres=vendusFiltres.length;

  // La sélection est TOUJOURS relue à travers le filtre courant : même si un id
  // survivait à un changement de filtre, il ne pourrait pas entrer dans une
  // écriture. Le vidage ci-dessous est la garantie visible, ceci est la garantie
  // structurelle — aucune écriture ne peut porter sur une ligne hors du filtre.
  const lignesImpSel=useMemo(()=>vendusFiltres.filter(i=>impSel.has(i.id)),[vendusFiltres,impSel]);
  const nbImpSel=lignesImpSel.length;
  const tousSelectionnes=nbFiltres>0&&nbImpSel===nbFiltres;
  const selectionPartielle=nbImpSel>0&&!tousSelectionnes;

  // Changer de filtre VIDE la sélection. « Recalculer » aurait voulu dire garder
  // des lignes invisibles dans le compteur d'une autre catégorie : un
  // « Enregistrer les 1 982 » affiché sous un filtre « Mode » qui n'en montre
  // que 300 est exactement l'incohérence qu'on veut interdire.
  const changerFiltre=useCallback((tp)=>{
    if(tp===filterType) return;   // re-clic sur la pastille active : rien à vider
    setFilterType(tp);
    setImpSel(new Set());
    setImpRenduMax(RENDU_PAS);
    setSelection(new Set());
  },[filterType]);

  // Fenêtre de rendu seulement. `vendusVisibles` n'est JAMAIS une source de
  // vérité pour la sélection ou l'écriture.
  const vendusVisibles=useMemo(()=>vendusFiltres.slice(0,impRenduMax),[vendusFiltres,impRenduMax]);

  const basculerToutSelectionner=useCallback(()=>{
    setImpSel(prev=>{
      // Tout est déjà coché dans CETTE vue : on décoche cette vue, sans toucher
      // à ce qui aurait été coché sous un autre filtre.
      if(nbFiltres>0&&vendusFiltres.every(i=>prev.has(i.id))){
        const n=new Set(prev);for(const i of vendusFiltres)n.delete(i.id);return n;
      }
      const n=new Set(prev);for(const i of vendusFiltres)n.add(i.id);return n;
    });
  },[vendusFiltres,nbFiltres]);

  // ⚠️ PAGINÉ ET DÉCOUPÉ PAR LOTS D'IDS (2026-08-11). L'ancienne version tenait
  // en une requête `.in(1982 ids).limit(1000)` : PostgREST rendait 1 000 lignes,
  // les 982 autres articles n'avaient AUCUN prix pré-rempli, et comme le prix de
  // vente est le seul champ obligatoire, l'enregistrement groupé les aurait
  // silencieusement écartés. Sur le compte à 1 982 ventes, « Enregistrer les
  // 1 982 » en aurait écrit environ mille sans jamais dire pourquoi.
  // Un `.in()` trop long finit aussi par dépasser la longueur d'URL : d'où le
  // découpage par lots d'ids, et la pagination par `.range()` à l'intérieur de
  // chaque lot (un article peut avoir plusieurs relevés).
  useEffect(()=>{
    if(!modeImportes) return;
    const ids=vendusAEnregistrer.map(i=>i.vinted_item_id).filter(Boolean).filter(id=>!(id in propositions));
    if(!ids.length) return;
    let annule=false;
    (async()=>{
      const LOT_IDS=400,PAGE=1000;
      const trouves={};
      let echec=false;
      for(let i=0;i<ids.length&&!annule;i+=LOT_IDS){
        const lot=ids.slice(i,i+LOT_IDS);
        for(let from=0;!annule;from+=PAGE){
          const {data,error}=await supabase.from('vinted_listing_snapshots')
            .select('vinted_item_id,price')
            .eq('user_id',user?.id).in('vinted_item_id',lot)
            .order('captured_at',{ascending:false}).range(from,from+PAGE-1);
          if(error){echec=true;break;}
          // Trié par relevé le plus récent : le PREMIER vu pour un article est
          // le bon, les suivants sont d'anciens prix.
          for(const r of (data||[])) if(trouves[r.vinted_item_id]==null) trouves[r.vinted_item_id]=r.price;
          if(!data||data.length<PAGE) break;
        }
        if(echec) break;
      }
      if(annule) return;
      // Ids sans relevé notés null : sans ça l'effet re-requêterait à chaque
      // rendu. Échec → tous null, le champ reste simplement vide.
      setPropositions(prev=>{
        const n={...prev};
        for(const id of ids) if(!(id in n)) n[id]=null;
        for(const [id,prix] of Object.entries(trouves)) if(n[id]==null) n[id]=prix;
        return n;
      });
    })();
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

  // ── Enregistrement groupé par PAQUETS (2026-08-11) ────────────────────────
  // L'ancienne boucle appelait enregistrerVenteImportee ligne par ligne : un
  // insert + un update par vente, soit ~4 000 allers-retours pour 1 982 ventes.
  // Elle reste en place pour le bouton « Enregistrer » d'UNE ligne, qui est un
  // geste unitaire et doit garder son message d'erreur sur sa propre ligne.
  //
  // Préparation pure, sans écriture : toutes les lignes sont validées AVANT le
  // premier insert, pour qu'une ligne sans prix reçu ne fasse pas échouer un
  // paquet entier. Les règles de repli sont celles de la barre, à l'identique —
  // la barre ne fournit que ce qui manque, elle n'écrase jamais une saisie.
  function prepareLigneImportee(item){
    const d=impDrafts[item.id]??{};
    const pv=parsePrix(d.pv??propositions[item.vinted_item_id]??'');
    if(pv===null||Number.isNaN(pv)) return {item,invalide:true};
    const paInconnu=d.paInconnu===true;
    const pa=paInconnu?null:parsePrix(d.pa??paLotImp);
    if(Number.isNaN(pa)) return {item,invalide:true};
    const dateVente=d.dateInconnue===true?null:((d.date??dateLotImp)||null);
    const {margin}=margeUnitaire({prixVente:pv,prixAchat:pa});
    return {item,pa,paInconnu,ligne:{
      user_id:user?.id,titre:item.title,prix_achat:pa,prix_vente:pv,benefice:margin,
      date:dateVente,plateforme:'vinted',marque:item.marque||null,type:item.type||null,
      description:item.description||null,quantite:item.quantite||1,inventaire_id:item.id,statut:'vendu'}};
  }

  // REPRISE PLUTÔT QUE TRANSACTION (choix assumé) : un insert PostgREST est
  // atomique par requête, donc chaque paquet passe ou ne passe pas — jamais à
  // moitié. On marque `impDone` paquet par paquet, sur les seules lignes que la
  // base a RENVOYÉES, et on retire ces lignes-là de la sélection. Une erreur au
  // paquet 3 laisse donc : 2 paquets écrits, le reste toujours sélectionné, et
  // un message qui donne le compte exact. Relancer reprend où ça s'est arrêté.
  // Aucune ligne ne peut rester dans un état indéterminé.
  async function executerLotImportes(cibles){
    setImpConfirm(null);
    if(!cibles.length) return;
    setImpBusy(true);setImpErr(null);

    const prepares=cibles.map(prepareLigneImportee);
    const valides=prepares.filter(p=>!p.invalide);
    const invalides=prepares.length-valides.length;
    if(!valides.length){
      setImpBusy(false);
      setImpErr({id:null,message:fr
        ?"Aucune de ces ventes n'a de prix reçu — renseigne-le avant d'enregistrer."
        :"None of these sales has a received price — fill it in before recording."});
      return;
    }

    setImpProgress({fait:0,total:valides.length});
    let fait=0,arret=null;
    for(let i=0;i<valides.length;i+=LOT_INSERT){
      const paquet=valides.slice(i,i+LOT_INSERT);
      const {data,error}=await supabase.from('ventes')
        .insert(paquet.map(p=>p.ligne)).select('inventaire_id');
      if(error){arret=error.message;break;}
      // Ce que la base a réellement accepté — pas ce qu'on lui a demandé.
      const inseres=new Set((data||[]).map(r=>String(r.inventaire_id)));
      const retenus=paquet.filter(p=>inseres.has(String(p.item.id)));

      // Report sur l'inventaire, GROUPÉ : un update par valeur d'achat distincte
      // (en pratique une seule, celle de la barre) + un pour les « je ne sais
      // plus ». Deux requêtes par paquet au lieu de 500.
      const parPa=new Map();const idsInconnu=[];
      for(const p of retenus){
        if(p.pa!=null){const k=String(p.pa);if(!parPa.has(k))parPa.set(k,[]);parPa.get(k).push(p.item.id);}
        else if(p.paInconnu) idsInconnu.push(p.item.id);
      }
      for(const [k,ids] of parPa){
        await supabase.from('inventaire').update({prix_achat:Number(k),prix_achat_inconnu:false})
          .in('id',ids).eq('user_id',user?.id);
      }
      if(idsInconnu.length){
        await supabase.from('inventaire').update({prix_achat_inconnu:true})
          .in('id',idsInconnu).eq('user_id',user?.id);
      }

      setImpDone(prev=>{const n={...prev};for(const p of retenus)n[p.item.id]=true;return n;});
      setImpSel(prev=>{const n=new Set(prev);for(const p of retenus)n.delete(p.item.id);return n;});
      fait+=retenus.length;
      setImpProgress({fait,total:valides.length});
    }

    setImpBusy(false);setImpProgress(null);
    onSaleUpdated();
    if(arret){
      setImpErr({id:null,message:fr
        ?`Interrompu après ${fait} vente${fait>1?'s':''} enregistrée${fait>1?'s':''} sur ${valides.length}. Les autres sont toujours sélectionnées — relance pour reprendre. (${arret})`
        :`Stopped after ${fait} of ${valides.length} recorded. The rest are still selected — run it again to resume. (${arret})`});
      return;
    }
    if(invalides>0){
      setImpErr({id:null,message:fr
        ?`${fait} enregistrée${fait>1?'s':''}. ${invalides} sans prix reçu, laissée${invalides>1?'s':''} de côté.`
        :`${fait} recorded. ${invalides} without a received price were skipped.`});
      return;
    }
    setPaLotImp("");setDateLotImp("");
  }

  function enregistrerLotImportes(){
    if(!nbImpSel) return;
    // Au-delà du seuil, on annonce le chiffre exact avant d'écrire.
    if(nbImpSel>SEUIL_CONFIRMATION){setImpConfirm(nbImpSel);return;}
    executerLotImportes(lignesImpSel);
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

      {/* ── Filtres catégorie — mêmes pills à pastille que StockTab ──
          En mode « ventes importées », les pastilles se construisent sur les
          lignes EN ATTENTE, pas sur les ventes déjà enregistrées : sinon un
          compte qui vient d'importer son dressing (0 vente enregistrée, 1 982 à
          confirmer) n'avait aucun filtre du tout — et « tout sélectionner par
          catégorie » n'aurait eu aucun sens. */}
      {(modeImportes?vendusRestants.length>0:sales.length>0)&&(()=>{
        const base=modeImportes?vendusRestants:sales;
        const presentTypes=["Tous","Mode","High-Tech","Maison","Électroménager","Jouets","Livres","Sport","Auto-Moto","Beauté","Musique","Collection","Multimédia","Jardin","Bricolage","Autre"].filter(tp=>tp==="Tous"||base.some(s=>s.type===tp));
        return presentTypes.length>1&&(
          <div className="cat-filters">
            {presentTypes.map(tp=>{
              const isActive=filterType===tp;
              return(
                <button key={tp} className={`fpill${isActive?" active":""}`} onClick={()=>changerFiltre(tp)}>
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

          {/* ── Sélection globale ────────────────────────────────────────────
              Porte sur `vendusFiltres` — TOUTES les lignes en attente du filtre
              courant, y compris celles qui ne sont pas rendues. C'est le point
              de la fonctionnalité : à 1 982 lignes, ce qui est monté à l'écran
              n'est jamais ce qu'on veut sélectionner. */}
          {nbFiltres>0&&(
            <div className="imp-all">
              <input type="checkbox" className="pa-check"
                checked={tousSelectionnes}
                ref={el=>{if(el)el.indeterminate=selectionPartielle;}}
                onChange={basculerToutSelectionner}
                aria-label={fr?"Tout sélectionner":"Select all"}/>
              <span className="txt">
                {nbImpSel>0
                  ?(fr?`${nbImpSel} sélectionnée${nbImpSel>1?"s":""} sur ${nbFiltres}`
                      :`${nbImpSel} of ${nbFiltres} selected`)
                  :(fr?`${nbFiltres} vente${nbFiltres>1?"s":""} à enregistrer`
                      :`${nbFiltres} sale${nbFiltres>1?"s":""} to record`)}
                {filterType!=="Tous"&&(
                  <span className="sub">
                    {fr?`filtre : ${typeLabel(filterType,lang)} — la sélection ne sort pas de cette catégorie`
                       :`filter: ${typeLabel(filterType,lang)} — selection stays within this category`}
                  </span>
                )}
              </span>
              <button onClick={basculerToutSelectionner}>
                {tousSelectionnes
                  ?(fr?"Tout désélectionner":"Deselect all")
                  :(fr?`Tout sélectionner (${nbFiltres})`:`Select all (${nbFiltres})`)}
              </button>
            </div>
          )}

          {/* Barre de lot : repli commun pour prix d'achat et date. Le prix de
              vente reste PAR LIGNE, visible dans chaque champ avant le clic. */}
          {nbImpSel>0&&(
            <div className="pa-bar">
              <span className="lbl">{fr?`${nbImpSel} sélectionnée${nbImpSel>1?"s":""}`:`${nbImpSel} selected`}</span>
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
                {impBusy?"…":(fr?`Enregistrer les ${nbImpSel}`:`Record ${nbImpSel}`)}
              </button>
              <button className="ghost" disabled={impBusy} onClick={()=>{setImpSel(new Set());setPaLotImp("");setDateLotImp("");}}>✕</button>
              {/* Avancement RÉEL : le compteur ne bouge qu'une fois le paquet
                  confirmé par la base, jamais par anticipation. */}
              {impProgress&&(
                <>
                  <div className="imp-prog"><i style={{width:`${Math.round(100*impProgress.fait/Math.max(1,impProgress.total))}%`}}/></div>
                  <span className="pa-hint" style={{flexBasis:"100%"}}>
                    {fr?`${impProgress.fait} / ${impProgress.total} enregistrées…`:`${impProgress.fait} / ${impProgress.total} recorded…`}
                  </span>
                </>
              )}
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
          {vendusRestants.length>0&&nbFiltres===0&&(
            <div className="imp-info" style={{textAlign:'center'}}>
              {fr?"Aucune vente à enregistrer dans cette catégorie.":"No sale to record in this category."}
            </div>
          )}

          {/* ⚠️ On rend `vendusVisibles`, une FENÊTRE. La sélection et
              l'enregistrement, eux, portent sur `vendusFiltres` en entier. */}
          {vendusVisibles.map(item=>{
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

          {/* Fenêtre de rendu — n'a AUCUN effet sur ce que « Tout sélectionner »
              et « Enregistrer les N » traitent. Le dire ici, parce que voir
              50 lignes et un bouton « Enregistrer les 1 982 » doit s'expliquer. */}
          {nbFiltres>vendusVisibles.length&&(
            <button className="imp-more" onClick={()=>setImpRenduMax(n=>n+RENDU_PAS)}>
              {fr?`Afficher plus (${vendusVisibles.length} sur ${nbFiltres})`
                 :`Show more (${vendusVisibles.length} of ${nbFiltres})`}
              <span style={{display:'block',fontSize:10.5,fontWeight:600,marginTop:2,opacity:.8}}>
                {fr?"la sélection et l'enregistrement portent sur les "+nbFiltres+", pas seulement sur ce qui est affiché"
                   :"selection and recording cover all "+nbFiltres+", not just what's shown"}
              </span>
            </button>
          )}
        </>
      ):sales.length===0?(
        // Condition d'affichage inchangée : cet écran ne sort QUE si l'utilisateur
        // n'a réellement aucune vente. Le padding bas laisse passer le FAB micro
        // flottant (56 px + marge) : sans lui, le CTA « stats avancées » et la
        // grille de mini-stats finissaient sous le bouton en fin de scroll.
        <div style={{display:'flex',flexDirection:'column',gap:16,paddingBottom:'var(--nav-content-clearance)'}}>
          <SalesTicker lang={lang} setTab={setTab} extensionAbsente={extensionAbsente} onExtensionInfo={onExtensionInfo}/>
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

      {/* ── Confirmation au-dessus du seuil (2026-08-11) ────────────────────
          Écrire N lignes de ventes n'est pas une action triviale et se défait
          mal : au-delà de SEUIL_CONFIRMATION, on annonce le chiffre EXACT et ce
          qui va être écrit avant de toucher la base. En dessous, aucun
          frottement ajouté — le geste reste immédiat. */}
      {impConfirm!=null&&(
        <div className="imp-modal" onClick={()=>setImpConfirm(null)}>
          <div className="box" onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:700,color:"var(--ink)",marginBottom:8}}>
              {fr?`Enregistrer ${impConfirm} ventes ?`:`Record ${impConfirm} sales?`}
            </div>
            <div style={{fontSize:12.5,lineHeight:1.55,color:"var(--mute)",marginBottom:16}}>
              {fr
                ?<>Chaque ligne part avec <b>son</b> prix de vente. {filterType!=="Tous"&&<>Filtre actif : <b>{typeLabel(filterType,lang)}</b>. </>}Elles compteront dans tes chiffres immédiatement, et il n'y a pas d'annulation groupée — il faudrait les supprimer une par une.</>
                :<>Each line is recorded with <b>its own</b> sale price. {filterType!=="Tous"&&<>Active filter: <b>{typeLabel(filterType,lang)}</b>. </>}They will count in your numbers straight away, and there is no bulk undo — you would have to delete them one by one.</>}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="ghost" style={{flex:1,padding:"11px 0"}} onClick={()=>setImpConfirm(null)}>
                {fr?"Annuler":"Cancel"}
              </button>
              <button className="apply" style={{flex:2,padding:"11px 0"}} onClick={()=>executerLotImportes(lignesImpSel)}>
                {fr?`Enregistrer les ${impConfirm}`:`Record the ${impConfirm}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default VentesTab;
