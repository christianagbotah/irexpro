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
var MarketDataService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketDataService = void 0;
const common_1 = require("@nestjs/common");
const broker_service_1 = require("../broker/broker.service");
const audit_service_1 = require("../audit/audit.service");
const audit_action_enum_1 = require("../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../audit/entities/audit-log.entity");
let MarketDataService = MarketDataService_1 = class MarketDataService {
    constructor(brokerService, auditService) {
        this.brokerService = brokerService;
        this.auditService = auditService;
        this.logger = new common_1.Logger(MarketDataService_1.name);
    }
    async getInternalOhlcv(query) {
        const { userId, brokerConnectionId, instrument, timeframe, limit } = query;
        try {
            const rawCandles = await this.brokerService.getOhlcvForConnection(userId, brokerConnectionId, instrument, timeframe, limit);
            const candles = rawCandles.map((c) => this.normalizeCandle(c, instrument.toUpperCase(), timeframe.toUpperCase()));
            await this.auditService.log({
                actorUserId: userId,
                action: audit_action_enum_1.AuditAction.MARKET_DATA_REQUESTED,
                resourceType: 'BrokerConnection',
                resourceId: brokerConnectionId,
                metadata: {
                    instrument: instrument.toUpperCase(),
                    timeframe: timeframe.toUpperCase(),
                    limit,
                    count: candles.length,
                },
            });
            return {
                instrument: instrument.toUpperCase(),
                timeframe: timeframe.toUpperCase(),
                source: 'broker',
                count: candles.length,
                candles,
            };
        }
        catch (err) {
            const message = err instanceof common_1.ForbiddenException
                ? err.message
                : 'Market data temporarily unavailable';
            await this.auditService.log({
                actorUserId: userId,
                action: audit_action_enum_1.AuditAction.MARKET_DATA_REQUEST_FAILED,
                resourceType: 'BrokerConnection',
                resourceId: brokerConnectionId,
                metadata: {
                    instrument: instrument.toUpperCase(),
                    timeframe: timeframe.toUpperCase(),
                    reason: message,
                },
                severity: audit_log_entity_1.AuditSeverity.WARNING,
            });
            this.logger.warn(`Internal OHLCV request failed user=${userId} connection=${brokerConnectionId} ` +
                `instrument=${instrument}: ${message}`);
            if (err instanceof common_1.ForbiddenException) {
                throw err;
            }
            throw new common_1.ServiceUnavailableException({
                code: 'MARKET_DATA_UNAVAILABLE',
                message: 'Unable to fetch market data from broker at this time',
            });
        }
    }
    normalizeCandle(candle, instrument, timeframe) {
        const ts = candle.timestamp instanceof Date
            ? candle.timestamp.toISOString()
            : String(candle.timestamp);
        return {
            timestamp: ts,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            instrument,
            timeframe,
            source: 'broker',
        };
    }
};
exports.MarketDataService = MarketDataService;
exports.MarketDataService = MarketDataService = MarketDataService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [broker_service_1.BrokerService,
        audit_service_1.AuditService])
], MarketDataService);
//# sourceMappingURL=market-data.service.js.map