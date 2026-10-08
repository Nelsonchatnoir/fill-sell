# Reprise — fin du chantier multi-synchro (08/10 soir)

Suite de `docs/reprise/terminal-complement-0810.md`. Mandat de Nico : appliquer
les deux migrations (feux verts nommés), règle « fiche créée à la main face à
une fiche Vinted », extension 0.6.104 codée (aucun zip).

## 00. Fin de journée — extension 0.6.104 `0cec9e6` : prête, NON livrée (preuve Beebs bloquée par la modération)

**Correction de contexte (Nico)** : la 0.6.103 n'a JAMAIS été téléversée (ni en examen) :
la 0.6.104 sera le PREMIER paquet téléversé depuis la 0.6.102. Dossier rangé :
`build/anciens-zips/CWS-0.6.103-008995b-JAMAIS-TELEVERSEE/`.

- **Paquet** : `build/CWS-0.6.104-EN-ATTENTE-PREUVE-BEEBS/fillsell-extension-0.6.104-0cec9e6-cws.zip`
  (BUILD_ID `2026-10-08T14:53:27Z+0cec9e6`, 31 fichiers, manifest à la racine,
  BUILD_ID dans les 5 .js qui le portent, aucun jeton restant, sha256 b74a781a…).
  Chargé sur le poste de Nico depuis 14:57 UTC. Anciens paquets 0.6.104
  (147ab9a, 4a0a096) rangés dans `build/anciens-zips/` (jamais téléversés).
- **Le correctif 0.6.103 est dedans** (36f105d ancêtre ; `relancerOngletMuet`,
  `pingContentScript`, onglets non déchargés, `FILLSELL_PING` dans les 5 content
  scripts) — mais il ne relançait l'onglet muet qu'à DEUX endroits (lecture du
  dressing Vinted ; onglet de job au chargement non confirmé). **Ajouté (ec2797b)** :
  `getOrCreateWorkTab` exige le PING du content script de la plateforme avant de
  rendre TOUT onglet de travail (patience 10 s si pas encore injecté ; muet →
  rechargement puis onglet neuf ; sinon erreur de la liste technique) : capture
  Vinted avant republication, pré-vol, publication, retrait, relevés. Cause des
  « tâche sans démarrage » (Jonathan Rabany : republications Vinted servies 61
  fois sans commencer, sur 0.6.102). `selftest:onglet-muet-partout` (la garde
  exécutée). Opla inchangé (pas de script du manifeste).
- **Serveur** : `_shared/relance-apres-maj.js` + handler-watch **v94** (`false`) —
  une tâche mise de côté « sans démarrage » (9 aujourd'hui : Jonathan Rabany,
  ltouze, 1 Beebs) repart UNE fois dès que son poste a la 0.6.104 ; les relances
  « content script muet » visent la 0.6.104.
