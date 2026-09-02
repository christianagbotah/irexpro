# syntax=docker/dockerfile:1
# Build from the repository root:
#   docker build -f apps/api/Dockerfile --target production .

FROM node:22.23.2-alpine3.24 AS base

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable \
    && corepack prepare pnpm@10.34.5 --activate

WORKDIR /workspace

# Install from the repository-controlled workspace lock. Copy only manifests
# first so dependency layers remain cacheable when application source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json

RUN pnpm install --frozen-lockfile --filter @irexpro/api...

FROM base AS development
COPY apps/api ./apps/api
WORKDIR /workspace/apps/api
EXPOSE 3000
CMD ["pnpm", "start:dev"]

FROM base AS builder
COPY apps/api ./apps/api
RUN pnpm --filter @irexpro/api build \
    && pnpm --filter @irexpro/api --prod deploy --legacy /workspace/pruned/api

FROM node:22.23.2-alpine3.24 AS production

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder --chown=node:node /workspace/pruned/api/package.json ./package.json
COPY --from=builder --chown=node:node /workspace/pruned/api/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/apps/api/dist ./dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD node -e "const p=process.env.APP_PORT||'3000'; fetch('http://127.0.0.1:'+p+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]
