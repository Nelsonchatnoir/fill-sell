# Phase B — Détection de vente & retrait cross-plateforme

État au **2026-07-12**. Ce document existe pour qu'on ne redécouvre pas dans deux
semaines, en croyant à un bug neuf, ce qu'on a délibérément laissé de côté.

---

## Le principe, en une phrase

**Une disparition n'est jamais une vente. Le doute ne s'écrit pas en base, il se
demande.**

Le poll de l'extension ne fait que **poser un drapeau**. Le **seul** chemin qui
écrit une vente (ligne dans `ventes`, inventaire en vendu, marges, annulation des
frères) est le **clic utilisateur** sur le bandeau de l'app :

```
clic « Oui, enregistrer la vente » (prix éditable)
  → check-listing-status { job_id, price }
    → orchestrateSale
```

Vérifiable par `grep` : aucun autre appelant, nulle part.

### Pourquoi aucune écriture automatique, même sur Vinted ?

Vinted a pourtant une preuve de vente **fiable et vérifiée**. Mais **aucune
plateforme n'expose le prix NÉGOCIÉ** (offre acceptée, marchandage en remise main
propre). Écrire une vente sans confirmation, c'est écrire une marge
potentiellement fausse — et un vendeur à volume (10 articles/jour) ne repassera
jamais la corriger. Elle resterait fausse pour toujours, en silence.
Un bandeau au bon moment coûte moins cher qu'une comptabilité fausse.
(Décision produit Nico, 2026-07-12.)

---

## Étape 1 — FAITE ✅

Détection à **trois états** (`chrome-extension/background.js`) :

| état | signification | effet |
|---|---|---|
| `active` | toujours en ligne | rien (et **efface** un drapeau posé à tort) |
| `sold` | **preuve positive** de vente | drapeau + bandeau affirmatif |
| `unavailable` | plus en ligne, cause inconnue | drapeau + bandeau interrogatif |
| `unknown` | rien de concluant (bot-shield, champs absents) | **rien du tout**, retenté au cycle suivant |

Drapeaux posés dans `platform_fields` : `unavailable_since`, `sale_signal`,
`detected_price`.

### Signaux réels, relevés sur du VRAI HTML (pas des suppositions)

| plateforme | signal de vente | vérifié ? |
|---|---|---|
| **Vinted** | `\"is_closed\":true` **ET** `\"item_closing_action\":\"sold\"` | ✅ sur une annonce réellement vendue, comparée à une active (`is_closed:false`, `item_closing_action:null`) |
| **Leboncoin** | **aucun** — une annonce vendue est simplement RETIRÉE (HTTP 410), réponse identique à une suppression manuelle | ✅ confirmé |
| **eBay** | `"listingStatus"` — vaut `ENDED` (majuscules) pour une annonce terminée | ⚠️ valeur pour une annonce **vendue** JAMAIS observée |
| **Beebs** | `\"status\"` — vaut `AVAILABLE` pour une active ; supprimée → 404 | ⚠️ valeur pour une annonce **vendue** JAMAIS observée |

### Bugs historiques corrigés au passage

L'ancien détecteur était **faux dans les deux sens** :
- il ne détectait **aucune** vraie vente : il cherchait `"can_buy":false` alors que
  le HTML porte du **JSON échappé** (`\"can_buy\":false`) — les motifs ne
  matchaient donc **nulle part**, depuis le premier jour ;
- il déclarait **vendue** toute annonce **supprimée** (guillotine `404/410 → sold`)
  → chaque suppression manuelle aurait fabriqué une **vente fantôme**.

Pièges à ne jamais réintroduire :
- `can_buy:false` est vrai **aussi sur ses propres annonces actives** (on n'achète
  pas chez soi) → **jamais** un signal de vente ;
- Vinted `totalAmount` = ce que paie l'**acheteur** (frais de protection inclus),
  **pas** la recette du vendeur ;
- Beebs `\"sold\":\"Vendu\"` est un **libellé i18n** présent même sur les annonces
  actives ;
- la page eBay contient les mots « Vendu » et un prix de vente… **des annonces
  recommandées** en bas de page → toute détection par texte brut est un faux
  positif garanti.

