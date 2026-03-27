# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Copy only the Nitro output
COPY --from=builder /app/.output /app/.output

# Default API base URLs — override via environment variables at runtime
ENV NUXT_PUBLIC_API_BASE=http://localhost/service/
ENV NUXT_PUBLIC_PLANNING_BASE=http://localhost:8310/api/v1/

# Nuxt Nitro listens on port 3000 by default
ENV PORT=3000
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
