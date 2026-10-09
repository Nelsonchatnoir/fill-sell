# Reprise — terminal « Marta » du 09/10 (chantiers A, B, C, D, E)

Compte déclencheur : Marta MELE (`ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3`), Pro payée
le 09/10 à 11:07, Italie (Stresa, EOLO). App dans Chrome, extension (0.6.104) dans
**Edge**. **Confirmé par elle : son compte Vinted est sur VINTED.IT.**

⛔ **RIEN N'EST POUSSÉ** : `git push` refusé par le classifieur. Tous les commits ci-dessous
sont sur `main` LOCAL (avec 2 commits du terminal Depop : 57aeb3d, b118d07). À lancer par
Nico : `git pull --rebase origin main && git push origin main`. Fonctions et migrations,
elles, sont DÉJÀ en prod.

## État en prod (relu dans `functions list` / `schema_migrations`)

| Quoi | Version | verify_jwt |
|---|---|---|
| ebay-api-worker | v83 | false |
| ebay-account | v17 | true |
| ebay-oauth-callback | v11 | false |
| get-pending-jobs | v227 (v225 écrasée 10:18→10:33 UTC par le terminal Depop, rétablie depuis HEAD) | true |
| update-job-status | v133 | false |
| stripe-webhook | v58 | false |

Migrations APPLIQUÉES (+ `migration repair`) : **20261009120000** (garde « annonce encore en
ligne »), **20261009130000** (lecture de page Vinted = preuve), **20261009140000** (dépôt jamais
vu = échec), **20261009150000** (`ebay_accounts.ebay_site`).
Migration PRÊTE, **NON appliquée** : **20261009160000** (aucun mail « vendu » avant la vente
enregistrée) — décision de Nico (cf. D).

## B — Marta / Vinted (priorité 1)

**Cause prouvée** : son compte est sur vinted.it (confirmé par elle) ; l'extension ne
connaissait que www.vinted.fr ; en plus, l'extension tourne dans Edge (poste ac2c311e,
`navigateur: edge` en base) et l'app dans Chrome. Sonde 403 « session_absente ».

**Déblocage du jour, SANS nouvelle version** (preuve en base) : un compte Vinted étranger
travaille sur www.vinted.fr (mêmes identifiants, site affiché dans sa langue) — Alberto
« refedare » (compte IT) : 35 annonces FillSell sur vinted.fr ; Lirik Kici (compte DE,
locale `de-fr`) : 129 en 30 j. Marta : se connecter sur www.vinted.fr **dans Edge**, puis
« Synchroniser ». Message italien prêt (rapport du 09/10) ; à 13:21, encore aucun essai.

**Fait** :
- get-pending-jobs : navigateur (User-Agent) et pays (cf-ipcountry) du poste notés
  (`_shared/navigateur-poste.js`) ; `contexte.vinted_etranger` pour le popup ≥ 0.6.106.
- App (`src/stock/BlocSynchro.jsx`, `src/utils/navigateurExtension.js`) : nomme le navigateur
  de l'extension quand ce n'est pas celui de l'app (non poussé).
- eBay : la règle « jamais ebay.fr pour un compte étranger » n'était PAS dans le code →
  `_shared/ebay-site.ts` (GetUser `<Site>`), publication retenue + réglages refusés pour un
  compte étranger. Marta = « Italy » (lu le 09/10). Action `site_compte` (x-cron-secret).
