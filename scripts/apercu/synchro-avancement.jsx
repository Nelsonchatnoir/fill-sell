/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, pas un module de composants : il monte et n'exporte
   rien, comme src/main.jsx. */
// ══════════════════════════════════════════════════════════════════════════
// APERÇU — la synchro avec sa barre, son temps restant et le rapprochement
// (07/10/2026, rattachement avant stock)
// ══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Le VRAI BlocSynchro, servi par le faux
// client Supabase (vite-stock-refonte.config.mjs) : aucune requête ne part.
//   ?etat=releves        — Leboncoin lu à 120/333, Beebs en attente
//   ?etat=rapprochement  — relevés finis, le serveur rapproche (185 annonces)
//   ?etat=fin            — démarre en rapprochement, puis tout est fini :
//                          « Ton stock est prêt » + « annonces à vérifier »
import React from 'react';
import ReactDOM from 'react-dom/client';
import BlocSynchro from '../../src/stock/BlocSynchro';
import { CSS_STOCK } from '../../src/stock/css';
import '../../src/base.css';
import '../../src/App.redesign.css';

const etat = new URLSearchParams(location.search).get('etat') || 'releves';
const U = 'aaaaaaaa-0000-4000-8000-000000000001';
const il = (min) => new Date(Date.now() - min * 60_000).toISOString();
const run = (platform, status, extra = {}) => ({
  id: `run-${platform}-${status}`, user_id: U, kind: 'annonces', platform, status, declencheur: 'bouton',
  queued_at: il(6), started_at: status === 'queued' ? null : il(5), finished_at: status === 'done' ? il(1) : null,
  items_vus: 0, items_crees: 0, items_maj: 0, total_entries: null, erreur: null, ...extra,
});
const proposition = (i) => ({
  id: `ann-${i}`, user_id: U, platform: i % 2 ? 'leboncoin' : 'beebs', listing_id: `L${i}`, url: `https://exemple.invalid/${i}`,
  titre: `Pareo blanc et rose taille M ${i}`, prix: 5, photo_url: null, statut_plateforme: 'en_ligne', vu_le: il(1),
  inventaire_id: null, ignoree_le: null, disparu_le: null,
  proposition: { inventaire_id: 1000 + i, motif: 'titre_exact', candidats: [{ inventaire_id: 1000 + i, motif: 'titre_exact' }] },
});

const avReleves = {
  ok: true, actif: true, a_verifier: 0, secondes_restantes: 260, avancement: 0.31,
  releves: [
    { platform: 'vinted', status: 'done', lues: 353, annoncees: 353 },
    { platform: 'leboncoin', status: 'running', lues: 120, annoncees: 333 },
    { platform: 'beebs', status: 'queued', lues: 0, annoncees: null },
  ],
  rapprochement: { etat: 'attente_releves', en_attente: 0, nouvelles: 0, traitees: 0 },
};
const avRapprochement = {
  ok: true, actif: true, a_verifier: 0, secondes_restantes: 48, avancement: 0.86,
  releves: [
    { platform: 'vinted', status: 'done', lues: 353, annoncees: 353 },
    { platform: 'leboncoin', status: 'done', lues: 333, annoncees: 333 },
    { platform: 'beebs', status: 'done', lues: 266, annoncees: 266 },
  ],
  rapprochement: { etat: 'decision', en_attente: 185, nouvelles: 12, traitees: 402 },
};
const avFin = {
  ok: true, actif: false, a_verifier: 3, secondes_restantes: 0, avancement: 1,
  releves: avRapprochement.releves,
  rapprochement: { etat: 'termine', en_attente: 0, nouvelles: 0, traitees: 599 },
};

const tablesDe = (e) => ({
  vinted_sync_runs: e === 'releves'
    ? [run('leboncoin', 'running', { items_vus: 120 }), run('beebs', 'queued'),
       { ...run('vinted', 'done', { items_vus: 353 }), kind: 'dressing', platform: 'vinted' }]
    : [run('leboncoin', 'done', { items_vus: 333, total_entries: 333 }), run('beebs', 'done', { items_vus: 266, total_entries: 266 }),
       { ...run('vinted', 'done', { items_vus: 353 }), kind: 'dressing', platform: 'vinted' }],
  annonces_plateforme: e === 'releves' ? [] : [1, 2, 3].map(proposition),
  profiles: [{ id: U, platform_settings: { plateformes_vendeur: ['vinted', 'leboncoin', 'beebs'] }, extension_sessions: {} }],
});
window.__FIXTURE = {
  tables: tablesDe(etat),
  rpc: {
    synchro_avancement: () => ({ data: window.__avancement ?? (etat === 'releves' ? avReleves : avRapprochement), error: null }),
    annonces_en_rangement: [],
    releves_vides_signales: [],
  },
};
// ?etat=fin : la page passe à la fin quand le harnais le demande.
window.__finir = () => { window.__avancement = avFin; window.__FIXTURE.tables = tablesDe('fin'); };

function Apercu() {
  return (
    <div className="sk-racine" style={{ background: '#FAFBFB', minHeight: '100vh', padding: '24px 16px', boxSizing: 'border-box' }}>
      <style>{CSS_STOCK}</style>
      <div data-zone="bloc">
        <BlocSynchro lang="fr" user={{ id: U, email: 'apercu@fillsell.invalid' }} ouvert items={[]}
          plateformes={['leboncoin', 'beebs']} extensionStatus={{ lastSeenAt: new Date().toISOString() }}
          etatVinted={null} alertes={[]} aFaire={<div style={{ fontSize: 12 }}>(gestes)</div>} />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('apercu')).render(<Apercu />);
document.fonts.ready.then(() => { window.__pret = true; });
