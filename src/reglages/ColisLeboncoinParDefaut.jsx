// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › EXPÉDITION › COLIS LEBONCOIN PAR DÉFAUT (26/10, D2 — Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Une taille (les trois formats de Leboncoin, relevés le 20/09 : utils/leboncoinColis.js) et un poids, choisis une
// fois. Ils partent avec chaque NOUVELLE annonce dont la fiche n'a pas de poids ; un article se règle toujours à part
// (le poids tapé à la publication, celui de la fiche, passent devant). Le même poids sert à Beebs.
// Écriture : platform_settings_fusionner seulement (utils/useChoixPoidsLeboncoin.js, enregistrerColisDefautLbc).
import { useState } from 'react';
import { useChoixPoidsLeboncoin } from '../utils/useChoixPoidsLeboncoin';
import { FORMATS_COLIS_DEFAUT_LBC, POIDS_DEFAUT_LBC_MAX_G } from '../utils/choixPoidsLeboncoin';
import { LBC_FORMATS } from '../utils/leboncoinColis';
import { grammesLbc } from '../../supabase/functions/_shared/poids-leboncoin.js';
import { R } from './theme';
import { Groupe, Carte, Champ, Bouton, Note } from './ReglagesUI';

const MOTS = {
  fr: {
    titre: 'Colis Leboncoin par défaut',
    taille: 'Taille du colis',
    laisser: 'Laisser Leboncoin choisir',
    poids: 'Poids du colis',
    poidsAide: 'ex. 500 g ou 1,2 kg — vide : Leboncoin estime',
    enregistrer: 'Enregistrer',
    effacer: 'Ne plus rien appliquer',
    enregistre: 'Colis par défaut enregistré.',
    efface: 'Plus de colis par défaut.',
    erreur: "Pas enregistré : réessaie dans un instant.",
    poidsFaux: `Écris un poids, par exemple 500 g ou 1,2 kg (${POIDS_DEFAUT_LBC_MAX_G / 1000} kg au plus).`,
    note: "Appliqué aux nouvelles annonces dont la fiche n'a pas de poids. Chaque article se change à part, au moment de le publier. Le même poids sert à Beebs.",
  },
  en: {
    titre: 'Default Leboncoin parcel',
    taille: 'Parcel size',
    laisser: 'Let Leboncoin choose',
    poids: 'Parcel weight',
    poidsAide: 'e.g. 500 g or 1.2 kg — empty: Leboncoin estimates',
    enregistrer: 'Save',
    effacer: 'Stop applying it',
    enregistre: 'Default parcel saved.',
    efface: 'No default parcel any more.',
    erreur: 'Not saved: try again in a moment.',
    poidsFaux: `Write a weight, e.g. 500 g or 1.2 kg (${POIDS_DEFAUT_LBC_MAX_G / 1000} kg at most).`,
    note: "Applied to new listings whose item has no weight. Each item can be changed on its own when you publish it. Beebs uses the same weight.",
  },
};

const enMots = (g, lang) => {
  if (!g) return '';
  if (g < 1000) return `${g} g`;
  const kg = Math.round(g / 100) / 10;
  return `${lang === 'en' ? String(kg) : String(kg).replace('.', ',')} kg`;
};

export default function ColisLeboncoinParDefaut({ c }) {
  const lang = c.lang === 'en' ? 'en' : 'fr';
  const T = MOTS[lang];
  const userId = c.user?.id ?? null;
  const { colisDefaut, choisirColisDefaut, lue } = useChoixPoidsLeboncoin(userId);
  const [format, setFormat] = useState(undefined); // undefined : suit la valeur lue
  const [poids, setPoids] = useState(undefined);
  const [faux, setFaux] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const formatVu = format === undefined ? (colisDefaut?.format ?? null) : format;
  const poidsVu = poids === undefined ? enMots(colisDefaut?.poids_g ?? null, lang) : poids;

  const enregistrer = async (effacer = false) => {
    let g = null;
    if (!effacer && String(poidsVu ?? '').trim()) {
      g = grammesLbc(String(poidsVu));
      if (!g || g > POIDS_DEFAUT_LBC_MAX_G) { setFaux(true); return; }
    }
    setFaux(false);
    setEnCours(true);
    const { ok } = await choisirColisDefaut(effacer ? null : { format: formatVu, poids_g: g });
    setEnCours(false);
    if (ok) { setFormat(undefined); setPoids(undefined); }
    c.toast?.(!ok ? T.erreur : effacer || (!formatVu && !g) ? T.efface : T.enregistre);
  };

  const puce = (actif) => ({
    minHeight: 44, padding: '0 14px', borderRadius: 22, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${actif ? R.teal : R.border}`, background: actif ? `${R.teal}14` : R.card, color: actif ? R.tealDeep : R.ink,
  });

  return (
    <Groupe intitule={T.titre}>
      <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: R.texteSecondaire }}>{T.taille}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="radiogroup" aria-label={T.taille}>
            <button type="button" role="radio" aria-checked={!formatVu} className="rg-focus" style={puce(!formatVu)} onClick={() => setFormat(null)}>
              {!formatVu ? '✓ ' : ''}{T.laisser}
            </button>
            {FORMATS_COLIS_DEFAUT_LBC.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={formatVu === f} className="rg-focus" style={puce(formatVu === f)} onClick={() => setFormat(f)}
                title={LBC_FORMATS.find((x) => x.valeur === f)?.aide ?? ''}>
                {formatVu === f ? '✓ ' : ''}{f}
              </button>
            ))}
          </div>
          {formatVu ? <span style={{ fontSize: 12.5, color: R.texteSecondaire, lineHeight: 1.45 }}>{LBC_FORMATS.find((x) => x.valeur === formatVu)?.aide}</span> : null}
        </div>
        <Champ label={T.poids} value={poidsVu ?? ''} inputMode="decimal" placeholder={T.poidsAide} erreur={faux}
          onChange={(e) => { setPoids(e.target.value.slice(0, 12)); setFaux(false); }} />
        {faux ? <div role="alert" style={{ fontSize: 12.5, color: R.negatifTexte, fontWeight: 600 }}>{T.poidsFaux}</div> : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Bouton onClick={() => enregistrer(false)} enCours={enCours} disabled={!lue && !userId} style={{ flex: 1 }}>{T.enregistrer}</Bouton>
          {colisDefaut ? <Bouton ton="creux" onClick={() => enregistrer(true)} enCours={enCours}>{T.effacer}</Bouton> : null}
        </div>
      </Carte>
      <Note>{T.note}</Note>
    </Groupe>
  );
}
