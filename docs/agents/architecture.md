# Architecture de référence — tables, fonctions edge, crons, triggers

> Référence pour agents de code, appelée par `AGENTS.md` (racine). Rédigé le 27/09/2026.
> Se périme : la base de prod, `git log` et les outils font foi, jamais ce fichier.

## Arborescence

| Dossier / fichier | Rôle |
|---|---|
| `src/` | App React 19 + Vite (web + mobile). Détail : `src/AGENTS.md`. |
| `src/App.jsx` | Le monolithe (~9 800 lignes) : état global, onglets, sessions, premium. Lire avant de toucher la logique métier. |
| `src/main.jsx` | Entrée ; `notifyAppReady` Capgo ; garde `vite:preloadError`. |
| `src/tabs/` | Onglets Dashboard, Lens, Stock, Ventes, Stats. |
| `src/publication/` | Le stepper de publication (+ `moteur/`). |
| `src/annonces/` | « Mes annonces en ligne », relevés, doublons, rattachement. |
| `src/reglages/` | Page Réglages (empreinte du build en bas). |
| `src/entree/` | Onboarding. `src/pages/` : landing, légal, blog, auth, /extension… |
| `src/utils/` | Logique métier (dont `comptabilite.js`, arbres de catégories). |
| `src/lib/` | Client Supabase, IAP, Stripe. `src/i18n/translations.js` : textes FR/EN. |
| `chrome-extension/` | SOURCE de l'extension MV3 (jamais chargée telle quelle). Détail : `docs/agents/extension.md` (pas d’AGENTS.md dans ce dossier, exprès). |
| `supabase/functions/` | ~48 fonctions edge Deno + `_shared/` (~70 modules, certains importés AUSSI par `src/`). |
| `supabase/migrations/` | ~320 migrations SQL (historique divergent de la prod, `AGENTS.md` § 3.4). |
| `supabase/config.toml` | Déclaration `verify_jwt` des fonctions (source de vérité pour celles qui y sont). |
| `scripts/` | Build de l'extension (`build-extension.mjs`, `minify-extension.mjs`, `package-extension.mjs`), empreinte (`build-id.mjs`), générateurs `gen-*`, ~100 selftests (`*-selftest.mjs/.ts`), outils (`apercu/` captures sans session, `emails/`, `reparations/`). |
| `android/`, `ios/` | Projets natifs Capacitor (binaires store). |
| `public/` | Assets statiques (icônes, `email/`, `extension-guide/`). |
| `dist/` | Sortie `vite build` (gitignoré) : `build.json` (empreinte), `fillsell-extension.zip`. |
| `build/` | Gitignoré : `build/extension/` (extension à charger), zips CWS (`CWS-<version>-A-TELEVERSER/`, `anciens-zips/`), AAB, exports. |
| `docs/` | Audits, conceptions, relevés de catalogues, `ROTATION_CRON_SECRET.md`. |
| `marketing/`, `design_extract/`, `test-assets/`, `patches/` | Visuels stores ; maquette de référence ; photos de test ; un patch-package (`@capgo/native-purchases`). |
| `CLAUDE.md` | Règles pour Claude Code (jumeau de ce fichier). `STATUS.md`, `OBSERVATORY.md` : anciens états (août), historiques. |
| `_tmp_*.mjs`, `qa_login.mjs`, `screenshot*.mjs` | Scripts jetables anciens ; ne pas s'en servir comme modèle. |

Flux d'un dépôt : l'app crée les jobs par RPC (`spend_coins_and_publish`,
qui vérifie quotas et gardes, tout-ou-rien) → l'extension les prend par
`get-pending-jobs` (retenues, créneaux, postes) → exécute dans sa fenêtre de
travail → rend le verdict à `update-job-status` → `handler-watch` (cron)
relance ou classe ce qui fige. eBay relié par l'API : `ebay-api-worker` (cron)
publie sans extension.

## Tables principales et colonnes qui piègent

Relevé en prod le 27/09 (lignes ≈ estimation). Avant d'ajouter une colonne
à une requête : `information_schema.columns`. Les ~620 tables `_backup_*`,
`sauvegarde_*`, `jobs_*_2026MMDD` sont des sauvegardes ponctuelles : ne pas
les lire comme des données vivantes, ne pas les supprimer sans décision.

