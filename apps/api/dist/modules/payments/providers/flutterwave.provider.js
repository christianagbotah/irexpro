"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlutterwavePaymentProvider = void 0;
const common_1 = require("@nestjs/common");
const base_provider_1 = require("./base-provider");
let FlutterwavePaymentProvider = class FlutterwavePaymentProvider extends base_provider_1.BasePaymentProvider {
    constructor() {
        super(...arguments);
        this.providerId = 'flutterwave';
        this.displayName = 'Flutterwave';
        this.supportedCountries = ['GH', 'NG', 'KE', 'ZA', 'UG', 'TZ', 'CM', 'CI', 'SN'];
        this.supportedCurrencies = ['NGN', 'GHS', 'KES', 'ZAR', 'UGX', 'TZS', 'USD'];
        this.isLive = false;
        this.supportedPaymentMethods = ['card', 'mobile_money', 'bank_transfer', 'ussd'];
    }
};
exports.FlutterwavePaymentProvider = FlutterwavePaymentProvider;
exports.FlutterwavePaymentProvider = FlutterwavePaymentProvider = __decorate([
    (0, common_1.Injectable)()
], FlutterwavePaymentProvider);
//# sourceMappingURL=flutterwave.provider.js.map