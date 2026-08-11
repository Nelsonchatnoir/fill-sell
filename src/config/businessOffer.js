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
// ── OUVERTE LE 2026-08-11 (GO explicite de Nico) ────────────────────────────
// Le drapeau passe à `true`. L'écart Play ci-dessous a été signalé AVANT le
// changement et assumé : Nico a répondu « ouvre partout quand même », en
// connaissant le risque, le temps de corriger Play.
//
// ⚠️ RISQUE OUVERT, NON REFERMÉ — Irlande et Italie sont à 74,99 € sur Play
// (relevé du 10/08 au soir, non revérifié depuis) alors que ConversionModal
// affiche « 59,99 € » EN DUR. Un Irlandais ou un Italien qui achète sur
// Android paie donc 25 € de plus que ce qu'on vient de lui écrire. Ça se
// referme en éditant les deux pays dans Play Console (gestes plus bas), pas
// en touchant ce fichier.
//
// POUR REFERMER L'OFFRE : repasser ce drapeau à `false`. Une ligne.
//
// ── RELEVÉ RÉEL DU 2026-08-10 AU SOIR (conservé — c'est la source du risque) ─
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
// Ce qui restait à faire — 1 seul point encore OUVERT (l'offre est ouverte
// sans lui, cf. GO du 11/08) :
//   1. ⚠️ TOUJOURS À FAIRE — Play : ré-aligner Irlande et Italie à 59,99 €
//      (édition PAYS PAR PAYS,
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
export const BUSINESS_OFFER_ENABLED = true;

// La liste blanche des deux comptes témoins (Nico, Ornella) est SUPPRIMÉE le
// 2026-08-11, comme prévu à l'ouverture : le drapeau étant à `true`, elle
// n'avait plus aucun effet et ne serait plus qu'un piège de lecture.
// Elle n'était exportée nulle part ailleurs (vérifié) — rien à recâbler.

// LE point de décision — plus aucune lecture directe du drapeau côté UI.
// La signature garde son paramètre `userId` : les 3 appelants (App,
// ConversionModal, PlanDetailsModal) le passent déjà, et c'est ce qui
// permettra de refermer l'offre sur une exception sans les retoucher.
// eslint-disable-next-line no-unused-vars
export const businessOfferVisible = (userId) => BUSINESS_OFFER_ENABLED;
