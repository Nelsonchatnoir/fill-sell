// ═══════════════════════════════════════════════════════════════════════════
// RECONNAÎTRE LA PAGE D'INSCRIPTION VENDEUR eBAY (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// Au clic « Mettre en vente », eBay détourne vers son inscription vendeur les
// comptes qui n'ont jamais été activés pour vendre. Le job meurt alors avec une
// erreur technique quelconque (canal coupé, formulaire non atteint) : la SEULE
// trace qui nomme la vraie cause est l'ADRESSE DE LA PAGE, relevée par
// l'extension dans platform_fields.work_window_state.at_end.tab_url.
//
// Ce module ne fait qu'une chose : dire si une adresse est ce mur-là. Il vit à
// part parce qu'il décide, à lui seul, qu'on ARRÊTE les reprises automatiques
// d'un job et qu'on écrit à la personne — et parce qu'un test le verrouille
// (scripts/ebay-page-vendeur-selftest.ts).
//
// ⛔ LE DOMAINE SE VÉRIFIE PAR LA FIN, JAMAIS PAR « CONTIENT ». `hostname` est
//    rendu par URL(), donc déjà normalisé : on ancre sur la fin pour qu'un
//    onboardweb.ebay.fr.exemple.com ne passe pas.
// ⛔ CE QUI N'EST PAS DANS CETTE LISTE (décidé le 21/09, à trancher à part) :
//    · signin.ebay.* — un mur de CONNEXION, déjà nommé « REAUTH VENTE » par
//      l'extension, avec son propre message juste ;
//    · /verifyidentity, /sh/acc/verification, /accountsettings/regulatory —
//      la vérification d'IDENTITÉ (KYC), cause différente, message différent
//      (cf. lienVerificationEbay, src/utils/shared.js) ;
//    · /lstng/error — la page d'erreur générique de mise en vente : un mauvais
//      categoryId y mène tout autant qu'un compte non vendeur. On ne peut pas
//      en déduire la cause, donc on n'en déduit rien.

/** L'adresse est-elle une page d'inscription / d'activation VENDEUR eBay ? */
export function estPageInscriptionVendeurEbay(u: unknown): boolean {
  if (typeof u !== "string" || !u) return false;
  try {
    const url = new URL(u);
    const h = url.hostname.toLowerCase();
    const p = url.pathname.toLowerCase();
    // Domaine eBay, toutes extensions (.fr, .com, .co.uk…).
    if (!/(^|\.)ebay\.[a-z]{2,3}(\.[a-z]{2,3})?$/.test(h)) return false;
    // L'inscription vendeur a ses PROPRES hôtes : tout ce qui y est servi est
    // le mur, quel que soit le chemin. onboardweb.ebay.fr est celui relevé en
    // prod (job 7678a1ed, 21/09) ; reg.ebay.* est l'hôte d'inscription eBay.
    if (/^(onboardweb|reg)\./.test(h)) return true;
    // Et ses chemins sur le domaine principal.
    return /^\/(sellerregistration|sell\/onboarding|sl\/reg)(\/|$)/.test(p);
  } catch {
    // Pas une URL : pas une page d'inscription vendeur.
    return false;
  }
}
