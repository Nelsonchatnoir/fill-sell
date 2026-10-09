# Fiche de faits — eBay (ebay.fr), marché France — 09/10/2026

> Sert à écrire : `/plateformes/ebay` (+ `/en/platforms/ebay`), les trajets `/crosslisting/vinted-ebay` et
> `/crosslisting/leboncoin-ebay`, le pilier, la page sécurité, l'article « calculer ses profits » (frais eBay 2026)
> et les FAQ.
>
> **Observé le 2026-10-09, entre ~15:15 et 15:50 (heure de Paris).** Pages officielles lues en HTML brut
> (curl, sans connexion à aucun compte : les pages s'affichent « Bonjour ! Connectez-vous ») puis relues
> ligne à ligne ; aucune connexion à fillsell.app ni à eBay, aucun SQL, aucun commit.
> Partie FillSell : **uniquement** la fiche de vérité `docs/seo/etat-des-lieux/03-fiche-de-verite.md`
> (corrections de contre-vérification comprises), références F-xx.
>
> Légende « Statut » : **officiel** = lu sur une page eBay ; **presse** = article daté ; **non vérifié** = vu
> seulement dans un résultat de recherche ou un forum ; **divergent** = deux pages officielles se contredisent.

---

## 0. L'essentiel en 8 lignes

1. **Confirmé** : depuis le **1er septembre 2026**, un **vendeur particulier dont l'adresse est dans l'EEE** ne paie
   plus de **frais de transaction** (commission sur le prix final + frais d'exploitation réglementaires) sur ebay.fr,
   « quelle que soit la catégorie » (S2, S16 ; presse S23).
2. Ce n'est **pas** « 0 € partout » : 150 annonces gratuites par mois (250 avec une Boutique), **0,35 €** l'annonce
   au-delà ; options payantes ; frais si la livraison part **hors zone euro et Suède** ; conversion de devises (S2).
3. Le coût est déplacé vers l'**acheteur** : « frais de Protection acheteurs » (0,10 € + 7 % / 4 % / 2 % par tranche),
   inclus dans le prix affiché, pour les achats auprès d'un particulier inscrit en France ou en Italie (S6).
4. **Piège n° 1 pour nos lecteurs** : eBay exige un **compte professionnel** de celui qui « vend des objets achetés
   pour être revendus » (S1, S7). Un revendeur en achat-revente relève donc, selon eBay, des **frais
   professionnels** (ex. mode : 12 % + 0,35 €/commande + 0,35 %, HT — S5). Le « 0 € » ne vaut que pour le
   particulier qui vend ses propres affaires.
5. Enchères 3, 5, 7 ou 10 jours ; prix fixe « Valide jusqu'à annulation », remis en vente chaque mois (S8-S10).
6. Une annonce créée par l'**Inventory API** d'eBay exige des **conditions de vente** (paiement, retours, livraison)
   activées sur le compte (S20) — même exigence que le « compte prêt à vendre » de FillSell (F31). La fiche ne dit pas
   quelle API d'eBay FillSell appelle : ne pas nommer l'Inventory API dans nos textes.
7. Les **CGU d'eBay.fr** (en vigueur le 01/09/2026) interdisent « tout type de robots informatiques, scraper ou
   encore […] tout autre procédé automatique pour accéder à nos Services » (S16). L'API, sous licence eBay (S21), est
   la voie prévue : c'est l'argument honnête pour relier son compte eBay à FillSell.
8. FillSell : sur **ebay.fr uniquement**, compte **relié** = publication par l'API officielle **même ordinateur
   éteint** ; jamais de republication eBay ; vente eBay enregistrée seule ; e-mail quand FillSell l'enregistre
   (F31, F37, F43, F45).

---

## 1. Frais des vendeurs PARTICULIERS sur ebay.fr — vérification de l'affirmation d'audit

**Affirmation de l'audit** (`01-audit-contenu.md` l. 389-392) : « depuis le 01/09/2026, un particulier de l'EEE ne paie
plus de frais de vente sur eBay.fr (jusqu'à 150 annonces gratuites par mois, 0,35 € au-delà ; frais de protection
acheteurs côté acheteur) ». **Verdict : CONFIRMÉE**, avec des exceptions à écrire (ci-dessous) et une précision
majeure (§ 2, statut professionnel).

### 1.1 La règle et sa date

| Fait | Citation exacte | Source | Statut |
|---|---|---|---|
| Qui en bénéficie | « Les vendeurs particuliers ayant une adresse enregistrée dans l'Espace économique européen (EEE) peuvent désormais vendre gratuitement sur ebay.fr. » | S2 | officiel |
| Ce qui disparaît | « Vous ne paierez pas de frais de transaction (commission sur le prix final et frais d'exploitation réglementaires) lorsque vous vendez des objets, quelle que soit la catégorie. » | S2 | officiel |
| Date | « Cette page a été mise à jour le 1er septembre 2026 et contient de nouvelles conditions relatives aux frais. » | S2 | officiel |
| Date (contrat) | CGU d'eBay.fr : « Cette version mise à jour est entrée en vigueur le 1er septembre 2026 pour l'ensemble des utilisateurs d'eBay.fr » ; « Si vous êtes un vendeur particulier et que l'adresse associée à votre compte est située dans l'Espace Economique Européen, vous ne payez pas de frais de transaction. » (version précédente : 11 février 2024) | S16 | officiel |
| Page de présentation | « Nouveau : zéro frais, zéro effort » ; « Zéro frais de vente » ; « Réservé aux particuliers » ; FAQ : « Cette gratuité s'applique à toutes les catégories. » **Aucune date** sur cette page. | S1 | officiel |
| Annonces déjà en ligne | « Depuis le 1er septembre 2026 » ; la gratuité vaut aussi pour les annonces en ligne avant cette date (selon l'article) | S23 (JustGeek, 01/09/2026) | presse |

### 1.2 Ce qui reste payant pour un particulier de l'EEE (exceptions)

| Exception | Montant / règle (citation ou reprise exacte) | Source | Statut |
|---|---|---|---|
| Au-delà du quota d'annonces | « Vous pouvez créer jusqu'à 150 annonces gratuitement chaque mois, voire plus si vous avez une Boutique eBay. […] Chaque annonce créée au-delà de votre quota mensuel gratuit coûte 0,35 €. » ; « plus de 150 objets par mois (ou 250 si vous possédez une Boutique) » | S2 | officiel |
| Ce qui compte dans le quota | nouvelles annonces ; **objets remis en vente manuellement** ; annonces « Valide jusqu'à annulation » au moment de la première annonce (pas les mois suivants pour un particulier) ; annonces terminées plus tôt ; annonces identiques au format Enchères | S3 | officiel |
| Ce qui ne compte pas | remises en vente **automatiques** d'enchères et renouvellements mensuels « Valide jusqu'à annulation » : « ne font pas l'objet de frais d'insertion supplémentaires et ne sont pas décomptés » | S2 | officiel |
| Quota valable sur un seul site | « les annonces gratuites sont disponibles uniquement pour le pays correspondant à l'adresse associée à votre compte » (France → eBay.fr) | S3 | officiel |
| Limites de vente | « Toute limite de vente définie pour votre compte continue de s'appliquer et peut vous empêcher d'utiliser la totalité de votre quota d'annonces gratuites. » eBay ajuste ces limites chaque mois et « peut mettre fin aux annonces » créées au-delà | S3, S4 | officiel |
| Options payantes | sous-titre **0,50 €** ; deuxième catégorie **0,35 €** ; prix de réserve **3 % du prix de réserve (min. 3 €, max. 150 €)**, « que votre objet soit vendu ou non » ; annonces sponsorisées (selon la campagne). **Gratuits** : jusqu'à 24 photos, Offre directe (prix fixe), prix d'Achat immédiat sur une enchère, annonce programmée | S2 | officiel |
| Vente vers l'étranger | compte en France, adresse de livraison **hors zone euro et Suède** : **1,92 %** (Europe hors zone euro/Suède/Royaume-Uni, **et** États-Unis/Canada), **1,44 %** (Royaume-Uni), **3,96 %** (tous les autres pays), sur le montant total (livraison et taxes comprises), TVA incluse | S2 (tableau relu dans le HTML) | officiel |
| Conversion de devises | quand on vend ou met en vente sur **un autre site eBay** : 3 % pour un compte en France ; « À partir du 2 décembre 2026, les frais applicables aux vendeurs inscrits en France passeront à 3,25 %. » | S2 | officiel |
| Mettre fin à une enchère plus tôt | « Des frais peuvent s'appliquer » | S2 | officiel |
| Boutique Classique (particulier) | 19,94 €/mois ; 250 annonces gratuites ; au-delà 0,35 € (enchères) / 0,15 € (prix fixe) | S2 | officiel |
| Commission « hors eBay » | si l'on échange ses coordonnées pour vendre hors d'eBay, eBay facture une commission (texte de la section des vendeurs hors EEE et des anciens frais) | S2 | officiel |

**Divergence à connaître** : la page de présentation dit « si vous vendez à des acheteurs situés en dehors de l'EEE » (S1)
alors que la page d'aide détaillée vise une livraison « en dehors de la zone euro ou de la Suède » (S2). La
Pologne, la Hongrie, la Roumanie, la Tchéquie ou le Danemark (EEE, hors zone euro) figurent dans la liste « Europe* » à
1,92 % (S2). **Écrire la version de l'aide (S2).**

### 1.3 Véhicules : DIVERGENT, ne rien écrire

- La page d'aide place le tableau « Frais pour la catégorie Autos, Motos » (voitures : 9 € d'insertion + 35 € de
  commission ; motos, scooters : 6 € + 19 €) **dans la section des vendeurs particuliers résidant hors de l'EEE** et
  dans les **anciens frais** (S2, structure des titres relue dans le HTML).
- La page « annonces gratuites » dit : catégories « Autos, motos et véhicules (gratuit pour les vendeurs particuliers
  basés en Italie/France) » (S3).
- Les frais acheteurs ne s'appliquent pas aux « catégories Véhicules, Petites Annonces et certaines catégories de
  bateaux » (S6).
→ **Non tranché.** FillSell ne cible pas les véhicules : ne pas en parler.

### 1.4 Ce que paie l'acheteur : « frais de Protection acheteurs »

| Fait | Détail | Source |
|---|---|---|
| Qui | « payés par l'acheteur lorsqu'il achète auprès d'un vendeur particulier inscrit en France ou en Italie, hors catégories Véhicules, Petites Annonces et certaines catégories de bateaux » | S6 |
| Barème | 0,10 € par objet + 7 % du prix jusqu'à 20 € + 4 % de la part entre 20 et 300 € + 2 % de la part entre 300 et 4 000 € ; rien au-delà de 4 000 € ; calculé sur le prix de l'objet seul (livraison exclue) ; TVA incluse | S6 |
| Exemples officiels | objet à 20 € → 21,50 € + livraison ; objet à 1 500 € → 1 536,70 € + livraison | S6 |
| Affichage | « toujours inclus dans le prix affiché de l'objet » | S6 |
| Achat chez un pro | « La Protection acheteurs est incluse sans frais supplémentaires pour les achats auprès de vendeurs professionnels sur ebay.fr. » | S6 |
| Remboursement | remboursés si la commande est intégralement remboursée | S6 |
| Formule eBay côté vendeur | « Vous touchez désormais 100% du prix de vente. » | S1 |

### 1.5 Repères : avant le 1er septembre 2026, et hors EEE

- **Anciens frais** (encore affichés en bas de S2, « anciens frais pour les vendeurs particuliers ») : commission de
  **10 %** du montant total jusqu'à 2 000 € (2 % au-delà) **+ 0,35 € par commande**, **+ 0,42 %** de frais
  d'exploitation réglementaires ; 150 annonces gratuites, 0,35 € au-delà. → C'est la base de calcul à citer pour
  dire « ce qui a changé » ; **« eBay 13 % »** (ancien article du blog) n'apparaît nulle part (S2).
- **Particulier hors EEE** (aujourd'hui) : mêmes 10 % / 2 % + 0,35 € par commande + 0,42 % (S2). Concerne par
  exemple un compte dont l'adresse est en Suisse ou au Royaume-Uni (hors EEE) — à ne pas promettre « gratuit » aux
  lecteurs anglophones hors UE.

---

## 2. Particulier ou professionnel : la règle d'eBay

| Fait | Citation exacte | Source |
|---|---|---|
| Quand passer pro | « Vous devez vous inscrire en tant que vendeur professionnel si vous vendez des objets achetés pour être revendus, fabriquez des objets destinés à la vente ou exercez une activité commerciale. » | S1 |
| Règlement | « Un vendeur eBay doit s'inscrire en tant que vendeur professionnel si, par exemple, il vend des objets qu'il a achetés pour les revendre » ; « Les vendeurs professionnels ne peuvent pas se présenter comme des particuliers » | S7 |
| Obligations du pro | coordonnées complètes, n° de TVA le cas échéant, conditions de retour ; informer du **délai de rétractation de 14 jours** ; ne pas facturer les frais de retour aux acheteurs ; sanctions possibles (suppression d'annonce, restriction, suspension) | S7 |
| Signalement aux acheteurs | « Particulier » ou « Professionnel » s'affiche à côté du pseudo (ordinateur) ; « Inscrit comme vendeur particulier / professionnel » (app) | S6 |
| Versements | particulier : fonds conservés dans le **Solde eBay**, retrait vers le compte bancaire à tout moment (versé d'office après 365 jours sans activité) ; pro : versements quotidiens, hebdomadaires, bimensuels ou mensuels | S15 |

**Conséquence pour nos textes** : le public de FillSell (« revendeurs », « achat-revente ») est, au sens d'eBay, en
grande partie **professionnel**. Toute phrase « 0 € de frais sur eBay » adressée à un revendeur est trompeuse sans
cette précision. Formulation sûre proposée :
- tu (pages produit) : « Sur ebay.fr, un particulier qui vend ses propres affaires ne paie plus de frais de vente
  depuis le 1er septembre 2026. Si tu achètes pour revendre, eBay te demande un compte professionnel, avec ses
  propres frais. »
- vous (blog) : « Depuis le 1er septembre 2026, les particuliers résidant dans l'EEE ne paient plus de frais de vente
  sur ebay.fr. Attention : eBay considère comme professionnel celui qui vend des objets achetés pour être revendus. »

FillSell ne tranche pas le statut de la personne et ne donne aucun conseil fiscal : renvoyer vers la page d'eBay.

---

## 3. Frais des vendeurs PROFESSIONNELS sur ebay.fr (S5)

« Tous les frais affichés sur cette page sont indiqués **hors TVA**. » (S5) — à l'inverse de la page des particuliers
(TTC, S2).

| Poste | Montant | Source |
|---|---|---|
| Commission sur le prix final — **Mode** (Vêtements, accessoires 11450 ; Valises ; Beauté, bien-être, parfums) | **12 %** du montant total + 0,35 € par commande | S5 |
| Montres, sacs, sacs à main | 12 % jusqu'à 990 €, 2 % au-delà | S5 |
| Bijoux | 12 % jusqu'à 990 €, 4 % au-delà | S5 |
| Collection (cartes à collectionner, art, jouets et jeux 220, monnaies, timbres…) | 9 % jusqu'à 990 €, 2 % au-delà | S5 |
| Autres catégories (livres, jeux vidéo et consoles, CD/vinyles, instruments, DVD) et toutes les catégories non mentionnées | 9 % | S5 |
| Électronique : appareils (téléphonie, informatique, photo, consoles 139971…) | 5 % | S5 |
| Électronique : accessoires | 7,5 % | S5 |
| Maison, bricolage, puériculture, animalerie… ; pièces auto-moto | 9 % | S5 |
| Frais par commande | 0,35 € | S5 |
| Frais d'exploitation réglementaires | **0,35 %** du montant total | S5 |
| Ventes hors zone euro et Suède | 1,6 % (Europe hors zone euro + États-Unis/Canada), 1,2 % (Royaume-Uni), 3,3 % (reste du monde) | S5 (tableau relu dans le HTML) |
| Insertion sans Boutique | 0,30 € (prix fixe), 0,40 € (enchères), refacturés chaque mois pour « Valide jusqu'à annulation » une fois le quota épuisé | S5 |
| Boutiques | Basique 19,50 €/mois (300 annonces prix fixe gratuites) ; À la Une 39,50 € (10 000) ; Premium 149,50 € (sans limite) | S5 |
| Performance insuffisante | +6 points de commission (puis +7 après 4 mois consécutifs) | S5 |
| Réduction « Vendeur Top Fiabilité » | −10 % sur la partie variable si livraison nationale gratuite, retours 30 jours, expédition 0-1 jour, suivi ≥ 25 € | S5 |

Aucune date de mise à jour n'est affichée sur S5 (seule mention datée : conversion de devises 3,25 % au 2 décembre
2026). Pour une page FillSell : **ne pas recopier ce barème** ; renvoyer vers S5 avec la date de lecture.

---

## 4. Enchères ou prix fixe, durée des annonces

| Fait | Détail | Source |
|---|---|---|
| Formats | « achat immédiat, enchères ou les deux » ; l'acheteur peut faire une offre (« Offre directe ») sur un prix fixe | S1, S2 |
| Durée des enchères | « Vous pouvez choisir si vos enchères doivent durer 3, 5, 7 ou 10 jours. » | S9 |
| Enchère de 3 jours invendue | eBay peut la remettre gratuitement en vente « sous la forme d'une enchère de 7 jours » | S8 |
| Prix fixe | « Valide jusqu'à annulation. L'objet est remis en vente tous les mois jusqu'à ce qu'il soit vendu ou que vous mettiez fin à la vente. » | S8, S10 |
| Achat immédiat sur une enchère | prix « d'au moins 40 % supérieur au prix de départ » (« dans la plupart des catégories ») ; disparaît à la première enchère | S9, S10 |
| Prix de réserve | payant pour un particulier (3 %, min. 3 €, max. 150 €) | S2 |
| Remises en vente automatiques (enchères) | gratuites pour un non-professionnel | S9 |
| Annonces identiques | « il est interdit de proposer simultanément plusieurs annonces au format Prix fixe pour un même objet » ; enchères identiques permises sous conditions, une seule visible à la fois | S19 |
| Délai d'apparition | « elle devrait apparaître dans les résultats de recherche eBay sous 24 heures » | S3 (rubrique liée « Trouver votre annonce ») |

Note : la page « Durées et délais » affiche « Format Enchères – , 3, 5, 7 et 10 jours » avec une première valeur vide
(S8). **Ne pas écrire « 1 jour ».**

---

## 5. Livraison, remise en mains propres, paiement

| Fait | Détail | Source |
|---|---|---|
| Modes | « remise en mains propres, envoi ou les deux » | S1 |
| Bordereaux eBay | achetés sur eBay à « tarifs réduits négociés avec nos transporteurs partenaires » ; adresse et suivi pré-remplis ; numéro de suivi ajouté seul à la commande ; sans imprimante : **QR code** présenté en point relais « lorsque ce service est disponible » ; autres transporteurs via **Packlink** | S1, S13 |
| Coût d'un bordereau | selon poids et dimensions ; ajusté par le transporteur, différence sur la facture eBay | S13 |
| Transporteurs nommés | **aucun** sur les pages lues | S13 |
| Remise en mains propres | paiement fait **sur eBay avant la rencontre** ; l'acheteur confirme par QR code ou code à 6 chiffres, ce qui débloque le paiement | S1, S14 |
| Garantie client eBay | remboursement si l'objet n'arrive pas, est défectueux ou endommagé, ou ne correspond pas à l'annonce ; 30 jours en remise en mains propres | S7, S14 |
| Disponibilité des fonds | **divergent** : « dans les 2 jours calendaires suivant la confirmation de livraison » (S1) ; « généralement […] dans les 48 heures suivant le paiement de l'acheteur » (S15) ; « généralement effectués une fois la livraison confirmée » (S6) → **ne citer aucun délai** | S1, S6, S15 |
| Ouvrir un compte vendeur | coordonnées bancaires + vérification d'identité par SMS ou appel | S1 |

Non vérifié (forum seulement, S25) : « la remise en mains propres ne se règle plus en liquide », « l'achat multiple
réservé aux professionnels ». Ne pas reprendre tel quel ; seul le paiement sur eBay avant la rencontre est officiel (S14).

---

## 6. Conditions de vente (paiement, retours, livraison)

| Fait | Détail | Source |
|---|---|---|
| Obligation | « Lorsque vous créez une annonce, vous devez choisir des conditions de vente qui définissent les modalités de paiement, de livraison et de retour pour les acheteurs. » Modèles réutilisables à activer dans le « Gestionnaire des conditions de vente » | S11 |
| Retours | « vous devez indiquer si vous acceptez les retours et, si c'est le cas, sous quelles conditions » (qui paie le retour, délai) ; règles d'acceptation ou de remboursement automatique possibles | S12 |
| Rétractation UE | « Les acheteurs consommateurs de l'UE peuvent se rétracter […] dans un délai de 14 jours » ; obligation formulée pour les vendeurs professionnels dans S7 | S12, S7 |
| API | « All three policies are required to publish offers and create active listings through the Inventory API. » ; « It is required that the seller be opted into Business Policies before being able to create live eBay listings through the Inventory API. » | S20 |

Lien avec FillSell : un compte relié doit être « prêt à vendre chez eBay (politiques de paiement, de retours et de
livraison ; vendeur non bloqué) », sinon la publication attend (F31). Formulation sûre : « Avant ta première annonce
eBay par FillSell, ton compte eBay doit avoir ses conditions de vente (paiement, retours, livraison). »
(Le nom exact chez eBay.fr est « conditions de vente » ; éviter « politiques » dans les textes publics.)

---

## 7. L'API officielle d'eBay et ce qu'elle change

### 7.1 Faits eBay

| Fait | Détail | Source |
|---|---|---|
| Ce qu'est l'API | l'Inventory API sert « to create and manage inventory, and then to publish and manage this inventory on an eBay marketplace » | S20 |
| ebay.fr dans l'API | valeur `EBAY_FR` : « This enumeration value indicates that the eBay Marketplace is the France site (ebay.fr). » | S20 (spécification OpenAPI) |
| Conditions | conditions de vente activées (« Business Policies ») ; paiement, retours, livraison obligatoires ; champs du lieu de stock (« inventory location ») requis pour publier | S20 |
| Licence | les API sont fournies dans le cadre de l'« eBay Developers Program », sous l'« API License Agreement » ; les clés de l'application « may be revoked at any time by eBay » ; interdiction de collecter les identifiants ou mots de passe des utilisateurs (« You will not under any circumstances collect, store or share any eBay User' User IDs or passwords. ») | S21 |
| CGU d'eBay.fr | interdit d'« utiliser tout type de robots informatiques, scraper ou encore utiliser tout autre procédé automatique pour accéder à nos Services pour quelque raison que ce soit » | S16 |

### 7.2 Ce que cela change pour la personne (faits FillSell, fiche de vérité)

- **Ordinateur éteint** : compte relié = publication « côté serveur (sans ordinateur allumé) » ; c'est **la seule**
  plateforme où FillSell publie ordinateur éteint (F09, F31). Le Cloud n'existe pas (F56).
- **Pas de mot de passe** : la personne relie son compte sur la page officielle d'eBay ; « FillSell reçoit une
  autorisation, jamais le mot de passe » (F12).
- **Voie conseillée** : sans liaison, l'extension publie dans la session de la personne, mais « bute souvent sur la
  reconnexion de sécurité d'eBay » et la publication attend « Connecte ton compte eBay » (F24, note de
  contre-vérification).
- **Synchronisation et ventes** : l'import passe « par l'API si relié, sinon par l'extension » (F33) ; les ventes eBay
  sont repérées par le serveur et enregistrées seules (F42, F43).

### 7.3 Pour la page sécurité (lecture croisée, sans conclusion juridique)

L'interdiction des « procédés automatiques » (S16) vise l'accès automatisé aux services d'eBay. Le texte honnête
est donc : **« Pour eBay, le plus sûr est de relier ton compte : FillSell passe alors par l'interface officielle
d'eBay. »** Ne jamais écrire que l'extension est « autorisée » ou « sans risque » sur eBay.

---

## 8. Catégories fortes pour les revendeurs

**Aucun classement officiel récent des catégories d'eBay France n'a été trouvé** (recherche du 09/10). Ce qui est
sourçable :

| Fait | Détail | Source | Statut |
|---|---|---|---|
| Priorités mondiales d'eBay au T2 2026 | **Collection** (cartes à collectionner : scan de cartes par IA, 80 millions de scans cumulés), **pièces et accessoires auto-moto**, **luxe** (montres), **mode de seconde main** (« pre-loved fashion ») ; eBay Live | S22 (05/08/2026) | officiel (groupe, monde) |
| Barème pro par catégorie | traitement à part de la collection, des montres/sacs, des bijoux, de la mode (S5) — signe des catégories suivies, pas un classement | S5 | officiel |
| eBay et Depop | eBay a finalisé le rachat de Depop le 30/07/2026 | S22 | officiel — **ne pas utiliser** (F54 : ne pas nommer Depop) |
| Communiqué « Collections & Antiquités, catégorie phare » | **daté du 23 mai 2017** (chiffres Fevad-Médiamétrie 2016) | S24 | officiel mais **trop ancien : ne pas citer** |

À ne pas écrire tant qu'aucune source France n'est trouvée : « eBay est LA plateforme de la collection / de
l'électronique… » ou tout « n° 1 en France ». Ce qui peut s'écrire : « eBay met en avant la collection (dont les cartes
à collectionner), les pièces auto-moto, le luxe et la mode de seconde main » (S22, groupe, 2026, citer « au niveau
mondial »).

---

## 9. Public international

| Fait | Détail | Source |
|---|---|---|
| Acheteurs actifs | **136 millions** (au 30/06/2026, monde, +2 % sur un an) | S22 |
| Formule d'eBay.fr | « 136 millions d'acheteurs dans 190 pays » | S1 |
| Formule du groupe | « more than 190 markets » | S22 |
| Être vu hors de France | il faut **ajouter la livraison internationale** (pays, service, frais) ; on peut exclure des pays ; « Les annonces peuvent apparaître sur le site sur lequel vous avez mis en vente l'objet ou sur un autre » | S17, S18 |
| Règles applicables | vendre sur un autre site eBay = CGU et règlements de ce site ; garantie client du site de vente | S18 |
| Coût | frais de vente à l'international hors zone euro et Suède (§ 1.2) ; S17 a une rubrique « Douanes » (non détaillée ici) | S2, S17 |

FillSell : **ebay.fr uniquement** ; un compte eBay inscrit dans un autre pays n'est pas publié (F31). La fiche ne dit
**pas** si les annonces publiées par FillSell proposent la livraison internationale → **ne rien promettre** sur la
vente à l'étranger via FillSell.

Pour les pages anglaises (anglophones en France/UE) : la gratuité dépend de l'**adresse du compte dans l'EEE** et du
statut particulier (S2) ; un compte au Royaume-Uni n'est pas concerné (hors EEE).

---

## 10. Autres faits utiles

- eBay propose lui-même, dans son app, de créer une annonce avec l'IA : « prenez quelques photos et l'annonce se crée
  automatiquement » (S1). → Ne jamais écrire que FillSell est le seul moyen de rédiger une annonce eBay par l'IA.
- Jusqu'à **24 photos** gratuites par annonce (S2). (Lens lit les 5 premières photos ; la fiche les garde toutes — F15.)
- Service client eBay « disponible 24h/24 et 7j/7 par chat » (S1).

---

## 11. FillSell et eBay (ebay.fr) — tiré UNIQUEMENT de la fiche de vérité

| Sujet | Ce que fait FillSell | Comment | Geste demandé | Limites | Réf. |
|---|---|---|---|---|---|
| Plateforme ouverte | eBay fait partie des 4 plateformes ouvertes à tous (Vinted, Leboncoin, eBay, Beebs) | — | cocher eBay | **ebay.fr uniquement** ; compte d'un autre pays non publié (raison affichée) | F24, F31 |
| Relier son compte | autorisation sur la page officielle d'eBay (OAuth) ; FillSell ne voit jamais le mot de passe | page eBay | relier le compte une fois | « partenaire officiel / certifié » interdit | F12 |
| Publier (compte relié) | publication par l'API officielle d'eBay, côté serveur, **même ordinateur éteint** | API | aucun après la liaison | compte « prêt à vendre » (conditions de paiement, retours, livraison ; vendeur non bloqué), sinon la publication attend | F31 |
| Publier (compte non relié) | l'extension remplit le formulaire dans la session de la personne | extension, ordinateur allumé, Chrome ouvert | être connecté(e) à eBay | bute souvent sur la reconnexion de sécurité d'eBay → « Connecte ton compte eBay » | F07, F09, F24 |
| Rédaction | depuis l'app, le scan Lens rédige aussi l'annonce eBay ; catégorie, taille, couleur, colis adaptés ; un rayon introuvable devient une question | serveur (IA) | relire avant de publier | scan = 1 annonce du forfait | F15, F20, F25, F27 |
| Publication en lot | lots jusqu'à 20 articles, eBay inclus | — | choisir, vérifier | dans le quota du mois | F26 |
| Synchroniser | importe les annonces eBay déjà en ligne | API si relié, sinon extension | appui sur « Synchroniser » | lit seulement ; aucun quota sur l'import | F33, F34 |
| Une fiche par article | rapprochement eBay ↔ autres plateformes (photos ET titre, jamais l'un seul) ; doute → question | serveur | répondre aux questions | — | F35 |
| Republication | **jamais sur eBay** (ni manuelle ni automatique) | — | — | republication = Vinted, Leboncoin, Beebs | F07, F37, F39 |
| Ventes | repérées par le serveur (relecture eBay, notifications de commande pour les comptes reliés) ; **enregistrées toutes seules** sur preuve depuis le 01/10 | serveur | aucun | aucun délai chiffré à publier ; ventes eBay manquantes rattrapées le 09/10 et enchère en cours lue « vendue » jusqu'au 09/10 (corrigé) — **interne, ne pas publier** | F42, F43 |
| Retrait des autres annonces | après une vente enregistrée, copies prouvées retirées ; doute → « Déjà vendu ? » ; une annonce eBay créée par l'API est retirée par l'API ; compte eBay non relié : l'extension retire | API (eBay créé par l'API) / extension (Vinted, Leboncoin, Beebs, eBay non relié) | répondre « Déjà vendu ? » si doute | retrait définitif ; extension = ordinateur allumé | F07, F44 |
| E-mail de vente | « Quand FillSell enregistre une vente sur Vinted ou eBay, tu reçois un e-mail. » | — | — | jamais « un e-mail à chaque vente » | F45 |
| Prix proposé | Lens cherche des annonces comparables en ligne (Vinted d'abord, puis eBay, Leboncoin), jusqu'à 8 | recherche web | relire | jamais « prix exact / garanti » | F19 |
| Marge | prix d'achat, prix de vente, frais, marge ; prix d'achat inconnu exclu | app | saisir ses frais | pas de calcul automatique des frais eBay établi par la fiche | F49 |

**Formulations sûres (fiche de vérité)**
- « Pour eBay, tu relies ton compte depuis la page officielle d'eBay : FillSell ne voit jamais ton mot de passe. » (F12)
- « Sur eBay France, une fois ton compte relié, FillSell publie par l'interface officielle d'eBay, même si ton
  ordinateur est éteint. » (F31)
- « Quand Vinted ou eBay marque ton article vendu, FillSell enregistre la vente tout seul. » (F43)
- « Pour que tes annonces partent [sur Vinted, Leboncoin et Beebs], ton ordinateur doit être allumé avec Chrome
  ouvert. » + exception eBay relié (F09, F31).
- EN : "On eBay France, once your account is linked, FillSell publishes through eBay's official interface, even with
  your computer off." (F31) ; "For eBay, you link your account through eBay's official page: FillSell never sees your
  password." (F12)

---

## 12. Dix faits citables (courts, exacts, sourcés)

1. Depuis le **1er septembre 2026**, un vendeur particulier dont l'adresse est dans l'EEE ne paie plus de frais de
   transaction sur ebay.fr, quelle que soit la catégorie. — S2, S16
2. Un particulier publie jusqu'à **150 annonces gratuites par mois** sur ebay.fr ; chaque annonce en plus coûte
   **0,35 €**. — S2
3. eBay demande un **compte professionnel** à qui « vend des objets achetés pour être revendus ». — S1, S7
4. Côté acheteur, un achat chez un particulier inscrit en France inclut des **frais de Protection acheteurs** :
   0,10 € + 7 % jusqu'à 20 €, 4 % de 20 à 300 €, 2 % de 300 à 4 000 €, déjà compris dans le prix affiché. — S6
5. Un vendeur particulier en France paie **1,92 %, 1,44 % ou 3,96 %** du montant total quand il livre hors zone euro
   et Suède (selon le pays). — S2
6. Vendeur professionnel, catégorie mode : **12 % + 0,35 € par commande + 0,35 %** de frais réglementaires, hors TVA. — S5
7. Enchères : **3, 5, 7 ou 10 jours** ; prix fixe : « Valide jusqu'à annulation », remis en vente chaque mois. — S9, S8
8. Le **prix de réserve** reste payant pour un particulier : 3 % du prix de réserve (3 € min., 150 € max.), vendu ou
   non. — S2
9. eBay interdit de publier **plusieurs annonces à prix fixe pour un même objet** en même temps. — S19
10. Pour publier par l'API d'eBay, le compte doit avoir des **conditions de paiement, de retour et de livraison**. — S20

(Réserve : 136 millions d'acheteurs actifs dans le monde au 30/06/2026 — S22 — utilisable sur la page plateforme,
avec la date.)

---

## 13. Pièges : ce que nos textes ne doivent PAS affirmer

**Frais**
- « eBay est gratuit pour les revendeurs », « 0 % de commission sur eBay » sans dire **particulier**, **EEE**, et que
  l'achat pour revendre relève du statut **professionnel** selon eBay (§ 2).
- « 0 € de frais » sans les exceptions : plus de 150 annonces par mois, options (réserve, sous-titre, 2e catégorie,
  sponsorisé), livraison hors zone euro et Suède, conversion de devises (§ 1.2).
- « Les frais ont disparu » sans dire que l'**acheteur** paie désormais des frais de Protection acheteurs (§ 1.4).
- « eBay 13 % », « eBay ~13,25 % » ou tout taux unique : faux pour un particulier EEE, et le barème pro varie par
  catégorie, hors TVA (§ 3).
- Toute affirmation sur les **véhicules** (pages divergentes, § 1.3).
- « hors de l'EEE » pour les frais internationaux : la règle détaillée est « hors zone euro et Suède » (§ 1.2).
- Un délai de versement des fonds (pages divergentes, § 5).

**FillSell et eBay**
- « partenaire officiel », « certifié », « approuvé », « intégration officielle eBay », logo eBay (PLAN § 2 ; lexique
  § 15 de la fiche). Dire « par l'interface officielle d'eBay » (F31), jamais « avec eBay ».
- « tous les sites eBay », « eBay.com / UK / Allemagne », « vends dans le monde entier avec FillSell » (F31 ; § 9).
- « FillSell republie sur eBay », « republication automatique eBay » (F37, F39).
- « ordinateur éteint » sans « compte eBay relié » ; l'étendre à Vinted, Leboncoin ou Beebs (F09, F31) ; « FillSell
  tourne la nuit sans ordinateur » (Cloud non lancé, F56).
- « l'extension est autorisée par eBay », « aucun risque pour ton compte eBay » (CGU S16).
- « vente détectée en temps réel / instantanément / en quelques minutes » ; tout délai chiffré (F42).
- « un e-mail à chaque vente » ; « notification push » (F45, F46).
- « publié instantanément sur eBay » (eBay : « sous 24 heures », S3 ; F28).
- « FillSell crée des enchères », « gère ta Boutique eBay », « gère les comptes pros » : **non établi par la fiche**.
- « FillSell calcule tes frais eBay » : non établi (F49 ne parle que de « frais »).
- « Lens fixe le prix d'après les ventes eBay » : la fiche dit « annonces comparables trouvées en ligne » (F19) ; ne
  pas nommer eBay comme source de prix (voir aussi § 15).
- « relie ton compte eBay depuis ton téléphone » : non établi par la fiche (F12 ne dit pas sur quel appareil).
- Nommer **Depop**, même pour dire qu'eBay l'a racheté (F54).
- Les chiffres internes (247 ventes rattrapées, enchère lue vendue) : jamais dans un texte public.

---

## 14. Non vérifié, divergences, décisions à prendre

- **Véhicules** pour un particulier EEE : pages officielles divergentes (§ 1.3).
- **Délai des fonds** : trois formulations officielles différentes (§ 5).
- **Espèces interdites en remise en mains propres / achat multiple réservé aux pros** : forum seulement (S25).
- **Durée de vie de l'autorisation eBay** (jeton) : documentation développeurs en 403 le 09/10, non lue.
- **Classement des catégories eBay en France en 2026** : aucune source officielle récente trouvée.
- **Ouverture publique de « eBay relié »** : question n° 5 de l'audit (« peut-on le dire publiquement (ouvert à tous
  les comptes reliés) ? ») — **décision de Nico** avant de mettre l'argument « ordinateur éteint » en titre.
- **Fiche de vérité en retard sur `main`** : le dossier principal porte des commits postérieurs à la fiche qui touchent
  eBay (`dbde17d` « une enchère eBay ne se vend que chez eBay », `9ecfedf` « une commande eBay = la vente d'UN
  exemplaire… quantité eBay », `5e169f1`). **Non intégrés à la fiche : ne rien en écrire** avant mise à jour de la fiche.
- **Fonctions non couvertes par la fiche** : format enchères, livraison internationale, comptes eBay professionnels,
  Boutique, liaison depuis le téléphone, API d'eBay utilisée (Inventory API ou autre) — à faire confirmer avant tout
  texte.

---

## 15. Signal hors SEO, à transmettre à Nico (lecture, aucune conclusion juridique)

L'« API License Agreement » d'eBay (S21, lu le 09/10, sans date de version affichée) liste des usages interdits qui
méritent une relecture au regard de FillSell (aucune affirmation de non-conformité ici) :
- « Use eBay Content, either alone or in combination with third-party information, to suggest or model prices for
  items listed on eBay Site. »
- « Use eBay Content or Developer Tools to compete with eBay Services or to design, build, promote or augment any
  site or service competitive to eBay Services. »
- « Display eBay Content relating to the performance of any eBay Service relative to the performance of any
  third-party service (for example, sales volume, velocity, etc.). »
- « Use eBay Content, including without limitation any Personal Information, to train algorithms, conduct machine
  learning, develop synthetic data sets, train large learning models, and/or train artificial intelligence systems. »
- eBay peut suspendre l'accès aux API « if eBay believes you or Your Users […] are using the Developer Tools in any way
  that undermines eBay's business interests ».
Effet sur nos textes dès maintenant : ne pas présenter eBay comme source des prix de Lens, ne pas publier de
comparaison chiffrée « eBay contre Vinted » tirée des données des comptes.

---

## 16. Requêtes servies (rappel de `06-mots-cles-fr.md`)

« vendre sur ebay » (36), « vendre sur ebay particulier », « frais ebay vendeur particulier », « commission ebay
vendeur », « vinted ebay » (808, mais suggestions britanniques ou allemandes), « vinted ou ebay ». L'audit note
qu'aucune page ne met en avant **eBay par l'API officielle, ordinateur éteint** (PLAN § 1.5).

---

## 17. Sources (toutes lues le 2026-10-09)

| Id | Source | Type |
|---|---|---|
| S1 | https://pages.ebay.fr/revendre-sur-ebay/ (« Nouveau : zéro frais, zéro effort » ; aucune date affichée) | officiel |
| S2 | https://www.ebay.fr/help/selling/fees-credits-invoices/services-de-paiement-frais-pour-les-vendeurs-particuliers?id=4822 (« mise à jour le 1er septembre 2026 ») | officiel |
| S3 | https://www.ebay.fr/help/selling/listings/listing-tips/free-listings?id=4163 | officiel |
| S4 | https://www.ebay.fr/help/selling/listings/limites-de-vente?id=4107 | officiel |
| S5 | https://www.ebay.fr/help/selling/fees-credits-invoices/shop-selling-fees?id=4809 (frais des vendeurs professionnels, HT) | officiel |
| S6 | https://pages.ebay.fr/protectionacheteurs/ | officiel |
| S7 | https://www.ebay.fr/help/policies/selling-policies/selling-practices-policy/business-seller-policy?id=4710 | officiel |
| S8 | https://www.ebay.fr/help/selling/listings/selecting-listing-duration?id=4652 | officiel |
| S9 | https://www.ebay.fr/help/selling/listings/auction-format?id=4110 | officiel |
| S10 | https://www.ebay.fr/help/selling/listings/fixed-price-format?id=4109 | officiel |
| S11 | https://www.ebay.fr/help/selling/business-policies/business-policies?id=4212 | officiel |
| S12 | https://www.ebay.fr/help/selling/managing-returns-refunds/setting-return-policy?id=4368 | officiel |
| S13 | https://www.ebay.fr/espacevendeurs/livraison/bordereaux-ebay | officiel |
| S14 | https://pages.ebay.fr/remiseenmainspropres-a-propos/ | officiel |
| S15 | https://www.ebay.fr/help/selling/getting-paid/payouts-work-managed-payments-sellers?id=4814 | officiel |
| S16 | https://www.ebay.fr/help/policies/member-behaviour-policies/user-agreement?id=4259 (CGU en vigueur le 01/09/2026) | officiel |
| S17 | https://www.ebay.fr/help/shipping-items/default/livraison-internationale-pour-les-vendeurs?id=4182 | officiel |
| S18 | https://www.ebay.fr/help/policies/selling-policies/international-selling-policy?id=4689 | officiel |
| S19 | https://www.ebay.fr/help/policies/listing-policies/duplicate-listings-policy?id=4255 | officiel |
| S20 | https://developer.ebay.com/develop/api/spec/inventory_api.json (spécification de l'Inventory API) ; https://developer.ebay.com/api-docs/sell/static/inventory/publishing-offers.html | officiel (développeurs) |
| S21 | https://www.edp.ebay.com/join/api-license-agreement | officiel (développeurs) |
| S22 | https://www.sec.gov/Archives/edgar/data/0001065088/000106508826000174/exhibit991erebayq22026.htm (eBay Inc., résultats T2 2026, 05/08/2026) | officiel (groupe) |
| S23 | https://www.justgeek.fr/ebay-supprime-frais-vente-particuliers-157677/ (01/09/2026) | presse |
| S24 | https://static.ebayinc.com/static/assets/Uploads/PressRoom/Local/Communique-de-presse-eBay-lance-un-service-destimation-dobjets-de-collection.pdf (23/05/2017) | officiel, périmé |
| S25 | https://www.dealabs.com/discussions/ebay-chamboule-tout-la-vente-devient-gratuite-pour-les-particuliers-mais-lacheteur-va-payer-a-partir-du-1er-septembre-2026-3384536 (vu en résultat de recherche, non lu) | forum |

Pages non lues (403 le 09/10) : documentation OAuth d'eBay (`developer.ebay.com/api-docs/static/oauth-tokens.html`),
`developer.ebay.com/api-docs/static/rest-request-components.html`.
