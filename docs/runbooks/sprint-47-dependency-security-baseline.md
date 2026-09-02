# Sprint 47 — Dependency Security Baseline

This record documents dependency changes made during Sprint 47 to clear the production release-security gate. It is release-hardening evidence, not a change to trading, broker, execution, strategy, or risk behavior.

## Framework baseline

The Web and Admin applications move together from Next.js 14.2.15 / React 18.3.1 to:

- Next.js `15.5.24`
- React `19.2.8`
- React DOM `19.2.8`
- `eslint-config-next` `15.5.24`
- React TypeScript declarations compatible with the repository TypeScript baseline

Web, Admin, and API production builds must pass against the regenerated frozen pnpm lock before the lock is accepted.

## Production transitive patches

The root `pnpm.overrides` intentionally targets vulnerable installed versions rather than globally forcing unrelated package majors.

| Vulnerable installed version | Patched resolution | Reason |
| --- | --- | --- |
| `axios@1.3.6` | `1.20.0` | MetaAPI transitive security advisories |
| `axios@1.4.0` | `1.20.0` | MetaAPI transitive security advisories |
| `brace-expansion@2.1.1` | `2.1.4` | production dependency advisory |
| `browserslist@4.28.4` | `4.28.7` | Next/styled-jsx production advisory |
| `crypto-js@4.1.1` | `4.2.0` | critical MetaAPI transitive advisory |
| `js-yaml@4.1.0` | `4.3.2` | Nest Swagger transitive advisory |
| `lodash@4.17.21` | `4.18.1` | Nest Config transitive advisory |
| `multer@2.0.2` | `2.3.0` | Nest platform-express transitive advisory |
| `nanoid@3.3.16` | `3.3.18` | Next/PostCSS transitive advisory |
| `postcss@8.4.31` | `8.5.18` | Next production source-map advisories |
| `socket.io-parser@3.3.5` | `3.3.6` | MetaAPI Socket.IO transitive advisory |
| `socket.io-parser@4.2.6` | `4.2.7` | application Socket.IO transitive advisory |

## Acceptance rule

These pins are accepted only when all of the following are true on one exact candidate SHA:

1. `pnpm install --frozen-lockfile` succeeds.
2. API, Web, and Admin production builds succeed.
3. Web/Admin responsive E2E suites succeed.
4. The VPS Production Dependency Audit reports zero high/critical findings on `apps/api`, `apps/web`, and `apps/admin` dependency paths.
5. The temporary lock-refresh workflow has been deleted from the candidate.

If an upstream dependency later removes the need for an override, remove it only in a dedicated dependency-maintenance change with the same build, E2E, and audit evidence.
