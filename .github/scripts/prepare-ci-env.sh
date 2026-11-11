#!/usr/bin/env bash
# Prepara un .env sintético y efímero para CI. Nunca lee el .env real.
set -euo pipefail

if [ -e .env ]; then
    echo "ERROR: .env ya existe; no se sobrescribe. Use un clon limpio o un worktree temporal para CI." >&2
    exit 1
fi

cp .env.example .env
sed -i \
    -e 's|^CI_ENVIRONMENT=.*|CI_ENVIRONMENT=development|' \
    -e 's|^COMPOSE_PROJECT_NAME=.*|COMPOSE_PROJECT_NAME=sol_ci|' \
    -e 's|^DB_PASSWORD=.*|DB_PASSWORD=ci-db-password-123456|' \
    -e 's|^DB_ROOT_PASSWORD=.*|DB_ROOT_PASSWORD=ci-root-password-654321|' \
    -e 's|^jwt\.secret=.*|jwt.secret=ci-jwt-0123456789abcdef0123456789abcdef0123456789abcdef|' \
    -e 's|^encryption\.key=.*|encryption.key=ci-encryption-fedcba9876543210fedcba9876543210|' \
    -e 's|^turnstile\.enabled=.*|turnstile.enabled=false|' \
    -e 's|^turnstile\.secretKey=.*|turnstile.secretKey=|' \
    -e 's|^VITE_TURNSTILE_SITE_KEY=.*|VITE_TURNSTILE_SITE_KEY=|' \
    -e 's|^google\.clientId=.*|google.clientId=|' \
    -e 's|^VITE_GOOGLE_CLIENT_ID=.*|VITE_GOOGLE_CLIENT_ID=|' \
    -e 's|^INITIAL_ADMIN_USERNAME=.*|INITIAL_ADMIN_USERNAME=ci-admin|' \
    -e 's|^INITIAL_ADMIN_PASSWORD=.*|INITIAL_ADMIN_PASSWORD=CiAdmin123!|' \
    -e 's|^APP_URL=.*|APP_URL=http://localhost:5173|' \
    -e 's|^app\.baseURL=.*|app.baseURL=http://localhost:8080/|' \
    -e 's|^cors\.allowedOrigins=.*|cors.allowedOrigins=http://localhost:5173|' \
    -e 's|^VITE_API_URL=.*|VITE_API_URL=http://localhost:8080|' \
    -e 's|^turnstile\.hostnames=.*|turnstile.hostnames=localhost,127.0.0.1|' \
    .env
chmod 600 .env
