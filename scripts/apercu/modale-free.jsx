/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, jamais livré (vite build n'a qu'une entrée). */
// APERÇU (06/10 soir) — la VRAIE ConversionModal, comme App.jsx l'ouvre au
// clic « Republication automatique » d'un compte Free : trigger
// republish_auto, repubOffertes du serveur (50/50, remise le 16/10), stock
// lu dans l'adresse (?stock=0|5). Faux client Supabase (aucun réseau).
// Les appels d'achat sont relevés dans window.__appels (jamais lancés).
import React from 'react';
import ReactDOM from 'react-dom/client';
import ConversionModal from '../../src/components/ConversionModal';
import '../../src/base.css';
import '../../src/App.redesign.css';

const params = new URLSearchParams(location.search);
const stock = params.has('stock') ? Number(params.get('stock')) : null;
window.__appels = [];
function Apercu() {
  return (
    <ConversionModal
      isOpen
      onClose={() => window.__appels.push(['fermer'])}
      onUpgrade={(tier, opts) => window.__appels.push(['upgrade', tier, opts ?? null])}
      trigger="republish_auto"
      lang="fr"
      isPremium={false} isPro={false} isBusiness={false}
      userId="apercu-free-0000"
      itemCount={stock}
      origine="republication_auto"
      repubOffertes={{ restantes: 50, plafond: 50, remise_le: '2026-10-16T00:00:00+00:00' }}
    />
  );
}
ReactDOM.createRoot(document.getElementById('apercu')).render(<Apercu />);
