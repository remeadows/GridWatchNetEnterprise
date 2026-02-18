# GridWatch NPM Service - Multi-stage Dockerfile
# Build: docker build --target production -t gridwatch-npm .

# ==================================================
# Base image with Python 3.13 (Alpine - CDN accessible)
# ==================================================
FROM python:3.13-alpine AS base

# Security: Update system packages
RUN apk upgrade --no-cache

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on

# Install system dependencies
# Note: Alpine net-snmp-mibs installs standard IANA/RFC MIBs to /usr/share/snmp/mibs
RUN apk add --no-cache \
    # SNMP tools and libraries
    net-snmp-tools \
    net-snmp-dev \
    net-snmp-mibs \
    # Network tools
    iputils \
    net-tools \
    # Build dependencies
    build-base \
    postgresql-dev \
    musl-dev

WORKDIR /app

# ==================================================
# Development stage
# ==================================================
FROM base AS development

# Install development dependencies
RUN pip install --upgrade pip && \
    pip install hatch

# Copy project files
COPY pyproject.toml README.md ./
COPY src/ ./src/
RUN pip install -e ".[dev]"

# Default command for development
CMD ["python", "-m", "uvicorn", "npm.main:app", "--host", "0.0.0.0", "--port", "3004", "--reload"]

# ==================================================
# Collector stage (for SNMP/SSH polling)
# ==================================================
FROM base AS collector

RUN pip install --upgrade pip

COPY pyproject.toml README.md ./
COPY src/ ./src/
RUN pip install .

# Collector worker command (SNMPv3)
CMD ["python", "-m", "npm.collectors.snmpv3_poller"]

# ==================================================
# Alerts stage (for alert evaluation)
# ==================================================
FROM base AS alerts

RUN pip install --upgrade pip

COPY pyproject.toml README.md ./
COPY src/ ./src/
RUN pip install .

# Alert service command
CMD ["python", "-m", "npm.services.alert_service"]

# ==================================================
# Production build stage
# ==================================================
FROM base AS builder

RUN pip install --upgrade pip build

COPY pyproject.toml README.md ./
COPY src/ ./src/

RUN pip wheel --no-deps --wheel-dir /app/wheels .

# ==================================================
# Production stage
# ==================================================
FROM python:3.13-alpine AS production

# Non-root user for security
RUN addgroup -g 1000 npm && \
    adduser -u 1000 -G npm -s /bin/sh -D npm

# Install minimal runtime dependencies
RUN apk add --no-cache \
    net-snmp \
    net-snmp-libs \
    libpq

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1

WORKDIR /app

# Copy wheels and install
COPY --from=builder /app/wheels /app/wheels
RUN pip install --no-cache-dir /app/wheels/*.whl && rm -rf /app/wheels

# Copy source for reference
COPY --chown=npm:npm src/ ./src/

USER npm

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:3004/healthz').raise_for_status()"

EXPOSE 3004

CMD ["python", "-m", "uvicorn", "npm.main:app", "--host", "0.0.0.0", "--port", "3004"]
