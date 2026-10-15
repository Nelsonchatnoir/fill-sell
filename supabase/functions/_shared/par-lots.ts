// ═══════════════════════════════════════════════════════════════════════════
// UN `.in()` DE MASSE SE LIT PAR LOTS (15/10, P3 — linda.sidhoum)
// ═══════════════════════════════════════════════════════════════════════════
// linda a lancé une republication en lot de 781 annonces Vinted le 13/10 : à
// chaque appel, get-pending-jobs lisait les fiches de TOUTE la file en un seul
// `.in("id", ids)` (~782 identifiants). La lecture tombait (en-têtes de réponse
// trop longs : PostgREST renvoie la requête dans Content-Location), la garde de
// boutique concluait « lecture non fiable » et retenait TOUT — 784 opérations,
// toutes plateformes, dont la remise en ligne de sa « Table noire » Leboncoin,
// retirée le 13/10 à 16:57 et restée hors ligne. Les autres lectures de masse
// du même appel tombaient en silence (data null = « rien trouvé »), éteignant
// leurs gardes sans le dire.
// Même règle que l'app (src/utils/parLots.js, 11/10) : 400 identifiants au plus
// par requête, lus l'un après l'autre ; un lot en erreur rend l'erreur (jamais
// une liste partielle prise pour la vérité).

export const TAILLE_LOT_IN = 400;

/** Découpe une liste en lots de `n` (sans doublon, sans valeur vide). */
export function decouperEnLots(ids: ReadonlyArray<unknown> | null | undefined, n: number = TAILLE_LOT_IN): unknown[][] {
  const uniques = [...new Set((ids ?? []).filter((x) => x !== null && x !== undefined && x !== ''))];
  const lots: unknown[][] = [];
  for (let i = 0; i < uniques.length; i += n) lots.push(uniques.slice(i, i + n));
  return lots;
}

/**
 * Lit par lots : `fabrique(lot)` rend la requête Supabase d'UN lot (thenable
 * { data, error }). Rend { data: [...toutes les lignes], error: null }, ou
 * { data: null, error } au premier lot en erreur.
 */
// deno-lint-ignore no-explicit-any
type Lignes = any[];
export async function lireParLots(
  // deno-lint-ignore no-explicit-any
  fabrique: (lot: any[]) => PromiseLike<{ data: unknown; error: unknown }>,
  ids: ReadonlyArray<unknown> | null | undefined,
  n: number = TAILLE_LOT_IN,
  // deno-lint-ignore no-explicit-any
): Promise<{ data: Lignes | null; error: any }> {
  const lots = decouperEnLots(ids, n);
  const data: Lignes = [];
  for (const lot of lots) {
    const { data: d, error } = await fabrique(lot);
    if (error) return { data: null, error };
    if (Array.isArray(d)) data.push(...d);
  }
  return { data, error: null };
}
