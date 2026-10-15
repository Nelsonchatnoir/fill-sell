/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, pas un module de composants. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — le parcours d'un compte GRATUIT juste après sa synchro (15/10, P17)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. RÉUTILISE le harnais du Stock tel quel
// (stock-refonte.jsx : coquille d'App.jsx + VRAI StockTab, faux client
// Supabase) avec les données FICTIVES de retraits-plafond-0510-donnees.js et
// des compteurs gratuits : 2 articles et 3 republications encore offerts ce
// mois-ci — aucun compte réel, rien ne part, toute écriture est refusée.
//
//   node scripts/apercu/capture-parcours-gratuit.mjs
import { donneesFictives } from './retraits-plafond-0510-donnees.js';

const DONNEES = donneesFictives(Date.now());
const remise = new Date(Date.now() + 20 * 86400000).toISOString();
DONNEES.rpc.quotas_etat = {
  palier: 'free',
  annonces: { restantes: 2, plafond: 5, remise_le: remise },
  republication: { restantes: 3, plafond: 50, remise_le: remise },
};
window.__donneesFictives = DONNEES;
const fetchOrigine = window.fetch.bind(window);
window.fetch = (entree, init) => {
  const u = typeof entree === 'string' ? entree : entree?.url;
  if (u && u.includes('/build/apercu-stock/donnees.json')) {
    return Promise.resolve(new Response(JSON.stringify(DONNEES), { status: 200, headers: { 'content-type': 'application/json' } }));
  }
  return fetchOrigine(entree, init);
};

await import('./stock-refonte.jsx');
