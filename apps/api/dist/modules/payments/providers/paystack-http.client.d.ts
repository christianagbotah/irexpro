export interface PaystackHttpRequestOptions {
    method: 'GET' | 'POST';
    secretKey: string;
    body?: Record<string, unknown>;
    timeoutMs?: number;
}
export interface PaystackHttpResult<T> {
    ok: boolean;
    status: number;
    body: T | null;
    errorMessage?: string;
}
export declare class PaystackHttpClient {
    private readonly logger;
    request<T = unknown>(url: string, options: PaystackHttpRequestOptions): Promise<PaystackHttpResult<T>>;
    private safeParseJson;
    private sanitize;
}
