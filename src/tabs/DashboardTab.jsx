import { memo } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { formatCurrency, MONTHS_FR, MONTHS_EN, groupSales } from '../utils/shared';
import { UI, Loader } from '../components/ui';
import { comptabilisables, prixAchatNum, totalCA } from '../utils/comptabilite';
import { FREE_STOCK_LIMIT_FALLBACK, compteArticlesQuota, STOCK_ILLIMITE } from '../utils/stockLimit';
import { margeDePeriode, margeMoyenne, totalEncaisse, plateformeVente, COULEUR_PLATEFORME, CODES_PLATEFORME_VENTE, jourDeVente } from '../utils/ventesStats';
import { motVendu, jourCourt } from '../utils/accordVendu';
import { CSS_ECRANS } from '../ecrans/animations';
import { Compteur, Anneau } from '../ecrans/primitives';
import Icone from '../ecrans/Icone';
import { Carte, Libelle, BoiteIcone, Segments, NomPlateforme } from '../ecrans/pleins/communs';
import { ENCRE2, DISCRET, LIGNE2, PECHE, PECHE_ENCRE, libellePct } from '../ecrans/pleins/jetons';
import { BarresBenefices, MargeParMois } from '../ecrans/pleins/GraphesTableau';
import { useStockEnLigne } from '../ecrans/useStockEnLigne';

// ── Design « Dashboard » (Claude Design, projet e47b36df — intégré 2026-07-14) ──
// (16/10) Refonte d'après la maquette « fillsell-ecrans-pleins.html » validée
// par Nico : cartes « Ce mois », marge en anneau, revenu brut, stock (en ligne
// par plateforme / pas encore publiés), barres de bénéfices, marge par mois et
// activité récente par type d'événement. ⛔ INCHANGÉS : la carte « PROFIT NET ·
// DEPUIS LE DÉBUT » (montant, pastille du mois, mini-courbe, « Voir l'analyse
// complète ») — design, texte et animation —, l'en-tête et la barre d'onglets
// (App.jsx). Les chiffres viennent d'App.jsx (tm, totalM, salesForKpis…) et de
// buildChartData ; les règles de lecture, de utils/ventesStats.js.

// Un point de graphe = une somme de marges. Une vente sans prix d'achat n'a pas
// de marge : `reduce((a,s)=>a+s.margin,0)` lisait son null comme 0 (barre juste)
// et surtout la comptait au dénominateur de « Marge % », qui plongeait sans
// qu'aucune vente n'ait été mauvaise. On écarte la vente des DEUX agrégats.
// ⛔ `profit` ne change pas d'un centime : la mini-courbe de la carte
// « PROFIT NET » le dessine. (16/10) `marge` = la marge de la période selon la
// règle du 16/10 (prix d'achat > 0 seulement ; aucune vente → aucun point ;
// ventes sans prix d'achat → hachures) — utils/ventesStats.margeDePeriode.
const agregats=(liste)=>{
  const ms=comptabilisables(liste).filter(s=>s.margin!=null&&Number.isFinite(Number(s.margin)));
  return{profit:ms.reduce((a,s)=>a+Number(s.margin),0),marge:margeDePeriode(liste)};
};

function buildChartData(salesArr, range, now, lang){
  const MONTHS=lang==='en'?MONTHS_EN:MONTHS_FR;
  const byMonth=(n)=>Array.from({length:n},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()-(n-1)+i,1);
    const m=d.getMonth();const y=d.getFullYear();
    const ms=salesArr.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===m&&sd.getFullYear()===y;});
    return{name:MONTHS[m],...agregats(ms)};
  });
  if(range==='7j'){
    return Array.from({length:7},(_,i)=>{
      const d=new Date(now);d.setDate(d.getDate()-6+i);
      const ds=salesArr.filter(s=>{const sd=new Date(s.date);return sd.toDateString()===d.toDateString();});
      return{name:`${d.getDate()}/${d.getMonth()+1}`,...agregats(ds)};
    });
  }
  if(range==='1M'){
    return Array.from({length:4},(_,i)=>{
      const end=new Date(now);end.setDate(end.getDate()-i*7);
      const start=new Date(end);start.setDate(start.getDate()-6);
      const ds=salesArr.filter(s=>{const sd=new Date(s.date);return sd>=start&&sd<=end;});
      return{name:`S${4-i}`,...agregats(ds)};
    }).reverse();
  }
  if(range==='1A') return byMonth(12);
  if(range==='YTD') return byMonth(now.getMonth()+1);
  return byMonth(6);
}

