# 0.6.76 bloque les republications Vinted — 28/09 soir

## Faits (lus en base)

- 0.6.76 (`2026-09-28T15:56:22Z+2c298b4`) acceptée au CWS, 9 comptes dessus
  à 21:21. Tous les jobs qu'elle a traités sont des republications Vinted,
  toutes arrêtées : 3a721b23 et b07b735e (lowvaucher), f3ba2985
  (begantonmatheo).
- `garde_boutique = boutique_ok` (article = session : 8944020, 138188364),
  puis `suppression_verdict = identite_non_prouvee`, `http: null` : aucune
  requête envoyée à Vinted. Annonces toujours en ligne (`etat_annonce: active`).
- Message : « … Relance depuis l'app quand tu veux. » — chaque relance
  rejouait le même mur.
- Nico a retiré la 0.6.76 par un rollback publié sous le numéro **0.6.77**.

## Cause

Point A (25de3f0) a ajouté une garde avant la suppression : la page de
l'annonce, ou l'origine prouvée du job confrontée à la session relue. La
une-passe supprime depuis `/items/new`, sans vendeur visible ; elle lisait
l'origine sur `job.platform_fields.vinted_account_id` du **job de recréation**.
Ce job est construit dans l'extension (`construireJobRecreation`) et ne
recopiait pas cette clé, pourtant servie par get-pending-jobs v160. La garde
concluait donc toujours « identité non prouvée ».

Aucun correctif serveur possible : le job de recréation ne reprend du job
servi que `vintedAspects`, `categoryLevelChoice` et `vinted_ids_actifs`.

Le test de la garde (`vinted-identite-retrait-selftest`) appelait la
fonction en lui fournissant lui-même l'origine : il ne pouvait pas voir le
trou. Aucune republication réelle n'a tourné sur ce build avant l'envoi.

## Correctif : 0.6.78 (811a193, zip depuis 105f343)

- `construireJobRecreation` recopie l'origine servie, jamais devinée ;
  absente, le retrait reste refusé. La garde est inchangée.
- Page de l'annonce illisible + origine prouvée : même preuve que la
  une-passe ; un vendeur lu reste confronté aux deux.
- Verdict : `preuve_manquante` = `boutique_article` | `session` ; plus de
  `boutiqueEtrangere` sur une preuve absente.
- Message : le mur et le geste (« Actualiser mon dressing », session Vinted,
  bonne boutique), plus jamais « relance quand tu veux » sur ces cas.
- Test bout à bout : `npm run selftest:republication-origine-boutique`
  (vrai background.js → vraie porte de vinted.js).

BUILD_ID `2026-09-28T19:20:34Z+105f343`, SHA-256
`613119fc48bb0b533a44fe343b00489a168744b7b27a14d7da5eb0d18ce7a727`.
Seul zip : `build\CWS-0.6.78-A-TELEVERSER\fillsell-extension-0.6.78-cws.zip`.
Anciens dossiers 0.6.75/0.6.76 déplacés dans `build\CWS-PERIMES\`.

## Preuves

- Rejeu des 3 jobs réels (platform_fields et captures de prod, vrai code) :
  sur 2c298b4, `identite_non_prouvee` et 0 requête pour les 3 — la panne est
  reproduite ; sur le zip 0.6.78, une requête chacun sur l'annonce exacte
  (9649184767, 9707128035, 10026664652) ; session d'une autre boutique :
  `boutique_etrangere`, 0 requête.
- Rejeu parc, 782 republications Vinted sur 3 jours (674 captures valides),
  job servi comme par get-pending-jobs v160 : job de recréation identique à
  la 0.6.76 hors la clé ajoutée ; 636/638 preuves acquises avec la session
  relevée ; 2 refusées, sans origine (fiches de 0.6.69), retrait non envoyé.
- Ces rejeux sont hors ligne. Aucune republication réelle n'a encore tourné
  sur 0.6.78 : elle attend le téléversement et l'acceptation.

## Non fait, volontairement

- Aucun enregistrement de 0.6.76 ni 0.6.77 (`ALREADY_PUBLISHED`,
  `PUBLISHED_BUILD_IDS`) ; minimum inchangé (0.6.75).
- Aucun déploiement serveur, aucune migration, aucun mail, aucune donnée
  modifiée. Les 3 jobs restent `needs_user` : à relancer depuis l'app une fois
  leur poste sur un build sans ce défaut (0.6.77 de rollback ou 0.6.78).
- Ventes automatiques au poll et cron `doublons-balayage-2min` : toujours
  suspendus.

## Suite, 28/09 22:00–22:50 : retour à la base 0.6.75

Deux tests réels de Nico sur les paquets 0.6.78 bâtis sur la 0.6.76 : la
suppression passait, mais la recréation n'était plus rattachée (question,
puis doublon au relevé : T-shirt Adidas 221274a6, Sweat Tommy 4bd5c671). Un
troisième paquet a fait tomber la Casio G-Shock (inventaire 1785444834689,
republiée sans souci en 0.6.42/0.6.46/0.6.48) en « capture_incomplete ».
xxewwer (job 28f1b00e) : livre « Maquillage … Livre Relié AGEP » en Loisirs >
Livres, retiré à 21:09 puis bloqué au redépôt par la garde cosmétiques (titre
seul), message « rien à faire » faux.

**Décision Nico** : la 0.6.78 = code de la 0.6.75 (66a8887, reconstruit à
l'identique du zip publié, 31/31 fichiers) + deux changements seulement :
1. garde cosmétiques Leboncoin jugée d'abord sur la catégorie (hors Divers >
   Autres = pas un cosmétique) ;
2. precheckJob avant le retrait des republications Leboncoin/Beebs.
Commits 9d8c2d4 (retour du dossier chrome-extension/ à 66a8887), a86e0d2
(les deux changements), 2701d9a (recalage). Zip
`build\CWS-0.6.78-A-TELEVERSER\fillsell-extension-0.6.78-cws.zip`, BUILD_ID
`2026-09-28T20:49:09Z+2701d9a`, SHA-256 `048280ae…430d`. Écart avec le zip
0.6.75 publié : background.js (les deux changements, 2 blocs dans le code
minifié) et manifest.json (version) ; les 29 autres fichiers sont identiques.
Les quatre paquets 0.6.78 précédents (105f343, 4a3c557, 82a1a75, adba2ee),
jamais téléversés, sont dans `build\CWS-PERIMES\`.

Rejeux : le vrai job de xxewwer passe la garde sur ce zip (bloqué sur le zip
0.6.75). La suite de tests de la 0.6.75 donne le même résultat sur ce code.
Les tests écrits pour la 0.6.76 et ces paquets (identité à la suppression,
rattachement de recréation…) échouent sur main : ils décrivent des morceaux
mis de côté, qui reviendront un par un avec une vraie republication.

Serveur : update-job-status v101 (verify_jwt=false) = code servi 45b15a0 +
`_shared/republication-hors-ligne.js` seulement (téléchargé et comparé).
Rien n'y suppose le code 0.6.76 : il lit les textes des extensions
≤ 0.6.77 ; la source `garde_depot` n'est émise par aucune extension en
circulation. Aucune autre fonction déployée.
