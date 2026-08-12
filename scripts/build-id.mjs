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
export const EXTENSION_LAST_COMMIT = '2026-08-12T21:53:39Z';
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
export const EXTENSION_MIN_BUILD = '2026-08-09T14:16:20Z';

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
