import { memo, useState, useEffect, useMemo } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { formatCurrency, typeLabel, marqueLabel } from '../utils/shared';
import { prixAchatConnu, prixAchatNum, comptabilisables } from '../utils/comptabilite';
import { UI } from '../components/ui';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import {
  ventesParPlateforme, margeMoyenne, margePctVente, prixAchatZero, totalEncaisse, libelleJours, cheminMonotone, CODES_PLATEFORME_VENTE, CLE_SANS_PLATEFORME,
  COULEUR_PLATEFORME, LIBELLE_PLATEFORME_VENTE,
} from '../utils/ventesStats';
import { CSS_ECRANS } from '../ecrans/animations';
import { Compteur, Anneau } from '../ecrans/primitives';
import Icone from '../ecrans/Icone';
import { Carte, Libelle, Segments, BoiteIcone } from '../ecrans/pleins/communs';
import { ENCRE2, DISCRET, PECHE_ENCRE, libellePct } from '../ecrans/pleins/jetons';
import { useStockEnLigne } from '../ecrans/useStockEnLigne';
import StatsVide from '../ecrans/vides/StatsVide';
import { useBureau } from '../hooks/useBureau';
import { creerContexte, delaiVente, periode, ventesDe, PERIODES_BUREAU } from '../utils/tableauStats';
import StatsBureau from '../ecrans/bureau/StatsBureau';

// (28/10) Les périodes de l'écran mobile, traduites dans celles de utils/tableauStats :
// « 1M » = les 30 derniers jours (nommés ainsi), 3M/6M/1A = mois glissants, Tout = tout.
const CLE_PERIODE_STATS={'1M':'30j','3M':'3m','6M':'6m','1A':'12m','1Y':'12m','Tout':'tout','All':'tout'};
const CLE_BUREAU='fs_stats_periode';
const lirePeriodeBureau=()=>{try{const v=localStorage.getItem(CLE_BUREAU);return PERIODES_BUREAU.includes(v)?v:'12m';}catch{return '12m';}};

// ═══════════════════════════════════════════════════════════════════════════
// STATS — refonte du 16/10 (maquette « fillsell-ecrans-pleins.html » validée
// par Nico). Ce qui change à l'écran : grand bloc « PROFIT · période » avec la
// courbe CUMULÉE, marge moyenne en anneau (« calculée sur X ventes sur Y »),
// analyse IA, donut des catégories aux couleurs de l'app, ventes par plateforme
// (une ligne par plateforme RÉELLE + « Sans plateforme »), temps pour vendre
// (« < 1 j »), stock en ligne, meilleures ventes, « Ça dort en stock ».
// Ce qui change dans les CHIFFRES (règles de utils/ventesStats.js, pour tous) :
//   · une marge en % ne compte que si le prix d'achat est > 0 (règle b) — y
//     compris dans ce qui part vers l'IA (« meilleure marge : eBay 100 % ») ;
//   · « Vinted » et « vinted » sont une seule plateforme (règle a) ;
//   · la somme des plateformes = le revenu de la période (règle c).
// L'analyse IA (caches mémoire + base, appel stats-analysis) est INCHANGÉE.
// L'entrée animée se rejoue à chaque ouverture de l'onglet (il reste monté).

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

// Donut des catégories : les teintes de l'APP (UI : teal profond, ambre, teal,
// menthe, brique, gris), « Autre » toujours en gris neutre.
const CAT_PALETTE=['#1B6E62','#E8956D','#2F9E90','#8FCFC4','#C46A3E','#5C6560'];
const CAT_AUTRE='#C9C3B8';
const MAX_CATEGORIES=5;

const PERIODE_LIBELLE={
  '1M':['30 DERNIERS JOURS','LAST 30 DAYS'],'3M':['3 DERNIERS MOIS','LAST 3 MONTHS'],'6M':['6 DERNIERS MOIS','LAST 6 MONTHS'],
  '1A':['12 DERNIERS MOIS','LAST 12 MONTHS'],'1Y':['12 DERNIERS MOIS','LAST 12 MONTHS'],'Tout':['DEPUIS LE DÉBUT','ALL-TIME'],'All':['DEPUIS LE DÉBUT','ALL-TIME'],
};
const MOIS_COURTS_FR=['Janv.','Févr.','Mars','Avr.','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'];
const MOIS_COURTS_EN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// La courbe CUMULÉE du profit (bloc du haut) — interpolation monotone : une
// somme cumulée ne redescend que si une vente est à perte, et la courbe ne
// dépasse jamais ses points (utils/ventesStats.cheminMonotone).
function CourbeCumulee({points,lang,etiquettes}){
  const W=330,H0=115,H1=15;
  const n=points.length;
  if(n<2) return null;
  const vals=points.map(p=>p.cumul);
  const max=Math.max(...vals,0),min=Math.min(...vals,0);
  const etendue=(max-min)||1;
  const pts=points.map((p,i)=>({x:4+(i*(W-10))/(n-1),y:H0-((p.cumul-min)/etendue)*(H0-H1)}));
  const d=cheminMonotone(pts);
  const dernier=pts[n-1];
  const zero=H0-((0-min)/etendue)*(H0-H1);
  // L'étiquette du plus grand saut, s'il pèse (≥ 30 % du profit de la période).
  let saut=null;
  for(let i=1;i<n;i++){const g=vals[i]-vals[i-1];if(g>0&&(!saut||g>saut.g))saut={g,i};}
  const tag=saut&&max>0&&saut.g>=0.3*max?{x:pts[saut.i].x,y:pts[saut.i].y,txt:points[saut.i].mois}:null;
  return(
    <svg width="100%" viewBox={`0 0 ${W} 132`} style={{display:'block',marginTop:14,overflow:'visible'}} role="img"
      aria-label={lang==='en'?'Cumulative profit over the period':'Profit cumulé sur la période'}>
      <defs><linearGradient id="fsx-cumul" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8CE0D4" stopOpacity=".35"/><stop offset="1" stopColor="#8CE0D4" stopOpacity="0"/></linearGradient></defs>
      <g stroke="rgba(255,255,255,.1)"><line x1="0" y1={H1} x2={W} y2={H1}/><line x1="0" y1={(H0+H1)/2} x2={W} y2={(H0+H1)/2}/></g>
      <line x1="0" y1={zero} x2={W} y2={zero} stroke="rgba(255,255,255,.25)"/>
      <path className="fsx-fade" style={{animationDelay:'1s'}} d={`${d} L${dernier.x.toFixed(1)},${zero.toFixed(1)} L${pts[0].x.toFixed(1)},${zero.toFixed(1)} Z`} fill="url(#fsx-cumul)"/>
      <path className="fsx-draw" style={{animationDelay:'.3s'}} pathLength="1" d={d} fill="none" stroke="#9BE3D3" strokeWidth="3" strokeLinecap="round"/>
      {/* Seul le point « live » boucle (règle de Nico). */}
      <circle className="fsx-ping" style={{animationDelay:'1.9s'}} cx={dernier.x} cy={dernier.y} r="5" fill="#9BE3D3"/>
      <circle className="fsx-popin" style={{animationDelay:'1.7s'}} cx={dernier.x} cy={dernier.y} r="5" fill="#fff"/>
      {tag&&(
        <g className="fsx-fade" style={{animationDelay:'1.3s'}}>
          <rect x={Math.min(W-62,Math.max(0,tag.x-56))} y={Math.max(0,tag.y-4)} width="52" height="22" rx="11" fill="rgba(255,255,255,.16)"/>
          <text x={Math.min(W-62,Math.max(0,tag.x-56))+26} y={Math.max(0,tag.y-4)+15} fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle" fontFamily="'Space Grotesk', sans-serif">{tag.txt}</text>
        </g>
      )}
      <g fontSize="11" fill="#9CC8BE" fontFamily="'Space Grotesk', sans-serif" textAnchor="middle">
        {etiquettes.map((e,i)=><text key={i} x={4+(e.i*(W-10))/(n-1)} y="131">{e.txt}</text>)}
      </g>
    </svg>
  );
}

