// ═══════════════════════════════════════════════════════════════════════════
// PUBLICATIONS PROGRAMMÉES : CE QUI VA RÉELLEMENT PARTIR, ET QUAND (12/11/2026, point 4 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : le compte 229c7b07 (Business, créneau du soir 19:00–22:00) relance 3 lots et en annule 2 : rien ne lui
// disait qu'ils attendaient son créneau. Règle de Nico (12/09) : l'écran affiche ce qui va RÉELLEMENT partir, jamais un
// chiffre théorique. Rien ne change au réglage ni au rythme (une à la fois, tour entre plateformes,
// _shared/publication-programmee.js) : ce module ne fait que LIRE et DIRE.
//
// LE RYTHME RÉEL (la formule) — sur les publications programmées réellement servies au compte (marque
// programmee_servie_le, posée par get-pending-jobs et ebay-api-worker), les 14 derniers jours, jour local du réglage :
//   · un jour COMPTE s'il a été « plein » : la file ne s'est pas vidée avant la fin du créneau (dernière servie dans
//     les 30 dernières minutes du créneau) ou le plafond du jour a été atteint — sinon le nombre du jour dit seulement
//     ce qu'il y avait à envoyer, pas ce que le compte peut envoyer ;
//   · N = la MÉDIANE des servies des 3 DERNIERS jours pleins (le jour en cours n'est jamais compté), bornée au plafond
//     du jour — les plus récents seulement : un réglage changé (plafond retiré, créneau élargi) ne garde pas le rythme
//     d'avant (compte 229c7b07 : 8 par soir sous un plafond de 8 jusqu'au 08/11, 39 et 53 les 10 et 11/11 ; la médiane
//     des 14 jours aurait dit « 8 ») ;
//   · aucun jour plein : AUCUN chiffre (« le rythme s'affichera après un premier créneau complet ») — jamais une
//     constante optimiste.
// LA FIN ESTIMÉE : les publications à partir (celles du compte déjà en attente + celles du lot) réparties à N par
// créneau, sur les seuls jours actifs du réglage, à partir du prochain créneau (s'il est en cours : au prorata de ce
// qu'il en reste) ; elle est dite « vers le <jour> <date> », jamais une heure.
// Pur (Node + Vite) : le seul import est la règle partagée.
import { heureLocale } from '../../supabase/functions/_shared/publication-programmee.js';

