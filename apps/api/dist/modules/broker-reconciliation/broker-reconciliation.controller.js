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
exports.BrokerReconciliationController = void 0;
const common_1 = require("@nestjs/common");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const role_entity_1 = require("../users/entities/role.entity");
const broker_trade_reconciliation_service_1 = require("./services/broker-trade-reconciliation.service");
const run_reconciliation_dto_1 = require("./dto/run-reconciliation.dto");
let BrokerReconciliationController = class BrokerReconciliationController {
    constructor(svc) {
        this.svc = svc;
    }
    runReconciliation(dto, actor, req) {
        return this.svc.runReconciliation(dto.userId, dto.brokerConnectionId, new Date(dto.fromTime), new Date(dto.toTime), actor.id, req.ip);
    }
    getRuns(currentUser, queryUserId) {
        const isAdmin = currentUser.roles?.some((r) => r === role_entity_1.RoleName.ADMIN || r === role_entity_1.RoleName.SUPER_ADMIN);
        const effectiveUserId = isAdmin ? queryUserId : currentUser.id;
        return this.svc.getRuns(effectiveUserId);
    }
    getReconciledTrades(currentUser, queryUserId, brokerConnectionId) {
        const isAdmin = currentUser.roles?.some((r) => r === role_entity_1.RoleName.ADMIN || r === role_entity_1.RoleName.SUPER_ADMIN);
        if (!isAdmin && queryUserId && queryUserId !== currentUser.id) {
            throw new common_1.ForbiddenException('You can only view your own reconciliation data');
        }
        const effectiveUserId = isAdmin ? queryUserId : currentUser.id;
        return this.svc.getReconciledTrades(effectiveUserId, brokerConnectionId);
    }
};
exports.BrokerReconciliationController = BrokerReconciliationController;
__decorate([
    (0, common_1.Post)('closed-trades/run'),
    (0, roles_decorator_1.Roles)(role_entity_1.RoleName.ADMIN, role_entity_1.RoleName.SUPER_ADMIN),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [run_reconciliation_dto_1.RunReconciliationDto, Object, Object]),
    __metadata("design:returntype", void 0)
], BrokerReconciliationController.prototype, "runReconciliation", null);
__decorate([
    (0, common_1.Get)('runs'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], BrokerReconciliationController.prototype, "getRuns", null);
__decorate([
    (0, common_1.Get)('reconciled-trades'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('userId')),
    __param(2, (0, common_1.Query)('brokerConnectionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], BrokerReconciliationController.prototype, "getReconciledTrades", null);
exports.BrokerReconciliationController = BrokerReconciliationController = __decorate([
    (0, common_1.Controller)('api/v1/broker-reconciliation'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [broker_trade_reconciliation_service_1.BrokerTradeReconciliationService])
], BrokerReconciliationController);
//# sourceMappingURL=broker-reconciliation.controller.js.map