# Trader Cockpit Server Boundary

The Dynamic Trader Cockpit is a read-side composition surface. Its browser-facing panels may consume sanitized authoritative contracts, but they do not own trading truth or execution authority.

## Mandatory execution path

Live mutations remain server-side and must continue through:

`AI Signal → Strategy Orchestrator → Broker Gate → Risk Engine → Execution Engine → Broker`

The cockpit must never introduce a browser-to-broker shortcut or a browser-side substitute for any gate in that chain.

## Browser-safe contracts

The cockpit may display only fields intentionally exposed by the relevant frontend-safe read models. Broker credentials, provider account identifiers, internal connection identifiers, idempotency keys, raw adapter diagnostics, hidden model metadata, and internal risk context must remain server-side unless a separately reviewed contract explicitly proves a safe need.

## Authoritative-data rules

- Market quotes and OHLCV must be provider-backed and freshness-labelled.
- Synthetic PaperBroker market data must not be presented as authoritative live market data.
- Portfolio, risk, execution, and financial values must be server-derived; the browser must not reconstruct missing truth.
- Strategy Lab output remains deterministic research/advisory evidence and is not a live execution instruction.
- AI Decision Explorer output is persisted lifecycle evidence, not hidden model reasoning.
- Unexpected or broadened browser payloads must fail closed.

## Release gate

Cockpit releases must retain API validation, the real PostgreSQL execution-concurrency gate, production Web/Admin builds, full configured Web/Admin Playwright matrices, and screenshot evidence on the exact release head.
