// ═══════════════════════════════════════════════════════════════════════════
// UNE REPUBLICATION AUTO RETENUE PAR SON CRÉNEAU LE DIT (02/10 soir, point 2)
// ═══════════════════════════════════════════════════════════════════════════
// Règle inchangée (Nico, 12/09) : aucune republication AUTOMATIQUE ne part hors
// du créneau choisi ; un créneau manqué n'est pas rattrapé, le job attend le
// suivant. Ce qui manquait : le job gardait le message de son dernier essai.
// jocabroc8 520ece42 (« Lot 2 plats creux… ») affichait depuis le 01/10 19:01
// « On réessaie tout seuls dans trois quarts d'heure », alors qu'il était
// retenu à chaque poll du lendemain (poste allumé seulement HORS de son créneau
// 19:00–22:00) et que rien ne pouvait partir avant le créneau suivant.
// Le message dit l'heure de reprise (celle que rend le serveur SQL,
// republish_planifiee_fenetres_courantes) et la condition : Chrome ouvert à ce
// moment-là. Pur (Deno + Node).

const NOM = { vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", opla: "Opla", depop: "Depop" };

function quand(reprise) {
  const t = Date.parse(String(reprise ?? ""));
  if (!Number.isFinite(t)) return null;
  try {
    const jour = new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "2-digit", month: "2-digit" });
    const heure = new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
    return `${jour} à ${heure}`;
  } catch { return null; }
}

/**
 * (15/10, P2 — Louis) Le message d'une republication auto retenue parce que la
 * republication automatique de sa plateforme est EN PAUSE (« Tout mettre en
 * pause », arrêt, palier perdu). Avant, une file déjà créée partait quand même :
 * Louis a mis en pause à 20:13 le 14/10, trois republications Leboncoin sont
 * parties entre 20:15 et 20:42.
 */
export function messageRetenuePause(platform) {
  const nom = NOM[platform] ?? platform ?? "";
  return `Republication automatique ${nom ? `${nom} ` : ""}en pause : elle repartira quand tu relanceras la ` +
    "republication automatique (Réglages). Ton annonce est intacte, rien n'a été retiré.";
}

/** Le message d'une republication auto retenue hors de son créneau. */
export function messageRetenueCreneau(platform, reprise) {
  const nom = NOM[platform] ?? platform ?? "";
  // (16/10, Nico) Jamais la date ni l'heure du créneau : « au prochain créneau », c'est tout.
  void reprise;
  return `Republication automatique ${nom ? `${nom} ` : ""}en attente de ton créneau : elle repartira ` +
    "à l'ouverture de ton prochain créneau " +
    "(heure de Paris), si Chrome est ouvert sur ton ordinateur à ce moment-là. Ton annonce est intacte, rien n'a été retiré.";
}

// ═══════════════════════════════════════════════════════════════════════════
// UNE REPUBLICATION DONT LA SUPPRESSION EST PARTIE VA AU BOUT (08/10, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Le 06/10, la suppression de « Insert / Rangement Bleu » (Beebs 32745154) est
// partie à 21:58, dans le créneau 19:00–22:00. Beebs montrait encore l'annonce
// deux minutes après (page et index en retard sur la suppression) : le job
// s'est reprogrammé à 22:05, créneau fermé → retenu jusqu'au samedi 19:00 avec
// « Ton annonce est intacte, rien n'a été retiré ». L'annonce n'était plus sur
// Beebs (absente des relevés complets du 07/10 et du 08/10).
// Règle : une retenue de gouvernance (créneau, plafond du jour, pause de
// respiration) ne s'applique qu'à une annonce que personne n'a touchée. Dès que
// la suppression est partie, le job va au bout, créneau fermé ou non : l'
// extension relit d'abord « Mes annonces » et ne remet en ligne que sur PREUVE
// de la suppression (jamais deux annonces). Marqueur posé depuis la 0.6.97
// (republish_suppression_envoyee) ; avant, sa trace écrite (même lecture que
// suppressionDejaEnvoyee dans l'extension).
const SUPPRESSION_ENVOYEE_RE = /Suppression envoyée à (Beebs|Leboncoin|Opla|Vinted|Depop)/;

// (04/11) Les clés de platform_fields qui racontent un RETRAIT (marqueurs, preuves, retenues, recréation) : jamais
// recopiées dans une republication neuve. Miroir À L'IDENTIQUE de la base : republication_sans_traces (migration
// 20261104210000) — selftest:republication-va-au-bout compare les deux.
export const TRACES_DE_RETRAIT_RE = /^(republish_(suppression|retrait|reprise|etat)|republished_|suppression_|preuve_retrait|retrait|retenue_|deleted_|recreat|old_|new_listing|orphan_|delete_|deja_absente|beebs_404_|error_technique)/;

