'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MarketCandleView,
  MarketIntelligenceRequest,
  MarketIntelligenceView,
} from '@irexpro/types/market-intelligence';
import { Alert, Badge, Button, Card, DashboardShell, Input, LoadingSpinner } from '@/components/ui';
import { useAuth } from '@/context/auth-context';
import { loadMarketIntelligence } from '@/lib/market-intelligence';

const TIMEFRAMES: MarketIntelligenceRequest['timeframe'][] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

function CandlestickChart({ candles }: { candles: MarketCandleView[] }) {
  const geometry = useMemo(() => {
    const values = candles.flatMap((candle) => [Number(candle.high), Number(candle.low)]);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = Math.max(maximum - minimum, Number.EPSILON);
    const width = 1000;
    const height = 340;
    const top = 20;
    const bottom = 28;
    const plotHeight = height - top - bottom;
    const slot = width / candles.length;
    const bodyWidth = Math.max(2, Math.min(10, slot * 0.56));
    const y = (value: number) => top + ((maximum - value) / range) * plotHeight;

    return {
      width,
      height,
      minimum,
      maximum,
      midpoint: minimum + range / 2,
      bodyWidth,
      slot,
      y,
    };
  }, [candles]);

  return (
    <div style={{ width: '100%', overflow: 'hidden' }}>
      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        width="100%"
        role="img"
        aria-label={`Candlestick chart with ${candles.length} broker candles`}
        preserveAspectRatio="none"
        style={{ minHeight: 260, maxHeight: 420, display: 'block' }}
      >
        {[geometry.maximum, geometry.midpoint, geometry.minimum].map((value) => {
          const y = geometry.y(value);
          return (
            <g key={value}>
              <line x1="0" x2="1000" y1={y} y2={y} stroke="var(--border-subtle)" strokeWidth="1" />
              <text x="8" y={Math.max(14, y - 5)} fontSize="15" fill="currentColor" opacity="0.62">
                {value.toFixed(5)}
              </text>
            </g>
          );
        })}

        {candles.map((candle, index) => {
          const open = Number(candle.open);
          const close = Number(candle.close);
          const high = Number(candle.high);
          const low = Number(candle.low);
          const x = geometry.slot * index + geometry.slot / 2;
          const openY = geometry.y(open);
          const closeY = geometry.y(close);
          const highY = geometry.y(high);
          const lowY = geometry.y(low);
          const rising = close >= open;
          const top = Math.min(openY, closeY);
          const bodyHeight = Math.max(1.8, Math.abs(closeY - openY));
          const color = rising ? 'var(--success, #2f9e6f)' : 'var(--danger, #d65757)';

          return (
            <g key={`${candle.timestamp}-${index}`}>
              <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth="1.4" />
              <rect
                x={x - geometry.bodyWidth / 2}
                y={top}
                width={geometry.bodyWidth}
                height={bodyHeight}
                fill={rising ? 'transparent' : color}
                stroke={color}
                strokeWidth="1.4"
              />
            </g>
          );
        })}
      </svg>
      <p className="text-sm muted" style={{ marginBottom: 0 }}>
        Chart geometry is presentation-only. OHLC values are displayed from the broker response without trading or P&amp;L calculations.
      </p>
    </div>
  );
}

