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

`https://fillsell.app/installer?utm_source=meta&utm_medium=paid&utm_campaign=installer-continu&utm_content={{ad.name}}`

(`{{ad.name}}` est remplacé par Meta : nom de la pub, ex. `V1-podcast`.)

## Réglages proposés (à valider par Nico avant « Publier »)

| Réglage | Valeur |
|---|---|
| Objectif | Trafic, optimisation « Clics sur un lien » (la vue de page de destination demande le pixel, soumis au consentement) |
| Budget | 8 €/jour, quotidien, sans date de fin. ⚠ Meta peut dépenser jusqu'à 75 % de plus un jour donné (14 € au plus), jamais plus de 7 × 8 = 56 € par semaine |
| Pays | France |
| Âge | 18 ans et plus |
| Audience | Advantage+ (Meta élargit), suggestions : seconde main, vêtements d'occasion, vide-grenier, revente |
| Placements | Advantage+ (automatiques), appareils mobiles seulement (le lien mène aux stores) |
| Pubs | V1 podcast, V2 maman, V3 revendeur, V4 Cloud — chacune en 9:16 (Stories, Reels) et 4:5 (fils) ; 1:1 en réserve |
| Appel à l'action | « Installer » |

## Textes (Meta teste les combinaisons)

Textes principaux :
1. Tu vends sur Vinted, Leboncoin, eBay, Beebs ou Depop ? Avec FillSell, tu crées ton annonce une fois sur ton
   téléphone et tu la publies partout. Quand un article se vend, il est retiré des autres plateformes. Gratuit pour
   commencer.
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
- Inscriptions (`profiles.acquisition_*`) : ⚠ les UTM n'y remontent PAS pour qui installe l'app. L'app native
  inscrit « app_ios » / « app_android », medium « store » (`src/utils/acquisition.js`). Seuls les visiteurs sur
  ordinateur qui s'inscrivent sur le web depuis /installer portent `source = meta`. Corriger ça demande du code dans
  l'app (lecture du `referrer` Play) : hors du périmètre marketing, à décider par Nico.

## Journal

- 13/11 : enquête, page /installer, textes, récapitulatif envoyé à Nico. Identifiants de l'ensemble et des pubs,
  date et heure de lancement : à compléter après le « OK » de Nico et la publication.
