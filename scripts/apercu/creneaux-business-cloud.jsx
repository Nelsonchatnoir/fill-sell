/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, pas un module de composants : il monte et n'exporte rien. */
// ═════════════════════════════════════════════════════════════════════════════════════════════
// APERÇU — « Republication automatique › Par créneaux » d'un compte Business + Cloud (Google) (20/11/2026 nuit)
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Le chemin RÉEL de ReglagesPage.jsx : la liste → un clic sur une plateforme → son
// écran → son interrupteur → regler (simulé ici, chaque appel noté dans window.__appels ; rien ne part au serveur).
// L'état : republish_planifiee_etat_multi() relu en tant que le compte f5fab0e0 (transaction READ ONLY annulée,
// 20/11 01:2x) — seuls les champs que l'écran lit ; aucun pseudo, aucune donnée personnelle.
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { RepublicationPlanifieePlateformes, RepublicationPlanifieeReglages } from '../../src/components/RepublicationPlanifiee';
import { PLATEFORMES_PLANIFIEES } from '../../src/hooks/useRepublicationPlanifiee';
import { palierDesDrapeaux } from '../../src/utils/palier';
import '../../src/base.css';
import '../../src/App.redesign.css';

const PALIER_APP = palierDesDrapeaux({ isPremium: true, isPro: true, isBusiness: true });
const pfLue = (platform, enLigne, ouverte = true) => ({
  platform, actif: false, autorise: true, configure: false, ouverte, moteur: 'aucun', reglage: null, legacy: null,
  palier: 'business', annonces_en_ligne: enLigne, quota_mensuel: null, faits_mois: null,
  aujourdhui: { minuit: '2026-11-19T23:00:00+00:00', crees_auto: 0, crees_total: 0, crees_compte: 0, abouties_auto: 0 },
});
const ETAT_LU = {
  palier: 'business', autorise: true, interrupteur_global: 1, actives: 0, enveloppe: { crees_compte: 0 },
  plateformes: [pfLue('vinted', 113), pfLue('leboncoin', 110), pfLue('beebs', 0), pfLue('opla', 0, false), pfLue('depop', 0)],
};
window.__appels = [];

function Reglages() {
  const [etat, setEtat] = useState(ETAT_LU);
  const [ecran, setEcran] = useState('liste');
  const parPf = Object.fromEntries(etat.plateformes.map((p) => [p.platform, p]));
  const regler = async (patch, pf) => {
    window.__appels.push({ pf, patch });
    const neuf = { ...parPf[pf], actif: patch.actif === true, configure: true, reglage: { ...patch, actif: patch.actif === true } };
    setEtat((e) => ({ ...e, plateformes: e.plateformes.map((p) => (p.platform === pf ? neuf : p)) }));
    return { ok: true, ...neuf };
  };
  if (ecran === 'liste') {
    return (
      <RepublicationPlanifieePlateformes lang="fr" etatMulti={etat} parPlateforme={parPf} sessions={{}}
        interrupteur={1} extensionStatus={null} busy={false} erreur={null}
        onOuvrirPlateforme={(pf) => setEcran(pf)} onOuvrirHistorique={() => {}} onClose={() => {}} onPauseGenerale={() => {}}
        palierApp={PALIER_APP} lecture="ok" onReessayer={() => {}} plateformesCompte={['vinted', 'leboncoin', 'beebs', 'depop']} onOffres={() => { window.__appels.push({ offres: true }); }} />
    );
  }
  if (PLATEFORMES_PLANIFIEES.includes(ecran)) {
    return (
      <RepublicationPlanifieeReglages lang="fr" platform={ecran} session={null} etat={parPf[ecran] ?? null}
        interrupteur={1} extensionStatus={null} busy={false} erreur={null} regler={regler}
        onClose={() => setEcran('liste')} onOuvrirHistorique={() => {}} palierApp={PALIER_APP} lecture="ok"
        onOffres={() => { window.__appels.push({ offres: true }); }} />
    );
  }
  return null;
}

ReactDOM.createRoot(document.getElementById('apercu')).render(<Reglages />);
window.__pret = true;
