// ═══════════════════════════════════════════════════════════════════════════
// UNE ŒUVRE D'ART N'EST JAMAIS UN COSMÉTIQUE (22/10 soir, point 2 — paugues, Pro)
// ═══════════════════════════════════════════════════════════════════════════
// « André Thomas - Huile post impressionniste biblique sur carton fort - XX° » :
// le mot « Huile » du titre rangeait la fiche en « Beauté » (detectType), le
// type « Beauté » donnait l'icône 🧴, et la garde Leboncoin « cosmétiques
// interdits » refusait la publication — retirer « huile » du titre n'y changeait
// rien (le type était déjà écrit). Ses autres peintures du jour sont parties en
// « Autre ». La règle de Nico : « une peinture, une estampe, une gravure ou une
// œuvre d'art n'est jamais classée en beauté ni bloquée comme cosmétique, quels
// que soient les mots employés ».
//
// Ce fichier dit, à partir du titre ET de la description (et de l'objet lu par
// le Lens), si l'article EST une œuvre d'art — peinture, dessin, estampe,
// gravure, lithographie, sculpture exclue ici (règle 🖼️ voisine dans
// shared.js) — et de quelle famille, pour le rayon :
//   · « peinture » : huile, acrylique, gouache, aquarelle, pastel, fusain,
//     sanguine, encre, lavis, dessin original, technique mixte ;
//   · « estampe » : lithographie, gravure, eau-forte, sérigraphie, estampe,
//     linogravure, xylographie, aquatinte, pointe sèche, épreuve d'artiste,
//     affiche, reproduction.
// Il est lu par detectType / detectObjectIcon (shared.js), la garde Leboncoin
// (lbcCategories.js) et la résolution des rayons (resolutionPublication.js) ;
// l'extension en porte un MIROIR (background.js, LBC_OEUVRE_D_ART) que le
// selftest compare à celui-ci.
// ⛔ Aucun mot seul ambigu : « toile » (tente, toile cirée), « tableau » (de
//    bord, électrique, blanc), « peinture » (pot, rouleau, murale), « pastel »
//    (couleur), « crayon » (maquillage) ne suffisent JAMAIS seuls — il faut le
//    support (« sur toile / carton / papier »), la technique, ou un signe de
//    l'œuvre (signée, peintre, artiste, encadrée, numérotée, siècle, école…).
// ═══════════════════════════════════════════════════════════════════════════

const B = "(?<![\\p{L}\\p{N}])";   // borne gauche Unicode
const E = "(?![\\p{L}\\p{N}])";    // borne droite Unicode

// Les SUPPORTS d'une œuvre.
const SUPPORT = "(?:toiles?|carton(?:s|\\s+fort|\\s+entoil[ée])?|panneaux?|bois|papier|isorel|lin|cuivre|masonite|soie|velin|vélin)";
// Les TECHNIQUES picturales (et le dessin).
const TECHNIQUE = "(?:huiles?|acryliques?|gouaches?|aquarelles?|pastels?|fusains?|sanguines?|encres?(?:\\s+de\\s+chine)?|lavis|techniques?\\s+mixtes?|crayons?\\s+(?:gras|de\\s+couleur|graphite)|mines?\\s+de\\s+plomb|graphite)";
// Les signes de l'œuvre (qui font d'une « peinture » / d'un « tableau » une œuvre).
const SIGNE = "(?:sign[ée]e?s?|peintres?|artistes?|œuvres?|oeuvres?|encadr[ée]e?s?|num[ée]rot[ée]e?s?|impressionnis\\w*|expressionnis\\w*|post[\\s-]?impressionnis\\w*|cubis\\w*|fauvis\\w*|surr[ée]alis\\w*|abstraite?s?|figurati\\w*|na[ïi]f|na[ïi]ve|paysages?|portraits?|natures?\\s+mortes?|sc[èe]nes?\\s+de|[ée]cole\\s+(?:fran[çc]aise|flamande|hollandaise|italienne|de)|xx[e°]?(?:\\s*si[èe]cle)?|xix[e°]?(?:\\s*si[èe]cle)?|xviii[e°]?|si[èe]cle|d[ée]dicac[ée]e?)";

