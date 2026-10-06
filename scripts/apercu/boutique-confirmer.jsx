// ═══════════════════════════════════════════════════════════════════════════
// BANC — « Synchroniser » face à une boutique Vinted à confirmer (06/10)
// ═══════════════════════════════════════════════════════════════════════════
// Monte le VRAI bloc du Stock (BlocSynchro) avec la VRAIE ligne Vinted
// (VintedDressingSync, montée cachée comme dans StockTab) sur le faux client
// Supabase. Le compte est dans l'état de nerema75 : il suit @narema75 et
// @jcassou, Chrome est sur @celineetmarie, le dernier relevé s'est arrêté sur
// « [boutique_a_confirmer] ».
// La fausse extension se comporte comme la 0.6.100 : une boutique absente de
// la liste → aucun relevé (question) ; présente → relevé réussi.
//   ?cas=web_ajouter | web_pas_la_mienne | mobile_ajouter | mobile_pas_la_mienne
//        | normal_une | normal_multi | autres_plateformes
// ⛔ Outil de relecture : rien ne part, les écritures restent en mémoire.
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/base.css';
import '../../src/App.css';
import { VintedDressingSync } from '../../src/tabs/StockTab.jsx';
import BlocSynchro from '../../src/stock/BlocSynchro.jsx';

const CAS = new URLSearchParams(location.search).get('cas') || 'web_ajouter';
const MOBILE = CAS.startsWith('mobile');
const U = '11111111-2222-3333-4444-555555555555';
const NAREMA = { user_id: '295151754', login: 'narema75', source: 'pose_manuelle', ajoute_le: '2026-09-03T10:00:00Z' };
const JCASSOU = { user_id: '32977976', login: 'jcassou', source: 'confirmation_app', ajoute_le: '2026-09-20T16:38:00Z' };
const CELINE = { user_id: '36325065', login: 'celineetmarie' };
const ilYa = (min) => new Date(Date.now() - min * 60_000).toISOString();

const question = !CAS.startsWith('normal') && CAS !== 'autres_plateformes';
const boutiques = CAS === 'normal_une' ? [NAREMA] : [NAREMA, JCASSOU];
// Ce que Chrome a ouvert MAINTENANT.
const connectee = question ? CELINE : (CAS === 'normal_multi' ? JCASSOU : NAREMA);
const runs = question
  ? [{
    id: 'run-q', user_id: U, kind: 'dressing', platform: 'vinted', status: 'failed', declencheur: 'bouton',
    started_at: ilYa(6), finished_at: ilYa(6), items_vus: 0, total_entries: null,
    vinted_user_id: CELINE.user_id, vinted_login: CELINE.login,
    erreur: "[boutique_a_confirmer] Ce navigateur est connecté au dressing @celineetmarie — ce compte FillSell suit @narema75, @jcassou. Rien n'a été importé. Confirme la boutique dans l'app (carte « Actualiser mon dressing ») ou change de compte Vinted dans Chrome, puis relance.",
  }]
  : [{
    id: 'run-ok', user_id: U, kind: 'dressing', platform: 'vinted', status: 'done', declencheur: 'bouton',
    started_at: ilYa(90), finished_at: ilYa(89), items_vus: 14, total_entries: 14,
    vinted_user_id: connectee.user_id, vinted_login: connectee.login, erreur: 'item_count=14',
  }];
const profil = {
  id: U, extension_last_seen_at: ilYa(1), extension_version: '0.6.100', extension_sessions: null,
  vinted_sync_pin: { v: 2, a_confirmer: false, boutiques },
  platform_settings: { plateformes_vendeur: CAS === 'autres_plateformes' ? ['vinted', 'leboncoin'] : ['vinted'] },
};

