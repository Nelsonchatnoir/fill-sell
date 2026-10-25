// ══════════════════════════════════════════════════════════════════════════
// LA POINTURE ÉCRITE DANS LE TITRE OU LA DESCRIPTION (25/10 soir, décision de Nico — lève le « ⛔ jamais une
// pointure » de taille-du-texte.js du 19/10, avec ses garde-fous)
// ══════════════════════════════════════════════════════════════════════════
// CE QUI L'A PROVOQUÉ : 17 questions « Pointure » Leboncoin en 7 jours (11 abandons), dont Marta (« Scarpe da nike
// Runallday », description « Taglia 37.5 », fiche 37.5) ; chaouidz : une question « Pointure » sur un « Adidas Torsion…
// Pointure 31 » remplie « 16 » en 9 s, publiée fausse sur Leboncoin et Beebs.
// LA RÈGLE (Nico, 25/10 soir) — on ne devine JAMAIS ; le pire cas autorisé est « on demande comme aujourd'hui » :
//   · seulement un nombre COLLÉ à un mot explicite : « pointure 31 », « P 31 », « P31 », « taille 37 » (rayon de
//     chaussures), « Taglia 37.5 », « talla 38 », « Größe 42 », « maat 40 », « EU 42 », « EUR 42 » ; jamais un nombre
//     seul (prix, « porté 2 fois », « lot de 3 », dimensions, années) ;
//   · cohérent avec le PUBLIC du rayon : enfant 16 à 38, adulte 34 à 50 ; public inconnu ou incohérent → rien ;
//   · une seule valeur : deux pointures différentes dans le texte (« 31/32 », « 38 ou 39 », « pointure 38 … taille
//     40 ») → rien ; une demi-pointure n'est jamais arrondie (37,5 n'est jamais 37 ni 38) ;
//   · une pointure UK / US écrite à côté → rien (« UK 8 », « US 9 ») : on ne convertit pas ; « 24 cm » collé au mot
//     (« pointure 24 cm ») est une longueur, jamais lue ; une longueur de semelle ailleurs ne gêne pas ;
//   · « 37 et demi », « 37,5 », « 37 1/2 », « 37½ » = 37,5 ;
//   · la valeur rendue est une option EXACTE de la grille de la plateforme (placer) ; aucune option → rien.
// La fiche n'est jamais réécrite : seule la valeur servie à la plateforme, tracée (motif lisible).
// ES module pur (Deno + Node + Vite), sans dépendance.

const nfc = (t) => String(t ?? "").normalize("NFC");
const plier = (t) => nfc(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const POINTURE_ENFANT = Object.freeze({ min: 16, max: 38 });
export const POINTURE_ADULTE = Object.freeze({ min: 34, max: 50 });

// Le public d'un rayon (chemin de catégorie, toutes plateformes) : « enfant », « adulte » ou null (inconnu).
const RE_ENFANT = /\b(enfants?|bebes?|bebe|b[ée]b[ée]s?|fille|filles|garcons?|gar[cç]ons?|kids?|junior|baby|naissance|puericulture|layette|premiers pas)\b/;
const RE_ADULTE = /\b(femmes?|hommes?|women|men|adultes?|mixte adulte|dame|homme|mujer|donna|uomo)\b/;
/** Le public du rayon : « enfant », « adulte », ou null quand le rayon ne le dit pas (ou dit les deux). */
export function publicDuRayon(chemin) {
  const c = plier(Array.isArray(chemin) ? chemin.join(" > ") : chemin);
  if (!c.trim()) return null;
  const e = RE_ENFANT.test(c), a = RE_ADULTE.test(c);
  if (e && !a) return "enfant";
  if (a && !e) return "adulte";
  return null;
}

// Un nombre de pointure : « 31 », « 37.5 », « 37,5 », « 37 1/2 », « 37½ ».
const NOMBRE = "(\\d{2})(?:\\s?(?:[.,]5|½|1/2|et\\s?demie?))?";
// Les mots explicites, suivis (au plus) d'un deux-points ou d'un tiret, puis du nombre.
const MOTS = "pointures?|p\\.?|taille|taglia|talla|gr(?:o|ö|oe)(?:ss|ß)e|maat|eu\\s?size|eu";
// (?![.,]\d) : jamais un morceau d'un nombre plus long (« 40,5 cm » ne se relit pas « 40 » en revenant en arrière).
const RE_POINTURE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${MOTS})\\s?[:=-]?\\s?${NOMBRE}(?![\\d\\p{L}])(?![.,]\\d)(?!\\s?(?:cm|mm|€|eur\\b|euros?\\b|ans?\\b|mois\\b|kg|g\\b|%))`, "giu");
// Une pointure en tiers (Adidas : « 37 1/3 », « 38 2/3 », « 37⅓ ») : jamais arrondie, jamais lue — doute.
const RE_TIERS = new RegExp(`(?<![\\p{L}\\p{N}])(?:${MOTS})\\s?[:=-]?\\s?\\d{2}\\s?(?:[12]/3|⅓|⅔)`, "iu");
// Deux nombres écrits comme une fourchette ou une alternative juste après le mot : « 31/32 », « 38-39 », « 38 ou 39 ».
const RE_ALTERNATIVE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${MOTS})\\s?[:=-]?\\s?\\d{2}(?:[.,]5)?\\s?(?:/|-|–|ou|et|à|a|or)\\s?\\d{2}(?![\\d])`, "giu");
// Une pointure d'un autre système, à côté : jamais convertie.
const RE_AUTRE_SYSTEME = /(?<![\p{L}\p{N}])(?:uk|us|usa)\s?\d{1,2}(?:[.,]5)?(?![\d])|(?<![\p{L}\p{N}])(?:uk|us)\s?(?:size|taille)/giu;

