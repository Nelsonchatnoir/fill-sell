# La taille écrite dans le titre — 19/10/2026 (heure de Paris)

## Résumé

- **Le déclencheur** : DeadRoz (Business), de 12:17 à 12:56, **50 questions « Taille » Beebs** (rayon « Autres
  pantalons (homme) », grille « 32 » … « 64 » + lettres) sur des jeans Levi's dont le titre disait la taille
  (« W30 L32 FR40 », « W36 L34 (46) »). La fiche portait « W30 » (synchro Vinted). Même famille : Ornella, job Beebs
  08ddc213 (11:50) arrêté sur « 24M » (« Pull Kiabi 24M »), la grille écrit « 24 mois (86-94 cm) ».
- **La cascade IA fantôme du 18/10 ne couvre pas la Taille** (Leboncoin Produit / Support / Univers, Beebs Âge
  seulement — table `ia_leviers_bascule`). Rien n'était en double : la règle est neuve.
- **Le trou** : le serveur savait déjà W30 = FR 40 (`_shared/taille-de-service.js`, R1, table publiée par Vinted,
  06/10) ; l'écran Publier de l'app ne lisait que `tailles.js` et posait la question. Aucune règle ne liait « 24M » à
  « 24 mois (86-94 cm) ».
- **La règle** (déterministe, aucun appel IA, aucun coût) : `_shared/taille-du-texte.js`, branchée sur l'écran Publier
  (jugement, job, eBay, carte du rayon) et sur handler-watch (question d'un job arrêté). Toutes les plateformes à
  grille relevée : Beebs, Vinted, Leboncoin, eBay.
- **Rejeu des 7 jours (tout le parc, 218 questions « Taille » affichées)** : **205 → 96** (− 109). Sur les 76 dont la
  taille de la fiche à l'instant de la question est connue : **66 → 21**. DeadRoz seul : **50 → 4**. Sur les 109 levées :
  **82 = la réponse de la personne, 0 différente**, 27 sans réponse de sa part à comparer.
- **Zéro régression** : 1 015 tailles d'annonces publiées en 90 jours qui passaient la grille → **0 changée** ; 0 taille
  de job écrite autrement ; 225 tailles eBay → 0 changée. Selftests : voir § Preuves.
- **Extension non touchée** (aucun zip). Serveur : handler-watch. App : web + OTA (voir § Livraison).

## Ce qui est déduit

Dans cet ordre, sur la copie de la plateforme puis le titre et la description (fiche, copie) :

1. **la taille FR écrite** : « FR50 », « FR 46 », « W36 L34 (46) » (le nombre entre parenthèses collé à un W) ;
2. **à défaut, le W converti en FR** par la table que Vinted publie (« W30 | FR 40 » ; W30 et W31 = 40, W34 et W35 = 44,
   W36 = 46…) — un W absent de la table (W37, W41…) n'est jamais deviné ;
3. **l'âge en mois** : « 24M », « 18 mois ».

La valeur posée est **une option exacte de la grille de la plateforme et du rayon**, une seule (Beebs homme « 40 »,
Beebs femme « L / 40 », Vinted femme « W30 | FR 40 », Vinted homme « W30 », eBay « 40 », Beebs bébé « 24 mois (86-94
cm) »). Le L (longueur) ne choisit jamais rien.

**La question reste** (jamais de devinette) quand : la copie et le texte ne disent pas la même taille (fiche « W32 »,
titre « W42 FR52 ») ; deux tailles dans le texte (« W30 et W32 », « FR40 … FR42 ») ; une fourchette (« FR 40/42 »,
« W30-32 », « 12-18 mois ») ; un W hors table ; une taille adulte et un âge à la fois ; un âge hors des étiquettes
(« 23 mois ») ; aucune option de la grille (« FR 40 » sur une grille de lettres, « 24M » sur une grille adulte).
**Jamais** : une valeur que la grille porte déjà (la saisie de la personne n'est jamais remplacée), une valeur de copie
qu'on ne sait pas lire (« EU 38 », « Taille unique »), « taille 38 » ou « T40 » nus (le pays d'un nombre nu n'est pas
sûr), EU / UK / US, les années (« 2 ans »), « 1m » (un mètre), une durée (« porté 3 mois »), une pointure (champ ou rayon
de chaussures).

## Compte avant / après (rejeu, 7 jours au 19/10 15:00)

Méthode : `scripts/bancs/tailles-titre/rejeu-tailles.mjs`, code d'avant au commit 8dab9ed (worktree) contre le code
d'après, sur les questions « Taille » réellement affichées par l'écran (`usage_logs` `champ_requis_bloquant`, une par
compte × article × plateforme × champ), la grille relevée du rayon, la taille de la fiche à l'instant de la question (si
elle a été réécrite depuis : la valeur d'avant au journal de la fiche ; sinon inconnue, rejouée vide), les textes du
vendeur. « La réponse de la personne » = la taille du job parti ensuite, quand la question a été levée par SON geste.

| | Rejouées | Avant | Après |
|---|---|---|---|
| **Tout le parc** | 217 (1 sans grille) | **205** | **96** |
| · valeur de la fiche connue à la question | 76 | 66 | **21** |
| · valeur réécrite depuis, inconnue (rejouée vide) | 141 | 139 | 75 |
| Beebs | 179 | 173 | **64** |
| Vinted | 20 | 17 | 17 |
| eBay | 15 | 13 | 13 |
| Leboncoin | 3 | 2 | 2 |
| **DeadRoz, Beebs, 19/10** | 50 | 50 | **4** |

- **Les 109 levées** : 82 égales à la réponse de la personne, **0 différente**, 27 sans réponse de sa part (abandon, job
  parti avec la valeur de départ, question retirée par le moteur). DeadRoz : 46 levées, 33 = sa réponse, 13 sans.
- **Les 4 qui restent chez DeadRoz** : la fiche Vinted et le titre se contredisent (W32 / « W42 FR52 », W30 / « W32
  FR42 », W29 / « W36 FR46 », W34 / « W36 FR46 ») — dans 3 cas il a pris le FR du titre ; la règle ne tranche pas un
  désaccord, c'est voulu (sa fiche Vinted dit peut-être faux : à lui de voir).
- **Ce qui reste ailleurs, et pourquoi** : rien n'est écrit (« Pull », montres, peluches), fourchettes « 12-18 mois »,
  années (« 3 ans », « 6-7 ans »), « EU 38 / taille 38 », pointures, bonnets et casquettes (« 2-3 ans, 51 cm »).
  Vinted / eBay (surtout un compte, pulls et polos) : la taille de la fiche a été écrite après la question (inconnue au
  rejeu) et aucun titre ne la dit — inchangé.
- **Les 141 « valeur inconnue »** (surtout un compte bébé, 14/10, dont les fiches ont été réécrites ensuite par le relevé
  Beebs) : rejouées avec le texte seul ; avec leur vraie valeur d'alors (tranche Vinted), une partie était déjà levée par
  les règles des 17-18/10. Le chiffre sûr est celui des valeurs connues : **66 → 21**.
- **Jobs arrêtés sur la taille (handler-watch)** : 2 ouverts. Ornella 08ddc213 « 24M » → **« 24 mois (86-94 cm) »** (R5) ;
  Leboncoin c6ecb7b0 « taille 7 » → rien (question gardée).

## Preuve de zéro régression

- **Annonces publiées** (`annonces-publiees.sql`, rayons à grille de taille exigée) : 30 j : 886 annonces, **717 tailles
  qui passaient → 0 changée**, 0 job réécrit autrement, 159 eBay → 0 ; **90 j : 1 271 annonces, 1 015 → 0 changée**,
  0 job, 225 eBay → 0. Aucune taille hors grille d'alors n'est devenue « dans » (0 nouvelle).
- **Par construction** : la règle ne joue qu'après TOUS les jugements d'avant, et seulement quand l'appelant donne les
  textes ; sans textes, chaque fonction rend exactement ce qu'elle rendait (contrôlé par les selftests).
- **Banc du moteur RÉEL de bout en bout** (`scripts/apercu/capture-moteur-taille-titre.mjs`, ListingPreviewScreen en mode
  pilote du lot, Supabase factice, grille relevée, envoi `spend_coins_and_publish` capturé) — 4 cas, **tout vert** :
  DeadRoz « W30 » + FR40 → aucune question, le job part avec « 40 » (`taille_saisie` « W30 ») ; copie vide + « W36 L34
  (46) » → aucune question, « 46 » posé sur la copie Beebs (trace `option_du_texte.Taille`) ; fiche W32 / titre W42 FR52 →
  la question reste, Beebs ne part pas sans réponse ; Ornella « 24M » → « 24 mois (86-94 cm) ». Ce banc a trouvé un trou
  avant la livraison : la copie vide gardait la question PARTAGÉE « Taille » — corrigé (la taille déduite est posée sur
  la copie de la plateforme, comme le geste de la personne).
- **Montage des deux peaux du stepper** (`capture-stepper-moteur.mjs`) : vert. `build:essai` : vert. eslint : aucune
  erreur nouvelle (les 7 de ListingPreviewScreen et les 4 de CarteRayon existaient au commit d'avant, relus).
- **Faux positifs, lecture de 6 000 fiches réelles** (60 j, textes avec un FR / W / mois) : les « FR » lus sont des tailles
  (« Chino Femme FR32 », « FR 38 / UK 12 ») ; les mois sont des âges d'étiquette ; 724 doutes (fourchettes surtout) ne
  posent rien.
- **CPU** (handler-watch) : 40 jobs × 4 textes de 4 000 caractères = 26 ms.

## Livraison

Voir `docs/agents/etat-2026-10-01.md` § 19/10 (versions lues avant / après).

## Choix pris sans Nico

1. Le texte ne remplace jamais la taille de la copie : il la CONFIRME (même taille) ou il se tait. Une copie illisible
   (« EU 38 ») n'est pas recouverte même si le titre dit une taille.
2. « (46) » n'est un FR que collé à un W (« W36 L34 (46) ») ; « taille 38 », « T40 » nus ne comptent pas.
3. Les années (« 3 ans ») et « 1M » sont exclus (garantie, durée, mètre).
4. Une copie vide reçoit la taille déduite sur SA copie (lien partagé coupé pour cette plateforme), avec la trace
   `option_du_texte` sur le job.
5. Côté serveur, seul handler-watch est redéployé ; la règle R0 → R4 de `taille-de-service.js` est inchangée (R5 vient
   après, dans `taille-question-auto.js`).
