// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › PUBLICATIONS PROGRAMMÉES (26/10, D4 — promis à XEWER le 26/09, décidé par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Sur le modèle de la republication planifiée : un créneau, des jours actifs, un plafond par jour. Les nouvelles
// annonces partent une à une dans le créneau, espacées ; ce qui dépasse attend le créneau suivant. Éteint par défaut.
// La règle : supabase/functions/_shared/publication-programmee.js (la même que get-pending-jobs).
// Écriture : platform_settings_fusionner seulement (utils/usePublicationProgrammee.js).
import { useState } from 'react';
import { Toggle } from '../components/ui';
import { usePublicationProgrammee } from '../utils/usePublicationProgrammee';
import { CRENEAUX_PROGRAMMES } from '../../supabase/functions/_shared/publication-programmee.js';
import { R } from './theme';
import { Groupe, Carte, Bouton, Note } from './ReglagesUI';

const MOTS = {
  fr: {
    titre: 'Publications programmées', activer: 'Programmer mes nouvelles publications',
    activerNote: "Elles partent une à une dans ton créneau, espacées. Ce qui dépasse attend le créneau suivant : rien n'est perdu.",
    creneau: 'Créneau', matin: 'Matin', midi: 'Midi', soir: 'Soir', perso: 'Mes horaires', de: 'De', a: 'À',
    jours: 'Jours actifs', parJour: 'Nombre par jour', sansPlafond: 'Sans plafond', enregistrer: 'Enregistrer',
    enregistre: 'Programmation enregistrée.', erreur: 'Pas enregistré : réessaie dans un instant.',
    horairesFaux: "L'heure de fin doit venir après l'heure de début.", joursVides: 'Choisis au moins un jour.',
    note: "Le quota se décompte au moment où tu envoies, comme aujourd'hui. Éteindre la programmation libère ta file : tout part à son tour. Chrome doit être ouvert sur ton ordinateur pendant le créneau.",
    jourCourt: ['L', 'M', 'M', 'J', 'V', 'S', 'D'], jourLong: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
  },
  en: {
    titre: 'Scheduled listings', activer: 'Schedule my new listings',
    activerNote: 'They go out one at a time in your time slot, spaced out. Anything over the limit waits for the next slot: nothing is lost.',
    creneau: 'Time slot', matin: 'Morning', midi: 'Midday', soir: 'Evening', perso: 'My hours', de: 'From', a: 'To',
    jours: 'Active days', parJour: 'Listings per day', sansPlafond: 'No limit', enregistrer: 'Save',
    enregistre: 'Schedule saved.', erreur: 'Not saved: try again in a moment.',
    horairesFaux: 'The end time must come after the start time.', joursVides: 'Pick at least one day.',
    note: 'Your quota is counted when you send, as today. Turning scheduling off frees your queue: everything goes out in turn. Chrome must be open on your computer during the slot.',
    jourCourt: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], jourLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  },
};

