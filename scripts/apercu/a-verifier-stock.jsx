/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, pas un module de composants. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — les fiches « à vérifier » VISIBLES au Stock, questions par lots (15/10, P16)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Le harnais du Stock (stock-refonte.jsx,
// VRAI StockTab, faux client Supabase) avec les données FICTIVES de
// retraits-plafond-0510-donnees.js et 12 fiches fictives « à vérifier »
// (trouvées sur Leboncoin) — aucun compte réel, rien ne part.
//   node scripts/apercu/capture-a-verifier-stock.mjs
import { donneesFictives } from './retraits-plafond-0510-donnees.js';

const DONNEES = donneesFictives(Date.now());
const photo = DONNEES.tables.inventaire.find((i) => i.titre === 'Lampe de bureau vintage')?.photos ?? [];
for (let k = 0; k < 12; k += 1) {
  const n = String(k + 1).padStart(3, '0');
  DONNEES.tables.inventaire.push({
    id: `a1510000-0000-4000-8000-000000000${n}`, user_id: DONNEES.utilisateur.id, fusionne_dans: null, disparu_le: null,
    prix_achat_inconnu: false, purchase_costs: 0, selling_fees: 0, emplacement: null, plateforme: null, origine: 'releve_leboncoin',
    description: '', attributs: null, vinted_catalog_id: null, vinted_account_id: null, vinted_view_count: null, vinted_favourite_count: null,
    titre: `Article à vérifier n° ${k + 1}`, marque: '', type: 'Mode', prix_vente: 5 + k * 3, prix_achat: null, margin: null, margin_pct: null,
    statut: 'stock', quantite: 1, date: new Date().toISOString().slice(0, 10), created_at: new Date(Date.now() - k * 60000).toISOString(),
    photos: photo, a_verifier: { source: 'rapprochement_v3', platform: 'leboncoin', motif: 'titre_sans_photo' },
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
