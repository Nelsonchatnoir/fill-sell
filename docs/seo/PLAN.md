# Plan SEO/GEO — FillSell n° 1 du crosslisting (09/10/2026)

Sources : `docs/seo/etat-des-lieux/*` (audit, rendu, fiche de vérité + contre-vérification,
design, réponses des IA, mots-clés FR/EN), `docs/seo/concurrents/*` (14 outils vérifiés),
`docs/seo/ARCHITECTURE.md` (v2).

## 1. Ce qui décide du plan

1. Sans JS, l'accueil est vide : tant que ce n'est pas réglé, rien d'autre ne compte pour
   les IA. → site vitrine en HTML complet (architecture v2).
2. Cloudflare renvoie 403 à GPTBot, ClaudeBot, CCBot, anthropic-ai, Claude-Web, Bytespider,
   Amazonbot, cohere-ai, Diffbot. Passent : OAI-SearchBot, ChatGPT-User, Claude-SearchBot,
   Claude-User, PerplexityBot, Googlebot, Bingbot, Applebot. → décision de Nico (Cloudflare).
3. Les IA citent FillSell 1/10 (ChatGPT), 0/9 (Aperçus IA de Google) ; 1er dès que la
   question nomme « Vinted, Leboncoin, eBay et Beebs » (relevé du 09/10, avant Depop). Ce qu'elles citent : des comparatifs
   datés écrits par des concurrents, des pages « X vs Y » / « alternative à », des prix en clair.
4. Les Français ne tapent pas « crosslisting » : ils tapent le TRAJET (« importer annonce
   vinted sur leboncoin », « transférer vinted beebs ») ou le GESTE (« remonter annonce
   vinted », « ia vinted », « extension vinted »). Le mot « crosslisting » sert la GEO et
   l'anglais.
5. Failles : Vinted ↔ Beebs (aucune page qui explique), « éviter la double vente » (aucun
   outil cité par ChatGPT), règles et risques des comptes (aucune page honnête de référence),
   Crosslist qui arrête Vinted pour les nouveaux inscrits (02/10), eBay par l'API officielle
   (ordinateur éteint) jamais mis en avant.
6. Le public anglophone servable AUJOURD'HUI = anglophones en France/UE (pas encore UK/US) :
   le dire dans le texte, daté.
