# L'orchestrateur FillSell Cloud. Construit par outils/deployer.sh à partir d'un
# paquet assemblé (src/, public/ avec le client de l'app, lib/cloud-pool.js).
FROM node:22.20.0-bookworm-slim@sha256:b21fe589dfbe5cc39365d0544b9be3f1f33f55f3c86c87a76ff65a02f8f5848e
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY public ./public
COPY lib ./lib
COPY outils ./outils
USER root
CMD ["node", "src/index.js"]
