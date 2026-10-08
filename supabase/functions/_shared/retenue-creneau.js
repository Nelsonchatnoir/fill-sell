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

/** Le message d'une republication auto retenue hors de son créneau. */
export function messageRetenueCreneau(platform, reprise) {
  const nom = NOM[platform] ?? platform ?? "";
  const q = quand(reprise);
  return `Republication automatique ${nom ? `${nom} ` : ""}en attente de ton créneau : elle repartira ` +
    (q ? `${q} ` : "à l'ouverture de ton prochain créneau ") +
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

/** Le retrait de l'annonce est-il engagé (supprimée, ou suppression envoyée) ? */
export function retraitEngage(job) {
  const pf = (job && typeof job.platform_fields === "object" && job.platform_fields) || {};
  if (pf.republish_step === "deleted" || pf.deleted_at) return true;
  if (pf.republish_suppression_envoyee && typeof pf.republish_suppression_envoyee === "object") return true;
  const textes = [
    String(job?.error ?? ""),
    String(pf.error_technique?.brut ?? ""),
    ...(Array.isArray(pf.erreurs_archivees) ? pf.erreurs_archivees.map((e) => String(e?.erreur ?? "")) : []),
  ];
  return textes.some((t) => SUPPRESSION_ENVOYEE_RE.test(t));
}
