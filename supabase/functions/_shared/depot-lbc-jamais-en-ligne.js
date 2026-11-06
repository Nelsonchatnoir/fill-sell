// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN : JAMAIS « PUBLISHED » SUR UNE ANNONCE QUE LEBONCOIN N'A PAS MISE EN LIGNE (06/11, Nico, règle B)
// ═══════════════════════════════════════════════════════════════════════════
// Louis, 06/11 : 7 remises en vente déposées à 07:22-07:29, refusées par Leboncoin à la modération (« annonce identique
// déjà en ligne », contrôle automatique) — jamais parues, 410 relus à 12:20 —, et « published » chez nous. Sur le parc
// (06/11 ~12:20) : 4 autres dépôts dans le même cas, prouvés (inandup33 ×3 depuis le 01-05/10, jocabroc8 ×1 depuis le
// 30/09), restés « published » des semaines — et la veille les disait « Plus en ligne — vendue ? ».
// LE JUGE (les trois preuves ensemble ; une seule ne suffit JAMAIS) :
//   1. le numéro n'a jamais été vu par un relevé « Mes annonces » depuis le dépôt (annonces_plateforme.vu_le ≥ dépôt) ;
//   2. DEUX relevés Leboncoin COMPLETS (releveComplet) ont commencé après la fenêtre de modération (dépôt + 2 h), le
//      premier dans les 24 h du dépôt — sinon l'annonce a pu vivre et partir entre les deux : on ne conclut rien ;
//   3. la PAGE de l'annonce a été lue absente (410/404 : la veille de l'extension pose sale_signal « unavailable »)
//      après la fenêtre de modération.
//   ⛔ Mesuré le 06/11 : les relevés seuls donnaient des FAUX — 3 dépôts de jocabroc8 jamais vus par ses relevés sont EN
//   LIGNE (200, active). La lecture de la page (3) les écarte : elle n'y a rien vu manquer.
// L'EFFET :
//   · une REMISE EN VENTE (platform_fields.remise_en_vente) repart : pending, sans message, numéro et lien du dépôt
//     refusé retirés (gardés dans depot_refuse_lbc) ; (06/11 soir) la règle A est RETIRÉE (décision de Nico) : la remise
//     repart au passage suivant, et une remise de SÉRIE (_shared/serie-un-par-un.js) qui a un dépôt refusé arrête la série ;
//   · toute autre publication : « failed », message vrai, la publication rendue (refund_publish_unconfirmed, comme le
//     juge Beebs), plus de « Vendue ? » (le signal de la veille est retiré).
// Pur (Deno + Node) : scripts/depot-lbc-jamais-en-ligne-selftest.mjs.
import { releveComplet } from "./retrait-introuvable.js";

export const LBC_MODERATION_MS = 2 * 3600_000;
export const PREMIER_RELEVE_MAX_MS = 24 * 3600_000;
export const REGLE_JAMAIS_EN_LIGNE_LBC = "depot_lbc_jamais_en_ligne_0611";
export const POSE_PAR_JAMAIS_EN_LIGNE_LBC = "handler-watch (dépôt Leboncoin jamais mis en ligne)";
export const MESSAGE_JAMAIS_EN_LIGNE_LBC =
  "Leboncoin n'a jamais mis cette annonce en ligne : elle n'apparaît pas dans tes annonces Leboncoin et sa page est " +
  "fermée (refusée à la modération de Leboncoin, ou retirée avant de paraître). Rien n'est en vente sur Leboncoin pour " +
  "cet article ; cette publication ne compte pas dans tes limites. Vérifie l'annonce (photos, titre, prix) et relance-la.";

const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const iso = (t) => new Date(t).toISOString();

/** Un dépôt Leboncoin publié par FillSell, avec son numéro (jamais une annonce importée du relevé). */
export function estDepotLbcAJuger(job) {
  if (!job || job.platform !== "leboncoin" || job.status !== "published") return false;
  if (!["publish", "republish"].includes(String(job.action ?? "publish"))) return false;
  if (!/^\d{6,}$/.test(String(job.platform_listing_id ?? "").trim())) return false;
  const pf = job.platform_fields ?? {};
  if (String(pf.source ?? "") === "releve" || String(job.handler_build ?? "") === "releve-annonces") return false;
  return Number.isFinite(ms(job.published_at));
}

