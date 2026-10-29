import { memo, useState, useEffect, useMemo } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { prixAchatConnu, prixAchatNum, comptabilisables } from '../utils/comptabilite';
import { UI } from '../components/ui';
import { ventesParPlateforme, margeMoyenne, margePctVente, CLE_SANS_PLATEFORME } from '../utils/ventesStats';
import { CSS_ECRANS } from '../ecrans/animations';
import { useStockEnLigne } from '../ecrans/useStockEnLigne';
import StatsVide from '../ecrans/vides/StatsVide';
import { useBureau } from '../hooks/useBureau';
import { creerContexte, periode, ventesDe, PERIODES_BUREAU } from '../utils/tableauStats';
import StatsBureau from '../ecrans/bureau/StatsBureau';
import StatsTelephone from '../ecrans/telephone/StatsTelephone';

// ═══════════════════════════════════════════════════════════════════════════
// STATS — (28/10) ordinateur : ecrans/bureau/StatsBureau ; (29/10) téléphone,
// site mobile ET app iOS / Android : ecrans/telephone/StatsTelephone (maquette
// validée par Nico le 29/10). UNE période nommée pour les deux (Octobre, 30 derniers
// jours, 12 derniers mois, Depuis le début), mémorisée sous fs_stats_periode ;
// les chiffres viennent de utils/tableauStats.js, comme le Tableau et l'en-tête.
// Ce fichier garde ce qui est commun : la période, les ventes de la période et
// l'analyse IA (caches mémoire + base, appel stats-analysis — logique inchangée,
// pilotée par la période choisie). Ouvert à tous les paliers, comme avant.
// L'entrée animée se rejoue à chaque ouverture de l'onglet (il reste monté).
// ═══════════════════════════════════════════════════════════════════════════
const CLE_PERIODE='fs_stats_periode';
const lirePeriode=()=>{try{const v=localStorage.getItem(CLE_PERIODE);return PERIODES_BUREAU.includes(v)?v:'12m';}catch{return '12m';}};
// L'écran vide (aucune vente) dit « depuis… » avec les codes d'avant.
const DEPUIS_VIDE={mois:'1M','30j':'1M','12m':'1A',tout:'Tout'};

function renderMd(text){
  const html=text
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/\n/g,'<br/>');
  return{__html:html};
}

// Catégorie lisible pour l'IA (meilleure catégorie de la période) — inchangé.
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

