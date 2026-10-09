# Fiche de faits — Beebs (marché France, 09/10/2026)

> Sert à écrire `/plateformes/beebs`, `/crosslisting/vinted-beebs`, `/crosslisting/leboncoin-beebs`,
> les pages EN jumelles et les guides du blog qui parlent de Beebs.
> Observé le **2026-10-09** (14:45–16:00, heure de Paris). Lecture seule : aucune connexion à un compte
> Beebs ni FillSell, aucun SQL, aucun commit. Rien n'a été écrit hors de ce fichier.

## 0. Méthode, et ce qui n'a pas pu être lu

| Source | Comment elle a été lue | Ce qu'elle vaut |
|---|---|---|
| **Centre d'aide officiel** `sos.beebs.app` (Zendesk, langue unique : `fr`) | API publique en lecture du centre d'aide : **122 articles**, corps complet, avec pour chacun la date de dernière modification du texte (`edited_at`) et la date de mise à jour de la page (`updated_at`) | **Officiel, en ligne le 09/10/2026.** Attention : plusieurs textes datent de 2023 même si la page affiche une mise à jour en 2026 (voir colonne « texte du ») |
| **CGU** `www.beebs.app/blog/cgu/` | Le site `www.beebs.app` renvoie **HTTP 403** à toute lecture automatique (WebFetch, 09/10). CGU lues dans la **Wayback Machine**, capture du **01/03/2026** : version « Dernière mise à jour le 29 janvier 2025 ». Le pied de page du site pointe désormais vers `/blog/fr/pages/cgu`, dont la seule capture (04/08/2026) est un 403 | **Officiel archivé.** La version en ligne le 09/10 n'a **pas** pu être lue |
| Accueil `www.beebs.app` | Wayback, capture du **13/09/2026** | Officiel archivé |
| Blog officiel (« Beebs ou Vinted », « Nouvelles catégories adultes », « Vendre sur l'appli Beebs by Kiabi ») | Wayback, captures du 17/03/2026, 01/03/2026, 10/12/2025 | Officiel archivé |
| Mentions légales, CGU Pro | Wayback, capture du 04/08/2026 | Officiel archivé |
| Fiches des stores | App Store : API publique iTunes (FR) ; Google Play : page publique | Officiel, lu le 09/10/2026 |
| Presse | Le Journal des Entreprises (24/05/2024), FashionUnited (juin 2024) | Presse datée |
| Forums (vint-aide.com) | Pages publiques | **Ressenti seulement, jamais un fait** |
| Constats internes FillSell | Mémoire du projet, glossaire, code de l'extension (lecture) | **Jamais publiables comme un fait sur Beebs** ; signalés « [interne] » |

Je n'ai **pas** ouvert l'application Beebs (il faut un compte) et je n'ai **pas** contourné le blocage du site
(consigne : jamais de requête répétée contre un anti-robot).

---

## 1. Ce qu'est Beebs

| Fait | Source (URL) | Date |
|---|---|---|
| Application de seconde main « pour toute la famille » : « Mode enfants, adultes, couches, déco, mobilier, jouets, livres, produits de soin… » | Accueil `https://www.beebs.app/` (capture `http://web.archive.org/web/20260913112035/https://www.beebs.app/`) | capture 13/09/2026 |
| Historiquement centrée sur l'enfant : « D'abord dédiée à l'enfance […], Beebs by Kiabi s'adresse désormais à toute la famille et s'invite dans les magasins Kiabi. » | Blog officiel « Beebs ou Vinted » `https://www.beebs.app/blog/beebs-ou-vinted/` | capture 17/03/2026 |
| Catégories adultes ouvertes en **février 2024** (« c'est comme ça que les catégories adultes sont arrivées ») | Blog officiel « Nouvelles catégories adultes » `https://www.beebs.app/blog/nouvelles-categories-adultes/` (publié 21/02/2024, modifié 30/07/2024) | capture 01/03/2026 |
| Nom de marque actuel dans l'aide et les règles : **« Beebs by Kiabi »** ; nom des fiches stores : « Vente en seconde main - Beebs » | `https://sos.beebs.app/hc/fr/articles/5843157506706` ; App Store `https://apps.apple.com/fr/app/vente-en-seconde-main-beebs/id1457130269` | lu 09/10/2026 |
| **Groupe Kiabi** : « Le rapprochement entre Beebs et Kiabi est officiel à partir d'aujourd'hui » (article d'aide créé le 23/05/2024) | `https://sos.beebs.app/hc/fr/articles/14119652364828-Beebs-rejoint-le-groupe-KIABI` | texte du 24/05/2024, lu 09/10/2026 |
| Rachat annoncé le 24/05/2024 ; Beebs était « en redressement judiciaire depuis le 13 mars 2024 » | Le Journal des Entreprises `https://www.lejournaldesentreprises.com/article/kiabi-rachete-beebs-une-plateforme-de-seconde-main-pour-enfants-2096557` | publié 24/05/2024 |
| Fondée en 2020 ; « Présente en France et en Belgique » | FashionUnited `https://fashionunited.fr/actualite/business/kiabi-acquisition-de-beebs-specialiste-de-la-vente-doccasion-pour-enfants/2024060735173` | juin 2024 (date déduite de l'URL) |
| Éditeur : **KWEB SAS**, 100 rue du Calvaire, 59510 Hem, RCS Lille Métropole 795 157 825 ; hébergement AWS | CGU (version 29/01/2025) ; mentions légales `https://www.beebs.app/blog/fr/pages/mentions-legales` | captures 01/03/2026 et 04/08/2026 |
| Pays : paiement et envoi intégrés « en France métropolitaine, en Belgique et en Corse » | CGU art. 2 et 6.1 (version 29/01/2025) | capture 01/03/2026 |
| Plateforme « accessible depuis le site www.beebs.app et sous forme d'application mobile » | CGU art. 1 | capture 01/03/2026 |
| Seconde main + **magasins Kiabi** : rachat de vêtements en magasin contre bon d'achat (« Mes Reventes », 10 à 30 articles par panier, sur rendez-vous) | `https://sos.beebs.app/hc/fr/articles/25690582682524-Le-Service-de-Revente-en-magasin` | texte du 11/08/2026 |
| Publicité dans l'app et sur le site (« nous avons fini par faire comme quasiment tous nos concurrents ») | `https://sos.beebs.app/hc/fr/articles/8330411866524` | lu 09/10/2026 |

## 2. Ce qui se vend, ce qui est interdit (règles du catalogue)

Source unique : **« Les règles du catalogue Beebs by Kiabi »**
`https://sos.beebs.app/hc/fr/articles/5843157506706-Les-r%C3%A8gles-du-catalogue-Beebs-by-Kiabi`
(texte modifié le **05/01/2026**, page mise à jour le 08/10/2026, lu le 09/10/2026). « Cette liste vaut comme
catalogue officiel » et renvoie à l'article 13.3 des CGU.

**Autorisé** (citations) :
- « Les vêtements, chaussures et accessoires pour les enfants de 0 à 16 ans. »
- « Les vêtements, chaussures et accessoires pour adultes pour les hommes et les femmes »
- Maternité (grossesse, allaitement) ; « Les jouets, livres, mobiliers et articles de puériculture pour les enfants de 0 à 16 ans »
- Hygiène, cosmétique et alimentation bébé **neufs**, DDM non dépassée
- « Les articles pour la maison : mobilier, accessoires de déco, textiles, literie, ustensile de cuisine, vaisselle et art de la table. »
- « Le petit électroménager pour la maison et cuisine »
- High-tech, consoles et multimédia « pour bébé, enfant et adolescent » ; loisirs et collection (jeux de société, puzzles, cartes à collectionner…)
- « les boosters Pokémon doivent être neufs et scellés » ; sièges auto **neufs** seulement ; tétines, biberons, anneaux de dentition neufs et scellés.

**Interdit** (extraits) : contrefaçons ; drop-shipping et articles de grossistes ; « Gros électroménager » ;
« Robots culinaires de la marque Thermomix » ; téléviseurs et audiovisuel ; « Smartphones (y compris iPhone),
appareils photo […] ordinateurs portables, PC gaming » ; « Consoles PlayStation 5 » ; « Articles des marques
Temu et Shein » ; « Articles de luxe des marques Louis Vuitton et Chanel » ; « Les sous-vêtements même neufs » ;
produits rappelés ; certains laits infantiles (liste nominative) ; tout objet à connotation religieuse.

⚠️ Une autre page d'aide, « Pourquoi mon annonce est-elle invisible ? » (texte du **07/12/2023**), liste encore
comme interdits « Les livres, CD, DVD et tout autre article multimédia pour adulte » et « Les produits high-tech
pour adulte » : les deux pages ne disent pas exactement la même chose. **Les règles du catalogue (2026) font foi.**

Autres chiffres de périmètre, qui divergent entre pages officielles : « plus de 700 catégories » (accueil,
capture 13/09/2026 ; App Store, 09/10/2026) contre « Plus de 500 catégories » (Google Play, 09/10/2026).
« PLUS DE 2000 MARQUES AU CATALOGUE » (App Store, 09/10/2026).

## 3. Frais

| Qui paie | Quoi | Source | Date |
|---|---|---|---|
| **Vendeur** | « La vente sur Beebs est 100 % gratuite pour le vendeur. Beebs ne demande aucun frais de mise en vente. Les acheteurs prennent en charge les frais de livraison et les frais de service et de protection. » | `https://sos.beebs.app/hc/fr/articles/360018272199-La-vente-sur-Beebs-est-elle-gratuite` | texte du 01/06/2023, lu 09/10/2026 |
| Vendeur | « Le dépôt des Articles sur le Catalogue du Site est gratuit. » ; « Pour celui ou celle qui vend, c'est gratuit. » | CGU art. 4.4 et encadré art. 8 (version 29/01/2025) | capture 01/03/2026 |
| **Acheteur** | Frais de service et protection : « **4% + 0,5 €** » | `https://sos.beebs.app/hc/fr/articles/360018452520` | texte du **25/06/2026**, page mise à jour 07/10/2026, lu 09/10/2026 |
| Acheteur | Notes de version App Store 26.10.06 (08/10/2026) : « OPÉRATION FRAIS RÉDUITS […] frais de service et de protection réduits sur TOUTES vos commandes […] **C'est un test** : si vous jouez le jeu et que les commandes s'envolent, on fera durer le plaisir ! » | `https://apps.apple.com/fr/app/vente-en-seconde-main-beebs/id1457130269` | lu 09/10/2026 |
| Acheteur | Livraison à la charge de l'acheteur ; montant affiché avant de finaliser | CGU art. 6.3 ; aide 360018272199 | — |
| Vendeur (option) | **Boost** d'une annonce : « à partir de 0,89€ » (4 jours) et « à partir de 1,19€ » (7 jours). ⚠️ Le même article dit plus haut « pendant 7 ou 14 jours » : durées contradictoires | `https://sos.beebs.app/hc/fr/articles/8233503910812` | texte du 04/03/2024 |
| Vendeur (option) | **Dressing à l'honneur** (dès 5 articles) : « 7 jours pour 5,99 € », « 14 jours pour 8,49 € » | `https://sos.beebs.app/hc/fr/articles/9021382166812` | texte du 12/09/2023 |
| Vendeur (option) | Virement **instantané** « à partir de 1€ » ; virement **classique sans frais**, 3 à 7 jours | `https://sos.beebs.app/hc/fr/articles/8478441862428` | texte du 01/06/2023 |
| Vendeur (option) | Abonnement « MaxiVentes » 4,99 €/mois (–20 % de frais de port dans le dressing, points doublés, sans pub) | `https://sos.beebs.app/hc/fr/articles/10831065287452` | texte du **10/11/2023** — **non revérifié**, ne pas citer |

Les chiffres de frais qui circulent ailleurs (« 5 % + 0,70 € », « 10 % + 0,70 € », « 15 à 20 % ») viennent de
sites tiers ou d'articles anciens : **seule l'aide officielle datée fait foi** (déjà noté dans `06-mots-cles-fr.md` § G3).

## 4. Paiement et argent du vendeur

| Fait | Source | Date du texte |
|---|---|---|
| Paiement par l'application, retenu chez **Mangopay SA** (« portefeuille électronique fonctionnant comme un compte séquestre ») jusqu'à la validation par l'acheteur | CGU art. 6.5 ; `https://sos.beebs.app/hc/fr/articles/360018840080` | 29/01/2025 ; 01/06/2023 |
| Moyens de paiement acheteur : carte, PayPal, Bancontact, paiement en 3 fois (Scalapay), porte-monnaie Beebs | Accueil (capture 13/09/2026) ; aides 7600957472668, 6975829404572, 5389715781650 | 2023–2026 |
| L'acheteur a « 48h à compter du retrait du colis en point relais » pour confirmer ; ensuite Beebs « finalise la commande automatiquement » et paie le vendeur **sur le porte-monnaie Beebs** | `https://sos.beebs.app/hc/fr/articles/360018840080` | 01/06/2023 |
| « Les virements ne sont pas automatiques » : le vendeur vire lui-même vers son compte (pièce d'identité et IBAN requis) | `https://sos.beebs.app/hc/fr/articles/4405248485010` ; `…/360018506319` | 10/11/2023 ; 26/09/2025 |
| Virement instantané : plafond 2 500 € par virement, un toutes les 24 h, zone SEPA | `https://sos.beebs.app/hc/fr/articles/8478441862428` | 01/06/2023 |
| Gains convertibles en **bons d'achat Kiabi +20 %** (1 à 15 € par conversion ; abondement plafonné à 100 € par an ; dans l'app seulement) | `https://sos.beebs.app/hc/fr/articles/20406939393948` | 28/05/2026 |
| **DAC7** : Beebs déclare aux impôts un particulier qui a réalisé « plus de 30 ventes » ou vendu « pour un montant supérieur ou égal à 2000€ » sur l'année civile ; « si vous achetez des articles dans le but de les revendre plus cher […] l'administration fiscale peut vous considérer comme professionnel » | `https://sos.beebs.app/hc/fr/articles/6218306941202` | 22/04/2024 (formulation de Beebs ; seuil légal à relire sur une source fiscale avant de l'écrire) |

## 5. Livraison et délais d'une vente

| Fait | Source | Date du texte |
|---|---|---|
| Transporteurs : **Mondial Relay, Shop2Shop by Chronopost, Relais Colis** (le vendeur peut en cocher un, plusieurs, ou la remise en main propre) ; **en Belgique, Mondial Relay seulement** | `https://sos.beebs.app/hc/fr/articles/6891981085468` ; `…/6906001000732` | 01/06/2023 ; 11/09/2024 |
| « 42 000 points relais » | Accueil (capture 13/09/2026) | — |
| Le vendeur renseigne le **poids** à la création de l'annonce | `https://sos.beebs.app/hc/fr/articles/360018902139` | 26/06/2026 |
| Remise en main propre pour les articles volumineux (poussettes trio, berceaux…) | `https://sos.beebs.app/hc/fr/articles/6891981085468` | 01/06/2023 |
| Après une commande : le vendeur a **48 h** pour valider en générant le bordereau, sinon la commande s'annule ; puis **6 jours** pour déposer le colis, sinon annulation et remboursement de l'acheteur | `https://sos.beebs.app/hc/fr/articles/360018452760` ; `…/360018395820` | 09/10/2025 ; 01/06/2023 |
| L'acheteur a **5 jours** pour retirer le colis, puis **48 h** pour valider ou ouvrir un litige | `https://sos.beebs.app/hc/fr/articles/360018452760` ; `…/360018502439` | 09/10/2025 ; 19/12/2025 |
| « Mode vacances » pour éviter que des ventes s'annulent pendant une absence | `https://sos.beebs.app/hc/fr/articles/4401916285842` | lu 09/10/2026 |

## 6. Modération et règles de publication

**Officiel :**
- « Nos outils modèrent automatiquement l'ensemble des annonces postées sur Beebs by Kiabi. […] Chaque annonce
  signalée par nos outils ou par un·e membre est vérifiée par nos équipes de modération. S'il s'avère que l'article
  n'est pas conforme, l'annonce sera retirée. » ; « En cas de non-respect répété de ces règles, le ou la membre
  risque un bannissement » — règles du catalogue (texte du 05/01/2026).
- Une annonce signalée est « rendue invisible sur Beebs le temps de l'examen » —
  `https://sos.beebs.app/hc/fr/articles/4449687851922` (texte du 07/12/2023).
- KWEB « utilise des logiciels et algorithmes automatisés afin de détecter et de supprimer immédiatement et sans
  préavis » un contenu illicite, contraire aux règles, **ou « ajouté ou publié par un·e Vendeureuse dans le cadre
  d'une activité commerciale professionnelle »** — CGU art. 4.7 (version 29/01/2025).
- Règles de publication (règles du catalogue § 5) :
  - « Il est interdit de référencer les mêmes articles plus d'une fois sur le Catalogue Beebs by Kiabi. »
  - « Toute annonce ou description de profil ne doit pas faire référence à des sites web externes, numéros de téléphone, etc... »
  - Photos : « La photo doit refléter la qualité réelle […]. **Aucune modification de la photo n'est autorisée.** » ;
    interdit d'utiliser des photos trouvées sur Internet ou d'un article similaire.
- « Une annonce doit contenir obligatoirement : Un titre, Une description, Une ou des photos. Le tout devant être
  cohérent. En cas de non cohérence, Beebs se réserve le droit de modérer l'annonce. » —
  `https://sos.beebs.app/hc/fr/articles/360018435159` (texte du 01/06/2023).
- « Il est strictement interdit de créer de fausses annonces ou de simuler des transactions » — CGU art. 4.1.
- CGU art. 4.6 : « Il doit supprimer l'Article du Catalogue en cas de vente sur KWEB, **via un autre canal**, en
  cas d'indisponibilité, ou s'il ne souhaite plus vendre l'Article. »
- **Délai de modération : aucun chiffre officiel** (122 articles d'aide lus, aucun délai de publication publié).

**Refus des titres contenant « TEST » : aucune source officielle.**
- [interne] Le 08/10/2026, une annonce Beebs de test intitulée « TEST FillSell ne pas acheter - … » (999 €) est
  restée « en vérification » environ 34 min puis n'a jamais été en ligne (mémoire du projet
  `beebs-test-moderation-0810`). C'est un constat sur UNE annonce, pas une règle de Beebs.
- Ce que l'officiel permet de dire : les fausses annonces sont interdites (CGU 4.1) et une annonce ne doit pas
  renvoyer vers un site externe (règles § 5). Rien de plus.
- [interne] Le glossaire de l'équipe (`docs/agents/glossaire.md`) parle d'un anti-robot « DataDome » sur Beebs ;
  observé ici seulement : HTTP 403 sur `www.beebs.app` pour nos lectures automatiques (09/10), et certaines
  captures Wayback en 403 depuis le 31/03/2026 (d'autres passent, ex. l'accueil le 13/09/2026). Non revérifié
  autrement.

**Vente depuis l'ordinateur — contradiction à connaître :**
- L'aide dit encore : « la mise en vente se fait uniquement depuis l'application, il n'est pas encore possible de
  vendre depuis le site Web » (`https://sos.beebs.app/hc/fr/articles/6808084881308`) et « Il n'est pas encore
  possible de mettre en vente un article, de modifier un article ou de supprimer un article sur le site web »
  (`…/7126994575644`). Ces deux textes datent de **juin 2023**.
- L'accueil capturé le 13/09/2026 montre un bouton « Vendre » dans l'en-tête.
- [interne] Le code de l'extension FillSell vise une page de création d'annonce du site
  (`www.beebs.app/fr/account/my-adverts/creating`) — constat de code, pas une source Beebs.
- **Non vérifié en direct** (site en 403). Ne rien écrire sur ce que le site de Beebs permet ou non.

## 7. « Importer son dressing Vinted » : y a-t-il une fonction officielle ?

**Il y en a eu une, documentée par Beebs en 2024 ; son existence aujourd'hui n'est pas vérifiée.**

| Fait | Source | Statut |
|---|---|---|
| « Sur Beebs, vous avez la possibilité d'importer vos annonces publiées sur d'autres applications vers votre dressing. » — bloc « **Synchro magique** » : « Import d'annonces illimité : les articles déjà importés auparavant seront automatiquement ignorés lors de la synchronisation (= 0 doublon) » ; « vous avez vendu des articles depuis la précédente synchronisation ? […] Ces articles seront identifiés et supprimés de votre dressing Beebs. » | Blog officiel « Nouvelles catégories adultes » `https://www.beebs.app/blog/nouvelles-categories-adultes/` (publié 21/02/2024, modifié 30/07/2024 ; capture `http://web.archive.org/web/20260301192436/https://www.beebs.app/blog/nouvelles-categories-adultes/`) | **Officiel, 2024.** Le texte **ne nomme pas Vinted** |
| Mode d'emploi officiel : récupérer le lien du dressing (« un bouton “Partager” […] Attention à ne pas confondre avec le lien de vos annonces »), puis « Ouvrir l'application Beebs > Mon Compte > Importer des annonces » | même page | Officiel, 2024 |
| Le centre d'aide officiel ne contient **aucun** article sur l'import, ni le mot « Vinted » (122 articles ; recherche « importer », « import », « vinted », « synchronisation » : 0 résultat pertinent) | API `https://sos.beebs.app/api/v2/help_center/fr/articles.json` | lu 09/10/2026 |
| Forum : import Vinted utilisé en oct.-nov. 2024 avec des défauts (« Sur les 1000, Beebs n'en garde que 800 », doublons à la resynchronisation, frais de port « automatiquement mis en format 1kg ») ; « C'est revenu » le 09/11/2024 | `https://www.vint-aide.com/t/concernant-beebs/736` | ressenti, 21/10–14/11/2024 |
| Forum : 07/10/2025, « on ne peut qu'importer celles de kiabi seconde main » ; 27/07/2026 : « la fonction n'est plus disponible depuis environ un an » | `https://www.vint-aide.com/t/beebs-importation-annonces-depuis-vinted/2009` | ressenti, non officiel |
| Script amateur non officiel `vinted2beebs` (GitHub) : remplit titre et prix seulement (ticket n° 7) | `https://github.com/ValentinGratz/vinted2beebs/issues/7` (relevé dans `06-mots-cles-fr.md` § G3) | non officiel |

**Ce qu'on peut écrire** : « Beebs a proposé en 2024 un import d'annonces depuis d'autres applications ; nous ne
savons pas s'il fonctionne encore aujourd'hui. » **Ce qu'on ne peut pas écrire** : que Beebs importe aujourd'hui
un dressing Vinted, ou que la fonction a été retirée (seuls des forums le disent).

## 8. Taille du public

**Chiffres revendiqués par Beebs** (toujours écrire « selon Beebs », avec la date) :

| Chiffre | Source | Date |
|---|---|---|
| « un marché de **plus de 2 millions de familles** » | Aide « Je suis vendeur professionnel… » `https://sos.beebs.app/hc/fr/articles/360021584719` | texte du 17/09/2026 |
| « **+ de 6 millions d'articles** en vente » ; « 42 000 points relais » ; « plus de 700 catégories » | Accueil (capture 13/09/2026) | 13/09/2026 |
| Android : **1 M+ téléchargements**, note **4,1** (33,4 k avis), éditeur affiché « Kiabi », mise à jour 6 oct. 2026 | `https://play.google.com/store/apps/details?id=com.beebs.mobile&hl=fr` | lu 09/10/2026 |
| iPhone : note **4,6** sur 5 (**43 175** notes), version 26.10.06 du 08/10/2026, vendeur affiché « Mobeex », langue FR | API iTunes, `https://apps.apple.com/fr/app/vente-en-seconde-main-beebs/id1457130269` | lu 09/10/2026 |
| Au rachat : « plus de 2 millions d'utilisateurs de son application mobile », « 5 millions de produits à la vente », « 690 000 articles pour enfant » vendus en 2023 | Le Journal des Entreprises (citant Beebs), 24/05/2024 | 2024, périmé pour un texte daté 2026 |

**Aucune mesure indépendante** (Médiamétrie, panel, rapport annuel Kiabi) trouvée pour 2025 ou 2026.
Le communiqué Kiabi cité par la presse en 2024 présentait Beebs comme « le numéro 1 de la vente pour enfant en
France et en Belgique » : **revendication**, jamais à reprendre comme un fait.

## 9. CGU : outils automatisés, comptes, revente

Version lue : **« Dernière mise à jour le 29 janvier 2025 »** (capture Wayback du 01/03/2026,
`http://web.archive.org/web/20260301192446/https://www.beebs.app/blog/cgu/`). Version en ligne le 09/10/2026 : **non lue** (403).

- **Outils automatisés tiers : aucune clause explicite** dans cette version (recherche de « robot »,
  « automatis », « script », « logiciel », « extraction », « aspir », « outil » : seuls ressortent les outils de
  modération de Beebs lui-même, art. 4.7 et 10). Les CGU Pro (capture 04/08/2026) n'en contiennent pas non plus.
  Ni autorisation, ni interdiction écrite.
- Clauses voisines, à connaître :
  - 12.1 : s'engager « à ne pas copier les informations figurant sur le Site et mises en ligne par KWEB ou un·e
    autre Utilisateurice du Site, ni à en faire un usage illicite » ; « à s'inscrire sur le Site une seule fois, à ne
    pas créer plus d'un Compte ».
  - 12.3 : ne pas « recueillir, cumuler, transmettre à des tiers » des données des utilisateurs ou des transactions.
  - 12.5 : « garder confidentiel son identifiant et son mot de passe à l'égard des tiers, sauf pour les personnes
    qui ont été autorisées par l'Utilisateurice à utiliser son identifiant ».
  - 13.1 : blocage possible notamment si l'utilisateur « se connecte à partir de la même adresse IP ou du même
    ordinateur que celle ou celui qui a été bloqué(e) », ou après « au moins trois avertissements ».
- **Revente par un particulier** — le point le plus sensible pour un public de revendeurs :
  - CGU 12.7 : le particulier déclare utiliser les services « afin de satisfaire ses besoins personnels, non liés
    à une activité professionnelle ».
  - Règles du catalogue § 4 « Activités commerciales du particulier » : « Nous n'autorisons pas les membres
    particuliers à mettre en ligne des articles destinés à être vendus à des fins commerciales », critères cités
    notamment : « articles achetés dans le but de la revente et non pour un usage propre », « Vos ventes sont
    destinées à générer une source régulière de revenus », « Vos annonces comportent des images provenant
    d'Internet ou de banques d'images ».
  - Les professionnels (« dépôts-vente, vide-dressing, revendeurs professionnels, reconditionneurs ») sont
    « les bienvenus » sous le **statut Pro** (badge « pro », inscription sur demande ; neuf accepté sous
    conditions, grossistes et drop-shipping interdits) — `https://sos.beebs.app/hc/fr/articles/360021584719`
    (texte du 17/09/2026). Les conditions financières du statut Pro ne sont **pas** publiées dans l'aide.

## 10. FillSell et Beebs — tiré UNIQUEMENT de la fiche de vérité

Source : `docs/seo/etat-des-lieux/03-fiche-de-verite.md` (lignes « corrigé par contre-vérification » comprises).
Rien d'autre.

### 10.1 Ce que FillSell fait sur Beebs

| Fonction | Sur Beebs | Réf. |
|---|---|---|
| Publication d'une annonce | Oui, à l'unité ; Beebs est l'une des quatre plateformes ouvertes à tous (Vinted, Leboncoin, eBay, Beebs) | F24 |
| Annonce adaptée | Catégorie, taille, couleur, colis adaptés ; un rayon introuvable devient une question, jamais une plateforme grisée | F25 |
| Rédaction par Lens | Depuis l'app, le scan rédige aussi l'annonce Beebs | F15 |
| Publication en lot | Jusqu'à 20 articles, Beebs compris, dans la limite du forfait | F26 |
| Import (« Synchroniser ») | Les annonces Beebs déjà en ligne entrent dans le stock, sur appui, gratuit et sans limite | F33 |
| Une fiche par article | Une annonce Beebs et une annonce Vinted du même article deviennent une seule fiche (photos ET titre ; doute → question) | F35 |
| Republication | Retirer puis redéposer, sur Beebs comme sur Vinted et Leboncoin ; passe par un réglage serveur, ouvert **en fait** (republications Beebs des 06 et 08/10), non relu en base | F37 |
| Republication automatique | Pro et Business ; Beebs « prévue », ouverte par un réglage serveur **non relu en base** | F39 (partiel), C12 |
| Repérage des ventes | Par l'extension ; sur Beebs, l'annonce ne se lit jamais « vendue », seulement « plus en ligne » | F42 |
| Enregistrement de la vente | **Pas tout seul** : la lecture « plus en ligne » est un signal, la vente attend l'appui de la personne | F43 |
| Retrait des autres annonces | Après la confirmation de la vente Beebs ; copies prouvées retirées, les autres → « Déjà vendu ? » ; retraits Beebs par l'extension | F44, C24 |
| E-mail de vente | **Aucun** pour une vente Beebs (confirmée à la main) | F45 |
| Échec de modération | Un dépôt jamais vu en ligne compte comme un échec (refus de modération), pas comme une vente | F29 |

### 10.2 Comment : l'extension, dans la session de la personne (pas d'API)

- Beebs passe **par l'extension Chrome**, comme Vinted et Leboncoin ; seul eBay a une voie par l'API officielle
  (F31). La fiche ne mentionne aucune API Beebs.
- La personne se connecte elle-même à Beebs dans son navigateur ; l'extension agit dans cette session ; FillSell
  ne lit ni ne stocke le mot de passe Beebs (F11). **Ne rien écrire sur les cookies** (F11, C22).
- L'extension remplit le formulaire, une annonce après l'autre, 8 à 20 s entre deux (F07, F28), dans une fenêtre
  réduite (F08).
- Ordinateur allumé, Chrome ouvert, extension active, session Beebs ouverte (F09). Ordinateur éteint : les
  actions attendent ; un dépôt en attente plus de 10 jours passe en échec (« Relancer ») ; toute republication est
  refusée si l'extension n'a pas été vue depuis 7 jours (F10).

### 10.3 Ce qui demande un geste de la personne

1. Se connecter à Beebs dans Chrome sur l'ordinateur, et installer l'extension (F05, F09, F11).
2. Appuyer sur « Synchroniser » pour faire entrer ses annonces Beebs dans le stock (F33).
3. Répondre aux questions : champ manquant, rayon Beebs introuvable (F24, F25).
4. Trancher « Annonces à vérifier » / « Est-ce le même article ? » (F35).
5. **Confirmer une vente Beebs** (« Vendue sur Beebs ? ») — c'est elle qui déclenche les retraits ailleurs (F43, F44).
6. Répondre « Déjà vendu ? » pour une copie non prouvée (F44).
7. « Relancer » un dépôt passé en échec (F10).
8. La fiche de vérité ne dit nulle part que FillSell génère le bordereau ou gère l'envoi : l'expédition se fait
   dans Beebs (48 h pour valider, 6 jours pour déposer — § 5 ci-dessus).

### 10.4 Limites à dire

- Pas d'ordinateur allumé, rien ne part (F09) ; pas de Cloud (F56).
- La modération de Beebs peut retarder l'apparition d'une annonce (F29).
- Republier efface vues et favoris, et n'a lieu qu'une fois par 24 h pour une même annonce (F37).
- La vente Beebs se confirme d'un appui ; pas d'e-mail ; aucun délai de détection publiable (F42, F43, F45).
  Détails internes à **ne pas publier** : relecture d'une annonce au plus toutes les 2 h, après 2 h de grâce
  (dépôt) ou 12 h (republication), deux lectures pour conclure « plus en ligne » (F42).
- Trajet Vinted → Beebs : un article importé qu'on publie sur une nouvelle plateforme passe par une rédaction IA
  et **compte une annonce** du forfait ; le Gratuit en a 5 par mois (F27, F58).

### 10.5 Formulations sûres, reprises de la fiche (tutoiement, pages produit)

- « Tu remplis ton annonce une fois ; FillSell la publie sur les plateformes que tu coches : Vinted, Leboncoin, eBay et Beebs. S'il manque une information, l'app te la demande. » (F24)
- « Chaque plateforme reçoit une annonce adaptée à ses rubriques : catégorie, taille, couleur, colis. » (F25)
- « FillSell ne te demande jamais tes mots de passe Vinted, Leboncoin ou Beebs : tu restes connecté(e) à tes comptes dans ton navigateur, comme d'habitude, et l'extension travaille dans ces sessions. » (F11)
- « Leboncoin et Beebs vérifient les nouvelles annonces : elles peuvent mettre un moment à apparaître. » (F29)
- « Un appui sur « Synchroniser » relit tes annonces déjà en ligne sur Vinted, Leboncoin, eBay et Beebs et les range dans ton stock. Gratuit et sans limite. » (F33)
- « Republier, c'est retirer l'annonce puis la remettre en ligne : elle repart en haut des résultats, mais ses vues et ses favoris repartent de zéro. » (F37)
- « Quand Vinted ou eBay marque ton article vendu, FillSell enregistre la vente tout seul. Sur Leboncoin et Beebs, il te demande de confirmer d'un appui. » (F43)
- « Dès qu'une vente est enregistrée, FillSell retire les autres annonces de l'article. S'il n'est pas certain qu'une annonce est le même article, il te demande « Déjà vendu ? » avant d'y toucher. » (F44)
- « Pour que tes annonces partent, ton ordinateur doit être allumé avec Chrome ouvert. » (F09)

Versions anglaises : colonne « Formulation EN » des mêmes lignes de la fiche.

## 11. Dix faits citables (Beebs, pour un revendeur)

1. **Vendre est gratuit** : « Beebs ne demande aucun frais de mise en vente » ; l'acheteur paie la livraison et les frais de service et de protection. — `https://sos.beebs.app/hc/fr/articles/360018272199` (lu 09/10/2026)
2. **Frais acheteur : 4 % + 0,50 €** par commande, selon l'aide officielle (texte du 25/06/2026), présentés comme des « frais réduits » en test dans les notes App Store du 08/10/2026 — toujours dater ce chiffre. — `https://sos.beebs.app/hc/fr/articles/360018452520`
3. **48 h pour valider, 6 jours pour déposer** : après une commande, le vendeur génère le bordereau sous 48 h (sinon annulation), puis dépose le colis sous 6 jours. — `https://sos.beebs.app/hc/fr/articles/360018452760`
4. **Payé à la validation** : l'argent arrive dans le porte-monnaie Beebs quand l'acheteur valide (48 h après le retrait du colis) ; virement classique gratuit (3 à 7 jours), instantané à partir de 1 €. — `https://sos.beebs.app/hc/fr/articles/360018840080`, `…/8478441862428`
5. **Trois transporteurs** : Mondial Relay, Shop2Shop by Chronopost, Relais Colis ; en Belgique, Mondial Relay seulement. — `https://sos.beebs.app/hc/fr/articles/6891981085468`
6. **France et Belgique** : paiement et envoi intégrés en France métropolitaine, en Corse et en Belgique. — CGU art. 2 (version 29/01/2025)
7. **Plus seulement l'enfant** : vêtements adultes hommes et femmes, maison et petit électroménager sont autorisés, à côté de l'enfant (0-16 ans), de la maternité et de la puériculture. — règles du catalogue (texte du 05/01/2026)
8. **Un article, une annonce** : Beebs interdit de référencer le même article plus d'une fois, et ses CGU demandent de retirer l'annonce d'un article vendu « via un autre canal ». — règles du catalogue § 5 ; CGU art. 4.6
9. **Revendeur = statut Pro** : Beebs n'autorise pas un particulier à vendre « à des fins commerciales » (achat pour revendre, revenus réguliers) ; les revendeurs professionnels sont accueillis sous le statut Pro. — règles du catalogue § 4 ; `https://sos.beebs.app/hc/fr/articles/360021584719`
10. **Groupe Kiabi depuis mai 2024** : les gains peuvent devenir des bons d'achat Kiabi avec 20 % de bonus (100 € d'abondement par an au plus). — `https://sos.beebs.app/hc/fr/articles/14119652364828`, `…/20406939393948`

En réserve : DAC7 (« plus de 30 ventes » ou ≥ 2 000 € par an, § 4) ; « plus de 2 millions de familles » selon
Beebs (§ 8) ; photos non retouchées exigées (§ 6) ; vente intelligente (baisse automatique de 10 % par étape,
jamais plus de 50 % — `https://sos.beebs.app/hc/fr/articles/4415808676626`).

## 12. Pièges : ce qu'il ne faut PAS affirmer

**Sur Beebs**
- « Beebs, c'est seulement pour les enfants » / « le Vinted des enfants » : faux depuis février 2024 (adultes, maison) ; l'étiquette vient de la presse.
- « Beebs prend une commission au vendeur » : faux ; c'est l'acheteur qui paie.
- Un chiffre de frais sans date ni source (« 5 % + 0,70 € », « 10 % ») : sources tierces périmées ; le 4 % + 0,50 € est lui-même présenté comme un test.
- « Beebs importe ton dressing Vinted » (au présent) : non vérifié ; la seule source officielle date de 2024 et ne nomme pas Vinted ; des forums disent la fonction disparue.
- « Beebs a retiré l'import Vinted » : seuls des forums le disent.
- « Beebs autorise les outils comme FillSell » ou « Beebs les interdit » : la version des CGU lue (29/01/2025) n'en dit rien, la version en ligne n'a pas été lue. Ne rien affirmer ; décrire ce que fait FillSell (dans ta session, une annonce à la fois).
- « Sur Beebs on ne vend que depuis l'app » / « Beebs n'a pas de site » : l'aide (texte de 2023) et le site se contredisent ; non vérifié en direct.
- « Annonce en ligne immédiatement » ; tout délai de modération chiffré : aucun chiffre officiel.
- « Beebs refuse les titres avec TEST » : constat interne sur une annonce, pas une règle publiée.
- « Beebs dans toute l'Europe » : France (métropole, Corse) et Belgique.
- « 2 millions d'utilisateurs », « 6 millions d'articles », « n° 1 » sans « selon Beebs » et sans date.
- Redressement judiciaire de 2024 : ne pas le mentionner (ni dénigrement, ni statut actuel connu).
- Durée d'un Boost (4/7 jours ou 7/14 jours) et abonnements MaxiVentes : textes contradictoires ou de 2023.

**Sur FillSell et Beebs** (fiche de vérité)
- « FillSell enregistre tes ventes Beebs tout seul » (F43) ; « tu reçois un e-mail à chaque vente Beebs » (F45) ; « un e-mail à chaque vente » est banni (§ 15).
- « Retrait automatique partout » / « le retrait attend toujours ta confirmation » : il faut distinguer — sur Beebs, la vente se confirme d'un appui, puis les copies prouvées sont retirées (F44, C01, C24).
- « Republication automatique sur Beebs » sans relire `republish_planifiee_pf_*` en base (F39 partiel, C12, § 14).
- « FillSell détecte une vente Beebs en X minutes / en temps réel » (F42).
- « Fonctionne ordinateur éteint » (F09, F56) ; « API Beebs » ; « partenaire officiel de Beebs » ou « de Kiabi » (§ 15).
- « Publié sur Beebs et Vinted en même temps » (C23) : une annonce après l'autre.
- Conseiller la **retouche IA** pour des photos Beebs (« qualité studio », F21) : les règles de Beebs disent « Aucune modification de la photo n'est autorisée ». Au minimum ne pas la recommander pour Beebs ; à trancher par Nico.
- Suggérer de dupliquer un article sur Beebs pour plus de visibilité, ou d'ajouter un lien vers une autre boutique dans l'annonce : interdit par les règles § 5.
- Encourager un particulier à « acheter pour revendre sur Beebs » : contraire aux règles § 4 ; parler du statut Pro de Beebs quand la page vise des revendeurs.
- « FillSell génère ton bordereau Beebs » : absent de la fiche.
- « FillSell sur Beebs Belgique » : la fiche ne dit rien du pays.
- Logo Beebs / Beebs by Kiabi : aucune autorisation connue ; nom en texte et mention « FillSell n'est affilié à aucune de ces plateformes » (règle du PLAN pour Vinted et eBay, prudence étendue à Beebs — à confirmer par Nico).
- Annonce de test : jamais « TEST » dans un titre Beebs, jamais d'exemple réel ; 999 € et accord explicite de Nico (mémoire `annonces-de-test-999-euros`).

## 13. Non vérifié, à relire avant publication

- CGU **en ligne** le 09/10/2026 (`/blog/fr/pages/cgu`) : non lisible (403) ; dernière version lue = 29/01/2025.
- Existence actuelle de l'import « Importer des annonces » dans l'app Beebs (pas d'accès à l'app).
- Possibilité de déposer une annonce depuis le site `beebs.app` (aide contre accueil ; site en 403).
- Durée du « test » de frais acheteur réduits (App Store, 08/10/2026) et formule d'avant.
- Délais de modération ; motifs de refus non écrits.
- Mesure d'audience indépendante (aucune trouvée) ; nombre d'utilisateurs actifs.
- Conditions financières du statut Beebs Pro.
- Côté FillSell : `republication_multi_ouverte`, `republish_planifiee_pf_beebs` et autres valeurs de `coin_config` (fiche § 14).

## 14. Sources (toutes consultées le 09/10/2026)

Officiel, en ligne :
- Liste et corps des 122 articles d'aide : `https://sos.beebs.app/api/v2/help_center/fr/articles.json?per_page=100&page=1` et `&page=2`
- Articles cités : `https://sos.beebs.app/hc/fr/articles/` + `360018272199`, `360018452520`, `5843157506706`, `4449687851922`, `360018435159`, `6808084881308`, `7126994575644`, `360021584719`, `8233503910812`, `9021382166812`, `8478441862428`, `8477319959196`, `360018840080`, `4405248485010`, `360018506319`, `20406939393948`, `6218306941202`, `360018902139`, `6891981085468`, `6906001000732`, `360018452760`, `360018395820`, `360018502439`, `4401916285842`, `4415808676626`, `14119652364828`, `25690582682524`, `8330411866524`, `10831065287452`
- App Store : `https://apps.apple.com/fr/app/vente-en-seconde-main-beebs/id1457130269` (via `https://itunes.apple.com/search?term=beebs&country=fr&entity=software`)
- Google Play : `https://play.google.com/store/apps/details?id=com.beebs.mobile&hl=fr`

Officiel, archivé (Wayback Machine) :
- CGU v. 29/01/2025 : `http://web.archive.org/web/20260301192446/https://www.beebs.app/blog/cgu/`
- Accueil : `http://web.archive.org/web/20260913112035/https://www.beebs.app/`
- « Beebs ou Vinted » : `http://web.archive.org/web/20260317090634/https://www.beebs.app/blog/beebs-ou-vinted/`
- « Nouvelles catégories adultes » : `http://web.archive.org/web/20260301192436/https://www.beebs.app/blog/nouvelles-categories-adultes/`
- « Vendre sur l'appli Beebs by Kiabi » : `http://web.archive.org/web/20251210122947/https://www.beebs.app/blog/vendre-sur-beebs-by-kiabi/`
- Mentions légales : `http://web.archive.org/web/20260804163730/https://www.beebs.app/blog/fr/pages/mentions-legales`
- CGU Pro : `http://web.archive.org/web/20260804163730/https://www.beebs.app/blog/fr/pages/cgu-pro`

Presse :
- `https://www.lejournaldesentreprises.com/article/kiabi-rachete-beebs-une-plateforme-de-seconde-main-pour-enfants-2096557` (24/05/2024)
- `https://fashionunited.fr/actualite/business/kiabi-acquisition-de-beebs-specialiste-de-la-vente-doccasion-pour-enfants/2024060735173` (juin 2024)

Forums (ressenti seulement) :
- `https://www.vint-aide.com/t/concernant-beebs/736`
- `https://www.vint-aide.com/t/beebs-importation-annonces-depuis-vinted/2009`
- `https://www.vint-aide.com/t/importer-dressing-sur-beebs/789`

Internes : `docs/seo/etat-des-lieux/03-fiche-de-verite.md`, `03b-contre-verification.md`, `06-mots-cles-fr.md` § G3,
`docs/seo/concurrents/flowdino.md` (seul autre outil vu qui annonce Beebs), `docs/agents/glossaire.md`,
mémoire `beebs-test-moderation-0810`.
