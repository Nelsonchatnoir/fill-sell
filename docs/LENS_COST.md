# Coût réel des appels IA — Lens et génération d'annonce (€)

**Date d'analyse : 28/07/2026** — tarifs publics Anthropic relevés le jour même sur
`platform.claude.com/docs/en/docs/about-claude/pricing` (USD) et
`…/build-with-claude/vision` (facturation images).
**Version du code analysée : la version PROD déployée (v53 de `lens-analysis`)**,
récupérée via l'API Supabase — elle est identique au fichier
`supabase/functions/lens-analysis/index.ts` de `main` (commit `13bd296`,
payant-par-scan). ⚠️ La branche `fix/lens-pause-turn-ebay-closed-lists` est EN
RETARD : elle porte l'ancienne économie (quota inclus 5/120/250 + overrides),
ne pas s'y fier pour ce calcul.

Périmètre : l'appel `lens-analysis` seul. La dictée vocale de la note
(`voice-transcribe`) est une fonction séparée, hors périmètre.

---

## 1. Ce qu'un scan déclenche réellement (code prod)

| Poste | Détail dans le code |
|---|---|
| Modèle | `claude-haiku-4-5-20251001` — 1 $/MTok input, 5 $/MTok output |
| Appel principal | 1 requête `/v1/messages` avec l'outil serveur `web_search_20250305`, `max_tokens: 2500`, `temperature: 0` |
| Relances `pause_turn` | Jusqu'à **3** ré-appels si l'API interrompt le tour ; chaque relance ré-envoie TOUTE la conversation (système + images + résultats de recherche accumulés) |
| Repli sans outil | Si l'appel web_search jette une exception : 1 appel vision seule (mêmes images, même système) |
| Passe de réparation | Si le JSON est imparsable : 1 appel supplémentaire sans outil (images + réponse tronquée à 4 000 chars + prefill `{`) — rare, uniquement après échec de parsing |
| Retries HTTP | `fetchWithRetry` : 3 tentatives sur 429/erreur réseau — un 429 n'est **pas facturé**, pas de surcoût |
| Web search | Outil serveur : les recherches s'exécutent DANS la requête. Pas de `max_uses` posé → le modèle décide. Le prompt en **exige 2 minimum** (validation marque + estimation prix) |
| Images | 1 à 5 photos aujourd'hui (cap client App.jsx ; le serveur accepte 8 via `slice(0,8)`), envoyées **par URL, sans aucun redimensionnement** : le flux Lens lit le fichier brut (jusqu'à 8 Mo, caméra qualité 90 pleine résolution) et l'upload tel quel dans `lens-temp`. La `compressImage(1024px)` de LensTab.jsx:592 ne sert QUE le flux listing-photos, pas Lens |
| Autres services | Aucun (Supabase storage/RPC : coût marginal nul) |

### Point de mécanique qui domine le coût

`web_search` est un outil **serveur** : chaque recherche ajoute une itération
d'échantillonnage dans la même requête, et **chaque itération re-facture tout
l'input** (système + toutes les images + les résultats de recherche déjà
accumulés). Sans prompt caching — et il n'y a **aucun** `cache_control` dans le
code — tout est au plein tarif à chaque itération. Les images sont donc
facturées 2 à 5 fois par scan.

---

## 2. Estimation des tokens (mesurée sur les prompts réels)

| Élément | Mesure | Tokens estimés |
|---|---|---|
| Prompt système FR | 5 548 chars (template) + 986 chars (schéma JSON) + plateformes/multiNote ≈ 6 700 chars | ≈ 2 200 |
| System prompt implicite « tool use » (Haiku 4.5, tool_choice auto) | tarif officiel | 496 |
| **Système total / itération** | | **≈ 2 700** |
| Image (photo téléphone) | tuiles 28×28 : `⌈l/28⌉×⌈h/28⌉`, plafond standard 1 568 px / 1 568 tokens — les photos téléphone (3–12 MP) sont toujours downscalées au plafond | **≈ 1 550 / photo** |
| Note utilisateur + stats | quelques lignes | ≈ 100 |
| Résultats d'une recherche web | bloc `web_search_tool_result` (facturé en input aux itérations suivantes) | ≈ 3 000 |
| Sortie (JSON + requêtes de recherche) | JSON du schéma ≈ 800 tok + narration | 900 – 2 200 |

