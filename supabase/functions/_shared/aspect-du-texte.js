// ═══════════════════════════════════════════════════════════════════════════
// UN ASPECT eBAY EXIGÉ QUE LE TEXTE DIT DÉJÀ : DÉDUIT, JAMAIS INVENTÉ (06/11, ordre de Nico, point 9)
// ═══════════════════════════════════════════════════════════════════════════
// ayadi007 (Business), 06/11 : « Type » de la catégorie 11205 (Imprimantes, scanners) a bloqué deux clics sur Publier
// (« scanner de codes-barres portable Android »), « Longueur » de la catégorie 54235 (sièges : liste « 25 cm … 85 cm »)
// lui a fait décocher eBay en 3 s (« Chaise Ergonomique B300 Pro »). Nico : ces valeurs se trouvent souvent dans le
// titre ou la description — l'app doit les déduire elle-même, comme la taille, d'une source RÉELLE (règle 4 c : jamais
// une valeur inventée), et ne poser la question que si elle ne trouve vraiment rien.
// LA RÈGLE (pure, Node + Vite + Deno ; le web — encart eBay du stepper — et le serveur — ebay-aspects-du-texte.ts, voie
// API — appellent la même) :
//   · une MESURE (« Longueur », « Largeur », « Hauteur », « Profondeur », « Épaisseur », « Diamètre ») : un nombre avec
//     son unité, NOMMÉ dans le texte (« Longueur : 60 cm », « hauteur 1,2 m », « H 70 cm »), ou un triple « 60 x 40 x 70
//     cm » dont le texte nomme l'ordre (« L x l x H », « L x P x H », « Dimensions (L x l x H) ») ; converti en cm / mm
//     / m pour retrouver l'option EXACTE de la liste (« 60 cm ») — une seule valeur lue, une seule option ; hors liste,
//     deux mesures différentes ou un triple sans ordre nommé (« 60x40x70cm ») → rien : la question ;
//   · tout autre aspect à liste : l'option écrite EN TOUTES LETTRES dans le texte, mot entier, accents et casse près
//     (« Imprimante 3D », « Chaise de bureau ») — la plus précise quand l'une contient l'autre (« Chaise » ⊂ « Chaise de
//     bureau ») ; plusieurs options sans lien → rien (les candidates sont rendues pour mettre la question dans le bon
//     ordre) ; jamais une option vague (« Autre », « Aucun », « Non applicable », « Inconnu », « Oui », « Non »), jamais
//     une option de moins de 4 lettres.
//   ⛔ Jamais la marque, la taille, la couleur, l'état (leurs règles), jamais par-dessus une valeur déjà posée (l'appelant
//      ne vient ici que pour un aspect vide). Aucune lecture de photo ici : une valeur lue sur une photo n'est déduite que
//      par un module qui la lit vraiment (Lens).

