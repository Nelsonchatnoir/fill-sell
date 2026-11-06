#!/bin/sh
# (06/11/2026) fs-charge.sh <de> <a> [lest_mo] [page] — lance les navigateurs de CHARGE n° <de> à <a> (docs/cloud/ESSAI-CHARGE-CLOUD2.md).
# MÊME image Chrome, MÊMES plafonds, MÊME puce et MÊME réseau filtré qu'un compte réel (src/navigateur.js,
# specConteneurChrome + specGpu), mais : proxy MORT (rien ne sort), aucun compte, aucune plateforme, profil jetable.
# Étiquette fillsell.charge=1 et JAMAIS fillsell.cloud : l'orchestrateur ne les voit pas, ne les compte pas, ne les arrête pas.
# Retrait : outils/charge/arreter-charge.sh.
# (06/11 soir, demande de Nico) [page] : charge.html (l'ancienne, animée en continu) ou charge-reelle.html (le cycle réel
# d'un compte : repos, onglets de travail, publications) ; le numéro du navigateur lui est passé (#n=…), sans synchronisation.
set -eu
[ $# -ge 2 ] || { echo "usage : $0 <de> <a> [lest_mo] [page]" >&2; exit 2; }
E=/srv/fillsell-cloud/.env
IMG=$(sed -n 's/^IMAGE_CHROME=//p' "$E" | tail -1)
MEM=$(sed -n 's/^MEMOIRE_NAVIGATEUR=//p' "$E" | tail -1); MEM=${MEM:-2g}
GRP=$(sed -n 's/^GPU_GROUPES=//p' "$E" | tail -1)
PER=$(sed -n 's/^GPU_PERIPHERIQUES=//p' "$E" | tail -1); PER=${PER:-card0,renderD128}
LEST=${3:-750}
PAGE=${4:-charge.html}
[ -n "$IMG" ] || { echo "REFUS : IMAGE_CHROME introuvable dans $E" >&2; exit 1; }
docker image inspect "$IMG" >/dev/null 2>&1 || { echo "REFUS : image $IMG absente" >&2; exit 1; }
DEV=""; for p in $(echo "$PER" | tr , ' '); do DEV="$DEV --device /dev/dri/$p"; done
GA=""; for g in $(echo "$GRP" | tr , ' '); do GA="$GA --group-add $g"; done
R=/srv/fillsell-cloud/charge
[ -f "$R/$PAGE" ] || { echo "REFUS : page $R/$PAGE absente" >&2; exit 1; }
for i in $(seq "$1" "$2"); do
  n=$(printf %02d "$i"); d=$R/p$n
  if docker inspect "fs-charge-$n" >/dev/null 2>&1; then echo "fs-charge-$n existe déjà"; continue; fi
  mkdir -p "$d" && cp "$R/$PAGE" "$d/" && chown -R 1000:1000 "$d"
  # shellcheck disable=SC2086
  docker run -d --name "fs-charge-$n" --label fillsell.charge=1 --network fillsell-cloud \
    --memory "$MEM" --cpus 1.5 --shm-size 512m --pids-limit 768 $DEV $GA \
    -v "$d:/profil" -v /srv/fillsell-cloud/extension-crx:/extension-crx:ro -v /tmp/.X11-unix:/tmp/.X11-unix:ro \
    -e PROXY_AMONT=http://verification:morte@127.0.0.1:9 -e PROFIL=/profil -e PLATEFORMES_PERMISES= \
    -e "JETON_CONTROLE=$(openssl rand -hex 16)" -e PORT_CONTROLE=3130 \
    -e DISPLAY=:0 -e ECRAN_EXTERNE=1 -e "CHROME_ARGS_GL=--use-gl=angle --use-angle=gl" "$IMG" >/dev/null
  ip=$(docker inspect -f '{{(index .NetworkSettings.Networks "fillsell-cloud").IPAddress}}' "fs-charge-$n")
  k=0; until curl -s -m 2 "http://$ip:9223/json/version" >/dev/null || [ $k -ge 40 ]; do k=$((k+1)); sleep 1; done
  if curl -s -m 5 -X PUT "http://$ip:9223/json/new?file:///profil/$PAGE%23lest=$LEST%26n=$i" >/dev/null; then
    echo "fs-charge-$n prêt ($ip, lest $LEST Mo, $PAGE)"
  else
    echo "fs-charge-$n : la page n'a pas pu s'ouvrir ($ip) — voir docker logs fs-charge-$n" >&2
  fi
done
