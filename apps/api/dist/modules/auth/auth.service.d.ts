import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository, DataSource } from 'typeorm';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';
import { UserProfile } from '../users/entities/user-profile.entity';
import { UserRole } from '../users/entities/user-role.entity';
import { Role } from '../users/entities/role.entity';
import { AuditService } from '../audit/audit.service';
export declare class AuthService {
    private userRepo;
    private profileRepo;
    private userRoleRepo;
    private roleRepo;
    private jwtService;
    private configService;
    private auditService;
    private dataSource;
    private readonly logger;
    constructor(userRepo: Repository<User>, profileRepo: Repository<UserProfile>, userRoleRepo: Repository<UserRole>, roleRepo: Repository<Role>, jwtService: JwtService, configService: ConfigService, auditService: AuditService, dataSource: DataSource);
    register(dto: RegisterDto, ipAddress?: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    login(dto: LoginDto, ipAddress?: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    refreshTokens(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    private generateTokens;
    validateUser(id: string): Promise<User | null>;
    hashPassword(password: string): Promise<string>;
    verifyPassword(hash: string, password: string): Promise<boolean>;
}
