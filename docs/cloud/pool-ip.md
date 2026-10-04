# FillSell Cloud — le pool d'adresses IP françaises

Conception du 04/10/2026, branche `conception/cloud-option`. **Rien n'est appliqué,
rien n'est acheté.**

Fichiers liés :
- Règles pures et testées : `supabase/functions/_shared/cloud-pool.js`
  (`npm run selftest:cloud-pool`).
- Base : `supabase/migrations/PROPOSITION_20261004_cloud_option_et_pool_ip.sql.txt`,
  non appliquée, inverse en tête.
- Contrat côté app : `src/utils/palier.js` (`cloudDuProfil`). `cloud_etat(p_user)`
  rend la même chose, vérifié sur 16 cas (§ 10).

## 0. En bref

- **Pour démarrer : 8 IP**, soit **43,20 $ par mois (≈ 37 €)**. On passe une
  commande IPRoyal par IP. Au lancement, plafond de 10 essais simultanés. Le cron
  horaire achète la suite au besoin.
  - Rythme attendu : λ ≈ 1 à 2 essais par jour. L'essai exige un palier payant :
    50 comptes payants aujourd'hui, et 23 des 825 inscrits des 30 derniers jours
    paient encore.
  - Régime établi à λ = 1 et c = 25 % : **≈ 22 IP, 119 $ par mois (≈ 102 €)**.
- **Coût IP d'un essai** :
  - 3,56 € s'il n'est pas converti (23 jours d'IP) ;
  - 1,08 € s'il est converti (7 jours, ensuite l'IP passe au client) ;
  - 2,94 € en moyenne à c = 25 %, soit **11,76 € d'essais par client gagné** ;
  - s'y ajoutent 7 × `coutServeurEurJour` et 7 × `coutBaseEurJour` (à mesurer).
- **Marge d'un client payant**, par mois, avant serveur et base :
  - **11,33 €** par Stripe ;
  - 9,52 € par Apple ou Google à 15 % ;
  - 7,02 € par Apple à 30 %.
  - Calcul : 20 € TTC, soit 16,67 € HT, moins les frais de paiement, moins l'IP
    (4,64 €).
- La quarantaine pèse le plus. À 14 jours, recycler une IP coûte 23 % de moins
  qu'en acheter une neuve par essai. À 30 jours, recycler coûterait plus cher que
  du neuf.

## 1. Le cycle de vie d'une IP

```
  achat IPRoyal
       │ livrée (contrôle d'entrée < 24 h, < 500 Mo)
       ▼
   achetee ──contrôle bon──▶ disponible ──essai──▶ attribuee_essai ──paie──▶ attribuee_client
       │                       ▲   │                     │                       │
       │ contrôle raté         │   └──client payant──────┼──────────────────────▶│
       ▼                       │                         │ non converti          │ résilié
     rebut               sortie│(quarantaine finie,      │ (fin + grâce)         │
       ▲                       │ purge prouvée,          ▼                       ▼
       │                       └──── contrôle frais) quarantaine ◀───────────────┘
       │ signalée (tout état vivant,                     │  le même compte revient payer
       │ quarantaine comprise)                           └──▶ attribuee_client (la sienne)
       │
   échéance IPRoyal : renouvelée (même IP, le temps restant s'ajoute) ou ──▶ expiree
   ⛔ une IP attribuée n'expire jamais sous son titulaire ; une IP au rebut n'est jamais renouvelée
```

États (`cloud_ips.etat`) : `achetee`, `disponible`, `attribuee_essai`,
`attribuee_client`, `quarantaine`, `rebut`, `expiree`. Les transitions permises et
interdites sont dans `prochainEtat`. Chaque geste laisse une ligne dans
`cloud_ip_evenements`.

## 2. Attribution, libération

**Attribution atomique** (`cloud_ip_attribuer`) :
- verrou consultatif par compte, puis `SELECT … FOR UPDATE SKIP LOCKED` ;
- **une IP ne sert jamais deux comptes à la fois** : une ligne n'a qu'un
  titulaire (`user_id`), et l'index unique partiel `cloud_ips_un_titulaire` interdit
  aussi deux IP pour un même compte ;
- l'appel est idempotent : un compte qui a déjà une IP récupère la même.

Ordre de choix, le même dans `choisirIp` :
1. Le même compte reprend **sa propre** IP en quarantaine. Aucun autre compte ne
   l'a vue.
