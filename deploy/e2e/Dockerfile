# Imagen mínima de pruebas E2E: Node + Chromium Headless Shell.
# El navegador se instala en /ms-playwright, fuera del repositorio.
FROM node:22-bookworm-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && npm install -g playwright-core@1.64.0 \
    && playwright-core install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/* /root/.npm

WORKDIR /e2e
