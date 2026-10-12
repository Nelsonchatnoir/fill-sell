# ferreirasab (12/10) — la passe de rapprochement en tranches, le compte rangé

Rédigé le 12/10/2026 (UTC). Compte : `18e461c1-7107-4f40-b07f-6de8fb5c2948` (ferreirasab,
vêtements d'enfant : 1 752 fiches Vinted, 660 annonces Leboncoin, 788 Beebs, 18 eBay).
Branche : `claude/rapprochement-cpu-timeout-0229m9` (rien sur `main`).

## Ce qui est servi

| Pièce | État |
|---|---|
| Fonction `rapprochement` | v19 → **v22** (12/10 ~11:47 UTC), `verify_jwt: false` relu avant et après ; les 9 fichiers déployés relus et comparés octet pour octet au commit `71efb5f` : identiques |
| Migration `20261012120000_rapprochement_passe_en_tranches` | APPLIQUÉE, inscrite (table interne `rapprochement_tranches` RLS + droits retirés ; `rapprochement_v3_empreintes_compactes`) |
| Scripts `scripts/reparations/20261012_ferreira_*` | rejugement des rattachements de Nico (+ inverse), deux relances du moteur, deux « Annonce en double ? » |
| Selftests | **285/286 verts** (séquentiels, dépendances installées, historique git complet ; deno 2.1.4 avec `--no-lock`) ; le 286e, `lbc-mur-connexion`, vert sur sa partie statique, ne trouve pas Google Chrome dans le conteneur (extension, sans rapport). Nouveau : `selftest:rapprochement-tranches` |

Versions intermédiaires : v20 (11:03) et v21 (11:18) portaient le même moteur ; v20 différait du
dépôt par la représentation d'une plage de caractères (le connecteur rend `\uXXXX` en caractères
bruts — texte.js l'écrit désormais en ASCII), v21 avait le défaut d'ordre de lecture ci-dessous.

## 1. La cause et le correctif

**Cause.** Une fonction edge n'a que 2 s de CPU par appel. Le compte (3 082 nœuds, 59 028 lectures de
photos sur fond blanc : 708 336 entrées de tiroirs) demandait ~3,5 s de passe ; « CPU Time exceeded » à
chaque passe (09:01 → 09:30 UTC, 2,4 à 3,2 s mesurés), puis le disjoncteur arrêtait le compte.

