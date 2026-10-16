/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, jamais livré. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — refonte Tableau · Ventes · Stats (16/10/2026, maquettes de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré (vite build n'a qu'une entrée). Monte les
// VRAIS onglets (src/tabs) dans l'en-tête et la barre d'onglets recopiés
// d'App.jsx (site-coquille.jsx), avec les props calculées comme App les calcule.
//
// LES DONNÉES : build/apercu-refonte-1610/donnees.json — le compte de Nico relu
// en LECTURE SEULE (jamais commité : build/ est ignoré ; requête
// build/apercu-refonte-1610/lecture.sql). Le client Supabase est le FAUX
// (vite-stock-refonte.config.mjs → faux-supabase.js) : aucune requête ne part,
// toute écriture est refusée et journalisée.
// AVANT : build/apercu-refonte-1610/*Avant.jsx = les onglets de main (git show
// HEAD, chemins d'import réécrits) — pour comparer la carte « PROFIT NET ».
//
//   refonte-1610.html?ecran=entree|tableau|ventes|stats|tableau-avant|ventes-avant|stats-avant|vide-tableau|vide-ventes|vide-stats
import { createRoot } from 'react-dom/client';
import { useMemo, useState } from 'react';
import '../../src/base.css';
import '../../src/App.css';
import '../../src/App.redesign.css';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler } from 'chart.js';
import DashboardTab from '../../src/tabs/DashboardTab.jsx';
import VentesTab from '../../src/tabs/VentesTab.jsx';
import StatsTab from '../../src/tabs/StatsTab.jsx';
import TableauVide from '../../src/ecrans/vides/TableauVide.jsx';
import ParcoursEntree from '../../src/entree/ParcoursEntree.jsx';
import { groupSales } from '../../src/utils/shared.js';
import { totalMarge, totalInvesti } from '../../src/utils/comptabilite.js';
import { trierVentes } from '../../src/utils/ventesStats.js';
import { EnTete, BarreOnglets } from './site-coquille.jsx';
import DashboardTabAvant from '../../build/apercu-refonte-1610/DashboardTabAvant.jsx';
import VentesTabAvant from '../../build/apercu-refonte-1610/VentesTabAvant.jsx';
import StatsTabAvant from '../../build/apercu-refonte-1610/StatsTabAvant.jsx';
import donnees from '../../build/apercu-refonte-1610/donnees.json';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler);

const params = new URLSearchParams(location.search);
const ecran = params.get('ecran') || 'tableau';
const vide = ecran.startsWith('vide-');
const UID = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
window.__FIXTURE = {
  utilisateur: { id: UID, email: 'apercu@fillsell.app' },
  tables: { cross_post_jobs: vide ? [] : donnees.jobs, profiles: [{ id: UID, stats_analysis_cache: {} }], fiches_annonce: [] },
  rpc: {},
};
const noop = () => {};

// mapSale / mapItem d'App.jsx (non exportés) — recopiés tels quels.
function mapSale(v){return{id:v.id,title:v.titre,prix_vente:v.prix_vente,buy:v.prix_achat,sell:v.prix_vente,inventaire_id:v.inventaire_id??null,cree_le:v.created_at??null,ship:0,margin:v.benefice,marginPct:(v.benefice==null||!(v.prix_vente>0))?null:(v.benefice/v.prix_vente)*100,date:v.date,date_vente:v.date||v.created_at,marque:v.marque||"",type:v.type||"",purchaseCosts:v.purchase_costs||0,sellingFees:v.selling_fees||0,description:v.description||null,emplacement:v.emplacement||null,plateforme:v.plateforme||null,plateforme_code:v.plateforme_code??null,quantite:v.quantite||null};}
function mapItem(v){return{id:v.id,title:v.titre,prix_achat:v.prix_achat,buy:v.prix_achat,prix_achat_inconnu:v.prix_achat_inconnu===true,sell:v.prix_vente,margin:v.margin,marginPct:v.margin_pct,statut:v.statut,date:v.date,date_ajout:v.created_at||v.date_achat||v.date,marque:v.marque||"",description:v.description||"",type:v.type||"Autre",attributs:v.attributs??null,
  typeConnu:v.type!=null&&String(v.type).trim()!=="",purchaseCosts:v.purchase_costs||0,sellingFees:v.selling_fees||0,quantite:v.quantite||1,emplacement:v.emplacement||null,plateforme:v.plateforme||null,origine:v.origine||null,photos:Array.isArray(v.photos)?v.photos:null,vinted_item_id:v.vinted_item_id||null,vinted_catalog_id:v.vinted_catalog_id??null,
  vinted_account_id:v.vinted_account_id??null,fusionne_dans:v.fusionne_dans??null,disparu_le:v.disparu_le||null,vinted_status:v.vinted_status||null,last_synced_at:v.last_synced_at||null,vinted_view_count:v.vinted_view_count??null,vinted_favourite_count:v.vinted_favourite_count??null,listed_at_guess:v.listed_at_guess||null};}

const SALES = vide ? [] : donnees.ventes.map(mapSale);
const ITEMS_TOUS = vide ? [] : donnees.inventaire.map(mapItem);
const ITEMS = ITEMS_TOUS.filter((r) => !(r.statut === 'stock' && r.a_verifier != null));

