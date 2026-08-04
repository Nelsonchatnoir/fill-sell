// ── Limite d'inventaire du plan gratuit — miroirs CLIENT ─────────────────────
// La VRAIE limite vit côté serveur : coin_config.free_stock_limit, lue par le
// trigger check_inventory_limit (migration 20260805040000) — modifiable par
// simple UPDATE de config, sans migration. Tout ce fichier n'est que du
// MIROIR d'affichage :
//  · FREE_STOCK_LIMIT_FALLBACK doit suivre la valeur de config à chaque
//    changement (le stepper, lui, lit la config en direct et n'a ce fallback
//    que pour le premier rendu / un réseau muet) ;
//  · compteArticlesQuota applique la MÊME assiette que le serveur : articles
//    non vendus, HORS dressing Vinted synchronisé (origine='vinted_sync',
//    exclu de l'insert ET du comptage depuis 20260803190000). Avant ce
//    fichier, Dashboard et gardes vocales comptaient le dressing dans le
//    quota — un Free avec 190 articles synchronisés voyait « limite
//    atteinte » alors que le serveur l'aurait laissé faire.
export const FREE_STOCK_LIMIT_FALLBACK = 200;

export function compteArticlesQuota(items) {
  return (items ?? []).filter(i => i?.statut !== 'vendu' && i?.origine !== 'vinted_sync').length;
}
