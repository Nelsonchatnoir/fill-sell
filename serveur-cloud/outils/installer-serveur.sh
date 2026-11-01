#!/usr/bin/env bash
# (01/11) LE SOCLE D'UN SERVEUR RÉINSTALLÉ À NEUF (Hetzner « rebuild » : disque effacé, même IP) — les mêmes gestes
# que deploiement/cloud-init.yaml, qu'un rebuild ne rejoue pas. Depuis le dépôt (Git Bash) :
#
#   bash serveur-cloud/outils/installer-serveur.sh <ip_du_serveur>
#
# Puis : bash serveur-cloud/outils/deployer.sh <ip> cloud.fillsell.app
set -euo pipefail
IP="${1:?ip du serveur}"
CLE="$HOME/.ssh/fillsell_cloud_ed25519"
# Un rebuild change la clé d'hôte : l'ancienne est retirée, la nouvelle acceptée une fois.
ssh-keygen -R "$IP" >/dev/null 2>&1 || true
ssh -i "$CLE" -o StrictHostKeyChecking=accept-new "root@$IP" bash -s <<'DISTANT'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
# Le premier démarrage d'une image Hetzner joue son propre cloud-init (clés SSH) : apt est pris tant qu'il tourne.
cloud-init status --wait >/dev/null 2>&1 || true
apt-get update -qq
apt-get -yq -o Dpkg::Options::=--force-confold upgrade >/dev/null
apt-get install -yq --no-install-recommends docker.io docker-compose-v2 iptables fail2ban unattended-upgrades rsync jq >/dev/null
mkdir -p /etc/ssh/sshd_config.d /etc/docker
cat > /etc/ssh/sshd_config.d/90-fillsell.conf <<'F'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
F
# Le pare-feu des navigateurs : rejoué à chaque démarrage, APRÈS docker et AVANT l'orchestrateur (qui refuse d'ouvrir
# un navigateur sans la preuve de ce démarrage-ci, /srv/fillsell-cloud/etat/pare-feu.json).
cat > /etc/systemd/system/fillsell-pare-feu.service <<'F'
[Unit]
Description=FillSell Cloud - les navigateurs ne sortent que par les proxys IPRoyal
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh /srv/fillsell-cloud/deploiement/pare-feu-navigateurs.sh
[Install]
WantedBy=multi-user.target
F
cat > /etc/docker/daemon.json <<'F'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "3" }, "live-restore": true }
F
mkdir -p /srv/fillsell-cloud/profils /srv/fillsell-cloud/extension /srv/fillsell-cloud/deploiement /srv/fillsell-cloud/caddy /srv/fillsell-cloud/etat
chmod 700 /srv/fillsell-cloud
systemctl restart ssh
systemctl enable --now docker >/dev/null 2>&1
systemctl restart docker
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
systemctl daemon-reload
systemctl enable fillsell-pare-feu.service >/dev/null 2>&1
systemctl enable --now fail2ban >/dev/null 2>&1
echo "socle posé : $(lsb_release -ds), docker $(docker version --format '{{.Server.Version}}'), $(nproc) cœurs, $(free -g | awk '/Mem/{print $2}') Go"
DISTANT
