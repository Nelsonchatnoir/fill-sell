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
// (12/10, A1) ?nombre=N : N articles FICTIFS de plus, jamais publiés — un lot
// au-delà de l'ancien plafond de 20 (capture-lot-sans-plafond.mjs).
const photoFictive = DONNEES.tables.inventaire.find((i) => i.titre === 'Lampe de bureau vintage')?.photos ?? [];
const nombre = Math.min(500, Math.max(0, Number(new URLSearchParams(location.search).get('nombre')) || 0));
for (let k = 0; k < nombre; k += 1) {
  const n = String(k + 1).padStart(3, '0');
  DONNEES.tables.inventaire.push({
    id: `a1210000-0000-4000-8000-000000000${n}`, user_id: DONNEES.utilisateur.id, fusionne_dans: null, disparu_le: null,
    prix_achat_inconnu: false, purchase_costs: 0, selling_fees: 0, emplacement: null, plateforme: null, origine: null,
    description: '', attributs: null, vinted_catalog_id: null, vinted_account_id: null, vinted_view_count: null, vinted_favourite_count: null,
    titre: `Article fictif n° ${k + 1}`, marque: '', type: 'Mode', prix_vente: 10 + (k % 30), prix_achat: 3, margin: 7 + (k % 30), margin_pct: 50,
    statut: 'stock', quantite: 1, date: new Date().toISOString().slice(0, 10), created_at: new Date(Date.now() - k * 60000).toISOString(),
    photos: photoFictive,
  });
}
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
