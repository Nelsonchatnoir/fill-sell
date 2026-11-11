# L1 — Un retrait « partout » traverse les comptes reliés (11/11/2026)

Règle : `docs/regles/ventes-et-retraits.md` § « 11/11 ». Toutes les heures sont celles de Paris. Rien n'a été écrit en
prod pour ce rapport (lectures `--read-only`, par clés). Comptes : `447d920c-976a-4d8f-aff4-a2998050358c` (le compte qui a
agi) et `faf5021a-479a-4bb3-b3ec-c296770739b7` (le compte relié, même personne, seule ligne de `comptes_lies`).

## 1. La cause
« Retirer partout » = « Supprimer l'article » → « Retirer aussi les annonces … et supprimer ». L'app n'arme que les
retraits du compte qui agit (`src/App.jsx` `executerSuppression` : insert direct sous la RLS `auth.uid() = user_id`, qui
interdit d'écrire pour l'autre compte), puis supprime la fiche ; le filet serveur `inventaire_arme_retraits_avant_suppression`
(BEFORE DELETE) ne lit que les dépôts de la fiche supprimée. La liaison (`comptes_lies` + `fiches_liees_comptes`) n'était
branchée que sur la VENTE (`inventaire_vente_fiche_liee` → `armer_retraits_copies` → `armer_retrait_job_pour`). À la
suppression, personne ne la lisait.

## 2. La preuve (le cas réel)
Le 11/11 à 11:03:34 et 11:37:34, deux fiches du compte qui agit sont supprimées « avec retrait » (fiches 1789889098557002
et 1789889101726001) ; leurs jumelles du compte relié (liens 116 et 186, nés du transfert de boutique du 18/10) gardent
chacune une copie Leboncoin « published » : dépôt `ad4e2895` (annonce relevée `0607c980`) et dépôt `21a23488` (annonce
relevée `bffc6551`). Relu le 11/11 à 14:10 puis 15:45 : les deux annonces en ligne, aucun retrait sur elles, aucune tâche
en file sur les jumelles. La boutique Leboncoin est PARTAGÉE entre les deux comptes (`sync_import_ecartes`
« compte_relie:leboncoin », lu le 11/11 ; Depop aussi). Le dépôt `21a23488` est rattaché PAR LA PERSONNE (certain) ; le
dépôt `ad4e2895` l'est par le TITRE SEUL (`titre_exact`, 0,95) : même à la vente, il ne serait jamais retiré d'office.

## 3. Le correctif (serveur seul, en AJOUT) — version livrable (relecture et décisions de Nico du 11/11 15:15)
Migration `supabase/migrations/20261111140000_retrait_partout_fiche_liee.sql`, inverse
`supabase/rollbacks/20261111140000_retrait_partout_fiche_liee_INVERSE.sql` (`SET lock_timeout = '5s'` en tête des deux).
Six fonctions neuves, une table neuve, un déclencheur neuf ; aucune fonction existante réécrite (les 197 md5 de la fixture
contrôlés), aucune donnée écrite par la migration.
- `copies_fiche_liee(p_user, p_fiche)` (SQL, lecture) : les dépôts « published » des jumelles, avec `rang` (la copie
  certaine la plus récente par plateforme), `motif_refus`, `etat_refus` et `partagee` (`boutique_partagee_compte_relie`).
  Relecture finale (point 1, bloquant) : `deux_annonces_paire` quand la fiche supprimée porte SA propre annonce, une AUTRE,
  sur la même plateforme (deux exemplaires : jamais un retrait d'office) — lue dans le déclencheur, avant le SET NULL.
- `annonce_en_retrait_compte_relie(p_job)` : la même annonce déjà en retrait chez un compte relié (relecture M6).
- `armer_retrait_copie_reliee(p_job, …)` : le retrait d'UNE copie (dépôt en NOWAIT, jamais deux retraits du même numéro,
  ni ici ni chez un compte relié) — partagé par la traversée et par la réponse de la personne.
