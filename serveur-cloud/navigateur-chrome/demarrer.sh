#!/bin/sh
# Écran virtuel, puis Google Chrome avec écran ; le port de pilotage (9222, local) est relayé sur 9223 pour
# l'orchestrateur (réseau fillsell-cloud seulement — le pare-feu de l'hôte ne laisse sortir que vers le proxy).
# --no-sandbox : le bac à sable de Chrome exige des espaces de noms que le conteneur refuse (« Zygote exited ») ;
# le conteneur EST le bac à sable (aucun droit, réseau limité au proxy).
set -e
rm -f /tmp/.X10-lock
Xvfb :10 -screen 0 1920x1080x24 -nolisten tcp -ac >/dev/null 2>&1 &
i=0; while [ ! -e /tmp/.X11-unix/X10 ] && [ $i -lt 50 ]; do i=$((i + 1)); sleep 0.1; done
socat TCP-LISTEN:9223,fork,reuseaddr TCP:127.0.0.1:9222 &
exec google-chrome --no-sandbox --no-first-run --no-default-browser-check --password-store=basic --lang=fr-FR \
  --user-data-dir="${PROFIL:-/tmp/profil}" --remote-debugging-port=9222 --remote-allow-origins=* \
  --proxy-server="${PROXY_SERVEUR:?proxy obligatoire}" \
  --accept-lang=fr-FR,fr --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1920,1080 --start-maximized about:blank
