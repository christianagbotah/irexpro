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
exports.PerformanceFeesController = void 0;
const common_1 = require("@nestjs/common");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const role_entity_1 = require("../users/entities/role.entity");
const user_entity_1 = require("../users/entities/user.entity");
const performance_fee_service_1 = require("./services/performance-fee.service");
const create_policy_dto_1 = require("./dto/create-policy.dto");
const calculate_assessment_dto_1 = require("./dto/calculate-assessment.dto");
const create_ledger_entry_dto_1 = require("./dto/create-ledger-entry.dto");
let PerformanceFeesController = class PerformanceFeesController {
    constructor(svc) {
        this.svc = svc;
    }
    getPolicies() {
        return this.svc.getPolicies();
    }
    createPolicy(dto, admin) {
        return this.svc.createPolicy(dto, admin.id);
    }
    getMyPerformanceSummary(user) {
        return this.svc.getUserSummary(user.id);
    }
    getAssessments(userId) {
        return this.svc.getAssessments(userId);
    }
    calculateAssessment(dto, admin) {
        return this.svc.calculateAssessment(dto.userId, dto.brokerConnectionId ?? null, dto.currency, new Date(dto.periodStart), new Date(dto.periodEnd), admin.id);
    }
    invoiceAssessment(id, admin) {
        return this.svc.invoiceAssessment(id, admin.id);
    }
    createLedgerEntry(dto, admin) {
        return this.svc.recordLedgerEntry(dto, admin.id);
    }
};
exports.PerformanceFeesController = PerformanceFeesController;
__decorate([
    (0, common_1.Get)('policies'),
    (0, roles_decorator_1.Roles)(role_entity_1.RoleName.ADMIN, role_entity_1.RoleName.SUPER_ADMIN),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PerformanceFeesController.prototype, "getPolicies", null);
__decorate([
    (0, common_1.Post)('policies'),
    (0, roles_decorator_1.Roles)(role_entity_1.RoleName.ADMIN, role_entity_1.RoleName.SUPER_ADMIN),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_policy_dto_1.CreatePolicyDto, user_entity_1.User]),
    __metadata("design:returntype", void 0)
], PerformanceFeesController.prototype, "createPolicy", null);
__decorate([
    (0, common_1.Get)('me/summary'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User]),
    __metadata("design:returntype", void 0)
], PerformanceFeesController.prototype, "getMyPerformanceSummary", null);
__decorate([
    (0, common_1.Get)('assessments'),
    (0, roles_decorator_1.Roles)(role_entity_1.RoleName.ADMIN, role_entity_1.RoleName.SUPER_ADMIN),
    __param(0, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PerformanceFeesController.prototype, "getAssessments", null);
__decorate([
    (0, common_1.Post)('assessments/calculate'),
    (0, roles_decorator_1.Roles)(role_entity_1.RoleName.ADMIN, role_entity_1.RoleName.SUPER_ADMIN),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [calculate_assessment_dto_1.CalculateAssessmentDto, user_entity_1.User]),
    __metadata("design:returntype", void 0)
], PerformanceFeesController.prototype, "calculateAssessment", null);
__decorate([
    (0, common_1.Post)('assessments/:id/invoice'),
    (0, roles_decorator_1.Roles)(role_entity_1.RoleName.ADMIN, role_entity_1.RoleName.SUPER_ADMIN),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, user_entity_1.User]),
    __metadata("design:returntype", void 0)
], PerformanceFeesController.prototype, "invoiceAssessment", null);
__decorate([
    (0, common_1.Post)('ledger-entries'),
    (0, roles_decorator_1.Roles)(role_entity_1.RoleName.ADMIN, role_entity_1.RoleName.SUPER_ADMIN),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_ledger_entry_dto_1.CreateLedgerEntryDto, user_entity_1.User]),
    __metadata("design:returntype", void 0)
], PerformanceFeesController.prototype, "createLedgerEntry", null);
exports.PerformanceFeesController = PerformanceFeesController = __decorate([
    (0, common_1.Controller)('api/v1/performance-fees'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [performance_fee_service_1.PerformanceFeeService])
], PerformanceFeesController);
//# sourceMappingURL=performance-fees.controller.js.map