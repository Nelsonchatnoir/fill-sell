// ═══════════════════════════════════════════════════════════════════════════
// SORTIR DE « PLUSIEURS ANNONCES IDENTIQUES » PAR LES FAITS (02/10)
// ═══════════════════════════════════════════════════════════════════════════
// Avant une recréation Vinted, l'extension (≤ 0.6.83) relit la page 1 du
// dressing et compare des TITRES : deux annonces au même titre, inconnues de
// l'inventaire, postées après le retrait → « plusieurs annonces identiques
// (une republication a abouti deux fois) … Rien n'a été recréé » — needs_user,
// annonce retirée, et plus rien ne bouge.
//   · nivake03, « Gomme » (0b54edbc) : les 5 « correspondances » étaient 5
//     Gommes qu'elle a déposées ELLE-MÊME le 01/10 (15:03-15:08), longtemps
//     après notre seule tentative (30/09 22:40). Son annonce est hors ligne
//     depuis le 29/09 ;
//   · 9cdr9rm4rn, « Pantalon 24 mois » (6afed5b9) : deux copies nées de NOS
//     deux envois (la une-passe orpheline de 04:12, la recréation de 08:07) —
//     là, le message « rien n'a été recréé » était faux : elle est en ligne
//     deux fois, pas zéro.
// Un titre ne prouve rien. Ce qui prouve, ce sont des NUMÉROS et des HEURES :
// les fiches que le relevé COMPLET du dressing a trouvées (numéro inconnu
// avant), et l'heure de mise en ligne lue chez Vinted (listed_at_guess),
// comparée aux heures de NOS envois (la une-passe soumet dans la foulée du
// retrait ; chaque recréation marque recreation_tentee).
//   · aucune annonce apparue pendant un de nos envois → aucune n'est à nous :
//     l'impasse est levée, la recréation repart (l'extension relit encore le
//     dressing, où ces fiches sont désormais connues — une seule recréation) ;
//   · une ou plusieurs → c'est sans doute notre remise en ligne, peut-être en
//     double : rien n'est recréé (ce serait une copie de plus), et le message
//     le dit avec les liens. Lesquelles garder : à la personne.
//   · pas encore de relevé complet après l'impasse → on attend, on ne conclut
//     rien sur une lecture partielle.
// Pur, sans import réseau (Deno + Node).

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
export const IMPASSE_IDENTIQUES_RE = /plusieurs annonces identiques/i;
// Une soumission met en ligne en quelques secondes ; Vinted date l'annonce à
// la minute près. Marges : 2 min avant (horloges), 20 min après (photos lentes).
const AVANT_MS = 2 * 60_000;
const APRES_MS = 20 * 60_000;

/** L'impasse d'une recréation Vinted, ou null. */
export function impasseRecreationVinted(job) {
  if (!job || job.platform !== "vinted" || job.action !== "republish" || job.status !== "needs_user") return null;
  const pf = objet(job.platform_fields) ?? {};
  if (String(pf.republish_step ?? "") !== "deleted") return null;
  const doublon = objet(pf.recreation_doublon);
  if (!doublon && !IMPASSE_IDENTIQUES_RE.test(String(job.error ?? ""))) return null;
  const at = ms(doublon?.at) || ms(objet(objet(pf.gardes)?.prevol_recreation)?.at);
  const envois = [ms(pf.deleted_at_serveur) || ms(pf.deleted_at), ms(objet(pf.recreation_tentee)?.at)]
    .filter((t) => Number.isFinite(t));
  if (!Number.isFinite(at) || !envois.length) return null;
  return { at, envois, deletedAt: ms(pf.deleted_at_serveur) || ms(pf.deleted_at) };
}

/**
 * releves : relevés Vinted du compte (vinted_sync_runs), { kind, status,
 *   started_at, items_vus, total_entries } ;
 * fiches : fiches du compte portant un numéro Vinted, { vinted_item_id,
 *   listed_at_guess, titre }.
 * Rend { action: 'relancer'|'en_double', status, error, platform_fields,
 *   apparues } ou null (rien à décider pour l'instant).
 * @param {any} job
 * @param {{ releves?: Array<any>, fiches?: Array<any>, maintenant?: number }} [ctx]
 */
export function decisionImpasseRecreation(job, { releves = [], fiches = [], maintenant = Date.now() } = {}) {
  const imp = impasseRecreationVinted(job);
  if (!imp) return null;
  const complet = (Array.isArray(releves) ? releves : []).some((r) =>
    r && r.kind === "dressing" && r.status === "done" && ms(r.started_at) > imp.at
    && Number(r.total_entries) > 0 && Number(r.items_vus) >= Number(r.total_entries));
  if (!complet) return null;
  const pf0 = objet(job.platform_fields) ?? {};
  const pf = { ...pf0 };
  const iso = (t) => new Date(t).toISOString();
  const apparues = (Array.isArray(fiches) ? fiches : [])
    .filter((f) => f && f.vinted_item_id && String(f.vinted_item_id) !== String(pf0.vinted_item_id ?? ""))
    .filter((f) => {
      const t = ms(f.listed_at_guess);
      return Number.isFinite(t) && imp.envois.some((e) => t >= e - AVANT_MS && t <= e + APRES_MS);
    })
    .map((f) => ({ id: String(f.vinted_item_id), le: String(f.listed_at_guess) }));
  for (const k of ["needs_user_source", "needsUserBoucle", "needsUserResolved", "needs_user_vu_le", "needs_user_vu_erreur",
    "needs_user_tick_le", "needs_user_actif_ms", "error_technique", "processing_since"]) delete pf[k];
  if (!apparues.length) {
    delete pf.recreation_doublon;
    delete pf.next_action_after;
    pf.recreation_doublon_leve = { le: iso(maintenant), par: "releve_complet", impasse_le: iso(imp.at), envois: imp.envois.map(iso) };
    return {
      action: "relancer", status: "pending", platform_fields: pf, apparues,
      error: "Ton annonce a été retirée de Vinted et n'est pas encore revenue en ligne : aucune des annonces apparues sur ton " +
        "compte depuis n'est née d'un de nos envois (relevé complet de ton dressing). On la remet en ligne, une seule fois — " +
        "rien à faire de ton côté.",
    };
  }
  pf.recreation_doublon = { ...(objet(pf0.recreation_doublon) ?? {}), at: iso(imp.at), apparues, juge_le: iso(maintenant), par: "releve_complet" };
  const liens = apparues.slice(0, 4).map((a) => `https://www.vinted.fr/items/${a.id}`).join(" , ");
  return {
    action: "en_double", status: "needs_user", platform_fields: pf, apparues,
    error: (apparues.length > 1
      ? `Ta republication est sans doute en ligne ${apparues.length} fois : ${apparues.length} annonces sont apparues sur ton Vinted au moment de nos envois (${liens}). `
      : `Ta republication est sans doute déjà en ligne : une annonce est apparue sur ton Vinted au moment de nos envois (${liens}). `) +
      "Rien n'a été recréé de plus. Vérifie-les sur Vinted : garde celle que tu veux, supprime les autres s'il y en a.",
  };
}
