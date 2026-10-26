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

## 18/10 après-midi — le PC reste éveillé tant qu'il reste UN job (décision de Nico)
- **Plus de plafond de 4 h.** L'extension garde le PC éveillé (`chrome.power.requestKeepAwake("system")`, jamais
  l'écran) tant qu'il reste UN job en attente ou en cours pour CE poste ; elle relâche dès que la file est vide.
  Filets : plus de session (relâche immédiate) ; **2 h sans un seul poll réussi** (`EVEIL_SANS_POLL_MS`, serveur
  injoignable, 401) ; démarrage du service worker (épisode frais < 2 h : re-demandé). Un job en cours et une
  publication lancée du popup demandent l'éveil ; l'épisode se rafraîchit entre deux jobs d'un long cycle.
- **Le serveur compte toute la file de CE poste** (`get-pending-jobs` v261, `jobs_retenus_sync`, lu par toutes les
  versions) : créneau lointain, limite du jour, pause anti-robot compris ; seuls les jobs d'un AUTRE poste (boutique
  ouverte ailleurs, réservés par lui) ne tiennent pas celui-ci éveillé. Le plafond de 4 h ne disparaît qu'avec la
  **0.6.127** (à téléverser APRÈS l'acceptation de la 0.6.126). Selftest `eveil-file`. Texte de `Legal.jsx` (permission
  `power`) aligné.
- **0.6.130** (22/10 soir, à téléverser) : contient toute la 0.6.129. ⛔ Le verrou de flux (`withJobFlowLock`) n'est PAS
  réentrant : une fonction appelée DANS le poll n'appelle jamais une fonction qui le reprend (`fetchVintedItemDetail`) —
  utiliser la version « sous verrou » (`lireDetailVintedSousVerrou`), sinon toute la file se fige. Le dossier
  `FillSell-Extension-Nico` ne se recharge pas seul : y copier un build sans que Nico recharge laisse un état mélangé —
  ne pas le faire.

## ⛔ 25/10 matin — AUCUN bandeau « mets à jour ton extension » (décision de Nico)
- `EXTENSION_MIN_BUILD` (scripts/build-id.mjs, `_shared/version-min-extension.js`) ne bouge PLUS : ni pour la 0.6.141,
  ni pour la 0.6.142, ni pour la 0.6.143. Le printout de `package:extension` qui propose de le poser après une
  acceptation ne s'applique pas. Les correctifs arrivent par la mise à jour automatique du Chrome Web Store (et
  `requestUpdateCheck` toutes les 2 h) ; un arrêt qu'une version corrige repart seul (`_shared/relance-apres-maj.js`) ;
  une règle qui exige une version (ex. ISBN « 0000000000 ») RETIENT le job en silence avec un message neutre
  (« part dès que ton extension se sera mise à jour toute seule — rien à faire »), jamais un bandeau ni « mets à jour ».

## ⛔ 25/10 après-midi — 0.6.144 : une RPC rend sa réponse ; le pont survit aux mises à jour (rapport `docs/enquetes/import-publier-ailleurs-2510/RAPPORT.md`)
- `restRequest` : tout `rpc/…` rend sa réponse (corps vide → null), quel que soit `Prefer`. De la 0.6.130 à la 0.6.143, la
  réponse de toute RPC appelée sans `return=representation` était JETÉE : `lectures_origine_en_attente` (le lecteur de
  secours n'a jamais rien lu), `file_etat_poste` (pause et synchro entre deux tâches jamais vues),
  `noter_formats_colis_beebs` (compte rendu 0). ⛔ Un selftest qui vérifie la présence d'un appel ne prouve rien : il faut
  EXÉCUTER le code (`scripts/lecture-page-publique-selftest.mjs` extrait les fonctions de background.js et les joue).
- Chrome ne réinjecte pas un script de contenu dans un onglet déjà ouvert quand l'extension se met à jour :
  `reinjecterPontFillsell` (onInstalled install/update) réinjecte `content-scripts/fillsell-auth.js` dans les onglets
  fillsell.app ouverts ; le script ne se lance pas deux fois dans le même monde isolé (`__fillsellPontActif`) ; une copie
  coupée de son extension se tait, ne se déclare plus présente et poste `__fillsellPontMort`. Prouvé sur le poste de
  Nico le 25/10 (onglet ouvert à 13:45, mise à jour à 14:12, réponse en 1 ms sans recharger l'onglet).
- Les versions ≤ 0.6.143 restent sans réinjection : leur pont meurt à chaque mise à jour jusqu'au rechargement de
  l'onglet — la page (OTA) le constate en 1,5 s et propose « Recharger la page ».
- Le poste de Nico a tourné le 25/10 sur des builds `-dirty` (pilote de la lecture de fond) ; le serveur ne lit que
  l'horodatage du BUILD_ID (`posteExtensionCompatible`), le suffixe est sans effet.

## 26/10 — 0.6.146 REFAITE (urgence lenteur) — un seul zip à téléverser
- `build/CWS-0.6.146-A-TELEVERSER/fillsell-extension-0.6.146-4ade5e1-cws.zip` (BUILD_ID `2026-10-26T07:44:08Z+4ade5e1`) :
  la 0.6.146 de la nuit + lecture de fond qui cède le verrou, maintenance du poll après une demande de l'écran,
  pré-rempli Leboncoin départagé, plus de faux « poids introuvable ». L'ancien zip (ebdc605) est dans `build/CWS-PERIMES/`.
  Les constantes BUILD_VINTED_MODELE_REPLI / BUILD_VINTED_MARQUE_CREEE (00:53:28Z) restent valables (≤ ce build).
- Le dossier `FillSell-Extension-Nico` : une copie du build y a été prise par le poste de Nico (0.6.146 4ade5e1 annoncée
  à 09:00) — voir le rapport pour le test réel.

## 26/10 nuit — 0.6.148 (urgence Johan) : le SEUL zip à téléverser
- `build/CWS-0.6.148-A-TELEVERSER/` : la 0.6.147 + la relecture avant redépôt (`devant: true`, servie par
  get-pending-jobs) en TÊTE de cycle, puis repoll ; un seul poll en attente du verrou (l'alarme ne les empile plus).
  Les zips 0.6.146 et 0.6.147, jamais téléversés (dernière servie : 0.6.144), passent dans `build/CWS-PERIMES/`.
- Les versions ≤ 0.6.147 font la relecture en fin de cycle : sur un ordinateur qui dort, le serveur la relance une
  fois puis le dit à la personne (`_shared/releve-verif-non-pris.js`).
