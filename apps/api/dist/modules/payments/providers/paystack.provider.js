"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PaystackPaymentProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaystackPaymentProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto = require("crypto");
const uuid_1 = require("uuid");
const base_provider_1 = require("./base-provider");
const paystack_http_client_1 = require("./paystack-http.client");
const payment_provider_interface_1 = require("../interfaces/payment-provider.interface");
const PAYSTACK_SIGNATURE_HEADER = 'x-paystack-signature';
const MAX_ERROR_MESSAGE_LENGTH = 300;
const SAFE_METADATA_KEYS = [
    'internalTransactionId',
    'invoiceId',
    'subscriptionId',
    'assessmentId',
    'paymentPurpose',
    'userId',
    'planId',
];
let PaystackPaymentProvider = PaystackPaymentProvider_1 = class PaystackPaymentProvider extends base_provider_1.BasePaymentProvider {
    constructor(configService, httpClient) {
        super();
        this.configService = configService;
        this.httpClient = httpClient;
        this.logger = new common_1.Logger(PaystackPaymentProvider_1.name);
        this.providerId = 'paystack';
        this.displayName = 'Paystack';
        this.supportedCountries = ['GH', 'NG', 'KE', 'ZA'];
        this.supportedCurrencies = ['GHS', 'NGN', 'KES', 'ZAR', 'USD'];
        this.supportedPaymentMethods = ['card', 'mobile_money', 'bank_transfer'];
        this.isLive = this.isEnabled() && Boolean(this.getSecretKey());
    }
    isEnabled() {
        return this.configService.get('paystack.enabled', false) === true;
    }
    getSecretKey() {
        return this.configService.get('paystack.secretKey') || undefined;
    }
    getWebhookSecret() {
        return this.configService.get('paystack.webhookSecret') || this.getSecretKey();
    }
    getBaseUrl() {
        return this.configService.get('paystack.baseUrl', 'https://api.paystack.co');
    }
    getCallbackUrl() {
        return this.configService.get('paystack.callbackUrl') || undefined;
    }
    assertConfigured() {
        if (!this.isEnabled()) {
            throw new common_1.ServiceUnavailableException('Paystack is not enabled');
        }
        const secretKey = this.getSecretKey();
        if (!secretKey) {
            throw new common_1.ServiceUnavailableException('Paystack is not configured');
        }
        return secretKey;
    }
    async createCheckoutSession(request) {
        const secretKey = this.assertConfigured();
        const reference = `psk_${(0, uuid_1.v4)()}`;
        const body = {
            email: request.email,
            amount: Math.round(request.amountMinor),
            currency: request.currency,
            reference,
            metadata: this.buildOutboundMetadata(request),
        };
        const callbackUrl = request.successUrl ?? this.getCallbackUrl();
        if (callbackUrl) {
            body.callback_url = callbackUrl;
        }
        const result = await this.httpClient.request(`${this.getBaseUrl()}/transaction/initialize`, { method: 'POST', secretKey, body });
        if (!result.ok || !result.body?.data?.reference || !result.body.data.authorization_url) {
            throw new common_1.BadRequestException(this.safeMessage(result.errorMessage) ?? 'Paystack checkout initialization failed');
        }
        return {
            sessionId: result.body.data.reference,
            checkoutUrl: result.body.data.authorization_url,
            providerTransactionReference: result.body.data.reference,
            provider: this.providerId,
        };
    }
    buildOutboundMetadata(request) {
        const meta = { userId: request.userId };
        const transactionId = request.metadata?.['transactionId'];
        if (typeof transactionId === 'string' && transactionId) {
            meta.internalTransactionId = transactionId;
        }
        if (request.invoiceId) {
            meta.invoiceId = request.invoiceId;
        }
        const subscriptionId = request.metadata?.['subscriptionId'];
        if (typeof subscriptionId === 'string' && subscriptionId) {
            meta.subscriptionId = subscriptionId;
        }
        const assessmentId = request.metadata?.['assessmentId'];
        if (typeof assessmentId === 'string' && assessmentId) {
            meta.assessmentId = assessmentId;
        }
        const type = request.metadata?.['type'];
        meta.paymentPurpose = typeof type === 'string' && type ? type : 'SUBSCRIPTION';
        if (request.planId) {
            meta.planId = request.planId;
        }
        return meta;
    }
    verifyWebhookSignature(rawBody, headers) {
        if (!this.isEnabled())
            return false;
        const secret = this.getWebhookSecret();
        if (!secret)
            return false;
        if (!rawBody || rawBody.length === 0)
            return false;
        const headerValue = headers[PAYSTACK_SIGNATURE_HEADER];
        const signature = Array.isArray(headerValue) ? headerValue[0] : headerValue;
        if (!signature)
            return false;
        try {
            const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
            const expectedBuf = Buffer.from(expected, 'utf8');
            const providedBuf = Buffer.from(signature, 'utf8');
            if (expectedBuf.length !== providedBuf.length)
                return false;
            return crypto.timingSafeEqual(expectedBuf, providedBuf);
        }
        catch {
            return false;
        }
    }
    parseWebhookEvent(rawBody, _headers) {
        let payload = null;
        try {
            payload = JSON.parse(rawBody.toString('utf8'));
        }
        catch {
            return {
                eventType: payment_provider_interface_1.PaymentEventType.UNKNOWN,
                providerEventId: `paystack_unparseable_${Date.now()}`,
            };
        }
        const eventName = payload?.event;
        const data = payload?.data ?? {};
        const base = {
            eventType: payment_provider_interface_1.PaymentEventType.UNKNOWN,
            providerEventId: this.buildProviderEventId(eventName, data),
            providerTransactionReference: typeof data.reference === 'string' ? data.reference : undefined,
            providerCustomerId: data.customer?.customer_code,
            amountMinor: typeof data.amount === 'number' ? data.amount : undefined,
            currency: typeof data.currency === 'string' ? data.currency : undefined,
            metadata: this.safeInboundMetadata(data.metadata),
        };
        switch (eventName) {
            case 'charge.success':
                return { ...base, eventType: payment_provider_interface_1.PaymentEventType.PAYMENT_SUCCEEDED };
            case 'charge.failed':
            case 'invoice.payment_failed':
                return { ...base, eventType: payment_provider_interface_1.PaymentEventType.PAYMENT_FAILED };
            case 'subscription.disable':
                return {
                    ...base,
                    eventType: payment_provider_interface_1.PaymentEventType.SUBSCRIPTION_CANCELLED,
                    providerSubscriptionId: data.subscription_code,
                };
            default:
                this.logger.log(`[Paystack] Unhandled webhook event type: ${eventName ?? 'unknown'}`);
                return base;
        }
    }
    buildProviderEventId(eventName, data) {
        const dataId = data.id ?? data.reference ?? 'unknown';
        return `paystack_${eventName ?? 'unknown'}_${dataId}`;
    }
    safeInboundMetadata(metadata) {
        if (!metadata || typeof metadata !== 'object')
            return undefined;
        const safe = {};
        for (const key of SAFE_METADATA_KEYS) {
            if (key in metadata && typeof metadata[key] === 'string') {
                safe[key] = metadata[key];
            }
        }
        return Object.keys(safe).length > 0 ? safe : undefined;
    }
    async getTransactionStatus(providerReference) {
        const secretKey = this.assertConfigured();
        const result = await this.httpClient.request(`${this.getBaseUrl()}/transaction/verify/${encodeURIComponent(providerReference)}`, { method: 'GET', secretKey });
        if (!result.ok || !result.body?.data) {
            return {
                providerReference,
                status: 'FAILED',
                failureMessage: this.safeMessage(result.errorMessage) ?? 'Unable to verify transaction status',
            };
        }
        const data = result.body.data;
        return {
            providerReference,
            status: this.mapTransactionStatus(data.status),
            amountMinor: typeof data.amount === 'number' ? data.amount : undefined,
            currency: typeof data.currency === 'string' ? data.currency : undefined,
            paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
            failureCode: data.status === 'failed' ? 'PAYSTACK_CHARGE_FAILED' : undefined,
            failureMessage: data.status === 'failed' ? this.safeMessage(data.gateway_response) : undefined,
        };
    }
    mapTransactionStatus(status) {
        switch (status) {
            case 'success':
                return 'SUCCEEDED';
            case 'failed':
                return 'FAILED';
            case 'abandoned':
                return 'CANCELLED';
            case 'reversed':
                return 'REFUNDED';
            case 'pending':
            case 'ongoing':
            case 'processing':
            case 'queued':
                return 'PROCESSING';
            default:
                return 'PENDING';
        }
    }
    safeMessage(message) {
        if (!message)
            return undefined;
        return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    }
};
exports.PaystackPaymentProvider = PaystackPaymentProvider;
exports.PaystackPaymentProvider = PaystackPaymentProvider = PaystackPaymentProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        paystack_http_client_1.PaystackHttpClient])
], PaystackPaymentProvider);
//# sourceMappingURL=paystack.provider.js.map