# Machine Windows à vraie carte graphique pour le Cloud — étude du 30/10/2026 (aucun achat)

Demande de Nico (30/10, après le lot D) : Leboncoin et Beebs doivent marcher dans le Cloud. Trouver LA machine qu'on
gardera (PC Windows à vraie carte graphique dans le cloud), prix 24 h/24, conditions d'utilisation, utilisateurs par
machine, coût par utilisateur face aux 20 € / mois ; un seul essai propre sur la machine retenue ; Nico paie et se
connecte une seule fois, sur cette machine-là.

## 0. Arrêt du Cloud actuel (ordre de Nico, 30/10)
- Constat : le navigateur Cloud de Nico (serveur Hetzner, Chrome Linux) restait allumé et l'extension y sonde chaque
  heure `leboncoin.fr/deposer-une-annonce` et `beebs.app/fr/listing` (`chrome-extension/background.js`, sonde de
  session, `SESSION_PROBE_INTERVALS_MS`) — par les IP du pool, celles qu'on réutilisera.
- **Arrêt : 30/10 13:53:11 (Paris, lu en base)** — `docker compose stop orchestrateur` ; l'orchestrateur a fermé
  lui-même le navigateur (`navigateur_ferme`, raison `arret_orchestrateur`). Dernier signe du poste Cloud a958154e :
  13:52:10 ; rien depuis (relu 14:04).
- Pas de relance seule : navigateur `RestartPolicy=no` ; orchestrateur `unless-stopped` arrêté à la main (reste
  arrêté, même au redémarrage du serveur) ; aucun cron, aucun minuteur systemd ne touche Docker. **Seul
  `deployer.sh` (docker compose up) le relancerait — ne pas déployer le serveur Cloud avant la nouvelle machine.**
- Profil `p-f44b5917-…` gardé (coffre vide, aucune plateforme connectée). Caddy reste allumé (`cloud.fillsell.app`
  répond 502 pour l'API).
- PC de Nico : aucun relais ni proxy vers nos IP resté actif après les essais du matin.

## 1. Ce que les mesures du 30/10 prouvent vraiment
Le vrai Chrome Windows qui passe (PC de Nico) était piloté **à la main**. Les essais du serveur étaient pilotés par
**CDP** (`outils/essai-chrome.mjs`), et « Me connecter » ajoute une **émulation téléphone** (`connexion.js` :
`Emulation.setDeviceMetricsOverride`, `setTouchEmulationEnabled`) sur un Chrome de bureau. Trois écarts, pas un :
système (Linux / Windows), carte graphique (SwiftShader / réelle), pilotage (CDP + émulation / main). Une machine
Windows à GPU règle les deux premiers ; **l'essai doit donc se faire dans les conditions de la production** (Chrome
lancé et piloté comme en production), sinon un « ça passe » ne prouverait rien pour le Cloud.

## 2. Les options (prix lus le 30/10/2026, HT sauf mention ; 24 h/24 = 730 h)
Hypothèses de capacité (à mesurer sur la machine retenue, comme `NAVIGATEURS_MAX`) : Chrome mesuré 650–660 Mo au
repos, 966–971 Mo en pic (lot D) → **1,2 Go par utilisateur** sous Windows, + 5 Go pour Windows et l'agent ;
**2 utilisateurs par cœur logique** ; ≈ 0,3 Go de mémoire graphique par Chrome. IP : **4,64 € / utilisateur / mois**
(IP fixe IPRoyal, `docs/cloud/pool-ip.md`). Recette : 20 € TTC = 16,67 € HT, ≈ 16 € net après Stripe.

