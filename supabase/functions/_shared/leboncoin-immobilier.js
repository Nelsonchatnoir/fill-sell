// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN IMMOBILIER (ET LOCATIONS DE VACANCES) : JAMAIS TENTÉ, « PAS ENCORE PRIS EN CHARGE » DIT EN UNE PHRASE
// (16/11/2026, point 9 de Nico ; Locations de vacances : point 6 du soir)
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
// (16/11/2026 soir, point 6 de Nico, « Oui, bloque Locations de vacances ») LA MÊME RÈGLE POUR LA RACINE « LOCATIONS DE
// VACANCES » de Leboncoin (une autre racine que l'Immobilier ; une seule feuille dans l'arbre relevé : « Locations
// saisonnières » ; segment du lien : locations_saisonnieres). Relevé en base le 16/11 (lecture seule) : 16 annonces de
// 4 comptes (6d347cc3, 7f2cadb8, b2de74c9, faf5021a : mobil-homes, gîtes, villas), une seule passée par FillSell (une
// publication de b2de74c9, en ligne) ; aucune tâche vivante. Décision de Nico : le même traitement que l'Immobilier (une
// annonce de logement, pas d'objet), avec une phrase qui dit SA catégorie.
// Une catégorie non prise en charge = une entrée de CATEGORIES_NON_PRISES_LBC (racine, segments du lien, phrase,
// source de la tâche retenue, motif de l'écran de suivi). Les fonctions « …ImmobilierLbc » portant sur une TÂCHE, un
// ARTICLE ou des LIGNES (jobImmobilierLbc, estAnnonceImmobilierLbc, articleImmobilierLbc, messageImmobilierLbc,
// champsImmobilierLbc, plateformesImmobilierLbc) gardent leur nom (get-pending-jobs les importe) et couvrent TOUTES les
// catégories de la liste ; cheminImmobilierLbc / urlImmobilierLbc restent l'Immobilier seul.
// LA RÈGLE (toutes les annonces de ces catégories, tous les comptes) : une publication ou une republication Leboncoin
// en Immobilier ou en Locations de vacances n'est jamais tentée.
//   · l'app : la carte du rayon le dit dès que la catégorie est l'une d'elles, la publication écarte Leboncoin AVANT le
//     débit (aucune tâche créée), la republication ne propose jamais Leboncoin pour cette annonce ;
//   · le serveur (filet : tâches déjà en file, vieilles versions de l'app, republication planifiée) : get-pending-jobs
//     ne la sert jamais ; au premier passage elle passe à la personne (needs_user, source `lbc_immobilier` ou
//     `lbc_locations_vacances`) avec la phrase vraie. Une republication dont l'annonce est déjà retirée (étape
//     « deleted ») n'est jamais touchée ici.
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

// (16/11/2026 soir, point 6 de Nico) Locations de vacances.
export const RACINE_VACANCES_LBC = "Locations de vacances";
export const FEUILLES_VACANCES_LBC = Object.freeze(["Locations saisonnières"]);
export const SEGMENTS_URL_VACANCES_LBC = Object.freeze(["locations_saisonnieres"]);
export const SOURCE_VACANCES_LBC = "lbc_locations_vacances";
export const PHRASE_VACANCES_LBC = Object.freeze({
  fr: "Leboncoin : la catégorie Locations de vacances n'est pas encore prise en charge par FillSell. Publie cette annonce toi-même sur Leboncoin.",
  en: "Leboncoin: FillSell doesn't handle the Holiday rentals category yet. Post this listing yourself on Leboncoin.",
});

/** Les catégories Leboncoin que FillSell ne sait pas remplir : une entrée par racine de l'arbre. */
export const CATEGORIES_NON_PRISES_LBC = Object.freeze([
  Object.freeze({ cle: "immobilier", racine: RACINE_IMMOBILIER_LBC, segments: SEGMENTS_URL_IMMOBILIER_LBC,
    phrase: PHRASE_IMMOBILIER_LBC, source: SOURCE_IMMOBILIER_LBC, motif: "immobilier_lbc" }),
  Object.freeze({ cle: "locations_vacances", racine: RACINE_VACANCES_LBC, segments: SEGMENTS_URL_VACANCES_LBC,
    phrase: PHRASE_VACANCES_LBC, source: SOURCE_VACANCES_LBC, motif: "locations_vacances_lbc" }),
]);
const IMMOBILIER = CATEGORIES_NON_PRISES_LBC[0];

