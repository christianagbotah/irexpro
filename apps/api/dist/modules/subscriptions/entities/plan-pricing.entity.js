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
exports.PlanPricing = void 0;
const typeorm_1 = require("typeorm");
const subscription_plan_entity_1 = require("./subscription-plan.entity");
let PlanPricing = class PlanPricing {
};
exports.PlanPricing = PlanPricing;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], PlanPricing.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'subscription_plan_id', type: 'uuid' }),
    __metadata("design:type", String)
], PlanPricing.prototype, "subscriptionPlanId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'country_code', type: 'varchar', length: 2, nullable: true }),
    __metadata("design:type", Object)
], PlanPricing.prototype, "countryCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'currency', type: 'varchar', length: 3 }),
    __metadata("design:type", String)
], PlanPricing.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'amount_cents', type: 'bigint' }),
    __metadata("design:type", String)
], PlanPricing.prototype, "amountCents", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'provider_plan_id', type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], PlanPricing.prototype, "providerPlanId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], PlanPricing.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], PlanPricing.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], PlanPricing.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => subscription_plan_entity_1.SubscriptionPlan, (plan) => plan.pricing, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'subscription_plan_id' }),
    __metadata("design:type", subscription_plan_entity_1.SubscriptionPlan)
], PlanPricing.prototype, "plan", void 0);
exports.PlanPricing = PlanPricing = __decorate([
    (0, typeorm_1.Entity)({ name: 'plan_pricing', schema: 'subscriptions' })
], PlanPricing);
//# sourceMappingURL=plan-pricing.entity.js.map