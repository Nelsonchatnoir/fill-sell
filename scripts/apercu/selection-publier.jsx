/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, pas un module de composants. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — choisir DANS le Stock, filtre gardé, les articles à publier (11/10)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. RÉUTILISE le harnais du Stock tel quel
// (stock-refonte.jsx : coquille d'App.jsx + VRAI StockTab, faux client
// Supabase) avec les données FICTIVES de retraits-plafond-0510-donnees.js —
// aucun compte réel, rien ne part, toute écriture est refusée et journalisée.
//
//   node scripts/apercu/capture-selection-publier.mjs
import { donneesFictives } from './retraits-plafond-0510-donnees.js';

const DONNEES = donneesFictives(Date.now());
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
