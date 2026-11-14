# Campagne Meta Ads FillSell — suivi (ouvert le 13/11/2026, heure de Paris)

Une seule campagne, en continu, sans date de fin, 8 € par jour au plus. Jamais de budget à vie ni de 2e campagne.
Compte publicitaire `967689532550296`, portefeuille business « FillSell », Page Facebook « FillSell »
(1084155614790198), Instagram `fillsell.app`.

## Voie retenue : Trafic vers fillsell.app/installer (enquête du 13/11)

- « Promotion de l'application » essayée en brouillon (supprimé ensuite) : Meta accepte la fiche Google Play sans SDK,
  MAIS pour l'iPhone il ne propose que « App Store d'Apple (iOS 13.7 ou version antérieure) ». Les iPhone récents
  exigent l'app enregistrée chez Meta avec son SDK (SKAdNetwork), c'est-à-dire du code dans l'app. Et sans SDK, Meta
  ne voit aucune installation : il optimiserait « à l'aveugle » de toute façon.
- Donc : campagne Trafic, un seul lien, la page `/installer` (site, noindex) : iPhone → App Store, Android → Google
  Play (UTM transmis dans `referrer`), ordinateur → la page avec les deux badges et l'accès au web.
- On réutilise la campagne existante « Nouveau Trafic Campagne avec les paramètres recommandés »
  (`120250796277700690`, terminée, 0 € dépensé) au lieu d'en créer une 2e.

## Lien de destination

`https://fillsell.app/installer?utm_source=meta&utm_medium=paid&utm_campaign=installer-continu&utm_content=<nom de la pub>`

