# 28/10 soir — mission « débloquer tous les utilisateurs » (lots 1 Vinted et 2 Beebs / Depop / eBay / Leboncoin)

Consigne de Nico (28/10 ~21:00) : 14 points, preuve d'abord, déblocage serveur, correctif racine, test réel, commit.
Heures de Paris. Enquêtes en lecture seule menées en parallèle (Vinted 3-4-5, Beebs 8-9-10, Depop/eBay 11-14,
pont mort et bandeau 12-13), correctifs appliqués et prouvés depuis le terminal principal.

## Lot 1 — Vinted

### Points 1 et 2 — marque non posée (publication), État refusé (republication) : UNE cause, chez Vinted
- **Ce n'est pas la 0.6.149** : `git diff 9b634bd 9ca925f -- chrome-extension/content-scripts/vinted.js` est VIDE (la
  0.6.149 ne touche que la lecture d'origine dans background.js). La republication de vincent.armengol `a1642b6a` est
  arrêtée de la même façon en **0.6.148** (13:12), et XEWER aussi en 0.6.148 (12:00 → 13:12).
- **Constat réel** (compte Vinted de Nico, /items/new, 21:15) : Vinted a remplacé ses menus par un composant « bloom ».
  Le déclencheur est `<button id="_r_8_" class="select-root" data-testid="brand-select-dropdown-input">` ; la valeur
  choisie ne vit que dans `<span data-testid="brand-select-dropdown-input--value">` ; `<input class="select-proxy"
  name="brand">` reste VIDE après le choix ; `data-placeholder` tant que rien n'est choisi. Même chose pour Catégorie,
  Taille (testid devenu `category-size-single-grid_chips-input`), État, Couleur, Matériau. Les lignes du menu ont gardé
  leurs identifiants (`brand-<id>`, `#custom-select-brand`, `#empty-brand`, `#condition-<id>`).
- Au clic réel, « Utiliser "Ottordram" comme marque » et « Très bon état » se POSENT (span affiché) : seule notre
  relecture `.value` du bouton lisait « » → « #brand porte «  » » (même pour « Sans marque ») et « le formulaire n'a pas
  accepté État ». Les republications passaient chez les comptes non basculés, et chez les basculés quand la marque partait
  par identifiant (le contrôle d'État les arrêtait ensuite, AVANT tout retrait).
- Bascule progressive chez Vinted : 1 arrêt le 24/10, 1 le 27/10, 34 le 28/10 ; `selector_health publish.dropdown_panel`
  1 ligne/jour → 418 dès le 28/10 12:01 (15 installations).
- **Correctif** `497405d` (extension **0.6.150**) : `valeurChampVinted` / `estMenuVintedBloom` — une seule lecture pour
  l'ancien `<input>` et le bouton bloom, partout (marque, « Sans marque », catégorie et état par identifiant, requis,
  contrôle avant retrait, relecture « commitée ») ; grille de tailles à puces. Selftest neuf `vinted-menus-bloom`.
- **Garde-fou tenu** : aucune autre marque posée en silence (chaîne marque inchangée, seule la relecture change) ;
  chemin de republication inchangé (la marque par identifiant reste) ; aucun État deviné.
- **Preuve réelle** (compte de Nico, menus bloom, extension 0.6.150 non empaquetée) : publication `d994d777` → annonce
  **10576137564** à 21:31:53 (Kiabi / M / Très bon état / Bleu, Bleu clair / 999 €) ; republication `8cd6e3f1` de cette
  annonce → **10576216857** à 21:38:18, identique, l'ancienne en « Page not found ».
