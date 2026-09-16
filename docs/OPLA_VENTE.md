# Opla — LOT A : le relevé de la vente

**Mesuré le 2026-09-16 sur la production Opla, compte de Nico
(`hoosslocal@gmail.com`, `apple|000159.3d1…2004`).**
Tous les appels partent du **contexte de page** d'un onglet `www.opla.co`.
Aucun `/product/<id>` n'a été lu : le seul oracle employé est
`GET /api/public/articles/<id>`.

---

## LA RÉPONSE : OUI, UNE VENTE SE DISTINGUE D'UN RETRAIT

C'était LA question du chantier. Elle est tranchée par une **preuve positive**,
pas par une déduction.

| Geste | `GET /api/public/articles/<id>` | `status` |
|---|---|---|
| créé en brouillon (`asDraft:true`) | **200** | `draft` |
| mis en ligne | **200** | `available` |
| **VENDU** | **200** | **`sold`** |
| « Publier plus tard » (dépublication) | **200** | `draft` |
| refusé par la modération | **200** | `rejected` (+ `moderationStatus:"rejected"`) |
| **« Supprimer » (effacement)** | **404** | — `{"error":"article_not_found"}` |
| identifiant inventé | **404** | — corps identique |

> **Une vente rend 200 et se NOMME. Un retrait rend 404.** Les deux ne se
> confondent pas. C'est l'inverse de Leboncoin (où vendue et supprimée rendent
> le même 410) et c'est meilleur que Vinted (qui exige de lire du JSON échappé
> dans du HTML).

⚠️ **Et donc : `404` ne vaut PAS « vendue », jamais.** 404 = effacée, par le
vendeur ou par Opla. La règle du projet (« une disparition n'est jamais une
vente ») s'applique telle quelle — sauf qu'ici on n'en a plus besoin pour
détecter les ventes, puisque la vente, elle, se dit.

---

## 1. Les valeurs de `status` — liste relevée, pas devinée

### 1.1 Ce qui a été OBSERVÉ sur des articles réels

Méthode : les **1 000 identifiants d'articles** du `sitemap.xml` d'Opla, lus un
par un sur l'oracle (le sitemap est daté : il contient donc des annonces qui ont
changé d'état depuis sa génération — c'est précisément ce qu'on cherche).

| | Compte |
|---|---|
| HTTP 200 | **948** |
| HTTP 404 | **52** |
| `status:"available"` | 938 |
| **`status:"sold"`** | **6** |
| `status:"rejected"` | 3 |
| `status:"draft"` | 1 |
| `moderationStatus:"approved"` | 945 |
| `moderationStatus:"rejected"` | 3 |

Exemples conservés : `art_13ce6756785b184e1d6f2e95acea8006` et
`art_8e7c472f89136d26604bf5966e0fc376` (vendus),
`art_425142b8d79e9ac451b9f1131c35fb57` (refusé).

### 1.2 Ce que dit le bundle JS — et le piège qu'il faut nommer

Le dictionnaire i18n embarqué porte **deux** tables `status`. La première mêle
articles et commandes, la seconde est celle de la **fiche article** :

```
status: { available:"Disponible", sold:"Vendu",
          pending_moderation:"En vérification", rejected:"Non publié",
          draft:"Brouillon" }
```

