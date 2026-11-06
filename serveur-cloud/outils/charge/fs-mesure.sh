#!/bin/sh
# (06/11/2026) Relevé de l'essai de charge (LECTURE SEULE), toutes les 5 s :
#   · chaque navigateur (comptes réels fs-nav-*, charge fs-charge-*) : mémoire du cgroup (totale, anon, shmem, cache),
#     processeur cumulé, bridage au plafond de 1,5 fil, processus, oom_kill ;
#   · l'hôte : processeur, charge moyenne, mémoire disponible, nombre de navigateurs.
# La puce graphique est relevée à part (fs-mesure-gpu.sh, intel_gpu_top). Lancement :
#   systemd-run --unit=fs-mesure --property=Nice=10 /bin/sh /srv/fillsell-cloud/charge/fs-mesure.sh
# Arrêt : systemctl stop fs-mesure (les CSV restent dans /srv/fillsell-cloud/etat/essais/).
D=/srv/fillsell-cloud/etat/essais; mkdir -p "$D"
PT=""; PI=""
while :; do
  J=$(date +%F); T=$(date +%FT%T); N="$D/charge-navigateurs-$J.csv"; H="$D/charge-hote-$J.csv"
  [ -s "$N" ] || echo "le;nom;mem_mo;anon_mo;shmem_mo;fichiers_mo;cpu_usec;bride_n;bride_usec;pids;oom" > "$N"
  [ -s "$H" ] || echo "le;cpu_pct;charge1;dispo_mo;navigateurs" > "$H"
  docker ps --no-trunc --format '{{.ID}} {{.Names}}' | grep -E ' fs-(nav|charge)-' | while read -r ID NOM; do
    C=/sys/fs/cgroup/system.slice/docker-$ID.scope; [ -d "$C" ] || continue
    M=$(awk '$1=="anon"{a=$2}$1=="shmem"{s=$2}$1=="file"{f=$2}END{printf "%d;%d;%d",a/1048576,s/1048576,f/1048576}' "$C/memory.stat")
    U=$(awk '$1=="usage_usec"{u=$2}$1=="nr_throttled"{n=$2}$1=="throttled_usec"{t=$2}END{printf "%s;%s;%s",u,n,t}' "$C/cpu.stat")
    echo "$T;$NOM;$(( $(cat "$C/memory.current") / 1048576 ));$M;$U;$(cat "$C/pids.current");$(awk '$1=="oom_kill"{print $2}' "$C/memory.events")" >> "$N"
  done
  read -r _ u n s i w q sq st _ < /proc/stat; TOT=$((u+n+s+i+w+q+sq+st)); IDL=$((i+w)); CPU=""
  [ -n "$PT" ] && [ "$TOT" -gt "$PT" ] && CPU=$(( 100 * ((TOT-PT) - (IDL-PI)) / (TOT-PT) )); PT=$TOT; PI=$IDL
  NB=$(docker ps -q --filter name=fs-nav- --filter name=fs-charge- | wc -l)
  echo "$T;$CPU;$(cut -d' ' -f1 /proc/loadavg);$(awk '/^MemAvailable/{print int($2/1024)}' /proc/meminfo);$NB" >> "$H"
  sleep 5
done
