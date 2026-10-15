# Plus aucun « geste à faire » que l'app peut trancher seule — 15/10 soir (heure de Paris)

Mandat de Nico (Louis « Amiral », 5 gestes) + complément PAUGUES (poids Leboncoin en lot). Règles et fichiers :
`docs/regles/rapprochement-et-releves.md` et `docs/regles/republication-et-publication.md` (§ 15/10 soir).

## Servi
| Élément | Avant | Après |
|---|---|---|
| Migrations | — | **20261015190000** (le lien suit l'identifiant ; cascade annonce partagée ; tick) et **20261015191000** (correctif `DELETE … WHERE true`, pg_safeupdate) — APPLIQUÉES sur feu vert nommé, inverses dans `supabase/rollbacks/` |
| get-pending-jobs | v249 | **v250** (`verify_jwt` true) |
| handler-watch | v108 | **v109** (`verify_jwt` false) |
| rapprochement-ia | v6 | **v9** (`verify_jwt` false) |
| Web + OTA | 2.9.93 | **2.9.94** (build `2026-10-15T17:51:55Z+12ae5cb`) |
| Selftests | 311 | **313/313** |
| Extension | 0.6.113 à téléverser | inchangée |

## Louis — causes et issue
| Geste | Cause | Issue |
|---|---|---|
| annonce_partagee ×2 (0015bdd9, 317adae1) | FAIT PROUVÉ : lien de 7fe6a7b3 retrouvé par le titre le 24/09 16:41 (0.6.66), identifiant du dépôt (3276310850) posé le 25/09 sans que le lien suive ; relevé du 25/09 rattaché par ce lien ; garde du 27/09 en UPDATE seulement ; republication du 15/10 copiant le couple | liens remis d'accord par la migration ; jobs repartis 19:20 (317adae1 recapturé : sa copie venait de l'autre annonce) ; annonce 3275975415 rendue à « Bleu et Blanc » par l'identifiant (19:4x) |
| boutique_a_choisir ×2 (5b58db5c, 2a7009c8) | FAIT PROUVÉ : règle du 11/10 (question si article sans boutique chez un compte à plusieurs boutiques) | repartis 19:45 ; publiés 19:52 sur @evat (boutique ouverte) : https://www.vinted.fr/items/10390918548 et https://www.vinted.fr/items/10390930692 |
| État (150c7da9, Targus) | FAIT PROUVÉ : grille Électronique « État satisfaisant - fonctionnel » ≠ « État satisfaisant » ; question posée le 13/10 (0.6.110) jamais relue | répondu par FillSell (« État satisfaisant - fonctionnel », source : annonce capturée) ; en file, créneau Leboncoin (vendredi 16/10 08:00) |
| « Voir » | FAIT PROUVÉ (code) : une republication en question ouvrait « où en est ma republication », sans réponse, qui renvoyait à la file | « Répondre » ouvre la question directement |

## Parc
- Annonces portées par plusieurs fiches : 3 → 1. josephinecerni 3264977032 tranchée par les photos ; nicolas.menar
  Beebs 34035659 : la photo désigne la fiche « Lot 2 doudous » VENDUE → la personne décide (une vente est en jeu).
- needs_user : ~254 → 216. Clos par la règle : 6 articles vendus (Ornella 4, fmallet25, xxewwer), 1 fiche fusionnée
  (voirememe) ; repartis : 3 boutiques (Louis 2, Marie Vincent 1), 1 État (Louis). Affichés en pause, plus en geste :
  64 « plus en ligne » à confirmer, pauses techniques avant retrait, 4 eBay étranger, 3 plateformes écartées.
- PAUGUES : compte noté « poids exigé » (19:45) ; ses 11 questions + 8 en file se règlent en un geste.

## Restent de vraies questions (et pourquoi)
Paiement Leboncoin « Valider et payer » (FillSell ne paie jamais) ; connexions à refaire (sessions absentes,
autorisation Depop, eBay non relié, vérification anti-robot) ; comptes à finir chez la plateforme (nom/prénom
Leboncoin, paiement Depop, eBay, Vinted bloqué) ; données qui n'existent nulle part (poids d'un compte PRO, « Type
d'article neuf », taille Beebs « 1-2 ans », rayon Depop enfant/adulte) ; marques hors catalogue Vinted ; risques de
doublon (lot Beebs interrompu deux fois, boutique étrangère).
Non tranchés ce soir (règle proposée, pas posée) : camille.ferren recreation_deja_partie (1), DeadRoz titre contre
identifiant certain (1), xxewwer « Pure PS3 » sur l'annonce NFS (1), PAUGUES lampe « Produit* » (rayon Arts de la
table au lieu de Décoration › Éclairage), PAUGUES ISBN refusé (1), nicolas.menar Beebs (vente).

## Mesure
Tick (cron 53, toutes les 2 min) : 17 ms ; handler-watch, lecture des questions : 5 ms. Aucun appel IA ce soir
(identifiants et photos ont suffi).
