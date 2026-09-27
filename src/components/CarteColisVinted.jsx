// ═══════════════════════════════════════════════════════════════════════════
// VINTED — LE BLOC COLIS (2026-09-27, demande de Louis)
// ═══════════════════════════════════════════════════════════════════════════
// « Je veux choisir moi-même la taille du colis Vinted. »
//
// Même forme que le bloc Livraison Leboncoin : REPLIÉ, jamais une question,
// jamais bloquant. Qui ne l'ouvre pas ne change rien — l'annonce part avec le
// format habituel (« Petit » sur la Mode, celui que Vinted recommande
// ailleurs). Les formats proposés sont ceux du formulaire Vinted pour CE
// rayon (utils/vintedColis.js) ; un rayon dont la grille n'a jamais été vue
// n'affiche pas le bloc.
//
// Le choix fait ici se range sur la fiche au clic Publier, et revient la fois
// suivante ; la republication, elle, reprend le format de l'annonce en ligne.

import { useState } from 'react';
import { Package } from 'lucide-react';
import { UI } from './ui';
import { grilleColisVinted, colisVintedRetenu, rayonModeVinted } from '../utils/vintedColis';

const MOTS = {
  fr: {
    titre: 'COLIS VINTED', ouvrir: 'Choisir', fermer: 'Fermer',
    habituelMode: 'Petit — le format habituel',
    habituel: 'Celui que Vinted recommande pour ce rayon',
    choisi: (l) => `${l} — ton choix`,
    fiche: (l) => `${l} — ton choix sur cet article`,
    aide: 'Les formats que Vinted propose pour ce rayon. Sans choix, rien ne change.',
    remettre: 'Remettre le format habituel',
  },
  en: {
    titre: 'VINTED PARCEL', ouvrir: 'Choose', fermer: 'Close',
    habituelMode: 'Small — the usual size',
    habituel: 'The one Vinted recommends for this category',
    choisi: (l) => `${l} — your choice`,
    fiche: (l) => `${l} — your choice for this item`,
    aide: 'The sizes Vinted offers for this category. With no choice, nothing changes.',
    remettre: 'Back to the usual size',
  },
};

export default function CarteColisVinted({ lang = 'fr', chemin = null, champs = {}, attributsFiche = null, onChange }) {
  const T = MOTS[lang === 'en' ? 'en' : 'fr'];
  const [ouvert, setOuvert] = useState(false);
  const grille = grilleColisVinted(chemin);
  if (!grille) return null;

  const retenu = colisVintedRetenu({ pf: champs, chemin, attributsFiche });
  const resume = retenu
    ? (retenu.origine === 'fiche' ? T.fiche(retenu.libelle) : T.choisi(retenu.libelle))
    : (rayonModeVinted(chemin) ? T.habituelMode : T.habituel);

  const st = {
    bloc: { border: `1px solid ${UI.border}`, borderRadius: 14, padding: 12, background: UI.paper, marginBottom: 12 },
    eyebrow: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: UI.mute2 },
    lien: { background: 'none', border: 'none', color: UI.tealDeep, fontWeight: 700, fontSize: 12.5,
            cursor: 'pointer', fontFamily: 'inherit', padding: '6px 2px', flexShrink: 0 },
    petit: { fontSize: 11, color: UI.mute2, lineHeight: 1.4 },
  };

  return (
    <div style={st.bloc}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={st.eyebrow}>{T.titre}</span>
        <button type="button" style={st.lien} onClick={() => setOuvert((v) => !v)}>
          {ouvert ? T.fermer : T.ouvrir}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4 }}>
        <Package size={15} color={UI.tealDeep} style={{ flexShrink: 0, marginTop: 3 }} />
        <div style={{ fontSize: 13.5, fontWeight: 600, color: UI.ink, lineHeight: 1.3, flex: 1, minWidth: 0 }}>
          {resume}
        </div>
      </div>

      {ouvert && (
        <div style={{ marginTop: 10 }}>
          <div style={st.petit}>{T.aide}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {grille.map((g) => {
              const actif = retenu?.id === g.id;
              return (
                <button key={g.id} type="button"
                  onClick={() => onChange?.(actif ? 0 : g.id)}
                  style={{ padding: '7px 11px', borderRadius: 999, fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer',
                           fontWeight: actif ? 700 : 600,
                           border: `1px solid ${actif ? UI.tealDeep : UI.border}`,
                           background: actif ? '#E8F5F3' : UI.card, color: actif ? UI.tealDeep : UI.mute2 }}>
                  {g.libelle}
                </button>
              );
            })}
          </div>
          {retenu && (
            <button type="button" onClick={() => onChange?.(0)} style={{ ...st.lien, marginTop: 6 }}>{T.remettre}</button>
          )}
        </div>
      )}
    </div>
  );
}
