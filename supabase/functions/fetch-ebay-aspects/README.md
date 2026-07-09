# fetch-ebay-aspects — attributs eBay par catégorie (Phase 1, infra)

Récupère via l'**API officielle eBay Taxonomy** les aspects (item specifics) de
chaque catégorie feuille de notre mapping, et les stocke dans
`public.ebay_item_aspects`. Aucun scraping DOM, aucune déduction : ce qui n'est
pas retourné par l'API n'est pas écrit.

## Ce que ça fait

1. OAuth `client_credentials` (app-level, **aucun compte vendeur eBay requis**),
   scope `https://api.ebay.com/oauth/api_scope`, token mis en cache ~2 h.
2. `getDefaultCategoryTreeId?marketplace_id=EBAY_FR` → `categoryTreeId`
   (jamais codé en dur : eBay peut le changer).
3. `fetch_item_aspects` → **fichier JSON gzippé** de tous les leaf categories du
   marketplace, puis **filtrage** sur les 237 `categoryId` de notre mapping.
   Repli `get_item_aspects_for_category` (1 appel/catégorie) via
   `{"strategy":"per_category"}`.
4. Upsert dans `ebay_item_aspects`, avec un `status` **explicite** par catégorie :
   `ok` · `empty` (aucun aspect retourné) · `not_found` (absente du dump) ·
   `error`. Rien n'est passé sous silence : les ids concernés sont listés dans
   la réponse.

## Secrets Supabase

```bash
supabase secrets set EBAY_CLIENT_ID=xxx EBAY_CLIENT_SECRET=yyy EBAY_ENV=sandbox
```

`EBAY_ENV` vaut `sandbox` **par défaut** : on ne tape jamais la production par
accident. Hôtes : `api.sandbox.ebay.com` / `api.ebay.com`.

## Ordre des opérations

```bash
# 1. Table (migration appliquée en prod, cf. CLAUDE.md)
supabase db push          # ou : psql -f supabase/migrations/20260709000000_ebay_item_aspects.sql

# 2. Liste des categoryId, DÉRIVÉE du mapping (à relancer si le mapping change)
node scripts/gen-ebay-category-ids.mjs

# 3. Déploiement (verify_jwt reste à true : ni webhook ni cron)
supabase functions deploy fetch-ebay-aspects --project-ref tojihnuawsoohlolangc

# 4. Répétition à blanc — n'écrit rien, montre ce qui serait fait
curl -X POST "$SUPABASE_URL/functions/v1/fetch-ebay-aspects" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" -d '{"dry_run": true}'

# 5. Écriture réelle
curl -X POST "$SUPABASE_URL/functions/v1/fetch-ebay-aspects" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" -d '{}'

# 6. Vérification : mapping ↔ base
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ebay-aspects-verify.mjs --strict
```

Déclenchement **manuel** : pas de cron (ce n'est pas encore un besoin récurrent).
La fonction n'accepte que la `SERVICE_ROLE_KEY` en `Bearer` — elle écrit un
référentiel, pas des données utilisateur.

## Tests sans clés

```bash
node scripts/ebay-taxonomy-selftest.mjs
```

Valide le décodage gzip, la normalisation des aspects (`localizedAspectName`,
`aspectConstraint.aspectRequired`, `aspectDataType`, `aspectFormat`,
`aspectMode`, `itemToAspectCardinality`, `aspectValues[].localizedValue`), le
filtrage par categoryId et le cache du token, contre un `fetch` simulé.
**Il valide notre parsing, pas les données eBay.**

## ⚠️ Sandbox ≠ production

Les aspects du Sandbox eBay ne reflètent pas ceux de la production. Le sandbox
sert à valider le pipeline (auth → dump → gunzip → filtre → upsert), pas à
alimenter le produit. `ebay-aspects-verify.mjs` avertit si des lignes viennent
du sandbox.

## Hors périmètre de cette passe

`generate-listing` (prompt dynamique) et `chrome-extension/content-scripts/ebay.js`
(remplissage générique) ne sont **pas** touchés. Cette phase ne fait que
constituer le référentiel.