// ═══════════════════════════════════════════════════════════════════════════
// UNE TRACE DE RETRAIT HÉRITÉE NE RETIENT PERSONNE (04/11, 9cdr9rm4rn — Beebs)
// ═══════════════════════════════════════════════════════════════════════════
// Le 03/11 à 15:22, « Pyjama 36 mois » et « Ensemble 9 mois » se sont attendues l'une l'autre : chaque republication
// avait recopié les platform_fields de la précédente (spend_coins_and_republish), dont le marqueur
// republish_suppression_envoyee des 18-19/10, qui portait les ANCIENS numéros. L'extension jugeait SON marqueur au
// numéro (« pas le mien » → elle passait par le garde-fou) et celui des AUTRES à sa seule présence (« hors ligne ») :
// chacune retenait l'autre.
// Règle (un seul juge, serveur ET extension — recopié dans chrome-extension/etat-job.js et background.js) : un
// marqueur est HÉRITÉ, donc muet, sur DEUX preuves à la fois —
//   1. il nomme une annonce qui n'est AUCUNE de celles que vise le job (numéro, lien, ancien numéro, ancien lien,
//      numéro et lien de la capture) ;
//   2. il a été écrit AVANT la naissance du job (created_at, sinon l'heure de la capture).
// Tout le reste RETIENT, comme avant : un marqueur sans annonce, un job sans numéro à comparer, le numéro actuel, un
// marqueur écrit après la naissance du job. Une annonce vraiment retirée et pas encore revenue bloque toujours.
// Même règle pour la trace écrite « Suppression envoyée à … » : une erreur archivée (ou technique) datée d'avant la
// naissance du job n'est pas la sienne.
const jetonsAnnonce = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return [];
  const segment = s.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop();
  return [...new Set([s, segment, s.match(/(\d{6,})/)?.[1]].filter(Boolean))];
};
const pfDe = (job) => (job && typeof job.platform_fields === "object" && job.platform_fields) || {};

/** Les identifiants (numéros, liens, slugs) de l'annonce que vise ce job, en jetons comparables. */
export function identifiantsVises(job) {
  const pf = pfDe(job);
  const snap = pf.republish_snapshot && typeof pf.republish_snapshot === "object" ? pf.republish_snapshot : {};
  return new Set([job?.platform_listing_id, job?.listing_url, pf.old_platform_listing_id, pf.old_listing_url,
    snap.platform_listing_id, snap.listing_url, pf.vinted_item_id].flatMap(jetonsAnnonce));
}

/** L'heure de naissance du job (ms), ou NaN si on ne la connaît pas. */
function naissanceJob(job) {
  const pf = pfDe(job);
  const ne = Date.parse(String(job?.created_at ?? ""));
  return Number.isFinite(ne) ? ne : Date.parse(String(pf.republish_snapshot?.captured_at ?? ""));
}

/** Le marqueur republish_suppression_envoyee de ce job a-t-il été hérité d'une republication précédente ? */
export function suppressionEnvoyeeHeritee(job) {
  const m = pfDe(job).republish_suppression_envoyee;
  if (!m || typeof m !== "object") return false;
  const siens = jetonsAnnonce(m.annonce);
  const vises = identifiantsVises(job);
  // Sans annonce, rien à comparer, ou la même annonce : c'est le sien, il retient.
  if (!siens.length || !vises.size || siens.some((t) => vises.has(t))) return false;
  const ne = naissanceJob(job);
  const at = Date.parse(String(m.at ?? ""));
  return Number.isFinite(ne) && Number.isFinite(at) && at < ne;
}

/** Les traces écrites du job, sans celles d'avant sa naissance (héritées). */
function textesDuJob(job) {
  const pf = pfDe(job);
  const ne = naissanceJob(job);
  const avantNaissance = (quand) => {
    const t = Date.parse(String(quand ?? ""));
    return Number.isFinite(ne) && Number.isFinite(t) && t < ne;
  };
  return [
    String(job?.error ?? ""),
    avantNaissance(pf.error_technique?.at) ? "" : String(pf.error_technique?.brut ?? ""),
    ...(Array.isArray(pf.erreurs_archivees)
      ? pf.erreurs_archivees.filter((e) => !avantNaissance(e?.le)).map((e) => String(e?.erreur ?? ""))
      : []),
  ];
}

/** Le retrait de l'annonce est-il engagé (supprimée, ou suppression envoyée) ? */
export function retraitEngage(job) {
  const pf = pfDe(job);
  if (pf.republish_step === "deleted" || pf.deleted_at) return true;
  if (pf.republish_suppression_envoyee && typeof pf.republish_suppression_envoyee === "object" && !suppressionEnvoyeeHeritee(job)) return true;
  return textesDuJob(job).some((t) => SUPPRESSION_ENVOYEE_RE.test(t));
}

/**
 * (04/11) Filet contre l'attente croisée : `job` est retenu derrière `frere` (étape 'captured', suppression envoyée)
 * mais `frere` porte lui-même une retenue posée derrière `job` — un cycle. Le plus ancien passe (created_at, puis id) ;
 * date illisible → on attend, comme avant. Jamais pour un frère à l'étape 'deleted' (annonce vraiment retirée).
 */
export function jePasseDevant(job, frere) {
  const pfF = pfDe(frere);
  if (String(pfF.republish_step ?? "") === "deleted" || pfF.deleted_at) return false;
  const r = pfF.retenue_hors_ligne;
  if (!r || typeof r !== "object" || String(r.job ?? "") !== String(job?.id ?? "")) return false;
  const a = Date.parse(String(job?.created_at ?? ""));
  const b = Date.parse(String(frere?.created_at ?? ""));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a < b || (a === b && String(job?.id ?? "") < String(frere?.id ?? ""));
}
