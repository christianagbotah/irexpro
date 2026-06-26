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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PaymentRoutingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentRoutingService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const country_config_entity_1 = require("../../global-config/entities/country-config.entity");
const payment_provider_registry_1 = require("../registry/payment-provider.registry");
let PaymentRoutingService = PaymentRoutingService_1 = class PaymentRoutingService {
    constructor(registry, countryConfigRepo) {
        this.registry = registry;
        this.countryConfigRepo = countryConfigRepo;
        this.logger = new common_1.Logger(PaymentRoutingService_1.name);
    }
    async getAvailableProviders(countryCode, currency) {
        const config = await this.countryConfigRepo.findOne({
            where: { countryCode: countryCode.toUpperCase(), isActive: true, isBlocked: false },
        });
        const enabledIds = config?.enabledPaymentProviders ?? [];
        const allProviders = this.registry.getAvailableProviders();
        return allProviders
            .filter((p) => {
            if (p.providerId === 'manual')
                return false;
            if (!enabledIds.includes(p.providerId))
                return false;
            const supportsCurrency = p.supportedCurrencies.includes(currency) || p.supportedCurrencies.includes('*');
            const supportsCountry = p.supportedCountries.includes(countryCode.toUpperCase()) ||
                p.supportedCountries.includes('*');
            return supportsCurrency && supportsCountry;
        })
            .map((p) => ({
            providerId: p.providerId,
            displayName: p.displayName,
            supportedCurrencies: p.supportedCurrencies,
            supportedCountries: p.supportedCountries,
            supportedPaymentMethods: p.supportedPaymentMethods,
            isLive: p.isLive,
            isSandbox: !p.isLive,
        }));
    }
    getAllPublicProviders() {
        return this.registry
            .getAvailableProviders()
            .filter((p) => p.providerId !== 'manual')
            .map((p) => ({
            providerId: p.providerId,
            displayName: p.displayName,
            supportedCurrencies: p.supportedCurrencies,
            supportedCountries: p.supportedCountries,
            supportedPaymentMethods: p.supportedPaymentMethods,
            isLive: p.isLive,
            isSandbox: !p.isLive,
        }));
    }
    async routeForCheckout(countryCode, currency, preferredProviderId) {
        const country = countryCode.toUpperCase();
        const config = await this.countryConfigRepo.findOne({
            where: { countryCode: country },
        });
        if (!config) {
            throw new common_1.NotFoundException(`No CountryConfig found for country: ${country}`);
        }
        if (config.isBlocked) {
            throw new common_1.BadRequestException(`Payments are not available in your country (${country})`);
        }
        const enabledIds = config.enabledPaymentProviders ?? [];
        const publicEnabledIds = enabledIds.filter((id) => id !== 'manual');
        if (preferredProviderId) {
            if (!publicEnabledIds.includes(preferredProviderId)) {
                throw new common_1.BadRequestException(`Payment provider '${preferredProviderId}' is not available in ${country}`);
            }
            const preferred = this.registry.getProvider(preferredProviderId);
            if (!this.providerSupportsCurrency(preferred, currency)) {
                throw new common_1.BadRequestException(`Provider '${preferredProviderId}' does not support currency ${currency}`);
            }
            this.logger.log(`[Routing] Using preferred provider ${preferredProviderId} for ${country}/${currency}`);
            return { provider: preferred, reason: 'preferred' };
        }
        for (const providerId of publicEnabledIds) {
            const candidate = this.tryGetProvider(providerId);
            if (!candidate)
                continue;
            if (this.providerSupportsCountry(candidate, country) &&
                this.providerSupportsCurrency(candidate, currency)) {
                this.logger.log(`[Routing] Selected ${providerId} for ${country}/${currency} via CountryConfig`);
                return { provider: candidate, reason: 'country_config' };
            }
        }
        const stripe = this.tryGetProvider('stripe');
        if (stripe && this.providerSupportsCurrency(stripe, currency)) {
            this.logger.warn(`[Routing] Falling back to Stripe for ${country}/${currency} — no preferred provider matched`);
            return { provider: stripe, reason: 'stripe_fallback' };
        }
        throw new common_1.BadRequestException(`No payment provider is available for country=${country}, currency=${currency}`);
    }
    tryGetProvider(providerId) {
        try {
            return this.registry.getProvider(providerId);
        }
        catch {
            return null;
        }
    }
    providerSupportsCurrency(p, currency) {
        return p.supportedCurrencies.includes(currency) || p.supportedCurrencies.includes('*');
    }
    providerSupportsCountry(p, country) {
        return p.supportedCountries.includes(country) || p.supportedCountries.includes('*');
    }
};
exports.PaymentRoutingService = PaymentRoutingService;
exports.PaymentRoutingService = PaymentRoutingService = PaymentRoutingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(country_config_entity_1.CountryConfig)),
    __metadata("design:paramtypes", [payment_provider_registry_1.PaymentProviderRegistry,
        typeorm_2.Repository])
], PaymentRoutingService);
//# sourceMappingURL=payment-routing.service.js.map