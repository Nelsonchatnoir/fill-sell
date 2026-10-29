// ═══════════════════════════════════════════════════════════════════════════
// LE MICRO DE CHAQUE CHAMP DE TEXTE (29/10, lot B 1.3)
// ═══════════════════════════════════════════════════════════════════════════
// Demande de Nico : « la dictée vocale reprise partout où le vendeur peut
// écrire ». UN composant, le moteur de utils/dictee.js (on enregistre, notre
// serveur transcrit — voice-transcribe) :
//   · le texte dicté s'AJOUTE à la fin (un espace, ou un saut de ligne avec
//     separateur="\n"), jamais à la place ; une dictée vide, refusée ou ratée
//     ne touche pas au champ et se DIT sous le champ ;
//   · il passe par le MÊME chemin que la frappe. Champ contrôlé : `valeur` +
//     `onChange(nouvelleValeur)`. Champ non contrôlé (defaultValue + onBlur) :
//     pas de `valeur` — la nouvelle valeur est posée dans le champ, et
//     `onChange` reçoit ce que son blur aurait enregistré. Une dictée vaut une
//     saisie : aucune écriture en base de plus que la frappe ;
//   · le curseur : au bout s'il était au bout, sinon il reste où il était ; le
//     focus n'est jamais pris (pas de clavier qui surgit sur un téléphone) ;
//   · un seul micro actif dans l'app (reserverMicro) ;
//   · pas d'enregistrement possible (dicteeDisponible faux) → rien ne s'affiche.
// PLACEMENT : juste APRÈS le champ. La cible est l'élément qui précède (ou
// l'input/textarea qu'il contient, cf. components/Field.jsx) ; `cible` (une
// ref) la désigne autrement.
// COULEURS : les jetons --fs-* quand le parent est dans .fsn ; hors de .fsn,
// la variable n'existe pas et retombe sur la palette UI (components/ui.jsx).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { UI } from './ui';
import { ajouterDictee, curseurApresDictee, demarrerDictee, dicteeDisponible, reserverMicro } from '../utils/dictee';

const TEXTES = {
  fr: { dicter: 'Dicter', arreter: 'Arrêter la dictée', ecoute: "J'écoute… parle, puis touche à nouveau le micro.", transcription: 'Je transcris…' },
  en: { dicter: 'Dictate', arreter: 'Stop dictation', ecoute: 'Listening… speak, then tap the mic again.', transcription: 'Transcribing…' },
};

const jeton = (nom, repli) => `var(--fs-${nom}, ${repli})`;
const TONS = {
  repos: { fond: jeton('chip', UI.chip), encre: jeton('ink2', '#3A4742'), bord: jeton('border', UI.border) },
  ecoute: { fond: jeton('bad-fond', '#FBEFEC'), encre: jeton('bad', UI.negative), bord: jeton('bad-bord', '#EBC9C2') },
  transcription: { fond: jeton('teal-fond', '#EFF4F2'), encre: jeton('teal-ink', UI.tealDeep), bord: jeton('teal-bord', '#D6E2DE') },
};

const mouvementReduit = () => {
  try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
};

function trouverChamp(ligne, cible) {
  if (cible?.current) return cible.current;
  const avant = ligne?.previousElementSibling;
  if (!avant) return null;
  if (avant.matches?.('input, textarea')) return avant;
  return avant.querySelector?.('textarea, input:not([type="hidden"])') ?? null;
}

function IconeMicro() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="9" y="2.5" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3.5" />
    </svg>
  );
}

function IconeTranscription({ fixe }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M12 3a9 9 0 1 0 9 9">
        {fixe ? null : <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />}
      </path>
    </svg>
  );
}

