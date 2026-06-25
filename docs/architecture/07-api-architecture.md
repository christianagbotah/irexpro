# 07 — API Architecture

## iRexPro — REST API and WebSocket Gateway Design

---

## 1. Purpose

This document defines the API architecture for iRexPro, including REST endpoint conventions, authentication model, WebSocket gateway design, versioning strategy, and security controls.

---

## 2. API Technology Stack

| Layer | Technology |
|---|---|
| Framework | NestJS (TypeScript) |
| REST serialisation | class-transformer + class-validator |
| OpenAPI documentation | @nestjs/swagger |
| WebSocket | Socket.IO via @nestjs/websockets |
| Rate limiting | @nestjs/throttler |
| Authentication | JWT RS256 (access + refresh tokens) |
| Authorisation | NestJS Guards + RBAC decorators |

---

## 3. API Versioning

All public API routes are versioned under `/api/v1/`.

Version bumps are introduced only for breaking changes. Non-breaking additions are backward-compatible within the same version.

```
Base URL (production): https://api.irexpro.com/api/v1
Base URL (sandbox):    https://sandbox-api.irexpro.com/api/v1
WebSocket URL:         wss://api.irexpro.com/ws
```

---

## 4. Authentication Model

### 4.1 Token Design

| Token | Lifetime | Storage |
|---|---|---|
| Access Token | 15 minutes | Memory (frontend) — never localStorage |
| Refresh Token | 7 days | HttpOnly secure cookie |

### 4.2 Token Flow

```
POST /api/v1/auth/login
→ Returns: { accessToken: "...", expiresIn: 900 }
→ Sets HttpOnly cookie: refreshToken

POST /api/v1/auth/refresh
→ Reads refreshToken from HttpOnly cookie
→ Returns: new accessToken

POST /api/v1/auth/logout
→ Invalidates refreshToken
→ Clears HttpOnly cookie
```

### 4.3 MFA Flow

```
POST /api/v1/auth/login
→ If MFA enabled: Returns { mfaRequired: true, mfaToken: "temp_token" }

POST /api/v1/auth/mfa/verify
→ Body: { mfaToken, totpCode }
→ Returns: { accessToken, expiresIn }
```

---

## 5. REST API Endpoint Catalogue

### 5.1 Auth Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/auth/register` | Create user account | Public |
| POST | `/auth/verify-email` | Verify email with token | Public |
| POST | `/auth/login` | Authenticate user | Public |
| POST | `/auth/mfa/verify` | Complete MFA verification | Partial (MFA token) |
| POST | `/auth/refresh` | Refresh access token | Cookie |
| POST | `/auth/logout` | Invalidate session | Bearer |
| POST | `/auth/password/reset-request` | Request password reset | Public |
| POST | `/auth/password/reset` | Complete password reset | Reset token |
| POST | `/auth/mfa/enable` | Enable TOTP MFA | Bearer |
| DELETE | `/auth/mfa/disable` | Disable MFA | Bearer + password |

### 5.2 User Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/users/me` | Get own profile | Bearer |
| PUT | `/users/me` | Update profile | Bearer |
| GET | `/users/me/onboarding` | Get onboarding status | Bearer |
| POST | `/users/me/onboarding/complete` | Mark onboarding complete | Bearer |
| DELETE | `/users/me` | Close account request | Bearer |

### 5.3 Broker Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/broker/connections` | List user broker connections | Bearer |
| POST | `/broker/connections` | Connect broker account | Bearer |
| GET | `/broker/connections/:id` | Get connection status | Bearer |
| DELETE | `/broker/connections/:id` | Revoke connection | Bearer |
| POST | `/broker/connections/:id/test` | Test broker connection | Bearer |
| GET | `/broker/connections/:id/account` | Get synced account state | Bearer |
| GET | `/broker/supported` | List supported brokers | Bearer |

### 5.4 Subscription Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/subscriptions/plans` | List available plans | Bearer |
| GET | `/subscriptions/current` | Get current subscription | Bearer |
| POST | `/subscriptions` | Create/activate subscription | Bearer |
| POST | `/subscriptions/trial` | Start free trial | Bearer |
| DELETE | `/subscriptions/current` | Cancel subscription | Bearer |
| GET | `/subscriptions/invoices` | List invoices | Bearer |
| GET | `/subscriptions/invoices/:id` | Get invoice detail | Bearer |

