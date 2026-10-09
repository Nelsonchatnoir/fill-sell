/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu (captures du site), jamais livré. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU SITE — la republication automatique par créneaux (09/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de CAPTURES pour le site vitrine, jamais livré. Monte le VRAI écran de
// réglage d'une plateforme (RepublicationPlanifieeReglages), ouvert dans
// l'app depuis Réglages › Republication automatique, avec l'état servi par
// site-donnees-demo.js (republicationAutoDemo : Vinted, soir 19 h – 22 h, tous
// les jours, annonces en ligne depuis plus de 14 jours). Aucune écriture :
// `regler` est un stub qui journalise.
//
//   site-republication.html?plateforme=vinted
import { createRoot } from 'react-dom/client';
import '../../src/base.css';
import '../../src/App.css';
import '../../src/App.redesign.css';
import { RepublicationPlanifieeReglages } from '../../src/components/RepublicationPlanifiee.jsx';
import { donneesDemo, republicationAutoDemo } from './site-donnees-demo.js';

const plateforme = new URLSearchParams(location.search).get('plateforme') || 'vinted';
const MAINTENANT = Date.now(); // lu une fois, au chargement (jamais pendant un rendu)
const D = donneesDemo(MAINTENANT);
const EXTENSION_VUE_LE = new Date(MAINTENANT - 70_000).toISOString();
window.__FIXTURE = { utilisateur: D.utilisateur, tables: D.tables, rpc: D.rpc };
window.__journal = [];
const etat = republicationAutoDemo(MAINTENANT).plateformes.find((p) => p.platform === plateforme);

function Reglages() {
  return (
    <RepublicationPlanifieeReglages lang="fr" platform={plateforme} session={null} etat={etat} interrupteur={1}
      extensionStatus={{ lastSeenAt: EXTENSION_VUE_LE }} busy={false} erreur={null}
      regler={(p, pf) => { window.__journal.push(['regler', pf, p]); return Promise.resolve({ ok: false, reason: 'apercu' }); }}
      onClose={() => {}} onOuvrirHistorique={() => {}} palierApp="pro" lecture="ok" />
  );
}

createRoot(document.getElementById('apercu')).render(<Reglages />);
document.fonts.ready.then(() => { window.__pret = true; });
