# Terminal « Problèmes » du 12/11/2026 — trois points de Nico

Lectures en prod en lecture seule (`npx supabase db query --linked --read-only`), heures de Paris. Comptes désignés par
leur id8 (règle du 11/11).

## 1. Compte 229c7b07 (Business) — « ses lots de publications ne partent jamais » : NORMAL (son réglage)

**Cause prouvée.** Le compte a les **publications programmées** actives (`platform_settings.publication_programmee` :
`actif`, créneau **soir = 19:00–22:00**, tous les jours, sans plafond ; règle D4 du 26/10,
`_shared/publication-programmee.js`). Toute publication qu'il envoie naît `programmee` et attend le créneau, puis part
**une à la fois**, en tour Vinted → Leboncoin → eBay → Beebs → Depop.
- 10/11 : 39 programmées servies de 19:00:09 à 21:58:06, dont **13 Beebs du lot 3fd96f10** (publiées de 19:19 à 21:56) —
  « aucune jamais tentée » est inexact ; les 339 autres attendaient le créneau du 11/11 ; arrêtées par lui le 11/11 06:54.
- 11/11 : 53 servies de 19:00:55 à 21:58:55 (20 Leboncoin, 16 Vinted, 17 eBay).
- Lot 75aabd05 (375 Beebs, 12/11 06:26–06:36) : en attente du créneau de 19:00 ; arrêté par lui à 10:38. Normal.
- Vinted du 10/11 : 37 tâches portaient `restriction_compte` (restriction du compte par Vinted, posée à 19:08, jusqu'à
  minuit) → échéance 00:05, hors créneau.
- **Piste de l'espacement des républications écartée** : `republish_creneaux.intervalle_s` n'est calculé et lu que par
  `republish_planifiee_sweep` (républications automatiques : créneau ÷ max(1, prévues) — prévues = 0 donne le créneau
  entier, sans effet) ; get-pending-jobs ne le lit jamais ; la règle « option B » (`_shared/lot-manuel-creneau.js`) ne
  vise que `action = 'republish'`. Aucune programmée servie hors 19:00–22:00 ; écart réel de 2 à 6 min entre deux.
- **Parc** : une seule autre file programmée en attente, le compte 4cfb7afe (7 Beebs, même réglage « soir ») : dernière
  servie le 11/11 19:02, extension plus vue depuis 19:11 → elle attend son ordinateur. Normal.
- **À décider par Nico (rien changé)** : « une à la fois » vaut pour TOUT le compte, toutes plateformes : ~40
  publications par soir ; 375 Beebs = environ 29 soirs. Une file par plateforme (une à la fois PAR plateforme) ou un
  créneau plus large changerait la cadence — décision de Nico.

## 2. Compte 6e3d92b3 (Pro) — une vente n'a pas arrêté la republication du même article : ROUGE, corrigé

**Partirait-elle au retour de l'ordinateur ? Non** : la garde de service de get-pending-jobs v361 (« UN ARTICLE VENDU
N'EST JAMAIS PUBLIÉ NI REPUBLIÉ », fiche « vendu » ou quantité ≤ 0) la retient au premier poll, puis handler-watch
l'arrête (« sans objet ») ; 66 republications Vinted ainsi retenues puis arrêtées depuis le 29/09. Défaut : tant que le
poste est éteint, elle attend.

**Cause prouvée.** Fiche 1793119848683015 vendue sur Vinted le 11/11 à 23:06:22 par l'annonce 10563073310 (job 1eb708cc)
→ fiche « vendu », quantité 0. `enregistrer_vente_atomique` (prod, md5 d0efd535…) : retrait eBay 07d872cc armé, publication
Leboncoin 0d433112 arrêtée (reçu `annonce:vinted:10563073310`), mais la **republication Vinted fac6fdef** (09/11 00:23,
étape a_capturer, `vinted_item_id` = 10563073310, l'annonce vendue elle-même) reste « pending », sans reçu. La boucle
d'arrêt porte `AND (p_job IS NULL OR c.platform IS DISTINCT FROM j.platform)` : la plateforme de la vente est écartée
en entier. Les deux autres conditions étaient vraies (rattachement prouvé : aucune fusion, aucun rattachement
automatique ; `fiche_annonces_vivantes(…, 'vinted')` = 0). Parc : 2 tâches actives sur un article épuisé — fac6fdef (avec
sa vente) et 931a27d7 (compte ba656e5f, retenue « article vendu » depuis le 27/09, fiche « vendu » SANS ligne de vente :
reste la question, voulu).

**Correctif à la racine** (règle `docs/regles/ventes-et-retraits.md` du 12/11) :
1. la cascade (migration 20261112140000) : vente qui épuise la fiche → ses tâches non publiées de la MÊME plateforme
   s'arrêtent aussi ; une autre annonce publiée de la plateforme, une vente partielle : inchangées ;
2. la garde d'exécution (`_shared/article-epuise.js`) : update-job-status refuse le démarrage (409, retenue « article
   vendu ») ; ebay-api-worker `publier()` de même ; jamais une quantité restante, jamais un retrait ;
