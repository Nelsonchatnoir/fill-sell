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

## 7. Essai du 30/10 — machine neuve + IP neuve (ordre de Nico) : BLOQUÉ, hypothèse tranchée
Question posée : les essais répétés du 30/10 ont-ils grillé l'ancien serveur, ou un serveur Linux sans carte
graphique est-il bloqué par nature ?
- **Serveur neuf** `fillsell-cloud-2` :
  - créé à 14:48:00 ; IP 2.29.112.220 ; cx23 (2 cœurs, 4 Go) à Helsinki ;
  - le cx43 demandé était **indisponible** partout (fsn1, nbg1, hel1, ainsi que cx33 et cx53, « error during
    placement ») ; le cx23 est de la même gamme ;
  - **supprimé à 14:58**.
- **IP neuve** : IPRoyal commande **86978813**, **188.126.31.118** (ISP dédiée France). 4 $ ; fin le 29/11 ; sans
  renouvellement ; jamais utilisée par nous. Solde 15,35 → 11,35 $. Elle n'est **pas** entrée au pool, et ne doit
  pas y entrer : DataDome la cite désormais.
- **Configuration** : copie de celle de l'ancien serveur (même coffre, même clé de signature de l'extension) ;
  déployée en **decebaa** avec un compte autorisé factice. L'orchestrateur a tourné 10 s sans servir personne, puis
  il a été arrêté. Aucun navigateur ni profil n'existait avant l'essai.
- **Essai** (14:55:30 → 14:56:26) : `serveur-cloud/outils/essai-me-connecter.mjs`. Il reprend le code de production :
  - Google Chrome 156.0.8078.79 officiel, extension 0.6.159-cloud installée par stratégie, relais de proxy ;
  - parcours `connexion.js` (format téléphone, images, accusés comme l'app) ; profil neuf ;
  - une seule ouverture par plateforme.
  Écart voulu : la session FillSell n'était pas posée, pour que l'extension ne sonde aucune plateforme avant l'essai.
- **Langue et fuseau** (vérifiés après coup, hors réseau, sur la même image) : `Europe/Paris`, `fr-FR` (`fr-FR,fr`),
  GMT+0100. Le serveur à Helsinki ne transparaissait pas.

| Plateforme | Verdict | Ce qui s'est passé |
|---|---|---|
| Leboncoin | **BLOQUÉ** | « Mes annonces » s'est affichée, puis la redirection vers auth.leboncoin.fr/login a reçu « Accès temporairement restreint ». Motif : « Quelque chose dans le comportement du navigateur nous a intrigué », IP 188.126.31.118. ID c3cab590-0498-2687-d793-11d590fb0528. |
| Beebs | **BLOQUÉ** | « Accès temporairement restreint » d'emblée sur /fr/auth, mêmes motifs. ID 9c5aa7bd-d47f-0dc0-9deb-8042be941ecc. |

**Conclusion.** Machine neuve, IP neuve, profil neuf, aucune visite avant : bloqué tout de suite. Ce n'est donc pas
l'usure de l'ancien serveur. C'est la **nature de la machine** (serveur Linux sans carte graphique, piloté comme en
production) que DataDome refuse. Suite décidée par Nico : Shadow.

**Coût de l'essai** :
- serveur : 1 heure entamée × 0,0088 € HT, plus l'IPv4, soit ≈ 0,01 € ;
- IP : 4 $ ;
- total ≈ 4 $ + 0,01 €.

### Deux « brûleurs » trouvés dans notre propre code (à neutraliser avant tout essai sur une autre machine)
1. **La sonde de session de l'extension** : toutes les heures, `fetch` vers leboncoin.fr/deposer-une-annonce et
   beebs.app/fr/listing, même pour une plateforme jamais connectée. Sur un profil neuf, chaque visite est un 403
   DataDome.
2. **Le contrôle d'entrée d'une IP** (`src/controle.js`) : à chaque entretien horaire, un navigateur Linux neuf,
   sans profil, ouvre les pages d'accueil de Vinted, Leboncoin et eBay par toute IP qui entre au pool.

Règle à inscrire dans le code avant l'essai Shadow :
- aucune visite automatique d'une plateforme non connectée ;
- aucun contrôle d'IP qui passe par une plateforme.

## 8. Essai sur le PC Windows de Nico, piloté comme en production (30/10) : ÇA PASSE
Ordre de Nico : un essai unique sur une vraie machine, Chrome piloté comme en production. Avant l'essai, les deux
mécanismes qui visitaient seuls les plateformes ont été neutralisés et poussés (`7e49884`) :
- la sonde de la copie Cloud ne part plus sans cookie de connexion ;
- le contrôle des IP n'ouvre plus aucune page de plateforme.

Suite complète : 498 selftests, 0 rouge.

**Conditions** (`serveur-cloud/outils/essai-me-connecter-pc.mjs`) :
- **Navigateur** : Google Chrome 156.0.8078.48 officiel (Windows 11), profil neuf.
- **Carte graphique réelle** : « ANGLE (AMD, AMD Radeon(TM) Graphics … Direct3D11) », WebGL actif.
- **Extension** : copie Cloud `…+0feb4a9-cloud`, installée au démarrage par `Extensions.loadUnpacked`. Chrome 156
  ignore `--load-extension`, et la stratégie d'entreprise toucherait le Chrome de tous les jours.
- **Sortie** : relais du conteneur, puis IP fixe 2 (185.134.194.88).
- **Pilotage** : « Me connecter » de `connexion.js` par CDP (format téléphone 390×844, tactile émulé, images et
  accusés comme l'app). Mêmes écarts que l'essai serveur : session FillSell non posée, base simulée.

| Plateforme | Verdict | Détail (heure de Paris) |
|---|---|---|
| Leboncoin | **GLISSIÈRE**, passable par l'utilisateur | 15:37:12. « Mes annonces » s'affiche, puis sur auth.leboncoin.fr : « On s'assure qu'on s'adresse bien à vous… Faites glisser vers la droite ». Motif « comportement du navigateur », IP 185.134.194.88. ID 4cfef139-485c-1f90-bcf8-8397cd7f72d2. |
| Beebs | **FORMULAIRE** : passe | 15:44:55. « Inscription / Connexion » (Kiabi, Google, Facebook, e-mail). |

**Comparaison.** Sur le serveur, au même pilotage, c'était « Accès temporairement restreint » des deux côtés, avec
cette même IP 2 le matin et une IP neuve à 14:55. Le vrai matériel change le verdict : le pilotage n'est pas ce qui
bloque. La glissière de Leboncoin reste à la main de l'utilisateur, dans « Me connecter », sans aucun résolveur.

**Défauts de production trouvés par l'essai et corrigés.** Rien n'est déployé : le Cloud est arrêté.
1. **« Me connecter » adoptait les onglets déjà ouverts et les fermait à la fin** (`connexion.js`).
   - Cause : `setDiscoverTargets` annonce les onglets existants sans `openerId`, alors que la cible n'existe pas
     encore, et `[undefined].includes(undefined)` répond vrai.
   - Effets : sous Windows, Chrome s'est fermé avec son dernier onglet. Le premier passage de Beebs (15:37:37) est
     mort avant toute page, donc aucune visite. En production, un onglet de travail de l'extension aurait été fermé
     en pleine publication.
   - Corrigé : `ouverteParLaConnexion`, avec un test.
2. **Beebs était dite « connectée » pour tout visiteur.**
   - Cause : Beebs pose un jeton Firebase anonyme (`provider_id` et `firebase.sign_in_provider` « anonymous », relus
     hors réseau dans le profil de l'essai).
   - Effet : « Me connecter » se fermait sur « connecté » 2 s après l'ouverture, et la nouvelle règle de la sonde
     l'aurait prise pour une connexion.
   - Corrigé dans `estConnectee` (orchestrateur) et dans la copie Cloud, avec des tests.

**Reste à couvrir avant la mise en production.** D'autres tâches automatiques de la copie Cloud visitent encore les
plateformes même sans connexion : relevés quotidiens Leboncoin et Beebs, relevés de ventes, détection de vente,
messagerie. La règle qui les couvre toutes : un verrou dans le relais du navigateur. Une plateforme n'y est joignable
que si elle est connectée, ou pendant son « Me connecter ».

## 9. Machines louables à vrai matériel : comparatif (30/10, prix HT lus ce jour)
Coût par utilisateur = machine ÷ utilisateurs + IP fixe (4,64 €). Recette d'un utilisateur : 20 € TTC, soit
≈ 16 € net. Capacité = min(2 × fils d'exécution ; (RAM − 5 Go) ÷ 1,2 Go), estimée, à mesurer.

| Machine | € / mois | Utilisateurs | € / utilisateur | Carte graphique et pilote | Conditions et licence |
|---|---|---|---|---|---|
| **Shadow Power Pro + Always On** (8 vCores, 28 Go, RTX A4500 ; France) | 54,99 + Always On (prix non publié) | ≈ 16 | **≈ 8,1 € + Always On ÷ 16** | NVIDIA avec pilotes, Windows 11 | **accord écrit de Shadow requis** (CGV : « prestations commerciales », mise à disposition de tiers) |
| **Mini-PC acheté + hébergé** (Beelink SER8, Ryzen 7 8745HS, Radeon 780M, 32 Go, Windows 11 Pro) | 1 050 € TTC une fois (24,31 € / mois sur 36 mois) + hébergement Paris 34,40 € (YorkHost, + 30 € de mise en service) | ≈ 16 | **≈ 8,3 €** | même famille que le PC de Nico qui passe (AMD Radeon intégrée, Windows 11) | **licence Windows 11 OEM §2.c(v)** : interdit « commercial hosting services » et un appareil « for use only by remote users » |
| **Hetzner EX44 + Windows Server 2025** (i5-13500, UHD 770, 64 Go ; Allemagne / Finlande) | 59 + 49 = 108 ; sans mise en service ni durée minimale | ≈ 40 | **≈ 7,3 €** (11,4 € à 16 utilisateurs) | iGPU vue active sur l'EX44 (rapport 2023) ; **pilote Intel non prévu pour Windows Server** (Windows 10/11 seulement) : risque de rendu logiciel, la configuration bloquée | CGV §7.1 : tiers permis ; licence RDS par utilisateur possible (Microsoft, « host a graphical user interface ») |
| OVH KS-GAME + Windows Server (i7-7700K, HD 630, 32 Go ; Gravelines / Strasbourg) | 28,99 + 28 = 57 (+ 28,99 de mise en service) | ≈ 16 | ≈ 8,2 € | iGPU **désactivée** sur les cartes OVH d'après plusieurs rapports ; pilote non prévu sur Windows Server | CGS §10.6 : tiers permis |
| Mac mini loué (OakHost M4 32 Go 135 € ; Mac Mini Vault M4 32 Go ≈ 157 €) | 135 à 157 | ≈ 20 | ≈ 11,4 à 12,5 € | Apple, réelle | **exclu** : licence macOS §3A (location seulement pour des « Permitted Developer Services ») et §2I (« service bureau, time-sharing ») ; MacStadium interdit aussi « service bureau » et proxys |
| Rappel : grands clouds à GPU (Azure, AWS, Google) | 315 à 542 | 9 à 12 | 40 à 63 € | GPU de centre de données | permis, mais trop cher |

**Lecture.**
- Toutes les options à vrai matériel tiennent sous 20 € par utilisateur, entre 7 et 12 €, IP comprise.
- La différence se joue sur deux points : la carte graphique doit vraiment servir (pilote présent), et la licence
  doit permettre l'usage.
- **Shadow** coche les deux : Windows 11, pilotes NVIDIA, licence portée par Shadow s'il donne son accord écrit.
- **Hetzner EX44** est le moins cher à grande échelle, avec des conditions nettes. Mais le pilote Intel n'existe pas
  pour Windows Server, et sans pilote on retombe sur le rendu logiciel bloqué.
- **Mini-PC** : techniquement le plus proche de ce qui passe, mais la licence Windows 11 interdit l'hébergement
  commercial.

**Règle pour toute machine retenue.** Avant toute plateforme, contrôle hors réseau (proxy mort) de la carte
graphique vue par Chrome, comme le 30/10 (`essai-me-connecter-pc.mjs --verifier`) : le rendu ANGLE doit nommer la
vraie carte. Sinon, résiliation sans aucune visite.

**À observer ensuite.** Sur le vrai PC, Leboncoin a tout de même présenté une glissière. Après la connexion de Nico,
quelques jours à cadence normale de production diront si les publications en arrière-plan restent sans vérification.

## 10. Serveur dédié Linux à vraie puce Intel (30/10 soir) : BLOQUÉ, résilié
- **Commande** (16:48:40) : Hetzner place de marché n° 3100515 (i7-8700, UHD 630, 64 Go). L'EX44 n'était plus
  commandable. **Erreur de ma part** : le détail du produit, lu avant la commande, n'offrait que « Rescue system ». Robot
  a ensuite refusé Windows (« For this server type Windows cannot be used »). Règle de Nico depuis : avant toute
  commande, vérifier que tout est disponible sur ce modèle précis.
- **Puce** (16:51, système de secours) : UHD 630 présente et active (lspci 00:02.0, i915, /dev/dri/renderD128).
- **Poste** (`deploiement/gpu/preparer-poste-gpu.sh`, commit 88f0713) :
  - Ubuntu 24.04 avec bureau XFCE ouvert automatiquement, en français, à l'heure de Paris ;
  - sortie HDMI forcée par le noyau, écran 1920×1080 sans écran branché ;
  - conteneur Chrome de production qui dessine sur ce bureau par la puce (`NAVIGATEUR_GPU=1`).
- **Vérification hors réseau** (17:44, profil jetable, proxy mort) : WebGL « ANGLE (Intel, Mesa Intel(R) UHD Graphics 630
  (CFL GT2), OpenGL 4.6) », composition par la puce, écran 1920×1080, Europe/Paris, fr-FR, lecteur PDF (5 plugins),
  extension Cloud 0.6.160 installée par stratégie, `webdriver` faux.
- **Essai unique** (17:45:49 → 17:46:40, profil neuf, IP fixe 2, « Me connecter » de production) :
  - Leboncoin : **BLOQUÉ**, « Accès temporairement restreint » après un contrôle « interstitial ». ID
    ebf12780-b17b-ba28-1b82-2280a120d092.
  - Beebs : **BLOQUÉ**, ID 0e7e1178-e551-e993-55c2-4be09b648f1c.
- **Résiliation** : immédiate, à 17:48. Avant, j'ai effacé du disque la configuration, la clé de signature de
  l'extension et les profils. Coût : environ 1 h, soit ≈ 0,15 € HT.

**Lecture.**
- Une vraie puce ne suffit pas sous Linux en centre de données.
- Ce qui passe reste Windows sur du vrai matériel (le PC de Nico, 15:37 et 15:44).
- Doute résiduel : la même IP 2 venait de servir pour l'essai du PC, où Leboncoin montrait déjà une glissière. Un essai
  Windows propre demandera une IP neuve.

**AX42 vérifiée sans commande** (Robot et pages Hetzner, 30/10) :
- Machine : AMD Ryzen 7 PRO 8700GE, avec puce Radeon 780M de la même famille que le PC de Nico ; 64 Go.
- Prix Robot : 97,30 € HT/mois (0,1559 €/h), plus 49 € de mise en service.
- Windows est listé sur la page AX42, avec les options « Windows Server 2025 Standard / Datacenter ».
- Standard, 8 cœurs : 27,90 € HT/mois, facturé au mois civil complet. Il se commande seulement dans l'interface Robot,
  pas par l'API.
- Premier mois : ≈ 176 € HT, au-dessus du plafond de 150 €.
- Risques : le pilote AMD ne vise pas officiellement Windows Server, et il n'y a pas d'écran branché.

## 11. Décision de Nico (30/10, 19:05) : essai sur Shadow Neo Pro
- Shadow Neo Pro (8 vCores, 16 Go, NVIDIA RTX 2000 Ada, Windows 11, France), souscrit par Nico le 30/10.
- Avant l'essai : contrôle hors réseau de la carte (WebGL doit nommer la RTX 2000 Ada, flux fermé compris), puis une
  IP neuve, l'IP fixe 2 étant usée par les essais du 30/10. Puis un essai unique, comme au § 4.
- À verser au dossier : l'accord écrit de Shadow pour l'usage commercial et le prix d'Always On.
- Règle de Nico : avant toute commande, vérifier que tout ce dont on a besoin est disponible sur ce modèle précis.

## 12. Essai sur Shadow Neo Pro (30/10 soir) : PASSE AVEC VÉRIFICATION, mais Always On coûte 208,99 € par mois
**Accès** (19:30 → 20:39, heure de Paris).
- L'accès web de Shadow (pc.shadow.tech, « early access ») n'a jamais établi le flux : erreur L-104, « Client
  Initialization timeout ». Même résultat après « Éteindre Shadow » et un redémarrage. Nico a donc collé le script
  d'accès lui-même, depuis l'application Shadow PC.
- Fonctionnement de l'accès :
  - le serveur SSH de Windows écoute en local seulement et n'accepte que la clé publique `fillsell-cloud` ;
  - un tunnel SORTANT (tâche SYSTEM `FillSell-Tunnel`) relie la machine à l'ancien serveur, compte `shadowtun` sans
    shell, mot de passe verrouillé, `restrict,port-forwarding,permitlisten="127.0.0.1:2222"` ;
  - seul le sshd de l'ancien serveur a servi : l'orchestrateur est resté arrêté ;
  - retrait : `C:\ProgramData\FillSellAcces\retirer.ps1`, puis `userdel -r shadowtun` sur le relais.
- Piège rencontré : ssh.exe lancé en SYSTEM refuse une clé privée dont le propriétaire est l'utilisateur (« Postponed
  publickey » puis coupure). Correctif : `icacls /reset`, puis propriétaire Administrateurs.
- Machine relue :
  - Windows 11 **Famille** 26300, alors que Shadow annonce Enterprise pour les offres Pro ;
  - EPYC 9354, 4 cœurs / 8 fils, 16 Go ;
  - RTX 2000 Ada (pilote 32.0.15.6590), plus un contrôleur QXL ;
  - écran 1920×1200, système en fr-FR ;
  - fuseau « Central European » à l'arrivée, passé en « Romance Standard Time » (Chrome lit alors Europe/Paris).
- Installé et vérifié :
  - Chrome officiel 156.0.8078.80 (MSI entreprise, signature Google LLC valide) ;
  - Node 25.9.0 (SHA-256 conforme à SHASUMS256) ;
  - `serveur-cloud` et `build/extension-cloud` 0.6.160.
- Chrome est lancé dans la session ouverte par une tâche planifiée interactive, car la session SSH est la session 0,
  sans écran.

**Contrôles hors réseau** : proxy mort, `essai-me-connecter-pc.mjs --verifier`, qui relit désormais aussi WebGL depuis
une page about:blank.
- 20:42 et 20:59, application ouverte :
  - WebGL « ANGLE (NVIDIA, NVIDIA RTX 2000 Ada Generation Direct3D11) », composition par la carte ;
  - écran 1536×960, Europe/Paris, fr-FR, lecteur PDF, 8 cœurs ;
  - `webdriver` vrai, à cause du canal `--remote-debugging-pipe` qui installe l'extension. C'est le même sur le PC de
    Nico (relu à 20:46), où l'essai était passé.
- 20:45, essai à blanc : le parcours Leboncoin puis Beebs se déroule en entier, sur « ERR_PROXY_CONNECTION_FAILED ».
  Rien n'est sorti de la machine.
- **Flux fermé : impossible à vérifier sans Always On.**
  - Nico a fermé l'application à 20:49:46. Le tunnel s'est coupé dans la seconde et ne s'est jamais reconnecté.
  - À la réouverture, la machine a redémarré (démarrage relu à 20:58:37).
  - Le Manager annonce pourtant « Arrêt en cas d'inactivité : 120 min », 8 h par session et 210 h par mois.
  - Conclusion : la production exige Always On.

**IP neuve.**
- IPRoyal ISP Dedicated, France, 30 jours, commande 87004978 (21:00:42) : **81.181.239.136:12323**.
- 4 $, fin le 29/11 à 21:00, sans renouvellement. Absente de nos 4 commandes précédentes. Sortie relue sur api.ipify.org.
- Solde restant : 7,35 $.
- Les identifiants n'ont jamais été affichés ; les fichiers qui les portaient ont été effacés après l'essai.

**Poste de Nico muet** (sa demande).
- Nico a désactivé son extension lui-même : Chrome interdit aux outils d'ouvrir chrome://extensions.
- Relu en base : `extension_last_seen_at` vaut 20:59:48 avant comme après l'essai (relu à 21:02:13 et 21:03:21).
- Entre 20:59:48 et 21:03:21 : 0 job, 0 relevé d'index, 0 messagerie, 0 `usage_logs`.
- Extension réactivée par Nico, revue en base à 21:15:48.

**Essai unique** (21:02:19 → 21:03:14).
- Application ouverte et réduite : écart accepté par Nico (option A).
- Profil neuf, relais de production verrouillé sur les deux plateformes, « Me connecter » de production.

| Plateforme | Verdict | Détail |
|---|---|---|
| Leboncoin | **GLISSIÈRE** (passe avec vérification) | 21:02:19, auth.leboncoin.fr : « Faites glisser vers la droite », motif « comportement du navigateur », IP 81.181.239.136. ID f4a0ed58-c78a-1a71-7414-32cb20dcf9b3. Même page à 5, 12 et 25 s. |
| Beebs | **GLISSIÈRE** (passe avec vérification) | 21:02:49, `/fr/auth` : même page DataDome. ID 3241bdd1-8417-22f5-24a5-0be98b935c6c. |

**Lecture.**
- Windows sur vraie carte, en centre de données, passe comme le PC de Nico : aucun « Accès temporairement restreint ».
- Beebs est un cran plus prudent qu'avec le PC : glissière au lieu du formulaire.

**Capacité mesurée** (21:17 → 21:25, hors réseau).
- Chaque utilisateur = un relais de production + un Chrome officiel avec l'extension Cloud ; proxy amont mort.
- Page de synthèse locale : 120 annonces dessinées, plus WebGL.

| Utilisateurs | RAM privée Chrome + Node | RAM libre (sur 16 Go) | CPU moyen / max | Mémoire de la carte |
|---|---|---|---|---|
| 1, au repos | 0,33 Go | 12,46 Go | 5 / 16 % | 530 Mo |
| 1, page | 0,48 Go | 12,42 Go | 4,8 / 11 % | 652 Mo |
| 4, page | 1,76 Go | 11,72 Go | 3,5 / 9 % | 1 153 Mo |
| 8, page | 3,45 Go | 10,73 Go | 10,8 / 23 % | 1 805 Mo |
| 12, page | 5,13 Go | 9,88 Go | 11,8 / 25 % | 2 466 Mo |

- Par utilisateur : ≈ 0,43 Go de RAM privée et ≈ 0,2 Go de mémoire de carte.
- Les vraies pages et les jobs actifs pèsent plus (lot D : 650 Mo au repos, 970 Mo en pic).
- Retenu : **≈ 10 utilisateurs par Shadow Neo**, à confirmer en production.

**Coûts TTC, sans récupération de TVA.** Recette : 20 € TTC ≈ 16 € net. IP : 4,64 € par utilisateur.
- **Shadow Neo Pro + Always On**
  - Prix lus dans le Manager :
    - Neo Pro : 35,99 € payés le 30/10 (facture) ;
    - Always On : « Activer la fonction « Always On » coûtera 208,99 € par mois », dans la fenêtre de souscription,
      vers 21:30. Annulée : rien n'a été activé, interrupteur relu éteint ensuite.
  - Il faut ajouter un frontal pour la vue en direct, car Shadow n'a aucune entrée publique : cx23 à 6,59 € + IPv4 à
    0,60 € = 7,19 €.
  - Total : 252,17 € par mois.
    - 10 utilisateurs : 25,22 + 4,64 = **29,86 € par utilisateur** ;
    - 12 utilisateurs : 25,65 €.
  - Au-dessus de la recette nette : **perte**.
- **Hetzner AX42 + Windows Server 2025 Standard**
  - (97,30 + 27,90 + 1,70) € HT = **152,28 € TTC par mois**, plus 58,80 € TTC de mise en service.
  - 16 fils, 64 Go : ≈ 30 utilisateurs, soit 5,08 + 4,64 = **9,72 € par utilisateur**.
  - Rentable à partir de ≈ 14 utilisateurs (152,28 ÷ (16 − 4,64)).
  - Vue en direct sans surcoût : IP publique et trafic inclus.
  - **Non essayée** :
    - pilote AMD non prévu pour Windows Server ;
    - aucun écran branché ;
    - licence d'accès des utilisateurs distants à vérifier avec Hetzner ;
    - premier mois ≈ 176 € HT, au-dessus du plafond de 150 €.
- Bande passante de la vue en direct : images JPEG d'environ 43 Ko (relu sur l'essai), envoyées seulement quand la page
  change. Quelques Mo par connexion : négligeable sur toutes les machines.

**Recommandation.**
- Pas de Shadow en production :
  - Always On à 208,99 € par mois revient à ≈ 25 à 30 € par utilisateur ;
  - l'accord écrit de Shadow est requis ;
  - sans Always On, la machine est limitée à 210 h par mois.
- Shadow a prouvé ce qu'on cherchait : Windows sur vraie carte, en centre de données, passe.
- Machine à viser : AX42 + Windows Server, après le même contrôle hors réseau et un essai unique. Sa commande est la
  décision de Nico.

**Exigences de Nico (30/10, 21:16) : glissière et connexion faites par l'utilisateur depuis l'app, en direct.**
- Déjà dans le code : « Me connecter », poussé mais non déployé, visible des seuls comptes `beta_flags.cloud`.
  - Écran : l'image de la page seule (screencast CDP JPEG, format téléphone), sans barre d'adresse ni onglet.
  - Gestes transmis : appui, glissé continu, relâché (`Input.dispatchTouchEvent`), texte (`Input.insertText`).
  - Navigation : le cadre principal est limité aux pages de connexion de la plateforme et aux connexions Google /
    Facebook / Kiabi ; tout autre lien ramène à la connexion. Une fenêtre ouverte vers une page non permise est fermée.
  - Fermeture automatique dès que les cookies de connexion apparaissent.
  - Mots de passe : ni écrits ni journalisés. Ils traversent seulement la mémoire de l'orchestrateur jusqu'au Chrome.
    Seuls les cookies de la plateforme sont gardés, chiffrés (AES-256-GCM, `cloud_coffre`).
- Ce qui manque :
  1. Écran : une phrase et la page, rien d'autre. Aujourd'hui il y a un en-tête (nom, « Fermer ») et les boutons
     « Écrire » et « J'ai fini ». Il faut aussi :
     - ouvrir le clavier tout seul quand un champ prend le focus ;
     - revenir à l'écran d'où l'utilisateur venait (aujourd'hui : la liste « Me connecter »).
  2. Les cadres : aujourd'hui seuls les documents principaux sont filtrés, les cadres passent. Il faut une liste
     blanche : DataDome, reCAPTCHA, connexions Google, Apple, Facebook et Kiabi.
  3. Glissière pendant la connexion : une phrase dédiée quand le cadre captcha-delivery apparaît, et un test de glissé
     réel. Aucun test ne couvre `touchMove`.
  4. Glissière pendant le travail de fond : rien n'existe pour le Cloud. Côté serveur, le mur
     `verification_antirobot` existe, mais avec un message pour ordinateur (« ouvre … dans Chrome »). À faire :
     - détecter la glissière dans la copie Cloud ;
     - prévenir l'utilisateur par une notification ;
     - ouvrir la vue en direct sur la page bloquée (pas sur la page de connexion), avec seule cette plateforme permise
       par le relais ;
     - fermer la vue dès la page rendue et reprendre le job.
  5. Les tests, puis le déploiement avec le moteur Windows.
