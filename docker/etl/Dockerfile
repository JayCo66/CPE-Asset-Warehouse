# ETL + ตัว seed ฐานข้อมูลต้นทาง: Python + pandas/openpyxl (ETL) + pymysql (เขียนลง MySQL)
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8
WORKDIR /app
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
# โค้ดและข้อมูลของ repo ถูก mount ที่ /app ตอนรัน
