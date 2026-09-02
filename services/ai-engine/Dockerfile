FROM python:3.11.16-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    AI_SIGNAL_MODE=paper \
    AI_ENGINE_ENV=production

WORKDIR /app

# Runtime library required by XGBoost. Build toolchains are intentionally not
# installed in the final image; Python dependencies must resolve to locked wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 irexpro \
    && useradd --system --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin irexpro

COPY requirements.lock ./requirements.lock
RUN python -m pip install --require-hashes --only-binary=:all: -r requirements.lock

COPY --chown=irexpro:irexpro app/ ./app/

USER irexpro

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/api/v1/health', timeout=2).read()"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
