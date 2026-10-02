// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › EXPÉDITION › ADRESSE DE REMISE (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// DÉPLACEMENT PUR — le formulaire, la vérification BAN et l'écriture sont ceux
// de la pop-up, repris sans y toucher :
//   · saisie en 3 champs (rue / code postal / ville), recomposée en UNE chaîne
//     à l'enregistrement, jointe par des espaces et sans virgule :
//     l'autocomplete Leboncoin matche mieux « 12 rue de la paix 69001 lyon »
//     que la même chaîne ponctuée (cf. fillAddress, content-scripts) ;
//   · écriture par platform_settings_fusionner (02/10) : seuls les champs
//     d'adresse partent, le serveur fusionne — plus jamais l'objet entier
//     (c'est ce geste, ailleurs, qui avait effacé des adresses) ;
//   · la fonction rend l'objet écrit : pas de réponse = pas de « ✅ » ;
//   · vérification BAN au clic (échec réel du 13/08 : « saint antoines du
//     rochers » pour Saint-Antoine-du-Rocher, deux dépôts perdus). TROIS
//     issues, aucune ne bloque : identique → enregistré ; différente →
//     proposée, la saisie reste forçable ; introuvable → avertie, « enregistrer
//     quand même ». Service en panne → enregistrement direct, pas d'alarme à
//     tort.
import { useState } from 'react';
import { fusionnerReglages } from '../utils/reglagesPlateformes';
import { R } from './theme';
import { Groupe, Carte, Champ, Bouton, Note } from './ReglagesUI';

const normBan = (s) => String(s ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export default function SousPageExpedition({ c, T }) {
  const [rue, setRue] = useState(c.adresseLbc.rue ?? '');
  const [cp, setCp] = useState(c.adresseLbc.cp ?? '');
  const [ville, setVille] = useState(c.adresseLbc.ville ?? '');
  const [ban, setBan] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const cpValide = /^\d{5}$/.test(cp.trim());
  const cpTouche = cp.trim().length > 0;
  const cpErreur = cpTouche && !cpValide;

  const enregistrer = async (r, p, v) => {
    const adresse = [r, p, v].filter(Boolean).join(' ');
    // Seuls les champs d'adresse sont envoyés ; le serveur fusionne dans
    // `leboncoin` (02/10 : plus jamais d'objet entier réécrit).
    const { data: ps, error } = await fusionnerReglages(['leboncoin'], { rue: r, code_postal: p, ville: v, adresse });
    const rate = error || !ps;
    if (!rate) {
      setRue(r); setCp(p); setVille(v); setBan(null);
      c.setAdresseLbc({ rue: r, cp: p, ville: v });
    }
    c.toast(rate ? T.erreurSauvegarde : T.adresseEnregistree);
  };

  const verifierPuisEnregistrer = async () => {
    setEnCours(true);
    const r = rue.trim(); const p = cp.trim(); const v = ville.trim();
    const saisie = [r, p, v].filter(Boolean).join(' ');
    let feature = null; let banIndisponible = false;
    try {
      const rep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(saisie)}&limit=1&autocomplete=0`);
      if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
      feature = (await rep.json())?.features?.[0] ?? null;
    } catch { banIndisponible = true; }
    if (banIndisponible) { await enregistrer(r, p, v); setEnCours(false); return; }
    // Score plancher : sous 0.4 la BAN « trouve » n'importe quoi (elle rend
    // toujours son moins mauvais candidat) — on traite comme introuvable.
    if (!feature || Number(feature.properties?.score ?? 0) < 0.4) {
      setBan({ kind: 'introuvable' });
      setEnCours(false);
      return;
    }
    const pr = feature.properties ?? {};
    // Recomposition dans NOS 3 champs : rue = numéro + voie (pr.name porte
    // déjà « 3 Allée des Guisniers » ; les lieux-dits y vivent aussi).
    const banRue = String(pr.name ?? '').trim();
    const banCp = String(pr.postcode ?? p).trim();
    const banVille = String(pr.city ?? v).trim();
    const banAdresse = [banRue, banCp, banVille].filter(Boolean).join(' ');
    if (normBan(banAdresse) === normBan(saisie)) {
      await enregistrer(r, p, v); // identique modulo accents/casse : zéro friction
    } else {
      setBan({ kind: 'proposition', rue: banRue, cp: banCp, ville: banVille, label: String(pr.label ?? banAdresse) });
    }
    setEnCours(false);
  };

  return (
    <Groupe intitule={T.sLeboncoin}>
      <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Champ
          label={T.rue}
          value={rue}
          onChange={(e) => { setRue(e.target.value.slice(0, 120)); setBan(null); }}
          placeholder={T.ruePlaceholder}
          autoComplete="street-address"
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <Champ
            label={T.codePostal}
            value={cp}
            onChange={(e) => { setCp(e.target.value.replace(/\D/g, '').slice(0, 5)); setBan(null); }}
            inputMode="numeric"
            erreur={cpErreur}
            autoComplete="postal-code"
            style={{ width: 130, flexShrink: 0 }}
          />
          <Champ
            label={T.ville}
            value={ville}
            onChange={(e) => { setVille(e.target.value.slice(0, 80)); setBan(null); }}
            autoComplete="address-level2"
            style={{ flex: 1 }}
          />
        </div>

        {cpErreur && <div style={{ fontSize: 12.5, color: R.negatifTexte, fontWeight: 600 }}>{T.cpInvalide}</div>}

        {ban?.kind === 'proposition' && (
          <div style={{ background: R.menthe, border: `1px solid ${R.mentheBord}`, borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: R.ink, lineHeight: 1.5 }}>
              {T.adresseReconnue} <b>{ban.label}</b>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Bouton onClick={async () => { setEnCours(true); await enregistrer(ban.rue, ban.cp, ban.ville); setEnCours(false); }} enCours={enCours}>
                {T.utiliserCetteAdresse}
              </Bouton>
              <Bouton ton="creux" onClick={async () => { setEnCours(true); await enregistrer(rue.trim(), cp.trim(), ville.trim()); setEnCours(false); }} enCours={enCours}>
                {T.garderMaSaisie}
              </Bouton>
            </div>
          </div>
        )}

        {ban?.kind === 'introuvable' && (
          <div style={{ background: `${R.amber}18`, border: `1px solid ${R.amber}66`, borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: R.ink, lineHeight: 1.5 }}>{T.adresseInconnue}</div>
            <Bouton ton="creux" onClick={async () => { setEnCours(true); await enregistrer(rue.trim(), cp.trim(), ville.trim()); setEnCours(false); }} enCours={enCours} style={{ alignSelf: 'flex-start' }}>
              {T.enregistrerQuandMeme}
            </Bouton>
          </div>
        )}

        {!ban && (
          <Bouton onClick={verifierPuisEnregistrer} enCours={enCours} disabled={cpErreur} style={{ width: '100%', marginTop: 2 }}>
            {enCours ? '…' : T.enregistrerAdresse}
          </Bouton>
        )}
      </Carte>
      <Note>{T.adresseNote}</Note>
    </Groupe>
  );
}
