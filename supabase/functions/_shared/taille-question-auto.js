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
// Pur (Deno + Node), un seul import relatif.
import { tailleDeService, brancheDeTaille } from "./taille-de-service.js";

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
 */
export function reponseTailleAuto(job, tailleFiche = null) {
  if (!job || job.status !== "needs_user") return null;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (pf.taille_convertie_serveur) return null; // une fois
  const f = pf.needsUserField;
  if (!estQuestionTaille(f)) return null;
  const ebay = pf.ebayAspects && typeof pf.ebayAspects === "object" ? pf.ebayAspects : {};
  const vintedA = pf.vintedAspects && typeof pf.vintedAspects === "object" ? pf.vintedAspects : {};
  const brut = [pf.taille, ebay.Taille, ebay.Pointure, vintedA.size, tailleFiche]
    .map((v) => String(v ?? "").trim()).find(Boolean) ?? "";
  if (!brut) return null;
  const branche = brancheDeTaille(
    pf.categoryPath ?? [], pf.oplaCategoryPath ?? [], pf.beebsCategoryPath ?? [], pf.lbcCategoryPath ?? [],
    pf.ebayCategoryPath ?? [], String(ebay["Département"] ?? ""), String(pf.genre ?? ""),
  );
  const r = tailleDeService(brut, f.allowed_values, { branche });
  if (!r) return null;
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
