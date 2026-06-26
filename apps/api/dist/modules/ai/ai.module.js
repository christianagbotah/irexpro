"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ai_service_1 = require("./ai.service");
const ai_signal_service_1 = require("./ai-signal.service");
const ai_controller_1 = require("./ai.controller");
const strategy_module_1 = require("../strategy/strategy.module");
const audit_module_1 = require("../audit/audit.module");
const internal_api_key_guard_1 = require("../../common/guards/internal-api-key.guard");
let AiModule = class AiModule {
};
exports.AiModule = AiModule;
exports.AiModule = AiModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, strategy_module_1.StrategyModule, audit_module_1.AuditModule],
        controllers: [ai_controller_1.AiController],
        providers: [ai_service_1.AiService, ai_signal_service_1.AiSignalService, internal_api_key_guard_1.InternalApiKeyGuard],
        exports: [ai_service_1.AiService, ai_signal_service_1.AiSignalService],
    })
], AiModule);
//# sourceMappingURL=ai.module.js.map