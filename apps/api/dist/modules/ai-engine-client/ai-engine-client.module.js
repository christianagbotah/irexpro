"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiEngineClientModule = void 0;
const common_1 = require("@nestjs/common");
const ai_engine_client_service_1 = require("./ai-engine-client.service");
let AiEngineClientModule = class AiEngineClientModule {
};
exports.AiEngineClientModule = AiEngineClientModule;
exports.AiEngineClientModule = AiEngineClientModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [ai_engine_client_service_1.AiEngineClient],
        exports: [ai_engine_client_service_1.AiEngineClient],
    })
], AiEngineClientModule);
//# sourceMappingURL=ai-engine-client.module.js.map