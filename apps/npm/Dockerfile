# NetNynja NPM Service - Multi-stage Dockerfile
# Build: docker build --target production -t netnynja-npm .

# ==================================================
# Base image with Python 3.11
# ==================================================
FROM python:3.11-slim-bookworm AS base

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on

# Enable non-free repository for snmp-mibs-downloader and install system dependencies
# Debian bookworm uses DEB822 format, so we modify the existing sources file
RUN sed -i 's/Components: main/Components: main non-free non-free-firmware/' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    # SNMP tools
    snmp \
    libsnmp-dev \
    snmp-mibs-downloader \
    # Network tools
    iputils-ping \
    net-tools \
    # Build dependencies
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/* \
    && download-mibs

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
FROM python:3.11-slim-bookworm AS production

# Non-root user for security
RUN groupadd --gid 1000 npm && \
    useradd --uid 1000 --gid npm --shell /bin/bash --create-home npm

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    snmp \
    libsnmp40 \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

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
