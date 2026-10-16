# Maquettes de la refonte (nuit du 15 au 16/10/2026) — à valider, rien en prod

- **Les ouvrir sur un téléphone (16/10 matin)** — trois chemins, du plus simple au plus propre :
  1. **Le fichier fixe** `maquettes-statique.html` : UN fichier, sans JavaScript, les 25 écrans à la suite (accueil = ancres,
     Précédent/Suivant). Généré par `node scripts/refonte/rendre-maquettes-statiques.mjs` depuis `index.html` + `maquettes.js`,
     vérifié à 390 px sans JavaScript (25 cadres, aucun débordement, aucun temps estimé, ancres complètes). Envoyé dans la
     conversation Claude Code le 16/10 à 07:50 ; s'ouvre dans l'aperçu de fichier du téléphone, dans Safari ou par double-clic.
  2. **L'adresse publique de dépannage** : https://raw.githack.com/Nelsonchatnoir/fill-sell/main/docs/refonte/maquettes/index.html
     — une page d'avertissement de l'hébergeur (« Open the page → ») à passer une fois, puis tout marche (25 écrans et fil
     « Suivant » vérifiés au navigateur à 390 px le 16/10). Elle n'existe que parce que le dépôt GitHub `Nelsonchatnoir/fill-sell`
     est PUBLIC (constaté le 16/10 : `raw.githubusercontent.com` répond sans connexion) ; elle disparaît s'il passe en privé.
     Écartés après essai : `htmlpreview.github.io` (un tap renvoie au fichier brut), jsDelivr (`text/plain`), Statically (page vide).
  3. **La prévisualisation Vercel** (ce que la mission demandait) : projet `fill-sell` en cible *preview* — jamais la production,
     aucun réglage du projet touché. Fichiers prêts dans `vercel-previsualisation/` (`package.json`, `vercel.json`,
     `recuperer.mjs` : le build récupère `index.html` + `maquettes.js` au commit épinglé `77277b0` et refuse toute empreinte
     différente ; essai à blanc local vert). Le 16/10 à 07:42 le classifieur de Claude Code a refusé `create_deployment`
     (« Production Deploy ») : il faut le feu vert de Nico (règle de permission `mcp__claude_ai_Vercel__create_deployment`, ou
     son ordre dans la conversation), puis un lien partageable par `patch_url_protection_bypass` sur le déploiement (le projet
     protège ses prévisualisations par une connexion Vercel ; le lien `_vercel_share` s'ouvre sans compte). À la main, sinon :
     `npx vercel login` puis `npx vercel deploy docs/refonte/maquettes --yes` (nouveau projet, « Vercel Authentication » à
     désactiver dans ses réglages). Jamais la cible `production` de `fill-sell`.
- **L'artefact Claude** https://claude.ai/artifact/69UNak2x84i3NVY7GuMPTz (privé, compte de Nico) : s'ouvre sur ordinateur ;
  l'app Claude iOS l'a refusé le 16/10 à 07:36 (« This browser isn't supported ») — à essayer dans Safari, sans garantie.
- **Ce que c'est** : `index.html` + `maquettes.js`, vanilla (aucun framework) ; une page, un cadre de téléphone, 25 écrans
  par ancre (`#onboarding-1` … `#attentes-synchro`). Accueil = la liste. Sous chaque écran : « Ce qui change » (une ligne,
  et pourquoi). Français, tutoiement, les cinq plateformes nommées, les six mots d'état, aucun temps estimé.
- **Ouvrir en local** : double-clic sur `index.html` ou `maquettes-statique.html` (les polices viennent de Google Fonts).
- **Vérifier** : `node scripts/refonte/maquettes-verif.mjs [adresse]` — 390 px, processeur ralenti ×6 : erreurs de console,
  débordement, temps estimé, ancien mot d'état, ligne « ce qui change », peinture < 400 ms, fil « Suivant » complet,
  « réduire les animations » = 0 animation. Captures dans `docs/refonte/captures/maquettes/` (+ `journal.json`) ;
  `MAQUETTES_CAPTURES=<dossier>` pour vérifier une adresse publiée sans toucher aux captures commitées.
  Version fixe : `node scripts/refonte/rendre-maquettes-statiques.mjs` (régénère ET vérifie sans JavaScript).
- **Republier l'artefact** (même adresse) : depuis une session Claude Code, publier `index.html` SANS ses balises
  `<!doctype>/<html>/<head>/<body>` (le squelette est ajouté à la publication) avec `files: { "maquettes.js": … }` et
  l'`url` ci-dessus.
- **Direction visuelle** : `docs/refonte/etat-des-lieux.md` § 4 (jetons de l'app, Space Grotesk, animations
  transform/opacity ≤ 400 ms, `prefers-reduced-motion` respecté).
