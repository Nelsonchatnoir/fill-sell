// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — l'écran Stock, AVANT et APRÈS la refonte (03/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte le VRAI StockTab de l'arbre où il
// tourne (worktree de la refonte = APRÈS, worktree de main = AVANT), dans une
// coquille qui reprend celle d'App.jsx (en-tête, zone qui défile, barre
// d'onglets), avec les props calculées comme App les calcule.
//
// LES DONNÉES : build/apercu-stock/donnees.json — le compte de Nico relu en
// LECTURE SEULE (jamais commité : build/ est ignoré). Le client Supabase est
// remplacé par scripts/apercu/faux-supabase.js : aucune requête ne quitte la
// page, toute écriture est refusée et journalisée (window.__ecrituresRefusees).
//
// LA SYNCHRONISATION est SIMULÉE : « Synchroniser » met en file des runs dans
// les données de la page (RPC servies ici), puis window.__synchro.avancer()
// les fait tourner puis aboutir. Aucun relevé réel n'est demandé.
import { createRoot } from 'react-dom/client';
import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { BarChart3, Bot, Aperture, ClipboardList, LineChart, Settings } from 'lucide-react';
import '../../src/base.css';
import '../../src/App.css';
import '../../src/App.redesign.css';
import StockTab from '../../src/tabs/StockTab.jsx';
import BrandMark from '../../src/components/BrandMark.jsx';
import PlanBadge from '../../src/components/PlanBadge.jsx';
import { searchMatch } from '../../src/utils/recherche.js';
import { marqueKey } from '../../src/utils/shared.js';
import { lireBoutiquesVinted } from '../../src/utils/vintedSync.js';
import { totalInvesti } from '../../src/utils/comptabilite.js';

// AVANT ou APRÈS : seul l'arbre de la refonte porte src/stock/.
const APRES = Object.keys(import.meta.glob('../../src/stock/regles.js')).length > 0;
window.__version = APRES ? 'apres' : 'avant';
window.__journal = [];
const noter = (...a) => window.__journal.push(a);

// mapItem d'App.jsx (non exporté) — recopié tel quel, identique avant/après.
function mapItem(v){return{id:v.id,title:v.titre,prix_achat:v.prix_achat,buy:v.prix_achat,prix_achat_inconnu:v.prix_achat_inconnu===true,sell:v.prix_vente,margin:v.margin,marginPct:v.margin_pct,statut:v.statut,date:v.date,date_ajout:v.created_at||v.date_achat||v.date,marque:v.marque||"",description:v.description||"",type:v.type||"Autre",attributs:v.attributs??null,
  typeConnu:v.type!=null&&String(v.type).trim()!=="",purchaseCosts:v.purchase_costs||0,sellingFees:v.selling_fees||0,quantite:v.quantite||1,emplacement:v.emplacement||null,plateforme:v.plateforme||null,origine:v.origine||null,photos:Array.isArray(v.photos)?v.photos:null,vinted_item_id:v.vinted_item_id||null,vinted_catalog_id:v.vinted_catalog_id??null,
  vinted_account_id:v.vinted_account_id??null,fusionne_dans:v.fusionne_dans??null,disparu_le:v.disparu_le||null,vinted_status:v.vinted_status||null,last_synced_at:v.last_synced_at||null,vinted_view_count:v.vinted_view_count??null,vinted_favourite_count:v.vinted_favourite_count??null,listed_at_guess:v.listed_at_guess||null};}

