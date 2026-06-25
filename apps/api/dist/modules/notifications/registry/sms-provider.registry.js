"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var SmsProviderRegistry_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmsProviderRegistry = void 0;
const common_1 = require("@nestjs/common");
let SmsProviderRegistry = SmsProviderRegistry_1 = class SmsProviderRegistry {
    constructor() {
        this.logger = new common_1.Logger(SmsProviderRegistry_1.name);
        this.providers = new Map();
    }
    register(provider) {
        this.providers.set(provider.providerId, provider);
        this.logger.log(`Registered SMS provider: ${provider.providerId} (live=${provider.isLive})`);
    }
    getProvider(providerId) {
        const provider = this.providers.get(providerId);
        if (!provider) {
            throw new common_1.NotFoundException(`SMS provider not registered: ${providerId}`);
        }
        return provider;
    }
    selectProvider(countryCode, preferredProviderId) {
        if (preferredProviderId) {
            const preferred = this.providers.get(preferredProviderId);
            if (preferred && preferred.supportedCountries.includes(countryCode))
                return preferred;
        }
        const candidates = Array.from(this.providers.values()).filter((p) => p.supportedCountries.includes(countryCode) || p.supportedCountries.includes('*'));
        if (candidates.length === 0) {
            const twilio = this.providers.get('twilio');
            if (twilio) {
                this.logger.warn(`No SMS provider for ${countryCode}, falling back to Twilio`);
                return twilio;
            }
            throw new common_1.NotFoundException(`No SMS provider available for country=${countryCode}`);
        }
        return candidates[0];
    }
};
exports.SmsProviderRegistry = SmsProviderRegistry;
exports.SmsProviderRegistry = SmsProviderRegistry = SmsProviderRegistry_1 = __decorate([
    (0, common_1.Injectable)()
], SmsProviderRegistry);
//# sourceMappingURL=sms-provider.registry.js.map