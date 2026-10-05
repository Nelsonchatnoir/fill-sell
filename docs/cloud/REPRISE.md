# FillSell Cloud — REPRISE (à lire EN ENTIER avant toute action)

> ⛔ **PÉRIMÉE depuis le 05/10 16:00** : `feat/cloud` est FUSIONNÉE dans `main` (7b9771c)
> et servie (web + OTA 2.9.56). La REPRISE à jour est dans le dossier PRINCIPAL :
> `C:\Users\nicol\fill-and-sell\docs\cloud\REPRISE.md` (§ 0 bis). Ne plus commiter sur cette branche.

Mis à jour le **05/10/2026, 15:15** (terminal Cloud). Remplace, pour la
suite, le REPRISE du prototype (`C:\Users\nicol\fillsell-cloud-proto\REPRISE.md`,
qui garde l'histoire du 26/09 et ses mesures).

## 0. En une phrase

L'option **« Sans ordinateur »** (FillSell Cloud, 20 € TTC/mois, essai 7 jours
avec carte, ouverte au Free) fait tourner NOTRE extension dans un navigateur
**steel-browser** hébergé chez **Hetzner**, un par compte, qui sort par une **IP
française dédiée** (IPRoyal). Tout le code est sur la branche **`feat/cloud`**
(poussée). **Rien n'est en prod côté utilisateurs** : drapeau `cloudOffer` à
`false`, aucune migration appliquée, aucune fonction déployée. **Le serveur de
test tourne** depuis le 05/10 (cx43 Falkenstein, `cloud.fillsell.app`, UNE IP
France 94.194.94.233, contrôles verts, § 4.2) mais ne sert personne tant que le
socle n'est pas en base. Le mail « paiement échoué » est corrigé sur
`feat/cloud`, NON déployé, événements Stripe NON cochés (§ 4.5). Nico est le
SEUL témoin (écran B du test, dans l'app).

**Pour un NOUVEAU terminal, dans l'ordre** : (1) attendre la fin du terminal
Problèmes (§ 4.1) ; (2) sur GO de Nico : migrations 20261004233000 puis
20261005120000 (§ 4.1, point 2) ; (3) fusion dans `main` + preuve « IDENTIQUE »
contre l'OTA servie + OTA de l'écran B (§ 4.1) ; (4) redéployer le serveur
depuis le dossier principal (§ 4.2) ; (5) test complet sur GO (§ 4.3) ;
(6) déploiement `email-tunnel` puis `stripe-webhook` et cochage des deux
événements Stripe sur GO (§ 4.5, étape 4 bis de `mise-en-ligne.md`).

## 1. Où est tout

- Branche **`feat/cloud`** (worktree **`C:\Users\nicol\fill-and-sell-feat-cloud`**,
  créé le 05/10 à 13:20 parce que `fill-and-sell-cloud` porte `fusion/cloud-main`) —
  poussée, canonique, partie d'`origin/main` 5d6a0e9. Ce worktree n'a PAS de
  `npm ci` à la racine (PC à court de mémoire) : son `node_modules` ne contient
  que `terser`, `jszip` et leurs 19 dépendances, copiés de `fill-and-sell-cloud`
  — de quoi lancer `lancer-serveur-test.mjs` (build de l'extension Cloud compris)
  et les selftests sans dépendance (paiement-echoue, option-cloud,
  cloud-rappel-veille, paiement-stripe, imports-epingles), pas `npm run build`.
  `serveur-cloud/node_modules` : `npm ci` léger (supabase-js, ws ; 9 Mo) pour
  `node --test serveur-cloud/tests/*.test.mjs` (20/20).
- Branche LOCALE **`fusion/cloud-main`** (worktree `C:\Users\nicol\fill-and-sell-cloud`, NON poussée, ⛔ on n'y touche pas : elle
  porte les commits non poussés du terminal Problèmes) = `main` local du 05/10
  (47700b1) + `feat/cloud`, conflits résolus, **179/179 selftests verts**.
  Elle se refait en une commande (§ 4.1) : c'est un brouillon de la fusion.
- `docs/cloud/` : `pool-ip.md`, `paiements-option-cloud.md`, `test-complet.md`,
  `mise-en-ligne.md`, `fiche-boutiques.md`, `confidentialite.md` (FINALE),
  **`nico-telephone.md`** (gestes de Nico, coûts), ce fichier.
- Base : `supabase/migrations/20261004233000_option_cloud_paiements.sql` puis
  `20261005120000_cloud_socle_ip_dediee.sql` (NON appliquées ; inverse en tête).
- Serveur : `serveur-cloud/` — **commande unique** `outils/lancer-serveur-test.mjs`.
- Extension Cloud : `scripts/cloud/build-extension-cloud.mjs` (11 patchs à ancre
  unique sur `chrome-extension/` commité, jamais modifié).
- App : `src/cloud/` (achat, « Me connecter », écrans, **textes légaux**),
  `src/config/cloudOffer.js` (drapeau, témoins = Nico, `CLOUD_TEXTES_LEGAUX`).
- Secrets (hors dépôt) : `C:\Users\nicol\fillsell-cloud-proto\secrets.env` —
  les trois jetons **posés et vérifiés en lecture le 05/10** : `HCLOUD_TOKEN`
  (projet fillsell-cloud, 0 serveur) ; `IPROYAL_API_TOKEN` (compte du prototype,
  solde 20,00 $, ISP Dedicated › 30 Days › France à **4,00 $**, achat minimum 1) ;
  `CLOUDFLARE_API_TOKEN` (valide, zone fillsell.app accessible, « DNS : Modifier »
  sur cette zone seule, **expire le 12/10**). État du test (sans secret) :
  `cloud-test-etat.json` à côté (§ 4.2).

## 2. Décisions de Nico (05/10)

1. IP dédiée par compte ; **repos de l'IP : 7 jours** (validé).
2. 20 € TTC partout.
3. Délai entre deux sessions : réglage `coin_config.cloud_delai_sessions_min`,
   absent = en continu. Non figé.
4. **Rappels de fin d'essai Stripe : coupés** (Nico, dans le tableau de bord, le
   05/10 au soir). Notre mail de la veille reste tel quel derrière sa garde et
   part à la mise en ligne.
5. **Écran du test : B, dans l'app** — Nico dans `CLOUD_TEMOINS` ET
   `CLOUD_OFFRE_TEMOINS`, lui seul ; aucun autre compte ne voit rien.
6. Apple, Google, Stripe (tableau de bord) : Nico, avec `fiche-boutiques.md`.
   ⛔ Dans Stripe, NE PAS cocher `invoice.payment_failed` /
   `invoice.payment_action_required` (Claude les ajoute par l'API à la mise en
   ligne, étape 4 bis, sur GO de Nico).
7. **Mail « paiement échoué »** (05/10 après-midi) : GO pour tout corriger
   (pied anglais, fin d'essai à part, 3D Secure vers la page Stripe, aucun geste
   promis qui n'existe pas) — fait sur `feat/cloud`, § 4.5. Déploiement et
   cochage : GO de Nico.
8. **Serveur de test** (05/10 après-midi) : transaction autorisée par Nico, UNE
   fois — cx43 Falkenstein, UNE IP France ISP Dedicated 30 j à 4 $ sans
   renouvellement, DNS `cloud.fillsell.app`. Rien d'autre (pas de 2ᵉ serveur,
   pas de 2ᵉ IP, pas de reprise de #83578416).

## 3. Les tests (05/10, tout vert)

```
npm run selftest:palier              83
npm run selftest:cloud-pool          104
npm run selftest:cloud-ecrans        171
npm run selftest:cloud-achat         30 (témoins = Nico seul, tout autre id refusé)
npm run selftest:cloud-textes-legaux 39 (nouveau : faits relus dans le code, /legal baissé puis levé)
npm run selftest:cloud-orchestrateur 20 (dont « socle absent »)
npm run selftest:option-cloud · cloud-rappel-veille · cloud-extension 19
npm run selftest:paiement-echoue     315 (05/10 : mail « paiement échoué », § 4.5)
node scripts/cloud/banc-sql-socle.mjs 80
# AVANT toute OTA — la preuve qu'un compte ordinaire voit l'app servie à l'identique :
node scripts/cloud/preuve-identite-compte-ordinaire.mjs --version <n° lu sur le canal Capgo>
```
Batterie complète sur `fusion/cloud-main` : **179/179 selftests verts** (05/10).
Preuve d'identité contre `main` (la base de la fusion) : **708 scènes identiques
octet pour octet** (Free/Premium/Pro/Business/sans compte, fr/en, téléphone/
ordinateur ; feuille des formules, mur de l'extension, carte d'installation,
étape d'entrée, page /extension, Réglages › Abonnement, /legal), palier
identique, aucune requête Cloud, contrôle négatif vert (pour Nico, ça diffère).
Contre la version SERVIE (OTA 2.9.53, 4859311) : **ÉCHEC attendu** — 8 fichiers
de l'app du lot Problèmes pas encore servis partiraient avec l'OTA (§ 4.1).
⚠️ `npm run build:essai` NON relancé le 05/10 (lourd ; le terminal Problèmes
tournait, 1,3 Go libres) : à faire avant l'OTA.

## 4. Ce qui reste (dans l'ordre)

### 4.1 L'écran B sur l'iPhone de Nico — après la fin du terminal Problèmes

**Relu le 05/10 à 15:20** : le lot Problèmes est **POUSSÉ et SERVI** —
`origin/main` = `main` local = **b38d842** (package 2.9.55, extension
**0.6.98**, CWS à téléverser selon sa reprise), web `build.json` =
`2026-10-05T13:07:43Z+b38d842`, OTA 2.9.55 faite (mémoire du terminal
Problèmes, à relire sur le canal Capgo). ⚠️ `fusion/cloud-main` (e5ee242, base
47700b1) est donc PÉRIMÉE : la fusion se refait contre `origin/main` b38d842
(point 3), la preuve « IDENTIQUE » se fait contre **2.9.55** (ou ce que dit le
canal). Le terminal Problèmes travaillait encore sur le compte de Nico : la
fin se vérifie (§ 4.3), elle ne se suppose pas. Ordre :
1. le terminal Problèmes a clos son lot (fait côté push et OTA le 05/10 ;
   vérifier qu'il n'écrit plus et que le compte de Nico est calme) ;
2. **la base** (dire à Nico AVANT, GO) : l'écran B LIT les colonnes et fonctions
   Cloud — sans `20261004233000` (colonnes + `cloud_etat_moi`) et
   `20261005120000` (`cloud_essai_preparer_moi`, `cloud_coffre_etat_moi`), la
   lecture échoue et l'écran ne montre RIEN, même à Nico. Effet sur les autres
   comptes, relu : colonnes nulles ajoutées à `profiles` (droits par colonne :
   personne ne peut les écrire), un déclencheur qui ne s'éveille que sur les
   colonnes Cloud, l'index `email_logs_one_shot_unique` refait avec un type de
   plus (même liste + `cloud_essai_veille`), 10 tables `cloud_*` fermées,
   aucun cron. Sans le sel `cloud_empreinte_sel` au vault, la préparation
   d'essai refuse (rien ne s'ouvre) ;
3. dans le dossier PRINCIPAL : `git merge --no-ff origin/feat/cloud` (conflits :
   `src/utils/palier.js` = le ré-export de main + la section Cloud de
   feat/cloud, qui importe aAuMoins / palierDuProfil / droitsDuPalier de
   `_shared/palier.js` ; `package.json` = les deux listes ; `get-pending-jobs`
   s'auto-fusionne : main + les 3 blocs `poste_cloud`, vérifier
   `git diff main -- supabase/functions/get-pending-jobs/index.ts`) ;
4. 179+ selftests, `npm run build:essai`, puis
   `preuve-identite-compte-ordinaire.mjs --version <canal>` → **IDENTIQUE** ;
5. version montée (package.json + lock), commit, UN push, `npm run build`,
   `npx @capgo/cli bundle upload --channel production --bundle <v> --path dist`,
   relecture du canal. Rien d'autre : ni fonction, ni drapeau.

### 4.2 Le serveur de test — CRÉÉ, DÉPLOYÉ, PRÊT (05/10, 15:10 Paris)

Transaction autorisée par Nico (décision 8), lancée par Claude le 05/10 à
14:57 (le classifieur l'avait refusée à 13:35, il l'a laissée passer après
l'autorisation écrite). **État réel** :

| | |
|---|---|
| Serveur | Hetzner `fillsell-cloud-1` (id 168804683), **cx43, fsn1 (Falkenstein)**, IPv4 **178.105.24.16** (+ IPv6, les deux `auto_delete`), créé 12:57:44 UTC ; seul serveur du projet, aucun volume, pare-feu `fillsell-cloud` (22/80/443), clé SSH `~/.ssh/fillsell_cloud_ed25519` (sur le PC de Nico) |
| IP de test | IPRoyal commande **84458881** — ISP Dedicated, France, 30 jours, quantité 1, **sans renouvellement** (passée avec `auto_extend: false`, aucune question) ; IP **94.194.94.233** (sortie vue : FR, Paris), port 12323 ; échéance **04/11/2026 12:57 UTC** ; identité IPRoyal non vérifiée : l'achat est passé quand même |
| DNS | `cloud.fillsell.app` A → 178.105.24.16, nuage GRIS (Cloudflare, TTL 60) ; TLS obtenu par Caddy |
| Déployé | commit **920c2fa** de `feat/cloud` (orchestrateur `fillsell-orchestrateur:920c2fa064a3`, navigateur `fillsell-navigateur:920c2fa064a3`) ; extension Cloud **0.6.96-cloud** (`chrome-extension/` de feat/cloud) |
| Contrôles | ✓ `https://cloud.fillsell.app/sante` `{"ok":true,"serveur":"cloud-1","navigateurs":0}` · ✓ caddy + orchestrateur `running` · ✓ pare-feu FILLSELL-NAV · ✓ navigateur SANS proxy : rien (code 000) · ✓ par l'IP de test : sortie 94.194.94.233 (FR, Paris) |
| Mesure | UN navigateur allumé (compte fictif, profil neuf détruit, accueil Vinted puis Leboncoin) : **pic 802 Mo, moyenne 679 Mo** (limite 1400m) ; hôte 15 614 Mo → **NAVIGATEURS_MAX proposé : 13** ((15 614 − 2 048) / (802 × 1,3)) ; **NON appliqué** : le `.env` du serveur garde `NAVIGATEURS_MAX=8` (le test n'en allume qu'un) |
| Garde-fous (relus dans `/srv/fillsell-cloud/.env`, chmod 600) | `IPROYAL_ACHATS_AUTORISES=0` · `ALERTES_MAIL=0` · `COMPTES_AUTORISES=f44b5917…` (Nico seul) · `CPU_PAUSE_AU_DESSUS=50` · clés Supabase, coffre, tickets, jeton IPRoyal posés, jamais affichés |
| Base | l'orchestrateur a dit `socle_absent` (planificateur 13:08:29, entretien 13:09:24 UTC) puis ne réessaie que toutes les 10 min : 2 appels refusés / 10 min. CPU de la base : 4,9 % avant, 5,8 % après (max 11 % sur 30 min) |

**Coût réellement engagé** : IP **4,00 $** (solde IPRoyal 20 → 16 $) ; serveur
facturé à l'heure depuis 12:57 UTC : 0,0307 € TTC/h + IPv4 0,60 € TTC/mois
(≈ 0,66 € TTC par jour, plafond 19,79 € TTC/mois) ; Cloudflare 0 €. Supprimer
le serveur arrête tout (Hetzner, `DELETE /servers/168804683`) — décision de Nico.

**Trois défauts trouvés au premier déploiement, corrigés et commités** (le
`--go` a été relancé deux fois, sans rien racheter) : `COPY --chmod` exige
BuildKit, absent du docker.io d'Ubuntu 24.04 (a32e712) ; l'orchestrateur parlait
l'API Docker 1.43, Docker 29 exige 1.44 au minimum → redémarrage en boucle
(88cdaa6, tests orchestrateur 20/20) ; `docker compose ps|exec` après coup sans
`VERSION_ORCHESTRATEUR` → `deploiement/.env` écrit par deployer.sh (920c2fa).
Plus l'affichage du lieu Hetzner (07608a4, sans effet sur le serveur).

**À relire dans `C:\Users\nicol\fillsell-cloud-proto\cloud-test-etat.json`**
(aucun secret) : `serveur` (id, ip, type ; `lieu` absent de ce fichier, c'est
fsn1), `ip_test` (commande 84458881, ip, port, `expire_le`), `deploye` (sha,
domaine, `controles_ok: true`), `mesure` (pic, moyenne, `navigateurs_max_propose`,
`profil_detruit: true`). Relancer `node serveur-cloud/outils/lancer-serveur-test.mjs`
(sans `--go`) = le PLAN en lecture : il doit dire « 1 serveur — repris » et
« cloud.fillsell.app → 178.105.24.16 (= le serveur) ».

Sur le serveur : `ssh -i ~/.ssh/fillsell_cloud_ed25519 root@178.105.24.16`, puis
`cd /srv/fillsell-cloud/deploiement && docker compose logs --tail 50 orchestrateur`.

**Ce qui reste pour le serveur** (nouveau terminal) : après la fusion,
REDÉPLOYER depuis le dossier principal (même commande `--go`, rien n'est
racheté) pour embarquer l'extension **0.6.98** (main b38d842) et le code fusionné ; puis, au
test complet : `docker compose exec orchestrateur node outils/ip.mjs ajouter
84458881` (après les migrations). Décider `NAVIGATEURS_MAX` (8 ou 13) avant
d'ouvrir à d'autres comptes. L'IP du prototype #83578416 (jusqu'au 26/10) n'est
PAS reprise (décision de Nico).

### 4.3 Le test complet (`test-complet.md`) — sur le GO de Nico

Prérequis : le terminal Problèmes a FINI sur le compte de Nico (deux exécutants
sur le même compte = test illisible) — le vérifier : son transcript n'écrit
plus, son lot est poussé, et `cross_post_jobs` du compte de Nico n'a plus de
`pending`/`processing` venant de son extension ; puis l'extension de bureau de
Nico en pause. Session **0ba8903a** posée au coffre, révoquée juste après.

### 4.4 La mise en ligne (`mise-en-ligne.md`) — sur GO, en une passe

Dont l'étape **4 bis** (les deux événements Stripe, par l'API, juste après la
nouvelle `stripe-webhook`) : ⚠️ la `stripe-webhook` en prod (v56) traite DÉJÀ
ces événements depuis le 07/08 (mail au client, alerte) sans les avoir jamais
reçus — les cocher allume ce mail pour TOUTES les formules : GO de Nico avant.
Les textes légaux partent avec le drapeau (`CLOUD_TEXTES_LEGAUX`).

### 4.5 Le mail « paiement échoué » — CORRIGÉ sur `feat/cloud`, NON DÉPLOYÉ, événements NON cochés

GO de Nico le 05/10 après-midi : « on corrige tout, texte nickel dans tous les
cas ». Fait le 05/10 (commits 26772fa, cd069a3, acce21a, b4240ae) :
- **pied du gabarit dans la langue du mail** (`_shared/email-template.ts`,
  `textesPied`) : tout mail anglais finissait en français. Français octet pour
  octet inchangé (14 rendus comparés à HEAD : bienvenue, comment ça marche, lien
  de l'extension, relances 1 et 2, résiliation, ventes, gabarit nu) ; anglais :
  seul le pied change. Liens du pied relus : `/legal#mentions` et
  `/legal#confidentialite` existent (`src/pages/Legal.jsx`) ; limite connue :
  /legal choisit sa langue par `localStorage.fs_lang` (français par défaut), un
  lecteur anglais qui n'a jamais réglé l'app en anglais la voit en français
  (correctif possible plus tard : `?lang=en`, dans l'app → OTA) ;
- **règles et textes** : `_shared/paiement-echoue.js` (pur, testé), mis en page
  par `mailPaiementEchoue` (`_shared/emails-fillsell.ts`). Trois contextes :
  souscription, renouvellement, **fin d'essai** (Cloud : « Ton essai FillSell
  Cloud est terminé et le paiement n'a pas abouti »). **Détection de la fin
  d'essai sur les données de Stripe** : `facture.billing_reason ===
  'subscription_cycle'` ET `abonnement.trial_end` non nul ET une ligne de la
  facture dont `period.start` = `trial_end` (à 60 s près) — facture et
  abonnement RELUS par l'API dans `stripe-webhook` ;
- **chaque geste promis existe** : souscription → bouton vers l'app (une
  facture réglée hors de Checkout n'ouvre PAS l'abonnement : `is_premium` et
  `stripe_customer_id` ne se posent que sur `checkout.session.completed`) ;
  renouvellement et fin d'essai → `hosted_invoice_url` d'une facture `open`
  (« Régler la facture » / « Valider le paiement » pour un 3D Secure) ; pas de
  page réglable → aucun bouton, « réponds à ce mail » ; « Stripe retentera le
  paiement le … » seulement si `next_payment_attempt`, jamais pour un 3D Secure
  ni une carte expirée ; « reste actif » seulement au renouvellement et si
  l'abonnement est `active`/`past_due` ; « mets à jour ton moyen de paiement
  depuis l'app » SUPPRIMÉ (le portail n'existe que sur le web, sous « Mes
  factures ») ;
- **bogue trouvé en passant** : l'événement arrive au format `2026-03-25.dahlia`
  (relevé du 24/09), sans `payment_intent` : la cause fine (carte refusée,
  expirée) ne se lisait JAMAIS. `stripe-webhook` relit désormais la facture par
  le SDK (2023-10-16) ;
- **ordre de mise en ligne** : `email-tunnel` AVANT `stripe-webhook`
  (`deployer-fonctions-cloud.mjs`), un ancien `email-tunnel` rendrait une fin
  d'essai en « souscription » ;
- **preuves** : `npm run selftest:paiement-echoue` (315 : règles, 24 variantes
  fr/en, cas sans lien, rendu par le vrai gabarit, câblage webhook → notify →
  tunnel) ; `cloud-rappel-veille` 35, `option-cloud` 58, `paiement-stripe` 21,
  `imports-epingles` verts ; `deno check` : email-tunnel 0 erreur (= HEAD),
  stripe-webhook 34 (HEAD 32 : les deux nouveaux appels `stripe.invoices` /
  `stripe.subscriptions` sur un SDK chargé en `?no-check`, même famille).

⛔ Rien de déployé (email-tunnel v69 et stripe-webhook v56 tournent toujours),
rien de coché chez Stripe. Reste, sur GO de Nico : déploiement (avec la mise en
ligne Cloud, ou seul : `email-tunnel` puis `stripe-webhook`, même `verify_jwt`
= false), PUIS cocher les deux événements par l'API (étape 4 bis), puis un
« Send test event » → alerte « compte introuvable » = câblage prouvé.
Fusion : `origin/main` b38d842 n'a touché AUCUN de ces fichiers (ni `serveur-cloud/`, ni
`scripts/cloud/`) depuis la base commune 5d6a0e9 — pas de conflit attendu sur ce lot.

## 5. Garde-fous

- `cloudOffer` à `false` ; témoins = Nico SEUL (`NICO_USER_ID`) ; tout autre
  identifiant refusé (selftest).
- Jamais changer un `verify_jwt` (le script de déploiement le vérifie).
- Aucun achat IPRoyal hors de `lancer-serveur-test.mjs --go` (1 IP, plafond 8 $,
  sans renouvellement) ; orchestrateur `IPROYAL_ACHATS_AUTORISES=0`,
  `ALERTES_MAIL=0`, `COMPTES_AUTORISES` = Nico.
- Pause des démarrages au-dessus de 50 % de CPU de la base.
- Trois verrous contre la fuite de l'IP du serveur.
- Annonces de test à 999 € ou plus, retirées à la fin.
- PC de Nico : rien de lourd pendant qu'un autre terminal travaille.
- Échéances : jeton Cloudflare jusqu'au **12/10** ; IP de test 84458881 jusqu'au
  **04/11** (sans renouvellement : elle s'éteint seule) ; serveur facturé à
  l'heure tant qu'il existe (≈ 0,66 € TTC/jour) — le supprimer = décision de Nico.
- Aucun 2ᵉ serveur, aucune 2ᵉ IP, aucune reprise de #83578416 sans nouvelle
  décision de Nico (décision 8).

## 6. Points d'attention connus

- `get-pending-jobs` : prod **v216 = `main` local du 05/10** (relu par
  `functions download`). Au merge, ne garder de `feat/cloud` que les blocs
  `poste_cloud`.
- **Google Play, relu le 05/10 (lecture seule)** : `app.fillsell.cloud.sub` ›
  `cloud-monthly` actif (175 pays) › offre `cloud-trial-3d` **active, 175/175
  pays, « Essai gratuit — 7 jours », éligibilité « Acquisition de nouveaux
  clients › N'ont jamais eu cet abonnement »**. Conforme.
- **Stripe, relu le 05/10** : endpoint `we_1TNHq1QZRA77vrWJHXw51Svb`, 4 événements.
- **IPRoyal** = IPRoyal Services FZE LLC (Émirats arabes unis) : transfert hors
  UE (clauses contractuelles types, dites dans la confidentialité 4.8).
- Android : le greffon d'achat choisit la 1re offre du forfait.
- Apple : 1er abonnement du groupe soumis AVEC une version de l'app ; compte de
  démonstration du relecteur dans `CLOUD_OFFRE_TEMOINS` le moment venu.
- L'identifiant d'appareil est local : un verrou faible seul, fort avec les trois autres.
- Beebs : non promis (DataDome le 26/09).
- L'extension Cloud se construit depuis `chrome-extension/` du commit déployé :
  le serveur porte aujourd'hui **0.6.96-cloud** (feat/cloud) ; la 0.6.98 du lot
  Problèmes n'y sera qu'après la fusion et un redéploiement (§ 4.2).
- Docker sur le serveur : **29.1.3** (Ubuntu 24.04, paquet docker.io), sans
  buildx/BuildKit — pas de `COPY --chmod` ni `RUN --mount` dans les Dockerfiles ;
  API Docker de l'orchestrateur épinglée en 1.44 (`src/docker.js`).