---

## 3. Coût par scan — 3 scénarios

Hypothèse de change : **1 € = 1,08 $** (0,926 €/$). Web search : **0,01 $/recherche**.

### Scénario BAS — 1 photo, 1 recherche (2 itérations)
| Poste | Tokens | Coût |
|---|---|---|
| Input (4 350 + 7 450) | 11 800 | 0,0118 $ |
| Output | 900 | 0,0045 $ |
| Web search ×1 | — | 0,0100 $ |
| **Total** | | **0,026 $ ≈ 0,024 €** |

### Scénario TYPIQUE — 3 photos, 2 recherches (3 itérations)
| Poste | Tokens | Coût |
|---|---|---|
| Input (7 450 + 10 530 + 13 610) | 31 590 | 0,0316 $ |
| Output | 1 050 | 0,0053 $ |
| Web search ×2 | — | 0,0200 $ |
| **Total** | | **0,057 $ ≈ 0,053 €** |

### Scénario HAUT — 5 photos, 4 recherches (5 itérations) + 1 relance pause_turn
| Poste | Tokens | Coût |
|---|---|---|
| Input tour 1 (5 itérations) | 83 550 | 0,0836 $ |
| Input relance (conversation ré-envoyée + 1 recherche) | ≈ 51 000 | 0,0510 $ |
| Output | 2 200 | 0,0110 $ |
| Web search ×5 | — | 0,0500 $ |
| **Total** | | **0,196 $ ≈ 0,18 €** (0,12 € sans relance) |

La passe de réparation, quand elle part (rare), ajoute ≈ 0,012 € (un appel
complet images comprises, sans outil).

> **Retenir : ~0,05 € le scan typique, fourchette 0,025 – 0,18 €.**
> Répartition typique : ~55 % tokens input (dont plus de la moitié = images
> re-facturées à chaque itération), ~35 % frais fixes web search, ~10 % output.

---

## 4. Coût mensuel et marge par abonnement

⚠️ **Grants en vigueur au 28/07/2026 : free 30, premium 150, pro 600**
(`coin_config`). Ils sont passés à 300/800 dans la journée (20260728180000)
puis **revenus à 150/600 le soir même** (20260728230000) — motif en fin de
section. Prix réels des abonnements : **Premium 12,99 €**, **Pro 29,99 €**.

| Scans/mois | Coût typique | Fourchette | Ce que ça représente |
|---|---|---|---|
| 5 (= grant Free, 30 Pépites) | 0,27 € | 0,12 – 0,90 € | coût d'acquisition d'un inscrit |
| 25 (= grant Premium, 150 Pépites) | 1,33 € | 0,60 – 4,50 € | plafond de consommation Premium |
| 100 (= grant Pro, 600 Pépites) | 5,30 € | 2,40 – 18,00 € | plafond de consommation Pro |

Marge si l'abonné consomme **tout** son grant en analyses Lens (le pire des cas —
en pratique une partie part en publications, moins chères) :

| Offre | Prix TTC | Net après TVA 20 % + 15 % store | Coût max Lens | Marge plancher |
|---|---|---|---|---|
| Premium | 12,99 € | ≈ 9,20 € | 1,33 € | **7,87 € (86 %)** |
| Pro | 29,99 € | ≈ 21,24 € | 5,30 € | **15,94 € (75 %)** |

Avec une commission store à 30 %, le net tombe à ≈ 7,57 € (Premium) et 17,49 €
(Pro) : les marges plancher restent à 6,24 € (82 %) et 12,19 € (70 %).

### Le scénario catastrophe

En scénario HAUT (0,18 €/scan — 5 photos et 4 recherches à *chaque* analyse,
tout le grant passé en Lens), un Premium coûterait 4,50 € pour 9,20 € net, et
un Pro 18,00 € pour 21,24 € net. Les deux restent positifs. Le seul point qui
bascule est **le Pro, chez un store à 30 %** : 18,00 € de coût pour 17,49 € net,
soit −0,51 €. Cas d'usage extrême et improbable, et le levier n°1
(redimensionner les photos, cf. section 5) l'efface à lui seul.

Au-delà du grant, chaque scan est acheté en pack : 6 Pépites ≈ **0,30 €** au
pack 100 (4,99 €), ≈ 0,23 € au pack 1 300 — pour ~0,05 € de coût réel, soit une
**marge de ~80 %** sur tout le volume hors abonnement.