const plier = (s) => String(s ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[‘’‚‛′ʼ`´]/g, "'")
  .replace(/[‐-―−]/g, "-")
  .replace(/[\u00a0\u202f]/g, " ")
  .toLowerCase();
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const textesListe = (textes) => (Array.isArray(textes) ? textes : [textes])
  .map((t) => (t && typeof t === "object" ? t.texte ?? t.text ?? "" : t)).map((t) => String(t ?? "")).filter((t) => t.trim());

// ── 1. LES MESURES ──────────────────────────────────────────────────────────────────────────────────────────────────
const DIMENSIONS = {
  longueur: { mots: ["longueur", "long\\.", "lg\\.?"], lettre: "L" },
  largeur: { mots: ["largeur", "larg\\.", "lrg\\.?"], lettre: "l" },
  hauteur: { mots: ["hauteur", "haut\\.", "ht\\.?"], lettre: "H" },
  profondeur: { mots: ["profondeur", "prof\\.", "p\\.(?=\\s)"], lettre: "P" },
  epaisseur: { mots: ["epaisseur", "ep\\."], lettre: "E" },
  diametre: { mots: ["diametre", "diam\\.", "ø", "⌀"], lettre: null },
};
/** Le nom d'aspect eBay est-il une MESURE simple ? → clé de DIMENSIONS, sinon null (« Longueur de la robe » : non). */
export function dimensionDeLAspect(name) {
  const n = plier(name).replace(/\s*\((?:cm|mm|m|cm\/in|in)\)\s*$/, "").trim();
  const m = /^(longueur|largeur|hauteur|profondeur|epaisseur|diametre)(?: totale| de l'article| de l'objet| du produit)?$/.exec(n);
  return m ? m[1] : null;
}
const NOMBRE = "(\\d{1,4}(?:[.,]\\d{1,2})?)";
const UNITE = "(mm|cm|m)(?![a-z])";
const enCm = (n, u) => {
  const v = Number(String(n).replace(",", "."));
  if (!Number.isFinite(v)) return NaN;
  return u === "mm" ? v / 10 : u === "m" ? v * 100 : v;
};
// « 1m50 », « 1 m 20 » → 150, 120 cm.
const METRE_CM = /(\d)\s?m\s?(\d{2})(?![\d])/g;

/** Les mesures NOMMÉES du texte, en cm : { longueur: [60], hauteur: [70] … } (valeurs distinctes). */
export function mesuresDuTexte(textes) {
  const out = {};
  const poser = (dim, cm) => { if (!Number.isFinite(cm) || cm <= 0 || cm > 100000) return; const v = Math.round(cm * 10) / 10; (out[dim] ??= []).includes(v) || out[dim].push(v); };
  for (const brut of textesListe(textes)) {
    const t = plier(brut).replace(METRE_CM, (_, a, b) => `${a}.${b} m`);
    // a) « Longueur : 60 cm », « hauteur 1,2 m », « long. 60cm »
    for (const [dim, d] of Object.entries(DIMENSIONS)) {
      const re = new RegExp(`(?<![\\p{L}])(?:${d.mots.join("|")})\\s*(?:[:=]|de|d'environ|env\\.?|environ|max\\.?|maximum|totale?)?\\s*[:=]?\\s*${NOMBRE}\\s?${UNITE}`, "giu");
      for (const m of t.matchAll(re)) poser(dim, enCm(m[1], m[2]));
    }
    // b) Une lettre MAJUSCULE dans le texte d'origine (« H 70 cm », « L: 60 cm ») : seulement L, H, P (jamais « l », qui
    //    se lit mal), collée à un nombre et une unité.
    for (const [dim, d] of Object.entries(DIMENSIONS)) {
      if (!d.lettre || d.lettre === "l") continue;
      const re = new RegExp(`(?<![\\p{L}\\d])${d.lettre}\\s*[:=]?\\s*${NOMBRE}\\s?${UNITE}`, "gu");
      for (const m of String(brut).normalize("NFC").replace(/[\u00a0\u202f]/g, " ").matchAll(re)) poser(dim, enCm(m[1], m[2].toLowerCase()));
    }
    // c) Un triple / un double dont l'ORDRE est nommé : « L x l x H », « L x P x H », « (Lxlxh) », « l x h » …
    const ordre = /(?<![\p{L}])([lhp])\s?[x×*]\s?([lhp])(?:\s?[x×*]\s?([lhp]))?(?![\p{L}])/iu.exec(String(brut).normalize("NFC"));
    const nombres = new RegExp(`${NOMBRE}\\s?(?:${UNITE})?\\s?[x×*]\\s?${NOMBRE}\\s?(?:${UNITE})?(?:\\s?[x×*]\\s?${NOMBRE})?\\s?${UNITE}`, "u").exec(t);
    if (ordre && nombres) {
      const lettres = [ordre[1], ordre[2], ordre[3]].filter(Boolean);
      const unite = nombres[nombres.length - 1];
      const vals = [nombres[1], nombres[3], nombres[5]].filter((x) => x != null);
      if (lettres.length === vals.length) {
        // « l » minuscule = largeur, « L » majuscule = longueur ; « P » profondeur, « H » hauteur.
        const dimDe = (c) => c === "L" ? "longueur" : c === "l" ? "largeur" : /p/i.test(c) ? "profondeur" : /h/i.test(c) ? "hauteur" : null;
        const dims = lettres.map(dimDe);
        // Deux « l » / « L » qu'on ne distingue pas (« lxlxh » tout en minuscules) : l'ordre n'est pas sûr, rien.
        const sur = new Set(dims).size === dims.length && !dims.includes(null)
          && !(lettres.filter((c) => /l/i.test(c)).length === 2 && lettres.filter((c) => c === "L").length !== 1);
        if (sur) dims.forEach((dim, i) => poser(dim, enCm(vals[i], unite)));
      }
    }
  }
  return out;
}

