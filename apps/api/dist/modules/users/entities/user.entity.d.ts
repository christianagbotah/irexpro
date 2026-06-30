import { UserProfile } from './user-profile.entity';
import { UserRole } from './user-role.entity';
export declare enum UserStatus {
    PENDING_VERIFICATION = "PENDING_VERIFICATION",
    ACTIVE = "ACTIVE",
    SUSPENDED = "SUSPENDED",
    CLOSED = "CLOSED"
}
export declare class User {
    id: string;
    email: string;
    phone: string | null;
    passwordHash: string;
    status: UserStatus;
    emailVerifiedAt: Date | null;
    phoneVerifiedAt: Date | null;
    lastLoginAt: Date | null;
    countryCode: string | null;
    timezone: string | null;
    preferredCurrency: string | null;
    mfaEnabled: boolean;
    mfaSecret: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    profile: UserProfile;
    userRoles: UserRole[];
}
