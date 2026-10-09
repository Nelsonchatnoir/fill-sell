# Fiche de faits — Vinted (marché France, 09/10/2026)

> Sert à écrire `/plateformes/vinted` et `/en/platforms/vinted`, les trajets qui passent par Vinted
> (`/crosslisting/vinted-beebs`, `/crosslisting/vinted-ebay`, `/crosslisting/vinted-leboncoin` et
> l'article `/blog/cross-listing-vinted-leboncoin`), `/fonctions/republication`,
> `/fonctions/ventes-et-retraits`, `/securite-des-comptes` et les articles `republier-annonces-vinted`,
> `rediger-une-annonce-qui-vend`, `comment-calculer-profits-vinted` (`PLAN.md` § 3).
> Observé le **2026-10-09, entre 15:30 et 16:00 (heure de Paris)**. Lecture seule : aucune connexion
> à un compte (Vinted, FillSell ou autre), aucun SQL, aucun commit, aucune action publique.

## 0. Méthode et limites (à lire avant de citer quoi que ce soit)

| Source | Lue ? | Remarque |
|---|---|---|
| Conditions générales `https://www.vinted.fr/terms-and-conditions` (« Nouvelle version applicable à partir du 05/10/2026 ») | **oui**, texte intégral | Page servie en HTML complet à une simple requête, sans connexion. Le lien du pied de page (`/terms_and_conditions`) affiche le même texte mais le charge par une interface qui exige une session : **non utilisée** (réponse 401, aucun contournement). |
| Version précédente `https://www.vinted.fr/old-terms-and-conditions` (« applicable à partir du 08-09-2025 ») et page `https://www.vinted.fr/terms-and-conditions-updates` | **oui** | Sert à dater ce qui a changé le 05/10/2026. |
| CGU en anglais, Irlande `https://www.vinted.ie/terms-and-conditions` (même version du 05-10-2026) | **oui** | Pour les citations des pages `/en/` (anglais UE). |
| Liste des tarifs `https://www.vinted.fr/pricelist` (« Dernière mise à jour : [05/10/2026] ») | **oui** | |
| Règles du catalogue `https://www.vinted.fr/catalog-rules` | **oui** | Aucune date de version affichée dans le texte relu. |
| « Notre plateforme » (guide d'utilisation) `https://www.vinted.fr/our-platform`, Guide Vinted Pro `https://www.vinted.fr/pro-guide` | **oui** | |
| Centre d'aide `https://www.vinted.fr/help/<numéro>` | **oui**, ~140 articles (titres), ~35 lus en entier | Les articles sont servis en HTML ; aucun n'affiche de date de mise à jour. Les pages d'index du centre d'aide, elles, ne s'affichent pas sans JavaScript. |
| `https://www.vintedgo.com/fr` | **oui** | Site officiel de Vinted Go. |
| `vinted.co.uk/pro/integrations`, `vinted.fr/pro/integrations` (API pour vendeurs Pro, citée par les moteurs) | **non** | **HTTP 404** le 09/10. |
| Presse (résultats 2025 publiés le 09/04/2026) | oui, ponctuellement | Datée, citée comme telle. |
| Blogs d'éditeurs d'outils (Crosslist, List Perfectly, Redrip, Cassou, Fripio, Friptadium…), forums (vint-aide) | lus | **Jamais une preuve d'un fait sur Vinted.** Signalés pour dater un ressenti ou la position d'un concurrent. |

**Étiquettes** : **[OFF]** page officielle Vinted lue le 09/10 · **[PRESSE]** article daté ·
**[ÉDITEUR]** blog d'un éditeur d'outil (intérêt commercial) · **[FORUM]** témoignage, illustration
seulement · **[FV]** fiche de vérité FillSell (`etat-des-lieux/03-fiche-de-verite.md`, corrections de
contre-vérification comprises).

**Vocabulaire officiel au 09/10/2026** (à respecter dans nos textes) :
- « **Frais Vinted** » (les CGU du 05/10/2026 ne parlent plus de « Protection acheteurs » ; l'article
  d'aide garde l'adresse `…/help/342-buyer-protection-fee-on-vinted`). Les internautes tapent encore
  « frais de protection acheteur ».
- « **Boost** » / « Booster » (interface : `Booster l'article`, accroche : « Fais remonter ton article
  dans les résultats de recherche. »). Les internautes tapent « remonter annonce vinted ».
- « **Vitrine** » : « Vitrine (anciennement Dressing en vitrine) » [OFF, help/452].
- Société : « Vinted, UAB », Vilnius (Lituanie) ; transport : « Vinted Go UAB ».

---

## 1. La plateforme en bref

| Fait | Étiquette | Source (lue le 09/10/2026) |
|---|---|---|
| Éditeur : « Vinted, UAB », Svitrigailos str. 13, 03228 Vilnius, Lituanie, numéro de société 302767152. | [OFF] | https://www.vinted.fr/terms-and-conditions § 1 |
| Vinted se présente comme hébergeur : « nous n'achetons pas et nous ne vendons pas les Articles du Catalogue et nous ne sommes partie à aucune Transaction ». | [OFF] | CGU § 1 |
| Particuliers : comptes « uniquement à des fins personnelles et non à des fins professionnelles (sauf si vous êtes un Vendeur Pro) ». | [OFF] | CGU § 1 |
| Audience UE déclarée au titre du DSA : « 31 millions » de destinataires actifs mensuels moyens « en date du 31/07/2026 », sur la France, les Pays-Bas, la Belgique, le Luxembourg, l'Espagne, l'Italie, le Portugal, l'Irlande, l'Autriche et l'Allemagne. Vinted précise que ce chiffre « peut différer considérablement des mesures d'audience signalées dans d'autres contextes ». | [OFF] | https://www.vinted.fr/our-platform § 2 |
| Résultats 2025 du groupe (publiés le 09/04/2026) : chiffre d'affaires ≈ 1,1 Md€ (+38 %), volume d'affaires 10,8 Md€ (+47 %), bénéfice net 62 M€ (−19 %). | [PRESSE] | https://tech.eu/2026/04/09/vinted-s-revenues-top-1bn-but-profits-slide/ ; https://fashionunited.fr/actualite/business/vinted-atteint-1-1-milliard-deuros-de-chiffre-daffaires-en-2025-et-assume-une-baisse-strategique-de-ses-benefices/2026040941303 |
| **Nombre de membres en France : aucun chiffre officiel récent trouvé.** Les « 23 millions » qui circulent viennent de blogs (fin 2024) — ne pas citer. | — | — |

## 2. Frais

### 2.1 Vendeur particulier : vendre est gratuit [OFF]

- « La vente sur Vinted est gratuite, et nous essayons de la rendre aussi simple que possible. Des
  services payants optionnels sont disponibles pour améliorer votre expérience de vente, mais ils ne
  sont pas obligatoires. » — https://www.vinted.fr/our-platform § 5
- « Vinted n'applique aucun frais de vente, et tu peux mettre en vente autant d'articles que tu le
  souhaites. » — https://www.vinted.fr/help/26
- Frais de port : « Ils sont toujours à la charge de l'acheteur. » — https://www.vinted.fr/help/753
- Paiement du vendeur particulier : une fois la transaction finalisée, « Tu reçois alors ton paiement
  dans un délai de 2 jours » ; virement bancaire : « jusqu'à 5 jours ouvrés » — https://www.vinted.fr/help/26
- Porte-monnaie : à créer « dans les 5 jours calendaires qui suivent votre première vente », sinon la
  transaction est annulée — CGU § 8.

### 2.2 Acheteur : les « Frais Vinted » [OFF]

- Définition (CGU § 15) : « Les Frais Vinted sont des frais de plateforme obligatoires que les
  acheteurs paient lorsqu'ils passent une commande sur Vinted. »
- Montant (liste des tarifs, mise à jour du 05/10/2026, et help/342) : « Les frais comprennent
  généralement un pourcentage du prix de l'article ou du lot, ainsi que des frais fixes, généralement
  de 5 % + 0,70 € . » ; ils varient selon « les caractéristiques de l'article », « le montant de la
  commande », « le type de commande (article unique ou lot) » ; affichés « TVA » comprise.
  — https://www.vinted.fr/pricelist ; https://www.vinted.fr/help/342
- **Changement du 05/10/2026** : les CGU du 08-09-2025 parlaient de « Protection acheteurs, qui
  s'applique moyennant des frais à chaque Transaction » ; celles du 05/10/2026 parlent de « Frais
  Vinted ». La politique de remboursement (article perdu, endommagé, non conforme) reste décrite
  séparément (CGU § 11, help/465) et ne vaut que pour les achats auprès de particuliers.
  — https://www.vinted.fr/old-terms-and-conditions § 1 ; https://www.vinted.fr/terms-and-conditions § 11, § 15
- Services en option de l'acheteur : Vérification de l'article « 10 euros », Vérification du matériel
  électronique « 5 euros » par article. — https://www.vinted.fr/pricelist § 1
- Conversion de devises : « 1,2 % ou 3 % du prix de l'Article ». — CGU § 9

### 2.3 Vendeur Pro [OFF]

- « Vous pouvez mettre en vente autant d'articles que vous le souhaitez, gratuitement. »
  — https://www.vinted.fr/pro-guide
- Boost et Vitrine sont ouverts aux « vendeurs et les vendeurs Pro » (liste des tarifs § 2).
- Paiement du vendeur Pro : l'acheteur « dispose de 14 jours calendaires pour signaler tout problème
  ou décider de retourner l'article » ; le paiement arrive « à l'issue de ces 14 jours ».
  — https://www.vinted.fr/help/918

## 3. Particulier ou Vinted Pro (point capital pour les « revendeurs ») [OFF]

| Fait | Source |
|---|---|
| Règles du catalogue, § 4 : « Les comptes Vinted standards sont réservés à un usage privé et non commercial. En tant que vendeur particulier, tu ne peux pas utiliser Vinted pour mettre en vente des articles spécifiquement achetés ou acquis en vue de les revendre, pour générer un revenu régulier grâce à la revente ou pour exercer une activité de revente (même si tu possèdes une entreprise légalement enregistrée). » | https://www.vinted.fr/catalog-rules |
| « Les vendeurs Pro peuvent mettre en ligne et vendre un nombre illimité d'articles de seconde main. Si tu prévois d'utiliser Vinted en tant que vendeur professionnel, tu dois ouvrir un compte Vinted Pro . » | idem |
| Aide « Ventes commerciales » : les comptes standards ne peuvent pas vendre à titre professionnel ; « Cela inclut la revente comme source de revenus complémentaire, en achetant ou en se procurant des articles spécifiquement dans un but lucratif. » Interdit à tous, Pro compris : le « Nouveau stock commercial » (grossistes, commandes en gros, articles achetés en magasin pour les revendre). | https://www.vinted.fr/help/1120 |
| Guide Pro : « Tout professionnel doit se déclarer en tant que « vendeur Pro » sur Vinted. » ; Vinted peut bloquer l'accès d'un vendeur qui remplit les critères sans s'inscrire en Pro. | https://www.vinted.fr/pro-guide |
| Pays de Vinted Pro (guide Pro) : France, Pays-Bas, Belgique, Luxembourg, Italie, Espagne, Portugal. L'aide « S'inscrire en tant que vendeur·se Pro » ajoute le Royaume-Uni (divergence entre les deux pages). | https://www.vinted.fr/pro-guide ; https://www.vinted.fr/help/906 |
| Inscription Pro en France : numéro de SIRET (14 chiffres), TVA s'il y en a une, représentant légal, adresse, KYC/KYB ; badge « Pro » sur le profil et les articles. | https://www.vinted.fr/help/906 |
| Un compte particulier ET un compte Pro sont permis, « associés à une adresse e-mail différente » et « clairement distincts ». Plusieurs comptes particuliers : interdit (« Vous ne pouvez avoir qu'un seul Compte »). | CGU § 4 ; https://www.vinted.fr/help/1436 |
| Vendeur Pro : pas de réduction sur les lots ; pas de vente dans la catégorie Cosmétiques ; droit de rétractation de 14 jours pour l'acheteur. | https://www.vinted.fr/help/918 ; https://www.vinted.fr/help/601 ; https://www.vinted.fr/help/260 |
| API pour vendeurs Pro (« Pro Integrations ») : citée par les moteurs de recherche (`vinted.co.uk/pro/integrations`), mais la page renvoie **404 le 09/10/2026**. Rien de vérifiable ce jour. | — |

## 4. Visibilité payante : Boost et Vitrine [OFF]

### 4.1 Boost (ce que les vendeurs appellent « remonter »)

- « Un Boost est une fonctionnalité payante qui te permet de mettre en avant une annonce et
  d'augmenter tes chances de vendre un article . » L'article « apparaît plus haut dans le fil d'actu et
  dans les résultats de recherche des autres membres pendant 3 ou 7 jours consécutifs (selon la durée
  du boost) ou jusqu'à sa vente. » — https://www.vinted.fr/help/340
- Prix : non fixe. Il dépend « du prix de l'article », « de la durée du Boost : 3 ou 7 jours », « de la
  diffusion du Boost dans ton pays ou à l'international » ; « Le tarif applicable s'affichera au moment
  du paiement. » — help/340 ; https://www.vinted.fr/pricelist § 2.1
- Un seul Boost à la fois par article ; non transférable ; prix de l'article : baisse possible pendant
  le Boost, hausse impossible. — help/340
- Non remboursé si l'annonce est masquée ou supprimée par la modération. — https://www.vinted.fr/help/62
- Interface relevée dans le code de la page (09/10) : « Booster l'article », « Choisis ton Boost »,
  « Utilise ton Boost gratuit » (les conditions d'un Boost gratuit ne sont décrites dans aucune page
  lue : **ne pas en parler**).

### 4.2 Vitrine (anciennement « Dressing en vitrine »)

- « Vitrine (anciennement Dressing en vitrine) est une fonctionnalité payante qui booste la visibilité
  de tes annonces » ; « Ta Vitrine mettra en avant jusqu'à 15 annonces susceptibles d'intéresser un
  membre. » — https://www.vinted.fr/help/452
- Condition : « tu dois avoir mis en ligne au moins 5 articles. » Durée : « active pendant 7 jours
  consécutifs ». — help/452
- Prix : « Le montant exact dépend du nombre d'annonces que tu as et de leur valeur. » — help/452

### 4.3 Ce qui fait le classement (texte officiel)

- « Notre plateforme » § 8 : paramètres principaux = « Attributs de l'article : date de mise en ligne
  de l'article, prix et marque », « Engagement des utilisateurs : nombre d'impressions (vues), de clics
  ou de fois où un article est ajouté aux favoris », « Historique de l'acheteur », « Boosts ».
  — https://www.vinted.fr/our-platform
- Aide « recommandations » : parmi les paramètres, « Temps écoulé depuis l'ajout de l'article » et
  « Fréquence de publication des annonces : ce paramètre permet de répartir la visibilité des articles
  auprès des acheteurs lorsque les vendeurs publient un certain nombre d'articles sur une période
  donnée » ; Vinted promeut aussi « les nouvelles annonces ». — https://www.vinted.fr/help/409
- Conseils gratuits officiels pour vendre plus vite : réductions sur les lots, Boost ou Vitrine, offre
  à ceux qui ont mis en favori, « Publie régulièrement des articles » (les abonnés « recevront une
  notification lorsque tu publies un nouvel article ou que tu baisses un prix »), photos et
  descriptions soignées, profil vérifié, plusieurs modes d'envoi. — https://www.vinted.fr/help/57

## 5. Envoi [OFF]

| Fait | Source |
|---|---|
| Transporteurs du mode d'envoi intégré, liste de la page d'aide française le 09/10 : « Mondial Relay », « Chronopost », « Chronopost (disponible uniquement avec le service de Vérification de l'article et de Vérification du matériel électronique ) », « Colissimo », « Vinted Go », « DHL Express ». | https://www.vinted.fr/help/234 |
| **Relais Colis et Colis Privé n'apparaissent pas** dans cette liste le 09/10 (Colis Privé avait été annoncé en 2023 par la presse : https://www.lsa-conso.fr/les-utilisateurs-de-vinted-peuvent-desormais-expedier-des-colis-via-colis-prive,444651). Ne pas les citer comme transporteurs actuels. | help/234 |
| L'acheteur choisit et paie le transporteur ; le vendeur reçoit un bordereau prépayé (ou un code) et doit l'utiliser, sinon « la commande sera automatiquement annulée ». | help/234 ; help/753 |
| Le vendeur choisit les transporteurs proposés (Paramètres › Envoi) ; il ne peut désactiver ni tous les transporteurs, ni les envois internationaux. | https://www.vinted.fr/help/447 ; help/753 |
| Délai d'envoi : « tu disposes de 5 jours ouvrés pour l'envoyer. Passé ce délai, la commande sera automatiquement annulée. » Prolongation possible de 3 ou 5 jours ouvrés si l'acheteur accepte. | help/753 |
| Indemnisation colis perdu ou endommagé (bordereau Vinted) : Mondial Relay « Jusqu'à 25 EUR », Shop2Shop by Chronopost « Jusqu'à 20 EUR », La Poste (Colissimo) « Jusqu'à 18 EUR », Vinted Go « Jusqu'à 500 EUR », DHL Express « Jusqu'à 15 EUR ». | https://www.vinted.fr/help/1018 |
| Envois internationaux depuis la France : « La France est reliée à l'Espagne, aux Pays-Bas, au Luxembourg, au Portugal, à l'Italie, à la Belgique, à l'Autriche, à l'Irlande et à l'Allemagne. » | help/234 |
| Vinted Go = société du groupe (« Vinted Go UAB », CGU § 10). Son site affiche « + 25 000 relais », « + 4 000 villes » et, plus bas, « plus de 18 000 consignes et points relais », pour France, Belgique, Pays-Bas, Espagne, Portugal, Finlande — **périmètre des chiffres non précisé (pas « en France »)**. Les chiffres « France » qui circulent (7 000 points, 4 700 casiers) viennent de blogs : non vérifiés. | https://www.vintedgo.com/fr |

## 6. Catégories

- Rayons de premier niveau du catalogue (menu de vinted.fr, 09/10) : Femmes, Hommes, Articles de
  créateurs, Enfants, Maison, Électronique, Livres et médias, Loisirs et collections, Sport. [OFF]
- Cœur de l'activité selon la communication des résultats 2025 : « les vêtements pour femmes et
  enfants demeurent le cœur d'activité de la plateforme », élargie aux « articles de sport » et aux
  « objets de collection » (phrase exacte : « Si les vêtements pour femmes et enfants demeurent le
  cœur d'activité de la plateforme », puis « notamment les articles de sport et les objets de
  collection »). [PRESSE] FashionUnited, article des résultats 2025 (lien § 1). L'électronique et la
  maison sont citées par d'autres titres comme catégories récentes (non relu).
- **Aucune statistique officielle de ventes par catégorie** trouvée pour la France : ne pas classer
  les « catégories qui se vendent le mieux » avec des chiffres.
- Interdits et cas particuliers : liste complète dans les Règles du catalogue (cosmétiques ouverts,
  sous-vêtements sans étiquette, produits rappelés, etc.) — https://www.vinted.fr/catalog-rules ;
  exemples dans https://www.vinted.fr/help/62.

## 7. Règles des annonces : photos, titre, description, doublons [OFF]

### 7.1 Photos

- « Tu peux importer jusqu'à 20 photos par annonce. » — Règles du catalogue § 2 ; help/48 ; help/375.
- Règles du catalogue § 2 : les photos « doivent représenter l'article tel qu'il est ; les retouches ne
  sont pas autorisées » ; « doivent avoir été prises par toi pour les utiliser sur Vinted » ; « ne
  peuvent pas être issues de banques d'images » ; « La première photo doit représenter clairement
  l'ensemble de l'article. » — https://www.vinted.fr/catalog-rules
- Conseils : lumière du jour, « N'utilise pas de flash ou de filtres », montrer les défauts, pas de
  collage en première photo. — https://www.vinted.fr/help/48
- Articles de marque : « au moins 3 photos » de détails (étiquettes, logos, coutures…), preuve d'achat
  si possible. — https://www.vinted.fr/help/601
- CGU § 14 : « vous devez prendre et télécharger une photo et rédiger une description (aucune des deux
  ne peut être issue d'Internet) ».

### 7.2 Titre, description, catégorie, marque

- « Ajoute un titre et une description détaillée » ; pas de « hashtags de marques sans rapport » ;
  « Choisis la catégorie la plus appropriée » ; sans marque : « sélectionne Sans marque ».
  — https://www.vinted.fr/help/375
- Interdits (Règles du catalogue § 3) : marques sans lien avec l'article dans « la catégorie de la
  marque, le titre, la description ou les hashtags » ; « inspiré de » suivi d'une marque.
- Motifs de **masquage** d'une annonce (help/62) qui touchent directement le crosslisting :
  « L'article n'est pas disponible ou a déjà été vendu. » ; « La description de l'annonce fait la
  promotion d'une autre plateforme. » ; mauvaise catégorie ; photos de mauvaise qualité ; prix,
  état ou taille trompeurs. — https://www.vinted.fr/help/62
- Prix anormalement bas ou haut : l'annonce « peut être considérée comme une mise aux enchères »
  (interdite). — Règles du catalogue § 1.

### 7.3 Doublons, ensembles, lots

- « Un même article ne peut pas être mis en ligne deux fois sur Vinted. » Articles identiques : une
  seule annonce, le nombre d'exemplaires dans la description. — help/375 ; help/62
- Motif de **suppression** : « L'article a été mis en ligne plusieurs fois et est un doublon. » — help/62
- Ensemble : « jusqu'à 5 articles par annonce ». Lot créé par l'acheteur : « jusqu'à 100 articles ».
  — https://www.vinted.fr/help/257 ; https://www.vinted.fr/help/260

### 7.4 Contrôle à la mise en ligne

- Contrôle automatique : « Cela prend généralement 1 à 2 secondes , mais peut parfois prendre jusqu'à
  3 à 4 jours » (help/60) — ailleurs « généralement jusqu'à 1 minute » (help/26, help/375). Pendant ce
  contrôle, on ne peut ni masquer ni supprimer l'annonce. — https://www.vinted.fr/help/60

## 8. Offres, favoris, réductions [OFF]

| Fait | Source |
|---|---|
| Offre de l'acheteur : « jusqu'à 40 % de moins que le prix d'origine » ; le vendeur peut faire une contre-offre ; offres « pas contraignantes » ; l'article reste achetable par d'autres tant que personne n'a cliqué sur Acheter. | https://www.vinted.fr/help/258 |
| « Tu peux faire jusqu'à 25 offres par jour en tant qu'acheteur. Il n'y a pas de limite sur le nombre d'offres que tu peux faire en tant que vendeur. » Les offres ne portent pas sur les frais de port. | help/258 |
| Le vendeur peut proposer un prix plus bas dans une conversation ; « Le nouveau prix sera uniquement visible par cet acheteur ». | help/258 |
| Favori : le vendeur reçoit une notification et peut proposer une réduction avec « Faire une offre ». | https://www.vinted.fr/help/267 |
| Réductions sur les lots : réglage du vendeur ; « seuls les vendeurs standards peuvent proposer des réductions sur les lots ». | https://www.vinted.fr/help/422 |
| Une baisse de prix notifie les abonnés (« lorsque tu publies un nouvel article ou que tu baisses un prix »). Le seuil « −5 % » qui circule vient d'un blog : non vérifié. | https://www.vinted.fr/help/57 |

## 9. Dressing et durée de vie d'une annonce

- **Aucune durée de vie officielle d'une annonce Vinted n'a été trouvée** (ni CGU, ni aide, ni
  règles) : ne rien écrire du type « une annonce expire après X jours ». « Une annonce n'expire
  jamais » n'est affirmé que par des blogs [ÉDITEUR] : non citable.
- Masquer, modifier, supprimer : possible à tout moment depuis l'app ou le site ; « Lorsque tu
  supprimes une annonce, nous conservons certaines données pendant 6 mois maximum ». [OFF] help/60
- CGU § 14 : « Vous pouvez retirer une annonce à tout moment avant qu'un Acheteur n'achète
  l'Article. » [OFF]
- Mode vacances : « masquer tes articles pendant 90 jours maximum » ; il ne prolonge pas Boost ou
  Vitrine. [OFF] https://www.vinted.fr/help/33
- Brouillons : une annonce peut être enregistrée en brouillon et reprise sur l'app ou le site. [OFF]
  https://www.vinted.fr/help/421
- **Article vendu ailleurs** (texte officiel, à citer dans les pages trajet et « double vente ») :
  « S'il se trouve que tu as vendu un article sur une autre plateforme, masque-le ou supprime-le de tes
  annonces Vinted au lieu de le marquer comme « Vendu ». » Le bouton « Indiquer comme vendu » est
  réservé aux ventes conclues hors du paiement Vinted. [OFF] https://www.vinted.fr/help/214
- Après une commande annulée, le vendeur peut « republier l'article à l'aide du bouton Republier
  l'article ». [OFF] help/340 ; https://www.vinted.fr/help/674
- Suivre un vendeur : les abonnés reçoivent des notifications sur ses nouveaux articles. [OFF]
  https://www.vinted.fr/help/1081 ; help/452

## 10. Ce que disent les textes de Vinted sur les outils tiers et l'« activité automatisée »

### 10.1 CGU du 05/10/2026, § 6 « Obligations et interdictions » — citations exactes [OFF]

Source : https://www.vinted.fr/terms-and-conditions (« Nouvelle version applicable à partir du
05/10/2026 »). « Interdictions . Lors de la création d'un Compte ou de l'utilisation du Site ou des
Services, vous vous engagez à ne pas : »

1. « utiliser tout type d'outil logiciel externe (y compris, mais sans s'y limiter, des bots, des
   programmes de grattage [« scraping »], des programmes d'exploration [« crawling »], des robots
   d'indexation [« spiders »]) lors de votre inscription sur le Site et/ou de l'utilisation du Site
   et/ou des Services (y compris, mais sans s'y limiter, dans le but de promouvoir des Articles,
   d'ajouter des Articles aux favoris), à moins qu'une telle utilisation ne soit autorisée, proposée
   ou permise d'une autre manière par nous ; »
2. « utiliser tout outil logiciel externe susceptible de perturber le fonctionnement normal du Site ou
   des Services ou d'infecter ou d'endommager l'ordinateur d'un autre Utilisateur ; »
3. « adapter, copier, modifier, distribuer ou commercialiser tout contenu du Site sans notre
   consentement écrit préalable ; »
4. « extraire des données (« data mining »), collecter des données disponibles sur votre écran
   (« screen scraping »), explorer des données (« data crawling »), désassembler, décompiler ou
   rétro-concevoir une quelconque partie du Site ; »
5. « supprimer et ajouter à nouveau plusieurs fois le même Article ou plusieurs Articles en gros ; »

Même § 6, obligations : « partager uniquement des informations issues du Site auprès de tiers, y
compris sur les réseaux sociaux, si le bouton Partager du Site le permet ». § 12 : interdiction
d'« envoyer des messages non sollicités ou de masse à 5 Utilisateurs ou plus ».

**Ces clauses ne sont pas nouvelles** : les points 1, 2 et 5 figurent mot pour mot (à l'apostrophe
près) dans la version applicable à partir du 08-09-2025 (https://www.vinted.fr/old-terms-and-conditions).
La page de mise à jour du 05/10/2026 ne présente comme changement que le porte-monnaie (Mangopay
remplacé par Vinted Pay) (https://www.vinted.fr/terms-and-conditions-updates).

**Version anglaise (UE)**, https://www.vinted.ie/terms-and-conditions (« New version applicable from
05-10-2026 »), § 6 « What you must and must not do » :
- « use any kind of external software tools (including but not limited to: bots, scraping programs,
  crawling programs, spiders) when registering on the Site and/or when using the Site and/or Services
  (including but not limited to: for the purpose of promoting Items, adding Items to favourite),
  unless such a use is authorised, offered or in any other way allowed by us, »
- « data mine, screen scrape, crawl, disassemble, decompile or reverse engineer any part of the Site, »
- « delete and re-list the same Item multiple times or multiple Items in bulk, »

### 10.2 Sanctions prévues [OFF]

- CGU § 7 : « l'envoi d'un avertissement, la suppression d'un Article du Catalogue, le masquage ou la
  suppression de Contenu, le blocage d'une fonctionnalité de votre Compte (comme les messages), ou
  encore le blocage temporaire ou définitif de votre Compte. » ; « Nous pouvons parfois utiliser des
  outils automatisés pour détecter ces problèmes et agir » ; l'exposé des motifs mentionne
  « l'utilisation de moyens automatisés pour prendre notre décision » ; recours possible.
- Blocage temporaire : « automatiquement débloqué au bout de 7 à 30 jours » ; les motifs listés ne
  citent **pas** l'automatisation (insultes, photos inappropriées, articles interdits, contrefaçon,
  ventes hors paiement Vinted, ventes commerciales sur compte particulier). Blocage permanent :
  notamment « Possession de plusieurs comptes Vinted ». — https://www.vinted.fr/help/92
- Recours contre une décision de modération : « dans un délai de 6 mois », une seule fois. — help/62
- Un compte bloqué de façon permanente ne peut pas être supprimé ; créer un nouveau compte après un
  blocage n'est pas autorisé. — https://www.vinted.fr/help/88 ; https://www.vinted.fr/help/1436

### 10.3 Restrictions signalées depuis l'été 2026 (aucune communication officielle de Vinted trouvée)

| Ce qui est rapporté | Étiquette | Source |
|---|---|---|
| À partir du **21/07/2026**, des comptes restreints 24 h. Message rapporté par des membres : « Salut, on a remarqué une activité automatisée sur ton compte, ce qui va à l'encontre de nos Conditions générales. » / « on a dû restreindre ta possibilité de modifier ou de mettre en vente de nouveaux articles pendant 24 heures. » Des membres disent avoir été restreints après des gestes faits à la main. | [FORUM] fil ouvert le 23/07/2026 | https://www.vint-aide.com/t/public-restrictions-pour-activite-automatisee-21-07-2026/4512 |
| Même constat, « restricted for 24 hours », y compris « after purely manual actions, with no tool at all ». | [ÉDITEUR] Redrip, 23/07/2026 | https://www.redrip.app/en/blog/vinted-automation-restriction-2026/ |
| « Depuis le 21 juillet 2026 » ; mise à jour du 15/08/2026 : « Les blocages mis en place par Vinted se sont affaiblis ces dernières semaines » ; comptes Pro de leurs clients « jamais […] concernés ». | [ÉDITEUR] Cassou, 21/07/2026, maj 15/08/2026 | https://cassou.app/fr/blog/restriction-vinted-automatisation |
| Crosslist arrête Vinted pour les nouveaux inscrits : « Vinted has also increased its detection of automated activity » ; suspensions temporaires de 24 h ; « We haven't seen any permanent bans for automated activity » ; propose un mode brouillon (publication finale faite à la main dans Vinted). Page datée « Oct 9, 2026 », « Last updated on: October 2, 2026 ». | [ÉDITEUR] concurrent | https://crosslist.com/blog/vinted-cross-listing |
| List Perfectly (29/05/2026) : « Other services have pulled back from Vinted and canceled their integration after Vinted tightened access around automated or unauthorized integration workflows. » | [ÉDITEUR] concurrent | https://listperfectly.com/selling/list-perfectly-vinted-integration-compliant-crosslisting/ (relevé dans `concurrents/list-perfectly.md`) |

Ce qu'on peut écrire : « Depuis l'été 2026, des vendeurs rapportent des restrictions de 24 heures
pour « activité automatisée » ; Vinted n'a publié aucune communication à ce sujet. » Rien de plus
(ni nombre de comptes, ni critères de détection, ni « levée » de la vague).

## 11. Pays

| Fait | Source |
|---|---|
| Sites Vinted déclarés par vinted.fr (balises hreflang, 09/10), 27 adresses : vinted.at, .be, .com (en-US), .com.au, .co.uk, .cz, .de, .dk, .ee, .es, .fi, .fr, .gr, .hr, .hu, .ie, .it, .lt, .lu, .lv, .nl, .pl, .pt, .ro, .se, .si, .sk. Statut commercial de chaque site (ouvert à la vente ? depuis quand ?) **non vérifié**. | code de https://www.vinted.fr/terms-and-conditions |
| Marchés « connectés » de l'UE pour le chiffre DSA : FR, NL, BE, LU, ES, IT, PT, IE, AT, DE. | https://www.vinted.fr/our-platform |
| Envois depuis la France vers ES, NL, LU, PT, IT, BE, AT, IE, DE. | https://www.vinted.fr/help/234 |
| Boost « à l'international » : visibilité « auprès des acheteurs de tous les pays où tu peux vendre sur Vinted ». | https://www.vinted.fr/help/340 |
| Vinted Pro : FR, NL, BE, LU, IT, ES, PT (+ UK selon help/906). | § 3 |
| Vinted Go : France, Belgique, Pays-Bas, Espagne, Portugal, Finlande. | https://www.vintedgo.com/fr |
| **FillSell : Vinted France (vinted.fr) seulement** dans l'extension servie. | [FV] F32, F57 |

## 12. Fiscalité (utile aux pages « revendeur » et « calculer ses profits ») [OFF]

- DAC7 : Vinted contacte le vendeur s'il a fait « 30 ventes ou plus au cours de l'année civile » ou
  « des gains supérieurs à 2 000 € au cours de l'année civile » ; « cela ne signifie pas que tu devras
  payer des impôts ». Vente d'un objet personnel : imposable seulement si son montant dépasse 5 000 € et
  s'il y a un bénéfice (selon Vinted). — https://www.vinted.fr/help/1149
- Vérifier sur impots.gouv.fr avant toute phrase sur l'imposition de l'achat-revente (non relu ici).

## 13. FillSell et Vinted (uniquement d'après la fiche de vérité)

### 13.1 Comment FillSell travaille sur Vinted

| Fait FillSell | Réf. |
|---|---|
| **Par l'extension Chrome, dans la session Vinted de la personne** : elle se connecte elle-même à Vinted dans son navigateur ; FillSell ne demande ni ne stocke le mot de passe Vinted. | F05, F11 |
| Aucune API Vinted n'apparaît dans la fiche : l'interface officielle (API) ne concerne qu'eBay. | F07, F31 |
| L'extension remplit les formulaires de dépôt, relit les annonces sur « Synchroniser », vérifie leur statut, repère les ventes, retire et republie (Vinted fait partie des plateformes republiées). | F07 |
| Une annonce après l'autre, pause aléatoire de 8 à 20 s entre deux. | F07, F28 |
| Fenêtre dédiée, réduite (une fenêtre existe dans la barre des tâches). | F08 |
| Ordinateur allumé, Chrome ouvert, extension active, session Vinted ouverte ; l'extension empêche la veille tant qu'il reste du travail (au plus 4 h). Ordinateur éteint : tout attend ; un dépôt en attente plus de 10 jours passe en échec (« Relancer »). | F09, F10 |
| Chrome seulement annoncé (Edge constaté en usage, non annoncé). | F06 |
| **Vinted France (vinted.fr) seulement** ; les autres sites Vinted sont prêts dans une version non publiée. | F32, F57 |

### 13.2 Ce que FillSell fait sur Vinted

| Fonction | Ce qui est vrai | Réf. |
|---|---|---|
| Lens | Photo → titre, marque (seulement si lue), état estimé (liste fermée), taille, description, prix conseillé établi par une recherche web d'annonces comparables (« Vinted d'abord », 8 au plus, nombre affiché). Rédige aussi l'annonce de chaque plateforme, Vinted comprise. La personne relit. | F15, F16, F18, F19 |
| Publication | Vinted parmi les 4 plateformes cochables ; version adaptée (catégorie, taille, couleur, colis) ; champ manquant ou rayon introuvable → question en français. | F24, F25 |
| Lot | Jusqu'à 20 articles, dans la limite du forfait. | F26, F27 |
| Synchroniser | Sur appui seulement : lit les annonces Vinted déjà en ligne et les range dans le stock ; ne publie ni ne modifie rien ; mais une vente révélée par le dressing Vinted est enregistrée et fait retirer les copies ailleurs. | F33, F34 |
| Une fiche par article | Fusion seulement sur mêmes photos ET accord du titre, ou identifiant d'un dépôt FillSell ; jamais la photo seule ni le titre seul ; deux annonces Vinted = deux exemplaires ; doute → « Est-ce le même article ? ». | F35 |
| Plusieurs boutiques Vinted | FillSell peut en suivre plusieurs ; il travaille sur celle connectée dans le navigateur ; ajout seulement sur « Ajouter @x à mes boutiques ». | F36 |
| Republication | Retirer puis redéposer : nouvelle annonce, vues/favoris/ancienneté perdus ; pas deux fois la même annonce en 24 h ; manuelle sur tous les forfaits (Gratuit 50/mois) ; automatique par créneaux pour Pro et Business (ancienneté ≥ 7 jours) ; plafond quotidien par palier ; aucune automatique Vinted pendant une vérification anti-robot du compte (`pause_antirobot`) ; extension vue dans les 7 jours exigée. | F37, F38, F39, F40 |
| Remise en vente | Après une vente partielle d'un article à plusieurs exemplaires **déposé par FillSell**, republie sur la plateforme où il s'est vendu. | F41 |
| Ventes Vinted | Repérées par l'extension (ordinateur allumé) ; **enregistrées toutes seules sur preuve** (dressing « vendu » depuis le 08/10, page de l'annonce lue « vendue » depuis le 09/10). Aucun délai chiffré. Liste des commandes relue toutes les 10 min pour les comptes payants seulement. | F42, F43 |
| Retraits | Après une vente enregistrée, retrait automatique des copies prouvées ; copie non prouvée → « Déjà vendu ? ». Retrait définitif ; sur Vinted par l'extension (ordinateur allumé). | F44 |
| E-mail | Un e-mail quand FillSell **enregistre** une vente récente (Vinted, eBay). | F45 |

### 13.3 Ce qui demande un geste de la personne

Se connecter à Vinted dans Chrome (F11) · appuyer sur « Synchroniser » (F33) · relire ce que Lens
propose (F15, F16, F18) · cocher Vinted et répondre aux questions de champs ou de rayon (F24, F25) ·
trancher « Est-ce le même article ? » (F35) et « Déjà vendu ? » (F44) · cliquer « Ajouter @x à mes
boutiques » (F36) · republier d'un appui ou régler les créneaux automatiques (F38, F39) · confirmer
d'un appui une vente **Leboncoin ou Beebs** avant que la copie Vinted soit retirée (F43, F44).

### 13.4 Limites à dire

Ordinateur allumé avec Chrome (F09) ; pas de délai promis (F42) ; une à une, rythme humain (F28) ;
plafond quotidien et pause (F40) ; vinted.fr seulement (F32) ; pas de push mobile (F46) ; le Gratuit
n'a ni veille des commandes (F42) ni republication automatique (F39).

### 13.5 Points de friction FillSell ↔ textes de Vinted (constat, pas un avis juridique — à trancher par Nico)

| Ce que fait FillSell [FV] | Ce que disent les textes de Vinted [OFF] | Conséquence pour nos textes |
|---|---|---|
| L'extension agit sur vinted.fr dans la session de la personne (F07). | CGU § 6 : pas d'« outil logiciel externe » … « à moins qu'une telle utilisation ne soit autorisée, proposée ou permise d'une autre manière par nous ». FillSell n'est affilié à aucune plateforme (§ 15 de la fiche). | Ne jamais écrire « autorisé par Vinted », « conforme aux CGU de Vinted », « approuvé ». La page `/securite-des-comptes` cite la clause exacte et dit ce que FillSell fait pour espacer ses gestes, sans promettre d'immunité. |
| Republier = retirer puis redéposer ; manuel, automatique et « Republier en lot » (F37-F39). | CGU § 6 : ne pas « supprimer et ajouter à nouveau plusieurs fois le même Article ou plusieurs Articles en gros ». | Ne jamais présenter la republication Vinted comme sans risque ni comme un « Boost gratuit ». Dire les garde-fous réels (pas deux fois en 24 h, ancienneté ≥ 7 jours, plafond, coupure, pause anti-robot) comme des choix de prudence, pas comme une conformité. |
| « Synchroniser » lit les annonces en ligne (F33). | CGU § 6 : pas de « data mining », « screen scraping », « data crawling ». | Écrire « FillSell relit tes propres annonces », jamais « extrait », « aspire », « scrape ». |
| Retouche photo par IA (lumière, fond) sur les forfaits payants (F21). | Règles du catalogue § 2 : « les retouches ne sont pas autorisées » ; help/48 : pas de filtres. | **Ne pas promouvoir la retouche IA pour Vinted.** Question ouverte à Nico : les photos retouchées partent-elles sur Vinted ? (la fiche ne le dit pas). |
| FillSell peut suivre plusieurs boutiques Vinted (F36). | Un seul compte particulier (+ un compte Pro distinct au plus) ; plusieurs comptes = motif de blocage permanent (help/92, help/1436). | Ne jamais suggérer plusieurs comptes Vinted particuliers. Formulation de la fiche (« Tu as plusieurs boutiques Vinted ? ») à revoir avec Nico. |
| Positionnement « Achat Revente », « Assistant IA pour revendeurs » (nom et sous-titre de la fiche App Store, F01). | Achat pour revendre interdit sur un compte particulier ; obligatoire : Vinted Pro (Règles du catalogue § 4, help/1120, guide Pro). | Toute page « revendeur Vinted » dit que l'achat-revente se fait avec un compte Vinted Pro. Compatibilité de l'extension avec un compte Vinted Pro : **absente de la fiche** → ne rien affirmer. |
| Retrait de l'annonce Vinted quand l'article est vendu ailleurs (F44). | « S'il se trouve que tu as vendu un article sur une autre plateforme, masque-le ou supprime-le de tes annonces Vinted » (help/214) ; annonce d'un article déjà vendu = motif de masquage (help/62). | **Point d'appui** : c'est exactement le geste que Vinted demande. Citable. |
| Deux annonces Vinted du même article = deux exemplaires (F35). | « Un même article ne peut pas être mis en ligne deux fois sur Vinted » (help/375). | Ne jamais conseiller de publier deux fois le même article sur Vinted. |

## 14. Dix faits citables (courts, exacts, sourcés — lus le 09/10/2026)

1. **Vendre sur Vinted est gratuit pour un particulier** : « Vinted n'applique aucun frais de vente ».
   — https://www.vinted.fr/help/26
2. **L'acheteur paie les « Frais Vinted »**, « généralement de 5 % + 0,70 € » (TVA comprise).
   — https://www.vinted.fr/pricelist (mise à jour du 05/10/2026)
3. **Depuis le 5 octobre 2026**, les conditions de Vinted parlent de « Frais Vinted » là où elles
   parlaient de « Protection acheteurs ». — https://www.vinted.fr/terms-and-conditions ;
   https://www.vinted.fr/old-terms-and-conditions
4. **Un Boost dure 3 ou 7 jours** (ou jusqu'à la vente) ; son prix dépend du prix de l'article, de la
   durée et de la portée, et s'affiche au paiement. — https://www.vinted.fr/help/340
5. **La Vitrine (ex-Dressing en vitrine) dure 7 jours** et demande au moins 5 articles en ligne.
   — https://www.vinted.fr/help/452
6. **20 photos au plus par annonce**, prises par le vendeur ; « les retouches ne sont pas autorisées ».
   — https://www.vinted.fr/catalog-rules
7. **5 jours ouvrés pour expédier**, sinon la commande est annulée automatiquement.
   — https://www.vinted.fr/help/753
8. **Une offre peut descendre jusqu'à 40 % sous le prix d'origine** ; un acheteur peut faire 25 offres
   par jour. — https://www.vinted.fr/help/258
9. **Vendu sur une autre plateforme ?** Vinted demande de masquer ou supprimer l'annonce, pas de la
   marquer « Vendu ». — https://www.vinted.fr/help/214
10. **Les CGU interdisent de « supprimer et ajouter à nouveau plusieurs fois le même Article ou
    plusieurs Articles en gros »** et l'usage d'outils logiciels externes non autorisés par Vinted.
    — https://www.vinted.fr/terms-and-conditions § 6

En réserve : « La date de mise en ligne » fait partie des critères de classement (our-platform § 8) ·
mode vacances jusqu'à 90 jours (help/33) · DAC7 : 30 ventes ou plus de 2 000 € par an (help/1149) ·
un compte particulier et un compte Pro au plus (CGU § 4) · ensembles jusqu'à 5 articles (help/257).

## 15. Pièges : ce qu'il ne faut PAS affirmer

**Sur Vinted**
- « Protection acheteurs » comme nom actuel des frais (c'est « Frais Vinted » depuis le 05/10/2026 ;
  l'ancien nom peut figurer entre parenthèses pour la recherche).
- Un prix fixe de Boost ou de Vitrine (aucun barème public ; prix affiché au paiement).
- « Relais Colis » ou « Colis Privé » comme transporteurs Vinted actuels ; un nombre de points Vinted Go
  « en France ».
- « Une annonce Vinted expire après X jours » ou « n'expire jamais » (aucun texte officiel).
- « Vinted interdit le crosslisting » ou « Vinted bannit les outils de crosslisting » : faux tel quel.
  Citer la clause exacte (§ 10.1) et rien d'autre.
- « Vinted a confirmé une vague de bannissements », un nombre de comptes touchés, ou « la vague est
  finie » : seules des sources d'éditeurs et de forums en parlent.
- « Vinted n'a pas d'API » ou « FillSell utilise l'API de Vinted » : la première n'est pas vérifiée
  (§ 3, page 404), la seconde est fausse (extension seulement).
- « Vinted dans 27 pays » pour parler de FillSell : FillSell = vinted.fr seulement (F32).
- Un nombre de membres Vinted en France (aucun chiffre officiel récent) ; le chiffre DSA (31 millions)
  ne se cite qu'avec sa définition et sa date (« destinataires actifs mensuels moyens dans l'UE au
  31/07/2026 »).
- Un classement chiffré des « catégories qui se vendent le mieux ».
- Conseiller d'écrire dans l'annonce Vinted que l'article est aussi sur Leboncoin ou eBay (motif de
  masquage, help/62), de publier deux fois le même article, de retoucher ses photos, d'acheter pour
  revendre sur un compte particulier, d'ouvrir plusieurs comptes.

**Sur FillSell et Vinted**
- « Autorisé / validé / approuvé par Vinted », « partenaire de Vinted », « conforme aux CGU de
  Vinted », « sans risque », « zéro risque de bannissement », « indétectable », « invisible pour
  Vinted », « comme un humain » (dire « à un rythme humain », F28), « bot ».
- « Remonter gratuitement comme un Boost », « Boost gratuit » : republier n'est pas un Boost et fait
  perdre vues et favoris (F37).
- « Republication toutes les 24 h » (C03 : ancienneté minimale 7 jours, F39).
- « Retouche IA » dans une page Vinted.
- « FillSell enregistre tes ventes tout seul partout » : seulement Vinted et eBay ; Leboncoin et Beebs
  attendent un appui (F43). « Retrait automatique partout » (C24).
- « Un e-mail à chaque vente » (F45 : seulement les ventes enregistrées).
- « Tes annonces Vinted remontent toutes seules dans l'app » (C04) : l'import ne part que sur
  « Synchroniser » (F33).
- « Même ordinateur éteint » pour Vinted (F09) ; « en temps réel », « instantané », un délai chiffré de
  détection (F42).
- « Vinted Belgique / Italie / Europe » (F32, F57) ; « plusieurs comptes Vinted en même temps » (F36).
- Logo Vinted (interdit sans autorisation écrite, `PLAN.md` § 2) : nom en texte + mention « FillSell
  n'est affilié à aucune de ces plateformes ».

## 16. Non vérifié — à relire par un humain avant publication

- Le texte affiché par Vinted lors d'une restriction pour « activité automatisée » (seulement rapporté
  par un forum et des éditeurs).
- Une éventuelle page d'aide officielle sur l'automatisation ou les outils tiers : aucune trouvée parmi
  ~140 titres d'articles lus.
- L'API Pro Integrations (404 le 09/10) et la liste des « intégrations autorisées » par Vinted, s'il en
  existe une.
- Le Boost gratuit à la mise en ligne (chaîne d'interface « Utilise ton Boost gratuit ») : conditions
  inconnues.
- Les dates de version des Règles du catalogue et des articles d'aide (non affichées).
- Le statut d'ouverture des 27 sites Vinted (notamment vinted.com et vinted.com.au).
- Les chiffres Vinted Go pour la France seule.
- Côté FillSell (absent de la fiche) : compatibilité avec un compte Vinted Pro ; photos retouchées
  envoyées ou non à Vinted ; absence de mention d'autres plateformes dans la description rédigée pour
  Vinted.

## 17. Requêtes servies (rappel de `etat-des-lieux/06-mots-cles-fr.md`, indice Trends, « bot vinted » = 100)

« vinted pro » ≈ 762 · « frais vinted » ≈ 384 · « vinted bloqué » ≈ 156 · « ia vinted » ≈ 138 ·
« extension vinted » ≈ 26 · « remonter annonce vinted » 2,9 → 19 sur 8 semaines (forte hausse).
Les sections 2 (frais), 3 (Pro), 4 (Boost / remonter) et 10 (restrictions) répondent à ces requêtes.

## 18. Sources (toutes consultées le 2026-10-09)

Officielles Vinted :
- https://www.vinted.fr/terms-and-conditions — CGU, version applicable à partir du 05/10/2026
- https://www.vinted.fr/old-terms-and-conditions — CGU, version applicable à partir du 08-09-2025
- https://www.vinted.fr/terms-and-conditions-updates — mise à jour du 05/10/2026
- https://www.vinted.ie/terms-and-conditions — CGU en anglais (UE), version du 05-10-2026
- https://www.vinted.fr/pricelist — liste des tarifs, mise à jour du 05/10/2026
- https://www.vinted.fr/catalog-rules — Règles du catalogue
- https://www.vinted.fr/our-platform — guide d'utilisation (DSA, classement, frais)
- https://www.vinted.fr/pro-guide — guide Vinted Pro
- Centre d'aide : https://www.vinted.fr/help/26 (bases de la vente) · /33 (mode vacances) · /48
  (photos) · /57 (vendre plus vite) · /60 (masquer, modifier, supprimer) · /62 (annonce masquée ou
  supprimée) · /88 (désactiver son compte) · /92 (compte bloqué) · /214 (article affiché comme vendu)
  · /234 (modes d'envoi) · /257 (ensembles) · /258 (offres) · /260 (lots) · /267 (favoris) · /340
  (Boost) · /342 (Frais Vinted) · /375 (mettre en ligne) · /409 (recommandations) · /421 (brouillons)
  · /422 (réductions sur les lots) · /447 (modes d'envoi du vendeur) · /452 (Vitrine) · /465
  (remboursement) · /601 (photos d'articles de marque) · /674 (commande annulée) · /753 (envoi de
  colis) · /906 (s'inscrire en Pro) · /918 (vendre en Pro) · /1018 (indemnisation) · /1081 (suivre
  un membre) · /1120 (ventes commerciales) · /1149 (DAC7) · /1252 (services de visibilité) · /1436
  (plusieurs comptes)
- https://www.vintedgo.com/fr — Vinted Go

Presse :
- https://tech.eu/2026/04/09/vinted-s-revenues-top-1bn-but-profits-slide/ (09/04/2026)
- https://fashionunited.fr/actualite/business/vinted-atteint-1-1-milliard-deuros-de-chiffre-daffaires-en-2025-et-assume-une-baisse-strategique-de-ses-benefices/2026040941303 (date non affichée dans le texte ; l'adresse porte 20260409 ; d'après « un communiqué » de Vinted)
- https://www.lsa-conso.fr/les-utilisateurs-de-vinted-peuvent-desormais-expedier-des-colis-via-colis-prive,444651 (2023, historique seulement)

Éditeurs d'outils et forum (contexte, jamais une preuve) :
- https://crosslist.com/blog/vinted-cross-listing (« Oct 9, 2026 », maj « October 2, 2026 »)
- https://listperfectly.com/selling/list-perfectly-vinted-integration-compliant-crosslisting/ (29/05/2026)
- https://www.redrip.app/en/blog/vinted-automation-restriction-2026/ (23/07/2026)
- https://cassou.app/fr/blog/restriction-vinted-automatisation (21/07/2026, maj 15/08/2026)
- https://www.vint-aide.com/t/public-restrictions-pour-activite-automatisee-21-07-2026/4512 (fil du 23/07/2026)

Interne :
- `docs/seo/etat-des-lieux/03-fiche-de-verite.md` et `03b-contre-verification.md` (F01-F64, C01-C24)
- `docs/seo/PLAN.md`, `docs/seo/etat-des-lieux/06-mots-cles-fr.md`, `docs/seo/concurrents/list-perfectly.md`, `docs/seo/concurrents/crosslist.md`
