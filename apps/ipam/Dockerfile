# GridWatch IPAM Service - Multi-stage Dockerfile
# Build: docker build --target production -t GridWatch-ipam .

# ==================================================
# Base image with Python 3.13 (security update)
# ==================================================
FROM python:3.13-slim-bookworm AS base

# Security: Update system packages
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Network tools for scanning
    iputils-ping \
    nmap \
    arp-scan \
    net-tools \
    # Build dependencies
    build-essential \
    libpq-dev \
    # Runtime dependencies
    libpcap0.8 \
    && rm -rf /var/lib/apt/lists/*

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
CMD ["python", "-m", "uvicorn", "ipam.main:app", "--host", "0.0.0.0", "--port", "3003", "--reload"]

# ==================================================
# Scanner stage (for network discovery)
# ==================================================
FROM base AS scanner

# Scanner needs elevated privileges for raw sockets
# Note: Container should be run with --cap-add=NET_RAW

RUN pip install --upgrade pip

COPY pyproject.toml README.md ./
COPY src/ ./src/
RUN pip install .

# Scanner worker command
CMD ["python", "-m", "ipam.collectors.nats_handler"]

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
FROM python:3.13-slim-bookworm AS production

# Non-root user for security
RUN groupadd --gid 1000 ipam && \
    useradd --uid 1000 --gid ipam --shell /bin/bash --create-home ipam

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    iputils-ping \
    libpq5 \
    libpcap0.8 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1

WORKDIR /app

# Copy wheels and install
COPY --from=builder /app/wheels /app/wheels
RUN pip install --no-cache-dir /app/wheels/*.whl && rm -rf /app/wheels

# Copy source for reference (optional, can be removed for smaller image)
COPY --chown=ipam:ipam src/ ./src/

USER ipam

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:3003/healthz').raise_for_status()"

EXPOSE 3003

CMD ["python", "-m", "uvicorn", "ipam.main:app", "--host", "0.0.0.0", "--port", "3003"]
