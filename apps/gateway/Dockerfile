# NetNynja Enterprise - API Gateway Dockerfile
# Development stage uses volume mounts from docker-compose

# ============================================
# Base stage
# ============================================
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ============================================
# Development stage (uses volume mounts)
# ============================================
FROM base AS development
WORKDIR /app

# Install nmap for network scanning and tsx globally for development
RUN apk add --no-cache nmap nmap-scripts && \
    npm install -g tsx pino-pretty

# Copy package.json for deps reference
COPY package.json ./

# Remove workspace dependencies and install
RUN cat package.json | sed 's/"@netnynja\/shared-auth": "\*",//g' | sed 's/"@netnynja\/shared-types": "\*",//g' > package.temp.json && mv package.temp.json package.json

# Install dependencies
RUN npm install --legacy-peer-deps

EXPOSE 3001
ENV NODE_ENV=development
ENV PORT=3001

# Create symlinks at runtime for shared packages and their dependencies, then start tsx
CMD ["sh", "-c", "mkdir -p /app/node_modules/@netnynja && ln -sf /packages/shared-auth/dist /app/node_modules/@netnynja/shared-auth && ln -sf /packages/shared-types/dist /app/node_modules/@netnynja/shared-types && ln -sf /app/node_modules /packages/shared-auth/node_modules && ln -sf /app/node_modules /packages/shared-types/node_modules && tsx watch src/index.ts"]

# ============================================
# Build stage (for production)
# ============================================
FROM base AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --ignore-scripts 2>/dev/null || true
COPY src ./src
COPY tsup.config.ts tsconfig.json ./
RUN npm run build 2>/dev/null || echo "Build requires shared packages"

# ============================================
# Production stage
# ============================================
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 gateway

COPY --from=builder /app/dist ./dist 2>/dev/null || true
COPY --from=builder /app/node_modules ./node_modules 2>/dev/null || true
COPY package.json ./

USER gateway

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --spider -q http://localhost:3001/healthz || exit 1

CMD ["node", "dist/index.js"]