et la table mêlée ajoute `reserved:"Réservé"` (avec `shipped`, `delivered`,
`paid`, `refunded`, `label_generated`… qui sont des états de **commande**, pas
d'article).

> ⛔ **Ce dictionnaire est un tableau de LIBELLÉS.** C'est exactement le moule du
> `"sold":"Vendu"` de Beebs, qui nous a déjà coûté un faux détecteur. Il ne
> prouve rien à lui seul. Il n'est retenu ici que parce que trois de ses
> valeurs (`available`, `sold`, `rejected`) ont été **observées sur des articles
> réels** au § 1.1, et parce que le **code** de la carte d'article compare, lui,
> le vrai champ :
>
> ```js
> L = "available" !== e.status,   // « pas disponible »
> z = "sold"      === e.status,   // « vendu »
> ```

### 1.3 Ce qui reste NON observé — et doit donc rester inconclusif

- **`reserved`** : présent dans les libellés, **zéro occurrence** sur 1 000
  articles réels ni sur l'article de test. Possible, jamais vu.
- **`pending_moderation`** : libellé présent, mais le champ observé pendant la
  modération est `status:"available"` + `moderationStatus:"pending"`. Les deux
  champs sont **indépendants** ; `pending_moderation` n'a jamais été vu dans
  `status`.

⇒ **Conséquence de conception, non négociable :** le veilleur conclut à la vente
**si et seulement si `status === "sold"`**, à l'exact. Jamais sur « ≠ available »,
jamais sur une absence, jamais sur un 404.

---

## 2. Le cycle complet, provoqué sur un article réel

Un **seul** article créé, `art_9bd45b6e216d54411152c1c97017101c`
(photo réelle du stock de Nico, sweat Nike, catégorie
`MEN_PUL_HOODIES_PULLOVERS`, titre « TEST TECHNIQUE FILLSELL - NE PAS ACHETER »).

| # | Geste | Réponse du geste | Oracle immédiatement après |
|---|---|---|---|
| 1 | `POST /me/articles` `asDraft:true` | 201, `status:"draft"`, `moderationStatus:"pending"` | **200 · `draft`** |
| 2 | `PATCH {priceCents:29900}` | 200 | — |
| 3 | `PATCH {status:"available"}` | 200, `status:"available"` | **200 · `available`**, `publishedAt` posé |
| 4 | **« Publier plus tard »** (vrai clic, `[role=menuitem]` n° 0) | onglets passés à « En ligne (0) · Brouillon (1) » | **200 · `draft`** |
| 5 | `DELETE /me/articles/<id>` | **204** | **404** en **296 ms**, puis 404, puis 404 |

Compte remis à **0 annonce, 0 brouillon** — vérifié sur
`GET /me/articles` (`articles: []`).

**Exposition réelle : l'annonce a été en ligne ~4 minutes, 0 vue, 0 like**, au
prix de 299 € (un sweat qui en vaut 25 : dissuasif), titre et description
explicites (« NE PAS ACHETER », « ne sera pas expédiée »).

### 2.1 Deux détails qui comptent pour le veilleur

- **`publishedAt` NE SE REMET PAS À ZÉRO** à la dépublication : après
  « Publier plus tard », il porte toujours `2026-09-16T10:10:46.122Z`. Ce
  champ ne dit donc **pas** si l'annonce est en ligne. Ne jamais s'en servir
  comme signal.
- **Le schéma d'un article VENDU est IDENTIQUE à celui d'un disponible** —
  clé pour clé, vérifié sur les deux corps. Il n'y a **ni `soldAt`, ni date de
  vente, ni prix de vente**. `priceCents` reste le prix affiché.
  ⇒ **Opla n'expose aucun prix de vente.** Le veilleur ne pourra jamais en
  rendre un (même situation que Vinted). Ce qu'on sait, c'est *qu'*elle est
  vendue, pas *à combien*.

---

## 3. L'oracle : ses propriétés, mesurées

| Propriété | Mesure |
|---|---|
| **Pas de cache** | `cache-control: public, max-age=0, must-revalidate`, `x-vercel-cache: MISS`, `age: 0` — à **chaque** appel. Rien à voir avec `/product/<id>` (cache ISR, `STALE`, `age: 26`, survit à la suppression). |
| **404 immédiat après DELETE** | 296 ms. Aucune latence, aucune fenêtre d'ambiguïté. |
| **Corps du 404** | `{"error":"article_not_found"}` — code machine. |
| **Session NON requise** | `fetch(..., {credentials:'omit'})` → **200**, même corps. L'oracle est authentiquement public. |
| **Onglet REQUIS** | inchangé depuis le lot 1 : `curl` → 429 quand la page rend 200. Opla rejette les clients sans empreinte de navigateur, session ou pas. |

> ⇒ Pour le veilleur : **il faut un onglet `opla.co`, il ne faut PAS une session
> Opla connectée.** Une session morte n'empêche pas de lire l'état d'une annonce.
> C'est une bonne nouvelle : le pire cas (compte déconnecté) ne rend pas le
> veilleur aveugle.

### 3.1 Ce qui N'EST PAS un oracle

- ⛔ `GET /product/<id>` — 200 sur un id inventé, 200 sur une annonce supprimée.
  Déjà documenté au lot 7, **non retesté ici**, et à ne jamais retester.
- ⛔ `GET /api/public/users/<sellerId>/articles` (le dressing public, endpoint
  trouvé aujourd'hui, 200 `{articles, nextCursor}`) : sur **511 articles de
  26 vendeurs**, **100 % `available`**. Cette liste **filtre** les vendus. Une
  annonce qui en disparaît peut être vendue, dépubliée, refusée ou supprimée —
  elle ne prouve rien. C'est un piège de plus à ne pas armer.
- ⛔ `GET /api/public/feed` : `available` uniquement lui aussi.

---

## 4. ⚠️ CORRECTION d'une conclusion FAUSSE de mon lot 2

`docs/OPLA_RELEVE.md` § 16.6 et § 12 (ligne 579) affirment :

> « `PATCH {status:"available"}` rend **403 `phone_verification_required`**. La
> vérification du téléphone gouverne la **transition `draft → available`**. »

**C'est faux, et je l'ai vérifié dans les deux sens aujourd'hui.** Le corps
complet du 403, que le lot 2 n'avait pas lu :

```json
{ "error": "phone_verification_required",
  "reason": "high_value_listing",
  "thresholdCents": 30000,
  "message": "Seuls les articles à plus de 300 € demandent un profil vérifié.
              Fais vérifier ton profil, ou ajuste ton prix pour publier tout de suite." }
```

- À **999 €** : `POST` direct **403**, `PATCH {status:"available"}` **403**.
- Au **même instant**, sur le **même article**, **même compte**, téléphone
  **toujours non vérifié** (`phoneVerified: false`) : `PATCH {priceCents:29900}`
  puis `PATCH {status:"available"}` → **200, annonce EN LIGNE**.

⇒ La règle réelle est : **`priceCents > 30 000` (300 €) exige un profil vérifié**,
à la création **comme** à la mise en ligne. La transition `draft → available`
n'exige rien du tout en dessous de ce seuil. C'est aussi pour ça que l'annonce
du lot 1 était partie en ligne sans téléphone vérifié — le lot 2 avait cherché
l'explication au mauvais endroit.

**Conséquence pour le pré-vol** : un troisième plafond de prix, à ajouter aux
deux déjà connus.

| Borne | Valeur | Effet |
|---|---|---|
| plancher FillSell | 1 € | notre borne |
| **seuil profil vérifié** | **300 € (`30000` c)** | **au-dessus : refus 403 tant que le profil n'est pas vérifié** |
| plafond Opla | 1 000 € (`100000` c) | au-dessus : refus 400 `price_too_high` |

---

## 5. Ce que le lot A NE prouve pas

Dit franchement, parce que c'est la seule chose qui compte pour la suite :

1. **Je n'ai pas provoqué de vraie vente.** Il faudrait un acheteur qui paie, et
   un article de Nico réellement vendu et expédié. Les 6 `sold` mesurés sont des
   annonces d'**autres vendeurs**, lues sur l'endpoint **public** — c'est la
   même route, le même corps, le même champ que pour les nôtres, mais ce n'est
   pas notre annonce.
2. **`reserved` n'a jamais été vu.** Si Opla place une annonce en `reserved`
   entre l'achat et le paiement, le veilleur la verra « ni vendue ni
   disponible » et ne conclura rien — ce qui est le comportement voulu, mais
   signifie qu'une vente pourrait être **vue en retard**. Pire cas accepté.
3. **Aucun webhook, aucune notification.** La détection sera un **sondage**, au
   rythme du veilleur existant.
