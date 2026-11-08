// ══════════════════════════════════════════════════════════════════════════
// APERÇU — le bandeau « NOUVEAU · FillSell Cloud » en haut du Tableau (08/11/2026 soir, point 4 de Nico)
// ══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré (vite build n'a qu'une entrée, index.html).
//
//     node scripts/apercu/capture-bandeau-cloud.mjs
//
// Le VRAI composant (src/cloud/BandeauCloudTableau.jsx) et sa VRAIE lecture du profil (useCloudProfil) sur le faux
// client Supabase (aucun réseau, écritures refusées), dans le conteneur du Tableau de l'app (mêmes classes, même
// marge intérieure, même fond), au-dessus d'un bloc « contenu du Tableau » qui sert de témoin de position.
//   ?profil=libre  → compte qui n'a jamais eu le Cloud : bandeau montré ;
//   ?profil=essai  → compte qui a déjà pris son essai : rien ;
//   ?client=1      → client Cloud : rien ;  ?vendable=0 → appareil où le Cloud ne se vend pas : rien ;
//   ?sans=1        → le Tableau sans bandeau (référence) ;  ?lang=fr|en
import React from 'react';
import ReactDOM from 'react-dom/client';
import BandeauCloudTableau from '../../src/cloud/BandeauCloudTableau';
import '../../src/base.css';
import '../../src/App.redesign.css';

const UID = 'apercu-bandeau-0000';
const p = new URLSearchParams(location.search);
const lang = p.get('lang') === 'en' ? 'en' : 'fr';
const profil = p.get('profil') === 'essai' ? { cloud_essai_debut: '2026-10-30T10:00:00Z', cloud_essai_arrete: true } : {};
window.__FIXTURE = { utilisateur: { id: UID, email: 'apercu@fillsell.app' }, tables: { profiles: [{ id: UID, ...profil }] }, rpc: {} };
if (p.get('garder') !== '1') { try { localStorage.clear(); } catch { /* rien */ } }
window.__evenements = [];
window.__essais = 0;
const journal = (evenement, metadata) => { window.__evenements.push({ evenement, metadata }); };

ReactDOM.createRoot(document.getElementById('apercu')).render(
  <div className="app-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
    <div className="wrap page-pad" data-bureau-large={window.innerWidth >= 1024 ? '1' : undefined}
      style={{ padding: '18px 14px 16px', background: 'var(--bg)', flex: '1', minHeight: 0 }}>
      {p.get('sans') !== '1' && (
        <BandeauCloudTableau userId={UID} lang={lang} plateforme={p.get('plateforme') || 'web'}
          vendable={p.get('vendable') !== '0'} compteLu clientCloud={p.get('client') === '1'} ecranLibre
          journal={journal} onEssayer={() => { window.__essais += 1; }} />
      )}
      <div data-temoin-tableau style={{ background: '#FFFFFF', border: '1px solid #E7E3D8', borderRadius: 18, padding: 18, fontFamily: "'Space Grotesk', sans-serif" }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#10201B' }}>Bonjour <span style={{ color: '#2F9E90' }}>Nico</span></div>
        <div style={{ marginTop: 8, color: '#5C6560', fontSize: 14 }}>(témoin : le premier bloc du Tableau)</div>
      </div>
    </div>
  </div>,
);
