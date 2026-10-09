# 05 — Ce que répondent les IA aujourd'hui (09/10/2026)

> Étape 3.5 du chantier SEO/GEO. Observé le **2026-10-09 entre 14:45 et 15:25 (heure de Paris)**,
> dans le Chrome de Nico, dans des onglets ouverts pour l'occasion puis fermés.
> Lecture seule : aucune connexion, aucun compte créé, aucun formulaire envoyé, aucun SQL, aucun commit.
> Chaque réponse d'IA est **un seul tirage** : les assistants ne rendent pas deux fois la même chose.
> Ce rapport photographie un jour donné. Ce n'est pas une moyenne.

---

## 0. L'essentiel en dix lignes

1. **ChatGPT** (gpt-6, avec recherche web) cite FillSell dans **1 réponse sur 10** questions types
   (« outil multi-publication seconde main », **4e sur 4**). Sur les **9 Aperçus IA de Google**
   obtenus, il en cite **0** ; la 10e requête n'a pas eu d'Aperçu IA.
2. FillSell **gagne dès que la question nomme Beebs** : il est **1er chez ChatGPT et 1er dans l'Aperçu IA de Google**
   pour « publier en une fois sur Vinted, Leboncoin, eBay et Beebs ». Il est aussi **3e dans l'Aperçu IA**
   et **1er en résultat naturel Google** (article de blog) pour « application crosslisting Vinted Leboncoin ».
3. Les IA ne décrivent FillSell **qu'à partir de ses fiches de store**, Chrome Web Store surtout, puis App Store.
   Aucun comparatif, aucun média, aucun fil Reddit ne le nomme.
4. ChatGPT **lit la fiche de FillSell sans la retenir** : la fiche App Store pour la question 1, la fiche
   Chrome Web Store pour la question 2 et pour « application crosslisting Vinted Leboncoin ».
   Il recommande à la place les outils qui ont une page comparative (Relistly, StoFlow, MULTX, Reposter, Redrip).
5. Les sources qui pèsent : les **comparatifs écrits par les concurrents** (Relistly et StoFlow sont cités dans
   6 réponses ChatGPT sur 10, FlowDino, Margeo), les **fiches de store**, puis **Reddit, les groupes Facebook et
   YouTube** dans Google. Il faut y ajouter les pages d'aide de Vinted, Leboncoin et eBay.
6. Le comparatif **Margeo** (Jules Bege, publié le 15/06, mis à jour le 05/10/2026) affirme qu'**aucun outil**
   ne crossliste Vinted et Leboncoin « de façon officielle et conforme aux CGU ». Il ne cite **ni FillSell ni
   aucun outil français**. Il est **2e sur Bing**. Margeo est un concurrent (suivi de marge).
7. **Homonyme gênant** : « FillSell‑Sourcing & Dropshipping », une app Shopify (domaine fillsell.com), a des
   copies sur appnavigator.io, growave.io et d'autres sites. Dans les conversations passées de Nico,
   la barre latérale de Gemini montre des titres « FillSell : dropshipping / print on demand ».
8. Les fiches publiques sont **périmées ou incohérentes** : Opla figure comme 5e plateforme sur l'App Store et
   sur Google Play (Opla sort le 10/10). L'App Store déclare la langue **anglais** seulement. Le nom de l'éditeur
   change d'un store à l'autre (3 variantes). Le miroir mwm.ai sert encore une **ancienne** description
   (« commande vocale », 20 articles gratuits).
9. La preuve sociale est faible et visible : 1 avis sur le Chrome Web Store (360 utilisateurs), 3 notes sur
   l'App Store, **aucune note** sur Google Play (500+ téléchargements). **ScamDoc donne 25 %**
   (« Indice de confiance faible »), à cause d'un domaine récent qui expire le 04/04/2027. ChatGPT,
   interrogé sur la marque, donne un verdict de **6,5/10 : « trop peu évaluée »**.
10. Google indexe **une annonce de test Leboncoin intitulée « TEST FILLSELL - ne pas acheter »**.
    Elle remonte en 5e position sur « FillSell avis ».

---

## 1. Méthode et accès, assistant par assistant

