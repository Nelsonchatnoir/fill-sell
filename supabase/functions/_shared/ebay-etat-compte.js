// ═══════════════════════════════════════════════════════════════════════════
// eBAY — L'ÉTAT DU COMPTE : UNE SEULE RÈGLE, POUR TOUS LES ÉCRANS ET LE SERVEUR
// (17/10/2026, compte de Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Le 17/10, la carte du Stock disait « il reste 2 étapes, à commencer par
// comment tu es payé » (politiques RETENUES pour FillSell), Réglages › Compte
// eBay disait « eBay est prêt, tes articles peuvent partir » (lignes du relevé :
// une politique EXISTE chez eBay, retenue ou non) — et eBay plafonnait le
// compte à 0 article / 0 €, ce que personne ne lisait. Trois règles, deux
// sources, un vendeur qui ne sait plus quoi croire.
//
// Ce module est désormais LA règle. L'app (carte du Stock, stepper, lot,
// Réglages › Compte eBay) et le serveur (_shared/ebay-voie.ts → ebay-api-worker,
// handler-watch, ebay-account) l'appellent ; personne ne redécide dans son coin.
// Module PUR : aucun import, aucun appel, aucune API de navigateur.
//
// Entrée : la vue publique etatPublic (app, action 'statut' d'ebay-account) OU
// la ligne ebay_accounts (serveur : revoked_at, *_policy_id, seller_state).
//
// ⛔ « prêt » = relié, au moins une étape lue, AUCUNE étape « manque », ET un
//    plafond de vente eBay qui n'est pas nul. Quantité 0 OU montant 0 : eBay
//    n'autorise pas ce compte à vendre, il n'est JAMAIS prêt, quoi qu'on ait
//    réglé chez nous. Un plafond non lu (inscription vendeur pas finie, compte
//    jamais relevé) ne prouve rien : il ne bloque pas, l'étape qui manque le dit.
// ⛔ Une politique compte pour faite quand elle est RETENUE pour FillSell —
//    c'est la seule que porte l'offre — et qu'eBay ne dit pas que le compte
//    n'en a plus aucune de ce type. En avoir chez eBay sans en retenir une ne
//    publie rien : elle est « à choisir » (aChoisir), pas « faite ».
// ═══════════════════════════════════════════════════════════════════════════

// L'ORDRE D'eBAY : une politique ne se crée pas avant l'activation des
// conditions de vente, et rien ne se publie avant l'inscription vendeur.
export const ETAPES_EBAY = [
  'inscription_vendeur',
  'politiques_activees',
  'politique_livraison',
  'politique_paiement',
  'politique_retours',
  'lieu_expedition',
];

// [étape, clé de etatPublic.politiques, colonne de ebay_accounts, compteur de seller_state.politiques]
const POLITIQUES = [
  ['politique_livraison', 'fulfillment', 'fulfillment_policy_id', 'livraison'],
  ['politique_paiement', 'payment', 'payment_policy_id', 'paiement'],
  ['politique_retours', 'return', 'return_policy_id', 'retours'],
];

const nombre = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Le plafond de vente eBay (privilege.sellingLimit, relevé par ebay-account),
 * tel qu'eBay le rend : { quantity, amount: { value, currency } }.
 * @returns {{ quantite: number|null, montant: number|null, devise: string|null, nul: boolean } | null}
 *          null = pas lu (on ne conclut rien).
 */
export function plafondEbay(sellingLimit) {
  if (!sellingLimit || typeof sellingLimit !== 'object') return null;
  const quantite = nombre(sellingLimit.quantity);
  const montant = nombre(sellingLimit.amount?.value);
  if (quantite === null && montant === null) return null;
  return { quantite, montant, devise: sellingLimit.amount?.currency ?? null, nul: quantite === 0 || montant === 0 };
}

/**
 * L'état du compte eBay relié par l'API — LE verdict, partout.
 * @returns {{
 *   statut: 'non_relie' | 'a_reconnecter' | 'inconnu' | 'a_finir' | 'bloque_par_ebay' | 'pret',
 *   pret: boolean,
 *   etapes: Record<string, 'ok' | 'manque' | 'inconnu'>,
 *   manquantes: string[],   // dans l'ordre d'eBay
 *   aChoisir: string[],     // politiques qui EXISTENT chez eBay sans être retenues : à choisir dans FillSell
 *   plafond: { quantite: number|null, montant: number|null, devise: string|null, nul: boolean } | null,
 * }}
 */
export function etatCompteEbay(entree) {
  const base = { pret: false, etapes: {}, manquantes: [], aChoisir: [], plafond: null };
  if (!entree || typeof entree !== 'object') return { ...base, statut: 'non_relie' };
  // La ligne ebay_accounts porte ses colonnes ; la vue publique porte connecte / politiques.
  const ligne = 'return_policy_id' in entree || 'revoked_at' in entree;
  if (ligne ? entree.revoked_at != null : entree.connecte !== true) {
    return { ...base, statut: ligne || entree.a_reconnecter === true ? 'a_reconnecter' : 'non_relie' };
  }
  const ss = entree.seller_state && typeof entree.seller_state === 'object' ? entree.seller_state : null;
  const tri = (v) => (v === true ? 'ok' : v === false ? 'manque' : 'inconnu');
  const etapes = {
    inscription_vendeur: tri(ss?.inscription_vendeur),
    politiques_activees: tri(ss?.politiques_activees),
  };
  const aChoisir = [];
  for (const [cle, vue, colonne, compteur] of POLITIQUES) {
    const retenue = String((ligne ? entree[colonne] : entree.politiques?.[vue]) ?? '').trim() !== '';
    const chezEbay = nombre(ss?.politiques?.[compteur]); // combien le compte en a chez eBay (null = pas lu)
    // Rien de relevé : on ne conclut rien, même d'une politique retenue.
    if (!ss) etapes[cle] = 'inconnu';
    else if (retenue && chezEbay !== 0) etapes[cle] = 'ok';
    else {
      etapes[cle] = 'manque';
      // Elles existent chez eBay : à CHOISIR ici, pas à créer chez eBay.
      if (!retenue && chezEbay > 0) aChoisir.push(cle);
    }
  }
  etapes.lieu_expedition = tri(ss?.lieu_expedition);
  const manquantes = ETAPES_EBAY.filter((c) => etapes[c] === 'manque');
  const lues = ETAPES_EBAY.filter((c) => etapes[c] !== 'inconnu').length;
  const plafond = plafondEbay(ss?.selling_limit);
  const statut = !ss || lues === 0 ? 'inconnu'
    : plafond?.nul ? 'bloque_par_ebay'
      : manquantes.length ? 'a_finir'
        : 'pret';
  return { statut, pret: statut === 'pret', etapes, manquantes, aChoisir, plafond };
}
