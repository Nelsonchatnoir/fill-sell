# Republication multiplateforme — conception (17/09/2026)

Périmètre : **Leboncoin, Beebs, Opla**. eBay hors périmètre (voie API, pas de
« remontée dans le fil » comparable ; à part).
Déclencheur : mail de Joséphine (Joe0410, Pro) — ses annonces Leboncoin
republiées ailleurs sont marquées « Annonce plus en ligne », elle veut
republier Leboncoin et Beebs depuis FillSell et que ça compte une fois.
Relevé 60 j en prod : 484 dépôts Leboncoin en ligne (38 comptes), 316 Beebs
(24 comptes), 154 eBay, 0 Opla ; Joséphine seule : 216 LBC, 196 Beebs,
342 republications Vinted.

## 1. Ce que « republier » veut dire, plateforme par plateforme

| Plateforme | Mécanique réelle | Ce qui change pour l'annonce | Risque propre |
|---|---|---|---|
| Vinted (existant) | capture → pré-vol → suppression API → recréation formulaire, une passe | nouvel id, nouvelle URL, vues/favoris à zéro | fenêtre hors ligne quelques secondes ; DataDome |
| Leboncoin | **retrait** (page de l'annonce, panneau « Supprimer », gardes d'identité id + titre) puis **redépôt** par le formulaire, depuis le job de dépôt d'origine | nouvel id `/ad/<cat>/<id>`, nouvelle URL ; compte Pro : formulaire pro (borne `lbc_pro_extension_min`) | brouillon serveur LBC (un seul dépôt à la fois, garde serveur existante) ; hors ligne le temps du redépôt (minutes) ; modération à nouveau (logo grisé) |
| Beebs | **retrait** (page `/p/<id>`, repli « Mes annonces » filtrée, jamais par titre) puis **redépôt** formulaire ; URL différée (modération Beebs) | nouvel id, URL captée plus tard par la re-capture différée (`recoverMissingListingUrls`, désormais republish inclus) | hors ligne pendant la modération Beebs (heures) ; description ≥ 5 caractères ; articles interdits (grisés en amont) |
| Opla | **modification en place** (PATCH `/public/me/articles/<id>`, chemin existant `processOplaRepublishJob`) | même id, même URL ; effet sur le fil **non mesuré** | aucun retrait, aucune fenêtre hors ligne ; si le fil ne remonte pas, la republication est un no-op honnête (à mesurer sur les premiers cas) |

Décision : Leboncoin et Beebs = **retrait puis redépôt**, comme Vinted, parce
que ni l'un ni l'autre n'a d'API de « remontée » et que la modification en
place ne change pas le rang. Opla = **PATCH en place** (déjà codé, lot 7), à
observer.

## 2. Source de la recréation : le job de dépôt d'origine

Vinted a besoin d'une capture (l'annonce a pu être créée hors FillSell).
Leboncoin/Beebs/Opla : **une annonce n'existe chez nous que si FillSell l'a
déposée** — le job `publish` (ou le dernier `republish`) `published` porte
tout : `title`, `description`, `price`, `photos` (colonne jsonb), `photo_option`,
`platform_fields` (catégorie résolue, aspects, adresse, état…), `listing_url`,
`platform_listing_id`. La RPC **copie ce job** dans le job `republish` au
moment du clic (snapshot immédiat, pas de capture différée) :
`republish_snapshot = { version: 2, plateforme, source_job_id, titre, prix,
listing_url, photos: n, captured_at }` + les colonnes recopiées.
Clés transitoires du job d'origine **retirées** de la copie (needsUser*,
processing_since, next_action_after, attente_session, blocage_antirobot,
porte_pro_lbc, lbc_depot, work_window_state, unavailable_*, sale_signal,
removed_by_user, republished_pending, delete_*, erreurs_archivees…).
Le prix : `prix_republication` (feuille de prix, −5/−10/−15 %) s'il est donné,
sinon le prix du job d'origine.

## 3. Machine à étapes (extension) — `processRepublishJobPlateforme`

Même vocabulaire que Vinted (`republish_step`), mêmes lecteurs (app, serveur) :

