FROM php:8.2-apache

# Installation des extensions nécessaires
RUN apt-get update \
    && apt-get install -y --no-install-recommends libcurl4-openssl-dev \
    && docker-php-ext-install pdo pdo_mysql curl \
    && rm -rf /var/lib/apt/lists/*

# Activation de mod_rewrite pour Apache (si .htaccess est utilisé)
RUN a2enmod rewrite

# Autoriser les .htaccess (pour les routes propres)
RUN printf '%s\n' \
    '<Directory /var/www/html>' \
    '    AllowOverride All' \
    '</Directory>' \
    > /etc/apache2/conf-available/o-allow-override.conf \
    && a2enconf o-allow-override

# Copie des fichiers sources
COPY . /var/www/html/

# Ajustement des permissions
RUN chown -R www-data:www-data /var/www/html
