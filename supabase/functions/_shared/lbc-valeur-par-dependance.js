// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN : UN CHAMP EXIGÉ QUE L'ANNONCE EN LIGNE NE PORTE PAS, LU DANS LA STRUCTURE DE LEBONCOIN (21/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Lot de Nico, point 3 — Butin d'Or (contact.butindor), 21/11 08:54 « Table à langer étagère ikea » et 09:36 « Chause
// haute balancelle 2 en 1 lionello » : republications mises en pause AVANT tout retrait, « Leboncoin exige « Univers » ».
// Relu : leurs annonces en ligne n'ont AUCUN Univers (attributs relevés : produit, marque, couleur, état… — publiées
// avant que Leboncoin l'exige). Rien à reprendre pour ce champ : il se DÉDUIT des autres valeurs de l'annonce, par la
// structure même de Leboncoin — ses listes dépendantes (la liste « Produit » change avec l'« Univers ») relevées à
// chaque dépôt (lbc_grilles_relevees.contexte). « Table à langer » n'existe que sous « Hygiène et Santé » : c'est son
// Univers, lu chez Leboncoin, jamais deviné.
// RÈGLE (pure) : pour la clé manquante K, chaque valeur connue v d'un autre champ P de l'annonce désigne les valeurs U
// de K sous lesquelles la liste relevée de P contient v. Une seule U, la même pour toutes les valeurs connues qui en
// désignent une → U. Plusieurs, aucune, ou une U hors des valeurs permises de K → null (la question, comme avant).
// ⛔ « Autre »/« Autres » ne désigne jamais rien (il est sous chaque univers).

const net = (v) => String(v ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
const libelleDe = (o) => net(typeof o === "string" ? o : (o?.label ?? o?.value ?? ""));
const NEUTRE = /^autres?$/i;

/**
 * @param {{ cle: string, aspects: Record<string, unknown>, releves: Array<{ field_key?: unknown, contexte?: unknown, options?: unknown }>,
 *   valeursPermises?: unknown[] | null }} p
 * @returns {null | { valeur: string, preuve: string }}
 */
export function valeurParDependance({ cle, aspects, releves, valeursPermises = null }) {
  const K = net(cle);
  if (!K) return null;
  // Pour chaque champ P : valeur de K (contexte) → l'union des options de P lues sous cette valeur.
  const parChamp = new Map();
  for (const r of Array.isArray(releves) ? releves : []) {
    const P = net(r?.field_key);
    const ctx = r?.contexte && typeof r.contexte === "object" ? r.contexte : null;
    const u = ctx ? net(ctx[K]) : "";
    if (!P || P === K || !u || !Array.isArray(r?.options)) continue;
    const m = parChamp.get(P) ?? new Map();
    const s = m.get(u) ?? new Set();
    for (const o of r.options) { const l = libelleDe(o); if (l) s.add(l); }
    m.set(u, s);
    parChamp.set(P, m);
  }
  const permises = Array.isArray(valeursPermises) && valeursPermises.length ? new Set(valeursPermises.map(libelleDe)) : null;
  let retenue = null;
  const preuves = [];
  for (const [P, m] of parChamp) {
    const v = net(aspects?.[P]);
    if (!v || NEUTRE.test(v)) continue;
    const sous = [...m.entries()].filter(([, s]) => s.has(v)).map(([u]) => u);
    if (sous.length !== 1) { if (sous.length > 1) return null; continue; }
    if (retenue && retenue !== sous[0]) return null;   // deux valeurs de l'annonce qui se contredisent : rien
    retenue = sous[0];
    preuves.push(`« ${P} » = « ${v} » n'existe que sous « ${K} » = « ${sous[0]} » (listes relevées : ${m.size} valeurs de ${K})`);
  }
  if (!retenue || (permises && !permises.has(retenue))) return null;
  return { valeur: retenue, preuve: preuves.join(" ; ") };
}
