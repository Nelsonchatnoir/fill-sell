# CGU / CGV FillSell — BROUILLON, NON PUBLIÉ

> Rédigé dans la nuit du 7 au 8 septembre 2026. **Ce fichier n'est servi par
> aucune route** : `docs/` n'est pas dans le bundle Vite. Rien n'est en ligne.
> La page publique reste `src/pages/Legal.jsx`, inchangée.
>
> Chaque article porte, en italique, **sur quoi il s'appuie** : soit un texte de
> loi relevé, soit un comportement du code vérifié (fichier + ligne). Aucune
> clause n'affirme un comportement que le code ne fait pas.

---

## 0. Ce qui manque AVANT de publier — à compléter par Nico

La loi impose des mentions que je ne peux pas inventer. Tant qu'elles ne sont
pas remplies, la page est en infraction (art. 6-III LCEN) :

| Mention | État aujourd'hui | Exigée par |
|---|---|---|
| Nom et prénom de l'éditeur | ABSENT (« Le gérant de FillSell ») | LCEN art. 6-III-1 |
| Adresse postale | ABSENTE | LCEN art. 6-III-1 |
| Numéro SIRET | ABSENT | LCEN + C. com. R123-237 |
| Téléphone ou moyen de contact direct | email seul (accepté, mais le téléphone est attendu pour un vendeur à distance) | C. consom. L221-5 |
| Téléphone de l'hébergeur (Vercel) | ABSENT | LCEN art. 6-III-1 |
| Médiateur de la consommation NOMMÉ | « un médiateur » sans nom | C. consom. L616-1 et R616-1 |
| Mention TVA | ABSENTE | CGI art. 293 B (franchise en base) |

---

## 1. Ce que la loi exige aujourd'hui — relevé

### 1.1 Mentions légales
Tout site professionnel, même non marchand, doit publier l'identité de
l'éditeur (nom, adresse), son statut et son SIRET, les coordonnées de
l'hébergeur (nom, adresse, téléphone), le directeur de la publication et un
moyen de contact direct. Page dédiée, lien permanent en pied de page. Les CGV
sont un document **séparé**.

### 1.2 Rétractation — 14 jours (C. consom. L221-18)
Le consommateur dispose de 14 jours pour se rétracter d'un contrat conclu à
distance, sans motif. **L'exception** (L221-28) : le droit tombe pour un
service pleinement exécuté avant la fin du délai, ou pour un contenu numérique
non fourni sur support matériel, **à la double condition** que l'exécution ait
commencé avec l'accord préalable exprès du consommateur ET qu'il ait reconnu
expressément perdre son droit de rétractation. Sans ces deux cases cochées et
tracées, le droit reste entier.

> Conséquence pour nous : soit on recueille cette renonciation à la
> souscription (case à cocher explicite, tracée), soit on rembourse
> intégralement pendant 14 jours. La formule actuelle (« remboursement diminué
> du prorata ») suppose une renonciation partielle qui n'est **pas** recueillie
> aujourd'hui dans le tunnel — voir §4, article 7.

### 1.3 Résiliation en trois clics (C. consom. L215-1-1, décret 2023-417)
Depuis le 1er juin 2023, tout professionnel qui permet de souscrire en ligne
doit permettre de résilier en ligne, par une fonctionnalité « résilier votre
contrat » **visible en permanence**, en trois étapes, avec **accusé de
réception sur support durable**. L'obligation s'applique même aux clients ayant
souscrit hors ligne dès lors que le contrat est proposé en ligne.

### 1.4 Loi Chatel — reconduction tacite (C. consom. L215-1)
Information écrite du consommateur, au plus tôt 3 mois et au plus tard 1 mois
avant la fin de la période permettant de refuser la reconduction, avec la date
limite dans un encadré apparent. Sanction : résiliation gratuite à tout moment
et remboursement des sommes versées après la dernière reconduction, sous
30 jours. **Cette obligation se cumule avec la résiliation en trois clics.**

### 1.5 RGPD
Responsable de traitement, finalités, bases légales, durées, droits, liste des
sous-traitants, transferts hors UE. Réponse aux demandes sous 1 mois.

### 1.6 DSA
S'applique depuis le 17 février 2024 à tous les fournisseurs de services
intermédiaires. Est « plateforme en ligne » tout hébergeur qui **diffuse
publiquement** des contenus fournis par des utilisateurs — sauf si cette
diffusion est une fonctionnalité mineure et purement accessoire. Obligations à
intégrer aux conditions générales : point de contact, description de la
politique de modération, mécanisme de signalement des contenus illicites.

