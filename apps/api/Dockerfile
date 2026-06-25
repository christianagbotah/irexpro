# iRexPro API Dockerfile
# Multi-stage build: development and production targets

FROM node:22-alpine AS base
RUN npm install -g pnpm
WORKDIR /app
COPY package.json ./
RUN pnpm install --frozen-lockfile

# ─── Development ────────────────────────────────────────────────────────────
FROM base AS development
COPY . .
EXPOSE 3000
CMD ["pnpm", "start:dev"]

# ─── Build ──────────────────────────────────────────────────────────────────
FROM base AS builder
COPY . .
RUN pnpm build

# ─── Production ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS production
RUN npm install -g pnpm
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY package.json ./
RUN pnpm install --prod --frozen-lockfile

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
USER nestjs

EXPOSE 3000
CMD ["node", "dist/main"]
