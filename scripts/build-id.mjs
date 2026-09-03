// BUILD_ID partagé — source UNIQUE pour les trois consommateurs :
//   1. build local minifié (scripts/build-extension.mjs, « Load unpacked ») ;
//   2. zip public fillsell.app (scripts/vite-plugin-zip-extension.mjs) ;
//   3. app web elle-même (define __FILLSELL_APP_BUILD__ dans vite.config.js),
//      qui compare son propre id à profiles.extension_build pour la bannière
//      « extension obsolète ».
// Format : horodatage ISO UTC + hash git court. Le PRÉFIXE ISO est triable —
// c'est LUI qui sert aux comparaisons d'obsolescence, jamais le hash.
import { execSync } from 'node:child_process';

export const BUILD_TOKEN = '__FILLSELL_BUILD_ID__';

// Build extension MINIMAL requis par l'app web (2026-07-23, faux positif
// bannière) : la bannière « extension obsolète » comparait le build de
// l'extension au BUILD_ID du déploiement web courant — chaque déploiement web
// re-flaggait donc TOUTES les extensions installées, même quand
// chrome-extension/ n'avait pas bougé d'une ligne (vécu : build parti en
// review Chrome Web Store le 23/07, flaggé « pas à jour » dès le déploiement
// web suivant). La comparaison se fait désormais contre une constante figée,
// jamais contre le BUILD_ID du web — cf. les DEUX constantes ci-dessous.
// assertExtensionMinBuildCurrent() (appelé par vite.config.js) fait échouer le
// build local si l'une des deux est en retard ou incohérente.
//
// ── DEUX constantes, DEUX sens (scindées le 2026-07-29) ─────────────────────
// Une seule constante portait les deux jusqu'ici, et c'est précisément ce qui
// a fait mentir la bannière ce soir-là. Le bump de rattrapage à
// 2026-07-29T15:00:00Z (les deux commits Beebs du jour, 24b2881 et 9000cdf,
// touchaient chrome-extension/ sans bump : `npm run build` LOCAL échouait —
// Vercel, lui, skippe la garde, clone shallow) a satisfait la garde au build
// ET, du même geste, allumé « extension obsolète » pour les 6 installs actives
// du parc, dont 4 déjà sur la 0.4.5 du CWS : un bandeau exact à la lettre mais
// qui ne menait nulle part, le bouton « Mettre à jour » renvoyant sur la même
// version. Ce n'était pas un accident, c'était mécanique.
//
// EXTENSION_LAST_COMMIT = horodatage UTC du dernier commit touchant
//   chrome-extension/. Sert UNIQUEMENT aux gardes de build (celle ci-dessous,
//   et la vérification du paquet dans package-extension.mjs). À BUMPER dans le
//   même commit que tout changement sous chrome-extension/.
//
// EXTENSION_MIN_BUILD = build de la dernière extension RÉELLEMENT INSTALLABLE
//   par un utilisateur (version publiée sur le Chrome Web Store). C'est LUI
//   que la bannière compare au build installé (App.jsx). À ne bumper qu'après
//   une publication ACCEPTÉE par le CWS — sinon on demande aux utilisateurs
//   d'installer quelque chose qui n'existe pas encore.
//
// ⚠️ MIN_BUILD SE LIT DANS LE PAQUET PUBLIÉ, JAMAIS DANS LAST_COMMIT.
// Cette consigne disait « recopier LAST_COMMIT dans MIN_BUILD ». C'était vrai
// tant que LAST_COMMIT désignait le commit de code qui a PRODUIT le zip — et
// faux dès qu'un commit postérieur touche chrome-extension/ sans produire de
// paquet. Un README suffit : le 09/08, 6e08f44 (README seul) a poussé
// LAST_COMMIT à 14:53:38Z alors que le paquet 0.5.6 réellement publié porte
// 2026-08-09T14:16:20Z — 37 min PLUS TÔT. Recopier LAST_COMMIT aurait flaggé
// « obsolète » TOUTES les installs 0.5.6, sans rien de plus récent à
// installer : très exactement le bug du 29/07 que ces constantes existent pour
// empêcher. La garde ci-dessous ne voit pas ce cas (elle ne vérifie que
// MIN_BUILD <= LAST_COMMIT, pas MIN_BUILD <= build du paquet publié).
//
// Séquence de publication : bumper LAST_COMMIT au fil des commits extension →
// package:extension → téléverser + « Envoyer pour examen » → une fois la
// review ACCEPTÉE, LIRE le BUILD_ID dans le zip publié et le recopier dans
// MIN_BUILD (le parc est alors prévenu au bon moment, avec une version à aller
// chercher — et qui existe vraiment). Le BUILD_ID est injecté dans les
// fichiers du paquet ; pour le relire :
//   Add-Type -AssemblyName System.IO.Compression.FileSystem
//   # ouvrir build/fillsell-extension-<version>-cws.zip, chercher dans
//   # background.js le motif 20\d\d-\d\d-\d\dT\d\d:\d\d:\d\dZ\+[0-9a-f]{7}
// 2026-08-09T12:20:00Z = 0.5.5 : l'upload photo Vinted est POST /api/v2/photos,
// pas /api/v2/images — la garde de la 0.5.3 attendait une preuve qui ne pouvait
// pas exister et bloquait TOUTE publication (annonce de Gabin supprimée puis
// jamais recréée, job 9a8eaad8). Preuve croisée réseau + vignettes
// image-wrapper, garde non bloquante après une suppression, et un job en
// needs_user ne gèle plus la file de republication du compte.
// 2026-08-09T14:14:47Z = 0.5.6 (commit 7ca4440) : le panneau de catégorie était
// OUVERT (chevron-up, close-button) pendant que la sonde « -content » jurait le
// contraire, et chaque retry le RE-BASCULAIT — trois annonces d'Ornella
// supprimées puis jamais recréées. Trois preuves d'ouverture dérivées du
// déclencheur, plus aucun clic sur un panneau déjà ouvert, budget croissant
// (fenêtre minimisée = timers throttlés à ≥ 1 s), et B.5 étendu à TOUT le
// remplissage : après une suppression, aucun échec ne bloque plus la
// soumission.
// 2026-08-09T14:53:38Z = 6e08f44, qui ne touche que chrome-extension/README.md
// (DRY_RUN décrit comme « doit rester à true » alors que les quatre plateformes
// publient en réel depuis le 12/07, et une section « Reste à faire » périmée).
// AUCUNE ligne de code d'extension ne bouge : le paquet 0.5.6 déjà construit
// reste exact, et EXTENSION_MIN_BUILD n'a donc pas à suivre. Recalage seul, du
// même geste que db9faba et f84326e — sans lui, `npm run build` échoue sur la
// garde ci-dessous.
// 2026-08-09T19:20:20Z = e78783e (0.5.7) : la file de jobs passe à TROIS rangs
// de priorité — une publication ne fait plus la queue derrière les
// republications pas encore supprimées (rang 2), tandis que les recréations
// dues (rang 0, annonce déjà hors ligne) gardent la priorité absolue. Le
// rythme humain est inchangé : seul l'ORDRE de passage bouge.
// EXTENSION_MIN_BUILD reste sur la 0.5.6 : la 0.5.7 n'est pas encore soumise
// au Chrome Web Store, et on ne réclame jamais au parc une version que
// personne ne peut installer (bug du 29/07).
// 2026-08-09T19:32:11Z = 045b5e6 (0.5.8) : maybeAutoRepublish applique le seuil
// d'ancienneté réglable côté app. Les deux bornes sont dupliquées (aucune RPC
// ne calcule l'éligibilité) et doivent rester identiques.
// 2026-08-09T19:39:05Z = cb9f9e7 : plancher du seuil REMIS À 7 JOURS (il était
// passé à 1 quelques minutes plus tôt). Republier une annonce mise en ligne il
// y a 1 ou 2 jours est un motif que Vinted sait repérer. Toujours la 0.5.8 :
// aucune de ces versions n'a été soumise au Chrome Web Store, le paquet est
// reconstruit sur place — d'où un manifest inchangé et un BUILD_ID nouveau.
// EXTENSION_MIN_BUILD reste sur la 0.5.6 : ni la 0.5.7 ni la 0.5.8 ne sont
// encore acceptées par le Chrome Web Store.
// 2026-08-10T11:30:00Z : sonde d'avant-suppression + archivage de
// `unavailable_pending_since`. Nouvelle commande PROBE_VINTED_LISTING (liste
// FERMÉE de fillsell-auth.js, URL revalidée côté background : hôte vinted.fr +
// /items/<id>, sinon l'extension deviendrait un proxy de fetch AUTHENTIFIÉ vers
// n'importe quelle URL pour tout JS tournant sur fillsell.app). LECTURE SEULE :
// elle réutilise checkListingState — le lecteur du poll — et n'écrit rien nulle
// part ; c'est le site qui décide d'afficher une question, et l'utilisateur qui
// écrit en cliquant. cancelPublishAfterDelete ARCHIVE désormais
// `unavailable_pending_since` (au lieu de l'effacer) : c'était la seule preuve
// qu'une disparition était en cours de confirmation, et elle partait en silence.
// Toujours la 0.5.8 — aucune de ces versions n'est soumise au Chrome Web Store,
// donc EXTENSION_MIN_BUILD reste sur la 0.5.6.
// 2026-08-10T11:45:00Z : la sonde d'existence Vinted est SUPPRIMÉE. Elle lisait
// GET /api/v2/items/{id} — mort depuis le 05/08 (404 + corps HTML pour TOUT
// article, vivant ou non) — et rendait donc « absent » pour la terre entière.
// Sur le chemin destructif, un jeton CSRF manquant (l'autre cause étant une page
// NON HYDRATÉE sur une annonce toujours en ligne) faisait conclure « suppression
// acquise » : l'article sortait du stock et l'annonce restait en ligne, en
// silence. Désormais un CSRF absent, comme un refus 401/403, ne conclut RIEN —
// c'est le background qui lit l'état réel (checkListingState, déjà en place) et
// qui seul peut poser 'deleted'. Bug LATENT au moment du correctif : les 8
// suppressions Vinted depuis le 05/08 ont toutes pris le vrai chemin (csrf ok,
// HTTP 200), aucune donnée à réparer. Toujours la 0.5.8 — non soumise au Chrome
// Web Store, donc EXTENSION_MIN_BUILD reste sur la 0.5.6.
// 2026-08-10T14:15:00Z = 973972f : « formulaire quitté » n'est plus une preuve
// de publication eBay. MESURÉ sur un dépôt réel (annonce 800486036114) : quand
// eBay publie, il NE NAVIGUE PAS — il reste sur /lstng et ouvre
// div.diy--sidepane.success-overlay, qui porte le lien /itm/. La sortie
// « path != /lstng » de verifyEbaySubmission ne pouvait donc signer qu'un
// captcha, une connexion ou une erreur ; elle rendait pourtant `published` sans
// URL et sans annonce (job 56c15a53). Elle devient TERMINALE (`failed`), jamais
// ré-armée — re-mettre en pending, c'est re-déposer, et un second dépôt payant
// est exactement ce qu'on refuse. S'y ajoute platform_fields.publish_proof
// (laquelle des sorties a servi, chemin final, présence de l'overlay, et
// bot_shield_after_submit — le prédicat anti-robot n'était évalué qu'à l'ENTRÉE
// de fillListingForm, donc plus personne ne regardait après le clic).
// Observation pure sur ce dernier point : aucune décision ne change.
// Toujours la 0.5.8 — non soumise au Chrome Web Store, donc
// EXTENSION_MIN_BUILD reste sur la 0.5.6.
// 2026-08-10T15:10:46Z = 2bd222e : manifest bumpé en 0.5.9 pour la soumission
// au Chrome Web Store (le manifest était resté en 0.5.8, la version que le parc
// exécute déjà — le CWS rejette un renvoi de version identique). Du même geste,
// ALREADY_PUBLISHED (package-extension.mjs) est rattrapée de trois versions :
// elle s'arrêtait à 0.5.5, donc la garde « version jamais publiée » laissait
// passer un paquet 0.5.8. La 0.5.9 embarque 8b07130 + 1f5f23d (sonde
// d'avant-suppression Vinted, endpoint /api/v2/items/{id} mort retiré) et
// 973972f (eBay : « formulaire quitté » terminal + publish_proof).
// EXTENSION_MIN_BUILD reste sur la 0.5.6 tant que la review n'est pas ACCEPTÉE
// — on ne réclame jamais au parc une version que personne ne peut installer.
// 2026-08-10T16:48:13Z = 7ce3a3f : un refus SERVEUR nommé de Vinted (HTTP 400
// sur /api/v2/item_upload/items, errors[{field}]) devient un needs_user au lieu
// d'un échec sec. Mesuré : les 4 seuls jobs ayant porté server_required_fields
// sont tous en `failed` — le champ était nommé sur la ligne et personne ne
// pouvait y répondre. Vinted SEUL, champs non résolubles exclus
// (title/description/price/photos/catalog_id/package_size_id restent failed et
// remboursés), plafond needsUserAttempts inchangé. Ni la modale de l'app ni le
// chemin de publication ne bougent. ⚠️ POSTÉRIEUR au paquet
// fillsell-extension-0.5.9-cws.zip construit à 15:11:47Z : ce zip ne contient
// PAS ce correctif.
// 2026-08-10T17:20:40Z = 902cf7a : eBay ne remplit plus, et ne clique plus, sur
// un onglet figé. Job 71942bc2 — brouillon créé, formulaire rempli, et le clic
// n'a produit AUCUNE requête (9 captures, toutes de la télémétrie) : renderer
// muet, dialogue beforeunload natif resté ouvert sur /lstng. Trois gestes :
// tabRepond() teste que l'onglet répond AVANT le dépôt ; ebaySubmitRequestSeen()
// distingue `submit_never_sent` de `timeout_unconfirmed` (preuve positive
// d'absence de POST /lstng/api/listing_draft/{id}/publish) ; et une reprise sur
// onglet neuf ne consomme plus needsUserAttempts (compteur séparé
// frozenTabRetries, borné à 2). Les deux reprises exigent la preuve qu'aucune
// soumission n'est partie — aucun risque de second dépôt.
// ⚠️ POSTÉRIEUR au paquet fillsell-extension-0.5.9-cws.zip (BUILD_ID
// 2026-08-10T16:53:45Z) : ce zip ne contient PAS ce correctif.
// 2026-08-10T17:46:03Z = 5e17d0a : beforeunload neutralisé DÈS L'ARRIVÉE sur
// /lstng (page encore saine, aucun dialogue possible) au lieu de l'être avant
// une navigation, quand il est déjà trop tard. Le remplacement d'onglet reste
// décidé par tabRepond seul — une neutralisation ratée sur un onglet vivant ne
// jette rien. Et publish_proof gagne path_au_clic : final_path était relevé
// après notre propre navigation vers le Hub, il disait /sh/lst/active.
// ⚠️ POSTÉRIEUR au paquet 0.5.9 construit à 16:53:45Z — à re-packager.
// 2026-08-11T09:58:31Z = 5803a1a : precheckJob refuse les cosmétiques
// consommables sur Leboncoin (la plateforme en INTERDIT la vente : les 4 seuls
// jobs LBC partis en Divers > Autres, tous cosmétiques, ont tous échoué).
// Filet uniquement — la vraie garde est côté app, AVANT le débit. Le miroir de
// l'extension est volontairement plus étroit (ni icône ni type dans le payload
// de get-pending-jobs, et « crème » nu écarté : sans icône c'est une couleur).
// ⚠️ POSTÉRIEUR au paquet fillsell-extension-0.5.9-cws.zip : ce zip ne contient
// PAS cette garde, et EXTENSION_MIN_BUILD reste sur la 0.5.6 (la 0.5.9 n'est
// toujours pas acceptée). À embarquer au prochain packaging.
// 2026-08-11T10:25:23Z = 0efc0f4 : sonde de modération Leboncoin dans
// recoverMissingListingUrls — 3 passages bredouilles CONCLUANTS + 2 h depuis
// published_at ⇒ remboursement anticipé, SANS sortir le job du balayage (il
// reste 'published' jusqu'à l'échéance 48 h). Leboncoin seul ; Vinted, eBay et
// Beebs inchangés. La preuve « page vue » est positive (hôte + chemin +
// compteur « En ligne (N) » + garde pagination), jamais déduite.
// ⚠️ POSTÉRIEUR au paquet fillsell-extension-0.5.9-cws.zip, et EXTENSION_MIN_BUILD
// reste sur la 0.5.6 (la 0.5.9 n'est toujours pas acceptée).
// 2026-08-11T10:42:25Z = 083c80c : message « brouillon Leboncoin déjà en
// cours » réécrit — il décrivait notre mécanique interne, il dit maintenant où
// aller, quoi faire, dans quel ordre, et pourquoi on ne supprime rien
// nous-mêmes. Le mot « brouillon » y reste : StockTab le repère par
// DRAFT_LBC_RE pour afficher le bouton « Ouvrir le brouillon Leboncoin ».
// Texte seul, aucun changement de comportement.
// ⚠️ POSTÉRIEUR au paquet 0.5.9 ; EXTENSION_MIN_BUILD reste sur la 0.5.6.
// 2026-08-11T11:43:46Z = 1454b12 : persistDiscoveredAspects applique une
// PRÉCÉDENCE de sources (server_400 > manual > dom). Sa déduplication
// « premier arrivé gagne », combinée à l'ordre du site d'appel, jetait
// silencieusement les refus serveur dès que le champ existait aussi au
// formulaire — d'où 4 lignes 'server_400' seulement dans tout le catalogue,
// toutes sur des clés que le DOM n'énumère pas (photos, title).
// ⚠️ Ne suffit PAS seul : au job suivant, la passe DOM repose required=false et
// l'upsert écrase la promotion. Le garde-fou durable est la migration
// 20260811130000_aspects_refus_serveur_prime.sql, NON APPLIQUÉE à ce jour.
// ⚠️ POSTÉRIEUR au paquet 0.5.9 ; EXTENSION_MIN_BUILD reste sur la 0.5.6.
// 2026-08-11T17:48:04Z = c2591b7 : la garde de session eBay ne conclut plus
// seule. « Connexion eBay requise » partait sur deux signaux de page lus par le
// content script (hôte signin.ebay.fr, ou N'IMPORTE QUEL input[type=password]
// du document) et ne consignait RIEN — ni l'URL, ni lequel des deux avait
// parlé : 6 échecs muets depuis le 27/07 chez 4 utilisateurs. Prouvé faux le
// 11/08 (voirememe) : la sonde HTTP de session répondait ebay.fr/200 neuf
// minutes après, l'utilisateur était connecté dans la même fenêtre, et Vinted +
// Leboncoin ont publié le même article dans la minute. Le verdict revient donc
// à la sonde (arbitrerSessionEbay), le diagnostic { url, signal, sonde, http }
// part en base dans les TROIS issues, et un verdict non arbitré n'écrase plus
// extension_sessions (c'est ce faux qui allumait le bandeau « non connecté »).
// ⚠️ POSTÉRIEUR au paquet fillsell-extension-0.5.9-cws.zip ; le manifest est en
// 0.6.0, version JAMAIS téléversée (absente d'ALREADY_PUBLISHED) : un paquet
// 0.6.0 régénéré embarquera ce correctif sans bump de version.
// EXTENSION_MIN_BUILD reste sur la 0.5.6 (rien de plus récent n'est accepté par
// le Chrome Web Store).
// 2026-08-12T06:24:26Z = 3db8465 et 2026-08-12T06:36:37Z = 58f8c54 (0.6.1) :
// un 403 Vinted n'est plus lu comme une déconnexion (il est rendu par la couche
// anti-robot AVANT que le cookie de session soit regardé), et un verdict
// d'identité resté inconnu après un retry fait ÉCHOUER la sync au lieu de se
// replier sur un id de dressing mémorisé. ⚠️ Ces deux commits ont touché
// chrome-extension/ SANS bumper cette constante : `npm run build` local
// échouait sur la garde ci-dessous depuis ce matin. Rattrapé par la valeur
// ci-dessous, qui les couvre tous les deux.
// 2026-08-12T18:41:22Z = f73add4 : la taille d'une annonce Vinted est lue AUSSI
// dans `item_attributes` ({ code:"size", ids:[…] }), le second des deux
// emplacements que Vinted utilise selon l'annonce — relevé en base sur 5
// payloads réels. Il n'était lu nulle part : la capture sortait 'valide' sans
// taille et Vinted refusait la recréation APRÈS la suppression (article perdu,
// Polo Kaporal / Low11). S'y ajoute le garde-fou du cas résiduel : taille
// absente des DEUX emplacements sur une catégorie qui en exige une ⇒ verdict
// 'incomplet', donc republication bloquée AVANT la suppression. Le chemin
// `size_id` racine est inchangé.
// Manifest toujours en 0.6.1 : ni la 0.6.0 ni la 0.6.1 n'ont été téléversées
// (absentes d'ALREADY_PUBLISHED), un paquet régénéré embarquera ces correctifs
// sans bump de version. EXTENSION_MIN_BUILD reste sur la 0.5.6 — rien de plus
// récent n'est accepté par le Chrome Web Store.
// 2026-08-12T18:48:27Z = eb9d899 : « Sans marque » est un ÉTAT, plus une marque
// manquante. Vinted encode l'absence de marque par un sentinel (brand_id = 1,
// brand_dto.title = "" — chaîne vide, jamais null) que la capture lisait comme
// « brand_id présent sans libellé » : verdict 'incomplet' et republication
// bloquée sur des articles valides. Referme du même geste un second trou de la
// même famille : brand_id ABSENT sortait 'valide' sans écrire libelles.marque,
// et fillListingForm SAUTE le champ quand il est null (`if (fields.marque)`) —
// le formulaire de recréation partait avec #brand vide, donc un 400 APRÈS la
// suppression de l'annonce. Un libellé réel prime toujours, et un brand_id réel
// non résolu reste bloquant (écrire « Sans marque » là serait une dégradation
// silencieuse). Le chemin de recréation n'a pas bougé : il ne recevait
// simplement jamais la valeur.
// 2026-08-12T20:32:12Z = a918167 : un 403 anti-robot sur la sonde de session
// de la sync du dressing n'est plus un échec sec après un retry de 4 s — le
// run est clos 'failed' avec le marqueur [retry403] et RÉ-OUVERT par une
// alarme chrome.alarms (5, 10 puis 20 min, un nom par user), même ligne
// vinted_sync_runs à chaque reprise. Relevé prod : 11 échecs 403 sur 21
// résolus par un simple re-clic (médiane ~9 min, max 39), zéro réessai espacé
// resté bloqué — le retry de 4 s tombait toujours dans la fenêtre de blocage.
// StockTab affiche « nouvelle tentative automatique dans ~X min ». Manifest
// toujours en 0.6.1, jamais téléversée : un paquet régénéré embarquera ce
// correctif sans bump de version. EXTENSION_MIN_BUILD reste sur la 0.5.6 —
// rien de plus récent n'est accepté par le Chrome Web Store.
// 2026-08-12T21:09:29Z = 4b845b3 (0.6.2) : la republication ne supprime plus
// jamais sans filet — snapshot confirmé sur le job avant tout geste, pré-vol
// en UNE PASSE (formulaire /items/new rempli et vérifié gates strictes AVANT
// la suppression, qui part par l'API depuis la page du formulaire, puis
// soumission du même formulaire), retentatives auto 2× après suppression puis
// needs_user avec snapshot conservé, vintedAspects propagé à la recréation.
// Manifest bumpé en 0.6.2 (la 0.6.1 est publiée et tourne chez 23 comptes).
// EXTENSION_MIN_BUILD reste sur la 0.5.6 — la 0.6.2 n'est pas encore soumise.
// 2026-08-12T21:53:39Z = 4fbf20b (0.6.3) : la matière n'est plus perdue à la
// republication — ids capturés depuis item_attributes (libelles.matiere_ids),
// référentiel id→libellé relevé sur le MENU OUVERT du formulaire
// (data-testid="material-<id>"), pose directe des nœuds. Optionnelle partout
// (21/21 required=false) : tout échec est un warning, jamais un blocage.
// Manifest 0.6.3 ; le paquet attend l'ACCEPTATION de la 0.6.2 en examen CWS.
// EXTENSION_MIN_BUILD reste sur la 0.5.6.
// 2026-08-13T13:03:47Z = a426979 (0.6.4, main) : la taille des captures 0.6.1
// résolue par IDS sur le menu « Taille » ouvert (selectSizeByIds,
// auto-validation du référentiel). ⚠️ RETIRÉ AU MERGE DU 14/08 (consigne du
// 13/08 maintenue) : le suffixe numérique de size-group-<n> n'est pas prouvé
// être l'id de la TAILLE (et non du groupe) — le résolveur vinted.js et son
// site d'appel ne sont dans AUCUN paquet ; la capture des ids
// (construireJobRecreation → platform_fields.taille_ids) reste, données
// conservées pour une réintroduction sur preuve.
// 2026-08-13T14:14:47Z = 96eb059 (0.6.3, BRANCHE ext-0.6.3-cause403 basée sur
// 7971dc4 = la 0.6.2 publiée/acceptée au CWS — SANS les commits matière ni
// selectSizeByIds de main, consigne Nico 13/08) : la cause d'un 403 de la
// sync est lue dans le NAVIGATEUR via chrome.cookies (cookie v_uid, posé par
// le login Vinted) et écrite en base ([cause403] session_absente /
// session_presente / indetermine, survit à l'échec définitif).
// session_absente court-circuite le cycle 5/10/20 : échec immédiat
// « connecte-toi sur vinted.fr ». Permission "cookies" ajoutée au manifest.
// EXTENSION_MIN_BUILD reste sur la 0.5.6 — la promotion vers le build 0.6.2
// publié est un geste web (main), hors de cette branche.
// 2026-08-13T18:35:36Z = d6b88a4 (0.6.4, même branche) : sonde de dépôt Beebs
// (product_id capté, listing_url posé à la mise en ligne seulement), message
// REAUTH VENTE eBay (step-up signin.ebay.fr/eBayISAPI.dll), options du champ
// « Produit » LBC relevées SUR PLACE au blocage (needsUserField dropdown),
// markNeedsUser transmet input_type, détecteur photos LBC réparé (vignettes
// CDN img.leboncoin.fr, plus jamais « 0 détectée » à tort), règle du
// pré-rempli (jamais écrasé par une valeur hors liste, repli marque
// Autre/Sans marque), matière par ids (cherry-pick 4fbf20b).
// 2026-08-14T08:51:31Z = cb5585b (0.6.5) : PAQUET UNIQUE après merge de la
// branche ext-0.6.3-cause403 dans main (5690539) — contenu 0.6.4 en review
// + gardes anti-effondrement du marquage disparu_le (cb10c36, dossier Manon
// multi-comptes) + « Connexion Vinted requise » arbitré par la sonde HTTP
// (a9f005d, doctrine c2591b7). selectSizeByIds toujours EXCLU (cf. entrée
// a426979). EXTENSION_MIN_BUILD inchangé — ni 0.6.4 ni 0.6.5 acceptées.
// Le zip livré 0.6.5 = fillsell-extension-0.6.5-fe901f4.zip, packagé à
// fe901f4 — AVANT le commit suivant.
// 2026-08-14T08:57:21Z = 1fc9beb (F1 multi-comptes : trace identité,
// attribution vinted_account_id, épinglage) : code NON ÉPROUVÉ, il touche le
// marquage disparu_le de la sync — le chemin qui a éteint 384 articles dans
// la nuit du 13 au 14. ⚠️ EXCLU du paquet 0.6.5 (décision Nico 14/08 :
// « seul le prouvé part en circulation », doctrine ext-0.6.3-cause403) — il
// attendra un paquet ultérieur, avec un bump de version à ce moment-là.
// 2026-08-14T12:16:01Z = 401c649 : catégorie sans champ Marque (Livres) +
// cible « Sans marque » (brand_id 1) = NO-OP silencieux au lieu d'un
// needs_user (jobs d359b972/e5b0e6fd de Lau Brzl). Absence conclue APRÈS
// l'attente standard des champs conditionnels ; une VRAIE marque sur picker
// absent garde son throw. (Le bump de manifest fait dans ce commit a été
// ANNULÉ le jour même : aucune 0.6.5 n'ayant jamais été téléversée au CWS,
// le paquet reste une 0.6.5 — correction Nico 14/08 après-midi.)
// 2026-08-14T12:56:30Z = 9d14b9d (2.4.54 côté app) : eBay famille B — quand
// le clic « Mettre en vente » ne produit AUCUNE requête de publication, le
// draftId relevé dans la télémétrie captée est consigné
// (platform_fields.ebay_draft_id) : un brouillon existe côté eBay, l'app le
// dit à l'affichage (humanizeJobError). Cause du clic sans effet NON établie
// — aucun correctif spéculatif. Famille A : la branche générique
// d'arbitrerSessionEbay n'affirme plus « ta session eBay est valide » (la
// sonde ne prouve que la page d'entrée prelist, pas le droit de déposer).
// 2026-08-14T12:56:59Z = bd594a6 : manifest REMIS en 0.6.5.
// 2026-08-14T13:34:22Z = c419489 : famille B eBay, CAUSE ÉTABLIE par
// observation directe (clic synthétique realClick sur /lstng, brouillon
// 5217561021321) — le bouton apparaît dans le DOM bien avant que la
// délégation Marko soit branchée (aucun <form>, onclick null ; hydratation
// différée en onglet caché, markoInitComponents absent à 88 s), le clic est
// alors avalé SANS requête ; et un bandeau de validation peut apparaître ~4 s
// après un clic mort SANS POST — le détecteur DOM « notice apparue » validait
// des clics morts et étouffait le re-clic. Le re-clic est désormais gouverné
// par la sonde réseau (EBAY_SUBMIT_SEEN → ebaySubmitRequestSeen, même lecteur
// que le verdict) : 3 clics max, budgets 8/12/16 s, re-clic uniquement si
// AUCUN POST capté. Hypothèses doublon de bouton / disabled pré-clic
// RÉFUTÉES sur pièces.
// ⚠️ LE PAQUET 0.6.5 SE CONSTRUIT SUR LA BRANCHE ext-0.6.5-sans-f1 (base
// fe901f4 + fix Marque + fixes eBay), PAS sur main : main porte F1 (1fc9beb),
// exclu de la circulation. Un paquet construit ICI embarquerait F1.
// 2026-08-15T09:35:00Z = réparation de la VÉRIFICATION Vinted (panne du
// 12-15/08 : onglet de travail déchargé rendu tel quel par workTabForFetch +
// repli service worker désormais 403 DataDome → 100 % d'« unknown » chez les
// vendeurs peu actifs). Deux couches : réveil de l'onglet déchargé (Vinted
// seulement) + repli wardrobe via content script (preuve positive uniquement).
// Committé avec GIT_COMMITTER_DATE épinglée sur cette constante (garde
// ci-dessous : ni futur, ni antérieur).
// 2026-08-16T16:52:07Z = cherry-picks des points 1 et 3 du chantier 16/08
// depuis la branche ext-0.6.5-sans-f1 (1cc8d36 = recapture auto d'une capture
// de republication périmée, 32b156e d'origine ; e955c59 = table des colis
// 8..14 relevée en réel + sélection PAR ID + fin du repli « Grand », 6be32d5
// d'origine, SANS le bloc ISBN de 1be6b19 que main ne porte pas). Le paquet
// CWS continue de se construire sur la BRANCHE, pas ici — main porte F1.
// 2026-08-21T09:36:16Z = capture incomplète de republication → needs_user
// actionnable (7b662cf sur la branche ext-0.6.5-sans-f1, cherry-pick main
// c1a086f) : a_capturer et pré-vol négatif posent needs_user (champs nommés,
// Pépite réservée, balayage 72 h) au lieu de failed ; fusion
// republish_user_fields (saisie app) dans la capture ; motif « taille
// (absente des deux emplacements) » RETIRÉ du verdict (faux positif prouvé,
// catalog 1441 Lunettes sous le rayon Vêtements sans champ Taille — relevé
// DOM du 21/08). ⚠️ HORS zip 0.6.7 (9ae7302, figé en attente d'acceptation
// de la 0.6.6) : ces correctifs partent dans le paquet SUIVANT. En attendant,
// update-job-status requalifie côté serveur les failed « Capture
// incomplète » du parc en needs_user. EXTENSION_MIN_BUILD inchangé.
// 2026-08-27T14:30:00Z = 133a874 : messages urlToFile des 4 content scripts —
// l'échec « photo hébergée hors FillSell » ne demande plus de REGÉNÉRER
// l'annonce (6 Pépites pour notre bug) : il annonce la reprise automatique
// (rapatriement serveur + ré-armement par handler-watch v13, déjà LIVE côté
// serveur). Le marqueur « hors FillSell » est CONSERVÉ : c'est la signature
// que le balayage handler-watch matche (.ilike) — ne pas le reformuler.
// Texte seul, aucun changement de comportement. ⚠️ HORS zip 0.6.9 courant :
// part dans le paquet SUIVANT. EXTENSION_MIN_BUILD inchangé.
// 2026-08-27T14:50:00Z : la sync dressing COMBLE inventaire.prix_vente avec le
// prix de l'annonce Vinted quand il est NULL (création + mise à jour, upsert
// plein ET patchLeger quand la ligne relue le prouve). JAMAIS d'écrasement
// (renseigné = intouchable, articles vendus exclus, VIDE ≠ ZÉRO) — révise la
// règle « jamais le prix d'annonce dans prix_vente » du chantier 4 : 98,4 %
// des articles synchronisés actifs étaient à NULL, la carte n'avait rien.
// Commit épinglé GIT_COMMITTER_DATE sur cette constante (garde : ni futur, ni
// antérieur). ⚠️ HORS zip 0.6.9 : paquet SUIVANT. EXTENSION_MIN_BUILD inchangé.
// ── Journal de la BRANCHE ext-0.6.5-sans-f1 (fork fe901f4, paquets 0.6.5 → 0.6.9) —
// réintégré tel quel par le merge de réconciliation du 27/08 (entrée en fin de journal) :
// 2026-08-14T12:58:51Z = 530d993 (BRANCHE ext-0.6.5-sans-f1, base fe901f4) :
// paquet 0.6.5 re-packagé — AUCUNE 0.6.5 n'ayant jamais été téléversée au
// CWS (correction Nico 14/08), le numéro est réutilisable. Contenu = zip
// d'origine + no-op Marque absente (401c649) + brouillon eBay consigné
// (ebay_draft_id) + message de session eBay sans surpromesse. SANS le
// multi-comptes F1 (1fc9beb, main) : code non éprouvé qui touche le marquage
// disparu_le — seul le prouvé part en circulation (doctrine
// ext-0.6.3-cause403). EXTENSION_MIN_BUILD inchangé.
// 2026-08-14T13:35:14Z = 33fddeb (même branche) : re-clic « Mettre en vente »
// gouverné par la PREUVE RÉSEAU (EBAY_SUBMIT_SEEN → ebaySubmitRequestSeen) au
// lieu des signaux DOM — miroir de c419489 (main), où l'observation directe
// établit la cause de la famille B : hydratation Marko différée (bouton dans
// le DOM sans handler, clic avalé sans requête) + bandeau menteur rendu sans
// POST qui étouffait le re-clic. 3 clics max, budgets 8/12/16 s, re-clic
// uniquement si AUCUN POST capté.
// 2026-08-15T09:50:00Z = paquet 0.6.6 (même branche, date de commit épinglée) :
// - VÉRIFICATION VINTED RÉPARÉE (panne 12-15/08, par machine) : réveil de
//   l'onglet de travail déchargé dans workTabForFetch (Vinted seul) + repli
//   wardrobe via content script dans checkPublishedListings (preuve positive
//   uniquement) — miroir de 88dbc97 (main) ;
// - stampVintedItemId : l'id de l'annonce créée rattaché à
//   inventaire.vinted_item_id à la publication (miroir de bde2b4a, main) ;
// - Legal.jsx : la ligne « cookies » du tableau /legal reprise seule depuis
//   1fc9beb (c'était sa SEULE modification de Legal) — répare le build Vercel
//   de la branche, en ERROR depuis le 14/08 sur check:legal-permissions.
// Manifest bumpé 0.6.5 → 0.6.6 : un zip 0.6.5 (dff6cdd) a déjà été LIVRÉ le
// 14/08 (jamais téléversé) — produire un second 0.6.5 au contenu différent
// est exactement l'ambiguïté à éviter. TOUJOURS SANS F1 (1fc9beb).
// 2026-08-15T20:23:32Z = 1be6b19 (même branche, soirée 15/08 — le zip 0.6.6
// d235bc3 du matin est PÉRIMÉ, ne pas le téléverser) :
// - ISBN Livres Vinted : capturé (natif.isbn → libelles.isbn) et RÉINJECTÉ à
//   la recréation (#isbn / isbn--input) — annonce de Rose perdue le 15/08 ;
//   clé isbn illisible → blocage AVANT suppression ; isbn null → republie
//   telle quelle (jamais bloquer la catégorie) ;
// - package_size_id hors table (8, 11 relevés) → repli « Grand » + trace,
//   la republication POURSUIT au lieu de bloquer ;
// - brouillon LBC bloquant : SUPPRIMÉ (retrait des clés de storage portant le
//   titre restauré) puis retentative unique en onglet neuf — décision Nico
//   15/08, ancienne politique abandonnée ; messages en une ligne, sans nom de
//   champ interne. TOUJOURS SANS F1 (1fc9beb).
// 2026-08-15T21:42:16Z = bb131b8 (point 8, APRÈS le paquet 0.6.6-1d20b3d) :
// garde catégorie-vs-grille de tailles (arrêt avant publication quand la
// grille n'offre AUCUNE correspondance, message qui nomme la catégorie avec
// les options réelles du DOM) + « accepte : » cite le formulaire relevé et
// plus la config catalogue. ⚠️ DÉLIBÉRÉMENT HORS du zip 1d20b3d, qui part au
// CWS tel quel (consigne du 15/08 soir) : ces gardes embarqueront dans le
// paquet SUIVANT — tout re-package depuis cette branche les inclura de fait
// (la garde n°4 l'exigera). La cause racine (« drapé » → 🛌) est corrigée
// côté app (db37b1e, main). TOUJOURS SANS F1 (1fc9beb).
// 2026-08-15T22:16:54Z = 79e029c (point 9, Modèle Vinted — AirPods de Samdo) :
// normModel unifie ordinaux/parenthèses/accents (« 3ème génération » matche
// « (3e génération) »), selectVintedModel à 3 états + relevé des options du
// menu, blocage AVANT envoi quand le modèle fourni n'est pas au catalogue
// (message = options réelles, needsUserField model), gate pré-clic élargie au
// sélecteur complet du champ, message 400 actionnable. Comme bb131b8 : HORS du
// zip 1d20b3d déjà téléversé — paquet SUIVANT. TOUJOURS SANS F1 (1fc9beb).
// 2026-08-16T14:25:09Z = 32b156e (point 1 du chantier 16/08, recapture auto) :
// capture de republication périmée (>24 h) → RECAPTURE AUTOMATIQUE depuis
// vinted_item_id au lieu d'un needs_user sec (22 jobs de Carla gelés le
// 15/08). Ordre strict conservé (capture fraîche réussie AVANT toute
// suppression), annonce absente → needs_user « plus en ligne », plafond de
// 2 recaptures auto (recaptures_perimees), aucun re-débit. Comme bb131b8 et
// 79e029c : HORS du zip 1d20b3d déjà téléversé — paquet SUIVANT. TOUJOURS
// SANS F1 (1fc9beb).
// 2026-08-16T14:41:52Z = 6be32d5 (point 3 du chantier 16/08, colis Vinted) :
// table des formats de colis complétée par RELEVÉ DOM sur /items/new
// (8=« 5 kg »/9=« 10 kg »/10=« 20 kg » sur Vases, 11..14 idem+« 30 kg » sur
// Nacelles), sélection PAR ID à la recréation (le même libellé couvre
// plusieurs ids selon le groupe de catégories), et RETRAIT du repli « Grand »
// du 15/08 : un id hors table re-bloque AVANT toute suppression (doctrine
// 16/08 — jamais de taille inventée). HORS du zip 1d20b3d — paquet SUIVANT.
// TOUJOURS SANS F1 (1fc9beb).
// 2026-08-16T17:05:53Z = bump manifest 0.6.6 → 0.6.7 (le zip 0.6.6-1d20b3d
// est TÉLÉVERSÉ et en review au CWS : la version est brûlée, cf.
// ALREADY_PUBLISHED). La 0.6.7 embarque TOUT le delta de la branche depuis le
// zip 1d20b3d : bb131b8 (garde catégorie-vs-grille de tailles), 79e029c
// (Modèle Vinted normalisé + blocage avant envoi), 32b156e (recapture auto
// d'une capture périmée), 6be32d5 (colis 8..14 relevés + sélection par id +
// fin du repli « Grand »). Committé avec GIT_COMMITTER_DATE épinglée sur
// cette constante (ni futur, ni antérieur). TOUJOURS SANS F1 (1fc9beb).
// 2026-08-21T09:36:16Z = 7b662cf (même branche) : capture incomplète de
// republication → needs_user actionnable. a_capturer et pré-vol négatif
// posent needs_user (champs nommés, Pépite réservée, balayage 72 h) au lieu
// de failed ; fusion republish_user_fields (saisie app : taille/marque/état/
// ISBN) dans la capture AVANT verdict ; motif « taille (absente des deux
// emplacements) » RETIRÉ du verdict (faux positif prouvé : catalog 1441
// Lunettes vit sous le rayon Vêtements SANS champ Taille — relevé DOM du
// 21/08 ; le pré-vol tranche sur le formulaire réel). ⚠️ HORS zip 0.6.7
// (9ae7302, figé en attente d'acceptation de la 0.6.6) : paquet SUIVANT —
// tout re-package depuis cette branche l'inclura de fait. En attendant,
// update-job-status (main) requalifie côté serveur les failed « Capture
// incomplète » du parc en needs_user. EXTENSION_MIN_BUILD inchangé.
// TOUJOURS SANS F1 (1fc9beb).
// 2026-08-23T13:47:21Z (même branche) : DEADLOCK de la republication
// automatique — autoCaptureEtRepublier appelait captureVintedItem (version
// VERROUILLÉE) depuis l'intérieur du poll, qui détient déjà withJobFlowLock ;
// le verrou étant une chaîne de promesses non réentrante, la capture attendait
// la fin du poll et le poll attendait la capture. Auto-blocage silencieux à
// chaque cycle : É6 n'a JAMAIS créé un seul job (0 republish_source='auto'
// sur tout le parc depuis le 05/08, constat du 23/08 — cas josephinecerni,
// Pro payé pour cette fonction). Passage à captureVintedItemUnlocked, la
// même version sans verrou que processRepublishJob utilise déjà — c'est le
// piège que son bandeau documentait mot pour mot. Dans le zip 0.6.7 à venir.
// 2026-08-23T13:48:15Z (même branche) : garde snapshot de É6 rendue
// SATISFAISABLE (option a, GO Nico 23/08). Elle exigeait, par article, un
// premier relevé vieux de ≥ age_jours alors que la table des relevés n'existe
// que depuis le 03/08 : 100 % des candidats sautés, pour tout le monde, sans
// un log (2e verrou du « 0 job auto » avec le deadlock ci-dessus). Désormais
// la garde ne s'applique que si le premier relevé du COMPTE a ≥ age_jours
// (historique probant) ; sinon listed_at_guess fait foi seul — donnée
// manquante toujours bloquante, plancher 7 jours intact. Se ré-arme seule
// quand l'historique mûrit. Dans le zip 0.6.7 à venir.
// 2026-08-23T13:49:29Z (même branche) : garde des requis LIÉE à la catégorie
// sélectionnée (cas grisette11, 23/08 : « Taille » nourrisson exigée sur une
// miniature de camion en Jouets > Voitures — needs_user irrésoluble, le
// formulaire n'a pas ce champ). La sonde extrait catalog_id du CORPS du POST
// /item_upload/attributes (attrsCatalogId, fetch + XHR) ; côté formulaire,
// readLatestAttrsConfig ne juge plus qu'avec la capture portant l'id lu dans
// #category — config VIDE après sélection = « aucun requis », jamais
// « reprends la précédente » (l'ancien saut des configs vides ressuscitait
// celle de la catégorie auto-suggérée par le titre). Id lisible sans capture
// → « non vérifiable » (gate n°0, relance re-capte) ; id illisible → repli
// d'avant, dernière capture, vide comprise. Même racine que le motif literie
// du point 8 (15/08), corrigé cette fois au JUGEMENT et plus seulement au
// message. Dans le zip 0.6.7 à venir.
// 2026-08-23T18:23:45Z (même branche) : /fpa/* reconnu comme mur de
// vérification du COMPTE VENDEUR eBay (emilie.rigal03 ×2 le 23/08 :
// /fpa/upgrade servi à la place de /lstng). Le message disait « categoryId
// probablement refusé » + jargon de mapping ; il dit désormais qu'eBay
// demande une vérification du compte et quoi faire sur ebay.fr. Restriction
// côté eBay, rien à corriger chez nous — 2 occurrences sur 91 tentatives
// 7 jours. Dans le zip 0.6.7 à venir.
// 2026-08-23T18:24:53Z (même branche) : Univers Leboncoin, correctif CIBLÉ
// (1 cas sur 103 publications LBC en 7 jours — maillot adidas Junior de
// Bilel, job b2a1870f). Le contrôle « Univers » de Mode > Vêtements (clé
// clothing_type, options premier niveau Femme/Maternité/Homme/Enfant
// relevées en base sur le needsUserField du job) ne connaît ni « Garçon »
// ni « Fille » : fillUnivers tente désormais l'équivalent « Enfant » après
// la valeur du job. Warnings VÉRIDIQUES (« remplacé » seulement après un
// clic réussi ; sinon « pré-rempli laissé en place ») et needsUserField
// routé par LIBELLÉ (« Univers » → platform_fields.univers) au lieu de la
// règle par suffixe _type$ qui envoyait la saisie vers lbcProduit, jamais
// relu par fillUnivers. Dans le zip 0.6.7 à venir.
// 2026-08-23T18:26:09Z (même branche) : format de colis Vinted — le
// sélecteur n'était pas mort, c'est le {n} demandé qui n'existe pas sur les
// grilles AU POIDS (relevé DOM 23/08 : Aspirateurs = ids 11..14 avec les
// testids attendus ; aspirateur robot de lohanobert = publish « Petit » →
// n=1 introuvable → « aucun des 1 maillon(s) n'a résolu »). Deux gestes :
// maillons de repli au registre (#package_type_selector_{n}, radio dans la
// cellule {n}-package-size--cell), et selectPackageSize qui, à id non
// offert, matche par LIBELLÉ exact parmi les radios présents (« 5 kg » vit
// en 8 ET 11 selon le groupe) puis conserve le pré-coché « Recommandé » de
// Vinted en dernier repli — jamais de format inventé, échec visible si rien
// n'est offert ni pré-coché. Dans le zip 0.6.7 à venir.
// 2026-08-23T18:27:07Z (même branche) : Livres Vinted, les deux jambes du
// point 8 du chantier 23/08 (13 annonces perdues, 9 utilisateurs — LE bug
// destructeur). RELEVÉ DOM LIVE du jour sur /items/new (Livres > Fiction) :
// #isbn / isbn--input EXISTE après pose de la catégorie et la frappe façon
// typeHuman COMMITE bien dans l'état React (vérifié aux fibers) — la
// mécanique de pose est saine. Les deux vraies causes : (1) estLivre jugeait
// sur le libellé FRANÇAIS « Livres et médias » (faux compte anglais → ISBN
// jamais capturé → 400 Vinted après suppression) → désormais par ID DE
// RACINE (2309) via racineDuCatalogue, anciens signaux en repli ; (2) les
// formulaires Livres n'ont AUCUN champ Marque (relevé DOM) et une marque
// réelle (« J'ai lu », « Disney », 5 échecs/7 j) mourait en cascade →
// no-op + warning structuré brand_field_absent quand le champ est absent
// (conclu après l'attente standard, comme le no-op « Sans marque »).
// La garde Livres SERVEUR (update-job-status v21) reste active jusqu'au
// déploiement — elle bloque proprement, rien à retirer avant. Dans le zip
// 0.6.7 à venir.
// 2026-08-23T18:47:58Z (même branche, GO 9b) : PAGINATION de « Mes
// annonces » Leboncoin dans le recovery + la sonde de modération. La page
// n'affiche que ~30 annonces : sur les comptes au-dessus (jocaille 66,
// bilel 41 — les DEUX seuls touchés, corrélation parfaite), les annonces
// des pages suivantes étaient invisibles → URL jamais récupérée → cron 48 h
// requalifiait en échec + remboursait des annonces EN LIGNE (3 jobs bilel
// 20/08, moderation_probe « liste_partielle_30_sur_41 »). Désormais :
// marche de ?page=N (borné 6) tant que le cumul de liens DISTINCTS ne
// couvre pas « En ligne (N) » et que la page apporte du neuf ; les titres
// sont cherchés sur CHAQUE page ; le verdict de sonde est rendu APRÈS la
// dernière page sur la couverture cumulée — « absent » exige la liste
// entière réellement vue, tout le reste (pagination interrompue, schéma
// ?page inopérant, DataDome, session) reste NON CONCLUANT, compteur
// inchangé. Échec fermé : si ?page n'est pas le bon schéma, la page 2 ne
// rapporte rien de neuf → arrêt → comportement d'avant (aucune
// conclusion), jamais un « absent » sur du partiel. DataDome non touché.
// Le cas Romain (voirememe, 6 annonces, 1 non confirmée) N'EST PAS couvert
// par ce correctif : autre cause, dossier séparé. Dans le zip 0.6.7.
// 2026-08-24T06:41:00Z (même branche, point F du chantier détection des
// ventes) : COUVERTURE de la surveillance des annonces published. Constat en
// base : sur 20 178 annonces publiées actives, 7 004 jamais vérifiées
// (last_checked_at NULL) et 3 284 de plus de 7 jours. Trois gestes, AUCUN ne
// touche les détecteurs ni le marquage disparu_le de la sync :
//   1. un échec de get-pending-jobs (5xx/réseau, hors 401) ne saute plus le
//      cycle de détection entier — checkPublishedListings tourne quand même ;
//   2. cadence 8 → 12 annonces par cycle de 30 min, mais pause inter-lectures
//      ÉLARGIE 1,5-4 s → 2,5-6 s : plus de couverture, rythme instantané en
//      BAISSE (étalement, jamais de rafale) ;
//   3. fenêtre de lecture 30 → 60 lignes (une seule requête REST) : les jobs
//      en délai de grâce ou en temporisation ne masquent plus les dus.
// Dans le zip 0.6.7 à venir. TOUJOURS SANS F1 (1fc9beb).
// 2026-08-24T07:49:00Z (même branche, audit pré-téléversement — GO Nico) :
// DEUX corrections avant le zip qui part réellement au CWS, RIEN d'autre :
//   1. NOM DU MANIFEST RÉPARÉ : « FillSell â€” Cross-post » → « FillSell —
//      Cross-post » (tiret cadratin U+2014, octets E2 80 94, sans BOM —
//      vérifié aux octets). Le tiret avait été DOUBLE-ENCODÉ par la
//      réécriture « sans BOM » du 16/08 (9d640bd) et rien ne le contrôlait :
//      tous les zips 0.6.7 du 16 au 24/08 portaient un nom cassé, attrapé à
//      l'audit du 24/08. package-extension.mjs porte désormais une garde
//      5bis : nom du manifest vérifié à CHAQUE paquet (BOM interdit, égalité
//      stricte avec la valeur attendue en échappé —) ;
//   2. SALE_CHECK_MAX_PER_CYCLE ramené 12 → 8 (décision Nico à l'audit) :
//      le poll est à 2 MINUTES (POLL_INTERVAL_MINUTES, 78cf410) et non aux
//      « 30 min » que les commentaires répétaient — à 12/cycle la pointe de
//      rattrapage serait passée de 240 à 360 lectures/h pour tout le parc à
//      la fois. Les deux autres gestes du point F restent (résilience à
//      l'échec de get-pending-jobs, fenêtre 60 lignes), la pause élargie
//      2,5-6 s reste, et les commentaires « 30 min » sont corrigés.
// Dans le zip 0.6.7. TOUJOURS SANS F1 (1fc9beb).
// 2026-08-24T18:40:00Z = 0.6.8 : verdicts de recréation Vinted HONNÊTES —
// « Vinted a REFUSÉ » ne se dit plus que preuve réseau à l'appui (HTTP +
// errors[] capturés par la sonde) ; sans requête observée, le message dit
// « la validation du formulaire a bloqué l'envoi, Vinted n'a pas été
// interrogé » (Flipper de Prudence, 24/08 : diagnostic impossible depuis la
// base parce que les deux cas portaient le même texte). serverRequired reste
// réseau-seulement. La protection des annonces sans couleur, elle, est
// SERVEUR (garde update-job-status du 24/08) — rien à embarquer ici.
// 2026-08-24T21:35:00Z = 0.6.9 (chantier de nuit ISBN + eBay, observations en
// session réelle du 24/08 au soir — compte test nelsonchatnoir/nicsvob_0) :
// VINTED (annonce-témoin 9769001747 créée avec ISBN accepté et résolu par le
// serveur — natif.isbn = 9782749933276, book_title auto) :
//   - normalizeIsbn : tirets/espaces retirés, ISBN-10 → ISBN-13 (clé
//     RECALCULÉE), clés de contrôle vérifiées — un ISBN invalide ne se pose
//     plus, le message le cite (un des cas détruits portait un ISBN-10) ;
//   - pose ISBN par insertText EN UN COUP (famille du piège prix) +
//     RELECTURE EXACTE de l'état React (readCommittedValue) — relecture ≠
//     écrit → retentative puis REFUS de soumettre, ISBN dans le message ;
//   - fillTextField (titre/description) : relecture systématique de l'état
//     commité après typeHuman, retentative insertText sur écart, erreur
//     franche si l'état reste mutilé (tolérances : espaces de bord,
//     troncature maxLength).
// EBAY (draft 5257871060520 → annonce 800557746918 créée par API PURE puis
// terminée — la recette du repli est MESURÉE de bout en bout) :
//   - pré-vol step-up (sonderStepUpVente) : GET /sl/list redirigé vers
//     signin.ebay.* → « REAUTH VENTE » AVANT d'ouvrir le formulaire ;
//   - clic mort (20 échecs/14 j, fenêtre minimisée, hydratation Marko morte) :
//     sur preuve submit_never_sent, retour sur le brouillon et PUBLICATION
//     DIRECTE par l'API (POST /lstng/api/listing_draft/{id}/publish?mode=…,
//     jeton srt lu dans div#csrf-data — rendu SERVEUR, vérifié dans le HTML
//     brut) ; succès = itemId dans la réponse (published), refus = champs
//     manquants NOMMÉS (needs_user honnête, brouillon conservé) ;
//   - description : le textarea miroir ne synchronise PLUS (mesuré, même en
//     frappe réelle) → pose par PUT delta du brouillon (fillDescription →
//     putDescriptionViaDraftApi), fin de la famille « jamais synchronisée » ;
//   - /fpa/* : message honnête (mise à niveau du COMPTE exigée par eBay,
//     page nommée — /fpa/upgrade = 404 sur compte sain, relevé 24/08).
// 2026-08-25T21:56:00Z = 0.6.8 UNIQUE pour le CWS (décision Nico 26/08 : la
// 0.6.7 est publiée/acceptée, le numéro 0.6.8 n'a jamais été soumis — les
// étiquettes internes « 0.6.8-4253102 » et « 0.6.9 » sont regroupées ici).
// Contenu = tout le delta de la branche (eBay publish API + PUT description +
// pré-vol REAUTH + /fpa honnête ; verdicts de recréation honnêtes ; pose ISBN
// normalisée insertText + relecture) PLUS, dans ce commit :
//   - fix COULEUR de republication, périmètre STRICT : ne s'active QUE si la
//     capture n'a AUCUNE couleur (les annonces avec couleur suivent le chemin
//     d'avant à l'identique). Sources : vintedAspects.color + colors du
//     publish d'origine (couleursDePublicationOrigine, background) → mot de
//     la palette réelle lue dans le TITRE → sinon needs_user AVANT toute
//     suppression (circuit prevol_negatif, champ nommé, palette proposée) ;
//     champ Couleur ABSENT du formulaire (cartes 4875, mesuré 25/08) → no-op.
//     Relecture de l'état commité après pose (périmètre ISBN + Couleur).
//   - RETRAIT du durcissement fillTextField sur titre/description (décision
//     Nico 26/08) : la relecture est LIMITÉE à l'ISBN et à la Couleur — les
//     milliers de publications qui passent ne changent pas de chemin.
// Téléversement SANS test unpacked (décision Nico) : vérification de
// démarrage en profil Chrome isolé + relecture d'assemblage avant livraison.
// 2026-08-26T19:46:00Z = 0.6.9 (PANNE TOTALE de publication Vinted depuis le
// 26/08 ~11:30 Paris — bascule mesurée en prod entre la dernière sélection de
// catégorie réussie à 11:29 et le premier « niveau introuvable, options [] »
// à 11:31, toutes versions 0.6.7/0.6.8 confondues) : Vinted a passé les
// cellules FEUILLE de ses pickers de role="button" à role="radio" (cellules
// navigables et ids inchangés — relevé live compte test le 26/08 au soir,
// Parfums=catalog-152, brand-12 "Zara", #custom-select-brand, #empty-brand
// tous en role=radio). DÉBLOCAGE SEUL, rien d'autre dans ce paquet :
//   - publish.catalog_option : union button|radio dans le maillon 0 (seul lu
//     par selectorFor) ;
//   - publish.model_option : [role="radio"] ajouté au closest ;
//   - publish.custom_brand_option / no_brand_option : maillon radio EN PLUS
//     (leurs ids primaires tiennent toujours) ;
//   - selectVintedBrand (vinted.js:3470) : aria-label matché en button ET
//     radio.
// selectCategory, isChevronOption, gardes Livres/Couleur, cycle Pépites :
// INTACTS. Les champs état/taille/matière/stockage sont en data-testid, non
// touchés par la bascule. Manifest bumpé 0.6.9 (la 0.6.8 daae23d est publiée
// par le CWS depuis le 26/08 au matin, cf. ALREADY_PUBLISHED).
// EXTENSION_MIN_BUILD inchangé tant que la 0.6.9 n'est pas ACCEPTÉE.
// Committé avec GIT_COMMITTER_DATE épinglée sur cette constante.
// 2026-08-27T21:30:00Z = MERGE de réconciliation main ↔ ext-0.6.5-sans-f1
// (GO Nico 27/08 soir). La branche (code du parc, 0.6.9 servie par le CWS)
// est la BASE ; main y réapporte F1 RÉDUIT — décision Nico 27/08 :
//   · CONSERVÉ : trace d identité (vinted_user_id + vinted_login PATCHés
//     sur chaque run, écriture séparée de la clôture) ;
//   · ABANDONNÉ : l attribution par compte (étiquetage vinted_account_id
//     des articles, sonde compteColonneOk, scoping du marquage par
//     colonne) et l épinglage (vinted_sync_pin, [pin_mismatch], pose au
//     done) — FillSell ne gère pas de comptes, il reflète celui connecté
//     dans Chrome. Le scoping du marquage passe par l identité DU RUN
//     (commit suivant, sync mono-compte).
// Les avertissements « un paquet construit sur main embarquerait F1 »
// ci-dessus sont CLOS : main redevient l UNIQUE ligne de l extension.
// Vérifié avant commit : rebuild depuis main fusionné diffé contre
// l arbre 0.6.9 exact servi par le CWS — delta = F1 réduit seul.
// Committé avec GIT_COMMITTER_DATE épinglée sur cette constante.
// 2026-08-27T22:20:00Z = SYNC MONO-COMPTE Vinted (décision Nico 27/08 soir) :
// le marquage des disparitions ne travaille que sur LE compte connecté dans
// Chrome, établi par la trace d'identité des runs. Référent = dernier run
// 'done' ; identité inconnue/différente ou run étranger intercalé ⇒ sync
// normale mais AUCUN marquage (motif en [note]) ; candidats bornés aux
// articles re-vus depuis le référent (last_synced_at) — les inventaires
// multi-comptes déjà empilés restent faux mais FIGÉS (décision 25/08).
// Corrige au passage la lecture des candidats : PAGINÉE (PostgREST tronquait
// à 1000 — fripe2base affichait connus=1000 PILE le 27/08, plafond de la
// garde (e) calculé sur un compte tronqué). Côté app (2.4.71, OTA) : la carte
// affiche « Dressing synchronisé : @pseudo » (rien si trace absente), bilan
// sobre au changement de compte, retrait de l'UI d'épinglage morte.
// ⚠️ HORS zip 0.6.9 : part dans le paquet SUIVANT (aucun paquet dans cette
// passe, validation de la base d'abord). EXTENSION_MIN_BUILD inchangé.
// Committé avec GIT_COMMITTER_DATE épinglée sur cette constante.
// 2026-08-28T07:55:00Z = sélection de la republication auto ASSAINIE (deux
// commits du 28/08, dont 94ce682 du matin parti SANS bump — rattrapé ici,
// même chantier) : les candidats excluent les articles SANS PHOTO
// (photos->0 nul — coquilles vides de la sync, cas Joe0410 ; le refus
// serveur article_sans_photo reste le filet) ET les vinted_status
// hidden/draft (décision Nico 28/08 : jamais présentés comme en ligne, et
// l'auto ne doit pas republier VISIBLE un article que l'utilisateur a
// masqué — mode vacances, stock saisonnier ; NULL passe, article né
// FillSell jamais relu par la sync). Le compteur « N éligibles » de
// RepublishAutoBlock (StockTab) applique les MÊMES filtres — doctrine du
// bandeau d'É6 : s'ils divergent, il ment. ⚠️ HORS zip 0.6.9 : paquet
// SUIVANT. EXTENSION_MIN_BUILD inchangé. Committé GIT_COMMITTER_DATE
// épinglée sur cette constante.
// 2026-08-28T10:10:00Z = diagnostic du mur ISBN persisté (cas « Fairy tail »
// a25d171b : gate ISBN stricte passée AVANT suppression, Vinted 400 « Merci
// d'entrer un numéro ISBN valide » à la soumission, last_diagnostic VIDE —
// impossible de trancher « champ perdu avant le POST » vs « valeur
// refusée »). La sonde réseau extrait désormais l'ISBN du CORPS du POST de
// dépôt (isbnEnvoye — extraction ciblée, jamais le corps entier) et le
// chemin « refus serveur » de fillListingForm rend un `diagnostic`
// (URL + statut + isbn envoyé + extrait de réponse + étapes tolérées) que
// replanifierOuArreterRecreation persiste dans last_diagnostic. Côté
// serveur (déployé, hors paquet) : exemption Livres 0.6.9 DÉSARMÉE par
// interrupteur coin_config republish_livres_exemption (absente = OFF),
// update-job-status v27 + handler-watch v16. ⚠️ HORS zip 0.6.9 : paquet
// SUIVANT. EXTENSION_MIN_BUILD inchangé. Committé GIT_COMMITTER_DATE
// épinglée sur cette constante.
// 2026-08-28T10:35:00Z = attente SUR LE RETOUR du lookup livre après la pose
// ISBN (GO Nico — piste « valeur refusée » écartée : 9782811600174 = Fairy
// Tail t.5, Pika 2009, référencé partout ⇒ course avec le lookup). Le
// sleep(1200) fixe est remplacé : poll d'une PREUVE de retour (champ
// Auteur/Titre auto-rempli, conventions du dépôt en best-effort), plafond
// 8 s valant repli ≥ plancher 3 s demandé. Uniquement dans l'étape ISBN —
// les catégories sans ISBN ne paient rien. Le diagnostic isbnEnvoye/
// last_diagnostic (même jour) tranchera au premier cas réel. ⚠️ HORS zip
// 0.6.9 : paquet SUIVANT. EXTENSION_MIN_BUILD inchangé. Committé
// GIT_COMMITTER_DATE épinglée sur cette constante.
// 2026-08-28T12:05:00Z = sélecteurs du lookup livre RELEVÉS EN LIVE (session
// réelle, /items/new catalog 5425, 3 ISBN — dont 9782811600174 : le lookup
// le CONNAÎT, « Fairy Tail T05 » / « HIRO MASHIMA », la piste « valeur
// inconnue de leur base » est morte). Les champs preuve N'EXISTENT PAS avant
// le lookup et apparaissent auto-remplis : #author et #book_title SANS
// data-testid, #language_book (testid isbn-language_book-single-list_
// search-input). Déclencheur = frappe du 13e chiffre, pas le blur. Endpoint
// réseau INVISIBLE aux fetch/XHR de la page (service worker Vinted
// probable) → preuve DOM = seul observable, les 3 conventions best-effort
// du commit précédent sont remplacées par les sélecteurs prouvés. ⚠️ HORS
// zip 0.6.9 : paquet SUIVANT. EXTENSION_MIN_BUILD inchangé. Committé
// GIT_COMMITTER_DATE épinglée sur cette constante.
// 2026-08-28T16:22:21Z = b58bd09 (appariement de taille NUMÉRIQUE ANCRÉ +
// message needs_user taille honnête — cardigan Laurence). ⚠️ Ce commit a
// touché chrome-extension/ SANS bumper cette constante : `npm run build`
// local échouait sur la garde ci-dessous (même rattrapage que 3db8465 le
// 12/08). Valeur = horodatage UTC exact du commit. ⚠️ HORS zip 0.6.9 :
// paquet SUIVANT. EXTENSION_MIN_BUILD inchangé.
// 2026-08-28T19:22:00Z = bump manifest 0.6.9 → 0.6.10 (la 0.6.9 est PUBLIÉE
// par le CWS le 27/08, cf. ALREADY_PUBLISHED : la version est brûlée). La
// 0.6.10 est le PREMIER paquet CWS construit sur MAIN depuis le merge de
// réconciliation a9388e0 du 27/08. Elle embarque tout ce qui dormait « paquet
// SUIVANT » : taille numérique ancrée (b58bd09), attente sur le RETOUR du
// lookup ISBN au lieu du sleep fixe (c7e3f82 + d31f1b9), sonde isbnEnvoye +
// diagRefus persisté (5e89af5), trace d'identité + sync mono-compte
// (ddda643), comblement prix_vente (68291c9), filtres de sélection auto
// sans-photo (94ce682) + hidden/draft (9f1e665), textes urlToFile (133a874),
// pagination des ids connus de la sync (fix troncature 1000, lot 0b).
// Committé GIT_COMMITTER_DATE épinglée sur cette constante (ni futur, ni
// antérieur). EXTENSION_MIN_BUILD inchangé — la promotion n'a lieu qu'après
// acceptation CWS, en lisant le BUILD_ID dans le zip publié.
// 2026-08-29T13:25:00Z = lot anti-restriction Vinted (campagne du 21/07) :
// /listing-restriction motif dédié + reprise différée 5/15/30/60 (4ad4e38),
// relevé lecture seule du message Vinted (c814cf3), cadence irrégulière
// 1-3 min + coupe-circuit 30 min + plafond quotidien d'exécution
// (coin_config.republish_plafond_jour, défaut 100, jour Paris). ⚠️ HORS zip
// 0.6.10 (déjà construit) : paquet SUIVANT. EXTENSION_MIN_BUILD inchangé.
// Committé GIT_COMMITTER_DATE épinglée sur cette constante.
// 2026-08-29T13:40:00Z = catégorie Vinted : fin du « niveau introuvable » sec —
// repli needs_user à CHOIX (liste réelle du panneau, modèle garde Taille),
// détection interface non française, panneau vide = transitoire, renommage
// racine avéré (Divertissement → Livres et médias) pour les chemins figés.
// ⚠️ HORS zip 0.6.10 : paquet SUIVANT. EXTENSION_MIN_BUILD inchangé.
// Committé GIT_COMMITTER_DATE épinglée sur cette constante.
// 2026-08-30T18:45:00Z = périmètre 0.6.11 ARRÊTÉ (décision Nico 30/08) :
// correctifs de bugs constatés SEULEMENT, aucun nouveau mécanisme dans le
// chemin de republication. Le paquet contient donc 0.6.10 + 4ad4e38
// (/listing-restriction = pause + reprise différée 5/15/30/60) + c814cf3
// (relevé lecture seule du message Vinted) + f49e5b3 (« niveau introuvable »
// → choix utilisateur). RETIRÉS du code extension, jamais partis dans aucun
// zip : la cadence irrégulière + coupe-circuit + plafond embarqué (7cbde00 —
// l'entrée 13:25 ci-dessus les annonçait « paquet SUIVANT », c'est caduc) et
// le capteur de catégorie retenue (f995f0a, qui n'avait pas bumpé cette
// constante). Le plafond quotidien reste appliqué CÔTÉ SERVEUR
// (get-pending-jobs v18/v19, coin_config.republish_plafond_jour = 45 en
// base) : rien ne change pour le parc sur ce point. EXTENSION_MIN_BUILD
// inchangé. Committé GIT_COMMITTER_DATE épinglée sur cette constante.
// 2026-08-30T20:31:00Z = 4e correctif de la 0.6.11 (zip 0aaeb2e jamais
// téléversé — refait) : pose ISBN à la recréation. 12 refus nadegemarcelin78
// (28-30/08, 0.6.10) en 400 « Merci d'entrer un numéro ISBN valide », motif
// isbn « forme non reconnue » dans le POST — la forme acceptée
// ({"code":"isbn","ids":["…"]}, relevé live 24/08) n'est produite par la page
// QUE si son lookup livre a rattaché l'ouvrage, et le déclencheur observé est
// la FRAPPE du 13e chiffre quand la pose en un coup n'émet qu'un événement.
// Correctif : lookup non vu en 8 s → re-pose par FRAPPE (typeHuman) puis
// nouvelle attente ; trace de pose (méthode + lookup vu/non vu) TOUJOURS
// consignée dans last_diagnostic ; la sonde isbnEnvoye rend un extrait borné
// du motif au lieu du verdict opaque. Détection ISBN, gates de relecture et
// soumission « quand même » à l'étape deleted : inchangées.
// EXTENSION_MIN_BUILD inchangé. Committé GIT_COMMITTER_DATE épinglée dessus.
// 2026-08-31T10:30:00Z = 5e correctif de la 0.6.11 (zip 6b37e94 jamais
// téléversé — refait) : reprise RÉELLE des échecs récupérables + cause vraie
// dans le message (2 défauts constatés le 31/08 en prod). (1) rearmBounded
// passait un job en failed après 2 essais collés (~2 min, le poll) avec un
// message promettant « le job repartira au prochain passage » — faux : jobs
// 842b0a22 (DataDome LBC résolu par l'utilisatrice, job resté mort) et
// fa69b1bd/0e2c5f8e (eBay), tous débloqués À LA MAIN. Désormais reprise
// espacée 5/15/30/60 min via platform_fields.next_action_after (mécanique
// éprouvée de la republication, porte ajoutée dans processJob pour
// publish/delete — republish EXCLU, sa porte existe), 5 essais bornés, puis
// failed HONNÊTE sans promesse (cause en tête, < 300 c. pour survivre au
// filtre d'humanizeJobError). Pépite : pending ne passe jamais par failed →
// réservation tenue, aucun re-débit ; rendue une fois au failed final.
// (2) causeHumaineConnue : last_diagnostic à motif nommé (prevol_stepup_vente,
// fraîcheur 6 h) mène le message utilisateur sur les chemins transitoire et
// failed sec — le brut Chrome part en platform_fields.derniere_interruption
// (transitoire) ou reste entre parenthèses (failed sec : la requalification
// serveur « back/forward cache » d'update-job-status matche sur error).
// Chemin de publication INTACT ; correctifs 0.6.11 intacts (listing-
// restriction, relevé Vinted, niveau catégorie, pose ISBN).
// EXTENSION_MIN_BUILD inchangé. Committé GIT_COMMITTER_DATE épinglée dessus.
// 2026-08-31T10:57:00Z = bump manifest 0.6.11 → 0.6.12, AUCUNE ligne de code
// (le CWS a accepté et publié la 0.6.11-6b37e94 le 31/08 vers 09:07 — 18
// extensions du parc dessus, handler_build en base — pendant que le zip
// 0.6.11-dd85a95 du 5e correctif attendait le téléversement : même numéro,
// rejet garanti). La 0.6.12 = contenu dd85a95 tel quel, les 5 correctifs
// intacts (pause /listing-restriction + reprise différée, relevé lecture
// seule du message Vinted, « niveau introuvable » → choix, pose ISBN durcie,
// reprise réelle espacée + cause remontée), rien de reverté réintroduit.
// '0.6.11' ajoutée à ALREADY_PUBLISHED du même geste. EXTENSION_MIN_BUILD
// inchangé — la promotion vers le build 0.6.11 publié (2026-08-30T20:31:09Z,
// lu dans handler_build du parc) reste un geste séparé, sur GO.
// Committé GIT_COMMITTER_DATE épinglée dessus.
// 2026-08-31T11:18:00Z = 0.6.13 : chantier « Prix de départ » eBay (job
// de15fd3f raffalepic, 31/08 12:54 — 2e cas da2b67e2 le même jour, 0 autre
// warning « format: » en 30 j). CAUSE ÉTABLIE par le relevé du job : la
// bascule Enchères → Achat immédiat exige l'hydratation Marko (morte en
// fenêtre jamais rendue, famille B) — « option pas apparue », brouillon
// resté ENCHÈRES côté serveur, prix posé au DOM jamais parvenu au brouillon,
// 3 clics avalés, et le repli ebayDirectPublish a soumis une enchère sans
// prix de départ → refus. Trois pièces, chemin de dépôt eBay SEUL :
//   1. ebay.js : garde pré-clic FORMAT — preuve POSITIVE « le listbox lit
//      Enchères » ⇒ mise en vente NON tentée (needsUser → reprise espacée),
//      jamais de soumission en mode enchère ; listbox introuvable = warning
//      d'avant, jamais un blocage sur une absence de lecture ;
//   2. background : refus du brouillon avec « Prix de départ » manquant ⇒
//      message vrai (corriger le FORMAT avant tout geste manuel — l'ancien
//      texte faisait créer une enchère) + last_diagnostic structuré
//      ebay_brouillon_encheres, ajouté à CAUSES_HUMAINES_CONNUES ;
//   3. background : anti-doublon pré-dépôt — job porteur d'ebay_draft_id ⇒
//      titre cherché dans les annonces ACTIVES avant tout formulaire
//      (requireTitle) ; trouvé = published avec l'URL, aucun re-dépôt.
// PAS de pose du prix/format par le PUT delta du brouillon : seul le champ
// `description` est MESURÉ (24/08) — on n'invente pas de structure API.
// EXTENSION_MIN_BUILD inchangé. Committé GIT_COMMITTER_DATE épinglée dessus.
// 2026-08-31T11:31:00Z = CORRECTION de la cause de l'entrée 11:18 (Nico,
// données du parc) : la piste « hydratation Marko morte en fenêtre
// minimisée » est RÉFUTÉE — les 20 derniers jobs eBay, RÉUSSITES comprises,
// tournent tous en window_state=minimized ; et dans le run de raffalepic les
// specifics ont bien répondu (saisies validées par Entrée). Cause retenue,
// appuyée par les relevés : (1) raffalepic est le SEUL compte du parc à
// n'avoir JAMAIS publié sur eBay — eBay mémorise le dernier format PAR
// COMPTE, le parc arrive donc en « Achat immédiat » (bascule jamais
// exercée, succès silencieux) quand son compte arrive en « Enchères » ;
// (2) la détection de l'option filtrait sur offsetParent, en VIOLATION de
// la règle de tête d'ebay.js (13/07, mesurée : offsetParent ne mesure pas
// la visibilité dans la fenêtre jamais rendue, et il est null PAR SPEC pour
// un overlay position:fixed) — l'option pouvait être là, cliquable,
// invisible au code. Catégorie exclue (misscat801 a publié en 53557, la
// catégorie du job échoué). Correctif : ensureAchatImmediat réécrit —
// détection par style CALCULÉ (estVisibleSansLayout), vérification POSITIVE
// post-clic (le bouton se relit « Achat immédiat »), un 2e essai complet,
// et trace structurée ebay_format_trace persistée sur TOUTES les issues
// (réussites comprises) pour trancher au prochain run si la cause résiste.
// La garde pré-clic FORMAT et l'anti-doublon de l'entrée 11:18 restent tels
// quels ; messages/commentaires purgés de la mention famille B. Toujours
// 0.6.13 (zip bddcabd jamais téléversé — refait).
// EXTENSION_MIN_BUILD inchangé. Committé GIT_COMMITTER_DATE épinglée dessus.
// 2026-08-31T16:48:15Z = 58c091f (0.6.14, main) — DEUX correctifs mesurés du
// 31/08, plus ceux de 5f224f1 le même jour :
//   · ISBN : le mur « Merci d'entrer un numéro ISBN valide » est tranché. Le
//     diagnostic du job a25d171b dit que la frappe ABOUTIT (« pose en un coup
//     commitée ; lookup livre vu en 1575 ms, Auteur/Titre auto-remplis ») et
//     le corps du POST porte quand même "isbn":null — la valeur est perdue
//     entre le commit de la frappe et la sérialisation du payload. La sonde
//     MAIN pose donc `isbn` dans le corps de POST /item_upload/items, à
//     l'endroit MESURÉ (l'objet qui porte catalog_id), sans toucher aucune
//     autre clé et seulement si la page l'a laissé vide. Armé avant l'attente
//     du lookup (couvre les livres sans lookup) et dans l'étape commune aux
//     deux chemins de recréation — donc aussi les 26 annonces supprimées non
//     recréées. ⛔ Chemin réservé à l'ISBN : le format eBay n'a jamais été
//     mesuré, il ne se pose pas par la requête.
//   · Cycle auto : 'needs_user' retiré de la garde « republication en vol »,
//     qui gelait le cycle ENTIER du compte (josephinecerni, 0 cycle après
//     16:03 malgré extension en ligne et plafond 0/15). pending/processing
//     gardent la garde ; l'article en attente reste exclu par le pré-filtre
//     PAR ARTICLE, 'failed' avec 24 h de délai.
//   · 5f224f1 : compteur d'essais par article (3, borné 24 h) + écart de file,
//     re-hébergement photo retiré du pré-vol auto, causes écrites dans
//     platform_settings…republish_auto.derniere_erreur (affichées par
//     StockTab). La migration serveur du même commit (garde de version
//     comparée en TEXTE, '0.6.11' < '0.6.2') a été JOUÉE le 31/08 à 17:26 —
//     republications reparties (josephinecerni 18:44/18:50, remialbertholl 47
//     à 17:49, zéro refus).
// EXTENSION_MIN_BUILD inchangé : il se lit dans le PAQUET PUBLIÉ, et la
// promotion vers le build 0.6.11 (2026-08-30T20:31:09Z) reste EN ATTENTE DE GO.
// 2026-08-31T17:35:53Z = f52178e (0.6.14) : ISBN JAMAIS LU sur le chemin
// PUBLICATION — second bug, distinct du mur de republication. L'étape ISBN se
// garde sur fields.isbn, alimenté par la seule capture de republication ;
// l'app, elle, écrit dans vintedAspects.isbn, donc l'étape ne tournait PAS et
// rien n'était posé ni armé (mesuré : job du 31/08 19:23, HTTP 400 field
// "isbn", diagnostic sans « pose ISBN »). `isbn` ajouté au pont
// vintedAspects → champ dédié ET à handledCodes (#isbn est une saisie libre,
// la boucle générique le reposait en liste fermée).
// 2026-08-31T17:39:46Z = 3bac54e (0.6.14) : message needs_user Beebs sur le
// champ « Âge ». Premier cas du parc — un essai sur la nutrition pour adultes
// rangé dans « Jeux, jouets et loisirs > Livres > Autres livres », où Beebs
// exige une tranche d'âge d'ENFANT. « Compléter dans l'app » faisait tourner
// en rond : le message nomme désormais le champ, les valeurs réellement
// proposées, et la sortie (décocher Beebs pour cet article).
// ⛔ AUCUN retrait automatique de plateforme — arbitrage produit, pas handler.
// EXTENSION_MIN_BUILD inchangé (il se lit dans le paquet PUBLIÉ ; promotion
// vers le build 0.6.11 = 2026-08-30T20:31:09Z toujours EN ATTENTE DE GO).
// 2026-09-01T16:58:39Z = RATTRAPAGE (comme 3db8465/58f8c54 le 12/08) : les
// deux commits 0.6.15 du 01/09 (74ce865 « canal coupe eBay, 5 lots
// indépendants » à 16:47:59Z et 43ee753 « le prix part systématiquement » à
// 16:58:39Z) ont touché chrome-extension/ SANS bumper cette constante —
// `npm run build` local échouait sur la garde ci-dessous, bloquant le
// déploiement Capgo du lot onboarding (2.4.88→2.4.94), du JS app pur qui ne
// dépend en rien de ces commits extension. Recalage de garde SEUL :
// EXTENSION_MIN_BUILD ne bouge pas (aucun effet bannière, aucun effet parc),
// aucun paquet extension n'est produit ici.
// 2026-09-02T15:11:22Z = 9d912a9 : nettoyage Pépites dans background.js —
// 4 chaînes utilisateur (« Ta Pépite reste réservée… », « la Pépite est
// rendue ») réécrites en « rien décompté » (fusion quotas du 02/09 soir).
// Texte seul, aucun changement de comportement. Recalage de garde SEUL :
// EXTENSION_MIN_BUILD ne bouge pas, aucun paquet produit ici — ces chaînes
// partiront dans le prochain zip CWS.
// 2026-09-02T18:27:16Z : trois filets du soir (commit épinglé
// GIT_COMMITTER_DATE sur cette constante — garde : ni futur, ni antérieur) :
//   1. urlToFile (4 content scripts) : retentative 2× (2,5 s / 5 s) sur
//      404/410 avec clé de cache neuve (?r=) — le CDN Supabase avait servi
//      un 404 MIS EN CACHE sur des photos présentes (incident Delavier,
//      3 plateformes refusées) ; côté app la parade immédiate est le ?v=<ts>
//      posé à l'upload (OTA), ce filet couvre le résidu ;
//   2. leboncoin.js : observatoire des VALEURS — les options des menus
//      OUVERTS par fillCriterionSafe (aucun geste ajouté) partent au
//      catalogue via enumerated/persistDiscoveredAspects : une catégorie
//      publiée une fois remplit ses allowed_values pour les suivantes ;
//   3. background.js persistDiscoveredAspects : les lignes SANS options
//      partent dans un lot séparé où allowed_values est OMISE —
//      merge-duplicates n'écrase plus une liste apprise par un null.
// EXTENSION_MIN_BUILD ne bouge pas, aucun paquet produit ici — tout part
// dans le prochain zip CWS (avec la 0.6.15 en attente).
// 2026-09-02T21:01:13Z (0.6.16, commit épinglé sur cette constante) : cas
// Joséphine (costume homme 40/48) — openPanelOptions prolonge l'attente au
// budget nominal quand la liste derrière une barre de recherche n'est pas
// rendue à 2,5 s : le relevé partait VIDE (rien au catalogue ni au
// mini-éditeur) et la frappe filtrait un panneau encore vide (« panneau
// d'options resté vide »). Manifest bumpé 0.6.15 → 0.6.16 : un zip 0.6.15
// (BUILD_ID 2026-09-02T20:43:08Z+adc7a6d) a été LIVRÉ à Nico ce soir —
// jamais deux zips de même version au contenu différent (leçon du 15/08).
// Le zip 0.6.15 livré est PÉRIMÉ, ne pas le téléverser.
// 2026-09-03T07:05:00Z (0.6.17, commit épinglé sur cette constante) : pré-vol
// de republication HONNÊTE (cas Joséphine, job df496c00 — catalog_id 1730
// « Figurines et accessoires » devenu niveau intermédiaire : le message
// affirmait « l'annonce d'origine ne porte pas cette information » alors que
// le snapshot portait le chemin complet, et la consigne « renseigne depuis la
// carte de l'article » était INOPÉRANTE — le pré-vol ne lit pas
// inventaire.vinted_catalog_id). Désormais : needsUserField PERSISTÉ (choix
// fermé dans l'app), message = celui du content script + valeur capturée
// affichée, categoryLevelChoice propagé par construireJobRecreation jusqu'à
// selectCategory. Aussi : dernières chaînes Pépites/« décompté » retirées des
// messages (fusion quotas). La garde « pause AVANT suppression » est INTACTE.
// Manifest bumpé 0.6.16 → 0.6.17 : un zip 0.6.16 existe déjà (02/09 23:01) —
// jamais deux zips de même version au contenu différent (leçon du 15/08).
// 2026-09-03T08:20:37Z = 89771d8 : purge des commentaires « Pépite » dans
// background.js et vinted.js (mot → « unité », identifiants techniques
// intacts). COMMENTAIRES SEULS, zéro comportement. Le zip 0.6.17 du matin est
// ÉCARTÉ (renommé PERIME dans anciens-zips) : le prochain paquet 0.6.17 sera
// refait UNE fois, avec la sync multi-comptes Vinted — ne rien téléverser
// d'ici là (la 0.6.15 est encore en review CWS).
// 2026-09-03T12:15:00Z (0.6.17, commit épinglé sur cette constante) : SYNC
// MULTI-BOUTIQUES (GO Nico 03/09, incident Nadège) — garde d'identité avant
// tout import (liste v2 de vinted_sync_pin : confirmée → sync ; liste vide →
// adoption 'premiere_sync' ; a_confirmer/inconnue → run failed
// [boutique_a_confirmer], décision dans l'app), estampillage
// inventaire.vinted_account_id à l'observation, cloisonnement des
// republications (boutique de l'annonce ≠ boutique connectée → needs_user
// AVANT capture), et FIN DE LA BASCULE SILENCIEUSE de compte FillSell
// (LAST_USER/PENDING_SWITCH : une session relayée d'un autre utilisateur
// n'est JAMAIS utilisée sans clic dans le popup). Le zip 0.6.17 sera produit
// UNE fois, avec ce lot + le pré-vol + le chantier « plus aucun échec ».
// 2026-09-03T12:25:00Z (0.6.17, commit épinglé) : chantier « plus aucun échec
// visible » (analyse 30 j de cross_post_jobs) — session Vinted refusée sur
// republication = needs_user doux + REPRISE AUTO quand la sonde revoit Vinted
// vivant (115 jobs/9 comptes en failed rouge sur 30 j) ; catégorie « sans
// sous-niveaux attendus » = repli à choix (fin du failed sec) ; contradiction
// LBC sur h1 VIDE = transitoire, plus jamais une contradiction ; titres
// tout-en-majuscules normalisés avant dépôt (refus serveur connu d'avance) ;
// « Failed to fetch » rejoint les transitoires (reprise espacée).
// 2026-09-03T12:51:06Z (0.6.17, commit épinglé) : chantier « les dépôts LBC/
// eBay/Beebs doivent passer » — optionLabel Beebs réparé (Beebs a remplacé
// l'id de checkbox par un identifiant opaque et vidé le 1er span : relevé
// LIVE du 03/09, le libellé vit dans le 1er div ; c'est ce qui cassait le
// Format du colis ET polluait les listes du mini-éditeur) ; taille US jean
// 24-34 convertie en grille FR « X / NN » (match ancré, jamais silencieux) et
// panneau filtré à vide relu en liste complète ; la réponse du mini-éditeur
// PRIME sur le mapping colis (needsUserResolved.format_colis verbatim) ;
// brouillon LBC : clic sur le bouton officiel « Recommencer » (le brouillon
// est restauré côté serveur, la purge du storage ne l'atteint plus) puis
// dépôt poursuivi dans le même onglet, relevé des boutons visibles en annexe
// quand il manque ; pré-vol eBay étendu à /fpa/upgrade (mise à niveau du
// compte vendeur dite AVANT toute tentative).
// 2026-09-03T14:42:15Z (0.6.17, commit épinglé) : brouillon LBC PROUVÉ LIVE
// (test autorisé sur le compte de Nico, 03/09 après-midi) — l'état interrompu
// est restauré côté serveur, AUCUN bouton « Recommencer » n'existe (relevé
// complet), le seul chemin est « Quitter » → « Quitter sans enregistrer »
// (vérifié : wizard vierge ensuite ; un brouillon « Enregistré », lui, ne
// bloque pas). Le correctif précédent (recherche d'un « Recommencer ») est
// REMPLACÉ par ce chemin : draftDiscarded → job pending court → redépôt au
// passage suivant. Et repli d'appelant sur le Format du colis Beebs : une
// valeur tranchée irrécupérable (id opaque d'une liste polluée — jobs
// RoCotCot 17212f1b/b94dee56) retombe sur le mapping au lieu d'un champ vide.
// 2026-09-03T15:05:35Z (0.6.17, commit épinglé) : MULTI-BOUTIQUES COMPLET
// (STOP Nico sur le trou de conception, puis correction « on ne bloque pas,
// on met en attente ») — la sonde de sessions relève la BOUTIQUE connectée
// (extension_sessions.vinted_identite) ; une republication dont l'article vit
// sur une autre boutique reste PENDING avec attente_boutique {user_id, login,
// depuis} + échéance 15 min : zéro tentative consommée, zéro needs_user, zéro
// échec — et la sonde LIBÈRE les attentes dès que leur boutique est vue
// connectée (l'utilisateur n'a rien à relancer). L'app affiche l'attente
// nommée (« En attente de connexion au dressing @x »), les compteurs par
// boutique, la boutique connectée en permanence, le chip d'origine par
// article, et l'annonce de masse « X partent · Y attendront @Z ». Migration
// de rattrapage 20260903160000 ÉCRITE, PAS APPLIQUÉE (GO Nico requis).
export const EXTENSION_LAST_COMMIT = '2026-09-03T15:05:35Z';
// 2026-08-09T08:40:00Z = 0.5.4 : fin des faux « plus en ligne » Vinted
// (cancelPublishAfterDelete clôt publish + republish de l'ancienne annonce ;
// poll : ré-appariement listing_url vs inventaire.vinted_item_id avant tout
// drapeau — divergence → job clos superseded_listing — et double lecture 404
// via unavailable_pending_since) ; propagation sync→jobs des ventes Vinted
// RÉTABLIE sur publish ET republish (l'affichage app des bandeaux republish
// rouvrira par un commit séparé, sur GO, après acceptation de la 0.5.4).
// 2026-08-09T12:13:15Z = build de la 0.5.5 (= EXTENSION_LAST_COMMIT), PUBLIÉE
// et acceptée par le Chrome Web Store le 09/08.
// ⚠️ CETTE PROMOTION RATTRAPE DEUX OUBLIS : ni la 0.5.3 ni la 0.5.4 n'ont
// jamais été recopiées ici, donc le parc n'a JAMAIS été prévenu depuis la
// 0.5.0 — et les installs 0.5.3/0.5.4 portent le bug qui supprimait une
// annonce Vinted sans la recréer (mauvais endpoint d'upload, cf. ba5e90e).
// La séquence est celle du bandeau plus haut : elle n'est faite qu'APRÈS
// acceptation CWS, jamais avant (sinon on réclame une version que personne ne
// peut installer — le bug du 29/07). Chrome propage en quelques heures ; le
// bandeau donne la marche à suivre pour forcer tout de suite.
// 2026-08-09T14:16:20Z = BUILD_ID du paquet 0.5.6, VÉRIFIÉ EN LIGNE au Chrome
// Web Store (endpoint CRX clients2.google.com/service/update2/crx :
// version="0.5.6") et RELU DANS LE ZIP publié — '2026-08-09T14:16:20Z+349d45a',
// identique dans les 5 fichiers de build/fillsell-extension-0.5.6-cws.zip.
// Ce n'est PAS EXTENSION_LAST_COMMIT (14:53:38Z, commit README) : cf. le
// bandeau ⚠️ plus haut, l'écart de 37 min aurait flaggé tout le parc à tort.
// Ce que cette promotion débloque : la 0.5.6 corrige la suppression d'annonce
// Vinted sans recréation (panneau catégorie déjà ouvert que la sonde niait,
// 7ca4440) — au moment du bump, 12 des 13 installs du parc étaient SOUS ce
// build, et le bug avait encore frappé le 09/08 (2 comptes, needs_user).
// Ancienne valeur : 2026-08-09T12:13:15Z (0.5.5, servie le 09/08).
// 2026-08-26T19:48:07Z = BUILD_ID du paquet 0.6.9 (branche ext-0.6.5-sans-f1,
// commit 7a88eb6), PUBLIÉ par le Chrome Web Store le 27/08 vers midi et RELU
// DANS LE ZIP build/fillsell-extension-0.6.9-cws.zip le jour de la promotion
// ('2026-08-26T19:48:07Z+7a88eb6' dans background.js). Seul le PRÉFIXE ISO est
// stocké ici : App.jsx fait Date.parse() dessus, un '+hash' rendrait le seuil
// NaN et la bannière muette. Même seuil que l'exemption de la garde Livres
// serveur (update-job-status, 1e9a3d3 : handler_build ≥ ce build = exempt).
// Ce que cette promotion débloque : la 0.6.9 répare la panne TOTALE de
// publication Vinted du 26/08 (picker passé role=button → role=radio) — au
// moment du bump, ~120 comptes vus sous 30 jours étaient SOUS ce build.
// La bannière INFORME seulement : aucun chemin (publication, republication,
// sync) ne lit extensionOutdated pour refuser du travail — vérifié sur pièces
// le 27/08 (App.jsx : bandeau + dismiss ; StockTab : deux messages d'état).
// Ancienne valeur : 2026-08-09T14:16:20Z (0.5.6) — les promotions 0.6.x
// intermédiaires n'ont jamais été faites, le parc n'était plus prévenu.
export const EXTENSION_MIN_BUILD = '2026-08-26T19:48:07Z';

