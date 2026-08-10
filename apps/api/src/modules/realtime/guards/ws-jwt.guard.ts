import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

export interface WsAuthenticatedSocket extends Socket {
  userId: string;
  userEmail: string;
  userRoles: string[];
}

/**
 * WsJwtGuard — JWT authentication guard for WebSocket connections.
 *
 * Extracts JWT from:
 *   1. socket.handshake.auth.token  (preferred)
 *   2. socket.handshake.headers.authorization (Bearer <token>)
 *
 * On success: attaches { userId, userEmail, userRoles } to socket.data
 * On failure: throws WsException('Unauthorized') — gateway disconnects the socket
 *
 * Security rule: unauthenticated sockets are rejected before joining any room.
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const token = this.extractToken(client);

    if (!token) {
      this.logger.warn(`WsJwtGuard: no token provided, rejecting socket ${client.id}`);
      throw new WsException('Unauthorized: no token provided');
    }

    try {
      const secret = this.configService.get<string>('jwt.secret');
      const payload = this.jwtService.verify<{ sub: string; email: string; roles: string[] }>(
        token,
        { secret },
      );

      (client as WsAuthenticatedSocket).userId = payload.sub;
      (client as WsAuthenticatedSocket).userEmail = payload.email;
      (client as WsAuthenticatedSocket).userRoles = payload.roles ?? [];

      client.data.userId = payload.sub;
      client.data.userEmail = payload.email;
      client.data.userRoles = payload.roles ?? [];

      return true;
    } catch {
      this.logger.warn(`WsJwtGuard: invalid token on socket ${client.id}`);
      throw new WsException('Unauthorized: invalid or expired token');
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake?.auth?.token as string | undefined;
    if (authToken) return authToken;

    const authHeader = client.handshake?.headers?.authorization as string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }
}
