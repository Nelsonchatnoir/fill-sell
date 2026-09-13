// ═══════════════════════════════════════════════════════════════════════════
// REPUBLICATION AUTOMATIQUE PAR CRÉNEAUX — lot APP (2026-09-13)
// ═══════════════════════════════════════════════════════════════════════════
// Trois surfaces, un seul contrat : ce que rend `republish_planifiee_etat()`
// (migration 20260912130200). L'app FORMATE, elle ne recalcule rien — le
// serveur fait autorité (doctrine du 04/09). Réglages écrits par
// `republish_planifiee_regler(p)` (patch fusionné, validé côté serveur, qui
// rend l'état complet après écriture). Historique lu dans `republish_creneaux`
// (RLS : ses propres lignes, lecture seule) + les jobs estampillés
// `platform_fields.republish_creneau_id`.
//
//   1. RepublicationPlanifieeBloc      — bloc compact EN TÊTE du Stock :
//      l'état, le créneau, LE NOMBRE QUI VA RÉELLEMENT PARTIR. Rien d'autre.
//   2. RepublicationPlanifieeReglages  — écran plein (portail) : activation,
//      créneau, jours, plafond, ancienneté, ordre, boutiques.
//   3. RepublicationPlanifieeHistorique — écran plein à part : créneau par
//      créneau, ce qui est parti, quand, ce qui a été sauté et pourquoi.
//
// 🔴 LE NOMBRE (décision Nico 12/09) : `attendu` = min(plafond restant,
// éligibles, capacité du créneau) — calculé par le serveur sur l'espacement
// RÉEL mesuré (médiane du compte, repli parc 354 s, pause 50/120 min
// comprise : 2 h ≈ 20, 11 h ≈ 91 — relu en prod le 13/09). L'app n'y ajoute
// que des bornes qui font BAISSER le chiffre, jamais monter : le quota
// MENSUEL restant (le RPC refuse au-delà), une extension jamais vue ou muette
// depuis 7 jours (le RPC refuse aussi), et l'interrupteur global
// `republish_planifiee_actif` (branche inerte à 0 : rien ne part). Une borne
// inconnue → « — », jamais un chiffre optimiste.
//
// RÉSERVÉ AU PRO : `autorise` vient du serveur (republish_palier). Un compte
// non autorisé voit le bloc avec « Activer », qui ouvre la modale de
// conversion existante (openUpgradeModal) — exactement le comportement
// actuel de l'accroche É6, rien de neuf. Les maquettes qui montrent un écran
// Premium sont périmées sur ce point (module PRO, correction du 12/09 15h30).
//
// EXPOSITION : ce lot ne monte le module que si l'interrupteur global vaut 1
// OU si le compte porte déjà un réglage (test à la main, par SQL). Sinon
// l'écran Stock garde l'ancien bloc É6, intact. À 0, un compte réglé voit
// « pas encore en service » et un nombre à « — » : la branche serveur ne
// crée rien, le bloc ne promet rien.
//
// FUSEAU : la voie planifiée compte à MINUIT LOCAL. Le fuseau de l'appareil
// est envoyé à chaque écriture (`fuseau`), le serveur le valide ; toutes les
// heures affichées se lisent dans le fuseau du réglage rendu — jamais dans
// celui du navigateur ni en dur Europe/Paris.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, RefreshCw, Minus, Plus, History } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { track } from '../analytics/analytics';
import { useFondFige } from '../utils/modale';
import { fuseauLocal, extensionRefuse, nombreAttendu } from '../hooks/useRepublicationPlanifiee';

// ── Palette : celle des maquettes (RepublicationAutoCard.dc.html) = UI de
// ui.jsx + les deux ambres de la carte. ─────────────────────────────────────
const P = {
  canvas: '#EDEAE0', paper: '#F6F5F1', ink: '#10201B',
  teal: '#2F9E90', tealDeep: '#1B6E62',
  amber: '#E8956D', amberInk: '#B8672F', amberBg: '#FBF3EC',
  mute: '#8A8578', mute2: '#6B7A75', border: '#E7E3D8', chip: '#F2F0E9', off: '#D8D2C4',
  rouge: '#B0645A', rougeBg: '#FBEDEC',
};
const FONT = "'Space Grotesk', -apple-system, BlinkMacSystemFont, system-ui, sans-serif";

const CSS = `
@keyframes rpRing { to { transform: rotate(360deg); } }
@keyframes rpPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(47,158,144,.45); } 70% { box-shadow: 0 0 0 8px rgba(47,158,144,0); } }
@keyframes rpFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes rpSlideUp { from { transform: translateY(18px); opacity: 0; } to { transform: none; opacity: 1; } }
.rp-tap { cursor: pointer; transition: transform .12s ease, box-shadow .2s ease; }
.rp-tap:active { transform: scale(.992); }
.rp-btn { font-family: inherit; cursor: pointer; border: none; }
.rp-btn:disabled { cursor: default; opacity: .55; }
.rp-input-time { height: 40px; padding: 0 12px; border-radius: 12px; border: 1px solid ${P.border}; background: ${P.paper}; font-weight: 600; font-size: 14px; color: ${P.ink}; outline: none; font-family: inherit; }
.rp-input-time:focus { border-color: ${P.teal}; }
.rp-num { width: 56px; text-align: center; font-weight: 700; font-size: 18px; letter-spacing: -.02em; border: none; background: transparent; font-family: inherit; color: ${P.ink}; outline: none; -moz-appearance: textfield; }
.rp-num::-webkit-outer-spin-button, .rp-num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
`;

// ── Constantes du module (miroir du serveur : presets FIXES) ─────────────────
const PRESETS = {
  matin: { de: '08:00', a: '10:00' },
  midi:  { de: '12:00', a: '14:00' },
  soir:  { de: '19:00', a: '22:00' },
};
const AGE_MIN = 7;      // plancher anti-ban (09/08), jamais rebaissé
const AGE_MAX = 365;
const PLAFOND_ILLIMITE = 10000; // au-delà : Business, « sans maximum »

// ── Formats ──────────────────────────────────────────────────────────────────
// '08:00' → « 8h » / « 8h30 » (fr) · « 8:00 » (en). Jamais « Invalid ».
function fmtHHMM(hhmm, fr) {
  const [h, m] = String(hhmm ?? '').split(':');
  const H = Number(h);
  if (!Number.isFinite(H)) return '—';
  const mm = String(m ?? '00').slice(0, 2).padStart(2, '0');
  return fr ? `${H}h${mm === '00' ? '' : mm}` : `${H}:${mm}`;
}
function fmtCreneau(de, a, fr) { return `${fmtHHMM(de, fr)}–${fmtHHMM(a, fr)}`; }