const FORMATS = (cm) => {
  const r = (x) => (Math.round(x * 100) / 100).toString();
  return [`${r(cm)} cm`, `${r(cm)}cm`, `${r(cm * 10)} mm`, `${r(cm * 10)}mm`, `${r(cm / 100)} m`, `${r(cm / 100).replace(".", ",")} m`,
    `${r(cm).replace(".", ",")} cm`];
};
/**
 * La valeur d'un aspect de MESURE lue dans le texte, recalée sur la liste : { valeur, preuve, source } ou null.
 * @param {{ name: string, allowedValues?: string[], textes: unknown }} p
 */
export function mesureDeLAspect({ name, allowedValues = [], textes }) {
  const dim = dimensionDeLAspect(name);
  const liste = (Array.isArray(allowedValues) ? allowedValues : []).map((v) => String(v).trim()).filter(Boolean);
  if (!dim || !liste.length) return null;
  const lues = mesuresDuTexte(textes)[dim] ?? [];
  if (lues.length !== 1) return null; // rien de nommé, ou deux mesures différentes : la question
  const cibles = new Set(FORMATS(lues[0]).map((f) => plier(f).replace(/\s+/g, "")));
  const trouvees = liste.filter((v) => cibles.has(plier(v).replace(/\s+/g, "")));
  if (trouvees.length !== 1) return null;
  return { valeur: trouvees[0], source: "mesure_du_texte", preuve: `${dim} ${String(lues[0]).replace(".", ",")} cm écrite dans l'annonce` };
}

// ── 2. L'OPTION ÉCRITE EN TOUTES LETTRES ────────────────────────────────────────────────────────────────────────────
const VAGUES = /^(autres?|other|divers|aucune?|none|non applicable|ne s'applique pas|sans objet|inconnue?|non specifiee?|oui|non|yes|no|-?\s*sans marque\/generique\s*-?|generique|standard|mixte|unisexe)$/;
const optionNorm = (s) => plier(s).replace(/[^a-z0-9'+]+/g, " ").trim();
/**
 * L'option de la liste écrite EN TOUTES LETTRES dans le texte (mot entier, accents et casse près).
 * @returns {{ valeur: string, source: string, preuve: string } | { candidats: string[] } | null}
 */
export function optionEcriteDuTexte({ allowedValues = [], textes }) {
  const liste = [...new Set((Array.isArray(allowedValues) ? allowedValues : []).map((v) => String(v).trim()).filter(Boolean))];
  if (!liste.length) return null;
  const corps = ` ${textesListe(textes).map(optionNorm).join(" | ")} `;
  const nommees = liste.filter((v) => {
    const n = optionNorm(v);
    if (n.replace(/[^a-z]/g, "").length < 4 || VAGUES.test(n)) return false;
    return new RegExp(`(?<![a-z0-9'])${echapper(n)}(?![a-z0-9])`).test(corps);
  });
  if (!nommees.length) return null;
  // La plus précise : une option qui contient toutes les autres nommées (« Chaise de bureau » ⊃ « Chaise »).
  const plusLongue = [...nommees].sort((a, b) => optionNorm(b).length - optionNorm(a).length)[0];
  const contientTout = nommees.every((v) => v === plusLongue || new RegExp(`(?<![a-z0-9'])${echapper(optionNorm(v))}(?![a-z0-9])`).test(optionNorm(plusLongue)));
  if (nommees.length === 1 || contientTout) {
    return { valeur: plusLongue, source: "option_ecrite_du_texte", preuve: `« ${plusLongue} » écrit dans l'annonce` };
  }
  return { candidats: nommees };
}

/**
 * L'aspect exigé que le texte dit : la mesure, sinon l'option écrite. null → la question.
 * @param {{ name: string, allowedValues?: string[], textes: unknown }} p
 */
export function aspectDuTexte({ name, allowedValues = [], textes }) {
  if (/^(marque|brand|taille|pointure|size|couleur|color|colour|etat|état|condition)\b/i.test(String(name ?? "").trim())) return null;
  if (dimensionDeLAspect(name)) return mesureDeLAspect({ name, allowedValues, textes });
  return optionEcriteDuTexte({ allowedValues, textes });
}
