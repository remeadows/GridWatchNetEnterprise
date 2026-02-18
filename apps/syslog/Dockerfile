# GridWatch Syslog Service Dockerfile
# Multi-stage build for development and production

# ============================================
# Base stage with Python 3.13 (Alpine - CDN accessible)
# ============================================
FROM python:3.13-alpine AS base

# Security: Update system packages and install build deps
RUN apk upgrade --no-cache && \
    apk add --no-cache gcc musl-dev postgresql-dev

WORKDIR /app

# Copy and install Python dependencies
COPY pyproject.toml ./
COPY src/ ./src/
RUN pip install --no-cache-dir ".[dev]"

# ============================================
# Development stage
# ============================================
FROM base AS development

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV LOG_LEVEL=DEBUG
ENV PYTHONPATH=/app/src

# Install dev dependencies
RUN pip install --no-cache-dir watchdog

# The API service (port 3007)
CMD ["uvicorn", "syslog.main:app", "--host", "0.0.0.0", "--port", "3007", "--reload"]

# ============================================
# Collector stage (UDP 514 listener)
# ============================================
FROM base AS collector

ENV PYTHONUNBUFFERED=1
ENV LOG_LEVEL=INFO
ENV PYTHONPATH=/app/src

# Run as non-root for security (port 514 requires capabilities)
RUN adduser -u 1000 -D syslog
USER syslog

CMD ["python", "-m", "syslog.collector"]

# ============================================
# Forwarder stage
# ============================================
FROM base AS forwarder

ENV PYTHONUNBUFFERED=1
ENV LOG_LEVEL=INFO
ENV PYTHONPATH=/app/src

RUN adduser -u 1000 -D syslog
USER syslog

CMD ["python", "-m", "syslog.forwarder"]

# ============================================
# Production stage
# ============================================
FROM python:3.13-alpine AS production

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache libpq

# Copy installed packages from base
COPY --from=base /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=base /usr/local/bin /usr/local/bin

# Copy application code
COPY src/ ./src/

# Create non-root user
RUN adduser -u 1000 -D syslog
USER syslog

ENV PYTHONUNBUFFERED=1
ENV LOG_LEVEL=INFO
ENV PYTHONPATH=/app/src

CMD ["uvicorn", "syslog.main:app", "--host", "0.0.0.0", "--port", "3007"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:3007/healthz').raise_for_status()"