- **Extension 0.6.106** (eaf3ff7 + 9d442ae) : `vinted-origine.js` (origine Vinted unique :
  vinted.fr à l'identique sans permission étrangère, 0 cookie lu) ; 17 domaines Vinted de la
  zone euro en `optional_host_permissions` (aucune permission obligatoire nouvelle) ;
  « Autoriser vinted.<pays> » au seul vendeur étranger ; scripts enregistrés à l'octroi ;
  liens vinted.fr du serveur ramenés sur le domaine étranger ; référentiel colis du domaine
  de la page ; navigateur réel nommé (textes identiques sous Google Chrome).
  update-job-status v133 : vérification publique sur le domaine de l'annonce.

**Zip prêt (seul)** : `build/CWS-0.6.106-A-TELEVERSER/fillsell-extension-0.6.106-9d442ae-cws.zip`
(BUILD_ID `2026-10-09T11:12:52Z+9d442ae`). Il CONTIENT le travail Depop (0.6.105 + 02f9f67).
Le dossier `build/CWS-0.6.105-A-TELEVERSER/` (terminal Depop) n'a pas été touché.

**Prouvé** : 229/229 selftests (dont `selftest:vinted-origine`, `selftest:vinted-etranger`) ;
build:essai vert ; en anonyme sur www.vinted.it (Chrome de Nico, lecture seule) : mêmes 8
racines de catalogue, mêmes ids de couleurs, `users/current` 403 « Accesso negato » (même
sémantique que vinted.fr), `api.vinted.it` colis 200 mais `api.vinted.fr` 403 depuis vinted.it
(la correction du référentiel était nécessaire).

**NON prouvé** :
- la 0.6.106 n'est PAS chargée chez Nico : `chrome-extension://` refusé par l'outil, fermeture
  de Chrome refusée par le classifieur. Rien n'a été copié dans
  `C:\Users\nicol\FillSell-Extension-Nico` (0.6.105 sauvegardée dans le scratchpad de la session) ;
- non-régression vinted.fr (synchro, publication 999 €, republication, retrait) : À FAIRE ;
- une vraie session vinted.it : à prouver chez Marta après la publication CWS, surveillé en base.

**Procédure du soir** : Nico « je suis là » → copie de `build/extension` dans
`C:\Users\nicol\FillSell-Extension-Nico` → Nico clique « Recharger » → relire
`profiles.extension_build` (f44b5917… = `2026-10-09T11:12:52Z+9d442ae`) → 4 gestes sur
vinted.fr par l'app déjà connectée (article « TEST FillSell ne pas acheter - Call of Duty
Modern », fiche 1791299785299, 999 €), vérifiés sur la page vinted.fr et en base → si vert,
téléverser le zip + « Envoyer pour examen ».

