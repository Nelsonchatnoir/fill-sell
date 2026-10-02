// ═══════════════════════════════════════════════════════════════════════════
// ARRÊTER DES DÉPÔTS DU LOT — sans jamais toucher à ce qui est commencé
// ═══════════════════════════════════════════════════════════════════════════
// Même patron que l'arrêt des republications (StockTab, arreterRepublications) :
// une écriture gardée (statut, action, pas de lien), puis le marqueur
// `arret_utilisateur` sur chaque ligne arrêtée — c'est lui, jamais le statut,
// qui dit « arrêtée à ta demande » (ni un échec, ni un abandon).
//
// ⚠️ TROU SERVEUR CONNU (relevé la nuit du 02/10, NON corrigé ici) : quand
//    l'extension a DÉJÀ chargé le job dans sa boucle, elle tente « processing »
//    (refusé : controler_job_extension voit 'cancelled'), puis écrit 'failed'
//    — et update-job-status ne garde pas le statut courant : pas-de-rouge
//    requalifie ce failed en REPRISE ('pending' dans 15 min). Le dépôt arrêté
//    repartirait. Parade côté app, en attendant la migration
//    20261003010000 (écrite, NON appliquée) : on pose needsUserAttempts très
//    haut — classerEchec ne fait plus de reprise au-delà de 3 essais, le job
//    retombe au pire en « à relancer » (rien n'est déposé), et `reArreter`
//    le referme au passage suivant.
import { depotArretable, MESSAGE_ARRET_DEPOT } from "./regles.js";

export const ESSAIS_ARRET = 99;

/**
 * Arrête les dépôts du lot qui peuvent l'être. Rend { arretes: [ids], enVol: n }.
 * `jobs` = les jobs du lot tels que lus ; seuls ceux qui sont arrêtables sont
 * visés, et la base re-vérifie (statut, action, aucun lien).
 */
export async function arreterDepots(supabase, { userId, jobs }) {
  const cibles = (jobs ?? []).filter(depotArretable);
  const enVol = (jobs ?? []).filter((j) => String(j.action ?? "publish") === "publish" && j.status === "processing").length;
  const ids = cibles.map((j) => j.id).filter((id) => id && !String(id).startsWith("optimistic-"));
  if (!ids.length) return { arretes: [], enVol };
  const { data, error } = await supabase.from("cross_post_jobs")
    .update({ status: "cancelled", error: MESSAGE_ARRET_DEPOT })
    .in("id", ids).eq("user_id", userId).eq("action", "publish")
    .in("status", ["pending", "needs_user"])
    .is("listing_url", null)
    .select("id, platform_fields");
  if (error) throw error;
  const le = new Date().toISOString();
  await Promise.all((data ?? []).map((r) => {
    const pf = (r.platform_fields && typeof r.platform_fields === "object") ? r.platform_fields : {};
    return supabase.from("cross_post_jobs")
      .update({ platform_fields: { ...pf, arret_utilisateur: le, needsUserAttempts: Math.max(ESSAIS_ARRET, Number(pf.needsUserAttempts ?? 0) || 0) } })
      .eq("id", r.id).eq("user_id", userId).eq("status", "cancelled")
      .then(() => {}, () => {});
  }));
  return { arretes: (data ?? []).map((r) => r.id), enVol };
}

/**
 * Le filet du trou serveur ci-dessus : un dépôt que la personne a arrêté et
 * que l'écriture tardive de l'extension a fait retomber en « à relancer » est
 * refermé. `arretesIci` = les ids arrêtés depuis cet appareil.
 */
export async function reArreter(supabase, { userId, jobs, arretesIci }) {
  const ids = new Set(arretesIci ?? []);
  const revenus = (jobs ?? []).filter((j) => ids.has(j.id) && (j.status === "needs_user" || j.status === "pending") && !j.listing_url);
  if (!revenus.length) return [];
  const r = await arreterDepots(supabase, { userId, jobs: revenus }).catch(() => ({ arretes: [] }));
  return r.arretes;
}
