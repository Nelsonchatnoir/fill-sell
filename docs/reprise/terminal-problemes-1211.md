# Reprise — terminal « Problèmes » du 12/11/2026

Rapport : `docs/enquetes/terminal-problemes-1211/RAPPORT.md`. Comptes par id8. Heures de Paris.
Consignes de la session (Nico) : copie à part depuis origin/main ; jamais la branche du site marketing ; chaque fonction part
de sa version EN PROD ; cause prouvée, classement, correctif à la racine, selftests, zéro régression ; aucune réparation à la
main ; aucun mail, aucune console ; l'état de prod et la reprise du terminal 1 lus, PAS modifiés (les versions déployées par
ce terminal sont donc écrites ICI, à reporter dans `docs/agents/etat-2026-10-01.md` si Nico le veut).

## Classement
| Point | Compte | Classement | Suite |
|---|---|---|---|
| 1. lots de publications « qui ne partent jamais » | 229c7b07 (et 4cfb7afe) | NORMAL : publications programmées, créneau du soir 19:00–22:00, une à la fois | décision de Nico sur la cadence (une à la fois par COMPTE → ~40 par soir) |
| 2. vente qui n'arrête pas la republication du même article | 6e3d92b3 | ROUGE, corrigé | voir ci-dessous |
| 3. retrait Beebs f4367beb | c7c382b7 | NORMAL, borné : clos seul à 7 jours du dépôt (14/11 ≥ 10:48, relecture de 12 h suivante) | rien ; relire le 14/11 au soir |

## Point 2 — EN SERVICE (12/11, commit 21fa849, poussé ce30433..21fa849)
- Suite complète 678/678 sur une copie de travail en LF de 21fa849 (12:25 → 12:48). ⚠ Dans une copie extraite en CRLF
  (autocrlf du poste), 8 selftests sont rouges pour les seules fins de ligne (opla-catalogue, ebay-retours, opla-prevol,
  ventes-prouvees, mail-apres-vente, copie-non-prouvee-question, a-regler-retirer, etat-job) : tous verts en LF.
- 13:44:18 sauvegarde (`_backup_1112_vente_arrete_meme_plateforme`, 3 définitions, garde md5 passée) ; **13:47:42
  migration 20261112140000** (`db query --linked --yes -f`, puis `migration repair --status applied`) : md5 d0efd535… →
  **970ca3b4f5b4dc1818c7b46f363658dc**, condition en place, droits, propriétaire, SECURITY DEFINER, search_path,
  lock_timeout 1500ms, statement_timeout 5s inchangés ; base démarrée le 11/11 13:29, aucune attente de verrou avant.
- **update-job-status v192** (13:48:43, avant v191), **ebay-api-worker v124** (13:49:00, avant v123), **handler-watch
  v192** (13:49:20, avant v191) : `verify_jwt` false avant et après, appel sans session → 401 pour les trois ; depuis
  l'archive LF entière de 21fa849. get-pending-jobs v361 non touchée.
- **13:51:09 : fac6fdef arrêtée par la règle** (handler-watch, « questions tranchées … vendu: 1 », motif
  `article_vendu_vente_enregistree`, « Article vendu le 11/11 : cette republication sur Vinted n'a plus d'objet. Rien
  n'a été retiré ni publié. »). PREUVE de 13:52:30 : reste 931a27d7 (compte ba656e5f, « article vendu » sans ligne de
  vente, voulu) ; retenues au démarrage : 0.
