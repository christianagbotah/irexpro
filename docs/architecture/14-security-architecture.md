# 14 — Security Architecture

## iRexPro — Security Design, Controls, and Threat Model

---

## 1. Purpose

This document defines the security architecture for iRexPro, covering authentication, authorisation, data protection, API security, infrastructure security, threat model, and compliance readiness.

---

## 2. Security Principles

1. **Zero trust** — every request is authenticated and authorised, regardless of origin
2. **Least privilege** — components and users have only the access they need
3. **Defence in depth** — multiple independent security layers
4. **Fail secure** — system errors default to denial, not approval
5. **Audit everything** — all sensitive operations produce immutable audit records
6. **No secrets in code** — credentials and keys managed via environment variables and secret management systems
7. **Encrypt at rest and in transit** — sensitive data is encrypted in storage and transport

---

## 3. Authentication Architecture

### 3.1 JWT Design

| Token Type | Algorithm | Lifetime | Storage |
|---|---|---|---|
| Access Token | RS256 (asymmetric) | 15 minutes | Memory (JavaScript variable) — never localStorage, never cookie |
| Refresh Token | RS256 | 7 days | HttpOnly, Secure, SameSite=Strict cookie |

**Why RS256?**
- Asymmetric signing allows public key verification by third-party services without sharing the signing secret
- Compromised public key does not compromise token signing

### 3.2 Refresh Token Rotation

- Every `POST /auth/refresh` call issues a new refresh token and invalidates the old one (rotation)
- Old refresh tokens are stored in a `revoked_tokens` table for the remainder of their original TTL
- If a revoked refresh token is presented: full session invalidation (possible token theft)

### 3.3 Multi-Factor Authentication (MFA)

- TOTP-based MFA (RFC 6238 — compatible with Google Authenticator, Authy, etc.)
- TOTP secret stored encrypted at rest
- MFA enforced for all Admin and SuperAdmin accounts (mandatory, cannot be disabled)
- MFA optional for regular users, but encouraged via onboarding prompt
- Backup codes provided at MFA setup (hashed, one-time use)

### 3.4 Session Invalidation

Sessions are invalidated on:
- User logout
- Password change
- MFA reset
- Account suspension
- Admin force-logout
- Refresh token rotation conflict (possible theft detected)

---

## 4. Authorisation Architecture

### 4.1 Role-Based Access Control (RBAC)

| Role | Access Level |
|---|---|
| USER | Own account data, own trades, own subscription |
| ADMIN | All user data (read), subscription management, revenue view, kill switch (activate only) |
| SUPER_ADMIN | All above + plan management, system config, kill switch (activate + deactivate), audit export |

### 4.2 NestJS Guard Implementation

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Validates access token on every protected route
}

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const user = context.switchToHttp().getRequest().user;
    return requiredRoles.some(role => user.roles?.includes(role));
  }
}
```

### 4.3 Resource Ownership Enforcement

For all user-scoped resources:
- The `userId` in JWT claims is always compared to the `userId` on the requested resource
- No user can access another user's trades, subscription, broker connection, or performance data
- This check is enforced in the service layer, not just the controller

---

## 5. Data Encryption

### 5.1 Broker Credentials — Envelope Encryption

```
Encryption flow:
1. Generate random 256-bit Data Encryption Key (DEK) per credential set
2. Encrypt broker credentials (JSON object) with DEK using AES-256-GCM
3. Encrypt DEK with Key Encryption Key (KEK) stored in KMS (AWS KMS / Vault)
4. Store: encrypted_credentials (ciphertext + IV + auth tag), credential_key_id (KMS key reference)

