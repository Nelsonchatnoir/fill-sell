# Reposter — vérification sur pages réelles

Observation : **2026-10-09**. Lecture du web seule (curl, WebFetch, WebSearch) : aucun compte créé, aucune
connexion, aucun formulaire. Chaque fait vient de la page citée, lue le 09/10/2026. Les chiffres publiés
par l'éditeur (« +1M publications », « 98 % de satisfaction ») sont **ses propres affirmations**, non
vérifiées.

- Site : https://reposter.io (HTTP 200, `<html lang="fr">`, `og:locale fr_FR`)
- Application : https://app.reposter.io (tableau de bord web, connexion requise ; non ouvert au-delà de la
  page d'accueil publique)
- Documentation : https://docs.reposter.io (Mintlify ; pages lues en `.md`, index
  https://docs.reposter.io/llms.txt)
- Domaine `reposter.io` : enregistré le 2021-05-07, expire le 2027-05-07 (RDAP
  https://rdap.identitydigital.services/rdap/domain/reposter.io). D'après la page « À propos », le service
  a été lancé en 2023.

**Verdict en une ligne** : Reposter existe et il est actif (changelog de septembre 2026). C'est un
**service web côté serveur**, sans extension ni app native, centré sur la **republication Leboncoin**
(multi-villes, segmentation, récurrence). Il fait aussi de la **conversion Leboncoin → Vinted par IA** et
répond aux acheteurs (**assistant de messagerie IA**). Plateformes : **Leboncoin et Vinted seulement**. Il ne
publie ni sur eBay ni sur Beebs.

---

## 1. Plateformes supportées

| Plateforme | Statut affiché | Citation | Source |
|---|---|---|---|
| Leboncoin | « Disponible » | « Publication, remontée automatique, multi-villes, messagerie automatique. L'intégration la plus complète du marché. » | https://reposter.io/ (section `#platforms`) |
| Vinted | « Disponible » | « Générez une annonce Vinted à partir de votre LBC (ou l'inverse) en un clic. Catégorie, marque, attributs, photos — tout se fait automatiquement. » | https://reposter.io/ |
| Autres | « En cours » | « De nombreuses autres plateformes très bientôt […] d'autres marketplaces européennes et internationales » (aucune nommée) | https://reposter.io/ |
| eBay (FR) | **absent** | aucune occurrence d'« eBay » sur l'accueil, les 11 guides lus, la doc ni le llms.txt | relevé par recherche de texte, 09/10/2026 |
| Beebs | **absent** | aucune occurrence | idem |
| Depop, Vestiaire, etc. | absents | — | idem |

**Précision sur le statut de Vinted.** La note de découverte parlait d'un statut ambigu, entre « En cours » et
« Disponible ». Vérification faite dans le HTML de l'accueil : le badge « En cours » appartient à la
3ᵉ carte (« autres plateformes »). Leboncoin et Vinted portent tous deux « Disponible ». L'ambiguïté réelle est
ailleurs :
- **Vinted est une option à activer** : « La fonctionnalité Vinted nécessite l'activation de l'option
  **multi-plateforme** sur votre compte. » (https://docs.reposter.io/guide/vinted.md). Son prix n'est
  pas public.
- **Sens du transfert** : la doc ne décrit que **Leboncoin → Vinted** (« publier vos annonces Leboncoin sur
  Vinted » ; étape 1 : « Ouvrir une annonce Leboncoin »). Le **sens Vinted → Leboncoin** n'est annoncé
  que dans les guides marketing : « Oui, le flux fonctionne dans les deux sens »
  (https://reposter.io/transferer-annonces-leboncoin-vinted) et « Sélectionnez vos articles Vinted […]
  Transférez vers Leboncoin en 1 clic » (https://reposter.io/transferer-vinted-vers-leboncoin).
- **Catégories convertibles vers Vinted** (doc) : mode, puériculture, maison & déco, bricolage, jardin,
  livres/CD/DVD, jeux & consoles, high-tech, sport, équipement vélo, collection, instruments, animaux,
  loisirs créatifs, petit électroménager. Ne sont pas convertibles : « auto, moto, immobilier, services,
  ameublement, vélos adultes ou gros électroménager » (https://docs.reposter.io/guide/vinted.md).
- Historique (changelog) : Vinted est arrivé en **avril 2026** (« Multi-plateforme Vinted ») ; en **août 2026**,
  la conversion s'étend à « toutes les catégories compatibles […] plus seulement la mode »
  (https://docs.reposter.io/changelog/overview.md).

**Pays Vinted** : **non précisé**. Aucune mention de `vinted.fr`, `vinted.be`, `vinted.it`, etc., ni d'un
autre pays. Les CGU disent : « reposter.io, destiné aux utilisateurs français »
(https://reposter.io/cgu et https://docs.reposter.io/legal/cgu.md). On ne peut pas vérifier sans compte si
un dressing Vinted étranger fonctionne.

## 2. Application mobile, extension, d'où l'on part

- **Application mobile native : non.** Aucun lien vers l'App Store ou Google Play sur le site ni dans la doc. Une
  recherche iTunes FR « reposter » (https://itunes.apple.com/search?term=reposter&country=fr&entity=software)
  ne renvoie que des apps de repost Instagram et TikTok. Une recherche Google Play « reposter leboncoin
  vinted » ne renvoie aucune app Reposter (https://play.google.com/store/search?q=reposter%20leboncoin%20vinted&c=apps&hl=fr&gl=FR).
  *Remarque : cette même recherche Play affiche `app.fillsell.app` parmi les résultats.*
- **PWA** : app.reposter.io déclare un manifeste (`display: standalone`, `orientation: portrait-primary`)
  (https://app.reposter.io/manifest.json). Elle est donc installable sur l'écran d'accueil d'un
  téléphone, même si le site ne le met pas en avant.
- **Extension navigateur : non, et c'est un choix revendiqué.** « l'outil est une alternative sans
  extension […] les actions passent par des tâches serveur »
  (https://reposter.io/extension-leboncoin). « Un outil connecté comme Reposter fonctionne côté serveur,
  à partir de vos comptes reliés : rien à installer, et votre dressing se reliste même quand votre PC
  est éteint » (https://reposter.io/relister-vinted-sans-extension). Recherche « reposter » sur le Chrome Web
  Store : aucune fiche Reposter (https://chromewebstore.google.com/search/reposter).
- **D'où l'on part** : du **navigateur**, sur ordinateur ou sur téléphone (application web). L'exécution se
  fait sur **leurs serveurs**. On connecte un compte en confiant à Reposter **l'e-mail, le mot de passe et le
  téléphone** de la plateforme, puis un code SMS (6 chiffres pour Leboncoin, 4 pour Vinted) :
  « Remplir les informations […] Email […] Mot de passe […] Téléphone » ; « Vérification OTP »
  (https://docs.reposter.io/guide/comptes.md). Les identifiants sont « chiffrés en base (AES-256) » (FAQ
  JSON-LD de https://reposter.io/).
- **API + serveur MCP** : clés API (lecture seule, ou lecture + écriture) pour tous ; serveur MCP
  `https://api.reposter.io/mcp` « réservé aux abonnements actifs à partir de 50 €/mois »
  (https://docs.reposter.io/guide/acces-agents.md).

## 3. Identification par photo / IA

- **Pas d'annonce créée à partir d'une photo.** On crée une annonce au formulaire (« Remplissez les champs
  (titre, description, prix...) », https://docs.reposter.io/guide/demarrage.md), ou on l'importe depuis une
  annonce existante.
- **L'IA ne sert qu'à la conversion d'une plateforme à l'autre** : « Catégorie : suggérée par IA » ;
  « Attributs : marque, état, taille colis, couleurs — pré-remplis par IA » ; photos « transférées depuis
  votre annonce Leboncoin » (https://docs.reposter.io/guide/vinted.md). Avant l'envoi, un contrôle signale
  les champs Vinted manquants (état, colis, couleurs, taille, prix ≥ 1 €).
- **IA de messagerie** : « Mode IA » qui analyse « L'historique de la conversation, les détails de
  l'annonce concernée, le message de l'acheteur » (https://docs.reposter.io/guide/messagerie.md).
- **Prix** : pas d'estimation de prix par IA dans la doc. Le guide « Négocier sans brader »
  (https://reposter.io/negocier-prix-plancher-ia) est un article éditorial.
- Aucun outil de génération ne figure parmi les outils MCP. En revanche, `/product/search-by-image` y apparaît :
  une recherche Leboncoin par image limitée à « 3 par minute et 20 par jour »
  (https://docs.reposter.io/guide/acces-agents.md). Son usage n'est pas documenté ailleurs.

## 4. Import / synchronisation du stock existant

- **Import : oui.** « Connectez vos comptes et importez vos annonces existantes en quelques clics »
  (https://reposter.io/). La ville d'une annonce est « remplie automatiquement à l'import Leboncoin »
  (https://docs.reposter.io/guide/annonces.md). Changelog de septembre 2026 : « importer toutes les annonces
  d'un compte ». Après un import, un bandeau propose « Tout convertir » vers l'autre plateforme. Les
  brouillons créés « restent à publier individuellement » (https://docs.reposter.io/guide/vinted.md).
- **Import depuis Vinted** : annoncé dans les guides (« vous connectez votre compte Leboncoin ou Vinted
  une seule fois […] vos annonces existantes sont importées automatiquement »,
  https://reposter.io/transferer-annonces-leboncoin-vinted), mais **non décrit dans la doc**.
- **Les modifications ne suivent pas** : « Si l'annonce est déjà en ligne, la modification ne se répercute
  pas automatiquement. Elle sera appliquée lors de la prochaine publication par une tâche »
  (https://docs.reposter.io/guide/annonces.md).
- **Annonces liées** : « Les annonces Vinted générées depuis une annonce Leboncoin sont **liées** entre elles
  (via un identifiant de groupe) » ; une pastille indique les plateformes où le produit existe
  (https://docs.reposter.io/guide/vinted.md).

## 5. Retrait automatique des copies après une vente (auto-delist)

**Annoncé, avec des formulations qui varient d'une page à l'autre, et non documenté.**
- « Si l'une est vendue, l'autre **peut** être fermée automatiquement pour éviter les doubles réservations »
  et « Vendu d'un côté ? L'autre se ferme automatiquement »
  (https://reposter.io/transferer-annonces-leboncoin-vinted).
- « un article marqué vendu disparaît de Leboncoin et des autres plateformes connectées **en un clic** » ;
  « une vente quelque part, retrait partout » (https://reposter.io/comment-marquer-vendu-leboncoin). Ici,
  l'article est d'abord marqué vendu, puis un clic retire les copies.
- En revanche, le guide multiposting recommande un contrôle **manuel** : « Chaque soir, passez en revue vos
  ventes du jour sur les deux plateformes et retirez les doublons immédiatement »
  (https://reposter.io/multiposting-leboncoin-vinted).
- **La documentation n'en dit rien** : ni la page Vinted (annonces liées, doublons), ni Tâches, ni Annonces
  ne décrivent un retrait déclenché par une vente.
- Ce qui **est** documenté : « Si une annonce est déjà présente dans votre dressing Vinted, l'outil **détecte
  et supprime automatiquement** l'ancienne version avant de publier la nouvelle »
  (https://docs.reposter.io/guide/vinted.md). Il s'agit d'un dédoublonnage à la republication, pas d'un
  retrait après vente.

## 6. Republication / relist automatique

- **Leboncoin : oui, c'est le cœur du produit.** Les **tâches** programment la publication ou la
  republication, avec **segmentation** (lots espacés), **récurrence** (relance après N jours) et
  **multi-villes** (1 crédit par ville) (https://docs.reposter.io/guide/taches.md). Une republication
  supprime l'ancienne annonce puis en publie une nouvelle, pour 1 crédit (https://docs.reposter.io/guide/credits.md). Sur
  une tâche sans villes, « l'annonce en ligne est remplacée par la nouvelle publication : pas de
  doublon ».
- Autres réglages : rotation de la photo de couverture (« ordre fixe / couverture / mélange ») et
  **vignettes** (incrustation d'un prix, d'un badge ou d'un texte sur la 1ʳᵉ photo, régénérée à chaque
  publication) (https://docs.reposter.io/guide/annonces.md, https://docs.reposter.io/guide/vignettes.md).
- **Vinted** : relisting annoncé dans les guides (« Reposter programme vos tâches de relisting dans le
  cloud : votre dressing se reliste 24h/24, même PC éteint »,
  https://reposter.io/relister-annonces-vinted-automatiquement). La page Tâches de la doc est rédigée
  pour Leboncoin (villes) : le détail du relisting Vinted n'est pas documenté.
- Conseil de rythme de l'éditeur : « une fréquence de 2-3 jours par annonce »
  (https://reposter.io/comparaison).

## 7. Stock, ventes, statistiques

- **Statistiques : oui, des statistiques d'audience.** Vues, impressions, messages, appels et favoris, par
  période et par compte, puis par annonce, par ville ou par département. Les compteurs sont cumulés d'une
  republication à l'autre (« Reposter enregistre les chiffres de chaque annonce juste avant de la supprimer,
  puis les additionne ») (https://docs.reposter.io/guide/statistiques.md).
- **Indicateurs de performance Leboncoin Pro** : relevés une fois par jour, avec un e-mail si un indicateur
  passe sous l'objectif (au plus un par semaine) (https://docs.reposter.io/guide/comptes.md).
- **Ventes, marge, comptabilité, stock : rien de documenté.** Aucune page de la doc ne décrit un suivi des
  ventes, des prix d'achat ou des bénéfices. « Reposter centralise le suivi pour éviter les doubles ventes »
  (https://reposter.io/transferer-vinted-vers-leboncoin) est une phrase marketing, que la doc ne précise pas.

## 8. Prix

| Formule | Crédits / mois | Prix / mois | Prix par publication |
|---|---|---|---|
| — | 10 | 10 € | 1,00 € |
| — | 50 | 20 € | 0,40 € |
| — | 100 | 30 € | 0,30 € |
| — | 500 | 50 € | 0,10 € |
| Sur mesure | — | sur demande | — |

Source : https://reposter.io/ (`#pricing`). Le JSON-LD donne `AggregateOffer` EUR 10–50, 4 offres.
- « 1 crédit = 1 publication (remontée ou duplication) ». 1 annonce publiée dans 40 villes = 40 crédits.
- **Essai** : « 10 publications offertes à l'inscription, sans carte bancaire » (depuis septembre 2026 ; avant,
  1 seule). Pour les catégories Véhicules et Immobilier, la publication demande une offre payante
  (https://docs.reposter.io/guide/credits.md).
- **Crédits non cumulables** d'un mois à l'autre, perdus à la résiliation, non remboursables
  (https://docs.reposter.io/guide/credits.md, https://reposter.io/cgu).
- **Options en plus** dont le prix n'est pas public : **multi-plateforme (Vinted)** et **messagerie** (activable
  « directement depuis la page Abonnement », essai gratuit de 24 h, « Quota de réponses IA »,
  https://docs.reposter.io/changelog/overview.md). Chaque formule a aussi une « limite d'annonces »
  (changelog d'août 2026), qui n'est pas publiée.
- **Incohérence relevée** : les CGU (https://reposter.io/cgu et https://docs.reposter.io/legal/cgu.md)
  disent « La tarification de nos services commence à 30€ par mois » et « Trois abonnements officiels ».
  L'accueil affiche 4 formules à partir de 10 €.
- Paiement : Stripe. Sans engagement.

## 9. Pays et langues

- **Langue** : français seulement (`lang="fr"`, aucun `hreflang`, `/en` en 404).
- **Pays** : France (« destiné aux utilisateurs français », CGU ; « partout en France »,
  https://reposter.io/a-propos). L'ouverture à d'autres pays est annoncée sans date : « ouverture à de
  nombreuses autres plateformes pour élargir à l'Europe ».
- **Hébergement annoncé** : « Hébergement France 🇫🇷 » (https://reposter.io/comparaison) ; « Vos données ne
  sortent pas de France » (https://reposter.io/a-propos).
- **Éditeur** : il n'est pas identifié sur les pages actuelles. La page https://reposter.io/legal (présente dans
  le sitemap, absente du pied de page) affiche « Page en construction ». Une capture de la même page
  datée du 2025-08-08 (https://web.archive.org/web/20250808200418/https://reposter.io/legal) indiquait :
  « Raison sociale : reposter A.S. », « Société Anonyme », siège à Istanbul, « Hébergement : Namecheap,
  Inc », données hébergées en « Europe ». Je n'ai pas pu vérifier quel est l'éditeur aujourd'hui.

## 10. Notes publiques

| Source | Résultat | Date / URL |
|---|---|---|
| Trustpilot | **aucune page trouvée** : WebFetch renvoie **404** sur https://fr.trustpilot.com/review/reposter.io. Curl se heurte à l'anti-robot (403), le 404 n'a donc pas pu être confirmé une seconde fois | 09/10/2026 |
| App Store / Google Play | **aucune app** (voir § 2) | 09/10/2026 |
| Chrome Web Store | **aucune extension** | 09/10/2026 |
| ScamDoc (agrégateur, avis non modérés a priori) | « App.reposter.io » : indice de confiance « Moyen » (titre de la page : « 63 % ») ; **5 avis, note moyenne 2,6/5**, publiés du 30/05/2024 au 06/07/2026. Deux avis sont **négatifs** sur l'usage : un compte Leboncoin suspendu (2024) ; crédits perdus et annonces refusées par LBC (04/2025). Un troisième critique l'absence de mentions légales (11/2024). Deux sont **positifs** : gain de temps et réactivité du gérant (05/2025 et 07/2026, ce dernier précisant « dans 98% des cas, ça fonctionne très bien »). Dernière analyse ScamDoc : 07/07/2026 | https://fr.scamdoc.com/view/1449347 |
| Site de l'éditeur | « 98% de satisfaction », « +1M publications effectuées », 3 témoignages à initiale (Laurent M., Sophie D., Marc T.), **déclaratifs, sans source** | https://reposter.io/ |

## 11. Ce qu'ils font bien (honnêtement)

1. **Exécution côté serveur** : les tâches tournent PC éteint et sans onglet ouvert. C'est leur argument
   central contre les extensions, et c'est un vrai confort pour la republication programmée.
2. **Profondeur sur Leboncoin** : multi-villes, segmentation, récurrence, rotation de la photo de
   couverture, vignettes personnalisées, statistiques cumulées malgré les republications, suivi des
   indicateurs Leboncoin Pro, explication de l'erreur LBC « INSUFFICIENT_CREDIT »
   (https://docs.reposter.io/guide/credit-insuffisant.md). C'est un outil pensé pour les gros vendeurs
   Leboncoin (auto, immobilier, brocante).
3. **Assistant de messagerie** : deux modes (modèle à variables, ou IA). L'IA répond depuis la fiche, propose
   des alternatives tirées du catalogue, envoie des photos (3 maximum par message) et prévient le vendeur
   par Telegram ou e-mail quand une question sort du cadre.
4. **Conversion LBC → Vinted soignée** : les champs obligatoires Vinted sont vérifiés avant l'envoi, les titres
   en majuscules corrigés, la conversion se fait en masse après un import, et l'ancienne version est
   dédoublonnée dans le dressing.
5. **Prix transparent et simulateur** : 4 formules publiques, estimateur de budget, essai de 10 crédits sans
   carte.
6. **SEO/GEO très travaillé** (pertinent pour notre chantier) : 51 URL dans le sitemap, dont environ 45 guides
   en français sur des requêtes à intention (« bot leboncoin », « extension leboncoin », « relister vinted
   sans extension », « multiposting leboncoin vinted », « transférer vinted vers leboncoin »). On y trouve
   aussi un `llms.txt` sur le site (https://reposter.io/llms.txt) et un autre sur la doc, un `robots.txt`
   qui autorise explicitement GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.
   (`Content-Signal: search=yes, ai-input=yes, ai-train=yes`), des JSON-LD `FAQPage`,
   `SoftwareApplication` (avec `AggregateOffer`) et `Article`, une page « comparaison » et une fiche
   serveur MCP (https://reposter.io/.well-known/mcp/server-card.json).
7. **Changelog public mensuel** (mars → septembre 2026) : le service évolue de façon visible.
8. **Avertissement de non-affiliation clair** sur chaque page (LBC France SAS, Adevinta, Vinted UAB). Un
   guide reconnaît aussi que « Les conditions générales de Leboncoin interdisent l'usage de moyens
   automatisés » (https://reposter.io/bot-leboncoin).

## 12. Écarts factuels avec FillSell

Faits seulement. Le côté FillSell vient du contexte commun du chantier.

| Point | Reposter (09/10/2026) | FillSell |
|---|---|---|
| Plateformes | Leboncoin, Vinted (option à activer) | Vinted, Leboncoin, eBay, Beebs |
| Mobile | pas d'app native ; web/PWA | app iOS / Android |
| Exécution | serveurs de Reposter, avec les identifiants de la plateforme confiés (e-mail, mot de passe, téléphone) | extension Chrome sur l'ordinateur de la personne |
| Création d'annonce | formulaire ou import ; l'IA ne sert qu'à convertir d'une plateforme à l'autre | identification par photo / IA (titre, description, prix) |
| Retrait après vente | annoncé de façon variable (« peut », « en un clic »), non documenté ; un guide conseille un contrôle manuel chaque soir | retrait des copies après une vente |
| Ventes / stock | statistiques d'audience seulement ; aucun suivi des ventes documenté | stock, ventes |
| Tarif | au crédit (chaque republication et chaque ville = 1 crédit), crédits perdus en fin de mois ; Vinted et messagerie en options au prix non public | — |
| Éditeur | non identifié sur les pages actuelles | — |

## 13. Ce qu'on ne peut pas vérifier sans compte

- Le **retrait automatique après vente** : existe-t-il vraiment, est-il automatique ou à un clic, couvre-t-il
  Vinted → LBC ?
- Le **sens Vinted → Leboncoin** et l'**import depuis Vinted** (annoncés dans les guides, absents de la doc).
- Le **relisting Vinted programmé** (annoncé dans les guides, non documenté).
- Le **prix des options** « multi-plateforme » (Vinted) et « messagerie », le quota de réponses IA, la
  limite d'annonces de chaque formule.
- Les **pays Vinted** acceptés (seule la France est sous-entendue).
- La qualité réelle de l'IA (catégories, attributs, réponses) et l'ergonomie de la PWA sur téléphone.
- Les volumes (« +1M publications », « 98 % de satisfaction ») et le nombre de clients.
- L'éditeur juridique actuel et le lieu d'hébergement réel : « France » est annoncé aujourd'hui, mais une
  capture de 08/2025 indiquait Namecheap et l'Europe.
- La note Trustpilot : 404 via WebFetch, mais l'anti-robot bloque une seconde lecture par curl.

## Sources (toutes lues le 2026-10-09)

- https://reposter.io/ (accueil, tarifs, FAQ en JSON-LD)
- https://reposter.io/transferer-annonces-leboncoin-vinted
- https://reposter.io/transferer-vinted-vers-leboncoin
- https://reposter.io/multiposting-leboncoin-vinted
- https://reposter.io/comment-marquer-vendu-leboncoin
- https://reposter.io/relister-annonces-vinted-automatiquement
- https://reposter.io/relister-vinted-sans-extension
- https://reposter.io/extension-leboncoin
- https://reposter.io/bot-leboncoin
- https://reposter.io/comparaison
- https://reposter.io/a-propos
- https://reposter.io/cgu · https://reposter.io/policy · https://reposter.io/legal
- https://reposter.io/sitemap.xml · https://reposter.io/robots.txt · https://reposter.io/llms.txt
- https://reposter.io/.well-known/mcp/server-card.json
- https://docs.reposter.io/llms.txt et pages `.md` : guide/demarrage, guide/annonces, guide/vignettes,
  guide/comptes, guide/taches, guide/credits, guide/credit-insuffisant, guide/messagerie,
  guide/statistiques, guide/vinted, guide/acces-agents, changelog/overview, legal/cgu, legal/confidentialite
- https://app.reposter.io/ et https://app.reposter.io/manifest.json (page publique seulement)
- https://web.archive.org/web/20250808200418/https://reposter.io/legal (capture du 2025-08-08)
- https://rdap.identitydigital.services/rdap/domain/reposter.io
- https://fr.trustpilot.com/review/reposter.io (404 via WebFetch)
- https://fr.scamdoc.com/view/1449347
- https://itunes.apple.com/search?term=reposter&country=fr&entity=software
- https://play.google.com/store/search?q=reposter%20leboncoin%20vinted&c=apps&hl=fr&gl=FR
- https://chromewebstore.google.com/search/reposter
