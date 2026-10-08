// ═══════════════════════════════════════════════════════════════════════════
// DEPOP ↔ TAXONOMIE INTERNE — ÉTAT, COULEURS, MATIÈRES, TAILLES ENFANT, MARQUE
// (2026-10-08, préparation INERTE — compagnon de depopCategories.js)
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ AUCUN FICHIER DE L'APP, DU SERVEUR NI DE L'EXTENSION N'IMPORTE CE MODULE
//    (cf. l'en-tête de depopCategories.js ; selftest:depop-mapping le garde).
//
// PAS UNE DEUXIÈME MÉCANIQUE : chaque table a EXACTEMENT la forme de la
// colonne qu'elle deviendra dans la table partagée, le jour du branchement
// (docs/plateformes/depop/RATTACHEMENT.md) :
//   DEPOP_ETAT_PAR_PALIER   → la colonne `depop` d'ETAT_PAR_PLATEFORME
//                             (_shared/etat-plateformes.js), mêmes paliers ;
//   DEPOP_TAILLE_ENFANT     → la colonne `depop` de CHILD_MONTH_SIZES /
//                             CHILD_YEAR_SIZES (childSizes.js), mêmes valeurs
//                             canoniques ;
//   DEPOP_COULEUR_PAR_LIBELLE → même rôle que la palette Vinted : la
//                             pré-normalisation de l'APP (la couleur part avant
//                             qu'aucune page Depop n'existe) ;
//   marque                  → estSansMarque (_shared/marque-absente.js), la
//                             SEULE liste des absences de marque.
// Tous les identifiants viennent du relevé du 08/10
// (docs/plateformes/depop/attributs.json, tailles.json) ; le selftest refuse
// un identifiant qui n'y est pas.
// ═══════════════════════════════════════════════════════════════════════════

import { PALIERS_ETAT, tierEtat } from "../../supabase/functions/_shared/etat-plateformes.js";
import { estSansMarque } from "../../supabase/functions/_shared/marque-absente.js";
import { texteComparable } from "./texteComparable.js";

// ── ÉTAT ────────────────────────────────────────────────────────────────────
// Les descriptions sont celles que Depop affiche (relevé, description_fr) :
//   brand_new       « Non utilisé avec l'emballage ou les étiquettes d'origine »
//   used_like_new   « État neuf ou d'occasion sans étiquette »
//   used_excellent  « Légèrement utilisé mais sans défaut notable »
//   used_good       « Défauts mineurs ou signes d'usure… »
//   used_fair       « Défauts évidents ou signes d'usure… »
// Cinq paliers chez nous, cinq chez Depop, un pour un : aucune correspondance
// n'est « au-dessus » du réel. « Neuf sans étiquette » est EXACTEMENT ce que
// Depop décrit sous used_like_new (« neuf … sans étiquette »).
export const DEPOP_ETAT_PAR_PALIER = Object.freeze({
  neuf_etiquette: "brand_new",
  neuf_sans: "used_like_new",
  tres_bon: "used_excellent",
  bon: "used_good",
  satisfaisant: "used_fair",
});

// Le sens retour (relevé d'une annonce Depop) : used_like_new couvre « neuf
// sans étiquette » ET « occasion comme neuve » — on prend le palier le plus
// BAS des deux (très bon), jamais le plus haut : un état ne s'améliore pas.
export const DEPOP_PALIER_PAR_ETAT = Object.freeze({
  brand_new: "neuf_etiquette",
  used_like_new: "tres_bon",
  used_excellent: "tres_bon",
  used_good: "bon",
  used_fair: "satisfaisant",
});

// Types où Depop n'accepte QUE brand_new (INVALID_USED_CONDITION_PRODUCT_TYPES).
export const DEPOP_TYPES_NEUF_SEULEMENT = Object.freeze([
  "bath-and-body", "fragrance", "hair-products", "makeup", "nails", "skincare",
]);

/**
 * L'état Depop d'une fiche.
 * @returns {{id:string, palier:string}|{refus:string, palier:string|null}}
 *   refus = la question se pose (jamais un état embelli).
 */
export function depopEtat(valeur, typeProduit = null) {
  const palier = tierEtat(valeur);
  if (!palier) return { refus: "etat_inconnu", palier: null };
  const id = DEPOP_ETAT_PAR_PALIER[palier];
  if (DEPOP_TYPES_NEUF_SEULEMENT.includes(typeProduit) && id !== "brand_new") {
    // Un produit de beauté entamé, ou neuf sans son emballage : Depop ne
    // propose que « Nouveau ». Le monter à « Nouveau » serait l'embellir.
    return { refus: "etat_neuf_seulement", palier };
  }
  return { id, palier };
}

