// ═══════════════════════════════════════════════════════════════════════════
// « VENDU » SE LIT DU PLUS RÉCEMMENT VENDU AU PLUS ANCIEN (15/10, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// La vue « Vendu » du Stock gardait l'ordre de l'inventaire (création de la
// FICHE, la plus récente d'abord) : les 8 ventes du 13/10 sur la boutique de
// madame (@evat), des fiches importées des semaines plus tôt, tombaient aux
// rangs 61 à 69 — et la vue n'en montre que 10. « Je reçois bien les emails de
// vente, par contre rien dans FillSell. »
// Clé de tri, de la plus vraie à la moins :
//   1. la vente la plus récente de la fiche (ventes.date, le jour de la vente ;
//      à jour égal, l'heure d'enregistrement) ;
//   2. sans ligne de vente (vendus importés du dressing) : inventaire.date si
//      elle existe ;
//   3. sinon l'ordre d'arrivée est gardé (tri stable) — jamais une date inventée.
// Fonction pure : aucune lecture de plus (les ventes sont déjà chargées).

const jourDe = (v) => {
  const t = Date.parse(String(v ?? '').slice(0, 10));
  return Number.isFinite(t) ? t : 0;
};
const instantDe = (v) => {
  const t = Date.parse(String(v ?? ''));
  return Number.isFinite(t) ? t : 0;
};

/** Index { inventaire_id → [jour de vente, instant d'enregistrement] } (la plus récente). */
export function indexVentesParFiche(ventes) {
  const m = new Map();
  for (const s of ventes ?? []) {
    if (s?.inventaire_id == null) continue;
    const cree = instantDe(s.cree_le ?? s.created_at);
    const jour = jourDe(s.date) || jourDe(s.cree_le ?? s.created_at);
    const k = String(s.inventaire_id);
    const cur = m.get(k);
    if (!cur || jour > cur[0] || (jour === cur[0] && cree > cur[1])) m.set(k, [jour, cree]);
  }
  return m;
}

/** Les fiches vendues, de la plus récemment vendue à la plus ancienne (copie triée). */
export function trierParVente(fiches, ventes) {
  const index = indexVentesParFiche(ventes);
  const cle = (i) => index.get(String(i?.id)) ?? [jourDe(i?.date), instantDe(i?.date)];
  return [...(fiches ?? [])].sort((a, b) => {
    const ka = cle(a), kb = cle(b);
    return (kb[0] - ka[0]) || (kb[1] - ka[1]);
  });
}
