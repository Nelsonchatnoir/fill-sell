# Lot du 14/11/2026 (soir) — plafond IA global et retouche photo OpenAI

Consigne de Nico (14/11, soir) : point 1 « plus rien ne doit bloquer » (plafonds globaux de dépense IA) ; point 2
« retouche photo : moins cher, qualité égale ou meilleure, avant le 01/12 ». Aucun changement de quota, de prix, d'offre
ni de parcours ; aucun mail. Heures de Paris.

## Point 1 — plafond IA global

### Ce qui s'est passé le 14/11
- `ia_depense_jour` Anthropic du 14/11 : 10,33 $ (1 530 appels) ; le niveau « confort » coupait à 9 $/jour.
- En base, plus aucune ligne `lens_identify` après 15 h ni `resolve_categorie` après 17 h (heure de Paris) : identify et
  choix du rayon par l'IA coupés pour tout le monde.
- Pré-contrôle eBay : `inventaire.attributs.lens_scan` en « echec », détail `HTTP 429 identify_unavailable`, sur 5 articles
  le 14/11 (16:56, 17:02, 18:42 ×2, 20:02 — e5be98ba job 86f5cd5f, f8aa02a5 = Ornella ×2, 13e274de ×2) et 5 le 02/11
  (521b7f89 ×4, 8ac5bbda). La publication a continué « avec ses trous » (job 86f5cd5f en ligne depuis 20:10:20).
- Novembre à 77,29 $ Anthropic au 14 : les plafonds PAR MOIS (120 / 160 / 185 $) auraient recoupé vers le 22/11.

### Les plafonds globaux trouvés (avant → après)
| Plafond | Où | Qui il coupait | Avant | Après |
|---|---|---|---|---|
| « moteur » | `_shared/budget-ia.ts` | leviers IA des aspects (generate-listing) | 6 $/jour, 120 $/mois | **50 $/jour**, plus de mois |
| « confort » | `_shared/budget-ia.ts` | resolve-categorie (rayon, listes, champs), micro-appels de generate-listing (genre, couleur, ISBN, aspects), identify de lens-analysis (app et worker eBay) | 9 $/jour, 160 $/mois | **50 $/jour**, plus de mois |
| « essentiel » | `_shared/budget-ia.ts` | scan Lens complet, rédaction complète | 14 $/jour, 185 $/mois | **50 $/jour**, plus de mois |
| identify global | `lens-analysis` (`PLAFOND_IDENTIFY_GLOBAL`) | identify pour tout le monde | 3 000 appels/jour (≈ 82 $ au coût du 14/11, 0,027 $/appel) | **retiré** (couvert par le filet de 50 $) |
| copie du précédent | `ops-digest` § 7 | alerte du digest | 3 000 recopié | lit le filet (constante importée) |

Les trois niveaux partagent le même compteur (dépense Anthropic du jour) : le filet coupe donc à 50 $ au total.
Gardes NON globales, inchangées (par compte ou par geste) : identify 60/24 h par compte (sauf worker eBay),
resolve_categorie / normalize_title (200) / lot_distribute (100) / stats_analysis (30) / voice_parse (300) par compte,
rapprochement-ia 1 € par compte et par passage, `pro_generate_daily_cap` (200, palier Pro), quota de retouche du palier
et 5 photos retouchées par annonce, 3 scans Lens par passe du worker eBay. Aucun plafond global n'existe sur OpenAI
(retouche, voix) : il n'y avait rien à relever.

### Le signal à 80 %
`budgetIaAutorise` pose, au premier passage au-delà du seuil, une ligne `usage_logs` (user_id NULL) : `ia_plafond_approche`
dès 40 $ (80 %), `ia_plafond_atteint` à 50 $, une par jour de Paris (métadonnées : jour, dépense, filet, %, OpenAI du
jour, fonction). Requête des check news :
`select created_at, feature, metadata from usage_logs where user_id is null and feature like 'ia_plafond_%' order by created_at desc limit 5;`
Le digest `ops-digest` a sa section « Dépense IA — filet de 50 $ par jour » (80 % et 100 %).