const heure = (hhmm, lang) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return lang === 'en' ? `${h}:${String(m).padStart(2, '0')}` : `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
};
const fuseauLocal = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; } catch { return 'Europe/Paris'; } };

export default function SousPagePublicationProgrammee({ c }) {
  const lang = c.lang === 'en' ? 'en' : 'fr';
  const T = MOTS[lang];
  const { brut, regler } = usePublicationProgrammee(c.user?.id ?? null);
  const actif = brut?.actif === true;
  const [creneau, setCreneau] = useState(undefined);
  const [de, setDe] = useState(undefined);
  const [a, setA] = useState(undefined);
  const [jours, setJours] = useState(undefined);
  const [plafond, setPlafond] = useState(undefined);
  const [faute, setFaute] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const creneauVu = creneau ?? brut?.creneau ?? 'matin';
  const deVu = de ?? (creneauVu === 'perso' ? (brut?.de ?? '09:00') : CRENEAUX_PROGRAMMES[creneauVu][0]);
  const aVu = a ?? (creneauVu === 'perso' ? (brut?.a ?? '11:00') : CRENEAUX_PROGRAMMES[creneauVu][1]);
  const joursVus = jours ?? (Array.isArray(brut?.jours) && brut.jours.length ? brut.jours : [1, 2, 3, 4, 5, 6, 7]);
  const plafondVu = plafond !== undefined ? plafond : (brut?.plafond_jour ?? null);

  const basculer = async (on) => {
    const { ok } = await regler({ actif: on, ...(on && !brut ? { creneau: 'matin', jours: [1, 2, 3, 4, 5, 6, 7], plafond_jour: null, fuseau: fuseauLocal() } : {}) });
    if (!ok) c.toast?.(T.erreur);
  };
  const enregistrer = async () => {
    if (creneauVu === 'perso' && !(String(aVu) > String(deVu))) { setFaute(T.horairesFaux); return; }
    if (!joursVus.length) { setFaute(T.joursVides); return; }
    setFaute(null);
    setEnCours(true);
    const n = Math.round(Number(plafondVu));
    const { ok } = await regler({
      creneau: creneauVu, ...(creneauVu === 'perso' ? { de: deVu, a: aVu } : {}),
      jours: [...joursVus].sort(), plafond_jour: Number.isFinite(n) && n >= 1 ? n : null, fuseau: fuseauLocal(),
    });
    setEnCours(false);
    if (ok) { setCreneau(undefined); setDe(undefined); setA(undefined); setJours(undefined); setPlafond(undefined); }
    c.toast?.(ok ? T.enregistre : T.erreur);
  };

  const puce = (on) => ({
    minHeight: 44, minWidth: 44, padding: '0 14px', borderRadius: 22, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${on ? R.teal : R.border}`, background: on ? `${R.teal}14` : R.card, color: on ? R.tealDeep : R.ink,
  });
  const champHeure = { minHeight: 44, padding: '0 12px', borderRadius: 12, border: `1px solid ${R.border}`, background: R.paper, fontFamily: 'inherit', fontSize: 16, color: R.ink };

  return (
    <>
      <Groupe intitule={T.titre}>
        <Carte>
          <div className="rg-ligne" style={{ minHeight: 60, gap: 12 }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: R.ink }}>{T.activer}</span>
              <span style={{ fontSize: 12, lineHeight: '17px', color: R.texteSecondaire }}>{T.activerNote}</span>
            </span>
            <Toggle checked={actif} onChange={basculer} />
          </div>
        </Carte>
      </Groupe>

      {actif && (
        <Groupe intitule={T.creneau}>
          <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="radiogroup" aria-label={T.creneau}>
              {['matin', 'midi', 'soir'].map((k) => (
                <button key={k} type="button" role="radio" aria-checked={creneauVu === k} className="rg-focus" style={puce(creneauVu === k)}
                  onClick={() => { setCreneau(k); setDe(undefined); setA(undefined); }}>
                  {creneauVu === k ? '✓ ' : ''}{T[k]} · {heure(CRENEAUX_PROGRAMMES[k][0], lang)} – {heure(CRENEAUX_PROGRAMMES[k][1], lang)}
                </button>
              ))}
              <button type="button" role="radio" aria-checked={creneauVu === 'perso'} className="rg-focus" style={puce(creneauVu === 'perso')} onClick={() => setCreneau('perso')}>
                {creneauVu === 'perso' ? '✓ ' : ''}{T.perso}
              </button>
            </div>
            {creneauVu === 'perso' && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: R.texteSecondaire }}>{T.de}
                  <input type="time" value={deVu} onChange={(e) => setDe(e.target.value)} style={champHeure} /></label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: R.texteSecondaire }}>{T.a}
                  <input type="time" value={aVu} onChange={(e) => setA(e.target.value)} style={champHeure} /></label>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: R.texteSecondaire }}>{T.jours}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[1, 2, 3, 4, 5, 6, 7].map((j) => {
                  const on = joursVus.includes(j);
                  return (
                    <button key={j} type="button" aria-pressed={on} aria-label={T.jourLong[j - 1]} className="rg-focus" style={puce(on)}
                      onClick={() => setJours(on ? joursVus.filter((x) => x !== j) : [...joursVus, j])}>{T.jourCourt[j - 1]}</button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: R.texteSecondaire }}>{T.parJour}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <button type="button" aria-pressed={plafondVu == null} className="rg-focus" style={puce(plafondVu == null)} onClick={() => setPlafond(null)}>
                  {plafondVu == null ? '✓ ' : ''}{T.sansPlafond}
                </button>
                <input type="number" inputMode="numeric" min="1" max="500" value={plafondVu ?? ''} placeholder="10" aria-label={T.parJour}
                  onChange={(e) => setPlafond(e.target.value === '' ? null : Math.max(1, Math.min(500, Math.round(Number(e.target.value)))))}
                  style={{ ...champHeure, width: 100 }} />
              </div>
            </div>

            {faute ? <div role="alert" style={{ fontSize: 12.5, color: R.negatifTexte, fontWeight: 600 }}>{faute}</div> : null}
            <Bouton onClick={enregistrer} enCours={enCours} style={{ width: '100%' }}>{T.enregistrer}</Bouton>
          </Carte>
          <Note>{T.note}</Note>
        </Groupe>
      )}
    </>
  );
}
