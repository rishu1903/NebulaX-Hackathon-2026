# Cloud Run image for the PS3 API (and the exported UI when present).
# Build context is the directory produced by stage.sh, NOT the repo root.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

# LightGBM (Rail model) needs the OpenMP runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first so this layer is cached across code changes.
COPY PS3/app/requirements.txt PS3/app/requirements.txt
RUN pip install --no-cache-dir -r PS3/app/requirements.txt

COPY PS3 PS3

RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

# Cloud Run supplies $PORT.
CMD exec uvicorn PS3.app.backend.main:app --host 0.0.0.0 --port "${PORT}"
