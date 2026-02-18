# GridWatch NetEnterprise - Auth Service Dockerfile
# Multi-stage build for development and production

# ============================================
# Base stage
# ============================================
FROM node:20-alpine AS base
WORKDIR /app
# libc6-compat for compatibility, python3/make/g++ for native module compilation (argon2)
RUN apk add --no-cache libc6-compat python3 make g++

# ============================================
# Dependencies stage - install all workspace deps
# ============================================
FROM base AS deps
WORKDIR /app

# Copy root package files
COPY package.json package-lock.json turbo.json ./

# Copy workspace package.json files
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-auth/package.json ./packages/shared-auth/
COPY services/auth-service/package.json ./services/auth-service/

# Install dependencies with optimizations for CI
RUN npm ci --legacy-peer-deps && npm cache clean --force

# ============================================
# Builder stage - build shared packages and auth-service
# ============================================
FROM base AS builder
WORKDIR /app

# Copy source files first
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY packages/shared-auth ./packages/shared-auth
COPY services/auth-service ./services/auth-service

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Ensure workspace package symlinks are correct in node_modules
RUN mkdir -p node_modules/@GridWatch && \
    rm -rf node_modules/@GridWatch/shared-types node_modules/@GridWatch/shared-auth && \
    ln -s ../../packages/shared-types node_modules/@GridWatch/shared-types && \
    ln -s ../../packages/shared-auth node_modules/@GridWatch/shared-auth

# Build shared packages first, then auth-service (with increased memory for CI)
# Skip DTS generation in Docker (not needed for production runtime, avoids type resolution issues)
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build -w packages/shared-types && \
    npm run build -w packages/shared-auth && \
    cd services/auth-service && npx tsup --no-dts

# ============================================
# Development stage (uses volume mounts)
# ============================================
FROM base AS development
WORKDIR /app

# Install tsx globally for development
RUN npm install -g tsx pino-pretty

# Copy package.json for deps reference
COPY services/auth-service/package.json ./

# Remove workspace dependencies and install
RUN cat package.json | sed 's/"@GridWatch\/shared-auth": "\*",//g' | sed 's/"@GridWatch\/shared-types": "\*",//g' > package.temp.json && mv package.temp.json package.json

# Install dependencies
RUN npm install --legacy-peer-deps

EXPOSE 3006
ENV NODE_ENV=development
ENV PORT=3006

# Create symlinks at runtime for shared packages and their dependencies, then start tsx
CMD ["sh", "-c", "mkdir -p /app/node_modules/@GridWatch && ln -sf /packages/shared-auth/dist /app/node_modules/@GridWatch/shared-auth && ln -sf /packages/shared-types/dist /app/node_modules/@GridWatch/shared-types && ln -sf /app/node_modules /packages/shared-auth/node_modules && ln -sf /app/node_modules /packages/shared-types/node_modules && tsx watch src/index.ts"]

# ============================================
# Production stage
# ============================================
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3006

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 authsvc

# Copy built artifacts from builder
COPY --from=builder /app/services/auth-service/dist ./dist
COPY --from=builder /app/services/auth-service/package.json ./

# Copy node_modules first
COPY --from=builder /app/node_modules ./node_modules

# Overlay built shared packages (replacing workspace symlinks)
COPY --from=builder /app/packages/shared-types/dist ./node_modules/@GridWatch/shared-types
COPY --from=builder /app/packages/shared-auth/dist ./node_modules/@GridWatch/shared-auth

USER authsvc

EXPOSE 3006

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --spider -q http://127.0.0.1:3006/healthz || exit 1

CMD ["node", "dist/index.js"]