**Correctif — la passe en tranches** (`_shared/rapprochement/tranches.js`, `moteur.js`, `index.ts`) :
les deux calculs lourds (paires candidates par parts de tiroirs, paires évaluées par morceaux) se
découpent en unités bornées ; une invocation fait des unités tant que son budget mesuré le permet
(900 ms visés, dont 550 de calcul), garde le résultat en base sous la signature des données lues, et
la suivante reprend. Quand rien ne manque, la passe se termine d'un trait sur les mêmes valeurs.
Aucun seuil changé ; disjoncteur et ops-digest conservés (une tranche qui garde quelque chose est un
progrès ; une invocation tuée ne l'est pas).

**Deuxième défaut, trouvé en prod (11:29) : la lecture n'avait pas d'ordre.** `rapprochement_v3_lire`
agrège sans ORDER BY ; selon la connexion, deux lectures des MÊMES données rendaient deux ordres →
deux signatures en alternance (une seule chaîne, aucune écriture entre deux appels) → chaque tranche
effaçait la précédente → disjoncteur. Correctif : `ordonner` (passe.js) range tout par identifiant
avant la signature et la passe (v22). Le moteur v19 avait le même défaut sans le voir : l'ordre des
nœuds départageait ses égalités au hasard de la connexion.

**CPU par invocation (journaux de prod)** : CPU mesuré dans la fonction (`cpu_ms` : lecture des
réponses, signature, calcul, écriture du chantier) — 11:03 → 12:10 UTC, 109 invocations journalisées (tous
comptes) : de 50 ms (étape empreintes) à **822 ms au plus**, ~490 ms en moyenne, aucune au-delà du budget de 900 ; une passe complète de ferreirasab =
8 à 10 invocations de ~4,5 s chacune. **Aucun « CPU Time exceeded » de `rapprochement` depuis le
déploiement** (les derniers, 10:01 → 10:23, sont ceux d'`empreintes-urls`, autre fonction).
Avant : 2,4 à 3,2 s par passe, tuée à chaque fois.

## 2. La preuve d'équivalence

`scripts/preuves/preuve-rapprochement-tranches.mjs` : sur les données réelles (lecture seule), le
moteur de référence v19 (`c8b44ab`, d'un seul tenant), le moteur actuel d'un seul tenant, et le moteur
actuel en tranches (chaque invocation repartant de zéro, cache passé par du JSON, budget 550 ms) :

| Compte | normal | réparation |
|---|---|---|
| Corinne | IDENTIQUE (0 décision) | IDENTIQUE (214) |
| de63ca45 | IDENTIQUE (0) | IDENTIQUE (3) |
| 7373c96c (catalogue) | IDENTIQUE (15) | IDENTIQUE (27, avant ordonner) |
| aaf6 (petit) | IDENTIQUE (3) | IDENTIQUE (80) |
| 0a24 | IDENTIQUE (0) | IDENTIQUE (24) |
| 7804 | IDENTIQUE (50) | IDENTIQUE (76) |
| ferreirasab | IDENTIQUE (958) | IDENTIQUE (1 003) |

Décisions ET ordre identiques. Côté serveur : la simulation de la v21 sur l'état d'avant = le moteur
local, 958 décisions, ordre compris ; sur l'état réparé, les mêmes 1 432 décisions.

## 3. Les rattachements faits à la main par Nico (12/10 matin)

Traités comme automatiques (script `20261012_ferreira_rattachements_nico_rejuges.sql`, sauvegardes
`_backup_1210_ferreira_rejuge_*`, inverse prêt) puis rejugés par le moteur. Résultat écrit :

| Lot de Nico | confirmés (même fiche) | question | autre | 
|---|---|---|---|
| titre + prix (315 en place) | 296 | 18 | 1 laissé libre (Beebs « en vérification ») |
| photo principale (60) | 58 | 1 | 1 article à part |
| jumeaux libres (47) | 29 | 16 | 2 articles à part (question posée) |
| jumeaux qu'ELLE avait ignorés (53) | **51** | — | 2 rendus à son « Ignorer » |
| détachés par Nico (148) | 56 rattachés à la même fiche | 91 | 1 autre fiche |

Les 53 « ignorées » rattachées par Nico : le moteur en confirme **51** ; les 2 qu'il ne confirme pas
reprennent son « Ignorer ». Ses propres décisions (≈ 190 « Ignorer », 22 rattachements, 1 import)
sont restées définitives. Tables de travail de Nico (`_cand_1210_ferreira`, `_detache_1210_ferreira`,
`_photo_cand_1210`, `_jumeaux_1210`) : NON supprimées.

## 4. Les paires Leboncoin : réelles

136 paires lues le 12/10 (112 annoncées dans la demande ; je n'ai pas reproduit ce chiffre) : même titre, même prix, même photo,
**deux identifiants, deux dates de publication, toutes deux en ligne, vues par le même relevé**. Un défaut
du relevé rendrait un même identifiant deux fois ; ce sont deux publications de la personne. Rien à
corriger dans le relevé ; la règle « Annonce en double ? » s'applique, jamais de fusion : 134 questions
posées par le moteur, 2 posées par `20261012_ferreira_annonces_en_double_photo_illisible.sql` (la
jumelle n'avait qu'une couverture illisible pour l'empreinte — même URL d'image que sa sœur).

## 5. L'état final (12/10 11:59 UTC, compte « termine », 0 passe inachevée)

| | avant (11:24) | après (11:59) |
|---|---|---|
| fiches vivantes | 1 752 | 2 336 (+ 586 imports : Leboncoin 329, Beebs 245, eBay 12 ; − 1 import fondu dans sa fiche Vinted ; − 1 fiche disparue, § 6) |
| stock visible | 1 594 | 1 663 |
| hors stock, « à vérifier » | 0 | 515 |
| vendues | 158 | 158 |
| annonces rattachées | 497 (dont 475 par Nico) | 1 327 (Leboncoin 660, Beebs 649, eBay 18) |
| annonces libres | 834 | 2 (Beebs « en vérification » chez Beebs : la base n'en fait pas d'article tant qu'elles ne sont pas en ligne) |
| annonces ignorées | 135 | 137 (les 2 « ignorées » que le moteur ne confirme pas) |
| questions ouvertes | 0 | 895 (148 « Annonce en double ? », 337 plusieurs candidats, 303 titre sans photo commune, 107 autres doutes : photo seulement proche, titre différent…) |
| article avec deux annonces d'une même plateforme | 0 | **0** |

Le plan, toutes passes : 699 rattachements (photo ET titre, sans concurrent), 1 fusion (un import eBay dans
sa fiche Vinted née plus tard, photo ET titre), 586 imports (les annonces sans fiche Vinted sûre :
nouvelles, ou avec leur question), 0 erreur ; 20 groupes Leboncoin + Beebs sans Vinted (chacun avec sa question vers une fiche Vinted).

**Contrôles** : ventes 4 → 4 (les 4 commandes Leboncoin anciennes, sans article) ; retraits : 0 job autre que
publication, avant comme après ; push_ventes 0 → 0 ; **4 bandeaux « Vendu ? Retire les autres »** (une
annonce Leboncoin/Beebs rattachée à un article déjà vendu sur Vinted : `pending_removal`, rien ne part sans
le geste de la personne) ; mails 3 → **4** : le 4e (`support_ferreira_stock_range_1210`, 11:40:36) n'est PAS
parti de cette session (aucun appel à la porte d'envoi ici) — envoyé par quelqu'un d'autre pendant que la
passe était arrêtée (11:29 → 11:49).

## 6. Ce qui reste

- **Fusionner la branche dans `main`** : la v22 tourne en prod depuis la branche ; un déploiement de
  `rapprochement` depuis `main` ramènerait la v19 (et la mort par CPU des gros comptes).
- **515 articles « à vérifier » / 895 questions** : à la personne (écran Doublons, « À régler »). Beaucoup
  sont des « plusieurs candidats » (vêtements d'enfant de même modèle, mêmes photos de fond blanc).
- **Les photos des 586 imports se rapatrient encore** (`handler-watch`, 24 photos toutes les 3 min pour tout
  le parc) : chaque lot change les photos lues et redemande des empreintes ; une passe en cours repart
  (une tranche sans progrès au compteur, remis à zéro par la tranche suivante). Rien à faire, ça se tarit ;
  à surveiller seulement si un compte s'arrêtait sur `passes_inachevees` pendant un rapatriement.
- **`empreintes-urls` dépasse parfois ses 2 s de CPU** (10:01 → 10:23) : les 2 jumelles Leboncoin sans
  question venaient de là. Hors périmètre, non traité.
- **Une fiche hors stock/vendu** présente à 11:24 n'existe plus à 11:59 ; aucune trace (job, rapprochement,
  journal) ; aucune écriture de cette session ne supprime de ligne. À regarder.
- La chaîne de relances s'arrête au rang 12 en fin de passe ; le filet d'une minute reprend (≤ 1 min de
  délai par passe). Rien de cassé ; on pourrait relever la borne pour une suite de passes Vinted.
- La preuve 7373c96c en réparation n'a pas été rejouée après `ordonner` (22 s ; identique avant).
- Le chiffre de 112 paires Leboncoin de la demande n'est pas reproduit (136 lues).
