#!/bin/sh
# VERROU 3 contre la fuite de l'IP du serveur : les navigateurs (pont
# br-fillsell, 172.31.0.0/24) ne sortent QUE vers les proxys IPRoyal.
# (01/11) Comme l'essai qui a passé : les SEULES destinations sont les proxys du pool, adresse ET port, une par ligne
# « ip:port ». (03/11, point 2 de Nico) LA LISTE EST DYNAMIQUE : l'orchestrateur l'écrit dans etat/proxys-permis.txt
# (toutes les IP vivantes du pool) et fillsell-pare-feu-maj.path rejoue ce script dès qu'elle change — plus aucun
# redéploiement pour une IP neuve. Repli : deploiement/proxys-permis.txt (DESTINATIONS_PROXY du déploiement), puis
# les ports des proxys (PORTS_PROXY, 12323 = HTTP, 12324 = SOCKS5 ; 12321 = passerelle résidentielle).
# Tout le reste — DNS compris — est refusé : un Chromium sans proxy ne joint aucune plateforme, il ne joint rien du tout.
# La chaîne FILLSELL-NAV est REMPLACÉE D'UN BLOC (iptables-restore, une transaction) : aucune fenêtre ouverte, aucune
# connexion en cours coupée (ESTABLISHED reste permis). Au premier passage (démarrage), une garde DROP couvre le pont
# le temps de brancher la chaîne. Rejoué à chaque démarrage (fillsell-pare-feu.service), à chaque changement de la
# liste (fillsell-pare-feu-maj.path) et à chaque déploiement. À la fin, la PREUVE pour l'orchestrateur
# (etat/pare-feu.json, numéro de CE démarrage, destinations APPLIQUÉES) : sans elle, il n'ouvre aucun navigateur.
set -eu
PONT=br-fillsell
RESEAU=172.31.0.0/24
PORTS_PROXY="${PORTS_PROXY:-12321,12323,12324}"
# (Les chemins ne changent que pour l'autotest : serveur-cloud/tests/ip.test.mjs.)
ETAT="${FILLSELL_ETAT:-/srv/fillsell-cloud/etat}"
LISTE_ETAT="$ETAT/proxys-permis.txt"
LISTE_DEPLOIEMENT="${FILLSELL_LISTE_DEPLOIEMENT:-/srv/fillsell-cloud/deploiement/proxys-permis.txt}"
VERROU="${FILLSELL_VERROU:-/run/fillsell}"

# Un seul passage à la fois (démarrage, liste qui change, déploiement).
mkdir -p "$VERROU"
exec 9>"$VERROU/pare-feu.verrou"
flock 9

# Les lignes valides d'une liste « ip:port » (le reste est ignoré).
lignes_valides() {
  [ -s "$1" ] || return 0
  while IFS= read -r d || [ -n "$d" ]; do
    d=$(printf '%s' "$d" | tr -d ' \r\t')
    case "$d" in ''|\#*) continue ;; esac
    ip=${d%:*}; port=${d##*:}
    if printf '%s' "$ip" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$' && printf '%s' "$port" | grep -Eq '^[0-9]{2,5}$'; then
      printf '%s:%s\n' "$ip" "$port"
    fi
  done < "$1" | sort -u
}

SOURCE=etat
VALIDES=$(lignes_valides "$LISTE_ETAT")
if [ -z "$VALIDES" ]; then SOURCE=deploiement; VALIDES=$(lignes_valides "$LISTE_DEPLOIEMENT"); fi
[ -n "$VALIDES" ] || SOURCE=ports

REGLES=$(mktemp)
trap 'rm -f "$REGLES"' EXIT
DESTINATIONS=""
{
  echo '*filter'
  echo ':FILLSELL-NAV - [0:0]'
  echo '-F FILLSELL-NAV'
  echo '-A FILLSELL-NAV -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN'
  echo "-A FILLSELL-NAV -d $RESEAU -j RETURN"
  if [ "$SOURCE" = ports ]; then
    echo "-A FILLSELL-NAV -p tcp -m multiport --dports $PORTS_PROXY -j RETURN"
  else
    for d in $VALIDES; do echo "-A FILLSELL-NAV -p tcp -d ${d%:*} --dport ${d##*:} -j RETURN"; done
  fi
  echo '-A FILLSELL-NAV -j DROP'
  # Ce que les conteneurs demandent à l'hôte lui-même (sauf l'orchestrateur qui leur parle : les réponses passent par
  # ESTABLISHED) — dans la même transaction.
  echo ':FILLSELL-NAV-HOTE - [0:0]'
  echo '-F FILLSELL-NAV-HOTE'
  echo '-A FILLSELL-NAV-HOTE -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN'
  echo '-A FILLSELL-NAV-HOTE -j DROP'
  echo 'COMMIT'
} > "$REGLES"
if [ "$SOURCE" = ports ]; then DESTINATIONS="ports:$PORTS_PROXY"; else DESTINATIONS=$(printf '%s' "$VALIDES" | tr '\n' ',' | sed 's/,$//'); fi

if iptables -C DOCKER-USER -i "$PONT" -j FILLSELL-NAV 2>/dev/null; then
  # La chaîne est déjà branchée : remplacée d'un bloc (une transaction), sans garde ni fenêtre.
  iptables-restore --noflush < "$REGLES"
else
  # Premier passage : le pont ne sort plus du tout le temps de construire et brancher la chaîne.
  iptables -I DOCKER-USER 1 -i "$PONT" -j DROP
  iptables-restore --noflush < "$REGLES"
  iptables -C DOCKER-USER -i "$PONT" -j FILLSELL-NAV 2>/dev/null || iptables -I DOCKER-USER 2 -i "$PONT" -j FILLSELL-NAV
  iptables -D DOCKER-USER -i "$PONT" -j DROP
fi
iptables -C INPUT -i "$PONT" -j FILLSELL-NAV-HOTE 2>/dev/null || iptables -I INPUT 1 -i "$PONT" -j FILLSELL-NAV-HOTE
# IPv6 : aucun navigateur n'en a (pont sans IPv6) ; on ferme quand même.
ip6tables -C FORWARD -i "$PONT" -j DROP 2>/dev/null || ip6tables -I FORWARD 1 -i "$PONT" -j DROP 2>/dev/null || true
mkdir -p "$ETAT"
printf '{"boot_id":"%s","le":"%s","destinations":"%s","source":"%s"}\n' "$(cat "${FILLSELL_BOOT_ID:-/proc/sys/kernel/random/boot_id}")" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$DESTINATIONS" "$SOURCE" > "$ETAT/pare-feu.json.tmp"
mv "$ETAT/pare-feu.json.tmp" "$ETAT/pare-feu.json"
echo "pare-feu des navigateurs : sortie limitée à ${DESTINATIONS} (pont ${PONT}, liste ${SOURCE})"
