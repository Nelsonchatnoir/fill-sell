# Reprise — lot « Ouverture du Cloud », phase 1 (terminal fill-and-sell-07, ouvert le 05/11/2026 à 19:10)

Le détail, point par point, avec les preuves : `docs/enquetes/ouverture-cloud-0511/RAPPORT.md`. Ce fichier dit OÙ on en
est, ce qui attend Nico, et comment reprendre. Heures de Paris.

## ⛔ ORDRE DES PHASES — ordre de Nico du 05/11 à 21:42 (à relire à CHAQUE reprise)
- Phase 1 : inchangée.
- Phase 2 : inchangée, SAUF les captures, le binaire 2.9 et la soumission, DÉPLACÉS à la fin de la phase 3. Restent en
  phase 2 : textes FR/EN, EULA, confidentialité, déclarations de données (et le compte de démo, les notes des relecteurs).
- Phase 3 « pays anglophones » (ci-dessous), PUIS captures pro, binaire 2.9 par Codemagic et soumission (sortie MANUELLE
  chez Apple et Google, comme prévu).
- Contexte (Nico) : la fiche anglaise part avec la 2.9, et un utilisateur a déjà payé en dollars le 23/10. Règle
  constante : rien de cassé en France, zéro régression, recherches sur les VRAIES pages, et s'arrêter pour le dire dès
  qu'on bloque.

### PHASE 3 — pays anglophones (texte de Nico, 05/11 21:42)
1. **Traduction anglaise : absolument tout.**
   - Inventaire d'abord : tous les textes de l'app non traduits (clés manquantes et textes codés en dur, il en restait
     ~548 fin septembre), plus les mails, les notifications push, les messages d'erreur, les écrans de paiement et
     d'attente du Cloud, et les textes rédigés par Lens.
   - Puis traduction complète. Preuve : parcours entier sur un téléphone réglé en anglais, de l'inscription jusqu'au
     paiement, sans un seul mot de français.
