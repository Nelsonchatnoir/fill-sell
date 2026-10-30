# Mac mini en centre de données (31/10/2026, nuit) : étude, aucun achat

**Demande de Nico (31/10, ≈ 00:25)**, « nouvelle piste prioritaire », sans rien acheter : des Mac mini en centre de
données (vrai matériel Apple, vraie puce graphique, pas de licence Windows). Il demande :
1. Scaleway Apple silicon (Paris) : M4 16/32 Go et M4 Pro 64 Go, prix à l'heure, minimum de 24 h, stock. Aussi Green
   Mini, Adminor, MacStadium.
2. La licence macOS : avons-nous le droit d'y faire tourner Chrome pour nos clients (usage commercial, machine entière
   louée) ?
3. La capacité estimée et le coût par utilisateur, IP comprise, comparés aux 16 € net.
4. Un plan d'essai unique sur Scaleway, avec son coût exact : Chrome officiel, fr-FR, Paris, une ouverture Leboncoin et
   une ouverture Beebs, IP 81.181.239.136.

Ordre de Nico pour la suite :
1. l'essai Steel (prêt, `docs/enquetes/machine-cloud-3010/RAPPORT.md` § 14.1) ;
2. ce rapport ;
3. Hetzner, seulement après leur réponse écrite sur la licence.

Rien n'est payé sans son feu vert.

## 0. Verdict

**Techniquement, la piste est bonne.**
- Chrome officiel existe pour macOS Apple silicon.
- WebGL nommera la vraie puce (« ANGLE Metal Renderer: Apple M4 »).
- Il n'y a ni licence Windows, ni RDS, ni pilote NVIDIA à payer.

**Prix chez Scaleway : un seul modèle passe sous 16 €**, le M4-M (32 Go), à Paris :
- 14,59 € HT par utilisateur avec l'engagement d'un mois ;
- 15,22 € HT à l'heure.