/**
 * @param {any} job
 * @param {{ vue?: { vu_le?: string|null }|null, releves?: any[], maintenant?: number }} o
 *   vue : la ligne annonces_plateforme de CE numéro (même compte), ou null ; releves : vinted_sync_runs Leboncoin du compte
 * @returns {{ decision: 'jamais_en_ligne'|'attendre'|'en_ligne', raison: string, depot_le?: string, releves?: any[], lecture?: any }}
 */
export function jugerDepotLbcJamaisEnLigne(job, { vue = null, releves = [], maintenant = Date.now() } = {}) {
  const t = ms(job?.published_at);
  if (!estDepotLbcAJuger(job)) return { decision: "attendre", raison: "hors_regle" };
  if (Number.isFinite(ms(vue?.vu_le)) && ms(vue.vu_le) >= t - 5 * 60_000) return { decision: "en_ligne", raison: "vue_par_un_releve" };
  if (maintenant < t + LBC_MODERATION_MS) return { decision: "attendre", raison: "moderation" };
  const complets = (Array.isArray(releves) ? releves : [])
    .filter((r) => r && (r.platform == null || r.platform === "leboncoin") && releveComplet(r) && ms(r.started_at) > t + LBC_MODERATION_MS)
    .sort((a, b) => ms(a.started_at) - ms(b.started_at));
  if (complets.length < 2) return { decision: "attendre", raison: "moins_de_deux_releves_complets" };
  if (ms(complets[0].started_at) > t + PREMIER_RELEVE_MAX_MS) return { decision: "attendre", raison: "premier_releve_trop_tardif" };
  const pf = job.platform_fields ?? {};
  const absente = ms(pf.unavailable_since);
  if (String(pf.sale_signal ?? "") !== "unavailable" || !(absente >= t + LBC_MODERATION_MS)) {
    return { decision: "attendre", raison: "page_pas_relue_absente" };
  }
  return {
    decision: "jamais_en_ligne", raison: "jamais_vue_deux_releves_page_absente", depot_le: iso(t),
    releves: complets.slice(0, 2).map((r) => ({ started_at: r.started_at, items_vus: r.items_vus ?? null, total_entries: r.total_entries ?? null })),
    lecture: { source: "veille_extension", sale_signal: "unavailable", depuis: pf.unavailable_since },
  };
}

const CLES_A_RETIRER = ["sale_signal", "unavailable_since", "unavailable_pending_since", "detected_price", "moderation_probe",
  "processing_since", "next_action_after", "check_unresolved", "check_unresolved_since"];

/** Une remise en vente (elle repart, règle A) ? */
export const estRemiseEnVente = (job) => !!(job?.platform_fields?.remise_en_vente && typeof job.platform_fields.remise_en_vente === "object");

/**
 * Le patch du dépôt jugé. Remise en vente : { status: 'pending', error: null, colonnes vidées } ; autre : 'failed'.
 * @returns {{ status: string, error: string|null, platform_listing_id?: null, listing_url?: null, published_at?: null, platform_fields: Record<string, unknown> }}
 */
export function patchDepotLbcJamaisEnLigne(job, verdict, { maintenant = Date.now(), par = POSE_PAR_JAMAIS_EN_LIGNE_LBC } = {}) {
  const pf = { ...((job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {}) };
  for (const k of CLES_A_RETIRER) delete pf[k];
  const at = iso(maintenant);
  const trace = { at, numero: String(job.platform_listing_id).trim(), lien: job.listing_url ?? null, depot_le: verdict.depot_le,
    releves: verdict.releves ?? [], lecture: verdict.lecture ?? null, lbc_depot: pf.lbc_depot ?? null, regle: REGLE_JAMAIS_EN_LIGNE_LBC, pose_par: par };
  if (estRemiseEnVente(job)) {
    const avant = Array.isArray(pf.depots_refuses_lbc) ? pf.depots_refuses_lbc : [];
    pf.depots_refuses_lbc = [...avant, trace].slice(-5);
    delete pf.lbc_depot;
    return { status: "pending", error: null, platform_listing_id: null, listing_url: null, published_at: null, platform_fields: pf };
  }
  pf.jamais_en_ligne = trace;
  pf.listing_url_abandon = { at, motif: "depot_lbc_jamais_en_ligne", par, refund: null };
  return { status: "failed", error: MESSAGE_JAMAIS_EN_LIGNE_LBC, platform_fields: pf };
}