// Heure d'un instant ISO dans le FUSEAU DU RÉGLAGE. Instant illisible → null.
function heureDans(iso, fuseau, fr) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  try {
    const s = new Date(t).toLocaleTimeString('en-GB', { timeZone: fuseau, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
    return fr ? fmtHHMM(s, true) : s; // même forme que le créneau : « 8h », « 8h30 »
  } catch { return null; }
}
function jourDans(t, fuseau) {
  try { return new Date(t).toLocaleDateString('en-CA', { timeZone: fuseau }); }
  catch { return new Date(t).toLocaleDateString('en-CA'); }
}
// « aujourd'hui » / « demain » / « lundi » — le jour se LIT sur l'instant, dans
// le fuseau du réglage (jamais déduit d'un compteur).
function jourRelatif(iso, fuseau, fr) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  const j = jourDans(t, fuseau);
  const now = Date.now();
  if (j === jourDans(now, fuseau)) return fr ? "aujourd'hui" : 'today';
  if (j === jourDans(now + 86400000, fuseau)) return fr ? 'demain' : 'tomorrow';
  try { return new Date(t).toLocaleDateString(fr ? 'fr-FR' : 'en-GB', { weekday: 'long', timeZone: fuseau }); }
  catch { return null; }
}
// En-tête d'une ligne d'historique : « Aujourd'hui » / « Hier » / « Mardi 9 ».
function jourHistorique(iso, fuseau, fr) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '—';
  const j = jourDans(t, fuseau);
  const now = Date.now();
  if (j === jourDans(now, fuseau)) return fr ? "Aujourd'hui" : 'Today';
  if (j === jourDans(now - 86400000, fuseau)) return fr ? 'Hier' : 'Yesterday';
  try {
    const s = new Date(t).toLocaleDateString(fr ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', timeZone: fuseau });
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch { return '—'; }
}
const cap1 = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const nf = (n, fr) => new Intl.NumberFormat(fr ? 'fr-FR' : 'en-GB').format(n);
const plur = (n, s, p) => (n > 1 ? p : s);

// Libellé d'un jour ISO (1 = lundi).
const JOURS = { fr: ['L', 'M', 'M', 'J', 'V', 'S', 'D'], en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] };
function resumeJours(jours, fr) {
  const j = Array.isArray(jours) ? jours.map(Number).filter((x) => x >= 1 && x <= 7) : [];
  if (j.length === 7) return fr ? 'tous les jours' : 'every day';
  if (j.length === 0) return fr ? 'aucun jour' : 'no day';
  const semaine = [1, 2, 3, 4, 5].every((d) => j.includes(d)) && !j.includes(6) && !j.includes(7);
  if (semaine) return fr ? 'en semaine' : 'weekdays';
  const we = j.length === 2 && j.includes(6) && j.includes(7);
  if (we) return fr ? 'le week-end' : 'weekends';
  return fr ? `${j.length} jours sur 7` : `${j.length} days a week`;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEXTES — motifs serveur mis en mots (jamais un code brut à l'écran, sauf
// inconnu, où le code vaut mieux qu'un silence).
// ═══════════════════════════════════════════════════════════════════════════
function texteMotifSaut(motif, fr) {
  const M = {
    en_cours:            fr ? 'Une republication était déjà en cours pour cette annonce.' : 'A repost was already under way for this listing.',
    attente_decision:    fr ? 'Elle attend une action de ta part (voir la carte de l’article).' : 'It is waiting for an action from you (see the item card).',
    echec_recent:        fr ? 'Un essai a échoué il y a moins de 24 h : mise de côté un jour.' : 'An attempt failed less than 24 h ago: set aside for a day.',
    republiee_recemment: fr ? 'Republiée il y a moins de 24 h.' : 'Reposted less than 24 h ago.',
    observee_trop_recente: fr ? 'Vue en ligne trop récemment d’après tes relevés.' : 'Seen online too recently according to your syncs.',
    autre_boutique:      fr ? 'Chrome était connecté à une autre boutique : elle attend son créneau.' : 'Chrome was signed in to another shop: it waits for its own slot.',
    cadence_24h:         fr ? 'Republiée il y a moins de 24 h.' : 'Reposted less than 24 h ago.',
    republish_en_cours:  fr ? 'Une republication était déjà en cours pour cette annonce.' : 'A repost was already under way for this listing.',
    article_sans_photo:  fr ? 'Sans photo : la republication ne peut pas aboutir.' : 'No photo: the repost cannot go through.',
    invalid_item:        fr ? 'Identifiant Vinted illisible.' : 'Unreadable Vinted id.',
  };
  return M[motif] ?? (fr ? `Sautée (${motif}).` : `Skipped (${motif}).`);
}
function texteMotifCompte(motif, fr) {
  const M = {
    plafond_jour:            fr ? 'Plafond du jour atteint.' : 'Daily cap reached.',
    plafond_auto_atteint:    fr ? 'Plafond du jour atteint.' : 'Daily cap reached.',
    plafond_boutique:        fr ? 'Plafond du jour de cette boutique atteint.' : 'This shop’s daily cap reached.',
    plafond_boutique_atteint: fr ? 'Plafond du jour de cette boutique atteint.' : 'This shop’s daily cap reached.',
    extension_required:      fr ? 'Aucune extension Chrome connue pour ce compte.' : 'No Chrome extension known for this account.',
    extension_stale:         fr ? 'Ton extension ne s’était pas manifestée depuis plus d’une semaine.' : 'Your extension had not checked in for over a week.',
    extension_trop_ancienne: fr ? 'Version de l’extension trop ancienne.' : 'Extension version too old.',
    auto_reserve_pro:        fr ? 'Le compte n’était plus Pro.' : 'The account was no longer Pro.',
    insufficient_coins:      fr ? 'Solde insuffisant.' : 'Insufficient balance.',
    exception:               fr ? 'Incident côté serveur — rien n’a été retiré.' : 'Server-side incident — nothing was removed.',
  };
  return M[motif] ?? (fr ? `Arrêt du passage (${motif}).` : `Pass stopped (${motif}).`);
}
function texteErreurReglage(code, fr) {
  const M = {
    auto_reserve_pro: fr ? 'La republication automatique est réservée au plan Pro.' : 'Automatic reposting is a Pro plan feature.',
    creneau_invalide: fr ? 'L’heure de fin doit être après l’heure de début, le même jour.' : 'End time must be after start time, on the same day.',
    jours_invalides:  fr ? 'Choisis au moins un jour.' : 'Pick at least one day.',
    reseau:           fr ? 'Réglage non enregistré (réseau). Réessaie.' : 'Setting not saved (network). Try again.',
    unauthorized:     fr ? 'Session expirée — reconnecte-toi.' : 'Session expired — sign in again.',
  };
  return M[code] ?? (fr ? `Réglage refusé (${code}).` : `Setting refused (${code}).`);
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNTHÈSE D'ÉTAT — une seule lecture de l'état pour les trois surfaces.
// ═══════════════════════════════════════════════════════════════════════════
function synthese(etat, { fr, enService, extensionStatus }) {
  const r = etat?.reglage ?? null;
  const fuseau = r?.fuseau ?? fuseauLocal();
  const actif = etat?.actif === true;
  const autorise = etat?.autorise === true;
  const creneau = r?.creneau ?? 'matin';
  const de = r?.de ?? PRESETS[creneau]?.de ?? '08:00';
  const a = r?.a ?? PRESETS[creneau]?.a ?? '10:00';
  const jours = Array.isArray(r?.jours) ? r.jours.map(Number) : [1, 2, 3, 4, 5, 6, 7];
  const fen = etat?.fenetre ?? null;
  const dans = fen?.dans_creneau === true;
  const prochain = dans ? fen?.courant_debut : fen?.prochain_debut;
  const fin = dans ? fen?.courant_fin : fen?.prochain_fin;
  const quota = Number(etat?.quota_mensuel);
  const faits = Number(etat?.faits_mois);
  const quotaConnu = Number.isFinite(quota) && quota > 0 && Number.isFinite(faits);
  const quotaPlein = quotaConnu && faits >= quota;
  const quotaProche = quotaConnu && !quotaPlein && faits / quota >= 0.9;
  const dernier = etat?.dernier_creneau ?? null;
  const manque = actif && dernier?.statut === 'manque';
  const ext = extensionRefuse(extensionStatus);
  const nombre = nombreAttendu(etat, { enService, extensionStatus });
  const moteurLegacy = !actif && etat?.moteur === 'legacy';
  const invalide = r?.invalide ?? null;

  // La ligne d'état sous le titre : UNE phrase, la plus utile.
  let etatLigne; let etatTon = 'mute';
  if (!actif) {
    if (!autorise) { etatLigne = fr ? 'Réservée au plan Pro' : 'Pro plan feature'; }
    else if (moteurLegacy) { etatLigne = fr ? 'Mode classique en cours' : 'Classic mode running'; etatTon = 'amber'; }
    else if (invalide && invalide !== 'palier') { etatLigne = fr ? 'Réglage à corriger' : 'Setting needs fixing'; etatTon = 'amber'; }
    else { etatLigne = fr ? 'Inactive' : 'Off'; }
  } else if (enService === false) {
    etatLigne = fr ? 'Active · pas encore en service' : 'On · not in service yet'; etatTon = 'amber';
  } else if (ext === 'jamais') {
    etatLigne = fr ? 'Active · extension Chrome jamais vue' : 'On · Chrome extension never seen'; etatTon = 'amber';
  } else if (ext === 'muette') {
    etatLigne = fr ? 'Active · extension muette depuis 7 jours' : 'On · extension silent for 7 days'; etatTon = 'amber';
  } else if (quotaPlein) {
    etatLigne = fr ? 'Active · compteur du mois plein' : 'On · monthly counter full'; etatTon = 'amber';
  } else if (manque) {
    etatLigne = fr ? 'Active · dernier créneau manqué' : 'On · last slot missed'; etatTon = 'amber';
  } else if (dans) {
    etatLigne = fr ? `Active · en cours jusqu'à ${fmtHHMM(a, fr)}` : `On · running until ${fmtHHMM(a, fr)}`; etatTon = 'teal';
  } else {
    etatLigne = fr ? `Active · ${fmtCreneau(de, a, fr)} · ${resumeJours(jours, fr)}` : `On · ${fmtCreneau(de, a, fr)} · ${resumeJours(jours, fr)}`; etatTon = 'teal';
  }

  // L'avis (au plus un) : ce qui empêche ou a empêché le passage.
  let avis = null;
  if (actif && enService === false) {
    avis = { ton: 'amber',
      titre: fr ? 'Pas encore en service' : 'Not in service yet',
      corps: fr ? 'Tes réglages sont enregistrés. Les créneaux ne sont pas encore ouverts par FillSell : rien ne partira d’ici là, et tu n’as rien à faire.'
                : 'Your settings are saved. FillSell has not opened time slots yet: nothing will go out until then, and there is nothing to do.' };
  } else if (actif && ext === 'jamais') {
    avis = { ton: 'amber',
      titre: fr ? 'Il manque l’extension Chrome' : 'The Chrome extension is missing',
      corps: fr ? 'La republication passe par l’extension FillSell sur un ordinateur. Tant qu’aucune extension n’est connue pour ce compte, rien ne partira.'
                : 'Reposting runs through the FillSell extension on a computer. Until an extension is known for this account, nothing will go out.' };
  } else if (actif && ext === 'muette') {
    avis = { ton: 'amber',
      titre: fr ? 'Ton extension ne s’est pas manifestée depuis plus d’une semaine' : 'Your extension has been silent for over a week',
      corps: fr ? 'Ouvre Chrome sur ton ordinateur pour la réveiller. Rien ne partira avant.' : 'Open Chrome on your computer to wake it up. Nothing will go out before that.' };
  } else if (actif && quotaPlein) {
    avis = { ton: 'amber',
      titre: fr ? `${nf(quota, fr)} republications ce mois : le compteur est plein.` : `${nf(quota, fr)} reposts this month: the counter is full.`,
      corps: fr ? 'Les republications reprennent au renouvellement de ton forfait. Tes réglages et ta file sont conservés.'
                : 'Reposting resumes when your plan renews. Your settings and queue are kept.' };
  } else if (manque) {
    const h = fmtCreneau(dernier.de, dernier.a, fr);
    const j = jourHistorique(dernier.debut, dernier.fuseau ?? fuseau, fr);
    const prochainTxt = prochain ? `${jourRelatif(prochain, fuseau, fr)} ${fr ? 'à' : 'at'} ${heureDans(prochain, fuseau, fr)}` : null;
    avis = { ton: 'neutre',
      titre: dernier.extension_vue
        ? (fr ? `${j}, ${h} : rien n’est parti.` : `${j}, ${h}: nothing went out.`)
        : (fr ? `${j}, ${h} : rien n’est parti, Chrome était fermé.` : `${j}, ${h}: nothing went out, Chrome was closed.`),
      corps: dernier.extension_vue
        ? (fr ? 'L’historique dit pourquoi, annonce par annonce.' : 'The history says why, listing by listing.')
        : (fr ? `Les annonces éligibles sont toujours en file. Prochaine tentative ${prochainTxt ?? 'au prochain créneau'}, dès que Chrome est ouvert.`
              : `Eligible listings are still queued. Next attempt ${prochainTxt ?? 'at the next slot'}, as soon as Chrome is open.`) };
  } else if (actif && quotaProche) {
    avis = { ton: 'amber',
      titre: fr ? `${nf(quota - faits, fr)} republications restantes ce mois.` : `${nf(quota - faits, fr)} reposts left this month.`,
      corps: fr ? 'Le compteur repart de zéro au renouvellement de ton forfait.' : 'The counter resets when your plan renews.' };
  } else if (actif && nombre?.borne === 'creneau' && Number(etat?.eligibles?.total) > nombre.n) {
    avis = { ton: 'neutre',
      titre: fr ? `Le créneau en permet ${nombre.n} sur ${nf(Number(etat.eligibles.total), fr)} éligibles.` : `The slot allows ${nombre.n} of ${nf(Number(etat.eligibles.total), fr)} eligible.`,
      corps: fr ? 'Au rythme réel de tes republications, pauses comprises. Les autres attendent le créneau suivant — jamais de rafale.'
                : 'At the real pace of your reposts, pauses included. The others wait for the next slot — never a burst.' };
  }

  return { r, fuseau, actif, autorise, creneau, de, a, jours, fen, dans, prochain, fin, quota, faits, quotaConnu, quotaPlein, quotaProche,
    dernier, manque, ext, nombre, moteurLegacy, invalide, etatLigne, etatTon, avis };
}

const tonCouleur = (ton) => (ton === 'teal' ? P.teal : ton === 'amber' ? P.amberInk : P.mute);

// ═══════════════════════════════════════════════════════════════════════════
// PRIMITIVES VISUELLES (langage des maquettes)
// ═══════════════════════════════════════════════════════════════════════════
function IconeCycle({ actif, attention, tourne }) {
  return (
    <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: P.chip, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <RefreshCw size={17} strokeWidth={2.4} color={!actif ? P.mute : attention ? P.amber : P.teal} />
      </div>
      {tourne && (
        <svg width="44" height="44" viewBox="0 0 44 44" style={{ position: 'absolute', inset: 0, animation: 'rpRing 3.2s linear infinite' }} aria-hidden="true">
          <circle cx="22" cy="22" r="20.5" fill="none" stroke="rgba(47,158,144,.18)" strokeWidth="2" />
          <circle cx="22" cy="22" r="20.5" fill="none" stroke={P.teal} strokeWidth="2" strokeDasharray="52 77" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

function PastillePro() {
  return (
    <span style={{ fontWeight: 800, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: P.ink, background: `linear-gradient(120deg,${P.amber},#F2B48C)`, borderRadius: 999, padding: '3px 8px', flexShrink: 0 }}>
      PRO
    </span>
  );
}

function Interrupteur({ on, onChange, disabled, taille = 48, label }) {
  const h = Math.round(taille * 0.58); const k = h - 6;
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onChange}
      className="rp-btn"
      style={{ flexShrink: 0, width: taille, height: h, borderRadius: 999, padding: 3, transition: 'background .2s', background: on ? P.teal : P.off }}>
      <span style={{ display: 'block', width: k, height: k, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'transform .2s', transform: on ? `translateX(${taille - k - 6}px)` : 'translateX(0)' }} />
    </button>
  );
}

function Pilule({ actif, onClick, children, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="rp-btn"
      style={{ padding: '8px 14px', borderRadius: 999, fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap', transition: 'background .15s,color .15s', background: actif ? P.ink : P.chip, color: actif ? '#fff' : P.mute2 }}>
      {children}
    </button>
  );
}

// Stepper : −/+ ET saisie directe (7 → 365 à coups de 1, ce serait une
// punition). La valeur est bornée ICI pour l'affichage, et RE-bornée par le
// serveur — le serveur gagne.
function Stepper({ valeur, min, max, pas = 1, onChange, suffixe = null, disabled, label }) {
  const [saisie, setSaisie] = useState(String(valeur));
  useEffect(() => { setSaisie(String(valeur)); }, [valeur]);
  const borner = (v) => Math.min(max, Math.max(min, Math.round(Number(v) || min)));
  const valider = () => { const v = borner(saisie); setSaisie(String(v)); if (v !== valeur) onChange(v); };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${P.border}`, borderRadius: 14, background: P.paper, overflow: 'hidden' }}>
      <button type="button" className="rp-btn" aria-label={`− ${label ?? ''}`} disabled={disabled || valeur <= min} onClick={() => onChange(borner(valeur - pas))}
        style={{ width: 40, height: 44, background: 'transparent', color: P.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Minus size={18} strokeWidth={2.4} />
      </button>
      <input className="rp-num" type="number" inputMode="numeric" min={min} max={max} value={saisie} aria-label={label} disabled={disabled}
        onChange={(e) => setSaisie(e.target.value)} onBlur={valider}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      <button type="button" className="rp-btn" aria-label={`+ ${label ?? ''}`} disabled={disabled || valeur >= max} onClick={() => onChange(borner(valeur + pas))}
        style={{ width: 40, height: 44, background: 'transparent', color: P.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Plus size={18} strokeWidth={2.4} />
      </button>
      {suffixe && <span style={{ padding: '0 14px 0 2px', fontWeight: 500, fontSize: 13, color: P.mute }}>{suffixe}</span>}
    </div>
  );
}

function Section({ titre, sousTitre, children, dernier = false }) {
  return (
    <div style={{ padding: '16px 0', borderBottom: dernier ? 'none' : `1px solid ${P.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: P.ink }}>{titre}</div>
        {sousTitre && <div style={{ fontWeight: 500, fontSize: 12, color: P.mute }}>{sousTitre}</div>}
      </div>
      {children}
    </div>
  );
}

function Cellule({ label, valeur, sous, couleur = P.ink, fond = P.paper, labelCouleur = P.mute, enfant = null }) {
  return (
    <div style={{ background: fond, padding: '13px 14px', minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.12em', color: labelCouleur, lineHeight: 1.3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 'clamp(20px,5.5vw,26px)', letterSpacing: '-.03em', lineHeight: 1, whiteSpace: 'nowrap', color: couleur, fontVariantNumeric: 'tabular-nums' }}>{valeur}</span>
        {sous && <span style={{ fontWeight: 500, fontSize: 12, color: labelCouleur, lineHeight: 1.3 }}>{sous}</span>}
      </div>
      {enfant}
    </div>
  );
}

// Écran plein (portail) : canvas, colonne centrée, en-tête avec retour.
function EcranPlein({ titre, sousTitre, onClose, droite = null, children, pied = null }) {
  useFondFige(true);
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9990, background: P.canvas, display: 'flex', flexDirection: 'column', fontFamily: FONT, color: P.ink, animation: 'rpFadeIn .18s ease' }}>
      <style>{CSS}</style>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 'calc(env(safe-area-inset-top,0px) + 12px) 14px calc(env(safe-area-inset-bottom,0px) + 28px)' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', animation: 'rpSlideUp .22s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 4px 14px' }}>
            <button type="button" onClick={onClose} aria-label="Retour" className="rp-btn"
              style={{ width: 36, height: 36, borderRadius: '50%', background: P.chip, display: 'flex', alignItems: 'center', justifyContent: 'center', color: P.ink, flexShrink: 0 }}>
              <ChevronLeft size={20} strokeWidth={2.4} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-.01em', lineHeight: 1.2 }}>{titre}</div>
              {sousTitre && <div style={{ fontWeight: 500, fontSize: 12.5, color: P.mute, marginTop: 2 }}>{sousTitre}</div>}
            </div>
            {droite}
          </div>
          {children}
          {pied}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. LE BLOC COMPACT — en tête du Stock.
// ═══════════════════════════════════════════════════════════════════════════
// Trois choses : l'état (ligne sous le titre), le créneau (cellule gauche), le
// nombre qui va réellement partir (cellule droite). Un avis en pied SEULEMENT
// s'il change ce que le nombre veut dire (créneau manqué, hors service,
// extension muette, compteur plein, créneau qui borne).
export function RepublicationPlanifieeBloc({ lang, etat, interrupteur, extensionStatus, busy = false, onOuvrirReglages, onActiver, onActiverNonPro }) {
  const fr = lang !== 'en';
  const enService = interrupteur === 1;
  const s = synthese(etat, { fr, enService, extensionStatus });
  const { actif, autorise } = s;
  const nombre = s.nombre;
  const ouvrir = () => {
    if (!autorise) { onActiverNonPro?.(); return; }
    track('republication_planifiee', { action: 'ouvrir_reglages', depuis: 'bloc_stock' });
    onOuvrirReglages?.();
  };
  const activer = (e) => {
    e.stopPropagation();
    if (!autorise) { onActiverNonPro?.(); return; }
    onActiver?.();
  };

  // Cellule créneau.
  const creneauValeur = fmtCreneau(s.de, s.a, fr);
  let creneauSous;
  if (!actif) creneauSous = s.r ? resumeJours(s.jours, fr) : (fr ? 'proposé' : 'suggested');
  else if (s.dans) creneauSous = fr ? `en cours · jusqu'à ${fmtHHMM(s.a, fr)}` : `running · until ${fmtHHMM(s.a, fr)}`;
  else creneauSous = s.prochain ? jourRelatif(s.prochain, s.fuseau, fr) : resumeJours(s.jours, fr);

  // Cellule nombre.
  let nombreValeur = '—'; let nombreSous = ''; let nombreCouleur = P.ink;
  if (actif && nombre) {
    if (nombre.n == null) { nombreValeur = '—'; nombreSous = nombre.borne === 'hors_service' ? (fr ? 'pas encore en service' : 'not in service yet') : (fr ? 'indisponible' : 'unavailable'); nombreCouleur = P.mute; }
    else {
      nombreValeur = nf(nombre.n, fr);
      nombreSous = nombre.borne === 'extension' ? (fr ? 'extension muette' : 'extension silent')
        : nombre.borne === 'mois' ? (nombre.n === 0 ? (fr ? 'compteur du mois plein' : 'monthly counter full') : (fr ? 'dernières du mois' : 'last of the month'))
        : (fr ? 'si Chrome est ouvert' : 'if Chrome is open');
      if (nombre.n === 0) nombreCouleur = P.mute;
    }
  }

  return (
    <div className="rp-tap" role="button" tabIndex={0} onClick={ouvrir} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } }}
      aria-label={fr ? 'Republication automatique — réglages' : 'Automatic reposting — settings'}
      style={{ background: '#fff', border: `1px solid ${P.border}`, borderRadius: 20, boxShadow: '0 1px 4px rgba(16,32,27,.05)', overflow: 'hidden', fontFamily: FONT, color: P.ink }}>
      <style>{CSS}</style>
      {/* En-tête : icône (anneau qui tourne quand ça tourne), titre, PRO, état. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px 13px' }}>
        <IconeCycle actif={actif} attention={s.etatTon === 'amber'} tourne={actif && enService && s.etatTon !== 'amber'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: '-.01em' }}>{fr ? 'Republication automatique' : 'Automatic reposting'}</span>
            <PastillePro />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 500, fontSize: 12.5, marginTop: 3, color: tonCouleur(s.etatTon), minWidth: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, background: tonCouleur(s.etatTon), animation: actif && enService && s.etatTon === 'teal' ? 'rpPulse 2.4s ease infinite' : 'none' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.etatLigne}</span>
          </div>
        </div>
        <ChevronRight size={18} color={P.mute} style={{ flexShrink: 0 }} />
      </div>
      {/* Deux cellules : le créneau, le nombre. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 1, background: P.border, borderTop: `1px solid ${P.border}` }}>
        <Cellule label={actif ? (s.dans ? (fr ? 'Créneau' : 'Slot') : (fr ? 'Prochain créneau' : 'Next slot')) : (fr ? 'Créneau' : 'Slot')} valeur={creneauValeur} sous={creneauSous} />
        {actif ? (
          <Cellule label={fr ? 'Vont partir' : 'Will go out'} valeur={nombreValeur} sous={nombreSous} couleur={nombreCouleur}
            fond={nombre?.borne === 'hors_service' || nombre?.borne === 'extension' || nombre?.n === 0 ? P.amberBg : P.paper}
            labelCouleur={nombre?.borne === 'hors_service' || nombre?.borne === 'extension' || nombre?.n === 0 ? P.amberInk : P.mute} />
        ) : (
          /* Inactif : la cellule droite EST le geste. Pro → active avec les
             défauts serveur puis ouvre les réglages ; autres → modale de
             conversion (le serveur, `autorise`, fait foi). */
          <div style={{ background: P.paper, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
            <button type="button" onClick={activer} disabled={busy} className="rp-btn"
              style={{ width: '100%', height: 44, borderRadius: 999, fontSize: 13.5, fontWeight: 800, color: '#fff', background: `linear-gradient(120deg,${P.teal},${P.tealDeep})`, boxShadow: '0 6px 16px rgba(47,158,144,.28)', whiteSpace: 'nowrap' }}>
              {fr ? 'Activer' : 'Turn on'}
            </button>
          </div>
        )}
      </div>
      {actif && s.avis && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 16px', borderTop: `1px solid ${P.border}`, background: s.avis.ton === 'amber' ? P.amberBg : P.paper }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, marginTop: 6, background: P.amber }} />
          <div style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.45, color: P.ink, minWidth: 0 }}>{s.avis.titre}</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. L'ÉCRAN DE RÉGLAGES
// ═══════════════════════════════════════════════════════════════════════════
export function RepublicationPlanifieeReglages({ lang, etat, interrupteur, extensionStatus, busy, erreur, regler, onClose, onOuvrirHistorique }) {
  const fr = lang !== 'en';
  const enService = interrupteur === 1;
  const s = synthese(etat, { fr, enService, extensionStatus });
  const r = s.r;
  const actif = s.actif;
  const plafondPalier = Number(etat?.plafond_palier) || 0;
  const illimite = plafondPalier >= PLAFOND_ILLIMITE;
  const palierNom = etat?.palier === 'business' ? 'Business' : 'Pro';
  // Réglages de l'ancien moteur (republish_auto) : repris comme point de départ
  // quand le module n'a pas encore de réglage — même cadence qu'avant, pas les
  // défauts serveur (30 j / plafond du palier). Le serveur borne.
  const legacy = etat?.legacy && typeof etat.legacy === 'object' ? etat.legacy : null;

  // Brouillon local (réponse immédiate au doigt), ré-aligné sur l'état serveur
  // à chaque retour ; les écritures sont regroupées 500 ms.
  const [brouillon, setBrouillon] = useState(() => ({
    creneau: s.creneau, de: s.de, a: s.a, jours: s.jours,
    plafond_jour: Number(r?.plafond_jour) || Number(legacy?.plafond_jour) || plafondPalier || 1,
    age_jours: Number(r?.age_jours) || Number(legacy?.age_jours) || 30, ordre: r?.ordre ?? 'anciennes',
    plafond_boutique: r?.plafond_boutique ?? {},
  }));
  useEffect(() => {
    setBrouillon({
      creneau: s.creneau, de: s.de, a: s.a, jours: s.jours,
      plafond_jour: Number(r?.plafond_jour) || Number(legacy?.plafond_jour) || plafondPalier || 1,
      age_jours: Number(r?.age_jours) || Number(legacy?.age_jours) || 30, ordre: r?.ordre ?? 'anciennes',
      plafond_boutique: r?.plafond_boutique ?? {},
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat]);

  const enAttente = useRef({}); const minuterie = useRef(null);
  const appliquer = useCallback((patch, { immediat = false } = {}) => {
    setBrouillon((b) => ({ ...b, ...patch }));
    if (!r) return; // pas de réglage : rien à écrire tant qu'on n'active pas
    enAttente.current = { ...enAttente.current, ...patch };
    clearTimeout(minuterie.current);
    const envoyer = () => { const p = enAttente.current; enAttente.current = {}; if (Object.keys(p).length) regler(p); };
    if (immediat) envoyer(); else minuterie.current = setTimeout(envoyer, 500);
  }, [r, regler]);
  useEffect(() => () => clearTimeout(minuterie.current), []);

  const basculer = () => {
    if (actif) {
      track('republication_planifiee', { action: 'couper' });
      regler({ actif: false, arret_motif: 'utilisateur' });
    } else {
      track('republication_planifiee', { action: 'activer', depuis: 'reglages' });
      // À l'activation on envoie le brouillon ENTIER : un compte qui a réglé
      // avant d'activer ne perd rien, et le serveur borne tout.
      regler({ actif: true, ...brouillon });
    }
  };

  // Créneau perso : à la bascule on part des heures affichées.
  const choisirCreneau = (id) => {
    if (id === 'perso') appliquer({ creneau: 'perso', de: brouillon.de, a: brouillon.a }, { immediat: true });
    else appliquer({ creneau: id, de: PRESETS[id].de, a: PRESETS[id].a }, { immediat: true });
  };
  const persoValide = brouillon.creneau !== 'perso' || (brouillon.de && brouillon.a && brouillon.a > brouillon.de);

  const basculerJour = (d) => {
    const j = brouillon.jours.includes(d) ? brouillon.jours.filter((x) => x !== d) : [...brouillon.jours, d].sort((x, y) => x - y);
    if (j.length === 0) return; // jamais « aucun jour » : le serveur refuserait, autant ne pas proposer
    appliquer({ jours: j });
  };

  // « Aujourd'hui » : ce que le serveur voit maintenant (actif seulement).
  const elig = Number(etat?.eligibles?.total);
  const nombre = s.nombre;
  const prochainTxt = s.prochain ? heureDans(s.prochain, s.fuseau, fr) : null;
  const prochainJour = s.prochain ? jourRelatif(s.prochain, s.fuseau, fr) : null;
  const esp = Number(etat?.espacement?.sec);
  const capacite = Number(etat?.capacite);
  const dureeMin = Math.round((Number(etat?.duree_sec) || 0) / 60);

  const boutiques = Array.isArray(etat?.boutiques) ? etat.boutiques : [];
  const multi = etat?.multi_boutiques === true && boutiques.length >= 2;
  const connectee = etat?.boutique_connectee?.user_id ?? null;
  const parBoutique = etat?.eligibles?.par_boutique ?? {};

  const ligneEtat = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 500, fontSize: 12.5, color: tonCouleur(s.etatTon) }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, background: tonCouleur(s.etatTon) }} />
      <span>{s.etatLigne}</span>
    </div>
  );

  return (
    <EcranPlein titre={fr ? 'Republication automatique' : 'Automatic reposting'} onClose={onClose}
      droite={<Interrupteur on={actif} onChange={basculer} disabled={busy || !s.autorise || !persoValide} label={fr ? 'Activer la republication automatique' : 'Turn on automatic reposting'} />}>
      <div style={{ background: '#fff', border: `1px solid ${P.border}`, borderRadius: 20, boxShadow: '0 1px 4px rgba(16,32,27,.05)', overflow: 'hidden' }}>
        {/* En-tête de carte : icône + état + PRO. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px 14px', borderBottom: `1px solid ${P.border}` }}>
          <IconeCycle actif={actif} attention={s.etatTon === 'amber'} tourne={actif && enService && s.etatTon !== 'amber'} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-.01em' }}>{fr ? 'Par créneaux' : 'By time slots'}</span>
              <span style={{ fontWeight: 600, fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: P.mute2, background: P.chip, borderRadius: 999, padding: '3px 8px' }}>{palierNom}</span>
            </div>
            <div style={{ marginTop: 3 }}>{ligneEtat}</div>
          </div>
        </div>

        {/* Aujourd'hui — actif seulement : le serveur ne compte que pour un
            module actif (rien ne partirait, il n'y a rien à annoncer). */}
        {actif && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 1, background: P.border, borderBottom: `1px solid ${P.border}` }}>
            <Cellule label={fr ? "Éligibles aujourd'hui" : 'Eligible today'} valeur={Number.isFinite(elig) ? nf(elig, fr) : '—'} sous={fr ? plur(elig, 'annonce', 'annonces') : plur(elig, 'listing', 'listings')} />
            <Cellule label={s.dans ? (fr ? 'En cours' : 'Running') : (fr ? 'Prochain passage' : 'Next pass')}
              valeur={s.dans ? (fr ? 'Maintenant' : 'Now') : (prochainTxt ?? '—')}
              sous={s.dans ? (fr ? `jusqu'à ${fmtHHMM(s.a, fr)}` : `until ${fmtHHMM(s.a, fr)}`) : (prochainJour ?? '')} />
            {s.quotaConnu ? (
              <Cellule label={fr ? 'Ce mois' : 'This month'} valeur={nf(s.faits, fr)} sous={`${fr ? 'sur' : 'of'} ${nf(s.quota, fr)}`}
                couleur={s.quotaProche || s.quotaPlein ? P.amberInk : P.ink} fond={s.quotaProche || s.quotaPlein ? P.amberBg : P.paper}
                labelCouleur={s.quotaProche || s.quotaPlein ? P.amberInk : P.mute}
                enfant={<div style={{ height: 4, borderRadius: 99, background: 'rgba(16,32,27,.08)', marginTop: 9, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 99, background: s.quotaProche || s.quotaPlein ? P.amber : P.teal, width: `${Math.min(100, Math.round(100 * s.faits / s.quota))}%` }} /></div>} />
            ) : (
              <Cellule label={fr ? 'Ce mois' : 'This month'} valeur={Number.isFinite(Number(etat?.faits_mois)) ? nf(Number(etat.faits_mois), fr) : (Number.isFinite(Number(etat?.aujourdhui?.crees_total)) ? nf(Number(etat.aujourdhui.crees_total), fr) : '—')} sous={fr ? 'sans maximum' : 'no maximum'} />
            )}
          </div>
        )}

        {/* L'avis. */}
        {s.avis && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 18px', borderBottom: `1px solid ${P.border}`, background: s.avis.ton === 'amber' ? P.amberBg : P.paper }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, marginTop: 6, background: P.amber }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.4 }}>{s.avis.titre}</div>
              <div style={{ fontWeight: 500, fontSize: 12.5, lineHeight: 1.5, color: P.mute2, marginTop: 3 }}>{s.avis.corps}</div>
            </div>
          </div>
        )}
        {/* Le mode classique : dire ce que la bascule va couper, AVANT. */}
        {s.moteurLegacy && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 18px', borderBottom: `1px solid ${P.border}`, background: P.paper }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, marginTop: 6, background: P.amber }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.4 }}>{fr ? 'Ta republication automatique actuelle tourne encore, en mode classique.' : 'Your current automatic reposting still runs, in classic mode.'}</div>
              <div style={{ fontWeight: 500, fontSize: 12.5, lineHeight: 1.5, color: P.mute2, marginTop: 3 }}>
                {fr ? 'Activer les créneaux la remplace : plus rien ne partira hors des heures que tu choisis ici.' : 'Turning on time slots replaces it: nothing will go out outside the hours you pick here.'}
              </div>
            </div>
          </div>
        )}
        {!s.autorise && (
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${P.border}`, fontSize: 12.5, color: P.rouge, background: P.rougeBg, fontWeight: 600 }}>
            {texteErreurReglage('auto_reserve_pro', fr)}
          </div>
        )}
        {erreur && (
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${P.border}`, fontSize: 12.5, color: P.rouge, background: P.rougeBg, fontWeight: 600 }}>
            {texteErreurReglage(erreur, fr)}
          </div>
        )}

        <div style={{ padding: '2px 18px 6px', display: 'flex', flexDirection: 'column' }}>
          {/* Boutiques (multi) — même créneau pour toutes, plafond par boutique. */}
          {multi && (
            <Section titre={fr ? 'Boutiques Vinted' : 'Vinted shops'} sousTitre={fr ? 'Même créneau pour toutes · plafond du jour par boutique' : 'Same slot for all · daily cap per shop'}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {boutiques.map((b) => {
                  const id = String(b.user_id ?? '');
                  const nom = b.login ? `@${b.login}` : `#${id}`;
                  const estConnectee = connectee != null && String(connectee) === id;
                  const eligB = Number(parBoutique[id]);
                  const capB = Number(brouillon.plafond_boutique?.[id]) || brouillon.plafond_jour;
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 14, background: P.paper, border: `1px solid ${P.border}`, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{nom}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, fontSize: 12, marginTop: 2, color: estConnectee ? P.teal : P.mute }}>
                          <span style={{ width: 6, height: 6, borderRadius: 99, background: estConnectee ? P.teal : P.mute }} />
                          {estConnectee ? (fr ? 'Chrome connecté · passe ce créneau' : 'Chrome signed in · goes this slot') : (fr ? 'Attend que Chrome soit sur ce compte' : 'Waits for Chrome on this account')}
                          {actif && Number.isFinite(eligB) && <span style={{ color: P.mute2 }}>· {eligB} {fr ? 'éligibles' : 'eligible'}</span>}
                        </div>
                      </div>
                      <Stepper valeur={capB} min={1} max={brouillon.plafond_jour} pas={5} disabled={busy || !s.autorise} label={fr ? `Plafond ${nom}` : `Cap ${nom}`}
                        suffixe={fr ? '/jour' : '/day'}
                        onChange={(v) => appliquer({ plafond_boutique: { ...(brouillon.plafond_boutique ?? {}), [id]: v } })} />
                    </div>
                  );
                })}
              </div>
              <div style={{ fontWeight: 500, fontSize: 12.5, lineHeight: 1.45, color: P.mute2, marginTop: 10 }}>
                {fr ? "L'extension republie la boutique à laquelle Chrome est connecté. Les autres attendent leur tour, au créneau suivant où Chrome est sur leur compte. Le compteur du mois est commun aux boutiques."
                    : 'The extension reposts the shop Chrome is signed in to. The others wait their turn, at the next slot where Chrome is on their account. The monthly counter is shared across shops.'}
              </div>
            </Section>
          )}

          {/* Créneau */}
          <Section titre={fr ? 'Créneau de republication' : 'Reposting slot'} sousTitre={fr ? 'Heure locale · Chrome ouvert' : 'Local time · Chrome open'}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Pilule actif={brouillon.creneau === 'matin'} disabled={busy || !s.autorise} onClick={() => choisirCreneau('matin')}>{fr ? 'Matin · 8h–10h' : 'Morning · 8–10'}</Pilule>
              <Pilule actif={brouillon.creneau === 'midi'} disabled={busy || !s.autorise} onClick={() => choisirCreneau('midi')}>{fr ? 'Midi · 12h–14h' : 'Noon · 12–14'}</Pilule>
              <Pilule actif={brouillon.creneau === 'soir'} disabled={busy || !s.autorise} onClick={() => choisirCreneau('soir')}>{fr ? 'Soir · 19h–22h' : 'Evening · 19–22'}</Pilule>
              <Pilule actif={brouillon.creneau === 'perso'} disabled={busy || !s.autorise} onClick={() => choisirCreneau('perso')}>{fr ? 'Personnalisé' : 'Custom'}</Pilule>
            </div>
            {brouillon.creneau === 'perso' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 500, fontSize: 13, color: P.mute2 }}>{fr ? 'De' : 'From'}</span>
                <input type="time" className="rp-input-time" value={brouillon.de} disabled={busy || !s.autorise}
                  onChange={(e) => appliquer({ de: e.target.value })} />
                <span style={{ fontWeight: 500, fontSize: 13, color: P.mute2 }}>{fr ? 'à' : 'to'}</span>
                <input type="time" className="rp-input-time" value={brouillon.a} disabled={busy || !s.autorise}
                  onChange={(e) => appliquer({ a: e.target.value })} />
                {!persoValide && <span style={{ fontSize: 12, color: P.rouge, fontWeight: 600 }}>{texteErreurReglage('creneau_invalide', fr)}</span>}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, fontWeight: 500, fontSize: 12.5, lineHeight: 1.45, color: P.mute2 }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: P.teal, flexShrink: 0, marginTop: 6 }} />
              <span>
                {actif && Number.isFinite(capacite) && Number.isFinite(esp) && esp > 0
                  ? (fr
                    ? `${s.dans ? `D'ici ${fmtHHMM(s.a, fr)}` : `Sur ${dureeMin >= 60 ? `${Math.round(dureeMin / 60 * 10) / 10} h` : `${dureeMin} min`}`}, ce créneau permet jusqu'à ${capacite} ${plur(capacite, 'republication', 'republications')} — une toutes les ${Math.round(esp / 60)} min environ, au rythme réel de ton compte, pause comprise. Jamais en rafale.`
                    : `${s.dans ? `Until ${fmtHHMM(s.a, fr)}` : `Over ${dureeMin >= 60 ? `${Math.round(dureeMin / 60 * 10) / 10} h` : `${dureeMin} min`}`}, this slot allows up to ${capacite} ${plur(capacite, 'repost', 'reposts')} — about one every ${Math.round(esp / 60)} min, at your account's real pace, pause included. Never a burst.`)
                  : (fr
                    ? 'Les republications se répartissent sur le créneau, au rythme réel de ton compte. Jamais en rafale. Le nombre exact s’affiche une fois le module actif.'
                    : 'Reposts are spread across the slot at your account’s real pace. Never a burst. The exact number shows once the module is on.')}
              </span>
            </div>
          </Section>

          {/* Jours */}
          <Section titre={fr ? 'Jours actifs' : 'Active days'} sousTitre={cap1(resumeJours(brouillon.jours, fr))}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const on = brouillon.jours.includes(d);
                return (
                  <button key={d} type="button" aria-pressed={on} disabled={busy || !s.autorise} onClick={() => basculerJour(d)} className="rp-btn"
                    style={{ width: 40, height: 40, borderRadius: 12, fontWeight: 700, fontSize: 12.5, transition: 'background .15s,color .15s', background: on ? P.ink : P.chip, color: on ? '#fff' : P.mute2 }}>
                    {JOURS[fr ? 'fr' : 'en'][d - 1]}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Rythme : plafond + ancienneté */}
          <div style={{ padding: '16px 0', borderBottom: `1px solid ${P.border}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '16px 28px' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{multi ? (fr ? 'Plafond par jour, toutes boutiques' : 'Daily cap, all shops') : (fr ? 'Plafond par jour' : 'Daily cap')}</div>
              <Stepper valeur={brouillon.plafond_jour} min={1} max={illimite ? 1000 : Math.max(1, plafondPalier)} pas={5} disabled={busy || !s.autorise} label={fr ? 'Plafond par jour' : 'Daily cap'}
                onChange={(v) => appliquer({ plafond_jour: v })} />
              <div style={{ fontWeight: 500, fontSize: 12.5, lineHeight: 1.45, color: P.mute2, marginTop: 8 }}>
                {illimite
                  ? (fr ? `Jusqu'à ${brouillon.plafond_jour} par jour. Le palier ${palierNom} n'a pas de maximum.` : `Up to ${brouillon.plafond_jour} a day. The ${palierNom} plan has no maximum.`)
                  : brouillon.plafond_jour >= plafondPalier
                    ? (fr ? `${plafondPalier} par jour, le maximum du palier ${palierNom}.` : `${plafondPalier} a day, the ${palierNom} plan maximum.`)
                    : (fr ? `Jusqu'à ${brouillon.plafond_jour} par jour. Le palier ${palierNom} permet jusqu'à ${plafondPalier}.` : `Up to ${brouillon.plafond_jour} a day. The ${palierNom} plan allows up to ${plafondPalier}.`)}
                {' '}{fr ? 'Ce qui part réellement dépend aussi des annonces éligibles et de la durée du créneau.' : 'What actually goes out also depends on eligible listings and slot length.'}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{fr ? 'En ligne depuis plus de' : 'Live for more than'}</div>
              <Stepper valeur={brouillon.age_jours} min={AGE_MIN} max={AGE_MAX} pas={1} suffixe={fr ? 'jours' : 'days'} disabled={busy || !s.autorise} label={fr ? 'Ancienneté minimale' : 'Minimum age'}
                onChange={(v) => appliquer({ age_jours: v })} />
              <div style={{ fontWeight: 500, fontSize: 12.5, lineHeight: 1.45, color: P.mute2, marginTop: 8 }}>
                {fr ? '7 jours minimum : republier une annonce mise en ligne il y a un ou deux jours est un motif que Vinted sait repérer — c’est ton compte qui prendrait le risque.'
                    : 'Minimum 7 days: reposting a listing published only a day or two ago is a pattern Vinted can spot — your account would carry the risk.'}
              </div>
            </div>
          </div>

          {/* Ordre */}
          <Section titre={fr ? 'Ordre de passage' : 'Order'} sousTitre={fr ? "Quand il y a plus d'éligibles que de places" : 'When more are eligible than can go'} dernier>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Pilule actif={brouillon.ordre === 'anciennes'} disabled={busy || !s.autorise} onClick={() => appliquer({ ordre: 'anciennes' }, { immediat: true })}>{fr ? 'Les plus anciennes d’abord' : 'Oldest first'}</Pilule>
              <Pilule actif={brouillon.ordre === 'prix'} disabled={busy || !s.autorise} onClick={() => appliquer({ ordre: 'prix' }, { immediat: true })}>{fr ? 'Prix élevé d’abord' : 'Highest price first'}</Pilule>
              <Pilule actif={brouillon.ordre === 'vues'} disabled={busy || !s.autorise} onClick={() => appliquer({ ordre: 'vues' }, { immediat: true })}>{fr ? 'Les moins vues d’abord' : 'Least viewed first'}</Pilule>
            </div>
            {brouillon.ordre === 'vues' && (
              <div style={{ fontWeight: 500, fontSize: 12, color: P.mute, marginTop: 8 }}>
                {fr ? 'Vues par jour en ligne, d’après ta dernière synchronisation.' : 'Views per day online, from your last sync.'}
              </div>
            )}
          </Section>
        </div>

        {/* Pied : la phrase qui dit ce qui va se passer, et l'historique. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: P.paper, borderTop: `1px solid ${P.border}`, flexWrap: 'wrap' }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: actif && enService && s.etatTon === 'teal' ? P.teal : P.amber, animation: actif && enService && s.etatTon === 'teal' ? 'rpPulse 2.4s ease infinite' : 'none' }} />
          <span style={{ flex: 1, minWidth: 200, fontWeight: 600, fontSize: 13, lineHeight: 1.4, color: P.ink }}>
            {!actif
              ? (fr ? 'En pause. Tes réglages sont conservés.' : 'Paused. Your settings are kept.')
              : !enService
                ? (fr ? 'Pas encore en service : rien ne partira tant que FillSell n’a pas ouvert les créneaux.' : 'Not in service yet: nothing goes out until FillSell opens time slots.')
                : nombre?.n == null
                  ? (fr ? 'Le nombre qui partira n’est pas encore connu.' : 'The number that will go out is not known yet.')
                  : s.dans
                    ? (fr ? `D'ici ${fmtHHMM(s.a, fr)}, ${nombre.n} ${plur(nombre.n, 'annonce remontera', 'annonces remonteront')} si Chrome est ouvert.` : `Until ${fmtHHMM(s.a, fr)}, ${nombre.n} ${plur(nombre.n, 'listing', 'listings')} will go back up if Chrome is open.`)
                    : (fr ? `${cap1(prochainJour ?? '')} entre ${fmtHHMM(s.de, fr)} et ${fmtHHMM(s.a, fr)}, ${nombre.n} ${plur(nombre.n, 'annonce remontera', 'annonces remonteront')} si Chrome est ouvert. Sinon, tentative au créneau suivant.`
                          : `${cap1(prochainJour ?? '')} between ${fmtHHMM(s.de, fr)} and ${fmtHHMM(s.a, fr)}, ${nombre.n} ${plur(nombre.n, 'listing', 'listings')} will go back up if Chrome is open. Otherwise, next slot.`)}
          </span>
          <button type="button" className="rp-btn" onClick={() => { track('republication_planifiee', { action: 'ouvrir_historique' }); onOuvrirHistorique?.(); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', fontWeight: 700, fontSize: 13, color: P.teal, whiteSpace: 'nowrap', padding: 0 }}>
            <History size={15} strokeWidth={2.2} />{fr ? "Voir l'historique" : 'See history'}<ChevronRight size={15} />
          </button>
        </div>
      </div>
    </EcranPlein>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. L'HISTORIQUE — créneau par créneau.
// ═══════════════════════════════════════════════════════════════════════════
// Sources : republish_creneaux (une ligne par créneau vécu) + les jobs
// estampillés republish_creneau_id (ce qui est parti, quand, ce qui a échoué).
// Lecture PAGINÉE (PostgREST tronque à 1000 sans prévenir).
async function lireTout(construire, taille = 500, max = 5000) {
  const tout = [];
  for (let de = 0; de < max; de += taille) {
    const { data, error } = await construire().range(de, de + taille - 1);
    if (error) throw error;
    tout.push(...(data ?? []));
    if (!data || data.length < taille) break;
  }
  return tout;
}

export function RepublicationPlanifieeHistorique({ lang, userId, etat, onClose }) {
  const fr = lang !== 'en';
  const [periode, setPeriode] = useState(7);
  const [creneaux, setCreneaux] = useState(null);
  const [jobs, setJobs] = useState({});     // creneau_id → jobs[]
  const [erreur, setErreur] = useState(false);
  const [deplie, setDeplie] = useState({});

  useEffect(() => {
    if (!userId) return undefined;
    let annule = false;
    (async () => {
      try {
        const depuis = new Date(Date.now() - 30 * 86400000).toISOString();
        const rows = await lireTout(() => supabase.from('republish_creneaux')
          .select('id,jour,de,a,fuseau,debut,fin,statut,boutique,eligibles_debut,prevues,faites,sautes,extension_vue,espacement_sec')
          .eq('user_id', userId).gte('debut', depuis).order('debut', { ascending: false }));
        if (annule) return;
        setCreneaux(rows);
        const ids = rows.map((r) => String(r.id));
        if (ids.length) {
          const js = await lireTout(() => supabase.from('cross_post_jobs')
            .select('id,title,status,created_at,published_at,error,creneau_id:platform_fields->>republish_creneau_id')
            .eq('user_id', userId).eq('action', 'republish')
            .in('platform_fields->>republish_creneau_id', ids)
            .order('created_at', { ascending: true }));
          if (annule) return;
          const parCreneau = {};
          for (const j of js) { const k = String(j.creneau_id ?? ''); (parCreneau[k] ??= []).push(j); }
          setJobs(parCreneau);
        }
      } catch {
        if (!annule) setErreur(true);
      }
    })();
    return () => { annule = true; };
  }, [userId]);

  const fuseauDefaut = etat?.reglage?.fuseau ?? fuseauLocal();
  const visibles = useMemo(() => {
    if (!creneaux) return [];
    const limite = Date.now() - periode * 86400000;
    return creneaux.filter((c) => Date.parse(c.debut) >= limite);
  }, [creneaux, periode]);

  // Compteurs de la période : remontées = jobs aboutis (les lignes en cours
  // comptent aussi, `faites` n'étant posé qu'à la clôture) ; sautées = motifs
  // d'article (clés sans '_') ; manqués = statut 'manque'.
  const stats = useMemo(() => {
    let remontees = 0; let sautees = 0; let manques = 0; let echecs = 0;
    for (const c of visibles) {
      const js = jobs[String(c.id)] ?? [];
      const ok = js.filter((j) => j.status === 'published').length;
      remontees += c.statut === 'en_cours' ? ok : Math.max(Number(c.faites) || 0, ok);
      echecs += js.filter((j) => j.status === 'failed').length;
      sautees += Object.keys(c.sautes ?? {}).filter((k) => !k.startsWith('_')).length;
      if (c.statut === 'manque') manques += 1;
    }
    return { remontees, sautees, manques, echecs };
  }, [visibles, jobs]);

  const sousTitre = (() => {
    const q = Number(etat?.quota_mensuel); const f = Number(etat?.faits_mois);
    if (Number.isFinite(q) && q > 0 && Number.isFinite(f)) return fr ? `Ce mois · ${nf(f, fr)} sur ${nf(q, fr)}` : `This month · ${nf(f, fr)} of ${nf(q, fr)}`;
    if (Number.isFinite(f)) return fr ? `Ce mois · ${nf(f, fr)} republications` : `This month · ${nf(f, fr)} reposts`;
    return null;
  })();

  const pilules = (
    <div style={{ display: 'flex', gap: 6 }}>
      <Pilule actif={periode === 7} onClick={() => setPeriode(7)}>{fr ? '7 jours' : '7 days'}</Pilule>
      <Pilule actif={periode === 30} onClick={() => setPeriode(30)}>{fr ? '30 jours' : '30 days'}</Pilule>
    </div>
  );

  return (
    <EcranPlein titre={fr ? 'Historique des republications' : 'Reposting history'} sousTitre={sousTitre} onClose={onClose}>
      <div style={{ background: '#fff', border: `1px solid ${P.border}`, borderRadius: 20, boxShadow: '0 1px 4px rgba(16,32,27,.05)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 18px', borderBottom: `1px solid ${P.border}`, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600, fontSize: 12.5, color: P.mute2 }}>{fr ? 'Créneau par créneau' : 'Slot by slot'}</div>
          {pilules}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 1, background: P.border, borderBottom: `1px solid ${P.border}` }}>
          <Cellule label={fr ? 'Remontées' : 'Reposted'} valeur={nf(stats.remontees, fr)} couleur={P.teal} />
          <Cellule label={fr ? 'Sautées' : 'Skipped'} valeur={nf(stats.sautees + stats.echecs, fr)} sous={stats.echecs ? (fr ? `dont ${stats.echecs} en échec` : `${stats.echecs} failed`) : null} />
          <Cellule label={fr ? 'Créneaux manqués' : 'Missed slots'} valeur={nf(stats.manques, fr)} couleur={stats.manques ? P.amberInk : P.ink} />
        </div>

        <div style={{ padding: '4px 18px 8px', display: 'flex', flexDirection: 'column' }}>
          {erreur && <div style={{ padding: '14px 0', fontSize: 12.5, color: P.rouge, fontWeight: 600 }}>{fr ? 'Historique illisible pour le moment. Réessaie dans un instant.' : 'History unavailable right now. Try again in a moment.'}</div>}
          {!erreur && creneaux === null && <div style={{ padding: '18px 0', fontSize: 12.5, color: P.mute }}>{fr ? 'Chargement…' : 'Loading…'}</div>}
          {!erreur && creneaux !== null && visibles.length === 0 && (
            <div style={{ padding: '22px 0', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{fr ? 'Aucun créneau sur cette période.' : 'No slot in this period.'}</div>
              <div style={{ fontWeight: 500, fontSize: 12.5, color: P.mute2, marginTop: 4, lineHeight: 1.5 }}>
                {fr ? 'Chaque créneau vécu apparaît ici : ce qui est remonté, ce qui a été sauté et pourquoi.' : 'Every slot that ran shows here: what went back up, what was skipped and why.'}
              </div>
            </div>
          )}
          {visibles.map((c, idx) => {
            const fuseau = c.fuseau ?? fuseauDefaut;
            const js = jobs[String(c.id)] ?? [];
            const ok = js.filter((j) => j.status === 'published');
            const rates = js.filter((j) => j.status === 'failed');
            const enVol = js.filter((j) => j.status === 'pending' || j.status === 'processing' || j.status === 'needs_user');
            const nOk = c.statut === 'en_cours' ? ok.length : Math.max(Number(c.faites) || 0, ok.length);
            const sautes = Object.entries(c.sautes ?? {});
            const sautesArticles = sautes.filter(([k]) => !k.startsWith('_'));
            const notesCompte = sautes.filter(([k]) => k.startsWith('_'));
            const manque = c.statut === 'manque';
            const couleurPoint = manque ? P.amber : c.statut === 'vide' ? P.mute : nOk > 0 ? P.teal : c.statut === 'en_cours' ? P.teal : P.mute;
            const titre = `${jourHistorique(c.debut, fuseau, fr)} · ${fmtCreneau(c.de, c.a, fr)}`;
            const premiere = ok.length ? heureDans(ok[0].published_at, fuseau, fr) : null;
            const derniere = ok.length > 1 ? heureDans(ok[ok.length - 1].published_at, fuseau, fr) : null;
            const prevues = Number(c.prevues) || 0; const eligibles = Number(c.eligibles_debut) || 0;
            let phrase;
            if (c.statut === 'en_cours') phrase = fr ? `Créneau en cours — ${nOk} ${plur(nOk, 'remontée', 'remontées')} pour l'instant${enVol.length ? `, ${enVol.length} en cours` : ''}.` : `Slot running — ${nOk} reposted so far${enVol.length ? `, ${enVol.length} under way` : ''}.`;
            else if (c.statut === 'vide') phrase = fr ? 'Aucune annonce éligible ce jour-là.' : 'No eligible listing that day.';
            else if (manque) phrase = c.extension_vue
              ? (fr ? `Rien n'est parti. ${eligibles} ${plur(eligibles, 'annonce était éligible', 'annonces étaient éligibles')}.` : `Nothing went out. ${eligibles} ${plur(eligibles, 'listing was', 'listings were')} eligible.`)
              : (fr ? `Chrome était fermé. Les ${eligibles} ${plur(eligibles, 'annonce éligible attend', 'annonces éligibles attendent')} le créneau suivant.` : `Chrome was closed. The ${eligibles} eligible ${plur(eligibles, 'listing waits', 'listings wait')} for the next slot.`);
            else if (c.statut === 'termine') phrase = fr
              ? `Tout ce qui était prévu est passé${premiere ? ` — première à ${premiere}${derniere ? `, dernière à ${derniere}` : ''}` : ''}.`
              : `Everything planned went through${premiere ? ` — first at ${premiere}${derniere ? `, last at ${derniere}` : ''}` : ''}.`;
            else phrase = fr
              ? `${nOk} sur ${prevues} ${plur(prevues, 'prévue', 'prévues')}${premiere ? ` — première à ${premiere}${derniere ? `, dernière à ${derniere}` : ''}` : ''}.`
              : `${nOk} of ${prevues} planned${premiere ? ` — first at ${premiere}${derniere ? `, last at ${derniere}` : ''}` : ''}.`;
            const details = ok.length + rates.length + sautesArticles.length + notesCompte.length;
            const ouvert = deplie[c.id] === true;
            return (
              <div key={c.id} style={{ padding: '14px 0', borderBottom: idx < visibles.length - 1 ? `1px solid ${P.border}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: couleurPoint, flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{titre}</span>
                  <span style={{ flex: 1 }} />
                  {manque
                    ? <span style={{ fontWeight: 600, fontSize: 12.5, color: P.amberInk }}>{fr ? 'Créneau manqué' : 'Missed slot'}</span>
                    : c.statut === 'vide'
                      ? <span style={{ fontWeight: 600, fontSize: 12.5, color: P.mute }}>{fr ? 'Rien à faire' : 'Nothing to do'}</span>
                      : <span style={{ fontWeight: 600, fontSize: 12.5, color: P.teal }}>{nOk} {fr ? plur(nOk, 'remontée', 'remontées') : 'reposted'}</span>}
                  {(sautesArticles.length + rates.length) > 0 && !manque && (
                    <span style={{ fontWeight: 600, fontSize: 12.5, color: P.mute2 }}>· {sautesArticles.length + rates.length} {fr ? plur(sautesArticles.length + rates.length, 'sautée', 'sautées') : 'skipped'}</span>
                  )}
                </div>
                <div style={{ fontWeight: 500, fontSize: 12.5, color: P.mute2, margin: '6px 0 0 18px', lineHeight: 1.5 }}>{phrase}</div>
                {details > 0 && (
                  <button type="button" className="rp-btn" onClick={() => setDeplie((d) => ({ ...d, [c.id]: !ouvert }))}
                    style={{ margin: '8px 0 0 18px', background: 'transparent', padding: 0, fontWeight: 600, fontSize: 12.5, color: P.teal, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {ouvert ? (fr ? 'Masquer le détail' : 'Hide details') : (fr ? 'Voir le détail' : 'See details')}
                    <ChevronRight size={14} style={{ transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                  </button>
                )}
                {ouvert && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0 0 18px' }}>
                    {ok.map((j) => (
                      <LigneDetail key={j.id} ton="teal" titre={j.title || (fr ? 'Annonce' : 'Listing')}
                        sous={fr ? `Remontée à ${heureDans(j.published_at, fuseau, fr) ?? '—'}` : `Reposted at ${heureDans(j.published_at, fuseau, fr) ?? '—'}`} />
                    ))}
                    {enVol.map((j) => (
                      <LigneDetail key={j.id} ton="mute" titre={j.title || (fr ? 'Annonce' : 'Listing')}
                        sous={j.status === 'needs_user' ? (fr ? 'Attend une action de ta part.' : 'Waiting for an action from you.') : (fr ? 'En cours.' : 'Under way.')} />
                    ))}
                    {rates.map((j) => (
                      <LigneDetail key={j.id} ton="rouge" titre={j.title || (fr ? 'Annonce' : 'Listing')}
                        sous={fr ? `Échec${j.error ? ` — ${String(j.error).slice(0, 140)}` : ''}. L'annonce reste telle qu'elle était.` : `Failed${j.error ? ` — ${String(j.error).slice(0, 140)}` : ''}. The listing stays as it was.`} />
                    ))}
                    {sautesArticles.map(([item, n]) => (
                      <LigneDetail key={item} ton="mute" titre={n?.titre || `#${item}`} sous={`${fr ? 'Sautée — ' : 'Skipped — '}${texteMotifSaut(n?.motif, fr)}`} />
                    ))}
                    {notesCompte.map(([k, n]) => (
                      <LigneDetail key={k} ton="amber" titre={texteMotifCompte(n?.motif ?? k.replace(/^_/, ''), fr)}
                        sous={n?.at ? (fr ? `À ${heureDans(n.at, fuseau, fr) ?? '—'}` : `At ${heureDans(n.at, fuseau, fr) ?? '—'}`) : null} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {creneaux !== null && periode === 7 && creneaux.length > visibles.length && (
          <button type="button" className="rp-btn" onClick={() => setPeriode(30)}
            style={{ width: '100%', padding: '12px 20px', background: P.paper, borderTop: `1px solid ${P.border}`, textAlign: 'center', fontWeight: 600, fontSize: 13, color: P.mute2 }}>
            {fr ? 'Voir les 30 jours' : 'See 30 days'}
          </button>
        )}
      </div>
    </EcranPlein>
  );
}

function LigneDetail({ ton, titre, sous }) {
  const c = ton === 'teal' ? P.teal : ton === 'rouge' ? P.rouge : ton === 'amber' ? P.amberInk : P.mute;
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 12, background: P.paper, border: `1px solid ${P.border}` }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: c, flexShrink: 0, marginTop: 6 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titre}</div>
        {sous && <div style={{ fontWeight: 500, fontSize: 12, color: P.mute2, marginTop: 2, lineHeight: 1.45 }}>{sous}</div>}
      </div>
    </div>
  );
}
