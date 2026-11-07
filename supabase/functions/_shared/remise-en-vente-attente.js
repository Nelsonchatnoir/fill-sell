// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN : UNE REMISE EN VENTE N'EST DÉPOSÉE QU'UNE FOIS L'ANNONCE VENDUE HORS LIGNE (06/11, Nico, règle A)
// ═══════════════════════════════════════════════════════════════════════════
// Louis (compte Amiral), 06/11 : 7 ventes en série enregistrées à 07:15 (transaction Leboncoin « Achat en cours »), puis 7
// remises en vente déposées de 07:22 à 07:29 — alors que les 7 annonces vendues étaient toujours EN LIGNE sur Leboncoin
// (Leboncoin garde une annonce sous transaction « active » des jours durant). Leboncoin a refusé les nouvelles : « une
// annonce similaire déjà en ligne, vous ne pouvez pas déposer une annonce identique », refus par contrôle automatique.
// Aucune n'est jamais parue (410 relus à 12:20) ; chez nous, « published ».
// Cause : 20261105170000 (remises_en_vente_tick, a) ne compte plus une annonce Leboncoin sous transaction comme « encore
// en ligne » — voulu pour que la vente ne bloque pas la remise à vie —, et rien ne retenait le DÉPÔT tant qu'elle l'est.
// LA RÈGLE : sur Leboncoin, la tâche de remise en vente (platform_fields.remise_en_vente) n'est SERVIE à l'extension
// qu'une fois l'annonce vendue (remise_en_vente.annonce_vendue) réellement hors ligne — relevée disparue, retirée, ou
// plus du tout relevée en ligne. Tant qu'elle l'est, la tâche attend, pending, intacte, SANS message (rien à faire
// pour le vendeur), et part d'elle-même au premier poll qui suit le relevé qui la voit partir. La vente, elle, reste
// enregistrée tout de suite (« transaction Leboncoin pending = vente payée », décision de Nico, inchangée).
// Les autres plateformes : Vinted, Beebs, Depop marquent l'annonce vendue « vendue » (elle n'est plus en vente) et
// n'interdisent pas une annonce semblable ; eBay clôt l'annonce à la vente (une série y vit en quantité, pas en remise).
// Seul Leboncoin refuse un dépôt identique à une annonce encore active : la règle ne joue que là.
// Pur (Deno + Node).

export const PLATEFORMES_REMISE_APRES_DISPARITION = Object.freeze(["leboncoin"]);
const VIVANTE = new Set(["en_ligne", "en_verification"]);

/** Le numéro de l'annonce vendue que cette remise en vente remplace, ou null (pas une remise, ou numéro inconnu). */
export function annonceVendueDeLaRemise(job) {
  const r = job?.platform_fields?.remise_en_vente;
  if (!r || typeof r !== "object") return null;
  const n = String(r.annonce_vendue ?? "").trim();
  return /^\d{4,}$/.test(n) ? n : null;
}

/** Cette tâche est-elle une remise en vente qui doit attendre la disparition de l'annonce vendue (sa plateforme) ? */
export function remiseAAttendre(job) {
  return !!job && PLATEFORMES_REMISE_APRES_DISPARITION.includes(String(job.platform ?? ""))
    && String(job.action ?? "publish") === "publish" && annonceVendueDeLaRemise(job) != null;
}

/**
 * L'annonce vendue est-elle encore EN LIGNE d'après le relevé ? (la ligne annonces_plateforme de son numéro, même compte,
 * même plateforme). Aucune ligne : inconnue → on ne retient pas (rien ne prouve qu'elle est là).
 * @param {{ disparu_le?: string|null, retiree_le?: string|null, ignoree_le?: string|null, statut_plateforme?: string|null }|null} ligne
 */
export function annonceVendueEncoreEnLigne(ligne) {
  if (!ligne) return false;
  if (ligne.disparu_le || ligne.retiree_le || ligne.ignoree_le) return false;
  return VIVANTE.has(String(ligne.statut_plateforme ?? ""));
}

// ═══════════════════════════════════════════════════════════════════════════
// (07/11, décision de Nico — option A) UNE REMISE DÉPOSÉE PENDANT QUE L'ANNONCE VENDUE ÉTAIT AFFICHÉE REVIENT EN ATTENTE
// ═══════════════════════════════════════════════════════════════════════════
// Louis, 06-07/11 : 3 remises Leboncoin (3303702852, 3303792394, 3303867959) déposées quand la règle A était retirée,
// pendant que leur annonce vendue IDENTIQUE restait affichée (transaction en cours) : désactivées par Leboncoin (410),
// closes « cancelled » (garde jumeau, à tort) puis rejugées « failed ». Nico : elles ne finissent PAS en « failed » —
// elles repartent seules quand la vendue a disparu, et la série reprend. LA RÈGLE (handler-watch) : une remise Leboncoin
// close (cancelled / failed) depuis 14 jours au plus, dont le dépôt n'a JAMAIS été vu en ligne et dont l'annonce vendue
// est ENCORE affichée, revient « pending » : le dépôt refusé est archivé (numéro gardé), la tâche redevient une remise
// neuve, retenue par la règle A jusqu'à la disparition de la vendue. Jamais si une AUTRE annonce non vendue de la fiche
// est en ligne (doublon), jamais plus de 3 fois par tâche, jamais une tâche annulée par la personne (arret_utilisateur).

