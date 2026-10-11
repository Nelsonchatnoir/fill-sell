// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN : RIEN NE SE RETIRE SANS SES REQUIS PROUVÉS (11/10/2026, voirememe)
// ═══════════════════════════════════════════════════════════════════════════
// Republication auto de la peluche Squishmallow (job 66bbae2b) : annonce
// RETIRÉE à 12:03, recréation bloquée sur « Produit » (toy_type, Jeux &
// Jouets), absent de l'annonce d'origine — article hors ligne. Leboncoin
// avait déjà refusé ce champ sur ce rayon (platform_category_aspects,
// required + source 'server_400', depuis le 19/09).
// Règle (Nico) : le contrôle d'avant retrait vérifie que TOUS les champs
// exigés à la recréation sont disponibles ; sinon pause AVANT tout retrait,
// annonce intacte. Pas d'IA à la republication : rien n'est deviné.
// Ce module : le filet SERVEUR (get-pending-jobs) pour un poste qui ne sait
// pas dérouler le vrai formulaire avant le retrait (capacité
// « prevol_recreation_v1 » absente). Seuls les requis PROUVÉS par un refus
// de Leboncoin (server_400) comptent — jamais 'dom' : Leboncoin pré-remplit
// d'après titre et photos (8 republications sur 9 sans « Produit » passées).
// ES module sans import (Deno + node). Pur : scripts/republication-requis-avant-retrait-selftest.mjs.
// ═══════════════════════════════════════════════════════════════════════════

export const TOURS_QUESTION_MAX = 3;

/** « Loisirs > Jeux & Jouets » depuis platform_fields.lbcCategoryPath, ou "". */
export function cleCategorieLbc(pf) {
  return pf && Array.isArray(pf.lbcCategoryPath)
    ? pf.lbcCategoryPath.map((c) => String(c ?? "").trim()).filter(Boolean).join(" > ") : "";
}

const texte = (v) => String(v ?? "").trim().length > 0;

/**
 * Un requis est-il disponible pour la recréation ? Les critères repris de
 * l'annonce (lbcAspects, clé Leboncoin) ou le miroir lbcProduit du critère
 * « Produit » (leboncoin.js).
 * @param {Record<string, any>} pf
 * @param {{ key: string, label: string }} r
 */
export function requisDisponibleLbc(pf, r) {
  const asp = pf && pf.lbcAspects && typeof pf.lbcAspects === "object" ? pf.lbcAspects : {};
  if (texte(asp[r.key])) return true;
  return r.label === "Produit" && texte(pf?.lbcProduit);
}

/**
 * Les requis prouvés de la catégorie, regroupés (un champ une fois).
 * @param {Array<{ category_key?: unknown, field_key?: unknown, field_label?: unknown, allowed_values?: unknown }>} lignes
 * @returns {Map<string, Array<{ key: string, label: string, valeurs: string[] }>>}
 */
export function requisParCategorie(lignes) {
  const parCle = new Map();
  for (const r of lignes ?? []) {
    const key = String(r?.field_key ?? "").trim();
    if (!key) continue;
    const cle = String(r?.category_key ?? "");
    const liste = parCle.get(cle) ?? [];
    if (!liste.some((x) => x.key === key)) {
      liste.push({
        key, label: String(r?.field_label ?? key).trim() || key,
        valeurs: Array.isArray(r?.allowed_values) ? r.allowed_values.map((v) => String(v ?? "").trim()).filter(Boolean) : [],
      });
    }
    parCle.set(cle, liste);
  }
  return parCle;
}

/**
 * Faut-il retenir cette republication AVANT le retrait ?
 * @param {{ platform?: string, action?: string, platform_fields?: Record<string, any> }} job
 * @param {Map<string, Array<{ key: string, label: string, valeurs: string[] }>>} parCle
 * @returns {null | { manquants: Array<{ key: string, label: string, valeurs: string[] }>, categorie: string }}
 */
export function requisManquantsAvantRetrait(job, parCle) {
  const pf = job?.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (job?.platform !== "leboncoin" || job?.action !== "republish") return null;
  // Seule l'étape qui tient ENCORE l'annonce en ligne peut être retenue :
  // 'deleted' ne bloque jamais (l'annonce n'existe déjà plus).
  if (String(pf.republish_step ?? "") !== "captured" || pf.deleted_at) return null;
  const categorie = cleCategorieLbc(pf);
  if (!categorie) return null;
  const manquants = (parCle.get(categorie) ?? []).filter((r) => !requisDisponibleLbc(pf, r));
  return manquants.length ? { manquants, categorie } : null;
}

/**
 * La question posée AVANT le retrait (annonce intacte), ou, au-delà de
 * TOURS_QUESTION_MAX tours, le message qui ne redemande plus.
 */
export function questionAvantRetraitLbc(manquants, toursAvant = 0) {
  const tours = Number(toursAvant || 0) + 1;
  const redemande = tours <= TOURS_QUESTION_MAX;
  const libelles = manquants.map((m) => m.label).join(" », « ");
  const premier = manquants[0];
  const message = redemande
    ? `Republication en pause AVANT tout retrait : ton annonce Leboncoin est TOUJOURS EN LIGNE. ` +
      `Pour la recréer, Leboncoin exige « ${libelles} » sur ce rayon et ton annonce ne le porte pas. ` +
      `Choisis-le et la republication repartira toute seule — tant que ce n'est pas fait, rien n'est touché.`
    : `Ton annonce Leboncoin est TOUJOURS EN LIGNE et elle y reste. On ne sait pas la recréer sans ` +
      `« ${libelles} », que Leboncoin exige sur ce rayon — on ne te le redemande plus. Rien n'a été retiré.`;
  const champ = redemande && premier ? {
    field_key: premier.key, field_label: premier.label,
    input_type: premier.valeurs.length ? "dropdown" : "text", platform: "leboncoin",
    target: { root: "lbcAspects", key: premier.key },
    ...(premier.valeurs.length ? { allowed_values: premier.valeurs } : {}),
  } : null;
  return { tours, redemande, message, champ };
}
