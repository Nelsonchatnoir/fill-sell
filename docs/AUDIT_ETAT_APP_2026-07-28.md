# Audit — état réel de l'app au 28/07/2026

Fait en fin de journée, après 15 commits. Classement demandé : **ça saigne /
ça attend / c'est fait**. Les chiffres viennent de la base de prod, pas
d'estimations.

**Photographie** : 497 comptes, dont 76 inscrits sur les 7 derniers jours.
12 abonnés (10 Premium, 2 Pro) + 2 comptes offerts. 96 jobs de publication et
563 analyses Lens sur 30 jours.

---

## 🩸 ÇA SAIGNE

### 1. `APPLE_API_PRIVATE_KEY` est corrompu en base
**Impact : deux fonctions mortes, dont une qui l'a toujours été.**
Le secret contient des caractères de remplacement (`~`) et son OID de courbe
est altéré. Conséquences :
- `apple-notification-history` (créée aujourd'hui) ne peut pas relire
  l'historique → **impossible de retrouver le transactionId de l'achat de
  raraajaws, ni de balayer les 180 jours pour trouver d'autres clients payés
  et non crédités**.
- `apple-subscription-status` utilise le même secret : elle **n'a donc jamais
  fonctionné** depuis sa création. Personne ne s'en était aperçu.

**Action requise (toi) :** re-poser le secret depuis le `.p8` d'origine.
`npx supabase secrets set APPLE_API_PRIVATE_KEY="$(cat AuthKey_XXX.p8)"`
Tant que ce n'est pas fait, l'ops-digest porte une alerte quotidienne.

### 2. Un crédit manuel avec une référence non déduplicable
Le compte `b528ed28` (raraajaws) a été crédité de 100 Pépites sous la ref
`manual:support:b528ed28:2026-07-28:pack100`. Cette ref **ne collisionne pas**
avec la ref Apple réelle (`apple:<transactionId>`). Si la transaction StoreKit
ressort un jour côté client, il sera **crédité une seconde fois**.
Probabilité faible (le natif a probablement déjà finalisé la transaction),
mais non nulle — et elle ne se refermera qu'une fois le secret Apple réparé,
puisque c'est ce qui permettra de récupérer le vrai transactionId.

### 3. Le report des Pépites est actif sans historique de consommation
Le report (grant qui s'ajoute au reliquat au lieu de l'écraser) a été posé
ce matin, et le plafond à 2× seulement cet après-midi. Entre les deux, aucun
grant n'est tombé — donc **aucun dégât**, mais le mécanisme n'a encore jamais
tourné en conditions réelles. Le premier vrai test est demain 4h15.

---

## ⏳ ÇA ATTEND

### Soumissions
| Canal | État | Bloqué par |
|---|---|---|
| **iOS** | Soumission **en cours d'examen** chez Apple | Apple. ⚠️ Ne rien toucher aux métadonnées ASC tant que l'examen tourne — une modification peut le faire repartir de zéro. |
| **Android** | AAB 25 / **2.3.5** construit et signé | **Toi** : upload Play Console + test réel de l'upgrade Premium→Pro en place |
| **Extension Chrome** | **0.4.5** packagée | **Toi** : upload sur la fiche CWS **et** clic « Envoyer pour examen ». Tant que ce n'est pas fait, les utilisateurs tournent sur l'ancien code (vérifiable via `profiles.extension_build`) |

### Codé mais jamais éprouvé par un vrai usage
C'est la catégorie la plus importante de cet audit — tout ce qui suit est en
prod mais n'a **jamais rencontré un vrai utilisateur** :

1. **Le cycle de grant par utilisateur** (posé aujourd'hui). Premier grant réel
   demain 4h15 pour 9 comptes free ; premier grant d'un **abonné** le 1er août.
   Le backfill est vérifié (495 wallets, soldes inchangés) mais le mécanisme
   complet — échéance → crédit → nouvelle échéance — n'a tourné qu'une fois,
   sur un compte créé aujourd'hui.
2. ~~**Les grants 300/800** : aucun compte ne les a encore reçus.~~
   **ANNULÉS le soir même** (migration `20260728230000`, retour à 150/600) —
   et précisément parce qu'aucun compte ne les avait reçus, l'annulation n'a
   demandé aucun rattrapage ni claw-back. Motif tarifaire en section 4 de
   `LENS_COST.md`.
3. **Le plafond de report à 2×** : jamais déclenché.
4. **La garde « pas de paiement, pas de grant »** : jamais déclenchée non plus
   (aucune échéance n'a encore été dépassée de 3 jours).
5. **Les webhooks qui posent la date du store** : Apple, Google et Stripe ont
   été patchés aujourd'hui, mais aucun renouvellement réel n'est passé depuis.
   Le premier est attendu le 17/08 (l'unique abonné Stripe).
6. **Le crédit des consumables par webhook** (Apple + Google) : c'est le
   correctif de l'incident, il n'a **pas encore rattrapé un seul achat réel**.
7. **Les mails de paiement** : testés en envoi manuel (les deux types
   arrivent), jamais déclenchés par un vrai encaissement.
8. **Le patch plugin iOS** (ne plus `finish()` avant notification) : ne prendra
   effet qu'au **prochain binaire iOS**. La 2.3.5 iOS en review ne l'a pas.

### En attente d'une décision
- **Suppression de `included_granted_month`** : la colonne n'est plus lue par
  rien (vérifié côté SQL et applicatif). Je l'ai laissée exprès le temps de
  valider un ou deux cycles réels avant un DROP irréversible.
- **`invoice.paid` Stripe** : vérifié activé aujourd'hui dans le dashboard.
  Rien à faire, mais c'est une config externe qui peut être défaite sans que
  le code le sache — l'ops-digest la surveille désormais indirectement.

---

## ✅ C'EST FAIT (et tourne en prod)

- **Chaîne de paiement Pépites réparée** : les webhooks Apple et Google
  créditent les consumables server-side, avec une référence idempotente
  partagée avec le client (`apple:<txid>` / `google:<orderId>`) — un rejeu ne
  peut plus double-créditer.
- **Cycle de grant par utilisateur** : plus aucun crédit calendaire au 1er du
  mois. 495 wallets pourvus d'une échéance, réparties sur 31 jours (pic de 70
  comptes/jour contre 496 d'un coup auparavant).
- **Grants 150/600** en `coin_config`, plafond de report dérivé (300/1200).
  (Passés à 300/800 dans la journée, revenus à 150/600 le soir — motif
  tarifaire en section 4 de `LENS_COST.md`.)
- **Monitoring** : ops-digest porte 6 sections, dont deux nouvelles — achats
  store sans crédit, et abonnés dont le renouvellement n'est pas constaté.
- **Mail immédiat à chaque encaissement**, sur les trois canaux, avec un mail
  d'alerte distinct quand le crédit échoue.
- **`coin_config` en lecture seule pour les clients** : `anon` et
  `authenticated` avaient DELETE/INSERT/UPDATE/TRUNCATE sur la table des prix,
  seule la RLS protégeait. Vérifié : lecture OK, écriture refusée en 401.
- **Landing dynamique** : plus aucun grant écrit en dur nulle part dans le repo.
- **`generate-listing` instrumentée** : elle était le seul appel payant ni
  facturé ni tracé.
- **Coût du Lens documenté** (`docs/LENS_COST.md`).

---

## 🕳️ LA DETTE QUE TU RISQUES DE REDÉCOUVRIR

Classée par ce qu'elle coûtera quand elle ressortira.

### 1. `voice-intent` utilise un modèle déprécié — et cher
Deux appels (lignes 1264 et 1322) tournent sur **`claude-sonnet-4-20250514`**,
pour une tâche triviale : corriger un nom de marque déformé par la
transcription, `max_tokens: 20`. Ce modèle est **déprécié, retrait annoncé
mi-2026** : le jour où Anthropic le coupe, la correction de marque tombe en
erreur. Et il coûte 3× le prix de Haiku pour ce que Haiku ferait aussi bien.

### 2. Deux branches non mergées, dont une piégeuse
- `fix/lens-pause-turn-ebay-closed-lists` — **3 commits, contenu périmé** :
  elle porte l'ANCIENNE économie (quotas 5/120/250) et un `lens-analysis` sans
  la garde JSON. La merger écraserait la prod. À supprimer plutôt qu'à merger.
- `fix/detect-icon-beaute-couleur` — 3 commits, à trier.

### 3. `check_and_log_usage` garde une logique calendaire
Tu as demandé « plus aucun `date_trunc('month')` nulle part » : c'est vrai pour
les Pépites, mais cette fonction — qui gère les quotas voix et deal-analysis —
en garde un. C'est un système distinct, hors périmètre du chantier du jour,
mais il a le même défaut de fond : quota commun au calendrier, remis à zéro
le 1er pour tout le monde.

### 4. Le passif de Pépites en circulation
**16 739 Pépites incluses** et 3 652 achetées sont dans les portefeuilles. Avec
le report (même plafonné), ce stock ne se périme jamais et représente un coût
d'API futur déjà engagé. Voir l'audit de rentabilité pour le chiffrage.

### 5. Migrations désynchronisées entre repo et prod
Deux migrations de ce matin (`monthly_grant_override`, `monthly_grant_rollover`)
existent en base sous des numéros que le repo ne connaît pas ; le repo les
documente sous un autre horodatage. Un `supabase db push` réappliquerait des
choses. C'est idempotent aujourd'hui, mais **`db push` reste à proscrire** sur
ce projet.

### 6. Le bundle front dépasse 2 Mo
`index.js` fait 2 090 kB (653 kB gzip) et Vite le signale à chaque build.
Aucun code-splitting. Invisible tant que ça marche, pénible le jour où le
premier rendu devient un sujet.
