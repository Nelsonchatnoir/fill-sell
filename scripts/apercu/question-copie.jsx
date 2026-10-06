// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — « Déjà vendu ? » sur une copie non prouvée, sans session (06/10)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte le VRAI écran (EcranDoublons) sur les
// questions RÉELLES d'un compte, exportées de la base dans
// build/apercu/<compte>-copie.json (ignoré par git : données de la personne).
// Aucun compte, aucune écriture : aucun bouton n'est cliqué.
//
//     node scripts/apercu/capture-question-copie.mjs
import { createRoot } from 'react-dom/client';
import EcranDoublons from '../../src/annonces/EcranDoublons.jsx';

const compte = new URLSearchParams(location.search).get('compte') || 'ornella';
const r = await fetch(`/build/apercu/${compte}-copie.json`);
const { questions, items } = await r.json();
createRoot(document.getElementById('apercu')).render(
  <EcranDoublons lang="fr" items={items} doublons={questions} onClose={() => {}} onDecision={() => {}} />,
);
