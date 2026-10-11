# Louis, 11/10 après-midi — ancienneté de la republication, boutique Vinted, quota

## Point 1 — l'ancienneté de la republication automatique

**Preuve (lecture seule, `republish_planifiee_candidats` en prod)** :
- **Vinted** : l'âge vient de `inventaire.listed_at_guess`, l'horodatage de la photo LU SUR L'ANNONCE à chaque
  relevé (`background.js`, `photo_ts`) — pas la date d'import. Le `published_at` des jobs d'import (20/09 → 11/10)
  n'entre pas dans le calcul. Louis : **181 annonces éligibles à 30 jours, toutes sur @evat** (371531).
- **Leboncoin, Beebs, Depop** : l'âge venait du dernier job publié — pour une annonce importée, le job du relevé,
  daté du jour de l'IMPORT. C'est le défaut, corrigé ici pour Leboncoin.

**Pourquoi Louis n'en voyait que 2 ou 3** : ce n'est pas une date. Cette semaine, 3 republications Vinted (aujourd'hui
12:00 → 12:27, toutes @evat). Son réglage Vinted : le dimanche seulement, 12:00-17:00. Puis Chrome est passé sur
**@neyenonie** (sonde à 12:50), dont aucune annonce n'est éligible (toutes en ligne depuis moins de 15 jours) ; les
181 de @evat attendent que @evat soit ouverte dans Chrome pendant le créneau — une boutique n'est jamais republiée
depuis une autre (règle). L'écran compte la boutique ouverte. **Ce qui manque pour Vinted : rien côté date** ; il faut
@evat ouverte au créneau (ou un créneau par boutique), décision à prendre.

**Corrigé (Leboncoin)** :
- extension **0.6.108** : le relevé lit `first_publication_date` (« 2026-10-11 10:09:12 », heure de Paris, vérifié
  sur l'annonce 3286147174), l'écrit dans `annonces_plateforme.publiee_le` si la colonne existe ;
- migration **20261011151000 APPLIQUÉE** (feu vert de Nico) : colonne + `republish_planifiee_candidats` (définition en
  prod) — un job d'IMPORT (`releve-annonces`) prend la date lue, si elle existe et n'est pas postérieure au job ; sinon
  la date d'avant. Vinted inchangé. Coût mesuré : 80 ms pour le plus gros compte Leboncoin (index unique).
- **Beebs, Depop** : aucune date de mise en ligne lue aujourd'hui (Beebs : seulement `modifie_le`) → comportement
  d'avant (règle 5). Source à trouver sur leurs données réelles.
- Rattrapage : la date se lit au prochain relevé de chaque compte (geste « Synchroniser », lecture seule chez
  Leboncoin), dès que la 0.6.108 est installée. Aucun relevé lancé par nous (règle du 05/10).

**Anti-rafale** : la fonction ne fait que dire QUI est éligible ; créneaux, espacement, pauses, plafonds du jour, du
palier et de la boutique restent ceux de `republish_planifiee_sweep`. Éligibles en plus, estimés (date estimée par le
numéro d'annonce, que Leboncoin attribue dans l'ordre, calé sur nos dépôts datés) :

| compte | réglage | imports Leboncoin en ligne | éligibles avant | éligibles estimés après |
|---|---|---|---|---|
| joc… | 7 j | 153 | 124 | 128 (+4) |
| lou… (Louis) | 7 j | 42 | 42 | 42 (+0) |
| voi… | 14 j | 9 | 9 | 9 |
| jos… | 20 j | 9 | 8 | 8 |
| xxe… | 7 j | 1 | 1 | 1 |

À 30 jours (si ces comptes passaient à 30) : joc… +29, jos… +8, voi… +7, xxe… +1, Louis +0 (ses annonces Leboncoin
ont toutes moins de 30 jours : il republie tous les 7 jours). Aujourd'hui, juste après la migration : **0** de plus
partout (aucune date encore lue).

## Point 2 — un article de @neyenonie publié sur @evat

- **L'article** : « 12 adaptateurs pour pots La Laitière – M » (fiche 1789828032799, boutique @neyenonie 247512093).
  **Annonce partie sur @evat : https://www.vinted.fr/items/10327294017** — en ligne, NON supprimée (à toi de
  décider). Job ffc26361, 11/10 10:40 (créé) → 10:45 (déposé).
- **Comment** : Louis a confirmé la vente de l'annonce 10289147239 dans « Ventes à confirmer » ; la remise en vente
  (quantité restante 9 995) a créé une PUBLICATION Vinted. Aucune garde de boutique ne s'appliquait à une publication
  (`identite-boutique.js` : « une publication neuve part toujours sur la boutique ouverte dans Chrome ») ; Chrome était
  sur @evat ; l'extension n'a lu la boutique qu'APRÈS le dépôt (`users/current_apres_depot`).