Decryption flow:
1. Retrieve encrypted_credentials and credential_key_id from DB
2. Call KMS to decrypt DEK using KEK (requires application IAM permission)
3. Decrypt credentials using DEK
4. Use credentials in-memory for adapter call; never log or persist decrypted credentials
```

### 5.2 Sensitive Fields Encrypted at Rest

| Field | Encryption |
|---|---|
| Broker API credentials | AES-256-GCM (envelope encryption, KMS) |
| MFA TOTP secret | AES-256-CBC (application-level key) |
| Password reset tokens | bcrypt hash (one-way, not reversible) |
| Passwords | bcrypt (cost factor: 12+) |
| PII fields (future KYC) | AES-256-GCM (data-at-rest encryption) |

### 5.3 Database Encryption at Rest

- PostgreSQL storage volume encrypted at OS/cloud level (AES-256)
- Backup files encrypted with KMS key
- Column-level encryption for highest-sensitivity fields (broker credentials, MFA secret)

### 5.4 Transport Security

- TLS 1.3 required on all API endpoints
- HSTS (HTTP Strict Transport Security) with max-age: 31536000; includeSubDomains
- Certificate pinning in mobile apps
- All internal service-to-service communication over TLS (service mesh in Phase 3)

---

## 6. API Security

### 6.1 Input Validation

- All API inputs validated via `class-validator` DTOs
- `ValidationPipe` configured with `whitelist: true` (strips unknown properties)
- `forbidNonWhitelisted: true` (rejects requests with unexpected fields)
- SQL injection prevention: TypeORM parameterised queries only (no raw string concatenation)
- XSS prevention: output encoding on all string fields

### 6.2 Rate Limiting

| Endpoint Category | Limit |
|---|---|
| Login | 5 attempts / 15 minutes / IP |
| Password reset request | 3 attempts / 1 hour / IP |
| Email verification resend | 3 attempts / 1 hour / user |
| General API | 100 requests / minute / user |
| Admin API | 200 requests / minute / admin |
| Webhooks | 1000 requests / minute / IP |

### 6.3 CORS

```
Production allowed origins:
  https://app.irexpro.com
  https://admin.irexpro.com

Credentials: true (required for HttpOnly cookie refresh token)
Methods: GET, POST, PUT, PATCH, DELETE
Headers: Authorization, Content-Type, X-Request-ID
```

### 6.4 Security Headers (Helmet.js)

All HTTP responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), camera=()`
- Content Security Policy (CSP): restrictive policy configured for each app

---

## 7. Secrets Management

| Secret Type | Management Approach |
|---|---|
| Database credentials | Environment variables / Vault / AWS Secrets Manager |
| JWT signing keys | Vault / AWS KMS — rotated annually or on compromise |
| Broker credential KEK | AWS KMS / Vault — never stored in code or config files |
| Payment provider secrets | Vault / AWS Secrets Manager |
| Internal service API keys | Vault with short-lived dynamic secrets (Phase 3) |
| MFA encryption key | Vault / AWS KMS |

**Non-negotiable rule:** No secrets in source code, Dockerfiles, or configuration files committed to version control. `.env` files are `.gitignore`d. Example `.env.example` file provided without real values.

---

## 8. Threat Model

### 8.1 Key Assets to Protect

| Asset | Threat | Mitigation |
|---|---|---|
| User broker credentials | Theft, exposure | Envelope encryption, KMS, never in API responses |
| User trading accounts | Unauthorised trading | JWT auth, RBAC, broker session validation |
| Platform revenue data | Manipulation | Immutable ledger, RBAC, audit log |
| Audit logs | Tampering | REVOKE UPDATE/DELETE on audit table, append-only service |
| AI model | Manipulation | Model registry with version control, approval workflow |
| Kill switch | Unauthorised activation | SuperAdmin only, MFA required, audit log |

### 8.2 Known Attack Vectors

| Attack | Mitigation |
|---|---|
| Credential stuffing on login | Rate limiting, CAPTCHA (future), MFA |
| JWT token theft | Short-lived access tokens, HttpOnly refresh cookie |
| Webhook spoofing | Signature validation on all webhooks |
| SQL injection | Parameterised queries, no raw SQL construction |
| IDOR (insecure direct object reference) | Resource ownership check in service layer |
| Broker credential extraction via API | Fields excluded from all DTO responses |
| Duplicate order submission | Idempotency keys, Redis distributed lock |
| Admin privilege escalation | Separate admin role guards, MFA for admin |
| Insider threat | Audit logging of all admin actions, log access restrictions |