export const JOURS_MESURE = 14;
export const MARGE_FIN_PLEINE_MIN = 30;
export const JOURS_PLEINS_RETENUS = 3;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutes = (hhmm) => { const m = HHMM.exec(String(hhmm ?? '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const JOURS_FR = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const JOURS_EN = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** 'AAAA-MM-JJ' + n jours (calendrier pur, sans fuseau). */
function plusJours(date, n) {
  const [a, m, j] = String(date).split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return d.toISOString().slice(0, 10);
}

/**
 * Le créneau qui servira la prochaine publication : celui en cours, ou le prochain jour actif.
 * @returns {{ enCours: boolean, decalage: number, jourIso: number, date: string, de: string, a: string } | null}
 */
export function prochainCreneau(reglage, maintenant = Date.now()) {
  if (!reglage) return null;
  const de = minutes(reglage.de), a = minutes(reglage.a);
  if (de == null || a == null) return null;
  const h = heureLocale(maintenant, reglage.fuseau);
  for (let d = 0; d <= 7; d++) {
    const jourIso = ((h.jourIso - 1 + d) % 7) + 1;
    if (!reglage.jours.includes(jourIso)) continue;
    if (d === 0 && h.minutes >= a) continue;
    return { enCours: d === 0 && h.minutes >= de, decalage: d, jourIso, date: plusJours(h.date, d), de: reglage.de, a: reglage.a };
  }
  return null;
}

/**
 * Le rythme réellement mesuré du compte (voir l'en-tête).
 * @param {string[]} servies  les instants programmee_servie_le (ISO) des 14 derniers jours
 * @returns {{ parCreneau: number | null, joursPleins: number, jours: Array<{ date: string, n: number, plein: boolean }> }}
 */
export function rythmeMesure(servies, reglage, maintenant = Date.now()) {
  const vide = { parCreneau: null, joursPleins: 0, jours: [] };
  if (!reglage) return vide;
  const a = minutes(reglage.a);
  if (a == null) return vide;
  const aujourdhui = heureLocale(maintenant, reglage.fuseau).date;
  const depuis = plusJours(aujourdhui, -JOURS_MESURE);
  const parJour = new Map();
  for (const s of Array.isArray(servies) ? servies : []) {
    const t = Date.parse(String(s ?? ''));
    if (!Number.isFinite(t) || t > maintenant) continue;
    const h = heureLocale(t, reglage.fuseau);
    if (h.date === aujourdhui || h.date < depuis) continue;
    const j = parJour.get(h.date) ?? { date: h.date, n: 0, derniere: -1 };
    j.n++; j.derniere = Math.max(j.derniere, h.minutes);
    parJour.set(h.date, j);
  }
  const plafond = reglage.plafond_jour ?? null;
  const jours = [...parJour.values()].sort((x, y) => (x.date < y.date ? -1 : 1))
    .map((j) => ({ date: j.date, n: j.n, plein: j.derniere >= a - MARGE_FIN_PLEINE_MIN || (plafond != null && j.n >= plafond) }));
  // Les 3 derniers jours pleins (jours triés par date croissante), puis rangés pour la médiane.
  const pleins = jours.filter((j) => j.plein).slice(-JOURS_PLEINS_RETENUS).map((j) => j.n).sort((x, y) => x - y);
  if (!pleins.length) return { parCreneau: null, joursPleins: 0, jours };
  const mi = Math.floor(pleins.length / 2);
  const mediane = pleins.length % 2 ? pleins[mi] : Math.round((pleins[mi - 1] + pleins[mi]) / 2);
  return { parCreneau: Math.max(1, plafond != null ? Math.min(mediane, plafond) : mediane), joursPleins: pleins.length, jours };
}

/**
 * Le créneau de la dernière publication, à N par créneau sur les jours actifs.
 * @returns {{ decalage: number, jourIso: number, date: string, creneaux: number } | null}
 */
export function finEstimee({ aPartir, parCreneau, reglage, maintenant = Date.now() }) {
  const p = prochainCreneau(reglage, maintenant);
  if (!p || !(parCreneau >= 1) || !(aPartir >= 1)) return null;
  let reste = aPartir, decalage = p.decalage, jourIso = p.jourIso, date = p.date, creneaux = 0;
  if (p.enCours) {
    const de = minutes(reglage.de), a = minutes(reglage.a), m = heureLocale(maintenant, reglage.fuseau).minutes;
    const capacite = Math.floor(parCreneau * Math.max(0, a - m) / Math.max(1, a - de));
    if (capacite >= reste) return { decalage, jourIso, date, creneaux: 1 };
    reste -= capacite;
    creneaux = 1;
  } else {
    reste -= parCreneau; creneaux = 1;
    if (reste <= 0) return { decalage, jourIso, date, creneaux };
  }
  for (let garde = 0; garde < 400 && reste > 0; garde++) {
    do { decalage++; jourIso = (jourIso % 7) + 1; date = plusJours(date, 1); } while (!reglage.jours.includes(jourIso));
    reste -= parCreneau; creneaux++;
  }
  return { decalage, jourIso, date, creneaux };
}

// ── LES MOTS (simples, sans jargon) ─────────────────────────────────────────────────────────────────────────────────
const MOMENT = { soir: ['soir', 'evening'], matin: ['matin', 'morning'], midi: ['midi', 'midday'] };
/** « ce soir », « demain soir », « lundi soir », « aujourd'hui », « demain », « lundi » (en : tonight, tomorrow evening…). */
export function quandCreneau(decalage, jourIso, creneau, lang = 'fr') {
  const en = lang === 'en';
  const m = MOMENT[creneau];
  if (en) {
    if (decalage === 0) return creneau === 'soir' ? 'tonight' : m ? `this ${m[1]}` : 'today';
    if (decalage === 1) return m ? `tomorrow ${m[1]}` : 'tomorrow';
    return `${JOURS_EN[jourIso]}${m ? ` ${m[1]}` : ''}`;
  }
  if (decalage === 0) return m ? `ce ${m[0]}` : "aujourd'hui";
  if (decalage === 1) return m ? `demain ${m[0]}` : 'demain';
  return `${JOURS_FR[jourIso]}${m ? ` ${m[0]}` : ''}`;
}
const jjmm = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const parQuoi = (creneau, en) => (creneau === 'soir' ? (en ? 'per evening' : 'par soir') : (en ? 'per day' : 'par jour'));

/** La phrase d'UNE publication programmée qui attend son créneau (la file). */
export function phraseAttenteProgrammee(reglage, maintenant = Date.now(), lang = 'fr') {
  const en = lang === 'en';
  const p = prochainCreneau(reglage, maintenant);
  if (!p) return en ? 'Scheduled: it goes out in your time slot, one at a time' : 'Programmée : elle partira dans ton créneau, une à la fois';
  if (p.enCours) {
    return en ? `Scheduled: going out now, one at a time, until ${p.a}` : `Programmée : elle part en ce moment, une à la fois, jusqu'à ${p.a}`;
  }
  const q = quandCreneau(p.decalage, p.jourIso, reglage.creneau, lang);
  return en ? `Scheduled: goes out ${q} from ${p.de}, one at a time` : `Programmée : partira ${q} à partir de ${p.de}, une à la fois`;
}

/**
 * La phrase de l'ENVOI d'un lot programmé : quand ça part, le rythme réel, la fin estimée.
 * @param {object} o  { reglage, servies (ISO[]), dejaEnFile (programmées du compte en attente), nouvelles (publications du lot), maintenant, lang }
 */
export function phraseEnvoiProgramme({ reglage, servies = [], dejaEnFile = 0, nouvelles = 0, maintenant = Date.now(), lang = 'fr' }) {
  const en = lang === 'en';
  const p = prochainCreneau(reglage, maintenant);
  if (!p) return null;
  const q = quandCreneau(p.decalage, p.jourIso, reglage.creneau, lang);
  const debut = p.enCours
    ? (en ? `They go out now, one at a time, until ${p.a}.` : `Elles partent dès maintenant, une à la fois, jusqu'à ${p.a}.`)
    : (en ? `They will go out ${q} from ${p.de}, one at a time.` : `Elles partiront ${q} à partir de ${p.de}, une à la fois.`);
  const r = rythmeMesure(servies, reglage, maintenant);
  if (r.parCreneau == null) {
    return `${debut} ${en ? 'Your usual pace will show after a first full time slot.' : "Ton rythme habituel s'affichera après un premier créneau complet."}`;
  }
  const total = Math.max(0, Number(dejaEnFile) || 0) + Math.max(0, Number(nouvelles) || 0);
  const f = finEstimee({ aPartir: total, parCreneau: r.parCreneau, reglage, maintenant });
  const rythme = en ? `At your usual pace (about ${r.parCreneau} ${parQuoi(reglage.creneau, en)})` : `À ton rythme habituel (environ ${r.parCreneau} ${parQuoi(reglage.creneau, en)})`;
  if (!f) return `${debut} ${rythme}.`;
  const avant = dejaEnFile > 0 ? (en ? ` (${dejaEnFile} already waiting go first)` : ` (les ${dejaEnFile} déjà en attente passent avant)`) : '';
  const quandFin = f.decalage <= 1 ? quandCreneau(f.decalage, f.jourIso, reglage.creneau, lang)
    : (en ? `around ${JOURS_EN[f.jourIso]} ${jjmm(f.date)}` : `vers le ${JOURS_FR[f.jourIso]} ${jjmm(f.date)}`);
  return `${debut} ${rythme}, ${en ? `the last one should go out ${quandFin}` : `la dernière devrait partir ${quandFin}`}${avant}.`;
}
