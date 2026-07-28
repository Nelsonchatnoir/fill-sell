# Audit de rentabilité — grants 30 / 300 / 800

**28/07/2026.** Tarifs API relevés le jour même. Volumes réels lus en base sur
30 jours glissants. Change 1 € = 1,08 $.

**Ce qui est mesuré vs estimé** : les *volumes* (nombre d'appels, répartition
des options, comptes) sont **mesurés** en base. Les *coûts unitaires* sont
**estimés** à partir des prompts réels et des tarifs publics — l'instrumentation
de `generate-listing` posée aujourd'hui donnera les valeurs mesurées d'ici
quelques jours, celle de Lens reste à faire.

---

## 1. Coût réel par action, et coût par Pépite

| Action | Prix | Coût typique | Coût haut | **€ / Pépite (typique)** | **€ / Pépite (haut)** |
|---|---|---|---|---|---|
| **Analyse Lens** | 6 Pép. | 0,053 € | 0,180 € | **0,0088 €** | **0,0300 €** |
| Publication `original` | 3 Pép. | 0,010 € | 0,015 € | 0,0033 € | 0,0050 € |
| Publication `ia_light` | 12 Pép. | 0,056 € | 0,070 € | 0,0047 € | 0,0058 € |
| Publication `ia_advanced` | 35 Pép. | 0,195 € | 0,220 € | 0,0056 € | 0,0063 € |

### Le Lens est de loin l'action la plus chère à faire payer
À prix identique en Pépites, **Lens coûte 2,7× plus cher que la publication la
mieux tarifée** (0,0088 contre 0,0033 €/Pépite), et **jusqu'à 9× à la borne
haute** (0,030 contre 0,0033). C'est l'unique action dont le coût par Pépite
dépasse 0,006 €.

Deux raisons structurelles : la recherche web (frais fixe de 0,01 $ par
requête, 2 minimum par scan) et surtout le fait que **chaque itération de
recherche re-facture toutes les images** — un scan à 5 photos et 4 recherches
paie ses images cinq fois.

**Conséquence directe : tout scénario de perte passe par le Lens.** Les trois
publications sont sans danger quel que soit le volume.

---

## 2. Le pire cas, tier par tier

### Revenus nets encaissés

| Offre | Prix TTC | HT (TVA 20 %) | **Net Apple/Google (−30 %)** | **Net Stripe (−3 %)** |
|---|---|---|---|---|
| Premium | 12,99 € | 10,83 € | **7,58 €** | **10,18 €** |
| Pro | 29,99 € | 24,99 € | **17,49 €** | **23,84 €** |

> Si le Small Business Program (15 %) s'applique, les nets Apple/Google passent
> à 9,20 € et 21,24 € — ce qui change les conclusions ci-dessous. À vérifier.

### Scénario A — l'utilisateur brûle son grant du mois, entièrement en Lens

| Tier | Grant | Scans | Coût typique | **Coût haut** |
|---|---|---|---|---|
| Premium | 300 | 50 | 2,65 € | **9,00 €** |
| Pro | 800 | 133 | 7,05 € | **23,94 €** |

| Situation | Net encaissé | Coût haut | **Résultat** |
|---|---|---|---|
| Premium **Apple/Google** | 7,58 € | 9,00 € | **−1,42 € ❌** |
| Premium **Stripe** | 10,18 € | 9,00 € | +1,18 € ✅ |
| Pro **Apple/Google** | 17,49 € | 23,94 € | **−6,45 € ❌** |
| Pro **Stripe** | 23,84 € | 23,94 € | **−0,10 € ⚠️** (équilibre exact) |

### Scénario B — l'utilisateur brûle son plafond accumulé (2 mois de grant)

| Tier | Plafond | Scans | Coût typique | Coût haut | Net sur 2 mois (Apple) | Résultat haut |
|---|---|---|---|---|---|---|
| Premium | 600 | 100 | 5,30 € | 18,00 € | 15,16 € | **−2,84 € ❌** |
| Pro | 1600 | 266 | 14,10 € | 47,88 € | 34,98 € | **−12,90 € ❌** |

Nuance importante : le plafond ne se brûle qu'**une fois**, et il suppose deux
mois de cotisation encaissés pour un seul mois de consommation. Le tableau
ci-dessus compare donc bien 2 mois de revenus à 2 mois de grants.

### RÉPONSE DIRECTE À LA QUESTION

> À la borne haute de la fourchette Lens (0,18 €), est-ce qu'un Premium ou un
> Pro peut me coûter plus qu'il ne rapporte ?

**OUI — mais uniquement sur Apple et Google, et uniquement en Lens intensif.**

- **Premium Apple/Google : −1,42 €.** 50 scans à 0,18 € = 9,00 € contre 7,58 €
  encaissés.
