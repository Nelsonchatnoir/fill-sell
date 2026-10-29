# Lot A — stabilité : fermer tous les bugs ouverts (29/10/2026)

Consigne de Nico (29/10 ~13:30) : 14 points, preuve d'abord, déblocage serveur, correctif racine, test réel, commit.
Heures de Paris. Enquêtes en lecture seule menées en parallèle (points 2-4, 3, 5, 6-7, 8-9, 10, 11-13, 14), correctifs
intégrés, testés et livrés depuis le terminal principal. Livraison : voir la fin du rapport.

## 1. Leboncoin : « dépôt fait mais cru raté »
- **louis (Business) — OUI, un dépôt créé et cru raté, sans doublon** : la recréation de « Rangement Noir et Vert Pomme »
  (68e39f7c) s'est arrêtée à 09:22 SUR `/deposer-une-annonce/options` (« Leboncoin a refusé l'accès à la page ») ;
  Leboncoin avait CRÉÉ l'annonce 3297429776 à l'adsubmit mais ne la met en ligne qu'après le choix de l'option : elle
  est restée « inactive », sans date de mise en ligne, puis désactivée (page publique 410 relue au navigateur). La garde
  `recreation_deja_partie` a tenu (question, aucun redépôt) mais la question ne se tranchait jamais seule.
  **Racine** : `depotInacheveLbc` — un dépôt inachevé (jamais vu en ligne, sans date de mise en ligne, apparu pendant un
  essai arrêté sur /options sans confirmation) ne retient plus le redépôt ; une annonce en vérification (option choisie)
  n'est jamais visée. **Débloqué** : handler-watch v144 l'a relancée à 14:12:08 → **3297610395 en ligne à 14:13**
  (relu au navigateur : « active »), 3297429776 toujours désactivée → une seule copie.
