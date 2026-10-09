/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu (captures du site), jamais livré. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU SITE — l'écran Stock, avec le compte de DÉMONSTRATION (09/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de CAPTURES pour le site vitrine, jamais livré. Même montage que
// stock-refonte.jsx (le VRAI StockTab dans la coquille d'App.jsx, props
// calculées comme App les calcule), avec trois différences :
//   · les données sont celles de site-donnees-demo.js — un compte inventé,
//     jamais build/apercu-stock/donnees.json (le compte de Nico) ;
//   · les plateformes affichées sont les cinq présentées (Vinted, Leboncoin,
//     eBay, Beebs, Depop) : Depop ouverte comme App.jsx l'ouvre quand la garde
//     depop_autorise répond oui (plateformesVisibles = plateformesOuvertes =
//     ['depop'], Opla fermée : c'est ce qu'App calcule après la bascule du
//     10/10) ; jamais Opla ;
//   · la synchronisation EN COURS se pose par ?synchro=en-cours (des relevés
//     en cours dans les données, l'avancement servi comme synchro_avancement).
// Servi par vite-stock-refonte.config.mjs : le client Supabase est le FAUX
// client (faux-supabase.js) — aucune requête ne part, toute écriture est
// refusée et journalisée (window.__ecrituresRefusees). Les feuilles (« Déjà
// vendu ? », « Remonter », retrait par plateforme) s'ouvrent par les VRAIS
// gestes, joués par site-capture.mjs ; aucun bouton de confirmation n'est
// jamais pressé.
//
//   site-stock.html                      — le Stock, synchronisé il y a 2 h
//   site-stock.html?synchro=en-cours     — « Synchroniser » vient d'être pressé
//   site-stock.html?vente=recente        — vendu sur Vinted il y a 14 min : le retrait
//                                          Depop tourne, celui de Leboncoin suit, puis
//                                          la file de l'ordinateur
import { createRoot } from 'react-dom/client';
import { useMemo, useRef, useState, useEffect } from 'react';
import '../../src/base.css';
import '../../src/App.css';
import '../../src/App.redesign.css';
import StockTab from '../../src/tabs/StockTab.jsx';
import { searchMatch } from '../../src/utils/recherche.js';
import { marqueKey } from '../../src/utils/shared.js';
import { totalInvesti, totalMarge } from '../../src/utils/comptabilite.js';
import { Coquille } from './site-coquille.jsx';
import { donneesDemo, UID_DEMO } from './site-donnees-demo.js';

const q = new URLSearchParams(location.search);
const synchroEnCours = q.get('synchro') === 'en-cours';
const venteRecente = q.get('vente') === 'recente';
const D = donneesDemo(Date.now(), { venteRecente });
const F = { utilisateur: D.utilisateur, tables: D.tables, rpc: { ...D.rpc } };