(UTM écrits dans l'URL de chaque pub : `utm_content` = `V1-podcast`, `V2-maman`, `V3-revendeur`, `V4-cloud`.)

## Réglages en ligne (OK de Nico le 13/11, publiés à 20 h 10)

| Réglage | Valeur |
|---|---|
| Objectif | Trafic, lieu « Site Web », optimisation « Maximiser le nombre de clics sur un lien », enchère « volume le plus élevé » |
| Budget | 8 €/jour, quotidien, au niveau de l'ensemble, sans date de fin, aucun budget à vie. ⚠ Meta peut dépenser jusqu'à 75 % de plus un jour donné (14 € au plus), jamais plus de 7 × 8 = 56 € par semaine |
| Pays | France |
| Âge | 18 ans et plus |
| Audience | Advantage+ ; contrôles : France, 18 ans minimum ; suggestions : « produit d'occasion (achats et vente) », « Vide-greniers » |
| Placements | automatiques sur Facebook, Instagram, Audience Network, Threads, aucune exclusion ; appareils : téléphone portable seulement (Meta affiche alors « Advantage+ désactivé ») |
| Pubs | V1 podcast, V2 maman, V3 revendeur, V4 Cloud (mention « iPhone, Android et le web ») — 9:16 pour Stories/Reels, 4:5 pour fils et recherche ; logos des plateformes gardés. Fichiers envoyés : copies réencodées < 10 Mo (`marketing/livrables-20261111/meta-ads-envoi-1311/`, même image, limite de l'outil du navigateur) |
| Appel à l'action | « Télécharger » (Meta ne propose pas « Installer » en campagne Trafic) |
| Améliorations Meta AI | génération d'images IA : aucune ; améliorations du texte : désactivées ; retouches vidéo : désactivées |

## Textes (Meta teste les combinaisons)

Textes principaux :
1. Tu vends sur Vinted, Leboncoin, eBay, Beebs ou Depop ? Avec FillSell, tu crées ton annonce une fois sur ton
   téléphone, et elle part partout depuis ton ordinateur, ou sans ordinateur avec FillSell Cloud. Quand un article se
   vend, il est retiré des autres plateformes. Gratuit pour commencer. (version corrigée par Nico, 13/11)
2. Une photo, et l'annonce s'écrit : titre, description et prix de marché. Tu relis, tu coches tes plateformes, c'est
   parti. Ton stock et ta marge te suivent partout. L'app est gratuite pour commencer.
3. Pas d'ordinateur ? Avec FillSell Cloud, tes annonces Vinted, Leboncoin, Beebs et Depop sont publiées depuis nos
   serveurs, et selon ta formule elles remontent toutes seules. Tu suis tout sur iPhone, Android ou le web. 7 jours
   d'essai gratuit sur Premium ou Pro avec Cloud.

Titres : « Publie partout en une fois » · « Une annonce, cinq plateformes » · « Vendu ici, retiré ailleurs ».
Description : « Gratuit pour commencer ».

## Lire les résultats

- Meta (Gestionnaire de publicités) : clics sur un lien, CPC (coût par clic), CTR, par pub (V1 à V4).
- Installations venant de Meta :
  - Android : Play Console → Statistiques → Acquisition → sources, campagne `installer-continu` (UTM du `referrer`).
  - iPhone : App Store Connect ne relie une installation à une campagne qu'avec le jeton fournisseur (`pt`). Tant
    qu'il n'est pas posé dans `site/gabarits/installer.mjs` (`APP_STORE_PT`), l'iPhone se lit en « Web Referrer ».
  - Coût par installation ≈ dépense Meta ÷ installations attribuées (Android sûr, iPhone approximatif).
- Inscriptions (`profiles.acquisition_*`) — ce qui remonte, par canal (bloc E1, 14/11) :
  - web (ordinateur, ou téléphone resté sur /installer) : `source = meta`, `medium = paid`, `campaign =
    installer-continu`, `content = V1-podcast`… dès aujourd'hui (même code que tout le site : `capterSource`).
  - Android : aujourd'hui « app_android / store ». Le prochain binaire Android peut lire la campagne que Google Play
    rend (Install Referrer API : `InstallReferrerPlugin.java`, `src/lib/referrerPlay.js`), PRÉPARÉ et INACTIF
    (`PLAY_REFERRER_BINAIRE_MIN = null`, `src/utils/acquisition.js`). Ouvert, l'inscrit Android venu de la pub porte
    `meta / paid / installer-continu / V…`, `referrer = https://play.google.com`, plateforme android (migration
    `20261114100000`, à appliquer avant). Seuls les inscrits APRÈS l'installation de ce binaire sont mesurés.
  - iPhone : jamais par compte (aucun referrer App Store, ni SDK, ni empreinte). Lecture agrégée seulement : App Store
    Connect → App Analytics → Acquisition → Campagnes, une fois `APP_STORE_PT` posé.
  - Repère du volume (prod, 05/11 → 13/11, avant la pub) : ~3 inscrits iPhone et ~1 Android par jour ; un écart
    après le 13/11 20:10 est un indice, pas une attribution.
- Jeton fournisseur `pt` (iPhone) : il ne se fabrique pas. Nico génère UN lien de campagne dans App Store Connect (App
  Analytics → Acquisition → Campagnes → générer un lien, campagne `installer-continu`) et lit `pt=` dans le lien
  obtenu ; ce nombre se pose dans `site/gabarits/installer.mjs` (`APP_STORE_PT`), puis déploiement du site. Règle
  d'Apple : `ct` = 30 caractères au plus (la page coupe et nettoie), données visibles 24 h après, à partir de 5
  premiers téléchargements, « dernier lien cliqué gagne » ; `ct` = utm_campaign seul (un `ct` par pub diviserait
  sous le seuil de 5).
- Requête (lecture seule) des inscrits venus de la pub :
  `SELECT (created_at AT TIME ZONE 'Europe/Paris')::date jour, acquisition_source, acquisition_content, count(*)
  FROM profiles WHERE acquisition_campaign = 'installer-continu' GROUP BY 1, 2, 3 ORDER BY 1;`

## Journal

- 13/11 : enquête, page /installer (82df152), textes, récapitulatif ; OK de Nico (« publie ce soir », T1 corrigé,
  brouillon « VISIBILITE FILLSELL » supprimé sur sa demande).
- 13/11/2026 à 20 h 10 (Paris) : PUBLIÉ. Statut juste après : pubs « Traitement » (examen Meta), ensemble allumé
  8,00 €/jour, « Pubs inactives » tant que l'examen n'est pas fini.

## Identifiants

| Objet | Nom | ID |
|---|---|---|
| Compte publicitaire | 967689532550296 | act=967689532550296 |
| Campagne | FillSell - Installer l'app (continu) | 120250796277700690 |
| Ensemble | Nouveau Trafic Ensemble de publicités avec les paramètres recommandés | 120250796277680690 |
| Pub | V1-podcast | 120251824058560690 |
| Pub | V2-maman | 120251824094730690 |
| Pub | V3-revendeur | 120251824137370690 |
| Pub | V4-cloud | 120251824165910690 |

Lien de la campagne :
https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=967689532550296&selected_campaign_ids=120250796277700690

