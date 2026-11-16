# Lot du 16/11 après-midi — les paiements d'abord (rapport)

Ordre de Nico (16/11, ~14:00) : l'essai Cloud doit marcher sur iPhone, Android et web, PROUVÉ ; Nico ne fait rien.
Heure de Paris partout.

## Tableau

| Essai Cloud | Code | Prouvé sur un appareil / une page |
|---|---|---|
| Android | corrigé à la racine (binaire vc39, l'offre « semaine gratuite » choisie) | NON — voir § 1 |
| iPhone | rien à corriger trouvé de plus (2.9.202-203 : case, décision b, trace vraie) | NON — voir § 2 |
| Web (Stripe) | page de l'essai livrée à 13:17 (texte, icône, Google Pay) | NON — voir § 4 |

## 1. Essai Cloud — Android

**Cause (une phrase).** Le module d'achat (@capgo/native-purchases 8.3.3) envoyait à Google la PREMIÈRE offre du
forfait de base ; Google rend l'offre de base ET la semaine gratuite (quand le compte y a droit), dans un ordre non garanti :
la feuille pouvait montrer le plein prix juste après « 0 € aujourd'hui ».

**Preuve de la cause, en base.** ahlamnajjari34 (8464ceb2, inscrite le 16/11 00:18, aucun abonnement Google avant :
0 notification de Google, son seul achat Premium annulé à 00:22) : la carte lui annonçait l'essai (`essai: true`, donc
Google listait l'offre gratuite pour son compte) ; conditions acceptées à 12:34:39 et 12:37:34, « annule » à 12:34:42 et
12:37:37 (3 s). Play Console (relu 14:2x) : `premium-cloud-trial-7d` (et `pro.cloud`, `cloud.sub` : 1 offre chacun),
« Essai gratuit 7 jours », 175 pays, actif ; **éligibilité : « N'ont jamais eu d'abonnement » dans l'app** (pas
« jamais eu cet abonnement ») — un ancien abonné FillSell de Google n'a jamais la semaine (l'app le dit alors avant la
feuille : « … payé dès aujourd'hui : continuer ? »).

**Ce qui a changé.**
- `patches/@capgo+native-purchases+8.3.3.patch` (binaire) : `offerChoice` « essai » = l'offre éligible dont la 1re phase est
  gratuite ; absente → rejet `FILLSELL_ESSAI_ABSENT`, la feuille ne s'ouvre pas ; « base » = l'offre de base ; sans choix
  (vieux bundle) : comme avant. L'offre envoyée revient avec la réponse (succès et rejet).
- `src/lib/iap.js`, `src/cloud/achatFormuleCloud.js`, `src/cloud/achatCloud.js` : l'app nomme l'offre (semaine attendue →
  « essai », abonnement Play remplacé ou pas de semaine → « base ») ; `FILLSELL_ESSAI_ABSENT` → « Google Play ne te propose
  plus la semaine gratuite : rien n'a été payé. Si tu réessaies, … sera payé dès aujourd'hui. » ; la trace
  `formule_cloud_issue` garde `offre_demandee`, `essai_google`, `offre_google`.
- Suivi des installations venues de la pub : module `InstallReferrerPlugin.java` (patch du 14/11 posé), borne
  `PLAY_REFERRER_BINAIRE_MIN = '2.9.205'`, phrase de la politique de confidentialité (Legal.jsx, FR + EN). Sans la
  migration 20261114100000 (non appliquée, pas de feu vert), la campagne arrive quand même (repli à 7 paramètres).
- Binaire **2.9.205 / versionCode 39**.
- Verrou : `selftest:android-offre-essai` (23 contrôles ; rouge sur 3c53a85 : patch et iap.js sans offerChoice) ;
  `selftest:acquisition-meta` mis à la nouvelle règle (borne = le binaire qui porte le module).

## 2. Essai Cloud — iPhone

**L'état réel des offres, lu par l'API App Store Connect (16/11 ~14:30, Issuer ID donné par Nico, clé `DYF87JYZ89`).**
- App 6762152785. Groupe « FillSell Plan » (22045363) : premium.sub, premium.standard, pro.sub, pro2.sub, business.sub,
  premium.cloud, pro.cloud, business.cloud — tous APPROVED, mensuels. Groupe « FillSell Cloud » (22440194) : cloud.sub.
- Offres d'introduction : **premium.cloud et pro.cloud : FREE_TRIAL, ONE_WEEK, 1 période, 175 territoires (France,
  Belgique, Suisse, États-Unis, Royaume-Uni compris), depuis le 11/11, sans date de fin** ; cloud.sub : idem depuis le 05/11 ;
  business.cloud : aucune (décision du 11/11). L'offre n'est donc pas en cause.
