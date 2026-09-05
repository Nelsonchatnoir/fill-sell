// ── Forme COMPARABLE d'un libellé (2026-09-05) — copie serveur ───────────────
// Même corps que src/utils/texteComparable.js et que le bloc des 4 content
// scripts ; scripts/texte-comparable-selftest.mjs refuse toute divergence.
// Sert à rapprocher une valeur (réponse IA, saisie) d'une liste relevée sur
// une plateforme, puis à ÉCRIRE l'entrée de la liste telle quelle — jamais la
// forme comparable (cf. valeurDeListeCorrespondante).
// ⟦texte-comparable:début⟧
export function texteComparable(s: unknown): string {
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

export function valeurDeListeCorrespondante(valeur: unknown, liste: unknown): string | null {
  const cible = texteComparable(valeur);
  if (!cible || !Array.isArray(liste)) return null;
  const hit = (liste as unknown[]).find((v) => typeof v === "string" && texteComparable(v) === cible);
  return typeof hit === "string" ? hit : null;
}