2. **Plateformes par pays** (ce qu'un pays n'a pas est MASQUÉ, pas seulement refusé).
   - France : inchangé.
   - États-Unis : Vinted (site américain, s'il existe et fonctionne : à vérifier sur les vraies pages), eBay.com, Depop
     (version US). Leboncoin et Beebs masqués.
   - Royaume-Uni : Vinted UK, eBay.co.uk, Depop. Leboncoin et Beebs masqués.
   - Autres pays anglophones : même logique selon ce qui existe vraiment chez eux.
   - Pays lu sur le compte connecté ou le téléphone, comme pour la zone euro (interrupteur par pays dans coin_config).
     Règle eBay déjà validée : le site eBay du compte du vendeur, jamais ebay.fr pour un étranger.
   - GARDE-FOU : une plateforme non prouvée dans un pays reste MASQUÉE, jamais proposée cassée. Dire à Nico lesquelles
     sont prouvées et lesquelles restent fermées.
3. **Cloud hors zone euro** : à l'ouverture, Cloud proposé seulement dans la zone euro (prix 24,99 €, IP du relais
   pensées pour l'Europe). Ailleurs, l'offre Cloud n'est pas affichée.
4. **Priorités** : 1 et 3 sont nécessaires AVANT le binaire. Pour 2, ce qui passe par le serveur peut suivre sans
   retarder la soumission ; ce qui doit être dans le binaire y entre. Si 2 retarde la 2.9 de plus d'un jour : s'arrêter et
   le dire avant de continuer. Rapport court et en clair : traduit / masqué / prouvé / reste.

## Où on en est (05/11 21:45 — remplace le tableau plus bas, daté de 21:15)
- Phase 1 : déployé sur cloud-2 (61fb7dd : points 9, 11, 12, IP de secours allumée, alerte 80 % du plafond d'IP) ;
  Stripe réel : prix Cloud 24,99 € `price_1UYWNmQZRA77vrWJZIWshl1B` (secret rebranché, ancien prix archivé) ; banc Stripe
  en MODE TEST 19/19 vert (21:27, CLI autorisée par Nico) ; écran d'attente après paiement (63effea, web) ; point 7
  serveur plein (e1428de : page Stripe expirée à 31 min) ; point 10 heures des étapes (848ce11 : affichage web, migration
  20261105230000 PRÉPARÉE, NON APPLIQUÉE — feu vert nommé) ; point 13 preuve de concurrence verte ; point 15 « une seule
  annonce hors ligne par plateforme » et « retenue levée trop tôt » corrigés (1a20f0e) — ⚠ get-pending-jobs de `main`
  les porte, avec le point 13 : le prochain déploiement de get-pending-jobs, par n'importe quel terminal, les publie.
  Fonctions de paiement : prouvées, NON déployées → jour d'ouverture (`docs/reprise/JOUR-OUVERTURE-CLOUD.md`, décision j).
- Compte de démo (décision g, précisée à 21:37) : googlereview@fillsell.app (953c1ca6) RÉUTILISÉ — 21:40 script
  `scripts/reparations/20261105_compte_demo_relecteurs.sql` (+ inverse ; sauvegarde `_backup_0511_compte_demo_relecteurs`) :
  témoin Cloud (beta_flags.cloud), offre ACHETABLE en bac à sable, rien offert, Premium intact, 7 articles de démo
  propres ; 21:41 ajouté à `COMPTES_AUTORISES` de cloud-2 (copie d'avant : `/srv/fillsell-cloud/.env.avant-demo-0511`),
  orchestrateur relancé, navigateur de Nico rouvert seul. Reste : le texte des notes des relecteurs (Nico y met le mot
  de passe).
- Phase 2 : nom choisi par Nico à 21:37 = « FillSell – Crosslisting » (FR et EN, App Store et Google Play ; sous-titres
  gardés : FR « Assistant IA pour revendeurs », EN inchangé) ; mots-clés Apple FR « cross-post, cross-listing,
  multi-plateformes, revente, annonces », EN « crosslist, cross-post, reseller, multi-platform, listing, resale » (aucun
  nom de plateforme ni de marque). À faire : saisie des noms et mots-clés, textes FR/EN, EULA et confidentialité (liens
  en fin de description et dans les champs dédiés ; écran d'achat conforme Apple), déclarations de données, notes des
  relecteurs, localisation de l'abonnement Cloud. Constat ASC : statut DSA « non-commerçant » déclaré pour l'app (à
  revoir par Nico : abonnements payants).

## Règles du lot (rappel)
- Corriger la règle, pas le cas ; selftests + au plus un essai réel par point ; commit + push à chaque point (code et
  docs ensemble ; `git commit --only <fichiers>` — un autre terminal, « Problèmes » = fill-and-sell-44, travaille dans le
  même dossier).
- Aucun mail client, aucun achat (IP, serveur), aucune création ou archivage de prix Stripe en mode réel sans Nico.
- Seul le compte de Nico est sur le Cloud (cloud-2). Rien rendu, basculé ni résilié. L'AX42-1 est en vérification
  chez Hetzner (ticket 2026110503039457) : palier 3 et essai de charge l'attendent.
- Pas d'OTA (elle part avec le binaire 2.9). `grille_trois_jauges` reste à 0.
- Une migration ne s'applique que sur un feu vert de Nico qui la NOMME (mémoire validation-migration-explicite).

## Accès (05/11 soir)
- Play Console : connecté. App Store Connect : connecté par Nico à 19:37. Stripe : connecteur en mode RÉEL seulement,
  tableau de bord NON connecté → le mode test est injoignable tant que Nico ne s'y connecte pas (ou ne pose pas
  `STRIPE_SECRET_KEY_TEST` / `STRIPE_WEBHOOK_SECRET_TEST` lui-même).

## État des points (mis à jour au fil du lot)
| Point | État |
|---|---|
| 1 essai 7 j | Google : 7 j vérifié, 24,99 € (23 pays euro). Apple : offre d'intro « 1 semaine gratuite » CRÉÉE (elle n'existait pas), prix passé à 24,99 € (25 pays euro). Stripe : prix réel 20 € à 7 j ; mode test injoignable. Preuves sandbox / licence de test : attendent le binaire 2.9 et le téléphone de Nico. |
| 2 prix Stripe 24,99 € | STOP (ordre de Nico pour le réel). Geste réel en une ligne : voir « Ce qui attend Nico ». Mode test : attend l'accès. |
| 9 relance après Résoudre | CODÉ + selftests (serveur Cloud), NON déployé sur cloud-2. |
| 11 relais IP | CODÉ + selftests (réessai, compteurs) ; IP de secours coupée → décision de Nico. NON déployé. |
| 12 mises à jour invisibles | CODÉ + selftests (vidange à l'arrêt, grâce 12 min). NON déployé. |
| 13 prise sans doublon | Prise atomique relue EN PROD (reserver_jobs_extension : FOR UPDATE SKIP LOCKED + réservation par poste ; prendre_job : contrôle + compare-and-set pending→processing). Trou fermé (code, NON déployé) : le poste Cloud d'un compte au Cloud inactif ne reçoit plus rien, et l'ordinateur garde alors ses tâches (get-pending-jobs + _shared/cloud-voie.js). Preuve de concurrence sur Postgres jetable : à faire. |
| 3/4 paiements (règles) | CODÉ (NON déployé) : un « off » de boutique pendant l'essai l'arrête ; un 2e canal n'écrase plus un Cloud vivant (doublon dit) ; Stripe refuse aussi pendant un essai boutique ; le mail d'impayé ne dit plus « reste actif » à un Cloud (arrêté depuis le 03/11). Webhook Stripe réel : payment_failed et action_required bien cochés. |
| 5 après paiement | Page de retour Stripe : dit le produit acheté (Cloud « démarre », 7 j sans prélèvement) au lieu de « plan Premium » pour tout — part au web à ce push ; create-checkout-session à redéployer. Écran d'attente dans l'app : à faire. |
| 14 Depop | FAIT : cause = réputation de l'IP du relais sur la passerelle de mesure `/vwdj/`, sans effet sur les gestes. |
| 16 mémoire par compte | FAIT : médiane 874 Mo sur 24 h (p95 1 035) ; ~30 à 45 comptes par AX42 selon la marge. |
| autres | à venir (voir le rapport) |

## Ce qui attend Nico
1. **Stripe, mode réel (point 2)** — en une ligne : sur `prod_VNfg9NASXvwpey`, créer un prix 24,99 € EUR mensuel
   (`recurring.trial_period_days = 7`, metadata `option=cloud`, `essai_jours=7`), poser
   `npx supabase secrets set STRIPE_PRICE_CLOUD=<nouveau price_…>`, puis archiver `price_1UMuLDQZRA77vrWJZfZh2IS4`
   (20 €, 0 abonné). À faire en même temps que l'ouverture (jamais un prix affiché différent du prix facturé).
2. **Stripe, mode test** : se connecter à dashboard.stripe.com dans le Chrome du poste (ou poser soi-même les secrets
   de test) — sans cela, aucun parcours Stripe ne se prouve en mode test.
3. **App Store Connect** : accepter le « Paid Applications Schedule » mis à jour (Business) — accord juridique.
4. **IP de secours (point 11)** : partagée = comptes reliés (déconseillé) ; par compte = coût double ; décider sur la
   mesure des coupures (`etat/coupures-relais.jsonl`, une fois déployé).

5. **Déploiement sur cloud-2 (points 9, 11, 12 + correctif « en vérification » 2a4b388)** : REFUSÉ par le garde-fou de la
   session (« Production Deploy ») à 20:06 — il faut l'autorisation NOMMÉE de Nico (« déploie le serveur Cloud sur
   cloud-2 »). Prêt : copie Cloud construite `build/extension-cloud` (BUILD_ID 2026-11-05T19:04:26Z+d426d23.p92769f2-cloud,
   même base d426d23 que la copie en service), commande `bash serveur-cloud/outils/deployer.sh 5.9.80.213
   cloud-2.fillsell.app` (arbre propre), à lancer quand aucune tâche n'est « processing » (relu à 20:05 : 0).
6. **Fonctions à déployer sur ordre** (rien déployé) : `get-pending-jobs` (point 13, petit) ; `stripe-webhook`,
   `apple-iap-webhook`, `google-play-webhook`, `validate-apple-receipt`, `validate-google-purchase` (règles boutiques,
   mail d'impayé) ; `create-checkout-session` (page de retour, garde du doublon) — ⚠ elle porte AUSSI les changements
   du 04/11 (c3a4aff : Cloud 24,99 €, nom, conditions 2026-11-04) laissés en attente de l'ouverture : la déployer = les
   publier aussi.
7. **Plafond d'achat d'IP (point 6, STOP)** : proposé **100 $ / mois** (aujourd'hui 60 $). Calcul : IP dédiée IPRoyal
   France = 4 $ / 30 j ; parc actuel ~8 IP (≈ 32 $/mois de renouvellements) ; un AX42 tient ~30 à 45 comptes → à
   pleine charge ~50 IP (≈ 200 $/mois) ; 100 $ couvrent les renouvellements + ~15 comptes neufs le premier mois, et
   bornent un emballement. Achat automatique : reste COUPÉ (`cloud_ip_achats_auto` = 0) jusqu'au feu vert de Nico.
8. **Compte de démo des relecteurs (point 22)** : « avec le Cloud actif » contredit « seul le compte de Nico est sur
   le Cloud » — décision de Nico (le mettre sur cloud-2, ou un Cloud « actif » sans navigateur pour la relecture).

## Ce qui reste (phase 1), dans l'ordre proposé
- 2 et 17 : parcours Stripe en mode test (prix 24,99 € de test, essai, fin d'essai par horloge de test, résiliation,
  carte refusée) — attend l'accès au mode test.
- 3/4 preuves réelles Apple (bac à sable) et Google (licence de test) — attendent le binaire 2.9 et le téléphone de Nico.
- 5 : écran d'attente dans l'app après paiement (le bandeau dit « FillSell Cloud est arrêté » tant que le poste n'existe
  pas — `src/cloud/executant.js`, cause « jamais ») ; mesure réelle du délai (attribution ~2 min au pire selon le code :
  planificateur 60 s, extension 2 min).
- 7 : serveur plein (la vente refuse déjà « complet » à la préparation ; Stripe et les boutiques ne revérifient pas
  la place au paiement) ; 8 : « Me connecter » (liste blanche existante ; `auth.`/`accounts.`/`api.` permis sur tous les
  chemins — à resserrer) ; 10 : heure de chaque étape d'une republication ; 13 : preuve de concurrence sur Postgres
  jetable ; 15 : audit des défauts (Jean Lee, annonces TEST, cache Beebs, une annonce hors ligne à la fois = règle du
  15/10 « groupe Leboncoin-Beebs-Depop », redépôt rendu en 4 s, retenue levée trop tôt = règle 3 du 26/10 qui libère
  le groupe quand l'annonce attend sa relecture, « À reconnecter » à l'écran).

## Reprendre
Lire ce fichier puis le rapport ; `git status` (dossier partagé) ; relire l'état réel (base, cloud-2, consoles) avant
d'affirmer quoi que ce soit. Phrase de reprise : « Reprends le lot Ouverture du Cloud, phase 1, depuis
docs/reprise/REPRISE-OUVERTURE-CLOUD-PHASE1.md ».
