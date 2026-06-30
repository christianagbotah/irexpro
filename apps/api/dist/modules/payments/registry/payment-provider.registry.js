"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PaymentProviderRegistry_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentProviderRegistry = void 0;
const common_1 = require("@nestjs/common");
let PaymentProviderRegistry = PaymentProviderRegistry_1 = class PaymentProviderRegistry {
    constructor() {
        this.logger = new common_1.Logger(PaymentProviderRegistry_1.name);
        this.providers = new Map();
    }
    register(provider) {
        this.providers.set(provider.providerId, provider);
        this.logger.log(`Registered payment provider: ${provider.providerId} (live=${provider.isLive})`);
    }
    getProvider(providerId) {
        const provider = this.providers.get(providerId);
        if (!provider) {
            throw new common_1.NotFoundException(`Payment provider not registered: ${providerId}`);
        }
        return provider;
    }
    getAvailableProviders() {
        return Array.from(this.providers.values());
    }
    selectProvider(countryCode, currency, preferredProviderId) {
        if (preferredProviderId) {
            const preferred = this.providers.get(preferredProviderId);
            if (preferred && preferred.supportedCountries.includes(countryCode)) {
                return preferred;
            }
        }
        const candidates = Array.from(this.providers.values()).filter((p) => p.supportedCountries.includes(countryCode) &&
            p.supportedCurrencies.includes(currency) &&
            p.providerId !== 'manual');
        if (candidates.length === 0) {
            const fallback = this.providers.get('stripe');
            if (fallback) {
                this.logger.warn(`No provider found for ${countryCode}/${currency}, falling back to Stripe`);
                return fallback;
            }
            throw new common_1.NotFoundException(`No payment provider available for country=${countryCode} currency=${currency}`);
        }
        return candidates[0];
    }
};
exports.PaymentProviderRegistry = PaymentProviderRegistry;
exports.PaymentProviderRegistry = PaymentProviderRegistry = PaymentProviderRegistry_1 = __decorate([
    (0, common_1.Injectable)()
], PaymentProviderRegistry);
//# sourceMappingURL=payment-provider.registry.js.map