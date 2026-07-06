export interface StripeHttpRequestOptions {
    method: 'GET' | 'POST';
    secretKey: string;
    body?: Record<string, unknown>;
    timeoutMs?: number;
}
export interface StripeHttpResult<T> {
    ok: boolean;
    status: number;
    body: T | null;
    errorMessage?: string;
}
export declare class StripeHttpClient {
    private readonly logger;
    request<T = unknown>(url: string, options: StripeHttpRequestOptions): Promise<StripeHttpResult<T>>;
    private safeParseJson;
    private extractErrorMessage;
    private sanitize;
}