// ── LE MOTEUR DE SYNCHRO SIMULÉ ─────────────────────────────────────────────
const PLATEFORMES_RELEVE = ['leboncoin', 'ebay', 'beebs', 'opla'];
function installerSynchro(F, userId) {
  const runs = F.tables.vinted_sync_runs;
  const iso = (ms) => new Date(ms).toISOString();
  const dernierFini = (platform, kind) => runs
    .filter((r) => r.platform === platform && r.kind === kind && r.status === 'done' && r.finished_at)
    .sort((a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at))[0] ?? null;
  const nouveauRun = (platform, kind) => {
    const base = dernierFini(platform, kind);
    const r = { ...(base ?? {}), id: `apercu-${platform}-${kind}-${Date.now()}`, user_id: userId, platform, kind, status: 'queued',
      declencheur: 'manuel', queued_at: iso(Date.now()), started_at: null, finished_at: null, erreur: null, updated_at: iso(Date.now()) };
    runs.unshift(r);
    return r;
  };
  F.rpc.demander_sync_plateforme = ({ p_platform } = {}) => {
    if (p_platform === 'opla') return { data: { ok: false, reason: 'non_expose' }, error: null };
    nouveauRun(p_platform, 'annonces');
    return { data: { ok: true, reason: 'queued' }, error: null };
  };
  F.rpc.demander_sync_dressing = () => {
    nouveauRun('vinted', 'dressing');
    return { data: { ok: true, reason: 'queued' }, error: null };
  };
  window.__synchro = {
    // 'running' : tout ce qui est en file démarre, sauf une plateforme qui
    // reste en attente (on voit les deux états) ; 'done' : tout aboutit, avec
    // les compteurs du dernier relevé réussi de chaque plateforme.
    avancer(etat) {
      const enVol = runs.filter((r) => String(r.id).startsWith('apercu-') && (r.status === 'queued' || r.status === 'running'));
      enVol.forEach((r, i) => {
        if (etat === 'running') {
          if (i === enVol.length - 1 && enVol.length > 2) return;
          r.status = 'running'; r.started_at = iso(Date.now() - 5000 * (i + 1));
          if (r.platform === 'ebay') { r.status = 'done'; r.finished_at = iso(Date.now() - 2000); }
        } else if (etat === 'done') {
          r.status = 'done'; r.started_at ||= iso(Date.now() - 20000); r.finished_at = iso(Date.now());
        }
        r.updated_at = iso(Date.now());
      });
      return enVol.map((r) => `${r.platform}:${r.status}`);
    },
  };
}

async function chargerDonnees() {
  const r = await fetch('/build/apercu-stock/donnees.json', { cache: 'no-store' });
  if (!r.ok) throw new Error(`données introuvables (${r.status}) — lancer le script d'extraction`);
  const F = await r.json();
  F.rpc ||= {};
  window.__FIXTURE = F;
  installerSynchro(F, F.utilisateur.id);
  return F;
}