- Éligibilité d'Apple : par identifiant Apple, sur tout le GROUPE « FillSell Plan » — un identifiant qui a déjà été abonné à
  UNE formule FillSell (même Premium seule) ou qui a déjà eu une offre d'introduction dans ce groupe n'a plus la semaine.
  L'app le lit déjà avant la feuille (historique StoreKit du téléphone, règle du 13/11) et le dit en une phrase.
- Testeurs sandbox du compte (3) : l'un d'eux (`Nicotest2@…`) a **« interrompre les achats » ACTIVÉ** : avec lui, chaque
  achat sandbox est interrompu par Apple (une feuille de conditions en plus, l'app voit une annulation). Les deux autres
  (`nicotest@fillsell.app`, `nicosvob@tester.com`) sont normaux. Rien modifié.

**Essai sandbox sur un iPhone : impossible.** Aucun iPhone ni simulateur iOS sur ce PC Windows ; je ne tape jamais le mot de
passe d'un identifiant Apple (règle fixe).

**La cause des « annule » de rachidafarhi54.** Ses 5 tentatives datent de la 2.9.199 (09:02 → 09:23), avant la trace vraie
(2.9.202, 12:35) : leur cause exacte ne se lit pas. Établi : la case des conditions s'ouvrait derrière le parcours (corrigé
12:35), et l'essai FillSell lui était PERMIS. Depuis 12:35 : aucune nouvelle tentative iPhone en base (relu 14:1x) ; la
prochaine dira le code de StoreKit, la durée de la feuille et la semaine lue par l'app. Si Apple refuse la semaine (déjà
abonné une fois dans le groupe « FillSell Plan »), l'app le dit déjà AVANT la feuille, en une phrase
(`sansSemaineBoutique`, lu dans l'historique StoreKit du téléphone, règle du 13/11) — jamais une semaine payée sans service
(décision b, 12:35).

## 3. Onboarding mobile

Impossible à parcourir moi-même : ni iPhone, ni Android (aucun émulateur avec un compte Google sur ce PC), et je ne me
connecte pas à fillsell.app avec un mot de passe. Couvert par les verrous de code : `achat-formule-issue-vraie`
(case au-dessus du parcours, écran démonté), `onboarding-trois-jauges`, `android-offre-essai`.

## 4. Web (Stripe)

Impossible de faire l'essai de bout en bout moi-même : l'app n'a pas de mode test Stripe branché (create-checkout-session
tourne en clés réelles), et taper une carte (même de test) sur une page réelle ou me connecter à fillsell.app m'est
interdit. Aucune page Stripe d'essai ouverte depuis le déploiement de 13:17 (API Stripe relue 14:1x : 0 session).
Ce qu'il faudrait : un environnement de test (fonction de paiement en clés de test sur une base de test).

## 5. Suppression groupée (Marc, thecloset72000)

**Cause (une phrase).** Les retraits Beebs ne sont pas bloqués : ils sont lents, parce qu'un passage de la file réserve 100
tâches que l'extension fait d'affilée (cycle 1 : 11:44 → 13:28, 104 min) et qu'un retrait Beebs demande deux passages
(au 1er, l'annonce est encore dans « Mes annonces » au bout de 2 min ; la preuve ne vient qu'au cycle suivant).

**Preuve en base (lue 13:55 → 14:15, lecture seule).** Les 138 retraits Beebs ont été créés 11:42 → 12:05 et tentés dès
11:46:34 (« aucun retrait tenté » était faux) ; 25 envois 11:46 → 13:24, tous vérifiés « retirées » 13:30 → 13:50. État
13:57 : 26 retirées, 3 envoyées en vérification, 1 en cours, 2 « Beebs l'examine encore », ≈107 pas commencées ; 0 échec,
0 question, 0 refus anti-robot. Autres : Vinted 255/284 (29 retenues par la garde de boutique, sans message), Leboncoin
30/134, Depop 24/68, eBay 274. Chaque 1er passage Beebs coûte ≈2 min 35 s (10 à 16 s ailleurs). Sans changement, tout
Beebs est retiré vers 21:00-21:30 si son ordinateur reste allumé. Rien à réparer.
Détail : rapport du sous-agent (requêtes et fichiers:lignes) repris en annexe `annexe-p5.md`.

**Ce qui a changé (affichage, pour tous).** La suppression groupée marque ses retraits de son lot
(`platform_fields.lot_suppression`, App.jsx) ; `src/utils/avancementRetraits.js` (règle pure + lecture bornée : 72 h,
action delete, colonnes minimales, pages de 1 000, 5 au plus ; doublons annulés jamais comptés ; deux lots à moins de
30 min = une suppression ; sans marque, la fenêtre de la suppression journalisée) ; « Ta file » (FileDesJobs.jsx) montre
« Retraits en cours » par plateforme (relu toutes les 60 s, onglet visible seulement, `relectureBornee`) ; la fin de la
suppression groupée propose « Suivre les retraits ». Ce que Marc lirait (base lue 14:25) : « Beebs : 26 retirées · 10 en
vérification · 1 en examen chez Beebs · 101 en file · Leboncoin : 37 retirées · 97 en file · Depop : 29 retirées · 39 en
file · Vinted : 270 retirées · 14 à toi de jouer · eBay : 274 retirées ». Aucune durée promise.
Verrou : `selftest:retraits-lot-avancement` (55 contrôles ; rouge avant : 7 échecs).

