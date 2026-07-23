# FillSell — État de référence

> Photo de l'état actuel de l'app (pas un changelog). Mise à jour : 2026-07-23.
> À relire en début de session pour se recontextualiser vite.

## 1. Vue d'ensemble

FillSell est une app pour revendeurs : calcul de marges, cross-posting et suivi
de ventes sur 4 marketplaces. Un article saisi une fois est publié, suivi et
retiré automatiquement partout.

**Stack :**
- **Front** : React 19 + Vite.
- **Mobile** : iOS + Android via Capacitor.
- **Extension Chrome** : exécute le cross-post et les suppressions dans une
  fenêtre dédiée minimisée (100 % invisible, jamais de focus volé).
- **Backend** : Supabase (Postgres + RLS, Edge Functions Deno, Auth, Storage).
- **Plateformes gérées** : Vinted, Leboncoin (LBC), eBay, Beebs.

## 2. État des intégrations plateforme

| Plateforme | Publication | Suppression | Détection vente | Vigilance |
|---|---|---|---|---|
| **Vinted** | Stable (prix via React fibers, invisible) | Stable (API `/items/{id}/delete` + CSRF + X-Anon-Id) | OK | 404 sans CSRF géré ; formulaire = 3 photos min |
| **Leboncoin** | Stable (wizard multi-étapes, execCommand) | Stable (410 = désactivée) | OK (410 + title/h1) | Vérif finale LBC à reboucler ; copie 200 périmée après suppression (un seul 410 doit primer) ; anti-bot timing à ne jamais annuler |
| **eBay** | Stable (aspects requis appris + gate) | **Partiel** — bloquée par passkey sur `/sl/list` | OK | Aspects à affichage statique (lecture DOM d'autopsie) |
| **Beebs** | Stable | Stable (groupée) | OK | Annonces qui « disparaissent » si prix élevé (hypothèse corroborée n=1) |

Socle transverse : statut `needs_user` (« à trancher ») persisté par handler,
suppression mono-plateforme au clic logo, sync de vente cross-plateforme.

## 3. Économie Pépites

**Plans :** Free / Premium / Pro. Détection premium canonique (identique partout,
cf. CLAUDE.md) : `is_premium OR is_pro OR is_founder OR apple_original_transaction_id
IS NOT NULL OR google_purchase_token IS NOT NULL`. `is_founder` = marqueur de prix
legacy (9,99 €), plus un tier.

**Prix abonnements :** Premium 12,99 €/mois · Pro 29,99 €/mois · Founder 9,99 €
(fermé, grandfathered). Sans période d'essai.

**Coût des actions (coin_config, prod) :** publication `original` 3 · `ia_light`
12 · `ia_advanced` 35 · analyse Lens 6 Pépites.

**Octroi mensuel (reset, pas de report) :**
- Premium **150** (actif, prouvé) · Pro **800** en prod (cible 600 **gelée** avec
  le déploiement Lens payant) · Free **0** (les 30 sont **gelés**, même raison).
- Cron `coins-monthly-sweep` (04:15 UTC) : sain, 100 % succeeded, couvre tous les
  abonnés actifs. Filet des webhooks (Stripe/Apple/Google).

**Packs consommables :** 100/4,99 € · 220/9,99 € · 460/19,99 € · 1150/49,99 €.

**Paiements :**
- **Stripe (web)** : opérationnel.
- **Apple IAP** : webhook `apple-iap-webhook` distingue Premium/Pro (pose `is_pro`,
  capture `apple_original_transaction_id`). `validate-apple-receipt` corrigé le
  23/07 pour reconnaître le produit Pro au restore. ⚠️ Chemin Pro **jamais testé
  en réel** (0 achat Pro en base).
- **Google Play** : webhook `google-play-webhook` en place ; écriture directe côté
  client au 1er achat.

## 4. Statut de lancement

- **App Store (iOS)** : **live**.
- **Google Play** : soumission **en cours** (ce soir). Reste : désactiver les
  offres d'intro dans Play Console.
- **Chrome Web Store** : soumission **en cours** (ce soir).

## 5. Sécurité

Audit + fix du **2026-07-23** (commit **cc08f8c**) : 7 fonctions SECURITY DEFINER
destinées aux seules edge functions (service_role) avaient un GRANT EXECUTE hérité
via PUBLIC → joignables avec la clé anon publique. Révoquées de PUBLIC/anon/
authenticated (service_role intact, aucun flux serveur cassé).

- Faille **HAUTE fermée** : `email_tunnel_candidates` exposait email + statut
  premium de tous les comptes sans authentification.
- Fermés aussi : IDOR `consume_one_unit`, bypass quota / pollution cross-user
  (`check_and_log_*`, `check_publish_quota`, `log_publish`), griefing
  `increment_founder_slots`.
- Non-régression vérifiée (SET ROLE service_role vs anon). Détails dans le commit.

## 6. Chantiers ouverts / dette connue

- **Bootstrap catalogue V/L/B** : `platform_category_aspects` alimenté par la
  découverte, couverture encore à compléter (relevés DOM réels).
- **Vérif finale LBC** : reboucler le parcours publication/dépôt de bout en bout.
- **search_path mutable** sur 6 fonctions SECURITY DEFINER (`handle_new_user`,
  `check_and_log_usage/publish`, `check_publish_quota`, `log_publish`,
  `increment_founder_slots`) : durcissement, non exploitable (pas de CREATE public
  pour anon/authenticated).
- **RLS `platform_category_aspects`** : INSERT/UPDATE en `WITH CHECK(true)` →
  tout user connecté peut réécrire le catalogue partagé (intégrité, pas de fuite).
- **Risque doublon** sur reprise d'un job stale après dépôt accepté mais non
  enregistré (anti-doublon en place, à surveiller au 1er LIVE réel).
- **Chemin Pro IAP** (Apple/Google) jamais exercé en conditions réelles.
- **eBay suppression** bloquée passkey.
- **Compte Apple expiré premium-en-app / 0 Pépite** : `is_premium=false` +
  `apple_original_transaction_id` présent → premium en app mais ignoré du sweep.

## 7. Conventions de travail

- **Git** : commit + push **directement sur `main`** (plus de branche feature/PR).
  `git add` **fichier par fichier** (jamais `-A`). Build/vérif avant push.
- **Migrations Supabase** : appliquées directement en prod (irréversible, normal).
- **Edge Functions webhook/cron** : toujours déployées `--no-verify-jwt`
  (email-tunnel, apple-iap-webhook, google-play-webhook, stripe-webhook,
  send-merine-reply, tiktok-event, apple-subscription-status).
- **Méthode** : investigation **avec preuve** avant tout fix ; **jamais de test
  applicatif automatique après un fix** (Nico teste manuellement).
- **Réponses** : contenu dans un bloc de code (copier-coller).
