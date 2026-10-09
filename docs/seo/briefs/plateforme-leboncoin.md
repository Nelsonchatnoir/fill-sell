# Fiche de faits — Leboncoin (marché France, 09/10/2026)

> Sert à écrire `/plateformes/leboncoin`, les trajets qui passent par Leboncoin
> (`/crosslisting/leboncoin-ebay`, `/crosslisting/leboncoin-beebs`, l'article
> `/blog/cross-listing-vinted-leboncoin`), `/fonctions/republication`, `/fonctions/ventes-et-retraits`,
> `/securite-des-comptes` et le guide anglais `/blog/sell-on-leboncoin-in-english` (`PLAN.md` § 3).
> Observé le **2026-10-09, entre 15:30 et 15:50 (heure de Paris)**. Lecture seule : aucune
> connexion à un compte, aucun SQL, aucun commit, aucune action publique.

## 0. Méthode et limites (à lire avant de citer quoi que ce soit)

| Source | Lue ? | Remarque |
|---|---|---|
| Centre d'aide officiel `assistance.leboncoin.info/hc/fr` | **oui** (une trentaine d'articles, 09/10) | Aucun article n'affiche de date de mise à jour. Lu par l'outil de lecture, qui rend des **citations courtes** (≤ 125 caractères) et un résumé : toute citation destinée à une page publiée se recopie depuis la page par un humain. |
| `www.leboncoin.fr/dc/cgu`, `/dc/cgv`, `/dc/rules` (règles de diffusion), `/options/prix` (grille des options), `/legal.htm` | **non** | **HTTP 403** à l'outil de lecture le 09/10 (protection anti-robots du site). Aucun contournement tenté (ni proxy, ni archive, ni navigateur de Nico : sa session Leboncoin est réelle). |
| `www.leboncoin.fr/robots.txt` | **oui** (09/10) | Fichier officiel, lisible. |
| Espace presse officiel `presse.leboncoincorporate.com` | **oui** (09/10) | Communiqués datés. |
| `web.archive.org` | **non** | Refusé à l'outil de lecture. |
| Presse, cabinets d'avocats | oui, ponctuellement | Datés, cités comme tels. |
| Blogs d'outils, forums (Que Choisir, Dealabs, Custplace) | lus en résultat de recherche | **Jamais une preuve** ; signalés seulement quand ils contredisent l'officiel. |

**Étiquettes utilisées ci-dessous** : **[OFF]** page officielle lue le 09/10 · **[OFF-daté]** texte
officiel daté, mais ancien · **[INDIRECT]** texte officiel que nous n'avons pas pu lire, rapporté par
un tiers · **[PRESSE]** article daté · **[TIERS]** blog ou forum, non citable comme fait.

**Graphie** : la marque s'écrit elle-même « leboncoin » (minuscules) dans son aide et ses
communiqués ; nos textes écrivent « Leboncoin ». Garder une seule graphie par page.

---

## 1. La plateforme en bref