**Pas fait** : sondes Leboncoin/Beebs encore lancées pour un compte étranger ; bandeau Opla
montré à tous (sortie d'Opla le 10/10).

## A — Fausse vente eBay (enchère)

**Cause prouvée** : le veilleur eBay (v79) lisait « date de fin présente » comme « terminée »,
sans la comparer à maintenant. Enchère 920016444915 (Browse : `[FIXED_PRICE, AUCTION]`, fin
14/10, en cours, 0 vendu) → « Plus en ligne — Vendue ? » à 11:30:05 → **appui de Marta** à
11:32:16 (POST `check-listing-status` depuis son Chrome, son jeton, corps `{job_id, price:15}`)
→ `enregistrer_vente_declaree` → vente « Ailleurs ». Bebertdeals : même chemin, entré par la
« Revue des disparus », puis `inventaire_vendu_retire_ses_copies` (retrait Leboncoin).

**Fait / prouvé** : `_shared/ebay-etat-annonce.js` ; veilleur v83 (fin future = vivante ;
enchère sans acheteur = ni vente ni question, job clos ; faux drapeaux levés : 9, 0 restant ;
2 enchères Jocabroc closes) ; mig 20261009120000 (preuve en prod, transaction annulée : 5 cas
verts, 3 rouges sans elle ; rejeu 30 j : 538 ventes prouvées intactes, 0 bascule) ; file des
quantités d'import débloquée.

**Audit (rien réparé)** — 8 ventes eBay à 0 vendu : 2 vraies prouvées (Tech-t via Vinted
« sold », Jocabroc enchère gagnée) ; 1 FAUSSE prouvée (labouquinerie85, 25/09 : enchère en
cours au moment du « Vendue », terminée sans acheteur, copies Vinted/LBC/Opla retirées) ; 5
XEWER déclarées, plausibles (dont une copie Leboncoin 3260299583 encore en ligne). 60 ventes
« Ailleurs » par ce chemin en 30 j, dont patrick giry ×15 Opla (07/10) revues en ligne le 09/10.

## C — Mail « paiement échoué » (Stripe)

**Cause** (journaux du webhook ; MCP Stripe à reconnecter, `/mcp`) : 3D Secure au Checkout
(`subscription_create`, PI `requires_action`) → `payment_failed` + `payment_action_required`
pendant la validation ; v57 écrivait. Marta : Pro 29,99 €/mois, sans promo, échéance 09/11.
`subscription_period_end` NULL = normal pour Stripe (20/20 abonnés actifs).
**Fait** : stripe-webhook v58 (`decisionMailEchec`). `selftest:paiement-echoue-acquis` vert
(Marta, romain.knc → 0 mail ; nadegemarcelin78 → mail). Audit : 4 mails `payment_failed` au
total, 2 suivis d'un paiement (romain.knc 2,9 min, Marta 34 s).

## D — Mail « vendu » sans vente (Bebertdeals)

**Vérité** (pages publiques, sans session) : 10282272590 et 10293985723 VENDUES ; 10035525435
et 10097511359 supprimées (404). Les ventes sont réelles : c'est la vente qui n'était pas
enregistrée (la lecture de page n'était pas une preuve pour Vinted).
**Fait** : mig 20261009130000 (lecture de page = preuve → cron 52 : vente, retraits, mail).
**Arrêt (garde-fou)** : 20261009160000 ferait perdre son mail à une vraie vente non prouvée
(RoCotCot, Leboncoin, note 808).
**Audit** : 17 mails « vendu » sans vente (11 vraies ventes Vinted non notées dont les 2 de
Bebertdeals ; 4 faux Louis ; 2 eBay Tech-t ; 1 LBC). Aucune copie de Bebertdeals en ligne.

## E — Refus de modération Leboncoin

**Cause prouvée** : refus 6 s après le dépôt (mail Leboncoin, page publique 410), photo
identique à l'octet à la Casio déjà en ligne (fiche créée par Lens le 01/10).
**Fait** : mig 20261009140000 (dépôt jamais vu en ligne = échec avec motif ; cron 72 h ; les
questions déjà ouvertes ne sont pas touchées). Audit : 8 dépôts passés en question, 0 vente.
**Pas fait** : réécriture moins fréquente de `moderation_probe` dans l'extension ; marqueur
sur le refus « sans_reservation » d'update-job-status ; garde doublon par photo au dépôt
(proposée, non codée).

## Décisions qui attendent le GO de Nico

1. **Pousser** `main` (ligne en tête).
2. **Ce soir** : « Recharger » la 0.6.106, preuve vinted.fr, puis **téléverser** le zip 0.6.106
   (et l'ordre face à la 0.6.105). Envoyer le message à Marta (vinted.fr dans Edge, aujourd'hui).
3. **A** : `scripts/reparations/20261009_marta_recu_fausse_vente.sql` (le reçu de la vente
   annulée bloquerait la vraie vente de son enchère) ; labouquinerie85 (fausse vente) ;
   patrick giry ×15 Opla ; copie Leboncoin 3260299583 de XEWER.
4. **D** : appliquer 20261009160000 (cas RoCotCot) ; enregistrer les 11 vraies ventes Vinted.
5. **E** : `scripts/reparations/20261009_depots_jamais_en_ligne_question_vers_echec.sql`
   (Nadia ×3, Tech-t ×1) ; garde doublon par photo.
6. **20261008160000** (remise en ligne, autre terminal) remplace `enregistrer_vente_atomique`
   depuis une définition ANCIENNE : à rebâtir sur `pg_get_functiondef` avant application.
7. **C** : un mot à Marta / romain.knc (aucun mail envoyé) ; reconnecter le MCP Stripe.

Note : le commit d2c9107 contient 6 lignes du terminal Depop (bloc `annonce_partagee` de
get-pending-jobs), déjà dans le fichier partagé au moment du commit.
