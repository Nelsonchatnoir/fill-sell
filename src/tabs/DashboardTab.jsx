import { memo, useMemo } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { UI, Loader } from '../components/ui';
import { FREE_STOCK_LIMIT_FALLBACK, compteArticlesQuota, STOCK_ILLIMITE } from '../utils/stockLimit';
import { CSS_ECRANS } from '../ecrans/animations';
import { useStockEnLigne } from '../ecrans/useStockEnLigne';
import { useBureau } from '../hooks/useBureau';
import { creerContexte } from '../utils/tableauStats';
import TableauBureau from '../ecrans/bureau/TableauBureau';
import TableauTelephone from '../ecrans/telephone/TableauTelephone';

// ── Le Tableau ──────────────────────────────────────────────────────────────
// (28/10) Ordinateur (web ≥ 1 024 px) : ecrans/bureau/TableauBureau.
// (29/10) Téléphone — site mobile ET app iOS / Android : ecrans/telephone/
// TableauTelephone (maquette « écran 1 » validée par Nico le 29/10). Il remplace
// l'écran mobile du 16/10 (carte « Profit net · depuis le début », « Ce mois »,
// Bénéfices / Marge par mois en 7j-1M-6M-1A-YTD, Activité récente) : une période
// nommée en haut pilote tout, chaque tuile ouvre une feuille qui monte du bas.
// Les deux lisent LE même calcul : utils/tableauStats.js (comme l'en-tête).
// ⛔ INCHANGÉS ici : les bandeaux du haut (`entete`, App.jsx), les encarts de
// quota (éteints par STOCK_ILLIMITE), le chargement et l'écran de démarrage d'un
// compte vide (EmptyStateDashboard).

const DashboardTab = memo(function DashboardTab({
  lang, currency, isPremium, isNative, username, loading,
  items, sales, stock,
  openUpgradeModal, setTab,
  EmptyStateDashboard,
  // Lot 2 : ligne discrète « extension pas encore installée » de l'état vide.
  extensionAbsente = false, onExtensionInfo = null,
  // (02/10) Cartes du haut du tableau de bord, préparées par App.jsx : le
  // bandeau « sortie d'Opla » (comptes reliés) et la carte d'avis (web sur
  // ordinateur). null = rien.
  entete = null,
  // (16/10) Identifiant du compte : « En ligne » lit ses annonces en ligne
  // (une lecture à l'ouverture de l'onglet, useStockEnLigne).
  userId = null,
}) {
  const { t, tpl } = useTranslation(lang);
  // Stock en ligne par plateforme, et prix publiés : une lecture à l'ouverture (useStockEnLigne).
  const enLigne = useStockEnLigne(userId, stock);
  const bureau = useBureau(isNative);
  // Le contexte du calcul unique : index construits une fois, sur ce qui est déjà chargé.
  const ctx = useMemo(() => creerContexte({ ventes: sales, items, jobsParArticle: enLigne?.jobsParArticle ?? null, enLigneParArticle: enLigne?.parArticle ?? null }), [sales, items, enLigne]);

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

  return (
    <div className="fsx-ecran" style={{display:"flex",flexDirection:"column",gap:18,width:"100%",overflow:"hidden"}}>
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
      ):bureau?(
        <TableauBureau ctx={ctx} lang={lang} currency={currency} username={username} setTab={setTab}/>
      ):(
        <TableauTelephone ctx={ctx} lang={lang} currency={currency} username={username} setTab={setTab}/>
      )}
    </div>
  );
});

export default DashboardTab;
