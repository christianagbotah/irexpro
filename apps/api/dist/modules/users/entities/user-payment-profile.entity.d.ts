import { User } from './user.entity';
export declare class UserPaymentProfile {
    id: string;
    userId: string;
    provider: string;
    providerCustomerReference: string;
    countryCode: string | null;
    currency: string | null;
    metadata: Record<string, unknown> | null;
    isDefault: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    user: User;
}
