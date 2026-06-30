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
exports.GlobalConfigController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const global_config_service_1 = require("./global-config.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const public_decorator_1 = require("../../common/decorators/public.decorator");
let GlobalConfigController = class GlobalConfigController {
    constructor(globalConfigService) {
        this.globalConfigService = globalConfigService;
    }
    async listCountries() {
        return this.globalConfigService.findAllCountries();
    }
    async getCountry(countryCode) {
        return this.globalConfigService.findByCountryCode(countryCode);
    }
};
exports.GlobalConfigController = GlobalConfigController;
__decorate([
    (0, common_1.Get)('countries'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all supported countries and their configuration' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GlobalConfigController.prototype, "listCountries", null);
__decorate([
    (0, common_1.Get)('countries/:countryCode'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get configuration for a specific country' }),
    __param(0, (0, common_1.Param)('countryCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GlobalConfigController.prototype, "getCountry", null);
exports.GlobalConfigController = GlobalConfigController = __decorate([
    (0, swagger_1.ApiTags)('Global Config'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('global-config'),
    __metadata("design:paramtypes", [global_config_service_1.GlobalConfigService])
], GlobalConfigController);
//# sourceMappingURL=global-config.controller.js.map