### Au-delà du filet : rien n'est bloqué
- Rédaction (generate-listing) : avant, 429 `generation_indisponible`, affiché « Le souci vient de nos serveurs ». Après :
  le chemin d'une panne de l'IA — aucun appel Claude, textes de repli (titre et description de la fiche), unité rendue
  (`no_llm_output`), fiche enregistrée, retouche photo faite comme d'habitude ; `generate_listing.metadata.ia_coupee`.
- Scan Lens complet : avant, 429 `analyse_indisponible`, affiché en code brut. Après : 503 `ai_unavailable` (la réponse
  de la panne Anthropic) — l'app dit « IA indisponible » et propose « Créer l'annonce sans analyse ».
- Identify, micro-appels, rayon : réponses « sans IA » inchangées, déjà traitées (parcours continué, question, défaut).
- Garde-fou eBay « catégorie à confirmer » et quotas des paliers : non touchés (contrôlé par le verrou).

### Constat laissé à Nico (non corrigé)
Le worker eBay ne fait qu'UN scan identify par article « à vie, échec compris » (`attributs.lens_scan`). Un refus du
plafond, AVANT tout appel payant, a donc consommé ce scan unique sur les 10 articles ci-dessus. Proposition : un refus
avant appel (plafond, garde) ne consomme pas le scan. Rien n'a été modifié dans ebay-api-worker ni sur ces articles.

### Preuves
- Fonctions (relues avant et après, 22:32) : generate-listing 144 → **145** (puis **146** à 22:34:55, commentaire de
  `_shared/retouche-photo.ts` seul), lens-analysis 128 → **129** (verify_jwt true) ; resolve-categorie 30 → **31**,
  ops-digest 69 → **70** (verify_jwt false). Banc `retouche-banc` **v5** (verify_jwt true, service_role seulement).
- Verrou **`selftest:filet-ia`** (12 cas) : ROUGE sur le code d'avant (« le 14/11 rejoué » : le niveau moteur se ferme à
  10,18 $), VERT après. `selftest:budget-ia` et `selftest:ia-leviers` mis à la règle du 14/11.

## Point 2 — retouche photo OpenAI

### 2.1 Le modèle d'aujourd'hui et son statut
- `gpt-image-2`, `/v1/images/edits`, prompt « légère » (balance des blancs, luminosité), qualité **low**, **1024×1024**,
  n = 1, sortie PNG (défaut), fond `auto` (défaut), pas d'`input_fidelity` (gpt-image-2 lit toujours l'entrée en haute
  fidélité). 30 derniers jours : 375 retouches, 100 % « légère », 1 418 photos envoyées (3,78 par retouche),
  **0,0614 $ par retouche, 0,0162 $ par photo**, 17,4 s par retouche. Le 14/11 : 70 retouches, 4,89 $ (0,070 $).
- Documentation officielle OpenAI relue le 14/11 (developers.openai.com : deprecations, pricing, models, image
  generation) : s'arrêtent le **01/12/2026** gpt-image-1-mini, gpt-image-1.5, chatgpt-image-latest ; gpt-image-1 arrêté
  le 23/10. **gpt-image-2 n'est PAS arrêté le 01/12** ; il est annoncé arrêté le **10/02/2027** (préavis du 10/11/2026),
  remplaçants « gpt-image-2.6-sunburst ou gpt-image-2.6-flare ». La famille 2.5 (Sunburst, Flare, instantanés
  2026-09-08) existe, la famille 2.6 aussi. Prix au jeton IDENTIQUES pour 2, 2.5 et 2.6 : texte 5 $, image en entrée
  8 $, image en sortie 30 $ par million.

