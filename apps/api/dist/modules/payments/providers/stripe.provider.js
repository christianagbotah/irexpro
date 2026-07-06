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
var StripePaymentProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripePaymentProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto = require("crypto");
const base_provider_1 = require("./base-provider");
const stripe_http_client_1 = require("./stripe-http.client");
const payment_provider_interface_1 = require("../interfaces/payment-provider.interface");
const STRIPE_SIGNATURE_HEADER = 'stripe-signature';
const MAX_ERROR_MESSAGE_LENGTH = 300;
const WEBHOOK_TOLERANCE_SECONDS = 300;
const SAFE_METADATA_KEYS = [
    'internalTransactionId',
    'invoiceId',
    'subscriptionId',
    'assessmentId',
    'paymentPurpose',
    'userId',
    'planId',
];
let StripePaymentProvider = StripePaymentProvider_1 = class StripePaymentProvider extends base_provider_1.BasePaymentProvider {
    constructor(configService, httpClient) {
        super();
        this.configService = configService;
        this.httpClient = httpClient;
        this.logger = new common_1.Logger(StripePaymentProvider_1.name);
        this.providerId = 'stripe';
        this.displayName = 'Stripe';
        this.supportedCountries = ['GB', 'US', 'CA', 'AU', 'SG', 'AE', 'DE', 'FR', 'NL', 'IE', 'NG', 'KE', 'GH', 'ZA'];
        this.supportedCurrencies = ['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'SGD', 'AED', 'NGN', 'KES', 'GHS', 'ZAR'];
        this.supportedPaymentMethods = ['card'];
        this.isLive = this.isEnabled() && Boolean(this.getSecretKey());
    }
    isEnabled() {
        return this.configService.get('stripe.enabled', false) === true;
    }
    getSecretKey() {
        return this.configService.get('stripe.secretKey') || undefined;
    }
    getWebhookSecret() {
        return this.configService.get('stripe.webhookSecret') || undefined;
    }
    getBaseUrl() {
        return this.configService.get('stripe.baseUrl', 'https://api.stripe.com');
    }
    getSuccessUrl() {
        return this.configService.get('stripe.successUrl') || undefined;
    }
    getCancelUrl() {
        return this.configService.get('stripe.cancelUrl') || undefined;
    }
    assertConfigured() {
        if (!this.isEnabled()) {
            throw new common_1.ServiceUnavailableException('Stripe is not enabled');
        }
        const secretKey = this.getSecretKey();
        if (!secretKey) {
            throw new common_1.ServiceUnavailableException('Stripe is not configured');
        }
        return secretKey;
    }
    async createCheckoutSession(request) {
        const secretKey = this.assertConfigured();
        const successUrl = request.successUrl ?? this.getSuccessUrl();
        const cancelUrl = request.cancelUrl ?? this.getCancelUrl();
        if (!successUrl || !cancelUrl) {
            throw new common_1.BadRequestException('Stripe checkout requires success_url/cancel_url to be configured');
        }
        const body = {
            mode: 'payment',
            success_url: successUrl,
            cancel_url: cancelUrl,
            client_reference_id: request.userId,
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency: request.currency.toLowerCase(),
                        unit_amount: Math.round(request.amountMinor),
                        product_data: { name: this.buildProductName(request) },
                    },
                },
            ],
            metadata: this.buildOutboundMetadata(request),
        };
        if (request.email) {
            body.customer_email = request.email;
        }
        const result = await this.httpClient.request(`${this.getBaseUrl()}/v1/checkout/sessions`, { method: 'POST', secretKey, body });
        if (!result.ok || !result.body?.id || !result.body.url) {
            throw new common_1.BadRequestException(this.safeMessage(result.errorMessage) ?? 'Stripe checkout session creation failed');
        }
        return {
            sessionId: result.body.id,
            checkoutUrl: result.body.url,
            providerTransactionReference: result.body.id,
            provider: this.providerId,
        };
    }
    buildProductName(request) {
        const type = request.metadata?.['type'];
        if (type === 'PERFORMANCE_FEE') {
            return 'iRexPro Performance Fee';
        }
        return request.planId ? `iRexPro Subscription — ${request.planId}` : 'iRexPro Subscription';
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
        const headerValue = headers[STRIPE_SIGNATURE_HEADER];
        const signatureHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
        if (!signatureHeader)
            return false;
        try {
            const { timestamp, signatures } = this.parseSignatureHeader(signatureHeader);
            if (!timestamp || signatures.length === 0)
                return false;
            const nowSeconds = Math.floor(Date.now() / 1000);
            if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS)
                return false;
            const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
            const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
            const expectedBuf = Buffer.from(expected, 'utf8');
            return signatures.some((sig) => {
                const providedBuf = Buffer.from(sig, 'utf8');
                return providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
            });
        }
        catch {
            return false;
        }
    }
    parseSignatureHeader(header) {
        let timestamp = null;
        const signatures = [];
        for (const part of header.split(',')) {
            const [key, value] = part.split('=');
            if (!key || value === undefined)
                continue;
            const trimmedKey = key.trim();
            if (trimmedKey === 't') {
                const parsed = Number(value.trim());
                timestamp = Number.isFinite(parsed) ? parsed : null;
            }
            else if (trimmedKey === 'v1') {
                signatures.push(value.trim());
            }
        }
        return { timestamp, signatures };
    }
    parseWebhookEvent(rawBody, _headers) {
        let payload = null;
        try {
            payload = JSON.parse(rawBody.toString('utf8'));
        }
        catch {
            return {
                eventType: payment_provider_interface_1.PaymentEventType.UNKNOWN,
                providerEventId: `stripe_unparseable_${Date.now()}`,
            };
        }
        const eventType = payload?.type;
        const dataObject = payload?.data?.object ?? {};
        const providerEventId = typeof payload?.id === 'string' && payload.id ? payload.id : `stripe_unknown_${Date.now()}`;
        switch (eventType) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded': {
                const session = dataObject;
                const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
                return {
                    eventType: paid ? payment_provider_interface_1.PaymentEventType.PAYMENT_SUCCEEDED : payment_provider_interface_1.PaymentEventType.UNKNOWN,
                    providerEventId,
                    providerTransactionReference: typeof session.id === 'string' ? session.id : undefined,
                    providerCustomerId: typeof session.customer === 'string' ? session.customer : undefined,
                    amountMinor: typeof session.amount_total === 'number' ? session.amount_total : undefined,
                    currency: typeof session.currency === 'string' ? session.currency : undefined,
                    metadata: this.safeInboundMetadata(session.metadata),
                };
            }
            case 'checkout.session.expired':
            case 'checkout.session.async_payment_failed': {
                const session = dataObject;
                return {
                    eventType: payment_provider_interface_1.PaymentEventType.PAYMENT_FAILED,
                    providerEventId,
                    providerTransactionReference: typeof session.id === 'string' ? session.id : undefined,
                    metadata: this.safeInboundMetadata(session.metadata),
                };
            }
            case 'payment_intent.succeeded': {
                const intent = dataObject;
                return {
                    eventType: payment_provider_interface_1.PaymentEventType.PAYMENT_SUCCEEDED,
                    providerEventId,
                    providerTransactionReference: typeof intent.id === 'string' ? intent.id : undefined,
                    amountMinor: typeof intent.amount === 'number' ? intent.amount : undefined,
                    currency: typeof intent.currency === 'string' ? intent.currency : undefined,
                    metadata: this.safeInboundMetadata(intent.metadata),
                };
            }
            case 'payment_intent.payment_failed': {
                const intent = dataObject;
                return {
                    eventType: payment_provider_interface_1.PaymentEventType.PAYMENT_FAILED,
                    providerEventId,
                    providerTransactionReference: typeof intent.id === 'string' ? intent.id : undefined,
                    metadata: this.safeInboundMetadata(intent.metadata),
                };
            }
            default:
                this.logger.log(`[Stripe] Unhandled webhook event type: ${eventType ?? 'unknown'}`);
                return { eventType: payment_provider_interface_1.PaymentEventType.UNKNOWN, providerEventId };
        }
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
        if (providerReference.startsWith('pi_')) {
            return this.getPaymentIntentStatus(providerReference, secretKey);
        }
        return this.getCheckoutSessionStatus(providerReference, secretKey);
    }
    async getCheckoutSessionStatus(providerReference, secretKey) {
        const result = await this.httpClient.request(`${this.getBaseUrl()}/v1/checkout/sessions/${encodeURIComponent(providerReference)}`, { method: 'GET', secretKey });
        if (!result.ok || !result.body) {
            return {
                providerReference,
                status: 'FAILED',
                failureMessage: this.safeMessage(result.errorMessage) ?? 'Unable to verify transaction status',
            };
        }
        const data = result.body;
        return {
            providerReference,
            status: this.mapCheckoutSessionStatus(data.status, data.payment_status),
            amountMinor: typeof data.amount_total === 'number' ? data.amount_total : undefined,
            currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : undefined,
        };
    }
    async getPaymentIntentStatus(providerReference, secretKey) {
        const result = await this.httpClient.request(`${this.getBaseUrl()}/v1/payment_intents/${encodeURIComponent(providerReference)}`, { method: 'GET', secretKey });
        if (!result.ok || !result.body) {
            return {
                providerReference,
                status: 'FAILED',
                failureMessage: this.safeMessage(result.errorMessage) ?? 'Unable to verify transaction status',
            };
        }
        const data = result.body;
        const status = this.mapPaymentIntentStatus(data.status);
        return {
            providerReference,
            status,
            amountMinor: typeof data.amount === 'number' ? data.amount : undefined,
            currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : undefined,
            failureCode: status === 'FAILED' ? 'STRIPE_PAYMENT_FAILED' : undefined,
            failureMessage: status === 'FAILED' ? this.safeMessage(data.last_payment_error?.message) : undefined,
        };
    }
    mapCheckoutSessionStatus(status, paymentStatus) {
        if (status === 'expired')
            return 'CANCELLED';
        if (status === 'complete' && (paymentStatus === 'paid' || paymentStatus === 'no_payment_required')) {
            return 'SUCCEEDED';
        }
        return 'PENDING';
    }
    mapPaymentIntentStatus(status) {
        switch (status) {
            case 'succeeded':
                return 'SUCCEEDED';
            case 'processing':
                return 'PROCESSING';
            case 'canceled':
                return 'CANCELLED';
            case 'requires_payment_method':
            case 'requires_action':
            case 'requires_confirmation':
            case 'requires_capture':
                return 'PENDING';
            default:
                return 'FAILED';
        }
    }
    safeMessage(message) {
        if (!message)
            return undefined;
        return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    }
};
exports.StripePaymentProvider = StripePaymentProvider;
exports.StripePaymentProvider = StripePaymentProvider = StripePaymentProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        stripe_http_client_1.StripeHttpClient])
], StripePaymentProvider);
//# sourceMappingURL=stripe.provider.js.map