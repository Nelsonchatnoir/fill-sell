# Inventaire — ce que l'extension FillSell montre (état de job, attente, temps)

Périmètre : `chrome-extension/` au commit 90997b5 (manifest 0.6.114), lecture seule.

**Légende des catégories**
- **état** : état d'un job ou d'une plateforme.
- **attente** : attente ou progression.
- **temps** : heure, durée ou délai annoncé.

**Abréviations**
- `bg` = background.js.
- « base→app » = champ écrit en base et lu par l'app.

**Variables dans les textes**
- `{Chrome}` = `VO.navigateurCourt()` : « Chrome », « Edge », « Brave », « Opera » ou « ton navigateur ».
- `{label}` = nom de la plateforme.
- `{vinted.fr}` = `VO.domaineVintedAffiche()`.
- « + suffixe » = `rearmBounded` ajoute « Reprise automatique dans ~{5|15|30|60} min (tentative {a}/5). »

## 0. Canaux qui n'existent pas
- **Pas de notification.** Aucun appel `chrome.notifications`, et la permission `notifications` est absente du manifest.
- **Pas de badge.** Aucun `setBadgeText` ni `setBadgeBackgroundColor`.
- **Pas de titre ni d'icône dynamiques.** Aucun `action.setTitle` ni `setIcon` ; le titre est fixe : « FillSell » (manifest.json:55). Le seul appel `chrome.action.*` est `openPopup()` (bg:11358), utilisé pour « Autoriser Opla/Depop ».
- **Aucun texte injecté dans les pages des plateformes.** `ebay.js:2158 innerHTML` pose la description de l'annonce ; `beebs.js:3953/4083` injecte des scripts techniques.
- **Aucun** `alert`, `confirm` ni `document.title`.
- L'onglet de connexion « Me connecter » s'ouvre au premier plan, sans texte (bg:11390-11394).