- **thecloset72000 — NON** : aucun dépôt fait par l'extension. Les 2 jeans (Lee FR 50, Teddy Smith jegging) se sont
  arrêtés 9 fois à l'étape photos/critères (« Le wizard n'est pas passé à l'aperçu », sonde des critères muette 4 s —
  5 jobs Vêtements du parc, tous dans ce cas, tous annulés) ; le vendeur les a publiés lui-même (Lee à 00:11 pendant un
  essai, Teddy à 11:07 juste après l'abandon) et le relevé les a rattachés (3297320426, 3297493974, une copie chacun).
  **Racine** (extension 0.6.153) : un job qui porte des critères attend 15 s leur rendu ; seconde passe aussi sur un
  formulaire de particulier ; un wizard bloqué dit sa page (titres, critères, boutons). **À vérifier au prochain check** :
  le prochain jean de thecloset72000 publié en 0.6.153 (session Leboncoin fermée dans le navigateur de test : pas de
  reproduction réelle possible d'ici sans une connexion faite par Nico).
- **ornellaracano — NON** : la plante (64da7249) n'a jamais été déposée (arrêt aux photos) : sa photo 2 venait de Vinted
  et n'existe plus (404 lu par le serveur à 07:54 et 07:57, refus au navigateur). **Racine** : `_shared/photos-mortes.js`
  (photo 404/410 retirée de la copie du job, message clair, fiche intacte). **Débloqué** : relancée à 14:12:04 →
  **3297610825 en ligne à 14:13** (2 photos).
- **boncoin59300 — dépôts confirmés, refusés par la modération** : manteau fourrures (3295898405) et Nike Air Jordan
  (3295940657) : adsubmit 201 + « Votre annonce est publiée », jamais vus dans « Mes annonces » (relevés complets du 28/10
  20:59 et 29/10 07:22), pages publiques 410. Refus de Leboncoin : pas de redépôt (même contenu, même refus).

## 2. Samsung de Thibault (Premium), hors ligne depuis le 25/10
- **Cause prouvée** : la capture 18142 portait tout (model `{type: other, collection_id: 2}`, internal_memory_capacity
  [1292], sim_lock [1313]) ; le serveur ne sert que les ids bruts et l'extension relisait leurs libellés sur le formulaire
  — sur les menus « bloom », la liste ne s'ouvre pas au `click()` : stockage vide, modèle introuvable → 400 de Vinted
  (« model », « internal_memory_capacity »), puis la question. Le simlock partait « Non » d'office (l'original : « Oui »).
- **Test réel** (compte Vinted de Nico, 29/10 ~14:20) : formulaire « Téléphones portables » relevé (Modèle =
  `model-select-input` bloom, « Autre/Inconnu » = model-2 / model-1 ; 1292 = « 256 Mo », 1313 = « Oui ») ; envoi intercepté
  puis annonce de test 999 € **10582889236** publiée avec `model: { metadata: { collection_id: 2 } }` posé par la sonde :
  relue chez Vinted exactement comme l'annonce d'origine (model other/2, 1292, 1313, état 3), puis supprimée (404).
  Vinted exige désormais aussi la Couleur sur ce rayon (Thibault : Noir, déjà sur la tâche).
- **Racine** (extension 0.6.153) : la recréation remet modèle et attributs d'origine par leurs identifiants au POST
  (jamais par-dessus le formulaire, rayon de la capture seulement) ; plus de « Non » d'office ; listes ouvertes par vrai
  clic. **Remise en ligne** : la question repart seule, une fois, dès que le poste de Thibault a la 0.6.153 (cause
  `vinted_attributs_origine`, handler-watch). Rien deviné, aucune IA.

## 3. Catégories fausses ou refusées
- **Ianis Martin** : pas de pose silencieuse — ses rayons absurdes sont des CHOIX dans une question qui proposait des
  rayons que l'IA avait refusés (« Tops peplum » pour un top case : la règle 👕 `\btops?\b` ; « Romans pour adultes »
  pour un phare : 🏍️ n'a aucun rayon). **Racine** : jamais de rayon refusé (ni voisin) en puce ; « aucune » de l'IA =
  question sans puces → plateforme écartable ; bouton « Pas sur <plateforme> » ; « Top case » = 🏍️ ; le rayon choisi ne
  devient l'objet de l'article que si le titre ne nomme rien. Ses annonces en ligne dans un mauvais rayon (Vinted
  10539835953, 10539893779 ; Beebs 34239426 en ligne) : à lui signaler, rien corrigé à la main.
- **remialbertholl** : ses 5 boutons de manchettes sont PUBLIÉS aujourd'hui (01759ccd, a446d660, 07f5c23c, 1cb28a66 →
  10581813865, c8595c76) grâce à SA réponse « Bijoux », pas grâce au repli 0.6.152 : **repli non prouvé, remplacé**. Le
  libellé « Jewellery » venait de l'API Vinted (anglais servi le 28/10, « Bijoux » depuis). Nouveau repli (0.6.153) : au
  niveau qui échoue, l'option `#catalog-<id>` (présente sur les menus bloom, relevée le 29/10) donne le libellé affiché ;
  la raison d'un échec part dans le diagnostic.
- **camille.ferren** : Leboncoin n'a rien retiré — le pré-vol n'avait pas LU la page de catégorie (« ni suggestion ni
  sélecteur ») et le moteur l'a pris pour un refus. **Racine** : seul un refus prouvé entre dans le moteur
  (`_shared/rayon-refuse-moteur.js`). **Débloqué** : `scripts/reparations/20261029_camille_calendrier_categorie_origine.sql`
  (catégorie d'origine « Loisirs › Loisirs créatifs », relancée après le déploiement).
- Parc : 2 jobs bloqués sur une catégorie (camille ; mele.marta en page italienne, repart avec la 0.6.152 servie).

## 4. Levi's de Dayane (Business)
- Tout est encore là : fiche 1791926974839005 (stock), 16 photos dans le stockage FillSell, titre, description, prix
  19,99, rayon Jeans coupe droite (homme), Levi's / 44 / Bon état / Bleu Marine / colis, lus sur l'annonce le 26/10.
  **Recréable sur Beebs sans rien inventer.** Seule inconnue : l'article est-il encore à vendre (annonce Vinted d'origine
  supprimée le 26/10, aucune vente enregistrée) → la question posée le 28/10 reste ; « Relancer » suffit (poste 0.6.152).
  J157 (Beebs 34078467) est un autre exemplaire (photos à 31 bits au moins).

