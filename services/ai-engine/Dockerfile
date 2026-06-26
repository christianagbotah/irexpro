FROM python:3.11-slim

WORKDIR /app

# System dependencies for numpy/pandas/xgboost
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./

# Install runtime deps only (no dev)
RUN pip install --no-cache-dir -e "." 2>/dev/null || pip install --no-cache-dir \
    fastapi uvicorn[standard] pydantic pydantic-settings \
    httpx redis pandas numpy scikit-learn xgboost \
    python-dotenv structlog

COPY app/ ./app/

EXPOSE 8001

# Paper mode by default — never live in container without explicit override
ENV AI_SIGNAL_MODE=paper
ENV AI_ENGINE_ENV=production

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