7. **International (consigne de Nico, 09/10)** : FillSell ouvrira un jour à l'Europe et au
   monde. Le site est bâti pour : langues déclarées dans une liste (ajouter `/de`, `/it`…
   sans toucher au moteur), plateformes et pays en données, slugs neutres (pas de « france »
   dans les URL de fond), périmètre actuel dit dans le texte et daté (« aujourd'hui »),
   jamais comme une identité. Positionnement : « l'app de crosslisting pilotée depuis le
   téléphone », qui fonctionne aujourd'hui avec Vinted, Leboncoin, eBay, Beebs et Depop.
8. **Décisions de Nico du 09/10 (priment sur tout le reste)** — `etat-des-lieux/03c-decisions-nico-0910.md` :
   Depop dans FillSell (ouverture le 10/10, remplace Opla) et présenté PARTOUT (publication,
   synchronisation, retrait des copies à la vente, republication automatique — mise à jour de Nico) ;
   Opla NULLE PART ; republication automatique sur Vinted, Leboncoin, Beebs et Depop, à TOUS
   les paliers (jamais de palier écrit à côté) ; eBay : pas de republication, on n'en parle pas ;
   la liste des plateformes à republication automatique est UNE donnée (`site/donnees/plateformes.yml`)
   et un jeton dans les textes : si la republication Depop n'est pas active au GO, une ligne la retire ;
   ton OFFENSIF, ultra vendeur, comparatifs à notre avantage — seule limite : rien que l'app ne
   fasse au moment de la mise en ligne (et aucun dénigrement, aucun faux chiffre) ; AUCUN chiffre de quota ni de plafond, nulle part ;
   logos : texte + non-affiliation sur les pages, logos de l'app dans captures et vidéo ;
   chiffres de démonstration « Camille » seulement ; objectif : donner ULTRA envie.

## 2. Règles de contenu (rappel)

- Rien hors de la fiche de vérité (`03-fiche-de-verite.md`, lignes « corrigé par
  contre-vérification » comprises). Lexique § 15 (bannis : bot, robot, temps réel, 100 %
  automatique, zéro risque, illimité sans objet, publié partout en même temps, retrait
  automatique partout, un e-mail à chaque vente, partenaire officiel).
- Ventes : enregistrées seules sur Vinted et eBay (preuve) ; sur Leboncoin et Beebs, la
  personne confirme d'un geste ; les copies PROUVÉES sont retirées ; sinon « Déjà vendu ? ».
- Ordinateur : allumé avec Chrome ouvert pour Vinted, Leboncoin, Beebs ; éteint, les actions
  attendent ; eBay relié publie par l'API officielle même ordinateur éteint. L'ordinateur est
  un atout : le téléphone pilote, l'ordinateur exécute, dans TA session.
- Ton : pages produit au tutoiement (accueil, app, stores) ; articles du blog au vouvoiement
  (articles existants). Aucun changement de ton sans Nico.
- Logos Vinted et eBay : interdits sans autorisation écrite → noms en texte + mention « FillSell
  n'est affilié à aucune de ces plateformes ».
- Aucun Opla, aucun Cloud ; Depop présent partout (décision de Nico) ; aucune personne de
  l'équipe nommée.
- Aucun chiffre de quota ni de plafond, même sur la carte tarifs (décision de Nico) : prix et
  fonctions seulement.
- Concurrents : faits datés et sourcés, fonctions comparables, ce qu'ils font bien, aucun
  dénigrement ; « FillSell est notre produit » en tête de chaque comparatif + bloc méthode.

## 3. Pages (FR à la racine, EN sous /en/) — requête visée

### Vitrine (tutoiement)
| id | FR | EN | requête principale |
|---|---|---|---|
| accueil | `/` | `/en` | application crosslisting · publier sur Vinted et Leboncoin en même temps · publier une annonce sur plusieurs sites / crosslisting app for Vinted France |
| comment | `/comment-ca-marche` | `/en/how-it-works` | comment faire du crosslisting / how crosslisting works |
| tarifs | `/tarifs` | `/en/pricing` | FillSell prix / FillSell pricing |
| pilier | `/crosslisting` | `/en/crosslisting` | crosslisting, cross-listing, multi-publication seconde main (guide complet France) |
| trajet-vinted-beebs | `/crosslisting/vinted-beebs` | `/en/crosslisting/vinted-beebs` | transférer annonce vinted sur beebs, importer son dressing vinted sur beebs |
| trajet-vinted-ebay | `/crosslisting/vinted-ebay` | `/en/crosslisting/vinted-ebay` | vendre sur ebay et vinted, crosslist Vinted and eBay |
| trajet-leboncoin-ebay | `/crosslisting/leboncoin-ebay` | — | vendre sur leboncoin et ebay, mettre annonce leboncoin sur ebay |
| trajet-vinted-depop | `/crosslisting/vinted-depop` | `/en/crosslisting/vinted-depop` | vendre sur vinted et depop / crosslist Vinted and Depop |
| trajet-leboncoin-beebs | `/crosslisting/leboncoin-beebs` | — | vendre vêtements enfant leboncoin ou beebs |
| trajet-vinted-leboncoin | (article existant `/blog/cross-listing-vinted-leboncoin`) | `/en/crosslisting/vinted-leboncoin` | vinted et leboncoin en même temps / leboncoin to vinted |
| plateforme-vinted | `/plateformes/vinted` | `/en/platforms/vinted` | outil pour revendeur Vinted, extension vinted |
| plateforme-leboncoin | `/plateformes/leboncoin` | `/en/platforms/leboncoin` | outil leboncoin multi-annonces / leboncoin in English |
| plateforme-ebay | `/plateformes/ebay` | `/en/platforms/ebay` | publier sur ebay depuis son téléphone, API officielle |
| plateforme-beebs | `/plateformes/beebs` | `/en/platforms/beebs` | vendre sur beebs, outil beebs |
| plateforme-depop | `/plateformes/depop` | `/en/platforms/depop` | vendre sur depop, outil depop / Depop crosslisting tool |
| fonction-lens | `/fonctions/lens` | `/en/features/lens` | ia vinted, générateur d'annonce, chatgpt vinted |
| fonction-synchro | `/fonctions/synchronisation` | `/en/features/sync` | importer ses annonces, regrouper son stock multi-plateformes |
| fonction-republication | `/fonctions/republication` | `/en/features/relisting` | republier / remonter annonce vinted, leboncoin, beebs, depop |
| fonction-ventes | `/fonctions/ventes-et-retraits` | `/en/features/sales-and-delisting` | éviter la double vente, retirer une annonce vendue partout |
| securite | `/securite-des-comptes` | `/en/account-safety` | vinted activité automatisée, outil vinted risque, relist without getting banned |
| classement | `/comparatif/meilleures-applications-crosslisting` | `/en/compare/best-crosslisting-apps` | meilleure application crosslisting France 2026 / best crosslisting app for Vinted |
| vs-<outil> × 14 | `/comparatif/fillsell-vs-<outil>` | `/en/compare/fillsell-vs-<outil>` | FillSell vs StoFlow, FlowDino, Flypr, Klork, Redrip, Reposter, Relistly, FLUF Connect, Crosslist, Vendoo, List Perfectly, Clemz, DressKare, Margeo |
| alternative-<outil> × 3 | `/alternative/<outil>` | `/en/alternatives/<outil>` | alternative à Vendoo / Crosslist / List Perfectly (Europe, Vinted France) |
| faq | `/faq` | `/en/faq` | questions types (publie seul ? ordinateur ? plateformes ? vente ? prix ? données ?) |
| glossaire | `/glossaire` | `/en/glossary` | crosslisting, crossposting, republication, double vente… (définitions pour les IA) |
| blog | `/blog` | `/en/blog` | index |

### Blog (vouvoiement en FR)
| id | FR | EN | requête |
|---|---|---|---|
| article-vinted-leboncoin | `/blog/cross-listing-vinted-leboncoin` (refait, même URL) | ↔ `/en/crosslisting/vinted-leboncoin` | vendre sur Vinted et Leboncoin en même temps |
| article-double-vente | `/blog/vendre-meme-article-vinted-leboncoin-ebay-beebs` (recentré double vente) | `/blog/sell-same-item-vinted-leboncoin-ebay-beebs` (refait) | double vente Vinted Leboncoin |
| article-profits | `/blog/comment-calculer-profits-vinted` (refait : frais eBay particuliers 0 € depuis le 01/09/2026, frais Depop justes et datés) | `/blog/how-to-calculate-reselling-profits` (refait, euros, jumeau) | calculer sa marge revendeur |
| article-republier | `/blog/republier-annonces-vinted` | `/blog/relist-vinted-listings` | republier / remonter annonce vinted |
| article-plateformes | `/blog/combien-de-plateformes-pour-vendre` | `/blog/how-many-platforms-to-sell-on` | vendre plus vite, sur combien de plateformes |
| article-annonce | `/blog/rediger-une-annonce-qui-vend` | `/blog/write-a-listing-that-sells` | rédiger une annonce Vinted qui vend, ia vinted |
| article-leboncoin-en | — | `/blog/sell-on-leboncoin-in-english` | leboncoin in English (expatriés) |
| (fusion) | `/blog/publier-annonce-plusieurs-plateformes` → **301** `/crosslisting` | | |

### Préparé, NON publié (`brouillon: true`)
`/sans-ordinateur` (FillSell Cloud). Listée, jamais générée.

## 4. Maillage

- En-tête : Comment ça marche · Plateformes (menu) · Comparatif · Tarifs · Blog · FAQ · FR/EN.
- Pied de page : tous les hubs (crosslisting, plateformes, fonctions, comparatifs, blog,
  FAQ, glossaire, sécurité, tarifs) + mentions + non-affiliation.
- Pilier `/crosslisting` → chaque trajet, chaque plateforme, classement, glossaire.
- Chaque trajet → ses deux plateformes, fonction ventes, comment ça marche, un article.
- Chaque plateforme → ses trajets, fonctions utiles, sécurité.
- Chaque vs → classement, alternative correspondante, tarifs, FAQ.
- Chaque article → la page produit correspondante (CTA contextuel, jamais « dictez vos achats »).
- Textes de lien descriptifs (« publier tes annonces Vinted sur Beebs »), jamais « cliquez ici ».

## 5. Médias

- Captures RÉELLES de l'app par le harnais `scripts/apercu` (vrais composants, données
  fictives crédibles) dans un cadre de téléphone, même style partout ; WebP/AVIF.
- Extension : barre d'outils Chrome (capture existante réutilisable) + écran de l'extension.
- Vidéo (`C:\Users\nicol\fillsell-video`, 80 s, 9:16) : variante « site » SANS la scène
  « Bientôt : FillSell Cloud », < 6 Mo, poster, lecture au clic ; chiffres du compte de Nico
  permis (« uniquement celles de MON compte »), à confirmer à la livraison.
- Une image Open Graph par page, générée (titre + plateformes en texte + marque).

## 6. Hors périmètre, signalé

Fiches stores (Opla, « offertes à vie », langue EN seule, éditeurs différents, mots
« crosslisting » absents) ; CGV de /legal (« le retrait attend ta confirmation », 45/jour,
sous-traitants IA absents) ; gtag Google Ads chargé sans consentement ; annonce de test
Leboncoin indexée (« TEST FILLSELL ») ; renouvellement du domaine (expire le 04/04/2027) ;
profil TikTok du sameAs (@fill.sell vide, @fillsell.app actif).
