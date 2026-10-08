# Multi-synchro : une passe, un stock fusionné (08/10/2026)

> « Un seul appui sur Synchroniser relève TOUTES les plateformes connectées.
> L'utilisateur reçoit son stock DÉJÀ FUSIONNÉ ET RATTACHÉ. » — Nico, 07/10

## Ce qui s'est passé le 07/10 (Corinne, videdressingtiandco, coronado.maeva)

| Constat | Cause (prouvée) |
|---|---|
| 790 cartes pour ~350 articles, 334 « à vérifier » dans le stock | le moteur du 07/10 comparait UNE couverture à UNE couverture — la vignette Leboncoin (79×140) — sur l'image entière (d ≤ 5 / p ≤ 8) ; Vinted recadre en 3:4 : deux photos identiques ressortaient à 11-31 bits. Tout le reste devenait un doute, et le doute une fiche `a_verifier` que l'app 2.9.65 affichait DANS le stock |
| 238 cartes créées à 15:30 PC éteint | rattrapage + moteur lancés à la main (motif `rattrapage_0710`) |
| 759 propositions Opla, jamais tranchées | une annonce qui porte une proposition était sautée pour toujours |
| 36 annonces sans carte (coronado, hu.anastasia) | relevés automatiques : jamais classés, jamais créés |
| eBay relié « page de connexion » (fmallet25) | get-pending-jobs servait le relevé eBay à l'extension ; la personne a cliqué « Déconnecter eBay » |

## Le moteur v3 (`supabase/functions/_shared/rapprochement/`)

Un seul fichier de décision, le même dans la fonction edge (Deno) et dans le
selftest (Node) : `moteur.js` (+ `texte.js`, `photos.js`, `idf.js`, `passe.js`).

- **Photos** : jusqu'à 6 par annonce et par article, 6 lectures par photo
  (`photo_empreintes.dhash/phash` + `variantes` : centre 70 %, carrés 85 % du
  petit côté, 45/60/35 % du grand côté — `empreintes-urls` v4). Distance de deux
  annonces = appariement glouton 1-1 de leurs photos.
- **FORT** = même photo (2 paires ≤ 9, ou 3 ≤ 12, ou 1 ≤ 4) ET accord du titre,
  aucun conflit (type, couleur, taille, dimensions), AUCUN concurrent plausible
  des deux côtés. **DOUTE** = photo sans accord du titre, conflit, concurrent,
  photo seulement proche (≤ 12), titre très proche sans photo. **RIEN** sinon.
- ⛔ Jamais la photo seule, jamais le titre seul, jamais deux annonces d'une
  même plateforme dans un groupe (deux exemplaires). Même photo + même titre
  deux fois sur UNE plateforme → question « **Annonce en double ?** », hors du
  stock (point 1 de Nico). Trois annonces et plus sur la même photo = lots : rien.
- **Décisions de la personne définitives** : « Oui », « Non », « Ignorer »,
  rattachement manuel, identifiant d'un dépôt FillSell (`forcesDe`). Le
  rattrapage du 07/10 et les imports automatiques sont rejugeables (réparation).
- **Groupes** par arêtes fortes (preuves d'abord). Un groupe sans Vinted qui
  garde un doute → « à vérifier » en entier ; sinon nouveau.
- **Paires candidates** (`candidatsDe`) : tiroirs de pHash (4 × 16 bits) et
  dHash+pHash joints (8 octets), plus un index des mots des titres. Depuis le
  08/10 nuit, une collision de tiroir ne retient la paire que si les deux
  lectures qui collisionnent sont à ≤ 16 l'une de l'autre (distance exacte) :
  de63ca45 (5 plateformes, 785 nœuds) passait de 114 530 paires candidates et
  3,2 s à 273 ms ; Corinne 452 → 155 ms, plan identique à un doute près (devenu
  entrée au stock). Une fonction edge n'a que 2 s de CPU par requête.

## La passe (`rapprochement` v3, `rapprochement_v3_*`)

1. `rapprochement_v3_releves_en_cours` : rien ne se tranche tant qu'un relevé
   du compte tourne (dressing Vinted compris).
2. `rapprochement_v3_lire(user)` : tout le compte en un appel (articles,
   annonces vivantes des 4 plateformes, fusions, questions, intact).
3. Empreintes manquantes → mises en file PAR LA BASE
   (`rapprochement_v3_empreinter` : 100 appels pg_net de 6 photos à
   `empreintes-urls`), la fonction répond `empreintes` et se relance 12 s
   après (12 rangs au plus ; filet `rapprochement-1min`). Appris en prod le
   08/10 : un fetch edge → edge est limité à 60 appels/min, et le worker
   pg_net ne sert rien tant que la requête qui a appelé la fonction n'a pas sa
   réponse. Progrès persisté (`photos_manquantes`, `passages_photos`) : six
   relectures sans progrès → on classe avec ce qu'on a (une fusion exige la
   photo : jamais une fusion sans elle).
