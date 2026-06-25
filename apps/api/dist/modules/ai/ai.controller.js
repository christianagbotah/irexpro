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
var AiController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const config_1 = require("@nestjs/config");
const ai_signal_service_1 = require("./ai-signal.service");
const simulate_signal_dto_1 = require("./dto/simulate-signal.dto");
let AiController = AiController_1 = class AiController {
    constructor(aiSignalService, configService) {
        this.aiSignalService = aiSignalService;
        this.configService = configService;
        this.logger = new common_1.Logger(AiController_1.name);
    }
    async simulateSignal(req, dto) {
        const env = this.configService.get('app.env', 'development');
        if (env === 'production') {
            this.logger.warn(`DEV simulate-signal endpoint was called in PRODUCTION by user=${req.user.id} — BLOCKED`);
            throw new common_1.ForbiddenException('This endpoint is disabled in production');
        }
        this.logger.log(`[DEV] Simulated signal from user=${req.user.id} ` +
            `instrument=${dto.instrument} direction=${dto.direction} ` +
            `session=${dto.tradingSessionId}`);
        const candidate = this.aiSignalService.buildSimulatedCandidate(req.user.id, {
            tradingSessionId: dto.tradingSessionId,
            brokerConnectionId: dto.brokerConnectionId,
            instrument: dto.instrument,
            direction: dto.direction,
            confidenceScore: dto.confidenceScore,
            suggestedEntryPrice: dto.suggestedEntryPrice,
            suggestedStopLoss: dto.suggestedStopLoss,
            suggestedTakeProfit: dto.suggestedTakeProfit,
            suggestedVolume: dto.suggestedVolume,
            timeframe: dto.timeframe,
            strategyCode: dto.strategyCode,
            marketRegime: dto.marketRegime,
            volatilityScore: dto.volatilityScore,
            modelVersion: dto.modelVersion,
            metadata: { source: 'dev-simulate', env },
        });
        return this.aiSignalService.receiveSignal(candidate);
    }
};
exports.AiController = AiController;
__decorate([
    (0, common_1.Post)('dev/simulate-signal'),
    (0, swagger_1.ApiOperation)({
        summary: '[DEV ONLY] Simulate an AI signal for pipeline testing',
        description: 'DISABLED IN PRODUCTION. Submits a simulated signal through the full ' +
            'Strategy Orchestrator → Risk Engine → Execution Engine pipeline. ' +
            'Does not bypass any safety gates.',
    }),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, simulate_signal_dto_1.SimulateSignalDto]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "simulateSignal", null);
exports.AiController = AiController = AiController_1 = __decorate([
    (0, swagger_1.ApiTags)('AI (Dev)'),
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [ai_signal_service_1.AiSignalService,
        config_1.ConfigService])
], AiController);
//# sourceMappingURL=ai.controller.js.map