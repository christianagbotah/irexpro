import { UserRole } from './user-role.entity';
export declare enum RoleName {
    SUPER_ADMIN = "SUPER_ADMIN",
    ADMIN = "ADMIN",
    USER = "USER"
}
export declare class Role {
    id: string;
    name: RoleName;
    description: string | null;
    createdAt: Date;
    userRoles: UserRole[];
}
