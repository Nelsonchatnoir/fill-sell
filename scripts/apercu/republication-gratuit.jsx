/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, pas un module de composants : il monte et n'exporte
   rien, comme src/main.jsx. */
// ══════════════════════════════════════════════════════════════════════════
// APERÇU — la republication automatique vue par un compte GRATUIT (15/10)
// ══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Décision de Nico (point 4) : un gratuit
// entre dans l'écran, voit le tableau complet, règle ses créneaux ; seule
// l'activation mène à l'offre.
//
//     node scripts/apercu/capture-republication-gratuit.mjs
//
// Les VRAIS composants, sur l'état RÉEL d'un compte gratuit
// (republish_planifiee_etat_multi() en tant que lui, transaction READ ONLY
// annulée ; identifiants de boutique remplacés) : build/apercu-gratuit/etat.json
// (build/ est ignoré). Écrans : ligne (Stock), liste, vinted (réglages).
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { RepublicationPlanifieePlateformes, RepublicationPlanifieeReglages } from '../../src/components/RepublicationPlanifiee';
import { PLATEFORMES_PLANIFIEES } from '../../src/hooks/useRepublicationPlanifiee';
import { LigneRepublicationAuto } from '../../src/stock/Haut';
import '../../src/base.css';
import '../../src/App.redesign.css';

const donnees = await fetch('/build/apercu-gratuit/etat.json').then((r) => r.json());
const ecran = new URLSearchParams(location.search).get('ecran') || 'liste';
const m = donnees.etatMulti;
const parPf = Object.fromEntries(PLATEFORMES_PLANIFIEES.map((pf) => [pf, m?.plateformes?.find((p) => p?.platform === pf) ?? null]));
const ext = { lastSeenAt: new Date().toISOString() };
window.__evenements = [];
const noter = (e) => window.__evenements.push(e);

function Apercu() {
  const [vue, setVue] = useState(ecran);
  if (vue === 'ligne') {
    return (
      <div style={{ padding: 16, background: '#F6F7F5', minHeight: '100vh' }}>
        <LigneRepublicationAuto lang="fr" autorise={false} actif={false} onOuvrirReglages={() => { noter('ouvrir_reglages'); setVue('liste'); }} onOffres={() => noter('offres')} />
      </div>
    );
  }
  if (vue === 'liste') {
    return (
      <RepublicationPlanifieePlateformes lang="fr" etatMulti={m} parPlateforme={parPf} sessions={{}}
        interrupteur={m.interrupteur_global} extensionStatus={ext} busy={false} erreur={null}
        onOuvrirPlateforme={(pf) => { noter(`ouvrir:${pf}`); setVue(pf); }} onOuvrirHistorique={() => {}} onClose={() => {}} onPauseGenerale={() => {}}
        palierApp="gratuit" lecture="ok" onReessayer={() => {}} plateformesCompte={['vinted', 'leboncoin', 'beebs']} onOffres={(o) => noter(`offres:${o}`)} />
    );
  }
  return (
    <RepublicationPlanifieeReglages lang="fr" platform={vue} session={null} etat={parPf[vue]}
      interrupteur={m.interrupteur_global} extensionStatus={ext} busy={false} erreur={null}
      regler={async (p) => { noter(`regler:${JSON.stringify(p)}`); return { ok: false, reason: 'auto_reserve_pro' }; }}
      onClose={() => setVue('liste')} onOuvrirHistorique={() => {}} palierApp="gratuit" lecture="ok" onOffres={(o) => noter(`offres:${o}`)} />
  );
}

ReactDOM.createRoot(document.getElementById('apercu')).render(<Apercu />);
window.__pret = true;
