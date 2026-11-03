# Reprise — retraits à tort, ventes Leboncoin doublées, gjehly (03/11/2026 soir)

Rapport complet : `docs/enquetes/retraits-a-tort-0311/RAPPORT.md`. Règles : `docs/regles/ventes-et-retraits.md` et
`docs/regles/republication-et-publication.md`, sections du 03/11 soir. Mémoire : `rattachement-jamais-retrait-0311`.

## Livré (prod)
- **Règle** : un rattachement ou une ressemblance ne déclenche JAMAIS de retrait ; seule une vente prouvée APRÈS la mise en
  ligne d'une annonce importée la retire. Exception confirmée par Nico : le dépôt de FillSell pour la fiche reste retiré,
  même si la vente est vue en retard. Migration `20261103230000_rattachement_jamais_de_retrait` appliquée (banc jetable
  `PREUVE_PG=embarque node scripts/essais/20261103230000_banc.mjs`, 28/28 ; selftest `rattachement-jamais-de-retrait`).
- **Leboncoin** : « Vendu » dès la première lecture d'une annonce importée = vente ancienne, jamais une vente du jour
  (check-listing-status v39, `_shared/lbc-vendu-avant-suivi.js`, et la migration).
- **App, OTA 2.9.160** (1ae006c) : « Déjà vendu ? » sur une ressemblance → « Annonce à vérifier », jamais retirée ;
  programmation d'une publication décidée au clic (`champsDuJob`).
- **Réparations jouées** : `scripts/reparations/20261103_retraits_a_tort_etape1.sql`, `…_etape2.sql`,
  `…_etape2b_vinted.sql`, `20261103_gjehly_programmation_heritee.sql` (sauvegardes `_backup_0311_*`, inverses à côté).

## Les 10 remises en ligne (marqueur `platform_fields.remise_en_ligne_0311`, hors quota)
État à 21:57 :
- Leboncoin (JEAN-LUC) : perceuse 3224766875 → 3301825302 ; pharmacie 3233436490 → 3301835324 ; chiffons 3224902464 →
  3301845200 ; pâtes 3243205231 → 3301854373. Toutes en ligne.
- Vinted (JEAN-LUC) : serviette 10641989604 → 10654342020 ; balance 9332690165 → 10655374474. En file : boîte à café
  9613571304 (22:04), boîte marron 9613595410 (22:24).
- Beebs (Dylan) : Arcanin 34285076, Roublenard 34284932 — en file ; l'extension de Dylan n'a pas repris depuis 18:15.

## Reste à suivre
- Les 2 Beebs : l'adresse Beebs de Dylan est absente des Réglages, une question est possible. Roublenard reste
  « à vérifier » (une question plus ancienne, qui ne retire plus rien).
- Les 2 boîtes Vinted : relire leur résultat (catégorie « Rangement et organisation > Boîtes », choisie par Nico).
- Éponge LBC 3294205838 (JEAN-LUC) : NON remise — vente Vinted du 02/11 à confirmer par Nico.
- 10 drapeaux « Vendue » Leboncoin de la même classe restent ouverts (Chris1050 6, Jordy Rouleau 3, PILOU 1) : leur
  confirmation est refusée, ils ne sont pas effacés.
- gjehly : 88 tâches dans la file normale (à 21:31 : 7 publiées, 68 en attente) ; son onglet Vinted sous Brave bloque
  (« content script ne répond pas ») — poste, pas file.
- Extension, prochaine version unique (Nico) : la veille Leboncoin ne pose « Vendue » que sur une transition vue.
- Les 4 ventes du rattrapage Leboncoin du 23/10 n'ont pas été relues (même défaut possible).