## 5. Signal de présence figé pendant le travail
- **Cause** : seul get-pending-jobs stampe `extension_last_seen_at`, une fois par CYCLE ; un cycle tient le verrou
  jusqu'à sa dernière tâche (Johan 27/10 : 11:37 → 12:13 sans un signe). handler-watch (10 min) a remis en file un job EN
  COURS avec « ton ordinateur ou Chrome s'est arrêté » ; l'alerte orpheline ne regardait jamais la présence (55 alertes en
  7 jours, 45 recréées sans intervention ; PC éteint : alerte quand même).
- **Racine** : battement `rpc/battement_extension` (extension 0.6.153, toutes les 5 min pendant un flux, borné) ;
  handler-watch ne reprend jamais un job sur lequel un poste bat ; l'alerte ne part pas pour un poste éteint, revenu
  depuis < 30 min ou occupé ailleurs. Migration `20261029150000_battement_extension` APPLIQUÉE (feu vert de Nico) ; les
  battements arrivent avec la 0.6.153. **À vérifier au prochain check** : plus d'alerte orpheline pour un poste éteint.

## 6. Bordereaux : couper la récupération automatique
- **a)** Vinted seulement, Pro/Business : étiquette « à obtenir » → FillSell la COMMANDE chez Vinted
  (`PUT /transactions/<id>/shipment/order`) puis récupère le PDF ; étiquette déjà prête → simple lecture. Leboncoin et
  Beebs : codé mais fermé par le serveur ; Depop : pas de bordereau ; eBay : jamais. thecloset72000 : 4 lectures (28/10
  12:39), 2 générations (28/10 21:35, 29/10 09:41) — celles où il n'a plus vu le nom de l'acheteur.
- **b)** Réglage « Bordereau automatique » (Réglages › Bordereaux), `platform_settings.bordereaux.auto` (absent = activé),
  toutes plateformes ; désactivé : rien n'est généré ni récupéré, le bouton « Bordereau » reste. Aucun bordereau effacé,
  aucune donnée d'acheteur en plus. Migration `20261029151000_bordereau_auto_par_compte` APPLIQUÉE (feu vert de Nico).
- **c)** Coupé chez thecloset72000 à 14:55 (`platform_settings_fusionner`, effectif depuis la migration de 15:00 : relu
  `bordereau_auto_actif` = false). **À vérifier au prochain check** : sa prochaine vente ne crée aucune demande automatique.

## 7. « À expédier » : commandes plus relues
- **Cause** : le poste ne suivait que les 20 commandes en base changées le plus récemment (`maj_le` ne bouge que si la
  commande CHANGE) : une commande inchangée sortait des 20 puis de la 1re page Vinted et n'était plus jamais relue ; en
  bêta, une liste de conversations illisible sautait les commandes. 47 « à expédier » inchangées > 24 h (22 Dayane,
  18 Ornella…).
