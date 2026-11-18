// ═══════════════════════════════════════════════════════════════════════════
// QUAND PART UN LOT RETENU PAR SON CRÉNEAU (18/11/2026, lot T2 point 2 — ordre de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Un lot lancé hors de son créneau : l'app dit clairement à quelle heure il partira. » Comme pour les publications
// programmées (décision de Nico du 12/11) : l'heure de DÉBUT du créneau est dite (« ce soir à partir de 19:00 »), jamais
// une heure de passage ni une durée (règle du 16/10 « aucun temps estimé », exception nommée ici).
// Source : l'ouverture du prochain créneau que rend le SERVEUR (fenêtre `prochain_debut` des réglages, ou `reprise` de
// get-pending-jobs) — jamais recalculée ici. Heure du fuseau du réglage (Europe/Paris par défaut). Pur, testé par
// selftest:creneau-lot-heure.

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function partiesLocales(t, fuseau) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const o = Object.fromEntries(f.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  const jourSemaine = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday);
  return { date: `${o.year}-${o.month}-${o.day}`, heure: Number(o.hour), hhmm: `${o.hour}:${o.minute}`, jourSemaine };
}
const ecartJours = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * « ce soir à partir de 19:00 », « demain à partir de 08:00 », « jeudi à partir de 12:00 » (en : « tonight from 19:00 »…).
 * @param {string|null} debut  l'ouverture du prochain créneau (ISO), lue au serveur
 * @returns {string|null}      null si l'heure est illisible (l'appelant garde sa phrase sans heure)
 */
export function quandPartLeCreneau(debut, { maintenant = Date.now(), fuseau = 'Europe/Paris', lang = 'fr' } = {}) {
  const t = Date.parse(String(debut ?? ''));
  if (!Number.isFinite(t)) return null;
  let z = fuseau;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: z }); } catch { z = 'Europe/Paris'; }
  const en = lang === 'en';
  const ici = partiesLocales(maintenant, z);
  const la = partiesLocales(t, z);
  const d = ecartJours(ici.date, la.date);
  if (d < 0) return null;
  const moment = la.heure < 12 ? (en ? 'this morning' : 'ce matin') : la.heure < 17 ? (en ? 'this afternoon' : 'cet après-midi') : (en ? 'tonight' : 'ce soir');
  const quand = d === 0 ? moment : d === 1 ? (en ? 'tomorrow' : 'demain') : (en ? JOURS_EN[la.jourSemaine] : JOURS_FR[la.jourSemaine]);
  return en ? `${quand} from ${la.hhmm}` : `${quand} à partir de ${la.hhmm}`; // estimation-ok: heure de début du créneau (Nico, 12/11 et 18/11)
}

/**
 * Le départ d'un lot sur UNE plateforme, d'après l'état de son module (republish_planifiee_etat_multi : `fenetre`).
 * @returns {{ dansCreneau: boolean, quand: string|null, fin: string|null } | null}  null : pas de créneau actif
 */
export function departDuLot(etatPf, { maintenant = Date.now(), lang = 'fr' } = {}) {
  if (!etatPf || etatPf.actif !== true) return null;
  const fen = etatPf.fenetre ?? null;
  const fuseau = etatPf.reglage?.fuseau ?? 'Europe/Paris';
  if (fen?.dans_creneau === true) {
    const f = Date.parse(String(fen.courant_fin ?? ''));
    return { dansCreneau: true, quand: null, fin: Number.isFinite(f) ? partiesLocales(f, fuseau).hhmm : null };
  }
  return { dansCreneau: false, quand: quandPartLeCreneau(fen?.prochain_debut ?? null, { maintenant, fuseau, lang }), fin: null };
}