- **`cross_post_jobs`** (~71 k) — un job = une action × une fiche × une
  plateforme. Colonnes : `id, user_id, inventaire_id, platform, action,
  status, title, description, price, photos, photo_option, platform_listing_id,
  listing_url, platform_fields, handler_build, voie, error, generated_at,
  published_at, last_checked_at, sold_at, created_at, bulk_batch_id,
  reservation_id, reservation_settled_at`. Pièges :
  - ⛔ **PAS de `updated_at`** (un select qui la demande rend 400 et vide l'écran).
  - `action` : `publish`, `republish`, `delete`… ; `status` : `pending`,
    `processing`, `published`, `needs_user`, `failed`, `cancelled`… Depuis
    « pas-de-rouge », `failed` est rare : ne pas s'y fier seul.
  - **`platform_fields`** (jsonb) porte presque tout l'état fin : champs de la
    plateforme, `needs_user_source`, marqueurs de parcage et de retenue
    (`attente_session`, `next_action_after`, `unavailable_since`,
    `verifier_doublon_avant_publication`, `lien_refuse`, `gel_livres_leve_le`,
    `last_diagnostic`, `warnings`…). **Le lire avant toute relance.**
  - **`needs_user_source`** vit dans `platform_fields` : motif obligatoire de
    tout `needs_user` (trigger `cross_post_jobs_needs_user_motif`).
  - **`handler_build`** : quel build a traité le job ; contient
    `sync-dressing` ou `releve-annonces` pour un import (tester par `LIKE`).
  - **`voie`** : `api` ou `extension` pour eBay (ne change qu'une fois,
    extension → api).
  - `platform_listing_id` / `listing_url` : identifiant certain et lien ; une
    annonce n'est portée que par un article.
- **`inventaire`** (~82 k) — les fiches. `id` bigint. Pièges : `prix_achat`
  NULL = inconnu (≠ 0), `prix_achat_inconnu` ; `vinted_account_id` (quelle
  boutique Vinted) ; `statut` / `quantite` cohérents (trigger) ;
  `fusionne_dans` / `fusionne_le` (fiche fusionnée dans une autre) ;
  `disparu_le`, `first_seen_at`, `last_synced_at` (relevés) ; `attributs`
  (jsonb : couleur, colis Vinted…) ; `origine` ; `photos` (jsonb).
- **`profiles`** (~2,7 k) — un par compte. Premium : `is_premium, is_pro,
  is_business, is_comped` (jamais `is_founder`). Extension :
  `extension_build`, `extension_version`, `extension_last_seen_at`,
  **`extension_sessions`** (jsonb : sondes par plateforme, identité de
  boutique — c'est une COLONNE, pas une table), **`extension_postes`** (jsonb
  par profil Chrome, écrit par `noter_poste_extension`), `beta_flags`,
  `plateformes_visibles`. Acquisition : `acquisition_*` (immuable après pose).
  RLS : un client ne met à jour que certaines colonnes.
- **`plateformes_verite(p_user)`** — ce n'est PAS une table : une FONCTION qui
  rend la vérité serveur de chaque plateforme (connectée, à vérifier après
  7 jours sans preuve, « je ne vends pas là »). L'écran Plateformes la lit.
- **`vinted_sync_runs`** (~4,4 k) — les RELEVÉS de **toutes** les plateformes
  malgré le nom (`platform`, `kind`, `status`, `declencheur`, pagination,
  `items_vus / crees / maj`, boutique lue : `vinted_user_id`,
  `vinted_login`). Plusieurs triggers de garde (cadence, pause anti-robot,
  relevé vide, hors liste) et d'effet à la clôture (verdicts, levée des
  alertes, relance des jobs parqués).
- **`coin_ledger`**, `coin_wallets`, `coin_reservations` — ancienne monnaie,
  infra masquée depuis la bascule quotas ; ne prouvent aucun droit.
  **`coin_config`** : les quotas par palier font foi ici.
- **`usage_logs`** (~41 k) — usage des fonctions IA (`feature`, `metadata`).
- **`email_logs`** (~8 k) — un envoi = une ligne ; index partiel
  `email_logs_one_shot_unique`. **`email_log_echecs`** : inserts ratés.
  **`job_relaunch_log`** : réservation anti-doublon des relances.
- **`ebay_accounts`** (~50) — comptes eBay reliés par OAuth (jetons : jamais
  les lire ni les afficher) ; accès révoqué au rôle client, lu par des
  fonctions DEFINER.
