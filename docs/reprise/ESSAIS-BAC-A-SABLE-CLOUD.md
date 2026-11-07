# FillSell Cloud — essais en bac à sable + preuves en réel (préparé le 07/11/2026, à lancer APRÈS la soumission)

Un seul passage, ~30 min, sur le téléphone de Nico. Nico fait les gestes du téléphone (paiement bac à sable, mots de
passe : jamais Claude) ; Claude relit tout côté serveur, étape par étape, et dit « suivant ». Aucun vrai utilisateur
touché : les deux comptes de relecture des stores (témoins Cloud depuis le 06/11 : `beta_flags.cloud = true`, dans
`COMPTES_AUTORISES` de cloud-2) et les comptes de plateforme de Nico (ou d'Ornella). Annonce de test : 999 € ou plus.

| Compte | Où | Sert à |
|---|---|---|
| relecture Apple `d6a9e726…` | iPhone, TestFlight 2.9.164 | iOS : Cloud seul, essai 7 j, restauration, arrêt |
| relecture Google `953c1ca6…` | Android, piste interne vc35 | Android : la même chose |

Prérequis (Claude les relit avant de dire « go ») : build 2.9.164 dans TestFlight et vc35 en piste interne ; le compte
Google de Nico « testeur de licence » (Play Console › Paramètres › Test des licences) ; l'offre Cloud fermée au public
(`cloud_offre_ouverte` absente) ; validate-apple-receipt v40 (restauration du Cloud, déployée le 07/11).

## A. iOS (compte de relecture Apple)
1. Nico : TestFlight › FillSell 2.9.164 › Ouvrir ; se connecter avec le compte de relecture Apple.
2. Nico : Réglages › FillSell Cloud › « Free + FillSell Cloud » › accepter les conditions › feuille d'achat (bac à sable,
   rien de facturé) › confirmer. Attendu à l'écran : « Cloud actif ».
   Claude relit : `profiles` (is_cloud, cloud_canal = apple, cloud_essai_debut/fin = 7 j), une IP attribuée
   (`cloud_ips`), le compteur de places descendu de 1, cloud-2 qui ouvre un 2e navigateur (journal `planificateur` :
   comptes 2) → **preuves « paiement → place → IP → navigateur » et « 2 comptes en même temps »** (Nico + le test).
3. Nico : « Me connecter » › FillSell (le compte de relecture), puis Vinted ET Leboncoin (comptes de Nico ou d'Ornella).
   Claude relit : `cloud_coffre` connecté pour les trois.
4. Nico : créer une annonce de test (« Test FillSell Cloud — ne pas acheter », 999 €) en IMPORTANT une annonce Vinted
   (photos hébergées chez Vinted), puis la publier sur Leboncoin.
   Claude relit : le job publié par le navigateur Cloud, l'annonce en ligne, ses photos présentes → **preuves « 1re
   publication » et « photos Vinted → Leboncoin » (correctif 0.6.177)**.
5. Nico : sur la fiche, « Retirer » de Leboncoin. Claude relit : le retrait exécuté par le Cloud (même chemin que le
   retrait après vente) ; l'annonce hors ligne.
6. Nico : supprimer l'app, la réinstaller depuis TestFlight, se reconnecter, Réglages › « Restaurer mes achats ».
   Attendu : « FillSell Cloud restauré : il est actif. » Claude relit le journal de validate-apple-receipt (mode
   « cloud ») et que la formule du profil n'a pas bougé.
7. Nico : Réglages iOS › Apple ID › Abonnements (bac à sable) › FillSell Cloud › Annuler.
   Claude relit : apple-iap-webhook reçu, `cloud_arret_fin_periode` posé, l'option reste jusqu'à la fin de période.

## B. Android (compte de relecture Google) — mêmes étapes 1 à 7
Piste interne vc35 ; feuille Google Play (testeur de licence : « carte de test, toujours approuvée ») ; restauration
= Réglages › « Restaurer mes achats » (validate-google-purchase du produit Cloud) ; arrêt = Play Store › Paiements et
abonnements › FillSell Cloud › Résilier (google-play-webhook).

## C. Détection d'une vente et retrait après vente (une VRAIE vente, aucune autre façon)
Une vente ne se simule pas. Deux voies, au choix de Nico :
- attendre la prochaine vente réelle de Nico (son compte tourne sur cloud-2) — Claude relit la vente relevée par la
  copie Cloud (`ventes.source`) et les retraits sur les autres plateformes ;
- ou Ornella achète un petit article de Nico (vraie transaction) — même relecture.

## D. Nettoyage (Claude, puis relu)
Annonce de test retirée partout ; les abonnements bac à sable s'arrêtent seuls ; les deux comptes de relecture
gardés témoins (les relecteurs des stores en ont besoin) ; leurs IP rendues au pool à la fin de la période
(`cloud_ip_liberer`), relu.