function useChiffres() {
  return useMemo(() => {
    const now = new Date();
    const stock = ITEMS.filter((i) => i.statut === 'stock');
    const sold = ITEMS.filter((i) => i.statut === 'vendu');
    const duMois = SALES.filter((s) => { const d = new Date(s.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const m = totalMarge(duMois);
    const ventesInvIds = new Set(SALES.map((s) => s.inventaire_id).filter((v) => v != null).map(String));
    const invPrixInconnu = new Set(ITEMS.filter((i) => i.prix_achat_inconnu === true).map((i) => String(i.id)));
    const salesAvecInconnu = trierVentes(SALES.map((s) => (s.inventaire_id != null && invPrixInconnu.has(String(s.inventaire_id)) && s.buy == null ? { ...s, prix_achat_inconnu: true } : s)));
    const photosParInventaire = {};
    for (const i of ITEMS) if (Array.isArray(i.photos) && i.photos.length) photosParInventaire[i.id] = i.photos;
    return {
      stock,
      tm: { profit: m.total, count: duMois.length, retenues: m.retenues, sansAchat: m.exclus },
      totalM: totalMarge(SALES).total,
      stockVal: totalInvesti(stock),
      stockQty: stock.reduce((a, i) => a + (i.quantite || 1), 0),
      salesAvecInconnu,
      groupedSales: groupSales(salesAvecInconnu),
      vendusAEnregistrer: sold.filter((i) => i.origine === 'vinted_sync' && !ventesInvIds.has(String(i.id))),
      photosParInventaire,
    };
  }, []);
}

function Page({ onglet, tm, children }) {
  return (
    <div className="app-root" style={{ height: 'auto', minHeight: '100dvh', overflowX: 'hidden', maxWidth: '100vw', position: 'relative', background: 'var(--bg)' }}>
      <EnTete tm={tm} />
      <div className="desktop-nav" style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.06)' }} />
      <div id="zone-defilement" className="wrap page-pad" style={{ padding: '18px 14px 140px', background: 'var(--bg)' }}>
        {children}
      </div>
      <BarreOnglets actif={onglet} />
    </div>
  );
}

function Tableau({ avant = false }) {
  const c = useChiffres();
  const [range, setRange] = useState('6M');
  const Composant = avant ? DashboardTabAvant : DashboardTab;
  return (
    <Page onglet={0} tm={c.tm}>
      <Composant
        lang="fr" currency="EUR" isPremium isNative={false} username={donnees.profil?.username ?? null} loading={false}
        items={ITEMS} sales={SALES} stock={c.stock} stockVal={c.stockVal} stockQty={c.stockQty}
        tm={c.tm} salesForKpis={SALES} totalM={c.totalM}
        selectedRange={range} setSelectedRange={setRange} openUpgradeModal={noop} setTab={noop}
        EmptyStateDashboard={TableauVide} extensionAbsente={false} onExtensionInfo={null}
        photosParInventaire={c.photosParInventaire} entete={null} userId={UID}
      />
    </Page>
  );
}

function Ventes({ avant = false, premium = true }) {
  const c = useChiffres();
  const [search, setSearch] = useState('');
  const [tout, setTout] = useState(false);
  const Composant = avant ? VentesTabAvant : VentesTab;
  const visibleSales = (tout ? c.groupedSales : c.groupedSales.slice(0, 10));
  return (
    <Page onglet={3} tm={c.tm}>
      <Composant
        lang="fr" currency="EUR" isPremium={premium} isNative={false} user={{ id: UID, email: 'apercu@fillsell.app' }}
        sales={c.salesAvecInconnu} visibleSales={visibleSales} groupedSales={c.groupedSales}
        salesForKpis={SALES} totalM={c.totalM}
        searchHistory={search} setSearchHistory={setSearch} showAllSales={tout} setShowAllSales={setTout}
        iapLoading={false} handleIAPPurchase={noop} handleIAPRestore={noop}
        extensionAbsente={false} onExtensionInfo={noop} oplaFermee
        delSale={noop} setTab={noop} setEditItem={(x) => { window.__edition = x; }}
        PremiumBanner={() => null} IAPUpgradeBlock={() => null} openUpgradeModal={noop}
        vendusAEnregistrer={c.vendusAEnregistrer} photosParInventaire={c.photosParInventaire}
        onSaleUpdated={noop}
      />
    </Page>
  );
}

function Stats({ avant = false }) {
  const c = useChiffres();
  const [cache, setCache] = useState({});
  const Composant = avant ? StatsTabAvant : StatsTab;
  return (
    <Page onglet={4} tm={c.tm}>
      <Composant sales={SALES} items={ITEMS} lang="fr" currency="EUR" user={{ id: UID }} aiCache={cache} setAiCache={setCache} setTab={noop} isActive />
    </Page>
  );
}

const SCENES = {
  tableau: () => <Tableau />, 'tableau-avant': () => <Tableau avant />,
  ventes: () => <Ventes />, 'ventes-avant': () => <Ventes avant />, 'ventes-gratuit': () => <Ventes premium={false} />,
  stats: () => <Stats />, 'stats-avant': () => <Stats avant />,
  // Le parcours d'entrée (16/10 : apparitions « pop » seulement) — faux compte.
  entree: () => <ParcoursEntree lang="fr" user={{ id: UID, email: 'apercu@fillsell.app' }} demanderPseudo={false} onUsername={noop} onDone={noop} />,
  'vide-tableau': () => <Tableau />, 'vide-ventes': () => <Ventes premium={false} />, 'vide-stats': () => <Stats />,
};
createRoot(document.getElementById('apercu')).render((SCENES[ecran] ?? SCENES.tableau)());
