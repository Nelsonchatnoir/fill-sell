#!/bin/sh
# Le .env d'un serveur NEUF, FERMÉ (06/11/2026, avant l'essai de l'AX42) — appelé par deployer.sh sur le serveur.
# env.exemple porte SERVEUR_NOM=cloud-1, COMPTES_AUTORISES=<compte de Nico> et ENTRETIEN_POOL=1 : copié tel quel, une
# machine neuve battait sous le nom de cloud-1 (domaine de cloud-1 réécrit dans cloud_serveurs), servait Nico et tenait
# le pool en même temps que le vrai cloud-1. Ici : le nom DONNÉ (obligatoire), aucun compte servi (identifiant qui
# n'existe pas — vide voudrait dire TOUS), pas d'entretien du pool, clé des tickets tirée sur place. L'ouvrir (comptes,
# pool) reste un geste à la main, décidé. On n'écrit jamais par-dessus un .env en place.
#
#   sh env-premier.sh <env.exemple> <.env à écrire> <nom du serveur>
set -eu
MODELE="$1"; ENV="$2"; NOM="${3:-}"
FERME=00000000-0000-0000-0000-000000000000
case "$NOM" in
  ''|*[!a-z0-9-]*|-*) echo "REFUS : nom de serveur « $NOM » (minuscules, chiffres et tirets, ex. cloud-3)" >&2; exit 1 ;;
esac
[ ! -e "$ENV" ] || { echo "REFUS : $ENV existe déjà (un .env en place n'est jamais réécrit)" >&2; exit 1; }
[ -f "$MODELE" ] || { echo "REFUS : modèle $MODELE introuvable" >&2; exit 1; }
umask 077
TMP="$ENV.neuf.$$"
sed -e "s#^SERVEUR_NOM=.*#SERVEUR_NOM=$NOM#" \
    -e "s#^COMPTES_AUTORISES=.*#COMPTES_AUTORISES=$FERME#" \
    -e "s#^ENTRETIEN_POOL=.*#ENTRETIEN_POOL=0#" \
    -e "s#^TICKETS_CLE=.*#TICKETS_CLE=$(openssl rand -base64 32)#" "$MODELE" > "$TMP"
# Preuve, ligne à ligne : un modèle qui aurait perdu une de ces lignes laisserait la valeur par défaut du code
# (config.js : cloud-1, tous les comptes, pool tenu).
for L in "SERVEUR_NOM=$NOM" "COMPTES_AUTORISES=$FERME" "ENTRETIEN_POOL=0"; do
  grep -qx "$L" "$TMP" || { rm -f "$TMP"; echo "REFUS : « $L » absent du .env écrit (env.exemple a changé ?)" >&2; exit 1; }
done
grep -q '^TICKETS_CLE=.' "$TMP" || { rm -f "$TMP"; echo "REFUS : clé des tickets vide" >&2; exit 1; }
chmod 600 "$TMP"
mv "$TMP" "$ENV"
echo ".env neuf : $NOM, FERMÉ (aucun compte servi, pas d'entretien du pool) — l'ouvrir est un geste à la main"