Les modèles à 16 Go coûtent 19,5 à 21 €. Le M4 Pro 64 Go coûte 16,60 € (13,02 € si le processeur n'est pas la limite).

**Ailleurs** (§ 2) :
- Green Mini (Pays-Bas), M4 16 Go à 84 € HT par mois : 13,04 €, sans essai à l'heure.
- Achat + colocation : ≈ 10 €.
- MacStadium : 17,7 à 18 €.
- AWS : ≈ 64 €.
- Seuls Scaleway (Paris), Flow Swiss (Zurich) et AWS (Irlande, Francfort) louent pour 24 h.

**Licence : c'est BLOQUANT** (§ 3). La licence macOS (version 27, la même en 15 et 26) dit trois choses :
- **Location (§ 3.A)** : un Mac loué ne peut servir qu'à des « Permitted Developer Services », définis comme
  « continuous integration services » : développement, compilation, tests automatisés pendant le développement. Faire
  tourner Chrome pour nos clients n'en est pas.
- **Service à des tiers (§ 2.I)** : interdit d'utiliser macOS « in connection with service bureau, time-sharing,
  terminal sharing or other similar types of services », pour des tiers comme en interne.
- **§ 2.J** : un seul utilisateur à la fois ; pas de mise à disposition sur le réseau pour plusieurs ordinateurs en même
  temps.

Conséquences :
- Louer un Mac pour la production n'est permis nulle part : ni chez Scaleway, ni chez MacStadium, ni chez AWS.
- Acheter nos propres Mac lève le § 3, pas les § 2.I et 2.J.
- La seule porte : une autorisation écrite d'Apple. Le § 3.A de la version 27 prévoit « except as otherwise provided
  in writing … by an authorized representative of Apple ».

**Recommandation.**
- Ne pas payer l'essai Scaleway (6,34 € TTC) tant qu'Apple n'a pas répondu oui par écrit. L'essai nous apprendrait si
  DataDome laisse passer un Mac, mais aucune production propre ne pourrait suivre.
- Le plan d'essai est prêt (§ 5) ; la question à Apple est au § 6.
- Les options Windows du § 13 restent devant : Hetzner 11,73 €, Azure 13,46 €, centron 13,80 € HT par utilisateur, sous
  réserve de leur licence RDS.

## 1. Scaleway Apple silicon (Paris), relu le 31/10 entre 00:25 et 00:40

**Sources** :
- catalogue public de l'API Scaleway (`api.scaleway.com/product-catalog/v2alpha1/public-catalog/products?product_types=apple_silicon`, 22 lignes) ;
- page de prix française (scaleway.com/fr/tarifs/apple-silicon/, « Prix hors taxes ») ;
- documentation officielle (dépôt GitHub `scaleway/docs-content` : faq, datasheet, create-mac-mini,
  manage-commitment-plan, access-remote-desktop, changelog).

| Modèle | Puce | RAM | Disque | Zone | € HT / heure | € HT / mois (engagement 1 mois) |
|---|---|---|---|---|---|---|
| M1-M | M1, 8 cœurs, GPU 8 | 8 Go | 256 Go | PAR-1, PAR-3 | 0,11 | 75 |
| M2-M | M2, 8 cœurs, GPU 10 | 16 Go | 256 Go | PAR-1 | 0,17 | 115 |
| M2-L | M2 Pro, 10 cœurs, GPU 16 | 16 Go | 512 Go | PAR-1 | 0,21 | 139 |
| **M4-S** | **M4, 10 cœurs, GPU 10** | **16 Go** | 256 Go | PAR-1 | **0,22** | **149** |
| M4-SP | M4, 10 cœurs, GPU 10 | 16 Go | 512 Go | PAR-1 | 0,24 | 165 |
| **M4-M** | **M4, 10 cœurs, GPU 10** | **32 Go** | 1,02 To | PAR-1 | **0,29** | **199** |
| **M4-XL** | **M4 Pro, 14 cœurs, GPU 20** | **64 Go** | 2,05 To | PAR-1 | **0,49** | **335** |

Ce qui est hors du tableau :
- M2-L-ASAHI (Asahi Linux, 0,21 €/h, sans minimum de 24 h) : c'est Linux. Linux est déjà bloqué, y compris sur une
  vraie puce Intel (§ 7 et 10 du rapport Cloud).
- M4-L (M4 Pro, 0,44 €/h, 305 €/mois, PAR-1 et PAR-3) : présent dans le catalogue, mais absent de la page publique ;
  matériel non publié.

**Conditions relues :**
- **Minimum de 24 h** : « The minimum lease period for Apple silicon is 24 hours due to licensing restrictions. A Mac
  mini can only be deleted after this 24-hour minimum lease period. »
  - Une option de la console supprime la machine automatiquement à 24 h. La suppression prend environ 30 min.
  - Au-delà de 24 h, facturation à l'heure tant que la machine existe.
- **Engagement** : un mois, renouvelé chaque mois à date anniversaire. La suppression prend effet à cette date. On ne
  peut pas repasser d'un engagement à l'heure.
- **IP** : une IPv4 et un /128 IPv6 par Mac mini, sans ligne de prix séparée. Bande passante publique 1 Gb/s
  (10 Gb/s en option sur M4-M et M4-XL).
- **Logiciel** :
  - macOS au choix. « macOS Golden Gate 27 » est disponible depuis le 21/09/2026. Une version autre que celle par
    défaut ajoute environ 1 h de mise en service.
  - Xcode, MacPorts et `scw-agent` sont préinstallés.
  - Accès SSH (clé) et VNC (« Open remote desktop », port tiré au hasard).
  - Profil MDM : pas d'accès à la récupération macOS, SIP non désactivable, FileVault impossible.
- **Commande** : la case à cocher accepte les conditions Bare Metal ET la licence macOS. La doc renvoie elle-même à la
  « Section 3.A » de la licence Apple.
- **Stock** : illisible sans compte. L'API des types de serveur (avec stock) répond 401 sans clé, et nous n'avons pas
  de compte Scaleway. Le catalogue donne `general_availability` ; la page publique n'affiche aucun badge de rupture.
  Le stock se lit dans le formulaire de commande, une fois le compte ouvert.
- **Mise en service** : « disponibles en moins de 5 minutes » (page M4).

## 2. Autres hébergeurs (recherche web du 31/10, aucun compte, aucun contact)

**Méthode.**
- Relevé par un agent de recherche. Green Mini a été recontrôlé à la source (greenmini.nl/products : « From €74 p/m »,
  « All prices are excluding » la TVA ; portal.greenmini.host/llms.txt : « no minimum term beyond the chosen billing
  cycle (monthly, quarterly or yearly) »).
- Taux BCE du 30/10 : 1 € = 1,1172 $ = 0,9194 CHF = 10,978 SEK.
- Coût par utilisateur : même règle qu'au § 4.

| Offre | Lieu | Prix publié | Durée minimale ; essai | Stock | Util. | € HT / util. (TTC) |
|---|---|---|---|---|---|---|
| Achat Mac mini M4 16 Go (699 € TTC, revendeur) + colocation Green Mini 34 € HT/mois, sur 36 mois | Pays-Bas | ≈ 50 €/mois | achat | M4 retiré par Apple, encore chez des revendeurs | 10 | 9,66 (11,59) |
| Achat Mac mini M6 16 Go (1 049 € TTC, Apple) + même colocation | Pays-Bas | ≈ 58 €/mois | achat | en vente | 10 | 10,47 (12,56) |
| OakHost M4.M 32 Go | Allemagne | 135 € HT/mois | 1 mois ; offre « 7 jours » indisponible | **épuisé** | 20 | 11,39 (13,67) |
| Green Mini M4 16 Go, à l'année | Pays-Bas | 74 € HT/mois | 1 an | pas de rupture affichée | 10 | 12,04 (14,45) |
| **Green Mini M4 16 Go, au mois** | Pays-Bas | **84 € HT/mois** | **1 mois** ; essai à l'heure : aucun ; machine de test « on request » | pas de rupture affichée ; mise en service « within a few hours to a day » | 10 | **13,04 (15,65)** |
| Hostmyservers M4 (M) 32 Go | France | 183,08 € HT/mois | 1 mois | **rupture** | 20 | 13,79 (16,55) |
| **Scaleway M4-M 32 Go** (§ 1), pour comparer | **Paris** | 199 € HT/mois engagé ; 0,29 €/h | **24 h** | illisible sans compte | 20 | **14,59 (17,51)** |
| vBoxx M5 Pro 64 Go | Amsterdam | 359 € HT/mois (323 à l'année), + 50 € d'installation au mois | 1 mois (les CGV disent 1 an par défaut) | « In stock » | 30 | 16,61 (15,41 à l'année) |
| Unihost N10 M4 24 Go | Pays-Bas | 199,90 € HT/mois | 1 mois | sans étiquette | 15 | 17,97 |
| MacStadium M4.L 48 Go (M4 Pro 12 cœurs) | Atlanta, Las Vegas, Dublin (plans de Dublin non publiés) | 349 $/mois | mois civil prépayé | non détaillé | 24 | 17,66 |
| MacStadium M4.S 16 Go | idem | 149 $/mois (119 $ avant le 29/06/2026) | idem | idem | 10 | 17,98 |
| Adminor M4 Pro 48 Go | Stockholm | 4 490 SEK HT/mois + 1 990 SEK d'installation | 12 mois | « InStock » | 24 | 21,68 |
| Flow Swiss M4 Pro 48 Go | Zurich (hors UE) | 0,75 CHF/h, 549 CHF/mois | **24 h** (≈ 19,58 € HT) ; solde prépayé | non publié | 24 | 29,45 (à l'heure) |
| AWS mac-m4.metal 24 Go | Irlande, Francfort (aucun Mac à Paris) | 1,353 $/h (Irlande) ; 1,476 $/h (Francfort) ; + EBS et IPv4 | **24 h** (≈ 29,07 € en Irlande) | non affiché | 15 | 63,58 |

Écartés en une ligne :
- xaweho (Düsseldorf, 79 € TTC/mois) : 12 mois, épuisé.
- rentamac.io : tout est alloué (liste d'attente).
- snafu.de : prix contradictoires sur la même page.
- SIM-Networks : M2 seulement, sans essai.
- MacinCloud : machine virtuelle en Europe, M1/M2 seulement.
- Hetzner, OVHcloud, IONOS, Leaseweb, Cherry Servers : aucune offre Mac.
- My Remote Mac, Neolo, HostMyApple, XcodeClub : source officielle introuvable ou lieu non publié.

**Clauses des hébergeurs** (en plus de la licence Apple, § 3) :
- **MacStadium**, contrat cadre v2.0, § 1(c) : le service « may not be … offered as a service bureau ».
- **OakHost** : CGU § 6.12.7, « VPN or proxy services for third parties » interdits ; § 3.14, respect des licences du
  système.
- **Green Mini**, vBoxx, Adminor, Flow Swiss, AUP d'AWS : aucune clause sur les robots ou le scraping.
  - Green Mini § 4.9 et vBoxx § 5.10 permettent la revente sous conditions.
  - Flow Swiss peut plafonner les accès simultanés.
  - AWS présente EC2 Mac comme fait « for developing, building, testing, and signing ».

**Lecture.**
- Le moins cher en location au mois : Green Mini M4 16 Go (13,04 € HT par utilisateur, Pays-Bas, sans essai à
  l'heure).
- Le seul Mac à Paris avec un essai court : Scaleway (24 h). Les deux autres essais de 24 h en Europe coûtent 3 à
  5 fois plus : Flow Swiss à Zurich, AWS en Irlande.
- Acheter + colocation serait le moins cher (≈ 10 €), mais c'est un achat, et la licence s'y oppose aussi (§ 3).

## 3. Licence macOS : texte et lecture

**Texte lu** : `apple.com/legal/sla/docs/macOSGoldenGate.pdf` (macOS 27, référence EA2005 du 11/07/2026). Comparé à
macOSTahoe.pdf (26) et macOSSequoia.pdf (15) : § 2.I, 2.J et 3.A identiques. Seule différence : la réserve
« except as otherwise provided in writing » n'existe qu'en 27.

**§ 3.A, location** :
> You may lease or sublease a validly licensed version of the Apple Software in its entirety to an individual or
> organization (each, a "Lessee") provided that all of the following conditions are met, except as otherwise provided
> in writing, signed, or issued by an authorized representative of Apple: (i) the leased Apple Software must be used
> for the sole purpose of providing Permitted Developer Services […]; (ii) each lease period must be for a minimum
> period of twenty-four (24) consecutive hours; (iii) during the lease period, the End User Lessee must have sole and
> exclusive use and control of the Apple Software and the Apple-branded hardware […].
> […] Permitted Developer Services means continuous integration services, including but not limited to software
> development, building software from source, automated testing during software development, and running necessary
> developer tools to support such activities.

**§ 2.I, accès à distance**, après la règle « un seul appareil peut piloter la session graphique » :
> Except as expressly permitted in this Section 2I or Section 3, or except as otherwise licensed by Apple, you agree
> not to use the Apple Software, or any of its functionality, in connection with service bureau, time-sharing,
> terminal sharing or other similar types of services, whether such services are being provided within your own
> organization or to third parties.

**§ 2.J** :
> Except as otherwise permitted by the terms of this License or otherwise licensed by Apple: (i) only one user may use
> the Apple Software at a time, and (ii) you may not make the Apple Software available over a network where it could
> be run or used by multiple computers at the same time.

**Lecture.**
- **Mac loué (Scaleway, MacStadium, AWS…)**. Le loueur nous loue sous le § 3. Nous devenons « End User Lessee » et
  devons l'utiliser « solely for Permitted Developer Services ». Une flotte de Chrome qui travaille pour nos clients sur
  leurs comptes Leboncoin et Beebs, c'est de la production, pas de l'intégration continue. **Non permis.**
- **Mac acheté, en colocation**. Le § 3 ne joue plus, mais le § 2.I interdit le « service bureau » et le
  « time-sharing ». Dix clients servis en même temps par une machine, c'est le cas typique. Le § 2.J (un seul
  utilisateur à la fois) va dans le même sens. **Non permis non plus**, sauf autorisation d'Apple.
- **Un essai ponctuel** de notre propre logiciel peut se défendre comme « automated testing during software
  development ». La production, non.
- C'est le même mur que Windows 10/11 loué (§ 13.1 du rapport Cloud). La différence : Microsoft vend une sortie
  (Windows Server SPLA + RDS), Apple n'en vend aucune.

## 4. Capacité et coût par utilisateur

**Règle**, la même qu'au § 13 du rapport Cloud :
- utilisateurs = min(RAM × 10/16, base Shadow ; 2 par cœur) ;
- coût par utilisateur = machine ÷ utilisateurs + IP IPRoyal 4,64 € ;
- TTC = HT × 1,20.

Mémoire unifiée : la carte n'est pas une limite à part.

| Modèle | Utilisateurs | € HT / util. (engagé) | € TTC | € HT / util. (heure, 730 h) | Sous 16 € ? |
|---|---|---|---|---|---|
| M4-M (32 Go) | 20 | **14,59** | 17,51 | 15,22 | **oui** |
| M2-M (16 Go) | 10 | 16,14 | 19,37 | 17,05 | non, de peu |
| M4-XL (M4 Pro, 64 Go) | 28 (40 si la RAM seule compte) | 16,60 (13,02) | 19,93 | 17,41 | non avec la règle ; oui si 40 |
| M2-L (M2 Pro, 16 Go) | 10 | 18,54 | 22,25 | 19,97 | non |
| M4-S (16 Go) | 10 | 19,54 | 23,45 | 20,70 | non |
| M1-M (8 Go) | 5 | 19,64 | 23,57 | 20,70 | non |
| M4-SP (16 Go) | 10 | 21,14 | 25,37 | 22,16 | non |

**Réserves sur la capacité.**
- macOS garde plus de mémoire pour lui que Windows. La règle « 10 pour 16 Go » vient de Shadow (Windows, 12 Chrome
  + relais sur 16 Go, mesuré hors réseau).
- Un cœur M4 vaut à peu près deux fils de serveur : la règle « 2 par cœur » est sans doute prudente pour le M4 Pro.
- Tout se mesurerait hors réseau pendant l'essai, déjà payé 24 h (§ 5, étape 8).

**À comparer** (§ 13 et 14 du rapport Cloud, HT par utilisateur, IP comprise) :
- Hetzner 3093130 (Windows) : 11,73 € ;
- Azure NV12ads spot : 13,46 € ;
- centron A4000 : 13,80 € ;
- dans les trois cas, + 9,10 € de RDS par client concerné ;
- Steel à la demande : ≈ 7,2 €.

Le Mac M4-M (14,59 €) n'a pas de RDS à payer, mais n'a pas de licence du tout pour notre usage.

## 5. Plan d'essai unique sur Scaleway (prêt ; à ne lancer que sur feu vert de Nico, idéalement après la réponse d'Apple)

**Machine** : M4-S (16 Go), PAR-1, sans engagement.
- Même puce et même carte que le M4-M de production : seules la RAM et le disque changent. C'est le moins cher des M4.
- macOS par défaut, pour éviter l'heure de mise en service en plus.
- Suppression automatique à 24 h cochée.

**Coût exact.**
- Machine : 24 h × 0,22 € = **5,28 € HT = 6,34 € TTC**, IPv4 comprise.
  - C'est le plancher imposé par la licence ; aucune heure de plus si la suppression automatique est cochée.
  - Variante M1-M (8 Go) : 2,64 € HT = 3,17 € TTC. Mais ce n'est pas le modèle de production : règle « tout vérifier
    sur le modèle précis » (mémoire `commande-verifier-modele`).
- IP 3 (81.181.239.136, payée jusqu'au 29/11) : 0 €.
  - Si l'essai Steel l'a fait marquer, une IP neuve coûte 4 $ ≈ 3,58 €, pris sur le solde IPRoyal de 7,35 $.
- **Total : 6,34 € TTC, ou 9,92 € TTC avec une IP neuve.**

**Étapes.**
0. **Nico** :
   - ouvre le compte Scaleway (société, moyen de paiement) ;
   - regarde le stock M4-S dans le formulaire ;
   - commande lui-même en cochant la suppression à 24 h. Claude ne saisit aucune carte.
   - Si le quota Apple silicon d'un compte neuf est à 0 : demande de quota d'abord.
1. **Accès** : clé SSH dans le formulaire. Une seule connexion VNC (« Open remote desktop »), pour ouvrir la session
   graphique de l'utilisateur. Elle reste ouverte après la déconnexion VNC. Aucune page Leboncoin ou Beebs dans le VNC.
2. **Réglages**, par SSH :
   - `sudo systemsetup -settimezone Europe/Paris` ;
   - `defaults write -g AppleLanguages -array fr-FR` et `defaults write -g AppleLocale fr_FR` ;
   - Google Chrome officiel (dmg de dl.google.com) ;
   - Node 22 LTS darwin-arm64 ;
   - copie par scp de `git archive HEAD serveur-cloud` et de `build/extension-cloud`.
3. **Outil** : `serveur-cloud/outils/essai-me-connecter-pc.mjs`, avec un seul changement : le chemin de Chrome selon le
   système, `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` sous macOS.
   - Lancé dans la session graphique (`launchctl asuser <uid> …`), sinon pas de carte graphique : c'est le même piège
     que la session 0 de Shadow.
4. **Pare-feu pf**, avant toute sortie de Chrome :
   - sortie TCP seulement vers 81.181.239.136:12323 (le proxy, via le relais local) ;
   - SSH entrant ;
   - boucle locale libre ;
   - UDP bloqué (pas de fuite WebRTC de l'IP Scaleway).
5. **`--verifier`** (proxy mort, aucune page de site). Il faut lire :
   - WebGL « ANGLE (Apple, ANGLE Metal Renderer: Apple M4…) », pas SwiftShader ;
   - fuseau Europe/Paris, langues fr-FR, plateforme MacIntel.
   - Sinon : arrêt, aucune visite ; la machine part à 24 h.
6. **`--a-blanc`** (proxy mort) : le parcours complet tourne, aucune plateforme jointe.
7. **Poste de Nico muet** (extension coupée par lui, relu en base), puis sortie de l'IP relue sur ipinfo.io.
8. **L'essai** :
   - une ouverture Leboncoin, puis une ouverture Beebs, par « Me connecter » de production, profil neuf ;
   - images à 5, 12 et 25 s ;
   - verdict : formulaire = PASSE ; glissière = PASSE AVEC VÉRIFICATION ; « Accès temporairement restreint » = BLOQUÉ.
9. **Après l'essai** (déjà payé) :
   - mesure de capacité hors réseau, comme sur Shadow : N Chrome sur proxy mort, mémoire et processeur relevés ;
   - secrets effacés de la machine ;
   - suppression à 24 h.
10. Nico remet son extension, puis base relue ; compte rendu ici.

## 6. Question à Apple (brouillon, NON envoyé ; seule porte de sortie de la licence)
Destinataire : Apple Developer Relations, formulaire « macOS license »
(`https://developer.apple.com/contact/macos-license/`, cité au § 3.A).
> Hello, we are a French SaaS company. We would like to run Google Chrome on Mac mini computers (either leased from a
> hosting provider such as Scaleway, or owned and colocated) to automate actions on our own customers' accounts on
> third-party marketplaces, each customer having their own Chrome profile; customers never access macOS itself, but
> may see one Chrome tab streamed through our web app to log in. Sections 2.I, 2.J and 3.A of the macOS license seem to
> exclude this use (Permitted Developer Services, service bureau, one user at a time). Is there any written
> authorization or separate license from Apple that would permit it? If not, could you confirm that this use is not
> permitted?

## 7. Sources
- Scaleway : catalogue public de l'API (lu à 00:27) ; scaleway.com/fr/tarifs/apple-silicon/ (lu à 00:37, HT) ;
  `github.com/scaleway/docs-content` : `pages/apple-silicon/faq.mdx` (validé le 18/02/2026),
  `reference-content/apple-silicon-datasheet.mdx` (03/02/2026), `how-to/create-mac-mini.mdx` (24/07/2026),
  `how-to/manage-commitment-plan.mdx`, `how-to/access-remote-desktop-mac-mini.mdx`, `how-to/delete-mac-mini.mdx`,
  changelog du 27/01/2025 (M4-S à 0,22 €/h), du 22/05/2025 (M4-M 0,29 €/h, M4-XL 0,49 €/h) et du 21/09/2026 (macOS 27).
- Apple : `apple.com/legal/sla/docs/macOSGoldenGate.pdf` (EA2005, 11/07/2026), `macOSTahoe.pdf`, `macOSSequoia.pdf`.
- § 2, sources relevées par l'agent :
  - greenmini.nl/products/ et `portal.greenmini.host/llms.txt` (recontrôlés) ; CGV Green Mini AV-GMH-5 du 01/06/2026 ;
  - mac-hosting.vboxx.eu/pricing ; adminor.net/mac-mini-hosting-en/ ;
  - macstadium.com/pricing, /datacenters, docs.macstadium.com (contrat cadre v2.0) ;
  - grille AWS `dedicatedhost-ondemand.json` (29/10/2026) et `ec2-instance-regions.html` ;
  - doc.flow.swiss/platform/pricing/mac-bare-metal ; oakhost.com/mac-mini-hosting et /tos (05/10/2026) ;
  - hostmyservers.fr, unihost.com, xaweho.de, snafu.de, sim-networks.com, rentamac.io, checkout.macincloud.com ;
  - apple.com/fr/shop/buy-mac/mac-mini.
