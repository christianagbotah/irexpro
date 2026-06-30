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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CountryConfig = void 0;
const typeorm_1 = require("typeorm");
let CountryConfig = class CountryConfig {
};
exports.CountryConfig = CountryConfig;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], CountryConfig.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'country_code', type: 'varchar', length: 2, unique: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], CountryConfig.prototype, "countryCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'country_name', type: 'varchar', length: 100 }),
    __metadata("design:type", String)
], CountryConfig.prototype, "countryName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'region', type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], CountryConfig.prototype, "region", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'default_currency', type: 'varchar', length: 3 }),
    __metadata("design:type", String)
], CountryConfig.prototype, "defaultCurrency", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'supported_currencies', type: 'jsonb', default: '[]' }),
    __metadata("design:type", Array)
], CountryConfig.prototype, "supportedCurrencies", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'enabled_payment_providers', type: 'jsonb', default: '[]' }),
    __metadata("design:type", Array)
], CountryConfig.prototype, "enabledPaymentProviders", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'enabled_sms_providers', type: 'jsonb', default: '[]' }),
    __metadata("design:type", Array)
], CountryConfig.prototype, "enabledSmsProviders", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'enabled_brokers', type: 'jsonb', default: '[]' }),
    __metadata("design:type", Array)
], CountryConfig.prototype, "enabledBrokers", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'kyc_requirements', type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], CountryConfig.prototype, "kycRequirements", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'subscription_plan_overrides', type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], CountryConfig.prototype, "subscriptionPlanOverrides", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'tax_rules_placeholder', type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], CountryConfig.prototype, "taxRulesPlaceholder", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'timezone', type: 'varchar', length: 50, default: 'UTC' }),
    __metadata("design:type", String)
], CountryConfig.prototype, "timezone", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'locale', type: 'varchar', length: 10, default: 'en' }),
    __metadata("design:type", String)
], CountryConfig.prototype, "locale", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], CountryConfig.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_blocked', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], CountryConfig.prototype, "isBlocked", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'forex_trading_allowed', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], CountryConfig.prototype, "forexTradingAllowed", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'special_disclosure_required', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], CountryConfig.prototype, "specialDisclosureRequired", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'special_disclosure_text', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], CountryConfig.prototype, "specialDisclosureText", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], CountryConfig.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], CountryConfig.prototype, "updatedAt", void 0);
exports.CountryConfig = CountryConfig = __decorate([
    (0, typeorm_1.Entity)({ name: 'country_configs', schema: 'platform' })
], CountryConfig);
//# sourceMappingURL=country-config.entity.js.map