#!/bin/sh
# VERROU 3 contre la fuite de l'IP du serveur : les navigateurs (pont
# br-fillsell, 172.31.0.0/24) ne sortent QUE vers les proxys IPRoyal.
# (01/11) Comme l'essai qui a passé : les SEULES destinations sont les proxys du pool, adresse ET port, une par ligne
# « ip:port » dans deploiement/proxys-permis.txt (écrit au déploiement, DESTINATIONS_PROXY) ; sans ce fichier, les
# ports des proxys (PORTS_PROXY, 12323 = HTTP, 12324 = SOCKS5 au 05/10 ; 12321 = passerelle résidentielle, 30/10).
# Tout le reste — DNS compris — est refusé : un Chromium sans proxy ne joint aucune plateforme, il ne joint rien du tout.
# Rejoué à chaque démarrage (fillsell-pare-feu.service) et à chaque déploiement. À la fin, la PREUVE pour
# l'orchestrateur (etat/pare-feu.json, numéro de CE démarrage) : sans elle, il n'ouvre aucun navigateur.
set -eu
PONT=br-fillsell
RESEAU=172.31.0.0/24
PORTS_PROXY="${PORTS_PROXY:-12321,12323,12324}"
LISTE=/srv/fillsell-cloud/deploiement/proxys-permis.txt
ETAT=/srv/fillsell-cloud/etat

# Pendant la reconstruction de la chaîne, le pont ne sort plus du tout (aucune fenêtre ouverte).
iptables -I DOCKER-USER 1 -i "$PONT" -j DROP
iptables -N FILLSELL-NAV 2>/dev/null || iptables -F FILLSELL-NAV
iptables -A FILLSELL-NAV -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
iptables -A FILLSELL-NAV -d "$RESEAU" -j RETURN
DESTINATIONS=""
if [ -s "$LISTE" ]; then
  while IFS= read -r d || [ -n "$d" ]; do
    d=$(printf '%s' "$d" | tr -d ' \r')
    case "$d" in ''|\#*) continue ;; esac
    ip=${d%:*}; port=${d##*:}
    if printf '%s' "$ip" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$' && printf '%s' "$port" | grep -Eq '^[0-9]{2,5}$'; then
      iptables -A FILLSELL-NAV -p tcp -d "$ip" --dport "$port" -j RETURN
      DESTINATIONS="${DESTINATIONS:+$DESTINATIONS,}$ip:$port"
    fi
  done < "$LISTE"
fi
if [ -z "$DESTINATIONS" ]; then
  iptables -A FILLSELL-NAV -p tcp -m multiport --dports "$PORTS_PROXY" -j RETURN
  DESTINATIONS="ports:$PORTS_PROXY"
fi
iptables -A FILLSELL-NAV -j DROP
# Branchée en tête de DOCKER-USER (Docker garde cette chaîne pour nous), et dans
# INPUT pour ce que les conteneurs demandent à l'hôte lui-même (sauf l'orchestrateur
# qui leur parle : les réponses passent par ESTABLISHED).
iptables -C DOCKER-USER -i "$PONT" -j FILLSELL-NAV 2>/dev/null || iptables -I DOCKER-USER 2 -i "$PONT" -j FILLSELL-NAV
iptables -N FILLSELL-NAV-HOTE 2>/dev/null || iptables -F FILLSELL-NAV-HOTE
iptables -A FILLSELL-NAV-HOTE -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
iptables -A FILLSELL-NAV-HOTE -j DROP
iptables -C INPUT -i "$PONT" -j FILLSELL-NAV-HOTE 2>/dev/null || iptables -I INPUT 1 -i "$PONT" -j FILLSELL-NAV-HOTE
# IPv6 : aucun navigateur n'en a (pont sans IPv6) ; on ferme quand même.
ip6tables -C FORWARD -i "$PONT" -j DROP 2>/dev/null || ip6tables -I FORWARD 1 -i "$PONT" -j DROP 2>/dev/null || true
# Fin de la reconstruction : la garde provisoire part (la chaîne est complète, DROP final compris).
iptables -D DOCKER-USER -i "$PONT" -j DROP
mkdir -p "$ETAT"
printf '{"boot_id":"%s","le":"%s","destinations":"%s"}\n' "$(cat /proc/sys/kernel/random/boot_id)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$DESTINATIONS" > "$ETAT/pare-feu.json"
echo "pare-feu des navigateurs : sortie limitée à ${DESTINATIONS} (pont ${PONT})"