### 5.5 Trading Session Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/trading/session` | Get current session state | Bearer |
| POST | `/trading/session/start` | Activate AI trading | Bearer |
| POST | `/trading/session/pause` | Pause AI trading | Bearer |
| POST | `/trading/session/stop` | Stop AI trading | Bearer |
| GET | `/trading/session/history` | Get session history | Bearer |

### 5.6 Trades Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/trading/trades` | List trades (with filters) | Bearer |
| GET | `/trading/trades/open` | Get currently open trades | Bearer |
| GET | `/trading/trades/:id` | Get trade detail | Bearer |

### 5.7 Performance Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/performance/summary` | Get P&L summary | Bearer |
| GET | `/performance/equity-curve` | Get equity curve data | Bearer |
| GET | `/performance/statistics` | Win rate, drawdown, metrics | Bearer |
| GET | `/performance/trades/closed` | Paginated closed trades | Bearer |

### 5.8 Subscription Revenue / Fees Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/fees/statements` | List fee statements | Bearer |
| GET | `/fees/statements/:id` | Get fee statement detail | Bearer |
| GET | `/fees/high-water-mark` | Get current HWM | Bearer |

### 5.9 Risk Profile Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/risk/profile` | Get risk profile | Bearer |
| PUT | `/risk/profile` | Update risk profile | Bearer |

### 5.10 Notification Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/notifications` | List notifications | Bearer |
| PUT | `/notifications/:id/read` | Mark as read | Bearer |
| PUT | `/notifications/read-all` | Mark all as read | Bearer |

### 5.11 Admin Endpoints (Admin Role Required)

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/admin/users` | List users | Admin |
| GET | `/admin/users/:id` | Get user detail | Admin |
| PUT | `/admin/users/:id/suspend` | Suspend user | Admin |
| PUT | `/admin/users/:id/reactivate` | Reactivate user | Admin |
| GET | `/admin/trading/sessions` | All active sessions | Admin |
| POST | `/admin/kill-switch/activate` | Activate global kill switch | SuperAdmin |
| POST | `/admin/kill-switch/deactivate` | Deactivate kill switch | SuperAdmin |
| GET | `/admin/revenue/summary` | Platform revenue summary | Admin |
| GET | `/admin/audit-logs` | Query audit logs | Admin |
| GET | `/admin/subscriptions` | All subscriptions | Admin |
| PUT | `/admin/plans/:id` | Update plan | SuperAdmin |

### 5.11 Country and Regional Configuration Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/platform/countries` | List supported countries | Bearer |
| GET | `/platform/countries/:code` | Get country config detail | Bearer |
| GET | `/platform/countries/:code/payment-providers` | Available providers for country | Bearer |
| GET | `/platform/currencies` | List supported currencies | Bearer |
| GET | `/platform/currencies/exchange-rates` | Display FX rates (reference only) | Bearer |
| PUT | `/admin/countries/:code` | Update country config | SuperAdmin |
| POST | `/admin/countries/:code/block` | Block a country | SuperAdmin |
| POST | `/admin/countries/:code/unblock` | Unblock a country | SuperAdmin |

### 5.12 SMS and Notification Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/auth/phone/send-otp` | Send OTP to phone number | Bearer (partial) |
| POST | `/auth/phone/verify-otp` | Verify OTP code | Bearer (partial) |
| GET | `/notifications/preferences` | Get notification preferences | Bearer |
| PUT | `/notifications/preferences` | Update notification preferences | Bearer |
| GET | `/admin/sms/deliveries` | View SMS delivery log | Admin |
| GET | `/admin/sms/providers` | View registered SMS providers | Admin |

### 5.13 Webhook Endpoints (Payment Providers)

Each provider has its own webhook endpoint to allow provider-specific signature validation:

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/webhooks/stripe` | Stripe event webhook | Stripe-Signature header |
| POST | `/webhooks/paystack` | Paystack event webhook | x-paystack-signature header |
| POST | `/webhooks/flutterwave` | Flutterwave event webhook | verif-hash header |
| POST | `/webhooks/hubtel` | Hubtel event webhook | Hubtel-specific validation |
| POST | `/webhooks/paypal` | PayPal event webhook | PayPal webhook validation |

All webhook endpoints respond HTTP 200 immediately and process events asynchronously via BullMQ. Signature validation failure returns HTTP 401.

---

## 6. Standard Response Format

### 6.1 Success Response

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-06-25T10:00:00.000Z",
    "requestId": "req_abc123"
  }
}
```

### 6.2 Paginated Response

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### 6.3 Error Response

