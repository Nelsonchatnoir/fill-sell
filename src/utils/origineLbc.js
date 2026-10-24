// ═══════════════════════════════════════════════════════════════════════════
// D'OÙ VIENT UNE VALEUR LEBONCOIN POSÉE PAR L'APP (24/10/2026 nuit, décision 3 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Insert Zombicide de louis : Leboncoin avait déduit « Jeux de société » du titre, l'IA de l'app a posé « Loisirs
// créatifs » et l'extension l'a écrit par-dessus. RÈGLE : une valeur devinée par l'IA n'écrase jamais un pré-rempli
// précis de Leboncoin. L'app marque chaque valeur d'une passe IA (platform_fields.lbcAspectsOrigine[clé] = « ia » ;
// « dedie:<champ> » pour un champ dédié comme lbcProduit) ; toute autre écriture (la personne, le texte du vendeur,
// la mémoire du rayon) efface la marque — sa valeur fait foi. L'extension (leboncoin.js, fillCriterionSafe, 0.6.141)
// garde alors le pré-rempli de Leboncoin. Pur : testé par scripts/lot-2410-soir-selftest.mjs.

/** La table d'origines après l'écriture de `cle` : « ia » la marque, toute autre origine l'efface. */
export function origineLbcApres(origine, cle, valeur) {
  const base = origine && typeof origine === "object" ? origine : {};
  if (valeur === "ia") return base[cle] === "ia" ? base : { ...base, [cle]: "ia" };
  if (!(cle in base)) return origine && typeof origine === "object" ? origine : undefined;
  const reste = { ...base };
  delete reste[cle];
  return Object.keys(reste).length ? reste : undefined;
}