// Le relevé, tel que l'extension 0.6.100 le mène : la garde d'identité d'abord.
function releve(r) {
  const pin = profil.vinted_sync_pin?.boutiques ?? [];
  const suivie = pin.some((b) => String(b.user_id) === String(connectee.user_id));
  r.vinted_user_id = connectee.user_id; r.vinted_login = connectee.login;
  setTimeout(() => { r.status = 'running'; r.claimed_at = new Date().toISOString(); r.items_vus = 3; r.total_entries = 9; }, 1200);
  setTimeout(() => {
    r.finished_at = new Date().toISOString();
    if (suivie) { r.status = 'done'; r.items_vus = 9; r.total_entries = 9; r.erreur = 'item_count=9'; window.__releveReussi = (window.__releveReussi ?? 0) + 1; }
    else { r.status = 'failed'; r.items_vus = 0; r.erreur = `[boutique_a_confirmer] Ce navigateur est connecté au dressing @${connectee.login}. Rien n'a été importé.`; }
  }, 2600);
}

window.__commandesDirectes = 0;
window.__FIXTURE = {
  utilisateur: { id: U, email: 'test@fillsell.app' },
  ecritures: { profiles: true, usage_logs: true },
  tables: {
    profiles: [profil],
    vinted_sync_runs: runs,
    usage_logs: [],
    annonces_plateforme: [],
  },
  rpc: {
    demander_sync_dressing: () => {
      const r = { id: `run-${runs.length + 1}`, user_id: U, kind: 'dressing', platform: 'vinted', status: 'queued', declencheur: 'bouton_distant', started_at: new Date().toISOString(), queued_at: new Date().toISOString(), finished_at: null, items_vus: 0, total_entries: null, erreur: null };
      runs.unshift(r);
      releve(r);
      return { data: { ok: true, reason: 'queued', id: r.id }, error: null };
    },
    demander_sync_plateforme: (a) => {
      window.__relevesPlateforme = [...(window.__relevesPlateforme ?? []), a?.p_platform ?? a?.platform ?? '?'];
      return { data: { ok: true, reason: 'queued' }, error: null };
    },
    purger_ma_sync_queue: null,
  },
};
// La fausse extension : sur ordinateur seulement (un téléphone n'en a pas).
if (!MOBILE) {
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data?.__fillsellPing) window.postMessage({ __fillsellExt: true, version: '0.6.100' }, location.origin);
    if (e.data?.__fillsellCmd === 'SYNC_DRESSING') {
      window.__commandesDirectes += 1;
      // 0.6.100 : boutique encore à confirmer et toujours ouverte → AUCUN relevé.
      const pin = profil.vinted_sync_pin?.boutiques ?? [];
      const encoreAConfirmer = runs[0]?.status === 'failed' && /boutique_a_confirmer/.test(runs[0]?.erreur ?? '')
        && !pin.some((b) => String(b.user_id) === String(connectee.user_id));
      if (encoreAConfirmer) return;
      const r = { id: `run-${runs.length + 1}`, user_id: U, kind: 'dressing', platform: 'vinted', status: 'running', declencheur: 'bouton', started_at: new Date().toISOString(), finished_at: null, items_vus: 0, total_entries: null, erreur: null };
      runs.unshift(r);
      releve(r);
    }
  });
}

export default function Banc() {
  const lancerRef = useRef(null);
  const [etatVinted, setEtatVinted] = useState(null);
  const ext = { lastSeenAt: ilYa(1), build: '2026-10-06T06:11:17Z+2b883ef', outdated: false };
  const ligne = (
    <VintedDressingSync lang="fr" user={{ id: U }} isNative={MOBILE} extensionStatus={ext}
      source="stock_liste" boutiquesVinted={profil.vinted_sync_pin.boutiques} rechargerBoutiques={() => {}}
      onDone={() => { window.__fini = (window.__fini ?? 0) + 1; }}
      variante="ligne" registerLancer={(fn) => { lancerRef.current = fn; }} registerEtat={setEtatVinted} />
  );
  return (
    <BlocSynchro lang="fr" user={{ id: U, email: 'test@fillsell.app' }} isNative={MOBILE} items={[]} ouvert
      extensionStatus={ext} plateformes={CAS === 'autres_plateformes' ? ['leboncoin'] : []}
      lancerVinted={() => { try { lancerRef.current?.(); } catch { /* dit par la ligne */ } }}
      etatVinted={etatVinted} ligneVinted={ligne} alertes={[]} />
  );
}

createRoot(document.getElementById('apercu')).render(<Banc />);
window.__pret = true;