// ── La synchronisation : finie il y a 2 h, ou EN COURS ─────────────────────
const il = (min) => new Date(Date.now() - min * 60_000).toISOString();
// Les nombres du dernier relevé de chaque plateforme, lus AVANT de poser les relevés en cours.
const NB = Object.fromEntries(D.tables.vinted_sync_runs.map((r) => [r.platform, r.items_vus ?? 0]));
const nb = (p) => NB[p] ?? 0;
if (synchroEnCours) {
  const run = (platform, kind, status, extra = {}) => ({
    id: `run-demo-${platform}-${kind}-encours`, user_id: UID_DEMO, kind, platform, status, declencheur: 'bouton',
    queued_at: il(2), started_at: status === 'queued' ? null : il(1.5), finished_at: status === 'done' ? il(0.3) : null,
    updated_at: il(0.2), progres_le: il(0.2), items_vus: 0, items_crees: 0, items_maj: 0, total_entries: null, erreur: null, ...extra,
  });
  F.tables.vinted_sync_runs = [
    run('vinted', 'dressing', 'done', { items_vus: nb('vinted'), total_entries: nb('vinted') }),
    run('leboncoin', 'annonces', 'done', { items_vus: nb('leboncoin'), total_entries: nb('leboncoin') }),
    run('ebay', 'annonces', 'done', { items_vus: nb('ebay'), total_entries: nb('ebay') }),
    run('depop', 'annonces', 'running', { items_vus: 9 }),
    run('beebs', 'annonces', 'queued'),
    ...D.tables.vinted_sync_runs,
  ];
  F.rpc.synchro_avancement = {
    ok: true, actif: true, a_verifier: 0, secondes_restantes: 70, avancement: 0.71,
    releves: [
      { platform: 'vinted', status: 'done', lues: nb('vinted'), annoncees: nb('vinted') },
      { platform: 'leboncoin', status: 'done', lues: nb('leboncoin'), annoncees: nb('leboncoin') },
      { platform: 'ebay', status: 'done', lues: nb('ebay'), annoncees: nb('ebay') },
      { platform: 'depop', status: 'running', lues: 9, annoncees: nb('depop') },
      { platform: 'beebs', status: 'queued', lues: 0, annoncees: null },
    ],
    rapprochement: { etat: 'attente_releves', en_attente: 0, nouvelles: 0, traitees: 0 },
  };
}
window.__FIXTURE = F;
window.__donneesDemo = { origine: D.origine };
window.__journal = [];
const noter = (...a) => window.__journal.push(a);

