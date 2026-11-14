// ═══════════════════════════════════════════════════════════════════════════
// LE RAPPEL AVANT DÉBIT D'UNE FORMULE AVEC CLOUD — LA VEILLE ET LE JOUR J (11/11/2026, textes 4 et 5 validés par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Monté par cloud/HoteCloud.jsx À LA PLACE de RappelVeilleFinEssai quand l'essai en cours est celui d'une formule avec
// Cloud (profiles.cloud_formule, posée par le serveur) — une fois par essai. Le rappel par e-mail, lui, part du serveur.
//   « Ton essai se termine demain, le {date} à {heure} » (le jour J : « aujourd'hui à {heure} ») ;
//   « Choisis ta formule. Sans choix de ta part, Pro + Cloud continue à {P}/mois à partir du {date}. » ;
//   « Garder Pro + Cloud · {P}/mois » (rien à faire) ; « Passer à Premium + Cloud · {P}/mois » (une descente, au
//   renouvellement : le 1er débit se fait au prix choisi) ; « Arrêter » (le geste d'aujourd'hui, par le canal) ;
//   ce que comprend chaque formule (coin_config, jamais en dur) ; où le montant est prélevé.
// ⛔ Business + Cloud n'a jamais d'essai : cet écran ne le concerne pas. ⛔ Prix du canal, jamais en dur. Heure de Paris.
import { useEffect, useState } from 'react';
import { C, BLANC, DEGRADE_TEAL } from './theme';
import { Feuille, EnTete } from './FinEssaiCloud';
import { textesFormules, NOMS_FORMULES } from './textesFormules';
import { dateLongue, heureDe } from './regles';
import { formuleInferieure } from './formulesCloud';
import { PALIER_DE_FORMULE } from '../config/cloudOffer';
import { prixOuChargement, prixPret } from '../lib/prixBoutique';
import { usePrixBoutique } from '../lib/usePrixBoutique';
import { supabase } from '../lib/supabase';
import { JAUGES, grilleDuPalier } from '../utils/jauges';
import { CLES_CONFIG_JAUGES } from '../reglages/quotas';
import { listeJauges } from '../entree/regles';

/** « 40 annonces, 400 publications et 1 500 remontées » d'une formule (pur) ; K = coin_config (ou null : le repli). */
// Le style des deux boutons de la feuille (le même que RappelVeilleFinEssai : plein, ou bordé).
const bouton = (plein) => ({
  width: '100%', minHeight: 50, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14.5, fontWeight: 700,
  border: plein ? 'none' : `1.5px solid ${C.border}`, background: plein ? DEGRADE_TEAL : BLANC, color: plein ? BLANC : C.ink,
  boxShadow: plein ? '0 10px 22px -8px rgba(47,158,144,0.5)' : 'none',
});

function contenuFormule(formule, K, lang = 'fr') {
  const g = grilleDuPalier(K, PALIER_DE_FORMULE[formule]);
  return listeJauges(Object.fromEntries(JAUGES.map((j) => [j, g[j]])), lang, { dernierEt: false });
}