- Autres tables utiles : `annonces_plateforme` (annonces relevées),
  `inventaire_doublons` / `inventaire_doublons_verifies` / `rapprochements` /
  `inventaire_fusions` (jumeaux et fusions), `photo_empreintes` (+`_echecs`),
  `vinted_republish_captures` / `vinted_listing_snapshots` (captures),
  `republish_creneaux`, `republish_auto_serveur_comptes`, `ventes`,
  `platform_health`, `sync_gardes_declenchees`, `sync_import_ecartes`,
  `categorie_journal`, `lens_scans`, `email_destinataires`.

## Fonctions edge et leur `verify_jwt`

Relevé par `functions list` le 27/09 : **48 fonctions actives, 23 en
`verify_jwt = false`**. Il se périme : le geste de `supabase/AGENTS.md` fait foi. Les
numéros de version ne sont pas recopiés ici exprès (ils ne se suivent pas
d'une fonction à l'autre ; ne jamais en écrire un sans l'avoir lu).

**`verify_jwt = false`**, et pourquoi :
- *Appelées par pg_cron (garde `x-cron-secret`)* : `handler-watch`,
  `ebay-api-worker`, `republish-auto-sweep`, `email-tunnel` (crons + trigger
  `handle_new_user`), `ops-digest`, `republish-purge`, `lens-temp-purge`
  (jamais de purge côté client : un client ne voit que SON scan),
  `doublons-balayage`, `beebs-lien`, `ebay-ventes-sync`,
  `stripe-recalage-1er-du-mois` (tâche unique du 01/10, à supprimer ensuite).
- *Webhooks externes (vérifier la signature)* : `stripe-webhook`,
  `apple-iap-webhook`, `google-play-webhook`, `ebay-account-deletion`,
  `ebay-oauth-callback` (redirection eBay).
- *Appel public assumé* : `email-desinscription` (lien des emails ; à `true`
  il bloquerait toute campagne), `apple-subscription-status`,
  `apple-notification-history`.
- *Garde maison* : `resolve-categorie` (app avec JWT + worker eBay avec
  secret de cron), `voice-intent` (Bearer + getUser maison),
  `update-job-status` et `check-listing-status` (appelées par l'extension ;
  `false` déclaré dans `config.toml`, garde propre).

**`verify_jwt = true`** (appelées par l'app ou l'extension avec un JWT) :
`get-pending-jobs` (le guichet de l'extension), `generate-listing`,
`lens-analysis`, `voice-parse`, `voice-transcribe`, `deal-analysis`,
`stats-analysis`, `normalize-title`, `lot-distribute`, `fetch-ebay-aspects`,
`ebay-account`, `ebay-oauth-start`, `extension-session`,
`republish-capture-photos`, `photo-empreinte`, `create-checkout-session`,
`cancel-subscription`, `stripe-portal`, `validate-apple-receipt`,
`validate-google-purchase`, `validate-coin-purchase`, `delete-account`,
`send-bug-report`, `send-extension-link`, `envoi-ponctuel` (la porte des
mails : garde maison en plus, seule la clé de service passe).

Les plus sensibles (tout le parc en dépend) : `get-pending-jobs`,
`update-job-status`, `handler-watch`, `ebay-api-worker`. Un défaut dans l'une
d'elles touche les 5 plateformes ; toujours lire ce que le changement touche
chez les autres plateformes avant de déployer.

## Crons et triggers récents

⚠️ `cron.timezone` = **GMT** : les horaires ci-dessous sont en UTC (Paris =
UTC+2 l'été). Relevé du 27/09, 15 jobs actifs ; `cron.job` en prod fait foi.

| jobid | nom | horaire (UTC) | cible |
|---|---|---|---|
| 2 | email-tunnel-daily | `0 9 * * *` | fonction `email-tunnel` |
| 3 | coins-monthly-sweep | `15 4 * * *` | SQL `grant_monthly_coins_sweep()` |
| 4 | ops-digest-daily | `50 8 * * *` | fonction `ops-digest` (le rapport du matin) |
| 5 | handler-watch-3min | `*/3` | fonction `handler-watch` |
| 7 | email-tunnel-job-relaunch-hourly | `0 * * * *` | `email-tunnel` (relances) |
| 8 | expire-publish-reservations-daily | `20 3 * * *` | SQL `expire_publish_reservations()` |
| 9 | republish-purge-daily | `40 3 * * *` | fonction `republish-purge` |
| 10 | publish-sans-lien-echec-daily | `30 3 * * *` | SQL `fail_publish_without_listing_url(...)` — le « balayage de nuit » ; ne touche plus jamais un dépôt Beebs sans lien |
| 12 | ebay-api-worker-2min | `*/2` | fonction `ebay-api-worker` |
| 13 | republish-auto-sweep-3min | `*/3` | fonction `republish-auto-sweep` |
| 14 | lens-temp-purge-daily | `50 3 * * *` | fonction `lens-temp-purge` |
| 15 | ebay-ventes-sync-daily | `40 4 * * *` | fonction `ebay-ventes-sync` |
| 16 | beebs-lien-5min | `*/5` | fonction `beebs-lien` (index public Beebs : trace seulement, ne clôt rien) |
| 17 | doublons-balayage-2min | `*/2` — **inactif depuis le 28/09** | fonction `doublons-balayage` → RPC `rapprochement_urls_a_empreinter` (3 s), `rapprochement_photos_decider` (annonces, 4 s), puis `doublons_reserver_fiches` / `doublons_examiner_fiche` (une fiche par appel) / `doublons_liberer_fiches` — chaque appel sous les 8 s de l'appelant (migration 20260927190000) |
| 18 | recalage-xewer-1er-oct | `*/5 0-3 1 10 *` | SQL `recalage_xewer_tick()` — tâche unique du 01/10, se désinscrit seule |
| 20 | fusion-photo-1min | `* * * * *` | SQL `SET statement_timeout = '8s'; SELECT fusion_photo_tick()` (30/09 soir) — UN compte par passage : annonces de relevé en attente de photo (`rapprochement_photo_attente`, rattachées par `rapprochement_photo_decisions` ou relâchées vers l'import), puis empreintes des couvertures des SEULES fiches créées par une synchro (`fusion_photo_file`) ; jamais de fusion, jamais de relecture du stock entier ; > 2 000 fiches en stock = pas de preuve photo. Coupure : moyenne `get-pending-jobs` > 2 s ou p90 > 4 s. Inverses : `supabase/rollbacks/20260930215000_*`, `211500_*`, `203000_*` |
| 22 | fusion-photo-lot-10min | `*/10` — **inactif (30/09 soir, à rallumer sur mesure)** | SQL `SET statement_timeout = '30s'; SELECT fusion_photo_lot(12000)` — fusions par la photo des comptes « pret », une seule mise en route (5–6 s) par lot |

Tous les appels HTTP passent par `net.http_post` avec le header
`x-cron-secret` (valeur jamais recopiée). Un cron « succeeded » dans
`cron.job_run_details` veut seulement dire que la requête a été mise en file :
le vrai résultat est dans `net._http_response` (purgé vite) et les logs de la
fonction.

**Triggers posés récemment (26-27/09)**, à connaître avant de toucher
`cross_post_jobs`, `inventaire`, `profiles`, `vinted_sync_runs` (liste
complète : `pg_trigger`) :
- `cross_post_jobs_needs_user_motif` — tout `needs_user` reçoit un motif.
- `cross_post_jobs_lien_jamais_croise` — une annonce n'est jamais portée par
  deux articles (seul l'identifiant certain Leboncoin fait foi ; sinon refus
  + trace `lien_refuse`).
- `cross_post_jobs_voie_ebay` / `cross_post_jobs_voie_stable` — un compte
  eBay relié publie par l'API ; un job ne change de voie qu'une fois.
- `releve_clos_tranche_publications` (sur `vinted_sync_runs`) — verdict
  « dépôt jamais mis en ligne » rendu à la CLÔTURE d'un relevé complet.
- `vinted_sync_runs_leve_alertes_disparues` — la clôture d'un relevé qui
  revoit une annonce lève l'alerte « plus en ligne » (LBC, eBay, Beebs, Opla ;
  Vinted garde son propre mécanisme).
- `releve_reussi_relance_connexion` (relevé) et `profiles_session_revue_bonne`
  (sonde) — une session prouvée bonne relance tout de suite les jobs parqués
  pour « connexion » (échelonnés, 6 fois au plus par 24 h).
- Garde des relevés : `garde_cadence_sync_runs`,
  `garde_pause_antirobot_sync_runs`, `garde_releve_vide_sync_runs`,
  `releve_hors_liste_ecarte`.
- RPC : `spend_coins_and_publish` refuse `jumeau_en_ligne` et ne réécrit plus
  les photos de la fiche ; `spend_coins_and_republish` refuse
  `pause_antirobot` pour l'automatique Vinted.
