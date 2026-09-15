/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, pas un module de composants : il monte et n'exporte
   rien, comme src/main.jsx. */
// ══════════════════════════════════════════════════════════════════════════
// APERÇU — la rangée de sélection des plateformes, avec et sans le drapeau
// ══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré (vite build n'a qu'une entrée, index.html).
//
//     node scripts/apercu/capture-opla.mjs
//
// Il monte le VRAI StepPhotos de ListingPreviewScreen, avec la vraie prop
// `plateformesAVenir` — celle que l'app calcule depuis
// profiles.plateformes_visibles. Deux colonnes, côte à côte :
//   · le compte SANS drapeau : quatre plateformes, écran strictement d'avant ;
//   · le compte AVEC : Opla en cinquième, grisée, non cochable, et la phrase.

import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { StepPhotos } from '../../src/components/ListingPreviewScreen';
import '../../src/base.css';
import '../../src/App.redesign.css';

// Une photo de 1×1 transparente : StepPhotos veut une liste non vide pour
// rendre sa grille, le contenu n'a aucune importance ici.
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function Colonne({ legende, plateformesAVenir }) {
  const [selected, setSelected] = useState(new Set(['vinted', 'leboncoin', 'beebs']));
  const [photoOption, setPhotoOption] = useState('none');
  const [background, setBackground] = useState(null);
  return (
    <div style={{ width: 390, flexShrink: 0 }}>
      <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, fontWeight: 700, color: '#10201B', padding: '10px 4px' }}>
        {legende}
      </div>
      <div style={{ background: '#FFFFFF', border: '1px solid #E7E3D8', borderRadius: 18, padding: 16, boxSizing: 'border-box' }}>
        <StepPhotos
          photos={[PIXEL, PIXEL, PIXEL]}
          onAddPhotos={() => {}}
          onRemovePhoto={() => {}}
          onReorderPhotos={() => {}}
          onPhotoClick={() => {}}
          photoOption={photoOption}
          setPhotoOption={setPhotoOption}
          background={background}
          setBackground={setBackground}
          selected={selected}
          setSelected={setSelected}
          coinPrices={{ per_platform: 0, none: 0 }}
          platformSupport={{ vinted: 'supported', leboncoin: 'supported', beebs: 'supported', ebay: 'supported' }}
          publishedSet={new Set()}
          queuedSet={new Set()}
          plateformesAVenir={plateformesAVenir}
          lang="fr"
        />
      </div>
    </div>
  );
}

function Apercu() {
  return (
    <div style={{ display: 'flex', gap: 28, padding: 24, alignItems: 'flex-start', background: '#F6F5F1', minHeight: '100vh' }}>
      <Colonne legende="1 · compte SANS drapeau — l'écran d'avant, à l'identique" plateformesAVenir={[]} />
      <Colonne legende="2 · compte AVEC « opla » — visible, grisée, non cochable" plateformesAVenir={['opla']} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('apercu')).render(
  <React.StrictMode><Apercu /></React.StrictMode>,
);
