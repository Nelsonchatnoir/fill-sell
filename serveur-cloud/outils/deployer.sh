#!/usr/bin/env bash
# Déploie FillSell Cloud sur le serveur Hetzner — depuis le dépôt (Git Bash), arbre
# PROPRE (comme npm run build : on ne déploie que du commité). Le dossier principal
# une fois feat/cloud sur main ; d'ici là le worktree Cloud (la règle « jamais depuis
# un worktree » vise l'OTA Capgo, pas ce serveur). Appelé par lancer-serveur-test.mjs.
#
#   bash serveur-cloud/outils/deployer.sh <ip_du_serveur> [domaine]
#   SERVEUR_NOM=cloud-3 bash serveur-cloud/outils/deployer.sh <ip> cloud-3.fillsell.app   (06/11 : serveur NEUF, nom exigé)
#   ORCHESTRATEUR_SEUL=1 bash serveur-cloud/outils/deployer.sh <ip> <domaine>   (06/11 soir : l'orchestrateur, rien d'autre)
#   DESTINATIONS_PROXY="81.181.239.136:12323" bash serveur-cloud/outils/deployer.sh …   (01/11 : sorties des navigateurs)
#   (03/11) DESTINATIONS_PROXY n'est plus qu'un repli : l'orchestrateur tient la liste à jour (pareFeu.js).
#
# 1. assemble le paquet (orchestrateur + règles du pool + client de l'écran
#    « Me connecter » + extension Cloud construite par scripts/cloud/build-extension-cloud.mjs) ;
# 2. l'envoie, construit l'orchestrateur ; (01/11) le navigateur = steel-browser PUBLIÉ, épinglé
#    (IMAGE_STEEL_ESSAI_0111 de src/navigateur.js, l'essai qui a passé) : plus d'image dérivée construite ici ;
# 3. premier déploiement : écrit /srv/fillsell-cloud/.env FERMÉ au nom donné (06/11 : outils/env-premier.sh — jamais
#    env.exemple tel quel, qui disait cloud-1) (clés Supabase lues
#    par la CLI sans affichage ; clé des tickets tirée SUR le serveur ; (01/11) clé du coffre et jeton IPRoyal
#    repris de secrets.env (SECRETS_ENV) par l'entrée standard, jamais affichés — sinon une clé neuve tirée là) ;
# 4. rejoue le pare-feu des navigateurs, relance docker compose.
set -euo pipefail
IP="${1:?ip du serveur}"
DOMAINE="${2:-${IP//./-}.sslip.io}"
CLE="$HOME/.ssh/fillsell_cloud_ed25519"
SSH="ssh -i $CLE -o StrictHostKeyChecking=accept-new root@$IP"
RACINE="$(git rev-parse --show-toplevel)"
cd "$RACINE"
if [ -n "$(git status --porcelain -- serveur-cloud supabase/functions/_shared/cloud-pool.js src/cloud/connexion)" ]; then
  echo "REFUS : fichiers non commités dans serveur-cloud/ ou leurs sources." >&2; exit 1
fi
SHA="$(git rev-parse --short=12 HEAD)"
# (06/11, avant l'AX42) Le NOM du serveur, lu AVANT tout envoi. Sans .env, le premier déploiement installait env.exemple
# tel quel : la machine neuve battait sous le nom de cloud-1 (domaine de cloud-1 réécrit dans cloud_serveurs), servait
# Nico et tenait le pool avec lui. Serveur neuf : SERVEUR_NOM exigé, .env FERMÉ (outils/env-premier.sh). Serveur en
# place : le nom donné doit être celui de son .env, et un .env sans nom est refusé (config.js retomberait sur cloud-1).
SERVEUR_NOM="${SERVEUR_NOM:-}"
NOM_EN_PLACE="$($SSH 'if [ -f /srv/fillsell-cloud/.env ]; then sed -n "s/^SERVEUR_NOM=//p" /srv/fillsell-cloud/.env | head -1; else echo "<aucun .env>"; fi' | tr -d '\r')"
if [ "$NOM_EN_PLACE" = "<aucun .env>" ]; then
  [ -n "$SERVEUR_NOM" ] || { echo "REFUS : premier déploiement sur $IP (aucun .env) — nomme le serveur : SERVEUR_NOM=cloud-3 bash $0 $IP <domaine>. Son .env sera FERMÉ (aucun compte, pas d'entretien du pool)." >&2; exit 1; }
  case "$SERVEUR_NOM" in *[!a-z0-9-]*|-*) echo "REFUS : nom de serveur « $SERVEUR_NOM » (minuscules, chiffres, tirets)" >&2; exit 1 ;; esac
  echo "→ serveur NEUF : $SERVEUR_NOM ($DOMAINE), .env fermé"
