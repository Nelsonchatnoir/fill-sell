// ── Drapeau UNIQUE de mise en vente du palier Business (2026-08-09) ──────────
//
// Business est intégré de bout en bout (serveur : flags cumulatifs, grant 3000,
// 5 edge functions, 6 RPC ; client : achat IAP, chemin Stripe web, modale,
// badge). Il ne doit pourtant PAS être PROPOSÉ tant qu'Apple n'a pas approuvé
// app.fillsell.business.sub : sur iOS, purchaseProduct sur un produit encore en
// review répond « produit introuvable » — un CTA qui échoue systématiquement,
// vu par tout le parc iOS.
//
// Ce drapeau masque donc l'OFFRE (carte de la modale de conversion, upsell de
// « mon plan », court-circuit de checkout) sur TOUTES les plateformes à la fois
// — web comprise : proposer Business au web pendant que l'app mobile ne peut
// pas le vendre créerait deux discours de prix pour un même produit.
//
// Il ne masque RIEN de ce qui concerne les abonnés Business DÉJÀ actifs : le
// badge Business, la résolution du nom de palier (is_business testé avant
// is_pro), le récap « ton plan actuel » et la restauration d'achat restent
// actifs en permanence. Un compte promu à la main aujourd'hui se voit donc
// correctement comme Business, sans que l'offre soit vendable.
//
// À passer à `true` — et rien d'autre à toucher — le jour où Apple approuve
// l'abonnement. Le produit Google (business-monthly) est déjà activé, le prix
// aligné à 59,99 € sur toute la zone euro.
export const BUSINESS_OFFER_ENABLED = false;
