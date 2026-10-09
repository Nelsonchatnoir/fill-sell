# Klork — vérification sur ses pages réelles

Date d'observation : **2026-10-09** (entre 15:05 et 15:20, heure de Paris). Méthode : lecture du web
seulement : curl, WebFetch, WebSearch et un Chromium sans tête, parce que klork.app est une
application React rendue côté client et que le HTML brut ne contient que le `<title>`. Aucun compte n'a été
créé, aucune connexion n'a été faite et aucun formulaire n'a été envoyé. Seul geste fait sur une page : le bouton
« Mensuel » de la page tarifs, une bascule d'affichage qui n'envoie rien. Le paquet public de l'extension
a été téléchargé depuis le serveur de mises à jour de Google. Seul son `manifest.json` a été lu, et rien
n'a été exécuté. Les fichiers JavaScript publics du site (`/assets/*.js`) ont été lus comme du texte.
Ce qu'ils révèlent des écrans réservés aux abonnés est signalé « **code servi, non vérifié en usage** ».
Les chiffres d'activité, d'utilisateurs et les témoignages publiés par Klork sont **ses propres
affirmations**. Les seuls chiffres tiers relevés sont ceux du Chrome Web Store (CWS) et de l'API publique
d'invitation Discord.

---

## 1. Fiche d'identité

