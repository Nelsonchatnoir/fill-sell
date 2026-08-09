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

// ── Liste blanche (2026-08-09) ───────────────────────────────────────────────
// Deux comptes voient l'offre AVANT tout le monde, pour éprouver le parcours de
// paiement RÉEL (produit Stripe FillSell Business créé le même jour). Le
// drapeau ci-dessus reste à `false` : c'est bien le parc entier qui est masqué,
// et ces deux id qui font exception — pas l'inverse.
// ⚠️ Ce sont des id de PROD : un achat depuis ces comptes est un vrai débit,
// pas un test. Sur iOS, l'IAP Business étant encore en review, ces comptes
// verront quand même un CTA mort — l'exception est utile sur le WEB (Stripe) et
// sur Android (produit déjà activé).
// À supprimer le jour où BUSINESS_OFFER_ENABLED passe à `true` : la liste
// devient alors sans effet, mais elle resterait un piège pour la lecture.
export const BUSINESS_OFFER_ALLOWLIST = [
  'f44b5917-bccc-4431-ba41-f40571a2ed18', // Nico
  'f8aa02a5-23cb-4325-bba8-127f61a75741', // Ornella
];

// LE point de décision — plus aucune lecture directe du drapeau côté UI.
// userId absent (modale montée avant que la session soit lue, appelant sans
// contexte) → on retombe sur le drapeau, donc masqué : l'absence d'id ne doit
// JAMAIS ouvrir l'offre.
export const businessOfferVisible = (userId) =>
  BUSINESS_OFFER_ENABLED || BUSINESS_OFFER_ALLOWLIST.includes(userId);
