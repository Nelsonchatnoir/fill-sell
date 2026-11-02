#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# wasm-vips SUR UN SEUL THREAD (essai D, 02/11) — libvips 8.18.7 + correctifs
# wasm-vips 0.0.19 + patch-mono.py, puis le module essai_d.c.
# Prérequis (sur le PC de construction, hors dépôt) : Emscripten 6.0.10, meson
# (mixin emscripten sans -pthread : thread_flags / thread_link_flags rendent []),
# ninja, cmake, pkg-config, GNU make ; dépendances déjà compilées dans $TARGET
# avec les versions et options de wasm-vips 0.0.19 SANS -pthread : zlib-ng 2.3.3,
# libffi 3.8.0, glib 2.90.0 (+ correctif wasm-vips), expat 2.8.5, libexif 0.6.26,
# lcms2 2.19.1, highway 1.4.0, mozjpeg 0826579 (+ correctif, JCP_FASTEST), libpng 1.6.58.
# Usage : bash construire.sh <env.sh> <dossier de sortie>
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
source "$1"
SORTIE=$(cygpath -m "$2")
ICI=$(cd "$(dirname "$0")" && pwd)
cd "$DEPS/vips"

if ! grep -q "__EMSCRIPTEN_PTHREADS__" libvips/iofuncs/threadpool.c; then
  "$EMSDK_PYTHON" "$ICI/patch-mono.py" .
fi

if [ ! -f _build/build.ninja ]; then
  MSYS_NO_PATHCONV=1 meson setup _build --prefix=/Users/nicol/wvst/cible --cross-file="$(cygpath -m "$W/cross.ini")" \
    --default-library=static --buildtype=release \
    -Ddeprecated=false -Dexamples=false -Dcplusplus=false -Dmodules=disabled -Dintrospection=disabled \
    -Dauto_features=disabled -Djpeg=enabled -Dpng=enabled -Dlcms=enabled -Dexif=enabled -Dhighway=enabled -Dzlib=enabled \
    -Dc_args="$CFLAGS -O3" -Dcpp_args="$CXXFLAGS -O3"
fi
# Aucun -pthread, nulle part :
if grep -q -- "-pthread" _build/build.ninja; then echo "ÉCHEC : -pthread dans build.ninja"; exit 1; fi
ninja -j2 -C _build
MSYS_NO_PATHCONV=1 meson install -C _build --no-rebuild --tags runtime,devel

mkdir -p "$SORTIE"
# Le module : un seul thread, mémoire de départ 16 Mo, croissance jusqu'à 160 Mo (sous les 256 Mo d'une fonction).
emcc "$(cygpath -m "$ICI/essai_d.c")" -o "$SORTIE/vips-mono.mjs" $CFLAGS -O3 \
  $(pkg-config --cflags --libs --static vips) \
  $LDFLAGS \
  -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=VipsMono -sENVIRONMENT=web \
  -sINITIAL_MEMORY=16MB -sALLOW_MEMORY_GROWTH -sMAXIMUM_MEMORY=160MB -sSTACK_SIZE=1MB \
  -sTEXTDECODER=2 -sABORTING_MALLOC=0 \
  -sEXPORTED_FUNCTIONS=_malloc,_free,_essai_init,_essai_reduire,_essai_erreur,_essai_liberer,_essai_pointe_libvips \
  -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP32,HEAPU32,UTF8ToString \
  -sINCOMING_MODULE_JS_API=wasmBinary,print,printErr
ls -l "$SORTIE"
# Le module ne doit contenir AUCUNE trace de threads :
if grep -q -E "new Worker|SharedArrayBuffer|pthread" "$SORTIE/vips-mono.mjs"; then echo "ÉCHEC : traces de threads dans le JS"; exit 1; fi
echo "construit sans threads"

# Variante pour une fonction Supabase : le WebAssembly EMBARQUÉ dans le JS (aucun fichier statique à déployer).
if [ -n "${3:-}" ]; then
  emcc "$(cygpath -m "$ICI/essai_d.c")" -o "$(cygpath -m "$3")/vips-mono.mjs" $CFLAGS -O3 \
    $(pkg-config --cflags --libs --static vips) \
    $LDFLAGS \
    -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=VipsMono -sENVIRONMENT=web -sSINGLE_FILE \
    -sINITIAL_MEMORY=16MB -sALLOW_MEMORY_GROWTH -sMAXIMUM_MEMORY=160MB -sSTACK_SIZE=1MB \
    -sTEXTDECODER=2 -sABORTING_MALLOC=0 \
    -sEXPORTED_FUNCTIONS=_malloc,_free,_essai_init,_essai_reduire,_essai_erreur,_essai_liberer,_essai_pointe_libvips \
    -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP32,HEAPU32,UTF8ToString
  # (le binaire embarqué contient des messages de glib qui citent pthread_* : on ne cherche que le code JS des threads)
  if grep -a -q -E "new Worker|SharedArrayBuffer" "$3/vips-mono.mjs"; then echo "ÉCHEC : traces de threads (fonction)"; exit 1; fi
  ls -l "$3/vips-mono.mjs"
  echo "variante fonction construite"
fi