| Élément | Constat | Source (lue le 2026-10-09) |
|---|---|---|
| Nom sur le CWS | « Klork — Publie ton dressing Vinted partout » | https://chromewebstore.google.com/detail/gcjfkpapmjmflgnadggedomnocfheagf |
| Utilisateurs CWS | **585 utilisateurs** | idem |
| Note CWS | **5,0 / 5 (3 avis)** | idem et `/reviews` |
| Version / mise à jour | **2.3.531**, « Dernière mise à jour : 8 octobre 2026 », 665 KiB, langue de la fiche : « français », « Propose des achats via l'application » | idem ; `manifest.json` du paquet (version 2.3.531) |
| Statut de l'éditeur sur le CWS | « Professionnel — Ce développeur s'est identifié comme professionnel selon la définition de l'Union européenne » ; pays : FR | idem |
| Éditeur | Entrepreneur individuel (micro-entreprise) français, TVA non applicable (art. 293 B du CGI) ; fondateur prénommé Maël | https://klork.app/mentions-legales (mise à jour du 5 juillet 2026) ; https://klork.app/ |
| Hébergement | « Hetzner Online GmbH […] Allemagne. Les serveurs sont situés au sein de l'Union européenne. » | https://klork.app/mentions-legales |
| Affiliation | « Klork est un outil indépendant, non affilié à Vinted, Leboncoin, eBay, Depop ou Vestiaire Collective. » | fiche CWS |
| Promesse | « Ton dressing Vinted, en vente partout. » ; « Sauvegarde, publication et anti-survente » ; méta : « sauvegarde tes annonces et les republie en un clic sur 8 plateformes, dans ton navigateur et sans stocker tes mots de passe » | https://klork.app/ |
| Communauté | Discord « Klork » : **≈ 319 membres**, ≈ 98 en ligne (compteurs approximatifs de l'API publique d'invitation) | `https://discord.com/api/v10/invites/s8Zabn9Frv?with_counts=true` (lien d'invitation affiché sur https://klork.app/) |

---

## 2. Les points demandés

### 2.1 Plateformes supportées

Klork distingue les plateformes d'**où il sauvegarde** (la source) et celles **où il publie**. Vinted est la
source historique. Les pages publiques n'annoncent pas Vinted comme destination.

- Accueil : « Sauvegarde depuis 7 plateformes, publie sur 8 · l'annonce peut naître n'importe où » —
  https://klork.app/
- FAQ de l'accueil : « Klork sauvegarde depuis Vinted, Leboncoin, eBay, Depop, Vestiaire Collective, Opla et
  Beebs, puis publie sur les 8 plateformes, Whatnot et Grailed compris. » — https://klork.app/#faq
- Tarifs, plan Gratuit : « Les 8 plateformes (Leboncoin, eBay, Depop, Vestiaire, Whatnot, Beebs, Opla,
  Grailed) » — https://klork.app/pricing
- La fiche CWS n'en cite que quatre : « publie tes annonces en 1 clic sur Leboncoin, Depop, Vestiaire
  Collective et eBay » ; « qu'elle parte sur 1 ou sur les 4 plateformes ».
- **Preuve technique** (`manifest.json` de la version 2.3.531, paquet public du CWS) : les `host_permissions` couvrent
  `leboncoin.fr`, `depop.com`, **`ebay.fr` seul**, `vestiairecollective.com`, `whatnot.com`, `beebs.app`,
  `opla.co`, `grailed.com`, `vinted.net` et **21 domaines Vinted**, plus `klork.app`.
- Code servi (non vérifié en usage) : la liste par défaut des destinations est `["leboncoin","ebay","depop","vestiaire"]`.
  Whatnot, Beebs, Opla et Grailed ne s'ajoutent que si un interrupteur est posé sur le compte
  (`{platform:"beebs",feature:"beebs"}`…). La publication **vers** Vinted existe derrière un autre
  interrupteur (`{platform:"vinted",feature:"vintedPublication"}`). Le formulaire d'annonce de l'app dit
  pourtant : « Klork n'écrit jamais sur Vinted ». On ne sait pas, sans compte, à qui ces interrupteurs sont
  ouverts.

| Plateforme | Supportée ? | Détail |
|---|---|---|
| **Vinted** | **Oui, comme source** (sauvegarde du dressing, détection des ventes). Comme destination : non annoncé. | Les pages publiques parlent de **vinted.fr** : « Klork part de vinted.fr » (https://klork.app/guides/outils-us-vendeur-francais) ; « l'URL ressemble à vinted.fr/member/… » (https://klork.app/guides/sauvegarder-dressing). Le manifeste injecte ses scripts sur **21 domaines Vinted** : .fr .com .co.uk .de .es .it .nl .be .lu .pl .lt .cz .sk .at .pt .ro .se .hu .gr .hr .dk .fi. **Aucune page publique ne dit quels pays sont réellement pris en charge.** |
| **Leboncoin** | **Oui** (publication ; sauvegarde annoncée sur l'accueil, voir la contradiction C1) | « Leboncoin est la plateforme la plus simple pour commencer : un formulaire unique, que Klork remplit de bout en bout » — https://klork.app/guides/publier-leboncoin |
| **Beebs** | **Annoncé** dans les « 8 plateformes » (publication) et parmi les sources de sauvegarde | Accueil et tarifs (citations ci-dessus) ; domaine `beebs.app` dans le manifeste. Aucun guide Beebs dans le centre d'aide. Activation par compte dans le code. |
| **eBay FR** | **Oui, ebay.fr seulement** | « Être connecté à ebay.fr avec un compte vendeur actif. » — https://klork.app/guides/publier-ebay ; seul domaine eBay du manifeste : `*.ebay.fr` |
| Depop | Oui | https://klork.app/guides/publier-depop |
| Vestiaire Collective | Oui (brouillon volontaire s'il manque une information) | https://klork.app/guides/publier-vestiaire |
| Whatnot, Grailed, Opla | Annoncés (« 8 plateformes ») | Accueil et tarifs ; activation par compte dans le code. Grailed est tarifé en USD dans le code (`devise:"USD"`). |

### 2.2 Application mobile iOS / Android : **non** (tableau de bord web installable seulement)

- App Store : la recherche « klork » ne renvoie **aucun** résultat en France (API iTunes Search,
  `country=fr`, 2026-10-09). Aux États-Unis, elle renvoie trois applications sans rapport (« Kriech », « Tikk »,
  « Orivently »).
- Google Play : aucune application Klork dans la recherche « klork »
  (https://play.google.com/store/search?q=klork&c=apps&hl=fr&gl=FR).
- Centre d'aide, « Est-ce que Klork marche sur téléphone ? » : « En partie. Ton dashboard — annonces,
  statistiques, ventes, réglages — se consulte depuis un mobile. En revanche la sauvegarde et la publication
  passent par l'extension Chrome, qui n'existe que sur ordinateur […]. En pratique : tu publies depuis ton
  ordinateur, tu suis tout depuis ton téléphone. » — https://klork.app/help (texte de la réponse lu dans le
  code de la page)
- Le site est une **PWA** (application web installable : `site.webmanifest`, `display: standalone`, écrans
  de démarrage iPhone). Le centre des guides propose un tutoriel vidéo « Klork sur ton iPhone » (39 s).
  Source : https://klork.app/guides ; https://klork.app/site.webmanifest

### 2.3 Extension navigateur : **oui, c'est le cœur du produit**

- « L'extension est le moteur de Klork : sans elle, pas de sauvegarde ni de publication. » —
  https://klork.app/guides/connecter-extension
- Navigateurs : « Chrome, Brave, Edge, Opera — tout navigateur qui accepte les extensions Chrome. » (idem).
  La fiche CWS dit : « Conçu pour Chrome sur ordinateur. »
- Plusieurs ordinateurs : « Oui : installe l'extension sur chacun et refais la liaison. » (idem). Un
  « bail » d'automatisation empêche deux navigateurs de travailler en même temps sur un compte
  (https://klork.app/securite).
- Permissions du manifeste : `storage`, `unlimitedStorage`, `alarms`, `cookies`, `tabs`, `scripting`,
  `debugger`. L'accueil prévient : « Chrome affiche un avertissement : c'est normal. C'est ce qui permet à
  Klork de remplir tes annonces à ta place. »

### 2.4 D'où l'on part : **l'ordinateur**

- Version téléphone de l'accueil : « Klork marche sur ordinateur. Inscris-toi ici, le lien t'arrive par
  email. » ; « Sur ton téléphone ? Crée ton compte maintenant, tu ajouteras l'extension depuis ton
  ordinateur. » — https://klork.app/
- Parcours : compte, puis extension Chrome, liaison, sauvegarde depuis le dressing Vinted ouvert sur
  l'ordinateur (« Le bouton Klork n'apparaît que là »), puis publication. Source :
  https://klork.app/guides/premiers-pas
- Le téléphone sert au suivi (tableau de bord), pas à la publication (§ 2.2).

### 2.5 Identification par photo, IA (titre, description, prix) : **rien d'ouvert au public sur les pages marketing**

- Aucune page publique n'annonce de reconnaissance d'un article à partir d'une photo. Le flux annoncé reprend
  une annonce **déjà rédigée** sur Vinted.
- Plan Pro : « Description au choix (IA ou la tienne) » — https://klork.app/pricing
- Leboncoin : « Par défaut Klork laisse l'IA de Leboncoin générer une description. Pour garder TON texte tel
  quel : Réglages → Mes plateformes → Leboncoin → Description → « Ma description » ». Source :
  https://klork.app/guides/publier-leboncoin
- **Klork Studio** (code servi, non vérifié en usage ; absent de l'accueil et des tarifs) : « Dépose un
  dossier de photos. Klork sépare les articles, rédige chaque annonce et la range dans ton Dressing. Rien
  n'est publié sans toi. » ; lecture du SKU sur une photo d'étiquette ; « Proposer un prix d'après mes
  ventes — Tes ventes de la marque sur 12 mois et tes annonces du même type en ligne. Sans repère, le prix
  reste vide. » ; dépôt possible depuis « la galerie du téléphone ». Statut affiché dans le code : « Le
  Studio n'est pas encore ouvert sur ton compte. » et « Le Studio n'est pas encore ouvert au public au-delà
  des annonces offertes : les packs pour en faire plus arrivent bientôt. »
- Fournisseur d'IA du Studio : « Google (Gemini, l'intelligence artificielle de Klork Studio), uniquement si
  tu utilises le Studio — États-Unis » — https://klork.app/privacy (mise à jour du 1er octobre 2026)

### 2.6 Import / synchronisation du stock existant

- **Vinted** (cœur du produit) : bouton « Sauvegarder mes annonces » sur la page de dressing, ou
  « Sauvegarde automatique » : « ton dressing est relu quand tu ouvres Vinted, les nouvelles annonces
  ajoutées, et les articles vendus détectés tout seuls ». Re-sauvegarder « met à jour (prix, photos, statut
  vendu) — jamais de doublons : chaque annonce est reconnue par son identifiant Vinted ». Les brouillons et
  les annonces masquées ne sont pas sauvegardés. Source : https://klork.app/guides/sauvegarder-dressing
- **Autres plateformes** : l'accueil promet une sauvegarde « depuis Leboncoin, eBay, Depop, Vestiaire, Opla
  et Beebs » (https://klork.app/). Le guide comparatif, « relevé des offres publiques : août 2026 », dit
  encore : « Klork part aujourd'hui du dressing Vinted comme source. L'import depuis Leboncoin est à
  l'étude ». Source : https://klork.app/guides/republier-vinted-leboncoin-comparatif. Voir la contradiction C1.
- Code servi (non vérifié en usage) : un écran rapproche les annonces vues sur une plateforme des fiches Klork
  existantes (« Même référence et même titre, une seule fiche possible. ») et propose de supprimer celles qui
  n'ont aucune fiche (« le plus souvent, l'article est déjà VENDU »).
- Multi-comptes Vinted : « Oui, le multi-comptes est inclus dès le plan Gratuit : chaque dressing garde ses
  annonces, ses plateformes et son journal. » — https://klork.app/#faq

### 2.7 Retrait automatique des copies après une vente (auto-delist) : **oui, plan Business seulement**

- « Klork repère la vente, sur Vinted comme ailleurs, et retire l'annonce de toutes les autres plateformes.
  Fini la double vente. Automatique dès le plan Business · détection + retrait manuel en Gratuit ». Source :
  https://klork.app/
- Détection, d'après le guide https://klork.app/guides/vendu-et-maintenant :
  - Vinted : « Klork ne voit pas ta vente en direct : il la découvre en re-sauvegardant ton dressing
    (bouton Sauvegarder, ou la sauvegarde automatique). »
  - Ailleurs : « Klork scanne les pages Vendues de Depop, eBay, Leboncoin et Vestiaire (bouton Détecter les
    ventes, plus un scan automatique régulier) et te propose de marquer les articles concernés — tu
    confirmes toujours avant. »
  - Le centre d'aide précise le rythme : « la détection des ventes tourne toute seule une fois par jour à
    l'ouverture du dashboard » (https://klork.app/help).
- Retrait : « À l'unité », « En lot » et « Automatique (Business) : l'anti-survente retire tout seul, dès
  qu'un article passe vendu — même dashboard fermé. » Le geste dépend de la plateforme : « Leboncoin → suppression · eBay
  → « Mettre fin à l'annonce » · Vestiaire → « Retirer de la vente » · Depop → suppression. Vinted n'est
  jamais touché : c'est ta source. » Voir cependant la contradiction C2.
- Garde-fous annoncés : « détection sur preuve, confirmation avant marquage, plafond sur les retraits
  automatiques en masse, et ambiguïté = on te rend la main » ; une commande « Annulée »/« Remboursée » ne compte pas
  comme une vente (même guide). Un journal des retraits est visible sur le tableau de bord
  (https://klork.app/guides/sante-du-compte).
- Chiffre affiché par Klork : « 8 820 doubles ventes évitées ces 30 derniers jours » (« Chiffres réels de
  l'activité Klork, arrondis, recalculés chaque heure ») — https://klork.app/ (affirmation de Klork).

### 2.8 Republication / relist : **manuelle** (Pro par plateforme, Business partout) ; automatique « Bientôt »

- « Relister = Klork supprime l'ancienne annonce puis la republie à l'identique : elle repart en tête des
  résultats. » Le geste se fait par plateforme ou par « Relister partout » (Business). Il consomme un crédit : « 1 article relisté
  partout = 1 crédit ». Les favoris de l'ancienne annonce sont perdus. Source : https://klork.app/guides/relister
- Aide aux choix : tri « ⏳ À relister » et compteur d'ancienneté (https://klork.app/help).
- **Relist automatique** : seulement dans l'« Autopilote » du plan **Entreprise**, marqué « Bientôt » avec
  une liste d'attente : « tu déposes sur Vinted, Klork publie, relance et fait les offres — tout seul » —
  https://klork.app/pricing. L'écran Autopilote existe dans le code servi (relist des annonces sans acheteur,
  « Jamais la même annonce deux fois le même jour », offres aux favoris, négociation). Son ouverture réelle est
  non vérifiable.
- Klork ne republie pas **dans** Vinted : « pas de republication en masse dans Vinted, pas de bots de
  visite » — https://klork.app/guides/sante-du-compte

### 2.9 Stock, ventes, statistiques

- Stock : « Ton dressing, sauvegardé […] avec recherche, stats et valeur du stock » — https://klork.app/
- Ventes (fiche CWS) : « Chaque vente est enregistrée : chiffre d'affaires par plateforme, délai moyen de
  vente, et marge réelle dès que tu saisis ton prix d'achat. L'historique survit à la suppression des
  annonces. »
- Autres outils annoncés (accueil, « Et aussi, dans Klork ») : « Relister en un clic », « Offres aux
  intéressés », « Messagerie centralisée » (Pro), « Bordereaux réunis », « Ventes et marges par
  plateforme », « Multi-comptes ».
- Offres aux intéressés : option native d'eBay « envoyer automatiquement des offres », réponses aux
  « X s'intéresse » sur Leboncoin, offres aux nouveaux likes sur Vestiaire et Depop
  (https://klork.app/guides/reglages-marges).
- Marges par plateforme (« ex. +20 % sur Vestiaire, −5 % sur Leboncoin »), frais de port eBay et Depop, gestion du SKU
  (champ SKU natif de Depop, règle apprise « d'un clic sur le mot ») — https://klork.app/guides/reglages-marges
- Classement facultatif entre vendeurs « sur leur NOMBRE de ventes hors Vinted », récapitulatif hebdomadaire
  et résultats de publication par Discord (https://klork.app/help ; https://klork.app/guides/reglages-marges).
- Connecteur IA (MCP) en lecture pour Claude, ChatGPT et Cursor, « Inclus à partir du plan Pro » —
  https://klork.app/guides/brancher-ton-ia
- Mode test (« dry-run ») : « remplit le formulaire cible sans cliquer « Publier » » —
  https://klork.app/guides/sante-du-compte

### 2.10 Prix : paliers, devise, essai gratuit

Source : https://klork.app/pricing, rendue le 2026-10-09. La page s'ouvre sur l'affichage **annuel**. Les prix
mensuels ont été lus après un clic sur « Mensuel ». Toutes les sommes sont **en euros** (« Prix affichés en
euros » : https://klork.app/terms).

| Palier | Mensuel | Annuel (« 2 mois offerts ») | Volumes | Contenu annoncé |
|---|---|---|---|---|
| **Gratuit** | 0 € | — | 10 annonces publiées / mois · 150 annonces sauvegardées | « Les 8 plateformes » · « Multi-comptes Vinted » · « Détection des ventes + retrait manuel » |
| **Pro** (« Le plus populaire ») | **15 €** | 150 € / an (affiché « 13 € / mois ») | 200 annonces publiées / mois · sauvegardes illimitées | Marges et frais de port par plateforme · relister une annonce · description IA ou la sienne · export en lot et file d'attente · messagerie centralisée |
| **Business** | **35 €** | 350 € / an (affiché « 29 € / mois ») | Publications illimitées | Anti-survente **automatique** · relister partout en un clic · messages et offres automatiques aux intéressés |
| **Entreprise** (« Bientôt », liste d'attente) | **69 €** | 690 € / an (affiché « 58 € / mois ») | Illimité | Autopilote · « Klork Cloud inclus : tout tourne même PC éteint » · accompagnement dédié |

- Unité de compte : « Une annonce part sur toutes tes plateformes d'un coup et ne compte que pour 1. » ;
  « 200/mois = 200 articles envoyés partout — pas 50 par site. » Un crédit consommé n'est pas rendu si
  l'annonce est supprimée (https://klork.app/help).
- **Essai gratuit des paliers payants : aucun annoncé.** À la place, le plan Gratuit est permanent : « Sans
  carte bancaire », « Résiliable en un clic » (https://klork.app/).
- Prix de lancement : le code fixe une fin au « 2026-10-01T00:00:00+02:00 », avec 12 € (Pro) et 29 €
  (Business) avant cette date. L'accueil affiche aujourd'hui « Pro à 15 € par mois ». Les comptes bêta gardent
  le prix de lancement : « Prix de lancement — gelé à vie pour les comptes beta ».
- Parrainage : « Ton filleul obtient −15 % sur son premier mois », et le parrain touche un pourcentage de
  chaque facture (https://klork.app/help ; https://klork.app/terms).
- Paiement par Stripe ; droit de rétractation de 14 jours encadré par les CGU (https://klork.app/terms).

### 2.11 Pays et langues

- Marché visé : la France. « L'alternative pensée pour la France […] En français, avec un support qui
  répond en français. » — https://klork.app/guides/outils-us-vendeur-francais
- Site : bascule **FR / EN** sur toutes les pages, et textes anglais complets dans le code. Fiche CWS :
  langue « français » seulement.
- Plateformes françaises ou européennes (leboncoin.fr, ebay.fr), droit français, hébergement dans l'Union
  européenne. Les pays Vinted réellement pris en charge ne sont pas dits (§ 2.1).

### 2.12 Notes publiques

| Source | Note | Nombre d'avis | Dates | URL |
|---|---|---|---|---|
| Chrome Web Store | **5,0 / 5** | **3** | 1 août 2026 (×2), 2 sept. 2026 | https://chromewebstore.google.com/detail/gcjfkpapmjmflgnadggedomnocfheagf/reviews |
| Trustpilot | **aucune page** | — | — | https://www.trustpilot.com/review/klork.app → 404 (WebFetch) ; https://fr.trustpilot.com/review/klork.app → 403 à curl (anti-robot), 404 à WebFetch |
| App Store / Google Play | **aucune application** | — | — | § 2.2 |
| Témoignages sur le site | 6 citations à 5 étoiles : 4 « sur Discord » (25 au 27 août 2026) et 2 « sur le Chrome Web Store » | — | — | https://klork.app/ (choisis par Klork) |

Les trois avis du CWS, mot pour mot : « Juste incroyable ! Merci » (Timetowear, 2 sept. 2026) ; « outil
incroyable, je fait des ventes en plus tout les mois sans bouger le petit doigt, le fondateur est très
réactif et à l'écoute franchement rien à redire !! » (Thibault pro, 1 août 2026) ; « Outil génial ! Je suis
passé de vendre sur Vinted à vendre partout ! +40% de CA en y passant 2 minutes par jour, merci beaucoup »
(Omega, 1 août 2026).

Chiffres d'activité **affichés par Klork** (accueil, 2026-10-09 ~15:14) : « 132 400 annonces gérées par
des vendeurs Klork », « 121 470 publications ces 30 derniers jours », « 8 820 doubles ventes évitées ces 30
derniers jours ». Le fondateur dit revendre lui-même : « plus de 550 annonces, 17 000 € de stock ».

---

## 3. Ce qu'ils font bien (honnêtement)

1. **Couverture des plateformes de mode** : Vestiaire Collective et Depop sont documentés, guide à l'appui.
   Whatnot et Grailed sont annoncés. Chaque plateforme a ses règles : brouillon Vestiaire voulu, SKU dans le
   champ natif de Depop, conditions de vente eBay.
2. **Unité de compte lisible** : 1 article = 1 crédit, quel que soit le nombre de plateformes.
   C'est dit en toutes lettres sur la page tarifs.
3. **Offre gratuite utile** : 150 annonces sauvegardées, 10 publications par mois, multi-comptes Vinted
   et détection des ventes, sans carte.
4. **Transparence sur la sécurité des comptes** : la page https://klork.app/securite liste ce que Klork
   fait et **ce qu'il refuse** (pas de contournement de CAPTCHA, pas d'empreinte maquillée, pas de rotation
   d'IP, pas d'interfaces privées). S'y ajoutent un mode test, un bouton d'arrêt immédiat et une page d'état des
   services (https://klork.app/status).
5. **Contenu éditorial dense en français** : 25 guides (installation, plateformes, comparatifs d'outils,
   méthode anti-double vente) et un blog eBay de 23 articles. Les comparatifs nomment les concurrents
   (Reposter, Redrip, Vendoo, Crosslist, List Perfectly, FLUF, Zipsale, SellerAider) en datant leurs relevés.
   Ils sont listés dans `sitemap.xml`.
6. **Preuve sociale vivante** : compteurs d'activité recalculés chaque heure, démonstration interactive
   (« clique la plateforme où l'article se vend »), Discord d'environ 319 membres, feuille de route publique.
7. **Outils de vendeur au-delà de la publication** : offres automatiques aux intéressés, messagerie
   centralisée, marges par plateforme, bordereaux, connecteur MCP pour assistants IA, 2FA, export JSON.
8. **Cadence de livraison** : extension en version 2.3.531, mise à jour la veille de l'observation.

---

## 4. Contradictions relevées sur leurs propres pages (faits, datés)

- **C1 — Sources de sauvegarde.** L'accueil et la FAQ (2026-10-09) disent « sauvegarde depuis 7 plateformes ».
  Le guide comparatif (« relevé […] août 2026 ») dit « Klork part aujourd'hui du dressing Vinted comme
  source. L'import depuis Leboncoin est à l'étude ». La fiche CWS ne parle que du dressing Vinted.
- **C2 — Toucher à Vinted.** Le guide https://klork.app/guides/vendu-et-maintenant dit : « Vinted n'est jamais touché :
  c'est ta source. » Le centre d'aide décrit une option « Retirer de Vinted automatiquement » : « Klork s'en
  charge lui-même depuis le navigateur où ce compte Vinted est connecté ». L'écran Autopilote du code a une
  case « Retirer aussi ce que je supprime moi-même de Vinted ».
- **C3 — Nombre de plateformes.** « 8 plateformes » sur le site, « les 4 plateformes » sur la fiche CWS et
  dans la FAQ des crédits (« qu'elle parte sur une seule plateforme ou sur les quatre »). Dans le code, 4 sont actives par
  défaut et 4 dépendent d'un interrupteur posé sur le compte.
- **C4 — Lien de la fiche CWS.** « Détail et prix à jour sur https://klork.app/tarifs ». L'URL répond HTTP
  200, mais la page rendue est l'erreur de l'application : « ERREUR 404 — Cette page a plongé. ». La vraie
  page est `/pricing`, celle que déclare le `sitemap.xml`.

---

## 5. Observations SEO / GEO (utiles au chantier)

- **Rendu côté client seulement** : le HTML servi est identique d'une page à l'autre (`<div id="root"></div>`).
  Seuls le `canonical` et l'`og:url` changent selon le chemin. Le `<title>` (« Klork — Sauvegarde ton dressing et
  republie partout en 1 clic ») et la `meta description` sont les mêmes sur l'accueil, `/pricing`,
  `/guides/premiers-pas` et `/blog/ebay/vendre-sur-ebay-guide-complet` (curl avec l'agent GPTBot,
  2026-10-09). Il n'y a **aucun bloc JSON-LD** dans le HTML servi. WebFetch n'a vu que le titre de l'accueil.
  Un robot qui n'exécute pas JavaScript ne lit donc aucun guide.
- `robots.txt` : `Allow: /` pour tous ; `sitemap.xml` à jour (59 URL, guides et blog eBay) ; pas de
  `llms.txt` (404).
- Positionnement de contenu : mots « dressing », « anti-survente », « republier », « crosslisting », pages
  comparatives par outil et par paire de plateformes (« Vinted vs Leboncoin vs Vestiaire », « Vinted et
  Leboncoin en même temps », « Où vendre ses vêtements à part Vinted ? »).
- Une recherche web « Klork app Vinted dressing republier » (WebSearch, 2026-10-09) ne remonte aucune page
  de klork.app.

---

## 6. Écarts factuels avec FillSell (faits seulement, sans jugement)

Faits FillSell tirés de `docs/seo/etat-des-lieux/03-fiche-de-verite.md` (même date).

| Sujet | Klork (constaté ci-dessus) | FillSell (fiche de vérité) |
|---|---|---|
| Application mobile | Aucune app App Store / Google Play ; tableau de bord web installable ; publication depuis l'ordinateur | Apps iOS et Android publiées ; le téléphone pilote, l'extension exécute (F01, F02, F07) |
| Point de départ | L'annonce Vinted déjà rédigée (sauvegarde du dressing) | Photo de l'article (Lens) ou stock importé (F15, F33) |
| IA photo → annonce | Non ouverte au public (Studio fermé, d'après le code servi) ; « Description au choix (IA ou la tienne) » en Pro | Lens : objet, marque, état proposé, prix proposé à partir d'annonces comparables, titre et description (F15-F19) |
| Publication sur Vinted | Non annoncée (Vinted = source ; interrupteur par compte dans le code) | Publication sur Vinted, Leboncoin, eBay, Beebs (§ 10.1 de la fiche) |
| eBay | Formulaire ebay.fr rempli par l'extension | Compte relié par l'autorisation officielle d'eBay (OAuth) ; publication et retrait par l'API (F12, F44) |
| Retrait automatique après vente | Plan Business (35 €/mois) seulement ; manuel ou en lot en Gratuit et Pro | Annoncé « dans tous les forfaits » pour les copies liées par une preuve ; sinon question « Déjà vendu ? » (F44) |
| Détection des ventes | Vinted à la re-sauvegarde ; autres plateformes par scan des pages « Vendues » (quotidien à l'ouverture du tableau de bord) avec confirmation | Vente enregistrée sur preuve (dressing Vinted « sold », page lue, commande eBay par l'API) ; commandes Vinted et Leboncoin relues toutes les 10 min pour les payants (F42, F43) |
| Republication automatique | « Bientôt » (Autopilote, plan Entreprise à 69 €) | Par créneaux, plans Pro et Business (F39) |
| Plateformes de mode | Depop, Vestiaire, Whatnot, Grailed annoncés | Depop en bêta fermée (non annoncée) ; pas de Vestiaire, Whatnot ni Grailed (F54) |
| Prix annuel | Oui (« 2 mois offerts ») | Aucun (F58) |
| Notes publiques | CWS 5,0 (3 avis) ; pas de Trustpilot ; pas de store mobile | CWS 5,0 (1 avis) ; App Store 5,0 (3 notes) (§ 0, F01) |
| Utilisateurs CWS | 585 | 360 (§ 0) |

---

## 7. Ce qu'on ne peut pas vérifier sans compte

- Le fonctionnement réel de la sauvegarde depuis Leboncoin, eBay, Depop, Vestiaire, Opla et Beebs (C1).
- L'ouverture réelle de Whatnot, Beebs, Opla et Grailed à tous les comptes, et de la publication vers Vinted
  (interrupteurs par compte dans le code).
- Les pays Vinted réellement pris en charge, au-delà des 21 domaines du manifeste.
- Le délai réel de détection d'une vente et de retrait automatique, le taux d'échec, le comportement « même
  dashboard fermé » annoncé pour l'anti-survente (l'extension doit tourner dans un navigateur ouvert, d'après
  https://klork.app/status).
- L'accès au Studio (IA photo), son prix (« packs […] arrivent bientôt ») et la qualité des annonces produites.
- L'existence réelle de l'Autopilote et de Klork Cloud pour certains comptes (plan « Bientôt »).
- Les chiffres d'activité affichés (132 400 annonces, 121 470 publications, 8 820 doubles ventes évitées) et
  l'identité des auteurs des témoignages Discord.
- Le prix réellement payé par les comptes bêta (prix de lancement « gelé à vie »).
- La note Trustpilot : la page n'existe pas (404). L'absence de page sur fr.trustpilot.com n'a pas pu être
  confirmée par curl (403).

---

## 8. Sources (toutes lues le 2026-10-09)

| URL | Ce qui y a été lu |
|---|---|
| https://klork.app/ | Accueil rendu : promesse, 8 plateformes, démo, compteurs, tarifs résumés, FAQ, témoignages |
| https://klork.app/pricing | Paliers, prix mensuels et annuels, volumes |
| https://klork.app/help | Centre d'aide : téléphone, ventes, relist, crédits, parrainage, 2FA |
| https://klork.app/guides | Index des guides et tutos vidéo |
| https://klork.app/guides/premiers-pas | Parcours de départ |
| https://klork.app/guides/connecter-extension | Navigateurs, liaison, plusieurs ordinateurs |
| https://klork.app/guides/sauvegarder-dressing | Sauvegarde Vinted, sauvegarde automatique |
| https://klork.app/guides/vendu-et-maintenant | Détection des ventes, retrait par plateforme |
| https://klork.app/guides/relister | Relist manuel, crédits |
| https://klork.app/guides/publier-leboncoin | Publication Leboncoin, description IA de Leboncoin |
| https://klork.app/guides/publier-ebay | ebay.fr, offres automatiques |
| https://klork.app/guides/publier-depop | SKU, Promote |
| https://klork.app/guides/publier-vestiaire | Brouillon voulu, marges |
| https://klork.app/guides/reglages-marges | Marges, SKU, offres, notifications |
| https://klork.app/guides/brancher-ton-ia | Connecteur MCP (Pro) |
| https://klork.app/guides/sante-du-compte | Cadence, CAPTCHA, mode test, refus |
| https://klork.app/guides/republier-vinted-leboncoin-comparatif | Comparatif d'août 2026, contradiction C1 |
| https://klork.app/guides/outils-us-vendeur-francais | Positionnement France, vinted.fr |
| https://klork.app/guides/eviter-double-vente | Méthode anti-double vente |
| https://klork.app/securite | Ce que Klork fait et refuse |
| https://klork.app/status | Page d'état, dépendance à l'extension |
| https://klork.app/roadmap | Plan Entreprise « En cours » |
| https://klork.app/terms | Euros, Stripe, rétractation, parrainage, droit français |
| https://klork.app/privacy | Sous-traitants : Hetzner, Google Gemini (Studio), Stripe, Discord, Resend |
| https://klork.app/mentions-legales | Éditeur (micro-entreprise), hébergement |
| https://klork.app/sitemap.xml , /robots.txt , /site.webmanifest | 59 URL, Allow /, PWA |
| https://klork.app/assets/*.js | Code servi : paliers (`priceMonthly`, `referenceMonthly`), interrupteurs de plateformes, Studio, Autopilote |
| https://chromewebstore.google.com/detail/gcjfkpapmjmflgnadggedomnocfheagf | 585 utilisateurs, 5,0 (3 avis), v2.3.531, 8 oct. 2026, description |
| https://chromewebstore.google.com/detail/gcjfkpapmjmflgnadggedomnocfheagf/reviews | Texte et date des 3 avis |
| Paquet CRX public (clients2.google.com, id gcjfkpapmjmflgnadggedomnocfheagf) | `manifest.json` : domaines, permissions |
| https://itunes.apple.com/search?term=klork&country=fr&entity=software | 0 résultat |
| https://play.google.com/store/search?q=klork&c=apps&hl=fr&gl=FR | Aucune app Klork |
| https://www.trustpilot.com/review/klork.app | 404 |
| https://discord.com/api/v10/invites/s8Zabn9Frv?with_counts=true | ≈ 319 membres |