const StatsTab = memo(function StatsTab({sales,items,lang,currency='EUR',user,aiCache={},setAiCache=()=>{},setTab=()=>{},isActive=true,isNative=false}){
  const fr=lang!=='en';
  const bureau=useBureau(isNative);
  const [cle,setCleEtat]=useState(lirePeriode);
  const setCle=(v)=>{setCleEtat(v);try{localStorage.setItem(CLE_PERIODE,v);}catch{/* préférence locale */}};
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
  // Les bornes viennent de utils/tableauStats (jours de Paris) : les mêmes ventes que le
  // Tableau et l'en-tête pour une même période nommée. « Depuis le début » garde les ventes
  // sans date ; les autres périodes, non.
  const periodeActive=useMemo(()=>periode(cle),[cle]);
  const filtered=useMemo(()=>ventesDe(sales,periodeActive),[sales,periodeActive]);

  // Les ventes dont le prix d'achat est inconnu n'entrent dans AUCUN calcul de
  // bénéfice ni de moyenne — elles restent dans `filtered` pour le CA et les
  // compteurs de ventes, qui eux ne dépendent pas du prix d'achat.
  const ventesComptables=useMemo(()=>comptabilisables(filtered),[filtered]);
  const totalProfit=ventesComptables.reduce((a,s)=>a+(s.margin||0),0);
  // (16/10, règle b) Seulement sur les ventes au prix d'achat > 0 ; (28/10) pondérée,
  // comme le Tableau et l'en-tête : une seule règle de marge partout.
  const margeStats=useMemo(()=>margeMoyenne(filtered,{mode:'ponderee'}),[filtered]);
  const avgMargin=margeStats.pct==null?0:Math.round(margeStats.pct*10)/10;

  const titleToType=useMemo(()=>{
    const m={};
    items.forEach(i=>{if(i.title)m[i.title.toLowerCase().trim()]=i.type;});
    return m;
  },[items]);
  // PIÈGE : le profit par catégorie parcourait `filtered`, donc une vente sans
  // prix d'achat ajoutait 0 € à sa catégorie. Ne sert plus qu'à l'IA.
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

  // Stock en ligne et prix publiés : lus UNE fois, et seulement quand l'onglet a été
  // ouvert (il est monté dès le démarrage de l'app : sans cette garde, chaque
  // ouverture de l'app paierait la lecture).
  const stockActif=useMemo(()=>items.filter(i=>i.statut==='stock'),[items]);
  const enLigne=useStockEnLigne(entree>0?(user?.id??null):null,stockActif);
  const ctxStats=useMemo(()=>creerContexte({ventes:sales,items,jobsParArticle:enLigne?.jobsParArticle??null,enLigneParArticle:enLigne?.parArticle??null}),[sales,items,enLigne]);

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
  const slowCount=[...items].filter(i=>{
    if(i.statut==='vendu') return false;
    return (now-new Date(i.date_ajout||i.date||0))>30*24*3600*1000;
  }).length;

  // (28/10) 30 jours et 12 mois partagent le cache de leurs anciens équivalents (1M, 1A) ;
  // « mois » (calendaire) a sa clé, datée : le cache d'octobre ne sert pas en novembre.
  const PERIOD_CACHE_KEY={'30j':'1m','12m':'1y','tout':'all',mois:`mois-${periodeActive.debut?.slice(0,7)}`};
  // Ce que l'IA lit comme période : le code d'avant, ou le mois nommé (« octobre 2026 »).
  const PERIODE_IA={'30j':'1M','12m':'1A','tout':'Tout',mois:periodeActive.debut?new Intl.DateTimeFormat(fr?'fr-FR':'en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${periodeActive.debut}T12:00:00Z`)):'mois'};

  const activeItemCount=useMemo(()=>items.filter(i=>i.statut!=='vendu').length,[items]);
  const dataHash=useMemo(()=>`${filtered.length}_${activeItemCount}_${Math.round(totalProfit)}`,[filtered.length,activeItemCount,totalProfit]);

  useEffect(()=>{
    if(filtered.length===0){setAiText('');return;}
    const SURL=supabaseUrl;
    if(!user?.id){setAiText('');return;}
    const cacheKey=PERIOD_CACHE_KEY[cle]??cle;

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
          body:JSON.stringify({periode:PERIODE_IA[cle]??cle,profit:Math.round(totalProfit),ventes:filtered.length,marge:avgMargin,meilleure_cat:bestCategory||'',meilleure_cat_pct:bestCategoryPct,meilleur_article:bestItemName||'',meilleur_article_profit:Math.round(bestItemProfit),articles_lents:slowCount,plateformes_ventes:platVentesAI,plateformes_stock:platStockAI,lang}),
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
  },[cle,dataHash,refreshKey]);

  const lancerAnalyse=()=>{setOutdated(false);setRefreshKey(k=>k+1);};
  const allerAuStock=()=>{setTab(1);try{localStorage.setItem('tab',1);}catch{/* stockage indisponible */}};
  const ia={texte:aiText,chargement:aiLoading,perime:outdated,lancer:lancerAnalyse,html:aiText?renderMd(aiText.replace(/#{1,6}\s*/g,'').replace(/\*\*(.*?)\*\*/g,'$1')):null};

  return(
    <div className="fsx-ecran" style={{display:'flex',flexDirection:'column',gap:12}}>
      <style>{CSS_ECRANS}</style>
      {sales.length===0?(
        // Aucune vente : le même écran vide qu'avant, sur ordinateur comme sur téléphone.
        <div key={entree} style={{display:'flex',flexDirection:'column',gap:12,maxWidth:640,width:'100%',margin:'0 auto'}}>
          <h1 className="fsx-rise" style={{margin:'2px 0 0',fontSize:34,lineHeight:1.08,fontWeight:700,letterSpacing:'-0.025em',color:UI.ink}}>{fr?'Statistiques':'Statistics'}</h1>
          <StatsVide lang={lang} range={DEPUIS_VIDE[cle]??'Tout'} onStock={allerAuStock}/>
        </div>
      ):bureau?(
        <StatsBureau key={entree} ctx={ctxStats} lang={lang} currency={currency} cle={cle} setCle={setCle} setTab={setTab} ia={ia}/>
      ):(
        <StatsTelephone key={entree} ctx={ctxStats} lang={lang} currency={currency} cle={cle} setCle={setCle} setTab={setTab} ia={ia}/>
      )}
      <div style={{height:16}}/>
    </div>
  );
});

export default StatsTab;
