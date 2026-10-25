# Nuit du 24 au 25/10/2026 — chantier de nuit (« zéro rouge », Republier Vinted, push « Vente annulée », audit)

Message de Nico du 24/10 vers 23:45 : sept points, toute la nuit, zéro régression ; 0 mail, 0 notification à un
utilisateur ; aucune vente en cours touchée ; le short Quiksilver (Vinted, vente annulée) est le cas de test du point 2,
une seule fois ; fonctions et migrations autorisées cette nuit si essai à blanc + selftests verts + preuve en prod ;
extension 0.6.142 préparée, jamais téléversée ; OTA préparée, jamais envoyée. Heure de Paris partout.

## 1a. Dépôts et remises en ligne coupés : tranchés au relevé

**Cause prouvée (louis/Amiral, Leboncoin, 21/10)** : deux remises en ligne coupées sur la page
`/deposer-une-annonce/options` (« message channel closed ») ; get-pending-jobs a posé la question « une annonce pourrait
correspondre » (`recreation_deja_partie`) une seule fois — et plus rien ne la relisait :
- les deux annonces suspectes (3292326913, 3292489182) ont été vues deux fois le 21/10 (statut « inconnu ») puis par
  AUCUN des relevés complets suivants (louis : 22/10 22:21, 23/10 03:07 et 17:13, 24/10 12:10 ; louis-seller, même
  boutique Leboncoin : sept relevés) : l'article n'était plus en ligne nulle part, la question attendait ;
- la preuve par les photos ne pouvait pas jouer : les empreintes des photos des candidates n'avaient jamais été
  calculées (0 ligne `photo_empreintes`) ;
- la passe de handler-watch (15/10) ne savait que rattacher par les photos, et sortait sans rien faire quand les
  candidates avaient disparu ; les dépôts Beebs coupés (`depot_deja_parti`, Ciddjy) n'étaient relus par personne.

**Ciddjy (Beebs, 20/10)** : les trois annonces citées dans la question (34202692, 34202769, 34202839) sont celles
d'AUTRES fiches du même lot, chacune rattachée à son propre dépôt publié ; les quatre pyjamas en question (fiches
…871005, …871004, …871000, …514006) n'ont aucune annonce Beebs (relevés complets du 20/10 16:44 et du 22/10 18:01).

**Règle corrigée** (pour tous les comptes) : `_shared/depot-coupe-tranche.js` + handler-watch **v127** (déployée le
25/10 à 00:24:17, `verify_jwt` false avant et après) — voir `docs/regles/republication-et-publication.md` § 25/10 nuit.

**Preuves** : `selftest:depot-coupe-tranche` (fixture relevée en prod) ; essai à blanc sur le parc (6 questions →
6 relances) ; sauvegarde `_backup_2510_depots_coupes`, inverse `scripts/reparations/20261025_depots_coupes_INVERSE.sql`
(essai annulé vert) ; passage réel de 00:27 : les 6 jobs repartis une fois (louis c7526556, 88db7e2e ; Ciddjy 1819ed99,
23ef4d54, 5871f48a, 39b1a35e). 0 mail.

**Résultat (25/10, 01:56)** : louis c7526556 et 88db7e2e **publiées** à 00:29 et 00:33 (une seule annonce vivante par fiche) ; Ciddjy ×4 en file (poste éteint
depuis le 24/10 11:39 : partent à son retour, servies une fois).

## 1b. « FillSell attend le prochain relevé » : tranché, et le relevé est demandé

**Rejeu exact de handler-watch (avant correctif)** sur les 8 pauses « introuvable à confirmer » du parc (nino/Srideals ×2,
Jocabroc ×2, Marta, louis, Ornella, Blaf69 depuis le 20/09) : 8 × « attendre ». Causes : C1 l'absence ne se comptait que
sur des relevés commencés APRÈS la 1re lecture ratée (il en fallait deux) — ceux d'entre la dernière vue et la lecture
étaient jetés ; C2 relevés et traces lus depuis la veille de la lecture seulement ; C3 la page lue « Article vendu » n'était
vue qu'au classement (louis b56582b6) ; C4 personne ne demandait le relevé attendu.