const norm = (s) => String(s ?? "").normalize("NFC").trim().toLowerCase();
const SEGMENT_URL_RE = /leboncoin\.fr\/ad\/([^/?#]+)\//i;

/** La catégorie non prise en charge d'un chemin Leboncoin (tableau, ou « Immobilier > Locations »), ou null. */
export function categorieCheminLbc(chemin) {
  const liste = Array.isArray(chemin) ? chemin : (typeof chemin === "string" && chemin.trim() ? chemin.split(">") : []);
  if (!liste.length) return null;
  const racine = norm(liste[0]);
  return CATEGORIES_NON_PRISES_LBC.find((c) => norm(c.racine) === racine) ?? null;
}

/** La catégorie non prise en charge du lien d'une annonce Leboncoin (segment de catégorie du lien), ou null. */
export function categorieUrlLbc(url) {
  const segment = typeof url === "string" ? (url.match(SEGMENT_URL_RE)?.[1] ?? "").toLowerCase() : "";
  return segment ? (CATEGORIES_NON_PRISES_LBC.find((c) => c.segments.includes(segment)) ?? null) : null;
}

/** La catégorie non prise en charge d'une tâche Leboncoin (chemin, puis lien, puis lien de l'instantané), ou null. */
export function categorieJobLbc(job) {
  if (!job || job.platform !== "leboncoin") return null;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  const snap = pf.republish_snapshot && typeof pf.republish_snapshot === "object" ? pf.republish_snapshot : {};
  return categorieCheminLbc(pf.lbcCategoryPath) ?? categorieUrlLbc(job.listing_url) ?? categorieUrlLbc(snap.listing_url);
}

/** Le chemin Leboncoin (tableau, ou « Immobilier > Locations ») est-il dans la racine Immobilier ? */
export function cheminImmobilierLbc(chemin) {
  return categorieCheminLbc(chemin)?.cle === IMMOBILIER.cle;
}

/** Le lien d'une annonce Leboncoin est-il celui d'une annonce Immobilier (segment de catégorie du lien) ? */
export function urlImmobilierLbc(url) {
  return categorieUrlLbc(url)?.cle === IMMOBILIER.cle;
}

/** Le lien d'une annonce Leboncoin est-il celui d'une annonce Locations de vacances ? */
export function urlVacancesLbc(url) {
  return categorieUrlLbc(url)?.cle === "locations_vacances";
}

/** Une tâche (ou un job relu par l'app) porte-t-elle une catégorie Leboncoin non prise en charge ? (chemin ou lien) */
export function jobImmobilierLbc(job) {
  return categorieJobLbc(job) != null;
}

/** Une publication ou une republication Leboncoin en Immobilier ou en Locations de vacances, pas encore engagée (rien retiré). */
export function estAnnonceImmobilierLbc(job) {
  if (!job || job.platform !== "leboncoin") return false;
  const action = job.action ?? "publish";
  if (action !== "publish" && action !== "republish") return false;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (action === "republish" && (pf.deleted_at || String(pf.republish_step ?? "") === "deleted")) return false;
  return jobImmobilierLbc(job);
}

/** La catégorie non prise en charge d'un article, lue sur ses tâches Leboncoin (publication, republication, relevé), ou null. */
export function categorieArticleLbc(jobs) {
  for (const j of jobs ?? []) {
    if (!j || j.platform !== "leboncoin" || j.action === "delete") continue;
    const c = categorieJobLbc(j);
    if (c) return c;
  }
  return null;
}

/** Un article dont une tâche Leboncoin dit Immobilier ou Locations de vacances : jamais republié par FillSell. */
export function articleImmobilierLbc(jobs) {
  return categorieArticleLbc(jobs) != null;
}

/** Le message de la tâche retenue : la phrase de SA catégorie, puis ce qui est vrai pour l'annonce. */
export function messageImmobilierLbc(job, lang = "fr") {
  const republication = (job?.action ?? "publish") === "republish";
  const phrase = (categorieJobLbc(job) ?? IMMOBILIER).phrase;
  if (lang === "en") {
    return `${phrase.en} ${republication ? "Your listing stays online: nothing was removed." : "Nothing was published."}`;
  }
  return `${phrase.fr} ${republication ? "Ton annonce reste en ligne : rien n'a été retiré." : "Rien n'a été publié."}`;
}

/** Les champs de la tâche retenue : la source du geste (celle de SA catégorie, lue sur le chemin ou le lien de
 *  l'instantané), la trace, aucune question ni marque de travail en cours. */
export function champsImmobilierLbc(pf, posePar, le = new Date().toISOString()) {
  const out = { ...((pf && typeof pf === "object") ? pf : {}) };
  const snap = out.republish_snapshot && typeof out.republish_snapshot === "object" ? out.republish_snapshot : {};
  const categorie = categorieCheminLbc(out.lbcCategoryPath) ?? categorieUrlLbc(snap.listing_url) ?? IMMOBILIER;
  delete out.processing_since;
  delete out.needsUserField;
  delete out.needsUserFields;
  delete out.next_action_after;
  out.needs_user_source = categorie.source;
  out[categorie.motif] = { le, pose_par: posePar, chemin: Array.isArray(out.lbcCategoryPath) ? [...out.lbcCategoryPath] : null };
  return out;
}

/** La catégorie non prise en charge de la publication Leboncoin parmi des lignes de tâches (app, avant le débit), ou null. */
export function categorieLignesLbc(rows) {
  for (const r of rows ?? []) {
    if (r?.platform !== "leboncoin") continue;
    const c = categorieCheminLbc(r.platform_fields?.lbcCategoryPath);
    if (c) return c;
  }
  return null;
}

/** Les lignes de tâches (app, avant le débit) à écarter : les publications Leboncoin rangées en Immobilier ou en
 *  Locations de vacances. */
export function plateformesImmobilierLbc(rows) {
  return (rows ?? []).filter((r) => r?.platform === "leboncoin" && categorieCheminLbc(r.platform_fields?.lbcCategoryPath) != null).map((r) => r.platform);
}