> FillSell héberge des photos d'utilisateurs mais ne les diffuse pas
> publiquement : la qualification « plateforme en ligne » paraît écartée, celle
> de service d'hébergement reste discutable. **À faire trancher** (§5).

---

## 2. Ce qu'on a réellement dans `/legal` — relevé

`src/pages/Legal.jsx`, 671 lignes, bilingue FR/EN, « Dernière mise à jour :
4 septembre 2026 ». Sections : 1 Éditeur · 2 Hébergement · 3 CGU (3.1 à 3.8) ·
CGV (articles 1 à 6) · 4 RGPD (4.1 à 4.7) · 5 Cookies · 6 Droit applicable ·
7 App Store Privacy · 8 Extension Chrome (permissions détaillées, alignées sur
le manifest).

**Ce qui est déjà bon** : l'article 3 des CGV (plateformes tierces, non
affiliation, sessions de l'utilisateur), l'article 4 (republication = suppression
puis recréation, effet irréversible), l'article 5 (achats antérieurs au 02/09),
la section 8 (permissions de l'extension, une par une).

**Les trois clauses qui ne correspondent plus au code** — c'est le point le plus
important de ce relevé :

1. **CGV article 2 — « Extension Chrome requise »**. Le texte dit que la
   publication, la republication et le retrait *sont exécutés par l'extension*
   et que *sans extension, ces actions ne peuvent pas aboutir*. **Faux depuis le
   6 septembre 2026** : eBay peut être publié par nos serveurs, sans extension
   et ordinateur éteint (`supabase/functions/ebay-api-worker`, voie `api`
   décidée par le trigger `cross_post_jobs_voie_ebay`). L'écran « Compte eBay »
   le promet même explicitement à l'utilisateur (« sans Chrome ni extension,
   même ordinateur éteint »).
2. **Section 7 — App Store Privacy** : « données jamais utilisées pour du
   suivi publicitaire » et « aucun SDK de tracking ou publicitaire ». Or
   `supabase/functions/tiktok-event` envoie à la **TikTok Business API**
   l'e-mail de l'utilisateur (haché SHA-256) et la valeur de la conversion, sur
   événement d'achat. Il n'y a pas de SDK — la deuxième phrase tient — mais la
   première est fausse. TikTok n'apparaît nulle part dans la liste des
   sous-traitants.
