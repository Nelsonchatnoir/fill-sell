// ═══════════════════════════════════════════════════════════════════════════
// LA VALEUR PROBABLE — PLUS AUCUN CHAMP VIDE QUI FAIT ABANDONNER (14/11/2026, lot « zéro friction », A2-A3 — Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Règle de Nico : « jamais de valeur inventée au hasard. Si la valeur est certaine → posée sans rien demander. Si elle
// est seulement probable → pré-remplie avec la meilleure valeur et un choix en 1 tap, jamais un champ vide qui bloque.
// Le dernier écran doit toujours laisser partir ce qui est prêt. »
// Mesuré sur 7 jours au 13/11 (usage_logs champ_requis_bloquant) : 44 sorties au dernier écran, dont 26 juste après
// l'affichage d'un champ obligatoire ; « Âge » Beebs 99 abandons, Leboncoin « Produit » (image/son, collection,
// instruments) 15, Vinted « Classification » 6.
//
// Ce module ne vient qu'APRÈS tout ce qui est certain (fiche, texte, option nommée, mémoire, correspondances apprises,
// règles champs-requis-auto) : il rend, pour une ligne ENCORE vide d'une liste fermée, la meilleure valeur et son
// degré — `certaine` (une option neutre qui est vraie : « Non précisé »), `probable` (un « Autre » quand le texte ne
// nomme aucune option, un âge déduit) — ou null : la question reste, et elle ne retient que SA plateforme.
// ⛔ Jamais une taille, une pointure, une marque, un modèle, un état, un colis, un identifiant (champDeductibleDuTexte),
//    ni un PUBLIC (genre, univers : une liste faite de « Femme / Homme / Enfant… ») : ceux-là ne se devinent pas.
// Pur (Node + navigateur) : scripts/valeurs-probables-selftest.mjs.
import { ageBeebsProbable } from "../../../supabase/functions/_shared/champs-requis-auto.js";
import { estFourreTout, champDeductibleDuTexte } from "../../../supabase/functions/_shared/option-du-texte.js";

const plier = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

// Les options NEUTRES qui sont VRAIES quand personne n'a rien dit : « Non précisé » (Vinted, classification d'un jeu),
// « Inconnu », « Non spécifié »… — jamais « Autre » (imprécis, donc seulement probable).
const RE_NEUTRE_VRAI = /^(non precise|non precisee|non specifie|non specifiee|non renseigne|non renseignee|non communique|inconnu|inconnue|non applicable|ne s'applique pas|sans objet)$/;
// Les mots d'un PUBLIC : une liste qui n'est faite que d'eux est un genre / univers — jamais pré-rempli ici.
const RE_PUBLIC = /^(femmes?|hommes?|enfants?|mixtes?|unisexes?|unisex|filles?|garcons?|bebes?|adultes?|adolescents?|maternite|junior|ados?)( .*)?$/;
const listeDePublics = (vals) => vals.length >= 2 && vals.filter((v) => RE_PUBLIC.test(plier(v)) || estFourreTout(v)).length === vals.length;

/**
 * @param {{platform:string, key:string, label?:string, allowedValues:string[], chemin?:string[]|string|null, textes?:string[]}} p
 * @returns {{valeur:string, source:string, motif:string, certitude:"certaine"|"probable"} | null}
 */
export function valeurProbable({ platform, key, label = "", allowedValues, chemin = null, textes = [] } = {}) {
  const vals = [...new Set((Array.isArray(allowedValues) ? allowedValues : []).map((v) => String(v ?? "").trim()).filter(Boolean))];
  if (!vals.length) return null;
  const lib = String(label || key || "").trim();
  // L'ÂGE BEEBS : sa règle (champs-requis-auto.js, ageBeebsProbable).
  if (platform === "beebs" && /^[aâ]ge$/i.test(lib)) {
    const r = ageBeebsProbable({ chemin, textes, allowedValues: vals });
    return r ? { valeur: r.valeur, source: r.source, motif: r.motif, certitude: "probable" } : null;
  }
  if (!champDeductibleDuTexte(key, label)) return null;
  if (/(^|_)(univers|universe|genre|gender|department|departement|sexe)$/i.test(String(key ?? "")) || /\b(genre|univers|département|public)\b/i.test(lib)) return null;
  // La MACHINE d'un jeu (Beebs « Console », Vinted video_game_platform, eBay « Plateforme ») a sa règle (12/11, 1e :
  // absente de la liste et non rétro → la question) : jamais un « Autre » à sa place.
  if (/^(console|plateforme|video_game_platform|platform)$/i.test(String(key ?? "").trim()) || /^(console|plateforme)$/i.test(lib)) return null;
  if (listeDePublics(vals)) return null;
  // 1. Une option neutre et VRAIE (« Non précisé ») : rien n'est affirmé.
  const neutre = vals.find((v) => RE_NEUTRE_VRAI.test(plier(v)));
  if (neutre) return { valeur: neutre, source: "neutre_de_la_liste", motif: `personne ne l'a dit : « ${neutre} », la valeur neutre de la liste`, certitude: "certaine" };
  // 2. La liste n'offre qu'UNE option (eBay suggère « Boucle de ceinture » pour les boucles de ceinture) : c'est elle.
  if (vals.length === 1 && !estFourreTout(vals[0])) return { valeur: vals[0], source: "seule_option", motif: `la seule valeur proposée pour ce rayon (« ${vals[0]} »)`, certitude: "probable" };
  // 3. « Autre » / « Autres » : le texte ne nomme aucune option de la liste — imprécis, jamais faux.
  const autres = vals.filter((v) => estFourreTout(v));
  if (autres.length === 1 && vals.length > 1) return { valeur: autres[0], source: "autre_de_la_liste", motif: `aucune option de la liste n'est nommée par l'annonce : « ${autres[0]} »`, certitude: "probable" };
  return null;
}

/** Le texte court montré sous une valeur posée par cette règle (FR / EN), pour la carte « change-la si besoin ». */
export function phraseValeurProbable({ valeur, motif, certitude }, en = false) {
  if (en) return certitude === "certaine"
    ? `Filled by FillSell: “${valeur}” (nobody said otherwise). Change it if needed.`
    : `FillSell picked “${valeur}” — ${motif}. Change it in one tap if it's not right.`;
  return certitude === "certaine"
    ? `Rempli par FillSell : « ${valeur} » (${motif}). Change-la si besoin.`
    : `FillSell a choisi « ${valeur} » — ${motif}. Change-la d'un geste si ce n'est pas ça.`;
}
