# Reprise — lot « Ouverture du Cloud », phase 1 (terminal fill-and-sell-07, ouvert le 05/11/2026 à 19:10)

Le détail, point par point, avec les preuves : `docs/enquetes/ouverture-cloud-0511/RAPPORT.md`. Ce fichier dit OÙ on en
est, ce qui attend Nico, et comment reprendre. Heures de Paris.

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
- Play Console : connecté. App Store Connect : connecté par Nico à 20:10. Stripe : connecteur en mode RÉEL seulement,
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

## Reprendre
Lire ce fichier puis le rapport ; `git status` (dossier partagé) ; relire l'état réel (base, cloud-2, consoles) avant
d'affirmer quoi que ce soit. Phrase de reprise : « Reprends le lot Ouverture du Cloud, phase 1, depuis
docs/reprise/REPRISE-OUVERTURE-CLOUD-PHASE1.md ».
