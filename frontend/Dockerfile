FROM node:22.23.4-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:22.23.4-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
COPY VERSION /VERSION
ENV SOL_VITE_ENV_DIR=false
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM node:22.23.4-alpine AS build
WORKDIR /app
ARG VITE_API_URL=
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_TURNSTILE_SITE_KEY=
ENV SOL_VITE_ENV_DIR=false \
    VITE_API_URL=$VITE_API_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
COPY VERSION /VERSION
RUN npm run build

FROM nginx:1.27.5-alpine AS prod
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
