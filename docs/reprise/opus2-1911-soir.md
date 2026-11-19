# Reprise — terminal Opus-2 (« PROBLÈMES »), 19/11/2026 soir (heure de Paris)

État au moment du clear demandé par Nico. Tout ce qui est poussé est sur `main` jusqu'à 0a85b3e ; après, des commits LOCAUX
non poussés (fenêtre sans push d'Opus-1 pour l'essai de l'OTA 2 / 2.9.217 : c'est lui qui pousse à son étape 4).

## 1. En attente d'un geste ou d'un signal
- **Lizzaa (d5531b8e), 88 dépôts Leboncoin « nom et prénom »** : débloquée seulement quand la 0.6.194 tourne chez elle
  (zip `build/CWS-0.6.194-A-TELEVERSER/fillsell-extension-0.6.194-cws.zip`, à téléverser par Nico ; « Publier » après
  l'accord de Google). Le serveur (handler-watch v214) relance l'éclaireur tout seul dès que son `extension_build` ≥
  `2026-11-18T22:02:42Z` ; s'il passe, ses 88 tâches repartent. Preuve exigée par Nico : une annonce Leboncoin publiée
  (`published_at`, `handler_build` v0.6.194) — la lui annoncer, c'est lui qui écrit à la cliente. Requête :
  `select id, status, published_at, handler_build from cross_post_jobs where user_id='d5531b8e-ec32-4dd1-8213-bb15e9be479b'
  and platform='leboncoin' and status='published' and published_at > '2026-11-19 18:00+01' order by published_at;`
  Ne pas toucher aux 113 tâches « Arrêtée à ta demande ».
- **Après la 2.9.217 en PRODUCTION (signal d'Opus-1)**, dans cet ordre (feux verts de Nico donnés) : migrations
  `20261119190000_cloud_ip_fin_de_compte`, `20261119200000_cloud_actif_sans_ip_prioritaire`,
  `20261119170000_cloud_capacite_conso_reelle` (`npx supabase db query --linked -f` + `migration repair --status applied`),
  script `scripts/reparations/20261119_cloud_ip_reglages.sql`, puis orchestrateur cloud-2
  (`ORCHESTRATEUR_SEUL=1 bash serveur-cloud/outils/deployer.sh 5.9.80.213 cloud-2.fillsell.app`, chemins serveur-cloud propres).
- **Rachat d'IP** : COUPÉ (`cloud_ip_achats_auto = 0`). Décisions de Nico du 19/11 soir : on reste chez IPRoyal, PAS
  d'exigence d'IP de box ; contrôle PRAGMATIQUE avant toute attribution (refuser hébergeur / proxy / pays ≠ FR / plateforme
  qui ne s'ouvre pas ; accepter le reste), aussi au retour du repos et à chaque renouvellement ; alerte immédiate au premier
  blocage de plateforme lié à une IP ; chaque commande avec « Extra Requirements » = « French residential ISP only (Orange
  AS3215, SFR AS15557, Bouygues AS5410, Free AS12322), no hosting/datacenter ASN, IP located in France ». Le rachat se
  rallume une fois ce contrôle codé ET prouvé (essai réel sur une IP du stock), avec les 4 règles d'achat. Travail de
  l'agent : voir § 3.
- **IPRoyal** : remboursement de la commande 88951128 (= IP 89, 72.9.172.149, grillée) demandé dans le chat le 19/11 ~18:20 ;
  attendre la réponse (chat du tableau de bord, ou mail à l'adresse du compte). Non remboursables : 80, 81, 82, 88 —
  grillées, jamais attribuées ni renouvelées (garde « grillée » + `cloud_ip_renouveler_saines_seulement`), elles expirent
  (16/12, 19/12). La 81 a été remplacée par IPRoyal (72.9.168.234, même plage) : la relecture horaire du nouvel orchestrateur
  la reprendra et la repassera au contrôle.
- **Test Beebs « fap »** (Nico : « passe par le Cloud de Nico, pas de geste de sa part ») : PAS FAIT. Deux fiches à ≥ 999 €,
  avec et sans « fap », publiées sur Beebs par le Cloud de Nico, puis retirées ; si c'est le mot, règle pour tous (message
  clair + proposition de titre sans le mot).

## 2. Non commité dans l'arbre (à MOI) — à commiter après la suite complète
- `src/cloud/MeConnecterCloud.jsx` (`Z_CONNEXION_CLOUD = 30000` : l'écran de connexion Cloud toujours au premier plan ;
  cliente 0909a787, 17:00, écran ouvert « auto » caché derrière la feuille `fs-cloud-anime` z-index 9990) +
  `scripts/cloud-connexion-premier-plan-selftest.mjs` (6 échecs sur 7 sur HEAD, 7/7 après) + ligne package.json
  `"selftest:cloud-connexion-premier-plan": "node scripts/cloud-connexion-premier-plan-selftest.mjs",`.
  Essai réel (navigateur isolé, compte de Nico, couche 9990 posée par-dessus) : PRODUCTION (ancien code) → CACHÉ sur
  ordinateur 1280×585, iPhone 15 (WebKit), Android Pixel 7 (Chromium) ; build local corrigé → AU PREMIER PLAN sur les trois.
  La suite complète (un test à la fois, mémoire du PC juste) n'a pas pu finir avant le clear : la relancer, puis commiter
  (package.json par blob : ne pas embarquer les lignes non commitées d'Opus-1), et le signaler à Opus-1 pour son OTA.
- Commités en local (non poussés) : 63b6392 (IP 83 rendue par +test5) ; scripts `scripts/reparations/20261119_annule_republication_erreur_test.sql`,
  `20261119_fiche_test_1793387931852_remise(.sql, _INVERSE.sql)` (voir § 4) et ce fichier.

## 3. Chantiers d'agents à reprendre
- **Contrôle avant attribution d'IP** : PAS TERMINÉ. Fait (dans `docs/reprise/ip-controle-avant-attribution-1911.patch`,
  `git apply --check` passe, arbre rendu propre) : la migration `20261119230000_cloud_ip_controle_avant_attribution` (+ inverse,
  après 190000 et 200000 ; réécrit cloud_ip_attribuer, cloud_ip_reserver, cloud_ips_servir_actif_sans_ip depuis les corps
  de prod, gardes md5) : attribuable seulement si santé « saine » contrôlée il y a < 60 min (`cloud_controle_attribution_min`)
  et APRÈS la dernière libération / livraison ; sinon « une place se prépare », la 1re qui échoue → la suivante. Banc jetable
  `PREUVE_PG=embarque node scripts/essais/20261119230000_banc.mjs` : 38/38. RESTE : miroirs JS dans cloud-pool.js ;
  entretien.js `controlerAvantAttribution()` (appelé après reapprovisionnerVite) et contrôle de sortie des IP tenues à J-4
  (sante.js `verifierSortie`) ; alerte au 1er blocage dans verifications.js `noterRefusIp` (clé existante
  `orchestrateur.plateforme_arretee`, une fois par IP et par incident) ; Extra Requirements dans serveur-cloud/src/iproyal.js
  `commander` (paramètre API `product_question_answers: { <question_id>: "<texte>" }`, id lu dans GET /products
  `products[].questions[].id`, refuser d'acheter sans lui) ; le verrou `scripts/ip-controle-avant-attribution-selftest.mjs`
  (rouge sur HEAD) ; puis suite, commit, déploiement après le § 1, essai réel sur l'IP 90, et rallumer le rachat.
  Deux questions pour Nico : (1) eBay est cité dans « plateforme qui ne s'ouvre pas », mais la santé ne visite plus eBay
  depuis le 14/11 (sa décision, verrou ip-sante-sans-ebay) : on le remet ? (2) avant le renouvellement d'une IP TENUE par un
  client, pas de visite de plateforme (ce serait un robot sur l'IP du client) : seulement la sortie et un refus prouvé — OK ?
- **Couleur Vinted « Noir, Gris » au lieu de « Gris » en republication corrigée** (essai du 19/11, tâche 784e244a) :
  cause établie (lecture seule) — Vinted pré-coche une couleur d'après les photos APRÈS notre pose ; `selectColors`
  (chrome-extension/content-scripts/vinted.js ~l.10241-10257) ne décoche qu'une fois ; la sonde `corpsAvecCouleur`
  (background.js ~l.11358) ne pose jamais « par-dessus » une couleur déjà dans le corps. Feu vert de Nico : « l'ancienne
  couleur doit être retirée quand la fiche en change ». Correctif à coder : (a) la sonde remet les identifiants armés de la
  copie quand le corps en porte d'autres (choix de la personne toujours protégé : rien d'armé s'il vient de l'app),
  (b) relecture/décochage juste avant le clic, (c) trace sur succès ; verrou = cas F de
  `scripts/vinted-envoi-sans-perte-selftest.mjs` (copie [3], page [1,3] → doit partir [3]). Nouvelle extension (0.6.195 :
  numéro à LIRE avant), copie Cloud, essai réel sur une fiche de test à ≥ 999 €, puis retrait.

## 4. Fait ce soir (preuves dans le fil, résumé)
- Essai réel de la republication (fiches de test 1793438600001 et 1793009407689000) : correction posée sur l'annonce
  Vinted recréée (A : L / Noir / Coton vus en ligne ; B : titre, prix 1000, Bon état ; taille et matière refusées faute de
  grille du rayon — règle « jamais inventer ») ; transporteurs Leboncoin de la fiche (Mondial Relay seul vu en ligne) ;
  copies LBC / Beebs / Depop corrigées. Annonces recréées toutes retirées (5 tâches « deleted », pages vérifiées).
- MON ERREUR : à 16:46 le script a ouvert la feuille de la fiche voisine 1793387931852 et l'a republiée sur Vinted avec les
  corrections de A. Réparé : annonce 10882931146 retirée (tâche b34a07f6 « deleted ») ; fiche remise en Blanc / S par
  script. La matière reste « Coton » : la fusion des attributs (`inventaire_attributs_fusion`) n'efface jamais une clé —
  c'est aussi la matière de son annonce Beebs. Scripts d'essai durcis : titre vérifié avant chaque clic.
- Pour Opus-1 (lot suivant, côté app, déjà transmis) : `non_posees` sur la ligne de la file, `job_id` dans
  `corrections_republication`, état Depop jamais envoyé (etatPourPlateforme → null), Vinted marque/taille/matière/couleur
  en listes fermées.
- Marjorie (0909a787) : après l'écran caché de 17:00, elle a rouvert depuis le bloc de synchro (17:02, visible) et relié
  Vinted à 17:05 ; aucune autre plateforme reliée (rien touché sur son compte).
- get-pending-jobs est au plafond de 5 Mo (déployer depuis une archive LF ; à découper avant d'y ajouter du code).
