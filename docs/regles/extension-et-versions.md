# Extension Chrome : versions servies, relances, poste de Nico

> Déplacé MOT POUR MOT de l'ancien `CLAUDE.md` (commit `57e74fa`) le 15/10/2026 soir ;
> table de correspondance : `docs/menage-claude-md-1510.md`. Les numéros de version et les états cités sont
> ceux de leur date : `functions list`, `cron.job` et `profiles.extension_build` font foi.
> Une règle nouvelle de ce sujet s'ajoute ICI (ou dans un rapport), jamais dans `CLAUDE.md`.

## Sommaire

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
