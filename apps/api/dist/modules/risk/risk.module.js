"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const risk_service_1 = require("./risk.service");
const risk_controller_1 = require("./risk.controller");
const risk_profile_entity_1 = require("./entities/risk-profile.entity");
const risk_violation_entity_1 = require("./entities/risk-violation.entity");
const broker_module_1 = require("../broker/broker.module");
const audit_module_1 = require("../audit/audit.module");
const execution_module_1 = require("../execution/execution.module");
let RiskModule = class RiskModule {
};
exports.RiskModule = RiskModule;
exports.RiskModule = RiskModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([risk_profile_entity_1.RiskProfile, risk_violation_entity_1.RiskViolation]),
            broker_module_1.BrokerModule,
            audit_module_1.AuditModule,
            (0, common_1.forwardRef)(() => execution_module_1.ExecutionModule),
        ],
        controllers: [risk_controller_1.RiskController],
        providers: [risk_service_1.RiskService],
        exports: [risk_service_1.RiskService],
    })
], RiskModule);
//# sourceMappingURL=risk.module.js.map