- **Défaut « déjà absente » corrigé à la racine (0ba9718)** : un retrait Beebs ne
  se clôt plus « déjà retirée » sur une annonce jamais vue en ligne déposée il y a
  moins de 72 h (Beebs l'examine encore) : il reste en file, sans essai consommé,
  relu à 1 h, 3 h, 6 h puis 12 h. Prouvé en réel : retraits 8729a111 (34132220)
  et 14b9cfac (34132869) gardés « pas encore visible sur Beebs ».
- **Non-régression réelle (0cec9e6 / 4a0a096)** : publication Beebs 34132869 en 2 min ;
  relevés Leboncoin 10/10, Beebs 9/9, eBay API 8/8, dressing Vinted 14/14, Opla
  « accès non accordé » (identique depuis le 05/10). 214 selftests, 0 rouge.
- **Preuve de republication Beebs : PAS FAITE — bloquée par Beebs, pas par le code.**
  La version neutre à 999 € (accord de Nico) est publiée (34132869, 14:35 UTC), passée
  en vérification, puis invisible : Beebs examine à la main les annonces chères.
  Mesure : 7 annonces Beebs ≥ 500 € de FillSell en 60 jours, 0 vue en ligne ; une
  annonce réelle passe en ligne 2 à 5 min après « en cours de vérification » (11 cas
  dans la boîte de Nico) ; 34109673 (999 €, 04/10) n'a été visible qu'après 1 à
  2 jours. Une republication exige une annonce EN LIGNE. Zip non livré (garde-fou).
- **Annonces de test** : 34109673 retirée (404) ; 34132220 et 34132869 invisibles
  (404, hors des deux onglets), retraits armés qui les retireront si Beebs les
  valide (jusqu'à 72 h après leur dépôt). Aucune autre annonce de Nico touchée.

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

### Fin d'après-midi : empaquetée, chargée chez Nico, preuve Beebs NON faite — zip NON livré

- Paquet : `build/CWS-0.6.104-NE-PAS-TELEVERSER-preuve-beebs-en-attente/fillsell-extension-0.6.104-147ab9a-cws.zip`
  (BUILD_ID `2026-10-08T13:02:47Z+147ab9a`, 0.6.104, manifest à la racine, 18 .js
  au BUILD_ID, aucun jeton restant, les trois correctifs présents). La 0.6.103
  (déjà téléversée, en examen) est rangée dans `build/anciens-zips/`.
- Chargée sur le poste de Nico (copie de développement `C:Users
icolFillSell-Extension-Nico`,
  rechargée seule à 13:07 UTC ; 0.6.102 sauvegardée dans
  `build/anciennes-extensions-nico/0.6.102-d27ef83-avant-0.6.104/`).
- Non-régression réelle sur la 0.6.104 : publication Beebs (34132220, 72 s) ;
  retrait Beebs avec preuve (34109673, reste de test du 04/10 resté en ligne :
  suppression confirmée, absente des deux onglets à la 4ᵉ lecture, page 404) ;
  relevés Leboncoin 10/10, Beebs 9/9, eBay API 8/8, dressing Vinted 14/14 ;
  Opla « accès non accordé » comme depuis le 05/10. 213 selftests verts.
- **Preuve de republication Beebs : PAS FAITE.** L'annonce de test « TEST
  FillSell ne pas acheter… » (34132220) a quitté « en vérification » à 13:44
  UTC et n'a jamais été mise en ligne : la modération Beebs refuse le mot
  « TEST » (Nico). Une republication exige une annonce EN LIGNE. Une version
  neutre à 999 € (« Call of Duty Modern Warfare PS4 ») a été créée puis
  ANNULÉE avant sa prise par l'extension : le garde-fou de Claude Code a
  bloqué la suite (annonce réellement achetable sans la mention). Il faut
  l'accord explicite de Nico pour une annonce neutre à 999 € (ou une autre
  annonce de son choix), puis : publication → en ligne (mail Beebs « Votre
  annonce est en ligne ») → `spend_coins_and_republish(…, 'manuel', NULL, 'beebs')`
  → suivi (trace « preuve relue par le background (n lecture(s)) » si Beebs
  tarde, étape « deleted » puis « recreated ») → retrait de l'annonce
  republiée → renommer le dossier en `CWS-0.6.104-A-TELEVERSER`.
- Quand la 0.6.103 sera acceptée ET la preuve faite : Nico téléverse ; ensuite
  seulement `ALREADY_PUBLISHED` / `EXTENSION_MIN_BUILD` (sur sa décision).
- Défaut préexistant observé (non corrigé) : un retrait Beebs conclut « déjà
  absente » quand l'annonce, fraîchement publiée, est dans un état de
  modération invisible des deux onglets (34109673 le 04/10 : retrait clos
  20:12, revenue en ligne ensuite ; 1 cas sur 14 « déjà absente »). Proposé :
  ne conclure « déjà absente » que pour une annonce déjà VUE en ligne par un
  relevé, sinon relire plus tard.

## 4. Ce qui reste (08/10 fin de journée)

1. **Livrer la 0.6.104** : la preuve de republication Beebs exige une annonce en
   ligne. Soit Beebs valide 34132869 (alors : annuler son retrait 14b9cfac,
   `spend_coins_and_republish(1791299785299, NULL, 'manuel', NULL, 'beebs')`
   sous l'identité de Nico, suivre le job, retirer l'annonce republiée),
   soit Nico désigne une autre voie (prix que Beebs valide sans examen, ou une
   de ses annonces), soit il lève la preuve. Puis renommer le dossier en
   `build/CWS-0.6.104-A-TELEVERSER/` (zip seul) ; après acceptation :
   `ALREADY_PUBLISHED` / `EXTENSION_MIN_BUILD` sur sa décision.
2. Retraits 8729a111 et 14b9cfac (annonces de test en modération) : à relire ;
   s'ils restent « pas encore visible » 72 h, ils se clôtureront « déjà
   retirée » — vérifier alors dans « Mes annonces » qu'aucune n'est en ligne.
3. **Pas « SUJET CLOS »** (multi-synchro) : dressing Vinted jugé après, fiches de
   la personne, ligne « vendu » d'une vente partielle (§ 0).
4. **Ce soir — à relire** : premiers `_fin_de_creneau` de la 20261008140000
   (`republish_creneaux.sautes`) ; questions « fiche à la main » des passes
   normales ; tâches « sans démarrage » relancées par handler-watch v94 quand les
   postes passeront en 0.6.104 ; ops-digest de 8:50.
5. jocaille270779 : présentation groupée des 57 questions (proposition au § 0).
