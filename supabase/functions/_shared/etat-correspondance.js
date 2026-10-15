// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT D'UN ARTICLE D'UNE GRILLE À L'AUTRE (15/10 soir, Louis — Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas : republication Leboncoin « Sac targus pour ordinateur portable »
// (150c7da9, 13/10 13:09) arrêtée sur « État » alors que l'annonce en ligne
// disait « État satisfaisant » et la fiche aussi : la grille du rayon
// (Électronique) nomme ce niveau « État satisfaisant - fonctionnel ».
// RÈGLE : l'état vient d'abord de l'annonce capturée, puis de la fiche, puis
// des autres plateformes de l'article, traduit dans la grille DEMANDÉE par une
// table de correspondance ; on ne demande que si aucune source ne se traduit.
// ⛔ Jamais une valeur inventée : un niveau qui n'existe pas dans la grille
//    (« Neuf » sans dire « avec / sans étiquette » face à une grille qui les
//    sépare) ne se devine pas — la source suivante, sinon la question.
// Pur (Deno + Node) : scripts/etat-correspondance-selftest.mjs.

const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

// Le niveau commun, depuis le libellé d'UNE plateforme (Vinted, Leboncoin,
// Beebs, eBay, Depop — libellés français et anglais de Depop).
const NIVEAUX = [
  ['neuf_etiquette', /^(neuf avec etiquettes?|new with tags|brand new with tags)$/],
  ['neuf_sans_etiquette', /^(neuf sans etiquettes?|new without tags)$/],
  ['neuf', /^(etat neuf|neuf|brand new|new)$/],
  ['tres_bon', /^(tres bon etat|comme neuf|like new|used - excellent|excellent etat|excellent)$/],
  ['bon', /^(bon etat|used - good|good)$/],
  ['satisfaisant', /^(etat satisfaisant( - fonctionnel)?|satisfaisant|etat correct|correct|used - fair|fair|etat d'usage)$/],
  ['pieces', /^(pour pieces( detachees)?|pour pieces ou non fonctionnel|for parts( or not working)?)$/],
];
export function niveauEtat(valeur) {
  const v = norm(valeur);
  if (!v) return null;
  for (const [niveau, re] of NIVEAUX) if (re.test(v)) return niveau;
  return null;
}

// Pour chaque niveau, les libellés acceptés dans une grille, dans l'ordre.
const CIBLES = {
  neuf_etiquette: ['neuf avec etiquette', 'neuf avec etiquettes', 'new with tags'],
  neuf_sans_etiquette: ['neuf sans etiquette', 'neuf sans etiquettes', 'new without tags'],
  neuf: ['etat neuf', 'neuf', 'brand new', 'new'],
  tres_bon: ['tres bon etat', 'comme neuf', 'like new', 'used - excellent'],
  bon: ['bon etat', 'used - good'],
  satisfaisant: ['etat satisfaisant', 'satisfaisant', 'etat satisfaisant - fonctionnel', 'etat correct', 'correct', 'used - fair'],
  pieces: ['pour pieces', 'pour pieces detachees', 'pour pieces ou non fonctionnel', 'for parts or not working'],
};

/**
 * Le libellé EXACT de la grille pour ce niveau, ou null.
 * « Neuf avec / sans étiquette » → « État neuf » seulement si la grille ne
 * sépare pas les deux ; « État neuf » → jamais « avec / sans étiquette ».
 */
export function etatDansGrille(niveau, grille) {
  const liste = (Array.isArray(grille) ? grille : []).map(String);
  if (!niveau || !liste.length) return null;
  const parNorm = new Map(liste.map((g) => [norm(g), g]));
  const trouver = (cles) => { for (const c of cles) if (parNorm.has(c)) return parNorm.get(c); return null; };
  const direct = trouver(CIBLES[niveau] ?? []);
  if (direct) return direct;
  if (niveau === 'neuf_etiquette' || niveau === 'neuf_sans_etiquette') {
    const separe = trouver(CIBLES.neuf_etiquette) || trouver(CIBLES.neuf_sans_etiquette);
    return separe ? null : trouver(CIBLES.neuf);
  }
  return null;
}

/**
 * sources : [{ source: 'annonce'|'fiche'|'autre_plateforme', valeur, plateforme? }] DANS L'ORDRE.
 * → { valeur, source, brut, niveau } pour la première source qui se traduit, sinon null.
 */
export function etatDepuisSources(sources, grille) {
  for (const s of sources ?? []) {
    const niveau = niveauEtat(s?.valeur);
    if (!niveau) continue;
    const valeur = etatDansGrille(niveau, grille);
    if (valeur) return { valeur, source: s.source, brut: String(s.valeur), niveau, plateforme: s.plateforme ?? null };
  }
  return null;
}

/** La question posée porte-t-elle sur l'ÉTAT ? (needsUserField) */
export function estQuestionEtat(f) {
  if (!f || typeof f !== 'object') return false;
  const k = String(f.field_key ?? '');
  const l = norm(f.field_label);
  return /(^|_)condition$/i.test(k) || k === 'etat' || l === 'etat' || l === "etat de l'article" || l === 'condition';
}

/** Les valeurs d'état lisibles dans les platform_fields d'un job (autre plateforme de l'article). */
export function etatsDuJob(pf) {
  const p = pf && typeof pf === 'object' ? pf : {};
  const out = [];
  const pousser = (v) => { if (typeof v === 'string' && v.trim()) out.push(v.trim()); };
  pousser(p.etat);
  for (const racine of ['lbcAspects', 'vintedAspects', 'beebsAspects', 'depopAspects', 'ebayAspects']) {
    const a = p[racine];
    if (a && typeof a === 'object') { pousser(a.condition); pousser(a.clothing_condition); pousser(a['État']); pousser(a.etat); }
  }
  pousser(p?.champs_lus_sur_l_annonce?.lus?.etat);
  return out;
}
