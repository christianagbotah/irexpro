"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RealtimeGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeGateway = void 0;
const common_1 = require("@nestjs/common");
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const ws_jwt_guard_1 = require("./guards/ws-jwt.guard");
const realtime_service_1 = require("./realtime.service");
let RealtimeGateway = RealtimeGateway_1 = class RealtimeGateway {
    constructor(realtimeService, wsJwtGuard) {
        this.realtimeService = realtimeService;
        this.wsJwtGuard = wsJwtGuard;
        this.logger = new common_1.Logger(RealtimeGateway_1.name);
    }
    afterInit(server) {
        this.realtimeService.setServer(server);
        this.logger.log('RealtimeGateway initialised — namespace: /realtime');
    }
    handleConnection(client) {
        try {
            const token = this.extractToken(client);
            if (!token) {
                this.logger.warn(`Rejecting unauthenticated socket: ${client.id}`);
                client.emit('error', { message: 'Unauthorized: no token provided' });
                client.disconnect(true);
                return;
            }
            this.logger.log(`Socket connected: ${client.id} (pending JWT validation)`);
        }
        catch {
            this.logger.warn(`Connection error for socket ${client.id}`);
            client.disconnect(true);
        }
    }
    handleDisconnect(client) {
        const userId = client.data?.userId ?? 'unknown';
        this.logger.log(`Socket disconnected: ${client.id} userId=${userId}`);
    }
    handleAuthenticate(client, _data) {
        const userId = client.data.userId;
        const roomName = `user:${userId}`;
        client.join(roomName);
        this.logger.log(`Socket ${client.id} joined room: ${roomName}`);
        return { status: 'authenticated', userId };
    }
    handleJoinSession(client, data) {
        const userId = client.data.userId;
        if (!data?.sessionId) {
            throw new websockets_1.WsException('sessionId is required');
        }
        if (data.sessionUserId && data.sessionUserId !== userId) {
            this.logger.warn(`User ${userId} tried to join session room owned by ${data.sessionUserId} — REJECTED`);
            throw new websockets_1.WsException('Forbidden: cannot join another user\'s session room');
        }
        const roomName = `trading-session:${data.sessionId}`;
        client.join(roomName);
        this.logger.log(`Socket ${client.id} (user=${userId}) joined room: ${roomName}`);
        return { status: 'joined', };
    }
    handleLeaveSession(client, data) {
        if (!data?.sessionId) {
            throw new websockets_1.WsException('sessionId is required');
        }
        const roomName = `trading-session:${data.sessionId}`;
        client.leave(roomName);
        this.logger.log(`Socket ${client.id} left room: ${roomName}`);
        return { status: 'left' };
    }
    extractToken(client) {
        const authToken = client.handshake?.auth?.token;
        if (authToken)
            return authToken;
        const authHeader = client.handshake?.headers?.authorization;
        if (authHeader?.startsWith('Bearer '))
            return authHeader.substring(7);
        return null;
    }
};
exports.RealtimeGateway = RealtimeGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RealtimeGateway.prototype, "server", void 0);
__decorate([
    (0, common_1.UseGuards)(ws_jwt_guard_1.WsJwtGuard),
    (0, websockets_1.SubscribeMessage)('authenticate'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Object)
], RealtimeGateway.prototype, "handleAuthenticate", null);
__decorate([
    (0, common_1.UseGuards)(ws_jwt_guard_1.WsJwtGuard),
    (0, websockets_1.SubscribeMessage)('join-session'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Object)
], RealtimeGateway.prototype, "handleJoinSession", null);
__decorate([
    (0, common_1.UseGuards)(ws_jwt_guard_1.WsJwtGuard),
    (0, websockets_1.SubscribeMessage)('leave-session'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Object)
], RealtimeGateway.prototype, "handleLeaveSession", null);
exports.RealtimeGateway = RealtimeGateway = RealtimeGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        namespace: '/realtime',
        cors: {
            origin: '*',
            credentials: true,
        },
        transports: ['websocket', 'polling'],
    }),
    __metadata("design:paramtypes", [realtime_service_1.RealtimeService,
        ws_jwt_guard_1.WsJwtGuard])
], RealtimeGateway);
//# sourceMappingURL=realtime.gateway.js.map