# Coût réel d'un scan Lens (€)

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

## 4. Coût mensuel et marge sur un abonnement à 9,99 €/mois

| Scans/mois | Coût typique | Fourchette | Marge sur 9,99 € brut | Marge sur ~7,08 € net* |
|---|---|---|---|---|
| 25 (= grant Premium, 150 Pépites) | 1,33 € | 0,60 – 4,50 € | **8,66 € (87 %)** | 5,75 € |
| 100 (= grant Pro, 600 Pépites) | 5,30 € | 2,40 – 18,00 € | **4,69 € (47 %)** | 1,78 € |
| 150 (utilisateur intensif) | 7,95 € | 3,60 – 27,00 € | **2,04 € (20 %)** | **−0,87 €** |

\* Net = 9,99 € TTC − TVA 20 % − commission store 15 % (small business) ≈ 7,08 €.
Avec la commission à 30 %, le net tombe à ≈ 5,83 € et le seuil de rentabilité
passe sous ~110 scans/mois.

### Nuance décisive : 150 scans ne sont PAS couverts par l'abonnement

Le grant Premium (150 Pépites) couvre **25 scans**, le grant Pro (600) en couvre
**100**. Un intensif à 150 scans achète les 50–125 scans excédentaires en packs :
6 Pépites ≈ **0,30 €** au pack 100 (4,99 €), ≈ 0,23 € au pack 1 300. Chaque scan
hors grant rapporte donc 0,23–0,30 € pour ~0,05 € de coût — **marge ~80 %**. Le
modèle tient : c'est le scan *inclus dans le grant* qui est un coût sec, et le
grant Pro (100 scans ≈ 5,30 €) reste absorbable si l'abonnement Pro est > 9,99 €.

Verdict : **le modèle 6 Pépites/scan tient économiquement.** Le seul point de
vigilance est le grant Pro à 600 Pépites si l'abonnement Pro était vendu 9,99 € :
un Pro qui consomme tout son grant en scénario haut (18 €) coûterait plus que
son abonnement net.

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
