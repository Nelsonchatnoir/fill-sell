# Bloc F — changer de formule pendant un essai, compte 13e274de (14/11/2026, heure de Paris)

Demande de Nico (14/11 matin) : un changement de formule pendant un essai a fait sauter le Cloud sans le dire ; règle sur les
3 canaux, audit, cas du compte 13e274de (rien modifié, aucun mail), plus deux compléments (lecture Vinted, champs requis,
connexion Cloud ; écart Beebs). Données de clients : id8 seulement.

## 1. Ce qui s'est passé, et pourquoi le code l'a fait
- 00:39 : essai Pro + Cloud (49,99 €, Klarna), abonnement Stripe en essai jusqu'au 21/11 00:39.
- 01:27:02 : clic « Business » dans la modale de plan (`business_cta_click`, origine modale_plan).
- 01:27:03 : create-checkout-session, bloc « montée in situ » : la cible d'une montée est tout abonnement vivant de rang
  inférieur ; une formule « + Cloud » est classée par son palier ; seul le Cloud SEUL était exclu. L'abonnement EN ESSAI a
  reçu le prix Business (`always_invoice` + `pending_if_incomplete`) : le prorata d'un essai vaut 0 €, donc la mise à jour
  s'appliquait sans paiement ; l'essai continuait ; le prix Pro + Cloud sortait de Stripe. Aucune fenêtre.
