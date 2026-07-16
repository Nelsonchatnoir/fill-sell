# FillSell — Extension Chrome de cross-post

Extension Manifest V3 qui publie automatiquement les annonces générées par
FillSell (`generate-listing`) sur Vinted, Leboncoin, Beebs et eBay.

## ⚠️ DRY_RUN

`DRY_RUN = true` en haut de `content-scripts/vinted.js` : le formulaire est
rempli mais le bouton publier n'est **jamais** cliqué (log console à la place),
et le job est ré-armé en `pending`.

**DRY_RUN doit rester à `true` tant qu'au moins 3 publications réelles n'ont
pas été validées manuellement.**

## Flow complet

```
App FillSell (mobile/web)
        │  l'utilisateur génère une annonce
        ▼
generate-listing (edge function)
        │  photos retouchées + titre/description par plateforme
        ▼
cross_post_jobs (status = pending)
        │
        │  ◄── extension : chrome.alarms toutes les 30 min
        ▼
get-pending-jobs (edge function, JWT + RLS)
        │  retourne les jobs pending de l'utilisateur
        ▼
background.js : dispatch par plateforme (routage sur job.action)
        │  update-job-status → processing
        │  ouvre l'onglet de dépôt, envoie le job au content script
        ▼
content-scripts/<plateforme>.js : fillListingForm(job)
        │  remplit le formulaire (DRY_RUN : ne publie pas)
        ▼
background.js : captureListingUrl + detectReauth
        │  URL de l'annonce créée ; ré-authentification plateforme → needsUser
        ▼
update-job-status (edge function, JWT + RLS)
        │  published (+ listing_url) / failed (+ error) / pending (dry-run)

── puis, à chaque cycle de poll (30 min) ──────────────────────────────
background.js : checkPublishedListings
        │  visite les listing_url published dans la session du vendeur
        │  (détecteurs HTML : annonce vendue ?)
        ▼
check-listing-status v5 (orchestrateur DB, plus de scraping serveur)
        │  job → sold, vente créée, inventaire → vendu, frères annulés,
        │  pending_removal posé sur les frères encore en ligne, email
        ▼
app : bandeau « Vendu — retirer des N autres plateformes ? »
        │  le clic utilisateur insère des jobs action='delete'
        ▼
content-scripts/<plateforme>.js : deleteListing(job)
           DELETE_DRY_RUN : localise le contrôle sans cliquer
```

Statuts `cross_post_jobs` : `pending → processing → published / failed /
dry_run_completed`, puis `published → sold` (détecté par l'extension, orchestré
par `check-listing-status`) et `cancelled` pour les frères d'un article vendu.
Les jobs `action='delete'` finissent en `deleted` (LIVE) ou `dry_run_completed`.

### Cas « needsUser » (job remis en attente, retry borné au poll suivant)

- **Adresse Leboncoin absente** (réglages FillSell) ou brouillon LBC bloquant.
- **Ré-authentification plateforme** : une plateforme peut exiger une
  reconnexion AU MOMENT du clic de publication, même avec une session valide au
  remplissage — constaté en réel sur eBay (redirection vers `signin.ebay.fr`,
  « Se connecter avec une clé d'accès » / passkey). C'est infranchissable par
  automatisation **et ce n'est pas un bug** : `detectReauth` (background.js) le
  reconnaît, remet le job en attente avec « Reconnexion <plateforme> requise »,
  et le poll suivant retente une fois l'utilisateur reconnecté à la main. Sans
  cette garde, le job partait en `published` fantôme (le content script, dont
  la navigation détruit le contexte, avait déjà répondu « succès »).
- **Vinted, modale « Ajoute des photos »** : minimum 3 photos imposé sur les
  marques premium.

## Charger l'extension en mode développeur (unpacked)

1. Ouvrir `chrome://extensions`
2. Activer le **Mode développeur** (toggle en haut à droite)
3. Cliquer **Charger l'extension non empaquetée**
4. Sélectionner le dossier `chrome-extension/` de ce repo
5. Après toute modification du code : bouton ↻ sur la carte de l'extension

## Déployer les edge functions

```bash
supabase functions deploy get-pending-jobs
supabase functions deploy update-job-status
```

**Sans `--no-verify-jwt`** : ces deux fonctions sont toujours appelées avec un
JWT utilisateur, la vérification plateforme (`verify_jwt: true`, défaut) est
une couche de sécurité gratuite. La règle `--no-verify-jwt` du CLAUDE.md ne
concerne que les webhooks/cron appelés sans JWT (Apple, Stripe, pg_net…) —
ne pas ajouter ces deux fonctions à cette liste.

## Tester

1. **Auth** : cliquer sur l'icône de l'extension → « Se connecter » → se
   connecter sur fillsell.app. Le content script `fillsell-auth.js` capture la
   session Supabase (localStorage `sb-*-auth-token`) et l'envoie au background.
   Rouvrir le popup : « Connecté — email ».
2. **Créer un job de test** : générer une annonce Vinted depuis l'app (ou
   insérer un job `pending` en base).
3. **Forcer un poll** : popup → « Vérifier les jobs maintenant » (sinon
   l'alarme tourne toutes les 30 min).
4. **Observer** :
   - logs du service worker : `chrome://extensions` → carte FillSell →
     « service worker » (lien inspecter)
   - un onglet Vinted s'ouvre, logs du content script dans sa console
   - en DRY_RUN le job repasse en `pending` et l'onglet reste ouvert pour
     inspection visuelle du formulaire
5. **Vérifier en base** : le status du job doit suivre
   `pending → processing → pending` (dry-run) ou `→ published / failed`.

## Structure

```
chrome-extension/
├── manifest.json                  # MV3 : storage, alarms, scripting + host_permissions
├── config.js                      # URL Supabase, clé publishable, intervalles
├── background.js                  # alarme 30 min, session/refresh, dispatch jobs
├── popup.html / popup.js          # état connecté/déconnecté, login, poll manuel
└── content-scripts/
    ├── fillsell-auth.js           # capture la session Supabase sur fillsell.app
    └── vinted.js                  # remplissage formulaire Vinted (sélecteurs TODO)
```

## Reste à faire

- [x] Sélecteurs DOM réels dans `content-scripts/vinted.js` (audit DOM réel, chemin testé : Femmes > Vêtements > Robes > Midi)
- [x] Upload des photos (fetch → File → DataTransfer sur l'input file)
- [ ] Mapping catégorie FillSell (`platform_fields.categorie`, libellé plat type "Mode") → chemin catalogue
      Vinted (`platform_fields.categoryPath`, tableau ordonné) — n'existe pas encore, la sélection de
      catégorie dans `vinted.js` est câblée mais toujours no-op tant que ce mapping n'est pas construit
- [ ] Content scripts Leboncoin, Beebs, eBay (+ `implemented: true` dans `background.js`)
- [x] Déployer les 2 edge functions (verify_jwt: true, défaut)
- [ ] Test auth réel + premier dry-run
- [ ] Après 3 publications réelles validées manuellement seulement : envisager `DRY_RUN = false`