**Règle corrigée** (`_shared/introuvable-a-confirmer.js` + handler-watch, règle :
`docs/regles/rapprochement-et-releves.md` § 25/10 nuit) : absence comptée depuis la DERNIÈRE VUE ; page lue « vendue » →
close avec le message de la vente ; relevé demandé par le serveur (`serveur:introuvable_a_confirmer`, ≤ 1 par 6 h par compte
et plateforme, poste en ligne, bonne boutique Vinted) ; migration `20261025030000` (le déclencheur entre dans
`releve_est_veille`, sinon `garde_releve_sans_geste` l'avalait en silence).

**Preuve en prod** : migration appliquée à 01:28 (essai 12/12) ; handler-watch v128 à 01:34. Premier passage (01:36) :
**5 closes, exactement le rejeu** — louis b56582b6 (page « Article vendu » lue par l'extension le 24/10 17:04),
nino b4bef8cf (absente de 7 relevés complets), Blaf69 a6e773d4 (2), Marta 133c921a « F1 2015 » (5), Jocabroc 961f0a27
« assiette de Nevers » (19) ; **un relevé Leboncoin demandé pour Ornella** à 01:36, fait à 01:40 (65/65), job d2c551a9
**tranché au passage suivant** (01:42, absente de 11 relevés complets). Restent 2, à la règle : nino f33c3f24 (poste
éteint depuis le 24/10 21:03) et Jocabroc 04659f4b (Vinted ; dernier relevé 24/10 21:18 → demandé après 03:18 si le poste
est en ligne sur la bonne boutique). Rien n'a été retiré ni publié par ces décisions ; 0 mail.

## 1c. Les défauts nommés par Nico

| Article | Cause prouvée | Correctif (règle, pour tous) | État au 25/10 02:00 |
|---|---|---|---|
| patrick.giry07 3730ef49 | « [selectors] vinted/publish.photo_input … n'a résolu » AVANT retrait (6 400 résolutions contre 5 échecs en 16 j) ; une source `prevol_negatif` héritée fermait la reprise | handler-watch : sélecteur non résolu = motif technique, repris même sous une source héritée ; la reprise efface la question héritée ; le réveil par capture archive le motif | en pause : la reprise attend une sonde fraîche de son poste (éteint depuis le 23/10 13:45) |
| Thibault dca41766 | « Espace de stockage » demandé SANS liste, 6 arrêts identiques (« malgré tes réponses » faux) : codes dédiés non repris par les extensions ≤ 0.6.133 | correctifs-extension : réarmement UNIQUE vers un poste ≥ 0.6.134 (reprise de la capture) | attend la mise à jour de son poste (relance une fois à la mise à jour) |
| sebbastien1 17715aee | rayon Beebs « Jouets en bois » tiré du mot « poisson bois gravé » sans la famille Lens (maison_deco) | `familleFiltreDesCandidates` (Beebs) : une famille maison filtre les feuilles, jamais un repli jouets | réparé (rayon « Décorations murales », script, 01:08:50) ; en file, poste éteint depuis le 19/10 |
| Fleur de Lotus c64e5596 | eBay voie clic : les photos n'arrivent jamais dans le brouillon (jamais vérifié) ; compte eBay PAS vendeur (onboarding pour ses 3 autres jobs) | non codé cette nuit (R1 vérifier la réception des photos, R2 refus nommé lu, R3 mur « inscription vendeur » étendu au compte) | NON relancé (relancer échouerait : compte non vendeur) — décision |
| Glowik 6d95f4eb | lien (34119130, mis en ligne par CE job) et copie (33946058) contradictoires → abstention ×5 | get-pending-jobs : copie réalignée quand le relevé le prouve, sinon arrêt avant retrait au vrai message ; extension : l'abstention dit sa cause | relancé UNE fois (script, 01:36:43, preuve relue au geste) ; poste éteint depuis le 24/10 20:12 |
| Jocabroc bfe46249 « Porte-savon » | accident AVANT retrait (page de dépôt rechargée ≈ 30 s après le remplissage), pris pour un geste « ferme Chrome » | `_shared/accident-avant-retrait.js` (règle A5 du 24/10, côté serveur) | **republié à 01:45** (remis en file 01:36 par handler-watch ; ancienne annonce 10297959284 retirée, nouvelle 10518493506 seule en ligne) |
| Deborah 83206086 « Lot de 10 pin's » | annonce JAMAIS retirée (étape captured, fiche active) : onglet muet 42 min ; « interrompue pendant la suppression » était faux | même règle | remis en file 01:36 ; poste éteint depuis le 24/10 22:52 |

## 1d. Titre « trop de majuscules » (décision de Nico)

Vinted seul (3 refus en 90 j, 0 ailleurs) : 7 capitales latines À LA SUITE (espaces et ponctuation ne coupent pas, un chiffre
ou une minuscule coupe) ; 0 des 104 048 titres acceptés en 90 j n'y arrive. `_shared/casse-titre.js` : casse normale, marque,
sigles, références, chiffres romains gardés, rien d'autre modifié ; branché au refus, sur les questions déjà posées, au
service et dans l'app (règle : `docs/regles/republication-et-publication.md` § 25/10 nuit). Thierry fde2a207 : remis en file,
titre corrigé au service par get-pending-jobs v281 ; poste éteint depuis le 24/10 13:13.

## 2. « Republier » Vinted pour une vente annulée

Fait : migration `20261025010000` appliquée (00:47:05), get-pending-jobs v280 → v281, extension 0.6.142
(`processRepublierVintedJob`), règle : `docs/regles/ventes-et-retraits.md` § 25/10 nuit. Le poste de Nico tourne la 0.6.142
(build du zip). **Test réel sur le short : NON fait.** Le bouton « Republier » remet en ligne l'annonce annulée à SON prix
Vinted (1 €), et la règle des tests exige une annonce à 999 € ou plus ; aucune autre voie ne change le prix avant la remise.
Dans le doute, rien n'est touché : 0 job « Republier » en base, le job 6c02755d reste annulé. À faire ensemble (voir
décisions).

## 3. Push « Vente annulée »

Préparée et testée, NON armée : migration `20261025040000` ÉCRITE (essai 19/19 en prod, annulé ; droits de
`push_annulations` déclarés), push-ventes v14 NON déployée, app prête (appui → « Ventes annulées », type
`vente_annulee`). Elle demande l'OTA (côté app) ET un appareil : 0 appareil enregistré, aucun secret APNs/FCM en prod —
aucun push ne peut partir aujourd'hui, ventes comprises.

## 4. Audit des arrêts (7 jours) et revenus

**Classement** (`scripts/zero-blocage-mesure.mjs --libelle nuit-2510 --depuis 2026-10-18`, résultat
`docs/enquetes/zero-blocage-2410/mesure-nuit-2510.json`, après le correctif N1) : 324 jobs arrêtés depuis le 18/10 —
188 arrêts de notre fait, 139 gestes de la personne, 28 plateformes, 7 gardes. En cours sur les comptes actifs : 23 de notre
fait (dont 10 « marque hors menu » en file, que la règle A3 relâche dès que leur poste porte la chaîne de repli ≥ 0.6.134 — la 0.6.141, servie par le Chrome Web Store depuis 00:28, les fera repartir seules ; et 3 « format de colis » : Vinted ne propose plus que des poids pour ces rayons, et « on ne le choisit jamais à ta place » — décision), 69 de la personne, 12 plateforme.

**Corrigé cette nuit (cause racine)** : N1 classement de la sentinelle (12 échecs invisibles : « Arrêtée à ta demande »,
`arret_utilisateur`, anti-robot et autre boutique = la personne) ; N2 sonde publique non mesurée prise pour « en ligne »
(update-job-status) ; interruptions d'onglet avant retrait (règle A5 au serveur) ; introuvables (1b) ; dépôts coupés (1a) ;
N7 vente écrite deux fois (verrou + relecture, VentesTab) ; N8 diagnostic « [object Object] » (extension) ; titres (1d) ;
pointure « EU N » (Marta) ; Beebs cycle/copie/rayon.

**Restent (notre fait, non codés cette nuit — prochain lot)** : N3 canal coupé APRÈS recréation (update-job-status rend
« Relance-la » ; la reprise sans geste ne prend que « captured » — 0 job concerné le 25/10 à 02:05) ; N4 Depop « EU 34 », « W38 », « M » non traduits
(24 jobs, 5 comptes, 4 abandons ; touche la règle du 28/09, voir décisions) et genre enfant demandé (7) ; N5 eBay Taille : l'IA pose un mot du titre hors gabarit ;
N6 eBay voie clic : retours non remplis → brouillon refusé (lemonde-glad ×3) ; N9 couleur Vinted sans couleur_auto, feuille
« …à l'unité » absente, mention « instagram » refusée par Leboncoin ; N10 jobs hors périmètre en file (eBay UK, Leboncoin
pour une adresse italienne) ; N11 Beebs XEWER : 27 dépôts sur 29 jamais vus en ligne (modération ou dépôt muet ?).
Signaux de blocage (`usage_logs`, 7 j) : `champ_requis_bloquant` 1 095 sur 28 comptes (affiché 537, complété 360, retiré
93, abandonné 61, bloqué au clic 36) — en tête : Beebs Taille 158 (dont 104 « Pantalons homme > Autre » pour un compte),
Beebs Âge 94 (« Livres > Autres livres » 66), eBay Longueur/Largeur/Hauteur (catégorie 79654, 13 abandons), Leboncoin
`shoe_size` 32 (10 abandons : la pointure « EU N », corrigée cette nuit) ; `abandon_plateforme` 15, tous après une
question ; relevés de ventes en erreur : Leboncoin `jeton_absent` 119 (52 comptes), Vinted http_400 39 / 401 25.
États faux relevés : 8 Beebs « publiés » sans lien ni numéro ; 9138772c (Vincent A.) retirée, deux envois non confirmés ;
931a27d7 (Ines) fiche vendue sans ligne de vente ; sebbastien1 : 27 publications « restreint jusqu'au 23/10 » (poste muet).

