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

// (05/10) Les textes légaux de l'option (CGV article 7, CGU 3.9, confidentialité
// 4.7 et 4.8 — src/cloud/textesLegaux.js) : publiés sur /legal AVEC l'offre, le
// même jour, par ce seul interrupteur. Page publique, sans compte : jamais
// ouverts aux seuls témoins (règle du 15/09 : un service non ouvert ne
// s'annonce pas). À lever seul, plus tôt, uniquement si la revue Apple l'exige.
export const CLOUD_TEXTES_LEGAUX = CLOUD_OFFER_ENABLED;

// (05/10) Comptes TÉMOINS de l'OFFRE (paiement compris) avant l'ouverture : le
// compte de démonstration remis à la revue Apple (le premier abonnement d'un
// groupe se soumet avec une version de l'app, le relecteur doit pouvoir
// l'acheter), et Nico pour un achat d'essai réel. VIDE = personne.
// (05/10, décision de Nico : écran B du test, DANS l'app) Nico SEUL — aucun
// autre compte ne voit rien, ni à l'écran ni dans le comportement
// (scripts/cloud/preuve-identite-compte-ordinaire.mjs le prouve avant l'OTA).
export const NICO_USER_ID = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
export const CLOUD_OFFRE_TEMOINS = Object.freeze([NICO_USER_ID]);

// LE point de décision. Le paramètre `userId` est gardé (même signature que
// businessOfferVisible) : c'est lui qui ouvre l'option aux comptes témoins
// sans retoucher les appelants.
export const cloudOfferVisible = (userId) => CLOUD_OFFER_ENABLED || (userId != null && CLOUD_OFFRE_TEMOINS.includes(userId));

// ── L'écran « Me connecter » (05/10) ──────────────────────────────────────
// Le serveur qui ouvre la page de connexion dans le navigateur Cloud du compte
// (orchestrateur, serveur-cloud/, derrière Caddy).
export const CLOUD_DOMAINE = 'cloud.fillsell.app';
// Les plateformes proposées : SEULEMENT celles prouvées en réel depuis le Cloud.
// (Une plateforme qui bloque le Cloud n'est jamais promise : elle s'ajoute ici
// après son test réel, sur décision de Nico.) eBay a sa propre ligne (API).
export const CLOUD_PLATEFORMES_CONNEXION = Object.freeze([
  Object.freeze({ id: 'vinted', nom: 'Vinted' }),
  Object.freeze({ id: 'leboncoin', nom: 'Leboncoin' }),
]);
// Comptes TÉMOINS du test réel : l'écran « Me connecter » et la lecture de
// l'état Cloud leur sont ouverts même drapeau baissé — l'OFFRE (paiement)
// reste fermée. VIDE = personne : rien ne change pour aucun compte.
// (05/10) Nico SEUL, pour le test réel (écran B).
export const CLOUD_TEMOINS = Object.freeze([NICO_USER_ID]);
export const cloudConnexionVisible = (userId) => cloudOfferVisible(userId) || (userId != null && CLOUD_TEMOINS.includes(userId));
