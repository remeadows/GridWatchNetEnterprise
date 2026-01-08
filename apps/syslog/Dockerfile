# NetNynja Syslog Service Dockerfile
# Multi-stage build for development and production

# ============================================
# Base stage with Python dependencies
# ============================================
FROM python:3.11-slim-bookworm as base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e ".[dev]"

# Copy source code
COPY src/ ./src/

# ============================================
# Development stage
# ============================================
FROM base as development

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV LOG_LEVEL=DEBUG

# Install dev dependencies
RUN pip install --no-cache-dir watchdog

# The API service (port 3007)
CMD ["uvicorn", "syslog.main:app", "--host", "0.0.0.0", "--port", "3007", "--reload"]

# ============================================
# Collector stage (UDP 514 listener)
# ============================================
FROM base as collector

ENV PYTHONUNBUFFERED=1
ENV LOG_LEVEL=INFO

# Run as non-root for security (port 514 requires capabilities)
RUN useradd -m -u 1000 syslog
USER syslog

CMD ["python", "-m", "syslog.collector"]

# ============================================
# Forwarder stage
# ============================================
FROM base as forwarder

ENV PYTHONUNBUFFERED=1
ENV LOG_LEVEL=INFO

RUN useradd -m -u 1000 syslog
USER syslog

CMD ["python", "-m", "syslog.forwarder"]

# ============================================
# Production stage
# ============================================
FROM python:3.11-slim-bookworm as production

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from base
COPY --from=base /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=base /usr/local/bin /usr/local/bin

# Copy application code
COPY src/ ./src/

# Create non-root user
RUN useradd -m -u 1000 syslog
USER syslog

ENV PYTHONUNBUFFERED=1
ENV LOG_LEVEL=INFO

CMD ["uvicorn", "syslog.main:app", "--host", "0.0.0.0", "--port", "3007"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:3007/healthz').raise_for_status()"