// Donut des catégories : un anneau par catégorie, qui se dessine à l'entrée.
function Donut({segments,total}){
  // Départ de chaque anneau = somme des précédents (calculée d'avance : aucune
  // variable réassignée pendant le rendu).
  const departs=segments.map((_,i)=>segments.slice(0,i).reduce((a,s)=>a+s.pct,0));
  return(
    <svg width="132" height="132" viewBox="0 0 132 132" style={{flex:'none'}} role="img"
      aria-label={segments.map(s=>`${s.label} ${Math.round(s.pct)} %`).join(', ')}>
      <circle cx="66" cy="66" r="52" fill="none" stroke="#F1EFEB" strokeWidth="16"/>
      <g transform="rotate(-90 66 66)" fill="none" strokeWidth="16">
        {segments.map((s,i)=>{
          const longueur=Math.max(0,s.pct-(segments.length>1?0.8:0));
          return <circle key={s.label} className="fsx-ring" style={{animationDelay:`${(0.5+i*0.15).toFixed(2)}s`}} cx="66" cy="66" r="52" pathLength="100" stroke={s.color} strokeDasharray={`${longueur} 100`} strokeDashoffset={-departs[i]}/>;
        })}
      </g>
      <text x="66" y="61" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#6F7774" letterSpacing="1" fontFamily="'Space Grotesk', sans-serif">TOTAL</text>
      <text x="66" y="80" textAnchor="middle" fontSize={total.length>9?12:15} fontWeight="700" fill={UI.ink} fontFamily="'Space Grotesk', sans-serif">{total}</text>
    </svg>
  );
}

function Barre({largeur,couleur,delai,hauteur=10}){
  return(
    <div style={{flex:1,height:hauteur,borderRadius:hauteur/2,background:'#F1EFEB',overflow:'hidden',minWidth:0}}>
      <i className="fsx-gx" style={{display:'block',height:'100%',width:`${Math.max(0,Math.min(100,largeur))}%`,borderRadius:hauteur/2,background:couleur,animationDelay:`${delai}s`}}/>
    </div>
  );
}

