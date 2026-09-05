// ── Forme COMPARABLE d'un libellé (2026-09-05) ───────────────────────────────
// Sert UNIQUEMENT à rapprocher notre valeur d'une option affichée par une
// plateforme (liste relevée, menu de page, catalogue). JAMAIS à écrire : la
// valeur envoyée à la plateforme reste celle qu'elle affiche, caractère pour
// caractère — on compare les formes comparables, on écrit l'original de la
// liste (cf. valeurDeListeCorrespondante).
//
// Cas fondateur : « Jouets d'éveil » (apostrophe droite U+0027, écrite par
// l'IA) ≠ « Jouets d’éveil » (apostrophe typographique U+2019, affichée par
// Leboncoin) pour ===. Inventaire du 05/09 : 107 valeurs du catalogue relevé
// (Vinted 94, Beebs 11, Leboncoin 2) et 5 610 valeurs d'aspects eBay portent
// un caractère à variante Unicode (apostrophes, guillemets, espaces
// insécables, tirets longs, points de suspension).
//
// ⚠️ Le corps de texteComparable est COPIÉ À L'IDENTIQUE dans les 4 content
// scripts de l'extension (scripts classiques, aucun module partagé — ADR-03)
// et dans supabase/functions/_shared/texte-comparable.ts.
// scripts/texte-comparable-selftest.mjs refuse toute divergence entre copies.
// ⟦texte-comparable:début⟧
export function texteComparable(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")                  // accents → lettre nue
    .replace(/[\u2018\u2019\u201a\u201b\u2032\u02bc\u0060\u00b4]/g, "'") // apostrophes ‘ ’ ‚ ‛ ′ ʼ ` ´ → '
    .replace(/[\u201c\u201d\u201e\u201f\u00ab\u00bb\u2033]/g, '"')       // guillemets “ ” „ ‟ « » ″ → "
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")       // tirets ‐ ‑ ‒ – — ― − → -
    .replace(/\u2026/g, "...")                                                  // … → ...
    .replace(/\u00ad|\u200b|\u200c|\u200d|\ufeff/g, "")                    // invisibles (soft hyphen, zero-width, BOM) — en alternance, pas en classe
    .replace(/\s+/g, " ")                                                           // espaces (insécables U+00A0/U+202F comprises) → espace simple
    .trim()
    .toLowerCase();
}
// ⟦texte-comparable:fin⟧

// Deux libellés désignent-ils la même option ?
export function memeTexte(a, b) {
  const ca = texteComparable(a);
  return ca !== "" && ca === texteComparable(b);
}

// L'entrée de `liste` qui correspond à `valeur` — rendue TELLE QUELLE (chaîne
// de la plateforme), ou null. C'est la seule façon d'écrire une valeur venue
// d'une comparaison : jamais la forme comparable, jamais notre saisie.
export function valeurDeListeCorrespondante(valeur, liste) {
  const cible = texteComparable(valeur);
  if (!cible || !Array.isArray(liste)) return null;
  const hit = liste.find((v) => texteComparable(v) === cible);
  return hit === undefined ? null : hit;
}