- `armer_retraits_fiche_liee(p_user, p_fiche, p_chemin)` (lock_timeout 1 s, budget 2 s) — chez le compte relié, sous SON
  identité le temps de ses écritures, sur les plateformes PARTAGÉES seulement : (a) la copie certaine → retrait ; au titre
  seul ou `deux_annonces_paire` → la question (sur l'annonce relevée qui porte le numéro du dépôt, point 5 ; sinon refus
  tracé avec sa raison) ; sinon refus tracé ; la plateforme d'un doute (question, deux annonces vivantes, paire) est
  exclue de (b) et (c) (point 4) ; (b) ce qui attend (§ 4) ; (c) remises en vente ; (d) la marque de la jumelle, seulement si quelque chose a été fait (retrait armé ou déjà en cours,
  tâche annulée, remise close ; point 3) ;
  (e) le journal `retrait_annonces` et le bilan `retrait_partout_compte_relie` (portée, compteurs, `taches_laissees`,
  `annulees_avec_numero`, `erreurs`, durée). Chaque étape a son filet : une erreur n'emporte jamais les autres.
- `inventaire_arme_retraits_fiche_liee()` + déclencheur BEFORE DELETE ON inventaire : les trois portes du filet ; « partout »
  = un retrait de la fiche ouvert depuis moins de 2 MINUTES, ou un dépôt publié que le filet arme ; toute erreur : WARNING
  + `usage_logs retrait_partout_compte_relie_erreur`, la suppression continue.
- `copie_retrait_partout_repondre(p_id, p_decision, p_annonce_montree)` : la réponse de la personne (sa session) à la
  question ; « Oui » = rattachement confirmé (par utilisateur, meme_article_confirme) puis le retrait de l'annonce MONTRÉE.
- Table `jumelles_retirees_partout` (RLS : lue par son compte ; écrite par le serveur seulement) : la marque.
- Droits : les cinq fonctions du serveur, `service_role` seulement ; la réponse : `authenticated` et `service_role`.

## 4. Ce qui attend chez la jumelle (décisions 2 et 6), sur les plateformes partagées
| Tâche de la jumelle | Ce que fait la traversée | Voie reprise |
|---|---|---|
| publication `pending` / `needs_user` / `failed` | `cancelled`, « Annulée à ta demande — rien n'a été publié. » (avec un lien ou un numéro : « … vérifie qu'aucune annonce n'est restée en ligne. », nommée `annulees_avec_numero`), `arret_utilisateur`, `needsUserAttempts` ≥ 99, erreur d'avant archivée | « Ta file » |
| republication non engagée dont l'annonce a un retrait (même numéro) | `cancelled`, message du 31/10, `hors_quota`, `republication_retrait_demande` | `_shared/republication-retrait.js` |
| republication non engagée, annonce restée en ligne | `cancelled`, « … ton annonce est restée en ligne. », `hors_quota` | « Ta file » |
| republication ENGAGÉE (ancienne annonce supprimée), non en cours | `cancelled`, « … l'ancienne annonce est supprimée, la nouvelle ne sera pas publiée. » | décision 2 |
| remise en vente `a_faire` | `abandonnee`, motif `retrait_partout_compte_relie` | `remises_en_vente_tick` |
| remise Leboncoin close (< 14 j) | marque `arret_utilisateur` | règle A |
| tâche `processing` | JAMAIS lue FOR UPDATE ni écrite ; nommée `taches_laissees` `{ job, motif: 'en_cours' }` | filet d'update-job-status (B) |
| tâche tenue ailleurs / hors budget / en erreur | laissée, nommée (`verrouillee`, `budget`, `erreur`), tracée dans `erreurs` | — (résiduel, § 8) |
| toute tâche ou remise de la plateforme d'un DOUTE (question, deux annonces vivantes, `deux_annonces_paire`) | rien n'est annulé ni clos ; nommée `taches_gardees_doute` | relecture finale, point 4 |