// ── COULEURS ────────────────────────────────────────────────────────────────
// Clé = libellé de la palette Vinted (VINTED_COLORS, le vocabulaire que
// platform_fields.couleur transporte), valeur = id Depop (19 couleurs, au plus
// 2 par annonce). Une nuance claire ou foncée rejoint sa couleur (Bleu clair →
// blue, Vert foncé → green, Moutarde → yellow) ; une teinte À CHEVAL sur deux
// couleurs Depop n'en reçoit aucune : la couleur est facultative chez Depop,
// on n'envoie rien plutôt qu'une voisine choisie par nous.
export const DEPOP_COULEUR_PAR_LIBELLE = Object.freeze({
  "Noir": "black",
  "Gris": "grey",
  "Blanc": "white",
  "Crème": "cream",
  "Beige": "tan",
  "Abricot": "orange",
  "Orange": "orange",
  "Corail": null,        // orange ou rose : à cheval
  "Rouge": "red",
  "Bordeaux": "burgundy",
  "Fuchsia": "pink",
  "Rose": "pink",
  "Violet": "purple",
  "Lila": "purple",
  "Bleu clair": "blue",
  "Bleu": "blue",
  "Marine": "navy",
  "Turquoise": null,     // bleu ou vert : à cheval
  "Menthe": "green",
  "Vert": "green",
  "Vert foncé": "green",
  "Kaki": "khaki",
  "Marron": "brown",
  "Moutarde": "yellow",
  "Jaune": "yellow",
  "Argenté": "silver",
  "Doré": "gold",
  "Multicolore": "multi",
  "Transparence": null,  // aucune couleur Depop ne le dit
});

/** Les couleurs Depop d'une fiche (« Rouge et Blanc », « Rouge, Blanc »…), 2 au plus, sans doublon. */
export function depopCouleurs(valeur) {
  const parComparable = new Map(Object.entries(DEPOP_COULEUR_PAR_LIBELLE).map(([k, v]) => [texteComparable(k), v]));
  const ids = [];
  const ecartees = [];
  for (const morceau of String(valeur ?? "").split(/\s+et\s+|[,/&+]/i).map((s) => s.trim()).filter(Boolean)) {
    const id = parComparable.get(texteComparable(morceau));
    if (id && !ids.includes(id)) ids.push(id);
    else if (!id) ecartees.push(morceau);
  }
  return { ids: ids.slice(0, 2), ecartees, tronquees: ids.slice(2) };
}

// ── MATIÈRES ────────────────────────────────────────────────────────────────
// 33 matières actives chez Depop (attributs.json, attributs_par_type
// `material`, 4 au plus, facultatives). La matière d'une fiche est du texte
// libre : on la rapproche du libellé FRANÇAIS ou ANGLAIS servi par Depop
// (texteComparable), puis de quelques mots français que Depop n'écrit pas.
// L'inconnu est ÉCARTÉ (jamais envoyé tel quel) — même contrat qu'Opla.
export const DEPOP_MATIERES = Object.freeze({
  acrylic: ["Acrylique", "Acrylic"],
  canvas: ["Toile", "Canvas"],
  cashmere: ["Cachemire", "Cashmere"],
  corduroy: ["Velours côtelé", "Corduroy"],
  cotton: ["Coton", "Cotton"],
  "cotton-organic": ["Coton - Biologique", "Organic cotton", "Coton bio", "Coton biologique"],
  "cotton-recycled": ["Coton - Recyclé", "Recycled cotton", "Coton recyclé"],
  crochet: ["Crochet"],
  denim: ["Denim", "Jean"],
  "elastane-lycra-spandex": ["Elastane/ Lycra/ Spandex", "Élasthanne", "Elasthanne", "Lycra", "Spandex"],
  "sequins-gems": ["Embellies", "Sequins & gems", "Sequins", "Paillettes", "Strass"],
  "faux-fur": ["Fausse fourrure", "Faux fur"],
  "faux-leather": ["Faux cuir", "Faux leather", "Simili cuir", "Similicuir", "Cuir synthétique"],
  fleece: ["Polaire", "Fleece"],
  hemp: ["Chanvre", "Hemp"],
  jersey: ["Jersey"],
  knitted: ["Tricot", "Knitted", "Maille"],
  lace: ["Dentelle", "Lace"],
  leather: ["Cuir", "Leather"],
  linen: ["Lin", "Linen"],
  lyocell: ["Lyocell", "Tencel"],
  modal: ["Modal"],
  nylon: ["Nylon"],
  polyester: ["Polyester"],
  "polyester-recycled": ["Polyester - Recyclé", "Recycled polyester", "Polyester recyclé"],
  rayon: ["Rayon", "Rayonne"],
  rubber: ["Caoutchouc", "Rubber"],
  silk: ["Soie", "Silk"],
  // ⚠️ Libellé français servi par Depop : « Suède » (le pays) pour « suede ».
  // Le mot français est « daim » ; « Suède » reste reconnu, c'est celui
  // qu'affiche Depop.
  suede: ["Suède", "Suede", "Daim"],
  tweed: ["Tweed"],
  velvet: ["Velours", "Velvet"],
  viscose: ["Viscose"],
  wool: ["Laine", "Wool"],
});

