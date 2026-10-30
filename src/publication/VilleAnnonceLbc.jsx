// ═══════════════════════════════════════════════════════════════════════════
// CARTE LEBONCOIN › LA VILLE DE L'ANNONCE (30/10/2026, lot E)
// ═══════════════════════════════════════════════════════════════════════════
// La ville où l'annonce sera localisée : le réglage par défaut (Réglages ›
// Expédition), sinon la ville de l'adresse de remise — changeable ici, pour
// CETTE publication. Règle : utils/villeAnnonceLbc.js. Format mobile d'abord :
// une ligne, un bouton ; le formulaire (code postal, ville) s'ouvre en dessous.
import { useEffect, useState } from 'react';
import { lireVillesLbc, villeValide, libelleVille, CHOIX_ADRESSE } from '../utils/villeAnnonceLbc';

const MOTS = {
  fr: {
    titre: "Ville de l'annonce", changer: 'Changer', cp: 'Code postal', ville: 'Ville', valider: 'Valider',
    annuler: 'Annuler', monAdresse: 'Mon adresse', deReglage: 'ton réglage', deAdresse: 'ton adresse',
    deCarte: 'pour cette annonce', inconnue: 'ton adresse de remise', faux: 'Un code postal à 5 chiffres et une ville.',
  },
  en: {
    titre: 'Listing town', changer: 'Change', cp: 'Postcode', ville: 'Town', valider: 'Confirm',
    annuler: 'Cancel', monAdresse: 'My address', deReglage: 'your setting', deAdresse: 'your address',
    deCarte: 'for this listing', inconnue: 'your shipping address', faux: 'A 5-digit postcode and a town.',
  },
};

export default function VilleAnnonceLbc({ userId, valeur, onChange, T, lang = 'fr' }) {
  const M = MOTS[lang === 'en' ? 'en' : 'fr'];
  const [villes, setVilles] = useState({ lue: false, reglage: null, adresse: null });
  const [ouvert, setOuvert] = useState(false);
  const [cp, setCp] = useState('');
  const [ville, setVille] = useState('');
  const [faux, setFaux] = useState(false);
  useEffect(() => {
    let vivant = true;
    lireVillesLbc(userId).then((r) => { if (vivant) setVilles(r); });
    return () => { vivant = false; };
  }, [userId]);

  const choisie = valeur === CHOIX_ADRESSE ? null : villeValide(valeur);
  const effective = valeur === CHOIX_ADRESSE ? villes.adresse : (choisie ?? villes.reglage ?? villes.adresse);
  const source = choisie ? M.deCarte : (valeur !== CHOIX_ADRESSE && villes.reglage) ? M.deReglage : M.deAdresse;

  const ouvrir = () => { setCp(effective?.code_postal ?? ''); setVille(effective?.ville ?? ''); setFaux(false); setOuvert(true); };
  const valider = () => {
    const v = villeValide({ code_postal: cp, ville });
    if (!v) { setFaux(true); return; }
    onChange(v);
    setOuvert(false);
  };
  const champ = { width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 16, fontFamily: 'inherit', outline: 'none', background: T.chip, color: T.ink, boxSizing: 'border-box' };
  const bouton = (plein) => ({ minHeight: 40, padding: '0 14px', borderRadius: 999, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${plein ? T.tealDeep : T.border}`, background: plein ? T.tealDeep : T.chip, color: plein ? '#fff' : T.ink });

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: T.mute2, fontWeight: 600, marginBottom: 4 }}>📍 {M.titre}</div>
      {!ouvert && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderRadius: 12, border: `1px solid ${T.border}`, background: T.chip }}>
          <div style={{ minWidth: 0, fontSize: 13.5, color: T.ink, lineHeight: 1.35 }}>
            <b>{effective ? libelleVille(effective) : M.inconnue}</b>
            {effective ? <span style={{ color: T.mute2 }}> · {source}</span> : null}
          </div>
          <button type="button" onClick={ouvrir} style={bouton(false)}>{M.changer}</button>
        </div>
      )}
      {ouvert && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 12, border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input aria-label={M.cp} placeholder={M.cp} inputMode="numeric" autoComplete="postal-code" value={cp}
              onChange={(e) => { setCp(e.target.value.replace(/\D/g, '').slice(0, 5)); setFaux(false); }} style={{ ...champ, width: 110, flexShrink: 0 }} />
            <input aria-label={M.ville} placeholder={M.ville} autoComplete="address-level2" value={ville}
              onChange={(e) => { setVille(e.target.value.slice(0, 80)); setFaux(false); }} style={champ} />
          </div>
          {faux ? <div role="alert" style={{ fontSize: 12, color: '#B42318', fontWeight: 600 }}>{M.faux}</div> : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={valider} style={bouton(true)}>{M.valider}</button>
            {(choisie || villes.reglage) && villes.adresse ? (
              <button type="button" onClick={() => { onChange(villes.reglage ? CHOIX_ADRESSE : null); setOuvert(false); }} style={bouton(false)}>
                {M.monAdresse} · {libelleVille(villes.adresse)}
              </button>
            ) : null}
            <button type="button" onClick={() => setOuvert(false)} style={bouton(false)}>{M.annuler}</button>
          </div>
        </div>
      )}
    </div>
  );
}
