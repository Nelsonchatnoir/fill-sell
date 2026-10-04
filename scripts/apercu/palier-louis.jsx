/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, pas un module de composants : il monte et n'exporte
   rien, comme src/main.jsx. */
// ══════════════════════════════════════════════════════════════════════════
// APERÇU — le palier Business de Louis sur les écrans de la republication
// automatique et le haut du Stock (04/10/2026)
// ══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré (vite build n'a qu'une entrée, index.html).
//
//     node scripts/apercu/capture-palier-louis.mjs
//
// Les VRAIS composants, sur l'état RÉEL de Louis : build/apercu-palier/louis.json
// (republish_planifiee_etat_multi() appelée en tant que Louis, dans une
// transaction READ ONLY annulée — jamais commité, build/ est ignoré).
// Un écran par adresse (?ecran=…) : les écrans pleins se montent en portail
// sur toute la page, on ne peut pas en poser deux côte à côte.
//   · charge  — l'écran « Republication automatique », état lu ;
//   · lecture — le même, AVANT la réponse du serveur (l'écran de Louis le 04/10) ;
//   · echec   — le même, lecture ratée ;
//   · leboncoin — l'écran de la plateforme Leboncoin, état lu ;
//   · stock   — le haut du Stock : tuiles, « Publier plusieurs articles d'un
//               coup », ligne de la republication automatique.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RepublicationPlanifieePlateformes, RepublicationPlanifieeReglages } from '../../src/components/RepublicationPlanifiee';
import { Gestes, LignePublierEnLot, LigneRepublicationAuto } from '../../src/stock/Haut';
import { droitRepublication, plateformesPlanifieesVisibles } from '../../src/hooks/useRepublicationPlanifiee';
import { palierDuProfil } from '../../src/utils/palier';
import { CSS_STOCK } from '../../src/stock/css';
import '../../src/base.css';
import '../../src/App.redesign.css';

const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', opla: 'Opla' };
// Les drapeaux de Louis en base le 04/10 (is_premium = is_pro = is_business = true).
const PALIER_APP = palierDuProfil({ is_premium: true, is_pro: true, is_business: true });

const donnees = await fetch('/build/apercu-palier/louis.json').then((r) => r.json());
const ecran = new URLSearchParams(location.search).get('ecran') || 'charge';
const etatLu = donnees.etatMulti;
const parPf = (m) => Object.fromEntries(['vinted', 'leboncoin', 'beebs', 'opla'].map((pf) => [pf, m?.plateformes?.find((p) => p?.platform === pf) ?? null]));
const ext = { lastSeenAt: new Date().toISOString() };

function Plateformes({ m, lecture }) {
  return (
    <RepublicationPlanifieePlateformes lang="fr" etatMulti={m} parPlateforme={parPf(m)} sessions={{}}
      interrupteur={m ? m.interrupteur_global : 1} extensionStatus={ext} busy={false} erreur={null}
      onOuvrirPlateforme={() => {}} onOuvrirHistorique={() => {}} onClose={() => {}} onPauseGenerale={() => {}}
      palierApp={PALIER_APP} lecture={lecture} onReessayer={() => {}} />
  );
}

function HautStock() {
  const pfs = plateformesPlanifieesVisibles(parPf(etatLu)).filter((pf) => parPf(etatLu)[pf]?.actif === true);
  const droit = droitRepublication(etatLu, { palierApp: PALIER_APP });
  const n = donnees.stock ?? null;
  return (
    <div className="sk-racine" style={{ background: '#F6F5F1', minHeight: '100vh', padding: '24px 16px', boxSizing: 'border-box' }}>
      <style>{CSS_STOCK}</style>
      <div data-zone="gestes">
        <Gestes lang="fr" variante="tuiles"
          publier={{ n: n?.publier ?? 0, onOuvrir: () => {} }}
          remonter={{ n: n?.remonter ?? 0, onOuvrir: () => {} }}
          aRegler={{ n: n?.aRegler ?? 0, onOuvrir: () => {} }} />
      </div>
      <div data-zone="lot" style={{ marginTop: 8 }}>
        <LignePublierEnLot lang="fr" n={n?.publier ?? 0} onOuvrir={() => {}} />
      </div>
      <div data-zone="repub" style={{ marginTop: 8 }}>
        <LigneRepublicationAuto lang="fr" autorise={droit.autorise === true} actif={pfs.length > 0}
          nomsActifs={pfs.map((pf) => NOMS[pf])} busy={false}
          onBasculer={() => {}} onOuvrirReglages={() => {}} onOffres={() => {}} />
      </div>
      <div style={{ marginTop: 16, fontFamily: 'ui-monospace,monospace', fontSize: 11, color: '#6B7A75' }}>
        {n ? `Compteurs relus sur le stock de Louis (${n.lu_le}).` : 'Compteurs du Stock non relus (base indisponible) : les chiffres des tuiles sont à zéro.'}
        {` État de la republication lu le ${donnees.lu_le}.`}
      </div>
    </div>
  );
}

function Apercu() {
  if (ecran === 'charge') return <Plateformes m={etatLu} lecture="ok" />;
  if (ecran === 'lecture') return <Plateformes m={null} lecture="en_cours" />;
  if (ecran === 'echec') return <Plateformes m={null} lecture="echec" />;
  if (ecran === 'leboncoin') {
    return (
      <RepublicationPlanifieeReglages lang="fr" platform="leboncoin" session={null} etat={parPf(etatLu).leboncoin}
        interrupteur={etatLu.interrupteur_global} extensionStatus={ext} busy={false} erreur={null}
        regler={async () => ({ ok: false, reason: 'apercu' })} onClose={() => {}} onOuvrirHistorique={() => {}}
        palierApp={PALIER_APP} lecture="ok" />
    );
  }
  return <HautStock />;
}

ReactDOM.createRoot(document.getElementById('apercu')).render(<Apercu />);
window.__pret = true;