1. **`a_capturer`** — vérifications AVANT tout geste : `listing_url` + snapshot
   présents ; **état réel de l'annonce** (`checkListingState`) : `active` → on
   continue ; `unavailable`/`sold` → `failed` « plus en ligne » (article non
   touché, l'article reste tel quel) ; `unknown` → attente bornée (15 min × 4)
   puis `needs_user`. Puis → `captured` (pending). Rien n'est touché.
2. **`captured`** — invariant « une seule annonce hors ligne à la fois »
   **par plateforme** ; retrait via le handler de suppression existant
   (`executerRetraitViaHandler`, extrait de `processDeleteJob` — mêmes gardes
   d'identité, même repli Beebs, même verdict par état réel) ; refus/attente
   (session morte, anti-robot, transitoire) → mêmes réactions que le retrait
   (attente de session, reprise espacée), **annonce intacte** ; succès (ou
   annonce déjà absente confirmée) → `deleted`, `deleted_at`, l'ancien job de
   dépôt passe `cancelled` avec `republished_pending` (le veilleur ne posera
   pas de faux « vendue ? »), `listing_url` / `platform_listing_id` du job
   **vidés** (l'ancienne URL ne doit plus être scannée), pause humaine 2-5 min.
3. **`deleted`** — redépôt : le job est présenté à `processJob` comme un
   `publish` (même remplisseur, mêmes pré-vols, mêmes filets canal coupé /
   « Mes annonces ») avec `republish_recreation = true` ; `published` → étape
   `recreated`, `recreated_at`, nouveaux `listing_url`/`platform_listing_id`
   (écrits par update-job-status), `old_listing_url` gardé ; `failed` du
   redépôt → **jamais un failed sec après retrait** : requalifié `needs_user`
   avec le message « retirée, pas redéposée, Relancer » (relance =
   `relancer_republish`, reprise directe à l'étape `deleted`) ; `needsUser` /
   reprise espacée → inchangés (le job reste `republish`, le poll suivant
   rejoue l'étape `deleted`).
4. **`recreated`** — terminal (`published`).

Pas de capture 24 h ni de recapture : le snapshot est le job lui-même, il ne
périme pas. Pas de reconnaissance « dressing » : il n'y a pas de dressing ;
le filet est le scan « Mes annonces » par titre + garde de propriété d'URL
(existant, `recoverStaleProcessingJobs`) — désactivé pour un republish
non-Vinted **avant** l'étape `deleted` (l'annonce d'origine est encore en
ligne, la retrouver par titre serait un faux succès).

## 4. Serveur

- `spend_coins_and_republish(p_inventaire_id, p_vinted_item_id, p_source,
  p_prix_republication, **p_platform DEFAULT 'vinted'**)` — signature unique
  (l'ancienne à 4 paramètres est supprimée, les appels à 4 paramètres
  résolvent sur le défaut). Branche non-Vinted : interrupteur
  `coin_config.republication_multi_ouverte = 1` (fail-closed), extension
  ≥ `republication_multi_extension_min` (642 = 0.6.42, la première qui sait
  traiter ces jobs — une plus ancienne répondrait « Republication non
  supportée » et enverrait le job en failed), job source `published` avec
  `listing_url` sinon `annonce_introuvable`, `republish_en_cours` et
  `cadence_24h` **par plateforme et par article**, `article_sans_photo` lu
  sur les photos du job source, quotas et débit **partagés** (compteurs sur
  `action = 'republish'`, toutes plateformes : « compter une fois » = un
  compteur par geste, pas par plateforme ; une republication Leboncoin vaut
  une republication du forfait). `p_source = 'auto'` reste Vinted seul
  (module planifié : § 7).
- `relancer_republish` : inchangée (étapes identiques).
- `republish_refund_on_terminal`, `republish_maintenance_guard`
  (platform_health par plateforme) : inchangés, déjà génériques.
- get-pending-jobs : porte pro Leboncoin étendue aux republish LBC (même
  raison : formulaire pro) ; pipeline « article par article », plafond jour,
  pause respiration : déjà génériques ; retenue boutique Vinted : Vinted seul
  (inchangé).
- handler-watch : les reprises « processing coupé » (`captured` 45 min,
  `deleted` 30 min) exigeaient une capture Vinted valide — pour une autre
  plateforme, le snapshot v2 sur le job en tient lieu ; balayage 24 h
  « capture périmée » : non applicable hors Vinted (simple ré-armement) ;
  messages nommant la plateforme.

## 5. App

- Bouton **Republier** de la carte : logos des plateformes republiables à
  l'instant (annonce en ligne, pas de republication vivante, pas de cadence
  24 h, plateforme ouverte). Vinted seul → rendu identique à aujourd'hui.
- **Feuille** (RepublishSheet) : cases par plateforme (Vinted précochée si
  éligible), prix (Vinted : prix libre / −5/−10/−15 % ; autres : même
  pourcentage appliqué au prix du job source), coût (unité × plateformes
  cochées), avertissement par plateforme (« retirée puis redéposée ; Beebs :
  hors ligne le temps de la modération »). Lot : mêmes cases, appliquées à
  chaque article là où il est éligible.
- Pastille d'étape : nomme la plateforme quand ce n'est pas Vinted.
- Interrupteur : `republication_multi_ouverte` lu dans coin_config (isolé,
  fail-closed) — à 0, la feuille ne propose que Vinted, rien ne change.

## 6. Garde-fous conservés / ajoutés

- Jamais de retrait par titre (Beebs sans id → attente, jamais un ciblage).
- Jamais de retrait sur un état d'annonce non « active » vérifié.
- Un seul retrait en vol par plateforme et par compte ; retrait LBC un à la
  fois (garde serveur existante) ; espacement 2 min entre gestes.
- Retiré ≠ perdu : le job garde titre/description/photos/champs, relance
  sans ressaisie.
- Jamais un `failed` sec après un retrait (needs_user avec le geste).
- Ouverture par UN interrupteur serveur, borne de build, refus nommés.
- Opla : pas de retrait, jamais.

## 7. Republication planifiée sur les autres plateformes

Non livrée dans ce lot, conçue : `republish_planifiee_candidats` est
Vinted-spécifique (ancienneté = `listed_at_guess`, photo Vinted). Pour
Leboncoin/Beebs/Opla l'ancienneté = `published_at` du dernier job en ligne.
Réglage : `plateformes: ['vinted','leboncoin',…]` dans
`platform_settings.vinted.republish_planifiee` (défaut `['vinted']`), un
candidat par plateforme, mêmes plafonds (le compteur du jour est global),
mêmes créneaux, notes d'historique par plateforme. Prérequis : quelques jours
de republication manuelle Leboncoin/Beebs en prod pour mesurer la durée réelle
d'un cycle (retrait + redépôt + modération) avant d'en faire une cadence.

## 8. Ce que je n'ai pas pu vérifier

- Effet réel d'un PATCH Opla sur le fil (jamais mesuré).
- Durée de modération Beebs après redépôt (heures, parfois plus).
- Un compte Pro Leboncoin republiant sans la 0.6.42 : refusé par la RPC
  (borne de build), donc non testé par construction.
