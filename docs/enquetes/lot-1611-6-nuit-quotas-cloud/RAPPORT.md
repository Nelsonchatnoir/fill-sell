# Lot du 16/11 nuit — 2 points (heure de Paris) : l'écran des quotas qui casse, les plateformes proposées par le Cloud

Verrous : `selftest:quota-vieux-navigateur` (point 1), `selftest:cloud-plateformes-actives` (point 2). Suite complète
(17/11, par morceaux pour la mémoire du poste) : 838 selftests, 0 rouge. Livraison : OTA
(aucun binaire neuf) + get-pending-jobs. Versions servies : `docs/agents/etat-2026-10-01.md` (16/11 nuit, suite).

## Point 1 — « TypeError: e.at is not a function » sur « Tes quotas du mois »

**Cause prouvée : le navigateur intégré Android des appareils d'examen de Google est antérieur à Chrome 92 (pas
d'`Array.prototype.at`). Aucune donnée du serveur n'est en cause.**
- Les 3 lignes (`usage_logs`, action_app_ratee, exception_js) : 16/11 15:02 et 15:43 (build `…+b9a79dc`, en-GB, en-SG),
  22:35 (build `…+55c1c6a`, en-PH), toutes le compte des examinateurs de Google Play (953c1ca6), Android ; chaque fois juste après
  `quota_detail_open` (22:35:59 : jauge annonces, palier premium, plafond 40, restantes 40 — des nombres bien formés).
- Pile relue dans le bundle reconstruit (même code, `build:essai`) : `App-*.js:1231:5966` = `e.at(-1)` dans **Z8 = `liste`**
  de `src/utils/detailQuota.js` ; `1231:7307` = l'appel `Z8(d,t)` (la liste des jauges finies) dans **bYe = `resumeQuota`** ;
  `1240:349` = **NYe = `FeuilleQuota`**.
- Piste (a) écartée par la preuve : `d` est construit sur place (`const finies = []` + `push`), et
  `e.slice(0,-1).join(...)` s'exécute juste avant `e.at(-1)` sans lever — c'est un vrai tableau, c'est la MÉTHODE qui
  manque. Piste (b) retenue : Array.prototype.at est arrivé avec Chrome 92 (2021).
- « Nouveau le 16/11 » : la feuille est née le 13/11 au soir (bloc B1, 3ac4a66) ; Google a utilisé le compte les 06, 07,
  08, 09 et 12/11, avant elle. Il l'a ouverte pour la première fois en examinant les binaires du 16/11.
- Seules ces 3 lignes en 60 jours portent « is not a function » (aucun autre compte).

**Ce qui change (pour tout le monde) :**
- `src/utils/dernier.js` : `dernier(liste)` (dernier élément d'un VRAI tableau, sinon undefined). Les 7 `.at(-1)` de
  l'app remplacés : `utils/detailQuota.js`, `entree/regles.js` (×2), `cloud/textesConnexion.js` (×2 — bandeau de
  déconnexion Cloud), `utils/barresJobs.js` (×2 — barres des tâches finies, qui auraient cassé de même sur ces appareils).
- La feuille ne lève plus jamais : `resumeQuota` lit chaque jauge à part (une jauge illisible est sautée, jamais
  devinée : ni « NaN », ni faux zéro, ni faux « illimité ») ; `quotasLisibles` retire le bloc des jauges si un chiffre est
  illisible ; ce qui reste, les jauges et « ce qui compte » ont chacun leur `BarriereErreur` ; App.jsx pose une barrière
  sur la feuille entière (elle se ferme, l'échec est tracé `feuille_quota_rattrapee`, l'app reste debout).
- Rien touché aux quotas, aux paliers, ni au compte des examinateurs (953c1ca6).

**Test** : `selftest:quota-vieux-navigateur` retire `Array.prototype.at` (comme ces WebView) puis rend la feuille du
compte des examinateurs (Premium, 40 annonces) et 7 formes de données mal formées ; il scanne aussi tout le code de l'app
(683 fichiers, dont les modules partagés importés) contre `.at()`, findLast, toSorted, structuredClone, Object.hasOwn…
Rouge sur l'ancien code (14 rouges, « TypeError: morceaux.at is not a function »), vert après (20/20).

