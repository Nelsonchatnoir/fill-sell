# Reprise — terminal « Problèmes », clôture du 05/11/2026 (≈ 22:20, heure de Paris)

Ce terminal est fermé. Tout ce qui reste est listé ici. L'état de prod détaillé : `docs/agents/etat-2026-10-01.md`
(sections « 05/11 »).

## 1. Fait et en prod ce soir

| Sujet | Ce qui tourne | Preuve |
|---|---|---|
| Séries Leboncoin (migration 20261105170000, « a bis ») | appliquée 20:26:22 | preuve 77/77 ; les 7 ventes en série de Louis (faf5021a) seront prouvées à son prochain relevé « Mes annonces » (cron ~02:30) → 7 remises en vente |
| Un mail à chaque vente (20261105180000, C') | appliquée 20:27:11 | 1er mail de vente normal 21:03 |
| Rafale = UN mail récapitulatif + trace des notes écartées (20261105220000) | push-ventes v17 (21:02:09), migration 21:02:27 | preuve 68/68 ; les 171 notes « rattrapage de masse » d'avant ne partent jamais |
| Rattachement (20261105190000) : photo identique = preuve, P16 gardée, « Annonce en double ? → Oui » refusé sauf republication prouvée | appliquée 20:59:57 ; rapprochement v30 (moteur : jamais d'automatique sur un titre en série ni sans mot commun) ; écran Doublons : le motif du refus | preuve 101/101 |
| Réétiquetage « manuel » → source d'avant / « auto: » | script passé 21:08:06 (1 619 annonces, 2 394 fusions) | sauvegarde `_backup_0511_reetiquetage_manuel_auto` + inverse |
| Champs requis (taille, pointure, rangement) | web au push (484818a) | pas une régression (défaut ancien, 4 morceaux) ; selftest champs-requis-partages 80 |
| Mails de support | filtre Gmail « jamais en spam » ; 4 mails de Louis sortis du spam ; Worker « support-fillsell » SANS clé → fonction support-mail v1 → `support_mails` ; règle support@ → Worker (~21:31) | mail de test du 05/11 22:02 : archivé (n° 1, transfert « ok » 22:02:47) et reçu dans la boîte de réception |
| Juge des dépôts Beebs sans numéro | ALLUMÉ (feu vert de Nico), handler-watch v166 (22:06:41), fenêtre 14 jours | 6 fermetures relues sur Beebs, toutes justes ; simulation : 49 fermetures sur 6 comptes au premier passage (minutes 42-44 UTC) |
| R1 (mur Beebs pendant un retrait) | gardé (update-job-status) | 1 retrait mis en attente de session au lieu de brûler ses essais |
| R3 (digest rouge/orange/blanc) | COUPÉ (ops-digest v52, 22:13:28) | sur 5 rouges relus : 3 vrais, 2 faux (annonce désactivée / introuvable) → liste brute d'avant |
| Extension 0.6.175 | zip `build/CWS-0.6.175-A-TELEVERSER/fillsell-extension-0.6.175-cws.zip` (BUILD_ID 2026-11-05T20:38:34Z+1354a1d) | contient toute la 0.6.174 (40413c5 ancêtre) ; anciens zips dans `build/CWS-PERIMES/` |

## 2. Points arrêtés (STOP) — ce qui manque pour les finir

**1 c — une ligne dans fiche_annonces_vivantes (20261105210000, préparée, non appliquée)**
- 4 des 5 appelants changent de comportement (retrait d'office au lieu d'une question, question perdue).
- Piste à préparer : n'exclure que les annonces Leboncoin sous transaction dont la vente est DÉJÀ enregistrée (reçu
  `annonce:leboncoin:<n°>`) ; preuve sur base jetable que les 5 appelants restent inchangés ; feu vert de Nico.

**4 — règle « annonce publiée disparue » (handler-watch, JUGER_ANNONCES_PUBLIEES_DISPARUES = false)**
- Corrigée (f69c949) : jamais une annonce jamais vue en ligne, jamais sans numéro ; simulation : 17, toutes vérifiées parties.
- Il manque : relire la simulation la veille de l'allumage (le parc bouge), allumer (true), déployer handler-watch,
  surveiller la première tranche.

## 3. Reste à faire (décisions ou gestes)

1. **Vendu quelque part = retiré partout** (cause prouvée : `docs/enquetes/rattachements-0511/VENDU-RETIRE-PARTOUT.md`,
   fichier local non commité au moment de la clôture, voir § 4).
   - Migration 20261105240000_vendu_retire_partout PRÉPARÉE (preuve 72/72, selftest 61) : son application a été REFUSÉE
     par le garde-fou des permissions de la session → feu vert explicite de Nico pour l'appliquer.
   - Rattrapage par le circuit normal PRÉPARÉ (`scripts/reparations/20261105_regle_vendu_retire_partout_rattrapage.sql`
     + inverse), annonces RELUES sur les plateformes le 05/11 ~22:10 :
     - Doudou (fiche 1790106697754007) : Beebs 34032772 EN VENTE = même article que Vinted 10101127941 « Vendu » ;
     - Swatch (dépôt Beebs 232ab851) : Beebs 33145728 EN VENTE = même article que Leboncoin 3184771753 « Article vendu ».
     Son exécution a aussi été REFUSÉE par le garde-fou → feu vert explicite.
   - Doudou Leboncoin 3274924341 (en vente) : aucun geste sûr AVANT la migration (le dépôt porte le numéro du « Lot 2
     doudous » 3267000921) ; après elle : la question « Déjà vendu ? » puis « Oui » sur 3274924341.
   - Le lot 3267000921 : même objet ou non ? (question à Nico, ne pas retirer d'office).
   - T-shirt Friends (Beebs 34139613) : absente des 5 relevés complets du 15 au 20/10, compte sans relevé depuis → à relire.
   - « Pinceaux » (2 annonces Opla) : invérifiable (Opla quittée), hors rouge.
   - Les 16 « vraies erreurs » et les 43 « à côté d'une annonce encore en ligne » : seul le Doudou est vendu ; les autres
     ne sont pas concernés par cette règle (« pas vendu : rien à retirer »).
2. **Les 105 « à vérifier »** : liste complète dans `docs/enquetes/rattachements-0511/SIMULATION-338.md` § « À vérifier ».
   Par motif : 43 dépôts ou republications FillSell à côté d'une annonce encore en ligne (risque de double vente,
   sebastien64310 surtout), 20 titres différents mais photos identiques, 17 titres reformulés, 13 même titre à prix
   différent, 12 autres. Simulation corrigée le 05/11 soir (une annonce n'est vivante que si le dernier relevé l'a vue) :
   79 « à vérifier » restent. Rien n'y a été touché.
3. **Juge Beebs sans numéro** : suivre la première tranche (22:42-22:44 le 05/11, puis chaque heure) — 49 fermetures
   attendues ; le couper = `JUGER_BEEBS_SANS_NUMERO = false` + déployer handler-watch.
4. **R3** : à rallumer seulement si le juge relit l'annonce (ou exige un relevé récent) avant de dire « rouge ».
5. **Louis** : vérifier au matin du 06/11 que les 7 ventes en série sont prouvées et que les premières remises repartent.
6. **6 mails à support@ encore dans le spam Gmail** (avant le filtre) : un vrai client du 15/10 (« Erreur compte synchro
   eBay ») supprimé par Gmail vers le 14/11, un « STOP » du 24/10, 2 alertes FillSell « Paiement échoué » : à sortir ou non.
7. **Champs requis, à trancher** : (a) le rayon Beebs/eBay/LBC suit-il le public choisi sur Vinted plutôt que le genre de
   la rédaction ? (b) casquette « Medium-Large » → « taille unique » ? (c) une pointure posée par la rédaction sans source
   → traitée comme vide ? Essai réel sur fiches TEST (chaussures homme et femme) : scénario dans le commit 484818a.
8. **Extension 0.6.175** : après acceptation au Chrome Web Store, ajouter « 0.6.175 » à ALREADY_PUBLISHED et poser
   EXTENSION_MIN_BUILD = '2026-11-05T20:38:34Z'.
9. Sonde de session Leboncoin la nuit (1 requête/h) : la faire taire aussi ? (non touchée par la 0.6.175).

## 4. Fichiers non commités à la clôture (commit refusé par le garde-fou des permissions)

`supabase/migrations/20261105240000_vendu_retire_partout.sql`, `supabase/rollbacks/20261105240000_vendu_retire_partout_INVERSE.sql`,
`scripts/preuve-vendu-retire-partout.mjs`, `scripts/vendu-retire-partout-selftest.mjs` (ligne package.json :
`"selftest:vendu-retire-partout": "node scripts/vendu-retire-partout-selftest.mjs"`), `scripts/simulation-fiches-deux-annonces.mjs`
(corrigée), `scripts/reparations/20261105_regle_vendu_retire_partout_rattrapage.sql` (+ `_INVERSE`),
`docs/enquetes/rattachements-0511/VENDU-RETIRE-PARTOUT.md`, `docs/regles/ventes-et-retraits.md` (section 05/11 soir).
