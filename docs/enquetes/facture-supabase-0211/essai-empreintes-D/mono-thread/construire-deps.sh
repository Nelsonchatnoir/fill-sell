#!/bin/bash
# Dépendances de libvips (mêmes versions et options que wasm-vips 0.0.19, sans -pthread), 2 processus au plus.
# Sources dans $DEPS, correctifs wasm-vips déjà appliqués (glib, mozjpeg + JCP_FASTEST, zlib-ng, ffi, hwy : voir build.sh de wasm-vips 0.0.19).
source /c/Users/nicol/wvst/env.sh
set -o pipefail
T=$(cygpath -m $TARGET)
AC="CC=emcc CXX=em++ AR=emar RANLIB=emranlib NM=llvm-nm"
etape() { echo "=== $1 $(date +%H:%M:%S)"; }
etape zlib-ng; cd $DEPS/zlib-ng && emcmake cmake -G Ninja -B_build -S. -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=$T -DBUILD_SHARED_LIBS=OFF   -DBUILD_TESTING=OFF -DWITH_RUNTIME_CPU_DETECTION=OFF -DZLIB_COMPAT=ON -DCMAKE_C_FLAGS="$CFLAGS -O3" > ../zlib-ng.log 2>&1 && ninja -j2 -C _build install >> ../zlib-ng.log 2>&1 || { echo ÉCHEC zlib-ng; exit 1; }
etape ffi; cd $DEPS/ffi && emconfigure sh ./configure --host=$CHOST --prefix=$T --enable-static --disable-shared --disable-dependency-tracking   --disable-builddir --disable-multi-os-directory --disable-raw-api --disable-structs --disable-docs $AC > ../ffi.log 2>&1 && make -j2 install >> ../ffi.log 2>&1 || { echo ÉCHEC ffi; exit 1; }
etape glib; cd $DEPS/glib && rm -rf _build && MSYS_NO_PATHCONV=1 meson setup _build --prefix=/Users/nicol/wvst/cible --cross-file=$(cygpath -m $W/cross.ini) --default-library=static --buildtype=release   --force-fallback-for=gvdb -Dintrospection=disabled -Dselinux=disabled -Dxattr=false -Dlibmount=disabled -Dsysprof=disabled -Dnls=disabled   -Dglib_debug=disabled -Dtests=false -Dglib_assert=false -Dglib_checks=false > ../glib.log 2>&1 && ninja -j2 -C _build >> ../glib.log 2>&1   && MSYS_NO_PATHCONV=1 meson install -C _build --no-rebuild --tags devel,bin-devel >> ../glib.log 2>&1 || { echo ÉCHEC glib; exit 1; }
etape expat; cd $DEPS/expat && emconfigure sh ./configure --host=$CHOST --prefix=$T --enable-static --disable-shared --disable-dependency-tracking \
  --without-xmlwf --without-docbook --without-examples --without-tests --without-arc4random --without-arc4random-buf \
  --without-getrandom --without-sys-getrandom $AC > ../expat.log 2>&1 && make -j2 install dist_cmake_DATA= nodist_cmake_DATA= >> ../expat.log 2>&1 || { echo ÉCHEC expat; tail -5 ../expat.log; exit 1; }
etape exif; cd $DEPS/exif && emconfigure sh ./configure --host=$CHOST --prefix=$T --enable-static --disable-shared --disable-dependency-tracking \
  --disable-docs --disable-nls --without-libiconv-prefix --without-libintl-prefix CPPFLAGS="-DNO_VERBOSE_TAG_DATA" $AC > ../exif.log 2>&1 && make -j2 install doc_DATA= >> ../exif.log 2>&1 || { echo ÉCHEC exif; tail -5 ../exif.log; exit 1; }
etape lcms2; cd $DEPS/lcms2 && rm -rf _build && MSYS_NO_PATHCONV=1 meson setup _build --prefix=/Users/nicol/wvst/cible --cross-file=$(cygpath -m $W/cross.ini) --default-library=static --buildtype=release \
  -Dtests=disabled -Djpeg=disabled -Dtiff=disabled -Dc_args="$CFLAGS -O3" > ../lcms2.log 2>&1 && ninja -j2 -C _build >> ../lcms2.log 2>&1 && MSYS_NO_PATHCONV=1 meson install -C _build --no-rebuild --tags devel >> ../lcms2.log 2>&1 || { echo ÉCHEC lcms2; tail -5 ../lcms2.log; exit 1; }
etape hwy; cd $DEPS/hwy && rm -rf _build && MSYS_NO_PATHCONV=1 meson setup _build --prefix=/Users/nicol/wvst/cible --cross-file=$(cygpath -m $W/cross.ini) --buildtype=release \
  -Dcontrib=disabled -Dexamples=disabled -Dtests=disabled -Dtest_standalone=true -Dc_args="$CFLAGS -O3" -Dcpp_args="$CXXFLAGS -O3" > ../hwy.log 2>&1 && ninja -j2 -C _build >> ../hwy.log 2>&1 && MSYS_NO_PATHCONV=1 meson install -C _build --no-rebuild --tags devel >> ../hwy.log 2>&1 || { echo ÉCHEC hwy; tail -5 ../hwy.log; exit 1; }
etape jpeg; cd $DEPS/jpeg && rm -rf _build && emcmake cmake -G Ninja -B_build -S. -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=$T -DBUILD_SHARED_LIBS=OFF \
  -DWITH_JPEG8=ON -DWITH_SIMD=OFF -DWITH_TURBOJPEG=OFF -DPNG_SUPPORTED=OFF -DCMAKE_C_FLAGS="$CFLAGS -O3 -DNO_GETENV -DNO_PUTENV" > ../jpeg.log 2>&1 && ninja -j2 -C _build install >> ../jpeg.log 2>&1 || { echo ÉCHEC jpeg; tail -5 ../jpeg.log; exit 1; }
etape png; cd $DEPS/png && emconfigure sh ./configure --host=$CHOST --prefix=$T --enable-static --disable-shared --disable-dependency-tracking \
  --disable-tests --disable-tools --without-binconfigs --disable-unversioned-libpng-config --enable-intel-sse CPPFLAGS="-O3 -msse4.1 -msimd128 -I$T/include" $AC > ../png.log 2>&1 && make -j2 install dist_man_MANS= >> ../png.log 2>&1 || { echo ÉCHEC png; tail -5 ../png.log; exit 1; }
etape fin; ls $TARGET/lib; ls $TARGET/lib/pkgconfig
