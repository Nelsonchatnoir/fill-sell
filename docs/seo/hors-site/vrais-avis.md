# Vrais avis de vrais clients : App Store, Google Play, Chrome Web Store, Trustpilot (09/10/2026)

> Chantier SEO/GEO, partie hors site. Rédigé le **2026-10-09** (soir).
> **Préparation seulement.** Rien n'a été envoyé, publié, demandé ni modifié : aucune connexion à un
> compte, aucun store touché, aucun SQL, aucun commit. Toutes les pages publiques ont été lues le
> 2026-10-09 entre 17:49 et 18:10 (heure de Paris), sauf mention contraire.
> Les gestes (publier un binaire, envoyer un mail, ouvrir un compte Trustpilot, changer du code) sont
> des **décisions de Nico**.
> Cadre : `docs/seo/PLAN.md`, `etat-des-lieux/03c-decisions-nico-0910.md` (priment),
> `03-fiche-de-verite.md`, `05-reponses-ia.md`. Document voisin : `hors-site/cibles-editoriales.md`
> (comparatifs, forums, médias).

---

## 0. L'essentiel

1. **La preuve sociale est quasi nulle, et c'est le premier frein que les IA nomment.** Chrome Web
   Store : 5,0 sur **1 avis** (360 utilisateurs). App Store France : 5,0 sur **3 notes**, un seul avis
   écrit (29 juillet) ; **0 note** sur les vitrines États-Unis, Royaume-Uni, Irlande et Belgique.
   Google Play : **aucune note affichée** (500+ téléchargements). Trustpilot : aucune page trouvée.
   ChatGPT, interrogé sur la marque le 09/10, conclut « 6,5/10 : trop peu évaluée » (`05-reponses-ia.md` C3).
2. **La demande d'avis existe déjà dans le code, mais elle n'a jamais pu s'afficher sur téléphone.**
   Elle passe par la fenêtre officielle d'Apple et de Google (plugin `@capgo/capacitor-in-app-review`),
   qui n'existe que dans les binaires **2.9.38 et plus**. Or les stores servent l'**app 2.8** (App
   Store, 24/09) et **2.9.10** (Google Play, 24/09). Sur ces binaires, le code ne demande rien : c'est
   voulu (`src/utils/plateformeAvis.js`). Les 3 notes iOS n'ont donc pas pu venir de cette demande.
   **Action n° 1, et de loin la plus rentable : publier un binaire ≥ 2.9.62** (fabrication prévue par
   `npm run binaires:2.9.62` ; l'AAB 2.9.38 attend déjà d'être téléversé).
3. Sur ordinateur, la carte d'avis (app web et popup de l'extension) mène au Chrome Web Store : elle
   tourne depuis la 0.6.86. Son texte (« Si FillSell te fait gagner du temps… ») sollicite surtout les
   contents : à rendre neutre (§ 4.1).
4. Moments à ajouter, tous sous la même règle serveur (60 jours, « plus jamais » après un avis) : une
   **vente enregistrée dont les copies sont toutes retirées**, une **première synchronisation rangée**,
   un **lot publié en entier**, une **semaine de republication automatique sans accroc** (§ 3).
