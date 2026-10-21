// ═══════════════════════════════════════════════════════════════════════════
// LES COPIES DES FICHES JUMELLES (20/10, Louis — comptes reliés)
// ═══════════════════════════════════════════════════════════════════════════
// Deux comptes RELIÉS (comptes_lies, décision de Nico du 18/10) qui publient sur
// la MÊME boutique d'une plateforme (Leboncoin chez Louis) : une fiche coupée en
// deux (fiches_liees_comptes) porte sa copie Leboncoin chez UN seul des deux
// comptes. Chez l'autre, la fiche disait « pas publiée » sur Leboncoin — et
// 170 dépôts sont partis en doublon les 19-20/10 (55 refusés, 40 en ligne deux
// fois). La RPC copies_fiches_jumelles() (migration 20261020210000) rend, pour
// MES fiches, la plateforme que la jumelle occupe dans la boutique partagée.
// Ici : l'index par fiche, et ce que l'app en lit — la plateforme est OCCUPÉE
// (jamais proposée à « Publier », ni dans un lot, logo atténué sur la carte),
// sans jamais devenir un job de ce compte : aucun retrait, aucune republication,
// aucune vente ne part d'ici (l'annonce appartient au compte relié, qui la suit).
// Un compte sans fiche jumelle reçoit une liste vide : rien ne change pour lui.

/** Lignes de la RPC → Map(String(inventaire_id) → [{ platform, listing_id, url, statut }]). */
export function indexCopiesJumelles(rows) {
  const index = new Map();
  if (!Array.isArray(rows)) return index;
  for (const r of rows) {
    if (!r || r.inventaire_id == null || !r.platform) continue;
    const cle = String(r.inventaire_id);
    const liste = index.get(cle) ?? [];
    if (!liste.some((c) => c.platform === r.platform)) {
      liste.push({ platform: String(r.platform), listing_id: r.listing_id ?? null, url: r.url ?? null, statut: r.statut ?? null });
    }
    index.set(cle, liste);
  }
  return index;
}

/** L'article avec ses copies jumelles — le MÊME objet quand il n'en a pas. */
export function avecCopiesJumelles(item, index) {
  if (!item || !(index instanceof Map) || index.size === 0) return item;
  const copies = index.get(String(item.id));
  return copies?.length ? { ...item, copies_jumelles: copies } : item;
}

/** Les plateformes occupées par la fiche jumelle de cet article (jamais Vinted). */
export function plateformesJumelles(item) {
  const copies = Array.isArray(item?.copies_jumelles) ? item.copies_jumelles : [];
  return [...new Set(copies.map((c) => c?.platform).filter((p) => typeof p === "string" && p && p !== "vinted"))];
}
