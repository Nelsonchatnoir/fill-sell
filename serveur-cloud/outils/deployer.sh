#!/usr/bin/env bash
# Déploie FillSell Cloud sur le serveur Hetzner — depuis le dépôt (Git Bash), arbre
# PROPRE (comme npm run build : on ne déploie que du commité). Le dossier principal
# une fois feat/cloud sur main ; d'ici là le worktree Cloud (la règle « jamais depuis
# un worktree » vise l'OTA Capgo, pas ce serveur). Appelé par lancer-serveur-test.mjs.
#
#   bash serveur-cloud/outils/deployer.sh <ip_du_serveur> [domaine]
#   DESTINATIONS_PROXY="81.181.239.136:12323" bash serveur-cloud/outils/deployer.sh …   (01/11 : sorties des navigateurs)
#
# 1. assemble le paquet (orchestrateur + règles du pool + client de l'écran
#    « Me connecter » + extension Cloud construite par scripts/cloud/build-extension-cloud.mjs) ;
# 2. l'envoie, construit l'orchestrateur ; (01/11) le navigateur = steel-browser PUBLIÉ, épinglé
#    (IMAGE_STEEL_ESSAI_0111 de src/navigateur.js, l'essai qui a passé) : plus d'image dérivée construite ici ;
# 3. premier déploiement : écrit /srv/fillsell-cloud/.env (clés Supabase lues
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
$SSH bash -s -- "$SHA" "$DOMAINE" "$IMAGE_STEEL" "${DESTINATIONS_PROXY:-}" <<'DISTANT'
set -euo pipefail
SHA="$1"; DOMAINE="$2"; IMAGE_STEEL="$3"; DESTINATIONS="$4"; P="/srv/fillsell-cloud/paquets/$SHA"
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
rm -rf /srv/fillsell-cloud/extension.nouvelle && cp -r "$P/extension" /srv/fillsell-cloud/extension.nouvelle
rm -rf /srv/fillsell-cloud/extension.ancienne && mv /srv/fillsell-cloud/extension /srv/fillsell-cloud/extension.ancienne 2>/dev/null || true
mv /srv/fillsell-cloud/extension.nouvelle /srv/fillsell-cloud/extension
cp "$P"/deploiement/{docker-compose.yml,Caddyfile,pare-feu-navigateurs.sh} /srv/fillsell-cloud/deploiement/
# (01/11) Les SEULES sorties des navigateurs (adresse:port des proxys), quand on les donne ; sinon le fichier en place.
if [ -n "$DESTINATIONS" ]; then printf '%s\n' "$DESTINATIONS" | tr ',' '\n' > /srv/fillsell-cloud/deploiement/proxys-permis.txt; fi
# (05/10) Les variables du fichier compose (version déployée, domaine), lues
# toutes seules par `docker compose` dans ce dossier : sans elles, tout
# `docker compose ps|exec|logs` lancé après coup (contrôles, mesure,
# `outils/ip.mjs ajouter`) s'arrêtait sur « VERSION_ORCHESTRATEUR is missing ».
# Aucun secret ici (ceux-là sont dans /srv/fillsell-cloud/.env).
printf 'VERSION_ORCHESTRATEUR=%s\nDOMAINE=%s\n' "$SHA" "$DOMAINE" > /srv/fillsell-cloud/deploiement/.env
mkdir -p /srv/fillsell-cloud/caddy/data /srv/fillsell-cloud/caddy/config /srv/fillsell-cloud/profils /srv/fillsell-cloud/etat
ENV=/srv/fillsell-cloud/.env
if [ ! -f "$ENV" ]; then
  cp "$P/deploiement/env.exemple" "$ENV"; chmod 600 "$ENV"
  # (01/11) La clé du coffre n'est PAS tirée ici : elle vient de secrets.env (étape suivante), sinon elle y est tirée.
  sed -i "s#^TICKETS_CLE=.*#TICKETS_CLE=$(openssl rand -base64 32)#" "$ENV"
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
