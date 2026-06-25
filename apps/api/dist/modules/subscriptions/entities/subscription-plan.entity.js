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
exports.SubscriptionPlan = exports.BillingInterval = void 0;
const typeorm_1 = require("typeorm");
const plan_pricing_entity_1 = require("./plan-pricing.entity");
const user_subscription_entity_1 = require("./user-subscription.entity");
var BillingInterval;
(function (BillingInterval) {
    BillingInterval["MONTHLY"] = "MONTHLY";
    BillingInterval["QUARTERLY"] = "QUARTERLY";
    BillingInterval["ANNUAL"] = "ANNUAL";
})(BillingInterval || (exports.BillingInterval = BillingInterval = {}));
let SubscriptionPlan = class SubscriptionPlan {
};
exports.SubscriptionPlan = SubscriptionPlan;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], SubscriptionPlan.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100 }),
    __metadata("design:type", String)
], SubscriptionPlan.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, unique: true }),
    __metadata("design:type", String)
], SubscriptionPlan.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], SubscriptionPlan.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'billing_interval',
        type: 'enum',
        enum: BillingInterval,
        default: BillingInterval.MONTHLY,
    }),
    __metadata("design:type", String)
], SubscriptionPlan.prototype, "billingInterval", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'trial_days', type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], SubscriptionPlan.prototype, "trialDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'performance_fee_rate', type: 'numeric', precision: 5, scale: 4, default: 0.2 }),
    __metadata("design:type", String)
], SubscriptionPlan.prototype, "performanceFeeRate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'max_concurrent_trades', type: 'integer', default: 5 }),
    __metadata("design:type", Number)
], SubscriptionPlan.prototype, "maxConcurrentTrades", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'allows_ai_auto_trading', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], SubscriptionPlan.prototype, "allowsAiAutoTrading", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'features', type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], SubscriptionPlan.prototype, "features", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], SubscriptionPlan.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], SubscriptionPlan.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], SubscriptionPlan.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => plan_pricing_entity_1.PlanPricing, (pricing) => pricing.plan, { cascade: true }),
    __metadata("design:type", Array)
], SubscriptionPlan.prototype, "pricing", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => user_subscription_entity_1.UserSubscription, (sub) => sub.plan),
    __metadata("design:type", Array)
], SubscriptionPlan.prototype, "subscriptions", void 0);
exports.SubscriptionPlan = SubscriptionPlan = __decorate([
    (0, typeorm_1.Entity)({ name: 'subscription_plans', schema: 'subscriptions' })
], SubscriptionPlan);
//# sourceMappingURL=subscription-plan.entity.js.map