import { User } from './user.entity';
export declare enum KycStatus {
    NONE = "NONE",
    PENDING = "PENDING",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED"
}
export declare class UserProfile {
    id: string;
    userId: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    dateOfBirth: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    addressCity: string | null;
    addressState: string | null;
    addressPostalCode: string | null;
    addressCountry: string | null;
    kycStatus: KycStatus;
    kycSubmittedAt: Date | null;
    kycApprovedAt: Date | null;
    riskDisclosureAccepted: boolean;
    riskDisclosureAcceptedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    user: User;
}