// ── LA COQUILLE D'App.jsx ───────────────────────────────────────────────────
function EnTete({ quotas, isPro }) {
  const n = quotas?.annonces?.restantes;
  return (
    <div className={quotas?.annonces?.plafond != null ? 'topbar topbar--solde' : 'topbar'}>
      <BrandMark onClick={() => {}} />
      {quotas?.annonces?.plafond != null && (
        <button type="button" style={{ background: 'transparent', border: 'none', padding: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center', flexShrink: 0, fontFamily: 'inherit', color: 'inherit' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.05)', color: '#10201B', fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {n}<span style={{ fontWeight: 600, opacity: 0.65 }}>{`annonce${n > 1 ? 's' : ''} restante${n > 1 ? 's' : ''}`}</span>
          </span>
        </button>
      )}
      <div className="header-centre" style={{ flex: 1 }} />
      <div className="tb-right">
        <PlanBadge isPremium isPro={isPro} isBusiness={false} onClick={() => noter('plan')} />
        <button type="button" title="Réglages" aria-label="Réglages" className="tb-icon-btn-light">
          {APRES ? <Settings size={20} strokeWidth={1.8} aria-hidden="true" /> : '⚙️'}
        </button>
      </div>
    </div>
  );
}

const TABS = [
  { Icon: BarChart3, label: 'Tableau', idx: 0 }, { Icon: Bot, label: 'Stock IA', idx: 1 },
  { Icon: Aperture, label: 'Lens', idx: 2 }, { Icon: ClipboardList, label: 'Ventes', idx: 3 }, { Icon: LineChart, label: 'Stats', idx: 4 },
];
function BarreOnglets() {
  return (
    <div className="bnav" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, justifyContent: 'center', zIndex: 50, paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 14px)' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 4, padding: '10px 10px 10px', borderRadius: 26, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(18px) saturate(1.6)', WebkitBackdropFilter: 'blur(18px) saturate(1.6)', boxShadow: '0 10px 30px -12px rgba(16,32,27,0.25)', border: '1px solid rgba(255,255,255,0.6)' }}>
        {TABS.map((onglet) => {
          const { label, idx } = onglet;
          const Icon = onglet.Icon;
          const actif = idx === 1;
          if (idx === 2) return (
            <button key={idx} type="button" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', width: 60, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' }}>
              <span style={{ position: 'absolute', top: -26, width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(155deg,#2F9E90,#1B6E62)', boxShadow: '0 6px 16px rgba(47,158,144,0.32), 0 0 0 5px #F6F5F1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={22} color="#FFFFFF" strokeWidth={1.9} />
              </span>
              <span style={{ height: 30 }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: '#8A8578' }}>{label}</span>
            </button>
          );
          return (
            <button key={idx} type="button" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 0', width: 60, background: 'none', border: 'none', fontFamily: 'inherit' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 30 }}>
                {actif && <span style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(47,158,144,0.10)' }} />}
                <Icon size={17} color={actif ? '#2F9E90' : '#A6A192'} strokeWidth={actif ? 2.1 : 1.7} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 500, color: actif ? '#2F9E90' : '#8A8578' }}>{label}</span>
              {actif && <span style={{ position: 'absolute', bottom: -3, width: 3, height: 3, borderRadius: '50%', background: '#2F9E90' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── L'APPLICATION, RÉDUITE À CE QUE LE STOCK LIT ───────────────────────────
function AppMini({ F }) {
  const profil = F.tables.profiles[0] ?? {};
  const user = F.utilisateur;
  const [items] = useState(() => F.tables.inventaire.filter((r) => r.fusionne_dans == null).map(mapItem));
  const [filterType, setFilterType] = useState('Tous');
  const [filterMarque, setFilterMarque] = useState([]);
  const [filterMarqueSold, setFilterMarqueSold] = useState('Toutes');
  const [filterBoutique, setFilterBoutique] = useState('Toutes');
  const [boutiquesVinted, setBoutiquesVinted] = useState([]);
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
  const [lotManualTotal, setLotManualTotal] = useState(''); const [lotManualItems, setLotManualItems] = useState([{ nom: '' }, { nom: '' }]);
  const [lotDistributed, setLotDistributed] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const importRef = useRef(null); const listRef = useRef(null); const scrollRef = useRef(null); const fabTriggerRef = useRef(null);
  useEffect(() => { lireBoutiquesVinted(user.id).then((r) => setBoutiquesVinted(r.boutiques ?? [])).catch(() => {}); }, [user.id]);
  useEffect(() => { window.__editItem = editItem; }, [editItem]);

  // Les dérivations d'App.jsx, au mot près (stock, vendus, filtres, tri en deux groupes).
  const stock = useMemo(() => items.filter((i) => i.statut === 'stock'), [items]);
  const sold = useMemo(() => items.filter((i) => i.statut === 'vendu'), [items]);
  const clesMarques = useMemo(() => new Set((Array.isArray(filterMarque) ? filterMarque : []).map(marqueKey)), [filterMarque]);
  const stockFiltre = useMemo(() => {
    const filtres = stock
      .filter((i) => filterType === 'Tous' || i.type === filterType)
      .filter((i) => filterBoutique === 'Toutes' || (filterBoutique === 'sans_origine' ? i.vinted_account_id == null : String(i.vinted_account_id ?? '') === filterBoutique))
      .filter((i) => !clesMarques.size || clesMarques.has(marqueKey(i.marque)))
      .filter((i) => searchMatch(i, search));
    const enLigneVinted = (i) => !!i.vinted_item_id && !i.disparu_le;
    const g1 = filtres.filter((i) => !enLigneVinted(i));
    const g2 = filtres.map((i, k) => [i, k]).filter(([i]) => enLigneVinted(i)).sort((a, b) => {
      const ta = Date.parse(a[0].listed_at_guess ?? ''); const tb = Date.parse(b[0].listed_at_guess ?? '');
      const va = Number.isFinite(ta) ? ta : Infinity; const vb = Number.isFinite(tb) ? tb : Infinity;
      if (va !== vb) return va < vb ? -1 : 1;
      return a[1] - b[1];
    }).map(([i]) => i);
    return [...g1, ...g2];
  }, [stock, filterType, clesMarques, filterBoutique, search]);
  const soldFiltre = useMemo(() => sold.filter((i) => filterType === 'Tous' || i.type === filterType)
    .filter((i) => filterMarqueSold === 'Toutes' || marqueKey(i.marque) === marqueKey(filterMarqueSold))
    .filter((i) => searchMatch(i, search)), [sold, filterType, filterMarqueSold, search]);
  const soldVisible = useMemo(() => (soldShowAll ? soldFiltre : soldFiltre.slice(0, 10)), [soldFiltre, soldShowAll]);
  const stockVisible = useMemo(() => (showAllStock ? stockFiltre : stockFiltre.slice(0, 10)), [stockFiltre, showAllStock]);
  const stockVal = useMemo(() => totalInvesti(stock), [stock]);
  const stockQty = useMemo(() => stock.reduce((a, i) => a + (i.quantite || 1), 0), [stock]);
  const soldQty = useMemo(() => sold.reduce((a, i) => a + (i.quantite || 1), 0), [sold]);

  const stub = (nom) => (...a) => { noter(nom, ...a.map((x) => (x && typeof x === 'object' ? (x.id ?? '[objet]') : x))); };
  const vaActions = useMemo(() => ({ fetchAll: async () => noter('fetchAll') }), []);
  const ouvrirModale = useCallback((...a) => noter('openUpgradeModal', ...a), []);
  const PremiumBanner = useCallback(() => null, []);
  const IAPUpgradeBlock = useCallback(() => null, []);

  return (
    <div className="app-root" style={{ height: '100dvh', overflowY: 'hidden', display: 'flex', flexDirection: 'column', overflowX: 'hidden', maxWidth: '100vw', position: 'relative' }}>
      <EnTete quotas={F.rpc.quotas_etat} isPro />
      <div className="desktop-nav" style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.06)' }} />
      <div ref={scrollRef} id="zone-defilement" className="wrap page-pad" style={{ padding: '18px 14px 16px', background: 'var(--bg)', flex: '1', overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
        <StockTab
          lang="fr" currency="EUR" isPremium isNative={false} isPro isBusiness={false}
          ouvrirModalePlafond={stub('ouvrirModalePlafond')}
          ouvrirReglagesRepublication={stub('ouvrirReglagesRepublication')}
          quotas={F.rpc.quotas_etat}
          items={items} user={user} voiceUsedToday={0}
          extensionStatus={{ lastSeenAt: profil.extension_last_seen_at ?? null, build: profil.extension_build ?? null, outdated: false }}
          extensionNeverSeen={false}
          ebayCompte={{ voieApi: true, etat: null, lu: false, voieApiReelle: true, rafraichir() {} }}
          plateformesVisibles={['vinted', 'leboncoin', 'ebay', 'beebs', 'opla']}
          plateformesOuvertes={['opla']}
          oplaMotifGrise={null}
          oplaExtensionMin={null}
          oplaRelie={false}
          iapLoading={false}
          stock={stock} sold={sold}
          stockFiltre={stockFiltre} soldFiltre={soldFiltre}
          stockVisible={stockVisible} soldVisible={soldVisible}
          stockVal={stockVal} stockQty={stockQty} soldQty={soldQty}
          voiceStep={voiceStep} setVoiceStep={setVoiceStep}
          voiceParsed={voiceParsed} setVoiceParsed={setVoiceParsed}
          voiceZoneResults={voiceZoneResults} setVoiceZoneResults={setVoiceZoneResults}
          voiceZoneOpen={voiceZoneOpen} setVoiceZoneOpen={setVoiceZoneOpen}
          vaActions={vaActions} vaStep=""
          voiceText={voiceText} setVoiceText={setVoiceText}
          voiceLoading={false} voicePlaceholderIdx={0}
          voiceError={null}
          showManualForm={showManualForm} setShowManualForm={setShowManualForm}
          manualMode={manualMode} setManualMode={setManualMode}
          iTitle={iTitle} setITitle={setITitle}
          iQuantite={iQuantite} setIQuantite={setIQuantite}
          iMarque={iMarque} setIMarque={setIMarque}
          iType={iType} setIType={setIType}
          iBuy={iBuy} setIBuy={setIBuy}
          iBuyInconnu={iBuyInconnu} setIBuyInconnu={setIBuyInconnu}
          iPurchaseCosts={iPurchaseCosts} setIPurchaseCosts={setIPurchaseCosts}
          iAlreadySold={iAlreadySold} setIAlreadySold={setIAlreadySold}
          iSell={iSell} setISell={setISell}
          iSellingFees={iSellingFees} setISellingFees={setISellingFees}
          iRememberSellingFees={iRememberSellingFees} setIRememberSellingFees={setIRememberSellingFees}
          iDesc={iDesc} setIDesc={setIDesc}
          iEmplacement={iEmplacement} setIEmplacement={setIEmplacement}
          iPhotos={[]} iPhotosBusy={false} iPhotosErreur={null}
          ajouterPhotosAjout={stub('ajouterPhotosAjout')} retirerPhotoAjout={stub('retirerPhotoAjout')} reordonnerPhotosAjout={stub('reordonnerPhotosAjout')}
          iPlateforme={iPlateforme} setIPlateforme={setIPlateforme}
          iSaved={false} firstItemAdded={false}
          lotManualTotal={lotManualTotal} setLotManualTotal={setLotManualTotal}
          lotManualItems={lotManualItems} setLotManualItems={setLotManualItems}
          lotDistributed={lotDistributed} setLotDistributed={setLotDistributed}
          lotDistributing={false}
          filterType={filterType} setFilterType={setFilterType}
          filterMarque={filterMarque} setFilterMarque={setFilterMarque}
          filterMarqueSold={filterMarqueSold} setFilterMarqueSold={setFilterMarqueSold}
          boutiquesVinted={boutiquesVinted} filterBoutique={filterBoutique}
          setFilterBoutique={setFilterBoutique} rechargerBoutiques={stub('rechargerBoutiques')}
          search={search} setSearch={setSearch}
          soldShowAll={soldShowAll} setSoldShowAll={setSoldShowAll}
          showAllStock={showAllStock} setShowAllStock={setShowAllStock}
          expandedStockId={expandedStockId} setExpandedStockId={setExpandedStockId}
          pillsExpandedSold={pillsExpandedSold} setPillsExpandedSold={setPillsExpandedSold}
          pillsExpandedStock={pillsExpandedStock} setPillsExpandedStock={setPillsExpandedStock}
          importMsg={null}
          addItemsFromVoice={stub('addItemsFromVoice')}
          resetVoiceFlow={() => { setVoiceStep(''); setVoiceText(''); }}
          callVoiceParse={stub('callVoiceParse')}
          addItem={stub('addItem')}
          handleLotDistribute={stub('handleLotDistribute')}
          addLotToInventory={stub('addLotToInventory')}
          delItem={stub('delItem')}
          markSold={stub('markSold')}
          setEditItem={setEditItem}
          handleImportFile={stub('handleImportFile')}
          handleExport={stub('handleExport')}
          handleIAPPurchase={stub('handleIAPPurchase')}
          handleIAPRestore={stub('handleIAPRestore')}
          triggerCheckout={stub('triggerCheckout')}
          importRef={importRef}
          listRef={listRef}
          scrollRef={scrollRef}
          fabTriggerRef={fabTriggerRef}
          PremiumBanner={PremiumBanner}
          IAPUpgradeBlock={IAPUpgradeBlock}
          openUpgradeModal={ouvrirModale}
          onStepperOpenChange={stub('onStepperOpenChange')}
          onAddByPhoto={stub('onAddByPhoto')}
          onDupliquer={stub('onDupliquer')}
        />
      </div>
      <BarreOnglets />
    </div>
  );
}

const racine = createRoot(document.getElementById('apercu'));
chargerDonnees()
  .then((F) => { racine.render(<AppMini F={F} />); window.__pret = true; })
  .catch((e) => { document.getElementById('apercu').textContent = `Aperçu impossible : ${e.message}`; window.__erreurChargement = String(e.message); });
// (L'inventaire est figé : l'aperçu ne le modifie jamais.)
