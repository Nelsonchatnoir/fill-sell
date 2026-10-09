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
2. **Republication** ✅ (9089e65c) : la réponse à « Article vendu par cette annonce » est
   venue de Nico dans l'app (l'écrire pour lui avait été REFUSÉ par le classifieur). Le
   serveur la tranchait alors à CHAQUE passage sans jamais servir le job (10:12:57,
   10:14:57, 10:16:57…) : la réponse restait dans `choix` → correctif get-pending-jobs
   (cf. défauts). Servie à 10:21 : `DELETE` **204**, vérification **404** ; 1er essai de
   recréation 10:27 « Session Depop illisible (reseau) » (échec passager), 2e à 10:33 :
   `POST listing/products` **201** (946377712, slug `nelsowchatnoir-annonce-de-test-fillsell-df57`),
   relecture **200 STATUS_ONSALE**. En base : nouvelle annonce rattachée à la fiche
   1791300075263 par le job 9089e65c (déclencheur, mig 100000), l'ancienne datée disparue.
3. **Retrait** ✅ (dcef9940, 10:35) : cible 946377712, `DELETE` **204**, vérification
   **404** ; en base l'annonce est datée `retiree_le` / `disparu_le` par le déclencheur
   (mig 110000, appliquée vers 10:13 UTC sur GO nommé de Nico).
4. **Croisé** (peinture 1790285884191, 999 €) ✅ : publication 1ad7fa87 — 1er essai 09:11
   « Session Depop illisible (reseau) » (échec PASSAGER de users/me, cf. ci-dessous), puis POST
   `listing/products` **201** (946359331, slug `nelsonchabnoir-peinture-a-lhuile-sur-toile-f3b7`),
   relecture **200 STATUS_ONSALE** ; relevé → annonce rattachée à 09:29:05.668 **par la v17**
   (motif `identifiant_avant_moteur`), aucune fiche neuve ; retrait 946d24ac : **DELETE 204**,
   vérification **404** (relu : 404 par slug et par id).

5. **FIN** ✅ (relu chez Depop, 10:36 UTC) : boutique = « Scotch » seule ; 946325187,
   946377712 et 946359331 en **404** par id et par slug public ; empreintes de « Scotch »
   (`eb14e44d77c429e0` / stable `c5c5011eeaa12652`), du compte (`d72147c0d8c44b3b`) et du statut
   vendeur (`a128c644534a1b5f`) IDENTIQUES à celles de 09:03 ; `canSell` vrai ; 0 vente. Relevé
   final (df5d66c1, 10:39) : l'annonce de la peinture datée disparue sur deux relevés
   (`constater_absences_releve`, possible grâce à la 110000) ; 72 fiches, aucune fiche neuve.

### Trois défauts trouvés par le parcours
- **Appels authentifiés Depop en échec passager** : même jeton valable, `users/me` en échec
  rapide (« Failed to fetch », 20–40 ms) 3 fois sur 19, lecture publique 0 sur 19 ; il a frappé
  TROIS gestes réels (publication 09:11, recréation 10:27, relevé 10:37 — chaque fois repris
  sans dégât). Correctif `02f9f67` : une LECTURE (GET) « réseau » relancée deux fois (1 s,
  2,5 s), jamais une écriture (`selftest:depop-reprise-lecture`). Preuve EN PAGE réelle (le code
  du bloc, commentaires retirés, dans un onglet depop.com de Nico) : 15 lectures, 18 appels,
  3 échecs absorbés, 0 échec final. ⚠️ `dccbb2a` (recharger sur « jeton expiré ») = diagnostic
  FAUX, retiré. **02f9f67 N'EST PAS dans le zip 0.6.105** : jamais chargé dans l'extension
  (le « Recharger » de chrome://extensions est impossible sans Nico : l'outil refuse chrome://),
  et `package:extension` refuse l'arbre partagé sale. La 0.6.106 d'un autre terminal, partie
  de main, l'embarquera.
- **Sept déclencheurs** ignorant Depop : migration **20261009110000 APPLIQUÉE** (GO nommé de
  Nico), relue (7 × `'depop'`), inverse `supabase/rollbacks/20261009110000_…_INVERSE.sql`.
  Prouvée en réel : retrait dcef9940 daté, absence de la peinture constatée.
- **get-pending-jobs : réponse « annonce partagée » jamais consommée** : correctif (la réponse
  tranchée sort de `choix`, trace `choix_tranche`) entré dans `d2c9107` (fichier partagé) ;
  déployé v226 depuis une archive de HEAD ANTÉRIEURE au v225 d'un autre terminal → son code
  absent de la prod de 10:18:52 à 10:33:29 UTC, rétabli en **v227** (archive de HEAD aad5b8b :
  son code + ce correctif), `verify_jwt` true. `selftest:annonce-partagee-tranchee`.

### État final et ce qui reste (Nico)
- **Zip** (inchangé = code de tout le parcours) :
  `build/CWS-0.6.105-A-TELEVERSER/fillsell-extension-0.6.105-8f88cdd-cws.zip`, seul dans son dossier.
- **OTA 2.9.68 NON lancée** : parcours vert, mais le dossier de travail unique est partagé —
  21 changements non commités d'autres terminaux (`npm run build` refuse) et 10 commits locaux
  non poussés d'un autre terminal, dont des changements d'app (`src/stock/BlocSynchro.jsx`,
  `src/utils/navigateurExtension.js`) : une OTA les livrerait sans push ni décision.
- **Push** : non fait — main local porte les commits de l'autre terminal (son push a été refusé
  par le classifieur) ; un push les emporterait. Décision de Nico.