export const REARMEMENTS_MAX = 3;
export const FENETRE_REARMEMENT_MS = 14 * 86_400_000;
export const DELAI_PUBLIE_JAMAIS_VU_MS = 2 * 3600_000;

/**
 * Décision pour une remise close : la remettre en attente (règle A) ?
 * @param {any} job  la tâche (status, created_at, platform_fields, error)
 * @param {{ vendueEncoreAffichee: boolean, depotVu: boolean, autreAnnonceVivante: boolean, maintenant?: number }} faits
 * @returns {{ rearmer: boolean, motif: string }}
 */
export function decisionRearmementRemise(job, { vendueEncoreAffichee, depotVu, autreAnnonceVivante, maintenant = Date.now() }) {
  const pf = job?.platform_fields ?? {};
  if (!remiseAAttendre({ ...job, action: job?.action ?? "publish" })) return { rearmer: false, motif: "pas_une_remise_leboncoin" };
  // (07/11) Aussi un dépôt « published » JAMAIS vu depuis 2 h au moins, sa vendue identique encore affichée : Leboncoin
  // le refuse à la seconde du dépôt (essai réel du 30/10 ; rang 4 de Louis, 3304017454, 410 relu le 07/11) — inutile
  // d'attendre qu'il passe « failed ».
  const statut = String(job?.status ?? "");
  const publieDepuis = Date.parse(String(job?.published_at ?? ""));
  if (statut === "published" && !(Number.isFinite(publieDepuis) && maintenant - publieDepuis >= DELAI_PUBLIE_JAMAIS_VU_MS)) return { rearmer: false, motif: "publie_recent" };
  if (!["cancelled", "failed", "published"].includes(statut)) return { rearmer: false, motif: "pas_close" };
  if (pf.arret_utilisateur || /à ta demande/i.test(String(job?.error ?? ""))) return { rearmer: false, motif: "arretee_par_la_personne" };
  const cree = Date.parse(String(job?.created_at ?? ""));
  if (!Number.isFinite(cree) || maintenant - cree > FENETRE_REARMEMENT_MS) return { rearmer: false, motif: "trop_ancienne" };
  if ((Number(pf.remise_regle_a?.rearmements) || 0) >= REARMEMENTS_MAX) return { rearmer: false, motif: "plafond" };
  if (job?.vu_en_ligne_le || pf.vu_en_ligne_le || depotVu) return { rearmer: false, motif: "depot_vu_en_ligne" };
  if (!vendueEncoreAffichee) return { rearmer: false, motif: "vendue_partie" };
  if (autreAnnonceVivante) return { rearmer: false, motif: "autre_annonce_en_ligne" };
  return { rearmer: true, motif: "vendue_encore_affichee" };
}

/** Le platform_fields de la remise remise en attente (pur) : le dépôt refusé archivé, la tâche redevient neuve. */
export function champsRearmementRemise(pf0 = {}, job = {}, maintenant = new Date().toISOString()) {
  const pf = { ...pf0 };
  const numero = String(job?.platform_listing_id ?? pf?.lbc_depot?.adsubmit?.id ?? pf?.lbc_depot?.sans_adsubmit?.id ?? "").trim() || null;
  const archive = Array.isArray(pf.depots_desactives_regle_a) ? pf.depots_desactives_regle_a : [];
  pf.depots_desactives_regle_a = [...archive, {
    le: maintenant, numero, statut: job?.status ?? null, erreur: String(job?.error ?? "").slice(0, 400) || null,
    depot_le: pf?.lbc_depot?.at ?? null, issue: pf?.depot_jamais_en_ligne?.issue ?? null,
  }].slice(-10);
  for (const k of ["lbc_depot", "depot_jamais_en_ligne", "pas_encore_visible", "moderation_probe", "processing_since",
    "next_action_after", "needs_user_source", "sale_signal", "unavailable_since", "unavailable_pending_since",
    "lien_retrouve_par_identifiant", "work_window_state", "pas_de_rouge", "error_technique"]) delete pf[k];
  const avant = pf.remise_regle_a && typeof pf.remise_regle_a === "object" ? pf.remise_regle_a : {};
  pf.remise_regle_a = { ...avant, rearmee_le: maintenant, rearmements: (Number(avant.rearmements) || 0) + 1,
    annonce_vendue: annonceVendueDeLaRemise({ platform_fields: pf0 }), regle: "remise_apres_disparition_0711" };
  return pf;
}
