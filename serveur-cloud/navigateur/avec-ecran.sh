#!/bin/sh
# Démarre l'écran virtuel (Xvfb), puis steel-browser tel quel.
set -e
rm -f /tmp/.X10-lock
Xvfb :10 -screen 0 1920x1080x24 -nolisten tcp -ac >/dev/null 2>&1 &
i=0
while [ ! -e /tmp/.X11-unix/X10 ] && [ $i -lt 50 ]; do i=$((i + 1)); sleep 0.1; done
exec /app/api/entrypoint.sh "$@"