2. Sinon, la `disponible` qui **expire le plus tôt tout en couvrant** le besoin
   (premier expiré, premier servi). À échéance égale, la moins usée.

**Jamais une IP qui expire pendant l'essai.** Pour un essai, l'IP doit être payée
jusqu'à maintenant + 7 jours + 2 jours de grâce + 1 jour de marge, soit 10 jours.
Pour un client, il suffit de N = 3 jours, puisqu'il est renouvelé de toute façon.
Une IP disponible à moins de 10 jours de son échéance attend d'être prolongée
(§ 6).

**Usure** : une IP a servi au plus 6 comptes différents (`attributions_max`).
Au-delà, elle n'est plus prolongée et va jusqu'au bout de sa période.

**Pool vide** : `cloud_ip_attribuer` rend `NULL`, jamais une erreur. L'essai
reste en file (§ 7).

**Libération** (`cloud_ip_liberer`) : l'IP passe en `quarantaine`, la quarantaine
commence. Trois cas :
- fin d'essai + grâce sans paiement ;
- option résiliée ;
- essai refusé (compte de plateforme déjà vu, § 8).

L'orchestrateur purge aussitôt (§ 3). On ne garde pas 14 jours les sessions de
quelqu'un qui est parti.

**Conversion** : les flux de paiement n'écrivent que `profiles.is_cloud`, comme
`is_premium`. Le déclencheur `profiles_cloud_paye` fait le reste : l'IP de
l'essai devient celle du client, avec les mêmes connexions. Si le compte n'a plus
d'IP, il reprend la sienne en quarantaine, sinon il en reçoit une neuve, en
priorité sur les essais. Une erreur du pool **n'empêche jamais un paiement** : elle
devient un avertissement, et le cron rattrape.

## 3. Quarantaine et purge complète

**Durée proposée : 14 jours** (`quarantaine_jours`) après un essai. Trois raisons :
- **Les sessions côté plateforme meurent.** Les jetons Vinted mesurés durent 7
  jours (prototype du 26/09, `access_token_web` et `refresh_token_web`). Avec 14
  jours, soit deux fois cette durée, l'ancien compte n'a plus de session vivante
  sur l'IP quand le suivant arrive. Les plateformes rapprochent deux comptes vus
  au même moment sur la même IP.
- **Les signaux tardifs arrivent.** Une restriction de compte ou une inscription
  sur liste noire peut tomber après le départ. La quarantaine donne le temps de
  mettre l'IP au rebut avant qu'elle ne serve à quelqu'un d'autre.
- **Le coût reste raisonnable.** Un jour de quarantaine coûte 0,15 €. 7 + 2 + 14 =
  23 jours d'IP par essai non converti, contre 30 pour une IP neuve abandonnée.
  Avec 7 jours de quarantaine, il faudrait environ 25 % d'IP en moins (§ 5). C'est
  une décision pour Nico.

**IP d'un ancien client payant** (proposition) : elle ne passe jamais à un autre
compte, parce qu'elle a été longtemps associée à un seul. Elle attend son retour
jusqu'à l'échéance, puis expire. Interrupteur : `cloud_recycler_ip_client`.

