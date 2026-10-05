# FillSell Cloud — REPRISE (à lire EN ENTIER avant toute action)

Mis à jour le **05/10/2026** (terminal Cloud). Remplace, pour la suite, le
REPRISE du prototype (`C:\Users\nicol\fillsell-cloud-proto\REPRISE.md`, qui
garde l'histoire du 26/09 et ses mesures).

## 0. En une phrase

L'option **« Sans ordinateur »** (FillSell Cloud, 20 € TTC/mois, essai 7 jours
avec carte, ouverte au Free) fait tourner NOTRE extension dans un navigateur
**steel-browser** hébergé chez **Hetzner**, un par compte, qui sort par une **IP
française dédiée** (IPRoyal). Tout le code est sur la branche **`feat/cloud`**
(poussée), **rien n'est en prod** : drapeau `cloudOffer` à `false`, aucune
migration appliquée, aucune fonction déployée, aucun serveur créé.

## 1. Où est tout

- Branche **`feat/cloud`** (worktree `C:\Users\nicol\fill-and-sell-cloud`) =
  `conception/cloud-option` + `feat/option-cloud-paiements` + `main` du 05/10 +
  le travail du 05/10. Les deux branches d'origine ne servent plus.
- `docs/cloud/` : `pool-ip.md` (IP dédiée, repos, coûts, capacité),
  `paiements-option-cloud.md`, `test-complet.md`, `mise-en-ligne.md`,
  `fiche-boutiques.md` (Apple / Google / Stripe pour Nico), `confidentialite.md`
  (textes à valider), ce fichier.
- Base : `supabase/migrations/20261004233000_option_cloud_paiements.sql` puis
  `20261005120000_cloud_socle_ip_dediee.sql` (NON appliquées ; inverse en tête).
- Serveur : `serveur-cloud/` (orchestrateur Node, images, déploiement, outils) —
  `serveur-cloud/README.md`.