5. Cadre légal français : `L111-7-2` et `D111-16` à `D111-19` (toute personne qui collecte, modère ou
   diffuse des avis), `L121-3` (information substantielle sur l'authenticité), `L121-4` 27° et 28°
   (faux avis = pratique trompeuse en toutes circonstances). Sanctions : jusqu'à **5 ans et 750 000 €**
   quand la pratique passe par un service en ligne (`L132-2`), amende administrative jusqu'à
   **75 000 € / 375 000 €** pour les obligations d'information (`L131-4`). § 5.
6. Apple, Google, le Chrome Web Store et Trustpilot interdisent tous la **contrepartie** contre un avis.
   Apple impose sa fenêtre (« custom review prompts » refusés) ; Google interdit toute question
   avant sa carte (« Do you like the app? ») ; Trustpilot interdit d'inviter seulement les contents.
7. **Jamais** : faux avis, avis acheté, avis d'un proche ou de l'équipe, quotas ou mois offerts contre
   un avis, échange d'avis, suppression ou signalement d'un avis parce qu'il est négatif (§ 6).

---

## 1. Point de départ public (relu le 2026-10-09)

| Lieu | Ce qui s'affiche | Source (lue le 2026-10-09) |
|---|---|---|
| Chrome Web Store | **5,0 (1 avis)**, 360 utilisateurs, version 0.6.104 du 8 octobre 2026 ; développeur déclaré **professionnel** au sens de l'UE | https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm?hl=fr |
| App Store, France | « FillSell – Achat Revente », **5,0 (3 notes)**, un avis écrit daté du 29 juillet ; version **2.8** du 24 septembre ; mention « Le fournisseur […] ne s'est pas identifié comme commerçant de cette app » | https://apps.apple.com/fr/app/fillsell-achat-revente/id6762152785 |
| App Store, autres vitrines | US, GB, IE, BE : `userRatingCount` = **0** ; US : « This app hasn't received enough ratings or reviews to display an overview » | https://itunes.apple.com/lookup?id=6762152785&country=us (et `gb`, `ie`, `be`) ; https://apps.apple.com/us/app/fillsell-reseller-app/id6762152785 |
| Google Play | **aucune note affichée**, 500+ téléchargements, mise à jour du 24 sept. 2026 ; la page porte la version **2.9.10** (donnée embarquée dans la page) | https://play.google.com/store/apps/details?id=app.fillsell.app&hl=fr&gl=FR |
| Trustpilot | Aucune page FillSell trouvée par la recherche ; la page `fr.trustpilot.com/review/fillsell.app` répond par un contrôle anti-robot (403) : **arrêt, pas de contournement** | recherche « trustpilot "fillsell.app" » (WebSearch, 09/10) ; https://fr.trustpilot.com/review/fillsell.app |
| Ce qu'en disent les IA | ChatGPT : « 6,5/10 », « trop peu évaluée » ; Google sur « FillSell avis » : ScamDoc « 25 % », annonce de test Leboncoin indexée | `docs/seo/etat-des-lieux/05-reponses-ia.md` § 0 et C3 (relevé du 09/10) |

À titre de comparaison (matrice du 09/10, `briefs/concurrents-matrice.md` § 1.5) : Redrip 4,4 (26 avis),
Clemz 4,8 (147), FLUF Connect 4,5 (10) sur le Chrome Web Store ; Crosslist 4,7 (382) sur l'App Store US.

---

## 2. Ce qui existe déjà dans l'app (code relu dans le worktree `fill-and-sell-seo`, HEAD `8fa7007`)

### 2.1 La règle, au serveur

`supabase/functions/_shared/avis-demande.js` (décision de Nico du 02/10) et la fonction edge
`supabase/functions/avis-demande/index.ts` (`verify_jwt` par défaut, JWT de la personne) :

| Règle | Valeur | Ligne |
|---|---|---|
| Déclencheur unique | **10 actions réussies d'affilée** (publications, republications, retraits aboutis), **sans aucun échec** entre elles | `AVIS.SERIE_REQUISE = 10` (`_shared/avis-demande.js:30`) |
| Ce qui remet à zéro | un échec, une question en attente (`needs_user`), une pause de notre fait | `issueJob()` (`:86-114`) |
| Compte | au moins **3 jours**, entrée finie (`onboarded_at`) | `:208-209` |
| Paiement | aucune demande dans les **24 h** qui suivent un paiement | `:222-225` |
| Tâche bloquée | jamais si une tâche est bloquée, figée ou en échec (< 14 jours) | `tacheBloqueePourAvis()` (`:148-168`) |
| Écart | **60 jours** entre deux demandes, tous canaux | `ECART_MIN_JOURS` (`:31`) |
| « Plus tard » | 30 jours | `PLUS_TARD_JOURS` (`:32`) |
| « Laisser un avis » / « C'est déjà fait » | **plus jamais** sur ce canal | `:215-216` |
| Canaux | `ios`, `android`, et `chrome` (l'app web sur ordinateur et l'extension mènent toutes deux à la page d'avis du Chrome Web Store) | `canalAvis()` (`:171-174`) |
| Trace | `usage_logs`, `feature = 'avis_demande'`, `metadata { evenement, plateforme, declencheur, serie }` | `index.ts:61-67` |

Un fait illisible = on n'ouvre pas ; la demande ne bloque jamais rien (`index.ts:21-22`).

### 2.2 Les trois portes

| Où | Quoi | Fichier |
|---|---|---|
| iPhone, Android | la **fenêtre officielle** du store (StoreKit `requestReview`, Play In-App Review) par `CapgoInAppReview.requestReview()` ; rien devant, rien à la place. Premier essai **45 s** après le lancement, **sur le tableau de bord seulement**, puis au plus toutes les 10 min, **une demande par session** | `src/hooks/useDemandeAvis.js:9-16, 25-72` |
| App web sur ordinateur | une carte (« 10 actions, zéro accroc ») qui ouvre la page d'avis du Chrome Web Store | `src/components/CarteAvis.jsx:15-21` ; URL `…/ooeagobimgoabciggfamljdfpkginhnm/reviews` (`_shared/avis-demande.js:37`) |
| Popup de l'extension | la même carte, jamais pendant une action, au plus une question au serveur toutes les 3 h quand la réponse est non | `chrome-extension/popup.js:1467-1537` |
| Web sur téléphone | rien (l'extension ne s'installe pas sur un téléphone) | `src/utils/plateformeAvis.js:21-23` |

### 2.3 Le constat qui compte : sur téléphone, la demande n'a jamais pu partir

- Le plugin natif n'est présent que dans les binaires **≥ 2.9.38** (`android/app/build.gradle:100-102` :
  « versionCode 32 / versionName 2.9.38 (02/10) : la demande d'avis OFFICIELLE » ; `codemagic.yaml:89-93`).
- Un binaire plus ancien reçoit le code par l'OTA **sans** le plugin : `plateformeAvis()` rend `null`
  et **rien n'est appelé**, ni le serveur ni le plugin (`src/utils/plateformeAvis.js:6-9, 16-19`) —
  c'est voulu, prouvé par `npm run selftest:avis-plugin-absent`.
- Binaires servis le 09/10 : **App Store 2.8** (`currentVersionReleaseDate` 2026-09-24,
  https://itunes.apple.com/lookup?id=6762152785&country=fr) et **Google Play 2.9.10** (page Play,
  mise à jour du 24 sept. 2026). Dans le dépôt, l'AAB 2.9.38 est rangé « à téléverser »
  (`CLAUDE.md`, « Ouvert : binaires 2.9.38 ») et les binaires 2.9.62 (notifications de vente) se
  fabriquent par `npm run binaires:2.9.62` (`docs/agents/etat-2026-10-01.md:1414`).
- **Conséquence** : depuis le 02/10, la seule demande d'avis réellement possible est la carte du
  Chrome Web Store (ordinateur). Sur iPhone et Android, zéro.

**Recommandation R1 (geste de Nico, priorité absolue)** : publier un binaire ≥ 2.9.62 sur les deux
stores (il porte la demande d'avis **et** les notifications de vente). Dès qu'il est servi, la règle
du § 2.1 s'applique toute seule aux comptes qui ont déjà leurs 10 réussites.

### 2.4 Mesure à lire (requête en lecture seule, à lancer par Nico, non lancée ici)

```sql
-- Combien de demandes d'avis, par canal et par réponse, depuis le 02/10/2026
select metadata->>'plateforme' as canal,
       metadata->>'evenement'  as evenement,
       count(*)                as nb,
       min(created_at at time zone 'Europe/Paris') as premiere,
       max(created_at at time zone 'Europe/Paris') as derniere
from public.usage_logs
where feature = 'avis_demande'
group by 1, 2
order by 1, 2;
```

À comparer, chaque mois, au nombre d'avis visibles sur chaque store (§ 7). Attention : sur iOS et
Android, `affiche` veut dire « demande transmise au store », pas « fenêtre vue » : Apple et Google
décident seuls de l'afficher (§ 5.3).

---

## 3. Quand demander (proposition — le code des nouveaux moments est un chantier séparé)

Principe commun à Apple, Google et Trustpilot : **demander à un moment de réussite, à tout le monde
de la même façon, sans filtrer selon l'humeur**. Choisir le moment n'est pas filtrer : c'est ce que
recommandent Apple (« Ask for a rating only after people have demonstrated engagement », HIG) et
Google (« after a user has experienced enough of your app »). Filtrer, c'est demander d'abord
« Tu es content ? » puis n'envoyer au store que les « oui » : interdit (§ 5.3, § 5.5).

| # | Moment | Pourquoi c'est le bon | Garde-fous propres | État |
|---|---|---|---|---|
| M1 | **10 actions réussies d'affilée** (publications, republications, retraits) | la promesse « une annonce, plusieurs plateformes » vient d'être tenue dix fois | règle du § 2.1 | **existe** (`serie_10_reussites`) |
| M2 | **Une vente enregistrée par FillSell dont toutes les autres annonces ont été retirées** (« Vendu ici, retiré là-bas ») | c'est le moment le plus fort du produit : la double vente vient d'être évitée | à la **prochaine ouverture** de l'app, sur le tableau de bord, jamais depuis la notification ou le mail de vente ; seulement si aucune question « Déjà vendu ? » n'est ouverte ; ventes Vinted et eBay (enregistrées seules) ou Leboncoin et Beebs confirmées par la personne | à coder (déclencheur `vente_propre` dans `_shared/avis-demande.js`) |
| M3 | **Première synchronisation rangée** : relevés finis, rapprochement terminé, aucune « Annonce à vérifier » ouverte | le stock entier vient d'arriver, rangé, sans ressaisie | compte ≥ 3 jours (règle existante) : souvent la 2e synchronisation | à coder |
| M4 | **Un lot publié en entier** (publication en lot, tous les articles partis) | gros gain de temps visible d'un coup | aucun échec dans le lot | à coder |
| M5 | **Une semaine de republication automatique sans accroc** | le produit travaille « pendant que tu fais autre chose » | ordinateur vu, aucune retenue serveur dans la semaine ; ne s'applique qu'aux comptes où l'automatique est active (pas de palier écrit, décision de Nico 09/10) | à coder |

**Jamais** : au premier lancement ou pendant l'entrée ; pendant une action (publication, synchro) ;
après un échec, une question en attente ou un paiement (24 h) ; en réponse à un bouton (Apple :
« Avoid requesting a review as the result of a user action » ; Google : pas de bouton qui déclenche
l'API) ; depuis une notification push ; avec une question avant la fenêtre du store.

**Un lien permanent, en plus (proposition)** : dans Réglages, une ligne « Donner mon avis » qui ouvre
directement la page du store, sans fenêtre intermédiaire :
- iPhone : `https://apps.apple.com/app/id6762152785?action=write-review` (lien prévu par Apple pour
  une action de l'interface : « a deep link to the App Store page for the app with the query
  parameter `action=write-review` », https://developer.apple.com/documentation/storekit/requesting-app-store-reviews, lu le 09/10) ;
- Android : `https://play.google.com/store/apps/details?id=app.fillsell.app` (Google : pour un bouton,
  « redirect the user to the Play Store instead », https://developer.android.com/guide/playcore/in-app-review, page du 2026-01-30, lue le 09/10) ;
- ordinateur : `https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm/reviews`.
Aucun lien de ce type n'existe aujourd'hui dans `src/` (recherche de `write-review` et des URL de
stores, 09/10 : seulement les pages d'abonnement).

---

## 4. Les textes (FR et EN)

Ton : tutoiement (registre de l'app). Aucune contrepartie, aucun chiffre de quota, aucune promesse.
Sur iPhone et Android : **aucun texte** avant la fenêtre du store (règles Apple et Google, § 5.3).

### 4.1 Carte d'avis (app web sur ordinateur et popup de l'extension → Chrome Web Store)

Aujourd'hui (`CarteAvis.jsx:15-21`, `popup.js:1525-1532`) : titre « 10 actions, zéro accroc », texte
« Si FillSell te fait gagner du temps, ton avis nous aide énormément. ». La condition « si FillSell te
fait gagner du temps » invite surtout les contents : c'est une forme douce de tri, proche du
« pre-screening » que Trustpilot interdit (§ 5.5) et du « filtered feedback » visé par Apple (§ 5.2) ;
le Chrome Web Store pourrait y voir une façon de gonfler les notes (§ 5.4).
Proposition (les deux fichiers ensemble ; `chrome-extension/` impose de recaler `EXTENSION_LAST_COMMIT`) :

| | FR | EN |
|---|---|---|
| Titre | « Ton avis compte » | "Your review counts" |
| Texte | « Bon ou mauvais, ton avis aide d'autres revendeurs à choisir, et nous dit quoi améliorer. » | "Good or bad, your review helps other resellers choose, and tells us what to improve." |
| Bouton principal | « Donner mon avis » | "Leave a review" |
| Secondaires | « Plus tard » · « C'est déjà fait » | "Later" · "Already done" |

Le titre actuel « 10 actions, zéro accroc » peut rester (il dit le moment, il ne filtre pas) : choix de Nico.

### 4.2 Ligne permanente dans Réglages

| | FR | EN |
|---|---|---|
| Libellé | « Donner mon avis sur l'App Store » / « … sur Google Play » / « … sur le Chrome Web Store » | "Rate FillSell on the App Store" / "… on Google Play" / "… on the Chrome Web Store" |
| Sous-titre | « Bon ou mauvais, il aide les autres revendeurs. » | "Good or bad, it helps other resellers." |

### 4.3 Mail unique à tous les comptes actifs (proposition, geste de Nico)

- Cible **objective, sans tri par satisfaction** : tous les comptes qui ont au moins 10 actions
  réussies sur les 60 derniers jours (même critère que M1), désinscrits exclus.
- Catégorie `marketing` (plafond de 2 mails par 24 h, lien de désinscription), envoi par
  `public.envoyer_mail_ponctuel` en simulation d'abord (`CLAUDE.md`, « ENVOYER UN MAIL »).
  Type one-shot (ex. `avis_stores_2026`) : **à ajouter à l'index `email_logs_one_shot_unique` le jour
  même** (`CLAUDE.md`, « email_logs »).
- **Après** la publication des binaires (sinon le lien App Store mène à une app 2.8).

FR :
> **Objet** : Ton avis sur FillSell ?
>
> Bonjour {{prenom}},
>
> Tu utilises FillSell pour publier et suivre tes annonces. Un avis sur le store aide d'autres
> revendeurs à savoir si l'app leur convient, et il nous dit ce qu'il faut améliorer. Bon ou mauvais,
> il compte autant.
>
> - iPhone : [lien App Store `?action=write-review`]
> - Android : [lien Google Play]
> - Extension Chrome : [lien Chrome Web Store /reviews]
>
> Rien n'est offert en échange, et c'est voulu : les avis doivent rester libres.
> Un souci ? Réponds simplement à ce mail.

EN :
> **Subject**: Your review of FillSell?
>
> Hi {{prenom}},
>
> You use FillSell to post and track your listings. A store review helps other resellers decide
> whether the app suits them, and tells us what to improve. Good or bad, it counts just the same.
>
> - iPhone: [App Store link `?action=write-review`]
> - Android: [Google Play link]
> - Chrome extension: [Chrome Web Store /reviews link]
>
> Nothing is offered in return, on purpose: reviews must stay free.
> A problem? Just reply to this email.

Les trois liens sont donnés à tout le monde, avant la phrase sur les soucis : aucun aiguillage
« content → store, mécontent → support ».

### 4.4 Répondre aux avis (App Store, Google Play, Chrome Web Store)

Apple : réponses « targeted to the user's comments », sans « personal information, spam, or
marketing » (règle 5.6.1). Google et le Chrome Web Store : même esprit. Modèles :

| Cas | FR | EN |
|---|---|---|
| Positif | « Merci pour ton avis ! Content que [ce qu'il cite] te serve. Si une idée te vient, support@fillsell.app. » | "Thanks for your review! Glad [what they mention] helps. Any idea, support@fillsell.app." |
| Négatif, bug | « Merci de l'avoir signalé, et désolé pour [le problème cité]. Écris-nous à support@fillsell.app avec ton adresse de compte : on regarde ton cas. » | "Thanks for flagging this, and sorry about [the issue]. Email support@fillsell.app with your account email and we'll look into it." |
| Négatif, fonction absente | « Merci pour ton retour. [Fonction] n'existe pas aujourd'hui ; on l'a notée. » (jamais de date promise) | "Thanks for the feedback. [Feature] isn't available today; we've noted it." (never promise a date) |
| Plateforme non servie (ex. Vinted UK) | « Merci. Aujourd'hui FillSell fonctionne avec Vinted France, Leboncoin, eBay France, Beebs et Depop, pour les vendeurs basés en France. » | "Thanks. Today FillSell works with Vinted France, Leboncoin, eBay France, Beebs and Depop, for sellers based in France." |

Depop dans la dernière ligne seulement sous la condition D1 (`03c` § 2.2). Jamais de pseudo de client,
d'adresse, de numéro d'annonce ni de capture de compte dans une réponse publique.

### 4.5 Sur fillsell.app (futur site)

- Afficher les notes des stores **telles qu'elles sont**, avec le nombre et la date : « 5,0 sur
  l'App Store (3 notes, relevé le JJ/MM) ». Jamais « noté 5 étoiles » seul (fiche F01, « à ne pas
  dire »). Aucune note dans le JSON-LD (`ARCHITECTURE.md` : « AUCUNE note ni avis »).
- Un témoignage n'est publié qu'avec l'**accord écrit** de la personne, son prénom (ou pseudo)
  choisi par elle, la date, ses plateformes, **sans retouche** autre qu'orthographique ; jamais un
  témoignage inventé, jamais un membre de l'équipe ou un proche.
- Dès que fillsell.app affiche des avis ou témoignages, FillSell **diffuse** des avis au sens de
  `L111-7-2` : il faut alors, à proximité, le bloc d'information du § 5.1 (proposition ci-dessous,
  à placer près des avis et dans `/legal`).

FR :
> **Comment nous affichons les avis.** Les notes viennent de l'App Store, de Google Play et du Chrome
> Web Store ; nous les recopions avec leur nombre et la date du relevé, sans tri. Les témoignages sont
> publiés avec l'accord écrit de leurs auteurs, clients de FillSell, sans modification autre
> qu'orthographique ; nous vérifions que l'auteur a un compte FillSell actif. Aucune contrepartie
> n'est offerte pour un avis. Les témoignages sont classés du plus récent au plus ancien et retirés au
> plus tard [durée à fixer par Nico] après leur publication, ou à la demande de leur auteur.
> Un témoignage refusé : nous en donnons la raison à son auteur.

EN :
> **How we display reviews.** Ratings come from the App Store, Google Play and the Chrome Web Store;
> we copy them with their count and the date we checked, unfiltered. Testimonials are published with
> the written consent of their authors, FillSell customers, with no change other than spelling; we
> check that the author has an active FillSell account. Nothing is offered in exchange for a review.
> Testimonials are listed newest first and removed at the latest [period set by Nico] after
> publication, or when their author asks. If we decline a testimonial, we tell its author why.

### 4.6 Trustpilot (éventuel, plus tard)

- **Pour** : la page Trustpilot d'une marque ressort sur « <marque> avis » (sur « FillSell avis », c'est
  aujourd'hui l'homonyme qui y figure, `05-reponses-ia.md` C3) ; une page réclamée, nourrie d'avis
  réels, répond à ScamDoc et à l'homonyme.
- **Contre** : il faut inviter **tout le monde de la même façon** (« Invite consistently and fairly —
  this means inviting everyone in the same way »), répondre, ne jamais signaler un avis parce qu'il
  déplaît ; les invitations gratuites sont limitées (nombre exact **non vérifié** le 09/10).
- **Ordre proposé** : d'abord les stores (R1), puis Trustpilot si Nico le veut. L'inscription est un
  geste de Nico. Si oui : invitation automatique au même moment pour tous (ex. M2), jamais à la main
  aux seuls contents.

---

## 5. Le cadre légal et les règles des stores

Textes relus le 2026-10-09. Les citations de Légifrance sont courtes ; le texte intégral fait foi.

### 5.1 Droit français : celui qui collecte, modère ou diffuse des avis

| Texte | Ce qu'il impose | Source (lue le 09/10) |
|---|---|---|
| **Art. L111-7-2** du Code de la consommation (version en vigueur depuis le **17/02/2024**, loi n° 2024-449 du 21 mai 2024, art. 52) | Toute personne qui **collecte, modère ou diffuse** des avis en ligne de consommateurs délivre une information « loyale, claire et transparente » : si les avis sont **contrôlés** ou non (et comment), la **date** de l'avis et de ses mises à jour, les **raisons d'un rejet** à l'auteur, une fonction **gratuite** pour signaler un doute sur l'authenticité d'un avis | https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000049571119 |
| **Décret n° 2017-1436 du 29 septembre 2017** (en vigueur le 01/01/2018), art. **D111-16** à **D111-19** | **D111-16** : un avis = « l'expression de l'opinion d'un consommateur sur son expérience de consommation », acheteur ou non ; les parrainages, recommandations et avis d'experts n'en sont pas. **D111-17** : à proximité des avis, contrôle oui/non, date de l'avis et de l'expérience, critères de classement (dont le chronologique) ; dans une rubrique accessible, **existence ou non d'une contrepartie**, délai maximal de publication et de conservation. **D111-18** : si contrôle, ses caractéristiques, la possibilité de contacter l'auteur, de modifier l'avis, les motifs de refus. **D111-19** : informer l'auteur d'un refus et de ses motifs | https://www.legifrance.gouv.fr/jorf/id/JORFARTI000035720943 |
| **Art. L121-3** (version du **28/05/2022**, ordonnance n° 2021-1734) | « Lorsqu'un professionnel donne accès à des avis de consommateurs sur des produits », l'information sur « si et comment » il garantit qu'ils émanent de vrais utilisateurs est **substantielle** (son absence peut rendre la pratique trompeuse) | https://www.legifrance.gouv.fr/codes/id/LEGISCTA000032227360 (section, lue le 09/10) |
| **Art. L121-4, 27° et 28°** (version du **28/05/2022**) | Pratiques trompeuses **en toutes circonstances** : 27° affirmer que des avis viennent de consommateurs ayant utilisé ou acheté le produit « sans avoir pris les mesures nécessaires pour le vérifier » ; 28° diffuser ou faire diffuser « des faux avis ou de fausses recommandations de consommateurs », ou les modifier pour promouvoir | https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044563107 |
| Origine européenne | Directive (UE) 2019/2161, annexe I, points **23 ter** et **23 quater** (« mesures raisonnables et proportionnées » ; faux avis ou avis déformés), considérant 47 | https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32019L2161 |
| **Sanctions pénales**, art. **L132-2** (version du **12/05/2024**) | 2 ans d'emprisonnement et 300 000 € d'amende, portée à 10 % du chiffre d'affaires moyen annuel ou à 50 % des dépenses de la pratique ; « Lorsque l'infraction a été commise par l'utilisation d'un service de communication au public en ligne », **5 ans et 750 000 €** | https://www.legifrance.gouv.fr/codes/id/LEGISCTA000032227360 |
| **Sanction administrative**, art. **L131-4** (version du **01/10/2023**) | Manquement à `L111-7` ou `L111-7-2` : amende administrative jusqu'à **75 000 €** (personne physique) et **375 000 €** (personne morale) | même section Légifrance |

**DGCCRF** (réponse du ministère à la question écrite n° 04537, JO Sénat du 26/06/2025, page 3634) :
plus de **1 200 établissements contrôlés** depuis le 1er juillet 2023 sur les faux avis ; l'outil
« Polygraphe », déployé en septembre 2023, cible les avis suspects ; les faux avis visés sont aussi
bien positifs (« déposés pour le compte de professionnels ») que négatifs (concurrents).
Source : https://www.senat.fr/questions/base/2025/qSEQ250504537.html (lue le 09/10). Le décret
n° 2023-428 du 1er juin 2023 autorise « Polygraphe » pour trois ans
(https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000047623784, cité par la recherche, non relu).
La fiche pratique DGCCRF « Avis en ligne : attention aux faux commentaires »
(https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/avis-en-ligne-attention-aux-faux-commentaires)
répond 403 à nos outils le 09/10 ; d'après l'extrait rendu par la recherche ce jour-là : « Le
professionnel, le prestataire comme les particuliers démarchés engagent leur responsabilité pénale »
(faux avis contre produit offert ou rémunération) — à relire dans un navigateur avant de citer.

**Ce que ça veut dire pour FillSell**
- Les stores et Trustpilot portent les obligations de `L111-7-2` **pour leurs propres pages d'avis**.
  FillSell les porte dès qu'il **affiche** des avis ou des témoignages sur fillsell.app ou dans l'app
  (bloc du § 4.5), et dès qu'il **collecte** des avis pour les publier.
- Un avis rédigé, commandé, acheté ou « arrangé » par FillSell ou pour lui, même un seul, relève du
  28° : délit, aggravé en ligne. Idem pour un avis négatif déposé chez un concurrent.
- La carte et le mail ne promettent rien et n'offrent rien : il n'y a donc **aucune contrepartie** à
  déclarer (D111-17) ; le dire quand même (§ 4.3, § 4.5) est une bonne pratique.

### 5.2 Apple (App Store)

Source : App Review Guidelines, https://developer.apple.com/app-store/review/guidelines/ (lue le 09/10,
sans date de mise à jour affichée).
- **5.6.1** : « Use the provided API to prompt users to review your app […] and we will disallow
  custom review prompts. » → la fenêtre StoreKit seule, rien devant (c'est ce que fait le code).
- **Section 3 (intro)** : en cas de tentative de « manipulate reviews, inflate your chart rankings
  with paid, incentivized, filtered, or fake feedback, or engage with third-party services to do so »,
  Apple peut aller jusqu'à l'exclusion du programme développeur. Le mot **« filtered »** vise le tri
  des contents.
- **3.2.2(x)** : interdit de forcer à noter (« must not force users to rate the app […] in order to
  access functionality »).
- **5.6.3** : manipuler « charts, search, reviews, or referrals » n'est pas permis.
- Fréquence : « The system automatically limits the display of the prompt to three occurrences per app
  within a 365-day period » ; ne pas demander « on first launch or during onboarding »
  (https://developer.apple.com/design/human-interface-guidelines/ratings-and-reviews, lu le 09/10).
  « Avoid requesting a review as the result of a user action »
  (https://developer.apple.com/documentation/storekit/requesting-app-store-reviews, lu le 09/10).
  La règle maison (60 jours) donne au plus 6 demandes par an ; Apple en affiche 3 au plus : aucun
  conflit, Apple tranche.

### 5.3 Google (Google Play)

- In-App Review API (https://developer.android.com/guide/playcore/in-app-review, « Last updated
  2026-01-30 », lue le 09/10) : afficher la carte « as-is », sans calque ; « Your app shouldn't ask
  the user any questions before or while presenting the rating button or card, including questions
  about their opinion (such as "Do you like the app?") » ; quota de durée non publié (« less than a
  month » peut ne rien afficher) ; pas de bouton qui appelle l'API.
- Règle « User Ratings, Reviews, and Installs »
  (https://support.google.com/googleplay/android-developer/answer/9898684, lue le 09/10) :
  « Developers must not attempt to manipulate the placement of any apps on Google Play » ; exemples
  interdits : demander une note contre une incitation (ex. une remise), faux avis répétés.
- Règle « Metadata » (https://support.google.com/googleplay/android-developer/answer/9898842, lue le
  09/10) : pas de « unattributed or anonymous user testimonials » dans la description.

### 5.4 Chrome Web Store

Program Policies (https://developer.chrome.com/docs/webstore/program-policies/policies, « Last updated
2025-05-22 », lue le 09/10), rubrique « Spam and Abuse » : « Developers must not attempt to manipulate
the placement of any extensions in the Chrome Web Store », notamment en gonflant notes, avis ou
installations « by illegitimate means », « such as fraudulent or incentivized downloads, reviews and
ratings ».

### 5.5 Trustpilot

« Guidelines for businesses », **version 7.3, septembre 2026**
(https://corporate.trustpilot.com/legal/for-businesses/guidelines-for-businesses, lue le 09/10) :
inviter tout le monde de la même manière ; interdit de « be selective with invitations » et le
« pre-screening » (envoyer vers l'avis seulement ceux qui ont eu une bonne expérience) ; « We don't
allow incentivized reviews » (remises, codes promo, tirages au sort, remboursements, cadeaux) ; pas
d'avis de l'équipe, de la famille ou d'un concurrent ; « Fake reviews undermine trust and are illegal » ;
signaler un avis 5 étoiles pour les mêmes raisons qu'un avis 1 étoile, jamais parce qu'il déplaît.

---

## 6. Interdits (liste de contrôle avant toute action)

1. Aucun avis écrit par FillSell, par un proche, par un membre de l'équipe ou par un bêta-testeur lié
   à l'équipe (Trustpilot, Apple 5.6.3, `L121-4` 28°).
2. Aucun avis acheté, aucune agence, aucun « échange d'avis » dans un groupe Facebook ou Telegram.
3. Aucune contrepartie : ni quotas, ni mois offert, ni remise, ni concours, ni « retouches en plus »
   contre un avis (Apple section 3, Google, Chrome Web Store, Trustpilot).
4. Aucun tri : pas de « Tu aimes FillSell ? » avant la fenêtre du store ; pas de mail réservé aux
   clients contents ; pas de texte conditionnel (« si FillSell te plaît… »).
5. Aucune fenêtre maison avant la fenêtre d'Apple ou de Google (Apple 5.6.1 ; Google, design guidelines).
6. Aucune demande depuis un bouton qui appelle l'API ; pour un bouton, le lien vers le store (§ 3).
7. Aucune liste noire des mécontents : une personne qui a **écrit au support** ou laissé une mauvaise
   note reçoit les mêmes demandes que tout le monde, au même moment, ni plus ni moins. Les seules
   exclusions sont de **moment** (tâche bloquée, échec, paiement récent : § 2.1), jamais d'humeur.
8. Jamais demander de modifier ou retirer un avis négatif en échange d'un geste commercial.
9. Jamais signaler un avis négatif authentique ; on y répond (§ 4.4).
10. Jamais d'avis, de note ou d'étoile sur un concurrent (dans une page comparative : faits datés
    seulement, `briefs/concurrents-matrice.md` § 6).
11. Aucun nom de l'équipe dans un avis, une réponse ou un témoignage sans l'accord de Nico.

---

## 7. Suivi mensuel (même jour que le panel IA, `hors-site/panel-ia-mensuel.md`)

| Indicateur | Comment le lire | 09/10/2026 |
|---|---|---|
| Avis Chrome Web Store | nombre et note sur la fiche | **1**, 5,0 |
| Notes App Store France | `userRatingCount` de `https://itunes.apple.com/lookup?id=6762152785&country=fr` | **3**, 5,0 |
| Notes App Store, autres vitrines | même appel avec `country=us`, `gb`, `ie`, `be` | **0** partout |
| Notes Google Play | fiche Play (une note s'affiche à partir d'un seuil non publié) | **aucune affichée** |
| Trustpilot | page réclamée ou non, nombre d'avis | aucune page trouvée |
| Demandes envoyées | requête du § 2.4, par canal | à lire par Nico |
| Verdict des IA sur la marque | question C3 du panel | ChatGPT « 6,5/10, trop peu évaluée » |

Objectif réaliste, sans promesse : que les trois stores affichent une note fondée sur des avis
réels, et que la question C3 ne renvoie plus « trop peu évaluée ».

---

## 8. Décisions qui attendent Nico

| # | Décision | Pourquoi |
|---|---|---|
| R1 | Publier un binaire ≥ 2.9.62 (App Store et Google Play) | sans lui, aucune demande d'avis sur téléphone (§ 2.3) |
| R2 | Rendre neutre le texte de la carte (web + extension) | éviter toute forme de tri (§ 4.1) |
| R3 | Coder les moments M2 à M5 | élargir les moments de réussite (§ 3) |
| R4 | Ajouter « Donner mon avis » dans Réglages | une porte permanente, conforme Apple et Google (§ 3, § 4.2) |
| R5 | Envoyer le mail unique, après R1 | rattraper les comptes actifs (§ 4.3) |
| R6 | Trustpilot oui ou non | marque, ScamDoc, homonyme (§ 4.6) |
| R7 | Déclarer FillSell « commerçant » sur l'App Store (comme sur le Chrome Web Store et Google Play) | aujourd'hui la fiche App Store dit que le droit de la consommation ne s'applique pas : mauvais signal de confiance (détail : `hors-site/fiches-stores.md` § 2.1) |

---

## Annexe — Sources (toutes lues le 2026-10-09)

- Stores : https://apps.apple.com/fr/app/fillsell-achat-revente/id6762152785 ;
  https://apps.apple.com/us/app/fillsell-reseller-app/id6762152785 ;
  https://itunes.apple.com/lookup?id=6762152785&country=fr (et `us`, `gb`, `ie`, `be`) ;
  https://play.google.com/store/apps/details?id=app.fillsell.app&hl=fr&gl=FR ;
  https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm?hl=fr ;
  https://fr.trustpilot.com/review/fillsell.app (403, anti-robot : arrêt).
- Droit : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000049571119 ;
  https://www.legifrance.gouv.fr/jorf/id/JORFARTI000035720943 ;
  https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044563107 ;
  https://www.legifrance.gouv.fr/codes/id/LEGISCTA000032227360 ;
  https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32019L2161 ;
  https://www.senat.fr/questions/base/2025/qSEQ250504537.html ;
  https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/avis-en-ligne-attention-aux-faux-commentaires (403).
- Règles : https://developer.apple.com/app-store/review/guidelines/ ;
  https://developer.apple.com/design/human-interface-guidelines/ratings-and-reviews ;
  https://developer.apple.com/documentation/storekit/requesting-app-store-reviews ;
  https://developer.android.com/guide/playcore/in-app-review ;
  https://support.google.com/googleplay/android-developer/answer/9898684 ;
  https://support.google.com/googleplay/android-developer/answer/9898842 ;
  https://developer.chrome.com/docs/webstore/program-policies/policies ;
  https://corporate.trustpilot.com/legal/for-businesses/guidelines-for-businesses.
- Code (worktree `C:\Users\nicol\fill-and-sell-seo`, HEAD `8fa7007`) :
  `supabase/functions/_shared/avis-demande.js`, `supabase/functions/avis-demande/index.ts`,
  `src/hooks/useDemandeAvis.js`, `src/utils/plateformeAvis.js`, `src/components/CarteAvis.jsx`,
  `chrome-extension/popup.js`, `android/app/build.gradle`, `codemagic.yaml`, `ios/App/App/Info.plist`.
