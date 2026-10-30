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
