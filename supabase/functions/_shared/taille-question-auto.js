// ══════════════════════════════════════════════════════════════════════════
// UNE QUESTION DE TAILLE QUE LA RÈGLE SAIT TRANCHER REPART SEULE (06/10 soir)
// ══════════════════════════════════════════════════════════════════════════
// patrick giry, jean « W28 L32 » : eBay (b95ff146) et Opla (3faa5b8d) arrêtés
// sur la question « Taille », avec la grille ENTIÈRE de la plateforme dans
// needsUserField.allowed_values. Quelle que soit la plateforme, une question
// de taille porte sa grille : _shared/taille-de-service.js y lit la valeur la
// plus fidèle (règle R0 → R4) ; si elle répond, handler-watch écrit la réponse
// exactement comme le geste « ✋ Compléter » de l'app (cible, needsUserResolved,
// motif archivé), UNE fois (marqueur taille_convertie_serveur), et le job
// repart. Sinon, la question reste à la personne (l'exception, nommée).
// ⛔ Jamais la fiche : seule la copie de la plateforme reçoit la valeur.
// ⛔ Jamais une question qui n'est pas une taille (« Format du colis »,
//    package_size, marque…), jamais sans grille, jamais deux fois.
// (19/10, Ornella « Pull Kiabi 24M ») R0 → R4 sans réponse : la taille que la
// copie et les textes du vendeur disent ENSEMBLE (_shared/taille-du-texte.js :
// FR écrit, W → FR, âge en mois « 24M » → « 24 mois (86-94 cm) ») — une seule
// option de la grille, jamais en cas de doute, jamais une pointure.
// Pur (Deno + Node), imports relatifs.
import { tailleDeService, brancheDeTaille, tailleParDimensionsDesTextes } from "./taille-de-service.js";
import { tailleDuTexte } from "./taille-du-texte.js";
import { vintedObjetSansTaille } from "./vinted-exigences.js";
// (07/11) eBay seulement : le complément eBay de la règle des tailles (l'âge en anglais, le préfixe de pays).
import { tailleEbayComplement } from "./taille-ebay.js";

const CLES_TAILLE = /^(taille|size|oplasizechoice|depoptaille|pointure|shoe_size|clothing_st)$/i;

/** La question posée est-elle une question de TAILLE avec sa grille ? */
export function estQuestionTaille(f) {
  if (!f || typeof f !== "object") return false;
  const k = String(f.field_key ?? "").trim();
  if (!k || /colis|package/i.test(k)) return false;
  const grille = Array.isArray(f.allowed_values) ? f.allowed_values.filter((v) => String(v ?? "").trim()) : [];
  if (!grille.length) return false;
  return CLES_TAILLE.test(k) || (/^(taille|pointure)/i.test(String(f.field_label ?? "")) && !/colis/i.test(String(f.field_label ?? "")));
}

/**
 * La réponse que la règle donne à la question de taille de ce job, ou null.
 * @param {{status?:string, platform?:string, platform_fields?:object}} job
 * @param {string|null} tailleFiche — inventaire.attributs.taille.v (repli)
 * @param {unknown[]|null} textes — titre et description (job, fiche) ; absent : R0 → R4 seules
 */
