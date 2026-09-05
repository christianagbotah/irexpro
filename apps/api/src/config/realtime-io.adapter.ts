import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

/**
 * Build Socket.IO server options from the same canonical browser-origin
 * allowlist used by Nest HTTP CORS. Adapter-owned CORS always wins over any
 * gateway-level option so a feature decorator cannot silently reintroduce a
 * wildcard browser policy.
 */
export function createRealtimeSocketOptions(
  corsOrigins: readonly string[],
  options: Partial<ServerOptions> = {},
): Partial<ServerOptions> {
  return {
    ...options,
    cors: {
      origin: [...corsOrigins],
      credentials: true,
    },
  };
}

/**
 * Socket.IO adapter with one server-owned CORS policy.
 *
 * Socket.IO/CORS permits clients that do not send an Origin header, preserving
 * native/mobile compatibility, while browser requests with an Origin are
 * constrained to the canonical configured allowlist.
 */
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigins: readonly string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: Partial<ServerOptions>) {
    return super.createIOServer(port, createRealtimeSocketOptions(this.corsOrigins, options));
  }
}
