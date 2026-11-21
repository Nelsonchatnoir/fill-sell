# Extension Chrome : versions servies, relances, poste de Nico

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

- ⛔ 06/11 — version minimum abandonnée définitivement : aucune retenue par build (en fin de fichier)
- 04/11 soir — un poste lent garde sa première page (patience apprise) ; Vinted « conditions d'utilisation » nommé (en fin de fichier)
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
  ⛔ (12/11, point 1c) Jamais quand l'arrêt a été écrit par un build qui avait DÉJÀ le correctif (`handler_build` du
  job ≥ `buildMin` : `arretApresLeCorrectif`) — compte 2bde8576, 479f51c0 relancée « corrigé par la 0.6.150 » sur un
  arrêt d'une 0.6.186. Build illisible, ou arrêt posé par le serveur (`tache_sans_demarrage`, `build_min_requis`) : la
  règle d'avant.

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

## 29/10 — la présence bat aussi pendant un long travail (lot A point 5)
- `profiles.extension_last_seen_at` n'était stampé que par get-pending-jobs en tête de cycle : une recréation de 36 min
  (Johan, 098cab75) passait pour un poste éteint. Extension ≥ 0.6.153 : battement `rpc/battement_extension` toutes les
  5 min tant qu'un flux tient le verrou (setTimeout en chaîne, 36 au plus, seulement sans poll depuis 5 min ; migration
  `20261029150000_battement_extension`). handler-watch : un poste qui bat sur CE job n'est jamais « arrêté » ; l'alerte
  « hors ligne sans recréation » ne part pas pour un poste éteint (aucun signe depuis 10 min), revenu depuis < 30 min ou
  occupé ailleurs (< 2 h) — seulement pour un poste vivant, libre, qui ne recrée pas.
- ⛔ **29/10 soir — une relance « au build qui corrige » épingle le job à ce build** (thibault.andrieux : un poste en
  0.6.152, un vieux en 0.6.149). `champsRelanceCauseLevee` (`_shared/recreation-bloquee.js`) et `champsRelance`
  (`_shared/relance-apres-maj.js`) posent `build_min_requis` = le build de la cause (jamais abaissé) : get-pending-jobs ne
  sert alors le job qu'à un poste à jour ; un autre poste du compte, plus ancien, ne le reprend plus pour retomber sur le
  même mur (la relance est unique). Une cause corrigée par le serveur (sans `buildMin`) n'exige aucun build.

## 29/10 (lot B) — plus de poll en boucle ; une republication retenue n'empêche plus la mise à jour
- **Boucle** (prouvée par les request_id UUIDv7 : 194 ms entre deux polls, 826 à 913 polls/h au lieu de ~30) : la
  maintenance de fond cédait le verrou dès qu'un poll attendait (0.6.146) et un poll repartait 1,5 s après — pendant le
  poll suivant, donc toujours « attendu ». Règle (`decisionPollImmediat`, background.js) : un poll immédiat seulement pour
  une raison NEUVE, jamais deux fois de suite la même, plancher 20 s ; un geste (Synchroniser) reste servi en 1,5 s ; la
  maintenance ne cède jamais deux cycles de suite. Selftest `repoll-borne` (182 → 7 polls en 10 min). Les postes 0.6.146
  → 0.6.155 gardent la boucle jusqu'à la 0.6.157 (Chrome Web Store ; la 0.6.156, jamais téléversée, est remplacée) ou un redémarrage de Chrome.
- **Mise à jour refusée sans fin** (4.11, cas 2189c4d8) : une republication à l'étape 'deleted' RETENUE par le serveur
  (dressing relu attendu) ne compte plus comme « recréation en jeu » : get-pending-jobs rend `retenues_deleted`, valable
  10 min. Un report de mise à jour se trace (usage_logs `maj_extension_reportee`, une par heure et par poste).
- Constat 29/10 : abenjemaa, labouquinerie85, bigfoutte09 éteints depuis le 28/10 au soir (avant la 0.6.152 au CWS) ;
  chaowx1305 mis à jour 3 min après son retour.

- **0.6.161 (30/10 soir, lot E finition + urgence Louis)** : la 0.6.160 (jamais téléversée) + étape « recreated »
  comprise, adsubmit sans confirmation = dépôt inachevé, navigateur réel et rendu graphique envoyés au serveur
  (`navigateur`, `rendu_graphique`), lectures Leboncoin coupées pendant un blocage, « Pour qui ? » avant la taille des
  accessoires Vinted, matière Depop. EXTENSION_LAST_COMMIT recalé sur le dernier commit qui touche `chrome-extension/`.

