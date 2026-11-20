// (20/11/2026, complément de Nico — fausse alerte ops-digest de 09:50, cliente Cloud, job 8b7b607f) UNE TÂCHE QUI ATTEND
// UN CRÉNEAU DE REPUBLICATION RÉGLÉ PAR LE CLIENT N'EST JAMAIS UNE « FILE ARRÊTÉE ».
// Le cas : le reste d'un lot manuel de 30 republications Vinted (plus de 10 articles : il part dans les créneaux, option B
// du 09/11, get-pending-jobs + _shared/lot-manuel-creneau.js), créneau perso 15:02–18:00. Le lot a avancé la veille dans
// son créneau (dernier départ 17:55), le reste attendait 15:02 ; à 09:50 l'ops-digest a écrit « Un client payant ne publie
// plus : sa file est arrêtée, extension ouverte » — seule la republication AUTOMATIQUE était reconnue comme une attente.
// LA RÈGLE : une republication retenue par le créneau du client (automatique, ou manuelle portant le message de la retenue
// de lot) n'alerte que si un créneau s'est OUVERT ET REFERMÉ pendant qu'elle attendait, SANS AUCUN DÉPART du compte sur
// cette plateforme depuis l'ouverture de ce créneau. Créneau pas encore venu, créneau ouvert, ou créneau passé avec un
// départ : attente voulue.
// Pur (Deno + Node), miroir de la fonction SQL republish_planifiee_fenetre (jours ISO 1 = lundi … 7 = dimanche, fuseau du
// réglage, Europe/Paris par défaut). Selftest : scripts/creneau-client-2011-selftest.mjs.

/** Le message posé par get-pending-jobs sur une republication de lot retenue hors créneau (voie poste ou Cloud). */
export const RETENUE_LOT_CRENEAU_RE = /^Republication de ton lot \(plus de 10 articles\) en attente de ton créneau/;

const hm = (v) => { const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(v ?? '').trim()); if (!m) return null; const h = Number(m[1]), mi = Number(m[2]); return h < 24 && mi < 60 ? h * 60 + mi : null; };

// Le décalage (ms) du fuseau à l'instant t : heure locale lue par Intl moins l'heure UTC.
function decalage(t, fuseau) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: fuseau, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(t)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}
// Le jour local (année, mois, jour, jour ISO) à l'instant t.
function jourLocal(t, fuseau) {
  const d = new Date(t + decalage(t, fuseau));
  const iso = ((d.getUTCDay() + 6) % 7) + 1;
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), j: d.getUTCDate(), iso };
}
// L'instant UTC d'une heure locale (minutes depuis minuit) d'un jour local (y, m, j).
function instantLocal(y, m, j, minutes, fuseau) {
  const naif = Date.UTC(y, m, j, Math.floor(minutes / 60), minutes % 60);
  let t = naif - decalage(naif, fuseau);
  t = naif - decalage(t, fuseau);   // une seconde passe : les changements d'heure
  return t;
}

/** La fenêtre du réglage à l'instant `at` (pure) : { valide, dans, courant: {debut, fin}|null, precedent: {debut, fin}|null } (ms). */
export function fenetreCreneau(reglage, at = Date.now()) {
  const r = reglage && typeof reglage === 'object' ? reglage : {};
  const fuseau = typeof r.fuseau === 'string' && r.fuseau ? r.fuseau : 'Europe/Paris';
  const de = hm(r.de), a = hm(r.a);
  const jours = (Array.isArray(r.jours) ? r.jours : []).map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= 7);
  if (de == null || a == null || a <= de || !jours.length) return { valide: false, dans: false, courant: null, precedent: null };
  let courant = null, precedent = null;
  for (let d = 0; d <= 8; d++) {
    const jl = jourLocal(at - d * 86_400_000, fuseau);
    if (!jours.includes(jl.iso)) continue;
    const debut = instantLocal(jl.y, jl.m, jl.j, de, fuseau), fin = instantLocal(jl.y, jl.m, jl.j, a, fuseau);
    if (d === 0 && debut <= at && at < fin) { courant = { debut, fin }; continue; }
    if (fin <= at) { precedent = { debut, fin }; break; }
  }
  return { valide: true, dans: courant != null, courant, precedent };
}

/** Le réglage de créneau ACTIF du compte sur la plateforme (platform_settings.<pf>.republish_planifiee), ou null. */
export function reglageCreneauActif(profil, plateforme) {
  const r = profil?.platform_settings?.[String(plateforme ?? '')]?.republish_planifiee;
  if (!r || typeof r !== 'object' || r.actif !== true || r.arrete_le) return null;
  return r;
}

/**
 * Cette tâche attend-elle le créneau du client (attente voulue) ? (pure)
 * @param {object} job            republication en file : action, platform, error, platform_fields (republish_source,
 *                                republish_step), et son échéance d'attente (ms) en `depuis` ;
 * @param {object} profil         le propriétaire (platform_settings.<pf>.republish_planifiee) ;
 * @param {{ depuis: number|null, dernierDepart?: number|null, maintenant?: number, retraitEngage?: boolean }} o
 * @returns {string|null} 'creneau_client_a_venir' | 'creneau_client_ouvert' | 'creneau_client_avance' | null (= un
 *   créneau est passé sans aucun départ : l'alerte reste possible)
 */
export function attenteCreneauClient(job, profil, { depuis = null, dernierDepart = null, maintenant = Date.now(), retraitEngage = false } = {}) {
  if (String(job?.action ?? '') !== 'republish') return null;
  const pf = job?.platform_fields && typeof job.platform_fields === 'object' ? job.platform_fields : {};
  if (pf.republish_step === 'deleted' || retraitEngage) return null;   // engagée : elle va au bout, créneau ou non
  const auto = pf.republish_source === 'auto';
  if (!auto && !RETENUE_LOT_CRENEAU_RE.test(String(job?.error ?? ''))) return null;   // manuelle non retenue par le créneau
  const reglage = reglageCreneauActif(profil, job?.platform);
  if (!reglage) return null;
  const f = fenetreCreneau(reglage, maintenant);
  if (!f.valide) return null;
  if (f.dans) return 'creneau_client_ouvert';
  const p = f.precedent;
  if (!p || depuis == null || p.fin <= depuis) return 'creneau_client_a_venir';
  if (dernierDepart != null && dernierDepart >= p.debut) return 'creneau_client_avance';
  return null;
}