## 1. Popup (popup.html / popup.js)
| fichier:ligne | où | texte exact / règle | catégorie | statut technique |
|---|---|---|---|---|
| popup.html:408 | pastille compte (avant rendu) | « Se connecter » | état | — |
| popup.js:830 | pastille | « Se connecter » (classe off) | état | pas de session FillSell |
| popup.js:836 | pastille | « Active » | état | session, dernier poll < 60 min, aucune plateforme ko |
| popup.js:837 | pastille | « Ralentie » | état | ≥ 1 plateforme `ko`, `bloquee` ou `autoriser` |
| popup.js:838 | pastille | « Connectée » | état | session mais `fillsell_last_poll` absent |
| popup.js:839 | pastille | « En veille » | état/attente | dernier poll > 60 min (`extensionFroide`, l.801) |
| popup.js:1587-1588 | pastille | « Se déconnecter ? » (4 s) | état | 1er clic |
| popup.js:852-856 | bandeau alerte | « Mets FillSell à jour : ferme {Chrome} complètement puis rouvre-le — ta file reprendra toute seule. » | état/attente | `fillsell_maj_requise` (bg:2963-2967) |
| popup.js:857-863 | bandeau alerte | « {n} plateforme a besoin de toi » / « {n} plateformes ont besoin de toi », + « · les autres continuent » si ≥ 1 ok | état | `plateformesKo()` |
| popup.js:867-878 | ligne de vie | « Dernier passage {ilYA} · prochain **{dansCombien}** » ; au-delà de 60 min : « En veille · dernier passage {ilYA} » ; masquée si aucun poll | temps | `fillsell_last_poll` (bg:2897) + `chrome.alarms` fillsell-poll-jobs |
| popup.js:884-890 | ligne éveil | « FillSell garde ton ordinateur éveillé pendant la publication » | attente | `fillsell_keep_awake.maj` < 5 min |
| popup.js:900-907 | carte bascule | « Changer de compte FillSell ? » / « fillsell.app est connecté avec {email}, mais cette extension est rattachée à un autre compte (actuellement : {email}). Rien n'a été changé sans toi. » / « Basculer l'extension » · « Rester » | état | PENDING_SWITCH |
| popup.js:912, 917-921 | bouton bascule | « Bascule… » → « Rouvre fillsell.app connecté, puis reviens ici » / « Impossible — réessaie » | attente/état | réponse CONFIRM_ACCOUNT_SWITCH |
| popup.js:1022-1027 (+688-691, 751, 756, 1020-1021) | ligne plateforme | « Connectée » + sous-ligne : « Compte eBay relié à FillSell » / « Annonces relevées {depuis} » / « Dépôt réussi {depuis} » / « {Chrome} connecté à @{login} » ; sinon « Vérifié {depuis} » si l'âge dépasse 10 min | état+temps | vérité serveur `connectee`, sonde true fraîche, ou dépôt < 72 h |
| popup.js:1037-1042 (+695, 724, 728, 761) | ligne plateforme | « Connecte-toi à {X} sur cet ordinateur » ou « Session fermée » + « Ouvrir {host} » + « Je ne vends pas sur {X} » | état | `ko` |
| popup.js:1028-1036 | ligne eBay | « Relie ton compte eBay dans l'appli — c'est le chemin recommandé » + « ou connecte-toi sur ebay.fr → » + « Ouvrir l'appli » | état | `ko` + action `relier_ebay` |
| popup.js:1059-1069 (+675) | ligne plateforme | « Bloquée » + « Vérification anti-robot à passer sur {host} » + « Ouvrir {host} → » | état | résultat < 30 min commençant par `CHALLENGE ` |
| popup.js:1053-1058 | ligne plateforme | « Tu ne vends pas ici » + « Finalement, si » | état | vérité `ecartee` |
| popup.js:1070-1083 | ligne plateforme | « Pas encore vérifié » ou « Vérifié {depuis} » + bouton « Vérifier » | état+temps | état null |
| popup.js:1621, 1629, 1636 | bouton Vérifier | « … » puis « Réessayer » en cas d'échec | attente | SONDER_SESSION |
| popup.js:1093-1096 | pied du bloc | « Vérifié {ilYA} » — **jamais affiché** (bug l.773) | temps | `state.sondeFraiche` |
| popup.js:976-988, 1669-1677 | ligne Depop | « Depop attend ton autorisation pour que FillSell y dépose tes annonces ({n} en attente). Appuie sur « Autoriser Depop » : c'est une seule fois. » + bouton (« … » / « Réessayer ») | attente | accès depop.com absent |
| popup.js:961-972 | ligne Vinted | « Ton compte Vinted est sur {dom}. Appuie sur « Autoriser {dom} » pour que FillSell y travaille (synchronisation, publication, retraits) : c'est une seule fois. » (variante « Si ton compte Vinted est sur {dom}, … Sinon, rien à faire. ») | attente | domaine étranger non accordé |
| popup.js:990-1008, 1044-1052 | ligne Opla | « Opla attend ton autorisation … ({n} en attente) … c'est une seule fois. » (4 variantes) | attente | inatteignable depuis le 10/10 (l.430-434, 953-955) |
| popup.js:1121-1126 | « En cours » | « Vinted · synchronisation du dressing » + « {vus} articles sur {total} » (ou « {n} article lu » / « articles lus ») | progression | `contexte.sync.status = running` |
| popup.js:1129-1134 | « En cours » | « {Plateforme} · publication » + titre complet | état | job `processing` |
| popup.js:1135-1141, 1382-1387 | « En cours » | « {Plateforme} · republication · {étape} » (« à relever », « prête à republier », « recréation en attente », « recréée ») | état | republish `processing` + `republish_step` |
| popup.js:1143-1148 | « En cours » | pastille avec spinner « {n} article » / « {n} articles » / « dressing » | attente | — |
| popup.js:1113 ; popup.html:206-207 | carte « En cours » | barre animée de 7 s en boucle (signe d'activité, pas un pourcentage) | attente | — |
| popup.js:1162-1164 | carte « Prête à publier » | « Publication en cours sur {X, Y et Z} » | état | `processing` ou phase live `busy`/`queued` |
| popup.js:1166-1167 | idem | « Publiée » | état | toutes les phases live `done` |
| popup.js:1169-1170 | idem | « Un dépôt n'a pas abouti — le détail est ci-dessous » | état | phase `err`/`connect` |
| popup.js:1172-1177 | idem | « Partira dès que {X} est rouvert » / « … sont rouverts » | attente | `pending` sur une plateforme ko |
| popup.js:1179-1180 | idem | « Partira au prochain passage de l'extension » | attente/temps | `extensionFroide()` |
| popup.js:1182 | idem | « Part au prochain passage » (points animés) | attente/temps | `pending` par défaut |
| popup.js:1249-1254 | case « Diffuser sur » | « En file » (pêche si plateforme ko) | état | job présent, aucun lot |
| popup.js:1255-1258 | case | « En attente… » | attente | phase `queued` ou lot en cours |
| popup.js:1259-1261 | case | « Publication… » | état | `processing` / `busy` |
| popup.js:1262-1265 | case | « Publiée » / « Prêt (test) » | état | `done` |
| popup.js:1266-1268 | case | « Se connecter » | état | message qui matche `CONN_RE` (l.1729) |
| popup.js:1269-1273 | case | « Échec » (title = message montrable, sinon « La fiche de l'article, dans l'appli, dit ce qui bloque. ») | état | `failed`, `needsUser` **et `retry`** (l.1750-1755) |
| popup.js:1274-1275 | case | « Bientôt » | état | `supported:false` (aucune plateforme aujourd'hui) |
| popup.js:1276-1287 | case | « Déjà en ligne » | état | `deja_en_ligne` (serveur) |
| popup.js:1288-1292 | case | « Pas dans cet envoi » | état | aucun job |
| popup.js:1309-1316 | « En attente » | « Rien n'attend ton intervention » | état | total 0, lecture OK |
| popup.js:1326-1330, 1322-1325 | « En attente » | « {n} annonce attend un geste de ta part » / « {n} annonces attendent un geste de ta part » + lignes « {k} · {libellé court} » | état | `annonces_en_attente.total`, sinon nombre de `needs_user` |
| popup.js:556-596 | « En attente » / « Pourquoi ça attend » | voir le détail des familles sous le tableau | état/attente/temps | `MOTIFS_ANCRES` l.495-509 |
| popup.js:1352-1357 | « Pourquoi ça attend » | « {nb} republication(s) sur le dressing @{x} » + « {Chrome} est connecté à @{y}. Change de compte sur {vinted.fr}, elles repartiront seules. » | attente | `boutique_pause.retenus` |
| popup.js:1392-1401 | « Aussi en file » | « 🔁 {n} republication(s) — {k} à relever · {k} prête à republier · {k} recréation en attente · {k} recréée » (étape inconnue → « en file ») | état/attente | republish non `processing` |
| popup.js:1405-1413 | « Aussi en file » | « ⏱️ Prochaine recréation vers {HH:MM} — les gestes sont espacés de quelques minutes, comme le ferait une vraie personne » | **temps estimé** | plus petit `next_action_after` futur parmi **tous** les republish ; `toLocaleTimeString("fr-FR")` |
| popup.js:1414-1416 | « Aussi en file » | « 🔄 Synchronisation demandée — elle part au prochain passage de l'extension » | attente/temps | `sync.status = queued` |
| popup.js:1418-1423 | « Aussi en file » | « 🔁 Republication terminée ✓ » / « 🔁 Republication testée (dry run) ✓ » / « 🔁 Republication à relancer depuis l'appli » | état | résultat republish < 30 min |
| popup.js:1432-1448 ; popup.html:453 | pied | « {n} en file » / « {n} en file · en pause » | état/attente | « en pause » si tout le `pending` est retenu |
| popup.js:1451-1454 | sous le pied | « v{version} » | — | avec session seulement |

**Détail des familles (popup.js:556-596)**
- **repub_pause.** Libellé court : « republication(s) en pause ». Explication : « La republication est en pause. La fiche dans l'appli dit ce qui l'attend et porte le bouton pour relancer. »
- **fiche.** « {n} fiche(s) incomplète(s) ». Explication : « Complète-la/les dans l'appli puis relance… »
- **categorie.** Explication : « … Confirme-le dans l'appli : l'annonce repartira / les annonces repartiront au passage suivant. »
- **brouillon_lbc.** « brouillon(s) à supprimer sur Leboncoin ».
- **a_verifier.** « publication(s) à vérifier ».
- **autre.** « {n} annonce(s) avec un autre motif », suivi du premier message propre (220 caractères au plus), sinon « La fiche de l'annonce, dans l'appli, dit ce qui bloque et porte le bouton pour relancer. »

Formats de temps du popup :
- `depuis()` (l.641-649) : moins de 90 s → « à l'instant » ; puis « il y a N min » ; « il y a N h » jusqu'à 36 h ; au-delà « il y a N j ».
- `ilYA()` (l.805-812) : moins de 1 min → « à l'instant » ; « il y a N min » ; « il y a N h » jusqu'à 24 h ; au-delà « il y a N j ».
- `dansCombien()` (l.814-817) : ≤ 1 min → « dans moins d'une minute » ; sinon « dans N min ».

## 2. Background → popup, en direct
| fichier:ligne | où | texte / règle | catégorie | statut |
|---|---|---|---|---|
| bg:1620-1622 ; émissions 1727, 1732, 1740, 3126, 3149, 3156 | popup (`FILLSELL_PROGRESS`) | phases `queued`, `processing`, puis le statut de sortie (`published`, `dry_run_completed`, `needsUser`, `failed`, `retry`, `skipped`, `deleted`) ; mappage popup.js:1745-1758 | état/attente | — |
| bg:1632-1673 | popup (`fillsell_recent_results`, 30 min ; `fillsell_derniere_publication_ok`) | statut + erreur (300 caractères au plus) | état | — |
| bg:2897-2899 | popup (`fillsell_last_poll`) | horodatage ISO au début de chaque poll | temps | — |
| bg:951-955 | popup (`chrome.alarms`) | période de 2 min, 1er tir à +1 min | temps | — |
| bg:140-164 | popup (`fillsell_keep_awake` {depuis, maj}) | rafraîchi à chaque poll ; relâché au-delà du plafond de 4 h | attente | — |
| bg:2963-2967 | popup (`fillsell_maj_requise`) | posé ou effacé à chaque poll | état | — |

## 3. Background → base → app : `cross_post_jobs`

### 3a. Mécanismes partagés
| fichier:ligne | où | texte exact | catégorie | statut |
|---|---|---|---|---|
| bg:5080-5091 `rearmBounded` | `pending` + error + `next_action_after` + `needsUserAttempts` | « {message}. Reprise automatique dans ~{5\|15\|30\|60} min (tentative {a}/5). » | temps | environ 40 appelants |
| bg:5064-5075 `rearmBounded` | `failed` + error | « {cause}. Plusieurs essais automatiques n'ont pas abouti : la publication est arrêtée. Relance depuis la fiche de l'article ; si ça se reproduit, écris-nous. » (pour un retrait : « … le retrait est arrêté. Si l'annonce est encore en ligne, retire-la à la main sur la plateforme. ») ; promesses retirées par `sansPromesseDeReprise` (l.373-380) | état | 5e essai |
| bg:5119-5147 `marquerAttenteSession` | `pending` + error + `attente_session` {depuis, observations, derniere, motif} + `next_action_after` | « En attente de ta connexion à {label} dans {Chrome} : la publication / la republication repartira toute seule dès que tu seras reconnecté(e). Aucune tentative consommée. » ; pour un retrait : « … ton article est vendu mais son annonce est encore en ligne sur {label} (risque de double vente). Le retrait repartira tout seul dès que tu seras reconnecté(e). » | attente (délai réel non dit) | 3, 6, 10 min puis 60 / 180 / 360 min (l.7146-7152) |
| bg:5216-5235 `marquerRefusPassager` | `pending` + error + `refus_passager` {n, depuis, derniere} + `next_action_after` | « {label} a refusé l'accès à la page à l'instant, mais ta connexion {label} est bonne : rien à faire de ton côté, nouvel essai automatique dans quelques minutes. » | temps | 3, 6, 10 min ; 3 par heure au plus |
| bg:5309-5323 `attendreFinVerificationVinted` | `pending` + error + `retrait_en_attente_verification` + `next_action_after` | « Vinted vérifie encore cette annonce : elle est masquée aux acheteurs, et Vinted refuse de la retirer tant que la vérification dure. Le retrait est retenté toutes les heures et part dès qu'elle se termine — rien à faire de ton côté. » | temps | 60 min |
| bg:5360-5384 `marquerBlocageAntiRobot` | `pending` + error + `blocage_antirobot` {depuis, observations, derniere, motif} + `next_action_after` | « {label} affiche une vérification anti-robot : la page n'a pas pu être lue et aucun geste n'a été fait. {Le retrait de l'annonce\|La republication\|La publication} repart tout seul, nouvel essai dans ~20 min, sans consommer de tentative. » | temps | 20 min, plafond 6 h |
| bg:5002-5025, 4352 `reprendreSurOngletNeuf` | `pending` puis `failed` | `pending` : « Le clic « Mettre en vente » n'a produit AUCUNE requête de publication (soumission jamais partie) : aucune annonce n'a été créée[…] » ; `failed` : « {motif} — {n} reprises sur onglet neuf n'ont rien changé, job arrêté. Aucune annonce n'a été créée. » | état | 2 reprises au plus |
| bg:2252-2267 | `needs_user` requalifié en `failed` | « « {champ} » : ta réponse a bien été enregistrée, et ce champ est pourtant redemandé à l'identique. … on arrête là plutôt que de te faire tourner en rond. Le problème vient de chez nous et il est signalé. » (variante « … redemandé {n} fois malgré tes réponses… ») + « — Observabilité: … » | état | 4 blocages au plus |
| bg:3592, 3620, 21964, 22619, 23897, 24124, 24820, 25228, 25438, 26103 | `processing` + `processing_since` | — | état « en cours » | l'app (barresJobs.js) affiche une durée médiane |

### 3b. Publication (processJob et récupération)
| fichier:ligne | où | texte exact | catégorie | statut |
|---|---|---|---|---|
| bg:2622-2630 | `failed` | « Cette tâche s'est interrompue 3 fois sur ton ordinateur sans aller au bout ({minutes} min la dernière fois) : FillSell l'arrête pour ne jamais rien déposer en double. Vérifie sur {Plateforme} qu'elle n'y est pas, puis relance-la depuis l'app. » | état+temps | bloqué en `processing` > 15 min, 3e fois |
| bg:2638-2641 | `pending` | « Reprise après interruption (bloqué {minutes} min en cours de traitement) » | état+temps | reprise 1/2 ou 2/2 |
| bg:3855-3858 | `pending`, error null, +20 s | — | attente | brouillon Leboncoin jeté |
| bg:3989-4005 | `pending` + `colis_formulaire_rate` | « Le formulaire de Vinted n'a pas chargé les formats de colis de ce rayon : rien n'a été envoyé à Vinted. C'est un aléa de Vinted, rien à faire : nouvel essai automatique dans ~{3\|10} min. » | temps | — |
| bg:4941-4944 | `published` / `dry_run_completed` + error | « COMPLÉTÉ AVEC CHAMPS MANQUANTS : {champs}. Warnings: {…} » | état | — |
| bg:4456-4475 | `pending`, error null + `attente_identifiant_beebs` {depuis, depot_confirme_le} | — | attente | — |
| bg:3638-3652 | rearmBounded | « REAUTH VENTE eBay : eBay demande une reconnexion de sécurité pour vendre, alors que ta session de navigation reste active. Ouvre ebay.fr dans {Chrome}, clique « Vendre », reconnecte-toi, puis relance la publication depuis la fiche de l'article. » + suffixe | temps (relance manuelle **et** reprise automatique) | — |
| bg:4122, 4140 | rearmBounded | tout `needsUser` non nommé : texte du content script + suffixe | temps | — |
| bg:4805-4810 | rearmBounded | « {cause}. La tentative en cours a été interrompue avant d'aboutir. » / « Publication interrompue en cours d'opération : {exception} » + suffixe | état+temps | — |
| bg:7348-7352 → 4367 | rearmBounded | « Publication eBay REFUSÉE par la validation du formulaire : « … » — l'onglet de travail est resté sur le formulaire, le job repartira au prochain passage. » + suffixe | temps (2 délais) | — |
| bg:7385-7389 → 4367 | rearmBounded | « Publication eBay non confirmée : l'onglet est resté sur le formulaire (/lstng) 20 s après le clic, … — job NON marqué publié, il repartira au prochain passage. » + suffixe | temps | — |
| bg:3322-3331 → 4343, 4347 | rearmBounded | « Le brouillon eBay est resté au format « Enchères » par notre faute… » / « Publication eBay bloquée : … tu peux le compléter et le publier à la main… » + suffixe | temps (geste manuel **et** reprise auto) | — |
| bg:3300-3303 → 4736 | `needs_user`, sans reprise | « CHALLENGE CAPTCHA : eBay affiche une vérification anti-robot… Ouvrir ebay.fr dans {Chrome} et résoudre la vérification (l'onglet de travail est resté ouvert), le job repartira au prochain passage. » | temps (**promesse fausse**) | — |
| bg:11714-11716 → 4716, 4736 | `needs_user` (promesse retirée) ou attente de session | « Connexion eBay requise : se connecter sur ebay.fr dans {Chrome} (l'onglet de travail est resté ouvert), le job repartira au prochain passage. » | état | — |
| bg:11786-11800 | rearmBounded | « eBay a servi une page inattendue ({chemin}) … relance … si le job s'est arrêté. » / « eBay n'a pas ouvert le formulaire de mise en vente ({chemin}) et l'état de la session n'a pas pu être vérifié. Le job repartira automatiquement au prochain passage. » + suffixe | temps | — |
| bg:7222-7227 | uniquement `attente_session.motif` | « Reconnexion {Label} requise : … le job repartira automatiquement au prochain passage. » | temps (jamais affiché tel quel) | — |
| bg:5643-5646 | rearmBounded | « Un brouillon Leboncoin non terminé bloque le dépôt et n'a pas pu être retiré automatiquement : supprime-le sur leboncoin.fr/deposer-une-annonce, puis relance la publication. » + suffixe | temps (contradiction) | — |
| bg:4112-4119 | `needs_user` | « Vinted te demande de terminer une étape sur ton compte avant de pouvoir déposer une annonce (…). Ta connexion n'est pas en cause : … termine cette étape, puis relance la publication. » | état | — |
| bg:12316-12325, 12375-12387 | `pending` + `attente_boutique` {user_id, login, depuis} + 15 min | « En attente de ta boutique Vinted @{login} : cet article ne se publie que sur elle, et FillSell n'a pas pu lire quelle boutique est ouverte dans {Chrome}. Rien n'a été publié. Nouvel essai tout seul dans un quart d'heure ; si une autre boutique est ouverte, ouvre celle-ci sur {vinted.fr}. » / « En attente de ta boutique Vinted @{login} : … Ouvre-la sur {vinted.fr} dans {Chrome}, la publication repartira toute seule. Rien n'a été publié ailleurs. » | attente+temps | levée par la sonde (bg:12189) |
| bg:10965-10974 → 11003 | `needs_user` + `opla_cookies_attendu_le` | « Opla refuse les demandes de ce navigateur : … dès que c'est fait, la publication repart toute seule. » | attente | inatteignable (Opla sortie) |
| bg:10839-10847, 11150-11158 | — | « … c'est une seule fois, et la publication repart toute seule. » | attente | **jamais appelées** |

### 3c. Republication Leboncoin / Beebs / Depop
| fichier:ligne | où | texte exact | catégorie | statut |
|---|---|---|---|---|
| bg:23005-23014 → 23043 | `needs_user` | « Republication {label} mise en pause AVANT tout retrait : {quoi} manque(nt) dans la copie de ton annonce. Ton annonce est TOUJOURS en ligne, rien n'a été touché. Relance la republication depuis la fiche de l'article. » | état | — |
| bg:23574-23579 ; 23624-23627 | `pending`, error null ; étape `captured` | — | état | — |
| bg:23591-23600 | `pending`, error null + `republish_etat_indetermine`, +15 min | — | attente | 4 fois au plus |
| bg:23602-23605 | `needs_user` | « Republication en pause AVANT tout retrait : l'état de ton annonce {label} n'a pas pu être vérifié ({cause}). Ton annonce est intacte. Relance la republication depuis la fiche de l'article, {Chrome} ouvert. » | état | — |
| bg:23675-23680 ; 23236-23241 | `needs_user` | « Republication {label} mise en pause AVANT tout retrait, ton annonce est toujours en ligne : {motif} » | état | — |
| bg:23709-23716 ; 23209-23222 | `needs_user` (markNeedsUser) | « Republication {Beebs\|label} mise en pause AVANT tout retrait[, ton annonce est toujours en ligne] : {label} exige « {champ} » pour ce rayon et aucune valeur certaine n'a pu être posée. … Choisis la valeur dans l'app : la republication repartira seule. » | état/attente | — |
| bg:23717-23727 ; 23797-23803 ; 23243-23253 | `pending`, error null, +30 min (ou +1 min si brouillon jeté) | — | attente silencieuse | — |
| bg:23777-23795 ; 23224-23234 | attente de session (texte d'origine dans `motif`) | « Connexion {label} requise : se connecter sur {leboncoin.fr\|depop.com} dans {Chrome}. La republication repartira toute seule, ton annonce n'a pas été touchée. » | attente | — |
| bg:23805-23829 | `pending` + `pause_page_depot` | « Republication {label} en pause AVANT tout retrait : la page de dépôt {label} ne montre pas {quoi} là où on l'attend. Ton annonce est TOUJOURS en ligne, rien n'a été touché. C'est de notre côté, rien à faire : nouvel essai automatique dans ~{30 min\|1 h\|3 h\|6 h}. » | temps | — |
| bg:23848-23857 | `needs_user` | « Republication Leboncoin mise en pause AVANT tout retrait : aucune adresse connue… » / « … Leboncoin ne propose aucune adresse pour « {adresse} »… » | état | — |
| bg:23521-23534 | `pending` + `retenue_hors_ligne` {job, titre, depuis}, +30 min | « En attente : ton annonce « {titre} » a été retirée et n'est pas encore revenue en ligne. Les autres republications attendent sa remise en ligne, pour ne jamais laisser deux annonces hors ligne. Rien n'a été retiré. » | attente | — |
| bg:23903-23924, 23993-24001 | rearmBounded ou `rearmerSuppressionNonProuvee` | « Retrait {label} interrompu (onglet navigué ou rechargé) : {msg} » / « Retrait {label} non abouti ({motif}). Ton annonce est TOUJOURS en ligne (vérifié), rien n'a été touché. » / « … L'état de l'annonce n'a pas pu être vérifié : {cause}. » / « Le retrait {label} n'a rendu aucun résultat exploitable. » + suffixe | état+temps | — |
| bg:23982-23992 + 23493-23503 | `pending` + `suppression_non_prouvee` | « Suppression envoyée à {label} ({motif}). Elle n'est pas encore confirmée : vérification au prochain passage, puis remise en ligne. Nouvelle vérification automatique dans ~{5\|10\|20\|30\|60} min. » (variante « Suppression déjà envoyée… ») | temps (2 délais) | — |
| bg:24006-24015 | `pending`, error null, étape `deleted` + `deleted_at` + `next_action_after` entre +2 et +5 min | — | attente | popup « vers HH:MM » ; app « hors ligne » + heure |
| bg:24016-24019 → 21450-21456 | job de publication d'origine → `cancelled` + error | « Annonce en cours de republication sur {label} (retirée puis redéposée pour remonter dans le fil) — pas une vente » | état (« en cours » sur un job clos) | — |
| bg:24056-24066 | PATCH étape `recreated` + `recreated_at` | — | état | — |
| bg:24086-24088 | `needs_user` | « Ton annonce a été retirée de {label} et n'a pas pu être redéposée automatiquement : {motif}. Rien n'est perdu : … Clique « Republier maintenant » depuis la fiche de l'article. » | état | — |

### 3d. Republication Vinted
| fichier:ligne | où | texte exact | catégorie | statut |
|---|---|---|---|---|
| bg:24262-24271 ; 22438-22452 ; 22454-22461 | `pending`, error null, +15 min (`attente_boutique` ou `introuvable_indetermine`) | — | attente silencieuse | — |
| bg:24328-24345 | `pending` (+30 min) puis `failed` au 3e | « La lecture de ton annonce sur Vinted n'a pas répondu à temps. Rien n'a été touché, ton annonce est intacte. Nouvel essai automatique dans une demi-heure ; tes autres republications passent en attendant. » / `failed` : « Republication annulée avant toute suppression : la lecture de ton annonce sur Vinted ne répond pas ({n} essais espacés). Ton annonce est intacte. Tu peux la relancer plus tard depuis l'app. » | temps | — |
| bg:24365-24376 | `needs_user` + `session_vinted` | « Connexion Vinted requise : connecte-toi sur {vinted.fr} dans {Chrome}, sur ton ordinateur. Ton annonce est intacte, rien n'a été touché ; la republication repartira toute seule dès que tu seras connecté. » | attente | relancé par la sonde (bg:12159) |
| bg:24379-24388 | `pending`, +45 min | « Vinted a affiché une vérification anti-robot au lieu de ton annonce. Rien n'a été touché, ton annonce est toujours en ligne. On réessaie tout seuls dans trois quarts d'heure, au calme — tu peux aussi ouvrir Vinted et passer la vérification, ça ira plus vite. » | temps | — |
| bg:24397-24409 | `pending`, +15 min | « Vinted n'a pas voulu nous rendre ta fiche à l'instant. Ta connexion Vinted est bonne, il n'y a rien à faire de ton côté : ton annonce est intacte et on refait un essai tout seuls dans un quart d'heure. » | temps | — |
| bg:24411-24417 | `needs_user` + `session_vinted` | « Ta republication attend que Vinted soit rouvert — … Connecte-toi sur {vinted.fr} dans {Chrome} (ou ouvre simplement un onglet Vinted) : la republication repartira toute seule dans les minutes qui suivent. » | attente+temps | — |
| bg:22463-22470 | `needs_user` | « Republication en pause AVANT toute suppression : Vinted répond « annonce introuvable » et FillSell n'a pas pu lire quelle boutique est connectée dans {Chrome}. … puis relance la republication. » (+ variante) | état | — |
| bg:22479-22483 | **`failed`** | « Republication en pause : Vinted n'a pas rendu cette annonce à la lecture (introuvable). FillSell n'a rien supprimé ; le prochain relevé de ta boutique dira si elle est encore en ligne. » | état+temps (statut `failed`, texte « en pause ») | — |
| bg:24462-24465 ; 24765-24769 | `needs_user` + `capture_incomplete` | « Republication en pause AVANT toute suppression : la (nouvelle) capture de ton annonce est incomplète : {détail}. … puis relance la republication. » | état | — |
| bg:24468-24478 ; 24776-24784 ; 24608-24620 (+2 min) ; 24980-24985 (+2 min) ; 25417-25428 (+5 min) | `pending`, error null | — | attente silencieuse | — |
| bg:24656-24663 | `needs_user` | « Republication arrêtée AVANT toute suppression : {le prix / le titre} de la nouvelle annonce n'a pas pu être déterminé. Ton annonce est intacte, elle est toujours en ligne. Relance la republication depuis l'app. » | état | — |
| bg:24719-24725 | `needs_user` | « Deux captures refaites automatiquement ont encore expiré : ton {Chrome} s'ouvre trop longtemps après. Republie cet article quand tu es DEVANT ton ordinateur — le clic, puis {Chrome} ouvert une dizaine de minutes, et c'est réglé. Rien n'a été touché, ton annonce est intacte. » | **temps estimé** | — |
| bg:24751-24754 | `needs_user` | « Republication en pause AVANT toute suppression : ta capture datait de plus de 24 h et la nouvelle capture a échoué : {motif}. … Relance la republication depuis l'app, {Chrome} ouvert. » | état+temps | — |
| bg:24821-24826 | `failed` | « Republication annulée : impossible de sécuriser les données de ton annonce en base — rien n'a été touché et ton annonce est intacte. Réessaie dans un instant. » | temps | — |
| bg:22112-22125 | `pending` + `listing_restriction_retries` | « RESTRICTION VINTED : Vinted limite temporairement les mises en vente sur ce compte. Ton annonce est intacte, rien n'a été supprimé. Reprise automatique dans ~{5\|15\|30\|60} min (tentative {n}/4) — rien à faire.[ Message affiché par Vinted : « … »] » | temps | — |
| bg:22127-22133 | `needs_user` | « … {4} reprises automatiques espacées n'ont pas suffi — attends un peu (souvent quelques minutes à quelques heures), puis relance avec « Republier maintenant » depuis l'app. » | **temps estimé** | — |
| bg:22163-22179 | `pending` + `selling_restriction` (60 / 180 / 360 min) | « Vinted a restreint les mises en vente de ton compte : ouvre {vinted.fr} dans {Chrome} pour voir ce que Vinted demande. » + « Ton annonce « {titre} » a été retirée avant la restriction et attend sa remise en ligne : … la remise en ligne repartira seule ensuite. … » ou « Ton annonce est toujours en ligne : … la republication repartira seule ensuite. » | attente (délai non dit) | — |
| bg:24940-24969 | `pending` + `pause_colis` | « Republication en pause AVANT tout retrait : la page de Vinted n'a pas chargé les formats de colis de ce rayon. … C'est un aléa de Vinted, rien à faire : nouvel essai automatique dans ~{3 min\|10 min}. » / « … le formulaire de Vinted ne propose pas le format du colis pour ce rayon, alors que Vinted l'exige. … C'est de notre côté, rien à faire : nouvel essai automatique dans ~{1 h\|3 h\|6 h}. » | temps | — |
| bg:25010-25022 | **`needs_user`** + `boutique_etrangere` | « En attente de ton autre boutique Vinted : ouvre-la sur {vinted.fr} dans {Chrome}, la republication repartira toute seule. Ton annonce est toujours en ligne, rien n'a été retiré. » | attente | — |
| bg:25027-25036 ; 25133-25138 ; 25168-25171 | `needs_user` | « Republication en pause avant toute suppression : ton annonce est toujours en ligne sur Vinted. {…} Relance depuis l'app quand tu veux. » / « Republication interrompue[ avant toute suppression] : nous n'avons pas pu vérifier l'état de ton annonce sur Vinted. … l'état réel sera re-vérifié avant tout geste. » / « Republication interrompue pendant la suppression ({e}). … » | état | — |
| bg:25118-25119 | `needs_user` + `prevol_negatif` | « Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. {corps}{annexe}{ Le choix se fait dans l'app : fiche de l'article, bouton « ✋ Compléter ».} » | état | — |
| bg:25143-25162 → 21450 | job de publication d'origine `cancelled` | « Annonce en cours de republication (supprimée puis recréée pour remonter dans le fil) — pas une vente » | état (figé) | — |
| bg:25360-25365 | `needs_user` | « Ta nouvelle annonce est déjà en ligne sur Vinted, mais elle a été ajoutée à ton stock comme une fiche séparée. Fusionne les deux fiches de cet article depuis l'app. Rien n'a été redéposé. » | état | — |
| bg:25392-25404 | `needs_user` | « Republication en pause : plusieurs annonces identiques sont en ligne sur Vinted (une republication a abouti deux fois). Garde l'annonce que tu veux, supprime l'autre, puis relance depuis la fiche de l'article. Rien n'a été recréé. » | état | — |
| bg:25465-25468 | `needs_user` | « Recréation interrompue ({e}). Rien n'est perdu — relance depuis l'app, la reprise repart directement à la recréation. » | état | — |
| bg:22018-22029 | `pending`, +6 h | « Ton annonce a été retirée de Vinted et n'est pas encore revenue en ligne : Vinted exige le format du colis, que son formulaire ne propose pas pour ce rayon[, et a refusé celui que nous lui avons envoyé]. Rien n'est perdu : toutes ses données sont sauvegardées. C'est de notre côté, rien à faire : nouvel essai automatique dans 6 h. » | temps | — |
| bg:22031-22038 | `pending`, **error null**, +5 puis +10 min | — (annonce hors ligne, aucun texte) | attente silencieuse | — |
| bg:22046-22069 | `needs_user` | « Ton annonce a été retirée de Vinted et n'a pas pu être recréée automatiquement : {motif}. Rien n'est perdu : toutes ses données sont sauvegardées. Clique « Republier maintenant » — si un champ manque, il te sera demandé. » | état | — |
| bg:21596-21622 ; 22281-22332 | `published` + étape `recreated` + `recreated_at` | — | état | — |

### 3e. Retrait (processDeleteJob)
| fichier:ligne | où | texte exact | catégorie | statut |
|---|---|---|---|---|
| bg:26040-26051 ; 26130-26142 (+2 min) | `pending`, error null | — | attente silencieuse | — |
| bg:26144-26161 ; 26278-26292 | `needs_user` + `boutique_etrangere` (texte de vinted.js:2432-2433) | « … Connecte {Chrome} à la boutique qui porte cette annonce, sur {vinted.fr} : le retrait repartira tout seul. Rien n'a été touché. » | attente | — |
| bg:26175-26188 ; 26332 ; 26385-26394 | `deleted`, error null | — | état | — |
| bg:26201-26216 | rearmBounded | « Suppression {clé plateforme} non aboutie ({erreur}). L'annonce est TOUJOURS en ligne (vérifié). Nouvelle tentative au prochain passage ; sinon la retirer à la main sur la plateforme. » / « … L'état de l'annonce n'a PAS pu être vérifié : {cause} — elle est peut-être encore en ligne. Nouvelle tentative au prochain passage ; sinon vérifier à la main sur la plateforme. » + suffixe | temps (**2 délais**) | — |
| bg:26260-26263 ; 7187-7190 | rearmBounded | « Le retrait n'a pas pu être tenté : notre onglet de travail n'était pas encore sur la page de ton annonce. Rien n'a été touché, ton annonce est intacte — on réessaie tout seuls au prochain passage. » + suffixe | temps | — |
| bg:26265-26268, 26314, 26349, 26397 | rearmBounded | message brut / « retrait non confirmé, à reprendre » / « Suppression interrompue (onglet navigué/rechargé) : {msg} » + suffixe | état+temps | — |
| bg:26015-26025 → 26316 | `pending` + `beebs_en_moderation` | « L'annonce n'est pas encore visible sur Beebs (Beebs l'examine encore) : FillSell la retirera dès qu'elle apparaît. Nouvelle vérification automatique dans ~{60\|180\|360\|720} min. » | temps | — |

### 3f. Veilleur de vente
| fichier:ligne | où | texte exact | catégorie | statut |
|---|---|---|---|---|
| bg:20101-20136 | PATCH `last_checked_at` ; au 4e échec : error + `check_unresolved_since` | « Impossible de vérifier cette annonce sur {Plateforme} : sa page n'a pas répondu comme prévu. L'annonce n'a pas été touchée ; nouvelle vérification dans 24 h. » | temps | — |
| bg:20181-20205 | PATCH `vinted_en_verification` {depuis, vu_le} | — | état | l'app affiche « En vérification chez Vinted » |
| bg:20298-20304 | `cancelled` | « Annonce {id} remplacée par une republication (l'article vit désormais sur l'annonce {id}) : l'ancienne publication est close, ce n'est pas une vente. » | état | — |
| bg:20305-20363 | `unavailable_pending_since` puis `unavailable_since` + `sale_signal` + `detected_price` | — | état | bandeaux de l'app (2e lecture au moins un cycle plus tard) |

### 3g. Écritures directes de statut (hors `update-job-status`)
| fichier:ligne | où | texte exact | catégorie | statut |
|---|---|---|---|---|
| bg:21450-21456 | job de publication `cancelled` | « Annonce retirée par le vendeur (retrait ciblé depuis l'app) — pas une vente » | état | — |
| bg:11019-11028, 11105-11114, 11250 | `needs_user` → `pending`, error null | — | état | Opla / Depop après « Autoriser » |
| bg:12159-12177 | `needs_user` → `pending` | — | état | `session_vinted`, quand la sonde voit Vinted connecté |
| bg:12189-12210 | `attente_boutique` et `next_action_after` effacés, error null | — | état | — |
| bg:19307-19322 | jobs `published` synthétiques (synchro du dressing) | — | état | — |

## 4. Background → `vinted_sync_runs` (relevés lus par l'app)
| fichier:ligne | où | texte exact | catégorie | statut |
|---|---|---|---|---|
| bg:17491-17503 | `cancelled` + erreur (rendue telle quelle) | « dressing déjà synchronisé il y a moins de 15 min (prochaine sync possible dans ~{n} min) » | temps | — |
| bg:18429, 18487, 18490 | `total_pages`, `total_entries`, `items_vus`, `page_suivante`… | — | progression | popup « X articles sur Y » |
| bg:18091-18097 | `failed` | « [pas_connecte] [cause403] session_absente — aucune session Vinted dans {navigateur} (…) : connecte-toi sur {www.vinted.fr} dans {navigateur}, puis relance la synchronisation. » | état | — |
| bg:18119-18133 | `failed` | « [anti_robot] Vinted a refusé l'accès à son API (HTTP {code}, protection anti-robot) — la connexion Vinted n'a donc pas pu être vérifiée. Réessaie dans quelques minutes : ta connexion Vinted n'est pas en cause.[ \| [cause403] …] » | temps | — |
| bg:18167-18170 | `failed` | « [pas_connecte] aucune session Vinted dans ce navigateur — Vinted a refusé la lecture du compte {n} fois (HTTP 401), rechargement de la page compris. » | état | — |
| bg:18270-18274 | `failed` | « [boutique_a_confirmer] Ce navigateur est connecté au dressing @{login} — … Rien n'a été importé. Confirme la boutique dans l'app … puis relance. » | état | — |
| bg:18372-18373 ; 18393-18418 | `interrupted` / `incomplete` | « [note] relevé incomplet — canal coupé page {p} après {n} article(s) lu(s) ; reprise à la page {p} » | état/progression | — |
| bg:18734-18820 | `done` / `incomplete` + notes | « [note] relevé incomplet — {vus} article(s) lu(s) sur {total} annoncé(s) par Vinted ; arrêt : … ; reprise à la page {p} » ; « [note] rien lu alors que le profil Vinted annonce {n} article(s) en vente — relevé à refaire » | état/progression | — |
| bg:13215-13231 | note | « [note] cadence cron : {n} sync 'cron' refusée(s) depuis ce run (fenêtre de 20 h), dernière le {ISO} » | temps (journal) | — |
| bg:12780-12784, 18107 | — | « [retry403] tentative {N}/3 prevue {ISO} — … reprise automatique programmée… » | temps | **dormant** |
| bg:12972-12979, 13195-13198, 18406-18415 | — | « [reprise-auto] tentative {N}/3 prevue {ISO} — {motif} » | temps | **dormant** |
| bg:16346-16358 | — | « [reprise-technique] tentative {N}/2 au prochain passage — … » | temps | **dormant** |
| bg:16385-16395 | relevé `cancelled` | « Opla n'est plus prise en charge par FillSell (sortie du 10/10) » / « relevé multiplateforme fermé (interrupteur serveur) » | état | — |
| bg:16436-16438 ; 16529-16561 ; 16365-16370 | `items_vus` dès la liste reçue ; clôture `absente` / `failed` / `incomplete` / `done` + `total_entries` ; erreur « [incomplet] … · [rattachement] …, {n} à reprendre au prochain relevé · [capture] …, {n} au prochain relevé » | — | état/progression/temps | l'app dit « 30 lues sur 176 » |
| bg:11402-11414 | demande « Me connecter » : `done` / `error` | « page de connexion non ouvrable sur cet ordinateur » | état | — |

## 5. Background → `profiles`
| fichier:ligne | champ | règle | catégorie |
|---|---|---|---|
| bg:11958-11993, 12068-12071 | `extension_sessions` {checked_at, checked_at_par_plateforme, sondees, états par plateforme, ebay_hub_mur, vinted_identite, http, previous} | sonde : Vinted toutes les 10 min, les autres toutes les 60 min | état+temps |
| bg:12404-12420 ; 12453-12464 | idem : `false` (redirection vers la connexion observée) / `true` (compte vu sur la page) | — | état |
| bg:25616-25627 | `platform_settings.vinted.republish_auto.derniere_erreur` + `derniere_erreur_le` | — | état+temps |

## 6. Content scripts → texte repris dans `cross_post_jobs.error`
| fichier:ligne | devenir | texte exact | catégorie |
|---|---|---|---|
| vinted.js:3006-3010 | rearmBounded | « CHALLENGE DATADOME : Vinted affiche une vérification anti-robot à la place du formulaire de dépôt. Ouvrir {vinted.fr} dans {Chrome} et résoudre la vérification (l'onglet de travail est resté ouvert), le job repartira au prochain passage. » | temps |
| vinted.js:3154-3158 | refus passager (texte remplacé) | « Page de dépôt Vinted non atteinte ({signal}) alors que le compte (@{login}) répond — nouvelle tentative au prochain passage, rien à faire. » | temps |
| vinted.js:3163-3167 | attente de session (`motif`) | « Connexion Vinted requise : … le job repartira au prochain passage. » | temps |
| vinted.js:3090-3094 | publication → rearmBounded | « RESTRICTION VINTED : … — réessayer plus tard. » | temps |
| vinted.js:4757-4762 | remplacé (bg:4002, 24961) | « … nouvel essai automatique dans quelques minutes. » | temps |
| vinted.js:2301-2304, 2625-2628, 2675-2678 | `blocage_antirobot.motif` | « CHALLENGE … On réessaie tout seul dans quelques minutes. » | temps |
| vinted.js:7805-7810 | needsUser | « Le panneau de catégories Vinted ne s'est pas affiché — … Nouvelle tentative au prochain passage, rien à faire. » | temps |
| vinted.js:8721-8736 ; ebay.js:2886-2901 ; beebs.js:4695-4710 ; leboncoin.js:6110-6125 | exception → **`failed` sec** (bg:4847) | « La photo {n} de l'annonce n'a pas pu être lue à l'instant (…). C'est presque toujours passager. La publication repart toute seule dans quelques minutes — rien à payer, rien à refaire. … » / « … FillSell la rapatrie automatiquement et relance la publication sous quelques minutes — … » / « … Réessaie dans quelques minutes ; si ça persiste… » | temps (promesse sur un `failed`) |
| ebay.js:685-691 | rearmBounded ou `needs_user` (bg:4736) | « CHALLENGE CAPTCHA : … Ouvrir ebay.fr dans Chrome [codé en dur] … le job repartira au prochain passage. » | temps |
| ebay.js:727-729 | remplacé | « Session eBay à vérifier : … Le job repartira au prochain passage. » | temps |
| ebay.js:1079-1082 | rearmBounded | « LIVE : description non posée … Le job repartira au prochain passage. » | temps |
| ebay.js:1177-1182, 1210-1212 | markNeedsUser | « … ; le job repartira ensuite automatiquement. » | attente |
| leboncoin.js:1264-1267, 2141-2143, 2123-2127, 2261-2264 | rearmBounded | « CHALLENGE DATADOME : … Ouvrir leboncoin.fr dans Chrome … le job repartira au prochain passage. » / « Leboncoin n'a pas accepté le dépôt pour le moment, sans message à l'écran — nouvel essai automatique un peu plus tard. — Observabilité: … » | temps |
| leboncoin.js:1284-1286, 1339-1341 | attente de session | « Connexion Leboncoin requise : … le job repartira au prochain passage. » | temps |
| leboncoin.js:2154-2157, 2269-2271, 2643, 2663, 2677 | rearmBounded | « … Nouvel essai automatique un peu plus tard, rien à faire de ton côté. » / « … nouvel essai automatique un peu plus tard. … » | temps |
| beebs.js:697-701 | retrait | « Suppression envoyée à Beebs, mais l'annonce est encore dans « Mes annonces » deux minutes après — vérification au prochain passage, rien d'autre n'est fait » | temps |
| beebs.js:781 | retrait | « … Il repartira quand le lien sera connu. » | attente |
| beebs.js:830, 836, 889-890 | rearmBounded | « … — rien n'a été touché, nouvel essai » | temps |
| beebs.js:1207-1212, 1239-1244, 1270-1275, 1804-1809 | rearmBounded ou attente de session | « … le job repartira au prochain passage. » | temps |
| beebs.js:4310-4315 | rearmBounded | « … Nouvel essai au prochain passage ; si ça persiste, le problème vient de chez nous et il est signalé. » | temps |
| beebs.js:3797-3802, 4414-4417 | **`failed` sec** | « … Le job repartira au prochain passage. » | temps (promesse sur un `failed`) |
| depop.js:91-99 | attente de session | « Connexion Depop requise : … dès que c'est fait, la publication repart toute seule. » (retrait : « le retrait repart tout seul ») | attente |
| depop.js:455, 598, 631-632 | rearmBounded | « Session Depop illisible (…) : rien n'a été envoyé, nouvel essai plus tard. » / « … reprise au prochain passage. » / « … Vérification au prochain passage. » | temps |
| opla.js:757-759, 1318, 1338-1339, 1523-1524 | inatteignable (Opla sortie) | « … reprise au prochain passage. » | temps |

## 7. fillsell-auth.js → page fillsell.app
| fichier:ligne | où | texte / règle | catégorie |
|---|---|---|---|
| fillsell-auth.js:151-155 | `postMessage __fillsellExt` + version | signal de présence de l'extension | état |
| fillsell-auth.js:85, 93, 102, 119-120, 134-136 | réponses aux commandes de l'app | « extension muette » en l'absence de réponse | état |

## Annexe A — `needs_user` / `failed` sans mot d'état ni de temps (cause + geste)

background.js : 3509, 3304-3308, 3662-3676, 4218-4230, 4664-4682, 4847 (+6392-6394), 5452, 5549, 23556-23559, 23582-23586, 23633-23635, 24033-24035, 24097-24098, 24117-24119, 24183-24185, 24209-24211, 24434-24436, 24454-24456, 24492-24495, 24590-24594, 24632-24636, 25205-25209, 25220-25225, 25473-25474, 26079-26086, 26404.

## Où l'extension calcule un état affichable

**popup.js**
- `rowState` (444-467) et `batchRunning` (472-485).
- `etatPrete` (1156-1183) et `renderFlow` (1235-1299).
- `renderAccount` (825-843) et `renderBars` (845-879).
- `etatPlateforme` (669-765), `messagesPlateforme` (653-661), `calculerEtats` (769-782), `sondeFraichePour` (788-796), `estKo` / `plateformesKo` / `plateformesOk` (797-799), `extensionFroide` (801).
- `motifsDominants` (599-613), `MOTIFS_ANCRES` (495-509), `MOTIFS_DITS_AILLEURS` (519), `FAMILLES` (556-596).
- `texteMontrable` / `messagePropre` (529-550).
- `renderNow` (1117-1150), `REPUB_ETAPES` (1382-1387), `renderQueueExtra` (1389-1430), `renderFooter` (1432-1449).
- `CONN_RE` / `isConnErr` / `shortErr` (1729-1734) et mappage des phases (1745-1758).
- `depuis` (641), `ilYA` (805), `dansCombien` (814).
- `dejaEnLigne` (1227), `actionEnCours` (1499), `oplaSortiePasse` (431), `depopVisible` (424).

**background.js**
- `updateJobStatus` (2270) et `gardeAntiBoucleNeedsUser` (2204).
- `rearmBounded` (5028), `marquerAttenteSession` (5106), `delaiAttenteSessionMin` (7146).
- `marquerRefusPassager` (5202), `traiterMurDeConnexion` (5244), `arbitrerMurDeConnexion` (5175).
- `marquerBlocageAntiRobot` (5326), `attendreFinVerificationVinted` (5302), `marquerAttenteUtilisateur` (5438), `markNeedsUser` (5472).
- `reprendreSurOngletNeuf` (4996), `recoverStaleProcessingJobs` (2454).
- `causeHumaineConnue` (360), `sansPromesseDeReprise` (373), `motifLisible` (4880), `phraseClose` (4931), `causeLectureImpossible` (10677), `texteSain` (2146), `completionExtras` (4937).
- `motifSessionMorte` (7168), `messagePageInattendue` (7187).
- `arbitrerSessionEbay` (11730), `classerMurHubEbay` (11706), `murEbayDeLOnglet` (3349), `motifRefusPublishDirect` (3336).
- `messageAttenteBoutiqueDepot` (12316), `retenirPublicationPourBoutique` (12360).
- `messagePrevolRepublication` (23005), `verdictPrevolRecreation` (23170), `prevolRecreationAvantRetrait` (23187), `rearmerSuppressionNonProuvee` (23485), `retenirDerriereAnnonceHorsLigne` (23521).
- `replanifierOuArreterRecreation` (22004), `replanifierRestrictionVinted` (22089), `replanifierRestrictionVenteVinted` (22151).
- `beebsAbsenteParModeration` (25995), `cancelPublishAfterDelete` (21338).
- `statutFinReleveAnnonces` (16365) ; clôtures du relevé `clore` / `echec` (17892-17940, 18799-18820).
- `probePlatformSessions` (11855), `ecrireExtensionSessions` (12007), `noterSessionDeconnectee` (12396), `noterCompteVuSurLaPage` (12438).
- `checkPublishedListings` (19964), `recordRecentResult` (1633), `emitProgress` (1620), `arbitrerEveil` (169).

## Constantes de délai écrites en base ou montrées
| constante | valeur | fichier:ligne | effet |
|---|---|---|---|
| POLL_INTERVAL_MINUTES | 2 min (1er tir +1 min) | config.js:14 ; bg:952-955 | popup « prochain dans … » |
| REPRISE_ESPACEE_DELAIS_MIN | [5, 15, 30, 60], 5 essais | bg:326 | `next_action_after` + « ~X min (tentative a/5) » |
| STALE_PROCESSING_MS / MAX_STALE_RECOVERIES | 15 min / 2 | bg:2451-2452 | « bloqué X min », « interrompue 3 fois » |
| MAX_FROZEN_TAB_RETRIES | 2 | bg:4995 | « {n} reprises sur onglet neuf » |
| ATTENTE_SESSION_MIN / delaiAttenteSessionMin | 3, 6, 10 min puis 60 / 180 / 360 | bg:7132, 7146-7152 | échéance non dite dans le texte |
| refus passager | [3, 6, 10] min, 3 par heure | bg:5206-5216 | « quelques minutes » |
| BLOCAGE_ANTIROBOT_MIN / _PLAFOND_MS | 20 min / 6 h | bg:5295-5296 | « ~20 min » |
| RETRAIT_VERIF_MIN | 60 min | bg:5301 | « toutes les heures » |
| formats de colis non chargés (publication) | 3 puis 10 min | bg:3993 | « ~3 / ~10 min » |
| brouillon Leboncoin jeté | 20 s | bg:3855 | silencieux |
| attente de boutique | 15 min | bg:12380, 24267, 22441, 22458 | « un quart d'heure » (une variante) |
| recréation : format de colis refusé | 6 h | bg:22020 | « 6 h » |
| recréation échouée | 5 puis 10 min | bg:22034 | silencieux |
| LISTING_RESTRICTION_DELAIS_MIN | [5, 15, 30, 60] | bg:22088 | « ~X min (tentative n/4) » |
| SELLING_RESTRICTION_DELAIS_MIN | [60, 180, 360] | bg:22150 | non dit |
| REPUBLISH_PF_ETAT_ESSAIS_MAX | 4 × 15 min | bg:22707, 23597 | silencieux |
| pré-vol de recréation non concluant | 1 / 30 min | bg:23245 | silencieux |
| SUPPRESSION_NON_PROUVEE_DELAIS_MIN | [5, 10, 20, 30, 60] | bg:23484 | « ~X min » |
| retenue hors ligne ; pré-vol Beebs ; mur au pré-vol | 30 min | bg:23529, 23720, 23800 | non dit |
| pause_page_depot | 30, 60, 180, 180, 360 min | bg:23818 | « ~30 min / 1 h / 3 h / 6 h » |
| pause après retrait (Leboncoin / Beebs / Depop) | 2 à 5 min (aléatoire) | bg:24014 | popup « vers HH:MM » |
| capture sans réponse / anti-robot / session bonne | 30 / 45 / 15 min | bg:24333, 24380, 24400 | « une demi-heure » / « trois quarts d'heure » / « un quart d'heure » |
| preuve de boutique / annonce déjà absente / vérification de boutique | 2 min | bg:24618, 24983, 26140 | silencieux |
| pause_colis (republication) | 3, 10 min ; puis 60, 180, 360 min | bg:24949-24951 | « ~X min / ~X h » |
| garde anti-doublon de recréation | 5 min | bg:25422 | silencieux |
| BEEBS_MODERATION_RELECTURES_MIN | [60, 180, 360, 720], 72 h au plus | bg:25993-25994 | « ~X min » |
| capture périmée | 24 h ; plafond 2 recaptures | bg:24669, 24719 | « plus de 24 h », « une dizaine de minutes » |
| MAX_UNKNOWN_CHECKS / UNKNOWN_RETRY_MS | 4 / 24 h | bg:9862, 9867 | « dans 24 h » |
| SYNC_MANUAL_COOLDOWN_MS / SYNC_CRON_COOLDOWN_MS | 15 min / 20 h | bg:12640, 13205 | « ~X min » ; note de journal |
| SYNC_RETRY403 / SYNC_REPRISE_AUTO / reprise technique des relevés | [5, 10, 20] / [3, 7, 15] / 2 | bg:12689, 12920, 14940 | **dormants** (bg:12680) |
| SESSION_PROBE_INTERVALS_MS | Vinted 10 min, autres 60 min | bg:11577-11584 | « Vérifié il y a … » |
| SESSIONS.FRAICHEUR_MS / PUBLICATION_PROUVE_MS | Vinted 1 h, autres 3 h / 72 h | config.js:119, 124 | popup |
| RECENT_RESULTS_TTL_MS | 30 min | bg:1632 ; popup.js:370 | popup |
| EVEIL_PLAFOND_MS / EVEIL_FRAICHEUR_MS | 4 h / 5 min | bg:90 ; popup.js:19 | ligne « éveillé » |
| extensionFroide ; seuil « Vérifié » | 60 min ; 10 min | popup.js:801, 1020 | « En veille » |
| AVIS_ESPACEMENT_MS ; délai de déconnexion | 3 h ; 4 s | popup.js:1494, 1588 | popup |

Délais internes, jamais affichés :
- JOB_DELAY_MS 8 s + 0 à 12 s entre deux jobs (config.js:22-23).
- REPUBLISH_ESPACEMENT_MS 2 min entre deux gestes de republication.
- PUBLISH_GRACE 2 h et REPUBLISH_GRACE 12 h avant de chercher une vente.
- SALE_CHECK_MIN_INTERVAL_MS 2 h entre deux vérifications d'une annonce.
- MAJ_VERIF 2 h entre deux vérifications de mise à jour.
- VEILLE_COMMANDES 10 min.
- REPUBLISH_AUTO_ECART 24 h (en mémoire Chrome, pas en base).

## Ce que le popup affiche quand il n'y a rien

**Sans session FillSell**
- Pastille « Se connecter ».
- Bandeau, ligne de vie, ligne d'éveil, Plateformes, En cours, En attente, Pourquoi ça attend, Aussi en file et numéro de version sont masqués.
- L'en-tête « Prête à publier » reste visible, au-dessus de la carte « 🔐 » « Connecte-toi pour voir ta file » / « Ouvre fillsell.app et connecte-toi : l'extension récupère ta session. » / « Se connecter → » (l.1186-1192).
- Pied : « 0 en file », « Historique », « Ouvrir l'appli ».
- La carte « Changer de compte FillSell ? » peut quand même apparaître (bascule lue avant la session).

**Session valide, aucun job**
- Pastille « Active » (« Connectée » si aucun poll encore, « En veille » au-delà de 60 min).
- « Dernier passage il y a X · prochain dans 2 min ».
- Carte « 🪄 » « Aucune annonce à publier » / « Crée-en une dans FillSell, elle apparaîtra ici prête à diffuser. » / « Créer une annonce → » (l.1194-1201).
- « En attente » : « Rien n'attend ton intervention ».
- « 0 en file » ; « v0.6.114 ».

**Aucune plateforme connectée**
- Lignes « Connecte-toi à {X} sur cet ordinateur » + « Ouvrir {host} » (vérité `a_connecter`), ou « Session fermée ».
- Bandeau « {n} plateformes ont besoin de toi », sans « · les autres continuent » ; pastille « Ralentie ».
- Si rien n'a jamais été mesuré : chaque ligne « Pas encore vérifié » + « Vérifier », aucun bandeau.

**Lecture serveur en échec (`lectureOk=false`)**
- « Aucune annonce à publier » et « 0 en file » s'affichent quand même ; seul « En attente » est masqué.

## Constats
1. popup.js:773 compare un nombre à l'objet `SESSIONS.FRAICHEUR_MS` : le pied « Vérifié il y a X » (l.1093-1095) ne s'affiche jamais.
2. « Prochaine recréation vers HH:MM » (l.1405-1413) prend le plus petit `next_action_after` de tous les republish, quelle que soit l'étape. Le libellé et l'explication « quelques minutes » sont faux pour une capture, une boutique ou une restriction de 1 à 6 h.
3. La phase live `retry` (et `needsUser` ré-armé) s'affiche « Échec » alors que le job est `pending` avec « Reprise automatique dans ~X min ».
4. Le suffixe de `rearmBounded` s'ajoute à des textes qui promettent déjà « au prochain passage » ou « un peu plus tard » : deux délais différents dans le même message. Il s'ajoute aussi à des consignes manuelles (« supprime-le… puis relance », « publie-le à la main »).
5. Des promesses de reprise sont portées par un `needs_user` sans reprise (bg:4736) ou par un `failed` (photos, beebs.js:3801/4416, bg:22482).
6. Des jobs `cancelled` portent « Annonce en cours de republication… » (bg:24018, 25161).
7. Une quinzaine d'écritures `pending` sans texte, avec échéance : l'app affiche une heure « essai auto » sans cause.
8. Délais réels non dits : attente de session (3 min à 6 h), restriction de vente (1 à 6 h), retenue hors ligne (30 min).
9. Formats incohérents :
   - « ~720 min » côté Beebs contre « ~6 h » ailleurs ;
   - deux fonctions de temps relatif dans le popup (bascule en jours à 36 h pour l'une, 24 h pour l'autre) ;
   - « Suppression leboncoin non aboutie » affiche la clé brute de la plateforme (bg:26210).
10. « Chrome » est codé en dur dans ebay.js, leboncoin.js et beebs.js, alors que le background utilise `navigateurCourt()`.
11. Le commentaire « six fois sa cadence » de config.js n'est vrai que pour Vinted : 3 h = 3 × 60 min pour les autres.
12. Code dormant : bg:12680 (relevés) ; Opla inatteignable depuis le 10/10 ; `messageAutorisationOpla/Depop` (bg:10839, 11150) jamais appelées.