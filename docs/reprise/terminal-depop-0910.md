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
   l'automatiser (fenêtre de permission).
2. **Téléverser la 0.6.105** au Chrome Web Store (zip ci-dessus) + « Envoyer pour examen ».
3. **Ouvrir Depop à tous** = `depop_ouvert = 1` (décision ; aucun code à changer).
