FROM python:3.12-slim

WORKDIR /app

# More reliable Docker/WSL builds and cleaner Python runtime output.
ENV PIP_DEFAULT_TIMEOUT=180 \
    PIP_RETRIES=10 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

COPY backend/requirements.txt ./requirements.txt

# --prefer-binary avoids local compilation for ML dependencies where wheels exist.
# --no-cache-dir keeps the image smaller and avoids stale pip cache issues.
RUN python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install --prefer-binary --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY shared ./shared

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
