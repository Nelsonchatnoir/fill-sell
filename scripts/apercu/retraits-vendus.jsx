/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, jamais livré. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — « Vendu, encore en ligne » : le bandeau prioritaire (A6, 12/10)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte le VRAI bandeau
// (components/RetraitsVendusBloques.jsx) sur les VRAIES règles
// (utils/retraitsBloques.js) et la ligne « À régler » du Stock, avec des jobs
// FICTIFS qui reproduisent les cas du 11/10 :
//   · Ornella : jupe vendue, retrait Vinted retenu car l'annonce est sur son
//     autre boutique (marqueur serveur attente_boutique_retrait) ;
//   · nerema75 : boutique de l'annonce impossible à prouver (origine_inconnue) ;
//   · ordinateur éteint : retraits Leboncoin d'articles vendus en file depuis
//     deux jours, extension silencieuse depuis trois ;
//   · reconnexion Beebs.
//     ?vue=avant  (les retraits aboutis : le bandeau se lève, RIEN ne reste)
//     node scripts/apercu/capture-retraits-vendus.mjs
import { createRoot } from 'react-dom/client';
import RetraitsVendusBloques from '../../src/components/RetraitsVendusBloques.jsx';
import { retraitsBloquesParConnexion, ligneARegler, ligneCarteRetraitBloque } from '../../src/utils/retraitsBloques.js';

const H = 3600_000;
const maintenant = Date.now();
const iso = (ms) => new Date(maintenant - ms).toISOString();
const fiches = [
  { id: 1, titre: 'Jupe plissée H&M', statut: 'vendu' },
  { id: 2, titre: 'Sac bandoulière cuir', statut: 'vendu' },
  { id: 3, titre: 'Livre « Le Petit Prince »', statut: 'vendu' },
  { id: 4, titre: 'Puzzle 1000 pièces', statut: 'vendu' },
  { id: 5, titre: 'Body bébé 6 mois', statut: 'vendu' },
];
const jobs = [
  { id: 'j1', action: 'delete', platform: 'vinted', status: 'pending', inventaire_id: 1, created_at: iso(5 * H), listing_url: 'https://www.vinted.fr/items/1',
    platform_fields: { attente_boutique_retrait: { login: 'ornella-vend', boutique: 472079, ouverte: 'luciatrendyshop' } } },
  { id: 'j2', action: 'delete', platform: 'vinted', status: 'pending', inventaire_id: 2, created_at: iso(3 * H), listing_url: 'https://www.vinted.fr/items/2',
    platform_fields: { verification_boutique_vinted: { motif: 'origine_inconnue' }, vinted_account_id: 99 } },
  { id: 'j3', action: 'delete', platform: 'leboncoin', status: 'pending', inventaire_id: 3, created_at: iso(48 * H), listing_url: 'https://www.leboncoin.fr/ad/livres/3', platform_fields: {} },
  { id: 'j4', action: 'delete', platform: 'leboncoin', status: 'pending', inventaire_id: 4, created_at: iso(30 * H), listing_url: 'https://www.leboncoin.fr/ad/jeux/4', platform_fields: {} },
  { id: 'j5', action: 'delete', platform: 'beebs', status: 'needs_user', inventaire_id: 5, created_at: iso(2 * H), listing_url: 'https://www.beebs.app/5',
    error: 'Connexion Beebs requise', platform_fields: { needs_user_source: 'connexion' } },
];
const vue = new URLSearchParams(location.search).get('vue');
const enFile = vue === 'avant' ? [] : jobs;
// Extension vue il y a 3 jours : Chrome fermé (le mur « ordinateur » pour Leboncoin).
const retraits = retraitsBloquesParConnexion({ jobs: enFile, fiches, maintenant, extensionVueLe: iso(72 * H), loginsBoutiques: { 99: 'marie-vintage' } });

function Apercu() {
  const regler = ligneARegler(retraits, 'fr');
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 720, margin: '0 auto' }}>
      <div data-surface="bandeau">
        <RetraitsVendusBloques lang="fr" retraits={retraits} onVoir={() => {}} />
      </div>
      <div data-surface="vide" data-vide={String(retraits.total === 0)} style={{ fontSize: 12, color: '#5C6560', marginBottom: 10 }}>
        {retraits.total === 0 ? 'Aucun retrait en attente : aucun bandeau (rien ne reste à l’écran).' : `${retraits.total} retrait(s) en attente.`}
      </div>
      {retraits.total > 0 && (
        <div data-surface="a-regler" style={{ background: '#fff', borderRadius: 12, padding: 12, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <b>Ligne « À régler » du Stock</b>
          <span>{typeof regler === 'string' ? regler : `${regler?.titre ?? ''} — ${regler?.detail ?? ''}`}</span>
          <b style={{ marginTop: 6 }}>Ligne de la carte de l'article</b>
          {retraits.parPlateforme.map((g) => (
            <span key={`${g.platform}|${g.mur}`} data-carte={g.mur}>{g.nom} : {ligneCarteRetraitBloque(g.platform, 'fr', g.mur, g.boutique ?? null)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('apercu')).render(<Apercu />);
