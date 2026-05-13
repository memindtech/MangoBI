# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# tzdata required for TZ env to take effect on Alpine (default = UTC)
# Keeps the container clock aligned with SQL Server (Bangkok +7); see Authorize.cs
RUN apk add --no-cache tzdata

COPY --from=build /app/.output ./.output

ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
