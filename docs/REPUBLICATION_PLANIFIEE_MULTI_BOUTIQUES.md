# Republication planifiée × multi-boutiques — diagnostic et proposition (17/09/2026)

## 1. Ornella (f8aa02a5…) : ce qui bloque, prouvé sur pièces

État lu en prod le 17/09 à 19:37 (Paris) :

- Réglage : créneau 19:00-22:00, lundi-samedi, plafond 75/j, ordre prix,
  actif depuis le 13/09.
- Boutiques confirmées : @luciatrendyshop (257364012) et @ornella-vend (472079).
  Chrome connecté à **@luciatrendyshop** (sonde 19:34, extension vue 19:34).
- Créneaux : 14/09 (145 éligibles, 29 prévues, 0 faite, `manque`),
  15/09 (14 / 14 / 0, `manque`), 16/09 (153 / 29 / 0, `manque`),
  17/09 en cours (12 / 12 / 0). **`sautes = {}` sur les quatre** : aucune note.
- Republications en vol : **4 jobs `pending`**, tous sur des articles de
  **@ornella-vend (472079)** — 3 manuelles du 16/09 21:28 (`a_capturer`) et
  1 auto du 14/09 19:00 (`captured`, échéance passée depuis le 14/09 17:27Z).

Chaîne exacte :

1. get-pending-jobs **retient** ces 4 jobs (cloisonnement boutique : article
   de 472079, Chrome sur 257364012) — sans écrire quoi que ce soit sur eux,
   « ils repartent seuls » quand elle se connectera à @ornella-vend.
2. `republish_planifiee_sweep`, étape 4 (garde anti-rafale) :
   `EXISTS (republish pending/processing)` → **`CONTINUE` silencieux** : rien
   n'est créé, rien n'est noté, le créneau se clôture en `manque`.

Réponse à la question 1 : **ce n'est pas la boutique active en soi** — le
serveur sait très bien qu'elle est sur @luciatrendyshop et il choisirait ses
articles (12 éligibles sur cette boutique ce soir). C'est la **garde
anti-rafale qui compte des jobs parqués** (retenus pour une autre boutique,
qui ne bougeront pas tant qu'elle n'y est pas connectée) comme des
republications « en vol ». Et elle se tait : c'est le seul `CONTINUE` de la
branche sans note d'historique.

## 2. Correctif (migration `20260917221000_republish_planifiee_bloque_en_vol.sql`)

- Étape 4 : ne comptent comme « en vol » que les jobs qui **peuvent bouger** :
  étape `deleted` (annonce hors ligne — toujours bloquant, c'est l'invariant),
  ou étape `a_capturer`/`captured` dont l'article n'a pas de boutique ou a la
  boutique connectée. Un job parqué pour une **autre** boutique (identité
  connue et fraîche) ne bloque plus.
- Quand la garde bloque encore, elle **écrit** `_bloque_en_vol` sur le
  créneau (`{ motif, jobs, autre_boutique, hors_ligne, at, jusqu_a }`), mise à
  jour à chaque passage — l'app le montre (bloc + historique), le relevé le
  porte (`sautes`).
- Étape 6 : le passage s'arrête aussi quand `prevues` est atteint pour ce
  créneau (cf. § 4).
- `republish_planifiee_etat()` rend en plus `faites_live` (jobs estampillés du
  créneau courant déjà `published`) et `blocage` (la note courante).

## 3. Un PRO multi-boutiques : comment il utilise le module

Le module suit **la boutique connectée dans Chrome** au moment du créneau :
seuls ses articles partent, les autres boutiques « attendent leur créneau »
(note `autre_boutique`, déjà en place). Usage recommandé, écrit dans l'app :
« Pendant ton créneau, Chrome doit être connecté à la boutique à republier.
Pour alterner, change de boutique sur vinted.fr d'un jour à l'autre. »
Ce que le module ne fait **pas** (et ne fera pas seul) : basculer de compte
Vinted à ta place — jamais de connexion automatisée.

Proposition produit (non codée, à décider) : un réglage
`boutique_cible: 'connectee' | <user_id>` — `<user_id>` = le créneau ne
sert **que** cette boutique et, si Chrome est ailleurs, le créneau est
`manque` avec la note « Chrome n'était pas sur @x » (au lieu de republier
l'autre boutique). Utile pour qui veut planifier une seule boutique.

## 4. `faites` et le 11 vs 10 de Joe0410 (15/09)

- `faites` est **posé à la clôture** (republish_creneau_cloturer) : c'est le
  compte final ; **pendant** le créneau l'app et l'historique comptent déjà en
  direct les jobs estampillés `published` (`faites_live` désormais dans
  l'état, et l'historique le faisait déjà à partir des jobs).
- 15/09, `prevues = 10`, `faites = 11` : le sweep n'était **borné que par le
  plafond du jour et l'espacement** (durée / prevues), jamais par `prevues`
  lui-même. Avec 10 intervalles sur la fenêtre, 11 créations tiennent
  (début, +1i … +10i = fin) : le 11e job a été créé à 21:57 et publié à 22:00.
  Effet de bord, pas une republication de trop au sens du plafond (75/j).
  Corrigé : le passage s'arrête à `prevues` (ce que l'app annonce).

## 5. Garde-fous

- Aucun job d'Ornella n'est replanifié à la main ; ses 4 jobs parqués
  repartiront seuls à sa prochaine connexion sur @ornella-vend, et son créneau
  de ce soir repartira dès l'application de la migration (Chrome est ouvert,
  12 éligibles sur @luciatrendyshop).
- Mono-boutique : `republish_boutique_connectee()` rend NULL (pas d'identité
  fraîche) ou la seule boutique → la garde compte tous les jobs comme avant.
  Rien ne change pour eux.
- La migration remplace trois fonctions dont le corps en prod est
  **identique** aux fichiers de migration du 12/09 (md5 vérifié) — elle
  repart du texte réel.

## 6. Extension aux autres plateformes

Voir REPUBLICATION_MULTIPLATEFORME_CONCEPTION.md § 7 : conçu, non livré
dans ce lot (prérequis : mesurer la durée réelle d'un cycle Leboncoin/Beebs).
