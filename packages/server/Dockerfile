# Relay MCP Server Docker Image
# Multi-stage build for minimal production image

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Copy package files for dependency installation
COPY package*.json ./
COPY packages/server/package*.json ./packages/server/
COPY packages/shared/package*.json ./packages/shared/
COPY packages/ai-sdk/package*.json ./packages/ai-sdk/

# Install dependencies
RUN npm ci --include=dev

# Copy source code
COPY packages/server ./packages/server
COPY packages/shared ./packages/shared
COPY packages/ai-sdk ./packages/ai-sdk
COPY tsconfig*.json ./

# Build the server
WORKDIR /app/packages/server
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache tini

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Copy built files
COPY --from=builder /app/packages/server/dist ./dist
COPY --from=builder /app/packages/server/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Create data directory
RUN mkdir -p /app/data /app/workspace && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/relay.db
ENV WORK_DIR=/app/workspace

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start the server
CMD ["node", "dist/index.node.js"]
