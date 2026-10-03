// ═══════════════════════════════════════════════════════════════════════════
// UNE LISTE COPIÉE D'UN AUTRE CHAMP N'EST PAS UNE LISTE (03/10, point 9)
// ═══════════════════════════════════════════════════════════════════════════
// Peinture de Nico rangée en « Maison & Jardin > Bricolage » sur Leboncoin :
// la question « Poids » proposait… les choix de « Type ». Le catalogue
// (platform_category_aspects) avait appris pour diy_weight (Poids) la liste
// de diy_type, et pour furniture_weight / furniture_quantity (Ameublement) la
// liste de furniture_category : le relevé de l'extension ramassait les
// options du menu ouvert à côté (corrigé dans leboncoin.js, 0.6.90). Données
// réparées le 03/10 ; cette garde empêche qu'une contamination future ne
// redevienne une question fausse.
// LA RÈGLE : dans un même rayon, si un champ qui ne dit PAS ce qu'est l'objet
// (poids, quantité…) porte EXACTEMENT la liste d'un champ d'identité (Type,
// Produit, Univers, Catégorie), cette liste est un emprunt : on ne la propose
// pas (le champ redevient « sans liste connue » — jamais une question remplie
// des choix d'un autre champ). Deux champs non-identité à liste égale (État :
// condition / clothing_condition) ne sont pas touchés.
import { champDIdentite } from "../../supabase/functions/_shared/option-du-texte.js";

/**
 * @param {Array<{field_key: string, field_label?: string|null, allowed_values?: unknown}>} rows  lignes du catalogue d'UN rayon d'une plateforme
 * @returns {Array} les mêmes lignes, l'emprunt retiré (allowed_values: null, liste_empruntee: true)
 */
export function sansListesEmpruntees(rows) {
  const lignes = Array.isArray(rows) ? rows : [];
  const cle = (v) => JSON.stringify(Array.isArray(v) ? v.map((x) => String(x ?? "").trim()) : []);
  const parListe = new Map();
  for (const r of lignes) {
    if (!Array.isArray(r?.allowed_values) || !r.allowed_values.length) continue;
    const k = cle(r.allowed_values);
    if (!parListe.has(k)) parListe.set(k, []);
    parListe.get(k).push(r);
  }
  return lignes.map((r) => {
    if (!Array.isArray(r?.allowed_values) || !r.allowed_values.length) return r;
    const freres = parListe.get(cle(r.allowed_values)) ?? [];
    if (freres.length < 2) return r;
    if (champDIdentite(r.field_key, r.field_label ?? "")) return r;
    if (!freres.some((f) => f !== r && champDIdentite(f.field_key, f.field_label ?? ""))) return r;
    return { ...r, allowed_values: null, liste_empruntee: true };
  });
}
