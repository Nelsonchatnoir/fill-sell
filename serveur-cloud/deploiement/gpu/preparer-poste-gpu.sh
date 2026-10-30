#!/bin/sh
# (30/10) LE POSTE CLOUD À VRAIE PUCE GRAPHIQUE — serveur dédié Linux (Hetzner 3100515, i7-8700 + Intel UHD 630).
# À lancer UNE fois, en root, sur l'Ubuntu 24.04 posée par installimage (USE_KERNEL_MODE_SETTING yes) :
#   ssh root@<ip> 'sh -s' < serveur-cloud/deploiement/gpu/preparer-poste-gpu.sh
# Ce que le serveur Cloud a déjà (cloud-init.yaml : Docker, pare-feu des navigateurs, SSH par clé), plus :
#   · un bureau NORMAL (XFCE sous Xorg) ouvert tout seul pour l'utilisateur « bureau » (uid 1000 = l'utilisateur
#     « navigateur » des conteneurs Chrome, qui dessinent sur CET écran par la puce Intel) ;
#   · français, heure de Paris, clavier français ;
#   · une sortie HDMI forcée par le noyau (video=HDMI-A-1:…e) : sans écran branché, la puce n'a aucune sortie
#     active et Xorg n'aurait rien sur quoi dessiner ;
#   · ni veille, ni écran de verrouillage.
# Aucune plateforme n'est visitée ici.
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -yq
apt-get install -yq docker.io docker-compose-v2 iptables fail2ban unattended-upgrades rsync jq locales
apt-get install -yq --no-install-recommends xorg xfce4 xfce4-terminal lightdm lightdm-gtk-greeter dbus-x11 \
  x11-xserver-utils mesa-utils fonts-dejavu-core

# Langue, heure, clavier.
sed -i 's/^# *fr_FR.UTF-8/fr_FR.UTF-8/' /etc/locale.gen && locale-gen fr_FR.UTF-8 >/dev/null
update-locale LANG=fr_FR.UTF-8 LANGUAGE=fr_FR:fr
timedatectl set-timezone Europe/Paris
mkdir -p /etc/X11/xorg.conf.d
cat > /etc/X11/xorg.conf.d/00-clavier.conf <<'EOF'
Section "InputClass"
  Identifier "clavier"
  MatchIsKeyboard "on"
  Option "XkbLayout" "fr"
EndSection
EOF

# L'utilisateur du bureau : uid 1000, groupes video et render (la puce).
id bureau >/dev/null 2>&1 || useradd -m -u 1000 -s /bin/bash -G video,render bureau
passwd -l bureau >/dev/null
mkdir -p /etc/lightdm/lightdm.conf.d
cat > /etc/lightdm/lightdm.conf.d/50-fillsell.conf <<'EOF'
[Seat:*]
autologin-user=bureau
autologin-session=xfce
user-session=xfce
EOF
groupadd -f autologin && usermod -aG autologin bureau
# À l'ouverture de la session : écran 1920×1080 (la sortie forcée n'a pas d'EDID : Xorg ne connaît que 1024×768),
# conteneurs Chrome (uid 1000) autorisés à dessiner, ni veille ni DPMS.
cat > /usr/local/bin/fillsell-ecran.sh <<'EOF'
#!/bin/sh
xrandr --newmode "1920x1080_60.00" 173.00 1920 2048 2248 2576 1080 1083 1088 1120 -hsync +vsync 2>/dev/null
xrandr --addmode HDMI-1 "1920x1080_60.00" 2>/dev/null
xrandr --output HDMI-1 --mode "1920x1080_60.00"
xhost +SI:localuser:bureau
xset s off -dpms s noblank
EOF
chmod 755 /usr/local/bin/fillsell-ecran.sh
mkdir -p /home/bureau/.config/autostart
cat > /home/bureau/.config/autostart/fillsell-ecran.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=FillSell — écran des navigateurs
Exec=/usr/local/bin/fillsell-ecran.sh
X-GNOME-Autostart-enabled=true
EOF
chown -R bureau:bureau /home/bureau/.config
systemctl set-default graphical.target

# Sortie HDMI forcée (aucun écran branché) : la puce dessine sur un écran 1920×1080 que le noyau tient pour présent.
# Sur GRUB_CMDLINE_LINUX : chez Hetzner, /etc/default/grub.d/hetzner.cfg RÉÉCRIT GRUB_CMDLINE_LINUX_DEFAULT (relu le 30/10).
if ! grep -q '^GRUB_CMDLINE_LINUX=.*video=HDMI-A-1' /etc/default/grub; then
  sed -i 's/^GRUB_CMDLINE_LINUX="\(.*\)"/GRUB_CMDLINE_LINUX="\1 video=HDMI-A-1:1920x1080@60e"/' /etc/default/grub
  update-grub >/dev/null 2>&1
fi

# Comme le serveur Cloud (cloud-init.yaml).
cat > /etc/ssh/sshd_config.d/90-fillsell.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
cat > /etc/systemd/system/fillsell-pare-feu.service <<'EOF'
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
EOF
mkdir -p /etc/docker
echo '{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "3" }, "live-restore": true }' > /etc/docker/daemon.json
mkdir -p /srv/fillsell-cloud/profils /srv/fillsell-cloud/extension /srv/fillsell-cloud/deploiement /srv/fillsell-cloud/caddy
chmod 700 /srv/fillsell-cloud
systemctl restart ssh
systemctl enable --now docker
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null
systemctl enable fillsell-pare-feu.service
systemctl enable --now fail2ban
echo "poste GPU préparé — redémarrer pour la sortie HDMI forcée et le bureau"
