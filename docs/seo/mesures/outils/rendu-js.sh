#!/usr/bin/env bash
# Compare le texte servi SANS JavaScript au texte rendu AVEC JavaScript (Chrome headless, --dump-dom).
# Usage : bash docs/seo/mesures/outils/rendu-js.sh <dossier de sortie> [origine] [langue]
#   langue : fr-FR (défaut) ou en-US (ce que voit un rendu « à l'américaine », cf. Googlebot)
# Profil Chrome JETABLE (--user-data-dir dans le dossier de sortie) : le profil de Nico n'est jamais touché.
set -u
ICI="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:?dossier de sortie}"; ORIGINE="${2:-https://fillsell.app}"; LANGUE="${3:-fr-FR}"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
mkdir -p "$OUT/rendu-$LANGUE"
# Profil neuf À CHAQUE URL : la landing mémorise la langue dans localStorage (fs_lang) ;
# un profil réutilisé ferait hériter la langue de la page précédente.
i=0
while read -r u; do
  [ -z "$u" ] && continue
  i=$((i+1))
  rm -rf "$OUT/profil-jetable-$LANGUE"
  "$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$OUT/profil-jetable-$LANGUE" \
    --lang="$LANGUE" --accept-lang="$LANGUE" --virtual-time-budget=15000 --dump-dom "$ORIGINE$u" \
    > "$OUT/rendu-$LANGUE/$i.html" 2>/dev/null
  printf "%s\t%s\n" "$u" "$i.html"
done < "$ICI/urls.txt" > "$OUT/rendu-$LANGUE/index.tsv"
node "$ICI/analyse-rendu.mjs" "$OUT/rendu-$LANGUE/index.tsv"
