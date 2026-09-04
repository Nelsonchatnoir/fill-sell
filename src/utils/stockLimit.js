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

// ── STOCK ILLIMITÉ POUR TOUS (2026-09-04, décision Nico) ─────────────────────
// La garde serveur est TOMBÉE : check_inventory_limit ne compte plus rien et
// ne lève plus LIMIT_REACHED (migration 20260904120100, appliquée et vérifiée
// en prod — le trigger enforce_inventory_limit reste attaché, la fonction fait
// RETURN NEW). Le produit annonçait un stock illimité à plusieurs endroits ;
// c'est désormais vrai.
//
// ⚠️ Le serveur seul ne suffisait PAS : la limite était aussi tenue par le
// client, à cinq endroits qui REFUSAIENT réellement (les quatre gardes d'ajout
// d'App.jsx, qui lèvent « Limite gratuite atteinte », et `inventoryFull` de
// ListingPreviewScreen, qui remplace l'écran de publication). Sans cet
// interrupteur, la migration n'aurait rien changé pour l'utilisateur.
//
// UN SEUL point de décision, ici. Retour arrière = STOCK_ILLIMITE à false, et
// tout redevient exactement ce qu'il était (les limites et l'assiette de
// comptage sont conservées intactes au-dessus) — à faire en même temps que le
// retour arrière SQL, jamais l'un sans l'autre.
export const STOCK_ILLIMITE = true;

/** Le quota d'articles est-il atteint ? Toujours faux tant que le stock est
 *  illimité. `limite` non finie (config illisible) = pas de refus : on ne
 *  bloque jamais un ajout sur une lecture ratée. */
export function quotaStockAtteint(compte, limite) {
  if (STOCK_ILLIMITE) return false;
  return Number.isFinite(limite) && Number.isFinite(compte) && compte >= limite;
}
