/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu (captures du site), jamais livré. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU SITE — les onglets de l'app : Tableau, Lens, Stats (09/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de CAPTURES pour le site vitrine, jamais livré (vite build n'a qu'une
// entrée, index.html). Monte les VRAIS onglets de src/tabs/ dans la coquille
// recopiée d'App.jsx (site-coquille.jsx), avec le compte de DÉMONSTRATION
// (site-donnees-demo.js) — aucune donnée réelle, Depop ouverte comme App.jsx
// l'ouvre quand depop_autorise répond oui (plateformesOuvertes = ['depop']),
// jamais Opla. Servi par
// vite-stock-refonte.config.mjs : le client Supabase est le FAUX client
// (faux-supabase.js), aucune requête ne part, toute écriture est refusée.
//
//   site-app.html?ecran=accueil | lens-photo | lens | ventes | stats
//   node scripts/apercu/site-capture.mjs
import { createRoot } from 'react-dom/client';
import { useMemo, useRef, useState } from 'react';
import '../../src/base.css';
import '../../src/App.css';
import '../../src/App.redesign.css';
import DashboardTab from '../../src/tabs/DashboardTab.jsx';
import LensTab from '../../src/tabs/LensTab.jsx';
import StatsTab from '../../src/tabs/StatsTab.jsx';
import VentesTab from '../../src/tabs/VentesTab.jsx';
import { groupSales } from '../../src/utils/shared.js';
import { searchMatch } from '../../src/utils/recherche.js';
import { totalMarge, totalInvesti } from '../../src/utils/comptabilite.js';
// Même enregistrement que src/App.jsx:115 et :172 (StatsTab dessine avec Chart.js).
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler } from 'chart.js';
import { supabase } from '../../src/lib/supabase.js';
import { Coquille } from './site-coquille.jsx';
import { donneesDemo, resultatLensDemo, PHOTOS } from './site-donnees-demo.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler);

const ecran = new URLSearchParams(location.search).get('ecran') || 'accueil';
const MAINTENANT = Date.now(); // lu une fois, au chargement (jamais pendant un rendu)
const D = donneesDemo(MAINTENANT);
const EXTENSION_VUE_LE = new Date(MAINTENANT - 70_000).toISOString();
window.__FIXTURE = { utilisateur: D.utilisateur, tables: D.tables, rpc: D.rpc };
window.__donneesDemo = { origine: D.origine };
const noop = () => {};