function AppMini() {
  const user = F.utilisateur;
  const profil = F.tables.profiles[0];
  const [items] = useState(() => D.items);
  const [filterType, setFilterType] = useState('Tous');
  const [filterMarque, setFilterMarque] = useState([]);
  const [filterMarqueSold, setFilterMarqueSold] = useState('Toutes');
  const [filterBoutique, setFilterBoutique] = useState('Toutes');
  const [search, setSearch] = useState('');
  const [soldShowAll, setSoldShowAll] = useState(false);
  const [showAllStock, setShowAllStock] = useState(false);
  const [expandedStockId, setExpandedStockId] = useState(null);
  const [pillsExpandedSold, setPillsExpandedSold] = useState(false);
  const [pillsExpandedStock, setPillsExpandedStock] = useState(false);
  const [voiceStep, setVoiceStep] = useState('');
  const [voiceParsed, setVoiceParsed] = useState(null);
  const [voiceZoneResults, setVoiceZoneResults] = useState([]);
  const [voiceZoneOpen, setVoiceZoneOpen] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualMode, setManualMode] = useState('single');
  const [iTitle, setITitle] = useState(''); const [iQuantite, setIQuantite] = useState(1);
  const [iMarque, setIMarque] = useState(''); const [iType, setIType] = useState('');
  const [iBuy, setIBuy] = useState(''); const [iBuyInconnu, setIBuyInconnu] = useState(false);
  const [iPurchaseCosts, setIPurchaseCosts] = useState(''); const [iAlreadySold, setIAlreadySold] = useState(false);
  const [iSell, setISell] = useState(''); const [iSellingFees, setISellingFees] = useState('');
  const [iRememberSellingFees, setIRememberSellingFees] = useState(false);
  const [iDesc, setIDesc] = useState(''); const [iEmplacement, setIEmplacement] = useState(''); const [iPlateforme, setIPlateforme] = useState('');
  const [iPoids, setIPoids] = useState('');
  const [lotManualTotal, setLotManualTotal] = useState(''); const [lotManualItems, setLotManualItems] = useState([{ nom: '' }, { nom: '' }]);
  const [lotDistributed, setLotDistributed] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const importRef = useRef(null); const listRef = useRef(null); const scrollRef = useRef(null); const fabTriggerRef = useRef(null);
  useEffect(() => { window.__editItem = editItem; }, [editItem]);

  // Les dérivations d'App.jsx (comme stock-refonte.jsx).
  const stock = useMemo(() => items.filter((i) => i.statut === 'stock'), [items]);
  const sold = useMemo(() => items.filter((i) => i.statut === 'vendu'), [items]);
  const clesMarques = useMemo(() => new Set((Array.isArray(filterMarque) ? filterMarque : []).map(marqueKey)), [filterMarque]);
  const stockFiltre = useMemo(() => {
    const filtres = stock
      .filter((i) => filterType === 'Tous' || i.type === filterType)
      .filter((i) => !clesMarques.size || clesMarques.has(marqueKey(i.marque)))
      .filter((i) => searchMatch(i, search));
    const enLigneVinted = (i) => !!i.vinted_item_id && !i.disparu_le;
    const g1 = filtres.filter((i) => !enLigneVinted(i));
    const g2 = filtres.filter((i) => enLigneVinted(i)).sort((a, b) => Date.parse(a.listed_at_guess ?? '') - Date.parse(b.listed_at_guess ?? ''));
    return [...g1, ...g2];
  }, [stock, filterType, clesMarques, search]);
  const soldFiltre = useMemo(() => sold.filter((i) => searchMatch(i, search)), [sold, search]);
  const soldVisible = useMemo(() => (soldShowAll ? soldFiltre : soldFiltre.slice(0, 10)), [soldFiltre, soldShowAll]);
  const stockVisible = useMemo(() => (showAllStock ? stockFiltre : stockFiltre.slice(0, 10)), [stockFiltre, showAllStock]);
  const stockVal = useMemo(() => totalInvesti(stock), [stock]);
  const stockQty = useMemo(() => stock.reduce((a, i) => a + (i.quantite || 1), 0), [stock]);
  const soldQty = useMemo(() => sold.reduce((a, i) => a + (i.quantite || 1), 0), [sold]);
  const tm = useMemo(() => {
    const now = new Date();
    const duMois = D.sales.filter((s) => { const d = new Date(s.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    return { profit: totalMarge(duMois).total, count: duMois.length };
  }, []);

  const stub = (nom) => (...a) => { noter(nom, ...a.map((x) => (x && typeof x === 'object' ? (x.id ?? '[objet]') : x))); };
  const vaActions = useMemo(() => ({ fetchAll: async () => noter('fetchAll') }), []);

  return (
    <Coquille onglet={1} tm={tm} scrollRef={scrollRef}>
      <StockTab
        lang="fr" currency="EUR" isPremium isNative={false} isPro isBusiness={false}
        ouvrirModalePlafond={stub('ouvrirModalePlafond')} ouvrirReglagesRepublication={stub('ouvrirReglagesRepublication')}
        quotas={null}
        items={items} itemsAVerifier={[]} user={user} voiceUsedToday={0}
        extensionStatus={{ lastSeenAt: profil.extension_last_seen_at, build: profil.extension_build, outdated: false }}
        extensionNeverSeen={false}
        ebayCompte={{ voieApi: true, etat: null, lu: true, voieApiReelle: true, rafraichir() {} }}
        plateformesVisibles={['depop']} plateformesOuvertes={['depop']}
        oplaMotifGrise={null} oplaExtensionMin={null} oplaRelie={false}
        iapLoading={false}
        stock={stock} sold={sold} stockFiltre={stockFiltre} soldFiltre={soldFiltre}
        stockVisible={stockVisible} soldVisible={soldVisible} stockVal={stockVal} stockQty={stockQty} soldQty={soldQty}
        voiceStep={voiceStep} setVoiceStep={setVoiceStep} voiceParsed={voiceParsed} setVoiceParsed={setVoiceParsed}
        voiceZoneResults={voiceZoneResults} setVoiceZoneResults={setVoiceZoneResults} voiceZoneOpen={voiceZoneOpen} setVoiceZoneOpen={setVoiceZoneOpen}
        vaActions={vaActions} vaStep="" voiceText={voiceText} setVoiceText={setVoiceText}
        voiceLoading={false} voicePlaceholderIdx={0} voiceError={null}
        showManualForm={showManualForm} setShowManualForm={setShowManualForm} manualMode={manualMode} setManualMode={setManualMode}
        iTitle={iTitle} setITitle={setITitle} iQuantite={iQuantite} setIQuantite={setIQuantite}
        iMarque={iMarque} setIMarque={setIMarque} iType={iType} setIType={setIType}
        iBuy={iBuy} setIBuy={setIBuy} iBuyInconnu={iBuyInconnu} setIBuyInconnu={setIBuyInconnu}
        iPurchaseCosts={iPurchaseCosts} setIPurchaseCosts={setIPurchaseCosts} iAlreadySold={iAlreadySold} setIAlreadySold={setIAlreadySold}
        iSell={iSell} setISell={setISell} iSellingFees={iSellingFees} setISellingFees={setISellingFees}
        iRememberSellingFees={iRememberSellingFees} setIRememberSellingFees={setIRememberSellingFees}
        iDesc={iDesc} setIDesc={setIDesc} iEmplacement={iEmplacement} setIEmplacement={setIEmplacement}
        iPoids={iPoids} setIPoids={setIPoids}
        iPhotos={[]} iPhotosBusy={false} iPhotosErreur={null}
        ajouterPhotosAjout={stub('ajouterPhotosAjout')} retirerPhotoAjout={stub('retirerPhotoAjout')} reordonnerPhotosAjout={stub('reordonnerPhotosAjout')}
        iPlateforme={iPlateforme} setIPlateforme={setIPlateforme} iSaved={false} firstItemAdded={false}
        lotManualTotal={lotManualTotal} setLotManualTotal={setLotManualTotal} lotManualItems={lotManualItems} setLotManualItems={setLotManualItems}
        lotDistributed={lotDistributed} setLotDistributed={setLotDistributed} lotDistributing={false}
        filterType={filterType} setFilterType={setFilterType} filterMarque={filterMarque} setFilterMarque={setFilterMarque}
        filterMarqueSold={filterMarqueSold} setFilterMarqueSold={setFilterMarqueSold}
        boutiquesVinted={[]} filterBoutique={filterBoutique} setFilterBoutique={setFilterBoutique} rechargerBoutiques={stub('rechargerBoutiques')}
        search={search} setSearch={setSearch} soldShowAll={soldShowAll} setSoldShowAll={setSoldShowAll}
        showAllStock={showAllStock} setShowAllStock={setShowAllStock} expandedStockId={expandedStockId} setExpandedStockId={setExpandedStockId}
        pillsExpandedSold={pillsExpandedSold} setPillsExpandedSold={setPillsExpandedSold}
        pillsExpandedStock={pillsExpandedStock} setPillsExpandedStock={setPillsExpandedStock}
        importMsg={null}
        addItemsFromVoice={stub('addItemsFromVoice')} resetVoiceFlow={() => { setVoiceStep(''); setVoiceText(''); }}
        callVoiceParse={stub('callVoiceParse')} addItem={stub('addItem')} handleLotDistribute={stub('handleLotDistribute')}
        addLotToInventory={stub('addLotToInventory')} delItem={stub('delItem')} markSold={stub('markSold')} setEditItem={setEditItem}
        handleImportFile={stub('handleImportFile')} handleExport={stub('handleExport')}
        handleIAPPurchase={stub('handleIAPPurchase')} handleIAPRestore={stub('handleIAPRestore')} triggerCheckout={stub('triggerCheckout')}
        importRef={importRef} listRef={listRef} scrollRef={scrollRef} fabTriggerRef={fabTriggerRef}
        PremiumBanner={() => null} IAPUpgradeBlock={() => null} openUpgradeModal={stub('openUpgradeModal')}
        onStepperOpenChange={stub('onStepperOpenChange')} onAddByPhoto={stub('onAddByPhoto')} onDupliquer={stub('onDupliquer')}
      />
    </Coquille>
  );
}

createRoot(document.getElementById('apercu')).render(<AppMini />);
document.fonts.ready.then(() => { window.__pret = true; });