export default function MarketPage() {
  const { user, logout, restoring } = useAuth();
  const [instrument, setInstrument] = useState('EURUSD');
  const [timeframe, setTimeframe] = useState<MarketIntelligenceRequest['timeframe']>('H1');
  const [snapshot, setSnapshot] = useState<MarketIntelligenceView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (nextInstrument: string, nextTimeframe: MarketIntelligenceRequest['timeframe']) => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadMarketIntelligence({
        instrument: nextInstrument.trim().toUpperCase(),
        timeframe: nextTimeframe,
        limit: 80,
      });
      setSnapshot(next);
    } catch {
      setSnapshot(null);
      setError('Live market data is unavailable or failed verification. Previously loaded quote and chart data have been cleared.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void refresh('EURUSD', 'H1');
  }, [user, refresh]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!instrument.trim()) return;
    void refresh(instrument, timeframe);
  }

  if (restoring) {
    return <div style={{ padding: '3rem' }}><LoadingSpinner text="Restoring session…" /></div>;
  }

  if (!user) {
    return (
      <div style={{ padding: '3rem', maxWidth: 620, margin: '0 auto' }}>
        <Card title="Not signed in">
          <p className="muted">You need to log in to open Market Intelligence.</p>
          <Link href="/login" className="btn btn--primary mt-4">Go to login</Link>
        </Card>
      </div>
    );
  }

  return (
    <DashboardShell user={user} onLogout={logout} activeRoute="/market" title="Market Intelligence">
      <main className="terminal-foundation">
        <section className="terminal-foundation__hero" aria-labelledby="market-intelligence-title">
          <div>
            <p className="terminal-foundation__eyebrow">Broker-authoritative market data</p>
            <h1 id="market-intelligence-title" className="terminal-foundation__title">Market Intelligence</h1>
            <p className="terminal-foundation__description">
              Inspect live broker bid, ask, spread, and OHLCV history with explicit freshness. No synthetic candles, estimated prices, or browser-side trading metrics are introduced.
            </p>
          </div>
          {snapshot && <Badge variant={snapshot.status === 'FRESH' ? 'success' : 'warning'}>{snapshot.status}</Badge>}
        </section>

        <section className="mt-4">
          <Card title="Market request" subtitle="The API resolves your active connected broker on the server.">
            <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 1fr) auto', gap: 'var(--space-3)', alignItems: 'end' }}>
              <Input
                label="Instrument"
                value={instrument}
                maxLength={24}
                pattern="[A-Za-z0-9._-]{3,24}"
                autoCapitalize="characters"
                onChange={(event) => setInstrument(event.target.value.toUpperCase())}
                placeholder="EURUSD"
              />
              <Button type="submit" loading={loading} disabled={loading || instrument.trim().length < 3}>
                {loading ? 'Loading…' : 'Load market'}
              </Button>
            </form>
            <div className="mt-4" role="group" aria-label="Market timeframe" style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {TIMEFRAMES.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={item === timeframe ? 'primary' : 'secondary'}
                  onClick={() => {
                    setTimeframe(item);
                    if (snapshot) void refresh(instrument, item);
                  }}
                  disabled={loading}
                >
                  {item}
                </Button>
              ))}
            </div>
          </Card>
        </section>

        {error && <div className="mt-4"><Alert variant="error">{error}</Alert></div>}

        {loading && !snapshot ? (
          <Card title="Loading broker market data" className="mt-4">
            <LoadingSpinner text="Fetching and verifying broker quote and candles…" />
          </Card>
        ) : snapshot ? (
          <>
            {snapshot.status === 'STALE' && (
              <div className="mt-4">
                <Alert variant="warning">The broker returned stale market evidence. Treat this view as historical until a fresh refresh succeeds.</Alert>
              </div>
            )}

            <section className="mt-4" aria-label="Current broker quote" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-4)' }}>
              <Card title="Instrument"><strong style={{ fontSize: '1.5rem' }}>{snapshot.instrument}</strong><p className="text-sm muted mt-1">{snapshot.timeframe} · {snapshot.source}</p></Card>
              <Card title="Bid"><strong style={{ fontSize: '1.5rem' }}>{snapshot.quote.bid}</strong><p className="text-sm muted mt-1">Broker value</p></Card>
              <Card title="Ask"><strong style={{ fontSize: '1.5rem' }}>{snapshot.quote.ask}</strong><p className="text-sm muted mt-1">Broker value</p></Card>
              <Card title="Spread"><strong style={{ fontSize: '1.5rem' }}>{snapshot.quote.spread}</strong><p className="text-sm muted mt-1">Broker-reported</p></Card>
            </section>

            <section className="mt-4">
              <Card title={`${snapshot.instrument} · ${snapshot.timeframe} candlesticks`} subtitle={`${snapshot.candles.length} broker OHLCV candles`}>
                <CandlestickChart candles={snapshot.candles} />
              </Card>
            </section>

            <section className="mt-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
              <Card title="Freshness">
                <p className="text-sm"><strong>Overall:</strong> {snapshot.status}</p>
                <p className="text-sm"><strong>Quote:</strong> {snapshot.quote.freshness}</p>
                <p className="text-sm"><strong>Quote time:</strong> {new Date(snapshot.quote.timestamp).toLocaleString()}</p>
                <p className="text-sm"><strong>Latest candle:</strong> {snapshot.latestCandleAt ? new Date(snapshot.latestCandleAt).toLocaleString() : 'Unavailable'}</p>
              </Card>
              <Card title="Provenance & safety">
                <p className="text-sm"><strong>Source:</strong> Connected broker adapter</p>
                <p className="text-sm"><strong>Retrieved:</strong> {new Date(snapshot.retrievedAt).toLocaleString()}</p>
                <p className="text-sm muted mt-2">Connection IDs, provider account IDs, credentials, raw provider errors, order controls, and execution controls are not part of this browser contract.</p>
              </Card>
            </section>
          </>
        ) : null}
      </main>
    </DashboardShell>
  );
}
