# Multi-stage build for minimal image size
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript, then prune dev dependencies
RUN npm run build && npm prune --omit=dev

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy built files and pruned node_modules (includes compiled native modules)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Create data directory with correct permissions before switching user
RUN mkdir -p /app/data && chown -R node:node /app/data

# Run as non-root user (Cloud Run best practice)
USER node

# Cloud Run requires PORT 8080
ENV PORT=8080
EXPOSE 8080

# Health check for Cloud Run
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]