/** Les matières Depop d'une fiche, 4 au plus ; l'inconnu est écarté et nommé. */
export function depopMatieres(valeur) {
  const index = new Map();
  for (const [id, mots] of Object.entries(DEPOP_MATIERES)) for (const m of mots) index.set(texteComparable(m), id);
  const ids = [];
  const ecartees = [];
  for (const morceau of String(valeur ?? "").split(/\s+et\s+|[,/&+]|\s+\d{1,3}\s*%|\d{1,3}\s*%\s*/i).map((s) => s.trim()).filter(Boolean)) {
    const id = index.get(texteComparable(morceau));
    if (id && !ids.includes(id)) ids.push(id);
    else if (!id) ecartees.push(morceau);
  }
  return { ids: ids.slice(0, 4), ecartees };
}

// ── TAILLES ENFANT (région IT = système EUR, compte français) ───────────────
// Clé = la valeur CANONIQUE de childSizes.js (CHILD_MONTH_SIZES /
// CHILD_YEAR_SIZES) ; valeur = { grille, id, libelle } de la grille 101
// (kids-apparel-sizes, EUR). Même convention que la colonne Vinted : « N mois »
// = « jusqu'à N mois », donc « 6 mois » ↦ « 3-6 months ».
//   « 1 mois » et « Naissance » ↦ « 0-3 months » : la tranche les CONTIENT
//   (même règle de contenance que Beebs pour 11, 13 et 15 ans).
//   null = aucun équivalent exact, la canonique reste et la question se pose :
//   « Prématuré » (Depop commence à 0-3 mois), « 36 mois » (ni 24-36 mois ni
//   centimètres chez Depop : « 2 years » ou « 3 years » serait une conversion),
//   « 18 ans » (Depop s'arrête à 16 ans).
const K = (id, libelle) => ({ grille: 101, id, libelle });
export const DEPOP_TAILLE_ENFANT = Object.freeze({
  "Prématuré": null,
  "Naissance": K(2, "0-3 months"),
  "1 mois": K(2, "0-3 months"),
  "3 mois": K(2, "0-3 months"),
  "6 mois": K(3, "3-6 months"),
  "9 mois": K(4, "6-9 months"),
  "12 mois": K(5, "9-12 months"),
  "18 mois": K(6, "12-18 months"),
  "24 mois": K(7, "18-24 months"),
  "36 mois": null,
  "2 ans": K(8, "2 years"),
  "3 ans": K(9, "3 years"),
  "4 ans": K(10, "4 years"),
  "5 ans": K(11, "5 years"),
  "6 ans": K(12, "6 years"),
  "7 ans": K(13, "7 years"),
  "8 ans": K(14, "8 years"),
  "9 ans": K(15, "9 years"),
  "10 ans": K(16, "10 years"),
  "11 ans": K(17, "11 years"),
  "12 ans": K(18, "12 years"),
  "13 ans": K(19, "13 years"),
  "14 ans": K(20, "14 years"),
  "15 ans": K(22, "15 years"),
  "16 ans": K(23, "16 years"),
  "18 ans": null,
});

// Pointures enfant (grille 104, EUR) : 16 → 32 nues, puis « 33 (adult) » →
// « 40 (adult) ». Ni 15, ni 41, ni demi-pointure : null, la question se pose.
const POINTURES_ENFANT = Object.freeze({
  16: 1, 17: 2, 18: 3, 19: 4, 20: 5, 21: 6, 22: 7, 23: 8, 24: 9, 25: 10, 26: 11,
  27: 12, 28: 13, 29: 14, 30: 15, 31: 16, 32: 17, 33: 18, 34: 20, 35: 21, 36: 22,
  37: 23, 38: 24, 39: 25, 40: 26,
});
export function depopPointureEnfant(valeur) {
  const m = /^eu\s*(\d{2})(?:[.,](5))?$/i.exec(String(valeur ?? "").trim());
  if (!m || m[2]) return null;
  const n = Number(m[1]);
  const id = POINTURES_ENFANT[n];
  if (!id) return null;
  return { grille: 104, id, libelle: n >= 33 ? `${n} (adult)` : String(n) };
}

// ── MARQUE ──────────────────────────────────────────────────────────────────
// Obligatoire chez Depop. L'absence de marque (estSansMarque, la seule liste)
// part en `unbranded` — l'option « Other » du formulaire. Une vraie marque se
// cherche dans la liste Depop au moment du dépôt (21 752 marques relevées) ;
// introuvable → question, jamais `unbranded` à sa place.
export const DEPOP_SANS_MARQUE = "unbranded";
export function depopMarqueAbsente(valeur) {
  return !String(valeur ?? "").trim() || estSansMarque(valeur);
}

export const _internes = { PALIERS_ETAT, POINTURES_ENFANT };
