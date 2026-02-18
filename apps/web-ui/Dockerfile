# GridWatch NetEnterprise - Web UI Dockerfile
# Multi-stage build for development and production

# ============================================
# Base stage
# ============================================
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ============================================
# Dependencies stage - install all workspace deps
# ============================================
FROM base AS deps
WORKDIR /app

# Copy root package files
COPY package.json package-lock.json turbo.json ./

# Copy workspace package.json files
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-ui/package.json ./packages/shared-ui/
COPY apps/web-ui/package.json ./apps/web-ui/

# Install dependencies with optimizations for CI
RUN npm ci --legacy-peer-deps && npm cache clean --force

# ============================================
# Builder stage - build shared packages and web-ui
# ============================================
FROM base AS builder
WORKDIR /app

# Copy source files first
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY packages/shared-ui ./packages/shared-ui
COPY apps/web-ui ./apps/web-ui

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Ensure workspace package symlinks are correct in node_modules
RUN mkdir -p node_modules/@gridwatch && \
    rm -rf node_modules/@gridwatch/shared-types node_modules/@gridwatch/shared-ui && \
    ln -s ../../packages/shared-types node_modules/@gridwatch/shared-types && \
    ln -s ../../packages/shared-ui node_modules/@gridwatch/shared-ui

# Build shared packages first, then web-ui (with increased memory for CI)
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN npm run build -w packages/shared-types && \
    npm run build -w packages/shared-ui && \
    npm run build -w apps/web-ui

# ============================================
# Development stage (uses volume mounts)
# ============================================
FROM base AS development
WORKDIR /app

# Copy package.json for deps reference
COPY apps/web-ui/package.json ./

# Create a modified package.json without workspace dependencies for container build
RUN cat package.json | sed 's/"@gridwatch\/shared-types": "\*",//g' | sed 's/"@gridwatch\/shared-ui": "\*",//g' > package.temp.json && mv package.temp.json package.json

# Install all dependencies including dev deps
RUN npm install --legacy-peer-deps

EXPOSE 3000
ENV NODE_ENV=development

# Create symlinks at runtime (after volume mounts) and start vite
CMD ["sh", "-c", "ln -sf /app/node_modules /packages/shared-ui/node_modules 2>/dev/null; ln -sf /app/node_modules /packages/shared-types/node_modules 2>/dev/null; npx vite --host 0.0.0.0 --port 3000"]

# ============================================
# Production stage (nginx)
# ============================================
FROM nginx:1.25-alpine AS production

# Copy built assets from builder
COPY --from=builder /app/apps/web-ui/dist/ /usr/share/nginx/html/

# Create nginx config for SPA routing
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /api { \
        proxy_pass http://gateway:3001; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Create non-root user permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --spider -q http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
