# Reprise — DEPOP de A à Z pour le seul compte de Nico (09/10 nuit)

Mandat de Nico (chantier de nuit) : Depop intégrée de bout en bout POUR SON SEUL
COMPTE (`depop_ouvert` reste à 0), zéro régression sur les cinq autres
plateformes, chaque affirmation prouvée ; ni mail, ni téléversement CWS, ni
annonce de test laissée en ligne, ni donnée d'un autre compte touchée.

## Ce qui est fait [mesuré]

| Couche | Commit | Ce qui tient |
|---|---|---|
| Drapeau | (migration 20261008230000 appliquée) | `coin_config.depop_ouvert = 0`, journalisé, 92 autres clés inchangées |
| Moteur commun | `9eab08f` | « EUR 38 » ≡ « EU 38 », « Comme neuf » = très bon (une seule règle), Depop par identifiant, plateforme inconnue sans rayon, famille Depop ; rejeu sur la prod : seules 3 étiquettes « Comme neuf » changent |
| Base | `e928a0a` (migration 20261009020000 appliquée) | `depop_autorise(p_user)` ; garde sur 5 tables (`depop_non_ouvert`) ; CHECK ; 29 fonctions ; bêta posée sur Nico seul |
| Serveur | `0773ae1` | gpj v224 (job Depop au SEUL poste `depop_acces`), ujs v132, hw v95, rapprochement v16, push-ventes v9, empreintes-urls v5, photo-empreinte v3, generate-listing v113, lens-analysis v107, ebay-api-worker v79 — `verify_jwt` relu avant/après, inchangé |
| Extension 0.6.105 | `f59c1c2` | hôte www.depop.com OPTIONNEL (« Autoriser Depop »), connecteur `content-scripts/depop.js` (API depuis la page), taille par la règle ACTUELLE (`depop-tailles.js`), republication = suppression puis recréation, veilleur → `sale_evidence` exacte |
| App | `8f88cdd` | Depop « à venir » ouverte par `depop_autorise` (fail-closed) ; copie sans titre ≤ 1 000 car. / 5 hashtags ; rayon par identifiants ou choisi à la main parmi les 322 feuilles |

Selftests : `depop-acces`, `depop-app`, `depop-partout`, `moteur-faiblesses-depop`,
`depop-mapping` ; suite complète : **222 verts, 0 rouge**. Build d'essai vert.

Zip : `build/CWS-0.6.105-A-TELEVERSER/fillsell-extension-0.6.105-8f88cdd-cws.zip`
(BUILD_ID `2026-10-08T23:39:13Z+8f88cdd`, seul dans son dossier). La 0.6.104 est
SERVIE (23 comptes sur `0cec9e6`) : rangée dans `build/anciens-zips/` et ajoutée à
`ALREADY_PUBLISHED`.

## Parcours réel

- Contrats Depop relevés en réel (08/10 nuit) : `docs/plateformes/depop/CARTOGRAPHIE.md` § 8.
- Poste de Nico : 0.6.105 chargée (rechargée par Nico, BUILD_ID `2026-10-08T23:16:12Z+f59c1c2`,
  même code que le zip). **L'accès www.depop.com n'était pas encore accordé** (aucune clé
  `depop` dans `extension_sessions`) : sans lui, aucun job Depop n'est servi au poste.