3. les cas existants : handler-watch (règle 3 « sans objet ») lit aussi les tâches en attente d'une fiche « vendu » avec
   sa vente — fac6fdef est arrêtée par la règle, pas à la main.

Preuves : banc sur base jetable 25/25 (décor de prod du 12/11 : 214 fonctions, 72 déclencheurs ; A défaut reproduit,
garde md5 qui refuse, B corrigé et tout le reste identique, C inverse = code de prod jeton pour jeton, D) ; verrou
`selftest:vente-arrete-meme-plateforme` rouge avant (9 rouges sur origin/main), vert après (28/28).

## 3. Compte c7c382b7 (Pro) — retrait Beebs f4367beb « sans fin » : NORMAL (borné), rien à corriger

**L'annonce existe-t-elle encore ? Pas prouvable avant le 14/11.** Faits : dépôt 85357a95 publié le 07/11 10:48, jamais
vu en ligne (`vu_en_ligne_le` nul, aucune ligne `annonces_plateforme` pour 34310672 alors que ses 20 autres annonces Beebs
sont relevées) ; page lue en 404 le 10/11 11:05 depuis son navigateur ; « Mes annonces » relue complète le 12/11 06:45
(en vérification : 0, en ligne : 20/20) → « absente ». La page publique répond 403 (anti-robot) : rien à en tirer.
Or la règle 0.6.104 / 25/10 (`beebsAbsenteParModeration`, extension) est mesurée : Beebs garde une annonce qu'elle examine
invisible des DEUX onglets. Sur les 34 retraits Beebs passés par cette attente, plusieurs annonces invisibles sont
réapparues et ont été retirées par FillSell jusqu'à ~6 jours après le dépôt (dépôt du 02/11 13:01, premier relevé le
08/11 19:12). Le 404 n'est pas une preuve : aucune donnée ne dit ce que rend la page d'une annonce en examen (les 10
retraits Beebs en 404 depuis 60 jours : aucun revu en ligne, mais un seul était en examen, celui-ci).
**La règle clôt déjà seule** : absente des deux onglets ET dépôt de plus de 7 jours → « déjà retirée »
(`annonce_deja_hors_ligne`) ; ex. dépôt du 30/10 17:36 clos le 06/11 17:36. Ici : 7 jours le 14/11 à 10:48 ; la relecture
de 12 h qui suit le close (le 14/11 vers 18:45 si son poste est allumé). La boucle (n = 680) était le défaut rouge,
corrigée le 11/11 22:40 (D1, get-pending-jobs v359). Clore plus tôt sur le 404 rouvrirait le risque du 04/10 (annonce
validée par Beebs après un retrait « fait » → en ligne alors que vendue).

