#!/bin/sh
# (06/11/2026) GARDE de l'essai de charge (docs/cloud/ESSAI-CHARGE-CLOUD2.md, consigne de Nico : « arrêt immédiat au moindre
# signe anti-robot sur mon compte ») — LECTURE SEULE, toutes les 10 s, sur le compte réel <compte> :
#   · enregistrement de fond : une requête neuve vers captcha-delivery.com (DataDome : glissière, vérification de l'appareil) ;
#   · etat/endurance/blocages.json modifié ;
#   · journal de l'orchestrateur : verification_*, connexion_acces_restreint, resolution_glissiere_vue, vue_zoom_glissiere,
#     endurance_arret_premier_blocage ;
#   · navigateur du compte : oom_kill, conteneur disparu ou remplacé, « GPU process » / « context lost » dans son journal ;
#   · hôte : mémoire disponible sous 6 Gio (seuil d'un palier vert).
# Au premier signe : arreter-charge.sh (toute la charge retirée), une ligne ARRET dans le journal de la garde, et fin.
# Jamais d'effet sur le compte réel, l'orchestrateur ni Caddy. Lancement :
#   systemd-run --unit=fs-garde-charge --property=Nice=10 /bin/sh /srv/fillsell-cloud/charge/garde-charge.sh <compte>
# Arrêt : systemctl stop fs-garde-charge.
set -u
U=${1:?usage : garde-charge.sh <compte>}
R=/srv/fillsell-cloud; D=$R/etat/essais; mkdir -p "$D"; L="$D/charge-garde-$(date +%F).log"
NAV="fs-nav-$U"; ORCH=deploiement-orchestrateur-1
DEBUT=$(date -u +%FT%TZ)
fond() { echo "$D/fond-$(echo "$U" | cut -c1-8)-$(TZ=Europe/Paris date +%F).jsonl"; }
md5b() { md5sum "$R/etat/endurance/blocages.json" 2>/dev/null | cut -d' ' -f1; }
ID0=$(docker inspect -f '{{.Id}}' "$NAV" 2>/dev/null) || { echo "$(date +%FT%T) REFUS : $NAV introuvable" >> "$L"; exit 1; }
oom() { awk '$1=="oom_kill"{print $2}' "/sys/fs/cgroup/system.slice/docker-$ID0.scope/memory.events" 2>/dev/null; }
F0=$(fond); N0=$(wc -l < "$F0" 2>/dev/null || echo 0); B0=$(md5b); O0=$(oom)
echo "$(date +%FT%T) garde ouverte : $NAV, fond $N0 lignes, oom $O0, depuis $DEBUT (UTC)" >> "$L"
k=0
while :; do
  sleep 10; S=""
  f=$(fond); [ "$f" = "$F0" ] || { F0=$f; N0=0; }
  n=$(wc -l < "$f" 2>/dev/null || echo 0)
  if [ "$n" -gt "$N0" ]; then
    x=$(tail -n +"$((N0 + 1))" "$f" | head -n "$((n - N0))" | grep -m1 'captcha-delivery\.com' | cut -c1-200)
    [ -n "$x" ] && S="fond : requête DataDome $x"
    N0=$n
  fi
  [ -z "$S" ] && [ "$(md5b)" != "$B0" ] && S="blocages.json modifié"
  if [ -z "$S" ]; then
    e=$(docker logs --since "$DEBUT" "$ORCH" 2>&1 | grep -m1 -oE '"evenement":"(verification_(passee_seule|passagere|plateforme_bloquee|confirmee|resolue|essai_echec)|connexion_acces_restreint|resolution_glissiere_vue|vue_zoom_glissiere|endurance_arret_premier_blocage)"')
    [ -n "$e" ] && S="orchestrateur : $e"
  fi
  # La mémoire de l'hôte sous le seuil d'un palier VERT (6 Gio, lire-palier.py) : le palier est rouge de toute façon, et
  # le noyau pourrait tuer le navigateur du compte réel ou l'orchestrateur.
  [ -z "$S" ] && [ "$(awk '/^MemAvailable/{print int($2/1024)}' /proc/meminfo)" -lt 6144 ] && S="mémoire disponible de l'hôte < 6 Gio"
  if [ -z "$S" ]; then
    id=$(docker inspect -f '{{.Id}}' "$NAV" 2>/dev/null)
    if [ "$id" != "$ID0" ]; then S="navigateur du compte disparu ou remplacé"
    elif [ "$(oom)" != "$O0" ]; then S="oom_kill dans le navigateur du compte"
    elif [ "$(docker logs --since "$DEBUT" "$NAV" 2>&1 | grep -ciE 'gpu process|context lost')" -gt 0 ]; then S="puce : « GPU process » / « context lost » dans le journal du navigateur du compte"
    fi
  fi
  if [ -n "$S" ]; then
    echo "$(date +%FT%T) ARRET — $S" >> "$L"
    sh "$R/charge/arreter-charge.sh" >> "$L" 2>&1
    exit 0
  fi
  k=$((k + 1)); [ $((k % 30)) -eq 0 ] && echo "$(date +%FT%T) rien ; charge : $(docker ps -q --filter label=fillsell.charge=1 | wc -l)" >> "$L"
done
