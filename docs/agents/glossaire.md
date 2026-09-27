# Glossaire FillSell — les mots du projet et ce qu'ils désignent dans le code

> Référence pour agents de code, appelée par `AGENTS.md` (racine). Rédigé le 27/09/2026.
> Se périme : la base de prod, `git log` et les outils font foi, jamais ce fichier.


| Mot | Ce qu'il désigne dans le code |
|---|---|
| **fiche** / **article** | Une ligne de `inventaire` : l'objet du vendeur. Une fiche porte plusieurs annonces (une par plateforme). |
| **annonce** | L'objet publié sur une plateforme ; côté base, un job `cross_post_jobs` avec `listing_url` / `platform_listing_id`. |
| **job** | Une ligne de `cross_post_jobs` : une action (`publish`, `republish`, `delete`…) pour une fiche × une plateforme. |
| **dépôt** | Publication d'une annonce par l'extension (job `publish`). |
| **retrait** | Suppression d'une annonce sur la plateforme (job `delete`). |
| **republication** | Retrait puis redépôt pour remonter l'annonce (Opla : modification en place). Repose sur une **capture**. |
| **capture** | Instantané complet de l'annonce en ligne (photos, champs) pris avant la republication, pour pouvoir la recréer à l'identique. |
| **relevé** | Lecture de toutes les annonces en ligne d'un compte sur une plateforme (`vinted_sync_runs`, toutes plateformes malgré le nom). Vinted : « sync dressing » (`handler_build` ~ `sync-dressing`) ; ailleurs : `releve-annonces`. Un relevé peut être **incomplet**, **vide** ou **hors liste** : alors il ne prouve rien. |
| **import** | Création d'une fiche + job synthétique pour une annonce relevée qui n'avait pas de fiche. |
| **rattachement** | Lier une annonce relevée à une fiche existante, sur preuve certaine (identifiant, lien connu, dépôt FillSell). |
| **jumeau** / **fiche jumelle** | Deux fiches qui pourraient être le même objet. Jamais fusionnées d'office : paire « Est-ce le même article ? » (`doublons_*`, `rapprochement_*`). Des annonces identiques peuvent être de vrais exemplaires. |
| **doublon** | Deux annonces en ligne pour le même objet sur la même plateforme (ce qu'on ne doit jamais créer). |
| **garde** | Contrôle volontaire qui empêche un geste (ex. `garde_boutique`, garde Livres, garde « requis de la destination »). Une garde ne se relance pas. |
| **boutique** | Un compte vendeur sur une plateforme ; Vinted peut en avoir plusieurs par compte FillSell (`vinted_account_id`). **boutique étrangère** = le navigateur est connecté à une autre boutique que celle de l'annonce. |
| **mur** | Obstacle posé par la plateforme : page de connexion, anti-robot (Vinted 403, DataDome Beebs), permission Opla (« Autoriser ») ou session Opla fermée (« Me connecter »). Noté par poste (`mur_<plateforme>`). |
| **sonde** | Lecture de l'état de session de chaque plateforme par l'extension, écrite dans `profiles.extension_sessions` (et l'identité de la boutique). Elle tranche, pas le texte d'une page. |
| **poste** | Un profil Chrome qui porte l'extension ; un compte peut en avoir plusieurs (`extension_postes`). |
| **parcage** | Mise en attente d'un job (`next_action_after`, marqueur dans `platform_fields`, `needs_user_source` p.ex. `connexion`) jusqu'à une preuve (session revue bonne, relevé réussi) ou une date. |
| **retenue** | Job gardé côté serveur sans être servi à l'extension (`get-pending-jobs`), sans écriture sur le job. |
| **veilleur** | Surveillance : côté extension, `checkPublishedListings` (état des annonces) ; côté serveur, `handler-watch` (jobs figés, relances). |
| **balayage** | Tâche cron qui repasse sur un lot (ex. `doublons-balayage`, `republish-auto-sweep`, le balayage de nuit des dépôts sans lien). |
| **créneau** | Plage horaire où l'extension a le droit de republier (par boutique). |
| **stepper** | L'écran de publication pas à pas de l'app (photos → champs → plateformes). |
| **rayon** | La catégorie d'une plateforme (arbre Vinted, Leboncoin, eBay, Beebs, Opla). **étagère** : le niveau de catégorie Vinted qui sert à déduire celle d'Opla. |
| **palier** | Gratuit / Premium / Pro / Business. **quota** : ce que le palier autorise par mois (jamais « pépites »). |
| **needs_user** | Statut d'un job qui attend un geste de l'utilisateur ; toujours avec `needs_user_source` et un écran. |
| **pas-de-rouge** | Doctrine du 22/09 : jamais `failed` pour une cause qui n'est pas la nôtre ; rouge = notre faute, orange = geste utilisateur, blanc = plateforme. |
| **handler** / **`handler_build`** | Le module de l'extension qui traite une plateforme, et la chaîne qui dit quel build a traité le job. |
| **empreinte** / **BUILD_ID** | Horodatage + hash du commit embarqué (app : `build.json` ; extension : `BUILD_ID`). |
| **OTA** | Mise à jour à chaud de l'app mobile par Capgo (canal `production`). |
| **CWS** | Chrome Web Store. **MIN_BUILD** : build minimal en deçà duquel l'app dit « mets à jour ton extension ». |
| **rejeu annulé** | Exécution d'une migration dans une transaction terminée par `ROLLBACK`, pour montrer son effet avant le GO. |
| **GO** | Validation explicite de Nico, qui nomme la chose validée. |
| **ops-digest** | Le rapport quotidien de 8h50 (fonction `ops-digest`) : anomalies de la veille. |
| **Lens** | L'identification d'objet par photo. |
| **FillSell Cloud** | L'extension exécutée dans un navigateur cloud (prototype). |
