# 06 — Mots-clés en anglais (étape 3.4)

> Chantier SEO/GEO FillSell — état des lieux. Rédigé le **2026-10-09**.
> Toutes les observations externes ci-dessous datent du **2026-10-09** (sauf mention contraire).
> Aucune action publique, aucune connexion à fillsell.app, aucun outil payant.
> Fiche de vérité produit : `docs/seo/etat-des-lieux/03-fiche-de-verite.md` (F31 eBay, F32 Vinted, F54 Depop) — ce rapport s'y aligne.

---

## 0. En bref

1. **FillSell ne sert aucun marché anglophone aujourd'hui.** Il publie sur vinted.fr, Leboncoin, ebay.fr et Beebs, avec des prix en euros. Vinted UK/US est explicitement « hors périmètre » dans le code. eBay UK/US/IE n'est pas servi : un compte eBay étranger est retenu. L'Irlande (vinted.ie) est prête dans l'extension 0.6.106, qui n'est **pas publiée**.
2. Donc **deux publics anglophones seulement sont servables** :
   - **(A) une requête anglaise pour un public France / UE** : anglophones qui vivent en France, vendeurs français qui emploient le jargon anglais (« crosslisting »), et surtout les **moteurs de réponse IA interrogés en anglais (GEO)** ;
   - **(B) un marché anglophone** : seulement l'Irlande sur vinted.ie, plus tard, quand la 0.6.106 sera servie et le pays ouvert.
   Tout le reste (UK, US, Australie, Canada, Poshmark, Mercari, Depop) n'est **pas une cible**.
3. **La demande anglaise sur « Vinted » vient très majoritairement du Royaume-Uni.** Les suggestions Google ajoutent « uk » partout (« how to sell fast on vinted uk », « crosslisting app uk », « vinted bot uk »). Une page anglaise générique sur Vinted attirerait surtout des vendeurs britanniques, que FillSell ne peut pas servir. Chaque page anglaise doit donc dire **« Vinted France / Europe »** dès le titre.
4. **Il y a une faille cette semaine.** Crosslist, le n° 1 anglophone sur « Vinted crosslisting », annonce qu'il **n'ouvre plus Vinted aux nouveaux clients** (page datée du 2 octobre 2026, republiée le 9 octobre). Deux autres constats, rapportés par des concurrents et non vérifiés directement :
   - Crosslist n'accepte pas les résidents de l'UE (Relistly, citant le site de Crosslist) ;
   - le centre d'aide **UE** de Vendoo ne liste pas Vinted (mis à jour le 30/03/2026).
   Les pages qui captent ces requêtes en anglais sont des comparatifs écrits par des concurrents européens (Relistly, FLUF Connect, Ruit). **FillSell n'apparaît dans aucun d'eux.**
5. **Leboncoin, Beebs et eBay.fr en anglais : demande faible, concurrence presque nulle.** Beebs n'est couvert par personne. La requête « leboncoin in english » a une vraie demande, venue des expatriés (variantes « app », « translation », « login »). Les pages en tête sont des médias pour expatriés (The Local, Medium…). FillSell a ici un angle unique : l'app est en anglais, et l'annonce est **rédigée en français** pour les sites français.
6. **Où en est FillSell en anglais ?**
   - La landing EN n'a **pas d'URL propre** : bascule côté client, et le hreflang « en » pointe sur la même URL que le français.
   - Deux articles de blog EN existent. Aucun n'est ressorti sur les requêtes testées.
   - Sur la requête anglaise « sell same item Vinted Leboncoin eBay… », c'est **l'article français** de FillSell qui est cité.
   - Les fiches des stores en anglais citent encore **Opla**, qui sort le 10/10.
   - L'extension (popup, description du Chrome Web Store) est **en français seulement**.

---

## 1. Ce que FillSell sert réellement (vérifié dans le code, worktree `seo-crosslisting` = origin/main)

| Élément | Ce que dit le code | Preuve | Conséquence pour l'anglais |
|---|---|---|---|
| Vinted | Servi : **vinted.fr** (hôtes obligatoires `*.vinted.fr`, `*.vinted.com`). 17 domaines de la zone euro, **dont vinted.ie**, en `optional_host_permissions`, uniquement dans la **0.6.106 non publiée** (0.6.104 servie). « Hors euro (UK, US, CZ, PL, SE, HU, RO, DK, AU) : hors périmètre. » | `chrome-extension/manifest.json:13-43` ; `chrome-extension/vinted-origine.js:28-38` ; `supabase/functions/_shared/vinted-pays.ts:8-9, 50` ; fiche de vérité F32 | Ne jamais cibler « vinted uk ». L'Irlande reste conditionnelle : 0.6.106 publiée **et** pays ouvert (`coin_config vinted_pays_<cc>`, état en prod non lu : aucune requête SQL autorisée). |
| eBay | **EBAY_FR uniquement** (site 71). Un compte eBay inscrit sur un autre site (UK, US, IE…) est **retenu** avant tout appel, avec un message. | `supabase/functions/_shared/ebay-publication.ts:22` ; `_shared/ebay-site.ts:1-40` ; `ebay-api-worker/index.ts:3125-3135` ; F31 | « eBay UK crosslisting », « ebay.co.uk » : non servis. |
| Leboncoin, Beebs | Plateformes françaises (hôtes `*.leboncoin.fr`, `*.beebs.app`). | `manifest.json:16-19` | En anglais, la demande ne peut venir que d'un public vivant en France. |
| Depop | Bêta fermée, compte de Nico seulement. | CLAUDE.md (bandeau Depop) ; F54 | Exclure toutes les requêtes « vinted to depop », « depop crosslister ». |
| Opla | Sortie le 10/10. | CLAUDE.md | Ne pas cibler. Les fiches des stores EN le citent encore (§ 6). |
| Langue de l'app | Dictionnaires `fr` et `en`. L'anglais est choisi par `localStorage fs_lang` ou `navigator.language`. | `src/i18n/translations.js:2` (fr), `:389` (en) ; `src/App.jsx:2259, 6715` | Un anglophone peut utiliser l'app. |
| Langue de l'extension | Popup en français seulement (« Se connecter », « Prête à publier », « Ouvrir l'appli »), pas de `_locales`. | `chrome-extension/popup.html` | L'expérience anglaise est **partielle** : à dire honnêtement sur toute page EN. |
| Langue des annonces rédigées par l'IA | Vinted à l'étranger : dans la langue du site, seulement si le pays est ouvert. « ⛔ JAMAIS L'ANGLAIS DÉDUIT : un compte en anglais sur vinted.fr peut être un compte français. » Pour la France, la rédaction reste en français. | `supabase/functions/_shared/langue-vendeur.ts:1-22` ; `generate-listing/index.ts:1166-1172` | Argument réel : **« écris en anglais dans l'app, l'annonce part en français »**. Ce flux de bout en bout est à vérifier avant de le promettre. |
| Anglophones déjà sur vinted.fr | Le catalogue `en` a été relevé sur des « comptes anglais sur vinted.fr, 14/09 ». | `_shared/vinted-pays.ts:17-18` | Le public (A) **existe** parmi les utilisateurs. |
| Prix | En euros, y compris dans la landing EN (« €12.99 », « €29.99 », « €59.99 »). | `src/pages/LandingPage.jsx:256-290` | Cohérent avec un public UE, pas UK/US. |
| Landing EN | Même URL que le français (bascule côté client). hreflang `fr`, `en` et `x-default` pointent **tous** sur `https://fillsell.app`. | `index.html:65-68` ; `LandingPage.jsx:122-126` | Aucune page anglaise transactionnelle indexable : **prérequis** pour toute requête P1 transactionnelle (décision technique hors de cette étape). |
| Blog EN | Deux articles : `how-to-calculate-reselling-profits` (`lang: en`, sans traduction liée) et `sell-same-item-vinted-leboncoin-ebay-beebs` (paire hreflang avec la version FR). Le sitemap et le hreflang sont générés au build. | `src/blog/*.md` ; `scripts/vite-plugin-prerender-blog.mjs:27-31, 117-126, 234-245` | Base existante. L'article EN renvoie vers un article **FR** (`/blog/cross-listing-vinted-leboncoin`) : maillage EN→FR. |

