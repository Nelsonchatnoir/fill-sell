# Opla — observations brutes (session du 2026-09-14)

Chaque ligne porte SA PREUVE. Rien d'inféré.

## Socle technique
- www.opla.co — Next.js 16.2.1, React 19.3.0-canary, turbopack, hébergé Vercel (`x-vercel-id: cdg1`).
- Images : CloudFront `d2f61lx5s6m7uh.cloudfront.net`, chemin `images/<userId>/<articleId>/<imageKey>_thumb.webp`.
- Identité : Auth0 (`auth0|…`, `google-oauth2|…`, `apple|…` dans les userId).
- Recherche : Algolia, app `TGB5B13MIB`, react-instantsearch 7.29 (clé de recherche publique lue dans la page).
- Télémétrie : GTM-TSVQG8GB, GA4 G-TJCLCMR7TX, Google Ads AW-11377658683, Vercel Insights, Sentry via tunnel same-origin `/ingest`.
- Autre extension active dans le Chrome de Nico : Joko (`joko-mobile-app-media.s3…/browser-extension/`). Bruit, sans rapport avec FillSell.

## Surface d'API (relevée : réseau + littéraux des bundles)
Base : `https://www.opla.co/api`
- `GET /api/config/params?locale=fr` — listes fermées GLOBALES (200)
- `GET /api/public/config/params` — idem, variante publique (200)
- `GET /api/public/config/params?category=<CODE>` — **config PAR CATÉGORIE** (200) ⭐
- `GET /api/public/config/articles` — **arbre de catégories complet** (200) ⭐
- `GET /api/config/articles` — **404** (le préfixe `public` est obligatoire ici)
- `GET /api/public/me` — profil ({user:{…}})
- `GET /api/public/me/articles?view=summary&limit=50` — mes annonces ({articles, nextCursor})
- `GET /api/public/articles/<id>` — détail d'une annonce ({article:{…}})
- `GET /api/public/feed?limit=N` — flux ({articles, nextCursor, renderId})
- `/api/public/images/upload-url` — URL présignée photo d'ARTICLE (littéral bundle, non appelé)
- `/api/public/images/avatar-upload-url` — idem avatar (littéral bundle, non appelé)
- `/api/public/me/articles` — création/liste d'articles (littéral bundle ; POST NON observé)
- Autres relevés : /me/banking, /me/blocks, /me/boosts/batch, /me/chats(+/messages/upload-url),
  /me/checkouts(+/pay,/validate,/return), /me/deposits, /me/deposit-retrieval, /me/dressing-promo,
  /me/dressing-spotlight, /me/followers, /me/follows/toggle, /me/invoices, /me/notifications,
  /me/offers, /me/pickup-relays, /me/points-transfer, /me/pro-lead, /me/pro-profile(+/kbis-upload-url),
  /me/pro-subscription(+/cancel,/downgrade,/portal), /me/referral, /me/returns, /me/reviews,
  /me/shopify-merchant, /me/wallet, /me/wishlist(+/toggle), /public/report, /api/auth/login, /api/auth/logout,
  /api/analytics
- `/articles/latest`, `/articles/${id}`

## ⚠️ Rejet des clients non-navigateur (MESURÉ)
`curl -H 'Accept-Language: fr' https://www.opla.co/api/public/config/articles` → **429**
au même instant où `fetch()` depuis la page rend **200**.
Ce n'est donc PAS une limite d'IP : c'est un rejet des clients sans empreinte navigateur.
→ Conséquence de conception : tout appel API du handler doit partir du CONTENT SCRIPT
  (contexte page), jamais d'un `fetch` du service worker.

## Routes de pages (table de routes du bundle, 85 entrées)
Dépôt : `/sell` (landing) · `/sell/create` (formulaire) · `/sell/edit/:articleId` (**modification**) · `/sell/published`
Compte : `/account/listings`, `/account/onboarding`, `/account/verify/identity`, `/account/verify/phone`,
         `/account/import`, `/account/vacation`, `/account/sales`, `/account/wallet`
Autres notables : `/import-vinted`, `/marques`, `/marques/:slug`, `/opla-vs-vinted`, `/pro/shopify/connexion`

## Drapeaux serveur (`/api/config/params?locale=fr` → features)
    community:true  communityUnifiedProfile:true  live:true  shippingQrCode:true
    profileVerification:false  profileVerificationV2:true
    depositPaused:TRUE     ← interrupteur serveur de mise en pause des dépôts
shipping.minShippingCents = 299

## Consentement (CMP MAISON — ni Didomi, ni Axeptio, ni OneTrust)
- État nominal de Nico, lu dans localStorage `@cookie_consent` : `{"analytics":false,"marketing":false}`
- Aucun bandeau affiché tant que cette clé existe ; aucun `[role=dialog]` de consentement.
- Le refus est propagé aux balises : requêtes Google portent `gcs=G100`, `npa=1`, `pscdl=denied`
  (et renvoient 503 — les collecteurs Google sont bloqués, ce qui est le comportement attendu en refus).
- Autre clé : `@language_preference`. Cookies JS-lisibles : `opla_has_session`, `opla_lang`
  (le jeton de session lui-même est httpOnly — jamais lisible, jamais à lire).

## Schéma d'un article (observé sur annonces publiques)
    id, sellerId, title, description, brand:string, category:string(code feuille),
    categoriesPath:[codes], categories:{lvl0,lvl1,lvl2,lvl3} (chemins cumulés joints par " > "),
    condition:string(code), metadata:{sizes[],colors[],materials[]}  ← clés ABSENTES si vides,
    priceCents:int, shippingPriceCents:int, buyerTotalCents:int,
    images:[string], imageDimensions:{clé→dims}, moderatedImageKeys:[string],
    moderationStatus:string ("approved" observé), status:string ("available" observé),
    createdAt, updatedAt, publishedAt, favouriteCount, viewCount, user:{…}
Sur 24 articles du flux : colors présent 14 fois, sizes 12, materials 5.
`metadata.colors` peut porter PLUSIEURS valeurs (ex. ["BROWN","CAMEL"]) → couleur multi-valuée.
shippingPriceCents observé à 299 et 319 : calculé par Opla, PAS saisi par le vendeur.

## Marque
Champ LIBRE, pas de liste fermée. Le sélecteur propose `Ajouter "<texte>"`.
Recherche "nik" → nike, Nike Jordan, Nike Air, Nike Air Max, Nike running, Nike air force 1,
Nike x Nocta, NIKKIE, nike dunk low, nike air Jordan — casse incohérente, doublons manifestes.
Le référentiel est donc pollué par les vendeurs : préférer TOUJOURS une suggestion existante
à la création d'une nouvelle entrée.
