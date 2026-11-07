# เว็บหน้ารวม + API (PHP 8.3 + Apache) สำหรับ production ; ฐานข้อมูล MySQL อยู่นอก container
#   docker build -t cpe-asset-warehouse .
# วิธีรันและค่าที่ต้องตั้งอยู่ใน README.md

FROM composer:2 AS dependencies
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-progress --no-interaction --prefer-dist --classmap-authoritative

FROM php:8.3-apache AS runtime
RUN docker-php-ext-install pdo_mysql \
    && mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

ENV APP_ENV=production \
    BASE_PATH= \
    REDIS_ENABLED=false \
    CPE_TRUST_PROXY_HEADERS=false \
    CPE_SNAPSHOT_ARCHIVE_DIR=/var/lib/cpe-warehouse/snapshot-history

WORKDIR /var/www/html
COPY --from=dependencies /app/vendor ./vendor
COPY index.html hub-theme.css ./
COPY src ./src
COPY assets_api ./assets_api
COPY lib ./lib
# การนำเข้า snapshot ใช้รายการประเภท/หมวดหมู่ชุดนี้ ; ไฟล์อื่นใน data/ และ Excel ใบแจ้งซ่อมไม่เข้า image
COPY mock_api/asset_types.json mock_api/asset_categories.json ./mock_api/
COPY data/asset_utilization_data.js data/asset_inventory_utilization.json data/dw_borrow_cached.json ./data/

COPY docker/web/apache-app.conf /etc/apache2/conf-enabled/zz-app.conf
COPY docker/web/entrypoint.sh /usr/local/bin/cpe-entrypoint
RUN chmod 755 /usr/local/bin/cpe-entrypoint \
    && install -d -o www-data -g www-data "$CPE_SNAPSHOT_ARCHIVE_DIR"

# ไฟล์ snapshot ที่นำเข้าจากหน้าเว็บ ต้องคงอยู่ข้ามการสร้าง container ใหม่
VOLUME ["/var/lib/cpe-warehouse/snapshot-history"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD php -r 'exit(@file_get_contents("http://127.0.0.1" . rtrim((string)getenv("BASE_PATH"), "/") . "/index.html") === false ? 1 : 0);'

ENTRYPOINT ["cpe-entrypoint"]
CMD ["apache2-foreground"]
