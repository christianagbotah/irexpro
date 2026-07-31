# Cross-Platform Frontend — Staging API Integration Spec (Sprint 22, revised)

This document defines the contract between the iRexPro cross-platform frontend
apps and the verified staging backend. iRexPro is a cross-platform system with
a client/trader web app, an admin/back-office portal, a native mobile app, and
shared typed packages.

> **Verified staging backend (Sprint 21):**
> - Public API: `https://irexpro.lightworldtech.com/api/v1`
> - Local API: `http://127.0.0.1:3010/api/v1`
> - AI engine (internal only, never frontend): `http://127.0.0.1:8011/api/v1`

---

## 1. Workspace structure

```
irexpro/
├── apps/
│   ├── web/         # Next.js 14 client/trader web app (port 3005)
│   ├── admin/       # Next.js 14 admin/back-office portal (port 3006)
│   ├── mobile/      # Expo + React Native (iOS + Android)
│   └── api/         # NestJS backend (port 3010)
├── packages/
│   ├── types/       # @irexpro/types — shared frontend-safe TS types
│   └── api-client/  # @irexpro/api-client — shared typed fetch client
└── services/
    └── ai-engine/   # Python FastAPI AI engine (port 8011, internal only)
```

### 1.1 Shared packages

| Package | Purpose | Consumed by |
|---|---|---|
| `@irexpro/types` | Frontend-safe TypeScript types (no backend entities/secrets) | web, admin, mobile |
| `@irexpro/api-client` | Typed fetch client factory; reads base URL from each app's env | web, admin, mobile |

Both packages ship raw TypeScript and are transpiled by each app:
- Next.js apps use `transpilePackages: ['@irexpro/types', '@irexpro/api-client']`
  in `next.config.mjs`.
- Expo/Metro consumes them via the workspace symlink directly.

The API client factory (`createApiClient({ baseUrl, ... })`) takes the base URL
as a parameter — it NEVER reads env directly and NEVER hardcodes a URL. Each
app passes its own env var:

| App | Env var | Staging value |
|---|---|---|
| `apps/web` | `NEXT_PUBLIC_API_BASE_URL` | `https://irexpro.lightworldtech.com/api/v1` |
| `apps/admin` | `NEXT_PUBLIC_API_BASE_URL` | `https://irexpro.lightworldtech.com/api/v1` |
| `apps/mobile` | `EXPO_PUBLIC_API_BASE_URL` | `https://irexpro.lightworldtech.com/api/v1` |

---

## 2. apps/web — client/trader web app

Next.js 14 App Router + TypeScript. Binds to `127.0.0.1:3005` in production;
Nginx proxies public 443 → 3005.

**Routes (buildable, verified):**

| Route | Type | Purpose |
|---|---|---|
| `/` | Static | Landing / entry |
| `/login` | Static | Login form (posts to `/api/v1/auth/login`) |
| `/dashboard` | Static | Trader dashboard (broker, sessions, subscription) |
| `/payments/success` | Client | Stripe success redirect — **display only, never marks paid** |
| `/payments/cancel` | Static | Stripe cancel redirect — no charge |
| `/payments/callback` | Client | Paystack callback — **display only, never marks paid** |

**Env (`apps/web/.env.example` → `.env.local`):**
```
NEXT_PUBLIC_API_BASE_URL=https://irexpro.lightworldtech.com/api/v1
NEXT_PUBLIC_APP_URL=https://irexpro.lightworldtech.com
NEXT_PUBLIC_APP_ENV=staging
```

---

## 3. apps/admin — admin/back-office portal

Next.js 14 App Router + TypeScript. Binds to `127.0.0.1:3006` in production.
Can be served on the same domain under `/admin` (Nginx) or a separate admin
subdomain later.

**Routes (buildable, verified):**

| Route | Purpose |
|---|---|
| `/` | Redirects to `/admin/dashboard` |
| `/admin` | Redirects to `/admin/dashboard` |
| `/admin/login` | Admin login (ADMIN/SUPER_ADMIN RBAC enforced by backend) |
| `/admin/dashboard` | Platform overview |
| `/admin/users` | User management |
| `/admin/subscriptions` | Subscription + plan management |
| `/admin/payments` | Invoice/transaction/webhook records |
| `/admin/brokers` | Broker connections (credentials never exposed) |
| `/admin/audit` | Immutable audit trail |

