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
var WsJwtGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsJwtGuard = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const websockets_1 = require("@nestjs/websockets");
let WsJwtGuard = WsJwtGuard_1 = class WsJwtGuard {
    constructor(jwtService, configService) {
        this.jwtService = jwtService;
        this.configService = configService;
        this.logger = new common_1.Logger(WsJwtGuard_1.name);
    }
    canActivate(context) {
        const client = context.switchToWs().getClient();
        const token = this.extractToken(client);
        if (!token) {
            this.logger.warn(`WsJwtGuard: no token provided, rejecting socket ${client.id}`);
            throw new websockets_1.WsException('Unauthorized: no token provided');
        }
        try {
            const secret = this.configService.get('jwt.secret');
            const payload = this.jwtService.verify(token, { secret });
            client.userId = payload.sub;
            client.userEmail = payload.email;
            client.userRoles = payload.roles ?? [];
            client.data.userId = payload.sub;
            client.data.userEmail = payload.email;
            client.data.userRoles = payload.roles ?? [];
            return true;
        }
        catch {
            this.logger.warn(`WsJwtGuard: invalid token on socket ${client.id}`);
            throw new websockets_1.WsException('Unauthorized: invalid or expired token');
        }
    }
    extractToken(client) {
        const authToken = client.handshake?.auth?.token;
        if (authToken)
            return authToken;
        const authHeader = client.handshake?.headers?.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        return null;
    }
};
exports.WsJwtGuard = WsJwtGuard;
exports.WsJwtGuard = WsJwtGuard = WsJwtGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        config_1.ConfigService])
], WsJwtGuard);
//# sourceMappingURL=ws-jwt.guard.js.map