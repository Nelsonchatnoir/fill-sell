// ═══════════════════════════════════════════════════════════════════════════
// UNE TÂCHE QUI NE DÉMARRE JAMAIS NE RETIENT PLUS LA FILE (03/10, point F)
// ═══════════════════════════════════════════════════════════════════════════
// doriane-henri : deux tâches Vinted servies à chaque passage depuis le 27 et
// le 28/09, jamais commencées (aucune écriture : elles attendaient une lecture
// du dressing que l'onglet Vinted ne rendait plus). Son extension passait 3 à
// 4 min sur chacune, à chaque cycle : 8 min au lieu de 2, et ses relevés
// Leboncoin, Beebs, eBay et Opla restaient derrière.
//
// LA RÈGLE (get-pending-jobs, toutes versions d'extension) : une tâche servie
// au MÊME poste au moins SERVI_MAX fois, depuis au moins DEPUIS_MIN_MS, sans
// avoir jamais été commencée (compteur posé par reserver_jobs_extension,
// migration 20261003190000) n'est plus servie : elle passe à la personne, avec
// ce qui se passe et le geste. Jamais une republication déjà retirée (étape
// 'deleted' : l'annonce est hors ligne, on insiste). Une relance depuis l'app
// la remet en file, et le compteur repart de zéro.
// ES module sans import (Deno + Vite + node).

export const SERVI_SANS_DEMARRER_MAX = 12;
export const SERVI_SANS_DEMARRER_DEPUIS_MS = 2 * 3600_000;
export const SOURCE_TACHE_SANS_DEMARRAGE = "tache_sans_demarrage";

const NOMS = { vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", opla: "Opla" };

/** La réservation dit-elle qu'il faut mettre cette tâche de côté ? */
export function tacheAMettreDeCote(job, reservation, maintenant = Date.now()) {
  if (!job || !reservation) return false;
  if (String(job.status ?? "pending") !== "pending") return false;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (job.action === "republish" && String(pf.republish_step ?? "") === "deleted") return false;
  // (04/10, jennifer.cot 9923ee78) Une tâche en ATTENTE PROGRAMMÉE
  // (next_action_after futur) n'est pas « jamais démarrée » : l'extension la
  // saute exprès. La compter la mettait de côté toutes les 2 h (61 services),
  // puis le balayage « canal coupé » la remettait en file : un ping-pong.
  const naa = Date.parse(String(pf.next_action_after ?? ""));
  if (Number.isFinite(naa) && naa > maintenant) return false;
  const n = Number(reservation.servi_n);
  const depuis = Date.parse(String(reservation.premier_service ?? ""));
  if (!Number.isFinite(n) || n < SERVI_SANS_DEMARRER_MAX) return false;
  if (!Number.isFinite(depuis) || maintenant - depuis < SERVI_SANS_DEMARRER_DEPUIS_MS) return false;
  return true;
}

function dateFr(t) {
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
}

/** Le texte montré à la personne : ce qui se passe, et le geste. */
export function messageTacheSansDemarrage(job, reservation) {
  const nom = NOMS[String(job?.platform ?? "")] ?? "la plateforme";
  const depuis = dateFr(Date.parse(String(reservation?.premier_service ?? "")));
  const quand = depuis ? ` depuis le ${depuis}` : "";
  const geste = "Ferme Chrome complètement puis rouvre-le, puis relance-la.";
  if (job?.action === "delete") {
    return `Ce retrait n'arrive pas à démarrer sur ton ordinateur${quand} : FillSell le met de côté pour laisser passer le reste de ta file. ` +
      `Ton annonce ${nom} est toujours en ligne. Ferme Chrome complètement puis rouvre-le, puis relance-le — ou retire l'annonce à la main sur ${nom}.`;
  }
  if (job?.action === "republish") {
    return `Cette republication n'arrive pas à démarrer sur ton ordinateur${quand} : FillSell la met de côté pour laisser passer le reste de ta file. ` +
      `Ton annonce est toujours en ligne sur ${nom}, rien n'a été retiré. ${geste}`;
  }
  return `Cette publication n'arrive pas à démarrer sur ton ordinateur${quand} : FillSell la met de côté pour laisser passer le reste de ta file. ` +
    `Rien n'a été publié sur ${nom}. ${geste}`;
}
