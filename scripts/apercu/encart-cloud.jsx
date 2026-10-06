// ══════════════════════════════════════════════════════════════════════════
// APERÇU — l'encart « Bientôt : FillSell Cloud » dans la feuille des offres (06/10/2026)
// ══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré (vite build n'a qu'une entrée, index.html).
//
//     node scripts/apercu/capture-encart-cloud.mjs
//
// La VRAIE feuille des offres (ConversionModal), pour un compte ORDINAIRE (ni
// témoin, drapeau Cloud baissé : le vrai config/cloudOffer.js). L'état Cloud du
// compte est lu par la VRAIE requête (useCloudProfil) sur le faux client
// Supabase (faux-supabase.js : aucun réseau, écritures refusées).
//   ?profil=libre  → compte sans option : l'encart se montre ;
//   ?profil=cloud  → compte qui a l'option : l'encart est masqué (la feuille
//                    d'avant, mesurée pour comparer) ;
//   ?palier=free|premium · ?lang=fr|en
import React from 'react';
import ReactDOM from 'react-dom/client';
import ConversionModal from '../../src/components/ConversionModal';
import '../../src/base.css';
import '../../src/App.redesign.css';

const UID = 'apercu-encart-0000';
const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'en' ? 'en' : 'fr';
const palier = params.get('palier') || 'free';
const avecOption = params.get('profil') === 'cloud';
const drapeaux = palier === 'premium' ? { is_premium: true } : {};
window.__FIXTURE = {
  utilisateur: { id: UID, email: 'apercu@fillsell.app' },
  tables: {
    profiles: [{ id: UID, ...drapeaux, ...(avecOption ? { is_cloud: true } : {}) }],
    coin_config: [{ key: 'quota_annonces_free', value: 5 }],
  },
  rpc: {},
};
try { localStorage.clear(); } catch { /* rien */ }
const rien = () => {};

ReactDOM.createRoot(document.getElementById('apercu')).render(
  <div style={{ minHeight: '100vh', background: '#EDEAE0' }}>
    <ConversionModal
      isOpen onClose={rien} onUpgrade={(tier, choix) => { window.__dernierChoix = { tier, nbArgs: choix === undefined ? 1 : 2 }; }}
      lang={lang} userId={UID} isPremium={palier === 'premium'}
    />
  </div>,
);
