// ── Drapeau UNIQUE de l'option « Sans ordinateur » (FillSell Cloud) — 04/10/2026 ──
//
// CONCEPTION, NON LIVRÉE. Sur le modèle de businessOffer.js : UNE constante,
// UN point de décision, et plus aucune lecture directe du drapeau côté UI.
//
// Tant qu'il est à `false`, RIEN ne change pour personne, même si la branche
// était fusionnée par erreur :
//   · la feuille des formules (ConversionModal) n'affiche aucun interrupteur
//     et appelle `onUpgrade(tier)` EXACTEMENT comme avant (un seul argument) ;
//   · ni l'étape « extension » du parcours d'entrée, ni le mur « installe
//     l'extension », ni Réglages › Abonnement ne montrent la voie Cloud ;
//   · aucune lecture des colonnes Cloud n'est tentée (useCloudProfil ne part
//     pas) — elles n'existent pas encore en base.
//
// ⛔ AVANT DE PASSER À `true` — les cinq conditions, toutes, le même jour :
//   1. la migration des colonnes (profiles.is_cloud, cloud_essai_debut,
//      cloud_essai_fin, cloud_essai_arrete, cloud_periode_fin,
//      cloud_arret_fin_periode) et `cloud_etat()` APPLIQUÉES et inscrites ;
//   2. les produits de paiement de l'option créés et alignés à 20 € sur les
//      TROIS canaux (Stripe, Apple, Google) — le prix est affiché en dur
//      (CLOUD_PRIX_AFFICHE, utils/palier.js), comme PLAN_PRICES ;
//   3. l'hôte (App.jsx) lit le 2e argument d'`onUpgrade(tier, { cloud })` et
//      ouvre l'essai / ajoute l'option au paiement, et sait prendre l'option
//      SEULE sur un compte Free (`onCloudSeul`, décision du 04/10 soir) —
//      essai de 7 jours, carte demandée ;
//   4. la SORTIE existe : « Arrêter l'option » est câblée (HoteCloud reçoit
//      `actions.arreter`) — on ne vend pas un essai qu'on ne sait pas arrêter.
//      scripts/cloud-ecrans-selftest.mjs refuse le drapeau levé sans elle ;
//   5. le navigateur Cloud tourne vraiment (pool d'adresses, docs/cloud/).
export const CLOUD_OFFER_ENABLED = false;

// LE point de décision. Le paramètre `userId` est gardé (même signature que
// businessOfferVisible) : c'est lui qui permettra d'ouvrir l'option à une
// liste de comptes témoins sans retoucher les appelants.
// eslint-disable-next-line no-unused-vars
export const cloudOfferVisible = (userId) => CLOUD_OFFER_ENABLED;
