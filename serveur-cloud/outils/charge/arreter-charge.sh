#!/bin/sh
# (06/11/2026) Retire TOUTE la charge (à tout moment, sans effet sur les comptes réels ni sur l'orchestrateur) :
# les conteneurs fillsell.charge=1 et leurs profils jetables. Les relevés continuent tant qu'on ne les arrête pas :
#   systemctl stop fs-mesure fs-mesure-gpu
ids=$(docker ps -aq --filter label=fillsell.charge=1)
[ -n "$ids" ] && docker rm -f $ids >/dev/null
rm -rf /srv/fillsell-cloud/charge/p[0-9]*
echo "charge retirée ; restants : $(docker ps -q --filter label=fillsell.charge=1 | wc -l) ; comptes réels : $(docker ps --format '{{.Names}}' | grep -c '^fs-nav-')"