## ⛔ 31/10 (lot F, Sébastien) — l'extension se rétablit seule après une mise à jour (0.6.162 ; rapport `docs/enquetes/lot-f-3110/RAPPORT.md`)
- Chrome EFFACE les alarmes d'une extension à sa mise à jour ; `runtime.onInstalled` peut ne pas arriver (mise à jour posée
  par Chrome pendant que l'ancien worker était arrêté) : la 0.6.161 de Sébastien a démarré quatre fois sans jamais poller
  (plus d'alarme), sans ping ni journal `maj_extension`. Règle : **tout ce qui doit exister à chaque démarrage se pose à
  chaque démarrage** (bloc `Promise.resolve().then(...)` en fin d'évaluation : `planifierAlarmes`, puis
  `constaterVersionAuDemarrage`), jamais seulement dans `onInstalled` / `onStartup`.
- Une mise à jour se constate sans `onInstalled` (version vue `fillsell_version_vue`, ou trace de rechargement de
  l'ancienne version) : journal `maj_extension` (`constatee_au_demarrage`) envoyé tout de suite, poll en 5 s.
- `veillerPoll` (démarrage, chaque alarme, chaque appel de la page) : poll muet depuis 8 min sans verrou tenu → relancé ;
  verrou tenu 40 min sans job commencé ni progrès → `chrome.runtime.reload()` **2 fois par 6 h au plus**, jamais pendant un
  job (`travailEnCours`), une republication supprimée en mémoire, ni quand `raisonsDeNePasRecharger` dit non (base) ;
  trace `extension_redemarrage_auto`. Le progrès se note dans `demarrerBattementPresence` (prise/sortie du verrou), au début
  d'un job et au poll réussi (`fillsell_dernier_poll_ok`).
- La présence annoncée par le pont de la page (`__fillsellExt`) ne prouve PAS que le service worker travaille : la page
  demande `FILLSELL_ETAT_COMPTE` (réponse `__fillsellCompte` : vivant, meme) ; seul `meme: false` prouve un autre compte.
- Essai sur le poste de Nico avec un harnais (copie non livrée : `onInstalled` neutralisé, alarmes effacées) : la méthode
  pour reprouver ce cas — voir le rapport.

## 01/11 après-midi — 0.6.164 : compte de travail délégué (délégation Leboncoin, Louis)
- Une extension peut travailler pour un SECOND compte FillSell, Leboncoin seulement, quand le serveur le dit (`delegations`
  au poll, délégation posée des deux côtés dans `beta_flags`) : session propre du compte délégué (`extension-session`,
  `delegation_pour`) rangée sous `fillsell_session_delegue_<compte>`, jamais la session de l'extension ni la garde
  anti-bascule ; cycle délégué sous le verrou de flux, après le cycle du compte ; tout s'écrit avec le jeton du compte
  délégué. Un poste dont le compte délègue (`blocages.leboncoin.etat = "delegue"`) ne touche plus Leboncoin, même de
  lui-même (sonde, relevé quotidien, pages d'annonce). Détail : `docs/regles/plateformes.md` § 01/11 après-midi.

## 01/11 soir — 0.6.165 : un onglet muet est vraiment montré, et il dit pourquoi il se tait (gjehly, Brave)
- Rapport `docs/enquetes/depot-vinted-muet-gjehly-0111/RAPPORT.md`. La fenêtre de travail ne montre que son onglet
  ACTIF (le porte-page `about:blank`) : « fenêtre visible » (`restaurerFenetrePourOngletMuet`) rend désormais l'onglet
  muet actif DANS LA FENÊTRE DÉDIÉE seulement (jamais une fenêtre de l'utilisateur, jamais le focus), même fenêtre
  déjà visible ; l'onglet neuf de la relance suivante aussi (`relancerOngletMuet(…, { montrer: true })`).
- `sonderOngletMuet` (après la relance, puis fenêtre visible) : lectures immédiates bornées à 4 s, monde isolé + monde de
  la page ; verdict dans `work_window_state.at_end.events` (`sonde_onglet_muet`), JAMAIS dans le message d'erreur
  (classement inchangé). Remède sur preuve seulement (`remedeOngletMuet`) : scripts du manifeste jamais reçus ET
  (document chargé, ou « loading » au formulaire hydraté par React) → les mêmes fichiers, injectés tout de suite.
- ⛔ Tout content script du manifeste garde au moins un `const` de premier niveau : c'est ce qui fait rejeter d'emblée un
  second passage (injection + `document_idle`) — jamais deux écouteurs.

## 02/11 — 0.6.166 : un attribut Vinted exigé et connu part dans l'envoi (XEWER, lot « check du 02/11 »)
- Langue du livre connue par son libellé → identifiant RELEVÉ en base (`idLangueLivreDuLibelle` : « Français » 6436 sur
  1 151 annonces capturées, « Anglais » 6435 sur 36 ; aucun autre) armé au POST ; la porte de la langue s'ouvre aussi
  sur l'étape ISBN qui a TROUVÉ le champ (`isbnChampVu`) ou sur une langue fournie. ISBN d'origine toujours remis TEL QUEL.
- Toute valeur connue (`vintedAspects`) que le formulaire n'a pas posée part par son identifiant, résolu sur la config de
  LA catégorie posée (`idAttributParLibelle` : une seule option de ce libellé, sinon rien) ; sonde
  `corpsAvecAttributsConnus` après les attributs d'origine : code laissé vide seulement, rayon armé, 15 min ; un refus
  dit les attributs posés par la sonde.
- Les remises en ligne bloquées sur un champ connu repartent UNE fois dès que le poste a ce build
  (`BUILD_ATTRIBUTS_CONNUS` = EXTENSION_LAST_COMMIT 2026-11-02T08:48:22Z, `_shared/recreation-bloquee.js`).

## ⛔ 02/11 nuit — 0.6.169 : un rechargement ne crée plus de fenêtre de travail en laissant l'ancienne (demande de Nico)
- **Cause** (rejouée par `selftest:fenetre-travail-rechargement` : 9 cas sur 12 rouges sur la 0.6.168) : un rechargement
  ou une mise à jour vide `storage.session` ; l'onglet de travail dont la plateforme a réécrit l'URL (sans
  `#fillsell-worker`, Vinted sur son accueil typiquement) comptait « utilisateur » ; `resolveWorkWindow` « rendait » alors
  SA fenêtre du registre (oubliée, jamais fermée) et en créait une neuve — à chaque rechargement. Le ménage des orphelins
  (24/09) jugeait le même onglet « à nous » : deux règles contradictoires.
- ⛔ **Le porte-page `about:blank#fillsell-worker` est INVISIBLE à l'extension** (sans permission « tabs » : adresse vide,
  `chrome.scripting` refusé — mesuré le 02/11) ; un onglet de la personne sur un site hors permissions d'hôte (Gmail…)
  est tout aussi illisible. Jamais conclure « fenêtre à nous » ni « fermable » sur des onglets illisibles.
- **Règle unique** (`compterOngletsFenetre`, utilisée par la résolution, l'adoption, la consolidation, le plafond et
  `fermerFenetresAvantMaj`) : fenêtre du REGISTRE (storage.local) sans onglet utilisateur visible → à nous, onglets de
  plateforme compris ; fenêtre HORS registre → à nous seulement sur preuve (réduite, onglets de plateforme tous au drapeau
  `autoDiscardable:false` — posé sur chaque onglet de travail depuis le 08/10 —, au plus un onglet illisible, en tête) ;
  **fermée ou adoptée seulement si `fermable`** (à nous ET au plus un onglet illisible, en tête). L'ancienne
  consolidation (« utilisateur === 0 ») fermait une fenêtre de la personne qui portait notre onglet de repli et un onglet
  illisible — corrigé du même geste.
- Ids des onglets de travail **durables** (`fillsell_onglets_travail_connus`, storage.local, alimentée par toute écriture
  d'une clé `fillsell_work_tab_*`, purgée des onglets disparus et à `onStartup`) ; l'onglet rendu à la personne (Leboncoin
  « Valider et payer ») en sort et perd notre drapeau. `getOrCreateWorkTab` retrouve l'onglet sans fragment par cet id.
- Limite dite : après un redémarrage COMPLET de Chrome avec « reprendre là où vous en étiez », un onglet restauré sans
  fragment perd aussi le drapeau → il reste à la personne (jamais fermé sur une supposition).
- Livrable : `build/CWS-0.6.169-A-TELEVERSER/fillsell-extension-0.6.169-cws.zip` (BUILD_ID `2026-11-02T20:10:27Z+02b1390`,
  SHA-256 26634e94…, empaqueté depuis un worktree propre de HEAD : l'arbre portait les docs d'un autre terminal) ; contient
  la 0.6.167 et la 0.6.168 (jamais téléversées, rangées dans `build/CWS-PERIMES/…-remplacee-par-0.6.169`).
  EXTENSION_LAST_COMMIT = 2026-11-02T20:08:13Z ; EXTENSION_MIN_BUILD non touché.
- Copie Cloud seulement : onglets de travail Leboncoin, Beebs, Depop sans tâche depuis 5 min FERMÉS en fin de cycle (pas `chrome.tabs.discard` : la page s'y recharge aussitôt)
  (rapport `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 26).

## 04/11 soir — un poste lent garde sa première page ; les conditions d'utilisation Vinted sont nommées
Récit : `docs/enquetes/problemes-rouges-0411/RAPPORT.md` § 2 et § 6.
- `getOrCreateWorkTab` : l'âge de la page au premier « pong » (ou atteint à l'échec) est noté par plateforme
  (`fillsell_reveil_onglet`, 10 mesures). La PREMIÈRE page reçoit 1,5 × p80, plafond 90 s, dès 3 mesures et si ≥ 20 s ;
  sinon la règle d'avant à l'identique (10 s, ping sans réponse = muet, rechargement puis onglet neuf). Ne jamais
  raccourcir ces bornes sans relire les mesures d'un poste lent (gjehly : ouverture médiane 85 s).
- Vinted renvoie vers `/terms_and_conditions` : attente nommée `vinted_conditions_a_accepter` (MURS_SANS_QUESTION),
  jamais une reprise ; la page le dit avant sa garde, le background le lit sur l'onglet au canal coupé, le serveur le
  nomme pour les postes d'avant (`_shared/vinted-conditions.js`, adresse datée < 5 min, après la dernière relance).
- Livrable : `build/CWS-0.6.171-A-TELEVERSER/fillsell-extension-0.6.171-cws.zip` (BUILD_ID `2026-11-04T19:49:41Z+29ba667`,
  SHA-256 861d92b4…cac88) ; contient la 0.6.170 (jamais servie, `build/CWS-PERIMES/CWS-0.6.170-remplacee-par-0.6.171`).

## 05/11 — 0.6.172 téléversée ; 0.6.173 préparée, sans zip
- 0.6.172 (la 0.6.171 de 5183f26, numéro seul) TÉLÉVERSÉE le 04/11 au soir : dans ALREADY_PUBLISHED.
- 0.6.173 : compte bloqué Vinted au dépôt, 503 « auth_indisponible » rejoué, refresh sans réponse de l'Auth sans purge.
  Pas de zip avant la décision de Nico.
- Paquet depuis un worktree : remettre l'arbre en LF avant la suite (`git rm --cached -r -q . && git -c core.autocrlf=false
  reset -q --hard <sha>`), sinon faux rouges CRLF ; une suite à la fois (4 tranches parallèles = arrêt mémoire).

## 05/11 soir — 0.6.175 préparée, sans zip : session Leboncoin partagée (décision de Nico)
- La 0.6.174 + la règle « session Leboncoin partagée » (`docs/regles/plateformes.md` § 05/11 soir) : un relevé, un
  budget de pages d'annonce, aucune lecture de routine la nuit, pour tout navigateur qui exécute Leboncoin pour un autre
  compte (délégation). Compte seul : rien ne change. Selftest `lbc-session-partagee-rythme` (24 h simulées).
- Manifest 0.6.175 ; `FILLSELL_BUILD` daté du 05/11 soir. EXTENSION_LAST_COMMIT à recaler APRÈS le commit de l'extension
  (horodatage UTC LU, dans un commit qui ne touche pas `chrome-extension/`) ; EXTENSION_MIN_BUILD non touché ; aucun
  changement serveur requis.

## ⛔ 06/11 — version minimum ABANDONNÉE DÉFINITIVEMENT (décision de Nico)
- `EXTENSION_MIN_BUILD` ne se pose JAMAIS plus (valeur figée au 2026-10-17T18:16:49Z, 0.6.124) ; il ne nourrit que le
  bandeau d'INFORMATION de l'app (« une nouvelle version existe : ta file continue de tourner »). `package-extension.mjs`
  ne dit plus de le poser ; 0.6.175 ajoutée à ALREADY_PUBLISHED (servie la nuit du 05 au 06/11).
- Supprimé : la porte « poste sous le seuil » de get-pending-jobs (file vide + `extension_update_required`), le 409
  « Mets l'extension à jour » d'update-job-status, le filtre par job `build_min_requis` (le champ reste une trace),
  les retenues par build (Beebs < 0.6.83 et < 0.6.95, colis Vinted < 0.6.84, preuves de retrait < 0.6.80, Opla < 0.6.74,
  ISBN « mise à jour », pause marque réservée au poste à jour), la pause `pauseAttente` (needs_user_source
  « build_min_requis ») de handler-watch, l'écran « En pause — mise à jour de l'extension » de l'app.
- Reste (ce n'est pas une retenue) : les relances UNE fois quand le poste a le build (relance-apres-maj, correctifs
  d'extension, livres gelés) ; une remise en ligne bloquée se relance tout de suite, quel que soit le build, et garde
  UNE relance de plus au build si la première a eu lieu sous le build ; les adaptations de capacité (champ servi en plus
  à un poste récent). Une pause posée avant le 06/11 se relance par « …_en_pause » quand le poste a le build.
- Exception gardée : `posteApresDefaut` — un job arrêté par une exception de NOTRE code n'est pas rendu au build qui a
  planté (update-job-status le remet en pending +30 min, sans compteur : sans cette garde, le même build replanterait
  toutes les 30 min, sans fin) ; même famille : les dépôts eBay d'un poste dont le build a prouvé « retours non posés ».
- Garde-fou : `npm run selftest:aucune-retenue-par-version` (toute comparaison nouvelle du build du poll doit être nommée).

## 06/11 soir — 0.6.176 : la marque de compatibilité n'est plus jamais gardée (Louis, « SEB », décision de Nico)
- La 0.6.175 + Leboncoin : un pré-rempli de marque que l'article ne cite que « pour… » (compatibilité) n'est plus jamais
  gardé ; « Sans marque » est posé par son identifiant (`docs/regles/plateformes.md` § 06/11 soir). Copie identique de
  `_shared/marque-compatible.js` dans `content-scripts/leboncoin.js` (selftest `marque-compatible`).
- La série des remises de Louis (rangs « SEB ») attend ce build (`exige_version` de la série, propre à la réparation —
  aucune retenue générale par version).
- Livrable : `build/CWS-0.6.176-A-TELEVERSER/fillsell-extension-0.6.176-cws.zip` (BUILD_ID `2026-11-06T20:36:04Z+3becc6d`,
  604 Ko, 37 entrées), EXTENSION_LAST_COMMIT = 2026-11-06T20:35:35Z (618edc4). À téléverser par-dessus la 0.6.175.

## 07/11 — 0.6.177 : lot « Problèmes » points 1-10 (rapport `docs/enquetes/lot-0711/RAPPORT.md`)
- La 0.6.176 + : borne de remplissage (« abandon » : aucun clic d'envoi après la borne ; phases Beebs relayées ; borne
  `fill_borne_ms` 10-25 min ; pré-vol > 70 % de la borne = AUCUN retrait) — ⚠ port seulement pour `beta_flags.keepalive` ;
  couleur Vinted (relue après fermeture, posée au POST quand la page la laisse vide, vide alors que la copie en porte une =
  arrêt AVANT retrait) ; référentiels Vinted relus 2 fois sur erreur réseau/5xx ; dimensions de colis Vinted non
  résolubles (message vrai) ; rayon « neuf seulement » = attente de la personne sans réessais ; statuts du relevé
  Leboncoin comptés sur identifiants uniques ; texte des photos hors FillSell rendu vrai (copie serveur vérifiée).
- Causes levées serveur qui l'attendent : `remplissage_borne_depassee`, `vinted_couleur_connue_non_posee`
  (`BUILD_BORNE_ADAPTATIVE` = 2026-11-07T10:30:00Z, `_shared/recreation-bloquee.js`).
- Livrable : `build/CWS-0.6.177-A-TELEVERSER/fillsell-extension-0.6.177-cws.zip` (BUILD_ID `2026-11-07T12:31:03Z+11e4acb`,
  607 Ko, 37 entrées), EXTENSION_LAST_COMMIT = 2026-11-07T12:29:47Z (f22d662). Seul zip à téléverser (remplace la 0.6.176,
  rangée dans `build/anciens-zips/REMPLACEE-PAR-0.6.177-CWS-0.6.176` ; la 0.6.175 publiée y est aussi rangée).

## 07/11 soir — 0.6.178 : décisions de Nico (rapport `docs/enquetes/lot-0711/RAPPORT.md` § Suite)
- La 0.6.177 + : arrêt à la borne pour TOUS les comptes (message simple : abandon envoyé à l'onglet, garde avant le clic,
  borne inchangée 300 s ; un job qui porte `fill_borne_ms` passe par le port, borne 10-25 min) ; Leboncoin : attente
  des critères réglée sur le poids des photos envoyées (30-120 s) et PNG de plus de 300 Ko allégé en JPEG s'il est plus
  léger (Sonia) ; Beebs : bandeau « Voir dans l'appli » écarté des attributs lus.
- Relance au build : `lbc_criteres_apres_photos` (`_shared/correctifs-extension.js`, `BUILD_LBC_CRITERES_APRES_PHOTOS`
  = 2026-11-07T14:34:17Z).
- Livrable : `build/CWS-0.6.178-A-TELEVERSER/fillsell-extension-0.6.178-cws.zip` (BUILD_ID `2026-11-07T14:34:17Z+bef6d20`,
  610 Ko, 37 entrées), EXTENSION_LAST_COMMIT = 2026-11-07T14:33:26Z (a1a6856). Seul zip à téléverser (contient la 0.6.177,
  rangée dans `build/anciens-zips/EN-TELEVERSEMENT-0711-CWS-0.6.177`).

## 07/11 nuit — 0.6.179 : lot du soir + urgence Goulvenk (rapport `docs/enquetes/lot-0711/RAPPORT.md` § Lot du 07/11 nuit, § Goulvenk)
- La 0.6.178 + : Leboncoin, « compte vu » seulement avec un jeton `luat` non expiré ; aucune requête de la veille des
  commandes ni du relevé des ventes avec un jeton périmé ; porte de connexion du relevé confirmée deux fois (1,2 s) et
  nommée dans le run (règle : `docs/regles/plateformes.md` § « 07/11 soir (urgence Goulvenk) »). Vinted : rayon de
  l'ancien arbre (arbre vivant), rayon refusé aux comptes Pro → question de rayon, référent des disparitions du
  dressing. Beebs : preuve de retrait d'une republication (deux 404 à 6 h au moins).
- Relance au build : `vinted_rayon_refuse_au_compte` (`_shared/correctifs-extension.js`,
  `BUILD_VINTED_RAYON_REFUSE_AU_COMPTE` = 2026-11-07T19:56:30Z).
- Livrable : `build/CWS-0.6.179-A-TELEVERSER/fillsell-extension-0.6.179-cws.zip` (BUILD_ID `2026-11-07T19:56:30Z+3c365ba`,
  613 Ko, 37 entrées), EXTENSION_LAST_COMMIT = 2026-11-07T19:56:07Z (72a36f2). Seul zip à téléverser (contient la
  0.6.178, rangée dans `build/anciens-zips/CWS-0.6.178-A-TELEVERSER`).

## 07/11 nuit — 0.6.180 : la remise en vente Leboncoin qui attend sa vendue se dit (rapport `docs/enquetes/louis-remises-lbc-0711/RAPPORT.md`)
- La 0.6.179 + la recopie de `_shared/etat-job.js` (`chrome-extension/etat-job.js`, générée) : une remise Leboncoin retenue
  parce que son annonce vendue est encore affichée est « En pause » (achat en cours, « Article vendu », relecture) puis,
  au-delà de 48 h, et SEULEMENT vente close, « À toi de jouer » (supprimer l'annonce vendue). ⛔ (08/11, Nico) Jamais
  pendant un achat en cours. Rien d'autre ne change dans l'extension.
- Le serveur qui pose la raison est en service depuis le 08/11 à 10:33 (get-pending-jobs v351).
- Livrable : `build/CWS-0.6.180-A-TELEVERSER/fillsell-extension-0.6.180-cws.zip` (BUILD_ID `2026-11-08T09:35:38Z+42fa425`,
  613 Ko, 37 entrées), EXTENSION_LAST_COMMIT = 2026-11-08T09:32:27Z (c8fc41d). Seul zip à téléverser (contient la
  0.6.179, rangée dans `build/anciens-zips/CWS-0.6.179-A-TELEVERSER`).

## 07/11 soir — essai TestFlight de Nico : jamais le bandeau « Mettre à jour l'extension » à un client Cloud
- `extBannerVisible` (App.jsx) = `bandeauMajExtensionVisible` (`src/cloud/voieCloud.js`) : extension « périmée » ET état
  Cloud lu (`useEtatCompteCloud`) ET pas client Cloud. Cause vue le 07/11 : le poste Cloud rafraîchit
  `profiles.extension_last_seen_at` à chaque relève (`get-pending-jobs`, sans toucher `extension_build`), et un vieux
  `extension_build` d'ordinateur (22/07) suffisait à allumer le bandeau — jusque sur l'iPhone. Côté serveur, le « vu il y
  a moins de 30 jours » reste pollué par le poste Cloud (non corrigé : `get-pending-jobs`, décision à prendre).
  Selftest `essai-testflight-0711`.

## 08/11 après-midi — 0.6.181 : les plateformes avancent ensemble (rapport `docs/enquetes/lot-0811-apres-midi/RAPPORT.md` § 1)
- La 0.6.180 + l'espacement de 2 min entre deux gestes de republication compté PAR plateforme (Vinted, Leboncoin,
  Beebs, Depop avancent ensemble, chacune à son rythme d'avant ; toujours une action à la fois) ; un retrait (vente) né
  pendant un cycle l'arrête entre deux tâches ; recopie d'etat-job (retrait Vinted sans session = « À toi de jouer »,
  pause de respiration par plateforme).
- Livrable : `build/CWS-0.6.181-A-TELEVERSER/fillsell-extension-0.6.181-cws.zip` (BUILD_ID `2026-11-08T14:57:08Z+0153a71`,
  613 Ko, 37 entrées), EXTENSION_LAST_COMMIT = 2026-11-08T14:52:14Z (264d6ac). Empaqueté depuis un worktree propre à HEAD
  (l'arbre partagé portait le travail non committé du terminal Cloud). Seul zip à téléverser : il REMPLACE la 0.6.180
  (jamais téléversée), rangée dans `build/anciens-zips/REMPLACEE-PAR-0.6.181-CWS-0.6.180`.
- Copie Cloud : **0.6.181-cloud** (CRX 0.6.181.44885) sur cloud-2 le 08/11 à 17:59, depuis 08bc9d7 (worktree propre :
  le main local portait un commit non poussé du terminal Cloud), sur autorisation nommée de Nico ; avant 0.6.178-cloud.

## 08/11 soir — 0.6.182 : le compte Leboncoin relevé (point 3 de Nico)
- La 0.6.181 + le compte Leboncoin du jeton de la page écrit sur le relevé et sur chaque annonce vue (`compteLeboncoinValide`,
  colonnes de la migration `20261108190000`, écrites seulement si elles existent). Rien d'autre ne change.
- Livrable : `build/CWS-0.6.182-A-TELEVERSER/fillsell-extension-0.6.182-cws.zip` (BUILD_ID `2026-11-08T18:30:10Z+bc358e9`,
  614 Ko, 37 entrées), EXTENSION_LAST_COMMIT = 2026-11-08T18:29:41Z (44d55b6). Empaqueté depuis un worktree propre à
  origin/main. SEUL zip à téléverser (Nico n'a téléversé ni la 0.6.180 ni la 0.6.181) : il contient toute la 0.6.181
  (espacement par plateforme, arrêt du cycle sur une vente, recopie d'etat-job) ; la 0.6.181 est rangée dans
  `build/anciens-zips/REMPLACEE-PAR-0.6.182-CWS-0.6.181`.

## 09/11 matin — 0.6.184 : le badge Leboncoin « Article vendu » d'avant le suivi (point 2 de Nico — Jess)
- La 0.6.183 + : sur une republication Leboncoin marquée par le serveur (`badge_vendu_avant_suivi`, get-pending-jobs), la
  page lue « sold » est une annonce EN LIGNE (la republication continue) et ne prouve jamais un retrait (`etatProuveAbsence`) ;
  recopie d'etat-job (`ebay_rayon_a_notre_charge` → « En pause — FillSell s'en occupe »). Rien d'autre ne change.
- Livrable : `build/CWS-0.6.184-A-TELEVERSER/fillsell-extension-0.6.184-cws.zip` (BUILD_ID `2026-11-09T09:46:04Z+6d36bb4`,
  617 Ko, 37 entrées), EXTENSION_LAST_COMMIT = 2026-11-09T09:00:49Z (4b432f8). Empaqueté depuis un worktree propre à
  6d36bb4. SEUL zip à téléverser. 0.6.183 lue servie (32 comptes en 2026-11-08T22:09:14Z+6c84532) : dans ALREADY_PUBLISHED.

## 09/11 soir — 0.6.185 : le lecteur des ventes Beebs réparé (louis-seller, commande 1723956)
- La 0.6.184 + : `lecteurCommandesBeebs` porte ses fonctions du flux RSC (envoyé seul dans l'onglet par executeScript,
  il plantait depuis la 0.6.132 : aucune vente Beebs lue depuis le 25/10) ; un échec de lecture de la page des ventes se
  trace (`usage_logs ventes_beebs_lecture_echec`). Rien d'autre ne change. Interrupteur `ventes_beebs_commandes` : 0.
- Livrable : `build/CWS-0.6.185-A-TELEVERSER/fillsell-extension-0.6.185-cws.zip` (BUILD_ID `2026-11-09T20:53:23Z+e00c214`,
  617 Ko, 37 entrées, sha256 417a0515…), EXTENSION_LAST_COMMIT = 2026-11-09T20:52:37Z (2bc123e). Empaqueté depuis un
  worktree propre à e00c214 (sous `build/`, supprimé ensuite). Vérifié dans le zip MINIFIÉ : 21 fonctions injectées sans
  référence extérieure, le lecteur Beebs reconstruit depuis son texte lit une commande. SEUL zip à téléverser.
  0.6.184 lue servie (83 comptes en `2026-11-09T09:46:04Z+6d36bb4`) : dans ALREADY_PUBLISHED, dossier rangé dans
  `build/anciens-zips/TELEVERSEE-CWS-0.6.184`.

## 10/11 — 0.6.186 : l'état « Neuf sans étiquette » confirmé dans la fenêtre Vinted (point 6 de Nico)
- La 0.6.185 + : depuis le 09/11, choisir « Neuf sans étiquette » ouvre (sur une partie des formulaires)
  `new-without-tags-education-modal` ; non confirmée, l'état n'entre pas dans le POST (400 « Le champ État doit être
  renseigné », recréations retirées puis perdues). `confirmerEtatVinted` (content-scripts/vinted.js) clique le bouton
  « Conserver » qui NOMME l'état posé, jamais « Passer à … » ; branchée sur les voies libellé, réponse et identifiant.
  Rapport : `docs/enquetes/republication-etat-neuf-sans-etiquette-1011/RAPPORT.md`. Selftest `vinted-confirmation-etat`.
- Livrable : `build/CWS-0.6.186-A-TELEVERSER/fillsell-extension-0.6.186-cws.zip` (BUILD_ID `2026-11-10T14:10:14Z+ba13a51`,
  618 Ko, 37 entrées, sha256 eb598b57…), EXTENSION_LAST_COMMIT = 2026-11-10T14:09:01Z (ba13a51). Empaqueté depuis un
  worktree propre à ba13a51. SEUL zip à téléverser. 0.6.185 lue servie (80 comptes) : dans ALREADY_PUBLISHED.
- Serveur (sans attendre le CWS) : `CORRECTIFS_EXTENSION` `vinted_etat_a_confirmer` (buildMin = ce BUILD_ID) — un job
  arrêté sur ce refus repart UNE fois vers un poste 0.6.186 (get-pending-jobs), avec l'état de sa capture / de sa fiche ;
  jamais par-dessus une réponse différente de la personne, jamais sans état connu.

## ⛔ 20/11/2026 (ordre de Nico) — « Me connecter » ouvert sur un refus de compte dit QUELLE plateforme a refusé
- Depuis la 2.9.220, l'écran s'ouvre seul quand une plateforme refuse le compte au clic « Mettre en vente »
  (`refus_compte`, une fois par refus et par appareil, `refusCompteAOuvrir`) ; il montrait « 4 sur 4 connectées », chaque
  ligne « Connecté », sans nommer le refus.
- Règle : EN TÊTE de l'écran, `phraseRefusDeCompte` (`src/cloud/connexionsCloud.js`) — « Depop a refusé ton compte au moment
  de mettre en vente. Ouvre Depop ci-dessous et fais ce qu'elle demande : tes publications Depop attendent, rien n'est
  perdu. » Jamais « Chrome » ni « extension » ; seulement quand l'écran s'est ouvert pour un refus (origine
  « refus_compte ») ; plateforme inconnue : aucune phrase. `App.jsx` passe la plateforme retenue (`cxRefus`), oubliée à
  la fermeture.
- Preuve (compte de Nico, refus Depop posé sur une fiche TEST puis supprimé) : iPhone WebKit, Android Chromium, web —
  phrase en tête, aucun « Chrome », « Fermer » ferme, rien à la 2e ouverture. Verrou
  `selftest:me-connecter-dit-le-refus-2011` (14 rouges avant, 14/14 après). Version 2.9.222.

## 14/11 — Compte sur le Cloud : l'extension du PC ne fait plus rien (point 4 de Nico, 0.6.190)
- Cas : 13e274de (Cloud actif). Toutes ses publications du 14/11 parties du Cloud, mais l'extension de son PC (Store 0.6.186,
  poste 727410c6, ba13a51) a continué jusqu'à 12:48 (Paris) : relevé des ventes 09:46, lecture des ventes Beebs 10:32,
  lectures « page » 10:55 et 10:59 (demandées par le web ouvert sur ce PC), et SA sonde de 12:44:09 a écrit
  `extension_sessions.beebs = false` → 6 retraits Beebs retenus « Connecte-toi à Beebs sur ton ordinateur ».
- RÈGLE (serveur d'abord, tous les comptes, `_shared/cloud-voie.js`) : compte au Cloud ACTIF (`profiles.cloud_voie`) = un
  seul exécutant, le poste Cloud. Tout autre poste reçoit de `get-pending-jobs`, juste après la télémétrie, une réponse
  vide qui le dit (`compte_cloud`, `reponseCompteAuCloud`) : aucune tâche, aucun relevé, aucune commande, aucune lecture
  de fond, aucune demande de connexion, aucune écriture faite pour lui ; ses sessions ne sont pas notées sur son poste.
  La connexion d'une plateforme du Cloud se lit dans `cloud_coffre` (get-pending-jobs : retenue « session morte » et
  attente espacée ; handler-watch : les deux levées), jamais dans `extension_sessions` (`sessionsQuiFontFoi`). Une tâche
  retenue d'un client Cloud dit « Reconnecte X dans l'app (Réglages › Mes plateformes › « Me connecter ») » — jamais
  Chrome, l'ordinateur ni l'extension (`texteAttenteSessionCloud`). Cloud plus actif (fin d'essai non convertie,
  résiliation effective, impayé : `cloud_voie` faux) : rien ne change, le PC reprend au poll suivant.
- Base (PROPOSÉE, feu vert requis) : `20261114170000_sessions_poste_cloud_seul` — l'écriture d'`extension_sessions` par
  un poste non Cloud d'un compte au Cloud actif est ignorée (seule porte que le serveur ne contrôlait pas : PATCH direct
  de l'extension). Banc jetable `scripts/cloud/preuve-sessions-poste-cloud-seul.mjs`.
- Extension 0.6.190 : la pause est la parole du serveur à chaque poll (30 min au plus après la dernière réponse qui la
  dit, rien de figé) ; en pause, seul le poll part ; popup « Extension en pause : ton compte utilise FillSell Cloud, tout
  se fait depuis nos serveurs… » à la place de l'état habituel ; jamais sur la copie Cloud (BUILD_ID « -cloud »).
  Les extensions déjà installées (≤ 0.6.189), dès le déploiement de get-pending-jobs : file vide, et Leboncoin « délégué
  ailleurs » (`blocages.leboncoin.etat = delegue`, lu depuis la 0.6.164 : plus aucune visite Leboncoin, même de leur fait) ;
  leurs autres tâches de fond (sonde Vinted/Beebs, relevé quotidien et ventes Vinted/Beebs, veilleur, lectures demandées
  par la page) continuent jusqu'à la 0.6.190 — leurs écritures de session sont ignorées une fois la migration appliquée.
  Verrou : `selftest:compte-cloud-pc-en-pause`.
- (14/11 soir, point 3 de Nico) **Leurs VENTES et RELEVÉS aussi** : migration `20261114200000_ventes_releves_poste_cloud_seul`
  (`public.ecriture_poste_hors_cloud`, APPLIQUÉE le 14/11 à 20:28:50) — compte au Cloud actif : `enregistrer_ventes_relevees` et `commandes_vinted_noter`
  rendent `compte_cloud` (rien enregistré, aucun mail) et `vinted_sync_runs` n'est ni créé, ni pris, ni avancé, ni clos
  (`garde_a_releve_poste_cloud`, `RETURN NULL` : l'extension lit « run non créé ») quand l'écriture vient d'un AUTRE POSTE
  D'EXTENSION que le poste Cloud (session notée dans `extension_postes`, ou relevé qui déclare un build sans « -cloud »).
  L'app (sa session n'est pas un poste), le rôle service, le poste Cloud et les comptes sans Cloud ne changent pas.
  Banc `selftest:ventes-poste-cloud-seul` (corps de prod, garde md5, inverse octet pour octet). Rapport
  `docs/enquetes/lot-1411-soir/RAPPORT.md` § 3.

## 15/11/2026 — 0.6.191 : le bloc de catégorie Leboncoin attendu (lot (2) de Nico, point 3)
- Seul zip à téléverser : `C:\Users\nicol\fill-and-sell\build\CWS-0.6.191-A-TELEVERSER\fillsell-extension-0.6.191-cws.zip`
  (BUILD_ID `2026-11-15T11:07:11Z+b8d189c`, base 0.6.190 jamais téléversée, écartée dans `build/CWS-PERIMES/`).
  EXTENSION_LAST_COMMIT `2026-11-15T10:36:59Z` (84a8d8f). EXTENSION_MIN_BUILD non touché.
- Relance après mise à jour `lbc_categorie_bloc_attendu` (buildMin = EXTENSION_LAST_COMMIT) : la parka de joshua
  (1078eb4b) et toute tâche arrêtée sur « Catégorie: ni suggestion ni sélecteur manuel trouvés. » par un build plus
  ancien repart une fois quand le poste a la 0.6.191. La copie Cloud de l'extension n'a pas été redéployée.

## ⛔ 15/11/2026 soir (point 1a de Nico — af37fa49) — une mise à jour de l'extension n'attend JAMAIS indéfiniment une remise en ligne
- Cas : la copie Cloud d'af37fa49 restait en 0.6.189 après le passage du Cloud en 0.6.191 (18:46) : `maj_extension_reportee`
  « 1 republication à l'étape 'deleted' » — Beebs 3382b821, retirée le 11/11, que personne ne servait (Beebs absent de son
  coffre). Chrome avait posé la 0.6.191, l'extension refusait de recharger à chaque cycle.
- RÈGLE (serveur seul ; les extensions servies la lisent déjà, ≥ 0.6.153) : `get-pending-jobs` rend dans `retenues_deleted`
  toute republication `pending` à `deleted` que CE poll ne sert pas à ce poste, ou retirée depuis plus de 2 h
  (`LIMITE_MAJ_DIFFEREE_MS`, `_shared/recreation-attend-connexion.js`). L'extension ne la compte plus « recréation en
  jeu », recharge sous son verrou de flux (rien ne démarre entre la vérification et le rechargement), et la nouvelle
  version la reprend à son étape depuis la base. Inchangé : un job `processing` diffère toujours ; une suppression actée
  par CE worker (mémoire `republishSupprimes`) aussi — c'est le seul cas qui reste du côté de l'extension.
- Verrou `selftest:republication-attend-connexion` (§ a). Rapport `docs/enquetes/lot-1511-7-doriane-depop-hashtags/RAPPORT.md`.

## 0.6.195 (préparée le 19/11/2026 soir, livrée seulement après la publication de la 0.6.194)
- **Couleur Vinted** (`background.js`, sonde `corpsAvecCouleur`) — feu vert de Nico : « l'ancienne couleur doit être retirée
  quand la fiche en change ». Tâche 784e244a : copie Gris [3], Vinted pré-coche Noir d'après les photos après notre pose →
  l'annonce partait « Noir, Gris ». La sonde armée remplace dans le corps envoyé la couleur que la page porte quand ce n'est
  pas celle de la copie (même couleur → intacte ; rien d'armé — choix fait dans l'app, ou rien de connu — → la page décide).
  Verrou `vinted-envoi-sans-perte` cas G ; `extension-0-6-177` suit la nouvelle règle.
- **Photos d'une fiche importée par un relevé** (`background.js`, `choisirCapturesARefaire` / `capturerAnnonces`) — point 3
  de Nico (compte faf5021a, synchro Beebs du 19/11 18:45 : 16 présentoirs, « Beige » et « Blanc » importés avec la seule vignette,
  coupés par le budget de 2 min de pages ; ce compte : un relevé Beebs en 3 jours). Les NOUVELLES du relevé (vues depuis
  moins de 30 min, jamais capturées, pas encore rattachées) sont capturées juste après les fiches à une photo et même
  au-delà du budget de temps (au plus 30) : elles deviennent des fiches dans le même relevé, avec toutes leurs photos.
  Une capture ratée reste « fiche à une photo » : la première du relevé suivant, complétée par la base
  (`fiche_completer_photos_capture`, photos à rapatrier). Verrou `selftest:beebs-photos-import-1911` ; `capture-fraicheur`
  et `releves-progres` suivent. Constat du 19/11 : 2 634 fiches Beebs (21 comptes) et 130 Leboncoin (6 comptes) nées du
  relevé attendent encore leur 1re capture (≤ 30 par relevé, à la cadence des relevés du compte).

## ⛔ 20/11/2026 (point 5 de Nico) — copie Cloud : une page qui ne s'est pas chargée n'est jamais « à reconnecter »
- Tessy 2f8b09d2 : la visite de renouvellement du jeton Beebs (verrou de la copie Cloud, `renouvelerConnexionCloud`) tombait
  sur une page d'erreur de Chrome (ERR_TUNNEL_CONNECTION_FAILED) — 10 essais du 20/11 04:37 à 08:59, tous
  « jeton_non_renouvele » → l'orchestrateur passait Beebs « à reconnecter » (coffre) alors que son jeton long était là. ⛔ Un
  coffre « non connecté » fait PURGER la session de la plateforme à l'ouverture suivante du navigateur (postes.js,
  `purgerSessions`) : un faux « à reconnecter » devient une vraie déconnexion au redémarrage (Romane 13e274de : plus aucun
  jeton Beebs depuis son « à reconnecter » du 14/11 11:35). Règle : page d'erreur (`chrome.scripting.executeScript` refusé,
  « showing error page ») → issue `site_injoignable` : aucune reconnexion lue par l'orchestrateur, refus passager « injoignable
  pour le moment », nouvel essai après `reessaiMs`. Verrous `selftest:cloud-site-injoignable-releves-nuit-2011`,
  `selftest:releves-de-veille` (le texte « injoignable » n'est pas un mur).

## 20/11 — Pool d'IP du Cloud : la France et les plateformes ouvertes, rien d'autre (décision de Nico)
- Le pool était VIDE (alerte 11:02) avec 5 IP payées dehors : le contrôle rejetait encore `sortie:hebergeur` et
  `sortie:proxy` (80, 81, 82, 88, 89 « grillées ») alors que des clients tournent sur ce type d'IP (3, 40, 84, NTT).
- Règle : une IP entre au pool si elle SORT EN FRANCE et que les 4 plateformes répondent OUVERTES. Hébergeur, proxy et
  opérateur ne sont plus jamais des motifs de refus (gardés en information dans `sante.dernier.resume.sortie` ; l'opérateur
  ne fait que ranger). `serveur-cloud/src/sante.js` ne pose plus ces codes ; `_shared/cloud-pool.js` les ignore partout
  (`codeSanteCompte`, `CODES_SORTIE_INFORMATION`) : un verdict qui ne tenait que par eux (`verdictSansMotif`) n'écarte
  jamais l'IP, elle est recontrôlée en premier et ce contrôle décide seul ; seul le PAYS reste définitif et seul lui fait
  demander un remplacement (82, Royaume-Uni) ; le contrôle avant RENOUVELLEMENT d'une IP tenue les ignore aussi.
- Contrôle d'IP nommées, tout de suite : `docker compose exec -T orchestrateur node outils/controle-sante.mjs <id>` (une à
  la fois ; jamais une IP tenue par un compte). Verrous : selftests cloud-pool, ip-controle-avant-attribution,
  cloud-ip-fin-de-compte, ip-sante-sans-ebay, serveur-cloud/tests/sante.test.mjs.
- (20/11 soir) RACHAT AUTOMATIQUE : toujours `cloud_ip_marge` (2) IP SAINES ET LIBRES EN PLUS de la liste d'attente
  (vraie attente) et des comptes Cloud sans IP ; les IP attribuées ne sont jamais de l'offre. Sous le seuil : le rachat de
  ce qui manque (les IP en route comptent), borné par `cloud_ip_achat_max` (2 par commande), la garde du nombre (JS et
  `cloud_ip_garde_nombre`), l'anti-boucle et le solde ; le plafond mensuel en dollars n'existe plus (décision du 07/11).
  `_shared/cloud-pool.js` `achatSurDemande` (marge = `g.marge`). Une IP dont la commande IPRoyal est « refunded » (89,
  proxy 407) ne peut pas entrer au pool : sa mise au rebut (`cloud_ip_signaler(id, 'manuel', …)`) attend Nico.

## 20/11 soir — Pool d'IP, capacité et Beebs du Cloud (décisions de Nico de 18:09)
- **Attribuable = contrôle passé** : `cloud_ip_attribuable` (migration 20261120190000) et `ipAttribuable` exigent un verdict
  « saine » de moins de 36 h ; une IP « inconnue », « suspecte », « grillée » ou jamais contrôlée n'est ni donnée, ni comptée
  dans la vente, les places offertes, la garde. `ipAttribuableHorsSante` = la CANDIDATE au contrôle et l'offre d'achat.
- **Le verdict ne juge que la sortie** (France, la bonne IP, lisible). Une plateforme qui refuse (Beebs : DataDome 406) est
  notée dans `sante.plateformes_fermees` : l'IP reste attribuable ; `cloud_ip_attribuer` / `cloud_ip_reserver` (migration
  20261120200000, `cloud_plateformes_du_compte` : coffre + annonces relevées) donnent d'abord une IP où aucune plateforme du
  compte n'est fermée, sinon la suivante quand même. Toutes les plateformes fermées : aucune conclusion.
- **Commande IPRoyal STANDARD** (ISP Dedicated, France, 30 jours) sans « Extra Requirements » : la consigne « box française »
  (5,20 $, traitement manuel, remboursements) est retirée. Une commande « refunded » est close en échec (`commandePerdue`).
- **Stock d'avance** : max(6, 2 × le pic d'attributions par jour des 7 derniers jours) IP libres et attribuables, EN PLUS des
  places gardées et des IP attribuées (`seuilStock`, `achatSurDemande` marge = seuil ; `cloud_ip_marge` aligné en base par
  l'entretien pour la garde de `cloud_ip_depense_ouvrir`). Garde : saines, ou livrées pas encore contrôlées. Garde-fou :
  plus de 10 IP achetées en 24 h → ligne rouge et objet de l'ops-digest.
- **Capacité** (`flotte.js capaciteMesuree`) : la limite de la MÉMOIRE mesurée (`n_mem`, borne 250), tout de suite, jamais
  sous les servis ; plus de paliers ni de plafond théorique ; restent le blocage au premier signe grave et l'oom. Alerte à
  80 % de la limite réelle (mail « décider d'un 2e serveur »), inchangée.
- **Beebs « connecté » sur le Cloud** = Beebs reconnaît le compte (`api.beebs.app/users/v3/me` 200, en-tête authorization
  comme la page) ; 404 = une identité (Google…) sans boutique Beebs → « Ce compte n'a pas de boutique Beebs : connecte-toi
  avec le compte de ta boutique » (cas prouvé du 20/11).
- **Liste d'attente** : le mail « Ta place FillSell Cloud est prête » (catégorie support) part à chaque fois ; les 24 h
  démarrent à l'envoi réel ; un mail raté est réessayé par le cron (migration 20261120210000, 3 essais).

## 20/11/2026 soir — 0.6.195 (blocs A et B2 de Nico)
- Contenu neuf : les demandes de lecture d'origine de moins de 15 min sont lues par l'alarme seule (sans le verrou des
  dépôts, ou en tête de file entre deux tâches ; liste relue tant qu'il en reste, 10 pages par appel au plus, 8 à 20 s
  entre deux pages) ; le poll ne lit plus que les demandes plus anciennes (bloc A, `lireAnnoncesOrigineEnAttente`).
  Vinted, taille relue après la pose, jamais une option déjà choisie recliquée, dernière passe avant le pré-vol (bloc B2,
  `content-scripts/vinted.js`). Contient aussi le code extension committé sans version depuis la 0.6.194 (sonde couleur
  Vinted, attente « en vérification » propre à chaque plateforme, relevé automatique).
- Relances serveur après mise à jour : `_shared/relance-apres-maj.js` `BUILD_0_6_195` = EXTENSION_LAST_COMMIT du commit de
  vinted.js (règles `vinted_taille_relue_vide_*`, inertes tant que le repère n'est pas rempli).

## 20/11/2026 soir (bloc D de Nico) — l'essai Cloud démarre tout de suite quand une IP est en route — PRÉPARÉ, NON APPLIQUÉ
- Migration `20261120230000_cloud_essai_place_promise` (+ INVERSE, banc PGlite `scripts/bancs/place-promise-2011/`, 31/31) :
  aucune IP réservable + une place serveur + une IP qui peut venir (achat en route, IP achetée/en quarantaine, rachat auto
  payable) → place PROMISE 30 min (`cloud_essai_demandes.place_promise_jusqu_au`), préparation ok, jamais la liste
  d'attente ; le permis de paiement l'accepte ; la promesse compte dans les places (capacité 40 tenue) ; les IP libres vont
  d'abord aux promesses. Stock et capacité inchangés. ⛔ À appliquer seulement après le feu vert explicite de Nico.
- Orchestrateur (serveur-cloud, non déployé) : un achat raté pendant qu'un compte actif attend une IP est réessayé au tour
  suivant (5 min, 3 ratés par heure au plus) ; une issue inconnue (5xx, coupure) n'est rejouée qu'après relecture des
  commandes IPRoyal (GET /orders, jamais deux paiements). ops-digest : lignes 🔴 « Achat d'IP en échec (24 h) » et « Essai
  Cloud sans IP depuis plus de 30 min ». App : « Ton FillSell Cloud se prépare… » sur une place promise.
- Ordre : migration → orchestrateur (`ORCHESTRATEUR_SEUL=1 bash serveur-cloud/outils/deployer.sh …`, ferme et rouvre les
  navigateurs des clients) → ops-digest. Verrous `selftest:cloud-place-promise-2011`, `cloud-place-promise-pg-2011`,
  `serveur-cloud/tests/achat-essai-sans-ip.test.mjs`.

## ⛔ 21/11/2026 nuit (priorité 0 de Nico) — Cloud : ce que la plateforme répond à la validation d'un code
- Cas : alisonbertincourt (essai Cloud, IP 100 propre), 8 validations du code Vinted envoyées sur un bouton actif, sans
  connexion ; melinemaros (IP 81, proxy/hébergeur, captcha DataDome sur Vinted), 18 frappes, aucune validation reconnue.
  Les journaux ne disaient RIEN de la réponse de Vinted (`ENREGISTREMENT_CONNEXIONS=0`, la relecture du champ ne lit que
  sa longueur) : la cause exacte n'est pas prouvable après coup. 8 connexions Vinted réussies sur 8 du 16/11 au 20/11
  16:56 (4 frappes, 1 validation chacune).
- Règle (`serveur-cloud/src/codeConnexion.js` `EXPRESSION_REPONSE_CODE`, `lireReponseCode` ; `connexion.js`
  `lireReponseApres`) : 2,5 s après chaque validation (bouton ou Entrée), la page affichée est relue une fois — texte visible
  des messages d'erreur et présence du champ du code, JAMAIS une valeur saisie ; journal `connexion_code_reponse`, usage_logs
  `cloud_connexion_code_etat` moment `reponse` (e-mails et suites de 4 chiffres masqués) ; refusée → la phrase de la
  plateforme dans le bandeau du code (« Vinted a répondu : « … ». Vérifie que c'est le code du DERNIER e-mail… »).
- 2e page chez alisonbertincourt : l'app rechargée à 23:42:13 a rouvert « Me connecter » toute seule (marque « déjà ouvert »
  absente : autre fenêtre ou appareil, largeur 540 au lieu de 384) ; la ligne Vinted a repris la même page, l'autre
  connexion a reçu « remplacée » ; sa fermeture (23:42:30) a effacé la demi-session, d'où un nouveau code. Reprises
  Leboncoin de melinemaros : ses allers-retours vers l'app Mail (normal).
- Déploiement : `EXTENSION_SEULE=1 SANS_REDEMARRAGE=1` puis `ORCHESTRATEUR_SEUL=1` (`serveur-cloud/outils/deployer.sh`) :
  copie Cloud et orchestrateur en UN seul arrêt des navigateurs.

## ⛔ 21/11/2026 nuit (compléments 1 à 3 de Nico) — Cloud : un code valable n'est jamais jeté ; enregistrement ; IP de la glissière
- **3e tentative d'alisonbertincourt (complément 1)** : le champ contenait 4 caractères à CHAQUE validation (17, bouton actif,
  clics partis vers la page) ; 2 frappes à 23:47:22 = 2 caractères (rien de collé). Mais 6 s après la demande du code
  (23:47:16) : trop tôt pour le nouvel e-mail. Trois codes en 7 min (23:40:50, 23:43:25, 23:47:16) — elle tapait un code
  d'avant, annulé par le nouveau. Racine : « Fermer » (23:42:30, après un écran « remplacée, ferme puis rouvre ») et un
  toucher sur Leboncoin (23:45:28) avaient JETÉ la page du code (purge de la demi-session) — d'où un nouveau code à chaque fois.
- **Règle (complément 3a, `codeConnexion.js` `attendUnCodeValable`, `basculeRetenue`, `MESSAGES_GARDE` ; `connexion.js`
  `garderAuCode`)** : une page qui attend un code demandé il y a moins de `CODE_GARDE_MS` (10 min = l'attente d'un code),
  non connectée, hors « Résoudre » :
  · « Fermer » la GARDE (comme une personne partie lire son code ; journal `connexion_gardee_au_code`, usage_logs moment
    `gardee`) ; rouvrir la même plateforme la reprend, code compris ; sans retour, elle se ferme seule (purge) à la fin de
    l'attente ;
  · un premier toucher sur une AUTRE plateforme ne la remplace pas : l'écran dit « Ta page Vinted attend encore ton code… pour
    passer quand même à Leboncoin, touche Leboncoin une 2e fois » (étape finale `rien`, journal `connexion_bascule_retenue`) ;
    le 2e toucher dans les 2 min remplace (la personne a choisi). Reprise automatique : jamais (règle du 09/11 inchangée).
  Le rechargement de l'app ne remplaçait pas la page (il la reprenait) : c'est l'écran resté ouvert ailleurs qui recevait
  « remplacée, ferme puis rouvre » — désormais, fermer puis rouvrir reprend vraiment la même page.
- **Enregistrement (complément 2, `vueBureau.js` `cheminMasque`, `estReponseConnexion`, `reponseConnexionMasquee`,
  `enregistrementsAPurger`)** : `ENREGISTREMENT_CONNEXIONS=1` sur cloud-2 (posé au redéploiement) — un fichier par « Me
  connecter » / « Résoudre », fermé avec lui (rien en dehors des connexions). Chemins sans e-mail ni suite de 4 chiffres ;
  jamais une query, un en-tête, un corps envoyé ; la RÉPONSE des plateformes aux étapes de connexion (XHR/Fetch POST sur un
  chemin d'authentification Vinted, Leboncoin, Beebs, Depop) gardée masquée : clés, statuts, messages — jamais un mot de
  passe, un code, un e-mail, un jeton. Conservation 48 h (`ENREGISTREMENT_CONSERVATION_MS`), effacés à l'ouverture de la
  connexion suivante ; les enregistrements de fond (`fond-…`) ne sont pas touchés.
- **IP 72.9.x (complément 3b, `cloud-pool.js` `proxyRefusee`, échec `sortie:proxy_refusee`)** : deux familles. AS25369 Hydra
  (81 melinemaros, 82, 88, 96, 98, 103) : sortie marquée proxy par ip-api ET Beebs 406 à l'accueil à CHAQUE contrôle ; la
  seule glissière Vinted vue sur le Cloud depuis le 16/11 (81, 20/11 21:05, au retour de Google). AS2914 NTT (76 Muriel, 80) :
  proxy = false, 200 partout, aucune glissière. Règle : proxy + refus anti-robot (403/406/429) dès l'accueil = vrai échec de
  sortie → plus donnée aux nouveaux essais, plus comptée dans les « 2 saines libres » (le rachat remplace). Proxy seul, ou
  refus seul : la règle du 20/11 (verdictSansMotif, plateformes_fermees). Jamais écrit sur une IP tenue par un compte
  (`cloud_ip_sante_noter` refuse) : 81 et 76 restent à leurs clientes. 82, 96, 103 étaient déjà grillées (sortie GB) ; 88 et
  98 (saines) passent « suspecte » à leur prochain contrôle après le redéploiement.
- Verrous : `serveur-cloud/tests/simulation.test.mjs` (« 21/11 nuit »), `vue-bureau.test.mjs`, `sante.test.mjs` (21/11).
- **21/11/2026 nuit, 2e message de Nico — la règle finale (app + Cloud)** : une page qui attend un code ne peut être ni
  fermée, ni rouverte, ni remplacée tant que la connexion n'a pas abouti ou que la cliente ne l'a pas fermée elle-même.
  · Cloud : même plateforme = reprise de LA page (jamais une nouvelle, jamais un nouveau code) ; autre plateforme = retenue,
    l'écran dit « …pour fermer ta page Vinted et passer à Leboncoin, touche Leboncoin une 2e fois » (ce 2e toucher est SA
    fermeture) ; après son « Fermer », la page reste 20 min pour être reprise, mais une autre plateforme passe (elle a choisi) ;
    attente d'un code sans geste : `INACTIVITE_CODE_MS` 10 → 20 min (25 min au plus).
  · Textes : `remplacee` (même page reprise sur un autre écran : « continue sur ton autre écran, rien n'est perdu », envoyé
    avec `fermee: false`) et `remplaceeFermee` (autre plateforme ouverte) ; plus jamais « ferme puis rouvre ».
  · App : `suiviVue.js` — `fermee: false` = pause (« Continuer ici ») même sous les yeux de la personne ; `App.jsx` — une
    seule ouverture automatique de « Me connecter » par COMPTE (`platform_settings.cloud_connexion.auto_le`, lue avant,
    posée par `platform_settings_fusionner`) : jamais au rechargement, sur aucun appareil ; le retour de Stripe l'ouvre toujours.
  · **melinemaros (autre cause)** : code (4 caractères) dans le champ 14 s après la demande, mais AUCUNE validation partie
    (ni Entrée, ni toucher sur un bouton) ; le clavier du téléphone a quitté le champ à 22:05:51, 13 frappes ensuite sans
    champ actif ; fermée par elle à 22:07:36. Le captcha (21:05:13 UTC) était passé avant la page du code. Correctif : « Valider
    le code » dans le bandeau du code (replié ou déplié) → `{ t: 'valider_code' }` : le champ du code rempli reprend le clavier
    et reçoit Entrée, sinon toucher/clic au centre du bouton de validation de la page (`EXPRESSION_VALIDER_CODE`,
    `choixValiderCode`) ; tracé `validation` par `app_entree` / `app_bouton`.
  · Verrous : `selftest:cloud-code-garde-app-2111`, `serveur-cloud/tests/simulation.test.mjs` (« 21/11 nuit »).