---

## 9. Incident Response

### 9.1 Security Incident Categories

| Severity | Examples | Response Time |
|---|---|---|
| P1 — Critical | Credential breach, unauthorised trading, data exfiltration | < 1 hour |
| P2 — High | Failed login spike, webhook bypass attempt | < 4 hours |
| P3 — Medium | Unusual admin activity, rate limit triggered by single IP | < 24 hours |
| P4 — Low | Failed email verification spike | < 72 hours |

### 9.2 Response Procedures

**P1 Response:**
1. Activate kill switch (halt all trading)
2. Revoke all active sessions
3. Engage security team
4. Preserve audit logs (read-only backup)
5. Notify affected users per regulatory requirements
6. Root cause analysis
7. Post-incident review and control improvements

---

## 10. Compliance Readiness

| Regulation/Standard | Readiness |
|---|---|
| GDPR (EU/UK) | Data minimisation, right to erasure (soft-delete), consent tracking, DPA appointment |
| PCI-DSS | Payment providers handle card data — iRexPro never stores raw card numbers |
| SOC 2 Type II (future) | Audit log design, access controls, availability monitoring |
| MiFID II (EU) / FCA (UK) | Trade record retention (7 years), risk disclosure logging |
| FSCA (South Africa) | Trade records, risk disclosures, complaint handling |
| SEC/CFTC (US) | Retail Forex automation — legal review required before US launch |
| SEC Nigeria / CBN | Nigeria-specific review before NG market activation |
| BOG / SEC Ghana | Ghana-specific review before GH market activation |
| CMA Kenya | Kenya-specific review before KE market activation |
| ISO 27001 (future) | Security controls baseline aligns with ISO 27001 Annex A |
| NDPR (Nigeria) | Nigeria Data Protection Regulation — user data processing |
| POPIA (South Africa) | South Africa data privacy law |

---

## 11. Global Security Considerations

### 11.1 Payment Provider Secret Management

Each payment provider requires its own set of secrets (API keys, webhook secrets):

| Provider | Secrets Required |
|---|---|
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Paystack | `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET` |
| Flutterwave | `FLW_SECRET_KEY`, `FLW_SECRET_HASH` |
| Hubtel | `HUBTEL_CLIENT_ID`, `HUBTEL_CLIENT_SECRET`, `HUBTEL_SENDER_ID` |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` |

All provider secrets are stored in Vault / AWS Secrets Manager — never in code or config files.

### 11.2 SMS Provider Secret Management

| Provider | Secrets Required |
|---|---|
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| Hubtel | `HUBTEL_SMS_CLIENT_ID`, `HUBTEL_SMS_CLIENT_SECRET` |
| Arkesel | `ARKESEL_API_KEY` |
| AWS SNS | IAM role (no explicit API key — uses AWS IAM) |

### 11.3 Regional Data Residency (Future)

As iRexPro expands to additional regions, consider data residency requirements:

- **EU/UK users:** GDPR may require data stored in EU or UK data centres
- **Nigeria:** NDPR requires that certain personal data of Nigerian citizens is stored in Nigeria
- **South Africa:** POPIA has data localisation guidance
- In Phase 1, a single AWS region is acceptable with GDPR-compliant DPA
- In Phase 3, explore multi-region deployment with data routing per user country

---

## 11. Security Testing Requirements

| Test Type | Frequency |
|---|---|
| Dependency vulnerability scan (npm audit, pip audit) | Every CI build |
| Static code analysis (Semgrep, ESLint security rules) | Every CI build |
| OWASP ZAP baseline scan | Every release |
| Penetration test (manual) | Pre-production launch + annually |
| Secret scanning (TruffleHog / GitGuardian) | Every commit |
| JWT configuration audit | Quarterly |