| Option | Machine | € / mois 24 h/24 | Windows | Usage commercial et automatisé (CGU) | Utilisateurs / machine | Coût / utilisateur (machine + IP) |
|---|---|---|---|---|---|---|
| **Shadow Power Pro + Always On** | 8 vCores EPYC, 28 Go, RTX A4500 20 Go ; Dunkerque / Strasbourg | 54,99 + Always On (prix non publié, « indiqué dans le Manager ») ; sans engagement | Windows 11 inclus | **Interdit sans autorisation préalable de Shadow** (ci-dessous) | ≈ 16 | ≈ 8 € + Always On ÷ 16 (ex. AO à 40 € → ≈ 10,6 €) |
| Shadow Expert Pro + AO | 12 vCores, 41 Go, Quadro RTX 6000 24 Go | 74,99 + AO | idem | idem | ≈ 24 | ≈ 7,8 € + AO ÷ 24 |
| Shadow Neo Pro + AO | 8 vCores, 16 Go, RTX 2000 Ada 16 Go | 39,99 + AO | idem | idem | ≈ 9 | ≈ 9,1 € + AO ÷ 9 |
| Shadow grand public (Neo Lite → Power) | 16–28 Go | 25,99 → 49,99 | Windows 11 | **Exclu** : usage privé seulement, plafond 120–210 h / mois, extinction à la déconnexion | — | — |
| **Hetzner GEX45 + Windows Server 2025** | i5-13500 14 c / 20 t, 64 Go, RTX PRO 4000 Blackwell 24 Go ; Helsinki | 214 + 49 (licence 14 cœurs) = **263** ; mise en service 209 ; sans durée minimale | **non annoncé sur GEX** (page : Ubuntu, CentOS) — à confirmer | Autorisé : §7.1 | ≈ 40 | **≈ 11,2 €** à 40 ; 17,8 € à 20 ; perte sous ≈ 24 |
| OVH RISE-GPU-1 | Ryzen 7 5800X, 64 Go, Radeon RX 6700 XT 12 Go ; Gravelines / Roubaix | 129,99 (+ 129,99) | **aucune licence Windows au catalogue** (relu : RISE-3/4 en ont, RISE-GPU-1 et RISE-S non) | Autorisé : CGS §10.6 | ≈ 40 | (≈ 8 €) — exclu tant que Windows n'est pas vendu |
| OVH RISE-S | Ryzen 7 9700X, Radeon intégrée, 64 Go | 64,99 (+ 64,99) | idem, aucune | idem | ≈ 30 | exclu (idem) |
| Azure NV6ads_A10_v5 | 6 vCPU, 55 Go, 1/6 A10 4 Go ; France Central | 542 (411 réservé 1 an) ; à l'heure | inclus | Autorisé (« Customer Solution ») | ≈ 12 | **≈ 50 €** (39 € réservé) |
| Azure NV4ads_V710_v5 | 4 vCPU, 16 Go, 1/6 V710 ; West Europe | 396 | inclus | idem | ≈ 9 | ≈ 49 € |
| AWS g4dn.xlarge | 4 vCPU, 16 Go, T4 ; Paris | 583 $ ≈ 524 € | inclus | Autorisé (§2.5), pas de revente brute (§6.4 c) | ≈ 9 | ≈ 63 € |
| AWS g6f.xlarge | 4 vCPU, 16 Go, 1/8 L4 ; Francfort | 351 $ ≈ 315 € | inclus | idem | ≈ 9 | ≈ 40 € |
| Google n1-standard-4 + T4 | 4 vCPU, 15 Go ; Belgique (pas de GPU à Paris) | 542 $ ≈ 487 € | inclus | Autorisé (« Customer Application ») | ≈ 9 | ≈ 59 € |
| OVH Public Cloud rtx5000-28 | 4 vCores, 28 Go, Quadro RTX 5000 ; GRA | 364 | contradictoire (prix Windows affiché, guide : T1/T2 seulement) | CGS §10.6 ; Public Cloud §5.2 | ≈ 9 | ≈ 45 € |
| Vultr A16 entière | 6 vCPU, 60 Go, A16 16 Go ; Francfort | 344 $ + Windows (montant illisible) | en sus | CGU illisibles (403) | ≈ 12 | ≈ 30 € |
| Hostkey vgpu A4000 | 8 vCPU, 32 Go, A4000 16 Go | 125 + Windows (prix absent) | en sus | « 70 % d'un cœur pas plus de 30 min » (VPS) | ≈ 16 | ≈ 12 € + Windows |
| LeaderGPU RTX 3090 | Xeon 2609v4, 64 Go ; Amsterdam | 249 + Windows (prix absent) | en sus | « Hosting of streaming services is prohibited » | ≈ 16 (processeur faible) | ≈ 20 € |

