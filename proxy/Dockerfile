FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

COPY shared /app/shared
COPY proxy/requirements.txt /app/proxy/requirements.txt
RUN cd /app/proxy && pip install --no-cache-dir -r requirements.txt

COPY proxy/sqlwatcher_pg_proxy.py /app/sqlwatcher_pg_proxy.py

EXPOSE 15432

CMD ["python", "-u", "sqlwatcher_pg_proxy.py"]