### Garde-fous

- **Délai de grâce** avant la première vérification (depuis `published_at`, repli
  `created_at`) : **Beebs 24 h**, **Leboncoin 6 h**, **eBay 2 h**, **Vinted 2 h**,
  défaut 6 h. Une annonce dans sa fenêtre n'est **pas lue du tout**.
  ⚠️ Ces chiffres sont **raisonnés, pas mesurés** — à réévaluer avec des données.
- **Fausse alerte auto-réparée** : si une annonce marquée hors ligne est revue
  `active`, le drapeau est effacé et le bandeau disparaît seul.
- **Reprise des jobs orphelins** : un job bloqué en `processing` > 15 min (worker
  MV3 tué, PC éteint) repasse en `pending`, borné à 2 reprises puis `failed`.

---

## Étape 2 — À FAIRE : voie vendeur Leboncoin

`https://www.leboncoin.fr/compte/part/mes-transactions?page=ventes` (session
authentifiée). **Seule page vendeur avec de vraies données aujourd'hui.**

Structure relevée :
```
Vente du 1 mars 2026 | 01/03/2026 | Terminée | Vase Christian Dior… | 110 €
Vente du 30 juillet 2024 | 30/07/2024 | Annulée | Veste maintenance…
```
- statuts : **Terminée** / **Annulée** / (En cours)
- **aucun id ni lien d'annonce** → matching par **titre exact**, corroboré par le
  **prix** et la **date** (postérieure à la publication). Plusieurs jobs de même
  titre → on ne devine pas, on laisse le bandeau.
- le montant affiché (« 110 € ») doit devenir le **`price`** envoyé à
  l'orchestration (le `priceOverride` est déjà en place pour ça) — **pas** le prix
  de publication.

⚠️ **Limite structurelle** : cette page ne liste que les ventes **validées dans
Leboncoin**. Une remise main propre non validée par le vendeur n'y apparaîtra
jamais → elle restera dans le chemin « bandeau ».

Coût/fréquence : **une visite par plateforme et par cycle** (pas une par
annonce), et seulement s'il existe au moins un job `published`. Ces pages de
compte sont plus sensibles qu'une page publique → onglet de travail unique,
timing humain, pas de rafale.

⚠️ Piège attendu : ce sont des SPA React. Lire leur DOM dans l'onglet de travail
**caché** risque le bug de peinture (cf. `paintTab`). Privilégier un `fetch()` +
parsing (pas de rendu nécessaire) avant d'envisager de peindre l'onglet.

---

## Étape 3 — BLOQUÉE : eBay et Beebs

Les pages existent, mais **sont vides** (aucune vente sur ces comptes) → la
structure d'une ligne vendue est **inobservable** aujourd'hui.

