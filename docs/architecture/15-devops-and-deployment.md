# 15 — DevOps and Deployment

## iRexPro — Infrastructure, CI/CD, and Deployment Architecture

---

## 1. Purpose

This document defines the DevOps strategy, infrastructure topology, CI/CD pipeline design, containerisation approach, environment strategy, and deployment procedures for iRexPro.

---

## 2. Infrastructure Philosophy

| Principle | Implementation |
|---|---|
| **Infrastructure as Code** | Docker Compose (dev), Kubernetes manifests (prod) |
| **Environment parity** | Dev, staging, and production use the same container images |
| **Immutable deployments** | Container images built once, promoted across environments |
| **Automated pipelines** | No manual deployments to staging or production |
| **Rollback-ready** | Every deployment tagged; rollback to previous image available in < 5 minutes |
| **Secrets not in code** | All secrets injected via environment variables or secret managers |

---

## 3. Repository Structure

```
irexpro/
├── apps/
│   ├── web/                    # Next.js web application
│   ├── mobile/                 # React Native mobile app
│   ├── admin/                  # Next.js admin dashboard
│   └── api/                    # NestJS backend API
├── services/
│   ├── market-data/            # Python FastAPI market data service
│   ├── signal-engine/          # Python FastAPI AI signal engine
│   ├── strategy-orchestrator/  # Python FastAPI strategy orchestrator
│   ├── backtesting/            # Python FastAPI backtesting service
│   └── model-registry/         # Python FastAPI model registry
├── packages/
│   ├── shared-types/           # Shared TypeScript types
│   ├── shared-ui/              # Shared UI component library
│   └── shared-utils/           # Shared utility functions
├── infrastructure/
│   ├── docker/                 # Dockerfiles
│   ├── kubernetes/             # K8s manifests
│   ├── nginx/                  # Nginx configuration
│   └── scripts/                # Deployment and maintenance scripts
├── docs/                       # Architecture documentation
└── .github/
    └── workflows/              # GitHub Actions CI/CD pipelines
```

---

## 4. Containerisation

### 4.1 Container Images

Each service has its own Dockerfile:

**NestJS API (Production)**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER appuser
EXPOSE 3000
CMD ["node", "dist/main"]
```

**Python AI Service (Production)**

```dockerfile
FROM python:3.11-slim AS base
WORKDIR /app
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
USER appuser
EXPOSE 8002
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "2"]
```

### 4.2 Docker Compose (Development)

```yaml
version: '3.9'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: irexpro_dev
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  api:
    build: ./apps/api
    environment:
      NODE_ENV: development
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      JWT_PRIVATE_KEY: ${JWT_PRIVATE_KEY}
    depends_on: [postgres, redis]
    ports: ["3000:3000"]

  signal-engine:
    build: ./services/signal-engine
    environment:
      REDIS_URL: ${REDIS_URL}
      DATABASE_URL: ${DATABASE_URL}
    depends_on: [redis, postgres]
    ports: ["8002:8002"]

  # ... other services

volumes:
  postgres_data:
```

---

## 5. Environments

| Environment | Purpose | Deployment Trigger |
|---|---|---|
| **Development** | Local developer machine | Manual (docker compose up) |
| **CI** | Automated test runs | Every push to any branch |
| **Staging** | Pre-production integration testing | Merge to `develop` branch |
| **Production** | Live platform | Merge to `main` branch + manual approval |

### 5.1 Environment-Specific Broker Mode

| Environment | Broker Mode |
|---|---|
| Development | Broker sandbox (demo) |
| CI | Mocked broker adapter |
| Staging | Broker sandbox (demo) |
| Production | Broker live |

**Live broker access is never enabled in any environment except production.**

---

## 6. CI/CD Pipeline — GitHub Actions

### 6.1 Pipeline Overview

```
On push to any branch:
  ├── Code quality checks
  │   ├── ESLint (TypeScript)
  │   ├── Prettier format check
  │   ├── Ruff / Black (Python)
  │   └── Secret scanning (TruffleHog)
  │
  ├── Security scanning
  │   ├── npm audit
  │   ├── pip audit
  │   └── Semgrep SAST
  │
  └── Unit tests
      ├── NestJS unit tests (Jest)
      └── Python unit tests (pytest)

On push to develop branch (after above passes):
  ├── Integration tests
  │   ├── API integration tests (supertest)
  │   └── Service integration tests
  │
  ├── Build container images
  │   ├── Tag: develop-{git-sha}
  │   └── Push to container registry
  │
  └── Deploy to staging
      ├── Run database migrations
      ├── Deploy new images
      └── Health check validation