- **Racine** (extension 0.6.153) : toutes les commandes en cours suivies (100, la plus anciennement changée d'abord),
  5 détails par passage (cadence inchangée) ; seule une vraie alerte de blocage arrête le passage. Statuts Vinted 440/445
  (« waiting ») non touchés (jamais deviné). **À vérifier au prochain check** : les commandes de Dayane et d'Ornella
  passent à leur vrai statut avec la 0.6.153.

## 8. Beebs : vérification et suppressions
- Parc : 9 retraits, 21 republications en attente, 4 questions ; aucun processing, aucun failed nouveau.
- **Restait** : retrait sans numéro (XEWER « Hitman ») réécrit 26 170 fois en 52 h, jamais tranché (Beebs exclu du juge
  des relevés) → Beebs jugé comme les autres après 7 jours, aucune ligne inchangée réécrite (get-pending-jobs). Marqueur de
  refus périmé (XEWER 99571727) et numéro refusé remis « published » (6a38d0b6) → un refus vaut pour SON numéro, jamais une
  remise en ligne finie (`beebs-sortie-verification.js`, `republication-finie.js`) ; réparation
  `20261029_xewer_refus_beebs_revenu.sql`.
- Relu au navigateur (29/10 ~14:45) : 34235144, 34235281, 34228605, 34249415, 34234780, 34140079 (XEWER), 34219819
  (Sébastien), 34239441 (Ianis), 33911382 (Joe), 34083555 et 34082655 (Dayane, « en vérification » depuis le 30/09) : **404,
  aucune achetable**. En ligne : 34209392 (Johan, Veste Adidas), 34239426 (Ianis), 34245064 / 34246760 (autres articles).

## 9. Relevé Leboncoin : « Mes annonces n'a pas rendu sa liste »
- **Cause prouvée** : la session Leboncoin de ces Chrome est FERMÉE (20 runs sur 30 jours, 5 comptes : tous « jeton non
  renouvelé (session_fermee) ») ; le renvoi vers la connexion arrive après le coup d'œil sur l'adresse, et le relevé
  sortait « échec » anonyme. **Geste des personnes** : se reconnecter à Leboncoin dans Chrome (nadegemarcelin78,
  annehelene.reve, poste de Nico).
- **Racine** : extension 0.6.153 (session fermée = mur de connexion, « Connecte-toi ») + app (les runs déjà en base disent
  « Connecte-toi à Leboncoin »). Garde-fou vérifié en prod : un relevé incomplet ne date rien « disparu » (0 sur 477
  `disparu_le` des 3 derniers jours).

## 10. Erreurs « insertBefore » (mele.marta)
- Écran Stock (bloc Synchroniser), page traduite par Google Traduction (Chrome italien, profil fr) : React insère devant
  un nœud texte remplacé par un `<font>` → racine démontée, écran blanc (6 fois le 28/10, puis 6 rechargements à la main).
  Même cas : pedrobaylina (Porto) le 27/10. **Racine** : garde du DOM (plus de plantage), journal enrichi (pile,
  composants, langue). Traduction laissée permise : décision de Nico.

## 11. Impayés qui gardent leur palier
- **Cause** : Stripe `past_due` comptait comme payé (règle du 25/07) et le recalcul ne se faisait que sur
  unpaid/incomplete_expired. Romain Colson : past_due depuis le 19/10, 5 échecs, toujours Pro. **Racine** : impayé =
  gratuit sur tous les canaux (Stripe : active|trialing seulement, recalcul à chaque changement de statut ; Google : la
  période de grâce coupe aussi ; Apple : déjà le cas) ; le palier revient seul au paiement ; le mail d'échec ne dit plus
  « reste actif ». Comptes concernés : 1 (Romain Colson) — réparation `20261029_impaye_stripe_palier.sql` après
  stripe-webhook. Offerts, Nico, Ornella et résiliations encore payées non touchés.

## 12. Alerte « paiement non enregistré » sur un remboursement
- La voidedPurchaseNotification Google (boncoin59300, GPA.3369-1510-4339-09469, 10:04) tombait dans « le client a payé ».
  **Racine** : alerte « ↩️ Remboursement » (Google voided, Apple REFUND/REVOKE), compte retrouvé par le jeton d'achat
  (profil, empreinte du journal, appAccountToken ou originalTransactionId). Le droit reste retiré par REVOKED/EXPIRED.

## 13. Plafond de mails
- Le refus venait de la fonction `envoi-ponctuel` (toutes les lignes `email_logs` comptaient). **Racine** :
  `_shared/plafond-mails.js` — les mails de vente (`vente:*`, `ventes_du_jour`) ne comptent plus dans les 2 mails par jour.

## 14. eBay : anciennes API
- Le mail du 27/10 n'est pas dans la boîte reliée (compte développeur eBay sur une autre adresse : à transférer).
- FillSell n'appelle que la Trading API XML (`ws/api.dll`) ; aucune Shopping/Finding. **Seul appel à date de retrait :
  `GeteBayDetails` (modes d'envoi, `_shared/ebay-shipping.ts`) — retrait le 15/03/2027**, remplaçant Metadata
  `getShippingServices` (même jeton a priori, effort faible). Les autres (GetUser, GetMyeBaySelling, GetItem,
  EndFixedPriceItem/EndItem, ReviseInventoryStatus, GetMyMessages, GetMemberMessages, AddMemberMessageRTQ) n'ont aucune
  date. Bascule proposée, non appliquée : (a) Metadata avant fin 2026 ; (b) décision de Nico sur une nouvelle connexion
  eBay pour tous (commerce.message, identity) avant de migrer messagerie et identité ; (c/d) Message API et Listing API
  ensuite.

## Contrôle final (29/10 ~15:00) — comptes à extension vue en 7 jours, dernier état par article × plateforme depuis le 18/09
- Aucun job « processing » de plus de 20 min ; aucun job à 5 tentatives ou plus ; le retrait Beebs « Hitman » qui tournait
  (26 598 observations) est clos.
- Rouges restants = gestes de la personne (vendeur Depop 12, eBay vendeur inactif 12 / à finir 5, connexions Leboncoin 4 /
  Vinted 2, plateforme écartée, article vendu, accès Depop) ; refus de plateforme (Beebs : 29 refusés à la vérification ou
  jamais en ligne — 20 numéros relus en 404 au navigateur ; Leboncoin : 9 refusés à la modération ; eBay : compte bloqué ;
  Leboncoin sans option gratuite ×2) ; questions vraies (Âge / Alimentation Beebs, frais de port Depop, ISBN, taille de
  bague, Levi's de Dayane, Sweatshirt GAP).
- De notre fait, avec issue automatique : Vinted « menus bloom » ×9 + 1 (abenjemaa, labouquinerie85, chaowx1305, postes
  encore en 0.6.149 : repartent seuls à la 0.6.150+, la 0.6.152 étant servie ; rien d'autre ne les bloque) ; Samsung de
  Thibault (0.6.153) ; page italienne de mele.marta (0.6.152).
- Suite complète : 485 selftests verts (dernière passe sur l'arbre final) ; `npm run build:essai` vert ; lint : aucune erreur
  nouvelle sur les fichiers touchés.

## Livraison (29/10 ~14:50 → 15:00)
- Commits : `f3d158b` (correctifs), `332cb1f` (EXTENSION_LAST_COMMIT), `1c4a578` (version 2.9.132), puis les docs ; un push.
- **Extension 0.6.153** : `build\CWS-0.6.153-A-TELEVERSER\fillsell-extension-0.6.153-1c4a578-cws.zip` (seul dans son
  dossier ; manifest 0.6.153, BUILD_ID `2026-10-29T13:49:28Z+1c4a578`, 37 entrées + dossiers, 605 027 octets, sha256
  `5d45d60a41704c3ddb71aa1049647bcc321c91d7c67f4b1d20e43563a3c0b173`). 0.6.152 → ALREADY_PUBLISHED. Poste de Nico : copie posée.
- **OTA 2.9.132** (canal production relu 2.9.131 → 2.9.132), build `2026-10-29T13:50:19Z+1c4a578`.
- **Fonctions** : handler-watch v145, get-pending-jobs v300 (true), update-job-status v155, stripe-webhook v60,
  google-play-webhook v31, apple-iap-webhook v40, email-tunnel v74, envoi-ponctuel v5 (true) — verify_jwt inchangés.
- **Réparations** (14:55, ce terminal) : `20261029_camille_calendrier_categorie_origine.sql`,
  `20261029_xewer_refus_beebs_revenu.sql`, `20261029_impaye_stripe_palier.sql`, `20261029_thecloset_bordereau_auto_coupe.sql`.
- **Migrations APPLIQUÉES** (feu vert nommé de Nico « Feu vert les deux », ~14:59) : `20261029150000_battement_extension`
  (14:59:59) et `20261029151000_bordereau_auto_par_compte` (15:00:03), `migration repair` fait, corps et droits relus ;
  thecloset72000 : Bordereau automatique coupé (relu false), ses 6 bordereaux déjà récupérés gardés.
- **Décisions de Nico** : traduction du navigateur dans l'app (point 10) ; bascule eBay (point 14 b) ; libellé du mail
  « paiement échoué » sans « reste actif » (point 11).
