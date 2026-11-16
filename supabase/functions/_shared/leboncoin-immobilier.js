// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN IMMOBILIER : JAMAIS TENTÉ, « PAS ENCORE PRIS EN CHARGE » DIT EN UNE PHRASE (16/11/2026, point 9 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur (joshua.sapone, f8a94c06) : « à vendre – la table toscane – pizzeria à riez (04) – 90 000 », une annonce
// Leboncoin rangée « Immobilier › Bureaux & Commerces » (lien https://www.leboncoin.fr/ad/bureaux_commerces/3271304443).
// Sa republication 0a1cac7c (10/11) a bouclé sur le contrôle d'avant retrait, ≈ 40 contrôles par jour depuis le 11/11
// (_shared/prevol-non-concluant.js) : le formulaire Immobilier de Leboncoin (surface, DPE, GES, ascenseur, charges…)
// n'est pas celui d'un objet, FillSell ne sait pas le remplir. Même chose le 07/11 sur un autre compte (8a7f95d5,
// « Studio meublé 25 m² », Immobilier › Locations, republication dd58c22f).
// Les catégories Immobilier de Leboncoin (arbre relevé, src/utils/arbres/leboncoinFeuilles.js — racine « Immobilier ») :
// Ventes immobilières, Locations, Colocations, Bureaux & Commerces. Leur segment dans le lien d'une annonce :
// ventes_immobilieres, locations, colocations, bureaux_commerces (relevé en base le 16/11 : 19 annonces, 7 comptes).
// « Locations de vacances » est une AUTRE racine de Leboncoin : elle n'est pas visée ici.
// LA RÈGLE (toutes les annonces de cette catégorie, tous les comptes) : une publication ou une republication Leboncoin
// en Immobilier n'est jamais tentée.
//   · l'app : la carte du rayon le dit dès que la catégorie est Immobilier, la publication écarte Leboncoin AVANT le
//     débit (aucune tâche créée), la republication ne propose jamais Leboncoin pour cette annonce ;
//   · le serveur (filet : tâches déjà en file, vieilles versions de l'app, republication planifiée) : get-pending-jobs
//     ne la sert jamais ; au premier passage elle passe à la personne (needs_user, source `lbc_immobilier`) avec la
//     phrase vraie. Une republication dont l'annonce est déjà retirée (étape « deleted ») n'est jamais touchée ici.
// La catégorie se lit sur le chemin Leboncoin de la tâche (lbcCategoryPath, posé à la publication ou relu à la capture
// d'une republication) OU sur le lien de l'annonce (une republication porte ce lien dès sa création : retenue avant
// toute capture, rien n'est ouvert sur Leboncoin).
// Pur, sans import : get-pending-jobs (Deno), l'app et le verrou (Node). Verrou : scripts/lbc-immobilier-selftest.mjs.

export const RACINE_IMMOBILIER_LBC = "Immobilier";
export const FEUILLES_IMMOBILIER_LBC = Object.freeze(["Ventes immobilières", "Locations", "Colocations", "Bureaux & Commerces"]);
export const SEGMENTS_URL_IMMOBILIER_LBC = Object.freeze(["ventes_immobilieres", "locations", "colocations", "bureaux_commerces"]);
export const SOURCE_IMMOBILIER_LBC = "lbc_immobilier";

/** La phrase de Nico, mot pour mot (FR), et sa version anglaise. */
export const PHRASE_IMMOBILIER_LBC = Object.freeze({
  fr: "Leboncoin : la catégorie Immobilier n'est pas encore prise en charge par FillSell. Publie cette annonce toi-même sur Leboncoin.",
  en: "Leboncoin: FillSell doesn't handle the Real estate category yet. Post this listing yourself on Leboncoin.",
});

const norm = (s) => String(s ?? "").normalize("NFC").trim().toLowerCase();
const URL_IMMOBILIER_RE = new RegExp(`leboncoin\\.fr/ad/(${SEGMENTS_URL_IMMOBILIER_LBC.join("|")})/`, "i");

/** Le chemin Leboncoin (tableau, ou « Immobilier > Locations ») est-il dans la racine Immobilier ? */
export function cheminImmobilierLbc(chemin) {
  const liste = Array.isArray(chemin) ? chemin : (typeof chemin === "string" && chemin.trim() ? chemin.split(">") : []);
  return liste.length > 0 && norm(liste[0]) === norm(RACINE_IMMOBILIER_LBC);
}

/** Le lien d'une annonce Leboncoin est-il celui d'une annonce Immobilier (segment de catégorie du lien) ? */
export function urlImmobilierLbc(url) {
  return typeof url === "string" && URL_IMMOBILIER_RE.test(url);
}

/** Une tâche (ou un job relu par l'app) porte-t-elle une catégorie Leboncoin Immobilier ? (chemin ou lien) */
export function jobImmobilierLbc(job) {
  if (!job || job.platform !== "leboncoin") return false;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  const snap = pf.republish_snapshot && typeof pf.republish_snapshot === "object" ? pf.republish_snapshot : {};
  return cheminImmobilierLbc(pf.lbcCategoryPath) || urlImmobilierLbc(job.listing_url) || urlImmobilierLbc(snap.listing_url);
}

/** Une publication ou une republication Leboncoin en Immobilier, pas encore engagée (rien retiré). */
export function estAnnonceImmobilierLbc(job) {
  if (!job || job.platform !== "leboncoin") return false;
  const action = job.action ?? "publish";
  if (action !== "publish" && action !== "republish") return false;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (action === "republish" && (pf.deleted_at || String(pf.republish_step ?? "") === "deleted")) return false;
  return jobImmobilierLbc(job);
}

/** Un article dont une tâche Leboncoin (publication, republication, relevé) dit Immobilier : jamais republié par FillSell. */
export function articleImmobilierLbc(jobs) {
  return (jobs ?? []).some((j) => j && j.platform === "leboncoin" && j.action !== "delete" && jobImmobilierLbc(j));
}

/** Le message de la tâche retenue : la phrase, puis ce qui est vrai pour l'annonce. */
export function messageImmobilierLbc(job, lang = "fr") {
  const republication = (job?.action ?? "publish") === "republish";
  if (lang === "en") {
    return `${PHRASE_IMMOBILIER_LBC.en} ${republication ? "Your listing stays online: nothing was removed." : "Nothing was published."}`;
  }
  return `${PHRASE_IMMOBILIER_LBC.fr} ${republication ? "Ton annonce reste en ligne : rien n'a été retiré." : "Rien n'a été publié."}`;
}

/** Les champs de la tâche retenue : la source du geste, la trace, aucune question ni marque de travail en cours. */
export function champsImmobilierLbc(pf, posePar, le = new Date().toISOString()) {
  const out = { ...((pf && typeof pf === "object") ? pf : {}) };
  delete out.processing_since;
  delete out.needsUserField;
  delete out.needsUserFields;
  delete out.next_action_after;
  out.needs_user_source = SOURCE_IMMOBILIER_LBC;
  out.immobilier_lbc = { le, pose_par: posePar, chemin: Array.isArray(out.lbcCategoryPath) ? [...out.lbcCategoryPath] : null };
  return out;
}

/** Les lignes de tâches (app, avant le débit) à écarter : les publications Leboncoin rangées en Immobilier. */
export function plateformesImmobilierLbc(rows) {
  return (rows ?? []).filter((r) => r?.platform === "leboncoin" && cheminImmobilierLbc(r.platform_fields?.lbcCategoryPath)).map((r) => r.platform);
}
