# Reprise — fin du chantier multi-synchro (08/10 soir)

Suite de `docs/reprise/terminal-complement-0810.md`. Mandat de Nico : appliquer
les deux migrations (feux verts nommés), règle « fiche créée à la main face à
une fiche Vinted », extension 0.6.104 codée (aucun zip).

## 0. Fin d'après-midi — feu vert de Nico : 150000 APPLIQUÉE, rattrapage FAIT

- **Avant** : aucune dérive (md5 prod = point de départ des 4 fonctions
  réécrites) ; rejeu à blanc de garde-fou IDENTIQUE paire par paire à la
  référence vérifiée (9 fusions, 80 questions, 21 comptes, 0 fiche cachée —
  `build/fiches-main/rejeu-reference-0810.json`) ; sauvegarde fermée
  `scripts/reparations/20261008_fiches_main_vinted_sauvegarde_globale.sql`
  (`_backup_0810_fiches_main_*`, RLS, 0 droit anon/authenticated : 118 comptes,
  11 213 fiches, 1 377 questions, 23 777 liens) ; preuve AVANT de la fusion
  faite à la main dans l'app (`inventaire_fusionner`, compte fictif, transaction
  annulée) : **refusée** « [boutique_a_confirmer] … ».
- **Application** ~12:50 UTC, inscrite ; md5 prod = fichier (seul écart :
  `timestamptz` réécrit `timestamp with time zone`). `selftest:aucune-fiche-sans-v3 --prod`,
  `selftest:fiche-main-vinted --prod`, `selftest:moteur-rattachement`,
  preuve `--en-prod` : verts. Preuve APRÈS : la fusion à la main **aboutit**,
  l'annonce Vinted suit l'objet.
