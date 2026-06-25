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
var TradingController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const trading_service_1 = require("./trading.service");
const start_session_dto_1 = require("./dto/start-session.dto");
let TradingController = TradingController_1 = class TradingController {
    constructor(tradingService) {
        this.tradingService = tradingService;
        this.logger = new common_1.Logger(TradingController_1.name);
    }
    async startSession(req, dto) {
        return this.tradingService.startTradingSession(req.user.id, dto.brokerConnectionId);
    }
    async stopSession(req, sessionId) {
        await this.tradingService.stopTradingSession(req.user.id, sessionId);
        return { message: 'Trading session stopped', sessionId };
    }
    async getActive(req) {
        return this.tradingService.getActiveSession(req.user.id);
    }
    async getById(req, sessionId) {
        const session = await this.tradingService.getSessionById(req.user.id, sessionId);
        if (!session) {
            throw new common_1.NotFoundException(`Trading session ${sessionId} not found`);
        }
        return session;
    }
};
exports.TradingController = TradingController;
__decorate([
    (0, common_1.Post)('start'),
    (0, swagger_1.ApiOperation)({
        summary: 'Start a new AI trading session',
        description: 'Requires active subscription, connected broker, and kill switch inactive. ' +
            'Returns the created TradingSession. Demo/paper mode is the default.',
    }),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, start_session_dto_1.StartSessionDto]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "startSession", null);
__decorate([
    (0, common_1.Post)(':id/stop'),
    (0, swagger_1.ApiOperation)({
        summary: 'Stop an active trading session',
        description: 'Stops the specified session. Does not automatically close open trades. ' +
            'Emits a realtime session-stopped event.',
    }),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "stopSession", null);
__decorate([
    (0, common_1.Get)('active'),
    (0, swagger_1.ApiOperation)({ summary: 'Get the current active trading session' }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "getActive", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a trading session by ID' }),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "getById", null);
exports.TradingController = TradingController = TradingController_1 = __decorate([
    (0, swagger_1.ApiTags)('Trading'),
    (0, common_1.Controller)('trading/sessions'),
    __metadata("design:paramtypes", [trading_service_1.TradingService])
], TradingController);
//# sourceMappingURL=trading.controller.js.map