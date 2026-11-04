// ═══════════════════════════════════════════════════════════════════════════
// « MODIFIER SUR eBAY » : CE QUI A CHANGÉ (04/11, point 3 — décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Pur : lu par src/stock/ModifierAnnonceEbay.jsx et par selftest:ebay-modifier-tout. Une caractéristique n'est
// envoyée à eBay que si sa saisie diffère de ce qu'eBay porte ; une saisie vide la retire.
// Les valeurs d'une caractéristique, telles que la personne les a écrites (virgule = plusieurs, si eBay l'accepte).
export function valeursSaisies(texte, multiple) {
  const t = String(texte ?? '').trim();
  if (!t) return [];
  return multiple ? [...new Set(t.split(',').map((x) => x.trim()).filter(Boolean))] : [t];
}

// Les caractéristiques changées (nom → valeurs ; [] = retirée) entre ce qu'eBay porte et ce qui est saisi.
export function aspectsChanges(avant, saisies, catalogue) {
  const out = {};
  const noms = new Set([...Object.keys(avant ?? {}), ...Object.keys(saisies ?? {})]);
  for (const nom of noms) {
    if (!(nom in (saisies ?? {}))) continue;
    // Pas touchée (même texte qu'à l'ouverture) : jamais envoyée, même si eBay y porte plusieurs valeurs.
    if (String(saisies[nom] ?? '').trim() === (avant?.[nom] ?? []).map(String).join(', ').trim()) continue;
    const a = (catalogue ?? []).find((c) => c.name === nom);
    const multiple = a?.cardinality === 'MULTI';
    const v = valeursSaisies(saisies[nom], multiple);
    const prec = (avant?.[nom] ?? []).map(String);
    if (JSON.stringify(v) !== JSON.stringify(prec)) out[nom] = v;
  }
  return out;
}
