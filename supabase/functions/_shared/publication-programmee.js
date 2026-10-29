// ═══════════════════════════════════════════════════════════════════════════
// LES NOUVELLES PUBLICATIONS PROGRAMMÉES (26/10, D4 — promis à XEWER le 26/09, décidé par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Sur le modèle de la republication planifiée : un créneau (matin 8 h – 10 h, midi 12 h – 14 h, soir 19 h – 22 h, ou
// le sien), des jours actifs, un plafond par jour ; les annonces partent UNE PAR UNE, espacées sur le créneau ; ce qui
// dépasse le plafond (ou arrive hors créneau) attend le créneau suivant, sans rien perdre.
//   · Le réglage : profiles.platform_settings.publication_programmee (platform_settings_fusionner seulement) —
//     { actif, creneau: 'matin'|'midi'|'soir'|'perso', de: 'HH:MM', a: 'HH:MM', jours: [1..7] (1 = lundi),
//       plafond_jour: n | null, fuseau }. Éteint par défaut : rien ne change pour les autres comptes.
//   · Une publication programmée : la tâche naît comme les autres ('pending', quota décompté au clic, comme avant),
//     marquée platform_fields.programmee = true. get-pending-jobs la RETIENT (aucune écriture) tant que le créneau
//     est fermé, que le plafond du jour est atteint, qu'une autre programmée est en cours, ou que l'espacement n'est
//     pas écoulé ; il en sert UNE, et marque platform_fields.programmee_servie_le (le compte du jour).
//   · Éteindre le réglage libère la file : tout repart à son tour, comme une publication ordinaire.
//   · ⛔ Jamais une heure promise dans les textes (règle du 15/10 soir) : « dans ton créneau », c'est tout.
// Pur, sans import : get-pending-jobs (Deno), l'app (Vite), les selftests (Node).