**Ce qui reste (décision de Nico).** Accélérer vraiment les retraits : F1 (serveur : quand des retraits sont en file, un
cycle ne porte que ce qui tient en ≈15 min, vérifications d'abord ; effet : un retrait Beebs prouvé 5 à 20 min après
l'envoi au lieu de 1 h 45 à 6 h ; plus de passages de la file → CPU à mesurer avant la prod) ; F2 (extension : une seule
relecture de « Mes annonces » Beebs juste après l'envoi, ≈2 min gagnées par retrait). Les 29 Vinted retenus par la garde de
boutique : ils sont « à toi de jouer » dans le nouveau bloc.

## 6. Plateforme vide reliée (lizzaa)

**Cause (une phrase).** Un relevé fini à 0 annonce ne disait rien, alors que « Synchroniser » LIT les annonces sans les
copier : lizzaa (Beebs et Leboncoin relevés à 0, 214 articles en ligne sur Vinted et 55 sur eBay) a cru copier son stock.

**Ce qui a changé.** `src/stock/plateformeVide.js` : une plateforme est vide si son relevé est fini à 0 annonce, sans
annonce connue ni article occupé dessus, avec du stock en ligne ailleurs. À la fin de « Synchroniser » et sous les pastilles
(BlocSynchro.jsx) : « Ton Beebs est vide : Synchroniser relit tes annonces, il ne les copie pas. » + « Publier ton stock sur
Beebs » → la sélection « Publier » avec les articles pas encore sur Beebs, puis le lot avec Beebs cochée (StockTab.jsx,
aucune prop neuve au Stock). FR + EN. Verrou : `selftest:plateforme-vide` (22 contrôles ; rouge avant : 10 échecs).
**Reste.** Rien dans Réglages › Mes plateformes (il faudrait un canal App → Stock).

## 7. ayadi007 — remplacer le compte Leboncoin (feu vert de Nico)

**Cause (une phrase).** Aucun « compte suivi » par plateforme : les annonces d'un ancien compte bloqué restaient « en
ligne » chez nous, et depuis 12:44 son ordinateur lisait leurs pages publiques (410/404) → des questions « Vendue ? »
ouvertes à tort (un « Oui » aurait retiré ses copies Vinted).

**Ce qui a changé (pour tous).** Migration `20261116200000_comptes_plateforme_remplacer` (banc jetable vert : 123
contrôles sur le schéma de prod complet ; inverse à l'octet) : table `comptes_plateforme_suivi` (un compte suivi par
plateforme), trace `comptes_plateforme_remplacements`, colonne `annonces_plateforme.compte_quitte_le` ; RPC
`compte_plateforme_a_confirmer()` et `remplacer_compte_plateforme(platform, compte, simuler)` ; 4 fonctions de prod
réécrites depuis leur définition de prod avec garde md5 (`annonce_non_prouvee_vivante`, `constater_absences_releve`,
`veille_recentes_ouvrir`, `cross_post_jobs_alerte_tenue` : une page hors ligne d'une annonce d'un compte quitté n'ouvre
plus jamais « Vendue ? »). Remplacer = les annonces de l'ancien compte closes (`disparu_le` + `compte_quitte_le`, jamais
« retirées », jamais une vente, aucune fiche touchée), leurs tâches closes « Ancien compte Leboncoin quitté le 16/11, ce
n'est pas une vente : FillSell ne suit plus cette annonce et n'a rien retiré. ». L'écran : « À régler » → « Ton ordinateur
est connecté à un autre compte Leboncoin » → « Voir ce qui change » (simulation) → « Oui, suivre ce compte » / « Non, garder
l'ancien » (src/stock/ChangementCompte.jsx, src/utils/changementCompte.js), FR + EN.
Verrou : `selftest:comptes-plateforme-remplacer` (59 contrôles ; rouge avant : 41).

**En prod.** Migration appliquée 15:2x (md5 après : 6a378166 brut / bf79cd09 sans CR, 16abc7aa, e9202262, 94f419b6),
`migration repair` fait ; amorce : 123 clients, un compte suivi chacun (les clients à deux comptes ont la question).
`scripts/reparations/20261116_ayadi_remplacer_compte_lbc.sql` joué 15:22 (simulation puis geste gardé, sauvegarde et
inverse) : ancien compte bf460991 « quitté », nouveau 23b59b14 « suivi » ; **108 annonces closes, 90 tâches closes dont
35 questions « Vendue ? »**.

