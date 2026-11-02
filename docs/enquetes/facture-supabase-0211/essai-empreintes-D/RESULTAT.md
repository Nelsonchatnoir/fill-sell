# Essai à blanc D — la transformation Supabase refaite à l'octet avec libvips (02/11 soir)

Lundi 02/11/2026, 21:30 → 22:15 (heure de Paris). Rien d'écrit ni de déployé en prod, lecture seule de la base. Conclusions
chiffrées seulement : aucune donnée client ici ; les photos de travail sont restées dans le dossier temporaire de la
session (hors dépôt). Un seul processus sur le PC, arrêt prévu sous 1,5 Go libres (jamais atteint : 4,4 Go libres en fin).

## Verdict

| question | réponse |
|---|---|
| Identique ? | **OUI.** 200 photos de test : **200/200 empreintes identiques au bit près** (dHash, pHash, couleur, 10 variantes) ; **199/199 JPEG identiques à l'octet** au fichier servi par Supabase ; le PNG : pixels et données compressées identiques, seuls l'ordre de deux blocs d'en-tête et la résolution notée dans l'EXIF diffèrent. |
| Limites des fonctions Supabase tenues ? | **NON, pas avec wasm-vips tel qu'il est publié.** Temps : oui (176 ms au pire, pour 2 s de CPU). Mémoire et threads : non — wasm-vips réserve 256 Mo de mémoire WebAssembly dès le démarrage (= toute la limite d'une fonction) et lance au moins 6 threads (Web Workers), que les fonctions Supabase n'ont pas. |
| Coût | aujourd'hui ≈ 235 à 390 $ / cycle (≈ 2 350 à 3 900 $ à 10 fois plus d'utilisateurs) ; méthode D dans nos fonctions ≈ 0 à 5 $ (≈ 16 à 38 $ à 10 fois plus). |

