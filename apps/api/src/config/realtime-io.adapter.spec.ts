import { readFileSync } from 'fs';
import { join } from 'path';
import type { ServerOptions } from 'socket.io';
import { createRealtimeSocketOptions } from './realtime-io.adapter';

describe('RealtimeIoAdapter CORS policy', () => {
  const corsOrigins = ['https://irexpro.example', 'https://admin.irexpro.example'];

  it('passes the canonical configured origins to Socket.IO with credentials enabled', () => {
    const options = createRealtimeSocketOptions(corsOrigins);

    expect(options.cors).toEqual({
      origin: corsOrigins,
      credentials: true,
    });
    expect(options.cors).not.toEqual(expect.objectContaining({ origin: '*' }));
  });

  it('preserves gateway transport options while central CORS policy wins', () => {
    const gatewayOptions: Partial<ServerOptions> = {
      transports: ['websocket', 'polling'],
      cors: {
        origin: '*',
        credentials: false,
      },
    };

    const options = createRealtimeSocketOptions(corsOrigins, gatewayOptions);

    expect(options.transports).toEqual(['websocket', 'polling']);
    expect(options.cors).toEqual({
      origin: corsOrigins,
      credentials: true,
    });
  });

  it('copies the origin list instead of exposing mutable configuration state', () => {
    const mutableOrigins = ['https://irexpro.example'];
    const options = createRealtimeSocketOptions(mutableOrigins);

    mutableOrigins.push('https://later.example');

    expect(options.cors).toEqual({
      origin: ['https://irexpro.example'],
      credentials: true,
    });
  });

  it('keeps wildcard CORS out of the realtime gateway decorator', () => {
    const gatewaySource = readFileSync(
      join(__dirname, '../modules/realtime/realtime.gateway.ts'),
      'utf8',
    );

    expect(gatewaySource).not.toContain("origin: '*'");
    expect(gatewaySource).not.toMatch(/cors\s*:/u);
  });
});