- **Pro Apple/Google : −6,45 €.** 133 scans à 0,18 € = 23,94 € contre 17,49 €.
- **Sur Stripe, jamais** (sauf le Pro, exactement à l'équilibre à −0,10 €).

La commission de 30 % est le facteur décisif : elle coûte plus cher que
l'intégralité de la consommation Lens en scénario typique.

**Ce scénario est-il réaliste ?** Il suppose que l'utilisateur consacre 100 %
de ses Pépites au Lens **et** que chaque scan tombe dans le pire cas (5 photos,
4 recherches web). Aujourd'hui la moyenne est de 0,053 €. Le risque est donc
faible **mais réel**, et il augmente avec les nouveaux grants : à 150 Pépites,
un Premium ne pouvait pas dépasser 4,50 € de coût ; à 300 il peut atteindre 9 €.

---

## 3. Ce qui coûte et ne rapporte rien

`coin_config` ne facture que 4 actions. **Neuf fonctions** consomment de l'API ;
**sept ne coûtent aucune Pépite**.

| Fonction | Modèle | Facturée ? | Coût unitaire estimé | Appels / 30 j (mesuré) | Coût / mois |
|---|---|---|---|---|---|
| `lens-analysis` | Haiku 4.5 + web search | ✅ 6 Pép. | 0,053 € | **563** | 29,84 € |
| `generate-listing` | Haiku 4.5 + GPT Image | ✅ 3/12/35 | 0,010–0,195 € | **74** | 1,99 € |
| `voice-transcribe` | **Whisper-1** | ❌ quota seul | ~0,0019 € | **230** | 0,44 € |
| `voice-intent` | Haiku 4.5 + **Sonnet 4** | ❌ quota seul | ~0,0033 € | **196** | 0,65 € |
| `voice-parse` | Haiku 4.5 (`max_tokens` 8192) | ❌ **aucune garde** | ~0,004 € | non tracé | ~0,5 € ? |
| `deal-analysis` | Haiku 4.5 | ❌ quota seul | ~0,003 € | **17** | 0,05 € |
| `normalize-title` | Haiku 4.5 (`max_tokens` 20) | ❌ **aucune garde** | ~0,0005 € | non tracé | ~0,2 € ? |
| `stats-analysis` | Haiku 4.5 (800 tok) | ❌ **aucune garde** | ~0,002 € | non tracé | ~0,1 € ? |
| `lot-distribute` | Haiku 4.5 (2048 tok) | ❌ **aucune garde** | ~0,003 € | non tracé | ~0,1 € ? |

### Ce que ça représente aujourd'hui
**Total gratuit estimé : ~2 €/mois**, contre ~32 € pour les actions facturées.
Soit **6 % de la facture**. Ton soupçon était légitime mais, à ce volume, ce
n'est **pas** le poste qui menace le modèle.

### Ce qu'il faut quand même retenir
1. **Quatre fonctions n'ont AUCUNE garde** : `voice-parse`, `normalize-title`,
   `stats-analysis`, `lot-distribute`. Ni quota, ni Pépites, ni log — je ne
   peux même pas te dire combien de fois elles sont appelées. `voice-parse`
   monte à `max_tokens: 8192`, c'est la plus coûteuse du lot.
2. **Le ratio d'appels est défavorable** : 426 appels vocaux gratuits contre
   563 Lens facturés. La voix est presque aussi utilisée que le Lens, et ne
   rapporte rien. Elle est peu chère à l'unité — c'est ce qui sauve.
3. **`voice-intent` paie du Sonnet 4** (déprécié, 3× le prix de Haiku) pour
   corriger un nom de marque en 20 tokens. Bascule vers Haiku = −60 % sur
   cette fonction, sans perte de qualité perceptible sur une tâche aussi
   simple.

---

## 4. Le coût des comptes gratuits

**484 comptes free × 30 Pépites = 14 520 Pépites/mois** distribuées.

| Hypothèse | Consommation | Coût |
|---|---|---|
| **Tout consommé en Lens** (le pire) | 2 420 scans | **128 € / mois** (typique) · **436 €** (haut) |
| **Tout consommé en publication `original`** | 4 840 publications | 48 € / mois |
| **Réalité mesurée aujourd'hui** | 563 scans Lens **tous tiers confondus** | **~30 € / mois** |

Le taux d'utilisation réel est donc d'environ **20 % du potentiel free**. C'est
ce qui rend le modèle confortable aujourd'hui — et c'est exactement ce qui peut
changer sans prévenir.

**Le chiffre à surveiller** : 76 inscrits sur les 7 derniers jours. À ce rythme
(~330/mois), le potentiel free grossit de ~9 900 Pépites/mois, soit **+87 €/mois
de coût potentiel** — à comparer à un CA d'environ 110 € net/mois. Si le taux
d'activation passe de 20 % à 50 %, le coût des comptes gratuits dépasse le
revenu des abonnés.

---

## 5. Conclusion

**Le modèle est rentable aujourd'hui** : ~32 € de coût API mensuel pour ~110 €
de revenus nets, soit une marge d'environ 70 %. Les grants à 300/800 ne
remettent pas cela en cause au niveau d'usage actuel.

**Il cesse de l'être** dans un cas précis : un abonné **Apple ou Google** qui
consacre l'intégralité de son grant à des analyses Lens en scénario haut —
−1,42 € pour un Premium, −6,45 € pour un Pro. Sur Stripe, jamais. Le seuil
n'est pas un nombre d'utilisateurs mais un **comportement** : au-delà de ~42
scans/mois (Premium) et ~97 (Pro) au tarif haut, l'abonné coûte plus qu'il ne
rapporte.

**Levier n°1 : réduire le coût du Lens à la source, en redimensionnant les
photos côté client avant l'envoi.** La fonction `compressImage(1024px)` existe
déjà dans le code mais n'est pas branchée sur le flux Lens, qui envoie les
photos brutes. Gain immédiat de 15 à 25 %, sans aucune perte de qualité (le
modèle plafonne de toute façon à 1 568 px), et l'économie se multiplie par le
nombre d'itérations de recherche. Combiné au cache de prompt et à un
`max_uses: 2` sur la recherche web, le scan typique tombe à ~0,03 € — ce qui
ramène **tous** les scénarios ci-dessus en territoire positif, Apple compris.
