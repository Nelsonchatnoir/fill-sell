// Prix DEMANDÉ sur l'annonce Vinted, par vinted_item_id (dernier relevé de
// vinted_listing_snapshots) — pour l'effet `prixAnnonces` du Stock.
// (11/10) Lu par LOTS de 400 identifiants, une requête à la fois : un seul
// `.in()` de plus de ~1 100 identifiants dépasse ce que la passerelle accepte
// (mesuré le 11/10 : 1 100 → 200, 1 150 → connexion coupée, 2 000 → 400), et
// TOUT le relevé tombait. Or l'inventaire est désormais lu en entier (jusqu'à
// 3 434 fiches, 18 comptes au-delà de 1 000). Chaque lot rend ses 1 000
// relevés les plus récents : au moins le dernier de chacun de ses articles.
// Rend { id: prix | null } pour CHAQUE id demandé ; un lot en erreur laisse
// ses articles à null (« pas de prix d'annonce », comme avant), jamais 0.
export async function lirePrixAnnoncesVinted(supabase, userId, ids, { lot = 400 } = {}) {
  const prix = {};
  for (const id of ids) prix[id] = null;
  for (let k = 0; k < ids.length; k += lot) {
    const { data, error } = await supabase.from('vinted_listing_snapshots')
      .select('vinted_item_id,price')
      .eq('user_id', userId).in('vinted_item_id', ids.slice(k, k + lot))
      .order('captured_at', { ascending: false }).limit(1000);
    if (error) continue;
    // Trié du plus récent au plus ancien : le premier vu est le prix courant.
    for (const r of data ?? []) if (prix[r.vinted_item_id] == null) prix[r.vinted_item_id] = r.price;
  }
  return prix;
}
