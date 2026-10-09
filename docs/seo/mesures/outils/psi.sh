#!/usr/bin/env bash
# PageSpeed Insights API (serveurs Google, Lighthouse + données de terrain CrUX si présentes).
# Usage : PSI_KEY=<clé facultative> bash docs/seo/mesures/outils/psi.sh <dossier de sortie léger> [origine]
# Sans clé, l'API partage un quota quotidien commun : le 09/10/2026 elle répondait 429
# (« Queries per day » épuisé) — la mesure « avant » a donc été faite par lighthouse-lot.sh.
# Une clé se crée dans Google Cloud (API « PageSpeed Insights ») ; ne jamais l'écrire dans le dépôt.
set -u
OUT="${1:?dossier de sortie}"; ORIGINE="${2:-https://fillsell.app}"
mkdir -p "$OUT"
TMPF="$(mktemp)"
for slug in home:/ blog:/blog cross-listing:/blog/cross-listing-vinted-leboncoin extension:/extension; do
  name=${slug%%:*}; path=${slug#*:}
  for strat in mobile desktop; do
    url=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$ORIGINE$path")
    q="url=$url&strategy=$strat&category=performance&category=seo&category=accessibility&category=best-practices"
    [ -n "${PSI_KEY:-}" ] && q="$q&key=$PSI_KEY"
    code=$(curl -s -o "$TMPF" -w '%{http_code}' --max-time 180 "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?$q")
    echo "$name $strat HTTP $code"
    [ "$code" = 200 ] || continue
    node -e '
      const fs = require("fs"); const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const lh = r.lighthouseResult, A = lh.audits;
      const m = id => A[id] ? { valeur: A[id].numericValue, affiche: A[id].displayValue } : null;
      const terrain = e => e && e.metrics ? Object.fromEntries(Object.entries(e.metrics).map(([k, v]) => [k, { p75: v.percentile, categorie: v.category }])) : null;
      fs.writeFileSync(process.argv[2], JSON.stringify({
        methode: "PageSpeed Insights API v5 (Lighthouse " + lh.lighthouseVersion + ", serveurs Google)",
        url: lh.finalDisplayedUrl, strategie: process.argv[3], date_utc: lh.fetchTime,
        scores: Object.fromEntries(Object.entries(lh.categories).map(([k, c]) => [k, Math.round(c.score * 100)])),
        metriques: { fcp: m("first-contentful-paint"), lcp: m("largest-contentful-paint"), tbt: m("total-blocking-time"),
          cls: m("cumulative-layout-shift"), speed_index: m("speed-index"), tti: m("interactive") },
        crux_page: terrain(r.loadingExperience), crux_origine: terrain(r.originLoadingExperience),
      }, null, 2));
    ' "$TMPF" "$OUT/psi-$name-$strat.json" "$strat"
  done
done
rm -f "$TMPF"
