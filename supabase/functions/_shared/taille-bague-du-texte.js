// ══════════════════════════════════════════════════════════════════════════
// LA TAILLE D'UNE BAGUE, LUE DANS LE TEXTE DU VENDEUR (26/10 nuit, point 11 — même règle que la pointure)
// ══════════════════════════════════════════════════════════════════════════
// Cas : Elodie82 (« Bague vintage diamants baguette », Vinted, needs_user « Taille »). Vinted « Bagues » (femmes et
// hommes) et Beebs « Bijoux (femme) » demandent une taille dans la MÊME grille : 22 diamètres intérieurs en mm
// (14,1 … 22,6 = les tailles US 3 à 13,5) + « Ajustable ».
// Règle (Nico) : lue SEULEMENT si elle est écrite collée à un mot explicite ; une seule valeur de la grille, sinon on
// ne choisit pas (la question reste) :
//   · « taille 54 », « T54 », « tour de doigt 54 », « 54 mm de tour » → un TOUR de doigt (taille française, norme
//     ISO 8653) de 40 à 75 → diamètre = tour ÷ π → la valeur de la grille à 0,1 mm au plus (T52 → 16,5 ; T54 → 17,19 :
//     aucune à 0,1 mm → la question) ;
//   · « diamètre 17,3 mm », « Ø 17.3 », « 17,3 mm de diamètre » → un DIAMÈTRE de 13 à 23 mm → la valeur à 0,1 mm ;
//   · « ajustable », « réglable » → « Ajustable ».
// Jamais : la taille d'une pierre (« diamants taille baguette », « taille brillant », « 5 mm » d'une pierre), un nombre
// suivi de ct, carat, g, €, % ; une largeur, une épaisseur ; deux valeurs (« 52 ou 54 », « 52/53 ») → doute ; les
// tailles US / UK → doute (décision de Nico à prendre). ES module pur (Deno + Node + Vite), sans dépendance.

const plier = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'");
const nombre = (s) => Number(String(s).replace(",", "."));

/** Les diamètres (mm) de la grille, lus dans SES libellés (« 16,5 mm », « 19 mm »). */
function grilleDiametres(allowedValues) {
  const out = [];
  for (const v of (Array.isArray(allowedValues) ? allowedValues : []).map(String)) {
    const m = /^\s*(\d{2}(?:[.,]\d)?)\s*mm\s*$/i.exec(v);
    if (m) out.push({ v, d: nombre(m[1]) });
  }
  return out;
}

const RE_PIERRE = /\b(diamants?|brillants?|baguettes?|princesse|emeraude|saphirs?|rubis|zircon|oxydes?|perles?|pierres?|carats?|ct)\b/;
const RE_TOUR = /(?:\btaille(?:\s+de\s+doigt)?|\btour\s+de\s+doigt|\bt)\s*[:=]?\s*(\d{2})(?![\d.,])(?!\s*(?:ct|carats?|g\b|€|%|mm\s+de\s+diam))/g;
const RE_TOUR_MM = /\b(\d{2})\s?mm\s+de\s+tour\b/g;
const RE_DIAMETRE = /(?:\bdiametre(?:\s+interieur)?|ø)\s*[:=]?\s*(?:de\s+)?(\d{2}(?:[.,]\d{1,2})?)\s?(?:mm)?\b/g;
const RE_DIAMETRE_APRES = /\b(\d{2}(?:[.,]\d{1,2})?)\s?mm\s+de\s+diametre\b/g;
const RE_US_UK = /\b(taille\s+)?(us|uk)\s*[:=]?\s*\d/;

/**
 * @param {{ chemin?: string|string[]|null, textes?: string[]|string, allowedValues?: string[] }} arg
 * @returns {{valeur:string, source:string, motif:string} | {doute:string} | null}
 */
export function tailleBagueDuTexte({ chemin = null, textes = [], allowedValues = [] } = {}) {
  const c = plier(Array.isArray(chemin) ? chemin.join(" > ") : chemin);
  if (!/\bbagues?\b|\bbijoux\b/.test(c)) return null;
  const grille = grilleDiametres(allowedValues);
  if (grille.length < 10) return null; // pas la grille des bagues : la règle ne joue pas
  const t = plier((Array.isArray(textes) ? textes : [textes]).join(" \n "));
  if (!/\b(bagues?|anneaux?|alliances?|chevalieres?|solitaires?)\b/.test(t)) return null;
  if (RE_US_UK.test(t)) return { doute: "taille US / UK écrite : la conversion n'est pas décidée" };
  const ajustable = (Array.isArray(allowedValues) ? allowedValues : []).map(String).find((v) => /^ajustable$/i.test(v.trim()));
  const diametres = new Set();
  const lire = (re, enDiametre) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      // Un DIAMÈTRE qui suit un mot de PIERRE dans la même phrase (« diamant de 15 mm de diamètre ») est celui de la
      // pierre, jamais du doigt. (Un tour de 40 à 75 ne peut pas être une pierre : « 2 carats, taille 60 » reste lu.)
      const avant = t.slice(Math.max(0, m.index - 24), m.index);
      if (enDiametre && RE_PIERRE.test(avant.split(/[,.;\n]/).pop() ?? "")) continue;
      const n = nombre(m[1]);
      const d = enDiametre ? n : n / Math.PI;
      if (enDiametre ? (n < 13 || n > 23) : (n < 40 || n > 75)) continue;
      diametres.add(Math.round(d * 100) / 100);
    }
  };
  lire(RE_TOUR, false); lire(RE_TOUR_MM, false); lire(RE_DIAMETRE, true); lire(RE_DIAMETRE_APRES, true);
  if (/\b\d{2}\s?(ou|\/)\s?\d{2}\b/.test(t) && diametres.size) return { doute: "deux tailles écrites" };
  if (diametres.size > 1) {
    const vals = [...diametres].map((d) => grille.filter((g) => Math.abs(g.d - d) <= 0.1).map((g) => g.v)).flat();
    if (new Set(vals).size !== 1) return { doute: `tailles écrites différentes (${[...diametres].join(", ")} mm)` };
  }
  if (diametres.size >= 1) {
    const d = [...diametres][0];
    const proches = grille.filter((g) => Math.abs(g.d - d) <= 0.1 + 1e-9);
    if (proches.length !== 1) return { doute: `aucune valeur de la grille à 0,1 mm de ${d} mm` };
    return { valeur: proches[0].v, source: "bague_du_texte", motif: `taille écrite par le vendeur (diamètre ${d} mm)` };
  }
  if (ajustable && /\b(ajustable|reglable|taille unique)\b/.test(t)) return { valeur: ajustable, source: "bague_ajustable", motif: "bague écrite « ajustable » ou « réglable »" };
  return null;
}
