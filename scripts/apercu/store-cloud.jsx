/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu (visuels des stores, 06/11/2026), jamais livré. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU STORES — FillSell Cloud : l'écran « Me connecter » d'un compte en marche
// ═══════════════════════════════════════════════════════════════════════════
// Le VRAI composant (src/cloud/MeConnecterCloud.jsx), servi par le faux client
// Supabase (vite-stock-refonte.config.mjs : aucune requête ne part). Compte de
// démonstration « Camille » : plateformes connectées dans son navigateur Cloud,
// eBay relié par l'API (réponse servie par la capture), l'exécutant en marche.
// En anglais (?lang=en) : Leboncoin et Beebs ne sont pas montrés.
import { createRoot } from 'react-dom/client';
import '../../src/base.css';
import '../../src/App.redesign.css';
import MeConnecterCloud from '../../src/cloud/MeConnecterCloud.jsx';
import { UID_DEMO, EMAIL_DEMO } from './site-donnees-demo.js';
import { LANG, EN, PF_MASQUEES_EN } from './store-langue.js';

const M = 60_000;
const H = 60 * M;
const now = Date.now();
const iso = (t) => new Date(t).toISOString();
const connecte = { connecte: true, le: iso(now - 3 * 24 * H) };
window.__FIXTURE = {
  utilisateur: { id: UID_DEMO, email: EMAIL_DEMO },
  tables: { profiles: [{ id: UID_DEMO, platform_settings: {}, cloud_voie: true }] },
  rpc: {
    cloud_coffre_etat_moi: { vinted: connecte, leboncoin: connecte, beebs: connecte, depop: connecte },
    cloud_executant_moi: {
      poste: { etat: 'actif', demarre_le: iso(now - 9 * H) },
      derniere_action: { action: 'republish', plateforme: 'vinted', statut: 'done', le: iso(now - 4 * M) },
      dernier_releve: { plateforme: 'depop', le: iso(now - 11 * M) },
    },
  },
};
window.__journal = [];

createRoot(document.getElementById('apercu')).render(
  <div style={{ minHeight: '100vh', background: '#F6F5F1' }}>
    <MeConnecterCloud userId={UID_DEMO} lang={LANG} onFermer={() => {}} plateformesFermees={EN ? PF_MASQUEES_EN : []} />
  </div>,
);
document.fonts.ready.then(() => { window.__pret = true; });
