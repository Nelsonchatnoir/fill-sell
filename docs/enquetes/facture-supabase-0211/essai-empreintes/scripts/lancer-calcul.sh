#!/usr/bin/env bash
# 14 processus Deno en parallèle (1 téléchargement chacun : ≤ 14 requêtes simultanées), plafond 1,39 Go chacun (≤ 19,5 Go en tout)
W="$(cd "$(dirname "$0")/.." && pwd)"
cd "$W"
date '+début %Y-%m-%d %H:%M:%S %Z' > donnees/B/duree.txt
for f in donnees/B/shard*.txt; do
  n=$(basename "$f" .txt)
  /c/Users/nicol/.deno/bin/deno run --allow-net --allow-read --allow-write scripts/calculer-nouvelle.ts "$f" "donnees/B/$n.ndjson" 1 1390000000 > "donnees/B/$n.log" 2>&1 &
done
wait
date '+fin %Y-%m-%d %H:%M:%S %Z' >> donnees/B/duree.txt
grep -h '"fin":true' donnees/B/*.log