## 4. Publications programmées : l'app dit ce qui va réellement partir — ROUGE (l'app se taisait), corrigé
**Cause prouvée** (point 1) : le compte 229c7b07 (créneau du soir 19:00–22:00) voyait ses lots attendre sans un mot ; la
feuille disait « elles partiront une à une dans ton créneau du soir », la file « Programmée : elle partira dans ton
créneau » — ni l'heure, ni le rythme, ni la fin. Deux comptes ont ce réglage : 229c7b07 et 4cfb7afe.
**Correctif** (règle `docs/regles/republication-et-publication.md` du 12/11) : à l'envoi d'un lot, « Elles partiront ce
soir à partir de 19:00, une à la fois. À ton rythme habituel (environ 39 par soir), la dernière devrait partir vers le
samedi 21/11. » ; dans « Ta file » : « Programmée : partira ce soir à partir de 19:00, une à la fois ». Réglage et rythme
inchangés. **Formule** : N = médiane des servies des 3 derniers créneaux pleins (14 jours au plus ; plein = dernière servie
dans les 30 dernières minutes du créneau, ou plafond atteint), borné au plafond ; fin = (déjà en attente + lot) ÷ N par
créneau sur les jours actifs. Sur les vraies servies de 229c7b07 : 8 (sous son ancien plafond), 39, 53 → 39 (la médiane des
14 jours aurait dit 8). 4cfb7afe (une seule servie, poste éteint) : aucun chiffre, « ton rythme habituel s'affichera après
un premier créneau complet ».

