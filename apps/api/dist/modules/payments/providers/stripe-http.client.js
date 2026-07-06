"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var StripeHttpClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeHttpClient = void 0;
const common_1 = require("@nestjs/common");
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_ERROR_MESSAGE_LENGTH = 200;
function flattenToFormParams(value, prefix, out) {
    if (value === undefined || value === null)
        return;
    if (Array.isArray(value)) {
        value.forEach((item, index) => flattenToFormParams(item, `${prefix}[${index}]`, out));
        return;
    }
    if (typeof value === 'object') {
        for (const [key, val] of Object.entries(value)) {
            flattenToFormParams(val, prefix ? `${prefix}[${key}]` : key, out);
        }
        return;
    }
    out.append(prefix, String(value));
}
function toFormBody(body) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
        flattenToFormParams(value, key, params);
    }
    return params;
}
let StripeHttpClient = StripeHttpClient_1 = class StripeHttpClient {
    constructor() {
        this.logger = new common_1.Logger(StripeHttpClient_1.name);
    }
    async request(url, options) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                method: options.method,
                headers: {
                    Authorization: `Bearer ${options.secretKey}`,
                    ...(options.method === 'POST'
                        ? { 'Content-Type': 'application/x-www-form-urlencoded' }
                        : {}),
                    Accept: 'application/json',
                },
                body: options.body ? toFormBody(options.body).toString() : undefined,
                signal: controller.signal,
            });
            const parsed = await this.safeParseJson(response);
            if (!response.ok) {
                return {
                    ok: false,
                    status: response.status,
                    body: parsed,
                    errorMessage: this.sanitize(this.extractErrorMessage(parsed)) ??
                        `Stripe request failed with status ${response.status}`,
                };
            }
            return { ok: true, status: response.status, body: parsed };
        }
        catch (err) {
            const isAbort = err instanceof Error && err.name === 'AbortError';
            const message = isAbort ? 'Stripe request timed out' : 'Stripe request failed: network error';
            this.logger.warn(`[Stripe] HTTP ${options.method} request error: ${message}`);
            return { ok: false, status: 0, body: null, errorMessage: message };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async safeParseJson(response) {
        try {
            return (await response.json());
        }
        catch {
            return null;
        }
    }
    extractErrorMessage(parsed) {
        const error = parsed?.['error'];
        const message = error?.['message'];
        return typeof message === 'string' ? message : undefined;
    }
    sanitize(message) {
        if (!message || typeof message !== 'string')
            return undefined;
        return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    }
};
exports.StripeHttpClient = StripeHttpClient;
exports.StripeHttpClient = StripeHttpClient = StripeHttpClient_1 = __decorate([
    (0, common_1.Injectable)()
], StripeHttpClient);
//# sourceMappingURL=stripe-http.client.js.map