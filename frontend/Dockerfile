FROM node:22.23.4-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci \
    && find node_modules -type d \( -name .git -o -name .github \) -prune -exec rm -rf {} +

FROM node:22.23.4-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
COPY VERSION /VERSION
ENV SOL_VITE_ENV_DIR=false
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