| Fait | Étiquette | Source (lue le 09/10/2026) |
|---|---|---|
| Éditeur : **LBC France**, SAS, RCS Paris 521 724 336, siège 24 rue des Jeûneurs, 75002 Paris. | [OFF] | https://assistance.leboncoin.info/hc/fr/articles/4404431666834 |
| La plateforme appartient au **groupe Adevinta** (présenté ainsi par l'espace presse). | [OFF] | https://presse.leboncoincorporate.com/corporate.html |
| Audience : « **30 millions de visiteurs mensuels** » (communiqué du **25/03/2026**). Communiqué du **29/01/2026** : « Un Français sur deux se connecte chaque mois à la plateforme ». Chiffre plus ancien : 28,8 millions de visiteurs uniques (24/01/2024). | [OFF] | https://presse.leboncoincorporate.com/actualites/paypal-et-leboncoin-s-allient-pour-simplifier-les-achats-de-seconde-main-13d6f-763e3.html ; https://presse.leboncoincorporate.com/corporate.html |
| **PayPal** intégré au parcours de paiement sécurisé (paiement en une fois ou en quatre fois sans frais pour les transactions éligibles), communiqué du **25/03/2026**. Les montants éligibles (30 à 2 000 €) ne figurent que dans la presse, pas dans le communiqué lu. | [OFF] (+ montants [PRESSE] non relus) | même communiqué ; https://www.moneyvox.fr/banque-en-ligne/actualites/108031/paypal-et-le-paiement-en-quatre-fois-desormais-disponibles-sur-leboncoin |
| Application leboncoin **dans ChatGPT** lancée en **février 2026** (le 9 ou le 10 selon les titres) ; contact et paiement restent sur leboncoin. Nombre d'annonces cité : 83 à 89 millions selon les titres — **ne pas citer de chiffre**. | [PRESSE] | https://siecledigital.fr/2026/02/09/leboncoin-arrive-dans-chatgpt/ ; https://www.clubic.com/actualite-600067-ca-y-est-leboncoin-arrive-dans-chatgpt.html |

---

## 2. Déposer une annonce : gratuité et limites

### 2.1 Ce que dit l'aide officielle [OFF]

Sources : « Pourquoi mon dépôt d'annonce est-il payant ? »
https://assistance.leboncoin.info/hc/fr/articles/25251056454418-Pourquoi-mon-d%C3%A9p%C3%B4t-d-annonce-est-il-payant
et « Combien coûte le dépôt d'une annonce ? »
https://assistance.leboncoin.info/hc/fr/articles/360000165649-Combien-co%C3%BBte-le-d%C3%A9p%C3%B4t-d-une-annonce (lues le 09/10).

- « Le dépôt d'annonce sur leboncoin est **gratuit pour les utilisateurs particuliers dans toutes les
  autres catégories** » — c'est-à-dire hors certaines sous-catégories de **Véhicules** et d'**Immobilier**.
- Seuils gratuits pour un particulier, comptés sur les **12 derniers mois** (une annonce supprimée
  compte quand même ; une **modification** n'est pas concernée) :

| Sous-catégorie | Gratuites sur 12 mois (texte de l'article) | Payant à partir de |
|---|---|---|
| Voitures, Utilitaires | 2 | la 3ᵉ |
| Immobilier — Ventes, Bureaux et commerces | 3 (le **tableau** de la même page dit 2 pour Bureaux et commerces) | la 4ᵉ |
| Immobilier — Locations, Colocations | 5 (le **tableau** dit 4) | la 6ᵉ |

- Dépasser le seuil dans une sous-catégorie Immobilier rend le dépôt payant dans **toutes** les
  sous-catégories Immobilier.
- Plaque d'immatriculation reconnue comme professionnelle : payant **dès la première annonce**.
- Le prix exact s'affiche « juste avant de valider le dépôt » ; grille sur
  https://www.leboncoin.fr/options/prix?user_type=fprivate (**non lue : 403**).
- **Professionnels** : dépôt payant « uniquement dans les rubriques suivantes » : emploi, véhicules,
  immobilier, vacances, maison, loisirs, multimédia, matériel professionnel et services (sauf
  événements) — liste telle que restituée par l'outil de lecture ; « Mode » n'y figure pas (à relire).

### 2.2 Ce qu'on ne sait PAS

- **Aucun nombre maximum d'annonces gratuites** n'est donné par l'aide officielle pour les
  catégories courantes du revendeur (Mode, Famille, Maison et jardin, Électronique, Loisirs).
- Les chiffres qui circulent sont contradictoires et non officiels : « 50 annonces gratuites hors
  véhicules » (sequr.fr), « 5 à 10 par mois » (josephtorregrossa.com), « 7 en ligne en même temps »
  (forum Que Choisir) — **[TIERS], ne jamais les écrire**.
- La date d'entrée en vigueur du dépôt payant des voitures (« avril » selon Clubic et Mac4ever,
  année non relue) — **non vérifiée**.

---

## 3. Durée de vie d'une annonce (la question « 60 jours ? »)

L'aide officielle **se contredit** ; ne jamais écrire « une annonce Leboncoin dure 60 jours » comme
règle générale.

| Ce que dit l'aide | Étiquette | Source (09/10) |
|---|---|---|
| « Votre annonce restera **entre 30 et 60 jours** en ligne, selon la catégorie concernée » ; « **Note** : les annonces restent en ligne **en illimité** pour les catégories suivantes : **Loisirs, Maison, Mode, Multimédia, Vacances**. » À l'issue de la période, l'annonce est supprimée automatiquement. | [OFF] | https://assistance.leboncoin.info/hc/fr/articles/360000165849-Combien-de-temps-mon-annonce-reste-t-elle-en-ligne |
| Prolongation : par l'e-mail « Renouvelez gratuitement votre annonce » ou le bouton « Prolonger » ; possible **pendant 28 jours après l'expiration** ; **gratuite sauf Véhicules et Immobilier** ; les options doivent être reconduites ; au-delà de 28 jours, nouvelle annonce (seul le texte est récupérable, pas les photos). La même page parle d'une durée standard de 60 jours hors catégories illimitées. | [OFF] | https://assistance.leboncoin.info/hc/fr/articles/360010374899-Comment-prolonger-la-dur%C3%A9e-de-vie-de-mon-annonce |
| « Dans tous les cas, votre annonce sera automatiquement supprimée **au bout de deux mois**. » (contredit la note « illimité »). | [OFF] | https://assistance.leboncoin.info/hc/fr/articles/360000179269-Comment-supprimer-mon-annonce |
| Une option payante « ne prolonge aucunement la durée de vie initiale » de l'annonce. | [OFF] | article « Combien de temps… » ci-dessus |
| **Mise en pause** : l'annonce n'est plus visible, plus de contact ni d'offre ; pause sans limite de temps ; la durée de vie de l'annonce et des options **continue de courir** ; annonce non modifiable pendant la pause ; jusqu'à 30 annonces mises en pause d'un coup. | [OFF] | https://assistance.leboncoin.info/hc/fr/articles/4407836220562-Comment-mettre-en-pause-mon-annonce |
| Suppression : prise en compte en « quelques minutes » ; une page encore visible = cache du navigateur. Supprimer l'annonce supprime ses options. | [OFF] | https://assistance.leboncoin.info/hc/fr/articles/360000558669-Pourquoi-mon-annonce-est-elle-toujours-visible-alors-que-je-l-ai-supprim%C3%A9e |

**Noms de catégories** : la note « illimité » emploie d'anciens noms (« Maison », « Multimédia ») alors
que l'arbre actuel dit « Maison et jardin » et « Électronique » (§ 6). Correspondance **non vérifiée**.

**Formulation sûre** (guide, vouvoiement) : « La durée de vie d'une annonce Leboncoin dépend de la
catégorie ; l'aide de Leboncoin indique que certaines catégories, dont la Mode, n'ont pas de limite.
La durée exacte s'affiche au moment du dépôt. »

---

## 4. Options payantes (mise en avant)

Toutes **[OFF]**, section « Booster ma visibilité »
https://assistance.leboncoin.info/hc/fr/sections/8479199195154-Booster-ma-visibilit%C3%A9 (09/10).
**Aucun prix n'est donné dans l'aide** : il « dépend de la catégorie » et renvoie à l'onglet « Prix »
des CGV / à `leboncoin.fr/options/prix` (**non lus : 403**).

| Option | Ce qu'elle fait (aide officielle) | Source |
|---|---|---|
| **Remonter en tête de liste** | Remonte l'annonce en haut des résultats (site et applis). Quatre formules : **immédiate** (une fois) ; **7 jours** (une remontée par jour) ; **30 jours** (une par jour) ; **60 jours** (une par semaine « pendant la durée de vie restante de votre annonce (60 jours) »). Ne change pas la durée de diffusion. Paiement : porte-monnaie, carte, Apple Pay, PayPal. | https://assistance.leboncoin.info/hc/fr/articles/360000246349-Comment-remonter-une-annonce-en-t%C3%AAte-de-liste |
| **À la Une** (hors Immobilier) | Emplacement dans la liste de résultats et/ou un espace à droite, logo « À la Une », affichage aléatoire selon les autres annonces qui ont l'option ; **7 ou 30 jours** ; au moins **une photo** ; indisponible pour les demandes et pour Offres d'emploi, Billetterie, Événements, Cours particuliers. En Immobilier, l'équivalent s'appelle « Vitrine ». | https://assistance.leboncoin.info/hc/fr/articles/360000233985-Comment-mettre-mon-annonce-%C3%80-la-Une-hors-Immobilier |
| **Logo Urgent** | Logo « urgent » sur l'annonce + recherche filtrée sur ces annonces ; tarif selon la catégorie ; durée non précisée. | https://assistance.leboncoin.info/hc/fr/articles/360000167105-Comment-ajouter-un-Logo-Urgent |
| **Pack Photos supplémentaires** | +17 photos pour un particulier (catégories à 3 photos gratuites), +5 pour un pro. | https://assistance.leboncoin.info/hc/fr/articles/360000388745-Comment-souscrire-au-Pack-Photos-suppl%C3%A9mentaires |
| **Pack Top Visibilité** | Réservé aux particuliers en **Ventes immobilières** : **89,90 €**, 2 mois, 20 photos, modifications illimitées, remontée hebdomadaire pendant 8 semaines. (Seul prix d'option lu dans l'aide.) | https://assistance.leboncoin.info/hc/fr/articles/28253788482322-Le-Pack-Top-Visibilit%C3%A9 |

Les fourchettes de prix trouvées ailleurs se contredisent (« 0,99 € à 29,99 € » chez margeoapp.com ;
« environ 5 € la remontée, 35 € À la Une 30 jours » chez journaldufreenaute.fr ; 11,90 € à 179,90 €
pour les voitures chez Clubic) — **[TIERS]/[PRESSE] non relus à la source : n'écrire aucun prix**.

---

## 5. Règles de diffusion et modération

### 5.1 Ce qu'une annonce doit respecter [OFF]

Source : « Quelles règles doit respecter mon annonce ? »
https://assistance.leboncoin.info/hc/fr/articles/360000030540-Quelles-r%C3%A8gles-doit-respecter-mon-annonce (09/10).
Les règles complètes (« Règles de diffusion », `leboncoin.fr/dc/rules`) **n'ont pas pu être lues (403)**.

- **Pas de doublon** : « Vous ne pouvez pas déposer une même annonce plusieurs fois sur le site. »
  « chaque annonce doit présenter un titre, une description et des photos uniques » (exceptions
  renvoyées aux Règles de diffusion). Autre article : « les utilisateurs ont toutefois la possibilité
  de déposer une annonce identique **par département** »
  (https://assistance.leboncoin.info/hc/fr/articles/360018949539-Je-ne-suis-pas-autoris%C3%A9-%C3%A0-d%C3%A9poser-une-annonce).
- **Plusieurs exemplaires** : pour vendre plusieurs fois un même produit, « vous devez procéder aux
  ventes une par une, via une nouvelle annonce ».
- **Photos** : « ne pas être déjà utilisées sur une autre de vos annonces » ; refusées : enfants
  mineurs, logos seuls, liens, QR codes, coordonnées, nudité. Formats GIF, BMP, PNG, JPEG ; idéal
  400 Ko à 1 Mo ; uniquement des photos dont vous êtes l'auteur ou libres de droits
  (https://assistance.leboncoin.info/hc/fr/articles/360000157465-Comment-ins%C3%A9rer-des-photos-dans-mon-annonce).
- **Nombre de photos gratuites** : jusqu'à **20** en Location de vacances, Électronique, Maison &
  jardin, Mode, Loisirs, Famille ; **3** en Véhicules, Immobilier, Animaux, Services et autres
  (même article) ; un pro : 5 gratuites.
- **Langue** : « L'annonce doit être rédigée **en français** (obligation légale imposée par la loi
  n°94-345 du 4 août 1994). »
- **Coordonnées** : aucun numéro de téléphone ni adresse e-mail « ni dans le titre, ni dans la
  description, ni sur une photo ».
- **Liens** : « Ne pas rediriger vers un autre site que leboncoin.fr (directement ou indirectement) ».
  → une description recopiée d'une autre plateforme qui renvoie vers un dressing ou une boutique
  ailleurs enfreint cette règle.
- **Localisation** : dans la commune où se trouve le bien, « même si vous proposez la livraison dans
  toute la France ».
- **Catégorie** : celle qui correspond au bien ; elle **ne peut pas être modifiée** après dépôt
  (supprimer et redéposer) — https://assistance.leboncoin.info/hc/fr/articles/360000178389-Comment-modifier-mon-annonce.
- **Pas de HTML** dans le texte ; aucune longueur maximale de titre ou de description n'est donnée
  par l'aide (https://assistance.leboncoin.info/hc/fr/articles/360000170189-Que-mettre-dans-le-texte-de-mon-annonce).
- **Produits interdits** (liste non exhaustive) : tabac, armes, contenus pour adultes, contrefaçons,
  médicaments, appels aux dons…
- **Professionnels** : « Toutes les annonces de **produits neufs** déposées par des professionnels »
  en **Multimédia, Maison, Mode, Loisirs** (sauf Animaux) « seront refusées sur le site ».

### 5.2 Modération [OFF]

- Une **modification** est revalidée « dans un délai de 24h », puis visible dans les 30 minutes ; elle
  ne remet pas l'annonce en tête de liste. La même page dit la modification **gratuite** pour
  vacances, mode, multimédia et loisirs, décoration, linge de maison, arts de la table et immobilier
  (3 annonces / 12 mois) et **payante** ailleurs — alors que l'article sur le dépôt payant dit que
  « la modification de l'annonce n'est pas impactée par cette politique tarifaire ». **Contradiction
  non tranchée** (source : article « Comment modifier mon annonce ? » ci-dessus).
- Aucun délai de vérification d'une **nouvelle** annonce n'est donné par l'aide lue (« quelques
  minutes à 24 h » n'apparaît que sur un site tiers, statut-services.fr : [TIERS]).
- Motifs de refus ou de retrait cités : animaux (chiens et chats), **doublon** (« Il est interdit
  d'avoir plusieurs annonces actives identiques »), activité professionnelle, catégorie réservée aux
  pros, mauvaise catégorie, produit non accepté, **photos en doublon**. Recours : redéposer une annonce
  conforme ou écrire au service client ; une annonce refusée ne peut plus être consultée
  (https://assistance.leboncoin.info/hc/fr/articles/360000112439-Mon-annonce-a-%C3%A9t%C3%A9-refus%C3%A9e-ou-suspendue-que-faire ;
  https://assistance.leboncoin.info/hc/fr/articles/10286163076754-Mon-annonce-est-consid%C3%A9r%C3%A9e-comme-non-conforme-que-faire).
- Dépôt bloqué possible « lorsque nous remarquons des comportements ou des activités suspectes » ;
  « les annonces déposées en double ne sont pas autorisées » (article « Je ne suis pas autorisé… »).

---

## 6. Catégories [OFF]

Article « Modification de l'arbre des catégories » (non daté)
https://assistance.leboncoin.info/hc/fr/articles/14181001891090-Modification-de-l-arbre-des-cat%C3%A9gories :
**13 grandes catégories** — Immobilier, Véhicules, Location de vacances, Emploi, **Mode**, **Famille**,
**Maison et jardin**, **Électronique**, **Loisirs**, Matériel agricole, Services, Animaux, Divers.
Exemples : Mode → Vêtements, Chaussures, Accessoires et bagagerie, Montres et bijoux ; Famille →
Vêtements bébé, Équipement bébé, Mobilier enfant ; Électronique → Jeux vidéo, Tablettes et liseuses,
Accessoires téléphones et objets connectés ; Loisirs → Antiquités, Modélisme, Loisirs créatifs.
D'autres articles de l'aide gardent d'anciens noms (Multimédia, Maison).

---

## 7. Transaction sécurisée (paiement) et livraison

### 7.1 Qui paie quoi [OFF]

| Fait | Source (09/10) |
|---|---|
| « La Transaction sécurisée est **gratuite pour les vendeurs**. » « Vous n'avez aucun frais à avancer, ceux-ci étant pris en charge par l'acheteur. » | https://assistance.leboncoin.info/hc/fr/articles/8864035377938-Vendeur-particulier-combien-co%C3%BBte-la-Transaction-s%C3%A9curis%C3%A9e |
| Frais payés par **l'acheteur** : **0,70 € + 5 % du prix de l'article** en livraison (exemples de l'aide : 10 € → 1,20 € ; 40 € → 2,70 € ; 100 € → 5,70 €) ; en **remise en main propre avec un vendeur particulier : 1,99 € maximum** ; avec un vendeur pro : même calcul qu'en livraison. | https://assistance.leboncoin.info/hc/fr/articles/360000036020 (« Acheteur : combien coûte la Transaction sécurisée ? ») |
| Frais de port à la charge de l'acheteur. | articles « combien coûte le service de livraison » (§ 7.2) |
| La Transaction sécurisée est **activée par défaut** au dépôt (avec la livraison) ; le vendeur peut décocher tous les modes de livraison pour ne garder que la remise en main propre, et la réactiver à tout moment. | https://assistance.leboncoin.info/hc/fr/articles/360016989259-Vendeur-particulier-je-ne-souhaite-pas-passer-par-la-Transaction-s%C3%A9curis%C3%A9e-et-la-livraison-que-faire |
| Ouverte aux particuliers et aux pros ; catégories éligibles : équipements auto, caravaning, moto, nautisme, matériel professionnel, mode, famille, maison et jardin, loisirs, électronique ; **Antiquités exclues** pour Mondial Relay et Shop2Shop ; Colissimo et Courrier suivi : toutes catégories. | https://assistance.leboncoin.info/hc/fr/articles/360002860060-Quelles-sont-les-cat%C3%A9gories-%C3%A9ligibles-%C3%A0-la-Transaction-s%C3%A9curis%C3%A9e-et-%C3%A0-la-livraison |
| « leboncoin n'émet pas de facture suite à une transaction ». | https://assistance.leboncoin.info/hc/fr/articles/360000036000-Comment-fonctionne-la-Transaction-s%C3%A9curis%C3%A9e |

Chiffres **contredits par l'officiel**, à ne pas reprendre : « 0,99 € en main propre » (margeoapp,
sequr), « plafond 2 500 € », « 72 h pour valider » (sequr) — [TIERS]. Aucun plafond de montant de la
transaction elle-même n'est donné par l'aide lue (seuls les transporteurs ont un plafond, § 7.2).

### 7.2 Transporteurs [OFF]

Source : « Vendeur particulier : les critères d'envoi par transporteur (Mondial Relay, Colissimo,
Courrier suivi et Shop2Shop by Chronopost) »
https://assistance.leboncoin.info/hc/fr/articles/4417759780370-Vendeur-particulier-les-crit%C3%A8res-d-envoi-par-transporteur-Mondial-Relay-Colissimo-Courrier-suivi-et-Shop2Shop-by-Chronopost (09/10, non daté).

| Transporteur | Prix de vente max | Poids max | Dimensions | Délai annoncé |
|---|---|---|---|---|
| **Mondial Relay** (point relais) | **2 000 €** | 25 kg | L ≤ 120 cm ; L+l+h ≤ 150 cm | 3 à 5 jours ouvrés |
| Mondial Relay Locker / domicile | non précisé | 25 kg | 64 × 40 × 38 cm | non précisé |
| **Colissimo** | **400 €** | 5 kg (boîte aux lettres) ; 30 kg (point de contact) | L ≤ 100 cm ; L+l+h ≤ 150 cm | environ 48 h (2 jours ouvrés) |
| **Courrier suivi** | **400 €** | 2 kg | épaisseur ≤ 3 cm | environ 48 h (2 jours ouvrés) |
| **Shop2Shop by Chronopost** | **2 000 €** | 20 kg | L < 100 cm ; L + 2l + 2h ≤ 250 cm | 2 à 4 jours ouvrés ; pas en Corse |

- La page de tarifs Mondial Relay (https://assistance.leboncoin.info/hc/fr/articles/4507409140882-Vendeur-particulier-combien-co%C3%BBte-le-service-de-livraison-par-Mondial-Relay)
  a une tranche « 10–30 kg » : **contredit les 25 kg** ci-dessus. Les tarifs varient selon la
  catégorie (grille « Mode » moins chère). Pages non datées → **ne publier aucun tarif de port**.
- Courrier suivi : « le prix de l'article ne doit pas être supérieur à 400 € » ; jusqu'à 2 kg
  (https://assistance.leboncoin.info/hc/fr/articles/360017454440-Vendeur-particulier-combien-co%C3%BBte-le-service-de-livraison-par-Courrier-suivi).
- **Assurance** incluse : Mondial Relay et Shop2Shop — prix de l'article sous 400 €, **plafonnée à
  400 €** entre 400 et 2 000 € ; Colissimo — jusqu'à 23 € par kilo ; assurance plus élevée possible
  en envoi personnalisé (« Autres moyens de livraison ») —
  https://assistance.leboncoin.info/hc/fr/articles/6213417017490-Vendeur-particulier-le-produit-envoy%C3%A9-peut-il-%C3%AAtre-assur%C3%A9.

### 7.3 Déroulé d'une vente avec livraison [OFF]

- Le vendeur a **48 h après le paiement** pour confirmer la disponibilité ; sinon annulation
  automatique (https://assistance.leboncoin.info/hc/fr/articles/4417752277266-Vendeur-particulier-comment-confirmer-la-disponibilit%C3%A9-du-produit-et-d%C3%A9clencher-la-vente ;
  même délai dans https://assistance.leboncoin.info/hc/fr/articles/360009934580-Vendeur-particulier-les-%C3%A9tapes-d-une-vente-avec-la-Transaction-s%C3%A9curis%C3%A9e-et-la-livraison).
  **Contradiction** : l'article sur le délai d'envoi dit « 3 jours pour confirmer la disponibilité »,
  puis « **6 jours pour envoyer le colis** », sinon annulation automatique
  (https://assistance.leboncoin.info/hc/fr/articles/4417759842962-Vendeur-particulier-quel-est-le-d%C3%A9lai-pour-envoyer-mon-colis).
- L'acheteur a **3 jours** pour confirmer que tout est conforme ; sans action, la transaction se
  clôture « automatiquement sous 30 jours maximum » ; le paiement est débloqué à la confirmation de
  conformité (article « les étapes d'une vente… » ci-dessus).
- Les paiements arrivent dans le **porte-monnaie leboncoin**, utilisable pour acheter ou à virer vers
  son compte bancaire à tout moment ; retenue possible pendant des vérifications (identité, IBAN)
  (https://assistance.leboncoin.info/hc/fr/articles/4417741146642-Vendeur-particulier-quand-vais-je-recevoir-mon-paiement).
- **Achat en lot** : déclenché par l'acheteur (plusieurs annonces du même vendeur), le vendeur ne peut
  ni le lancer ni le désactiver ; lot non modifiable (un article manquant = annuler tout) ; un seul
  colis ; incompatible avec le Courrier suivi et la livraison personnalisée ; port = celui de l'article
  le plus lourd ; réductions activables à 2, 3 et 5 articles
  (https://assistance.leboncoin.info/hc/fr/articles/9741136090002-Vendeur-particulier-comment-vendre-et-envoyer-un-lot).

---

## 8. Remise en main propre [OFF]

- Proposée par défaut avec la livraison ; on peut ne garder qu'elle (§ 7.1).
- Avec Transaction sécurisée : l'acheteur paie, le vendeur confirme la disponibilité **sous 48 h**,
  rendez-vous fixé par la messagerie, l'acheteur vérifie l'objet et **déclenche le paiement dans la
  messagerie** le jour du rendez-vous ; remise non faite : montant versé automatiquement **30 jours**
  après la confirmation, sauf annulation
  (https://assistance.leboncoin.info/hc/fr/articles/4404460211090-Vendeur-particulier-les-%C3%A9tapes-d-une-vente-avec-la-Transaction-s%C3%A9curis%C3%A9e-et-la-remise-en-main-propre).
- Fonds : environ **48 h ouvrées** pour un paiement par carte ; « quasi immédiatement » s'il est payé
  depuis le porte-monnaie leboncoin (article « quand vais-je recevoir mon paiement ? »).
- Frais acheteur : 1,99 € maximum avec un vendeur particulier (§ 7.1).
- « la Transaction sécurisée avec remise en main propre **n'est pas accessible pour les vendeurs
  professionnels** » (article « Comment fonctionne la Transaction sécurisée ? »).
- Une remise payée hors Transaction sécurisée n'est pas couverte par sa protection — affirmé par des
  sites tiers seulement ([TIERS]) ; l'aide lue ne le dit pas en ces termes.

---

## 9. Compte particulier ou compte Pro [OFF]

- « La création du Compte Pro est **gratuite et obligatoire pour les professionnels** pour déposer des
  annonces. » Critères donnés par l'aide : « Vous vendez des objets **achetés dans l'optique de les
  revendre** et non pour votre usage personnel » ; « Vous vendez **régulièrement un volume important**
  d'objets » ; « Les ventes réalisées vous permettent de générer des bénéfices et de dégager un revenu
  substantiel » ; aussi la revente d'objets fabriqués soi-même
  (https://assistance.leboncoin.info/hc/fr/articles/360000031759-La-cr%C3%A9ation-d-un-compte-Pro-est-elle-obligatoire).
- Le Compte Pro donne une interface de gestion, des statistiques par annonce (apparitions,
  consultations, favoris, messages, clics sur le numéro), une même option appliquée à plusieurs
  annonces en une opération, un paiement par crédits (carte bancaire)
  (https://assistance.leboncoin.info/hc/fr/articles/360000031739-Qu-est-ce-qu-un-compte-Pro).
- Différences relevées ailleurs dans l'aide : pas de Transaction sécurisée en main propre (§ 8) ;
  produits neufs refusés en Multimédia, Maison, Mode, Loisirs (§ 5.1) ; dépôt payant dans une liste
  de rubriques (§ 2.1) ; 5 photos gratuites (§ 5.1). Prix des abonnements Pro : **non lus**.
- **Fiscalité (DAC7)** : leboncoin transmet chaque année l'historique des transactions à
  l'administration fiscale quand un vendeur atteint, sur une année civile, **au moins 30 transactions
  finalisées ou 2 000 €** ; « la transmission des informations à l'administration fiscale n'implique
  pas forcément de taxation » ; les biens **achetés ou fabriqués pour la revente** relèvent des
  **BIC** ; meubles, électroménager, automobile (hors collection) exonérés ; autres biens imposables
  à 36,2 % si plus-value et prix > 5 000 €
  (https://assistance.leboncoin.info/hc/fr/articles/7970460300562-Vendeur-particulier-quelles-sont-mes-obligations-fiscales-quand-je-vends-sur-leboncoin).

---

## 10. Blocage de compte [OFF]

Source : « Mon compte est bloqué, que faire ? »
https://assistance.leboncoin.info/hc/fr/articles/360021498740-Mon-compte-est-bloqu%C3%A9-que-faire (09/10).

- Motifs cités : « une activité inhabituelle ou jugée risquée sur votre compte », « un comportement non
  conforme aux règles du site », « une suspicion de fraude ou de contournement du système », « un
  incident technique ponctuel ».
- Vérification manuelle « **7 jours ouvrés en moyenne** » pour un blocage de sécurité ou de fraude ;
  durée indiquée dans l'e-mail pour un blocage temporaire ; ne pas créer de nouveau compte ; les fonds
  restent sécurisés ; leboncoin n'appelle jamais au sujet d'un blocage.
- L'aide **ne parle pas explicitement** des outils automatisés dans cet article.

---

## 11. Ce que disent les textes de Leboncoin sur les outils automatisés

**Le texte qui ferait foi — les CGU de leboncoin.fr (`https://www.leboncoin.fr/dc/cgu`) — n'a pas pu
être lu le 09/10 (HTTP 403).** Ce qui suit est tout ce que nous avons pu établir ; aucune
interprétation juridique n'est donnée ici.

1. **robots.txt officiel** [OFF], https://www.leboncoin.fr/robots.txt, lu le 09/10/2026 :
   > « It's forbidden to use search robots or other automatic methods to access Leboncoin.fr. »
   > « Access is only permitted with special permission from Leboncoin.fr. »

   Le même fichier ouvre l'accès à des agents nommés (Googlebot, Bingbot, OAI-SearchBot,
   ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot…) hors sections protégées (comptes,
   messages, profils) et ferme Bytespider.
2. **CGU de leboncoin.fr — clause « robot »** [INDIRECT] : reproduite par un commentaire du
   **29/05/2017** sur LinuxFr (art. 6.2 de la version d'alors) et retrouvée par l'index de recherche
   dans les **CGV Pro datées du 05/09/2022** (https://www.leboncoin.fr/dc/cgv_pro, page non lue,
   403). Tout utilisateur s'engage à ne pas :
   > « utiliser ou interroger le Service LEBONCOIN pour le compte ou au profit d'autrui ; »
   > « extraire, à des fins commerciales ou non, tout ou partie des informations ou des petites
   > Annonces présentes sur le Service LEBONCOIN… »
   > « utiliser un robot, notamment d'exploration (spider), une application de recherche ou
   > récupération de sites Internet ou tout autre moyen permettant de récupérer ou d'indexer tout ou
   > partie du contenu du Site Internet et des Applications, excepté en cas d'autorisation expresse
   > et préalable de LBC France ; »

   Sources : https://linuxfr.org/news/cheky (commentaire du 29/05/2017) ; résultat de recherche
   pointant https://www.leboncoin.fr/dc/cgv_pro (09/10). Les CGV Pro posent aussi que, « sauf accord
   préalable et exprès de LBC FRANCE, l'Annonceur ne peut utiliser le Service leboncoin pour diffuser
   des Annonces au nom et/ou pour le compte d'un tiers » [INDIRECT]. **Version en vigueur, numéro
   d'article et rédaction actuelle : non vérifiés.**
3. **CGU de la Communauté leboncoin** [OFF-daté], version du **17/05/2021**,
   https://static.communaute.leboncoin.info/cgu.html (lu le 09/10) — elles régissent l'espace
   communautaire, pas le site d'annonces : art. 5.1, interdiction d'« extraire, dupliquer, copier ou
   exploiter de quelque manière que ce soit, notamment par l'intermédiaire de robots » des données ou
   contenus sans autorisation écrite ; art. 6.2, interdiction d'« utiliser un robot, notamment
   d'exploration (spider) » sans autorisation expresse et préalable.
4. **Jurisprudence** [PRESSE juridique] : **Cour d'appel de Paris, 2 février 2021, n° 17/17688,
   LBC France c/ Entreparticuliers.com** — protection de la base (et de la sous-base « immobilier »)
   de leboncoin au titre du droit *sui generis* des bases de données contre l'extraction et la
   réutilisation d'annonces ; 50 000 € (préjudice financier) + 20 000 € (préjudice d'image). Source :
   CMS Francis Lefebvre, 28/04/2021,
   https://cms.law/fr/fra/news-information/arret-leboncoin-web-scraping-droit-sui-generis-sur-les-bases-de-donnees.
5. **Aide officielle** : blocage possible pour « activité inhabituelle » ou « contournement du système »
   (§ 10) et dépôt bloqué en cas de « comportements ou activités suspectes » (§ 5.2).

**Lecture prudente pour nos textes** : les textes lus visent d'abord l'accès automatisé,
l'extraction et l'indexation du contenu ; ils ne nomment pas, dans ce que nous avons lu, la
publication de ses propres annonces depuis un outil — **mais nous n'avons pas lu les CGU en vigueur**,
et la clause « pour le compte ou au profit d'autrui » est large. Conséquence : **aucune page FillSell
ne qualifie la conformité aux CGU de Leboncoin**, ni dans un sens ni dans l'autre. À faire lire par
Nico (ou un juriste) dans un navigateur, texte en vigueur sous les yeux, avant la page
`/securite-des-comptes`.

---

## 12. Depuis l'étranger, en anglais (pour `/en/platforms/leboncoin` et le guide anglais) [OFF]

- « Depuis l'étranger, certaines fonctionnalités leboncoin ne sont pas accessibles » : **dépôt
  d'annonce impossible**, achat par Transaction sécurisée indisponible, messagerie indisponible sauf
  conversations commencées depuis la France ; « leboncoin n'étant pas conçu pour un usage à
  l'international » ; recherche et consultation possibles
  (https://assistance.leboncoin.info/hc/fr/articles/8191993696146-Je-souhaite-utiliser-leboncoin-depuis-l-%C3%A9tranger).
- L'annonce doit être **rédigée en français** (loi n° 94-345 du 4 août 1994) (§ 5.1).
→ Le public anglophone servable est celui qui **vit en France** (cohérent avec `PLAN.md` § 1.6).

---

## 13. FillSell et Leboncoin (uniquement d'après la fiche de vérité)

Source unique : `docs/seo/etat-des-lieux/03-fiche-de-verite.md` (corrections de contre-vérification
comprises). Formulations au **tutoiement** (pages produit) ; les guides du blog les passent au
vouvoiement sans changer le fond.

| Ce que FillSell fait sur Leboncoin | Comment | Geste de la personne | Limites | Réf. |
|---|---|---|---|---|
| Se brancher à Leboncoin | **Par l'extension Chrome, dans la session Leboncoin déjà ouverte** dans le navigateur de la personne. FillSell ne passe par aucune API pour Leboncoin : l'API officielle n'est utilisée que pour eBay relié. | Se connecter soi-même à Leboncoin sur son ordinateur ; installer l'extension (Chrome Web Store, gratuite). | FillSell ne demande ni ne stocke le mot de passe Leboncoin. Ne rien écrire sur les cookies (C22). Chrome seulement (Edge non annoncé). | F05, F06, F07, F11, F31 |
| Rédiger l'annonce Leboncoin | Le scan Lens (ou la rédaction de l'app) écrit une version par plateforme, dont Leboncoin ; prix conseillé par recherche web d'annonces comparables (Vinted d'abord, puis eBay, Leboncoin). | Relire et corriger avant de publier. | Mode « annonce » derrière l'interrupteur `lens_unifie` (même résultat en deux temps). Pas de prix garanti. | F15, F19 |
| Publier sur Leboncoin | Cocher Leboncoin ; l'extension remplit le formulaire ; catégorie, taille, couleur, colis adaptés ; champ manquant ou rayon introuvable → une question en français. | Cocher la plateforme ; répondre aux questions. | **Une annonce à la fois, 8 à 20 s d'écart, et une seule à la fois par compte Leboncoin.** Leboncoin vérifie les nouvelles annonces : elles peuvent mettre un moment à apparaître ; un dépôt jamais vu en ligne compte comme un échec. | F24, F25, F28, F29 |
| Ne jamais payer d'option | L'extension ne valide jamais « Valider et payer ». | — | Vérifié partiellement (doc interne). | F30 |
| Publier en lot | Jusqu'à 20 articles d'un coup, dont Leboncoin. | Choisir les articles et les plateformes, vérifier. | Dans le quota du mois (chaque article rédigé par l'IA compte une annonce). Aucun chiffre de quota hors carte tarifs. | F26, F27 |
| Exiger l'ordinateur allumé | Publication, republication, retrait, détection des ventes Leboncoin : ordinateur allumé, Chrome ouvert, extension active, session Leboncoin ouverte ; l'extension empêche la veille tant qu'il reste du travail (4 h au plus). | Laisser l'ordinateur allumé. | Éteint : tout attend en file ; un dépôt en attente plus de 10 jours passe en échec (« Relancer ») ; republication refusée si l'extension n'a pas été vue depuis 7 jours. | F09, F10 |
| Importer le stock Leboncoin | Sur appui de « Synchroniser » seulement ; lit, ne publie ni ne modifie ; une seule fiche par article (photos ET titre, jamais le titre seul ; doute → « Annonces à vérifier »). | Appuyer sur « Synchroniser ». | Plateforme lue il y a moins de 15 min non relue ; relevé multiplateforme derrière `sync_multi_ouverte` (non relu en base). Aucun quota sur l'import. | F33, F34, F35 |
| Republier sur Leboncoin | **Retirer puis redéposer** : nouvelle annonce, vues et favoris perdus, effet irréversible ; pas deux fois la même annonce en 24 h. **Ce n'est pas l'option payante « Remonter en tête de liste ».** | Un appui (tous paliers) ; en lot (payants). | Leboncoin passe par l'interrupteur `republication_multi_ouverte` (non relu en base). Automatique par créneaux : Pro et Business, ancienneté ≥ 7 jours ; **ouverture de Leboncoin en automatique non relue en base (C12)** → ne pas l'écrire. Plafonds et pauses de sécurité. | F37, F38, F39, F40 |
| Repérer une vente Leboncoin | L'extension relit les annonces publiées (au plus toutes les 2 h, après un délai de grâce) et, pour les comptes payants, la liste des commandes Leboncoin toutes les 10 min. | — | Délai réel non mesuré : **aucun délai chiffré**. Ordinateur allumé. | F42 |
| Enregistrer la vente Leboncoin | **Non, pas toute seule** : la lecture « vendue » sur Leboncoin reste un signal ; la vente attend l'appui de la personne (« Vendue sur Leboncoin ? »). | **Confirmer d'un appui.** | Sans preuve, jamais une vente. | F43, C01 (nuancée) |
| Retirer les autres annonces de l'article | Une fois la vente **confirmée** : retrait automatique des copies liées par une preuve ; sinon question « Déjà vendu ? ». Retrait Leboncoin par l'extension. | Confirmer la vente ; répondre à « Déjà vendu ? ». | Ordinateur allumé ; retrait définitif. | F44, C24 |
| Prévenir par e-mail | **Pas de mail pour une vente Leboncoin** (le mail ne part que pour une vente enregistrée par FillSell, soit Vinted et eBay). | — | — | F45 |
| Afficher les ventes | Bandeau « Vendue sur X » à l'ouverture de l'app. | Ouvrir l'app. | Vérifié partiellement ; push inactif pour le public. | F46, F47 |
| Remettre en vente un article à plusieurs exemplaires | Après une vente qui clôt l'annonce, republie le même contenu sur la plateforme où il s'est vendu. | — | Seulement pour une annonce **déposée par FillSell** ; compte comme une republication. | F41 |

**Formulations sûres, reprises de la fiche** :
- « Tu restes connecté(e) à Leboncoin dans ton navigateur, comme d'habitude, et l'extension travaille
  dans cette session. FillSell ne te demande jamais ton mot de passe Leboncoin. » (F11)
- « Leboncoin vérifie les nouvelles annonces : elles peuvent mettre un moment à apparaître. » (F29)
- « FillSell ne souscrit jamais d'option payante à ta place. » (F30)
- « L'extension publie tes annonces une à une, à un rythme humain. » (F28)
- « Republier, c'est retirer l'annonce puis la remettre en ligne : elle repart en haut des résultats,
  mais ses vues et ses favoris repartent de zéro. » (F37)
- « Quand Vinted ou eBay marque ton article vendu, FillSell enregistre la vente tout seul. Sur
  Leboncoin et Beebs, il te demande de confirmer d'un appui. » (F43)
- « Dès qu'une vente est enregistrée, FillSell retire les autres annonces de l'article. S'il n'est pas
  certain qu'une annonce est le même article, il te demande « Déjà vendu ? » avant d'y toucher. » (F44)

**Ce que la fiche de vérité ne dit pas sur Leboncoin — ne rien écrire tant que ce n'est pas versé à
la fiche** : quels transporteurs FillSell coche ; s'il active ou non la Transaction sécurisée ;
format de colis et poids envoyés ; adresse / commune de l'annonce ; nombre de photos envoyées à
Leboncoin (Lens en lit 5, la fiche les garde toutes) ; langue de l'annonce pour un utilisateur de
l'app en anglais ; prise en charge d'un **compte Pro** Leboncoin ou de plusieurs comptes Leboncoin ;
traitement d'un **achat en lot** Leboncoin ; comportement face au refus « doublon » de Leboncoin lors
d'une republication. (Le dépôt de travail mentionne des règles internes sur les colis et les
transporteurs Leboncoin — `CLAUDE.md`, « Défauts clients 04/10 » et « 05/10 » — mais elles ne sont pas
dans la fiche : à faire vérifier et verser avant usage.)

---

## 14. Dix faits citables (courts, exacts, sourcés — lus le 09/10/2026)

1. **Le dépôt d'annonce est gratuit pour les particuliers**, sauf dans certaines sous-catégories
   Véhicules et Immobilier (ex. : 2 annonces de voitures ou d'utilitaires gratuites par période de
   12 mois). — https://assistance.leboncoin.info/hc/fr/articles/25251056454418-Pourquoi-mon-d%C3%A9p%C3%B4t-d-annonce-est-il-payant
2. **La Transaction sécurisée est gratuite pour le vendeur** : les frais sont payés par l'acheteur. —
   https://assistance.leboncoin.info/hc/fr/articles/8864035377938-Vendeur-particulier-combien-co%C3%BBte-la-Transaction-s%C3%A9curis%C3%A9e
3. **L'acheteur paie 0,70 € + 5 % du prix** en livraison (2,70 € pour un article à 40 €), et 1,99 €
   au plus en remise en main propre avec un particulier. — https://assistance.leboncoin.info/hc/fr/articles/360000036020
4. **Colissimo et Courrier suivi : ventes jusqu'à 400 € ; Mondial Relay et Shop2Shop by Chronopost :
   jusqu'à 2 000 €.** — https://assistance.leboncoin.info/hc/fr/articles/4417759780370-Vendeur-particulier-les-crit%C3%A8res-d-envoi-par-transporteur-Mondial-Relay-Colissimo-Courrier-suivi-et-Shop2Shop-by-Chronopost
5. **Après un achat, le vendeur a 48 h pour confirmer que l'article est disponible**, sinon la vente
   est annulée automatiquement. — https://assistance.leboncoin.info/hc/fr/articles/4417752277266-Vendeur-particulier-comment-confirmer-la-disponibilit%C3%A9-du-produit-et-d%C3%A9clencher-la-vente
6. **Jusqu'à 20 photos gratuites** par annonce en Mode, Famille, Maison & jardin, Électronique,
   Loisirs et Location de vacances (3 en Véhicules, Immobilier, Animaux, Services). —
   https://assistance.leboncoin.info/hc/fr/articles/360000157465-Comment-ins%C3%A9rer-des-photos-dans-mon-annonce
7. **Une annonce Leboncoin doit être rédigée en français** (loi n° 94-345 du 4 août 1994) et localisée
   dans la commune où se trouve l'objet. — https://assistance.leboncoin.info/hc/fr/articles/360000030540-Quelles-r%C3%A8gles-doit-respecter-mon-annonce
8. **Pas deux fois la même annonce** : chaque annonce doit avoir un titre, une description et des
   photos uniques, et une photo ne doit pas déjà servir à une autre de vos annonces. — même source
   que 7
9. **Leboncoin transmet l'historique de vos transactions au fisc dès 30 transactions finalisées ou
   2 000 € sur une année civile** — ce qui n'implique pas forcément d'impôt. — https://assistance.leboncoin.info/hc/fr/articles/7970460300562-Vendeur-particulier-quelles-sont-mes-obligations-fiscales-quand-je-vends-sur-leboncoin
10. **Acheter pour revendre, régulièrement et en volume : Leboncoin demande un compte Pro**, gratuit
    à créer et obligatoire pour les professionnels. — https://assistance.leboncoin.info/hc/fr/articles/360000031759-La-cr%C3%A9ation-d-un-compte-Pro-est-elle-obligatoire

(Hors des dix, utiles par page : remontée en tête de liste en 4 formules, § 4 ; dépôt impossible
depuis l'étranger, § 12 ; achat en lot déclenché par l'acheteur, § 7.3.)

---

## 15. Pièges : ce qu'il ne faut PAS affirmer

**Sur Leboncoin**
- « Une annonce Leboncoin dure 60 jours » comme règle générale (l'aide se contredit ; la Mode serait
  sans limite) ; « illimité » sans préciser la catégorie non plus.
- Un nombre d'annonces gratuites hors Véhicules et Immobilier (« 50 », « 7 », « 5 à 10 par mois ») :
  aucun n'est officiel.
- Un prix d'option (remontée, À la Une, Urgent) ou de port : grille officielle non lue, pages d'aide
  non datées, chiffres tiers contradictoires.
- « Leboncoin prend une commission au vendeur » (faux pour la Transaction sécurisée) ; « 0,99 € en
  main propre », « 72 h pour valider », « plafond 2 500 € » (tiers, contredits par l'aide).
- « Le paiement sécurisé est obligatoire » (il se désactive) ; « la protection couvre une remise payée
  en espèces ».
- « Tu peux publier ton annonce en anglais » / « déposer depuis l'étranger » (français obligatoire ;
  dépôt impossible hors de France).
- « Leboncoin interdit de publier le même article sur Vinted / eBay / Beebs » — rien de tel dans ce
  que nous avons lu ; l'interdit porte sur les doublons **sur Leboncoin**. Mais ne pas écrire non plus
  « Leboncoin l'autorise » : nous n'avons pas lu les CGU en vigueur.
- Chiffres d'audience non datés ou de blog (« 28 M d'utilisateurs actifs », « 90 M d'annonces ») :
  n'écrire que « 30 millions de visiteurs mensuels (leboncoin, mars 2026) ».
- Citer un forum (Que Choisir, Dealabs, Reddit, Custplace) comme preuve d'une règle.

**Sur les outils et le compte**
- « Autorisé par Leboncoin », « conforme aux CGU de Leboncoin », « validé », « partenaire officiel »,
  « API Leboncoin » (FillSell n'en utilise pas ; l'API officielle, c'est eBay). Mention à garder :
  « FillSell n'est affilié à aucune de ces plateformes ».
- « Indétectable », « Leboncoin ne voit pas la différence », « zéro risque », « ton compte ne sera
  jamais bloqué », « contourne la modération ».
- Mots bannis (fiche § 15) : bot, robot, temps réel, 100 % automatique, publié partout en même temps,
  retrait automatique partout, un e-mail à chaque vente. L'ancien article de blog dit « cadence de
  robot » : à ne pas reprendre.
- Logo Leboncoin : `PLAN.md` n'interdit que ceux de Vinted et d'eBay sans autorisation écrite ; par
  prudence, Leboncoin en **texte seulement** (recommandation, pas un fait).

**Sur FillSell et Leboncoin**
- « FillSell enregistre tes ventes Leboncoin tout seul », « retire tout seul tes autres annonces dès
  que ça se vend sur Leboncoin », « tu reçois un e-mail à chaque vente Leboncoin » (F43, F44, F45 :
  faux).
- « Le retrait attend toujours ta confirmation » sans préciser : vrai pour Leboncoin et Beebs, faux
  pour Vinted et eBay (C01 nuancée).
- « FillSell remonte tes annonces en tête de liste » : confusion avec l'option payante ; dire
  « republier = retirer puis remettre en ligne » (F37), et FillSell n'achète jamais d'option (F30).
- « Republication automatique sur Leboncoin » tant que `republish_planifiee_pf_*` n'est pas relu en
  base (F39, C12) ; « sans perdre tes favoris » (F37).
- « Publié sur Leboncoin en même temps que partout » / « en ligne immédiatement » (F28, F29, C23).
- « Même ordinateur éteint » pour Leboncoin (F09) ; tout délai de détection chiffré (F42).
- « FillSell gère les comptes Pro Leboncoin », « plusieurs comptes Leboncoin », « les ventes en lot
  Leboncoin », « choisit le meilleur transporteur » : absent de la fiche.
- Volumes de quota ou de republication dans une page Leboncoin : seulement sur la carte tarifs
  (`PLAN.md` § 2).
- Opla, Depop, FillSell Cloud : jamais nommés.

---

## 16. Non vérifié — à relire par un humain dans un navigateur avant publication

- **CGU en vigueur** `https://www.leboncoin.fr/dc/cgu` : date de version, numéro et texte exact de la
  clause « robot » et de la clause « pour le compte ou au profit d'autrui » ; présence éventuelle d'une
  clause sur les outils de publication.
- **Règles de diffusion** `https://www.leboncoin.fr/dc/rules` : exceptions aux doublons, règles photos.
- **CGV** `https://www.leboncoin.fr/dc/cgv` (onglet « Prix ») et `https://www.leboncoin.fr/options/prix` :
  prix des options et du dépôt payant.
- Contradictions internes de l'aide : durée de vie (30–60 j / 60 j / deux mois / illimité),
  confirmation de disponibilité (48 h / 3 jours), poids Mondial Relay (25 / 30 kg), gratuité de la
  modification, seuils Immobilier (texte / tableau).
- Montants éligibles au paiement PayPal en quatre fois (30 à 2 000 € selon la presse).
- Date d'entrée en vigueur du dépôt payant des voitures et utilitaires.
- Abonnements et prix du Compte Pro.

---

## 17. Sources (toutes consultées le 2026-10-09)

**Officielles — aide leboncoin** (`assistance.leboncoin.info`, articles non datés) :
- https://assistance.leboncoin.info/hc/fr (accueil, liste des rubriques)
- https://assistance.leboncoin.info/hc/fr/articles/25251056454418-Pourquoi-mon-d%C3%A9p%C3%B4t-d-annonce-est-il-payant
- https://assistance.leboncoin.info/hc/fr/articles/360000165649-Combien-co%C3%BBte-le-d%C3%A9p%C3%B4t-d-une-annonce
- https://assistance.leboncoin.info/hc/fr/articles/360000165849-Combien-de-temps-mon-annonce-reste-t-elle-en-ligne
- https://assistance.leboncoin.info/hc/fr/articles/360010374899-Comment-prolonger-la-dur%C3%A9e-de-vie-de-mon-annonce
- https://assistance.leboncoin.info/hc/fr/articles/360000179269-Comment-supprimer-mon-annonce
- https://assistance.leboncoin.info/hc/fr/articles/360000558669-Pourquoi-mon-annonce-est-elle-toujours-visible-alors-que-je-l-ai-supprim%C3%A9e
- https://assistance.leboncoin.info/hc/fr/articles/4407836220562-Comment-mettre-en-pause-mon-annonce
- https://assistance.leboncoin.info/hc/fr/articles/360000178389-Comment-modifier-mon-annonce
- https://assistance.leboncoin.info/hc/fr/sections/8479199195154-Booster-ma-visibilit%C3%A9
- https://assistance.leboncoin.info/hc/fr/articles/360000246349-Comment-remonter-une-annonce-en-t%C3%AAte-de-liste
- https://assistance.leboncoin.info/hc/fr/articles/360000233985-Comment-mettre-mon-annonce-%C3%80-la-Une-hors-Immobilier
- https://assistance.leboncoin.info/hc/fr/articles/360000167105-Comment-ajouter-un-Logo-Urgent
- https://assistance.leboncoin.info/hc/fr/articles/360000388745-Comment-souscrire-au-Pack-Photos-suppl%C3%A9mentaires
- https://assistance.leboncoin.info/hc/fr/articles/28253788482322-Le-Pack-Top-Visibilit%C3%A9
- https://assistance.leboncoin.info/hc/fr/articles/360000030540-Quelles-r%C3%A8gles-doit-respecter-mon-annonce
- https://assistance.leboncoin.info/hc/fr/articles/360000157465-Comment-ins%C3%A9rer-des-photos-dans-mon-annonce
- https://assistance.leboncoin.info/hc/fr/articles/360000170189-Que-mettre-dans-le-texte-de-mon-annonce
- https://assistance.leboncoin.info/hc/fr/articles/360000112439-Mon-annonce-a-%C3%A9t%C3%A9-refus%C3%A9e-ou-suspendue-que-faire
- https://assistance.leboncoin.info/hc/fr/articles/10286163076754-Mon-annonce-est-consid%C3%A9r%C3%A9e-comme-non-conforme-que-faire
- https://assistance.leboncoin.info/hc/fr/articles/360018949539-Je-ne-suis-pas-autoris%C3%A9-%C3%A0-d%C3%A9poser-une-annonce
- https://assistance.leboncoin.info/hc/fr/articles/14181001891090-Modification-de-l-arbre-des-cat%C3%A9gories
- https://assistance.leboncoin.info/hc/fr/articles/360000036000-Comment-fonctionne-la-Transaction-s%C3%A9curis%C3%A9e
- https://assistance.leboncoin.info/hc/fr/articles/360000036020 (Acheteur : combien coûte la Transaction sécurisée ?)
- https://assistance.leboncoin.info/hc/fr/articles/8864035377938-Vendeur-particulier-combien-co%C3%BBte-la-Transaction-s%C3%A9curis%C3%A9e
- https://assistance.leboncoin.info/hc/fr/articles/360002860060-Quelles-sont-les-cat%C3%A9gories-%C3%A9ligibles-%C3%A0-la-Transaction-s%C3%A9curis%C3%A9e-et-%C3%A0-la-livraison
- https://assistance.leboncoin.info/hc/fr/articles/360016989259-Vendeur-particulier-je-ne-souhaite-pas-passer-par-la-Transaction-s%C3%A9curis%C3%A9e-et-la-livraison-que-faire
- https://assistance.leboncoin.info/hc/fr/articles/360009934580-Vendeur-particulier-les-%C3%A9tapes-d-une-vente-avec-la-Transaction-s%C3%A9curis%C3%A9e-et-la-livraison
- https://assistance.leboncoin.info/hc/fr/articles/4404460211090-Vendeur-particulier-les-%C3%A9tapes-d-une-vente-avec-la-Transaction-s%C3%A9curis%C3%A9e-et-la-remise-en-main-propre
- https://assistance.leboncoin.info/hc/fr/articles/4417752277266-Vendeur-particulier-comment-confirmer-la-disponibilit%C3%A9-du-produit-et-d%C3%A9clencher-la-vente
- https://assistance.leboncoin.info/hc/fr/articles/4417759842962-Vendeur-particulier-quel-est-le-d%C3%A9lai-pour-envoyer-mon-colis
- https://assistance.leboncoin.info/hc/fr/articles/4417741146642-Vendeur-particulier-quand-vais-je-recevoir-mon-paiement
- https://assistance.leboncoin.info/hc/fr/articles/4417759780370-Vendeur-particulier-les-crit%C3%A8res-d-envoi-par-transporteur-Mondial-Relay-Colissimo-Courrier-suivi-et-Shop2Shop-by-Chronopost
- https://assistance.leboncoin.info/hc/fr/articles/4507409140882-Vendeur-particulier-combien-co%C3%BBte-le-service-de-livraison-par-Mondial-Relay
- https://assistance.leboncoin.info/hc/fr/articles/360017454440-Vendeur-particulier-combien-co%C3%BBte-le-service-de-livraison-par-Courrier-suivi
- https://assistance.leboncoin.info/hc/fr/articles/6213417017490-Vendeur-particulier-le-produit-envoy%C3%A9-peut-il-%C3%AAtre-assur%C3%A9
- https://assistance.leboncoin.info/hc/fr/articles/9741136090002-Vendeur-particulier-comment-vendre-et-envoyer-un-lot
- https://assistance.leboncoin.info/hc/fr/articles/360000031759-La-cr%C3%A9ation-d-un-compte-Pro-est-elle-obligatoire
- https://assistance.leboncoin.info/hc/fr/articles/360000031739-Qu-est-ce-qu-un-compte-Pro
- https://assistance.leboncoin.info/hc/fr/articles/7970460300562-Vendeur-particulier-quelles-sont-mes-obligations-fiscales-quand-je-vends-sur-leboncoin
- https://assistance.leboncoin.info/hc/fr/articles/360021498740-Mon-compte-est-bloqu%C3%A9-que-faire
- https://assistance.leboncoin.info/hc/fr/articles/8191993696146-Je-souhaite-utiliser-leboncoin-depuis-l-%C3%A9tranger
- https://assistance.leboncoin.info/hc/fr/articles/4404431666834 (mentions légales)

**Officielles — autres** :
- https://www.leboncoin.fr/robots.txt (lu)
- https://static.communaute.leboncoin.info/cgu.html (CGU de la Communauté, version du 17/05/2021, lu)
- https://presse.leboncoincorporate.com/corporate.html ; https://presse.leboncoincorporate.com/actualites/ ;
  https://presse.leboncoincorporate.com/actualites/paypal-et-leboncoin-s-allient-pour-simplifier-les-achats-de-seconde-main-13d6f-763e3.html (25/03/2026)
- **Non lues (HTTP 403)** : https://www.leboncoin.fr/dc/cgu · https://leboncoin.fr/dc/cgv ·
  https://www.leboncoin.fr/dc/rules · https://www.leboncoin.fr/options/prix?user_type=fprivate ·
  https://www.leboncoin.fr/legal.htm · https://www.leboncoin.fr/dc/cgv_pro (vu seulement en résultat
  de recherche)

**Presse et juridique (datées)** :
- https://cms.law/fr/fra/news-information/arret-leboncoin-web-scraping-droit-sui-generis-sur-les-bases-de-donnees (28/04/2021)
- https://siecledigital.fr/2026/02/09/leboncoin-arrive-dans-chatgpt/ (09/02/2026)
- https://www.clubic.com/actualite-600067-ca-y-est-leboncoin-arrive-dans-chatgpt.html (date non relue)
- https://www.moneyvox.fr/banque-en-ligne/actualites/108031/paypal-et-le-paiement-en-quatre-fois-desormais-disponibles-sur-leboncoin (date non relue)
- https://linuxfr.org/news/cheky (29/05/2017, commentaire reproduisant les CGU d'alors)

**Tiers, cités seulement comme contradictions (non citables)** : margeoapp.com/blog/frais-leboncoin-2026-vendeur-particulier-pro ;
sequr.fr/blog/leboncoin-frais-vendeur-2026 ; josephtorregrossa.com/blogs/leboncoin/… ;
www.journaldufreenaute.fr/?p=46818 ; www.statut-services.fr/service/leboncoin/annonce ;
www.lbcxrocket.fr/blog/bot-leboncoin-legal-risques-bannissement (13/06/2026, maj 06/10/2026) ;
forum.quechoisir.org (fils sur les options et les blocages) ;
https://www.clubic.com/actualite-562317-ni-vu-ni-connu-leboncoin-vous-fait-payer-plus-cher-vos-annonces-auto.html ;
https://www.mac4ever.com/auto/188731-leboncoin-commence-a-faire-payer-les-vendeurs-un-peu-trop-actifs.
