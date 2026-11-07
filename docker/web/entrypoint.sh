#!/bin/sh
# ตั้ง BASE_PATH ให้ Apache แล้วเริ่ม Apache ; BASE_PATH ว่าง = เปิดที่ /
set -e

base=$(printf '%s' "${BASE_PATH:-}" | sed 's#/*$##')
conf=/etc/apache2/cpe-base-path.conf
if [ -n "$base" ]; then
    case "$base" in /*) ;; *) base="/$base" ;; esac
    if ! printf '%s' "$base" | grep -Eq '^(/[A-Za-z0-9._-]+)+$'; then
        echo "BASE_PATH ต้องเป็น path เช่น /asset-warehouse (ได้รับ: $BASE_PATH)" >&2
        exit 1
    fi
    # หน้าเว็บใช้ลิงก์แบบ relative จึงต้องมี / ท้าย path
    cat > "$conf" <<EOF
RedirectMatch 302 ^/\$ $base/
RedirectMatch 301 ^$base\$ $base/
Alias $base/ /var/www/html/
EOF
else
    : > "$conf"
fi

# volume ที่ mount ใหม่เป็นของ root ; Apache ต้องเขียนไฟล์ snapshot ได้
if [ -d "$CPE_SNAPSHOT_ARCHIVE_DIR" ]; then
    chown www-data:www-data "$CPE_SNAPSHOT_ARCHIVE_DIR"
fi

exec docker-php-entrypoint "$@"