## 5. empreintes-urls dépasse son temps de calcul — NORMAL côté fonction, cause dans ses appelants : rapport seul
**Cause prouvée** (journaux, lecture seule) : les échecs (546, « CPU Time exceeded ») tombent pendant les RAFALES d'appels
simultanés. 24 h au 12/11 : 0 % d'échec dans les minutes à 1–3 appels, 9 % à 4–6, 25,5 % à 13–30, 27,5 % à 31 et plus ; 661
des 690 échecs dans les minutes à 13 appels et plus ; 124 arrêts du worker pour 690 réponses 546 (≈ 5,6 requêtes perdues par
arrêt : les appels simultanés partagent le worker). Les rafales viennent de nos fonctions SQL : `rapprochement_v3_empreinter`
(jusqu'à 100 appels pg_net d'un coup après « Synchroniser », 6 photos par appel quand la fonction en prend 5) et
`fusion_photo_tick` (6 appels à la fois chaque minute). La fonction elle-même est bornée (≈ 0,8 s de décodage par appel) et
inchangée depuis ff0c460 (03/11, module « maison », interrupteur à 1 depuis 10:06) : versions 11 → 19 = même code (les
autres numéros viennent des poses de secrets).
**Depuis quand** : aucun de nos déploiements. Pendant les rafales, 1,4 % d'échecs du 03/11 10:10 au 04/11 10:10 (module
maison déjà en service), 9,9 % du 04/11 12:00 au 05/11 12:00, 25–27 % les 11–12/11 — même code, même fréquence de rafales,
photos plus légères (103 ms par photo au lieu de 159) : la plateforme coupe plus tôt pour la même charge.
**Pour les clients** : rien de cassé — 0 passe de rapprochement classée sans ses photos en 24 h ; le rapprochement d'après
« Synchroniser » attend un peu plus (443 attentes d'empreintes en 24 h, relues toutes les 12 s) ; ≈ 23 % des appels perdus.
**Correctif possible (à décider par Nico, rien fait)** : borner la rafale dans `rapprochement_v3_empreinter` (par exemple 10
appels à la fois au lieu de 100, et 5 photos par appel au lieu de 6) — migration SQL, hors de cette fonction.
**Correctif (GO de Nico, 12/11)** : migration 20261112160000 (10 appels de 5 photos au plus) + fonction rapprochement
(50 photos par passe relues après 4 s, 40 relances par chaîne de photos, tolérance de 72 s gardée) ; fusion_photo_tick
inchangée. Référence avant (109 attentes de photos du rapprochement, du premier passage incomplet à la décision) : médiane
29 s ; ≤ 50 photos 26 s (p90 52 s) ; 51–180 : 63 s ; > 180 : 145 s.

## 6. Compte cfdfda6f (Business), publication Leboncoin 298e4944 bloquée — ROUGE, corrigé
**Le 5e essai** : passé le 12/11 à 14:01:31, même échec ; la tâche est tombée en « La publication n'a pas abouti après
plusieurs essais… relance-la » (needs_user, 5 essais).
**Cause prouvée** : catégorie « Animaux › Animaux » (animal vivant). Cinq traces : la page « Dites-nous en plus » ne montre
que le critère `animal_type` (ni « État » ni « Poids du colis »), « Continuer » ne passe pas. Ce que Leboncoin demande, prouvé
par l'annonce 3229105886 du même article déposée par la personne le 19/09 : type d'animal, nature de l'offre (Saillie),
animal de race, âge, date de naissance, portée, vacciné, race — des informations que seul le vendeur connaît — et
`shippable = false` : un poids de colis n'a aucun sens (le 1 kg venait du colis par défaut des Réglages). Même échec le
10/11 (c8fd2caa, annulée par la personne). Seul compte touché (2 tâches) ; la catégorie est juste pour une saillie.
**Correctif** (règle `docs/regles/plateformes.md` du 12/11) : jamais tentée — au premier passage, le geste « dépose-la
toi-même sur Leboncoin, puis Synchroniser » (ou « Accessoires animaux » pour un objet) ; la tâche existante reçoit le même
geste par handler-watch ; aucun poids posé par l'app sur cette catégorie.

## 7. Achats Google Play qui échouent (GOOGLE_NON_ACHETE) — ROUGE, corrigé (OTA) + binaire préparé
**Où l'achat casse (prouvé)** : dans la feuille Google Play, AVANT toute commande. La feuille s'ouvre (2,5 à 17 s entre
l'ouverture et l'échec, contre 49 à 81 s pour un achat payé) ; la Play Console (gestion des commandes, lecture seule)
n'a AUCUNE commande pour ces tentatives ; produits et forfaits de base actifs dans 175 pays (premium.standard
`standard-monthly`, pro.sub `pro-monthly`, business.sub `business-monthly`), prix inchangés, les 3 « + Cloud » en
brouillon ; production Android 2.9.167 / vc37, OTA 2.9.174. Le module natif (@capgo/native-purchases 8.3.3) reçoit la
réponse de Google (BillingResponseCode et son message) et la JETTE : l'app ne reçoit que « Purchase is not purchased ».
La raison exacte de ces 18 échecs n'a donc été écrite nulle part (ni chez nous, ni chez Google) : elle ne peut pas être
relue après coup. Écartés par les données : montée de palier (aucun ancien jeton dans un seul échec : tous des premiers
achats), produit introuvable (1 seul cas, 07/11, autre chemin), prix non affiché (garde du 08/11), coupe-circuit Android.
Défaut latent trouvé : l'app demandait le PRODUIT comme forfait de base (`planIdentifier` du module = l'identifiant du
produit) ; le module ne le trouvait jamais et prenait la première offre — sans effet aujourd'hui (un forfait par
produit), corrigé.
**Clients bloqués** : 8 comptes, 18 échecs, du 16/10 au 12/11 — 27399ff9 (16/10), dd636d1d (20/10), fd7bf936 (23/10),
90ace0e4 (24/10, a payé ensuite par carte), 5e78a731 (27 et 28/10), a6bbc6c3 (04/11), cfb5af8b (10 fois les 08 et
09/11, Premium, Pro et Business), 948cb329 (09/11). En face : 2 achats Google payés (26/10, 06/11).
**Correctif** (règle `docs/regles/mails-paiements-comptabilite.md` du 12/11) :
- binaire Android **2.9.176 / vc38** (patch du module ; un numéro à lui, au-dessus de l'OTA 2.9.175) : chaque refus part avec le code de Google (`GOOGLE_<NOM>`) et son
  message ; une feuille qui ne s'ouvre pas est refusée avec son code (avant : écrite au seul journal Android, l'achat
  attendait sans fin). Compilé (Gradle), PRÉPARÉ, jamais soumis sans le go de Nico.
- OTA **2.9.175** : l'app classe chaque code (déjà abonné → « Restaurer mes achats » ; indisponible sur ce téléphone →
  mettre à jour le Play Store, vérifier le compte Google ; Google qui ne répond pas → réessayer ; refus → son code à
  l'écran), toujours « rien n'a été débité » ; le binaire d'avant garde son issue, avec « vérifie ton moyen de paiement
  dans le Play Store » ; le bon forfait de base ; chaque issue tracée avec la durée de la feuille et le binaire.
- Verrou `selftest:achats-google-code` (12 rouges sur 6ede137 → 28/28). Garde-fous tenus : aucun prix, aucun produit ni
  forfait touché chez Google, « + Cloud » en brouillon, aucun client contacté.

