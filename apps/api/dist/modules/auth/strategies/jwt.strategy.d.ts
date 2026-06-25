import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
export interface JwtPayload {
    sub: string;
    email: string;
    roles: string[];
    iat?: number;
    exp?: number;
}
declare const JwtStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtStrategy extends JwtStrategy_base {
    private configService;
    private userRepo;
    constructor(configService: ConfigService, userRepo: Repository<User>);
    validate(payload: JwtPayload): Promise<User & {
        roles: string[];
    }>;
}
export {};