**Conclusion de périmètre** : l'anglais sert ici (A) le GEO et les anglophones vivant en France, et (B) l'Irlande plus tard. Il ne sert jamais un lancement UK/US, que le produit ne permet pas.

---

## 2. Méthode et limites (à lire avant les chiffres)

- **Suggestions Google** : `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=<us|gb|ie|fr>&q=<graine>`, appelées par curl le 2026-10-09 sur **175 graines** (79 + 66 + 30). L'adresse IP est en France. Le paramètre `gl` ne change presque rien : les différences GB/IE/FR se limitent à « vinted france to ireland » (gl=ie), à l'ordre des suggestions et à quelques mots parasites. Brut conservé dans le dossier de travail de la session (non versionné). Extraits utiles en annexe A.
- **SERP** : outil WebSearch, mode « extended » pour les requêtes clés. ⚠️ L'outil interroge un **index américain**. L'ordre noté est celui renvoyé par l'outil, **pas** une SERP Google localisée UK, IE ou FR : les positions réelles peuvent différer. Les synthèses de l'outil (un moteur de réponse IA) servent aussi d'**indicateur GEO** : qui est cité, qui ne l'est pas.
- **Reddit** : inaccessible à nos outils (« domains are not accessible to our user agent »). Le besoin de forum n'est mesuré que par les suggestions « … reddit ».
- **Bing** (cc=GB) a renvoyé une page « challenge » anti-robot : arrêt immédiat, pas de contournement.
- **Google Trends** : illisible sans navigateur, non utilisé.
- **fillsell.app** n'a pas été interrogé (interdit). Son indexation EN est **déduite** des recherches ; l'opérateur `site:` n'est pas honoré par l'outil.
- **Volumes : estimations qualitatives, jamais des chiffres.** Grille utilisée :
  - **Fort** : suggérée dès la racine, nombreuses déclinaisons, SERP saturée de pages dédiées ;
  - **Moyen** : suggérée sur la racine, plusieurs déclinaisons ;
  - **Faible** : n'apparaît qu'en tapant presque toute la phrase ;
  - **Longue traîne** : aucune suggestion (demande quasi nulle, mais question réelle, utile au GEO).

---

## 3. Le paysage anglophone en un coup d'œil (observé le 2026-10-09)