elif [ -z "$NOM_EN_PLACE" ]; then
  echo "REFUS : le .env de $IP n'a pas de SERVEUR_NOM (l'orchestrateur se prendrait pour cloud-1) — à poser à la main." >&2; exit 1
elif [ -n "$SERVEUR_NOM" ] && [ "$SERVEUR_NOM" != "$NOM_EN_PLACE" ]; then
  echo "REFUS : $IP s'appelle « $NOM_EN_PLACE » dans son .env, pas « $SERVEUR_NOM »." >&2; exit 1
else
  echo "→ serveur en place : $NOM_EN_PLACE ($DOMAINE)"
fi
# (06/11 soir, décision de Nico : « l'extension du Cloud séparément, pour savoir d'où vient le problème ») ORCHESTRATEUR_SEUL=1 :
# l'image de l'orchestrateur (src, public, lib, outils) et RIEN d'autre — ni l'image Chrome, ni la copie Cloud de
# l'extension (CRX et version inchangés : un déploiement complet la renumérote), ni Caddy, ni le pare-feu, ni le .env du
# serveur. Serveur en place seulement. Un seul redémarrage : celui de l'orchestrateur.
if [ "${ORCHESTRATEUR_SEUL:-0}" = 1 ]; then
  [ "$NOM_EN_PLACE" != "<aucun .env>" ] || { echo "REFUS : ORCHESTRATEUR_SEUL sur un serveur neuf (déploiement complet d'abord)" >&2; exit 1; }
  PAQUET="$RACINE/build/cloud-paquet-$SHA-orchestrateur"
  rm -rf "$PAQUET" && mkdir -p "$PAQUET/lib" "$PAQUET/public"
  cp -r serveur-cloud/{package.json,package-lock.json,Dockerfile,src,outils} "$PAQUET/"
  cp serveur-cloud/public/* "$PAQUET/public/"
  cp supabase/functions/_shared/cloud-pool.js "$PAQUET/lib/cloud-pool.js"
  cp src/cloud/connexion/clientConnexion.js "$PAQUET/public/clientConnexion.js"
  echo "→ envoi du paquet $SHA (orchestrateur seul)"
  $SSH "mkdir -p /srv/fillsell-cloud/paquets && rm -rf /srv/fillsell-cloud/paquets/$SHA-orchestrateur"
  scp -i "$CLE" -q -r "$PAQUET" "root@$IP:/srv/fillsell-cloud/paquets/$SHA-orchestrateur"
  $SSH bash -s -- "$SHA" "$DOMAINE" <<'DISTANT_ORCH'
set -euo pipefail
SHA="$1"; DOMAINE="$2"; P="/srv/fillsell-cloud/paquets/$SHA-orchestrateur"
echo "avant : $(sed -n 's/^VERSION_ORCHESTRATEUR=//p' /srv/fillsell-cloud/deploiement/.env) ; image Chrome $(sed -n 's/^IMAGE_CHROME=//p' /srv/fillsell-cloud/.env) ; CRX $(md5sum /srv/fillsell-cloud/extension-crx/fillsell-cloud.crx | cut -c1-12)"
docker build -q -t "fillsell-orchestrateur:$SHA" "$P" >/dev/null
printf 'VERSION_ORCHESTRATEUR=%s\nDOMAINE=%s\n' "$SHA" "$DOMAINE" > /srv/fillsell-cloud/deploiement/.env
cd /srv/fillsell-cloud/deploiement
VERSION_ORCHESTRATEUR="$SHA" DOMAINE="$DOMAINE" docker compose up -d --no-deps orchestrateur
echo "après : $SHA ; image Chrome $(sed -n 's/^IMAGE_CHROME=//p' /srv/fillsell-cloud/.env) ; CRX $(md5sum /srv/fillsell-cloud/extension-crx/fillsell-cloud.crx | cut -c1-12)"
DISTANT_ORCH
  echo "santé : $(curl -s --max-time 20 "https://$DOMAINE/sante" || echo 'pas encore')"
  exit 0
fi
IMAGE_STEEL="$(grep -o 'ghcr.io/steel-dev/steel-browser@sha256:[0-9a-f]\{64\}' serveur-cloud/src/navigateur.js | head -1)"
[ -n "$IMAGE_STEEL" ] || { echo "REFUS : image steel épinglée introuvable dans src/navigateur.js" >&2; exit 1; }
SECRETS="${SECRETS_ENV:-/c/Users/nicol/fillsell-cloud-proto/secrets.env}"
PAQUET="$RACINE/build/cloud-paquet-$SHA"
rm -rf "$PAQUET" && mkdir -p "$PAQUET/lib" "$PAQUET/public"
cp -r serveur-cloud/{package.json,package-lock.json,Dockerfile,src,outils,navigateur-chrome,deploiement} "$PAQUET/"
cp serveur-cloud/public/* "$PAQUET/public/"
cp supabase/functions/_shared/cloud-pool.js "$PAQUET/lib/cloud-pool.js"
cp src/cloud/connexion/clientConnexion.js "$PAQUET/public/clientConnexion.js"
[ -f build/extension-cloud/manifest.json ] || node scripts/cloud/build-extension-cloud.mjs
cp -r build/extension-cloud "$PAQUET/extension"

echo "→ envoi du paquet $SHA"
$SSH "mkdir -p /srv/fillsell-cloud/paquets && rm -rf /srv/fillsell-cloud/paquets/$SHA"
scp -i "$CLE" -q -r "$PAQUET" "root@$IP:/srv/fillsell-cloud/paquets/$SHA"

echo "→ images, extension, configuration, pare-feu"
$SSH bash -s -- "$SHA" "$DOMAINE" "$IMAGE_STEEL" "${SERVEUR_NOM:--}" "${DESTINATIONS_PROXY:-}" <<'DISTANT'
set -euo pipefail
# (04/11 soir) ${5:-} : ssh recolle les arguments en une ligne, un DESTINATIONS_PROXY vide y disparaît (set -u l'arrêtait) ;
# c'est pourquoi il passe EN DERNIER, et pourquoi un nom absent voyage sous la forme « - » (06/11).
SHA="$1"; DOMAINE="$2"; IMAGE_STEEL="$3"; NOM="$4"; DESTINATIONS="${5:-}"; P="/srv/fillsell-cloud/paquets/$SHA"
docker image inspect "$IMAGE_STEEL" >/dev/null 2>&1 || docker pull -q "$IMAGE_STEEL" >/dev/null
docker build -q -t "fillsell-orchestrateur:$SHA" "$P" >/dev/null
# (30/10, lot D) Le navigateur Google Chrome officiel et l'extension Cloud SIGNÉE (installation par stratégie
# d'entreprise). La clé de signature de la copie Cloud vit sur le serveur seul (cle-extension-cloud.pem, 600).
# (01/11) Repli seulement : construit quand cette clé est sur le serveur ; sinon rien (le moteur est steel).
if [ -f /srv/fillsell-cloud/cle-extension-cloud.pem ]; then
  docker build -q -t "fillsell-chrome:$SHA" "$P/navigateur-chrome" >/dev/null
  mkdir -p /srv/fillsell-cloud/extension-crx
  VERSION_CRX=$(( ($(date +%s) - 1767225600) / 600 % 65535 ))
  docker run --rm -u 0 --network none --entrypoint /empaqueter-extension.sh -e VERSION_CRX="$VERSION_CRX" \
    -v "$P/extension:/ext-src:ro" -v /srv/fillsell-cloud/cle-extension-cloud.pem:/cle.pem:ro \
    -v /srv/fillsell-cloud/extension-crx:/out "fillsell-chrome:$SHA"
fi
# (02/11, décision de Nico : profil français) La langue française de Chromium (fr.pak) : l'image steel n'a que en-US.pak,
# et Chromium sous Linux retombe alors en en-US (Intl, format des dates) quoi qu'on lui dise. Le paquet officiel Debian
# chromium-l10n de la MÊME version que le Chromium de l'image (apt vérifie sa signature), récupéré dans un conteneur
# jetable de l'image hors du réseau des navigateurs ; seul fr.pak est gardé (monté en lecture seule, navigateur.js).
LOC=/srv/fillsell-cloud/etat/chromium-locales
VCHR=$(docker run --rm --network none --entrypoint dpkg-query "$IMAGE_STEEL" -W -f '${Version}' chromium 2>/dev/null || true)
if [ -n "$VCHR" ] && [ "$(cat "$LOC/VERSION" 2>/dev/null)" != "$VCHR" ]; then
  mkdir -p "$LOC"
  docker run --rm --network bridge -u 0 -v "$LOC:/out" --entrypoint sh "$IMAGE_STEEL" -c \
    "apt-get -qq update >/dev/null && cd /tmp && apt-get -qq download chromium-l10n=$VCHR && dpkg-deb -x chromium-l10n_*.deb x \
     && cp x/usr/lib/chromium/locales/fr.pak /out/fr.pak && echo $VCHR > /out/VERSION" \
    || echo "langue française de Chromium : non récupérée (le navigateur reste en en-US pour Intl)"
fi
rm -rf /srv/fillsell-cloud/extension.nouvelle && cp -r "$P/extension" /srv/fillsell-cloud/extension.nouvelle
rm -rf /srv/fillsell-cloud/extension.ancienne && mv /srv/fillsell-cloud/extension /srv/fillsell-cloud/extension.ancienne 2>/dev/null || true
mv /srv/fillsell-cloud/extension.nouvelle /srv/fillsell-cloud/extension
cp "$P"/deploiement/{docker-compose.yml,Caddyfile,pare-feu-navigateurs.sh} /srv/fillsell-cloud/deploiement/
# (01/11) Les SEULES sorties des navigateurs (adresse:port des proxys), quand on les donne ; sinon le fichier en place.
# (03/11, point 2 de Nico) Ce n'est plus qu'un REPLI : l'orchestrateur écrit lui-même la liste des IP du pool
# (etat/proxys-permis.txt) et l'unité fillsell-pare-feu-maj.path rejoue le pare-feu dès qu'elle change.
if [ -n "$DESTINATIONS" ]; then printf '%s\n' "$DESTINATIONS" | tr ',' '\n' > /srv/fillsell-cloud/deploiement/proxys-permis.txt; fi
mkdir -p /srv/fillsell-cloud/etat
if [ -d "$P/deploiement/systemd" ]; then
  cp "$P"/deploiement/systemd/fillsell-pare-feu.service "$P"/deploiement/systemd/fillsell-pare-feu-maj.service \
     "$P"/deploiement/systemd/fillsell-pare-feu-maj.path /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable fillsell-pare-feu.service >/dev/null 2>&1 || true
  systemctl enable --now fillsell-pare-feu-maj.path >/dev/null 2>&1
fi
# (06/11 soir) La mesure continue (lecture seule de l'hôte → public.cloud_mesures, toutes les 5 min) : un serveur mesure
# dès son premier déploiement (la charge se mesure en réel, compte par compte ; l'alerte de capacité la lit).
if [ -f "$P/deploiement/mesure/fillsell-mesure.py" ]; then
  mkdir -p /srv/fillsell-cloud/mesure
  cp "$P/deploiement/mesure/fillsell-mesure.py" /srv/fillsell-cloud/mesure/
  cp "$P/deploiement/mesure/fillsell-mesure.service" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable fillsell-mesure.service >/dev/null 2>&1
  systemctl restart fillsell-mesure.service
fi
# (05/10) Les variables du fichier compose (version déployée, domaine), lues
# toutes seules par `docker compose` dans ce dossier : sans elles, tout
# `docker compose ps|exec|logs` lancé après coup (contrôles, mesure,
# `outils/ip.mjs ajouter`) s'arrêtait sur « VERSION_ORCHESTRATEUR is missing ».
# Aucun secret ici (ceux-là sont dans /srv/fillsell-cloud/.env).
printf 'VERSION_ORCHESTRATEUR=%s\nDOMAINE=%s\n' "$SHA" "$DOMAINE" > /srv/fillsell-cloud/deploiement/.env
mkdir -p /srv/fillsell-cloud/caddy/data /srv/fillsell-cloud/caddy/config /srv/fillsell-cloud/profils /srv/fillsell-cloud/etat
ENV=/srv/fillsell-cloud/.env
if [ ! -f "$ENV" ]; then
  # (06/11) Jamais env.exemple tel quel (cloud-1, compte de Nico, pool tenu) : un .env FERMÉ au nom donné, clé des
  # tickets tirée sur place. (01/11) La clé du coffre n'est PAS tirée ici : elle vient de secrets.env (étape suivante).
  [ "$NOM" != "-" ] || { echo "REFUS : aucun .env sur ce serveur et aucun nom donné (SERVEUR_NOM)" >&2; exit 1; }
  sh "$P/outils/env-premier.sh" "$P/deploiement/env.exemple" "$ENV" "$NOM"
fi
sed -i "s#^IMAGE_NAVIGATEUR=.*#IMAGE_NAVIGATEUR=$IMAGE_STEEL#; s#^DOMAINE=.*#DOMAINE=$DOMAINE#" "$ENV"
# (30/10) Le moteur Chrome : l'image du jour (le moteur reste steel tant que l'extension signée n'existe pas).
grep -q '^IMAGE_CHROME=' "$ENV" || echo 'IMAGE_CHROME=' >> "$ENV"
if [ -s /srv/fillsell-cloud/extension-crx/fillsell-cloud.crx ]; then sed -i "s#^IMAGE_CHROME=.*#IMAGE_CHROME=fillsell-chrome:$SHA#" "$ENV"; fi
docker network inspect fillsell-cloud >/dev/null 2>&1 || docker network create --driver bridge --subnet 172.31.0.0/24 -o com.docker.network.bridge.name=br-fillsell fillsell-cloud >/dev/null
sh /srv/fillsell-cloud/deploiement/pare-feu-navigateurs.sh
cd /srv/fillsell-cloud/deploiement
VERSION_ORCHESTRATEUR="$SHA" DOMAINE="$DOMAINE" docker compose up -d
echo "déployé : $SHA sur $DOMAINE"
DISTANT

RECREER=0
# (01/11) La clé du coffre et le jeton IPRoyal d'un serveur réinstallé : repris de secrets.env, par l'entrée standard,
# jamais affichés. Sans eux : une clé du coffre neuve tirée sur le serveur (version 1), le jeton laissé vide.
if $SSH "grep -q '^COFFRE_CLE=\$' /srv/fillsell-cloud/.env"; then
  if [ -f "$SECRETS" ] && grep -q '^COFFRE_CLE=.' "$SECRETS"; then
    VERSION_COFFRE="$(grep '^COFFRE_CLE_VERSION=' "$SECRETS" | head -1 | cut -d= -f2- | tr -dc '0-9')"
    grep '^COFFRE_CLE=' "$SECRETS" | head -1 | cut -d= -f2- | tr -d '\r' \
      | $SSH "read -r K && sed -i \"s#^COFFRE_CLE=.*#COFFRE_CLE=\$K#; s#^COFFRE_CLE_VERSION=.*#COFFRE_CLE_VERSION=${VERSION_COFFRE:-1}#\" /srv/fillsell-cloud/.env"
    echo "clé du coffre reprise de secrets.env, version ${VERSION_COFFRE:-1} (jamais affichée)"
  else
    $SSH 'sed -i "s#^COFFRE_CLE=.*#COFFRE_CLE=$(openssl rand -base64 32)#" /srv/fillsell-cloud/.env'
    echo "clé du coffre NEUVE tirée sur le serveur (version 1) : à mettre en lieu sûr"
  fi
  RECREER=1
fi
if $SSH "grep -q '^IPROYAL_API_TOKEN=\$' /srv/fillsell-cloud/.env" && [ -f "$SECRETS" ] && grep -q '^IPROYAL_API_TOKEN=.' "$SECRETS"; then
  grep '^IPROYAL_API_TOKEN=' "$SECRETS" | head -1 | cut -d= -f2- | tr -d '\r' \
    | $SSH "read -r J && sed -i \"s#^IPROYAL_API_TOKEN=.*#IPROYAL_API_TOKEN=\$J#\" /srv/fillsell-cloud/.env"
  echo "jeton IPRoyal repris de secrets.env (jamais affiché)"
  RECREER=1
fi
# Les clés Supabase : lues par la CLI (déjà connectée sur ce PC), jamais affichées,
# posées directement dans le .env du serveur si elles y manquent.
if $SSH "grep -q '^SUPABASE_SERVICE_ROLE_KEY=\$' /srv/fillsell-cloud/.env"; then
  CLES="$(npx supabase projects api-keys --project-ref tojihnuawsoohlolangc -o json)"
  SERVICE="$(printf '%s' "$CLES" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).find(k=>k.name==='service_role').api_key))")"
  ANON="$(printf '%s' "$CLES" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).find(k=>k.name==='anon').api_key))")"
  printf '%s\n%s\n' "$SERVICE" "$ANON" | $SSH "read -r S; read -r A; sed -i \"s#^SUPABASE_SERVICE_ROLE_KEY=.*#SUPABASE_SERVICE_ROLE_KEY=\$S#; s#^SUPABASE_ANON_KEY=.*#SUPABASE_ANON_KEY=\$A#\" /srv/fillsell-cloud/.env"
  echo "clés Supabase posées (jamais affichées)"
  RECREER=1
fi
if [ "$RECREER" = 1 ]; then
  $SSH "cd /srv/fillsell-cloud/deploiement && VERSION_ORCHESTRATEUR=$SHA DOMAINE=$DOMAINE docker compose up -d --force-recreate orchestrateur" >/dev/null
fi
echo "santé : $(curl -s --max-time 20 "https://$DOMAINE/sante" || echo 'pas encore')"
