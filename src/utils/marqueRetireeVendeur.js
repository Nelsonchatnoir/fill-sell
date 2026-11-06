// ═══════════════════════════════════════════════════════════════════════════
// « À RÉGLER » : LA MARQUE QUE TU AS ÉCRITE A ÉTÉ RETIRÉE À LA PUBLICATION (06/11 soir, décision de Nico — Louis, « SEB »)
// ═══════════════════════════════════════════════════════════════════════════
// Un article « pour / compatible / adapté à » une marque ne part jamais avec cette marque (serveur :
// supabase/functions/_shared/marque-compatible.js, trace platform_fields.marque_compatible_retiree). Quand c'est la
// personne elle-même qui l'a écrite sur sa fiche (par_le_vendeur), on le lui dit clairement : une ligne dans
// « À régler » par article, qui ouvre sa fiche — son texte n'est jamais touché. La ligne disparaît dès que la fiche ne
// porte plus cette marque. Pur (Node + navigateur) : scripts/marque-compatible-selftest.mjs.

const egales = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/**
 * Les articles dont la marque écrite par la personne a été retirée à la publication, et qui la portent encore.
 * @param {{ items: Array<Record<string, any>>, jobsByInventaire: Record<string, Array<Record<string, any>>> }} p
 * @returns {Array<{ inventaireId: string, titre: string, marque: string, plateformes: string[] }>}
 */
export function articlesMarqueRetireeParLeVendeur({ items, jobsByInventaire }) {
  const sortie = [];
  for (const item of items ?? []) {
    if (!item || item.statut === "vendu") continue;
    const jobs = jobsByInventaire?.[item.id] ?? jobsByInventaire?.[String(item.id)] ?? [];
    const traces = jobs.filter((j) => ["publish", "republish"].includes(String(j?.action ?? "publish"))
      && j?.platform_fields?.marque_compatible_retiree?.par_le_vendeur === true);
    if (!traces.length) continue;
    const marque = String(traces[0].platform_fields.marque_compatible_retiree.marque ?? "");
    if (!marque || !egales(item.marque, marque)) continue;
    sortie.push({ inventaireId: String(item.id), titre: String(item.title ?? item.titre ?? ""), marque,
      plateformes: [...new Set(traces.map((j) => String(j.platform ?? "")).filter(Boolean))] });
  }
  return sortie;
}

const NOMS = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay", depop: "Depop", opla: "Opla" };

/** Le texte de la ligne « À régler » d'un article. */
export function ligneMarqueRetiree(a, lang = "fr") {
  const pf = (a.plateformes ?? []).map((p) => NOMS[p] ?? p).join(", ");
  if (lang === "en") {
    return { titre: a.titre || "Item",
      detail: `Brand « ${a.marque} » removed when listing${pf ? ` (${pf})` : ""}: your item fits this brand, it isn't one of its products — platforms refuse a brand that isn't the product's. Your text is unchanged; edit your item if needed.` };
  }
  return { titre: a.titre || "Article",
    detail: `Marque « ${a.marque} » retirée à la publication${pf ? ` (${pf})` : ""} : ton article s'adapte à cette marque, ce n'est pas un de ses produits — les plateformes refusent une marque qui n'est pas celle du produit. Ton texte n'est pas touché ; corrige ta fiche si besoin.` };
}