**Revenus** : 8 abonnés Apple actifs sur 11 sans date de fin (seule la résiliation l'écrivait) ; 0 ligne Google au journal
(dernier appel de Google le 05/10 ; un appel sans données ou illisible ne laissait rien). Corrigé : google-play-webhook v30
(une ligne par appel avant tout décodage, jeton haché, OIDC en mode « observer »), validate-apple-receipt v33, migration
`20261025020000` appliquée (01:32) ; **apple-iap-webhook NON déployé** : esm.sh ne construit plus `@peculiar/x509@1.9.0`
(« no space left on device », trois essais 01:35 → 01:50) — la v37 tourne, inchangée ; le rattrapage des 8 dates
(`scripts/reparations/20261025_fin_periode_apple_rattrapage.sql`, sauvegarde + inverse) attend ce déploiement.

## 5. Vérifications demandées

- **Ornella, 10 republications Vinted depuis le 15/10** : pas un défaut. Les 10 articles sont sur sa boutique @ornella-vend
  (472079) ; Chrome est ouvert sur @luciatrendyshop (257364012) — Vinted refuse tout retrait (403) ou capture (404) hors de
  la boutique propriétaire ; l'app dit « ouvre ta boutique @ornella-vend ». Geste : ouvrir @ornella-vend une fois.
- **Rég (asgarde67) 6f1b1f70 « Moby Dick » depuis le 18/10** : notre retenue ISBN ne laisse passer qu'une valeur déjà
  prouvée ; la capture porte « 0000000000 » (10 zéros), jamais prouvée — 30 jobs ainsi (Rég 1, Vincent A. 29). Décision.
  Au passage : la regex `isoBuild` de get-pending-jobs avait perdu ses antislashs (filtre jamais appliqué) — réparée (v281).
- **Marta, 6 abandons Leboncoin** : régression du 28/09 (« EU 37.5 » jugé hors grille « 37,5 ») — corrigée (listes.js,
  app : web au push, mobile à l'OTA). Deux restes : l'Adidas 90ace0e4 partie en pointure 16 (Leboncoin 3294638238,
  Beebs 34229052) ; son adresse italienne que Leboncoin refuse (37 jobs Leboncoin, 0 publié). Décisions.

## 6. En attente depuis le 23/10

- **Hetzner / failles PHP** : aucune trace de PHP (cloud-init, images épinglées sans PHP, Caddy en reverse_proxy, dépôt sans
  .php). Rien à corriger. Le serveur de test fillsell-cloud-1 (id 168804683, ouvert le 05/10) tourne toujours (≈ 0,66 €/j,
  aucun client). Décision : le garder ou le supprimer.
- **Le 403 de lizzyguzzy** : prouvé dans les journaux API — `PATCH /rest/v1/profiles` → 403 le 23/10 à 22:11:58, à
  l'ouverture de session : l'app écrivait l'origine d'inscription dans des colonnes que `authenticated` n'écrit plus depuis
  le 06/07 (0 origine sur 3 229 profils). Corrigé : RPC `poser_origine_inscription` (migration `20261025013000`, 01:30).
- **Garder l'origine après suppression du compte** : déclencheur BEFORE DELETE → une ligne ANONYME par profil supprimé
  (`origines_comptes_supprimes`), vue `origines_inscriptions` (vivants + partis). Restes signalés : 15 abonnements eBay
  « actif » de comptes supprimés, 4 458 `ventes_supprimees` de 15 comptes supprimés (règle de conservation à décider).

## 7. Fin de nuit

- **Selftests** : suite complète 416/416 verte (01:53) ; lint : 0 erreur nouvelle dans les fichiers de la nuit
  (les 2 de vinted.js sont l'idiome `chrome` du fichier) ; `deno check` vert sur les fonctions déployées (apple-iap-webhook
  garde ses 2 erreurs de type du 17/06).
- **Déployé** (version et `verify_jwt` relus avant et après) : handler-watch v127 → v129 (false), update-job-status v148
  (false), get-pending-jobs v280 → v281 (true), ops-digest v39 (false), google-play-webhook v30 (false),
  validate-apple-receipt v33 (true). Non déployés : apple-iap-webhook (esm.sh), push-ventes (attend la décision push).
  Après déploiement (00:00 → 02:20, journaux des fonctions) : 0 erreur, 0 réponse non-2xx ; durées moyennes (p95)
  inchangées — get-pending-jobs 2,0 s (4,0) contre 2,2 s (4,2), handler-watch 6,7 s (8,8) contre 7,1 s (9,1),
  update-job-status 0,49 s (0,66) contre 0,47 s (0,64). Web a9ef815 servi à 02:05 (entrée et App en 200, avec et sans
  `Origin`) ; 5 ventes enregistrées après 02:00, aucune en double ; 0 mail depuis 01:20.
- **Migrations appliquées** : `20261025010000` (00:47), `20261025030000` (01:28), `20261025013000` (01:30),
  `20261025020000` (01:32). **Écrite, non appliquée** : `20261025040000` (push). `20261024235900` reste non appliquée.
- **Extension 0.6.142** : `build\CWS-0.6.142-A-TELEVERSER\fillsell-extension-0.6.142-355cbd0-cws.zip`
  (BUILD_ID 2026-10-24T23:42:26Z+355cbd0) ; la 0.6.141, ACCEPTÉE et servie par le Chrome Web Store depuis 00:28 (9 comptes à 02:04), est rangée dans `build\CWS-PERIMES\`. Poste de Nico :
  ce build exact (relu 01:50).
- **OTA 2.9.114 préparée, NON envoyée** (voir l'état de prod).

## Ce qui attend le feu vert de Nico, et les décisions

**Feux verts** :
1. **Zip 0.6.142** à téléverser : `build\CWS-0.6.142-A-TELEVERSER\fillsell-extension-0.6.142-355cbd0-cws.zip`
   (583 249 octets, sha256 `9ef60f898ae3c62d008ba4b1842c200d8637c66de4f768f1f2ec1f37d822c1c7`). La 0.6.141 a
   été ACCEPTÉE cette nuit (mises à jour Chrome dès 00:28) : plus aucun examen en cours, téléversable tout de suite.
2. **OTA 2.9.114** : `dist/` prêt (build 2026-10-25T00:03:06Z+a9ef815) ; envoi : `npx @capgo/cli bundle upload --channel
   production --bundle 2.9.114 --path dist`, puis relire le canal. Le web tourne déjà ce code (a9ef815, 02:05).
3. **Test « Republier » sur le short** : l'annonce Vinted 10144115529 est à 1 € (relevés du 22 au 24/10) — le geste la
   remet en ligne à 1 €, sous la règle des 999 €. Ses remises sont toutes « faites » : il faudra créer le job de test
   ensemble (script), poste allumé, une seule fois — ou décider d'abord du prix.
4. **apple-iap-webhook** dès qu'esm.sh reconstruit `@peculiar/x509@1.9.0` (contrôle : `curl -H "User-Agent: Deno/2.1.4"
   https://esm.sh/@peculiar/x509@1.9.0` → 200), puis le rattrapage des 8 dates Apple (script prêt).
5. **Suppression des 64 ventes en double** (af37fa49, 28/09) : `scripts/reparations/20261025_ventes_en_double.sql`
   (sauvegarde + inverse, essai vert) — refusée au mode auto, à lancer par toi.

**Décisions** :
- ISBN « 0000000000 » (10 zéros) : faire la preuve sur ton compte (un livre à 999 €) ou le tenir pour « 0000000000000 »
  — 30 republications retenues (Rég 1, Vincent A. 29).
- Marta : Leboncoin avec une adresse italienne (37 jobs en file, 0 publié) — refuser Leboncoin avant la file ? Et
  l'Adidas 90ace0e4 partie en pointure 16 (Leboncoin 3294638238, Beebs 34229052) : réparer par le circuit ?
- Format de colis Vinted : Vinted ne propose plus que des poids (5/10/20/30 kg) pour certains rayons, la copie porte
  « Petit/Moyen/Grand » (et l'inverse) — 3 republications attendent un choix ; une correspondance automatique ?
- Tailles Depop « EU 36 » face à une grille qui écrit « 36 » : la règle du 28/09 (point G) les tient pour différentes sur
  un vêtement (tour de taille « W36 ») — l'autoriser quand la grille Depop se déclare EUR ? (N4)
- Push : armer `20261025040000` + push-ventes v14 suppose un appareil et les secrets APNs/FCM (aucun aujourd'hui).
- Google Pub/Sub : activer l'authentification de l'abonnement push, puis `GOOGLE_PUBSUB_AUTH=exiger`.
- Serveur Hetzner de test fillsell-cloud-1 (≈ 0,66 €/j, aucun client) : le garder ou le supprimer.
- Comptes supprimés : 15 abonnements eBay « actif » et 4 458 `ventes_supprimees` gardés — règle de conservation.
- `EXTENSION_MIN_BUILD` (bandeau « mets à jour ton extension ») : le poser sur la 0.6.141 maintenant, ou attendre la 0.6.142.
- Ornella : ouvrir sa boutique @ornella-vend une fois dans Chrome (10 republications l'attendent) — la prévenir ?
