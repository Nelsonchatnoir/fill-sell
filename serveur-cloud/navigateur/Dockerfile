# Le navigateur Cloud d'un compte : steel-browser (open source, auto-hébergé),
# ÉPINGLÉ par empreinte (jamais « latest » : une dépendance flottante, c'est une
# panne décidée par quelqu'un d'autre — règle du 23/09), avec :
#   · Xvfb : un Chromium « avec écran » (headful), plus proche d'un vrai
#     navigateur que le mode sans écran — l'image d'origine ne le démarre pas ;
#   · le français (langue de Chromium et locale) : le 26/09, Steel affichait en-US ;
#   · aucune autre modification du code de steel-browser.
# Empreinte relevée le 05/10/2026 sur ghcr.io (seule étiquette publiée : latest).
FROM ghcr.io/steel-dev/steel-browser@sha256:f5cd68fbc2cb27e5d7766269860fd0fb29cbe5fe506245a49c82f85ba210e7da

ENV LANG=fr_FR.UTF-8 LANGUAGE=fr_FR:fr LC_ALL=fr_FR.UTF-8 TZ=Europe/Paris DISPLAY=:10

RUN apt-get update -qq \
 && DEBIAN_FRONTEND=noninteractive apt-get install -yq --no-install-recommends locales fonts-noto-color-emoji \
 && sed -i 's/^# *fr_FR.UTF-8/fr_FR.UTF-8/' /etc/locale.gen && locale-gen fr_FR.UTF-8 \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# (05/10) PAS de `COPY --chmod` : il exige BuildKit, absent du docker.io
# d'Ubuntu 24.04 (pas de buildx) — le premier déploiement s'y est arrêté. Le
# fichier arrive en 644 depuis git : le droit d'exécution se pose ici.
COPY avec-ecran.sh /app/avec-ecran.sh
RUN chmod 755 /app/avec-ecran.sh
ENTRYPOINT ["/app/avec-ecran.sh"]