## 1. Le moteur de Supabase et sa reproduction
- Supabase = imgproxy + libvips. En-tête de réponse : `x-transformations: height:400,width:400,resizing_type:fit,quality:80` ;
  JPEG progressif (10 balayages), 4:2:0, tables de quantification standard à q80, EXIF minimal écrit par libvips ; PNG
  pour une originale PNG (l'`Accept` de la prod ne demande pas de WebP).
- Reproduction : **wasm-vips 0.0.19 = libvips 8.18.7 + mozjpeg (0826579) + Highway 1.4.0**, dans Deno, version
  « navigateur » (`vips-es6.js` ; la version « Node » plante sur Windows). Pipeline d'imgproxy refait pas à pas :
  1. échelle `fit` = 1 / max(L/400, H/400), jamais d'agrandissement ;
  2. JPEG : réduction au décodage ×2, ×4 ou ×8 (selon la réduction totale, comme imgproxy), échelles recalculées sur
     la taille chargée ;
  3. réduction restante `resize` lanczos3 (échelles horizontale et verticale séparées) ;
  4. profil ICC intégré → converti en sRGB APRÈS la réduction (trouvé en mise au point : 1 photo sur 60 en avait
     besoin, les profils sRGB ne bougent pas) ;
  5. métadonnées de l'originale retirées ; JPEG Q80 progressif / PNG `filter: all`.
- Méthode figée AVANT le test (empreinte sha256 du script `84a3e3f5…`), mise au point sur 86 autres photos (60 tirées
  au hasard + 4 PNG + 22 JPEG progressifs) : 82/82 JPEG identiques à l'octet, 86/86 empreintes identiques.

## 2. Le test (200 photos tirées au hasard, sha256 de l'URL)
- Population : les 1 356 photos du bucket dont l'empreinte a été calculée le 02/11 après 14:55 sur la version réduite
  par Supabase. **Toutes transformées pendant le cycle en cours** (journaux de la passerelle : 286/286 retrouvées en
  HTTP 200) : relire leur version Supabase n'a rien coûté (facturation à l'image d'origine distincte par cycle).
- Contenu du test : 119 réduites ×4 au décodage sans autre réduction, 71 avec réduction lanczos, 32 avec profil ICC,
  1 PNG.
- Contrôle de la référence : l'empreinte de la version servie aujourd'hui = l'empreinte stockée en base, 200/200.
- **Résultat : 200/200 empreintes identiques au bit près ; 199/199 JPEG identiques à l'octet ; PNG : 0 pixel différent,
  données compressées (IDAT, 352 358 octets) identiques.** Reproduction : 16 ms médiane, 51 ms max par photo (local).

## 3. Non couvert par la preuve (aucune photo de ce type parmi les 1 356 transformées ce cycle)
Orientation EXIF ≠ 1 (≈ 0,08 % du bucket, essai C), WebP, gris, CMJN, transparence, réduction ×8 au décodage, profils
non sRGB. Proposition si la méthode est un jour basculée : ces cas gardent la transformation Supabase (coût ≈ 0) tant
qu'ils ne sont pas prouvés. Le script refuse déjà ces cas (« hors périmètre »).

## 4. Les limites des fonctions (doc Supabase : 256 Mo de mémoire, 2 s de CPU par requête, pas de Web Workers)
Mesuré en local sur les PLUS GROSSES photos du bucket (202 132 fichiers, aucun au-dessus de 8 Mo, max 4,3 Mo) : les
20 plus gros PNG (3,5 à 4,3 Mo), les 20 plus gros JPEG (1,9 à 2,5 Mo, jusqu'à 6,6 Mpx), les 5 plus gros WebP (3,4 Mpx).
| | mesuré | limite | tient ? |
|---|---|---|---|
| Temps par photo (réduction + empreinte de la prod) | JPEG 57 ms méd. / 99 max ; PNG 58 / 81 ; WebP 162 / 176 | 2 s CPU / requête | oui (6 photos par appel ≈ 0,4 à 1,1 s) |
| Démarrage de wasm-vips (à chaque démarrage à froid) | 445 ms | même budget de 2 s | oui, mais il mange un quart du budget du premier appel |
| Mémoire WebAssembly réservée au démarrage | **256 Mo** (4 096 pages, jusqu'à 2 Go) | 256 Mo en tout | **non**, avant même la première photo |
| Mémoire du processus (local) | 373 Mo après démarrage, 720 à 794 Mo en pointe | 256 Mo | **non** |
| Besoin réel du calcul (pixels suivis par libvips, cache coupé) | 50 Mo au plus | — | tiendrait dans une version allégée |
| Threads | ≥ 6 Web Workers au démarrage | « Web Worker API non disponible » ; « libvips, sharp non supportés » | **non** |

Conclusion : le calcul lui-même tient (temps, 50 Mo), mais **wasm-vips 0.0.19 ne peut pas démarrer dans une fonction
Supabase**. Il faudrait une version mono-thread à mémoire initiale réduite (≈ 32 à 64 Mo), limitée aux briques utilisées
(décodeur JPEG/PNG, réduction lanczos de libvips, conversion ICC, mozjpeg) — libvips moderne suppose des threads : c'est
un travail de compilation et d'adaptation, à reprouver sur les mêmes références (gardées hors dépôt), puis à mesurer
dans une fonction de test (déploiement = accord de Nico).

## 5. Coût Supabase (tarif Pro : transformations 5 $/1 000 au-delà de 100 ; egress 0,09 $/Go au-delà de 250 Go ; invocations 2 $/million au-delà de 2 M ; le CPU des fonctions n'est pas facturé)
Rythme actuel : ≈ 1 560 à 2 600 photos neuves par jour (≈ 47 000 à 78 000 par cycle) ; empreintes-urls 5 813 appels en
24 h (01/11 22:00 → 02/11 22:00). Poids mesuré sur les 200 : originale 303 Ko, version Supabase 22 Ko (+281 Ko par photo).
| | aujourd'hui (transformations Supabase) | méthode D dans nos fonctions |
|---|---|---|
| **Rythme actuel** | **≈ 235 à 390 $ / cycle** | transformations ≈ 0 $ (cas non couverts < 1 $) ; egress +13 à 22 Go (0 $ sous 250 Go, sinon 1,2 à 2 $) ; invocations ≈ 174 000 à 350 000 par cycle, projet ≈ 2 M → 0 à 2 $ ; **total ≈ 0 à 5 $** |
| **10 fois plus d'utilisateurs** (≈ 470 000 à 780 000 photos / cycle) | **≈ 2 350 à 3 900 $ / cycle** | transformations ≈ 0 à 10 $ ; egress +130 à 220 Go → 12 à 20 $ ; invocations 1,7 à 3,5 M → 4 à 8 $ ; **total ≈ 16 à 38 $** |
(Egress des téléchargements par les fonctions compté comme egress : hypothèse prudente.)

## 6. Refaire l'essai
Scripts dans `scripts/` (lancés depuis un dossier de travail HORS dépôt qui contient `donnees/` et une copie de
`wasm-vips@0.0.19/lib/{vips-es6.js,vips.wasm}` dans `lib-wasm-vips-0.0.19/`) :
`export.sql` (empreintes du jour, lecture seule) → `tirer.mjs` (test / mise au point) → `telecharger.mjs <jeu>`
(originale + version Supabase, mêmes paramètres et même `Accept` que la prod) → `reproduire.ts <jeu>` (Deno) →
`resume.mjs <jeu>` ; `entetes.mjs` (cas rares), `gros.sql` / `gros2.sql` + `mesurer.ts` (temps, mémoire), `diag*.ts`
(mise au point ICC et PNG), `jpeginfo.mjs` (structure d'un JPEG). ⚠️ Après le 01/12, relire une version Supabase coûte
à nouveau (nouveau cycle) : réutiliser les références déjà téléchargées.
