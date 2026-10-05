#!/usr/bin/env bash
# Déploie FillSell Cloud sur le serveur Hetzner — depuis le dépôt (Git Bash), arbre
# PROPRE (comme npm run build : on ne déploie que du commité). Le dossier principal
# une fois feat/cloud sur main ; d'ici là le worktree Cloud (la règle « jamais depuis
# un worktree » vise l'OTA Capgo, pas ce serveur). Appelé par lancer-serveur-test.mjs.
#
#   bash serveur-cloud/outils/deployer.sh <ip_du_serveur> [domaine]
#
# 1. assemble le paquet (orchestrateur + règles du pool + client de l'écran
#    « Me connecter » + extension Cloud construite par scripts/cloud/build-extension-cloud.mjs) ;
# 2. l'envoie, construit les deux images (navigateur épinglé, orchestrateur) ;
# 3. premier déploiement : écrit /srv/fillsell-cloud/.env (clés Supabase lues
#    par la CLI sans affichage ; clés du coffre et des tickets générées SUR le serveur) ;
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
PAQUET="$RACINE/build/cloud-paquet-$SHA"
rm -rf "$PAQUET" && mkdir -p "$PAQUET/lib" "$PAQUET/public"
cp -r serveur-cloud/{package.json,package-lock.json,Dockerfile,src,outils,navigateur,deploiement} "$PAQUET/"
cp serveur-cloud/public/* "$PAQUET/public/"
cp supabase/functions/_shared/cloud-pool.js "$PAQUET/lib/cloud-pool.js"
cp src/cloud/connexion/clientConnexion.js "$PAQUET/public/clientConnexion.js"
[ -f build/extension-cloud/manifest.json ] || node scripts/cloud/build-extension-cloud.mjs
cp -r build/extension-cloud "$PAQUET/extension"

echo "→ envoi du paquet $SHA"
$SSH "mkdir -p /srv/fillsell-cloud/paquets && rm -rf /srv/fillsell-cloud/paquets/$SHA"
scp -i "$CLE" -q -r "$PAQUET" "root@$IP:/srv/fillsell-cloud/paquets/$SHA"

echo "→ images, extension, configuration, pare-feu"
$SSH bash -s -- "$SHA" "$DOMAINE" <<'DISTANT'
set -euo pipefail
SHA="$1"; DOMAINE="$2"; P="/srv/fillsell-cloud/paquets/$SHA"
docker build -q -t "fillsell-navigateur:$SHA" "$P/navigateur" >/dev/null
docker build -q -t "fillsell-orchestrateur:$SHA" "$P" >/dev/null
rm -rf /srv/fillsell-cloud/extension.nouvelle && cp -r "$P/extension" /srv/fillsell-cloud/extension.nouvelle
rm -rf /srv/fillsell-cloud/extension.ancienne && mv /srv/fillsell-cloud/extension /srv/fillsell-cloud/extension.ancienne 2>/dev/null || true
mv /srv/fillsell-cloud/extension.nouvelle /srv/fillsell-cloud/extension
cp "$P"/deploiement/{docker-compose.yml,Caddyfile,pare-feu-navigateurs.sh} /srv/fillsell-cloud/deploiement/
# (05/10) Les variables du fichier compose (version déployée, domaine), lues
# toutes seules par `docker compose` dans ce dossier : sans elles, tout
# `docker compose ps|exec|logs` lancé après coup (contrôles, mesure,
# `outils/ip.mjs ajouter`) s'arrêtait sur « VERSION_ORCHESTRATEUR is missing ».
# Aucun secret ici (ceux-là sont dans /srv/fillsell-cloud/.env).
printf 'VERSION_ORCHESTRATEUR=%s\nDOMAINE=%s\n' "$SHA" "$DOMAINE" > /srv/fillsell-cloud/deploiement/.env
mkdir -p /srv/fillsell-cloud/caddy/data /srv/fillsell-cloud/caddy/config /srv/fillsell-cloud/profils
ENV=/srv/fillsell-cloud/.env
if [ ! -f "$ENV" ]; then
  cp "$P/deploiement/env.exemple" "$ENV"; chmod 600 "$ENV"
  sed -i "s#^COFFRE_CLE=.*#COFFRE_CLE=$(openssl rand -base64 32)#; s#^TICKETS_CLE=.*#TICKETS_CLE=$(openssl rand -base64 32)#" "$ENV"
fi
sed -i "s#^IMAGE_NAVIGATEUR=.*#IMAGE_NAVIGATEUR=fillsell-navigateur:$SHA#; s#^DOMAINE=.*#DOMAINE=$DOMAINE#" "$ENV"
docker network inspect fillsell-cloud >/dev/null 2>&1 || docker network create --driver bridge --subnet 172.31.0.0/24 -o com.docker.network.bridge.name=br-fillsell fillsell-cloud >/dev/null
sh /srv/fillsell-cloud/deploiement/pare-feu-navigateurs.sh
cd /srv/fillsell-cloud/deploiement
VERSION_ORCHESTRATEUR="$SHA" DOMAINE="$DOMAINE" docker compose up -d
echo "déployé : $SHA sur $DOMAINE"
DISTANT

# Les clés Supabase : lues par la CLI (déjà connectée sur ce PC), jamais affichées,
# posées directement dans le .env du serveur si elles y manquent.
if $SSH "grep -q '^SUPABASE_SERVICE_ROLE_KEY=$' /srv/fillsell-cloud/.env"; then
  CLES="$(npx supabase projects api-keys --project-ref tojihnuawsoohlolangc -o json)"
  SERVICE="$(printf '%s' "$CLES" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).find(k=>k.name==='service_role').api_key))")"
  ANON="$(printf '%s' "$CLES" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).find(k=>k.name==='anon').api_key))")"
  printf '%s\n%s\n' "$SERVICE" "$ANON" | $SSH "read -r S; read -r A; sed -i \"s#^SUPABASE_SERVICE_ROLE_KEY=.*#SUPABASE_SERVICE_ROLE_KEY=\$S#; s#^SUPABASE_ANON_KEY=.*#SUPABASE_ANON_KEY=\$A#\" /srv/fillsell-cloud/.env && cd /srv/fillsell-cloud/deploiement && VERSION_ORCHESTRATEUR=$SHA DOMAINE=$DOMAINE docker compose up -d --force-recreate orchestrateur"
  echo "clés Supabase posées (jamais affichées)"
fi
echo "santé : $(curl -s --max-time 20 "https://$DOMAINE/sante" || echo 'pas encore')"
