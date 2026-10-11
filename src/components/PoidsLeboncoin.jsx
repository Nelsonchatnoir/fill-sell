// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — LE POIDS DU COLIS, DEMANDÉ AVANT L'ENVOI (11/10/2026, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Une publication Leboncoin sans poids n'est jamais servie à l'extension
// (supabase/functions/_shared/poids-leboncoin.js). Sur « Confirmer », quand ni
// la copie Leboncoin ni la fiche n'ont de poids, ce champ le demande — comme
// les frais de port Depop : visible sans ouvrir de carte, Publier grisé avec
// son motif, « Continuer sans Leboncoin » offert par le stepper. Une fois
// montré, le champ reste à l'écran (on peut corriger ce qu'on vient de taper).
// Le poids est celui de l'ARTICLE : reporté sur la fiche au clic Publier.
import { useEffect, useState } from 'react';
import { lirePoidsSaisi } from '../publication/lot/regles';

export function CartePoidsLeboncoin({ m, id = 'poids-lbc-stepper' }) {
  const pl = m?.poidsLbc;
  const [montre, setMontre] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [touche, setTouche] = useState(false);
  useEffect(() => { if (pl?.visee && pl?.manquant) setMontre(true); }, [pl?.visee, pl?.manquant]);
  if (!pl?.visee || !(montre || pl.manquant)) return null;
  const en = m.lang === 'en';
  const g = lirePoidsSaisi(saisie);
  const erreur = touche && saisie.trim() && g == null;
  const poser = (texte) => {
    const v = lirePoidsSaisi(texte);
    if (v != null) pl.poser(v);
  };
  return (
    <div className={`fsn-card${pl.manquant ? ' fsn-card--geste' : ''}`} style={{ gap: 8 }}>
      <label htmlFor={id} className="fsn-q-t" style={{ display: 'block' }}>
        {en ? 'Parcel weight (Leboncoin)' : 'Poids du colis (Leboncoin)'}
      </label>
      <div className="fsn-q-why">{en
        ? 'Leboncoin prices the parcel by weight: without it, nothing goes to Leboncoin — nothing is guessed. Saved on the item.'
        : 'Leboncoin calcule l’envoi au poids : sans lui, rien ne part sur Leboncoin — rien n’est deviné. Gardé sur la fiche.'}</div>
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
    </div>
  );
}

export default CartePoidsLeboncoin;