- Coût : le développement est le même quelle que soit la machine. Infrastructure : 0 € sur AX42 ; frontal à 7,19 € par
  mois sur Shadow (compté ci-dessus).

**Demande à Shadow : brouillon, NON envoyé.**
> Objet : Shadow PC Pro — autorisation d'usage commercial et tarif pour plusieurs machines Always On
>
> Bonjour,
> J'édite FillSell (fillsell.app), une application d'aide à la revente sur les plateformes de seconde main. Nous
> testons depuis le 30/10/2026 un Shadow PC Neo Pro (VM #BTU1wyVZYbCP36BJt, Strasbourg).
> Nous souhaitons faire tourner sur des Shadow PC Pro, 24 h/24, un navigateur Google Chrome par utilisateur de notre
> service (une dizaine d'utilisateurs par machine). Chaque utilisateur se connecte lui-même à ses propres comptes depuis
> notre application.
> Vos CGV soumettent l'usage « dans le cadre de prestations commerciales » à une autorisation préalable. Pourriez-vous
> nous indiquer :
> 1. si cet usage peut être autorisé, et à quelles conditions (accord écrit) ;
> 2. votre tarif professionnel pour l'option Always On (208,99 €/mois affichés aujourd'hui dans le Manager) et pour 2 à
>    10 machines Neo Pro ou Power Pro, avec ou sans engagement ;
> 3. si la facturation peut être établie au nom de notre société ;
> 4. si une sortie Internet par un proxy distinct pour chaque utilisateur est compatible avec vos conditions.
>
> Cordialement,
> [Nom], FillSell

**État à 22:05 : Shadow écarté par Nico, accès retiré.**
- Sur la machine : `retirer.ps1` lancé à 22:02:25 en tâche SYSTEM détachée. Il retire la tâche du tunnel, le serveur
  SSH, les clés, `C:\ProgramData\FillSellAcces` et `C:\Users\shadow\FillSell`, profils d'essai compris.
- Tunnel coupé à 22:02:29. Le reste du retrait n'a pas pu être relu : il n'y a plus d'accès.
- Sur le relais : compte `shadowtun` supprimé avec sa clé (`userdel -r`), port 2222 fermé, sshd revenu en `LogLevel
  INFO` (le fichier temporaire « verbose » avait été retiré dès 20:39).
- Google Chrome reste installé sur la machine. Résiliation de Shadow : Nico (renouvellement le 30/11).
- IP 81.181.239.136 : disponible jusqu'au 29/11 21:00, sans renouvellement (une ouverture par plateforme déjà faite).
- Ancien serveur : orchestrateur toujours arrêté.

## 13. Recherche élargie : Windows + vraie carte NVIDIA, en Europe, essai à l'heure (30/10 soir, aucun achat)
Demande de Nico (30/10, ≈ 22:10) : la façon la moins chère d'avoir nos Chrome sur Windows avec une vraie carte NVIDIA,
en centre de données européen, 24 h/24, avec un essai à l'heure avant tout engagement. Rien n'est commandé.
- Méthode : cinq recherches en parallèle, en lecture seule (grands clouds ; places de marché GPU ; clouds européens ;
  hébergeurs GPU, cloud gaming et occasion ; licences Microsoft et pilotes NVIDIA). Hetzner relu par l'API Robot
  (`/order/server_market/product`, `/order/server/product`). Change BCE du 30/10 : 1 € = 1,1172 $.
- Calcul, le même pour toutes les offres :
  - utilisateurs = min(RAM × 10/16 (base Shadow : 16 Go ≈ 10), 2 × fils, mémoire de carte ÷ 0,3 Go) ;
  - coût par utilisateur = machine ÷ utilisateurs + IP 4,64 € ;
  - TTC = HT × 1,20 ;
  - à comparer aux 16 € net (HT) de l'option Cloud à 20 € TTC.

### 13.1 Ce qui trie tout : licences et pilotes
1. **Windows 10/11 sur une machine louée : interdit.**
   - Licence OEM ou retail de Windows 11 (avril 2024), §2.b : « "device" does not include any hardware system … on
     which the software is installed or accessed solely for remote use over a network ».
   - §2.c(v) : « use the software to offer commercial hosting services … install the software on a device for use only
     by remote users ».
   - Windows 11 Enterprise (VDA, E3) : « Internal purposes only » (Microsoft Learn, licences Azure Virtual Desktop).
   - Écartés pour cette raison : TensorDock, Cudo Compute, les PC de jeu en ligne.
2. **Carte GeForce en centre de données : interdit par la licence du pilote NVIDIA.**
   - §2.8 : « is not licensed for datacenter deployment ».
   - NVIDIA ne publie aucun pilote GeForce pour Windows Server.
   - Écartés pour cette raison : LeaderGPU (RTX 3090), les GeForce de Hostkey, Exoscale 3080 Ti, Ikoula 4070.
3. **Seul chemin propre** : Windows Server sous licence SPLA de l'hébergeur, sur l'une de ces deux cartes :
   - une carte de **station de travail**. Le pilote RTX Enterprise 597.30 (21/10/2026) est « tested with … Windows
     Server 2022/2025 » et cite les RTX 4000 SFF Ada, RTX A4000, RTX 2000 Ada et RTX PRO 4000 Blackwell ;
   - un vGPU de grand cloud dont la licence graphique est fournie (Azure NV : « comes with a GRID license » ; AWS :
     pilote GRID gratuit).
   Les cartes de centre de données hors grands clouds (L4, A2, T4, V100) sont écartées tant que le rendu n'est pas
   prouvé :
   - leur pilote public tourne en mode calcul (TCC), sans DirectX ;
   - le rendu demande une licence NVIDIA vWS : « a physical GPU requires a vWS license », 250 $ par an et par
     utilisateur simultané au prix conseillé.
4. **Licence RDS pour « Me connecter »** (SPUR Windows Server) :
   - le texte : « Also required for use of Windows Server to host a graphical user interface (using the Windows Server
     Remote Desktop Services functionality or other technology) » ;
   - le multiplexage ne réduit rien ;
   - prix relevés : 7 à 9,10 € HT par client et par mois (Hetzner : « Additional RDP license » 9,10 €, par utilisateur,
     sur demande au support).
   Trois lectures :
   - prudente : tous les clients, tous les mois. **Aucune option Windows ne passe alors sous 16 €** ;
   - intermédiaire, défendable : seulement les clients à qui « Me connecter » a été ouvert dans le mois, journaux
     gardés ;
   - favorable, aucune licence RDS : fragile en cas d'audit.
   C'est le premier point à faire trancher par écrit par l'hébergeur retenu.
5. **Empreinte.**
   - Windows Server 2025 (build 26100) donnerait le même `Sec-CH-UA-Platform-Version` que Windows 11 24H2 (19.0.0). C'est
     une déduction du code de Chromium, non mesurée.
   - Windows Server 2022 donnerait 12.0.0, une valeur repérable. Viser 2025, et mesurer
     `HKLM\SOFTWARE\Microsoft\WindowsRuntime\WellKnownContracts` sur la machine.

### 13.2 Tableau classé, du moins cher au plus cher par utilisateur (HT, sans licence RDS)
| # | Offre | Carte | Ville | Stock lu | €/mois HT (TTC) | Util. | €/util. HT (TTC) | + RDS (prudent) | Essai 3 h HT | Statut |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Hostkey A4000 nu (Ryzen 5950X, 128 Go) | RTX A4000 16 Go | Amsterdam | douteux | 275 (330), Windows ≈ 56 non vérifié | 53 | 9,83 (10,87) | 18,93 | 1 mois | écarté : un mois minimum avec Windows |
| 2 | Colocation (Dell R7920 + A4000 d'occasion, Paris) | RTX A4000 | Paris | — | ≈ 233 lissé 36 mois | 40 | ≈ 10,46 | ≈ 19,56 | — | écarté : achat ≈ 2 200 €, SPLA propre, aucun essai |
| 3 | Ikoula GPU PRO 4000 | RTX PRO 4000 Blackwell | France | non lu | 234 promo + Windows non lu | 40 | ≈ 10,49 + Windows | — | — | écarté : au mois |
| 4 | Hetzner GEX45 neuf | RTX PRO 4000 Blackwell 24 Go | Helsinki | commandable | 263 + 209 de mise en service | 40 | 11,65 (lissé 12 mois) | 20,75 | 210 € | écarté pour l'essai ; Windows non annoncé |
| 5 | **Hetzner enchère n° 3093130** (i5-13500 14 c / 20 f, 64 Go) | **RTX 4000 SFF Ada 20 Go** | Falkenstein FSN1-DC7 | **1 exemplaire**, prix fixe | **283,70 (340,44)** | 40 | **11,73 (13,15)** | 20,83 | **1,13** (Windows d'évaluation) | **retenu n° 1** |
| 6 | Infomaniak nva2 32 vCPU / 64 Go | A2 16 Go | Suisse | sur demande | 342,23 (410,68) | 40 | 13,20 (14,91) | 22,30 | 1,41 | sous réserve : clause « bots » interdite (art. 5.3), A2 en mode calcul |
| 7 | **Azure NV12ads_A10_v5 SPOT** | 1/3 d'A10, 8 Go, GRID compris | Paris | non public | **211,73 (254,08)** | 24 | **13,46 (15,23)** | 22,56 | **0,87** | **retenu n° 3** (spot : préavis 30 s) |
| 8 | Azure NV6ads_A10_v5 SPOT | 1/6 d'A10, 4 Go | Paris | non public | 109,80 (131,76) | 12 | 13,79 (15,62) | 22,89 | 0,45 | variante du n° 3 |
| 9 | **centron Cloud GPU** 26 vCPU / 84 Go | **RTX A4000 16 Go** | Hallstadt (DE) | non lu (compte) | **476,36 (571,63)** | 52 | **13,80 (15,63)** | 22,90 | **0,79** + Windows (prorata non lu) | **retenu n° 2** |
| 10 | Azure NV36ads_A10_v5 SPOT | A10 entière | Dublin | non public | 671,24 | 72 | 13,96 (15,83) | 23,06 | 2,73 | spot |
| 11 | Infomaniak nva2 64 vCPU / 128 Go | A2 | Suisse | sur demande | 585,31 | 53 | 15,68 | 24,78 | 2,41 | mêmes réserves que le n° 6 |
| 12 | Azure NC16as_T4_v3 SPOT | T4 entière | Suède | non public | 380,40 | 32 | 16,53 | 25,63 | 1,53 | au-dessus de 16 € |
| 13 | AWS g4dn.4xlarge SPOT | T4 | Paris | quota à demander | 581,17 | 32 | 22,80 | 31,90 | 2,35 | trop cher |
| 14 | Shadow Neo Pro + Always On | RTX 2000 Ada | France | — | 207,48 (248,98) | 10 | 25,39 (29,54) | — | — | écarté par Nico (§ 12) |
| 15 | AWS g4dn.xlarge SPOT | T4 | Paris | quota | 168,67 | 8 | 25,72 | 34,82 | 0,66 | trop cher |
| 16 | UpCloud GPU 20 vCPU / 256 Go | L4 | Helsinki | selon l'historique du compte | 946,96 | 40 | 28,31 | 37,41 | 3,89 | trop cher, plus licence vWS |
| 17 | OVH win-l4-90 | L4 | Gravelines | non public | 1 102,30 | 44 | 29,69 | 38,79 | 4,53 | trop cher |
| 18 | Vultr A16 16 Go, 6 vCPU (+ Windows, prix d'un tiers) | 1/4 d'A16 | Francfort, Londres | disponible | ≈ 393,69 | 12 | ≈ 37,45 | — | ≈ 1,62 | trop cher ; Windows sur GPU non écrit |
| 19 | OVH rtx5000-28 Windows | Quadro RTX 5000 | Gravelines | « coming_soon » | 364,12 | 8 | 50,16 | — | 1,50 | trop cher |
| 20 | Azure à la demande (NV12ads, Paris) / AWS à la demande | — | — | — | ≈ 1 110 | 24 | ≈ 51 et plus | — | — | trop cher |

Hors catégorie (Linux, sans carte, aux États-Unis) : **Steel à la demande ≈ 7,2 € HT par utilisateur** (§ 14), 58 à 70 €
en 24 h/24.

**Écartés en une ligne** :
- Vast.ai : VM Linux seulement.
- RunPod : « Windows is not supported ».
- Hyperstack, Verda (ex-DataCrunch), Lambda, Nebius, Fluidstack, Crusoe, Nscale, Hivenet, Sesterce, evroc, Lyceum,
  Shadeform : Linux seulement.
- Paperspace : Windows fermé aux nouveaux comptes.
- Salad, Clore.ai : conteneurs.
- CoreWeave : Windows retiré.
- Genesis Cloud : site hors service.
- Massed Compute : États-Unis seulement.
- STACKIT : « Windows Server compatible ✗ » sur ses GPU.
- IONOS Cloud GPU : Linux.
- Scaleway GPU : Ubuntu ; Elastic Metal : licence au mois.
- Contabo : Ubuntu CUDA seulement.
- Akamai/Linode, DigitalOcean : pas de Windows.
- Seeweb : aucun GPU sous Windows publié.
- Cherry Servers : stock 0 et licence due au mois entier.
- Open Telekom Cloud, Outscale : cartes de centre de données à pilote de calcul, et trop chers.
- CloudFerro : licence au mois.
- Gcore, Leaseweb : prix Windows non lus.
- Exoscale : 3080 Ti GeForce, A5000 à ≈ 17,8 €/Go.
- airgpu : « non-commercial », sessions coupées à 24 h.
- Vagon, WorkSpaces, Windows 365 : par utilisateur humain, ou plus cher que la machine nue.
- GeForce NOW, Boosteroid, Blacknut : jeux seulement.

### 13.3 Les 3 meilleures options
1. **Hetzner, enchère n° 3093130** (Falkenstein) : 11,73 € HT par utilisateur (13,15 € TTC), essai 1,13 € HT.
   - Pour :
     - carte de station de travail Ada, de la même famille que la RTX 2000 Ada qui a passé chez Shadow ;
     - pilote RTX Enterprise prévu pour Windows Server 2025 ;
     - à l'heure (0,3734 € + IPv4 0,0027 €), sans mise en service, résiliation immédiate ;
     - tiers permis (CGV §7.1) ;
     - nous y sommes déjà clients.
   - Contre :
     - un seul exemplaire ;
     - Robot ne propose que « Rescue system » sur ce produit, et le serveur d'enchère 3100515 a reçu « For this server
       type Windows cannot be used » : la licence SPLA de Hetzner sur CE serveur n'est pas acquise ;
     - la licence Windows de Hetzner est facturée au mois civil complet (49 € pour 14 cœurs) ;
     - pour monter en charge, il faudra des GEX45 (209 € de mise en service, Windows non annoncé).
   - D'où : l'essai se fait avec **Windows Server 2025 Évaluation** (gratuit, usage d'évaluation), et la question
     écrite à Hetzner part AVANT la commande.
2. **centron Cloud GPU RTX A4000** (Hallstadt, Allemagne) : 13,80 € HT par utilisateur à 26 vCPU / 84 Go, essai 0,79 € HT.
   - Pour :
     - le SaaS est permis noir sur blanc (conditions, art. 13.2) ;
     - Windows Server SPLA à 9,24 € par tranche de 2 cœurs et par mois ;
     - à l'heure, sans mise en service ni engagement ;
     - plusieurs machines possibles à la demande ;
     - 200 € de crédit offert aux nouveaux comptes d'entreprise (selon le site, non vérifié).
   - Non lu :
     - le prorata de la licence Windows (« you pay for the Windows licence monthly ») : l'essai coûte 0,10 € avec
       prorata, 18,48 € sinon ;
     - le prix de l'IPv4, le stock d'A4000, le prix de la licence RDS.
3. **Azure NV12ads_A10_v5 en spot** (Paris) : 13,46 € HT par utilisateur, essai 0,87 € HT.
   - Pour : à Paris, licence GRID fournie, facturation à la minute.
   - Contre :
     - en spot, Azure peut reprendre la machine avec 30 s de préavis, et le taux d'éviction n'est pas lu ;
     - à la demande, ≈ 51 € par utilisateur ;
     - fraction de carte de centre de données : le nom vu en WebGL n'est pas encore relevé ;
     - Azure ne vend pas de licence RDS ;
     - quota GPU à demander.

### 13.4 Plan de l'essai n° 1 (Hetzner 3093130) — à faire seulement sur le feu vert de Nico
Avant la commande (règle de Nico : tout vérifier sur le modèle précis) :
- envoyer la question à Hetzner (§ 13.5) ;
- relire le produit 3093130 dans Robot : prix, IPv4, stock.

L'essai :
1. **Commande** par l'API Robot : produit 3093130 + IPv4 primaire, notre clé SSH.
2. **Windows Server 2025 Évaluation** (expérience bureau), ISO du centre d'évaluation de Microsoft :
   - installé depuis le système de secours (QEMU sur le disque NVMe), ou par la console KVM (gratuite, sur demande) ;
   - fr-FR, Europe/Paris, ouverture de session automatique ;
   - OpenSSH en local et tunnel SORTANT, comme sur Shadow (§ 12).
3. **Pilote** NVIDIA RTX Enterprise 597.30, signature vérifiée. Relever `UniversalApiContract` (attendu : 19.0.0).
4. **Pare-feu Windows** : sortie limitée au proxy et au relais ; UDP bloqué, pour qu'aucune fuite WebRTC ne trahisse
   l'IP Hetzner.
5. **Installation** de Chrome officiel, Node, `serveur-cloud` et `build/extension-cloud` 0.6.160, les mêmes que pour
   Shadow.
6. **Contrôle hors réseau** : `essai-me-connecter-pc.mjs --verifier`.
   - Chrome est lancé dans la session ouverte, par une tâche interactive.
   - Le WebGL doit nommer « NVIDIA RTX 4000 SFF Ada Generation », pas « Microsoft Basic Render » ni SwiftShader.
   - Sinon : résiliation, sans aucune visite.
7. **Poste de Nico muet**, relu en base.
8. **Essai** : une ouverture Leboncoin, une ouverture Beebs. Sortie par l'IP 3 si l'essai Steel ne l'a pas fait
   bloquer ; sinon, une IP neuve.
9. **Fin** : résiliation immédiate, secrets effacés avant.

Coût :
- machine : 3 h × 0,3761 € = **1,13 € HT, soit 1,35 € TTC** (5 h si l'installation traîne : 2,26 € TTC) ;
- Windows d'évaluation : 0 € ;
- IP 3 : 0 € (déjà payée). Une IP neuve coûterait 4 $ ≈ 3,58 €, pris sur le solde IPRoyal de 7,35 $.
**Moins de 5 € dans tous les cas, sauf IP neuve ET plus de 3 h** (5 h + IP neuve ≈ 5,84 €).

### 13.5 Questions écrites, à envoyer par Nico (brouillons, NON envoyés)
**Hetzner** (ticket Robot) :
> Hello, we are considering Server Auction product #3093130 (i5-13500, RTX 4000 SFF Ada) and the GEX45. (1) Can the
> Windows Server 2025 Standard add-on (SPLA) be ordered for #3093130 and for the GEX45? (2) Our SaaS runs Google Chrome
> instances for our own customers; customers never log into Windows, but they may see one Chrome tab through our web
> app to log into their own accounts. Do we need your per-user RDP licences (9.10 €/month) for them, and are they
> counted per month of actual use? (3) Is the add-on billed for the full calendar month even for a few hours?

**centron** (formulaire de contact) :
> Hallo, wir planen Cloud-GPU-Instanzen (RTX A4000) mit Windows Server für unser SaaS (Google Chrome für unsere Kunden,
> die sich nie bei Windows anmelden, aber einen Chrome-Tab über unsere App sehen können, um sich bei ihren eigenen
> Konten anzumelden). (1) Wird die Windows-Lizenz stündlich anteilig berechnet? (2) Preis der IPv4? (3) Brauchen wir
> RDS-SALs, und zu welchem Preis? (4) Sind RTX A4000 derzeit verfügbar?

## 14. Steel (steel.dev), 30/10 soir : pourquoi Leboncoin passait le 26/09, prix en production, essai préparé
**Faits relus** (`fillsell-cloud-proto` : JOURNAL.md et REPRISE.md ; API Steel ; base) :
- **26/09, Steel hébergé**.
  - Environnement : Linux, Chromium 150, SwiftShader, en-US.
  - Machine à Washington : région `iad`, relue ce soir par l'API Steel ; Steel n'a aucune région en Europe (`lax`,
    `ord`, `iad`).
  - IP : 194.152.141.98 (Deutsche Telekom, Lyon).
  - Leboncoin : page de connexion servie, connexion faite à la main par Nico, publication sans défi.
- **Beebs, 26/09 : jamais mesuré proprement.**
  - Selon Nico, le blocage de midi a suivi un passage par DuckDuckGo, pour retrouver l'onglet fermé par erreur.
  - L'essai de 17:58 gardait le cookie DataDome marqué à midi et la même IP.
- **05/10** : « Leboncoin passait » sur le Steel auto-hébergé chez Hetzner. C'était seulement la page d'ACCUEIL
  (mesure de mémoire), pas auth.leboncoin.fr.
- **30/10** : tout Linux chez Hetzner est bloqué ; Windows passe, avec glissière (§ 7 à 12).

**Lecture.**
- Ce n'est pas l'adresse Hetzner. Leboncoin ne voit que l'IP IPRoyal, et le pare-feu ne laisse sortir que les ports
  du proxy, sans DNS.
- Deux causes possibles, peut-être additionnées :
  - (a) DataDome a durci entre le 26/09 et le 30/10 ;
  - (b) notre image Linux est grillée. Du 05/10 au 30/10, les brûleurs (§ 7) ont visité Leboncoin et Beebs sans
    connexion, avec un 403 à chaque fois, sous la même empreinte. Cela expliquerait le blocage du serveur neuf avec
    une IP neuve.
- L'essai Steel tranche, car l'environnement de Steel n'a jamais servi aux brûleurs :
  - Steel passe → c'est notre environnement qui est en cause ;
  - Steel est bloqué → seule la voie Windows + vraie carte reste.

**Prix** (steel.dev/pricing, lu le 30/10) :
- Launch : 0 $ par mois, 0,10 $ par heure de navigateur, 10 sessions simultanées, 15 min au plus par session.
- Scale : 250 $ par mois dont 100 $ de crédit, 0,08 $/h, 100 sessions simultanées, 1 h au plus.
- « Stealth browser » : seulement dans l'offre Enterprise.

| Mode | € HT par utilisateur, IP comprise |
|---|---|
| Navigateur allumé 24 h/24 | 58 (Scale, 100 utilisateurs) à 70 (Launch) : exclu |
| Ouvert seulement pour travailler | 7,2 (moyenne) ; 9,2 (90e centile) ; 22,5 (maximum) |

- Plusieurs comptes par navigateur : impossible. Une extension sert un seul compte, il y a une seule connexion par
  plateforme et une seule IP par session.
- Base du mode « à la demande » : jobs Vinted, Leboncoin, Beebs et Depop sur 30 jours, 231 utilisateurs ; par
  utilisateur et par jour : médiane 2,4, moyenne 8,7, 90e centile 24,1, maximum 121,7. Hypothèse non mesurée :
  3 min par job, plus 30 min par jour de relevés.
- Ce mode suppose trois choses :
  - refaire le Cloud en sessions ouvertes à la demande, avec les cookies remis par notre coffre ;
  - des données de clients traitées aux États-Unis : accord de traitement et clauses types ; Steel enregistre aussi
    les sessions ;
  - que DataDome laisse passer Steel.

**Essai unique préparé, NON lancé (feu vert de Nico).**
- **Outils** :
  - `serveur-cloud/outils/essai-me-connecter-steel.mjs` : modes `--envoyer-extension`, `--verifier` (proxy mort),
    `--a-blanc` (proxy mort), essai réel (proxy sur l'entrée standard) ;
  - lanceur hors dépôt : `fillsell-cloud-proto/essai-steel-3010.mjs`. La clé Steel passe par l'environnement, le proxy
    est relu à l'API IPRoyal, rien n'est affiché.
- **Conditions** :
  - « Me connecter » de production, copie Cloud 0.6.160 ;
  - profil neuf (aucun profil Steel chargé ni gardé) ;
  - `skipFingerprintInjection` (déguisement coupé), `solveCaptcha: false` ;
  - une ouverture par plateforme ;
  - session toujours rendue, compteur relu.
- **IP 3 relue le 30/10 à 22:34** :
  - commande 87004978 « confirmed », fin le 29/11 à 21:00:42 (Paris), sans renouvellement ;
  - sortie 81.181.239.136, Noisiel, AS2914 NTT ;
  - hors pool (pool = IP 1 et IP 2) ;
  - solde IPRoyal : 7,35 $.
- **Ordre** :
  1. extension, puis vérification, puis essai à blanc (aucune plateforme) ;
  2. Nico coupe son extension, base relue ;
  3. sortie de l'IP relue ;
  4. essai ;
  5. Nico remet son extension, base relue.
- **Coût** : ≈ 5 min de navigateur ≈ 0,01 $, pris sur le crédit offert. **Moins de 0,01 €.**
- **Écart voulu** : format téléphone (« Me connecter » de production), comme les essais du 30/10. Le 26/09 s'était fait au
  format bureau.

### 14.1 Feu vert de Nico (31/10, 00:10) ; étapes sans plateforme faites ; essai réel REPORTÉ au lendemain
Ordre de Nico : essai Steel, puis tickets Hetzner et centron, et aucun essai Hetzner sans leur réponse écrite sur la
licence. Nico n'a pas pu couper son extension ce soir. Ses consignes : « Garde l'essai Steel tel quel pour demain : je
t'écrirai « muet » quand j'aurai coupé l'extension. D'ici là, rien sur Leboncoin ni Beebs. »

**Fait le 31/10 entre 00:16 et 00:21 (aucune plateforme jointe) :**
- **Poste de Nico** (`f44b5917`) : vu en base à 00:19:48, 0 job en attente.
  - Couper le poste côté serveur : impossible proprement. Aucun interrupteur serveur ne coupe tout : l'extension lance
    aussi d'elle-même ses alarmes (synchros du jour, lecture signalée toutes les 30 s).
  - Seul Nico peut couper : `chrome://extensions`, carte FillSell sur ARRÊT. Il ferme aussi ses onglets Leboncoin et
    Beebs.
- **Extension chez Steel** : Steel gardait celle du 26/09 sous le même identifiant (`POST /v1/extensions` → 400
  « already exists »).
  - Correctif de l'outil : il relit `GET /v1/extensions`, puis remplace par `PUT /v1/extensions/{id}`. Méthode relue
    dans le SDK officiel `steel-sdk` 0.18.0.
  - Copie Cloud 0.6.160 envoyée à 00:18:10. `build/extension-cloud` date de 17:40 ; le dernier commit de l'extension,
    de 17:30.
- **Vérification** (`--verifier`, proxy mort ; session `72959a70`, `iad`, 2 s, 0 crédit) :
  - Chrome 156.0.8078.73, service worker de l'extension présent ;
  - WebGL SwiftShader, Linux x86_64, écran 1920×1080 ;
  - America/New_York, en-US, 6 cœurs, `webdriver` false, `pdfViewerEnabled` false, 0 plugin.
  - Ce sont les conditions du 26/09, déguisement coupé : l'essai lit « machine Linux de Steel aux États-Unis + IP
    française ».
- **Essai à blanc** (`--a-blanc`, proxy mort ; session `d9834b58`, 62 s, 0 crédit) :
  - parcours complet ;
  - « Proxy Connection Failed » (ERR_TUNNEL_CONNECTION_FAILED) sur la page Leboncoin et sur la page Beebs ;
  - session rendue.
- **IP 3 relue à 00:20** : commande « confirmed », fin le 29/11 à 21:00:42 (Paris) ; sortie 81.181.239.136, Noisiel,
  AS2914 ; solde IPRoyal 7,35 $.

**Reste à faire, quand Nico écrit « muet » (et seulement alors) :**
0. **Avant** (ne touche aucune plateforme) : l'extension est passée en 0.6.161 sur main (lot E, poussé par un autre
   terminal pendant la nuit), alors que Steel a la copie 0.6.160.
   - Refaire la copie Cloud depuis le dernier commit : `node scripts/cloud/build-extension-cloud.mjs`.
   - La renvoyer : `node essai-steel-3010.mjs extension` (remplacement par `PUT`).
   - Relancer `node essai-steel-3010.mjs verifier`.
1. Relire en base que le poste se tait : `profiles.extension_last_seen_at` figé pendant au moins 2 min, 0 job, 0 relevé
   dans la fenêtre.
2. `cd C:\Users\nicol\fillsell-cloud-proto && node essai-steel-3010.mjs essai`.
   - Le lanceur relit l'IP 3 à l'API IPRoyal. Les deux bilans à blanc ne bloquent pas : seul `bilan.json` interdit un
     second essai.
3. Juger sur les images (5, 12 et 25 s), comme au § 12 : formulaire = PASSE ; glissière = PASSE AVEC VÉRIFICATION ;
   « Accès temporairement restreint » = BLOQUÉ.
4. Nico remet son extension, puis base relue.
5. Compte rendu ici, puis tickets Hetzner et centron (§ 13.5).

**Piste Mac mini (demande de Nico, 31/10, 00:25)** : `docs/enquetes/mac-mini-3110/RAPPORT.md`. La licence macOS ferme
la voie (location réservée à l'intégration continue ; « service bureau » interdit). Recommandation : pas d'essai avant
une réponse écrite d'Apple ; décision à Nico.

## 15. Essai Steel du 01/11/2026 : Leboncoin FORMULAIRE, Beebs GLISSIÈRE (pas de blocage)
Ordre de Nico (01/11) : l'essai Steel préparé au § 14.1, un seul, puis la décision (page à part :
`docs/enquetes/machine-cloud-3010/DECISION-0111.md`).

**Poste de Nico muet : impossible côté serveur dans ses règles → un geste.**
- Aucun drapeau par compte ne coupe tout. Ce qui existe ne coupe qu'une partie, avec des effets de bord :
  - la file en pause (`file_pause`) retient seulement les publications et republications pas encore commencées ;
  - le blocage Leboncoin (`blocage_acces`) enclenche ensuite un essai et une reprise prudente de 6 h (cadence) ;
  - « je ne vends pas sur » (`plateformes_ecartees`) annule les demandes en file.
- En créer un voudrait dire redéployer get-pending-jobs, qui sert tout le parc (« rien sur le parc »). L'extension lance
  en plus d'elle-même ses alarmes : synchros du jour, lecture signalée toutes les 30 s.
- Geste demandé à Nico : `chrome://extensions`, carte FillSell sur ARRÊT.
- Avant l'essai, à 14:57, son poste travaillait (vu à 14:55:59 ; 26 annonces touchées et 5 relevés de messagerie en
  30 min).
- Muet vérifié en base :
  - dernier signe à 15:03:59, dernière écriture du poste à 15:04:05 (fin d'un relevé de messagerie) ;
  - relu à 15:06:52 : 0 job, 0 relevé, 0 messagerie, 0 `usage_logs` depuis 15:04:05 ;
  - relu à 15:13:16 : rien d'autre que le relevé eBay de 15:07:06, venu de la tâche planifiée serveur
    `ebay-messagerie-20min` (`7-59/20 * * * *`, API eBay), pas du poste.
- Remise en service : Nico a répondu « plus tard ». Extension encore sur ARRÊT à la fin de la session (voir REPRISE).

**Avant l'essai (aucune plateforme jointe).**
- La copie Cloud a été refaite depuis HEAD e48cefb : 0.6.164, BUILD_ID `2026-11-01T13:55:48Z+e48cefb-cloud`. Elle a
  remplacé chez Steel la 0.6.160 (`PUT`).
- Vérification (proxy mort, session `3bc29ff3`, 2 s, 0 crédit) : extension présente, Chrome 156.0.8078.73,
  SwiftShader, Linux x86_64, 1920×1080, America/New_York, en-US, `webdriver` false. Mêmes conditions qu'au 31/10.

**L'essai** (session `30f8e35b`, région `iad`, 15:07:01 → 15:08:06, 62 s, 0 crédit, session rendue, 5,3 Mo de proxy).
- Conditions : profil neuf, déguisement de Steel coupé, aucun résolveur, IP 3 81.181.239.136 (commande 87004978) ;
  « Me connecter » de production, format téléphone, une ouverture par plateforme.

| Plateforme | Verdict | Détail |
|---|---|---|
| Leboncoin | **FORMULAIRE** (passe) | À 5 s, « Vérification de l'appareil… » (cadre DataDome `interstitial`), qui s'efface seule. À 12 s et 25 s, « Connectez-vous ou créez votre compte leboncoin », champ e-mail, Apple, Google. 486 images transmises en 25 s. |
| Beebs | **GLISSIÈRE** (passe avec vérification) | `/fr/auth` : « Verification Required — Slide right to secure your access » (en anglais : navigateur en-US). Même page à 5, 12 et 25 s. ID e8e40fab-f085-827a-3451-ade3199d07e2. |

Images et bilan, hors dépôt : `fillsell-cloud-proto/essai-steel-3010/` (`essai-*.jpg`, `bilan.json`).

**Lecture.**
- Le navigateur Steel (Linux, sans carte graphique, aux États-Unis) passe là où notre Chrome Linux de Hetzner était
  bloqué d'emblée, même sur une machine neuve avec une IP neuve (§ 7). Linux en centre de données n'est donc pas
  condamné en soi : c'est notre environnement qui est repéré. Cause la plus probable : les visites des brûleurs (§ 7),
  du 05/10 au 30/10, toutes sous la même empreinte.
- Un seul essai ne sépare pas « empreinte grillée » de « configuration repérable ». Steel diffère aussi par sa version de
  Chrome, son fuseau et sa langue.
- Leboncoin est même plus ouvert que sur Windows à vraie carte (glissière sur le PC de Nico et sur Shadow).
- Le « Me connecter » de production a piloté le Chrome de Steel sans changement : images, gestes, fermeture. La
  connexion et la glissière en direct depuis l'app sont donc compatibles avec Steel.
- Non prouvé : la tenue dans la durée (jobs réels, cookies gardés d'une session à l'autre, glissières à répétition), et
  la connexion Beebs une fois la glissière passée.

## 16. steel-browser (logiciel libre) sur un serveur Hetzner à nous ? (01/11, 15:20 → 15:40, aucun achat)
**Décisions de Nico (01/11)** :
- même rythme que l'extension (ronde toutes les 10 min) ;
- Steel loué à la minute ne sert qu'à tester : à ≈ 15,5 € par utilisateur, il est à perte ;
- tous les calculs se font sur ce qu'il touche vraiment par abonné Cloud : **14,40 € par Stripe, 10,50 € par Apple**,
  frais et URSSAF déduits ;
- son poste reste sur ARRÊT jusqu'à la fin des essais Cloud : il compte comme muet pour les prochains essais.

### 16.1 Ce qui différait entre notre Chrome Hetzner (30/10, bloqué) et Steel loué (01/11, passé)
| | Notre Chrome Hetzner (30/10) | Steel loué (01/11) |
|---|---|---|
| Navigateur | Google Chrome officiel 156 (paquet .deb de Google), 5 plugins PDF | « Chrome/156.0.8078.73 » de Steel (binaire non publié), 0 plugin, pas de lecteur PDF |
| Rendu | SwiftShader, forcé par drapeaux (`--use-angle=swiftshader --enable-unsafe-swiftshader`) | SwiftShader aussi (Vulkan SwiftShader) |
| Langue, fuseau | fr-FR, Europe/Paris (réglés par nous) | en-US, America/New_York (ceux du serveur Steel) |
| Fenêtre | 1366×768 sur un écran de 1920×1080 ; 1536×864 dans un essai | 1920×1080, plein écran |
| Lancement | `--no-sandbox`, extension par stratégie d'entreprise, outils de développement permis par stratégie, relais de proxy local | lancement de Steel, extension par `--load-extension` |
| Machine | Hetzner (vCPU partagés) : 2 cœurs vus sur cx23, 8 sur cx43 | machine de Steel aux États-Unis, 6 cœurs vus |
| IP | IP fixes 1 et 2, 188.126.31.118, résidentielles neuves | 81.181.239.136, jamais vue de nos Chrome Linux (elle a servi à Shadow le 30/10) |
| Passé | environnement visité des centaines de fois avec un 403 par les brûleurs (§ 7), et essais répétés le 30/10 | jamais utilisé par nous vers Leboncoin et Beebs |
| Retouches | aucune | injection d'empreinte coupée, résolveur coupé ; la « furtivité avancée » de Steel n'est pas documentée : rien ne prouve qu'aucune autre retouche n'était active |

- L'IP n'explique pas tout : sur les mêmes IP, un vrai Chrome Windows passait (lot D).
- La langue et le fuseau seuls n'expliquent pas tout non plus : le 30/10, Chrome en fr-FR a eu une glissière à 11:48,
  puis un blocage à 12:37.
- Lecture la plus simple : notre environnement s'est fait repérer à force de 403 (brûleurs, essais répétés). Mais un
  seul essai Steel ne peut pas écarter la part de la « furtivité avancée » non documentée de Steel.

### 16.2 Le logiciel libre face à la version louée
Sources : dépôt `steel-dev/steel-browser` (v0.5.4, dernier commit du 31/10/2026 ; image
`ghcr.io/steel-dev/steel-browser:latest` = `sha256:b5bd99decf276ff6f9a8606def9f7408a376e17ac66a9e12cb82d8400cca23bd`,
relue à 15:36) et page officielle « Steel Local vs Steel Cloud » (docs.steel.dev).
- **Ce que contient le logiciel libre**, licence Apache 2.0 :
  - le paquet `chromium` de Debian (pas Google Chrome), piloté par puppeteer-core 23.6 ;
  - SwiftShader (`--use-gl=swiftshader`), WebRTC limité au proxy.
- **Ses réglages par défaut, contraires à nos règles** :
  - sans écran (`CHROME_HEADLESS` vrai, avec `--disable-blink-features=AutomationControlled`) ;
  - **injection d'empreinte ACTIVE** (`fingerprint-generator` / `fingerprint-injector` 2.1.82 : une empreinte « Linux,
    Chrome, en-US » tirée au hasard).
  - À lancer avec écran (Xvfb, déjà dans l'image) et `SKIP_FINGERPRINT_INJECTION=true`. Notre ancienne image du 05/10
    le faisait déjà.
- **Ce que seule la version louée ajoute** (page officielle) :

  | | Logiciel libre | Version louée |
  |---|---|---|
  | Sessions | 1 par instance | 10 (Launch), 100 (Scale) |
  | Furtivité | « Limited » | « Advanced Stealth », non détaillée |
  | Captchas | aucun | résolveur payant |
  | Proxys | les nôtres | les nôtres ou ceux de Steel |
  | Autres | — | coffre d'identifiants, fichiers, extensions par API, enregistrement des sessions, région us-east |

  Nous n'utilisons rien de tout cela, sauf peut-être la furtivité, qu'on ne peut pas couper puisqu'elle n'est pas
  décrite.
- **Déjà fait chez nous.** Du 05/10 au 30/10, le Cloud tournait sur ce logiciel libre : image du 05/10, Chromium 154,
  sans WebGL ni lecteur PDF, fr-FR et Paris, ancien serveur, IP fixes 1 et 2. Le 30/10, il était **bloqué** sur
  Leboncoin et sur Beebs (lot D). L'image a changé depuis (WebGL SwiftShader, Chromium récent). Elle n'a jamais été
  essayée sur une machine neuve, ni par l'IP qui passe.
- Une session par instance : un conteneur par utilisateur, comme l'orchestrateur le faisait déjà (`navigateur.js`).

### 16.3 Coût net par utilisateur (serveur + IP), TTC sans récupération de TVA
- Règles :
  - prix lus par l'API Hetzner Cloud (`/pricing`, `/server_types`) et par l'API Robot à 15:30 ;
  - IPv4 du serveur comprise ; IP IPRoyal dédiée 4,64 € par utilisateur ;
  - navigateur ouvert 24 h/24 : l'extension y garde son propre rythme (veille des commandes toutes les 10 min) ;
  - capacité estimée : 05/10, 13 navigateurs sur cx43 ; Shadow, 12 Chrome sur 16 Go. À mesurer.
- Calcul : coût = serveur ÷ n + 4,64 €. Marge = 14,40 € (Stripe) ou 10,50 € (Apple) − coût.

| Serveur | Stock à 15:30 | € TTC / mois | n = 5 | n = 10 | n = 20 | n = 30 | Capacité estimée | Rentable dès (Stripe / Apple) |
|---|---|---|---|---|---|---|---|---|
| Cloud **cx43** (8 vCPU, 16 Go) | **indisponible** en fsn1, nbg1, hel1 | 19,79 | 8,60 | **6,62** | — | — | 10 à 13 | **3 / 4** |
| Cloud **cx53** (16 vCPU, 32 Go) | **indisponible** | 35,99 | 11,84 | 8,24 | **6,44** | — | 20 à 26 | 4 / 7 |
| Cloud cpx42 (8 vCPU AMD, 16 Go) | disponible | 83,99 | 21,44 | 13,04 | — | — | 10 à 13 | 9 / 15 (Apple : au-delà de sa capacité) |
| Cloud cpx62 (16 vCPU AMD, 32 Go) | disponible | 156,59 | — | 20,30 | 12,47 | — | 20 à 26 | 17 / 27 (Apple : au-delà de sa capacité) |
| Robot enchère i7-7700, 64 Go (ex. n° 3104366, FSN1) | plusieurs | 90,84 | 22,81 | 13,72 | 9,18 | 7,67 | 16 (processeur) à 40 (mémoire) | 10 / 16 |
| Robot **AX42** (Ryzen 7 PRO 8700GE 8 c / 16 f, 64 Go) | commandable | 118,80 + 58,80 une fois | — | 16,52 | 10,58 | **8,60** | 32 à 50 | 13 / 21 |

- **Marge par utilisateur, serveur plein** :

  | Serveur | Stripe | Apple |
  |---|---|---|
  | cx43 (10 util.) | + 7,78 | + 3,88 |
  | cx53 (20 util.) | + 7,96 | + 4,06 |
  | AX42 (32 util.) | + 6,05 | + 2,15 |
  | enchère i7 (16 util.) | + 4,08 | + 0,18 |

- Le premier poste de coût est l'IP dédiée (4,64 €), pas le serveur. Partager les IP en rotation (lot D) la ferait
  baisser, mais c'est ta décision : une IP par compte depuis le 05/10.
- Les cx, de loin les moins chers, sont en rupture à cet instant (déjà le 30/10 pour cx43). Il faut donc partir sur une
  machine disponible : cpx42 pour les tout premiers, puis AX42 ou une enchère dès ≈ 15 abonnés.

### 16.4 Comparaison sur les montants nets (toutes les pistes, TTC par utilisateur)
| Piste | Coût | Marge Stripe (14,40) | Marge Apple (10,50) |
|---|---|---|---|
| steel-browser chez nous, cx43 plein / AX42 plein | 6,62 / 8,35 | + 7,78 / + 6,05 | + 3,88 / + 2,15 |
| Steel loué, ronde de 10 min (moyenne) | 15,53 | − 1,13 | − 5,03 |
| Steel loué 24 h/24 | 69 à 83 | perte | perte |
| Windows + carte : AX42 + Windows Server, sans RDS / avec | 9,72 / 20,64 | + 4,68 / perte | + 0,78 / perte |
| Windows + carte : Hetzner 3093130, sans RDS / avec | 13,15 / 24,07 | + 1,25 / perte | − 2,65 / perte |
| Windows + carte : Azure spot / centron (sans RDS) | 15,23 / 15,63 | perte | perte |
| Mac mini Green Mini / Scaleway M4-M (licence bloquante) | 14,72 / 16,58 | − 0,32 / perte | perte |
| Shadow + Always On | 29,86 | perte | perte |

### 16.5 L'essai proposé (un seul ; rien n'est acheté sans feu vert écrit)
**But** : savoir si steel-browser, tel que publié, passe Leboncoin et Beebs depuis une machine Hetzner neuve, par l'IP
qui passe avec Steel loué. On garde tout le reste identique à l'essai du 01/11.
- **Serveur exact** : Hetzner Cloud **cpx42** (8 vCPU AMD, 16 Go), Nuremberg (nbg1), Ubuntu 24.04, IPv4 primaire ;
  créé par l'API, supprimé juste après.
  - Il a la même taille que cx43 (le serveur de production le moins cher, en rupture) et que l'ancien serveur.
  - C'est la machine des premiers abonnés si les cx restent en rupture.
- **Logiciel** : `ghcr.io/steel-dev/steel-browser` épinglé par son empreinte (relue au moment de l'essai ; 15:36 :
  `sha256:b5bd99de…`).
  - Réglages : `CHROME_HEADLESS=false` (écran Xvfb fourni par l'image), `SKIP_FINGERPRINT_INJECTION=true`, aucun
    résolveur.
  - **Rien d'autre** : ni langue ni fuseau réglés (ceux de l'image), aucune retouche.
  - Copie Cloud de l'extension 0.6.164, « Me connecter » de production : l'outil `essai-me-connecter-steel.mjs`, avec
    une seule option en plus, l'adresse de notre instance au lieu d'api.steel.dev.
- **Ordre** :
  1. création ;
  2. pare-feu : sortie limitée au proxy 81.181.239.136:12323, SSH entrant ;
  3. `--verifier` sur proxy mort : extension présente, WebGL SwiftShader, « HeadlessChrome » absent, langue et fuseau
     relevés ;
  4. `--a-blanc` sur proxy mort ;
  5. poste de Nico relu muet en base ;
  6. **l'essai** : une ouverture Leboncoin, puis une ouverture Beebs, images à 5, 12 et 25 s. Si c'est bloqué, on
     s'arrête ;
  7. secrets effacés, serveur supprimé.
- **Durée** : ≈ 1 h 30 (installation et téléchargement de l'image ≈ 45 min, contrôles, 2 min d'essai), 3 h au plus.
- **Coût exact** :
  - 0,1114 € HT/h pour le cpx42 et 0,0008 € HT/h pour l'IPv4, soit 0,1122 € HT/h ;
  - 2 h facturées = 0,22 € HT = **0,27 € TTC** ; plafond 3 h = 0,34 € HT = **0,40 € TTC** ;
  - IP 81.181.239.136 déjà payée jusqu'au 29/11 : 0 € ; logiciel : 0 €.
- **Lecture du résultat** :
  - **passe** (formulaire ou glissière) → la voie « steel-browser chez nous » est ouverte. Suite : endurance 48 h au
    rythme de l'extension, sur ton compte, sur ce même serveur (≈ 5,40 € HT, soit 6,46 € TTC pour 48 h de cpx42), sur
    feu vert ;
  - **bloqué** → ce qui fait passer Steel loué, c'est sa machine ou sa furtivité non documentée. La voie « chez nous »
    est fermée, et la voie Steel loué porte un doute de maquillage.

## 17. Essai steel-browser chez nous (01/11, 15:51 → 16:04) : Leboncoin FORMULAIRE, Beebs GLISSIÈRE — ça passe
**Feu vert écrit de Nico (01/11)** : Hetzner Cloud cpx42 neuf, à l'heure, 0,40 € TTC au plus, supprimé juste après.
steel-browser tel que publié, avec écran, injection d'empreinte coupée, aucun résolveur. IP 81.181.239.136, profil neuf,
« Me connecter » de production. Leboncoin puis Beebs, arrêt au premier blocage. L'option de l'outil est à coder.

**Outil.** `serveur-cloud/outils/essai-me-connecter-steel.mjs` reçoit `--instance=http://127.0.0.1:<port>` :
- mêmes modes, contre notre steel-browser joint par un tunnel SSH, au lieu d'api.steel.dev ;
- pas de clé ; extension montée sur le serveur (`api/extensions/fillsell`, comme `navigateur.js`) ;
- session `{ proxyUrl, skipFingerprintInjection: true, headless: false, blockAds: false, extensions: ['fillsell'] }` ;
  blockAds est mis à false parce que steel-browser bloque les publicités par défaut, ce que Steel loué ne fait pas ;
- seule une adresse locale est acceptée.

Lanceur hors dépôt : `fillsell-cloud-proto/essai-steel-oss-0111.mjs` (IP relue à l'API IPRoyal, proxy par l'entrée
standard).

**Serveur.**
- Hetzner Cloud cpx42, n° 173977992, nbg1, Ubuntu 24.04, IPv4 2.31.84.215, créé à 15:51:13 (heure de Paris).
- Installé : Docker 29.1.3, puis l'image `ghcr.io/steel-dev/steel-browser@sha256:b5bd99de…` (3,8 Go, 30 s). La copie
  Cloud 0.6.164 a été copiée sur le serveur.
- **Pare-feu Hetzner** n° 11943520 :
  - entrée : SSH ; sortie : seulement TCP 81.181.239.136:12323 ;
  - contrôlé : 1.1.1.1:443 fermé, 93.184.215.14:443 fermé, le proxy ouvert ;
  - posé avant le démarrage du navigateur.
- Conteneur lancé avec écran Xvfb 1920×1080 (l'image n'en démarre pas elle-même), `CHROME_HEADLESS=false`,
  `SKIP_FINGERPRINT_INJECTION=true`, sans langue ni fuseau réglés.
- Navigateur : **Chromium 156.0.8078.73 de Debian 12**, le même numéro que Steel loué (« Chrome/156.0.8078.73 »).

**Écart demandé à Nico avant l'essai (sa réponse : « avec 3D, comme Steel loué »).**
- Tel que publié, steel-browser démarre la 3D (WebGL) **coupée** : vérification sans réseau à 15:53, WebGL `null`,
  rendu « disabled ». Steel loué, lui, a la 3D par SwiftShader.
- Deux réglages de lancement rendent exactement la même 3D que Steel loué : `FILTER_CHROME_ARGS="--disable-gpu
  --use-gl=swiftshader"` et `CHROME_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader"`.
- Vérifié à 15:54 : WebGL « ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader
  driver) », même nom que Steel loué. Le reste : extension présente, 1920×1080, UTC, en-US, 8 cœurs, `webdriver` false,
  0 plugin.
- Ce n'est pas du maquillage : le moteur dessine vraiment, aucune valeur n'est inventée.
- Écarts restants avec Steel loué : fuseau UTC au lieu de New York, 8 cœurs au lieu de 6.

**Poste de Nico** (sur ARRÊT par sa décision).
- Relu à 16:02 : il s'est réveillé de 15:27:53 à 15:28:16 (sonde Vinted, messagerie Vinted, Leboncoin et Depop), puis
  plus rien.
- Pendant l'essai et jusqu'à 16:04:43 : 0 job, 0 relevé, 0 `usage_logs`. Le seul relevé de messagerie est celui d'eBay
  à 15:47, venu de la tâche planifiée serveur.

**Essai à blanc** (proxy mort, 16:01) : le parcours complet tourne.

**L'essai** (16:03:11 → 16:04:13, session `steel-browser` locale, rendue).

| Plateforme | Verdict | Détail |
|---|---|---|
| Leboncoin | **FORMULAIRE** (passe) | À 5 s, « Vérification de l'appareil » (cadre DataDome `interstitial`). À 12 et 25 s, « Connectez-vous ou créez votre compte leboncoin » ; cadres anti-fraude de Leboncoin chargés (`fsta.leboncoin.info`, `online-metrix.net`). 612 images en 25 s. |
| Beebs | **GLISSIÈRE** (passe avec vérification) | `/fr/auth` : « Slide right to secure your access ». ID d1a81187-ceed-0a2c-f76f-c8d7001fb40d. Même page à 5, 12 et 25 s. |

Images et bilan, hors dépôt : `fillsell-cloud-proto/essai-steel-oss-0111/variante-webgl/`.

**Fin.**
- 16:04 : conteneur et extension retirés, puis le serveur n° 173977992 supprimé, son IPv4 avec lui. Pare-feu
  n° 11943520 supprimé.
- Relu par l'API : il ne reste que `fillsell-cloud-1`.
- **Coût réel** : ≈ 13 min, facturées 1 heure entamée : 0,1114 + 0,0008 = 0,1122 € HT, soit **0,13 € TTC**. IP déjà
  payée.

**Lecture.**
- Le même Chromium de Debian, avec la même 3D logicielle, passe depuis une machine Hetzner neuve exactement comme Steel
  loué.
- Ni la machine de Steel ni sa « furtivité avancée » ne sont nécessaires. Ce qui bloquait le 30/10, c'était notre
  environnement :
  - Google Chrome, configuré et lancé à notre façon ;
  - ou l'ancien steel-browser sans 3D ;
  - brûlés par les 403.
- Non prouvé : la durée (cookies, jobs, glissières répétées), et l'effet de la langue et du fuseau réels de
  l'utilisateur : l'essai a tourné en UTC et en-US.

### 17.1 Ancien serveur `fillsell-cloud-1` : modèle, prix, contenu (rien supprimé)
- **Modèle** : Hetzner Cloud **cx43** (8 vCPU partagés, 16 Go, 160 Go de disque), Falkenstein (fsn1), n° 168804683,
  créé le 05/10, IPv4 178.105.24.16 (+ IPv6).
- **Prix** : 15,99 € HT + IPv4 0,50 € HT = **16,49 € HT, soit 19,79 € TTC par mois**.
- Le type cx43 est **en rupture** à fsn1, nbg1 et hel1 (API, 15:30 et 16:10). Consigne de Nico : ne pas le supprimer et
  proposer une réinstallation à neuf pour la production.
- **Contenu relu** (lecture seule, 15:48) :

  | Élément | Ailleurs ? |
  |---|---|
  | code déployé (`paquets/`, `deploiement/`, `extension*/`), images Docker | tout se reconstruit depuis le dépôt |
  | `cle-extension-cloud.pem` | même clé que `fillsell-cloud-proto/extension-key.pem` (empreinte de la clé publique identique) |
  | `.env` : SUPABASE_URL, clé de service, IPROYAL_* | empreintes identiques à Supabase ou à `secrets.env` |
  | `.env` : `COFFRE_CLE` (v2) et `TICKETS_CLE` | **seulement sur ce serveur** |
  | 27 captures des essais du 30/10 (`essais/`, 1,4 Mo) | **hors dépôt** ; leurs résultats sont écrits dans le rapport du lot D |
  | profil Chrome du compte de Nico (213 Mo, connexions Vinted et Depop du 30/10) | **seulement ici** |

  - Sans `COFFRE_CLE`, la seule ligne du coffre (session FillSell Cloud de Nico, clé v2) devient illisible ; elle se
    refait quand le Cloud repart.
  - `TICKETS_CLE` se régénère sans perte.
- **Proposition (non faite, attend le feu vert)** : réinstaller le serveur à neuf par l'API Hetzner (`rebuild`,
  Ubuntu 24.04, disque effacé). L'IP et le nom `cloud.fillsell.app` restent, aucun surcoût.
  - Avant : copier les 27 captures dans `fillsell-cloud-proto/archives-ancien-serveur/`.
  - Après : nouvelle `COFFRE_CLE`, ligne du coffre de Nico effacée par un script de réparation (sauvegarde + inverse).
  - Il devient le premier serveur de production (palier 1 ci-dessous).

### 17.2 Plan de serveurs stable, du 1er au 50e abonné Cloud (à faire seulement si l'endurance de 48 h passe)
Règles :
- catalogue normal seulement, lu le 01/11 vers 16:10 ;
- coûts TTC sans récupération de TVA ; IP IPRoyal 4,64 € par abonné ;
- ce qui reste = 14,40 € (Stripe) ou 10,50 € (Apple) − coût par abonné ;
- capacité **estimée** à ≈ 1 Go de mémoire par navigateur (05/10 : 13 sur cx43). À mesurer pendant l'endurance de 48 h.

| Abonnés | Serveurs | Utilisateurs par serveur | € TTC / mois | Coût par abonné (bas → haut du palier) | Reste Stripe | Reste Apple |
|---|---|---|---|---|---|---|
| 1 à 10 | cx43 existant, réinstallé | 10 | 19,79 | 24,43 (1) · 11,24 (3) · 8,60 (5) · **6,62 (10)** | − 10,03 → **+ 7,78** | − 13,93 → **+ 3,88** |
| 11 à 16 | cx43 + 1 cpx32 (4 vCPU, 8 Go, **disponible**) | 10 + 6 | 62,98 | 10,37 (11) → 8,58 (16) | + 4,03 → + 5,82 | + 0,13 → + 1,92 |
| 17 à 22 | cx43 + 2 cpx32 | 10 + 6 + 6 | 106,17 | 10,89 (17) → 9,47 (22) | + 3,51 → + 4,93 | − 0,39 → + 1,03 |
| 23 à 50 | cx43 + **AX42** dédié (Ryzen 7 PRO 8700GE 8 c / 16 f, 64 Go, au catalogue) ; les cpx32 sont rendus | 10 + 40 | 138,59 + 58,80 une fois | 10,67 (23) · 9,26 (30) · 8,10 (40) · **7,41 (50)** | + 3,73 → + 6,99 | − 0,17 → + 3,09 |

- **Seuils** : rentable dès 3 abonnés Stripe ou 4 Apple. Passé ce démarrage, seuls deux creux restent légèrement négatifs côté Apple, au
  17e et au 23e abonné (− 0,39 € et − 0,17 €).
- **Passage aux dédiés : au 23e abonné.** C'est le moment où un 3e cpx32 (149,36 €) coûterait plus que l'AX42 + cx43
  (138,59 €).
  - Il faut commander l'AX42 quelques jours avant (API Robot ; mise en service 58,80 € TTC une fois), puis l'installer
    avec le même déploiement et le même pare-feu.
  - **Migration** : seulement les ≤ 12 abonnés des cpx32 ; les 10 du cx43 restent.
    - Pour chacun, la nuit : arrêt de son navigateur, copie de son profil (≈ 0,2 Go), redémarrage sur l'AX42 avec la
      **même IP IPRoyal**. Coupure ≈ 2 min par abonné, sans reconnexion normalement.
    - Risque : la machine vue change (nombre de cœurs). Leboncoin ou Beebs peuvent redemander une glissière, que
      l'abonné passe dans « Me connecter » (notification).
- **À construire avant le 11e abonné** : la répartition des comptes entre plusieurs serveurs.
  - Le schéma note déjà le serveur de chaque compte (`cloud_postes.serveur`).
  - Mais l'orchestrateur sert tous les comptes autorisés, et l'app ne connaît qu'une adresse (`cloud.fillsell.app`).
- **Au-delà de 50** : un 2e AX42 (40 de plus) ; même migration, ou pas de migration si les nouveaux y vont directement.
- Disponibilité :
  - cx43 et cx53 en rupture : on garde l'existant, on n'en rachète pas ;
  - cpx32 et cpx42 disponibles à fsn1, nbg1, hel1 ;
  - AX42 au catalogue et commandable par l'API Robot, qui ne publie pas de stock.

**Plan B si Hetzner manque de stock** (catalogue normal, France ; chaque nouvelle machine passe d'abord le même essai à
0,40 €) :

| Rôle | Offre | Prix lu le 01/11 | Disponibilité lue | Coût par abonné |
|---|---|---|---|---|
| petits paliers | **OVHcloud VPS-3** (6 vCores, 12 Go, 100 Go NVMe ; Gravelines, Strasbourg, Roubaix) | 12,24 € HT sans engagement → 14,69 € TTC | catalogue public (stock non publié pour les VPS) | ≈ 8 abonnés : 6,48 € |
| dédié | **OVHcloud RISE-M** (Ryzen 9 9900X 12 c / 24 f, 64 Go DDR5, 2 × 512 Go NVMe) | 99,99 € HT/mois + 99,99 € HT d'installation → 119,99 € TTC + 119,99 € une fois | **Gravelines et Roubaix : « 1H-high »** (livrable en 1 h, stock élevé), API de disponibilité OVH | ≈ 50 abonnés : 7,04 € |
| dédié, plus petit | OVHcloud RISE-S (Ryzen 7 9700X, 64 Go) | 64,99 € HT + 64,99 € HT → 77,99 € TTC | Gravelines « 1H-low » (peu de stock) | ≈ 40 : 6,59 € |

- Les VPS d'OVH reviennent même moins cher que les cpx de Hetzner pour les petits paliers. Mais **rien n'y est essayé**
  : la machine ne se voit pas derrière le proxy, mais son nombre de cœurs, si.
- Conditions d'OVH à relire avant toute commande.
- Écarté : Scaleway Instances (Paris), PRO2-S 8 vCPU / 32 Go à 163 € HT/mois, trop cher. Elastic Metal EM-A610R
  (Ryzen 3600, 32 Go, 0,11 € HT/h) : stock illisible sans compte.

## 18. Le vrai produit en place, et l'essai de 48 h sur le compte de Nico (01/11, 17:20 → 19:35)
**Décision de Nico (01/11, après le § 17)** : pas d'essai de labo. Toute la mise en place du Cloud est codée, et l'essai
de 48 h tourne sur le vrai produit, sur son compte seul. Son poste reste sur ARRÊT ; rien n'est ouvert aux autres
comptes ; aucun achat.

### 18.1 Le serveur `fillsell-cloud-1` réinstallé à neuf
- **Mis à l'abri d'abord** :
  - les 27 captures du 30/10, dans `fillsell-cloud-proto/archives-ancien-serveur/essais-3010/` (empreintes identiques) ;
  - `COFFRE_CLE` version 2, dans `secrets.env` (empreinte identique, jamais affichée). Le profil Chrome de Nico est
    parti avec le disque (son accord).
- **Réinstallation** Hetzner « rebuild » Ubuntu 24.04, même IP 178.105.24.16 (action n° 665204541330960, finie à 17:55).
  Socle posé par `serveur-cloud/outils/installer-serveur.sh` (Docker 29.1.3, ufw 22/80/443, pare-feu au démarrage).
  Pare-feu Hetzner n° 11738181 inchangé (entrée 22/80/443).
- **Navigateur** : `ghcr.io/steel-dev/steel-browser@sha256:b5bd99de…`, lancé mot pour mot comme l'essai du § 17
  (`src/navigateur.js` : `LANCEMENT_AVEC_ECRAN`, `ENV_ESSAI_0111`, session de l'essai). Seul ajout : `persist`, qui garde
  le profil du compte sur le disque. Plus d'image dérivée.
- **Pare-feu des navigateurs** : sortie vers `81.181.239.136:12323` seulement (`deploiement/proxys-permis.txt`). Il est
  reconstruit sans fenêtre ouverte, et l'orchestrateur refuse tout navigateur sans la preuve qu'il est posé depuis ce
  démarrage (`etat/pare-feu.json`, numéro de démarrage).
- **Relu après déploiement** : règles iptables exactes, preuve conforme, clé du coffre identique (v2), image épinglée.
- **Correction du § 17 (fuseau)** :
  - steel-browser règle le fuseau de la session d'après l'IP du proxy, en passant par ce proxy.
  - L'« UTC » noté au § 17 venait de la vérification sans réseau.
  - L'essai réel, comme le produit, tourne en heure de Paris ; la langue reste en-US.

### 18.2 Ce qui est codé
| Demande de Nico | Où | État |
|---|---|---|
| « Me connecter » par plateforme, page de connexion seule, en direct, format mobile, sans barre ni navigation ni zoom | `serveur-cloud/src/connexion.js`, `src/cloud/MeConnecterCloud.jsx` (05/10 → 30/10) ; 01/11 : images en 2× au plus (plus fluides), bouton « Connecter mes plateformes » | en place |
| DataDome résolu par Nico dans ce même écran | même écran : les cadres (glissière) passent, ses gestes sont rejoués ; aucun résolveur | en place |
| Connexions chiffrées chez nous, session FillSell posée par le serveur | `coffre.js` (AES-256-GCM, clé v2), `sessionFillsell.js` | en place |
| Drapeau Cloud par compte, comme `ebay_voie_api` | `profiles.cloud_voie` (migration 20261101180000, feu vert nommé de Nico, appliquée avant la réinstallation) ; `get-pending-jobs` v318 + `_shared/cloud-voie.js` : l'ordinateur d'un compte au drapeau levé ne reçoit plus aucune tâche Vinted, Leboncoin, Beebs, Depop | en place, ton compte seul |
| Prise de tâche atomique | `prendre_job` (29/10, prouvée sur 200 tâches et 16 connexions), utilisée par `update-job-status` v163 pour le poste Cloud | en place |
| Ventes 24 h/24 au rythme de l'extension | le navigateur tourne en continu ; la copie Cloud de l'extension fait sa ronde et ses relevés comme au bureau | en place |
| Écran de l'état par plateforme, et demande de reconnexion | écran « Me connecter » (état par plateforme) ; 01/11 : bandeau `BandeauCloudReconnexion.jsx` quand une connexion tombe (OTA 2.9.147) | en place |

**Ajouts du 01/11** :
- **Verrou des plateformes** : une plateforme où le compte n'est pas connecté n'est jamais visitée.
  - Premier verrou, dans l'orchestrateur : une interception DevTools du navigateur entier, sur les seules plateformes
    fermées. Il a arrêté à 18:54, 18:55 et 18:56 les trois pages que l'extension a ouvertes avant toute connexion
    (www.vinted.fr, www.leboncoin.fr, www.beebs.app) : `ERR_BLOCKED_BY_CLIENT`, aucune réponse.
  - Second verrou, dans la copie Cloud de l'extension : `fetch` du service worker, onglets et fenêtres refusent une
    plateforme sans cookie de connexion. Il s'était déjà déclenché 10 fois à 19:17.
  - Journal du navigateur : 4 requêtes vers une plateforme depuis sa création, 4 arrêtées, 0 réponse.
  - La messagerie, elle, a cherché un onglet ouvert, n'en a pas trouvé et n'a rien demandé (« injection_impossible »).
- **Copie neuve de l'extension** : Chrome gardait l'ancien script de fond en cache dans le profil (même numéro de
  version que le parc). L'empreinte de la copie est désormais notée dans le profil, et le cache est effacé quand elle
  change.
- **Essai de 48 h** (`src/endurance.js`, `ENDURANCE=1`) :
  - toutes les 10 min : mémoire de chaque navigateur et du serveur, connexions par plateforme, tâches du Cloud, dans
    `etat/endurance/mesures.jsonl` ;
  - arrêt automatique au premier blocage, avec sa nature dans `etat/endurance/arret.json` : DataDome bloqué, glissière
    dans un onglet de travail, vérification qui dure plus de 3 min, ou tâche refusée par l'anti-robot. Ensuite, plus
    aucune ouverture.
  - Bilan : `outils/endurance-bilan.mjs`.

### 18.3 La mise en place sur le compte de Nico
- IP 81.181.239.136 entrée au pool à 18:51 (`ip.mjs ajouter 87004978`). Contrôle d'entrée à 18:52 : FR, sortie conforme,
  aucune liste noire, aucune plateforme visitée.
- `scripts/reparations/20261101_cloud_essai48h_nico.sql` à 18:53 (sauvegarde `_backup_0111_cloud_essai48h`, inverse
  prêt) :
  - rotation coupée ;
  - 81.181.239.136 attribuée à Nico (`attribuee_client`) ;
  - `cloud_voie = true` sur son compte, le seul compte au drapeau levé.
- `COMPTES_AUTORISES` = Nico. Navigateur ouvert à 18:53:33, 10 s après.
- Vérifié sans plateforme (`outils/verifier-navigateur-cloud.mjs`) :
  - Chrome/156.0.8078.73 ;
  - WebGL « ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)…)) », le même que l'essai ;
  - 1920×1080, en-US, Europe/Paris, 8 cœurs, `webdriver` faux ;
  - verrou posé, les quatre plateformes fermées.
- `get-pending-jobs` v317 → **v318** à 18:50 (`verify_jwt` vrai, relu avant et après ; prod v317 = dépôt avant
  déploiement). Parc relu : 43 postes vus en 3 min, toutes les réponses en 200.
- OTA **2.9.147** à 19:30 sur production (somme de contrôle compatible) :
  - le diff de l'app depuis la 2.9.146 ne porte que le bandeau, monté derrière `cloudConnexionVisible`, et des
    fichiers Cloud ;
  - la preuve d'identité garde 4 échecs, que l'OTA déjà servie 2.9.140 → 2.9.146 a aussi : l'outil du 05/10 compare
    App.jsx à la fusion ;
  - le rendu des comptes ordinaires est identique.
- Autotests : suite complète **516 / 0 rouge** (18:33 → 18:47, puis 19:01 → 19:14) ; serveur-cloud 52/52 ;
  cloud-extension 44/44 ; cloud-voie 16.

### 18.4 L'essai de 48 h
- **Le seul geste de Nico** : dans l'app, Réglages › Abonnement › FillSell Cloud › « Connecter mes plateformes ».
  - Puis Vinted, Leboncoin, Beebs et Depop, l'un après l'autre.
  - Il résout lui-même la glissière si elle s'affiche, puis appuie sur « J'ai fini ».
  - Les 48 h partent de sa première connexion.
- **Mesuré par le serveur seul** : aucune surveillance en boucle dans une session. Le bilan se lit au retour de Nico
  (`docker compose exec -T orchestrateur node outils/endurance-bilan.mjs`).
- **Inverse en fin d'essai** (sur décision de Nico) : `20261101_cloud_essai48h_nico_INVERSE.sql`, puis
  `COMPTES_AUTORISES` remis à un compte fictif.

### 18.5 « Connecter mes plateformes » ne faisait rien sur iPhone (19:38) → corrigé, OTA 2.9.148 (20:12)
- **Constat de Nico** (iPhone, Réglages › Abonnement, carte « Active ») : aucun écran, aucun message, aucune trace dans
  `usage_logs` (aucune n'existait pour ce geste).
- **Cause** : la page Réglages est un portail sur `document.body` (plan 400) ; « Me connecter » était rendu dans
  `.app-root`. Sous iOS, WKWebView peint les couches fixes de `.app-root` dans sa propre couche, plan ou pas : l'écran
  s'ouvrait, DERRIÈRE les réglages (même famille que les « lignes mortes » décrites dans `src/reglages/ReglagesUI.jsx`).
- **Règle corrigée** : une couche Cloud ouverte depuis Réglages est un portail sur `document.body` (« Me connecter », la
  modale des conditions ; sans `document`, rendu direct pour les autotests). `selftest:cloud-me-connecter` (17).
- **Traces dans `usage_logs`** :
  - `cloud_me_connecter_clic`, avec l'origine (Réglages, bandeau ou achat, tous par `ouvrirMeConnecter`) ;
  - `cloud_me_connecter_muet` : écran non monté 1,5 s après le clic ;
  - `cloud_me_connecter_ouvert` {visible}, et `cloud_me_connecter_cache` {devant} quand une autre couche le cache ;
  - `cloud_me_connecter_erreur` : lecture des connexions ratée ;
  - `cloud_connexion_ouverte` et `cloud_connexion_fin` {plateforme, étape, message} pour chaque connexion.
- **Textes** : la carte et les écrans Cloud nomment les quatre plateformes (Vinted, Leboncoin, Beebs, Depop). La règle
  « jamais Beebs » du 05/10 est levée dans les autotests (décision de Nico) ; « Vinted et Leboncoin » seuls est
  désormais refusé.
- **Vérification** :
  - Fabriquer une session au nom de Nico pour piloter l'app a été REFUSÉ par le garde-fou de sécurité (usurpation
    d'identité) ; aucun contournement.
  - À la place, la vraie page Réglages et le vrai écran ont été montés sur un banc à base factice, dans WebKit au format
    iPhone 13. Avant le correctif : écran dans `.app-root`. Après : enfant de `body`, devant au centre, trace
    « ouvert, visible ».
  - Le paquet 2.9.148 contient le portail (`createPortal(…, document.body)`) et les 5 traces.
  - Preuve d'identité : 708 scènes identiques pour les comptes ordinaires.
  - Suite complète 517 / 0 rouge.

## 19. L'essai de connexion du 01/11 au soir (21:00 → 21:23) : 5 problèmes, corrigés à la racine (01/11, 21:30 → 22:40)
Nico a connecté ses plateformes depuis l'app (iPhone, OTA 2.9.148). Sources lues : `usage_logs` (`cloud_connexion_*`),
journal de l'orchestrateur, `cloud_connexions`, `cloud_coffre`, `profiles.extension_postes` (poste Cloud a958154e).

### 19.1 Ce que disent les traces (heure de Paris)
| Plateforme | Ouvertures | Ce qui s'est passé | Verdict |
|---|---|---|---|
| Vinted | 20:59:13 | « connecté » à 21:00:46 (95 s) ; à 21:26:46 la sonde de l'extension Cloud lit `/api/v2/users/current` → **200**, compte **250623918** (nelsonchatnoir, le même que son poste) | **vraiment connecté** |
| Leboncoin | 21:00:54, 21:01:40, 21:02:53, 21:04:32, 21:05:41 | 1re et 3e fermées par « client parti » (28 s, 80 s : l'app quittée, la page fermée avec) ; « connecté » à 21:05:31 sur le seul cookie `__Secure-Login`, en pleine vérification du téléphone, fenêtre fermée 1,5 s après ; 21:05:44 : « connecté » en 3 s (cookie déjà là) | **faux** : jamais lu |
| Beebs (Google) | 21:05:59, 21:12:21, 21:16:17 | refusés par NOTRE liste : `accounts.google.fr/accounts/SetSID` (21:14:34) puis `babytouch-782e4.firebaseapp.com/__/auth/handler` (21:15:35, 21:16:27) → la fenêtre Google fermée net, Beebs « Une erreur est survenue » | jamais connecté |
| Depop | 21:17:18, 21:22:42 | 1re fermée 14 s après (« client parti ») ; 2e : cookie `access_token` 12 s après l'ouverture (Google déjà connecté dans le navigateur depuis l'essai Beebs), « connecté » ; Depop renvoie vers `/fr/` — REFUSÉ 3 fois par notre liste : c'est la page d'erreur que Nico a vue | **faux** : jamais lu |
| eBay | — | l'écran Cloud lisait l'enveloppe `{ etat }` de `ebay-account` au lieu de `etat` : « à relier » pour tout compte, bouton « Relier eBay » (connexion eBay dans Safari) alors que l'API est reliée (`ebay_voie_api` vrai) | affichage faux |

En plus : `cloud_connexions` refuse « depop » (contrainte à 3 plateformes) : les deux connexions Depop n'y ont aucune
ligne, sans bruit.

### 19.2 Les causes, et la règle corrigée
1. **Faux « connecté »** — la règle était « cookies d'identité présents = connecté », à la sonde (toutes les 2 s) ET à
   chaque sauvegarde du navigateur (10 min). Règle (Nico) : **connecté = le compte LU par le serveur**, dans la page de
   connexion revenue sur le site de la plateforme (`plateformes.js`, `expressionLectureCompte`, les lectures que
   l'extension fait déjà) :
   - Vinted `/api/v2/users/current` (200 + identifiant) ;
   - Leboncoin `api.leboncoin.fr/api/account/v2/members/me/account` (jeton `luat` de la page) ;
   - Beebs : session Firebase de la page, non anonyme, vérifiée par Google (`identitytoolkit … accounts:lookup`) ;
   - Depop `webapi.depop.com/presentation/api/v1/users/me/` (jeton de la page).
   Hors du site (page Google, `auth.leboncoin.fr` pendant le téléphone) : rien n'est lu, la page dit « termine les
   étapes demandées ». Une sauvegarde ordinaire ne fait plus que rafraîchir une connexion déjà connue (« non_verifiee »
   sinon) ; seule une connexion connue revient du coffre ; une plateforme non connectée n'a plus aucune session dans le
   profil (cookies échus, stockage de page effacé, l'appareil DataDome gardé).
2. **La fenêtre fermée en pleine vérification** — deux causes : la fermeture automatique 1,5 s après le cookie, et la
   page fermée dès que le téléphone se déconnecte (iOS coupe tout quand on quitte l'app pour lire le SMS ou le courriel).
   Désormais : compte vérifié → « vérifié », la page RESTE ouverte (étape du téléphone à finir) jusqu'à « J'ai fini » ;
   l'app quittée → la page attend 5 min (`REPRISE_MS`) et l'app la reprend au retour (`visibilitychange`), même page,
   même étape (`cloud_connexion_reprise`).
3. **Beebs avec Google** — ni fenêtre bloquée ni cookies tiers : notre propre liste de navigation refusait deux étapes de
   la connexion Google. Permis désormais : `accounts.google.<pays>` (SetSID), les écrans de sécurité Google
   (`gds.google.com/web/`), les seuls chemins `/__/auth/` des gestionnaires Firebase (Beebs, et toute plateforme sur
   Firebase, pour Google, Apple, Facebook), et le **retour déclaré** : le `redirect_uri` qu'une page de connexion d'un
   fournisseur porte (choisi par la plateforme, validé par le fournisseur) devient permis, chemin exact, pour ce
   « Me connecter ». Après la vérification, une page refusée ne renvoie plus à la connexion (aucune boucle). Depop :
   `/fr/` permis.
4. **La touche effacer** — le rejeu efface (mesuré dans Chromium : keyDown Backspace → « bonjour mond »). C'est le
   téléphone qui n'envoyait rien : le champ caché était VIDE, et iOS n'émet aucun événement pour effacer dans un champ
   vide. Prouvé dans WebKit au format iPhone 13 : avant, « ab » puis 2 × effacer → seulement « a », « b » envoyés ; après,
   les 2 effacements partent. Le champ garde un remplissage fixe (curseur au milieu), chaque saisie est annulée et
   rejouée ; effacer un mot, à droite, jusqu'au début de la ligne, flèches, début, fin passent ; le serveur rejoue le
   clavier dans une file (jamais deux frappes entrelacées).
5. **eBay** — lu dans `etat` ; relié par l'API : « Relié par l'API eBay », aucun bouton ; pas relié : la connexion
   officielle (`ebay-oauth-start`), jamais le navigateur. Et le navigateur Cloud intercepte TOUJOURS eBay (et Opla),
   quelles que soient les plateformes permises : aucune page eBay n'y est joignable.

### 19.3 Les 48 h
Elles ne comptent qu'à partir de connexions vérifiées : chaque connexion vérifiée est notée (`connexion_verifiee`, journal
de l'essai) ; le bilan part de la première après la dernière remise à zéro (`outils/endurance-remise.mjs`,
`decompteEssai`) et donne l'heure de chaque plateforme. Rien d'avant la remise ne compte.

### 19.4 Mis en production (heure de Paris)
- **Code** : 6eb3802 (serveur-cloud 62/62, `selftest:cloud-me-connecter` 34, suite complète **517 / 0 rouge**, build
  d'essai vert, aucune erreur de lint nouvelle). Poussé sur `main` par le terminal fill-and-sell-07 à la demande de Nico.
- **22:27:31** orchestrateur arrêté proprement (navigateur fermé et sauvegardé).
- **22:28** `scripts/reparations/20261101_cloud_faux_connectes_nico.sql` (sauvegarde `_backup_0111_cloud_faux_connectes`,
  4 lignes ; inverse prêt) : lignes `leboncoin` et `depop` sorties du coffre de Nico, les 2 connexions Leboncoin
  « connectee » de 21:05 → « abandonnee » (`non_verifiee_0111`). Relu : coffre = `vinted` + `fillsell`.
- **22:28:26** orchestrateur **6eb3802** déployé (`deployer.sh`, copie Cloud de l'extension inchangée : 0.6.164-cloud,
  BUILD_ID 2026-11-01T18:00:51Z+dd69fbb ; pare-feu des navigateurs rejoué). **22:28:33** navigateur rouvert :
  `sessions_purgees` Leboncoin, Beebs, Depop — 57 cookies échus (appareil DataDome gardé), stockage de page effacé
  (repli « page vierge » : la session du navigateur steel répond « Internal error » à `Storage.clearDataForOrigin`,
  comme mesuré dans Chromium). Verrou : `permises = [vinted]`.
- **22:28:49** remise à zéro de l'essai (`endurance-remise.mjs`) : bilan à zéro, aucune connexion vérifiée encore.
- **22:35** OTA **2.9.149** sur production (build 2026-11-01T21:35:34Z+f4bb7c6, somme de contrôle compatible) ; relu
  sur le canal. Contenu vérifié dans le paquet (remplissage du clavier, `cloud_connexion_reprise`, `cloud_connexion_verifiee`,
  « Relié par l'API eBay », `etat ?? null`). Preuve d'identité : 708 scènes identiques pour les comptes ordinaires ;
  4 échecs : les 3 connus de l'outil du 05/10 (ConditionsCloudModale, EncartCloudBientot, empreinte d'App.jsx) et le
  périmètre (les 3 fichiers Cloud modifiés + `_shared/publication-programmee.js` de 552398e, ajout sans effet côté app,
  déjà servi par le serveur et le web).
- Poste de Nico : toujours sur ARRÊT (dernier signe 15:27:53). Poste Cloud vivant (22:35:32).
- **Aucun essai réel** de ma part sur une plateforme : la lecture du compte se prouve à la reconnexion de Nico. Si une
  lecture échoue alors qu'il est connecté, la page dit « Termine les étapes… » (jamais un faux « connecté ») et le
  journal porte `connexion_compte_non_lu` {http, motif}.
- **En attente du feu vert nommé de Nico** : `supabase/migrations/PROPOSITION_20261101_cloud_connexions_depop.sql.txt`
  (Depop dans `cloud_connexions`).

## 20. Premier essai réel (01/11, 23:01) : l'exécutant arrêté sans rien dire, Beebs jamais vu connecté (01/11, 23:10 → 02/11, 01:00)
Nico a vérifié ses 4 connexions entre 22:53 et 22:57 (Leboncoin, Beebs, Depop ; Vinted déjà là), puis lancé à 23:01 la
republication des « Gants de ski Quechua » sur 4 plateformes. À 23:05, rien n'avait été pris.

### 20.1 Ce qui s'est passé (journal du navigateur steel, heure de Paris)
- 22:53:35 Leboncoin vérifié (compte lu, 200). 22:53:55 l'extension Cloud ouvre son onglet de travail Leboncoin
  (`#fillsell-worker`) ; 22:54:06 `api.leboncoin.fr/api/account/v2/members/me/account` → **403**, et DataDome pose une
  **glissière** (`geo.captcha-delivery.com/captcha/`, t ≠ bv) dans cet onglet. La même lecture avait rendu 200 31 s plus
  tôt dans la page « Me connecter » (visible, touchée par Nico) ; dès 22:53:35, `can-access-chat` rendait déjà 403.
- 22:57:23 (premier relevé sans « Me connecter » ouvert) : la règle de l'essai — arrêt au premier blocage — a arrêté
  TOUT l'exécutant (navigateur fermé, `arret.json`), sans rien en dire à l'app, qui montrait « En pause : il repart dès
  qu'une tâche attend ». Les 4 republications de 23:01 sont restées « pending ».
- **Ce n'était pas un plantage** : un arrêt voulu par la règle, mais trop large (une plateforme arrêtait les quatre) et muet.

### 20.2 La règle corrigée (810419b), déployée à 23:40
- **Un blocage n'arrête que SA plateforme** : plus aucune requête vers elle (verrou), ses onglets de travail fermés, sa
  ligne du coffre « en vérification » (connecte faux : get-pending-jobs ne sert plus ses tâches au Cloud, l'app demande
  « Me reconnecter » ; la session reste chiffrée au coffre et n'est jamais purgée). Les autres plateformes continuent.
  Une connexion vérifiée (« Me connecter ») la rouvre. Le même geste vaut pour une tâche refusée par l'anti-robot (une
  fois par tâche). L'arrêt total ne reste que pour un blocage sans plateforme connue, et il s'écrit dans `cloud_postes`
  (erreur `arret_essai:…`). Au redémarrage, l'`arret.json` de 22:57 est devenu le blocage de Leboncoin seul (rangé en
  `arret-2026-11-01T21-57-23-350Z.json`).
- **L'app le dit** : signe de vie de l'exécutant toutes les 10 min (`cloud_postes.derniere_activite`) ; bandeau
  « FillSell Cloud est arrêté (à HH:MM) » quand il est éteint depuis plus de 5 min, arrêté par l'essai, ou muet depuis
  plus de 25 min ; la carte de l'exécutant ne dit plus « en pause, il repart » quand il est arrêté ; le bandeau des
  plateformes dit aussi « résous la vérification demandée ».
- **Les 48 h ne comptent que les heures de MARCHE** de chaque plateforme : navigateur ouvert, plateforme connectée et
  pas en vérification, jamais un trou de plus de 15 min entre deux mesures (`decompteEssai`, `endurance-bilan.mjs`).
- Sauvegarde de la ligne Leboncoin du coffre avant son passage en vérification :
  `scripts/reparations/20261101_cloud_lbc_verification_nico.sql` (+ inverse).

### 20.3 Les 4 republications (heure de Paris)
| Plateforme | Pris | Résultat | Durée |
|---|---|---|---|
| Vinted | capture 23:41:08, recréation 23:41:39 | **republiée 23:42:40** (étape recreated) | 2 min 29 s après le redémarrage (23:40:11), 61 s de geste |
| Depop | capture 23:42, retrait ~23:45, recréation 23:49:14 | **republiée 23:49:27** | ≈ 7 min (pause voulue entre retrait et redépôt) |
| Leboncoin | — | **retenue** par la règle Leboncoin de l'app : « Accès temporairement restreint » depuis 22:54 (le 403 de l'onglet de travail), TOUTES les actions Leboncoin en pause ; un essai par jour, ou « Leboncoin remarche » | — |
| Beebs | jamais commencée | voir 20.4 | — |
- 23:53, Nico : « Leboncoin déconnecté » (bandeau, OTA 2.9.149 : texte d'avant) ; « Me reconnecter » → **vérifié en 4 s**
  (23:55:07, compte lu 200, sans rien retaper : la session gardée) → Leboncoin rouvert par le Cloud ; sa tâche reste
  retenue par la pause Leboncoin (règle de l'app, inchangée).

### 20.4 Beebs : la copie Cloud de l'extension ne voyait pas sa session (cause trouvée le 02/11 vers 00:00)
- Aucune requête Beebs depuis le redémarrage ; la capture rendait « lecture_impossible » ; le second verrou (dans la
  copie Cloud) disait Beebs « fermée » et avait refusé 14 visites.
- Lu dans le navigateur : les jetons de Beebs (`access_token`, `refresh_token`, `www.beebs.app`) sont posés SANS
  « Secure » depuis une page https (secure faux, sourceScheme « Secure »). Dans Chromium 156, `chrome.cookies.getAll`
  (par domaine OU par adresse) ne les rend PAS ; `chrome.cookies.get({ url, name })` les rend. Le verrou ne lisait que
  `getAll` : Beebs, pourtant connectée et vérifiée par le serveur, n'a jamais été joignable par l'extension Cloud.
- Correctif : chaque cookie de connexion se lit aussi par son adresse (www, le domaine, auth.) —
  `scripts/cloud/build-extension-cloud.mjs`, `selftest:cloud-extension` 47. Copie Cloud reconstruite depuis la MÊME
  source servie (dd69fbb, 0.6.164 — la 0.6.165 du parc n'y entre pas) : seule la lecture du verrou change.

- 00:15:44 copie Cloud **2026-11-01T23:02:16Z+dd69fbb-cloud** en place (cache du script de fond vidé) ; verrou : Beebs « ouverte »,
  0 refus. 00:29 capture, 00:31:30 retrait, **00:40:03 Beebs republiée** (annonce 34280542, l'ancienne 34239821 retirée) :
  ≈ 11 min dont la pause voulue entre retrait et redépôt, 48 s de redépôt.

### 20.5 Le compteur des 48 h, après ce soir
- Vinted n'avait pas de connexion vérifiée depuis la remise à zéro (connectée avant la règle « compte lu », Nico ne l'a
  pas refaite) : une tâche du Cloud PUBLIÉE vaut preuve (`connexion_verifiee`, preuve « tache_publiee », 23:42:40).
- Leboncoin est compté hors de ses heures de pause de l'app (`platform_settings.leboncoin.blocage_acces` posé, pas levé).
- Bilan : `docker compose exec -T orchestrateur node outils/endurance-bilan.mjs` (heures comptées par plateforme,
  plateformes en vérification, blocages).
- **Bilan à 01:17** (après 9fb9d2c et le correctif suivant) : Vinted 1,6 h comptées (depuis sa republication de 23:42:40),
  Beebs 1,7 h, Depop 1,7 h, Leboncoin **0 h** (pause de l'app depuis 22:54, datée par son début) ; exécutant 2 h de marche.
  ⚠️ Les heures Beebs de 22:55 à 00:15 sont comptées alors que l'extension Cloud ne pouvait pas la joindre (défaut du
  verrou, corrigé à 00:15) : une remise à zéro propre est possible sur décision de Nico.

### 20.6 Point 4 de Nico : « un retrait sur 5 plateformes, 4 republications sans eBay »
Ni une erreur de bouton ni une tâche perdue : la feuille « Republier » ne propose jamais eBay (règle de l'app depuis le
17/09, `utils/republication.js` : « eBay reste HORS republication »). L'article est en ligne sur 5 plateformes ; la feuille
en a proposé 4 et a créé 4 republications, comme elle le devait. Le défaut : elle ne dit pas pourquoi eBay n'y est pas
(proposé à Nico : une ligne « eBay : ton annonce reste en ligne telle quelle »).

### 20.7 Leboncoin : ce que ce soir prouve
Sur ce serveur (steel-browser, 3D logicielle), la page de connexion visible passe (formulaire, code SMS, compte lu 200
à 22:53:35 et à 23:55:07), mais l'onglet de travail de l'extension prend un 403 de l'API et une glissière DataDome 31 s
après la connexion. Leboncoin a ensuite restreint l'accès du compte (règle de l'app : tout Leboncoin en pause, un essai
par jour). C'est le premier blocage réel de l'essai : à trancher par Nico (attendre l'essai automatique de 24 h, ou
« Leboncoin remarche » — qui refera une requête depuis l'IP du Cloud).


## 21. « Résoudre la vérification », profil français, compteur Beebs, eBay dans « Republier », journal Depop (02/11, 10:00 → 11:35)
Demande de Nico (02/11 matin), cinq points : (1) une vérification anti-robot soluble à la main se résout depuis l'app
— « Résoudre la vérification » rouvre la page du navigateur Cloud où elle s'affiche, dans la vue de « Me connecter » ;
la personne fait glisser, UNE requête légère confirme, la plateforme reprend seule ; jamais de résolution automatique ni
de service tiers ; seule la plateforme concernée en pause ; vérification revenue aussitôt = on s'arrête et on le
remonte ; « vérification à résoudre » (bouton) ≠ « accès restreint sans vérification » (attente) ; rien ne change pour
l'extension sur un PC ; essai réel sur Leboncoin tout de suite. (2) Profil du navigateur Cloud en français, Europe/Paris.
(3) Remise à zéro du compteur des 48 h pour Beebs SEULE. (4) La ligne « eBay : ton annonce reste en ligne telle
quelle » dans « Republier ». (5) La migration Depop du journal des connexions (feu vert donné).

### 21.1 La nuit du 01 au 02/11 (journal du serveur, heure de Paris)
- **04:56:46** Leboncoin : une page Leboncoin du navigateur (rafraîchissement silencieux de session, puis
  `api.leboncoin.fr/api/messaging-items-api/v3/conversations`) → **403** et glissière DataDome (`t=fe`, referer = cette
  API) ; relevé à 04:57:37 → **Leboncoin seul** en vérification (verrou, 1 onglet fermé, coffre). La pause Leboncoin de
  l'app (depuis 22:54) tenait encore.
- **05:14:47** Beebs : `www.beebs.app/fr/account/orders/list/seller` (veille des commandes) → **403**, vérification de
  l'appareil DataDome, puis glissière ; relevé à 05:15:38 → **Beebs seule** en vérification.
- Vinted et Depop ont continué (verrou : depop, vinted ; aucun refus d'une tâche). La règle d'hier soir (« un blocage
  n'arrête que sa plateforme ») a tenu.

### 21.2 La règle (serveur-cloud/src/verifications.js, toujours active — plus seulement pendant l'essai)
- Les cadres DataDome des onglets de travail, chaque minute, hors « Me connecter » ; une vérification vue n'arrête que
  sa plateforme (inchangé) et garde désormais la page où elle s'est affichée (`referer`).
- **Deux états pour la personne**, publiés dans `platform_settings.<plateforme>.cloud_verification` (lu par l'app) :
  `a_resoudre` (glissière, vérification de l'appareil qui dure, tâche refusée par l'anti-robot) → bouton ;
  `restreint` (DataDome `t=bv`, refus sans glissière, pause Leboncoin de l'app) → aucun bouton, UN essai au bout de 24 h
  (page de fond, une lecture : passée → rouverte ; glissière vue → `a_resoudre` ; refusée → 24 h de plus) ;
  `revenue` (revenue dans les 30 min qui suivent sa résolution, ou accès encore refusé juste après la glissière) →
  arrêtée, aucun bouton, alerte à l'équipe (alertes.js : cloud_pool_alertes + support).
- **« Résoudre la vérification »** (connexion.js, mode `resoudre`) : la même vue que « Me connecter » ; la page où la
  vérification s'est affichée (son referer sur le site, sans ancre de travail), ou une page du compte si elle venait
  d'une API (Leboncoin : « Mes annonces », qui refait ses requêtes) ; la page est lue SANS réseau toutes les 2 s (cadre
  DataDome présent ou non) ; la lecture d'accès part la glissière faite (Vinted, Leboncoin, Depop : la lecture du compte,
  l'adresse même que l'anti-robot protège ; Beebs : la page en HEAD) — au plus deux lectures en tout. Passée → coffre
  connecté (session gardée, vérifiée), verrou rouvert, blocage résolu, tâches libérées, et pour Leboncoin la pause de
  l'app levée comme par son essai réussi (reprise prudente 6 h, règle de l'app inchangée).
- **Seule la page de résolution joint la plateforme** : exception du verrou par CADRE (navigateur.js, `requetePermise`) —
  la page et ses sous-cadres, plus le service worker de la plateforme elle-même (Depop en a un) ; jamais l'extension ni
  ses onglets de travail, jamais eBay. L'extension ne retravaille la plateforme qu'après la preuve.
- **Les tâches retenues portent la vraie cause** (« … demande une vérification au navigateur FillSell Cloud … appuie sur
  « Résoudre la vérification » » / « … restreint l'accès … rien à faire, un seul essai au bout de 24 h ») ; la plateforme
  rouverte, ce message part. Plus jamais « ouvre leboncoin.fr dans ton navigateur » pour un compte du Cloud.
- Une pause Leboncoin de l'app sur un compte du Cloud (cloud_voie) devient un blocage `restreint` côté Cloud (le bon
  message ; son essai des 24 h au même rendez-vous que celui de l'app).
- Rien ne change pour l'extension sur un PC (le module ne touche qu'aux comptes dont le navigateur Cloud est ouvert).
- App (OTA 2.9.151) : bandeau Cloud « Leboncoin demande une vérification » + « Résoudre la vérification » (la vue
  s'ouvre depuis le bandeau) ; « restreint » / « revenue » : texte seul ; l'écran « Me connecter » montre l'état et le
  bouton sur la ligne de la plateforme.

### 21.3 Profil français (navigateur.js)
- `--lang=fr-FR` (langue de Chrome et d'Intl), `intl.accept_languages` / `selected_languages` = `fr-FR,fr` (préférence du
  profil, posée par steel avant le lancement : Accept-Language et navigator.languages), fuseau `Europe/Paris` (TZ du
  processus Chrome, et `DEFAULT_TIMEZONE`). Le conteneur porte l'empreinte de son lancement : lancé autrement, il est
  recréé, le profil du compte reste sur le disque.
- Mesuré dans le navigateur du compte (page vierge, aucune visite), 11:31 : navigator.language **fr-FR**, languages
  **fr-FR, fr**, Intl **fr**, fuseau **Europe/Paris**, une date = « 02/11/2026 11:00:00 », « heure normale d’Europe centrale ».
- Deux pièges levés en route (corrigés à la racine) : (a) le conteneur recréé trouvait le profil verrouillé par l’ancien
  (« in use by another Chromium process on another computer », session steel HTTP 500 ; navigateur fermé de 11:19 à
  11:22) : les fichiers de verrou du profil partent à chaque démarrage d’un conteneur arrêté ; (b) Chromium sous Linux
  ignore --lang et ne lit que LANGUAGE / LANG, et l’image steel n’a que en-US.pak : Intl restait en-US (« 11/2/2026,
  11:00:00 AM »). Un fichier /etc/chromium.d/fillsell-langue (lu par le lanceur Debian) pose LANGUAGE et LANG, et fr.pak
  du paquet Debian **chromium-l10n 156.0.8078.73-1~deb12u1** (même version que le Chromium de l’image, signature vérifiée
  par apt, récupéré dans un conteneur jetable hors du réseau des navigateurs : outils/deployer.sh) est monté en lecture
  seule.

### 21.4 Compteur des 48 h : Beebs remise à zéro, seule
- `endurance-remise.mjs "…" --plateforme beebs --depuis 2026-11-01T23:15:48Z` (11:32) : la remise d’UNE plateforme
  (decompteEssai : ses heures d’avant « depuis » ne comptent plus ; la remise globale du 01/11 22:28 reste la référence).
- Bilan 11:32 : Vinted 11,8 h et Depop 11,8 h (inchangés), **Beebs 5,0 h** (5,6 h avant : seulement 00:15:48 → 05:15,
  sa mise en vérification), Leboncoin 0 h (pause de l’app depuis 22:54, puis vérification depuis 04:57).

### 21.5 eBay dans « Republier »
La feuille dit « eBay : ton annonce reste en ligne telle quelle. » quand l'article est en ligne sur eBay (lot :
« tes annonces restent en ligne telles quelles »). eBay reste hors republication (garde-fou du 17/09).

### 21.6 Journal des connexions : Depop
Migration `20261102110000_cloud_connexions_depop.sql` appliquée (feu vert de Nico) : la contrainte connaît depop ;
inverse `supabase/rollbacks/20261102110000_cloud_connexions_depop_INVERSE.sql`.

### 21.7 Essai réel Leboncoin
- Prêt à 11:31 : `platform_settings.leboncoin.cloud_verification` = a_resoudre (depuis 04:57), beebs = a_resoudre (05:15) ;
  la tâche Leboncoin c5c2a2c6 (republication des « Gants de ski Quechua ») porte le message du Cloud ; OTA 2.9.151 servie.
- **Le geste est celui de Nico** (jamais de résolution automatique) : bandeau → « Résoudre la vérification ». À relire
  après : journal `resolution_*` de l’orchestrateur, `blocages.json`, la tâche c5c2a2c6, et
  `platform_settings.leboncoin.blocage_acces.leve_le` (reprise prudente 6 h).
- Correction du § 20 : le bouton « Leboncoin remarche » que cite le message de pause Leboncoin n’existe pas dans l’app
  (aucun code n’écrit `essai_demande_le`). Pour un compte du Cloud, la résolution le remplace ; sur un PC, le message
  promet un geste absent — signalé à Nico, non touché (hors de ce lot).
- La preuve d’identité de l’OTA a été lancée APRÈS l’envoi (contre 2.9.151 elle-même, puis contre 2.9.150) : 708 scènes
  identiques ; échecs = les trois connus, plus le périmètre (StockTab : la ligne eBay voulue ; publication-programmee.js
  de a929146, déjà servi par le web). La garde « Me connecter n’est importé que par App » accepte désormais le bandeau
  (monté par App derrière la même porte, vérifié).

## 22. Essai « Résoudre » de Nico (02/11, 11:45) et ses suites (11:50 → 12:55)

### 22.1 Ce qui s'est passé à 11:45 (journal du serveur)
- **Leboncoin** 11:45:15 « Résoudre » ouvre « Mes annonces » (16 en ligne), aucune glissière (expirée) ; 11:45:30 la
  lecture légère (`members/me/account`) rend **200** → résolue en 15 s, une seule lecture ; pause Leboncoin de l'app
  levée (reprise prudente). Le « J'ai fini » de Nico est arrivé après.
- **Beebs** 11:45:36 « Résoudre » ouvre `www.beebs.app/fr` → **403** + vérification de l'appareil DataDome
  (`/interstitial/`), qui s'est terminée sur « Accès temporairement restreint » (IP 81.181.239.136 citée). La vue lisait
  seulement l'adresse du cadre (toujours `/interstitial/`) : elle disait « ça passe tout seul en quelques secondes ».
  Nico a fermé à 11:45:53 ; aucune lecture partie.
- Cause probable (Nico) : l'empreinte changée en pleine session (fr-FR, Europe/Paris, depuis 11:22) avec les anciens
  témoins DataDome de l'appareil (cookie `datadome` de `.beebs.app`). Avant, Beebs mettait une glissière à chaque fois.

### 22.2 Beebs — identité propre (point 1)
- 11:53 `outils/oublier-datadome.mjs <user> beebs` : le cookie `datadome` de `.beebs.app` part du navigateur ouvert
  (0 restant) et de la ligne Beebs du coffre (1 retiré, 5 gardés, ligne toujours « en vérification ») ; session Beebs
  (`refresh_token`) et autres plateformes intactes ; aucun stockage DataDome côté Beebs (localStorage relu sur le disque).
- Empreinte relevée (page vierge, aucune visite) : Chrome 156 Linux x86_64, `webdriver` faux, langues fr-FR / fr, Intl fr,
  Europe/Paris (UTC+1), 8 cœurs, écran 1920×1080×24, WebGL « ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …)) »
  (le même depuis l'essai du 01/11), Accept-Language fr-FR,fr.
- **FIGÉE** (39f381c) : lancement + session (jamais le proxy) notés dans le profil (`.empreinte-navigateur` =
  73cbe2096d286336, 11:57:30) ; une empreinte différente n'ouvre plus le navigateur sans `EMPREINTE_AUTORISEE` portant
  celle-là même (accord de Nico).
- 11:57:36 navigateur redémarré (déploiement de 39f381c) ; Beebs sans cookie DataDome, toujours « à résoudre ».
- **12:23**, « Résoudre » Beebs (cookie DataDome neuf) : encore « Accès temporairement restreint » ; la vue l'a dit tout de
  suite (« rien à glisser ») — la détection du point 4 a marché.

### 22.3 IP de remplacement (point 2)
- Feu vert de Nico (12:25, plafond 10 € TTC). **IPRoyal 87277315** : ISP Dedicated, France, 30 jours, **4 $** (solde
  7,35 $ → 3,35 $), livrée à 12:29 : **185.134.192.253**, échéance **02/12/2026** 11:29:07 (heure IPRoyal). Ajoutée au
  pool (id 4), pare-feu des navigateurs ouvert aux deux IP (redéploiement 12:32:57), contrôle d'entrée 12:34 (sortie FR,
  aucune liste, aucune plateforme visitée).
- Échange par `scripts/reparations/20261102_cloud_ip_remplacement_nico.sql` (sauvegarde `_backup_0211_cloud_ip`, RLS,
  aucun droit client ; inverse) : la neuve réservée au compte, l'ancienne **81.181.239.136 signalée** (rebut,
  `blocage_anti_robot` ; payée jusqu'au 29/11). Navigateur rouvert 12:36:02 ; sortie relue **185.134.192.253** ; empreinte
  inchangée (73cbe2096d286336). Vinted, Depop, Leboncoin : toujours connectés au coffre, aucune reconnexion demandée.
- **12:37, « Résoudre » Beebs par la NOUVELLE IP, première visite : « Accès temporairement restreint »** (IP neuve citée).
  → Ce n'est pas l'IP : DataDome juge le navigateur (le blocage tombe APRÈS la vérification de l'appareil, qui lit ses
  signaux JavaScript ; cookie et IP neufs n'y changent rien). Pas d'autre achat.

### 22.3 bis D'où ça vient (relu dans les traces, sans visite)
- Beebs a toujours mis une GLISSIÈRE (passable) tant que le navigateur était en anglais : 01/11 15:51 (essai), 22:54
  (connexion Google passée), 02/11 00:40 (republication faite), 05:14 (veille, glissière).
- Profil passé en français entre 11:19 et 11:31 (langue, Accept-Language, Intl, fr.pak ; le fuseau venait déjà du proxy).
- Ensuite : blocage dur à chaque visite (11:45, 12:23 cookie neuf, 12:37 IP neuve).
- Lecture : l'appareil (WebGL SwiftShader, polices, écran : identiques) a changé de langue d'un coup → profil jugé
  falsifié. Leboncoin, lui, passe en français (page, compte, republication faite).
- « Tout déconnecter côté Beebs » (idée de Nico) : sans effet attendu sur DataDome (refus à la première requête, avant la
  session Beebs ; une reconnexion passerait par la même vérification de l'appareil) — pas fait sans son accord.
- Essai proposé (UN seul, accord de Nico requis — empreinte figée) : remettre SEULEMENT la langue d'avant (en-US), garder
  Paris et l'IP neuve, cookie DataDome de Beebs effacé, une visite « Résoudre ». Glissière → la langue ; sinon → piste
  suivante.

### 22.4 Leboncoin — le travail de fond (point 3)
- Après la résolution : la republication des « Gants de ski Quechua » (c5c2a2c6) a été servie (reprise prudente) ; l'API
  a passé : préparation, contrôles, puis **retrait de l'ancienne annonce à 11:57:22** (`pintad/v1/public/manual/delete/ads`
  → 200).
- ⚠️ Le redémarrage du navigateur (déploiement, 11:57:26) est tombé 4 s après ce retrait : la tâche est restée
  « processing », étape `captured`, annonce hors ligne. Le filet de l'extension (`recoverStaleProcessingJobs`, 15 min,
  2 reprises au plus) la reprend.
- Repris seul (1 reprise) : **republiée à 12:24:31**, nouvelle annonce **3300861757**. Le travail de fond de Leboncoin
  passe vraiment (préparation, retrait, redépôt, par l'API) avec le profil français. Pas de mur.
- Leçon : ne jamais redéployer l'orchestrateur pendant une tâche « processing » (le planificateur l'évite pour un
  changement d'IP ; le déploiement, lui, ne regardait pas) — à porter au déploiement.

### 22.5 Messages de l'app (point 4)
- « Accès temporairement restreint » écrit dans la page OU dans le cadre DataDome (`TEXTE_ACCES_RESTREINT`) → « restreint »
  tout de suite, pour toutes les plateformes ; le cadre est lu dans un monde isolé (ou sa cible s'il est hors processus).
- La vérification de l'appareil en cours garde son message (« d'habitude, ça passe tout seul… Si l'accès est refusé, on te
  le dit tout de suite ») ; si elle finit sur un blocage, la vue passe aussitôt en « restreint ».

### 22.6 Vinted / Depop — le bouton (point 5)
- Connectée : plus de bouton principal, un lien discret « Changer de compte » ; « Me reconnecter » seulement déconnectée
  (0d00637, cloud-me-connecter 55). OTA **2.9.152** servie à 12:47 (preuve d’identité AVANT l’envoi, contre 2.9.151 : 708 scènes identiques ; périmètre = ces 2 fichiers + `_shared/etat-job.js` du lot A de l’utre terminal).