On push to main branch (after above + manual approval):
  ├── Build production images
  │   ├── Tag: v{semver} + latest
  │   └── Push to production registry
  │
  ├── Deploy to production
  │   ├── Run database migrations
  │   ├── Canary deployment (10% traffic)
  │   ├── Monitor for 10 minutes
  │   └── Full rollout if healthy
  │
  └── Post-deployment validation
      ├── Health check all services
      ├── Smoke test critical user journeys
      └── Alert team on Slack
```

### 6.2 Key GitHub Actions Workflow Files

```
.github/workflows/
├── ci.yml              # Runs on every push: lint, test, security scan
├── staging-deploy.yml  # Runs on develop merge: build + deploy to staging
├── production-deploy.yml # Runs on main merge: build + deploy to production
├── rollback.yml        # Manual trigger: roll back to specified image tag
└── migration.yml       # Manual trigger: run database migrations only
```

---

## 7. Database Migrations

### 7.1 Migration Workflow

```
Development:
  npm run migration:generate -- -n DescriptiveName
  npm run migration:run

Staging (automated in CI):
  migration:run (runs pending migrations before new image deployment)

Production:
  1. Migration is reviewed and approved in PR
  2. Migration tested on staging first
  3. Production migration runs in CI before rolling out new app version
  4. Destructive migrations require a pre-approved maintenance window
```

### 7.2 Migration Safety Rules

- Additive changes (add column, add table) are always safe with zero downtime
- Column renames require a three-step deploy: add new column → backfill → remove old column
- Never drop a column in the same deploy that removes it from the codebase
- All migrations must be reversible (down migration must exist)

---

## 8. Production Infrastructure (Target)

### 8.1 Cloud Provider

Cloud-agnostic by design. Initial deployment targets AWS:

| Service | AWS Resource |
|---|---|
| Container orchestration | ECS Fargate (Phase 1) / EKS (Phase 2) |
| Database | RDS PostgreSQL (Multi-AZ) |
| Cache | ElastiCache Redis (Multi-AZ) |
| Secret management | AWS Secrets Manager + KMS |
| Container registry | ECR |
| Load balancer | Application Load Balancer (ALB) |
| DNS | Route 53 |
| CDN | CloudFront (for web app static assets) |
| File storage | S3 |
| Logs | CloudWatch Logs |
| Monitoring | CloudWatch + Grafana Cloud |

### 8.2 Network Topology

```
Internet
  → CloudFront CDN (web app static assets)
  → Route 53 → ALB (TLS termination)
    → API containers (NestJS) — private subnet
    → AI service containers (Python) — private subnet
  
  Private subnet only:
    → RDS PostgreSQL (Multi-AZ)
    → ElastiCache Redis
```

All database and cache instances are in private subnets with no public internet access. Application containers communicate with databases via VPC internal routing only.

---

## 9. Kubernetes Readiness (Phase 2)

Kubernetes manifests will be maintained in `infrastructure/kubernetes/`:

```yaml
# Example: NestJS API deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: irexpro-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: irexpro-api
  template:
    spec:
      containers:
        - name: api
          image: ${ECR_REGISTRY}/irexpro-api:${IMAGE_TAG}
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
```

---

## 10. Rollback Procedure

### Automated Rollback Triggers

- Deployment health check fails → automatic rollback to previous image
- Error rate spike (> 5% 5xx errors in 5 minutes post-deploy) → automatic rollback

### Manual Rollback

```bash
# Trigger manual rollback via GitHub Actions
# Specify: environment, service, target image tag
gh workflow run rollback.yml \
  -f environment=production \
  -f service=api \
  -f image_tag=v1.2.3
```

### Rollback Time Target

- Canary rollback: < 2 minutes
- Full deployment rollback: < 5 minutes
- Database migration rollback: < 30 minutes (manual, requires DBA review)

---

## 11. Environment Variables

All environment-specific configuration is injected via environment variables. No environment-specific config lives in the codebase:

```
# .env.example (committed — no real values)
NODE_ENV=
DATABASE_URL=
REDIS_URL=
JWT_PRIVATE_KEY=
JWT_PUBLIC_KEY=
BROKER_KMS_KEY_ID=
MFA_ENCRYPTION_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SIGNAL_ENGINE_URL=
STRATEGY_ORCHESTRATOR_URL=
SENTRY_DSN=
```