- Extension Cloud : `scripts/cloud/build-extension-cloud.mjs` (11 patchs à ancre
  unique sur `chrome-extension/` commité, qui n'est JAMAIS modifié).
- App : `src/cloud/` (achat, « Me connecter », écrans de la conception),
  `src/config/cloudOffer.js` (drapeau, témoins VIDES, domaine, plateformes).

## 2. Décisions de Nico portées (05/10)

1. IP dédiée par compte (rotation abandonnée), repos avant retour au pool —
   **7 jours proposés** (`cloud_repos_jours`), pool vide = alerte + l'essai attend.
2. 20 € TTC partout (prix Stripe à `tax_behavior` non précisé : 20,00 € payés).
3. Délai entre deux sessions : **réglage** `coin_config.cloud_delai_sessions_min`,
   absent = navigateur en continu. Non figé (étude d'un autre terminal).
4. Mail de la veille : inchangé, derrière sa garde (`email-tunnel`).
5. Carte : vérifié — « Gratuite, sans carte » est sous le bouton de
   l'EXTENSION ; l'option dit partout « carte demandée ».

## 3. Les tests (tout vert le 05/10)

```
npm run selftest:palier              83
npm run selftest:cloud-pool          104 (relit la migration du socle)
npm run selftest:cloud-ecrans        171
npm run selftest:option-cloud        (paiements)
npm run selftest:cloud-rappel-veille
npm run selftest:cloud-extension     19
npm run selftest:cloud-achat         28 (dont le rendu réel de « Me connecter »)
npm run selftest:cloud-orchestrateur 19 (15 purs + 4 simulations bout à bout)
node scripts/cloud/banc-sql-socle.mjs 80 (migrations jouées dans PGlite :
                                       npm i --no-save @electric-sql/pglite@0.3.16)
npm run build:essai
# preuves en concurrence réelle (Postgres 17 jetable) :
npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3
node scripts/cloud/pg-jetable.mjs scripts/cloud/preuve-reservation-concurrente.mjs
node scripts/cloud/pg-jetable.mjs scripts/cloud/preuve-pool-concurrent.mjs
```
Toute la batterie du dépôt sur la branche : **171/171 selftests verts** (05/10).
« Une IP = un compte » **prouvée en concurrence** le 05/10 (10 comptes, 3 IP, au
même instant : 3 places, 7 refus, aucune IP partagée) ; les deux migrations
s'appliquent sur un vrai Postgres 17.

**Prise de job atomique (prérequis)** : en prod depuis le 28/09
(`reserver_jobs_extension`, `controler_job_extension`, `ecrire_statut_job_extension`,
définitions relues le 05/10). **Preuve en concurrence réelle faite le 05/10**
(`scripts/cloud/preuve-reservation-concurrente.mjs`, Postgres 17 jetable,
8 connexions, 4 postes, 200 jobs) : 0 job réservé ou démarré par deux postes,
0 démarrage sans la réservation.

## 4. Ce qui reste (dans l'ordre)

1. **Nico** : Hetzner (compte, carte, projet « fillsell-cloud », jeton
   `HCLOUD_TOKEN` dans `secrets.env` du prototype), IPRoyal (solde ≥ 40 $, 1 IP
   neuve pour le test, `IPROYAL_API_TOKEN`), DNS `cloud.fillsell.app`,
   validation des textes, saisies Apple / Google / Stripe (`fiche-boutiques.md`).
2. **Claude, dès le jeton Hetzner** : `creer-serveur.mjs --infos` puis `--go`,
   `deployer.sh`, contrôles (pare-feu, un navigateur sans proxy ne joint rien),
   MESURE de la RAM d'un navigateur → `NAVIGATEURS_MAX`, coûts réels.
3. **Test complet** (`test-complet.md`) : après la fin du terminal 0.6.96 et sur
   le GO de Nico (avec le GO de la migration socle). Session **0ba8903a**
   (dans `secrets.env`, `FILLSELL_OWN_B64`) posée au coffre par
   `outils/importer-session.mjs`, **révoquée juste après** par
   `cloud_session_revoquer`.
4. **Mise en ligne** (`mise-en-ligne.md`) : sur GO, en une passe — merge sur
   main, migrations, secret `STRIPE_PRICE_CLOUD`, fonctions par
   `scripts/cloud/deployer-fonctions-cloud.mjs` (verify_jwt relu avant/après),
   drapeau à `true` (retirer les 2 lignes du fil-piège du selftest des écrans),
   UN push, UNE OTA.

## 5. Garde-fous

- `cloudOffer` à `false` ; `CLOUD_TEMOINS` et `CLOUD_OFFRE_TEMOINS` VIDES.
- Jamais changer un `verify_jwt` (le script de déploiement le vérifie).
- Aucun achat IPRoyal sans GO (`IPROYAL_ACHATS_AUTORISES=0`), aucun mail
  d'alerte avant l'ouverture (`ALERTES_MAIL=0`), aucun mail aux utilisateurs.
- Orchestrateur : pause des démarrages au-dessus de 50 % de CPU de la base.
- Trois verrous contre la fuite de l'IP du serveur (navigateur au repos sur
  profil vide, profil du compte seulement en session avec proxy, pare-feu qui
  ne laisse sortir que vers les ports des proxys).
- Annonces de test à 999 € ou plus, retirées à la fin.
- Le PC de Nico manque de mémoire : les traitements lourds (navigateurs,
  images Docker) tournent sur le serveur, jamais sur le PC.

## 6. Points d'attention connus

- `get-pending-jobs` évolue chaque jour (v216 le 05/10) : au merge, ne garder de
  `feat/cloud` que le bloc `poste_cloud` (3 hunks, `selftest:cloud-extension`).
- Android : le greffon d'achat choisit la 1re offre du forfait ; impossible
  d'imposer « sans essai » sans nouveau binaire (le serveur n'active pas une
  semaine refusée, l'écran le dit).
- Apple : le 1er abonnement du groupe se soumet AVEC une version de l'app ; le
  compte de démonstration du relecteur va dans `CLOUD_OFFRE_TEMOINS`.
- L'identifiant d'appareil est local (localStorage) : un verrou faible seul,
  fort avec les trois autres (compte, carte, compte de plateforme).
- Beebs : non promis (DataDome le 26/09) ; testé avec profil vierge + IP neuve.
