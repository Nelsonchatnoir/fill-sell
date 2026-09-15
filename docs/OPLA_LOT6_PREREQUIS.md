# Opla — lot 6 : ce qu'il faut AVANT le premier dépôt réel

**Relevé du 2026-09-15. Le lot 6 n'a pas pu être exécuté ; rien n'a été déposé,
rien n'a été activé.** Ce fichier existe pour que le constat ne soit pas refait.

---

## Pourquoi il n'a pas pu tourner

L'extension qui tourne dans le Chrome de Nico est la **0.6.38 du Chrome Web
Store** — vérifié par deux voies concordantes :

- `profiles.extension_build` de `nicolas.svobodny@gmail.com` =
  `2026-09-15T07:15:49Z+7e8b775` ;
- c'est exactement le `BUILD_ID` du zip `fillsell-extension-0.6.38-cws.zip`.

Or ce paquet a été construit **volontairement sans Opla** (commit 58d8468, le
retrait demandé pour l'empaquetage). Contrôlé **dans le zip lui-même** :

| Contrôle | Résultat |
|---|---|
| `host_permissions` | 8, **aucun opla.co** |
| entrée `content_scripts` pour opla | **absente** |
| `handlers/opla.js` embarqué | oui — mais **injecté nulle part** |
| `PLATFORM_HANDLERS` connaît `opla` | **non** (le lot 5 est postérieur au zip) |

⇒ Trois blocages indépendants, tous physiques. Aucun drapeau ne les lève :
sans permission d'hôte l'extension ne peut pas toucher opla.co, sans entrée
`content_scripts` le handler n'est jamais injecté, et sans entrée au registre
`processJob` écarte le job en « Plateforme inconnue ».

Et **aucun build unpacked ne tourne nulle part** : 52 postes actifs sur 24 h,
5 builds, tous publiés au Web Store, aucun `-dirty`.

## Ce que « allumer OPLA_ACTIF » ne suffit pas à faire

Quatre changements de code sont nécessaires, pas un :

1. `OPLA_ACTIF = true` — `chrome-extension/handlers/opla.js`
2. `PLATFORM_HANDLERS.opla.implemented = true` — sinon `processJob` (background.js
   ~2648) rend `skipped` avant tout
3. `PLATFORM_HANDLERS.opla.newListingUrl` — `processJob` (~2771) lit ce champ pour
   construire l'onglet de travail. Il est **volontairement absent** aujourd'hui
   (« rien ne doit pouvoir construire une URL opla.co par ce registre »). Sans
   lui, l'onglet s'ouvrirait sur `undefined#fillsell-worker`.
4. `PLATFORM_HOSTS.opla = "opla.co"` — utilisé par `getOrCreateWorkTab` et
   `cleanupOrphanWorkTabs`.

Le manifest source, lui, est **déjà prêt** : opla.co y a été remis après
l'empaquetage (commit 1cb1afb), host_permissions + content_scripts.

## Le geste qui manque, et qui n'est pas le mien

Charger `build/extension/` en **« Load unpacked »**, après avoir **désactivé la
0.6.38 du Web Store**.

⛔ CLAUDE.md : **une seule extension FillSell active à la fois**. Les deux
ensemble se disputent les jobs et `handler_build` ment sur qui a traité quoi —
c'est ce qui a coûté une matinée le 26/07. C'est une manipulation dans le
navigateur de Nico ; je ne peux pas la faire, et la faire à moitié coûte plus
cher que d'attendre.

## L'ordre exact, le jour où ça repart

1. Nico désactive la 0.6.38 au Web Store.
2. Les 4 changements ci-dessus, **en local, non commités**.
3. `npm run build:extension`, puis « Load unpacked » sur `build/extension/`.
4. Vérifier que le poste remonte bien le build unpacked (`profiles.extension_build`).
5. **Un seul** job `platform='opla'`, prix dissuasif, article jetable.
6. Relever le trajet : pré-vol → clés S3 → corps du POST → 201 → id.
7. Retrait immédiat : `DELETE`, puis 404 sur la fiche, puis compte à zéro annonce.
8. Nettoyer le job de test, remettre `OPLA_ACTIF = false`, réactiver la 0.6.38.

## Les trois preuves que ce lot doit rapporter

Aucune n'est acquise à ce jour :

- les photos partent en **CLÉS S3**, pas en URL — le piège armé puis désarmé au
  lot 5 (`corps.images`), jamais vérifié en vrai ;
- le succès est lu sur le **201 et l'id**, jamais sur une redirection ni un délai ;
- le pré-vol laisse passer une **donnée de production réelle** — ses 30 contrôles
  tournent sur une forme (`photos: ['a.jpg']`) que le serveur ne produit pas
  (`photos: [{type, url}]`). C'est exactement l'écart trouvé au lot 5.
