# (30/10, lot D — Beebs) LE NAVIGATEUR DU CLOUD : Google Chrome OFFICIEL (dépôt apt de Google), avec écran (Xvfb,
# jamais headless), en français et à l'heure de Paris — cohérent avec un vrai utilisateur français.
# Mesuré le 30/10 : le Chromium de steel-browser (Linux, « Chromium » seul, aucun WebGL, aucun lecteur PDF) est
# refusé par Beebs dès la première page, alors qu'un vrai Chrome sorti par la MÊME IP passe.
# Aucune extension anti-détection, aucun résolveur de captcha : Chrome tel que Google le livre. L'extension FillSell
# Cloud s'installe par stratégie d'entreprise (politique.json), servie en local par relais.mjs.
# DeveloperToolsAvailability = 1 : sans elle, Chrome refuse tout pilotage d'une extension installée par stratégie
# (« Target.attachToTarget : Not allowed ») — l'orchestrateur y pose la session FillSell du navigateur.
# (04/11 soir, essai GPU) Base Ubuntu 24.04 MISE À JOUR (Debian 12 avant) : le Mesa de noble-updates, celui de l'hôte
# Ubuntu 24.04 du contrôle du 04/11 16:33 (« Mesa Intel(R) UHD Graphics 770 », Mesa 25.2.x), et les polices d'un poste
# Ubuntu Desktop ordinaire (POLICES) au lieu de la liste type des conteneurs. L'uid 1000 (« ubuntu » dans l'image) devient
# « navigateur » : c'est lui qui dessine sur l'écran du bureau de l'hôte (deploiement/gpu/).
FROM ubuntu:24.04
# POLICES = celles d'ubuntu-desktop-minimal 24.04 (apt-cache depends, lu sur l'hôte d'essai le 04/11 17:33).
ARG POLICES="fontconfig fonts-dejavu-core fonts-liberation fonts-noto-cjk fonts-noto-color-emoji fonts-noto-core fonts-ubuntu"
ENV LANG=fr_FR.UTF-8 LANGUAGE=fr_FR:fr LC_ALL=fr_FR.UTF-8 TZ=Europe/Paris DISPLAY=:10 DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq && apt-get upgrade -yq \
 && apt-get install -yq --no-install-recommends ca-certificates curl gnupg xvfb socat locales tzdata nodejs libgl1-mesa-dri libegl1 libgles2 \
      $POLICES \
 && (sed -i 's/^# *fr_FR.UTF-8/fr_FR.UTF-8/' /etc/locale.gen 2>/dev/null || true) && locale-gen fr_FR.UTF-8 \
 && ln -sf /usr/share/zoneinfo/Europe/Paris /etc/localtime \
 && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google.gpg \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update -qq && apt-get install -yq --no-install-recommends google-chrome-stable \
 && apt-get clean && rm -rf /var/lib/apt/lists/* \
 && (id ubuntu >/dev/null 2>&1 && userdel -r ubuntu || true) \
 && useradd -m -u 1000 -s /bin/sh navigateur \
 && mkdir -p /etc/opt/chrome/policies/managed /extension-crx /profil && chown navigateur /profil
COPY politique.json /etc/opt/chrome/policies/managed/fillsell.json
COPY relais.mjs /relais.mjs
COPY demarrer.sh /demarrer.sh
COPY empaqueter-extension.sh /empaqueter-extension.sh
RUN chmod 755 /demarrer.sh /empaqueter-extension.sh && chmod 644 /etc/opt/chrome/policies/managed/fillsell.json /relais.mjs
USER navigateur
ENTRYPOINT ["/demarrer.sh"]
