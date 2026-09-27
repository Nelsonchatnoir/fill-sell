# Extension Chrome — structure, règles, livraison

> Référence pour agents de code, appelée par `AGENTS.md` (racine). Rédigé le 27/09/2026.
> Se périme : la base de prod, `git log` et les outils font foi, jamais ce fichier.


⚠️ **Pas d'`AGENTS.md` dans `chrome-extension/`, exprès** : tout commit qui touche
ce dossier (même un `.md`) déplace « le dernier commit de l'extension » ;
`npm run build` échoue alors tant que `EXTENSION_LAST_COMMIT` n'est pas recalé,
et recaler rendrait le zip en attente « antérieur ». Les règles de l'extension
vivent donc ici. Même prudence pour tout fichier ajouté dans ce dossier.

Ce dossier est la SOURCE : on ne le charge jamais tel quel dans Chrome
(`npm run build:extension` → `buildxtension\`, minifié, BUILD_ID injecté).

## Ce qu'il y a ici

- `manifest.json` — MV3, nom « FillSell — Cross-post » (vérifié par le
  paquet), `"version"` = numéro CWS. Opla n'est qu'en
  `optional_host_permissions` (demandée à l'utilisateur : « Autoriser Opla »).
- `background.js` — le service worker (~22 000 lignes) : poll des jobs
  (`get-pending-jobs`), fenêtre de travail, handlers de chaque plateforme,
  relevés, veilleur (`checkPublishedListings`), sondes de session, verdicts
  (`update-job-status`). `FILLSELL_BUILD_ID = "__FILLSELL_BUILD_ID__"`
  (jeton remplacé au build ; le paquet refuse un jeton non substitué).
- `config.js` — URL Supabase et clé anon (publique).
- `content-scripts/` — `vinted.js`, `leboncoin.js`, `ebay.js`, `beebs.js`
  (déclarés dans le manifest, précédés de `consentement.js`) ;
  `fillsell-auth.js` (relais de session depuis fillsell.app) ; `opla.js`,
  `opla-prevol.js`, `tailles-vocabulaire.js` (GÉNÉRÉ par
  `npm run gen:tailles-content-script`), enregistrés à l'octroi de la
  permission Opla.
- `selectors/` — registres de sélecteurs par plateforme + `resolve.js`
  (cascade + télémétrie `selector_health`).
- `popup.html/js`, `assets/`.

## Règles propres à l'extension

1. **Invisible, toujours.** Tout se passe dans une fenêtre de travail
   dédiée, minimisée, jamais au premier plan (`getOrCreateWorkWindow`,
   `createWorkTabInWorkWindow`). Interdits : `windows.update({focused:true})`,
   `tabs.update({active:true})` sur un onglet de l'utilisateur,
   `chrome.debugger` (bandeau), toute permission qui exige une réactivation.
2. **Pas de layout dans une fenêtre minimisée** : `getClientRects()`,
   `offsetParent`, `innerText` mentent (0 / null / vide). Utiliser
   `textContent` et les aides existantes (`estVisibleSansLayout`). Les clics
   fonctionnent.
3. **La réponse du serveur de la plateforme prouve une publication**, jamais
   la navigation ni une redirection (Vinted affiche une modale, eBay une
   popup). Un canal de message coupé n'est pas un échec.
4. **Jamais d'URL attribuée sans preuve** : sur une page de liste,
   `requireTitle: true` ; quand le dépôt a rendu l'identifiant, jamais de
   repli par titre. Un `listing_url` vide n'est pas grave (re-capture
   différée) ; une URL fausse retire la mauvaise annonce à la vente.
5. **Jamais « plus en ligne » / « vendue » sur une seule lecture** : la
   confirmation au cycle suivant est obligatoire (5 plateformes, 0.6.72).
6. **Sessions** : la sonde tranche. Vinted : 403 = anti-robot, 401 = session
   absente. Un mur vu par un handler alors que la sonde voit la session
   bonne = refus passager (nouvel essai 3, 6, 10 min), jamais
   « connecte-toi ». Opla : permission (« Autoriser ») ≠ session fermée
   (« Me connecter ») ; un 401 de sonde Opla ne prouve rien.
7. **Boutique** : avant tout geste sur une annonce Vinted, vérifier que la
   boutique connectée est celle de l'annonce (`garde_boutique`) ; sinon
   `boutique_etrangere`, on ne touche à rien.
8. **Beebs** : ne jamais conclure « pas en ligne » (modération humaine).
   DataDome bloque les environnements automatisés.
9. **Aucun diagnostic brut vers l'utilisateur** : l'extension écrit
   `warnings` / `last_diagnostic` en base ; toute nouvelle famille de warning
   reçoit sa traduction dans l'app (`WARN_FAMILLES`).
10. **Jamais ajouter un hôte obligatoire** (`host_permissions`) : Chrome
    désactive l'extension chez TOUT le parc jusqu'à acceptation. Les hôtes
    livrables sont listés dans `scripts/hotes-livrables-cws.mjs` (le paquet
    refuse le reste). Un nouvel hôte = optionnel, demandé une fois.
11. Ne pas toucher aux formulaires d'une plateforme au-delà de ce que fait un
    vendeur : options payantes jamais cochées (Leboncoin PRO), pas de boucle
    d'ouverture de fiches.

## Livrer une version

- Chaque changement de ce dossier : monter `"version"` du manifest ET recaler
  `EXTENSION_LAST_COMMIT` (`scripts/build-id.mjs`) dans le même lot (sinon
  `vite build` échoue).
- Tester en non empaqueté depuis `build\extension\`, **une seule extension
  FillSell active** dans Chrome. Preuve sur un compte réel avant tout zip :
  publication, republication, retrait, relevé.
- `npm run package:extension` → un seul zip par version, rangé seul dans
  `build\CWS-<version>-A-TELEVERSER\` ; l'ancien zip non téléversé part dans
  `build\anciens-zips\`. Procédure complète et étapes après acceptation :
  la section « Procédure de livraison pas à pas » ci-dessous.
- Selftests utiles : `npm run selftest:content-scripts` (lancé aussi par le
  paquet), et le selftest du sujet touché (`scripts/*-selftest.mjs`).
- Côté serveur, `get-pending-jobs` peut retenir des jobs selon le build du
  poste (constantes `BUILD_…`) : un correctif d'extension qui lève une
  retenue se déclare là, avec le BUILD_ID du zip.

## Procédure de livraison pas à pas


1. Modifier `chrome-extension/`, monter `"version"` dans
   `chrome-extension/manifest.json`, et **dans le même lot** recaler
   `EXTENSION_LAST_COMMIT` (`scripts/build-id.mjs`) sur l'horodatage du
   commit de l'extension (commit « chore(extension): EXTENSION_LAST_COMMIT
   recalé sur <hash> (<version>) »).
2. `npm run build:extension` → `build\extension\` (minifié, `BUILD_ID` injecté).
   C'est ce dossier que Nico charge en non empaqueté pour tester.
3. `npm run package:extension` → `build\fillsell-extension-<version>-cws.zip`.
   Il **refuse** : arbre git sale, selftest des content scripts en échec,
   `BUILD_ID` absent / `-dirty` / non substitué, build antérieur à
   `EXTENSION_LAST_COMMIT`, hôte hors liste (`scripts/hotes-livrables-cws.mjs`),
   manifest avec BOM ou mauvais nom, **version déjà dans `ALREADY_PUBLISHED`**.
4. **Un seul zip par version**, nommé sans ambiguïté, **seul** dans
   `build\CWS-<version>-A-TELEVERSER\`. Les zips remplacés (jamais
   téléversés) partent dans `build\anciens-zips\` avec un nom qui le dit
   (ex. `CWS-0.6.71-cc7247c-REMPLACE-JAMAIS-TELEVERSE`). Donner à Nico le
   chemin exact du zip.
5. Nico téléverse sur la fiche CWS et clique **« Envoyer pour examen »**. Tant
   que ce n'est pas fait, le parc tourne sur l'ancien code (vérifiable :
   `profiles.extension_build`, `cross_post_jobs.handler_build`).
6. **Après acceptation constatée en base** : ajouter la version à
   `ALREADY_PUBLISHED` (`scripts/package-extension.mjs`), l'inscrire dans
   `PUBLISHED_BUILD_IDS`, et poser **`EXTENSION_MIN_BUILD`** (`scripts/build-id.mjs`)
   sur le **BUILD_ID du zip publié** — **jamais** sur `EXTENSION_LAST_COMMIT`.
   `EXTENSION_MIN_BUILD` déclenche le bandeau « mets à jour ton extension »
   (0.6.66 au 27/09, relevé seulement sur décision).
- **Version actuelle : 0.6.75, à téléverser** (`docs/agents/etat-2026-09-27.md`). Un numéro téléversé est
  brûlé : une correction repart sur le numéro suivant.