```json
{
  "success": false,
  "error": {
    "code": "SUBSCRIPTION_INACTIVE",
    "message": "An active subscription is required to activate AI trading.",
    "details": null
  },
  "meta": {
    "timestamp": "2026-06-25T10:00:00.000Z",
    "requestId": "req_abc123"
  }
}
```

---

## 7. Error Code Reference

| Code | HTTP Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `UNAUTHENTICATED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `SUBSCRIPTION_INACTIVE` | 403 | Active subscription required |
| `BROKER_NOT_CONNECTED` | 403 | Connected broker required |
| `SESSION_ALREADY_ACTIVE` | 409 | Duplicate session attempt |
| `KILL_SWITCH_ACTIVE` | 503 | Global kill switch active |
| `BROKER_UNAVAILABLE` | 503 | Broker API unreachable |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unhandled server error |

---

## 8. WebSocket Gateway

### 8.1 Connection

```
wss://api.irexpro.com/ws
Authorization: Bearer <accessToken> (via handshake query param or header)
```

### 8.2 Namespaces

| Namespace | Purpose |
|---|---|
| `/trading` | Live trade events for authenticated user |
| `/account` | Account balance and margin updates |
| `/notifications` | User notifications |
| `/admin` | Admin dashboard real-time events (Admin role) |

### 8.3 Trading Namespace Events (Server → Client)

| Event | Payload |
|---|---|
| `trade.opened` | `{ tradeId, instrument, direction, lotSize, entryPrice, sl, tp, openedAt }` |
| `trade.closed` | `{ tradeId, exitPrice, realisedPnl, closedAt, reason }` |
| `trade.modified` | `{ tradeId, newSl, newTp, modifiedAt }` |
| `trade.slHit` | `{ tradeId, exitPrice, realisedPnl }` |
| `trade.tpHit` | `{ tradeId, exitPrice, realisedPnl }` |
| `session.started` | `{ sessionId, startedAt }` |
| `session.paused` | `{ sessionId, pausedAt }` |
| `session.stopped` | `{ sessionId, stoppedAt, reason }` |
| `session.suspended` | `{ sessionId, reason }` |
| `risk.limitReached` | `{ ruleViolated, details }` |
| `pnl.update` | `{ openTrades: [{ tradeId, floatingPnl }], totalFloatingPnl }` |

### 8.4 Account Namespace Events (Server → Client)

| Event | Payload |
|---|---|
| `account.balanceUpdated` | `{ balance, equity, margin, freeMargin, marginLevel }` |
| `account.brokerDisconnected` | `{ brokerId, disconnectedAt }` |
| `account.brokerReconnected` | `{ brokerId, reconnectedAt }` |

---

## 9. Security Controls

### 9.1 Per-Endpoint Controls

| Control | Mechanism |
|---|---|
| Authentication | `@UseGuards(JwtAuthGuard)` on all protected routes |
| Role enforcement | `@Roles(Role.ADMIN)` decorator with RolesGuard |
| Rate limiting | `@Throttle()` per route, global throttler |
| Input validation | `ValidationPipe` global with `whitelist: true, forbidNonWhitelisted: true` |
| Request ID | Middleware injects unique requestId for tracing |

### 9.2 Broker Credentials — Never Exposed

The following fields must **never** appear in any API response:
- `encryptedCredentials`
- Any decrypted broker API key or secret
- `mfaSecret` (TOTP seed)
- `passwordHash`

These fields are blocked at the DTO/serialisation layer using `@Exclude()` decorators.

### 9.3 CORS Policy

```
Production:
  origins: ["https://app.irexpro.com", "https://admin.irexpro.com"]
  methods: GET, POST, PUT, DELETE, PATCH
  credentials: true (required for HttpOnly cookie)

Development:
  origins: ["http://localhost:3000", "http://localhost:3001"]
```

### 9.4 Country Gate Enforcement

All user-facing authenticated endpoints implicitly enforce the country gate via `CountryGateGuard`:

1. User's country is not blocked (`isBlocked = false`)
2. User's country is supported (`isSupported = true`)
3. Forex trading is allowed in the user's country (`forexTradingAllowed = true`)

Country configuration is cached in Redis (5-minute TTL). Changes take effect within the next cache refresh.

---

## 10. API Documentation

OpenAPI (Swagger) documentation is auto-generated via `@nestjs/swagger` and available at:

- `/api/docs` (development only, disabled in production)
- Exported as `openapi.json` artifact in CI/CD pipeline
- Imported into Postman collection for team use
