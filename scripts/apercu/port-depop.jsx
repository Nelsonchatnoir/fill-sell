// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — frais de port Depop (09/10/2026 soir) : le champ et la feuille
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte les composants RÉELS (CartePortDepop
// de « Confirmer », ChampPortDepop, FeuilleEnvoiSuivi) dans le VRAI CSS du
// stepper (stepper.css, .fsn) — sans session, sans réseau (faux client
// Supabase de vite-modale-free.config.mjs : aucune écriture ne part).
//
//   ?scene=vide     champ sans prix par défaut (à remplir avant l'envoi)
//   ?scene=defaut   champ pré-rempli avec le prix par défaut
//   ?theme=dark     le thème sombre de la feuille et du champ
//
//     node scripts/apercu/capture-port-depop.mjs
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../../src/publication/stepper.css';
import { CartePortDepop, ChampPortDepop } from '../../src/components/PortDepop.jsx';
import { lirePortSaisi } from '../../src/utils/fraisPortDepop.js';

const q = new URLSearchParams(location.search);
const scene = q.get('scene') ?? 'vide';
const sombre = q.get('theme') === 'dark';
if (sombre) document.documentElement.setAttribute('data-theme', 'dark');

function Stepper() {
  const [saisie, setSaisie] = useState(scene === 'defaut' ? '4,50' : '');
  const manquant = lirePortSaisi(saisie).valeur == null;
  const m = {
    lang: 'fr', userId: null,
    portDepop: { visee: true, saisie, manquant, defaut: scene === 'defaut' ? 4.5 : null, poser: setSaisie },
  };
  return (
    <div className="fsn" style={{ position: 'static', minHeight: '100dvh', overflow: 'visible' }}>
      <div className="fsn-top"><div className="fsn-col">
        <button type="button" className="fsn-back" aria-label="Retour">‹</button>
        <div className="fsn-top-title">Confirmer</div>
        <div className="fsn-top-step num">3 / 3</div>
        <button type="button" className="fsn-quit">Quitter</button>
      </div></div>
      <div className="fsn-scroll" style={{ overflow: 'visible' }}><div className="fsn-col" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
        <div className="fsn-card fsn-card--info"><div className="fsn-card-t">Partira sur Vinted et Depop</div>
          <div className="fsn-card-p">Après ton clic, la publication se fait dans Chrome sur ton ordinateur, toute seule.</div></div>
        <CartePortDepop m={m} />
      </div></div>
      <div className="fsn-foot"><div className="fsn-col">
        <button type="button" className="fsn-btn" disabled={manquant} style={{ width: '100%' }}>{manquant ? 'Publier' : 'Publier sur 2 plateformes'}</button>
        {manquant && <p className="fsn-hint">Avant de publier, il reste : Frais de port Depop à indiquer</p>}
      </div></div>
    </div>
  );
}

function Sombre() {
  const [saisie, setSaisie] = useState(scene === 'defaut' ? '4,50' : '');
  return (
    <div style={{ minHeight: '100dvh', background: '#0F1714', padding: 16, boxSizing: 'border-box' }}>
      <div className="fpd" style={{ background: '#17211E', border: '1px solid rgba(255,255,255,.10)', borderRadius: 16, padding: 14 }}>
        <ChampPortDepop lang="fr" id="port-depop-sombre" valeur={saisie} onChange={setSaisie} montrerVide={scene === 'vide'} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('apercu')).render(sombre ? <Sombre /> : <Stepper />);