- **Rattrapage** (12:51 → 13:00 UTC, `--appliquer --attendu`, le script refuse
  d'écrire si son rejeu diffère de la référence) : 9 fusions, 80 questions,
  0 erreur, 11 sautées (annonce Vinted disparue). **Contrôles en base** :
  les 9 fusions = les 9 paires vues à la main (0 à tort), l'identité Vinted a
  suivi dans les 9 ; 80 questions sur 21 comptes (jocaille270779 : 57) ;
  0 marqueur posé (0 fiche Vinted sortie du stock) ; 0 mail ; la seule ligne
  push de la période est une vraie vente (la.mode.licyca, hors fusions).
- **Avant / après (31 comptes touchés)** : stock affiché 8 798 → 8 789 (les 9
  fiches Vinted fondues) ; fiches vivantes 11 689 → 11 680 ; « à vérifier »
  54 → 54 ; questions ouvertes 444 → 524 (+80) ; fusions déplaçant une annonce
  Vinted depuis le 28/09 : **0 → 9** (+ la preuve app).
- **jocaille270779** (inactive depuis le 26/09) : ses 57 questions arrivent
  sous UNE carte « Est-ce le même article ? » (compteur 57) puis un écran
  « 1 sur 57 », une réponse à la fois ; rien changé (consigne). Proposition de
  présentation groupée : dans l'écran, regrouper les questions d'un même motif
  (« même titre, ta fiche n'a pas de photo ») avec « Tout réunir (57) » /
  « Voir une par une » ; la réunion groupée = la même RPC par paire.
- **Chemins qui créent encore des fiches hors du moteur v3** (donc PAS
  « SUJET CLOS ») : (1) le dressing Vinted de l'extension
  (`inventaire?on_conflict=user_id,vinted_item_id`) crée ses fiches puis la
  passe v3 les juge (imports, fiches à la main) ; (2) l'app — saisie, voix,
  lot, import de tableur (`handleImportConfirm`), duplication — et
  `generate-listing` / `lens-analysis` (`_shared/fiche-article.ts`) créent les
  fiches de la personne, jugées ensuite face au Vinted ; (3)
  `consume_one_unit` / `enregistrer_vente_atomique` créent la ligne « vendu »
  d'une vente partielle. Les relevés Leboncoin, Beebs, eBay, Opla ne créent
  plus rien hors v3 (garde en base).

## 1. Migrations appliquées (feux verts nommés de Nico)

| Migration | Appliquée | Preuve |
|---|---|---|
| 20261008130000 (aucune fiche de relevé sans décision v3) | 08/10 ~11:18 UTC, inscrite (`repair`) | md5 prod = départ de la migration avant ; 2 déclencheurs actifs ; `rapprochement_v3_vinted_depuis` fermée (service_role) ; `selftest:aucune-fiche-sans-v3 --prod` vert |
| 20261008140000 (republication qui finit dans son créneau) | 08/10 ~11:20 UTC, inscrite | `republish_duree_estimee` fermée ; balayage (cron 13) 200 à chaque passage, 8 comptes, aucun créneau ouvert à cette heure |

- Borne du selftest corrigée : `APPLIQUE_LE` valait 13:00Z (l'heure de Paris
  écrite en UTC) — les contrôles « depuis le correctif » auraient été vides
  jusqu'à 13:00Z. 11:15Z désormais.
- Non-régression (11:18 → 11:52 UTC) : tous les crons actifs « succeeded »
  (handler-watch 12, ebay-api-worker 18, balayage 12, beebs-lien 7,
  fusion-photo 35, ebay-releve-api 4, releve-completer 3, veille-cpu 18,
  remises-en-vente 7, push-ventes 35, rapprochement 35), 4 republications
  Vinted publiées, CPU max 19,6 %. Les seuls HTTP non-2xx (546 ×138, 503 ×18)
  datent de 11:30-11:55 : l'empreinte des photos du rejeu (ci-dessous), pas une
  fonction des utilisateurs.
- 23 fiches Vinted d'avant (romain.knc 13, tessy.galy 10) restent « à juger » :
  elles le seront à la prochaine fin de relevé de ces comptes (rejouées à blanc
  cet après-midi : 0 décision).

## 2. Règle « fiche créée à la main face à une fiche Vinted »

Décision de Nico : même règle que les imports (photo ET titre sans concurrent →
fusion ; doute → « à vérifier », hors du stock ; jamais la photo seule, jamais
le titre seul ; décisions de la personne définitives).

- **Moteur** : `_shared/rapprochement/fiches-main.js` — sous-graphe des seules
  fiches (`fiche` = créée dans l'app, sans annonce Vinted ; `vinted` = dressing
  ou dépôt FillSell) sur les mêmes arêtes, concurrents et poids de mots : les
  décisions des annonces ne bougent pas (rejeu : 0 écart sur 68 comptes).
  La fiche de la PERSONNE est gardée (titre, prix, prix d'achat, photos), la
  fiche Vinted s'y fond, son identité Vinted la suit. Doute : UNE question par
  fiche jugée (son meilleur candidat, `candidats_total`), la fiche Vinted hors
  du stock seulement si personne ne l'a touchée. Refus et fusion défaite =
  jamais. Un article vendu : rien. Portée : `nouvelles` (passe normale : fiches
  Vinted et fiches à la main nées depuis la dernière passe) ou `toutes`
  (rattrapage). `rapprochement` **v14** déployée (`verify_jwt` false), INERTE
  tant que la lecture ne rend pas `fiches_main_actif`.
- **Migration 20261008150000 — EN ATTENTE du feu vert nommé de Nico**
  (prouvée en transaction annulée : `scripts/reparations/20261008_preuve_fiches_main.mjs`,
  21 contrôles verts, inverse compris) :
  0. **défaut préexistant trouvé par la preuve** : la garde de boutique
     `inventaire_ecarte_import_sync` refuse toute fusion qui fait passer
     l'identité Vinted d'une fiche du dressing à la fiche gardée
     (`inventaire_fusionner_pour` vide d'abord `vinted_account_id`) — 0 fusion
     de ce genre depuis le 28/09 (208 le 25/09), à la main dans l'app comme par
     le moteur. Une fiche qui LÂCHE son annonce (`vinted_item_id` vidé) passe ;
     tout import reste gardé ;
  1. `rapprochement_v3_fiches_fusionnables` (gardes : fiche à la main en stock,
     sans annonce Vinted, d'un exemplaire, aucune publication en vol ; fiche
     Vinted en stock, vivante, non touchée ; jamais deux annonces d'une
     plateforme ; paire tranchée = rien) ;
  2. `rapprochement_v3_appliquer` : `fusionner_fiche` / `fiche_a_verifier`
     (journal : `inventaire_fusions.par = 'utilisateur:photo_rapprochement_v3_main'`) ;
  3. `rapprochement_v3_lire` : `fiches_main_a_juger` (200 par passe), fiches
     Vinted nouvelles jugées aussi dans un compte à fiches à la main ;
  4. `rapprochement_fin_run` : réveil de la passe.
- **Rejeu à blanc du parc** (`scripts/reparations/20261008_fiches_main_vinted.mjs`,
  rapport `build/fiches-main/rejeu.json`) : 68 comptes ayant les deux, 37 480
  photos empreintées d'abord (jamais de passe sur ces comptes ; CPU 7-20 %,
  ~5 % de 546 sur `empreintes-urls`, repris), 0 erreur, 0 régression.
  - **13 fusions proposées par le moteur → 9 que la base ferait, 3 tournées en
    question (fiche Vinted touchée), 1 rien (annonce disparue). Les 9 vues une à
    une, photos côte à côte : 9 fois le même article — 0 fusion à tort.**
    (cynthiabuterne ×3 : 30 livres Disney, robot My Little Chef, Freida
    McFadden ; leane.vely chemise 3 mois ; antoninahlers Adidas Aeroready ;
    lothaire.berthier 4 DVD South Park ; famouus-x3 body Kiabi ; bellamegladys
    chemise noire — « M » sur la fiche, « L (40) » sur Vinted, même photo
    portée ; lunaellys tunique rayée.)
  - **80 questions** (21 comptes) : 72 sur le titre seul (jocaille270779 : 57
    fiches sans photo nommées « … - 4069… », numéro eBay, même titre que sa
    fiche Vinted), 8 sur photo identique et titre différent (fiches « Article »
    de jocabroc8, inandup33, pro.mxkn… : mêmes photos que l'annonce Vinted),
    3 « plusieurs candidats », 1 photo seulement proche. **0 fiche Vinted
    sortirait du stock** : les 80 ont déjà des jobs FillSell (publiées ailleurs,
    republiées) — la personne les a travaillées, la base ne les cache pas.
- **Application au stock existant : NON FAITE** — elle exige la migration
  (feu vert nommé). Ensuite : `node scripts/reparations/20261008_fiches_main_vinted.mjs --appliquer`
  (sauvegarde `_backup_0810_fiches_main_*` RLS fermée, puis les seules décisions
  de la règle ; inverse `scripts/reparations/20261008_fiches_main_vinted_INVERSE.sql`).
- `selftest:fiche-main-vinted` (moteur, migration, fonction edge ; `--prod`
  après application).

## 3. Extension 0.6.104 — codée, commitée, AUCUN zip

Commit 3f06744 (EXTENSION_LAST_COMMIT recalé par 4b54cc2). Manifeste 0.6.104.

- **Preuve relue jusqu'à ~6 min** : un seul message au content script ne peut
  pas durer 6 min (borne de 300 s ; Chrome arrête un service worker sur un
  appel unique de 5 min). Le content script relit toujours 2 min, rend l'heure
  d'envoi (`suppressionEnvoyeeLe`), puis le background relit la preuve
  (`BEEBS_PREUVE_RETRAIT`, lecture pure, appels de 60 s au plus) toutes les
  45 s jusqu'à 6 min après l'envoi, service worker éveillé. Preuve → étape
  « deleted » dans le même passage.
- **Aucun essai sans preuve** : dans l'étape du retrait d'une republication,
  toute reprise après une suppression envoyée passe par
  `rearmerSuppressionNonProuvee` (5, 10, 20, 30 puis 60 min ; jamais
  `needsUserAttempts`, jamais « failed ») ; plus jamais « rien n'a été touché »
  après notre suppression.
- **Relevé Beebs, « Mes annonces » peinte vide** : le flux de la page
  (`BEEBS_IDS_MES_ANNONCES`, existant) tranche si les deux onglets sont lus, si
  le compteur « en ligne » de Beebs = le total exact de l'index, et si chaque
  identifiant du flux est connu ; sinon la page reste muette, rien n'est conclu.
- `selftest:beebs-preuve-relue` ; 213 selftests, 0 rouge.
- ⚠️ Le zip public `fillsell.app/fillsell-extension.zip` (aucun lien n'y mène
  depuis le 07/09) est régénéré à chaque build Vercel, comme pour la 0.6.103 :
  ce n'est PAS un paquet CWS.

### Quand Nico dira que la 0.6.103 est acceptée

1. `npm run package:extension` → `build/fillsell-extension-0.6.104-cws.zip`
   (ranger dans `build/CWS-0.6.104-A-TELEVERSER/`) ; ranger la 0.6.103 dans
   `build/anciens-zips/` ;
2. PREUVE RÉELLE avant téléversement (poste de Nico, dossier lu dans
   `Secure Preferences`, une seule extension active) : une republication Beebs
   de test à 999 € (annonce de test, jamais le tableau de Nico) — la trace doit
   montrer « preuve relue par le background (n lecture(s)) » et l'étape
   « deleted » dans le même passage ; un relevé Beebs fenêtre minimisée ;
3. Nico téléverse et « Envoyer pour examen » ; `PUBLISHED_BUILD_IDS` /
   `EXTENSION_MIN_BUILD` : seulement sur sa décision ;
4. `_shared/relance-apres-maj.js` : ajouter une entrée si des republications
   Beebs sont arrêtées en « failed » sur « Suppression envoyée » d'ici là (la
   0.6.104 les aurait menées au bout).

## 4. Ce qui reste

1. **Feu vert nommé de Nico sur 20261008150000**, puis : application
   (`db query --linked -f`, `migration repair`), `node scripts/fiche-main-vinted-selftest.mjs --prod`,
   preuve `node scripts/reparations/20261008_preuve_fiches_main.mjs --en-prod`,
   puis le rattrapage `--appliquer` (9 fusions, 80 questions au 08/10 — le
   relancer à blanc juste avant, le stock bouge).
2. **Pas « SUJET CLOS »** : le dressing Vinted crée encore SES fiches lui-même
   (extension) ; elles sont jugées APRÈS par la passe v3 (contre les imports
   depuis 130000 ; contre les fiches à la main seulement après 150000). Les
   fiches créées dans l'app (personne, `generate-listing`, Lens) sont hors
   relevé par nature.
3. Les 23 fiches Vinted d'avant de romain.knc / tessy.galy : jugées à la
   prochaine fin de relevé (0 décision attendue).
4. 0.6.104 : § 3 (attendre l'acceptation de la 0.6.103).
5. Créneaux de republication : le 1er créneau du soir (≥ 15:00 UTC) montrera
   les premiers `_fin_de_creneau` (`republish_creneaux.sautes`) ; à relire.