export default function BoutonDictee({ valeur, onChange, lang = 'fr', separateur = ' ', disabled = false, cible = null, style = null }) {
  const [disponible] = useState(() => dicteeDisponible());
  const [etat, setEtat] = useState('repos');
  const [message, setMessage] = useState(null);
  const ligneRef = useRef(null);
  const ctrlRef = useRef(null);
  const ouvertureRef = useRef(false);
  const libererRef = useRef(null);
  const vivantRef = useRef(true);
  const curseurRef = useRef(null);
  // Les DERNIÈRES valeur et onChange : la transcription arrive des secondes
  // après le geste, et la personne a pu taper entre-temps.
  const derniersRef = useRef({ valeur, onChange, separateur });
  useLayoutEffect(() => { derniersRef.current = { valeur, onChange, separateur }; });
  // Champ contrôlé : le curseur se remet APRÈS le rendu qui porte la nouvelle valeur.
  useLayoutEffect(() => {
    const remettre = curseurRef.current;
    if (!remettre) return;
    curseurRef.current = null;
    remettre();
  });
  useEffect(() => {
    vivantRef.current = true;
    return () => {
      vivantRef.current = false;
      ctrlRef.current?.annuler();
      libererRef.current?.();
    };
  }, []);

  const t = TEXTES[lang === 'en' ? 'en' : 'fr'];

  const poser = (texte) => {
    const { valeur: v, onChange: changer, separateur: sep } = derniersRef.current;
    const champ = trouverChamp(ligneRef.current, cible);
    const controle = v !== undefined && v !== null;
    const avant = String(controle ? v : (champ?.value ?? ''));
    const apres = ajouterDictee(avant, texte, sep);
    if (apres === avant) return;
    const focalise = Boolean(champ) && typeof document !== 'undefined' && document.activeElement === champ;
    let selection = null;
    if (focalise) { try { selection = { debut: champ.selectionStart, fin: champ.selectionEnd }; } catch { /* champ sans sélection */ } }
    if (!controle && champ) champ.value = apres;
    try { changer?.(apres); } catch (err) { console.warn('[dictée] champ non mis à jour :', err?.message ?? err); }
    if (!focalise) return;
    const remettre = () => {
      try {
        if (document.activeElement !== champ) return;
        const c = curseurApresDictee(avant, selection, champ.value.length);
        champ.setSelectionRange(c.debut, c.fin);
      } catch { /* type de champ sans curseur */ }
    };
    if (!controle) { remettre(); return; }
    curseurRef.current = remettre;
    // Valeur inchangée après onChange (plafond déjà atteint) : aucun rendu ne
    // viendra — le curseur n'attend pas la frappe suivante pour sauter.
    setTimeout(() => { if (curseurRef.current === remettre) curseurRef.current = null; }, 250);
  };

  const basculer = async () => {
    // Arrêter reste possible même si le champ vient d'être grisé (un envoi parti).
    if (etat === 'ecoute') { ctrlRef.current?.arreter(); return; }
    if (disabled || etat === 'transcription' || ouvertureRef.current) return;
    setMessage(null);
    ouvertureRef.current = true;
    ctrlRef.current = null;
    let repris = false;
    const liberer = reserverMicro(() => { repris = true; ctrlRef.current?.arreter(); });
    libererRef.current = liberer;
    const rendre = () => { liberer(); if (libererRef.current === liberer) libererRef.current = null; };
    try {
      const ctrl = await demarrerDictee({
        lang: lang === 'en' ? 'en' : 'fr',
        isNative: Capacitor.isNativePlatform(),
        onEtat: (e) => { setEtat(e); if (e !== 'ecoute') rendre(); },
        onMessage: setMessage,
        onTexte: poser,
      });
      ctrlRef.current = ctrl;
      if (!ctrl) rendre();
      // Champ fermé, ou un autre micro démarré, pendant l'ouverture : rien n'a été dit, on rend le micro.
      else if (repris || !vivantRef.current) { ctrl.annuler(); rendre(); }
    } finally {
      ouvertureRef.current = false;
    }
  };

  if (!disponible) return null;
  const ecoute = etat === 'ecoute';
  const occupe = etat === 'transcription';
  const ton = TONS[ecoute ? 'ecoute' : occupe ? 'transcription' : 'repos'];
  const ligne = ecoute ? t.ecoute : occupe ? t.transcription : message;
  return (
    <div ref={ligneRef} data-dictee="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minHeight: 44, ...style }}>
      <div role="status" aria-live="polite" style={{
        flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.45, textAlign: 'left',
        color: message && !ecoute && !occupe ? jeton('amber-ink', '#8A6100') : jeton('mute', UI.mute2),
      }}>{ligne}</div>
      <button
        type="button"
        onClick={basculer}
        // Toucher le micro ne retire pas le focus au champ (son curseur, son blur).
        onMouseDown={(e) => e.preventDefault()}
        disabled={(disabled && !ecoute) || occupe}
        aria-label={t.dicter}
        aria-pressed={ecoute}
        aria-busy={occupe || undefined}
        title={ecoute ? t.arreter : t.dicter}
        style={{
          width: 44, height: 44, minWidth: 44, padding: 0, margin: 0, border: 'none', borderRadius: '50%',
          background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
          cursor: disabled && !ecoute ? 'not-allowed' : occupe ? 'progress' : 'pointer', opacity: disabled && !ecoute ? 0.45 : 1,
          WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit',
        }}
      >
        <span aria-hidden="true" style={{
          width: 36, height: 36, borderRadius: '50%', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: ton.fond, color: ton.encre, border: `1px solid ${ton.bord}`,
          boxShadow: ecoute ? `0 0 0 3px ${TONS.ecoute.fond}` : 'none', transition: 'background .15s, box-shadow .15s',
        }}>
          {occupe ? <IconeTranscription fixe={mouvementReduit()} /> : <IconeMicro />}
        </span>
      </button>
    </div>
  );
}
