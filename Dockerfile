# ─────────────────────────────────────────────────────────────────────────────
# AzureCostIQ — Dockerfile
# Multi-stage build: build frontend, then serve from Node.js (Express)
# No data leaves the container. All Azure API calls are read-only.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# Copy only production dependencies
COPY package.json ./
RUN npm install --omit=dev 2>/dev/null || npm install --production

# Copy backend server and built frontend
COPY server/ ./server/
COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R appuser:appgroup /app
USER appuser

# Azure App Service uses PORT env var
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Health check (App Service will call this)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q --spider http://localhost:8080/api/health || exit 1

CMD ["node", "server/index.js"]