export const CLE_PUBLICATION_PROGRAMMEE = "publication_programmee";
export const CRENEAUX_PROGRAMMES = { matin: ["08:00", "10:00"], midi: ["12:00", "14:00"], soir: ["19:00", "22:00"] };
export const ESPACEMENT_MIN_MS = 2 * 60_000;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutes = (hhmm) => { const m = HHMM.exec(String(hhmm ?? "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/** Le réglage normalisé, ou null quand la programmation est éteinte (ou illisible). */
export function reglageProgrammation(platformSettings) {
  const r = platformSettings && typeof platformSettings === "object" ? platformSettings[CLE_PUBLICATION_PROGRAMMEE] : null;
  if (!r || typeof r !== "object" || r.actif !== true) return null;
  const creneau = ["matin", "midi", "soir", "perso"].includes(r.creneau) ? r.creneau : "matin";
  let [de, a] = creneau === "perso" ? [String(r.de ?? ""), String(r.a ?? "")] : CRENEAUX_PROGRAMMES[creneau];
  if (minutes(de) == null || minutes(a) == null || minutes(a) <= minutes(de)) [de, a] = CRENEAUX_PROGRAMMES.matin;
  const jours = Array.isArray(r.jours) ? [...new Set(r.jours.map(Number).filter((j) => Number.isInteger(j) && j >= 1 && j <= 7))].sort() : [];
  const p = Math.round(Number(r.plafond_jour));
  return {
    actif: true, creneau, de, a,
    jours: jours.length ? jours : [1, 2, 3, 4, 5, 6, 7],
    plafond_jour: Number.isFinite(p) && p >= 1 ? p : null,
    fuseau: typeof r.fuseau === "string" && r.fuseau.trim() ? r.fuseau.trim() : "Europe/Paris",
  };
}

/** L'heure locale d'un instant dans un fuseau : { jourIso (1 = lundi), minutes, date 'AAAA-MM-JJ' }. */
export function heureLocale(instantMs, fuseau = "Europe/Paris") {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(new Date(instantMs));
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(new Date(instantMs));
  }
  const v = (t) => parts.find((p) => p.type === t)?.value ?? "";
  const jourIso = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[v("weekday")] ?? 1;
  return { jourIso, minutes: Number(v("hour")) * 60 + Number(v("minute")), date: `${v("year")}-${v("month")}-${v("day")}` };
}

/** Le créneau est-il ouvert maintenant ? + sa durée en ms (pour l'espacement). */
export function fenetreProgrammation(reglage, instantMs = Date.now()) {
  if (!reglage) return { ouverte: true, dureeMs: 0, date: null };
  const h = heureLocale(instantMs, reglage.fuseau);
  const de = minutes(reglage.de), a = minutes(reglage.a);
  const ouverte = reglage.jours.includes(h.jourIso) && h.minutes >= de && h.minutes < a;
  return { ouverte, dureeMs: (a - de) * 60_000, date: h.date };
}

/** Une tâche de publication programmée, pas encore servie. */
export function estProgrammee(job) {
  const pf = job && typeof job.platform_fields === "object" && job.platform_fields ? job.platform_fields : {};
  return String(job?.action ?? "publish") === "publish" && pf.programmee === true && !pf.programmee_servie_le;
}

/** Servie AUJOURD'HUI (jour local du réglage) : compte pour le plafond du jour. */
export function servieAujourdhui(job, reglage, instantMs = Date.now()) {
  const pf = job && typeof job.platform_fields === "object" && job.platform_fields ? job.platform_fields : {};
  const t = Date.parse(String(pf.programmee_servie_le ?? ""));
  if (!Number.isFinite(t) || !reglage) return false;
  return heureLocale(t, reglage.fuseau).date === heureLocale(instantMs, reglage.fuseau).date;
}

/**
 * Que servir maintenant parmi les publications programmées en attente ?
 * @param {object} p
 * @param {Array} p.enAttente     les tâches programmées pas encore servies ('pending'), dans l'ordre de la file
 * @param {object|null} p.reglage reglageProgrammation(…) — null : programmation éteinte → tout est libre
 * @param {number} p.servies      programmées servies aujourd'hui (jour local)
 * @param {boolean} p.enVol       une programmée servie est encore en cours (processing)
 * @param {number|null} p.derniereServieMs  l'instant de la dernière servie (espacement)
 * @param {number} [p.maintenant]
 * @returns {{ servir: string|null, retenues: string[], motif: null|'creneau'|'plafond'|'une_a_la_fois'|'espacement' }}
 */
export function decisionProgrammee({ enAttente = [], reglage = null, servies = 0, enVol = false, derniereServieMs = null, maintenant = Date.now() }) {
  const ids = enAttente.map((j) => String(j.id));
  if (!reglage) return { servir: null, retenues: [], motif: null, libres: ids };
  if (!ids.length) return { servir: null, retenues: [], motif: null, libres: [] };
  const f = fenetreProgrammation(reglage, maintenant);
  if (!f.ouverte) return { servir: null, retenues: ids, motif: "creneau", libres: [] };
  if (reglage.plafond_jour != null && servies >= reglage.plafond_jour) return { servir: null, retenues: ids, motif: "plafond", libres: [] };
  if (enVol) return { servir: null, retenues: ids, motif: "une_a_la_fois", libres: [] };
  // L'espacement : le créneau réparti sur ce qui peut encore partir aujourd'hui (plafond restant, ou la file).
  const restant = reglage.plafond_jour != null ? Math.max(1, reglage.plafond_jour - servies) : ids.length;
  // Ce qui partira aujourd'hui dans ce créneau = déjà servies + ce qui peut encore partir : l'espacement reste le même
  // d'une annonce à l'autre (3 annonces sur 2 h : 0, 40, 80 min), jamais une dernière repoussée hors du créneau.
  const prevues = servies + Math.max(1, Math.min(restant, ids.length));
  const intervalle = Math.max(ESPACEMENT_MIN_MS, Math.floor(f.dureeMs / prevues));
  if (derniereServieMs != null && maintenant - derniereServieMs < intervalle) return { servir: null, retenues: ids, motif: "espacement", libres: [] };
  return { servir: ids[0], retenues: ids.slice(1), motif: ids.length > 1 ? "une_a_la_fois" : null, libres: [] };
}

/**
 * (29/10, lot B 4.7) L'ordre de passage des programmées : celles qui PEUVENT partir à ce poll d'abord (échéance
 * platform_fields.next_action_after venue ou absente), les autres derrière, chacune dans l'ordre de la file. Même
 * liste, même nombre : le créneau, le plafond et l'espacement ne changent pas. Sans cela, une programmée dont
 * l'échéance n'est pas venue (restriction Vinted, relance espacée) était choisie, écartée plus bas par la garde de
 * l'échéance, et bloquait toutes les autres (la servie n'est plus marquée qu'en fin de chaîne, si elle part vraiment).
 */
export function ordreProgrammeesPretesDabord(jobs, maintenant = Date.now()) {
  const liste = Array.isArray(jobs) ? jobs : [];
  const prete = (j) => {
    const pf = j && typeof j.platform_fields === "object" && j.platform_fields ? j.platform_fields : {};
    const t = Date.parse(String(pf.next_action_after ?? ""));
    return !(Number.isFinite(t) && t > maintenant);
  };
  return [...liste.filter(prete), ...liste.filter((j) => !prete(j))];
}

/** La phrase d'une publication programmée qui attend (jamais une heure). */
export function messageProgrammee(motif, reglage, lang = "fr") {
  const en = lang === "en";
  const nom = { matin: en ? "morning" : "du matin", midi: en ? "midday" : "de midi", soir: en ? "evening" : "du soir", perso: en ? "" : "" }[reglage?.creneau] ?? "";
  if (motif === "plafond") {
    return en ? `Scheduled: today's limit (${reglage?.plafond_jour}) is reached — it goes out in your next slot.`
      : `Programmée : le plafond du jour (${reglage?.plafond_jour}) est atteint — elle partira dans ton prochain créneau.`;
  }
  if (motif === "creneau") {
    return en ? `Scheduled: it goes out in your ${nom ? `${nom} ` : ""}slot, one at a time.`
      : `Programmée : elle partira dans ton créneau${nom ? ` ${nom}` : ""}, une à la fois.`;
  }
  return en ? "Scheduled: it goes out one at a time, spread over your slot."
    : "Programmée : elle part une à la fois, répartie sur ton créneau.";
}
