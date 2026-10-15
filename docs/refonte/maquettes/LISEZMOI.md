# Maquettes de la refonte (nuit du 15 au 16/10/2026) — à valider, rien en prod

- **Lien unique (téléphone d'abord)** : https://claude.ai/artifact/69UNak2x84i3NVY7GuMPTz (artefact privé du compte de
  Nico ; s'ouvre connecté à claude.ai, partage depuis le menu de la page).
- **Ce que c'est** : `index.html` + `maquettes.js`, vanilla (aucun framework) ; une page, un cadre de téléphone, 25 écrans
  par ancre (`#onboarding-1` … `#attentes-synchro`). Accueil = la liste. Sous chaque écran : « Ce qui change » (une ligne,
  et pourquoi). Français, tutoiement, les cinq plateformes nommées, les six mots d'état, aucun temps estimé.
- **Ouvrir en local** : double-clic sur `index.html` (les polices viennent de Google Fonts).
- **Vérifier** : `node scripts/refonte/maquettes-verif.mjs [adresse]` — 390 px, processeur ralenti ×6 : erreurs de console,
  débordement, temps estimé, ancien mot d'état, ligne « ce qui change », peinture < 400 ms, fil « Suivant » complet,
  « réduire les animations » = 0 animation. Captures dans `docs/refonte/captures/maquettes/` (+ `journal.json`).
- **Republier l'artefact** (même adresse) : depuis une session Claude Code, publier `index.html` SANS ses balises
  `<!doctype>/<html>/<head>/<body>` (le squelette est ajouté à la publication) avec `files: { "maquettes.js": … }` et
  l'`url` ci-dessus.
- **Mettre sur Vercel** (quand Nico le veut) : l'intégration de la session n'a pas le droit de créer un projet (403) et le
  projet `fill-sell` protège ses prévisualisations par une connexion Vercel. Geste de Nico : `npx vercel login`, puis
  `npx vercel deploy docs/refonte/maquettes --yes` (nouveau projet `fillsell-maquettes`, « Vercel Authentication » à
  désactiver dans ses réglages pour que le lien s'ouvre sur un téléphone). Jamais le projet `fill-sell`.
- **Direction visuelle** : `docs/refonte/etat-des-lieux.md` § 4 (jetons de l'app, Space Grotesk, animations
  transform/opacity ≤ 400 ms, `prefers-reduced-motion` respecté).
