# FillSell Cloud — le TEST COMPLET (compte de Nico seulement)

**Quand** : APRÈS la fin du terminal « Problèmes 0.6.96 », sur le **feu vert de
Nico**. Rien de ce qui suit n'est fait avant.

**Règles** : compte de Nico seulement (`f44b5917-bccc-4431-ba41-f40571a2ed18`,
liste `COMPTES_AUTORISES` de l'orchestrateur) ; annonces de test à **999 € ou
plus**, jamais un objet de valeur, **retirées à la fin** ; aucun mail ; CPU de la
base surveillé, **pause au-dessus de 50 %** ; extension de bureau de Nico **en
pause** pendant le test (la réservation des jobs est atomique depuis le 28/09,
mais un seul exécutant rend le test lisible).

## 0. Ce qu'il faut avant (Nico)

1. Compte Hetzner + `HCLOUD_TOKEN` dans `secrets.env` ; 1 IP IPRoyal France NEUVE
   achetée (commande à part) ; `IPROYAL_API_TOKEN` dans `secrets.env`.
2. GO « migration socle » : `20261004233000` puis `20261005120000` (colonnes,
   tables, fonctions ; aucun effet sur un compte tant que rien ne les écrit).
3. Choix de l'écran pour le test :
   - **A (proposé)** — page autonome servie par le serveur (lien à usage court,
     30 min) : rien n'est publié dans l'app ;
   - **B** — l'écran de l'app : Nico ajouté à `CLOUD_TEMOINS`, un push sur main
     et une OTA (l'offre, elle, reste fermée à tous).

## 1. Le serveur (Claude) — UNE commande (05/10)

```bash
node serveur-cloud/outils/lancer-serveur-test.mjs          # le plan : jetons, prix, solde, stock France — rien n'est créé
node serveur-cloud/outils/lancer-serveur-test.mjs --go     # GO de Nico : cx43 Falkenstein + 1 IP France 30 j + DNS + déploiement
```
Elle enchaîne `creer-serveur.mjs --go`, l'achat d'UNE IP (solde IPRoyal, sans
renouvellement automatique, plafond 8 $), le DNS (jeton Cloudflare, sinon
`<ip>.sslip.io` et le geste de Nico), cloud-init, `build-extension-cloud.mjs`,
`deployer.sh`, le jeton IPRoyal au `.env` du serveur (achats 0, alertes 0, compte
de Nico seul), puis les contrôles et la mesure ci-dessous. Relancée : reprise,
rien n'est racheté (`cloud-test-etat.json`). Gestes de Nico : `docs/cloud/nico-telephone.md`.
Le détail, s'il faut le refaire à la main :

```bash
node serveur-cloud/outils/creer-serveur.mjs --infos     # prix lus dans l'API
node serveur-cloud/outils/creer-serveur.mjs --go        # cx43, Falkenstein
node scripts/cloud/build-extension-cloud.mjs            # copie Cloud de l'extension (commit du jour)
bash serveur-cloud/outils/deployer.sh <ip>              # <ip>.sslip.io tant que cloud.fillsell.app n'existe pas
```
Contrôles : `/sante` répond ; `docker compose ps` ; le pare-feu
(`iptables -S FILLSELL-NAV`) ; un navigateur SANS proxy ne joint rien
(`docker run --rm --network fillsell-cloud curlimages/curl -m 8 https://www.vinted.fr` → échec attendu).
Mesure : RAM d'un navigateur allumé (`docker stats`) → `NAVIGATEURS_MAX` et
`navigateursParServeur` (coûts) mis à la valeur MESURÉE.

## 2. La base (GO de Nico)

```bash
npx supabase db query --linked -f supabase/migrations/20261004233000_option_cloud_paiements.sql
npx supabase migration repair --linked --status applied 20261004233000
# le sel des empreintes (64 caractères aléatoires, écrit nulle part ailleurs) :
#   select vault.create_secret('<64 car.>', 'cloud_empreinte_sel', 'sel des empreintes Cloud (HMAC)');
npx supabase db query --linked -f supabase/migrations/20261005120000_cloud_socle_ip_dediee.sql
npx supabase migration repair --linked --status applied 20261005120000
```
Relecture : les requêtes en fin de fichier. CPU lu avant et après (`veille_cpu`).

## 3. Le compte de Nico (réparation, `scripts/reparations/`, inverse prêt)

- L'IP neuve entre dans le pool : `node outils/ip.mjs ajouter <commande>` (sur le
  serveur) → le contrôle d'entrée la rend disponible.
- Nico passe en option **offerte** (aucun paiement) : `is_cloud = true,
  cloud_canal = 'offert'` → le déclencheur lui attribue l'IP.
- La session **0ba8903a** (gardée pour le test) est posée dans son coffre :
  `outils/importer-session.mjs` (sinon l'orchestrateur en fabrique une).

## 4. Les connexions (Nico, sur son iPhone)

Lien (A) : `node outils/ticket.mjs f44b5917-…` ; ou (B) Réglages › Abonnement ›
« Connecter Vinted et Leboncoin ». Vérifier : seule la page de connexion
s'ouvre ; un lien hors connexion est refusé ; pas de zoom ; le clavier
s'ouvre par « ⌨︎ Écrire » ; Apple (Vinted) passe ; la ligne « Connecté »
s'allume ; `cloud_coffre` porte une ligne chiffrée par plateforme.
**Beebs** : profil vierge, IP non marquée — on essaie (lien direct sur la page
de connexion Beebs via l'outil de test, Beebs n'est pas dans l'écran de l'app) ;
blocage DataDome = on note « environnement », on ne réessaie pas.

## 5. Les gestes (une annonce de test à 999 €+ par plateforme)

| Geste | Vinted | Leboncoin | Beebs | eBay (API) |
|---|---|---|---|---|
| Publication | ☐ | ☐ | ☐ (si connecté) | ☐ |
| Republication | ☐ | ☐ | — | ☐ |
| Retrait | ☐ | ☐ | ☐ | ☐ |
| Détection de vente (annonce marquée vendue / hors ligne) | ☐ | ☐ | ☐ | ☐ |

Pour chaque ligne : `handler_build` en `…-cloud`, durée, captcha ou blocage,
URL de l'annonce, puis la page vérifiée **dans le navigateur de Nico** (jamais
WebFetch pour Vinted). Pendant tout le test : CPU (`veille_cpu`) toutes les
10 min ; au-dessus de 50 %, pause.

## 6. La fin du test (dans cet ordre)

1. Toutes les annonces de test retirées et vérifiées.
2. Nico repasse sans option (`is_cloud = false`) → son IP part au repos → purge
   prouvée par l'entretien (`cloud_ip_noter_purge`).
3. **Révocation de la session 0ba8903a** (et de toute session fabriquée) :
   `select public.cloud_session_revoquer('f44b5917-bccc-4431-ba41-f40571a2ed18', '0ba8903a-a203-4a4a-abf6-fd66b9b9a5de');`
   puis retirer `FILLSELL_OWN_B64=` de `secrets.env` ; relecture `auth.sessions` → 0.
4. Nico remet son extension de bureau.
5. Compte rendu : mesures (RAM, CPU, durées), ce qui passe, ce qui casse.
