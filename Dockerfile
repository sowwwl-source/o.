FROM php:8.2-apache

# Installation des extensions nécessaires
RUN apt-get update \
    && apt-get install -y --no-install-recommends libcurl4-openssl-dev \
    && docker-php-ext-install pdo pdo_mysql curl \
    && rm -rf /var/lib/apt/lists/*

# Activation de mod_rewrite pour Apache (si .htaccess est utilisé)
RUN a2enmod rewrite

# Autoriser les .htaccess (pour les routes propres)
RUN sed -i '/<Directory \\/var\\/www\\/>/,/<\\/Directory>/ s/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf

# Copie des fichiers sources
COPY . /var/www/html/

# Ajustement des permissions
RUN chown -R www-data:www-data /var/www/html
