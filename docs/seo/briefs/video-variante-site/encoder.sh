#!/usr/bin/env bash
# Encodages web de la variante « site » (09/10/2026) à partir d'un master 1080×1920 sans son.
#   bash encoder.sh <master.mp4> <dossierSortie> <poster-720.png> <poster-360.png> <dossierTravail>
# (affiches rendues par Remotion à la bonne taille : rendu.cjs … poster <png> 150 0.6667, puis 0.3333)
# ffmpeg fourni par Remotion (lu, jamais modifié). Aucune piste audio (-an).
# Sorties : fillsell-presentation.mp4 (H.264, faststart), .webm (VP9 2 passes), -av1.webm (AV1),
#           fillsell-presentation-poster.webp (720×1280) et -poster-360.webp (360×640).
set -euo pipefail
FF=C:/Users/nicol/fillsell-video/node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe
MASTER="$1"; OUT="$2"; P720="$3"; P360="$4"; TMP="$5"
mkdir -p "$OUT" "$TMP"
SCALE="scale=720:1280:flags=lanczos"

# H.264 (repli universel) — CRF choisi pour rester sous 6 Mo
"$FF" -hide_banner -loglevel error -y -i "$MASTER" -an -vf "$SCALE" -c:v libx264 -preset veryslow -tune animation \
  -crf "${CRF_H264:-21}" -profile:v high -level:v 3.1 -pix_fmt yuv420p -g 150 -movflags +faststart "$OUT/fillsell-presentation.mp4"

# VP9, deux passes
( cd "$TMP" && "$FF" -hide_banner -loglevel error -y -i "$MASTER" -an -vf "$SCALE" -c:v libvpx-vp9 -b:v 0 -crf 33 -pass 1 -passlogfile vp9 \
    -cpu-used 4 -deadline good -row-mt 1 -tile-columns 1 -auto-alt-ref 1 -lag-in-frames 25 -g 150 -pix_fmt yuv420p -f null NUL )
( cd "$TMP" && "$FF" -hide_banner -loglevel error -y -i "$MASTER" -an -vf "$SCALE" -c:v libvpx-vp9 -b:v 0 -crf 33 -pass 2 -passlogfile vp9 \
    -cpu-used 1 -deadline good -row-mt 1 -tile-columns 1 -auto-alt-ref 1 -lag-in-frames 25 -g 150 -pix_fmt yuv420p "$OUT/fillsell-presentation.webm" )

# AV1 (libaom)
"$FF" -hide_banner -loglevel error -y -i "$MASTER" -an -vf "$SCALE" -c:v libaom-av1 -b:v 0 -crf 34 -cpu-used 5 -row-mt 1 -tiles 1x2 \
  -g 150 -pix_fmt yuv420p "$OUT/fillsell-presentation-av1.webm"

# Affiches WebP (sharp du worktree, lecture seule)
node -e "
const sharp = require('C:/Users/nicol/fill-and-sell-seo/node_modules/sharp');
(async () => {
  await sharp(process.argv[1]).webp({quality: 82}).toFile(process.argv[3] + '/fillsell-presentation-poster.webp');
  await sharp(process.argv[2]).webp({quality: 82}).toFile(process.argv[3] + '/fillsell-presentation-poster-360.webp');
})();
" "$P720" "$P360" "$OUT"
ls -la "$OUT"