Exclus d'office : Scaleway (Windows seulement sur des instances sans GPU), Paperspace (Windows retiré le 01/07/2024),
GPU-Mart (États-Unis seulement), TensorDock (place de marché sans prix fixe).
Taux : 1 € = 1,1130 $ (BCE, 29/10/2026).

### Clauses citées
**Shadow** — CGU grand public `statics.shadow.tech/terms-of-use/tc-FR-b2c.pdf` (13/05/2026), CGV pro
`…/tc-FR-b2b.pdf` (18/03/2025) ; articles non numérotés, cités par section.
- Code de conduite (grand public) : « …pour son usage personnel et à des fins privées, à l'exclusion notamment de
  toute activité commerciale. »
- Les deux : interdiction « de re-commercialiser les Services d'une quelconque manière, ou plus généralement, sauf
  autorisation préalable de SHADOW, d'utiliser l'ordinateur distant… dans le cadre de prestations commerciales, ou
  encore d'une manière telle qu'elle ait a pour objet ou pour effet la mise à la disposition de tout ou partie des
  Services à des tiers, à titre gratuit ou onéreux ».
- Pro : « …à l'exclusion notamment de toute activité de commercialisation ou revente du Service à des tiers. » ;
  serveur interdit « sauf autorisation expresse propre au Service concernée » ; usage raisonnable « analogue à celui
  d'une machine de travail local… Des usages intensifs réguliers ou sur des plages horaires plus étendues pourront
  faire l'objet de Services expressément dédiés ».
- Always On (aide, article 35433305315985) : « Once activated, your Shadow Pro PC remains powered on 24/7, even if
  you are not connected. » ; usages cités : « Running automations or scripts » ; prix « indicated in the Manager at
  the time of activation » ; arrêt par ticket, facturé au mois civil.
- Contourner l'extinction est interdit (aide 33664995467153, « Bypassing Automatic Shutdown »).
- Aucune clause sur les robots visant des sites tiers ni sur les proxys ; le VPN est permis (tunnel partagé).
- Société : SHADOW SAS (RCS Paris 891 586 299), présidée par Octave Klaba ; machines « hébergés chez notre partenaire
  OVHCloud ». Ce n'est pas une filiale d'OVHcloud.

**Hetzner** — `hetzner.com/legal/terms-and-conditions/` §7.1 : « The Customer is entitled to grant third parties a
contractual term of use to any services the Customer orders from Hetzner. In this case, the Customer nevertheless
remains the sole contractual partner. » Politique des serveurs dédiés : interdit « The scanning of foreign networks
or foreign IP addresses ».

**OVHcloud** — CGS (17/01/2025) §10.6 : « Si le Client utilise les Services pour le compte de tiers, ou autorise des
tiers à utiliser les Services, il s'engage avant leur utilisation, à leur communiquer et faire valider les
conditions contractuelles d'OVHcloud… » ; §3.5 interdit nommément « minage de crypto-monnaie, … bots de jeux vidéo,
échanges de trafic … et Black Hat SEO ». Conditions particulières Public Cloud (26/08/2026) §5.2 : « Les services
d'anonymisation (Proxy) … sont interdits » (vendre un service de proxy, pas en utiliser un).

**Azure / AWS / Google** — usage pour nos propres clients permis : Azure, clause « Customer Solution »
(microsoft.com/licensing/terms/productoffering/MicrosoftAzure/MCA) ; AWS Customer Agreement §2.5 (utilisateurs
finaux permis), §6.4(c) (pas de revente des Services), Service Terms §5.1.2 ; Google Cloud Terms §3.3(c). Les trois
politiques d'usage interdisent l'atteinte aux droits d'autrui et à la sécurité d'un système ; aucune ne vise les
proxys sortants.