- ⚠️ La fiche porte maintenant l'annonce @evat (`vinted_item_id` 10327294017) avec la boutique @neyenonie :
  incohérente, laissée telle quelle (aucune republication possible avant le 23/10, `listed_at_guess` 08/10).
- **Les 186 imports « sans vinted_account_id »** : la boutique d'un article est sur la FICHE
  (`inventaire.vinted_account_id`), pas dans le job : 187 des 190 imports Vinted de Louis l'ont (@evat) ; 3 n'en ont
  pas (aucun relevé ne la prouve).
- **Règle** (get-pending-jobs **v235**, `verify_jwt` true) : une publication Vinted (remise en vente comprise) ne part
  que sur la boutique de sa fiche — autre boutique ouverte → attente nommée, reprise seule quand la bonne est vue ;
  session illisible chez un compte à plusieurs boutiques → gardée en file ; article sans boutique chez un compte à
  plusieurs boutiques → la question fermée « Boutique Vinted » (jamais un défaut) ; boutique non confirmée → retenue.
  Compte à une boutique : inchangé. Retraits / republications : garde existante, inchangée. Mesure 14 j (9 comptes
  à plusieurs boutiques, 2 actifs) : 71 publications, 2 parties ailleurs, 2 sans boutique.
- **Parc, 60 jours** : 2 publications parties ailleurs que la boutique de leur fiche — celle de Louis, et une de
  f8aa02a5 le 03/10 (annulée depuis).
- **Rattrapage** : 47 imports rattachés à leur boutique prouvée par le relevé qui les a créés (3 comptes ; un seul
  `vinted_user_id` dans la fenêtre, aucun relevé muet, boutique confirmée). Sauvegarde
  `_backup_1110_boutique_imports_vinted`, inverse dans `scripts/reparations/20261011_boutique_imports_vinted.sql`.
  Non touchés : 327 (boutique non confirmée par le compte — la base la refuse de toute façon), 17 504 (relevés
  d'avant l'enregistrement du `vinted_user_id`, aucune preuve). Louis : 0 (ses 3 n'ont pas de preuve).
- Reste : la vérification AVANT dépôt dans l'extension (la session peut changer entre le service et le dépôt) —
  prochaine extension.

## Exception de quota — Louis, 1 000 annonces par mois

- **Où** : table `public.quotas_par_compte` (migration **20261011150000 APPLIQUÉE**, feu vert de Nico), une ligne pour
  Louis (1 000, motif, date). Fermée aux clients (RLS, aucun droit ; vérifié : 42501 en lecture comme en appel).
- **Lue partout** : `quota_annonces_compte(user, palier)` = réglage du compte, sinon `coin_config
  quota_annonces_<palier>` ; dans `quotas_etat` (compteurs de l'app, publication en lot), `spend_coins_for_generate`
  (rédaction : stepper, Stock, lot) et `spend_coins_for_lens`. Scans, retouches, voix, republication : inchangés.
- **Ce que Louis voit** : « Annonces : 189 utilisées sur 1 000, 811 restantes » (quotas_etat lu comme son app,
  transaction annulée) ; retouches 50, republication illimitée, inchangées.
- **Contrôle** : 2 977 comptes — un seul a un quota effectif différent de son palier, Louis (business → 1 000) ;
  clés `quota_*` de coin_config identiques à la photo d'avant ; un autre compte Business reste à 300.
- **Retirer** (retour automatique au palier) :
  `delete from public.quotas_par_compte where user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';`

## Search Console

« Valider la correction » lancé dans la Search Console, propriété `https://fillsell.app/`, rapport Vidéos, pour
« Il manque le fuseau horaire… uploadDate » ET « Valeur de date et heure incorrecte pour uploadDate » : les deux en
« Commencé » (11/10/2026).

## Servi

- get-pending-jobs **v235** ; migrations 20261011150000 et 20261011151000 appliquées et inscrites ;
- OTA **2.9.82** (build `2026-10-11T11:25:26Z+c369c37`) ;
- extension **0.6.108 À TÉLÉVERSER** : `build/CWS-0.6.108-A-TELEVERSER/` (embarque la 0.6.107, rangée dans
  `CWS-PERIMES/`, jamais téléversée) ;
- selftests : 260/261 (seul rouge, déjà rouge avant : `veille-commandes`) ; nouveaux :
  `publication-boutique-vinted` (26), `quota-et-date-reelle` (20).
