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
exports.RiskController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const risk_service_1 = require("./risk.service");
const kill_switch_dto_1 = require("./dto/kill-switch.dto");
const update_risk_profile_dto_1 = require("./dto/update-risk-profile.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let RiskController = class RiskController {
    constructor(riskService) {
        this.riskService = riskService;
    }
    async toggleKillSwitch(dto, userId) {
        const profile = await this.riskService.toggleKillSwitch(userId, dto.active, dto.reason);
        return {
            killSwitchActive: profile.killSwitchActive,
            killSwitchReason: profile.killSwitchReason,
            message: dto.active
                ? 'Kill switch ACTIVATED — all AI trading is now suspended'
                : 'Kill switch DEACTIVATED — AI trading can resume',
        };
    }
    async getRiskProfile(userId) {
        return this.riskService.getOrCreateProfile(userId);
    }
    async updateRiskProfile(dto, userId) {
        return this.riskService.updateProfile(userId, dto);
    }
    async getViolations(userId, limit) {
        const take = limit ? Math.min(parseInt(limit, 10), 200) : 50;
        return this.riskService.getViolations(userId, take);
    }
    async getRiskStatus(userId) {
        const [profile, hasBroker, killSwitchActive] = await Promise.all([
            this.riskService.getOrCreateProfile(userId),
            this.riskService.hasBrokerConnection(userId),
            this.riskService.isKillSwitchActive(userId),
        ]);
        return {
            killSwitchActive,
            brokerConnected: hasBroker,
            canTrade: !killSwitchActive && hasBroker,
            limits: {
                maxDailyLossPercent: profile.maxDailyLossPercent,
                maxDrawdownPercent: profile.maxDrawdownPercent,
                maxOpenTrades: profile.maxOpenTrades,
                maxPositionSizeLot: profile.maxPositionSizeLot,
                allowedInstruments: profile.allowedInstruments ?? 'ALL',
                maxVolatilityScore: profile.maxVolatilityScore,
            },
        };
    }
};
exports.RiskController = RiskController;
__decorate([
    (0, common_1.Post)('kill-switch'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Activate or deactivate the personal kill switch',
        description: 'When activated, ALL AI trading signals for this user are immediately REJECTED. ' +
            'Use this to instantly halt all automated trading. ' +
            'Can be toggled back off to resume trading.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Kill switch state updated' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [kill_switch_dto_1.ToggleKillSwitchDto, String]),
    __metadata("design:returntype", Promise)
], RiskController.prototype, "toggleKillSwitch", null);
__decorate([
    (0, common_1.Get)('profile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get your current risk profile and limits' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Current risk profile' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RiskController.prototype, "getRiskProfile", null);
__decorate([
    (0, common_1.Patch)('profile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Update your risk limits',
        description: 'Update individual risk parameters. Changes take effect on the NEXT signal. ' +
            'Open trades are not retroactively affected.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Updated risk profile' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_risk_profile_dto_1.UpdateRiskProfileDto, String]),
    __metadata("design:returntype", Promise)
], RiskController.prototype, "updateRiskProfile", null);
__decorate([
    (0, common_1.Get)('violations'),
    (0, swagger_1.ApiOperation)({ summary: 'Get recent risk violations (rejected signals)' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: 'Max results (default 50)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'List of recent risk violations' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], RiskController.prototype, "getViolations", null);
__decorate([
    (0, common_1.Get)('status'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get risk engine status summary',
        description: 'Quick view of kill switch, broker connection, and key risk limits',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Risk status summary' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RiskController.prototype, "getRiskStatus", null);
exports.RiskController = RiskController = __decorate([
    (0, swagger_1.ApiTags)('Risk Management'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('risk'),
    __metadata("design:paramtypes", [risk_service_1.RiskService])
], RiskController);
//# sourceMappingURL=risk.controller.js.map