- Hors lot, vu en passant : `empreintes-urls` v19 dépasse son temps CPU plusieurs fois par heure depuis le 11/11
  (jusqu'à 24 par heure le 12/11 à 10h) — non touchée, à regarder.

## Point 2 — le détail du lot
- Migration **20261112140000** `vente_arrete_meme_plateforme` (enregistrer_vente_atomique réécrite depuis la prod, md5
  d0efd535… ; une condition ; commentaires anonymisés). Sauvegarde `scripts/reparations/20261112_vente_arrete_meme_plateforme_SAUVEGARDE.sql`
  → `public._backup_1112_vente_arrete_meme_plateforme` ; preuve `…_PREUVE.sql` (lecture seule, avant/après) ; inverse
  `supabase/rollbacks/20261112140000_vente_arrete_meme_plateforme_INVERSE.sql` + `migration repair --status reverted`.
- **update-job-status** (garde au démarrage, 409), **handler-watch** (règle 3 « sans objet » sur les tâches en attente),
  **ebay-api-worker** (garde dans `publier()`), toutes `verify_jwt` false (`--no-verify-jwt`), déployées depuis
  `git -c core.autocrlf=false archive <commit>` entière.
- Versions AVANT (lues le 12/11 vers 11:45) : update-job-status v191, handler-watch v191, ebay-api-worker v123,
  get-pending-jobs v361 (non touchée). Prod = origin/main pour get-pending-jobs et handler-watch (tous fichiers) ;
  update-job-status v191 et ebay-api-worker v123 embarquaient des fichiers partagés plus anciens (cloud-conditions.js,
  cloudOffer.js, interrupteurs.js ; shared.js — commentaire et lien de connexion Leboncoin, sans effet sur ces fonctions) :
  le redéploiement les aligne sur main.
- Retour : redéployer les trois fonctions depuis une archive de ce30433 (origin/main d'avant le lot), puis l'INVERSE SQL.

## Outillage laissé
- Copie de travail : `C:\Users\nicol\AppData\Local\Temp\claude\32da762e80935617\fef1c54f-f756-4cd5-a7ed-5ed0ccd1be02\scratchpad\wt-pb`
  avec une JONCTION `node_modules` → dépôt principal : ⛔ la retirer par `cmd /c rmdir <wt-pb>\node_modules` AVANT tout
  `git worktree remove` ou `rm -rf` (sinon le node_modules du dépôt principal est effacé).
- Lectures de prod hors dépôt (citent des clients) : `…\scratchpad\cat\` (catalogue des fonctions), `…\scratchpad\defs\`.
- Banc : `node scripts/essais/20261112140000_banc.mjs` ; fixture : `node scripts/essais/20261112140000_fixture.mjs --fonctions <tout.json> --tables <tab.json>`.

## Après-midi — points 4 à 6 (rapport § 4 à 6)
| Point | Compte | Classement | Suite |
|---|---|---|---|
| 4. publications programmées : dire quand ça part | 229c7b07, 4cfb7afe | ROUGE (l'app se taisait), corrigé | OTA 2.9.174 + web |
| 5. empreintes-urls, temps de calcul dépassé | tout le parc (rapprochement ralenti, rien de cassé) | cause dans les appelants SQL (rafales de 100) : rapport seul | décision de Nico : borner `rapprochement_v3_empreinter` |
| 6. Leboncoin « Animaux › Animaux » bloquée | cfdfda6f (298e4944, c8fd2caa) | ROUGE, corrigé | get-pending-jobs + handler-watch + app |
- Formule du rythme (point 4) : médiane des servies des 3 derniers créneaux pleins (14 jours au plus), bornée au plafond ;
  aucun créneau plein → aucun chiffre. `src/utils/rythmeProgramme.js`.
- Verrous : `selftest:programmees-verite` (7 rouges sur 5e88909 → 30/30), `selftest:lbc-animal-vivant` (8 rouges → 21/21).
- ⚠ Faute d'outillage (rien perdu) : un `git stash` raté dans la copie a été suivi d'un `git stash pop` qui a tenté
  d'appliquer la remise du terminal Cloud (stash@{0}, « POINT 4 bandeau Cloud… ») — refusé par git, remise CONSERVÉE, copie
  intacte. La pile de stash est partagée entre toutes les copies : jamais `git stash` ici.
- **EN SERVICE (commit 1746fae, poussé 5e88909..1746fae à 14:55)** : suite complète 680/680 sur une copie LF (14:32 → 14:54) ;
  **get-pending-jobs v362** (14:55:45, avant v361, `verify_jwt` true avant et après, sans session → 401 ; 145 appels en 200,
  médiane 1 166 ms contre 1 337 pour v361, aucune autre réponse) ; **handler-watch v193** (14:56:04, avant v192, `verify_jwt`
  false, `--no-verify-jwt`, sans session → 401) ; tous deux depuis l'archive LF entière de 1746fae. **14:57:09 : 298e4944
  reçoit le geste** (handler-watch, « questions tranchées … animal_lbc: 1 »). **OTA 2.9.174** publiée (canal production =
  2.9.174, commit 1746fae, `--delta`, 162 fichiers) depuis le dossier principal avancé en avance rapide (propre avant et
  après) ; web 2026-11-12T13:56:42Z+1746fae, entrée relue avec `Origin` : 200.
- Retour : get-pending-jobs et handler-watch depuis l'archive de 5e88909 ; app : nouvelle OTA (numéro neuf) d'un commit
  qui revient sur 1746fae.

## Soir — point 5 corrigé (GO de Nico) : rafales d'empreintes bornées à 10
- Migration 20261112160000 + fonction rapprochement (cadence) ; fusion_photo_tick inchangée. Verrou
  `selftest:empreintes-rafales` (6 rouges sur cfef7d7 → 11/11), banc 15/15.
- Référence avant : empreintes-urls 23 % d'échecs (24 h) ; attentes de photos du rapprochement médiane 29 s, p90 85 s.
- **EN SERVICE (commit 2223f0b)** : sauvegarde 16:22:14 ; **migration 20261112160000 à 16:22:27** (md5 2043347c…) ;
  **rapprochement v39** (16:22:49, `verify_jwt` false).
- **Mesure sur 1 h (16:22 → 17:22, contre 15:22 → 16:22)** : rapprochement PLUS RAPIDE — ≤ 50 photos médiane 8,7 s
  (avant 27 s), 213 photos en 44 s et 302 en 76 s (avant 237 en 239 s, 440 en 96 s, 654 en 107 s) ; empreintes-urls
  20,4 % d'échecs (56/275) contre 22,7 % (245/1 080) — presque pas mieux : les échecs tombent dans les minutes à 35–110
  appels (relance toutes les 4 s = même débit par minute qu'avant). Moins d'échecs = rapprochement plus lent : décision
  de Nico. Rien à défaire.

## Soir — points 7 et 8, puis point 9 (ouverture du Cloud, ce terminal ouvre)
| Point | Comptes | Classement | Suite |
|---|---|---|---|
| 7. achats Google Play « Purchase is not purchased » | 8 comptes, 18 échecs (16/10 → 12/11) | ROUGE (app aveugle), corrigé | OTA 2.9.175 + binaire 2.9.176 / vc38 préparé |
| 8. rédaction coupée à 150 s (504) | ebdf29f0 (4), 229c7b07 (2) sur 7 jours | ROUGE, corrigé | generate-listing v140 |
- **Point 8 EN SERVICE (commit 6ede137, poussé 2223f0b..6ede137)** : suite LF 682/682 (16:36 → 17:01) ; **generate-listing
  v140** (17:02:24 ; avant v139 ; `verify_jwt` true avant et après ; sans session → 401), déployée depuis la copie de PROD
  v139 + le correctif (`_shared/palier.js` et deux fichiers `src/` de la prod sont plus anciens que main : gardés tels quels).
- **Point 7 EN SERVICE (commit 253a740, poussé 6ede137..253a740)** : suite LF 682/683 sur ff8291f (17:01 → 17:25), seul
  rouge `lot-i-3110` (il épinglait l'ancien message dans App.jsx) mis à jour dans 253a740 et vert, plus les 4 selftests
  touchés par l'écart revérifiés ; **OTA 2.9.175** (canal production = 2.9.175, commit 253a740, delta, 162 fichiers),
  depuis le dossier principal avancé en avance rapide (propre avant et après) ; web 2026-11-12T16:27:44Z+253a740 (entrée
  lue avec `Origin` : 200).
- ⚠ Règle de l'OTA : un numéro de binaire n'est JAMAIS celui d'une OTA (garde `scripts/ota/regles-ota.mjs`) : binaire
  Android **2.9.176 / vc38** (module d'achat patché, compilé par Gradle le 12/11) ; prochaine OTA ≥ 2.9.177.
- **Point 9** (étapes de Nico) : 1. vert (ci-dessus) ; 2. vert — 2.9.167 / vc37 « Disponible sur Google Play », sortie le
  09/11 20:15 ; 3. vert (GO de Nico, ~17:35) — ACTIVÉS sur Google Play : `premium-cloud-monthly` (34,99 €) + offre
  `premium-cloud-trial-7d`, `pro-cloud-monthly` (49,99 €) + offre `pro-cloud-trial-7d`, `business-cloud-monthly` (79,99 €,
  aucune offre) ; aucun prix, aucun abonnement existant touché. ⚠ Éligibilité Google de l'essai = « n'a jamais eu
  d'abonnement dans cette appli » (question posée à Nico) ; sur la vc37, le module prend la PREMIÈRE offre renvoyée par
  Google (essai ou plein tarif) : jamais éprouvé. 4. attend le téléphone de Nico (aucun appareil Android sur ce poste) :
  témoins FillSell d6a9e726, 953c1ca6, f44b5917 ; compte Google testeur de licence jamais abonné.
- Interrupteurs : `coin_config.cloud_formules_stripe` / `_google` / `_apple` ABSENTS (= fermés) au 12/11 ~17:40 ;
  `cloud_offre_ouverte` = 1. Ouverture : seulement sur « GO OUVERTURE » de Nico ; `cloud_formules_apple` reste fermé.
- Décisions de Nico (12/11 soir) : point 5 arrêté là (on ne ralentit pas le client) ; éligibilité Google de l'essai
  GARDÉE (« n'a jamais eu d'abonnement dans cette appli ») ; ce soir WEB SEUL, Android attend l'achat d'essai sur un vrai
  téléphone (« fait » de Nico).
- **WEB OUVERT : `cloud_formules_stripe` = 1 le 12/11 à 18:13:11** (upsert `coin_config`, GO OUVERTURE de Nico, web
  seul) ; `_google` et `_apple` toujours ABSENTS. Terminal marketing prévenu dans la minute (web seul, Android fermé).
  Vérifié : lecture anonyme (ce que lisent l'app et le site) = stripe 1, google/apple absents ; TÉMOIN (session de Nico
  déjà ouverte, lecture seule, app 71f97fc) : « Choisis ta formule › Avec Cloud », Pro + Cloud 49,99 €, Business + Cloud
  79,99 € ; COMPTE ORDINAIRE : le vrai code (app `cloudVendableDansLePays`, serveur `formulesOuvertesPour`,
  `voieFormuleStripe`) avec les valeurs lues sans session = web vendable, Android et iPhone non ; checkout Stripe avec
  essai pour Premium / Pro + Cloud, sans essai pour Business + Cloud. Écran d'un vrai compte ordinaire : pas vu (aucune
  connexion à fillsell.app depuis l'automatisation).
- **ANDROID OUVERT : `cloud_formules_google` = 1 le 12/11 à 18:19:02** (nouvelle décision de Nico : web ET Android ce
  soir, sans achat d'essai préalable — impossible ici : se connecter à un compte Google et à un compte FillSell exige des
  mots de passe que ce terminal ne tape pas). `cloud_formules_apple` ABSENT (fermé, accord d'Apple attendu). Terminal
  marketing prévenu aussitôt (web + Android ; son push « web seul » 06ca876 était parti à 18:18). Vérifié avec les valeurs
  lues sans session : app ordinaire web oui, Android vc37 oui (seuil 2.9.167), iPhone non ; serveur stripe et google
  ouverts, apple fermé ; produits Google `app.fillsell.{premium,pro,business}.cloud` = ceux activés.
- **SURVEILLANCE ANDROID** (ordre de Nico) : `scratchpad/verif9/veille.mjs`, lecture toutes les 60 s (~55 ms en base) ;
  COUPE seule `cloud_formules_google` = 0 sur : un `checkout_issue` Google autre que « reussi » ou « annule » (sur la vc37,
  abandon et refus de Google sont indiscernables : comptés comme échec) ; une formule Premium / Pro + Cloud prise chez
  Google sans essai alors que la carte annonçait l'essai. S'arrête pour lecture sur `formule_cloud_issue` « erreur » ou
  « refuse » (canal non écrit) et à chaque achat de formule (web ou Android). Le web reste ouvert dans tous les cas.
- Binaire 2.9.176 / vc38 : fabrication arrêtée par le système (mémoire) pendant Gradle, avant tout AAB ; processus
  restants arrêtés par PID ; défaut du script corrigé (71f97fc). À relancer sur le mot de Nico : `npm run binaires --
  --aab-seul` depuis le dossier principal (le module patché y est déjà posé, `patch-package` ✔).

## Soir — urgence « Se connecter avec Apple » du web (rapport § 10)
- 18:33 : nouvelle clé Sign in with Apple **TJY379J9P7** (Documents\FillSell-cles\sign-in-with-apple\, à part de la clé push) ; secret posé (API de gestion,
  `external_apple_secret` seul) ; 18:46:19 connexion Apple web de Nico réussie. L'ancienne clé U5R7347N3K reste active.
- **EN SERVICE (f71279a)** : `expirations-secrets` v1 (19:22:40) ; migration **20261112190000** appliquée + `migration
  repair` (~19:23) ; secrets `APPLE_SIWA_P8/KEY_ID/TEAM_ID/CLIENT_ID`, `GESTION_SUPABASE_JETON` (jeton
  « renouvellement-secret-apple-v2 », projet seul, Project Settings + Auth Config) ; essai bout à bout 19:32:06 vert
  (secret renouvelé, échéance 11/05/2027 20:32). Chaque jour 07:10 : renouvellement si le secret a > 30 jours, alerte à
  support 30 jours avant toute échéance de `public.expirations_secrets`.
- Inverse : `supabase/rollbacks/20261112190000_expirations_secrets_INVERSE.sql` + `migration repair --status reverted
  20261112190000` ; supprimer la fonction ; le secret posé reste valable jusqu'à son échéance.

## Soir — fin : surveillance arrêtée, binaire vc38 soumis (ordres de Nico)
- Surveillance Android ARRÊTÉE (Nico : « on valide tel quel ») ; `cloud_formules_google` reste à 1. Aucun achat de
  formule (web ou Android) vu pendant qu'elle tournait.
- **Binaire 2.9.176 / vc38 FABRIQUÉ** sur 881c2b9 (`npm run binaires -- --aab-seul --cle-apns=…AuthKey_J8G395AA93.p8`) :
  `build/AAB-A-TELEVERSER-2.9.176-vc38/fillsell-android-2.9.176-versionCode38-881c2b9.aab`, 18 249 282 o, sha256
  fee793bb…c029a, signé par la clé d'envoi habituelle, module d'achat patché présent (classes2.dex), bundle web
  2026-11-12T18:38:35Z+881c2b9. Premier essai refusé par le script (deux `AuthKey_*.p8` dans `FillSell-cles`) : la clé
  Sign in with Apple est rangée dans `FillSell-cles\sign-in-with-apple\`.
- **Play Console (ordre de Nico : « tu soumets, tu publies »)** : Production › release 14 « 2.9.176 » (AAB importé par le
  relais 127.0.0.1, empreinte vérifiée dans la page ; notes FR/EN « Achats plus clairs… ») ; 2 avertissements habituels
  (désobscurcissement, symboles natifs) ; 12 604 téléphones, aucun perdu ; vue d'ensemble : UNE seule modification (les
  brouillons de fiche du terminal marketing n'y étaient pas) → « Envoyer 1 modification pour examen » (~19:50).
  ⚠ Publication GÉRÉE activée : une fois approuvée par Google, la release attend un clic « Publier » dans la vue
  d'ensemble de la publication.
