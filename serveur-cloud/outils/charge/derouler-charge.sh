#!/bin/sh
# (06/11/2026) DÉROULER l'essai de charge SEUL sur le serveur (docs/cloud/ESSAI-CHARGE-CLOUD2.md § 3-4) — personne n'attend
# devant : paliers 2 → 5 → 10 → … → 45 navigateurs AU TOTAL, 20 min chacun, lus par lire-palier.py. Consignes de Nico
# (06/11 soir) : ARRÊT au premier palier ROUGE, à la moindre sortie réseau d'un navigateur de charge, ou dès que la garde
# s'est arrêtée (signe anti-robot sur le compte réel, mémoire, puce : garde-charge.sh) ; à l'arrêt comme à la fin, TOUTE
# la charge est retirée, 20 min de retour au calme sont lues, les relevés s'arrêtent et l'état final est écrit.
#   systemd-run --unit=fs-derouler-charge /bin/sh /srv/fillsell-cloud/charge/derouler-charge.sh <début du palier 1> [<sa fin>]
# Sorties (etat/essais/) : charge-paliers-<jour>.log (le récit), charge-palier-<n>.json (les chiffres et le verdict),
# charge-palier-calme.json, charge-etat-fin.txt. Jamais d'effet sur le compte réel, l'orchestrateur ni Caddy.
set -u
R=/srv/fillsell-cloud; C=$R/charge; D=$R/etat/essais; mkdir -p "$D"
J="$D/charge-paliers-$(date +%F).log"
DUREE=${DUREE:-1200}
P1=${1:?usage : derouler-charge.sh <début du palier 1, AAAA-MM-JJTHH:MM:SS>}
EN_COURS=""; DEB=""
dire() { echo "$(date +%FT%T) $*" >> "$J"; }
charges() { docker ps -q --filter label=fillsell.charge=1 | wc -l; }
verdict() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["verdict"])' "$1" 2>/dev/null || echo "ILLISIBLE"; }
lire() {   # lire <n> <début> <fin> [--images]
  python3 "$C/lire-palier.py" "$2" "$3" ${4:-} > "$D/charge-palier-$1.json" 2>> "$J"
  dire "palier $1 ($2 → $3) : $(verdict "$D/charge-palier-$1.json")"
}
# Une connexion établie d'un navigateur de charge hors de lui-même (127.*) et du réseau des navigateurs (172.31.0.0/24).
sorties() {
  for n in $(docker ps --filter label=fillsell.charge=1 --format '{{.Names}}'); do
    p=$(docker inspect -f '{{.State.Pid}}' "$n")
    nsenter -t "$p" -n ss -Htn state established 2>/dev/null | awk -v n="$n" '{print n, $4}' \
      | grep -vE ' (127\.|172\.31\.0\.|\[::1\]|\[::ffff:127\.|\[::ffff:172\.31\.0\.)'
  done
}
# Les essais ACTIFS de sortie depuis le réseau d'un navigateur de charge (avant le palier 2) : rien ne doit passer.
sonde() {
  n=$1; p=$(docker inspect -f '{{.State.Pid}}' "$n"); x=""
  nsenter -t "$p" -n curl -s -m 5 -o /dev/null https://1.1.1.1/ && x="$x direct:1.1.1.1:443"
  nsenter -t "$p" -n nc -z -w 5 8.8.8.8 53 2>/dev/null && x="$x direct:8.8.8.8:53"
  nsenter -t "$p" -n curl -s -m 8 -o /dev/null -x http://127.0.0.1:3128 https://example.com/ && x="$x relais:example.com"
  c=$(nsenter -t "$p" -n curl -s -m 8 -o /dev/null -w '%{http_code}' -x http://127.0.0.1:3128 https://example.com/)
  dns=$(docker exec "$n" getent hosts example.com 2>/dev/null | head -1)
  dire "sonde $n : direct 1.1.1.1:443 / 8.8.8.8:53 / relais → example.com (code $c) : ${x:-RIEN NE SORT} ; DNS de Docker : ${dns:-aucune réponse}"
  [ -z "$x" ]
}
arret() {
  dire "ARRET — $1"
  [ -n "$EN_COURS" ] && lire "$EN_COURS-interrompu" "$DEB" "$(date +%FT%T)"
  sh "$C/arreter-charge.sh" >> "$J" 2>&1
  systemctl stop fs-garde-charge 2>/dev/null
  d=$(date +%FT%T); dire "retour au calme ($DUREE s)"
  sleep "$DUREE"
  lire calme "$d" "$(date +%FT%T)"
  systemctl stop fs-mesure fs-mesure-gpu
  { echo "== $(date '+%F %T')"; docker ps -a --format '{{.Names}} | {{.Image}} | {{.ID}} | {{.Status}}'
    echo "== units"; systemctl list-units --all --no-legend 'fs-*'
    echo "== charge/"; ls "$C"
    echo "== iptables"; iptables-save | grep -v '^#' | sed -E 's/\[[0-9]+:[0-9]+\]//' | md5sum; iptables -S FILLSELL-NAV | md5sum
    echo "== reseau"; docker network inspect fillsell-cloud -f '{{len .Containers}}'
    echo "== mem"; free -m | sed -n 2p
  } > "$D/charge-etat-fin.txt" 2>&1
  dire "FIN : charge retirée, relevés arrêtés, état final dans charge-etat-fin.txt"
  exit 0
}
attendre() {   # $DUREE secondes, la garde relue toutes les 10 s
  t=0
  while [ "$t" -lt "$DUREE" ]; do
    sleep 10; t=$((t + 10))
    systemctl is-active --quiet fs-garde-charge || arret "la garde s'est arrêtée (voir charge-garde-$(date +%F).log)"
  done
}

dire "déroulé ouvert (paliers de $DUREE s) ; palier 1 = compte réel seul depuis $P1"
systemctl is-active --quiet fs-garde-charge || { dire "REFUS : garde absente"; exit 1; }
# La fin du palier 1 (2e argument, facultatif) : attendue ici, la garde relue toutes les 10 s.
if [ -n "${2:-}" ]; then
  while [ "$(date +%s)" -lt "$(date -d "$2" +%s)" ]; do
    sleep 10; systemctl is-active --quiet fs-garde-charge || arret "la garde s'est arrêtée pendant le palier 1"
  done
fi
lire 1 "$P1" "$(date +%FT%T)"
case "$(verdict "$D/charge-palier-1.json")" in VERT) ;; *) arret "palier 1 non vert" ;; esac
prec=1
for N in 2 5 10 15 20 25 30 35 40 45; do
  systemctl is-active --quiet fs-garde-charge || arret "la garde s'est arrêtée avant le palier $N"
  EN_COURS=$N; DEB=$(date +%FT%T)
  sh "$C/fs-charge.sh" "$prec" "$((N - 1))" >> "$J" 2>&1 || dire "fs-charge.sh a rendu une erreur (palier $N)"
  dire "palier $N : $(charges) navigateurs de charge lancés (attendus $((N - 1)))"
  if [ "$N" = 2 ]; then sonde fs-charge-01 || arret "un navigateur de charge joint l'extérieur"; fi
  s=$(sorties); [ -z "$s" ] || arret "sortie réseau : $s"
  sleep 30
  DEB=$(date +%FT%T)
  attendre
  s=$(sorties); [ -z "$s" ] || arret "sortie réseau : $s"
  lire "$N" "$DEB" "$(date +%FT%T)" --images
  EN_COURS=""
  case "$(verdict "$D/charge-palier-$N.json")" in VERT) ;; *) arret "palier $N : $(verdict "$D/charge-palier-$N.json")" ;; esac
  prec=$N
done
arret "palier 45 atteint, tous verts"
