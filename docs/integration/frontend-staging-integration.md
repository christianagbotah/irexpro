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
- **Remember me (Sprint 27):** `rememberMe` boolean on login/register controls
  the httpOnly refresh cookie maxAge. `true` → 7-day persistent cookie; `false`
  → session cookie (cleared on browser close). Access token always in memory.
  No localStorage/sessionStorage for any token.
- **Phone registration (Sprint 27):** registration supports email OR phone (at
  least one required). Login uses `identifier` field (accepts email or phone).
  Country code selector defaults to Ghana (+233). Phone stored in `User.phone`
  column (already existed). Email made nullable via migration
  `1751700000000-MakeEmailNullableForPhoneRegistration`. Phone normalized to
  E.164-like format via `normalizePhone()` utility (strips spaces/dashes,
  handles local with calling code, handles international with +, handles 00
  prefix). DB-level partial unique index `ux_users_phone` on `identity.users(phone)`
  WHERE `phone IS NOT NULL AND phone <> ''`. Login label says "Email or
  international phone number" to clarify accepted format.
- **iRexPro is NOT a wallet app:** users do not deposit/withdraw money into
  iRexPro. Trading relies on the user's broker account balance. Broker account
  funding/withdrawal happens through the broker, not through iRexPro.
  Payment/subscription modules are for platform billing (subscription fees +
  performance fees), not for user fund custody.

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

---

## 11. Modern UI/UX foundation + forgot-password flow (Sprint 26)

Sprint 26 adds a modern, professional, responsive UI/UX design system across
web, admin, and mobile, plus safe forgot-password/reset-password UI foundations.

### 11.1 UI/UX foundation added

- **Design system:** enterprise fintech palette (teal/slate for web, amber for
  admin), spacing scale, shadows, typography, responsive layouts.
- **UI primitives:** Button, Input, Card, Alert, Badge, LoadingSpinner,
  EmptyState, AuthLayout (split-screen), DashboardShell (sidebar + header).
- **Web redesign:** `/login`, `/register`, `/dashboard` — split-screen auth
  layout, dashboard shell with sidebar.
- **Admin redesign:** `/admin/login`, `/admin/dashboard` — admin identity with
  amber accent, stat cards grid, management cards.
- **Mobile polish:** improved LoginScreen, DashboardScreen, AccountScreen,
  PaymentsScreen styling.

### 11.2 Forgot-password pages (safe generic messages)

- **Web:** `/forgot-password` — accepts email, shows safe generic message:
  "If an account exists for this email, password reset instructions will be
  sent once password recovery is enabled."
- **Admin:** `/admin/forgot-password` — same safe generic message.
- **Mobile:** `ForgotPasswordScreen` — same safe generic message.
- Does NOT disclose whether the email exists.

### 11.3 Reset-password pages (placeholder — no fake reset)

- **Web:** `/reset-password` — shows a "coming soon" notice only. Password
  fields are disabled. No password is accepted or processed. No success message
  that implies the password was changed.
- **Admin:** `/admin/reset-password` — same placeholder notice.
- These pages will be activated once the backend password reset endpoints are
  implemented.

### 11.4 Backend endpoints currently missing

The backend does NOT yet have:
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

The audit-action enum already has `USER_PASSWORD_RESET_REQUESTED` and
`USER_PASSWORD_RESET_COMPLETED` (planned, not yet implemented).

### 11.5 Next backend requirement

The next backend sprint must implement secure password reset:
- `POST /auth/forgot-password` — generates a time-limited reset token, sends
  reset link via email (or SMS), returns generic success (never reveals whether
  the email exists).
- `POST /auth/reset-password` — accepts reset token + new password, verifies
  token, updates password hash (argon2), invalidates token, audits the action.
- Reset tokens must NOT be stored in localStorage/sessionStorage.
- The backend remains the source of truth for all password changes.

Until the backend endpoints are implemented, the frontend reset-password pages
are placeholders only — they do not accept or process password input.


\## 12. Admin portal access control + first admin bootstrap (hotfix)

