# syntax=docker/dockerfile:1
FROM php:8.3-fpm-alpine AS base

RUN apk add --no-cache \
    mysql-client

RUN docker-php-ext-install \
    opcache \
    pdo_mysql

WORKDIR /var/www/html

FROM base AS production

COPY --chmod=644 index.php schema.sql ./
COPY --chmod=644 lib ./lib

# Use PHP built-in server for simplicity (or nginx-unit for production)
EXPOSE 8000

# Route *all* requests through index.php so paths like /health, /me, ... work.
CMD ["php", "-S", "0.0.0.0:8000", "-t", "/var/www/html", "index.php"]
