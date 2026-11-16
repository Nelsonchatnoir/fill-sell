// ═══════════════════════════════════════════════════════════════════════════
// LE CRÉNEAU OÙ L'ORDINATEUR EST TOUJOURS ÉTEINT (16/11/2026, point 5c du lot de Nico) — pur
// ═══════════════════════════════════════════════════════════════════════════
// Constat (contact.grizstyle, créneau 18:30–19:45) : son ordinateur tourne surtout de 20:30 à 00:30 (relevés chaque soir) ;
// ses créneaux passaient Chrome fermé, rien ne partait, et l'app ne disait qu'un « dernier créneau manqué » — jamais que
// c'était CHAQUE soir, ni à quelles heures son ordinateur est réellement allumé.
// La règle : sur les 5 derniers créneaux terminés d'une plateforme, 3 au moins passés Chrome fermé (statut « manque », motif
// _extension_absente ou extension jamais vue) → on le dit, avec les heures où l'ordinateur est allumé d'habitude (les
// relevés des 14 derniers jours, heure de Paris), et « Changer mon créneau » ouvre le réglage. ⛔ La cadence (durée,
// plafonds, rythme, quotas) n'est jamais touchée : seule la personne déplace son créneau.
// Verrou : scripts/creneau-hors-presence-selftest.mjs.

export const CRENEAUX_LUS = 5;
export const SEUIL_MANQUES = 3;

/** Les créneaux terminés manqués Chrome fermé, sur les `n` derniers de la plateforme (lignes de republish_creneaux). */
export function creneauxSansOrdinateur(creneaux, platform, { n = CRENEAUX_LUS, seuil = SEUIL_MANQUES } = {}) {
  const lignes = (Array.isArray(creneaux) ? creneaux : [])
    .filter((c) => c && c.platform === platform && c.statut && c.statut !== 'en_cours')
    .sort((a, b) => Date.parse(b.debut) - Date.parse(a.debut))
    .slice(0, n);
  const ferme = (c) => c.statut === 'manque' && (Boolean(c?.sautes?._extension_absente) || c.extension_vue === false);
  const manques = lignes.filter(ferme).length;
  return { manques, sur: lignes.length, alerte: lignes.length >= seuil && manques >= seuil };
}

const fmt = (m) => {
  const x = ((Math.round(m / 15) * 15) % 1440 + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

/**
 * Les heures où l'ordinateur est allumé d'habitude, d'après des instants vus (début des relevés) : { de, a } en « HH:MM »
 * (heure de Paris, au quart d'heure), ou null (moins de 4 jours vus). Une soirée qui passe minuit reste UNE plage
 * (00:30 compte comme 24:30). Les 10 % les plus tôt et les plus tard sont écartés (un passage isolé ne fait pas l'habitude).
 */
export function heuresAllume(instants, { fuseau = 'Europe/Paris' } = {}) {
  const pts = [];
  const jours = new Set();
  for (const i of Array.isArray(instants) ? instants : []) {
    const t = Date.parse(i);
    if (!Number.isFinite(t)) continue;
    const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t));
    const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    let m = Number(v.hour) * 60 + Number(v.minute);
    if (m < 6 * 60) m += 1440;
    pts.push(m);
    jours.add(`${v.year}-${v.month}-${v.day}`);
  }
  if (jours.size < 4 || pts.length < 4) return null;
  pts.sort((a, b) => a - b);
  const q = (p) => pts[Math.min(pts.length - 1, Math.max(0, Math.floor(p * (pts.length - 1))))];
  return { de: fmt(q(0.1)), a: fmt(q(0.9)) };
}

const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop', opla: 'Opla' };

/** L'avis (ou null) : titre, corps, bouton. */
export function avisCreneauHorsPresence({ platform, compte, heures, lang = 'fr' }) {
  if (!compte?.alerte) return null;
  const nom = NOMS[platform] ?? platform;
  const en = lang === 'en';
  const plage = heures ? (en ? ` Your computer is usually on between ${heures.de} and ${heures.a}.` : ` Ton ordinateur est allumé le plus souvent entre ${heures.de} et ${heures.a}.`) : '';
  return en
    ? { titre: `Your computer is off during your ${nom} slot`, corps: `Of your last ${compte.sur} slots, ${compte.manques} went by with Chrome closed: nothing went out.${plage} Pick a slot when it's on so your reposts go out.`, bouton: 'Change my slot' }
    : { titre: `Ton ordinateur est éteint pendant ton créneau ${nom}`, corps: `Sur tes ${compte.sur} derniers créneaux, ${compte.manques} sont passés Chrome fermé : rien n'est parti.${plage} Choisis un créneau à des heures où il est allumé pour que tes republications partent.`, bouton: 'Changer mon créneau' };
}
