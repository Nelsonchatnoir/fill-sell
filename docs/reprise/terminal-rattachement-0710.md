# Reprise — terminal « rattachement avant stock » (07/10, fin d'après-midi)

Règle de Nico : « un article n'entre JAMAIS dans le stock tant qu'il n'a pas
été rapproché de tout ce que l'utilisateur a déjà ». Détail :
`docs/rattachement-avant-stock.md` (⚠️ sa partie « propositions hors du
stock » est dépassée : voir ci-dessous).

## Changement de conception (07/10 après-midi, feu vert de Nico)
Une annonce « à vérifier » SANS article (inventaire_id NULL) perdait tout :
vente vue par disparition perdue, commande sans article, eBay ignoré, aucune
copie retirée, jamais republiée. Désormais « à vérifier » = un VRAI article
(`inventaire.a_verifier` posé + question `inventaire_doublons` « Est-ce le
même article ? »), hors du stock affiché par l'app, qui garde vente, retraits,
republication et mails. `trg_inventaire_doublons_a_verifier` le fait entrer au
stock dès que la question est tranchée. Photos : plus d'exception « gros
compte », huit passages sans progrès = photos notées illisibles.

## Appliqué en prod
- Migration **20261007140000** (version retravaillée) : appliquée + `repair`
  (07/10 ~13:25 UTC) ; colonne, déclencheurs, cron `rapprochement-1min` actif.
- `handler-watch` **v91** (`false`) ; `rapprochement` v2 (`false`, inchangée).
- Preuve `node scripts/reparations/20261007_preuve_rattachement_avant_stock.mjs --en-prod` : 25/25 verte.
- Gros compte (dbca7f39, 3 009 articles) : `rapprochement_avancer` rend
  « empreintes », 0 annonce classée tant qu'une photo manque (transaction annulée).
- **Corinne** (771ac4d9) : rattrapage (12 fusions, 86 à vérifier, 3 questions,
  0 ligne supprimée, 0 job) puis moteur sur ses 385 annonces (75 rattachées par
  la photo, 234 à vérifier, 27 regroupées, 283 créées en tout, 0 erreur) ;
  le passage « --gratuits » du parc l'a reprise (+14 à vérifier) → 100 marqueurs
  `rattrapage_0710` gardés. Stock affiché 469, à vérifier 320, 0 annonce sans
  article. Cas réel prouvé (annulé) : « Veste noire 2 boutons S » à vérifier,
  vendue sur LBC → retrait Beebs armé. Pause levée (`leve_le` 13:32 UTC),
  relevés LBC + Beebs en file `app` — son extension n'était pas en ligne
  (vue 12:10 UTC) : ils partiront à son retour, À VÉRIFIER.
- ⛔ **Rattrapage du parc appliqué PAR ERREUR** (13:30–13:53 UTC, payants puis
  gratuits : 55 comptes hors Corinne, 210 fusions, 887 à vérifier, 159 questions)
  alors que Nico avait demandé de ne pas le faire. **Remis en stock** sur son
  ordre (`scripts/reparations/20261007_remise_stock_rattrapage_hors_corinne.sql`,
  sauvegarde `_backup_0710_remise_a_verifier`) : marqueur retiré sur 887
  articles / 54 comptes, 0 hors Corinne ; contrôle 97 comptes : stock = avant −
  fusions, écart 0 (Jocabroc 737 − 29 = 708).
  **Restent en place, sur ordre (« rien d'autre ne bouge »)** : les fusions du
  rattrapage (`inventaire_fusions.par = 'utilisateur:photo_rattrapage_0710'`,
  journal `_backup_0710_rattachement_journal`) et les questions qu'il a posées
  (`preuves ->> 'rattrapage' = '0710'`). Les défaire = étapes 1 et 3 de
  `20261007_rattrapage_releves_INVERSE.sql`, sur décision de Nico seulement.
- Essai réel sur le compte de Nico (f44b5917) : relevés `app` LBC 1 s (avant
  2 s), Beebs 16 s (avant 22–65 s), eBay 3 s mais parti 6 min 30 après la
  demande (le moteur attend tous les relevés) ; moteur 3,5 s (11 photos) ;
  stock 30 inchangé, rien de créé.

## PAS appliqué
- Parc avec la nouvelle méthode de fusion photo : **autre terminal** (Nico).
- Web/OTA **2.9.66** : commits poussés (web servi par Vercel) ; OTA Capgo NON
  envoyée (canal `production` = 2.9.65).
- `docs/agents/etat-2026-10-01.md`, bloc de tête de CLAUDE.md : non mis à jour.

## Suspens
- `selftest:moteur-rattachement` ROUGE (6) — il l'était déjà à 6cf2255 : il
  fige l'ancien moteur (budget/restantes, import auto) ; à réécrire.
- eBay : relevé `app` parti 6 min 30 après la demande → la synchro attend.
- Corinne : 320 questions « à vérifier » à trancher par elle ; ses relevés en file.
- Les 2 inverses : migration `scripts/reparations/20261007140000_rattachement_avant_stock_INVERSE.sql`,
  rattrapage `scripts/reparations/20261007_rattrapage_releves_INVERSE.sql`.
