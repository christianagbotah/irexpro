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
exports.PerformanceBillingController = void 0;
const common_1 = require("@nestjs/common");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const role_entity_1 = require("../users/entities/role.entity");
const performance_fee_billing_cycle_service_1 = require("./services/performance-fee-billing-cycle.service");
const create_billing_cycle_dto_1 = require("./dto/create-billing-cycle.dto");
const run_billing_cycle_dto_1 = require("./dto/run-billing-cycle.dto");
const cancel_billing_cycle_dto_1 = require("./dto/cancel-billing-cycle.dto");
const performance_fee_billing_cycle_entity_1 = require("./entities/performance-fee-billing-cycle.entity");
let PerformanceBillingController = class PerformanceBillingController {
    constructor(svc) {
        this.svc = svc;
    }
    createCycle(dto, actor, req) {
        return this.svc.createBillingCycle(dto.userId, dto.brokerConnectionId ?? null, new Date(dto.periodStart), new Date(dto.periodEnd), dto.currency, actor.id, req.ip);
    }
    runCycle(id, actor, req) {
        return this.svc.runBillingCycle(id, actor.id, req.ip);
    }
    runDirect(dto, actor, req) {
        return this.svc.runBillingCycleForUserPeriod(dto.userId, dto.brokerConnectionId ?? null, new Date(dto.periodStart), new Date(dto.periodEnd), dto.currency, actor.id, req.ip);
    }
    listCycles(currentUser, queryUserId, status) {
        const isAdmin = this.isAdmin(currentUser);
        if (!isAdmin && queryUserId && queryUserId !== currentUser.id) {
            throw new common_1.ForbiddenException('You can only view your own billing cycles');
        }
        const effectiveUserId = isAdmin ? queryUserId : currentUser.id;
        return this.svc.listBillingCycles({ userId: effectiveUserId, status });
    }
    async getCycle(id, currentUser) {
        const cycle = await this.svc.getBillingCycle(id);
        if (!this.isAdmin(currentUser) && cycle.userId !== currentUser.id) {
            throw new common_1.ForbiddenException('You can only view your own billing cycles');
        }
        return cycle;
    }
    cancelCycle(id, dto, actor, req) {
        return this.svc.cancelBillingCycle(id, dto.reason, actor.id, req.ip);
    }
    isAdmin(user) {
        return user.roles?.some((r) => r === role_entity_1.RoleName.ADMIN || r === role_entity_1.RoleName.SUPER_ADMIN) ?? false;
    }
};
exports.PerformanceBillingController = PerformanceBillingController;
__decorate([
    (0, common_1.Post)('cycles'),
    (0, roles_decorator_1.Roles)(role_entity_1.RoleName.ADMIN, role_entity_1.RoleName.SUPER_ADMIN),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_billing_cycle_dto_1.CreateBillingCycleDto, Object, Object]),
    __metadata("design:returntype", void 0)
], PerformanceBillingController.prototype, "createCycle", null);
__decorate([
    (0, common_1.Post)('cycles/:id/run'),
    (0, roles_decorator_1.Roles)(role_entity_1.RoleName.ADMIN, role_entity_1.RoleName.SUPER_ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], PerformanceBillingController.prototype, "runCycle", null);
__decorate([
    (0, common_1.Post)('cycles/run'),
    (0, roles_decorator_1.Roles)(role_entity_1.RoleName.ADMIN, role_entity_1.RoleName.SUPER_ADMIN),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [run_billing_cycle_dto_1.RunBillingCycleDto, Object, Object]),
    __metadata("design:returntype", void 0)
], PerformanceBillingController.prototype, "runDirect", null);
__decorate([
    (0, common_1.Get)('cycles'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('userId')),
    __param(2, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], PerformanceBillingController.prototype, "listCycles", null);
__decorate([
    (0, common_1.Get)('cycles/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PerformanceBillingController.prototype, "getCycle", null);
__decorate([
    (0, common_1.Post)('cycles/:id/cancel'),
    (0, roles_decorator_1.Roles)(role_entity_1.RoleName.ADMIN, role_entity_1.RoleName.SUPER_ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, cancel_billing_cycle_dto_1.CancelBillingCycleDto, Object, Object]),
    __metadata("design:returntype", void 0)
], PerformanceBillingController.prototype, "cancelCycle", null);
exports.PerformanceBillingController = PerformanceBillingController = __decorate([
    (0, common_1.Controller)('api/v1/performance-billing'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [performance_fee_billing_cycle_service_1.PerformanceFeeBillingCycleService])
], PerformanceBillingController);
//# sourceMappingURL=performance-billing.controller.js.map