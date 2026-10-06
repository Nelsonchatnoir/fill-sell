// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — « Synchroniser » Vinted, canal direct MUET (06/10, cas Laura)
// ═══════════════════════════════════════════════════════════════════════════
// Monte le VRAI VintedDressingSync (StockTab.jsx) sur le faux client Supabase
// (vite-stock-refonte.config.mjs). L'extension « vient d'être installée » :
// elle répond au ping (0.6.100) mais n'exécute JAMAIS la commande directe
// SYNC_DRESSING — le canal muet de Laura. La file serveur, elle, marche :
// demander_sync_dressing pose une ligne 'queued', que « l'ordinateur » prend
// 3 s plus tard puis termine (?cas=muet : 61 annonces ; ?cas=sans_session :
// relevé arrêté faute de session Vinted, texte réel de l'extension 0.6.100).
// ⛔ Outil de relecture : rien ne part, rien ne s'écrit.
import { createRoot } from 'react-dom/client';
import '../../src/base.css';
import '../../src/App.css';
import { VintedDressingSync } from '../../src/tabs/StockTab.jsx';

const CAS = new URLSearchParams(location.search).get('cas') || 'muet';
const U = '11111111-2222-3333-4444-555555555555';
const runs = [];
window.__commandesDirectes = 0;
window.__FIXTURE = {
  utilisateur: { id: U, email: 'test@fillsell.app' },
  tables: {
    profiles: [{ id: U, extension_last_seen_at: new Date().toISOString(), extension_version: '0.6.100', extension_sessions: null, vinted_sync_pin: null }],
    vinted_sync_runs: runs,
  },
  rpc: {
    demander_sync_dressing: () => {
      const id = `run-${runs.length + 1}`;
      const t = new Date().toISOString();
      runs.push({ id, user_id: U, kind: 'dressing', status: 'queued', declencheur: 'bouton_distant', started_at: t, queued_at: t, finished_at: null, items_vus: 0, total_entries: null, erreur: null });
      const r = runs[runs.length - 1];
      setTimeout(() => { r.status = 'running'; r.claimed_at = new Date().toISOString(); r.items_vus = 12; r.total_entries = 61; }, 3000);
      setTimeout(() => {
        r.finished_at = new Date().toISOString();
        if (CAS === 'sans_session') {
          r.status = 'failed'; r.items_vus = 0;
          r.erreur = '[pas_connecte] [cause403] session_absente — aucune session Vinted dans ce navigateur (HTTP 403 sur la sonde) : rien n\'a été lu.';
        } else { r.status = 'done'; r.items_vus = 61; r.total_entries = 61; r.erreur = 'item_count=61'; }
      }, 6000);
      return { data: { ok: true, reason: 'queued', id }, error: null };
    },
    purger_ma_sync_queue: null,
  },
};
// L'extension : présente (répond au ping), MUETTE sur la commande directe.
window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (e.data?.__fillsellPing) window.postMessage({ __fillsellExt: true, version: '0.6.100' }, location.origin);
  if (e.data?.__fillsellCmd === 'SYNC_DRESSING') window.__commandesDirectes += 1;
});

createRoot(document.getElementById('apercu')).render(
  <VintedDressingSync lang="fr" user={{ id: U }} isNative={false} extensionStatus={null}
    source="stock_empty" onDone={() => { window.__fini = true; }} />,
);
window.__pret = true;
