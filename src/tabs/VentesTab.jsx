import { memo, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import SwipeRow from '../components/SwipeRow';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import GalleryPhoto, { premierePhoto } from '../components/GalleryPhoto';
import { UI } from '../components/ui';
import { supabase } from '../lib/supabase';
import SectionAExpedier from '../messagerie/SectionAExpedier';
import {
  formatCurrency,
  typeLabel, marqueLabel,
  getCatTileColor, catClass, buildCardCss,
} from '../utils/shared';
import { comptabilisable, margeUnitaire, prixAchatNum } from '../utils/comptabilite';
import { searchMatch } from '../utils/recherche';
import { CSS_ECRANS } from '../ecrans/animations';
import { Compteur } from '../ecrans/primitives';
import Icone, { IconeCategorie } from '../ecrans/Icone';
import EncartPremium from '../ecrans/EncartPremium';
import VentesVide from '../ecrans/vides/VentesVide';
import { NomPlateforme } from '../ecrans/pleins/communs';
import { ENCRE2, DISCRET, PECHE_ENCRE, libellePct } from '../ecrans/pleins/jetons';
import {
  plateformeVente, plateformesPresentes, venteDeLaPlateforme, grouperParMois, margeMoyenne,
  margePctVente, prixAchatZero, totalEncaisse, jourDeVente, CODES_PLATEFORME_VENTE,
} from '../utils/ventesStats';
import { motVendu, jourCourt, MOIS_LONGS_FR, MOIS_LONGS_EN } from '../utils/accordVendu';

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
/* ── Vignette photo (2026-08-27) : première photo de l'article à gauche de
   chaque ligne — même source et même repli que la galerie du Stock IA
   (GalleryPhoto : photos[0], deux formats, onError → icône de catégorie).
   La liste reste HORIZONTALE : rien d'autre ne change sur cet écran. */
.ventes-v2 .vphoto{width:42px;height:42px;border-radius:11px;overflow:hidden;flex-shrink:0;background:var(--paper);}
.ventes-v2 .vphoto img{width:100%;height:100%;object-fit:cover;display:block;}
.ventes-v2 .vphoto .gph-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;}
.ventes-v2 .vphoto .cat-tile{width:100%;height:100%;border-radius:11px;}

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
// Nombre d'ids par requête `.in(...)`. Un `.in()` de 2 000 identifiants part en
// query string : au-delà de quelques centaines, l'URL dépasse ce que PostgREST
// et les proxies acceptent, et la réponse est de toute façon tronquée à 1 000
// lignes. Trois plafonds nous ont déjà mordus (ventes 500, snapshots 1 000,
// inventaire 3 000) : celui-là est de la même famille, on le découpe.
const LOT_IDS=300;