### Pourquoi 150/600 et pas 300/800

La règle tarifaire, posée le 28/07 : **les Pépites incluses doivent valoir
MOINS que le prix de l'abonnement — la différence, c'est le prix de la
fonctionnalité** (inventaire illimité, vocal, publication multi-plateformes).
Le prix de référence d'une Pépite est celui du pack d'entrée : 4,99 € les 100,
soit ≈ 0,05 €.

| Grant testé | Valeur au tarif pack d'entrée | Prix de l'abonnement | Verdict |
|---|---|---|---|
| Premium 300 | ≈ 15,00 € | 12,99 € | **au-dessus du prix** → refusé |
| Premium 150 | ≈ 7,49 € | 12,99 € | 58 % du prix → il reste 5,50 € de fonctionnalité |
| Pro 800 | ≈ 39,90 € | 29,99 € | **au-dessus du prix** → refusé |
| Pro 600 | ≈ 29,94 € | 29,99 € | à la limite haute (voir ci-dessous) |

À 300, un Premium offrait plus de Pépites qu'il ne coûtait : l'inventaire
illimité devenait un cadeau. Et à 300/800 le rapport Pro/Premium tombait à
2,7× pour 2,3× le prix — **Pro n'avait plus rien à vendre face à Premium**.
À 150/600 il retrouve 4× les Pépites pour 2,3× le prix.

Nuance à connaître sur le Pro : au tarif du pack d'entrée, ses 600 Pépites
valent ≈ 29,94 € pour un abonnement à 29,99 € — la règle est respectée de
justesse. Au tarif du plus gros pack (0,038 €/Pépite, le vrai comparable pour
un gros consommateur) elles valent ≈ 23,07 €, soit 77 % du prix, ce qui laisse
une vraie marge de fonctionnalité. Le Pro est donc calibré au plafond assumé,
pas au milieu de la fourchette.

Verdict : **le modèle tient**, avec une marge plancher au-dessus de 70 % dans
tous les cas de figure raisonnables.

---

## 5. Leviers de réduction repérés dans le code

Par ordre d'impact :

1. **Redimensionner les photos du flux Lens côté client** (le poste n°1).
   `compressImage(1024px, q0.85)` existe déjà dans LensTab.jsx:592 mais n'est
   pas appliquée au flux `lens-temp` (App.jsx:4302 envoie le dataURL brut).
   À 1 024 px : ~1 050 tok/photo (−32 %) ; à 800 px : ~650 tok (−58 %).
   L'économie se **multiplie par le nombre d'itérations** (2 à 5). Impact
   typique : −15 à −25 % du coût total, zéro risque qualité (le modèle ne voit
   déjà que du 1 568 px max).
2. **Prompt caching** — aucun `cache_control` aujourd'hui. Minimum cacheable
   Haiku 4.5 = 4 096 tokens : le système seul (~2 700) ne passe pas, mais un
   breakpoint sur le **dernier bloc image** (système + images ≈ 7 450 tok)
   passe le seuil. Les itérations 2+ et les relances pause_turn liraient ce
   préfixe à 0,1×. Impact typique : −30 à −40 % du poste input (−0,01 à
   −0,015 €/scan), une ligne de code.
3. **Capper la recherche web : `max_uses: 2`** sur l'outil. Rien ne borne
   aujourd'hui le nombre de recherches ; chaque recherche évitée économise
   0,01 $ + ~3 000 tokens d'input re-facturés sur chaque itération suivante.
4. **Fusionner les 2 recherches obligatoires en 1** quand la marque est lisible
   (une requête « marque + produit + prix vinted » valide l'orthographe ET
   donne les prix). Typique 2 → 1 recherche : ≈ −0,015 €/scan (−28 %).
5. **Structured outputs** (`output_config.format`) à la place du prompt
   « JSON uniquement » : supprime le mode d'échec « réponse en prose » et donc
   la passe de réparation. Gain marginal en coût, réel en fiabilité.
6. **Ne pas monter de modèle** : Haiku 4.5 est déjà le moins cher du catalogue ;
   Sonnet triplerait le poste tokens (~0,15 €/scan typique).

