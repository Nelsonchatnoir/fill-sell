/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, pas un module de composants : comme src/main.jsx il
   monte et n'exporte rien. Le HMR de ces trois silhouettes n'intéresse
   personne. */
// ══════════════════════════════════════════════════════════════════════════
// APERÇU de l'écran de résultat Lens — outil de RELECTURE, jamais livré
// ══════════════════════════════════════════════════════════════════════════
// Sert à voir le rendu réel avant de pousser, sans scan payant ni compte :
//     npx vite            puis    http://localhost:5173/scripts/apercu/lens-resultat.html
//     node scripts/apercu/capture.mjs      (fait les deux et écrit les PNG)
//
// Il monte le VRAI composant (LensAnalysisResult de src/tabs/LensTab.jsx) sur
// des données de scan réelles. Rien ici n'entre dans le bundle de production :
// `vite build` n'a qu'une entrée, index.html.
//
// Les deux jeux de données viennent de scans réellement passés :
//  · le pistolet à colle Bosch IXO — la capture du 15/09 qui a déclenché la
//    refonte (titre répété en tuiles, description deux écrans plus bas,
//    fourchette affichée deux fois, badge « Identification partielle ») ;
//  · la robe Marc Cain — ligne inventaire du 03/09, pour montrer l'écran SANS
//    badge photo : c'est le cas des 14 scans sur 15 mesurés en base.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { LensAnalysisResult } from '../../src/tabs/LensTab';
import '../../src/base.css';
import '../../src/App.redesign.css';

// ── Le scan du 15/09 : pistolet à colle Bosch IXO ─────────────────────────
const BOSCH = {
  objet: 'pistolet à colle thermofusible',
  objet_source: 'lu',
  titre: 'Pistolet à colle thermofusible Bosch IXO',
  famille: 'bricolage',
  categorie: 'Bricolage',
  marque: 'Bosch',
  modele: 'IXO',
  modele_source: 'lue',
  matiere: 'Plastique',
  couleur: 'Vert',
  etat_estime: 'Très bon état',
  description:
    "Pistolet à colle thermofusible Bosch IXO, corps vert et noir, livré avec son adaptateur de charge. "
    + "Le corps ne présente pas de fêlure ni de trace de choc ; la buse est propre, sans résidu de colle durci. "
    + "L'appareil est sans fil, rechargeable, et fonctionne avec des bâtonnets de colle de 7 mm. "
    + "Il n'a pas été mis en marche pour ce relevé : son fonctionnement n'est donc pas confirmé.",
  attributs_visibles: {
    type_outil: 'pistolet à colle thermofusible',
    filaire_ou_sans_fil: 'sans fil',
    fonctionne: 'non testé',
  },
  prix_achat_suggere: 9,
  prix_vente_suggere: 18,
  fourchette_min: 15,
  fourchette_max: 22,
  fourchette_marche: { bas: 14, moyen: 18, haut: 24 },
  annonces_marche: [
    { titre: 'Pistolet à colle Bosch IXO + adaptateur', prix: 20, plateforme: 'Leboncoin' },
    { titre: 'Bosch IXO pistolet à colle sans fil', prix: 18, plateforme: 'Vinted' },
    { titre: 'Pistolet colle thermofusible Bosch', prix: 15, plateforme: 'eBay' },
  ],
  vitesse_vente: 'moyen',
  vitesse_vente_explication: "Outil de bricolage courant : la demande existe toute l'année, sans pic.",
  plateformes: ['Leboncoin', 'eBay', 'Vinted'],
  conseils: [
    'Mettre en avant le fonctionnement testé',
    "Préciser que l'adaptateur de charge est fourni",
    'Photographier la buse de près : elle est propre, ça rassure',
  ],
  confiance: 'moyenne',
  notes: "Prix établi à partir d'annonces comparables du même modèle.",
  est_vendu: false,
  annonce: { platforms: { vinted: {}, leboncoin: {}, ebay: {}, beebs: {} } },
};