### 2.2 Le comparatif (banc `retouche-banc`, 10 vraies photos des comptes de Nico et d'Ornella)
Même retouche qu'aujourd'hui (prompt légère, low, 1024×1024). Coût = jetons facturés lus dans chaque réponse
OpenAI. Qualité mesurée sur la zone commune après recalage de l'original : ΔE moyen (écart de couleur, bas = fidèle),
SSIM (structure, haut = pas de déformation), netteté (détail de la sortie / original), puis contrôle à l'œil (planches
pleine page et détails à 100 %). Par retouche = × 3,78 photos (moyenne de prod).

| Modèle | Réglage | $ / photo | $ / retouche | ΔE | SSIM | Netteté | Temps / photo |
|---|---|---|---|---|---|---|---|
| **gpt-image-2 (aujourd'hui)** | low | **0,0171** | **0,065** | 12,7 | 0,61 | 1,45 | 10,3 s |
| gpt-image-2.5-flare | low | 0,0171 | 0,065 | 13,7 | 0,56 | 1,42 | 8,6 s |
| gpt-image-2.5-sunburst | low | 0,0171 | 0,065 | 12,5 | 0,55 | 1,35 | 12,1 s |
| gpt-image-2.6-flare | low, complexity low | 0,0360 | 0,136 | 12,8 | 0,56 | 1,29 | 6,7 s |
| gpt-image-2.6-flare | low, complexity défaut | 0,0360 | 0,136 | — | — | — | 7,4 s |
| gpt-image-2.6-sunburst | low, complexity low / défaut | 0,0360 | 0,136 | — | — | — | 9,3 / 16,8 s |
| gpt-image-2 + photo réduite à 1024 px | low | **0,0132** | **0,050** | 11,5 | 0,59 | 1,48 | 10,0 s |
| gpt-image-2.5-flare + photo réduite à 1024 px | low | 0,0132 | 0,050 | 13,6 | 0,57 | 1,44 | 8,8 s |

- Jetons : 2 / 2.5 = 1 297 d'image en entrée et 196 en sortie par photo (identiques) ; 2.6 = 824 en sortie quel que soit
  `complexity` → deux fois plus cher. L'entrée compte ≈ 1 jeton par carré de 32 px (800×1000 → 832, 1024×1467 → 1 472) :
  60 % du prix d'une photo.
- À l'œil : tous gardent l'article (couleur, logo, motif) ; gpt-image-2 recadre souvent en carré en zoomant (bas de jupe,
  bouilloire) ; la famille 2.5 garde tout le cadrage mais **lisse le tissu** (plis du t-shirt Adidas effacés, ce que le
  prompt interdit) ; la photo réduite à 1024 px ne perd aucun détail visible (plis, logo net).

### 2.3 Décision : PAS de bascule de modèle
Aucun modèle n'est moins cher à qualité égale (2.5 = même prix, qualité un peu en dessous ; 2.6 = 2×). Règle de Nico :
« si aucun ne fait les deux à la fois, ne bascule pas » → **gpt-image-2 reste le modèle principal**, réglages inchangés.
Le seul levier mesuré moins cher à qualité égale est **la photo réduite à 1024 px avant l'envoi (−23 % par photo,
0,065 → 0,050 $ par retouche)**. Il n'est pas branché, décision de Nico :
- par le redimensionnement de Supabase (`storage/v1/render/image`) : interdit dans un nouveau code sans décision de
  Nico (règle du 02/11) et facturé 5 $ / 1 000 images d'origine au-delà du quota — plus que les 3,9 $ / 1 000 photos
  économisés si ces photos ne sont pas déjà comptées dans le cycle ;
- par notre module libvips (empreintes) : sa cible est figée à 400 px dans le WebAssembly — il faut le recompiler avec
  une cible de 1 024 px, puis prouver son temps de calcul dans generate-listing (budget CPU de 2 s, incident du 28/10).

