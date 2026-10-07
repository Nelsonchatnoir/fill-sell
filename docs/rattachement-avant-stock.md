# Rattachement avant stock (07/10/2026)

> « Un article n'entre JAMAIS dans le stock tant qu'il n'a pas été rapproché de
> tout ce que l'utilisateur a déjà. » — Nico, 07/10

## Pourquoi

Corinne Basalo (inscrite le 07/10 à 11:28 ; Vinted 353, Leboncoin 333, Beebs 266) :
449 puis 551 articles pour environ 350 réels, des titres en double partout.

| Ce qui se passait | Où |
|---|---|
| Chaque annonce sans preuve par identifiant attendait l'empreinte de SA photo, comparée aux couvertures du stock **qui en avaient une** (186 sur 353 à 12 h) ; faute de preuve, elle était **importée** | `rapprocher_traiter_annonce` → `rapprochement_photo_attente` → `fusion_photo_tick` |
| La ressemblance devenait une question posée entre DEUX articles côte à côte (règle du 27/09 « on crée, et on demande ») | `rapprocher_importer` → `releve_poser_question` |
| La boucle de l'extension s'arrête à 2 min (12 tours) : « 281 à reprendre au prochain relevé », qui ne vient que sur un nouvel appui (relevés sur geste, 05/10) | `background.js` `RELEVE_MOTEUR_DUREE_MAX_MS` |
| Classement coûteux : `rapprocher_classer` relisait tout le stock pour chaque annonce | 143 ms/annonce mesurés chez Corinne |

Les « 18 refus automatiques » de Corinne n'en sont pas : ce sont 18 « Non » tapés
par elle entre 11:45 et 11:58 (`inventaire_doublons.decide_par = 'utilisateur'`),
sur des propositions pour la plupart fausses (Pantalon/Blazer, Pull/Bonnet,
Robe/Bottines). Un « Non » laisse les deux articles dans le stock (ils sont
différents) : si l'un était en fait le même, c'est un doublon de plus.

## Ce qui tourne maintenant

Migration `20261007140000_rattachement_avant_stock.sql`, fonction edge
`rapprochement` (verify_jwt **false**, garde `x-cron-secret`).

1. **Le relevé ne rapproche plus dans l'extension.** `rapprocher_releve` garde
   ses gardes (hors liste, eBay hors compte, relevé vide), la revue des
   questions, les absences et les verdicts, puis met le compte en file
   (`rapprochement_comptes`) et réveille la fonction `rapprochement`. Il rend
   `restantes: 0` : l'extension 0.6.102 ne boucle plus 2 min.
2. **Le moteur va au bout, seul** (`rapprochement_avancer`, un passage borné
   par compte, sous verrou consultatif ; la fonction edge l'appelle en boucle,
   110 s, puis se relance une fois ; filet `rapprochement-1min` qui ne part que
   s'il y a un compte en retard ; `trg_rapprochement_fin_run` le réveille à la
   fin — ou à l'arrêt — de chaque relevé).
   - **A. Attente des relevés** : rien ne se tranche tant qu'un relevé du
     compte (dressing Vinted compris) est en file (< 30 min) ou vivant (< 10 min).
   - **B. Empreintes** : annonces à classer + couvertures du stock, calculées
     EN PARALLÈLE par `empreintes-urls` (6 photos par appel, 10 appels à la
     fois). 8 passages de 200 au plus : une photo illisible ne bloque rien.
   - **C. Classement** (`rapprochement_candidats`, sur une lecture du stock
     faite UNE fois par passage — `rapprochement_lire_fiches`) :
     | Cas | Décision |
     |---|---|
     | identifiant d'un dépôt FillSell (ou dépôt clos) | rattachée (voie d'avant, inchangée) |
     | même photo qu'UN SEUL article en stock, autre plateforme, pas de variante | **rattachée** (preuve du 06/10, `motif = 'photo_identique'`, lu par `retrait_job_prouve`) |
     | photo ambiguë (plusieurs articles, même plateforme, deux annonces, variantes), titre exact, annonce remplacée, homonyme (en stock ou VENDU), titre inclus, faisceau | **proposition HORS du stock** (`annonces_plateforme.proposition`, `avant_stock: true`) |
     | aucun candidat | `rapprochement_nouvelles` (création après) |
     Veto **type d'objet** (`titre_types_objet`, familles fermées : pantalon,
     robe, veste/blazer/manteau, pull, haut, bonnet, chaussures, sac…) : 6 refus
     évités, 0 « oui » écarté sur les 1 516 paires tranchées par le parc.
   - **D. Création**, une fois TOUT classé : contre les articles créés dans
     cette phase (même photo vue sur Leboncoin puis Beebs → UN article ; un
     doute → proposition), sinon `rapprocher_importer(…, 'rapprochement')`
     (pas de question reposée). Jamais sans geste (`releves_sur_geste`), jamais
     d'annonce hors ligne, jamais pendant la dette Beebs.
   - **E. Fin** : si un dressing Vinted a tourné pendant la vague, la fusion
     photo SÛRE existante (`fusion_photo_compte`) passe sur les articles de la vague.
