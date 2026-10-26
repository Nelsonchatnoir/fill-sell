// ═══════════════════════════════════════════════════════════════════════════
// ANNULER DANS « TA FILE » — ce qui attend, jamais ce qui a commencé (26/10, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// On pouvait mettre la file en pause, pas annuler une publication en attente
// qu'on ne veut plus voir partir. « Tout annuler » (avec confirmation) et une
// annulation par ligne (glisser vers la gauche, ou la petite croix).
//
// CE QUI S'ANNULE (et rien d'autre) :
//   · une PUBLICATION en attente (pending) ou qui attend un geste (needs_user),
//     sans lien ni numéro d'annonce — rien n'est en ligne (depotArretable) ;
//   · une REPUBLICATION en attente dont le relevé n'a même pas commencé
//     (republish_step absent ou 'a_capturer' — republishAnnulable) : l'annonce
//     est en ligne et le reste.
// JAMAIS :
//   · un job en cours (processing) : il va au bout ;
//   · une republication dont l'ancienne annonce est supprimée — ou a pu l'être
//     ('captured' supprime avant de l'écrire, 'deleted', suppression envoyée) :
//     l'annuler la laisserait hors ligne pour de bon ;
//   · un RETRAIT (action 'delete') : après une vente, c'est lui qui empêche la
//     double vente.
//
// L'ÉCRITURE : une seule mise à jour par job, gardée en base (compare-and-swap
// sur le statut LU, l'action, l'étape, l'absence de lien) — la liste de l'écran
// peut avoir quelques secondes de retard ; le filtre de la requête est ce qui
// rend le geste sûr. Statut 'cancelled' ET marqueur `arret_utilisateur` dans la
// MÊME écriture : controler_job_extension refuse alors toute écriture de
// l'extension (une boucle qui tenait le job en mémoire n'y touche plus).
// Quota : une publication se compte à la génération de l'annonce (rien à
// rendre) ; une republication se compte à sa création pour les paliers payants
// — elle porte `hors_quota`, le marqueur que les compteurs de quota excluent
// déjà (quotas_etat, spend_coins_and_republish, remise_en_vente_place).
import { republishAnnulable, MARQUEUR_ARRET_UTILISATEUR } from "./publicationState.js";
import { depotArretable } from "../publication/lot/regles.js";
import { retraitEngage } from "../../supabase/functions/_shared/retenue-creneau.js";

/** Un job de la file que la personne peut annuler, sans rien retirer de ce qui est en ligne. */
export function jobAnnulable(job) {
  if (!job?.id || String(job.id).startsWith("optimistic-")) return false;
  if (job.status !== "pending" && job.status !== "needs_user") return false;
  const action = String(job.action ?? "publish");
  if (action === "republish") return republishAnnulable(job) && !retraitEngage(job);
  if (action === "publish") return depotArretable(job);
  return false;
}

/** Ce que « Tout annuler » vise : les annulables, et combien restent (en cours, engagés, retraits). */
export function bilanAnnulation(jobs) {
  const vivants = (jobs ?? []).filter((j) => j && ["pending", "processing", "needs_user"].includes(j.status));
  const annulables = vivants.filter(jobAnnulable);
  return {
    annulables,
    publications: annulables.filter((j) => String(j.action ?? "publish") === "publish").length,
    republications: annulables.filter((j) => j.action === "republish").length,
    restent: vivants.length - annulables.length,
  };
}

/** « Annuler les 18 publications en attente ? » — les mots suivent ce qui est visé. */
export function questionAnnulation({ publications, republications }, lang = "fr") {
  const fr = lang !== "en";
  const n = publications + republications;
  if (n === 1) {
    if (fr) return publications ? "Annuler la publication en attente ?" : "Annuler la republication en attente ?";
    return publications ? "Cancel the queued listing?" : "Cancel the queued repost?";
  }
  if (fr) {
    const quoi = !republications ? "publications" : !publications ? "republications" : "publications et republications";
    return `Annuler les ${n} ${quoi} en attente ?`;
  }
  const quoi = !republications ? "listings" : !publications ? "reposts" : "listings and reposts";
  return `Cancel the ${n} queued ${quoi}?`;
}

/** Le message laissé sur le job annulé (jamais lu comme un échec : `arret_utilisateur` le dit). */
export function messageAnnule(job, lang = "fr") {
  const fr = lang !== "en";
  if (job?.action === "republish") {
    return fr ? "Annulée à ta demande — ton annonce est restée en ligne." : "Cancelled at your request — your listing stayed online.";
  }
  return fr ? "Annulée à ta demande — rien n'a été publié." : "Cancelled at your request — nothing was listed.";
}

/**
 * Annule les jobs annulables parmi `jobs`. Rend { annules: [ids], refuses: n } :
 * `refuses` = ceux que la base n'a pas laissé annuler (partis entre-temps).
 * Relit chaque ligne juste avant d'écrire (platform_fields est réécrit en
 * entier par une mise à jour qui le porte : jamais une copie périmée).
 */
export async function annulerJobs(supabase, { userId, jobs, lang = "fr", maintenant = new Date() }) {
  const cibles = (jobs ?? []).filter(jobAnnulable);
  if (!supabase || !userId || !cibles.length) return { annules: [], refuses: 0 };
  const ids = cibles.map((j) => j.id);
  const relus = [];
  for (let k = 0; k < ids.length; k += 150) {
    const { data, error } = await supabase.from("cross_post_jobs")
      .select("id, action, status, platform_fields, listing_url, platform_listing_id, error")
      .in("id", ids.slice(k, k + 150)).eq("user_id", userId);
    if (error) throw error;
    relus.push(...(data ?? []));
  }
  const le = maintenant.toISOString();
  const annules = [];
  let refuses = 0;
  for (const j of relus) {
    if (!jobAnnulable(j)) { refuses++; continue; }
    const pf = (j.platform_fields && typeof j.platform_fields === "object") ? j.platform_fields : {};
    const pfNeuf = {
      ...pf,
      [MARQUEUR_ARRET_UTILISATEUR]: le,
      annulee_dans_la_file: { le, par: "app (Ta file)" },
      ...(j.action === "republish" ? { hors_quota: true } : {}),
      // Une vieille boucle qui écrirait quand même un échec ne le requalifie jamais en reprise (arretLot.js).
      needsUserAttempts: Math.max(99, Number(pf.needsUserAttempts ?? 0) || 0),
    };
    let requete = supabase.from("cross_post_jobs")
      .update({ status: "cancelled", error: messageAnnule(j, lang), platform_fields: pfNeuf })
      .eq("id", j.id).eq("user_id", userId).eq("status", j.status).eq("action", j.action);
    requete = j.action === "republish"
      ? requete.or("platform_fields->>republish_step.is.null,platform_fields->>republish_step.eq.a_capturer")
        .is("platform_fields->deleted_at", null).is("platform_fields->republish_suppression_envoyee", null)
      : requete.is("listing_url", null);
    const { data, error } = await requete.select("id");
    if (error || !(data ?? []).length) { refuses++; continue; }
    annules.push(j.id);
  }
  return { annules, refuses: refuses + (cibles.length - relus.length) };
}