const valeurNombre = (txt) => {
  const m = /(\d{2})(?:\s?(?:[.,](5)|(½)|(1\/2)|(et\s?demie?)))?/i.exec(txt);
  if (!m) return null;
  return Number(m[1]) + (m[2] || m[3] || m[4] || m[5] ? 0.5 : 0);
};

/** Les pointures écrites dans des textes (pur) : { valeurs:number[], autreSysteme:boolean, alternative:boolean, tiers:boolean }. */
export function lirePointuresDuTexte(textes) {
  const valeurs = [];
  let autreSysteme = false, alternative = false, tiers = false;
  for (const t of (Array.isArray(textes) ? textes : [textes])) {
    const s = nfc(t);
    if (!s.trim()) continue;
    if (RE_AUTRE_SYSTEME.test(s)) autreSysteme = true;
    RE_AUTRE_SYSTEME.lastIndex = 0;
    if (RE_ALTERNATIVE.test(s)) alternative = true;
    RE_ALTERNATIVE.lastIndex = 0;
    if (RE_TIERS.test(s)) tiers = true;
    for (const m of s.matchAll(RE_POINTURE)) {
      // « P » seul exige la forme serrée « P31 » / « P 31 » / « P.31 » et un nombre de pointure (pas « P 2 »).
      const v = valeurNombre(m[0].slice(m[0].search(/\d/)));
      if (v != null) valeurs.push(v);
    }
  }
  return { valeurs: [...new Set(valeurs)], autreSysteme, alternative, tiers };
}

const formats = (v) => {
  const ent = Math.floor(v), demi = v !== ent;
  return demi ? [`${ent},5`, `${ent}.5`, `${ent} ½`, `${ent}½`, `${ent} 1/2`] : [String(ent)];
};
/** L'option EXACTE de la grille pour une pointure (« 37,5 », « EU 37.5 », « 37 »…), ou null (aucune / plusieurs). */
export function placerPointure(v, grille) {
  const opts = (Array.isArray(grille) ? grille : []).map((o) => String(typeof o === "string" ? o : (o?.code ?? o?.title ?? o?.label ?? "")).trim()).filter(Boolean);
  const cibles = new Set(formats(v));
  const nu = (o) => o.replace(/^(?:eu|eur|fr|pointure|taille)\s*[:.-]?\s*/i, "").replace(/\s*\(.*\)\s*$/, "").trim();
  const trouvees = [...new Set(opts.filter((o) => cibles.has(nu(o)) || cibles.has(nu(o).replace(/\s+/g, ""))))];
  return trouvees.length === 1 ? trouvees[0] : null;
}

/**
 * La pointure à servir pour un champ de chaussures (pur).
 * @param {{ valeurFiche?: unknown, textes?: unknown[], chemin?: unknown, grille: unknown[] }} p
 *   `valeurFiche` : la pointure portée par la fiche ou la copie (« 37.5 », « EU 31 ») — la source la plus sûre ;
 *   `textes` : titre et description du vendeur ; `chemin` : le rayon (son public) ; `grille` : les options du champ.
 * @returns {{ valeur:string, motif:string, source:"fiche"|"texte" } | { doute:string } | null}
 */
export function pointureDuTexte({ valeurFiche = "", textes = [], chemin = null, grille }) {
  const pub = publicDuRayon(chemin);
  const borne = pub === "enfant" ? POINTURE_ENFANT : pub === "adulte" ? POINTURE_ADULTE : null;
  const dansBorne = (v) => borne != null && v >= borne.min && v <= borne.max;
  // 1. La fiche (le vendeur l'a déjà dite) : un nombre seul ou « EU N » ; rien d'autre n'est lu.
  const f = nfc(valeurFiche).trim();
  const mFiche = /^(?:eu|eur)?\s?(\d{2}(?:[.,]5)?)$/i.exec(f);
  const vFiche = mFiche ? Number(mFiche[1].replace(",", ".")) : null;
  const lu = lirePointuresDuTexte(textes);
  if (vFiche != null) {
    if (!borne) return { doute: `public du rayon inconnu (fiche ${f})` };
    if (!dansBorne(vFiche)) return { doute: `pointure ${f} incohérente avec un rayon ${pub}` };
    if (lu.tiers || lu.valeurs.some((v) => v !== vFiche)) return { doute: `la fiche dit ${f}, le texte une autre pointure` };
    const place = placerPointure(vFiche, grille);
    return place ? { valeur: place, motif: `pointure ${f} de la fiche`, source: "fiche" } : null;
  }
  if (f) return null;   // une valeur de fiche qu'on ne sait pas lire (« UK 8 », « M ») n'est jamais recouverte
  // 2. Le texte : un seul nombre collé à un mot explicite, cohérent avec le public du rayon.
  if (!lu.valeurs.length) return null;
  if (lu.autreSysteme) return { doute: "une pointure d'un autre système (UK, US) est écrite à côté" };
  if (lu.alternative) return { doute: "deux pointures possibles écrites (fourchette ou alternative)" };
  if (lu.tiers) return { doute: "pointure en tiers (1/3, 2/3) : jamais arrondie" };
  if (lu.valeurs.length > 1) return { doute: `plusieurs pointures dans le texte (${lu.valeurs.join(", ")})` };
  const v = lu.valeurs[0];
  if (!borne) return { doute: `public du rayon inconnu (texte ${v})` };
  if (!dansBorne(v)) return { doute: `pointure ${v} incohérente avec un rayon ${pub}` };
  const place = placerPointure(v, grille);
  return place ? { valeur: place, motif: `pointure ${String(v).replace(".", ",")} écrite par le vendeur`, source: "texte" } : null;
}
