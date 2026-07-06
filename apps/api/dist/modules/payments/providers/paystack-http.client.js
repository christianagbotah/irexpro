"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PaystackHttpClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaystackHttpClient = void 0;
const common_1 = require("@nestjs/common");
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_ERROR_MESSAGE_LENGTH = 200;
let PaystackHttpClient = PaystackHttpClient_1 = class PaystackHttpClient {
    constructor() {
        this.logger = new common_1.Logger(PaystackHttpClient_1.name);
    }
    async request(url, options) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                method: options.method,
                headers: {
                    Authorization: `Bearer ${options.secretKey}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: options.body ? JSON.stringify(options.body) : undefined,
                signal: controller.signal,
            });
            const parsed = await this.safeParseJson(response);
            if (!response.ok) {
                return {
                    ok: false,
                    status: response.status,
                    body: parsed,
                    errorMessage: this.sanitize(parsed?.['message']) ??
                        `Paystack request failed with status ${response.status}`,
                };
            }
            if (parsed && parsed['status'] === false) {
                return {
                    ok: false,
                    status: response.status,
                    body: parsed,
                    errorMessage: this.sanitize(parsed['message']) ?? 'Paystack reported a failed request',
                };
            }
            return { ok: true, status: response.status, body: parsed };
        }
        catch (err) {
            const isAbort = err instanceof Error && err.name === 'AbortError';
            const message = isAbort ? 'Paystack request timed out' : 'Paystack request failed: network error';
            this.logger.warn(`[Paystack] HTTP ${options.method} request error: ${message}`);
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
    sanitize(message) {
        if (!message || typeof message !== 'string')
            return undefined;
        return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    }
};
exports.PaystackHttpClient = PaystackHttpClient;
exports.PaystackHttpClient = PaystackHttpClient = PaystackHttpClient_1 = __decorate([
    (0, common_1.Injectable)()
], PaystackHttpClient);
//# sourceMappingURL=paystack-http.client.js.map