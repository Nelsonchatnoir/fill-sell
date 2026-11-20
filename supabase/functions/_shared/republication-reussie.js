// ══ (20/11, point 3 de Nico — gjehly, Brave) UNE REPUBLICATION RÉUSSIE NE SE DÉFAIT JAMAIS PAR UN RAPPORT TARDIF ══
// Du 17/11 18:03 au 20/11 07:12, 20 republications Vinted de gjehly ont RÉUSSI (journal_etapes : deleted → recreated,
// statut published, nouvelle annonce en ligne — relue sur Vinted le 20/11 à 09:47), puis, 1 à 4 minutes après, une
// ANCIENNE exécution de la même tâche (une copie de la liste reçue avant le succès, sur un des deux postes du compte)
// a envoyé « failed » : la lecture de l'ANCIENNE annonce, supprimée, rendait 404. controler_job_extension laisse passer
// toute écriture autre que « processing » sur une tâche publiée ; update-job-status a requalifié ce « failed » en
// reprise (pas-de-rouge : inconnu_reprise → reprise) et remis la tâche à « a_capturer » : capture de l'annonce
// supprimée toutes les 15 min, « n'a pas abouti, on ne sait pas pourquoi », puis « n'est plus en ligne », annulée —
// alors que la republication était faite. Pire chemin évité de justesse (222227a3) : la reprise a retenté une
// SUPPRESSION.
//
// Règle : une tâche de republication déjà « published » à l'étape « recreated » ne reçoit plus aucun rapport
// « failed », « pending » ou « needs_user » de l'extension : c'est le rapport d'une exécution périmée. Refus 409
// (l'extension le lit comme « skipped », rien n'est re-tenté), la tâche et son annonce restent telles quelles.
// Le serveur seul la réarme pour un créneau suivant (cron, SQL) : ce chemin-là ne passe pas par ici.
export const STATUTS_TARDIFS = new Set(["failed", "pending", "needs_user"]);

export function rapportTardifSurRepublicationReussie({ statutEnBase, statutDemande, action, pf } = {}) {
  return statutEnBase === "published"
    && action === "republish"
    && STATUTS_TARDIFS.has(String(statutDemande ?? ""))
    && !!pf && typeof pf === "object"
    && pf.republish_step === "recreated";
}

export const MESSAGE_REPUBLICATION_DEJA_REUSSIE =
  "Cette republication a déjà réussi : l'annonce est de nouveau en ligne. Rien à faire.";