- Scripts prêts (scratchpad de la session, à recopier si besoin) : publication de la fiche
  de test 1791300075263 à 999 € par `spend_coins_and_publish` en tant que Nico ; puis
  relevé (`demander_sync_plateforme('depop')`), republication
  (`spend_coins_and_republish(…, 'depop')`), retrait (job `delete` comme l'app) ; passage
  croisé : la peinture 1790285884191 à 999 €, puis retirée.
- ⛔ L'annonce « Scotch » (945704866) est CELLE DE NICO : jamais touchée.

## Ce qui attend Nico

1. **Le clic « Autoriser Depop »** (icône FillSell → ligne Depop) — Chrome interdit de
   l'automatiser (fenêtre de permission). **FAIT le 09/10 matin.**
2. **Téléverser la 0.6.105** au Chrome Web Store (zip ci-dessus) + « Envoyer pour examen ».
3. **Ouvrir Depop à tous** = `depop_ouvert = 1` (décision ; aucun code à changer).

## Reprise complète du 09/10 (fin de matinée) — ordres et GO de Nico

### En ligne [mesuré]
- **Push** `38e6d5b..0f24799` (70a1bfe + 0f24799), puis le lot de fin (cf. git log).
- **`rapprochement` v16 → v17** (08:44 UTC), `verify_jwt` **false** avant ET après (seule
  fonction changée sur 55) : l'identifiant d'un dépôt FillSell est rattaché AVANT le moteur v3.
- **Migration 20261009100000 APPLIQUÉE** (+ `migration repair`) : le déclencheur de
  rattachement des republications nomme Depop (relu : `ARRAY[…, 'depop']`).
- **Réparation** `scripts/reparations/20261009_depop_doublon_parcours.sql` EXÉCUTÉE 08:53:59
  UTC : fiche 1791529881380, job b569c5ed, décision e67ad995, question 5b5370c9 retirés
  (6 lignes dans `_backup_0910_depop_doublon`), 0 retrait Depop armé ; l'annonce 946325187
  rattachée 3 s plus tard au SEUL job 49217123 (filet de handler-watch). L'inverse restaure
  TOUT (essai à blanc : 195 puis 198 lignes identiques, avec 3 jobs).

### Preuves que rien ne casse [mesuré]
- Selftests **224/224** (dont `identifiant-avant-moteur` ; `depop-reprise-lecture` nouveau).
- Rejeu `node scripts/rejeu-identifiant-avant-moteur.mjs` : 10 comptes réels (Leboncoin,
  eBay, Beebs, Opla, Vinted) → mêmes décisions, 0 différence ; cas du 09/10 reconstitué
  (`--incident-depop-0910`) : v16 « à vérifier » (fiche neuve) → v17 rattachée au job 49217123.
  Aucune orpheline du parc rattachable aujourd'hui (0/49).
- Balayage du parc : AUCUN autre doublon né du trou v3. Quatre conflits anciens (18–25/09,
  Leboncoin, comptes faf5021a et afeef3c7 : annonces 3275975415, 3264977032, 3265366309,
  3264688634) — croisements d'avant le 27/09, **non touchés** (GO de Nico requis).

### Parcours réel (compte de Nico, extension 0.6.105 `f59c1c2`) [mesuré]
1. **Relevé** (09:04 → 09:05:02) : l'annonce 946325187 reste au job 49217123, aucune fiche
   neuve (72 fiches), aucune question. ✅
2. **Republication** : ⛔ **bloquée** — la republication 9089e65c attend la réponse à
   « Article vendu par cette annonce » (posée ce matin à cause du doublon, réparé depuis) ;
   écrire cette réponse pour Nico a été REFUSÉ par le classifieur (« Security Weaken »).
   → **Nico répond dans l'app** : « TEST FillSell ne pas acheter - presentoir de comptoir
   commerce » — 999 €. L'extension republie alors (DELETE puis POST) ; le déclencheur
   (mig 100000) rattache la nouvelle annonce.
3. **Retrait** de l'annonce de test : à faire APRÈS la republication — l'annonce de test
   reste EN LIGNE chez Depop (999 €, « ne pas acheter »).
4. **Croisé** (peinture 1790285884191, 999 €) ✅ : publication 1ad7fa87 — 1er essai 09:11
   « Session Depop illisible (reseau) » (échec PASSAGER de users/me, cf. ci-dessous), puis POST
   `listing/products` **201** (946359331, slug `nelsonchabnoir-peinture-a-lhuile-sur-toile-f3b7`),
   relecture **200 STATUS_ONSALE** ; relevé → annonce rattachée à 09:29:05.668 **par la v17**
   (motif `identifiant_avant_moteur`), aucune fiche neuve ; retrait 946d24ac : **DELETE 204**,
   vérification **404** (relu : 404 par slug et par id).

### Deux défauts trouvés par le parcours
- **Appels authentifiés Depop en échec passager** : mesuré depuis la page de Nico, MÊME jeton
  valable, `users/me` en échec rapide (« Failed to fetch », 20–40 ms) 3 fois sur 19, la lecture
  publique 0 sur 19 — c'est ce qui a coûté 15 min à la publication croisée. Correctif `02f9f67` :
  une LECTURE (GET) qui échoue « réseau » est relancée deux fois (1 s, 2,5 s), jamais une écriture
  (`selftest:depop-reprise-lecture`). ⚠️ Le premier correctif `dccbb2a` (recharger l'onglet sur un
  « jeton expiré ») reposait sur un diagnostic FAUX : retiré au commit suivant, jamais chargé.
  **NON chargé chez Nico** (« Recharger » n'est pas automatisable). Le zip 0.6.105 **n'est PAS
  refait** : il reste le code qui a passé le parcours (34 fichiers : 29 identiques, 5 au BUILD_ID près).
- **Sept déclencheurs** (retrait, rejugement, relevé clos, relance de connexion) ignorent
  Depop : migration **20261009110000 NON APPLIQUÉE** (feu vert nommé de Nico), essai à blanc
  vert, inverse prêt. Sans elle, un retrait Depop laisse son annonce « en_ligne » en base
  jusqu'au relevé suivant.

### Pour finir (dans l'ordre)
1. Nico : la réponse à la question de 9089e65c (ci-dessus) ; le GO nommé de 110000.
2. Nico : copier `build/extension` (construit depuis `02f9f67` ou plus récent) dans
   `C:\Users\nicol\FillSell-Extension-Nico`, puis « Recharger » ; relire
   `profiles.extension_build`.
3. Terminal : republication → retrait de 946325187 (réponses Depop relevées), sur le code
   rechargé ; si vert : `npm run package:extension` (zip refait = ce code, seul dans
   `build/CWS-0.6.105-A-TELEVERSER/`) et OTA 2.9.68 (`--channel production`).
4. FIN : aucune annonce de test chez Depop ; « Scotch » (945704866) intacte (empreinte
   stable `c5c5011eeaa12652`), compte et statut vendeur identiques.
