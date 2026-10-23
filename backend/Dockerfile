FROM composer:2.8.12 AS vendor-prod
WORKDIR /app
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --prefer-dist --optimize-autoloader --ignore-platform-reqs

FROM composer:2.8.12 AS vendor-dev
WORKDIR /app
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-scripts --no-interaction --prefer-dist --ignore-platform-reqs

FROM php:8.4.27-fpm-alpine3.23 AS php-base
RUN apk add --no-cache \
        libzip-dev oniguruma-dev icu-dev libpng-dev libjpeg-turbo-dev freetype-dev \
        libxml2-dev curl-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" mysqli pdo_mysql mbstring intl gd zip opcache curl
WORKDIR /var/www/sol/backend
RUN mkdir -p writable/cache writable/logs writable/session writable/uploads writable/debugbar \
    && chown -R www-data:www-data writable
COPY backend/php.ini /usr/local/etc/php/conf.d/zz-sol.ini
COPY backend/docker-entrypoint.sh /usr/local/bin/sol-backend-entrypoint
RUN chmod +x /usr/local/bin/sol-backend-entrypoint
ENTRYPOINT ["sol-backend-entrypoint"]

FROM php-base AS dev
COPY backend/ ./
COPY --from=vendor-dev /app/vendor ./vendor
CMD ["php", "spark", "serve", "--host", "0.0.0.0", "--port", "8080"]

# Imagen de integración: añade herramientas de prueba (bash, python3 y curl)
# sobre el target dev. No se usa en desarrollo ni en producción.
FROM dev AS test
RUN apk add --no-cache bash python3 curl \
    && mkdir -p /tmp/opencode
CMD ["php", "spark", "serve", "--host", "0.0.0.0", "--port", "8080"]

FROM php-base AS prod
COPY backend/php.prod.ini /usr/local/etc/php/conf.d/zz-sol-prod.ini
# Solo el código y los artefactos necesarios para PHP-FPM/migraciones.
COPY backend/app ./app
COPY backend/public ./public
COPY backend/spark ./spark
COPY backend/preload.php ./preload.php
COPY backend/composer.json backend/composer.lock ./
COPY --from=vendor-prod /app/vendor ./vendor
EXPOSE 9000
CMD ["php-fpm"]
