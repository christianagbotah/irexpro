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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const subscriptions_service_1 = require("./subscriptions.service");
const manual_activate_dto_1 = require("./dto/manual-activate.dto");
const checkout_dto_1 = require("./dto/checkout.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const user_entity_1 = require("../users/entities/user.entity");
const role_entity_1 = require("../users/entities/role.entity");
let SubscriptionsController = class SubscriptionsController {
    constructor(subscriptionsService) {
        this.subscriptionsService = subscriptionsService;
    }
    async getPlans() {
        return this.subscriptionsService.findActivePlans();
    }
    async getMySubscription(user) {
        return this.subscriptionsService.findUserSubscription(user.id);
    }
    async checkout(dto, user, req, idempotencyKeyHeader) {
        return this.subscriptionsService.initiateCheckout({
            userId: user.id,
            email: user.email,
            planId: dto.planId,
            currency: dto.currency,
            countryCode: dto.countryCode ?? 'US',
            provider: dto.provider,
            ipAddress: req.ip,
            idempotencyKey: idempotencyKeyHeader?.trim() || dto.idempotencyKey,
        });
    }
    async cancelSubscription(dto, user, req) {
        return this.subscriptionsService.cancelSubscription(user.id, dto.reason, req.ip);
    }
    async manualActivate(dto, admin, req) {
        return this.subscriptionsService.manualActivate(dto.userId, dto.planId, admin.id, req.ip);
    }
};
exports.SubscriptionsController = SubscriptionsController;
__decorate([
    (0, common_1.Get)('plans'),
    (0, swagger_1.ApiOperation)({ summary: 'List all active subscription plans' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SubscriptionsController.prototype, "getPlans", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, swagger_1.ApiOperation)({ summary: 'Get current user subscription' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User]),
    __metadata("design:returntype", Promise)
], SubscriptionsController.prototype, "getMySubscription", null);
__decorate([
    (0, common_1.Post)('checkout'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({
        summary: 'Initiate subscription checkout',
        description: 'Creates a pending invoice and payment transaction, then returns a checkout URL or session ' +
            'reference. If an identical checkout is already pending, the existing invoice/transaction/ ' +
            'session is safely reused instead of creating a duplicate. Subscription is activated ONLY ' +
            'after verified provider webhook — never on frontend callback alone. Optionally accepts an ' +
            '`Idempotency-Key` header (or `idempotencyKey` body field) so repeated requests with the ' +
            'same key and parameters return the same result.',
    }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Checkout session created or safely reused' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid plan, pricing, or provider' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Plan not found' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'Active subscription/paid invoice/idempotency conflict' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [checkout_dto_1.CheckoutDto,
        user_entity_1.User, Object, String]),
    __metadata("design:returntype", Promise)
], SubscriptionsController.prototype, "checkout", null);
__decorate([
    (0, common_1.Post)('cancel'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel current subscription' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Subscription cancelled' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'No active subscription found' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [checkout_dto_1.CancelSubscriptionDto,
        user_entity_1.User, Object]),
    __metadata("design:returntype", Promise)
], SubscriptionsController.prototype, "cancelSubscription", null);
__decorate([
    (0, common_1.Post)('dev/manual-activate'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(role_entity_1.RoleName.ADMIN, role_entity_1.RoleName.SUPER_ADMIN),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '[DEV/TEST ONLY] Manually activate a subscription — Admin only',
        description: 'DEVELOPMENT AND TESTING ONLY. Uses ManualPaymentProvider. ' +
            'Not for commercial use. All activations are audit-logged.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Subscription manually activated' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Admin role required' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [manual_activate_dto_1.ManualActivateDto,
        user_entity_1.User, Object]),
    __metadata("design:returntype", Promise)
], SubscriptionsController.prototype, "manualActivate", null);
exports.SubscriptionsController = SubscriptionsController = __decorate([
    (0, swagger_1.ApiTags)('Subscriptions'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('subscriptions'),
    __metadata("design:paramtypes", [subscriptions_service_1.SubscriptionsService])
], SubscriptionsController);
//# sourceMappingURL=subscriptions.controller.js.map