export function reponseTailleAuto(job, tailleFiche = null, textes = null) {
  if (!job || job.status !== "needs_user") return null;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (pf.taille_convertie_serveur) return null; // une fois
  const f = pf.needsUserField;
  if (!estQuestionTaille(f)) return null;
  const ebay = pf.ebayAspects && typeof pf.ebayAspects === "object" ? pf.ebayAspects : {};
  const vintedA = pf.vintedAspects && typeof pf.vintedAspects === "object" ? pf.vintedAspects : {};
  const brut = [pf.taille, ebay.Taille, ebay.Pointure, vintedA.size, tailleFiche]
    .map((v) => String(v ?? "").trim()).find(Boolean) ?? "";
  if (!brut && !textes && !(String(job.platform ?? "") === "vinted" && vintedObjetSansTaille(pf.categoryPath ?? []))) return null;
  const branche = brancheDeTaille(
    pf.categoryPath ?? [], pf.oplaCategoryPath ?? [], pf.beebsCategoryPath ?? [], pf.lbcCategoryPath ?? [],
    pf.ebayCategoryPath ?? [], String(ebay["Département"] ?? ""), String(pf.genre ?? ""),
  );
  let r = brut ? tailleDeService(brut, f.allowed_values, { branche }) : null;
  if (!r && textes) {
    const chemin = [pf.categoryPath, pf.oplaCategoryPath, pf.beebsCategoryPath, pf.lbcCategoryPath, pf.ebayCategoryPath]
      .find((c) => Array.isArray(c) && c.length) ?? null;
    const d = tailleDuTexte({ valeur: brut, textes, grille: f.allowed_values, champ: `${f.field_key ?? ""} ${f.field_label ?? ""}`, chemin });
    if (d?.valeur) r = { valeur: d.valeur, motif: d.motif, regle: "R5" };
  }
  // (07/11, Rosa Metra ba0c4d73) eBay SEULEMENT, et seulement si rien n'a répondu : le complément eBay
  // (_shared/taille-ebay.js) — « 11-12 yrs » → « 11-12 ans » (E1), « EU S » → « S » (E2) ; la question porte la liste
  // qui fait foi. Les autres plateformes gardent leur règle.
  if (!r && brut && String(job.platform ?? "") === "ebay") {
    const cle = String((f.target && typeof f.target === "object" && f.target.key) || f.field_key || "");
    const nom = cle ? cle.charAt(0).toUpperCase() + cle.slice(1) : "";
    const c = tailleEbayComplement(nom, brut, f.allowed_values, { ferme: true });
    if (c) r = c;
  }
  // (26/10, « Maison Gabby » de Louis) Un OBJET de la branche des jouets Vinted, sans aucune taille nulle part (copie,
  // fiche, texte) : « Taille unique » de la grille — la même règle que l'écran (vinted-exigences.js). Jamais un
  // déguisement ni un tablier (ils se portent), jamais à la place d'une taille écrite.
  if (!r && !brut && String(job.platform ?? "") === "vinted" && vintedObjetSansTaille(pf.categoryPath ?? [])) {
    const unique = (f.allowed_values ?? []).find((v) => /^taille unique$/i.test(String(v ?? "").trim()));
    if (unique) r = { valeur: String(unique), motif: "objet de la branche des jouets : taille unique", regle: "R7" };
  }
  // (07/11, famille 2 — c7c382b7 ff009cba, parure « 260 x 240 cm » face à la grille Vinted des housses de couette) Une
  // grille en DIMENSIONS : les dimensions écrites par le vendeur, placées par R8 (_shared/taille-de-service.js) — l'option
  // exacte, sinon la seule qui les contient ; plusieurs ou aucune → la question reste. Seulement si rien n'a répondu.
  if (!r && textes) {
    const d = tailleParDimensionsDesTextes(textes, f.allowed_values);
    if (d) r = { valeur: d.valeur, motif: d.motif, regle: "R8" };
  }
  if (!r) return null;
  if (String(f.field_key ?? "") === "depopTaille" && !reponseTailleDepopSure(job, r)) return null;
  const cible = f.target && typeof f.target === "object" && f.target.key
    ? { root: f.target.root ?? null, key: String(f.target.key) }
    : { root: null, key: String(f.field_key) };
  return { valeur: r.valeur, regle: r.regle, motif: r.motif, brut, branche, cible, champ: String(f.field_label ?? f.field_key) };
}

/**
 * Les platform_fields après la réponse — la même écriture que le geste
 * « ✋ Compléter » (StockTab, valider) : cible posée, needsUserResolved,
 * question et compteurs effacés, plus le marqueur de la règle.
 */
export function champsApresReponseTaille(pf, rep, maintenantIso) {
  const out = { ...(pf ?? {}) };
  const { root, key } = rep.cible;
  if (root) out[root] = { ...((pf ?? {})[root] ?? {}), [key]: rep.valeur };
  else out[key] = rep.valeur;
  out.needsUserResolved = { ...((pf ?? {}).needsUserResolved ?? {}), [root ? `${root}.${key}` : key]: rep.valeur };
  for (const k of ["needsUserField", "needsUserFields", "needs_user_source", "needs_user_tick_le", "needs_user_actif_ms",
    "needs_user_vu_le", "needs_user_vu_erreur", "next_action_after", "processing_since"]) delete out[k];
  out.needsUserAttempts = 0;
  out.taille_convertie_serveur = {
    de: rep.brut, vers: rep.valeur, regle: rep.regle, motif: String(rep.motif ?? "").slice(0, 300),
    branche: rep.branche ?? null, champ: rep.champ, le: maintenantIso,
  };
  return out;
}

/**
 * (07/11, famille 2 a — a3002ab6 1fbef555, jean Kaporal « 33 ») La question « Taille (Depop) » repart seule comme celle
 * de Vinted (handler-watch la prend désormais) — SAUF là où seule la personne sait : le BLOC DES TOURS DE TAILLE de
 * Depop (grilles 62 et 24, chrome-extension/content-scripts/depop.js, depopTailleZoneW). Une réponse écrite par le
 * serveur est marquée needsUserResolved, et l'extension ne rejuge jamais le W d'une réponse : elle ne doit donc jamais
 * remplacer ce doute.
 *   · la question posée PAR ce bloc (« … sont des TOURS DE TAILLE … ») : jamais tranchée ici ;
 *   · une PUBLICATION, réponse = un nombre nu de la zone des W (23 à 56) : jamais tranchée ici (un « 38 » de fiche peut
 *     être un FR 38 = W29/W30) — l'extension, elle, pose la bonne question ;
 *   · une REPUBLICATION remet l'annonce telle qu'elle est (l'extension n'y pose jamais la question des W) : tranchée.
 * @returns {boolean} true : la réponse peut être écrite.
 */
export function reponseTailleDepopSure(job, rep) {
  if (!rep) return false;
  if (/TOURS DE TAILLE/i.test(String(job?.error ?? ""))) return false;
  const v = String(rep.valeur ?? "").trim();
  if (String(job?.action ?? "publish") !== "republish" && /^\d{2}$/.test(v) && Number(v) >= 23 && Number(v) <= 56) return false;
  return true;
}
