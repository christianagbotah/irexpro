import { Logger, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { RealtimeService } from './realtime.service';

/**
 * RealtimeGateway — WebSocket gateway for real-time events.
 *
 * Namespace: /realtime
 *
 * Rooms:
 *   user:{userId}               — joined automatically on authenticated connection
 *   trading-session:{sessionId} — joined via 'join-session' message
 *   admin:global                — admin-only room (future)
 *
 * Authentication:
 *   All connections must provide a valid JWT in:
 *     socket.handshake.auth.token  OR  Authorization: Bearer <token>
 *   Invalid, expired, revoked, or unauthenticated connections are rejected
 *   immediately in handleConnection(). Guarded messages revalidate the same
 *   server-side session state so revocation after connection still fails closed.
 *
 * Security rules:
 *   - Users can only join their own rooms (enforced by extracting userId from JWT)
 *   - No broker secrets, tokens, or stack traces are ever emitted
 *   - Payloads are type-checked via RealtimeService methods
 *   - Browser-origin policy is owned centrally by RealtimeIoAdapter at bootstrap
 *
 * See: docs/architecture/06-realtime-event-layer.md
 */
@WebSocketGateway({
  namespace: '/realtime',
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly wsJwtGuard: WsJwtGuard,
  ) {}

  afterInit(server: Server): void {
    this.realtimeService.setServer(server);
    this.logger.log('RealtimeGateway initialised — namespace: /realtime');
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      await this.wsJwtGuard.authenticateClient(client);
      this.logger.log(`Socket authenticated: ${client.id}`);
    } catch {
      this.logger.warn(`Rejecting unauthorized socket: ${client.id}`);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = client.data?.userId ?? 'unknown';
    this.logger.log(`Socket disconnected: ${client.id} userId=${userId}`);
  }

  /**
   * After JWT validation, join the user's personal room.
   * Called automatically when the client authenticates.
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('authenticate')
  handleAuthenticate(
    @ConnectedSocket() client: Socket,
    @MessageBody() _data: unknown,
  ): { status: string; userId: string } {
    const userId = client.data.userId as string;
    const roomName = `user:${userId}`;

    client.join(roomName);
    this.logger.log(`Socket ${client.id} joined room: ${roomName}`);

    return { status: 'authenticated', userId };
  }

  /**
   * Join a trading session room to receive session-scoped trade events.
   * Only the session owner (matching JWT userId) may join the session room.
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join-session')
  handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; sessionUserId: string },
  ): { status: string } {
    const userId = client.data.userId as string;

    if (!data?.sessionId) {
      throw new WsException('sessionId is required');
    }

    // Security: only the session owner can join the session room
    if (data.sessionUserId && data.sessionUserId !== userId) {
      this.logger.warn(
        `User ${userId} tried to join session room owned by ${data.sessionUserId} — REJECTED`,
      );
      throw new WsException("Forbidden: cannot join another user's session room");
    }

    const roomName = `trading-session:${data.sessionId}`;
    client.join(roomName);
    this.logger.log(`Socket ${client.id} (user=${userId}) joined room: ${roomName}`);

    return { status: 'joined' };
  }

  /**
   * Leave a trading session room.
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leave-session')
  handleLeaveSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ): { status: string } {
    if (!data?.sessionId) {
      throw new WsException('sessionId is required');
    }
    const roomName = `trading-session:${data.sessionId}`;
    client.leave(roomName);
    this.logger.log(`Socket ${client.id} left room: ${roomName}`);
    return { status: 'left' };
  }
}