| Assistant | Accès obtenu ? | Conditions |
|---|---|---|
| **Perplexity** (perplexity.ai) | **Non** | Il y a eu 2 essais : par l'URL `?q=`, puis en tapant dans la page d'accueil. Les deux fois, la réponse a été « Inscrivez-vous et répétez votre demande. » (14:45). L'essai a été abandonné. |
| **ChatGPT** (chatgpt.com) | **Oui** | Le Chrome de Nico est déjà connecté (offre « Go »). Les questions ont été posées en **« Chat éphémère »**, mode **« Non personnalisé »** : ce mode ignore la mémoire, les plugins et les instructions, et rien n'est gardé dans l'historique. Le modèle résolu est **gpt-6**. La recherche web part toute seule (appel `web.run`), sauf pour la question 9. Une conversation neuve a été ouverte par question. Les sources ont été relevées **exactement** : chaque balise de citation a été rapprochée de son résultat de recherche (JSON de la conversation lu dans la page, en lecture). |
| **Microsoft Copilot** | **Non** | copilot.microsoft.com renvoie vers une page « Se connecter » sur copilot.com/fr-fr ; le site indique que Copilot est gratuit « avec un compte Microsoft connecté ». Le 2e essai sur `bing.com/copilotsearch?q=` a donné une page vide (aucune réponse générée en 28 s). L'essai a été abandonné. Le **Bing classique** a été relevé à la place, car c'est l'index sur lequel s'appuie Copilot (§ 3.3). |
| **Google** (google.fr, `hl=fr`) | **Oui** | Un **Aperçu IA** est apparu sur 9 requêtes sur 10, plus sur 2 des 3 requêtes de contrôle. Le Chrome est connecté à un compte Google : une **personnalisation** des résultats est possible. Elle n'a pas été mesurée. |
| **Gemini** (gemini.google.com) | **Ouvert, mais aucune réponse** | Gemini s'est ouvert sans aucun geste de connexion (compte Google déjà connecté) et la « Discussion temporaire » a été activée. La question a été saisie mais n'est **jamais partie**, après 3 essais : clic, touche Entrée simulée, clic par référence. La fenêtre Chrome tournait en arrière-plan (`visibilityState = hidden` ; les captures d'écran échouaient). |
| *Outil WebSearch de Claude* (index US) | Oui | Il sert de témoin d'un **autre** moteur d'IA. Sa description de FillSell est reprise au § 6.3. |

Les **10 questions types** ont été posées telles quelles, sans autre consigne. Trois **requêtes de contrôle**
ont été ajoutées pour comprendre les écarts :
- C1 « application crosslisting Vinted Leboncoin » ;
- C2 « quelle application pour publier en une fois sur Vinted, Leboncoin, eBay et Beebs ? » ;
- C3 « FillSell avis » (requête de marque).

---

## 2. Tableau de synthèse

Légende : **FS** = FillSell. « lu, non retenu » = la page de FillSell figure dans les résultats que ChatGPT a lus,
mais la réponse ne la cite pas.

| # | Question | ChatGPT : outils, dans l'ordre | FS chez ChatGPT | Aperçu IA de Google : outils, dans l'ordre | FS chez Google |
|---|---|---|---|---|---|
| Q1 | quelle application pour faire du crosslisting en France ? | FLUF Connect, MULTX, Relistly | **non** (App Store FS lu, non retenu) | StoFlow, Crosslist, TradyList, SyncListing | non |
| Q2 | comment publier une annonce sur Vinted et Leboncoin en même temps ? | méthode manuelle, puis Reposter | **non** (CWS FS lu, non retenu) | Redrip, Reposter, TradyList, puis la méthode manuelle | non |
| Q3 | crossposting Vinted eBay | Relistly, List Perfectly, SyncListing (réponse en anglais) | non | Listelf, TradyList, « Crosslist ou Sell the Flip » | non |
| Q4 | meilleure app pour revendeur Vinted | ResellTrack, Bleam, VintedCRM, Refind | non | Restockr, OptiSell, Bleam, Dotb, Vinteer (+ Resell Track), Souk | non |
| Q5 | outil multi-publication seconde main | MULTX, Relistly, FLUF Connect, **FillSell** | **OUI, 4e/4** | FlowDino, Vintex, Resell-io, Repost, DressKare | non |
| Q6 | alternative à Vendoo en France | StoFlow, Relistly, DressKare, Margeo | non | DressKare, StoFlow, Crosslist, List Perfectly | non |
| Q7 | comment éviter la double vente entre Vinted et Leboncoin | méthodes manuelles ; « certains outils » sans nom | non | méthode manuelle, puis Redrip, StoFlow | non |
| Q8 | best crosslisting app for Vinted | Relistly, StoFlow, List Perfectly | non | Crosslist, Vendoo, Crosslisting Wizard | non |
| Q9 | crosslist Vinted and eBay | Crosslist, Vendoo, List Perfectly (**sans recherche web**) | non | *pas d'Aperçu IA* | non (absent des 8 premiers résultats) |
| Q10 | Vendoo alternative Europe | Relistly, StoFlow, List Perfectly, Vendoo | non | Crosslist, List Perfectly, Reclaim, FLYP | non |
| C1 | application crosslisting Vinted Leboncoin | Redrip, Reposter, MULTX, Listed AI | **non** (CWS FS lu, non retenu) | StoFlow, Reposter, **FillSell**, FlowDino, Redrip | **OUI, 3e/5** ; blog FS **1er** en résultat naturel |
| C2 | …publier en une fois sur Vinted, Leboncoin, eBay et Beebs ? | **FillSell** (« Mon premier choix »), FlowDino | **OUI, 1er** | **FillSell**, FlowDino, Listed AI | **OUI, 1er** |
| C3 | FillSell avis | FS connu ; verdict « 6,5/10 », « trop peu évaluée » | (marque) | *pas d'Aperçu IA* ; App Store, Play, **ScamDoc 25 %**, **annonce de test LBC** | (marque) |

**Score brut sur les 10 questions types** : ChatGPT **1/10** ; Aperçu IA de Google **0/9**.
Les concurrents qui reviennent le plus :
- chez ChatGPT : **Relistly (cité dans 6/10)**, **StoFlow (cité dans 6/10)**, List Perfectly (nommé dans 4/10),
  MULTX et FLUF Connect (cités dans 2/10 chacun ; MULTX revient en C1) ;
- chez Google : StoFlow, Crosslist, DressKare, TradyList, Redrip, Reposter, FlowDino.

---

## 3. Détail par question

### 3.1 ChatGPT (gpt-6, chat éphémère non personnalisé, recherche web)

Les sources **citées** sont celles que la réponse rattache à une phrase. Les sources **lues** sont tous les
résultats que ChatGPT a ramenés (`search_result_groups`). Les URL sont données sans leurs paramètres.

**Q1. « quelle application pour faire du crosslisting en France ? »** (conversation 6ac8e244)
- Outils, dans l'ordre :
  1. FLUF Connect (« le plus polyvalent », dès 9 £/mois, essai 1 £) ;
  2. MULTX (Vinted, Leboncoin, 2ememain, 9,90 €/mois) ;
  3. Relistly (14 €/mois, 14 jours d'essai).
  La réponse insiste sur le critère du **retrait automatique après une vente**.
- Citées :
  - https://www.flowdino.com/blog/meilleur-logiciel-crosslisting-2026
  - https://stoflow.com/blog/meilleur-logiciel-crosslisting-2026
  - https://fluf.io/fr/integrations/
  - https://fluf.io/fr/pricing
  - https://www.multx.app/
  - https://www.relistly.io/logiciel-crosslisting-vinted
  - https://relistly.io/pricing
- Lues (51) : en plus des précédentes, secondmainmag.com, collectalert.eu, resellvinted.fr, friptadium.com,
  apps.apple.com (FLUF Connect), econono.com, ruit.es, reposter.io, dresskare.com, recastly.co, referaly.fr,
  vstorm.fr, monitorius.fr, phototolisting.com, combak.co, deux pages Chrome Web Store (CrossResell, Vinted
  Assistant), une douzaine de pages Relistly, ainsi que
  **https://apps.apple.com/fr/app/fillsell-achat-revente/id6762152785**. ChatGPT a vu l'extrait « Assistant IA
  pour revendeurs · Gratuit · Achats intégrés · 3 notes 5,0 · Économie et entreprise », **sans retenir FillSell**.

**Q2. « comment publier une annonce sur Vinted et Leboncoin en même temps ? »** (6ac8e2e2)
- La réponse donne d'abord la méthode manuelle (copier-coller, puis supprimer l'autre annonce), puis un seul outil :
  **Reposter**.
- Citée : https://reposter.io/
- Lues (40, dont 24 pages d'aide Leboncoin) :
  - stoflow.com/blog/vendre-sur-vinted-et-leboncoin-en-meme-temps ;
  - les pages de reposter.io (multiposting-leboncoin-vinted, transferer-annonces-leboncoin-vinted) ;
  - lbcxrocket.fr/blog/vendre-vinted-leboncoin-en-meme-temps, dresskare.com, relistly.io, secondmainmag.com ;
  - **la fiche Chrome Web Store de FillSell** (extrait « 5,0 (1 avis) … Extension · Outils »), **non retenue**.

**Q3. « crossposting Vinted eBay »** (6ac8e37b) — réponse **en anglais**, pour un vendeur « based in France »
- Outils : Relistly, List Perfectly, SyncListing (extension Chrome, publication manuelle). La réponse met en garde
  contre les conditions d'utilisation de Vinted pour les outils externes.
- Citées :
  - relistly.io/logiciel-crosslisting-vinted, relistly.io/integrations/vinted,
    relistly.io/guides/crosslisting-tools-that-support-vinted ;
  - https://chromewebstore.google.com/detail/cross-listing-tool-crossl/bfgeiiiiinkjdlejghgonpdkgjbbgbfl ;
  - https://www.vinted.com/terms-and-conditions
- Lues (25) : aide Vinted et eBay, flowdino, jarvisforvinted.com/blog/comparatif-outils-automatisation-vinted,
  **vint-aide.com/t/recherche-crosslister-fr/3616** (forum), cassou.app/fr/blog/restriction-vinted-automatisation,
  friptadium, secondmainmag, company.vinted.com. **FillSell : 0 mention, même parmi les pages lues.**

**Q4. « meilleure app pour revendeur Vinted »** (6ac8e3ee)
- ChatGPT comprend la question comme de l'achat-revente (le sourcing). Outils : ResellTrack, Bleam, VintedCRM,
  Refind.
- Citées :
  - https://revendor.app/fr/compare/best-vinted-seller-tools
  - https://you-sync.fr/blog/comparatif-outils-gestion-vinted-2026
  - https://apps.apple.com/fr/app/refind-recherche-v%C3%AAtements/id6742743600
  - https://www.vinted.fr/help/62
- Lues (21) : resellvinted.fr, denichor.com, vendremesvetements.com, jarvisforvinted.com, reselltrack.io,
  mondedecharlotte.fr, **reddit.com/r/vinted_france/comments/1sgwt2n**, vstorm.fr, vinteer.io. FillSell : 0.

**Q5. « outil multi-publication seconde main »** (6ac8e47b) — **FillSell cité**
- Outils, dans l'ordre :
  1. MULTX ;
  2. Relistly ;
  3. FLUF Connect ;
  4. **FillSell**. ChatGPT le décrit comme un outil qui automatise la publication « sur Vinted, Leboncoin, eBay et
     Beebs » et qui retire les annonces vendues ailleurs. Il le range dans la catégorie « extension de publication
     multi-plateformes ». Le lien « Site officiel » mène à fillsell.app.
- Source de la ligne FillSell : **uniquement** la fiche Chrome Web Store
  (https://chromewebstore.google.com/detail/fillsell-%E2%80%94-cross-post/ooeagobimgoabciggfamljdfpkginhnm).
- Autres citées :
  - multx.app ;
  - relistly.io/logiciel-crosslisting-vinted ;
  - **messinahembry.fluf.io/fr/logiciel-crosslisting/** (un sous-domaine de FLUF qui ressemble à un lien d'affilié) ;
  - stoflow.com/blog/meilleur-logiciel-crosslisting-2026.

**Q6. « alternative à Vendoo en France »** (6ac8e54b)
- Outils : StoFlow (« le plus adapté à Vinted + Leboncoin »), Relistly, DressKare, Margeo (outil de suivi de marge,
  « pas un remplacement direct »).
- Citées :
  - https://stoflow.com/blog/stoflow-vs-vendoo
  - stoflow.com/blog/meilleur-logiciel-crosslisting-2026
  - relistly.io/guides/crosslisting-tools-that-support-vinted
  - relistly.io/logiciel-crosslisting-vinted
  - stoflow.com/blog/stoflow-vs-dresskare
  - https://margeoapp.com/comparatif/margeo-vs-vendoo
- Lues (17) : relistly.io/compare/relistly-vs-vendoo, stoflow.com/blog/stoflow-vs-reposter-io, flowdino,
  secondmainmag. **Leçon : trois concurrents sur quatre ont une page « X vs Vendoo », et ce sont elles qui sont
  citées.**

**Q7. « comment éviter la double vente entre Vinted et Leboncoin »** (6ac8e58a)
- La réponse donne quatre méthodes manuelles (supprimer l'autre annonce, tableau de suivi, notifications, étiquette)
  et parle de « certains outils de cross-listing » **sans en nommer aucun**.
- Citées :
  - https://stoflow.com/blog/vendre-sur-vinted-et-leboncoin-en-meme-temps
  - https://www.vstorm.fr/cross-post-vinted-leboncoin
- Lues (13) : aide Leboncoin, massresell.fr, aide Vinted, secondmainmag, reddit.com/r/vinted_france/comments/1lrdyry.
  **Personne n'occupe encore la place sur cette question, alors que c'est exactement la promesse de FillSell.**

**Q8. « best crosslisting app for Vinted »** (6ac8e5e7) — réponse en anglais, « for Vinted sellers in France »
- Outils : Relistly (« best overall for Europe »), StoFlow (« best for Vinted + Leboncoin »), List Perfectly.
- Citées :
  - relistly.io/guides/crosslisting-tools-that-support-vinted
  - relistly.io/logiciel-crosslisting-vinted
  - relistly.io/integrations
  - relistly.io/guides/best-crosslisting-apps
  - stoflow.com/blog/meilleur-logiciel-crosslisting-2026
  - stoflow.com/blog/stoflow-vs-crosslist
- Lues (10) : en plus, flowdino, la fiche Chrome Web Store de SyncListing et reddit.com/r/vinted/comments/1wc62ml.

**Q9. « crosslist Vinted and eBay »** (6ac8e622) — **aucune recherche web** (0 appel, 0 source)
- Outils : Crosslist, Vendoo, List Perfectly, avec des liens vers leurs sites.
- **La « mémoire » du modèle, sans recherche, ne connaît que les acteurs anglo-saxons.**

**Q10. « Vendoo alternative Europe »** (6ac8e65e)
- Outils : Relistly, StoFlow, List Perfectly, Vendoo. La réponse note que Vendoo ne liste plus Vinted.
- Citées :
  - relistly.io, relistly.io/why-relistly
  - stoflow.com/blog/stoflow-vs-vendoo
  - relistly.io/guides/crosslisting-tools-that-support-vinted
  - relistly.io/guides/list-on-vinted-depop-and-ebay-at-the-same-time
  - vendoo.co/crosslister
- Lues (20) : **relistly.io/compare/vendoo-alternative-europe** (une page qui porte exactement le mot-clé),
  sellingcurrently.com/vinted-alternatives-europe-2026, omnivaleur.com/vs/omnivaleur-vs-vendoo,
  flowlister.com/blog/vendoo-alternatives, ecomli.com.

**Contrôle C1. « application crosslisting Vinted Leboncoin »** (6ac8ea2a)
- Outils : Redrip (« Vinted Assistant », à tester en premier), Reposter, MULTX, Listed AI.
- Citées :
  - https://chromewebstore.google.com/detail/vinted-assistant-reposte/ljefajifldflgjhipnfabbhjbbhnhoho
  - reposter.io
  - multx.app
  - https://apps.apple.com/fr/app/listed-ai-cr%C3%A9er-des-annonces/id6746462486
- La **fiche Chrome Web Store de FillSell** fait partie des 12 résultats lus, avec 14 mentions brutes, mais
  **FillSell n'est pas retenu**.

**Contrôle C2. « …publier en une fois sur Vinted, Leboncoin, eBay et Beebs ? »** (6ac8e6e1)
- ChatGPT dit avoir trouvé deux solutions qui couvrent les quatre plateformes, FillSell et FlowDino.
  **FillSell est « Mon premier choix »** : publication sur les quatre, fiche rédigée depuis une photo,
  retrait synchronisé, extension Chrome. FlowDino suit, avec Beebs en bêta.
- Citées :
  - https://fillsell.app/
  - https://apps.apple.com/fr/app/fillsell-achat-revente/id6762152785
  - https://www.flowdino.com/register

**Contrôle C3. « FillSell avis : que vaut cette application ? »** (6ac8e69c)
- ChatGPT décrit correctement FillSell : IA pour la revente sur Vinted, Leboncoin, eBay et Beebs, fiche depuis une
  photo, extension Chrome, stock et marges, retrait prévu.
- Points de vigilance qu'il soulève :
  - **peu d'avis** (5/5 sur seulement trois évaluations sur l'App Store FR) ;
  - le prix proposé par l'IA n'est qu'une estimation ;
  - il faut un ordinateur avec Chrome.
- Les prix qu'il a lus dans les achats intégrés de l'App Store : Premium de 9,99 à 12,99 €, Pro environ 29,99 €,
  Business environ 59,99 €.
- **Verdict : 6,5/10.**
- Citées :
  - App Store FR (id6762152785) et App Store « am » (fillsell-reseller-app) ;
  - play.google.com (app.fillsell.app) ;
  - la fiche Chrome Web Store ;
  - fillsell.app.
- Lues (33), en plus :
  - **appnavigator.io/app/fillsell/** (l'homonyme dropshipping, § 6.2) ;
  - **chrome-stats.com/d/ooeagobimgoabciggfamljdfpkginhnm** ;
  - des fils Reddit **sur Vinted et Vendoo** (r/reselling, r/vinted, r/VintedResellers), dont **aucun ne parle de
    FillSell**.

### 3.2 Aperçu IA de Google (google.fr, `hl=fr`)

| # | Aperçu IA | Outils, dans l'ordre | Sources affichées dans l'Aperçu | Premiers résultats naturels (domaines) |
|---|---|---|---|---|
| Q1 | oui | StoFlow (« conçu en France »), Crosslist (source : Google Play), TradyList, SyncListing | CWS SyncListing (24/09/2026), stoflow.com/blog/meilleur-logiciel-crosslisting-2026 (22/07/2026), tradylist.com/fr/crosslisting | 1 reddit r/reselling ; 2 Google Play Crosslist (4,2 ; 107 avis) ; 3 stoflow ; 4 reddit r/Flipping ; 5 tradylist ; 6 App Store « Crosslisting » ; 7 ruit.es ; 8 reddit ; 9 CWS SyncListing |
| Q2 | oui | Redrip, Reposter, TradyList, puis la méthode manuelle | redrip.app (24/06/2026), **groupe Facebook « Vinted Professionnel »** (19/01/2026), reposter.io | 1 redrip.app/blog/multi-listing-vinted-leboncoin ; 2 reposter.io ; 3 redrip ; 4 vint-aide.com (forum) ; 5 reposter ; 6 facebook.com/groups ; 7 flypr.app/blog/cross-posting-vinted-leboncoin ; 8 tradylist |
| Q3 | oui | Listelf, TradyList, « Crosslist ou Sell the Flip », plus des règles (« +30 à 50 % de ventes ») | Crosslist +4, eBay Community, reddit r/BehindTheClosetDoor | crosslist.com/integrations/vinted-to-ebay ; reddit ; listelf.com ; CWS SyncListing ; exportyourstore.com ; community.ebay.com ; resellvault.co.uk ; reddit |
| Q4 | oui | Restockr, OptiSell, Bleam, Dotb, Vinteer (+ Resell Track), Souk | optisell.fr, bleam, **YouTube (Félix Beauregard, 02/08/2026)**, souk.to ; vidéos Instagram, YouTube (Paul Vernat), Facebook | optisell.fr ; souk.to ; reddit ; meanwhile.boutique ; instagram ; getflippd.com ; reddit ; bleam.app |
| Q5 | oui | FlowDino (8 sites, dont Beebs et Opla), Vintex, Resell-io, Repost, DressKare | flowdino, resell-io.com, dresskare.com (2 pages) | repost.fashion ; stoflow ; ruit.es ; dresskare ; vintex.app ; resell-io ; seconde.app ; flowdino ; meanwhile.boutique |
| Q6 | oui | DressKare (9,90 €/mois), StoFlow, Crosslist, List Perfectly | **dresskare.com « DressKare vs Vendoo » (07/10/2026)**, stoflow (22/07/2026), YouTube The Canary Closet | dresskare vs vendoo ; reddit ; webcatalog.io ; stoflow-vs-fluf-connect ; ruit.es ; tradylist comparisons ; reddit ; voolist.com ; shopfront.app |
| Q7 | oui | méthode manuelle (tout sourcé chez Reposter), puis Redrip, StoFlow | redrip.app (28/06/2026), reposter.io, stoflow.com/blog/ne-plus-dependre-de-vinted-seul (05/10/2026) | redrip.app/blog/eviter-double-vente-vinted-leboncoin ; stoflow ; reposter ; redrip ; facebook ; remedystock.com ; redrip ; dresskare ; reposter |
| Q8 | oui | Crosslist, Vendoo (« import inversé »), Crosslisting Wizard | Crosslist +3, YouTube, groupe Facebook « Resellers Connected » | resylr.com ; reddit ; facebook ; relistly.io/guides/best-vinted-crosslisting-app ; nifty.ai ; vendoo.co ; listmycloset.com ; crosslist.com |
| Q9 | **non** | — | — | crosslist.com ; CWS Ruit ; facebook ; reddit r/FlippingUK ; ruit.es ; fiverr ; tiktok ; **crosslist.com/blog/vinted-cross-listing « Why We're Discontinuing Vinted for New Users »** |
| Q10 | oui | Crosslist (« meilleure alternative pour l'Europe »), List Perfectly, Reclaim, FLYP | YouTube Vendoo, reddit, reclaimstuff.com (15/08/2026), vendoo.co/vendoo-alternative | voolist.com ; reddit ; webcatalog.io ; **getapp.co.uk ; vendoo.co ; g2.com ; capterra.co.uk ; softwareadvice.co.uk** ; reclaimstuff.com |
| C1 | oui | StoFlow, Reposter, **FillSell** (source : CWS), FlowDino, Redrip | **CWS FillSell**, stoflow-vs-bleam (05/10/2026), stoflow | **1 fillsell.app/blog/cross-listing-vinted-leboncoin** ; **2 CWS FillSell** ; 3 stoflow ; 4 tradylist ; 5 App Store Listed AI ; 6 reposter ; 7 flowdino ; 8 flypr ; 9 reddit |
| C2 | oui | **FillSell** (source : CWS +1), FlowDino, Listed AI | **CWS FillSell**, flowdino | **1 CWS FillSell** ; 2 flowdino ; **3 instagram.com/reel/DdquYQENSmG (« 1 photo. 5 plateformes… »)** ; 4 tradylist ; 5 Play Listed AI ; 6 reposter ; **7 fillsell.app/blog** ; **8–9 deux reels Instagram FillSell** |
| C3 | non | — | — | 1–2 App Store FillSell ; 3 Google Play ; **4 fr.scamdoc.com/view/2711325 (25 %)** ; **5 leboncoin.fr/ad/decoration/3282378192 « TEST FILLSELL - ne pas acheter (sera retire) »** ; 6 trustpilot (homonyme fansells) ; 7 fillsell.app/blog/cross-listing-vinted-leboncoin ; 8 mwm.ai ; 9 chrome-stats.com |

Ce que disent les Aperçus IA et qui touche FillSell :
- **C2** : l'Aperçu IA décrit FillSell comme une extension et une application qui diffusent l'annonce sur
  « Vinted, Leboncoin, eBay, Beebs **(ainsi qu'Opla)** ». Le texte qui nourrit Google cite donc encore Opla,
  qui sort le 10/10 (§ 7).
- **Q8** : l'Aperçu IA affirme que Vinted « interdit officiellement » les logiciels d'automatisation et de
  crosslisting. Il conseille même de modifier légèrement les photos « pour ne pas être repéré ». Le récit
  « crosslisting Vinted = risque de bannissement » est donc installé. Ce que disent réellement les conditions
  d'utilisation de Vinted **n'a pas été vérifié ici**.
- **Q9** : en résultat naturel, le titre crosslist.com/blog/vinted-cross-listing annonce que **Crosslist arrête
  Vinted pour les nouveaux utilisateurs**. Pourtant, la mémoire de ChatGPT (Q9) et l'Aperçu IA de Google
  (Q8, Q10) le recommandent encore pour Vinted. La matrice de Relistly note aussi que Crosslist ne sert pas les
  résidents de l'UE. Ces réponses vont se périmer : c'est une place à prendre.

### 3.3 Bing classique (l'index dont se sert Copilot), « application crosslisting Vinted Leboncoin » (`setlang=fr`, `cc=FR`)

1. redrip.app/blog/multi-listing-vinted-leboncoin
2. **margeoapp.com/blog** (« Crosslisting France 2026 : 4 apps comparées, verdict »)
3. **fillsell.app/blog/cross-listing-vinted-leboncoin**
4. stoflow.com/blog
5. flowdino.com/blog
6. cross-resell.com
7. stoflow.com/blog/crosslisting-vendre-sur-plusieurs-marketplaces
8. ruit.es
9. **fillsell.app/blog/vendre-meme-article-vinted-leboncoin-ebay-beebs**
10. fluf.io/fr/vendre-plusieurs-plateformes

FillSell a donc **deux pages dans le top 10 de Bing** et **la 1re place sur Google** pour cette requête. Le blog
fonctionne sur les requêtes qui nomment les plateformes. Il ne remonte pas encore sur les requêtes génériques
(« crosslisting en France », « multi-publication », « meilleure app ») ni sur les requêtes anglaises.

---

## 4. (a) Le comparatif Margeo

URL : https://margeoapp.com/blog/comparatif-applications-crosslisting-france-2026, lu dans Chrome le 09/10.

| Élément | Constat |
|---|---|
| Titre `<title>` | « Crosslisting France 2026 : 4 apps comparées, verdict » ; H1 « Comparatif applications crosslisting France 2026 » |
| Auteur | **Jules Bege**, une personne, avec un lien vers margeoapp.com/a-propos/. Éditeur : Margeo |
| Dates | affichée : « Mis à jour le 2026-10-05 · 14 min de lecture » ; JSON-LD : `datePublished` **2026-06-15**, `dateModified` **2026-10-05** |
| Balisage | JSON-LD `Article` + `BreadcrumbList` + **`FAQPage`** + **`HowTo`** ; `robots: index, follow, max-snippet:-1` ; canonique = l'URL |
| Affirmation centrale | Il y a un encadré « Réponse directe » en tête, puis un encadré « CONSTAT 2026 » : **« Aucun outil ne crossliste Vinted + Leboncoin de façon officielle et conforme aux CGU. »** |
| Affirmations liées (paraphrasées) | Vinted n'a pas d'API publique et aucun outil tiers ne pourrait donc publier automatiquement ; Leboncoin n'autoriserait pas le crosslisting automatisé ; tout outil qui prétend publier automatiquement sur Vinted violerait les conditions d'utilisation ; aucune extension ne serait « approuvée officiellement ». Conclusion : le crosslisting automatique « n'existe pas » pour le marché français, et le mieux est la publication manuelle avec un suivi dans Margeo. La FAQ (balisée `FAQPage`) répond « Non » à « Crosslisting Vinted + Leboncoin fiable en 2026 ? ». |
| Outils comparés | Vendoo, List Perfectly, Nifty, Flyp, Crosslist Magic, SellerAider, « extensions Chrome Vinted » (sans nom), publication manuelle, Margeo |
| **FillSell** | **absent** (0 occurrence). Tous les outils français qui annoncent Vinted et Leboncoin sont absents aussi : StoFlow, Relistly, FLUF, MULTX, Reposter, Redrip, DressKare, FlowDino, Vintex, TradyList. Beebs et Opla ne sont pas cités non plus. |
| Intérêt de l'éditeur | Margeo vend un outil de **suivi de marge** (offre Pro à 7,99 €/mois, mise en avant tout au long de l'article). Sa conclusion (« pas d'outil, faites-le à la main et suivez avec Margeo ») sert son offre. |
| Visibilité | **2e sur Bing** pour « application crosslisting Vinted Leboncoin » (§ 3.3). Absent des premiers résultats Google sur les requêtes testées. ChatGPT cite une **autre** page de Margeo (margeoapp.com/comparatif/margeo-vs-vendoo) pour Q6. |
| Exactitude | L'affirmation « aucun outil ne crossliste » est **contredite par des faits publics**. La fiche Chrome Web Store de FillSell annonce la publication automatique sur Vinted, Leboncoin, eBay et Beebs. StoFlow, Reposter, Redrip, MULTX, FLUF Connect et Relistly annoncent eux aussi Vinted et Leboncoin. La nuance « officielle et conforme aux CGU » relève d'une **interprétation juridique** que ce rapport ne tranche pas. FillSell ne doit pas, de son côté, se dire « officiel » ni « approuvé ». |

Ce qu'il faut en retenir : ce format **gagne la citation**. Il donne une réponse directe en tête, une date de mise
à jour fraîche, un auteur nommé, des tableaux plateformes × prix, une FAQ balisée et une procédure balisée (HowTo).
Ce format est neutre et FillSell peut l'utiliser, avec des faits exacts.

---

## 5. Ce que les IA citent, et pourquoi FillSell reste dehors

### 5.1 Les sources qui pèsent

| Type de source | Poids observé | Exemples (09/10) |
|---|---|---|
| **Pages comparatives écrites par un concurrent** : « meilleur logiciel crosslisting 2026 », « X vs Vendoo », « alternative à Y », matrices de plateformes | **Le premier poids chez ChatGPT.** Relistly et StoFlow sont cités chacun dans 6 questions sur 10. | relistly.io/guides/…, relistly.io/compare/vendoo-alternative-europe, stoflow.com/blog/meilleur-logiciel-crosslisting-2026, stoflow.com/blog/stoflow-vs-vendoo, flowdino.com/blog/…, margeoapp.com, dresskare.com « vs Vendoo » (publiée le 07/10 et déjà dans l'Aperçu IA le 09/10) |
| **Fiches de store** (Chrome Web Store, App Store, Google Play) | Fort. C'est **la seule porte d'entrée de FillSell** (Q5, C1, C2, C3). | CWS FillSell, CWS SyncListing, CWS Vinted Assistant (Redrip), App Store Listed AI / Refind, Google Play Crosslist |
| **Pages produit des concurrents**, avec prix et plateformes en clair | Fort. ChatGPT recopie les prix (« 9,90 €/mois », « 14 €/mois », « 9 £/mois »). | multx.app, fluf.io/fr/pricing, relistly.io/pricing, reposter.io |
| **Reddit, groupes Facebook, forums** | Fort chez **Google** (résultats naturels de presque toutes les requêtes ; cartes de l'Aperçu IA en Q2, Q3, Q8, Q10). Lu par ChatGPT, mais peu cité. | r/reselling, r/vinted, r/vinted_france, r/BehindTheClosetDoor, r/Flipping, « Vinted Professionnel » (Facebook), vint-aide.com |
| **Vidéos** (YouTube, Instagram, TikTok) | Cité par Google (Q4, Q6, Q10). | Félix Beauregard (« I Tested 50 Vinted Tools… »), Paul Vernat, The Canary Closet ; **les reels FillSell remontent en C2** |
| **Aide officielle des plateformes** | Pour les questions « comment ». | assistance.leboncoin.info, vinted.fr/help, ebay.fr/help, vinted.com/terms-and-conditions |
| **Annuaires logiciels** | Requêtes « alternative » en anglais. | g2.com, capterra.co.uk, getapp.co.uk, softwareadvice.co.uk, webcatalog.io |
| **« Médias » de niche** | Faible (souvent rédigés avec l'aide d'une IA). | secondmainmag.com (Stefan, 28/05/2026, « rédigé avec assistance IA » : Vendoo et Crosslist seulement) |

Les **quatre comparatifs les plus lus** par ChatGPT ont été relus le 09/10 avec WebFetch. **Aucun ne nomme
FillSell** :
- secondmainmag (Vendoo, Crosslist) ;
- FlowDino (10/08/2026, écrit par l'éditeur de FlowDino) ;
- StoFlow (Matthias, fondateur, publié le 23/07, mis à jour le 06/10/2026, 13 outils, « ne désigne pas un
  gagnant ») ;
- la matrice de Relistly (vérifiée le 28/08 ou le 02/09/2026).

### 5.2 Pourquoi ChatGPT lit FillSell sans le retenir

Ce qui suit sont des **hypothèses**, appuyées sur ce qui a été observé. Aucune n'est prouvée.
1. **Le vocabulaire ne correspond pas.** La fiche App Store s'intitule « FillSell – Achat Revente », avec le
   sous-titre « Assistant IA pour revendeurs ». La fiche Chrome Web Store s'intitule « Cross-post ». Aucune des
   deux ne contient « crosslisting », « cross-listing », « multi-publication » ni « multiposting ». Pour un modèle
   qui cherche un « outil de crosslisting », FillSell ressemble à un assistant d'achat-revente.
2. **La preuve sociale est maigre et comparée.** Un seul avis sur le Chrome Web Store (360 utilisateurs) face à la
   fiche « Vinted Assistant » de Redrip, notée 4,4. Trois notes sur l'App Store, aucune sur Play.
   ChatGPT le dit lui-même en C3 : « trop peu évaluée ».
3. **Aucun tiers ne le confirme.** Aucun comparatif, aucun fil Reddit, aucun média. Les concurrents cités le
   sont tous à travers au moins une page tierce ou une page comparative.
4. **Pas de prix lisible** sur la fiche Chrome Web Store, la source principale. ChatGPT cite des prix pour
   presque tous les autres outils.
5. **Le critère qui le distingue n'est pas formulé là où les IA lisent.** Dès que la question nomme Beebs, ou
   Vinted et Leboncoin, FillSell sort. Le fait d'être le seul à couvrir les quatre plateformes ouvertes à tous,
   avec le retrait automatique, n'apparaît dans **aucune page comparative**.

---

## 6. (b) Les copies publiques de la fiche App Store, les miroirs et les homonymes

### 6.1 La fiche App Store elle-même (relue le 09/10)

**FR** : https://apps.apple.com/fr/app/fillsell-achat-revente/id6762152785
- Nom « FillSell – Achat Revente », sous-titre « Assistant IA pour revendeurs ».
- Gratuit avec achats intégrés ; **3 notes, 5,0** ; 4+ ; catégorie Économie et entreprise.
- Éditeur affiché « Nicolas Svobodny » ; **langue déclarée : « EN Anglais » seulement** ; Version 2.8 du 24 sept. ;
  15 Mo ; iOS 15+.
- La 1re ligne de la description énumère « Vinted, Leboncoin, eBay, Beebs, Opla. » Un intertitre dit
  « PUBLIER SUR LES CINQ, EN UN GESTE ». **Opla est cité plus de cinq fois** (description et nouveautés).
- La description dit encore « des republications offertes à vie », ce qui est faux depuis le 05/10 (cf. `03-fiche-de-verite.md` C05).
- Un seul avis visible : « Enfin une vraie appli pensée pour les revendeurs » (Jordan-1801, 29 juillet).
- La rubrique « Vous aimerez peut-être aussi » propose Optisell, ResellStats, Vintapp, Sell AI, Bleam, BiblioScan,
  ControlResell, Vintelis, FlipStack, Logflip. Apple range donc FillSell parmi les outils de **gestion
  d'achat-revente**, pas parmi les outils de crosslisting.

**US** : https://apps.apple.com/us/app/fillsell-reseller-app/id6762152785
- Nom « **FillSell – Reseller App** », sous-titre « AI Inventory & Profit », catégorie Business, langue EN.
- Même texte, traduit, avec Opla.
- D'autres vitrines ressortent dans les résultats lus par ChatGPT (cm, la, am). Selon la vitrine, la fiche porte
  l'un ou l'autre nom.

### 6.2 Les miroirs et les homonymes

| Site | Ce qu'il montre (09/10) | Problème |
|---|---|---|
| https://mwm.ai/fr/apps/fillsell/6762152785 | « FillSell – Achat Revente », 5,0 (3), « 1k+ » téléchargements (chiffre de mwm.ai), **version 2.7** (alors qu'Apple affiche 2.8), sortie le 27/04/2026, rang « 30+ » en Business US gratuit. Accroche maison : « La gestion manuelle entrave le succès ». | Version en retard ; texte qui n'est pas celui de FillSell |
| https://mwm.ai/apps/fillsell/6762152785 (EN) | Accroche « Manual tracking is dead… all by voice ». FAQ de l'**ancienne** offre gratuite : 20 articles en stock, 5 commandes vocales par jour, 3 estimations Lens par jour. | **Périmé.** C'est la description que reprennent les moteurs qui s'appuient sur ce miroir (§ 6.3) |
| https://appnavigator.io/app/fillsell/ | **« FillSell‑Sourcing&Dropshipping »** : « Find Experienced Dropshipping Agents & Manufacturers in China », app Shopify, 4,3 (39 avis), développeur « fillsell » | **Homonyme**, sans rapport avec FillSell |
| https://apps.shopify.com/fillsell | Même homonyme, développeur fillsell (site **fillsell.com**) ; la fiche dit « This app is not currently available on the Shopify App Store ». Copies sur growave.io (« 5★, 206 avis », 39 $/mois), open.store, discover.commoninja.com | Homonyme encore très présent dans les annuaires ; fillsell.com refuse la connexion (ECONNREFUSED le 09/10) |
| chrome-stats.com/d/ooeagobimgoabciggfamljdfpkginhnm (et /reviews) | Titre « FillSell — Cross-post Statistiques, téléchargement… » (vu dans les résultats de ChatGPT et de Google) | La page renvoie 403 à WebFetch : contenu non vérifié |
| AppAgg, AppAdvice | **Rien trouvé** (WebSearch, 09/10) | — |
| https://fr.scamdoc.com/view/2711325 | **« Indice de confiance faible : 25 % »**, « Vigilance requise ». Deux points négatifs : domaine acquis il y a moins de 6 mois, domaine à « faible espérance de vie ». Domaine créé le 04/04/2026, **expire le 04/04/2027** ; aucune donnée propriétaire dans le Whois. Aucun avis d'utilisateur. 1re analyse le 23/09/2026. Le site propose au propriétaire d'« apporter des éléments ». | **4e résultat Google sur « FillSell avis »** |

### 6.3 Ce que dit un autre moteur d'IA (WebSearch de Claude, index US)

Interrogé sur « FillSell », ce moteur décrit FillSell **d'après mwm.ai, dans sa version ancienne** :
- une app d'IA pour les revendeurs sérieux « on Vinted, eBay, **Depop** and more » ;
- la commande vocale, une offre gratuite limitée à 20 articles, « iPhone » ;
- il dit n'avoir **rien trouvé qui relie FillSell à Beebs ou à Leboncoin** ;
- il signale de lui-même l'homonyme Shopify ;
- il ne trouve **aucun fil Reddit** sur FillSell.

**Depop est une bêta fermée.** Un miroir périmé fait donc dire à une IA ce que FillSell ne doit pas annoncer.

### 6.4 Gemini (indice seulement, non revérifié aujourd'hui)

Dans le compte de Nico, la barre latérale de Gemini montre **les titres** de conversations antérieures (le contenu
n'a pas été lu). On y voit « FillSell : Outil Dropshipping Simplifié », « Fillsell: Dropshipping et POD Avis » et
« Fillsell : Print on Demand Français », à côté de « Fillsell.app : Avis sur l'outil d'achat-revente ».
C'est cohérent avec l'homonyme du § 6.2. Gemini a déjà confondu les deux au moins une fois.

---

## 7. (c) Google Play et Chrome Web Store, tels qu'ils apparaissent publiquement

### Google Play

https://play.google.com/store/apps/details?id=app.fillsell.app&hl=fr&gl=FR, lu dans Chrome le 09/10 :
- Nom « **FillSell** » ; éditeur affiché « **NelsonCatStudio** » ; **500+ téléchargements** ; **aucune note affichée**.
- Catégorie Productivité ; PEGI 3 ; achats in-app ; mise à jour le **24 sept. 2026**.
- Description courte : « Relève et publie tes annonces sur Vinted, Leboncoin, eBay, Beebs et **Opla**. »
- Description longue : celle de l'App Store (« PUBLIER SUR LES CINQ », Opla cité 5 fois, « republications offertes
  à vie »).
- Rubrique Sécurité des données : l'app peut partager « Photos et vidéos et Audio » avec des tiers et collecter
  « Informations personnelles, Informations financières et 3 autres ».

### Chrome Web Store

https://chromewebstore.google.com/detail/fillsell-%E2%80%94-cross-post/ooeagobimgoabciggfamljdfpkginhnm?hl=fr,
lu avec curl le 09/10 (Chrome refuse qu'un script lise la galerie) :
- Nom « **FillSell — Cross-post** » ; catégorie Outils ; **360 utilisateurs** ; **5,0 (1 avis)**.
- Version **0.6.104**, « Dernière mise à jour 8 octobre 2026 » ; 494 Kio ; langue : français.
- La boutique affiche « Créé par le propriétaire du site Web indiqué. L'éditeur a un bon historique ».
- Méta-description : « Publie automatiquement vos annonces FillSell sur Vinted, Leboncoin, Beebs et eBay. »
- Description :
  - la publication automatique multi-plateformes sur ces quatre plateformes ;
  - le suivi en temps réel ;
  - le retrait automatique des annonces vendues ;
  - un fonctionnement « entièrement en arrière-plan, sans fenêtre visible ».
  Elle **ne cite pas Opla** et **ne contient pas « crosslisting »**.
- Éditeur affiché sous son **nom civil complet**, avec une adresse postale et un téléphone (statut de
  professionnel au sens de l'UE). Ces coordonnées ne sont pas reproduites ici.
- La rubrique « Articles similaires » propose Joko, Vintex, Widilo, Vinted Bot, Vintup, Grow Bot, Bleam, ReStockr,
  Leboncoin ReLister, Vinted Assistant, **FlowDino**, Clemz.

**Incohérences d'identité d'une fiche à l'autre** :
- le nom de l'app : « FillSell – Achat Revente », « FillSell – Reseller App », « FillSell », « FillSell — Cross-post » ;
- le nom de l'éditeur : « Nicolas Svobodny », « NelsonCatStudio », le nom civil complet ;
- le nombre de plateformes : 5 sur l'App Store et Play, 4 sur le Chrome Web Store.

Pour une IA qui cherche à reconnaître une **entité**, ce sont autant de signaux dispersés.

---

## 8. Ce qu'il faudrait pour que FillSell entre dans ces réponses

Les actions sont classées par effet attendu. Celles qui demandent un compte, un envoi, un déploiement ou une
modification des stores sont **des gestes de Nico** : ce rapport ne les fait pas.

### P0 — Hygiène : corriger ce que les IA lisent déjà sur FillSell

1. **Fiches App Store et Google Play** (geste de Nico, au plus tard le 10/10) :
   - retirer Opla (« les cinq » devient « les quatre ») ;
   - corriger « republications offertes à vie » ;
   - **déclarer le français** comme langue sur l'App Store ;
   - mettre dans le sous-titre et la première ligne les mots que les gens tapent, par exemple
     « crosslisting / multi-publication Vinted, Leboncoin, eBay, Beebs » ;
   - ne jamais nommer Depop ;
   - unifier le nom de l'éditeur.
2. **Chrome Web Store** : ajouter « crosslisting » et « multi-publication » dans la description, et un ordre de prix
   (ou « gratuit pour commencer »). C'est la source n° 1 des IA pour FillSell.
   La publication est un geste de Nico, sans rapport avec `chrome-extension/`.
3. **Annonce de test Leboncoin indexée** (leboncoin.fr/ad/decoration/3282378192, « TEST FILLSELL », 999 €) :
   - vérifier qu'elle est bien retirée ;
   - pour les prochains tests, ne plus mettre « FillSell » dans le titre (la règle des 999 € reste).
4. **ScamDoc à 25 %** :
   - renouveler le domaine fillsell.app pour plusieurs années (il expire le 04/04/2027 : c'est le critère « faible
     espérance de vie ») ;
   - envisager le formulaire « Apporter des éléments » de ScamDoc.
   Les deux sont des gestes de Nico.
5. **Lever l'homonymie** : sur fillsell.app, une phrase-définition stable et un balisage `Organization` /
   `SoftwareApplication` avec `sameAs` vers les trois stores et les réseaux sociaux. Il faut que les IA
   rattachent « FillSell » à « fillsell.app, crosslisting seconde main, France », et non à fillsell.com
   (dropshipping). Le détail technique relève des étapes 01 et 02.

### P1 — Contenu sur fillsell.app : occuper les formats qui gagnent

Le blog marche déjà sur les requêtes qui nomment les plateformes : 1er sur Google et 3e sur Bing pour
« application crosslisting Vinted Leboncoin ». Il faut l'étendre aux formulations **génériques** et **anglaises**,
dans le format qui est cité aujourd'hui : une réponse directe en tête, une date de mise à jour visible, un auteur
nommé, un tableau plateformes × fonctions × prix, une FAQ balisée, des sources. Les pages à écrire, par priorité :

| Page | Requêtes visées | Pourquoi |
|---|---|---|
| « Éviter la double vente entre Vinted et Leboncoin (et eBay, Beebs) » | Q7, Q2 | Aujourd'hui, **aucun outil n'est nommé** par ChatGPT sur cette question. Or c'est la promesse centrale de FillSell (« vendu une fois, retiré partout »). |
| « Meilleure application de crosslisting en France (2026) » : comparatif honnête et daté, qui inclut FillSell et les concurrents (StoFlow, Relistly, Reposter, Redrip, FlowDino, MULTX, FLUF) avec leurs plateformes vérifiées | Q1, Q5, C1 | C'est ce format qui fait citer Relistly et StoFlow. Sur la ligne « Vinted + Leboncoin + eBay + Beebs », FillSell est le seul. |
| « Alternative à Vendoo en France » / « Vendoo alternative Europe » (FR et EN) | Q6, Q10 | Relistly, StoFlow, DressKare et Margeo ont tous une page de ce type. Vendoo ne couvre plus Vinted, et Crosslist arrête Vinted pour les nouveaux utilisateurs. |
| « Crosslister Vinted et eBay » / « Crosslist Vinted and eBay » (EN) | Q3, Q9 | Aujourd'hui, ces requêtes renvoient vers des outils américains qui ne servent plus l'UE ou plus Vinted. |
| « FillSell et les règles des plateformes » : comment l'extension agit (sessions de la personne, jamais de mot de passe, à la demande), ce qu'elle ne fait pas, sans jamais se dire « officielle » | Q3, Q8, Margeo | Pour répondre au récit « crosslisting = interdit / bannissement », repris par Google (Q8) et par Margeo, avec des faits vérifiables (cf. `03-fiche-de-verite.md` F11). |
| Pages « FillSell vs StoFlow / Reposter / Redrip / Relistly » | C1, Q6 | Ce sont les pages que ChatGPT cite dans les comparaisons. |
| Une page publique **Tarifs** lisible sans JavaScript | toutes | Les IA recopient les prix des concurrents. Pour FillSell, elles ne les trouvent que dans les achats intégrés de l'App Store (C3). |

Toutes ces pages suivent `03-fiche-de-verite.md` : quatre plateformes, pas Opla, pas Depop, pas le Cloud, aucun
chiffre non lu dans la base.

### P2 — Preuve sociale et citations par des tiers (gestes humains, de Nico)

1. **Des avis** sur le Chrome Web Store (1 aujourd'hui), l'App Store (3) et Google Play (0, donc aucune note
   affichée). C'est le premier frein que nomme ChatGPT (6,5/10). La demande d'avis existe déjà dans l'app
   (`avis-demande`) ; il faut aussi viser le Chrome Web Store.
2. **Être cité par les comparatifs** qui nourrissent les IA. secondmainmag.com se présente comme indépendant.
   On peut aussi proposer une correction factuelle à Margeo, dont l'affirmation « aucun outil » est publique et
   vérifiable. Prendre contact est un geste de Nico, jamais automatisé.
3. **Les annuaires logiciels** : G2, Capterra, GetApp, Software Advice, WebCatalog, AlternativeTo. Ils dominent
   les requêtes « alternative » en anglais. L'inscription demande un compte : c'est un geste de Nico.
4. **Reddit, les groupes Facebook de vendeurs, vint-aide.com** : des réponses authentiques signées, jamais de faux
   avis. Google affiche ces fils sur presque toutes les requêtes.
5. **Les créateurs vidéo** déjà cités par Google (Félix Beauregard, Paul Vernat). Les reels Instagram de FillSell
   remontent déjà en C2. Il faut vérifier qu'ils ne promettent plus « 5 plateformes ».
6. **mwm.ai** : ce miroir sert un texte ancien. Il se met à jour depuis la fiche Apple, donc corriger la fiche
   (P0-1) est le remède. Il n'y a rien à faire sur le site lui-même.

### Mesure

Il faut refaire ce panel **une fois par mois**, avec le même protocole : chat éphémère non personnalisé, Google
`hl=fr`, les mêmes 10 questions et les 3 contrôles. L'indicateur est « FillSell cité sur N questions sur 10 »,
assistant par assistant. Point de départ du 09/10/2026 : **ChatGPT 1/10, Aperçu IA Google 0/9**.

---

## 9. À signaler à Nico, hors SEO

- **Annonce de test Leboncoin indexée par Google** : « TEST FILLSELL - ne pas acheter (sera retire) », 999 €,
  leboncoin.fr/ad/decoration/3282378192. L'extrait Google la date d'« il y a 5 jours » et indique « En stock ».
  Son état réel n'a **pas** été vérifié sur Leboncoin.
- **Opla** reste cité sur l'App Store, Google Play et dans l'Aperçu IA de Google (C2) la veille de sa sortie (10/10).
- **App Store** : la langue déclarée est l'anglais seulement, sur une app entièrement en français.
- **Domaine fillsell.app** : il expire le **04/04/2027** (d'après ScamDoc, source Whois/RDAP non relue).
- **L'homonyme fillsell.com** (dropshipping Shopify) brouille l'identité de la marque dans les annuaires et chez
  Gemini.

---

## 10. Limites et ce qui n'a pas été vérifié

- **Un seul tirage** par question et par assistant. Les réponses de ChatGPT changent d'une fois à l'autre.
  Les 10 questions plus les 3 contrôles donnent un ordre de grandeur, pas une statistique.
- **ChatGPT** a été utilisé dans le compte de Nico, mais en éphémère « non personnalisé ». La localisation
  (adresse IP en France) influence visiblement les réponses (« for a seller based in France »).
- **Google** : le navigateur était connecté à un compte Google. Une personnalisation est possible et n'a pas été
  mesurée.
- **Perplexity, Copilot et Gemini** : aucune réponse obtenue (inscription obligatoire, connexion obligatoire,
  envoi bloqué). Leurs réponses **ne sont pas reconstituées** ici.
- Les **conditions d'utilisation de Vinted et de Leboncoin** n'ont pas été lues : les affirmations « interdit »
  de Google et de Margeo ne sont **ni confirmées ni démenties** par ce rapport.
- Les pages chrome-stats.com et le détail des avis de growave.io / open.store n'ont pas été relus (403, ou hors
  sujet).
- Le **blog fillsell.app** n'a pas été consulté en ligne (consigne : aucune connexion à fillsell.app). Sa présence
  dans Bing et Google est constatée dans les pages de résultats. Ses sources sont dans `src/blog/` (6 articles).

---

## Annexe — Identifiants des conversations ChatGPT (éphémères, 09/10/2026)

Q1 6ac8e244 · Q2 6ac8e2e2 · Q3 6ac8e37b · Q4 6ac8e3ee · Q5 6ac8e47b · Q6 6ac8e54b · Q7 6ac8e58a · Q8 6ac8e5e7 ·
Q9 6ac8e622 · Q10 6ac8e65e · C1 6ac8ea2a · C2 6ac8e6e1 · C3 6ac8e69c.
Ces conversations éphémères ne sont pas conservées dans l'historique : les identifiants servent de trace, pas de
lien durable.
