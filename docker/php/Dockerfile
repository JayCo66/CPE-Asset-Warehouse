# ใช้ร่วมกัน 2 service: source-api (assets_api ของระบบครุภัณฑ์) และ warehouse-api (API ของ dashboard)
FROM php:8.3-apache
RUN docker-php-ext-install pdo_mysql
# ไฟล์ที่ mount จากเครื่อง Windows: sendfile/mmap ของ Apache ส่งเนื้อหาเก่าหลังไฟล์ถูกแก้ จึงปิดไว้
RUN printf "EnableSendfile Off\nEnableMMAP Off\n" > /etc/apache2/conf-enabled/zz-no-sendfile.conf
# โค้ด PHP ถูก mount ตอนรัน (แก้ไฟล์แล้วเรียกใหม่ได้เลย ไม่ต้อง build ใหม่)
