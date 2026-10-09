# Balises Google sous consentement — preuve et vitesse (09/10/2026, soir)

## Ce qui était faux

Sur le site ET sur l'app web, `index.html` chargeait d'office, avant toute
réponse au bandeau :

- Google Tag Manager `GTM-TJNKL6T5` — le conteneur public (lu le 09/10) ne
  porte qu'une balise : Google Analytics 4 `G-2ZYVK404G9`, au chargement ;
- la balise Google Ads `AW-16622098460` — collecte automatique (pages vues,
  clics, formulaires, e-mail et téléphone pour les conversions améliorées) ;
- le `<noscript>` de GTM (une requête chez Google même sans JavaScript).

Cookies `_ga`, `_ga_*`, `_gcl_au` posés et requêtes chez Google dès
l'ouverture. Le bandeau (maison, `BandeauConsentement.jsx` + bandeau du site —
il n'y a pas de Didomi chez FillSell ; le seul Didomi du code est celui de
Vinted, que l'extension refuse) ne parlait que d'« un traceur Meta ».

## Ce qui est fait

- Script en ligne `site/js/balises-consentement.js`, en tête du `<head>` de
  chaque page vitrine et d'`app-shell.html` (build Vercel seulement) :
  mode consentement de Google v2 refusé par défaut, AUCUN script Google avant
  l'accord ; à l'accord : consentement accordé, puis GTM et gtag AW dans
  l'ordre d'avant ; refus ou retrait : refusé + cookies Google effacés.
- Bandeau : le texte nomme Google et Meta (`consentementTextes.js`, partagé
  par les deux bandeaux) ; nouvelle clé `fs_consent_pub_v2` : un accord donné à
  l'ancien texte (Meta seul) est redemandé, un refus reste un refus.
- Natif et OTA : `index.html` inchangé (le plugin n'existe que dans le build
  du site). Ils ne montrent aucun bandeau : GTM et Google Ads s'y chargent
  toujours sans accord — **écart restant, décision de Nico** (bandeau dans
  l'app ou balises retirées du natif). `/legal` (page de l'app, partagée avec
  le natif) décrit encore GTM « sans consentement » et ne nomme pas Google
  Ads : texte à revoir avec cette décision.

## Preuve (vrai Chrome, `npm run site:preuve-consentement`)

Sortie `apres/preuve-consentement-2026-10-09.json`, 21 vérifications vertes
sur la sortie locale servie comme sur Vercel :

| Scénario | Avant l'accord | Après l'accord |
|---|---|---|
| Accueil, première visite | 0 requête Google, 0 cookie Google, bandeau affiché (nomme Google et Meta) | `gtm.js?id=GTM-TJNKL6T5`, `gtag/js?id=AW-16622098460`, `gtag/js?id=G-2ZYVK404G9`, **`googleads.g.doubleclick.net/pagead/viewthroughconversion/16622098460/`** (la requête Google Ads), `google.com/ccm/collect`, `ad.doubleclick.net/ccm/s/collect`, `google-analytics.com/g/collect` ; cookies `_gcl_au`, `_ga`, `_ga_2ZYVK404G9` |
| Page suivante de l'app (`/login`) | — | balises chargées d'emblée, bandeau non reposé |
| App web (`/login`) en première visite | 0 requête, 0 cookie, bandeau React affiché | GTM, Google Ads, requête Google Ads émise |
| « Refuser » puis `/tarifs`, `/login` | 0 requête, 0 cookie sur trois pages | — |
| Accord donné à l'ancien bandeau (Meta seul) | 0 requête, question reposée | — |

Les points de collecte de Google sont coupés à la sortie par le test
(émis — c'est la preuve —, jamais reçus : aucune visite de test dans les
statistiques ni dans les conversions). Première passe : `google.com/rmkt/collect`
manquait à la liste coupée, deux passages de remarketing depuis 127.0.0.1 sont
partis ; corrigé.

## Vitesse — accueil, mobile (Lighthouse 13.5.0, 3 passages, même poste)

Première visite (aucune réponse au bandeau : ce que voient Google, les robots
et tout nouveau visiteur). Mesure « avant » sur la sortie 8b34a58 (balises
chargées d'office), envoi des visites coupé (`--blocked-url-patterns`), les
scripts eux-mêmes chargés.

| | Perf. | LCP | Blocage (TBT) | Poids |
|---|---|---|---|---|
| Avant (8b34a58) | **88** (59 / 89 / 88) | 3,2 s | 250 ms | 709 Kio (dont ~617 Kio de scripts Google) |
| Après | **100** (100 / 100 / 100) | 1,7 s | 0 ms | 107 Kio |

Après l'accord, la page charge les mêmes scripts qu'avant (même coût).
