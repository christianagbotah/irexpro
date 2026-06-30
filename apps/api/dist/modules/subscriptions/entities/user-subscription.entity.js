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
exports.UserSubscription = exports.SubscriptionStatus = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("../../users/entities/user.entity");
const subscription_plan_entity_1 = require("./subscription-plan.entity");
var SubscriptionStatus;
(function (SubscriptionStatus) {
    SubscriptionStatus["TRIAL"] = "TRIAL";
    SubscriptionStatus["ACTIVE"] = "ACTIVE";
    SubscriptionStatus["PAST_DUE"] = "PAST_DUE";
    SubscriptionStatus["SUSPENDED"] = "SUSPENDED";
    SubscriptionStatus["CANCELLED"] = "CANCELLED";
    SubscriptionStatus["EXPIRED"] = "EXPIRED";
})(SubscriptionStatus || (exports.SubscriptionStatus = SubscriptionStatus = {}));
let UserSubscription = class UserSubscription {
};
exports.UserSubscription = UserSubscription;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], UserSubscription.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], UserSubscription.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'subscription_plan_id', type: 'uuid' }),
    __metadata("design:type", String)
], UserSubscription.prototype, "subscriptionPlanId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'status',
        type: 'enum',
        enum: SubscriptionStatus,
        default: SubscriptionStatus.TRIAL,
    }),
    __metadata("design:type", String)
], UserSubscription.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'current_period_start', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], UserSubscription.prototype, "currentPeriodStart", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'current_period_end', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], UserSubscription.prototype, "currentPeriodEnd", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'trial_ends_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], UserSubscription.prototype, "trialEndsAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'cancelled_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], UserSubscription.prototype, "cancelledAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'payment_provider', type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], UserSubscription.prototype, "paymentProvider", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'provider_subscription_reference', type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], UserSubscription.prototype, "providerSubscriptionReference", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'metadata', type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], UserSubscription.prototype, "metadata", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], UserSubscription.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], UserSubscription.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", user_entity_1.User)
], UserSubscription.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => subscription_plan_entity_1.SubscriptionPlan, (plan) => plan.subscriptions),
    (0, typeorm_1.JoinColumn)({ name: 'subscription_plan_id' }),
    __metadata("design:type", subscription_plan_entity_1.SubscriptionPlan)
], UserSubscription.prototype, "plan", void 0);
exports.UserSubscription = UserSubscription = __decorate([
    (0, typeorm_1.Entity)({ name: 'user_subscriptions', schema: 'subscriptions' })
], UserSubscription);
//# sourceMappingURL=user-subscription.entity.js.map