- **eBay** : Hub vendeur → « Commandes » = `/sh/ord` (redirige vers `/sh/landing`
  quand il n'y a aucune commande). `/sh/lst/sold` et `/mye/myebay/sold` n'existent
  pas.
- **Beebs** : `/fr/account/orders/list/seller` → onglet « Ventes »
  (« Pas encore de ventes ? »). Le pendant acheteur est
  `/fr/account/orders/list/buyer`.

**On ne code rien à l'aveugle** : tant que la structure n'est pas relevée sur une
vraie vente, ces deux plateformes ne concluent **jamais** `sold` seules — elles
passent par le bandeau. Comportement sûr, jamais faux.

---

## Dettes et limites acceptées

| # | Sujet | Détail |
|---|---|---|
| D1 | **Prix négocié Vinted** | Non exposé publiquement (`offerValue` = `$undefined`). Une vente négociée est pré-remplie au **prix demandé** ; l'utilisateur corrige dans le bandeau. |
| D2 | **État `ACTIVE` d'eBay jamais observé** | `detectEbayState` suppose `"listingStatus":"ACTIVE"`. Si le champ est absent d'une annonce active → `unknown` (pas de dégât, mais **la détection eBay pourrait ne jamais fonctionner**). À vérifier à la 1re republication. |
| D3 | **`jsonField` prend la 1re occurrence du HTML** | Robuste pour Vinted (`is_closed`) et eBay (`listingStatus`). **Fragile pour Beebs**, dont la clé est `status` — le mot le plus générique du web. Une autre clé `"status"` plus haut dans la page donnerait une lecture fausse. |
| D4 | **Beebs : annonces qui disparaissent** | Deux dépôts confirmés (2026-07-11) ont disparu des deux onglets sans notification. **Hypothèse prix élevé (200 €) corroborée par 1 test le 2026-07-12 : l'annonce à 30 € a survécu (assez pour être supprimée lors du rodage delete). Non formellement prouvée (n=1).** Un job partirait en `published` pour une annonce qui n'existe pas. Veille en place : ligne « Beebs publiés puis unavailable < 7 jours » dans le digest quotidien `ops-digest` (8h50 UTC). |
| D5 | **Frais de vente à 0** | `orchestrateSale` force `selling_fees = 0` (décision produit) : pas de barème par plateforme, l'utilisateur corrige dans l'app. |
| D6 | **`quantite > 1`** | Une vente détectée passe **tout** l'article en vendu (les annonces cross-post sont des pièces uniques ; la vente partielle reste le flux manuel `confirmSell`). |
| D7 | **Fenêtres de grâce non mesurées** | Voir plus haut : chiffres conservateurs, choisis, pas observés. |

---

## Annexe — Économie des Pépites : le grant Free est GATÉ avec Lens

Rien à voir avec la détection de vente, mais découvert pendant l'audit du
2026-07-12 et consigné ici pour ne pas être défait par erreur.

### Le calcul exact (décision Nico, 2026-07-12)

Le grant Free de **30 Pépites/mois** est un **pack de découverte** calibré sur le
**parcours complet**, pas un crédit de publication :

```
    analyse Lens   6 Pépites   (price_lens_overflow)
  + publication    3 Pépites   (price_original)
  ───────────────────────────
  = 9 Pépites par essai complet   →   30 Pépites ≈ 3 essais complets
```

**Ne jamais toucher à l'un de ces trois montants (30 / 6 / 3) sans refaire ce
calcul** : ils forment un équilibre, pas trois réglages indépendants.

### Pourquoi il est GATÉ avec le déploiement de lens-analysis

Les migrations `20260707100000_lens_coins_config` et
`20260707200000_lens_coins_free_provisioning` **n'ont jamais été appliquées en
prod** — ce n'est pas un oubli, c'est le gate. Vérifié le 2026-07-12 : la prod
exécute encore la version de `grant_monthly_coins` qui **rejette le tier
`free`**, et le sweep ne parcourt que les comptes payants.

⚠️ **Le piège** : les Pépites ne servent pas qu'à Lens, elles servent aussi à
**publier** (`spend_coins_and_publish` ne regarde aucun tier, seulement le solde).
Aujourd'hui, les **327 comptes gratuits ont 0 Pépite** — c'est *ça*, le paywall de
la publication cross-post.

Activer le grant Free **avant** que Lens soit payant en Pépites donnerait donc à
ces 327 comptes **~10 publications cross-post gratuites par mois** (30 ÷ 3), sans
la contrepartie Lens : le cadeau sans la contrepartie, et la fin de l'upsell
« passe Premium pour publier ».

→ **Le grant Free s'active EN MÊME TEMPS que le déploiement de lens-analysis.
Jamais avant.**

Ces deux migrations sont **délibérément exclues** du repair de l'historique fait
le 2026-07-12 (les 20 autres y sont) : les marquer « applied » sans les exécuter
enterrerait le provisioning Free pour toujours.

---

## Où vit quoi

| Rôle | Fichier |
|---|---|
| Détection, drapeaux, délai de grâce, reprise des orphelins | `chrome-extension/background.js` |
| Bandeaux (confirmation de vente, retrait cross-plateforme) | `src/App.jsx` |
| Orchestration de la vente (le **seul** chemin d'écriture) | `supabase/functions/_shared/sale-orchestration.ts` |
| Point d'entrée de l'orchestration | `supabase/functions/check-listing-status` |
| Sélecteurs de suppression par plateforme | `chrome-extension/content-scripts/*.js` |
