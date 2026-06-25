import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { User } from '../users/entities/user.entity';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(dto: RegisterDto, req: Request): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    login(dto: LoginDto, req: Request): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    refresh(dto: RefreshTokenDto): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    logout(): Promise<{
        message: string;
    }>;
    me(user: User): Promise<{
        id: string;
        email: string;
        phone: string | null;
        status: import("../users/entities/user.entity").UserStatus;
        emailVerifiedAt: Date | null;
        phoneVerifiedAt: Date | null;
        lastLoginAt: Date | null;
        countryCode: string | null;
        timezone: string | null;
        preferredCurrency: string | null;
        mfaEnabled: boolean;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        profile: import("../users/entities/user-profile.entity").UserProfile;
        userRoles: import("../users/entities/user-role.entity").UserRole[];
    }>;
}
