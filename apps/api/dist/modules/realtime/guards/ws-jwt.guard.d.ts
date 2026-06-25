import { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
export interface WsAuthenticatedSocket extends Socket {
    userId: string;
    userEmail: string;
    userRoles: string[];
}
export declare class WsJwtGuard implements CanActivate {
    private readonly jwtService;
    private readonly configService;
    private readonly logger;
    constructor(jwtService: JwtService, configService: ConfigService);
    canActivate(context: ExecutionContext): boolean;
    private extractToken;
}