**Licence Windows (toutes les options Windows Server)** — Microsoft, Product Terms Windows Server : une licence RDS est
« Also required for use of Windows Server to host a graphical user interface », par le Bureau à distance ou une
« other technology ». Si Microsoft considère que nos clients utilisent l'interface graphique (« Me connecter »),
il faut une licence RDS par utilisateur et par mois, vendue par l'hébergeur (SPLA). Prix à demander. Chez Shadow,
la licence Windows 11 relève de Shadow ; c'est une raison de plus pour que son accord écrit couvre notre usage.

## 3. Recommandation
**Shadow Power Pro + Always On**, à condition d'avoir **l'accord écrit de Shadow** pour notre usage. Si Shadow refuse :
**Hetzner GEX45 + Windows Server 2025**, à condition que Hetzner confirme Windows sur ce serveur.
- Pourquoi Shadow :
  - C'est l'environnement le plus proche d'un vrai PC : Windows 11, carte RTX A4500 de station de travail, des milliers
    de joueurs humains naviguent chaque jour depuis ces machines. À l'inverse, les cartes de centre de données des
    grands clouds (« A10-4Q », « Tesla T4 ») se voient peu chez des humains. C'est une hypothèse, non mesurée.
  - Les machines sont en France.
  - C'est l'option la moins chère par utilisateur (≈ 8 € + Always On ÷ 16), par paliers de 16 utilisateurs.
  - Un échec coûte peu : un mois, environ 55 € + Always On.
  - Le gestionnaire Pro gère jusqu'à 50 machines.
  - « Running automations or scripts » est un usage annoncé d'Always On.
- Pourquoi pas les grands clouds : 40 à 63 € par utilisateur, deux à trois fois les 20 €.
- Pourquoi pas OVH RISE : Windows n'y est pas vendu.
- Hetzner est le repli :
  - ses conditions sont nettes et nous y sommes déjà clients ;
  - mais 263 € par mois fixes plus 209 € de mise en service : à perte sous ≈ 24 utilisateurs ;
  - carte plus rare chez des humains, Helsinki, Windows non annoncé sur GEX.

## 4. Plan de l'essai (un seul, sur la machine gardée)
Avant l'essai, aucune visite de plateforme :
1. Nico ouvre la machine une fois et colle le script d'installation fourni : OpenSSH, tunnel sortant vers notre
   serveur, Chrome, Node, relais. Il ne se connecte à aucune plateforme. Ensuite, tout se fait par le tunnel.
2. Construire le « poste Windows » :
   - un Chrome par utilisateur (`--user-data-dir`), son relais de proxy en local (les identifiants ne vont jamais à
     Chrome) et l'extension Cloud installée par stratégie (registre) ;
   - le CDP joignable seulement par le tunnel ;
   - dans l'orchestrateur, un moteur « poste distant » : il ne doit plus jamais rouvrir le Chrome Linux.
   Selftests et commit avant l'essai.
3. Contrôles locaux, sans aucun site : `chrome://gpu` en accélération matérielle ; WebGL donne la vraie carte (pas
   SwiftShader), y compris quand personne ne regarde la machine (Always On, flux fermé).
4. Décision à prendre avant l'essai : afficher « Me connecter » de Leboncoin et Beebs au format bureau, sans émulation
   téléphone ni tactile, pour présenter des signaux cohérents.

L'essai lui-même : le même jour, en conditions de production, personne connecté au flux de la machine.
1. Profil neuf, sortie par l'IP fixe 2 (185.134.194.88, jusqu'au 29/11). L'IP fixe 1 finit le 04/11 13:57.
2. « Me connecter » Leboncoin, une seule ouverture : `/compte/part/mes-annonces`, qui renvoie vers
   auth.leboncoin.fr/login.
