// ═══════════════════════════════════════════════════════════════════════════
// LA BOUTIQUE VINTED : « 245 en vente · 11 vendues encore affichées » (13/11, étape 5 du lot « zéro problème », bloc 6)
// ═══════════════════════════════════════════════════════════════════════════
// Le relevé du dressing lit TOUT ce que Vinted affiche, vendues comprises (447d920c, relevé du 11/11 20:29 : 256 lus =
// 245 « active » + 11 « sold », le chiffre de Vinted lui-même). Le texte « 245 en vente · 11 vendues encore affichées »
// existait (05/11, point 6 c) mais seulement sur la ligne Vinted montée CACHÉE du bloc de synchro : visible nulle part.
// Feu vert de Nico (13/11) : la ligne est rendue visible (stock/BlocSynchro.jsx) — même texte, même source.
// LA GARDE (jamais une valeur inventée) : le compte « en vente » se recompte sur les instantanés dont l'heure tombe dans
// la fenêtre du relevé ; or un relevé plus tardif le même jour réécrit l'instantané de l'article (un par article et par
// jour) et le sort de la fenêtre. Mesuré le 13/11 : 23 relevés sur 60 (24 h) n'ont plus tous leurs instantanés dans leur
// fenêtre (447d920c, 11/11 13:15 : 9 « en vente » pour 256 lus). Le compte n'est donc rendu QUE si la fenêtre porte
// exactement les articles lus (tous statuts = items_vus) ; sinon null → « 256 articles lus », jamais un faux « en vente ».
// Pur (aucun DOM, aucune requête) : scripts/vendues-encore-affichees-selftest.mjs.

/** Le compte « en vente » d'un relevé, s'il est fiable : actifs si la fenêtre porte tous les articles lus, sinon null. */
export function enVenteFiable({ actifs, tous, vus } = {}) {
  const a = Number(actifs), t = Number(tous), v = Number(vus);
  if (actifs == null || !Number.isFinite(a) || a < 0) return null;
  if (!Number.isFinite(v) || v <= 0) return null;
  if (tous == null || !Number.isFinite(t) || t !== v || a > v) return null;
  return a;
}

/** « 245 en vente · 11 vendues encore affichées » ; sans compte fiable : « 256 articles lus ». */
export function compteBoutiqueVinted({ vus, enVente } = {}, lang = 'fr') {
  const fr = lang !== 'en';
  const lus = Number(vus ?? 0);
  const ev = Number.isFinite(enVente) ? enVente : null;
  const vendues = ev != null && lus > ev ? lus - ev : 0;
  if (ev != null) {
    return fr
      ? `${ev} en vente${vendues ? ` · ${vendues} vendue${vendues > 1 ? 's' : ''} encore affichée${vendues > 1 ? 's' : ''}` : ''}`
      : `${ev} for sale${vendues ? ` · ${vendues} sold still shown` : ''}`;
  }
  return fr ? `${lus} article${lus > 1 ? 's' : ''} lu${lus > 1 ? 's' : ''}` : `${lus} item${lus > 1 ? 's' : ''} read`;
}

/**
 * La ligne VISIBLE du bloc de synchro (dernier relevé réussi du dressing, hors veille : lireDernierRunVinted) — seulement
 * quand Vinted affiche encore des vendues et que le compte est fiable : « 245 en vente · 11 vendues encore affichées par
 * Vinted ». null sinon (rien à expliquer, ou rien de sûr à dire).
 */
export function ligneVenduesAffichees(runVinted, lang = 'fr') {
  const fr = lang !== 'en';
  const vus = Number(runVinted?.items_vus);
  const ev = Number.isFinite(runVinted?.en_vente) ? runVinted.en_vente : null;
  if (!Number.isFinite(vus) || ev == null || vus <= ev) return null;
  return `${compteBoutiqueVinted({ vus, enVente: ev }, lang)} ${fr ? 'par Vinted' : 'by Vinted'}`;
}
