#!/bin/sh
# Le relais (proxy local + extension signée), l'écran virtuel, puis Google Chrome avec écran. Le port de pilotage
# (9222, local) est relayé sur 9223 pour l'orchestrateur ; le pare-feu de l'hôte ne laisse sortir que vers le proxy.
# --no-sandbox : le bac à sable de Chrome exige des espaces de noms que le conteneur refuse (« Zygote exited ») ;
# le conteneur EST le bac à sable (utilisateur sans droit, réseau limité au proxy).
# (30/10) ECRAN_EXTERNE=1 (poste à vraie puce graphique, deploiement/gpu/) : pas d'écran virtuel — Chrome dessine sur
# l'écran du bureau de l'hôte (DISPLAY, socket X monté) par la puce Intel ; CHROME_ARGS_GL y retire SwiftShader.
set -e
node /relais.mjs &
if [ "${ECRAN_EXTERNE:-0}" != 1 ]; then
  rm -f /tmp/.X10-lock
  Xvfb :10 -screen 0 ${ECRAN:-1920x1080x24} -nolisten tcp -ac >/dev/null 2>&1 &
  i=0; while [ ! -e /tmp/.X11-unix/X10 ] && [ $i -lt 50 ]; do i=$((i + 1)); sleep 0.1; done
fi
socat TCP-LISTEN:9223,fork,reuseaddr TCP:127.0.0.1:9222 &
exec google-chrome --no-sandbox --no-first-run --no-default-browser-check --password-store=basic --lang=fr-FR \
  --accept-lang=fr-FR,fr --user-data-dir="${PROFIL:-/profil}" --remote-debugging-port=9222 --remote-allow-origins=* \
  --proxy-server=http://127.0.0.1:3128 \
  ${CHROME_ARGS_GL:---use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader} \
  --window-size=1366,768 about:blank
