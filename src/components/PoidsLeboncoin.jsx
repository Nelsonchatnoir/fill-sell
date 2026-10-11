// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — LE POIDS DU COLIS : ESTIMÉ OU SAISI (11/10/2026 soir, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Le poids obligatoire est une friction de trop » : sans poids, Leboncoin
// publie et estime le colis d'après le rayon. Sur « Confirmer », quand ni la
// copie Leboncoin ni la fiche n'ont de poids, cette carte offre :
//   · « Laisser Leboncoin estimer » (PAR DÉFAUT) — rien n'est demandé ;
//   · « Saisir le poids » — le champ s'ouvre ; Publier attend le poids (le
//     motif le dit, l'autre choix reste à un tap).
// Le choix est retenu pour les publications suivantes
// (utils/useChoixPoidsLeboncoin.js). Le poids tapé est celui de l'ARTICLE :
// reporté sur la fiche au clic Publier. Une fiche avec un poids : pas de
// carte, le poids part.
import { useEffect, useState } from 'react';
import { lirePoidsSaisi } from '../publication/lot/regles';
import { POIDS_LBC_ESTIMER, POIDS_LBC_SAISIR, choixPoidsValide } from '../utils/choixPoidsLeboncoin';

export function CartePoidsLeboncoin({ m, id = 'poids-lbc-stepper' }) {
  const pl = m?.poidsLbc;
  const [montre, setMontre] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [touche, setTouche] = useState(false);
  // La carte se montre quand Leboncoin est visé et que la fiche n'a pas de
  // poids ; une fois montrée, elle reste (on peut corriger ce qu'on a tapé).
  const aMontrer = Boolean(pl?.visee) && pl?.fiche == null;
  useEffect(() => { if (aMontrer) setMontre(true); }, [aMontrer]);
  if (!pl?.visee || !(montre || aMontrer)) return null;
  const en = m.lang === 'en';
  const saisir = choixPoidsValide(pl.choix) === POIDS_LBC_SAISIR;
  const g = lirePoidsSaisi(saisie);
  const erreur = touche && saisie.trim() && g == null;
  const poser = (texte) => {
    const v = lirePoidsSaisi(texte);
    if (v != null) pl.poser(v);
  };
  return (
    <div className={`fsn-card${pl.manquant ? ' fsn-card--geste' : ''}`} style={{ gap: 8 }}>
      <div className="fsn-q-t">{en ? 'Parcel weight (Leboncoin)' : 'Poids du colis (Leboncoin)'}</div>
      <div className="fsn-q-why">{en
        ? 'Without a weight, Leboncoin publishes and estimates the parcel from the category. Your choice is kept for your next listings.'
        : 'Sans poids, Leboncoin publie et estime le colis d’après le rayon. Ton choix est gardé pour tes prochaines publications.'}</div>
      <div className="fsn-choices" role="radiogroup" aria-label={en ? 'Leboncoin parcel weight' : 'Poids du colis Leboncoin'}>
        <button type="button" role="radio" aria-checked={!saisir} className={`fsn-choice${!saisir ? ' fsn-choice--on' : ''}`}
          onClick={() => {
            pl.choisir?.(POIDS_LBC_ESTIMER);
            // Le poids tapé ICI ne part plus : Leboncoin estime (celui d'une
            // autre carte, ou de la fiche, n'est jamais touché).
            if (g != null) { setSaisie(''); setTouche(false); pl.poser(null); }
          }}>
          {en ? 'Let Leboncoin estimate' : 'Laisser Leboncoin estimer'}
        </button>
        <button type="button" role="radio" aria-checked={saisir} className={`fsn-choice${saisir ? ' fsn-choice--on' : ''}`}
          onClick={() => pl.choisir?.(POIDS_LBC_SAISIR)}>
          {en ? 'Enter the weight' : 'Saisir le poids'}
        </button>
      </div>
      {saisir && (
        <>
          <label htmlFor={id} className="fsn-small" style={{ display: 'block' }}>
            {en ? 'Weight, saved on the item' : 'Poids, gardé sur la fiche'}
          </label>
          <input id={id} className="fsn-input" type="text" inputMode="decimal" style={{ maxWidth: 220 }}
            value={saisie}
            placeholder={pl.saisie ? `${pl.saisie} g` : (en ? 'e.g. 650 g or 1.2 kg' : 'ex. 650 g ou 1,2 kg')}
            aria-invalid={erreur || undefined}
            onChange={(ev) => { setSaisie(ev.target.value); poser(ev.target.value); }}
            onBlur={() => setTouche(true)} />
          {erreur && (
            <div className="fsn-small" style={{ color: '#B42318' }}>{en
              ? 'A weight in grams or kilos, e.g. 650 g or 1.2 kg.'
              : 'Un poids en grammes ou en kilos, par exemple 650 g ou 1,2 kg.'}</div>
          )}
          {!erreur && pl.saisie != null && (
            <div className="fsn-small">{en ? `Weight: ${pl.saisie} g` : `Poids : ${pl.saisie} g`}</div>
          )}
        </>
      )}
    </div>
  );
}

export default CartePoidsLeboncoin;
