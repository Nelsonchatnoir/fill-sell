// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN : LA GRILLE « TAILLE » DES VÊTEMENTS DÉPEND DE L'UNIVERS (21/11/2026, lot de Nico, point 1)
// ═══════════════════════════════════════════════════════════════════════════
// Constat (lbc_grilles_relevees, 30 jours au 21/11/2026 12:10, contexte.clothing_type du formulaire) : sous
// « Mode > Vêtements », le menu « Taille » (clothing_st) n'est PAS le même selon l'Univers choisi :
//   · Femme  (1 922 lectures) : « Taille unique », « 30 - XXXS » … « 50 - 5XL » … « 56 - 8XL et plus » ;
//   · Homme  (1 735 lectures) : « Taille unique », XXS … « 8XL et plus » — des lettres seulement ;
//   · Enfant (1 126 lectures) : « 3 ans / 98 cm » … « 18 ans / 182 cm + ».
// Le catalogue des champs (platform_category_aspects) ne garde qu'UNE grille par champ — la plus longue, celle des
// femmes. L'app jugeait donc la taille d'un jean HOMME « 50 » dans la grille FEMME (« 50 - 5XL » : acceptée), et le
// serveur (lbc-taille-homme.js) posait la question APRÈS la publication (18 publications du 19 au 21/11 : « FR 52 »
// répondu « 6XL », « EU 48 » répondu « M »…). Ici : la grille de l'univers, la même pour l'écran, la carte du rayon et
// le serveur. Un univers sans grille relevée (Maternité) garde le catalogue.
// ⛔ Ce sont des COPIES de relevés, datées : le contrôle automatique (controle-listes-plateformes.js, ops-digest) les
// compare chaque jour aux dernières lectures de lbc_grilles_relevees et signale tout écart.
// Pur, sans écriture ; Deno + Node + Vite.

import { GRILLE_LBC_HOMME } from "./lbc-taille-homme.js";

export const CLE_VETEMENTS_LBC = "Mode > Vêtements";
export const CHAMP_TAILLE_VETEMENTS_LBC = "clothing_st";

/** Les grilles « Taille » de « Mode > Vêtements » par univers (lbc_grilles_relevees, relevé du 21/11/2026 12:10). */
export const GRILLES_LBC_TAILLE_VETEMENTS = Object.freeze({
  Femme: Object.freeze(["Taille unique", "30 - XXXS", "32 - XXS", "34 - XS", "36 - S", "38 - M", "40 - L", "42 - XL", "44 - XXL",
    "46 - XXXL", "48 - 4XL", "50 - 5XL", "52 - 6XL", "54 - 7XL", "56 - 8XL et plus"]),
  Homme: GRILLE_LBC_HOMME,
  Enfant: Object.freeze(["3 ans / 98 cm", "4 ans / 104 cm", "5 ans / 110 cm", "6 ans / 116 cm", "7 ans / 122 cm", "8 ans / 128 cm",
    "9 ans / 134 cm", "10 ans / 140 cm", "11 ans / 146 cm", "12 ans / 152 cm", "13 ans / 158 cm", "14 ans / 164 cm",
    "15 ans / 170 cm", "16 ans / 176 cm", "18 ans / 182 cm +"]),
});

const cleDe = (chemin) => (Array.isArray(chemin) ? chemin.map((s) => String(s ?? "").trim()).join(" > ") : String(chemin ?? "").trim());

/** La grille « Taille » du formulaire pour cet univers, ou null (autre rayon, autre champ, univers sans relevé). */
export function grilleTailleLbcDeLUnivers({ chemin, champ = CHAMP_TAILLE_VETEMENTS_LBC, univers }) {
  if (cleDe(chemin) !== CLE_VETEMENTS_LBC || String(champ ?? "") !== CHAMP_TAILLE_VETEMENTS_LBC) return null;
  return GRILLES_LBC_TAILLE_VETEMENTS[String(univers ?? "").trim()] ?? null;
}

/**
 * Les lignes du catalogue d'un rayon Leboncoin, avec la grille « Taille » de l'UNIVERS de la copie (pure) :
 *   · la ligne clothing_st reçoit la grille de l'univers (jamais celle d'un autre univers) ;
 *   · une copie qui PORTE une taille sans ligne clothing_st exigée (le catalogue la tient pour facultative : Leboncoin
 *     ne l'exige pas) reçoit une ligne synthétique, pour que la taille soit jugée AVANT la publication — dans la grille,
 *     elle part écrite comme Leboncoin l'écrit ; hors de la grille, la question se pose à l'écran, jamais après coup.
 *     Une copie SANS taille n'a jamais de ligne : rien n'est demandé de plus qu'avant.
 * @param {{ chemin: string|string[]|null, lignes: Array<Record<string, unknown>>, univers?: unknown, taille?: unknown }} p
 */
export function lignesLbcAvecGrilleDeLUnivers({ chemin, lignes, univers, taille }) {
  const liste = Array.isArray(lignes) ? lignes : [];
  const grille = grilleTailleLbcDeLUnivers({ chemin, univers });
  if (!grille) return liste;
  let vue = false;
  const out = liste.map((l) => {
    if (l?.field_key !== CHAMP_TAILLE_VETEMENTS_LBC) return l;
    vue = true;
    return { ...l, allowed_values: [...grille], grille_univers: String(univers).trim() };
  });
  if (!vue && String(taille ?? "").trim()) {
    // input_type « combobox » : c'est le contrôle du formulaire (relevé du menu ouvert) — sa liste fait foi, une taille
    // hors de la grille est une question (listes.listeFaitFoiRelevee), comme la règle serveur des vêtements homme.
    out.push({ field_key: CHAMP_TAILLE_VETEMENTS_LBC, field_label: "Taille", required: true, input_type: "combobox",
      allowed_values: [...grille], grille_univers: String(univers).trim(), synthetique: "lbc_taille_de_l_univers" });
  }
  return out;
}