4. `passe()` → le plan (`planifier`) : `fusionner` (réparation), `attacher`,
   `groupe`, `a_verifier`, `annonce_en_double`, `creer`, `entrer_stock`,
   `question_caduque`, `ignorer`.
5. `rapprochement_v3_appliquer(user, plan, mode, geste)` par lots de 150, sous
   verrou : la base garde ses gardes — fusion seulement d'un article INTACT
   (`rapprochement_v3_fiche_intacte`, sinon question), jamais deux annonces
   vivantes d'une plateforme sur un article, jamais une paire tranchée reposée
   (index unique), marqueur « à vérifier » seulement sur un article intact,
   création seulement sur geste (`releves_sur_geste`) ou réparation.
6. `rapprochement_comptes` : `attente_releves` → `empreintes` → `decision` →
   `creation` → `termine` (lu par `synchro_avancement` : barre et « environ X min »).

**Relance idempotente** : mode `normal` = seules les annonces SANS article (et
les paires « en double » qui en touchent une) ; une annonce décidée n'est jamais
rejugée. Mode `reparation` (Nico) = les décisions automatiques d'avant le sont.

**Passe bornée (v12, 08/10 matin)** : `rapprochement_comptes.passages` compte,
en négatif, les passes consécutives entrées dans la décision sans rien écrire
(écrit avant la lecture : une invocation tuée par les 2 s de CPU reste
comptée). À 3, le compte s'arrête (« termine », `bilan.arret`, ops-digest en
rouge) ; un geste « Synchroniser » en rouvre 3 ; au-delà, correctif puis
remise à 0 par nous. Les « 189 créations refusées » de la réparation ne
venaient d'aucun quota (aucun sur ce chemin) : fiches supprimées par la
personne, annonces vendues ou non actives, retenue Beebs.
`docs/reprise/terminal-boucles-0810.md`.

## Mesures (08/10 nuit, transactions annulées puis prod)

Plan rendu en prod par `rapprochement` v8 sur Corinne (toutes les photos
empreintées) : 558 décisions — 172 fusions, 16 groupes, 130 à vérifier, 15
« en double », 74 entrées au stock, 151 questions caduques ; identique au
moteur local nourri des mêmes empreintes (0 écart).

| Compte | Avant | Après (réparation) |
|---|---|---|
| Corinne (Vinted 353, LBC 333, Beebs 265) | 454 stock + 334 à vérifier (790 cartes) | **prod 08/10 : 510 + 144** (13 « en double »), 134 fusions, 40 fusions refusées sur article modifié → question, 0 erreur |
| videdressingtiandco (Opla 253, Beebs 46, LBC 26, eBay 6) | 289 + 276 annonces sans article | 295 + 4, 262 rattachées |
| coronado.maeva (eBay 277) | 420 + 36 sans article | **prod 08/10 : 421 + 23** (17 « en double »), 0 sans article |
| Parc (106 comptes, 08/10 nuit) | 1 051 annonces sans article | 29 ; 421 fusions, 521 rattachements, 472 créations, 456 à vérifier, 530 « en double », 0 erreur |

Phase 1 (lecture seule, 07/10) : 0 fusion à tort sur 355 paires vues une à une
(Corinne), 42 (videdressing), 34 (coronado) ; ses 31 « Oui » : 26 retrouvés,
5 à vérifier, 0 raté ; ses 18 « Non » : 0 fusionné.

## L'orchestration

- `demander_sync_plateforme` : cadence (< 15 min) → `recent` (pas un refus) +
  rapprochement relancé ; eBay relié → `ebay-releve-api` réveillé tout de suite
  (pg_net) ; `get-pending-jobs` ne sert JAMAIS un relevé eBay à l'extension
  quand l'API est reliée.
- App : Vinted en cadence → `synchro_relancer_rangement()` (« ton stock est
  relu »), plus de `cadence_ui` refusée ; plateforme non connectée = ligne +
  « Me connecter » dans le résumé ; « Annonce en double ? » dans l'écran des
  doutes ; les « à vérifier » hors du stock (web et mobile, OTA 2.9.66).
- Extension 0.6.103 (zip `build/CWS-0.6.103-A-TELEVERSER/`) : un content
  script chargé mais muet se relance avant tout envoi à la page (toutes
  plateformes) ; serveur : relance après MAJ (`_shared/relance-apres-maj.js`).
- Réparation du parc : `scripts/reparations/20261008_reparation_rapprochement_v3.mjs`
  (`--lister`, `--simuler`, `--appliquer`), sauvegardes `_backup_0810_v3_*`
  (RLS, fermées), inverse `20261008_reparation_rapprochement_v3_INVERSE.sql`.

## Selftests

`npm run selftest:moteur-rattachement` (invariants du moteur sur des articles
fabriqués + chaîne serveur) ; `npm run selftest:rattachement-avant-stock`.