3. « Me connecter » Beebs, une seule ouverture : `/fr/auth`.
4. Verdict par plateforme :
   - formulaire de connexion affiché = **PASSE** ;
   - glissière = **PASSE AVEC VÉRIFICATION** (Nico la fera) ;
   - « Accès temporairement restreint » = **BLOQUÉ**.
5. Preuves : capture d'écran, heure lue en base, renderer WebGL, identifiant DataDome en cas de blocage.

Si c'est bloqué :
- aucun nouvel essai depuis cette machine ;
- un seul témoin, depuis le PC de Nico à la main, même IP : il dit si c'est l'IP ou la machine ;
- puis résiliation (sans engagement).

Si ça passe :
1. Nico se connecte une seule fois, par « Me connecter » dans l'app, à Vinted, Depop, Leboncoin et Beebs.
2. Tests à 999 € sur chaque plateforme : publication, republication, retrait, relevé, vente.
3. Mesure de la capacité réelle (`NAVIGATEURS_MAX`).

## 5. Souscription (Nico paie ; Claude ne saisit aucune carte)
1. Aujourd'hui, gratuit : envoyer à Shadow Pro la question ci-dessous (https://shadow.tech/fr/pro/contact-always-on/).
   En parallèle, pour le repli, envoyer la question Hetzner (formulaire de contact ou ticket Robot).
2. Sur un « oui » écrit de Shadow, qui donne aussi le prix Always On :
   - créer un compte Shadow Pro avec le numéro de TVA de FillSell (https://shadow.tech/fr/pro/offers/) ;
   - prendre **Power Pro**, 54,99 € / mois, sans engagement, centre de données France ;
   - activer **Always On** dans le Shadow Manager.
3. Installer l'application Shadow sur le PC de Nico, ouvrir la machine une fois, coller le script, fermer.
   **Aucune connexion à une plateforme.**
4. Claude construit le poste Windows, fait les contrôles puis l'essai, et rend le verdict.
5. Si Shadow refuse et que Hetzner dit oui : Robot Hetzner, **GEX45** (214 € / mois + 209 €) et l'option
   **Windows Server 2025 Standard** (49 € / mois).

### Question à Shadow Pro (à envoyer par Nico)
> Bonjour, FillSell (SAS, n° TVA …) édite une application de revente en ligne. Nous voulons louer des Shadow Pro
> (Power Pro) avec Always On pour y faire tourner, 24 h/24, des navigateurs Google Chrome au nom de nos clients :
> chacun gère ses propres annonces (Vinted, Leboncoin…) par notre extension, avec un proxy sortant par client ;
> nos clients n'accèdent jamais à la machine (ni flux Shadow, ni Bureau à distance). Vos CGV demandent votre
> autorisation préalable pour un usage « dans le cadre de prestations commerciales » et pour un logiciel serveur :
> pouvez-vous nous la donner par écrit, et nous indiquer le prix d'Always On et le nombre de machines possible ?

### Question à Hetzner (repli)
> Hello, can the Windows Server 2025 Standard add-on be ordered and installed on a GEX45 (RTX PRO 4000 Blackwell)?
> Is the NVIDIA driver supported on it? We would run several Google Chrome instances for our own customers
> (they never log into the server); do you also rent RDS SALs, and at what price?

## 6. À savoir
- Le test Stripe ne dépend pas de la machine. Mais avec l'orchestrateur arrêté, deux de ses contrôles attendront :
  « navigateur rouvert » et la purge à l'entretien. Les contrôles côté Stripe et côté base se font normalement.
- La demande de partenariat Beebs (`docs/cloud/beebs-demande-partenariat.md`) reste une voie parallèle, non envoyée.
- Prix relevés : Shadow (shadow.tech/fr/pro/offers/, aide Zendesk), Azure (API prices.azure.com, EUR), AWS (fichiers
  de prix publiés le 29/10 17:56 UTC), Google (pages de prix, europe-west1), OVH (API catalogue `eco`, FR), Hetzner
  (page GEX45), Vultr (`/v2/plans`).