| Acteur | Ce qui est publié (source vendeur sauf mention) | URL | Lecture pour FillSell |
|---|---|---|---|
| **Crosslist** (US/UK) | « Why We're Discontinuing Vinted for New Users (Existing Users Stay) » : « Crosslist has stopped offering Vinted to new customers ». Raisons données : détection accrue de l'automatisation par Vinted, suspensions de 24 h chez certains utilisateurs. Dates affichées : publiée le 9 oct. 2026, mise à jour le 2 oct. 2026 (incohérence de la page). | https://crosslist.com/marketplaces/vinted ; https://crosslist.com/blog/vinted-cross-listing | Fenêtre ouverte sur « crosslist alternative » et « crosslister for vinted ». Le n° 1 du sujet se retire. |
| Crosslist et l'UE | « Crosslist […] is currently not accepting EU customers » (cité par Relistly ; **non vérifié** sur crosslist.com). | https://relistly.io/guides/best-vinted-crosslisting-app | Les vendeurs Vinted de l'UE n'y avaient déjà pas accès. |
| **Vendoo** | Le centre d'aide **EU** (mis à jour le 30/03/2026) liste « eBay, Etsy, Depop, Whatnot, and Facebook Marketplace » : **pas de Vinted**. Une page « Vinted US » existe. | https://help.vendoo.co/eu/en/articles/8856209-which-marketplaces-does-vendoo-support ; https://vendoo.co/marketplaces/vinted-us | « does vendoo support vinted » : la réponse est **non** pour un vendeur de l'UE. |
| **List Perfectly** | Vinted en bêta. « Officially guarantees only US marketplace versions » (selon Relistly). | https://help.listperfectly.com/en/articles/13187498-vinted-is-now-available-in-list-perfectly-beta-guide | Pas de couverture française démontrée. |
| **Relistly** (« Europe-first ») | Vinted vers 17 places de marché, dont **Leboncoin** (pas Beebs). « €14/mo » dans son propre tableau. Guides « best vinted crosslisting app », « best crosslisting software Europe ». FillSell non cité. | https://relistly.io/guides/best-crosslisting-software-europe | **Concurrent direct en anglais** sur l'angle UE. Ses tableaux contiennent encore des « [confirm] » : contenu fragile. |
| **FLUF Connect** (UK) | Pages en série « Crosslist from X to Y » (Leboncoin→Vinted, Vinted→Leboncoin, eBay→Leboncoin, etc.), environ 1 500 mots, sans date ni FAQ, prix incohérents (£9 / £19 / £29). « Leboncoin vs Vinted — Which Is Better for French Sellers ». | https://fluf.io/crosslisting/leboncoin-to-vinted/ ; https://fluf.io/channels/leboncoin-vs-vinted/ | Occupe les trajets Leboncoin en anglais avec du contenu généré en série. Battable par des pages datées, exactes et fondées sur l'usage réel. |
| **Ruit** | Extension Chrome « crosslist to Vinted, eBay and all your other marketplaces » (la description FR cite Leboncoin selon l'outil de recherche). | https://chromewebstore.google.com/detail/ruit-crosslist-to-vinted/hefanceoeobjfgbfgpglobdngmfeeceb?hl=en | Sa fiche du Chrome Web Store se classe directement : le **titre de la fiche porte le mot-clé**. |
| **Redrip, Relisted** (origine FR, version EN) | Republication Vinted gratuite et IA (Redrip) ; « Republish your Vinted listings in 1 click » (Relisted). Redrip publie en FR sur Vinted→Leboncoin. | https://www.redrip.app/en/ ; https://relisted.io/en/ | Présents sur « relist », « relisting tool », « without getting banned ». |
| **Margeo** (FR) | Suivi de stock et de marge, blog EN (« crosslisting guide resellers 2026 », « how to calculate reselling profit margin »), page « vinted reseller tracker ». | https://margeoapp.com/en/blog/crosslisting-guide-resellers-2026/ | Concurrent français déjà positionné **en anglais** sur la marge et le suivi. |
| **FillSell** | Absent de **tous** les comparatifs et réponses IA observés. Cité seulement quand la requête nomme les quatre plateformes, et alors via **l'article FR**. Fiche Chrome Web Store : « FillSell — Cross-post », description en FR, 360 utilisateurs. | https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm | Gros manque GEO en anglais. |

Signal de demande : dans les suggestions GB et US, la première plateforme accolée à « cross listing » est **Vinted** (« cross listing to vinted », « crosslisting app vinted », « crosslister for vinted »). Vinted est au centre de la demande anglaise de crosslisting hors des États-Unis, mais cette demande est britannique.

---

## 4. Groupes d'intention

Notation :
- « Servi ? » : **Oui** = FillSell le fait pour un vendeur France/UE ; **Partiel** = public majoritairement UK ou expérience EN incomplète ; **Non** = hors produit.
- Top 5 : ordre renvoyé par l'outil le 2026-10-09 (index US). Types : comparatif vendeur, blog, forum, page produit, store.

### G1. Crosslisting générique

| Requête | Intention | Volume | Servi ? |
|---|---|---|---|
| crosslisting app / cross listing app | comparative, transactionnelle | Fort | Partiel (US/UK) |
| crosslisting apps for resellers / cross posting app for resellers | comparative | Moyen | Partiel |
| crosslisting apps free / cross listing app free | transactionnelle | Moyen | Partiel |
| best crosslisting software / best crosslisting tools | comparative | Moyen | Partiel |
| crosslister app / best crosslister | transactionnelle | Moyen | Partiel |
| what is crosslisting / cross listing meaning | informationnelle | Moyen (polluée par « crosslisting in Canvas », sens scolaire) | Oui (glossaire) |

- **Top 5 sur « crosslisting app »** : app.crosslist.com (tableau de bord) ; nifty.ai/post/free-cross-listing-app (comparatif vendeur) ; crosslist.com (produit) ; vendoo.co/free-crosslisting-app (produit) ; vendoo.co (produit). Ensuite : closo.co, threecolts.com, secnd.ca, joinflyp.com.
- **Pourquoi eux** : domaines anciens au nom exact (crosslist.com), autorité de Vendoo et Nifty, comparatifs « 2026 » rafraîchis dans le titre, maillage interne massif.
- **Faille** : aucune pour FillSell, qui ne sert ni Poshmark, ni Mercari, ni le Royaume-Uni. Une simple page « glossaire » EN suffit, pour que les moteurs IA disposent d'une définition qui cite les plateformes **françaises**.
- **FillSell** : absent.

### G2. Crosslisting + Vinted

| Requête | Intention | Volume | Servi ? |
|---|---|---|---|
| crosslisting app vinted / vinted crosslisting app | comparative | Moyen | Partiel (UK majoritaire) |
| best crosslisting app for vinted | comparative | Faible à moyen | Oui (avec l'angle France/UE) |
| crosslister for vinted / is there a crosslister for vinted | transactionnelle | Faible | Oui |
| crosslister that supports vinted / that includes vinted | comparative | Faible | Oui |
| cross listing software vinted | comparative | Faible | Oui |
| crosslist vinted ban / vinted automated activity ban | informationnelle (risque) | Faible | Oui (prudence) |
| vinted crosslisting reddit | recherche de forum | Faible | — |

- **Top 5 sur « best crosslisting app for Vinted »** : 3dsellers.com/blog/best-cross-listing-apps (comparatif) ; nifty.ai (comparatif vendeur) ; crosslist.com/blog/best-crosslisting-apps-for-resellers (comparatif vendeur) ; fiche Chrome Web Store de Ruit (store) ; relistly.io/guides/best-vinted-crosslisting-app (comparatif vendeur). Ensuite : listmycloset.com, voolist.com, underpricedai.com, selleraider.com.
- **Top 5 sur « vinted crosslister »** : fiche Ruit ; fiche « CrossLister » ; listperfectly.com (guide) ; crosslist.com/marketplaces/vinted (annonce de fermeture) ; fiche « Crosslist Magic ». Ensuite : listelf.com, zeedrop.com, Trustpilot.
- **Pourquoi** : comparatifs écrits par les vendeurs eux-mêmes, souvent datés « 2026 » ; les fiches du Chrome Web Store se classent parce que leur **titre contient « crosslist to Vinted »**.
- **Failles** :
  1. Crosslist se retire de Vinted pour les nouveaux clients et, selon Relistly, refuse l'UE ;
  2. Vendoo n'a pas Vinted pour l'UE ;
  3. les réponses IA disent elles-mêmes « sources disagree » sur Flyp et Nifty.
  Une page **datée, sourcée et honnête**, « Crosslisting tools that work with Vinted France (and Leboncoin, eBay.fr, Beebs) », comble un vide que même les moteurs IA signalent.
  Le titre de la fiche Chrome Web Store (« FillSell — Cross-post ») pourrait porter « Vinted » : point d'ASO, à trancher ailleurs.
- **FillSell** : absent.

### G3. Qualificatif Europe / France

| Requête | Intention | Volume | Servi ? |
|---|---|---|---|
| crosslisting europe / crosslist europe / cross listing europe | comparative | Longue traîne (suggérée) | Oui |
| best crosslisting software europe | comparative | Longue traîne | Oui |
| crosslisting app france / ireland / europe | comparative | Longue traîne (0 suggestion) | Oui (France) |

- **Top 5 sur « crosslisting app Europe Vinted Leboncoin »** : fiche Ruit ; relistly (best-vinted-crosslisting-app) ; relistly (best-crosslisting-software-europe) ; fluf.io/channels/leboncoin-vs-vinted ; listmycloset.com. Ensuite : resylr.com, fluf.io (sell-on-vinted-france, leboncoin-to-vinted, etsy-to-leboncoin).
- **Pourquoi** : peu de concurrence, deux acteurs se partagent la requête (Relistly, FLUF) avec du contenu vendeur.
- **Faille** : la réponse IA conclut « For a French seller focused on fashion, FLUF Connect and Ruit are the candidates », sans FillSell, qui couvre pourtant Leboncoin, eBay.fr **et Beebs**. C'est la **requête GEO n° 1** pour FillSell.
- **FillSell** : absent.

### G4. Trajets plateforme → plateforme

| Requête | Intention | Volume | Servi ? |
|---|---|---|---|
| can i sell the same item on vinted and ebay (at the same time) | informationnelle | Moyen | Oui (vinted.fr + ebay.fr ; public UK majoritaire) |
| how to sell on ebay and vinted at the same time / how to list on ebay and vinted at the same time | informationnelle | Moyen | Oui |
| cross list vinted ebay / vinted ebay cross listing | transactionnelle | Faible à moyen | Partiel |
| vinted to ebay crosslister / vinted to ebay lister | transactionnelle | Faible | Partiel (UK) |
| ebay to vinted crosslister / transfer ebay to vinted / import ebay to vinted | transactionnelle | Faible | Partiel (ebay.fr seulement) |
| vinted vs leboncoin (EN) / vinted vs leboncoin reddit | comparative | Faible | Oui |
| vinted leboncoin ebay | comparative | Faible | Oui |
| crosslist vinted to leboncoin / leboncoin to vinted | transactionnelle | Longue traîne (0 suggestion) | Oui |
| beebs vinted / beebs and vinted / beebs vs vinted | comparative | Faible | Oui |
| leboncoin vs ebay | comparative | Longue traîne | Oui |
| vinted to depop / crosslist vinted to depop | — | Moyen | **Non** (Depop fermé) |

- **Top 5 sur « can I sell the same item on Vinted and eBay at the same time »** : community.ebay.com (forum, « Advice on selling and cross linking with vinted ») ; tiktok.com/discover (vidéo) ; exportyourstore.com/integration/ebay-to-vinted (produit) ; community.ebay.com (forum, fil résolu) ; oly-platform.com (blog vendeur). Ensuite : relisted.io/en/blog/vinted-vs-ebay-depop, makemoneywithoutajob.com.
- **Top 5 sur « vinted to ebay crosslister »** : **cinq pages crosslist.com** (notes de version 2021, « crosslisting-from-vinted-to-ebay », « integrations/vinted-to-ebay », « ebay-to-vinted »…). C'est du contenu programmatique sur un domaine ancien.
- **Top 5 sur « crosslist Vinted to Leboncoin »** : relistly ; stoflow.com (FR) ; fluf.io (leboncoin-vs-vinted) ; fluf.io (sell-on-vinted-france) ; stoflow.com (FR). Ensuite : reposter.io (FR), trois pages redrip.app (FR).
- **Sur « sell same item Vinted Leboncoin eBay at the same time without double selling »** : community.ebay.com, exportyourstore, tiktok, oly-platform, vinted.com/help/257, puis **fillsell.app/blog/vendre-meme-article-vinted-leboncoin-ebay-beebs (version FR)**. L'outil l'a résumé en traduisant le français.
- **Pourquoi** : forums eBay (autorité, réponses humaines), TikTok (demande « comment faire »), pages en série de Crosslist et FLUF.
- **Failles** :
  1. les forums répondent « oui, mais retire vite » sans méthode : l'article EN de FillSell a exactement cette méthode, mais son titre (95 caractères) ne reprend pas la question ;
  2. les trajets Leboncoin et Beebs en anglais ne sont occupés que par FLUF (pages non datées, prix incohérents, sans Beebs) ;
  3. eBay.fr n'est jamais distingué d'eBay UK.
- **FillSell** : présent **seulement en FR**. L'article EN n'est pas ressorti.

### G5. « Alternative à »

| Requête | Intention | Volume | Servi ? |
|---|---|---|---|
| vendoo alternatives / vendoo free alternative | comparative | Moyen | Oui (angle UE) |
| crosslist alternative / crosslist free alternative | comparative | Faible (va probablement monter après le 2 oct.) | Oui |
| list perfectly alternatives | comparative | Faible | Oui (angle UE) |
| vendoo vs crosslist / vendoo vs list perfectly / crosslist vs vendoo vs list perfectly | comparative | Faible à moyen | Partiel |
| does vendoo support vinted / vendoo vinted not working | informationnelle | Faible | Oui (réponse : pas pour l'UE) |
| does list perfectly support vinted | informationnelle | Faible | Oui |
| flyp vinted / flyp crosslister vinted / nifty vinted / nifty crosslister vinted | informationnelle | Faible | Oui |
| vendoo review / crosslist reviews complaints | comparative | Moyen | — (pas d'avis sur un concurrent) |
| flyp alternative / nifty alternative | — | 0 suggestion / bruit (indice boursier Nifty) | — |

- **Top 5 sur « Vendoo alternatives »** : g2.com (plateforme d'avis) ; capterra.com (plateforme d'avis) ; nifty.ai (comparatif vendeur) ; litcommerce.com (comparatif vendeur) ; voolist.com (comparatif vendeur). Ensuite : resylr.com, flowlister.com, ecomli.com, softwareworld.co.
- **Sur « does Vendoo support Vinted »** : uk.blog.vendoo.co ; vendoo.co/marketplaces/vinted-us ; marketing.vendoo.co ; vendoo.co/uk/marketplaces/vinted-listing-software ; help.vendoo.co/eu/en (qui, lui, ne liste pas Vinted).
- **Sur « Crosslist alternative EU sellers Vinted »** : listperfectly.com (×2) ; alternativeto.net ; closo.co ; **crosslist.com/blog/vinted-cross-listing (annonce de fermeture)**.
- **Pourquoi** : G2 et Capterra (autorité de domaine), et la recette « X alternatives » de chaque vendeur.
- **Faille** : aucune page n'est écrite pour un vendeur **de France ou de l'UE** qui doit quitter Crosslist ou Vendoo pour Vinted. Les réponses IA disent « I didn't find evidence that any of these tools supports Vinted or European sellers ». FillSell peut répondre factuellement : Vinted France, Leboncoin, eBay.fr, Beebs.
- **Garde-fou** : pas d'« avis » sur un concurrent, seulement des faits sourcés et datés.
- **FillSell** : absent. Il n'a pas non plus de fiche G2 ou Capterra.

### G6. Republier / remonter ses annonces Vinted

| Requête | Intention | Volume | Servi ? |
|---|---|---|---|
| how to relist on vinted | informationnelle | Fort | Partiel (UK majoritaire) |
| how to relist on vinted without getting banned / without deleting | informationnelle | Moyen | Oui |
| vinted relisting tool / vinted relisting tool free | transactionnelle | Moyen | Oui (vinted.fr) |
| vinted repost chrome extension / vinted relist extension | transactionnelle | Faible à moyen | Oui |
| vinted auto relist / vinted automatic relisting | transactionnelle | Faible | Oui (Pro et Business) |
| does vinted allow relisting / vinted relisting rules / vinted relisting policy | informationnelle | Faible | Oui |
| vinted relist bot / vinted repost bot | transactionnelle | Faible à moyen | Partiel (le mot « bot » ne correspond pas au positionnement) |
| vinted bump worth it / vinted bump cost | informationnelle | Moyen | Oui (comparer Bump et republication) |

- **Top 5 sur « how to relist on Vinted »** : crosslist.com/?p=18672 ; crosslist.com/blog/how-to-relist-on-vinted ; crosslist.com/how-to-relist-on-vinted (blog vendeur, trois URL qui se cannibalisent) ; selleraider.com/how-to-relist-on-vinted ; selleraider.com/fr/… Ensuite : fiche « Easy Relist » du Chrome Web Store, chromeboard.com.
- **Top 5 sur « … without getting banned »** : tiktok.com/discover ; topdowntrading.co.uk/blog (blog UK) ; tiktok @lauraresells ; relisted.io/en/blog/relist-vinted ; makemoneywithoutajob.com. Ensuite : selleraider, redrip.app/en/blog.
- **Top 5 sur « vinted relisting tool chrome extension »** : github.com (extension libre) ; fiche « Vinted Relister » (3,3/5, 41 avis) ; fiche « Vinted Relist & Boost » (Relisted, 2,3/5) ; fiche « VintEdge » ; fiche « VintAssist ». Ensuite : relisted.io/en, softonic (BoostV), redrip.app/en.
- **Pourquoi** : forte demande UK, créateurs TikTok, blogs de vendeurs ; fiches d'extensions peu notées mais au titre exact.
- **Faille** : la peur du bannissement (« without getting banned », « vinted automated activity ban », Crosslist qui parle de suspensions). Les réponses IA disent « I couldn't find Vinted's current terms ». Une page EN qui expliquerait la **cadence humaine**, le plafond réglable et la coupure à tout moment, avec renvoi aux règles Vinted en vigueur, sans rien promettre, serait la seule de ce type. Il faut toutefois l'ancrer sur « Vinted France » pour ne pas attirer le Royaume-Uni.
- **FillSell** : absent.

### G7. Double vente / retirer partout après une vente

| Requête | Intention | Volume | Servi ? |
|---|---|---|---|
| can you sell the same item on vinted and ebay (voir G4) | informationnelle | Moyen | Oui |
| vinted same item sold twice / depop sold same item twice | informationnelle | Faible | Oui (Vinted) |
| ebay item sold twice / ebay sold my item twice | informationnelle | Faible | Oui (ebay.fr) |
| crosslist auto delist / does crosslist auto delist / auto delist | transactionnelle | Faible | Oui (avec confirmation) |
| how to delete a sold item on vinted | informationnelle | Faible | Partiel |

- **Top 5 sur « vinted same item sold twice cross listing what to do »** : crosslist.com (×2, guides de republication) ; fiche « CrossList Guard » (rapproche les ventes par le titre) ; docs.vortexiq.ai ; listperfectly.com. Ensuite : margeoapp.com/en/blog/crosslisting-guide-resellers-2026, vinted.co.uk/help/62, twicecommerce.com.
- **Sur « crosslist auto delist when sold vinted »** : docs.crosslist.com (autodelist) ; vendoo.co/uk/sale-detection-and-auto-delist ; crosslist.com (pages en série) ; apps.apple.com (« Crosslisting »).
- **Faille** : la documentation de Crosslist reconnaît des limites sur Vinted (détection par l'extension, annulations non détectées). FillSell a un discours différencié et vrai : vente détectée, **retrait sur confirmation**, jamais sur une simple disparition. L'article EN existant contient déjà la FAQ « How does FillSell prevent double sales? ».
- **FillSell** : article EN existant, non ressorti.

### G8. Gestion de stock du revendeur

| Requête | Intention | Volume | Servi ? |
|---|---|---|---|
| reseller inventory app / best inventory app for resellers / inventory app for resellers free | transactionnelle | Moyen | Oui |
| vinted inventory tracker / vinted inventory management | transactionnelle | Faible | Oui |
| vinted spreadsheet template (free) / vinted spreadsheet tracker / vinted reselling spreadsheet | transactionnelle, informationnelle | Moyen | Oui |
| reseller spreadsheet template (google sheets) | transactionnelle | Moyen | Partiel (US) |
| vinted sales tracker (free / spreadsheet) | transactionnelle | Faible | Oui |

- **Top 5 sur « reseller inventory app »** : jotform.com (modèle) ; closo.co (×2, blog vendeur) ; App Store Flippd (×2). Ensuite : Flow (mwm.ai et App Store), crosslist.com/blog/apps-for-resellers.
- **Top 5 sur « vinted spreadsheet tracker template »** : n8n.io (flux d'automatisation) ; notion.com (modèle) ; n8n.io ; apify.com (scraper) ; etsy.com (classeur payant). Ensuite : gumroad (Notion à 9 $), Google Workspace Marketplace (Dotb), **margeoapp.com/en/vinted-reseller-tracker**.
- **Faille** : la demande « spreadsheet » est forte, et les réponses sont des modèles payants ou techniques. Une page EN « Vinted / Leboncoin reselling spreadsheet vs app (free template) » est un aimant naturel. FillSell ajoute une règle comptable différenciante et vraie : un prix d'achat inconnu est exclu de la marge, il n'est pas compté gratuit.
- **FillSell** : absent.

### G9. Calcul de marge

| Requête | Intention | Volume | Servi ? |
|---|---|---|---|
| reselling profit calculator / resale profit calculator / reseller margin calculator | transactionnelle (outil) | Moyen | Oui |
| reselling profit margin / reselling profit tracker / reselling profit app | informationnelle, transactionnelle | Faible à moyen | Oui |
| vinted earnings calculator / vinted profit calculator | transactionnelle | Faible | Oui |
| is vinted profitable / how much money can you make on vinted | informationnelle | Moyen | Partiel (UK) |

- **Top 5 sur « reselling profit calculator »** : sellerfuse.com (outil) ; App Store FeeWise (eBay US) ; help.vendoo.co (aide) ; aegro.com.br (page parasite) ; fiche Chrome « Reseller Profit Calculator » (Poshmark). Sur une variante : margeoapp.com/en/blog/how-to-calculate-reselling-profit-margin, nifty.ai/post/reseller-profit-margin, size.ly.
- **Pourquoi** : outils gratuits, simples, en dollars, pour Poshmark et eBay US.
- **Faille** : aucun calculateur **en euros** qui connaisse les frais de vinted.fr (vendeur 0 %), de Leboncoin et d'eBay.fr. L'article EN de FillSell (« Reselling Profit: What You Actually Make Per Sale ») n'est pas ressorti, même sur son propre titre exact.
- **FillSell** : article EN existant, invisible.

### G10. Rédiger une annonce Vinted avec l'IA

| Requête | Intention | Volume | Servi ? |
|---|---|---|---|
| vinted ai listing generator / vinted listing generator / vinted listing creator | transactionnelle | Faible à moyen | Oui (annonce rédigée en français pour vinted.fr) |
| vinted description generator (free) / ai vinted description generator | transactionnelle | Faible à moyen | Oui |
| vinted title and description generator | transactionnelle | Faible | Oui |
| vinted ai listing agent / vinted ai listing | informationnelle | Faible à moyen | Partiel (désigne peut-être une fonction de Vinted lui-même : **non vérifié**) |
| ai listing generator ebay | transactionnelle | Moyen | Partiel (US) |

- **Top 5 sur « vinted ai listing generator description »** : ecommerceguide.com (GPT « Vinted Product Description ») ; chromeboard.com (QuickListAI) ; ecommerceguide.com (GPT) ; hunted.space (Vintapp, app iOS lancée en France) ; hunted.space. Ensuite : trustpilot (Listvore), alternativeto (Sellygenie), extscope.org.
- **Pourquoi** : annuaires d'outils et de GPT, Product Hunt. Pas de domaine fort.
- **Faille** : rien de solide. FillSell a l'angle « photo → titre, description, prix, rayon » **en français**, pour un anglophone qui vend en France.
- **FillSell** : absent.

### G11. Vendre plus vite / « meilleures apps » pour vendeur Vinted

| Requête | Intention | Volume | Servi ? |
|---|---|---|---|
| how to sell faster on vinted / tips to sell faster on vinted | informationnelle | Fort | Partiel (UK) |
| vinted tips for sellers / vinted tips and tricks | informationnelle | Fort | Partiel |
| best apps for vinted reselling / best app for vinted | comparative | Faible à moyen | Oui |
| vinted seller tools / vinted selling tools | comparative | Faible | Oui |
| best vinted chrome extension / vinted chrome extension | transactionnelle | Faible à moyen | Oui |
| apps to sell clothes (online / for free) | comparative | Fort | Partiel (générique) |

- **Top 5 sur « how to sell faster on Vinted »** : blog.usro.net (×2) ; toptut.com ; crosslist.com/blog/how-to-sell-on-vinted ; blog.usro.net. Ensuite : crosslist.com (vinted-selling-tips), postoffice.co.uk, amzscout.net.
- **Top 5 sur « best apps for Vinted reselling »** : closo.co (×2) ; pastemagazine.com ; alternativeto.net (tag vinted) ; closo.co. Ensuite : App Store PreLoved AI, Clothing Alerts, selleraider.com.
- **Faille** : demande UK pure, beaucoup de contenu de remplissage. À ne travailler qu'au travers de « best apps for Vinted **France** sellers », en P2 ou P3.
- **FillSell** : absent.

### G12. Anglophones qui vendent en France (public A)

| Requête | Intention | Volume | Servi ? |
|---|---|---|---|
| leboncoin in english / leboncoin english app / leboncoin english version / leboncoin in english translation | informationnelle, navigationnelle | Moyen (beaucoup de déclinaisons) | Oui |
| how to sell on leboncoin (in english) / leboncoin for foreigners | informationnelle | Faible (pas de suggestion propre, mais SERP fournie) | Oui |
| vinted france in english / change language on vinted / is vinted french | informationnelle | Faible à moyen | Oui |
| ebay france in english / how to sell on ebay.fr / selling on ebay france | informationnelle | Faible à moyen | Oui |
| sell clothes online france / how to sell second hand clothes in france | informationnelle, comparative | Faible | Oui |
| vinted tax france / taxation vinted france / vinted dac7 | informationnelle | Faible à moyen (« dac7 » surtout DE) | Partiel (sujet fiscal sensible) |

- **Top 5 sur « how to sell on Leboncoin in English guide »** : support.shoppingfeed.com (aide d'un intégrateur) ; medium.com/@arthurlugauskas (témoignage d'un expatrié à Paris) ; thelocal.fr (média d'expatriés, 2023) ; blog.airselli.com/en (« Leboncoin for Foreigners », 25/03/2026) ; fluf.io/channels/sell-on-leboncoin (vendeur). Ensuite : frenchforwarders.com, prim.net/en, linvestisseur-malin.fr/en, survivefrance.com (forum).
- **Top sur « Vinted France in English change language sell »** : aranzulla.it (IT) ; fripio.app (FR, ×3) ; un site Notion ; vinted.fr/help/1231. **Il n'existe aucune page EN de référence.**
- **Pourquoi** : les médias d'expatriés et les témoignages suffisent, faute de concurrence. La réponse IA conclut « I didn't find an official English guide » et signale qu'il n'y a pas de traduction intégrée au chat de Leboncoin.
- **Failles, les plus nettes du rapport** :
  1. une page « How to sell on Leboncoin and Vinted France in English (2026) » n'a pas de rival sérieux ;
  2. FillSell y apporte une vraie valeur : app en anglais, annonce rédigée en français, publication sur les deux sites, retrait après la vente. Réserve à écrire noir sur blanc : l'extension et sa fiche sont en français.
- **FillSell** : absent.

### G13. Irlande (public B, conditionnel)

| Requête | Intention | Volume | Servi ? |
|---|---|---|---|
| vinted ireland / vinted ireland app / vinted ireland reddit | navigationnelle, informationnelle | Moyen | **Non aujourd'hui** (0.6.106 non publiée, pays à ouvrir ; eBay.ie non servi) |
| sell on vinted ireland / can you sell on vinted from ireland / is vinted available in ireland | informationnelle | Faible | Non aujourd'hui |
| vinted france to ireland (shipping time) | informationnelle (acheteur) | Faible | Non (intention d'achat) |

- **Top 5 sur « selling on Vinted Ireland tips »** : image.ie (média IE, lancement) ; which.co.uk ; thetravelhack.com ; wisbechstandard.co.uk ; substack. Ensuite : inpost.pt, evri.com, postoffice.co.uk, crosslist.com.
- **Lecture** : SERP britannique par défaut et très peu de contenu irlandais. C'est une faille **réelle mais à ne pas ouvrir** tant que le produit ne sert pas vinted.ie. Une page publiée trop tôt promettrait ce qui n'existe pas.

---

## 5. Les failles exploitables, classées

1. **Le retrait de Crosslist sur Vinted (2 octobre 2026)**, plus Crosslist sans UE et Vendoo UE sans Vinted. La question « quel outil de crosslisting marche avec Vinted en France ou en Europe ? » n'a plus de réponse anglaise neutre. Elle est tenue par Relistly et FLUF, qui ne citent pas FillSell. Cette faille est **datée** : à saisir maintenant.
2. **Leboncoin, Beebs et eBay.fr en anglais.** Personne ne couvre Beebs en anglais. Les réponses IA vont jusqu'à semer le doute sur Beebs : « CB Insights reports that Beebs filed for bankruptcy in March 2024 … PitchBook lists Beebs as acquired … by Kiabi » (synthèse de l'outil, sources cbinsights.com et pitchbook.com). eBay.fr n'est jamais distingué. FLUF tient les trajets Leboncoin avec des pages en série non datées.
3. **Le public expatrié en France** (« leboncoin in english », « vinted france in english », « ebay france in english ») : demande réelle, SERP de médias, aucun outil.
4. **La peur du bannissement**, sujet de G6 et G2, sur lequel il n'existe aucune page honnête et datée. FillSell a les faits (cadence humaine, confirmation avant retrait, pas de mot de passe), à condition de ne promettre aucune immunité.
5. **Un calculateur de marge en euros** pour vinted.fr, Leboncoin et eBay.fr : aucun n'existe. Tout est en dollars et pour Poshmark ou eBay US.
6. **Le GEO, côté réputation** : FillSell est absent de toutes les réponses IA observées en anglais. Une page de référence EN, datée, avec tableaux de faits (« What FillSell does / doesn't do »), est le levier GEO principal.

---

## 6. Constats annexes (pour les étapes ASO, technique et marque)

- **Fiches des stores en anglais** (API iTunes et Play, lues le 09/10) :
  - App Store US, GB et IE : « FillSell – Reseller App », langue déclarée **EN seulement**, 0 note ; la description dit « Vinted, Leboncoin, eBay, Beebs and Opla » et « POST TO ALL FIVE IN ONE GO » ;
  - Play : « Scan and post your listings on Vinted, Leboncoin, eBay, Beebs and Opla. »
  - → **Opla** sort le 10/10.
  - → L'app est proposée sur les vitrines US et GB, alors que le produit ne sert pas leurs places de marché : risque d'avis négatifs, à trancher par Nico.
  - URL : https://itunes.apple.com/lookup?id=6762152785&country=us (gb, ie, fr) ; https://play.google.com/store/apps/details?id=app.fillsell.app
- **Chrome Web Store** : titre « FillSell — Cross-post », description **en français seulement** (« Publie automatiquement vos annonces FillSell sur Vinted, Leboncoin, Beebs et eBay. » : accord « Publie / vos » incohérent), 360 utilisateurs. Aucun mot-clé anglais « Vinted crosslisting » dans le titre, alors que les concurrents classés le portent (Ruit).
- **Cache d'index périmé** : le résumé indexé d'un agrégateur (vu via WebSearch le 09/10) décrivait FillSell « for serious resellers on Vinted, eBay, **Depop** and more » (ancienne description, version 2.1). La page actuelle (https://mwm.ai/apps/fillsell/6762152785, lue le 09/10, version 2.7) ne cite plus Depop. Risque GEO faible et transitoire, mais à surveiller : Depop ne doit jamais être annoncé.
- **Homonyme** : sur la requête « fillsell.app », la recherche remonte « FillSell-Sourcing & Dropshipping » (apps.shopify.com, appli indisponible). C'est déjà connu (commentaire JSON-LD de `index.html`), mais à renforcer en anglais : le JSON-LD de désambiguïsation est la seule défense quand une IA confond les deux.
- **Landing EN sans URL** : hreflang `en` = `fr` = `x-default` = `https://fillsell.app`. Google ne peut indexer qu'une version. Toute requête EN transactionnelle (P1) dépend d'une URL anglaise dédiée : décision technique à prendre à l'étape concernée, hors de ce rapport.
- **Maillage EN→FR** : l'article EN « sell-same-item… » renvoie vers `/blog/cross-listing-vinted-leboncoin` (FR). Cet article FR n'a pas de jumeau EN.

---

## 7. Liste priorisée des requêtes cibles (EN)

Les pages « à créer » sont des **propositions** : rien n'est écrit ni publié. Les URL sont indicatives.

### P1 — servi, intention forte, faille immédiate

| # | Requêtes cibles (variantes) | Public | Page qui doit répondre |
|---|---|---|---|
| 1 | best crosslisting app for vinted · crosslister for vinted · is there a crosslister for vinted · crosslister that supports vinted · cross listing software vinted · vinted crosslisting app | A + GEO | **À créer** : comparatif EN daté, « Crosslisting apps that work with Vinted France in 2026 (and Leboncoin, eBay.fr, Beebs) ». Faits sourcés sur Crosslist (fermé aux nouveaux), Vendoo UE (sans Vinted), List Perfectly (US), Relistly, FLUF, Ruit et FillSell. Titre explicitement « France / EU ». |
| 2 | crosslist alternative · crosslist vinted alternative · crosslisting europe · best crosslisting software europe · crosslisting app france | A + GEO | Même page (section « If Crosslist closed Vinted for you »), ou page sœur courte. Faille datée du 02/10/2026. |
| 3 | can i sell the same item on vinted and ebay (at the same time) · how to list on ebay and vinted at the same time · vinted same item sold twice · ebay item sold twice | A | **Existe** : `/blog/sell-same-item-vinted-leboncoin-ebay-beebs`. Titre et H1 à recentrer sur la question (aujourd'hui 95 caractères, sans « Can you… »), préciser **eBay.fr**, ajouter un lien EN (pas FR). |
| 4 | leboncoin in english · how to sell on leboncoin in english · leboncoin for foreigners · leboncoin english app | A (expatriés) | **À créer** : guide EN « How to sell on Leboncoin (and Vinted France) in English — 2026 », avec FillSell comme option : app EN, annonce rédigée en français. Réserve : extension en FR. |
| 5 | vinted vs leboncoin · vinted leboncoin ebay · crosslist vinted to leboncoin · leboncoin to vinted | A + GEO | **À créer** : jumeau EN de `/blog/cross-listing-vinted-leboncoin`, relié par `translation` (paire hreflang). Battre FLUF sur l'exactitude et la date. |

### P2 — servi, mais public UK majoritaire ou concurrence plus installée

| # | Requêtes cibles | Page |
|---|---|---|
| 6 | vendoo alternatives · does vendoo support vinted · list perfectly alternatives · does list perfectly support vinted · flyp vinted · nifty vinted · vendoo vs crosslist | Section du comparatif P1-1 (« Vendoo / List Perfectly / Flyp / Nifty: which work in France? »). Faits seulement, jamais d'« avis ». |
| 7 | how to relist on vinted without getting banned · does vinted allow relisting · vinted relisting rules · vinted automated activity ban | **À créer** : EN « Relisting on Vinted France safely: pace, limits, what we know (2026) ». Aucune promesse d'immunité. |
| 8 | vinted relisting tool · vinted repost chrome extension · vinted auto relist · best vinted chrome extension | Même page (bloc produit), ou landing EN une fois qu'elle a une URL. |
| 9 | reselling profit calculator · reseller margin calculator · vinted earnings calculator · reselling profit margin | **Existe** : `/blog/how-to-calculate-reselling-profits` (à rendre visible et à ancrer sur l'euro, vinted.fr, Leboncoin, eBay.fr). Plus tard : calculateur EN en euros. |
| 10 | vinted spreadsheet template (free) · vinted sales tracker · vinted inventory tracker · reseller inventory app | **À créer** : EN « Reselling spreadsheet vs app for Vinted / Leboncoin sellers (free template) ». Règle « prix d'achat inconnu ≠ 0 ». |
| 11 | vinted ai listing generator · vinted description generator · vinted title and description generator | **À créer** : EN « Write a Vinted listing from a photo (in French, from an English app) » (Lens). |
| 12 | vinted france in english · change language on vinted · ebay france in english · how to sell on ebay.fr · sell clothes online france | Sections et FAQ du guide P1-4, pas de page séparée. |
| 13 | best apps for vinted reselling · vinted seller tools | Bloc dans le comparatif P1-1 (ancré « France »). |

### P3 — à garder pour le GEO ou pour plus tard, sans page dédiée

| # | Requêtes | Pourquoi P3 | Réponse |
|---|---|---|---|
| 14 | crosslisting app · cross listing app for resellers · crosslisting apps free · best crosslisting software · crossposting app for resellers | Volume fort mais US/UK (Poshmark, Mercari, UK) : FillSell ne sert pas ce public. | Glossaire EN « What is crosslisting? (France: Vinted, Leboncoin, eBay.fr, Beebs) ». |
| 15 | how to relist on vinted · how to sell faster on vinted · vinted tips for sellers · is vinted profitable | Énorme demande UK, faible conversion. | Liens depuis les pages P2. |
| 16 | beebs vinted · beebs vs vinted · beebs app review | Demande EN minime, mais zéro concurrence et doute IA sur Beebs. | Section dans P1-5, ou petite page EN « Beebs: selling kids' items in France ». |
| 17 | vinted tax france · vinted dac7 | Sujet fiscal sensible, « dac7 » surtout allemand. | À voir avec l'étape FR (contenu fiscal à faire valider). |
| 18 | vinted ireland · sell on vinted ireland · is vinted available in ireland | **Non servi aujourd'hui.** | Seulement après la publication de la 0.6.106 **et** l'ouverture de l'Irlande. |

### À NE PAS cibler (hors produit)

crosslisting app uk · best crosslister uk · cross listing app australia / canada · vinted uk (toutes les variantes « … uk ») · vinted to depop / depop crosslister (Depop fermé) · poshmark / mercari / grailed · ebay uk / ebay.co.uk · « crosslisting in canvas » (sens scolaire) · vinted bot sniper / vinted bot discord (achat, robots) · nifty alternative (bruit boursier).

---

## Annexe A — Suggestions Google utiles (extraits, hl=en, 2026-10-09)

Brut : appels `suggestqueries.google.com` (client=firefox). Seules les lignes utiles sont reproduites ; « → » sépare la graine de ses suggestions.

- crosslisting → crosslisting apps · crosslisting apps for resellers · crosslisting platforms · crosslisting tools · crosslisting software · crosslisting uk · crosslisting apps free (+ « crosslisting in canvas »)
- cross listing → cross listing app · cross listing platforms · cross listing apps for resellers · cross listing app free · cross listing meaning · **cross listing to vinted**
- cross-listing app → cross listing app uk · cross listing app uk free · cross listing app australia · cross listing app canada · cross listing app reviews · cross listing app reddit · cross listing app nifty
- crosslisting software → crosslisting software uk · cross listing software for ebay · cross listing software free · **cross listing software vinted**
- crosslisting vinted → cross listing vinted ebay · crosslist vinted to depop · **crosslist vinted ban** · vinted crosslisting app · vinted crosslisting reddit
- crosslister → crosslister by flyp · **crosslister for vinted** · crosslister free trial · crosslister reviews · crosslist vs nifty
- crosslister vinted → crosslister vinted ebay · vinted crosslister reddit · vinted crosslister free · flyp crosslister vinted · nifty crosslister vinted · **crosslister that includes vinted** · **crosslister that supports vinted**
- crosslister for vinted → **is there a crosslister for vinted**
- best app for vinted → best apps for vinted reselling · **best crosslisting app for vinted** · best photo editing app for vinted
- vinted to ebay → vinted to ebay crosslister · vinted to ebay lister · import vinted to ebay · transfer vinted to ebay · vinted ebay cross listing · vinted ebay uk only
- ebay to vinted → ebay to vinted crosslister · transfer ebay to vinted · crosslist ebay to vinted free · import ebay to vinted · link ebay to vinted
- sell on vinted and ebay → **can i sell on vinted and ebay at the same time** · can i sell the same item on vinted and ebay · **how to sell on ebay and vinted at the same time** · selling on vinted vs ebay reddit
- vinted leboncoin → vinted vs leboncoin · vinted ou leboncoin · vinted leboncoin ebay · bot vinted leboncoin · vinted vs leboncoin reddit
- leboncoin crosslisting / leboncoin relist / crosslisting app france / crosslisting app europe / crosslisting app ireland → **aucune suggestion**
- crosslisting europe → crosslist europe · cross listing europe
- beebs vinted → beebs ou vinted · beebs import vinted · beebs and vinted · difference beebs vinted
- vendoo alternative → vendoo alternatives · vendoo free alternative
- vendoo vs → vendoo vs nifty · vendoo vs crosslist · vendoo vs flyp · vendoo vs list perfectly · vendoo vs primelister · vendoo vs crosslist reddit
- vendoo vinted → vendoo vinted not working · vendoo vinted reddit · vendoo support vinted
- crosslist alternative → crosslist free alternative
- list perfectly vinted → **does list perfectly support vinted**
- flyp vinted → flyp vinted reddit · flyp crosslister vinted · flyp adding vinted
- nifty vinted → nifty ai vinted · nifty crosslister vinted · nifty adding vinted
- auto delist → **crosslist auto delist · does crosslist auto delist**
- vinted relist → vinted relisting · vinted relisting tool · vinted relist bot · vinted relisting rules · vinted relist sold item · vinted relisting tool free · vinted relisting policy
- how to relist on vinted → how to relist on vinted without deleting · **how to relist on vinted without getting banned** · how to relist on vinted for free · how to relist on vinted quickly · how to relist on vinted reddit
- vinted repost → vinted repost app · vinted repost bot · vinted repost tool · **vinted repost chrome extension** · vinted repost extension · vinted automatic repost
- is vinted relisting allowed → does vinted allow relisting
- vinted automation ban → vinted automatic ban · **vinted automated activity ban**
- vinted bump → vinted bump cost · vinted bump worth it · vinted bump reddit · vinted bump fee · vinted bump price increase
- sold same item twice → depop sold same item twice · **vinted same item sold twice** · can you list the same item twice on ebay
- sold item twice ebay → ebay item sold twice · ebay sold my item twice
- reseller inventory app → reseller inventory app free · reseller inventory software · best reseller inventory app · how to organize reseller inventory
- vinted inventory → vinted inventory management · vinted inventory tracker
- vinted spreadsheet → vinted spreadsheet template free · vinted spreadsheet tracker · vinted excel spreadsheet · vinted reselling spreadsheet · vinted sales spreadsheet
- reselling profit → reselling profit tracker · reselling profit calculator · reselling profit margin · reselling profit app
- reseller profit calculator → resale profit calculator · reseller margin calculator · thrift reseller profit calculator
- vinted profit calculator → vinted earnings calculator · is vinted profitable · how much money can you make on vinted
- vinted listing generator → vinted listing creator · vinted ai listing generator
- vinted description generator → vinted description generator free · ai vinted description generator · vinted title and description generator
- vinted ai → vinted ai listing agent · vinted ai photos · vinted ai listing · vinted ai description
- vinted chrome extension → vinted chrome extension reddit · vinted relist chrome extension · vinted repost chrome extension · best vinted chrome extension
- how to sell faster on vinted → how to sell faster on vinted reddit · how to sell fast on vinted uk · tips to sell faster on vinted
- leboncoin in english → leboncoin in english translation · leboncoin in english app · leboncoin in english app free download · leboncoin france in english · leboncoin fr in english
- leboncoin english → leboncoin english login · leboncoin english version · leboncoin english app · leboncoin english translation
- vinted france → vinted france app · vinted france in english · vinted france to uk · (gl=ie) **vinted france to ireland** · vinted france to ireland shipping time
- vinted france english → vinted france in english translation · is vinted french · change language on vinted
- ebay france → ebay france in english · ebay france in english language · ebay france login
- selling on ebay france → how to sell on ebay.fr · is there ebay in france · how to sell on ebay europe
- sell clothes in france → sell clothes online france · how to sell second hand clothes in france
- vinted tax france → taxation vinted france · do you pay tax on vinted
- vinted dac7 → vinted dac7 reddit · vinted dac7 report · vinted dac7 form · vinted dac7 2026
- vinted ireland → vinted ireland app · vinted ireland login · vinted ireland reddit
- sell on vinted from ireland → sell on vinted ireland · can you sell on vinted from ireland · selling on vinted ireland reddit

## Annexe B — Sources externes consultées (toutes le 2026-10-09)

- Crosslist, fermeture de Vinted aux nouveaux : https://crosslist.com/marketplaces/vinted ; https://crosslist.com/blog/vinted-cross-listing
- Crosslist, autodelist : https://docs.crosslist.com/knowledge-base/sales/autodelist
- Vendoo, aide UE : https://help.vendoo.co/eu/en/articles/8856209-which-marketplaces-does-vendoo-support
- Vendoo, Vinted US : https://vendoo.co/marketplaces/vinted-us
- List Perfectly, Vinted bêta : https://help.listperfectly.com/en/articles/13187498-vinted-is-now-available-in-list-perfectly-beta-guide
- Relistly : https://relistly.io/guides/best-vinted-crosslisting-app ; https://relistly.io/guides/best-crosslisting-software-europe
- FLUF Connect : https://fluf.io/crosslisting/leboncoin-to-vinted/ ; https://fluf.io/channels/leboncoin-vs-vinted/ ; https://fluf.io/channels/sell-on-vinted-france/ ; https://fluf.io/channels/sell-on-leboncoin/
- Ruit : https://chromewebstore.google.com/detail/ruit-crosslist-to-vinted/hefanceoeobjfgbfgpglobdngmfeeceb?hl=en
- Redrip : https://www.redrip.app/en/ ; Relisted : https://relisted.io/en/
- Margeo : https://margeoapp.com/en/blog/crosslisting-guide-resellers-2026/ ; https://margeoapp.com/en/vinted-reseller-tracker/
- Comparatifs génériques : https://www.3dsellers.com/blog/best-cross-listing-apps ; https://nifty.ai/post/free-cross-listing-app ; https://crosslist.com/blog/best-crosslisting-apps-for-resellers ; https://www.listmycloset.com/blog/best-crosslisting-app-for-vinted/ ; https://www.g2.com/products/vendoo/competitors/alternatives ; https://www.capterra.com/p/10011474/Vendoo/alternatives/
- Forums et guides : https://community.ebay.com/forum/new-to-selling-on-ebay-57916/topic/advice-on-selling-and-cross-linking-with-vinted-175374/ ; https://community.ebay.com/t5/Selling/Is-it-ok-to-sell-same-item-from-multiple-platforms-or-against/td-p/29550180 ; https://www.topdowntrading.co.uk/blog/vinted-policies-and-rules-how-to-resell-without-getting-banned-in-2026.html ; https://relisted.io/en/blog/relist-vinted ; https://selleraider.com/how-to-relist-on-vinted/
- Public expatrié : https://www.thelocal.fr/20231012/leboncoin-everything-you-need-to-know-about-frances-biggest-sales-website ; https://blog.airselli.com/en/2026/03/25/leboncoin-for-foreigners/ ; https://medium.com/@arthurlugauskas/selling-on-leboncoin-in-paris-8b7687b2a053 ; https://frenchforwarders.com/using-leboncoin-from-another-country-how-it-works/ ; https://www.survivefrance.com/t/anyone-used-leboncoin-recently-to-sell-an-item/37315
- Irlande : https://image.ie/style/vinted-is-in-ireland-heres-what-a-stylist-has-on-her-wishlist-and-her-top-tips-for-buying-and-selling-918653
- FillSell (tiers) : https://apps.apple.com/us/app/fillsell-reseller-app/id6762152785 (via l'API iTunes lookup) ; https://play.google.com/store/apps/details?id=app.fillsell.app ; https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm ; https://mwm.ai/apps/fillsell/6762152785