3. **`rapprocher_traiter_annonce`** (file photo d'avant, rattrapage) : identifiant,
   notification, hors liste, question de dépôt — inchangés ; sinon « differe »
   (le moteur du compte). Plus aucun import automatique hors du moteur.
4. **Fusion** : `push_ventes` et `remises_en_vente` suivent l'article gardé, et
   reviennent en défaisant. « Oui » sur un article VENDU → job de suivi
   « vendu, encore en ligne » (bandeau existant « retirer ? »).
5. **Reprise** (handler-watch) : un relevé-geste arrêté AVANT d'avoir écrit sa
   liste repart UNE fois en file (`<geste>:redemande`, reconnu partout comme
   un geste) ; il part au retour de l'extension. Liste déjà écrite : le run est
   clos et le moteur finit seul. Jamais deux reprises.
6. **App** (OTA) : `synchro_avancement()` → barre sur l'avancement réel,
   « Environ X min » (volume annoncé par chaque plateforme × vitesses mesurées
   sur 14 jours, `synchro_vitesses`, + vitesse du moteur sur le compte), une
   ligne par plateforme puis « Rapprochement » ; la synchro reste « en cours »
   tant que le moteur tourne ; à la fin « Ton stock est prêt » et « N annonces
   à vérifier » ; « Annonces à vérifier » dans À régler (comptées par la tuile)
   ouvre l'écran de rattachement (un article choisi → rattachée ; « Créer un
   article depuis cette annonce » → créée ; « Ignorer » → hors de la file).

## Mesures

| | Avant | Après |
|---|---|---|
| Classement d'une annonce | 143 ms (60 annonces : 8,6 s) | 14 ms (Corinne, 385 annonces : 5,3 s de base) |
| Empreintes | 24 photos/min (cron) | 720 photos en 53 s (parallèle) |
| Rapprochement d'un relevé | 2 min dans l'extension, puis « à reprendre au prochain relevé » (des heures, des jours) | dans la foulée, côté serveur |
| Durée d'une synchro taille Corinne (Vinted 353, LBC 333, Beebs 266) | Vinted 36 s ; LBC 2 min 45 (dont jusqu'à 2 min de boucle) ; Beebs 6 min 10 ; rapprochement jamais fini sans nouvel appui | relevés sans la boucle (≈ 1 + 4 min, un après l'autre) + rapprochement ≈ 1 min (empreintes ≈ 50 s + classement 6 s) |

Photo identique : sur les 31 paires que Corinne a confirmées « même article », 21
ont la même photo (taille pleine), 18 en vignette Leboncoin. Comparer les 3
premières photos des articles (et pas seulement la couverture) n'apporte que 17
preuves de plus sur 252 doutes : ses photos diffèrent d'une plateforme à l'autre.

## Preuves (transactions annulées, rien d'écrit)

- `scripts/reparations/20261007_preuve_rattachement_avant_stock.mjs` — compte
  neuf fictif Vinted + Leboncoin + Beebs : 0 doublon pendant et après la
  première synchro (7 articles attendus), synchro suivante stable, « Oui »
  rattache, vente d'un article rattaché → retraits Leboncoin ET Beebs armés,
  republication d'un article rattaché → vise la bonne annonce.
- `npm run selftest:rattachement-avant-stock` — les invariants (base, fonction,
  chien de garde, app).
- `scripts/apercu/capture-synchro-avancement.mjs` — la barre, le temps, la fin (375/430 px).

## Rattrapage du parc

`scripts/reparations/20261007_rattrapage_releves.{sql,mjs}` (inverse :
`20261007_rattrapage_releves_INVERSE.sql`, prouvé : Corinne revient octet pour
octet). Rejoue la règle sur les articles importés par l'ancien moteur :
fusion sûre (photo) ; doute sur un article INTACT → sorti du stock, son
annonce redevient une proposition (sauvegardes `_backup_0710_rattachement_*`) ;
doute sur un article touché → reste, question posée ; aucun candidat → reste.

Simulation du 07/10 (transactions annulées, un compte par transaction, après
empreinte de 11 518 photos du parc) :

| | Parc (98 comptes, 64 touchés) | Corinne |
|---|---|---|
| Articles importés par l'ancien moteur | 3 751 | 157 |
| Fusions sûres (même photo) | 219 (dont 49 entre deux imports) | 12 |
| Sortis du stock → « Annonces à vérifier » | 1 035 | 90 |
| Questions (article déjà touché) | 146 | 3 |
| Laissés tels quels (aucun candidat) | 2 351 | 52 |
| Stock | 23 653 → 22 399 | 518 → 416 |
| Titres en double dans le stock | 1 574 → 1 169 | 24 → 12 |
| Échecs | 0 | 0 |

Corinne, moteur enchaîné sur ses 385 annonces en attente : 67 rattachées par
la photo, 256 propositions hors stock, 59 créées (3 regroupées) → stock final
475, 6 questions ouvertes ; les titres encore en double sont surtout
Vinted–Vinted (deux annonces Vinted = deux exemplaires, hors du périmètre).

## Inverse de la migration

`scripts/reparations/20261007140000_rattachement_avant_stock_INVERSE.sql` —
les sept fonctions remplacées dans leur définition EN PROD du 07/10, puis le
retrait des objets neufs (prouvé à blanc).

## Pause de relevés

`public.pause_releves` + trigger `garde_pause_releves_compte` (posés le 07/10
à 12:43 pour Corinne, Leboncoin et Beebs) : un relevé « annonces » d'une
plateforme en pause est refusé en silence. Gardé (il peut resservir) ; toute
pause active est listée dans l'ops-digest de 8h50, en rouge au-delà de 24 h.
Lever : renseigner `leve_le`.
