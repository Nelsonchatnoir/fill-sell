// ═══════════════════════════════════════════════════════════════════════════
// BROUILLONS — la sortie, et ce qui manque à une fiche (2026-09-15)
//
// Depuis que le scan crée l'article AU DÉBIT, le Stock se remplit d'articles
// sur lesquels l'utilisateur n'a encore rien fait. Trois états, un seul critère
// de passage — un GESTE de l'utilisateur :
//
//   BROUILLON  fiches_annonce.brouillon = true ET aucun job
//   EN STOCK   il a cliqué « Ajouter au stock » (brouillon → false)
//   EN LIGNE   au moins un job est parti
//
// ⚠️ UN BROUILLON N'EST PAS UN ÉCHEC : rien n'a été tenté. L'app a déjà un état
//    pour l'annonce ratée (job 'failed'), il ne se confond jamais avec celui-ci.
// ⚠️ UN BROUILLON N'EST PAS UN ARTICLE IMPORTÉ : les lignes origine='vinted_sync'
//    n'ont pas de fiche et sont EN LIGNE sur Vinted.
//
// UN SEUL CHEMIN DE CODE, DEUX POINTS D'ENTRÉE : le bouton « Ajouter au stock »
// de la carte, et la publication. Les deux appellent sortirDuBrouillon.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Le geste qui fait sortir un article des brouillons.
 *
 * Idempotent, best-effort : un échec ne casse jamais le geste qui l'appelait
 * (une publication réussie reste réussie même si la fiche n'a pas pu être
 * marquée — le filet « aucun job » la sortirait de toute façon de la liste).
 * On n'écrit QUE la colonne brouillon : la fiche elle-même n'est pas touchée.
 */
export async function sortirDuBrouillon(supabase, { userId, inventaireId }) {
  if (!supabase || !userId || inventaireId == null) return false;
  try {
    const { error } = await supabase
      .from("fiches_annonce")
      .update({ brouillon: false })
      .eq("inventaire_id", inventaireId)
      .eq("user_id", userId);
    if (error) {
      console.warn("[brouillon] sortie non enregistrée :", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[brouillon] sortie non enregistrée :", e?.message ?? e);
    return false;
  }
}

/** Libellés des champs partagés — mêmes mots que l'encart du stepper. */
const LIBELLES = {
  fr: { taille: "Taille", couleur: "Couleur", matiere: "Matière", marque: "Marque" },
  en: { taille: "Size", couleur: "Color", matiere: "Material", marque: "Brand" },
};

/**
 * CE QUI EMPÊCHE CETTE FICHE DE PARTIR, en clair, pour la carte de brouillon.
 *
 * Doctrine du 2026-09-02 tenue à la lettre : EN CAS DE DOUTE, ON NE DEMANDE
 * RIEN. On ne réintroduit aucun repli statique (« un vêtement a forcément une
 * taille ») — ce repli-là a été tué le 02/09 après le cas Delavier, où la même
 * fiche réclamait la marque une fois sur deux selon l'issue d'une course au
 * chargement des référentiels.
 *
 * Trois sources, et trois seulement :
 *   1. ce que le STEPPER a calculé et rangé dans la fiche (champs partagés
 *      manquants) — il est la seule autorité, parce que lui seul a les
 *      référentiels par plateforme ;
 *   2. les gardes DURES, vraies sans aucun référentiel : prix de vente < 1 €
 *      (seuil Vinted, le plus strict des quatre) et description Vinted vide
 *      (Vinted refuse la création, garde du 12/09) ;
 *   3. le prix d'achat, que la publication exige sur un article né du Lens.
 *
 * Une fiche jamais ouverte dans le stepper ne dira donc que 2 et 3 — c'est
 * exact : on ne sait pas encore ce que les plateformes exigeront, et prétendre
 * le savoir serait mentir.
 */
export function manquesDeLaFiche(fiche, lang = "fr") {
  const L = LIBELLES[lang === "en" ? "en" : "fr"];
  const manques = [];
  if (!fiche || typeof fiche !== "object") return manques;

  // 1. Ce que le stepper a établi, avec ses référentiels.
  for (const f of Array.isArray(fiche.champsPartagesManquants) ? fiche.champsPartagesManquants : []) {
    const label = L[f?.key] ?? f?.key;
    if (!label) continue;
    const ou = Array.isArray(f.platforms) && f.platforms.length ? ` (${f.platforms.join(", ")})` : "";
    manques.push(label + ou);
  }

  // 2. Gardes dures, lisibles de la fiche seule.
  const prix = Number(fiche.price);
  if (!(Number.isFinite(prix) && prix >= 1)) {
    manques.push(lang === "en" ? "Selling price" : "Prix de vente");
  }
  if (fiche.descriptionVideVinted === true) {
    manques.push(lang === "en" ? "Vinted description" : "Description Vinted");
  }

  // 3. Le prix d'achat, exigé à la publication d'un article né du Lens.
  if (fiche.prixAchatManquant === true) {
    manques.push(lang === "en" ? "Purchase price" : "Prix d'achat");
  }

  return manques;
}
