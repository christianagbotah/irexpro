# iRexPro — Realtime Event Layer Architecture

**Sprint 6 | Document 06-realtime-event-layer.md**

---

## 1. Overview

The Realtime Event Layer provides live server-to-client push notifications for trade lifecycle events, risk decisions, broker status changes, and AI signal updates. It uses Socket.IO over WebSocket (with HTTP long-polling fallback).

**Key principles:**
- All events flow through a `DomainEventBus` — no direct cross-module WebSocket injection
- JWT authentication is required for all WebSocket connections
- Safe payloads only — no credentials, tokens, or stack traces ever emitted
- The realtime layer is fully decoupled from business logic via the event bus pattern

---

## 2. Architecture

```
ExecutionService  ─────┐
RiskService        ─────┤──► DomainEventBus ──► RealtimeService ──► Socket.IO Gateway
BrokerService      ─────┤                              │                     │
TradingService     ─────┘                     onModuleInit()            /realtime ns
                                               subscribeToEvents()
```

**Why `DomainEventBus` (not direct injection)?**

Direct injection of `RealtimeService` into `ExecutionService` would create a circular dependency:
`ExecutionModule → RealtimeModule → (potentially) → ExecutionModule`

The event bus is a global singleton with no business module dependencies. Business modules publish events; `RealtimeService` subscribes and forwards to clients.

---

## 3. WebSocket Gateway

| Property | Value |
|---|---|
| Namespace | `/realtime` |
| Transport | WebSocket (with polling fallback) |
| Authentication | JWT in `socket.handshake.auth.token` or `Authorization: Bearer <token>` |
| Guard | `WsJwtGuard` — validates token, attaches `userId` to `socket.data` |

### Connection lifecycle

1. Client connects to `wss://api.irexpro.com/realtime`
2. JWT extracted from `handshake.auth.token`
3. If invalid: socket immediately disconnected
4. If valid: `userId` attached to `socket.data`
5. Client sends `authenticate` message
6. Server auto-joins `user:{userId}` room
7. Client optionally sends `join-session` to subscribe to session events

### Client messages (inbound)

| Message | Description |
|---|---|
| `authenticate` | Join `user:{userId}` room after connection |
| `join-session` | Join `trading-session:{sessionId}` room |
| `leave-session` | Leave `trading-session:{sessionId}` room |

**Security:** Users can only join rooms for their own userId/sessionId (enforced by JWT claims).

---

## 4. Event Catalogue

All events are typed in `RealtimeEvent` enum and `DomainEventType` enum.

| Event | Emitted to | Payload |
|---|---|---|
| `trading.session.started` | `user:{userId}` | sessionId, status, startedAt |
| `trading.session.stopped` | `user:{userId}` | sessionId, status, endedAt |
| `trade.pending` | `user:{userId}` | tradeId, instrument, direction, volume |
| `trade.opened` | `user:{userId}` + `trading-session:{sid}` | tradeId, entryPrice, status |
| `trade.rejected` | `user:{userId}` | tradeId, reason |
| `trade.closed` | `user:{userId}` | tradeId, exitPrice, realisedPnl |
| `trade.reconciliation_pending` | `user:{userId}` | tradeId, reason |
| `risk.signal.approved` | `user:{userId}` | instrument, direction, decision |
| `risk.signal.rejected` | `user:{userId}` | instrument, decision, rejectionCode |
| `broker.connection.status_changed` | `user:{userId}` | connectionId, status, previousStatus |
| `ai.signal.received` | `user:{userId}` | signalId, instrument, confidenceScore |
| `ai.signal.ignored` | `user:{userId}` | signalId, ignoredReason |
| `system.notification` | `user:{userId}` | title, message, severity |

---

## 5. Payload Safety Rules

**NEVER include in any WebSocket payload:**
- `encryptedCredentials`, `credentialIv`, `credentialTag`
- `accessToken`, `refreshToken`, `apiKey`
- Internal error stack traces (`err.stack`)
- Database IDs of internal system tables not needed by the client
- User passwords or hashed passwords

**Always safe to include:**
- `tradeId`, `sessionId`, `connectionId`, `signalId` (UUID strings)
- `status` strings, `timestamp` values
- `reason` / `rejectionCode` (user-facing messages only)
- Market data: `instrument`, `direction`, `volume`, `entryPrice`, `exitPrice`, `realisedPnl`

---

## 6. Room Access Control

| Room | Who can join | How |
|---|---|---|
| `user:{userId}` | Only the authenticated user whose JWT sub matches | Auto-joined on `authenticate` message |
| `trading-session:{sessionId}` | Only the session owner | Via `join-session` message; userId verified against JWT |
| `admin:global` | Reserved for future admin-only use | Not yet exposed via client messages |

---

## 7. DomainEventBus

The `DomainEventBus` (`EventsModule`, `@Global()`) is an in-memory Node.js `EventEmitter` wrapper.

```typescript
// Publishing (from any business service)
this.eventBus.publish(DomainEventType.TRADE_OPENED, userId, safePayload);

// Subscribing (RealtimeService only)
const unsub = this.eventBus.subscribe(DomainEventType.TRADE_OPENED, handler);
// unsubscribe on module destroy
```

**Current limitation:** In-memory only — does not survive horizontal scaling. A Redis pub/sub or Kafka adapter should be added when deploying multiple API instances (Sprint 15+).

---

## 8. Testing

| Test scenario | Spec file |
|---|---|
| emitToUser sends to correct room | `realtime.service.spec.ts` |
| TRADING_SESSION_STARTED forwarded correctly | `realtime.service.spec.ts` |
| Safe payload (no secrets) | `realtime.service.spec.ts` |
| DomainEventBus pub/sub | `event-bus.service.spec.ts` |
| Unsubscribe works | `event-bus.service.spec.ts` |
| Cleanup on destroy | `event-bus.service.spec.ts` |

---

## 9. Future Considerations

- Redis Adapter for Socket.IO when horizontal scaling is needed (`@socket.io/redis-adapter`)
- Replace in-memory `DomainEventBus` with Redis Streams or Kafka for multi-instance deployments
- Admin room implementation for system-wide broadcasts
- Client heartbeat / presence tracking