### Ce qui a été installé (garde-fous de Nico)
- `_shared/retouche-photo.ts` (source unique, prompts déplacés à l'octet près) : chaîne `gpt-image-2` →
  **`gpt-image-2.5-flare`** (même prix mesuré, plus rapide). Le repli ne part que sur une erreur de modèle ou de
  disponibilité (404, 403, 429, 5xx, 400 qui parle du modèle, coupure réseau) ; jamais sur une modération ni après une
  réponse facturée : jamais deux appels payés. Tous en échec : la photo d'origine, comme avant (aucune erreur au client).
- Dates d'arrêt OpenAI dans le code : le **10/02/2027**, gpt-image-2 sort seul de la chaîne et 2.5-flare devient le
  principal sans redéploiement. **Le successeur définitif reste à décider avant cette date** (2.5-flare lisse le tissu).
- Coût ≤ aujourd'hui : principal inchangé (même modèle, mêmes réglages, mêmes jetons) ; repli au même tarif par jeton et
  aux mêmes jetons mesurés ; une requête refusée n'est pas facturée.
- 2.4 : chaque ligne `photo_retouche` porte `openai_model` (le modèle servi), `openai_modeles` (détail) et
  `repli_modele` (photos passées au repli) ; coût calculé au tarif du modèle de chaque image.
- generate-listing **v146** ; verrou **`selftest:retouche-modele`** (9 cas : prompts à l'octet, chaîne, dates d'arrêt,
  repli simulé, jamais payé deux fois, câblage) : ROUGE sur le code d'avant (module absent), VERT après.
  `selftest:redaction-jamais-coupee` suit l'appel OpenAI à sa nouvelle place (même invariant : un appel par photo, 5 au plus).

### 2.5 Étude (rien construit) — gpt-image-2, qualité medium, un essai chacun, t-shirt rouge à plat (compte de Nico)
| Essai | $ / photo | Temps | Qualité |
|---|---|---|---|
| Vêtement porté sur mannequin (mannequin neutre sans visage, fond gris) | 0,0650 | 27 s | Convaincant : couleur, logo, col montant, étiquettes de manche et d'ourlet conservés ; coupe plausible |
| Changement de fond (fond blanc studio, clause vêtement d'aujourd'hui) | 0,0656 | 28 s | Article intact, mais le tapis en jute sous le t-shirt est resté (pris pour une partie de l'objet) : prompt à revoir |

Soit ≈ 3,8 fois une photo de retouche légère. En qualité low, le coût estimé par les jetons serait ≈ 0,018 $ la photo
(non essayé). Développer ces retouches « jamais pour plus cher » demandera donc soit la qualité low (à valider), soit
un prix ou un quota à part — décision de Nico.

### Dépense du banc
⚠️ Effet de bord trouvé et corrigé : le banc journalisait son coût sous `cost_usd` avec la feature
« photo_retouche_banc » ; `ia_fournisseur_de()` range toute feature inconnue chez « anthropic » → le compteur
ANTHROPIC du 14/11 a pris les 3,25 $ OpenAI du banc (10,49 → 13,75 $, sous le seuil « essentiel » de 14 $ de
l'ancien code : aucune coupure ; le filet de 50 $ était en place depuis 22:32). Correctif : la fonction du banc écrit
désormais `cout_openai_usd` (jamais compté chez Anthropic) ; compteur réparé par
`scripts/reparations/20261114_compteur_ia_banc_retouche.sql` (joué à 23:10:51 ; sauvegardes `_backup_1411_compteur_ia`,
`_backup_1411_banc_retouche_meta` ; inverse `…_INVERSE.sql`) : 14/11 anthropic **10,49 $** (1 549 appels), openai
**8,14 $** (203 appels, banc compris).
134 appels, **3,25 $** (lignes `usage_logs` « photo_retouche_banc », coût sous `cout_openai_usd`, comptées dans
`ia_depense_jour` OpenAI du 14/11 après réparation).
⚠️ Écart à la consigne : ma première passe nommait les images par rang dans le lot de 5 (le 2e lot écrasait le 1er) ;
la qualité a dû être refaite, si bien que quatre réglages ont reçu 20 à 22 photos au lieu de 10 au plus (gpt-image-2
low 22, 2.5-flare 20, 2.5-sunburst 20, 2.6-flare complexity low 20). Le total reste sous les 5 $. Images du banc
effacées du Storage (dossier de Nico) après mesure.
