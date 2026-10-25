// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — les maquettes de l'étape 2 du lot (25/10/2026, nuit)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré : monte la page /demo/lot (src/pages/
// MaquettesLot.jsx) SANS session ni base. Les lignes d'articles sont posées
// par le script de capture (window.__DONNEES_MAQUETTE__, lues hors dépôt) :
// aucun titre ni photo d'un compte n'est écrit dans ce fichier.
//     node scripts/apercu/capture-maquettes-lot.mjs <fichier.json>
import { createRoot } from 'react-dom/client';
import { Maquettes } from '../../src/pages/MaquettesLot.jsx';
import { marierScenario } from '../../src/pages/maquettesLotScenario.js';

const lignes = Array.isArray(window.__DONNEES_MAQUETTE__) ? window.__DONNEES_MAQUETTE__ : [];
createRoot(document.getElementById('apercu')).render(<Maquettes articles={marierScenario(lignes)} />);
