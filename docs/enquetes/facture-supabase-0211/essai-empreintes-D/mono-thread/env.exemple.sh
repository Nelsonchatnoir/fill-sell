# Environnement de construction wasm-vips mono-thread (essai D) — à sourcer (chemins du PC de construction, outils hors dépôt).
export W=/c/Users/nicol/wvst
export PATH="$W/outils/emsdk/upstream/emscripten:$W/outils/emsdk/upstream/bin:$W/outils/venv/Scripts:$W/outils/bin:$PATH"
export EMSDK_PYTHON=C:/Users/nicol/wvst/outils/venv/Scripts/python.exe
export EM_CONFIG=C:/Users/nicol/wvst/outils/emsdk/.emscripten
export TARGET=$W/cible
export DEPS=$W/src
export PKG_CONFIG_LIBDIR=C:/Users/nicol/wvst/cible/lib/pkgconfig
export PKG_CONFIG_PATH=C:/Users/nicol/wvst/cible/lib/pkgconfig
# Mêmes options que wasm-vips 0.0.19, SANS -pthread :
export COMMON_FLAGS="-Os -fwasm-exceptions"
export CFLAGS="$COMMON_FLAGS -fvisibility=hidden -msimd128 -DWASM_SIMD_COMPAT_SLOW"
export CXXFLAGS="$CFLAGS"
export LDFLAGS="$COMMON_FLAGS -L$TARGET/lib -sAUTO_JS_LIBRARIES=0 -sAUTO_NATIVE_LIBRARIES=0"
export CHOST="wasm32-unknown-linux"