**« Purge complète »**, faite par l'orchestrateur des navigateurs dès la libération :
1. **Profil du navigateur** : dossier du profil détruit (cookies, localStorage,
   IndexedDB, cache, stockage de l'extension, historique), puis un profil neuf
   créé sous un **nouvel identifiant**. On ne réutilise jamais l'ancien.
2. **Coffre** : toutes les connexions chiffrées du titulaire sortant sont
   effacées (cookies Vinted, Leboncoin, eBay).
3. **Session FillSell** fabriquée par le serveur pour l'extension : révoquée
   (`auth.sessions`).
4. **Empreinte de navigateur nouvelle** : nouvelle graine (canvas, audio, WebGL),
   et l'empreinte calculée diffère de l'ancienne.
5. **Identifiants du proxy changés** (IPRoyal `change-credentials`,
   `random_password`). L'ancien conteneur ne peut plus sortir par cette IP.

**La preuve exigée avant de remettre l'IP en pool.** La base la relit
(`cloud_purge_manques` ; mêmes codes dans `manquesPreuvePurge`) :

```json
{ "version": 1, "faite_le": "…",
  "profil": { "ancien": "p-…", "nouveau": "p-…", "ancien_detruit": true, "nouveau_cree_le": "…" },
  "cookies_restants": 0, "stockages_restants": 0, "coffre_restants": 0,
  "session_fillsell_revoquee": true,
  "empreinte": { "ancienne": "h-…", "nouvelle": "h-…" },
  "identifiants_proxy_renouveles": true }
```

Ce qui fait refuser la preuve :
- une preuve antérieure à la libération ;
- un profil identique à l'ancien ;
- un seul cookie restant ;
- un compteur absent : absent n'est pas zéro ;
- une empreinte inchangée.

**Remise en pool** (`cloud_ip_remettre_en_pool`). Il faut à la fois :
- la quarantaine finie ;
- une preuve postérieure à la libération ;
- un **contrôle de sortie de moins de 24 h**, fait depuis un profil neuf sans
  compte :
  - l'IP de sortie est celle attendue, en France ;
  - aucune liste noire DNS ;
  - les pages d'accueil de Vinted, Leboncoin et eBay s'ouvrent sans blocage ;
- une IP qui n'est ni en fin de vie ni celle d'un ancien client.

## 4. Le rebut — critères mesurables (`qualifierSignalement`)

| Critère | Seuil | Garde-fou |
|---|---|---|
| `blocage_anti_robot` | page de blocage (DataDome « Access is temporarily restricted », Cloudflare « blocked », Akamai « Access Denied ») ou 403 sur la sonde d'une plateforme | compte seulement si **au moins 2 autres IP du pool passent la même plateforme dans les 24 h**. Sinon c'est l'environnement qui est en cause (Beebs depuis le Cloud, 26/09) : la plateforme est « fermée au Cloud », aucune IP n'est jetée |
| `captcha_repete` | 3 captchas sur la même plateforme en 24 h glissantes | les captchas de plus de 24 h ne comptent plus |
| `compte_restreint` | une plateforme restreint ou suspend un compte qui passait par l'IP | dès le premier : l'IP porte désormais la trace de ce compte |
| `liste_noire` | IP inscrite sur une liste DNS publique (Spamhaus ZEN, au contrôle d'entrée puis chaque semaine) | — |
| `sortie_non_conforme` | 3 contrôles de sortie ratés d'affilée (IP ou pays inattendu, proxy muet) | un succès entre deux remet le compte à zéro |
| `controle_entree` | contrôle raté à la livraison | on demande le remplacement à IPRoyal (24 h, < 500 Mo, un par commande) |

Une IP au rebut, depuis n'importe quel état, quarantaine comprise (`cloud_ip_signaler`) :
- elle n'est **plus jamais attribuée ni prolongée** ;
- son secret du vault est effacé à l'échéance ;
- si elle revient un jour dans une commande, elle entre directement au rebut ;
- son titulaire reçoit **aussitôt** une autre IP, en priorité absolue.

Remplacement : seulement dans la fenêtre IPRoyal (24 h et < 500 Mo, une fois par
commande). Après, l'IP va au bout de sa période, au pire 30 jours d'une IP perdue.

## 5. Taille du pool

Une IP d'essai **non converti** est occupée T + G + Q jours (essai, grâce,
quarantaine). Une IP d'essai **converti** quitte le pool après T jours : elle
devient celle du client, qui la paie. Par la loi de Little :

```
en cycle  = λ · (T + (1 − c) · (G + Q))
sécurité  = λ·H + z·√(λ·H),   H = L + R
cible     = ⌈en cycle⌉ + ⌈sécurité⌉
```

Les symboles :
- λ : essais par jour, mesuré sur 7 jours, plancher 0,5 ;
- c : taux de conversion ;
- T : durée de l'essai, 7 jours ;
- G : grâce, 2 jours ;
- Q : quarantaine, 14 jours ;
- L : délai d'achat, 1 jour (à mesurer) ;
- R : période du cron, 1 heure ;
- z : 1,65 (environ 95 % de chances de ne pas manquer).

Les IP des clients payants s'ajoutent, une par client. Elles sont payées par
l'option.

IP du pool et coût mensuel, à 5,40 $ par IP et par 30 jours :

| λ (essais/j) | c = 10 % | c = 25 % | c = 40 % | seuils commande / alerte |
|---|---|---|---|---|
| 2 | 48 · 259 $ | 43 · 232 $ | 39 · 211 $ | 5 / 5 |
| 5 | 116 · 626 $ | 104 · 562 $ | 92 · 497 $ | 9 / 9 |
| 10 | 230 · 1 242 $ | 206 · 1 112 $ | 182 · 983 $ | 16 / 16 |
| 20 | 457 · 2 468 $ | 409 · 2 209 $ | 361 · 1 949 $ | 29 / 28 |

Ce que change une quarantaine de 7 jours, à c = 25 % : 33, 78, 154 et 304 IP
(au lieu de 43, 104, 206 et 409).

Ouvrir l'essai aux comptes gratuits, au mur « installe l'extension » où 7
inscrits sur 9 décrochent, mettrait λ autour de 10 à 16. Cela fait 200 à 330 IP,
soit 1 100 à 1 800 $ par mois. D'où le plafond d'essais simultanés
(`cloud_essais_simultanes_max`).

Le pool n'est pas acheté d'avance. Le cron achète **à la demande** dès que les
IP prêtes ou en route passent sous le seuil de commande. Le régime établi se
construit en 23 jours.

## 6. Achat et renouvellement chez IPRoyal

**Les règles** (`planDuJour`) :
- **L'IP d'un client payant est toujours renouvelée**, décision à N = 3 jours de
  l'échéance. Filet de sécurité : `auto_extend` activé sur sa commande, coupé dès
  qu'elle est libérée.
- **Une IP en service d'essai n'expire jamais sous son titulaire**, même règle.
- Une IP au rebut, usée (6 comptes) ou d'ancien client n'est **jamais** renouvelée.
- **Une IP libre en surplus n'est pas renouvelée.** Pour elle, la décision tombe
  dès qu'elle ne couvre plus un essai entier, à moins de 10 jours de l'échéance.
  Elle est prolongée seulement si le stock prêt ou en route passe sous le seuil
  de commande, en commençant par les moins usées. Prolonger plus tôt ne coûte
  rien : le temps restant s'ajoute.
- Une IP encore loin de la fin de sa quarantaine n'est pas prolongée : on ne paie
  pas sa quarantaine pour rien.
- **Une commande = une IP.** Le remplacement et le remboursement sont accordés
  **une fois par commande**. Cela garde aussi l'abonnement automatique et la
  prolongation IP par IP. On regroupera les commandes seulement si
  `calculate-pricing` montre une remise sensible.
- L'échéance est toujours **relue** chez IPRoyal (`GET /orders/{id}`), jamais
  calculée. Une commande expirée ne se prolonge plus : la décision se prend avant.
- Le jeton API (`IPROYAL_API_TOKEN`) est un secret de fonction. Les URL des proxys
  vont au vault, une par IP.

**Ce qui a été vérifié** (lu le 04/10/2026) :

| Fait | Source |
|---|---|
| Prix publics « dès » : 1,80 $ pour 24 h, 2,70 $ pour 30 j, 2,55 $ pour 60 j, 2,40 $ par IP pour 90 j ; « unlimited traffic » ; France listée ; « bulk discounts » | https://iproyal.com/static-residential-proxies/ · https://iproyal.com/isp-proxies/ |
| **Prix France mesuré : 5,40 $ pour 30 j, 1 IP** (commande #83578416, 26/09, sortie Lyon AS3320) — deux fois le « dès » public | `fillsell-cloud-proto/JOURNAL.md` |
| API : `POST /orders` (`product_id`, `product_plan_id`, `product_location_id`, `quantity`, `auto_extend` faux par défaut, `card_id`) ; `GET /orders/{id}` (`expire_date`, statut `unpaid`, `in-progress`, `confirmed`, `refunded` ou `expired`, `proxy_data`) ; `POST /orders/{id}/extend` (`product_plan_id`, `proxies[]` pour une prolongation partielle) ; `POST /orders/toggle-auto-extend` (par commande) ; `GET /orders/calculate-pricing` (`location_discount_percent`, `quantity_discount_percent`, `quantity_required_for_next_discount`) | https://docs.iproyal.com/proxies/isp/api/orders |
| `POST /orders/proxies/change-credentials` (`random_password`, `proxies[]`) ; la disponibilité par pays exige 10 000 $ de dépenses | https://docs.iproyal.com/proxies/isp/api/proxies |
| Remplacement : sous 24 h, **un par commande**, moins de 500 Mo consommés (MAJ 02/12/2025) | https://help.iproyal.com/en/articles/7222815-if-the-proxies-i-purchased-don-t-work-do-you-offer-a-replacement |
| Remboursement : 24 h et 500 Mo ; renouvellement par abonnement 72 h ; renouvellement manuel 24 h (MAJ 26/02/2026) | https://help.iproyal.com/en/articles/7222126-what-is-your-refund-policy-for-isp-proxies |
| Usage raisonnable : **100 Go par proxy et par cycle de 30 j**, débit réduit au-delà (MAJ 16/06/2026). Le prototype a mesuré 10 à 30 Mo par session : sans enjeu | https://help.iproyal.com/en/articles/12094903-what-is-the-fair-usage-policy |
| Une commande expirée ne peut être ni prolongée ni renouvelée ; on choisit les IP prolongées | https://docs.iproyal.com/proxies/datacenter/dashboard/extending-an-order |
| Prolongation de 30, 60 ou 90 j, **le temps restant s'ajoute** ; **même IP** tant que la commande est active et après prolongation | https://help.iproyal.com/en/articles/7222566-can-i-extend-the-30-days-plan-for-a-longer-period · https://help.iproyal.com/en/articles/7222107-how-long-can-you-use-the-same-ip-address |
| Abonnement : prolongation automatique avant l'échéance, mêmes IP ; échec si la carte n'est plus valable | https://help.iproyal.com/en/articles/7827110-how-to-turn-on-subscription-for-isp-proxies |

**Ce qui N'A PAS pu être vérifié** :
- **Les paliers de prix France par quantité.** `calculate-pricing` exige un jeton.
- **Le délai de livraison** : le statut `in-progress` existe, aucune durée n'est
  publiée. L = 1 jour par prudence ; la vraie valeur se mesure dans
  `cloud_ip_commandes`.
- **Le remplacement d'une IP par l'API** : aucun point d'entrée dans les pages lues.
  Il passe sans doute par le support ou le tableau de bord.
- **La TVA facturée par IPRoyal** : le champ `price_with_vat` existe, mais on ne
  sait pas si les 5,40 $ sont TTC.
- **L'échéance d'une commande prolongée en partie** : par IP ou par commande ? Une
  commande par IP contourne la question.
- **Le choix de l'opérateur en France** (Orange, SFR, Free, Bouygues) : le ciblage
  par ville est annoncé, mais la sortie du prototype était Deutsche Telekom.
- **Le sort d'une IP expirée** chez IPRoyal (sans doute revendue).
- **Le taux USD/EUR** : 0,86 est posé, à relire.

## 7. Alerte « pool presque vide », et ce que voit l'utilisateur

Les seuils sont **calculés depuis λ mesuré**, jamais écrits en dur (`seuils`) :
- **seuil de commande** = ⌈λ·(L+R) + z·√(λ·(L+R))⌉ : en dessous, le cron commande ;
- **seuil d'alerte** = ⌈λ·L + z·√(λ·L)⌉.

Trois niveaux :
- **« vide »** : plus aucune IP attribuable à un essai ;
- **« presque vide »** : les IP prêtes plus celles en route passent sous le seuil
  d'alerte, alors que l'achat de l'heure a déjà eu lieu. Cela arrive quand une
  commande est bloquée ou que le budget est atteint.

Les canaux, sur le modèle de `veille-cpu` (`deciderAlerte`, journal
`cloud_pool_alertes`) :
- **Mail immédiat** à support@fillsell.app :
  - « vide » : rappel toutes les heures ;
  - « presque vide » : rappel toutes les 6 h ;
  - passer de « presque vide » à « vide » prévient tout de suite ;
  - « rétabli » quand on revient au seuil de commande.
- **Alerte immédiate aussi** dans trois cas :
  - un incident : une IP a expiré sous son titulaire ;
  - un client payant reste sans IP ;
  - une attente dépasse 48 h.
- **Ops-digest de 8h50**, une section lue dans `cloud_pool_etat()` :
  - le nombre d'IP par état, et les IP attribuables comparées au seuil ;
  - la file : longueur et plus longue attente ;
  - λ sur 7 jours et la conversion sur 30 jours ;
  - les renouvelées, expirées et mises au rebut sur 24 h (avec leur critère) ;
  - la livraison médiane et la dépense IP du mois.

**Côté utilisateur, jamais un écran cassé.** Un essai accepté entre en file
(`cloud_essai_ouvrir`) et **son horloge ne tourne pas** tant qu'aucune IP ne lui
est donnée. `cloud_essai_debut` est posé au démarrage réel, si bien que
`cloud_etat` reste à « aucun ». L'app lit la file par `cloud_essai_moi()` (statut,
position) et affiche :

> Ton ordinateur Cloud se prépare. Ton essai de 7 jours commencera dès qu'il est
> prêt, en général en moins de 24 h. On te prévient par notification et par e-mail.

L'essai démarre tout seul dès qu'une IP se libère. `cloud_file_servir` sert dans
cet ordre :
1. les clients payants ;
2. les essais qui ont perdu leur IP ;
3. la file, dans l'ordre d'arrivée et sous le plafond.

## 8. Un seul essai par personne

Quatre verrous, tous côté serveur :
1. **Compte** : index unique `cloud_essais(user_id)`, quel que soit le statut, et
   `profiles.cloud_essai_debut`.
2. **Appareil** : l'empreinte est hachée en HMAC-SHA256 avec un **sel du vault**
   (`cloud_empreinte_sel`, qui ne sort jamais de la base). Index unique
   `(nature, empreinte)`. La source est l'identifiant d'installation de l'app
   (Capacitor `Device.getId()`) ou, sur le web, un identifiant tiré au hasard et
   gardé par le navigateur. Ce verrou est faible : il dissuade, il ne prouve rien.
3. **Compte de plateforme** : identifiant Vinted, Leboncoin, eBay ou Beebs, **relevé
   par notre propre navigateur** à la première connexion Cloud, avant tout job
   (`cloud_essai_noter_compte_plateforme`). Il est haché avec le nom de la
   plateforme. S'il a déjà servi à l'essai d'un autre compte FillSell :
   - l'essai s'arrête aussitôt (`refuse`) ;
   - `cloud_etat` passe à « essai terminé » ;
   - l'IP part en quarantaine et en purge.
4. *Pour mémoire*, l'empreinte de carte Stripe (`card.fingerprint`), si l'essai
   exige un jour une carte. Rien n'a été touché côté Stripe.

Les refus arrivent dans cet ordre, le même en SQL et en JS : `compte_inconnu`,
`deja_client`, `essai_deja_pris`, `palier_requis`, `appareil_inconnu`,
`appareil_deja_vu`, `compte_plateforme_deja_vu`. Une course entre deux comptes
est tranchée par l'index unique.

**RGPD** :
- **Données minimales** : aucune valeur brute stockée, seulement des HMAC. Le
  hachage simple ne suffit pas, parce qu'un identifiant Vinted se retrouve en
  énumérant.
- **Finalité** : prévenir l'abus de l'essai gratuit (intérêt légitime), à écrire
  dans la politique de confidentialité et au registre. Les empreintes restent des
  données **pseudonymisées**, pas anonymes.
- **Conservation : 12 mois après la fin de l'essai.** Le cron les efface ensuite
  (`empreintes_conservation_mois`). Dans le journal des IP et sur `cloud_ips`,
  l'identité du titulaire est effacée au bout de 12 mois.
- **Suppression de compte** : `cloud_essais.user_id` passe à null. L'empreinte vit
  jusqu'à sa date, sans lien avec le compte.
- **Le sel ne tourne jamais**, sauf fuite : le changer efface toute la mémoire
  anti-abus.

## 9. Coûts et marge

`coutParEssai` et `margeParClient`. Le serveur et la base restent des paramètres
**nommés et vides** (`coutServeurEurJour`, `coutBaseEurJour`). Un coût partiel
est signalé `complet: false`, jamais compté comme zéro.

| Par essai (IP à 5,40 $ / 30 j, 0,86 €/$) | Non converti | Converti |
|---|---|---|
| Jours d'IP | 23 (7 + 2 + 14) | 7 |
| IP | 3,56 € | 1,08 € |
| Serveur navigateur | 7 × `coutServeurEurJour` | idem |
| Base et fonctions | 7 × `coutBaseEurJour` | idem |

Moyenne pour l'IP seule : 3,31 € à c = 10 %, 2,94 € à 25 %, 2,57 € à 40 %.
Rapporté à un client gagné : **33,13 €, 11,76 € et 6,42 €**.

| Par client et par mois, sur 20 € TTC (16,67 € HT) | Net | − IP | Marge avant serveur et base |
|---|---|---|---|
| Stripe : 1,5 % + 0,25 €, plus Billing 0,7 % | 15,98 € | 4,64 € | **11,33 €** − 30·S − 30·B |
| Stripe, option sur la facture du palier (pas de second 0,25 €) | 16,23 € | 4,64 € | 11,58 € |
| Apple Small Business, ou Google (10 % + 5 %) : 15 % du HT | 14,17 € | 4,64 € | 9,52 € |
| ⚠️ Apple hors programme : 30 % la 1re année | 11,67 € | 4,64 € | 7,02 € |
| Sans TVA (si franchise), Stripe | 19,31 € | 4,64 € | 14,67 € |

Les essais d'un client gagné, 11,76 € à c = 25 %, sont remboursés en un mois de
marge environ, avant serveur et base.

Sources des frais :
- Stripe : https://stripe.com/fr/pricing (EEE standard 1,5 % + 0,25 € ; premium
  2,8 % ; Royaume-Uni 2,5 % ; international 3,15 % ; conversion + 2 %) et
  https://stripe.com/fr/billing/pricing (0,7 %).