// Garde-fou : échoue bruyamment si un commit touchant chrome-extension/ est
// postérieur à EXTENSION_LAST_COMMIT (constante pas bumpée → le paquet publié
// pourrait ne pas contenir le dernier code, et le jour de la promotion vers
// EXTENSION_MIN_BUILD la bannière ne flaggerait jamais les extensions
// antérieures à ce commit).
// Vérifie AUSSI l'invariant MIN_BUILD <= LAST_COMMIT : une bannière ne doit
// jamais exiger un build postérieur au dernier code committé, faute de quoi
// elle réclame une version que personne ne peut installer — le bug du 29/07.
// Skippé quand git est absent ou le clone superficiel (Vercel : le commit
// frontière d'un shallow clone « introduit » tous les fichiers et produirait
// un faux échec) — la validation fait foi au build LOCAL avant push.
export function assertExtensionMinBuildCurrent(cwd = process.cwd()) {
  const lastCommit = Date.parse(EXTENSION_LAST_COMMIT);
  const min = Date.parse(EXTENSION_MIN_BUILD);
  if (Number.isFinite(lastCommit) && Number.isFinite(min) && min > lastCommit) {
    throw new Error(
      `EXTENSION_MIN_BUILD (${EXTENSION_MIN_BUILD}) est POSTÉRIEUR à ` +
      `EXTENSION_LAST_COMMIT (${EXTENSION_LAST_COMMIT}) : la bannière ` +
      `« extension obsolète » exigerait un build qui n'existe dans aucun ` +
      `commit, donc dans aucun paquet installable. Corriger scripts/build-id.mjs.`
    );
  }
  let lastIso;
  try {
    const shallow = execSync('git rev-parse --is-shallow-repository', { cwd }).toString().trim();
    if (shallow === 'true') return;
    lastIso = execSync('git log -1 --format=%cI -- chrome-extension/', { cwd }).toString().trim();
  } catch {
    return; // pas de git (Vercel) : les constantes committées font foi
  }
  const last = Date.parse(lastIso);
  if (Number.isFinite(last) && Number.isFinite(lastCommit) && last > lastCommit) {
    throw new Error(
      `EXTENSION_LAST_COMMIT (${EXTENSION_LAST_COMMIT}) est antérieur au dernier ` +
      `commit touchant chrome-extension/ (${lastIso}). Bumper la constante dans ` +
      `scripts/build-id.mjs — sinon le paquet publié peut ne pas contenir ce ` +
      `commit, et la bannière ne flaggera jamais les extensions antérieures.`
    );
  }
}

export function computeBuildId(cwd = process.cwd()) {
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  let git = 'nogit';
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd }).toString().trim();
    const dirty = execSync('git status --porcelain', { cwd }).toString().trim() ? '-dirty' : '';
    git = hash + dirty;
  } catch {
    // Pas de binaire git (ou pas un repo) : sur Vercel le SHA du commit est
    // fourni en variable d'environnement — on le prend en repli, sinon
    // l'horodatage seul suffit (le préfixe ISO reste comparable).
    const sha = process.env.VERCEL_GIT_COMMIT_SHA;
    if (sha) git = sha.slice(0, 7);
  }
  return `${ts}+${git}`;
}