- **Relance** (règle de relance : jamais avant le correctif en prod) : `_shared/relance-apres-maj.js`
  `vinted_menus_bloom_marque` (publication, message technique « Le champ Marque n'a pas pu être posé ») et
  `vinted_menus_bloom_grille` (republication `grille_incoherente`, avant retrait) — chaque tâche repart seule, une fois,
  dès que SON poste a un build ≥ 2026-10-28T20:15Z (0.6.150). handler-watch v136 → v138. En attendant, le message dit
  « repartira toute seule dès que ton extension FillSell se sera mise à jour (c'est automatique) — rien à faire » (v138).

### Point 3 — XEWER (jeux vidéo) : pas un défaut de catégorie
- Les 6 republications (`prevol_negatif`) et les publications PES 2009 / suivante (`champ_a_choisir`) sont au rayon
  **3026** (Électronique > Jeux vidéo et consoles > Jeux), le même que ~40 jeux publiés le 27/10 et le 28/10 matin.
  Chaque arrêt liste **« État » vide** alors que la tâche en porte un : c'est la relecture bloom. La liste « Acer Nitro
  Blaze… Atari, Ayaneo » n'est que le début ALPHABÉTIQUE des 48 consoles de Vinted.
- Correctif `2520643` : règles `vinted_menus_bloom_etat_vide_*` (une tâche qui porte un état et que Vinted dirait « État
  vide ») — repartent une fois avec la 0.6.150 ; une vraie question (pas d'état sur la tâche, autre champ seul) n'est
  jamais touchée. Résidu non corrigé (cosmétique) : la question compte 5 libellés pour 3 champs (« Plateforme » +
  « Plateforme de jeu »).

### Point 4 — mele.marta « Gioco PS4 F1 2015 » (page italienne)
- La pose par identifiants exige l'autorisation du serveur (`vinted_ids_actifs`), servie seulement si le PAYS du compte
  est lu. Juste avant le service (13:24-13:25), la sonde users/current rendait « jeton_expire_session_ouverte » →
  `vinted_identite` null ; une publication n'a ni capture ni liste d'états pour dire sa langue → libellés français →
  « Électronique » introuvable parmi « Elettronica… ». Le 24/10 (pays lisible) ses publications passaient par identifiants.
- Correctif `9e2dd2a` : get-pending-jobs (v296) sert `vinted_ids_langues_ouvertes` (langues dont TOUS les pays sont
  ouverts : aujourd'hui « it » ; jamais fr ni en ; rien écrit en base) ; vinted.js pose par identifiants quand
  `<html lang>` en fait partie. Sur page bloom, la pose par identifiants relit désormais `valeurChampVinted` (point 1).

### Point 5 — vincent.armengol « Robert Delavignette. Les Paysans noirs » (capture périmée)
- Capture du 24/10 14:54, servie le 25/10 21:29 (31 h, lot de ~50 et pause anti-robot) → recapture → GET
  item_upload/items **403 anti-robot** → needs_user « Relance » trois fois, puis plus jamais repris (reprise après
  reconnexion plafonnée à 3). L'étape `a_capturer`, elle, réessaie dans 45 min pour le même mur. Annonce en ligne, intacte.
- Correctif `9e2dd2a` (extension) : le type de l'échec remonte (accesRefuse, sessionExpiree, botShield, httpStatus) ;
  403 sans session → connexion demandée ; anti-robot → en file +45 min (règle déjà en vigueur en `a_capturer`), trace
  `capture_echec`, 6 essais au plus.

### Point 6 — pause Vinted LEVÉE à 21:24:59
- Levée avant la preuve réelle parce que le test en avait besoin (get-pending-jobs ne sert aucun job Vinted en pause) et
  parce que c'est sûr pour la 0.6.149 : prouvé en base, chaque arrêt « bloom » se fait AVANT tout retrait ou dépôt.
  La preuve réelle a suivi à 21:31 (publication) et 21:38 (republication).

### Point 7 — relance et reprise de la file
- Points 1, 2, 3 : relance automatique par poste (relance-apres-maj), à la 0.6.150 — jamais avant (même mur).
- Reprise constatée après la levée : republications et publications servies et publiées (nadegemarcelin78 21:25,
  patrick.giry07, remialbertholl, thibault.andrieux…) ; get-pending-jobs distribue (« article par article »).

### Contrôle final Vinted — libellé de rayon périmé (0.6.152)
- remialbertholl `1cb28a66` : « Vinted ne propose pas « Jewellery » à cet endroit de son catalogue » — la capture porte
  « Accessoires de mode › Jewellery › Boutons de manchette » (rayon 5564), le menu dit « Bijoux » ; 10 republications
  portent ce nouveau chemin (Vinted a sorti les accessoires des rayons Femmes/Hommes : racine « Accessoires de mode »,
  relevée au navigateur). Correctif `722a9ae` (0.6.152) : niveau introuvable + identifiant du rayon connu → pose par
  identifiants avant la question (jamais par-dessus un choix de la personne). Relance `vinted_rayon_par_identifiant_*`
  (seuil `21:20Z`, build du zip `21:24:13Z+379de55`).

## Lot 2 — Beebs, Depop, eBay, Leboncoin

### Point 8 — Beebs « ni en ligne ni en vérification après 3 jours »
- Les 4 dépôts ont eu lieu (redirection `/fr/listing/success`, numéro lu dans « en vérification »). Pages publiques
  relues au navigateur (28/10 ~22:02) : 34200711, 34200634 (louis-seller) et 34198358 (xxewwer) en **404** — vrai refus
  de Beebs, le verdict tient (règle de 7 jours).
- ⚠️ **34206489 (Polly Pocket, louis-seller) : EN LIGNE, « Ajouter au panier », 10 €**, même vendeur « Eva T. » que les
  annonces relevées du compte — alors que l'article est **VENDU sur Leboncoin** (71290f88) et que FillSell la disait
  « jamais en ligne » (relevé de 13:11 : 256 annonces, pas elle). Risque de double vente. Réparation
  `20261028_beebs_polly_en_ligne_vendue.sql` (sauvegarde `_backup_2810_beebs_polly`, inverse) : la ligne revient
  « published » avec le constat ; la règle de vente (`publie_apres_vente_serveur`) a armé le retrait **8f1bfdf7**.
  Seule ligne de ce genre en base (2 dépôts « jamais en ligne » d'articles vendus ; l'autre est en 404).
- Correctif `8a00ae1` : la lecture de « en vérification » est écrite dans le run du relevé.
- Reste : pourquoi le relevé de louis-seller ne voit pas une annonce en ligne (index public incomplet ?) — à
  instruire ; garde proposée (non appliquée, migration à valider) : à la vente, armer aussi le retrait d'un dépôt
  « jamais en ligne » qui a un numéro (le retrait se clôt seul si la page est en 404).

### Point 9 — file Beebs de sebastien64310
- 15 suppressions parties (9 le 26/10, 6 le 28/10), jamais prouvées : la page de l'annonce était relue par un fetch du
  content script que l'anti-robot de Beebs refuse (403) ; et la garde « une seule annonce hors ligne » ne comptait que
  l'étape `deleted` → 15 annonces hors ligne, aucune recréation. La cadence n'y est pour rien.
- Constat navigateur : les 15 pages en 404 ; les 15 articles en stock. Réparation
  `20261028_sebastien_republications_beebs.sql` (sauvegarde, inverse) : étape `deleted` → la recréation part au prochain
  passage de son poste (vu à 20:45, éteint depuis).
- Correctif `8a00ae1` : une suppression envoyée compte « hors ligne » (get-pending-jobs v298 + extension) ; la preuve
  relit la page par `BEEBS_LIRE_PAGE` (fetch de la page) quand le content script est refusé (0.6.151+).

### Point 10 — retraits Beebs en attente
- Les 21 pages relues au navigateur : **toutes en 404**, aucune achetable — pas de double vente.
- Cause : bouton absent parce que la page est déjà en 404 ; preuve impossible (même 403 qu'au point 9) ; comptage des
  cartes « en vérification » doublé. Correctif `8a00ae1` (beebs.js, background.js).
- Réparation `20261028_retraits_beebs_thecloset.sql` : 8 retraits de thecloset72000 clos par la règle du 25/10 ; les
  3 autres, louis-seller ×3, xxewwer ×6 et recrutementgroupezk704 (Levi's en vérification Beebs depuis le 30/09)
  suivent le circuit. Au plafond, `pas-de-rouge` relance sans fin (jamais `failed`) et l'app affiche « À régler » :
  jamais d'abandon silencieux.

### Point 11 — Depop et eBay
- gatignol.pro (Polo, Depop) : vraie cause = compte Depop pas encore vendeur ; deux lectures de session ratées classées
  « inconnu », et `error_technique` écrasé à chaque essai. Correctif `06a6eae` : historique des bruts
  (`error_technique.precedents`), « Session Depop illisible » ramenée à l'attente vendeur quand le mur a été vu.
  Réparation : le Polo revient dans l'attente vendeur Depop (à la personne).
- mataich67 (Air Max, eBay) : dépôt fait (336857790393), arrêté par le vendeur le 24/10 16:07 « car elle comportait une
  erreur » — très probablement la pointure lue par Lens sur la ligne CM (26 au lieu de 41). Ligne close comme la règle
  du 24/10 ; consigne Lens « ligne EUR » commitée, **lens-analysis non redéployée** (sa prod v108 date du 18/10 et
  d'autres changements partagés non déployés suivraient — à décider). La copie Vinted (71f8e602) porte sans doute la
  même pointure : non touchée.

### Point 12 — page muette (« pont mort ») et job orphelin
- Faux « pont mort » (jocabroc8) : le minuteur de 1,5 s sonnait en retard sur une page lourde ; la lecture de page
  publique attendait le verrou des onglets de travail pendant un dépôt, la page redemandait en rafale. thecloset72000 :
  l'app n'a PAS conclu « extension absente » (`extension:false` = son téléphone). doriane-henri : get-pending-jobs tenait
  un Leboncoin « en cours » pour mort à 10 min et servait le suivant ; le DVD est publié (3297249838), rien relancé.
- Correctif `30d1e7e` : sonde qui repingue si le minuteur est en retard ; une seule lecture en vol par annonce ; dépôts
  Leboncoin qui attendent la reprise 30 min au plus ; `withJobFlowLock` inchangé. OTA 2.9.124 + get-pending-jobs v297+.

### Point 13 — bandeau de pause
- Retiré du haut du Stock par la refonte du 04/10 (`41e06d0`) vers une carte non comptée de la feuille « À régler ».
  Correctif `30d1e7e` : bandeau sous le titre du Stock, un par plateforme en pause, relecture bornée. OTA 2.9.124.

### Point 14 — tailles françaises → grille Depop
- Le jean Lee FR 50 : la question était juste (la grille Depop du rayon n'a pas de 50) ; « Other » est la réponse de la
  cliente, son annonce n'est pas touchée. Vrai défaut trouvé : une taille française tombait sur un tour de taille W du
  même nombre (grilles 24/62 : 25 jeans « W30 L32 FR40 » partis en « 40 » = W40). Correctif `06a6eae`.
- Grille relevée au navigateur (édition de l'annonce de test) : XS…XXL, puis des nombres nus (24…) — Depop n'affiche
  aucun système ; un « 38 » français part en « 38 » (inchangé).

## Preuves réelles (compte de Nico, extensions non empaquetées)
| Version | Geste | Résultat |
|---|---|---|
| 0.6.150 | publication Vinted (Kiabi) | 10576137564 à 21:31:53 |
| 0.6.150 | republication Vinted | 10576216857 à 21:38:18 (ancienne retirée) |
| 0.6.151 | publication Vinted « Sans marque » | 10576670884 à 22:16:54 |
| 0.6.151 | publication Depop jean femme 38 | publiée à 22:17:25 (Size 38 • Good condition • Lee) |
| 0.6.152 | publication Vinted, libellé de rayon périmé (« Tops and t-shirts », rayon 1868) | publiée (10576830425, 10576961041, 10577118226) mais par le MOTEUR DE RAYON du serveur après une question : le repli par identifiant n'a pas abouti (3 essais) — non prouvé, aucune relance automatique branchée dessus |

## Livraisons
- Extension : **0.6.152** (`build/CWS-0.6.152-A-TELEVERSER/fillsell-extension-0.6.152-f567f2e-cws.zip`, BUILD_ID `2026-10-28T21:51:44Z+f567f2e`), remplace les
  0.6.150 et 0.6.151 (rangées dans `build/CWS-PERIMES/`).
- OTA **2.9.124** (canal production relu). Web servi `631f472` puis le push final.
- Fonctions : handler-watch v142, get-pending-jobs v298, update-job-status v154 (verify_jwt relus avant/après) ; lens-analysis NON redéployée.

## Point 9 — suite (questions de Nico, 23:00)
- L'écriture groupée de 22:06:35 (15 jobs de Sébastien à « deleted », même deleted_at) est la réparation
  `20261028_sebastien_republications_beebs.sql` de ce terminal. Revérifié à 22:5x, annonce par annonce : 15/15 en 404 (témoin
  34238221, en ligne : 200 + « Ajouter au panier ») ; dressing public de « Sébastien C. » relu (119 annonces) : aucune copie
  (« Hublot » 34214535 = modèle Nikita, autre fiche, autre prix que le « Janna » à recréer).
- « La recréation échoue depuis le 26/10 » : elle n'a jamais démarré — dernière republication complète le 26/10 07:32
  (34238221) ; ensuite suppression envoyée → preuve impossible (403 du content script) → étape « captured » → la garde « une
  seule hors ligne » ne la comptait pas → cascade de 15. Racine corrigée (8a00ae1).
- Même trou, 2 cas de plus (Nico) : boncoin59300 ccbe94e3 (Vtech, 17700749 en 404, 1 096 annonces relues, aucune copie) →
  « deleted » ; recrutementgroupezk704 1a323b66 (Levi's 514 J150, 34165538 en 404, seul J157 en ligne = autre exemplaire)
  → fiche « disparue » depuis le 26/10 20:21 et annonce Vinted d'origine supprimée : QUESTION à la personne, pas de
  recréation d'office. Réparations `20261028_beebs_suppression_envoyee_2.sql`, `20261028_beebs_levis_j150_question.sql`.
- Alerte « republication orpheline » : part aussi pour une suppression envoyée sans preuve (étape « captured ») après 30 min
  (`_shared/alerte-orpheline.js` suppressionEnvoyeeLe, handler-watch v142, commit c4b8421). Plus aucun cas en base hormis la
  question J150.

## Contrôle final (28/10 ~23:15) — comptes à extension vue en 7 jours, dernier état par article × plateforme depuis le 18/09
- Rouges restants = gestes de la personne (configuration vendeur Depop 12, eBay compte vendeur inactif 9 / à finir 5,
  connexions LBC 5 / Beebs 3 / Vinted 2, plateforme écartée, article vendu, accès Depop) ; refus de plateforme (Beebs
  « jamais en ligne » ×3 vérifiés en 404, eBay compte bloqué par eBay, Leboncoin sans option gratuite) ; questions vraies
  (Âge / Alimentation Beebs, frais de port Depop, ISBN, taille de bague, catégorie mele.marta / remialbertholl).
- Rouges de notre fait, avec issue automatique : Vinted « menus bloom » (12 grille_incoherente, 6 marque, 8 État vide XEWER)
  → repartent seuls quand chaque poste a la 0.6.150+ (message neutre en attendant).
- Aucun job « processing » de plus de 20 min ; aucun job à needsUserAttempts ≥ 5 chez les comptes vivants. Retraits Beebs en
  404 relancés en reprise espacée (thecloset ×2, louis ×1, sebastien ×1) : se ferment avec la 0.6.151+ (preuve par la page).
- Suite complète : 476 selftests verts (suite3) ; relancée sur l'arbre final (suite4).
