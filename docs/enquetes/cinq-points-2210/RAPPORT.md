# Cinq points du 22/10 — Leboncoin, retraits, Opla, tailles, app bloquée

Heures de Paris. Commits `01c2437` (code) et `2647cbe` (extension 0.6.129, app 2.9.108). Migrations appliquées sur
feu vert nommé de Nico : `20261022100000_opla_plus_rien` (11:09:07) et `20261022110000_leboncoin_achat_en_cours_vente`
(11:09:18), corps relus en prod après application (md5 identiques au fichier). get-pending-jobs v266 → **v267**
(11:12:42, `verify_jwt` true avant/après, 105 appels en 200 ensuite). OTA **2.9.108** (canal relu). Extension
**0.6.129** empaquetée (chemin plus bas). Selftest `npm run selftest:cinq-points-2210` (69 contrôles) ; essais en base
`scripts/essais/20261022100000_essai.sql` (28/28) et `20261022110000_essai.sql` (30/30), en ROLLBACK.

## 1. Leboncoin : « Achat en cours » = vente

**Cause.** Le relevé Leboncoin (API du tableau de bord) lit pour chaque annonce `attributes.transaction_status`
(`pending` « Achat en cours », `sold` « Vendu »), mais ne décidait que sur `status = active` → « en ligne » ; l'attribut
ne survivait que dans un échantillon de captures que personne ne lisait. La liste des transactions classait `ongoing`
en « inconnu » et n'écrit une vente qu'au « done » (≈ 11 jours plus tard, sans numéro d'annonce, donc sans retrait).
CD (capture 21/10 16:34 « pending ») et VHS (22/10 08:05 « pending ») : rien jusqu'à la déclaration à la main.

**Correctif (règle, tout le parc).** La lecture `pending` ou `sold` est la preuve de vente sur le numéro EXACT : preuve
posée sur LE job Leboncoin publié de ce compte → le cron des ventes prouvées enregistre la vente « Leboncoin » →
retraits ailleurs. Jamais l'annonce Leboncoin retirée ; fiche déjà vendue (déclarée) = rien, jamais deux ventes ;
plusieurs exemplaires, deux jobs, pas de job = rien (trace). Seule une transition agit. **Achat annulé** (relue en
ligne sans transaction après `pending`) : vente née de la preuve retirée (jamais une saisie), fiche au stock, retraits
encore en file arrêtés, copies déjà retirées remises en vente (`remises_en_vente`, ses gardes), job rouvert. `sold` →
plus rien : on ne conclut pas. Autre valeur : trace seule. « Vendu » (transaction terminée) : aucune note ni mail ;
« Achat en cours » : la règle mail commune. Extension 0.6.129 : la transaction de CHAQUE annonce part au relevé, et une
commande Leboncoin neuve (veille 10 min, comptes payants) fait relever « Mes annonces » dans le cycle.

**Preuve.** Essai 30/30 : parcours réel sur une fiche de Sébastien (pending → preuve → vente « leboncoin » → retrait
Vinted armé → annulation → vente retirée, retrait arrêté, job rouvert → nouvel achat réenregistré), gardes, note de
vente, rejeu 30 j en fantôme (153 lectures : 52 auraient prouvé, 43 déjà vendues, 57 sans job FillSell, 1 plusieurs
exemplaires ; 0 job modifié), relevé de 381 annonces réécrit en 210 ms. **Rattrapage** (feu vert, 11:22:43,
`scripts/reparations/20261022_leboncoin_achats_en_cours_existants.sql`, sauvegarde `_backup_2210_lbc_achats`, inverse
prêt) : 18 ventes (lectures < 72 h), 8 retraits armés ailleurs. ⚠ **Un mail est parti** (11:22:47, vincent.marie.1316n,
« Jeu d'échecs en verre », vraie vente lue « Achat en cours » le 19/10) : sa note datait du 21/10 et le classement ne
visait que les notes nées dans la transaction — corrigé dans le script.

**Signal équivalent ailleurs.** Vinted : commande payée = vente (déjà) ; `is_reserved` = réservation du vendeur, pas un
achat. eBay : PAID = vente (déjà). Depop : PURCHASED = vente (déjà). Beebs : `WAIT_SELLER_CONFIRM` = vente
(`commandes_beebs_noter`) mais l'interrupteur `ventes_beebs_commandes` est à 0 (fantôme). Leboncoin était la seule
exception.

**À décider.** (a) Allumer `ventes_beebs_commandes` (Beebs : achat = vente, en fantôme depuis le 18/10). (b) 35 annonces
lues « pending/sold » il y a plus de 72 h, fiche en stock : la règle ne les verra pas d'elle-même (même valeur relue) —
relancer le même script quand la 0.6.129 les aura relues, ou faire compter la première lecture de la colonne. (c) Mail
« Vendu » au `pending` (aujourd'hui) ou seulement à la commande terminée.

## 2. Retraits bloqués sur des articles vendus

**Causes.** (1) Aucune borne : un retrait d'article vendu sans « mur » nommé n'apparaissait nulle part. (2) DeadRoz
53cff028 (Beebs 34083555) : en vérification chez Beebs depuis le 01/10 ; **vérifié le 22/10 dans le Chrome de Nico :
l'onglet « En cours de vérification » n'offre aucun geste (ni Supprimer, ni Modifier)** et la page publique est en 404 —
impossible de la retirer, et elle n'est pas achetable. DeadRoz ecd27eef (Beebs 34083968) : la suppression part, Beebs
la garde (invisible au public depuis le 06/10) ; motif non lisible. (3) XEWER : le « pas le numéro » était déjà clos
(03:31) ; 3018f0d5 et 2b454bb6 en modération Beebs, absentes des relevés. (4) Tech-t : extension muette depuis 08:30,
eBay révoqué le 06/10 (pas de voie API). (5) Sébastien : son réseau (point 5).

**Correctif.** Au-delà de 24 h, le retrait d'un article vendu qui n'aboutit pas devient une ligne « À régler » qui dit
quoi faire (Beebs en vérification : pas achetable, Beebs ne permet pas la suppression, FillSell la retirera dès sa mise
en ligne, sinon le support Beebs ; autre cas : « retire-la toi-même », FillSell continue) ; un mur plus précis
(ordinateur, connexion, boutique) passe avant. get-pending-jobs v267 retrouve un numéro manquant par l'annonce que le
relevé du compte a liée au dépôt exact (jamais la fiche ni le titre — règle du 11/09). Aucun retrait sur un article non
vendu (32/33 avec vente ; le 33e est demandé par la personne).

**État des annonces (relevés).** DeadRoz 34083555 en vérification (relevé 21/10 19:11) ; 34083968 absente du public,
présente côté vendeur. XEWER 34198202 / 34198337 absentes. Tech-t Leboncoin 3290546187 et eBay 147615440902 **en ligne**
(relevé 21/10 18:28). **Sébastien : ses 3 retraits sont repartis à 10:33-10:34 et faits** (Vinted 10413938754 et
10467104646 : API delete HTTP 200 ; Leboncoin 3291609964 : retirée), relu à 11:25.

**À décider.** Les 2 Beebs de XEWER seront clos « déjà retirés » à 72 h (≈ 17:46 / 18:05) sans preuve : réarmer si un
relevé les revoit en ligne ? Lire la réponse de Beebs au clic (ecd27eef) = une version d'extension de plus.

## 3. Opla : plus rien

**Cause.** La garde faisait NAÎTRE le retrait Opla « cancelled » au lieu de l'empêcher ; un retrait clos ne compte pas
dans les contrôles de doublon → 2 à 4 retraits par vente ou suppression (225 depuis le 10/10, 59 chez XEWER), une ligne
« À régler » par job. Et le moteur de rapprochement v3 réimportait en fiche de stock toute annonce Opla orpheline (pas un
relevé : la garde des relevés tenait) — encore ce matin à 10:01, 4 fiches chez XEWER.

**Correctif.** Aucun retrait Opla ne naît (armer_retrait_job_pour, filet de suppression, garde, app) ; l'information
« retire-la toi-même sur Opla » est posée UNE fois sur la copie ; une annonce Opla orpheline n'est plus jamais
importée, rattachée ni proposée au rangement ; une ligne par annonce. **Preuve.** Essai 28/28 ; rejeu de 150 retraits
des 7 jours et de 25 suppressions à copies mixtes : 0 écart hors Opla ; en prod depuis 11:09 : **0 job Opla créé**, 1
copie marquée (choupette06, rattrapage du point 1). **À décider.** 10 fiches `releve_opla` nées après la sortie, en
stock (XEWER 6, dont 4 de ce matin — articles vendus ou supprimés puis réimportés ; ornellaracano, nadegemarcelin78,
angelofthedeath91, 44310spgl : 1 chacun) : les retirer du stock sans retrait ?

## 4. Tailles et états vers Beebs et Depop

**Cause (la prémisse ne tient pas).** Johan : 27 affichages sur 19 articles (54 = lignes de journal, dont 12 « éclairs »
du moteur en 0 s) ; ses fiches venaient du Lens SANS taille, la taille est sa réponse (posée 13 à 57 s après) ; son lot
de 21:37 a été arrêté par lui, aucun job pris, 52/56 Beebs avaient une taille exacte. Louis : l'état n'est pas en cause
(table juste) — le rayon « Biscuits et gâteaux » n'accepte que du neuf ; « XS / 34 » vient d'un rayon femme pour un
short 10 ans, changé ensuite sans rejuger la taille. Vrais défauts trouvés : « Compléter » écrasait la taille de la
fiche par la réponse d'une plateforme (34 fiches en 30 j, ≥ 12 pertes : « 8 ans » → « Autre ») ; Depop : pointure enfant
nue non reconnue, « EU n » non reconnu sur les grilles EUR paires ; copie Depop vide jamais comblée par la fiche.

**Correctif.** « Compléter » ne remplit qu'une case vide de la fiche, jamais « Autre » ; pointure enfant nue = « EU n »
(app + connecteur) ; « EU 38 » = « 38 » sur les grilles 9/81/40 (jamais la 62 : W ambigu, question gardée) ;
get-pending-jobs pose la taille de la fiche sur une copie Depop vide (publication), le connecteur demande si elle n'est
pas dans la grille. Taille unique du 19/10 : intacte. **Preuve.** Rejeu 30 j : pointures enfant 3 jobs, 1 change =
la réponse donnée ; copies Depop vides : 40 comblées, 0 contraire à une réponse connue ; selftests tailles verts.

**À décider.** W sur la grille Depop 62 (deux lectures humaines opposées) ; âge en années dans le texte en rayon enfant
(+4 questions levées, 0 erreur au banc) ; garde-fou Beebs « rayon neuf seulement » et public enfant/adulte du rayon ;
réparer les fiches écrasées par « Compléter » (script, sur décision) ; ne plus journaliser les « éclairs ».

## 5. App bloquée sur le logo

**Cause.** Pas le déploiement : le bundle 4c49e6f a tourné chez Sébastien de 07:29 à 08:39. Son réseau s'est dégradé
vers 08:30 (requêtes parties, réponses jamais reçues ou au bout de minutes ; propre à son adresse), et l'app attendait
chaque lecture SANS limite (`appLoading` levé à la toute fin de fetchAll), jusqu'à 6 fetchAll en parallèle. Session
saine ; son extension a sa propre session : son silence 09:05-09:25 est celui de la machine, sans lien.

**Correctif.** Toute lecture PostgREST bornée à 30 s, corps compris ; un seul fetchAll en vol ; premier chargement sans
stock : écran de reprise, jamais un stock vide présenté comme vrai ; au-delà de 15 s : une phrase, « Réessayer »,
« Recharger », nouvelle version en ligne → un rechargement, nouvel essai espacé (6 au plus), un rechargement par onglet à
45 s ; session lente : la phrase après 10 s ; nouvelle version : rechargement une fois par build distant (jamais pendant
une saisie, le stepper, un dialogue). **Preuve.** Vrai serveur HTTP local (corps qui cale → erreur au délai) et
supabase-js réel contre la prod (lecture normale intacte, Content-Range compris) ; 29 contrôles ; build vert.

## Livraison

- Extension **0.6.129** à téléverser : `C:\Users\nicol\fill-and-sell\build\CWS-0.6.129-A-TELEVERSER\fillsell-extension-0.6.129-2647cbe-cws.zip`
  (BUILD_ID `2026-10-22T09:12:49Z+2647cbe`, 37 entrées, 556 Ko ; seule dans son dossier). La 0.6.128 (servie à 94
  comptes) rangée dans `build\anciens-zips\`. Après acceptation : `ALREADY_PUBLISHED` et `EXTENSION_MIN_BUILD`.
- Suite complète : **379 / 379 jouée, 378 verts** ; seul rouge `messages-cause-vraie`, déjà rouge avant ce lot (référence sur 4c49e6f : 378 joués, 377 verts, même rouge). Un rouge apparu en cours (`beebs-lien-exact` : ma recherche de numéro passait par la fiche, interdit depuis le 11/09) a été corrigé avant le commit.