// Estampes et techniques d'impression (une estampe se nomme d'un mot sans ambiguïté).
const ESTAMPE_RE = new RegExp(B + "(?:lithographies?|lithos?|gravures?|eaux?[\\s-]fortes?|s[ée]rigraphies?|estampes?|linogravures?|xylographies?|aquatintes?|pointes?[\\s-]s[èe]ches?|[ée]preuves?\\s+d['’]artiste|burins?\\s+originaux)" + E, "iu");
// Peintures et dessins : une technique SUR un support (même séparés de quelques mots :
// « Huile post impressionniste biblique sur carton »).
const TECHNIQUE_SUR_SUPPORT_RE = new RegExp(B + TECHNIQUE + E + "[^.\\n]{0,60}?" + B + "sur\\s+" + SUPPORT + E, "iu");
// « Peinture à l'huile », « toile peinte », « aquarelle originale »…
const TECHNIQUE_NOMMEE_RE = new RegExp(
  B + "(?:peintures?\\s+(?:à\\s+l['’]\\s*)?(?:huile|acrylique|gouache|aquarelle)|toiles?\\s+(?:peintes?|huile)|(?:aquarelles?|gouaches?|pastels?|fusains?|sanguines?)\\s+(?:originale?s?|originaux|sign[ée]e?s?|encadr[ée]e?s?|sur\\s+papier)|dessins?\\s+(?:originaux|original|à\\s+l['’]encre|au\\s+fusain|au\\s+crayon|encadr[ée]s?|sign[ée]s?))" + E,
  "iu");
// « Peinture » / « tableau » / « toile » / « pastel » / « fusain » / « dessin » + un SIGNE de l'œuvre dans le texte.
const MOT_OEUVRE_RE = new RegExp(B + "(?:peintures?|tableaux?|toiles?|pastels?|fusains?|dessins?|croquis|esquisses?)" + E, "iu");
const SIGNE_RE = new RegExp(B + SIGNE + E, "iu");
// « Huile » seule n'est jamais une œuvre (bidon, burette, olive, soin) : seulement avec un signe FORT de la peinture
// (« Portrait ecclésiastique … huile du XIX° », « huile signée ») et sans mot d'huile utilitaire ou de soin.
const HUILE_RE = new RegExp(B + "huiles?" + E, "iu");
const SIGNE_FORT_RE = new RegExp(B + "(?:sign[ée]e?s?|peintres?|artistes?|portraits?|paysages?|natures?\\s+mortes?|marines?\\s+(?:voiliers?|bateaux?|port)|xx[e°]?|xix[e°]?|xviii[e°]?|si[èe]cle|[ée]cole\\s+(?:fran[çc]aise|flamande|hollandaise|italienne)|impressionnis\\w*)" + E, "iu");
const HUILE_UTILITAIRE_RE = new RegExp(B + "(?:bidons?|burettes?|moteurs?|olives?|essentielles?|massages?|visages?|corps|cheveux|barbe|lampes?|friture|cuisine|s[èe]che|d[ée]maquillante|argan|coco|ricin|vidange|graissage|pompes?|bio)" + E, "iu");

// « Œuvre d'art », « œuvre originale », « œuvre signée »…
const OEUVRE_RE = new RegExp(B + "(?:œuvres?|oeuvres?)\\s+(?:d['’]art|originale?s?|sign[ée]e?s?|unique|de\\s+l['’]artiste|peinte?s?)" + E, "iu");
// Ce qui n'est PAS une œuvre même avec ces mots : fournitures et bricolage.
const PAS_UNE_OEUVRE_RE = new RegExp(
  B + "(?:pots?\\s+de\\s+peinture|rouleaux?(?:\\s+[àa])?\\s+peinture|peintures?\\s+(?:murales?\\s+(?:blanche|mate|satin)|glyc[ée]ro|pour\\s+(?:mur|meuble|bois|métal|metal|plafond|carrelage|sol|tissu|voiture|maquette)|en\\s+(?:pot|bombe|spray)|de\\s+carrosserie)|tableaux?\\s+(?:de\\s+bord|[ée]lectriques?|blancs?|velleda|magn[ée]tiques?|noirs?|p[ée]riodiques?|de\\s+commande)|toiles?\\s+(?:de\\s+tente|cir[ée]es?|de\\s+jute|de\\s+store|de\\s+parasol|de\\s+trampoline|de\\s+peintre\\s+vierges?|vierges?)|set\\s+de\\s+peinture|kit\\s+de\\s+peinture|bo[îi]te\\s+de\\s+(?:peinture|pastels?|crayons?|gouache|aquarelle)|palette\\s+de\\s+(?:maquillage|fards?|ombres?)|crayons?\\s+(?:yeux|l[èe]vres?|sourcils?|khôl|kajal)|tubes?\\s+de\\s+(?:peinture|gouache|aquarelle|acrylique))" + E,
  "iu");

