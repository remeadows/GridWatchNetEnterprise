# GridWatch STIG Service - Multi-stage Dockerfile
# Build: docker build --target production -t gridwatch-stig .

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
RUN apk add --no-cache \
    # SSH client for remote audits
    openssh-client \
    # Build dependencies
    build-base \
    postgresql-dev \
    musl-dev \
    # WeasyPrint dependencies for PDF generation
    pango \
    gdk-pixbuf \
    libffi-dev \
    shared-mime-info \
    # XML processing
    libxml2-dev \
    libxslt-dev

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
CMD ["python", "-m", "uvicorn", "stig.main:app", "--host", "0.0.0.0", "--port", "3005", "--reload"]

# ==================================================
# Collector stage (for SSH/Netmiko audits)
# ==================================================
FROM base AS collector

RUN pip install --upgrade pip

COPY pyproject.toml README.md ./
COPY src/ ./src/
RUN pip install .

# Collector worker command
CMD ["python", "-m", "stig.collectors.nats_handler"]

# ==================================================
# Reports stage (for CKL/PDF generation)
# ==================================================
FROM base AS reports

RUN pip install --upgrade pip

COPY pyproject.toml README.md ./
COPY src/ ./src/
RUN pip install .

# Reports worker command
CMD ["python", "-m", "stig.reports.generator"]

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
RUN addgroup -g 1000 stig && \
    adduser -u 1000 -G stig -s /bin/sh -D stig

# Install minimal runtime dependencies
RUN apk add --no-cache \
    openssh-client \
    libpq \
    pango \
    gdk-pixbuf \
    shared-mime-info

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1

WORKDIR /app

# Copy wheels and install
COPY --from=builder /app/wheels /app/wheels
RUN pip install --no-cache-dir /app/wheels/*.whl && rm -rf /app/wheels

# Copy source for reference
COPY --chown=stig:stig src/ ./src/

USER stig

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:3005/healthz').raise_for_status()"

EXPOSE 3005

CMD ["python", "-m", "uvicorn", "stig.main:app", "--host", "0.0.0.0", "--port", "3005"]
