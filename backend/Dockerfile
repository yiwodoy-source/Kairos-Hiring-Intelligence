# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Only install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# SQLite data directory — mount a volume here to persist the database
RUN mkdir -p /app/data /app/logs
ENV DATABASE_SQLITE_PATH=/app/data/database.sqlite

EXPOSE 3001

# Non-root user for security
RUN addgroup -S nexus && adduser -S nexus -G nexus
RUN chown -R nexus:nexus /app
USER nexus

CMD ["node", "dist/server.js"]