- Dans la foulée : crédit du mois Business posé pendant l'essai (`upgrade_monthly_grant`, statut non regardé) ; métadonnée
  `formule` restée « pro_cloud » (le webhook réalignait `formule` puis `plan_type` en deux écritures qui recopiaient chacune
  l'instantané : la 2e remettait ce que la 1re effaçait) ; le mail de la veille (19/11 08:00) aurait dit « Pro + Cloud
  continue à 59,99 €… sur ta carte ».
- Même trou ailleurs : la voie « changement_prix » des formules avec Cloud (« pendant l'essai : sans prorata, l'essai
  continue ») et changer-formule (descente pendant l'essai, sans prorata). Sur iPhone / Android, aucune fenêtre non plus.

## 2. La règle (décision de Nico), livrée
- Web (bec4b6e, fonctions create-checkout-session v85, changer-formule v11, stripe-webhook v84, email-tunnel v98) :
  `supabase/functions/_shared/changement-formule.js`. Sans confirmation rien ne change ; devis EXACT (aperçu de facture,
  essai arrêté) ; la même formule « + Cloud » proposée quand le Cloud se perdrait ; confirmé : `trial_end: "now"`, appliqué
  SEULEMENT si payé (`pending_if_incomplete`) ; refus / 3-D Secure / Klarna à valider → rien ne change, facture ouverte.
  Crédit du mois jamais pendant un essai ; métadonnées clé par clé ; mail de la veille lu sur le prix, muet sans Cloud.
- iPhone / Android : `src/lib/changementFormuleBoutique.js` + `ChangementFormuleBoutique.jsx`, fenêtre AVANT la feuille de
  la boutique (prix lu chez la boutique). Apple impose : montée = immédiate, essai arrêté, prix entier ; descente = à
  l'échéance (fin de l'essai). Google : l'app choisit — pendant l'essai CHARGE_FULL_PRICE (5), jamais WITHOUT_PRORATION ;
  un abonnement Play du groupe toujours remplacé (avant : Pro + Cloud → Pro ouvrait un SECOND abonnement Google).
- Preuves : `selftest:changement-formule-essai` (32/32), `selftest:changement-formule-boutique` (67 rouges avant, 68 verts),
  parcours Stripe en mode TEST `scripts/stripe-test/changement-formule-essai-test.mjs` (8/8 : devis sans confirmation,
  confirmé payé, carte refusée, 3-D Secure).

## 3. Audit (Stripe + base depuis le 08/11, lecture seule)
- SEUL compte touché : 13e274de (Pro + Cloud 49,99 € → Business 59,99 €, 14/11 01:27:03, web mobile, essai gardé, Cloud
  perdu chez Stripe, 0 € prélevé). Les 6 autres « articles changés » sont des renouvellements au même prix ; aucun
  schedule ; Apple : aucun UPGRADE / DID_CHANGE_RENEWAL_PREF ; Google : aucune notification d'abonnement.
- Écartés (pas des changements en place) : 785352fe (2e abonnement, cas connu), cdf7007c (renouvellement coupé sous
  l'ancienne règle), 953c1ca6, cfb5af8b, 25caeedd, 235204f8 (tentatives annulées ou refusées), 5322fa18 (test).

## 4. 13e274de le 21/11 00:39 si rien n'est fait (code relu)
- 19/11 : mail de la veille — avec la règle livrée, il NE PART PLUS (abonnement sans Cloud → `abonnement_sans_cloud`).
- 20/11 dans l'app : feuille de la veille du Cloud SEUL (cloud_formule vide) : « le Cloud passe à 24,99 €/mois… » — faux ;
  son bouton « Arrêter » répond « déjà » (rien à couper chez Stripe).
- 21/11 00:39:22 : fin d'essai Stripe → facture 59,99 € Business seul, prélèvement Klarna hors session (~01:39) ; le webhook
  écrit Business sans Cloud ; Cloud « essai terminé » dès 00:39, `cloud_voie` coupée au cron de 00:40 (tâches rendues à
  l'extension, qu'elle n'a pas — un PC avec l'extension est apparu le 14/11 vers 09:21) ; IP #88422230 (id 78) : 2 jours
  de grâce, repos vers le 23/11, puis purge (navigateur détruit, coffre vidé : sessions Vinted, Leboncoin, Beebs, Depop).
- Klarna refuse : « paiement échoué » Business, past_due, retour en Free.
- Les quotas Business crédités pendant l'essai (ledger 18423, 14/11 01:27:04) restent.
- Action UNIQUE préparée, NON jouée (aucune écriture chez Stripe) : `scripts/reparations/20261114_formule_13e274de.mjs`
  (simulation par défaut ; `--formule=pro_cloud` garde l'essai, 49,99 € le 21/11 ; `--formule=business_cloud --essai=garder`
  ou `--essai=finir` ; sauvegarde + inverse ; vérification `_VERIFIER.sql`). À jouer avant le 19/11 08:00 pour que tout
  (app, mails) dise vrai ; au plus tard le 20/11 23:39 pour garder l'essai.

## 5. Complément 1 (même compte, Cloud, téléphone seul)
- Le canal réel : web mobile pour l'inscription, puis l'APPLI ANDROID (OTA 2.9.188, bundle 1e0be91 : bloc A dedans, bloc C
  non). Ni le canal, ni le navigateur, ni le build ne sont la cause.
- Lecture des descriptions Vinted (5 abandons 02:47 → 04:17) : ce n'était pas une attente d'extension (« poste » = la
  copie Cloud, 253 lectures de fond réussies ; « vinted_sans_extension » = pas d'extension sur CET appareil). Cause : sa
  demande attendait derrière son propre lot de 207 articles (54 + 76 + 68 demandes) ; « Publier » ne relançait pas une
  demande de moins de 15 min. Règle : `lecturePasseDevant` — la personne qui attend passe devant le lot (Vinted, demande
  en attente > 30 s, sans échec). Le bloc C ne couvrait pas ce cas. Verrou `selftest:lecture-devant` (15 rouges → 17/17).
- Champs requis (37 Beebs + 9 eBay) : bloc A bien servi, nouveau stepper. Les 37 Beebs = « Taille » de 16 bijoux : la
  rédaction pose « Unique », hors grille Beebs → ligne bloquante ; la règle « bijou hors bague → Ajustable » ne jouait que
  sur une case VIDE. Règle : `tailleUniqueHorsGrille` (une taille unique hors d'une grille qui n'en a pas rejoue la règle
  du champ vide ; une vraie taille jamais recouverte) — 33 des 37 lignes évitées ; même trou chez 4 autres comptes.
  Les 9 eBay suivent les règles (rien deviné). Les 3 sorties : lots quittés (2 tailles en attente, 1 pendant la préparation).
  Verrou `selftest:taille-unique-bijou` (0/32 → 32/32).
- Connexion Vinted Cloud 00:39 → 01:18 : (a) « remplacée » à 00:45 = DEUX pages FillSell dans le même Edge (2e page ouverte
  pendant la lecture du code, probablement par le bouton du mail de début d'essai) ; règle : une page remplacée hors de la
  vue se met en PAUSE (« Ta connexion continue sur ton autre écran FillSell… », « Continuer ici »), jamais une fin ; même
  empreinte chez d0ac0538 le 10/11. (b) « caché » à 00:58 / 00:59 : pas une traduction — Firefox Android en « version pour
  ordinateur » ; le contrôle visait le centre d'une fenêtre plus grande que la couche ; règle : contrôle sur la partie
  visible, encart « version pour ordinateur », translate="no" partout. Verrous `selftest:cloud-connexion-meme-appareil`
  (14 rouges → 36/36) et `selftest:cloud-connexion-affichage` (22 rouges → 37/37).

## 6. Complément 2 (Beebs)
- Les « 79 annonces importées » = 79 PUBLICATIONS importées, dont 77 sur les 6 mêmes annonces (réimportées 11 à 14 fois) ;
  les 66 retraits portent sur 9 annonces. « Mes annonces » (0/0) était VRAIE : les 9 pages publiques sont en 404, témoins
  en 200. Cause : l'index public de Beebs garde 6 fantômes (datés du 26/05/2025), et le relevé faisait entrer « en ligne »
  tout ce que seul l'index porte, même quand « Mes annonces » était lue en entier → fiches → suppression par la personne →
  retrait « déjà hors ligne » (vrai) → réimport. Qui a lancé les 66 retraits : la personne, fiche par fiche dans l'app
  (79 suppressions 02:14 → 05:59). Aucune annonce encore en ligne marquée retirée. Autres comptes : seulement 13e274de
  touché ; fantômes possibles sans retrait chez ebdf29f0 et d71db658.
- Règle (extension 0.6.189) : une annonce que seul l'index porte n'entre « en ligne » que si « Mes annonces » est tronquée
  ou illisible ; lue en entier, c'est un fantôme (nommé dans le run, jamais importé). Un « 0/0 » ne prouve jamais seul
  « déjà hors ligne » : il faut aussi la page de l'annonce (404 sans fiche, ou épuisée). Verrou `selftest:beebs-index-fantome`.
- 13e274de : rien touché ; ses 6 fiches fantômes ont été réimportées à 07:16 (« en ligne » chez nous, 404 chez Beebs).

## 7. Incident de méthode
- La pile `git stash` est commune à tous les worktrees : deux agents ont échangé leurs travaux (récupérés par leur SHA,
  rien perdu). Règle : jamais `git stash` dans un worktree.
