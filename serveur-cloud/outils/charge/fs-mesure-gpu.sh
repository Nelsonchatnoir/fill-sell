#!/bin/sh
# (06/11/2026) Relevé de la PUCE GRAPHIQUE Intel pendant l'essai de charge (LECTURE SEULE) : intel_gpu_top (paquet
# intel-gpu-tools, installé sur cloud-2 le 06/11 vers 17:15) en CSV toutes les 5 s, chaque ligne horodatée.
# Colonnes utiles : occupation Render/3D (le rendu des pages), Blitter, Video ; fréquence ; RC6 (repos).
# Lancement : systemd-run --unit=fs-mesure-gpu --property=Nice=10 /bin/sh /srv/fillsell-cloud/charge/fs-mesure-gpu.sh
# Arrêt : systemctl stop fs-mesure-gpu.
D=/srv/fillsell-cloud/etat/essais; mkdir -p "$D"
F="$D/charge-gpu-$(date +%F).csv"
CARTE=$(ls -d /dev/dri/card[0-9]* | head -1)
intel_gpu_top -c -s 5000 -d "drm:$CARTE" -o - | while IFS= read -r l; do
  case "$l" in
    *[Rr]ender*|*Freq*|*freq*) [ -s "$F" ] || echo "le;$l" > "$F" ;;
    *) echo "$(date +%FT%T);$l" >> "$F" ;;
  esac
done
