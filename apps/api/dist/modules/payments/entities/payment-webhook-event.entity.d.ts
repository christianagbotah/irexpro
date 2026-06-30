export declare class PaymentWebhookEvent {
    id: string;
    provider: string;
    providerEventId: string;
    eventType: string;
    signatureVerified: boolean;
    processed: boolean;
    processingError: string | null;
    payloadSummary: Record<string, unknown> | null;
    receivedAt: Date;
    processedAt: Date | null;
}