const CHART_CSS = `
@keyframes db-draw{to{stroke-dashoffset:0}}
@keyframes db-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@media (prefers-reduced-motion:reduce){
  .db-anim,.db-draw{animation:none !important;stroke-dashoffset:0 !important;opacity:1 !important;transform:none !important}
}
.db-charts{display:grid;grid-template-columns:1fr;gap:12px}
@media (min-width:900px){.db-charts{grid-template-columns:1fr 1fr}}
.db-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
`;

// Mini-courbe du hero — tendance du profit sur la période sélectionnée.
function HeroSparkline({ data, width=104, height=38 }) {
  const vals = data.length ? data : [0,0];
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const range = (max-min) || 1;
  const pts = vals.map((v,i)=>({
    x: vals.length>1 ? (128*i)/(vals.length-1) : 64,
    y: height - ((v-min)/range)*height,
  }));
  const line = pts.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `M0,${height} ${pts.map(p=>`L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} L128,${height} Z`;
  const last = pts[pts.length-1];
  return (
    <svg viewBox="0 0 128 38" style={{ width, height, display:'block', overflow:'visible', flexShrink:0 }}>
      <defs>
        <linearGradient id="db-hero-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(47,158,144,0.28)"/>
          <stop offset="1" stopColor="rgba(47,158,144,0)"/>
        </linearGradient>
      </defs>
      <path d={area} fill="url(#db-hero-grad)" />
      <path className="db-draw" d={line} fill="none" stroke={UI.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray:300, strokeDashoffset:300, animation:'db-draw 1.1s ease 0.2s forwards' }} />
      {last && <circle cx={last.x.toFixed(1)} cy={last.y.toFixed(1)} r="2.6" fill={UI.tealDeep} />}
    </svg>
  );
}

const DashboardTab = memo(function DashboardTab({
  lang, currency, isPremium, isNative, username, loading,
  items, sales, stock, stockVal, stockQty,
  tm, salesForKpis, totalM,
  selectedRange, setSelectedRange,
  openUpgradeModal, setTab,
  EmptyStateDashboard,
  // Lot 2 : ligne discrète « extension pas encore installée » de l'état vide.
  extensionAbsente = false, onExtensionInfo = null,
  // (16/10) photosParInventaire n'est plus lu : l'activité récente montre une
  // icône par type d'événement (maquette), plus la photo de l'article.
  // (02/10) Cartes du haut du tableau de bord, préparées par App.jsx : le
  // bandeau « sortie d'Opla » (comptes reliés) et la carte d'avis (web sur
  // ordinateur). null = rien.
  entete = null,
  // (16/10) Identifiant du compte : « En stock » lit ses annonces en ligne
  // (une lecture à l'ouverture de l'onglet, useStockEnLigne).
  userId = null,
}) {
  const { t, tpl } = useTranslation(lang);
  const fmt = (amount, dec=null) => formatCurrency(amount, currency, dec);
  // Abrégé pour les graduations du graphe (1,2k € plutôt que 1 200,00 €).
  const fmtShort = (n) => n >= 1000
    ? `${(n/1000).toFixed(1).replace('.',',')}k ${currency==='EUR'?'€':''}`.trim()
    : fmt(Math.round(n), 0);
  const now = new Date();

  const mData = buildChartData(sales, selectedRange, now, lang);
  // totalM (prop) exclut déjà les ventes sans prix d'achat ; le CA affiché, lui,
  // reste complet — il est vrai sans prix d'achat.
  const kpiComptables = comptabilisables(salesForKpis);
  const totalR = totalCA(salesForKpis);
  // (16/10, règle b) La marge EN % ne porte que sur les ventes au prix d'achat
  // > 0 : un prix d'achat à 0 € n'est plus un « 100 % » qui gonfle la moyenne.
  // Pondérée (Σ bénéfices / Σ ventes), comme avant. Le bénéfice PAR VENTE en
  // euros, lui, garde le gratuit (c'est un vrai bénéfice) : même chiffre que la
  // carte « PROFIT NET ».
  const margeTout = margeMoyenne(salesForKpis, { mode:'ponderee' });
  const hasData = sales.length>0;
  // « Ce mois » : encaissé et nombre de ventes du mois (même filtre que tm, App.jsx).
  const ventesDuMois = sales.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===now.getMonth()&&sd.getFullYear()===now.getFullYear();});
  const encaisseMois = totalEncaisse(ventesDuMois);
  // Stock en ligne par plateforme : une lecture à l'ouverture (useStockEnLigne).
  const enLigne = useStockEnLigne(userId, stock);

  const rangeLabel = selectedRange==='7j'?t('dernierNJours')
    :selectedRange==='1M'?t('trente')
    :selectedRange==='1A'?t('douze')
    :selectedRange==='YTD'?t('depuisJanvier')
    :t('sixMois');

  // ── Activité récente : fusion ventes + ajouts stock, déjà chargés côté client ──
  const recentActivity = (()=>{
    if(!hasData && (!stock || stock.length===0)) return [];
    // date_vente (date || created_at, cf. mapSale) : une vente enregistrée SANS
    // date (« je ne sais plus », import dressing) doit apparaître ici comme une
    // activité récente — c'est son enregistrement qui est récent. Trier sur
    // s.date seul l'envoyait en 1970, donc hors du top 5. `noDate` pilote le
    // libellé : on affiche « date inconnue », jamais un faux « 1 jan ».
    // (16/10) Une vente montre ce qu'elle a ENCAISSÉ (maquette), et sa plateforme.
    const soldRows = groupSales(sales).slice(0,5).map(s=>({
      kind:'sale', id:`s-${s.id}`, date:s.date_vente||s.date, noDate:!jourDeVente(s), title:s.title,
      amount:Number.isFinite(Number(s.sell))?Number(s.sell)*(s.quantite!=null?1:(s._qty||1)):null, qty:s._qty||1,
      plateforme:plateformeVente(s),
    }));
    const addRows = (stock||[])
      .filter(i=>i.date_ajout||i.created_at)
      .slice()
      .sort((a,b)=>new Date(b.date_ajout||b.created_at)-new Date(a.date_ajout||a.created_at))
      .slice(0,5)
      .map(i=>({
        // `i.buy` brut affichait « 0,00 € » pour un article dont on ignore le
        // prix d'achat : prixAchatNum rend null, jamais un zéro inventé.
        kind:'add', id:`a-${i.id}`, date:i.date_ajout||i.created_at, title:i.title,
        amount:prixAchatNum(i), qty:i.quantite||1,
      }));
    return [...soldRows, ...addRows]
      .sort((a,b)=>new Date(b.date)-new Date(a.date))
      .slice(0,5);
  })();

  // Miroir de check_inventory_limit (migration 20260725180000) : la limite
  // Quota Free : même assiette que le trigger serveur (non vendus, HORS
  // dressing Vinted synchronisé — compteArticlesQuota, bug « X/20 » qui
  // comptait la sync corrigé le 05/08) ; limite 200 (miroir de
  // coin_config.free_stock_limit). Un ex-Premium redevenu Free peut dépasser
  // la limite (articles hérités, le trigger ne bloque que les NOUVEAUX
  // ajouts) : compteur borné à 0 et libellé dédié une fois la limite
  // atteinte (« Plus que -21 article » vu en prod le 26/07).
  // 2026-09-04 : stock ILLIMITÉ pour tous — les deux encarts de quota
  // ci-dessous (« Plus que N articles » et « Limite du plan gratuit
  // atteinte ») ne doivent plus jamais paraître. Ils restent en place, éteints
  // par le même interrupteur que les gardes (STOCK_ILLIMITE) : le retour
  // arrière les rallume sans rien réécrire.
  const freeActive=STOCK_ILLIMITE?0:compteArticlesQuota(items);
  const freeLeft=Math.max(0,FREE_STOCK_LIMIT_FALLBACK-freeActive);

  // Répartition du stock en ligne : un segment par plateforme (couleurs de
  // l'app), puis « pas encore publiés ». null tant que la lecture n'a pas répondu.
  const segmentsStock = enLigne ? [
    ...CODES_PLATEFORME_VENTE.filter(p=>enLigne.parPlateforme[p]>0).map(p=>({p,n:enLigne.parPlateforme[p],couleur:COULEUR_PLATEFORME[p]})),
  ] : null;

  return (
    <div className="fsx-ecran" style={{display:"flex",flexDirection:"column",gap:18,width:"100%",overflow:"hidden"}}>
      <style>{CHART_CSS}</style>
      <style>{CSS_ECRANS}</style>
      {entete}

      {!isPremium&&!loading&&freeActive>0&&freeActive<FREE_STOCK_LIMIT_FALLBACK-2&&(
        <div style={{background:UI.chip,border:`1px solid ${UI.border}`,borderRadius:14,padding:"12px 18px",textAlign:"center",overflow:"hidden"}}>
          <div style={{fontSize:13,fontWeight:600,color:freeLeft<=2?UI.amber:UI.tealDeep}}>
            {freeLeft<=2
              ? tpl('urgenceArticles',{n:freeLeft})
              : tpl('articlesGratuits',{n:freeLeft})
            }
          </div>
        </div>
      )}
      {!isNative&&!isPremium&&!loading&&freeActive>=FREE_STOCK_LIMIT_FALLBACK-2&&(
        <div onClick={()=>openUpgradeModal(null,'dashboard_stock_presque')} style={{background:UI.card,border:`1px solid ${UI.border}`,borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,cursor:"pointer"}}>
          <div style={{fontSize:13,fontWeight:600,color:UI.ink}}>
            {freeLeft===0
              ?(lang==='en'?`Free plan limit reached (${FREE_STOCK_LIMIT_FALLBACK} active items)`:`Limite du plan gratuit atteinte (${FREE_STOCK_LIMIT_FALLBACK} articles actifs)`)
              :(lang==='en'?`Only ${freeLeft} item${freeLeft>1?"s":""} left on your free plan`:`Plus que ${freeLeft} article${freeLeft>1?"s":""} disponible${freeLeft>1?"s":""}`)}
          </div>
          <button onClick={e=>{e.stopPropagation();openUpgradeModal(null,'dashboard_stock_presque');}} style={{background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,color:"#fff",border:"none",borderRadius:99,padding:"7px 14px",fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{t('debloquer')}</button>
        </div>
      )}

      {loading?(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"70px 0"}}>
          <Loader size={38} />
          <div style={{fontSize:13.5,fontWeight:500,color:UI.mute2}}>{lang==='en'?"Loading data...":"Chargement des données..."}</div>
        </div>
      ):items.length===0&&sales.length===0?(
        <div style={{maxWidth:520,margin:"4px auto 0",animation:"fadeIn 0.4s ease",width:"100%"}}>
          <EmptyStateDashboard
            lang={lang}
            onImport={()=>{setTab(1); localStorage.setItem('tab',1);}}
            onOpenLens={()=>{setTab(2); localStorage.setItem('tab',2);}}
            extensionAbsente={extensionAbsente}
            onExtensionInfo={onExtensionInfo}
          />
        </div>
      ):(
        <>
          {/* Badge période + salutation (16/10 : plus d'émoji dans cet écran) */}
          <div className="db-anim" style={{animation:"db-rise 0.5s ease both"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:7,background:UI.paper,border:`1px solid ${UI.border}`,color:UI.mute,borderRadius:999,padding:"5px 11px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12}}>
              <span style={{width:6,height:6,borderRadius:99,background:UI.teal,flexShrink:0}}/>
              {(lang==='en'?MONTHS_EN:MONTHS_FR)[now.getMonth()]} {now.getFullYear()}
            </div>
            <div style={{fontSize:30,fontWeight:700,color:UI.ink,letterSpacing:"-0.03em",lineHeight:1.1}}>
              {username
                ?<>{lang==='en'?'Hello':'Bonjour'} <span style={{color:UI.teal}}>{username}</span></>
                :lang==='en'?'Hello':'Bonjour'}
            </div>
          </div>

          {/* Hero « Profit net » — verre dépoli sur halos teal/amber */}
          <div
            onClick={()=>{setTab(4);localStorage.setItem('tab',4);}}
            className="db-anim"
            style={{position:"relative",overflow:"hidden",borderRadius:26,cursor:"pointer",animation:"db-rise 0.55s ease both"}}
          >
            <div style={{position:"absolute",pointerEvents:"none",top:-40,right:-30,width:200,height:190,borderRadius:"50%",background:"radial-gradient(circle,rgba(47,158,144,0.55),transparent 68%)",filter:"blur(24px)"}}/>
            <div style={{position:"absolute",pointerEvents:"none",bottom:-60,left:-30,width:180,height:180,borderRadius:"50%",background:"radial-gradient(circle,rgba(232,149,109,0.5),transparent 68%)",filter:"blur(26px)"}}/>
            <div style={{position:"absolute",pointerEvents:"none",top:20,left:"40%",width:150,height:120,borderRadius:"50%",background:"radial-gradient(circle,rgba(47,158,144,0.28),transparent 70%)",filter:"blur(30px)"}}/>
            <div style={{
              position:"relative",padding:"22px 22px 20px",
              background:"rgba(255,255,255,0.44)",
              backdropFilter:"blur(20px) saturate(165%)",WebkitBackdropFilter:"blur(20px) saturate(165%)",
              border:"1px solid rgba(255,255,255,0.7)",borderRadius:26,
              boxShadow:"0 14px 36px -16px rgba(16,32,27,0.28), inset 0 1px 0 rgba(255,255,255,0.7)",
            }}>
              {/* « depuis le début » (2026-08-03 soir) : ces chiffres sont
                  GLOBAUX — le sélecteur de période ne pilote que les graphes.
                  Sans cette mention, un changement de période qui ne les fait
                  pas bouger ressemble à un bug. */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:10}}>
                <span style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.12em",color:UI.mute2}}>{t('profitNet')} · {lang==='en'?'all-time':'depuis le début'}</span>
                <span style={{background:"rgba(47,158,144,0.14)",border:"1px solid rgba(47,158,144,0.28)",borderRadius:999,padding:"4px 10px",fontSize:10.5,fontWeight:600,color:UI.tealDeep,whiteSpace:"nowrap"}}>
                  {tm.profit>=0?"+":""}{fmt(tm.profit)} {t('ceNoisPill')}
                </span>
              </div>
              <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:12}}>
                <div style={{fontSize:34,fontWeight:700,color:UI.ink,letterSpacing:"-0.03em",lineHeight:1,whiteSpace:"nowrap"}}>{fmt(totalM)}</div>
                <HeroSparkline data={mData.map(d=>d.profit)} />
              </div>
              {/* La marge moyenne se divise par les ventes RETENUES : totalM ne
                  contient plus les ventes sans prix d'achat, les diviser par le
                  total des ventes rabotait le montant à chaque fiche incomplète.
                  Le nombre de ventes affiché, lui, reste le vrai total. */}
              <div style={{fontSize:12.5,fontWeight:500,color:UI.mute2,marginTop:10}}>
                {tpl('venteLabel',{n:salesForKpis.length})} {lang==='en'?'all-time':'depuis le début'} · {t('margeMoyDash')} {fmt(kpiComptables.length?totalM/kpiComptables.length:0)}
              </div>
              <div style={{fontSize:12,fontWeight:600,color:UI.tealDeep,marginTop:10,display:"flex",alignItems:"center",gap:5}}>
                {t('analyseComplete')}
              </div>
            </div>
          </div>

          {/* ── KPI 2×2 (16/10, maquette validée par Nico) ── */}
          <div className="db-kpis">
            <Carte entree={0.16} style={{padding:18,display:"flex",flexDirection:"column",gap:8,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                <Libelle>{lang==='en'?'This month':'Ce mois'}</Libelle>
                <BoiteIcone><Icone nom="barres" taille={16} couleur={UI.tealDeep} epaisseur={2.2}/></BoiteIcone>
              </div>
              <Compteur texte={fmt(encaisseMois)} delai={0.2} style={{fontSize:24,fontWeight:700,letterSpacing:"-0.02em",color:UI.ink}}/>
              <div style={{fontSize:13,color:ENCRE2}}>{lang==='en'?`collected · ${tm.count} sale${tm.count>1?'s':''}`:`encaissés · ${tm.count} vente${tm.count>1?'s':''}`}</div>
              {/* Profit du mois impossible à calculer (au moins une vente sans prix
                  d'achat) : on le dit, au lieu d'un profit partiel présenté comme total. */}
              {tm.count>0&&tm.sansAchat>0&&(
                <div style={{fontSize:12,color:PECHE_ENCRE,background:PECHE,borderRadius:10,padding:"6px 8px",lineHeight:1.35}}>
                  {lang==='en'?'Profit to come: purchase prices missing':"Profit à venir : prix d'achat manquants"}
                </div>
              )}
            </Carte>
            <Carte entree={0.22} style={{padding:18,display:"flex",flexDirection:"column",gap:8,minWidth:0}}>
              <Libelle>{lang==='en'?'Average margin':'Marge moyenne'}</Libelle>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <Anneau pct={margeTout.pct} taille={58} couleur={UI.teal}/>
                {margeTout.pct==null
                  ?<span style={{fontSize:24,fontWeight:700,color:DISCRET}}>—</span>
                  :<Compteur texte={libellePct(Math.round(margeTout.pct))} delai={0.3} style={{fontSize:24,fontWeight:700,letterSpacing:"-0.02em",color:UI.ink}}/>}
              </div>
              <div style={{fontSize:12.5,lineHeight:1.35,color:ENCRE2}}>
                {margeTout.pct==null
                  ?(lang==='en'?'purchase prices missing':"prix d'achat manquants")
                  :(lang==='en'
                    ?<><span style={{fontVariantNumeric:"tabular-nums"}}>{fmt(kpiComptables.length?totalM/kpiComptables.length:0)}</span> per sale, on sales with a purchase price</>
                    :<><span style={{fontVariantNumeric:"tabular-nums"}}>{fmt(kpiComptables.length?totalM/kpiComptables.length:0)}</span> par vente, sur les ventes avec prix d'achat</>)}
              </div>
            </Carte>
            <Carte entree={0.28} style={{padding:18,display:"flex",flexDirection:"column",gap:8,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                <Libelle>{lang==='en'?'Gross revenue':'Revenu brut'}</Libelle>
                <BoiteIcone fond={PECHE}><Icone nom="diamant" taille={16} couleur={PECHE_ENCRE} epaisseur={2.2}/></BoiteIcone>
              </div>
              <Compteur texte={fmt(totalR)} delai={0.3} style={{fontSize:24,fontWeight:700,letterSpacing:"-0.02em",color:UI.ink}}/>
              <div style={{fontSize:13,color:ENCRE2}}>{lang==='en'?'total collected, all-time':'total encaissé depuis le début'}</div>
            </Carte>
            <Carte entree={0.34} style={{padding:18,display:"flex",flexDirection:"column",gap:8,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                <Libelle>{lang==='en'?'In stock':'En stock'}</Libelle>
                <BoiteIcone fond="#ECE9E2"><Icone nom="colis" taille={16} couleur={ENCRE2}/></BoiteIcone>
              </div>
              <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                <Compteur texte={String(stockQty??stock.length)} delai={0.35} style={{fontSize:24,fontWeight:700,letterSpacing:"-0.02em",color:UI.ink}}/>
                <span style={{fontSize:15,fontWeight:600,color:ENCRE2}}>{lang==='en'?((stockQty??stock.length)>1?'items':'item'):((stockQty??stock.length)>1?'articles':'article')}</span>
              </div>
              <div style={{fontSize:13,color:ENCRE2}}><span style={{fontVariantNumeric:"tabular-nums"}}>{fmt(stockVal)}</span> {lang==='en'?'tied up':'immobilisé'}</div>
              {segmentsStock&&enLigne.total>0&&(
                <>
                  <div style={{display:"flex",height:6,borderRadius:3,overflow:"hidden",gap:2,marginTop:2}} aria-hidden="true">
                    {segmentsStock.map((g,i)=>(
                      <i key={g.p} className="fsx-gx" style={{animationDelay:`${(0.5+i*0.1).toFixed(2)}s`,flex:g.n,background:g.couleur}}/>
                    ))}
                    {enLigne.pasEncore>0&&<i style={{flex:enLigne.pasEncore,background:"#E4E1DA"}}/>}
                  </div>
                  <div style={{fontSize:11.5,color:DISCRET}}>
                    {lang==='en'
                      ?`${enLigne.enLigne} online · ${enLigne.pasEncore} not published yet`
                      :`${enLigne.enLigne} en ligne · ${enLigne.pasEncore} pas encore publié${enLigne.pasEncore>1?'s':''}`}
                  </div>
                </>
              )}
            </Carte>
          </div>

          {/* Sélecteur de période — il ne pilote QUE les graphes (les cartes
              ci-dessus disent « depuis le début » ou « ce mois »). */}
          <div className="fsx-rise" style={{animationDelay:".4s"}}>
            <Segments options={['7j','1M','6M','1A','YTD']} valeur={selectedRange} onChange={setSelectedRange}
              ariaLabel={lang==='en'?'Charts period':'Période des graphes'}
              libelle={r=>lang==='en'?({'7j':'7d','1A':'1Y'}[r]||r):r}/>
          </div>

          <div className="db-charts">
            <Carte entree={0.45} style={{padding:18}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
                <h2 style={{margin:0,fontSize:17,fontWeight:700,letterSpacing:"-0.01em",color:UI.ink}}>{t('benefices')}</h2>
                <span style={{fontSize:13,color:ENCRE2}}>{rangeLabel}</span>
              </div>
              <BarresBenefices data={mData} fmtShort={fmtShort} fmtValue={fmt} lang={lang}/>
            </Carte>
            <Carte entree={0.5} style={{padding:18}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
                <h2 style={{margin:0,fontSize:17,fontWeight:700,letterSpacing:"-0.01em",color:UI.ink}}>{selectedRange==='7j'?(lang==='en'?'Margin per day':'Marge par jour'):selectedRange==='1M'?(lang==='en'?'Margin per week':'Marge par semaine'):(lang==='en'?'Margin per month':'Marge par mois')}</h2>
                <span style={{fontSize:13,color:ENCRE2}}>{lang==='en'?'as % of sale price':'en % du prix de vente'}</span>
              </div>
              <MargeParMois data={mData} lang={lang}/>
            </Carte>
          </div>

          {/* Activité récente — une icône par type d'événement (ajouté, vendu)
              et la plateforme de la vente (16/10 : plus d'émoji). */}
          {recentActivity.length>0&&(
            <Carte entree={0.55} style={{overflow:"hidden"}}>
              <div style={{padding:"18px 18px 6px",display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                <h2 style={{margin:0,fontSize:17,fontWeight:700,letterSpacing:"-0.01em",color:UI.ink}}>{lang==='en'?'Recent activity':'Activité récente'}</h2>
                <button type="button" onClick={()=>{setTab(3);localStorage.setItem('tab',3);}} style={{background:"none",border:"none",padding:0,fontSize:13.5,fontWeight:600,color:UI.tealDeep,cursor:"pointer",fontFamily:"inherit"}}>{lang==='en'?'See all':'Tout voir'}</button>
              </div>
              <div style={{display:"flex",flexDirection:"column"}}>
                {recentActivity.map((a,i)=>{
                  const vente=a.kind==='sale';
                  const quand=a.noDate?(lang==='en'?'unknown date':'date inconnue'):jourCourt(a.date,lang,now);
                  return(
                    <div key={a.id} className="fsx-rise" style={{animationDelay:`${(0.7+i*0.1).toFixed(2)}s`,display:"flex",alignItems:"center",gap:10,padding:"12px 18px",borderTop:`1px solid ${LIGNE2}`}}>
                      <BoiteIcone fond={vente?PECHE:"#E6F1EE"} taille={40} rayon={12}>
                        {vente
                          ?<Icone nom="etiquette" taille={18} couleur={PECHE_ENCRE} epaisseur={2.2}/>
                          :<Icone nom="plus" taille={18} couleur={UI.tealDeep} epaisseur={2.2}/>}
                      </BoiteIcone>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0}}>
                          <span style={{fontSize:14.5,fontWeight:600,color:UI.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.title}</span>
                          {a.qty>1&&<span style={{background:UI.chip,color:UI.mute2,borderRadius:99,padding:"1px 6px",fontSize:10,fontWeight:600,flexShrink:0}}>×{a.qty}</span>}
                        </div>
                        <div style={{fontSize:13,color:ENCRE2,display:"flex",alignItems:"center",gap:5,minWidth:0,whiteSpace:"nowrap"}}>
                          {vente?motVendu(a.title,lang):(lang==='en'?'Added to stock':'Ajouté au stock')}
                          {vente&&a.plateforme&&<> · <NomPlateforme p={a.plateforme} taille={13}/></>}
                          {quand&&<> · <span>{quand}</span></>}
                        </div>
                      </div>
                      {a.amount!=null&&(
                        <span style={{fontSize:15,fontWeight:vente?700:600,color:vente?UI.ink:ENCRE2,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{fmt(a.amount)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Carte>
          )}
        </>
      )}
    </div>
  );
});

export default DashboardTab;
