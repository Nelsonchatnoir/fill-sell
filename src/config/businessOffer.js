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
// ⛔ NE PAS passer à `true` EN L'ÉTAT — RELEVÉ RÉEL DU 2026-08-10 AU SOIR ────
// La version d'origine de ce bloc disait « Le produit Google (business-monthly)
// est déjà activé, le prix aligné à 59,99 € sur toute la zone euro ». La
// première moitié est vraie, la seconde est FAUSSE, et c'est celle qui compte.
// Relevé dans Play Console (forfait de base business-monthly, Actif, 174
// pays/régions) :
//     France    69,99 EUR → CORRIGÉE À 59,99 € le 10/08 au soir (GO de Nico),
//               commit vérifié après rechargement de la page
//     Irlande   74,99 EUR   ← TOUJOURS FAUX
//     Italie    74,99 EUR   ← TOUJOURS FAUX
//     Allemagne, Autriche, Belgique, Espagne, Estonie, Finlande, Grèce,
//     Croatie, Luxembourg, Pays-Bas, Portugal, Slovaquie, Slovénie : 59,99 EUR
// Or l'app affiche « 59,99 € » EN DUR pour tout le monde (ConversionModal).
// Un Irlandais ou un Italien sur Android paierait donc 74,99 € après avoir lu
// 59,99 €. C'est le piège documenté du « Set prices » global, qui regonfle
// chaque pays de sa TVA locale : France avait été re-éditée à la main le 08/08,
// un passage global l'avait re-gonflée depuis — d'où la re-correction du 10/08.
//
// Conditions pour lever ce drapeau, dans cet ordre :
//   1. Play : ré-aligner Irlande et Italie à 59,99 € (édition PAYS PAR PAYS,
//      icône crayon sur la ligne, « Enregistrer » de la modale = STAGING, puis
//      « Enregistrer les modifications » en bas de page = commit réel). Après
//      chaque passage global « Set prices », TOUT est à revérifier ;
//   2. Apple : RIEN à faire — confirmé OK par Nico le 10/08. Son test iOS de
//      23:12 (usage_logs checkout_open tier=business canal=apple) a ouvert la
//      feuille de paiement à 59,99 €, ce qu'un produit encore en review ne fait
//      pas (purchaseProduct répondrait « produit introuvable »). Non revérifié
//      dans ASC : la console exige une connexion, jamais faite en automatisation ;
//   3. Stripe : RIEN à faire — vérifié le 10/08 sur le dashboard live
//      (prod_V2buKBNOudO9nk actif, price_1U2Wh0QZRA77vrWJyWLOy6iB « FillSell
//      Business Mensuel », 59,99 € EUR mensuel récurrent, tarif par défaut,
//      0 abonnement). Le secret STRIPE_PRICE_BUSINESS porte bien CE price id
//      (sha256 du secret == sha256 de l'id, comparé le 10/08).
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
