import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { RealtimeService } from './realtime.service';
export declare class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly realtimeService;
    private readonly wsJwtGuard;
    server: Server;
    private readonly logger;
    constructor(realtimeService: RealtimeService, wsJwtGuard: WsJwtGuard);
    afterInit(server: Server): void;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleAuthenticate(client: Socket, _data: unknown): {
        status: string;
        userId: string;
    };
    handleJoinSession(client: Socket, data: {
        sessionId: string;
        sessionUserId: string;
    }): {
        status: string;
    };
    handleLeaveSession(client: Socket, data: {
        sessionId: string;
    }): {
        status: string;
    };
    private extractToken;
}
