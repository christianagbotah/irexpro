export declare class CheckoutDto {
    planId: string;
    currency: string;
    provider?: string;
    countryCode?: string;
    idempotencyKey?: string;
}
export declare class CancelSubscriptionDto {
    reason?: string;
}
