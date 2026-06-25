"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripePaymentProvider = void 0;
const common_1 = require("@nestjs/common");
const base_provider_1 = require("./base-provider");
let StripePaymentProvider = class StripePaymentProvider extends base_provider_1.BasePaymentProvider {
    constructor() {
        super(...arguments);
        this.providerId = 'stripe';
        this.displayName = 'Stripe';
        this.supportedCountries = ['GB', 'US', 'CA', 'AU', 'SG', 'AE', 'DE', 'FR', 'NL', 'IE'];
        this.supportedCurrencies = ['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'SGD', 'AED'];
        this.isLive = false;
    }
};
exports.StripePaymentProvider = StripePaymentProvider;
exports.StripePaymentProvider = StripePaymentProvider = __decorate([
    (0, common_1.Injectable)()
], StripePaymentProvider);
//# sourceMappingURL=stripe.provider.js.map