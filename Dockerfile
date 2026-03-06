# =============================================================================
# DiveOps™ Production Dockerfile
# Multi-stage build for optimized container size and security
# =============================================================================
# -----------------------------------------------------------------------------
# Stage 1: Build Stage
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    postgresql-client

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Copy table.sql from node_modules to dist
RUN cp node_modules/connect-pg-simple/table.sql dist/table.sql

# Prune dev dependencies
RUN npm prune --production

# -----------------------------------------------------------------------------
# Stage 2: Production Stage
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    postgresql-client \
    curl \
    tini

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/shared ./shared

# Set environment variables
ENV NODE_ENV=production \
    PORT=5000

# Expose application port
EXPOSE 5000

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Use tini as init system (proper signal handling)
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "dist/index.cjs"]
