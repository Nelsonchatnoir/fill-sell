# AGENTS.md — `src/` (l'app : web fillsell.app + iOS/Android Capacitor)

> Complète le `AGENTS.md` de la racine (toujours valable ici).
> Le même code sert le web (push sur `main` → Vercel) et le mobile (OTA Capgo,
> geste séparé : racine § 3.1). Un push ne met PAS à jour les téléphones.

## Repères

- `App.jsx` : le monolithe (~9 800 lignes) — sessions, premium, onglets,
  poll de `/build.json`. Architecture monolithique assumée : pas de refactor
  sans demande.
- `main.jsx` : `notifyAppReady` (Capgo, sinon retour arrière du bundle) et
  garde `vite:preloadError` (recharge une fois sur chunk manquant).
- `tabs/StockTab.jsx` : le Stock (cartes, pastilles de plateforme,
  `warningsAffichables`, `WARN_FAMILLES`).
- `publication/` : le stepper ; `annonces/` : relevés, doublons,
  rattachement ; `reglages/` : Réglages (empreinte du build affichée en bas).
- `utils/comptabilite.js` : SEULE source des calculs de marge / investi.
- Des modules de `supabase/functions/_shared/` sont importés ici (règle
  unique app + serveur, ex. `acces-opla.js`, `listes.js`, textes des jobs) :
  les modifier = redéployer les fonctions qui les importent ET faire une OTA.
- Textes : `i18n/translations.js` (FR/EN, italien en cours). Tutoiement.

## Règles propres à l'app

1. **Colonnes** : avant d'ajouter une colonne à un `.select()` ou à un
   `restRequest`, la vérifier dans `information_schema.columns`. Une colonne
   inexistante = 400 + `data = null` = écran vide, build vert.
   `cross_post_jobs` n'a pas de `updated_at`.
2. **Premium** : `is_premium || is_pro || is_comped` (et `is_business`
   pour le palier), jamais `is_founder` ni un identifiant Apple/Google.
3. **Prix d'achat** : NULL = inconnu, exclu des calculs ; jamais `|| 0`,
   `?? 0` ; `isNaN(null) === false`.
4. **Aucun texte technique à l'écran** : warnings et erreurs passent par le
   traducteur (`WARN_FAMILLES` / `WARN_INCONNU`, `humanizeJobError`) ;
   `last_diagnostic` ne s'affiche jamais. Jamais le mot « pépites » :
   « quotas ».
5. **Chaque `needs_user` a son écran** (motif `needs_user_source` → phrase +
   bouton qui mène au geste). Rouge = notre faute, orange = geste
   utilisateur, blanc = plateforme.
6. **L'écran Plateformes lit la vérité serveur** (`plateformes_verite`),
   jamais une déduction locale ; l'accès Opla se lit par une règle unique
   (`useOplaAcces` / `_shared/acces-opla.js`).
7. **Lazy + Suspense** : un chunk 404 rend un écran vide sans erreur ; en cas
   d'écran blanc, diagnostic « le build avant le code » (racine § 3.6).
8. **Un seul push par lot** (chaque push renomme tous les chunks).
9. Captures d'écran « après » sans session : `scripts/apercu/`. Ne jamais se
   connecter à fillsell.app dans un navigateur automatisé partagé avec Nico.
10. Sur téléphone, `/extension` dit « ouvre ce lien sur ton ordinateur »
    (l'extension ne s'installe que sur un Chrome d'ordinateur).
11. **Barres de progression (01/10)** : UN composant, `components/BarreProgression`
    (moteur `utils/progression.js`, étapes réelles des jobs `utils/barresJobs.js`).
    Grande barre dans le parcours où l'on attend, compacte sur la carte du Stock
    (`BarreJobCarte`), jamais les deux pour le même job sur le même écran. Tap sur
    une barre de job = `FileDesJobs` (lecture seule, raisons `utils/fileDesJobs.js`).
    Jamais 100 % ni « Terminé » avant la vraie fin. Relevés et synchronisation :
    hors périmètre, leur chargement reste le leur. Preuves : `npm run
    selftest:progression`, `selftest:file-des-jobs`, `scripts/apercu/capture-barres.mjs`.
