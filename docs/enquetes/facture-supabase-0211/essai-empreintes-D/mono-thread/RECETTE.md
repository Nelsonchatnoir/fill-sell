# Le module vips-mono — recette de construction (03/11)

Module servi en prod : `supabase/functions/_shared/vips-mono/vips-mono.mjs` (WebAssembly embarqué, SHA-256
`93fde86d…e46711`, figé par `selftest:empreintes-maison`), chargé par `_shared/empreinte-maison.ts` dans
`empreintes-urls`. Les outils de construction (Emscripten, sources compilées, venv) ne sont PAS dans le dépôt :
ils se refont avec cette recette. Aucun jeton, aucune photo, aucune URL client ici.

## Ce que contient ce dossier
| fichier | rôle |
|---|---|
| `essai_d.c` | les appels libvips de la réduction de Supabase (fit 400, JPEG Q80 progressif / PNG filter all) et le périmètre (code 1 = hors périmètre) |
| `patch-mono.py` | 4 remplacements dans libvips, actifs seulement sans pthreads (tâche de thread exécutée sur place, écriture de `vips_sink_disc` immédiate, attente impossible = erreur) |
| `construire-deps.sh` | les dépendances (zlib-ng, ffi, glib, expat, exif, lcms2, highway, mozjpeg, libpng), mêmes versions et options que wasm-vips 0.0.19, sans `-pthread` |
| `construire.sh` | libvips 8.18.7 + le module ; 3ᵉ argument = la variante « fonction » (`-sSINGLE_FILE`), celle de la prod |
| `env.exemple.sh`, `cross.exemple.ini` | environnement et fichier croisé meson (chemins du PC de construction) |
| `correctifs-wasm-vips-0.0.19/` | les correctifs de wasm-vips 0.0.19 (dépôt kleisauke/wasm-vips, arbre `49ac4378`) tels qu'appliqués : `glib.patch`, `jpeg.patch` (mozjpeg), `vips.patch`, `emscripten-6.0.10.patch`, son `build.sh` d'origine (`wasm-vips-build.sh` : versions, URL des sources, options), et `meson-emscripten-sans-pthread.patch` |
| `verifier-mono.ts`, `verif-fichier-unique.ts`, `verif-gros.ts`, `fixtures-oracle.ts` | vérifications de l'essai (200 photos, variante fichier unique, plus grosses photos) et fabrication des images synthétiques du selftest avec l'oracle wasm-vips 0.0.19 à threads |
| `appeler-fonction.mjs` | appel de la fonction de TEST `essai-empreintes-d-test` (supprimée le 03/11 : historique seulement) |

## Refaire le module
1. Outils : Emscripten 6.0.10 (emsdk), Python + venv avec meson, ninja, cmake, pkg-config, GNU make ;
   appliquer `meson-emscripten-sans-pthread.patch` au meson du venv.
2. Sources aux versions de `wasm-vips-build.sh` (zlib-ng 2.3.3, libffi 3.8.0, glib 2.90.0, expat 2.8.5,
   libexif 0.6.26, lcms2 2.19.1, highway 1.4.0, mozjpeg 0826579, libpng 1.6.58, libvips 8.18.7), chacune avec le
   correctif de wasm-vips correspondant (`glib.patch`, `jpeg.patch`, `vips.patch` ; zlib-ng, ffi, highway : voir
   `wasm-vips-build.sh`), dans `$DEPS/<nom>` ; copier `env.exemple.sh` → `env.sh`, `cross.exemple.ini` → `cross.ini`
   et corriger les chemins.
3. `bash construire-deps.sh`, puis `bash construire.sh env.sh <sortie> <sortie-fonction>` : refuse toute trace de
   threads (`-pthread` dans build.ninja, `new Worker` / `SharedArrayBuffer` dans le JS).
4. Avant de remplacer le module de la prod : mêmes octets que l'oracle (`npm run selftest:essai-d-mono`,
   `selftest:empreintes-maison` — nouveau SHA-256 à figer), puis un essai réel borné comparé à la transformation
   Supabase (au plus 20 photos neuves : 20/20 identiques exigé), interrupteur `coin_config.empreintes_moteur_maison`
   à 0 pendant le changement.