// Un texte qui COMMENCE par une technique (« Pastel buste de femme - Pierre Almès - 1924 », « Fusain de François
// Renoyer ») la nomme comme l'objet : œuvre dès qu'elle est attribuée (« de/d' » + un nom propre), datée (une
// année), ou qu'un signe de l'œuvre suit. « Pull pastel », « Fusain du Japon » (arbuste) ne commencent pas ainsi
// ou ne sont ni attribués ni datés.
const TECHNIQUE_EN_TETE_RE = /^[\s"'«“(]*(pastels?|fusains?|sanguines?|aquarelles?|dessins?|croquis|esquisses?|lavis)(?![\p{L}\p{N}])/iu;
const ATTRIBUTION_RE = /(?<![\p{L}\p{N}])(?:de|d['’]|par)\s*(\p{Lu}[\p{L}'’-]+)/u;
const ANNEE_RE = /(?<!\d)(?:1[5-9]\d\d|20[0-2]\d)(?!\d)/;

/**
 * L'article est-il une œuvre d'art ? (titre, description, objet lu par le Lens…)
 * @param {...string} textes
 * @returns {null | {famille: 'peinture' | 'estampe', preuve: string}}
 */
export function oeuvreDArt(...textes) {
  const t = textes.map((x) => String(x ?? "")).filter(Boolean).join(" \n ");
  if (!t.trim()) return null;
  if (PAS_UNE_OEUVRE_RE.test(t) && !ESTAMPE_RE.test(t) && !TECHNIQUE_SUR_SUPPORT_RE.test(t)) return null;
  let m;
  if ((m = t.match(ESTAMPE_RE))) return { famille: "estampe", preuve: m[0] };
  if ((m = t.match(TECHNIQUE_SUR_SUPPORT_RE))) return { famille: "peinture", preuve: m[0] };
  if ((m = t.match(TECHNIQUE_NOMMEE_RE))) return { famille: "peinture", preuve: m[0] };
  if ((m = t.match(OEUVRE_RE))) return { famille: "peinture", preuve: m[0] };
  const mot = t.match(MOT_OEUVRE_RE);
  const signe = t.match(SIGNE_RE);
  if (mot && signe) return { famille: "peinture", preuve: `${mot[0]} … ${signe[0]}` };
  const huile = t.match(HUILE_RE);
  const fort = t.match(SIGNE_FORT_RE);
  if (huile && fort && !HUILE_UTILITAIRE_RE.test(t)) return { famille: "peinture", preuve: `${huile[0]} … ${fort[0]}` };
  for (const x of textes) {
    const s = String(x ?? "");
    const tete = s.match(TECHNIQUE_EN_TETE_RE);
    if (!tete) continue;
    const suite = s.slice(tete.index + tete[0].length);
    if (ATTRIBUTION_RE.test(suite) || ANNEE_RE.test(suite) || SIGNE_RE.test(suite)) {
      return { famille: "peinture", preuve: tete[1] };
    }
  }
  return null;
}

/** Raccourci booléen. */
export const estOeuvreDArt = (...textes) => oeuvreDArt(...textes) !== null;

/**
 * Le rayon Vinted d'une œuvre (relevé sur l'annonce de paugues le 22/10 : fil d'Ariane
 * Maison › Décoration › Décorations murales › Peintures, ids 1918 › 1934 › 3846 › 3847).
 * Estampes, gravures, lithographies, affiches : « Affiches et reproductions » (3849).
 */
export function rayonVintedOeuvre(famille) {
  return famille === "estampe"
    ? { chemin: ["Maison", "Décoration", "Décorations murales", "Affiches et reproductions"], id: 3849 }
    : { chemin: ["Maison", "Décoration", "Décorations murales", "Peintures"], id: 3847 };
}