3. **Section 4.7 — Sous-traitants** : la liste (Supabase, Vercel, Stripe,
   Google/Apple) est incomplète. Manquent, tous appelés par le code :
   **OpenAI** et **Anthropic** (génération d'annonces, analyse photo),
   **PhotoRoom** et **Remove.bg** (retouche photo), **Resend** (emails
   transactionnels), **TikTok** (conversion), **Google Play** / **Apple** (achats
   in-app). Plusieurs sont hors UE : le transfert n'est pas mentionné.

**Autres écarts, moindres** :
- 4.5 dit « supprimées dans les 90 jours suivant la clôture », 4.6 dit
  « suppression immédiate et définitive ». `delete-account` supprime tout de
  suite (profil, inventaire, fichiers du storage, abonnement). Le 90 jours est
  un reliquat.
- 3.5 « résilier depuis son espace client » : vrai pour Stripe
  (`cancel-subscription`, appelée depuis `src/App.jsx`), **pas** pour les
  abonnements Apple/Google, qui ne se résilient que dans la boutique. Le texte
  le dit plus bas (3.4) mais 3.5 affirme le contraire au-dessus.
- Aucune trace de la loi Chatel ni de la résiliation en trois clics.
- Aucune section DSA (point de contact, signalement).
- Aucun article sur l'absence de garantie de vente. C'est le trou le plus
  béant au regard de ce qu'on vend.

---

## 3. Vérifications de code faites pour ce texte

| Ce que le brouillon affirme | Vérifié où | Résultat |
|---|---|---|
| La republication supprime puis recrée | `cross_post_jobs` action `republish`, champs `deleted_at` / `recreated_at` / `old_vinted_item_id` / `new_vinted_item_id` | conforme — relevé sur des jobs réels |
| Une interruption après suppression reprend à la recréation | `handler-watch`, reprise `captured` | conforme |
| eBay peut publier sans extension | `ebay-api-worker`, trigger `cross_post_jobs_voie_ebay` | conforme depuis le 06/09 |
| Le changement de formule en cours de cycle ajoute la différence | `upgrade_monthly_grant`, migration 20260723150000 | conforme : mois vierge → grant plein ; déjà crédité → **delta** ajouté ; downgrade ou tier identique → **no-op, jamais de reprise** |
| Résilié = plus premium | règle métier 25/07, expression canonique `is_premium OR is_pro OR is_comped` | conforme |
| Suppression de compte immédiate et totale | `delete-account` (profil, inventaire, storage, abonnement) | conforme |
| Résiliation en ligne | `cancel-subscription` (Stripe uniquement) | **partiel** — Apple/Google : boutique |
| E-mail haché envoyé à TikTok | `tiktok-event` | conforme — donc à déclarer |

---

## 4. LE TEXTE — articles à substituer / ajouter

> Numérotation : je garde celle des CGV existantes (articles 1 à 6) et
> j'ajoute 7 à 10. Les sections 4 (RGPD) et 8 (Extension) de la page ne bougent
> pas de numéro : elles sont référencées par les fiches des stores.

### Article 2 — Comment FillSell agit (REMPLACE l'article 2 actuel)

FillSell agit de deux façons, selon la plateforme et selon votre compte.

**Par votre navigateur.** Pour Vinted, Leboncoin et Beebs — et pour eBay tant
que la publication par nos serveurs n'est pas active sur votre compte — les
actions (publication, republication, retrait) sont exécutées par l'extension
Chrome FillSell, installée sur votre ordinateur. L'extension agit **dans votre
navigateur, à l'intérieur de vos propres sessions**, comme vous le feriez
vous-même : elle ne dispose d'aucun accès privilégié aux plateformes et ne
détient aucun identifiant de connexion. Elle n'agit que sur les domaines
énumérés à la section 8, et seulement quand une action a été commandée depuis
votre compte FillSell. Sans extension installée, active, et sans session ouverte
sur la plateforme concernée, ces actions ne peuvent pas aboutir — y compris
lorsqu'elles sont commandées depuis l'application mobile. Votre ordinateur doit
être allumé et le navigateur ouvert.

**Par nos serveurs.** Pour eBay, si vous avez relié votre compte eBay à FillSell
et que votre compte vendeur eBay est complet, la publication est exécutée par
nos serveurs au moyen de l'interface de programmation officielle d'eBay, sans
extension et ordinateur éteint. Cette liaison repose sur une autorisation que
vous accordez chez eBay et que **vous pouvez révoquer à tout moment depuis votre
compte eBay** ; FillSell ne voit jamais votre mot de passe eBay.

Dans les deux cas, vous restez seul titulaire de vos comptes sur les
plateformes, seul responsable du contenu de vos annonces et du respect des
conditions d'utilisation de chaque plateforme.

*Fondé sur : le code de l'extension (permissions du manifest, section 8), et
`ebay-api-worker` + trigger `cross_post_jobs_voie_ebay` pour la voie serveur.*

### Article 3 — Plateformes tierces : ce que nous ne maîtrisons pas (RENFORCE l'article 3 actuel)

FillSell n'est affilié à aucune des plateformes sur lesquelles vos annonces sont
publiées (Vinted, Leboncoin, eBay, Beebs) et n'est ni approuvé, ni sponsorisé,
ni mandaté par elles. Ces plateformes sont des tiers indépendants.

Vous reconnaissez qu'elles peuvent, **à tout moment, sans préavis et sans que
FillSell en soit informé** :

- modifier leurs formulaires, leurs catégories, leurs champs obligatoires ou
  leur fonctionnement, ce qui peut interrompre une publication en cours ou la
  faire échouer ;
- restreindre, ralentir ou bloquer l'activité automatisée, y compris par des
  mécanismes anti-robot ;
- modifier, refuser, masquer ou supprimer une annonce au titre de leur propre
  modération ;
- suspendre ou fermer votre compte chez elles.

FillSell ne garantit ni la disponibilité, ni la continuité, ni le résultat de la
publication sur ces plateformes. Une interruption due à l'une de ces causes
n'ouvre droit à aucun remboursement au titre du service, sans préjudice de
l'article 9 (interruptions durables).

**Conditions des plateformes.** Certaines plateformes encadrent ou interdisent
l'usage d'outils automatisés dans leurs conditions d'utilisation. Il vous
appartient de vérifier les conditions applicables à vos comptes. FillSell ne
peut être tenu responsable d'une mesure prise par une plateforme à votre
encontre, y compris la limitation ou la fermeture de votre compte.

*Fondé sur : art. 1er de la loi du 21 juin 2004 (responsabilité de l'éditeur du
contenu), et sur les faits — mécanismes anti-robot rencontrés en production
(bandeaux de pause `platform_health`), champs retirés par une plateforme sans
préavis (Vinted, champ `status`, 7 septembre 2026).*

### Article 4 — Republication (COMPLÈTE l'article 4 actuel)

La republication d'une annonce Vinted consiste à **supprimer l'annonce existante
puis à en créer une nouvelle**. La nouvelle annonce est une annonce distincte :
les vues, les favoris, les commentaires et l'ancienneté de l'annonce d'origine
sont **définitivement perdus**. L'effet est irréversible : une annonce supprimée
ne peut pas être restaurée par FillSell.

Entre la suppression et la recréation, votre article n'est **pas en ligne**.
Cette fenêtre est normalement de quelques secondes. Si une interruption survient
pendant cette fenêtre — extinction de l'ordinateur, fermeture du navigateur,
perte de session, blocage de la plateforme — l'opération reprend à l'étape de
recréation, le cas échéant après une information ou une action de votre part
dans l'application. **L'aboutissement de la recréation n'est pas garanti**, et
l'annonce d'origine n'est en aucun cas rétablie.

En demandant une republication — ponctuelle ou automatique — vous reconnaissez
et acceptez cet effet.

*Fondé sur : le code (suppression puis recréation, jalons `deleted_at` /
`recreated_at`, reprise par `handler-watch`) et sur des cas réels observés en
production.*

### Article 5 — Aucune garantie de vente ni de résultat (NOUVEAU)

FillSell est un **outil**. Il met en forme et publie vos annonces ; il ne vend
pas à votre place.

FillSell ne garantit, à aucun titre : que votre article sera vendu ; qu'il sera
vu, mis en avant ou classé d'une certaine façon par une plateforme ; un délai de
vente ; un prix de vente ; un volume de visites, de favoris ou de messages ; un
chiffre d'affaires ou une marge.

Les prix suggérés, les estimations et les analyses de rentabilité affichés dans
l'application sont des **indications** calculées à partir de vos propres données
et de comparaisons publiques. Ils ne constituent ni un conseil professionnel, ni
une garantie de valeur.

Les titres, descriptions, catégories et caractéristiques proposés par
l'intelligence artificielle sont des **propositions**. Il vous appartient de les
vérifier avant publication. Vous demeurez l'auteur et le responsable de vos
annonces, notamment au regard de l'exactitude de la description, de la
conformité et de la sécurité du produit, et des règles propres à chaque
plateforme.

FillSell est tenu d'une **obligation de moyens**, et non de résultat.

*Fondé sur : nature du service ; C. civ. art. 1231-1 ; le code n'exécute aucune
vente et n'intervient pas dans la relation entre vous et l'acheteur.*

### Article 6 — Volumes inclus, compteurs et changement de formule (REMPLACE 3.4 + article 1)

Chaque formule comprend des **volumes d'actions par cycle d'abonnement** (annonces
créées par IA, retouches photo, republications). La publication des annonces sur
les plateformes prises en charge est incluse et n'est pas décomptée. Les volumes
en vigueur sont affichés dans l'application, où les compteurs sont visibles à
tout moment ; ce sont ceux affichés au moment de l'utilisation qui s'appliquent.

**Réarmement.** Les volumes se réarment à chaque cycle d'abonnement, c'est-à-dire
à la date anniversaire mensuelle de votre souscription — et non au premier jour
du mois calendaire. Les volumes non utilisés d'un cycle **ne se reportent pas**
sur le suivant.

**Changement de formule en cours de cycle.** Si vous passez à une formule
supérieure, la différence entre le volume de votre formule d'origine et celui de
la nouvelle vous est **ajoutée immédiatement** ; ce que vous avez déjà consommé
reste consommé. Si vous passez à une formule inférieure, **rien ne vous est
repris en cours de cycle** : la nouvelle formule s'applique au cycle suivant.

**Fin d'abonnement.** À la résiliation ou à l'expiration de votre abonnement,
les fonctionnalités réservées aux formules payantes cessent d'être accessibles à
la fin de la période payée. Vos données, votre inventaire et votre historique
restent accessibles dans la formule gratuite.

**Plafond de sécurité.** La republication automatique est plafonnée à
45 republications par jour, quelle que soit la formule. Ce plafond protège votre
compte Vinted contre les restrictions que la plateforme applique aux activités à
haute fréquence ; ce n'est pas une limite commerciale.

**Évolution.** FillSell peut faire évoluer les volumes moyennant un préavis
raisonnable porté à votre connaissance dans l'application. Une évolution ne
s'applique jamais rétroactivement à une période d'abonnement déjà payée.

*Fondé sur : `upgrade_monthly_grant` (migration 20260723150000) — delta ajouté à
la hausse, no-op à la baisse, jamais de reprise ; règle métier « résilié = plus
premium » ; plafond quotidien côté serveur.*

### Article 7 — Prix, paiement, rétractation et remboursement (REMPLACE 3.6 et l'article 6)

**Prix.** Le prix applicable est celui affiché au moment de l'achat. Les prix
pratiqués sur le web et dans les boutiques d'applications peuvent différer pour
une même formule.

**TVA.** TVA non applicable, article 293 B du Code général des impôts.

**Encaissement.** Sur le web, le paiement est traité par **Stripe**. Sur iOS et
Android, il est traité par la boutique concernée (**Apple App Store**,
**Google Play**) : l'abonnement s'y renouvelle automatiquement sauf résiliation
au moins 24 heures avant la fin de la période en cours, et il se gère et se
résilie **dans les réglages de votre compte de la boutique**. FillSell ne reçoit
et ne conserve aucune donnée de carte bancaire.

**Rétractation — 14 jours.** Conformément à l'article L221-18 du Code de la
consommation, vous disposez de **14 jours** à compter de la souscription pour
vous rétracter, sans avoir à vous justifier, en écrivant à
support@fillsell.app. Le remboursement intervient sous 14 jours à compter de la
réception de votre demande, par le même moyen de paiement.

**Exécution immédiate.** Si, à la souscription, vous demandez expressément que
le service commence immédiatement et reconnaissez expressément perdre votre
droit de rétractation une fois le service pleinement exécuté, l'article L221-28
du Code de la consommation s'applique. À défaut d'un tel accord exprès recueilli
au moment de la souscription, **le droit de rétractation s'exerce en totalité**.

> ✅ **ARBITRAGE TRANCHÉ (Nico, 7 septembre 2026) : remboursement intégral sous
> 14 jours. On ne construit aucune case de renonciation.** La rédaction
> ci-dessus est donc définitive sur ce point, et le paragraphe « Exécution
> immédiate » est conservé uniquement pour dire ce qui s'appliquerait si une
> renonciation était un jour recueillie — il ne décrit pas le fonctionnement
> actuel. À la publication, la mention « le remboursement est diminué du prorata
> correspondant à la période déjà écoulée » qui figure aujourd'hui en ligne
> (CGU 3.6 et CGV article 6) **doit disparaître** : elle est sans base tant
> qu'aucune renonciation n'est recueillie.

**Achats par les boutiques.** Pour les achats effectués via l'App Store ou
Google Play, les demandes de remboursement relèvent des conditions de la
boutique concernée et doivent lui être adressées directement — FillSell n'a pas
la main sur ces remboursements.

**Erreur manifeste ou défaut du service.** Indépendamment de la rétractation,
vous pouvez demander un remboursement à support@fillsell.app dans les 7 jours
suivant un débit en cas d'erreur manifeste ou de défaut caractérisé du service.

*Fondé sur : C. consom. L221-18, L221-28 ; CGI art. 293 B ; code — `stripe-webhook`,
`apple-iap-webhook`, `google-play-webhook`.*

### Article 8 — Résiliation (REMPLACE 3.5)

**Sans engagement.** Les formules payantes sont sans durée d'engagement.

**Résiliation en ligne.** Si vous avez souscrit sur le web, vous pouvez résilier
directement depuis l'application, par une fonctionnalité accessible en
permanence dans vos réglages, sans avoir à écrire ni à téléphoner. Un accusé de
réception vous est adressé par e-mail. La résiliation prend effet **à la fin de
la période de facturation en cours** ; aucun remboursement au prorata n'est
effectué pour les jours restants, sans préjudice de l'article 7.

**Souscription par une boutique.** Si vous avez souscrit via l'App Store ou
Google Play, la résiliation s'effectue **dans les réglages de votre compte de la
boutique** : FillSell n'a pas techniquement la main sur ces abonnements.

**Suppression de compte.** Vous pouvez supprimer votre compte et l'intégralité
de vos données depuis l'application (Profil → Réglages → Supprimer mon compte).
La suppression est immédiate et définitive ; elle emporte l'annulation de
l'abonnement en cours.

> ✅ **ARBITRAGE TRANCHÉ (Nico, 7 septembre 2026) : l'accusé de réception sera
> envoyé.** Tant qu'il ne l'est pas, la phrase « un accusé de réception vous est
> adressé par e-mail » ne doit pas être publiée.
>
> **Ce que ça demande, précisément :**
> 1. `cancel-subscription` n'envoie aujourd'hui **aucun** e-mail (vérifié : ni
>    Resend, ni autre). Il faut y ajouter un envoi après l'annulation Stripe
>    réussie, et **seulement** après — un accusé envoyé sur un échec serait pire
>    que pas d'accusé.
> 2. Le socle existe déjà : `RESEND_API_KEY` est en place et `email-tunnel`
>    envoie déjà des e-mails transactionnels. C'est un gabarit de plus, pas une
>    brique de plus.
> 3. Contenu imposé par l'esprit du texte (support durable) : la date et l'heure
>    de la demande, la formule concernée, **la date à laquelle l'accès prend
>    fin** (fin de la période payée), et le rappel que les données restent
>    accessibles en formule gratuite.
> 4. Traçabilité : une ligne dans `email_logs`. ⚠️ Le type sera **récurrent**
>    (un utilisateur peut résilier plusieurs fois dans sa vie) : il ne doit
>    donc **PAS** entrer dans l'index partiel `email_logs_one_shot_unique`,
>    sinon la deuxième résiliation d'un même compte échouerait en 23505.
> 5. Périmètre : uniquement les résiliations **web** (Stripe). Une résiliation
>    faite dans l'App Store ou Google Play ne passe pas par nous — c'est la
>    boutique qui accuse réception, et le texte le dit.
>
> Coût estimé : une petite heure, dont l'essentiel en rédaction du message.

*Fondé sur : C. consom. L215-1-1 et décret 2023-417 ; code — `cancel-subscription`,
`delete-account`.*

### Article 9 — Disponibilité, interruptions et maintenance (REMPLACE 3.7)

FillSell s'efforce d'assurer la disponibilité du service, sans garantir un taux
de disponibilité déterminé. Aucun engagement de niveau de service n'est
souscrit.

Le service peut être interrompu, en tout ou partie :

- pour maintenance, correction ou mise à jour, sans préavis en cas d'urgence ;
- du fait d'un prestataire technique (hébergement, base de données, services
  d'intelligence artificielle, traitement des paiements) ;
- du fait d'une plateforme tierce (article 3), y compris par un blocage
  automatisé ;
- du fait de votre propre environnement : ordinateur éteint, navigateur fermé,
  extension désactivée ou non mise à jour, session expirée sur une plateforme ;
- en cas de force majeure au sens de l'article 1218 du Code civil.

Les actions en attente ne sont pas perdues du fait d'une interruption : elles
restent en file et reprennent, sauf lorsque leur exécution est devenue
impossible — auquel cas leur état est visible dans l'application.

**Interruption durable.** Si le service devenait indisponible de façon prolongée
et imputable à FillSell, vous pouvez demander le remboursement de la fraction de
l'abonnement correspondant à la période non servie.

*Fondé sur : C. civ. art. 1218 ; code — file `cross_post_jobs`, reprise par
`handler-watch`, statuts visibles dans l'application.*

### Article 10 — Responsabilité (NOUVEAU)

FillSell répond des dommages directs et prévisibles résultant d'un manquement
qui lui est imputable. FillSell ne répond pas des dommages résultant : d'une
décision, d'une panne ou d'une modification d'une plateforme tierce ; d'une
mesure prise par une plateforme contre votre compte ; du contenu de vos
annonces ; de la perte de vues, de favoris ou d'ancienneté consécutive à une
republication que vous avez demandée (article 4) ; d'un défaut de votre
environnement technique.

Aucune stipulation des présentes n'a pour effet de limiter les droits que vous
tenez, en qualité de consommateur, des dispositions d'ordre public — notamment
la garantie légale de conformité et la garantie des vices cachés.

*Fondé sur : C. civ. art. 1231-3 ; C. consom. L212-1 (les clauses créant un
déséquilibre significatif sont réputées non écrites) — d'où l'absence de plafond
chiffré, qui appelle un avis (§5).*

### Section 4 (RGPD) — compléments à apporter

**4.7 Sous-traitants** — liste à remplacer par :

| Sous-traitant | Rôle | Localisation |
|---|---|---|
| Supabase | base de données, authentification, stockage des photos | UE (AWS eu-west-1) |
| Vercel | hébergement du site | États-Unis |
| Stripe | paiements web | UE / États-Unis |
| Apple, Google | achats in-app, connexion optionnelle | États-Unis |
| OpenAI | génération et analyse de contenu d'annonces | États-Unis |
| Anthropic | génération et analyse de contenu d'annonces | États-Unis |
| PhotoRoom | retouche photo | UE |
| Remove.bg | détourage photo | UE |
| Resend | e-mails transactionnels | États-Unis |
| TikTok | mesure des conversions publicitaires | hors UE |

**4.8 Transferts hors Union européenne (NOUVEAU)** — certains sous-traitants
sont établis hors de l'Union. Ces transferts sont encadrés par les clauses
contractuelles types de la Commission européenne ou, le cas échéant, par une
décision d'adéquation.

**4.9 Mesure publicitaire — SUPPRIMÉE**

> ✅ **ARBITRAGE TRANCHÉ (Nico, 7 septembre 2026) : on coupe l'envoi.** Pas de
> consentement à construire. Une fois la coupe faite, aucune section 4.9 n'est
> nécessaire, et les phrases déjà en ligne (« jamais utilisées pour du suivi
> publicitaire », « aucun SDK de tracking ou publicitaire », « aucun cookie
> publicitaire ni traceur tiers ») redeviennent vraies — elles ne le sont pas
> aujourd'hui.
>
> **Périmètre exact de la coupe — 7 endroits, dont un que je n'avais pas vu au
> premier relevé :**
>
> | # | Où | Ce que c'est |
> |---|---|---|
> | 1 | `index.html` lignes 197-205 | **Le pixel TikTok navigateur** (`ttq.load('D8ELPJJC77UANKFS7C60')` puis `ttq.page()`). Chargé sur CHAQUE page du site, pour CHAQUE visiteur, avant tout consentement. C'est lui le vrai sujet : il dépose des cookies tiers et c'est un SDK publicitaire. |
> | 2 | `src/lib/tiktok.ts` | le client (`trackTikTokEvent`) |
> | 3 | `src/App.jsx:2687` | `InitiateCheckout` (e-mail + montant) |
> | 4 | `src/App.jsx:5058` | `CompleteRegistration` (e-mail) |
> | 5 | `supabase/functions/tiktok-event` | la fonction serveur qui hache l'e-mail et appelle la TikTok Business API |
> | 6 | `stripe-webhook` (2 appels), `validate-apple-receipt`, `validate-google-purchase` | les 4 appels serveur d'événements d'achat |
> | 7 | secrets `TIKTOK_ACCESS_TOKEN`, `TIKTOK_PIXEL_ID` | à retirer après la coupe |
>
> `index.html:94` contient aussi un simple lien vers le profil TikTok de la
> marque : **ce n'est pas du traçage, on le garde.**
>
> **Ce que ça casse — rien, techniquement.** Les appels sont tous en
> « tire et oublie » : `trackTikTokEvent` est enveloppé dans un try/catch et ne
> rend rien ; les 4 appels serveur sont suivis d'un `.catch()` et ne
> conditionnent aucune écriture. Aucun crédit, aucun abonnement, aucun e-mail ne
> dépend d'eux. Supprimer les 7 points ci-dessus ne change aucun comportement
> visible par un utilisateur.
>
> **Ce que ça coûte — la mesure publicitaire.** Si des campagnes TikTok Ads
> tournent, elles perdent : l'attribution des conversions (inscription et
> achat), l'optimisation automatique sur ces événements, et le reporting de ROAS
> dans TikTok Ads Manager. Les campagnes continueront de diffuser, mais à
> l'aveugle.
>
> ✅ **COUPE FAITE le 7 septembre 2026** aux 7 endroits : pixel retiré
> d'`index.html`, `src/lib/tiktok.ts` supprimé, les 2 appels d'`App.jsx`
> retirés, la fonction `tiktok-event` supprimée du dépôt ET de la production,
> les 4 appels serveur retirés, les secrets `TIKTOK_ACCESS_TOKEN` et
> `TIKTOK_PIXEL_ID` retirés. Les trois phrases de la page légale
> (« jamais utilisées pour du suivi publicitaire », « aucun SDK de tracking ou
> publicitaire », « aucun cookie publicitaire ni traceur tiers ») sont
> redevenues vraies **pour TikTok**.
>
> ⚠️ **MAIS elles restent fausses tant que Google Tag Manager est là.**
> `index.html` charge encore GTM (conteneur `GTM-TJNKL6T5`, plus une balise
> `<noscript>` vers googletagmanager.com), sur chaque page et sans consentement.
> C'est exactement le même problème juridique que le pixel TikTok. Hors du
> périmètre demandé le 7 septembre : **à trancher séparément.**

