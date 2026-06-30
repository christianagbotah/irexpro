"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalConfigModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const country_config_entity_1 = require("./entities/country-config.entity");
const global_config_controller_1 = require("./global-config.controller");
const global_config_service_1 = require("./global-config.service");
let GlobalConfigModule = class GlobalConfigModule {
};
exports.GlobalConfigModule = GlobalConfigModule;
exports.GlobalConfigModule = GlobalConfigModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([country_config_entity_1.CountryConfig])],
        controllers: [global_config_controller_1.GlobalConfigController],
        providers: [global_config_service_1.GlobalConfigService],
        exports: [global_config_service_1.GlobalConfigService],
    })
], GlobalConfigModule);
//# sourceMappingURL=global-config.module.js.map