**Reste.** 91 tâches de l'ancien compte, sur des annonces DÉJÀ disparues avant le remplacement, portent encore le
signal « indisponible » (analyse en cours, § 7 bis). Ses 3 objets vendus ailleurs (Costume, Dashcam, Lampe) : clos chez
nous, mais FillSell ne peut pas les retirer de Leboncoin (plus aucune session sur le compte bloqué ; un retrait partirait
sur son Mac, connecté au nouveau compte) — compte bloqué = annonces déjà inachetables ; sinon, lui seul peut les retirer.

## 8. Extension 0.6.192

**(1) Historique complet des ventes Beebs.** Cause : le lecteur gardait 5 commandes, et une commande sans tâche FillSell
ne devenait jamais une vente. Changé : messagerie.js (toutes les commandes terminées, 500 au plus, sans requête de plus) ;
background.js (import par paquets de 100, après une lecture réussie, jamais de minuteur) ; migration
`20261116170000_ventes_beebs_historique` (feu vert de Nico ; banc jetable vert 28 contrôles) : `ventes_beebs_historique_noter`
— commandes terminées de plus de 48 h, jamais une commande déjà suivie, jamais deux fois, vente supprimée jamais recréée,
fiche par numéro exact seulement, silence total. Relevé : la session Beebs de Nico est fermée (aucun mot de passe tapé) —
la pagination se lira dans les bilans de la 0.6.192. Verrou `selftest:ventes-beebs-historique` (17 ; rouge avant : 15).
**(2) Le 403 anti-robot Beebs** : déjà dans le code depuis la 0.6.187 (lecture « comme une page », pause après un refus),
vérifié, part avec la 0.6.192.
**(3) eBay — refus automatique des offres coupé dans le brouillon.** Relevé sur un brouillon de test à 999 € du compte de
Nico (supprimé) : `bestOfferEnabled`, `autoDeclineAmount` ; le PUT doit porter `{autoDecline:false, autoDeclineAmount:0,
bestOfferEnabled:true}`. Changé : ebay.js `refusAutomatiqueOffresCoupe` (un seul PUT, relu ; une offre minimale applicable
est gardée ; les offres ne sont jamais allumées). Verrou `selftest:ebay-offres-brouillon` (7 ; rouge avant : 7).
**(4) Vinted — dimensions du colis.** Relevé sur un brouillon de test à 999 € (rayon 4733, effacé) : le rayon porte
`parcel_measurements.enabled` ; champs hauteur / largeur / longueur (cm) et poids (kg) ; corps `parcel:{dimensions:{height,
length,width},weight}`. Changé : vinted.js (étape « Dimensions » avant tout retrait ; mesures inconnues ou hors limites →
une question à 4 champs), sonde de background.js, unités dans `champsDimension.js`. Verrou
`selftest:vinted-colis-dimensions-envoi` (9 ; rouge avant : 9).
**Reste.** Les dimensions ne sont pas encore gardées sur la fiche (la question revient à la publication suivante) ; la copie
Cloud de la lecture des ventes Beebs (« onglet_indisponible ») non traitée.

## 9. Leboncoin Immobilier

**Cause (une phrase).** Rien n'arrêtait une tâche Leboncoin en Immobilier, alors que FillSell ne sait pas remplir ce
formulaire (surface, DPE, GES…) : « la table toscane » (joshua, Immobilier › Bureaux & Commerces) bouclait.

**Ce qui a changé.** `supabase/functions/_shared/leboncoin-immobilier.js` : Immobilier = chemin « Immobilier › … »
(Ventes immobilières, Locations, Colocations, Bureaux & Commerces) OU lien `/ad/<segment immobilier>/`. L'app : la carte
du rayon dit « Leboncoin : la catégorie Immobilier n'est pas encore prise en charge par FillSell. Publie cette annonce
toi-même sur Leboncoin. » ; la publication écarte Leboncoin avant le débit ; la republication ne le propose plus ; la
relance par copie ne la recrée pas. Le serveur (filet) : get-pending-jobs ne la sert jamais, la passe à la personne avec
la phrase (écriture conditionnée à « pending »). Verrou : `selftest:lbc-immobilier` (33 contrôles ; rouge avant : 14).
**En base (lecture seule).** 0 tâche vivante concernée aujourd'hui ; 2 republications ont bouclé (2 comptes), closes ;
19 annonces Leboncoin en Immobilier sur 7 comptes (6 en ligne).
**Reste.** « Locations de vacances » est une autre racine de Leboncoin (16 annonces, 4 comptes) : non visée (question).

## Décisions de Nico