## 8. La rédaction d'annonce coupée à 150 s (504) — ROUGE, corrigé
**Cause prouvée** (journaux) : le 12/11 à 15:25 et 15:28 (compte ebdf29f0, 4 réponses 504 à 150 s), generate-listing
écrit « rehost photo N (1/3) : upload — Gateway Timeout » toutes les ~60 s, puis (2/3), puis la coupure : l'ENVOI Storage
d'une photo re-hébergée n'avait aucun délai (seul son téléchargement en avait un), 3 essais par photo, photo après photo,
AVANT la rédaction — 150 s passées sans une ligne de texte. Même trou à l'envoi des photos retouchées ; les appels de
rédaction eux-mêmes (Claude) n'avaient pas de délai non plus.
**Clients touchés (7 jours, 06/11 → 12/11)** : 2 comptes, 6 coupures — ebdf29f0 (4, le 12/11) et 229c7b07 (2, le 09/11 à
12:46 et 12:47 : muettes jusqu'à la coupure, arrêtées avant la rédaction, aucune autre trace). En face, 1 783 rédactions
abouties en 24 h (26 comptes). Le client perdait tout : le texte, et la fiche (le serveur l'enregistre APRÈS la rédaction).
**Correctif** (règle `docs/regles/republication-et-publication.md` du 12/11) : des échéances comptées depuis le début de
la requête (`_shared/delai-etape.js`) — re-hébergement fini à +45 s, retouche finie à +100 s (pas lancée s'il ne reste pas
25 s), chaque envoi Storage abandonné après 12 s, rédaction finie à +140 s. Une photo en retard part TELLE QU'ELLE EST (la
photo d'origine) ; un texte en retard prend le repli déjà prévu (titre et description de la fiche) ; la fiche est
enregistrée et la réponse part avant 150 s. Aucun appel en plus (même coût), même qualité quand tout répond à temps :
sur 30 jours, 309 retouches, médiane 15 s, p99 75 s, la plus longue 78 s — aucune n'aurait atteint l'échéance de +100 s ;
rédaction mesurée de 3 à 26 s. Verrou `selftest:redaction-jamais-coupee` (14 rouges sur 2223f0b → 24/24, dont un essai
du vrai module de rédaction face à une IA qui ne répond jamais).

## 10. « Se connecter avec Apple » cassé sur le web — ROUGE, réparé à 18:33, renouvellement automatique préparé
**Cause prouvée** : le secret client Apple du web (JWT ES256 de 6 mois au plus, clé U5R7347N3K créée le 18/04) avait
expiré ; journaux auth : `/callback` → « oauth2: invalid_client — 500: Unable to exchange external code » le 11/11 à
21:56, 21:57, 21:59, le 12/11 à 12:00 et 18:23 (×2). L'API de gestion ne rend qu'une empreinte du secret (sa date ne se
lit pas) ; preuve chez Apple : avec la même clé, un secret expiré donne exactement `invalid_client`, un neuf est accepté.
L'app iPhone (jeton natif) n'en dépend pas.
**Correctif** : nouvelle clé « Sign in with Apple » TJY379J9P7 (la .p8 d'avril n'était plus sur le poste) ; secret posé à
18:33:25 (seul `external_apple_secret` changé : reste de la configuration auth identique, empreinte avant/après), valable
jusqu'au 11/05/2027 ; connexion Apple web réussie à 18:46:19 (compte de Nico). Racine : fonction `expirations-secrets` +
table `public.expirations_secrets` (renouvellement mensuel, alerte à support 30 jours avant toute échéance) — verrou
`selftest:expirations-secrets` (7 rouges sur 7709f6e → 26/26). Migration 20261112190000 et jeton de l'API de gestion :
en attente du feu vert de Nico.
**EN SERVICE (feux verts de Nico, 12/11 ~19:15)** : commit f71279a ; suite LF 682/684 sur ebd8ac3, les 2 rouges
(`aucune-estimation`, `tables-droits-explicites`) corrigés dans f71279a et revérifiés ; fonction `expirations-secrets` v1
(19:22:40, verify_jwt false, 401 sans secret du cron) ; migration 20261112190000 appliquée et enregistrée (~19:23 :
8 échéances, cron `10 6 * * *`, aucun droit anon) ; secrets serveur `APPLE_SIWA_*` et `GESTION_SUPABASE_JETON` (le
préfixe `SUPABASE_` est réservé). Jeton de gestion : « renouvellement-secret-apple-v2 », projet fill-and-sell seulement,
« Project Settings » + « Auth Config » en lecture-écriture (minimum exigé par l'API pour écrire la configuration auth :
`project_admin_write`), sans expiration ; le premier jeton (Auth Config seul, refusé en 403) a été supprimé. Essai bout à
bout à 19:32:06 (déclenché comme le cron, `renouveler: true`) : sonde Apple acceptée, secret posé (empreinte changée,
identifiants clients intacts), échéance 11/05/2027 20:32 ; l'essai raté de 19:31 (403) a envoyé l'alerte « renouvellement
RATÉ » à support — le chemin d'alerte est prouvé.

## 9. Ouverture du Cloud ce soir (web + Android) — FAIT (décisions de Nico)
- Étape 1 (point 7) : OTA 2.9.175 + web 253a740 en service. Étape 2 : 2.9.167 / vc37 « Disponible sur Google Play »
  (sortie le 09/11 20:15). Étape 3 (GO de Nico) : ACTIVÉS sur Google Play — `premium-cloud-monthly` (34,99 €) + offre
  `premium-cloud-trial-7d`, `pro-cloud-monthly` (49,99 €) + `pro-cloud-trial-7d`, `business-cloud-monthly` (79,99 €, sans
  offre) ; éligibilité de l'essai GARDÉE par Nico : « n'a jamais eu d'abonnement dans cette appli » ; aucun prix ni
  abonnement existant touché. Étape 4 (achat d'essai réel) : impossible ici (se connecter à des comptes Google et FillSell
  exige des mots de passe) ; Nico a ouvert quand même, sous surveillance, puis a arrêté la surveillance (« on valide tel
  quel ») — aucun achat de formule vu pendant qu'elle tournait.
- **Interrupteurs** : `cloud_formules_stripe` = 1 le 12/11 à 18:13:11 ; `cloud_formules_google` = 1 à 18:19:02 ;
  `cloud_formules_apple` ABSENT (fermé, accord d'Apple attendu). Vérifié : témoin web (session de Nico, lecture seule) ;
  compte ordinaire par le vrai code (app + serveur) et les valeurs lues sans session : web et Android vendables, iPhone
  non. Terminal marketing prévenu à chaque ouverture.

## Bilan final (12/11 vers 21:00) — point par point
| Point | Classement | État | Commits |
|---|---|---|---|
| 1. lots « qui ne partent jamais » (229c7b07) | NORMAL (créneau du soir) | rien à corriger | — |
| 2. vente qui n'arrête pas la republication (6e3d92b3) | ROUGE | EN SERVICE (migration 20261112140000, update-job-status v192, ebay-api-worker v124, handler-watch v192) | 21fa849, 5e88909 |
| 3. retrait Beebs f4367beb (c7c382b7) | NORMAL (borné à 7 jours) | à relire le 14/11 au soir | — |
| 4. publications programmées : dire quand ça part | ROUGE | EN SERVICE (OTA 2.9.174, web) | 1746fae, cfef7d7 |
| 5. empreintes-urls (rafales) | cause dans les appelants | EN SERVICE (migration 20261112160000, rapprochement v39) ; 1 h après : rapprochement plus rapide, échecs 22,7 % → 20,4 % ; Nico arrête là | 2223f0b |
| 6. Leboncoin « Animaux › Animaux » (cfdfda6f) | ROUGE | EN SERVICE (get-pending-jobs v362, handler-watch v193) | 1746fae |
| 7. achats Google Play (8 comptes, 18 échecs) | ROUGE | OTA 2.9.175 EN SERVICE ; binaire 2.9.176 / vc38 EN EXAMEN chez Google | 253a740, a520698, 71f97fc |
| 8. rédaction coupée à 150 s | ROUGE | EN SERVICE (generate-listing v140) | 6ede137 |
| 9. ouverture du Cloud | — | web + Android OUVERTS, iPhone fermé | 7709f6e |
| 10. « Se connecter avec Apple » du web | ROUGE | RÉPARÉ (18:33) + renouvellement automatique EN SERVICE | f71279a, 881c2b9 |
