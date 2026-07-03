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
exports.PerformanceFeePaymentController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const roles_guard_1 = require("../../common/guards/roles.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const role_entity_1 = require("../users/entities/role.entity");
const invoice_entity_1 = require("./entities/invoice.entity");
const performance_fee_payment_service_1 = require("./services/performance-fee-payment.service");
const initiate_performance_fee_checkout_dto_1 = require("./dto/initiate-performance-fee-checkout.dto");
let PerformanceFeePaymentController = class PerformanceFeePaymentController {
    constructor(svc) {
        this.svc = svc;
    }
    isAdmin(user) {
        return !!user.roles?.some((r) => r === role_entity_1.RoleName.ADMIN || r === role_entity_1.RoleName.SUPER_ADMIN);
    }
    listInvoices(user, queryUserId, status, limit) {
        const admin = this.isAdmin(user);
        if (!admin && queryUserId && queryUserId !== user.id) {
            throw new common_1.ForbiddenException('You can only view your own performance-fee invoices');
        }
        const effectiveUserId = admin ? queryUserId ?? user.id : user.id;
        return this.svc.listUserPerformanceFeeInvoices(effectiveUserId, {
            status,
            limit: limit ? Number(limit) : undefined,
        });
    }
    getInvoice(invoiceId, user) {
        return this.svc.getInvoiceView(invoiceId, user.id, this.isAdmin(user));
    }
    initiateCheckout(invoiceId, dto, user, req) {
        return this.svc.initiatePerformanceFeeCheckout({
            invoiceId,
            requestingUserId: user.id,
            isAdmin: this.isAdmin(user),
            options: { provider: dto.provider, countryCode: dto.countryCode, currency: dto.currency },
            ipAddress: req.ip,
        });
    }
    getPaymentStatus(invoiceId, user, req) {
        return this.svc.getPerformanceFeePaymentStatus(invoiceId, user.id, this.isAdmin(user), req.ip);
    }
};
exports.PerformanceFeePaymentController = PerformanceFeePaymentController;
__decorate([
    (0, common_1.Get)('invoices'),
    (0, swagger_1.ApiOperation)({ summary: 'List performance-fee invoices (own, or any as admin)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('userId')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], PerformanceFeePaymentController.prototype, "listInvoices", null);
__decorate([
    (0, common_1.Get)('invoices/:invoiceId'),
    (0, swagger_1.ApiOperation)({ summary: 'View a single performance-fee invoice' }),
    __param(0, (0, common_1.Param)('invoiceId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PerformanceFeePaymentController.prototype, "getInvoice", null);
__decorate([
    (0, common_1.Post)('invoices/:invoiceId/checkout'),
    (0, swagger_1.ApiOperation)({ summary: 'Initiate payment checkout for a performance-fee invoice' }),
    __param(0, (0, common_1.Param)('invoiceId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, initiate_performance_fee_checkout_dto_1.InitiatePerformanceFeeCheckoutDto, Object, Object]),
    __metadata("design:returntype", void 0)
], PerformanceFeePaymentController.prototype, "initiateCheckout", null);
__decorate([
    (0, common_1.Get)('invoices/:invoiceId/payment-status'),
    (0, swagger_1.ApiOperation)({ summary: 'Get payment status for a performance-fee invoice' }),
    __param(0, (0, common_1.Param)('invoiceId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], PerformanceFeePaymentController.prototype, "getPaymentStatus", null);
exports.PerformanceFeePaymentController = PerformanceFeePaymentController = __decorate([
    (0, swagger_1.ApiTags)('Performance Fee Payments'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.Controller)('api/v1/performance-fees'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [performance_fee_payment_service_1.PerformanceFeePaymentService])
], PerformanceFeePaymentController);
//# sourceMappingURL=performance-fee-payment.controller.js.map