// ── Un scan ordinaire : rien de « non testé », donc AUCUN badge photo ─────
const ROBE = {
  objet: 'robe midi',
  objet_source: 'lu',
  titre: 'Robe midi Marc Cain noir & blanc motif graphique',
  famille: 'mode',
  categorie: 'Mode',
  marque: 'Marc Cain',
  modele: null,
  matiere: 'Viscose',
  couleur: 'Noir et blanc',
  etat_estime: 'Très bon état',
  description:
    "Robe midi Marc Cain à motif graphique noir et blanc, manches trois-quarts, coupe droite légèrement "
    + "cintrée à la taille. L'étiquette de composition est lisible et le tissu ne présente ni bouloche ni "
    + "décoloration. Fermeture éclair invisible dans le dos.",
  attributs_visibles: { coupe: 'Robe midi', manches: 'Trois-quarts' },
  prix_achat_suggere: 18,
  prix_vente_suggere: 45,
  fourchette_min: 38,
  fourchette_max: 60,
  fourchette_marche: { bas: 35, moyen: 45, haut: 62 },
  annonces_marche: [
    { titre: 'Robe Marc Cain motif graphique N3', prix: 49, plateforme: 'Vinted' },
    { titre: 'Marc Cain robe midi noir blanc', prix: 42, plateforme: 'Vinted' },
    { titre: 'Robe Marc Cain taille 38', prix: 38, plateforme: 'eBay' },
  ],
  vitesse_vente: 'rapide',
  plateformes: ['Vinted', 'eBay'],
  conseils: ['Indiquer la taille Marc Cain (N3 = 38/40)', 'Photographier le motif à plat'],
  confiance: 'moyenne',
  notes: null,
  est_vendu: false,
  annonce: { platforms: { vinted: {}, leboncoin: {}, ebay: {}, beebs: {} } },
};

// Le CTA héros et l'encart « annonce prête » sont construits par LensTab dans
// l'app ; ici on les remplace par leur silhouette, pour que la pile de boutons
// soit à la bonne place et à la bonne hauteur.
function CtaFactice({ lang = 'fr' }) {
  return (
    <>
      <div style={{ marginBottom: 8, padding: '12px 14px', background: '#F0FDF9', border: '1px solid #CBE5DF', borderRadius: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#10201B', marginBottom: 2 }}>
          {lang === 'en' ? '📝 Your listing is ready' : '📝 Ton annonce est prête'}
        </div>
        <div style={{ fontSize: 12, color: '#5C6560', fontWeight: 500, lineHeight: 1.5 }}>
          Titre, description et champs pour les 4 plateformes sont déjà rédigés par ce scan.
          La créer ne consomme rien de plus.
        </div>
      </div>
      <button
        style={{
          position: 'relative', overflow: 'hidden', width: '100%', boxSizing: 'border-box',
          borderRadius: 999, padding: '17px 0', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 8, fontSize: 15.5, fontWeight: 700,
          fontFamily: 'inherit', letterSpacing: '0.01em', marginBottom: 6, cursor: 'pointer',
          background: 'linear-gradient(135deg,#1A5F52 0%,#0E3A32 55%,#10201B 100%)',
          color: '#FFFFFF', border: '1px solid rgba(240,196,106,0.55)',
          boxShadow: '0 14px 30px -8px rgba(16,32,27,0.5), inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
      >
        ✨ Ouvrir et publier l&apos;annonce
      </button>
    </>
  );
}

function Telephone({ legende, children }) {
  return (
    <div style={{ width: 390, flexShrink: 0 }}>
      <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, fontWeight: 700, color: '#10201B', padding: '10px 4px' }}>
        {legende}
      </div>
      <div style={{ background: '#EDEAE0', border: '1px solid #D8D2C4', borderRadius: 18, padding: 16, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, paddingLeft: 2 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: '#2F9E90', boxShadow: '0 0 0 3px rgba(47,158,144,0.18)', flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.11em', textTransform: 'uppercase', color: '#6B7A75' }}>
            Résultat du scan
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#A3A9A6' }}>· 📍 France</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Apercu() {
  const commun = {
    lang: 'fr', currency: 'EUR', lensAdded: false,
    addLensItem: () => {}, openLensEditModal: () => {}, onReset: () => {},
    createCta: <CtaFactice />,
  };
  return (
    <div style={{ display: 'flex', gap: 24, padding: 24, alignItems: 'flex-start', background: '#F6F5F1', minHeight: '100vh' }}>
      <Telephone legende="1 · Bosch IXO — « non testé » ⇒ le badge photo s'affiche">
        <LensAnalysisResult result={BOSCH} lensBuy="" {...commun} />
      </Telephone>
      <Telephone legende="2 · le même, prix d'achat saisi (12 €) ⇒ verdict et marge">
        <LensAnalysisResult result={BOSCH} lensBuy="12" {...commun} />
      </Telephone>
      <Telephone legende="3 · Marc Cain — rien de « non testé » ⇒ AUCUN badge">
        <LensAnalysisResult result={ROBE} lensBuy="" {...commun} />
      </Telephone>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('apercu')).render(
  <React.StrictMode><Apercu /></React.StrictMode>,
);
