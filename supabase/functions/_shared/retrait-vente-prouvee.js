// ═══════════════════════════════════════════════════════════════════════════
// UNE VENTE PROUVÉE RETIRE SES COPIES TOUT DE SUITE (05/11, point 10 — Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Louis mesurait 15 à 20 min entre la vente et le retrait des copies. Mesuré sur ses 14 dernières ventes : vente →
// détection ~7 min (veille des commandes, 10 min ± 90 s, inchangée), puis 10 min d'attente VOULUE avant que le retrait
// soit servi (aucun retrait pris avant 10:12), puis le poll. Les 10 min viennent de armer_retraits_copies (migration
// 20260926203051, « laisser annuler un Vendu cliqué par erreur ») et s'appliquaient à TOUTE vente, même prouvée.
// RÈGLE : un retrait armé par une vente (arme_par.chemin « vente_… ») dont la fiche porte une vente PROUVÉE par la
// plateforme — une ligne de vente avec le numéro de commande ou de transaction de la plateforme (commande Vinted,
// transaction Leboncoin, relevé) — est servi sans attendre : il n'y a rien à annuler. Le « Vendu » cliqué à la main n'a
// pas de numéro : il garde ses 10 min. Rien n'est écrit en base ; aucune visite de plus (la cadence ne bouge pas).
// Pur (Node + Deno) : scripts/retrait-vente-prouvee-selftest.mjs.

const t = (v) => { const x = Date.parse(String(v ?? "")); return Number.isFinite(x) ? x : NaN; };
// La vente doit être celle qui a armé ce retrait : écrite au plus 2 h avant lui (une vente plus ancienne de la même
// fiche — article en série, revendu — ne lève pas l'attente d'un retrait d'aujourd'hui).
export const FENETRE_VENTE_MS = 2 * 3600_000;

/** Un retrait de vente qui attend son heure (next_action_after dans le futur). */
export function retraitDeVenteEnAttente(job, maintenant = Date.now()) {
  if (String(job?.action ?? "") !== "delete" || job?.inventaire_id == null) return false;
  const pf = job?.platform_fields ?? {};
  if (!/^vente_/.test(String(pf?.arme_par?.chemin ?? ""))) return false;
  const echeance = t(pf.next_action_after);
  return Number.isFinite(echeance) && echeance > maintenant;
}

/** La fiche de ce retrait porte-t-elle une vente prouvée par la plateforme (numéro de commande), de son compte, récente ? */
export function venteProuveePourRetrait(job, ventes = []) {
  const cree = t(job?.created_at);
  return (ventes ?? []).some((v) => String(v?.inventaire_id ?? "") === String(job?.inventaire_id ?? "")
    && String(v?.user_id ?? "") === String(job?.user_id ?? "")
    && String(v?.commande_ref ?? "").trim() !== ""
    && (!Number.isFinite(cree) || t(v?.created_at) >= cree - FENETRE_VENTE_MS));
}

/** Le job tel qu'il part : sans l'échéance (l'extension saute un job dont l'échéance est future). La base ne change pas. */
export function retraitServiSansAttente(job) {
  const pf = { ...(job?.platform_fields ?? {}) };
  delete pf.next_action_after;
  pf.attente_levee = { motif: "vente_prouvee", par: "get-pending-jobs" };
  return { ...job, platform_fields: pf };
}

/** (05/11, point 10) L'ordre d'une file Leboncoin « une action toutes les 10 min » (reprise prudente, délégation) : les
 * retraits d'abord, puis l'ancienneté. Seul l'ordre change : toujours une action par créneau. */
export function retraitsDabord(a, b) {
  const ra = String(a?.action ?? "") === "delete" ? 0 : 1, rb = String(b?.action ?? "") === "delete" ? 0 : 1;
  if (ra !== rb) return ra - rb;
  return String(a?.created_at ?? "").localeCompare(String(b?.created_at ?? ""));
}
