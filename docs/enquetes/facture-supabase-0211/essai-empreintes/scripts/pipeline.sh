#!/usr/bin/env bash
# Rejeu complet, une fois la nouvelle méthode calculée (donnees/B/duree.txt porte « fin ») :
#   fichiers supprimés → préparation par compte → moteur (7 processus) → autres décisions (6 processus)
#   → niveau des doublons → synthèse. Tout en lecture seule côté prod.
set -u
W="$(cd "$(dirname "$0")/.." && pwd)"
cd "$W"
until grep -q '^fin' donnees/B/duree.txt 2>/dev/null; do sleep 10; done
date '+rejeu début %Y-%m-%d %H:%M:%S' > donnees/pipeline.log
# les échecs PASSAGERS (429, 5xx, réseau) épuisés : repris une fois (le script saute les URL déjà faites)
if grep -q passager_epuise donnees/B/shard*.ndjson; then
  echo "reprise des échecs passagers : $(cat donnees/B/shard*.ndjson | grep -c passager_epuise)" >> donnees/pipeline.log
  for f in donnees/B/shard*.txt; do n=$(basename "$f" .txt)
    /c/Users/nicol/.deno/bin/deno run --allow-net --allow-read --allow-write scripts/calculer-nouvelle.ts "$f" "donnees/B/$n.ndjson" 1 400000000 >> "donnees/B/$n.log" 2>&1 & done
  wait
fi
node scripts/verifier-absents.mjs >> donnees/pipeline.log 2>&1
rm -rf donnees/emp donnees/resultats/moteur donnees/resultats/autres
node --max-old-space-size=10000 scripts/preparer-comptes.mjs >> donnees/pipeline.log 2>&1
for k in 0 1 2 3 4 5 6; do node --max-old-space-size=3000 scripts/rejouer-moteur.mjs $k 7 > donnees/moteur-$k.log 2>&1 & done
wait
for k in 0 1 2 3 4 5; do node --max-old-space-size=3000 scripts/rejouer-autres.mjs $k 6 > donnees/autres-$k.log 2>&1 & done
wait
node scripts/rejouer-doublons-niveau.mjs >> donnees/pipeline.log 2>&1
node scripts/synthese.mjs > donnees/synthese-resume.json 2>> donnees/pipeline.log
date '+rejeu fin %Y-%m-%d %H:%M:%S' >> donnees/pipeline.log
grep -h FIN donnees/moteur-*.log donnees/autres-*.log | wc -l
