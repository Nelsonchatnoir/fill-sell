/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, pas un module de composants : il monte et n'exporte
   rien, comme src/main.jsx. */
// ══════════════════════════════════════════════════════════════════════════
// APERÇU — la republication automatique Depop dans l'app (10/10/2026)
// ══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré (vite build n'a qu'une entrée, index.html).
//
//     node scripts/apercu/capture-republication-auto-depop.mjs
//
// Les VRAIS composants, sur l'état RÉEL de Nico : build/apercu-depop/nico.json
// (republish_planifiee_etat_multi() appelée en tant que Nico, transaction READ
// ONLY annulée — jamais commité, build/ est ignoré). Les plateformes proposées
// au compte viennent de la VRAIE règle (etatBascule → plateformesDuCompte),
// à l'horloge d'après la bascule du 10/10, pour deux extensions :
//   · liste     — extension 0.6.106 : la ligne Depop est là ;
//   · liste105  — extension 0.6.105 : pas de ligne Depop ;
//   · active    — le même état, Depop ACTIVE (réglage de la preuve du 10/10 :
//                 9h45–11h45, plafond 1) — seul le drapeau `actif` est posé ici ;
//   · depop     — l'écran de la plateforme Depop (réglages), état lu.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RepublicationPlanifieePlateformes, RepublicationPlanifieeReglages } from '../../src/components/RepublicationPlanifiee';
import { PLATEFORMES_PLANIFIEES } from '../../src/hooks/useRepublicationPlanifiee';
import { plateformesDuCompte } from '../../src/utils/stockFiltres';
import { etatBascule } from '../../src/utils/basculeOplaDepop';
import { palierDuProfil } from '../../src/utils/palier';
import '../../src/base.css';
import '../../src/App.redesign.css';

const PALIER_APP = palierDuProfil({ is_premium: true, is_pro: true });
const donnees = await fetch('/build/apercu-depop/nico.json').then((r) => r.json());
const ecran = new URLSearchParams(location.search).get('ecran') || 'liste';
const APRES_BASCULE = Date.parse('2026-10-10T08:00:00Z');
const compte = (version) => plateformesDuCompte(etatBascule({
  maintenant: APRES_BASCULE, interrupteur: 1791583200, depopAutoriseServeur: true, versionsExtension: [version],
}).plateformesOuvertes);

const avecDepopActive = (m) => ({
  ...m,
  actives: (m.actives ?? 0) + 1,
  plateformes: m.plateformes.map((p) => (p.platform === 'depop'
    ? { ...p, actif: true, reglage: { ...(p.reglage ?? {}), actif: true, creneau: 'perso', de: '09:45', a: '11:45', plafond_jour: 1, age_jours: 7 } }
    : p)),
});
const parPf = (m) => Object.fromEntries(PLATEFORMES_PLANIFIEES.map((pf) => [pf, m?.plateformes?.find((p) => p?.platform === pf) ?? null]));
const ext = { lastSeenAt: new Date().toISOString() };

function Plateformes({ m, version }) {
  return (
    <RepublicationPlanifieePlateformes lang="fr" etatMulti={m} parPlateforme={parPf(m)} sessions={{}}
      interrupteur={m.interrupteur_global} extensionStatus={ext} busy={false} erreur={null}
      onOuvrirPlateforme={() => {}} onOuvrirHistorique={() => {}} onClose={() => {}} onPauseGenerale={() => {}}
      palierApp={PALIER_APP} lecture="ok" onReessayer={() => {}} plateformesCompte={compte(version)} />
  );
}

function Apercu() {
  const m = donnees.etatMulti;
  if (ecran === 'liste') return <Plateformes m={m} version="0.6.106" />;
  if (ecran === 'liste105') return <Plateformes m={m} version="0.6.105" />;
  if (ecran === 'active') return <Plateformes m={avecDepopActive(m)} version="0.6.106" />;
  return (
    <RepublicationPlanifieeReglages lang="fr" platform="depop" session={null} etat={parPf(m).depop}
      interrupteur={m.interrupteur_global} extensionStatus={ext} busy={false} erreur={null}
      regler={async () => ({ ok: false, reason: 'apercu' })} onClose={() => {}} onOuvrirHistorique={() => {}}
      palierApp={PALIER_APP} lecture="ok" />
  );
}

ReactDOM.createRoot(document.getElementById('apercu')).render(<Apercu />);
window.__pret = true;