## 5. Rien d'automatique ne remet la jumelle en ligne (recensement inchangé)
Après le retrait fait, la jumelle est dans l'état EXACT d'une annonce retirée par son logo (dépôt `cancelled`
`removed_by_user`, annonce relevée `retiree_le` / `disparu_le`). Republication automatique (candidat = dépôt publié ;
une republication née pendant l'attente du retrait est close par get-pending-jobs), remise en vente automatique (ne lit que
`a_faire`), lot déjà envoyé (ses tâches sont en file : annulées), reprises et relances du serveur (`needs_user` /
`failed` / `pending` : plus rien), le Cloud (même file) : verrou, cas 10 et 11. Un geste explicite reste possible.

## 6. Le verrou et le banc
- Verrou `npm run selftest:retrait-partout-fiche-liee` (corps de prod, base jetable, geste joué comme l'app sous RLS avec
  les délais de l'API : statement_timeout et lock_timeout 8 s) : 24 cas, 194 contrôles. ROUGE sans la migration et sur la version d'avant
  la relecture, VERT avec ; contre-épreuves par mutants.
- Banc `node scripts/essais/20261111140000_banc.mjs` : AVANT (les 197 fonctions de la fixture à l'octet, défaut reproduit),
  APRÈS (6 fonctions, 1 table, 1 déclencheur ajoutés, 0 changé ; droits et réglages), INVERSE (état d'AVANT exact, TOUS les
  md5), de nouveau la migration (état d'APRÈS exact), avec la migration sœur 20261111180000 si elle est là, puis les deux
  scripts de réparation.
- La fixture (`scripts/essais/fixtures/prod-1111-retrait-fiche-liee/catalogue.json`) est relue en prod le 11/11 vers 15:41 :
  les 166 fonctions, les déclencheurs et les colonnes de la fixture du 08/11 identiques ; corps SANS leurs commentaires
  (ils citaient des cas réels : aucune donnée client versionnée), `md5_prod` garde l'empreinte de prod de chacune.

## 7. La voie normale pour les deux annonces, et les fiches fantômes
- `scripts/reparations/20261111_retrait_leboncoin_comptes_relies.sql` (+ `_PREUVE`, `_INVERSE`) : le dépôt `21a23488` par la
  RÈGLE (`armer_retraits_fiche_liee`) ; le dépôt `ad4e2895` hors règle, sur l'ORDRE NOMMÉ de Nico du 11/11, par le geste du
  logo sous les droits du compte relié (armé avant la règle : aucune question posée ; un retrait déjà en cours compte, la
  jumelle est marquée). La fiche supprimée du compte qui a agi ne portait aucun dépôt Leboncoin (lu en prod : ses retraits
  du 11/11 étaient Beebs, Vinted, Depop) : pas de `deux_annonces_paire`, la règle arme `21a23488`. Le script consomme
  8 à 18 ms du budget de 2 s avant d'appeler la règle (mesuré au banc). Gardes : comptes reliés, boutique
  Leboncoin partagée, liens, fiches, dépôts et annonces dans l'état lu, aucun retrait, « 0 tâche en file » (relecture M2).
  Les numéros sont lus dans les lignes, jamais écrits. Inverse : retraits pas encore partis (`pending` et `needs_user`,
  relecture M1), champs des dépôts, marques. Exécution : l'extension du poste qui suit ces annonces.
- `scripts/reparations/20261111_fiches_fantomes_reimport.sql` (+ `_PREUVE`, `_INVERSE`) : les 7 fiches réimportées par le
  moteur pendant la fenêtre « fiche supprimée → retrait fait » ; contrôle strict (7 = 6 + 1), rien à retirer prouvé,
  dépôts / annonces / rapprochements comptés avant et après (relecture M3), suppression déclencheurs actifs, aucun retrait
  né vérifié. Le moteur n'est pas touché.

## 8. Ce qui reste à décider ou à livrer
Feux verts : migration, puis script des deux annonces, puis script des fantômes. App (prochaine OTA) : la marque et « hors
des lots », la question (affichage et texte) et l'appel de sa réponse. Les trois autres copies du compte relié rattachées
par le titre seul restent en ligne (la question ne naît qu'à un retrait « partout » de leur fiche). Résiduels : une tâche
non en cours mais tenue / hors budget / en erreur au moment du geste n'est pas annulée (nommée, tracée) ; une tâche
annulée qui portait un numéro n'a pas de retrait armé (nommée `annulees_avec_numero`).

## 9. Chemins résiduels fermés (11/11)
Décision de Nico (11/11) : « aucun chemin ne remet en ligne un article retiré sans geste du client » — R1 et R3 à fermer.
Règle : `docs/regles/ventes-et-retraits.md` § « 11/11 … chemins résiduels ». Lectures de prod `--read-only`, une à la fois.

**R3 — la remise en vente Leboncoin (règle A) qui se réarmait après un retrait. FERMÉ, serveur seul.**
- Cause (HEAD c16b830) : `decisionRearmementRemise` (`_shared/remise-en-vente-attente.js:71-89`) ne refusait qu'une remise
  « à ta demande » (l. 81) ; le bloc de handler-watch (`index.ts:3251-3306`) la repassait `pending` (l. 3293-3295). Une
  remise close par l'extension après un retrait ciblé (`cancelPublishAfterDelete`, `removed_by_user`, sans
  `arret_utilisateur`), une remise « published » jamais vue dont le retrait est armé ou en file, une remise sans fiche,
  une remise d'un article retiré « partout » repartait à la disparition de la vendue. Même trou au logo et à la suppression.
- Fermeture : `retraitDeLaRemise` (pure, même module), appelée par `decisionRearmementRemise` : jamais si `inventaire_id`
  NULL, `removed_by_user`, `retrait_arme`, `retrait_partout_compte_relie` (marque ou bilan L1 de SA fiche né après elle),
  ou un retrait Leboncoin de SA fiche né après elle (en file / en cours / fait / échoué). Sauf le retrait de la VENDUE
  (c'est lui qui libère la remise) ; retrait annulé ignoré ; lecture en panne = jamais. handler-watch lit ces retraits et
  ces bilans (deux lectures par clé) pour les seules remises qui allaient repartir, et le dit dans son journal.
- Parc (lu le 11/11) : 4 remises réarmées par la règle A depuis son retour (toutes le 07/11, un seul compte), aucune avec
  un signe de retrait ; 5 candidates aujourd'hui (14 j), toutes déjà vues en ligne : aucune exposée.

**R1 — la tâche déjà prise par un poste (ou le Cloud) au moment du retrait. FILET SERVEUR posé ; le vrai correctif demande
une nouvelle extension.**
- Cause : aucune revérification avant le clic final, dans aucune version ni sur aucune plateforme. Le seul arrêt est la
  BORNE DE TEMPS (0.6.178, 07/11 : `FILLSELL_ABANDON_REMPLISSAGE`, `chrome-extension/background.js:33084-33095` et
  `:33207` ; lu juste avant le clic par `abandonAvantEnvoi`, `content-scripts/leboncoin.js:1254`, `beebs.js:1545`,
  `vinted.js:3232` ; rien pour Depop, eBay, Opla). Les `jobStatusNow` existants ne gardent que les écritures d'attente
  (`background.js:7491`, …), jamais le dépôt. Côté serveur : l'app (`src/App.jsx:5792`, `:5975-5978`) et le filet
  `inventaire_arme_retraits_avant_suppression` annulent une tâche `processing` SANS `arret_utilisateur` ;
  `controler_job_extension` (prod) laisse alors passer tout statut sauf `processing`, et `ecrire_statut_job_extension`
  (prod) écrit sur `p_avant = cancelled` : le « publié » ressuscite la tâche, l'annonce neuve reste en ligne. La
  traversée L1 ne touche jamais une tâche en cours (`armer_retraits_fiche_liee`, branche `t.status = 'processing'` : la tâche
  est laissée et nommée dans `taches_laissees`, motif `en_cours`). Le Cloud : même code, même trou.
- Filet (`update-job-status`, `_shared/publication-apres-retrait.js`, toutes versions, Cloud compris) : l'état est lu AVANT
  l'écriture ; le « publié » s'écrit comme avant ; juste après, le retrait de l'annonce qui vient de partir est armé par la
  voie du logo (tâche `delete`, RLS de la personne, lien ou numéro — jamais un titre ; `arme_par.chemin =
  publication_apres_retrait` ; marques `retrait_arme` + `retrait_apres_publication` ; `usage_logs retrait_annonces`).
  Retiré pendant la tâche = (A) annulée par la suppression de sa fiche « avec retrait » (fiche partie, texte de l'app ou du
  filet) ; (B) nommée dans `taches_laissees` d'un bilan L1 ; (C) republication dont l'annonce a reçu un retrait vivant né
  après elle. Jamais : « laisser les annonces en ligne », une autre annulation, une PUBLICATION à côté d'un retrait de la
  même fiche (circuit de la remise). Ni lien ni numéro → aucun retrait, marque `retrait_apres_publication_attendu`. Coût :
  ≈ 2 100 « publié » par jour (lu le 11/11) → 2 lectures par clé de plus chacun (3 pour une republication).
- Parc (30 jours) : 11 tâches annulées par la suppression de leur fiche alors qu'elles portaient `processing_since`
  (6 republications Vinted, 2 publications Vinted, 2 Leboncoin, 1 Beebs) ; aucune n'a ensuite écrit « publié ».
  Republication en vol + retrait de son annonce : 0. Traversée L1 : sans objet tant que la migration n'est pas appliquée.
- Ce qui reste sans extension neuve : l'annonce PART puis est retirée (fenêtre de quelques minutes, plus une action de
  retrait dans le créneau) ; un « publié » sans lien ni numéro n'est pas retiré (dit, marqué) ; eBay par l'API
  (`ebay-api-worker`) et une annulation `arret_utilisateur` d'une tâche en cours (aucun chemin connu) ne passent pas par ce
  filet.
- Le vrai correctif (extension, CWS ; rien n'est écrit dans `chrome-extension/`) : un « dernier mot » du serveur juste
  avant le clic irréversible. Le content script, au point où il appelle `abandonAvantEnvoi` (Leboncoin, Beebs, Vinted —
  à ajouter pour Depop, eBay, Opla, et pour la republication Vinted avant la suppression ET avant la recréation),
  demande à l'arrière-plan (`FILLSELL_DERNIER_MOT`, réponse en 3 s au plus) ; l'arrière-plan relit la tâche (statut ≠
  `processing`, `inventaire_id` NULL) ou appelle une RPC `job_toujours_a_publier(p_job)` qui rend le même verdict que le
  filet (`retraitPendantLaTache`) ; « non » → `abandonDemande`, rien ne part, la tâche est rendue sans tentative
  consommée. Lecture impossible → on continue (le filet serveur rattrape). Le Cloud se met à jour sans le CWS
  (`scripts/cloud/build-extension-cloud.mjs`).

**Verrous** (règle de Nico : écrit avant, vu ROUGE, puis VERT) :
- `npm run selftest:remise-retiree-jamais-rearmee` — la vraie fonction + le VRAI bloc « règle A » de handler-watch découpé
  et exécuté sur un faux serveur : ROUGE sur le code d'avant (11/27), VERT après (27/27).
- `npm run selftest:publication-apres-retrait` — les vraies fonctions + le VRAI segment d'update-job-status (filet
  « needs_user muet » → levée du mur Depop) exécuté sur un faux serveur qui écrit comme `ecrire_statut_job_extension` :
  ROUGE sur le code d'avant (6/28), VERT après (28/28).
- Contre-épreuves sur une copie (`.claude/worktrees/mutants-residuels/`, supprimée) : 14 mutants, tous mordus ; le code
  de HEAD dans la copie redonne ROUGE (11/27, 6/28).
- Livrables : `handler-watch` (v187 lue le 11/11, `verify_jwt` false) et `update-job-status` (v188, `verify_jwt` false) à
  redéployer avec `--no-verify-jwt` ; migration À PART `20261111180000_retrait_apres_publication` (relecture ci-dessous ;
  L1 inchangée) ; aucune extension.

### 9 bis. Relecture du 11/11 — « livrable après corrections » : ce qui a changé
Chaque point a son cas au verrou, vu ROUGE sur la version relue puis VERT.
- (1, série) Une remise ne se garde plus que sur le retrait d'un de SES DÉPÔTS (colonne, lien, adsubmit, sans_adsubmit,
  identifiants du dépôt jamais en ligne) ; un numéro qui est la vendue d'une remise de la fiche ne compte jamais. Deux
  annonces = deux exemplaires : en série, retirer la vendue de R2 (ou un autre exemplaire) ne fige plus R1. handler-watch
  lit en plus, par clé, les vendues des remises de la fiche. Le retrait de l'article entier reste couvert (fiche supprimée,
  bilan L1, `retrait_arme`).
- (10) `retrait_arme` est un POINTEUR : la tâche pointée décide (annulée → ne compte pas ; introuvable → le doute garde la
  remise ; relue par son identifiant si elle n'est pas parmi les retraits de la fiche). `removed_by_user` seul ne décide
  plus rien (repli au TITRE de `cancelPublishAfterDelete`, `background.js:26674-26696`).
- (13) Une ligne de journal agrégée par passage (`règle A : N remise(s) jamais réarmée(s) — … (motif k, …)`).
- (3, la racine) update-job-status refuse en 409 toute écriture autre que « publié » sur une tâche annulée par la
  suppression de sa fiche (`tacheAnnuleeParSuppression` : fiche partie + texte de l'app ou du filet, « laisser en ligne »,
  ou la marque d'annulation), juste après `controler_job_extension` et de nouveau avant l'écriture (statut requalifié). Même
  forme que « Arrêtée à ta demande » ; l'extension la lit comme une erreur à statut (`callEdgeFunction`,
  `background.js:2756-2761`), l'ACK de démarrage devient « skipped » (`:5451-5457`), les autres écritures sont en `.catch`,
  aucune file locale ne rejoue, et get-pending-jobs ne sert que « pending » : ni boucle ni re-tentative.
- (14) A suit le CHOIX de la personne. Constat : la modale « simple » (`src/App.jsx:10353`) n'existe que sans annonce ni
  tâche à annuler ; ensuite l'app et le filet annulent avec le MÊME texte et la fiche part (SET NULL) — après coup, rien ne
  distingue plus « avec retrait » d'une suppression sans retrait. Le déclencheur `zzz_annulee_par_suppression`
  (20261111180000, BEFORE UPDATE OF status, WHEN la transition visée) pose à l'instant de l'annulation
  `annulee_par_suppression {avec_retrait, par: app|filet, fiche}` : avec_retrait = un retrait de CETTE fiche armé depuis
  moins de 2 min (l'app et le filet l'insèrent quelques secondes avant d'annuler ; fenêtre de L1, décision de Nico). A
  n'arme que si avec_retrait est vrai ; sans la marque (migration pas appliquée), A n'arme rien. (Relecture finale) Avec
  15 min, un retrait par le LOGO vieux de 10 min (poste éteint) suivi d'une suppression où la modale ne propose aucun
  retrait (« sera annulée », « retrait déjà en cours … laissé tel quel ») valait « avec retrait » : le filet A aurait retiré
  l'annonce Leboncoin à la publication. Cas au banc (ROUGE à 15 min, VERT à 2 min), et le retrait de l'app de quelques
  secondes reste « avec retrait ». ⚠️ RESTE OUVERT : un retrait par le logo armé MOINS de 2 min avant la suppression compte
  encore (l'insert du logo et celui de l'app sont identiques) — à fermer par une marque côté app à la prochaine OTA.
- (4) Le lien tardif : le déclencheur `zzz_retrait_apres_publication_lien` (même migration, AFTER UPDATE OF listing_url,
  platform_listing_id, WHEN la marque `retrait_apres_publication_attendu` présente et le lien qui apparaît) arme le retrait
  SEULEMENT si l'identité est prouvée dans la même écriture (`lien_retrouve_par_identifiant` du relevé,
  `preuve_identifiant_beebs_acceptee`). ⛔ Jamais sur un lien retrouvé par le TITRE (`recoverMissingListingUrls` :
  `listing_url_recovery`, `background.js:26303-26362` ; le filet anti-doublon `staleJobExistingListingUrl`) : la marque
  reste et dit `lien_non_prouve`. Jamais l'ancienne annonce d'une republication, jamais un second retrait, une erreur ne
  bloque jamais l'écriture du lien. Aucun balayage : la fonction n'est appelée que sur la transition visée (vérifié par
  `pg_stat_xact_user_functions`).
- (2) B ne vaut que pour une entrée « en_cours » de `taches_laissees` ET un essai commencé (`processing_since`) avant le
  bilan : une relance par la personne n'est jamais un retrait. C : un retrait né après le DÉBUT DE L'ESSAI, sur SA fiche (11).
- (5) Un retrait que les gardes d'insertion font naître clos n'est pas armé (ni marque, ni journal, ni réponse). (6) Le
  retrait déjà ouvert se lit par sa clé (numéro, lien). (7) Idempotence : une tâche qui porte `retrait_apres_publication`
  ou `retrait_apres_publication_attendu` n'en arme pas d'autre. (8) La lecture C se fait par numéro de l'ancienne annonce,
  triée, bornée à 20, colonnes utiles. (9) Une colonne restée sur l'ancienne annonce d'une republication = « sans lien ».
  (12) Une relecture ratée se dit ; le verrou lit la VRAIE réponse de la fonction ; l'en-tête dit `--no-verify-jwt`.
- Banc `scripts/essais/20261111180000_banc.mjs` (Postgres jetable, définitions de prod du décor L1, port et dossier à part) :
  AVANT, les deux défauts reproduits ; APRÈS (migration jouée deux fois), deux fonctions et deux déclencheurs en plus, rien
  d'existant changé (md5, droits, réglages) ; INVERSE = l'état d'AVANT ; de nouveau la migration = l'état d'APRÈS.
- Verrous après relecture : `selftest:remise-retiree-jamais-rearmee` ROUGE sur la version relue (12 en échec sur 42), VERT
  43/43 ; `selftest:publication-apres-retrait` (banc compris) ROUGE sur la version relue (30 en échec sur 60), VERT 61/61.
  38 mutations sur une copie (dont la série, la réponse réelle, le pointeur, le 409, la migration et son inverse) : toutes
  mordues. 147 selftests voisins relancés un par un : 0 rouge (L1 180/180).
- À décider : feu vert de la migration 20261111180000 (après le banc) ; une publication annulée par une suppression SANS
  annonce en ligne (la modale dit « sera annulée ») ne reçoit jamais de retrait si elle part quand même (choix appliqué :
  pas de retrait) ; un lien retrouvé par le titre ne déclenche jamais de retrait (l'annonce reste suivie, la marque le dit).