export default function RappelVeilleFormule({ lang = 'fr', cloud, formule, quand = 'demain', canal = null, actions = {}, onFermer }) {
  usePrixBoutique();
  const T = textesFormules(lang);
  const [fige] = useState(() => ({ date: dateLongue(cloud?.essaiFin, lang), heure: heureDe(cloud?.essaiFin, lang) }));
  const [K, setK] = useState(null);
  const [etat, setEtat] = useState('question');   // question | en_cours | change | echec
  useEffect(() => {
    let mort = false;
    Promise.resolve()
      .then(() => supabase.from('coin_config').select('key, value').in('key', CLES_CONFIG_JAUGES))
      .then(({ data, error }) => { if (!mort && !error && Array.isArray(data)) setK(Object.fromEntries(data.map((r) => [r.key, r.value]))); })
      .catch(() => { /* le repli de la grille */ });
    return () => { mort = true; };
  }, []);
  const nom = NOMS_FORMULES[formule];
  const prix = prixOuChargement(formule, lang);
  const basse = formuleInferieure(formule);
  const prixBas = basse ? prixOuChargement(basse, lang) : null;
  const auto = (f) => PALIER_DE_FORMULE[f] === 'pro' || PALIER_DE_FORMULE[f] === 'business';

  const passer = async () => {
    if (!basse || typeof actions.formule !== 'function' || etat === 'en_cours') return;
    setEtat('en_cours');
    try {
      const r = await actions.formule(basse, { descente: true });
      // (14/11/2026, bloc F) Pendant l'essai, la descente passe d'abord par la fenêtre du montant exact (« confirmation ») :
      // la feuille reste sur sa question (la fenêtre prend la main), jamais « le changement n'a pas pu se faire ».
      setEtat(r?.etat === 'change' || r?.etat === 'programme' || r?.etat === 'redirige' ? 'change'
        : r?.etat === 'annule' || r?.etat === 'confirmation' ? 'question' : 'echec');
    } catch { setEtat('echec'); }
  };
  const arreter = async () => {
    if (typeof actions.arreter !== 'function' || etat === 'en_cours') return;
    setEtat('en_cours');
    try {
      const r = await actions.arreter({ canal });
      if (r?.ok === false) setEtat('echec'); else onFermer?.();
    } catch { setEtat('echec'); }
  };

  return (
    <Feuille onFermer={onFermer} etiquette={T.finTitre(quand, fige.date, fige.heure)}>
      <div data-formule-veille={formule}>
        <EnTete kicker={T.finKicker} titre={T.finTitre(quand, fige.date, fige.heure)} />
        {etat === 'change' ? (
          <p data-zone="issue" style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.55, fontWeight: 600, color: C.ink }}>{T.finChangeFait(NOMS_FORMULES[basse], fige.date)}</p>
        ) : (
          <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '13px 14px', marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, fontWeight: 600, color: C.ink }}>{T.finTexte(nom, prix, fige.date)}</p>
            <ul data-zone="contenus" style={{ listStyle: 'none', margin: '10px 0 0', padding: '10px 0 0', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[formule, basse].filter(Boolean).map((f) => (
                <li key={f} style={{ fontSize: 12.5, lineHeight: 1.45, fontWeight: 600, color: C.mute2 }}>{T.finContenu(NOMS_FORMULES[f], contenuFormule(f, K, lang), auto(f))}</li>
              ))}
            </ul>
          </div>
        )}
        {etat === 'echec' && (
          <p role="status" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, fontWeight: 600, color: '#7A4A0B', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '10px 12px' }}>{T.finChangeEchec}</p>
        )}
        {etat === 'change' ? (
          <button type="button" onClick={onFermer} style={bouton(true)}>{T.fermer}</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" data-formule-veille-garder="" onClick={onFermer} style={bouton(true)}>{T.finGarder(nom, prix)}</button>
            {basse && typeof actions.formule === 'function' && (
              <button type="button" data-formule-veille-passer={basse} onClick={passer} disabled={etat === 'en_cours' || !prixPret(basse)}
                style={{ ...bouton(false), opacity: etat === 'en_cours' || !prixPret(basse) ? 0.6 : 1 }}>
                {etat === 'en_cours' ? '…' : T.finPasser(NOMS_FORMULES[basse], prixBas)}
              </button>
            )}
            {typeof actions.arreter === 'function' && (
              <button type="button" onClick={arreter} disabled={etat === 'en_cours'} style={{ minHeight: 44, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: C.mute2, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {T.finArreter}
              </button>
            )}
          </div>
        )}
        <p style={{ margin: '12px 0 0', fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: C.mute2, textAlign: 'center' }}>{T.finCanal[canal] ?? T.finCanal.stripe}</p>
      </div>
    </Feuille>
  );
}