/** Découpe un tableau en tranches de `taille`. */
function tranches(liste,taille){
  const out=[];
  for(let i=0;i<liste.length;i+=taille) out.push(liste.slice(i,i+taille));
  return out;
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

// Le mode « à compléter » reconstruit sa liste depuis groupedSales (non filtré
// par la recherche) : sans ce filtre, taper un nom puis cliquer le compteur
// ferait réapparaître des ventes que la recherche venait d'écarter.
// (2026-09-20) La copie locale a disparu : c'est la MÊME fonction que le stock,
// dans src/utils/recherche.js.
const matchRecherche = searchMatch;

const VentesTab = memo(function VentesTab({
  lang, currency, isPremium, user,
  // (16/10) visibleSales n'est plus lu : la liste se fenêtre ici, APRÈS la
  // recherche et le filtre de plateforme (App.jsx coupait à 10 avant de chercher).
  sales, groupedSales,
  searchHistory, setSearchHistory,
  showAllSales, setShowAllSales,
  // (16/10) Le bloc d'offre est EncartPremium (même geste : openUpgradeModal) ;
  // « Restaurer mes achats » vit dans Réglages › Abonnement.
  iapLoading,
  // Lot 2 : ligne discrète « extension pas encore installée » de l'état vide.
  extensionAbsente = false, onExtensionInfo = null,
  delSale, setTab, setEditItem,
  openUpgradeModal,
  // Vendus importés du dressing Vinted SANS ligne `ventes` (calculé par
  // App.jsx sur ventes.inventaire_id) : chacun attend prix de vente réel,
  // prix d'achat et date — Vinted ne communique aucun des trois.
  vendusAEnregistrer=[],
  // Photos par ligne d'inventaire (App.jsx) : la table `ventes` n'a pas de
  // photos, la vignette se lit via ventes.inventaire_id. {} par défaut :
  // aucun appelant à casser, la tuile d'icône reprend sa place.
  photosParInventaire={},
  // Rafraîchissement du parent APRÈS écriture. App.jsx ne la passe pas
  // aujourd'hui (d'où la valeur par défaut : aucun appelant à casser) — c'est
  // la couche optimiste `patchs` ci-dessous qui tient l'affichage en attendant
  // le prochain fetchAll.
  onSaleUpdated=()=>{},
  // (16/10, bêta messages + bordereaux) Section « À expédier » : compte bêta seulement.
  messagerieBeta=false,
}) {
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
  // (16/10) Une saisie PAR vente : les ventes du mois montrent leur champ
  // « Prix d'achat » directement dans la carte (maquette), il peut donc y en
  // avoir plusieurs à l'écran. Clé = id de la ligne affichée.
  const [drafts,setDrafts]=useState({});
  // (16/10) Filtre par plateforme RÉELLE (utils/ventesStats.plateformeVente :
  // « Vinted » et « vinted » sont une seule plateforme). 'toutes' = aucun.
  const [filtrePlateforme,setFiltrePlateforme]=useState('toutes');
  const [erreur,setErreur]=useState(null);      // {id,message} — id null = barre de lot
  const [selection,setSelection]=useState(()=>new Set());
  const [prixLot,setPrixLot]=useState("");
  const [busy,setBusy]=useState(false);
  // Volume, vue B — mêmes bornes que la vue A : fenêtre de RENDU, avancement
  // réel, confirmation au-delà du seuil. La sélection, elle, ne connaît pas la
  // fenêtre (cf. lignesACompleter).
  const [venteRenduMax,setVenteRenduMax]=useState(RENDU_PAS);
  const [progressLot,setProgressLot]=useState(null);   // {fait,total}
  const [confirmLot,setConfirmLot]=useState(null);     // {mode,n}
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
  // ⚠️ Relue à travers le filtre ET la recherche courants (2026-08-11), comme en
  // vue A : le vidage au changement de filtre est la garantie VISIBLE, ceci est
  // la garantie STRUCTURELLE. Aucune écriture de lot ne peut porter sur une
  // ligne que l'utilisateur ne voit pas dans sa vue du moment.
  const lignesSelectionnees=useMemo(
    ()=>groupedSales.filter(s=>selection.has(s.id)&&!patchs[s.id]
      &&venteDeLaPlateforme(s,filtrePlateforme)
      &&matchRecherche(s,searchHistory)),
    [groupedSales,selection,patchs,filtrePlateforme,searchHistory]);
  const nbSel=lignesSelectionnees.length;
  const idsSelection=useMemo(()=>lignesSelectionnees.flatMap(idsCibles),[lignesSelectionnees,idsCibles]);

  // ── inventaire_id : lu EN LOCAL (2026-08-11) ──────────────────────────────
  // Le commentaire d'origine disait « inventaire_id n'est pas exposé par
  // mapSale » et justifiait un aller-retour réseau pour le retrouver. C'est
  // faux depuis un moment : mapSale rend bien `inventaire_id`. Cette requête
  // aurait porté un `.in()` de ~2 000 identifiants dès qu'on sélectionne tout —
  // URL démesurée, et réponse tronquée à 1 000 lignes par PostgREST, donc un
  // « Je ne sais plus » silencieusement partiel. Supprimée : la correspondance
  // se fait sur `sales`, sans requête et sans plafond.
  const invParVente=useMemo(()=>{
    const m=new Map();
    for(const s of sales) m.set(s.id,s.inventaire_id??null);
    return m;
  },[sales]);
  const invIdsSelection=useMemo(
    ()=>[...new Set(idsSelection.map(id=>invParVente.get(id)).filter(v=>v!=null))],
    [idsSelection,invParVente]);

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

  const majDraftPrix=(id,v)=>setDrafts(d=>({...d,[id]:v}));
  const viderDraftPrix=(id)=>setDrafts(d=>{if(!(id in d))return d;const n={...d};delete n[id];return n;});
  function ouvrirSaisie(id){setOpenId(id);viderDraftPrix(id);setErreur(null);}
  useEffect(()=>{
    if(openId==null)return;
    const el=document.getElementById(`pa-${openId}`);
    if(el&&document.activeElement!==el){el.focus({preventScroll:true});el.scrollIntoView({block:'center',behavior:'smooth'});}
  },[openId]);
  function fermerSaisie(id){sauteBlur.current=true;setOpenId(null);viderDraftPrix(id);setTimeout(()=>{sauteBlur.current=false;},0);}

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
    const pa=parsePrix(drafts[ligne.id]);
    if(Number.isNaN(pa)){setErreur({id:ligne.id,message:fr?'Prix illisible':'Invalid price'});return;}
    const suivant=enchainer?ligneSuivante(ligne.id):null;
    sauteBlur.current=true;
    setOpenId(suivant);viderDraftPrix(ligne.id);
    setTimeout(()=>{sauteBlur.current=false;},0);
    // Champ vide : Entrée sert à PASSER la vente, pas à la déclarer gratuite.
    if(pa!==null) await enregistrerPrix(ligne,pa);
  }

  function onKeyPrix(e,ligne){
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();fermerSaisie(ligne.id);setErreur(null);return;}
    if(e.key!=='Enter') return;
    e.preventDefault();e.stopPropagation();
    validerSaisie(ligne,{enchainer:true});
  }

  // Filet du clic à côté : ce qui est tapé est sauvé, pas perdu. Ne se déclenche
  // jamais après Entrée/Échap (cf. sauteBlur).
  function onBlurPrix(ligne){
    if(sauteBlur.current) return;
    const pa=parsePrix(drafts[ligne.id]);
    if(openId===ligne.id)setOpenId(null);
    viderDraftPrix(ligne.id);
    if(pa!==null&&!Number.isNaN(pa)) enregistrerPrix(ligne,pa);
  }

  function toggleSelection(id){
    setSelection(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ÉCRITURE DE LOT SUR LES VENTES À COMPLÉTER (2026-08-11)
  // ══════════════════════════════════════════════════════════════════════════
  // L'ancienne boucle appelait enregistrerPrix() ligne par ligne : une requête
  // par vente affichée. Sur 1 982 lignes, ~2 000 allers-retours.
  //
  // Pourquoi PAS un seul UPDATE : PostgREST n'applique qu'un patch UNIFORME par
  // requête, et `benefice` dépend du prix de VENTE de chaque ligne. On regroupe
  // donc par valeur de bénéfice — c'est-à-dire, à prix d'achat commun, par prix
  // de vente. Les prix se répètent massivement : relevé en base, 1 982 ventes du
  // gros compte portent 58 prix distincts, 197 ventes en portent 38. Le
  // regroupement ramène donc ~2 000 écritures à ~58, sans jamais fabriquer un
  // bénéfice faux.
  // (Un upsert partiel aurait donné 4 requêtes, mais l'INSERT sous-jacent peut
  //  créer des lignes fantômes si un id a disparu, et `ventes` n'a aucune
  //  contrainte d'unicité pour l'en empêcher. Écarté : le gain ne vaut pas ce
  //  risque-là sur la table qui porte le chiffre d'affaires.)
  //
  // « Je ne sais plus » est le cas dégénéré : bénéfice NULL pour tout le monde,
  // prix_achat jamais touché → un seul groupe, une requête par tranche de 500.
  function grouperParEcriture(lignes,pa){
    const groupes=new Map();   // clé = bénéfice (ou 'null') -> {patch, ids[]}
    for(const l of lignes){
      const ids=idsCibles(l);
      if(!ids.length) continue;
      const {margin}=margeUnitaire({prixVente:l.sell,prixAchat:pa});
      const cle=margin==null?'null':String(margin);
      if(!groupes.has(cle)) groupes.set(cle,{patch:{prix_achat:pa,benefice:margin},ids:[],lignes:[]});
      const g=groupes.get(cle);
      g.ids.push(...ids);
      g.lignes.push({ligne:l,ids,margin});
    }
    return [...groupes.values()];
  }

  // REPRISE PLUTÔT QUE TRANSACTION (même choix qu'en vue A) : chaque requête
  // PostgREST est atomique. On applique groupe par groupe, tranche par tranche ;
  // ce qui est écrit est marqué et sort de la sélection, le reste y demeure. Une
  // panne en cours laisse un état lisible et relançable, jamais indéterminé.
  async function ecrireLotACompleter(lignes,pa,{marquerInventaire=false}={}){
    setBusy(true);setErreur(null);
    const groupes=grouperParEcriture(lignes,pa);
    const total=groupes.reduce((a,g)=>a+g.lignes.length,0);
    setProgressLot({fait:0,total});
    let fait=0,arret=null;

    // ⚠️ On avance par TRANCHE, pas par groupe. Découper les ids du groupe puis
    // ne marquer qu'à la fin du groupe donnait un rapport faux : « je ne sais
    // plus » ne fait qu'UN groupe (bénéfice null pour tout le monde), donc une
    // panne à la 3e tranche annonçait « interrompu après 0 vente » alors que
    // 1 000 lignes étaient déjà écrites. Le compte rendu doit refléter la base,
    // pas la structure de la boucle.
    for(const g of groupes){
      for(const lot of tranches(g.lignes,LOT_INSERT)){
        const ids=lot.flatMap(l=>l.ids);
        let req=supabase.from('ventes').update(g.patch).in('id',ids);
        if(user?.id) req=req.eq('user_id',user.id);
        const {error}=await req;
        if(error){arret=error.message;break;}

        // Le drapeau « je ne sais plus » vit sur l'ARTICLE d'inventaire lié
        // (`ventes` n'a pas cette colonne, schéma vérifié le 03/08). Il est posé
        // DANS la tranche, juste après l'écriture des ventes : le poser à la fin
        // de l'opération ferait perdre le marquage des tranches déjà écrites en
        // cas de panne, et ces ventes-là reviendraient dans « à compléter » au
        // rechargement alors qu'elles ont bien été traitées.
        // Depuis le 11/08, App.jsx recolle ce drapeau sur les ventes au
        // chargement (salesAvecInconnu) : la décision TIENT désormais.
        if(marquerInventaire){
          const invIds=[...new Set(lot.flatMap(l=>l.ids).map(id=>invParVente.get(id)).filter(v=>v!=null))];
          for(const lotInv of tranches(invIds,LOT_IDS)){
            let reqInv=supabase.from('inventaire').update({prix_achat_inconnu:true}).in('id',lotInv);
            if(user?.id) reqInv=reqInv.eq('user_id',user.id);
            const {error:errInv}=await reqInv;
            if(errInv){arret=errInv.message;break;}
          }
          if(arret) break;
        }

        setPatchs(p=>{
          const n={...p};
          for(const {ids:idsL,margin} of lot) for(const id of idsL) n[id]=pa==null?{inconnu:true}:{buy:pa,margin};
          return n;
        });
        setSelection(prev=>{const n=new Set(prev);for(const {ligne} of lot)n.delete(ligne.id);return n;});
        fait+=lot.length;
        setProgressLot({fait,total});
      }
      if(arret) break;
    }

    setBusy(false);setProgressLot(null);setConfirmLot(null);
    onSaleUpdated();
    if(arret){
      setErreur({id:null,message:fr
        ?`Interrompu après ${fait} vente${fait>1?'s':''} sur ${total}. Les autres sont toujours sélectionnées — relance pour reprendre. (${arret})`
        :`Stopped after ${fait} of ${total}. The rest are still selected — run it again to resume. (${arret})`});
      return;
    }
    setPrixLot("");
  }

  // Les trois gestes de la barre. Ils ne diffèrent que par le prix d'achat écrit,
  // et cette différence est TOUT le sujet :
  //   · un prix commun   → prix_achat = ce prix
  //   · « c'était gratuit » → prix_achat = 0, marge = prix de vente. 100 % de
  //     marge est alors la VÉRITÉ.
  //   · « je ne sais plus » → prix_achat reste NULL, marge non calculable.
  // Écrire 0 pour dire « je ne sais pas » produirait une marge de 100 % sur du
  // vent : c'est exactement ce que ce dédoublement rend impossible.
  function demanderLot(mode){
    const n=nbSel;
    if(!n) return;
    if(mode==='prix'){
      const pa=parsePrix(prixLot);
      if(pa===null||Number.isNaN(pa)){setErreur({id:null,message:fr?'Entre un prix unitaire':'Enter a unit price'});return;}
    }
    if(n>SEUIL_CONFIRMATION){setConfirmLot({mode,n});return;}
    executerLot(mode);
  }

  function executerLot(mode){
    if(mode==='inconnu') return ecrireLotACompleter(lignesSelectionnees,null,{marquerInventaire:true});
    if(mode==='gratuit') return ecrireLotACompleter(lignesSelectionnees,0);
    return ecrireLotACompleter(lignesSelectionnees,parsePrix(prixLot));
  }

  const appliquerLot=()=>demanderLot('prix');
  const marquerInconnu=()=>demanderLot('inconnu');
  const marquerGratuit=()=>demanderLot('gratuit');

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
    // Vue B : même règle, la sélection ne survit pas à un changement de filtre.
    setSelection(new Set());
    setVenteRenduMax(RENDU_PAS);
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
  // Pendant de marquerLotInconnu : « c'était gratuit » écrit 0 dans le brouillon
  // du prix d'achat. Même contrat — ne remplit QUE le vide, ne touche pas une
  // ligne déjà saisie ni une ligne déjà marquée « je ne sais plus ».
  const remplirLotAchatGratuit=()=>{
    setImpDrafts(prev=>{
      const n={...prev};
      for(const item of lignesImpSel){
        const d=n[item.id]??{};
        if(String(d.pa??'').trim()!==''||d.paInconnu===true) continue;
        n[item.id]={...d,pa:'0'};
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

  // KPI mois courant — même filtre de mois que tm (App.jsx)
  const now=new Date();
  const monthSales=salesPatchees.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===now.getMonth()&&sd.getFullYear()===now.getFullYear();});
  // (16/10, maquette validée par Nico) Les trois chiffres du haut : l'ENCAISSÉ du
  // mois, le nombre de ventes du mois, et la marge du mois — en %, sur les seules
  // ventes au prix d'achat > 0 (règle b, utils/ventesStats) ; « — » quand aucune
  // n'en a, jamais « 0,0 % » (qui se lisait comme une vente à prix coûtant).
  const encaisseMois=totalEncaisse(monthSales);
  const margeMois=margeMoyenne(monthSales,{mode:'ponderee'});
  // Progression des prix d'achat : compte des VENTES (lignes de la table),
  // patchs de la session compris — « 22 / 238 ventes complètes ».
  const nbVentesTotal=salesPatchees.length;
  const nbVentesCompletes=salesPatchees.filter(comptabilisable).length;
  const plateformes=useMemo(()=>plateformesPresentes(sales),[sales]);
  const moisCourant=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  // Mode « à compléter » : on repart de groupedSales (TOUTES les ventes) et non
  // d'une fenêtre de 10 lignes — sinon on inviterait à compléter 24 ventes en
  // n'en montrant que 10.
  // ⚠️ L'appartenance à cette liste se juge sur la ligne BRUTE, pas patchée : une
  // vente qu'on vient de compléter DOIT rester à sa place. Si elle disparaissait
  // sous le curseur, la ligne suivante remonterait d'un cran à chaque Entrée et
  // le chaînage clavier sauterait une vente sur deux.
  // (16/10) groupedSales arrive TRIÉE par date de vente décroissante (App.jsx,
  // utils/ventesStats.trierVentes) ; la recherche porte sur toutes les ventes
  // (plus seulement sur les 10 premières), puis le filtre de plateforme.
  const baseListe=(modeACompleter
    ?groupedSales.filter(s=>!comptabilisable(s)&&matchRecherche(s,searchHistory))
    :groupedSales.filter(s=>matchRecherche(s,searchHistory)))
    .filter(s=>venteDeLaPlateforme(s,filtrePlateforme));
  const filteredSales=baseListe.map(s=>patchLigne(s,s.quantite!=null?1:(s._qty||1)));

  // ── Vue B : portée de la sélection globale (2026-08-11) ───────────────────
  // `lignesACompleter` = TOUTES les lignes à compléter du filtre courant. C'est
  // sur elle que portent « Tout sélectionner » et les écritures de lot — jamais
  // sur `ventesVisibles`, qui n'est qu'une fenêtre de rendu.
  // Une ligne déjà traitée pendant la session (patch posé) en sort : on ne la
  // reproposerait que pour la réécrire à l'identique.
  const lignesACompleter=useMemo(
    ()=>modeACompleter?filteredSales.filter(s=>!patchs[s.id]):[],
    [modeACompleter,filteredSales,patchs]);
  const nbACompleterFiltre=lignesACompleter.length;
  const tousVentesSel=nbACompleterFiltre>0&&nbSel===nbACompleterFiltre;
  const ventesSelPartielle=nbSel>0&&!tousVentesSel;
  const LIMITE_LISTE=10;
  const ventesVisibles=modeACompleter
    ?filteredSales.slice(0,venteRenduMax)
    :(showAllSales?filteredSales:filteredSales.slice(0,LIMITE_LISTE));
  const groupesMois=grouperParMois(ventesVisibles);
  // Total de chaque mois : sur TOUTES les ventes filtrées du mois, jamais sur la
  // seule fenêtre affichée (une ligne « ×3 » compte trois ventes).
  const totauxMois={};
  for(const s of filteredSales){
    const j=jourDeVente(s);const k=j?j.slice(0,7):'sans-date';
    const q=s.quantite!=null?1:(s._qty||1);
    const t=(totauxMois[k] ||= {nb:0,ca:0});
    t.nb+=q;t.ca+=(Number(s.sell)||0)*q;
  }

  const basculerToutSelectionnerVentes=useCallback(()=>{
    setSelection(prev=>{
      if(nbACompleterFiltre>0&&lignesACompleter.every(s=>prev.has(s.id))){
        const n=new Set(prev);for(const s of lignesACompleter)n.delete(s.id);return n;
      }
      const n=new Set(prev);for(const s of lignesACompleter)n.add(s.id);return n;
    });
  },[lignesACompleter,nbACompleterFiltre]);

  // « Compléter en série » : la sélection multiple existante (mode « à
  // compléter » : liste des ventes sans prix d'achat, Entrée enchaîne la
  // suivante, sélection + prix commun en lot) — ouverte sur la PREMIÈRE vente.
  const entrerModeACompleter=(ouvrirPremiere)=>{
    setModeACompleter(true);setModeImportes(false);setSelection(new Set());setErreur(null);setVenteRenduMax(RENDU_PAS);
    if(ouvrirPremiere){
      const premiere=groupedSales.find(s=>!comptabilisable(s)&&!patchs[s.id]&&matchRecherche(s,searchHistory)&&venteDeLaPlateforme(s,filtrePlateforme));
      setOpenId(premiere?.id??null);
    }else setOpenId(null);
  };
  const quitterModeACompleter=()=>{setModeACompleter(false);setSelection(new Set());setOpenId(null);setErreur(null);};
  const choisirPlateforme=(cle)=>{setFiltrePlateforme(cle);setSelection(new Set());setVenteRenduMax(RENDU_PAS);};

  const nomMois=(g)=>g.cle==='sans-date'
    ?(fr?'Date inconnue':'Unknown date')
    :`${(fr?MOIS_LONGS_FR:MOIS_LONGS_EN)[g.mois]} ${g.annee}`;
  const pastille={display:'inline-flex',alignItems:'center',gap:6,height:36,padding:'0 14px',borderRadius:18,fontSize:14,fontWeight:600,whiteSpace:'nowrap',cursor:'pointer',fontFamily:'inherit',flexShrink:0};
  let rangCarte=0;

  // La carte d'une vente (16/10, maquette) : photo, titre, date et plateforme ;
  // à droite le prix (vente incomplète) ou le bénéfice et le % (vente complète,
  // prix d'achat > 0) ; « prix d'achat à 0 € » sans pourcentage (règle b).
  // La saisie du prix d'achat vit DANS la carte, par le chemin existant
  // (enregistrerPrix) : champ ouvert d'office pour les ventes du mois, et pour
  // toutes en « Compléter en série » ; « + prix d'achat » pour les autres.
  const carteVente=(s)=>{
    const j=jourDeVente(s);
    const quand=j?jourCourt(j,lang,now):(fr?'date inconnue':'unknown date');
    const p=plateformeVente(s);
    const qte=s._qty||1;
    const complete=comptabilisable(s);
    const pct=margePctVente(s);
    const zero=complete&&prixAchatZero(s);
    const margeConnue=complete&&s.margin!=null&&Number.isFinite(Number(s.margin));
    const inconnuPatch=patchs[s.id]?.inconnu;
    const aSaisir=!complete&&!patchs[s.id];
    const champOuvert=aSaisir&&(openId===s.id||modeACompleter||(j&&j.slice(0,7)===moisCourant));
    const delai=Math.min(0.9,0.32+(rangCarte++)*0.05);
    return(
      <div key={s.id} className="fsx-rise" style={{animationDelay:`${delai.toFixed(2)}s`}}>
        {/* Swipe gauche = supprimer (conservé) ; tap sur la carte = éditer la vente. */}
        <SwipeRow onDelete={()=>delSale(s.id)} padInterne={0} iconeSuppression={<Icone nom="poubelle" taille={22} couleur="#FFFFFF"/>}
          style={{borderRadius:20,border:"1px solid #E7E3D8",boxShadow:"none",background:"#fff"}}>
          {/* _table:'ventes' — cette carte est une ligne de la table `ventes`,
              PAS un article d'inventaire : leurs ids se chevauchent, et la
              modale d'édition refuse d'écrire sans cible explicite. Frais
              pré-remplis depuis la vente (2026-08-14). */}
          <div className="vc-carte in-swipe" onClick={()=>setEditItem({...s,_table:'ventes',frais:s.sellingFees??0,sell:s.sell??""})}>
            <div className="vc-ligne">
              <div className="vc-photo">
                <GalleryPhoto url={premierePhoto(photosParInventaire[s.inventaire_id])} alt={s.title}
                  fallback={<div className={`cat-tile ${catClass(s.type)}`}><IconeCategorie type={s.type}/></div>}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
                  <span className="vc-titre">{s.title}</span>
                  {qte>1&&<span className="qty-badge">×{qte}</span>}
                </div>
                <div className="vc-sous">
                  <span>{quand}</span>
                  {p&&<span aria-hidden="true">·</span>}
                  {p&&(CODES_PLATEFORME_VENTE.includes(p.code)
                    ?<NomPlateforme p={p} taille={14}/>
                    :<span className="vc-autre">{p.code==='ailleurs'?(fr?'Ailleurs':'Elsewhere'):p.libelle}</span>)}
                </div>
                {complete&&(
                  <div className="vc-sous" style={{marginTop:2}}>
                    {s.marque&&<><span style={{overflow:'hidden',textOverflow:'ellipsis'}}>{marqueLabel(s.marque,lang)}</span><span aria-hidden="true">·</span></>}
                    <span style={{fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{fmt(prixAchatNum(s))} → {fmt(s.sell)}</span>
                  </div>
                )}
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                {margeConnue?(
                  <>
                    <div className={`vc-montant${s.margin<0?' neg':' pos'}`}>{s.margin>=0?'+':''}{fmt(s.margin)}</div>
                    {pct!=null
                      ?<span className="vc-pct fsx-popin" style={{animationDelay:`${(delai+0.4).toFixed(2)}s`}}>{libellePct(pct,1)}</span>
                      :zero&&<div className="vc-zero">{fr?"prix d'achat à 0 €":'purchase price €0'}</div>}
                  </>
                ):(
                  <>
                    <div className="vc-montant">{fmt((Number(s.sell)||0)*(s.quantite!=null?1:qte))}</div>
                    <div style={{fontSize:11.5,color:DISCRET}}>{motVendu(s.title,lang).toLowerCase()}</div>
                    {aSaisir&&!champOuvert&&(
                      <button type="button" className="vc-ajout" onClick={e=>{e.stopPropagation();ouvrirSaisie(s.id);}}>+ {fr?"prix d'achat":'purchase price'}</button>
                    )}
                  </>
                )}
              </div>
            </div>
            {/* ⚠️ stopPropagation obligatoire : la carte entière ouvre la modale
                d'édition — sans lui, le moindre clic dans le champ ferme l'écran
                et perd la frappe en cours. */}
            {champOuvert&&(
              <div className="vc-saisie" onClick={e=>e.stopPropagation()}>
                {modeACompleter&&(
                  <input type="checkbox" className="pa-check" checked={selection.has(s.id)} onChange={()=>toggleSelection(s.id)}
                    aria-label={fr?"Sélectionner cette vente":"Select this sale"}/>
                )}
                <label htmlFor={`pa-${s.id}`} className="vc-saisie-lbl">{fr?"Prix d'achat":'Purchase price'}</label>
                {/* autoFocus : sur la vente ouverte (Entrée enchaîne la suivante,
                    son champ est monté avec le focus). */}
                <input id={`pa-${s.id}`} className="vc-saisie-champ" autoFocus={openId===s.id} inputMode="decimal"
                  value={drafts[s.id]??''} placeholder={fr?"0,00":"0.00"}
                  onChange={e=>majDraftPrix(s.id,e.target.value)}
                  onKeyDown={e=>onKeyPrix(e,s)}
                  onBlur={()=>onBlurPrix(s)}/>
                <span style={{fontSize:14,color:ENCRE2}}>€</span>
                <button type="button" className="vc-valider" onMouseDown={e=>e.preventDefault()} onClick={()=>validerSaisie(s,{enchainer:modeACompleter})}
                  aria-label={fr?"Valider le prix d'achat":'Confirm the purchase price'}>
                  <Icone nom="coche" taille={15} couleur="#FFFFFF" epaisseur={3}/>
                </button>
              </div>
            )}
            {champOuvert&&openId===s.id&&(
              <div className="pa-hint" style={{margin:'6px 4px 0'}} onClick={e=>e.stopPropagation()}>{fr?"Entrée = suivante · Échap = annuler":"Enter = next · Esc = cancel"}</div>
            )}
            {erreur?.id===s.id&&<div className="pa-err" style={{margin:'6px 4px 0'}}>{erreur.message}</div>}
            {inconnuPatch&&(
              <div className="pa-note">{fr?"Prix d'achat inconnu — hors calcul de marge":"Purchase price unknown — excluded from margins"}</div>
            )}
          </div>
        </SwipeRow>
      </div>
    );
  };

  const CARTES_CSS=`
.ventes-v2 .vc-carte{flex:1;min-width:0;padding:12px;display:flex;flex-direction:column;gap:10px;cursor:pointer;background:#fff;border-radius:20px;}
.ventes-v2 .vc-ligne{display:flex;align-items:center;gap:12px;min-width:0;}
.ventes-v2 .vc-photo{width:56px;height:56px;border-radius:14px;overflow:hidden;flex-shrink:0;background:#F6F5F1;}
.ventes-v2 .vc-photo img{width:100%;height:100%;object-fit:cover;display:block;}
.ventes-v2 .vc-photo .gph-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;}
.ventes-v2 .vc-photo .cat-tile{width:100%;height:100%;border-radius:14px;}
.ventes-v2 .vc-titre{font-size:15.5px;font-weight:700;color:${UI.ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
.ventes-v2 .vc-sous{display:flex;align-items:center;gap:6px;margin-top:3px;font-size:13px;color:${ENCRE2};min-width:0;white-space:nowrap;overflow:hidden;}
.ventes-v2 .vc-autre{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:10px;background:#ECE9E2;color:#2B3533;font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;}
.ventes-v2 .vc-montant{font-size:16px;font-weight:700;color:${UI.ink};font-variant-numeric:tabular-nums;white-space:nowrap;}
.ventes-v2 .vc-montant.pos{color:${UI.tealDeep};}
.ventes-v2 .vc-montant.neg{color:#B0645A;}
.ventes-v2 .vc-pct{display:inline-flex;align-items:center;height:22px;padding:0 8px;margin-top:3px;border-radius:11px;background:#E6F1EE;color:${UI.tealDeep};font-size:11.5px;font-weight:600;white-space:nowrap;}
.ventes-v2 .vc-zero{margin-top:3px;font-size:11.5px;color:${PECHE_ENCRE};white-space:nowrap;}
.ventes-v2 .vc-ajout{margin-top:3px;height:24px;padding:0 9px;border:1.5px dashed #BFD9D2;border-radius:12px;background:#fff;color:${UI.tealDeep};font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;}
.ventes-v2 .vc-saisie{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;border-radius:14px;border:1.5px dashed #CFE0DB;background:#F5FAF8;cursor:default;}
.ventes-v2 .vc-saisie-lbl{font-size:13px;color:${UI.tealDeep};font-weight:600;white-space:nowrap;}
.ventes-v2 .vc-saisie-champ{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:16px;font-weight:600;text-align:right;color:${UI.ink};}
.ventes-v2 .vc-saisie-champ::placeholder{color:#B9BFBC;font-weight:500;}
.ventes-v2 .vc-valider{width:34px;height:34px;border:0;border-radius:17px;background:${UI.tealDeep};display:flex;align-items:center;justify-content:center;flex:none;cursor:pointer;}
.ventes-v2 .vc-filtres{display:flex;gap:8px;overflow-x:auto;padding:0 0 2px;scrollbar-width:none;margin:0 -2px;}
.ventes-v2 .vc-filtres::-webkit-scrollbar{display:none;}
`;

  return (
    <div className="ventes-v2 fsx-ecran" style={{display:"flex",flexDirection:"column",gap:12}}>
      <style>{VENTES_CSS}</style>
      <style>{CARTES_CSS}</style>
      <style>{CSS_ECRANS}</style>

      {messagerieBeta&&<SectionAExpedier supabase={supabase} lang={lang} photosParInventaire={photosParInventaire}/>}

      {sales.length>0&&(
        <h1 className="fsx-rise" style={{margin:'2px 0 0',fontSize:34,lineHeight:1.08,fontWeight:700,letterSpacing:'-0.025em',color:UI.ink}}>{fr?'Ventes':'Sales'}</h1>
      )}

      {/* ── Les trois chiffres du mois (16/10) ── */}
      {sales.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8}}>
          <div className="fsx-rise" style={{animationDelay:'.05s',background:'#fff',border:`1px solid ${UI.border}`,borderRadius:20,padding:14,display:'flex',flexDirection:'column',gap:6,minWidth:0}}>
            <span style={{fontSize:10.5,fontWeight:700,letterSpacing:'.11em',color:'#6F7774'}}>{fr?'CE MOIS':'THIS MONTH'}</span>
            <Compteur texte={fmt(encaisseMois)} delai={0.1} style={{fontSize:20,fontWeight:700,letterSpacing:'-0.02em',color:UI.ink}}/>
            <span style={{fontSize:11.5,color:ENCRE2}}>{fr?'encaissés':'collected'}</span>
          </div>
          <div className="fsx-rise" style={{animationDelay:'.1s',background:'#fff',border:`1px solid ${UI.border}`,borderRadius:20,padding:14,display:'flex',flexDirection:'column',gap:6,minWidth:0}}>
            <span style={{fontSize:10.5,fontWeight:700,letterSpacing:'.11em',color:'#6F7774'}}>{fr?'VENTES':'SALES'}</span>
            <Compteur texte={String(monthSales.length)} delai={0.15} style={{fontSize:20,fontWeight:700,color:UI.ink}}/>
            <span style={{fontSize:11.5,color:ENCRE2}}>{fr?'ce mois':'this month'}</span>
          </div>
          <div className="fsx-rise" style={{animationDelay:'.15s',background:'#fff',border:`1px solid ${UI.border}`,borderRadius:20,padding:14,display:'flex',flexDirection:'column',gap:6,minWidth:0}}>
            <span style={{fontSize:10.5,fontWeight:700,letterSpacing:'.11em',color:'#6F7774'}}>{fr?'MARGE':'MARGIN'}</span>
            {margeMois.pct==null
              ?<span style={{fontSize:20,fontWeight:700,color:DISCRET,lineHeight:'1.12em'}}>—</span>
              :<Compteur texte={libellePct(margeMois.pct,1)} delai={0.2} style={{fontSize:20,fontWeight:700,color:UI.ink}}/>}
            <span style={{fontSize:11.5,lineHeight:1.3,color:margeMois.pct==null&&monthSales.length>0?PECHE_ENCRE:ENCRE2}}>
              {margeMois.pct!=null
                ?(margeMois.retenues<monthSales.length?(fr?`sur ${margeMois.retenues} vente${margeMois.retenues>1?'s':''}`:`on ${margeMois.retenues} sale${margeMois.retenues>1?'s':''}`):(fr?'ce mois':'this month'))
                :monthSales.length>0?(fr?"prix d'achat manquants":'purchase prices missing'):(fr?'aucune vente':'no sale')}
            </span>
          </div>
        </div>
      )}

      {/* ── Prix d'achat : la carte de progression (16/10) ──
          ON N'OBLIGE JAMAIS : pas de modale, pas de blocage, pas de rouge. La
          carte ouvre la saisie en série ; elle reste affichée tant que le mode
          est ouvert, sinon on ne pourrait plus en sortir. */}
      {sales.length>0&&(nbACompleter>0||modeACompleter)&&(
        <div className="fsx-rise" style={{animationDelay:'.2s',position:'relative',overflow:'hidden',borderRadius:24,background:'radial-gradient(120% 100% at 100% 0%,#24796B 0%,#123F38 62%,#0E302B 100%)',color:'#fff',padding:18,display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:17,fontWeight:700,letterSpacing:'-0.01em'}}>{fr?"Complète tes prix d'achat":'Add your purchase prices'}</div>
              <div style={{fontSize:13,color:'#B9DDD4',marginTop:3,lineHeight:1.4}}>
                {modeACompleter
                  ?(nbACompleter===0?(fr?'Tout est complété.':'All done.'):(fr?`Encore ${nbACompleter} à compléter · Entrée enchaîne la suivante`:`${nbACompleter} left · Enter jumps to the next one`))
                  :(fr?'Pour voir ton vrai bénéfice sur chaque vente.':'To see your real profit on every sale.')}
              </div>
            </div>
            <div style={{textAlign:'right',flex:'none'}}>
              <div style={{fontSize:22,fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{nbVentesCompletes}<span style={{color:'#8DBFB3',fontSize:15}}> / {nbVentesTotal}</span></div>
              <div style={{fontSize:11.5,color:'#8DBFB3'}}>{fr?'ventes complètes':'complete sales'}</div>
            </div>
          </div>
          <div style={{height:8,borderRadius:4,background:'rgba(255,255,255,.14)',overflow:'hidden'}} aria-hidden="true">
            <i className="fsx-gx" style={{animationDelay:'.4s',display:'block',width:`${nbVentesTotal?Math.max(2,(100*nbVentesCompletes)/nbVentesTotal):0}%`,height:'100%',borderRadius:4,background:`linear-gradient(90deg,#8CE0D4,${UI.teal})`}}/>
          </div>
          {modeACompleter?(
            <button type="button" onClick={quitterModeACompleter}
              style={{height:46,border:'1px solid rgba(255,255,255,.35)',borderRadius:23,background:'transparent',color:'#fff',fontFamily:'inherit',fontSize:15,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:8,cursor:'pointer'}}>
              <Icone nom="retour" taille={17} couleur="#FFFFFF" epaisseur={2.2}/>{fr?'Revenir à toutes les ventes':'Back to all sales'}
            </button>
          ):(
            <button type="button" onClick={()=>entrerModeACompleter(true)}
              style={{position:'relative',overflow:'hidden',height:46,border:0,borderRadius:23,background:'#fff',color:'#123F38',fontFamily:'inherit',fontSize:15,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:8,cursor:'pointer'}}>
              {fr?'Compléter en série':'Complete in a row'}<Icone nom="fleche" taille={17} couleur="#123F38" epaisseur={2.2}/>
              <span className="fsx-shine" aria-hidden="true"/>
            </button>
          )}
        </div>
      )}

      {/* ── Ventes Vinted importées à enregistrer — compteur-invitation ──
          Même contrat que la carte au-dessus : ON N'OBLIGE JAMAIS. Ces lignes ne
          sont pas des erreurs — Vinted ne communique simplement ni la date ni le
          prix payé, seul l'utilisateur les connaît. (16/10 : icône SVG.) */}
      {(nbImportes>0||modeImportes)&&(
        <button className={`pa-call${modeImportes?" on":""}`}
          onClick={()=>{setModeImportes(v=>!v);setModeACompleter(false);setImpSel(new Set());setImpErr(null);setFilterType("Tous");}}>
          <Icone nom={modeImportes?'retour':'recu'} taille={18} couleur={modeImportes?'#FFFFFF':UI.tealDeep}/>
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
                    ?(fr?"Tout est enregistré.":"All recorded.")
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
          {/* ── DEUX gestes, pas un (2026-08-11) ──────────────────────────────
              « Je ne sais plus » et « c'était gratuit » sont deux informations
              DIFFÉRENTES. La première laisse prix_achat à NULL et la marge non
              calculable ; la seconde écrit 0 (bénéfice = prix de vente, et, depuis
              le 16/10, AUCUN pourcentage de marge). */}
          <button className="ghost" disabled={busy} onClick={marquerGratuit}>
            {fr?"C'était gratuit (0 €)":"It was free (0)"}
          </button>
          <button className="ghost" disabled={busy||invIdsSelection.length===0} onClick={marquerInconnu}>
            {fr?"Je ne sais plus":"I don't remember"}
          </button>
          <button className="ghost" disabled={busy} onClick={()=>{setSelection(new Set());setPrixLot("");}}>✕</button>
          {progressLot&&(
            <>
              <div className="imp-prog"><i style={{width:`${Math.round(100*progressLot.fait/Math.max(1,progressLot.total))}%`}}/></div>
              <span className="pa-hint" style={{flexBasis:"100%"}}>
                {fr?`${progressLot.fait} / ${progressLot.total} mises à jour…`:`${progressLot.fait} / ${progressLot.total} updated…`}
              </span>
            </>
          )}
          <div style={{flexBasis:"100%",display:"flex",flexDirection:"column",gap:2}}>
            <span className="pa-hint">
              {fr?"Prix d'achat UNITAIRE — le bénéfice se recalcule vente par vente. « Gratuit » écrit 0 € ; « je ne sais plus » laisse le prix vide et la marge non calculable."
                 :"UNIT purchase price — profit is recomputed sale by sale. “Free” writes 0; “I don't remember” leaves the price empty and the margin uncomputable."}
            </span>
            {invIdsSelection.length===0&&(
              <span className="pa-hint">
                {fr?"« Je ne sais plus » indisponible : aucune de ces ventes n'est liée à un article du stock, il n'y a rien à marquer."
                   :"“I don't remember” unavailable: none of these sales is linked to a stock item, nothing to flag."}
              </span>
            )}
            {erreur?.id===null&&<span className="pa-err">{erreur.message}</span>}
          </div>
        </div>
      )}

      {sales.length>0&&!modeImportes&&(
        <div className="fsx-rise" style={{animationDelay:'.25s',display:'flex',alignItems:'center',gap:10,height:50,padding:'0 16px',borderRadius:25,background:'#fff',border:`1px solid ${UI.border}`}}>
          <Icone nom="loupe" taille={18} couleur="#6F7774" epaisseur={2.2}/>
          <input value={searchHistory} onChange={e=>setSearchHistory(e.target.value)}
            aria-label={fr?'Rechercher une vente':'Search a sale'}
            placeholder={fr?"Nom, marque, description…":"Name, brand, description…"}
            style={{flex:1,minWidth:0,border:"none",outline:"none",fontSize:15,background:"transparent",fontFamily:"inherit",color:UI.ink}}/>
          {searchHistory&&<button type="button" aria-label={fr?'Effacer':'Clear'} onClick={()=>setSearchHistory("")} style={{background:"none",border:"none",cursor:"pointer",color:"#A3A9A6",flexShrink:0,padding:0,display:'flex'}}><Icone nom="croix" taille={16} couleur="#A3A9A6"/></button>}
        </div>
      )}

      {/* ── Filtres (16/10) : plateformes RÉELLES (une ligne par plateforme,
          casse ignorée) + « Sans prix d'achat » (le mode « à compléter »). Les
          pastilles de CATÉGORIE ne restent qu'en mode « ventes importées », où
          « tout sélectionner par catégorie » en a besoin. */}
      {sales.length>0&&!modeImportes&&(
        <div className="vc-filtres fsx-rise" style={{animationDelay:'.28s'}} role="toolbar" aria-label={fr?'Filtrer les ventes':'Filter sales'}>
          <button type="button" onClick={()=>choisirPlateforme('toutes')} aria-pressed={filtrePlateforme==='toutes'}
            style={{...pastille,border:filtrePlateforme==='toutes'?'1px solid transparent':`1px solid ${UI.border}`,background:filtrePlateforme==='toutes'?UI.ink:'#fff',color:filtrePlateforme==='toutes'?'#fff':UI.ink}}>
            {fr?'Toutes':'All'}
          </button>
          {plateformes.map(pl=>{
            const on=filtrePlateforme===pl.cle;
            return(
              <button key={pl.cle} type="button" onClick={()=>choisirPlateforme(on?'toutes':pl.cle)} aria-pressed={on}
                style={{...pastille,padding:'0 14px 0 10px',border:on?'1px solid transparent':`1px solid ${UI.border}`,background:on?UI.ink:'#fff',color:on?'#fff':UI.ink}}>
                {CODES_PLATEFORME_VENTE.includes(pl.code)&&<PlatformLogo platform={pl.code} size={18}/>}
                {pl.code==='ailleurs'?(fr?'Ailleurs':'Elsewhere'):pl.libelle}
              </button>
            );
          })}
          {(nbACompleter>0||modeACompleter)&&(
            <button type="button" onClick={()=>modeACompleter?quitterModeACompleter():entrerModeACompleter(false)} aria-pressed={modeACompleter}
              style={{...pastille,border:modeACompleter?'1px solid transparent':`1px solid ${UI.border}`,background:modeACompleter?UI.ink:'#fff',color:modeACompleter?'#fff':UI.ink}}>
              {fr?"Sans prix d'achat":'No purchase price'}
            </button>
          )}
        </div>
      )}

      {/* ── Filtres catégorie — mode « ventes importées » seulement ── */}
      {modeImportes&&vendusRestants.length>0&&(()=>{
        const presentTypes=["Tous","Mode","High-Tech","Maison","Électroménager","Jouets","Livres","Sport","Auto-Moto","Beauté","Musique","Collection","Multimédia","Jardin","Bricolage","Autre"].filter(tp=>tp==="Tous"||vendusRestants.some(s=>s.type===tp));
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
              {/* Les deux réponses distinctes, ici aussi (11/08) : « je ne sais
                  plus » laisse le prix vide, « gratuit » écrit 0 €. Elles ne
                  touchent que les lignes restées vides. */}
              <button className="imp-ghost" disabled={nbSansAchat===0}
                style={nbSansAchat===0?{opacity:0.45}:undefined}
                onClick={()=>marquerLotInconnu('pa','paInconnu')}>
                {fr?`achat : je ne sais plus${nbSansAchat?` (${nbSansAchat})`:""}`:`buy: I don't remember${nbSansAchat?` (${nbSansAchat})`:""}`}
              </button>
              <button className="imp-ghost" disabled={nbSansAchat===0}
                style={nbSansAchat===0?{opacity:0.45}:undefined}
                onClick={()=>remplirLotAchatGratuit()}>
                {fr?`achat : gratuit${nbSansAchat?` (${nbSansAchat})`:""}`:`buy: free${nbSansAchat?` (${nbSansAchat})`:""}`}
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
            <div className="imp-info" style={{textAlign:'center'}}>{fr?"Tout est enregistré.":"All recorded."}</div>
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
                {/* Vignette photo (27/08) : `item` est une ligne inventaire
                    (mapItem), ses photos sont déjà là. Repli = tuile d'icône. */}
                <div className="vphoto">
                  <GalleryPhoto url={premierePhoto(item.photos)} alt={item.title}
                    fallback={<div className={`cat-tile ${catClass(item.type)}`}><IconeCategorie type={item.type}/></div>}/>
                </div>
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
        // n'a réellement aucune vente. Le padding bas laisse passer le FAB micro.
        <div style={{paddingBottom:'var(--nav-content-clearance)'}}>
          <VentesVide lang={lang} setTab={setTab} isPremium={isPremium}
            onOffres={()=>openUpgradeModal(null,'banniere_ventes')} offresChargement={iapLoading}
            extensionAbsente={extensionAbsente} onExtensionInfo={onExtensionInfo}/>
        </div>
      ):(
        <>
          {/* ── Vue B : sélection globale (2026-08-11) ────────────────────────
              Porte sur `lignesACompleter` — toutes les lignes du filtre courant,
              pas les 50 rendues. */}
          {modeACompleter&&nbACompleterFiltre>0&&(
            <div className="imp-all">
              <input type="checkbox" className="pa-check"
                checked={tousVentesSel}
                ref={el=>{if(el)el.indeterminate=ventesSelPartielle;}}
                onChange={basculerToutSelectionnerVentes}
                aria-label={fr?"Tout sélectionner":"Select all"}/>
              <span className="txt">
                {nbSel>0
                  ?(fr?`${nbSel} sélectionnée${nbSel>1?"s":""} sur ${nbACompleterFiltre}`
                      :`${nbSel} of ${nbACompleterFiltre} selected`)
                  :(fr?`${nbACompleterFiltre} vente${nbACompleterFiltre>1?"s":""} à compléter`
                      :`${nbACompleterFiltre} sale${nbACompleterFiltre>1?"s":""} to complete`)}
                {(filtrePlateforme!=='toutes'||searchHistory.trim())&&(
                  <span className="sub">
                    {fr?`vue filtrée — la sélection ne sort pas de ce qui est listé ici`
                       :`filtered view — selection stays within what is listed here`}
                  </span>
                )}
              </span>
              <button onClick={basculerToutSelectionnerVentes}>
                {tousVentesSel
                  ?(fr?"Tout désélectionner":"Deselect all")
                  :(fr?`Tout sélectionner (${nbACompleterFiltre})`:`Select all (${nbACompleterFiltre})`)}
              </button>
            </div>
          )}

          {filteredSales.length===0&&(
            <div style={{fontSize:13.5,color:ENCRE2,textAlign:'center',padding:'14px 8px'}}>
              {modeACompleter&&nbACompleter===0
                ?(fr?"Toutes tes ventes ont un prix d'achat.":'All your sales have a purchase price.')
                :(fr?'Aucune vente ne correspond à ce filtre.':'No sale matches this filter.')}
            </div>
          )}

          {/* La liste, groupée par mois de vente (date décroissante), avec le
              total de chaque mois (sur toutes ses ventes, pas sur la fenêtre). */}
          {groupesMois.map(g=>{
            const tot=totauxMois[g.cle]??{nb:0,ca:0};
            return(
              <div key={g.cle} style={{display:'flex',flexDirection:'column',gap:10}}>
                <div className="fsx-rise" style={{animationDelay:'.3s',display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:8,padding:'8px 4px 0'}}>
                  <span style={{fontSize:15,fontWeight:700,color:UI.ink}}>{nomMois(g)}</span>
                  <span style={{fontSize:13,color:ENCRE2,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>
                    {fr?`${tot.nb} vente${tot.nb>1?'s':''}`:`${tot.nb} sale${tot.nb>1?'s':''}`} · {fmt(tot.ca)}
                  </span>
                </div>
                {g.lignes.map(carteVente)}
              </div>
            );
          })}

          {/* Mode « à compléter » : fenêtre de rendu ; la sélection, elle, ne s'y
              limite pas — on le dit. */}
          {modeACompleter&&filteredSales.length>ventesVisibles.length&&(
            <button className="imp-more" onClick={()=>setVenteRenduMax(n=>n+RENDU_PAS)}>
              {fr?`Afficher plus (${ventesVisibles.length} sur ${filteredSales.length})`
                 :`Show more (${ventesVisibles.length} of ${filteredSales.length})`}
              <span style={{display:'block',fontSize:10.5,fontWeight:600,marginTop:2,opacity:.8}}>
                {fr?`la sélection porte sur les ${nbACompleterFiltre}, pas seulement sur ce qui est affiché`
                   :`selection covers all ${nbACompleterFiltre}, not just what's shown`}
              </span>
            </button>
          )}
          {!modeACompleter&&!showAllSales&&filteredSales.length>LIMITE_LISTE&&(
            <button type="button" onClick={()=>setShowAllSales(true)}
              style={{width:"100%",height:44,marginTop:4,background:"#fff",border:"1.5px solid #CFE0DB",borderRadius:22,color:UI.tealDeep,fontSize:14.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
              {fr?`Voir plus (${filteredSales.length-LIMITE_LISTE} autres)`:`Show more (${filteredSales.length-LIMITE_LISTE} more)`}
            </button>
          )}
          {!isPremium&&(
            <div style={{marginTop:8}}>
              <EncartPremium lang={lang} onOffres={()=>openUpgradeModal(null,'banniere_ventes')} desactive={iapLoading}/>
            </div>
          )}
        </>
      )}

      {/* ── Bouton statistiques (liste des ventes uniquement) ──
          ⚠️ Ne PAS le rendre sur l'état vide : celui-ci a son propre bouton
          « Voir mes statistiques » (VentesVide). */}
      {sales.length>0&&isPremium&&(
        <button type="button" onClick={()=>{setTab(4);localStorage.setItem('tab',4);}}
          style={{width:"100%",marginTop:4,height:50,background:`linear-gradient(135deg,${UI.teal},${UI.tealDeep})`,color:"#fff",border:"none",borderRadius:25,fontSize:15.5,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:9,fontFamily:"inherit",boxShadow:"0 10px 22px -12px rgba(27,110,98,.7)"}}>
          <Icone nom="barres" taille={18} couleur="#FFFFFF"/>{fr?'Voir mes statistiques':'See my statistics'}
        </button>
      )}

      {/* ── Vue B : confirmation au-dessus du seuil ─────────────────────────
          Le libellé nomme le geste EXACT, parce que les trois n'écrivent pas la
          même chose : un prix, un 0 assumé, ou rien du tout. */}
      {confirmLot!=null&&(()=>{
        const n=confirmLot.n,mode=confirmLot.mode;
        const pa=mode==='prix'?parsePrix(prixLot):null;
        const titre=mode==='inconnu'
          ?(fr?`Marquer ${n} ventes « je ne sais plus » ?`:`Flag ${n} sales as “I don't remember”?`)
          :mode==='gratuit'
            ?(fr?`Déclarer ${n} ventes gratuites (0 €) ?`:`Declare ${n} sales free (0)?`)
            :(fr?`Appliquer ${fmt(pa??0)} à ${n} ventes ?`:`Apply ${fmt(pa??0)} to ${n} sales?`);
        const corps=mode==='inconnu'
          ?(fr?<>Leur prix d'achat restera <b>vide</b> — ni 0 €, ni deviné. Ces ventes compteront dans ton chiffre d'affaires et dans le nombre de ventes, mais <b>pas</b> dans le bénéfice ni la marge moyenne. Tu pourras renseigner le prix plus tard, elles rentreront alors dans les calculs.</>
              :<>Their purchase price stays <b>empty</b> — not 0, not guessed. These sales will count in revenue and in the sale count, but <b>not</b> in profit or average margin. You can fill the price in later and they will join the calculations.</>)
          :mode==='gratuit'
            ?(fr?<>Prix d'achat écrit à <b>0 €</b> : ces ventes seront comptées à <b>100 % de marge</b>. À ne faire que si elles étaient réellement gratuites (don, lot offert) — sinon utilise « je ne sais plus ».</>
                :<>Purchase price written as <b>0</b>: these sales will count at <b>100 % margin</b>. Only do this if they really were free (gift, donated lot) — otherwise use “I don't remember”.</>)
            :(fr?<>Ce prix est <b>unitaire</b> ; le bénéfice se recalcule vente par vente. Les lignes où tu as déjà saisi un prix ne sont pas touchées.</>
                :<>This price is <b>per unit</b>; profit is recomputed sale by sale. Lines where you already typed a price are untouched.</>);
        return(
          <div className="imp-modal" onClick={()=>setConfirmLot(null)}>
            <div className="box" onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:16,fontWeight:700,color:"var(--ink)",marginBottom:8}}>{titre}</div>
              <div style={{fontSize:12.5,lineHeight:1.55,color:"var(--mute)",marginBottom:16}}>
                {corps}
                {filterType!=="Tous"&&(fr?<><br/>Filtre actif : <b>{typeLabel(filterType,lang)}</b>.</>:<><br/>Active filter: <b>{typeLabel(filterType,lang)}</b>.</>)}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="ghost" style={{flex:1,padding:"11px 0"}} onClick={()=>setConfirmLot(null)}>
                  {fr?"Annuler":"Cancel"}
                </button>
                <button className="apply" style={{flex:2,padding:"11px 0"}} onClick={()=>executerLot(mode)}>
                  {fr?`Confirmer les ${n}`:`Confirm the ${n}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