### Section 9 — Signalement et point de contact (NOUVEAU, DSA)

**Point de contact.** Pour toute question, réclamation ou signalement :
support@fillsell.app. Vous pouvez écrire en français ou en anglais.

**Signalement de contenu illicite.** Si vous estimez qu'un contenu hébergé par
FillSell est illicite, vous pouvez le signaler à cette adresse en indiquant le
contenu concerné, son emplacement et les motifs de votre signalement. Chaque
signalement fait l'objet d'un examen et d'une réponse motivée.

**Modération.** FillSell peut suspendre ou supprimer un contenu manifestement
illicite ou contraire aux présentes conditions. La décision est motivée et vous
pouvez la contester à la même adresse.

### Section 6 — Médiation (À COMPLÉTER)

Conformément aux articles L616-1 et R616-1 du Code de la consommation, le
consommateur peut recourir gratuitement au médiateur de la consommation dont
relève FillSell : **[NOM DU MÉDIATEUR — adhésion à souscrire]**,
**[adresse postale]**, **[site web]**. Plateforme européenne de règlement en
ligne des litiges : ec.europa.eu/consumers/odr.

---

## 5. Ce qui mérite vraiment un avocat — liste courte

1. **La rétractation et sa renonciation.** C'est la clause la plus exposée : sa
   validité dépend d'un consentement exprès recueilli et tracé au moment de la
   souscription. Aujourd'hui il n'est pas recueilli, et le texte en ligne
   applique quand même un prorata. À faire cadrer, formulation comprise.
