// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › EXPÉDITION › VILLE DE TES ANNONCES LEBONCOIN (30/10/2026, lot E)
// ═══════════════════════════════════════════════════════════════════════════
// La ville où tes annonces Leboncoin sont localisées, par défaut. Vide : la
// ville de l'adresse de remise (comme avant). Chaque annonce se change à part,
// sur la carte Leboncoin au moment de publier. Règle : publication/villeLbc.js ;
// écriture : platform_settings_fusionner seulement (utils/villeAnnonceLbc.js).
import { useEffect, useState } from 'react';
import { lireVillesLbc, enregistrerVilleLbc, villeValide, libelleVille } from '../utils/villeAnnonceLbc';
import { R } from './theme';
import { Groupe, Carte, Champ, Bouton, Note } from './ReglagesUI';

const MOTS = {
  fr: {
    titre: 'Ville de tes annonces Leboncoin', cp: 'Code postal', ville: 'Ville', enregistrer: 'Enregistrer',
    effacer: 'Revenir à mon adresse', actuelle: 'Aujourd\'hui :', deAdresse: 'la ville de ton adresse',
    enregistre: 'Ville des annonces enregistrée.', efface: 'Tes annonces reprennent la ville de ton adresse.',
    erreur: 'Pas enregistré : réessaie dans un instant.', faux: 'Un code postal à 5 chiffres et une ville.',
    note: "Tes nouvelles annonces Leboncoin sont localisées dans cette ville. Chaque annonce se change à part, sur la carte Leboncoin au moment de publier. Une republication garde la ville de l'annonce d'origine.",
  },
  en: {
    titre: 'Town of your Leboncoin listings', cp: 'Postcode', ville: 'Town', enregistrer: 'Save',
    effacer: 'Back to my address', actuelle: 'Now:', deAdresse: 'the town of your address',
    enregistre: 'Listing town saved.', efface: 'Your listings use the town of your address again.',
    erreur: 'Not saved: try again in a moment.', faux: 'A 5-digit postcode and a town.',
    note: 'Your new Leboncoin listings are located in this town. Each listing can be changed on its own, on the Leboncoin card when you publish. A republication keeps the town of the original listing.',
  },
};

export default function VilleLeboncoinParDefaut({ c }) {
  const lang = c.lang === 'en' ? 'en' : 'fr';
  const T = MOTS[lang];
  const userId = c.user?.id ?? null;
  const [villes, setVilles] = useState({ lue: false, reglage: null, adresse: null });
  const [cp, setCp] = useState('');
  const [ville, setVille] = useState('');
  const [faux, setFaux] = useState(false);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    let vivant = true;
    lireVillesLbc(userId).then((r) => {
      if (!vivant) return;
      setVilles(r);
      if (r.reglage) { setCp(r.reglage.code_postal); setVille(r.reglage.ville); }
    });
    return () => { vivant = false; };
  }, [userId]);

  const enregistrer = async (effacer) => {
    const v = effacer ? null : villeValide({ code_postal: cp, ville });
    if (!effacer && !v) { setFaux(true); return; }
    setEnCours(true);
    const { ok } = await enregistrerVilleLbc(userId, v);
    setEnCours(false);
    if (ok) {
      setVilles((x) => ({ ...x, reglage: v }));
      if (effacer) { setCp(''); setVille(''); }
    }
    c.toast?.(!ok ? T.erreur : effacer ? T.efface : T.enregistre);
  };

  return (
    <Groupe intitule={T.titre}>
      <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, color: R.ink, lineHeight: 1.45 }}>
          {T.actuelle} <b>{villes.reglage ? libelleVille(villes.reglage) : `${T.deAdresse}${villes.adresse ? ` (${libelleVille(villes.adresse)})` : ''}`}</b>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Champ label={T.cp} value={cp} inputMode="numeric" autoComplete="postal-code" erreur={faux && !/^\d{5}$/.test(cp)}
            onChange={(e) => { setCp(e.target.value.replace(/\D/g, '').slice(0, 5)); setFaux(false); }} style={{ width: 130, flexShrink: 0 }} />
          <Champ label={T.ville} value={ville} autoComplete="address-level2"
            onChange={(e) => { setVille(e.target.value.slice(0, 80)); setFaux(false); }} style={{ flex: 1 }} />
        </div>
        {faux ? <div role="alert" style={{ fontSize: 12.5, color: R.negatifTexte, fontWeight: 600 }}>{T.faux}</div> : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Bouton onClick={() => enregistrer(false)} enCours={enCours} disabled={!userId} style={{ flex: 1 }}>{T.enregistrer}</Bouton>
          {villes.reglage ? <Bouton ton="creux" onClick={() => enregistrer(true)} enCours={enCours}>{T.effacer}</Bouton> : null}
        </div>
      </Carte>
      <Note>{T.note}</Note>
    </Groupe>
  );
}
