# Extension Chrome : versions servies, relances, poste de Nico

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- « Servi » — versions servies (extension, web, OTA, fonctions) (ex-L277-295)
- 06/10 soir — un échec qu'une extension corrige repart seul (ex-L323-328)
- 04/10 — boucles (onglet muet, canal coupé) (ex-L364-365)
- 03/10 — le dossier de l'extension de Nico se lit dans Chrome (ex-L373-376)

<!-- ex-CLAUDE.md L277-295 : « Servi » — versions servies (extension, web, OTA, fonctions) -->
- **Servi** : extension **0.6.104 `0cec9e6` SERVIE** par le CWS (23 comptes le 09/10
  vers 01:00 ; zip rangé dans `build/anciens-zips/`, ajoutée à ALREADY_PUBLISHED) ;
  **0.6.105 (Depop) À TÉLÉVERSER** : `build/CWS-0.6.105-A-TELEVERSER/` (zip seul,
  BUILD_ID 2026-10-08T23:39:13Z+8f88cdd) ; 0.6.102 servie avant (b230ebe) ;
  **0.6.103 JAMAIS téléversée** ; jamais
  d'EXTENSION_MIN_BUILD sans décision de Nico ; **minimum serveur 0.6.81** (inchangé : forcer la MAJ = décision de
  Nico) ; web et OTA **2.9.86** (12/10 nuit, build `2026-10-11T20:26:41Z+0a1ff78`) ; `get-pending-jobs` v241 (12/10 nuit, ISBN) ; avant : v239 (11/10 nuit, Depop), v237 (11/10 soir ; v231 le 10/10 : créneaux = liste du serveur + republication auto Depop), `photo-empreinte` v3,
  `generate-listing` v117 (12/10 nuit, `resolve_isbn`), `lens-analysis` v107, `avis-demande` v4,
  `deal-analysis` v42, `voice-transcribe` v46,
  `ebay-account` v16, `send-extension-link` v13 (`true`) ;
  `rapprochement` v19 (11/10 nuit), `empreintes-urls` v5, `update-job-status` v134, `handler-watch` v102, `resolve-categorie` v15, `push-ventes` v10, `check-listing-status` v37, `voice-intent` v155, `ops-digest` v35,
  `ebay-api-worker` v85 (12/10 : lien « compte à finir »), `ebay-releve-api` v4, `releve-completer` v2,
  `veille-cpu` v2, `ebay-ventes-sync` v5, `ebay-oauth-callback` v10, `ebay-notifications` v5,
  `email-tunnel` v72 et `stripe-webhook` v57 (`false`) ; migrations
  20261008020000 / 030000 / 040000 (multi-synchro) appliquées — ⚠️ depuis le 05/10 15:55,
  `invoice.payment_failed` / `payment_action_required` sont COCHÉS chez Stripe : le
  mail « paiement échoué » part au client, TOUTES formules ; migrations Cloud
  20261004233000 + 20261005120000 appliquées (reprise : `docs/cloud/REPRISE.md` § 0 bis). ⚠️ Le 30/09 22:52, le changement de `CRON_SECRET` a monté TOUTES
  les versions d'un cran sans changer le code.

<!-- ex-CLAUDE.md L323-328 : 06/10 soir — un échec qu'une extension corrige repart seul -->
- **⛔ UN ÉCHEC QU'UNE EXTENSION CORRIGE REPART SEUL DÈS QUE LE POSTE L'A (06/10
  soir, Glowik)** : `_shared/relance-apres-maj.js` (une entrée par défaut :
  plateforme, action, début d'`error_technique.brut`, BUILD_ID qui corrige) ;
  handler-watch v89 relance UNE fois (geste « Relancer », marqueur
  `relance_apres_maj`) quand `profiles.extension_build` atteint ce build. Toute
  nouvelle extension qui corrige un arrêt « relancer » y ajoute son entrée.

<!-- ex-CLAUDE.md L364-365 : 04/10 — boucles (onglet muet, canal coupé) -->
- **Boucles (04/10)** : 3ᵉ onglet muet / 4ᵉ canal coupé de suite →
  needs_user « relancer », `boucle_technique` en rouge dans l'ops-digest.

<!-- ex-CLAUDE.md L373-376 : 03/10 — le dossier de l'extension de Nico se lit dans Chrome -->
- **Le dossier de l'extension de Nico se LIT dans Chrome** (03/10) :
  `Default/Secure Preferences`, `extensions.settings.pedhgegmgjkdcbdeinjnhdpemnpafpdp.path`
  (location 4 = non empaquetée) ; on copie le build DANS ce dossier, puis on
  relit `profiles.extension_build` après son « Recharger ».