2. **La loi Chatel (L215-1) sur un abonnement mensuel sans engagement.**
   S'applique-t-elle, et sous quelle forme pour un cycle d'un mois ? La sanction
   (résiliation gratuite + remboursement sous 30 jours) est trop lourde pour
   qu'on tranche entre nous.
3. **La clause de responsabilité.** Face au droit de la consommation, une
   limitation mal rédigée est réputée non écrite (L212-1). Quel plafond, quelles
   exclusions sont réellement opposables à un consommateur ?
4. **Le statut au regard du DSA.** Hébergeur ? Plateforme en ligne ? La réponse
   commande le point de contact, la modération et le mécanisme de signalement.
5. **L'automatisation au regard des conditions des plateformes.** Le vrai risque
   pour l'utilisateur est la suspension de son compte Vinted, Leboncoin, eBay ou
   Beebs. Quelle information doit-on lui donner, et jusqu'où peut-on s'exonérer ?
6. **Les transferts hors UE et les contrats de sous-traitance.** Onze
   sous-traitants, dont la moitié aux États-Unis, sans DPA vérifié ni clauses
   contractuelles types au dossier.
7. **La responsabilité du contenu généré par IA** et la répartition des rôles
   entre FillSell et le vendeur au regard de la conformité produit et de
   l'obligation d'information de l'acheteur.
8. **Le médiateur de la consommation** : l'adhésion est obligatoire pour un
   professionnel qui vend à des consommateurs, et il faut le nommer.

---

## 6. Ordre de travail proposé

1. ✅ **Fait le 7 septembre 2026** — les trois arbitrages sont tranchés :
   remboursement intégral 14 jours (pas de case de renonciation) ; coupe de
   TikTok ; envoi de l'accusé de réception de résiliation.
2. Nico complète le §0 (identité, SIRET, adresse, téléphone, médiateur) —
   annoncé pour le lendemain.
3. Le code rattrape ce que le texte promet, dans cet ordre :
   a. couper TikTok aux 7 endroits du §4.9 (attente d'une confirmation : la
      perte de mesure publicitaire est une décision marketing) ;
   b. ajouter l'accusé de réception de résiliation (§ article 8) ;
   c. retirer la mention de prorata aujourd'hui en ligne (CGU 3.6, CGV art. 6).
4. Relecture avocat sur les 8 points du §5.
5. Publication de la page, et mise à jour de la date de dernière modification.
