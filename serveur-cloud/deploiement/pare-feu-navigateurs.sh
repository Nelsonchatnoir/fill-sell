#!/bin/sh
# VERROU 3 contre la fuite de l'IP du serveur : les navigateurs (pont
# br-fillsell, 172.31.0.0/24) ne sortent QUE vers les proxys IPRoyal
# (ports PORTS_PROXY, 12323 = HTTP, 12324 = SOCKS5 au 05/10). Tout le reste
# — DNS compris — est refusé : un Chromium sans proxy ne joint aucune
# plateforme, il ne joint rien du tout.
# Rejoué à chaque démarrage (fillsell-pare-feu.service) et à chaque déploiement.
set -eu
PONT=br-fillsell
RESEAU=172.31.0.0/24
PORTS_PROXY="${PORTS_PROXY:-12323,12324}"

iptables -N FILLSELL-NAV 2>/dev/null || iptables -F FILLSELL-NAV
iptables -A FILLSELL-NAV -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
iptables -A FILLSELL-NAV -d "$RESEAU" -j RETURN
iptables -A FILLSELL-NAV -p tcp -m multiport --dports "$PORTS_PROXY" -j RETURN
iptables -A FILLSELL-NAV -j DROP
# Branchée en tête de DOCKER-USER (Docker garde cette chaîne pour nous), et dans
# INPUT pour ce que les conteneurs demandent à l'hôte lui-même (sauf l'orchestrateur
# qui leur parle : les réponses passent par ESTABLISHED).
iptables -C DOCKER-USER -i "$PONT" -j FILLSELL-NAV 2>/dev/null || iptables -I DOCKER-USER 1 -i "$PONT" -j FILLSELL-NAV
iptables -N FILLSELL-NAV-HOTE 2>/dev/null || iptables -F FILLSELL-NAV-HOTE
iptables -A FILLSELL-NAV-HOTE -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
iptables -A FILLSELL-NAV-HOTE -j DROP
iptables -C INPUT -i "$PONT" -j FILLSELL-NAV-HOTE 2>/dev/null || iptables -I INPUT 1 -i "$PONT" -j FILLSELL-NAV-HOTE
# IPv6 : aucun navigateur n'en a (pont sans IPv6) ; on ferme quand même.
ip6tables -C FORWARD -i "$PONT" -j DROP 2>/dev/null || ip6tables -I FORWARD 1 -i "$PONT" -j DROP 2>/dev/null || true
echo "pare-feu des navigateurs : sortie limitée aux ports ${PORTS_PROXY} (pont ${PONT})"
