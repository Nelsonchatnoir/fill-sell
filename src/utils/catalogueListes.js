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
import { estListeEtatsVinted, idEtatVinted, LIBELLES_ETATS_VINTED } from "./etatsVinted.js";

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

// ═══════════════════════════════════════════════════════════════════════════
// UN CATALOGUE VINTED ÉCRIT DANS UNE AUTRE LANGUE SE LIT EN FRANÇAIS (24/10, lot « zéro blocage », A7)
// ═══════════════════════════════════════════════════════════════════════════
// platform_category_aspects n'a pas de colonne pays : le 24/10, la page italienne
// d'une vendeuse (compte italien sur vinted.fr) a réécrit pour TOUS les comptes
// l'état des T-shirts femme, des BD et des jeux en « Condizioni » (« Nuovo con
// cartellino · Ottime · Buone… »). L'écran comparait alors l'état français de la
// fiche à la liste italienne : champ « Condizioni » demandé, bloquant (35 fois).
// LA RÈGLE : un état Vinted se reconnaît par son IDENTIFIANT (status_id, le même
// dans toutes les langues, utils/etatsVinted.js) ; une liste faite uniquement
// d'états d'une autre langue se lit en français, champ « État » compris. Tout le
// reste passe intact (une liste française ne change pas d'un caractère).

/**
 * @param {string} platform
 * @param {Array<{field_key: string, field_label?: string|null, allowed_values?: unknown}>} rows
 * @returns {Array} les mêmes lignes ; une liste d'états étrangère traduite en français (par identifiant)
 */
export function etatsVintedEnFrancais(platform, rows) {
  const lignes = Array.isArray(rows) ? rows : [];
  if (platform !== "vinted") return lignes;
  return lignes.map((r) => {
    if (!Array.isArray(r?.allowed_values) || !r.allowed_values.length || !estListeEtatsVinted(r.allowed_values)) return r;
    const fr = r.allowed_values.map((v) => LIBELLES_ETATS_VINTED.fr[idEtatVinted(v)] ?? String(v));
    if (fr.every((v, i) => v === String(r.allowed_values[i]))) return r;
    return { ...r, field_label: "État", allowed_values: fr, traduit_de_la_page: true };
  });
}