const StatsTab = memo(function StatsTab({sales,items,lang,currency='EUR',user,aiCache={},setAiCache=()=>{},setTab=()=>{},isActive=true,isNative=false}){
  const RANGES=lang==='en'?['1M','3M','6M','1Y','All']:['1M','3M','6M','1A','Tout'];
  const fr=lang!=='en';
  const [range,setRange]=useState('6M');
  // (28/10) Sur ordinateur (web, ≥ 1 024 px) : la page Statistiques desktop (ecrans/bureau),
  // ses quatre périodes nommées et sa propre mémoire de période. Sous ce seuil : l'écran d'avant.
  const bureau=useBureau(isNative);
  const [rangeBureau,setRangeBureauEtat]=useState(lirePeriodeBureau);
  const setRangeBureau=(v)=>{setRangeBureauEtat(v);try{localStorage.setItem(CLE_BUREAU,v);}catch{/* préférence locale */}};
  const rangeActif=bureau?rangeBureau:range;
  const cleStats=CLE_PERIODE_STATS[rangeActif]??rangeActif;
  const [aiText,setAiText]=useState('');
  const [aiLoading,setAiLoading]=useState(false);
  const [outdated,setOutdated]=useState(false);
  const [refreshKey,setRefreshKey]=useState(0);
  // L'onglet reste MONTÉ (App.jsx) : l'entrée animée se rejoue à chaque
  // ouverture (clé du contenu), sans effet — motif « ajuster un état quand une
  // prop change », pendant le rendu.
  const [actifAvant,setActifAvant]=useState(isActive);
  const [entree,setEntree]=useState(isActive?1:0);
  if(isActive!==actifAvant){setActifAvant(isActive);if(isActive)setEntree(e=>e+1);}

  const now=new Date();
  // (28/10) Les bornes viennent de utils/tableauStats (jours de Paris) : les mêmes ventes
  // que le Tableau et l'en-tête pour une même période nommée.
  const periodeActive=useMemo(()=>periode(cleStats),[cleStats]);
  const cutoff=useMemo(()=>periodeActive.debut?new Date(`${periodeActive.debut}T00:00:00`):new Date(2000,0,1),[periodeActive]);

  // « Tout » n'est PAS une période : c'est le total global, et une vente SANS
  // date en fait partie. Le `||0` la faisait tomber en 1970 (new Date(0)),
  // c'est-à-dire AVANT le plancher de « Tout » (setFullYear(2000)) — elle
  // disparaissait même du total censé tout contenir. Les vraies fenêtres
  // (1M/3M/6M/1A) continuent de l'exclure : sans date, pas de période.
  const rangeTout=cleStats==='tout';
  const filtered=useMemo(()=>ventesDe(sales,periodeActive),[sales,periodeActive]);

  // Les ventes dont le prix d'achat est inconnu n'entrent dans AUCUN calcul de
  // bénéfice ni de moyenne — elles restent dans `filtered` pour le CA et les
  // compteurs de ventes, qui eux ne dépendent pas du prix d'achat.
  const ventesComptables=useMemo(()=>comptabilisables(filtered),[filtered]);
  const totalProfit=ventesComptables.reduce((a,s)=>a+(s.margin||0),0);
  const totalRev=totalEncaisse(filtered);
  // (16/10, règle b) Seulement sur les ventes au prix d'achat > 0 : un « gratuit » à
  // 100 % ne gonfle plus rien. (28/10) PONDÉRÉE (Σ bénéfices ÷ Σ prix de vente), comme
  // le Tableau et l'en-tête : une seule règle de marge partout (utils/tableauStats).
  const margeStats=useMemo(()=>margeMoyenne(filtered,{mode:'ponderee'}),[filtered]);
  const avgMargin=margeStats.pct==null?0:Math.round(margeStats.pct*10)/10;

  const titleToType=useMemo(()=>{
    const m={};
    items.forEach(i=>{if(i.title)m[i.title.toLowerCase().trim()]=i.type;});
    return m;
  },[items]);

  // PIÈGE : le profit par catégorie parcourait `filtered`, donc une vente sans
  // prix d'achat ajoutait 0 € à sa catégorie — la catégorie paraissait moins
  // rentable qu'elle ne l'est, et le donut/`bestCategoryPct` en héritaient.
  const catMap={};
  ventesComptables.forEach(s=>{
    const raw=s.type||s.categorie||titleToType[s.title?.toLowerCase()?.trim()]||'';
    const c=normalizeCat(raw);
    catMap[c]=(catMap[c]||0)+(s.margin||0);
  });
  const catEntries=Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  const bestCategory=catEntries[0]?.[0]||null;
  const bestCatProfit=catEntries[0]?.[1]||0;
  const bestCategoryPct=totalProfit>0?Math.round((bestCatProfit/totalProfit)*100):0;
  const bestItem=[...ventesComptables].sort((a,b)=>(b.margin||0)-(a.margin||0))[0];
  const bestItemName=bestItem?.title||null;
  const bestItemProfit=bestItem?.margin||0;

  // Donut : les catégories positives, les plus rentables d'abord ; au-delà de
  // cinq, le reste rejoint « Autre ».
  const donutSegs=(()=>{
    const pos=catEntries.filter(([,v])=>v>0);
    const tot=pos.reduce((a,[,v])=>a+v,0)||1;
    const tete=pos.filter(([c])=>c!=='Autre').slice(0,MAX_CATEGORIES-(pos.some(([c])=>c==='Autre')||pos.length>MAX_CATEGORIES?1:0));
    const reste=pos.filter(([c])=>!tete.some(([t])=>t===c)).reduce((a,[,v])=>a+v,0);
    const segs=tete.map(([c,v],i)=>({label:c,pct:(v/tot)*100,color:CAT_PALETTE[i%CAT_PALETTE.length]}));
    if(reste>0) segs.push({label:'Autre',pct:(reste/tot)*100,color:CAT_AUTRE});
    return segs;
  })();

  // La courbe cumulée : un point par tranche (jour, 3 jours ou semaine selon la
  // période), du début de la période à aujourd'hui.
  const cumul=useMemo(()=>{
    const map={};
    let premier=null;
    ventesComptables.forEach(s=>{
      const key=(s.created_at||s.date||'').slice(0,10);
      if(!key)return;
      map[key]=(map[key]||0)+(s.margin||0);
      if(!premier||key<premier)premier=key;
    });
    const debut=rangeTout&&premier?new Date(premier):new Date(cutoff);
    const totalDays=Math.max(1,Math.ceil((new Date()-debut)/86400000));
    const step=totalDays>180?7:totalDays>60?3:1;
    const result=[];let total=0;
    const MOIS=fr?MOIS_COURTS_FR:MOIS_COURTS_EN;
    for(let d=new Date(debut);d<=new Date();d.setDate(d.getDate()+step)){
      for(let k=0;k<step;k++){const dd=new Date(d);dd.setDate(dd.getDate()+k);total+=map[dd.toISOString().slice(0,10)]||0;}
      result.push({cumul:total,mois:MOIS[d.getMonth()],an:d.getFullYear(),moisNum:d.getMonth()});
    }
    return result;
  },[ventesComptables,cutoff,rangeTout,fr]);
  // Étiquettes de l'axe : le premier point de chaque mois (au plus 7, régulières).
  const etiquettesCourbe=(()=>{
    const out=[];
    cumul.forEach((p,i)=>{if(i===0||p.moisNum!==cumul[i-1].moisNum)out.push({i,txt:p.mois});});
    if(out.length<=7)return out;
    const pas=Math.ceil(out.length/7);
    return out.filter((_,k)=>k%pas===0);
  })();

  // Panier moyen = CA / nombre de ventes : deux grandeurs indépendantes du prix
  // d'achat, donc AUCUN filtre ici — filtrer fausserait le panier moyen.
  const avgBasket=filtered.length?totalRev/filtered.length:0;
  // Stock en ligne : lu UNE fois, et seulement quand l'onglet a été ouvert
  // (il est monté dès le démarrage de l'app : sans cette garde, chaque ouverture
  // de l'app paierait la lecture).
  const stockActif=useMemo(()=>items.filter(i=>i.statut==='stock'),[items]);
  const enLigne=useStockEnLigne(entree>0?(user?.id??null):null,stockActif);
  // (28/10) Délai de vente CONSTATÉ, la règle de utils/tableauStats (la même que le
  // Tableau) : de la première mise en ligne à la vente, articles créés dans FillSell
  // seulement — plus de rapprochement par le titre, plus de date d'import prise pour
  // une date de mise en ligne.
  const ctxStats=useMemo(()=>creerContexte({ventes:sales,items,jobsParArticle:enLigne?.jobsParArticle??null,enLigneParArticle:enLigne?.parArticle??null}),[sales,items,enLigne]);
  const delais=useMemo(()=>filtered.map(s=>({s,j:delaiVente(ctxStats,s)})).filter(x=>x.j!=null),[filtered,ctxStats]);
  const avgDays=delais.length?delais.reduce((a,x)=>a+x.j,0)/delais.length:null;
  const delaisParCategorie=useMemo(()=>{
    const acc={};
    delais.forEach(({s,j})=>{const c=normalizeCat(s.type||s.categorie||'');(acc[c] ||= {t:0,n:0});acc[c].t+=j;acc[c].n+=1;});
    return Object.entries(acc).map(([cat,{t,n}])=>({cat,avg:t/n})).sort((a,b)=>b.avg-a.avg).slice(0,6);
  },[delais]);

  // Ce payload part vers l'IA : un chiffre faux ici ne se voit pas, il ressort en
  // conseil. (16/10) La marge par plateforme suit la règle b : seules les ventes
  // au prix d'achat > 0 donnent un % (« Meilleure marge : eBay 100 % » venait
  // de ventes eBay à 0 €). Profit, CA et count : inchangés.
  const platVentesAI=useMemo(()=>{
    const acc={};
    filtered.forEach(s=>{
      const l=ventesParPlateforme([s])[0];
      if(!l||l.cle===CLE_SANS_PLATEFORME)return;
      const p=l.cle;
      if(!acc[p])acc[p]={label:l.libelle,count:0,ca:0,profit:0,mpSum:0,mpCount:0};
      acc[p].count++;acc[p].ca+=(s.sell||0);
      if(prixAchatConnu(s))acc[p].profit+=(s.margin||0);
      const pct=margePctVente(s);
      if(pct!=null){acc[p].mpSum+=pct;acc[p].mpCount++;}
    });
    return Object.values(acc).map(d=>({p:d.label,count:d.count,ca:Math.round(d.ca),profit:Math.round(d.profit),avgMargin:d.mpCount?Math.round(d.mpSum/d.mpCount*10)/10:0})).sort((a,b)=>b.profit-a.profit).slice(0,5);
  },[filtered]);
  const platStockAI=useMemo(()=>{
    const acc={};
    // Même piège que l'ancien platStock : `(i.buy||0)*qty` envoyait à l'IA un stock
    // investi amputé des articles sans prix d'achat, comptés 0 € au lieu d'être écartés.
    items.filter(i=>i.statut!=='vendu').forEach(i=>{const p=i.plateforme;if(!p)return;if(!acc[p])acc[p]={count:0,invested:0};acc[p].count+=(i.quantite||1);if(prixAchatConnu(i))acc[p].invested+=prixAchatNum(i)*(i.quantite||1);});
    return Object.entries(acc).map(([p,d])=>({p,count:d.count,invested:Math.round(d.invested)})).sort((a,b)=>b.invested-a.invested).slice(0,3);
  },[items]);

  // Meilleures ventes : le bénéfice en euros (gratuit compris, c'est un vrai
  // bénéfice) ; le % seulement au prix d'achat > 0.
  const topSellers=[...ventesComptables].sort((a,b)=>(b.margin||0)-(a.margin||0)).slice(0,3);

  const slowStock=[...items].filter(i=>i.statut!=='vendu').sort((a,b)=>new Date(a.date_ajout||a.date||0)-new Date(b.date_ajout||b.date||0)).slice(0,3);
  const slowCount=[...items].filter(i=>{
    if(i.statut==='vendu') return false;
    return (now-new Date(i.date_ajout||i.date||0))>30*24*3600*1000;
  }).length;

  // (28/10) Les périodes desktop partagent le cache de leur équivalent mobile (30 j = 1M,
  // 12 mois = 1A) ; « mois » (calendaire) a sa clé, datée : le cache d'octobre ne sert pas en novembre.
  const PERIOD_CACHE_KEY={'1M':'1m','3M':'3m','6M':'6m','1A':'1y','1Y':'1y','Tout':'all','All':'all','30j':'1m','12m':'1y','tout':'all',mois:`mois-${periodeActive.debut?.slice(0,7)}`};
  // Ce que l'IA lit comme période : le code mobile, ou le mois nommé (« octobre 2026 »).
  const PERIODE_IA={'30j':'1M','12m':'1A','tout':'Tout',mois:periodeActive.debut?new Intl.DateTimeFormat(fr?'fr-FR':'en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${periodeActive.debut}T12:00:00Z`)):'mois'};

  const activeItemCount=useMemo(()=>items.filter(i=>i.statut!=='vendu').length,[items]);
  const dataHash=useMemo(()=>`${filtered.length}_${activeItemCount}_${Math.round(totalProfit)}`,[filtered.length,activeItemCount,totalProfit]);

  useEffect(()=>{
    if(filtered.length===0){setAiText('');return;}
    const SURL=supabaseUrl;
    if(!user?.id){setAiText('');return;}
    const cacheKey=PERIOD_CACHE_KEY[rangeActif]??rangeActif;

    // Tier 1 : cache mémoire — instantané, zéro réseau
    const memEntry=aiCache[cacheKey];
    if(memEntry&&memEntry.hash===dataHash&&memEntry.result){
      setAiText(memEntry.result);
      setOutdated(false);
      return;
    }

    // Cache miss et onglet inactif — marquer comme périmé sans appeler l'API
    if(!isActive){
      setOutdated(true);
      return;
    }

    setAiLoading(true);
    setAiText('');
    setOutdated(false);
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
          body:JSON.stringify({periode:PERIODE_IA[rangeActif]??rangeActif,profit:Math.round(totalProfit),ventes:filtered.length,marge:avgMargin,meilleure_cat:bestCategory||'',meilleure_cat_pct:bestCategoryPct,meilleur_article:bestItemName||'',meilleur_article_profit:Math.round(bestItemProfit),articles_lents:slowCount,plateformes_ventes:platVentesAI,plateformes_stock:platStockAI,lang}),
        })
          .then(async r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();})
          .then(d=>{
            const result=d?.analysis||'';
            setAiText(result);setAiLoading(false);setOutdated(false);
            setAiCache(prev=>({...prev,[cacheKey]:{hash:dataHash,result}}));
            const updatedCache={...cache,[cacheKey]:{hash:dataHash,result}};
            // Règle projet « profiles-rls-update-policy » : .select() + test
            // d'erreur sur toute écriture client. Non bloquant (cache d'analyse,
            // recalculé au prochain passage), mais un refus de GRANT doit se
            // VOIR — c'est un refus silencieux qui a masqué la panne des
            // abonnements Google pendant des mois.
            supabase.from('profiles').update({stats_analysis_cache:updatedCache}).eq('id',user.id).select('id')
              .then(({error})=>{if(error)console.warn('[stats] cache d\'analyse non enregistré:',error.message);});
          })
          .catch(()=>{setAiLoading(false);});
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[rangeActif,dataHash,refreshKey]);

  const fmt2=n=>formatCurrency(n,currency);
  // « 200 € → 2 468 € » : sans centimes quand le montant est rond (lignes courtes).
  const fmtCourt=n=>{const v=Math.round((Number(n)||0)*100)/100;return formatCurrency(v,currency,Number.isInteger(v)?0:null);};
  const lancerAnalyse=()=>{setOutdated(false);setRefreshKey(k=>k+1);};
  const allerAuStock=()=>{setTab(1);try{localStorage.setItem('tab',1);}catch{/* stockage indisponible */}};

  const lignesPlateformes=ventesParPlateforme(filtered);
  const maxPlateforme=Math.max(...lignesPlateformes.map(l=>l.ca),0)||1;
  const sansPlateforme=lignesPlateformes.find(l=>l.cle===CLE_SANS_PLATEFORME);
  const maxDelai=Math.max(...delaisParCategorie.map(d=>d.avg),1);
  const sourceMarge=(()=>{
    const {retenues,total,sansPrix,aZero}=margeStats;
    if(retenues===total) return fr?`calculée sur tes ${total} ventes`:`based on your ${total} sales`;
    const raison=sansPrix>0&&aZero>0
      ?(fr?"les autres n'ont pas de prix d'achat, ou un prix d'achat à 0 €":'the others have no purchase price, or a €0 one')
      :aZero>0?(fr?"les autres ont un prix d'achat à 0 €":'the others have a €0 purchase price')
      :(fr?"les autres n'ont pas de prix d'achat":'the others have no purchase price');
    return fr?`calculée sur ${retenues} vente${retenues>1?'s':''} sur ${total} (${raison})`:`based on ${retenues} of ${total} sales (${raison})`;
  })();
  const libelleCat=(c)=>typeLabel(c,lang);

  // (28/10) Ordinateur : la page desktop. Même analyse IA (même effet, même cache, même
  // fonction stats-analysis), pilotée par la période desktop. Sans vente : le même écran vide.
  if(bureau) return(
    <div className="fsx-ecran" style={{display:'flex',flexDirection:'column',gap:12}}>
      <style>{CSS_ECRANS}</style>
      {sales.length===0?(
        <div key={entree} style={{display:'flex',flexDirection:'column',gap:12,maxWidth:640,width:'100%',margin:'0 auto'}}>
          <h1 className="fsx-rise" style={{margin:'2px 0 0',fontSize:34,lineHeight:1.08,fontWeight:700,letterSpacing:'-0.025em',color:UI.ink}}>{fr?'Statistiques':'Statistics'}</h1>
          <StatsVide lang={lang} range="Tout" onStock={allerAuStock}/>
        </div>
      ):(
        <StatsBureau key={entree} ctx={ctxStats} lang={lang} currency={currency} cle={rangeBureau} setCle={setRangeBureau} setTab={setTab}
          ia={{texte:aiText,chargement:aiLoading,perime:outdated,lancer:lancerAnalyse,html:aiText?renderMd(aiText.replace(/#{1,6}\s*/g,'').replace(/\*\*(.*?)\*\*/g,'$1')):null}}/>
      )}
    </div>
  );

  return(
    <div className="fsx-ecran" style={{display:'flex',flexDirection:'column',gap:12}}>
      <style>{CSS_ECRANS}</style>
      <div key={entree} style={{display:'flex',flexDirection:'column',gap:12}}>
        <h1 className="fsx-rise" style={{margin:'2px 0 0',fontSize:34,lineHeight:1.08,fontWeight:700,letterSpacing:'-0.025em',color:UI.ink}}>{fr?'Statistiques':'Statistics'}</h1>
        <div className="fsx-rise" style={{animationDelay:'.04s'}}>
          <Segments options={RANGES} valeur={range} onChange={setRange} ariaLabel={fr?'Période':'Period'}/>
        </div>

        {sales.length===0?(
          <StatsVide lang={lang} range={range} onStock={allerAuStock}/>
        ):(
          <>
            {/* ── PROFIT · période, et la courbe cumulée ── */}
            <div className="fsx-rise" style={{animationDelay:'.08s',borderRadius:28,background:'radial-gradient(120% 100% at 100% 0%,#2C8C7C 0%,#17594F 55%,#123F38 100%)',color:'#fff',padding:'20px 18px 14px',overflow:'hidden',boxShadow:'0 18px 36px -22px rgba(18,63,56,.8)'}}>
              <Libelle style={{color:'#BFE3DA'}}>{(fr?'PROFIT · ':'PROFIT · ')+(PERIODE_LIBELLE[range]??PERIODE_LIBELLE['6M'])[fr?0:1]}</Libelle>
              <div style={{marginTop:8}}>
                {ventesComptables.length===0
                  ?<span style={{fontSize:42,lineHeight:1.05,fontWeight:700}}>—</span>
                  :<Compteur texte={fmt2(totalProfit)} delai={0.15} style={{fontSize:42,fontWeight:700,letterSpacing:'-0.03em'}}/>}
              </div>
              <div style={{fontSize:14,color:'#BFE3DA',marginTop:6}}>
                {fr
                  ?<>sur <span style={{fontVariantNumeric:'tabular-nums'}}>{fmt2(totalRev)}</span> encaissés · {filtered.length} vente{filtered.length>1?'s':''}</>
                  :<>out of <span style={{fontVariantNumeric:'tabular-nums'}}>{fmt2(totalRev)}</span> collected · {filtered.length} sale{filtered.length>1?'s':''}</>}
              </div>
              {ventesComptables.length===0?(
                <div style={{fontSize:13,color:'#BFE3DA',marginTop:14,lineHeight:1.45}}>
                  {fr?"Ta courbe de profit se dessine dès qu'une vente de la période a son prix d'achat.":'Your profit curve draws itself once a sale of the period has its purchase price.'}
                </div>
              ):(
                <CourbeCumulee points={cumul} lang={lang} etiquettes={etiquettesCourbe}/>
              )}
            </div>

            {/* ── KPI ── */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10}}>
              <Carte entree={0.14} style={{padding:18,display:'flex',flexDirection:'column',gap:8,minWidth:0}}>
                <Libelle>{fr?'Revenu':'Revenue'}</Libelle>
                {filtered.length===0?<span style={{fontSize:24,fontWeight:700,color:DISCRET}}>—</span>
                  :<Compteur texte={fmt2(totalRev)} delai={0.2} style={{fontSize:24,fontWeight:700,letterSpacing:'-0.02em',color:UI.ink}}/>}
              </Carte>
              <Carte entree={0.18} style={{padding:18,display:'flex',flexDirection:'column',gap:8,minWidth:0}}>
                <Libelle>{fr?'Ventes':'Sales'}</Libelle>
                <Compteur texte={String(filtered.length)} delai={0.2} style={{fontSize:24,fontWeight:700,color:UI.ink}}/>
              </Carte>
              <Carte entree={0.22} style={{gridColumn:'1 / -1',padding:18,display:'flex',alignItems:'center',gap:16,minWidth:0}}>
                <Anneau pct={margeStats.pct} taille={72} epaisseur={8} couleur={UI.amber} delai={0.35}/>
                <div style={{flex:1,minWidth:0}}>
                  <Libelle>{fr?'Marge moyenne':'Average margin'}</Libelle>
                  <div style={{marginTop:6}}>
                    {margeStats.pct==null
                      ?<span style={{fontSize:24,fontWeight:700,color:DISCRET}}>—</span>
                      :<Compteur texte={libellePct(margeStats.pct,1)} delai={0.3} style={{fontSize:24,fontWeight:700,letterSpacing:'-0.02em',color:UI.ink}}/>}
                  </div>
                  <div style={{fontSize:13,color:ENCRE2,marginTop:4,lineHeight:1.4}}>
                    {margeStats.pct==null
                      ?(filtered.length?(fr?"aucune vente de la période n'a un prix d'achat supérieur à 0 €":'no sale of the period has a purchase price above €0'):(fr?'aucune vente sur la période':'no sale in the period'))
                      :sourceMarge}
                  </div>
                </div>
              </Carte>
              <Carte entree={0.26} style={{padding:18,display:'flex',flexDirection:'column',gap:8,minWidth:0}}>
                <Libelle>{fr?'Délai moyen':'Avg. time'}</Libelle>
                <span style={{fontSize:24,fontWeight:700,letterSpacing:'-0.02em',color:avgDays==null?DISCRET:UI.ink}}>{libelleJours(avgDays,lang)}</span>
                <span style={{fontSize:13,color:ENCRE2}}>{fr?'de la mise en ligne à la vente':'from listing to sale'}</span>
              </Carte>
              <Carte entree={0.3} style={{padding:18,display:'flex',flexDirection:'column',gap:8,minWidth:0}}>
                <Libelle>{fr?'Panier moyen':'Avg. basket'}</Libelle>
                {filtered.length===0?<span style={{fontSize:24,fontWeight:700,color:DISCRET}}>—</span>
                  :<Compteur texte={fmt2(avgBasket)} delai={0.3} style={{fontSize:24,fontWeight:700,letterSpacing:'-0.02em',color:UI.ink}}/>}
                <span style={{fontSize:13,color:ENCRE2}}>{fr?'par vente':'per sale'}</span>
              </Carte>
            </div>

            {/* ── Analyse IA (logique inchangée) ── */}
            <Carte entree={0.34} style={{padding:18,display:'flex',flexDirection:'column',gap:12}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <BoiteIcone fond="linear-gradient(135deg,#E6F1EE,#CFE7E0)" taille={40} rayon={12}><Icone nom="ia2" taille={20} couleur={UI.tealDeep}/></BoiteIcone>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:17,fontWeight:700,color:UI.ink}}>{fr?'Analyse IA':'AI analysis'}</div>
                  <div style={{fontSize:13,color:ENCRE2}}>{fr?'Tendances, prix et conseils sur tes ventes de la période':'Trends, prices and advice on this period’s sales'}</div>
                </div>
                {outdated&&!aiLoading&&aiText&&(
                  <button type="button" onClick={lancerAnalyse} style={{display:'flex',alignItems:'center',gap:5,background:'#fff',color:PECHE_ENCRE,border:`1px solid ${UI.amber}66`,borderRadius:99,padding:'5px 10px',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>
                    <Icone nom="synchro" taille={13} couleur={PECHE_ENCRE}/>{fr?'Actualiser':'Refresh'}
                  </button>
                )}
              </div>
              {aiLoading?(
                <div style={{display:'flex',flexDirection:'column',gap:8}} aria-label={fr?'Analyse en cours':'Analysis running'}>
                  {[100,82,64].map((w,i)=><span key={i} className="fsx-sk" style={{display:'block',height:10,borderRadius:5,width:`${w}%`}}/>)}
                </div>
              ):aiText?(
                <div style={{fontSize:13.5,color:UI.ink,lineHeight:1.65,fontWeight:500}} dangerouslySetInnerHTML={renderMd(aiText.replace(/#{1,6}\s*/g,'').replace(/\*\*(.*?)\*\*/g,'$1'))}/>
              ):filtered.length===0?(
                <div style={{fontSize:13.5,color:ENCRE2,lineHeight:1.5}}>{fr?'Aucune vente sur cette période : choisis une période plus longue.':'No sale in this period: pick a longer one.'}</div>
              ):(
                <button type="button" onClick={lancerAnalyse}
                  style={{height:50,border:0,borderRadius:25,background:`linear-gradient(135deg,${UI.teal},${UI.tealDeep})`,color:'#fff',fontSize:15.5,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:9,width:'100%',boxShadow:'0 10px 22px -12px rgba(27,110,98,.7)',cursor:'pointer',fontFamily:'inherit'}}>
                  <Icone nom="ia2" taille={17} couleur="#FFFFFF"/>{fr?'Lancer mon analyse':'Run my analysis'}
                </button>
              )}
            </Carte>

            {/* ── Profit par catégorie ── */}
            {donutSegs.length>0&&(
              <Carte entree={0.38} style={{padding:18}}>
                <h2 style={{margin:0,fontSize:17,fontWeight:700,color:UI.ink}}>{fr?'Profit par catégorie':'Profit by category'}</h2>
                <div style={{display:'flex',gap:16,marginTop:14,alignItems:'center'}}>
                  <Donut segments={donutSegs} total={formatCurrency(totalProfit,currency,0)}/>
                  <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:10,fontSize:13.5}}>
                    {donutSegs.map(s=>(
                      <div key={s.label} style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                        <span style={{width:8,height:8,borderRadius:4,background:s.color,flex:'none'}}/>
                        <span style={{flex:1,fontWeight:600,color:UI.ink,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{libelleCat(s.label)}</span>
                        <span style={{color:ENCRE2,fontVariantNumeric:'tabular-nums'}}>{Math.round(s.pct)}&nbsp;%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Carte>
            )}

            {/* ── Ventes par plateforme (règles a et c) ── */}
            {lignesPlateformes.length>0&&(
              <Carte entree={0.42} style={{padding:18}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8}}>
                  <h2 style={{margin:0,fontSize:17,fontWeight:700,color:UI.ink}}>{fr?'Ventes par plateforme':'Sales by platform'}</h2>
                  <span style={{fontSize:13,color:ENCRE2}}>{fr?'montant encaissé':'amount collected'}</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:14,marginTop:16}}>
                  {lignesPlateformes.map((l,i)=>(
                    <div key={l.cle}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,fontSize:14,marginBottom:6}}>
                        <span style={{display:'flex',alignItems:'center',gap:8,fontWeight:600,color:l.cle===CLE_SANS_PLATEFORME?ENCRE2:UI.ink,minWidth:0}}>
                          {CODES_PLATEFORME_VENTE.includes(l.code)
                            ?<PlatformLogo platform={l.code} size={18}/>
                            :<span style={{width:8,height:8,borderRadius:4,background:l.couleur,flex:'none'}}/>}
                          <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.code==='ailleurs'?(fr?'Ailleurs':'Elsewhere'):l.cle===CLE_SANS_PLATEFORME?(fr?'Sans plateforme':'No platform'):l.libelle}</span>
                        </span>
                        <span style={{fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}><b>{fmt2(l.ca)}</b> <span style={{color:DISCRET}}>· {l.nb}</span></span>
                      </div>
                      <Barre largeur={(l.ca/maxPlateforme)*100} couleur={l.couleur} delai={(0.6+i*0.08).toFixed(2)}/>
                    </div>
                  ))}
                </div>
                {/* La somme se lit : toutes les lignes, « Sans plateforme » comprise,
                    font le revenu de la période — au centime. */}
                <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid #EFECE6',display:'flex',justifyContent:'space-between',gap:8,fontSize:13,color:ENCRE2}}>
                  <span>{fr?'Total de la période':'Period total'}</span>
                  <span style={{fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}><b style={{color:UI.ink}}>{fmt2(lignesPlateformes.reduce((a,l)=>a+l.ca,0))}</b> · {filtered.length}</span>
                </div>
                {sansPlateforme&&(
                  <div style={{marginTop:8,fontSize:12,lineHeight:1.45,color:DISCRET}}>
                    {fr?"« Sans plateforme » : ventes enregistrées sans dire où elles ont eu lieu. Ouvre une vente pour lui donner sa plateforme.":'“No platform”: sales recorded without saying where they happened. Open a sale to set its platform.'}
                  </div>
                )}
              </Carte>
            )}

            {/* ── Temps pour vendre ── */}
            {delaisParCategorie.length>0&&(
              <Carte entree={0.46} style={{padding:18}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8}}>
                  <h2 style={{margin:0,fontSize:17,fontWeight:700,color:UI.ink}}>{fr?'Temps pour vendre':'Time to sell'}</h2>
                  <span style={{fontSize:13,color:ENCRE2}}>{fr?'par catégorie':'by category'}</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:16}}>
                  {delaisParCategorie.map((d,i)=>(
                    <div key={d.cat} style={{display:'flex',alignItems:'center',gap:10,fontSize:14}}>
                      <span style={{width:96,flexShrink:0,fontWeight:600,color:UI.ink,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{libelleCat(d.cat)}</span>
                      <Barre hauteur={12} largeur={Math.max(3,(d.avg/maxDelai)*100)} delai={(0.6+i*0.1).toFixed(2)}
                        couleur={i===0&&delaisParCategorie.length>1?`linear-gradient(90deg,#F2C4A8,${UI.amber})`:`linear-gradient(90deg,#BFE1D9,${UI.teal})`}/>
                      <span style={{width:48,flexShrink:0,textAlign:'right',fontWeight:700,color:UI.ink,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{libelleJours(d.avg,lang)}</span>
                    </div>
                  ))}
                </div>
              </Carte>
            )}

            {/* ── Stock en ligne ── */}
            {enLigne&&enLigne.total>0&&(
              <Carte entree={0.5} style={{padding:18}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8}}>
                  <h2 style={{margin:0,fontSize:17,fontWeight:700,color:UI.ink}}>{fr?'Stock en ligne':'Stock online'}</h2>
                  <span style={{fontSize:13,color:ENCRE2,fontVariantNumeric:'tabular-nums'}}>{fr?`${enLigne.enLigne} article${enLigne.enLigne>1?'s':''} sur ${enLigne.total}`:`${enLigne.enLigne} of ${enLigne.total} items`}</span>
                </div>
                <div style={{display:'flex',height:14,borderRadius:7,overflow:'hidden',gap:3,marginTop:16}} aria-hidden="true">
                  {CODES_PLATEFORME_VENTE.filter(p=>enLigne.parPlateforme[p]>0).map((p,i)=>(
                    <i key={p} className="fsx-gx" style={{animationDelay:`${(0.6+i*0.1).toFixed(2)}s`,flex:enLigne.parPlateforme[p],background:COULEUR_PLATEFORME[p]}}/>
                  ))}
                  {enLigne.pasEncore>0&&<i style={{flex:enLigne.pasEncore,background:'#ECE9E2'}}/>}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'10px 14px',marginTop:14,fontSize:13.5}}>
                  {CODES_PLATEFORME_VENTE.filter(p=>enLigne.parPlateforme[p]>0).map(p=>(
                    <div key={p} style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                      <PlatformLogo platform={p} size={18}/>
                      <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:UI.ink}}>{LIBELLE_PLATEFORME_VENTE[p]}</span>
                      <b style={{fontVariantNumeric:'tabular-nums',color:UI.ink}}>{enLigne.parPlateforme[p]}</b>
                    </div>
                  ))}
                  <div style={{display:'flex',alignItems:'center',gap:8,gridColumn:'1 / -1',color:ENCRE2}}>
                    <span style={{width:8,height:8,borderRadius:4,background:'#D8D3C9',flex:'none'}}/>
                    <span style={{flex:1}}>{fr?'Pas encore publiés':'Not published yet'}</span>
                    <b style={{fontVariantNumeric:'tabular-nums',color:UI.ink}}>{enLigne.pasEncore}</b>
                  </div>
                </div>
              </Carte>
            )}

            {/* ── Meilleures ventes ── */}
            {topSellers.length>0&&(
              <Carte entree={0.54} style={{padding:18}}>
                <h2 style={{margin:0,fontSize:17,fontWeight:700,color:UI.ink}}>{fr?'Meilleures ventes':'Best sales'}</h2>
                <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:14}}>
                  {topSellers.map((s,i)=>{
                    const pct=margePctVente(s);
                    const zero=prixAchatZero(s);
                    const medaille=[['#F2D38A','#C9A24A','#4A3A10'],['#E6E8EA','#AEB4B8','#2F3639'],['#F0C7A6','#B9733F','#4A250B']][i];
                    const details=[s.marque?marqueLabel(s.marque,lang):null,s.type&&s.type!=='Autre'?typeLabel(s.type,lang):null].filter(Boolean).join(' · ');
                    return(
                      <div key={s.id??i} style={{display:'flex',alignItems:'center',gap:12,padding:12,borderRadius:18,background:'#F4F2EE'}}>
                        <span className="fsx-popin" style={{animationDelay:`${(0.7+i*0.1).toFixed(2)}s`,width:32,height:32,borderRadius:16,background:`linear-gradient(135deg,${medaille[0]},${medaille[1]})`,color:medaille[2],fontSize:14,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flex:'none'}}>{i+1}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:15,fontWeight:700,color:UI.ink,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.title}</div>
                          <div style={{fontSize:13,color:ENCRE2,lineHeight:1.35}}>
                            {details}{details?' · ':''}
                            {zero
                              ?<span style={{color:PECHE_ENCRE,whiteSpace:'nowrap'}}>{fr?"prix d'achat à 0 €":'purchase price €0'}</span>
                              :<span style={{fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{fmtCourt(prixAchatNum(s))} → {fmtCourt(s.sell)}</span>}
                          </div>
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          {zero?(
                            <>
                              <div style={{fontSize:16,fontWeight:700,color:UI.ink,fontVariantNumeric:'tabular-nums'}}>{fmt2(s.sell)}</div>
                              <div style={{fontSize:12,color:DISCRET}}>{fr?'vendu':'sold'}</div>
                            </>
                          ):(
                            <>
                              <div style={{fontSize:16,fontWeight:700,color:(s.margin||0)<0?'#B0645A':UI.tealDeep,fontVariantNumeric:'tabular-nums'}}>{(s.margin||0)>=0?'+':''}{fmt2(s.margin||0)}</div>
                              {pct!=null&&<div style={{fontSize:12,color:ENCRE2,fontVariantNumeric:'tabular-nums'}}>{libellePct(pct,1)}</div>}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Carte>
            )}

            {/* ── Ça dort en stock ── */}
            {slowStock.length>0&&(()=>{
              const jours=slowStock.map(s=>s.date_ajout||s.created_at?Math.floor((Date.now()-new Date(s.date_ajout||s.created_at))/86400000):null);
              const maxJ=Math.max(...jours.filter(j=>j!=null),1);
              return(
                <Carte entree={0.58} style={{padding:18}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8}}>
                    <h2 style={{margin:0,fontSize:17,fontWeight:700,color:UI.ink}}>{fr?'Ça dort en stock':'Sleeping in stock'}</h2>
                    <span style={{fontSize:13,color:ENCRE2}}>{fr?'depuis le plus longtemps':'longest first'}</span>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:14}}>
                    {slowStock.map((s,i)=>(
                      <div key={s.id??i}>
                        <div style={{display:'flex',justifyContent:'space-between',gap:10,fontSize:14.5}}>
                          <span style={{fontWeight:600,color:UI.ink,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0}}>{s.title}</span>
                          {jours[i]!=null&&<span style={{fontWeight:700,color:PECHE_ENCRE,flex:'none',fontVariantNumeric:'tabular-nums'}}>{libelleJours(jours[i],lang)}</span>}
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginTop:6}}>
                          <Barre hauteur={6} largeur={jours[i]!=null?(jours[i]/maxJ)*100:0} delai={(0.7+i*0.08).toFixed(2)} couleur={`linear-gradient(90deg,#F5D3BF,${UI.amber})`}/>
                          {/* Inconnu → rien ; 0 € → « gratuit » (vide ≠ zéro). */}
                          {prixAchatConnu(s)&&(
                            <span style={{fontSize:13,color:ENCRE2,flex:'none',fontVariantNumeric:'tabular-nums'}}>
                              {prixAchatNum(s)===0?(fr?'gratuit':'free'):`${fr?'investi':'invested'} ${fmt2(prixAchatNum(s)*(s.quantite||1))}`}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Carte>
              );
            })()}
          </>
        )}
      </div>
      <div style={{height:16}}/>
    </div>
  );
});

export default StatsTab;