- Google : https://support.google.com/googleplay/android-developer/answer/112622
- Apple : https://developer.apple.com/app-store/small-business-program/
- Tous lus le 04/10/2026.
- ⚠️ L'assiette hors TVA des commissions des stores n'a pas été revérifiée.

## 10. Ce que fera la fonction `cloud-pool` (à écrire)

Elle tourne en `verify_jwt = false`, avec la garde `x-cron-secret` lue par
`public.cron_secret()`. Le cron, toutes les heures, n'est **décrit qu'en
commentaire** dans la proposition. À chaque passage :
1. `cloud_pool_entretien()` :
   - essais terminés ;
   - fin de grâce, puis libération ;
   - options résiliées ;
   - échéances passées (un incident si l'IP avait un titulaire) ;
   - service de la file ;
   - purge RGPD.
2. Les contrôles d'entrée et de sortie de quarantaine.
3. `planDuJour` :
   - `extend` des IP à renouveler, avec l'échéance relue ;
   - `POST /orders` pour `aCommander`, sous le plafond de budget
     `cloud_budget_ip_usd_mois`.
4. `deciderAlerte`, puis le mail.

Ce qui a été vérifié :
- **Le selftest** (`npm run selftest:cloud-pool`, 121 contrôles) éprouve les
  règles et relit la proposition SQL : durée d'essai, palier exigé, défauts de
  `cloud_param`, codes de preuve, critères, états, aucun `cron.schedule`
  exécutable.
- **Un banc hors dépôt** a appliqué la proposition dans un Postgres en mémoire
  (PGlite), avec des bouchons pour auth et vault :
  - application deux fois de suite, puis inverse, puis de nouveau ;
  - le scénario complet ;
  - `cloud_etat` = `cloudDuProfil` sur 16 cas ;
  - les codes de preuve, identiques en SQL et en JS ;
  - les droits.
- **La concurrence** (`SKIP LOCKED`, verrous consultatifs) n'a **pas** pu y être
  éprouvée : une seule connexion.

## 11. Questions ouvertes pour Nico

1. **Essai ouvert aux comptes gratuits ?** Il faudrait `CLOUD_EXIGE_UN_PALIER =
   false` dans palier.js et dans `cloud_etat` le même jour. λ serait multiplié
   par 10 environ (§ 5).
2. **Quarantaine** : 14 jours (proposé) ou 7 jours (environ 25 % d'IP en moins) ?
3. **Grâce de 2 jours** après l'essai, qui garde l'IP et les connexions pour qui
   paie au 8e jour : oui, ou 0 ?
4. **L'IP d'un ancien client** n'est jamais réattribuée à un autre compte : d'accord ?
5. **Usure** : 6 comptes au plus par IP ?
6. **Au lancement** : plafond de 10 essais simultanés ? Budget IP mensuel au-delà
   duquel le cron n'achète plus et prévient ? Achats automatiques, ou validés à
   la main au début ?
7. **Carte bancaire exigée** pour l'essai ? Ce serait un 4e verrou, l'empreinte
   de carte.
8. **TVA** : les 20 € sont-ils TTC (TVA à 20 %), ou FillSell est-il en franchise ?
9. **Même prix (20 €) sur Apple et Google**, avec une commission de 15 % ?
10. **Beebs hors Cloud au lancement ?** DataDome bloque tout l'environnement Cloud
    (26/09), pas une IP.
11. **Conservation des empreintes** : 12 mois ?
12. **Où vit le coffre des connexions** : Supabase ou orchestrateur ? Si c'est en
    base, `coffre_restants` sera compté par la base elle-même.