**Env (`apps/admin/.env.example` → `.env.local`):**
```
NEXT_PUBLIC_API_BASE_URL=https://irexpro.lightworldtech.com/api/v1
NEXT_PUBLIC_APP_URL=https://irexpro.lightworldtech.com
NEXT_PUBLIC_APP_ENV=staging
```

---

## 4. apps/mobile — native mobile app (iOS + Android)

Expo + React Native + TypeScript. Foundation only — live trading and broker
execution are intentionally NOT implemented.

**Screens:**
- `LoginScreen` — email/password login
- `DashboardScreen` — trading overview (broker, sessions)
- `AccountScreen` — profile + security
- `PaymentsScreen` — subscription + history

**Env (`apps/mobile/.env.example` → `.env`):**
```
EXPO_PUBLIC_API_BASE_URL=https://irexpro.lightworldtech.com/api/v1
EXPO_PUBLIC_APP_ENV=staging
```

The mobile app uses a Bearer-token auth model (no cookie credentials), so the
shared client is created with `includeCredentials: false` and `getAccessToken`.

---

## 5. Payment redirect pages — critical safety rule

The three payment redirect pages (`/payments/success`, `/payments/cancel`,
`/payments/callback`) are **display-only**. They NEVER mark payments as paid.

- A user landing on `/payments/success` does NOT prove payment succeeded.
- The only source of truth is the **verified provider webhook** hitting the
  backend (`/api/v1/payments/webhooks/:provider`) with signature verification +
  amount/currency matching (Sprint 10–18 invariant).
- The pages may optionally poll a read-only backend status endpoint to reflect
  the webhook-verified state once it arrives. They never call a "mark as paid"
  endpoint (none exists, by design).

---

## 6. CORS alignment

The backend `apps/api/.env` must include the frontend origin in `CORS_ORIGINS`:
```
CORS_ORIGINS=https://irexpro.lightworldtech.com
```

In staging, web + admin + API share the same domain (`irexpro.lightworldtech.com`)
via Nginx routing, so same-origin requests do not technically need CORS — but
the backend still enforces the allowlist. If admin moves to a separate
subdomain later (e.g. `admin.irexpro.com`), add it to `CORS_ORIGINS`.

The mobile app calls the API from a device (different origin); the API must
allow the API's own public origin for CORS, and mobile attaches a Bearer token
rather than relying on cookies.

---

## 7. Secrets that must NEVER appear in frontend/mobile env

Every frontend/mobile `.env.example` documents this list explicitly:
```
AI_ENGINE_URL               — internal-only (127.0.0.1:8011); never frontend
NESTJS_INTERNAL_API_KEY     — service-to-service; never frontend
BROKER_ENCRYPTION_KEY       — backend; never frontend
DB_PASSWORD                 — PostgreSQL; backend only
JWT_SECRET                  — backend; never frontend
PAYSTACK_SECRET_KEY         — backend; never frontend (public key ok)
STRIPE_SECRET_KEY           — backend; never frontend (publishable key ok)
METAAPI_TOKEN               — backend; never frontend
```

---

## 8. Auth / session handling

- **Web/admin:** httpOnly cookies for refresh tokens; access token attached via
  `Authorization: Bearer`. `credentials: 'include'` on fetch. NEVER localStorage.
- **Mobile:** Bearer token via `getAccessToken`; no cookie credentials.

No Fovi-style localStorage auth. No demo DB fallback.

---

## 9. AI engine — never frontend

The AI engine (`127.0.0.1:8011`) is internal-only. Web, admin, and mobile must
NEVER reference `AI_ENGINE_URL` or call the AI engine directly. The NestJS API
is the only public entry point; it proxies AI-related concerns internally.

---

## 10. Related files

- `apps/web/` — client/trader web app
- `apps/admin/` — admin portal
- `apps/mobile/` — Expo mobile app
- `packages/types/` — shared types
- `packages/api-client/` — shared API client
- `apps/web/.env.example`, `apps/admin/.env.example`, `apps/mobile/.env.example`
- `infrastructure/nginx/irexpro-staging.example.conf` — Nginx routes
- `docs/runbooks/production-deployment-vps-webuzo.md` §8.4 — deployment notes
