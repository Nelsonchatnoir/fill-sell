#!/usr/bin/env bash
# Matrice « URL × robot » sans JavaScript (chantier SEO/GEO, mesure « avant » du 09/10/2026).
# Usage : bash docs/seo/mesures/outils/matrice-robots.sh <dossier de sortie> [origine]
#   ex. : bash docs/seo/mesures/outils/matrice-robots.sh "$TMP/matrice-apres" https://fillsell.app
# Puis :  node docs/seo/mesures/outils/analyse-matrice.mjs "$TMP/matrice-apres"
# Lit uas.tsv (clé<TAB>user-agent) et urls.txt (un chemin par ligne) à côté de ce script.
# Lecture seule : uniquement des GET, séquentiels.
set -u
ICI="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:?dossier de sortie}"; ORIGINE="${2:-https://fillsell.app}"
mkdir -p "$OUT/m"; : > "$OUT/m/index.tsv"
while IFS=$'\t' read -r key ua; do
  [ -z "$key" ] && continue
  i=0
  while read -r u; do
    [ -z "$u" ] && continue
    i=$((i+1)); f="m/${key}__$i"
    w=$(curl -sL --compressed -A "$ua" \
      -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' \
      -H 'Accept-Language: fr-FR,fr;q=0.9' \
      -D "$OUT/$f.h" -o "$OUT/$f.b" \
      -w '%{http_code}\t%{size_download}\t%{num_redirects}\t%{url_effective}\t%{time_total}' \
      "$ORIGINE$u")
    printf "%s\t%s\t%s\t%s\n" "$key" "$u" "$f" "$w" >> "$OUT/m/index.tsv"
  done < "$ICI/urls.txt"
done < "$ICI/uas.tsv"
echo "$(wc -l < "$OUT/m/index.tsv") réponses relevées dans $OUT/m/index.tsv"