function useChiffres() {
  return useMemo(() => {
    const now = new Date();
    const stock = D.items.filter((i) => i.statut === 'stock');
    const duMois = D.sales.filter((s) => { const d = new Date(s.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const m = totalMarge(duMois);
    return {
      stock,
      tm: { profit: m.total, count: duMois.length, retenues: m.retenues, sansAchat: m.exclus },
      totalM: totalMarge(D.sales).total,
      stockVal: totalInvesti(stock),
      stockQty: stock.reduce((a, i) => a + (i.quantite || 1), 0),
    };
  }, []);
}

function Accueil() {
  const c = useChiffres();
  const [range, setRange] = useState('6M');
  return (
    <Coquille onglet={0} tm={c.tm}>
      <DashboardTab
        lang="fr" currency="EUR" isPremium isNative={false} username={D.prenom} loading={false}
        items={D.items} sales={D.sales} stock={c.stock} stockVal={c.stockVal} stockQty={c.stockQty}
        tm={c.tm} salesForKpis={D.sales} totalM={c.totalM}
        selectedRange={range} setSelectedRange={setRange} openUpgradeModal={noop} setTab={noop}
        EmptyStateDashboard={() => null} extensionAbsente={false} onExtensionInfo={null}
        photosParInventaire={D.photosParInventaire} entete={null}
      />
    </Coquille>
  );
}

// avant : la photo est prise, l'analyse n'est pas encore lancée (écran de scan).
function Lens({ avant = false }) {
  const c = useChiffres();
  const fileRef = useRef(null);
  const [result, setResult] = useState(() => (avant ? null : resultatLensDemo()));
  const [photos, setPhotos] = useState(() => [{ preview: PHOTOS.teeOurs }]);
  const [added, setAdded] = useState(!avant);
  const [desc, setDesc] = useState('');
  const [buy, setBuy] = useState(avant ? '' : '4');
  return (
    <Coquille onglet={2} tm={c.tm}>
      <LensTab
        lang="fr" currency="EUR" userCountry={{ code: 'FR', name: 'France' }}
        isPremium isPro isBusiness={false} isNative={false} user={D.utilisateur}
        quotas={null} ebayCompte={{ voieApi: true, etat: null, lu: true, voieApiReelle: true, rafraichir: noop }}
        plateformesVisibles={['depop']} plateformesOuvertes={['depop']}
        oplaMotifGrise={null} oplaExtensionMin={null} iapLoading={false}
        lensPhotos={photos} setLensPhotos={setPhotos} lensResult={result} setLensResult={setResult}
        lensAdded={added} setLensAdded={setAdded} lensDesc={desc} setLensDesc={setDesc}
        lensBuy={buy} setLensBuy={setBuy} lensLoading={false} lensProgres={null} lensReprise={null} infoRepriseLens={null}
        lensMicActive={false} lensMicLoading={false} lensPlaceholderFade={false} lensPlaceholderIdx={0}
        lensFileRef={fileRef} toggleLensMic={noop} handleLensPhoto={noop} handleLensPhotoNative={noop} handleLensCameraNative={noop}
        analyzeLens={noop} addLensItem={noop} openLensEditModal={noop}
        handleIAPPurchase={noop} handleIAPRestore={noop} PremiumBanner={() => null} IAPUpgradeBlock={() => null}
        openUpgradeModal={noop} supabase={supabase} saveLensItemForListing={noop} lensInventaireId={D.parCle.teeOurs.id}
        onStepperOpenChange={noop} resetLensParcours={noop}
        extensionNeverSeen={false} extensionLastSeenAt={EXTENSION_VUE_LE}
      />
    </Coquille>
  );
}

function Stats() {
  const c = useChiffres();
  const [cache, setCache] = useState({});
  return (
    <Coquille onglet={4} tm={c.tm}>
      {/* isActive=false : l'analyse IA n'est pas lancée (aucun appel) ; la
          carte montre son invitation, telle qu'un onglet pas encore ouvert. */}
      <StatsTab sales={D.sales} items={D.items} lang="fr" currency="EUR" user={D.utilisateur}
        aiCache={cache} setAiCache={setCache} setTab={noop} isActive={false} />
    </Coquille>
  );
}

// Les ventes, dérivées comme App.jsx les dérive (src/App.jsx:4118-4125).
function Ventes() {
  const c = useChiffres();
  const [recherche, setRecherche] = useState('');
  const [tout, setTout] = useState(false);
  const groupees = useMemo(() => groupSales(D.sales), []);
  const visibles = useMemo(() => (tout ? groupees : groupees.slice(0, 10)).filter((s) => searchMatch(s, recherche)), [groupees, tout, recherche]);
  return (
    <Coquille onglet={3} tm={c.tm}>
      <VentesTab lang="fr" currency="EUR" isPremium isNative={false} user={D.utilisateur}
        sales={D.sales} visibleSales={visibles} groupedSales={groupees} salesForKpis={D.sales} totalM={c.totalM}
        searchHistory={recherche} setSearchHistory={setRecherche} showAllSales={tout} setShowAllSales={setTout}
        iapLoading={false} handleIAPPurchase={noop} handleIAPRestore={noop} extensionAbsente={false} onExtensionInfo={null}
        delSale={noop} setTab={noop} setEditItem={noop} PremiumBanner={() => null} IAPUpgradeBlock={() => null}
        openUpgradeModal={noop} vendusAEnregistrer={[]} photosParInventaire={D.photosParInventaire} onSaleUpdated={noop} />
    </Coquille>
  );
}

const SCENES = { accueil: Accueil, 'lens-photo': () => <Lens avant />, lens: Lens, ventes: Ventes, stats: Stats };
const Scene = SCENES[ecran] ?? Accueil;
createRoot(document.getElementById('apercu')).render(<Scene />);
document.fonts.ready.then(() => { window.__pret = true; });