Leviers 1+2+3 combinés : scan typique estimé à **~0,03 €** (−45 %), scénario
haut ramené sous 0,08 €.

---

# 6. Coût de `generate-listing` — l'action à 3 / 12 / 35 Pépites

**Instrumenté le 28/07/2026.** C'était le seul appel payant ni facturé ni tracé
alors que c'est le plus fréquent : il part à CHAQUE génération d'annonce, y
compris quand l'utilisateur ne publie jamais derrière. Chaque appel écrit
désormais une ligne `usage_logs` (feature `generate_listing`) avec ses tokens,
son nombre d'images et son coût en dollars, plus une ligne de log
`[generate-listing][cost]`.

## Ce qu'un appel déclenche

| Poste | Détail |
|---|---|
| Claude | `claude-haiku-4-5` — jusqu'à 4 appels : genre eBay (`max_tokens` 50, conditionnel), aspects eBay (400, conditionnel), icône de catégorie (20), **rédaction des annonces (900)**. La rédaction tourne en `Promise.all` sur les plateformes sélectionnées : 1 appel par plateforme. |
| Prompts système | 8 blocs selon la plateforme et le rôle, de 525 à 5 384 caractères (~1 350 tokens pour le plus gros, eBay). |
| GPT Image 2 | `/images/edits`, uniquement si `photo_option ≠ original` : `quality: "low"` en ia_light, `"medium"` en ia_advanced. Cappé à 5 photos. |
| Web search | aucun — contrairement à Lens. |

## Coût par option (tarifs du 28/07/2026, 1 € = 1,08 $)

Hypothèses : 4 plateformes sélectionnées, ~1 400 tokens d'entrée par appel de
rédaction (prompt système + contexte article), ~350 tokens de sortie, plus les
2 appels eBay conditionnels. Haiku 4.5 à 1 $/MTok en entrée et 5 $/MTok en
sortie. GPT Image 2 ≈ 0,01 $ l'image en `low`, ≈ 0,04 $ en `medium`.

| Option | Prix payé | Claude | Images | Coût total | Marge |
|---|---|---|---|---|---|
| **original** (3 Pép.) | ~0,10 € | ≈ 0,010 € | 0 | **≈ 0,010 €** | ~90 % |
| **ia_light** (12 Pép.) | ~0,40 € | ≈ 0,010 € | 5 × low ≈ 0,046 € | **≈ 0,056 €** | ~86 % |
| **ia_advanced** (35 Pép.) | ~1,17 € | ≈ 0,010 € | 5 × medium ≈ 0,185 € | **≈ 0,195 €** | ~83 % |

Prix payé = Pépites × 0,033 €/Pépite. C'est le tarif d'un GROS consommateur
(pack 1 300 à 49,99 € ≈ 0,038 €, arrondi vers le bas) — l'hypothèse la plus
défavorable pour la marge. Un abonné Premium paie en réalité ses Pépites
incluses ≈ 0,087 € pièce (12,99 € pour 150), et un acheteur du pack d'entrée
0,05 € : dans les deux cas les marges du tableau sont sous-estimées.

## Ce que ça dit des rapports 3 / 12 / 35

Les trois marges sont proches (83–90 %), donc la grille est **cohérente** : le
rapport des prix suit à peu près le rapport des coûts réels. Deux observations :

- **Le poste Claude est quasi constant** (~0,01 €) quelle que soit l'option :
  la rédaction des annonces coûte la même chose qu'on retouche ou non les
  photos. C'est l'image qui fait tout l'écart, et elle est bien facturée en
  conséquence.
- **ia_advanced est le seul poste à surveiller** : à 0,195 € il coûte ~4× un
  scan Lens typique, et son coût est proportionnel au nombre de photos. Le cap
  à 5 photos est donc une protection réelle, pas cosmétique.

⚠️ Ces chiffres sont **estimés à partir des prompts et des tarifs**, comme la
section Lens. Les premières lignes `usage_logs` en production donneront les
valeurs mesurées — requête de contrôle :

```sql
select photo_option, count(*),
       round(avg((metadata->>'cost_usd')::numeric), 4) as usd_moyen,
       round(avg((metadata->>'claude_input_tokens')::numeric)) as tok_in_moyen
from usage_logs
where feature = 'generate_listing' and created_at > now() - interval '7 days'
group by 1 order by 1;
```
