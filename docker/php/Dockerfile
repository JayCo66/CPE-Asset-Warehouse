FROM composer:2 AS dependencies
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-progress --prefer-dist --classmap-authoritative

FROM php:8.3-apache
RUN docker-php-ext-install pdo_mysql
COPY --from=dependencies /app/vendor /var/www/vendor
RUN printf "EnableSendfile Off\nEnableMMAP Off\n" > /etc/apache2/conf-enabled/zz-no-sendfile.conf