⚠️ Le binaire Android 2.9.209 en examen chez Google porte encore l'ancien code : l'OTA s'applique à l'ouverture SUIVANTE
(derrière l'écran de lancement). Un examinateur qui ouvre la feuille dès le tout premier lancement peut encore la voir
casser — seul un binaire neuf l'empêcherait (non fait : ordre « pas de nouveau binaire »).

## Point 2 — Cloud : « Me connecter » ne proposait que les plateformes cochées à l'inscription

**Cause prouvée** : `plateformesCloudChoisies` (src/cloud/connexionsCloud.js) = cochées ∩ Cloud, rien d'autre ;
a962a59e : `["vinted"]` → total 1. Côté serveur, une plateforme du Cloud JAMAIS connectée (aucune ligne au coffre) était
« inconnue » (`sessionsQuiFontFoi`) : ses tâches n'étaient servies à personne (l'ordinateur n'en reçoit aucune — drapeau
cloud_voie —, le poste Cloud seulement ses plateformes connectées) et ne recevaient aucun message ; seule une plateforme
« à reconnecter » (ligne au coffre, connecte = false : 13e274de, c7c382b7) avait le sien.

**La règle (pour tous les comptes ; panneau « Me connecter », carte de connexion, total affiché)** :
- cochées (plateformes_vendeur) **∪ actives** (une annonce relevée, une tâche quelle qu'elle soit, ou un relevé réussi
  done/incomplete — `src/cloud/activitePlateformes.js`, une ligne au plus par table, lu au plus toutes les 10 min, jamais
  d'écriture ; coût mesuré : 0,05 ms l'annonce, 19 ms la tâche absente chez le compte aux 8 582 tâches) ;
