#!/usr/bin/env bash
# Lighthouse local, 4 pages x (mobile, desktop) x 3 passages, SÉQUENTIELS (jamais en parallèle :
# deux Chrome en même temps faussent le TBT). Mesure « avant » du 09/10/2026 faite ainsi,
# parce que l'API PageSpeed Insights sans clé répondait 429 (quota quotidien partagé épuisé).
# Usage : bash docs/seo/mesures/outils/lighthouse-lot.sh <dossier des rapports bruts> [origine]
# Puis :  node docs/seo/mesures/outils/lighthouse-synthese.mjs <dossier des rapports bruts> docs/seo/mesures/apres
# Les rapports bruts (~1 Mo chacun) restent HORS du dépôt (scratchpad / %TEMP%).
set -u
OUT="${1:?dossier des rapports bruts}"; ORIGINE="${2:-https://fillsell.app}"
mkdir -p "$OUT"
for slug in home:/ blog:/blog cross-listing:/blog/cross-listing-vinted-leboncoin extension:/extension; do
  name=${slug%%:*}; path=${slug#*:}
  for ff in mobile desktop; do
    for run in 1 2 3; do
      if [ "$ff" = desktop ]; then preset="--preset=desktop"; else preset="--form-factor=mobile"; fi
      npx --yes lighthouse@13.5.0 "$ORIGINE$path" \
        --only-categories=performance,seo,accessibility,best-practices $preset \
        --output=json --output-path="$OUT/$name-$ff-$run.json" \
        --chrome-flags="--headless=new" --quiet
      echo "$(date -u +%H:%M:%S) $name $ff $run exit=$?"
    done
  done
done
