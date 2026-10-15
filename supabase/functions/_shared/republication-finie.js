// ═══════════════════════════════════════════════════════════════════════════
// UNE REPUBLICATION RECRÉÉE EST FINIE (15/10, P3 — Ornella 9a7b9499)
// ═══════════════════════════════════════════════════════════════════════════
// Le legging d'Ornella a été recréé le 12/10 (annonce 10352378300, en ligne),
// mais l'horloge de son ordinateur retardait de 27 min : dates du poste et du
// serveur contradictoires, le job est revenu en file à l'étape 'recreated' —
// que l'extension ne connaît pas (« Étape de republication inconnue ») — puis
// « relancer ». « Republier maintenant » aurait retiré la NOUVELLE annonce.
// Règle (get-pending-jobs pour une tâche en file, handler-watch pour une tâche
// déjà passée à la personne) : une republication à l'étape 'recreated' qui
// porte le numéro de sa nouvelle annonce, distinct de l'ancienne, est close
// « published » ; sans ce numéro, rien n'est conclu. ES module sans import.

/** La republication est-elle prouvée finie (nouvelle annonce connue) ? */
export function republicationFinie(job) {
  if (!job || job.action !== "republish") return false;
  const pf = (job.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  if (pf.republish_step !== "recreated" || !pf.recreated_at) return false;
  const lid = String(job.platform_listing_id ?? "").trim();
  // L'ancienne annonce (Vinted : old_vinted_item_id ; autres : old_platform_listing_id)
  // et la nouvelle si l'extension l'a nommée (new_vinted_item_id, new_listing_url).
  const ancien = String(pf.old_platform_listing_id ?? pf.old_vinted_item_id ?? "").trim();
  const nouveau = String(pf.new_vinted_item_id
    ?? (String(pf.new_listing_url ?? "").match(/(\d{6,})(?:[-/?#]|$)/)?.[1] ?? "")).trim();
  return lid !== "" && lid !== ancien && (!nouveau || nouveau === lid);
}

/** Les platform_fields d'une republication close « finie » (attente levée, trace posée). */
export function champsRepublicationFinie(pf, annonce, posePar, maintenantIso = new Date().toISOString()) {
  const out = { ...(pf ?? {}) };
  for (const k of ["needs_user_source", "needsUserField", "needsUserAttempts", "next_action_after", "processing_since",
    "error_technique", "needs_user_actif_ms", "needs_user_tick_le", "needs_user_vu_le", "needs_user_vu_erreur", "needs_user_sans_motif"]) delete out[k];
  out.republication_finie = { le: maintenantIso, annonce: String(annonce), pose_par: posePar };
  return out;
}