- **moins plateformes_ecartees** — sauf une écartée dont un **retrait attend** (doctrine des écartées : « un retrait part
  toujours » ; sinon l'annonce d'un article vendu resterait en ligne). Constaté : 13e274de (Beebs cochée ET écartée,
  7 retraits Beebs « Reconnecte Beebs dans l'app »), af37fa49 (Beebs écartée, 2 retraits Beebs muets) : sans cette
  exception, le correctif leur aurait retiré Beebs du panneau. **Gardée sur décision de Nico (17/11).**
- seulement Vinted, Leboncoin, Beebs, Depop (ni eBay, ni Opla) ; moins les plateformes fermées au pays ;
- **liste vide ([], c7c382b7) ou absente (null, f0acd3af) = rien de choisi → toutes les plateformes du Cloud** (moins
  les écartées). Vérifié : c7c382b7 et f0acd3af voient les 4 (leur coffre a d'ailleurs les 4 lignes).
- « Me connecter » ouvert depuis les Réglages (sans liste) : toutes, inchangé.
- La liste enregistrée n'est jamais réécrite : la règle se lit à chaque ouverture. Réglage de a962a59e laissé tel quel.

**Plus jamais une attente muette** : `sessionsQuiFontFoi` rend aussi `jamais` (coffre LU, aucune ligne, aucune connexion
isolée) ; get-pending-jobs retient ces tâches (comme avant, mais dites) avec « En attente de ta connexion à X dans
FillSell Cloud : X n'est pas encore connecté à FillSell Cloud. Connecte X dans l'app (Réglages › Mes plateformes ›
« Me connecter ») : la publication partira toute seule. Aucune tentative consommée. » (retrait : « … risque de double
vente … ») — même ancre et même marqueur (pose_par serveur) : handler-watch le lève dès que le coffre la dit connectée.
Publication neuve comprise. Coffre illisible : rien n'est retenu. `sessions` inchangé (handler-watch non redéployé).
Essai réel (17/11, get-pending-jobs 384) : les 2 retraits Beebs muets d'af37fa49 portent le message (« Beebs n'est pas
encore connecté à FillSell Cloud. Connecte Beebs dans l'app (Réglages › Mes plateformes › « Me connecter ») … »).

**Comptes touchés** (lecture seule, 16/11 ~23:30) :
- Cloud actifs (10) : **aucun** n'a aujourd'hui une plateforme utilisée hors de sa liste (a962a59e réparé à 22:05).
  af37fa49 : 2 retraits Beebs en attente MUETTE (Beebs jamais connectée au Cloud, écartée) → ils porteront le message ;
  13e274de : 7 retraits Beebs « à reconnecter » (inchangé).
- Hors Cloud : **69 comptes** ont de l'activité sur une plateforme absente de leur liste (Beebs 41, Leboncoin 28,
  Depop 25, Vinted 4). Corrigés par la règle (lue à l'ouverture), sans écriture. Liste en annexe.

**Test** : `selftest:cloud-plateformes-actives` (43 contrôles) : Vinted seule cochée + tâches Leboncoin et Beebs →
« Me connecter » propose Vinted, Leboncoin et Beebs, « 1 sur 3 » ; écartées, retraits, listes vides/absentes, eBay/Opla ;
lecteur d'activité (une ligne, aucun écrit, échec = rien d'affirmé) ; `jamais` et le message. Rejoué sur une copie de
l'ancien code (`VERROU_RACINE`) : 24 rouges ; vert après.

## En plus (feu vert de Nico, 17/11) — `selftest:acquisition-meta` ne retombe plus à chaque binaire
Rouge depuis 55735e9 (binaires 2.9.209) : il exigeait PLAY_REFERRER_BINAIRE_MIN === versionName du jour. Or la borne est le
PREMIER binaire qui porte InstallReferrer (2.9.205, vc39) : la monter refermerait la lecture des 2.9.205 → 2.9.208. Le
contrôle dit désormais : module présent ⇒ 2.9.205 ≤ borne ≤ versionName (et un cas « binaire futur » le prouve). Rouge
sur HEAD, vert après (58/58). Code de l'app inchangé.

## Annexe — les 69 comptes hors Cloud (id8 | cochées | écartées | utilisées mais absentes | dernière tâche)
| id8 | cochées | écartées | manquantes | dernière tâche |
|---|---|---|---|---|
| a922068b | vinted, leboncoin | ebay, depop | beebs | 16/11 |
| 75757b50 | vinted, leboncoin | — | beebs | 16/11 |
| eacbe32c | vinted | leboncoin, ebay | beebs | 16/11 |
| 64eab2f9 | vinted, leboncoin, ebay | — | beebs, depop | 16/11 |
| 9ca5dfe8 | leboncoin, vinted, ebay | depop | beebs | 16/11 |
| 116a51bb | vinted | — | beebs, leboncoin | 16/11 |
| 229c7b07 | vinted, leboncoin, ebay | depop | beebs | 16/11 |
| ca9afe24 | vinted, ebay, leboncoin | — | beebs | 16/11 |
| f8a94c06 | vinted, leboncoin, ebay | — | beebs, depop | 16/11 |
| cca934e7 | vinted, leboncoin | — | beebs | 16/11 |
| d5531b8e | vinted, leboncoin, ebay | — | beebs | 16/11 |
| 3f91c02e | vinted, leboncoin, ebay, beebs | — | depop | 16/11 |
| 82ed3d4c | vinted | leboncoin | beebs, depop | 16/11 |
| 9256e3ae | vinted, ebay, leboncoin | — | beebs | 16/11 |
| c4d4807f | vinted, leboncoin, ebay | — | beebs | 16/11 |
| 14e536e0 | vinted, leboncoin | ebay, depop | beebs | 16/11 |
| 735eeeb8 | vinted | — | beebs, leboncoin | 15/11 |
| a641ba9e | leboncoin | — | vinted | 15/11 |
| ac19c8c9 | vinted, ebay | beebs, opla, depop | leboncoin | 15/11 |
| b245e854 | vinted, ebay | — | beebs | 15/11 |
| 7879efc5 | vinted | — | depop | 15/11 |
| 66cf5b1f | vinted, leboncoin, opla, beebs | — | depop | 15/11 |
| 209a9036 | vinted | — | beebs, leboncoin | 14/11 |
| c4c31845 | vinted | beebs, ebay | leboncoin | 14/11 |
| 238dc49b | vinted, ebay, leboncoin | — | beebs, depop | 14/11 |
| e25ff459 | vinted | depop, ebay, beebs | leboncoin | 13/11 |
| 9bcc16d0 | vinted, ebay, leboncoin | beebs | depop | 13/11 |
| 6eb8400b | vinted, ebay | beebs, opla | leboncoin | 13/11 |
| 2f4383e9 | vinted | — | depop, leboncoin | 12/11 |
| 7b9d8a71 | vinted, leboncoin | — | beebs, depop | 12/11 |
| 7e1a0836 | vinted, leboncoin, ebay | — | beebs | 12/11 |
| cdbb28c7 | vinted | leboncoin | beebs, depop | 11/11 |
| a3002ab6 | vinted | — | beebs, depop, leboncoin | 11/11 |
| 9156866f | vinted | — | beebs, leboncoin | 11/11 |
| 56881318 | vinted | — | depop | 11/11 |
| a6bbc6c3 | vinted | — | beebs, depop, leboncoin | 10/11 |
| e991fc5e | vinted | — | beebs, depop, leboncoin | 09/11 |
| a8bcc86e | leboncoin, vinted, ebay | — | beebs | 09/11 |
| 5848bc8f | vinted, leboncoin, ebay | ebay, depop | beebs | 08/11 |
| 4fe79712 | vinted, ebay | — | leboncoin | 08/11 |
| 10aab475 | ebay, leboncoin | — | vinted | 06/11 |
| 2981c70d | vinted | depop, ebay | leboncoin | 04/11 |
| 7f2cadb8 | vinted, leboncoin, ebay, beebs, opla | — | depop | 02/11 |
| 55549217 | vinted, ebay | beebs, leboncoin | depop | 01/11 |
| 1fbead3f | vinted, leboncoin, ebay | — | beebs, depop | 30/10 |
| b3897d60 | vinted | — | beebs, depop, leboncoin | 29/10 |
| 581767bb | leboncoin, vinted | — | beebs, depop | 28/10 |
| 3d157a2b | vinted, leboncoin | — | beebs, depop | 28/10 |
| 12790b10 | vinted | — | leboncoin | 27/10 |
| 8ffe8624 | vinted, ebay | — | leboncoin | 27/10 |
| 5de22691 | vinted, ebay, leboncoin | — | beebs | 26/10 |
| fa2011a6 | vinted, leboncoin, beebs, ebay | — | depop | 25/10 |
| f7bc75d6 | vinted | — | depop | 25/10 |
| 8f7c903c | vinted, ebay, leboncoin | — | beebs | 24/10 |
| c22c5429 | leboncoin | ebay, beebs | vinted | 18/10 |
| 8e72459b | vinted | — | leboncoin | 16/10 |
| 641baf3b | leboncoin | — | vinted | 14/10 |
| bd380fbf | vinted | ebay | beebs, leboncoin | 12/10 |
| 28d8b8d1 | vinted | — | beebs, depop, leboncoin | 11/10 |
| 97221b6a | vinted, ebay | — | depop | 10/10 |
| 19785fd7 | vinted | ebay, beebs | leboncoin | 10/10 |
| f078cf94 | vinted, opla | — | beebs, leboncoin | 08/10 |
| d26a37ad | vinted | — | beebs, leboncoin | 08/10 |
| 4920948d | vinted | — | leboncoin | 05/10 |
| ecaa46bf | vinted | — | beebs, leboncoin | 04/10 |
| b76861c3 | opla | vinted | beebs, leboncoin | 04/10 |
| fcbdc441 | vinted | beebs | leboncoin | 03/10 |
| aa2e1852 | vinted, leboncoin | — | beebs | 03/10 |
| c8cf253d | ebay | — | leboncoin | 21/09 |
