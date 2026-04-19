# syntax=docker/dockerfile:1

# ── Build stage ────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Install deps (cache-friendly: copy manifests first)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Prune to prod deps only
RUN npm prune --omit=dev

# ── Runtime stage ──────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Non-root user (node is built into the node:alpine images)
USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json

# Railway / Fly set PORT at runtime; main.ts reads it.
EXPOSE 3000
CMD ["node", "dist/main.js"]