### 12.1 Admin sidebar visibility rules

The admin portal uses Next.js App Router route groups to separate public auth
routes from protected admin routes:

- `(auth)/` group — public admin auth routes. Bare layout, NO sidebar:
  - `/admin/login`
  - `/admin/forgot-password`
  - `/admin/reset-password`

- `(protected)/` group — authenticated admin routes. Uses
  `AdminProtectedLayout` with a 4-state guard:
  - `/admin/dashboard`
  - `/admin/users`
  - `/admin/brokers`
  - `/admin/payments`
  - `/admin/subscriptions`
  - `/admin/audit`

Guard states (in order):
1. `restoring === true` → loading state. No sidebar, no "Not signed in".
2. `!user` → "Not signed in" card with link to `/admin/login`. No sidebar.
3. `user && !hasAdminRole` → "Access denied" card with sign-out. No sidebar.
4. `user && hasAdminRole` → full admin shell (sidebar + nav + content).

`AdminNav` is also role-aware (returns `null` if `!hasAdminRole`) as defense
in depth. The backend `RolesGuard` is the real security boundary.

### 12.2 Admin backend route protection

All admin backend endpoints require JWT auth (`JwtAuthGuard` is global) AND
`@Roles(ADMIN, SUPER_ADMIN)` + `@UseGuards(RolesGuard)`:

- `GET /admin/users`, `GET /admin/users/:id`
- `POST /subscriptions/dev/manual-activate`
- All `performance-billing`, `broker-reconciliation`, `performance-fees` admin endpoints

A normal `USER` role receives 403 Forbidden from the backend regardless of
what the frontend shows.

### 12.3 No default admin account

There is NO default admin account. No `admin/admin`, no `admin@example.com`
hardcoded credentials. Admin accounts are NEVER created via a public HTTP
endpoint. There is no `/admin/register` route.

### 12.4 Creating the first admin on the VPS

Run the bootstrap CLI command on the VPS (requires the API `.env` to be
present with database + JWT + cookie + broker encryption secrets):

```bash
cd /path/to/irexpro
pnpm install
pnpm --filter @irexpro/api build

# Set bootstrap env vars (in .env or exported in the shell)
export BOOTSTRAP_ADMIN_EMAIL="admin@yourdomain.com"
export BOOTSTRAP_ADMIN_PASSWORD="ChangeMeToAStrongPassword123!"  # min 12 chars, letters + numbers
export BOOTSTRAP_ADMIN_FIRST_NAME="Platform"
export BOOTSTRAP_ADMIN_LAST_NAME="Admin"
export BOOTSTRAP_ADMIN_COUNTRY_CODE="GH"

# Run the bootstrap (reads env, never argv)
pnpm --filter @irexpro/api seed:admin
```

Required env vars:
- `BOOTSTRAP_ADMIN_PASSWORD` — min 12 chars, must contain letters + numbers
- `BOOTSTRAP_ADMIN_EMAIL` OR `BOOTSTRAP_ADMIN_PHONE` — at least one required
- `JWT_SECRET`, `COOKIE_SECRET`, `BROKER_ENCRYPTION_KEY`, `DB_*` — required by app config

Optional env vars:
- `BOOTSTRAP_ADMIN_FIRST_NAME`, `BOOTSTRAP_ADMIN_LAST_NAME`, `BOOTSTRAP_ADMIN_COUNTRY_CODE`

Behavior:
- Creates `USER`, `ADMIN`, `SUPER_ADMIN` roles if missing (find-or-create).
- If a user with the email/phone already exists, promotes them to `SUPER_ADMIN`
  (does NOT change their password).
- If no matching user exists, creates a new `SUPER_ADMIN` user with an
  argon2-hashed password and `ACTIVE` status.
- Idempotent: running twice is safe (no duplicate roles or user_roles).
- NEVER logs the raw password.
- NEVER exposed as an HTTP endpoint.

After bootstrapping, the admin can sign in at
`https://irexproadmin.lightworldtech.com/admin/login`.
